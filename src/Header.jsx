import React from "react";

export default function Header({ lang, setLang, UI_TEXT }) {
  const t = UI_TEXT[lang];

  return (
    <header className="site-header">
      {/* 左：ロゴ */}
      <div className="brand">RYUGE COFFEE</div>

      {/* 中央：法律ナビ（←追加） */}
      <nav className="header-nav">
        <a href="/privacy">{t.privacyPolicy}</a>
        <a href="/legal">{t.legalNotice}</a>
      </nav>

      {/* 右：言語 */}
      <div className="lang-switch">
        <button
          className={lang === "ja" ? "active" : ""}
          onClick={() => setLang("ja")}
        >
          JA
        </button>
        <button
          className={lang === "en" ? "active" : ""}
          onClick={() => setLang("en")}
        >
          EN
        </button>
        <button
          className={lang === "es" ? "active" : ""}
          onClick={() => setLang("es")}
        >
          ES
        </button>
      </div>
    </header>
  );
}