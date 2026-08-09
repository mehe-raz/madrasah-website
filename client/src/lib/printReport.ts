import type { Student } from "../types";

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
  header {
    display: flex; align-items: center; gap: 12px; margin-bottom: 16px;
    border-bottom: 2px solid #0d9488; padding-bottom: 12px;
  }
  header img { height: 46px; width: 46px; object-fit: contain; border-radius: 6px; }
  header h1 { font-size: 17px; margin: 0; }
  header h2 { font-size: 13px; margin: 3px 0 0; font-weight: 600; color: #0d9488; }
  header .meta { font-size: 11px; color: #64748b; margin-top: 3px; }
  .section {
    border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;
    margin-top: 14px;
  }
  .section-title {
    background: #f8fafc; padding: 8px 12px; font-size: 12px; font-weight: 800;
    color: #0f172a; border-bottom: 1px solid #e2e8f0;
  }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 10px; }
  .cell {
    background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px;
    min-height: 56px;
  }
  .cell .label { font-size: 10.5px; color: #64748b; margin-bottom: 3px; }
  .cell .value { font-size: 12.5px; font-weight: 700; color: #0f172a; white-space: pre-wrap; }
  .top { display: grid; grid-template-columns: 1.35fr .65fr; gap: 12px; }
  .photoBox {
    border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; text-align: center;
    background: #f8fafc;
  }
  .photoBox img { max-width: 100%; max-height: 170px; object-fit: cover; border-radius: 8px; }
  .photoBox .empty { color: #94a3b8; font-size: 12px; padding: 36px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; font-weight: 700; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  .no-print { display: none !important; }
  @media print {
    .no-print { display: none !important; }
  }
`;

/** Thrown when the browser blocks window.open (popup blocker enabled). */
export class PopupBlockedError extends Error {
  constructor() {
    super("POPUP_BLOCKED");
    this.name = "PopupBlockedError";
  }
}

function writePrintWindow(w: Window, title: string, bodyHtml: string) {
  const settings = madrasaSettings();
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
    </body></html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();

  // NOTE: intentionally NOT an inline <script> inside the written HTML.
  // The app's CSP (script-src 'self', no 'unsafe-inline') blocks inline
  // scripts, and this new window inherits that same CSP since it was
  // opened as "about:blank" from this origin. An inline <script>window.print()</script>
  // written into it would silently fail to run — the print dialog never
  // opens, you just see the data. Setting w.onload from here instead runs
  // in the *opener's* script context, which is same-origin JS and already
  // allowed, so it isn't affected by the child document's CSP.
  w.onload = () => {
    w.focus();
    w.print();
  };
}

function openPrintWindow(title: string, bodyHtml: string, targetWindow?: Window | null) {
  const w = targetWindow ?? window.open("", "_blank", "width=980,height=760");
  if (!w) throw new PopupBlockedError();
  writePrintWindow(w, title, bodyHtml);
}

// Lower-level opener for print layouts that don't want the shared
// left-aligned admin-report <header> (logo+name+title row) — e.g. the
// result sheet below, which uses its own centered, certificate-style
// header. Shares the same popup-blocked handling and CSP-safe print
// trigger as writePrintWindow/openPrintWindow above.
function openRawPrintWindow(title: string, styles: string, bodyHtml: string, targetWindow?: Window | null) {
  const w = targetWindow ?? window.open("", "_blank", "width=980,height=760");
  if (!w) throw new PopupBlockedError();
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
    <style>${styles}</style></head><body>${bodyHtml}</body></html>`;
  w.document.open();
  w.document.write(html);
  w.document.close();
  // See the matching comment in writePrintWindow() — must stay an
  // onload handler set from the opener's JS context, not an inline
  // <script>, because of this app's CSP.
  w.onload = () => {
    w.focus();
    w.print();
  };
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

function section(title: string, rows: [string, string | number | null | undefined][]) {
  return `
    <div class="section">
      <div class="section-title">${escapeHtml(title)}</div>
      <div class="grid">
        ${rows
          .map(
            ([label, value]) => `
              <div class="cell">
                <div class="label">${escapeHtml(label)}</div>
                <div class="value">${escapeHtml(value)}</div>
              </div>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

export function printAdmissionForm(student: Student, targetWindow?: Window | null) {
  const topRows: [string, string | number | null | undefined][] = [
    ["ভর্তি নং", student.admissionNumber || ""],
    ["ভর্তির তারিখ", student.admissionDate || ""],
    ["শিক্ষাবর্ষ", student.academicYear || ""],
    ["সেশন", student.session || ""],
    ["ক্লাস / জামাত", student.class || ""],
    ["শাখা", student.section || ""],
    ["রোল", student.roll || ""],
    ["ধরন", student.type || ""],
    ["নাম (বাংলা)", student.name || ""],
    ["নাম (ইংরেজি)", student.nameEn || ""],
    ["জন্ম তারিখ", student.dateOfBirth || ""],
    ["জন্ম নিবন্ধন নম্বর", student.birthRegistrationNumber || "ঐচ্ছিক"],
    ["লিঙ্গ", student.gender || ""],
    ["ধর্ম", student.religion || ""],
    ["রক্তের গ্রুপ", student.blood || ""],
  ];

  const guardianRows: [string, string | number | null | undefined][] = [
    ["পিতার নাম", student.fatherName || ""],
    ["পিতার মোবাইল", student.fatherMobile || ""],
    ["পিতার পেশা", student.fatherOccupation || ""],
    ["মাতার নাম", student.motherName || ""],
    ["মাতার মোবাইল", student.motherMobile || ""],
    ["মাতার পেশা", student.motherOccupation || ""],
    ["অভিভাবকের নাম", student.guardianName || ""],
    ["সম্পর্ক", student.guardianRelationship || ""],
    ["অভিভাবকের মোবাইল", student.guardianMobile || ""],
  ];

  const addressRows: [string, string | number | null | undefined][] = [
    ["বর্তমান ঠিকানা", student.presentAddress || ""],
    ["স্থায়ী ঠিকানা", student.permanentAddress || ""],
    ["জেলা", student.district || ""],
    ["উপজেলা", student.upazila || ""],
    ["ডাকঘর", student.postOffice || ""],
    ["গ্রাম", student.village || ""],
  ];

  const studyRows: [string, string | number | null | undefined][] = [
    ["পূর্বের প্রতিষ্ঠান", student.previousInstitution || ""],
    ["পূর্বের ক্লাস", student.previousClass || ""],
    ["বিভাগ", student.dept || ""],
    ["মুখস্থ কুরআন (পারা)", student.para ?? ""],
    ["ভর্তি ফি", student.admissionFee ?? 0],
    ["মাসিক বেতন", student.fee ?? 0],
    ["ছাড়", student.discount ?? 0],
    ["বকেয়া", student.due ?? 0],
    ["অবস্থা", student.status || ""],
  ];

  const docs = student.documents || {};
  const docRows: [string, string | number | null | undefined][] = [
    ["ছাত্রের ছবি", docs.studentPhoto ? "সংযুক্ত" : ""],
    ["জন্ম সনদ", docs.birthCertificate ? "সংযুক্ত" : ""],
    ["অভিভাবকের NID", docs.guardianNid ? "সংযুক্ত" : ""],
    ["পূর্বের সনদ", docs.previousCertificate ? "সংযুক্ত" : ""],
  ];

  const body = `
    <div class="top">
      <div>
        ${section("ভর্তি তথ্য", topRows)}
      </div>
      <div class="photoBox">
        ${student.studentPhoto ? `<img src="${escapeHtml(student.studentPhoto)}" alt="Student photo">` : `<div class="empty">ছাত্রের ছবি নেই</div>`}
        <div style="margin-top:10px;font-size:12px;font-weight:700;color:#0f172a;">${escapeHtml(student.name || "")}</div>
        <div style="margin-top:4px;font-size:11px;color:#64748b;">${escapeHtml(student.admissionNumber || "")}</div>
      </div>
    </div>
    ${section("অভিভাবক তথ্য", guardianRows)}
    ${section("ঠিকানা", addressRows)}
    ${section("শিক্ষা ও ফি", studyRows)}
    ${section("ডকুমেন্ট", docRows)}
  `;

  openPrintWindow(`ভর্তি ফরম - ${student.name || "ছাত্র"}`, body, targetWindow);
}

/**
 * Lighter alternative to printAdmissionForm() for the view modal's
 * "সংক্ষিপ্ত প্রিন্ট" button — just the fields needed for a quick reference
 * printout, not the full official admission form (birth registration,
 * documents checklist, etc.).
 */
export function printAdmissionSummary(student: Student) {
  const rows: [string, string | number | null | undefined][] = [
    ["নাম (বাংলা)", student.name || ""],
    ["নাম (ইংরেজি)", student.nameEn || ""],
    ["ভর্তি নং", student.admissionNumber || ""],
    ["শিক্ষাবর্ষ", student.academicYear || ""],
    ["ক্লাস / জামাত", student.class || ""],
    ["শাখা", student.section || ""],
    ["রোল", student.roll || ""],
    ["লিঙ্গ", student.gender || ""],
    ["অভিভাবকের নাম", student.guardianName || student.fatherName || ""],
    ["অভিভাবকের মোবাইল", student.guardianMobile || student.fatherMobile || ""],
    ["মাসিক বেতন", student.fee ?? 0],
    ["বকেয়া", student.due ?? 0],
    ["অবস্থা", student.status || ""],
  ];

  printDetailSheet({
    title: `সংক্ষিপ্ত তথ্য - ${student.name || "ছাত্র"}`,
    rows,
  });
}

// ----------------------------------------------------------------------
// Result sheet (রেজাল্ট শীট) — the printable page a guardian downloads and
// the institution keeps on file for a student's result. Matches the
// design provided for this feature: centered logo/institution name,
// [শিক্ষাবর্ষ ও পরীক্ষার নাম], [শিক্ষার্থীর নাম] রেজাল্ট শীট, then a
// ক্রঃ/বিষয়/প্রাপ্ত নম্বর/পূর্ণমান/জিপিএ/মেধাস্থান table, and a summary of
// total marks, total GPA, and the overall মেধাস্থান. Deliberately its own
// layout (not the shared admin-report header/table styles above) since
// this is meant to look like an official result document, not an
// internal list report.
// ----------------------------------------------------------------------

const RESULT_SHEET_STYLES = `
  @page { margin: 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Noto Sans Bengali", "Noto Sans", "Segoe UI", Arial, sans-serif;
    margin: 0; padding: 22px; color: #1e293b;
  }
  .rs-header { text-align: center; margin-bottom: 18px; }
  .rs-header img { height: 64px; width: 64px; object-fit: contain; margin: 0 auto 8px; display: block; }
  .rs-header h1 { font-size: 19px; margin: 0; font-weight: 800; }
  .rs-header h2 { font-size: 13px; margin: 6px 0 0; font-weight: 600; color: #0d9488; }
  .rs-header h3 { font-size: 13px; margin: 4px 0 0; font-weight: 700; color: #0f172a; }
  table.rs-table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 18px; }
  .rs-table th, .rs-table td { border: 1px solid #cbd5e1; padding: 7px 8px; text-align: center; }
  .rs-table th { background: #f1f5f9; font-weight: 800; }
  .rs-table td.rs-subject { text-align: left; }
  .rs-summary {
    margin-top: 16px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 14px;
    font-size: 12.5px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 16px;
  }
  .rs-summary .label { color: #64748b; }
  .rs-summary .value { font-weight: 800; color: #0f172a; }
`;

export interface ResultSheetSubjectRow {
  name: string;
  marks: number | string;
  fullMarks: number | string;
  gpa?: string;
  meritPosition?: number | null;
}

export interface ResultSheetOptions {
  examName: string;
  year: string;
  studentName: string;
  class: string;
  roll: string;
  subjects: ResultSheetSubjectRow[];
  obtainedMarks: number | string;
  totalMarks: number | string;
  gpa: string;
  grade: string;
  meritPosition?: number | null;
}

/** Print the official রেজাল্ট শীট (result sheet) for one student's exam. */
export function printResultSheet(sheet: ResultSheetOptions, targetWindow?: Window | null) {
  const settings = madrasaSettings();

  const rows = sheet.subjects
    .map(
      (s, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="rs-subject">${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.marks)}</td>
        <td>${escapeHtml(s.fullMarks)}</td>
        <td>${escapeHtml(s.gpa ?? "")}</td>
        <td>${s.meritPosition ?? "-"}</td>
      </tr>`
    )
    .join("");

  const body = `
    <div class="rs-header">
      ${settings.logo ? `<img src="${escapeHtml(settings.logo)}" alt="">` : ""}
      <h1>${escapeHtml(settings.name)}</h1>
      <h2>${escapeHtml(sheet.year)} — ${escapeHtml(sheet.examName)}</h2>
      <h3>${escapeHtml(sheet.studentName)} রেজাল্ট শীট — ${escapeHtml(sheet.class)} · রোল ${escapeHtml(sheet.roll)}</h3>
    </div>
    <table class="rs-table">
      <thead>
        <tr><th>ক্রঃ</th><th>বিষয়</th><th>প্রাপ্ত নম্বর</th><th>পূর্ণমান</th><th>জিপিএ</th><th>মেধাস্থান</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="rs-summary">
      <div><span class="label">সর্বমোট প্রাপ্ত নম্বর: </span><span class="value">${escapeHtml(sheet.obtainedMarks)} / ${escapeHtml(sheet.totalMarks)}</span></div>
      <div><span class="label">মোট জিপিএ: </span><span class="value">${escapeHtml(sheet.gpa)} (${escapeHtml(sheet.grade)})</span></div>
      <div><span class="label">সামগ্রিক মেধাস্থান: </span><span class="value">${sheet.meritPosition ?? "-"}</span></div>
    </div>
  `;

  openRawPrintWindow(`রেজাল্ট শীট - ${sheet.studentName}`, RESULT_SHEET_STYLES, body, targetWindow);
}
