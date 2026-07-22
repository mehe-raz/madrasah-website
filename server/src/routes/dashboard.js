const express = require("express");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js.
router.use(requirePermission("dashboard"));

router.get("/", async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;

  // Start of the 6-month window (this month + 5 prior) for the income/expense
  // trend chart below, and the 6-day window (today + 5 prior) for the
  // attendance trend chart — both replace what used to be hardcoded demo
  // numbers with real aggregates from the database.
  const now = new Date();
  const sixMonthStart = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().slice(0, 10);
  const sixDayStart = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // All student aggregates computed in one SQL round trip instead of
  // downloading every column (photo URLs, documents JSONB, addresses, etc)
  // for every student just to count/sum them in JavaScript.
  const [
    statsRow,
    deptRows,
    monthlyIncomeRow,
    monthlyExpenseRow,
    incomeByCategory,
    attToday,
    recentIncome,
    incomeByMonth,
    expenseByMonth,
    attendanceByDay,
  ] = await Promise.all([
      db.get(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE type = 'Residential')::int AS residential,
           COALESCE(SUM(due), 0)::int AS "totalDue",
           COUNT(*) FILTER (WHERE due > 0)::int AS "dueCount"
         FROM students`
      ),
      db.all(`SELECT dept AS name, COUNT(*)::int AS value FROM students GROUP BY dept`),
      db.get("SELECT COALESCE(SUM(amount), 0)::int AS t FROM income WHERE date >= $1 AND date <= $2", [monthStart, today]),
      db.get("SELECT COALESCE(SUM(amount), 0)::int AS t FROM expenses WHERE date >= $1 AND date <= $2", [monthStart, today]),
      db.all("SELECT category, SUM(amount)::int AS total FROM income GROUP BY category"),
      db.all("SELECT status FROM attendance WHERE date = $1", [today]),
      db.all("SELECT id, category, amount, date, receipt, method, status, note FROM income ORDER BY id DESC LIMIT 3"),
      db.all(
        `SELECT to_char(date::date, 'YYYY-MM') AS ym, SUM(amount)::int AS total
         FROM income WHERE date >= $1 GROUP BY ym`,
        [sixMonthStart]
      ),
      db.all(
        `SELECT to_char(date::date, 'YYYY-MM') AS ym, SUM(amount)::int AS total
         FROM expenses WHERE date >= $1 GROUP BY ym`,
        [sixMonthStart]
      ),
      db.all(`SELECT date, status FROM attendance WHERE date >= $1 AND date <= $2`, [sixDayStart, today]),
    ]);

  const total = statsRow?.total || 0;
  const residential = statsRow?.residential || 0;
  const totalDue = statsRow?.totalDue || 0;
  const dueCount = statsRow?.dueCount || 0;
  const monthlyIncome = monthlyIncomeRow?.t || 0;
  const monthlyExpense = monthlyExpenseRow?.t || 0;

  const present = attToday.filter((a) => a.status === "উপস্থিত").length;
  const attTotal = attToday.length || total;

  // Real 6-month income/expense trend (this month + previous 5), instead of
  // splitting the current month's total across a fabricated curve.
  const incomeByYm = Object.fromEntries(incomeByMonth.map((r) => [r.ym, r.total]));
  const expenseByYm = Object.fromEntries(expenseByMonth.map((r) => [r.ym, r.total]));
  const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const incomeData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return {
      month: monthLabels[d.getMonth()],
      income: incomeByYm[ym] || 0,
      expense: expenseByYm[ym] || 0,
    };
  });

  // Real 6-day attendance trend (today + previous 5 actual dates), instead
  // of hardcoded Sun–Thu numbers with only the last slot (mislabeled "Fri"
  // regardless of the actual day) reflecting real data.
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const attendanceByDate = {};
  attendanceByDay.forEach((r) => {
    const key = String(r.date).slice(0, 10);
    if (!attendanceByDate[key]) attendanceByDate[key] = { present: 0, absent: 0 };
    if (r.status === "উপস্থিত") attendanceByDate[key].present++;
    else if (r.status === "অনুপস্থিত") attendanceByDate[key].absent++;
  });
  const attendanceData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getTime() - (5 - i) * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    const counts = attendanceByDate[key] || { present: 0, absent: 0 };
    return { day: dayLabels[d.getDay()], ...counts };
  });

  const deptData = deptRows.map((r) => ({ name: r.name, value: r.value }));

  const logs = [
    ...recentIncome.map((inc, i) => ({
      id: i + 1,
      action: `Income: ${inc.category} — ${inc.amount} BDT`,
      user: "System",
      time: inc.date,
      icon: "payment",
    })),
  ];

  res.json({
    stats: {
      total,
      residential,
      monthlyIncome: monthlyIncome || 0,
      totalDue,
      dueCount,
      monthlyExpense: monthlyExpense || 0,
      attendance: `${present}/${attTotal || total}`,
      attendancePct: attTotal ? ((present / attTotal) * 100).toFixed(1) : "0",
    },
    incomeData,
    incomeByCategory,
    attendanceData,
    deptData,
    logs: logs.length ? logs : [{ id: 1, action: "No recent activity", user: "—", time: "—", icon: "add" }],
  });
});

module.exports = router;
