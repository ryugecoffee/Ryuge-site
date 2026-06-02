// src/pages/WholesaleJpAdminPage.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import RequireAdmin from "../components/wholesale/RequireAdmin";


const C = {
  bg: "#2a2a2a",
  surface: "#2f2f2f",
  surfaceHover: "#343434",
  border: "#3a3a3a",
  text: "#e8e2d9",
  soft: "#999",
  muted: "#666",
  faint: "#555",
  green: "#7aaa88",
  red: "#aa6a6a",
  amber: "#aa9a6a",
};

export default function WholesaleJpAdminPage() {
  return (
    <RequireAdmin>
      <AdminContent />
    </RequireAdmin>
  );
}

function AdminContent() {
  const { logout } = useAuth();
  const [pageTab, setPageTab] = useState("users"); // "users" | "orders"

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: C.bg,
        color: C.text,
      }}
    >
      {/* ヘッダー */}
      <div
        style={{
          borderBottom: `1px solid ${C.border}`,
          backgroundColor: C.bg,
          padding: "0 3rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "sticky",
          top: 0,
          zIndex: 100,
          height: "60px",
        }}
      >
        <Link
          to="/"
          className="site-logo"
          style={{
            textDecoration: "none",
            fontSize: "0.95rem",
            color: C.text,
            textTransform: "uppercase",
          }}
        >
          Ryuge Coffee
        </Link>
        <div style={{ display: "flex", gap: "2rem", alignItems: "center" }}>
          <Link
            to="/wholesale-jp/dashboard"
            style={{
              fontSize: "0.72rem",
              color: C.muted,
              textDecoration: "none",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            Dashboard
          </Link>
          <button
            onClick={logout}
            style={{
              fontSize: "0.72rem",
              color: C.faint,
              background: "none",
              border: "none",
              cursor: "pointer",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              padding: 0,

            }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* メイン */}
      <div
        style={{ maxWidth: "1280px", margin: "0 auto", padding: "3.5rem 3rem 8rem" }}
      >
        {/* タイトル */}
        <div style={{ marginBottom: "2.5rem" }}>
          <p
            style={{
              fontSize: "0.65rem",
              letterSpacing: "0.26em",
              textTransform: "uppercase",
              color: C.muted,
              margin: "0 0 0.7rem",
            }}
          >
            Wholesale — Admin
          </p>
          <h1
            style={{
              fontSize: "1.9rem",
              fontWeight: 400,
              letterSpacing: "0.06em",
              color: C.text,
              margin: 0,
            }}
          >
            管理画面
          </h1>
        </div>

        {/* ページタブ */}
        <div
          style={{
            display: "flex",
            gap: 0,
            marginBottom: "2.5rem",
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          {[
            { key: "users", label: "取引先管理" },
            { key: "orders", label: "注文一覧" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPageTab(key)}
              style={{
                background: "none",
                border: "none",
                borderBottom:
                  pageTab === key
                    ? `2px solid ${C.text}`
                    : "2px solid transparent",
                color: pageTab === key ? C.text : C.muted,
                fontSize: "0.78rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                padding: "0.9rem 1.8rem",
                cursor: "pointer",
                marginBottom: "-1px",
  
                transition: "color 0.15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {pageTab === "users" && <UsersPanel />}
        {pageTab === "orders" && <OrdersPanel />}
      </div>
    </div>
  );
}

/* ====================================================
   取引先管理パネル
==================================================== */
function UsersPanel() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "wholesaleUsers"));
      const data = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((u) => u.role !== "admin")
        .sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });
      setUsers(data);
    } catch (e) {
      console.error("Fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleApprove = async (uid) => {
    try {
      await updateDoc(doc(db, "wholesaleUsers", uid), {
        approved: true,
        status: "active",
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === uid ? { ...u, approved: true, status: "active" } : u
        )
      );
    } catch (e) {
      console.error("Approve error:", e);
    }
  };

  const handleReject = async (uid) => {
    try {
      await updateDoc(doc(db, "wholesaleUsers", uid), {
        approved: false,
        status: "rejected",
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === uid ? { ...u, approved: false, status: "rejected" } : u
        )
      );
    } catch (e) {
      console.error("Reject error:", e);
    }
  };

  const handleRevoke = async (uid) => {
    try {
      await updateDoc(doc(db, "wholesaleUsers", uid), {
        approved: false,
        status: "pending",
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === uid ? { ...u, approved: false, status: "pending" } : u
        )
      );
    } catch (e) {
      console.error("Revoke error:", e);
    }
  };

  const handleDelete = async (uid, companyName) => {
    if (!window.confirm(`「${companyName || uid}」を削除しますか？\nFirestoreとFirebase Authenticationの両方から削除されます。`)) return;
    try {
      await fetch(`${API_BASE}/wholesale-delete-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid }),
      });
      await deleteDoc(doc(db, "wholesaleUsers", uid));
      setUsers((prev) => prev.filter((u) => u.id !== uid));
    } catch (e) {
      console.error("Delete user error:", e);
      alert("削除に失敗しました");
    }
  };

  const counts = {
    all: users.length,
    pending: users.filter((u) => u.status === "pending").length,
    active: users.filter((u) => u.status === "active").length,
    rejected: users.filter((u) => u.status === "rejected").length,
  };

  const filtered =
    filter === "all" ? users : users.filter((u) => u.status === filter);

  return (
    <div>
      {/* フィルタータブ */}
      <div
        style={{
          display: "flex",
          gap: 0,
          marginBottom: "2rem",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        {[
          { key: "all",      label: "すべて" },
          { key: "pending",  label: "承認待ち" },
          { key: "active",   label: "承認済み" },
          { key: "rejected", label: "非承認" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              background: "none",
              border: "none",
              borderBottom:
                filter === key
                  ? `1px solid ${C.text}`
                  : "1px solid transparent",
              color: filter === key ? C.text : C.muted,
              fontSize: "0.7rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              padding: "0.75rem 1.4rem",
              cursor: "pointer",
              marginBottom: "-1px",

              transition: "color 0.15s",
            }}
          >
            {label}
            <span
              style={{
                marginLeft: "0.5rem",
                fontSize: "0.62rem",
                color: filter === key ? C.soft : C.faint,
              }}
            >
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ fontSize: "0.82rem", color: C.muted, letterSpacing: "0.1em" }}>
          Loading...
        </p>
      ) : filtered.length === 0 ? (
        <p style={{ fontSize: "0.82rem", color: C.muted }}>
          該当するユーザーはいません。
        </p>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1px",
            backgroundColor: C.border,
          }}
        >
          {/* テーブルヘッダー */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 1fr 1.8fr 1fr 0.8fr 1fr 1.2fr",
              backgroundColor: C.bg,
              padding: "0.75rem 1.3rem",
              gap: "1rem",
            }}
          >
            {["店名", "担当者", "メール", "業種", "登録日", "ステータス", "操作"].map(
              (h) => (
                <p
                  key={h}
                  style={{
                    fontSize: "0.62rem",
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: C.faint,
                    margin: 0,
                  }}
                >
                  {h}
                </p>
              )
            )}
          </div>

          {filtered.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              onApprove={() => handleApprove(user.id)}
              onReject={() => handleReject(user.id)}
              onRevoke={() => handleRevoke(user.id)}
              onDelete={() => handleDelete(user.id, user.companyName)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UserRow({ user, onApprove, onReject, onRevoke, onDelete }) {
  const [open, setOpen] = useState(false);

  const createdAt = user.createdAt?.toDate
    ? user.createdAt
        .toDate()
        .toLocaleDateString("ja-JP", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        })
    : "—";

  const STATUS_STYLE = {
    active:   { color: C.green,  label: "承認済み" },
    pending:  { color: C.amber,  label: "承認待ち" },
    rejected: { color: C.red,    label: "非承認" },
  };
  const s = STATUS_STYLE[user.status] || { color: C.muted, label: user.status };

  const address = [user.postalCode && `〒${user.postalCode}`, user.prefecture, user.city, user.building]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr 1.8fr 1fr 0.8fr 1fr 1.2fr",
          backgroundColor: C.surface,
          padding: "1.1rem 1.3rem",
          gap: "1rem",
          alignItems: "center",
          cursor: "pointer",
          transition: "background 0.15s",
        }}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor = C.surfaceHover)
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.backgroundColor = C.surface)
        }
      >
        <p style={{ fontSize: "0.85rem", color: C.text, margin: 0 }}>
          {user.companyName || "—"}
        </p>
        <p style={{ fontSize: "0.8rem", color: C.soft, margin: 0 }}>
          {user.contactName || "—"}
        </p>
        <p style={{ fontSize: "0.75rem", color: C.muted, margin: 0, wordBreak: "break-all" }}>
          {user.email || "—"}
        </p>
        <p style={{ fontSize: "0.78rem", color: C.muted, margin: 0 }}>
          {user.businessType || "—"}
        </p>
        <p style={{ fontSize: "0.75rem", color: C.faint, margin: 0 }}>
          {createdAt}
        </p>
        <p style={{ fontSize: "0.75rem", color: s.color, margin: 0 }}>
          {s.label}
        </p>
        <div
          style={{ display: "flex", gap: "0.6rem" }}
          onClick={(e) => e.stopPropagation()}
        >
          {user.status === "pending" && (
            <>
              <ActionButton label="承認" onClick={onApprove} color={C.green} />
              <ActionButton label="却下" onClick={onReject} color={C.red} />
            </>
          )}
          {user.status === "active" && (
            <ActionButton label="取消" onClick={onRevoke} color={C.amber} />
          )}
          {user.status === "rejected" && (
            <ActionButton label="再承認" onClick={onApprove} color={C.green} />
          )}
          <ActionButton label="削除" onClick={onDelete} color={C.red} />
        </div>
      </div>

      {/* 展開：詳細表示 */}
      {open && (
        <div
          style={{
            backgroundColor: C.bg,
            padding: "1.2rem 1.3rem 1.4rem",
            borderTop: `1px solid ${C.border}`,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem 2rem" }}>
            {address && (
              <Detail label="住所" value={address} />
            )}
            <Detail label="メッセージ" value={user.message || "（なし）"} />
          </div>
        </div>
      )}
    </>
  );
}

/* ====================================================
   発送モーダル
==================================================== */
const API_BASE = "https://ryuge-site.onrender.com";

function ShipModal({ order, onClose, onShipped }) {
  const [trackingNumber, setTrackingNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/wholesale-ship`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, trackingNumber }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "発送処理に失敗しました");
      }
      onShipped();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const itemLabel = (order.items || [])
    .map((i) => `${i.name} ×${i.quantity}`)
    .join("、");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: C.surface,
          border: `1px solid ${C.border}`,
          padding: "2.5rem",
          width: "480px",
          maxWidth: "90vw",

        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ fontSize: "0.6rem", letterSpacing: "0.22em", textTransform: "uppercase", color: C.muted, margin: "0 0 1rem" }}>
          発送処理
        </p>
        <h2 style={{ fontSize: "1.3rem", fontWeight: 400, color: C.text, margin: "0 0 1.8rem" }}>
          発送完了にする
        </h2>

        <div style={{ marginBottom: "1.5rem" }}>
          <p style={{ fontSize: "0.7rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.faint, margin: "0 0 0.4rem" }}>取引先</p>
          <p style={{ fontSize: "0.9rem", color: C.text, margin: 0 }}>{order.companyName || "—"}</p>
        </div>

        <div style={{ marginBottom: "2rem" }}>
          <p style={{ fontSize: "0.7rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.faint, margin: "0 0 0.4rem" }}>注文内容</p>
          <p style={{ fontSize: "0.82rem", color: C.soft, margin: 0, lineHeight: 1.7 }}>{itemLabel || "—"}</p>
        </div>

        <div style={{ marginBottom: "2rem" }}>
          <label style={{ fontSize: "0.7rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.faint, display: "block", marginBottom: "0.6rem" }}>
            追跡番号（任意）
          </label>
          <input
            type="text"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="例：1234567890123"
            style={{
              width: "100%",
              backgroundColor: C.bg,
              border: `1px solid ${C.border}`,
              color: C.text,
              fontSize: "0.85rem",
              padding: "0.7rem 0.9rem",

              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {error && (
          <p style={{ fontSize: "0.78rem", color: C.red, margin: "0 0 1rem" }}>{error}</p>
        )}

        <div style={{ display: "flex", gap: "0.8rem", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              fontSize: "0.68rem",
              color: C.muted,
              background: "none",
              border: `1px solid ${C.border}`,
              padding: "0.55rem 1.2rem",
              cursor: "pointer",
              letterSpacing: "0.1em",

            }}
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              fontSize: "0.68rem",
              color: C.green,
              background: "none",
              border: `1px solid ${C.green}`,
              padding: "0.55rem 1.4rem",
              cursor: submitting ? "not-allowed" : "pointer",
              letterSpacing: "0.1em",

              opacity: submitting ? 0.5 : 1,
            }}
          >
            {submitting ? "処理中..." : "発送完了にする"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ====================================================
   注文一覧パネル
==================================================== */
function OrdersPanel() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [updating, setUpdating] = useState(null);
  const [shipTarget, setShipTarget] = useState(null);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "wholesaleOrders"));
      let data = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });

      // companyName が欠けている注文は wholesaleUsers から uid で補完
      const missingUids = [...new Set(
        data
          .filter((o) => !o.companyName && o.uid)
          .map((o) => o.uid)
      )];
      if (missingUids.length > 0) {
        const usersSnap = await getDocs(collection(db, "wholesaleUsers"));
        const userMap = {};
        usersSnap.docs.forEach((d) => { userMap[d.id] = d.data(); });
        data = data.map((o) => {
          if (!o.companyName && o.uid && userMap[o.uid]) {
            return { ...o, companyName: userMap[o.uid].companyName || "", email: o.email || userMap[o.uid].email || "" };
          }
          return o;
        });
      }

      setOrders(data);
    } catch (e) {
      console.error("Orders fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleDeleteOrder = async (orderId) => {
    if (!window.confirm("この注文を削除しますか？")) return;
    try {
      await deleteDoc(doc(db, "wholesaleOrders", orderId));
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch (e) {
      console.error("Delete order error:", e);
      alert("削除に失敗しました");
    }
  };

  const handleStatusChange = async (orderId, newStatus) => {
    setUpdating(orderId);
    try {
      await updateDoc(doc(db, "wholesaleOrders", orderId), {
        status: newStatus,
      });
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, status: newStatus } : o
        )
      );
    } catch (e) {
      console.error("Status update error:", e);
    } finally {
      setUpdating(null);
    }
  };

  const STATUS = {
    pending:   { label: "受付中",     color: C.amber },
    shipped:   { label: "発送済み",   color: C.green },
    cancelled: { label: "キャンセル", color: C.red },
  };

  const counts = {
    all:       orders.length,
    pending:   orders.filter((o) => !o.status || o.status === "pending").length,
    shipped:   orders.filter((o) => o.status === "shipped").length,
    cancelled: orders.filter((o) => o.status === "cancelled").length,
  };

  const filtered =
    filterStatus === "all"
      ? orders
      : filterStatus === "pending"
      ? orders.filter((o) => !o.status || o.status === "pending")
      : orders.filter((o) => o.status === filterStatus);

  return (
    <div>
      {shipTarget && (
        <ShipModal
          order={shipTarget}
          onClose={() => setShipTarget(null)}
          onShipped={fetchOrders}
        />
      )}

      {/* フィルター */}
      <div
        style={{
          display: "flex",
          gap: 0,
          marginBottom: "2rem",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        {[
          { key: "all",       label: "すべて" },
          { key: "pending",   label: "受付中" },
          { key: "shipped",   label: "発送済み" },
          { key: "cancelled", label: "キャンセル" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilterStatus(key)}
            style={{
              background: "none",
              border: "none",
              borderBottom:
                filterStatus === key
                  ? `1px solid ${C.text}`
                  : "1px solid transparent",
              color: filterStatus === key ? C.text : C.muted,
              fontSize: "0.7rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              padding: "0.75rem 1.4rem",
              cursor: "pointer",
              marginBottom: "-1px",

              transition: "color 0.15s",
            }}
          >
            {label}
            <span
              style={{
                marginLeft: "0.5rem",
                fontSize: "0.62rem",
                color: filterStatus === key ? C.soft : C.faint,
              }}
            >
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ fontSize: "0.82rem", color: C.muted }}>Loading...</p>
      ) : filtered.length === 0 ? (
        <p style={{ fontSize: "0.82rem", color: C.muted }}>注文はありません。</p>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1px",
            backgroundColor: C.border,
          }}
        >
          {/* ヘッダー */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1.2fr 1.8fr 80px 110px 100px 220px",
              gap: "1rem",
              backgroundColor: C.bg,
              padding: "0.75rem 1.3rem",
            }}
          >
            {["注文日", "取引先", "商品", "数量", "合計", "ステータス", "操作"].map(
              (h) => (
                <p
                  key={h}
                  style={{
                    fontSize: "0.62rem",
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: C.faint,
                    margin: 0,
                  }}
                >
                  {h}
                </p>
              )
            )}
          </div>

          {filtered.map((order) => {
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
              (s, i) => s + Number(i.quantity || 0),
              0
            );
            const st = STATUS[order.status] || {
              label: order.status || "—",
              color: C.muted,
            };
            const isUpdating = updating === order.id;

            return (
              <div
                key={order.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 1.2fr 1.8fr 80px 110px 100px 220px",
                  gap: "1rem",
                  backgroundColor: C.surface,
                  padding: "1.1rem 1.3rem",
                  alignItems: "center",
                }}
              >
                <p style={{ margin: 0, fontSize: "0.8rem", color: C.muted }}>
                  {date}
                </p>
                <div>
                  <p style={{ margin: "0 0 0.2rem", fontSize: "0.85rem", color: C.text }}>
                    {order.companyName || "—"}
                  </p>
                  <p style={{ margin: 0, fontSize: "0.72rem", color: C.muted, wordBreak: "break-all" }}>
                    {order.email || ""}
                  </p>
                </div>
                <p style={{ margin: 0, fontSize: "0.82rem", color: C.soft, lineHeight: 1.6 }}>
                  {itemLabel}
                </p>
                <p style={{ margin: 0, fontSize: "0.85rem", color: C.soft }}>
                  {totalQty}個
                </p>
                <p style={{ margin: 0, fontSize: "0.92rem", fontWeight: 500, color: C.text }}>
                  ¥{(order.total || 0).toLocaleString()}
                </p>
                <p style={{ margin: 0, fontSize: "0.78rem", color: st.color }}>
                  {st.label}
                </p>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {(!order.status || order.status === "pending") && (
                    <ActionButton
                      label="発送する"
                      onClick={() => setShipTarget(order)}
                      color={C.green}
                      disabled={isUpdating}
                    />
                  )}
                  {order.status && order.status !== "pending" && (
                    <ActionButton
                      label="受付中に戻す"
                      onClick={() => handleStatusChange(order.id, "pending")}
                      color={C.amber}
                      disabled={isUpdating}
                    />
                  )}
                  {order.status !== "cancelled" && (
                    <ActionButton
                      label="取消"
                      onClick={() => handleStatusChange(order.id, "cancelled")}
                      color={C.red}
                      disabled={isUpdating}
                    />
                  )}
                  <ActionButton
                    label="削除"
                    onClick={() => handleDeleteOrder(order.id)}
                    color={C.red}
                    disabled={isUpdating}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ====================================================
   共通コンポーネント
==================================================== */
function ActionButton({ label, onClick, color, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontSize: "0.65rem",
        color: color,
        background: "none",
        border: `1px solid ${color}`,
        padding: "0.35rem 0.75rem",
        cursor: disabled ? "not-allowed" : "pointer",
        letterSpacing: "0.1em",
        opacity: disabled ? 0.4 : 0.85,
        transition: "opacity 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.opacity = "1";
      }}
      onMouseLeave={(e) => {
        if (!disabled) e.currentTarget.style.opacity = "0.85";
      }}
    >
      {label}
    </button>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <p
        style={{
          fontSize: "0.6rem",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: C.faint,
          margin: "0 0 0.4rem",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: "0.8rem",
          color: C.muted,
          margin: 0,
          lineHeight: 1.8,
        }}
      >
        {value}
      </p>
    </div>
  );
}
