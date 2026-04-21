// src/components/wholesale/RequireApproved.jsx
import { Navigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

export default function RequireApproved({ children }) {
  const { user, approved, loading } = useAuth();

  console.log("user:", user);
console.log("uid:", user?.uid);
console.log("approved:", approved);
console.log("loading:", loading);

  if (loading) {
    return (
      <div style={{ padding: "4rem", textAlign: "center", fontFamily: "Cormorant Garamond, serif" }}>
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/wholesale-jp/login" replace />;
  }

  if (!approved) {
    return (
      <div style={{ padding: "4rem", textAlign: "center", fontFamily: "Cormorant Garamond, serif" }}>
        <p>このページにアクセスする権限がありません。</p>
        <p style={{ fontSize: "0.9rem", xcolor: "#888", marginTop: "1rem" }}>
          承認済みアカウントでログインしてください。
        </p>
      </div>
    );
  }

  return children;
}