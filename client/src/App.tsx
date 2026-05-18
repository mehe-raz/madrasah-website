import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";
import { Attendance } from "./modules/Attendance";
import { Dashboard } from "./modules/Dashboard";
import { Expenses } from "./modules/Expenses";
import { HifzTracking } from "./modules/HifzTracking";
import { Income } from "./modules/Income";
import { Reports } from "./modules/Reports";
import { Settings } from "./modules/Settings";
import { Students } from "./modules/Students";
import { Login } from "./pages/Login";
import { ResetPassword } from "./pages/ResetPassword";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
