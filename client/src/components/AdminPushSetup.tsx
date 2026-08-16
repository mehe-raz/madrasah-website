import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

// Admin/Super Admin push notifications — mirrors GuardianPushSetup.tsx, but
// for staff. Mounted once in Layout.tsx (the logged-in app shell) so it
// runs once per staff session. Only Super Admin is prompted: they're the
// one who needs to know the moment an automatic backup fails (see
// routes/backup.js's alertBackupFailure), not every teacher logging in.
// If the browser doesn't support Web Push, VAPID isn't configured
// server-side, or the admin denies the permission prompt, this silently
// does nothing — the in-app notification bell keeps working either way.

const ASKED_KEY = "adminPushAsked";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64Safe);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function AdminPushSetup() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user || user.role !== "Super Admin") return;
    let cancelled = false;

    async function setup() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
      if (Notification.permission === "default" && localStorage.getItem(ASKED_KEY)) return;

      const { publicKey } = await api.getPushVapidPublicKey().catch(() => ({ publicKey: null }));
      if (!publicKey || cancelled) return;

      const registration = await navigator.serviceWorker.ready;
      let permission = Notification.permission;
      if (permission === "default") {
        localStorage.setItem(ASKED_KEY, "1");
        permission = await Notification.requestPermission();
      }
      if (permission !== "granted" || cancelled) return;

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      if (cancelled) return;

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;
      await api
        .subscribePush({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        })
        .catch(() => {
          // Best-effort: the browser subscription still exists and will be
          // retried on the next mount — no user-facing error.
        });
    }

    setup();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return null;
}
