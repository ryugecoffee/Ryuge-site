import { Outlet, Link } from "react-router-dom";
import SiteFooter from "./SiteFooter";
import { UI_TEXT } from "../uiText";

export default function SiteLayout({ lang, setLang }) {
  const t = UI_TEXT[lang] || UI_TEXT.ja;

  return (
    <div>
      <header className="site-header">
        <Link to="/" className="site-logo">
          Ryuge Coffee
        </Link>

        <nav className="site-nav">
          <Link to="/products">{t.products}</Link>
          <Link to="/privacy">{t.privacyPolicy}</Link>
          <Link to="/terms">{t.terms}</Link>
          <Link to="/legal">{t.legalNotice}</Link>
        </nav>

        <div className="lang-switch">
          <button
            className={lang === "ja" ? "active" : ""}
            onClick={() => setLang("ja")}
            type="button"
          >
            JA
          </button>
          <button
            className={lang === "en" ? "active" : ""}
            onClick={() => setLang("en")}
            type="button"
          >
            EN
          </button>
          <button
            className={lang === "es" ? "active" : ""}
            onClick={() => setLang("es")}
            type="button"
          >
            ES
          </button>
        </div>
      </header>

      <main>
        <Outlet />
        <SiteFooter lang={lang} />
      </main>
    </div>
  );
}