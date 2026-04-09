import { useEffect, useRef, useState } from "react";
import SiteFooter from "../components/SiteFooter";
import { UI_TEXT } from "../uiText";

const PAGE_TEXT = {
  ja: {
    heroEyebrow: "Products",
    heroTitle: "静けさの中にある、輪郭。",
    bannerLead: "苦味は、強さではない。",
    bannerTitle: "深さである。",

    enmaLabel: "Enma",
    enmaTitle: "閻魔",
    enmaSlides: [
      {
        image: "/images/enma-1.jpg",
        title: "閻魔",
        subtitle: "深さのある苦味と静かな余韻",
      },
      {
        image: "/images/enma-2.jpg",
        title: "抽出",
        subtitle: "質感のある甘さと輪郭",
      },
      {
        image: "/images/enma-3.jpg",
        title: "余韻",
        subtitle: "一口のあとに残る静けさ",
      },
    ],

    woodboxLabel: "Wood Box",
    woodboxTitle: "木棺",
    woodboxItems: [
      {
        image: "/images/woodbox-1.jpg",
        title: "木棺",
        subtitle: "限られたロットを収めた特別仕様",
      },
      {
        image: "/images/woodbox-2.jpg",
        title: "Wood Box",
        subtitle: "贈り物のように静かに届ける",
      },
    ],

    orioriLabel: "ORIORI",
    orioriTitle: "折々",
    orioriIntro: "折々の時間に寄り添う、三つの静かなサービス",
    orioriItems: [
      {
        image: "/images/oriori-1.jpg",
        title: "サブスクリプション",
        text: "月ごとの移ろいを、折々の流れにあわせて届けます。",
      },
      {
        image: "/images/oriori-2.jpg",
        title: "ドリップバッグ",
        text: "日々の合間に、龍華の輪郭を静かに味わう一杯です。",
      },
      {
        image: "/images/atmosphere-2.jpg",
        title: "フレーバーホイール",
        text: "味わいを言葉にするための、記録と発見のためのサイトです。",
      },
    ],
  },

  en: {
    heroEyebrow: "Products",
    heroTitle: "Contours held in stillness.",
    bannerLead: "Bitterness is not force.",
    bannerTitle: "It is depth.",

    enmaLabel: "Enma",
    enmaTitle: "Enma",
    enmaSlides: [
      {
        image: "/images/enma-1.jpg",
        title: "Enma",
        subtitle: "Bitterness with depth and a quiet finish",
      },
      {
        image: "/images/enma-2.jpg",
        title: "Extraction",
        subtitle: "Textured sweetness and clear contour",
      },
      {
        image: "/images/enma-3.jpg",
        title: "Aftertaste",
        subtitle: "A stillness that remains after a sip",
      },
    ],

    woodboxLabel: "Wood Box",
    woodboxTitle: "Wood Box",
    woodboxItems: [
      {
        image: "/images/woodbox-1.jpg",
        title: "Wood Box",
        subtitle: "A special format for limited lots",
      },
      {
        image: "/images/woodbox-2.jpg",
        title: "Wood Box",
        subtitle: "Delivered quietly, like a gift",
      },
    ],

    orioriLabel: "ORIORI",
    orioriTitle: "Oriori",
    orioriIntro: "Three quiet services shaped for changing seasons",
    orioriItems: [
      {
        image: "/images/oriori-1.jpg",
        title: "Subscription",
        text: "A seasonal rhythm of coffees and roasts delivered over time.",
      },
      {
        image: "/images/oriori-2.jpg",
        title: "Drip Bag",
        text: "A quiet cup that fits naturally into everyday pauses.",
      },
      {
        image: "/images/atmosphere-2.jpg",
        title: "Flavor Wheel",
        text: "A website for recording, discovering, and describing flavor.",
      },
    ],
  },

  es: {
    heroEyebrow: "Productos",
    heroTitle: "Contornos dentro de la quietud.",
    bannerLead: "El amargor no es fuerza.",
    bannerTitle: "Es profundidad.",

    enmaLabel: "Enma",
    enmaTitle: "Enma",
    enmaSlides: [
      {
        image: "/images/enma-1.jpg",
        title: "Enma",
        subtitle: "Amargor profundo y un final silencioso",
      },
      {
        image: "/images/enma-2.jpg",
        title: "Extracción",
        subtitle: "Dulzor con textura y contorno definido",
      },
      {
        image: "/images/enma-3.jpg",
        title: "Retrogusto",
        subtitle: "Una quietud que permanece después de un sorbo",
      },
    ],

    woodboxLabel: "Wood Box",
    woodboxTitle: "Caja de Madera",
    woodboxItems: [
      {
        image: "/images/woodbox-1.jpg",
        title: "Caja de Madera",
        subtitle: "Una edición especial para lotes limitados",
      },
      {
        image: "/images/woodbox-2.jpg",
        title: "Wood Box",
        subtitle: "Entregado con calma, como un regalo",
      },
    ],

    orioriLabel: "ORIORI",
    orioriTitle: "Oriori",
    orioriIntro: "Tres servicios silenciosos para distintos momentos",
    orioriItems: [
      {
        image: "/images/oriori-1.jpg",
        title: "Suscripción",
        text: "Una entrega estacional que acompaña el cambio del café y del tueste.",
      },
      {
        image: "/images/oriori-2.jpg",
        title: "Drip Bag",
        text: "Una taza tranquila para los pequeños espacios de cada día.",
      },
      {
        image: "/images/atmosphere-2.jpg",
        title: "Rueda de Sabor",
        text: "Un sitio para registrar, descubrir y describir sabores.",
      },
    ],
  },
};

