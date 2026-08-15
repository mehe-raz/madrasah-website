import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { api } from "../../lib/api";
import { Button, Field, Input, Select, ClassCascadeSelect } from "../../components/ui";
import type { GuardianShellContext } from "../../components/GuardianShell";
import { classTreeLabel } from "../../lib/classTree";
import type { ClassOption } from "../../types";
import { Icons } from "../../lib/icons";

const statusBadgeClass = (status: string | null) => {
  if (status === "উপস্থিত") return "guardian-status-badge--present";
  if (status === "অনুপস্থিত") return "guardian-status-badge--absent";
  if (status === "দেরিতে") return "guardian-status-badge--late";
  return "guardian-status-badge--none";
};

export function GuardianDashboard() {
  const { children, unreadCount, refresh, classTree } = useOutletContext<GuardianShellContext>();
  const navigate = useNavigate();
  const [showAddChild, setShowAddChild] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [studentRoll, setStudentRoll] = useState("");
  const [studentClass, setStudentClass] = useState("");
  const [guardianMobile, setGuardianMobile] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  // Same fix as GuardianLogin.tsx's signup form: a dropdown of the exact
  // stored class strings, not free text, so "add another child" can't fail
  // on a typo'd/differently-formatted class name.
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  // classTree itself now comes from GuardianShellContext (fetched once in
  // GuardianShell, shared by every guardian page) instead of a second
  // fetch here — classOptions (the older flat fallback) still loads
  // locally since GuardianShell doesn't need it for anything else.
  useEffect(() => {
    let cancelled = false;
    api.getPublicClassOptions().then((options) => {
      if (!cancelled) setClassOptions(options);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
                <div className="guardian-child-avatar guardian-child-avatar--placeholder">
                  <Icons.childAvatar size={22} />
                </div>
              )}
              <div className="guardian-child-info">
                <div className="guardian-child-name">{c.name}</div>
                <div className="guardian-meta-text">
                  {classTreeLabel(classTree, c.class)} {c.section ? `· শাখা ${c.section}` : ""} · রোল {c.roll}
                </div>
              </div>
              <div className="guardian-child-status">
                <div className="guardian-child-status__label">আজকের উপস্থিতি</div>
                <span className={`guardian-status-badge ${statusBadgeClass(c.todayAttendance)}`}>
                  {c.todayAttendance || "এখনো নেওয়া হয়নি"}
                </span>
                {c.due > 0 && (
                  <>
                    <div className="guardian-child-status__label guardian-mt-md">বকেয়া বেতন</div>
                    <span className="guardian-status-badge guardian-status-badge--absent">৳{c.due}</span>
                    <Button variant="sky" solid onClick={() => navigate(`/guardian/pay/${c.id}`)}>
                      বিকাশে পরিশোধ করুন
                    </Button>
                  </>
                )}
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
            <p className="guardian-field-note">
              রোল ও ক্লাস আবশ্যক। নাম ও মোবাইল জানা থাকলে দিন — বেশি তথ্য মিললে সাথে সাথেই যুক্ত হবে, না মিললে/ফাঁকা রাখলে Admin অনুমোদনের পর যুক্ত হবে।
            </p>
            <Field label="শিক্ষার্থীর নাম">
              <Input value={studentName} onChange={(e) => setStudentName(e.target.value)} />
            </Field>
            <div className="guardian-form-row">
              <Field label="রোল নম্বর">
                <Input required value={studentRoll} onChange={(e) => setStudentRoll(e.target.value)} />
              </Field>
              {classTree.length ? (
                <ClassCascadeSelect
                  tree={classTree}
                  value={studentClass}
                  onChange={(en) => setStudentClass(en)}
                />
              ) : (
              <Field label="ক্লাস">
                {classOptions.length ? (
                  <Select required value={studentClass} onChange={(e) => setStudentClass(e.target.value)}>
                    <option value="">নির্বাচন করুন</option>
                    {classOptions.map((c) => (
                      <option key={c.en} value={c.en}>{c.bn}</option>
                    ))}
                  </Select>
                ) : (
                  <Input required value={studentClass} onChange={(e) => setStudentClass(e.target.value)} />
                )}
              </Field>
              )}
            </div>
            <Field label="শিক্ষার্থীর অভিভাবকের মোবাইল (ভর্তির সময় দেওয়া)">
              <Input value={guardianMobile} onChange={(e) => setGuardianMobile(e.target.value)} />
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
