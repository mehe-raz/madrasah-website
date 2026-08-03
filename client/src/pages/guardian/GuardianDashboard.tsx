import { useState, type FormEvent } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { api } from "../../lib/api";
import { Button, Field, Input } from "../../components/ui";
import type { GuardianShellContext } from "../../components/GuardianShell";

const statusBadgeClass = (status: string | null) => {
  if (status === "উপস্থিত") return "guardian-status-badge--present";
  if (status === "অনুপস্থিত") return "guardian-status-badge--absent";
  if (status === "দেরিতে") return "guardian-status-badge--late";
  return "guardian-status-badge--none";
};

export function GuardianDashboard() {
  const { children, unreadCount, refresh } = useOutletContext<GuardianShellContext>();
  const navigate = useNavigate();
  const [showAddChild, setShowAddChild] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [studentRoll, setStudentRoll] = useState("");
  const [studentClass, setStudentClass] = useState("");
  const [guardianMobile, setGuardianMobile] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const submitAddChild = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const res = await api.guardian.addChild({
        studentName: studentName.trim(),
        studentRoll: studentRoll.trim(),
        studentClass: studentClass.trim(),
        guardianMobile: guardianMobile.trim(),
      });
      setInfo(res.message);
      setStudentName("");
      setStudentRoll("");
      setStudentClass("");
      setGuardianMobile("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "যোগ করা যায়নি");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="guardian-page">
      <div className="soft-panel-strong guardian-panel">
        <div className="guardian-panel__row">
          <h1 className="guardian-title">ড্যাশবোর্ড</h1>
          {unreadCount > 0 && (
            <Button variant="rose" onClick={() => navigate("/guardian/feed")}>
              {unreadCount}টি নতুন নোটিশ
            </Button>
          )}
        </div>
      </div>

      {children.length === 0 ? (
        <div className="soft-panel guardian-empty">
          কোনো সক্রিয় সন্তান যুক্ত নেই। নতুন সন্তান যুক্ত করলে Admin অনুমোদনের পর এখানে দেখা যাবে।
        </div>
      ) : (
        <div className="guardian-child-list">
          {children.map((c) => (
            <div key={c.id} className="soft-panel guardian-child-card">
              {c.studentPhoto ? (
                <img src={c.studentPhoto} alt="" className="guardian-child-avatar" />
              ) : (
                <div className="guardian-child-avatar guardian-child-avatar--placeholder">🧒</div>
              )}
              <div className="guardian-child-info">
                <div className="guardian-child-name">{c.name}</div>
                <div className="guardian-meta-text">
                  {c.class} {c.section ? `· শাখা ${c.section}` : ""} · রোল {c.roll}
                </div>
              </div>
              <div className="guardian-child-status">
                <div className="guardian-child-status__label">আজকের উপস্থিতি</div>
                <span className={`guardian-status-badge ${statusBadgeClass(c.todayAttendance)}`}>
                  {c.todayAttendance || "এখনো নেওয়া হয়নি"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="soft-panel guardian-add-child">
        <button
          type="button"
          onClick={() => setShowAddChild((s) => !s)}
          className="guardian-link-btn guardian-link-btn--strong"
        >
          {showAddChild ? "বন্ধ করুন" : "+ আরেকটি সন্তান যুক্ত করুন"}
        </button>

        {showAddChild && (
          <form onSubmit={submitAddChild} className="guardian-stack-sm guardian-mt-md">
            <Field label="ছাত্রের নাম">
              <Input required value={studentName} onChange={(e) => setStudentName(e.target.value)} />
            </Field>
            <div className="guardian-form-row">
              <Field label="রোল নম্বর">
                <Input required value={studentRoll} onChange={(e) => setStudentRoll(e.target.value)} />
              </Field>
              <Field label="ক্লাস">
                <Input required value={studentClass} onChange={(e) => setStudentClass(e.target.value)} />
              </Field>
            </div>
            <Field label="ছাত্রের অভিভাবকের মোবাইল (ভর্তির সময় দেওয়া)">
              <Input required value={guardianMobile} onChange={(e) => setGuardianMobile(e.target.value)} />
            </Field>
            {error && <p className="guardian-error-text">{error}</p>}
            {info && <p className="guardian-info-text">{info}</p>}
            <Button type="submit" variant="teal" solid disabled={loading}>
              {loading ? "অপেক্ষা করুন..." : "যুক্ত করুন"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
