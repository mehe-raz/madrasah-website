/**
 * One-time migration: uploads any base64 data-URL images still stored
 * directly in the database (students.studentPhoto, students.documents,
 * settings.logo) to Cloudinary, and replaces them with the returned URL.
 *
 * Safe to re-run — anything that is no longer a base64 data URL (already
 * a Cloudinary URL, or empty) is skipped.
 *
 * Usage:
 *   cd server
 *   node scripts/migrate-images-to-cloudinary.js
 *
 * Requires DATABASE_URL and CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY /
 * CLOUDINARY_API_SECRET to be set (e.g. via server/.env, which this script
 * loads automatically).
 */
require("dotenv").config();
const db = require("../src/db");
const { cloudinary, configureOnce, isConfigured } = require("../src/lib/cloudinary");

function isBase64Image(value) {
  return typeof value === "string" && value.startsWith("data:image/");
}

async function uploadDataUrl(dataUrl, folder) {
  const result = await cloudinary.uploader.upload(dataUrl, {
    folder: `madrasah/${folder}`,
    resource_type: "image",
  });
  return result.secure_url;
}

async function migrateStudents() {
  const students = await db.all('SELECT id, "studentPhoto", documents FROM students');
  let changed = 0;

  for (const student of students) {
    let dirty = false;
    let studentPhoto = student.studentPhoto;
    let documents = student.documents || {};
    if (typeof documents === "string") {
      try {
        documents = JSON.parse(documents);
      } catch {
        documents = {};
      }
    }

    if (isBase64Image(studentPhoto)) {
      studentPhoto = await uploadDataUrl(studentPhoto, "students");
      dirty = true;
    }

    for (const key of Object.keys(documents)) {
      if (isBase64Image(documents[key])) {
        documents[key] = await uploadDataUrl(documents[key], "students");
        dirty = true;
      }
    }
    // Keep studentPhoto and documents.studentPhoto in sync, same as the app does elsewhere.
    if (documents.studentPhoto && documents.studentPhoto !== studentPhoto) {
      studentPhoto = documents.studentPhoto;
      dirty = true;
    }

    if (dirty) {
      await db.run('UPDATE students SET "studentPhoto" = $1, documents = $2 WHERE id = $3', [
        studentPhoto,
        JSON.stringify(documents),
        student.id,
      ]);
      changed++;
      console.log(`  migrated student #${student.id}`);
    }
  }

  return changed;
}

async function migrateLogo() {
  const row = await db.get("SELECT value FROM settings WHERE key = $1", ["logo"]);
  if (!row || !isBase64Image(row.value)) return false;

  const url = await uploadDataUrl(row.value, "settings");
  await db.run("UPDATE settings SET value = $1 WHERE key = $2", [url, "logo"]);
  console.log("  migrated site logo");
  return true;
}

async function main() {
  if (!isConfigured()) {
    console.error(
      "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET first."
    );
    process.exit(1);
  }
  configureOnce();

  console.log("Migrating student photos/documents...");
  const studentsChanged = await migrateStudents();

  console.log("Migrating site logo...");
  const logoChanged = await migrateLogo();

  console.log(
    `Done. ${studentsChanged} student record(s) updated. Logo ${logoChanged ? "updated" : "unchanged"}.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
