import { createEnglishPdf } from "./pdfEnglish";
import type { Payment, Settings } from "../types";
import { fmt } from "./fmt";

export function downloadReceiptPdf(payment: Payment, settings: Settings) {
  const doc = createEnglishPdf();
  let y = 18;

  doc.setFontSize(16);
  doc.text(settings.name || "Madrasah", 105, y, { align: "center" });
  y += 8;
  doc.setFontSize(10);
  doc.text(settings.address || "", 105, y, { align: "center" });
  y += 6;
  doc.text(settings.phone || "", 105, y, { align: "center" });
  y += 10;
  doc.setFontSize(13);
  doc.text("Fee Receipt", 105, y, { align: "center" });
  y += 12;

  doc.setFontSize(11);
  const rows: [string, string][] = [
    ["Receipt No", payment.receipt],
    ["Student", payment.student],
    ["Roll", payment.roll],
    ["Amount", fmt(payment.amount)],
    ["Date", payment.date],
    ["Method", payment.method],
    ["Status", payment.status],
  ];
  rows.forEach(([k, v]) => {
    doc.text(k, 20, y);
    doc.text(String(v), 190, y, { align: "right" });
    y += 8;
  });

  y += 6;
  doc.setFontSize(9);
  doc.text(settings.footer || "Thank you", 105, y, { align: "center" });

  doc.save(`receipt-${payment.receipt}.pdf`);
}
