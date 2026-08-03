import { useCallback, useEffect, useState } from "react";
import { Badge } from "../components/Badge";
import { Button } from "../components/ui/Button";
import { ReceiptModal } from "../components/ReceiptModal";
import { RecordCard, RecordCardList } from "../components/RecordCard";
import { StatCard } from "../components/StatCard";
import { StudentPicker } from "../components/StudentPicker";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/AppSettingsContext";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { api } from "../lib/api";
import { fmt } from "../lib/fmt";
import { getOutboxEntriesFor, removeOutboxEntry, type OutboxEntry } from "../lib/offlineDb";
import { C } from "../theme/colors";
import type { Payment, Student } from "../types";

export function Fees() {
  const { t } = useLanguage();
  const { user } = useAuth();
  // Mirrors the server's isApprovalRole() in lib/deleteRequests.js — kept
  // as an inline check here rather than a new shared util (AGENTS.md Rule 1:
  // minimal diff; this is the only place on the client that needs it today).
  const canReviewFlags = user?.role === "Super Admin" || user?.role === "Admin";
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [tab, setTab] = useState("payments");
  const [showReceipt, setShowReceipt] = useState<Payment | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payStudent, setPayStudent] = useState<Student | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const payPage = 1;
  const payPageSize = 25;
  const [loadError, setLoadError] = useState(false);
  const [method, setMethod] = useState("নগদ");
  const [paySaving, setPaySaving] = useState(false);
  const [payError, setPayError] = useState("");
  const [queuedMessage, setQueuedMessage] = useState("");
  const [pendingPayments, setPendingPayments] = useState<OutboxEntry[]>([]);
  const [flaggedPayments, setFlaggedPayments] = useState<Payment[]>([]);
  const [resolveError, setResolveError] = useState("");

  // Due tab: server-paginated + server-summed (see api.getStudentsBasic's
  // dueOnly/totalDue), so schools with hundreds of students get an
  // accurate "total due" and a full, browsable due list instead of one
  // silently truncated to the first 100 active students.
  const [dueStudents, setDueStudents] = useState<Student[]>([]);
  const [duePage, setDuePage] = useState(1);
  const [duePageSize] = useState(25);
  const [dueTotalPages, setDueTotalPages] = useState(1);
  const [dueTotal, setDueTotal] = useState(0);
  const [dueCount, setDueCount] = useState(0);

  const loadDue = useCallback(async () => {
    try {
      const data = await api.getStudentsBasic({ status: "Active", dueOnly: true, page: duePage, limit: duePageSize });
      setDueStudents(Array.isArray(data?.items) ? data.items : []);
      setDueTotalPages(data?.totalPages || 1);
      setDueTotal(data?.totalDue || 0);
      setDueCount(data?.total || 0);
    } catch {
      setDueStudents([]);
    }
  }, [duePage, duePageSize]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadDue() intentionally fetches the Due tab's page/list/total on mount and whenever duePage changes; there's no external system to synchronize with here, just an async fetch.
    void loadDue();
  }, [loadDue]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const [studentData, paymentData] = await Promise.all([
          api.getStudentsBasic({ status: "Active" }),
          api.getPaymentsPage({ page: payPage, limit: payPageSize }),
        ]);
        if (!alive) return;
        const loadedStudents = Array.isArray(studentData?.items) ? studentData.items : [];
        setStudents(loadedStudents);
        setPayments(Array.isArray(paymentData?.items) ? paymentData.items : []);
        setLoadError(false);
        setPayStudent((prev) => prev || loadedStudents.find((s) => s.due > 0) || loadedStudents[0] || null);
      } catch (err) {
        if (!alive) return;
        console.error("Failed to load fees screen", err);
        setStudents([]);
        setPayments([]);
        setLoadError(true);
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, [payPage, payPageSize]);

  // Locally-queued payments not yet reached the server (offline-first
  // Phase 5, see lib/offlineDb.ts / offlineSync.ts) — same polling pattern
  // as modules/Students.tsx's pendingAdmissions (Phase 4): the outbox
  // changes from this screen's own submit AND the background flush on
  // "online", so polling is simpler here than a pub/sub layer.
  const loadPendingPayments = useCallback(() => {
    getOutboxEntriesFor("/payments", "POST")
      .then((entries) => setPendingPayments(entries))
      .catch(() => {
        // IndexedDB unavailable (private browsing etc.) — not critical.
      });
  }, []);

  // Payments that reached the server but were flagged instead of
  // auto-processed (see server/src/routes/payments.js isConflict). Only
  // Admin/Super Admin can see or resolve these.
  const loadFlaggedPayments = useCallback(() => {
    if (!canReviewFlags) return;
    api
      .getFlaggedPayments()
      .then((rows) => setFlaggedPayments(rows))
      .catch(() => {
        // Best-effort — the flagged panel just stays empty/stale.
      });
  }, [canReviewFlags]);

  useEffect(() => {
    loadPendingPayments();
    loadFlaggedPayments();
    const interval = window.setInterval(() => {
      loadPendingPayments();
      loadFlaggedPayments();
    }, 5000);
    window.addEventListener("online", loadPendingPayments);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", loadPendingPayments);
    };
  }, [loadPendingPayments, loadFlaggedPayments]);

  const discardQueuedPayment = async (clientRequestId: string) => {
    await removeOutboxEntry(clientRequestId);
    loadPendingPayments();
  };

  const resolveFlag = async (id: number, action: "confirm" | "void") => {
    setResolveError("");
    try {
      await api.resolvePaymentFlag(id, action);
      setFlaggedPayments((prev) => prev.filter((p) => p.id !== id));
      // A confirmed flag now has a real income entry / due deduction on
      // the server — refresh the lists so the payments/due tabs reflect it
      // instead of waiting for the next unrelated navigation.
      const [paymentData, studentData] = await Promise.all([
        api.getPaymentsPage({ page: payPage, limit: payPageSize }),
        api.getStudentsBasic({ status: "Active" }),
      ]);
      setPayments(Array.isArray(paymentData?.items) ? paymentData.items : []);
      setStudents(Array.isArray(studentData?.items) ? studentData.items : []);
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : t.fees.resolveFailed);
    }
  };

  const totalCollected = payments.reduce((s, p) => s + (p.amount || 0), 0);

  // Existing pre-Phase-5 code compared status to "সম্পন্ন" (Bengali) even
  // though the server sends "Completed" (English) — left as-is per
  // AGENTS.md Rule 1 (not this task's scope). Flagged/Voided are new
  // statuses introduced by this task, so they're handled explicitly here.
  const paymentStatusColor = (status: string) => {
    if (status === "Flagged") return C.rose;
    if (status === "Voided") return C.muted;
    return status === "সম্পন্ন" ? C.emerald : C.amber;
  };

  // Offline-first Phase 5: queue on no connection instead of the old
  // behavior of fabricating a fake receipt in the UI on ANY error (which
  // showed "success" without saving or queuing anything). A real HTTP
  // error (e.g. student not found, invalid amount) is now shown as an
  // error rather than masked.
  const handlePayment = async () => {
    if (!payStudent) return;
    setPayError("");
    setQueuedMessage("");
    const amount = Number(payAmount) || payStudent.fee;
    setPaySaving(true);
    try {
      const result = await api.createPaymentOrQueue({ studentId: payStudent.id, amount, method });
      if (result.queued) {
        loadPendingPayments();
        setQueuedMessage(t.fees.paymentQueued);
      } else if (result.data) {
        const savedPayment = result.data;
        setPayments((prev) => [savedPayment, ...prev]);
        if (result.data.status === "Flagged") {
          // Reached the server, but the due was already 0 by then — this
          // is not a normal success, so no receipt is printed yet; it
          // shows up in the review panel below instead (see loadFlaggedPayments).
          loadFlaggedPayments();
        } else {
          setStudents((prev) =>
            prev.map((s) => (s.id === payStudent.id ? { ...s, due: Math.max(0, s.due - amount) } : s))
          );
          void loadDue();
          setShowReceipt(result.data);
        }
      }
    } catch (err) {
      setPayError(err instanceof Error ? err.message : t.students.saveFailed);
    } finally {
      setPaySaving(false);
    }
    setPayAmount("");
    setTab("payments");
  };

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 20 }}>{t.fees.title}</h2>

      {loadError && (
        <div style={{ color: C.rose, background: C.roseL, borderRadius: 8, padding: 10, marginBottom: 16, fontSize: 13 }}>{t.common.requestFailed}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 24 }}>
        <StatCard label="এই তালিকার মোট আদায়" value={fmt(totalCollected)} icon="💰" color={C.emerald} />
        <StatCard label="মোট বকেয়া" value={fmt(dueTotal)} icon="⚠️" color={C.rose} />
        <StatCard label="এই মাসে পেমেন্ট" value={`${payments.length} টি`} icon="✅" color={C.teal} />
        <StatCard label="বকেয়া ছাত্র" value={`${dueCount} জন`} icon="📋" color={C.amber} />
      </div>


      <div style={{ display: "flex", gap: 4, background: C.slateL, borderRadius: 10, padding: 4, marginBottom: 20, width: "fit-content", flexWrap: "wrap" }}>
        {([["payments", t.fees.payments], ["due", t.fees.due], ["collect", t.fees.collect]] as const).map(([id, lbl]) => (
          <button key={id} type="button" onClick={() => setTab(id)} style={{ padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: tab === id ? 600 : 400, background: tab === id ? C.card : "transparent", color: tab === id ? C.text : C.muted, boxShadow: tab === id ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}>
            {lbl}
          </button>
        ))}
      </div>

      {queuedMessage && <div className="alert alert--amber">{queuedMessage}</div>}
      {payError && <div className="alert alert--rose">{payError}</div>}
      {resolveError && <div className="alert alert--rose">{resolveError}</div>}

      {pendingPayments.length > 0 && (
        <div className="alert alert--amber">
          <div className="sync-panel__title">
            {t.fees.pendingPaymentsTitle} ({pendingPayments.length})
          </div>
          <div className="sync-panel__hint">{t.fees.provisionalReceiptHint}</div>
          {pendingPayments.map((entry) => {
            const body = entry.body as { studentId?: number; amount?: number; method?: string };
            const student = students.find((s) => s.id === body.studentId);
            return (
              <div key={entry.clientRequestId} className="row row--gap-8 row--wrap sync-panel__row">
                <Badge label={t.fees.provisionalReceiptTitle} color={C.amber} />
                <span>{student?.name || `#${body.studentId ?? "—"}`}</span>
                <span className="table-pagination__info">{fmt(body.amount || 0)}</span>
                <Button variant="outline" onClick={() => discardQueuedPayment(entry.clientRequestId)}>
                  {t.fees.discardQueuedPayment}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {canReviewFlags && flaggedPayments.length > 0 && (
        <div className="alert alert--rose">
          <div className="sync-panel__title">
            {t.fees.flaggedPaymentsTitle} ({flaggedPayments.length})
          </div>
          <div className="sync-panel__hint">{t.fees.flaggedPaymentHint}</div>
          {flaggedPayments.map((p) => (
            <div key={p.id} className="row row--gap-8 row--wrap sync-panel__row">
              <span style={{ fontWeight: 600 }}>{p.student}</span>
              <span className="table-pagination__info">{fmt(p.amount)} — {p.receipt}</span>
              <Button variant="emerald" onClick={() => resolveFlag(p.id, "confirm")}>
                {t.fees.confirmFlag}
              </Button>
              <Button variant="rose" onClick={() => resolveFlag(p.id, "void")}>
                {t.fees.voidFlag}
              </Button>
            </div>
          ))}
        </div>
      )}

      {tab === "payments" && (
        isMobile ? (
          <RecordCardList>
            {payments.map((p) => (
              <RecordCard
                key={p.id}
                title={p.student}
                subtitle={`রোল: ${p.roll}`}
                headerRight={<div style={{ fontWeight: 700, color: C.emerald, fontSize: 15 }}>{fmt(p.amount)}</div>}
                fields={[
                  { label: "রসিদ নং", value: <span style={{ fontFamily: "monospace", color: C.teal, fontWeight: 600 }}>{p.receipt}</span> },
                  { label: "তারিখ", value: p.date },
                  { label: "মাধ্যম", value: <Badge label={p.method} color={C.sky} /> },
                  { label: "স্ট্যাটাস", value: <Badge label={p.status} color={paymentStatusColor(p.status)} /> },
                ]}
                actions={
                  <button type="button" onClick={() => setShowReceipt(p)} style={{ flex: 1, background: C.tealL, color: C.tealD, border: "none", borderRadius: 6, padding: "8px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>🧾 রসিদ</button>
                }
              />
            ))}
            {!payments.length && (
              <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, textAlign: "center", color: C.muted, fontSize: 13 }}>কোনো পেমেন্ট পাওয়া যায়নি।</div>
            )}
          </RecordCardList>
        ) : (
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
                  <td style={{ padding: "10px 14px" }}><Badge label={p.status} color={paymentStatusColor(p.status)} /></td>
                  <td style={{ padding: "10px 14px" }}>
                    <button type="button" onClick={() => setShowReceipt(p)} style={{ background: C.tealL, color: C.tealD, border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>🧾 রসিদ</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )
      )}

      {tab === "due" && (
        isMobile ? (
          <RecordCardList>
            {dueStudents.map((s) => (
              <RecordCard
                key={s.id}
                title={s.name}
                subtitle={`রোল: ${s.roll}  •  ক্লাস: ${s.class}`}
                headerRight={<span style={{ color: C.rose, fontWeight: 700, fontSize: 15 }}>{fmt(s.due)}</span>}
                fields={[
                  { label: "মাসিক বেতন", value: fmt(s.fee) },
                  { label: "বকেয়া", value: <span style={{ color: C.rose, fontWeight: 700 }}>{fmt(s.due)}</span> },
                ]}
                actions={
                  <button type="button" onClick={() => { setPayStudent(s); setTab("collect"); }} style={{ flex: 1, background: C.roseL, color: C.roseD, border: "none", borderRadius: 6, padding: "8px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>বেতন নিন</button>
                }
              />
            ))}
            {!dueStudents.length && (
              <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, textAlign: "center", color: C.muted, fontSize: 13 }}>কোনো বকেয়া ছাত্র নেই।</div>
            )}
            {dueTotalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginTop: 12 }}>
                <Button variant="outline" onClick={() => setDuePage((p) => Math.max(1, p - 1))} disabled={duePage <= 1}>Prev</Button>
                <span style={{ fontSize: 13, color: C.muted }}>{duePage} / {dueTotalPages}</span>
                <Button variant="outline" onClick={() => setDuePage((p) => Math.min(dueTotalPages, p + 1))} disabled={duePage >= dueTotalPages}>Next</Button>
              </div>
            )}
          </RecordCardList>
        ) : (
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
          {dueTotalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, padding: "12px 0" }}>
              <Button variant="outline" onClick={() => setDuePage((p) => Math.max(1, p - 1))} disabled={duePage <= 1}>Prev</Button>
              <span style={{ fontSize: 13, color: C.muted }}>{duePage} / {dueTotalPages}</span>
              <Button variant="outline" onClick={() => setDuePage((p) => Math.min(dueTotalPages, p + 1))} disabled={duePage >= dueTotalPages}>Next</Button>
            </div>
          )}
        </div>
        )
      )}

      {tab === "collect" && payStudent && (
        <div style={{ maxWidth: 480 }}>
          <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 18 }}>বেতন গ্রহণ</h3>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 6 }}>ছাত্র নির্বাচন করুন</label>
              <StudentPicker value={payStudent} onSelect={(s) => setPayStudent(s)} />
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
            <button type="button" disabled={paySaving} onClick={handlePayment} style={{ width: "100%", background: C.teal, color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 700, cursor: paySaving ? "default" : "pointer", fontSize: 15, opacity: paySaving ? 0.7 : 1 }}>
              {paySaving ? "⏳ সংরক্ষণ হচ্ছে..." : "✅ বেতন গ্রহণ করুন ও রসিদ তৈরি করুন"}
            </button>
          </div>
        </div>
      )}

      {tab === "collect" && !payStudent && (
        <div style={{ maxWidth: 480, background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 24, color: C.muted, fontSize: 13 }}>
          কোনো সক্রিয় ছাত্র পাওয়া যায়নি।
        </div>
      )}

      {showReceipt && <ReceiptModal payment={showReceipt} onClose={() => setShowReceipt(null)} />}

    </div>
  );
}
