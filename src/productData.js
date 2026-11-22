// A product field may be one string (same in every language) or { ja, en, es }.
export function loc(value, lang) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value[lang] ?? value.ja ?? value.en ?? "";
  return value ?? "";
}

// Wording of the product detail panel (src/pages/ProductsPage.jsx).
export const DETAIL_TEXT = {
  ja: {
    beanDetails: "豆の詳細", productDetails: "商品の詳細", flavor: "風味",
    flavorSource: "風味は仕入れ先の情報をもとにしています。焙煎や淹れ方によって感じ方は変わります。",
    roastScale: ["浅煎り", "中煎り", "中深煎り", "深煎り"],
    roastGuide: "浅煎りほど果実のような酸味や香りが、深煎りほど苦みやコクが感じられやすくなります。",
    flavorDirection: "風味は焙煎の方向性です。カッピングでの確認前のため、実際の味わいとは異なる場合があります。",
    teaDetails: "産地・原材料",
    teaFlavorSource: "風味は生産者の情報をもとにしています。淹れ方によって感じ方は変わります。",
    brewHot: "温かいお茶", brewCold: "水出し",
    range: (r) => r.join("〜"),
    hotAmounts: (leaf, ml, temp) => `茶葉 ${leaf}g・お湯 ${ml}ml（${temp}℃）`,
    steeps: (secs) => secs.map((sec, i) => `${i + 1}煎目 ${sec}秒`).join("・"),
    coldAmounts: (leaf, l) => `茶葉 ${leaf}g・水 ${l}L`,
    coldTime: (hours) => `冷蔵庫で${hours}時間`,
    howToBrew: "淹れ方", quantity: "数量", addToCart: "カートに入れる", back: "戻る", close: "閉じる",
    promoNote: "この豆は、お一人様2袋までのご購入となります（これまでのご注文を含みます）。",
  },
  en: {
    beanDetails: "About the beans", productDetails: "Product details", flavor: "Flavor notes",
    flavorSource: "Flavor notes are based on the supplier's information. Roast and brewing change how they come through.",
    roastScale: ["Light", "Medium", "Medium-Dark", "Dark"],
    roastGuide: "Lighter roasts tend to bring fruity acidity and aroma; darker roasts, bitterness and body.",
    flavorDirection: "These notes are the direction we roast toward; they have not been confirmed by cupping yet, so the cup may differ.",
    teaDetails: "Origin and ingredients",
    teaFlavorSource: "Flavor notes are based on the producer's information. Brewing changes how they come through.",
    brewHot: "Hot", brewCold: "Cold brew",
    range: (r) => r.join("–"),
    hotAmounts: (leaf, ml, temp) => `${leaf} g of tea, ${ml} ml of water at ${temp} °C`,
    steeps: (secs) => secs.map((sec, i) => `${["1st", "2nd", "3rd", "4th"][i]} infusion ${sec} s`).join(" · "),
    coldAmounts: (leaf, l) => `${leaf} g of tea, ${l} L of water`,
    coldTime: (hours) => `${hours} hours in the fridge`,
    howToBrew: "How to Brew", quantity: "Quantity", addToCart: "Add to cart", back: "Back", close: "Close",
    promoNote: "This coffee is limited to 2 bags per customer, including previous orders.",
  },
  es: {
    beanDetails: "Sobre el grano", productDetails: "Detalles del producto", flavor: "Notas de sabor",
    flavorSource: "Las notas de sabor se basan en la información del proveedor. El tueste y la preparación cambian cómo se perciben.",
    roastScale: ["Claro", "Medio", "Medio-oscuro", "Oscuro"],
    roastGuide: "Los tuestes claros suelen dar acidez frutal y aroma; los oscuros, amargor y cuerpo.",
    flavorDirection: "Estas notas son la dirección del tueste; aún no se han confirmado en cata, así que la taza puede variar.",
    teaDetails: "Origen e ingredientes",
    teaFlavorSource: "Las notas de sabor se basan en la información del productor. La preparación cambia cómo se perciben.",
    brewHot: "En caliente", brewCold: "En frío",
    range: (r) => r.join("–"),
    hotAmounts: (leaf, ml, temp) => `${leaf} g de té, ${ml} ml de agua a ${temp} °C`,
    steeps: (secs) => secs.map((sec, i) => `${i + 1}.ª infusión ${sec} s`).join(" · "),
    coldAmounts: (leaf, l) => `${leaf} g de té, ${l} L de agua`,
    coldTime: (hours) => `${hours} horas en la nevera`,
    howToBrew: "Preparación", quantity: "Cantidad", addToCart: "Añadir al carrito", back: "Volver", close: "Cerrar",
    promoNote: "Este café está limitado a 2 bolsas por cliente, incluidos pedidos anteriores.",
  },
};

// Position on the 4-step roast scale, from the product's English roast name.
export const ROAST_LEVEL = { "Light Roast": 0, "Medium Roast": 1, "Medium-Dark Roast": 2, "Dark Roast": 3 };

// Subscriptions: new sign-ups paused (CEO, 2026-11-17; kept for the new 珈琲の定期便, 2026-11-18). The store shows the
// notice and disables the buttons; api/create-subscription-checkout.js refuses every new subscription. Existing
// subscriptions are not touched. To resume, set this to false in a reviewed PR.
export const SUBSCRIPTIONS_PAUSED = false;
// The earlier subscription plans (Basic / Premium …, sold through api/create-subscription-checkout.js and the cart): closed
// for good (CEO, 2026-11-19: no active contract left). Separate from SUBSCRIPTIONS_PAUSED, so that reopening sign-ups for
// 珈琲の定期便 never reopens the earlier plans.
export const OLD_SUBSCRIPTION_PLANS_CLOSED = true;
export const SUBSCRIPTIONS_PAUSED_TEXT = {
  ja: "現在、新規受付を休止しています",
  en: "New sign-ups are currently paused",
  es: "Las nuevas suscripciones están en pausa por ahora",
};
// The short form for the 折々 card badge (the detail shows the full sentence).
export const SUBSCRIPTIONS_PAUSED_SHORT_TEXT = { ja: "受付休止中", en: "Paused", es: "En pausa" };

