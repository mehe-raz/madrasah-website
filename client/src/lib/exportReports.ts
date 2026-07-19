import autoTable from "jspdf-autotable";
import { api } from "./api";
import { createBengaliPdf } from "./pdfFont";
import { NOTO_SANS_BENGALI_FAMILY } from "./fonts/notoSansBengaliBase64";
import type { Expense, IncomeEntry, Student } from "../types";
import { toEmbeddableImage } from "./toEmbeddableImage";

export type ReportKind =
  | "students"
  | "due"
  | "attendance"
  | "income"
  | "expenses"
  | "hifz";

const REPORT_TITLES: Record<ReportKind, string> = {
  students: "Student List",
  due: "Due List",
  attendance: "Attendance Report",
  income: "Income Report",
  expenses: "Expense Report",
  hifz: "Hifz Progress Report",
};

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

/** Madrasa name for PDF header | পিডিএফ হেডারে মাদ্রাসার নাম */
function madrasaNameForExport(): string {
  try {
    const raw = localStorage.getItem("madrasah-settings");
    if (raw) {
      const s = JSON.parse(raw) as { name?: string };
      if (s.name) return s.name;
    }
  } catch {
    /* ignore */
  }
  return "Madrasah ERP";
}

function exportSettings(): { name: string; logo?: string } {
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


  from?: string;
  to?: string;
}

function pdfName(kind: ReportKind, range?: ReportRangeOpts) {
  const r = range?.from && range?.to ? `-${range.from}_${range.to}` : `-${stamp()}`;
  return `madrasah-${kind}${r}.pdf`;
}

function csvName(kind: ReportKind, range?: ReportRangeOpts) {
  const r = range?.from && range?.to ? `-${range.from}_${range.to}` : `-${stamp()}`;
  return `madrasah-${kind}${r}.csv`;
}

async function exportPdfTable(
  title: string,
  headers: string[],
  rows: (string | number)[][],
  filename: string,
  landscape = false
) {
  const doc = createBengaliPdf(landscape ? "landscape" : "portrait");
  const settings = exportSettings();
  let startY = 28;
  const logo = await toEmbeddableImage(settings.logo);
  if (logo) {
    try {
      doc.addImage(logo.dataUrl, logo.type, 14, 8, 18, 18);
    } catch {
      /* ignore bad logo data */
    }
  }
  doc.setFont(NOTO_SANS_BENGALI_FAMILY);
  doc.setFontSize(11);
  doc.text(settings.name || madrasaNameForExport(), logo ? 36 : 14, 12);
  doc.setFontSize(13);
  doc.text(title, logo ? 36 : 14, 19);
  doc.setFontSize(9);
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString("en-GB")}`, logo ? 36 : 14, 25);
  doc.line(14, startY, landscape ? 283 : 196, startY);
  startY += 4;
  autoTable(doc, {
    head: [headers],
    body: rows.map((r) => r.map(String)),
    startY,
    styles: { font: NOTO_SANS_BENGALI_FAMILY, fontSize: 8, cellPadding: 2, textColor: [30, 30, 30], lineColor: [225, 225, 225] },
    headStyles: { font: NOTO_SANS_BENGALI_FAMILY, fillColor: [245, 245, 245], textColor: [30, 30, 30], lineColor: [210, 210, 210] },
    bodyStyles: { font: NOTO_SANS_BENGALI_FAMILY },
  });
  doc.save(filename);
}

function csvCell(value: string | number) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportExcelSheet(rows: (string | number)[][], filename: string) {
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function studentListRows(students: Student[]) {
  const header = ["Roll", "Name", "Name (EN)", "Class", "Dept", "Type", "Fee", "Due", "Phone", "Status"];
  const body = students.map((s) =>
    [s.roll, s.name, s.nameEn, s.class, s.dept, s.type, s.fee, s.due, s.phone, s.status]
  );
  return { header, body };
}

function dueListRows(students: Student[]) {
  const header = ["Roll", "Name", "Dept", "Monthly Fee", "Due", "Phone"];
  const body = students.map((s) => [s.roll, s.name, s.dept, s.fee, s.due, s.phone]);
  return { header, body };
}

function incomeRows(entries: IncomeEntry[]) {
  const header = ["Receipt", "Category", "Amount", "Date", "Method", "Student", "Note"];
  const body = entries.map((e) => [
    e.receipt,
    e.category,
    e.amount,
    e.date,
    e.method,
    e.student || "—",
    e.note,
  ]);
  return { header, body };
}

function expenseRows(expenses: Expense[]) {
  const header = ["Category", "Amount", "Date", "Note"];
  const body = expenses.map((e) => [e.cat, e.amount, e.date, e.note]);
  return { header, body };
}

function hifzRows(students: Student[]) {
  const header = ["Roll", "Name", "Class", "Paras Done", "Status"];
  const body = students.map((s) => [s.roll, s.nameEn || s.name, s.class, s.para, s.status]);
  return { header, body };
}

export async function exportReport(kind: ReportKind, format: "pdf" | "excel", range?: ReportRangeOpts) {
  const title = REPORT_TITLES[kind];
  const period =
    range?.from && range?.to ? ` (${range.from} to ${range.to})` : "";

  if (kind === "students") {
    const students = await api.getStudents();
    const { header, body } = studentListRows(students);
    if (format === "excel") exportExcelSheet([header, ...body], csvName(kind, range));
    else await exportPdfTable(title + period, header, body, pdfName(kind, range), true);
    return;
  }

  if (kind === "due") {
    const students = (await api.getStudents()).filter((s) => s.due > 0);
    const { header, body } = dueListRows(students);
    if (format === "excel") exportExcelSheet([header, ...body], csvName(kind, range));
    else await exportPdfTable(title + period, header, body, pdfName(kind, range));
    return;
  }

  if (kind === "attendance" && range?.from && range?.to) {
    const { rows } = await api.getReportAttendance(range.from, range.to);
    const header = ["Date", "Roll", "Name", "Class", "Dept", "Status"];
    const body = rows.map((r) => [r.date, r.roll, r.name, r.class, r.dept, r.status]);
    if (format === "excel") exportExcelSheet([header, ...body], csvName(kind, range));
    else await exportPdfTable(`${title}${period}`, header, body, pdfName(kind, range), true);
    return;
  }

  if (kind === "income" && range?.from && range?.to) {
    const entries = await api.getIncome({ from: range.from, to: range.to });
    const total = entries.reduce((s, e) => s + e.amount, 0);
    const { header, body } = incomeRows(entries);
    if (format === "excel") {
      exportExcelSheet([["Total Income", total], [], header, ...body], csvName(kind, range));
    } else {
      await exportPdfTable(`${title}${period} Total: ${total}`, header, body, pdfName(kind, range), true);
    }
    return;
  }

  if (kind === "expenses" && range?.from && range?.to) {
    const expenses = await api.getExpenses({ from: range.from, to: range.to });
    const total = expenses.reduce((s, e) => s + e.amount, 0);
    const { header, body } = expenseRows(expenses);
    if (format === "excel") {
      exportExcelSheet([["Total Expense", total], [], header, ...body], csvName(kind, range));
    } else {
      await exportPdfTable(`${title}${period} Total: ${total}`, header, body, pdfName(kind, range));
    }
    return;
  }

  if (kind === "hifz") {
    const students = await api.getHifzStudents();
    const { header, body } = hifzRows(students);
    if (format === "excel") exportExcelSheet([header, ...body], csvName(kind, range));
    else await exportPdfTable(title + period, header, body, pdfName(kind, range));
  }
}
