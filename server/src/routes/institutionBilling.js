// ============================================================================
// routes/institutionBilling.js — প্রতিষ্ঠান নিজে প্ল্যাটফর্মের মাসিক
// সাবস্ক্রিপশন বিল বিকাশে পরিশোধ করে (ad-hoc, docs/CURRENT_TASK.md-এ পূর্ণ
// লেখা আছে)।
// ============================================================================
// দিকটা Phase 8F-এর উল্টো: institution -> platform, guardian -> institution
// না। guardianAuth.js-এর bKash create/execute-এর ঠিক same create→execute
// লাইফসাইকেল ও idempotency-গ্যারান্টি (redirect query string কখনো বিশ্বাস
// করা হয় না, শুধু bKash-এর নিজের execute রেসপন্স), কিন্তু দুইটা মূল পার্থক্য:
//   1. ক্রেডেনশিয়াল আসে institution_payment_gateways থেকে না, প্ল্যাটফর্মের
//      নিজের registry.platform_gateway থেকে (lib/platformGatewayCredentials.js)।
//   2. সফল হলে student/payments/income টেবিলে কিছু লেখে না — বরং
//      registryDb.recordPayment(req.tenant.id, ...) কল করে, যেটা Super-Admin
//      প্যানেলের ম্যানুয়াল payment-entry-ও ব্যবহার করে (subscription_ends_at
//      বাড়ানো + status='active' করার লজিক একটাই জায়গায়, ডুপ্লিকেট হয়নি)।
//
// শুধু multi-tenant মোডে অর্থবহ — req.tenant শুধু তখনই সেট থাকে
// (middleware/tenantResolve.js)। single-tenant deployment-এ req.tenant
// থাকে না, তাই নিচের guard একটা পরিষ্কার 404 দেয়, কখনো ভাঙে না।
// ============================================================================

const express = require("express");
const { requirePermission } = require("../middleware/rbac");
const registryDb = require("../registryDb");
const bkashGateway = require("../lib/bkashGateway");
const platformGatewayCredentials = require("../lib/platformGatewayCredentials");

const router = express.Router();
router.use(requirePermission("settings"));

router.use((req, res, next) => {
  if (!req.tenant) {
    return res.status(404).json({ error: "এই ফিচারটি শুধু মাল্টি-টেন্যান্ট মোডে চালু" });
  }
  next();
});

// বিকাশ থেকে ফিরে আসার পর প্রতিষ্ঠানের admin অ্যাপ কোন পেজ execute কল
// করবে — guardianAuth.js-এর guardianCallbackUrl()-এর same reasoning:
// origin/referer থেকে অনুমান, কোনো নতুন env var লাগে না।
function billingCallbackUrl(req) {
  const origin = (req.get("origin") || req.get("referer") || process.env.CLIENT_ORIGIN || "").replace(/\/+$/, "");
  const base = origin.replace(/\/(settings|billing)(\/.*)?$/, "");
  return `${base}/settings/billing`;
}

