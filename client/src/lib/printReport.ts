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

function madrasaSettings(): { name: string; logo?: string; address?: string; phone?: string; brandColor?: string } {
  try {
    const raw = localStorage.getItem("madrasah-settings");
    if (raw) {
      const s = JSON.parse(raw) as { name?: string; logo?: string; address?: string; phone?: string; brandColor?: string };
      return { name: s.name || "Madrasah ERP", logo: s.logo, address: s.address, phone: s.phone, brandColor: s.brandColor };
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

// ---------------------------------------------------------------------------
// Admission Form — fixed reference-template print layout
// ---------------------------------------------------------------------------
//
// This renders the official admission form on top of a static background
// artwork (client/public/admission-form-template.jpg — a cleaned scan of the
// institution's paper admission form: border, ornaments, section badges and
// dotted fill-in lines, with the original madrasa's watermark seal removed).
// Only the institution logo (from Settings → settings.logo) and the
// student's matching data are drawn dynamically on top, using
// absolutely-positioned, millimeter-accurate coordinates measured from the
// source artwork at 300dpi (2437×3258px → 206.33mm×275.84mm), so the layout
// stays pixel-accurate regardless of viewport/print scaling.
//
// Fields with no exact matching Student data source are intentionally left
// blank rather than guessed (see docs/CURRENT_TASK.md admission-form task):
// upazila is never silently mapped to "থানা", documents.guardianNid is a
// file and never mapped to "জাতীয় পরিচয়পত্র নং", and presentAddress (a single
// free-text field) is never split into house/ward/thana sub-fields.

const ADMISSION_TEMPLATE_PAGE = { widthMm: 206.33, heightMm: 275.84 };

/** cx/cy/diameter of the logo watermark zone (mm), centered like the original seal. */
const ADMISSION_LOGO_ZONE = { cxMm: 92.71, cyMm: 130.81, diameterMm: 100 };

interface AdmissionFieldPos {
  /** y of the dashed fill-in line (mm from top) */
  y: number;
  /** x where the dash line starts, i.e. right after the label (mm from left) */
  x: number;
  /** x where the dash line ends (mm from left) — bounds the value's max width */
  xEnd: number;
}

/** Millimeter coordinates for every fillable line on the reference form. */
const ADMISSION_FIELD_POS: Record<string, AdmissionFieldPos> = {
  // শিক্ষার্থীর ব্যক্তিগত তথ্যাবলী
  studentName: { y: 123.53, x: 27.52, xEnd: 97.28 },
  nickname: { y: 123.53, x: 122.94, xEnd: 198.88 }, // no source — stays blank
  dateOfBirth: { y: 129.62, x: 21.93, xEnd: 96.86 },
  citizenship: { y: 129.62, x: 111.17, xEnd: 198.88 }, // no source — stays blank
  identifyingMark: { y: 135.72, x: 21.51, xEnd: 97.11 }, // no source — stays blank
  bloodGroup: { y: 135.72, x: 122.68, xEnd: 198.54 },
  fatherName: { y: 141.73, x: 25.57, xEnd: 97.28 },
  motherName: { y: 141.73, x: 115.23, xEnd: 198.88 },
  birthRegistration: { y: 147.83, x: 21.93, xEnd: 198.88 },
  // স্থায়ী ঠিকানা (permanent address)
  permVillage: { y: 166.45, x: 25.23, xEnd: 97.28 },
  permHouseNo: { y: 172.55, x: 26.5, xEnd: 97.28 }, // no source — stays blank
  permPost: { y: 178.65, x: 21.84, xEnd: 97.28 },
  permWard: { y: 184.74, x: 28.11, xEnd: 97.28 }, // no source — stays blank
  permThana: { y: 190.84, x: 22.1, xEnd: 97.28 }, // no source — stays blank (upazila ≠ থানা)
  permDistrict: { y: 196.93, x: 25.06, xEnd: 97.11 },
  permMobile: { y: 202.95, x: 27.6, xEnd: 97.03 }, // no source — stays blank
  // বর্তমান ঠিকানা (present address) — presentAddress is a single free-text
  // field with no structured sub-fields, so per the no-guessing rule every
  // line here stays blank rather than splitting it.
  presVillage: { y: 166.45, x: 112.52, xEnd: 198.88 },
  presHouseNo: { y: 172.55, x: 116.76, xEnd: 197.61 },
  presPost: { y: 178.65, x: 112.1, xEnd: 198.88 },
  presWard: { y: 184.74, x: 119.04, xEnd: 198.8 },
  presThana: { y: 190.84, x: 113.71, xEnd: 195.58 },
  presDistrict: { y: 196.93, x: 115.32, xEnd: 198.88 },
  presMobile: { y: 202.95, x: 119.46, xEnd: 198.88 },
  // অভিভাবকের তথ্য ও ঠিকানা
  guardianName: { y: 227.41, x: 27.09, xEnd: 97.28 },
  fatherOrHusband: { y: 227.41, x: 118.96, xEnd: 198.88 }, // no source — stays blank
  guardianProfession: { y: 233.43, x: 31.33, xEnd: 198.88 }, // no source — stays blank
  guardianNidNumber: { y: 239.44, x: 52.49, xEnd: 97.28 }, // documents.guardianNid is a file, not a number — stays blank
  guardianRelation: { y: 239.44, x: 128.69, xEnd: 198.88 },
  guardianContactAddress: { y: 245.53, x: 50.8, xEnd: 198.88 }, // no source — stays blank
  guardianMobile: { y: 251.8, x: 56.73, xEnd: 97.28 },
  guardianPersonalMobile: { y: 251.8, x: 127.0, xEnd: 198.37 }, // no source — stays blank
};

function admissionField(key: keyof typeof ADMISSION_FIELD_POS, value: string | number | null | undefined): string {
  const v = value === null || value === undefined ? "" : String(value);
  if (!v) return "";
  const pos = ADMISSION_FIELD_POS[key];
  const maxWidth = pos.xEnd - pos.x;
  return `<div class="af-field" style="top:${pos.y}mm;left:${pos.x}mm;max-width:${maxWidth}mm;">${escapeHtml(v)}</div>`;
}

const ADMISSION_FORM_STYLES = `
  @page { margin: 0; size: ${ADMISSION_TEMPLATE_PAGE.widthMm}mm ${ADMISSION_TEMPLATE_PAGE.heightMm}mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Noto Sans Bengali", "Noto Sans", "Segoe UI", Arial, sans-serif; }
  .af-page {
    position: relative;
    width: ${ADMISSION_TEMPLATE_PAGE.widthMm}mm;
    height: ${ADMISSION_TEMPLATE_PAGE.heightMm}mm;
    overflow: hidden;
    page-break-after: avoid;
  }
  .af-page .af-bg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: block; }
  .af-logo {
    position: absolute;
    left: ${ADMISSION_LOGO_ZONE.cxMm}mm;
    top: ${ADMISSION_LOGO_ZONE.cyMm}mm;
    width: ${ADMISSION_LOGO_ZONE.diameterMm}mm;
    transform: translate(-50%, -50%);
    opacity: 0.16;
    object-fit: contain;
    z-index: 1;
  }
  .af-field {
    position: absolute;
    font-size: 3mm;
    line-height: 1;
    color: #111111;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transform: translateY(calc(-100% - 0.2mm));
    z-index: 2;
  }
  @media print {
    html, body { width: ${ADMISSION_TEMPLATE_PAGE.widthMm}mm; }
  }
`;

/**
 * Prints the official Admission Form, matching the reference paper form's
 * design pixel-for-pixel via the static background artwork above. The only
 * dynamic visual elements are the institution's logo (from Settings) and the
 * student's matching data; everything else — border, ornaments, section
 * badges, dotted lines — comes from the template image itself.
 */
export function printAdmissionForm(student: Student, targetWindow?: Window | null) {
  const settings = madrasaSettings();

  // Student model -> admission-form field mapping (kept separate from the
  // visual template so the two can evolve independently). Fields with no
  // exact matching source are left as "" per the strict no-guessing rule.
  const formData = {
    studentName: student.name || "",
    dateOfBirth: student.dateOfBirth || "",
    identifyingMark: "",
    fatherName: student.fatherName || "",
    birthRegistration: student.birthRegistrationNumber || "",
    nickname: "",
    citizenship: "",
    bloodGroup: student.blood || "",
    motherName: student.motherName || "",

    permVillage: student.village || "",
    permHouseNo: "",
    permPost: student.postOffice || "",
    permWard: "",
    permThana: "",
    permDistrict: student.district || "",
    permMobile: "",

    presVillage: "",
    presHouseNo: "",
    presPost: "",
    presWard: "",
    presThana: "",
    presDistrict: "",
    presMobile: "",

    guardianName: student.guardianName || "",
    fatherOrHusband: "",
    guardianProfession: "",
    guardianNidNumber: "",
    guardianRelation: student.guardianRelationship || "",
    guardianContactAddress: "",
    guardianMobile: student.guardianMobile || "",
    guardianPersonalMobile: "",
  } as const;

  const templateUrl = `${window.location.origin}/admission-form-template.jpg`;
  const fieldsHtml = (Object.keys(formData) as (keyof typeof formData)[])
    .map((key) => admissionField(key, formData[key]))
    .join("");
  const logoHtml = settings.logo ? `<img class="af-logo" src="${escapeHtml(settings.logo)}" alt="">` : "";

  const body = `
    <div class="af-page">
      <img class="af-bg" src="${templateUrl}" alt="">
      ${logoHtml}
      ${fieldsHtml}
    </div>
  `;

  openRawPrintWindow(`ভর্তি ফরম - ${student.name || "শিক্ষার্থী"}`, ADMISSION_FORM_STYLES, body, targetWindow);
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
    title: `সংক্ষিপ্ত তথ্য - ${student.name || "শিক্ষার্থী"}`,
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

// ----------------------------------------------------------------------
// Student ID card — front + back, reproducing the exact purple
// abstract-wave card design supplied for this feature (photo circle with
// offset purple ring top, decorative wave corners, dot clusters, details
// list; back: rounded rules badge, bullet list, contact rows, signature
// line). Layout, proportions and element positions are kept exactly as
// given — only the placeholder text is swapped for the real student's
// data. Card is 64mm × 98.4mm (same 400:615 ratio as the source design).
// ----------------------------------------------------------------------

const ID_CARD_STYLES = `
  @page { margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Noto Sans Bengali", "Noto Sans", "Segoe UI", Arial, sans-serif;
    padding: 16px; display: flex; gap: 8mm; align-items: flex-start;
  }
  .idc { width: 64mm; height: 98.4mm; background: #fff; position: relative; overflow: hidden; border: 1.6mm solid #3d1f8c; }
  .idc svg.wave { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
  .idc .photo-wrap { position: absolute; top: 17.6mm; left: 50%; transform: translateX(-50%); width: 32mm; height: 32mm; }
  .idc .photo-purple { position: absolute; top: 2.56mm; left: -1.28mm; width: 31.36mm; height: 31.36mm; border-radius: 46% 54% 58% 42% / 52% 44% 56% 48%; background: #3d1f8c; }
  .idc .photo-white {
    position: absolute; top: 0; left: 0; width: 32mm; height: 32mm; border-radius: 50%;
    border: 0.32mm solid #222; object-fit: cover; background: repeating-conic-gradient(#d9d9d9 0% 25%, #fff 0% 50%) 50% / 3.2mm 3.2mm;
  }
  .idc .photo-initials {
    position: absolute; top: 0; left: 0; width: 32mm; height: 32mm; border-radius: 50%;
    border: 0.32mm solid #222; background: #f1f5f9; color: #3d1f8c; display: flex; align-items: center; justify-content: center;
    font-size: 12mm; font-weight: 800;
  }
  .idc .dots { position: absolute; display: grid; grid-template-columns: repeat(2, 1.28mm); grid-auto-rows: 1.28mm; gap: 1.28mm; }
  .idc .dots span { width: 1.28mm; height: 1.28mm; border-radius: 50%; background: #6b6b6b; }
  .idc .name { position: absolute; top: 54.4mm; left: 0; right: 0; text-align: center; font-size: 5.4mm; font-weight: 800; color: #3a3a3a; }
  .idc .position { position: absolute; top: 62.1mm; left: 0; right: 0; text-align: center; font-size: 3.2mm; font-weight: 700; color: #4a26a8; }
  .idc .facts { position: absolute; top: 71.2mm; left: 6.4mm; right: 4mm; font-size: 2.56mm; }
  .idc .facts .row { display: flex; margin-bottom: 1.28mm; }
  .idc .facts .lab { font-weight: 800; color: #3a3a3a; width: 19.2mm; flex-shrink: 0; }
  .idc .facts .colon { width: 2.24mm; color: #7a7a7a; flex-shrink: 0; }
  .idc .facts .val { color: #7a7a7a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .idc .badge {
    position: absolute; top: 18.9mm; left: 5.76mm; background: #3d1f8c; color: #fff; font-weight: 800; font-size: 2.6mm;
    letter-spacing: 0.2mm; padding: 1.92mm 4.16mm; border-radius: 4.16mm;
  }
  .idc .bullets { position: absolute; top: 30.4mm; left: 5.76mm; right: 5.76mm; font-size: 2.24mm; color: #555; }
  .idc .bullets li { list-style: none; position: relative; padding-left: 2.88mm; margin-bottom: 3.2mm; line-height: 1.5; }
  .idc .bullets li::before { content: ""; position: absolute; left: 0; top: 0.9mm; width: 1.12mm; height: 1.12mm; border-radius: 50%; background: #5b2fb8; }
  .idc .contact { position: absolute; top: 65.6mm; left: 9.6mm; font-size: 2.56mm; }
  .idc .contact .row { display: flex; margin-bottom: 0.96mm; }
  .idc .contact .lab { font-weight: 800; color: #3a3a3a; width: 12.8mm; flex-shrink: 0; }
  .idc .sig { position: absolute; top: 84mm; left: 0; right: 0; text-align: center; }
  .idc .sig .line { width: 27.2mm; height: 0.16mm; background: #5b2fb8; margin: 0 auto 0.96mm; }
  .idc .sig .caption { font-size: 3mm; font-weight: 800; color: #222; }

  .idc-cut { font-size: 9px; color: #94a3b8; text-align: center; margin-top: 4px; }
`;

export interface IdCardOptions {
  studentPhoto?: string;
  name: string;
  class: string;
  section?: string;
  roll: string;
  session?: string;
  blood?: string;
}

/** Print the student ID card (front + back), matching the supplied design exactly. */
export function printStudentIdCard(student: IdCardOptions, targetWindow?: Window | null) {
  const settings = madrasaSettings();
  const initials = (student.name || "").trim().slice(0, 1) || "?";

  const front = `
    <div class="idc">
      <svg class="wave" viewBox="0 0 400 615" preserveAspectRatio="none">
        <path d="M0,0 H270 C220,10 160,35 110,70 C70,95 30,110 0,110 Z" fill="#cabce8"/>
        <path d="M0,95 C50,90 90,70 140,45 C190,20 230,5 265,0" fill="none" stroke="#3d1f8c" stroke-width="2.5"/>
        <path d="M400,615 H150 C210,600 270,575 315,545 C355,520 385,505 400,502 Z" fill="#cabce8"/>
        <path d="M400,520 C350,525 305,548 255,575 C205,600 165,613 130,615" fill="none" stroke="#3d1f8c" stroke-width="2.5"/>
      </svg>
      <div class="photo-wrap">
        <div class="photo-purple"></div>
        ${
          student.studentPhoto
            ? `<img class="photo-white" src="${escapeHtml(student.studentPhoto)}" alt="">`
            : `<div class="photo-initials">${escapeHtml(initials)}</div>`
        }
      </div>
      <div class="dots" style="top:40.8mm; left:5.6mm;">${"<span></span>".repeat(8)}</div>
      <div class="dots" style="top:36mm; right:5.6mm;">${"<span></span>".repeat(8)}</div>
      <div class="name">${escapeHtml(student.name || "")}</div>
      <div class="position">${escapeHtml(student.class || "")}</div>
      <div class="facts">
        <div class="row"><span class="lab">শাখা</span><span class="colon">:</span><span class="val">${escapeHtml(student.section || "-")}</span></div>
        <div class="row"><span class="lab">রোল</span><span class="colon">:</span><span class="val">${escapeHtml(student.roll || "-")}</span></div>
        <div class="row"><span class="lab">সেশন</span><span class="colon">:</span><span class="val">${escapeHtml(student.session || "-")}</span></div>
        <div class="row"><span class="lab">রক্তের গ্রুপ</span><span class="colon">:</span><span class="val">${escapeHtml(student.blood || "-")}</span></div>
      </div>
    </div>
  `;

  const back = `
    <div class="idc">
      <svg class="wave" viewBox="0 0 400 615" preserveAspectRatio="none">
        <path d="M400,0 H140 C190,15 250,45 300,75 C345,100 380,115 400,115 Z" fill="#cabce8"/>
        <path d="M170,0 C210,25 260,55 305,80 C345,100 375,112 400,112" fill="none" stroke="#3d1f8c" stroke-width="2.5"/>
        <path d="M0,615 H255 C205,600 150,575 105,545 C65,520 30,505 0,502 Z" fill="#cabce8"/>
        <path d="M0,520 C45,525 90,548 135,575 C180,600 215,613 245,615" fill="none" stroke="#3d1f8c" stroke-width="2.5"/>
      </svg>
      <div class="dots" style="top:7.2mm; left:5.6mm;">${"<span></span>".repeat(8)}</div>
      <div class="badge">নিয়মাবলী</div>
      <ul class="bullets">
        <li>এই পরিচয়পত্রটি প্রতিষ্ঠানের সম্পত্তি, মেয়াদ শেষে বা চাহিবামাত্র ফেরত দিতে হবে।</li>
        <li>কার্ডটি সর্বদা সাথে রাখুন এবং কর্তৃপক্ষ চাইলে সাথে সাথে প্রদর্শন করতে হবে।</li>
        <li>কার্ডটি হারিয়ে গেলে অবিলম্বে প্রতিষ্ঠানের অফিসে যোগাযোগ করুন।</li>
      </ul>
      <div class="contact">
        <div class="row"><span class="lab">ফোন</span><span>:&nbsp;${escapeHtml(settings.phone || "-")}</span></div>
        <div class="row"><span class="lab">ঠিকানা</span><span>:&nbsp;${escapeHtml(settings.address || "-")}</span></div>
      </div>
      <div class="sig">
        <div class="line"></div>
        <div class="caption">অধ্যক্ষের স্বাক্ষর</div>
      </div>
      <div class="dots" style="bottom:9.6mm; right:5.6mm;">${"<span></span>".repeat(8)}</div>
    </div>
  `;

  const body = `${front}${back}`;

  const w = targetWindow ?? window.open("", "_blank", "width=520,height=760");
  if (!w) throw new PopupBlockedError();
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>আইডি কার্ড - ${escapeHtml(student.name || "")}</title>
    <style>${ID_CARD_STYLES}</style></head><body>${body}</body></html>`;
  w.document.open();
  w.document.write(html);
  w.document.close();
  // See the matching comment in writePrintWindow() — must stay an onload
  // handler set from the opener's JS context, not an inline <script>,
  // because of this app's CSP.
  w.onload = () => {
    w.focus();
    w.print();
  };
}
