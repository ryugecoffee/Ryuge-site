require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();

app.use(express.json());
app.use(cors());

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const YUPACK_SHIPPING = {
  北海道: 1410,
  青森県: 880,
  岩手県: 880,
  宮城県: 880,
  秋田県: 880,
  山形県: 880,
  福島県: 880,
  茨城県: 880,
  栃木県: 880,
  群馬県: 880,
  埼玉県: 880,
  千葉県: 880,
  東京都: 880,
  神奈川県: 880,
  新潟県: 880,
  富山県: 880,
  石川県: 880,
  福井県: 880,
  山梨県: 880,
  長野県: 880,
  岐阜県: 880,
  静岡県: 880,
  愛知県: 880,
  三重県: 880,
  滋賀県: 990,
  京都府: 990,
  大阪府: 990,
  兵庫県: 990,
  奈良県: 990,
  和歌山県: 990,
  鳥取県: 1150,
  島根県: 1150,
  岡山県: 1150,
  広島県: 1150,
  山口県: 1150,
  徳島県: 1150,
  香川県: 1150,
  愛媛県: 1150,
  高知県: 1150,
  福岡県: 1410,
  佐賀県: 1410,
  長崎県: 1410,
  熊本県: 1410,
  大分県: 1410,
  宮崎県: 1410,
  鹿児島県: 1410,
  沖縄県: 1450,
};

const INTERNATIONAL_SHIPPING = {
  zone1: 3400,
  zone2: 4550,
  zone3: 6700,
  zone4: 7900,
  zone5: 8100,
};

// ===== クーポン定義 =====
const COUPONS = {
  WELCOME10: { type: "percent", value: 10, label: "10% OFF" },
  FREESHIP: { type: "shipping", value: 100, label: "送料補助" },
};

// ===== 商品判定 =====
function isBeanItem(item) {
  if (isBagItem(item)) return false;
  const source = `${item?.id || ""} ${item?.title || ""} ${item?.category || ""}`.toLowerCase();
  return (
    source.includes("enma") ||
    source.includes("woodbox") ||
    source.includes("wood-box") ||
    source.includes("wood_box") ||
    source.includes("閻魔") ||
    source.includes("木函")
  );
}

function isBagItem(item) {
  const source = `${item?.id || ""} ${item?.title || ""} ${item?.category || ""}`.toLowerCase();
  return (
    source.includes("coffee-bag") ||
    source.includes("coffee_bag") ||
    source.includes("coffeebag") ||
    source.includes("coffee bag") ||
    source.includes("コーヒーバッグ") ||
    source.includes("お茶バッグ") ||
    source.includes("tea-bag") ||
    source.includes("tea_bag") ||
    source.includes("bag") ||
    item?.category === "bag" ||
    item?.category === "tea-bag"
  );
}

function countBeans(items = []) {
  return items
    .filter((item) => isBeanItem(item))
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function countBags(items = []) {
  return items
    .filter((item) => isBagItem(item))
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

// ===== 海外送料割引 =====
function applyInternationalShippingDiscount(baseShipping, beans, bags, zoneKey) {
  if (beans >= 10 && bags >= 20) {
    if (zoneKey === "zone4" || zoneKey === "zone5") {
      return Math.round(baseShipping * 0.3);
    }
    return 0;
  }
  if (beans >= 7 && bags >= 10) {
    return Math.round(baseShipping * 0.5);
  }
  return baseShipping;
}

// ===== 送料計算 =====
function calcShipping(items, prefecture, countryType, zoneKey) {
  const safeItems = Array.isArray(items) ? items : [];

  const subtotal = safeItems.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );

  const hasSubscription = safeItems.some(
    (item) => item.category === "subscription"
  );
  if (hasSubscription) return 0;

  if (countryType === "international") {
    const baseShipping = INTERNATIONAL_SHIPPING[zoneKey || prefecture] ?? 8100;
    const beans = countBeans(safeItems);
    const bags = countBags(safeItems);
    return applyInternationalShippingDiscount(baseShipping, beans, bags, zoneKey || prefecture);
  }

  if (subtotal >= 5000) return 0;

  const hasOnlyBagItems =
    safeItems.length > 0 && safeItems.every((item) => isBagItem(item));

  const totalBagQuantity = safeItems
    .filter((item) => isBagItem(item))
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  if (hasOnlyBagItems && totalBagQuantity <= 10) {
    return 185;
  }

  return YUPACK_SHIPPING[prefecture] ?? 880;
}

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
    const discountedShipping = Math.max(0, shipping - Math.round(shipping * (coupon.value / 100)));
    return { subtotal, shipping: discountedShipping };
  }

  return { subtotal, shipping };
}

