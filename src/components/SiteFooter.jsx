import { Link } from "react-router-dom";

export default function SiteFooter({ lang }) {
  const TEXT = {
    ja: {
      brand: "Ryuge Coffee",
      tagline: "Quietly crafted in Kamakura",
      instagram: "Instagram",
      email: "Email",
      privacy: "プライバシーポリシー",
      terms: "利用規約",
      legal: "特定商取引法に基づく表記",
    },
    en: {
      brand: "Ryuge Coffee",
      tagline: "Quietly crafted in Kamakura",
      instagram: "Instagram",
      email: "Email",
      privacy: "Privacy Policy",
      terms: "Terms of Service",
      legal: "Legal Notice",
    },
    es: {
      brand: "Ryuge Coffee",
      tagline: "Quietly crafted in Kamakura",
      instagram: "Instagram",
      email: "Email",
      privacy: "Política de Privacidad",
      terms: "Términos de Servicio",
      legal: "Aviso Legal",
    },
  };

  const t = TEXT[lang] || TEXT.ja;

  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div className="footer-top">
          <div className="footer-brand-block">
            <p className="footer-brand">{t.brand}</p>
            <p className="footer-tagline">{t.tagline}</p>
          </div>

          <div className="footer-links-group">
            <a
              href="https://www.instagram.com/ryuge_coffee/"
              target="_blank"
              rel="noreferrer"
            >
              {t.instagram}
            </a>
            <a href="mailto:ryugecoffee@gmail.com">{t.email}</a>
          </div>

          <div className="footer-links-group">
            <Link to="/privacy">{t.privacy}</Link>
            <Link to="/terms">{t.terms}</Link>
            <Link to="/legal">{t.legal}</Link>
          </div>
        </div>

        <div className="footer-bottom">
          <p>© 2026 Ryuge Coffee</p>
        </div>
      </div>
    </footer>
  );
}