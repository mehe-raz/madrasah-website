import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatCard } from "../components/StatCard";
import { PIE_COLORS } from "../theme/colors";
import { C } from "../theme/colors";
import { api } from "../lib/api";
import { fmt } from "../lib/fmt";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/AppSettingsContext";
import type { DashboardData, DeleteRequest } from "../types";
import { MOCK_DASHBOARD } from "../data/mockData";

const logIcon = (icon: string) =>
  icon === "add" ? "➕" : icon === "payment" ? "💳" : icon === "attendance" ? "📋" : "📉";

export function Dashboard() {
  const { user } = useAuth();
  const { t, tr } = useLanguage();
  const [data, setData] = useState<DashboardData>(MOCK_DASHBOARD);
  const [deleteRequests, setDeleteRequests] = useState<DeleteRequest[]>([]);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const canApproveDeletes = user?.role === "Super Admin" || user?.role === "Admin";
  const requestTypeLabel = (type: DeleteRequest["entityType"]) =>
    type === "income"
      ? t.dashboard.income
      : type === "expense"
      ? t.dashboard.expense
      : type === "payment-delete"
      ? "পেমেন্ট ডিলিট"
      : type === "user-update"
      ? t.dashboard.userUpdate
      : t.dashboard.userDelete;

  useEffect(() => {
    api.getDashboard().then(setData).catch(() => {});
    if (canApproveDeletes) api.getDeleteRequests().then(setDeleteRequests).catch(() => setDeleteRequests([]));
  }, [canApproveDeletes]);

  const resolveDelete = async (id: number, action: "approve" | "reject") => {
    if (action === "approve") await api.approveDeleteRequest(id);
    else await api.rejectDeleteRequest(id);
    setDeleteRequests((prev) => prev.filter((r) => r.id !== id));
    api.getDashboard().then(setData).catch(() => {});
  };

  const { stats } = data;

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 20 }}>{t.dashboard.title}</h2>

      {canApproveDeletes && deleteRequests.length > 0 && (
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 18, marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>{t.dashboard.deleteRequests}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {deleteRequests.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: C.slateL, borderRadius: 8, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{requestTypeLabel(r.entityType)}: {r.label}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>{tr("dashboard.requestedBy", { name: r.requestedByName || "Accountant" })} · {fmt(r.amount)}</div>
                </div>
                <button type="button" onClick={() => resolveDelete(r.id, "approve")} style={{ background: C.emerald, color: "#fff", border: "none", borderRadius: 7, padding: "7px 12px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>{t.dashboard.approve}</button>
                <button type="button" onClick={() => resolveDelete(r.id, "reject")} style={{ background: C.slate, color: "#fff", border: "none", borderRadius: 7, padding: "7px 12px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>{t.dashboard.reject}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 24 }}>
        <StatCard label={t.dashboard.totalStudents} value={String(stats.total)} icon="👨‍🎓" color={C.teal} sub={tr("dashboard.residentialSub", { count: stats.residential })} />
        <StatCard label={t.dashboard.residential} value={String(stats.residential)} icon="🏠" color={C.emerald} sub={tr("dashboard.totalPercent", { percent: Math.round((stats.residential / stats.total) * 100) })} />
        <StatCard label={t.dashboard.monthlyIncome} value={fmt(stats.monthlyIncome)} icon="💰" color={C.sky} sub={t.dashboard.monthLabel} />
        <StatCard label={t.dashboard.totalDue} value={fmt(stats.totalDue)} icon="⚠️" color={C.rose} sub={tr("dashboard.dueStudents", { count: stats.dueCount })} />
        <StatCard label={t.dashboard.monthlyExpense} value={fmt(stats.monthlyExpense)} icon="💸" color={C.amber} sub={t.dashboard.monthLabel} />
        <StatCard label={t.dashboard.todayAttendance} value={stats.attendance} icon="📅" color={C.violet} sub={`${stats.attendancePct}%`} />
      </div>

      <div
        className="charts-row"
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 16 }}>{t.dashboard.incomeExpenseMonthly}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.incomeData} barSize={12}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => Number(v) / 1000 + "k"} />
              <Tooltip formatter={(v) => "৳" + Number(v).toLocaleString()} />
              <Bar dataKey="income" name={t.dashboard.income} fill={C.teal} radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name={t.dashboard.expense} fill={C.rose} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 16 }}>{t.dashboard.studentsByDepartment}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={data.deptData}
                cx="50%"
                cy="50%"
                outerRadius={isMobile ? 60 : 75}
                dataKey="value"
                label={({ name, value }) => `${name}: ${value}`}
                labelLine={false}
                fontSize={11}
              >
                {data.deptData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 16 }}>{t.dashboard.weeklyAttendance}</h3>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={data.attendanceData}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="present" name={t.dashboard.present} stroke={C.emerald} strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="absent" name={t.dashboard.absent} stroke={C.rose} strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 14 }}>{t.dashboard.recentActivity}</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {data.logs.map((l) => (
            <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 20 }}>{logIcon(l.icon)}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: C.text }}>{l.action}</div>
                <div style={{ fontSize: 12, color: C.muted }}>{l.user} · {l.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
