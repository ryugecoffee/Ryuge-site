import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import SiteLayout from "./components/SiteLayout";
import LegalNotice from "./pages/LegalNotice";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Terms from "./pages/Terms";
import ProductsPage from "./pages/ProductsPage";

export default function App() {
  const [lang, setLang] = useState("ja");

  return (
    <Routes>
      <Route
        path="/"
        element={<HomePage lang={lang} setLang={setLang} />}
      />

      <Route element={<SiteLayout lang={lang} setLang={setLang} />}>
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/legal" element={<LegalNotice />} />
      </Route>
    </Routes>
  );
}