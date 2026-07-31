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
    <div role="dialog" aria-modal="true" onClick={onCancel} className="modal-backdrop">
      <div onClick={(e) => e.stopPropagation()} className="soft-panel-strong modal-content confirm-modal__panel">
        <h3 className="confirm-modal__title">{title}</h3>
        <p className="confirm-modal__message">{message}</p>
        <div className="confirm-modal__actions">
          <button type="button" onClick={onCancel} className="pill nav-chip confirm-modal__cancel">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className="pill nav-chip confirm-modal__confirm">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
