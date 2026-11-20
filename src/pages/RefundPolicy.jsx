export default function RefundPolicy({ lang }) {
  const TEXT = {
    ja: {
      title: "返品・返金ポリシー",
      content: `
当店では、お客様に安心してご利用いただけるよう、以下の通り返品・返金ポリシーを定めております。

■ 商品の性質について
当店の商品は食品（コーヒー豆・コーヒーバッグ・一煎袋）であるため、原則としてお客様都合による返品・交換はお受けしておりません。

■ 不良品・誤配送について
万が一、商品に不備があった場合、またはご注文内容と異なる商品が届いた場合は、商品到着後7日以内にご連絡ください。
内容を確認の上、交換または返金対応をさせていただきます。

■ 返金方法
返金は、ご購入時の決済方法に応じて対応いたします。

■ 定期購入（珈琲の定期便）の解約
管理ページからいつでも解約できます。毎月1日のご請求（日本時間9時）より前に解約されると、その月以降のご請求はありません。解約手数料・違約金はありません。
管理ページにログインできない場合は、ryugecoffee@gmail.com へ件名「定期便の解約希望」でご連絡いただいても解約できます。ご登録のメールアドレスからのご連絡はそのまま、別のアドレスからの場合はご登録のメールアドレス・郵便番号・電話番号の下4桁でご本人を確認します。毎月1日9時のご請求より前に届いたご連絡は、その月のご請求より前の解約として扱います（当店の手続きが遅れてその月のご請求が発生した場合は、その月分を全額返金し、その月の発送は行いません）。
お支払い済みの月の分はお届けし、日割りの返金はありません。
初回の200gを発送する前に解約された場合は、初回分3,000円を全額、お支払いに使われたカードへ返金します（解約から7営業日以内に手続きします）。発送後の解約では、初回分の返金はありません。

■ お問い合わせ
ryugecoffee@gmail.com
      `,
    },

    en: {
      title: "Refund & Cancellation Policy",
      content: `
We aim to provide a clear and fair refund and cancellation policy.

■ Product Nature
As our products are consumable goods (coffee beans, coffee bags, tea bags), we do not accept returns or exchanges due to customer preference.

■ Damaged or Incorrect Items
If you receive a defective or incorrect item, please contact us within 7 days of delivery.
We will review the issue and provide a replacement or refund if applicable.

■ Refund Method
Refunds will be issued using the original payment method.

■ Subscription Cancellation
Cancel any time on your subscription page. Cancelled before 9:00 JST on the 1st, that month and later months are not charged.
If you cannot sign in, email ryugecoffee@gmail.com ("定期便の解約希望"); we confirm it is you (from your registered address, or by your registered email, postal code and the last 4 digits of your phone). A request that arrives before 9:00 JST on the 1st counts as before that month's charge; if our handling is late and the month is charged, that month is refunded in full and not shipped.
No cancellation fee. Paid months are delivered, with no pro-rated refunds.
If cancelled before the first 200 g is shipped, the first ¥3,000 is refunded in full to your card within 7 business days of cancelling.

■ Contact
ryugecoffee@gmail.com
      `,
    },

    es: {
      title: "Política de Reembolsos y Cancelaciones",
      content: `
Nuestro objetivo es ofrecer una política clara y justa de reembolsos y cancelaciones.

■ Naturaleza del producto
Dado que nuestros productos son bienes consumibles (café en grano, bolsas de café y bolsas de té), no aceptamos devoluciones o cambios por preferencias del cliente.

■ Productos defectuosos o incorrectos
Si recibe un producto defectuoso o incorrecto, contáctenos dentro de los 7 días posteriores a la entrega.
Revisaremos el caso y ofreceremos un reemplazo o reembolso si corresponde.

■ Método de reembolso
Los reembolsos se realizarán utilizando el método de pago original.

■ Cancelación de suscripciones
Puedes cancelar en cualquier momento en tu página de suscripción. Si cancelas antes de las 9:00 (hora de Japón) del día 1, ese mes y los siguientes no se cobran.
Si no puedes iniciar sesión, escribe a ryugecoffee@gmail.com ("定期便の解約希望"); confirmamos tu identidad (desde tu correo registrado, o con tu correo registrado, código postal y los 4 últimos dígitos de tu teléfono). Una solicitud recibida antes de las 9:00 (hora de Japón) del día 1 cuenta como anterior al cobro de ese mes; si nuestra gestión se retrasa y se cobra ese mes, se reembolsa completo y no se envía.
Sin cargo por cancelación. Los meses pagados se envían, sin reembolsos prorrateados.
Si cancelas antes del envío de los primeros 200 g, el primer pago de ¥3,000 se reembolsa completo a tu tarjeta en 7 días hábiles.

■ Contacto
ryugecoffee@gmail.com
      `,
    },
  };

  const t = TEXT[lang] || TEXT.ja;

  return (
    <div className="legal-page">
      <h1>{t.title}</h1>
      <p className="pre-line">{t.content}</p>
    </div>
  );
}