// src/pages/WholesaleJpRegisterPage.jsx
import { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { useNavigate, Link } from "react-router-dom";

export default function WholesaleJpRegisterPage() {
  const [form, setForm] = useState({
    email: "",
    password: "",
    companyName: "",
    contactName: "",
    businessType: "",
    message: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async () => {
    setError("");

    if (!form.email || !form.password || !form.companyName || !form.contactName) {
      setError("必須項目をすべてご入力ください。");
      return;
    }

    if (form.password.length < 6) {
      setError("パスワードは6文字以上で設定してください。");
      return;
    }

    setLoading(true);

    try {
      const credential = await createUserWithEmailAndPassword(auth, form.email, form.password);
      const uid = credential.user.uid;

      await setDoc(doc(db, "wholesaleUsers", uid), {
        email: form.email,
        companyName: form.companyName,
        contactName: form.contactName,
        businessType: form.businessType,
        message: form.message,
        approved: false,
        status: "pending",
        role: "user",
        createdAt: serverTimestamp(),
      });

      setDone(true);
    } catch (err) {
      console.error(err);
      if (err.code === "auth/email-already-in-use") {
        setError("このメールアドレスはすでに登録されています。");
      } else if (err.code === "auth/invalid-email") {
        setError("メールアドレスの形式が正しくありません。");
      } else {
        setError("登録に失敗しました。しばらくしてから再度お試しください。");
      }
    } finally {
      setLoading(false);
    }
  };

  // 登録完了画面
  if (done) {
    return (
      <div style={{
        minHeight: "100vh",
        backgroundColor: "#2a2a2a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Cormorant Garamond, serif",
        padding: "2rem",
      }}>
        <div style={{
          width: "100%",
          maxWidth: "480px",
          textAlign: "center",
        }}>
          <p style={{
            fontSize: "0.65rem",
            letterSpacing: "0.26em",
            textTransform: "uppercase",
            color: "#666",
            marginBottom: "1.5rem",
          }}>
            Registration Complete
          </p>
          <h1 style={{
            fontSize: "1.5rem",
            fontWeight: 400,
            color: "#e8e2d9",
            letterSpacing: "0.06em",
            margin: "0 0 1.5rem",
          }}>
            ご登録ありがとうございます
          </h1>
          <p style={{
            fontSize: "0.78rem",
            color: "#777",
            lineHeight: 2.2,
            margin: "0 0 2.5rem",
            letterSpacing: "0.04em",
          }}>
            お申し込みを受け付けました。<br />
            内容を確認の上、承認が完了次第ご連絡いたします。<br />
            今しばらくお待ちください。
          </p>
          <Link
            to="/wholesale-jp"
            style={{
              fontSize: "0.68rem",
              color: "#e8e2d9",
              border: "1px solid #555",
              padding: "0.6rem 1.6rem",
              textDecoration: "none",
              letterSpacing: "0.14em",
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
    <div style={{
      minHeight: "100vh",
      backgroundColor: "#2a2a2a",
      fontFamily: "Cormorant Garamond, serif",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "3rem 2rem",
    }}>
      <div style={{ width: "100%", maxWidth: "480px" }}>

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
            Wholesale Registration
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
          <FormField
            label="パスワード"
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            required
            note="6文字以上"
          />

          {/* メッセージ */}
          <div>
            <label style={{
              fontSize: "0.65rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#666",
              display: "block",
              marginBottom: "0.5rem",
            }}>
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
                padding: "0.7rem 0.9rem",
                backgroundColor: "#333",
                border: "1px solid #444",
                color: "#e8e2d9",
                fontSize: "0.82rem",
                fontFamily: "Cormorant Garamond, serif",
                outline: "none",
                resize: "vertical",
                lineHeight: 1.8,
                letterSpacing: "0.03em",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* 送信ボタン */}
          <button
            onClick={handleSubmit}
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
            {loading ? "送信中..." : "申し込む"}
          </button>
        </div>

        {/* ログインへ */}
        <div style={{ textAlign: "center", marginTop: "2rem" }}>
          <Link
            to="/wholesale-jp/login"
            style={{
              fontSize: "0.65rem",
              color: "#666",
              textDecoration: "underline",
              letterSpacing: "0.08em",
            }}
          >
            すでにアカウントをお持ちの方
          </Link>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, name, type = "text", value, onChange, required, placeholder, note }) {
  return (
    <div>
      <label style={{
        fontSize: "0.65rem",
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "#666",
        display: "block",
        marginBottom: "0.5rem",
      }}>
        {label}
        {required && (
          <span style={{ color: "#7a5a5a", marginLeft: "0.4rem", fontSize: "0.6rem" }}>*</span>
        )}
        {note && (
          <span style={{ color: "#555", marginLeft: "0.6rem", fontSize: "0.6rem", textTransform: "none", letterSpacing: 0 }}>
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
  );
}