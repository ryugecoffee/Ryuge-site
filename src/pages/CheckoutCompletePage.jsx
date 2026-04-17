import { useState, useEffect } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { trackPurchase } from "../lib/analytics";

const UI = {
  ja: {
    eyebrow: "Complete",
    title: "ご注文ありがとうございます",
    titleSub: "定期購入ありがとうございます",
    nameSuffix: "様",
    text: "ご注文を承りました。発送準備が整い次第、ご連絡いたします。",
    textSub: "定期購入を開始しました。次回お届けの準備が整い次第、ご連絡いたします。",
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
    loading: "読み込み中...",
  },
  en: {
    eyebrow: "Complete",
    title: "Thank you for your order",
    titleSub: "Thank you for your subscription",
    nameSuffix: "",
    text: "We've received your order and will be in touch once your shipment is ready.",
    textSub: "Your subscription has started. We'll be in touch when your first shipment is ready.",
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
    loading: "Loading...",
  },
  es: {
    eyebrow: "Complete",
    title: "Gracias por su pedido",
    titleSub: "Gracias por su suscripción",
    nameSuffix: "",
    text: "Hemos recibido su pedido y le avisaremos cuando el envío esté listo.",
    textSub: "Su suscripción ha comenzado. Le avisaremos cuando su primer envío esté listo.",
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
    loading: "Cargando...",
  },
};

