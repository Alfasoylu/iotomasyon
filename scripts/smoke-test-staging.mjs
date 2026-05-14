import pg from "pg";
import { readFileSync } from "fs";

// Load .env.staging
const envFile = readFileSync(".env.staging", "utf8");
const env = Object.fromEntries(
  envFile.split("\n").filter(l => l.includes("=")).map(l => {
    const [k, ...v] = l.split("=");
    return [k.trim(), v.join("=").replace(/^"|"$/g, "").trim()];
  })
);

const client = new pg.Client({ connectionString: env.DIRECT_URL });
await client.connect();

let PASS = 0, FAIL = 0;
const ok   = (label) => { PASS++; console.log("PASS:", label); };
const fail = (label, detail = "") => { FAIL++; console.log("FAIL:", label, detail); };

async function q(sql, params) { return client.query(sql, params); }

// ── PRE-CLEAN (idempotent) ────────────────────────────────────────────────────
await q(`DELETE FROM "CustomerAttributeInterest" WHERE "customerId" IN ('c1','c2')`);
await q(`DELETE FROM "ProductAttributeAssignment" WHERE "productId"='p1'`);
await q(`DELETE FROM "ProductAttribute" WHERE id='a1'`);
await q(`DELETE FROM "OutreachRecipient" WHERE id IN ('r1','r2')`);
await q(`DELETE FROM "OutreachCampaign" WHERE id='camp1'`);
await q(`DELETE FROM "Quote" WHERE id='q1'`);
await q(`DELETE FROM "Product" WHERE id='p1'`);
await q(`DELETE FROM "ProductCategory" WHERE id='cat1'`);
await q(`DELETE FROM "Customer" WHERE id IN ('c1','c2')`);
await q(`DELETE FROM "User" WHERE id='u1'`);

// ── SEED ──────────────────────────────────────────────────────────────────────
await q("BEGIN");
try {
  await q(`INSERT INTO "User"(id,email,"passwordHash",name,role,"isActive","createdAt","updatedAt") VALUES('u1','smoke@test.com','hash','Smoke','ADMIN',true,NOW(),NOW()) ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO "Customer"(id,name,phone,status,"createdAt","updatedAt") VALUES('c1','Cust1','+905001','NEW',NOW(),NOW()) ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO "Customer"(id,name,status,"createdAt","updatedAt") VALUES('c2','Cust2','NEW',NOW(),NOW()) ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO "ProductCategory"(id,name,slug,"createdAt","updatedAt") VALUES('cat1','Cat','smoke-cat',NOW(),NOW()) ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO "Product"(id,name,sku,"stockQuantity","minimumStock","categoryId","createdAt","updatedAt") VALUES('p1','Prod','SKU1',10,1,'cat1',NOW(),NOW()) ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO "Quote"(id,"quoteNumber","customerId",subtotal,"discountTotal","taxTotal",total,status,"createdById","createdAt","updatedAt") VALUES('q1','QT-001','c1',500,0,0,500,'DRAFT','u1',NOW(),NOW()) ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO "OutreachCampaign"(id,message,status,currency,"createdAt","updatedAt") VALUES('camp1','msg','ACTIVE','TRY',NOW(),NOW()) ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO "OutreachRecipient"(id,"campaignId","customerId",phone,status,"createdAt") VALUES('r1','camp1','c1','+9050','PENDING',NOW()) ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO "OutreachRecipient"(id,"campaignId","customerId",phone,status,"createdAt") VALUES('r2','camp1','c2','+9051','PENDING',NOW()) ON CONFLICT DO NOTHING`);
  await q("COMMIT");
} catch (e) { await q("ROLLBACK"); throw e; }

// ── TEST 1: PENDING → SENT ────────────────────────────────────────────────────
await q(`UPDATE "OutreachRecipient" SET status='SENT',"sentAt"=NOW() WHERE id='r1' AND status='PENDING'`);
const t1 = (await q(`SELECT status FROM "OutreachRecipient" WHERE id='r1'`)).rows[0];
t1?.status === "SENT" ? ok("PENDING→SENT") : fail("PENDING→SENT", t1?.status);

// ── TEST 2: SENT → REPLIED ────────────────────────────────────────────────────
await q(`UPDATE "OutreachRecipient" SET status='REPLIED',"repliedAt"=NOW() WHERE id='r1'`);
const t2 = (await q(`SELECT status,"repliedAt" AS repliedat FROM "OutreachRecipient" WHERE id='r1'`)).rows[0];
t2?.status === "REPLIED" ? ok("SENT→REPLIED") : fail("SENT→REPLIED", t2?.status);
t2?.repliedat ? ok("repliedAt populated") : fail("repliedAt populated");

// ── TEST 3: quoteId link ──────────────────────────────────────────────────────
await q(`UPDATE "OutreachRecipient" SET "quoteId"='q1' WHERE id='r1'`);
const t3 = (await q(`SELECT "quoteId" AS quoteid FROM "OutreachRecipient" WHERE id='r1'`)).rows[0];
t3?.quoteid === "q1" ? ok("quoteId link") : fail("quoteId link", t3?.quoteid);

