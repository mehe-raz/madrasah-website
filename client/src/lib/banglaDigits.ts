// client/src/lib/banglaDigits.ts
//
// Converts ASCII digits to Bengali numerals (০-৯) for display. Used by the
// prayer-times widget so dates/times read naturally in the app's Bangla UI
// — kept as a tiny standalone helper (rather than folded into fmt.ts, which
// is currency-specific) since it operates on any digit string.

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

export function toBnDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

// "HH:mm" (24h) -> Bengali-digit 12h time, e.g. "04:18" -> "৪:১৮".
export function toBn12Hour(hhmm: string | null): string {
  if (!hhmm) return "--:--";
  const [hStr, mStr] = hhmm.split(":");
  let h = Number(hStr);
  h = h % 12 === 0 ? 12 : h % 12;
  return toBnDigits(`${h}:${mStr}`);
}