export default function CheckoutCompletePage() {
  const { state } = useLocation();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [order, setOrder] = useState(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (state || !sessionId) return;

    const sentKey = `sub_sent_${sessionId}`;
    if (sessionStorage.getItem(sentKey)) {
      const cached = sessionStorage.getItem(`sub_order_${sessionId}`);
      if (cached) {
        try {
          setOrder(JSON.parse(cached));
        } catch (_) {}
      }
      return;
    }

    setFetching(true);
    fetch("https://ryuge-site.onrender.com/subscription-complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.order) {
          setOrder(data.order);
          sessionStorage.setItem(sentKey, "1");
          sessionStorage.setItem(`sub_order_${sessionId}`, JSON.stringify(data.order));
        }
      })
      .catch(console.error)
      .finally(() => setFetching(false));
  }, [sessionId, state]);

  const source = state || order || {};
  const isSubscription = !state && !!sessionId;

  const lang = source.lang || "ja";
  const t = UI[lang] || UI.ja;
  const items = source.items || [];
  const total = source.total;
  const shipping = source.shipping;
  const name = source.name || "";
  const postalCode = source.postalCode || "";
  const prefecture = source.prefecture || "";
  const address = source.address || "";
  const planTitle = source.planTitle || "";

  const fullAddress = [postalCode, prefecture, address].filter(Boolean).join(" ");
  const mapUrl = fullAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
    : "";

  useEffect(() => {
    if (!source || !source.items || source.items.length === 0) return;

    const transactionId =
      source.orderId ||
      source.paymentIntentId ||
      source.sessionId ||
      sessionId ||
      `order-${Date.now()}`;

    const sentKey = `ga_purchase_${transactionId}`;
    if (sessionStorage.getItem(sentKey)) return;

    trackPurchase({
      transactionId,
      cartItems: source.items,
      shipping: source.shipping || 0,
      tax: 0,
    });

    sessionStorage.setItem(sentKey, "1");
  }, [source, sessionId]);

  if (fetching) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg)",
        }}
      >
        <p
          style={{
            color: "rgba(255,255,255,0.38)",
            fontSize: "14px",
            letterSpacing: "0.1em",
          }}
        >
          {t.loading}
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "80px 48px 60px",
        background: "var(--bg)",
        gap: "64px",
      }}
    >
      <div
        style={{
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          maxWidth: "560px",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "11px",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.38)",
          }}
        >
          {t.eyebrow}
        </p>

        {name && (
          <p
            style={{
              margin: 0,
              fontSize: "clamp(13px, 1.1vw, 16px)",
              color: "rgba(255,255,255,0.52)",
              letterSpacing: "0.04em",
            }}
          >
            {name}
            {t.nameSuffix ? `　${t.nameSuffix}` : ""}
          </p>
        )}

        <h1
          style={{
            margin: 0,
            fontSize: "clamp(22px, 2vw, 32px)",
            fontWeight: 400,
            lineHeight: 1.12,
            letterSpacing: "-0.01em",
            color: "rgba(255,255,255,0.92)",
          }}
        >
          {isSubscription ? t.titleSub : t.title}
        </h1>

        <p
          style={{
            margin: 0,
            fontSize: "14px",
            lineHeight: 1.9,
            color: "rgba(255,255,255,0.52)",
          }}
        >
          {isSubscription ? t.textSub : t.text}
        </p>

        <Link
          to="/products"
          style={{
            fontSize: "12px",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.52)",
            borderBottom: "1px solid rgba(255,255,255,0.16)",
            paddingBottom: "3px",
            width: "fit-content",
            margin: "0 auto",
          }}
        >
          {t.back}
        </Link>
      </div>

      {isSubscription && (
        <div style={{ textAlign: "center", maxWidth: "520px" }}>
          <p
            style={{
              margin: "0 0 8px",
              fontSize: "12px",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.38)",
            }}
          >
            {t.manageTitle}
          </p>
          <p
            style={{
              margin: "0 0 16px",
              fontSize: "13px",
              color: "rgba(255,255,255,0.52)",
              lineHeight: 1.8,
            }}
          >
            {t.manageText}
          </p>
          <a
            href="https://billing.stripe.com/p/login/3cI28r8GV4GcaFV1L85AQ01"
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
      )}

      <div
        style={{
          width: "min(900px, 100%)",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "48px",
          alignItems: "start",
        }}
      >
        {(items.length > 0 || planTitle) && (
          <div>
            <p
              style={{
                margin: "0 0 14px",
                fontSize: "11px",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.38)",
              }}
            >
              {t.orderSummary}
            </p>

            <div style={{ display: "flex", flexDirection: "column" }}>
              {isSubscription && planTitle ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "10px 0",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      fontSize: "13px",
                      color: "rgba(255,255,255,0.82)",
                    }}
                  >
                    {planTitle}
                  </span>
                  <span
                    style={{
                      fontSize: "13px",
                      color: "rgba(255,255,255,0.72)",
                      minWidth: "70px",
                      textAlign: "right",
                    }}
                  >
                    —
                  </span>
                </div>
              ) : (
                items.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "10px 0",
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        fontSize: "13px",
                        color: "rgba(255,255,255,0.82)",
                      }}
                    >
                      {item.title}
                    </span>
                    <span
                      style={{
                        fontSize: "12px",
                        color: "rgba(255,255,255,0.38)",
                      }}
                    >
                      × {item.quantity}
                    </span>
                    <span
                      style={{
                        fontSize: "13px",
                        color: "rgba(255,255,255,0.72)",
                        minWidth: "70px",
                        textAlign: "right",
                      }}
                    >
                      ¥{(item.price * item.quantity).toLocaleString()}
                    </span>
                  </div>
                ))
              )}

              {!isSubscription && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "10px 0",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      fontSize: "13px",
                      color: "rgba(255,255,255,0.82)",
                    }}
                  >
                    {t.shipping}
                  </span>
                  <span
                    style={{
                      fontSize: "13px",
                      color: "rgba(255,255,255,0.72)",
                      minWidth: "70px",
                      textAlign: "right",
                    }}
                  >
                    {shipping === 0 ? t.free : `¥${Number(shipping || 0).toLocaleString()}`}
                  </span>
                </div>
              )}

              {!isSubscription && total != null && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: "16px",
                    fontSize: "18px",
                    fontWeight: 500,
                    color: "rgba(255,255,255,0.92)",
                  }}
                >
                  <span>{t.total}</span>
                  <span>¥{Number(total).toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {fullAddress && (
          <div>
            <p
              style={{
                margin: "0 0 14px",
                fontSize: "11px",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.38)",
              }}
            >
              {t.shippingInfo}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {postalCode && <p style={{ margin: 0 }}>〒{postalCode}</p>}
              <p style={{ margin: 0 }}>{prefecture}　{address}</p>

              {mapUrl && (
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    marginTop: "10px",
                    fontSize: "12px",
                    borderBottom: "1px solid rgba(255,255,255,0.16)",
                  }}
                >
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