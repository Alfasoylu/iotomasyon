/**
 * Faz 91 — Trendyol finans dosyalarını veritabanına yazar.
 *
 * Tasarım kuralları:
 *   • **Idempotent.** Her kayıt doğal anahtarıyla yazılır (fatura no / kayıt no /
 *     sourceRef+rowHash). Aynı dosya iki kez yüklenirse satır çoğalmaz.
 *   • **Yıkıcı değil.** PDF'ten gelen KDV kırılımı liste yüklemesiyle silinmez;
 *     liste yüklemesi de PDF alanlarına dokunmaz.
 *   • **Her yükleme günlüğe yazılır** (TrendyolFinanceImport) — başarısızlar dahil.
 */

import { Prisma, TrendyolInvoiceLineKind, TrendyolCostGroup } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { resolveCostGroup } from "./cost-groups";
import {
  parseFile,
  extractSourceRef,
  UnsupportedFileError,
  FILE_KIND_LABEL,
  type TrendyolFileKind,
  type LineFileKind,
  type ParsedLine,
} from "./parse";

export type ImportOutcome = {
  fileName: string;
  ok: boolean;
  kind: TrendyolFileKind | null;
  kindLabel: string | null;
  rowsTotal: number;
  rowsNew: number;
  rowsUpdated: number;
  rowsSkipped: number;
  amountTotalTry: number | null;
  /** Detay dosyası bir fatura başlığına bağlandıysa o faturanın numarası. */
  linkedInvoiceNo: string | null;
  message: string;
};

/** Yazıcıların döndürdüğü, günlüğe geçen ama API yanıtında gerekmeyen alanlar. */
type ImportOutcomeInternal = ImportOutcome & {
  periodStart?: Date | null;
  periodEnd?: Date | null;
};

/** Detay dosyası türü → o türden beklenen gider grubu (eşleştirmede tercih edilir). */
const KIND_TO_LINE: Record<LineFileKind, TrendyolInvoiceLineKind> = {
  LINE_CARGO: TrendyolInvoiceLineKind.KARGO,
  LINE_SERVICE_FEE: TrendyolInvoiceLineKind.ISLEM_BEDELI,
  LINE_DEDUCTION: TrendyolInvoiceLineKind.KESINTI,
  LINE_PENALTY: TrendyolInvoiceLineKind.CEZA,
  LINE_MICRO_EXPORT: TrendyolInvoiceLineKind.MIKRO_IHRACAT,
  LINE_RETURN_FEE: TrendyolInvoiceLineKind.IADE_BEDELI,
};

const KIND_TO_GROUP: Record<LineFileKind, TrendyolCostGroup> = {
  LINE_CARGO: TrendyolCostGroup.KARGO,
  LINE_SERVICE_FEE: TrendyolCostGroup.HIZMET,
  LINE_DEDUCTION: TrendyolCostGroup.KARGO,
  LINE_PENALTY: TrendyolCostGroup.CEZA,
  LINE_MICRO_EXPORT: TrendyolCostGroup.HIZMET,
  LINE_RETURN_FEE: TrendyolCostGroup.HIZMET,
};

const dec = (n: number | null | undefined) =>
  n == null ? null : new Prisma.Decimal(n.toFixed(4));

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Bir dosyayı ayrıştırıp veritabanına yazar ve yükleme günlüğüne kaydeder.
 * Hata durumunda da günlük yazılır; istisna fırlatmaz.
 */
