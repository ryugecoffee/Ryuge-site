require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});


const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const cors = require("cors");
const nodemailer = require("nodemailer");
const admin = require("firebase-admin");
const inventory = require("./inventory");
const { itemsMetadata, managedItems, lotOf, lotItems } = require("./catalog");
const { quoteOrder, QuoteError, COUPONS, CONTACT_EMAIL, PROMO_MAX_BAGS } = require("./quote");
const { promoKeys } = require("./promo");
const orders = require("./orders");
const initialStock = require("./initial-stock");
const refunds = require("./refunds");
const factoryRefundApi = require("./factory-refund-api");
const coffeeSubscription = require("./coffee-subscription-records");
const coffeeSubscriptionCheckout = require("./coffee-subscription-checkout");
const coffeeSubscriptionAccount = require("./coffee-subscription-account");
const coffeeSubscriptionMail = require("./coffee-subscription-mail");
const coffeeSubscriptionFulfillment = require("./coffee-subscription-fulfillment");
const factoryNotify = require("./factory-notify");
const storeEvents = require("./store-events");
const { createRateLimiter, clientKey } = require("./rate-limit");

const app = express();
const INVENTORY_ENABLED = process.env.INVENTORY_ENABLED === "true";
const INVENTORY_STRIPE_WEBHOOK_SECRET = process.env.STRIPE_INVENTORY_WEBHOOK_SECRET;
const shopMail = (message) => transporter.sendMail({ from: `"Ryuge Coffee" <${process.env.EMAIL_USER}>`, ...message });

// Notices to Factory (server/store-events.js, server/factory-notify.js): off unless FACTORY_NOTIFY_URL and
// FACTORY_NOTIFY_HMAC_SECRET are set. Each is kept, then sent, after the shop's own work and never in its way: a notice
// that fails is logged and retried later; it never fails a payment, a webhook or a shipment.
const FACTORY_NOTIFY_ON = factoryNotify.config().enabled;
function factoryNotice(run) {
  if (!FACTORY_NOTIFY_ON) return;
  setImmediate(() => Promise.resolve().then(run).catch((error) => console.error("Factory notice failed:", String(error?.message || "").slice(0, 120))));
}

// Stripe requires the exact raw signed request body, before express.json().
// Active whenever its signing secret is set: paid orders are recorded (orders/{paymentIntentId}, server/orders.js);
// stock is settled only with inventory on. Every step is idempotent, so a Stripe resend never writes twice.
// Stripe events to subscribe: payment_intent.succeeded, payment_intent.canceled, charge.refunded
// (and, to settle refunds that Stripe finishes later, charge.refund.updated).
// 珈琲の定期便 (server/coffee-subscription-records.js), when it opens: checkout.session.completed,
// checkout.session.expired, invoice.paid, invoice.payment_failed, customer.subscription.updated,
// customer.subscription.deleted (docs/coffee-subscription.md). Only objects marked
// metadata.kind = "coffee-subscription-v2" are handled; other events of these types are left alone.
app.post("/stripe-inventory-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!INVENTORY_STRIPE_WEBHOOK_SECRET) {
    return INVENTORY_ENABLED ? res.status(503).json({ error: "WEBHOOK_NOT_CONFIGURED" }) : res.status(404).end();
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], INVENTORY_STRIPE_WEBHOOK_SECRET);
  } catch {
    return res.status(400).send("Invalid Stripe signature");
  }
  const object = event.data.object;
  const reservationId = object?.metadata?.inventoryReservationId;
  try {
    if (event.type === "payment_intent.succeeded") {
      // The paid order is kept first, whatever happens to the stock step.
      const recorded = await orders.recordPaidOrder(db, stripe, object);
      if (INVENTORY_ENABLED && reservationId) await inventory.finish(db, reservationId, object.id, "paid");
      // A resend is told once only (the notice id is the order's).
      if (recorded.recorded || recorded.reason === "DUPLICATE") factoryNotice(() => storeEvents.orderPaid(db, object.id));
    } else if (event.type === "payment_intent.canceled") {
      if (INVENTORY_ENABLED && reservationId) await inventory.finish(db, reservationId, object.id, "released");
    } else if (event.type === "charge.refunded" || event.type === "charge.refund.updated") {
      // server/refunds.js: our approved refunds are settled (stock back only as approved); refunds made elsewhere
      // (e.g. the Stripe dashboard) are recorded for review and never give stock back.
      const paymentIntentId = typeof object?.payment_intent === "string" ? object.payment_intent : object?.payment_intent?.id;
      await refunds.syncRefunds(db, stripe, paymentIntentId);
    } else if (coffeeSubscription.EVENT_TYPES.includes(event.type)) {
      const subscriptionConfig = coffeeSubscriptionCheckout.configFrom();
      await coffeeSubscription.handleEvent(db, event, subscriptionConfig);
      // The confirmation mail with the link to the customer's page, once the sign-up is complete (sent once).
      await coffeeSubscriptionMail.sendWelcomeIfReady({ db, event, siteUrl: subscriptionConfig.siteUrl,
        sendMail: shopMail });
      factoryNotice(() => storeEvents.subscriptionInvoice(db, event));
    }
    return res.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook failed:", event.type, error.message);
    factoryNotice(() => storeEvents.webhookFailed(db, event));
    // Non-2xx makes Stripe retry rather than silently losing the stock update or the order.
    return res.status(500).json({ error: "INVENTORY_WEBHOOK_FAILED" });
  }
});

