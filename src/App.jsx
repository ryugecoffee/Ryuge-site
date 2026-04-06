import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const UI = {
  ja: {
    brand: "RYUGE COFFEE",
    heroEyebrow: "鎌倉の静けさを、一杯の中へ。",
    heroTitle: "Another Day,\nAnother Coffee",
    heroText:
      "静けさ、余白、質感。龍華珈琲は、強く主張するのではなく、深く残る一杯を届けます。",
    heroButton: "商品を見る",
    storyLabel: "物語",
    storyTitle: "静かな流れを、\n味にする。",
    storyText:
      "光、風、器、温度、会話の間。Ryuge Coffee は、味だけではなく、その前後にある空気まで設計したいと考えています。",
    presenceLabel: "佇まい",
    presenceTitle: "静けさが、\n存在感になる。",
    presenceText:
      "派手な演出ではなく、静かに視線を止める存在感。商品だけではなく、その周囲に漂う空気まで体験として届けることを目指しています。",
    productsLabel: "商品",
    productsText:
      "3つの商品は、それぞれ異なる輪郭を持ちながら、同じ静けさへとつながっています。",
    detail: "詳細を見る",
    close: "閉じる",
    contactLabel: "お問い合わせ",
    instagram: "Instagram",
    email: "Email",
    footer: "鎌倉にて丁寧に仕立てています",
    note: "静かな動き、静かな存在感。",
    modalButton: "購入する",
    modalButtonSub: "安全な決済",
  },
  en: {
    brand: "Ryuge Coffee",
    heroEyebrow: "A quiet cup shaped in Kamakura.",
    heroTitle: "Another Day, Another Coffee",
    heroText:
      "Stillness, space, and texture. Ryuge Coffee offers a cup that does not insist, but lingers deeply.",
    heroButton: "Products",
    storyLabel: "Story",
    storyTitle: "Turning stillness into flavor.",
    storyText:
      "Light, wind, vessels, temperature, pauses in conversation. Ryuge Coffee is designed not only around taste, but around the atmosphere surrounding it.",
    presenceLabel: "Presence",
    presenceTitle: "Silence as presence.",
    presenceText:
      "Not loud performance, but a quietly arresting presence. Ryuge Coffee aims to offer not only the product itself, but also the air around it as part of the experience.",
    productsLabel: "Products",
    productsText:
      "Three products with different contours, all connected to the same quiet center.",
    detail: "View Detail",
    close: "Close",
    contactLabel: "Contact",
    instagram: "Instagram",
    email: "Email",
    footer: "Crafted in Kamakura, Japan",
    note: "Slow movement, quiet presence.",
    modalButton: "Purchase",
    modalButtonSub: "Secure Checkout",
  },
  es: {
    brand: "Ryuge Coffee",
    heroEyebrow: "Una taza tranquila nacida en Kamakura.",
    heroTitle: "Another Day, Another Coffee",
    heroText:
      "Quietud, espacio y textura. Ryuge Coffee ofrece una taza que no insiste, pero permanece profundamente.",
    heroButton: "Productos",
    storyLabel: "Historia",
    storyTitle: "Convertir la quietud en sabor.",
    storyText:
      "Luz, viento, recipientes, temperatura, pausas en la conversación. Ryuge Coffee no diseña solo el sabor, sino también la atmósfera que lo rodea.",
    presenceLabel: "Presencia",
    presenceTitle: "Silence as presence.",
    presenceText:
      "No una actuación ruidosa, sino una presencia silenciosamente intensa. Ryuge Coffee busca ofrecer no solo el producto, sino también el aire que lo rodea.",
    productsLabel: "Productos",
    productsText:
      "Tres productos con contornos distintos, unidos por un mismo centro silencioso.",
    detail: "Ver detalle",
    close: "Cerrar",
    contactLabel: "Contacto",
    instagram: "Instagram",
    email: "Email",
    footer: "Crafted in Kamakura, Japan",
    note: "Movimiento lento, presencia silenciosa.",
    modalButton: "Comprar",
    modalButtonSub: "Pago seguro",
  },
};

const COMMON_SQUARE_URL = "https://square.link/u/cLYnP3Mu";

