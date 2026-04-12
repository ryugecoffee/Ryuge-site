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
    // レターパックプラス
    return 600;
  } else {
    // クリックポスト
    return 185;
  }
}

// 決済Intent作成
app.post("/create-payment-intent", async (req, res) => {
  try {
    const { items, prefecture, email, name, address } = req.body;

    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const shipping = calcShipping(items, prefecture);
    const total = subtotal + shipping;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: total,
      currency: "jpy",
      metadata: { email, name, address, prefecture },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      shipping,
      total,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 注文確定後の通知メール
app.post("/order-complete", async (req, res) => {
  try {
    const { items, name, email, address, prefecture, total, shipping } = req.body;

    const itemList = items
      .map((i) => `${i.title} × ${i.quantity} ¥${(i.price * i.quantity).toLocaleString()}`)
      .join("\n");

    // お客さんへのメール
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "【龍華珈琲】ご注文ありがとうございます",
      text: `${name} 様\n\nご注文ありがとうございます。\n\n─────────────\n${itemList}\n─────────────\n送料：¥${shipping.toLocaleString()}\n合計：¥${total.toLocaleString()}\n\nお届け先：${prefecture} ${address}\n\n1〜3営業日以内に発送いたします。\n\n龍華珈琲`,
    });

    // 管理者への通知
    const notifyEmails = process.env.NOTIFY_EMAILS.split(",");
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: notifyEmails,
      subject: "【新規注文】龍華珈琲",
      text: `新規注文が届きました。\n\nお名前：${name}\nメール：${email}\nお届け先：${prefecture} ${address}\n\n─────────────\n${itemList}\n─────────────\n送料：¥${shipping.toLocaleString()}\n合計：¥${total.toLocaleString()}`,
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => console.log("Server running on port 3001"));