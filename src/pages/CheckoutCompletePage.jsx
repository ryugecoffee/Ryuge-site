import { Link } from "react-router-dom";

export default function CheckoutCompletePage() {
  return (
    <div className="checkout-page">
      <div className="checkout-inner checkout-complete-inner">
        <p className="checkout-eyebrow">Complete</p>
        <h1 className="checkout-title">ご注文ありがとうございます</h1>
        <p className="checkout-complete-text">
          ご注文を承りました。発送準備が整い次第、ご連絡いたします。
        </p>
        <Link to="/products" className="checkout-back-to-products">
          商品ページへ戻る
        </Link>
      </div>
    </div>
  );
}