// src/components/wholesale/WholesaleProductCard.jsx
import { useAuth } from "../../contexts/AuthContext";

export default function WholesaleProductCard({ product, quantity = 0, onAdd, onRemove }) {
  const { approved } = useAuth();

  return (
    <div
      style={{
        border: "1px solid #3a3a3a",
        borderRadius: "2px",
        overflow: "hidden",
        backgroundColor: "#333",
        display: "flex",
        flexDirection: "column",
        transition: "border-color 0.25s ease",
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "#555"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "#3a3a3a"}
    >
      <div style={{ aspectRatio: "1 / 1", overflow: "hidden", backgroundColor: "#3a3a3a" }}>
        {product.image && (
          <img
            src={product.image}
            alt={product.name}
            style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.9 }}
          />
        )}
      </div>

      <div style={{ padding: "1.2rem 1rem", flex: 1, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        <p style={{
          fontSize: "0.85rem",
          fontWeight: 500,
          margin: 0,
          color: "#e8e2d9",
          letterSpacing: "0.04em",
          lineHeight: 1.5,
        }}>
          {product.name}
        </p>

        {product.description && (
          <p style={{
            fontSize: "0.7rem",
            color: "#777",
            margin: 0,
            lineHeight: 1.9,
          }}>
            {product.description}
          </p>
        )}

        <div style={{
          marginTop: "auto",
          paddingTop: "0.8rem",
          borderTop: "1px solid #3a3a3a",
        }}>
          {approved ? (
            <>
              <p style={{
                fontSize: "0.95rem",
                color: "#e8e2d9",
                margin: "0 0 0.8rem",
                letterSpacing: "0.04em",
              }}>
                ¥{product.wholesalePrice?.toLocaleString()}
                <span style={{ fontSize: "0.65rem", color: "#666", marginLeft: "0.4rem" }}>
                  / {product.unit ?? "個"}（税抜）
                </span>
              </p>

              {/* カート操作 */}
              {quantity === 0 ? (
                <button
                  onClick={onAdd}
                  style={{
                    fontSize: "0.62rem",
                    color: "#e8e2d9",
                    background: "none",
                    border: "1px solid #555",
                    padding: "0.35rem 1rem",
                    cursor: "pointer",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    fontFamily: "Cormorant Garamond, serif",
                    transition: "border-color 0.2s",
                    width: "100%",
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "#e8e2d9"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "#555"}
                >
                  カートに追加
                </button>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
                  <button
                    onClick={onRemove}
                    style={{
                      width: "28px",
                      height: "28px",
                      background: "none",
                      border: "1px solid #555",
                      color: "#e8e2d9",
                      cursor: "pointer",
                      fontSize: "1rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "Cormorant Garamond, serif",
                    }}
                  >
                    −
                  </button>
                  <span style={{ fontSize: "0.85rem", color: "#e8e2d9", minWidth: "20px", textAlign: "center" }}>
                    {quantity}
                  </span>
                  <button
                    onClick={onAdd}
                    style={{
                      width: "28px",
                      height: "28px",
                      background: "none",
                      border: "1px solid #555",
                      color: "#e8e2d9",
                      cursor: "pointer",
                      fontSize: "1rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "Cormorant Garamond, serif",
                    }}
                  >
                    ＋
                  </button>
                </div>
              )}
            </>
          ) : (
            <p style={{
              fontSize: "0.68rem",
              color: "#555",
              margin: 0,
              fontStyle: "italic",
              letterSpacing: "0.04em",
            }}>
              ログイン後に価格を表示
            </p>
          )}
        </div>
      </div>
    </div>
  );
}