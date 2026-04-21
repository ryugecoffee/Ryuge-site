// src/components/wholesale/WholesaleProductCard.jsx
import { useAuth } from "../../contexts/AuthContext";

export default function WholesaleProductCard({ product }) {
  const { approved } = useAuth();

  return (
    <div style={{
      border: "1px solid #e8e2d9",
      borderRadius: "4px",
      overflow: "hidden",
      backgroundColor: "#fff",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* 商品画像 */}
      {product.image && (
        <div style={{ aspectRatio: "1 / 1", overflow: "hidden" }}>
          <img
            src={product.image}
            alt={product.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      )}

      {/* 商品情報 */}
      <div style={{ padding: "1.2rem 1rem", flex: 1, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        <p style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: "1.05rem",
          fontWeight: 500,
          margin: 0,
          color: "#2a2a2a",
        }}>
          {product.name}
        </p>

        {product.description && (
          <p style={{
            fontSize: "0.82rem",
            color: "#888",
            margin: 0,
            lineHeight: 1.6,
          }}>
            {product.description}
          </p>
        )}

        {/* 価格：approvedユーザーのみ表示 */}
        <div style={{ marginTop: "auto", paddingTop: "0.8rem" }}>
          {approved ? (
            <p style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: "1rem",
              color: "#2a2a2a",
              margin: 0,
            }}>
              ¥{product.wholesalePrice?.toLocaleString()}
              <span style={{ fontSize: "0.75rem", color: "#888", marginLeft: "0.4rem" }}>
                / {product.unit ?? "個"}（税抜）
              </span>
            </p>
          ) : (
            <p style={{
              fontSize: "0.82rem",
              color: "#aaa",
              margin: 0,
              fontStyle: "italic",
            }}>
              ログイン後に価格を表示
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
