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
import type { DashboardData } from "../types";
import { MOCK_DASHBOARD } from "../data/mockData";

const logIcon = (icon: string) =>
  icon === "add" ? "➕" : icon === "payment" ? "💳" : icon === "attendance" ? "📋" : "📉";

export function Dashboard() {
  const [data, setData] = useState<DashboardData>(MOCK_DASHBOARD);
  const isMobile = useMediaQuery("(max-width: 768px)");

  useEffect(() => {
    api.getDashboard().then(setData).catch(() => {});
  }, []);

  const { stats } = data;

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 20 }}>ড্যাশবোর্ড</h2>

      <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 24 }}>
        <StatCard label="মোট ছাত্র" value={String(stats.total)} icon="👨‍🎓" color={C.teal} sub={`${stats.residential} আবাসিক`} />
        <StatCard label="আবাসিক" value={String(stats.residential)} icon="🏠" color={C.emerald} sub={`মোটের ${Math.round((stats.residential / stats.total) * 100)}%`} />
        <StatCard label="মাসিক আয়" value={fmt(stats.monthlyIncome)} icon="💰" color={C.sky} sub="জুন ২০২৫" />
        <StatCard label="মোট বকেয়া" value={fmt(stats.totalDue)} icon="⚠️" color={C.rose} sub={`${stats.dueCount} জন ছাত্র`} />
        <StatCard label="মাসিক ব্যয়" value={fmt(stats.monthlyExpense)} icon="💸" color={C.amber} sub="জুন ২০২৫" />
        <StatCard label="আজকের হাজিরা" value={stats.attendance} icon="📅" color={C.violet} sub={`${stats.attendancePct}%`} />
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
          <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 16 }}>আয় ও ব্যয় (মাসওয়ারি)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.incomeData} barSize={12}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => Number(v) / 1000 + "k"} />
              <Tooltip formatter={(v) => "৳" + Number(v).toLocaleString()} />
              <Bar dataKey="income" name="আয়" fill={C.teal} radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="ব্যয়" fill={C.rose} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 16 }}>বিভাগ অনুযায়ী ছাত্র</h3>
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
        <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 16 }}>সাপ্তাহিক হাজিরা</h3>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={data.attendanceData}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="present" name="উপস্থিত" stroke={C.emerald} strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="absent" name="অনুপস্থিত" stroke={C.rose} strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 14 }}>সাম্প্রতিক কার্যক্রম</h3>
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
