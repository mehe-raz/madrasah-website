// client/src/components/PrayerTimesWidget.tsx
//
// Namaz-time widget for every logged-in dashboard (staff/admin Dashboard.tsx
// and guardian GuardianDashboard.tsx both render this). Fetches today's
// timings + Hijri/Bangla date from the public, unauthenticated
// /api/public/prayer-times endpoint (server/src/lib/prayerTimes.js) — public
// because guardians and staff authenticate through two different systems,
// and namaz timings aren't sensitive data anyway.
//
// "Current waqt" (which prayer period we're in right now, how far through
// it, and how long until the next one starts) is computed client-side from
// the five fixed daily timings, and re-computed every 30s via setInterval so
// the progress bar/countdown stay live without a page refresh.
//
// Styling follows AGENTS.md "Design System (mandatory)": named classes in
// index.css, not raw style={{...}} on native elements — the progress bar's
// fill width is the only genuinely per-instance dynamic value, so that's
// the only inline style, same pattern as Dashboard.tsx's camera-status-row
// dot color.
import { useEffect, useState } from "react";
import { Card } from "./ui";
import { api } from "../lib/api";
import { Icons } from "../lib/icons";
import { useLanguage } from "../context/AppSettingsContext";
import { toBn12Hour, toBnDigits } from "../lib/banglaDigits";
import type { PrayerTimesData } from "../types";

type WaqtKey = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";