const PRODUCTS = {
  ja: [
    {
      id: "enma",
      name: "Enma",
      subtitle: "Signature Bag",
      description:
        "龍華珈琲の象徴的な存在。印象的でありながら、空間に静かに馴染むパッケージと味わい。",
      detail:
        "Enma は、Ryuge Coffee の核となるシグネチャー。存在感のある造形と、静かに残る後味のバランスを意識して設計されたプロダクトです。",
      image: "/images/enma.jpg",
      className: "product-main",
      squareUrl: COMMON_SQUARE_URL,
    },
    {
      id: "woodbox",
      name: "Wood Box",
      subtitle: "Quiet Gift Edition",
      description:
        "木という素材の温度を活かした、より深く印象に残るボックス仕様のコーヒー。",
      detail:
        "Wood Box は、贈る時間そのものを静かに整えるための一箱です。開ける所作、触れたときの質感、余白まで含めて設計しています。",
      image: "/images/woodbox.jpg",
      className: "product-side-top",
      squareUrl: COMMON_SQUARE_URL,
    },
    {
      id: "seasonal",
      name: "Seasonal",
      subtitle: "Limited Selection",
      description:
        "季節の流れとともに変化する限定ロット。短い時間の美しさをそのまま表現。",
      detail:
        "Seasonal は、その時季にしか出せない輪郭を大切にした限定ラインです。味だけでなく、季節の空気や気分まで持ち帰れる構成を目指しています。",
      image: "/images/seasonal.jpg",
      className: "product-side-bottom",
      squareUrl: COMMON_SQUARE_URL,
    },
  ],
  en: [
    {
      id: "enma",
      name: "Enma",
      subtitle: "Signature Bag",
      description:
        "A signature presence of Ryuge Coffee. Distinct, yet calm enough to belong quietly in a space.",
      detail:
        "Enma is the core signature of Ryuge Coffee. It is shaped around a balance between a striking silhouette and a finish that lingers quietly.",
      image: "/images/enma.jpg",
      className: "product-main",
      squareUrl: COMMON_SQUARE_URL,
    },
    {
      id: "woodbox",
      name: "Wood Box",
      subtitle: "Quiet Gift Edition",
      description:
        "A deeper expression shaped through the warmth and tactility of wood.",
      detail:
        "Wood Box is made to refine the act of giving. The opening gesture, surface feel, and breathing room of the design are part of the experience.",
      image: "/images/woodbox.jpg",
      className: "product-side-top",
      squareUrl: COMMON_SQUARE_URL,
    },
    {
      id: "seasonal",
      name: "Seasonal",
      subtitle: "Limited Selection",
      description:
        "A limited offering that shifts with the season, preserving the beauty of a short moment.",
      detail:
        "Seasonal is a limited line built around contours that exist only at a certain time. It carries not only flavor, but also mood and air.",
      image: "/images/seasonal.jpg",
      className: "product-side-bottom",
      squareUrl: COMMON_SQUARE_URL,
    },
  ],
  es: [
    {
      id: "enma",
      name: "Enma",
      subtitle: "Bolsa Signature",
      description:
        "La presencia emblemática de Ryuge Coffee. Distinta, pero silenciosa dentro del espacio.",
      detail:
        "Enma es la firma central de Ryuge Coffee. Está diseñada para equilibrar una silueta fuerte con un final que permanece en silencio.",
      image: "/images/enma.jpg",
      className: "product-main",
      squareUrl: COMMON_SQUARE_URL,
    },
    {
      id: "woodbox",
      name: "Wood Box",
      subtitle: "Edición de Regalo",
      description:
        "Una expresión más profunda creada con la calidez y la textura de la madera.",
      detail:
        "Wood Box busca ordenar con calma el acto de regalar. El gesto de abrir, la textura y el espacio visual forman parte de la experiencia.",
      image: "/images/woodbox.jpg",
      className: "product-side-top",
      squareUrl: COMMON_SQUARE_URL,
    },
    {
      id: "seasonal",
      name: "Seasonal",
      subtitle: "Selección Limitada",
      description:
        "Una selección limitada que cambia con la estación y conserva la belleza de un momento breve.",
      detail:
        "Seasonal es una línea limitada creada en torno a contornos que solo existen en cierto momento. Lleva sabor, atmósfera y ritmo.",
      image: "/images/seasonal.jpg",
      className: "product-side-bottom",
      squareUrl: COMMON_SQUARE_URL,
    },
  ],
};

function useReveal() {
  useEffect(() => {
    const items = document.querySelectorAll(".reveal");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("is-visible");
        });
      },
      {
        threshold: 0.14,
        rootMargin: "0px 0px -8% 0px",
      }
    );

    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);
}

