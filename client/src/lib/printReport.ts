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
// Admission Form — fully coded (SVG + CSS) reference-style print layout
// ---------------------------------------------------------------------------
//
// This recreates the institution's paper admission form as real markup —
// the decorative border/corner ornaments are inline SVG patterns, the green
// section badges and dotted fill-in lines are CSS — rather than printing on
// top of a scanned image. Only two things are dynamic: the institution's
// name/logo (from Settings) and the student's matching data; the layout,
// ornamentation and section structure are coded to match the reference
// form's design (border, corner medallions, green pill section headers,
// two-column ঠিকানা layout, dotted fill lines).
//
// Fields with no exact matching Student data source are intentionally left
// blank rather than guessed (see docs/CURRENT_TASK.md admission-form task):
// upazila is never silently mapped to "থানা", documents.guardianNid is a
// file and never mapped to "জাতীয় পরিচয়পত্র নং", and presentAddress (a single
// free-text field) is never split into house/ward/thana sub-fields.

const ADMISSION_PAGE = { widthMm: 210, heightMm: 297 };
const ADMISSION_BORDER_MM = 12;
const ADMISSION_FRAME_GAP_MM = 4;

/** One repeating pointed-arch + diamond-flower motif, tiled along every edge. */
/** One repeating flower-in-square medallion motif, chained edge-to-edge along every side (matching corner artwork). */
const ADMISSION_BORDER_DEFS = `
  <pattern id="afArch" width="14" height="14" patternUnits="userSpaceOnUse">
    <rect width="14" height="14" fill="#1d6b41"/>
    <rect width="14" height="14" fill="none" stroke="#0c2f1c" stroke-width="0.45"/>
    <rect x="1.3" y="1.3" width="11.4" height="11.4" fill="none" stroke="#ffffff" stroke-width="0.35"/>
    <path d="M1.3,4.3 C2.6,4.3 2.6,1.3 4.3,1.3" stroke="#ffffff" stroke-width="0.35" fill="none"/>
    <path d="M9.7,1.3 C11.4,1.3 11.4,4.3 12.7,4.3" stroke="#ffffff" stroke-width="0.35" fill="none"/>
    <path d="M1.3,9.7 C2.6,9.7 2.6,12.7 4.3,12.7" stroke="#ffffff" stroke-width="0.35" fill="none"/>
    <path d="M12.7,9.7 C11.4,9.7 11.4,12.7 9.7,12.7" stroke="#ffffff" stroke-width="0.35" fill="none"/>
    <g transform="translate(7,7)">
      <path d="M0,-2.6 C1,-1.5 1,1.5 0,2.6 C-1,1.5 -1,-1.5 0,-2.6 Z" fill="#ffffff"/>
      <path d="M-2.6,0 C-1.5,-1 1.5,-1 2.6,0 C1.5,1 -1.5,1 -2.6,0 Z" fill="#ffffff"/>
      <circle r="0.9" fill="#1d6b41"/>
      <circle r="0.9" fill="none" stroke="#ffffff" stroke-width="0.22"/>
    </g>
  </pattern>
`;


/** Small flower-in-square medallion used at all four page corners. */
const ADMISSION_CORNER_SVG = `
  <svg class="af-corner-art" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
    <rect width="14" height="14" fill="#1d6b41"/>
    <rect width="14" height="14" fill="none" stroke="#0c2f1c" stroke-width="0.45"/>
    <rect x="1.3" y="1.3" width="11.4" height="11.4" fill="none" stroke="#ffffff" stroke-width="0.35"/>
    <path d="M1.3,4.3 C2.6,4.3 2.6,1.3 4.3,1.3" stroke="#ffffff" stroke-width="0.35" fill="none"/>
    <path d="M9.7,1.3 C11.4,1.3 11.4,4.3 12.7,4.3" stroke="#ffffff" stroke-width="0.35" fill="none"/>
    <path d="M1.3,9.7 C2.6,9.7 2.6,12.7 4.3,12.7" stroke="#ffffff" stroke-width="0.35" fill="none"/>
    <path d="M12.7,9.7 C11.4,9.7 11.4,12.7 9.7,12.7" stroke="#ffffff" stroke-width="0.35" fill="none"/>
    <g transform="translate(7,7)">
      <path d="M0,-2.6 C1,-1.5 1,1.5 0,2.6 C-1,1.5 -1,-1.5 0,-2.6 Z" fill="#ffffff"/>
      <path d="M-2.6,0 C-1.5,-1 1.5,-1 2.6,0 C1.5,1 -1.5,1 -2.6,0 Z" fill="#ffffff"/>
      <circle r="0.9" fill="#1d6b41"/>
      <circle r="0.9" fill="none" stroke="#ffffff" stroke-width="0.22"/>
    </g>
  </svg>
`;

