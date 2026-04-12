import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UI_TEXT } from "../uiText";


const UI = {
  ja: {
    brand: "RYUGE COFFEE",
    heroEyebrow: "鎌倉の静けさを、一杯の中へ",
    heroTitle: "Another Day,\nAnother Coffee",
    heroText:
      "静けさ、余白、質感。ただ、そこにある一杯",
    heroButton: "商品を見る",

    products: "商品",
    about: "龍華について",
    journal: "日記",
    contact: "お問い合わせ",

    privacyPolicy: "プライバシーポリシー",
    terms: "利用規約",
    legalNotice: "特定商取引法に基づく表記",

    storyLabel: "物語",
    storyTitle: "鎌倉・円応寺",
    storyText:
     "閻魔の前に立つときに生まれる静かな緊張と余白。その感覚を、一杯に",
    presenceLabel: "佇まい",
    presenceTitle: "静けさが、\n存在感になる",
    presenceText:
      "派手な演出ではなく、静かに視線を止める存在、\n商品だけでなくその周辺に漂う空気まで",
    productsLabel: "商品",
    productsText:
      "3つの商品は、それぞれ異なる輪郭を持ちながら、同じ静けさへとつながっています。",
    detail: "詳細を見る",
    close: "閉じる",

    instagram: "Instagram",
    email: "Email",
    contact: "お問合せ / 卸販売について",
shipping: "送料について",

    footerBrand: "Ryuge Coffee",
    footerTagline: "Quietly crafted in Kamakura",
    footer: "鎌倉にて丁寧に仕立てています",
    note: "静かな動き、静かな存在感",

    verticalTitle: "桃李成蹊",
    verticalText: "静かに積み重ねたものは、やがて人を導く。",

    modalButton: "購入する",
    modalButtonSub: "安全な決済",
        orioriLabel: "折々",
    orioriLead: "折々は、季節や日々の移ろいに合わせて、その時々の気配を届けるためのシリーズ。閻魔のように一つの軸を定めるのではなく、木函のように上位を収めるのでもなく、その間にある時間や感覚に寄り添いながら、その都度ふさわしいコーヒーやかたちを選び出していく。内容は固定されず、季節のコーヒー、定期便、ドリップバッグなどへと移ろいながら、日常の中で龍華珈琲に触れるための入口として、静かにひらかれていく。",
orioriDescription: "折々は、季節や日々の移ろいに合わせて、その時々の珈琲やかたちを届ける仕立て。",

    orioriSubscriptionTitle: "サブスクリプション",
    orioriSubscriptionText:
      "月ごとに移ろう焙煎や豆の表情を、折々の流れにあわせて届けます。",

    orioriDripbagTitle: "ドリップバッグ",
    orioriDripbagText:
      "日々の合間にも、龍華の輪郭を手軽に味わえる小さな一杯です。",

    orioriWheelTitle: "フレーバーホイール",
    orioriWheelText:
      "味わいを言葉にするための、静かな記録と発見のためのサイトです。",
  },

 en: {
  brand: "Ryuge Coffee",
  heroEyebrow: "Stillness of Kamakura, within a cup.",
  heroTitle: "Another Day, Another Coffee",
  heroText: "Stillness, space, texture. A cup that simply exists.",
  heroButton: "Products",

  products: "Products",
  about: "About",
  journal: "Journal",
  contact: "Contact",

  privacyPolicy: "Privacy Policy",
  terms: "Terms of Service",
  legalNotice: "Legal Notice",

  storyLabel: "Story",
  storyTitle: "Kamakura · Ennoji, temple",
  storyText:
    "A quiet tension and a pause that arise when standing before Enma. That sensation, within a cup.",

  presenceLabel: "Presence",
  presenceTitle: "Stillness becomes presence.",
  presenceText:
    "Not a striking performance, but a presence that quietly draws the gaze. Not only the product itself, but even the air surrounding it.",

  productsLabel: "Products",
  productsText:
    "Three products, each with a different contour, yet all connected to the same stillness.",

  detail: "View Detail",
  close: "Close",

  instagram: "Instagram",
  email: "Email",
contact: "Contact / Wholesale",
shipping: "Shipping Info",

  footerBrand: "Ryuge Coffee",
  footerTagline: "Quietly crafted in Kamakura",
  footer: "Crafted in Kamakura, Japan",

  note: "Quiet movement, quiet presence.",

  verticalTitle: "桃李成蹊",
  verticalText:
    "What is quietly cultivated will, in time, guide others.",

  modalButton: "Purchase",
  modalButtonSub: "Secure Checkout",

  orioriLabel: "Oriori",
  orioriDescription:
    "A form shaped to deliver the coffee and expressions suited to each season and each passing day.",

  orioriLead:
    "Oriori is a series created to convey the atmosphere of each moment. Not fixed to a single axis, nor confined to the highest tier, it moves between them, choosing the form and coffee that best fits each time. Its contents shift with the seasons—coffee, subscriptions, drip bags—quietly opening a path into Ryuge Coffee within everyday life.",

  orioriSubscriptionTitle: "Subscription",
  orioriSubscriptionText:
    "A seasonal delivery following the changing expressions of coffee.",

  orioriDripbagTitle: "Drip Bag",
  orioriDripbagText:
    "A simple way to experience the contour of Ryuge Coffee in daily life.",

  orioriWheelTitle: "Flavor Wheel",
  orioriWheelText:
    "A quiet space to record and discover flavor through words.",
},

es: {
  brand: "Ryuge Coffee",
  heroEyebrow: "La quietud de Kamakura, dentro de una taza.",
  heroTitle: "Another Day, Another Coffee",
  heroText: "Quietud, espacio, textura. Una taza que simplemente existe.",
  heroButton: "Productos",

  products: "Productos",
  about: "Sobre Ryuge",
  journal: "Diario",
  contact: "Contacto",

  privacyPolicy: "Política de Privacidad",
  terms: "Términos de Servicio",
  legalNotice: "Aviso Legal",

  storyLabel: "Historia",
  storyTitle: "Kamakura · Ennoji, templo",
  storyText:
    "Una tensión silenciosa y una pausa que nacen al estar frente a Enma. Esa sensación, dentro de una taza.",

  presenceLabel: "Presencia",
  presenceTitle: "La quietud se convierte en presencia.",
  presenceText:
    "No una actuación llamativa, sino una presencia que atrae la mirada en silencio. No solo el producto, sino incluso el aire que lo rodea.",

  productsLabel: "Productos",
  productsText:
    "Tres productos con contornos distintos, unidos por una misma quietud.",

  detail: "Ver detalle",
  close: "Cerrar",

  instagram: "Instagram",
  email: "Email",
  contact: "Contacto / Mayorista",
shipping: "Información de Envío",

  footerBrand: "Ryuge Coffee",
  footerTagline: "Quietly crafted in Kamakura",
  footer: "Hecho en Kamakura, Japón",

  note: "Movimiento silencioso, presencia silenciosa.",

  verticalTitle: "桃李成蹊",
  verticalText:
    "Lo que se cultiva en silencio, con el tiempo, guía a los demás.",

  modalButton: "Comprar",
  modalButtonSub: "Pago seguro",

  orioriLabel: "Oriori",
  orioriDescription:
    "Una forma concebida para ofrecer el café y las expresiones propias de cada estación y cada momento.",

  orioriLead:
    "Oriori es una serie creada para transmitir la atmósfera de cada instante. No fija un eje único ni reúne solo lo más alto, sino que se mueve entre ambos, eligiendo el café y la forma más adecuados en cada momento. Su contenido cambia con las estaciones—cafés, suscripciones, drip bags—abriendo en silencio una puerta hacia Ryuge Coffee en la vida cotidiana.",

  orioriSubscriptionTitle: "Suscripción",
  orioriSubscriptionText:
    "Una entrega estacional que sigue la evolución del café.",

  orioriDripbagTitle: "Drip Bag",
  orioriDripbagText:
    "Una forma sencilla de experimentar Ryuge Coffee en el día a día.",

  orioriWheelTitle: "Rueda de Sabor",
  orioriWheelText:
    "Un espacio tranquilo para registrar y descubrir sabores.",
},
      orioriLabel: "Oriori",
    orioriLead: "Tres formas silenciosas que se abren con la estación.",

    orioriSubscriptionTitle: "Suscripción",
    orioriSubscriptionText:
      "Una entrega estacional que acompaña los cambios del café y del tueste mes a mes.",

    orioriDripbagTitle: "Drip Bag",
    orioriDripbagText:
      "Una forma sencilla de disfrutar el contorno de Ryuge Coffee en la vida diaria.",

    orioriWheelTitle: "Rueda de Sabor",
    orioriWheelText:
      "Un sitio tranquilo para registrar, descubrir y poner el sabor en palabras.",
      orioriDescription:
  "Oriori es una expresión estacional, ofreciendo café y formas que cambian con el tiempo y el ambiente.",
};

