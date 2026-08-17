// client/src/pages/kiosk/Kiosk.tsx
// ============================================================================
// Attendance device kiosk monitor (docs/ATTENDANCE_DEVICE_PLAN.md, Phase 4)
// ============================================================================
// A tablet is mounted above each fingerprint/card device, always open to
// `/kiosk/:deviceId`. It has no login of its own — this route sits outside
// <ProtectedRoute> in App.tsx, same as /result — and just polls
// GET /api/device/latest-punch/:deviceId (Phase 2) every ~2s to show the
// most recent scan (plan doc section 3: polling, not WebSocket, so no new
// dependency). Idle screen shows a clock + the institution's name/logo
// (usePublicSite, same hook every public page already uses).
//
// An unmatched scan (fingerprint/card not linked to any student) is logged
// with matched:false (server/src/routes/deviceAttendance.js's POST /punch,
// 2026-08-12 fix) and shown here as "শিক্ষার্থী খুঁজে পাওয়া যায়নি" — same
// idle/punch/hide cycle as a normal match.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { usePublicSite } from "../../hooks/usePublicSite";
import { api } from "../../lib/api";
import { classTreeLabel } from "../../lib/classTree";
import { cloudinaryResize } from "../../lib/cloudinaryImage";
import type { ClassTreeNode, KioskPunch } from "../../types";

const POLL_INTERVAL_MS = 2000;
// How long a punch stays on screen before the kiosk returns to idle — plan
// doc section 4 says "২-৩ সেকেন্ড পর আবার idle-এ ফেরত".
const DISPLAY_DURATION_MS = 3000;

// Matches the exact string server/src/routes/deviceAttendance.js's
// GET /latest-punch/:deviceId sends on a 404 — used to tell "this kiosk
// isn't linked to any device" apart from an ordinary network blip, which
// should just retry silently on the next poll instead of alarming whoever
// is watching the tablet.
const DEVICE_NOT_FOUND_MESSAGE = "ডিভাইস খুঁজে পাওয়া যায়নি";

function formatClock(date: Date): string {
  return date.toLocaleTimeString("bn-BD", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("bn-BD", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function formatPunchTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("bn-BD", { hour: "2-digit", minute: "2-digit" });
}

export function Kiosk() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const { site } = usePublicSite();
  const [now, setNow] = useState(() => new Date());
  const [punch, setPunch] = useState<KioskPunch | null>(null);
  const [deviceMissing, setDeviceMissing] = useState(false);
  const lastPunchAtRef = useRef<string | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Same public/unauthenticated endpoint the result-lookup and admission
  // pages use — this kiosk screen has no login (see file header), so it
  // fetches its own copy to turn punch.student.class (a raw `en`
  // data-layer value) into its বাংলা label.
  const [classTree, setClassTree] = useState<ClassTreeNode[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.getPublicClassTree().then((tree) => {
      if (!cancelled) setClassTree(tree);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;

    async function poll() {
      try {
        const data = await api.device.getLatestPunch(deviceId!);
        if (cancelled) return;
        setDeviceMissing(false);
        if (data.punch && data.punch.punchAt !== lastPunchAtRef.current) {
          lastPunchAtRef.current = data.punch.punchAt;
          setPunch(data.punch);
          if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
          hideTimerRef.current = setTimeout(() => setPunch(null), DISPLAY_DURATION_MS);
        }
      } catch (err) {
        if (cancelled) return;
        // Any other error (offline, DNS hiccup, transient 5xx) is left
        // alone — the next poll two seconds later retries on its own, and
        // flashing an error screen for a momentary blip would be more
        // distracting than useful on a wall-mounted display.
        if (err instanceof Error && err.message === DEVICE_NOT_FOUND_MESSAGE) {
          setDeviceMissing(true);
        }
      }
    }

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [deviceId]);

  if (deviceMissing) {
    return (
      <div className="kiosk kiosk--error">
        <p className="kiosk__error-title">এই স্ক্রিনটি কোনো হাজিরা-ডিভাইসের সাথে যুক্ত নেই</p>
        <p className="kiosk__error-desc">সেটিংস থেকে ডিভাইস আইডি যাচাই করুন।</p>
      </div>
    );
  }

  return (
    <div className="kiosk">
      {punch ? (
        <div className="kiosk__punch" key={punch.punchAt}>
          {punch.matched && punch.type === "student" && punch.student ? (
            <>
              {punch.student.photo ? (
                <img
                  className="kiosk__photo"
                  src={cloudinaryResize(punch.student.photo, "f_auto,q_auto,w_500")}
                  alt={punch.student.name}
                />
              ) : (
                <div className="kiosk__photo kiosk__photo--placeholder">{punch.student.name.charAt(0)}</div>
              )}
              <p className="kiosk__name">{punch.student.name}</p>
              <p className="kiosk__meta">
                {[classTreeLabel(classTree, punch.student.class), punch.student.section].filter(Boolean).join(" - ")} · রোল {punch.student.roll}
              </p>
              <p className="kiosk__punch-time">{formatPunchTime(punch.punchAt)}-এ প্রবেশ করেছে</p>
            </>
          ) : punch.matched && punch.type === "staff" && punch.staff ? (
            // docs/STAFF_ATTENDANCE_PLAN.md, Phase 7 — same layout as the
            // student branch above, minus a photo (staff photo upload isn't
            // wired up yet, see types/index.ts's Staff comment) and roll
            // number (staff have no roll).
            <>
              <div className="kiosk__photo kiosk__photo--placeholder">{punch.staff.name.charAt(0)}</div>
              <p className="kiosk__name">{punch.staff.name}</p>
              <p className="kiosk__meta">{[punch.staff.designation, classTreeLabel(classTree, punch.staff.class)].filter(Boolean).join(" - ")}</p>
              <p className="kiosk__punch-time">{formatPunchTime(punch.punchAt)}-এ প্রবেশ করেছে</p>
            </>
          ) : (
            <>
              <div className="kiosk__photo kiosk__photo--unmatched">?</div>
              <p className="kiosk__name">খুঁজে পাওয়া যায়নি</p>
              <p className="kiosk__meta">এই ফিঙ্গারপ্রিন্ট/কার্ড কোনো শিক্ষার্থী বা স্টাফের সাথে যুক্ত নেই</p>
            </>
          )}
        </div>
      ) : (
        <div className="kiosk__idle">
          {site.logo && <img className="kiosk__logo" src={site.logo} alt={site.name} />}
          <p className="kiosk__institution">{site.name}</p>
          <p className="kiosk__clock">{formatClock(now)}</p>
          <p className="kiosk__date">{formatDate(now)}</p>
          <p className="kiosk__hint">ফিঙ্গারপ্রিন্ট/কার্ড স্ক্যান করুন</p>
        </div>
      )}
    </div>
  );
}
