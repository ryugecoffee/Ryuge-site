import { Link } from "react-router-dom";

const TEXT = {
  ja: {
    eyebrow: "配送・送料",
    title: "配送・送料について",
    lead:
      "ご注文確定後、3〜7営業日以内に発送いたします。土日は出荷をお休みしております。",
    sections: [
      {
        title: "¥3,000以上で送料無料",
        body: "ご注文合計が¥3,000以上の場合、送料無料となります。",
      },
      {
        title: "全国一律 ¥880（ゆうパック60サイズ）",
        body: "¥3,000未満のご注文は、全国一律¥880のゆうパックでお届けします。",
      },
      {
        title: "サブスクリプションは送料無料",
        body: "サブスクリプション商品は金額にかかわらず送料無料です。",
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
      "Orders are usually shipped within 3–7 business days after confirmation. We do not ship on weekends.",
    sections: [
      {
        title: "Free shipping on orders over ¥3,000",
        body: "Orders totaling ¥3,000 or more qualify for free shipping.",
      },
      {
        title: "Flat rate ¥880 (Yu-Pack, 60 size)",
        body: "Orders under ¥3,000 are shipped via Yu-Pack at a flat rate of ¥880.",
      },
      {
        title: "Subscriptions ship free",
        body: "All subscription products include free shipping regardless of order total.",
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
      "Los pedidos se envían normalmente dentro de 3–7 días hábiles tras la confirmación. No realizamos envíos los fines de semana.",
    sections: [
      {
        title: "Envío gratis en pedidos superiores a ¥3,000",
        body: "Los pedidos con un total de ¥3,000 o más tienen envío gratuito.",
      },
      {
        title: "Tarifa fija ¥880 (Yu-Pack, 60)",
        body: "Los pedidos inferiores a ¥3,000 se envían por Yu-Pack a una tarifa fija de ¥880.",
      },
      {
        title: "Las suscripciones tienen envío gratis",
        body: "Todos los productos de suscripción incluyen envío gratuito sin importar el total del pedido.",
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
