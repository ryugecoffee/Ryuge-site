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

const API_BASE = "https://ryuge-site.onrender.com";

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

const FONT =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';

// 卸商品マスタ（isSoldOut: true の商品は非表示）
const WHOLESALE_PRODUCTS = [
  {
    id: "enma",
    name: "閻魔 珈琲バッグ",
    description:
      "Ryuge Coffeeの看板商品。深く力強い閻魔ブレンドをドリップバッグに仕上げました。シングルサーブで手軽に本格的なコーヒー体験を提供できます。",
    unitPrice: 1680,
    minQty: 6,
    isSoldOut: false,
  },
];

export default function WholesaleJpDashboardPage() {
  return (
    <RequireApproved>
      <DashboardContent />
    </RequireApproved>
  );
}

function DashboardContent() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState("products");

  const NAV_TABS = [
    { key: "products", label: "商品" },
    { key: "orders", label: "注文履歴" },
    { key: "account", label: "アカウント" },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: C.bg,
        color: C.text,
        fontFamily: FONT,
      }}
    >
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
          {/* ロゴ */}
          <Link
            to="/"
            style={{
              textDecoration: "none",
              color: C.text,
              fontSize: "1.05rem",
              letterSpacing: "0.2em",
              fontWeight: 600,
              textTransform: "uppercase",
              flexShrink: 0,
            }}
          >
            Ryuge Coffee
          </Link>

          {/* タブナビ */}
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
                  fontFamily: FONT,
                  transition: "color 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* ログアウト */}
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
              fontFamily: FONT,
              flexShrink: 0,
            }}
          >
            Logout
          </button>
        </div>
      </header>

      {/* コンテンツ */}
      <main
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "3rem 2rem 8rem",
        }}
      >
        {tab === "products" && <ProductsTab user={user} />}
        {tab === "orders" && <OrdersTab user={user} />}
        {tab === "account" && <AccountTab user={user} />}
      </main>
    </div>
  );
}

