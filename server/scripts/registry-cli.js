// ============================================================================
// registry-cli.js  (Part 1 / 6 — Central Registry Database)
// ============================================================================
// Command-line tool for managing the tenant registry until the Super-Admin
// web panel (Part 5) exists. Run with `node server/scripts/registry-cli.js <command> ...`
//
// Commands:
//   init                                   Create the registry schema (idempotent)
//   create <name> <code> [email] [phone]   Register a new institution
//   list                                   List all institutions
//   status <code> <trial|active|suspended|cancelled>   Change status
//
// Examples:
//   node server/scripts/registry-cli.js init
//   node server/scripts/registry-cli.js create "Al-Madina Madrasah" al-madina admin@almadina.com 01700000000
//   node server/scripts/registry-cli.js list
//   node server/scripts/registry-cli.js status al-madina suspended
// ============================================================================

require("dotenv").config({ quiet: true });
const registryDb = require("../src/registryDb");

async function main() {
  const [, , command, ...args] = process.argv;

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required (set it in server/.env)");
    process.exit(1);
  }

  switch (command) {
    case "init": {
      await registryDb.initRegistrySchema();
      console.log("Registry schema ready (registry.institutions, registry.platform_admins, registry.audit_logs).");
      break;
    }

    case "create": {
      const [name, code, contactEmail, contactPhone] = args;
      if (!name || !code) {
        console.error('Usage: create "<Institution Name>" <code> [email] [phone]');
        process.exit(1);
      }
      const inst = await registryDb.createInstitution({ name, code, contactEmail, contactPhone });
      console.log("Created institution:");
      console.log(inst);
      console.log(
        `\nNext step (Part 2): provision schema "${inst.schema_name}" with the tenant tables ` +
          `(supabase_schema.sql), then that institution can start using the app.`
      );
      break;
    }

    case "list": {
      const rows = await registryDb.listInstitutions();
      if (!rows.length) {
        console.log("No institutions yet. Use: registry-cli.js create \"Name\" code");
        break;
      }
      console.table(
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          code: r.code,
          schema: r.schema_name,
          status: r.status,
          plan: r.plan,
          trial_ends_at: r.trial_ends_at,
          subscription_ends_at: r.subscription_ends_at,
        }))
      );
      break;
    }

    case "status": {
      const [code, status] = args;
      if (!code || !status) {
        console.error("Usage: status <code> <trial|active|suspended|cancelled>");
        process.exit(1);
      }
      const inst = await registryDb.getInstitutionByCode(code);
      if (!inst) {
        console.error(`No institution found with code "${code}"`);
        process.exit(1);
      }
      const updated = await registryDb.updateStatus(inst.id, status);
      console.log(`Institution "${updated.name}" (${updated.code}) is now: ${updated.status}`);
      break;
    }

    default: {
      console.log(
        [
          "Usage:",
          "  node server/scripts/registry-cli.js init",
          '  node server/scripts/registry-cli.js create "<Name>" <code> [email] [phone]',
          "  node server/scripts/registry-cli.js list",
          "  node server/scripts/registry-cli.js status <code> <trial|active|suspended|cancelled>",
        ].join("\n")
      );
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("registry-cli error:", err.message);
  process.exit(1);
});
