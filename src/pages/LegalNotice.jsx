import { Link } from "react-router-dom";
import { SUBSCRIPTIONS_PAUSED } from "../productData";
import { CHANGE_DEADLINE_DAY, FIRST_PRICE, MONTHLY_PRICES, SHIPPING_DAYS, yen } from "../lib/coffeeSubscriptionAccount";
import { TERMS_JA } from "../lib/coffeeSubscriptionTerms";

// 定期購入（珈琲の定期便）の表記（2026-11-19 案）: the same conditions as the final confirmation screen
// (src/lib/coffeeSubscriptionTerms.js) and the confirmation mail (server/coffee-subscription-mail.js). Provisional until
// a specialist has checked it (LEGAL_TEXT_REVIEWED); prices and dates come from the same constants as the screen.
const plans = [1, 2, 3, 4].map((n) => `月${n}回 ${yen(MONTHLY_PRICES[n])}（毎月 ${SHIPPING_DAYS[n].map((d) => `${d}日`).join("・")} 発送）`).join("／");
const SUBSCRIPTION_ROWS = {
  ja: [
    ["商品・分量", "当店おまかせの珈琲豆 2種類（100g × 2袋 = 1回200g）を、お選びの回数（月1〜4回）お届けします。"],
    ["販売価格（税込・送料込み）", `初回 ${yen(FIRST_PRICE)}（200g・1回分）。2回目以降は月額で、${plans}。日割りの精算はありません。`],
    ["支払時期・方法", "クレジットカード（Stripe）。初回分はお申し込み時に、2回目以降は毎月1日（日本時間9時頃）に自動でお支払いいただきます。"],
    ["引渡時期", "初回：お支払い完了後、3営業日以内に発送します。2回目以降：毎月の上記の日に発送します（土日祝・休業日は翌営業日）。"],
    ["契約期間", `${TERMS_JA.term}1年間の参考（お申し込み時の初回＋月額12か月）：${[1, 2, 3, 4].map((n) => `月${n}回 ${yen(FIRST_PRICE + MONTHLY_PRICES[n] * 12)}（${1 + n * 12}回・${((1 + n * 12) * 200).toLocaleString("ja-JP")}g）`).join("／")}。スキップや回数変更をされた場合は変わります。`],
    ["変更・スキップ", `配送回数の変更と月単位のスキップは、管理ページから前月${CHANGE_DEADLINE_DAY}日までのお手続きで翌月分から反映します。`],
    ["解約の方法", `管理ページ（ご登録のメールアドレスでログイン）からいつでも解約できます。毎月1日のご請求（日本時間9時）より前に解約されると、その月以降のご請求はありません。${TERMS_JA.emailCancel}${TERMS_JA.noFee}`],
    ["返品・返金", `${TERMS_JA.returns}お支払い済みの月の分はお届けします（日割りの返金はありません）。${TERMS_JA.refund}`],
  ],
  en: [
    ["Product", "Two coffees chosen by us (100 g × 2 bags = 200 g per delivery), 1–4 deliveries a month as chosen."],
    ["Price (tax and shipping included)", `First delivery ${yen(FIRST_PRICE)}. Then monthly: ${[1, 2, 3, 4].map((n) => `${n}×/month ${yen(MONTHLY_PRICES[n])}`).join(", ")}. No pro-rating.`],
    ["Payment", "Credit card (Stripe): the first delivery at sign-up, then automatically on the 1st of each month."],
    ["Delivery", "First: within 3 business days of payment. Then on fixed days each month (next business day if closed)."],
    ["Term and cancellation", `No fixed term or minimum: it continues every month until cancelled. Change or skip by the ${CHANGE_DEADLINE_DAY}th of the previous month; cancel any time on your subscription page (before 9:00 JST on the 1st, that month is not charged), or, if you cannot sign in, by email to ryugecoffee@gmail.com (sender or identity checked; a request received before 9:00 JST on the 1st counts as before that month's charge, and a month charged because of our delay is refunded in full: what has not shipped is not sent, and what already shipped needs no payment or return). No cancellation fee.`],
    ["Refunds", `Paid months are delivered (no pro-rated refunds). If cancelled before the first 200 g is shipped, the first ${yen(FIRST_PRICE)} is refunded in full to your card within 7 business days. Food: no returns for change of mind; damaged or wrong items, contact us within 7 days of delivery.`],
  ],
  es: [
    ["Producto", "Dos cafés elegidos por nosotros (100 g × 2 bolsas = 200 g por envío), de 1 a 4 envíos al mes."],
    ["Precio (impuestos y envío incluidos)", `Primer envío ${yen(FIRST_PRICE)}. Después mensual: ${[1, 2, 3, 4].map((n) => `${n}/mes ${yen(MONTHLY_PRICES[n])}`).join(", ")}. Sin prorrateo.`],
    ["Pago", "Tarjeta de crédito (Stripe): el primer envío al suscribirse y después el día 1 de cada mes."],
    ["Entrega", "Primero: en 3 días hábiles tras el pago. Después en días fijos cada mes (siguiente día hábil si es festivo)."],
    ["Duración y cancelación", `Sin plazo ni mínimo: continúa cada mes hasta que canceles. Cambios u omisiones antes del día ${CHANGE_DEADLINE_DAY} del mes anterior; cancelación en cualquier momento en tu página (antes de las 9:00 JST del día 1, ese mes no se cobra) o, si no puedes iniciar sesión, por correo a ryugecoffee@gmail.com (con verificación del remitente o de identidad; una solicitud recibida antes de las 9:00 JST del día 1 cuenta como anterior al cobro, y un mes cobrado por nuestro retraso se reembolsa completo: lo no enviado no se envía y lo ya enviado no requiere pago ni devolución). Sin cargo por cancelación.`],
    ["Reembolsos", `Los meses pagados se envían (sin reembolso prorrateado). Si cancelas antes del primer envío de 200 g, se reembolsa el primer pago (${yen(FIRST_PRICE)}) completo a tu tarjeta en 7 días hábiles. Alimentos: sin devoluciones por cambio de opinión; productos dañados o incorrectos, contáctanos en 7 días.`],
  ],
};
const SUBSCRIPTION_TITLE = { ja: "定期購入（珈琲の定期便）について", en: "Subscription (Coffee subscription)", es: "Suscripción de café" };
const SUBSCRIPTION_PAUSED_NOTE = { ja: "※ 現在、新規のお申し込みは休止しています。", en: "New sign-ups are currently paused.", es: "Las nuevas suscripciones están en pausa." };

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
      extraValue: "送料（1回のご注文につき1回。金額は「配送・送料について」のページに記載）。定期便は月額料金に送料を含みます。",
      payment: "支払方法",
      paymentValue:
        "クレジットカード決済（Square / Stripe）※商品や注文内容により異なります",
      timing: "支払時期",
      timingValue: "ご注文時にお支払いが確定します（定期便は下記のとおり）",
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
        "当店ではRyuge Coffeeとして、焙煎コーヒー豆、珈琲袋、お茶商品の販売を行っています。",
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
      extraValue: "Shipping, once per order (see Shipping & Delivery). Included in the subscription price.",
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
      extraValue: "Envío, una vez por pedido (ver Envío y Entrega). Incluido en el precio de la suscripción.",
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

      <h2>{SUBSCRIPTION_TITLE[lang] || SUBSCRIPTION_TITLE.ja}</h2>
      {SUBSCRIPTIONS_PAUSED && <p>{SUBSCRIPTION_PAUSED_NOTE[lang] || SUBSCRIPTION_PAUSED_NOTE.ja}</p>}
      {(SUBSCRIPTION_ROWS[lang] || SUBSCRIPTION_ROWS.ja).map(([label, value]) => (
        <p key={label}><strong>{label}</strong><br />{value}</p>
      ))}
      <p><Link to="/shipping" className="text-link">配送・送料について / Shipping</Link>・<Link to="/subscription/manage" className="text-link">定期便の管理ページ / Subscription page</Link></p>
    </div>
  );
}