export default function ProductsPage({ lang, setLang }) {
  const t = UI_TEXT[lang] || UI_TEXT.ja;
  const page = PAGE_TEXT[lang] || PAGE_TEXT.ja;

  const woodboxHeadingRef = useRef(null);
  const [woodboxHeadingVisible, setWoodboxHeadingVisible] = useState(false);

  useEffect(() => {
    const target = woodboxHeadingRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setWoodboxHeadingVisible(true);
          observer.unobserve(target);
        }
      },
      {
        threshold: 0.45,
      }
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, []);

  return (
    <>
      <main className="products-showcase-page">
        <section className="products-hero">
          <img
            src="/images/products-hero.jpg"
            alt="Ryuge Coffee products"
            className="products-hero-image"
          />
          <div className="products-hero-overlay">
            <p className="products-eyebrow">{page.heroEyebrow}</p>
            <h1>{page.heroTitle}</h1>
          </div>
        </section>

        <section className="products-showcase-section">
          <div className="products-section-heading products-heading-animate">
            <p className="products-section-label">{page.enmaLabel}</p>
            <h2>{page.enmaTitle}</h2>
          </div>

          <div className="products-enma-grid">
            {page.enmaSlides.map((slide, index) => (
              <article key={index} className="products-enma-static-card">
                <img src={slide.image} alt={slide.title} />
                <div className="products-enma-card-text">
                  <h3>{slide.title}</h3>
                  <p>{slide.subtitle}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="products-full-banner">
          <img
            src="/images/products-banner.jpg"
            alt="Ryuge Coffee atmosphere"
            className="products-full-banner-image"
          />
          <div className="products-full-banner-overlay">
            <p>{page.bannerLead}</p>
            <h2>{page.bannerTitle}</h2>
          </div>
        </section>

        <section className="products-showcase-section">
          <div
            ref={woodboxHeadingRef}
            className={`products-section-heading ${
              woodboxHeadingVisible ? "products-heading-animate" : ""
            }`}
          >
            <p className="products-section-label">{page.woodboxLabel}</p>
            <h2>{page.woodboxTitle}</h2>
          </div>

          <div className="products-simple-grid products-two-col">
            {page.woodboxItems.map((item, index) => (
              <article
                key={index}
                className="products-enma-static-card products-woodbox-card"
              >
                <img src={item.image} alt={item.title} />
                <div className="products-enma-card-text">
                  <h3>{item.title}</h3>
                  <p>{item.subtitle}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="products-showcase-section oriori-services-section">
          <div className="products-section-heading oriori-heading">
            <p className="products-section-label">{page.orioriLabel}</p>
            <h2>{page.orioriTitle}</h2>
            <p className="oriori-intro">{page.orioriIntro}</p>
          </div>

          <div className="oriori-services-grid">
            {page.orioriItems.map((item, index) => (
              <article key={index} className="oriori-service-card">
                <div className="oriori-service-visual">
                  <img src={item.image} alt={item.title} />
                </div>
                <div className="oriori-service-copy">
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}