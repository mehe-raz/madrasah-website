import { C } from "../theme/colors";

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "কন্টিনিউ →",
  cancelLabel = "না, থাক",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
      className="modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="soft-panel-strong modal-content"
        style={{
          padding: 24,
          maxWidth: 380,
          width: "100%",
        }}
      >
        <h3 style={{ fontSize: 17, fontWeight: 900, color: C.text, margin: "0 0 10px" }}>{title}</h3>
        <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.7, margin: "0 0 22px" }}>{message}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onCancel}
            className="pill nav-chip"
            style={{ border: `1px solid ${C.border}`, background: "transparent", color: C.text, padding: "10px 16px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="pill nav-chip"
            style={{ border: "none", background: `linear-gradient(135deg, ${C.sky}, ${C.emerald})`, color: "#fff", padding: "10px 16px", fontWeight: 900, fontSize: 13, cursor: "pointer" }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
