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

// 卸ページ
import WholesaleJpPage from "./pages/WholesaleJpPage";
import WholesaleJpLoginPage from "./pages/WholesaleJpLoginPage";
import WholesaleJpDashboardPage from "./pages/WholesaleJpDashboardPage";
import WholesaleJpRegisterPage from "./pages/WholesaleJpRegisterPage";
import WholesaleJpAdminPage from "./pages/WholesaleJpAdminPage";
import WholesaleJpOrderPage from "./pages/WholesaleJpOrderPage";
import WholesaleJpOrderCompletePage from "./pages/WholesaleJpOrderCompletePage";

import { AuthProvider } from "./contexts/AuthContext";
import ScrollToTop from "./components/ScrollToTop";

export default function App() {
  const location = useLocation();

  const [lang, setLang] = useState(() => {
    return localStorage.getItem("site-lang") || "ja";
  });

  useEffect(() => {
    pageview(location.pathname + location.search);
  }, [location]);

  useEffect(() => {
    localStorage.setItem("site-lang", lang);
  }, [lang]);

  return (
    <AuthProvider>
      <>
        <ScrollToTop />

        <Routes>
          <Route path="/" element={<HomePage lang={lang} setLang={setLang} />} />

          <Route
            element={<SiteLayout lang={lang} setLang={setLang} />}
          >
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

          {/* 卸ページ */}
          <Route path="/wholesale-jp" element={<WholesaleJpPage />} />
          <Route path="/wholesale-jp/login" element={<WholesaleJpLoginPage />} />
          <Route path="/wholesale-jp/register" element={<WholesaleJpRegisterPage />} />
          <Route path="/wholesale-jp/dashboard" element={<WholesaleJpDashboardPage />} />
          <Route path="/wholesale-jp/admin" element={<WholesaleJpAdminPage />} />
          <Route path="/wholesale-jp/order" element={<WholesaleJpOrderPage />} />
          <Route path="/wholesale-jp/order/complete" element={<WholesaleJpOrderCompletePage />} />
        </Routes>

        <Analytics />
      </>
    </AuthProvider>
  );
}
