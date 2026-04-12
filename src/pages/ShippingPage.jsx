import { Link } from "react-router-dom";

const TEXT = {
  ja: {
    eyebrow: "配送・送料",
    title: "配送・送料について",
    lead: "ご注文確定後、1〜3営業日以内に発送いたします。毎週火曜日は出荷をお休みしております。",
    sections: [
      {
        title: "クリックポスト 185円",
        body: "全国一律、ポスト投函。閻魔3個（約540g）まで対応。A4サイズが入るポストがない場合は投函不能で返送されることがあります。木箱を含む注文には対応していません。",
      },
      {
        title: "レターパックプラス 600円",
        body: "全国一律、郵便職員による手渡し。木箱1個の発送に対応。閻魔のみの場合は800gまで梱包可能。",
      },
      {
        title: "宅配便（ゆうパック）",
        body: "複数個注文や大型注文に対応。送料は地域・サイズにより異なります。",
      },
      {
        title: "7,000円以上で送料無料",
        body: "コーヒー豆のご購入合計が7,000円以上の場合、送料無料。ゆうパックにて発送いたします。",
      },
      {
        title: "海外発送",
        body: "EMS（国際郵便）にて対応。送料はご注文後にメールにてご案内します。",
      },
    ],
    note: "送料に関するお問い合わせは ryugecoffee@gmail.com までご連絡ください。",
    back: "← トップへ戻る",
  },
  en: {
    eyebrow: "Shipping",
    title: "Shipping & Delivery",
    lead: "Orders are shipped within 1–3 business days after confirmation. We do not ship on Tuesdays.",
    sections: [
      {
        title: "Click Post — ¥185",
        body: "Flat rate nationwide, delivered to your mailbox. Up to 3 bags of Enma (approx. 540g). Not available for orders containing Woodbox. Note: requires an A4-compatible mailbox.",
      },
      {
        title: "Letter Pack Plus — ¥600",
        body: "Flat rate nationwide, hand-delivered by postal staff. Available for Woodbox orders. Up to 800g for Enma-only orders.",
      },
      {
        title: "Courier (Yu-Pack)",
        body: "Available for larger or multiple-item orders. Rates vary by region and size.",
      },
      {
        title: "Free Shipping on Orders over ¥7,000",
        body: "Orders totaling ¥7,000 or more in coffee beans qualify for free shipping via Yu-Pack.",
      },
      {
        title: "International Shipping",
        body: "We ship internationally via EMS. Shipping costs will be confirmed by email after your order.",
      },
    ],
    note: "For shipping inquiries, please contact ryugecoffee@gmail.com",
    back: "← Back to top",
  },
  es: {
    eyebrow: "Envío",
    title: "Envío y Entrega",
    lead: "Los pedidos se envían en 1–3 días hábiles tras la confirmación. No realizamos envíos los martes.",
    sections: [
      {
        title: "Click Post — ¥185",
        body: "Tarifa plana nacional, entrega en buzón. Hasta 3 bolsas Enma (aprox. 540g). No disponible para pedidos con Woodbox. Requiere buzón compatible con tamaño A4.",
      },
      {
        title: "Letter Pack Plus — ¥600",
        body: "Tarifa plana nacional, entrega en mano por el cartero. Disponible para pedidos con Woodbox. Hasta 800g para pedidos solo de Enma.",
      },
      {
        title: "Mensajería (Yu-Pack)",
        body: "Disponible para pedidos grandes o múltiples artículos. Las tarifas varían según región y tamaño.",
      },
      {
        title: "Envío gratis en pedidos superiores a ¥7,000",
        body: "Los pedidos de café que superen ¥7,000 en total tienen envío gratuito mediante Yu-Pack.",
      },
      {
        title: "Envío internacional",
        body: "Realizamos envíos internacionales mediante EMS. El coste se confirmará por correo electrónico tras el pedido.",
      },
    ],
    note: "Para consultas sobre envíos: ryugecoffee@gmail.com",
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
                <p>{section.body}</p>
              </section>
            ))}
          </div>

          <p className="legal-lead" style={{ marginTop: "48px" }}>
            {t.note}
          </p>

          <Link to="/" className="text-link" style={{ marginTop: "32px", display: "inline-block" }}>
            {t.back}
          </Link>
        </div>
      </main>
    </div>
  );
}