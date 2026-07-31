import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, HTMLAttributes } from "react";

interface WithError {
  /** Marks the field with the error/invalid border color (C.rose). */
  error?: boolean;
}

function errorClass(base: string, error: boolean | undefined, className: string) {
  return [base, error ? "ds-error" : "", className].filter(Boolean).join(" ");
}

export function Input({ error, className = "", ...rest }: InputHTMLAttributes<HTMLInputElement> & WithError) {
  return <input className={errorClass("ds-input", error, className)} {...rest} />;
}

export function Select({ error, className = "", ...rest }: SelectHTMLAttributes<HTMLSelectElement> & WithError) {
  return <select className={errorClass("ds-select", error, className)} {...rest} />;
}

export function Textarea({ error, className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & WithError) {
  return <textarea className={errorClass("ds-textarea", error, className)} {...rest} />;
}

interface FieldProps {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Label + control wrapper: <Field label={t.students.name}><Input .../></Field> */
export function Field({ label, children, className = "" }: FieldProps) {
  return (
    <label className={["ds-field", className].filter(Boolean).join(" ")}>
      <span className="ds-label">{label}</span>
      {children}
    </label>
  );
}

/** Read-only display box (same visual weight as an input) for computed
 * values like totals, GPA/grade previews, etc. — not an editable control. */
export function ReadonlyValue({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={["ds-readonly", className].filter(Boolean).join(" ")} {...rest} />;
}
