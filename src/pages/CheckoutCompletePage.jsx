import { Link, useLocation } from "react-router-dom";

const UI = {
  ja: {
    eyebrow: "Complete",
    title: "ご注文ありがとうございます",
    nameSuffix: "様",
    text: "ご注文を承りました。発送準備が整い次第、ご連絡いたします。",
    orderSummary: "ご注文内容",
    shippingInfo: "お届け先",
    total: "合計",
    shipping: "送料",
    free: "無料",
    map: "Google Mapsで確認 →",
    back: "商品ページへ戻る",
    manageTitle: "定期購入について",
    manageText: "定期購入の確認・解約・お支払い方法の変更は以下から行えます。",
    manageLink: "サブスクを管理する",
  },
  en: {
    eyebrow: "Complete",
    title: "Thank you for your order",
    nameSuffix: "",
    text: "We've received your order and will be in touch once your shipment is ready.",
    orderSummary: "Order Summary",
    shippingInfo: "Shipping Address",
    total: "Total",
    shipping: "Shipping",
    free: "Free",
    map: "View on Google Maps →",
    back: "Back to Products",
    manageTitle: "Subscription",
    manageText: "You can manage, cancel, or update your subscription here:",
    manageLink: "Manage Subscription",
  },
  es: {
    eyebrow: "Complete",
    title: "Gracias por su pedido",
    nameSuffix: "",
    text: "Hemos recibido su pedido y le avisaremos cuando el envío esté listo.",
    orderSummary: "Resumen del pedido",
    shippingInfo: "Dirección de envío",
    total: "Total",
    shipping: "Envío",
    free: "Gratis",
    map: "Ver en Google Maps →",
    back: "Volver a productos",
    manageTitle: "Suscripción",
    manageText: "Puede gestionar, cancelar o actualizar su suscripción aquí:",
    manageLink: "Gestionar suscripción",
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
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 48px 60px", background: "var(--bg)", gap: "64px" }}>

      {/* 上段 */}
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "16px", maxWidth: "560px" }}>
        <p style={{ margin: 0, fontSize: "11px", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.38)" }}>
          {t.eyebrow}
        </p>

        {name && (
          <p style={{ margin: 0, fontSize: "clamp(13px, 1.1vw, 16px)", color: "rgba(255,255,255,0.52)", letterSpacing: "0.04em" }}>
            {name}{t.nameSuffix ? `　${t.nameSuffix}` : ""}
          </p>
        )}

        <h1 style={{ margin: 0, fontSize: "clamp(22px, 2vw, 32px)", fontWeight: 400, lineHeight: 1.12, letterSpacing: "-0.01em", color: "rgba(255,255,255,0.92)" }}>
          {t.title}
        </h1>

        <p style={{ margin: 0, fontSize: "14px", lineHeight: 1.9, color: "rgba(255,255,255,0.52)" }}>
          {t.text}
        </p>

        <Link to="/products" style={{ fontSize: "12px", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.52)", borderBottom: "1px solid rgba(255,255,255,0.16)", paddingBottom: "3px", width: "fit-content", margin: "0 auto" }}>
          {t.back}
        </Link>
      </div>

      {/* 🔥 サブスク管理ブロック（追加部分） */}
      <div style={{ textAlign: "center", maxWidth: "520px" }}>
        <p style={{ margin: "0 0 8px", fontSize: "12px", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.38)" }}>
          {t.manageTitle}
        </p>

        <p style={{ margin: "0 0 16px", fontSize: "13px", color: "rgba(255,255,255,0.52)", lineHeight: 1.8 }}>
          {t.manageText}
        </p>

        <a
          href="https://billing.stripe.com/p/login/1Zu4gz7CR4Gc15I0H45AQ00"
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-block",
            fontSize: "13px",
            letterSpacing: "0.08em",
            color: "rgba(255,255,255,0.85)",
            borderBottom: "1px solid rgba(255,255,255,0.3)",
            paddingBottom: "4px",
          }}
        >
          {t.manageLink}
        </a>
      </div>

      {/* 下段 */}
      <div style={{ width: "min(900px, 100%)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "48px", alignItems: "start" }}>

        {items.length > 0 && (
          <div>
            <p style={{ margin: "0 0 14px", fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.38)" }}>
              {t.orderSummary}
            </p>

            <div style={{ display: "flex", flexDirection: "column" }}>
              {items.map((item) => (
                <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ flex: 1, fontSize: "13px", color: "rgba(255,255,255,0.82)" }}>{item.title}</span>
                  <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.38)" }}>× {item.quantity}</span>
                  <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.72)", minWidth: "70px", textAlign: "right" }}>¥{(item.price * item.quantity).toLocaleString()}</span>
                </div>
              ))}

              <div style={{ display: "flex", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <span style={{ flex: 1, fontSize: "13px", color: "rgba(255,255,255,0.82)" }}>{t.shipping}</span>
                <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.72)", minWidth: "70px", textAlign: "right" }}>
                  {shipping === 0 ? t.free : `¥${Number(shipping || 0).toLocaleString()}`}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "16px", fontSize: "18px", fontWeight: 500, color: "rgba(255,255,255,0.92)" }}>
                <span>{t.total}</span>
                <span>¥{Number(total || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {fullAddress && (
          <div>
            <p style={{ margin: "0 0 14px", fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.38)" }}>
              {t.shippingInfo}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {postalCode && <p style={{ margin: 0 }}>〒{postalCode}</p>}
              <p style={{ margin: 0 }}>{prefecture}　{address}</p>

              {mapUrl && (
                <a href={mapUrl} target="_blank" rel="noreferrer" style={{ marginTop: "10px", fontSize: "12px", borderBottom: "1px solid rgba(255,255,255,0.16)" }}>
                  {t.map}
                </a>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}