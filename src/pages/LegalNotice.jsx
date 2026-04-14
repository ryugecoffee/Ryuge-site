export default function LegalNotice({ lang = "ja" }) {
  const TEXT = {
    ja: {
      title: "特定商取引法に基づく表記",
      seller: "販売業者",
      company: "株式会社龍華",
      operator: "運営責任者",
      name: "今井龍華",
      address: "所在地",
      addressValue: "〒247-0062 神奈川県鎌倉市山ノ内1543 円応寺",
      phone: "電話番号",
      email: "メールアドレス",
      url: "販売URL",
      price: "販売価格",
      priceValue: "各商品ページに記載",
      extra: "商品代金以外の必要料金",
      extraValue: "送料（地域および商品により異なります）",
      payment: "支払方法",
      paymentValue:
        "クレジットカード決済（Square / Stripe）※商品や注文内容により異なります",
      timing: "支払時期",
      timingValue: "ご注文時にお支払いが確定します",
      delivery: "商品の引渡時期",
      deliveryValue: "通常、ご注文から3〜7日以内に発送いたします",
      returns: "返品・交換について",
      returnsValue:
        "商品に欠陥がある場合を除き、返品・交換には応じかねます。不良品の場合は商品到着後7日以内にご連絡ください。",
      refund: "返金について",
      refundValue:
        "返品対象商品を確認後、必要に応じて返金手続きを行います。返金方法はご利用の決済手段に準じます。",
      cancel: "キャンセルについて",
      cancelValue:
        "ご注文確定後のキャンセルは、発送前で対応可能な場合に限り承ります。発送後のキャンセルはお受けできません。",
      note: "表現および商品に関する注意書き",
      noteValue: "商品の特性上、味や香りには個人差があります。",
      product: "販売商品について",
      productValue:
        "当店ではRyuge Coffeeとして、焙煎コーヒー豆、珈琲バッグ、お茶商品の販売を行っています。",
    },

    en: {
      title: "Legal Notice",
      seller: "Seller",
      company: "Kabushikigaisha Ryuge",
      operator: "Representative",
      name: "Ryuge Imai",
      address: "Address",
      addressValue:
        "Ennoji Temple, 1543 Yamanouchi, Kamakura, Kanagawa, Japan",
      phone: "Phone",
      email: "Email",
      url: "Website",
      price: "Price",
      priceValue: "Listed on each product page",
      extra: "Additional Fees",
      extraValue: "Shipping fees vary by region and product",
      payment: "Payment Method",
      paymentValue:
        "Credit card payment (Square / Stripe) depending on the order",
      timing: "Payment Timing",
      timingValue: "Charged at the time of order",
      delivery: "Delivery",
      deliveryValue: "Shipped within 3–7 days after order",
      returns: "Returns",
      returnsValue:
        "Returns are not accepted unless the product is defective. Please contact us within 7 days of delivery.",
      refund: "Refunds",
      refundValue:
        "Refunds will be processed after confirming the returned product. The method depends on the payment provider used.",
      cancel: "Cancellation",
      cancelValue:
        "Orders can be canceled only before shipment if possible. No cancellations after shipping.",
      note: "Disclaimer",
      noteValue:
        "Taste and aroma may vary depending on individual perception.",
      product: "Products",
      productValue:
        "We sell roasted coffee beans, coffee bags, and tea products under Ryuge Coffee.",
    },

    es: {
      title: "Aviso Legal",
      seller: "Vendedor",
      company: "Kabushikigaisha Ryuge",
      operator: "Responsable",
      name: "Ryuge Imai",
      address: "Dirección",
      addressValue: "Kamakura, Japón",
      phone: "Teléfono",
      email: "Correo electrónico",
      url: "Sitio web",
      price: "Precio",
      priceValue: "Indicado en cada producto",
      extra: "Costes adicionales",
      extraValue: "El envío varía según región",
      payment: "Método de pago",
      paymentValue:
        "Pago con tarjeta de crédito (Square / Stripe) según el pedido",
      timing: "Momento del pago",
      timingValue: "Se cobra al realizar el pedido",
      delivery: "Entrega",
      deliveryValue: "Envío en 3–7 días",
      returns: "Devoluciones",
      returnsValue:
        "No se aceptan devoluciones salvo defectos del producto.",
      refund: "Reembolsos",
      refundValue:
        "Los reembolsos se procesan tras verificar el producto devuelto.",
      cancel: "Cancelación",
      cancelValue:
        "Solo se aceptan cancelaciones antes del envío si es posible.",
      note: "Aviso",
      noteValue: "El sabor puede variar según la persona.",
      product: "Productos",
      productValue:
        "Vendemos café tostado, bolsas de café y té bajo Ryuge Coffee.",
    },
  };

  const t = TEXT[lang] || TEXT.ja;

  return (
    <div className="legal-page">
      <h1>{t.title}</h1>

      <p><strong>{t.seller}</strong><br />{t.company}</p>
      <p><strong>{t.operator}</strong><br />{t.name}</p>
      <p><strong>{t.address}</strong><br />{t.addressValue}</p>
      <p><strong>{t.phone}</strong><br />090-6312-1717</p>
      <p><strong>{t.email}</strong><br />ryugecoffee@gmail.com</p>
      <p><strong>{t.url}</strong><br />https://www.ryuge.biz</p>

      <p><strong>{t.product}</strong><br />{t.productValue}</p>

      <p><strong>{t.price}</strong><br />{t.priceValue}</p>
      <p><strong>{t.extra}</strong><br />{t.extraValue}</p>
      <p><strong>{t.payment}</strong><br />{t.paymentValue}</p>
      <p><strong>{t.timing}</strong><br />{t.timingValue}</p>
      <p><strong>{t.delivery}</strong><br />{t.deliveryValue}</p>

      <p><strong>{t.returns}</strong><br />{t.returnsValue}</p>
      <p><strong>{t.refund}</strong><br />{t.refundValue}</p>
      <p><strong>{t.cancel}</strong><br />{t.cancelValue}</p>

      <p><strong>{t.note}</strong><br />{t.noteValue}</p>
    </div>
  );
}