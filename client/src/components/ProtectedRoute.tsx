import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/AppSettingsContext";
import { canAccess, firstAllowedPath, type Permission } from "../lib/permissions";
import { C } from "../theme/colors";
import { Home } from "../pages/Home";

const PATH_PERMISSION: Record<string, Permission> = {
  "/": "dashboard",
  "/students": "students",
  "/attendance": "attendance",
  "/income": "income",
  "/expenses": "expenses",
  "/hifz": "hifz",
  "/reports": "reports",
  "/website": "website",
  "/settings": "settings",
};

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg)" }}>
        <p style={{ color: C.muted }}>{t.common.loading}</p>
      </div>
    );
  }

  if (!user) {
    // Visitors landing on the site itself see the public institution page
    // instead of being bounced straight to the login form. Deep links into
    // other protected sections still redirect to login as before.
    if (location.pathname === "/") return <Home />;
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const perm = Object.entries(PATH_PERMISSION).find(([path]) => (path === "/" ? location.pathname === "/" : location.pathname.startsWith(path)))?.[1];
  if (perm && !canAccess(user.role, perm)) {
    return <Navigate to={firstAllowedPath(user.role)} replace />;
  }

  return <Outlet />;
}
