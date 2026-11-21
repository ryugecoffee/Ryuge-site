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
      contact: "お問合せ・卸販売についてはこちら",
      email: "ryugecoffee@gmail.com",
      privacy: "プライバシーポリシー",
      terms: "利用規約",
      legal: "特定商取引法に基づく表記",
      shipping: "送料について",
      coffeeSubscription: "珈琲の定期便の管理（確認・変更・解約）",
      refund: "返品・返金ポリシー",
      access: "アクセス",
    },
    en: {
      brand: "Ryuge Coffee",
      tagline: "Quietly crafted in Kamakura",
      company: "Operating Company: Kabushikigaisha Ryuge",
      description: "Online store for roasted coffee beans and coffee/tea bags",
      instagram: "Instagram",
      contact: "Contact / Wholesale inquiries",
      email: "ryugecoffee@gmail.com",
      privacy: "Privacy Policy",
      terms: "Terms of Service",
      legal: "Legal Notice",
      shipping: "Shipping Info",
      coffeeSubscription: "Coffee subscription: manage, change or cancel",
      refund: "Refund Policy",
      access: "Access",
    },
    es: {
      brand: "Ryuge Coffee",
      tagline: "Quietly crafted in Kamakura",
      company: "Empresa operadora: Kabushikigaisha Ryuge",
      description: "Tienda online de café tostado y bolsas de café/té",
      instagram: "Instagram",
      contact: "Contacto / Consultas mayoristas",
      email: "ryugecoffee@gmail.com",
      privacy: "Política de Privacidad",
      terms: "Términos de Servicio",
      legal: "Aviso Legal",
      shipping: "Información de Envío",
      coffeeSubscription: "Suscripción de café: gestionar, cambiar o cancelar",
      refund: "Política de Reembolsos",
      access: "Acceso",
    },
  };

  const t = TEXT[lang] || TEXT.ja;

  const instagramUrl = "https://www.instagram.com/ryuge_coffee/";

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
          </div>

          <div className="footer-links-group">
            <Link to="/privacy">{t.privacy}</Link>
            <Link to="/terms">{t.terms}</Link>
            <Link to="/legal">{t.legal}</Link>
            <Link to="/shipping">{t.shipping}</Link>
            <Link to="/refund">{t.refund}</Link>
            {/* 珈琲の定期便's own page, also while new sign-ups are paused (subscribers still need it). The earlier plans'
                Stripe link is gone (CEO 2026-11-21): none of those subscriptions is running and they can no longer be
                bought (OLD_SUBSCRIPTION_PLANS_CLOSED). */}
            <Link to="/subscription/manage">{t.coffeeSubscription}</Link>
          </div>
        </div>

        <div className="footer-bottom">
          <p>© 2024 Ryuge Coffee / 株式会社龍華</p>
        </div>
      </div>
    </footer>
  );
}