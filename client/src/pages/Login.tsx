import { useState, type CSSProperties, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useAppSettings, useLanguage } from "../context/AppSettingsContext";
import { useMadrasaBranding } from "../hooks/useMadrasaBranding";
import { api } from "../lib/api";
import { C } from "../theme/colors";

type Mode = "login" | "register" | "forgot" | "reset";

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

const linkBtn: CSSProperties = {
  background: "none",
  border: "none",
  color: C.link,
  cursor: "pointer",
  fontSize: 13,
  marginTop: 6,
};

export function Login() {
  const { user, login, register } = useAuth();
  const { settings } = useAppSettings();
  const { t } = useLanguage();
  const { name: madrasaName } = useMadrasaBranding();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
        navigate("/");
      } else if (mode === "register") {
        await register(name, email, password);
        navigate("/");
      } else if (mode === "forgot") {
        const res = await api.forgotPassword(email);
        setInfo(res.message + (res.resetToken ? ` Token: ${res.resetToken}` : ""));
        setMode("reset");
      } else if (mode === "reset") {
        await api.resetPassword(resetToken, password);
        setInfo(t.auth.passwordUpdated);
        setMode("login");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.requestFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 400, background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 28, boxShadow: "0 8px 32px rgba(0,0,0,0.08)" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          {settings.logo ? (
            <img src={settings.logo} alt="" loading="eager" decoding="async" style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover", marginBottom: 4 }} />
          ) : (
            <span style={{ fontSize: 40 }}>🕌</span>
          )}
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: "8px 0 4px" }}>{madrasaName}</h1>
          <p style={{ fontSize: 13, color: C.muted }}>
            {mode === "login" && t.auth.signInSubtitle}
            {mode === "register" && t.auth.registerSubtitle}
            {mode === "forgot" && t.auth.forgotSubtitle}
            {mode === "reset" && t.auth.resetSubtitle}
          </p>
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {mode === "register" && (
            <input required placeholder={t.auth.fullName} value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          )}
          {(mode === "login" || mode === "register" || mode === "forgot") && (
            <input required type="email" placeholder={t.auth.email} value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
          )}
          {mode === "reset" && (
            <input required placeholder={t.auth.resetToken} value={resetToken} onChange={(e) => setResetToken(e.target.value)} style={inputStyle} />
          )}
          {(mode === "login" || mode === "register" || mode === "reset") && (
            <input required type="password" placeholder={t.auth.passwordMin} value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} minLength={8} />
          )}
          {error && <p style={{ color: C.rose, fontSize: 13, margin: 0 }}>{error}</p>}
          {info && <p style={{ color: C.teal, fontSize: 13, margin: 0 }}>{info}</p>}
          <button type="submit" disabled={loading} style={{ background: C.teal, color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 700, cursor: "pointer", fontSize: 15 }}>
            {loading ? t.common.pleaseWait : mode === "login" ? t.auth.signIn : mode === "register" ? t.auth.register : mode === "forgot" ? t.auth.sendReset : t.auth.updatePassword}
          </button>
        </form>

        <div style={{ marginTop: 16, fontSize: 13, color: C.muted, textAlign: "center" }}>
          {mode === "login" && (
            <>
              <button type="button" onClick={() => setMode("forgot")} style={linkBtn}>{t.auth.forgotPassword}</button>
              <br />
              <button type="button" onClick={() => setMode("register")} style={linkBtn}>{t.auth.firstSetup}</button>
              <br />
              <button type="button" onClick={() => navigate("/?clearTenant=1")} style={linkBtn}>Public site</button>
            </>
          )}
          {mode !== "login" && (
            <button type="button" onClick={() => { setMode("login"); setError(""); }} style={linkBtn}>{t.auth.backToSignIn}</button>
          )}
        </div>
      </div>
    </div>
  );
}
