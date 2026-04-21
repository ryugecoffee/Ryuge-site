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

  const handleLogin = async () => {
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

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleLogin();
  };

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: "#2a2a2a",
      fontFamily: "Cormorant Garamond, serif",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "2rem",
    }}>
      <div style={{ width: "100%", maxWidth: "400px" }}>

        {/* タイトル */}
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <Link to="/" style={{ textDecoration: "none" }}>
            <p style={{
              fontSize: "0.9rem",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#e8e2d9",
              margin: "0 0 0.6rem",
            }}>
              Ryuge Coffee
            </p>
          </Link>
          <p style={{
            fontSize: "0.68rem",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#666",
            margin: 0,
          }}>
            Wholesale Login
          </p>
        </div>

        {/* エラー */}
        {error && (
          <div style={{
            marginBottom: "1.5rem",
            padding: "0.8rem 1rem",
            borderLeft: "2px solid #7a3a3a",
            backgroundColor: "#3a2a2a",
            fontSize: "0.75rem",
            color: "#c08080",
            letterSpacing: "0.04em",
            lineHeight: 1.8,
          }}>
            {error}
          </div>
        )}

        {/* フォーム */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
          <div>
            <label style={{
              fontSize: "0.65rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#666",
              display: "block",
              marginBottom: "0.5rem",
            }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                width: "100%",
                padding: "0.7rem 0.9rem",
                backgroundColor: "#333",
                border: "1px solid #444",
                color: "#e8e2d9",
                fontSize: "0.82rem",
                fontFamily: "Cormorant Garamond, serif",
                outline: "none",
                letterSpacing: "0.03em",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label style={{
              fontSize: "0.65rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#666",
              display: "block",
              marginBottom: "0.5rem",
            }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                width: "100%",
                padding: "0.7rem 0.9rem",
                backgroundColor: "#333",
                border: "1px solid #444",
                color: "#e8e2d9",
                fontSize: "0.82rem",
                fontFamily: "Cormorant Garamond, serif",
                outline: "none",
                letterSpacing: "0.03em",
                boxSizing: "border-box",
              }}
            />
          </div>

          <button
            onClick={handleLogin}
            disabled={loading}
            style={{
              marginTop: "0.5rem",
              padding: "0.85rem",
              backgroundColor: "transparent",
              color: "#e8e2d9",
              border: "1px solid #555",
              fontSize: "0.68rem",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.5 : 1,
              fontFamily: "Cormorant Garamond, serif",
              transition: "border-color 0.2s",
            }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.borderColor = "#e8e2d9"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#555"; }}
          >
            {loading ? "..." : "Login"}
          </button>
        </div>

        {/* 導線 */}
        <div style={{
          textAlign: "center",
          marginTop: "2rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.8rem",
        }}>
          <Link to="/wholesale-jp/register" style={{
            fontSize: "0.65rem",
            color: "#666",
            textDecoration: "underline",
            letterSpacing: "0.08em",
          }}>
            新規お取引のお申し込みはこちら
          </Link>
          <Link to="/wholesale-jp" style={{
            fontSize: "0.65rem",
            color: "#555",
            textDecoration: "none",
            letterSpacing: "0.08em",
          }}>
            ← 卸ページへ戻る
          </Link>
        </div>
      </div>
    </div>
  );
}