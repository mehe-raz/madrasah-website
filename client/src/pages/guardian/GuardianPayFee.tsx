import { useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { Button, Field, Input } from "../../components/ui";
import { api } from "../../lib/api";
import type { GuardianShellContext } from "../../components/GuardianShell";

export function GuardianPayFee() {
  const { children } = useOutletContext<GuardianShellContext>();
  const navigate = useNavigate();
  const params = useParams<{ studentId: string }>();
  const studentId = Number(params.studentId);
  const child = children.find((c) => c.id === studentId);

  const [amount, setAmount] = useState(child ? String(child.due) : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!child) {
    return <div className="soft-panel guardian-empty">শিক্ষার্থী পাওয়া যায়নি।</div>;
  }

  const startPayment = async () => {
    const value = Number(amount);
    if (!(value > 0)) {
      setError("সঠিক পরিমাণ দিন");
      return;
    }
    if (value > child.due) {
      setError("বকেয়ার চেয়ে বেশি পরিমাণ দেওয়া যাবে না");
      return;
    }
    setLoading(true);
    setError("");
    try {
      // sessionStorage survives the round-trip through bKash's own site,
      // so GuardianPayCallback.tsx knows which paymentID to confirm once
      // bKash redirects back — same reasoning as any client-side checkout
      // handoff (unlike a server session, nothing here needs to persist
      // beyond this one browser tab/session).
      const { bkashURL, paymentID } = await api.guardian.createBkashPayment(studentId, value);
      sessionStorage.setItem("guardianBkashPaymentId", paymentID);
      window.location.href = bkashURL;
    } catch (err) {
      setError(err instanceof Error ? err.message : "পেমেন্ট শুরু করা যায়নি");
      setLoading(false);
    }
  };

  return (
    <div className="guardian-page">
      <div className="soft-panel-strong guardian-panel">
        <h1 className="guardian-title">বিকাশে বেতন পরিশোধ</h1>
        <p className="guardian-meta-text">
          {child.name} · রোল {child.roll} — বকেয়া ৳{child.due}
        </p>
      </div>

      <div className="soft-panel guardian-stack-sm">
        <Field label="পরিমাণ (৳)">
          <Input type="number" min={1} max={child.due} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        {error && <p className="guardian-error-text">{error}</p>}
        <Button variant="sky" solid onClick={startPayment} disabled={loading}>
          {loading ? "অপেক্ষা করুন..." : "বিকাশে পরিশোধ করুন"}
        </Button>
        <button type="button" className="guardian-link-btn" onClick={() => navigate("/guardian")}>
          বাতিল করুন
        </button>
      </div>
    </div>
  );
}
