require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

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

// ===== 送料計算（1個¥200、2個以上無料、サブスク無料） =====
function calcShipping(items) {
  const safeItems = Array.isArray(items) ? items : [];

  const hasSubscription = safeItems.some(
    (item) => item.category === "subscription"
  );
  if (hasSubscription) return 0;

  const totalQuantity = safeItems.reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0
  );

  return totalQuantity <= 1 ? 200 : 0;
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
  } = data;

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
        <td style="padding:10px 0;border-bottom:1px solid #2a2a2a;font-size:14px;color:#ccc;">${item.title || ""}</td>
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
            `${item.title} × ${item.quantity}　¥${((item.price || 0) * (item.quantity || 0)).toLocaleString()}`
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

// ===== 卸申請 管理者通知メール =====
async function sendWholesaleAdminEmail(data) {
  const {
    companyName,
    contactName,
    businessType,
    email,
    message,
  } = data;

  const adminAddresses = "ryugecoffee@gmail.com, ryuka2452533@icloud.com";
  const subject = "【龍華珈琲】新規卸申請が届きました";

  const safeCompanyName = companyName || "未入力";
  const safeContactName = contactName || "未入力";
  const safeBusinessType = businessType || "未入力";
  const safeEmail = email || "未入力";
  const safeMessage = message || "なし";

  const text = `会社名: ${safeCompanyName}
担当者名: ${safeContactName}
メール: ${safeEmail}
業種: ${safeBusinessType}
メッセージ: ${safeMessage}
承認はこちら: https://ryuge.biz/wholesale-jp/admin`;

  await transporter.sendMail({
    from: `"Ryuge Coffee" <${process.env.EMAIL_USER}>`,
    to: adminAddresses,
    subject,
    text,
    replyTo: safeEmail !== "未入力" ? safeEmail : undefined,
  });
}

// ===== エンドポイント =====

app.get("/", (req, res) => {
  res.send("Ryuge server is running");
});

app.post("/create-payment-intent", async (req, res) => {
  try {
    const { items, couponCode, email, name, address, prefecture, shipping: clientShipping } = req.body;

    const safeItems = Array.isArray(items) ? items : [];

    let subtotal = safeItems.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
      0
    );

    let shipping = (clientShipping !== undefined && clientShipping !== null)
      ? Number(clientShipping)
      : calcShipping(safeItems);

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

// ===== 卸申請 =====
app.post("/wholesale-register", async (req, res) => {
  try {
    const {
      uid,
      companyName,
      contactName,
      businessType,
      email,
      message,
    } = req.body;

    if (!uid || !companyName || !contactName || !email) {
      return res.status(400).json({
        error: "必須項目が不足しています。",
      });
    }

    const submittedAt = new Date().toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
    });

    const userData = {
      uid,
      email,
      companyName,
      contactName,
      businessType: businessType || "",
      message: message || "",
      approved: false,
      status: "pending",
      role: "user",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("wholesaleUsers").doc(uid).set(userData, { merge: true });

    try {
      await sendWholesaleAdminEmail({
        companyName,
        contactName,
        businessType,
        email,
        message,
        submittedAt,
      });
    } catch (mailErr) {
      console.error("wholesale-register admin mail error:", mailErr);
    }

    return res.status(200).json({
      ok: true,
      message: "申請を受け付けました。",
    });
  } catch (err) {
    console.error("wholesale-register error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ===== 卸ユーザー削除 =====
app.post("/wholesale-delete-user", async (req, res) => {
  try {
    const { uid } = req.body;
    if (!uid) return res.status(400).json({ error: "uid is required" });

    try {
      await admin.auth().deleteUser(uid);
    } catch (authErr) {
      if (authErr.code !== "auth/user-not-found") {
        console.error("Auth delete error:", authErr);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("wholesale-delete-user error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ===== 卸発注 =====
app.post("/wholesale-order", async (req, res) => {
  try {
    const {
      uid = "",
      cartItems = [],
      companyName = "",
      email = "",
      total = 0,
      shipping = 0,
    } = req.body;

    const items = (Array.isArray(cartItems) ? cartItems : []).map((item) => ({
      name: item.name || "商品",
      quantity: Number(item.quantity || 0),
      wholesalePrice: Number(item.wholesalePrice || 0),
    }));

    // Firestoreに保存
    await db.collection("wholesaleOrders").add({
      uid,
      companyName,
      email,
      items,
      total: Number(total),
      shipping: Number(shipping),
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 管理者メール送信
    const adminAddresses = "ryugecoffee@gmail.com, ryuka2452533@icloud.com";
    const subject = "【龍華珈琲】新規卸発注が届きました";
    const createdAtStr = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

    const itemLines = items
      .map((item) => {
        const lineTotal = item.wholesalePrice * item.quantity;
        return `・${item.name} × ${item.quantity}（¥${lineTotal.toLocaleString()}）`;
      })
      .join("\n");

    const text = `会社名: ${companyName}
メール: ${email}
注文内容:
${itemLines}
合計: ¥${Number(total).toLocaleString()}
送料: ¥${Number(shipping).toLocaleString()}
発注日時: ${createdAtStr}
管理画面: https://ryuge.biz/wholesale-jp/admin`;

    await transporter.sendMail({
      from: `"Ryuge Coffee" <${process.env.EMAIL_USER}>`,
      to: adminAddresses,
      replyTo: email || undefined,
      subject,
      text,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("wholesale-order error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ===== 卸発送通知 =====
app.post("/wholesale-ship", async (req, res) => {
  try {
    const { orderId, trackingNumber = "" } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: "orderId is required" });
    }

    const orderRef = db.collection("wholesaleOrders").doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({ error: "Order not found" });
    }

    const orderData = orderSnap.data();

    await orderRef.update({
      status: "shipped",
      trackingNumber: trackingNumber || "",
      shippedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const { companyName = "", email = "" } = orderData;

    if (email) {
      const trackingLine = trackingNumber
        ? `■ 追跡番号：${trackingNumber}\n■ 追跡URL：https://trackings.post.japanpost.jp/services/srv/search/?requestNo=${trackingNumber}`
        : "■ 追跡番号：なし";

      const text = `${companyName} ご担当者様

このたびはご注文いただきありがとうございます。
本日、ご注文商品を発送いたしましたのでお知らせします。

${trackingLine}

ご不明な点はryugecoffee@gmail.comまでご連絡ください。
龍華珈琲`;

      await transporter.sendMail({
        from: `"龍華珈琲" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "【龍華珈琲】ご注文商品を発送いたしました",
        text,
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("wholesale-ship error:", err);
    return res.status(500).json({ error: err.message });
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