// 珈琲の定期便 (CEO, 2026-11-18): one subscription, the customer chooses how many deliveries a month. Every text shown
// for it is here, so wording can be changed without touching the page. Prices: tax and shipping included, one price
// nationwide (CEO, 2026-11-18). Not decided yet (do not state them as fixed): shipping days, the first month's payment
// and first delivery, and what happens on cancellation. New sign-ups stay paused (SUBSCRIPTIONS_PAUSED above).
export const COFFEE_SUBSCRIPTION = {
  id: "coffee-subscription",
  name: { ja: "珈琲の定期便", en: "Coffee Subscription", es: "Suscripción de café" },
  cardSummary: {
    ja: "当店おまかせの珈琲豆2種類を、季節に合わせてお届けします",
    en: "Two coffees of our choosing, delivered with the seasons",
    es: "Dos cafés elegidos por nosotros, al ritmo de las estaciones",
  },
  lead: {
    ja: "毎回、当店おまかせの珈琲豆を2種類お届けします。",
    en: "Each delivery brings two coffees chosen by us.",
    es: "Cada envío incluye dos cafés elegidos por nosotros.",
  },
  perDelivery: { ja: "100g × 2袋（1回 200g）", en: "100 g × 2 bags (200 g per delivery)", es: "100 g × 2 bolsas (200 g por envío)" },
  selectionNote: {
    ja: "銘柄は、季節や仕入れの状況に合わせて当店が選びます。",
    en: "We choose the coffees according to the season and what we have sourced.",
    es: "Elegimos los cafés según la estación y lo que hemos conseguido.",
  },
  // deliveriesPerMonth × 200 g. Prices: tax and shipping included, the same everywhere in Japan.
  frequencies: [
    { id: "monthly-1", deliveriesPerMonth: 1, priceNumber: 3000, gramsPerMonth: 200 },
    { id: "monthly-2", deliveriesPerMonth: 2, priceNumber: 5800, gramsPerMonth: 400 },
    { id: "monthly-3", deliveriesPerMonth: 3, priceNumber: 8550, gramsPerMonth: 600 },
    { id: "monthly-4", deliveriesPerMonth: 4, priceNumber: 11200, gramsPerMonth: 800 },
  ],
  defaultFrequency: "monthly-1",
  frequencyLabel: { ja: (n) => `月${n}回`, en: (n) => (n === 1 ? "Once a month" : `${n} times a month`), es: (n) => (n === 1 ? "1 vez al mes" : `${n} veces al mes`) },
  labels: {
    ja: { frequency: "配送回数", monthly: "月額", amount: "月間の配送量", perDelivery: "1回のお届け", perMonth: "/月", priceNote: "税込・全国一律送料込み" },
    en: { frequency: "Deliveries", monthly: "Monthly", amount: "Coffee per month", perDelivery: "Each delivery", perMonth: "/month", priceNote: "Tax and shipping included, same price nationwide" },
    es: { frequency: "Envíos", monthly: "Mensual", amount: "Café al mes", perDelivery: "Cada envío", perMonth: "/mes", priceNote: "Impuestos y envío incluidos, mismo precio en todo Japón" },
  },
  terms: {
    ja: ["全国一律・送料込み（追加送料なし）", "配送回数は月1〜4回で途中変更できます", "スキップ自由", "解約自由", "最低継続回数なし", "国内配送のみ"],
    en: ["One price nationwide, shipping included", "Change between 1 and 4 deliveries a month", "Skip whenever you like", "Cancel anytime", "No minimum term", "Delivery within Japan only"],
    es: ["Precio único en todo Japón, envío incluido", "Cambia entre 1 y 4 envíos al mes", "Omite envíos libremente", "Cancela cuando quieras", "Sin permanencia mínima", "Solo envíos dentro de Japón"],
  },
  // Billing and changes (CEO, 2026-11-18).
  billing: {
    ja: ["毎月、月初に月額を一括でお支払いいただきます", "配送回数の変更・スキップは、原則として翌月から反映されます", "変更の締切は前月25日です", "日割りの精算はありません"],
    en: ["The monthly price is charged in full at the start of each month", "Changes to deliveries and skips normally apply from the following month", "The deadline for changes is the 25th of the previous month", "No pro-rated charges or refunds"],
    es: ["El precio mensual se cobra completo al inicio de cada mes", "Los cambios de envíos y las omisiones se aplican normalmente desde el mes siguiente", "El plazo para cambios es el día 25 del mes anterior", "Sin cobros ni reembolsos prorrateados"],
  },
  // Conditions still to be decided: announced when sign-ups reopen (never shown as fixed before that).
  pendingNote: {
    ja: "発送日、初月のお支払いと初回のお届け、解約時のお取り扱いは、受付再開時にご案内します。",
    en: "Shipping days, the first month's payment and first delivery, and how cancellation is handled will be announced when sign-ups reopen.",
    es: "Los días de envío, el pago y el primer envío del primer mes, y el tratamiento de la cancelación se anunciarán al reabrir las suscripciones.",
  },
  preference: {
    maxLength: 300,
    label: { ja: "珈琲の好み・ご希望（任意）", en: "Your coffee preferences (optional)", es: "Tus preferencias de café (opcional)" },
    placeholder: {
      ja: "例：酸味が少なく、苦味のある珈琲が好きです。フルーティーな珈琲を試してみたいです。",
      en: "e.g. I like low-acidity, bitter coffee. I'd like to try something fruity.",
      es: "p. ej.: Me gusta el café poco ácido y amargo. Quiero probar algo afrutado.",
    },
    notes: {
      ja: [
        "ご記入の内容は豆選びの参考にします。必ずご希望どおりになるとは限りません。",
        "お名前・住所・電話番号・メールアドレス・カード番号などの個人情報や決済情報は書かないでください。",
        "お申し込み後も変更できます。",
      ],
      en: [
        "We use this as a guide when choosing your coffee; we cannot always match it exactly.",
        "Please do not write personal or payment details (name, address, phone, email, card number).",
        "You can change it after signing up.",
      ],
      es: [
        "Lo usamos como referencia al elegir tu café; no siempre podremos ajustarnos exactamente.",
        "No escribas datos personales ni de pago (nombre, dirección, teléfono, correo, tarjeta).",
        "Puedes cambiarlo después de suscribirte.",
      ],
    },
  },
  // For subscribers. Not available yet: shown as information only, never as working buttons.
  manage: {
    title: { ja: "ご契約後の変更", en: "After you subscribe", es: "Después de suscribirte" },
    items: {
      ja: ["配送回数の変更", "スキップ", "解約"],
      en: ["Change deliveries per month", "Skip a delivery", "Cancel"],
      es: ["Cambiar envíos al mes", "Omitir un envío", "Cancelar"],
    },
    unavailable: { ja: "受付再開時にご案内します（準備中）", en: "Available when sign-ups reopen (in preparation)", es: "Disponible al reabrir las suscripciones (en preparación)" },
    // While sign-ups are open: each item is done on the subscriber's own page (/subscription/manage).
    available: { ja: "管理ページから", en: "On your subscription page", es: "En tu página de suscripción" },
    link: { ja: "ご契約中の方：定期便の管理ページ", en: "Subscribers: your subscription page", es: "Suscriptores: tu página de suscripción" },
    apply: { ja: "お申し込み内容の確認へ進む", en: "Review and sign up", es: "Revisar y suscribirse" },
  },
};