// ===== 共通メール送信 =====
async function sendUnifiedReceiptEmail(type, data) {
  const { email, name, lang = "ja", items = [], total, shipping, address, planTitle } = data;

  if (!email) return;

  const isSubscription = type === "subscription";

  const subjects = {
    ja: isSubscription ? "定期購入ありがとうございます | Ryuge Coffee" : "ご注文ありがとうございます | Ryuge Coffee",
    en: isSubscription ? "Thank you for your subscription | Ryuge Coffee" : "Thank you for your order | Ryuge Coffee",
    es: isSubscription ? "Gracias por tu suscripción | Ryuge Coffee" : "Gracias por tu pedido | Ryuge Coffee",
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
  const totalLabels    = { ja: "合計", en: "Total",    es: "Total" };
  const freeLabels     = { ja: "無料", en: "Free",     es: "Gratis" };
  const addressLabels  = { ja: "お届け先", en: "Shipping Address", es: "Dirección" };
  const manageLabels   = {
    ja: "定期購入の管理（解約・支払い変更）",
    en: "Manage your subscription (cancel / update payment)",
    es: "Gestionar suscripción (cancelar / actualizar pago)",
  };

  const subject      = subjects[lang]      || subjects.ja;
  const headline     = headlines[lang]     || headlines.ja;
  const bodyText     = bodyTexts[lang]     || bodyTexts.ja;
  const shippingLabel = shippingLabels[lang] || shippingLabels.ja;
  const totalLabel    = totalLabels[lang]    || totalLabels.ja;
  const freeLabel     = freeLabels[lang]     || freeLabels.ja;
  const addressLabel  = addressLabels[lang]  || addressLabels.ja;
  const manageLabel   = manageLabels[lang]   || manageLabels.ja;

  let itemRows = "";
  if (isSubscription && planTitle) {
    itemRows = `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #2a2a2a;font-size:14px;color:#ccc;">${planTitle}</td>
        <td style="padding:10px 0;border-bottom:1px solid #2a2a2a;font-size:14px;color:#888;text-align:center;">× 1</td>
        <td style="padding:10px 0;border-bottom:1px solid #2a2a2a;font-size:14px;color:#ccc;text-align:right;">—</td>
      </tr>`;
  } else {
    itemRows = items.map((item) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #2a2a2a;font-size:14px;color:#ccc;">${item.title || ""}</td>
        <td style="padding:10px 0;border-bottom:1px solid #2a2a2a;font-size:14px;color:#888;text-align:center;">× ${item.quantity || 1}</td>
        <td style="padding:10px 0;border-bottom:1px solid #2a2a2a;font-size:14px;color:#ccc;text-align:right;">¥${((item.price || 0) * (item.quantity || 1)).toLocaleString()}</td>
      </tr>`).join("");
  }

  const shippingDisplay = (shipping === 0 || isSubscription) ? freeLabel : `¥${Number(shipping || 0).toLocaleString()}`;
  const totalDisplay    = isSubscription ? "—" : `¥${Number(total || 0).toLocaleString()}`;

  const greeting = name
    ? (lang === "ja" ? `${name} 様` : lang === "es" ? `Hola ${name},` : `Hi ${name},`)
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
        .map((item) => `${item.title} × ${item.quantity}　¥${((item.price || 0) * (item.quantity || 0)).toLocaleString()}`)
        .join("\n");

  const shippingLine = isSubscription
    ? "送料：無料"
    : `送料：${shipping === 0 ? "無料" : `¥${Number(shipping || 0).toLocaleString()}`}`;

  const totalLine = isSubscription
    ? ""
    : `合計：¥${Number(total || 0).toLocaleString()}`;

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
      items,
      prefecture,
      countryType,
      shippingZone,
      couponCode,
      email,
      name,
      address,
    } = req.body;

    const safeItems = Array.isArray(items) ? items : [];

    let subtotal = safeItems.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
      0
    );

    let shipping = calcShipping(safeItems, prefecture, countryType, shippingZone);

    const afterCoupon = applyCoupon(subtotal, shipping, couponCode);
    subtotal = afterCoupon.subtotal;
    shipping = afterCoupon.shipping;

    const total = subtotal + shipping;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: total,
      currency: "jpy",
      metadata: {
        email: email || "",
        name: name || "",
        address: address || "",
        prefecture: prefecture || "",
        couponCode: couponCode || "",
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

// ===== 通常購入完了 =====
app.post("/order-complete", async (req, res) => {
  try {
    const {
      items, name, email, postalCode, address, prefecture,
      countryType, countryCode, countryName,
      shippingZone, shippingDiscountStep, couponCode,
      total, shipping, lang,
    } = req.body;

    const fullAddress = [postalCode, prefecture, address].filter(Boolean).join(" ");

    try {
      // お客様へのレシートメール
      await sendUnifiedReceiptEmail("order", {
        email,
        name,
        lang: lang || "ja",
        items: Array.isArray(items) ? items : [],
        total,
        shipping,
        address: fullAddress,
      });
    } catch (mailErr) {
      console.error("order-complete customer mail error:", mailErr);
    }

    try {
      // 管理者への通知メール
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

    const meta      = session.metadata || {};
    const email     = session.customer_email || meta.customerEmail || "";
    const name      = meta.customerName || "";
    const lang      = meta.lang || "ja";
    const planTitle = meta.planTitle || meta.planId || "";
    const address   = [meta.postalCode, meta.prefecture, meta.address].filter(Boolean).join(" ");

    const order = {
      email,
      name,
      lang,
      planTitle,
      address,
      postalCode:     meta.postalCode  || "",
      prefecture:     meta.prefecture  || "",
      shipping:       0,
      total:          null,
      isSubscription: true,
    };

    try {
      // お客様へのレシートメール
      await sendUnifiedReceiptEmail("subscription", {
        email, name, lang,
        items: [], total: null, shipping: 0,
        address, planTitle,
      });
    } catch (mailErr) {
      console.error("subscription-complete customer mail error:", mailErr);
    }

    try {
      // 管理者への通知メール
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