// Factory (Jennifer) orders and refunds, HMAC-signed with CEO approval (server/factory-refund-api.js). Needs the raw
// body for the signature, so it is mounted before express.json(). Off (404) unless FACTORY_REFUND_API_ENABLED=true,
// FACTORY_REFUND_HMAC_SECRET and FACTORY_CEO_USER_ID are set on Render.
app.post(factoryRefundApi.PATH, express.raw({ type: "application/json", limit: "8kb" }),
  factoryRefundApi.createHandler({ getDb: () => db, getStripe: () => stripe, sendMail: shopMail,
    onMailFailed: (failure) => factoryNotice(() => storeEvents.mailFailed(db, failure)),
    onStockShort: async (notice) => { factoryNotice(() => storeEvents.stockShort(db, notice)); await sendFulfillmentNotice(notice); } }));

app.use(express.json());
app.use(cors());

// 珈琲の定期便 sign-up (server/coffee-subscription-checkout.js): 404 unless COFFEE_SUBSCRIPTION_ENABLED=true and the five
// STRIPE_PRICE_COFFEE_SUB_* price ids are set. Sign-ups also stay paused on the store (src/productData.js).
app.post(coffeeSubscriptionCheckout.PATH, coffeeSubscriptionCheckout.createHandler({ getDb: () => db, getStripe: () => stripe }));
// 珈琲の定期便 ②, the customer's page (server/coffee-subscription-account.js): 404 unless COFFEE_SUBSCRIPTION_MANAGE_ENABLED=true
// (separate from sign-ups). Mails go through the shop's existing mail account.
app.use(coffeeSubscriptionAccount.PATH, coffeeSubscriptionAccount.createRouter({ getDb: () => db, getStripe: () => stripe,
  sendMail: (message) => transporter.sendMail({ from: `"Ryuge Coffee" <${process.env.EMAIL_USER}>`, ...message }) }));
// 珈琲の定期便 ④, the shop's preparing and shipping (server/coffee-subscription-fulfillment.js): 404 unless
// COFFEE_SUBSCRIPTION_FULFILLMENT_ENABLED=true and SHOP_STAFF_EMAILS lists the staff, who sign in by a mailed link
// (server/shop-staff-auth.js). Stock shortages and inconsistencies are mailed to the shop (contract number and beans only).
// Cancellations asked by email are entered there too (server/coffee-subscription-email-cancel.js).
app.use(coffeeSubscriptionFulfillment.PATH, coffeeSubscriptionFulfillment.createRouter({ getDb: () => db, getStripe: () => stripe,
  notify: async (notice) => {
    factoryNotice(() => storeEvents.stockShort(db, notice));
    await sendFulfillmentNotice(notice);
  },
  onMailFailed: (failure) => factoryNotice(() => storeEvents.mailFailed(db, failure)),
  sendMail: shopMail }));

console.log("FIREBASE_PROJECT_ID exists:", !!process.env.FIREBASE_PROJECT_ID);
console.log("FIREBASE_CLIENT_EMAIL exists:", !!process.env.FIREBASE_CLIENT_EMAIL);
console.log("FIREBASE_PRIVATE_KEY exists:", !!process.env.FIREBASE_PRIVATE_KEY);
console.log("FIREBASE_PROJECT_ID value:", process.env.FIREBASE_PROJECT_ID);

if (!admin.apps.length) {
  admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY
      ? process.env.FIREBASE_PRIVATE_KEY
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "")
      : undefined,
  }),
});
}

const db = admin.firestore();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

