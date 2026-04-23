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
        minWidth: 0,
      }}
      onClick={onOpenDetail}
      onMouseEnter={(e) =>
        (e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")
      }
    >
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

      <div
        style={{
          padding: "0.5rem 0.45rem 0.45rem",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "0.22rem",
          minWidth: 0,
        }}
      >
        <p
          style={{
            fontSize: "0.62rem",
            margin: 0,
            color: "rgba(255,255,255,0.92)",
            letterSpacing: "0.02em",
            lineHeight: 1.35,
            wordBreak: "keep-all",
            overflowWrap: "anywhere",
          }}
        >
          {product.name}
        </p>

        {product.subtitle && (
          <p
            style={{
              fontSize: "0.42rem",
              color: "rgba(255,255,255,0.45)",
              margin: 0,
              letterSpacing: "0.02em",
              lineHeight: 1.35,
              overflowWrap: "anywhere",
            }}
          >
            {product.subtitle}
          </p>
        )}

        {product.description && (
          <p
            style={{
              fontSize: "0.42rem",
              color: "rgba(255,255,255,0.5)",
              margin: 0,
              lineHeight: 1.55,
              overflowWrap: "anywhere",
            }}
          >
            {product.description}
          </p>
        )}

        <div
          style={{
            marginTop: "auto",
            paddingTop: "0.4rem",
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {approved ? (
            <>
              <p
                style={{
                  fontSize: "0.6rem",
                  color: "rgba(255,255,255,0.92)",
                  margin: "0 0 0.45rem",
                  letterSpacing: "0.02em",
                  lineHeight: 1.35,
                }}
              >
                ¥{product.wholesalePrice?.toLocaleString()}
                <span
                  style={{
                    display: "block",
                    fontSize: "0.4rem",
                    color: "rgba(255,255,255,0.35)",
                    marginTop: "0.12rem",
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
                    padding: "0.24rem 0",
                    fontSize: "0.4rem",
                    letterSpacing: "0.08em",
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
                    gap: "0.18rem",
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
                      fontSize: "0.52rem",
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
                fontSize: "0.4rem",
                color: "rgba(255,255,255,0.3)",
                margin: 0,
                letterSpacing: "0.02em",
                lineHeight: 1.45,
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
  width: "18px",
  height: "18px",
  background: "none",
  border: "1px solid rgba(255,255,255,0.18)",
  color: "rgba(255,255,255,0.9)",
  cursor: "pointer",
  fontSize: "0.62rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
};