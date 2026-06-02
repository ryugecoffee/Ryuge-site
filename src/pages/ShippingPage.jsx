import { Link } from "react-router-dom";

const TEXT = {
  ja: {
    eyebrow: "配送・送料",
    title: "配送・送料について",
    lead:
      "ご注文確定後、3〜7営業日以内に発送いたします。土日は出荷をお休みしております。",
    sections: [
      {
        title: "1個注文：送料¥200",
        body: "1個のみのご注文は、送料¥200となります。",
      },
      {
        title: "2個以上のご注文：送料無料",
        body: "2個以上のご注文（混在含む）は送料無料です。",
      },
      {
        title: "サブスクリプションは送料無料",
        body: "サブスクリプション商品は送料無料です。",
      },
      {
        title: "配送方法について",
        body: "1個注文の場合、商品により小型便または通常便（いずれも送料¥200）でお届けします。2個以上のご注文は送料無料です。配送方法の詳細はご注文内容により異なります。",
      },
    ],
    shippingNote: "昨今の価格高騰の中でも、より多くの方に自宅でコーヒーを楽しんでいただけるよう、全国一律の送料設定としております。その分、包装は簡易的なものとなっておりますが、ご理解いただけますと幸いです。",
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
        title: "1 item: ¥200 shipping",
        body: "Orders with a single item are charged ¥200 for shipping.",
      },
      {
        title: "2 or more items: Free shipping",
        body: "Orders of 2 or more items (any combination) ship free.",
      },
      {
        title: "Subscriptions ship free",
        body: "All subscription products include free shipping.",
      },
      {
        title: "Shipping method",
        body: "For single-item orders, we ship via compact or standard mail (¥200 flat). Orders of 2 or more items ship free. Shipping method may vary depending on your order.",
      },
    ],
    shippingNote: "To make specialty coffee accessible to as many people as possible despite rising costs, we keep our shipping rates low nationwide. Packaging is kept simple to reflect this.",
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
        title: "1 artículo: envío ¥200",
        body: "Los pedidos de un solo artículo tienen un coste de envío de ¥200.",
      },
      {
        title: "2 artículos o más: envío gratis",
        body: "Los pedidos de 2 o más artículos (cualquier combinación) tienen envío gratuito.",
      },
      {
        title: "Las suscripciones tienen envío gratis",
        body: "Todos los productos de suscripción incluyen envío gratuito.",
      },
      {
        title: "Método de envío",
        body: "Para pedidos de un artículo, enviamos por correo compacto o estándar (¥200 fijo). Los pedidos de 2 o más artículos tienen envío gratuito. El método de envío puede variar según tu pedido.",
      },
    ],
    shippingNote: "Para que el café de especialidad sea accesible a todos a pesar del aumento de costos, mantenemos tarifas de envío bajas en todo Japón. El embalaje es sencillo para reflejar esto.",
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

          <p className="legal-lead" style={{ marginTop: "32px" }}>
            {t.shippingNote}
          </p>

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
