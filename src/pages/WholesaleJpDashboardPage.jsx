// src/pages/WholesaleJpDashboardPage.jsx
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import RequireApproved from "../components/wholesale/RequireApproved";
import { PRODUCT_DATA } from "../productData";

const API_BASE = "https://ryuge-site.onrender.com";
const FREE_SHIPPING_THRESHOLD = 16000;

const C = {
  bg: "#050505",
  surface: "#0d0d0d",
  surfaceHover: "#131313",
  border: "rgba(255,255,255,0.08)",
  borderMid: "rgba(255,255,255,0.15)",
  text: "rgba(255,255,255,0.92)",
  soft: "rgba(255,255,255,0.60)",
  muted: "rgba(255,255,255,0.35)",
  green: "#6aaa78",
  red: "#b07070",
  amber: "#b09850",
};


// productData.js の全商品を id → isSoldOut のマップに変換
const SOLDOUT_MAP = (() => {
  const map = {};
  const allProducts = [
    ...(PRODUCT_DATA.enma || []),
    ...(PRODUCT_DATA.woodbox || []),
    ...(PRODUCT_DATA.bag || []),
    ...(PRODUCT_DATA.oriori || []),
  ];
  allProducts.forEach((p) => {
    map[p.id] = p.isSoldOut === true;
  });
  return map;
})();

// 卸商品マスタ
// productDataId: productData.js の id と紐づけ（null = 卸専用）
// minQty: 最低発注数、maxQty: 上限（null = 無制限）、step: 1個単位
const WHOLESALE_CATALOG = [
  {
    id: "zen-dark-simple",
    productDataId: null, // 卸専用。productData.js に存在しないため isSoldOut 連動なし
    name: "禅の深煎り 簡易包装",
    size: "100g",
    retailPrice: null,
    unitPrice: 600,
    description:
      "卸専用商品。最低限のシンプル包装で、コストを抑えた業務用ロット向け深煎りコーヒー。店頭販売・コース提供に。",
    minQty: 5,
    maxQty: null,
    orderNote: null,
    wholesaleOnly: true,
  },
  {
    id: "enma-ethiopia-dark",
    productDataId: "enma-ethiopia-dark",
    name: "閻魔 深煎り",
    size: "180g",
    retailPrice: 1700,
    unitPrice: 1190,
    description:
      "静かに残る苦味と余韻。深煎りの中に感じる丸みと、奥行きのある甘さ。スペシャルティの深煎りを卸価格でお届けします。",
    minQty: 1,
    maxQty: null,
    orderNote: null,
    wholesaleOnly: false,
  },
  {
    id: "enma-burundi-light",
    productDataId: "enma-burundi-light",
    name: "閻魔 ブルンジ浅煎り",
    size: "180g",
    retailPrice: 1900,
    unitPrice: 1330,
    description:
      "明るさと透明感、やわらかな甘さ。ブルンジ産ウォッシュドのクリーンな酸味と、オレンジ・アプリコットのような果実感。",
    minQty: 1,
    maxQty: null,
    orderNote: null,
    wholesaleOnly: false,
  },
  {
    id: "woodbox-geisha",
    productDataId: "woodbox-geisha",
    name: "木函 ホンジュラスゲイシャ",
    size: "100g",
    retailPrice: 2600,
    unitPrice: 1950,
    description:
      "木箱で届く贈り物のような静かなプレミアム。フローラルで透明感のあるゲイシャ種。ギフト需要にも最適な一品。",
    minQty: 1,
    maxQty: null,
    orderNote: null,
    wholesaleOnly: false,
  },
  {
    id: "enma-coffee-bag",
    productDataId: "enma-coffee-bag",
    name: "閻魔 珈琲バッグ",
    size: "8個入り",
    retailPrice: 2400,
    unitPrice: 1680,
    description:
      "スペシャルティコーヒーを手軽に。お湯を注いで2分待つだけ。シングルサーブのドリップバッグで本格的なコーヒーをご提供。",
    minQty: 6,
    maxQty: 40,
    orderNote: "41個以上はお問い合わせください",
    wholesaleOnly: false,
  },
  {
    id: "woodbox-tea-bag",
    productDataId: "woodbox-tea-bag",
    name: "木函 ほうじ茶バッグ",
    size: "8個入り",
    retailPrice: 2800,
    unitPrice: 1960,
    description:
      "上質なほうじ茶をバッグに。珈琲バッグと並べてご提供いただける茶のシリーズ。コーヒーとお茶のペアリング提案にも。",
    minQty: 6,
    maxQty: 40,
    orderNote: "41個以上はお問い合わせください",
    wholesaleOnly: false,
  },
];

