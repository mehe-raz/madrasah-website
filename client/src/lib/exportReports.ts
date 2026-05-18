import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { api } from "./api";
import { createEnglishPdf } from "./pdfEnglish";
import type { Expense, IncomeEntry, Student } from "../types";

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

export interface ReportRangeOpts {
  from?: string;
  to?: string;
}

function pdfName(kind: ReportKind, range?: ReportRangeOpts) {
  const r = range?.from && range?.to ? `-${range.from}_${range.to}` : `-${stamp()}`;
  return `madrasah-${kind}${r}.pdf`;
}

function xlsxName(kind: ReportKind, range?: ReportRangeOpts) {
  const r = range?.from && range?.to ? `-${range.from}_${range.to}` : `-${stamp()}`;
  return `madrasah-${kind}${r}.xlsx`;
}

function exportPdfTable(
  title: string,
  headers: string[],
  rows: (string | number)[][],
  filename: string,
  landscape = false
) {
  const doc = createEnglishPdf(landscape ? "landscape" : "portrait");
  doc.setFontSize(11);
  doc.text(madrasaNameForExport(), 14, 10);
  doc.setFontSize(13);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString("en-GB")}`, 14, 22);
  autoTable(doc, {
    head: [headers],
    body: rows.map((r) => r.map(String)),
    startY: 26,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [13, 148, 136] },
  });
  doc.save(filename);
}

function exportExcelSheet(rows: (string | number)[][], filename: string, sheetName: string) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename);
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
    if (format === "excel") exportExcelSheet([header, ...body], xlsxName(kind, range), "Students");
    else exportPdfTable(title + period, header, body, pdfName(kind, range), true);
    return;
  }

  if (kind === "due") {
    const students = (await api.getStudents()).filter((s) => s.due > 0);
    const { header, body } = dueListRows(students);
    if (format === "excel") exportExcelSheet([header, ...body], xlsxName(kind, range), "Due");
    else exportPdfTable(title + period, header, body, pdfName(kind, range));
    return;
  }

  if (kind === "attendance" && range?.from && range?.to) {
    const { rows } = await api.getReportAttendance(range.from, range.to);
    const header = ["Date", "Roll", "Name", "Class", "Dept", "Status"];
    const body = rows.map((r) => [r.date, r.roll, r.name, r.class, r.dept, r.status]);
    if (format === "excel") exportExcelSheet([header, ...body], xlsxName(kind, range), "Attendance");
    else exportPdfTable(`${title}${period}`, header, body, pdfName(kind, range), true);
    return;
  }

  if (kind === "income" && range?.from && range?.to) {
    const entries = await api.getIncome({ from: range.from, to: range.to });
    const total = entries.reduce((s, e) => s + e.amount, 0);
    const { header, body } = incomeRows(entries);
    if (format === "excel") {
      exportExcelSheet([["Total Income", total], [], header, ...body], xlsxName(kind, range), "Income");
    } else {
      exportPdfTable(`${title}${period} Total: ${total}`, header, body, pdfName(kind, range), true);
    }
    return;
  }

  if (kind === "expenses" && range?.from && range?.to) {
    const expenses = await api.getExpenses({ from: range.from, to: range.to });
    const total = expenses.reduce((s, e) => s + e.amount, 0);
    const { header, body } = expenseRows(expenses);
    if (format === "excel") {
      exportExcelSheet([["Total Expense", total], [], header, ...body], xlsxName(kind, range), "Expenses");
    } else {
      exportPdfTable(`${title}${period} Total: ${total}`, header, body, pdfName(kind, range));
    }
    return;
  }

  if (kind === "hifz") {
    const students = await api.getHifzStudents();
    const { header, body } = hifzRows(students);
    if (format === "excel") exportExcelSheet([header, ...body], xlsxName(kind, range), "Hifz");
    else exportPdfTable(title + period, header, body, pdfName(kind, range));
  }
}
