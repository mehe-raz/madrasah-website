// ============================================================================
// registry-cli.js  (Part 1 / 6 — Central Registry Database)
// ============================================================================
// Command-line tool for managing the tenant registry until the Super-Admin
// web panel (Part 5) exists. Run with `node server/scripts/registry-cli.js <command> ...`
//
// Commands:
//   init                                              Create the registry schema (idempotent)
//   create <name> <code> <adminEmail> <adminPassword> [phone]
//                                                      Register + fully provision a new institution
//                                                      (schema + 17 tables + first Super Admin login)
//   provision <code> <adminEmail> <adminPassword>     (Re)provision the schema for an institution
//                                                      that's already in the registry but has no
//                                                      working schema yet (e.g. Part 1-era row)
//   list                                               List all institutions
//   status <code> <trial|active|suspended|cancelled>   Change status
//   platform-admin-create <name> <email> <password>    Create a login for the Super-Admin web panel
//                                                      (Part 5) — there is no self-registration for
//                                                      this by design, so the first one must be
//                                                      created here.
//   record-payment <code> <amount> [method] [reference] [periodDays]
//                                                      Record a manually-confirmed payment (Part 6)
//                                                      and extend/reactivate the subscription
//   payments <code>                                    List payment history for an institution
//   expiry-scan                                         Manually run the auto-suspend sweep once
//                                                      (also runs automatically every hour — see
//                                                      src/billing.js / BILLING_AUTOSUSPEND_INTERVAL_MINUTES)
//   migrate-tenants <path-to-sql-file>                  Run a SQL file against every tenant schema
//                                                      (Part 6 — see docs/MULTI_TENANT_PLAN.md)
//
// Examples:
//   node server/scripts/registry-cli.js init
//   node server/scripts/registry-cli.js create "Al-Madina Madrasah" al-madina admin@almadina.com "Str0ngPass!" 01700000000
//   node server/scripts/registry-cli.js provision al-madina admin@almadina.com "Str0ngPass!"
//   node server/scripts/registry-cli.js list
//   node server/scripts/registry-cli.js status al-madina suspended
//   node server/scripts/registry-cli.js platform-admin-create "Your Name" you@example.com "Str0ngPass!"
//   node server/scripts/registry-cli.js record-payment al-madina 5000 bkash "TRX123ABC" 30
//   node server/scripts/registry-cli.js payments al-madina
//   node server/scripts/registry-cli.js expiry-scan
//   node server/scripts/registry-cli.js migrate-tenants ./some-migration.sql
// ============================================================================

