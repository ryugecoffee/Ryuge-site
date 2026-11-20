import { useEffect, useRef, useState } from "react";
// Draft inventory PR preview must never call the production payment API.
import { PAYMENT_API_BASE, classifyAvailability } from "../lib/paymentEnv";
import { useLocation } from "react-router-dom";
import SiteFooter from "../components/SiteFooter";
import BeanConcierge from "../components/BeanConcierge";
import { PRODUCT_DATA, PRODUCT_SECTIONS, DETAIL_TEXT, ROAST_LEVEL, SUBSCRIPTIONS_PAUSED, SUBSCRIPTIONS_PAUSED_SHORT_TEXT, COFFEE_SUBSCRIPTION, loc } from "../productData";
import CoffeeSubscriptionDetail from "../components/CoffeeSubscriptionDetail";
import { useCart } from "../CartContext";
import { trackViewItem } from "../lib/analytics";

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

// Temporary checkout preview handles only these two stocked coffee SKUs.
// Do not infer "sold out" for untracked products from a missing API quantity.
// Must equal the products with managedStock: true in server/catalog.js (a server test checks it).
const INVENTORY_MANAGED_SKUS = new Set(["enma-karamo", "enma-kindiio", "enma-coffee-bag", "enma-zen-dark-roast", "enma-amarelo-bourbon", "enma-jimma", "enma-quequesques", "enma-andes-blue", "mokkan-oku-yame-hojicha", "mokkan-oku-yame-genmaicha"]);
// Sold only while the payment server has inventory on (a sales cap must hold): requiresInventory in server/catalog.js.
const REQUIRES_INVENTORY_SKUS = new Set(["enma-zen-dark-roast", "enma-amarelo-bourbon", "enma-jimma", "enma-quequesques", "enma-andes-blue", "mokkan-oku-yame-hojicha", "mokkan-oku-yame-genmaicha"]);
// Promotional beans: at most 2 bags per customer (the payment server enforces it across orders).
const PROMO_MAX_BAGS = 2;

const STOCK_CHECK_TEXT = {
  ja: "在庫確認中",
  en: "Checking Stock",
  es: "Comprobando stock",
};

const SOLD_OUT_TEXT = {
  ja: "売り切れ",
  en: "Sold Out",
  es: "Agotado",
};

const COMING_SOON_TEXT = {
  ja: "近日公開",
  en: "Coming Soon",
  es: "Próximamente",
};

