import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import SiteFooter from "../components/SiteFooter";

const enmaSlides = [
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
];

const woodboxItems = [
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
];

export default function ProductsPage() {
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
            <p className="products-eyebrow">Products</p>
            <h1>静けさの中にある、輪郭。</h1>
          </div>
        </section>

        <header className="products-page-header">
          <div className="products-page-header-spacer" />

          <Link to="/" className="products-page-brand">
            Ryuge Coffee
          </Link>

          <div className="lang-switch">
            <button className="active">JA</button>
            <button>EN</button>
            <button>ES</button>
          </div>
        </header>

        <section className="products-showcase-section">
          <div className="products-section-heading products-heading-animate">
            <p className="products-section-label">Enma</p>
            <h2>閻魔</h2>
          </div>

          <div className="products-enma-grid">
            {enmaSlides.map((slide, index) => (
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
            <p>苦味は、強さではない。</p>
            <h2>深さである。</h2>
          </div>
        </section>

        <section className="products-showcase-section">
          <div
            ref={woodboxHeadingRef}
            className={`products-section-heading ${
              woodboxHeadingVisible ? "products-heading-animate" : ""
            }`}
          >
            <p className="products-section-label">Wood Box</p>
            <h2>木棺</h2>
          </div>

          <div className="products-simple-grid products-two-col">
            {woodboxItems.map((item, index) => (
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
            <p className="products-section-label">ORIORI</p>
            <h2>折々</h2>
            <p className="oriori-intro">
              折々の時間に寄り添う、三つの静かなサービス
            </p>
          </div>

          <div className="oriori-services-grid">
            <article className="oriori-service-card">
              <div className="oriori-service-visual">
                <img src="/images/oriori-1.jpg" alt="サブスクリプション" />
              </div>
              <div className="oriori-service-copy">
                <h3>サブスクリプション</h3>
                <p>月ごとの移ろいを、折々の流れにあわせて届けます。</p>
              </div>
            </article>

            <article className="oriori-service-card">
              <div className="oriori-service-visual">
                <img src="/images/oriori-2.jpg" alt="ドリップバッグ" />
              </div>
              <div className="oriori-service-copy">
                <h3>ドリップバッグ</h3>
                <p>日々の合間に、龍華の輪郭を静かに味わう一杯です。</p>
              </div>
            </article>

            <article className="oriori-service-card">
              <div className="oriori-service-visual">
                <img src="/images/atmosphere-2.jpg" alt="フレーバーホイール" />
              </div>
              <div className="oriori-service-copy">
                <h3>フレーバーホイール</h3>
                <p>味わいを言葉にするための、記録と発見のためのサイトです。</p>
              </div>
            </article>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}