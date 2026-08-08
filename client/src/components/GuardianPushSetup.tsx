import { useEffect } from "react";
import { api } from "../lib/api";

// Guardian Push Notifications (docs/PUSH_NOTIFICATION_PLAN.md — Phase 3).
// Headless — renders nothing. Mounted once at GuardianShell's root
// (alongside GuardianMessengerBubble, which stays untouched) so it runs
// once per guardian login session. If the browser doesn't support Web
// Push, VAPID isn't configured server-side, or the guardian denies the
// permission prompt, this silently does nothing — the existing 45-second
// polling messenger bubble keeps working exactly as before either way.
// Push is purely additive, never a replacement.

const ASKED_KEY = "guardianPushAsked";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64Safe);
  // `new Uint8Array(length)` (unlike `Uint8Array.from(...)`) is typed as
  // Uint8Array<ArrayBuffer>, which matches DOM's BufferSource/
  // ArrayBufferView<ArrayBuffer> expectation for applicationServerKey.
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function GuardianPushSetup() {
  useEffect(() => {
    let cancelled = false;

    async function setup() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
      // Don't re-prompt on every page load if the guardian already made a
      // choice (accept or dismiss) once this browser — `Notification.
      // permission` itself already remembers "denied" forever, but a
      // dismissed (still "default") prompt would otherwise re-appear on
      // every visit, which is worse UX than the polling fallback.
      if (Notification.permission === "default" && localStorage.getItem(ASKED_KEY)) return;

      const { publicKey } = await api.guardian.getVapidPublicKey().catch(() => ({ publicKey: null }));
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
      await api.guardian
        .subscribePush({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        })
        .catch(() => {
          // Best-effort: if saving the subscription server-side fails
          // (network hiccup), the browser subscription still exists and
          // will be retried on the next mount — no user-facing error.
        });
    }

    setup();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