// isSoldOut 連動フィルター適用済みリスト（卸専用は常に表示）
function getAvailableProducts() {
  return WHOLESALE_CATALOG.filter((p) => {
    if (p.wholesaleOnly || p.productDataId === null) return true;
    return !SOLDOUT_MAP[p.productDataId];
  });
}

export default function WholesaleJpDashboardPage() {
  return (
    <RequireApproved>
      <DashboardContent />
    </RequireApproved>
  );
}

function DashboardContent() {
  const { user, logout, isAdmin } = useAuth();
  const [tab, setTab] = useState("products");

  const NAV_TABS = [
    { key: "products", label: "商品" },
    { key: "orders",   label: "注文履歴" },
    { key: "account",  label: "アカウント" },
  ];

  return (
    <div style={{ minHeight: "100vh", backgroundColor: C.bg, color: C.text, }}>
      {/* ヘッダー */}
      <header
        style={{
          borderBottom: `1px solid ${C.border}`,
          backgroundColor: "rgba(5,5,5,0.96)",
          backdropFilter: "blur(8px)",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "0 2rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            height: "64px",
          }}
        >
          <Link
            to="/"
            className="site-logo"
            style={{
              textDecoration: "none",
              color: C.text,
              fontSize: "1.05rem",
              fontWeight: 600,
              textTransform: "uppercase",
              flexShrink: 0,
            }}
          >
            Ryuge Coffee
          </Link>

          <nav style={{ display: "flex" }}>
            {NAV_TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{
                  background: "none",
                  border: "none",
                  borderBottom:
                    tab === key
                      ? "2px solid rgba(255,255,255,0.85)"
                      : "2px solid transparent",
                  color: tab === key ? C.text : C.soft,
                  fontSize: "0.9rem",
                  letterSpacing: "0.06em",
                  padding: "0 1.4rem",
                  height: "64px",
                  cursor: "pointer",
    
                  transition: "color 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </button>
            ))}
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: "1.4rem", flexShrink: 0 }}>
            {isAdmin && (
              <Link
                to="/wholesale-jp/admin"
                style={{
                  color: C.amber,
                  fontSize: "0.78rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  textDecoration: "none",
                }}
              >
                管理画面
              </Link>
            )}
            <button
              onClick={logout}
              style={{
                background: "none",
                border: "none",
                color: C.muted,
                fontSize: "0.82rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                cursor: "pointer",
  
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* コンテンツ */}
      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "3rem 2rem 8rem" }}>
        {tab === "products" && <ProductsTab user={user} />}
        {tab === "orders"   && <OrdersTab user={user} />}
        {tab === "account"  && <AccountTab user={user} />}
      </main>
    </div>
  );
}

/* ====================================================
   商品タブ（カート一括発注）
==================================================== */
const PAYMENT_NOTE = {
  ja: "お支払いは請求書払いです。商品に請求書を同封してお届けします。送料は請求書に記載いたします。",
  en: "Payment is by invoice. An invoice will be enclosed with your order. Shipping costs will be included on the invoice.",
  es: "El pago es mediante factura. La factura se adjuntará con su pedido. Los gastos de envío se incluirán en la factura.",
};

