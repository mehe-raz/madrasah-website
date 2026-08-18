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
const ADMISSION_FRAME_GAP_MM = 4;

// Border is a chain of small square medallions tiled edge-to-edge (not a
// repeating SVG <pattern> fill) — Chromium's print/PDF pipeline rasterizes
// <pattern> tiles at a low, screen-resolution snapshot and stretches that
// raster to fill the shape, which prints/exports blurry even though it
// looks crisp in a live browser tab. Discrete elements are each rendered
// as real vector output, so they stay sharp in print and PDF export.
//
// Box count per edge is computed (not fixed) so the tiles always divide
// the edge length exactly — no half-box ever gets cut off at a corner.
const ADMISSION_BOX_TARGET_MM = 10;
const ADMISSION_BOX_COUNT_H = Math.round(ADMISSION_PAGE.widthMm / ADMISSION_BOX_TARGET_MM);
const ADMISSION_BOX_SIZE_H_MM = ADMISSION_PAGE.widthMm / ADMISSION_BOX_COUNT_H;
const ADMISSION_AVAIL_V_MM = ADMISSION_PAGE.heightMm - ADMISSION_BOX_SIZE_H_MM * 2;
const ADMISSION_BOX_COUNT_V = Math.round(ADMISSION_AVAIL_V_MM / ADMISSION_BOX_TARGET_MM);
const ADMISSION_BOX_SIZE_V_MM = ADMISSION_AVAIL_V_MM / ADMISSION_BOX_COUNT_V;

