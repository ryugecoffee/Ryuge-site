import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import SiteFooter from "../components/SiteFooter";
import { PRODUCT_DATA, PRODUCT_SECTIONS } from "../productData";
import { useCart } from "../CartContext";
import { trackViewItem } from "../lib/analytics";

// productData.js の plan.id に合わせる（mame = 一番人気 = デフォルト）
const DEFAULT_SUBSCRIPTION_PLAN = "mame";

const PAGE_TEXT = {
  ja: {
    heroEyebrow: "鎌倉から届く、一杯",
    heroTitle: "静けさを、日常へ",
    bannerLead: "華やかさは、香りだけではない",
    bannerTitle: "余韻である",
  },
  en: {
    heroEyebrow: "A cup from Kamakura",
    heroTitle: "From stillness into everyday life",
    bannerLead: "Brightness is not just aroma",
    bannerTitle: "It lingers",
  },
  es: {
    heroEyebrow: "Una taza desde Kamakura",
    heroTitle: "La quietud, hacia la vida cotidiana",
    bannerLead: "No es solo aroma",
    bannerTitle: "Permanece",
  },
};

const SOLD_OUT_TEXT = {
  ja: "売り切れ",
  en: "Sold Out",
  es: "Agotado",
};

export default function ProductsPage({ lang }) {
  const location = useLocation();
  const { setItem } = useCart();
  const page = PAGE_TEXT[lang] || PAGE_TEXT.ja;
  const sectionText = PRODUCT_SECTIONS[lang] || PRODUCT_SECTIONS.ja;
  const labels = sectionText.specLabels;
  const products = PRODUCT_DATA;

  const [activeItemId, setActiveItemId] = useState(null);
  const [selectedSubscriptionPlan, setSelectedSubscriptionPlan] = useState(
    DEFAULT_SUBSCRIPTION_PLAN
  );
  const [showEnmaHeading, setShowEnmaHeading] = useState(false);
  const [simpleQuantity, setSimpleQuantity] = useState(1);
  const [showWoodboxHeading, setShowWoodboxHeading] = useState(false);

  const enmaSectionRef = useRef(null);
  const woodboxSectionRef = useRef(null);

  const activeItem =
    [...products.enma, ...products.woodbox, ...(products.bag || []), ...products.oriori].find(
      (item) => item.id === activeItemId
    ) || null;

  const subscriptionPlans =
    activeItem?.id === "oriori-subscription"
      ? activeItem.plans?.[lang] || activeItem.plans?.en || []
      : [];

  const currentSubscriptionPlan =
    subscriptionPlans.find((plan) => plan.id === selectedSubscriptionPlan) ||
    subscriptionPlans[0] ||
    null;

  useEffect(() => {
    if (activeItem?.id === "oriori-subscription") {
      setSelectedSubscriptionPlan(DEFAULT_SUBSCRIPTION_PLAN);
    }
  }, [activeItem]);

  useEffect(() => {
    if (activeItem && activeItem.id !== "oriori-bag") {
      setSimpleQuantity(1);
    }
  }, [activeItem]);

  useEffect(() => {
    const hash = location.hash;
    if (hash) {
      const id = hash.replace("#", "");
      const target = document.getElementById(id);
      if (target) {
        setTimeout(() => {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 50);
      }
    } else {
      window.scrollTo(0, 0);
    }
  }, [location]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") setActiveItemId(null);
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

  useEffect(() => {
    const enmaNode = enmaSectionRef.current;
    const woodboxNode = woodboxSectionRef.current;

    if (!enmaNode || !woodboxNode) return;

    let enmaTriggered = false;
    let woodboxTriggered = false;

    const handleScroll = () => {
      const triggerLine = window.innerHeight * 0.6;

      if (!enmaTriggered) {
        const enmaTop = enmaNode.getBoundingClientRect().top;
        if (enmaTop <= triggerLine) {
          enmaTriggered = true;
          setTimeout(() => {
            setShowEnmaHeading(true);
          }, 2000);
        }
      }

      if (!woodboxTriggered) {
        const woodboxTop = woodboxNode.getBoundingClientRect().top;
        if (woodboxTop <= triggerLine) {
          woodboxTriggered = true;
          setTimeout(() => {
            setShowWoodboxHeading(true);
          }, 2000);
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const renderSpecRow = (label, value) => {
    if (!value) return null;
    return (
      <div className="product-spec-row" key={label}>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    );
  };

  return (
    <>
      <main className="products-showcase-page">
        <section className="products-hero">
          <img
            src="/images/products-hero.jpg"
            alt=""
            className="products-hero-image"
          />
          <div className="products-hero-overlay">
            <p className="products-eyebrow">{page.heroEyebrow}</p>
            <h1>{page.heroTitle}</h1>
          </div>
        </section>

        <section className="products-showcase-section products-enma-section" id="enma">
          <div
            ref={enmaSectionRef}
            className={`products-section-heading products-heading-animate ${
              showEnmaHeading ? "is-hidden" : ""
            }`}
          >
            <p className="products-section-label">{sectionText.enmaLabel}</p>
            <h2>{sectionText.enmaTitle}</h2>
          </div>

          <div className="products-enma-grid">
            {products.enma.map((item) => (
              <article
                key={item.id}
                className="products-enma-static-card"
                onClick={() => { setActiveItemId(item.id); trackViewItem(item); }}
              >
                <img src={item.image} alt="" />

                {item.isSoldOut && (
                  <span className="product-soldout-badge">
                    {SOLD_OUT_TEXT[lang]}
                  </span>
                )}

                <div className="products-enma-card-text">
                  <h3>{item.title?.[lang]}</h3>
                  <p>{item.summary?.[lang]}</p>
                  {item.price && <p className="product-card-price">{item.price}</p>}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="products-banner-section">
          <div className="products-banner-image-wrap">
            <img
              src="/images/products-banner.jpg"
              alt=""
              className="products-banner-image"
            />
            <div className="products-banner-overlay">
              <p>{page.bannerLead}</p>
              <h2>{page.bannerTitle}</h2>
            </div>
          </div>
        </section>

        <section className="products-showcase-section products-woodbox-section" id="woodbox">
          <div
            ref={woodboxSectionRef}
            className={`products-section-heading products-heading-animate ${
              showWoodboxHeading ? "is-hidden" : ""
            }`}
          >
            <p className="products-section-label">{sectionText.woodboxLabel}</p>
            <h2>{sectionText.woodboxTitle}</h2>
          </div>

          <div className="products-two-col">
            {products.woodbox.map((item) => (
              <article
                key={item.id}
                className="products-enma-static-card products-woodbox-card"
                onClick={() => { setActiveItemId(item.id); trackViewItem(item); }}
              >
                <img src={item.image} alt="" />

                {item.isSoldOut && (
                  <span className="product-soldout-badge">
                    {SOLD_OUT_TEXT[lang]}
                  </span>
                )}

                <div className="products-enma-card-text">
                  <h3>{item.title?.[lang]}</h3>
                  <p>{item.summary?.[lang]}</p>
                  {item.price && <p className="product-card-price">{item.price}</p>}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="oriori-services-section" id="oriori">
          <div className="oriori-heading">
            <h2>{sectionText.orioriTitle}</h2>
            <p>{sectionText.orioriIntro}</p>
          </div>

          <div className="oriori-services-grid">
            {[...(products.bag || []), ...products.oriori].map((item) => (
              <article
                key={item.id}
                className="oriori-service-card"
                onClick={() => { setActiveItemId(item.id); trackViewItem(item); }}
              >
                <img src={item.image} alt="" />
                <div className="oriori-service-copy">
                  <h3>{item.title?.[lang]}</h3>
                  <p>{item.summary?.[lang]}</p>
                  {item.weight && <p className="product-card-weight">{item.weight}</p>}
                  {item.price && <p className="product-card-price">{item.price}</p>}
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>

      {activeItem && (
        <div className="modal-backdrop" onClick={() => setActiveItemId(null)}>
          <div
            className="modal modal-premium"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close-safe"
              aria-label="閉じる"
              onClick={() => setActiveItemId(null)}
            >
              戻る
            </button>

            <div className="modal-image modal-image-premium">
              {activeItem?.image && (
  <img src={activeItem.image} alt="" />
)}
            </div>

            <div className="modal-copy modal-copy-premium">
              {activeItem.id === "oriori-subscription" ? (
                <div className="modal-copy-inner subscription-modal-copy">
                  <h3>
                    {activeItem.modalTitle?.[lang] ||
                      activeItem.modalTitle?.en ||
                      activeItem.title?.[lang] ||
                      activeItem.title?.en ||
                      activeItem.title}
                  </h3>

                  <p className="modal-summary">
                    {activeItem.summary?.[lang] ||
                      activeItem.summary?.en ||
                      activeItem.summary}
                  </p>

                  <div className="subscription-plan-tabs">
                    {subscriptionPlans.map((plan) => (
                      <button
                        key={plan.id}
                        type="button"
                        className={`subscription-plan-tab ${
                          currentSubscriptionPlan?.id === plan.id ? "active" : ""
                        }`}
                        onClick={() => setSelectedSubscriptionPlan(plan.id)}
                      >
                        <span className="subscription-plan-tab-name">
                          {plan.name}
                        </span>
                        <span className="subscription-plan-tab-price">
                          {plan.price}
                        </span>
                      </button>
                    ))}
                  </div>

                  {currentSubscriptionPlan && (
                    <div className="subscription-plan-panel">
                      <div className="subscription-plan-header">
                        <div>
                          <p className="subscription-plan-lead">
                            {currentSubscriptionPlan.lead}
                          </p>
                          <h4>{currentSubscriptionPlan.name}</h4>
                        </div>

                        {currentSubscriptionPlan.badge && (
                          <span className="subscription-plan-badge">
                            {currentSubscriptionPlan.badge}
                          </span>
                        )}
                      </div>

                      <div className="subscription-plan-meta">
                        <div className="subscription-meta-row">
                          <span>
                            {lang === "ja"
                              ? "価格"
                              : lang === "es"
                              ? "Precio"
                              : "Price"}
                          </span>
                          <strong>{currentSubscriptionPlan.price}</strong>
                        </div>

                        <div className="subscription-meta-row">
                          <span>
                            {lang === "ja"
                              ? "配送頻度"
                              : lang === "es"
                              ? "Entrega"
                              : "Delivery"}
                          </span>
                          <strong>{currentSubscriptionPlan.frequency}</strong>
                        </div>

                        <div className="subscription-meta-row">
                          <span>
                            {lang === "ja"
                              ? "送料"
                              : lang === "es"
                              ? "Envío"
                              : "Shipping"}
                          </span>
                          <strong>{currentSubscriptionPlan.shipping}</strong>
                        </div>
                      </div>

                      <div className="subscription-plan-items">
                        {currentSubscriptionPlan.items.map((item) => (
                          <div key={item} className="subscription-plan-item">
                            <span className="subscription-plan-dot" />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>

                      <p className="subscription-plan-note">
                        {currentSubscriptionPlan.note}
                      </p>

                      <button
                        type="button"
                        className="modal-cta-link"
                        style={{ marginTop: "16px" }}
                        onClick={() => {
                          if (!currentSubscriptionPlan) return;
                          setItem(
                            {
                              id: `subscription-${currentSubscriptionPlan.id}`,
                              name: `${activeItem.title?.[lang] || "定期便"} — ${currentSubscriptionPlan.name}`,
                              price: currentSubscriptionPlan.priceNumber ?? 0,
                              category: "subscription",
                              size: "100g",
                            },
                            1
                          );

                          setActiveItemId(null);
                        }}
                      >
                        {lang === "ja"
                          ? "カートに入れる"
                          : lang === "es"
                          ? "Añadir al carrito"
                          : "Add to cart"}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="modal-copy-inner modal-copy-classic">
                  <h3
                    className="modal-product-title modal-title-animate"
                    style={{ whiteSpace: "pre-line" }}
                  >
                    {activeItem.modalTitle?.[lang] ||
                      activeItem.modalTitle?.en ||
                      activeItem.title?.[lang] ||
                      activeItem.title?.en}
                  </h3>

                  <p className="modal-summary modal-product-summary modal-fade-up">
                    {activeItem.summary?.[lang] ||
                      activeItem.summary?.en ||
                      activeItem.summary}
                  </p>

                  {activeItem.id === "oriori-apps" ? (
                    <>
  <p className="modal-summary modal-product-summary modal-fade-up">
    {activeItem.description?.[lang] ||
      activeItem.description?.en ||
      activeItem.summary?.[lang] ||
      activeItem.summary?.en}
  </p>

  <div
    className="apps-link-list modal-fade-up"
    style={{
      marginTop: "22px",
      display: "grid",
      gap: "18px",
    }}
  >
    {(activeItem.apps || []).map((app) => (
      <div
        key={app.url}
        className="apps-link-item"
        style={{
          padding: "18px 0",
          borderTop: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <h4
          style={{
            margin: "0 0 8px",
            fontSize: "18px",
            letterSpacing: "0.02em",
            color: "rgba(255,255,255,0.9)",
          }}
        >
          {app.title?.[lang] || app.title?.en}
        </h4>

        <p
          style={{
            margin: "0 0 14px",
            fontSize: "14px",
            lineHeight: 1.8,
            color: "rgba(255,255,255,0.62)",
          }}
        >
          {app.text?.[lang] || app.text?.en}
        </p>

        <a
          href={app.url}
          target="_blank"
          rel="noreferrer"
          className="modal-cta-link"
          style={{
            display: "inline-block",
            textAlign: "center",
          }}
        >
          {app.buttonLabel?.[lang] || app.buttonLabel?.en || "Open App"}
        </a>
      </div>
    ))}
  </div>
</>
                  ) : (
                    <>
                      {(activeItem.category === "bag" || activeItem.category === "tea-bag") ? (
                        <div className="modal-brew-block modal-fade-up">
                          <p className="modal-brew-label">
                            {lang === "ja" ? "淹れ方" : lang === "es" ? "Preparación" : "How to Brew"}
                          </p>
                          <div className="modal-brew-steps">
                            {(activeItem.brew?.[lang] || []).map((step, i) => (
                              <p key={i}>{step}</p>
                            ))}
                          </div>
                          {renderSpecRow(labels.weight, activeItem.weight)}
                          {renderSpecRow(labels.price, activeItem.price)}
                        </div>
                      ) : (
                        <dl className="product-specs product-specs-classic modal-fade-up">
                          {renderSpecRow(labels.origin, activeItem.origin)}
                          {renderSpecRow(labels.producer, activeItem.producer)}
                          {renderSpecRow(labels.process, activeItem.process)}
                          {renderSpecRow(labels.variety, activeItem.variety)}
                          {renderSpecRow(labels.altitude, activeItem.altitude)}
                          {renderSpecRow(labels.weight, activeItem.weight)}
                          {renderSpecRow(labels.price, activeItem.price)}
                          {renderSpecRow(labels.flavor, activeItem.flavor)}
                        </dl>
                      )}

                      <div className="simple-quantity-block">
                        <p className="simple-quantity-label">
                          {lang === "ja"
                            ? "数量"
                            : lang === "es"
                            ? "Cantidad"
                            : "Quantity"}
                        </p>

                        <div className="simple-quantity-control">
                          <button
                            type="button"
                            onClick={() =>
                              setSimpleQuantity((prev) => Math.max(0, prev - 1))
                            }
                          >
                            −
                          </button>

                          <input
                            type="number"
                            min="0"
                            value={simpleQuantity}
                            onChange={(e) => {
                              const value = e.target.value;

                              if (value === "") {
                                setSimpleQuantity(0);
                                return;
                              }

                              const next = Number(value);

                              if (Number.isNaN(next)) return;

                              setSimpleQuantity(Math.max(0, next));
                            }}
                          />

                          <button
                            type="button"
                            onClick={() => setSimpleQuantity((prev) => prev + 1)}
                          >
                            ＋
                          </button>
                        </div>
                      </div>

                      {activeItem.isSoldOut ? (
                        <button className="modal-cta-link is-disabled" disabled>
                          {SOLD_OUT_TEXT[lang]}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="modal-cta-link modal-fade-up"
                          onClick={() => {
                            setItem(
                              {
                                id: activeItem.id,
                                name: activeItem.title?.[lang] || activeItem.title?.en || activeItem.title,
                                price: activeItem.priceNumber ?? 0,
                                category: activeItem.category,
                                size: activeItem.size,
                              },
                              simpleQuantity
                            );

                            setActiveItemId(null);
                          }}
                        >
                          {lang === "ja"
                            ? "カートに入れる"
                            : lang === "es"
                            ? "Añadir al carrito"
                            : "Add to cart"}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <SiteFooter lang={lang} />
    </>
  );
}