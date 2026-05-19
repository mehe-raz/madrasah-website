import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { canAccess, firstAllowedPath, type Permission } from "../lib/permissions";
import { C } from "../theme/colors";

const PATH_PERMISSION: Record<string, Permission> = {
  "/": "dashboard",
  "/students": "students",
  "/attendance": "attendance",
  "/income": "income",
  "/expenses": "expenses",
  "/hifz": "hifz",
  "/reports": "reports",
  "/settings": "settings",
};

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg)" }}>
        <p style={{ color: C.muted }}>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const perm = PATH_PERMISSION[location.pathname];
  if (perm && !canAccess(user.role, perm)) {
    return <Navigate to={firstAllowedPath(user.role)} replace />;
  }

  return <Outlet />;
}