transporter.verify((error, success) => {
  if (error) {
    console.error("mail transporter verify error:", error);
  } else {
    console.log("mail transporter ready:", success);
  }
});

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ===== 共通メール送信 =====
async function sendUnifiedReceiptEmail(type, data) {
  const {
    email,
    name,
    lang = "ja",
    items = [],
    total,
    shipping,
    address,
    planTitle,
    countryCode = "JP",
  } = data;

  const isInternational = countryCode && countryCode !== "JP";

  if (!email) return;

  const isSubscription = type === "subscription";

  const subjects = {
    ja: isSubscription
      ? "定期購入ありがとうございます | Ryuge Coffee"
      : "ご注文ありがとうございます | Ryuge Coffee",
    en: isSubscription
      ? "Thank you for your subscription | Ryuge Coffee"
      : "Thank you for your order | Ryuge Coffee",
    es: isSubscription
      ? "Gracias por tu suscripción | Ryuge Coffee"
      : "Gracias por tu pedido | Ryuge Coffee",
  };

  const headlines = {
    ja: isSubscription ? "定期購入を開始しました" : "ご注文を承りました",
    en: isSubscription ? "Your subscription has started" : "We've received your order",
    es: isSubscription ? "Tu suscripción ha comenzado" : "Hemos recibido tu pedido",
  };

  const bodyTexts = {
    ja: isSubscription
      ? "この度はご購読いただきありがとうございます。次回のお届けが準備でき次第、ご連絡いたします。"
      : "ご注文内容を確認いたしました。発送準備が整い次第、改めてご連絡いたします。",
    en: isSubscription
      ? "Thank you for subscribing. We'll be in touch when your first shipment is ready."
      : "Your order is confirmed. We'll notify you once it's on its way.",
    es: isSubscription
      ? "Gracias por suscribirte. Te avisaremos cuando tu primer envío esté listo."
      : "Tu pedido ha sido confirmado. Te notificaremos cuando esté en camino.",
  };

  const shippingLabels = { ja: "送料", en: "Shipping", es: "Envío" };
  const totalLabels = { ja: "合計", en: "Total", es: "Total" };
  const freeLabels = { ja: "無料", en: "Free", es: "Gratis" };
  const addressLabels = {
    ja: "お届け先",
    en: "Shipping Address",
    es: "Dirección",
  };
  const manageLabels = {
    ja: "定期購入の管理（解約・支払い変更）",
    en: "Manage your subscription (cancel / update payment)",
    es: "Gestionar suscripción (cancelar / actualizar pago)",
  };

  // 海外発送向け注記
  const customsDutyNotes = {
    ja: "輸入関税・税金が課される場合があり、受取人のご負担となります。",
    en: "Import duties and taxes may apply and are the responsibility of the recipient.",
    es: "Pueden aplicarse derechos de importación e impuestos, que son responsabilidad del destinatario.",
  };
  // International orders ship by Japan Post International Air Packet (tracked) since 2026-11-17 (server/quote.js).
  const emsNotes = {
    ja: "配送方法：日本郵便 国際エアパケット（追跡あり）。発送時に追跡番号をお知らせします。",
    en: "Shipping method: Japan Post International Air Packet (tracked). We will send you the tracking number when it ships.",
    es: "Método de envío: Japan Post International Air Packet (con seguimiento). Te enviaremos el número de seguimiento al enviarlo.",
  };
  const customsDutyNote = customsDutyNotes[lang] || customsDutyNotes.ja;
  const emsNote         = emsNotes[lang]         || emsNotes.ja;

  const subject = subjects[lang] || subjects.ja;
  const headline = headlines[lang] || headlines.ja;
  const bodyText = bodyTexts[lang] || bodyTexts.ja;
  const shippingLabel = shippingLabels[lang] || shippingLabels.ja;
  const totalLabel = totalLabels[lang] || totalLabels.ja;
  const freeLabel = freeLabels[lang] || freeLabels.ja;
  const addressLabel = addressLabels[lang] || addressLabels.ja;
  const manageLabel = manageLabels[lang] || manageLabels.ja;

  let itemRows = "";
  if (isSubscription && planTitle) {
    itemRows = `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #2a2a2a;font-size:14px;color:#ccc;">${planTitle}</td>
        <td style="padding:10px 0;border-bottom:1px solid #2a2a2a;font-size:14px;color:#888;text-align:center;">× 1</td>
        <td style="padding:10px 0;border-bottom:1px solid #2a2a2a;font-size:14px;color:#ccc;text-align:right;">—</td>
      </tr>`;
  } else {
    itemRows = items
      .map(
        (item) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #2a2a2a;font-size:14px;color:#ccc;">${item.title || item.name || ""}</td>
        <td style="padding:10px 0;border-bottom:1px solid #2a2a2a;font-size:14px;color:#888;text-align:center;">× ${item.quantity || 1}</td>
        <td style="padding:10px 0;border-bottom:1px solid #2a2a2a;font-size:14px;color:#ccc;text-align:right;">¥${((item.price || 0) * (item.quantity || 1)).toLocaleString()}</td>
      </tr>`
      )
      .join("");
  }

  const shippingDisplay =
    shipping === 0 || isSubscription
      ? freeLabel
      : `¥${Number(shipping || 0).toLocaleString()}`;

  const totalDisplay = isSubscription
    ? "—"
    : `¥${Number(total || 0).toLocaleString()}`;

  const greeting = name
    ? lang === "ja"
      ? `${name} 様`
      : lang === "es"
      ? `Hola ${name},`
      : `Hi ${name},`
    : "";

  const html = `
<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:48px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#111;border-radius:16px;overflow:hidden;max-width:560px;width:100%;">

        <tr>
          <td style="padding:40px 48px 32px;border-bottom:1px solid #1e1e1e;">
            <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#444;">Ryuge Coffee</p>
            <h1 style="margin:0;font-size:22px;font-weight:400;color:#e8e8e8;line-height:1.3;">${headline}</h1>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 48px 0;">
            ${greeting ? `<p style="margin:0 0 16px;font-size:14px;color:#888;">${greeting}</p>` : ""}
            <p style="margin:0;font-size:14px;line-height:1.8;color:#888;">${bodyText}</p>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 48px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${itemRows}
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #2a2a2a;font-size:14px;color:#ccc;" colspan="2">${shippingLabel}</td>
                <td style="padding:10px 0;border-bottom:1px solid #2a2a2a;font-size:14px;color:#ccc;text-align:right;">${shippingDisplay}</td>
              </tr>
              <tr>
                <td style="padding:16px 0 0;font-size:17px;font-weight:500;color:#e8e8e8;" colspan="2">${totalLabel}</td>
                <td style="padding:16px 0 0;font-size:17px;font-weight:500;color:#e8e8e8;text-align:right;">${totalDisplay}</td>
              </tr>
            </table>
          </td>
        </tr>

        ${address ? `
        <tr>
          <td style="padding:28px 48px 0;">
            <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#444;">${addressLabel}</p>
            <p style="margin:0;font-size:13px;color:#888;line-height:1.7;">${address.replace(/\n/g, "<br>")}</p>
          </td>
        </tr>` : ""}

        ${isInternational ? `
        <tr>
          <td style="padding:20px 48px 0;">
            <p style="margin:0 0 6px;font-size:12px;color:#888;line-height:1.7;">${emsNote}</p>
            <p style="margin:0;font-size:12px;color:#666;line-height:1.7;">⚠ ${customsDutyNote}</p>
          </td>
        </tr>` : ""}

        ${isSubscription ? `
        <tr>
          <td style="padding:28px 48px 0;">
            <a href="https://billing.stripe.com/p/login/3cI28r8GV4GcaFV1L85AQ01"
               style="font-size:13px;color:#888;border-bottom:1px solid #333;padding-bottom:2px;text-decoration:none;">
              ${manageLabel} →
            </a>
          </td>
        </tr>` : ""}

        <tr>
          <td style="padding:40px 48px;border-top:1px solid #1e1e1e;margin-top:32px;">
            <p style="margin:0;font-size:12px;color:#444;line-height:1.7;">
              Ryuge Coffee<br>
              <a href="https://ryuge.biz" style="color:#555;text-decoration:none;">ryuge.biz</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await transporter.sendMail({
    from: `"Ryuge Coffee" <${process.env.EMAIL_USER}>`,
    to: email,
    subject,
    html,
  });
}

// ===== 管理者通知メール =====
async function sendAdminNotificationEmail(type, data) {
  const { name, email, address, items = [], total, shipping, planTitle } = data;
  const adminAddresses = "ryugecoffee@gmail.com, ryuka2452533@icloud.com";

  const isSubscription = type === "subscription";
  const subject = isSubscription
    ? `【新規サブスク】${name} 様が定期購入を開始しました`
    : `【新規注文】${name} 様より ¥${Number(total || 0).toLocaleString()}`;

  const itemLines = isSubscription
    ? planTitle || "サブスクプラン"
    : (Array.isArray(items) ? items : [])
        .map(
          (item) =>
            `${item.title || item.name || ""} × ${item.quantity}　¥${((item.price || 0) * (item.quantity || 0)).toLocaleString()}`
        )
        .join("\n");

  const shippingLine = isSubscription
    ? "送料：無料"
    : `送料：${shipping === 0 ? "無料" : `¥${Number(shipping || 0).toLocaleString()}`}`;

  const totalLine = isSubscription ? "" : `合計：¥${Number(total || 0).toLocaleString()}`;

  await transporter.sendMail({
    from: `"Ryuge Coffee" <${process.env.EMAIL_USER}>`,
    to: adminAddresses,
    subject,
    text: `新規${isSubscription ? "サブスク" : "注文"}が入りました。

お名前：${name}
メール：${email}
住所：${address || ""}

【${isSubscription ? "プラン" : "注文内容"}】
${itemLines}

${shippingLine}
${totalLine}
`.trim(),
  });
}

// 定期便の発送で在庫が足りない・在庫と発送記録が合わないときの店舗への通知（契約番号と豆だけ。個人情報は入れない）
async function sendFulfillmentNotice({ type, ref, shipmentId, shortSkus = [] }) {
  const adminAddresses = "ryugecoffee@gmail.com, ryuka2452533@icloud.com";
  const inconsistent = type === "inventory_inconsistency";
  await transporter.sendMail({
    from: `"Ryuge Coffee" <${process.env.EMAIL_USER}>`,
    to: adminAddresses,
    subject: inconsistent ? `【定期便・要確認】在庫と発送記録が一致しません（${ref}）` : `【定期便・在庫不足】発送を保留しました（${ref}）`,
    text: `${inconsistent
      ? "発送済みにする前に、在庫と発送記録が一致しないことを検知しました。在庫は変更していません。確認してください。"
      : "選んだ豆の在庫が足りないため、この発送を「保留」にしました。在庫・決済・発送は進めていません。"}

契約番号：${ref}
発送：${shipmentId}
${shortSkus.length ? `在庫が足りない豆：${shortSkus.join("、")}\n` : ""}
${inconsistent ? "在庫の記録を確認してから、発送を再開してください。" : "別の豆を選ぶか、在庫を登録してから、もう一度「発送準備」を行ってください。"}`.trim(),
  });
}

// ===== エンドポイント =====

app.get("/", (req, res) => {
  res.send("Ryuge server is running");
});

// Reservations of abandoned checkouts are settled from Stripe's state (inventory.reconcileExpired: paid -> sold,
// canceled -> released, still unpaid after 20 minutes -> canceled at Stripe first, then released). No external
// scheduler is needed: it runs in the background when stock is looked at or reserved (at most once a minute) and
// every 5 minutes while the server is awake. It never delays the customer's request.
const RECONCILE_MIN_INTERVAL_MS = 60 * 1000;
let lastReconcile = 0;
let reconciling = false;
function reconcileSoon() {
  if (!INVENTORY_ENABLED || reconciling || Date.now() - lastReconcile < RECONCILE_MIN_INTERVAL_MS) return;
  reconciling = true;
  lastReconcile = Date.now();
  inventory.reconcileExpired(db, stripe, 30)
    .then((results) => { if (results.length) console.log("Inventory reconciliation:", JSON.stringify(results)); })
    .catch((error) => console.error("Inventory reconciliation failed:", error.message))
    .finally(() => { reconciling = false; });
}
if (INVENTORY_ENABLED) setInterval(reconcileSoon, 5 * 60 * 1000).unref?.();
// Factory notices: shipping deadlines (due today/tomorrow, or past) and the retry of unsent notices, every 30 minutes.
if (FACTORY_NOTIFY_ON) setInterval(() => factoryNotice(() => storeEvents.sweep(db)), 30 * 60 * 1000).unref?.();

app.post("/inventory/reconcile", async (req, res) => {
  if (!INVENTORY_ENABLED) return res.status(404).end();
  const token = process.env.INVENTORY_RECONCILE_TOKEN;
  const supplied = req.headers["x-inventory-reconcile-token"];
  if (!token || typeof supplied !== "string" ||
      !require("node:crypto").timingSafeEqual(
        Buffer.from(require("node:crypto").createHash("sha256").update(token).digest()),
        Buffer.from(require("node:crypto").createHash("sha256").update(supplied).digest())
      )) return res.status(403).json({ error: "FORBIDDEN" });
  try {
    const results = await inventory.reconcileExpired(db, stripe, 30);
    return res.json({ reviewed: results.length, results });
  } catch (error) {
    console.error("Inventory reconciliation failed:", error.message);
    return res.status(500).json({ error: "RECONCILIATION_FAILED" });
  }
});

// One-time initial stock registration (server/initial-stock.js): preview, then apply after the CEO approved that
// preview. Off (404) unless INVENTORY_ADMIN_TOKEN is set on Render; the caller sends it in X-Inventory-Admin-Token.
// Works with inventory off, creates missing stock records only, never overwrites one.
const initialStockLimit = createRateLimiter({ limit: 10, windowMs: 60 * 1000 });
app.post("/internal/inventory/initial-stock", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const token = process.env.INVENTORY_ADMIN_TOKEN;
  if (!token || token.length < 32) return res.status(404).end();
  if (!initialStockLimit(clientKey(req).key)) return res.status(429).json({ error: "RATE_LIMITED" });
  const supplied = req.headers["x-inventory-admin-token"];
  const digest = (value) => require("node:crypto").createHash("sha256").update(String(value)).digest();
  if (typeof supplied !== "string" || !require("node:crypto").timingSafeEqual(digest(token), digest(supplied))) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }
  const projectId = process.env.FIREBASE_PROJECT_ID || "";
  const { mode, plan, planHash, approval, expectedProjectId } = req.body || {};
  try {
    if (mode === "preview") return res.json(await initialStock.previewInitialStock(db, plan, { projectId }));
    if (mode === "apply") {
      const result = await initialStock.applyInitialStock(db, plan, { projectId, expectedProjectId, planHash, approval });
      console.log("Initial stock:", JSON.stringify({ applied: result.applied, created: result.created }));
      return res.json({ projectId, ...result });
    }
    return res.status(400).json({ error: "INVALID_MODE" });
  } catch (error) {
    const known = ["INVALID_PLAN", "UNKNOWN_STOCK_RECORD", "INVALID_QUANTITY", "PROJECT_MISMATCH", "PLAN_HASH_REQUIRED",
      "APPROVAL_REQUIRED", "PLAN_CHANGED", "ALREADY_EXISTS"];
    if (known.includes(error.message)) {
      return res.status(["PLAN_CHANGED", "ALREADY_EXISTS"].includes(error.message) ? 409 : 400).json({ error: error.message });
    }
    console.error("Initial stock failed:", error.message);
    return res.status(500).json({ error: "INITIAL_STOCK_FAILED" });
  }
});

