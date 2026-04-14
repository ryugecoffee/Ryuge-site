import { Link } from "react-router-dom";

export default function SiteFooter({ lang }) {
  const TEXT = {
    ja: {
      brand: "Ryuge Coffee",
      tagline: "Quietly crafted in Kamakura",
      company: "運営会社：株式会社龍華",
      description:  "焙煎珈琲豆・珈琲／お茶バッグの販売サイト",
      instagram: "Instagram",
      contact: "お問合せ / 卸販売について",
      email: "ryugecoffee@gmail.com",
      privacy: "プライバシーポリシー",
      terms: "利用規約",
      legal: "特定商取引法に基づく表記",
      shipping: "送料について",
      manage: "定期購入の確認・解約はこちら"
    },
    en: {
      brand: "Ryuge Coffee",
      tagline: "Quietly crafted in Kamakura",
      company: "Operating Company: Kabushikigaisha Ryuge",
      description: "Online store for roasted coffee beans and coffee/tea bags",
      contact: "Contact / Wholesale",
      email: "ryugecoffee@gmail.com",
      privacy: "Privacy Policy",
      terms: "Terms of Service",
      legal: "Legal Notice",
      shipping: "Shipping Info",
      manage: "Manage or cancel subscription"
    },
    es: {
      brand: "Ryuge Coffee",
      tagline: "Quietly crafted in Kamakura",
      company: "Empresa operadora: Kabushikigaisha Ryuge",
      description: "Tienda online de café tostado y bolsas de café/té",
      instagram: "Instagram",
      contact: "Contacto / Mayorista",
      email: "ryugecoffee@gmail.com",
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

            {/* ←ここがStripe対策のコア */}
            <p className="footer-company">{t.company}</p>
            <p className="footer-description">{t.description}</p>
          </div>

          <div className="footer-links-group">
            <a
              href="https://www.instagram.com/ryuge_coffee/"
              target="_blank"
              rel="noreferrer"
            >
              {t.instagram}
            </a>

            <a href={`mailto:${t.email}`}>
              {t.contact}
            </a>

            {/* メールを明示 */}
            <p className="footer-email">{t.email}</p>
          </div>

          <div className="footer-links-group">
            <Link to="/privacy">{t.privacy}</Link>
            <Link to="/terms">{t.terms}</Link>
            <Link to="/legal">{t.legal}</Link>
            <Link to="/shipping">{t.shipping}</Link>

            <a
              href="https://billing.stripe.com/p/login/3cI28r8GV4GcaFV1L85AQ01"
              target="_blank"
              rel="noreferrer"
            >
              {t.manage}
            </a>
          </div>
        </div>

        <div className="footer-bottom">
          <p>© 2024 Ryuge Coffee / 株式会社龍華</p>
        </div>
      </div>
    </footer>
  );
}