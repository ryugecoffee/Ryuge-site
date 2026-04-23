// src/pages/WholesaleJpRegisterPage.jsx
import { useMemo, useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase";
import { Link } from "react-router-dom";

const API_BASE = "https://ryuge-site.onrender.com";

const baseFontFamily =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';

export default function WholesaleJpRegisterPage() {
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    companyName: "",
    contactName: "",
    businessType: "",
    message: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const passwordsMatch = useMemo(() => {
    if (!form.password || !form.confirmPassword) return true;
    return form.password === form.confirmPassword;
  }, [form.password, form.confirmPassword]);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async () => {
    setError("");

    if (
      !form.email ||
      !form.password ||
      !form.confirmPassword ||
      !form.companyName ||
      !form.contactName
    ) {
      setError("必須項目をすべてご入力ください。");
      return;
    }

    if (form.password.length < 6) {
      setError("パスワードは6文字以上で設定してください。");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("パスワードと確認用パスワードが一致していません。");
      return;
    }

    setLoading(true);

    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        form.email,
        form.password
      );

      const uid = credential.user.uid;

      const response = await fetch(`${API_BASE}/wholesale-register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uid,
          email: form.email,
          companyName: form.companyName,
          contactName: form.contactName,
          businessType: form.businessType,
          message: form.message,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "申請送信に失敗しました。");
      }

      setDone(true);
    } catch (err) {
      console.error(err);

      if (err.code === "auth/email-already-in-use") {
        setError("このメールアドレスはすでに登録されています。");
      } else if (err.code === "auth/invalid-email") {
        setError("メールアドレスの形式が正しくありません。");
      } else if (err.message) {
        setError(err.message);
      } else {
        setError("登録に失敗しました。しばらくしてから再度お試しください。");
      }
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: "#2a2a2a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: baseFontFamily,
          padding: "2rem",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "480px",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontSize: "0.68rem",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#777",
              marginBottom: "1.5rem",
            }}
          >
            Registration Complete
          </p>

          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 500,
              color: "#e8e2d9",
              letterSpacing: "0.04em",
              margin: "0 0 1.5rem",
            }}
          >
            ご登録ありがとうございます
          </h1>

          <p
            style={{
              fontSize: "0.92rem",
              color: "#a6a6a6",
              lineHeight: 1.9,
              margin: "0 0 2.5rem",
              letterSpacing: "0.01em",
            }}
          >
            お申し込みを受け付けました。<br />
            内容を確認の上、承認が完了次第ご連絡いたします。<br />
            今しばらくお待ちください。
          </p>

          <Link
            to="/wholesale-jp"
            style={{
              display: "inline-block",
              fontSize: "0.78rem",
              color: "#e8e2d9",
              border: "1px solid #555",
              padding: "0.75rem 1.6rem",
              textDecoration: "none",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            卸ページへ戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#2a2a2a",
        fontFamily: baseFontFamily,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "3rem 2rem",
      }}
    >
      <div style={{ width: "100%", maxWidth: "480px" }}>
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <Link to="/" style={{ textDecoration: "none" }}>
            <p
              style={{
                fontSize: "0.95rem",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "#e8e2d9",
                margin: "0 0 0.6rem",
                fontWeight: 500,
              }}
            >
              RYUGE COFFEE
            </p>
          </Link>

          <p
            style={{
              fontSize: "0.72rem",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#777",
              margin: 0,
            }}
          >
            Wholesale Registration
          </p>
        </div>

        {error && (
          <div
            style={{
              marginBottom: "1.5rem",
              padding: "0.9rem 1rem",
              borderLeft: "2px solid #9a4c4c",
              backgroundColor: "#3a2a2a",
              fontSize: "0.84rem",
              color: "#d7a0a0",
              letterSpacing: "0.01em",
              lineHeight: 1.7,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
          <FormField
            label="貴社名・店舗名"
            name="companyName"
            value={form.companyName}
            onChange={handleChange}
            required
          />

          <FormField
            label="担当者名"
            name="contactName"
            value={form.contactName}
            onChange={handleChange}
            required
          />

          <FormField
            label="業種"
            name="businessType"
            value={form.businessType}
            onChange={handleChange}
            placeholder="例：カフェ、ホテル、雑貨店 など"
          />

          <FormField
            label="メールアドレス"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            required
          />

          <PasswordField
            label="パスワード"
            name="password"
            value={form.password}
            onChange={handleChange}
            required
            note="6文字以上"
            visible={showPassword}
            onToggleVisible={() => setShowPassword((prev) => !prev)}
          />

          <PasswordField
            label="確認用パスワード"
            name="confirmPassword"
            value={form.confirmPassword}
            onChange={handleChange}
            required
            visible={showConfirmPassword}
            onToggleVisible={() => setShowConfirmPassword((prev) => !prev)}
          />

          {form.confirmPassword && (
            <p
              style={{
                margin: "-0.4rem 0 0",
                fontSize: "0.78rem",
                color: passwordsMatch ? "#8fb08f" : "#d7a0a0",
                lineHeight: 1.6,
              }}
            >
              {passwordsMatch
                ? "パスワードが一致しています。"
                : "パスワードが一致していません。"}
            </p>
          )}

          <div>
            <label
              style={{
                fontSize: "0.68rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#777",
                display: "block",
                marginBottom: "0.5rem",
              }}
            >
              お取引についてのご要望・ご質問
            </label>

            <textarea
              name="message"
              value={form.message}
              onChange={handleChange}
              rows={4}
              placeholder="任意"
              style={{
                width: "100%",
                padding: "0.8rem 0.95rem",
                backgroundColor: "#333",
                border: "1px solid #444",
                color: "#e8e2d9",
                fontSize: "0.9rem",
                fontFamily: baseFontFamily,
                outline: "none",
                resize: "vertical",
                lineHeight: 1.8,
                letterSpacing: "0.01em",
                boxSizing: "border-box",
              }}
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading || !passwordsMatch}
            style={{
              marginTop: "0.5rem",
              padding: "0.9rem",
              backgroundColor: "transparent",
              color: "#e8e2d9",
              border: "1px solid #555",
              fontSize: "0.76rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              cursor: loading || !passwordsMatch ? "not-allowed" : "pointer",
              opacity: loading || !passwordsMatch ? 0.5 : 1,
              fontFamily: baseFontFamily,
              transition: "border-color 0.2s",
            }}
            onMouseEnter={(e) => {
              if (!loading && passwordsMatch) {
                e.currentTarget.style.borderColor = "#e8e2d9";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#555";
            }}
          >
            {loading ? "送信中..." : "申し込む"}
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: "2rem" }}>
          <Link
            to="/wholesale-jp/login"
            style={{
              fontSize: "0.72rem",
              color: "#888",
              textDecoration: "underline",
              letterSpacing: "0.03em",
            }}
          >
            すでにアカウントをお持ちの方
          </Link>
        </div>
      </div>
    </div>
  );
}

function FormField({
  label,
  name,
  type = "text",
  value,
  onChange,
  required,
  placeholder,
  note,
}) {
  return (
    <div>
      <label
        style={{
          fontSize: "0.68rem",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#777",
          display: "block",
          marginBottom: "0.5rem",
        }}
      >
        {label}
        {required && (
          <span
            style={{
              color: "#9a6a6a",
              marginLeft: "0.4rem",
              fontSize: "0.62rem",
            }}
          >
            *
          </span>
        )}
        {note && (
          <span
            style={{
              color: "#666",
              marginLeft: "0.6rem",
              fontSize: "0.62rem",
              textTransform: "none",
              letterSpacing: 0,
            }}
          >
            {note}
          </span>
        )}
      </label>

      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "0.8rem 0.95rem",
          backgroundColor: "#333",
          border: "1px solid #444",
          color: "#e8e2d9",
          fontSize: "0.9rem",
          fontFamily: baseFontFamily,
          outline: "none",
          letterSpacing: "0.01em",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

function PasswordField({
  label,
  name,
  value,
  onChange,
  required,
  note,
  visible,
  onToggleVisible,
}) {
  return (
    <div>
      <label
        style={{
          fontSize: "0.68rem",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#777",
          display: "block",
          marginBottom: "0.5rem",
        }}
      >
        {label}
        {required && (
          <span
            style={{
              color: "#9a6a6a",
              marginLeft: "0.4rem",
              fontSize: "0.62rem",
            }}
          >
            *
          </span>
        )}
        {note && (
          <span
            style={{
              color: "#666",
              marginLeft: "0.6rem",
              fontSize: "0.62rem",
              textTransform: "none",
              letterSpacing: 0,
            }}
          >
            {note}
          </span>
        )}
      </label>

      <div style={{ position: "relative" }}>
        <input
          type={visible ? "text" : "password"}
          name={name}
          value={value}
          onChange={onChange}
          style={{
            width: "100%",
            padding: "0.8rem 3rem 0.8rem 0.95rem",
            backgroundColor: "#333",
            border: "1px solid #444",
            color: "#e8e2d9",
            fontSize: "0.9rem",
            fontFamily: baseFontFamily,
            outline: "none",
            letterSpacing: "0.01em",
            boxSizing: "border-box",
          }}
        />

        <button
          type="button"
          onClick={onToggleVisible}
          aria-label={visible ? "パスワードを隠す" : "パスワードを表示"}
          style={{
            position: "absolute",
            top: "50%",
            right: "0.7rem",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            color: "#999",
            cursor: "pointer",
            fontSize: "1rem",
            lineHeight: 1,
            padding: 0,
            fontFamily: baseFontFamily,
          }}
        >
          {visible ? "◉" : "◌"}
        </button>
      </div>
    </div>
  );
}