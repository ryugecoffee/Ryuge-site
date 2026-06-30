require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const { calcShipping } = require("./shipping");

const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const cors = require("cors");
const nodemailer = require("nodemailer");
const admin = require("firebase-admin");

const app = express();

app.use(express.json());
app.use(cors());

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

// ===== クーポン定義 =====
const COUPONS = {
  WELCOME10: { type: "percent", value: 10, label: "10% OFF" },
  FREESHIP: { type: "shipping", value: 100, label: "送料補助" },
};

// calcShipping は server/shipping.js からインポート済み

// ===== クーポン適用 =====
function applyCoupon(subtotal, shipping, couponCode) {
  if (!couponCode) return { subtotal, shipping };

  const coupon = COUPONS[couponCode.trim().toUpperCase()];
  if (!coupon) return { subtotal, shipping };

  if (coupon.type === "percent") {
    const discount = Math.round(subtotal * (coupon.value / 100));
    return { subtotal: subtotal - discount, shipping };
  }

  if (coupon.type === "shipping") {
    const discountedShipping = Math.max(
      0,
      shipping - Math.round(shipping * (coupon.value / 100))
    );
    return { subtotal, shipping: discountedShipping };
  }

  return { subtotal, shipping };
}

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
  const emsNotes = {
    ja: "配送方法：日本郵便 EMS（国際スピード郵便）。発送後、通常5〜10日程度でお届けします（地域・通関状況により異なります）。",
    en: "Shipping method: Japan Post EMS. Usually delivered within 5–10 days after shipment (varies by region and customs clearance).",
    es: "Método de envío: Japan Post EMS. Generalmente entregado en 5–10 días tras el envío (varía según región y aduanas).",
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

// ===== エンドポイント =====

app.get("/", (req, res) => {
  res.send("Ryuge server is running");
});

app.post("/create-payment-intent", async (req, res) => {
  try {
    const {
      items, couponCode, email, name, address, prefecture,
      countryCode = "JP",
    } = req.body;

    // ── 米国フラグチェック ──────────────────────────────
    if (countryCode === "US" && process.env.ENABLE_US_SHIPPING !== "true") {
      return res.status(400).json({ error: "US_SHIPPING_DISABLED" });
    }

    const safeItems = Array.isArray(items) ? items : [];

    let subtotal = safeItems.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
      0
    );

    // ── 送料はサーバーで完全再計算（クライアント値を信用しない）──
    const shippingResult = calcShipping(safeItems, countryCode);
    if (typeof shippingResult === "object" && shippingResult.error) {
      return res.status(400).json({ error: shippingResult.error });
    }
    let shipping = shippingResult;

    const afterCoupon = applyCoupon(subtotal, shipping, couponCode);
    subtotal = afterCoupon.subtotal;
    shipping = afterCoupon.shipping;

    const total = subtotal + shipping;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: total,
      currency: "jpy",
      metadata: {
        email:       email       || "",
        name:        name        || "",
        address:     address     || "",
        prefecture:  prefecture  || "",
        countryCode: countryCode,
        couponCode:  couponCode  || "",
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      shipping,
      total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ===== 送料プレビュー（UI リアルタイム表示用）=====
app.post("/calc-shipping", (req, res) => {
  try {
    const { items, countryCode = "JP" } = req.body;

    if (countryCode === "US" && process.env.ENABLE_US_SHIPPING !== "true") {
      return res.json({ error: "US_SHIPPING_DISABLED" });
    }

    const result = calcShipping(items || [], countryCode);
    if (typeof result === "object" && result.error) {
      return res.json({ error: result.error });
    }
    return res.json({ shipping: result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
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

  const coupon = COUPONS[couponCode.trim().toUpperCase()];

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