// Refunds and partial cancellations (server/refunds.js, docs/refunds.md): preview -> CEO approval -> apply / resume.
// Off (404) unless ORDER_ADMIN_TOKEN is set on Render; the caller sends it in X-Order-Admin-Token. Later the
// Factory/Jennifer signed CEO approval calls the same functions.
const refundLimit = createRateLimiter({ limit: 10, windowMs: 60 * 1000 });
app.post("/internal/orders/refund", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const token = process.env.ORDER_ADMIN_TOKEN;
  if (!token || token.length < 32) return res.status(404).end();
  if (!refundLimit(clientKey(req).key)) return res.status(429).json({ error: "RATE_LIMITED" });
  const supplied = req.headers["x-order-admin-token"];
  const digest = (value) => require("node:crypto").createHash("sha256").update(String(value)).digest();
  if (typeof supplied !== "string" || !require("node:crypto").timingSafeEqual(digest(token), digest(supplied))) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }
  const { mode, orderId, lines, refundShipping, acknowledgeExternalRefunds, planHash, approval, refundId } = req.body || {};
  const request = { orderId, lines, refundShipping, acknowledgeExternalRefunds };
  try {
    if (mode === "preview") return res.json(await refunds.previewRefund(db, stripe, request));
    if (mode === "apply") {
      const result = await refunds.applyRefund(db, stripe, request, { planHash, approval, actor: "ceo:order-admin-token", ...(refundId ? { refundId } : {}) });
      console.log("Order refund:", JSON.stringify({ refundId: result.refundId, status: result.status }));
      return res.json(result);
    }
    if (mode === "resume") return res.json(await refunds.resumeRefund(db, stripe, refundId));
    return res.status(400).json({ error: "INVALID_MODE" });
  } catch (error) {
    if (error instanceof refunds.RefundError) {
      const conflict = ["PLAN_CHANGED", "EXCEEDS_REMAINING_QUANTITY", "SHIPPING_ALREADY_REFUNDED", "ALREADY_FULLY_REFUNDED",
        "EXTERNAL_REFUNDS_PRESENT", "EXCEEDS_STRIPE_REFUNDABLE", "EXCEEDS_ORDER_TOTAL", "REFUND_ID_CONFLICT"].includes(error.code);
      return res.status(conflict ? 409 : 400).json({ error: error.code, detail: error.detail ?? null });
    }
    console.error("Order refund failed:", error.message);
    return res.status(500).json({ error: "REFUND_FAILED" });
  }
});

