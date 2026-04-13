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

// メール送信設定
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ゆうパック送料
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

// 送料計算
function calcShipping(items, prefecture) {
  const safeItems = Array.isArray(items) ? items : [];

  const subtotal = safeItems.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );

  // 5000円以上で送料無料
  if (subtotal >= 5000) return 0;

  // 商品ID一覧
  const itemIds = safeItems.map((item) => item.id);

  // サブスクは送料無料
  const subscriptionIds = new Set([
    "oriori-subscription",
    "light",
    "basic",
    "premium",
    "subscription-light",
    "subscription-basic",
    "subscription-premium",
  ]);

  const hasSubscription = itemIds.some((id) => subscriptionIds.has(id));
  if (hasSubscription) return 0;

  // バッグシリーズのみはクリックポスト
  // 対象: coffee-bag / tea-bag
  // 条件: バッグ以外が混ざっていない、合計10個まで
  const bagIds = new Set(["coffee-bag", "tea-bag"]);

  const hasOnlyBagItems =
    safeItems.length > 0 &&
    safeItems.every((item) => bagIds.has(item.id));

  const totalBagQuantity = safeItems
    .filter((item) => bagIds.has(item.id))
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  if (hasOnlyBagItems && totalBagQuantity <= 10) {
    return 185;
  }

  // 海外は仮送料
  if (prefecture === "overseas") {
    return 3000;
  }

  // それ以外はゆうパック
  return YUPACK_SHIPPING[prefecture] ?? 880;
}

// 接続確認用
app.get("/", (req, res) => {
  res.send("Ryuge server is running");
});

// テストメール送信用
app.get("/test-mail", async (req, res) => {
  try {
    console.log("test-mail called");
    console.log("EMAIL_USER exists:", !!process.env.EMAIL_USER);
    console.log("EMAIL_PASS exists:", !!process.env.EMAIL_PASS);
    console.log("NOTIFY_EMAILS exists:", !!process.env.NOTIFY_EMAILS);

    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: "【龍華珈琲】テストメール",
      text: "Render からのテスト送信です。",
    });

    console.log("test mail sent:", info.response);
    res.json({ ok: true, response: info.response });
  } catch (err) {
    console.error("test-mail error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 決済Intent作成
app.post("/create-payment-intent", async (req, res) => {
  try {
    console.log("create-payment-intent called");

    const { items, prefecture, email, name, address } = req.body;

    const safeItems = Array.isArray(items) ? items : [];

    const subtotal = safeItems.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
      0
    );

    const shipping = calcShipping(safeItems, prefecture);
    const total = subtotal + shipping;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: total,
      currency: "jpy",
      metadata: {
        email: email || "",
        name: name || "",
        address: address || "",
        prefecture: prefecture || "",
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      shipping,
      total,
    });
  } catch (err) {
    console.error("create-payment-intent error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 注文確定後の通知メール
app.post("/order-complete", async (req, res) => {
  try {
    console.log("order-complete called");
    console.log("EMAIL_USER exists:", !!process.env.EMAIL_USER);
    console.log("EMAIL_PASS exists:", !!process.env.EMAIL_PASS);
    console.log("NOTIFY_EMAILS exists:", !!process.env.NOTIFY_EMAILS);

    const { items, name, email, address, prefecture, total, shipping } =
      req.body;

    const safeItems = Array.isArray(items) ? items : [];

    const itemList = safeItems
      .map(
        (i) =>
          `${i.title} × ${i.quantity} ¥${(
            Number(i.price || 0) * Number(i.quantity || 0)
          ).toLocaleString()}`
      )
      .join("\n");

    // 先にフロントへ成功レスポンスを返す
    res.json({ ok: true });

    // ここから後ろは裏でメール送信
    (async () => {
      try {
        // お客さんへのメール
        const customerInfo = await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: email,
          subject: "【龍華珈琲】ご注文ありがとうございます",
          text: `${name} 様

ご注文ありがとうございます。

─────────────
${itemList}
─────────────
送料：¥${Number(shipping).toLocaleString()}
合計：¥${Number(total).toLocaleString()}

お届け先：${prefecture} ${address}

1〜3営業日以内に発送いたします。

龍華珈琲`,
        });

        console.log("customer mail sent:", customerInfo.response);

        // 管理者への通知
        const notifyEmails = process.env.NOTIFY_EMAILS
          ? process.env.NOTIFY_EMAILS
              .split(",")
              .map((mail) => mail.trim())
              .filter(Boolean)
          : [];

        if (notifyEmails.length > 0) {
          const adminInfo = await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: notifyEmails,
            subject: "【新規注文】龍華珈琲",
            text: `新規注文が届きました。

お名前：${name}
メール：${email}
お届け先：${prefecture} ${address}

─────────────
${itemList}
─────────────
送料：¥${Number(shipping).toLocaleString()}
合計：¥${Number(total).toLocaleString()}`,
          });

          console.log("admin mail sent:", adminInfo.response);
        } else {
          console.log("NOTIFY_EMAILS is not set, skipped admin notification");
        }

        console.log("order-complete mail tasks finished");
      } catch (mailErr) {
        console.error("mail send error after response:", mailErr);
      }
    })();
  } catch (err) {
    console.error("order-complete error:", err);

    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: err.message });
    }
  }
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});