/**
 * Report date-range helpers | রিপোর্ট তারিখ-পরিসর হেল্পার
 *
 * Split out of components/ReportDateFilter.tsx so that file only exports
 * the component (react-refresh/only-export-components requires this for
 * Fast Refresh to work correctly).
 */
export interface ReportRange {
  from: string;
  to: string;
  label: string;
}

function monthRange(ym: string): ReportRange {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return {
    from: `${ym}-01`,
    to: `${ym}-${String(last).padStart(2, "0")}`,
    label: ym,
  };
}

export function currentMonth(): ReportRange {
  const d = new Date();
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return monthRange(ym);
}

export function defaultReportRange(): ReportRange {
  return currentMonth();
}

export { monthRange };
