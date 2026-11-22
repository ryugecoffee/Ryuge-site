import { Link } from "react-router-dom";
import { SUBSCRIPTIONS_PAUSED } from "../productData";
import { CHANGE_DEADLINE_DAY, FIRST_PRICE, MONTHLY_PRICES, SHIPPING_DAYS, yen } from "../lib/coffeeSubscriptionAccount";
import { REFUND_BUSINESS_DAYS, TERMS_JA } from "../lib/coffeeSubscriptionTerms";

// 定期購入（珈琲の定期便）の表記: the same conditions as the final confirmation screen (src/lib/coffeeSubscriptionTerms.js)
// and the confirmation mail (server/coffee-subscription-mail.js). The shared ja sentences come from TERMS_JA; prices,
// dates and shipping days come from the same constants as the screen. Wording restyled 2026-11-23: ja, en and es state
// the same points. Provisional until a specialist has checked it (LEGAL_TEXT_REVIEWED).
const FREQUENCIES = [1, 2, 3, 4];
const jpy = (n) => `¥${Number(n).toLocaleString("ja-JP")}`;
const annual = (n) => ({ total: FIRST_PRICE + MONTHLY_PRICES[n] * 12, deliveries: 1 + n * 12 });
const andList = (items, and) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`);
const ordinal = (d) => `${d}${d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th"}`;
const EN_TIMES = { 1: "once a month", 2: "twice a month", 3: "3 times a month", 4: "4 times a month" };
const ES_TIMES = { 1: "1 vez al mes", 2: "2 veces al mes", 3: "3 veces al mes", 4: "4 veces al mes" };

const MONTHLY = {
  ja: FREQUENCIES.map((n) => `月${n}回 ${yen(MONTHLY_PRICES[n])}`).join("／"),
  en: FREQUENCIES.map((n) => `${EN_TIMES[n]} ${jpy(MONTHLY_PRICES[n])}`).join(" / "),
  es: FREQUENCIES.map((n) => `${ES_TIMES[n]} ${jpy(MONTHLY_PRICES[n])}`).join(" / "),
};
const DAYS = {
  ja: FREQUENCIES.map((n) => `月${n}回：${SHIPPING_DAYS[n].map((d) => `${d}日`).join("・")}`).join("／"),
  en: FREQUENCIES.map((n) => `${EN_TIMES[n]}: the ${andList(SHIPPING_DAYS[n].map(ordinal), "and")}`).join("; "),
  es: FREQUENCIES.map((n) => `${ES_TIMES[n]}: día${SHIPPING_DAYS[n].length > 1 ? "s" : ""} ${andList(SHIPPING_DAYS[n].map(String), "y")}`).join("; "),
};
// One year from the first monthly charge: the first payment + 12 monthly payments (skips and changes alter it).
const ANNUAL = {
  ja: FREQUENCIES.map((n) => `月${n}回 ${yen(annual(n).total)}（${annual(n).deliveries}回・${(annual(n).deliveries * 200).toLocaleString("ja-JP")}g）`).join("／"),
  en: FREQUENCIES.map((n) => `${EN_TIMES[n]} ${jpy(annual(n).total)} (${annual(n).deliveries} deliveries, ${(annual(n).deliveries * 200).toLocaleString("en-US")} g)`).join("; "),
  es: FREQUENCIES.map((n) => `${ES_TIMES[n]} ${jpy(annual(n).total)} (${annual(n).deliveries} envíos, ${annual(n).deliveries * 200} g)`).join("; "),
};

const SUBSCRIPTION_ROWS = {
  ja: [
    ["商品・分量", "当店おまかせの珈琲豆2種類（100g×2袋、1回のお届けにつき200g）を、お選びいただいた回数（月1〜4回）お届けいたします。"],
    ["販売価格（税込・送料込み）", `初回分：${yen(FIRST_PRICE)}（初回のお届け200g・1回分）。お申し込み時にお支払いいただく、月額料金とは別のお支払いです。月額料金：${MONTHLY.ja}。全国一律の価格で、日割りはございません。`],
    ["支払時期・方法", "クレジットカード（Stripe）。初回分はお申し込み時にお支払いいただきます。月額料金は毎月1日（日本時間9時）に、その月のお届け分を先払いで、ご登録のカードから自動でお支払いいただきます。月額のお支払いは、お申し込み日（日本時間）が1〜15日の場合は翌月1日から、16日以降の場合は翌々月1日から始まります（開始日は、お申し込みの確認画面とお申し込み後のメールでご案内いたします）。決済画面（Stripe）に表示される「○日間無料」「トライアル」は、月額のお支払いが始まる日までの期間を指すもので、無料のお試し期間ではございません。"],
    ["引渡時期", `初回のお届け：お支払い完了後、3営業日以内に発送いたします。2回目以降（月額のお支払いが始まる月から）：毎月、お選びの回数に応じた日に発送いたします（${DAYS.ja}。土日祝・休業日にあたる場合は翌営業日）。お届けは日本国内に限ります。`],
    ["契約期間", `${TERMS_JA.term}1年間の参考（初回分と月額料金12か月分の合計）：${ANNUAL.ja}。スキップや配送回数の変更をされた場合は変わります。`],
    ["変更・スキップ", `配送回数の変更（月1〜4回）と月単位のスキップは、管理ページから前月${CHANGE_DEADLINE_DAY}日までのお手続きで翌月分から反映いたします。${CHANGE_DEADLINE_DAY + 1}日以降のお手続きは、翌々月分からとなります。`],
    ["解約の方法", `管理ページ（ご登録のメールアドレスでログイン）から、いつでもお手続きいただけます。毎月1日のご請求（日本時間9時）より前に解約された場合、その月以降のご請求はございません。お支払い済みの月の分は、予定どおりお届けいたします。${TERMS_JA.noFee}${TERMS_JA.emailCancel}`],
    ["返金", `${TERMS_JA.refund}お支払い済みの月額料金について、日割りでの返金はございません。`],
    ["返品・交換", `${TERMS_JA.returns}`],
  ],
  en: [
    ["Product and quantity", "Two coffees chosen by us (100 g × 2 bags, 200 g per delivery), delivered the number of times a month you choose (1–4)."],
    ["Price (tax and shipping included)", `First payment: ${jpy(FIRST_PRICE)} (the first delivery of 200 g), paid at sign-up and separate from the monthly price. Monthly price: ${MONTHLY.en}. One price throughout Japan; no pro-rating.`],
    ["Payment timing and method", "Credit card (Stripe). The first payment is made at sign-up. The monthly price is charged automatically to your registered card on the 1st of each month (9:00 JST), in advance, for that month’s deliveries. Monthly payments begin on the 1st of the following month if you sign up on the 1st–15th (JST), or on the 1st of the month after next if you sign up on the 16th or later (the start date is shown on the confirmation screen and in the email sent after sign-up). Where Stripe’s payment page shows “X days free” or “trial”, this refers only to the period until the monthly payments begin; it is not a free trial."],
    ["Delivery", `First delivery: shipped within 3 business days of payment. From the second delivery (from the month the monthly payments begin): shipped on fixed days each month (${DAYS.en}; the next business day if that day falls on a weekend, public holiday or closing day). Delivery within Japan only.`],
    ["Term", `An open-ended subscription that continues every month until you cancel, with no minimum number of deliveries. For reference, one year (the first payment plus 12 monthly payments): ${ANNUAL.en}. Skips and changes alter these figures.`],
    ["Changes and skips", `Changes to the number of deliveries (1–4 a month) and skipping a month are made on your subscription page. Requests made by the ${ordinal(CHANGE_DEADLINE_DAY)} of a month apply from the following month; requests made on the ${ordinal(CHANGE_DEADLINE_DAY + 1)} or later apply from the month after next.`],
    ["Cancellation", "You may cancel at any time on your subscription page (sign in with your registered email address). If you cancel before the charge at 9:00 JST on the 1st, that month and later months are not charged. Months already paid are delivered as planned. There is no cancellation fee or penalty. If you cannot sign in, you may also cancel by emailing ryugecoffee@gmail.com with the subject “定期便の解約希望”. To confirm your identity, we check the sender of a message from your registered email address; if the sender cannot be confirmed, or you write from another address, we will ask for your registered email address, postal code and the last four digits of your phone number (where the sender cannot be confirmed, we ask at your registered address). A request that reaches us before 9:00 JST on the 1st is treated as a cancellation before that month’s charge; if our handling is delayed and that month is charged, we refund that month in full and do not ship the deliveries not yet sent (no payment or return is needed for anything already shipped)."],
    ["Refunds", `If you cancel before the first 200 g is shipped, we refund the first payment of ${jpy(FIRST_PRICE)} in full to the card used. We process the refund within ${REFUND_BUSINESS_DAYS} business days of receiving your cancellation; when it appears on your statement depends on your card issuer. Once the first delivery has shipped, the first payment is not refunded. Monthly payments already made are not refunded on a pro-rated basis.`],
    ["Returns and exchanges", "As this is food, we cannot accept returns or exchanges for reasons of preference. If an item arrives damaged, incomplete or incorrect, please contact ryugecoffee@gmail.com within 7 days of arrival; after checking, we will exchange or refund it."],
  ],
  es: [
    ["Producto y cantidad", "Dos cafés elegidos por nosotros (100 g × 2 bolsas, 200 g por envío), con el número de envíos al mes que usted elija (de 1 a 4)."],
    ["Precio (impuestos y envío incluidos)", `Primer pago: ${jpy(FIRST_PRICE)} (el primer envío de 200 g), que se abona al suscribirse y es independiente del precio mensual. Precio mensual: ${MONTHLY.es}. Mismo precio en todo Japón; sin prorrateo.`],
    ["Momento y forma de pago", "Tarjeta de crédito (Stripe). El primer pago se abona al suscribirse. El precio mensual se cobra automáticamente en la tarjeta registrada el día 1 de cada mes (9:00, hora de Japón), por adelantado, por los envíos de ese mes. Los pagos mensuales comienzan el día 1 del mes siguiente si se suscribe entre el 1 y el 15 (hora de Japón), o el día 1 del mes subsiguiente si lo hace el 16 o más tarde (la fecha de inicio figura en la pantalla de confirmación y en el correo que recibirá tras suscribirse). Cuando la página de pago de Stripe muestra «X días gratis» o «prueba», se refiere solo al periodo hasta que comienzan los pagos mensuales; no es un periodo de prueba gratuito."],
    ["Entrega", `Primer envío: en un plazo de 3 días hábiles tras el pago. A partir del segundo envío (desde el mes en que comienzan los pagos mensuales): en días fijos cada mes (${DAYS.es}; el siguiente día hábil si coincide con sábado, domingo, festivo o día de cierre). Solo envíos dentro de Japón.`],
    ["Duración", `Suscripción sin plazo determinado, que continúa cada mes hasta que usted la cancele, sin número mínimo de envíos. A modo de referencia, un año (primer pago más 12 pagos mensuales): ${ANNUAL.es}. Las omisiones y los cambios modifican estas cifras.`],
    ["Cambios y omisiones", `Los cambios en el número de envíos (de 1 a 4 al mes) y la omisión de un mes se gestionan en su página de suscripción. Las solicitudes hechas hasta el día ${CHANGE_DEADLINE_DAY} de un mes se aplican desde el mes siguiente; las hechas a partir del día ${CHANGE_DEADLINE_DAY + 1}, desde el mes subsiguiente.`],
    ["Cancelación", "Puede cancelar en cualquier momento en su página de suscripción (inicie sesión con su correo electrónico registrado). Si cancela antes del cobro de las 9:00 (hora de Japón) del día 1, ese mes y los siguientes no se cobran. Los meses ya pagados se envían según lo previsto. No hay cargo ni penalización por cancelación. Si no puede iniciar sesión, también puede cancelar escribiendo a ryugecoffee@gmail.com con el asunto «定期便の解約希望». Para confirmar su identidad, comprobamos el remitente de los mensajes enviados desde su correo registrado; si no es posible confirmarlo, o si escribe desde otra dirección, le pediremos su correo registrado, su código postal y los 4 últimos dígitos de su teléfono (si el remitente no puede confirmarse, se lo preguntaremos en su correo registrado). Una solicitud recibida antes de las 9:00 (hora de Japón) del día 1 se considera una cancelación anterior al cobro de ese mes; si nuestra gestión se retrasa y ese mes llega a cobrarse, le reembolsaremos ese mes íntegramente y no enviaremos lo pendiente de envío (lo ya enviado no requiere pago ni devolución)."],
    ["Reembolsos", `Si cancela antes de que se envíen los primeros 200 g, le reembolsaremos íntegramente el primer pago de ${jpy(FIRST_PRICE)} en la tarjeta utilizada. Tramitamos el reembolso en un plazo de ${REFUND_BUSINESS_DAYS} días hábiles desde la recepción de la cancelación; el momento en que aparece en su extracto depende de la entidad emisora de la tarjeta. Una vez realizado el primer envío, el primer pago no se reembolsa. Los pagos mensuales ya realizados no se reembolsan de forma prorrateada.`],
    ["Devoluciones y cambios", "Al tratarse de alimentos, no aceptamos devoluciones ni cambios por preferencia del cliente. Si un producto llega dañado, incompleto o equivocado, contacte con ryugecoffee@gmail.com dentro de los 7 días posteriores a la llegada; tras revisarlo, lo cambiaremos o reembolsaremos."],
  ],
};
const SUBSCRIPTION_TITLE = { ja: "定期購入（珈琲の定期便）について", en: "Coffee Subscription (recurring purchase)", es: "Suscripción de café (compra periódica)" };
const SUBSCRIPTION_PAUSED_NOTE = {
  ja: "現在、新規のお申し込みの受付を休止しております。",
  en: "New sign-ups are currently paused.",
  es: "Las nuevas suscripciones están en pausa por el momento.",
};
const LINKS = {
  ja: { shipping: "配送・送料について", manage: "定期便の管理ページ" },
  en: { shipping: "Shipping & Delivery", manage: "Subscription page" },
  es: { shipping: "Envío y entrega", manage: "Página de suscripción" },
};

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
      priceValue: "各商品ページに記載しております（定期便は下記のとおりです）",
      extra: "商品代金以外の必要料金",
      extraValue: "送料（1回のご注文につき1回。金額は「配送・送料について」のページに記載しております）。定期便は、初回分・月額料金ともに送料を含み、追加の送料はかかりません。",
      payment: "支払方法",
      paymentValue:
        "クレジットカード決済（Square / Stripe。商品やご注文内容により異なります。定期便は Stripe です）",
      timing: "支払時期",
      timingValue: "ご注文時にお支払いが確定いたします（定期便は下記のとおりです）",
      delivery: "商品の引渡時期",
      deliveryValue: "ご注文後、原則3営業日以内に発送いたします（珈琲豆はご注文後に焙煎し、通常はご注文の翌日の発送を目指しております）。定期便は下記のとおりです",
      returns: "返品・交換について",
      returnsValue:
        "食品のため、お客様のご都合による返品・交換はお受けしておりません。商品に破損・不足などの不備がございました場合や、ご注文内容と異なる商品が届いた場合は、商品到着後7日以内にご連絡ください。",
      refund: "返金について",
      refundValue:
        "対象の商品を確認のうえ、交換または返金にて対応いたします。返金は、ご購入時のお支払い方法にて手続きいたします（定期便は下記のとおりです）。",
      cancel: "キャンセルについて",
      cancelValue:
        "ご注文確定後のキャンセルは、発送前で対応可能な場合に限り承ります。発送後のキャンセルはお受けしておりません。定期便の解約は下記のとおりです。",
      note: "表現および商品に関する注意書き",
      noteValue: "商品の特性上、味や香りの感じ方には個人差がございます。",
      product: "販売商品について",
      productValue:
        "当店では Ryuge Coffee として、焙煎コーヒー豆、珈琲袋、お茶商品、および珈琲の定期便（定期購入）を販売しております。",
    },

    en: {
      title: "Legal Notice",
      seller: "Seller",
      company: "Kabushikigaisha Ryuge",
      operator: "Representative",
      name: "Ryuge Imai",
      address: "Address",
      addressValue:
        "Ennoji Temple, 1543 Yamanouchi, Kamakura, Kanagawa 247-0062, Japan",
      phone: "Phone",
      email: "Email",
      url: "Website",
      price: "Price",
      priceValue: "Listed on each product page (subscription: see below)",
      extra: "Additional Fees",
      extraValue: "Shipping, charged once per order (see Shipping & Delivery). For the subscription, shipping is included in both the first payment and the monthly price, with no additional shipping charge.",
      payment: "Payment Method",
      paymentValue:
        "Credit card (Square / Stripe, depending on the product and order; the subscription uses Stripe)",
      timing: "Payment Timing",
      timingValue: "Payment is confirmed when you place your order (subscription: see below)",
      delivery: "Delivery",
      deliveryValue: "Shipped within 3 business days of the order as a rule (coffee is roasted after the order; we aim to ship the next day). Subscription: see below",
      returns: "Returns",
      returnsValue:
        "As our products are food, we cannot accept returns or exchanges for reasons of preference. If an item arrives damaged or incomplete, or differs from your order, please contact us within 7 days of delivery.",
      refund: "Refunds",
      refundValue:
        "After checking the item, we will exchange or refund it. Refunds are processed using the original payment method (subscription: see below).",
      cancel: "Cancellation",
      cancelValue:
        "Orders can be cancelled only before shipment, where we are able to do so; orders cannot be cancelled after shipping. To cancel the subscription, see below.",
      note: "Disclaimer",
      noteValue:
        "Taste and aroma are perceived differently by each person.",
      product: "Products",
      productValue:
        "Under the name Ryuge Coffee, we sell roasted coffee beans, coffee bags, tea, and the Coffee Subscription (a recurring purchase).",
    },

    es: {
      title: "Aviso Legal",
      seller: "Vendedor",
      company: "Kabushikigaisha Ryuge",
      operator: "Responsable",
      name: "Ryuge Imai",
      address: "Dirección",
      addressValue: "Templo Ennoji, 1543 Yamanouchi, Kamakura, Kanagawa 247-0062, Japón",
      phone: "Teléfono",
      email: "Correo electrónico",
      url: "Sitio web",
      price: "Precio",
      priceValue: "Indicado en cada producto (suscripción: véase más abajo)",
      extra: "Costes adicionales",
      extraValue: "Envío, una vez por pedido (véase Envío y entrega). En la suscripción, el envío está incluido tanto en el primer pago como en el precio mensual, sin gastos de envío adicionales.",
      payment: "Método de pago",
      paymentValue:
        "Tarjeta de crédito (Square / Stripe, según el producto y el pedido; la suscripción se paga con Stripe)",
      timing: "Momento del pago",
      timingValue: "El pago se confirma al realizar el pedido (suscripción: véase más abajo)",
      delivery: "Entrega",
      deliveryValue: "Por norma, envío en 3 días hábiles tras el pedido (el café se tuesta tras el pedido; intentamos enviarlo al día siguiente). Suscripción: véase más abajo",
      returns: "Devoluciones",
      returnsValue:
        "Al tratarse de alimentos, no aceptamos devoluciones ni cambios por preferencia del cliente. Si un producto llega dañado o incompleto, o no corresponde a su pedido, contáctenos dentro de los 7 días posteriores a la entrega.",
      refund: "Reembolsos",
      refundValue:
        "Tras revisar el producto, lo cambiaremos o reembolsaremos. Los reembolsos se tramitan con el método de pago original (suscripción: véase más abajo).",
      cancel: "Cancelación",
      cancelValue:
        "Los pedidos solo pueden cancelarse antes del envío, cuando sea posible; no se aceptan cancelaciones después del envío. Para cancelar la suscripción, véase más abajo.",
      note: "Aviso",
      noteValue: "El sabor y el aroma pueden percibirse de forma distinta según la persona.",
      product: "Productos",
      productValue:
        "Con el nombre Ryuge Coffee vendemos café tostado, bolsas de café, té y la Suscripción de café (compra periódica).",
    },
  };

  const t = TEXT[lang] || TEXT.ja;
  const links = LINKS[lang] || LINKS.ja;

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

      <h2>{SUBSCRIPTION_TITLE[lang] || SUBSCRIPTION_TITLE.ja}</h2>
      {SUBSCRIPTIONS_PAUSED && <p>{SUBSCRIPTION_PAUSED_NOTE[lang] || SUBSCRIPTION_PAUSED_NOTE.ja}</p>}
      {(SUBSCRIPTION_ROWS[lang] || SUBSCRIPTION_ROWS.ja).map(([label, value]) => (
        <p key={label}><strong>{label}</strong><br />{value}</p>
      ))}
      <p><Link to="/shipping" className="text-link">{links.shipping}</Link>・<Link to="/subscription/manage" className="text-link">{links.manage}</Link></p>
    </div>
  );
}
