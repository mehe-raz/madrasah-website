import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ttf = fs.readFileSync(path.join(__dirname, "../src/lib/fonts/NotoSansBengali-Regular.ttf"));
const out = path.join(__dirname, "../src/lib/fonts/notoSansBengaliBase64.ts");
fs.writeFileSync(
  out,
  `export const NOTO_SANS_BENGALI_BASE64 = ${JSON.stringify(ttf.toString("base64"))};\n` +
    `export const NOTO_SANS_BENGALI_FILE = "NotoSansBengali-Regular.ttf";\n` +
    `export const NOTO_SANS_BENGALI_FAMILY = "NotoSansBengali";\n`
);
console.log("Wrote", out, "size", ttf.length);