app.get("/inventory/availability", async (req, res) => {
  if (!INVENTORY_ENABLED) return res.json({ enabled: false });
  reconcileSoon();
  try {
    const ids = String(req.query.ids || "").split(",").filter(Boolean);
    const quantities = await inventory.availability(db, ids, (id) => lotOf(id));
    return res.json({ enabled: true, quantities });
  } catch {
    return res.status(500).json({ error: "INVENTORY_UNAVAILABLE" });
  }
});

// The amount is decided only by quoteOrder (server/quote.js): products and prices from the server catalogue, shipping
// from the destination (domestic prefecture, or an enabled country and the packed weight), limits and coupon.
// The browser sends product ids, quantities, destination and coupon code; everything else is ignored.
function quoteRequest(body) {
  return quoteOrder(body?.items, {
    countryCode: body?.countryCode || "JP",
    prefecture: body?.prefecture || "",
    couponCode: body?.couponCode || "",
  });
}

function quoteErrorResponse(res, error) {
  if (!(error instanceof QuoteError)) return false;
  res.status(error.status).json({ error: error.code, contact: error.contact, contactEmail: CONTACT_EMAIL });
  return true;
}

function publicQuote(quote) {
  // Domestic: the method shown with the fee (letterpack_light / yupack / regional); never anything personal.
  const detail = quote.shippingDetail.domestic
    ? { domestic: true, method: quote.shippingDetail.method }
    : { service: quote.shippingDetail.service, actual: quote.shippingDetail.actual, subsidy: quote.shippingDetail.subsidy };
  return {
    items: quote.items.map(({ id, quantity, price }) => ({ id, quantity, price })),
    subtotal: quote.subtotal, shipping: quote.shipping, total: quote.total, shippingDetail: detail,
  };
}

