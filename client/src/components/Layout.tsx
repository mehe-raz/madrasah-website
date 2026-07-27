import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useAppSettings } from "../context/AppSettingsContext";
import { useMadrasaBranding } from "../hooks/useMadrasaBranding";
import { OfflineStatusBar } from "./OfflineStatusBar";
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
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", settings.theme === "dark" ? "dark" : "light");
  }, [settings.theme]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing to route-change events from the router (an external system), not a value derivable during render
    if (isMobile) setSidebarOpen(false);
  }, [location.pathname, isMobile]);

  // While the mobile drawer is open, lock the page underneath in place.
  // Without this, the sidebar is `position: fixed` sized with `100dvh`,
  // but the page behind it can still scroll — on phones that recalculates
  // the dynamic viewport height (address bar showing/hiding) as the sidebar
  // opens, which is what made the whole background jump up and down instead
  // of staying put.
  useEffect(() => {
    if (!isMobile || !sidebarOpen) return;
    const { overflow, position, width } = document.body.style;
    const scrollY = window.scrollY;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";
    document.body.style.top = `-${scrollY}px`;
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.position = position;
      document.body.style.width = width;
      document.body.style.top = "";
      window.scrollTo(0, scrollY);
    };
  }, [isMobile, sidebarOpen]);

  const handleLogout = async () => {
    await logout();
    navigate("/");
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
      {/* Tapping outside the open mobile drawer should close it — this
          backdrop is what makes that possible, same pattern already used
          by PublicHeader.tsx's mobile menu. */}
      {isMobile && sidebarOpen && (
        <div
          className="drawer-backdrop"
          style={{ position: "fixed", inset: 0, zIndex: 40 }}
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        <Topbar onToggleSidebar={() => setSidebarOpen((o) => !o)} onLogout={handleLogout} />
        <OfflineStatusBar />
        <main className="main-content" style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
