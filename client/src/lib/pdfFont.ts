import jsPDF from "jspdf";
import {
  NOTO_SANS_BENGALI_BASE64,
  NOTO_SANS_BENGALI_FAMILY,
  NOTO_SANS_BENGALI_FILE,
} from "./fonts/notoSansBengaliBase64";

let fontRegistered = false;

export function registerBengaliFont(doc: jsPDF) {
  if (fontRegistered) {
    doc.setFont(NOTO_SANS_BENGALI_FAMILY);
    return;
  }
  doc.addFileToVFS(NOTO_SANS_BENGALI_FILE, NOTO_SANS_BENGALI_BASE64);
  doc.addFont(NOTO_SANS_BENGALI_FILE, NOTO_SANS_BENGALI_FAMILY, "normal");
  fontRegistered = true;
  doc.setFont(NOTO_SANS_BENGALI_FAMILY);
}

export function createBengaliPdf(orientation: "portrait" | "landscape" = "portrait") {
  const doc = new jsPDF({ orientation });
  registerBengaliFont(doc);
  return doc;
}
