import { useEffect, useMemo, useState } from "react";
import { SkeletonTableRows } from "../components/Skeleton";
import { StatCard } from "../components/StatCard";
import { useLanguage } from "../context/AppSettingsContext";
import { api } from "../lib/api";
import { fmt } from "../lib/fmt";
import { Icons, type IconKey } from "../lib/icons";
import { C } from "../theme/colors";
import type { Expense } from "../types";

const EXPENSE_CATEGORIES = [
  "শিক্ষক বেতন",
  "খাবার খরচ",
  "বিদ্যুৎ বিল",
  "রক্ষণাবেক্ষণ",
  "স্টেশনারি",
  "অন্যান্য",
] as const;

const QUICK_ICONS: Record<string, IconKey> = {
  "শিক্ষক বেতন": "teacherSalary",
  "খাবার খরচ": "food",
  "বিদ্যুৎ বিল": "electricity",
  "রক্ষণাবেক্ষণ": "maintenance",
  "স্টেশনারি": "stationery",
  "অন্যান্য": "otherExpense",
};

export function Expenses() {
  const { t } = useLanguage();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ cat: "", amount: "", note: "" });
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Pagination: the table used to fetch every expense row in one request,
  // which got slower as the table grew. Now it only asks the server for
  // one page at a time, and totals come from a dedicated summary query
  // instead of being reduced over the full row set on the client.
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [totalRows, setTotalRows] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [summaryTotal, setSummaryTotal] = useState(0);
  const [summaryByCategory, setSummaryByCategory] = useState<{ cat: string; total: number }[]>([]);

  const load = async (targetPage: number) => {
    // Previously `.then(setExpenses)` had no `.catch()` — a failed load
    // left the (originally fake mock) expense list on screen with no
    // indication real data never arrived.
    setLoading(true);
    try {
      const [summary, pageData] = await Promise.all([
        api.getExpensesSummary(),
        api.getExpensesPage({ page: targetPage, limit: pageSize }),
      ]);
      setSummaryTotal(Number(summary?.total) || 0);
      setSummaryByCategory(Array.isArray(summary?.byCategory) ? summary.byCategory : []);
      setExpenses(Array.isArray(pageData?.items) ? pageData.items : []);
      setTotalRows(Number(pageData?.total) || 0);
      setTotalPages(Number(pageData?.totalPages) || 1);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() intentionally sets loading=true immediately so the table shows a spinner right away; the rest of its state updates land after the request resolves
    load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  const total = summaryTotal;

  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    EXPENSE_CATEGORIES.forEach((c) => (map[c] = 0));
    summaryByCategory.forEach((r) => {
      map[r.cat] = r.total;
    });
    return map;
  }, [summaryByCategory]);


  const openAdd = (cat?: string) => {
    setForm({ cat: cat || "", amount: "", note: "" });
    setShowAdd(true);
  };

  const handleAdd = async () => {
    if (!form.cat || !form.amount) return;
    setSaving(true);
    setError("");
    try {
      await api.createExpense({ cat: form.cat, amount: Number(form.amount), note: form.note });
      setForm({ cat: "", amount: "", note: "" });
      setShowAdd(false);
      // A new row changes both the current page and the summary totals,
      // so re-fetch from the server rather than patching local state.
      if (page === 1) load(1);
      else setPage(1);
    } catch (err) {
      // Previously a failed save fabricated a fake local row (fake id,
      // date "আজ") so the expense LOOKED added even though it never
      // reached the server. Now a failure shows a real error and leaves
      // the list untouched instead of pretending it was saved.
      setError(err instanceof Error ? err.message : t.common.requestFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setError("");
    try {
      const res = await api.deleteExpense(id);
      if (res.pendingApproval) {
        alert("Delete request sent for Admin approval.");
        return;
      }
      // Re-fetch the current page + summary now that the server confirmed
      // the delete, instead of just filtering the row out locally.
      load(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.requestFailed);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{t.expenses.title}</h2>
        <button type="button" onClick={() => openAdd()} style={{ background: C.amber, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 600, cursor: "pointer", fontSize: 14 }}>+ {t.expenses.addNew}</button>
      </div>

      {loadError && (
        <div style={{ color: C.rose, background: C.roseL, borderRadius: 8, padding: 10, marginBottom: 16, fontSize: 13 }}>{t.common.requestFailed}</div>
      )}

      {error && (
        <div style={{ color: C.rose, background: C.roseL, borderRadius: 8, padding: 10, marginBottom: 16, fontSize: 13 }}>{error}</div>
      )}

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
            {(() => { const QuickIcon = Icons[QUICK_ICONS[cat]]; return <QuickIcon size={14} aria-hidden="true" />; })()}
            <span>{cat}</span>
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 24 }}>
        <StatCard label={t.expenses.total} value={fmt(total)} icon="expenses" color={C.amber} />
        <StatCard label="শিক্ষক বেতন" value={fmt(byCategory["শিক্ষক বেতন"])} icon="teacherSalary" color={C.teal} />
        <StatCard label="খাবার খরচ" value={fmt(byCategory["খাবার খরচ"])} icon="food" color={C.emerald} />
        <StatCard label="অন্যান্য" value={fmt(byCategory["অন্যান্য"] + byCategory["স্টেশনারি"] + byCategory["রক্ষণাবেক্ষণ"] + byCategory["বিদ্যুৎ বিল"])} icon="otherExpense" color={C.violet} />
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
            <button type="button" disabled={saving} onClick={handleAdd} style={{ background: C.amber, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", fontSize: 13, opacity: saving ? 0.7 : 1 }}>{saving ? "…" : t.common.save}</button>
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
            {loading && expenses.length === 0 && <SkeletonTableRows rows={6} columns={6} />}
            {expenses.map((e, i) => (
              <tr key={e.id} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.card : "var(--row-alt)" }}>
                <td style={{ padding: "10px 14px", color: C.muted }}>{(page - 1) * pageSize + i + 1}</td>
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

      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, marginTop: 12, fontSize: 13, color: C.muted }}>
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={{ border: `1px solid ${C.border}`, background: C.card, borderRadius: 6, padding: "6px 12px", cursor: page <= 1 || loading ? "not-allowed" : "pointer", opacity: page <= 1 || loading ? 0.5 : 1 }}
          >
            ‹
          </button>
          <span>{page} / {totalPages} ({fmt(totalRows)})</span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            style={{ border: `1px solid ${C.border}`, background: C.card, borderRadius: 6, padding: "6px 12px", cursor: page >= totalPages || loading ? "not-allowed" : "pointer", opacity: page >= totalPages || loading ? 0.5 : 1 }}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
