// Shipping policy as the storefront shows it (2026-11-17). The amount itself always comes from the payment server's
// /quote (server/quote.js); nothing here is used to charge. INTERNATIONAL_COUNTRY_CODES must equal the enabled countries
// in server/international-rates.js (a server test checks it).
export const CONTACT_EMAIL = "ryugecoffee@gmail.com";
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
    COUNTRY_NOT_AVAILABLE: "現在、この国・地域へのお届けは承っておりません。ご希望の場合はお問い合わせください。",
    INTL_MIN_BAGS: "海外へのお届けは2袋（100g×2）からのご注文となります。",
    INTL_CONTACT_LARGE_ORDER: "7袋以上のご注文はお問い合わせください。",
    INTL_BEANS_ONLY: "海外へのお届けはコーヒー豆（100g）のみ承っております。その他の商品はお問い合わせください。",
    SHIPPING_RATE_UNAVAILABLE: "送料を確定できないため、お手続きを進められません。お手数ですがお問い合わせください。",
    PROMO_LIMIT: "季節のおすすめの豆は、お一人様2袋までです。",
    PROMO_CUSTOMER_LIMIT: "季節のおすすめの豆は、お一人様2袋までです（これまでのご注文を含みます）。",
    PROMO_REQUIRES_INVENTORY: "季節のおすすめの豆は、現在ご購入いただけません。",
    EMAIL_REQUIRED: "メールアドレスとお届け先を入力してください。",
    OUT_OF_STOCK: "申し訳ございません。在庫が不足しています。数量を減らすか、別の商品をお選びください。",
    QUOTE_UNAVAILABLE: "送料を確認できませんでした。通信状況をご確認のうえ、少し待ってからもう一度お試しください。",
    AMOUNT_CHANGED: "お支払い金額が更新されました。内容をご確認のうえ、もう一度お支払いください。",
  },
  en: {
    PREFECTURE_REQUIRED: "Please choose a prefecture.",
    COUNTRY_NOT_AVAILABLE: "We do not currently ship to this country or region. Please contact us if you would like to order.",
    INTL_MIN_BAGS: "International orders start from 2 bags (100 g × 2).",
    INTL_CONTACT_LARGE_ORDER: "For orders of 7 bags or more, please contact us.",
    INTL_BEANS_ONLY: "We ship only coffee beans (100 g) abroad. Please contact us about other products.",
    SHIPPING_RATE_UNAVAILABLE: "We cannot confirm the shipping fee, so the order cannot be completed. Please contact us.",
    PROMO_LIMIT: "Our seasonal pick is limited to 2 bags per customer.",
    PROMO_CUSTOMER_LIMIT: "Our seasonal pick is limited to 2 bags per customer, including previous orders.",
    PROMO_REQUIRES_INVENTORY: "Our seasonal pick is not available right now.",
    EMAIL_REQUIRED: "Please enter your email address and delivery address.",
    OUT_OF_STOCK: "Sorry, there is not enough stock. Please reduce the quantity or choose another item.",
    QUOTE_UNAVAILABLE: "We could not check the shipping fee. Please check your connection and try again shortly.",
    AMOUNT_CHANGED: "The amount to pay has been updated. Please check it and pay again.",
  },
  es: {
    PREFECTURE_REQUIRED: "Elige una prefectura.",
    COUNTRY_NOT_AVAILABLE: "Actualmente no enviamos a este país o región. Contáctanos si deseas hacer un pedido.",
    INTL_MIN_BAGS: "Los pedidos internacionales son a partir de 2 bolsas (100 g × 2).",
    INTL_CONTACT_LARGE_ORDER: "Para pedidos de 7 bolsas o más, contáctanos.",
    INTL_BEANS_ONLY: "Al extranjero solo enviamos café en grano (100 g). Contáctanos para otros productos.",
    SHIPPING_RATE_UNAVAILABLE: "No podemos confirmar el costo de envío, por lo que no es posible completar el pedido. Contáctanos.",
    PROMO_LIMIT: "Nuestra selección de temporada está limitada a 2 bolsas por cliente.",
    PROMO_CUSTOMER_LIMIT: "Nuestra selección de temporada está limitada a 2 bolsas por cliente, incluidos pedidos anteriores.",
    PROMO_REQUIRES_INVENTORY: "Nuestra selección de temporada no está disponible en este momento.",
    EMAIL_REQUIRED: "Introduce tu correo electrónico y la dirección de entrega.",
    OUT_OF_STOCK: "Lo sentimos, no hay suficiente stock. Reduce la cantidad o elige otro producto.",
    QUOTE_UNAVAILABLE: "No pudimos comprobar el costo de envío. Revisa tu conexión e inténtalo de nuevo en un momento.",
    AMOUNT_CHANGED: "El importe a pagar se ha actualizado. Revísalo y vuelve a pagar.",
  },
};

export const POLICY_TEXT = {
  ja: {
    domesticShipping: "送料（1回のご注文につき1回）：本州・四国 250円／北海道・九州 500円／沖縄 550円",
    subsidy: (actual, subsidy) => `実際の送料 ¥${actual.toLocaleString()} のうち ¥${subsidy.toLocaleString()} をRYUGE Coffeeが負担しています（送料の30%・上限1,000円）。`,
    duties: "関税・輸入税・現地の手数料は、お客様（受取人）のご負担となります。お届け時に請求される場合があります。",
    intlLimits: "海外へのお届け：コーヒー豆 2〜6袋（100g×2〜6、1注文600gまで）。7袋以上はお問い合わせください。",
    countryOther: "その他の国・地域（お問い合わせ）",
    contactLink: "お問い合わせ（メール）",
  },
  en: {
    domesticShipping: "Shipping in Japan (once per order): Honshu/Shikoku ¥250 / Hokkaido/Kyushu ¥500 / Okinawa ¥550",
    subsidy: (actual, subsidy) => `Of the actual ¥${actual.toLocaleString()} shipping, RYUGE Coffee covers ¥${subsidy.toLocaleString()} (30% of shipping, up to ¥1,000).`,
    duties: "Import duties, taxes and local fees are paid by the customer (recipient) and may be charged on delivery.",
    intlLimits: "International orders: 2–6 bags of coffee beans (100 g × 2–6, up to 600 g per order). For 7 bags or more, please contact us.",
    countryOther: "Other countries / regions (contact us)",
    contactLink: "Contact us (email)",
  },
  es: {
    domesticShipping: "Envío en Japón (una vez por pedido): Honshu/Shikoku ¥250 / Hokkaido/Kyushu ¥500 / Okinawa ¥550",
    subsidy: (actual, subsidy) => `Del envío real de ¥${actual.toLocaleString()}, RYUGE Coffee cubre ¥${subsidy.toLocaleString()} (30% del envío, hasta ¥1,000).`,
    duties: "Los aranceles, impuestos de importación y tasas locales corren por cuenta del cliente (destinatario) y pueden cobrarse en la entrega.",
    intlLimits: "Pedidos internacionales: 2–6 bolsas de café en grano (100 g × 2–6, hasta 600 g por pedido). Para 7 bolsas o más, contáctanos.",
    countryOther: "Otros países / regiones (contáctanos)",
    contactLink: "Contáctanos (correo)",
  },
};
