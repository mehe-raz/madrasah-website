const express = require("express");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js.
router.use(requirePermission("dashboard"));

function monthKey(date) {
  return date.toISOString().slice(0, 7);
}

function monthLabel(date) {
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function dateRange(daysBack, endDate = new Date()) {
  const dates = [];
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    dates.push(d);
  }
  return dates;
}

router.get("/", async (_req, res) => {
  const today = new Date();
  const todayKey = toDateKey(today);
  const currentMonthStart = toDateKey(startOfMonth(today));
  const sixMonthStart = addMonths(startOfMonth(today), -5);
  const sixMonthStartKey = toDateKey(sixMonthStart);

  const [
    statsRow,
    deptRows,
    monthlyIncomeRow,
    monthlyExpenseRow,
    incomeRows,
    expenseRows,
    incomeByCategory,
    attendanceTodayRows,
    attendanceByDayRows,
    recentIncome,
    recentExpenses,
  ] = await Promise.all([
    db.get(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE type = 'Residential')::int AS residential,
         COALESCE(SUM(due), 0)::int AS "totalDue",
         COUNT(*) FILTER (WHERE due > 0)::int AS "dueCount"
       FROM students`
    ),
    db.all(`SELECT dept AS name, COUNT(*)::int AS value FROM students GROUP BY dept ORDER BY dept`),
    db.get("SELECT COALESCE(SUM(amount), 0)::int AS t FROM income WHERE date >= $1 AND date <= $2", [currentMonthStart, todayKey]),
    db.get("SELECT COALESCE(SUM(amount), 0)::int AS t FROM expenses WHERE date >= $1 AND date <= $2", [currentMonthStart, todayKey]),
    db.all(
      `SELECT to_char(date::date, 'YYYY-MM') AS month_key, COALESCE(SUM(amount), 0)::int AS total
       FROM income
       WHERE date::date >= $1::date
       GROUP BY 1
       ORDER BY 1`,
      [sixMonthStartKey]
    ),
    db.all(
      `SELECT to_char(date::date, 'YYYY-MM') AS month_key, COALESCE(SUM(amount), 0)::int AS total
       FROM expenses
       WHERE date::date >= $1::date
       GROUP BY 1
       ORDER BY 1`,
      [sixMonthStartKey]
    ),
    db.all("SELECT category, COALESCE(SUM(amount), 0)::int AS total FROM income GROUP BY category ORDER BY category"),
    db.all("SELECT status FROM attendance WHERE date = $1", [todayKey]),
    db.all(
      `SELECT date, status, COUNT(*)::int AS total
       FROM attendance
       WHERE date::date >= $1::date
       GROUP BY date, status
       ORDER BY date, status`,
      [toDateKey(dateRange(7)[0])]
    ),
    db.all("SELECT id, category, amount, date, note, method, receipt, status FROM income ORDER BY id DESC LIMIT 5"),
    db.all("SELECT id, cat, amount, date, note FROM expenses ORDER BY id DESC LIMIT 5"),
  ]);

  const total = statsRow?.total || 0;
  const residential = statsRow?.residential || 0;
  const totalDue = statsRow?.totalDue || 0;
  const dueCount = statsRow?.dueCount || 0;
  const monthlyIncome = monthlyIncomeRow?.t || 0;
  const monthlyExpense = monthlyExpenseRow?.t || 0;

  const presentToday = attendanceTodayRows.filter((a) => a.status === "উপস্থিত").length;
  const attendedToday = attendanceTodayRows.length;

  const monthSeries = Array.from({ length: 6 }, (_, i) => {
    const date = addMonths(startOfMonth(today), i - 5);
    const key = monthKey(date);
    const incomeMatch = incomeRows.find((row) => row.month_key === key);
    const expenseMatch = expenseRows.find((row) => row.month_key === key);
    return {
      month: monthLabel(date),
      income: incomeMatch?.total || 0,
      expense: expenseMatch?.total || 0,
    };
  });

  const attendanceRange = dateRange(7);
  const attendanceMap = new Map(
    attendanceByDayRows.map((row) => [`${row.date}|${row.status}`, Number(row.total || 0)])
  );
  const attendanceData = attendanceRange.map((date) => {
    const dayKey = toDateKey(date);
    const present = attendanceMap.get(`${dayKey}|উপস্থিত`) || 0;
    const absent = attendanceMap.get(`${dayKey}|অনুপস্থিত`) || 0;
    const late = attendanceMap.get(`${dayKey}|দেরিতে`) || 0;
    return {
      day: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date),
      present,
      absent,
      late,
    };
  });

  const deptData = deptRows.map((r) => ({ name: r.name || "Unassigned", value: r.value }));
  const logs = [
    ...recentIncome.map((inc, i) => ({
      id: `income-${inc.id ?? i}`,
      action: `Income: ${inc.category} — ${inc.amount} BDT`,
      user: "System",
      time: inc.date,
      icon: "payment",
    })),
    ...recentExpenses.map((exp, i) => ({
      id: `expense-${exp.id ?? i}`,
      action: `Expense: ${exp.cat} — ${exp.amount} BDT`,
      user: "System",
      time: exp.date,
      icon: "expense",
    })),
  ].slice(0, 6);

  res.json({
    stats: {
      total,
      residential,
      monthlyIncome: monthlyIncome || 0,
      totalDue,
      dueCount,
      monthlyExpense: monthlyExpense || 0,
      attendance: attendedToday ? `${presentToday}/${attendedToday}` : "0/0",
      attendancePct: attendedToday ? ((presentToday / attendedToday) * 100).toFixed(1) : "0",
    },
    incomeData: monthSeries,
    incomeByCategory,
    attendanceData,
    deptData,
    logs: logs.length ? logs : [{ id: 1, action: "No recent activity", user: "—", time: "—", icon: "add" }],
  });
});

module.exports = router;
