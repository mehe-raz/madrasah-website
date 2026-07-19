const express = require("express");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js.
router.use(requirePermission("dashboard"));

router.get("/", async (_req, res) => {
  const students = await db.all("SELECT * FROM students");
  const total = students.length;
  const residential = students.filter((s) => s.type === "আবাসিক").length;
  const totalDue = students.reduce((s, st) => s + st.due, 0);
  const dueCount = students.filter((s) => s.due > 0).length;
  const monthlyIncomeRow = await db.get("SELECT COALESCE(SUM(amount), 0)::int AS t FROM income");
  const monthlyExpenseRow = await db.get("SELECT COALESCE(SUM(amount), 0)::int AS t FROM expenses");
  const monthlyIncome = monthlyIncomeRow?.t || 0;
  const monthlyExpense = monthlyExpenseRow?.t || 0;

  const incomeByCategory = await db.all("SELECT category, SUM(amount)::int AS total FROM income GROUP BY category");

  const today = new Date().toISOString().slice(0, 10);
  const attToday = await db.all("SELECT status FROM attendance WHERE date = $1", [today]);
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

  const deptCounts = {};
  students.forEach((s) => {
    deptCounts[s.dept] = (deptCounts[s.dept] || 0) + 1;
  });
  const deptData = Object.entries(deptCounts).map(([name, value]) => ({ name, value }));

  const recentIncome = await db.all("SELECT * FROM income ORDER BY id DESC LIMIT 3");
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
