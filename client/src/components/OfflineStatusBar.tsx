import { useLanguage } from "../context/AppSettingsContext";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

/**
 * Renders nothing while online with an empty outbox — this only appears
 * when there's something the user actually needs to know: no connection,
 * and/or entries still waiting to reach the server.
 *
 * Placed once in Layout.tsx so it's visible across every authenticated
 * screen rather than duplicated per page.
 */
export function OfflineStatusBar() {
  const { online, pendingCount } = useOnlineStatus();
  const { t, tr } = useLanguage();

  if (online && pendingCount === 0) return null;

  return (
    <div
      role="status"
      className={`offline-bar ${online ? "offline-bar--online" : "offline-bar--offline"}`}
    >
      <span aria-hidden className="offline-bar__dot" />
      <span>{online ? t.offline.online : t.offline.offline}</span>
      {pendingCount > 0 && (
        <span className="offline-bar__pending">
          · {tr("offline.pendingSync", { count: pendingCount })}
        </span>
      )}
    </div>
  );
}