function afBorderStrip(edge: "top" | "bottom" | "left" | "right"): string {
  return `<svg class="af-border af-border-${edge}" viewBox="0 0 200 14" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><defs>${ADMISSION_BORDER_DEFS}</defs><rect width="200" height="14" fill="url(#afArch)"/></svg>`;
}

const ADMISSION_FORM_STYLES = `
  @page { margin: 0; size: ${ADMISSION_PAGE.widthMm}mm ${ADMISSION_PAGE.heightMm}mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Noto Sans Bengali", "Noto Sans", "Segoe UI", Arial, sans-serif; }
  .af-page {
    position: relative;
    width: ${ADMISSION_PAGE.widthMm}mm;
    height: ${ADMISSION_PAGE.heightMm}mm;
    background: #eef5f3;
    overflow: hidden;
    page-break-after: avoid;
  }
  .af-border { position: absolute; display: block; }
  .af-border-top, .af-border-bottom { left: ${ADMISSION_BORDER_MM}mm; width: calc(100% - ${ADMISSION_BORDER_MM * 2}mm); height: ${ADMISSION_BORDER_MM}mm; }
  .af-border-top { top: 0; }
  .af-border-bottom { bottom: 0; }
  .af-border-left, .af-border-right { top: ${ADMISSION_BORDER_MM}mm; width: calc(100% - ${ADMISSION_BORDER_MM * 2}mm); height: ${ADMISSION_BORDER_MM}mm; left: 0; }
  .af-border-left { transform-origin: top left; transform: rotate(90deg) translateY(-100%); }
  .af-border-right { left: auto; right: 0; transform-origin: top right; transform: rotate(-90deg) translateY(-100%); }
  .af-corner { position: absolute; width: ${ADMISSION_BORDER_MM}mm; height: ${ADMISSION_BORDER_MM}mm; }
  .af-corner-art { width: 100%; height: 100%; display: block; }
  .af-corner-tl { top: 0; left: 0; }
  .af-corner-tr { top: 0; right: 0; }
  .af-corner-bl { bottom: 0; left: 0; }
  .af-corner-br { bottom: 0; right: 0; }

  .af-content {
    position: absolute;
    top: ${ADMISSION_BORDER_MM + ADMISSION_FRAME_GAP_MM}mm;
    left: ${ADMISSION_BORDER_MM + ADMISSION_FRAME_GAP_MM}mm;
    right: ${ADMISSION_BORDER_MM + ADMISSION_FRAME_GAP_MM}mm;
    bottom: ${ADMISSION_BORDER_MM + ADMISSION_FRAME_GAP_MM}mm;
    border: 0.6mm solid #1d6b41;
    outline: 0.25mm solid #1d6b41;
    outline-offset: 1mm;
    padding: 6mm 8mm;
    background: #eef5f3;
  }
  .af-content > * { position: relative; z-index: 1; }
  .af-wm {
    position: absolute !important;
    left: 50%; top: 46%;
    width: 60mm;
    transform: translate(-50%, -50%);
    opacity: 0.14;
    object-fit: contain;
    z-index: 0;
  }
  .af-salutation { font-size: 3.4mm; line-height: 1.65; color: #14251c; }
  .af-salutation .af-inst { font-weight: 700; }
  .af-sigrow { display: flex; justify-content: space-between; margin-top: 9mm; font-size: 3mm; }
  .af-sigline { width: 46mm; border-top: 0.3mm dashed #14251c; text-align: center; padding-top: 1.3mm; }
  .af-badge {
    margin: 7mm auto 4mm; width: fit-content; padding: 1.6mm 10mm;
    background: linear-gradient(180deg, #2d8a57, #1d6b41);
    color: #fff; font-weight: 700; font-size: 3.6mm; border-radius: 20mm;
    text-align: center; letter-spacing: 0.3px;
  }
  .af-fields { display: grid; grid-template-columns: 1fr 1fr; column-gap: 8mm; row-gap: 2.6mm; margin-top: 2mm; }
  .af-fields.af-fields-full { grid-template-columns: 1fr; }
  .af-line { display: flex; align-items: baseline; font-size: 3mm; white-space: nowrap; }
  .af-line .af-lbl { color: #14251c; margin-right: 1.5mm; flex-shrink: 0; }
  .af-line .af-fill {
    flex: 1; border-bottom: 0.3mm dashed #14251c; min-height: 3.6mm;
    padding-left: 1mm; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; color: #0a0a0a; font-weight: 600;
  }
  .af-addr-heads { display: grid; grid-template-columns: 1fr 1fr; margin-top: 6mm; }
  .af-addr-heads div { text-align: center; font-weight: 700; font-size: 3.4mm; color: #14251c; }
`;

