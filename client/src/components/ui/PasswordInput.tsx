import { useState, type CSSProperties, type InputHTMLAttributes } from "react";
import { Icons } from "../../lib/icons";

interface WithError {
  /** Marks the field with the error/invalid border color (C.rose), same as <Input>. */
  error?: boolean;
}

function errorClass(base: string, error: boolean | undefined, className: string) {
  return [base, error ? "ds-error" : "", className].filter(Boolean).join(" ");
}

const toggleBtnStyle: CSSProperties = {
  position: "absolute",
  right: 4,
  top: "50%",
  transform: "translateY(-50%)",
  background: "none",
  border: "none",
  padding: 6,
  margin: 0,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  color: "var(--muted)",
  lineHeight: 0,
};

/**
 * Password `<input>` with a show/hide (eye icon) toggle. Drop-in replacement
 * for a plain `type="password"` input — accepts the same props (including
 * `style` for pages that use inline styling, e.g. Login.tsx/ResetPassword.tsx,
 * and `className`/`error` for pages using the ds-input design system, e.g.
 * GuardianLogin.tsx) so every login/signup/reset form in the app can see
 * what they're typing without changing its existing look.
 */
export function PasswordInput({
  error,
  className = "",
  style,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & WithError) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input
        type={visible ? "text" : "password"}
        className={errorClass("ds-input", error, className)}
        style={{ paddingRight: 34, ...style }}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? "পাসওয়ার্ড লুকান" : "পাসওয়ার্ড দেখান"}
        aria-pressed={visible}
        style={toggleBtnStyle}
      >
        {visible ? <Icons.eyeOff size={17} /> : <Icons.eye size={17} />}
      </button>
    </div>
  );
}