/* ====================================================
   商品タブ
==================================================== */
function ProductsTab({ user }) {
  const [quantities, setQuantities] = useState({});
  const [orderingId, setOrderingId] = useState(null);
  const [doneId, setDoneId] = useState(null);
  const [error, setError] = useState("");

  const products = WHOLESALE_PRODUCTS.filter((p) => !p.isSoldOut);

  const handleOrder = async (product) => {
    const qty = quantities[product.id] || product.minQty;
    setOrderingId(product.id);
    setError("");
    setDoneId(null);

    try {
      // ユーザー情報取得
      const userSnap = await getDoc(doc(db, "wholesaleUsers", user.uid));
      const userData = userSnap.exists() ? userSnap.data() : {};

      const orderData = {
        uid: user.uid,
        companyName: userData.companyName || "",
        email: user.email || "",
        items: [
          {
            id: product.id,
            name: product.name,
            quantity: qty,
            unitPrice: product.unitPrice,
            subtotal: qty * product.unitPrice,
          },
        ],
        total: qty * product.unitPrice,
        status: "pending",
        createdAt: serverTimestamp(),
      };

      // Firestore に保存
      await addDoc(collection(db, "wholesaleOrders"), orderData);

      // サーバーにメール通知（失敗しても続行）
      fetch(`${API_BASE}/wholesale-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...orderData,
          createdAt: new Date().toISOString(),
        }),
      }).catch(() => {});

      setDoneId(product.id);
    } catch (e) {
      console.error("Order error:", e);
      setError("発注に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setOrderingId(null);
    }
  };

  return (
    <div>
      <SectionHeader label="Wholesale Products" title="商品一覧" />

      {error && <ErrorBanner message={error} />}

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {products.length === 0 ? (
          <p style={{ color: C.muted, fontSize: "0.95rem" }}>
            現在取り扱い中の卸商品はありません。
          </p>
        ) : (
          products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              qty={quantities[product.id] || product.minQty}
              onQtyChange={(v) =>
                setQuantities((prev) => ({ ...prev, [product.id]: v }))
              }
              onOrder={() => handleOrder(product)}
              isOrdering={orderingId === product.id}
              isDone={doneId === product.id}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ProductCard({ product, qty, onQtyChange, onOrder, isOrdering, isDone }) {
  const subtotal = qty * product.unitPrice;

  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        backgroundColor: C.surface,
        padding: "2.5rem",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "2rem",
        }}
      >
        {/* 商品情報 */}
        <div style={{ flex: "1 1 320px" }}>
          <p
            style={{
              margin: "0 0 0.5rem",
              fontSize: "0.7rem",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: C.muted,
            }}
          >
            Wholesale
          </p>
          <h2
            style={{
              margin: "0 0 1rem",
              fontSize: "1.4rem",
              fontWeight: 500,
              letterSpacing: "0.04em",
            }}
          >
            {product.name}
          </h2>
          <p
            style={{
              margin: "0 0 1.5rem",
              fontSize: "0.95rem",
              color: C.soft,
              lineHeight: 1.9,
            }}
          >
            {product.description}
          </p>
          <p style={{ margin: "0 0 0.4rem", fontSize: "0.85rem", color: C.muted }}>
            卸価格{" "}
            <span style={{ fontSize: "1.2rem", color: C.text, fontWeight: 600 }}>
              ¥{product.unitPrice.toLocaleString()}
            </span>{" "}
            / 個（税別）
          </p>
          <p style={{ margin: 0, fontSize: "0.82rem", color: C.muted }}>
            最低発注：{product.minQty}個単位（6の倍数）
          </p>
        </div>

        {/* 注文フォーム */}
        <div
          style={{
            flex: "0 0 260px",
            display: "flex",
            flexDirection: "column",
            gap: "1.2rem",
          }}
        >
          {/* 数量選択 */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.78rem",
                color: C.muted,
                marginBottom: "0.5rem",
                letterSpacing: "0.1em",
              }}
            >
              数量
            </label>
            <div style={{ position: "relative" }}>
              <select
                value={qty}
                onChange={(e) => onQtyChange(Number(e.target.value))}
                style={{
                  width: "100%",
                  height: "52px",
                  backgroundColor: C.bg,
                  border: `1px solid ${C.borderMid}`,
                  color: C.text,
                  fontSize: "1.05rem",
                  padding: "0 2.5rem 0 1rem",
                  fontFamily: FONT,
                  appearance: "none",
                  WebkitAppearance: "none",
                  cursor: "pointer",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              >
                {[6, 12, 18, 24].map((n) => (
                  <option key={n} value={n}>
                    {n} 個
                  </option>
                ))}
              </select>
              <span
                style={{
                  position: "absolute",
                  right: "1rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: C.muted,
                  pointerEvents: "none",
                  fontSize: "0.7rem",
                }}
              >
                ▼
              </span>
            </div>
          </div>

          {/* 小計 */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0.8rem 0",
              borderTop: `1px solid ${C.border}`,
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            <span style={{ fontSize: "0.82rem", color: C.muted }}>小計（税別）</span>
            <span style={{ fontSize: "1.3rem", fontWeight: 600 }}>
              ¥{subtotal.toLocaleString()}
            </span>
          </div>

          {/* 発注ボタン / 完了表示 */}
          {isDone ? (
            <div
              style={{
                height: "52px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: `1px solid ${C.green}`,
                color: C.green,
                fontSize: "0.92rem",
                letterSpacing: "0.06em",
              }}
            >
              ✓ 発注を受け付けました
            </div>
          ) : (
            <button
              onClick={onOrder}
              disabled={isOrdering}
              style={{
                height: "52px",
                backgroundColor: "transparent",
                border: `1px solid rgba(255,255,255,0.28)`,
                color: C.text,
                fontSize: "0.92rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                cursor: isOrdering ? "not-allowed" : "pointer",
                opacity: isOrdering ? 0.5 : 1,
                fontFamily: FONT,
                transition: "border-color 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!isOrdering)
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.6)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.28)";
              }}
            >
              {isOrdering ? "処理中..." : "発注する"}
            </button>
          )}
        </div>
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
        const q = query(
          collection(db, "wholesaleOrders"),
          where("uid", "==", user.uid),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
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
        <p style={{ color: C.muted, fontSize: "0.95rem" }}>
          注文履歴はありません。
        </p>
      ) : (
        <div
          style={{
            border: `1px solid ${C.border}`,
            overflow: "hidden",
          }}
        >
          {/* テーブルヘッダー */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "140px 1fr 80px 120px 100px",
              gap: "1rem",
              backgroundColor: C.surface,
              padding: "0.8rem 1.5rem",
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            {["注文日", "商品", "数量", "合計", "ステータス"].map((h) => (
              <p
                key={h}
                style={{
                  margin: 0,
                  fontSize: "0.72rem",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: C.muted,
                }}
              >
                {h}
              </p>
            ))}
          </div>

          {/* 各注文 */}
          {orders.map((order) => {
            const date = order.createdAt?.toDate
              ? order.createdAt
                  .toDate()
                  .toLocaleDateString("ja-JP", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                  })
              : "—";
            const itemLabel = (order.items || [])
              .map((i) => `${i.name} ×${i.quantity}`)
              .join(" / ");
            const totalQty = (order.items || []).reduce(
              (s, i) => s + i.quantity,
              0
            );
            const st = STATUS[order.status] || {
              label: order.status || "—",
              color: C.muted,
            };

            return (
              <div
                key={order.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 1fr 80px 120px 100px",
                  gap: "1rem",
                  padding: "1.1rem 1.5rem",
                  borderBottom: `1px solid ${C.border}`,
                  alignItems: "center",
                }}
              >
                <p style={{ margin: 0, fontSize: "0.88rem", color: C.soft }}>
                  {date}
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.92rem",
                    color: C.text,
                    lineHeight: 1.6,
                  }}
                >
                  {itemLabel}
                </p>
                <p style={{ margin: 0, fontSize: "0.9rem", color: C.soft }}>
                  {totalQty}個
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: "1rem",
                    fontWeight: 600,
                    color: C.text,
                  }}
                >
                  ¥{(order.total || 0).toLocaleString()}
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.82rem",
                    color: st.color,
                    letterSpacing: "0.04em",
                  }}
                >
                  {st.label}
                </p>
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
  { key: "companyName", label: "貴社名・店舗名", editable: true },
  { key: "contactName", label: "担当者名", editable: true },
  { key: "email",       label: "メールアドレス", editable: false },
  { key: "businessType",label: "業種", editable: true },
  { key: "postalCode",  label: "郵便番号", editable: true },
  { key: "prefecture",  label: "都道府県", editable: true },
  { key: "city",        label: "市区町村・番地", editable: true },
  { key: "address",     label: "建物名・部屋番号", editable: true },
];

function AccountTab({ user }) {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "wholesaleUsers", user.uid))
      .then((snap) => {
        if (snap.exists()) {
          setData(snap.data());
          setForm(snap.data());
        }
      })
      .catch(console.error);
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      await updateDoc(doc(db, "wholesaleUsers", user.uid), form);
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

  const handleCancel = () => {
    setEditing(false);
    setForm(data);
    setSaveError("");
  };

  return (
    <div>
      <SectionHeader label="Account" title="アカウント情報" />

      {!data ? (
        <p style={{ color: C.muted, fontSize: "0.95rem" }}>Loading...</p>
      ) : (
        <div style={{ maxWidth: "640px" }}>
          {saved && (
            <div
              style={{
                marginBottom: "1.5rem",
                padding: "0.9rem 1.2rem",
                border: `1px solid ${C.green}`,
                color: C.green,
                fontSize: "0.9rem",
              }}
            >
              ✓ 保存しました。
            </div>
          )}
          {saveError && <ErrorBanner message={saveError} />}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1.4rem",
              marginBottom: "2.5rem",
            }}
          >
            {ACCOUNT_FIELDS.map(({ key, label, editable }) => {
              const value = key === "email" ? user.email : (data[key] || "");
              return (
                <div key={key}>
                  <p
                    style={{
                      margin: "0 0 0.4rem",
                      fontSize: "0.75rem",
                      color: C.muted,
                      letterSpacing: "0.1em",
                    }}
                  >
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
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      style={{
                        width: "100%",
                        height: "48px",
                        backgroundColor: C.surface,
                        border: `1px solid ${C.borderMid}`,
                        color: C.text,
                        padding: "0 1rem",
                        fontSize: "0.95rem",
                        fontFamily: FONT,
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  ) : (
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.97rem",
                        color: value ? C.text : C.muted,
                        lineHeight: 1.6,
                      }}
                    >
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
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={primaryBtnStyle}
                >
                  {saving ? "保存中..." : "保存する"}
                </button>
                <button onClick={handleCancel} style={secondaryBtnStyle}>
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
      <p
        style={{
          margin: "0 0 0.5rem",
          fontSize: "0.68rem",
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          color: C.muted,
        }}
      >
        {label}
      </p>
      <h1
        style={{
          margin: 0,
          fontSize: "1.6rem",
          fontWeight: 500,
          letterSpacing: "0.04em",
        }}
      >
        {title}
      </h1>
    </div>
  );
}

function ErrorBanner({ message }) {
  return (
    <div
      style={{
        marginBottom: "1.5rem",
        padding: "0.9rem 1.2rem",
        border: `1px solid ${C.red}`,
        color: C.red,
        fontSize: "0.9rem",
        lineHeight: 1.7,
      }}
    >
      {message}
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
  fontFamily: FONT,
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
  fontFamily: FONT,
};
