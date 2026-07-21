import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useAppSettings } from "../context/AppSettingsContext";
import { useMadrasaBranding } from "../hooks/useMadrasaBranding";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function Layout() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 768px)").matches);
  const [sidebarOpen, setSidebarOpen] = useState(() => !window.matchMedia("(max-width: 768px)").matches);
  const { user, logout } = useAuth();
  const { settings } = useAppSettings();
  useMadrasaBranding();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const media = window.matchMedia("(max-width: 768px)");
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", settings.theme === "dark" ? "dark" : "light");
  }, [settings.theme]);


  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [location.pathname, isMobile]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  if (!user) return null;

  return (
    <div
      className="app-shell"
      style={{
        display: "flex",
        height: "100vh",
        background: "var(--bg)",
        fontFamily: "'Noto Sans Bengali', 'Noto Sans', sans-serif",
        overflow: isMobile ? "auto" : "hidden",
      }}
    >
      <Sidebar
        open={sidebarOpen}
        user={user}
        onNavigate={() => {
          if (isMobile) setSidebarOpen(false);
        }}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        <Topbar onToggleSidebar={() => setSidebarOpen((o) => !o)} onLogout={handleLogout} />
        <main className="main-content" style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
