import { useCallback, useEffect, useState } from "react";
import { Badge } from "../components/Badge";
import { deptColor } from "../data/mockData";
import { api } from "../lib/api";
import { fmt } from "../lib/fmt";
import { C } from "../theme/colors";
import type { Student } from "../types";
import { STUDENTS as MOCK_STUDENTS } from "../data/mockData";
import { useAuth } from "../context/AuthContext";

const emptyNew = {
  name: "",
  class: "",
  dept: "হিফজ",
  type: "আবাসিক",
  phone: "",
  blood: "O+",
  fee: 1500,
  due: 0,
};

export function Students() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("সব");
  const [selected, setSelected] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState({ phone: "", blood: "O+", fee: 0, due: 0 });
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newStudent, setNewStudent] = useState(emptyNew);
  const [students, setStudents] = useState<Student[]>(MOCK_STUDENTS);
  const [statusFilter, setStatusFilter] = useState<"সব" | "সক্রিয়" | "নিষ্ক্রিয়">("সক্রিয়");
  const [attMonth, setAttMonth] = useState(new Date().toISOString().slice(0, 7));
  const [attSummary, setAttSummary] = useState<{ present: number; absent: number; late: number } | null>(null);
  const [totalAttSummary, setTotalAttSummary] = useState<{ total: number; present: number; absent: number; late: number } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const depts = ["সব", "হিফজ", "কিতাব", "নাজেরা", "নূরানী"];

  const load = useCallback(async () => {
    const data = await api.getStudents({
      dept: filter !== "সব" ? filter : undefined,
      search: search || undefined,
      status: statusFilter === "সব" ? undefined : statusFilter,
    });
    setStudents(data);
  }, [filter, search, statusFilter]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (selected) {
      api.getStudentAttendance(selected.id, { month: attMonth }).then((r) => setAttSummary(r.summary));
      // Get total attendance summary from student profile
      api.getStudent(selected.id).then((student) => {
        setTotalAttSummary(student.attendanceSummary || null);
      });
    }
  }, [selected, attMonth]);

  const toggleStatus = async (s: Student) => {
    const next = s.status === "সক্রিয়" ? "নিষ্ক্রিয়" : "সক্রিয়";
    const updated = await api.updateStudent(s.id, { status: next });
    setStudents((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    if (selected?.id === s.id) setSelected(updated);
  };

  const filtered = students.filter(
    (s) =>
      (filter === "সব" || s.dept === filter) &&
      (s.name.includes(search) ||
        s.nameEn.toLowerCase().includes(search.toLowerCase()) ||
        s.roll.includes(search))
  );

  const openStudent = (s: Student) => {
    setEditForm({ phone: s.phone || "", blood: s.blood || "O+", fee: s.fee, due: s.due });
    setSelected(s);
  };

  const handleAdd = async () => {
    if (!newStudent.name) return;
    const payload = {
      name: newStudent.name,
      class: newStudent.class,
      dept: newStudent.dept,
      type: newStudent.type,
      phone: newStudent.phone,
      blood: newStudent.blood,
      fee: Number(newStudent.fee) || 1500,
      due: Number(newStudent.due) || 0,
    };
    try {
      const created = await api.createStudent(payload);
      setStudents((prev) => [...prev, created]);
    } catch {
      setStudents((prev) => [
        ...prev,
        {
          ...payload,
          id: prev.length + 1,
          roll: String(prev.length + 1).padStart(3, "0"),
          nameEn: "",
          blood: "O+",
          para: 0,
          status: "সক্রিয়",
        } as Student,
      ]);
    }
    setNewStudent(emptyNew);
    setShowAdd(false);
  };

  const handleSaveEdit = async () => {
    if (!selected) return;
    setSaving(true);
    const payload = {
      phone: editForm.phone,
      blood: editForm.blood,
      fee: Number(editForm.fee) || 0,
      due: Number(editForm.due) || 0,
    };
    try {
      const updated = await api.updateStudent(selected.id, payload);
      setStudents((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setSelected(updated);
    } catch {
      const updated = { ...selected, ...payload };
      setStudents((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setSelected(updated);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!confirm("আপনি কি নিশ্চিত যে আপনি এই ছাত্রকে মুছে ফেলতে চান?")) return;
    setDeleting(true);
    try {
      await api.deleteStudent(selected.id);
      setStudents((prev) => prev.filter((s) => s.id !== selected.id));
      setSelected(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "মুছে ফেলতে ব্যর্থ হয়েছে");
    } finally {
      setDeleting(false);
    }
  };

  const handlePrintStudent = () => {
    if (!selected) return;
    const w = window.open("", "_blank", "width=520,height=720");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Student ${selected.roll}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;max-width:520px;margin:0 auto;color:#111}
        h1{text-align:center;font-size:20px;margin:0 0 4px}
        h2{text-align:center;font-size:14px;font-weight:400;margin:0 0 18px;color:#555}
        table{width:100%;border-collapse:collapse;margin-top:12px}
        td{border-bottom:1px solid #ddd;padding:8px 4px;font-size:13px}
        td:first-child{color:#555;width:42%}
        .footer{text-align:center;margin-top:22px;font-size:12px;color:#666}
      </style></head><body>
      <h1>${selected.name}</h1>
      <h2>Student profile receipt</h2>
      <table>
        <tr><td>Roll</td><td>${selected.roll}</td></tr>
        <tr><td>Class</td><td>${selected.class || ""}</td></tr>
        <tr><td>Department</td><td>${selected.dept}</td></tr>
        <tr><td>Type</td><td>${selected.type}</td></tr>
        <tr><td>Phone</td><td>${editForm.phone || selected.phone || ""}</td></tr>
        <tr><td>Blood Group</td><td>${editForm.blood || selected.blood || ""}</td></tr>
        <tr><td>Monthly Fee</td><td>${fmt(Number(editForm.fee) || selected.fee)}</td></tr>
        <tr><td>Previous/Current Due</td><td>${fmt(Number(editForm.due) || selected.due)}</td></tr>
        <tr><td>Status</td><td>${selected.status}</td></tr>
      </table>
      <p class="footer">Printed: ${new Date().toLocaleString()}</p>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`);
    w.document.close();
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text }}>ছাত্র ব্যবস্থাপনা</h2>
        <button type="button" onClick={() => setShowAdd(true)} style={{ background: C.emerald, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 600, cursor: "pointer", fontSize: 14 }}>
          + নতুন ছাত্র
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="নাম বা রোল দিয়ে খুঁজুন..." style={{ flex: 1, minWidth: 180, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none" }} />
        {depts.map((d) => (
          <button key={d} type="button" onClick={() => setFilter(d)} style={{ border: `1px solid ${filter === d ? C.teal : C.border}`, background: filter === d ? C.tealL : C.card, color: filter === d ? C.tealD : C.muted, borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: filter === d ? 600 : 400 }}>
            {d}
          </button>
        ))}
        {(["সব", "সক্রিয়", "নিষ্ক্রিয়"] as const).map((st) => (
          <button key={st} type="button" onClick={() => setStatusFilter(st)} style={{ border: `1px solid ${statusFilter === st ? C.violet : C.border}`, background: statusFilter === st ? C.violetL : C.card, color: statusFilter === st ? C.violetD : C.muted, borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13 }}>
            {st}
          </button>
        ))}
      </div>

      {showAdd && (
        <div style={{ background: C.emeraldL, border: `1px solid ${C.emerald}40`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: C.emeraldD, marginBottom: 12 }}>নতুন ছাত্র যোগ করুন</h3>
          <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 12 }}>
            {([["নাম (বাংলা)", "name"], ["ক্লাস", "class"], ["ফোন", "phone"]] as const).map(([lbl, k]) => (
              <div key={k}>
                <label style={{ fontSize: 12, color: C.emeraldD, display: "block", marginBottom: 4 }}>{lbl}</label>
                <input
                  value={String(newStudent[k])}
                  onChange={(e) => setNewStudent({ ...newStudent, [k]: e.target.value })}
                  style={{ width: "100%", border: `1px solid ${C.emerald}60`, borderRadius: 6, padding: "7px 10px", fontSize: 13, boxSizing: "border-box" }}
                />
              </div>
            ))}
            {([["মাসিক বেতন (৳)", "fee"], ["বকেয়া (৳)", "due"]] as const).map(([lbl, k]) => (
              <div key={k}>
                <label style={{ fontSize: 12, color: C.emeraldD, display: "block", marginBottom: 4 }}>{lbl}</label>
                <input
                  type="number"
                  min={0}
                  value={newStudent[k]}
                  onChange={(e) => setNewStudent({ ...newStudent, [k]: Number(e.target.value) || 0 })}
                  style={{ width: "100%", border: `1px solid ${C.emerald}60`, borderRadius: 6, padding: "7px 10px", fontSize: 13, boxSizing: "border-box" }}
                />
              </div>
            ))}
            <div>
              <label style={{ fontSize: 12, color: C.emeraldD, display: "block", marginBottom: 4 }}>রক্তের গ্রুপ</label>
              <select value={newStudent.blood} onChange={(e) => setNewStudent({ ...newStudent, blood: e.target.value })} style={{ width: "100%", border: `1px solid ${C.emerald}60`, borderRadius: 6, padding: "7px 10px", fontSize: 13, boxSizing: "border-box" }}>
                {["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            {([["বিভাগ", "dept", ["হিফজ", "কিতাব", "নাজেরা", "নূরানী"]], ["ধরন", "type", ["আবাসিক", "অনাবাসিক"]]] as const).map(([lbl, k, opts]) => (
              <div key={k}>
                <label style={{ fontSize: 12, color: C.emeraldD, display: "block", marginBottom: 4 }}>{lbl}</label>
                <select value={newStudent[k]} onChange={(e) => setNewStudent({ ...newStudent, [k]: e.target.value })} style={{ width: "100%", border: `1px solid ${C.emerald}60`, borderRadius: 6, padding: "7px 10px", fontSize: 13, boxSizing: "border-box" }}>
                  {opts.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={handleAdd} style={{ background: C.emerald, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>সংরক্ষণ করুন</button>
            <button type="button" onClick={() => setShowAdd(false)} style={{ background: "transparent", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontSize: 13 }}>বাতিল</button>
          </div>
        </div>
      )}

      <div className="table-wrap" style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 640 }}>
          <thead>
            <tr style={{ background: C.slateL }}>
              {["রোল", "নাম", "ক্লাস", "বিভাগ", "ধরন", "বেতন", "বকেয়া", "স্ট্যাটাস", ""].map((h) => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: C.muted, fontWeight: 600, fontSize: 12, borderBottom: `1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, i) => (
              <tr key={s.id} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.card : "#fafbfc" }}>
                <td style={{ padding: "10px 14px", color: C.muted, fontWeight: 600 }}>{s.roll}</td>
                <td style={{ padding: "10px 14px" }}>
                  <div style={{ fontWeight: 600, color: C.text }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{s.nameEn}</div>
                </td>
                <td style={{ padding: "10px 14px", color: C.muted }}>{s.class}</td>
                <td style={{ padding: "10px 14px" }}><Badge label={s.dept} color={deptColor(s.dept)} /></td>
                <td style={{ padding: "10px 14px" }}><Badge label={s.type} color={s.type === "আবাসিক" ? C.sky : C.slate} /></td>
                <td style={{ padding: "10px 14px", color: C.text }}>{fmt(s.fee)}</td>
                <td style={{ padding: "10px 14px" }}><span style={{ color: s.due > 0 ? C.rose : C.emerald, fontWeight: 600 }}>{fmt(s.due)}</span></td>
                <td style={{ padding: "10px 14px" }}><Badge label={s.status} color={s.status === "সক্রিয়" ? C.emerald : C.rose} /></td>
                <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                  <button type="button" onClick={() => openStudent(s)} style={{ background: C.sky + "18", color: C.sky, border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600, marginRight: 4 }}>দেখুন</button>
                  <button type="button" onClick={() => toggleStatus(s)} style={{ background: s.status === "সক্রিয়" ? C.roseL : C.emeraldL, color: s.status === "সক্রিয়" ? C.rose : C.emerald, border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                    {s.status === "সক্রিয়" ? "নিষ্ক্রিয়" : "সক্রিয়"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: "10px 14px", color: C.muted, fontSize: 12, borderTop: `1px solid ${C.border}` }}>মোট {filtered.length} জন ছাত্র</div>
      </div>

      {selected && (
        <div className="modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setSelected(null)}>
          <div className="modal-content" style={{ background: C.card, borderRadius: 16, padding: 28, width: 440, maxWidth: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: C.tealL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: C.tealD }}>{selected.name[0]}</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{selected.name}</div>
                <div style={{ fontSize: 13, color: C.muted }}>{selected.nameEn} · রোল: {selected.roll}</div>
              </div>
              <button type="button" onClick={() => setSelected(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", fontSize: 20, color: C.muted }}>✕</button>
            </div>
            <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {([["ক্লাস", selected.class], ["বিভাগ", selected.dept], ["ধরন", selected.type], ["রক্তের গ্রুপ", selected.blood], ["কমপ্লিটেড পারা", selected.para || "—"], ["স্ট্যাটাস", selected.status]] as const).map(([k, v]) => (
                <div key={k} style={{ background: C.slateL, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>{k}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14, padding: 12, background: C.slateL, borderRadius: 8, fontSize: 12, color: C.muted }}>
              <div>বর্তমান ফোন: <strong style={{ color: C.text }}>{selected.phone || "—"}</strong></div>
              <div>ভর্তির সময় ধার্য মাসিক বেতন: <strong style={{ color: C.text }}>{fmt(selected.fee)}</strong></div>
              <div>বর্তমান/পূর্বের বকেয়া: <strong style={{ color: selected.due > 0 ? C.rose : C.emerald }}>{fmt(selected.due)}</strong></div>
            </div>
            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 4 }}>ফোন</label>
                <input
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  placeholder="01XXXXXXXXX"
                  style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px", fontSize: 13, boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 4 }}>রক্তের গ্রুপ</label>
                <select
                  value={editForm.blood}
                  onChange={(e) => setEditForm({ ...editForm, blood: e.target.value })}
                  style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px", fontSize: 13, boxSizing: "border-box" }}
                >
                  {["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 4 }}>মাসিক বেতন (৳)</label>
                <input
                  type="number"
                  min={0}
                  value={editForm.fee}
                  onChange={(e) => setEditForm({ ...editForm, fee: Number(e.target.value) || 0 })}
                  style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px", fontSize: 13, boxSizing: "border-box" }}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 4 }}>বকেয়া (৳)</label>
                <input
                  type="number"
                  min={0}
                  value={editForm.due}
                  onChange={(e) => setEditForm({ ...editForm, due: Number(e.target.value) || 0 })}
                  style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px", fontSize: 13, boxSizing: "border-box" }}
                />
              </div>
            </div>
            <div style={{ marginTop: 16, padding: 12, background: C.slateL, borderRadius: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>হাজিরা সারাংশ (মাস)</div>
              <input type="month" value={attMonth} onChange={(e) => setAttMonth(e.target.value)} style={{ marginBottom: 8, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", fontSize: 12 }} />
              {attSummary && (
                <div>
                  <span style={{ color: C.emerald, marginRight: 12 }}>উপস্থিত: {attSummary.present}</span>
                  <span style={{ color: C.rose, marginRight: 12 }}>অনুপস্থিত: {attSummary.absent}</span>
                  <span style={{ color: C.amber }}>দেরি: {attSummary.late}</span>
                </div>
              )}
            </div>
            {totalAttSummary && (
              <div style={{ marginTop: 12, padding: 12, background: C.tealL, borderRadius: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, color: C.tealD }}>মোট হাজিরা সারাংশ</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }} className="attendance-stats-grid">
                  <div style={{ textAlign: "center", padding: 8, background: "#fff", borderRadius: 6 }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{totalAttSummary.total}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>মোট দিন</div>
                  </div>
                  <div style={{ textAlign: "center", padding: 8, background: "#fff", borderRadius: 6 }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: C.emerald }}>{totalAttSummary.present}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>উপস্থিত</div>
                  </div>
                  <div style={{ textAlign: "center", padding: 8, background: "#fff", borderRadius: 6 }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: C.rose }}>{totalAttSummary.absent}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>অনুপস্থিত</div>
                  </div>
                  <div style={{ textAlign: "center", padding: 8, background: "#fff", borderRadius: 6 }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: C.amber }}>{totalAttSummary.late}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>দেরি</div>
                  </div>
                </div>
              </div>
            )}
            <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveEdit}
                style={{ flex: 1, minWidth: "120px", background: C.emerald, color: "#fff", border: "none", borderRadius: 8, padding: "10px", fontWeight: 600, cursor: saving ? "wait" : "pointer", fontSize: 14 }}
              >
                {saving ? "সংরক্ষণ হচ্ছে…" : "💾 পরিবর্তন সংরক্ষণ"}
              </button>
              <button
                type="button"
                onClick={handlePrintStudent}
                style={{ minWidth: "80px", background: C.violet, color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 600, cursor: "pointer", fontSize: 14 }}
              >
                Print
              </button>
              {user?.role === "Super Admin" && (
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDelete}
                  style={{ minWidth: "80px", background: C.rose, color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 600, cursor: deleting ? "wait" : "pointer", fontSize: 14 }}
                >
                  {deleting ? "মুছছে…" : "🗑️ মুছুন"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
