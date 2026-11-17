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
    teaDetails: "産地・茶葉",
    howToBrew: "淹れ方", quantity: "数量", addToCart: "カートに入れる", back: "戻る", close: "閉じる",
    promoNote: "プロモーション豆：お一人様2袋まで",
  },
  en: {
    beanDetails: "About the beans", productDetails: "Product details", flavor: "Flavor notes",
    flavorSource: "Flavor notes are based on the supplier's information. Roast and brewing change how they come through.",
    roastScale: ["Light", "Medium", "Medium-Dark", "Dark"],
    roastGuide: "Lighter roasts tend to bring fruity acidity and aroma; darker roasts, bitterness and body.",
    flavorDirection: "These notes are the direction we roast toward; they have not been confirmed by cupping yet, so the cup may differ.",
    teaDetails: "Origin and tea",
    howToBrew: "How to Brew", quantity: "Quantity", addToCart: "Add to cart", back: "Back", close: "Close",
    promoNote: "Promotional beans: up to 2 bags per customer",
  },
  es: {
    beanDetails: "Sobre el grano", productDetails: "Detalles del producto", flavor: "Notas de sabor",
    flavorSource: "Las notas de sabor se basan en la información del proveedor. El tueste y la preparación cambian cómo se perciben.",
    roastScale: ["Claro", "Medio", "Medio-oscuro", "Oscuro"],
    roastGuide: "Los tuestes claros suelen dar acidez frutal y aroma; los oscuros, amargor y cuerpo.",
    flavorDirection: "Estas notas son la dirección del tueste; aún no se han confirmado en cata, así que la taza puede variar.",
    teaDetails: "Origen y té",
    howToBrew: "Preparación", quantity: "Cantidad", addToCart: "Añadir al carrito", back: "Volver", close: "Cerrar",
    promoNote: "Granos promocionales: máx. 2 bolsas por cliente",
  },
};

// Position on the 4-step roast scale, from the product's English roast name.
export const ROAST_LEVEL = { "Light Roast": 0, "Medium Roast": 1, "Medium-Dark Roast": 2, "Dark Roast": 3 };

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
      tea: "茶葉",
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
      tea: "Tea",
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
      tea: "Té",
    },
  },
};

