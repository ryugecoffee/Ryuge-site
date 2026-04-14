import { Link } from "react-router-dom";

export default function SiteFooter({ lang }) {
  const TEXT = {
    ja: {
      brand: "Ryuge Coffee",
      tagline: "Quietly crafted in Kamakura",
      instagram: "Instagram",
      contact: "お問合せ / 卸販売について",
      privacy: "プライバシーポリシー",
      terms: "利用規約",
      legal: "特定商取引法に基づく表記",
      shipping: "送料について",
      manage: "定期購入の確認・解約はこちら"
    },
    en: {
      brand: "Ryuge Coffee",
      tagline: "Quietly crafted in Kamakura",
      instagram: "Instagram",
      contact: "Contact / Wholesale",
      privacy: "Privacy Policy",
      terms: "Terms of Service",
      legal: "Legal Notice",
      shipping: "Shipping Info",
      manage: "Manage or cancel subscription"
    },
    es: {
      brand: "Ryuge Coffee",
      tagline: "Quietly crafted in Kamakura",
      instagram: "Instagram",
      contact: "Contacto / Mayorista",
      privacy: "Política de Privacidad",
      terms: "Términos de Servicio",
      legal: "Aviso Legal",
      shipping: "Información de Envío",
      manage: "Gestionar o cancelar suscripción"
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
            <a href="mailto:ryugecoffee@gmail.com">{t.contact}</a>
          </div>

          <div className="footer-links-group">
            <Link to="/privacy">{t.privacy}</Link>
            <Link to="/terms">{t.terms}</Link>
            <Link to="/legal">{t.legal}</Link>
            <Link to="/shipping">{t.shipping}</Link>

            <a
              href="https://billing.stripe.com/p/login/1Zu4gz7CR4Gc15I0H45AQ00"
              target="_blank"
              rel="noreferrer"
            >
              {t.manage}
            </a>
          </div>
        </div>

        <div className="footer-bottom">
          <p>© 2024 Ryuge Coffee</p>
        </div>
      </div>
    </footer>
  );
}