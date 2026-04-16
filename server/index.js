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
  if (isBagItem(item)) return false; // ← これを追加
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
  // STEP 2: 豆10個以上 & バッグ20個以上
  if (beans >= 10 && bags >= 20) {
    if (zoneKey === "zone4" || zoneKey === "zone5") {
      return Math.round(baseShipping * 0.3); // 70%OFF
    }
    return 0; // 送料無料（zone1,2,3）
  }

  // STEP 1: 豆7個以上 & バッグ10個以上
  if (beans >= 7 && bags >= 10) {
    return Math.round(baseShipping * 0.5); // 50%OFF
  }

  return baseShipping; // 割引なし
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

  // 国内：5000円以上で送料無料
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

    // クーポン適用
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