router.get("/status", async (req, res, next) => {
  try {
    const institution = await registryDb.getInstitutionById(req.tenant.id);
    const gatewayStatus = await platformGatewayCredentials.getPlatformGatewayStatus();
    res.json({
      plan: institution?.plan || null,
      billingModel: institution?.billing_model || null,
      priceAmount: institution?.price_amount != null ? Number(institution.price_amount) : null,
      status: institution?.status || null,
      subscriptionEndsAt: institution?.subscription_ends_at || null,
      trialEndsAt: institution?.trial_ends_at || null,
      platformGatewayConnected: gatewayStatus.connected,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/bkash/create", async (req, res, next) => {
  try {
    const amount = Number(req.body?.amount);
    const periodDays = Number(req.body?.periodDays) || 30;
    if (!amount || amount <= 0) return res.status(400).json({ error: "সঠিক পরিমাণ দিন" });
    if (!Number.isInteger(periodDays) || periodDays <= 0) {
      return res.status(400).json({ error: "periodDays অবশ্যই একটা পজিটিভ পূর্ণসংখ্যা" });
    }

    const gateway = await platformGatewayCredentials.getConnectedPlatformGateway();
    if (!gateway) return res.status(503).json({ error: "প্ল্যাটফর্মের বিকাশ গেটওয়ে এখনো কানেক্টেড নেই — অপারেটরের সাথে যোগাযোগ করুন" });

    const { rows } = await registryDb.registryPool.query(
      `INSERT INTO registry.platform_payment_intents (institution_id, amount, "periodDays", status)
       VALUES ($1, $2, $3, 'initiated') RETURNING id`,
      [req.tenant.id, amount, periodDays]
    );
    const intentId = rows[0].id;

    const grant = await bkashGateway.grantToken(gateway);
    if (!grant.ok) return res.status(502).json({ error: grant.error });

    const created = await bkashGateway.createPayment({
      idToken: grant.idToken,
      appKey: gateway.appKey,
      amount,
      invoiceId: intentId,
      callbackURL: billingCallbackUrl(req),
    });
    if (!created.ok) return res.status(502).json({ error: created.error });

    await registryDb.registryPool.query(
      `UPDATE registry.platform_payment_intents SET "paymentId" = $1 WHERE id = $2`,
      [created.paymentID, intentId]
    );
    res.json({ bkashURL: created.bkashURL, paymentID: created.paymentID });
  } catch (err) {
    next(err);
  }
});

router.post("/bkash/execute", async (req, res, next) => {
  try {
    const paymentID = String(req.body?.paymentID || "");
    if (!paymentID) return res.status(400).json({ error: "paymentID প্রয়োজন" });

    const { rows } = await registryDb.registryPool.query(
      `SELECT * FROM registry.platform_payment_intents WHERE "paymentId" = $1 AND institution_id = $2`,
      [paymentID, req.tenant.id]
    );
    const intent = rows[0];
    if (!intent) return res.status(404).json({ error: "পেমেন্ট পাওয়া যায়নি" });

    // ইতিমধ্যে finalize হয়ে গেছে (এডমিনের ব্রাউজার callback পেজে রিফ্রেশ
    // দিলে এখানে দ্বিতীয়বার আসতে পারে) — bKash-কে আবার কল না করে, দ্বিতীয়
    // বার credit না করে, একই সফল রেসপন্স ফেরত দেওয়া হয়।
    if (intent.status === "completed") return res.json({ ok: true, alreadyCompleted: true });

    const gateway = await platformGatewayCredentials.getConnectedPlatformGateway();
    if (!gateway) return res.status(503).json({ error: "প্ল্যাটফর্মের বিকাশ গেটওয়ে এখনো কানেক্টেড নেই" });

    const grant = await bkashGateway.grantToken(gateway);
    if (!grant.ok) return res.status(502).json({ error: grant.error });

    const executed = await bkashGateway.executePayment({ idToken: grant.idToken, appKey: gateway.appKey, paymentID });
    if (!executed.ok) {
      await registryDb.registryPool.query(
        `UPDATE registry.platform_payment_intents SET status = 'failed' WHERE id = $1`,
        [intent.id]
      );
      return res.status(402).json({ ok: false, error: executed.error });
    }

    await registryDb.registryPool.query(
      `UPDATE registry.platform_payment_intents SET status = 'completed', "bkashTrxId" = $1, completed_at = now() WHERE id = $2`,
      [executed.trxID, intent.id]
    );

    const payment = await registryDb.recordPayment(req.tenant.id, {
      amount: intent.amount,
      method: "bKash",
      reference: executed.trxID,
      periodDays: intent.periodDays,
      recordedBy: req.user?.email || "institution-self-service",
      note: "প্রতিষ্ঠান নিজে বিকাশে সাবস্ক্রিপশন বিল পরিশোধ করেছে (self-service)",
    });

    await registryDb.logAction(req.tenant.id, req.user?.email || "institution", "subscription_paid_self_service", {
      amount: intent.amount,
      periodDays: intent.periodDays,
      trxID: executed.trxID,
    });

    res.json({ ok: true, subscriptionEndsAt: payment.covers_until });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
