// src/components/wholesale/RequireAdmin.jsx
import { Navigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

export default function RequireAdmin({ children }) {
  const { user, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh",
        backgroundColor: "#2a2a2a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Cormorant Garamond, serif",
        color: "#666",
        fontSize: "0.75rem",
        letterSpacing: "0.1em",
      }}>
        Loading...
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <Navigate to="/wholesale-jp" replace />;
  }

  return children;
}