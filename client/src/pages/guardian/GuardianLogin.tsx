import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useGuardianAuth } from "../../context/GuardianAuthContext";
import { useMadrasaBranding } from "../../hooks/useMadrasaBranding";
import { api } from "../../lib/api";
import { Button, Field, Input, Select, ClassCascadeSelect } from "../../components/ui";
import type { ClassOption, ClassTreeNode } from "../../types";
import { Icons } from "../../lib/icons";

type Mode = "login" | "signup";

export function GuardianLogin() {
  const { user, login } = useGuardianAuth();
  const { name: madrasaName, logo } = useMadrasaBranding();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  // Login fields
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  // Signup fields
  const [guardianName, setGuardianName] = useState("");
  const [contactMobile, setContactMobile] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentRoll, setStudentRoll] = useState("");
  const [studentClass, setStudentClass] = useState("");
  const [guardianMobile, setGuardianMobile] = useState("");

  // Free-typed class names were the actual cause of "student not found"
  // failures reported by guardians who matched the class exactly at
  // signup — the server's lookup is an exact string match against
  // students.class (see routes/guardianAuth.js), so any spelling/spacing
  // difference from what's stored silently fails the whole match. A
  // dropdown sourced from the same public master list AdmissionApply.tsx
  // uses (value = the exact stored string, label = the readable Bengali
  // name) removes that entire failure mode.
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  // Hierarchical replacement for classOptions above (server/src/lib/classTree.js)
  // — preferred whenever it has loaded and is non-empty. Public/unauthenticated
  // endpoint since this page has no login yet (that's the whole point of it).
  const [classTree, setClassTree] = useState<ClassTreeNode[]>([]);
  useEffect(() => {
    let cancelled = false;
    api.getPublicClassOptions().then((options) => {
      if (!cancelled) setClassOptions(options);
    }).catch(() => {});
    api.getPublicClassTree().then((tree) => {
      if (!cancelled) setClassTree(tree);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (user) return <Navigate to="/guardian" replace />;

  const submitLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(identifier.trim(), password);
      navigate("/guardian");
    } catch (err) {
      setError(err instanceof Error ? err.message : "লগইন ব্যর্থ হয়েছে");
    } finally {
      setLoading(false);
    }
  };

  const submitSignup = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const res = await api.guardian.signup({
        guardianName: guardianName.trim(),
        contactMobile: contactMobile.trim(),
        contactEmail: contactEmail.trim(),
        password: signupPassword,
        studentName: studentName.trim(),
        studentRoll: studentRoll.trim(),
        studentClass: studentClass.trim(),
        guardianMobile: guardianMobile.trim(),
      });
      if (res.status === "active") {
        navigate("/guardian");
      } else {
        setInfo(res.message || "আপনার তথ্য জমা হয়েছে। Admin অনুমোদনের পর আপনি লগইন করতে পারবেন।");
        setMode("login");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "সাইনআপ ব্যর্থ হয়েছে");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="guardian-auth-page">
      <div className="guardian-auth-card">
        <div className="guardian-auth-head">
          {logo ? (
            <img src={logo} alt="" className="guardian-auth-logo" />
          ) : (
            <span className="guardian-auth-emoji"><Icons.brand size={40} /></span>
          )}
          <h1 className="guardian-auth-title">{madrasaName}</h1>
          <p className="guardian-auth-subtitle">
            {mode === "login" ? "অভিভাবক পোর্টালে লগইন করুন" : "নতুন অভিভাবক অ্যাকাউন্ট খুলুন"}
          </p>
        </div>

        {mode === "login" ? (
          <form onSubmit={submitLogin} className="guardian-auth-form">
            <Field label="মোবাইল অথবা ইমেইল">
              <Input required value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="01XXXXXXXXX" />
            </Field>
            <Field label="পাসওয়ার্ড">
              <Input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {error && <p className="guardian-error-text">{error}</p>}
            {info && <p className="guardian-info-text">{info}</p>}
            <Button type="submit" variant="teal" solid fullWidth disabled={loading}>
              {loading ? "অপেক্ষা করুন..." : "লগইন"}
            </Button>
            <button
              type="button"
              onClick={() => { setMode("signup"); setError(""); setInfo(""); }}
              className="guardian-link-btn guardian-link-btn--spaced"
            >
              নতুন অ্যাকাউন্ট? সাইনআপ করুন
            </button>
          </form>
        ) : (
          <form onSubmit={submitSignup} className="guardian-auth-form">
            <Field label="আপনার নাম">
              <Input required value={guardianName} onChange={(e) => setGuardianName(e.target.value)} />
            </Field>
            <div className="guardian-form-row">
              <Field label="আপনার মোবাইল">
                <Input value={contactMobile} onChange={(e) => setContactMobile(e.target.value)} placeholder="01XXXXXXXXX" />
              </Field>
              <Field label="আপনার ইমেইল">
                <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
              </Field>
            </div>
            <p className="guardian-field-note">মোবাইল অথবা ইমেইলের অন্তত একটি দিন — এটি দিয়েই পরে লগইন করবেন।</p>
            <Field label="নতুন পাসওয়ার্ড">
              <Input required type="password" minLength={8} value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} />
            </Field>

            <div className="guardian-auth-divider">
              <p className="guardian-auth-divider__title">ছাত্রের তথ্য (যাচাইয়ের জন্য)</p>
              <p className="guardian-field-note">
                রোল ও ক্লাস আবশ্যক। নাম ও মোবাইল জানা থাকলে দিন — বেশি তথ্য মিললে সাথে সাথেই অ্যাকাউন্ট সক্রিয় হবে, না মিললে/ফাঁকা রাখলে Admin অনুমোদনের পর সক্রিয় হবে।
              </p>
              <div className="guardian-stack-sm">
                <Field label="ছাত্রের নাম">
                  <Input value={studentName} onChange={(e) => setStudentName(e.target.value)} />
                </Field>
                <div className="guardian-form-row">
                  <Field label="রোল নম্বর">
                    <Input required value={studentRoll} onChange={(e) => setStudentRoll(e.target.value)} />
                  </Field>
                  {classTree.length ? (
                    <ClassCascadeSelect
                      label="ক্লাস"
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
                <Field label="ছাত্রের অভিভাবকের মোবাইল (ভর্তির সময় দেওয়া)">
                  <Input value={guardianMobile} onChange={(e) => setGuardianMobile(e.target.value)} placeholder="01XXXXXXXXX" />
                </Field>
              </div>
            </div>

            {error && <p className="guardian-error-text">{error}</p>}
            <Button type="submit" variant="teal" solid fullWidth disabled={loading}>
              {loading ? "অপেক্ষা করুন..." : "সাইনআপ করুন"}
            </Button>
            <button
              type="button"
              onClick={() => { setMode("login"); setError(""); }}
              className="guardian-link-btn guardian-link-btn--spaced"
            >
              আগে থেকেই অ্যাকাউন্ট আছে? লগইন করুন
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
