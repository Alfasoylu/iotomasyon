/**
 * One-time cleanup: removes smoke test records created on 2026-05-14.
 *
 * Usage:
 *   $env:DATABASE_URL="postgresql://..."   (PowerShell)
 *   node scripts/cleanup-smoke-test.mjs
 *
 * Cascade deletes handle: quotes, quote items, notes, product interests, tasks.
 */

import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("ERROR: DATABASE_URL env var is required.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  // Find smoke test customer
  const { rows: customers } = await client.query(
    `SELECT id, name FROM "Customer" WHERE name = $1`,
    ["Smoke Test 2026-05-14 04:19"],
  );

  if (customers.length === 0) {
    console.log("Customer 'Smoke Test 2026-05-14 04:19' not found — already cleaned up.");
  } else {
    const customerId = customers[0].id;
    console.log(`Found customer: ${customers[0].name} (${customerId})`);

    // Count related records before deletion (informational)
    const [{ rows: qi }, { rows: q }, { rows: n }, { rows: pi }, { rows: t }] =
      await Promise.all([
        client.query(`SELECT COUNT(*) FROM "QuoteItem" qi JOIN "Quote" qu ON qi."quoteId" = qu.id WHERE qu."customerId" = $1`, [customerId]),
        client.query(`SELECT COUNT(*) FROM "Quote" WHERE "customerId" = $1`, [customerId]),
        client.query(`SELECT COUNT(*) FROM "Note" WHERE "customerId" = $1`, [customerId]),
        client.query(`SELECT COUNT(*) FROM "ProductInterest" WHERE "customerId" = $1`, [customerId]),
        client.query(`SELECT COUNT(*) FROM "FollowUpTask" WHERE "customerId" = $1`, [customerId]),
      ]);

    console.log(`  Quotes: ${q[0].count}`);
    console.log(`  Quote items: ${qi[0].count}`);
    console.log(`  Notes: ${n[0].count}`);
    console.log(`  Product interests: ${pi[0].count}`);
    console.log(`  Tasks: ${t[0].count}`);

    // Single delete — cascades to all related rows via FK onDelete: Cascade
    await client.query(`DELETE FROM "Customer" WHERE id = $1`, [customerId]);
    console.log("Customer and all related records deleted.");
  }

  // Verify quote QT-2026-0001 is gone (should be cascaded above, but double-check)
  const { rows: quotes } = await client.query(
    `SELECT id, "quoteNumber" FROM "Quote" WHERE "quoteNumber" = $1`,
    ["QT-2026-0001"],
  );

  if (quotes.length === 0) {
    console.log("Quote QT-2026-0001: confirmed gone.");
  } else {
    // Customer may have had a different name — delete directly
    await client.query(`DELETE FROM "Quote" WHERE "quoteNumber" = $1`, ["QT-2026-0001"]);
    console.log("Quote QT-2026-0001 deleted directly.");
  }

  // Summary counts after cleanup
  const { rows: [totals] } = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM "Customer") AS customers,
      (SELECT COUNT(*) FROM "Quote") AS quotes,
      (SELECT COUNT(*) FROM "FollowUpTask" WHERE status = 'OPEN') AS open_tasks
  `);
  console.log("\nPost-cleanup totals:");
  console.log(`  Customers: ${totals.customers}`);
  console.log(`  Quotes: ${totals.quotes}`);
  console.log(`  Open tasks: ${totals.open_tasks}`);
} finally {
  await client.end();
}
