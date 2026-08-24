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
// Defensive about the exact export names: the package's README and its
// published npm version have shown slightly different function names
// across versions (e.g. allDistrict vs allDistricts, districtOf vs
// districtsOf). Rather than hard-coding one and risking a hard crash if a
// lockfile resolves a version with the other naming, this adapter checks
// for either at runtime and normalizes the return shape either way.
const address = require("@bangladeshi/bangladesh-address");

function firstFn(...names) {
  for (const n of names) {
    if (typeof address[n] === "function") return address[n];
  }
  return null;
}

function toNameList(result) {
  if (!Array.isArray(result)) return [];
  if (result.length === 0) return [];
  if (typeof result[0] === "string") return result;
  // Object form, e.g. { upazila: "Savar", district: "Dhaka", ... }
  return result.map((o) => o?.upazila || o?.name || String(o)).filter(Boolean);
}

function getAllDistricts() {
  const fn = firstFn("allDistricts", "allDistrict");
  return fn ? [...fn()].sort((a, b) => a.localeCompare(b)) : [];
}

function getUpazilasOf(district) {
  const fn = firstFn("upazilaNamesOf", "upazilasOf");
  if (!fn) return [];
  return toNameList(fn(district)).sort((a, b) => a.localeCompare(b));
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
  const districts = getAllDistricts();
  const upazilasByDistrict = {};
  for (const d of districts) {
    upazilasByDistrict[d] = getUpazilasOf(d);
  }
  cachedMap = { districts, upazilasByDistrict };
  return cachedMap;
}

module.exports = { getAllDistricts, getUpazilasOf, getFullLocationMap };
