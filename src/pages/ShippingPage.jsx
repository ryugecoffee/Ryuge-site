import { Link } from "react-router-dom";

const TEXT = {
  ja: {
    eyebrow: "配送・送料",
    title: "配送・送料について",
    lead: "ご注文確定後、1〜3営業日以内に発送いたします。土日・祝日は出荷をお休みしております。",
    sections: [
      {
        title: "クリックポスト 185円",
        body: "全国一律、ポスト投函でお届けいたします。サブスクリプション商品および100g商品の発送に対応しています。A4サイズが入るポストが必要です。",
      },
      {
        title: "宅配便（ゆうパック）",
        body: "180g商品や複数点のご注文は、ゆうパックにてお届けいたします。送料は地域・サイズにより異なります。",
      },
      {
        title: "6,000円以上で送料無料",
        body: "コーヒー豆のご購入合計が6,000円以上の場合、送料無料となります。ゆうパックにて発送いたします。",
      },
      {
        title: "海外発送",
        body: "EMS（国際郵便）にて対応しております。送料はご注文後にメールにてご案内いたします。",
      },
    ],
    note: "送料に関するお問い合わせは ryugecoffee@gmail.com までご連絡ください。",
    back: "← トップへ戻る",
  },
  en: {
    eyebrow: "Shipping",
    title: "Shipping & Delivery",
    lead: "Orders are shipped within 1–3 business days after confirmation. We do not ship on weekends or public holidays.",
    sections: [
      {
        title: "Click Post — ¥185",
        body: "Flat rate nationwide, delivered to your mailbox. Available for subscription items and 100g products. An A4-compatible mailbox is required.",
      },
      {
        title: "Courier (Yu-Pack)",
        body: "Orders containing 180g products or multiple items will be shipped via Yu-Pack. Rates vary by region and size.",
      },
      {
        title: "Free Shipping on Orders over ¥6,000",
        body: "Orders totaling ¥6,000 or more in coffee beans qualify for free shipping via Yu-Pack.",
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
    lead: "Los pedidos se envían en 1–3 días hábiles tras la confirmación. No realizamos envíos los fines de semana ni en días festivos.",
    sections: [
      {
        title: "Click Post — ¥185",
        body: "Tarifa plana nacional, entrega en buzón. Disponible para productos de suscripción y productos de 100g. Se requiere un buzón compatible con tamaño A4.",
      },
      {
        title: "Mensajería (Yu-Pack)",
        body: "Los pedidos con productos de 180g o varios artículos se enviarán mediante Yu-Pack. Las tarifas varían según la región y el tamaño.",
      },
      {
        title: "Envío gratis en pedidos superiores a ¥6,000",
        body: "Los pedidos de café que superen ¥6,000 en total tienen envío gratuito mediante Yu-Pack.",
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