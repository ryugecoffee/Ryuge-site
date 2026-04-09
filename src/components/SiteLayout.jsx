import { Outlet, Link } from "react-router-dom";

export default function SiteLayout({ lang, setLang }) {
  return (
    <div className="site-shell">
      <header className="site-header minimal-header">
        <div className="site-header-side left" />

        <Link to="/" className="site-logo centered-logo">
          Ryuge Coffee
        </Link>

        <div className="lang-switch header-lang-switch">
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

      <Outlet />
    </div>
  );
}