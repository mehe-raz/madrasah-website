import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useGuardianAuth } from "../context/GuardianAuthContext";
import { useMadrasaBranding } from "../hooks/useMadrasaBranding";
import { api } from "../lib/api";
import { GuardianMessengerBubble } from "./GuardianMessengerBubble";
import { GuardianPushSetup } from "./GuardianPushSetup";
import { HudSpinner } from "./HudSpinner";
import type { GuardianDashboardChild } from "../types";

export interface GuardianShellContext {
  children: GuardianDashboardChild[];
  selected: GuardianDashboardChild | null;
  selectChild: (id: number) => void;
  unreadCount: number;
  refresh: () => void;
}

const NAV_ITEMS = [
  { to: "/guardian", label: "ড্যাশবোর্ড", icon: "🏠", end: true },
  { to: "/guardian/attendance", label: "উপস্থিতি", icon: "📅" },
  { to: "/guardian/results", label: "ফলাফল", icon: "📄" },
  { to: "/guardian/feed", label: "নোটিশ", icon: "📣" },
];

export function GuardianShell() {
  const { user, logout, refresh } = useGuardianAuth();
  const { name: madrasaName, logo } = useMadrasaBranding();
  const navigate = useNavigate();
  const [children, setChildren] = useState<GuardianDashboardChild[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = () => {
    api
      .guardian.getDashboard()
      .then((d) => {
        setLoadError("");
        setChildren(d.children);
        setUnreadCount(d.unreadCount);
        setSelectedId((prev) => (prev && d.children.some((c) => c.id === prev) ? prev : d.children[0]?.id ?? null));
      })
      .catch((err) => {
        // A genuinely empty children array (every child-link still pending
        // Admin approval) resolves fine above and is a valid state the
        // dashboard page's own empty-state message already covers. This
        // catch only runs when the *request itself* failed — a dead
        // session should send the guardian back to login instead of
        // silently rendering as "no children connected" (which looked
        // identical to actually having no linked student and made a
        // session problem indistinguishable from a real disconnect). Any
        // other failure (network/server error) surfaces so the guardian
        // knows to retry instead of concluding the link is gone.
        if (err instanceof Error && err.message === "UNAUTHORIZED") {
          // Clear the session in GuardianAuthContext (refresh() re-checks
          // /guardian-auth/me and sets user to null when that also 401s)
          // instead of navigating here directly. If `user` were left
          // stale/truthy while we navigate to /guardian/login,
          // GuardianLogin's own `if (user) return <Navigate to="/guardian" />`
          // would immediately send the browser right back here — an
          // infinite redirect loop between the login page and this
          // dashboard, which is indistinguishable from a stuck spinner.
          // GuardianProtectedRoute (the parent route) reacts to `user`
          // becoming null and performs the actual redirect to login once,
          // cleanly.
          refresh();
          return;
        }
        setLoadError(err instanceof Error ? err.message : "তথ্য লোড করা যায়নি");
      })
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount; navigate (from useNavigate) is stable across renders
  useEffect(load, []);

  const handleLogout = async () => {
    await logout();
    navigate("/guardian/login");
  };

  if (loading) {
    return (
      <div className="full-page-loader">
        <HudSpinner size={56} />
      </div>
    );
  }

  const selected = children.find((c) => c.id === selectedId) ?? null;
  const context: GuardianShellContext = { children, selected, selectChild: setSelectedId, unreadCount, refresh: load };

  return (
    <div className="guardian-shell">
      <header className="guardian-header">
        <div className="guardian-header__row">
          <div className="guardian-header__brand">
            {logo ? (
              <img src={logo} alt="" className="guardian-header__logo" />
            ) : (
              <span className="guardian-header__logo-emoji">🕌</span>
            )}
            <div className="guardian-header__brand-text">
              <div className="guardian-header__name">{madrasaName}</div>
              <div className="guardian-header__sub">অভিভাবক পোর্টাল · {user?.name}</div>
            </div>
          </div>
          <button type="button" onClick={handleLogout} className="pill guardian-logout-btn">
            লগআউট
          </button>
        </div>

        {children.length > 1 && (
          <div className="guardian-child-tabs">
            {children.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={`pill guardian-tab${c.id === selectedId ? " guardian-tab--active" : ""}`}
              >
                {c.name} · {c.class}
              </button>
            ))}
          </div>
        )}

        <nav className="guardian-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `guardian-navlink${isActive ? " guardian-navlink--active" : ""}`}
            >
              <span className="guardian-nav-icon">
                {item.icon}
                {item.to === "/guardian/feed" && unreadCount > 0 && (
                  <span className="guardian-nav-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
                )}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="guardian-main">
        {loadError && (
          <div className="soft-panel guardian-error-box">
            {loadError}{" "}
            <button type="button" onClick={load} className="guardian-link-btn">
              আবার চেষ্টা করুন
            </button>
          </div>
        )}
        <Outlet context={context} />
      </main>

      {/* Guardian Reminder Messenger — persistent floating bubble, rendered
          once at the shell root (not inside <main>) so it stays visible
          across every guardian route, same reasoning as the nav above. */}
      <GuardianMessengerBubble />
      {/* Push Notifications setup — headless, renders nothing. Runs once
          per login session to (re)subscribe this browser for Web Push;
          see the component's own comment for why it never blocks/breaks
          anything if unsupported/declined. */}
      <GuardianPushSetup />
    </div>
  );
}
