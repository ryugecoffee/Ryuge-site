import { Link } from "react-router-dom";

const TEXT = {
  ja: {
    eyebrow: "配送・送料",
    title: "配送・送料について",
    lead:
      "ご注文確定後、3〜7営業日以内に発送いたします。土日は出荷をお休みしております。海外発送は配送地域に応じて送料が自動計算されます。",
    sections: [
      {
        title: "5,000円以上で送料無料",
        body: "ご注文合計が5,000円以上の場合、送料無料となります。",
      },
      {
        title: "サブスクリプションは送料無料",
        body: "サブスクリプション商品は金額にかかわらず送料無料です。",
      },
      {
        title: "バッグシリーズのみはクリックポスト 185円",
        body:
          "珈琲バッグ・お茶バッグのみのご注文は、合計10個まで全国一律185円のクリックポストでお届けします。",
      },
      {
        title: "それ以外はゆうパック",
        body:
          "バッグシリーズ以外の商品を含むご注文、またはバッグシリーズが11個以上のご注文は、ゆうパックで発送いたします。送料は地域・サイズにより異なります。",
      },
      {
        title: "海外発送",
        body:
          "海外発送はEMS（国際郵便）にて対応します。送料は配送地帯とご注文内容に応じて自動計算されます。\n\n" +
          "豆7個以上＋バッグ10個以上で送料50%OFF。\n" +
          "豆10個以上＋バッグ20個以上で最大割引が適用されます。\n\n" +
          "第1〜第3地帯は送料無料。\n" +
          "第4〜第5地帯は送料70%OFF。\n\n" +
          "豆は閻魔・木函の合計、バッグは珈琲バッグ・お茶バッグの合計で計算されます。",
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
      "Orders are usually shipped within 3–7 business days after confirmation. We do not ship on weekends. International shipping is calculated automatically based on destination.",
    sections: [
      {
        title: "Free shipping on orders over ¥5,000",
        body:
          "Orders totaling ¥5,000 or more qualify for free shipping.",
      },
      {
        title: "Subscriptions ship free",
        body:
          "All subscription products include free shipping regardless of order total.",
      },
      {
        title: "Bag series only — Click Post ¥185",
        body:
          "Orders containing only Coffee Bags and Tea Bags can be shipped via Click Post for a flat rate of ¥185, up to a total of 10 bags.",
      },
      {
        title: "All other orders ship by Yu-Pack",
        body:
          "Orders that include items outside the bag series, or bag-only orders with 11 or more bags, will be shipped by Yu-Pack. Shipping rates vary by region and package size.",
      },
      {
        title: "International Shipping",
        body:
          "We ship internationally via EMS. Shipping is calculated automatically based on your destination zone and order contents.\n\n" +
          "Orders with 7+ beans and 10+ bags receive 50% off shipping.\n" +
          "Orders with 10+ beans and 20+ bags receive the maximum discount.\n\n" +
          "Zones 1–3 qualify for free shipping.\n" +
          "Zones 4–5 receive 70% off shipping.\n\n" +
          "Beans are counted as the total of Enma and Wooden Box items.\n" +
          "Bags are counted as the total of Coffee Bags and Tea Bags.",
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
      "Los pedidos se envían normalmente dentro de 3–7 días hábiles tras la confirmación. No realizamos envíos los fines de semana. El envío internacional se calcula automáticamente según el destino.",
    sections: [
      {
        title: "Envío gratis en pedidos superiores a ¥5,000",
        body:
          "Los pedidos con un total de ¥5,000 o más tienen envío gratuito.",
      },
      {
        title: "Las suscripciones tienen envío gratis",
        body:
          "Todos los productos de suscripción incluyen envío gratuito sin importar el total del pedido.",
      },
      {
        title: "Solo serie de bolsas — Click Post ¥185",
        body:
          "Los pedidos que incluyan únicamente Coffee Bags y Tea Bags pueden enviarse por Click Post con una tarifa fija de ¥185, hasta un máximo de 10 bolsas en total.",
      },
      {
        title: "Todos los demás pedidos se envían por Yu-Pack",
        body:
          "Los pedidos que incluyan productos fuera de la serie de bolsas, o pedidos solo de bolsas con 11 unidades o más, se enviarán por Yu-Pack. La tarifa varía según la región y el tamaño del paquete.",
      },
      {
        title: "Envío internacional",
        body:
          "Realizamos envíos internacionales mediante EMS. El coste de envío se calcula automáticamente según la zona de destino y el contenido del pedido.\n\n" +
          "Los pedidos con 7+ cafés y 10+ bolsas reciben un 50% de descuento en el envío.\n" +
          "Los pedidos con 10+ cafés y 20+ bolsas reciben el descuento máximo.\n\n" +
          "Las zonas 1–3 tienen envío gratis.\n" +
          "Las zonas 4–5 reciben un 70% de descuento.\n\n" +
          "Los cafés se cuentan como el total de Enma y Wooden Box.\n" +
          "Las bolsas como el total de Coffee Bags y Tea Bags.",
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
                <p style={{ whiteSpace: "pre-line" }}>{section.body}</p>
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