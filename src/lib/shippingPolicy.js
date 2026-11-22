// Shipping policy as the storefront shows it (2026-11-17; domestic 2026-11-19). The amount itself always comes from the payment server's
// /quote (server/quote.js); nothing here is used to charge. INTERNATIONAL_COUNTRY_CODES must equal the enabled countries
// in server/international-rates.js (a server test checks it).
export const CONTACT_EMAIL = "ryugecoffee@gmail.com";

// Domestic shipping as shown to customers (2026-11-19, final). Must equal server/domestic-shipping.js (a server test checks
// it). Coffee beans 100 g, 1–2 bags: レターパックライト 250 yen nationwide. 3–15 bags: ゆうパック at the regional fee (Honshu/
// Shikoku 250, Hokkaido/Kyushu 500, Okinawa 550). 16+: contact us. Orders with other products: the regional fee.
export const DOMESTIC = {
  flatMailFee: 250,
  flatMailMaxBags: 2,
  maxBags: 15,
  regional: { standard: 250, hokkaidoKyushu: 500, okinawa: 550 },
};

// The method shown next to the domestic fee (the server's shippingDetail.method / size).
export const DOMESTIC_METHOD_LABELS = {
  ja: { letterpack_light: "レターパックライト（郵便受けへのお届け・追跡あり）", yupack: "ゆうパック（対面でのお届け・追跡あり）", regional: "コーヒー豆以外の商品を含むご注文の送料" },
  en: { letterpack_light: "Letter Pack Light (mailbox delivery, tracked)", yupack: "Yu-Pack (handed to you, tracked)", regional: "Shipping for orders with items other than coffee beans" },
  es: { letterpack_light: "Letter Pack Light (entrega en buzón, con seguimiento)", yupack: "Yu-Pack (entrega en mano, con seguimiento)", regional: "Envío para pedidos con artículos que no son café en grano" },
};
export const INTERNATIONAL_COUNTRY_CODES = ["TW", "HK", "SG"];
export const OTHER_COUNTRY = "OTHER";