export default function ProductsPage({ lang }) {
  const location = useLocation();
  const { setItem } = useCart();
  const page = PAGE_TEXT[lang] || PAGE_TEXT.ja;
  const sectionText = PRODUCT_SECTIONS[lang] || PRODUCT_SECTIONS.ja;
  const labels = sectionText.specLabels;
  const detailText = DETAIL_TEXT[lang] || DETAIL_TEXT.ja;
  const products = PRODUCT_DATA;
  const activeWoodbox = products.woodbox.filter((item) => !item.archived && !item.hidden);
  // Bag series items still listed on their own (the coffee bag moved to Enma; the tea bag is hidden for now).
  const listedBags = (products.bag || []).filter((item) => !item.hidden);

  const [activeItemId, setActiveItemId] = useState(null);
  const [showEnmaHeading, setShowEnmaHeading] = useState(false);
  const [simpleQuantity, setSimpleQuantity] = useState(1);
  const [showWoodboxHeading, setShowWoodboxHeading] = useState(false);
  const [inventoryAvailability, setInventoryAvailability] = useState(null);
  // "checking" until the first answer; "disabled" = no inventory gating (legacy behaviour);
  // "enabled" = server-reported counts; "unknown" = fail closed for managed items.
  const [inventoryMode, setInventoryMode] = useState("checking");
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const refreshInventory = async () => {
      let status = 0;
      let body = null;
      try {
        const ids = [...INVENTORY_MANAGED_SKUS].join(",");
        const response = await fetch(
          `${PAYMENT_API_BASE}/inventory/availability?ids=${encodeURIComponent(ids)}`,
          { signal: controller.signal, cache: "no-store" }
        );
        status = response.status;
        body = await response.json().catch(() => null);
      } catch {
        status = 0;
      }
      if (!active) return;
      const result = classifyAvailability(status, body, [...INVENTORY_MANAGED_SKUS]);
      // Never sell past zero: anything but a complete, enabled answer keeps managed items closed.
      setInventoryMode(result.kind);
      setInventoryAvailability(result.kind === "enabled" ? result.quantities : null);
    };
    refreshInventory();
    const onFocus = () => refreshInventory();
    const intervalId = window.setInterval(refreshInventory, 30000);
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const stockStatus = (item) => {
    if (item.comingSoon) return "comingSoon";
    if (item.isSoldOut) return "soldOut";
    if (!INVENTORY_MANAGED_SKUS.has(item.id)) return "unmanaged";
    if (inventoryMode === "disabled") return REQUIRES_INVENTORY_SKUS.has(item.id) ? "comingSoon" : "unmanaged";
    if (inventoryMode !== "enabled" || !inventoryAvailability) return "checking";
    return inventoryAvailability[item.id] === 0 ? "soldOut" : "available";
  };



  // Most a customer can put in the cart: the stock left, and 2 for promotional beans.
  const maxQuantity = (item) => Math.min(item?.promo ? PROMO_MAX_BAGS : 50, inventoryAvailability?.[item?.id] ?? 50);

  const enmaSectionRef = useRef(null);
  const woodboxSectionRef = useRef(null);

  const activeItem =
    [...products.enma, ...activeWoodbox, ...listedBags, ...products.oriori].find(
      (item) => item.id === activeItemId
    ) || null;

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

    if (!enmaNode) return;

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
        if (!woodboxNode) return;
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
    const text = loc(value, lang);
    if (!text) return null;
    return (
      <div className="product-spec-row" key={label}>
        <dt>{label}</dt>
        <dd>{text}</dd>
      </div>
    );
  };

  // Detail rows, grouped: where it comes from, then how it was grown and processed. Only facts in productData.js.
  const DETAIL_FIELDS = ["origin", "producer", "ingredients", "altitude", "variety", "process", "drying", "grade", "harvest", "arrival"];

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
                className="products-enma-static-card enma-product-card"
                onClick={() => { setActiveItemId(item.id); trackViewItem(item); }}
              >
                <div className="enma-card-photo">
                  <img src={item.image} alt="" />
                  {item.promotion?.active && (
                    <span className="enma-promotion-ribbon">{item.promotion.label?.[lang] || item.promotion.label?.ja}</span>
                  )}
                  {stockStatus(item) === "comingSoon" && (
                    <span className="enma-coming-soon-badge">{COMING_SOON_TEXT[lang]}</span>
                  )}
                  {stockStatus(item) === "soldOut" && !item.isSoldOut && (
                    <span className="enma-coming-soon-badge">{SOLD_OUT_TEXT[lang]}</span>
                  )}
                  {stockStatus(item) === "checking" && (
                    <span className="enma-coming-soon-badge">{STOCK_CHECK_TEXT[lang]}</span>
                  )}
                </div>

                {item.isSoldOut && (
                  <span className="product-soldout-badge">
                    {SOLD_OUT_TEXT[lang]}
                  </span>
                )}

                <div className="products-enma-card-text">
                  <h3 className="enma-card-title">
                    {lang === "ja" && item.title?.ja?.startsWith("閻魔") ? (
                      <>
                        <span className="enma-title-series">閻魔</span>
                        <span className="enma-title-origin">{item.title.ja.replace(/^閻魔[　 ]*/, "")}</span>
                      </>
                    ) : item.title?.[lang]}
                  </h3>
                  <div className="enma-price-row">
                    {item.regularPriceNumber && item.promotion?.active && <span className="enma-original-price">¥{item.regularPriceNumber.toLocaleString()}</span>}
                    <span className="enma-current-price">{item.price} <small>/ {loc(item.weight, lang)}</small></span>
                  </div>
                  <p className="enma-card-origin">{loc(item.process, lang)}</p>
                  {item.roast?.[lang] && <p className="enma-card-roast">{item.roast[lang]}</p>}
                  {item.flavorNotes?.[lang] && <p className="enma-card-flavors">{item.flavorNotes[lang].join(" · ")}</p>}
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

        {activeWoodbox.length > 0 && (
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

          {/* Tea: the photo, then the information below it (as the coffee cards), so nothing sits on the photo. */}
          <div className="products-woodbox-grid">
            {activeWoodbox.map((item) => (
              <article
                key={item.id}
                className="woodbox-product-card"
                onClick={() => { setActiveItemId(item.id); trackViewItem(item); }}
              >
                <div className="woodbox-card-photo">
                  <img src={item.image} alt="" />
                  {item.isSoldOut && (
                    <span className="product-soldout-badge">
                      {SOLD_OUT_TEXT[lang]}
                    </span>
                  )}
                  {item.comingSoon && !item.isSoldOut && (
                    <span className="product-soldout-badge">
                      {COMING_SOON_TEXT[lang]}
                    </span>
                  )}
                </div>

                <div className="woodbox-card-info">
                  <h3>{item.title?.[lang]}</h3>
                  {item.price && <p className="woodbox-card-price">{item.price}</p>}
                  <p className="woodbox-card-summary">{item.summary?.[lang]}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        )}

        <section className="oriori-services-section" id="oriori">
          <div className="oriori-heading">
            <h2>{sectionText.orioriTitle}</h2>
            <p>{sectionText.orioriIntro}</p>
          </div>

          <div className="oriori-services-grid">
            {[...listedBags, ...products.oriori].map((item) => (
              <article
                key={item.id}
                className={`oriori-service-card ${item.subscription ? "is-featured" : ""}`}
                onClick={() => { setActiveItemId(item.id); trackViewItem(item); }}
              >
                <img src={item.image} alt="" />
                {item.comingSoon && (
                  <span className="product-soldout-badge">
                    {COMING_SOON_TEXT[lang]}
                  </span>
                )}
                {item.category === "subscription" && SUBSCRIPTIONS_PAUSED && (
                  <span className="product-soldout-badge">{loc(SUBSCRIPTIONS_PAUSED_SHORT_TEXT, lang)}</span>
                )}
                <div className="oriori-service-copy">
                  <h3>{item.title?.[lang]}</h3>
                  <p className="oriori-service-summary">{item.summary?.[lang]}</p>
                  {item.weight && <p className="product-card-weight">{loc(item.weight, lang)}</p>}
                  {item.price && <p className="product-card-price">{item.price}</p>}
                  {item.subscription && (
                    <p className="product-card-price">
                      {(COFFEE_SUBSCRIPTION.frequencyLabel[lang] || COFFEE_SUBSCRIPTION.frequencyLabel.ja)(1)} ¥{COFFEE_SUBSCRIPTION.frequencies[0].priceNumber.toLocaleString("ja-JP")}〜
                    </p>
                  )}
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
              aria-label={detailText.close}
              onClick={() => setActiveItemId(null)}
            >
              {detailText.back}
            </button>

            <div className="modal-image modal-image-premium">
              {activeItem?.image && (
  <img src={activeItem.image} alt="" />
)}
            </div>

            <div className="modal-copy modal-copy-premium">
              {activeItem.id === "oriori-subscription" ? (
                <CoffeeSubscriptionDetail lang={lang} />
              ) : (
                <div className="modal-copy-inner modal-copy-classic">
                  {activeItem.id === "oriori-apps" ? (
                  <>
                  <h3
                    className="modal-product-title modal-title-animate"
                    style={{ whiteSpace: "pre-line" }}
                  >
                    {loc(activeItem.modalTitle, lang) || loc(activeItem.title, lang)}
                  </h3>

                  <p className="modal-summary modal-product-summary modal-fade-up">
                    {loc(activeItem.summary, lang)}
                  </p>
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
                  </>
                  ) : (
                    <div className="product-detail modal-fade-up">
                      {/* 1. What it is: name, size, price, roast and a short description of the taste. */}
                      <header className="product-detail-head">
                        {activeItem.promotion?.active && (
                          <span className="product-detail-promo">{loc(activeItem.promotion.label, lang)}</span>
                        )}
                        <h3 className="modal-product-title modal-title-animate" style={{ whiteSpace: "pre-line" }}>
                          {loc(activeItem.modalTitle, lang) || loc(activeItem.title, lang)}
                        </h3>
                        <p className="product-detail-meta">
                          {activeItem.weight && <span>{loc(activeItem.weight, lang)}</span>}
                          {activeItem.price && <span className="product-detail-price">{activeItem.price}</span>}
                          {activeItem.roast && <span className="product-detail-roast">{loc(activeItem.roast, lang)}</span>}
                        </p>
                        {loc(activeItem.summary, lang) && <p className="product-detail-lead">{loc(activeItem.summary, lang)}</p>}
                        {activeItem.flavorNotes?.[lang]?.length > 0 && (
                          <ul className="product-detail-notes" aria-label={detailText.flavor}>
                            {activeItem.flavorNotes[lang].map((note) => <li key={note}>{note}</li>)}
                          </ul>
                        )}
                        {activeItem.notice && <p className="product-detail-notice">{loc(activeItem.notice, lang)}</p>}
                      </header>

                      {(activeItem.category === "bag" || activeItem.category === "tea-bag") && (
                        <section className="product-detail-section">
                          <h4>{detailText.howToBrew}</h4>
                          <ol className="product-detail-steps">
                            {(activeItem.brew?.[lang] || []).map((step, i) => <li key={i}>{step}</li>)}
                          </ol>
                        </section>
                      )}

                      {/* 2. Buying. */}
                      <div className="product-detail-buy">
                      {stockStatus(activeItem) !== "comingSoon" && (
                        <div className="simple-quantity-block">
                          <p className="simple-quantity-label">
                            {detailText.quantity}
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

                                setSimpleQuantity(Math.min(Math.max(0, next), maxQuantity(activeItem)));
                              }}
                            />

                            <button
                              type="button"
                              onClick={() => setSimpleQuantity((prev) => Math.min(prev + 1, maxQuantity(activeItem)))}
                            >
                              ＋
                            </button>
                          </div>
                        </div>
                      )}

                      {activeItem.promo && stockStatus(activeItem) !== "comingSoon" && (
                        <p className="product-detail-promo-note">
                          {detailText.promoNote}
                        </p>
                      )}
                      {stockStatus(activeItem) === "comingSoon" ? (
                        <button className="modal-cta-link is-disabled" disabled>
                          {COMING_SOON_TEXT[lang]}
                        </button>
                      ) : stockStatus(activeItem) === "soldOut" ? (
                        <button className="modal-cta-link is-disabled" disabled>
                          {SOLD_OUT_TEXT[lang]}
                        </button>
                      ) : stockStatus(activeItem) === "checking" ? (
                        <button className="modal-cta-link is-disabled" disabled>
                          {STOCK_CHECK_TEXT[lang]}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="modal-cta-link modal-fade-up"
                          onClick={() => {
                            if (stockStatus(activeItem) === "soldOut" || stockStatus(activeItem) === "checking") return;
                            if (INVENTORY_MANAGED_SKUS.has(activeItem.id) && inventoryMode === "enabled" && (inventoryAvailability?.[activeItem.id] ?? 0) < simpleQuantity) return;
                            if (!Number.isInteger(simpleQuantity) || simpleQuantity < 1) return;
                            setItem(
                              {
                                id: activeItem.id,
                                name: activeItem.title?.[lang] || activeItem.title?.en || activeItem.title,
                                price: activeItem.priceNumber ?? 0,
                                category: activeItem.category,
                                size: activeItem.size,
                                promo: activeItem.promo === true,
                              },
                              Math.min(simpleQuantity, maxQuantity(activeItem))
                            );

                            setActiveItemId(null);
                          }}
                        >
                          {detailText.addToCart}
                        </button>
                      )}
                      </div>

                      {activeItem.brewing && (
                        <section className="product-detail-section">
                          <h4>{detailText.howToBrew}</h4>
                          <div className="product-brew-grid">
                            {activeItem.brewing.hot && (
                              <div className="product-brew-card">
                                <h5>{detailText.brewHot}</h5>
                                <p>{detailText.hotAmounts(detailText.range(activeItem.brewing.hot.leafG), activeItem.brewing.hot.waterMl, detailText.range(activeItem.brewing.hot.tempC))}</p>
                                <p>{detailText.steeps(activeItem.brewing.hot.steepsSec)}</p>
                              </div>
                            )}
                            {activeItem.brewing.cold && (
                              <div className="product-brew-card">
                                <h5>{detailText.brewCold}</h5>
                                <p>{detailText.coldAmounts(detailText.range(activeItem.brewing.cold.leafG), activeItem.brewing.cold.waterL)}</p>
                                <p>{detailText.coldTime(detailText.range(activeItem.brewing.cold.hours))}</p>
                              </div>
                            )}
                          </div>
                        </section>
                      )}

                      {/* 3. The details, for those who want them. */}
                      {activeItem.category === "beans" && activeItem.roast && ROAST_LEVEL[activeItem.roast.en] !== undefined && (
                        <section className="product-detail-section">
                          <h4>{labels.roast}</h4>
                          <ol className="product-roast-scale" aria-label={labels.roast}>
                            {detailText.roastScale.map((step, i) => (
                              <li key={step} className={i === ROAST_LEVEL[activeItem.roast.en] ? "is-current" : ""} aria-current={i === ROAST_LEVEL[activeItem.roast.en] ? "true" : undefined}>{step}</li>
                            ))}
                          </ol>
                          <p className="product-detail-small">{detailText.roastGuide}</p>
                        </section>
                      )}
                      {DETAIL_FIELDS.some((field) => loc(activeItem[field], lang)) && (
                        <section className="product-detail-section">
                          <h4>{activeItem.category === "beans" ? detailText.beanDetails : activeItem.flavorBasis === "tea" ? detailText.teaDetails : detailText.productDetails}</h4>
                          {activeItem.farm && <p className="product-detail-story">{loc(activeItem.farm, lang)}</p>}
                          <dl className="product-specs product-specs-classic">
                            {DETAIL_FIELDS.map((field) => renderSpecRow(labels[field], activeItem[field]))}
                          </dl>
                          {activeItem.flavorNotes && (
                            <p className="product-detail-small">
                              {activeItem.flavorBasis === "direction" ? detailText.flavorDirection
                                : activeItem.flavorBasis === "tea" ? detailText.teaFlavorSource : detailText.flavorSource}
                            </p>
                          )}
                        </section>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <SiteFooter lang={lang} />
      <BeanConcierge lang={lang} />
    </>
  );
}