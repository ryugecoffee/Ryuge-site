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

// 👇 追加（GA）
import { pageview, trackAddToCart } from "./lib/analytics";

export default function App() {
  const location = useLocation(); // 👈 追加

  const [lang, setLang] = useState(() => {
    return localStorage.getItem("site-lang") || "ja";
  });

  const [cartItems, setCartItems] = useState(() => {
    const savedCart = localStorage.getItem("cart-items");
    return savedCart ? JSON.parse(savedCart) : [];
  });

  // 👇 ページビュー計測
  useEffect(() => {
    pageview(location.pathname + location.search);
  }, [location]);

  const addToCart = (product, quantity = 1) => {
    setCartItems((prev) => {
      const existing = prev.find((item) => item.id === product.id);

      if (existing) {
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }

      return [
        ...prev,
        {
          id: product.id,
          title: product.title || product.name || "Product",
          price: product.priceNumber ?? product.price ?? 0,
          image: product.image || "",
          quantity,
        },
      ];
    });

    // 👇 追加（カート計測）
    trackAddToCart(product, quantity);
  };

  const removeFromCart = (id) => {
    setCartItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateCartQuantity = (id, nextQuantity) => {
    if (nextQuantity <= 0) {
      setCartItems((prev) => prev.filter((item) => item.id !== id));
      return;
    }

    setCartItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, quantity: nextQuantity } : item
      )
    );
  };

  const clearCart = () => {
    setCartItems([]);
    localStorage.removeItem("cart-items");
  };

  useEffect(() => {
    localStorage.setItem("site-lang", lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem("cart-items", JSON.stringify(cartItems));
  }, [cartItems]);

  return (
    <>
      <Routes>
        <Route
          path="/"
          element={<HomePage lang={lang} setLang={setLang} />}
        />

        <Route
          element={
            <SiteLayout
              lang={lang}
              setLang={setLang}
              cartItems={cartItems}
              removeFromCart={removeFromCart}
              updateCartQuantity={updateCartQuantity}
              addToCart={addToCart}
            />
          }
        >
          <Route
            path="/products"
            element={
              <ProductsPage
                lang={lang}
                cartItems={cartItems}
                setCartItems={setCartItems}
              />
            }
          />

          <Route path="/privacy" element={<PrivacyPolicy lang={lang} />} />
          <Route path="/terms" element={<Terms lang={lang} />} />
          <Route path="/shipping" element={<ShippingPage lang={lang} />} />
          <Route path="/legal" element={<LegalNotice lang={lang} />} />
          <Route path="/refund" element={<RefundPolicy lang={lang} />} />
          <Route path="/access" element={<AccessSection lang={lang} />} />
        </Route>

        <Route
          path="/checkout"
          element={
            <CheckoutPage
              cartItems={cartItems}
              setCartItems={setCartItems}
              clearCart={clearCart}
              lang={lang}
            />
          }
        />

        <Route
          path="/checkout/complete"
          element={<CheckoutCompletePage />}
        />
      </Routes>

      <Analytics />
    </>
  );
}