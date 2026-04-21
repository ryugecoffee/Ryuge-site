// src/pages/WholesaleJpLoginPage.jsx
import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useNavigate, Link } from "react-router-dom";

export default function WholesaleJpLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/wholesale-jp/dashboard");
    } catch (err) {
      console.error(err);
      setError("メールアドレスまたはパスワードが正しくありません。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#faf9f7",
      padding: "2rem",
    }}>
      <div style={{
        width: "100%",
        maxWidth: "400px",
        backgroundColor: "#fff",
        border: "1px solid #e8e2d9",
        borderRadius: "4px",
        padding: "2.5rem 2rem",
      }}>
        {/* ロゴ・タイトル */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <Link to="/" style={{ textDecoration: "none" }}>
            <p style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: "1.3rem",
              letterSpacing: "0.1em",
              color: "#2a2a2a",
              margin: 0,
            }}>
              Ryuge Coffee
            </p>
          </Link>
          <p style={{
            fontSize: "0.8rem",
            color: "#888",
            marginTop: "0.4rem",
            letterSpacing: "0.05em",
          }}>
            卸専用ページ ログイン
          </p>
        </div>

        {/* エラー表示 */}
        {error && (
          <p style={{
            fontSize: "0.82rem",
            color: "#c0392b",
            backgroundColor: "#fdf0ee",
            border: "1px solid #f5c6c0",
            borderRadius: "3px",
            padding: "0.6rem 0.8rem",
            marginBottom: "1.2rem",
          }}>
            {error}
          </p>
        )}

        {/* フォーム */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ fontSize: "0.78rem", color: "#666", display: "block", marginBottom: "0.3rem" }}>
              メールアドレス
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%",
                padding: "0.6rem 0.8rem",
                border: "1px solid #d9d2c8",
                borderRadius: "3px",
                fontSize: "0.9rem",
                outline: "none",
                boxSizing: "border-box",
                backgroundColor: "#faf9f7",
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: "0.78rem", color: "#666", display: "block", marginBottom: "0.3rem" }}>
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "0.6rem 0.8rem",
                border: "1px solid #d9d2c8",
                borderRadius: "3px",
                fontSize: "0.9rem",
                outline: "none",
                boxSizing: "border-box",
                backgroundColor: "#faf9f7",
              }}
            />
          </div>

          <button
            onClick={handleLogin}
            disabled={loading}
            style={{
              marginTop: "0.5rem",
              padding: "0.75rem",
              backgroundColor: "#2a2a2a",
              color: "#fff",
              border: "none",
              borderRadius: "3px",
              fontSize: "0.85rem",
              letterSpacing: "0.08em",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
              fontFamily: "Cormorant Garamond, serif",
            }}
          >
            {loading ? "ログイン中..." : "ログイン"}
          </button>
        </div>

        {/* 卸ページへ戻る */}
        <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
          <Link
            to="/wholesale-jp"
            style={{ fontSize: "0.78rem", color: "#888", textDecoration: "underline" }}
          >
            卸ページへ戻る
          </Link>
        </div>
      </div>
    </div>
  );
}