// Shown on the new beans: they are roasted after the order, not shipped at once.
// Lead time: the store's usual 3–7 business days (src/pages/ShippingPage.jsx, the legal notice).
const MADE_TO_ORDER = {
  ja: "生豆入荷済み。ご注文後に焙煎・袋詰めし、通常3〜7営業日以内に発送します（土日を除く）。発送時にメールでお知らせします。",
  en: "Green beans in stock. Roasted and packed after your order, and usually shipped within 3–7 business days (not on weekends). We email you when it ships.",
  es: "Granos verdes en stock. Se tuestan y envasan tras tu pedido y se envían normalmente en 3–7 días hábiles (sin fines de semana). Te avisamos por correo al enviarlo.",
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
      promotion: { active: true, label: { ja: "プロモ・お一人様2袋まで", en: "Promo · max 2 per customer", es: "Promo · máx. 2 por cliente" } },
      isSoldOut: false,
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
      isSoldOut: false,
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
      price: "¥1,500",
      priceNumber: 1500,
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
      image: "/images/woodbox-hojicha.jpg", // 既存の茶ギフト画像。実商品写真が揃ったら差替える
      category: "woodbox",
      size: "30g",
      weight: { ja: "30g", en: "30 g", es: "30 g" },
      weightG: 100, // 木函・梱包込みの配送重量は要実測
      title: {
        ja: "木函　奥八女ほうじ茶",
        en: "Mokkan Oku-Yame Hojicha",
        es: "Mokkan Hojicha de Oku-Yame",
      },
      summary: {
        ja: "八女産の一番茶を浅く焙じたほうじ茶。浅焙煎ならではの芳ばしさと、果実を思わせる甘み。木函に収めた贈り物です。",
        en: "Hojicha of first-flush Yame tea, lightly roasted: a gentle roasted aroma and a sweetness reminiscent of fruit. Presented in a wooden box.",
        es: "Hojicha de primera cosecha de Yame, con tostado ligero: aroma tostado suave y un dulzor que recuerda a la fruta. En caja de madera.",
      },
      roast: { ja: "浅焙煎", en: "Light roast", es: "Tostado ligero" },
      tea: { ja: "八女産 一番茶", en: "First-flush tea from Yame", es: "Té de primera cosecha de Yame" },
      producer: { ja: "原島農園", en: "Harashima Farm", es: "Granja Harashima" },
      origin: { ja: "福岡県 奥八女", en: "Oku-Yame, Fukuoka, Japan", es: "Oku-Yame, Fukuoka, Japón" },
      price: "¥2,800",
      priceNumber: 2800,
      comingSoon: true, // CEO 2026-11-15: 配送重量の実測と販売開始の判断まで準備中
      isSoldOut: false,
    },
    {
      id: "mokkan-oku-yame-genmaicha",
      image: "/images/woodbox.jpg", // 仮の木函イメージ。玄米茶の実商品写真に要差替え
      category: "woodbox",
      size: "30g",
      weight: { ja: "30g", en: "30 g", es: "30 g" },
      weightG: 100, // 木函・梱包込みの配送重量は要実測
      title: {
        ja: "木函　奥八女玄米茶",
        en: "Mokkan Oku-Yame Genmaicha",
        es: "Mokkan Genmaicha de Oku-Yame",
      },
      summary: {
        ja: "煎茶に抹茶と炒り玄米を合わせた玄米茶。炒り玄米の香ばしい香りと、煎茶・抹茶の旨味。木函に収めた贈り物です。",
        en: "Genmaicha of sencha with matcha and roasted brown rice: the toasty aroma of the rice and the umami of sencha and matcha. Presented in a wooden box.",
        es: "Genmaicha de sencha con matcha y arroz integral tostado: el aroma tostado del arroz y el umami del sencha y el matcha. En caja de madera.",
      },
      tea: { ja: "煎茶・抹茶・炒り玄米", en: "Sencha, matcha, roasted brown rice", es: "Sencha, matcha, arroz integral tostado" },
      producer: { ja: "原島農園", en: "Harashima Farm", es: "Granja Harashima" },
      origin: { ja: "福岡県 奥八女", en: "Oku-Yame, Fukuoka, Japan", es: "Oku-Yame, Fukuoka, Japón" },
      price: "¥2,800",
      priceNumber: 2800,
      comingSoon: true, // CEO 2026-11-15: 配送重量の実測と販売開始の判断まで準備中
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
      size: "100g",
      image: "/images/oriori-1.jpg",
      title: {
        ja: "定期便",
        en: "Subscription",
        es: "Suscripción",
      },
      summary: {
        ja: "季節に寄り添う定期便",
        en: "A recurring delivery shaped by the season",
        es: "Una entrega periódica marcada por la estación",
      },

      plans: {
        ja: [
          {
            id: "coffee-bag",
            name: "珈琲袋定期便",
            badge: null,
            lead: "手軽に本格コーヒー",
            price: "¥2,000",
            priceNumber: 2000,
            frequency: "月1回",
            shipping: "送料込み",
            items: ["閻魔 珈琲袋 ×8"],
            note: "急須も、ミルも、必要ない。お湯を注ぐだけで、一杯が整う。毎月8個をお届けします。",
            button: "珈琲袋定期便を選ぶ",
          },
          {
            id: "mame",
            name: "豆の定期便",
            badge: "一番人気",
            lead: "その月の閻魔を届ける",
            price: "¥1,700",
            priceNumber: 1700,
            frequency: "月1回",
            shipping: "送料込み",
            items: ["閻魔 180g（季節のランダム）"],
            note: "その月に最もふさわしい焙煎の閻魔をお届けします。豆の種類はお楽しみに。",
            button: "豆の定期便を選ぶ",
          },
          {
            id: "zen",
            name: "禅の仕立て便",
            badge: null,
            lead: "珈琲とお茶、静かな余白",
            price: "¥3,300",
            priceNumber: 3300,
            frequency: "月1回",
            shipping: "送料込み",
            items: ["珈琲袋 ×8", "一煎袋 ×8"],
            note: "珈琲とお茶、どちらにも通底する禅の余白を静かに楽しむための特別な定期便。鎌倉の空気感をそのままご自宅で。",
            button: "禅の仕立て便を選ぶ",
          },
        ],

        en: [
          {
            id: "coffee-bag",
            name: "Coffee Bag Subscription",
            badge: null,
            lead: "Specialty coffee, simply",
            price: "¥2,000",
            priceNumber: 2000,
            frequency: "Monthly",
            shipping: "Shipping included",
            items: ["ENMA Coffee Sachet ×8"],
            note: "No grinder, no fuss. Just pour hot water and Enma is ready. Eight bags delivered every month.",
            button: "Choose Coffee Bag",
          },
          {
            id: "mame",
            name: "Bean Subscription",
            badge: "Most Selected",
            lead: "This month's ENMA",
            price: "¥1,700",
            priceNumber: 1700,
            frequency: "Monthly",
            shipping: "Shipping included",
            items: ["ENMA 180g (seasonal rotation)"],
            note: "We select the roast of ENMA best suited to the season. The variety is a quiet surprise each month.",
            button: "Choose Bean Subscription",
          },
          {
            id: "zen",
            name: "Zen Selection",
            badge: null,
            lead: "Coffee and tea, in stillness",
            price: "¥3,300",
            priceNumber: 3300,
            frequency: "Monthly",
            shipping: "Shipping included",
            items: ["Coffee Sachet ×8", "Hojicha Sachet ×8"],
            note: "A special monthly set to quietly explore the stillness shared by coffee and tea. The atmosphere of Kamakura, delivered to your home.",
            button: "Choose Zen Selection",
          },
        ],

        es: [
          {
            id: "coffee-bag",
            name: "Suscripción de Coffee Bags",
            badge: null,
            lead: "Café especial, sin complicaciones",
            price: "¥2,000",
            priceNumber: 2000,
            frequency: "Mensual",
            shipping: "Envío incluido",
            items: ["ENMA Coffee Sachet ×8"],
            note: "Sin molinillo, sin complicaciones. Solo agua caliente y Enma está listo. Ocho bolsas entregadas cada mes.",
            button: "Elegir Coffee Bags",
          },
          {
            id: "mame",
            name: "Suscripción de Granos",
            badge: "Más elegido",
            lead: "El ENMA de este mes",
            price: "¥1,700",
            priceNumber: 1700,
            frequency: "Mensual",
            shipping: "Envío incluido",
            items: ["ENMA 180g (rotación estacional)"],
            note: "Seleccionamos el tueste de ENMA más adecuado para la estación. La variedad es una sorpresa tranquila cada mes.",
            button: "Elegir Suscripción de Granos",
          },
          {
            id: "zen",
            name: "Selección Zen",
            badge: null,
            lead: "Café y té, en quietud",
            price: "¥3,300",
            priceNumber: 3300,
            frequency: "Mensual",
            shipping: "Envío incluido",
            items: ["Coffee Sachet ×8", "Hojicha Sachet ×8"],
            note: "Un conjunto mensual especial para explorar en silencio la calma compartida entre el café y el té. El ambiente de Kamakura, entregado en casa.",
            button: "Elegir Selección Zen",
          },
        ],
      },

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