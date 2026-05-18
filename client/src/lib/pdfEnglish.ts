import { jsPDF } from "jspdf";

export function createEnglishPdf(orientation: "portrait" | "landscape" = "portrait") {
  return new jsPDF({ orientation, unit: "mm", format: "a4" });
}
