// src/pages/WholesaleJpLoginPage.jsx
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const COLORS = {
  bg: "#050505",
  panel: "#0b0b0b",
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.16)",
  text: "rgba(255,255,255,0.92)",
  softText: "rgba(255,255,255,0.70)",
  mutedText: "rgba(255,255,255,0.42)",
  inputBg: "rgba(255,255,255,0.03)",
};

export default function WholesaleJpLoginPage() {
  const { login, user, approved, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // authLoading 完了 かつ user が存在 → ダッシュボードへ
  // （ログイン直後 & 既存セッション両方をカバー）
  // AuthContext は onAuthStateChanged 発火時に loading=true にリセットし、
  // Firestore フェッチ完了後に loading=false にするため、
  // このタイミングでは approved/isAdmin が正しくセットされている
  useEffect(() => {
    if (!authLoading && user) {
      navigate("/wholesale-jp/dashboard", { replace: true });
    }
  }, [authLoading, user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setLoading(true);

    try {
      await login(email, password);
      // navigate はここでは呼ばない
      // login() 完了 → onAuthStateChanged が loading=true にリセット後 user をセット
      // → Firestore フェッチ完了 → loading=false → 上の useEffect がリダイレクト
    } catch (error) {
      console.error("LOGIN ERROR:", error.code, error.message);
      setErrorMessage(`ログイン失敗: ${error?.code || "unknown-error"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: COLORS.bg,
        color: COLORS.text,
        fontFamily:
          '"Cormorant Garamond", "Noto Serif JP", "Hiragino Mincho ProN", serif',
      }}
    >
      <header
        style={{
          borderBottom: `1px solid ${COLORS.border}`,
          backgroundColor: "rgba(5,5,5,0.92)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div
          style={{
            maxWidth: "1440px",
            margin: "0 auto",
            padding: "1.35rem 3.2rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Link
            to="/"
            style={{
              textDecoration: "none",
              color: COLORS.text,
              fontSize: "0.95rem",
              letterSpacing: "0.18em",
            }}
          >
            Ryuge Coffee
          </Link>

          <Link
            to="/wholesale-jp"
            style={{
              textDecoration: "none",
              color: COLORS.mutedText,
              fontSize: "0.78rem",
              letterSpacing: "0.1em",
            }}
          >
            卸ページへ戻る
          </Link>
        </div>
      </header>

      <main
        style={{
          minHeight: "calc(100vh - 78px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "4rem 2rem",
        }}
      >
        <div
  style={{
    width: "100%",
    maxWidth: "540px",
    position: "relative",
    zIndex: 5,
  }}
>
          <div style={{ textAlign: "center", marginBottom: "2.2rem" }}>
            <p
              style={{
                margin: "0 0 0.9rem",
                color: COLORS.text,
                fontSize: "1.15rem",
                letterSpacing: "0.16em",
              }}
            >
              RYUGE COFFEE
            </p>

            <p
              style={{
                margin: 0,
                color: COLORS.mutedText,
                fontSize: "0.78rem",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              Wholesale Login
            </p>
          </div>

          <form
  onSubmit={handleSubmit}
  style={{
    backgroundColor: "transparent",
    padding: 0,
    position: "relative",
    zIndex: 5,
  }}
>
            <div style={{ marginBottom: "1.2rem" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.55rem",
                  color: COLORS.softText,
                  fontSize: "0.84rem",
                  letterSpacing: "0.08em",
                  fontFamily:
                    '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  fontWeight: 500,
                }}
              >
                Email
              </label>

              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: "1.2rem" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.55rem",
                  color: COLORS.softText,
                  fontSize: "0.84rem",
                  letterSpacing: "0.08em",
                  fontFamily:
                    '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  fontWeight: 500,
                }}
              >
                Password
              </label>

              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={inputStyle}
              />
            </div>

            {errorMessage && (
              <p
                style={{
                  margin: "0 0 1rem",
                  color: "#d8b8b8",
                  fontSize: "0.9rem",
                  lineHeight: 1.7,
                  fontFamily:
                    '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                }}
              >
                {errorMessage}
              </p>
            )}

            <button
  type="submit"
  disabled={loading}
  style={{
    ...submitButtonStyle,
    opacity: loading ? 0.55 : 1,
  }}
>
  {loading ? "Loading..." : "Login"}
</button>
          </form>

          <div
            style={{
              marginTop: "1.6rem",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              gap: "0.8rem",
            }}
          >
            <Link
              to="/wholesale-jp/register"
              style={{
                color: COLORS.softText,
                fontSize: "0.88rem",
                textDecoration: "underline",
                textUnderlineOffset: "3px",
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                fontWeight: 500,
              }}
            >
              新規お取引のお申し込みはこちら
            </Link>

            <Link
              to="/wholesale-jp"
              style={{
                color: COLORS.mutedText,
                fontSize: "0.84rem",
                textDecoration: "none",
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              }}
            >
              ← 卸ページへ戻る
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  height: "56px",
  backgroundColor: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "rgba(255,255,255,0.96)",
  padding: "0 1rem",
  boxSizing: "border-box",
  fontSize: "16px",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontWeight: 500,
  outline: "none",
};

const submitButtonStyle = {
  width: "100%",
  height: "56px",
  marginTop: "0.8rem",
  backgroundColor: "transparent",
  border: "1px solid rgba(255,255,255,0.22)",
  color: "rgba(255,255,255,0.96)",
  cursor: "pointer",
  fontSize: "0.92rem",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontWeight: 600,
  appearance: "none",
  WebkitAppearance: "none",
  borderRadius: 0,
  pointerEvents: "auto",
  position: "relative",
  zIndex: 5,
};