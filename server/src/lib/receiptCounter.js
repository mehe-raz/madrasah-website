const COUNTER_KEYS = {
  payments: "payment_receipt",
  income: "income_receipt",
};


async function seedCounter(tx, key, table) {
  const row = await tx.get(
    `SELECT COALESCE(MAX(extractSuffix), 0)::bigint AS max_suffix
     FROM (
       SELECT COALESCE((regexp_match(receipt, '([0-9]+)$'))[1]::bigint, 0) AS extractSuffix
       FROM ${table}
     ) existing`
  );
  const maxSuffix = Number(row?.max_suffix || 0);

  await tx.run(
    `INSERT INTO receipt_counters ("key", value)
     VALUES ($1, $2)
     ON CONFLICT ("key") DO UPDATE
       SET value = GREATEST(receipt_counters.value, EXCLUDED.value)`,
    [key, maxSuffix]
  );
}

async function nextReceipt(tx, { table, key, prefix, pad }) {
  if (!COUNTER_KEYS[table]) {
    throw new Error(`Unsupported receipt table: ${table}`);
  }

  await seedCounter(tx, key, table);
  const row = await tx.get(
    `UPDATE receipt_counters
     SET value = value + 1
     WHERE "key" = $1
     RETURNING value`,
    [key]
  );

  const nextValue = Number(row?.value || 0);
  if (!nextValue) throw new Error("Failed to allocate receipt number");
  return `${prefix}${String(nextValue).padStart(pad, "0")}`;
}

module.exports = {
  nextReceipt,
};
