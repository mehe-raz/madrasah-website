/**
 * Print-based report/document generator.
 *
 * Bengali PDFs generated directly with jsPDF used to break (matras/juktoborno
 * out of order) because jsPDF draws glyph-by-glyph and does not do proper
 * Unicode text shaping for Indic scripts. The browser's own rendering +
 * print-to-PDF engine (Chrome's "Save as PDF" from the print dialog) does
 * this correctly, so instead of drawing a PDF ourselves we open a small,
 * print-ready HTML document and let the browser's native print/print-to-PDF
 * handle the Bengali text. This matches how ReceiptModal already worked.
 */

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function madrasaSettings(): { name: string; logo?: string } {
  try {
    const raw = localStorage.getItem("madrasah-settings");
    if (raw) {
      const s = JSON.parse(raw) as { name?: string; logo?: string };
      return { name: s.name || "Madrasah ERP", logo: s.logo };
    }
  } catch {
    /* ignore */
  }
  return { name: "Madrasah ERP" };
}

const PRINT_STYLES = `
  @page { margin: 12mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Noto Sans Bengali", "Noto Sans", "Segoe UI", Arial, sans-serif;
    margin: 0; padding: 20px; color: #1e293b;
  }
  header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; border-bottom: 2px solid #0d9488; padding-bottom: 12px; }
  header img { height: 46px; width: 46px; object-fit: contain; border-radius: 6px; }
  header h1 { font-size: 17px; margin: 0; }
  header h2 { font-size: 13px; margin: 3px 0 0; font-weight: 600; color: #0d9488; }
  header .meta { font-size: 11px; color: #64748b; margin-top: 3px; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; font-weight: 700; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 4px; }
  .cell { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; }
  .cell .label { font-size: 10.5px; color: #64748b; margin-bottom: 2px; }
  .cell .value { font-size: 12.5px; font-weight: 700; }
  @media print {
    .no-print { display: none !important; }
  }
`;

function openPrintWindow(title: string, bodyHtml: string) {
  const settings = madrasaSettings();
  const w = window.open("", "_blank", "width=960,height=720");
  if (!w) return;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
    <style>${PRINT_STYLES}</style></head>
    <body>
      <header>
        ${settings.logo ? `<img src="${escapeHtml(settings.logo)}" alt="">` : ""}
        <div>
          <h1>${escapeHtml(settings.name)}</h1>
          <h2>${escapeHtml(title)}</h2>
          <div class="meta">তৈরি: ${new Date().toLocaleString("bn-BD")}</div>
        </div>
      </header>
      ${bodyHtml}
      <script>window.onload = function () { window.print(); };</script>
    </body></html>`;

  w.document.write(html);
  w.document.close();
}

export interface PrintTableOptions {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: (string | number)[][];
}

/** Print a tabular report (student list, due list, income, expenses, etc.) */
export function printReportTable({ title, subtitle, headers, rows }: PrintTableOptions) {
  const thead = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
  const tbody = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");
  const body = `
    ${subtitle ? `<p style="font-size:12px;color:#64748b;margin:0 0 10px">${escapeHtml(subtitle)}</p>` : ""}
    <table><thead>${thead}</thead><tbody>${tbody}</tbody></table>
  `;
  openPrintWindow(title, body);
}

export interface PrintDetailOptions {
  title: string;
  subtitle?: string;
  rows: [string, string | number | null | undefined][];
}

/** Print a label/value detail sheet (e.g. student profile / full history) */
export function printDetailSheet({ title, subtitle, rows }: PrintDetailOptions) {
  const cells = rows
    .map(
      ([label, value]) =>
        `<div class="cell"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`
    )
    .join("");
  const body = `
    ${subtitle ? `<p style="font-size:12px;color:#64748b;margin:0 0 10px">${escapeHtml(subtitle)}</p>` : ""}
    <div class="grid">${cells}</div>
  `;
  openPrintWindow(title, body);
}
