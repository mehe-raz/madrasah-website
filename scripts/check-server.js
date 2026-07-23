// scripts/check-server.js
//
// Minimal "does the server even parse" gate — runs `node --check` (syntax
// check only, nothing executes, no DB/env needed) on every .js file under
// server/src. This is NOT a replacement for real tests; it just catches
// the most common AI-edit mistake: a syntax error that would otherwise
// only surface when someone actually starts the server.
//
// Part of `npm run check`.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const serverSrc = path.join(__dirname, "..", "server", "src");

function collectJsFiles(dir) {
  let files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(collectJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(full);
    }
  }
  return files;
}

const files = collectJsFiles(serverSrc);
let failed = 0;

for (const file of files) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (err) {
    failed++;
    console.error(`[check-server] SYNTAX ERROR: ${path.relative(process.cwd(), file)}`);
    console.error(err.stderr ? err.stderr.toString() : err.message);
  }
}

if (failed > 0) {
  console.error(`[check-server] ${failed}/${files.length} file(s) failed syntax check.`);
  process.exit(1);
}

console.log(`[check-server] OK — ${files.length} server file(s) parsed cleanly.`);