// Price shown before payment (the same calculation as the payment itself).
app.post("/quote", (req, res) => {
  try {
    return res.json(publicQuote(quoteRequest(req.body)));
  } catch (error) {
    if (quoteErrorResponse(res, error)) return;
    console.error("quote error:", error.message);
    return res.status(500).json({ error: "QUOTE_FAILED" });
  }
});

app.post("/create-payment-intent", async (req, res) => {
  try {
    const { email, name, address, postalCode } = req.body || {};
    let quote;
    try {
      quote = quoteRequest(req.body);
    } catch (error) {
      if (quoteErrorResponse(res, error)) return;
      throw error;
    }
    if (INVENTORY_ENABLED && !INVENTORY_STRIPE_WEBHOOK_SECRET) {
      return res.status(503).json({ error: "WEBHOOK_NOT_CONFIGURED" });
    }

    // Products with a sales cap (new beans, promotional beans) are sold only with inventory on.
    if (!INVENTORY_ENABLED && quote.items.some((item) => item.requiresInventory)) {
      return res.status(400).json({ error: "PRODUCT_NOT_AVAILABLE" });
    }
    // Promotional beans: at most PROMO_MAX_BAGS per customer across orders (server/promo.js), checked and held with the stock.
    const promoQuantity = quote.items.filter((item) => item.promo).reduce((sum, item) => sum + item.quantity, 0);
    let promo = null;
    if (promoQuantity) {
      const keys = promoKeys({ email, countryCode: quote.countryCode, postalCode, address });
      if (!keys.length) return res.status(400).json({ error: "EMAIL_REQUIRED" });
      promo = { keys, quantity: promoQuantity, limit: PROMO_MAX_BAGS };
    }

    let reservationId = null;
    const stockItems = managedItems(quote.items);
    if (INVENTORY_ENABLED && stockItems.length) {
      reconcileSoon();
      try {
        reservationId = await inventory.reserve(db, stockItems, null, promo, lotItems(quote.items));
      } catch (error) {
        const conflict = ["OUT_OF_STOCK", "PROMO_CUSTOMER_LIMIT"].includes(error.message);
        return res.status(conflict ? 409 : 400).json({ error: error.message });
      }
    }
    const detail = quote.shippingDetail;
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: quote.total,
        currency: "jpy",
        metadata: {
          email: String(email || "").slice(0, 200),
          name: String(name || "").slice(0, 200),
          address: String(address || "").slice(0, 400),
          prefecture: quote.prefecture,
          countryCode: quote.countryCode,
          couponCode: quote.coupon,
          items: itemsMetadata(quote.items),
          subtotal: String(quote.subtotal),
          shipping: String(quote.shipping),
          ...(detail.domestic ? { shippingMethod: detail.method } : {
            shippingService: detail.service, shippingActual: String(detail.actual),
            shippingSubsidy: String(detail.subsidy), packedWeightG: String(detail.weightG), shippingRates: detail.ratesVersion,
          }),
          ...(reservationId ? { inventoryReservationId: reservationId } : {}),
        },
      });
      if (reservationId) await inventory.attachPaymentIntent(db, reservationId, paymentIntent.id);
      res.json({ clientSecret: paymentIntent.client_secret, ...publicQuote(quote) });
    } catch (error) {
      if (reservationId) {
        // No PaymentIntent reached the customer, so nobody can pay this hold: give the stock (and promo bags) back now.
        await inventory.releaseWithoutPayment(db, reservationId)
          .catch((releaseError) => console.error("Inventory reservation needs reconciliation:", reservationId, releaseError.message));
      }
      throw error;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "CHECKOUT_FAILED" });
  }
});

