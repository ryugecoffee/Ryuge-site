export default function RefundPolicy({ lang }) {
  const TEXT = {
    ja: {
      title: "返品・返金ポリシー",
      content: `
当店では、お客様に安心してご利用いただけるよう、以下の通り返品・返金ポリシーを定めております。

■ 商品の性質について
当店の商品は食品（コーヒー豆・コーヒーバッグ・お茶バッグ）であるため、原則としてお客様都合による返品・交換はお受けしておりません。

■ 不良品・誤配送について
万が一、商品に不備があった場合、またはご注文内容と異なる商品が届いた場合は、商品到着後7日以内にご連絡ください。
内容を確認の上、交換または返金対応をさせていただきます。

■ 返金方法
返金は、ご購入時の決済方法に応じて対応いたします。

■ 定期購入のキャンセル
定期購入の解約は、次回決済日前までにお手続きください。
既に決済が完了している注文についてはキャンセルできません。

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
Subscriptions must be canceled before the next billing date.
Orders that have already been processed cannot be canceled.

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
Las suscripciones deben cancelarse antes de la próxima fecha de facturación.
Los pedidos ya procesados no pueden cancelarse.

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