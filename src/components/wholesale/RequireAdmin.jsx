// src/components/wholesale/RequireAdmin.jsx
import { Navigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

export default function RequireAdmin({ children }) {
  const { user, isAdmin, loading } = useAuth();

  if (loading) {
    return <div className="wholesale-loading">Loading...</div>;
  }

  if (!user || !isAdmin) {
    return <Navigate to="/wholesale-jp" replace />;
  }

  return children;
}