export function contactHref(subject) {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

export const SERVICE_LABELS = {
  ja: { airpacket: "日本郵便 国際エアパケット（追跡あり）" },
  en: { airpacket: "Japan Post International Air Packet (tracked)" },
  es: { airpacket: "Japan Post International Air Packet (con seguimiento)" },
};

// Messages for the server's refusal codes. contact: true -> the contact link is shown and payment is not possible.
export const QUOTE_MESSAGES = {
  ja: {
    PREFECTURE_REQUIRED: "都道府県を選択してください。",
    DOMESTIC_CONTACT_LARGE_ORDER: "16袋以上のご注文はお問い合わせください。",
    COUNTRY_NOT_AVAILABLE: "現在、この国・地域へのお届けは承っておりません。ご希望の場合はお問い合わせください。",
    INTL_MIN_BAGS: "海外へのお届けは2袋（100g×2）からのご注文となります。",
    INTL_CONTACT_LARGE_ORDER: "7袋以上のご注文はお問い合わせください。",
    INTL_BEANS_ONLY: "海外へのお届けはコーヒー豆（100g）のみ承っております。その他の商品はお問い合わせください。",
    SHIPPING_RATE_UNAVAILABLE: "送料を確定できないため、お手続きを進められません。お手数ですがお問い合わせください。",
    PROMO_LIMIT: "「今、飲んでほしい珈琲」は、お一人様2袋までです。",
    PROMO_CUSTOMER_LIMIT: "「今、飲んでほしい珈琲」は、お一人様2袋までです（これまでのおすすめ枠のご注文を含みます）。",
    PROMO_REQUIRES_INVENTORY: "「今、飲んでほしい珈琲」は、現在ご購入いただけません。",
    EMAIL_REQUIRED: "メールアドレスとお届け先を入力してください。",
    OUT_OF_STOCK: "申し訳ございません。在庫が不足しています。数量を減らすか、別の商品をお選びください。",
    QUOTE_UNAVAILABLE: "送料を確認できませんでした。通信状況をご確認のうえ、少し待ってからもう一度お試しください。",
    AMOUNT_CHANGED: "お支払い金額が更新されました。内容をご確認のうえ、もう一度お支払いください。",
  },
  en: {
    PREFECTURE_REQUIRED: "Please choose a prefecture.",
    DOMESTIC_CONTACT_LARGE_ORDER: "For orders of 16 bags or more, please contact us.",
    COUNTRY_NOT_AVAILABLE: "We do not currently ship to this country or region. Please contact us if you would like to order.",
    INTL_MIN_BAGS: "International orders start from 2 bags (100 g × 2).",
    INTL_CONTACT_LARGE_ORDER: "For orders of 7 bags or more, please contact us.",
    INTL_BEANS_ONLY: "We ship only coffee beans (100 g) abroad. Please contact us about other products.",
    SHIPPING_RATE_UNAVAILABLE: "We cannot confirm the shipping fee, so the order cannot be completed. Please contact us.",
    PROMO_LIMIT: "“Coffee We Recommend Now” is limited to 2 bags per customer.",
    PROMO_CUSTOMER_LIMIT: "“Coffee We Recommend Now” is limited to 2 bags per customer, including previous orders of our recommended coffee.",
    PROMO_REQUIRES_INVENTORY: "“Coffee We Recommend Now” is not available right now.",
    EMAIL_REQUIRED: "Please enter your email address and delivery address.",
    OUT_OF_STOCK: "Sorry, there is not enough stock. Please reduce the quantity or choose another item.",
    QUOTE_UNAVAILABLE: "We could not check the shipping fee. Please check your connection and try again shortly.",
    AMOUNT_CHANGED: "The amount to pay has been updated. Please check it and pay again.",
  },
  es: {
    PREFECTURE_REQUIRED: "Elige una prefectura.",
    DOMESTIC_CONTACT_LARGE_ORDER: "Para pedidos de 16 bolsas o más, contáctanos.",
    COUNTRY_NOT_AVAILABLE: "Actualmente no enviamos a este país o región. Contáctanos si deseas hacer un pedido.",
    INTL_MIN_BAGS: "Los pedidos internacionales son a partir de 2 bolsas (100 g × 2).",
    INTL_CONTACT_LARGE_ORDER: "Para pedidos de 7 bolsas o más, contáctanos.",
    INTL_BEANS_ONLY: "Al extranjero solo enviamos café en grano (100 g). Contáctanos para otros productos.",
    SHIPPING_RATE_UNAVAILABLE: "No podemos confirmar el costo de envío, por lo que no es posible completar el pedido. Contáctanos.",
    PROMO_LIMIT: "«El café que recomendamos ahora» está limitado a 2 bolsas por cliente.",
    PROMO_CUSTOMER_LIMIT: "«El café que recomendamos ahora» está limitado a 2 bolsas por cliente, incluidos pedidos anteriores de nuestro café recomendado.",
    PROMO_REQUIRES_INVENTORY: "«El café que recomendamos ahora» no está disponible en este momento.",
    EMAIL_REQUIRED: "Introduce tu correo electrónico y la dirección de entrega.",
    OUT_OF_STOCK: "Lo sentimos, no hay suficiente stock. Reduce la cantidad o elige otro producto.",
    QUOTE_UNAVAILABLE: "No pudimos comprobar el costo de envío. Revisa tu conexión e inténtalo de nuevo en un momento.",
    AMOUNT_CHANGED: "El importe a pagar se ha actualizado. Revísalo y vuelve a pagar.",
  },
};

export const POLICY_TEXT = {
  ja: {
    domesticShipping: "国内送料（1回のご注文につき1回）：コーヒー豆100g 1〜2袋はレターパックライトで全国一律250円（北海道・九州・沖縄も同額）。3袋以上はゆうパックで、本州・四国250円／北海道・九州500円／沖縄550円。",
    subsidy: (actual, subsidy) => `実際の送料 ¥${actual.toLocaleString()} のうち ¥${subsidy.toLocaleString()} をRYUGE Coffeeが負担しています（送料の30%・上限1,000円）。`,
    duties: "関税・輸入税・現地の手数料は、お客様（受取人）のご負担となります。お届け時に請求される場合があります。",
    intlLimits: "海外へのお届け：コーヒー豆 2〜6袋（100g×2〜6、1注文600gまで）。7袋以上はお問い合わせください。",
    countryOther: "その他の国・地域（お問い合わせ）",
    contactLink: "お問い合わせ（メール）",
  },
  en: {
    domesticShipping: "Shipping in Japan (once per order): 1–2 bags of coffee beans (100 g) by Letter Pack Light, ¥250 anywhere in Japan (Hokkaido, Kyushu and Okinawa too). 3 bags or more by Yu-Pack: Honshu/Shikoku ¥250, Hokkaido/Kyushu ¥500, Okinawa ¥550.",
    subsidy: (actual, subsidy) => `Of the actual ¥${actual.toLocaleString()} shipping, RYUGE Coffee covers ¥${subsidy.toLocaleString()} (30% of shipping, up to ¥1,000).`,
    duties: "Import duties, taxes and local fees are paid by the customer (recipient) and may be charged on delivery.",
    intlLimits: "International orders: 2–6 bags of coffee beans (100 g × 2–6, up to 600 g per order). For 7 bags or more, please contact us.",
    countryOther: "Other countries / regions (contact us)",
    contactLink: "Contact us (email)",
  },
  es: {
    domesticShipping: "Envío en Japón (una vez por pedido): 1–2 bolsas de café en grano (100 g) por Letter Pack Light, ¥250 a todo Japón (también Hokkaido, Kyushu y Okinawa). 3 bolsas o más por Yu-Pack: Honshu/Shikoku ¥250, Hokkaido/Kyushu ¥500, Okinawa ¥550.",
    subsidy: (actual, subsidy) => `Del envío real de ¥${actual.toLocaleString()}, RYUGE Coffee cubre ¥${subsidy.toLocaleString()} (30% del envío, hasta ¥1,000).`,
    duties: "Los aranceles, impuestos de importación y tasas locales corren por cuenta del cliente (destinatario) y pueden cobrarse en la entrega.",
    intlLimits: "Pedidos internacionales: 2–6 bolsas de café en grano (100 g × 2–6, hasta 600 g por pedido). Para 7 bolsas o más, contáctanos.",
    countryOther: "Otros países / regiones (contáctanos)",
    contactLink: "Contáctanos (correo)",
  },
};
