// server/src/lib/prayerTimes.js
//
// Wraps the free Aladhan prayer-times API (https://aladhan.com/prayer-times-api)
// for the dashboard's namaz-time widget. Always requests method=1
// (University of Islamic Sciences, Karachi) — the calculation convention
// almost universally followed by Bangladeshi mosques/madrasahs, so the
// times shown line up with what the institution's own community already
// prays by, rather than a foreign default.
//
// Two lookup modes, in preference order:
//   1. Coordinates (prayerLat/prayerLng in settings) — calls Aladhan's
//      /v1/timings endpoint directly with latitude+longitude. This is the
//      most precise option: no city-name resolution step at all, so it's
//      accurate down to wherever the institution's device stood when it
//      captured its GPS location (Settings > namaz > "বর্তমান লোকেশন
//      ব্যবহার করুন"), not just "somewhere in this thana."
//   2. City + country (prayerCity/prayerCountry) — /v1/timingsByCity,
//      Aladhan resolves the city name to coordinates server-side. Used
//      whenever coordinates haven't been captured yet.
//
// In-memory, per-process cache keyed by mode+location+date: a given day's
// timings never change once published, so there's no reason to hit the
// upstream API more than once per (location, date) combination across
// every dashboard load that day. Deliberately not DB-backed — worst case
// after a server restart is one extra upstream call.

const db = require("./../db");
const { toBanglaDate } = require("./banglaCalendar");

const CACHE = new Map(); // cache key -> { fetchedAt, data }
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // safety net so a stuck process still refreshes twice a day

const ALADHAN_METHOD_KARACHI = 1;

const DEFAULT_CITY = "Dhaka";
const DEFAULT_COUNTRY = "Bangladesh";

const BN_WEEKDAYS = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"];

// Indexed 1-12 by Aladhan's own hijri.month.number — far more reliable than
// matching their English transliteration string (which varies in spelling/
// diacritics between responses and was silently falling through to the
// English name being shown instead of Bangla).
const HIJRI_MONTHS_BN_BY_NUMBER = {
  1: "মহররম",
  2: "সফর",
  3: "রবিউল আউয়াল",
  4: "রবিউস সানি",
  5: "জমাদিউল আউয়াল",
  6: "জমাদিউস সানি",
  7: "রজব",
  8: "শাবান",
  9: "রমজান",
  10: "শাওয়াল",
  11: "জিলক্বদ",
  12: "জিলহজ",
};

// This deployment is Bangladesh-specific (docs/GENERAL_MODE_PLAN.md
// default institution type), so "today" for the calendar/weekday is always
// resolved in Asia/Dhaka regardless of the server's own OS timezone —
// fixing a bug where a UTC-clocked server read the wrong calendar day
// during the ~6 hours/day (00:00-06:00 Dhaka time) where the UTC date has
// not yet rolled over to match Dhaka's. If institutions outside Bangladesh
// are ever supported, this needs to resolve per-institution timezone
// instead of the hardcoded zone below.
const CALENDAR_TIMEZONE = "Asia/Dhaka";

function todayInCalendarTimezone() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CALENDAR_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return new Date(Number(map.year), Number(map.month) - 1, Number(map.day));
}

function ddmmyyyy(date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${d}-${m}-${date.getFullYear()}`;
}

// Aladhan returns timings like "04:18 (+06)" when no explicit timezone is
// passed — strip everything after the HH:mm so the client always gets a
// plain, parseable 24h time string.
function cleanTime(raw) {
  const match = /^(\d{2}:\d{2})/.exec(String(raw ?? ""));
  return match ? match[1] : null;
}

function parseAladhanResponse(body) {
  if (body?.code !== 200 || !body?.data?.timings) {
    throw new Error("Aladhan API: unexpected response shape");
  }
  const t = body.data.timings;
  return {
    fajr: cleanTime(t.Fajr),
    sunrise: cleanTime(t.Sunrise),
    dhuhr: cleanTime(t.Dhuhr),
    asr: cleanTime(t.Asr),
    maghrib: cleanTime(t.Maghrib),
    isha: cleanTime(t.Isha),
    hijri: {
      day: Number(body.data.date.hijri.day),
      monthNumber: Number(body.data.date.hijri.month?.number) || null,
      monthEn: body.data.date.hijri.month?.en || "",
      year: Number(body.data.date.hijri.year),
    },
  };
}

async function callAladhan(url, cacheKey) {
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Aladhan API HTTP ${res.status}`);
  const data = parseAladhanResponse(await res.json());
  CACHE.set(cacheKey, { fetchedAt: Date.now(), data });
  return data;
}

// Most precise mode: exact GPS coordinates, no city-name resolution step.
async function fetchPrayerTimesByCoordinates(lat, lng, date = todayInCalendarTimezone()) {
  const dateStr = ddmmyyyy(date);
  const key = `coords|${lat}|${lng}|${dateStr}`;
  const url = `https://api.aladhan.com/v1/timings/${dateStr}?latitude=${lat}&longitude=${lng}&method=${ALADHAN_METHOD_KARACHI}`;
  return callAladhan(url, key);
}

async function fetchPrayerTimesByCity(city, country, date = todayInCalendarTimezone()) {
  const dateStr = ddmmyyyy(date);
  const key = `city|${city}|${country}|${dateStr}`;
  const url = `https://api.aladhan.com/v1/timingsByCity/${dateStr}?city=${encodeURIComponent(
    city
  )}&country=${encodeURIComponent(country)}&method=${ALADHAN_METHOD_KARACHI}`;
  return callAladhan(url, key);
}

// Ties together this institution's configured location (settings table —
// same generic key/value store as name/address/etc., see
// routes/settings.js), the Aladhan timings above, and the Bangla calendar
// conversion, into exactly the shape the dashboard widget needs. A single
// composed function rather than several client-side calls, so the widget
// stays a plain fetch-and-render component.
async function getDashboardPrayerTimes() {
  const rows = await db.all("SELECT key, value FROM settings WHERE key = ANY($1::text[])", [
    ["prayerCity", "prayerCountry", "prayerLat", "prayerLng"],
  ]);
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const lat = map.prayerLat ? Number(map.prayerLat) : null;
  const lng = map.prayerLng ? Number(map.prayerLng) : null;
  const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng);
  const city = map.prayerCity || DEFAULT_CITY;
  const country = map.prayerCountry || DEFAULT_COUNTRY;

  const today = todayInCalendarTimezone();
  const timings = hasCoordinates
    ? await fetchPrayerTimesByCoordinates(lat, lng, today)
    : await fetchPrayerTimesByCity(city, country, today);
  const bangla = toBanglaDate(today);

  return {
    city,
    country,
    // Lets the widget show a "GPS-precise" indicator instead of just the
    // city name when coordinates are the active source.
    locationSource: hasCoordinates ? "coordinates" : "city",
    date: {
      weekdayBn: BN_WEEKDAYS[today.getDay()],
      bangla,
      hijri: {
        day: timings.hijri.day,
        month: HIJRI_MONTHS_BN_BY_NUMBER[timings.hijri.monthNumber] || timings.hijri.monthEn,
        year: timings.hijri.year,
      },
    },
    timings: {
      fajr: timings.fajr,
      sunrise: timings.sunrise,
      dhuhr: timings.dhuhr,
      asr: timings.asr,
      maghrib: timings.maghrib,
      isha: timings.isha,
    },
  };
}

module.exports = {
  fetchPrayerTimesByCoordinates,
  fetchPrayerTimesByCity,
  getDashboardPrayerTimes,
  DEFAULT_CITY,
  DEFAULT_COUNTRY,
};
