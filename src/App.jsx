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

import WholesaleJpPage from "./pages/WholesaleJpPage";

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

          <Route path="/wholesale-jp" element={<WholesaleJpPage />} />
        </Routes>

        <Analytics />
      </>
    </AuthProvider>
  );
}
