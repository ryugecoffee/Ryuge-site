// src/pages/WholesaleJpLoginPage.jsx
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const BACK_LABEL = {
  ja: "← サイトへ戻る",
  en: "← Back to Site",
  es: "← Volver al sitio",
};

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
  const [formLoading, setFormLoading] = useState(false);

  // ログイン済み かつ 承認済み or 管理者 → ダッシュボードへ
  // 未承認（pending）はリダイレクトせず「承認待ち」メッセージを表示
  useEffect(() => {
    if (!authLoading && user && (approved || isAdmin)) {
      navigate("/wholesale-jp/dashboard", { replace: true });
    }
  }, [authLoading, user, approved, isAdmin, navigate]);

  // ログインフォーム送信
  // login() 完了 → onAuthStateChanged が発火 → AuthContext が loading=true にリセット
  // → Firestore フェッチ → approved/isAdmin セット → loading=false
  // → 上の useEffect が !authLoading && user を検知 → navigate
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setFormLoading(true);

    try {
      await login(email, password);
      // navigate は useEffect に委譲（login() 直後は AuthContext がまだ更新中のため）
    } catch (error) {
      console.error("LOGIN ERROR:", error.code, error.message);
      setErrorMessage(`ログイン失敗: ${error?.code || "unknown-error"}`);
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: COLORS.bg,
        color: COLORS.text,
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
            className="site-logo"
            style={{
              textDecoration: "none",
              color: COLORS.text,
              fontSize: "0.95rem",
            }}
          >
            Ryuge Coffee
          </Link>

          <Link
            to="/"
            style={{
              textDecoration: "none",
              color: COLORS.mutedText,
              fontSize: "0.78rem",
              letterSpacing: "0.1em",
            }}
          >
            {BACK_LABEL.ja}
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
              className="site-logo"
              style={{
                margin: "0 0 0.9rem",
                color: COLORS.text,
                fontSize: "1.15rem",
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
              <label style={labelStyle}>Email</label>
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
              <label style={labelStyle}>Password</label>
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
                }}
              >
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={formLoading}
              style={{
                ...submitButtonStyle,
                opacity: formLoading ? 0.55 : 1,
              }}
            >
              {formLoading ? "Loading..." : "Login"}
            </button>
          </form>

          {/* 未承認ユーザーへの案内 */}
          {!authLoading && user && !approved && !isAdmin && (
            <div
              style={{
                marginTop: "1.4rem",
                padding: "1rem 1.2rem",
                border: "1px solid rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.03)",
                fontSize: "0.9rem",
                color: COLORS.softText,
                lineHeight: 1.8,
              }}
            >
              ご登録ありがとうございます。<br />
              現在、ご申請内容を確認中です。承認が完了次第ご連絡いたします。<br />
              しばらくお待ちください。
            </div>
          )}

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
                fontWeight: 500,
              }}
            >
              新規お取引のお申し込みはこちら
            </Link>

            <Link
              to="/"
              style={{
                color: COLORS.mutedText,
                fontSize: "0.84rem",
                textDecoration: "none",
              }}
            >
              {BACK_LABEL.ja}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

const labelStyle = {
  display: "block",
  marginBottom: "0.55rem",
  color: "rgba(255,255,255,0.70)",
  fontSize: "0.84rem",
  letterSpacing: "0.08em",

  fontWeight: 500,
};

const inputStyle = {
  width: "100%",
  height: "56px",
  backgroundColor: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "rgba(255,255,255,0.96)",
  padding: "0 1rem",
  boxSizing: "border-box",
  fontSize: "16px",

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

  fontWeight: 600,
  appearance: "none",
  WebkitAppearance: "none",
  borderRadius: 0,
  pointerEvents: "auto",
  position: "relative",
  zIndex: 5,
};
