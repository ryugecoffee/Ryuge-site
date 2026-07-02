import { useEffect, useRef, useState } from "react";

// AI 豆コンシェルジュ — 商品ページ右下のチャットウィジェット
// バックエンド: /api/coffee-concierge (Vercel Serverless Function)

const UI = {
  ja: {
    open: "豆えらび相談",
    title: "豆コンシェルジュ",
    subtitle: "好みを伺って、あなたに合う豆をご提案します",
    placeholder: "例: 苦いのが好き、ミルクを入れて飲む",
    send: "送信",
    greeting: "こんにちは。お好みに合う豆をお探しします。普段はどんなコーヒーを飲まれますか?",
    error: "接続に失敗しました。少し待ってからお試しください。",
    quick: ["苦味が強いのが好き", "フルーティーなのが好き", "ギフトを探している"],
  },
  en: {
    open: "Find your beans",
    title: "Bean Concierge",
    subtitle: "Tell us your taste — we'll suggest the right beans",
    placeholder: "e.g. I like dark roast with milk",
    send: "Send",
    greeting: "Hello! Let me help you find your beans. What kind of coffee do you usually drink?",
    error: "Connection failed. Please try again shortly.",
    quick: ["I like bold & bitter", "I like fruity coffee", "Looking for a gift"],
  },
  es: {
    open: "Encuentra tu café",
    title: "Concierge de Granos",
    subtitle: "Cuéntanos tu gusto y te sugerimos los granos ideales",
    placeholder: "ej. Me gusta el tostado oscuro con leche",
    send: "Enviar",
    greeting: "¡Hola! Te ayudo a encontrar tus granos. ¿Qué café sueles tomar?",
    error: "Error de conexión. Inténtalo de nuevo en un momento.",
    quick: ["Me gusta fuerte y amargo", "Me gusta afrutado", "Busco un regalo"],
  },
};

export default function BeanConcierge({ lang = "ja" }) {
  const t = UI[lang] || UI.ja;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]); // {role, content}
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, loading, open]);

  const send = async (text) => {
    const content = (text || input).trim();
    if (!content || loading) return;
    setInput("");
    const next = [...messages, { role: "user", content }];
    setMessages(next);
    setLoading(true);
    try {
      const res = await fetch("/api/coffee-concierge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.reply) throw new Error(data.error || "error");
      setMessages([...next, { role: "assistant", content: data.reply }]);
    } catch (err) {
      console.error(err);
      setMessages([...next, { role: "assistant", content: t.error }]);
    } finally {
      setLoading(false);
    }
  };

  const showQuick = messages.filter((m) => m.role === "user").length === 0;

  return (
    <>
      {/* 開閉ボタン */}
      <button
        onClick={() => setOpen(!open)}
        aria-label={t.open}
        style={{
          position: "fixed",
          right: "20px",
          bottom: "20px",
          zIndex: 999,
          padding: "12px 20px",
          borderRadius: "24px",
          border: "1px solid rgba(255,255,255,0.2)",
          background: "rgba(20,20,20,0.92)",
          color: "rgba(255,255,255,0.85)",
          fontSize: "12px",
          letterSpacing: "0.1em",
          cursor: "pointer",
          backdropFilter: "blur(8px)",
        }}
      >
        {open ? "×" : `☕ ${t.open}`}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            right: "20px",
            bottom: "72px",
            zIndex: 999,
            width: "min(360px, calc(100vw - 40px))",
            height: "480px",
            display: "flex",
            flexDirection: "column",
            background: "rgba(18,18,18,0.97)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "12px",
            overflow: "hidden",
            backdropFilter: "blur(12px)",
          }}
        >
          {/* ヘッダー */}
          <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <p style={{ margin: 0, fontSize: "13px", letterSpacing: "0.12em", color: "rgba(255,255,255,0.9)" }}>
              {t.title}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: "11px", color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>
              {t.subtitle}
            </p>
          </div>

          {/* メッセージ */}
          <div ref={bodyRef} style={{ flex: 1, overflowY: "auto", padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <Bubble role="assistant">{t.greeting}</Bubble>
            {messages.map((m, i) => (
              <Bubble key={i} role={m.role}>{m.content}</Bubble>
            ))}
            {loading && <Bubble role="assistant">…</Bubble>}

            {showQuick && !loading && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}>
                {t.quick.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "14px",
                      border: "1px solid rgba(255,255,255,0.18)",
                      background: "transparent",
                      color: "rgba(255,255,255,0.6)",
                      fontSize: "11px",
                      cursor: "pointer",
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 入力欄 */}
          <div style={{ display: "flex", gap: "8px", padding: "12px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) send();
              }}
              placeholder={t.placeholder}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.85)",
                fontSize: "13px",
                outline: "none",
              }}
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              style={{
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.18)",
                background: "transparent",
                color: "rgba(255,255,255,0.7)",
                fontSize: "12px",
                cursor: loading ? "default" : "pointer",
                opacity: loading || !input.trim() ? 0.4 : 1,
              }}
            >
              {t.send}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Bubble({ role, children }) {
  const isUser = role === "user";
  return (
    <div
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "85%",
        padding: "9px 13px",
        borderRadius: isUser ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
        background: isUser ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)",
        color: "rgba(255,255,255,0.85)",
        fontSize: "13px",
        lineHeight: 1.7,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {children}
    </div>
  );
}
