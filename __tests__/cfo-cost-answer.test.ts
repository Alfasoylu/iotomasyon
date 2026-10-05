/**
 * MALIYET_YOK cevabından Product.unitCostTry otomatik yazımı — GERÇEK Postgres/Prisma.
 *
 * PGlite kullanılmıyor: applyCostAnswer gerçek Prisma.TransactionClient (tx.product,
 * tx.cfoNote, tx.cfoChangeLog, tx.cfoQuestion) kullanıyor, PGlite bu API'yi sağlamaz.
 * Bu yüzden __tests__/cfo-workflow-postgres.test.ts'teki AYNI izole localhost
 * senkron veritabanı deseni kullanılıyor.
 *
 * Çalıştır: CFO_WORKFLOW_TEST_DATABASE_URL=postgresql://...@127.0.0.1:5432/cfo_workflow_test_xxx
 *   node --import tsx __tests__/cfo-cost-answer.test.ts
 */
import assert from "node:assert/strict";
import { parseTryCostAnswer, applyCostAnswer } from "../lib/cfo-agent/cost-answer";

let failed = 0;
function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`  OK   ${name}`))
    .catch((e) => {
      failed++;
      console.error(`  FAIL ${name}\n         ${e instanceof Error ? e.stack ?? e.message : e}`);
    });
}