// Older storefront builds ask only for the shipping fee; answered from the same quote.
app.post("/calc-shipping", (req, res) => {
  try {
    return res.json({ shipping: quoteRequest(req.body).shipping });
  } catch (error) {
    if (error instanceof QuoteError) return res.json({ error: error.code, contact: error.contact });
    return res.status(500).json({ error: "QUOTE_FAILED" });
  }
});

// ===== 簡易レート制限（/order-complete 専用・インメモリ）=====
// 同一IPからの短時間の連続リクエストを制限し、メール送信の踏み台化を防ぐ。
// 外部依存なし。Render などのプロキシ経由を考慮し X-Forwarded-For を優先。
const ORDER_RATE_WINDOW_MS = 60 * 1000; // 1分
const ORDER_RATE_MAX = 5;               // 1IPあたり1分間に5回まで
const orderRateHits = new Map();        // ip -> number[]（リクエスト時刻）

function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();
  return req.socket?.remoteAddress || req.ip || "unknown";
}

function orderRateLimit(req, res, next) {
  const now = Date.now();
  const ip = getClientIp(req);
  const recent = (orderRateHits.get(ip) || []).filter(
    (t) => now - t < ORDER_RATE_WINDOW_MS
  );
  if (recent.length >= ORDER_RATE_MAX) {
    return res
      .status(429)
      .json({ error: "Too many requests. Please try again later." });
  }
  recent.push(now);
  orderRateHits.set(ip, recent);
  return next();
}

