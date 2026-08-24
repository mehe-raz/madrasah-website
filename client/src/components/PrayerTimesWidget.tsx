// client/src/components/PrayerTimesWidget.tsx
//
// Namaz-time widget for every logged-in dashboard (staff/admin Dashboard.tsx
// and guardian GuardianDashboard.tsx both render this). Fetches today's
// timings + Hijri/Bangla date from the public, unauthenticated
// /api/public/prayer-times endpoint (server/src/lib/prayerTimes.js) — public
// because guardians and staff authenticate through two different systems,
// and namaz timings aren't sensitive data anyway.
//
// "Current segment" (which prayer period we're in right now, how far
// through it, and how long until the next boundary) is computed
// client-side from the daily timings, and re-computed every 30s via
// setInterval so the progress bar/countdown stay live without a page
// refresh. Sunrise is included as a real boundary even though it isn't a
// fard waqt itself — the Fajr window ends at sunrise, not at Dhuhr, so
// without this boundary the widget would keep showing "Fajr ongoing" for
// the ~6 hours between sunrise and Dhuhr.
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
// null = the sunrise-to-Dhuhr gap, when no fard waqt is current.
type SegmentKey = WaqtKey | null;

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

function toMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

interface Segment {
  key: SegmentKey;
  activeKey: SegmentKey; // the waqt tile to highlight (null = none, during the sunrise gap)
  nextKey: WaqtKey; // which waqt this segment is counting down to
  percent: number;
  remainingMin: number;
}

// Builds the day's boundary points (Fajr, Sunrise, Dhuhr, Asr, Maghrib,
// Isha) in chronological order, finds which segment "now" falls in, and
// returns progress through it + time remaining until the next boundary.
// Wraps correctly across midnight (Isha carries through to tomorrow's
// Fajr).
function computeSegment(timings: PrayerTimesData["timings"]): Segment | null {
  const points: { key: SegmentKey; min: number }[] = (
    [
      { key: "fajr" as SegmentKey, min: toMinutes(timings.fajr) },
      { key: null as SegmentKey, min: toMinutes(timings.sunrise) },
      { key: "dhuhr" as SegmentKey, min: toMinutes(timings.dhuhr) },
      { key: "asr" as SegmentKey, min: toMinutes(timings.asr) },
      { key: "maghrib" as SegmentKey, min: toMinutes(timings.maghrib) },
      { key: "isha" as SegmentKey, min: toMinutes(timings.isha) },
    ] as { key: SegmentKey; min: number | null }[]
  ).filter((p): p is { key: SegmentKey; min: number } => p.min !== null);

  if (points.length === 0) return null;
  points.sort((a, b) => a.min - b.min);

  const now = nowMinutes();
  let curIdx = points.length - 1;
  for (let i = 0; i < points.length; i++) {
    if (points[i].min <= now) curIdx = i;
  }
  const isBeforeFirst = points[0].min > now;
  if (isBeforeFirst) curIdx = points.length - 1; // still in yesterday's last segment (Isha)
  const nextIdx = (curIdx + 1) % points.length;

  const startMin = isBeforeFirst ? points[curIdx].min - 1440 : points[curIdx].min;
  let endMin = points[nextIdx].min;
  if (endMin <= startMin) endMin += 1440;

  const total = endMin - startMin;
  const elapsed = Math.min(Math.max(now - startMin, 0), total);
  const percent = total > 0 ? Math.round((elapsed / total) * 100) : 0;

  // nextKey should always be a real waqt (never the sunrise placeholder) —
  // if the upcoming boundary IS the sunrise point, the waqt actually being
  // counted down to is the one after that (Dhuhr).
  const nextPoint = points[nextIdx].key === null ? points[(nextIdx + 1) % points.length] : points[nextIdx];
  const nextKey = (nextPoint.key ?? "dhuhr") as WaqtKey;

  return {
    key: points[curIdx].key,
    activeKey: points[curIdx].key,
    nextKey,
    percent,
    remainingMin: Math.max(endMin - now, 0),
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

function segmentLabel(seg: Segment, lang: "bn" | "en"): string {
  if (seg.activeKey) {
    return lang === "en" ? `${WAQT_LABEL_EN[seg.activeKey]} — ongoing` : `${WAQT_LABEL_BN[seg.activeKey]} ওয়াক্ত চলমান`;
  }
  return lang === "en" ? `Waiting for ${WAQT_LABEL_EN[seg.nextKey]}` : `${WAQT_LABEL_BN[seg.nextKey]}-এর অপেক্ষা`;
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

  const segment = computeSegment(data.timings);
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
          <div key={k} className={`prayer-widget__tile${segment?.activeKey === k ? " prayer-widget__tile--active" : ""}`}>
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

      {segment && (
        <div>
          <div className="prayer-widget__progress-row">
            <span className="prayer-widget__progress-label">{segmentLabel(segment, lang === "en" ? "en" : "bn")}</span>
            <span className="prayer-widget__progress-remaining">{formatRemaining(segment.remainingMin, lang === "en" ? "en" : "bn")}</span>
          </div>
          <div className="prayer-widget__progress-track">
            {/* Fill width is the one genuinely per-instance dynamic value here
                (how far through the current segment we are) — can't be a
                static class. Same pattern as Dashboard.tsx's
                camera-status-row dot. */}
            {/* eslint-disable-next-line no-restricted-syntax -- dynamic progress percentage */}
            <div className="prayer-widget__progress-fill" style={{ width: `${segment.percent}%` }} />
          </div>
        </div>
      )}
    </Card>
  );
}
