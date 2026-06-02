// src/components/wholesale/RequireApproved.jsx
import { Navigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

export default function RequireApproved({ children }) {
  const { user, approved, isAdmin, loading } = useAuth();

  // Firestore フェッチ完了まで待機
  if (loading) {
    return <div className="wholesale-loading">Loading...</div>;
  }

  // 未ログイン → ログインページへ
  if (!user) {
    return <Navigate to="/wholesale-jp/login" replace />;
  }

  // approved または isAdmin であれば通過
  if (approved || isAdmin) {
    return children;
  }

  // 未承認（pending / rejected）→ ログインページへ戻す
  // ログインページ側で「承認待ち」メッセージを表示する
  return <Navigate to="/wholesale-jp/login" replace />;
}
