import { useEffect, useRef, useState } from "react";
import SiteFooter from "../components/SiteFooter";
import { PRODUCT_DATA, PRODUCT_SECTIONS } from "../productData";

const DEFAULT_SUBSCRIPTION_PLAN = "basic";

const PAGE_TEXT = {
  ja: {
    heroEyebrow: "Products",
    heroTitle: "静けさを、日常へ",
    bannerLead: "華やかさは、香りだけではない",
    bannerTitle: "余韻である",
  },
  en: {
    heroEyebrow: "Products",
    heroTitle: "From stillness into everyday life",
    bannerLead: "Brightness is not just aroma",
    bannerTitle: "It lingers",
  },
  es: {
    heroEyebrow: "Products",
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
  const page = PAGE_TEXT[lang] || PAGE_TEXT.ja;
  const sectionText = PRODUCT_SECTIONS[lang] || PRODUCT_SECTIONS.ja;
  const labels = sectionText.specLabels;
  const products = PRODUCT_DATA;

  const [activeItemId, setActiveItemId] = useState(null);
  const [selectedSubscriptionPlan, setSelectedSubscriptionPlan] =
    useState(DEFAULT_SUBSCRIPTION_PLAN);

  const [showEnmaHeading, setShowEnmaHeading] = useState(false);
  const [showWoodboxHeading, setShowWoodboxHeading] = useState(false);

  const enmaSectionRef = useRef(null);
  const woodboxSectionRef = useRef(null);

  const activeItem =
    [...products.enma, ...products.woodbox, ...products.oriori].find(
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
    window.scrollTo(0, 0);
  }, []);

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

    // 🔥 閻魔
    if (!enmaTriggered) {
      const enmaTop = enmaNode.getBoundingClientRect().top;

      if (enmaTop <= triggerLine) {
        enmaTriggered = true;

        setTimeout(() => {
          setShowEnmaHeading(true);
        }, 2000); // ←4秒後に消える
      }
    }

    // 🔥 木箱
    if (!woodboxTriggered) {
      const woodboxTop = woodboxNode.getBoundingClientRect().top;

      if (woodboxTop <= triggerLine) {
        woodboxTriggered = true;

        setTimeout(() => {
          setShowWoodboxHeading(true);
        }, 2000); // ←4秒後に消える
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

        <section
          className="products-showcase-section products-enma-section"
        >
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
                onClick={() => setActiveItemId(item.id)}
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

        <section
          className="products-showcase-section products-woodbox-section"
        >
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
                onClick={() => setActiveItemId(item.id)}
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
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="oriori-services-section">
          <div className="oriori-heading">
            <h2>{sectionText.orioriTitle}</h2>
            <p>{sectionText.orioriIntro}</p>
          </div>

          <div className="oriori-services-grid">
            {products.oriori.map((item) => (
              <article
                key={item.id}
                className="oriori-service-card"
                onClick={() => setActiveItemId(item.id)}
              >
                <img src={item.image} alt="" />

                <div className="oriori-service-copy">
                  <h3>{item.title?.[lang]}</h3>
                  <p>{item.summary?.[lang]}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>

      {activeItem && (
        <div className="modal-backdrop" onClick={() => setActiveItemId(null)}>
          <div className="modal modal-premium" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => setActiveItemId(null)}
            >
              ×
            </button>

            <div className="modal-image modal-image-premium">
              <img src={activeItem.image} alt="" />
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

                      <a
                        href={activeItem.link}
                        target="_blank"
                        rel="noreferrer"
                        className="subscription-cta"
                      >
                        <span>{currentSubscriptionPlan.button}</span>
                        <span className="modal-link-arrow">↗</span>
                      </a>
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

{activeItem.id === "oriori-bag" ? (
  <>
    <div className="product-brew modal-fade-up">
      {(activeItem.brew?.[lang] || activeItem.brew?.en || []).map((step, i) => (
        <p key={i}>{step}</p>
      ))}
    </div>

    <div className="product-variants modal-fade-up">
      {(activeItem.variants || []).map((v) => (
        <div key={v.id} className="variant">
          <strong>{v.name?.[lang] || v.name?.en}</strong>
          <p>{v.note?.[lang] || v.note?.en}</p>
        </div>
      ))}
    </div>
  </>
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

                  {activeItem.isSoldOut ? (
                    <button className="modal-cta-link is-disabled" disabled>
                      {SOLD_OUT_TEXT[lang]}
                    </button>
                  ) : (
                    <a
                      href={activeItem.link}
                      target="_blank"
                      rel="noreferrer"
                      className="modal-cta-link modal-fade-up"
                    >
                      <span>{sectionText.buyButton}</span>
                      <span className="modal-link-arrow">↗</span>
                    </a>
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