export function subscriptionFrequency(id) {
  return COFFEE_SUBSCRIPTION.frequencies.find((f) => f.id === id) || COFFEE_SUBSCRIPTION.frequencies[0];
}

export const PRODUCT_SECTIONS = {
  ja: {
    enmaLabel: "Enma",
    enmaTitle: "閻魔",
    woodboxLabel: "Mokkan",
    woodboxTitle: "木函",
    bagLabel: "Bag Series",
    bagTitle: "袋シリーズ",
    orioriLabel: "Oriori",
    orioriTitle: "折々",
    orioriIntro: "折々の時間に寄り添う、三つの静かなサービス",
    buyButton: "購入する",
    specLabels: {
      origin: "生産地",
      producer: "生産者",
      process: "精製方法",
      variety: "品種",
      grade: "等級",
      altitude: "標高",
      drying: "乾燥方法",
      harvest: "収穫時期",
      arrival: "入港時期",
      weight: "内容量",
      price: "価格",
      flavor: "風味",
      roast: "焙煎度",
      ingredients: "原材料",
    },
  },

  en: {
    enmaLabel: "Enma",
    enmaTitle: "閻魔",
    woodboxLabel: "Mokkan",
    woodboxTitle: "木函",
    bagLabel: "Bag Series",
    bagTitle: "Bag Series",
    orioriLabel: "Oriori",
    orioriTitle: "折々",
    orioriIntro: "Three quiet services shaped for changing seasons",
    buyButton: "Buy",
    specLabels: {
      origin: "Origin",
      producer: "Producer",
      process: "Process",
      variety: "Variety",
      grade: "Grade",
      altitude: "Altitude",
      drying: "Drying",
      harvest: "Harvest",
      arrival: "Arrival",
      weight: "Weight",
      price: "Price",
      flavor: "Flavor Notes",
      roast: "Roast",
      ingredients: "Ingredients",
    },
  },

  es: {
    enmaLabel: "Enma",
    enmaTitle: "閻魔",
    woodboxLabel: "Mokkan",
    woodboxTitle: "木函",
    bagLabel: "Bag Series",
    bagTitle: "Bag Series",
    orioriLabel: "Oriori",
    orioriTitle: "折々",
    orioriIntro: "Tres servicios silenciosos para distintos momentos",
    buyButton: "Comprar",
    specLabels: {
      origin: "Origen",
      producer: "Productor",
      process: "Proceso",
      variety: "Variedad",
      grade: "Grado",
      altitude: "Altitud",
      drying: "Secado",
      harvest: "Cosecha",
      arrival: "Llegada",
      weight: "Contenido",
      price: "Precio",
      flavor: "Notas de sabor",
      roast: "Tueste",
      ingredients: "Ingredientes",
    },
  },
};

// Shown on the new beans: they are roasted after the order, not shipped at once.
// Lead time (CEO 2026-11-21, the same on src/pages/ShippingPage.jsx and the legal notice): aim for the day after the
// order, within 3 working days as a rule.
const MADE_TO_ORDER = {
  ja: "生豆入荷済み。ご注文後に焙煎・袋詰めし、通常はご注文の翌日の発送を目指して、原則3営業日以内に発送します。発送時にメールでお知らせします。",
  en: "Green beans in stock. Roasted and packed after your order; we aim to ship the next day and, as a rule, ship within 3 business days. We email you when it ships.",
  es: "Granos verdes en stock. Se tuestan y envasan tras tu pedido; intentamos enviarlo al día siguiente y, por norma, lo enviamos en 3 días hábiles. Te avisamos por correo al enviarlo.",
};

