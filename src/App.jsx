import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import SiteLayout from "./components/SiteLayout";
import LegalNotice from "./pages/LegalNotice";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Terms from "./pages/Terms";

export default function App() {
  const [lang, setLang] = useState("ja");

  return (
    <Routes>
      <Route path="/" element={<HomePage lang={lang} setLang={setLang} />} />
      <Route element={<SiteLayout lang={lang} setLang={setLang} />}>
        <Route path="/legal" element={<LegalNotice lang={lang} />} />
        <Route path="/privacy" element={<PrivacyPolicy lang={lang} />} />
        <Route path="/terms" element={<Terms lang={lang} />} />
      </Route>
    </Routes>
  );
}