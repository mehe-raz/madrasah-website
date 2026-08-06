import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";

// bKash appends its own paymentID + status to the callback URL as query
// params, but those are NOT trusted for anything — see the comment on
// bkash_payment_intents in supabase_schema.sql and executePayment() in
// guardianAuth.js. paymentID is only ever used to look UP which intent to
// confirm; the confirmation itself is entirely server-side.
export function GuardianPayCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "failed">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const paymentID = searchParams.get("paymentID") || sessionStorage.getItem("guardianBkashPaymentId") || "";
    if (!paymentID) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot confirmation on mount, not a derived-from-props update
      setStatus("failed");
      setMessage("পেমেন্ট শনাক্ত করা যায়নি");
      return;
    }
    api.guardian
      .executeBkashPayment(paymentID)
      .then((res) => {
        sessionStorage.removeItem("guardianBkashPaymentId");
        if (res.ok) {
          setStatus("success");
          setMessage(res.receipt ? `পেমেন্ট সফল হয়েছে। রশিদ: ${res.receipt}` : "পেমেন্ট সফল হয়েছে");
        } else {
          setStatus("failed");
          setMessage(res.error || "পেমেন্ট সম্পন্ন হয়নি");
        }
      })
      .catch((err) => {
        setStatus("failed");
        setMessage(err instanceof Error ? err.message : "পেমেন্ট সম্পন্ন হয়নি");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="guardian-page">
      <div className="soft-panel-strong guardian-panel">
        <h1 className="guardian-title">বিকাশ পেমেন্ট</h1>
        {status === "loading" && <p className="guardian-meta-text">যাচাই করা হচ্ছে...</p>}
        {status === "success" && <p className="guardian-info-text">{message}</p>}
        {status === "failed" && <p className="guardian-error-text">{message}</p>}
      </div>
      {status !== "loading" && (
        <button type="button" className="guardian-link-btn guardian-link-btn--strong" onClick={() => navigate("/guardian")}>
          ড্যাশবোর্ডে ফিরে যান
        </button>
      )}
    </div>
  );
}
