// src/pages/WholesaleJpAdminPage.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs, doc, updateDoc, orderBy, query } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import RequireAdmin from "../components/wholesale/RequireAdmin";

export default function WholesaleJpAdminPage() {
  return (
    <RequireAdmin>
      <AdminContent />
    </RequireAdmin>
  );
}

function AdminContent() {
  const { logout } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all | pending | active | rejected

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "wholesaleUsers"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      const data = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((u) => u.role !== "admin");
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
        prev.map((u) => u.id === uid ? { ...u, approved: true, status: "active" } : u)
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
        prev.map((u) => u.id === uid ? { ...u, approved: false, status: "rejected" } : u)
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
        prev.map((u) => u.id === uid ? { ...u, approved: false, status: "pending" } : u)
      );
    } catch (e) {
      console.error("Revoke error:", e);
    }
  };

  const filtered = filter === "all" ? users : users.filter((u) => u.status === filter);

  const counts = {
    all: users.length,
    pending: users.filter((u) => u.status === "pending").length,
    active: users.filter((u) => u.status === "active").length,
    rejected: users.filter((u) => u.status === "rejected").length,
  };

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: "#2a2a2a",
      fontFamily: "Cormorant Garamond, serif",
      color: "#e8e2d9",
    }}>

      {/* ヘッダー */}
      <div style={{
        borderBottom: "1px solid #3a3a3a",
        backgroundColor: "#2a2a2a",
        padding: "1.2rem 3rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}>
        <Link to="/" style={{
          textDecoration: "none",
          fontSize: "0.9rem",
          letterSpacing: "0.2em",
          color: "#e8e2d9",
          textTransform: "uppercase",
        }}>
          Ryuge Coffee
        </Link>
        <div style={{ display: "flex", gap: "2rem", alignItems: "center" }}>
          <Link to="/wholesale-jp" style={{
            fontSize: "0.68rem",
            color: "#888",
            textDecoration: "none",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}>
            Wholesale
          </Link>
          <button onClick={logout} style={{
            fontSize: "0.68rem",
            color: "#666",
            background: "none",
            border: "none",
            cursor: "pointer",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            padding: 0,
          }}>
            Logout
          </button>
        </div>
      </div>

      {/* メイン */}
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "4rem 3rem 7rem" }}>

        {/* タイトル */}
        <div style={{ marginBottom: "3rem" }}>
          <p style={{
            fontSize: "0.65rem",
            letterSpacing: "0.26em",
            textTransform: "uppercase",
            color: "#666",
            margin: "0 0 0.8rem",
          }}>
            Wholesale — Admin
          </p>
          <h1 style={{
            fontSize: "1.8rem",
            fontWeight: 400,
            letterSpacing: "0.06em",
            color: "#e8e2d9",
            margin: 0,
          }}>
            取引先管理
          </h1>
        </div>

        {/* フィルター */}
        <div style={{
          display: "flex",
          gap: "0",
          marginBottom: "2.5rem",
          borderBottom: "1px solid #3a3a3a",
        }}>
          {[
            { key: "all", label: "すべて" },
            { key: "pending", label: "承認待ち" },
            { key: "active", label: "承認済み" },
            { key: "rejected", label: "非承認" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              style={{
                background: "none",
                border: "none",
                borderBottom: filter === key ? "1px solid #e8e2d9" : "1px solid transparent",
                color: filter === key ? "#e8e2d9" : "#666",
                fontSize: "0.68rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                padding: "0.8rem 1.4rem",
                cursor: "pointer",
                marginBottom: "-1px",
                transition: "color 0.2s",
              }}
            >
              {label}
              <span style={{
                marginLeft: "0.5rem",
                fontSize: "0.6rem",
                color: filter === key ? "#888" : "#555",
              }}>
                {counts[key]}
              </span>
            </button>
          ))}
        </div>

        {/* ローディング */}
        {loading ? (
          <p style={{ fontSize: "0.75rem", color: "#555", letterSpacing: "0.1em" }}>Loading...</p>
        ) : filtered.length === 0 ? (
          <p style={{ fontSize: "0.75rem", color: "#555", letterSpacing: "0.08em" }}>
            該当するユーザーはいません。
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1px", backgroundColor: "#3a3a3a" }}>

            {/* テーブルヘッダー */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 1fr 1.6fr 1fr 0.8fr 1fr 1.2fr",
              backgroundColor: "#2a2a2a",
              padding: "0.7rem 1.2rem",
              gap: "1rem",
            }}>
              {["店名", "担当者", "メール", "業種", "登録日", "ステータス", "操作"].map((h) => (
                <p key={h} style={{
                  fontSize: "0.58rem",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "#555",
                  margin: 0,
                }}>
                  {h}
                </p>
              ))}
            </div>

            {/* 各行 */}
            {filtered.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                onApprove={() => handleApprove(user.id)}
                onReject={() => handleReject(user.id)}
                onRevoke={() => handleRevoke(user.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function UserRow({ user, onApprove, onReject, onRevoke }) {
  const [open, setOpen] = useState(false);

  const createdAt = user.createdAt?.toDate
    ? user.createdAt.toDate().toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" })
    : "—";

  const statusStyle = {
    active:    { color: "#7aaa88", label: "承認済み" },
    pending:   { color: "#aa9a6a", label: "承認待ち" },
    rejected:  { color: "#aa6a6a", label: "非承認" },
  };
  const s = statusStyle[user.status] || { color: "#666", label: user.status };

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr 1.6fr 1fr 0.8fr 1fr 1.2fr",
          backgroundColor: "#2f2f2f",
          padding: "1rem 1.2rem",
          gap: "1rem",
          alignItems: "center",
          cursor: "pointer",
          transition: "background 0.15s",
        }}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={e => e.currentTarget.style.backgroundColor = "#343434"}
        onMouseLeave={e => e.currentTarget.style.backgroundColor = "#2f2f2f"}
      >
        <p style={{ fontSize: "0.78rem", color: "#e8e2d9", margin: 0, letterSpacing: "0.03em" }}>
          {user.companyName || "—"}
        </p>
        <p style={{ fontSize: "0.75rem", color: "#999", margin: 0 }}>
          {user.contactName || "—"}
        </p>
        <p style={{ fontSize: "0.72rem", color: "#777", margin: 0, wordBreak: "break-all" }}>
          {user.email || "—"}
        </p>
        <p style={{ fontSize: "0.72rem", color: "#777", margin: 0 }}>
          {user.businessType || "—"}
        </p>
        <p style={{ fontSize: "0.7rem", color: "#666", margin: 0 }}>
          {createdAt}
        </p>
        <p style={{ fontSize: "0.68rem", color: s.color, margin: 0, letterSpacing: "0.06em" }}>
          {s.label}
        </p>

        {/* 操作ボタン */}
        <div style={{ display: "flex", gap: "0.6rem" }} onClick={e => e.stopPropagation()}>
          {user.status === "pending" && (
            <>
              <ActionButton label="承認" onClick={onApprove} color="#7aaa88" />
              <ActionButton label="却下" onClick={onReject} color="#aa6a6a" />
            </>
          )}
          {user.status === "active" && (
            <ActionButton label="取消" onClick={onRevoke} color="#aa9a6a" />
          )}
          {user.status === "rejected" && (
            <ActionButton label="再承認" onClick={onApprove} color="#7aaa88" />
          )}
        </div>
      </div>

      {/* 展開：メッセージ表示 */}
      {open && (
        <div style={{
          backgroundColor: "#2a2a2a",
          padding: "1rem 1.2rem 1.2rem 1.2rem",
          borderTop: "1px solid #3a3a3a",
        }}>
          <p style={{
            fontSize: "0.6rem",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "#555",
            margin: "0 0 0.5rem",
          }}>
            Message
          </p>
          <p style={{
            fontSize: "0.75rem",
            color: "#777",
            margin: 0,
            lineHeight: 2,
            letterSpacing: "0.03em",
          }}>
            {user.message || "（メッセージなし）"}
          </p>
        </div>
      )}
    </>
  );
}

function ActionButton({ label, onClick, color }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: "0.6rem",
        color: color,
        background: "none",
        border: `1px solid ${color}`,
        padding: "0.3rem 0.7rem",
        cursor: "pointer",
        letterSpacing: "0.1em",
        fontFamily: "Cormorant Garamond, serif",
        opacity: 0.8,
        transition: "opacity 0.15s",
      }}
      onMouseEnter={e => e.currentTarget.style.opacity = "1"}
      onMouseLeave={e => e.currentTarget.style.opacity = "0.8"}
    >
      {label}
    </button>
  );
}