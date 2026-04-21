// src/components/wholesale/WholesaleProductCard.jsx
import { useAuth } from "../../contexts/AuthContext";

export default function WholesaleProductCard({ product }) {
  const { approved } = useAuth();

  return (
    <div
      style={{
        border: "1px solid #ddd8d0",
        borderRadius: "3px",
        overflow: "hidden",
        backgroundColor: "#fff",
        display: "flex",
        flexDirection: "column",
        transition: "box-shadow 0.25s ease, transform 0.25s ease",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = "0 6px 24px rgba(0,0,0,0.06)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {product.image && (
        <div style={{ aspectRatio: "1 / 1", overflow: "hidden", backgroundColor: "#f0ece6" }}>
          <img
            src={product.image}
            alt={product.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      )}

      <div style={{ padding: "1.6rem 1.4rem", flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <p style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: "1rem",
          fontWeight: 500,
          margin: 0,
          color: "#2a2a2a",
          letterSpacing: "0.04em",
        }}>
          {product.name}
        </p>

        {product.description && (
          <p style={{ fontSize: "0.78rem", color: "#999", margin: 0, lineHeight: 1.9, letterSpacing: "0.03em" }}>
            {product.description}
          </p>
        )}

        <div style={{ marginTop: "auto", paddingTop: "1.2rem", borderTop: "1px solid #f0ece6" }}>
          {approved ? (
            <p style={{ fontFamily: "Cormorant Garamond, serif", fontSize: "1rem", color: "#2a2a2a", margin: 0, letterSpacing: "0.04em" }}>
              ¥{product.wholesalePrice?.toLocaleString()}
              <span style={{ fontSize: "0.7rem", color: "#aaa", marginLeft: "0.5rem", letterSpacing: "0.06em" }}>
                / {product.unit ?? "個"}（税抜）
              </span>
            </p>
          ) : (
            <p style={{ fontSize: "0.72rem", color: "#bbb", margin: 0, fontStyle: "italic", letterSpacing: "0.06em" }}>
              ログイン後に価格を表示
            </p>
          )}
        </div>
      </div>
    </div>
  );
}