import { useEffect, useMemo, useState } from "react";
import { StatCard } from "../components/StatCard";
import { useLanguage } from "../context/AppSettingsContext";
import { EXPENSES } from "../data/mockData";
import { api } from "../lib/api";
import { fmt } from "../lib/fmt";
import { C } from "../theme/colors";
import type { Expense } from "../types";

export const EXPENSE_CATEGORIES = [
  "শিক্ষক বেতন",
  "খাবার খরচ",
  "বিদ্যুৎ বিল",
  "রক্ষণাবেক্ষণ",
  "স্টেশনারি",
  "অন্যান্য",
] as const;

const QUICK_ICONS: Record<string, string> = {
  "শিক্ষক বেতন": "👨‍🏫",
  "খাবার খরচ": "🍽️",
  "বিদ্যুৎ বিল": "⚡",
  "রক্ষণাবেক্ষণ": "🔧",
  "স্টেশনারি": "📎",
  "অন্যান্য": "📦",
};

export function Expenses() {
  const { t } = useLanguage();
  const [expenses, setExpenses] = useState<Expense[]>(EXPENSES);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ cat: "", amount: "", note: "" });

  useEffect(() => {
    api.getExpenses().then(setExpenses);
  }, []);

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    EXPENSE_CATEGORIES.forEach((c) => (map[c] = 0));
    expenses.forEach((e) => {
      map[e.cat] = (map[e.cat] || 0) + e.amount;
    });
    return map;
  }, [expenses]);

  const openAdd = (cat?: string) => {
    setForm({ cat: cat || "", amount: "", note: "" });
    setShowAdd(true);
  };

  const handleAdd = async () => {
    if (!form.cat || !form.amount) return;
    try {
      const created = await api.createExpense({ cat: form.cat, amount: Number(form.amount), note: form.note });
      setExpenses((prev) => [created, ...prev]);
    } catch {
      setExpenses((prev) => [...prev, { id: prev.length + 1, cat: form.cat, amount: +form.amount, date: "আজ", note: form.note }]);
    }
    setForm({ cat: "", amount: "", note: "" });
    setShowAdd(false);
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await api.deleteExpense(id);
      if (res.pendingApproval) {
        alert("Delete request sent for Admin approval.");
        return;
      }
    } catch {
      /* mock */
    }
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{t.expenses.title}</h2>
        <button type="button" onClick={() => openAdd()} style={{ background: C.amber, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 600, cursor: "pointer", fontSize: 14 }}>+ {t.expenses.addNew}</button>
      </div>

      <p style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>{t.expenses.quickAdd}</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {EXPENSE_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => openAdd(cat)}
            style={{
              border: `1px solid ${C.border}`,
              background: C.card,
              borderRadius: 8,
              padding: "8px 14px",
              cursor: "pointer",
              fontSize: 12,
              color: C.text,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>{QUICK_ICONS[cat]}</span>
            <span>{cat}</span>
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 24 }}>
        <StatCard label={t.expenses.total} value={fmt(total)} icon="💸" color={C.amber} />
        <StatCard label="শিক্ষক বেতন" value={fmt(byCategory["শিক্ষক বেতন"])} icon="👨‍🏫" color={C.teal} />
        <StatCard label="খাবার খরচ" value={fmt(byCategory["খাবার খরচ"])} icon="🍽️" color={C.emerald} />
        <StatCard label="অন্যান্য" value={fmt(byCategory["অন্যান্য"] + byCategory["স্টেশনারি"] + byCategory["রক্ষণাবেক্ষণ"] + byCategory["বিদ্যুৎ বিল"])} icon="📦" color={C.violet} />
      </div>

      {showAdd && (
        <div style={{ background: C.amberL, border: `1px solid ${C.amber}40`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: C.amberD, marginBottom: 12 }}>{t.expenses.addNew}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: C.amberD, display: "block", marginBottom: 4 }}>{t.expenses.category}</label>
              <select
                value={form.cat}
                onChange={(e) => setForm({ ...form, cat: e.target.value })}
                style={{ width: "100%", border: `1px solid ${C.amber}60`, borderRadius: 6, padding: "7px 10px", fontSize: 13, boxSizing: "border-box" }}
              >
                <option value="">—</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: C.amberD, display: "block", marginBottom: 4 }}>{t.expenses.amount}</label>
              <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={{ width: "100%", border: `1px solid ${C.amber}60`, borderRadius: 6, padding: "7px 10px", fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: C.amberD, display: "block", marginBottom: 4 }}>{t.expenses.note}</label>
              <input type="text" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={{ width: "100%", border: `1px solid ${C.amber}60`, borderRadius: 6, padding: "7px 10px", fontSize: 13, boxSizing: "border-box" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={handleAdd} style={{ background: C.amber, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>{t.common.save}</button>
            <button type="button" onClick={() => setShowAdd(false)} style={{ background: "transparent", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontSize: 13 }}>{t.common.cancel}</button>
          </div>
        </div>
      )}

      <div className="table-wrap" style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 480 }}>
          <thead>
            <tr style={{ background: C.slateL }}>
              {["#", t.expenses.category, t.expenses.amount, t.expenses.date, t.expenses.note, ""].map((h) => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: C.muted, fontWeight: 600, fontSize: 12, borderBottom: `1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {expenses.map((e, i) => (
              <tr key={e.id} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.card : "var(--row-alt)" }}>
                <td style={{ padding: "10px 14px", color: C.muted }}>{i + 1}</td>
                <td style={{ padding: "10px 14px", fontWeight: 600, color: C.text }}>{e.cat}</td>
                <td style={{ padding: "10px 14px", fontWeight: 700, color: C.rose }}>{fmt(e.amount)}</td>
                <td style={{ padding: "10px 14px", color: C.muted }}>{e.date}</td>
                <td style={{ padding: "10px 14px", color: C.muted }}>{e.note}</td>
                <td style={{ padding: "10px 14px" }}>
                  <button type="button" onClick={() => handleDelete(e.id)} style={{ background: C.roseL, color: C.rose, border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12 }}>{t.common.delete}</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: C.slateL }}>
              <td colSpan={2} style={{ padding: "10px 14px", fontWeight: 700, color: C.text }}>{t.expenses.total}</td>
              <td style={{ padding: "10px 14px", fontWeight: 700, color: C.rose }}>{fmt(total)}</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
