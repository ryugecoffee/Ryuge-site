export default function LegalNotice({ lang = "ja" }) {
  const content = {
    ja: {
      title: "特定商取引法に基づく表記",
      lead: "Ryuge Coffee に関する通信販売上の表示です。",
      labels: {
        company: "販売事業者",
        manager: "運営責任者",
        address: "所在地",
        phone: "電話番号",
        email: "メールアドレス",
        payment: "支払方法",
        timing: "支払時期",
        delivery: "引渡時期",
        cancel: "返品・キャンセル",
      },
      values: {
        company: "株式会社龍華",
        manager: "今井 龍華",
        address: "神奈川県鎌倉市山ノ内1543 円応寺",
        phone: "090-6312-1717",
        email: "ryugecoffee@gmail.com",
        payment: "クレジットカード（Square）",
        timing: "ご注文確定時に決済",
        delivery: "ご注文から5日以内に発送",
        cancel: "食品のため、お客様都合による返品・キャンセルはお受けしておりません。不良品・誤配送の場合はご連絡ください。",
      },
    },
    en: {
      title: "Legal Notice",
      lead: "Information for mail-order sales of Ryuge Coffee.",
      labels: {
        company: "Business Operator",
        manager: "Responsible Person",
        address: "Address",
        phone: "Phone",
        email: "Email",
        payment: "Payment Method",
        timing: "Payment Timing",
        delivery: "Delivery",
        cancel: "Returns / Cancellation",
      },
      values: {
        company: "Ryuge Co., Ltd.",
        manager: "Ryuka Imai",
        address: "Ennoji Temple, 1543 Yamanouchi, Kamakura, Kanagawa, Japan",
        phone: "+81-90-6312-1717",
        email: "ryugecoffee@gmail.com",
        payment: "Credit Card (Square)",
        timing: "Charged at checkout",
        delivery: "Ships within 5 days from order",
        cancel:
          "Due to the nature of food products, returns or cancellations for customer convenience are not accepted. Please contact us in case of defective or incorrect delivery.",
      },
    },
    es: {
      title: "Aviso Legal",
      lead: "Información de venta por comercio electrónico de Ryuge Coffee.",
      labels: {
        company: "Operador Comercial",
        manager: "Responsable",
        address: "Dirección",
        phone: "Teléfono",
        email: "Correo Electrónico",
        payment: "Método de Pago",
        timing: "Momento del Pago",
        delivery: "Entrega",
        cancel: "Devoluciones / Cancelación",
      },
      values: {
        company: "Ryuge Co., Ltd.",
        manager: "Ryuka Imai",
        address: "Templo Ennoji, 1543 Yamanouchi, Kamakura, Kanagawa, Japón",
        phone: "+81-90-6312-1717",
        email: "ryugecoffee@gmail.com",
        payment: "Tarjeta de crédito (Square)",
        timing: "Cobro al finalizar la compra",
        delivery: "Envío dentro de 5 días desde el pedido",
        cancel:
          "Debido a la naturaleza alimentaria del producto, no aceptamos devoluciones o cancelaciones por conveniencia del cliente. Contáctenos en caso de producto defectuoso o envío incorrecto.",
      },
    },
  };

  const c = content[lang] || content.ja;

  return (
    <section className="legal-document">
      <h1>{c.title}</h1>
      <p className="legal-lead">{c.lead}</p>

      <div className="legal-table">
        <div className="legal-row">
          <dt>{c.labels.company}</dt>
          <dd>{c.values.company}</dd>
        </div>
        <div className="legal-row">
          <dt>{c.labels.manager}</dt>
          <dd>{c.values.manager}</dd>
        </div>
        <div className="legal-row">
          <dt>{c.labels.address}</dt>
          <dd>{c.values.address}</dd>
        </div>
        <div className="legal-row">
          <dt>{c.labels.phone}</dt>
          <dd>{c.values.phone}</dd>
        </div>
        <div className="legal-row">
          <dt>{c.labels.email}</dt>
          <dd>{c.values.email}</dd>
        </div>
        <div className="legal-row">
          <dt>{c.labels.payment}</dt>
          <dd>{c.values.payment}</dd>
        </div>
        <div className="legal-row">
          <dt>{c.labels.timing}</dt>
          <dd>{c.values.timing}</dd>
        </div>
        <div className="legal-row">
          <dt>{c.labels.delivery}</dt>
          <dd>{c.values.delivery}</dd>
        </div>
        <div className="legal-row">
          <dt>{c.labels.cancel}</dt>
          <dd>{c.values.cancel}</dd>
        </div>
      </div>
    </section>
  );
}