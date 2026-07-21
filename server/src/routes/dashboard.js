const express = require("express");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js.
router.use(requirePermission("dashboard"));

router.get("/", async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;

  // All student aggregates computed in one SQL round trip instead of
  // downloading every column (photo URLs, documents JSONB, addresses, etc)
  // for every student just to count/sum them in JavaScript.
  const [statsRow, deptRows, monthlyIncomeRow, monthlyExpenseRow, incomeByCategory, attToday, recentIncome] =
    await Promise.all([
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
      db.all("SELECT * FROM income ORDER BY id DESC LIMIT 3"),
    ]);

  const total = statsRow?.total || 0;
  const residential = statsRow?.residential || 0;
  const totalDue = statsRow?.totalDue || 0;
  const dueCount = statsRow?.dueCount || 0;
  const monthlyIncome = monthlyIncomeRow?.t || 0;
  const monthlyExpense = monthlyExpenseRow?.t || 0;

  const present = attToday.filter((a) => a.status === "উপস্থিত").length;
  const attTotal = attToday.length || total;

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  const incomeData = monthNames.map((month, i) => ({
    month,
    income: Math.round((monthlyIncome / 6) * (0.85 + i * 0.03)),
    expense: Math.round((monthlyExpense / 6) * (0.85 + i * 0.03)),
  }));
  if (incomeData.length) {
    incomeData[incomeData.length - 1].income = monthlyIncome;
    incomeData[incomeData.length - 1].expense = monthlyExpense;
  }

  const attendanceData = [
    { day: "Sun", present: 45, absent: 8 },
    { day: "Mon", present: 50, absent: 3 },
    { day: "Tue", present: 47, absent: 6 },
    { day: "Wed", present: 52, absent: 1 },
    { day: "Thu", present: 49, absent: 4 },
    { day: "Fri", present: present || 38, absent: Math.max(0, attTotal - present) },
  ];

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
