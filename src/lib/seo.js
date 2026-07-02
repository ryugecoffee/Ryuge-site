// SEO ユーティリティ
// - ルートごとの document.title / meta description 更新
// - 商品ページの JSON-LD 構造化データ注入(Google は JS 実行後の JSON-LD を認識する)

import { PRODUCT_DATA } from "../productData";

const SITE_URL = "https://ryuge.biz";

const PAGE_META = {
  "/": {
    title: "Ryuge Coffee | 鎌倉の自家焙煎コーヒー 龍華珈琲",
    description:
      "鎌倉の珈琲ブランド 龍華珈琲。自家焙煎のスペシャルティコーヒー豆・珈琲袋・定期便をオンラインでお届けします。",
  },
  "/products": {
    title: "商品一覧 | Ryuge Coffee 龍華珈琲 - コーヒー豆・定期便の通販",
    description:
      "閻魔・木函シリーズのスペシャルティコーヒー豆、珈琲袋、ほうじ茶袋、定期便「折々」。鎌倉から全国へお届け。2個以上で送料無料。",
  },
  "/shipping": {
    title: "配送について | Ryuge Coffee 龍華珈琲",
    description: "龍華珈琲の配送・送料のご案内。2個以上のご注文と定期便は送料無料です。",
  },
  "/access": {
    title: "アクセス | Ryuge Coffee 龍華珈琲 - 鎌倉",
    description: "鎌倉の龍華珈琲へのアクセスのご案内。",
  },
  "/legal": { title: "特定商取引法に基づく表記 | Ryuge Coffee" },
  "/privacy": { title: "プライバシーポリシー | Ryuge Coffee" },
  "/terms": { title: "利用規約 | Ryuge Coffee" },
  "/refund": { title: "返金ポリシー | Ryuge Coffee" },
  "/checkout": { title: "チェックアウト | Ryuge Coffee" },
  "/checkout/complete": { title: "ご注文完了 | Ryuge Coffee" },
};

export function updatePageMeta(pathname) {
  const meta = PAGE_META[pathname];
  if (!meta) return;
  document.title = meta.title;
  if (meta.description) {
    let tag = document.querySelector('meta[name="description"]');
    if (tag) tag.setAttribute("content", meta.description);
  }
}

// ── JSON-LD ──────────────────────────────────────────────

function buildProductJsonLd() {
  const products = [
    ...(PRODUCT_DATA.enma || []),
    ...(PRODUCT_DATA.woodbox || []),
    ...(PRODUCT_DATA.bag || []),
  ];

  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: products.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Product",
        name: p.title?.ja || p.id,
        alternateName: p.title?.en || undefined,
        description: p.summary?.ja || undefined,
        image: p.image ? SITE_URL + p.image : undefined,
        brand: { "@type": "Brand", name: "Ryuge Coffee 龍華珈琲" },
        offers: {
          "@type": "Offer",
          price: p.priceNumber,
          priceCurrency: "JPY",
          availability: p.isSoldOut
            ? "https://schema.org/OutOfStock"
            : "https://schema.org/InStock",
          url: SITE_URL + "/products",
        },
      },
    })),
  };
}

const JSONLD_ID = "ryuge-products-jsonld";

export function injectProductJsonLd() {
  if (document.getElementById(JSONLD_ID)) return;
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.id = JSONLD_ID;
  script.textContent = JSON.stringify(buildProductJsonLd());
  document.head.appendChild(script);
}

export function removeProductJsonLd() {
  const el = document.getElementById(JSONLD_ID);
  if (el) el.remove();
}
