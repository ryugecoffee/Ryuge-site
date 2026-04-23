// src/components/wholesale/WholesaleProductCard.jsx
import { useAuth } from "../../contexts/AuthContext";

export default function WholesaleProductCard({
  product,
  quantity = 0,
  onAdd,
  onRemove,
  onOpenDetail,
}) {
  const { approved } = useAuth();

  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.08)",
        backgroundColor: "#0b0b0b",
        display: "flex",
        flexDirection: "column",
        transition: "border-color 0.25s ease",
        cursor: "pointer",
      }}
      onClick={onOpenDetail}
      onMouseEnter={(e) =>
        (e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")
      }
    >
      {/* 画像 */}
      <div
        style={{
          aspectRatio: "1 / 1",
          overflow: "hidden",
          backgroundColor: "#050505",
        }}
      >
        {product.image && (
          <img
            src={product.image}
            alt={product.name}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: 0.85,
            }}
          />
        )}
      </div>

      {/* テキスト */}
      <div
        style={{
          padding: "1rem",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "0.4rem",
        }}
      >
        <p
          style={{
            fontSize: "0.9rem",
            margin: 0,
            color: "rgba(255,255,255,0.92)",
            letterSpacing: "0.04em",
            lineHeight: 1.4,
          }}
        >
          {product.name}
        </p>

        {product.subtitle && (
          <p
            style={{
              fontSize: "0.65rem",
              color: "rgba(255,255,255,0.45)",
              margin: 0,
              letterSpacing: "0.05em",
            }}
          >
            {product.subtitle}
          </p>
        )}

        {product.description && (
          <p
            style={{
              fontSize: "0.68rem",
              color: "rgba(255,255,255,0.5)",
              margin: 0,
              lineHeight: 1.7,
            }}
          >
            {product.description}
          </p>
        )}

        {/* 下部 */}
        <div
          style={{
            marginTop: "auto",
            paddingTop: "0.8rem",
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {approved ? (
            <>
              <p
                style={{
                  fontSize: "0.9rem",
                  color: "rgba(255,255,255,0.92)",
                  margin: "0 0 0.7rem",
                  letterSpacing: "0.04em",
                }}
              >
                ¥{product.wholesalePrice?.toLocaleString()}
                <span
                  style={{
                    fontSize: "0.6rem",
                    color: "rgba(255,255,255,0.35)",
                    marginLeft: "0.3rem",
                  }}
                >
                  / {product.unit}
                </span>
              </p>

              {quantity === 0 ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAdd();
                  }}
                  style={{
                    width: "100%",
                    background: "none",
                    border: "1px solid rgba(255,255,255,0.18)",
                    color: "rgba(255,255,255,0.9)",
                    padding: "0.4rem 0",
                    fontSize: "0.6rem",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                  }}
                >
                  ADD
                </button>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <button
                    style={qtyBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove();
                    }}
                  >
                    −
                  </button>

                  <span
                    style={{
                      fontSize: "0.85rem",
                      color: "rgba(255,255,255,0.9)",
                    }}
                  >
                    {quantity}
                  </span>

                  <button
                    style={qtyBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAdd();
                    }}
                  >
                    ＋
                  </button>
                </div>
              )}
            </>
          ) : (
            <p
              style={{
                fontSize: "0.65rem",
                color: "rgba(255,255,255,0.3)",
                margin: 0,
                letterSpacing: "0.04em",
              }}
            >
              Login to view price
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const qtyBtn = {
  width: "26px",
  height: "26px",
  background: "none",
  border: "1px solid rgba(255,255,255,0.18)",
  color: "rgba(255,255,255,0.9)",
  cursor: "pointer",
  fontSize: "0.9rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};