import { useAppSettings, useLanguage } from "../context/AppSettingsContext";
import { downloadReceiptPdf } from "../lib/receiptPdf";
import { fmt } from "../lib/fmt";
import { C } from "../theme/colors";
import type { Payment } from "../types";

interface ReceiptModalProps {
  payment: Payment;
  onClose: () => void;
}

export function ReceiptModal({ payment, onClose }: ReceiptModalProps) {
  const { settings } = useAppSettings();
  const { t } = useLanguage();

  const receiptHtml = () => {
    const rows = [
      ["Receipt No", payment.receipt],
      ...(payment.category ? [["Category", payment.category]] : []),
      [payment.category ? "Details" : "Student", payment.student],
      ...(payment.roll && payment.roll !== "-" ? [["Roll", payment.roll]] : []),
      ["Amount", fmt(payment.amount)],
      ["Date", payment.date],
      ["Method", payment.method],
      ["Status", payment.status],
    ];
    const rowsHtml = rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:6px 0;color:#64748b">${k}</td><td style="padding:6px 0;text-align:right;font-weight:600">${v}</td></tr>`
      )
      .join("");
    return `<!DOCTYPE html><html><head><title>Receipt ${payment.receipt}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;max-width:400px;margin:0 auto}
      h1{font-size:18px;text-align:center} table{width:100%;border-collapse:collapse}
      .logo{display:block;max-height:64px;max-width:90px;margin:0 auto 10px}
      .footer{text-align:center;font-size:11px;color:#64748b;margin-top:16px}</style></head>
      <body>
      ${settings.logo ? `<img class="logo" src="${settings.logo}" alt="">` : ""}
      <h1>${settings.name}</h1>
      <p style="text-align:center;font-size:12px;color:#64748b">${settings.address}<br>${settings.phone}</p>
      <h2 style="text-align:center;font-size:14px;color:#0d9488">Fee Receipt</h2>
      <table>${rowsHtml}</table>
      <p class="footer">${settings.footer}</p>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`;
  };

  const handlePrint = () => {
    const w = window.open("", "_blank", "width=420,height=640");
    if (!w) return;
    w.document.write(receiptHtml());
    w.document.close();
  };

  const handlePdf = () => downloadReceiptPdf(payment, settings);

  const rows = [
    ["Receipt No", payment.receipt],
    ...(payment.category ? [["Category", payment.category]] : []),
    [payment.category ? "Details" : "Student", payment.student],
    ...(payment.roll && payment.roll !== "-" ? [["Roll", payment.roll]] : []),
    ["Amount", fmt(payment.amount)],
    ["Date", payment.date],
    ["Method", payment.method],
    ["Status", payment.status],
  ] as const;

  return (
    <div
      className="modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{ background: C.card, borderRadius: 16, padding: 28, width: 400, maxWidth: "100%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="receipt-print-area">
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            {settings.logo ? (
              <img src={settings.logo} alt="Logo" style={{ maxHeight: 56, marginBottom: 8 }} />
            ) : (
              <span style={{ fontSize: 24 }}>🕌</span>
            )}
            <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{settings.name}</h3>
            <p style={{ fontSize: 12, color: C.muted }}>{settings.address}</p>
            <hr style={{ border: "none", borderTop: `1px solid ${C.border}`, margin: "12px 0" }} />
            <h4 style={{ fontSize: 14, fontWeight: 600, color: C.teal, margin: 0 }}>Fee Receipt</h4>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
            {rows.map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  borderBottom: `1px dashed ${C.border}`,
                  paddingBottom: 6,
                }}
              >
                <span style={{ color: C.muted }}>{k}</span>
                <span style={{ fontWeight: 600, color: C.text }}>{v}</span>
              </div>
            ))}
          </div>
          <p style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: C.muted }}>{settings.footer}</p>
        </div>
        <div className="modal-actions" style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handlePrint}
            style={{
              flex: 1,
              minWidth: 90,
              background: C.teal,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "9px",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            🖨️ {t.common.print}
          </button>
          <button
            type="button"
            onClick={handlePdf}
            style={{
              flex: 1,
              minWidth: 90,
              background: C.violet,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "9px",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            📄 {t.common.downloadPdf}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              minWidth: 90,
              background: C.slateL,
              color: C.muted,
              border: "none",
              borderRadius: 8,
              padding: "9px",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {t.common.close}
          </button>
        </div>
      </div>
    </div>
  );
}
