import { Link } from "react-router-dom";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-inner container">
        <div className="footer-top">
          <div className="footer-brand-block">
            <p className="footer-brand">RYUGE COFFEE</p>
            <p className="footer-tagline">Quietly crafted in Kamakura</p>
          </div>

          <div className="footer-links-group">
            <a
              href="https://instagram.com/ryuge_coffee"
              target="_blank"
              rel="noreferrer"
            >
              Instagram
            </a>
            <a href="mailto:ryugecoffee@gmail.com">Email</a>
          </div>

          <div className="footer-links-group">
            <Link to="/privacy">プライバシーポリシー</Link>
            <Link to="/terms">利用規約</Link>
            <Link to="/legal">特定商取引法に基づく表記</Link>
          </div>
        </div>

        <div className="footer-bottom">
          <p>© 2026 RYUGE COFFEE</p>
        </div>
      </div>
    </footer>
  );
}