export async function importTrendyolFinanceFile(
  fileName: string,
  buf: Buffer,
  importedByEmail: string | null,
): Promise<ImportOutcome> {
  const base: ImportOutcomeInternal = {
    fileName,
    ok: false,
    kind: null,
    kindLabel: null,
    rowsTotal: 0,
    rowsNew: 0,
    rowsUpdated: 0,
    rowsSkipped: 0,
    amountTotalTry: null,
    linkedInvoiceNo: null,
    message: "",
  };

  let result: ImportOutcomeInternal;

  try {
    const parsed = parseFile(fileName, buf);
    const sourceRef = extractSourceRef(fileName);

    if (parsed.kind === "INVOICE_LIST") {
      result = { ...base, ...(await writeInvoiceList(parsed.invoices, fileName)), kind: parsed.kind };
      result.rowsSkipped += parsed.skipped;
    } else if (parsed.kind === "INVOICE_PDF") {
      result = { ...base, ...(await writePdfInvoice(parsed.pdf, fileName)), kind: parsed.kind };
    } else if (parsed.kind === "SETTLEMENT") {
      result = {
        ...base,
        ...(await writeSettlements(parsed.settlements, sourceRef, fileName)),
        kind: parsed.kind,
      };
      result.rowsSkipped += parsed.skipped;
    } else {
      result = {
        ...base,
        ...(await writeLines(parsed.lines, parsed.kind, sourceRef, fileName)),
        kind: parsed.kind,
      };
      result.rowsSkipped += parsed.skipped;
    }

    result.ok = true;
    result.kindLabel = result.kind ? FILE_KIND_LABEL[result.kind] : null;
  } catch (e) {
    result = {
      ...base,
      ok: false,
      message:
        e instanceof UnsupportedFileError
          ? e.message
          : `Dosya işlenemedi: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  await prisma.trendyolFinanceImport.create({
    data: {
      fileName,
      fileKind: result.kind ?? "UNKNOWN",
      fileSize: buf.byteLength,
      rowsTotal: result.rowsTotal,
      rowsNew: result.rowsNew,
      rowsUpdated: result.rowsUpdated,
      rowsSkipped: result.rowsSkipped,
      amountTotalTry: dec(result.amountTotalTry),
      periodStart: result.periodStart ?? null,
      periodEnd: result.periodEnd ?? null,
      ok: result.ok,
      error: result.ok ? null : result.message,
      importedByEmail,
    },
  });

  return result;
}

// ── Fatura listesi ──────────────────────────────────────────────────────────

type Partials = Partial<ImportOutcomeInternal>;

async function writeInvoiceList(
  invoices: Array<{
    invoiceNo: string;
    invoiceDate: Date;
    invoiceType: string;
    category: string | null;
    country: string | null;
    status: string | null;
    amountTry: number;
  }>,
  fileName: string,
): Promise<Partials> {
  if (invoices.length === 0) {
    return { rowsTotal: 0, message: "Listede işlenebilir fatura satırı yok." };
  }

  const existing = new Set(
    (
      await prisma.trendyolInvoice.findMany({
        where: { invoiceNo: { in: invoices.map((i) => i.invoiceNo) } },
        select: { invoiceNo: true },
      })
    ).map((r) => r.invoiceNo),
  );

  let created = 0;
  let updated = 0;

  // Satır başına upsert bir transaction'a sığmıyor (2.700+ satır, pooler
  // üzerinden 5 sn'lik interaktif transaction sınırı aşılıyor). Bunun yerine
  // chunk başına tek `INSERT … ON CONFLICT DO UPDATE` gönderilir.
  //
  // id'ler burada üretiliyor çünkü raw SQL Prisma'nın @default(cuid())
  // varsayılanını çalıştırmaz; kolon TEXT olduğu için uuid sorun değil.
  const CHUNK = 400;
  for (let i = 0; i < invoices.length; i += CHUNK) {
    const rows = invoices.slice(i, i + CHUNK).map((inv) => {
      const costGroup = resolveCostGroup(inv.invoiceType, inv.amountTry);
      const expense = inv.amountTry < 0 ? -inv.amountTry : 0;

      return Prisma.sql`(
        ${randomUUID()}, ${inv.invoiceNo}, ${inv.invoiceDate},
        ${inv.invoiceType}, ${inv.category}, ${inv.country}, ${inv.status},
        CAST(${costGroup} AS "TrendyolCostGroup"),
        ${inv.amountTry}, ${expense}, ${fileName}, NOW(), NOW()
      )`;
    });

    // PDF'ten gelen alanlara (netTry/vatTry/grossTry/ettn/description) dokunulmaz.
    await prisma.$executeRaw`
      INSERT INTO "trendyol_invoice" (
        "id", "invoiceNo", "invoiceDate", "invoiceType", "category", "country",
        "status", "costGroup", "amountTry", "expenseTry", "firstSeenFile",
        "createdAt", "updatedAt"
      )
      VALUES ${Prisma.join(rows)}
      ON CONFLICT ("invoiceNo") DO UPDATE SET
        "invoiceDate" = EXCLUDED."invoiceDate",
        "invoiceType" = EXCLUDED."invoiceType",
        "category"    = EXCLUDED."category",
        "country"     = EXCLUDED."country",
        "status"      = EXCLUDED."status",
        "costGroup"   = EXCLUDED."costGroup",
        "amountTry"   = EXCLUDED."amountTry",
        "expenseTry"  = EXCLUDED."expenseTry",
        "updatedAt"   = NOW()
    `;
  }

  for (const inv of invoices) {
    if (existing.has(inv.invoiceNo)) updated++;
    else created++;
  }

  const dates = invoices.map((i) => i.invoiceDate.getTime());
  const net = invoices.reduce((s, i) => s + i.amountTry, 0);

  return {
    rowsTotal: invoices.length,
    rowsNew: created,
    rowsUpdated: updated,
    amountTotalTry: round2(net),
    periodStart: new Date(Math.min(...dates)),
    periodEnd: new Date(Math.max(...dates)),
    message: `${created} yeni fatura, ${updated} güncellendi.`,
  };
}

// ── Tekil e-fatura PDF ──────────────────────────────────────────────────────

async function writePdfInvoice(
  pdf: {
    invoiceNo: string;
    invoiceDate: Date | null;
    netTry: number | null;
    vatTry: number | null;
    grossTry: number | null;
    vatRatePct: number | null;
    ettn: string | null;
    description: string | null;
    itemName: string | null;
  },
  fileName: string,
): Promise<Partials> {
  const existing = await prisma.trendyolInvoice.findUnique({
    where: { invoiceNo: pdf.invoiceNo },
    select: { id: true, invoiceType: true },
  });

  const pdfFields = {
    netTry: dec(pdf.netTry),
    vatTry: dec(pdf.vatTry),
    grossTry: dec(pdf.grossTry),
    vatRatePct: dec(pdf.vatRatePct),
    ettn: pdf.ettn,
    description: pdf.description,
    pdfParsed: true,
  };

  if (existing) {
    await prisma.trendyolInvoice.update({ where: { id: existing.id }, data: pdfFields });
    return {
      rowsTotal: 1,
      rowsUpdated: 1,
      amountTotalTry: pdf.grossTry ?? null,
      message: `${pdf.invoiceNo} — KDV kırılımı eklendi (net ${pdf.netTry ?? "?"} + KDV ${pdf.vatTry ?? "?"}).`,
      periodStart: pdf.invoiceDate,
      periodEnd: pdf.invoiceDate,
    };
  }

  // Liste henüz yüklenmemiş: PDF'ten yeni başlık üret.
  // İşaret kuralı — SYL* faturaları bizim lehimize (tedarikçi faturası),
  // DDF/DCF/AZC* kesinti. Liste yüklenince tutar/tip zaten üstüne yazılır.
  const gross = pdf.grossTry ?? 0;
  const inFavour = /^SYL/i.test(pdf.invoiceNo);
  const amount = inFavour ? gross : -gross;
  const invoiceType = pdf.itemName ?? "PDF'ten okundu";

  await prisma.trendyolInvoice.create({
    data: {
      invoiceNo: pdf.invoiceNo,
      invoiceDate: pdf.invoiceDate ?? new Date(),
      invoiceType,
      category: null,
      costGroup: resolveCostGroup(invoiceType, amount),
      amountTry: dec(amount)!,
      expenseTry: dec(inFavour ? 0 : gross)!,
      firstSeenFile: fileName,
      ...pdfFields,
    },
  });

  return {
    rowsTotal: 1,
    rowsNew: 1,
    amountTotalTry: pdf.grossTry ?? null,
    message: `${pdf.invoiceNo} — yeni fatura (fatura listesi yüklenince tip/kategori tamamlanır).`,
    periodStart: pdf.invoiceDate,
    periodEnd: pdf.invoiceDate,
  };
}

// ── Hakediş satırları ───────────────────────────────────────────────────────

async function writeSettlements(
  rows: Array<{
    recordNo: string;
    transactionType: string;
    orderNumber: string;
    orderDate: Date | null;
    transactionDate: Date | null;
    country: string | null;
    productName: string | null;
    barcode: string | null;
    commissionPct: number | null;
    trendyolShareTry: number | null;
    sellerShareTry: number | null;
    totalTry: number | null;
    termDays: number | null;
    deliveryDate: Date | null;
    dueDate: Date | null;
  }>,
  settlementRef: string,
  fileName: string,
): Promise<Partials> {
  if (rows.length === 0) return { rowsTotal: 0, message: "Hakediş satırı bulunamadı." };

  const created = await prisma.trendyolSettlementLine.createMany({
    data: rows.map((r) => ({
      recordNo: r.recordNo,
      settlementRef,
      transactionType: r.transactionType,
      orderNumber: r.orderNumber,
      orderDate: r.orderDate,
      transactionDate: r.transactionDate,
      country: r.country,
      productName: r.productName,
      barcode: r.barcode,
      commissionPct: dec(r.commissionPct),
      trendyolShareTry: dec(r.trendyolShareTry),
      sellerShareTry: dec(r.sellerShareTry),
      totalTry: dec(r.totalTry),
      termDays: r.termDays,
      deliveryDate: r.deliveryDate,
      dueDate: r.dueDate,
      sourceFile: fileName,
    })),
    skipDuplicates: true,
  });

  const dates = rows.map((r) => r.transactionDate ?? r.orderDate).filter((d): d is Date => !!d);
  const commission = rows.reduce((s, r) => s + (r.trendyolShareTry ?? 0), 0);
  const seller = rows.reduce((s, r) => s + (r.sellerShareTry ?? 0), 0);

  return {
    rowsTotal: rows.length,
    rowsNew: created.count,
    rowsSkipped: rows.length - created.count,
    amountTotalTry: round2(seller),
    periodStart: dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null,
    periodEnd: dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null,
    message:
      `${created.count} yeni hakediş satırı ` +
      `(satıcı hakediş ${round2(seller).toLocaleString("tr-TR")} ₺, komisyon ${round2(commission).toLocaleString("tr-TR")} ₺).`,
  };
}

// ── Kesinti / detay satırları ───────────────────────────────────────────────

async function writeLines(
  lines: ParsedLine[],
  fileKind: LineFileKind,
  sourceRef: string,
  fileName: string,
): Promise<Partials> {
  if (lines.length === 0) return { rowsTotal: 0, message: "Detay satırı bulunamadı." };

  const lineKind = KIND_TO_LINE[fileKind];

  const created = await prisma.trendyolInvoiceLine.createMany({
    data: lines.map((l) => ({
      lineKind,
      sourceRef,
      rowHash: l.rowHash,
      orderNumber: l.orderNumber,
      shipmentType: l.shipmentType,
      shipmentCode: l.shipmentCode,
      cargoCompany: l.cargoCompany,
      orderDate: l.orderDate,
      shipDate: l.shipDate,
      amountTry: dec(l.amountTry)!,
      orderAmountTry: dec(l.orderAmountTry),
      desi: dec(l.desi),
      quantity: l.quantity,
      description: l.description,
      sourceFile: fileName,
    })),
    skipDuplicates: true,
  });

  const linked = await linkLinesToInvoice(sourceRef, fileKind);

  const total = lines.reduce((s, l) => s + l.amountTry, 0);
  const dates = lines.map((l) => l.orderDate).filter((d): d is Date => !!d);

  return {
    rowsTotal: lines.length,
    rowsNew: created.count,
    rowsSkipped: lines.length - created.count,
    amountTotalTry: round2(total),
    linkedInvoiceNo: linked,
    periodStart: dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null,
    periodEnd: dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null,
    message:
      `${created.count} yeni detay satırı, toplam ${round2(total).toLocaleString("tr-TR")} ₺` +
      (linked ? ` — ${linked} numaralı faturaya bağlandı.` : " — eşleşen fatura başlığı bulunamadı."),
  };
}

/**
 * Detay dosyasını fatura başlığına bağlar.
 *
 * Detay dosyalarında fatura numarası **yok**; ama detay satırlarının toplamı
 * ilgili faturanın tutarına kuruşu kuruşuna eşit (elimizdeki 20 dosyada
 * doğrulandı: kargo 22.014,30 ₺ → DDF2026020280150, işlem bedeli 2.497,51 ₺ →
 * DDF2026020368912 …). Eşleştirme bu toplam üzerinden yapılır.
 *
 * Birden fazla aday çıkarsa beklenen gider grubundaki ve henüz bağlanmamış
 * olan tercih edilir; hâlâ birden fazlaysa bağlantı kurulmaz (yanlış bağlamak,
 * bağlamamaktan kötüdür).
 */
async function linkLinesToInvoice(
  sourceRef: string,
  fileKind: LineFileKind,
): Promise<string | null> {
  const agg = await prisma.trendyolInvoiceLine.aggregate({
    where: { sourceRef },
    _sum: { amountTry: true },
  });
  const total = agg._sum.amountTry;
  if (!total) return null;

  const candidates = await prisma.trendyolInvoice.findMany({
    where: { expenseTry: total },
    select: { id: true, invoiceNo: true, costGroup: true, sourceRef: true },
  });
  if (candidates.length === 0) return null;

  const already = candidates.find((c) => c.sourceRef === sourceRef);
  const pool = already
    ? [already]
    : (() => {
        const free = candidates.filter((c) => c.sourceRef == null);
        const preferred = free.filter((c) => c.costGroup === KIND_TO_GROUP[fileKind]);
        return preferred.length ? preferred : free;
      })();

  if (pool.length !== 1) return null;
  const target = pool[0];

  await prisma.$transaction([
    prisma.trendyolInvoice.update({ where: { id: target.id }, data: { sourceRef } }),
    prisma.trendyolInvoiceLine.updateMany({
      where: { sourceRef },
      data: { invoiceId: target.id },
    }),
  ]);

  return target.invoiceNo;
}
