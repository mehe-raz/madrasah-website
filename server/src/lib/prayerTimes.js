// server/src/lib/prayerTimes.js
//
// Wraps the free Aladhan prayer-times API (https://aladhan.com/prayer-times-api)
// for the dashboard's namaz-time widget. Always requests method=1
// (University of Islamic Sciences, Karachi) — the calculation convention
// almost universally followed by Bangladeshi mosques/madrasahs, so the
// times shown line up with what the institution's own community already
// prays by, rather than a foreign default.
//
// In-memory, per-process cache keyed by city+country+date: a given day's
// timings never change once published, so there's no reason to hit the
// upstream API more than once per (city, date) combination across every
// dashboard load that day. Deliberately not DB-backed — worst case after a
// server restart is one extra upstream call.

const db = require("./../db");
const { toBanglaDate } = require("./banglaCalendar");

const CACHE = new Map(); // "city|country|dd-mm-yyyy" -> { fetchedAt, data }
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // safety net so a stuck process still refreshes twice a day

const ALADHAN_METHOD_KARACHI = 1;

const DEFAULT_CITY = "Dhaka";
const DEFAULT_COUNTRY = "Bangladesh";

const BN_WEEKDAYS = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"];

// Aladhan's Hijri month.en spelling varies a bit by transliteration
// (apostrophe style, capitalization), so lookups are normalized rather than
// matched exactly. If a spelling variant isn't in the map, the English name
// is shown as a safe fallback instead of breaking the widget.
const HIJRI_MONTHS_BN = {
  muharram: "মহররম",
  safar: "সফর",
  "rabi al-awwal": "রবিউল আউয়াল",
  "rabi al-thani": "রবিউস সানি",
  "rabi al-akhir": "রবিউস সানি",
  "jumada al-awwal": "জমাদিউল আউয়াল",
  "jumada al-ula": "জমাদিউল আউয়াল",
  "jumada al-thani": "জমাদিউস সানি",
  "jumada al-akhirah": "জমাদিউস সানি",
  rajab: "রজব",
  shaban: "শাবান",
  ramadan: "রমজান",
  shawwal: "শাওয়াল",
  "dhu al-qidah": "জিলক্বদ",
  "dhu al-hijjah": "জিলহজ",
};

function normalizeHijriMonth(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/['’ʻ]/g, "")
    .trim();
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

async function fetchPrayerTimes(city, country, date = new Date()) {
  const dateStr = ddmmyyyy(date);
  const key = `${city}|${country}|${dateStr}`;
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const url = `https://api.aladhan.com/v1/timingsByCity/${dateStr}?city=${encodeURIComponent(
    city
  )}&country=${encodeURIComponent(country)}&method=${ALADHAN_METHOD_KARACHI}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Aladhan API HTTP ${res.status}`);
  const body = await res.json();
  if (body?.code !== 200 || !body?.data?.timings) {
    throw new Error("Aladhan API: unexpected response shape");
  }

  const t = body.data.timings;
  const data = {
    fajr: cleanTime(t.Fajr),
    sunrise: cleanTime(t.Sunrise),
    dhuhr: cleanTime(t.Dhuhr),
    asr: cleanTime(t.Asr),
    maghrib: cleanTime(t.Maghrib),
    isha: cleanTime(t.Isha),
    hijri: {
      day: Number(body.data.date.hijri.day),
      month: body.data.date.hijri.month?.en || "",
      year: Number(body.data.date.hijri.year),
    },
  };

  CACHE.set(key, { fetchedAt: Date.now(), data });
  return data;
}

// Ties together this institution's configured city/country (settings
// table — same generic key/value store as name/address/etc., see
// routes/settings.js), the Aladhan timings above, and the Bangla calendar
// conversion, into exactly the shape the dashboard widget needs. A single
// composed function rather than three separate client-side calls, so the
// widget stays a plain fetch-and-render component.
async function getDashboardPrayerTimes() {
  const rows = await db.all("SELECT key, value FROM settings WHERE key = ANY($1::text[])", [
    ["prayerCity", "prayerCountry"],
  ]);
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const city = map.prayerCity || DEFAULT_CITY;
  const country = map.prayerCountry || DEFAULT_COUNTRY;

  const now = new Date();
  const timings = await fetchPrayerTimes(city, country, now);
  const bangla = toBanglaDate(now);
  const hijriMonthKey = normalizeHijriMonth(timings.hijri.month);

  return {
    city,
    country,
    date: {
      weekdayBn: BN_WEEKDAYS[now.getDay()],
      bangla,
      hijri: {
        day: timings.hijri.day,
        month: HIJRI_MONTHS_BN[hijriMonthKey] || timings.hijri.month,
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

module.exports = { fetchPrayerTimes, getDashboardPrayerTimes, DEFAULT_CITY, DEFAULT_COUNTRY };
