import { useState, type CSSProperties, type FormEvent, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { C } from "../theme/colors";

const inputStyle: CSSProperties = {
  width: "100%",
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "11px 14px",
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

  useEffect(() => {
    const tokenFromUrl = searchParams.get("token");
    if (tokenFromUrl) {
      setToken(tokenFromUrl);
    } else {
      setError("Invalid or missing reset token");
    }
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
      <div style={{ width: "100%", maxWidth: 400, background: C.card, borderRadius: 18, border: `1px solid ${C.border}`, borderTop: `3px solid ${C.teal}`, padding: 32, boxShadow: "0 12px 44px rgba(20,16,10,0.12)" }}>
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <span style={{ fontSize: 40 }}>🔑</span>
          <h1 style={{ fontSize: 21, fontWeight: 700, color: C.text, margin: "10px 0 5px", fontFamily: "'Playfair Display', 'Noto Serif Bengali', serif" }}>Reset Password</h1>
          <p style={{ fontSize: 13, color: C.muted }}>Enter your new password</p>
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
            style={{ background: C.teal, color: "#fdfbf6", border: "none", borderRadius: 10, padding: "12px", fontWeight: 700, cursor: "pointer", fontSize: 15, letterSpacing: 0.3, boxShadow: "0 4px 14px rgba(169,129,47,0.28)" }}
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