function afLine(label: string, value: string | number | null | undefined): string {
  const v = value === null || value === undefined ? "" : String(value);
  return `<div class="af-line"><span class="af-lbl">${escapeHtml(label)}:</span><span class="af-fill">${escapeHtml(v)}</span></div>`;
}

/**
 * Prints the official Admission Form. The border ornaments, corner
 * medallions, section badges and fill-in lines are all coded (SVG/CSS) to
 * match the reference form's design — no scanned image is used. The only
 * dynamic visual elements are the institution's name/logo (Settings) and the
 * student's matching data.
 */
export function printAdmissionForm(student: Student, targetWindow?: Window | null) {
  const settings = madrasaSettings();
  const instName = settings.name || "মাদ্রাসা";

  // Student model -> admission-form field mapping. Fields with no exact
  // matching source are left as "" per the strict no-guessing rule.
  const f = {
    studentName: student.name || "",
    nickname: "",
    dateOfBirth: student.dateOfBirth || "",
    citizenship: "",
    identifyingMark: "",
    bloodGroup: student.blood || "",
    fatherName: student.fatherName || "",
    motherName: student.motherName || "",
    birthRegistration: student.birthRegistrationNumber || "",

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
  };

  const wmHtml = settings.logo ? `<img class="af-wm" src="${escapeHtml(settings.logo)}" alt="">` : "";

  const body = `
    <div class="af-page">
      ${afBorderStrip("top")}
      ${afBorderStrip("bottom")}
      ${afBorderStrip("left")}
      ${afBorderStrip("right")}
      <div class="af-corner af-corner-tl">${ADMISSION_CORNER_SVG}</div>
      <div class="af-corner af-corner-tr">${ADMISSION_CORNER_SVG}</div>
      <div class="af-corner af-corner-bl">${ADMISSION_CORNER_SVG}</div>
      <div class="af-corner af-corner-br">${ADMISSION_CORNER_SVG}</div>

      <div class="af-content">
        ${wmHtml}
        <div class="af-salutation">
          বরাবর,<br/>
          হযরত মুহতামিম সাহেব দামাত বারাকাতুহুম!<br/>
          <span class="af-inst">${escapeHtml(instName)}</span><br/>
          মুহতারাম,<br/>
          যথাবিহীত সম্মান প্রদর্শন পূর্বক বিনীত নিবেদন এই যে, আমি ${escapeHtml(instName)} এর যাবতীয় বিধি বিধান ও নিয়ম কানুন মেনে চলার অঙ্গীকারাবদ্ধ হয়ে অত্র মাদরাসায় ভর্তি হওয়ার আবেদন পেশ করছি।<br/>
          অতএব, মেহেরবানী পূর্বক আমার আবেদন মঞ্জুর করে ইলমে দ্বীন হাসিল করার সুযোগ দানে আপনার সুমর্জি কামনা করছি।
        </div>
        <div class="af-sigrow">
          <div class="af-sigline">আবেদনকারীর স্বাক্ষর</div>
          <div class="af-sigline">নাজিমে তালিমাত এর স্বাক্ষর</div>
        </div>

        <div class="af-badge">শিক্ষার্থীর ব্যক্তিগত তথ্যাবলী</div>
        <div class="af-fields">
          ${afLine("নাম", f.studentName)}
          ${afLine("ডাক নাম", f.nickname)}
          ${afLine("জন্ম তারিখ", f.dateOfBirth)}
          ${afLine("নাগরিকতা", f.citizenship)}
          ${afLine("শনাক্তকরণ চিহ্ন", f.identifyingMark)}
          ${afLine("রক্তের গ্রুপ", f.bloodGroup)}
          ${afLine("পিতার নাম", f.fatherName)}
          ${afLine("মাতার নাম", f.motherName)}
        </div>
        <div class="af-fields af-fields-full">
          ${afLine("জন্ম নিবন্ধন নং", f.birthRegistration)}
        </div>

        <div class="af-addr-heads"><div>স্থায়ী ঠিকানা</div><div>বর্তমান ঠিকানা</div></div>
        <div class="af-fields">
          ${afLine("গ্রাম/মহল্লা", f.permVillage)}
          ${afLine("গ্রাম/মহল্লা", f.presVillage)}
          ${afLine("বাড়ী নং", f.permHouseNo)}
          ${afLine("বাড়ী নং", f.presHouseNo)}
          ${afLine("পোস্ট", f.permPost)}
          ${afLine("পোস্ট", f.presPost)}
          ${afLine("ওয়ার্ড নং", f.permWard)}
          ${afLine("ওয়ার্ড নং", f.presWard)}
          ${afLine("থানা", f.permThana)}
          ${afLine("থানা", f.presThana)}
          ${afLine("জেলা", f.permDistrict)}
          ${afLine("জেলা", f.presDistrict)}
          ${afLine("মোবাইল", f.permMobile)}
          ${afLine("মোবাইল", f.presMobile)}
        </div>

        <div class="af-badge">অভিভাবকের তথ্য ও ঠিকানা</div>
        <div class="af-fields">
          ${afLine("নাম", f.guardianName)}
          ${afLine("পিতা/স্বামী", f.fatherOrHusband)}
        </div>
        <div class="af-fields af-fields-full">
          ${afLine("পেশা", f.guardianProfession)}
        </div>
        <div class="af-fields">
          ${afLine("জাতীয় পরিচয়পত্র নং", f.guardianNidNumber)}
          ${afLine("সম্পর্ক", f.guardianRelation)}
        </div>
        <div class="af-fields af-fields-full">
          ${afLine("যোগাযোগের ঠিকানা", f.guardianContactAddress)}
        </div>
        <div class="af-fields">
          ${afLine("মোবাইল (বাসা/অফিস)", f.guardianMobile)}
          ${afLine("ব্যক্তিগত", f.guardianPersonalMobile)}
        </div>
      </div>
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

// ----------------------------------------------------------------------
// Admit Card (প্রবেশপত্র) — reproduces the reference admit-card layout
// (double dashed-corner border, centered institution header, প্রবেশপত্র
// title badge, exam/session line, দাখেলা+রোল boxes, নাম/পিতার নাম/জামাত
// lines with the exam start date on the জামাত line, two signature lines)
// as coded markup, same "print the browser's own HTML" approach as the
// rest of this file (see file-top comment re: Bengali text shaping).
//
// Two cards per A4 page, sized/spaced to match the reference admit-card
// template's own proportions (measured from the uploaded PDF: card fills
// ~edge-to-edge width, height ≈61% of width, small ~6mm gap between the
// two cards, both sitting near the top of the page with the remainder left
// blank below — not stretched to fill the full page). See ADMIT_CARD_STYLES
// .ac-page/.ac-card.
// ----------------------------------------------------------------------

const ADMIT_CARD_STYLES = `
  @page { size: A4; margin: 8mm 10mm; }
  * {
    box-sizing: border-box; margin: 0; padding: 0;
    /* Without this, Chrome/Android drop every background-color (the navy
       প্রবেশপত্র badge, the white দাখেলা/রোল boxes, the cream card fill)
       the moment you switch from the on-screen preview to Print/Save-as-PDF
       — they render fine on screen but vanish or go flat/grey in the PDF.
       This is the standard fix; none of this file's other print* functions
       needed it because they're border/text-only, no solid fills. */
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }
  body {
    font-family: "Noto Sans Bengali", "Noto Sans", "Segoe UI", Arial, sans-serif;
    color: #0f172a;
  }
  .ac-page {
    display: flex;
    flex-direction: column;
    gap: 7mm;
    page-break-after: always;
  }
  .ac-page:last-child { page-break-after: auto; }
  .ac-card {
    height: 116mm;
    flex: 0 0 auto;
    border: 1.6px solid #000;
    border-radius: 14px;
    padding: 2.6mm;
    background: #fffff3;
  }
  .ac-card__inner {
    height: 100%;
    border: 1.8px dashed #000;
    border-radius: 11px;
    padding: 5mm 8mm 4mm;
    display: flex;
    flex-direction: column;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }
  .ac-watermark {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    height: 70mm;
    width: 70mm;
    object-fit: contain;
    opacity: 0.12;
    z-index: 0;
  }
  .ac-card__inner > *:not(.ac-watermark) {
    position: relative;
    z-index: 1;
  }
  .ac-head { display: flex; align-items: center; justify-content: center; gap: 8px; text-align: center; }
  .ac-head img { height: 15mm; width: 15mm; object-fit: contain; flex-shrink: 0; }
  .ac-head h1 { font-size: 16px; color: #00563f; font-weight: 800; }
  .ac-head .addr { font-size: 9.5px; color: #334155; margin-top: 1.5px; }
  .ac-rule { border-top: 1.4px dashed #8b0000; margin: 5px 0 8px; position: relative; }
  .ac-rule::after {
    content: "◇"; position: absolute; left: 50%; top: -8px; transform: translateX(-50%);
    background: #fffff3; padding: 0 6px; color: #8b0000; font-size: 11px;
  }
  .ac-titleWrap { text-align: center; margin-bottom: 7px; }
  .ac-title {
    display: inline-block; border-radius: 4px; background: #203864; color: #fff;
    padding: 3px 26px; font-weight: 800; font-size: 17px; text-decoration: underline;
  }
  .ac-exam { text-align: center; font-weight: 700; font-size: 12px; margin-bottom: 9px; }
  .ac-idrow { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
  .ac-idbox { flex: 0 0 42%; border: 1.6px solid #203864; border-radius: 4px; padding: 3px 8px; font-size: 11.5px; font-weight: 700; background: #fff; }
  .ac-idbox b { font-weight: 800; margin-left: 3px; }
  .ac-line {
    display: flex; align-items: baseline; gap: 4px; font-size: 12px; font-weight: 700;
    margin: 6px 0; border-bottom: .8px solid #94a3b8; padding-bottom: 2px;
  }
  .ac-lab { flex-shrink: 0; }
  .ac-colon { flex-shrink: 0; }
  .ac-val { flex: 1; font-weight: 700; }
  .ac-line--split { justify-content: space-between; }
  .ac-examdate { font-size: 10.5px; font-weight: 700; text-decoration: underline; white-space: nowrap; margin-left: 10px; }
  .ac-sigrow { display: flex; justify-content: space-between; margin-top: 18px; padding-top: 6px; }
  .ac-sig { text-align: center; font-size: 10.5px; font-weight: 700; border-top: 1px solid #000; padding-top: 3px; min-width: 38mm; }
`;

export interface AdmitCardStudentInput {
  name: string;
  fatherName?: string | null;
  roll: string;
  admissionNumber?: string | null;
}

export interface AdmitCardOptions {
  /** পরীক্ষার ধরন display label (already localized — e.g. "সাময়িক পরীক্ষা" / "Periodic Test") */
  examLabel: string;
  /** শিক্ষাবর্ষ, as entered by the admin */
  academicYear: string;
  /** পরীক্ষা শুরুর তারিখ, already formatted for display */
  examStartDate: string;
  /** জামাত display label (the selected class, shown the same for every card in this batch) */
  classLabel: string;
  students: AdmitCardStudentInput[];
}

/** Print প্রবেশপত্র (admit cards) for a whole class's roster — two per A4 page. */
export function printAdmitCards(opts: AdmitCardOptions, targetWindow?: Window | null) {
  const settings = madrasaSettings();

  const cardHtml = (s: AdmitCardStudentInput) => `
    <div class="ac-card"><div class="ac-card__inner">
      ${settings.logo ? `<img class="ac-watermark" src="${escapeHtml(settings.logo)}" alt="">` : ""}
      <div class="ac-head">
        ${settings.logo ? `<img src="${escapeHtml(settings.logo)}" alt="">` : ""}
        <div>
          <h1>${escapeHtml(settings.name)}</h1>
          ${settings.address ? `<div class="addr">${escapeHtml(settings.address)}</div>` : ""}
        </div>
      </div>
      <div class="ac-rule"></div>
      <div class="ac-titleWrap"><span class="ac-title">প্রবেশপত্র</span></div>
      <div class="ac-exam">${escapeHtml(opts.examLabel)}${opts.academicYear ? ` - ${escapeHtml(opts.academicYear)} শিক্ষাবর্ষ` : ""}</div>
      <div class="ac-idrow">
        <div class="ac-idbox">দাখেলা নং :<b>${escapeHtml(s.admissionNumber || "")}</b></div>
        <div class="ac-idbox">রোল নং :<b>${escapeHtml(s.roll)}</b></div>
      </div>
      <div class="ac-line">
        <span class="ac-lab">পরীক্ষার্থীর নাম</span><span class="ac-colon">:</span><span class="ac-val">${escapeHtml(s.name)}</span>
      </div>
      <div class="ac-line">
        <span class="ac-lab">পিতার নাম</span><span class="ac-colon">:</span><span class="ac-val">${escapeHtml(s.fatherName || "")}</span>
      </div>
      <div class="ac-line ac-line--split">
        <span class="ac-lab">জামাত</span><span class="ac-colon">:</span><span class="ac-val">${escapeHtml(opts.classLabel)}</span>
        ${opts.examStartDate ? `<span class="ac-examdate">পরীক্ষা শুরুর তারিখঃ ${escapeHtml(opts.examStartDate)}</span>` : ""}
      </div>
      <div class="ac-sigrow">
        <div class="ac-sig">মুহতামিমের দস্তখত</div>
        <div class="ac-sig">নাজিমে ইমতিহানের দস্তখত</div>
      </div>
    </div></div>
  `;

  const pages: string[] = [];
  for (let i = 0; i < opts.students.length; i += 2) {
    const pair = opts.students.slice(i, i + 2);
    pages.push(`<div class="ac-page">${pair.map(cardHtml).join("")}</div>`);
  }

  openRawPrintWindow(`প্রবেশপত্র - ${opts.classLabel}`, ADMIT_CARD_STYLES, pages.join(""), targetWindow);
}
