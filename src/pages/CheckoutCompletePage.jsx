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

      {/* 上段：名前・タイトル・メッセージ（中央） */}
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "16px", maxWidth: "560px" }}>
        <p style={{ margin: 0, fontSize: "11px", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.38)" }}>
          {t.eyebrow}
        </p>
        {name && (
          <p style={{ margin: 0, fontSize: "clamp(13px, 1.1vw, 16px)", color: "rgba(255,255,255,0.52)", letterSpacing: "0.04em" }}>
            {name}{t.nameSuffix ? `　${t.nameSuffix}` : ""}
          </p>
        )}
        <h1 style={{ margin: 0, fontSize: "clamp(28px, 3.2vw, 48px)", fontWeight: 400, lineHeight: 1.12, letterSpacing: "-0.01em", color: "rgba(255,255,255,0.92)" }}>
          {t.title}
        </h1>
        <p style={{ margin: 0, fontSize: "14px", lineHeight: 1.9, color: "rgba(255,255,255,0.52)" }}>
          {t.text}
        </p>
        <Link to="/products" style={{ fontSize: "12px", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.52)", borderBottom: "1px solid rgba(255,255,255,0.16)", paddingBottom: "3px", width: "fit-content", margin: "0 auto" }}>
          {t.back}
        </Link>
      </div>

      {/* 下段：注文内容（左）・住所（右） */}
      <div style={{ width: "min(900px, 100%)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "48px", alignItems: "start" }}>

        {/* 左：注文内容 */}
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
              <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <span style={{ flex: 1, fontSize: "13px", color: "rgba(255,255,255,0.82)" }}>{t.shipping}</span>
                <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.72)", minWidth: "70px", textAlign: "right" }}>{shipping === 0 ? t.free : `¥${Number(shipping || 0).toLocaleString()}`}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: "16px", fontSize: "18px", fontWeight: 500, color: "rgba(255,255,255,0.92)" }}>
                <span>{t.total}</span>
                <span>¥{Number(total || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* 右：お届け先 */}
        {fullAddress && (
          <div>
            <p style={{ margin: "0 0 14px", fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.38)" }}>
              {t.shippingInfo}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {postalCode && (
                <p style={{ margin: 0, fontSize: "13px", color: "rgba(255,255,255,0.72)" }}>〒{postalCode}</p>
              )}
              <p style={{ margin: 0, fontSize: "13px", color: "rgba(255,255,255,0.72)" }}>{prefecture}　{address}</p>
              {mapUrl && (
                <a href={mapUrl} target="_blank" rel="noreferrer" style={{ marginTop: "10px", fontSize: "12px", letterSpacing: "0.08em", color: "rgba(255,255,255,0.52)", borderBottom: "1px solid rgba(255,255,255,0.16)", paddingBottom: "3px", width: "fit-content" }}>
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