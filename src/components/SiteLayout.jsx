import { Outlet, Link } from "react-router-dom";

export default function SiteLayout({ lang, setLang }) {
  return (
    <div>
      <header className="site-header">
        <Link to="/" className="site-logo">
          Ryuge Coffee
        </Link>

<nav className="site-nav">
  <Link to="/products">商品</Link>
  <Link to="/privacy">Privacy</Link>
  <Link to="/terms">Terms</Link>
  <Link to="/legal">Legal</Link>
</nav>

        <div className="lang-switch">
          <button onClick={() => setLang("ja")}>JA</button>
          <button onClick={() => setLang("en")}>EN</button>
          <button onClick={() => setLang("es")}>ES</button>
        </div>
      </header>

      <main>
        <Outlet />
      </main>
    </div>
  );
}