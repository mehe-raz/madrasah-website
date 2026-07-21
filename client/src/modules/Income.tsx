import { useEffect, useState, type CSSProperties } from "react";
import { Badge } from "../components/Badge";
import { ReceiptModal } from "../components/ReceiptModal";
import { StatCard } from "../components/StatCard";
import { useLanguage } from "../context/AppSettingsContext";
import { api } from "../lib/api";
import { fmt } from "../lib/fmt";
import { C } from "../theme/colors";
import type { IncomeEntry, Payment, Student } from "../types";

const METHODS = ["Cash", "bKash", "Nagad", "Bank"];

export function Income() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<"list" | "add" | "student">("list");
  const [entries, setEntries] = useState<IncomeEntry[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [filterCat, setFilterCat] = useState("All");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [totalEntries, setTotalEntries] = useState(0);
  const [summaryTotal, setSummaryTotal] = useState(0);
  const [summaryByCategory, setSummaryByCategory] = useState<{ cat: string; total: number }[]>([]);
  const [showReceipt, setShowReceipt] = useState<Payment | null>(null);
  const [editRow, setEditRow] = useState<IncomeEntry | null>(null);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    category: "Donation",
    amount: "",
    note: "",
    method: "Cash",
    date: new Date().toISOString().slice(0, 10),
  });

  const [categories, setCategories] = useState<string[]>([]);
  const [catEdit, setCatEdit] = useState<string[]>([]);
  const [catDraft, setCatDraft] = useState("");
  const [showCategoryEditor, setShowCategoryEditor] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");

  const [studentForm, setStudentForm] = useState({
    className: "",
    studentId: 0,
    amount: "",
    method: "Cash",
  });

  const load = () => {
    api.getIncomeSummary().then((s) => {
      setSummaryTotal(s.total);
      setSummaryByCategory(s.byCategory);
    }).catch(() => {
      setSummaryTotal(0);
      setSummaryByCategory([]);
    });
    api.getIncomePage({ page, limit: pageSize, category: filterCat !== "All" ? filterCat : undefined }).then((r) => {
      setEntries(r.items);
      setTotalEntries(r.total);
    }).catch(() => {
      setEntries([]);
      setTotalEntries(0);
    });
    api.getIncomeCategories().then((c) => {
      setCategories(c);
      setCatEdit(c);
      if (c.length) {
        setForm((f) => (c.includes(f.category) ? f : { ...f, category: c.find((x) => x !== "Student Fee") || c[0] }));
      }
    });
    api.getStudentsBasic({ status: "Active" }).then((r) => {
      const s = r.items;
      setStudents(s);
      const classes = [...new Set(s.map((x) => x.class).filter(Boolean))];
      if (classes.length && !studentForm.className) {
        setStudentForm((f) => ({ ...f, className: classes[0], studentId: s.find((st) => st.class === classes[0])?.id || 0 }));
      }
    });
  };

  const searchText = studentSearch.trim().toLowerCase();
  const studentsInClass = students.filter((s) => {
    const classMatch = !studentForm.className || s.class === studentForm.className;
    const activeMatch = s.status === "Active";
    const searchMatch =
      !searchText ||
      s.name.toLowerCase().includes(searchText) ||
      String(s.roll).toLowerCase().includes(searchText) ||
      (s.nameEn || "").toLowerCase().includes(searchText);
    return classMatch && activeMatch && searchMatch;
  });
  const classList = [...new Set(students.map((s) => s.class).filter(Boolean))];

  const saveCategories = async () => {
    try {
      const saved = await api.saveIncomeCategories(catEdit);
      setCategories(saved);
      setCatEdit(saved);
      setMsg("Categories saved");
      if (!saved.includes(form.category)) setForm((f) => ({ ...f, category: saved.find((x) => x !== "Student Fee") || saved[0] }));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Category save failed");
    }
  };

  useEffect(() => {
    load();
  }, [page, filterCat]);

  const totalIncome = summaryTotal;
  const byCategory = summaryByCategory.length ? summaryByCategory : categories.map((cat) => ({
    cat,
    total: 0,
  }));

  const handleAdd = async () => {
    const amount = Number(form.amount);
    if (!amount) {
      setMsg("Amount required");
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      const entry = await api.createIncome({
        category: form.category,
        amount,
        note: form.note,
        method: form.method,
        date: form.date,
      });
      setShowReceipt({
        id: entry.id,
        student: entry.note || entry.category,
        roll: "-",
        category: entry.category,
        amount: entry.amount,
        date: entry.date,
        receipt: entry.receipt,
        method: entry.method,
        status: entry.status,
      });
      setForm({ category: categories.find((x) => x !== "Student Fee") || "Donation", amount: "", note: "", method: "Cash", date: new Date().toISOString().slice(0, 10) });
      setTab("list");
      setMsg("Income saved. Receipt is ready.");
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Income save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleStudentFee = async () => {
    const amount = Number(studentForm.amount);
    const student = students.find((s) => s.id === studentForm.studentId);
    if (!student || !amount) {
      setMsg("Student and amount required");
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      const entry = await api.createIncome({
        category: "Student Fee",
        amount,
        method: studentForm.method,
        studentId: student.id,
        note: `Fee from ${student.name}`,
      });
      setShowReceipt({
        id: entry.id,
        student: student.name,
        roll: student.roll,
        amount,
        date: entry.date,
        receipt: entry.receipt,
        method: studentForm.method,
        status: "Completed",
        category: "Student Fee",
      });
      setStudentForm({ ...studentForm, amount: "" });
      setMsg("Student fee saved. Receipt is ready.");
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Student fee save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editRow) return;
    await api.updateIncome(editRow.id, {
      category: editRow.category,
      amount: editRow.amount,
      note: editRow.note,
      method: editRow.method,
      date: editRow.date,
    });
    setEditRow(null);
    load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this income entry?")) return;
    const res = await api.deleteIncome(id);
    if (res.pendingApproval) {
      alert("Delete request sent for Admin approval.");
    }
    load();
  };

  const openReceipt = (e: IncomeEntry) => {
    setShowReceipt({
      id: e.id,
      student: e.student || e.note || e.category,
      roll: e.roll || "-",
      category: e.category,
      amount: e.amount,
      date: e.date,
      receipt: e.receipt,
      method: e.method,
      status: e.status,
    });
  };
  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 20 }}>{t.income.title}</h2>
      {msg && <p style={{ color: msg.toLowerCase().includes("fail") || msg.toLowerCase().includes("invalid") ? C.rose : C.teal, fontSize: 13, marginTop: -8, marginBottom: 12 }}>{msg}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
        <StatCard label={t.income.total} value={fmt(totalIncome)} icon="💰" color={C.emerald} />
        {byCategory.filter((b) => b.total > 0).slice(0, 3).map((b) => (
          <StatCard key={b.cat} label={b.cat} value={fmt(b.total)} icon="📋" color={C.teal} />
        ))}
      </div>

      <div style={{ display: "flex", gap: 4, background: C.slateL, borderRadius: 10, padding: 4, marginBottom: 16, flexWrap: "wrap", width: "fit-content" }}>
        {(["list", "add", "student"] as const).map((id) => (
          <button key={id} type="button" onClick={() => setTab(id)} style={{ padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: tab === id ? 600 : 400, background: tab === id ? C.card : "transparent", color: tab === id ? C.text : C.muted }}>
            {id === "list" ? t.income.allEntries : id === "add" ? t.income.addIncome : t.income.studentFee}
          </button>
        ))}
      </div>

      {tab === "list" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {["All", ...categories].map((c) => (
              <button key={c} type="button" onClick={() => { setFilterCat(c); setPage(1); }} style={{ border: `1px solid ${filterCat === c ? C.teal : C.border}`, background: filterCat === c ? C.tealL : C.card, color: filterCat === c ? C.tealD : C.muted, borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                {c}
              </button>
            ))}
          </div>
          <div className="table-wrap" style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 640 }}>
              <thead>
                <tr style={{ background: C.slateL }}>
                  {["Receipt", "Category", "Amount", "Date", "Method", "Note", ""].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: C.muted, fontWeight: 600, fontSize: 12, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={e.id} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.card : "var(--row-alt)" }}>
                    <td style={{ padding: "10px 14px", fontFamily: "monospace", color: C.teal, fontWeight: 600 }}>{e.receipt}</td>
                    <td style={{ padding: "10px 14px" }}><Badge label={e.category} color={C.emerald} /></td>
                    <td style={{ padding: "10px 14px", fontWeight: 700, color: C.emerald }}>{fmt(e.amount)}</td>
                    <td style={{ padding: "10px 14px", color: C.muted }}>{e.date}</td>
                    <td style={{ padding: "10px 14px" }}>{e.method}</td>
                    <td style={{ padding: "10px 14px", color: C.muted }}>{e.note || "—"}</td>
                    <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                      <button type="button" onClick={() => openReceipt(e)} style={{ background: C.tealL, color: C.tealD, border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: "pointer", marginRight: 4 }}>Receipt</button>
                      <button type="button" onClick={() => setEditRow({ ...e })} style={{ background: C.amberL, color: C.amberD, border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: "pointer", marginRight: 4 }}>Edit</button>
                      <button type="button" onClick={() => handleDelete(e.id)} style={{ background: C.roseL, color: C.rose, border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: "pointer" }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
            <div style={{ color: C.muted, fontSize: 12 }}>Showing {entries.length} of {totalEntries}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={{ border: `1px solid ${C.border}`, background: C.card, color: page <= 1 ? C.muted : C.text, borderRadius: 6, padding: "6px 10px", cursor: page <= 1 ? "not-allowed" : "pointer", fontSize: 12 }}>Prev</button>
              <span style={{ color: C.muted, fontSize: 12 }}>{page} / {Math.max(1, Math.ceil(totalEntries / pageSize))}</span>
              <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page >= Math.max(1, Math.ceil(totalEntries / pageSize))} style={{ border: `1px solid ${C.border}`, background: C.card, color: page >= Math.max(1, Math.ceil(totalEntries / pageSize)) ? C.muted : C.text, borderRadius: 6, padding: "6px 10px", cursor: page >= Math.max(1, Math.ceil(totalEntries / pageSize)) ? "not-allowed" : "pointer", fontSize: 12 }}>Next</button>
            </div>
          </div>
        </>
      )}

      {tab === "add" && (
        <div style={{ maxWidth: 520, background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{t.income.addByCategory}</h3>
            <button type="button" onClick={() => setShowCategoryEditor((v) => !v)} title="Edit categories" style={{ width: 34, height: 34, border: `1px solid ${C.border}`, borderRadius: 8, background: C.card, color: C.text, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>...</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 16 }}>
            {categories.filter((c) => c !== "Student Fee").map((cat) => (
              <button key={cat} type="button" onClick={() => setForm({ ...form, category: cat })} style={{ border: `2px solid ${form.category === cat ? C.teal : C.border}`, background: form.category === cat ? C.tealL : C.card, borderRadius: 8, padding: "10px", cursor: "pointer", fontSize: 12, fontWeight: form.category === cat ? 700 : 400 }}>
                {cat}
              </button>
            ))}
          </div>
          {showCategoryEditor && (
          <div style={{ marginBottom: 16, padding: 12, background: C.slateL, borderRadius: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Edit categories / ক্যাটাগরি সম্পাদনা</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {catEdit.map((cat, i) => (
                <input key={i} value={cat} onChange={(e) => setCatEdit(catEdit.map((c, j) => (j === i ? e.target.value : c)))} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 8px", fontSize: 12, minWidth: 100 }} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input value={catDraft} onChange={(e) => setCatDraft(e.target.value)} placeholder="New category" style={{ flex: 1, minWidth: 120, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", fontSize: 12 }} />
              <button type="button" onClick={() => { if (catDraft.trim()) { setCatEdit([...catEdit, catDraft.trim()]); setCatDraft(""); } }} style={{ background: C.teal, color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>+ Add</button>
              <button type="button" onClick={saveCategories} style={{ background: C.emerald, color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>Save categories</button>
            </div>
          </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input type="number" placeholder="Amount (BDT)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={fieldStyle} />
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={fieldStyle} />
            <input placeholder="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={fieldStyle} />
            <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} style={fieldStyle}>
              {METHODS.map((m) => <option key={m}>{m}</option>)}
            </select>
            <button type="button" disabled={saving} onClick={handleAdd} style={{ background: C.emerald, color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 700, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.75 : 1 }}>{saving ? "Saving..." : t.common.save}</button>
          </div>
        </div>
      )}

      {tab === "student" && (
        <div style={{ maxWidth: 480, background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>{t.income.collectStudentFee}</h3>
          <label style={{ fontSize: 12, color: C.muted }}>Class / ক্লাস</label>
          <select
            value={studentForm.className}
            onChange={(e) => {
              const cls = e.target.value;
              const first = students.find((s) => s.class === cls);
              setStudentForm({ ...studentForm, className: cls, studentId: first?.id || 0, amount: first ? String(first.fee) : "" });
            }}
            style={{ ...fieldStyle, marginBottom: 12 }}
          >
            {classList.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <label style={{ fontSize: 12, color: C.muted }}>Search by name or roll</label>
          <input
            placeholder="Name or roll"
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
            style={{ ...fieldStyle, marginBottom: 12 }}
          />
          <label style={{ fontSize: 12, color: C.muted }}>Student / ছাত্র</label>
          <select
            value={studentForm.studentId}
            onChange={(e) => {
              const id = +e.target.value;
              const st = students.find((s) => s.id === id);
              setStudentForm({ ...studentForm, studentId: id, amount: st ? String(st.due > 0 ? st.due : st.fee) : "" });
            }}
            style={{ ...fieldStyle, marginBottom: 12 }}
          >
            {studentsInClass.map((s) => (
              <option key={s.id} value={s.id}>{s.name} — Roll {s.roll} — Due {fmt(s.due)}</option>
            ))}
          </select>
          <label style={{ fontSize: 12, color: C.muted }}>Amount / পরিমাণ</label>
          <input type="number" placeholder="Amount" value={studentForm.amount} onChange={(e) => setStudentForm({ ...studentForm, amount: e.target.value })} style={{ ...fieldStyle, marginBottom: 12 }} />
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {METHODS.map((m) => (
              <button key={m} type="button" onClick={() => setStudentForm({ ...studentForm, method: m })} style={{ flex: 1, minWidth: 70, border: `1px solid ${studentForm.method === m ? C.teal : C.border}`, borderRadius: 8, padding: 8, background: studentForm.method === m ? C.tealL : C.card, cursor: "pointer", fontSize: 12 }}>
                {m}
              </button>
            ))}
          </div>
          <button type="button" disabled={saving} onClick={handleStudentFee} style={{ width: "100%", background: C.teal, color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 700, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.75 : 1 }}>
            {saving ? "Saving..." : "Collect & Create Receipt"}
          </button>
        </div>
      )}

      {editRow && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setEditRow(null)}>
          <div style={{ background: C.card, borderRadius: 12, padding: 24, width: 400, maxWidth: "100%" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 12 }}>Edit Income</h3>
            <select value={editRow.category} onChange={(e) => setEditRow({ ...editRow, category: e.target.value })} style={{ ...fieldStyle, marginBottom: 8 }}>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input type="number" value={editRow.amount} onChange={(e) => setEditRow({ ...editRow, amount: +e.target.value })} style={{ ...fieldStyle, marginBottom: 8 }} />
            <input value={editRow.note} onChange={(e) => setEditRow({ ...editRow, note: e.target.value })} style={{ ...fieldStyle, marginBottom: 8 }} />
            <input type="date" value={editRow.date} onChange={(e) => setEditRow({ ...editRow, date: e.target.value })} style={{ ...fieldStyle, marginBottom: 12 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={handleUpdate} style={{ flex: 1, background: C.emerald, color: "#fff", border: "none", borderRadius: 8, padding: 10, cursor: "pointer" }}>Save</button>
              <button type="button" onClick={() => setEditRow(null)} style={{ flex: 1, background: C.slateL, border: "none", borderRadius: 8, padding: 10, cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showReceipt && <ReceiptModal payment={showReceipt} onClose={() => setShowReceipt(null)} />}
    </div>
  );
}

const fieldStyle: CSSProperties = {
  width: "100%",
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 14,
  boxSizing: "border-box",
  background: C.card,
  color: C.text,
};





