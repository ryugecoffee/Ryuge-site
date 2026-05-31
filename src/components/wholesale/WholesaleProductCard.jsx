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
    <div className="wsp-card" onClick={onOpenDetail}>
      <div className="wsp-card-image">
        {product.image && (
          <img src={product.image} alt={product.name} />
        )}
      </div>

      <div className="wsp-card-body">
        <p className="wsp-card-name">{product.name}</p>
        <p className="wsp-card-subtitle">{product.subtitle || " "}</p>
        <p className="wsp-card-description">{product.description || " "}</p>

        <div className="wsp-card-footer">
          {approved ? (
            <>
              <p className="wsp-card-price">
                ¥{product.wholesalePrice?.toLocaleString()}
                <span className="wsp-card-price-unit">/ {product.unit}</span>
              </p>

              {quantity === 0 ? (
                <button
                  className="wsp-card-add"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAdd();
                  }}
                >
                  ADD
                </button>
              ) : (
                <div className="wsp-card-qty" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="wsp-card-qty-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove();
                    }}
                  >
                    −
                  </button>
                  <span className="wsp-card-qty-count">{quantity}</span>
                  <button
                    className="wsp-card-qty-btn"
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
            <p className="wsp-card-locked">Login to view price</p>
          )}
        </div>
      </div>
    </div>
  );
}
