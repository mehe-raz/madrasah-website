import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useGuardianAuth } from "../context/GuardianAuthContext";
import { HudSpinner } from "./HudSpinner";

export function GuardianProtectedRoute() {
  const { user, loading } = useGuardianAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="full-page-loader">
        <HudSpinner size={56} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/guardian/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
