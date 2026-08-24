// server/src/lib/bangladeshLocations.js
//
// Wraps the @bangladeshi/bangladesh-address npm package (all 64 districts,
// all 495 upazilas, MIT-licensed, community-verified) to power the
// district → upazila picker in Settings > namaz, replacing free-text city
// entry with an actual list — so an admin picks "চাঁদপুর → হাজীগঞ্জ"
// instead of typing a city name that may or may not resolve correctly on
// Aladhan's side.
//
// This project deliberately does NOT hand-maintain its own copy of
// Bangladesh's administrative geography (64 districts / 495 upazilas) —
// that data is exactly the kind of thing that goes stale or gets typo'd
// when hand-entered, and a maintained upstream package is the safer
// source of truth. See docs on why: a wrong/missing upazila here is a
// data-accuracy bug, not just a UI nit.
//
// v2.1.0's convenience *functions* (allDistricts/allDistrict,
// upazilaNamesOf/upazilasOf, ...) have changed names across published
// versions of this package, which is exactly what silently broke the
// picker before: guessing at a function name that doesn't exist on the
// installed version returns an empty list with no error anywhere. The
// package's raw data export (`upazilaData`, documented under "Raw Data
// Access" in its README) is the stable part of its surface — an array of
// { upazila, district, division } objects — so this adapter builds the
// district → upazila map directly from that array. The old function-based
// lookup is kept only as a fallback for a much older installed version
// that predates the raw-data export.
const pkg = require("@bangladeshi/bangladesh-address");

function getUpazilaRows() {
  // CJS build (this package compiles with "module": "commonjs" — see its
  // tsconfig — so this is normally a direct property, not a .default).
  // The .default fallback only guards against an unexpected interop shape.
  const raw = pkg.upazilaData || pkg.default?.upazilaData;
  if (Array.isArray(raw) && raw.length) return raw;

  // Fallback for a version without upazilaData: try the one documented
  // no-argument function that returns everything at once.
  const fn = pkg.allUpazila || pkg.default?.allUpazila;
  if (typeof fn === "function") {
    const result = fn();
    if (Array.isArray(result)) return result;
  }
  return [];
}

// Full { district: [upazila, upazila, ...] } map — small enough (~495
// short strings total) to send in one response and let the client's
// Settings page do instant district→upazila filtering with no extra
// round trip per selection. Computed once and cached: the underlying
// package's data is static, so there's no reason to rebuild this map on
// every request.
let cachedMap = null;
function getFullLocationMap() {
  if (cachedMap) return cachedMap;

  const rows = getUpazilaRows();
  const upazilasByDistrict = {};
  for (const row of rows) {
    const district = typeof row === "string" ? null : row?.district;
    const upazila = typeof row === "string" ? row : row?.upazila || row?.name;
    if (!district || !upazila) continue;
    if (!upazilasByDistrict[district]) upazilasByDistrict[district] = [];
    upazilasByDistrict[district].push(upazila);
  }
  for (const d of Object.keys(upazilasByDistrict)) {
    upazilasByDistrict[d].sort((a, b) => a.localeCompare(b));
  }
  const districts = Object.keys(upazilasByDistrict).sort((a, b) => a.localeCompare(b));

  if (!districts.length) {
    // Fail loudly instead of caching/returning an empty map — an empty
    // map silently renders no picker at all on the client with nothing
    // in the browser console to explain why. Throwing here surfaces a
    // clear server-log line and a 500 the client now shows to the admin
    // (see Settings.tsx), instead of the section just quietly vanishing.
    throw new Error(
      "@bangladeshi/bangladesh-address returned no upazila data — check that the package is installed (npm install) and its version still exports upazilaData"
    );
  }

  cachedMap = { districts, upazilasByDistrict };
  return cachedMap;
}

module.exports = { getFullLocationMap };