export const PRODUCT_DATA = {
  enma: [
    {
      // Promotional product (CEO 2026-11-17): the Brazil Amarelo Bourbon roasted dark. A separate SKU from the regular
      // Amarelo Bourbon below; both are roasted from the same green beans and share one lot (server/catalog.js lot).
      id: "enma-zen-dark-roast",
      image: "/images/enma-brazil.jpg", // 既存の閻魔写真を再利用
      category: "beans",
      size: "100g",
      weight: "100g",
      weightG: 120, // 焙煎豆100g + 袋・梱包の概算値
      title: { ja: "閻魔　禅の深煎り（ブラジル）", en: "ENMA Zen Dark Roast (Brazil)", es: "ENMA Tueste oscuro Zen (Brasil)" },
      summary: {
        ja: "通常版と同じブラジル アマレロブルボンを深煎りに。ナッツやチョコレートを思わせる香ばしさと、ハチミツのような甘みを方向性に、深煎りらしいコクと甘みを目指して焙煎します。",
        en: "Our Brazil Amarelo Bourbon, roasted dark. We roast toward body and sweetness, in the direction of nuts, chocolate and honey.",
        es: "Nuestro Brasil Amarelo Bourbon, con tueste oscuro. Lo tostamos buscando cuerpo y dulzor, en la línea de frutos secos, chocolate y miel.",
      },
      origin: { ja: "ブラジル サンパウロ州 ヴァレ・ダ・グラマ／ミナスジェライス州 カンポス・アルトス", en: "Vale da Grama (São Paulo) / Campos Altos (Minas Gerais), Brazil", es: "Vale da Grama (São Paulo) / Campos Altos (Minas Gerais), Brasil" },
      producer: { ja: "ヴァレ・ダ・グラマとカンポス・アルトスの小規模生産者", en: "Smallholder farmers in Vale da Grama and Campos Altos", es: "Pequeños productores de Vale da Grama y Campos Altos" },
      process: { ja: "ナチュラル", en: "Natural", es: "Natural" },
      variety: { ja: "イエローブルボン（ピーベリー）", en: "Yellow Bourbon (Peaberry)", es: "Bourbon amarillo (caracolillo)" },
      altitude: { ja: "1,000〜1,300m", en: "1,000–1,300 m", es: "1.000–1.300 m" },
      grade: { ja: "NY2/3", en: "NY2/3", es: "NY2/3" },
      arrival: { ja: "2026年3月", en: "March 2026", es: "marzo de 2026" },
      drying: { ja: "天日乾燥", en: "Sun-dried", es: "Secado al sol" },
      price: "¥1,000",
      priceNumber: 1000,
      roast: { ja: "深煎り", en: "Dark Roast", es: "Tueste oscuro" },
      // The roasting direction (CEO 2026-11-17), not yet confirmed by cupping: shown as such (flavorBasis).
      flavorNotes: { ja: ["ナッツ", "ハチミツ", "チョコレート"], en: ["Nuts", "Honey", "Chocolate"], es: ["Frutos secos", "Miel", "Chocolate"] },
      flavorBasis: "direction",
      comingSoon: false, // on sale with inventory on (sales cap per product + the shared Brazil lot)
      requiresInventory: true, // = server/catalog.js requiresInventory: "近日公開" until inventory is on
      notice: MADE_TO_ORDER,
      promo: true, // promotional bean: at most 2 bags per customer (server/catalog.js promo)
      promotion: { active: false, label: { ja: "今、飲んでほしい珈琲", en: "Coffee We Recommend Now", es: "El café que recomendamos ahora" } },
      isSoldOut: true,
    },
    {
      // Regular product (CEO 2026-11-17): the same Brazil beans, medium-dark roast.
      id: "enma-amarelo-bourbon",
      image: "/images/enma.jpg", // 既存の閻魔写真を再利用（実商品写真に要差替え）
      category: "beans",
      size: "100g",
      weight: "100g",
      weightG: 120, // 焙煎豆100g + 袋・梱包の概算値
      title: { ja: "閻魔　ブラジル アマレロブルボン", en: "ENMA Brazil Amarelo Bourbon", es: "ENMA Brasil Amarelo Bourbon" },
      summary: { ja: "ナッツやチョコレートのような香ばしさに、ハチミツのようなやさしい甘さ。", en: "Nutty and chocolatey, with a gentle honey-like sweetness.", es: "Frutos secos y chocolate, con un dulzor suave como la miel." },
      origin: { ja: "ブラジル サンパウロ州 ヴァレ・ダ・グラマ／ミナスジェライス州 カンポス・アルトス", en: "Vale da Grama (São Paulo) / Campos Altos (Minas Gerais), Brazil", es: "Vale da Grama (São Paulo) / Campos Altos (Minas Gerais), Brasil" },
      producer: { ja: "ヴァレ・ダ・グラマとカンポス・アルトスの小規模生産者", en: "Smallholder farmers in Vale da Grama and Campos Altos", es: "Pequeños productores de Vale da Grama y Campos Altos" },
      process: { ja: "ナチュラル", en: "Natural", es: "Natural" },
      variety: { ja: "イエローブルボン（ピーベリー）", en: "Yellow Bourbon (Peaberry)", es: "Bourbon amarillo (caracolillo)" },
      altitude: { ja: "1,000〜1,300m", en: "1,000–1,300 m", es: "1.000–1.300 m" },
      grade: { ja: "NY2/3", en: "NY2/3", es: "NY2/3" },
      arrival: { ja: "2026年3月", en: "March 2026", es: "marzo de 2026" },
      drying: { ja: "天日乾燥", en: "Sun-dried", es: "Secado al sol" },
      price: "¥1,300",
      priceNumber: 1300,
      roast: { ja: "中深煎り", en: "Medium-Dark Roast", es: "Tueste medio-oscuro" },
      flavorNotes: { ja: ["ナッツ","ハチミツ","チョコレート"], en: ["Nuts","Honey","Chocolate"], es: ["Frutos secos","Miel","Chocolate"] },
      comingSoon: false, // on sale with inventory on (sales cap per product + the shared Brazil lot)
      requiresInventory: true, // = server/catalog.js requiresInventory: "近日公開" until inventory is on
      notice: MADE_TO_ORDER,
      isSoldOut: true,
    },
    {
      id: "enma-jimma",
      image: "/images/enma-3.jpg", // 既存の閻魔写真を再利用
      category: "beans",
      size: "100g",
      weight: "100g",
      weightG: 120, // 焙煎豆100g + 袋・梱包の概算値
      title: { ja: "閻魔　エチオピア ジンマ", en: "ENMA Ethiopia Jimma", es: "ENMA Etiopía Jimma" },
      summary: { ja: "柑橘やオレンジのような明るい酸味と、ハチミツのような甘さ。", en: "Bright citrus and orange, with a honey-like sweetness.", es: "Cítricos y naranja luminosos, con un dulzor como la miel." },
      origin: { ja: "エチオピア オロミア州 ジンマ ゲラ村", en: "Gera Village, Jimma, Oromia, Ethiopia", es: "Aldea de Gera, Jimma, Oromía, Etiopía" },
      producer: { ja: "地域の小規模生産者 約500世帯", en: "Approximately 500 local smallholder families", es: "Unas 500 familias de pequeños productores locales" },
      process: { ja: "ウォッシュド", en: "Washed", es: "Lavado" },
      variety: { ja: "エチオピア在来種（エアルーム）", en: "Ethiopian Heirloom", es: "Variedades nativas etíopes (heirloom)" },
      altitude: { ja: "1,900〜2,100m", en: "1,900–2,100 m", es: "1.900–2.100 m" },
      grade: { ja: "G1", en: "G1", es: "G1" },
      arrival: { ja: "2025年5月", en: "May 2025", es: "mayo de 2025" },
      drying: { ja: "アフリカンベッド（高床式の棚）で乾燥", en: "African raised beds", es: "Camas africanas elevadas" },
      price: "¥1,500",
      priceNumber: 1500,
      roast: { ja: "浅煎り", en: "Light Roast", es: "Tueste claro" },
      flavorNotes: { ja: ["シトラス","オレンジ","ハチミツ"], en: ["Citrus","Orange","Honey"], es: ["Cítricos","Naranja","Miel"] },
      comingSoon: false, // on sale with inventory on (sales cap per product)
      requiresInventory: true, // = server/catalog.js requiresInventory: "近日公開" until inventory is on
      notice: MADE_TO_ORDER,
      isSoldOut: false,
    },
    {
      id: "enma-quequesques",
      image: "/images/enma-kenya.jpg", // 既存の閻魔写真を再利用
      category: "beans",
      size: "100g",
      weight: "100g",
      weightG: 120, // 焙煎豆100g + 袋・梱包の概算値
      title: { ja: "閻魔　グアテマラ ケケスケス", en: "ENMA Guatemala Quequesques", es: "ENMA Guatemala Quequesques" },
      summary: { ja: "青りんごや柑橘のような爽やかさに、ブラウンシュガーのような甘さ。", en: "Fresh green apple and citrus, with brown-sugar sweetness.", es: "Manzana verde y cítricos frescos, con dulzor de azúcar moreno." },
      origin: { ja: "グアテマラ サン・フアン・サカテペケス", en: "San Juan Sacatepéquez, Guatemala", es: "San Juan Sacatepéquez, Guatemala" },
      producer: { ja: "ケケスケス農園の生産者", en: "Quequesques Farm growers", es: "Productores de la finca Quequesques" },
      process: { ja: "ウォッシュド", en: "Washed", es: "Lavado" },
      variety: { ja: "ブルボン、カトゥーラ、カトゥアイ", en: "Bourbon, Caturra, Catuai", es: "Bourbon, Caturra, Catuai" },
      altitude: { ja: "1,500m", en: "1,500 m", es: "1.500 m" },
      grade: { ja: "SHB", en: "SHB", es: "SHB" },
      arrival: { ja: "2026年7月", en: "July 2026", es: "julio de 2026" },
      drying: { ja: "天日乾燥", en: "Sun-dried", es: "Secado al sol" },
      price: "¥1,000",
      priceNumber: 1000,
      roast: { ja: "浅煎り", en: "Light Roast", es: "Tueste claro" },
      flavorNotes: { ja: ["グリーンアップル","シトラス","ブラウンシュガー"], en: ["Green Apple","Citrus","Brown Sugar"], es: ["Manzana verde","Cítricos","Azúcar moreno"] },
      comingSoon: false, // on sale with inventory on (sales cap per product)
      requiresInventory: true, // = server/catalog.js requiresInventory: "近日公開" until inventory is on
      notice: MADE_TO_ORDER,
      isSoldOut: false,
    },
    {
      id: "enma-andes-blue",
      image: "/images/enma-1.jpg", // 既存の閻魔写真を再利用
      category: "beans",
      size: "100g",
      weight: "100g",
      weightG: 120, // 焙煎豆100g + 袋・梱包の概算値
      title: { ja: "閻魔　ペルー アンデスブルー", en: "ENMA Peru Andes Blue", es: "ENMA Perú Andes Blue" },
      summary: { ja: "柑橘の軽やかさに、ナッツやキャラメルのような香ばしい甘さ。", en: "Light citrus, with a nutty, caramel-like sweetness.", es: "Cítricos ligeros, con un dulzor de frutos secos y caramelo." },
      origin: { ja: "ペルー カハマルカ県 クテルボ ラ・カピージャ", en: "La Capilla, Cutervo, Cajamarca, Peru", es: "La Capilla, Cutervo, Cajamarca, Perú" },
      producer: { ja: "ラ・カピージャの小規模生産者", en: "Smallholder farmers in La Capilla", es: "Pequeños productores de La Capilla" },
      process: { ja: "ウォッシュド", en: "Washed", es: "Lavado" },
      variety: { ja: "カトゥーラ、ティピカ、カティモール、パチェ ほか", en: "Caturra, Typica, Catimor, Pache and others", es: "Caturra, Typica, Catimor, Pache y otras" },
      altitude: { ja: "1,500〜2,000m", en: "1,500–2,000 m", es: "1.500–2.000 m" },
      grade: { ja: "G1", en: "G1", es: "G1" },
      arrival: { ja: "2025年11月", en: "November 2025", es: "noviembre de 2025" },
      drying: { ja: "パティオで天日乾燥", en: "Patio sun-dried", es: "Secado al sol en patio" },
      price: "¥1,500",
      priceNumber: 1500,
      roast: { ja: "浅煎り", en: "Light Roast", es: "Tueste claro" },
      flavorNotes: { ja: ["シトラス","ナッツ","キャラメル"], en: ["Citrus","Nuts","Caramel"], es: ["Cítricos","Frutos secos","Caramelo"] },
      comingSoon: false, // on sale with inventory on (sales cap per product)
      requiresInventory: true, // = server/catalog.js requiresInventory: "近日公開" until inventory is on
      notice: MADE_TO_ORDER,
      promotion: { active: true, label: { ja: "今、飲んでほしい珈琲", en: "Coffee We Recommend Now", es: "El café que recomendamos ahora" } },
      isSoldOut: false,
    },
    {
      id: "enma-karamo",
      image: "/images/enma-2.jpg", // 既存の閻魔写真を再利用
      category: "beans",
      size: "100g",
      weight: "100g",
      weightG: 120, // 焙煎豆100g + 袋・梱包の概算値
      title: { ja: "閻魔　エチオピア カラモ", en: "ENMA Ethiopia Karamo", es: "ENMA Etiopía Karamo" },
      summary: { ja: "赤ぶどうや白桃、ダークチェリーを思わせる、華やかな果実の風味。", en: "A vivid fruit character reminiscent of red grape, white peach and dark cherry.", es: "Un carácter frutal vivo que recuerda a uva roja, melocotón blanco y cereza oscura." },
      origin: { ja: "エチオピア シダマ州 ブラ カラモ", en: "Karamo, Bura, Sidama, Ethiopia", es: "Karamo, Bura, Sidama, Etiopía" },
      producer: { ja: "ニグセ・ゲメダ氏と地域の小規模生産者", en: "Nigusse Gemeda and local smallholder producers", es: "Nigusse Gemeda y pequeños productores locales" },
      process: { ja: "ナチュラル", en: "Natural", es: "Natural" },
      variety: { ja: "74158", en: "74158", es: "74158" },
      altitude: { ja: "2,320〜2,400m", en: "2,320–2,400 m", es: "2.320–2.400 m" },
      grade: { ja: "G1", en: "G1", es: "G1" },
      harvest: { ja: "2025年12月〜2026年2月（2025/26年クロップ）", en: "Dec 2025 – Feb 2026 (2025/26 crop)", es: "dic. 2025 – feb. 2026 (cosecha 2025/26)" },
      roast: { ja: "浅煎り", en: "Light Roast", es: "Tueste claro" },
      flavorNotes: { ja: ["赤ぶどう", "白桃", "ダークチェリー"], en: ["Red Grape", "White Peach", "Dark Cherry"], es: ["Uva roja", "Melocotón blanco", "Cereza oscura"] },
      price: "¥1,800",
      priceNumber: 1800,
      comingSoon: false,
      isSoldOut: false,
    },
    {
      id: "enma-kindiio",
      image: "/images/enma-colombia.jpg", // 既存の閻魔写真を再利用
      category: "beans",
      size: "100g",
      weight: "100g",
      weightG: 120, // 焙煎豆100g + 袋・梱包の概算値
      title: { ja: "閻魔　コロンビア キンディオ", en: "ENMA Colombia Kindiio", es: "ENMA Colombia Kindiio" },
      summary: { ja: "桃のような果実感と、ココナッツの心地よい甘さ。", en: "Peach-like fruit with a pleasant coconut sweetness.", es: "Fruta como el melocotón, con un agradable dulzor de coco." },
      origin: { ja: "コロンビア キンディオ県", en: "Quindío, Colombia", es: "Quindío, Colombia" },
      process: { ja: "インフューズドハニー", en: "Infused Honey", es: "Honey infusionado" },
      variety: { ja: "カスティージョ", en: "Castillo", es: "Castillo" },
      altitude: { ja: "1,400〜1,450m", en: "1,400–1,450 m", es: "1.400–1.450 m" },
      arrival: { ja: "2026年1月（仕入れ先への入港）", en: "January 2026 (supplier arrival)", es: "enero de 2026 (llegada al proveedor)" },
      roast: { ja: "浅煎り", en: "Light Roast", es: "Tueste claro" },
      flavorNotes: { ja: ["桃", "ココナッツ", "ハチミツ"], en: ["Peach", "Coconut", "Honey"], es: ["Melocotón", "Coco", "Miel"] },
      price: "¥2,050",
      priceNumber: 2050,
      comingSoon: false,
      isSoldOut: false,
    },
    {
      // Listed with the Enma beans (CEO 2026-11-17).
      id: "enma-coffee-bag",
      image: "/images/enma-coffeebag.jpg",
      category: "bag",
      size: "8個入り",
      weightG: 100, // ドリップバッグ8個入り
      title: {
        ja: "閻魔 珈琲袋",
        en: "ENMA Coffee Bag",
        es: "ENMA Coffee Bag",
      },
      modalTitle: {
        ja: "閻魔 珈琲袋",
        en: "ENMA Coffee Bag",
        es: "ENMA Coffee Bag",
      },
      summary: {
        ja: "急須も、ミルも、必要ない。お湯を注ぐだけで、閻魔が整う。",
        en: "No grinder. No fuss. Just hot water, and Enma is ready.",
        es: "Sin molinillo. Sin complicaciones. Solo agua caliente, y Enma está listo.",
      },
      weight: { ja: "8個入り", en: "8 bags", es: "8 bolsitas" },
      price: "¥2,400",
      priceNumber: 2400,
      brew: {
        ja: [
          "160mlのお湯をゆっくりと注ぎ、約2分。",
          "香りが立ち上がるのを、静かに待つ。",
          "味が薄い場合は、スプーンで数回押すと深みが増します。",
        ],
        en: [
          "Slowly pour 160ml of hot water. Wait about 2 minutes.",
          "Let the aroma rise in silence.",
          "If the flavor is light, press gently with a spoon a few times.",
        ],
        es: [
          "Vierte despacio 160ml de agua caliente. Espera unos 2 minutos.",
          "Deja que el aroma se eleve en silencio.",
          "Si el sabor es suave, presiona suavemente con una cuchara.",
        ],
      },
      isSoldOut: false,
    }
  ],

  woodbox: [
    {
      id: "woodbox-geisha",
      archived: true, // 茶の木函へ切り替えるまで販売・AI案内から除外
      image: "/images/woodbox-2.jpg",
      category: "woodbox",
      size: "100g",
      weightG: 170, // 内容量100g + 木函・包装で約170g
      title: {
        ja: "木函　ホンジュラス　ゲイシャ",
        en: "WOOD BOX Honduras Geisha",
        es: "WOOD BOX Honduras Geisha",
      },
      modalTitle: {
        ja: "木函　ホンジュラス\nゲイシャ",
        en: "WOOD BOX Honduras\nGeisha",
        es: "WOOD BOX Honduras\nGeisha",
      },
      weight: "100g",
      price: "¥2,600",
      priceNumber: 2600,
      flavor:
        "Floral, Earl Grey, Stone Fruit, Pear, Honey, Bright Acidity, Round Mouthfeel, Elegant",
      isSoldOut: false,
    },
    {
      id: "woodbox-ecuador",
      archived: true, // 木函の珈琲販売を一時停止
      image: "/images/woodbox-ecuador.jpg",
      category: "woodbox",
      size: "100g",
      weightG: 170,
      title: {
        ja: "木函　エクアドル　シドラ",
        en: "WOOD BOX Ecuador Sidra",
        es: "WOOD BOX Ecuador Sidra",
      },
      modalTitle: {
        ja: "木函　エクアドル\nシドラ",
        en: "WOOD BOX Ecuador\nSidra",
        es: "WOOD BOX Ecuador\nSidra",
      },
      summary: {
        ja: "希少品種シドラの複雑で豊かな風味",
        en: "Complex and rich flavors of the rare Sidra variety",
        es: "Sabores complejos y ricos de la variedad rara Sidra",
      },
      origin: "Loja, Ecuador",
      producer: "Vinka Farm",
      process: "Anaerobic Natural",
      variety: "Sidra",
      altitude: "1,660m",
      weight: "100g",
      price: "¥3,000",
      priceNumber: 3000,
      flavor: "Raisin, Red Wine, Grape, Cacao",
      isSoldOut: false,
    },
    {
      id: "mokkan-oku-yame-hojicha",
      image: "/images/mokkan-oku-yame-hojicha.jpg", // 実写（CEO 撮影 IMG_5480、無加工。HEIC→JPEG の形式変換と位置情報の削除のみ）
      category: "woodbox",
      size: "30g",
      weight: { ja: "30g", en: "30 g", es: "30 g" },
      weightG: 120, // 木函81.2g＋お茶30g＋予備5g＝116.2g → 暫定120g（梱包材は実測待ち）
      title: {
        ja: "木函　奥八女ほうじ茶",
        en: "Mokkan Oku-Yame Hojicha",
        es: "Mokkan Hojicha de Oku-Yame",
      },
      summary: {
        ja: "八女産の一番茶（やぶきた）を浅く焙じたほうじ茶。カシスやカカオを思わせる香りと、フルーティーな甘み。浅焙煎ならではの心地よい余韻が続きます。",
        en: "Hojicha of first-flush Yame tea (Yabukita), lightly roasted: an aroma reminiscent of cassis and cacao, a fruity sweetness and the gentle finish of a light roast.",
        es: "Hojicha de primera cosecha de Yame (Yabukita), con tostado ligero: aroma que recuerda a la grosella negra y el cacao, dulzor afrutado y el final suave de un tostado ligero.",
      },
      roast: { ja: "浅焙煎", en: "Light roast", es: "Tostado ligero" },
      flavorNotes: { ja: ["カシス", "カカオ", "フルーティーな甘み"], en: ["Cassis", "Cacao", "Fruity sweetness"], es: ["Grosella negra", "Cacao", "Dulzor afrutado"] },
      flavorBasis: "tea",
      ingredients: { ja: "ほうじ茶", en: "Hojicha (roasted green tea)", es: "Hojicha (té verde tostado)" },
      // CEO 2026-11-17: until it is confirmed which farm's leaves these teas use, show the region only (no producer
      // or farm). Not published either: a founding year, trading relationships, certification or award claims.
      origin: { ja: "福岡県八女市", en: "Yame, Fukuoka, Japan", es: "Yame, Fukuoka, Japón" },
      variety: { ja: "やぶきた", en: "Yabukita", es: "Yabukita" },
      brewing: {
        hot: { leafG: [3, 5], waterMl: 200, tempC: [80], steepsSec: [30, 10, 60] },
        cold: { leafG: [10], waterL: 1, hours: [4, 8] },
      },
      price: "¥2,800",
      priceNumber: 2800,
      comingSoon: false, // CEO 2026-11-20: 販売再開（各5個まで。inventory/{sku} で上限を管理）
      isSoldOut: false,
    },
    {
      id: "mokkan-oku-yame-genmaicha",
      image: "/images/mokkan-oku-yame-genmaicha.jpg", // 実写（CEO 撮影 IMG_5479、無加工。HEIC→JPEG の形式変換と位置情報の削除のみ）
      category: "woodbox",
      size: "30g",
      weight: { ja: "30g", en: "30 g", es: "30 g" },
      weightG: 120, // 木函81.2g＋お茶30g＋予備5g＝116.2g → 暫定120g（梱包材は実測待ち）
      title: {
        ja: "木函　奥八女玄米茶",
        en: "Mokkan Oku-Yame Genmaicha",
        es: "Mokkan Genmaicha de Oku-Yame",
      },
      summary: {
        ja: "やぶきたの煎茶に、抹茶と炒り玄米を合わせた玄米茶。炒り玄米の香ばしさと若草のような爽やかさ、煎茶の軽やかさに抹茶の旨味が重なります。",
        en: "Genmaicha of Yabukita sencha with matcha and roasted brown rice: toasty rice, a fresh young-grass note, light sencha and the umami of matcha.",
        es: "Genmaicha de sencha Yabukita con matcha y arroz integral tostado: arroz tostado, un frescor de hierba joven, la ligereza del sencha y el umami del matcha.",
      },
      flavorNotes: { ja: ["炒り玄米の香ばしさ", "若草の爽やかさ", "抹茶の旨味"], en: ["Toasted rice", "Fresh young grass", "Matcha umami"], es: ["Arroz tostado", "Hierba joven", "Umami del matcha"] },
      flavorBasis: "tea",
      ingredients: { ja: "煎茶・抹茶・炒り玄米", en: "Sencha, matcha, roasted brown rice", es: "Sencha, matcha, arroz integral tostado" },
      // CEO 2026-11-17: until it is confirmed which farm's leaves these teas use, show the region only (no producer
      // or farm). Not published either: a founding year, trading relationships, certification or award claims.
      origin: { ja: "福岡県八女市", en: "Yame, Fukuoka, Japan", es: "Yame, Fukuoka, Japón" },
      variety: { ja: "やぶきた", en: "Yabukita", es: "Yabukita" },
      brewing: {
        hot: { leafG: [3, 5], waterMl: 200, tempC: [70, 80], steepsSec: [40, 10, 60] },
        cold: { leafG: [15], waterL: 1, hours: [3, 4] },
      },
      price: "¥2,800",
      priceNumber: 2800,
      comingSoon: false, // CEO 2026-11-20: 販売再開（各5個まで。inventory/{sku} で上限を管理）
      isSoldOut: false,
    },
  ],

  // Hidden from the product list for now (CEO 2026-11-17); the data stays.
  bag: [
    {
      id: "woodbox-tea-bag",
      hidden: true,
      image: "/images/woodbox-hojicha.jpg",
      category: "tea-bag",
      size: "8個入り",
      weightG: 120, // 木函ほうじ茶袋8個入り
      title: {
        ja: "木函 ほうじ茶袋",
        en: "WOOD BOX Hojicha Bag",
        es: "WOOD BOX Hojicha Bag",
      },
      modalTitle: {
        ja: "木函 ほうじ茶袋",
        en: "WOOD BOX Hojicha Bag",
        es: "WOOD BOX Hojicha Bag",
      },
      summary: {
        ja: "珈琲の余韻の中に、ふと茶を。木函に収めた、静かな一服。",
        en: "Between coffees, a quiet moment of tea. Housed in wood.",
        es: "Entre cafés, un momento tranquilo de té. Guardado en madera.",
      },
      weight: { ja: "8個入り", en: "8 bags", es: "8 bolsitas" },
      price: "¥2,800",
      priceNumber: 2800,
      brew: {
        ja: [
          "200mlのお湯を注ぎ、約1分。",
          "二煎目は同じお湯で約10秒。香りが変わる。",
          "三煎目もまた、10秒ほど。最後の一滴まで。",
        ],
        en: [
          "Pour 200ml of hot water and steep for about 1 minute.",
          "Second brew: same water, about 10 seconds. The aroma shifts.",
          "Third brew: another 10 seconds. Until the last drop.",
        ],
        es: [
          "Vierte 200ml de agua caliente e infusiona durante 1 minuto.",
          "Segunda infusión: misma agua, unos 10 segundos. El aroma cambia.",
          "Tercera infusión: otros 10 segundos. Hasta la última gota.",
        ],
      },
      isSoldOut: false,
    },
  ],

  oriori: [
    {
      id: "enma-cookie",
      image: "/images/enma-cookie.jpg",
      category: "cookie",
      comingSoon: true,
      weight: "1袋（2枚入り）",
      title: {
        ja: "閻魔クッキー",
        en: "Enma Cookie",
        es: "Enma Cookie",
      },
      modalTitle: {
        ja: "閻魔クッキー",
        en: "Enma Cookie",
        es: "Enma Cookie",
      },
      summary: {
        ja: "円応寺と歩む、静かな甘さのひととき",
        en: "A quiet sweetness, shaped alongside Ennoji Temple",
        es: "Un dulce silencioso, junto al templo Ennoji",
      },
    },
    {
      id: "oriori-subscription",
      category: "subscription",
      image: "/images/oriori-1.jpg",
      // The wording lives in COFFEE_SUBSCRIPTION below (one place to edit).
      title: COFFEE_SUBSCRIPTION.name,
      modalTitle: COFFEE_SUBSCRIPTION.name,
      summary: COFFEE_SUBSCRIPTION.cardSummary,
      subscription: COFFEE_SUBSCRIPTION,
    },
    {
  id: "oriori-apps",
  image: "/images/oriori.wheel.jpg",
  title: {
    ja: "Ryuge Apps",
    en: "Ryuge Apps",
    es: "Ryuge Apps",
  },
  modalTitle: {
    ja: "Ryuge Apps",
    en: "Ryuge Apps",
    es: "Ryuge Apps",
  },
  summary: {
    ja: "味わいを記録し、遊ぶための小さなウェブアプリ",
    en: "Small web apps for tasting, recording, and playing with coffee",
    es: "Pequeñas aplicaciones web para saborear, registrar y jugar con el café",
  },
  description: {
    ja: "フレーバーホイール、珈琲品種診断など、コーヒーを少し違う角度から楽しむための小さなアプリをまとめています。",
    en: "A small collection of coffee apps, including the Flavor Coffee Wheel and What Coffee Are You?",
    es: "Una pequeña colección de apps de café, incluyendo Flavor Coffee Wheel y What Coffee Are You?",
  },
  apps: [
  {
    title: {
      ja: "Flavor Coffee Wheel",
      en: "Flavor Coffee Wheel",
      es: "Flavor Coffee Wheel",
    },
    text: {
      ja: "味わいを記録し、コメントとともに保存できるテイスティングアプリ。",
      en: "A tasting app for selecting coffee flavors and saving them with your notes.",
      es: "Una aplicación de cata para seleccionar sabores del café y guardarlos con tus notas.",
    },
    buttonLabel: {
      ja: "アプリを開く",
      en: "Open App",
      es: "Abrir app",
    },
    url: "https://flavorcoffeewheel.com",
  },
  {
    title: {
      ja: "珈琲品種性格診断",
      en: "What Coffee Are You?",
      es: "¿Qué café eres?",
    },
    text: {
      ja: "あなたの性格をコーヒー品種にたとえる小さな診断アプリ。",
      en: "A small personality quiz that matches you with a coffee variety.",
      es: "Un pequeño test de personalidad que te compara con una variedad de café.",
    },
    buttonLabel: {
      ja: "診断する",
      en: "Take the Quiz",
      es: "Hacer el test",
    },
    url: "https://whatcoffeeareyou.com",
  },
  {
    title: {
      ja: "珈琲おみくじ",
      en: "Coffee Fortune",
      es: "Fortuna del Café",
    },
    text: {
      ja: "今日の気分にそっと寄り添う、龍華珈琲の小さなおみくじアプリ。",
      en: "A small coffee fortune app from Ryuge Coffee, made for your day.",
      es: "Una pequeña app de fortuna del café de Ryuge Coffee para acompañar tu día.",
    },
    buttonLabel: {
      ja: "おみくじを引く",
      en: "Draw a Fortune",
      es: "Sacar la fortuna",
    },
    url: "https://coffeeomikuji.com",
  },
],
},
  ],
};