const WAQT_ORDER: WaqtKey[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

const WAQT_LABEL_BN: Record<WaqtKey, string> = {
  fajr: "ফজর",
  dhuhr: "যোহর",
  asr: "আসর",
  maghrib: "মাগরিব",
  isha: "এশা",
};

const WAQT_LABEL_EN: Record<WaqtKey, string> = {
  fajr: "Fajr",
  dhuhr: "Dhuhr",
  asr: "Asr",
  maghrib: "Maghrib",
  isha: "Isha",
};

function toMinutes(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

// Figures out which waqt "contains" the current time, how far through it we
// are (0-100%), and how many minutes remain until the next one. Isha wraps
// past midnight into tomorrow's Fajr, so that span is handled specially
// (isBeforeFirst = we're before today's first known waqt, i.e. still in
// last night's Isha).
function computeCurrentWaqt(timings: PrayerTimesData["timings"]) {
  const minutesByWaqt = Object.fromEntries(
    WAQT_ORDER.map((k) => [k, toMinutes(timings[k])])
  ) as Record<WaqtKey, number | null>;

  const now = nowMinutes();
  const known = WAQT_ORDER.filter((k) => minutesByWaqt[k] !== null);
  if (known.length === 0) return null;

  let current: WaqtKey = known[known.length - 1];
  let idx = known.length - 1;
  for (let i = 0; i < known.length; i++) {
    const start = minutesByWaqt[known[i]] as number;
    if (start <= now) {
      current = known[i];
      idx = i;
    }
  }

  const isBeforeFirst = (minutesByWaqt[known[0]] as number) > now;
  const startMin = isBeforeFirst
    ? (minutesByWaqt[known[known.length - 1]] as number) - 1440 // yesterday's Isha
    : (minutesByWaqt[current] as number);
  const nextKey = isBeforeFirst ? known[0] : known[(idx + 1) % known.length];
  const rawEnd = minutesByWaqt[nextKey] as number;
  const endMin = isBeforeFirst ? rawEnd : rawEnd > startMin ? rawEnd : rawEnd + 1440;

  const total = endMin - startMin;
  const elapsed = Math.min(Math.max(now - startMin, 0), total);
  const percent = total > 0 ? Math.round((elapsed / total) * 100) : 0;
  const remainingMin = Math.max(endMin - now, 0);

  return {
    current: isBeforeFirst ? known[known.length - 1] : current,
    next: nextKey,
    percent,
    remainingMin: remainingMin % 1440,
  };
}

function formatRemaining(mins: number, lang: "bn" | "en"): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (lang === "en") {
    return h > 0 ? `${h}h ${m}m remaining` : `${m}m remaining`;
  }
  const hBn = toBnDigits(h);
  const mBn = toBnDigits(m);
  return h > 0 ? `${hBn} ঘণ্টা ${mBn} মিনিট বাকি` : `${mBn} মিনিট বাকি`;
}

export function PrayerTimesWidget() {
  const { lang } = useLanguage();
  const [data, setData] = useState<PrayerTimesData | null>(null);
  const [error, setError] = useState(false);
  const [, setTick] = useState(0); // forces a re-render every 30s so the countdown/progress stay live

  useEffect(() => {
    let cancelled = false;
    api
      .getPrayerTimes()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (error || !data) return null; // non-critical widget — fail silently rather than block the dashboard

  const waqt = computeCurrentWaqt(data.timings);
  const MoonIcon = Icons.moon;
  const SunriseIcon = Icons.sunrise;
  const SunsetIcon = Icons.sunset;

  return (
    <Card className="prayer-widget mb-24">
      <div className="prayer-widget__header">
        <div>
          <div className="prayer-widget__hijri">
            {lang === "en"
              ? `${data.date.hijri.day} ${data.date.hijri.month} ${data.date.hijri.year} AH`
              : `${toBnDigits(data.date.hijri.day)} ${data.date.hijri.month} ${toBnDigits(data.date.hijri.year)} হিজরি`}
          </div>
          <div className="prayer-widget__bangla">
            {lang === "en"
              ? `${data.date.weekdayBn} · ${data.date.bangla.day} ${data.date.bangla.month} ${data.date.bangla.year} বঙ্গাব্দ`
              : `${data.date.weekdayBn}, ${toBnDigits(data.date.bangla.day)} ${data.date.bangla.month} ${toBnDigits(data.date.bangla.year)} বঙ্গাব্দ`}
          </div>
        </div>
        <div className="prayer-widget__location">
          <MoonIcon size={14} aria-hidden="true" />
          {data.city}
        </div>
      </div>

      <div className="prayer-widget__grid">
        {WAQT_ORDER.map((k) => (
          <div key={k} className={`prayer-widget__tile${waqt?.current === k ? " prayer-widget__tile--active" : ""}`}>
            <div className="prayer-widget__tile-label">{lang === "en" ? WAQT_LABEL_EN[k] : WAQT_LABEL_BN[k]}</div>
            <div className="prayer-widget__tile-time">{lang === "en" ? (data.timings[k] || "--:--") : toBn12Hour(data.timings[k])}</div>
          </div>
        ))}
      </div>

      <div className="prayer-widget__sun-row">
        <span className="prayer-widget__sun-item">
          <SunriseIcon size={14} aria-hidden="true" />
          {lang === "en" ? (data.timings.sunrise || "--:--") : toBn12Hour(data.timings.sunrise)}
        </span>
        <span className="prayer-widget__sun-item">
          <SunsetIcon size={14} aria-hidden="true" />
          {lang === "en" ? (data.timings.maghrib || "--:--") : toBn12Hour(data.timings.maghrib)}
        </span>
      </div>

      {waqt && (
        <div>
          <div className="prayer-widget__progress-row">
            <span className="prayer-widget__progress-label">
              {lang === "en" ? `${WAQT_LABEL_EN[waqt.current]} — ongoing` : `${WAQT_LABEL_BN[waqt.current]} ওয়াক্ত চলমান`}
            </span>
            <span className="prayer-widget__progress-remaining">{formatRemaining(waqt.remainingMin, lang === "en" ? "en" : "bn")}</span>
          </div>
          <div className="prayer-widget__progress-track">
            {/* Fill width is the one genuinely per-instance dynamic value here
                (how far through the current waqt we are) — can't be a static
                class. Same pattern as Dashboard.tsx's camera-status-row dot. */}
            {/* eslint-disable-next-line no-restricted-syntax -- dynamic progress percentage */}
            <div className="prayer-widget__progress-fill" style={{ width: `${waqt.percent}%` }} />
          </div>
        </div>
      )}
    </Card>
  );
}
