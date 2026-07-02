import { useEffect, useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import HomePage from "./pages/HomePage";
import SiteLayout from "./components/SiteLayout";
import LegalNotice from "./pages/LegalNotice";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Terms from "./pages/Terms";
import ProductsPage from "./pages/ProductsPage";
import CheckoutPage from "./pages/CheckoutPage";
import CheckoutCompletePage from "./pages/CheckoutCompletePage";
import ShippingPage from "./pages/ShippingPage";
import RefundPolicy from "./pages/RefundPolicy";
import { Analytics } from "@vercel/analytics/react";
import AccessSection from "./pages/AccessSection";
import { pageview } from "./lib/analytics";
import { updatePageMeta, injectProductJsonLd } from "./lib/seo";

import ScrollToTop from "./components/ScrollToTop";

const BANNER_TEXT = {
  ja: "全国どこでも：1個注文 送料¥200 / 2個以上 送料無料 / 定期便 送料無料",
  en: "Japan-wide shipping: ¥200 for 1 item / Free for 2+ items / Free for subscriptions",
  es: "Envío en todo Japón: ¥200 por 1 artículo / Gratis con 2 o más / Gratis con suscripción",
};

const BANNER_KEY = "shipping-banner-closed-at";
const BANNER_TTL = 24 * 60 * 60 * 1000;

// Render の無料プランはアイドル時にスリープするため、
// 訪問直後にウォームアップ ping を送り、決済時のコールドスタート待ちを防ぐ
const BACKEND_URL = "https://ryuge-site.onrender.com";
let lastWarmupAt = 0;
function warmupBackend() {
  const now = Date.now();
  if (now - lastWarmupAt < 5 * 60 * 1000) return; // 5分以内の再送はスキップ
  lastWarmupAt = now;
  fetch(BACKEND_URL + "/", { method: "GET" }).catch(() => {});
}

function ShippingBanner({ lang }) {
  const [visible, setVisible] = useState(() => {
    const ts = localStorage.getItem(BANNER_KEY);
    if (!ts) return true;
    return Date.now() - Number(ts) > BANNER_TTL;
  });
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setFading(true), 5000);
    return () => clearTimeout(t);
  }, [visible]);

  useEffect(() => {
    if (!fading) return;
    const t = setTimeout(() => {
      setVisible(false);
      localStorage.setItem(BANNER_KEY, String(Date.now()));
    }, 600);
    return () => clearTimeout(t);
  }, [fading]);

  const close = () => setFading(true);

  if (!visible) return null;

  return (
    <div className={`shipping-banner${fading ? " shipping-banner--fading" : ""}`}>
      <span className="shipping-banner-text">{BANNER_TEXT[lang] || BANNER_TEXT.ja}</span>
      <button className="shipping-banner-close" onClick={close} aria-label="close">×</button>
    </div>
  );
}

export default function App() {
  const location = useLocation();

  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem("site-lang");
    if (saved) return saved;
    // 初回訪問時はブラウザ言語で自動判定(お土産で豆を受け取った海外の方向け)
    const nav = (navigator.language || "").toLowerCase();
    if (nav.startsWith("es")) return "es";
    if (nav.startsWith("en")) return "en";
    return "ja";
  });

  useEffect(() => {
    pageview(location.pathname + location.search);
    updatePageMeta(location.pathname);
    if (location.pathname === "/products") injectProductJsonLd();
  }, [location]);

  // サイト訪問時 + チェックアウト突入時にバックエンドを起こしておく
  useEffect(() => {
    warmupBackend();
  }, []);
  useEffect(() => {
    if (location.pathname.startsWith("/checkout") || location.pathname === "/products") {
      warmupBackend();
    }
  }, [location.pathname]);

  useEffect(() => {
    localStorage.setItem("site-lang", lang);
  }, [lang]);

  return (
    <>
      <ScrollToTop />
        <ShippingBanner lang={lang} />

        <Routes>
          <Route path="/" element={<HomePage lang={lang} setLang={setLang} />} />

          <Route element={<SiteLayout lang={lang} setLang={setLang} />}>
            <Route path="/products" element={<ProductsPage lang={lang} />} />
            <Route path="/privacy" element={<PrivacyPolicy lang={lang} />} />
            <Route path="/terms" element={<Terms lang={lang} />} />
            <Route path="/shipping" element={<ShippingPage lang={lang} />} />
            <Route path="/legal" element={<LegalNotice lang={lang} />} />
            <Route path="/refund" element={<RefundPolicy lang={lang} />} />
            <Route path="/access" element={<AccessSection lang={lang} />} />
          </Route>

          <Route path="/checkout" element={<CheckoutPage lang={lang} />} />
          <Route path="/checkout/complete" element={<CheckoutCompletePage />} />
        </Routes>

        <Analytics />
    </>
  );
}