function ProductsTab({ user }) {
  const products = getAvailableProducts();

  // 数量: { productId: number }（0 = 未選択）
  const [quantities, setQuantities] = useState(
    () => Object.fromEntries(products.map((p) => [p.id, 0]))
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // 在庫数: { productId: number | null }
  const [inventory, setInventory] = useState({});

  useEffect(() => {
    const fetchInventory = async () => {
      try {
        const snap = await getDocs(collection(db, "wholesaleInventory"));
        const inv = {};
        snap.forEach((d) => { inv[d.id] = d.data().stock ?? null; });
        setInventory(inv);
      } catch (e) {
        // 取得失敗時は非表示にするだけ
      }
    };
    fetchInventory();
  }, []);

  // 数量変更（バリデーション付き）
  const setQty = (id, raw) => {
    const product = products.find((p) => p.id === id);
    let v = parseInt(raw, 10);
    if (isNaN(v) || v < 0) v = 0;
    if (product.maxQty !== null && v > product.maxQty) v = product.maxQty;
    setQuantities((prev) => ({ ...prev, [id]: v }));
  };

  // カート内商品（qty > 0）
  const cartItems = products
    .filter((p) => quantities[p.id] > 0)
    .map((p) => ({
      ...p,
      qty: quantities[p.id],
      subtotal: quantities[p.id] * p.unitPrice,
    }));

  // バリデーション（最低個数チェック）
  const validationErrors = cartItems
    .filter((item) => item.qty < item.minQty)
    .map((item) => `「${item.name}」は最低${item.minQty}個からの発注です。`);

  const cartTotal = cartItems.reduce((s, i) => s + i.subtotal, 0);
  const freeShipping = cartTotal >= FREE_SHIPPING_THRESHOLD;
  const canSubmit = cartItems.length > 0 && validationErrors.length === 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError("");

    try {
      const userSnap = await getDoc(doc(db, "wholesaleUsers", user.uid));
      const userData = userSnap.exists() ? userSnap.data() : {};

      const orderItems = cartItems.map((item) => ({
        id: item.id,
        name: item.name,
        size: item.size,
        quantity: item.qty,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
      }));

      const orderData = {
        uid: user.uid,
        companyName: userData.companyName || "",
        email: user.email || "",
        items: orderItems,
        total: cartTotal,
        shipping: freeShipping ? "free" : "actual_cost",
        status: "pending",
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, "wholesaleOrders"), orderData);

      // メール通知（失敗しても続行）
      fetch(`${API_BASE}/wholesale-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...orderData, createdAt: new Date().toISOString() }),
      }).catch(() => {});

      setSubmitDone(true);
      // 数量リセット
      setQuantities(Object.fromEntries(products.map((p) => [p.id, 0])));
    } catch (e) {
      console.error("Order error:", e);
      setSubmitError("発注に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <SectionHeader label="Wholesale Products" title="商品一覧" />

      {/* 発注完了バナー */}
      {submitDone && (
        <div
          style={{
            marginBottom: "2rem",
            padding: "1rem 1.4rem",
            border: `1px solid ${C.green}`,
            color: C.green,
            fontSize: "0.95rem",
            lineHeight: 1.7,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>✓ 発注を受け付けました。確認メールをお送りします。</span>
          <button
            onClick={() => setSubmitDone(false)}
            style={{ background: "none", border: "none", color: C.green, cursor: "pointer", fontSize: "1.1rem" }}
          >
            ×
          </button>
        </div>
      )}

      {submitError && <ErrorBanner message={submitError} onClose={() => setSubmitError("")} />}

      {/* 商品カード一覧 */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1px", backgroundColor: C.border, marginBottom: "2.5rem" }}>
        {/* ヘッダー行 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 110px 110px 120px",
            gap: "1.5rem",
            backgroundColor: C.surface,
            padding: "0.7rem 1.5rem",
          }}
        >
          {["商品", "卸価格", "数量", "小計"].map((h) => (
            <p key={h} style={{ margin: 0, fontSize: "0.7rem", letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted }}>
              {h}
            </p>
          ))}
        </div>

        {products.map((product) => {
          const qty = quantities[product.id];
          const subtotal = qty * product.unitPrice;
          const belowMin = qty > 0 && qty < product.minQty;

          return (
            <div
              key={product.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 110px 120px 120px",
                gap: "1.5rem",
                backgroundColor: C.surface,
                padding: "1.4rem 1.5rem",
                alignItems: "start",
              }}
            >
              {/* 商品情報 */}
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", marginBottom: "0.3rem", flexWrap: "wrap" }}>
                  <p style={{ margin: 0, fontSize: "1rem", fontWeight: 500, color: C.text }}>
                    {product.name}
                  </p>
                  <p style={{ margin: 0, fontSize: "0.78rem", color: C.muted }}>
                    {product.size}
                  </p>
                  {product.wholesaleOnly && (
                    <span style={{ fontSize: "0.68rem", color: C.amber, border: `1px solid ${C.amber}`, padding: "0.1rem 0.4rem", letterSpacing: "0.06em" }}>
                      卸専用
                    </span>
                  )}
                </div>
                <p style={{ margin: "0 0 0.5rem", fontSize: "0.86rem", color: "rgba(255,255,255,0.85)", lineHeight: 1.7 }}>
                  {product.description}
                </p>
                <div style={{ display: "flex", gap: "1.2rem", flexWrap: "wrap" }}>
                  {product.retailPrice && (
                    <p style={{ margin: 0, fontSize: "0.75rem", color: C.muted }}>
                      定価 ¥{product.retailPrice.toLocaleString()}
                    </p>
                  )}
                  <p style={{ margin: 0, fontSize: "0.75rem", color: C.muted }}>
                    最低{product.minQty}個〜、1個単位
                    {product.maxQty && `、上限${product.maxQty}個`}
                  </p>
                  {product.orderNote && (
                    <p style={{ margin: 0, fontSize: "0.75rem", color: C.amber }}>
                      ※ {product.orderNote}
                    </p>
                  )}
                </div>
              </div>

              {/* 卸価格 */}
              <div style={{ paddingTop: "0.2rem" }}>
                <p style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: C.text }}>
                  ¥{product.unitPrice.toLocaleString()}
                </p>
                {product.retailPrice && (
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.72rem", color: C.muted }}>
                    ({Math.round((1 - product.unitPrice / product.retailPrice) * 100)}%OFF)
                  </p>
                )}
                {inventory[product.id] != null && (
                  <p style={{ margin: "0.3rem 0 0", fontSize: "0.72rem", color: C.muted }}>
                    在庫 {inventory[product.id]}
                  </p>
                )}
              </div>

              {/* 数量入力 */}
              <div style={{ paddingTop: "0.1rem" }}>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <button
                    onClick={() => setQty(product.id, qty - 1)}
                    disabled={qty <= 0}
                    style={{
                      width: "36px",
                      height: "44px",
                      backgroundColor: C.bg,
                      border: `1px solid ${belowMin ? C.red : C.borderMid}`,
                      borderRight: "none",
                      color: qty <= 0 ? C.muted : C.text,
                      fontSize: "1.1rem",
                      cursor: qty <= 0 ? "not-allowed" : "pointer",
        
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={product.maxQty || undefined}
                    step={1}
                    value={qty === 0 ? "" : qty}
                    placeholder="0"
                    onChange={(e) => setQty(product.id, e.target.value)}
                    style={{
                      width: "60px",
                      height: "44px",
                      backgroundColor: C.bg,
                      border: `1px solid ${belowMin ? C.red : C.borderMid}`,
                      color: C.text,
                      fontSize: "1rem",
                      padding: "0",
        
                      outline: "none",
                      boxSizing: "border-box",
                      textAlign: "center",
                      MozAppearance: "textfield",
                    }}
                  />
                  <button
                    onClick={() => setQty(product.id, qty + 1)}
                    disabled={product.maxQty !== null && qty >= product.maxQty}
                    style={{
                      width: "36px",
                      height: "44px",
                      backgroundColor: C.bg,
                      border: `1px solid ${belowMin ? C.red : C.borderMid}`,
                      borderLeft: "none",
                      color: (product.maxQty !== null && qty >= product.maxQty) ? C.muted : C.text,
                      fontSize: "1.1rem",
                      cursor: (product.maxQty !== null && qty >= product.maxQty) ? "not-allowed" : "pointer",
        
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    ＋
                  </button>
                </div>
                {belowMin && (
                  <p style={{ margin: "0.3rem 0 0", fontSize: "0.72rem", color: C.red }}>
                    最低{product.minQty}個
                  </p>
                )}
              </div>

              {/* 小計 */}
              <div style={{ paddingTop: "0.2rem" }}>
                <p style={{
                  margin: 0,
                  fontSize: qty > 0 ? "1.05rem" : "0.9rem",
                  fontWeight: qty > 0 ? 600 : 400,
                  color: qty > 0 ? C.text : C.muted,
                }}>
                  {qty > 0 ? `¥${subtotal.toLocaleString()}` : "—"}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* 支払い方法の説明 */}
      <div
        style={{
          border: `1px solid ${C.border}`,
          backgroundColor: C.surface,
          padding: "1.4rem 1.6rem",
          marginBottom: "2rem",
        }}
      >
        <p style={{ margin: "0 0 0.8rem", fontSize: "0.68rem", letterSpacing: "0.16em", textTransform: "uppercase", color: C.muted }}>
          Payment / Pago
        </p>
        {Object.entries(PAYMENT_NOTE).map(([lang, text]) => (
          <p key={lang} style={{ margin: "0 0 0.4rem", fontSize: "0.85rem", color: "rgba(255,255,255,0.65)", lineHeight: 1.8 }}>
            {text}
          </p>
        ))}
      </div>

      {/* カート集計・発注 */}
      <div
        style={{
          border: `1px solid ${C.border}`,
          backgroundColor: C.surface,
          padding: "2rem 2rem",
          maxWidth: "540px",
          marginLeft: "auto",
        }}
      >
        <p style={{ margin: "0 0 1.2rem", fontSize: "0.72rem", letterSpacing: "0.16em", textTransform: "uppercase", color: C.muted }}>
          発注内容
        </p>

        {cartItems.length === 0 ? (
          <p style={{ margin: "0 0 1.5rem", fontSize: "0.9rem", color: C.muted }}>
            数量を入力してください。
          </p>
        ) : (
          <div style={{ marginBottom: "1.5rem" }}>
            {cartItems.map((item) => (
              <div key={item.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.6rem" }}>
                <p style={{ margin: 0, fontSize: "0.9rem", color: C.soft }}>
                  {item.name}（{item.size}）× {item.qty}個
                </p>
                <p style={{ margin: 0, fontSize: "0.9rem", color: C.text, flexShrink: 0, marginLeft: "1rem" }}>
                  ¥{item.subtotal.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* 合計・送料 */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "1rem", marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <p style={{ margin: 0, fontSize: "0.88rem", color: C.soft }}>小計（税別）</p>
            <p style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600, color: C.text }}>
              ¥{cartTotal.toLocaleString()}
            </p>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <p style={{ margin: 0, fontSize: "0.85rem", color: C.soft }}>送料</p>
            <p style={{
              margin: 0,
              fontSize: "0.9rem",
              color: freeShipping ? C.green : C.amber,
            }}>
              {cartTotal === 0
                ? "—"
                : freeShipping
                ? "無料"
                : "実費（発注後に別途ご連絡）"}
            </p>
          </div>
          {!freeShipping && cartTotal > 0 && (
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.75rem", color: C.muted, textAlign: "right" }}>
              あと¥{(FREE_SHIPPING_THRESHOLD - cartTotal).toLocaleString()}で送料無料
            </p>
          )}
        </div>

        {/* バリデーションエラー */}
        {validationErrors.length > 0 && (
          <div style={{ marginBottom: "1rem" }}>
            {validationErrors.map((e, i) => (
              <p key={i} style={{ margin: "0 0 0.3rem", fontSize: "0.82rem", color: C.red }}>
                ⚠ {e}
              </p>
            ))}
          </div>
        )}

        {/* 発注ボタン */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          style={{
            width: "100%",
            height: "52px",
            backgroundColor: "transparent",
            border: `1px solid ${canSubmit ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.12)"}`,
            color: canSubmit ? C.text : C.muted,
            fontSize: "0.9rem",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            cursor: canSubmit && !submitting ? "pointer" : "not-allowed",
          
            transition: "border-color 0.15s",
          }}
          onMouseEnter={(e) => {
            if (canSubmit && !submitting)
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.65)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = canSubmit
              ? "rgba(255,255,255,0.35)"
              : "rgba(255,255,255,0.12)";
          }}
        >
          {submitting ? "処理中..." : "発注する"}
        </button>

        <p style={{ margin: "0.8rem 0 0", fontSize: "0.75rem", color: C.muted, lineHeight: 1.7, textAlign: "center" }}>
          発注後、担当者より確認のご連絡をいたします。
        </p>
      </div>
    </div>
  );
}

