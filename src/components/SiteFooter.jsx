// src/components/SiteFooter.jsx
import { Link } from "react-router-dom";
import AccessSection from "../pages/AccessSection";

export default function SiteFooter({ lang }) {
  const TEXT = {
    ja: {
      brand: "Ryuge Coffee",
      tagline: "Quietly crafted in Kamakura",
      company: "運営会社：株式会社龍華",
      description: "焙煎珈琲豆・珈琲／一煎袋の販売サイト",
      instagram: "Instagram",
      contact: "お問合せ",
      email: "ryugecoffee@gmail.com",
      privacy: "プライバシーポリシー",
      terms: "利用規約",
      legal: "特定商取引法に基づく表記",
      shipping: "送料について",
      manage: "定期購入の確認・解約はこちら",
      refund: "返品・返金ポリシー",
      access: "アクセス",
      wholesale: "卸販売（国内）",
    },
    en: {
      brand: "Ryuge Coffee",
      tagline: "Quietly crafted in Kamakura",
      company: "Operating Company: Kabushikigaisha Ryuge",
      description: "Online store for roasted coffee beans and coffee/tea bags",
      instagram: "Instagram",
      contact: "Contact",
      email: "ryugecoffee@gmail.com",
      privacy: "Privacy Policy",
      terms: "Terms of Service",
      legal: "Legal Notice",
      shipping: "Shipping Info",
      manage: "Manage or cancel subscription",
      refund: "Refund Policy",
      access: "Access",
      wholesale: "Wholesale (Japan)",
    },
    es: {
      brand: "Ryuge Coffee",
      tagline: "Quietly crafted in Kamakura",
      company: "Empresa operadora: Kabushikigaisha Ryuge",
      description: "Tienda online de café tostado y bolsas de café/té",
      instagram: "Instagram",
      contact: "Contacto",
      email: "ryugecoffee@gmail.com",
      privacy: "Política de Privacidad",
      terms: "Términos de Servicio",
      legal: "Aviso Legal",
      shipping: "Información de Envío",
      manage: "Gestionar o cancelar suscripción",
      refund: "Política de Reembolsos",
      access: "Acceso",
      wholesale: "Venta al por mayor (Japón)",
    },
  };

  const t = TEXT[lang] || TEXT.ja;

  const instagramUrl = "https://www.instagram.com/ryuge_coffee/";
  const stripeUrl = "https://billing.stripe.com/p/login/3cI28r8GV4GcaFV1L85AQ01";

  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div className="footer-top">
          <div className="footer-brand-block">
            <p className="footer-brand">{t.brand}</p>
            <p className="footer-tagline">{t.tagline}</p>
            <p className="footer-company">{t.company}</p>
            <p className="footer-description">{t.description}</p>
          </div>

          <div className="footer-links-group">
            <a href={instagramUrl} target="_blank" rel="noreferrer">{t.instagram}</a>
            <a href={"mailto:" + t.email}>{t.contact}</a>
            <Link to="/access">{t.access}</Link>
            {/* 卸導線 */}
            <Link to="/wholesale-jp">{t.wholesale}</Link>
          </div>

          <div className="footer-links-group">
            <Link to="/privacy">{t.privacy}</Link>
            <Link to="/terms">{t.terms}</Link>
            <Link to="/legal">{t.legal}</Link>
            <Link to="/shipping">{t.shipping}</Link>
            <Link to="/refund">{t.refund}</Link>
            <a href={stripeUrl} target="_blank" rel="noreferrer">{t.manage}</a>
          </div>
        </div>

        <div className="footer-bottom">
          <p>© 2024 Ryuge Coffee / 株式会社龍華</p>
        </div>
      </div>
    </footer>
  );
}