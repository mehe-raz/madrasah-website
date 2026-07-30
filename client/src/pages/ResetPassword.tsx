import { useState, type CSSProperties, type FormEvent, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useSeoMeta } from "../hooks/useSeoMeta";
import { C } from "../theme/colors";

const inputStyle: CSSProperties = {
  width: "100%",
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14,
  boxSizing: "border-box",
  background: C.card,
  color: C.text,
};

export function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  useSeoMeta({ title: "পাসওয়ার্ড রিসেট", index: false });

  // Emails now contain a plain 6-digit code, not a clickable link, so this
  // page no longer requires a ?token= query param — the code is typed in by
  // hand below. Still pre-fill from the URL for anyone with an old bookmark/
  // link, but it's optional rather than required.
  useEffect(() => {
    const tokenFromUrl = searchParams.get("token");
    if (tokenFromUrl) setToken(tokenFromUrl.replace(/\D/g, "").slice(0, 6));
  }, [searchParams]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setInfo("Password updated successfully. Redirecting to login...");
      setTimeout(() => {
        navigate("/login");
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 400, background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 28, boxShadow: "0 8px 32px rgba(0,0,0,0.08)" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <span style={{ fontSize: 40 }}>🔑</span>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: "8px 0 4px" }}>Reset Password</h1>
          <p style={{ fontSize: 13, color: C.muted }}>Enter the 6-digit code we emailed you and your new password</p>
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            required
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="6-digit code"
            value={token}
            onChange={(e) => setToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
            style={{ ...inputStyle, textAlign: "center", fontSize: 22, fontWeight: 800, letterSpacing: 10, fontFamily: "monospace" }}
          />
          <input
            required
            type="password"
            placeholder="New password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            minLength={8}
          />
          {error && <p style={{ color: C.rose, fontSize: 13, margin: 0 }}>{error}</p>}
          {info && <p style={{ color: C.teal, fontSize: 13, margin: 0 }}>{info}</p>}
          <button
            type="submit"
            disabled={loading || !token}
            style={{ background: C.teal, color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 700, cursor: "pointer", fontSize: 15 }}
          >
            {loading ? "Please wait..." : "Update Password"}
          </button>
        </form>

        <div style={{ marginTop: 16, fontSize: 13, color: C.muted, textAlign: "center" }}>
          <button
            type="button"
            onClick={() => navigate("/login")}
            style={{ background: "none", border: "none", color: C.link, cursor: "pointer", fontSize: 13 }}
          >
            Back to login
          </button>
        </div>
      </div>
    </div>
  );
}