async function main() {
  console.log("\nMaliyet cevabı → Product.unitCostTry testleri\n");

  /* ── saf fonksiyon: ağ/DB gerektirmez ─────────────────────────────────── */

  await check("tek TL rakamı okunur ('450 TL')", () => {
    assert.equal(parseTryCostAnswer("450 TL"), 450);
  });

  await check("Türkçe biçim okunur ('1.250,50 TRY')", () => {
    assert.equal(parseTryCostAnswer("1.250,50 TRY"), 1250.5);
  });

  await check("₺ sembolü önde/arkada okunur", () => {
    assert.equal(parseTryCostAnswer("₺320"), 320);
    assert.equal(parseTryCostAnswer("320₺"), 320);
  });

  await check("aynı rakam iki kez TL ile geçerse hâlâ tek değer sayılır", () => {
    assert.equal(parseTryCostAnswer("450 TL, yani 450 TRY ediyor"), 450);
  });

  await check("başka para birimi geçen cevap null döner (RMB/kg ithalat maliyeti karıştırılmaz)", () => {
    assert.equal(parseTryCostAnswer("320 RMB/kg, gümrükten sonra hesaplanacak"), null);
    assert.equal(parseTryCostAnswer("45 USD, kur güncel değil"), null);
    assert.equal(parseTryCostAnswer("$45"), null);
  });

  await check("birden fazla FARKLI TL rakamı geçen cevap null döner (belirsiz)", () => {
    assert.equal(parseTryCostAnswer("400 TL ile 450 TL arasında değişiyor"), null);
  });

  await check("TL etiketsiz salt rakam null döner (para birimi varsayılmaz)", () => {
    assert.equal(parseTryCostAnswer("450"), null);
  });

  await check("boş/anlamsız cevap null döner", () => {
    assert.equal(parseTryCostAnswer("bilmiyorum, faturaya bakacağım"), null);
    assert.equal(parseTryCostAnswer(""), null);
  });

  await check("MALIYET_YOK olmayan soru kodunda hiçbir şeye dokunmadan false döner", async () => {
    const r = await applyCostAnswer(
      {} as never,
      { id: "q1", entityKey: "GELECEK|SKU-1", code: "TEDARIK" },
      "450 TL",
      { email: "a@b.com", name: null }
    );
    assert.equal(r.applied, false);
    assert.equal(r.reason, "not_cost_question");
  });

  /* ── gerçek Postgres/Prisma ────────────────────────────────────────────── */

  const raw = process.env.CFO_WORKFLOW_TEST_DATABASE_URL;
  if (!raw) {
    console.log(
      "\n  ATLANDI: CFO_WORKFLOW_TEST_DATABASE_URL tanımsız — gerçek Postgres testleri çalıştırılamadı.\n" +
        "  (Yalnız saf fonksiyon testleri çalıştı; applyCostAnswer'ın DB yazması doğrulanamadı.)\n"
    );
  } else {
    // Yalnız izole localhost sentetik veritabanı kabul edilir — bkz. cfo-workflow-postgres.test.ts.
    const url = new URL(raw);
    assert(
      ["127.0.0.1", "localhost"].includes(url.hostname) && /^\/cfo_workflow_test_[a-z]+$/.test(url.pathname),
      "CFO_WORKFLOW_TEST_DATABASE_URL izole bir localhost sentetik veritabanı olmalı"
    );
    process.env.DATABASE_URL = raw;
    process.env.DIRECT_URL = raw;

    const { prisma } = await import("../lib/prisma");
    try {
      await prisma.$executeRawUnsafe(
        `alter table cfo_question add column if not exists scope text, add column if not exists entity_key text, add column if not exists code text`
      );

      const sku = `SYNTH-COST-${Date.now()}`;
      const product = await prisma.product.create({
        data: { sku, name: "Synthetic cost fixture", isActive: true },
      });
      const question = await prisma.cfoQuestion.create({
        data: { question: `${sku} birim maliyeti nedir?`, area: "marj", status: "ACIK" },
      });
      await prisma.$executeRawUnsafe(
        `update cfo_question set scope='ITHALAT_SATIRI', entity_key=$2, code='MALIYET_YOK' where id=$1`,
        question.id,
        `GELECEK|${sku}`
      );

      await check("net TL cevabı Product.unitCostTry'a yazılır + değişiklik loglanır + not düşülür", async () => {
        const result = await prisma.$transaction((tx) =>
          applyCostAnswer(tx, { id: question.id, entityKey: `GELECEK|${sku}`, code: "MALIYET_YOK" }, "450 TL", {
            email: "test@example.com",
            name: null,
          })
        );
        assert.equal(result.applied, true);
        assert.equal(result.sku, sku);
        assert.equal(result.amountTry, 450);

        const updated = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
        assert.equal(Number(updated.unitCostTry), 450);

        const log = await prisma.cfoChangeLog.findFirst({ where: { item: `${sku}: birim maliyet` } });
        assert(log, "cfo_change_log kaydı oluşmalı");
        assert.equal(log!.area, "maliyet");
        assert.equal(log!.kind, "aksiyon");

        const note = await prisma.cfoNote.findFirst({ where: { sourceQuestionId: question.id } });
        assert(note, "cfo_note kaydı oluşmalı");
        assert.equal(note!.category, "marj");
        assert.equal(note!.dataTag, "KESIN");

        const q = await prisma.cfoQuestion.findUniqueOrThrow({ where: { id: question.id } });
        assert(q.processedAt != null, "soru otomatik işlenmiş sayılmalı");
        assert(q.processNote?.includes("450"));
      });

      await check("maliyet ZATEN DOLUYSA ikinci cevap üzerine yazmaz (mevcut doğru kaydı bozmaz)", async () => {
        const result = await prisma.$transaction((tx) =>
          applyCostAnswer(tx, { id: question.id, entityKey: `GELECEK|${sku}`, code: "MALIYET_YOK" }, "999 TL", {
            email: "test@example.com",
            name: null,
          })
        );
        assert.equal(result.applied, false);
        assert.equal(result.reason, "cost_already_recorded");
        const updated = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
        assert.equal(Number(updated.unitCostTry), 450, "ilk yazılan değer korunmalı");
      });

      const sku2 = `SYNTH-COST-AMBIGUOUS-${Date.now()}`;
      const product2 = await prisma.product.create({ data: { sku: sku2, name: "Synthetic cost fixture 2", isActive: true } });
      const question2 = await prisma.cfoQuestion.create({
        data: { question: `${sku2} birim maliyeti nedir?`, area: "marj", status: "ACIK" },
      });

      await check("RMB/kg geçen cevapta hiçbir şey yazılmaz (ithalat maliyetlendirmesiyle karışmaz)", async () => {
        const result = await prisma.$transaction((tx) =>
          applyCostAnswer(
            tx,
            { id: question2.id, entityKey: `GELECEK|${sku2}`, code: "MALIYET_YOK" },
            "320 RMB/kg, gümrük sonrası hesaplanacak",
            { email: "test@example.com", name: null }
          )
        );
        assert.equal(result.applied, false);
        assert.equal(result.reason, "amount_not_unambiguous_try");
        const unchanged = await prisma.product.findUniqueOrThrow({ where: { id: product2.id } });
        assert.equal(unchanged.unitCostTry, null);
        const q2 = await prisma.cfoQuestion.findUniqueOrThrow({ where: { id: question2.id } });
        assert.equal(q2.processedAt, null, "belirsiz cevap insan incelemesine açık kalmalı");
      });

      await check("SKU hiçbir ürüne eşleşmezse çökmeden false döner", async () => {
        const result = await prisma.$transaction((tx) =>
          applyCostAnswer(
            tx,
            { id: question2.id, entityKey: "GELECEK|OLMAYAN-SKU-XYZ", code: "MALIYET_YOK" },
            "450 TL",
            { email: "test@example.com", name: null }
          )
        );
        assert.equal(result.applied, false);
        assert.equal(result.reason, "sku_not_found_or_ambiguous");
      });

      await prisma.cfoNote.deleteMany({ where: { sourceQuestionId: { in: [question.id, question2.id] } } });
      await prisma.cfoChangeLog.deleteMany({ where: { item: { in: [`${sku}: birim maliyet`, `${sku2}: birim maliyet`] } } });
      await prisma.cfoQuestion.deleteMany({ where: { id: { in: [question.id, question2.id] } } });
      await prisma.product.deleteMany({ where: { id: { in: [product.id, product2.id] } } });
    } finally {
      await prisma.$disconnect();
    }
  }

  console.log(`\n${failed === 0 ? "Tüm testler geçti." : `${failed} test BAŞARISIZ.`}\n`);
  if (failed > 0) process.exitCode = 1;
}

main();