// ── TEST 4: REPLIED → WON ────────────────────────────────────────────────────
await q(`UPDATE "OutreachRecipient" SET status='WON',"wonAmount"=500 WHERE id='r1'`);
const t4 = (await q(`SELECT status,"wonAmount" AS wonamount FROM "OutreachRecipient" WHERE id='r1'`)).rows[0];
t4?.status === "WON" ? ok("REPLIED→WON") : fail("REPLIED→WON", t4?.status);
parseFloat(t4?.wonamount) === 500 ? ok("wonAmount=500") : fail("wonAmount", t4?.wonamount);

// ── TEST 5: Revenue dedup — second recipient links same quote ─────────────────
await q(`UPDATE "OutreachRecipient" SET status='SENT',"sentAt"=NOW() WHERE id='r2'`);
await q(`UPDATE "OutreachRecipient" SET status='REPLIED',"repliedAt"=NOW() WHERE id='r2'`);
await q(`UPDATE "OutreachRecipient" SET "quoteId"='q1',"wonAmount"=500,status='WON' WHERE id='r2'`);
const wonRows = (await q(`SELECT "quoteId" AS quoteid,"wonAmount" AS wonamount FROM "OutreachRecipient" WHERE "campaignId"='camp1' AND status='WON'`)).rows;
let revenue = 0; const seen = new Set();
for (const row of wonRows) {
  if (row.quoteid && !seen.has(row.quoteid)) { seen.add(row.quoteid); revenue += parseFloat(row.wonamount); }
}
wonRows.length === 2 ? ok("two WON recipients same quoteId") : fail("two WON recipients", wonRows.length);
revenue === 500 ? ok("revenue dedup: 500 not 1000") : fail("revenue dedup", `revenue=${revenue}`);

// ── TEST 6: OPENED rejected by enum ──────────────────────────────────────────
try {
  await q(`UPDATE "OutreachRecipient" SET status='OPENED' WHERE id='r1'`);
  fail("OPENED rejected by enum", "no error");
} catch (e) {
  e.message.includes("invalid input value") || e.message.includes("OPENED")
    ? ok("OPENED rejected by DB enum")
    : fail("OPENED rejected by enum", e.message.slice(0, 80));
}

// ── TEST 7: Attribute system ──────────────────────────────────────────────────
await q(`INSERT INTO "ProductAttribute"(id,name,"createdAt") VALUES('a1','inverter',NOW()) ON CONFLICT DO NOTHING`);
await q(`INSERT INTO "ProductAttributeAssignment"("productId","attributeId","createdAt") VALUES('p1','a1',NOW()) ON CONFLICT DO NOTHING`);
await q(`INSERT INTO "CustomerAttributeInterest"("customerId","attributeId","createdAt") VALUES('c1','a1',NOW()) ON CONFLICT DO NOTHING`);
const t7 = (await q(`SELECT pa.name, count(paa."productId") AS products, count(cai."customerId") AS customers FROM "ProductAttribute" pa LEFT JOIN "ProductAttributeAssignment" paa ON paa."attributeId"=pa.id LEFT JOIN "CustomerAttributeInterest" cai ON cai."attributeId"=pa.id WHERE pa.id='a1' GROUP BY pa.name`)).rows[0];
t7?.name === "inverter" ? ok("attribute lowercase stored") : fail("attribute name", t7?.name);
parseInt(t7?.products) === 1 ? ok("product→attribute FK") : fail("product→attribute FK", t7?.products);
parseInt(t7?.customers) === 1 ? ok("customer→attribute FK") : fail("customer→attribute FK", t7?.customers);

// ── TEST 8: Attribute unique constraint ───────────────────────────────────────
try {
  await q(`INSERT INTO "ProductAttributeAssignment"("productId","attributeId","createdAt") VALUES('p1','a1',NOW())`);
  fail("duplicate attribute assignment rejected", "no error");
} catch (e) {
  e.message.includes("unique") || e.message.includes("duplicate")
    ? ok("duplicate attribute assignment rejected")
    : fail("duplicate rejected", e.message.slice(0, 80));
}

// ── CLEANUP ───────────────────────────────────────────────────────────────────
await q(`DELETE FROM "CustomerAttributeInterest" WHERE "customerId" IN ('c1','c2')`);
await q(`DELETE FROM "ProductAttributeAssignment" WHERE "productId"='p1'`);
await q(`DELETE FROM "ProductAttribute" WHERE id='a1'`);
await q(`DELETE FROM "OutreachRecipient" WHERE "campaignId"='camp1'`);
await q(`DELETE FROM "OutreachCampaign" WHERE id='camp1'`);
await q(`DELETE FROM "Quote" WHERE id='q1'`);
await q(`DELETE FROM "Product" WHERE id='p1'`);
await q(`DELETE FROM "ProductCategory" WHERE id='cat1'`);
await q(`DELETE FROM "Customer" WHERE id IN ('c1','c2')`);
await q(`DELETE FROM "User" WHERE id='u1'`);

console.log("");
console.log(`RESULT: ${PASS} passed, ${FAIL} failed`);
await client.end();
if (FAIL > 0) process.exit(1);
