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

  // ✅ 5000円以上で送料無料
  if (subtotal >= 5000) return 0;

  // ✅ サブスクは送料無料
  const hasSubscription = safeItems.some(
    (item) => item.category === "subscription"
  );
  if (hasSubscription) return 0;

  // ✅ バッグ判定（ここが今回の修正の本丸）
  const isBagItem = (item) =>
    item?.category === "bag" || item?.category === "tea-bag";

  const hasOnlyBagItems =
    safeItems.length > 0 &&
    safeItems.every((item) => isBagItem(item));

  const totalBagQuantity = safeItems
    .filter((item) => isBagItem(item))
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  if (hasOnlyBagItems && totalBagQuantity <= 10) {
    return 185;
  }

  // ✅ 海外
  if (prefecture === "overseas") {
    return 3000;
  }

  // ✅ それ以外はゆうパック
  return YUPACK_SHIPPING[prefecture] ?? 880;
}

// 接続確認
app.get("/", (req, res) => {
  res.send("Ryuge server is running");
});

// 決済Intent
app.post("/create-payment-intent", async (req, res) => {
  try {
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
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 起動
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});