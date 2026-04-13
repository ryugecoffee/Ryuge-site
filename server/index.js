require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

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

// 送料計算
function calcShipping(items, prefecture) {
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  if (total >= 7000) return 0;

  const hasWoodbox = items.some((item) => item.id.includes("woodbox"));

  if (hasWoodbox) {
    return 600; // レターパックプラス
  } else {
    return 185; // クリックポスト
  }
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

    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const shipping = calcShipping(items, prefecture);
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

    const { items, name, email, address, prefecture, total, shipping } = req.body;

    const itemList = (items || [])
      .map((i) => `${i.title} × ${i.quantity} ¥${(i.price * i.quantity).toLocaleString()}`)
      .join("\n");

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
      ? process.env.NOTIFY_EMAILS.split(",").map((mail) => mail.trim()).filter(Boolean)
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

    console.log("order-complete success");
    res.json({ ok: true });
  } catch (err) {
    console.error("order-complete error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});