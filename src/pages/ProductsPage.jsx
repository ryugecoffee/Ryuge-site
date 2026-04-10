import { useEffect, useRef, useState } from "react";
import SiteFooter from "../components/SiteFooter";
import { UI_TEXT } from "../uiText";
import { PRODUCT_DATA, PRODUCT_SECTIONS } from "../productData";

const PAGE_TEXT = {
  ja: {
    heroTitle: "静けさを、日常へ",
    bannerLead: "華やかさは、香りだけではない",
    bannerTitle: "余韻である",
  },

  en: {
    heroTitle: "From stillness into everyday life",
    bannerLead: "Brightness is not just aroma",
    bannerTitle: "It lingers",
  },

  es: {
    heroTitle: "La quietud, hacia la vida cotidiana",
    bannerLead: "No es solo aroma",
    bannerTitle: "Permanece",
  },
};

export default function ProductsPage({ lang, setLang }) {
const t = UI_TEXT[lang] || UI_TEXT.ja;
const page = PAGE_TEXT[lang] || PAGE_TEXT.ja;
const sectionText = PRODUCT_SECTIONS[lang] || PRODUCT_SECTIONS.ja;
const products = PRODUCT_DATA[lang] || PRODUCT_DATA.ja;
const [activeItem, setActiveItem] = useState(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") setActiveItem(null);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    document.body.style.overflow = activeItem ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [activeItem]);

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
<p className="products-section-label">{sectionText.enmaLabel}</p>
<h2>{sectionText.enmaTitle}</h2>
          </div>

          <div className="products-enma-grid">
{products.enma.map((slide, index) => (
  <article
    key={index}
    className={`products-enma-static-card ${
      activeItem === slide ? "active" : ""
    }`}
    onClick={() => setActiveItem(slide)}
  >
    <img src={slide.image} alt={slide.title} />
    <div className="products-enma-card-text">
<h3>{slide.title}</h3>
<p>{slide.summary}</p>
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
<p className="products-section-label">{sectionText.woodboxLabel}</p>
<h2>{sectionText.woodboxTitle}</h2>
          </div>

          <div className="products-simple-grid products-two-col">
{products.woodbox.map((item, index) => (
  <article
    key={index}
    className={`products-enma-static-card products-woodbox-card ${
      activeItem === item ? "active" : ""
    }`}
    onClick={() => setActiveItem(item)}
  >
    <img src={item.image} alt={item.title} />
    <div className="products-enma-card-text">
<h3>{item.title}</h3>
<p>{item.summary}</p>
    </div>
  </article>
))}
          </div>
        </section>

        <section className="products-showcase-section oriori-services-section">
          <div className="products-section-heading oriori-heading">
<p className="products-section-label">{sectionText.orioriLabel}</p>
<h2>{sectionText.orioriTitle}</h2>
<p className="oriori-intro">{sectionText.orioriIntro}</p>
          </div>

          <div className="oriori-services-grid">
{products.oriori.map((item, index) => (
  <article
    key={index}
    className={`oriori-service-card ${
      activeItem === item ? "active" : ""
    }`}
    onClick={() => setActiveItem(item)}
  >
    <div className="oriori-service-visual">
      <img src={item.image} alt={item.title} />
    </div>
    <div className="oriori-service-copy">
<h3>{item.title}</h3>
<p>{item.summary}</p>
    </div>
  </article>
))}
          </div>
        </section>
      </main>
            {activeItem && (
        <div
          className="modal-backdrop"
          onClick={() => setActiveItem(null)}
          role="presentation"
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={activeItem.title}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setActiveItem(null)}
              aria-label="Close"
              type="button"
            >
              ×
            </button>

            <div className="modal-image">
              <img src={activeItem.image} alt={activeItem.title} />
            </div>

            <div className="modal-copy">
<div className="modal-copy-inner">
  <h3>{activeItem.title}</h3>

  <p className="modal-summary">{activeItem.summary}</p>

  <div className="modal-specs">
    <div className="modal-spec-row">
      <span>{sectionText.specLabels.origin}</span>
      <strong>{activeItem.origin}</strong>
    </div>

    {activeItem.producer && (
      <div className="modal-spec-row">
        <span>{sectionText.specLabels.producer}</span>
        <strong>{activeItem.producer}</strong>
      </div>
    )}

    <div className="modal-spec-row">
      <span>{sectionText.specLabels.variety}</span>
      <strong>{activeItem.variety}</strong>
    </div>

    <div className="modal-spec-row">
      <span>{sectionText.specLabels.process}</span>
      <strong>{activeItem.process}</strong>
    </div>

    <div className="modal-spec-row">
      <span>{sectionText.specLabels.altitude}</span>
      <strong>{activeItem.altitude}</strong>
    </div>
  </div>

  <a
    href={activeItem.link}
    target="_blank"
    rel="noreferrer"
    className="modal-link-button"
  >
    <span>{sectionText.buyButton}</span>
    <span className="modal-link-arrow">↗</span>
  </a>
</div>
            </div>
          </div>
        </div>
      )}
        <SiteFooter lang={lang} />
    </>
  );
}