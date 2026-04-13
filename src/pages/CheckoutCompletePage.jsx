import { Link, useLocation } from "react-router-dom";

const UI = {
  ja: {
    eyebrow: "Complete",
    title: "ご注文ありがとうございます",
    text: "ご注文を承りました。発送準備が整い次第、ご連絡いたします。",
    orderSummary: "ご注文内容",
    shippingInfo: "お届け先",
    total: "合計",
    shipping: "送料",
    free: "無料",
    map: "Google Mapsで確認",
    back: "商品ページへ戻る",
    nameSuffix: "様",
  },
  en: {
    eyebrow: "Complete",
    title: "Thank you for your order",
    text: "We’ve received your order. We’ll contact you once your shipment is ready.",
    orderSummary: "Order Summary",
    shippingInfo: "Shipping Address",
    total: "Total",
    shipping: "Shipping",
    free: "Free",
    map: "View on Google Maps",
    back: "Back to Products",
    nameSuffix: "",
  },
  es: {
    eyebrow: "Complete",
    title: "Gracias por su pedido",
    text: "Hemos recibido su pedido. Le avisaremos en cuanto el envío esté listo.",
    orderSummary: "Resumen del pedido",
    shippingInfo: "Dirección de envío",
    total: "Total",
    shipping: "Envío",
    free: "Gratis",
    map: "Ver en Google Maps",
    back: "Volver a productos",
    nameSuffix: "",
  },
};

export default function CheckoutCompletePage() {
  const { state } = useLocation();

  const lang = state?.lang || "ja";
  const t = UI[lang] || UI.ja;

  const items = state?.items || [];
  const total = state?.total;
  const shipping = state?.shipping;
  const name = state?.name || "";
  const postalCode = state?.postalCode || "";
  const prefecture = state?.prefecture || "";
  const address = state?.address || "";

  const fullAddress = [postalCode, prefecture, address].filter(Boolean).join(" ");
  const mapUrl = fullAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
    : "";

  return (
    <div className="checkout-page">
      <div className="checkout-inner checkout-complete-inner">
        <p className="checkout-eyebrow">{t.eyebrow}</p>

        <h1 className="checkout-title">
          {name ? `${name}${t.nameSuffix ? ` ${t.nameSuffix}` : ""}` : ""}
          {name ? " " : ""}
          {t.title}
        </h1>

        <p className="checkout-complete-text">{t.text}</p>

        {items.length > 0 && (
          <div className="checkout-order-summary" style={{ marginTop: "32px" }}>
            <p className="checkout-section-label">{t.orderSummary}</p>

            {items.map((item) => (
              <div key={item.id} className="checkout-order-item">
                <span className="checkout-order-title">{item.title}</span>
                <span className="checkout-order-qty">× {item.quantity}</span>
                <span className="checkout-order-price">
                  ¥{(item.price * item.quantity).toLocaleString()}
                </span>
              </div>
            ))}

            <div className="checkout-order-item">
              <span className="checkout-order-title">{t.shipping}</span>
              <span className="checkout-order-price">
                {shipping === 0 ? t.free : `¥${Number(shipping || 0).toLocaleString()}`}
              </span>
            </div>

            <div className="checkout-order-total">
              <span>{t.total}</span>
              <span>¥{Number(total || 0).toLocaleString()}</span>
            </div>
          </div>
        )}

        {fullAddress && (
          <div className="checkout-card-section" style={{ marginTop: "28px" }}>
            <p className="checkout-section-label">{t.shippingInfo}</p>

            <div className="checkout-card-container" style={{ padding: "18px 0" }}>
              {postalCode && <p className="checkout-complete-text">〒{postalCode}</p>}
              <p className="checkout-complete-text" style={{ marginTop: "8px" }}>
                {prefecture} {address}
              </p>

              {mapUrl && (
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="checkout-back-to-products"
                  style={{ display: "inline-block", marginTop: "18px" }}
                >
                  {t.map}
                </a>
              )}
            </div>
          </div>
        )}

        <Link to="/products" className="checkout-back-to-products" style={{ marginTop: "28px" }}>
          {t.back}
        </Link>
      </div>
    </div>
  );
}