import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import SiteLayout from "./components/SiteLayout";
import LegalNotice from "./pages/LegalNotice";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Terms from "./pages/Terms";
import ProductsPage from "./pages/ProductsPage";

export default function App() {
  const [lang, setLang] = useState(() => {
    return localStorage.getItem("site-lang") || "ja";
  });

  useEffect(() => {
    localStorage.setItem("site-lang", lang);
  }, [lang]);

  return (
    <Routes>
      <Route
        path="/"
        element={<HomePage lang={lang} setLang={setLang} />}
      />

      <Route element={<SiteLayout lang={lang} setLang={setLang} />}>
        <Route
          path="/products"
          element={<ProductsPage lang={lang} setLang={setLang} />}
        />
        <Route path="/privacy" element={<PrivacyPolicy lang={lang} />} />
        <Route path="/terms" element={<Terms lang={lang} />} />
        <Route path="/legal" element={<LegalNotice lang={lang} />} />
      </Route>
    </Routes>
  );
}