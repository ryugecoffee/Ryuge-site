import { Link } from "react-router-dom";

// Shipping policy (CEO, 2026-11-17). Amounts are charged as calculated by the payment server (server/quote.js).
const TEXT = {
  ja: {
    eyebrow: "配送・送料",
    title: "配送・送料について",
    lead:
      "ご注文確定後、3〜7営業日以内に発送いたします。土日は出荷をお休みしております。焙煎・袋詰め前の商品は、発送予定日を商品ページとご注文確認メールでお知らせします。",
    sections: [
      {
        title: "国内送料（1回のご注文につき1回）",
        body: "本州・四国：250円\n北海道・九州：500円\n沖縄：550円\n\nお届け先の都道府県から自動で計算し、お支払い前の合計に含めて表示します。商品ごとには加算しません。",
      },
      {
        title: "国内の配送方法",
        body: "100gの商品1〜2袋：レターパックライト（梱包後の厚さ3cm以内の場合）\n3袋以上：ゆうパック\n※梱包の状態により配送方法が変わる場合がありますが、送料は上記のとおりです。",
      },
      {
        title: "定期便は送料無料",
        body: "定期便商品は送料無料です（国内のみ）。",
      },
      {
        title: "海外へのお届け",
        body: "日本郵便の追跡付き配送でお届けします。お届けできる国・地域は、決済画面の「お届け先の国・地域」で選べる国です（米国は現在対象外）。その他の国・地域はお問い合わせください。\n\nご注文はコーヒー豆2〜6袋（100g×2〜6、1注文あたりコーヒー600gまで）。7袋以上のご注文はお問い合わせください。",
      },
      {
        title: "海外送料（送料の30%をRYUGE Coffeeが負担）",
        body: "お届け先の国と梱包後の重量で計算した日本郵便の送料から、30%（1回のご注文につき上限1,000円）を差し引いた金額をご請求します。送料を確定できない場合は、お支払いに進まずお問い合わせをご案内します。",
      },
      {
        title: "関税・輸入税・現地の手数料",
        body: "関税・輸入税・付加価値税（VAT・GST等）や現地の通関手数料は、お客様（受取人）のご負担です。お届け時に配送会社から請求される場合があります。お届け先の国の規則により受け取りができない場合の返送料はお客様のご負担となります。",
      },
    ],
    note:
      "送料・配送に関するお問い合わせは ryugecoffee@gmail.com までご連絡ください。",
    back: "← トップへ戻る",
  },

  en: {
    eyebrow: "Shipping",
    title: "Shipping & Delivery",
    lead:
      "Orders are usually shipped within 3–7 business days after confirmation. We do not ship on weekends. For items not yet roasted and packed, the planned shipping date is shown on the product page and in your order confirmation.",
    sections: [
      {
        title: "Shipping in Japan (once per order)",
        body: "Honshu / Shikoku: ¥250\nHokkaido / Kyushu: ¥500\nOkinawa: ¥550\n\nCalculated from the delivery prefecture and shown in the total before payment. Not charged per item.",
      },
      {
        title: "Delivery method in Japan",
        body: "1–2 bags of 100 g: Letter Pack Light (when the parcel is within 3 cm thick)\n3 bags or more: Yu-Pack\nThe method may change with the packing; the fee stays as above.",
      },
      {
        title: "Subscriptions ship free",
        body: "Subscription products include free shipping (Japan only).",
      },
      {
        title: "International delivery",
        body: "Sent by Japan Post with tracking, to the countries and regions you can choose at checkout (not the United States at present). For other destinations, please contact us.\n\nOrders are 2–6 bags of coffee beans (100 g × 2–6, up to 600 g of coffee per order). For 7 bags or more, please contact us.",
      },
      {
        title: "International shipping (RYUGE Coffee pays 30%)",
        body: "You pay Japan Post's rate for your country and packed weight, minus 30% (up to ¥1,000 per order). If the fee cannot be confirmed, payment is not offered and we ask you to contact us.",
      },
      {
        title: "Duties, import taxes and local fees",
        body: "Import duties, taxes (VAT, GST, etc.) and local customs fees are paid by the customer (recipient) and may be collected on delivery. If a parcel cannot be received under the destination's rules, the return postage is the customer's.",
      },
    ],
    note:
      "For shipping inquiries, please contact ryugecoffee@gmail.com",
    back: "← Back to top",
  },

  es: {
    eyebrow: "Envío",
    title: "Envío y Entrega",
    lead:
      "Los pedidos se envían normalmente dentro de 3–7 días hábiles tras la confirmación. No realizamos envíos los fines de semana. Para productos aún no tostados y envasados, la fecha prevista de envío se indica en la página del producto y en la confirmación del pedido.",
    sections: [
      {
        title: "Envío en Japón (una vez por pedido)",
        body: "Honshu / Shikoku: ¥250\nHokkaido / Kyushu: ¥500\nOkinawa: ¥550\n\nSe calcula según la prefectura de entrega y se muestra en el total antes del pago. No se cobra por artículo.",
      },
      {
        title: "Método de envío en Japón",
        body: "1–2 bolsas de 100 g: Letter Pack Light (si el paquete no supera 3 cm de grosor)\n3 bolsas o más: Yu-Pack\nEl método puede cambiar según el embalaje; la tarifa es la indicada arriba.",
      },
      {
        title: "Las suscripciones tienen envío gratis",
        body: "Los productos de suscripción incluyen envío gratuito (solo Japón).",
      },
      {
        title: "Envío internacional",
        body: "Enviamos con Japan Post con seguimiento a los países y regiones que puedes elegir en el pago (actualmente no a Estados Unidos). Para otros destinos, contáctanos.\n\nLos pedidos son de 2–6 bolsas de café en grano (100 g × 2–6, hasta 600 g de café por pedido). Para 7 bolsas o más, contáctanos.",
      },
      {
        title: "Envío internacional (RYUGE Coffee paga el 30%)",
        body: "Pagas la tarifa de Japan Post para tu país y el peso del paquete, menos el 30% (hasta ¥1,000 por pedido). Si no se puede confirmar la tarifa, no se ofrece el pago y te pedimos que nos contactes.",
      },
      {
        title: "Aranceles, impuestos de importación y tasas locales",
        body: "Los aranceles, impuestos (IVA, GST, etc.) y tasas aduaneras locales corren por cuenta del cliente (destinatario) y pueden cobrarse en la entrega. Si el paquete no puede recibirse por las normas del destino, el envío de devolución corre por cuenta del cliente.",
      },
    ],
    note:
      "Para consultas sobre envíos: ryugecoffee@gmail.com",
    back: "← Volver al inicio",
  },
};

export default function ShippingPage({ lang }) {
  const t = TEXT[lang] || TEXT.ja;

  return (
    <div className="legal-page-shell">
      <main className="legal-main">
        <div className="legal-document">
          <p className="legal-eyebrow">{t.eyebrow}</p>
          <h1>{t.title}</h1>
          <p className="legal-lead">{t.lead}</p>

          <div className="legal-sections">
            {t.sections.map((section) => (
              <section key={section.title}>
                <h2>{section.title}</h2>
                <p className="pre-line">{section.body}</p>
              </section>
            ))}
          </div>

          <p className="legal-lead" style={{ marginTop: "24px" }}>
            {t.note}
          </p>

          <Link
            to="/"
            className="text-link"
            style={{ marginTop: "32px", display: "inline-block" }}
          >
            {t.back}
          </Link>
        </div>
      </main>
    </div>
  );
}
