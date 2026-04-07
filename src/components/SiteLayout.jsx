import { Link, Outlet } from "react-router-dom";

export default function SiteLayout() {
  return (
    <div className="legal-page-shell">
      <header className="legal-header">
        <Link to="/" className="legal-brand">
          Ryuge Coffee
        </Link>

        <nav className="legal-nav">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/legal">Legal</Link>
        </nav>
      </header>

      <main className="legal-main">
        <Outlet />
      </main>

      <footer className="legal-footer">
        <div>Another Day, Another Coffee</div>
        <div className="legal-footer-links">
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/legal">Legal Notice</Link>
        </div>
      </footer>
    </div>
  );
}