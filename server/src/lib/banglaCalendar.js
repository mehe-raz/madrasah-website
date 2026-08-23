// server/src/lib/banglaCalendar.js
//
// Gregorian -> Bangla calendar (বঙ্গাব্দ) conversion, following the 2019
// Bangla Academy revision that's been the official calendar in Bangladesh
// since Bangla year 1426: Pohela Boishakh is a fixed 14 April every year
// (no more alternating 14th/15th depending on the Gregorian leap cycle),
// the first five months run 31 days each, the remaining seven run 30 days
// each — except Falgun gains a 31st day whenever the Gregorian February it
// overlaps is a leap year, which keeps the calendar permanently in sync
// with the Gregorian one without ever needing a manual adjustment.
//
// Hand-rolled rather than an npm package: the rule is small and stable, so
// this avoids a dependency for ~30 lines of date arithmetic. Verified
// against known reference dates (e.g. 24 Aug 2026 -> ৯ ভাদ্র ১৪৩৩).

const BN_MONTHS = [
  "বৈশাখ", "জ্যৈষ্ঠ", "আষাঢ়", "শ্রাবণ", "ভাদ্র", "আশ্বিন",
  "কার্তিক", "অগ্রহায়ণ", "পৌষ", "মাঘ", "ফাল্গুন", "চৈত্র",
];

function isGregorianLeap(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// Returns { day, month, monthIndex, year } for the Bangla calendar date
// corresponding to the given Gregorian date (defaults to now).
function toBanglaDate(inputDate = new Date()) {
  // Normalize to a date-only value first so a time-of-day near midnight
  // never shifts which Bangla day this resolves to.
  const date = new Date(inputDate.getFullYear(), inputDate.getMonth(), inputDate.getDate());
  const y = date.getFullYear();
  const boishakh1ThisYear = new Date(y, 3, 14); // month is 0-indexed: 3 = April
  const startYear = date >= boishakh1ThisYear ? y : y - 1;
  const startDate = new Date(startYear, 3, 14);

  const daysElapsed = Math.round((date - startDate) / 86400000);

  // Falgun (11th month, index 10) spans mid-Feb to mid-March of the
  // Gregorian year right after this Bangla year started.
  const falgunLeap = isGregorianLeap(startYear + 1);
  const monthLengths = [31, 31, 31, 31, 31, 30, 30, 30, 30, 30, falgunLeap ? 31 : 30, 30];

  let remaining = daysElapsed;
  let month = 0;
  while (remaining >= monthLengths[month]) {
    remaining -= monthLengths[month];
    month++;
  }

  return {
    day: remaining + 1,
    month: BN_MONTHS[month],
    monthIndex: month,
    year: startYear - 593,
  };
}

module.exports = { toBanglaDate, BN_MONTHS };