// 古いエントリの定期掃除（メモリ肥大防止）。プロセスは生かし続けない。
const orderRateSweep = setInterval(() => {
  const now = Date.now();
  for (const [ip, hits] of orderRateHits) {
    const fresh = hits.filter((t) => now - t < ORDER_RATE_WINDOW_MS);
    if (fresh.length === 0) orderRateHits.delete(ip);
    else orderRateHits.set(ip, fresh);
  }
}, ORDER_RATE_WINDOW_MS);
orderRateSweep.unref?.();

// ===== 通常購入完了 =====
app.post("/order-complete", orderRateLimit, async (req, res) => {
  try {
    const {
      items, name, email, postalCode, address, prefecture,
      countryCode = "JP", countryName,
      city, stateProvince, phone,
      couponCode,
      total, shipping, lang,
    } = req.body;

    // 国内・海外でアドレスフォーマットを分ける
    const fullAddress = countryCode && countryCode !== "JP"
      ? [address, city, stateProvince, postalCode, countryName || countryCode].filter(Boolean).join(", ")
      : [postalCode, prefecture, address].filter(Boolean).join(" ");

    try {
      await sendUnifiedReceiptEmail("order", {
        email,
        name,
        lang:        lang || "ja",
        items:       Array.isArray(items) ? items : [],
        total,
        shipping,
        address:     fullAddress,
        countryCode: countryCode || "JP",
      });
    } catch (mailErr) {
      console.error("order-complete customer mail error:", mailErr);
    }

    try {
      await sendAdminNotificationEmail("order", {
        name,
        email,
        address: fullAddress,
        items: Array.isArray(items) ? items : [],
        total,
        shipping,
      });
    } catch (mailErr) {
      console.error("order-complete admin mail error:", mailErr);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("order-complete error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ===== サブスク完了 =====
app.post("/subscription-complete", async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items"],
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const meta = session.metadata || {};
    const email = session.customer_email || meta.customerEmail || "";
    const name = meta.customerName || "";
    const lang = meta.lang || "ja";
    const planTitle = meta.planTitle || meta.planId || "";
    const address = [meta.postalCode, meta.prefecture, meta.address].filter(Boolean).join(" ");

    const order = {
      email,
      name,
      lang,
      planTitle,
      address,
      postalCode: meta.postalCode || "",
      prefecture: meta.prefecture || "",
      shipping: 0,
      total: null,
      isSubscription: true,
    };

    try {
      await sendUnifiedReceiptEmail("subscription", {
        email, name, lang,
        items: [], total: null, shipping: 0,
        address, planTitle,
      });
    } catch (mailErr) {
      console.error("subscription-complete customer mail error:", mailErr);
    }

    try {
      await sendAdminNotificationEmail("subscription", {
        name, email, address, planTitle,
      });
    } catch (mailErr) {
      console.error("subscription-complete admin mail error:", mailErr);
    }

    return res.status(200).json({ ok: true, order });
  } catch (err) {
    console.error("subscription-complete error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ===== クーポン検証 =====
app.post("/validate-coupon", (req, res) => {
  const { couponCode } = req.body;

  if (!couponCode) {
    return res.status(400).json({ valid: false });
  }

  const coupon = COUPONS[String(couponCode).trim().toUpperCase()];

  if (!coupon) {
    return res.status(200).json({ valid: false });
  }

  return res.status(200).json({
    valid: true,
    discount: coupon,
  });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});