const COMMON_SQUARE_URL = "https://square.link/u/cLYnP3Mu";

const PRODUCTS = {
  ja: [
    {
      id: "enma",
name: "閻魔",
subtitle: "Enma",
      description:
        "龍華珈琲の象徴的な存在。印象的でありながら、空間に静かに馴染む包装と味わい。",
      detail:
        "閻魔は、龍華珈琲を象徴する存在。浅煎りも深煎りも、その時に最もふさわしい焙煎で仕上げる。香り、余韻、質感のバランスだけを頼りに、選び抜かれた味わいを届ける。閻魔の御前の一杯を、ご自宅で。",
      image: "/images/enma.jpg",
      className: "product-main",
      squareUrl: COMMON_SQUARE_URL,
    },
    {
      id: "woodbox",
name: "木函",
subtitle: "Wooden Edition",
      description:
        "木という素材の温度を活かした、より深く印象に残る最高位な珈琲。",
      detail:
        "木函は、品質の高い選び抜かれたものだけを収める器。触れた瞬間から違いが立ち上がり、開ける所作とともに静けさが整う。寺から届く、最上位の味わい。",
      image: "/images/woodbox.jpg",
      className: "product-side-top",
      squareUrl: COMMON_SQUARE_URL,
    },
  ],
  en: [
    {
      id: "enma",
name: "閻魔",
subtitle: "Enma",
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
name: "木函",
subtitle: "Wooden Edition",
      description:
        "A deeper expression shaped through the warmth and tactility of wood.",
      detail:
        "Wood Box is made to refine the act of giving. The opening gesture, surface feel, and breathing room of the design are part of the experience.",
      image: "/images/woodbox.jpg",
      className: "product-side-top",
      squareUrl: COMMON_SQUARE_URL,
    },
  ],
  es: [
    {
      id: "enma",
name: "閻魔",
subtitle: "Enma",
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
name: "木函",
subtitle: "Wooden Edition",
      description:
        "Una expresión más profunda creada con la calidez y la textura de la madera.",
      detail:
        "Wood Box busca ordenar con calma el acto de regalar. El gesto de abrir, la textura y el espacio visual forman parte de la experiencia.",
      image: "/images/woodbox.jpg",
      className: "product-side-top",
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

export default function HomePage({ lang, setLang }) {
  const [selectedProduct, setSelectedProduct] = useState(null);
    const navigate = useNavigate();

  const appRef = useRef(null);
  const productsRef = useRef(null);

  useReveal();
  useScrollMotion(appRef);

  useEffect(() => {
    const onScroll = () => {
      const header = document.querySelector(".site-header");
      if (!header) return;

      if (window.scrollY > 40) {
        header.classList.add("scrolled");
      } else {
        header.classList.remove("scrolled");
      }
    };

    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    let lastScroll = 0;

    const onScroll = () => {
      const header = document.querySelector(".site-header");
      if (!header) return;

      const current = window.scrollY;

      if (current > lastScroll && current > 80) {
        header.style.transform = "translateY(-100%)";
      } else {
        header.style.transform = "translateY(0)";
      }

      lastScroll = current;
    };

    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const t = UI[lang];
  const products = useMemo(() => PRODUCTS[lang], [lang]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

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

<header className="site-header home-header">
  <Link to="/" className="site-logo">
    {t.brand}
  </Link>

<nav className="site-nav home-nav">
  <Link to="/products">{t.products}</Link>
  <a href="#journal">{t.journal}</a>
</nav>

  <div className="lang-switch home-lang-switch">
    <button
      className={lang === "ja" ? "active" : ""}
      onClick={() => setLang("ja")}
      type="button"
    >
      JP 
    </button>
    <button
      className={lang === "en" ? "active" : ""}
      onClick={() => setLang("en")}
      type="button"
    >
      EN
    </button>
    <button
      className={lang === "es" ? "active" : ""}
      onClick={() => setLang("es")}
      type="button"
    >
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
            <h1
              className="hero-title reveal delay-2"
              style={{ whiteSpace: "pre-line" }}
            >
              {t.heroTitle}
            </h1>
            <p className="hero-text reveal delay-3">{t.heroText}</p>
          </div>
        </section>

        <section className="section band">
          <div className="container band-inner reveal">
            <p>{t.note}</p>
          </div>
        </section>

        <section className="section story" id="about">
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

<div style={{ height: "28px" }} />
          </div>
        </section>

        <section className="section feature-layout">
          <div className="container feature-grid">
            <div className="feature-main reveal">
              <div className="image-shell hero-shell image-parallax">
                <img
                  src="/images/atmosphere-1.jpg"
                  alt="Ryuge Coffee atmosphere"
                />
              </div>
            </div>

            <div className="feature-side">
              <div className="feature-copy reveal delay-1">
<p className="section-label">{t.presenceLabel}</p>
<h2 style={{ whiteSpace: "pre-line" }}>{t.presenceTitle}</h2>
<p style={{ whiteSpace: "pre-line" }}>{t.presenceText}</p>
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
              <img
                src="/images/atmosphere-2.jpg"
                alt="Ryuge Coffee atmosphere 2"
              />
            </div>
          </div>
        </section>

<section className="section products" id="products" ref={productsRef}>
  <div className="container">
    <p className="section-label products-title">{t.productsLabel}</p>

    <div className="products-layout products-layout-two">
      {products.map((product, index) => (
        <article
          key={product.id}
          className={`product-card ${product.className} reveal delay-${
            (index % 3) + 1
          }`}
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

      <article
        className="product-card product-side-bottom reveal delay-3"
        onClick={() =>
setSelectedProduct({
  id: "oriori",
  name: "折々",
  subtitle: t.orioriLabel,
  description: t.orioriDescription,
  detail: t.orioriLead,
            image: "/images/oriori-1.jpg",
            squareUrl: null,
          })
        }
      >
        <div className="product-image-wrap">
          <div className="product-image image-parallax">
            <img src="/images/oriori-1.jpg" alt={t.orioriLabel} />
          </div>
        </div>

<div className="product-copy">
  <p className="product-subtitle">Oriori</p>
  <h3>折々</h3>

  <p>
    {t?.orioriDescription ||
      "折々は、季節や日々の移ろいに合わせて、その時々の珈琲やかたちを届ける仕立て。"}
  </p>

  <span className="product-link">{t.detail}</span>
</div>
      </article>
    </div>
  </div>
</section>
      </main>

      <section className="section vertical-visual">
        <div className="container vertical-inner">
          <div className="vertical-image">
            <img src="/images/vertical-test.jpg" alt="Coffee moment" />
          </div>

<div className="vertical-space">
  <div className="vertical-copy">
  <h2 className="vertical-title" aria-label={t.verticalTitle}>
  {t.verticalTitle.split("").map((char, index) => (
    <span
      key={`${char}-${index}`}
      className={`vertical-char vertical-char-${index + 1}`}
    >
      {char}
    </span>
  ))}
</h2>
    <p className="vertical-text" style={{ whiteSpace: "pre-line" }}>
      {t.verticalText}
    </p>
  </div>
</div>
        </div>
      </section>

<footer className="site-footer">
  <div className="container footer-inner">
    <div className="footer-top">
      <div className="footer-brand-block">
        <p className="footer-brand">{t.footerBrand}</p>
        <p className="footer-tagline">{t.footerTagline}</p>
      </div>

      <div className="footer-links-group">
        <a
          href="https://www.instagram.com/ryuge_coffee/"
          target="_blank"
          rel="noreferrer"
        >
          {t.instagram}
        </a>
        <a href="mailto:ryugecoffee@gmail.com">{t.email}</a>
      </div>

      <div className="footer-links-group">
        <Link to="/privacy">{t.privacyPolicy}</Link>
        <Link to="/terms">{t.terms}</Link>
        <Link to="/legal">{t.legalNotice}</Link>
      </div>
    </div>

    <div className="footer-bottom">
      <p>© 2026 Ryuge Coffee</p>
    </div>
  </div>
</footer>

      {selectedProduct && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedProduct(null)}
          role="presentation"
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={selectedProduct.name}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setSelectedProduct(null)}
              aria-label={t.close}
              type="button"
            >
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

<span
  className="text-link"
  onClick={() => {
    setSelectedProduct(null);
    navigate("/products");
  }}
  role="button"
  tabIndex={0}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      setSelectedProduct(null);
      navigate("/products");
    }
  }}
>
  {t.detail}
</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}