require("dotenv").config({ quiet: true });
const registryDb = require("../src/registryDb");
const tenantProvision = require("../src/tenantProvision");
const migrateTenants = require("../src/migrateTenants");
const fs = require("fs");

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
      const [name, code, adminEmail, adminPassword, contactPhone] = args;
      if (!name || !code || !adminEmail || !adminPassword) {
        console.error(
          'Usage: create "<Institution Name>" <code> <adminEmail> <adminPassword> [phone]'
        );
        process.exit(1);
      }
      const inst = await tenantProvision.provisionInstitution({
        name,
        code,
        contactPhone,
        adminEmail,
        adminPassword,
      });
      console.log("Institution created and schema provisioned:");
      console.log(inst);
      console.log(
        `\n"${inst.name}" can now log in with ${adminEmail.trim().toLowerCase()} once ` +
          `Tenant Resolution Middleware (Part 3) routes their requests to schema "${inst.schema_name}".`
      );
      break;
    }

    case "provision": {
      const [code, adminEmail, adminPassword] = args;
      if (!code || !adminEmail || !adminPassword) {
        console.error("Usage: provision <code> <adminEmail> <adminPassword>");
        process.exit(1);
      }
      const inst = await registryDb.getInstitutionByCode(code);
      if (!inst) {
        console.error(`No institution found with code "${code}"`);
        process.exit(1);
      }
      await tenantProvision.provisionTenantSchema(inst.schema_name, { adminEmail, adminPassword });
      await registryDb.logAction(inst.id, adminEmail, "institution_reprovisioned", {
        schema: inst.schema_name,
      });
      console.log(`Schema "${inst.schema_name}" provisioned for "${inst.name}".`);
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

    case "platform-admin-create": {
      const [name, email, password] = args;
      if (!name || !email || !password) {
        console.error('Usage: platform-admin-create "<Your Name>" <email> <password>');
        process.exit(1);
      }
      const admin = await registryDb.createPlatformAdmin({ name, email, password });
      console.log("Platform admin created:");
      console.log(admin);
      console.log(`\nLog in at /platform with ${admin.email}.`);
      break;
    }

    case "record-payment": {
      const [code, amountStr, method, reference, periodDaysStr] = args;
      if (!code || !amountStr) {
        console.error("Usage: record-payment <code> <amount> [method] [reference] [periodDays]");
        process.exit(1);
      }
      const inst = await registryDb.getInstitutionByCode(code);
      if (!inst) {
        console.error(`No institution found with code "${code}"`);
        process.exit(1);
      }
      const payment = await registryDb.recordPayment(inst.id, {
        amount: Number(amountStr),
        method: method || "manual",
        reference,
        periodDays: periodDaysStr ? Number(periodDaysStr) : undefined,
        recordedBy: "cli",
      });
      await registryDb.logAction(inst.id, "cli", "payment_recorded", {
        amount: payment.amount,
        method: payment.method,
        reference: payment.reference,
        coversUntil: payment.covers_until,
      });
      console.log(`Payment recorded for "${inst.name}". Subscription now covers until: ${payment.covers_until}`);
      break;
    }

    case "payments": {
      const [code] = args;
      if (!code) {
        console.error("Usage: payments <code>");
        process.exit(1);
      }
      const inst = await registryDb.getInstitutionByCode(code);
      if (!inst) {
        console.error(`No institution found with code "${code}"`);
        process.exit(1);
      }
      const rows = await registryDb.listPayments({ institutionId: inst.id });
      if (!rows.length) {
        console.log(`No payments recorded yet for "${inst.name}".`);
        break;
      }
      console.table(
        rows.map((r) => ({
          id: r.id,
          amount: r.amount,
          currency: r.currency,
          method: r.method,
          reference: r.reference,
          covers_until: r.covers_until,
          created_at: r.created_at,
        }))
      );
      break;
    }

    case "expiry-scan": {
      const suspended = await registryDb.runExpiryScan();
      if (!suspended.length) {
        console.log("No expired trials/subscriptions found. Nothing changed.");
        break;
      }
      console.log(`Auto-suspended ${suspended.length} institution(s):`);
      console.table(suspended);
      break;
    }

    case "migrate-tenants": {
      const [sqlFilePath] = args;
      if (!sqlFilePath) {
        console.error("Usage: migrate-tenants <path-to-sql-file>");
        process.exit(1);
      }
      const sqlText = fs.readFileSync(sqlFilePath, "utf8");
      const tenants = await migrateTenants.listTenantSchemas();
      console.log(`Running SQL from "${sqlFilePath}" against ${tenants.length} tenant schema(s)...`);
      const result = await migrateTenants.migrateAllTenants(sqlText);
      await registryDb.logAction(null, "cli", "tenant_migration_run", {
        total: result.total,
        succeeded: result.succeeded.length,
        failed: result.failed.map((f) => ({ code: f.code, error: f.error })),
        sqlLength: sqlText.length,
      });
      console.log(`Succeeded: ${result.succeeded.length}/${result.total}`);
      if (result.succeeded.length) console.table(result.succeeded);
      if (result.failed.length) {
        console.error(`Failed: ${result.failed.length}`);
        console.table(result.failed);
        process.exitCode = 1;
      }
      break;
    }

    default: {
      console.log(
        [
          "Usage:",
          "  node server/scripts/registry-cli.js init",
          '  node server/scripts/registry-cli.js create "<Name>" <code> <adminEmail> <adminPassword> [phone]',
          "  node server/scripts/registry-cli.js provision <code> <adminEmail> <adminPassword>",
          "  node server/scripts/registry-cli.js list",
          "  node server/scripts/registry-cli.js status <code> <trial|active|suspended|cancelled>",
          '  node server/scripts/registry-cli.js platform-admin-create "<Your Name>" <email> <password>',
          "  node server/scripts/registry-cli.js record-payment <code> <amount> [method] [reference] [periodDays]",
          "  node server/scripts/registry-cli.js payments <code>",
          "  node server/scripts/registry-cli.js expiry-scan",
          "  node server/scripts/registry-cli.js migrate-tenants <path-to-sql-file>",
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
