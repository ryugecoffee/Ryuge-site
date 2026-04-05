import { useEffect, useRef, useState } from "react";
import "./App.css";

const products = [
  {
    id: 1,
    title: "Enma",
    image: "/images/coffee.jpg",
    shortDescription:
      "A signature coffee rooted in Ryuge Coffee’s quiet, contemplative world.",
    description:
      "Enma is a core expression of Ryuge Coffee. It is designed around depth, stillness, and a sense of quiet presence. The profile aims for balance rather than loudness, allowing the cup to unfold slowly and leave a lasting impression.",
  },
  {
    id: 2,
    title: "Garden",
    image: "/images/garden.jpg",
    shortDescription:
      "A softer expression with a calm and open atmosphere.",
    description:
      "Garden represents a lighter and more open mood. It feels gentle, airy, and reflective, inspired by the relationship between nature, space, and movement. It is intended for moments that call for softness and clarity.",
  },
  {
    id: 3,
    title: "Room",
    image: "/images/room.jpg",
    shortDescription:
      "An intimate profile for quiet interiors and reflective time.",
    description:
      "Room is built around warmth and intimacy. It is the feeling of a private corner, low light, and a cup that matches a slower rhythm. The idea is to create a coffee experience that feels personal, quiet, and memorable.",
  },
];

function App() {
  const [scrolled, setScrolled] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const conceptRef = useRef(null);
  const productsRef = useRef(null);
  const contactRef = useRef(null);
  const footerRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    const targets = [
      conceptRef.current,
      productsRef.current,
      contactRef.current,
      footerRef.current,
    ].filter(Boolean);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
          }
        });
      },
      {
        threshold: 0.18,
        rootMargin: "0px 0px -40px 0px",
      }
    );

    targets.forEach((target) => observer.observe(target));

    return () => {
      targets.forEach((target) => observer.unobserve(target));
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setSelectedProduct(null);
      }
    };

    if (selectedProduct) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedProduct]);

  const openModal = (product) => {
    setSelectedProduct(product);
  };

  const closeModal = () => {
    setSelectedProduct(null);
  };

  return (
    <div className="site">
      <header className={`site-header ${scrolled ? "scrolled" : ""}`}>
        <div className="header-inner">
          <a href="#top" className="brand">
            Ryuge Coffee
          </a>

          <nav className="nav">
            <a href="#concept">Concept</a>
            <a href="#products">Products</a>
            <a href="#contact">Contact</a>
          </nav>
        </div>
      </header>

      <main>
        <section
          id="top"
          className="hero"
          style={{ backgroundImage: "url('/images/stairs.jpg')" }}
        >
          <div className="hero-overlay" />
          <div className="hero-content">
            <p className="hero-subtitle">Crafted in quiet rhythm</p>
            <h1 className="hero-title">Ryuge Coffee</h1>
            <p className="hero-copy">Another Day, Another Coffee</p>
          </div>
        </section>

        <section
          id="concept"
          ref={conceptRef}
          className="section section-animate"
        >
          <div className="section-inner narrow">
            <p className="section-kicker">Concept</p>
            <h2 className="section-title">
              Coffee shaped by stillness, place, and presence.
            </h2>
            <p className="section-text">
              Ryuge Coffee is built around quiet depth rather than noise. We care about
              atmosphere as much as flavor — how a cup sits in a room, how it opens in
              conversation, and how it lingers after the last sip.
            </p>
            <p className="section-text">
              The goal is not only to serve coffee, but to create a moment with texture,
              calm, and memory.
            </p>
          </div>
        </section>

        <section
          id="products"
          ref={productsRef}
          className="section section-animate section-alt"
        >
          <div className="section-inner">
            <div className="section-head">
              <div>
                <p className="section-kicker">Products</p>
                <h2 className="section-title">A small collection with distinct moods.</h2>
              </div>
            </div>

            <div className="product-grid">
              {products.map((product) => (
                <button
                  type="button"
                  className="product-card"
                  key={product.id}
                  onClick={() => openModal(product)}
                >
                  <div className="product-image-wrap">
                    <img
                      src={product.image}
                      alt={product.title}
                      className="product-image"
                    />
                  </div>

                  <div className="product-body">
                    <h3 className="product-title">{product.title}</h3>
                    <p className="product-description">{product.shortDescription}</p>
                    <span className="product-link">View Details</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section
          id="contact"
          ref={contactRef}
          className="section section-animate"
        >
          <div className="section-inner narrow contact-block">
            <p className="section-kicker">Contact</p>
            <h2 className="section-title">Get in touch</h2>
            <p className="section-text">
              For updates, collaborations, or inquiries, feel free to reach out.
            </p>

            <div className="contact-actions">
              <a
                href="https://instagram.com/ryuge_coffee"
                target="_blank"
                rel="noreferrer"
                className="contact-button"
              >
                Instagram
              </a>

              <a
                href="mailto:ryugecoffee@gmail.com"
                className="contact-button contact-button-secondary"
              >
                Email
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer ref={footerRef} className="site-footer section-animate">
        <div className="footer-inner">
          <div className="footer-brand-block">
            <p className="footer-brand">Ryuge Coffee</p>
            <p className="footer-copy-text">Another Day, Another Coffee</p>
          </div>

          <div className="footer-links">
            <a href="#top">Top</a>
            <a href="#concept">Concept</a>
            <a href="#products">Products</a>
            <a href="#contact">Contact</a>
          </div>

          <div className="footer-links">
            <a
              href="https://instagram.com/ryuge_coffee"
              target="_blank"
              rel="noreferrer"
            >
              Instagram
            </a>
            <a href="mailto:ryugecoffee@gmail.com">ryugecoffee@gmail.com</a>
          </div>
        </div>

        <div className="footer-bottom">
          <p>© 2026 Ryuge Coffee. All rights reserved.</p>
        </div>
      </footer>

      {selectedProduct && (
        <div className="modal-overlay" onClick={closeModal}>
          <div
            className="modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              onClick={closeModal}
              aria-label="Close modal"
            >
              ×
            </button>

            <div className="modal-image-wrap">
              <img
                src={selectedProduct.image}
                alt={selectedProduct.title}
                className="modal-image"
              />
            </div>

            <div className="modal-body">
              <p className="modal-kicker">Product</p>
              <h3 className="modal-title">{selectedProduct.title}</h3>
              <p className="modal-description">{selectedProduct.description}</p>

              <div className="modal-actions">
                <a
                  href="https://instagram.com/ryuge_coffee"
                  target="_blank"
                  rel="noreferrer"
                  className="contact-button"
                >
                  Instagram
                </a>

                <a
                  href="mailto:ryugecoffee@gmail.com"
                  className="contact-button contact-button-secondary"
                >
                  Email
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;