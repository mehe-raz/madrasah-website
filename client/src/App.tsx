import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";
import { useLanguage } from "./context/AppSettingsContext";

const Attendance = lazy(() => import("./modules/Attendance").then((m) => ({ default: m.Attendance })));
const Dashboard = lazy(() => import("./modules/Dashboard").then((m) => ({ default: m.Dashboard })));
const Expenses = lazy(() => import("./modules/Expenses").then((m) => ({ default: m.Expenses })));
const HifzTracking = lazy(() => import("./modules/HifzTracking").then((m) => ({ default: m.HifzTracking })));
const Income = lazy(() => import("./modules/Income").then((m) => ({ default: m.Income })));
const Reports = lazy(() => import("./modules/Reports").then((m) => ({ default: m.Reports })));
const Settings = lazy(() => import("./modules/Settings").then((m) => ({ default: m.Settings })));
const Students = lazy(() => import("./modules/Students").then((m) => ({ default: m.Students })));
const Website = lazy(() => import("./modules/Website").then((m) => ({ default: m.Website })));
const Login = lazy(() => import("./pages/Login").then((m) => ({ default: m.Login })));
const ResetPassword = lazy(() => import("./pages/ResetPassword").then((m) => ({ default: m.ResetPassword })));

function PageFallback() {
  const { t } = useLanguage();
  return <div style={{ minHeight: 160, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>{t.common.loading}</div>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="students" element={<Students />} />
                <Route path="attendance" element={<Attendance />} />
                <Route path="income" element={<Income />} />
                <Route path="fees" element={<Navigate to="/income" replace />} />
                <Route path="expenses" element={<Expenses />} />
                <Route path="hifz" element={<HifzTracking />} />
                <Route path="reports" element={<Reports />} />
                <Route path="website" element={<Website />} />
                <Route path="settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
