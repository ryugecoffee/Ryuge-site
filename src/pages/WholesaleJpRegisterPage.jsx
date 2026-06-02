// src/pages/WholesaleJpRegisterPage.jsx
import { useMemo, useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase";
import { Link } from "react-router-dom";

const API_BASE = "https://ryuge-site.onrender.com";

const FONT =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';

const PREFECTURES = [
  "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県",
  "茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
  "新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県",
  "静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県",
  "奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県",
  "徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県",
  "熊本県","大分県","宮崎県","鹿児島県","沖縄県",
];

const C = {
  bg: "#2a2a2a",
  surface: "#333",
  border: "#444",
  text: "#e8e2d9",
  soft: "#a6a6a6",
  muted: "#777",
  green: "#8fb08f",
  red: "#d7a0a0",
  redBorder: "#9a4c4c",
  redBg: "#3a2a2a",
};

export default function WholesaleJpRegisterPage() {
  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    businessType: "",
    email: "",
    password: "",
    confirmPassword: "",
    // 住所
    postalCode: "",
    prefecture: "",
    city: "",
    building: "",
    // その他
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
    const { name, value } = e.target;
    // 郵便番号は数字のみ・7桁まで
    if (name === "postalCode") {
      const numeric = value.replace(/[^0-9]/g, "").slice(0, 7);
      setForm((prev) => ({ ...prev, postalCode: numeric }));
      return;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
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

    if (form.postalCode && form.postalCode.length !== 7) {
      setError("郵便番号は7桁で入力してください（ハイフン不要）。");
      return;
    }

    setLoading(true);

    try {
      await doRegister();
      setDone(true);
    } catch (err) {
      console.error(err);
      if (err.code === "auth/email-already-in-use") {
        // 孤立したAuthアカウントを削除してリトライ
        try {
          const cleanRes = await fetch(`${API_BASE}/wholesale-delete-user-by-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: form.email }),
          });
          const cleanData = await cleanRes.json().catch(() => ({}));
          if (!cleanRes.ok) {
            // Firestoreに残っている → 現役ユーザー
            setError(cleanData.error || "このメールアドレスはすでに登録されています。");
            return;
          }
          // 孤立Auth削除成功 → 再登録
          await doRegister();
          setDone(true);
        } catch (retryErr) {
          console.error("retry register error:", retryErr);
          setError(retryErr.message || "登録に失敗しました。しばらくしてから再度お試しください。");
        }
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

  // 登録処理本体（リトライ用に切り出し）
  const doRegister = async () => {
    const credential = await createUserWithEmailAndPassword(
      auth,
      form.email,
      form.password
    );

    const uid = credential.user.uid;

    const payload = {
      uid,
      email: form.email,
      companyName: form.companyName,
      contactName: form.contactName,
      businessType: form.businessType,
      postalCode: form.postalCode,
      prefecture: form.prefecture,
      city: form.city,
      building: form.building,
      message: form.message,
    };

    const response = await fetch(`${API_BASE}/wholesale-register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "申請送信に失敗しました。");
    }
  };

  /* 完了画面 */
  if (done) {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: C.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: FONT,
          padding: "2rem",
        }}
      >
        <div style={{ width: "100%", maxWidth: "480px", textAlign: "center" }}>
          <p
            style={{
              fontSize: "0.72rem",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: C.muted,
              marginBottom: "1.5rem",
            }}
          >
            Registration Complete
          </p>
          <h1
            style={{
              fontSize: "1.6rem",
              fontWeight: 500,
              color: C.text,
              letterSpacing: "0.04em",
              margin: "0 0 1.5rem",
            }}
          >
            ご登録ありがとうございます
          </h1>
          <p
            style={{
              fontSize: "0.95rem",
              color: C.soft,
              lineHeight: 2,
              margin: "0 0 2.5rem",
            }}
          >
            お申し込みを受け付けました。
            <br />
            内容を確認の上、承認が完了次第ご連絡いたします。
            <br />
            今しばらくお待ちください。
          </p>
          <Link
            to="/wholesale-jp"
            style={{
              display: "inline-block",
              fontSize: "0.82rem",
              color: C.text,
              border: "1px solid #555",
              padding: "0.85rem 1.8rem",
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

  /* 登録フォーム */
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: C.bg,
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "4rem 2rem",
      }}
    >
      <div style={{ width: "100%", maxWidth: "520px" }}>
        {/* ロゴ */}
        <div style={{ textAlign: "center", marginBottom: "2.8rem" }}>
          <Link to="/" style={{ textDecoration: "none" }}>
            <p
              style={{
                fontSize: "1rem",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: C.text,
                margin: "0 0 0.6rem",
                fontWeight: 600,
              }}
            >
              RYUGE COFFEE
            </p>
          </Link>
          <p
            style={{
              fontSize: "0.75rem",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: C.muted,
              margin: 0,
            }}
          >
            Wholesale Registration
          </p>
        </div>

        {/* エラー */}
        {error && (
          <div
            style={{
              marginBottom: "1.5rem",
              padding: "0.9rem 1.1rem",
              borderLeft: `2px solid ${C.redBorder}`,
              backgroundColor: C.redBg,
              fontSize: "0.9rem",
              color: C.red,
              lineHeight: 1.7,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "1.3rem" }}>
          {/* 基本情報 */}
          <SectionDivider label="基本情報" />

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

          {/* 住所 */}
          <SectionDivider label="住所" />

          <FormField
            label="郵便番号"
            name="postalCode"
            value={form.postalCode}
            onChange={handleChange}
            placeholder="例：1234567（ハイフン不要）"
            note="数字7桁"
            inputMode="numeric"
          />

          <div>
            <label style={labelStyle}>
              都道府県
            </label>
            <div style={{ position: "relative" }}>
              <select
                name="prefecture"
                value={form.prefecture}
                onChange={handleChange}
                style={{
                  width: "100%",
                  padding: "0.85rem 2.5rem 0.85rem 0.95rem",
                  backgroundColor: C.surface,
                  border: `1px solid ${C.border}`,
                  color: form.prefecture ? C.text : C.muted,
                  fontSize: "0.95rem",
                  fontFamily: FONT,
                  outline: "none",
                  appearance: "none",
                  WebkitAppearance: "none",
                  boxSizing: "border-box",
                  cursor: "pointer",
                }}
              >
                <option value="">選択してください</option>
                {PREFECTURES.map((p) => (
                  <option key={p} value={p}>
                    {p}
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

          <FormField
            label="市区町村・番地"
            name="city"
            value={form.city}
            onChange={handleChange}
            placeholder="例：渋谷区神南1-2-3"
          />
          <FormField
            label="建物名・部屋番号"
            name="building"
            value={form.building}
            onChange={handleChange}
            placeholder="任意"
          />

          {/* アカウント情報 */}
          <SectionDivider label="アカウント情報" />

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
                fontSize: "0.85rem",
                color: passwordsMatch ? C.green : C.red,
              }}
            >
              {passwordsMatch
                ? "パスワードが一致しています。"
                : "パスワードが一致していません。"}
            </p>
          )}

          {/* メッセージ */}
          <SectionDivider label="その他" />

          <div>
            <label style={labelStyle}>
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
                padding: "0.85rem 0.95rem",
                backgroundColor: C.surface,
                border: `1px solid ${C.border}`,
                color: C.text,
                fontSize: "0.95rem",
                fontFamily: FONT,
                outline: "none",
                resize: "vertical",
                lineHeight: 1.8,
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* 送信ボタン */}
          <button
            onClick={handleSubmit}
            disabled={loading || !passwordsMatch}
            style={{
              marginTop: "0.5rem",
              padding: "1rem",
              backgroundColor: "transparent",
              color: C.text,
              border: "1px solid #555",
              fontSize: "0.82rem",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              cursor: loading || !passwordsMatch ? "not-allowed" : "pointer",
              opacity: loading || !passwordsMatch ? 0.5 : 1,
              fontFamily: FONT,
              transition: "border-color 0.2s",
            }}
            onMouseEnter={(e) => {
              if (!loading && passwordsMatch)
                e.currentTarget.style.borderColor = C.text;
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
              fontSize: "0.82rem",
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

/* ====================================================
   共通コンポーネント
==================================================== */
const labelStyle = {
  fontSize: "0.72rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "#777",
  display: "block",
  marginBottom: "0.5rem",
};

function SectionDivider({ label }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.8rem",
        marginTop: "0.5rem",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: "0.68rem",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#555",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </p>
      <div style={{ flex: 1, height: "1px", backgroundColor: "#3a3a3a" }} />
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
  inputMode,
}) {
  return (
    <div>
      <label style={labelStyle}>
        {label}
        {required && (
          <span style={{ color: "#9a6a6a", marginLeft: "0.4rem", fontSize: "0.65rem" }}>
            *
          </span>
        )}
        {note && (
          <span style={{ color: "#555", marginLeft: "0.6rem", fontSize: "0.65rem", textTransform: "none", letterSpacing: 0 }}>
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
        inputMode={inputMode}
        style={{
          width: "100%",
          padding: "0.85rem 0.95rem",
          backgroundColor: "#333",
          border: "1px solid #444",
          color: "#e8e2d9",
          fontSize: "0.95rem",
          fontFamily: FONT,
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
      <label style={labelStyle}>
        {label}
        {required && (
          <span style={{ color: "#9a6a6a", marginLeft: "0.4rem", fontSize: "0.65rem" }}>
            *
          </span>
        )}
        {note && (
          <span style={{ color: "#555", marginLeft: "0.6rem", fontSize: "0.65rem", textTransform: "none", letterSpacing: 0 }}>
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
            padding: "0.85rem 3rem 0.85rem 0.95rem",
            backgroundColor: "#333",
            border: "1px solid #444",
            color: "#e8e2d9",
            fontSize: "0.95rem",
            fontFamily: FONT,
            outline: "none",
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
            right: "0.75rem",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            color: "#888",
            cursor: "pointer",
            fontSize: "1.1rem",
            lineHeight: 1,
            padding: 0,
          }}
        >
          {visible ? "◉" : "◌"}
        </button>
      </div>
    </div>
  );
}
