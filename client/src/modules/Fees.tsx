import { useEffect, useState } from "react";
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
  const [payPage, setPayPage] = useState(1);
  const [payPageSize] = useState(25);
  const [payTotal, setPayTotal] = useState(0);
  const [method, setMethod] = useState("নগদ");

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const [studentData, paymentData] = await Promise.all([
          api.getStudentsBasic({ status: "Active" }),
          api.getPaymentsPage({ page: payPage, limit: payPageSize }),
        ]);
        if (!alive) return;
        setStudents(Array.isArray(studentData?.items) ? studentData.items : []);
        setPayments(Array.isArray(paymentData?.items) ? paymentData.items : []);
        setPayTotal(Number(paymentData?.total) || 0);
      } catch (err) {
        if (!alive) return;
        console.error("Failed to load fees screen", err);
        setStudents([]);
        setPayments([]);
        setPayTotal(0);
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, [payPage, payPageSize]);

  const dueStudents = students.filter((s) => s.due > 0);

  const handlePayment = async () => {
    const amount = Number(payAmount) || payStudent.fee;
    try {
      const p = await api.createPayment({ studentId: payStudent.id, amount, method });
      setPayments((prev) => [p, ...prev]);
      setStudents((prev) => prev.map((s) => (s.id === payStudent.id ? { ...s, due: Math.max(0, s.due - amount) } : s)));
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
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 600 }}>
            <thead>
              <tr style={{ background: C.slateL }}>
                {["রসিদ নং", "ছাত্র", "পরিমাণ", "তারিখ", "মাধ্যম", "স্ট্যাটাস", ""].map((h) => (
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

    </div>
  );
}
