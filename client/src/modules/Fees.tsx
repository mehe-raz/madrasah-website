import { useEffect, useMemo, useState } from "react";
import { Badge } from "../components/Badge";
import { ReceiptModal } from "../components/ReceiptModal";
import { StatCard } from "../components/StatCard";
import { useLanguage } from "../context/AppSettingsContext";
import { PAYMENTS, STUDENTS } from "../data/mockData";
import { api } from "../lib/api";
import { fmt } from "../lib/fmt";
import { C } from "../theme/colors";
import type { Payment, Student } from "../types";

export function Fees() {
  const { t } = useLanguage();
  const [tab, setTab] = useState("payments");
  const [showReceipt, setShowReceipt] = useState<Payment | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payStudent, setPayStudent] = useState<Student>(STUDENTS[1]);
  const [students, setStudents] = useState<Student[]>(STUDENTS);
  const [payments, setPayments] = useState<Payment[]>(PAYMENTS);
  const [method, setMethod] = useState("নগদ");
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editMethod, setEditMethod] = useState("নগদ");
  const [editDate, setEditDate] = useState("");

  const loadData = async () => {
    const [studentRows, paymentRows] = await Promise.all([api.getStudents(), api.getPayments()]);
    setStudents(studentRows);
    setPayments(paymentRows);
    const firstDue = studentRows.find((s) => s.due > 0) || studentRows[0];
    if (firstDue) setPayStudent(firstDue);
  };

  useEffect(() => {
    loadData().catch(() => {
      setStudents(STUDENTS);
      setPayments(PAYMENTS);
    });
  }, []);

  const dueStudents = useMemo(() => students.filter((s) => s.due > 0), [students]);

  const handlePayment = async () => {
    const amount = Number(payAmount) || payStudent.fee;
    try {
      const p = await api.createPayment({ studentId: payStudent.id, amount, method });
      await loadData();
      setShowReceipt(p);
    } catch {
      setShowReceipt({
        id: payments.length + 1,
        student: payStudent.name,
        roll: payStudent.roll,
        amount,
        date: new Date().toLocaleDateString("bn-BD"),
        receipt: `RCP-2025-${String(payments.length + 1).padStart(3, "0")}`,
        method,
        status: "সম্পন্ন",
      });
    }
    setPayAmount("");
    setTab("payments");
  };

  const openEdit = (payment: Payment) => {
    setEditingPayment(payment);
    setEditAmount(String(payment.amount));
    setEditMethod(payment.method);
    setEditDate(payment.date);
  };

  const saveEdit = async () => {
    if (!editingPayment) return;
    await api.updatePayment(editingPayment.id, {
      amount: Number(editAmount),
      method: editMethod,
      date: editDate,
    });
    setEditingPayment(null);
    await loadData();
  };

  const deletePayment = async (payment: Payment) => {
    if (!window.confirm(`এই পেমেন্টটি মুছে ফেলতে চান?\n${payment.receipt} - ${payment.student}`)) return;
    const result = await api.deletePayment(payment.id);
    if (result.pendingApproval) {
      window.alert("ডিলিট অনুরোধ জমা হয়েছে। অনুমোদনের অপেক্ষায় আছে।");
    }
    await loadData();
  };

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 20 }}>{t.fees.title}</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 24 }}>
        <StatCard label="মোট আয় (জুন)" value={fmt(72000)} icon="💰" color={C.emerald} />
        <StatCard label="মোট বকেয়া" value={fmt(dueStudents.reduce((s, st) => s + st.due, 0))} icon="⚠️" color={C.rose} />
        <StatCard label="এই মাসে পেমেন্ট" value={`${payments.length} টি`} icon="✅" color={C.teal} />
        <StatCard label="বকেয়া ছাত্র" value={`${dueStudents.length} জন`} icon="📋" color={C.amber} />
      </div>

      <div style={{ display: "flex", gap: 4, background: C.slateL, borderRadius: 10, padding: 4, marginBottom: 20, width: "fit-content", flexWrap: "wrap" }}>
        {([["payments", t.fees.payments], ["due", t.fees.due], ["collect", t.fees.collect]] as const).map(([id, lbl]) => (
          <button key={id} type="button" onClick={() => setTab(id)} style={{ padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: tab === id ? 600 : 400, background: tab === id ? C.card : "transparent", color: tab === id ? C.text : C.muted, boxShadow: tab === id ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}>
            {lbl}
          </button>
        ))}
      </div>

      {tab === "payments" && (
        <div className="table-wrap" style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 780 }}>
            <thead>
              <tr style={{ background: C.slateL }}>
                {["রসিদ নং", "ছাত্র", "পরিমাণ", "তারিখ", "মাধ্যম", "স্ট্যাটাস", "", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: C.muted, fontWeight: 600, fontSize: 12, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payments.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.card : "#fafbfc" }}>
                  <td style={{ padding: "10px 14px", fontFamily: "monospace", color: C.teal, fontWeight: 600 }}>{p.receipt}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ fontWeight: 600, color: C.text }}>{p.student}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>রোল: {p.roll}</div>
                  </td>
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: C.emerald }}>{fmt(p.amount)}</td>
                  <td style={{ padding: "10px 14px", color: C.muted }}>{p.date}</td>
                  <td style={{ padding: "10px 14px" }}><Badge label={p.method} color={C.sky} /></td>
                  <td style={{ padding: "10px 14px" }}><Badge label={p.status} color={p.status === "সম্পন্ন" ? C.emerald : C.amber} /></td>
                  <td style={{ padding: "10px 14px" }}>
                    <button type="button" onClick={() => setShowReceipt(p)} style={{ background: C.tealL, color: C.tealD, border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>🧾 রসিদ</button>
                  </td>
                  <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                    <button type="button" onClick={() => openEdit(p)} style={{ background: C.amberL, color: C.amberD, border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600, marginRight: 8 }}>✏️ এডিট</button>
                    <button type="button" onClick={() => deletePayment(p)} style={{ background: C.roseL, color: C.roseD, border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>🗑️ ডিলিট</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "due" && (
        <div className="table-wrap" style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 520 }}>
            <thead>
              <tr style={{ background: C.slateL }}>
                {["রোল", "নাম", "ক্লাস", "মাসিক বেতন", "বকেয়া", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: C.muted, fontWeight: 600, fontSize: 12, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dueStudents.map((s, i) => (
                <tr key={s.id} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.card : "#fafbfc" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 600, color: C.muted }}>{s.roll}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 600, color: C.text }}>{s.name}</td>
                  <td style={{ padding: "10px 14px", color: C.muted }}>{s.class}</td>
                  <td style={{ padding: "10px 14px", color: C.text }}>{fmt(s.fee)}</td>
                  <td style={{ padding: "10px 14px" }}><span style={{ color: C.rose, fontWeight: 700 }}>{fmt(s.due)}</span></td>
                  <td style={{ padding: "10px 14px" }}>
                    <button type="button" onClick={() => { setPayStudent(s); setTab("collect"); }} style={{ background: C.roseL, color: C.roseD, border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>বেতন নিন</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "collect" && (
        <div style={{ maxWidth: 480 }}>
          <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 18 }}>বেতন গ্রহণ</h3>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 6 }}>ছাত্র নির্বাচন করুন</label>
              <select value={payStudent.id} onChange={(e) => setPayStudent(students.find((s) => s.id === +e.target.value) || payStudent)} style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 14 }}>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} — রোল: {s.roll}</option>
                ))}
              </select>
            </div>
            <div style={{ background: C.slateL, borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: C.text }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ color: C.muted }}>মাসিক বেতন</span><strong>{fmt(payStudent.fee)}</strong></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.rose }}>বর্তমান বকেয়া</span><strong style={{ color: C.rose }}>{fmt(payStudent.due)}</strong></div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 6 }}>পরিমাণ (টাকা)</label>
              <input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder={String(payStudent.fee)} style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 6 }}>পেমেন্ট মাধ্যম</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["নগদ", "বিকাশ", "নগদ-মোবাইল", "ব্যাংক"].map((m) => (
                  <button key={m} type="button" onClick={() => setMethod(m)} style={{ flex: 1, minWidth: 70, border: `1px solid ${method === m ? C.teal : C.border}`, borderRadius: 8, padding: "8px 4px", cursor: "pointer", fontSize: 12, background: method === m ? C.tealL : C.card, color: method === m ? C.tealD : C.muted }}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" onClick={handlePayment} style={{ width: "100%", background: C.teal, color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 700, cursor: "pointer", fontSize: 15 }}>
              ✅ বেতন গ্রহণ করুন ও রসিদ তৈরি করুন
            </button>
          </div>
        </div>
      )}

      {showReceipt && <ReceiptModal payment={showReceipt} onClose={() => setShowReceipt(null)} />}

      {editingPayment && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.45)", display: "grid", placeItems: "center", padding: 16, zIndex: 50 }}>
          <div style={{ width: "min(520px, 100%)", background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, color: C.text }}>পেমেন্ট এডিট</h3>
              <button type="button" onClick={() => setEditingPayment(null)} style={{ border: "none", background: "transparent", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 6 }}>পরিমাণ</label>
              <input type="number" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 6 }}>তারিখ</label>
              <input type="text" value={editDate} onChange={(e) => setEditDate(e.target.value)} style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 6 }}>মাধ্যম</label>
              <input type="text" value={editMethod} onChange={(e) => setEditMethod(e.target.value)} style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setEditingPayment(null)} style={{ border: `1px solid ${C.border}`, background: C.card, borderRadius: 8, padding: "10px 14px", cursor: "pointer" }}>বাতিল</button>
              <button type="button" onClick={saveEdit} style={{ border: "none", background: C.teal, color: "#fff", borderRadius: 8, padding: "10px 14px", cursor: "pointer" }}>সংরক্ষণ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