/* ====================================================
   注文履歴タブ
==================================================== */
function OrdersTab({ user }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    const fetchOrders = async () => {
      try {
        // orderBy を使わずクライアントソートすることでインデックス不要にする
        const q = query(
          collection(db, "wholesaleOrders"),
          where("uid", "==", user.uid)
        );
        const snap = await getDocs(q);
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const ta = a.createdAt?.toDate?.() ?? new Date(0);
            const tb = b.createdAt?.toDate?.() ?? new Date(0);
            return tb - ta; // 新しい順
          });
        setOrders(docs);
      } catch (e) {
        console.error("Orders fetch error:", e);
        setError("注文履歴の取得に失敗しました。");
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, [user]);

  const STATUS = {
    pending:   { label: "受付中",     color: C.amber },
    shipped:   { label: "発送済み",   color: C.green },
    cancelled: { label: "キャンセル", color: C.red },
  };

  return (
    <div>
      <SectionHeader label="Order History" title="注文履歴" />

      {loading ? (
        <p style={{ color: C.muted, fontSize: "0.95rem" }}>Loading...</p>
      ) : error ? (
        <ErrorBanner message={error} />
      ) : orders.length === 0 ? (
        <p style={{ color: C.muted, fontSize: "0.95rem" }}>注文履歴はありません。</p>
      ) : (
        <div style={{ border: `1px solid ${C.border}`, overflow: "hidden" }}>
          {/* ヘッダー */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "130px 1fr 80px 120px 110px 110px",
              gap: "1rem",
              backgroundColor: C.surface,
              padding: "0.8rem 1.5rem",
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            {["注文日", "商品", "数量", "合計", "送料", "ステータス"].map((h) => (
              <p key={h} style={{ margin: 0, fontSize: "0.7rem", letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted }}>
                {h}
              </p>
            ))}
          </div>

          {orders.map((order) => {
            const date = order.createdAt?.toDate
              ? order.createdAt.toDate().toLocaleDateString("ja-JP", {
                  year: "numeric", month: "2-digit", day: "2-digit",
                })
              : "—";
            const itemLabel = (order.items || [])
              .map((i) => `${i.name}（${i.size || ""}）×${i.quantity}`)
              .join(" / ");
            const totalQty = (order.items || []).reduce((s, i) => s + i.quantity, 0);
            const st = STATUS[order.status] || { label: order.status || "—", color: C.muted };
            const shippingLabel =
              order.shipping === "free" ? "無料" : order.shipping === "actual_cost" ? "実費" : "—";
            const shippingColor = order.shipping === "free" ? C.green : C.soft;

            return (
              <div
                key={order.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "130px 1fr 80px 120px 110px 110px",
                  gap: "1rem",
                  padding: "1.1rem 1.5rem",
                  borderBottom: `1px solid ${C.border}`,
                  alignItems: "start",
                }}
              >
                <p style={{ margin: 0, fontSize: "0.88rem", color: C.soft }}>{date}</p>
                <p style={{ margin: 0, fontSize: "0.9rem", color: C.text, lineHeight: 1.7 }}>{itemLabel}</p>
                <p style={{ margin: 0, fontSize: "0.9rem", color: C.soft }}>{totalQty}個</p>
                <p style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>¥{(order.total || 0).toLocaleString()}</p>
                <p style={{ margin: 0, fontSize: "0.85rem", color: shippingColor }}>{shippingLabel}</p>
                <p style={{ margin: 0, fontSize: "0.85rem", color: st.color }}>{st.label}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ====================================================
   アカウントタブ
==================================================== */
const ACCOUNT_FIELDS = [
  { key: "companyName",  label: "貴社名・店舗名",   editable: true },
  { key: "contactName",  label: "担当者名",          editable: true },
  { key: "email",        label: "メールアドレス",     editable: false },
  { key: "businessType", label: "業種",               editable: true },
  { key: "postalCode",   label: "郵便番号",           editable: true },
  { key: "prefecture",   label: "都道府県",           editable: true },
  { key: "city",         label: "市区町村・番地",     editable: true },
  { key: "building",     label: "建物名・部屋番号",   editable: true },
];

function AccountTab({ user }) {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Firestoreドキュメントの参照を保持（自動ID対応）
  const [docRef, setDocRef] = useState(null);

  useEffect(() => {
    if (!user) return;
    const fetchAccount = async () => {
      // まず uid をドキュメントIDとして直接取得を試みる
      try {
        const direct = await getDoc(doc(db, "wholesaleUsers", user.uid));
        if (direct.exists()) {
          setDocRef(doc(db, "wholesaleUsers", user.uid));
          setData(direct.data());
          setForm(direct.data());
          return;
        }
      } catch (_) {}

      // 見つからなければ uid フィールドでクエリ（サーバーが addDoc で作成した場合）
      try {
        const q = query(
          collection(db, "wholesaleUsers"),
          where("uid", "==", user.uid)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const d = snap.docs[0];
          setDocRef(d.ref);
          setData(d.data());
          setForm(d.data());
        } else {
          // ドキュメントが存在しない場合は空オブジェクトで初期化
          setData({});
          setForm({});
        }
      } catch (e) {
        console.error("Account fetch error:", e);
        setData({});
        setForm({});
      }
    };
    fetchAccount();
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    const ref = docRef || doc(db, "wholesaleUsers", user.uid);
    try {
      await updateDoc(ref, form);
      setData({ ...form });
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error("Save error:", e);
      setSaveError("保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <SectionHeader label="Account" title="アカウント情報" />

      {!data ? (
        <p style={{ color: C.muted, fontSize: "0.95rem" }}>Loading...</p>
      ) : (
        <div style={{ maxWidth: "640px" }}>
          {saved && (
            <div style={{ marginBottom: "1.5rem", padding: "0.9rem 1.2rem", border: `1px solid ${C.green}`, color: C.green, fontSize: "0.9rem" }}>
              ✓ 保存しました。
            </div>
          )}
          {saveError && <ErrorBanner message={saveError} />}

          <div style={{ display: "flex", flexDirection: "column", gap: "1.4rem", marginBottom: "2.5rem" }}>
            {ACCOUNT_FIELDS.map(({ key, label, editable }) => {
              const value = key === "email" ? user.email : (data[key] || "");
              return (
                <div key={key}>
                  <p style={{ margin: "0 0 0.4rem", fontSize: "0.75rem", color: C.muted, letterSpacing: "0.1em" }}>
                    {label}
                    {!editable && (
                      <span style={{ marginLeft: "0.6rem", fontSize: "0.68rem", color: C.muted }}>
                        （変更不可）
                      </span>
                    )}
                  </p>
                  {editing && editable ? (
                    <input
                      value={form[key] || ""}
                      onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                      style={{
                        width: "100%", height: "48px",
                        backgroundColor: C.surface,
                        border: `1px solid ${C.borderMid}`,
                        color: C.text,
                        padding: "0 1rem",
                        fontSize: "0.95rem",
          
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  ) : (
                    <p style={{ margin: 0, fontSize: "0.97rem", color: value ? C.text : C.muted, lineHeight: 1.6 }}>
                      {value || "—"}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: "1rem" }}>
            {editing ? (
              <>
                <button onClick={handleSave} disabled={saving} style={primaryBtnStyle}>
                  {saving ? "保存中..." : "保存する"}
                </button>
                <button onClick={() => { setEditing(false); setForm(data); setSaveError(""); }} style={secondaryBtnStyle}>
                  キャンセル
                </button>
              </>
            ) : (
              <button onClick={() => setEditing(true)} style={primaryBtnStyle}>
                編集する
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ====================================================
   共通コンポーネント・スタイル
==================================================== */
function SectionHeader({ label, title }) {
  return (
    <div style={{ marginBottom: "2.5rem" }}>
      <p style={{ margin: "0 0 0.5rem", fontSize: "0.68rem", letterSpacing: "0.24em", textTransform: "uppercase", color: C.muted }}>
        {label}
      </p>
      <h1 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 500, letterSpacing: "0.04em" }}>
        {title}
      </h1>
    </div>
  );
}

function ErrorBanner({ message, onClose }) {
  return (
    <div
      style={{
        marginBottom: "1.5rem",
        padding: "0.9rem 1.2rem",
        border: `1px solid ${C.red}`,
        color: C.red,
        fontSize: "0.9rem",
        lineHeight: 1.7,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span>{message}</span>
      {onClose && (
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: "1.1rem", marginLeft: "1rem" }}>×</button>
      )}
    </div>
  );
}

const primaryBtnStyle = {
  height: "48px",
  padding: "0 2rem",
  backgroundColor: "transparent",
  border: "1px solid rgba(255,255,255,0.30)",
  color: "rgba(255,255,255,0.92)",
  fontSize: "0.9rem",
  letterSpacing: "0.1em",
  cursor: "pointer",

};

const secondaryBtnStyle = {
  height: "48px",
  padding: "0 2rem",
  backgroundColor: "transparent",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "rgba(255,255,255,0.45)",
  fontSize: "0.9rem",
  letterSpacing: "0.1em",
  cursor: "pointer",

};