function useScrollMotion(rootRef) {
  useEffect(() => {
    let ticking = false;

    const update = () => {
      const y = window.scrollY || 0;
      if (rootRef.current) {
        rootRef.current.style.setProperty("--scrollY", `${y}`);
      }
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [rootRef]);
}

export default function App() {
  const [lang, setLang] = useState("ja");
  const [selectedProduct, setSelectedProduct] = useState(null);

  const appRef = useRef(null);
  const productsRef = useRef(null);

  useReveal();
  useScrollMotion(appRef);

  const t = UI[lang];
  const products = useMemo(() => PRODUCTS[lang], [lang]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") setSelectedProduct(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    document.body.style.overflow = selectedProduct ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedProduct]);

  const scrollToProducts = () => {
    productsRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const handleSquareCheckout = (url) => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="app" ref={appRef}>
      <div className="ambient ambient-1" />
      <div className="ambient ambient-2" />
      <div className="ambient ambient-3" />

      <div className="bamboo bamboo-left" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <div className="bamboo bamboo-right" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <header className="site-header">
        <div className="brand">{t.brand}</div>

        <div className="lang-switch">
          <button className={lang === "ja" ? "active" : ""} onClick={() => setLang("ja")}>
            JA
          </button>
          <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>
            EN
          </button>
          <button className={lang === "es" ? "active" : ""} onClick={() => setLang("es")}>
            ES
          </button>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-media-layer">
            <div className="hero-media">
              <img src="/images/hero.jpg" alt="Ryuge Coffee hero" />
            </div>
            <div className="hero-overlay" />
          </div>

          <div className="container hero-inner">
            <p className="hero-eyebrow reveal delay-1">{t.heroEyebrow}</p>
            <h1 className="hero-title reveal delay-2" style={{ whiteSpace: "pre-line" }}>
              {t.heroTitle}
            </h1>
            <p className="hero-text reveal delay-3">{t.heroText}</p>
            <div className="hero-actions reveal delay-4">
              <button className="hero-button" onClick={scrollToProducts}>
                {t.heroButton}
              </button>
            </div>
          </div>
        </section>

        <section className="section band">
          <div className="container band-inner reveal">
            <p>{t.note}</p>
          </div>
        </section>

        <section className="section story">
          <div className="container">
            <div className="section-top reveal">
              <p className="section-label">{t.storyLabel}</p>
            </div>

            <div className="story-grid">
              <div className="story-title reveal delay-1">
                <h2 style={{ whiteSpace: "pre-line" }}>{t.storyTitle}</h2>
              </div>
              <div className="story-body reveal delay-2">
                <p>{t.storyText}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section feature-layout">
          <div className="container feature-grid">
            <div className="feature-main reveal">
              <div className="image-shell hero-shell image-parallax">
                <img src="/images/atmosphere-1.jpg" alt="Ryuge Coffee atmosphere" />
              </div>
            </div>

            <div className="feature-side">
              <div className="feature-copy reveal delay-1">
                <p className="section-label">{t.presenceLabel}</p>
                <h2 style={{ whiteSpace: "pre-line" }}>{t.presenceTitle}</h2>
                <p>{t.presenceText}</p>
              </div>

              <div className="feature-sub reveal delay-2">
                <div className="image-shell sub-shell image-parallax">
                  <img src="/images/detail-1.jpg" alt="Ryuge Coffee detail" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section quiet-visual">
          <div className="container quiet-visual-inner reveal">
            <div className="image-shell quiet-shell image-parallax">
              <img src="/images/atmosphere-2.jpg" alt="Ryuge Coffee atmosphere 2" />
            </div>
          </div>
        </section>

        <section className="section band">
          <div className="container band-inner reveal">
            <p>{t.productsText}</p>
          </div>
        </section>

        <section className="section products" ref={productsRef}>
          <div className="container">
            <div className="section-top reveal">
              <p className="section-label">{t.productsLabel}</p>
            </div>

            <div className="products-layout">
              {products.map((product, index) => (
                <article
                  key={product.id}
                  className={`product-card ${product.className} reveal delay-${(index % 3) + 1}`}
                  onClick={() => setSelectedProduct(product)}
                >
                  <div className="product-image-wrap">
                    <div className="product-image image-parallax">
                      <img src={product.image} alt={product.name} />
                    </div>
                  </div>

                  <div className="product-copy">
                    <p className="product-subtitle">{product.subtitle}</p>
                    <h3>{product.name}</h3>
                    <p>{product.description}</p>
                    <span className="product-link">{t.detail}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section contact">
          <div className="container contact-grid">
            <div className="reveal">
              <p className="section-label">{t.contactLabel}</p>
              <h2 className="contact-title">Ryuge Coffee</h2>
            </div>

            <div className="contact-links reveal delay-1">
              <a href="https://www.instagram.com/ryuge_coffee/" target="_blank" rel="noreferrer">
                <span>{t.instagram}</span>
                <strong>@ryuge_coffee</strong>
              </a>

              <a href="mailto:ryugecoffee@gmail.com">
                <span>{t.email}</span>
                <strong>ryugecoffee@gmail.com</strong>
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container">
          <p>{t.footer}</p>
        </div>
      </footer>

      {selectedProduct && (
        <div className="modal-backdrop" onClick={() => setSelectedProduct(null)} role="presentation">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={selectedProduct.name}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close" onClick={() => setSelectedProduct(null)} aria-label={t.close}>
              ×
            </button>

            <div className="modal-image">
              <img src={selectedProduct.image} alt={selectedProduct.name} />
            </div>

            <div className="modal-copy">
              <div className="modal-copy-inner">
                <p className="product-subtitle">{selectedProduct.subtitle}</p>
                <h3>{selectedProduct.name}</h3>
                <p>{selectedProduct.detail}</p>

                <button
                  className="modal-square-button"
                  onClick={() => handleSquareCheckout(selectedProduct.squareUrl)}
                  type="button"
                >
                  <span className="modal-square-button-sub">{t.modalButtonSub}</span>
                  <span className="modal-square-button-main">{t.modalButton}</span>
                  <span className="modal-square-button-arrow">↗</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}