/** Small flower-in-square medallion, tiled all the way around the page border. */
const ADMISSION_BOX_SVG = `
  <svg viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
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

function afEdge(edge: "top" | "bottom" | "left" | "right"): string {
  const count = edge === "left" || edge === "right" ? ADMISSION_BOX_COUNT_V : ADMISSION_BOX_COUNT_H;
  const boxes = `<div class="af-box">${ADMISSION_BOX_SVG}</div>`.repeat(count);
  return `<div class="af-edge af-edge-${edge}">${boxes}</div>`;
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
  .af-edge { position: absolute; display: flex; }
  .af-edge-top, .af-edge-bottom { left: 0; width: 100%; height: ${ADMISSION_BOX_SIZE_H_MM}mm; flex-direction: row; }
  .af-edge-top { top: 0; }
  .af-edge-bottom { bottom: 0; }
  .af-edge-left, .af-edge-right {
    top: ${ADMISSION_BOX_SIZE_H_MM}mm; bottom: ${ADMISSION_BOX_SIZE_H_MM}mm;
    width: ${ADMISSION_BOX_SIZE_V_MM}mm; flex-direction: column;
  }
  .af-edge-left { left: 0; }
  .af-edge-right { right: 0; }
  .af-box { flex: 1 1 0; min-width: 0; min-height: 0; }
  .af-box svg { width: 100%; height: 100%; display: block; }

  .af-content {
    position: absolute;
    top: ${ADMISSION_BOX_SIZE_H_MM + ADMISSION_FRAME_GAP_MM}mm;
    left: ${ADMISSION_BOX_SIZE_H_MM + ADMISSION_FRAME_GAP_MM}mm;
    right: ${ADMISSION_BOX_SIZE_H_MM + ADMISSION_FRAME_GAP_MM}mm;
    bottom: ${ADMISSION_BOX_SIZE_H_MM + ADMISSION_FRAME_GAP_MM}mm;
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
      ${afEdge("top")}
      ${afEdge("bottom")}
      ${afEdge("left")}
      ${afEdge("right")}

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
// Admit Card (প্রবেশপত্র) — printed on top of the reference admit-card
// artwork itself (client/public/admit-card-bg.jpg — a high-resolution
// (600dpi) capture of the institution's actual admit-card design, with
// only the tenant-specific parts — institution name, address, logo,
// watermark, exam session line, exam date, and the fill-in values —
// removed so they can be drawn dynamically on top). This follows the
// same reasoning as the admission form: reusing the institution's real
// artwork guarantees an exact match to their design; only the dynamic
// text is coded.
//
// Card is sized to the reference artwork's own proportions
// (158.33mm × 99.74mm, measured from the source PDF), two per A4 page,
// matching the original template's own two-cards-per-page layout.
// ----------------------------------------------------------------------

const ADMIT_CARD_SIZE = { widthMm: 158.33, heightMm: 99.74 };

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

const ADMIT_CARD_STYLES = `
  @page { size: A4; margin: 8mm 10mm; }
  * {
    box-sizing: border-box; margin: 0; padding: 0;
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
    align-items: center;
    justify-content: center;
    gap: 8mm;
    min-height: calc(297mm - 16mm);
    page-break-after: always;
  }
  .ac-page:last-child { page-break-after: auto; }
  .ac-card {
    position: relative;
    width: ${ADMIT_CARD_SIZE.widthMm}mm;
    height: ${ADMIT_CARD_SIZE.heightMm}mm;
    flex: 0 0 auto;
    overflow: hidden;
  }
  .ac-card .ac-bg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: block; }
  .ac-logo {
    position: absolute !important;
    left: 6mm; top: 7mm; width: 30mm; height: 28mm;
    object-fit: contain; z-index: 2;
  }
  .ac-wm {
    position: absolute !important;
    left: 50%; top: 52%; width: 60mm;
    transform: translate(-50%, -50%);
    opacity: 0.13; object-fit: contain; z-index: 1;
  }
  .ac-fld {
    position: absolute; z-index: 2;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    color: #111; font-weight: 700;
  }
  .ac-instname { font-size: 6.8mm; color: #00563f; font-weight: 800; transform: translateY(-100%); }
  .ac-addr { font-size: 3mm; color: #334155; font-weight: 600; transform: translateY(-100%); }
  .ac-examline { font-size: 3.9mm; font-weight: 700; transform: translateY(-100%); text-align: center; }
  .ac-val { font-size: 4mm; transform: translateY(-100%); }
  .ac-examdate { font-size: 3.3mm; text-decoration: underline; transform: translateY(-100%); }
`;

/** Millimeter coordinates (from card top-left) for every dynamic field, measured from the reference artwork. */
const AC_POS = {
  logo: { left: 6, top: 7, width: 30, height: 28 },
  instName: { left: 37.59, top: 18.37, maxWidth: 101.25 },
  address: { left: 43.24, top: 22.75, maxWidth: 89.6 },
  examLine: { left: 18.89, top: 40.6, width: 119.95 },
  dakhola: { left: 31.95, top: 48.39, maxWidth: 43.4 },
  roll: { left: 111.68, top: 48.39, maxWidth: 39.5 },
  name: { left: 39.0, top: 58.1, maxWidth: 95.6 },
  father: { left: 39.0, top: 65.24, maxWidth: 95.6 },
  jamat: { left: 39.0, top: 72.38, maxWidth: 59.27 },
  examDate: { left: 131.08, top: 71.89, maxWidth: 16.58 },
};

/** Print প্রবেশপত্র (admit cards) for a whole class's roster — two per A4 page. */
export function printAdmitCards(opts: AdmitCardOptions, targetWindow?: Window | null) {
  const settings = madrasaSettings();
  const bgUrl = `${window.location.origin}/admit-card-bg.jpg`;
  const examSessionText = `${opts.examLabel}${opts.academicYear ? ` - ${opts.academicYear} শিক্ষাবর্ষ` : ""}`;

  const fld = (key: keyof typeof AC_POS, cls: string, value: string, extraStyle = "") => {
    const p = AC_POS[key];
    const width = "width" in p ? `width:${p.width}mm;` : `max-width:${(p as { maxWidth: number }).maxWidth}mm;`;
    return `<div class="ac-fld ${cls}" style="left:${p.left}mm;top:${p.top}mm;${width}${extraStyle}">${escapeHtml(value)}</div>`;
  };

  const cardHtml = (s: AdmitCardStudentInput) => `
    <div class="ac-card">
      <img class="ac-bg" src="${bgUrl}" alt="">
      ${settings.logo ? `<img class="ac-wm" src="${escapeHtml(settings.logo)}" alt="">` : ""}
      ${settings.logo ? `<img class="ac-logo" src="${escapeHtml(settings.logo)}" alt="">` : ""}
      ${fld("instName", "ac-instname", settings.name)}
      ${settings.address ? fld("address", "ac-addr", settings.address) : ""}
      ${fld("examLine", "ac-examline", examSessionText)}
      ${fld("dakhola", "ac-val", s.admissionNumber || "")}
      ${fld("roll", "ac-val", s.roll)}
      ${fld("name", "ac-val", s.name)}
      ${fld("father", "ac-val", s.fatherName || "")}
      ${fld("jamat", "ac-val", opts.classLabel)}
      ${opts.examStartDate ? fld("examDate", "ac-examdate", opts.examStartDate) : ""}
    </div>
  `;

  const pages: string[] = [];
  for (let i = 0; i < opts.students.length; i += 2) {
    const pair = opts.students.slice(i, i + 2);
    pages.push(`<div class="ac-page">${pair.map(cardHtml).join("")}</div>`);
  }

  openRawPrintWindow(`প্রবেশপত্র - ${opts.classLabel}`, ADMIT_CARD_STYLES, pages.join(""), targetWindow);
}

// ----------------------------------------------------------------------
// Exam Cover Sheet (পরীক্ষার খাতার প্রথম পেইজ) — reproduces the reference
// design supplied for this feature: centered institution logo/name/address,
// an underline-blank + "পরিক্ষা" title line, a dashed info box (সিট নং,
// শ্রেণী, শাখা, শিক্ষার্থীর আইডি, মাধ্যম, বিষয়, তারিখ) with the
// institution's own emblem as a light watermark behind it, a ১৪-row
// লিখিত/মৌখিক/মোট নাম্বার/মন্তব্য marks table plus two total rows, and
// three rounded signature boxes (পরিদর্শক/পরীক্ষক/অভিভাবক).
//
// Per the same strict no-guessing rule as printAdmissionForm: শ্রেণী, শাখা
// and শিক্ষার্থীর আইডি are auto-filled from the student record (class,
// section, admissionNumber) and সিট নং from the student's roll (rolls
// double as exam seat numbers in this institution's own admit-card
// template above). বিষয় and তারিখ are filled from the batch's own inputs.
// মাধ্যম has no matching Student field anywhere in this codebase, so it is
// left blank for the invigilator to fill in by hand, same as unmapped
// fields on the admission form.
// ----------------------------------------------------------------------

const EXAM_COVER_STYLES = `
  @page { size: A4; margin: 10mm 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Noto Sans Bengali", "Nirmala UI", "Noto Sans", "Segoe UI", Arial, sans-serif;
    color: #0f172a;
  }
  .ecs-page { page-break-after: always; position: relative; }
  .ecs-page:last-child { page-break-after: auto; }
  .ecs-wm {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    height: 90mm; width: 90mm; object-fit: contain; opacity: 0.12; z-index: 0;
  }
  .ecs-content { position: relative; z-index: 1; }
  .ecs-header { text-align: center; margin-bottom: 3mm; }
  .ecs-header img { height: 20mm; width: 20mm; object-fit: contain; margin: 0 auto 2mm; display: block; }
  .ecs-header h1 { font-size: 27px; font-weight: 800; }
  .ecs-header .addr { font-size: 12.5px; color: #334155; margin-top: 1.5mm; }
  .ecs-title { text-align: center; font-size: 20px; font-weight: 700; margin: 5mm 0 6mm; }
  .ecs-title .blank { display: inline-block; min-width: 42mm; border-bottom: 1.4px solid #000; margin-right: 3mm; }
  .ecs-box {
    border: 1.6px dashed #000; border-radius: 3mm;
    padding: 4mm 8mm 4mm;
  }
  .ecs-row { display: flex; gap: 12mm; font-size: 13.5px; font-weight: 600; margin: 4mm 0; }
  .ecs-row .field { display: flex; align-items: baseline; flex: 1; gap: 2mm; }
  .ecs-row .field .lbl { flex-shrink: 0; }
  .ecs-row .field .val { flex: 1; border-bottom: 1px solid #000; min-height: 5mm; padding-left: 1mm; font-weight: 700; }
  table.ecs-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 4mm; }
  .ecs-table th, .ecs-table td { border: 1px solid #000; padding: 0.8mm 2.5mm; text-align: center; height: 5.5mm; }
  .ecs-table th { background: #f1f5f9; font-weight: 800; }
  .ecs-table td.ecs-idx { width: 12mm; }
  .ecs-table tfoot td { text-align: left; font-weight: 700; }
  .ecs-sigrow { display: flex; justify-content: space-between; margin-top: 5mm; gap: 6mm; }
  .ecs-sig {
    flex: 1; display: flex; align-items: flex-end; justify-content: center;
    min-height: 22mm; text-align: center; font-size: 12px; font-weight: 700; color: #15803d;
    border: 2px solid #16a34a; border-radius: 10mm; padding: 2mm 2mm 3mm;
  }
`;

export interface ExamCoverStudentInput {
  name: string;
  roll: string;
  section?: string | null;
  admissionNumber?: string | null;
}

export interface ExamCoverSheetOptions {
  /** টেক্সট যা "____ পরিক্ষা" শিরোনামের ফাঁকা স্থানে বসবে (যেমন: "বার্ষিক", "মাসিক") */
  examName: string;
  subject: string;
  /** already formatted for display, e.g. DD/MM/YYYY */
  examDate: string;
  classLabel: string;
  students: ExamCoverStudentInput[];
}

function ecsField(label: string, value: string | number | null | undefined): string {
  const v = value === null || value === undefined ? "" : String(value);
  return `<div class="field"><span class="lbl">${escapeHtml(label)}:</span><span class="val">${escapeHtml(v)}</span></div>`;
}

/** Print পরীক্ষার খাতার প্রথম পেইজ (exam cover sheet) — one page per student. */
export function printExamCoverSheets(opts: ExamCoverSheetOptions, targetWindow?: Window | null) {
  const settings = madrasaSettings();
  const markRows = Array.from({ length: 14 }, (_, i) => `<tr><td class="ecs-idx">${i + 1}</td><td></td><td></td><td></td><td></td></tr>`).join("");

  const pageHtml = (s: ExamCoverStudentInput) => `
    <div class="ecs-page">
      ${settings.logo ? `<img class="ecs-wm" src="${escapeHtml(settings.logo)}" alt="">` : ""}
      <div class="ecs-content">
        <div class="ecs-header">
          ${settings.logo ? `<img src="${escapeHtml(settings.logo)}" alt="">` : ""}
          <h1>${escapeHtml(settings.name)}</h1>
          ${settings.address ? `<div class="addr">${escapeHtml(settings.address)}</div>` : ""}
        </div>
        <div class="ecs-title"><span class="blank">${escapeHtml(opts.examName)}</span>পরিক্ষা</div>
        <div class="ecs-box">
          <div class="ecs-row">${ecsField("সিট নং", s.roll)}</div>
          <div class="ecs-row">${ecsField("শ্রেণী", opts.classLabel)}${ecsField("শাখা", s.section)}</div>
          <div class="ecs-row">${ecsField("শিক্ষার্থীর আইডি", s.admissionNumber)}${ecsField("মাধ্যম", "")}</div>
          <div class="ecs-row">${ecsField("বিষয়", opts.subject)}${ecsField("তারিখ", opts.examDate)}</div>
        </div>
        <table class="ecs-table">
          <thead><tr><th>ক্র. নং</th><th>লিখিত</th><th>মৌখিক</th><th>মোট নাম্বার</th><th>মন্তব্য</th></tr></thead>
          <tbody>${markRows}</tbody>
          <tfoot>
            <tr><td colspan="3">মোট প্রাপ্ত নাম্বার</td><td></td><td></td></tr>
            <tr><td colspan="3">মোট নাম্বার</td><td></td><td></td></tr>
          </tfoot>
        </table>
        <div class="ecs-sigrow">
          <div class="ecs-sig">পরিদর্শকের স্বাক্ষর</div>
          <div class="ecs-sig">পরীক্ষকের স্বাক্ষর</div>
          <div class="ecs-sig">অভিভাবকের স্বাক্ষর</div>
        </div>
      </div>
    </div>
  `;

  const html = opts.students.map(pageHtml).join("");
  openRawPrintWindow(`পরীক্ষার খাতা - ${opts.classLabel}`, EXAM_COVER_STYLES, html, targetWindow);
}
