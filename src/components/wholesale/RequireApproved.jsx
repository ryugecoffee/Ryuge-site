// src/components/wholesale/RequireApproved.jsx
import { Navigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

export default function RequireApproved({ children }) {
  const { user, approved, isAdmin, loading } = useAuth();

  if (loading) {
    return <div className="wholesale-loading">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/wholesale-jp/login" replace />;
  }

  if (!approved && !isAdmin) {
    return (
      <div className="wholesale-denied">
        <p>このページにアクセスする権限がありません。</p>
        <p className="wholesale-denied-note">
          承認済みアカウントでログインしてください。
        </p>
      </div>
    );
  }

  return children;
}
