/**
 * Faz 91 — Trendyol finans dosyası yükleme
 *
 * POST /api/marketplace/trendyol-finance/import
 * Content-Type: multipart/form-data  (alan: "files", çoklu)
 *
 * Trendyol partner panelindeki Finans → Faturalar ekranından indirilen
 * dosyaları kabul eder: fatura listesi (.xlsx), kesinti/kargo/ceza detayları
 * (.xlsx), hakediş dosyaları (.xlsx) ve tekil e-faturalar (.pdf).
 * Tür otomatik tanınır — kullanıcı seçim yapmaz.
 *
 * Dosyalar tek tek işlenir: biri tanınmazsa diğerleri yine yazılır ve yanıtta
 * her dosya için ayrı sonuç döner.
 *
 * Yanıt: { results: ImportOutcome[]; ok: number; failed: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { importTrendyolFinanceFile, type ImportOutcome } from "@/lib/trendyol-finance/import";
import { userFacingMessage } from "@/lib/safe-error-message";

export const dynamic = "force-dynamic";
// Fatura listesi 2.700+ satır olabiliyor; upsert döngüsü varsayılan süreyi aşabilir.
export const maxDuration = 300;

/** Tek dosya üst sınırı — gördüğümüz en büyük dosya (2.700 satır) ~120 KB. */
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_FILES = 40;

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXECUTIVE_READ))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Form verisi okunamadı." }, { status: 400 });
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "Dosya bulunamadı (alan adı: files)." }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Tek seferde en fazla ${MAX_FILES} dosya yükleyebilirsiniz.` },
      { status: 400 },
    );
  }

  const results: ImportOutcome[] = [];

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      results.push(emptyOutcome(file.name, "Dosya 15 MB sınırını aşıyor."));
      continue;
    }
    if (!/\.(xlsx|xls|pdf)$/i.test(file.name)) {
      results.push(emptyOutcome(file.name, "Yalnız .xlsx ve .pdf dosyaları kabul edilir."));
      continue;
    }

    try {
      const buf = Buffer.from(await file.arrayBuffer());
      results.push(await importTrendyolFinanceFile(file.name, buf, user.email ?? null));
    } catch (e) {
      // importTrendyolFinanceFile kendi hatalarını yutar; buraya yalnız
      // okuma/DB seviyesindeki beklenmedik hatalar düşer. Teknik detay
      // istemciye sızdırılmaz — sunucu loguna yazılır.
      results.push(
        emptyOutcome(
          file.name,
          userFacingMessage(e, "Beklenmeyen bir hata oluştu; dosya işlenemedi.", "trendyol-finance/import"),
        ),
      );
    }
  }

  return NextResponse.json({
    results,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  });
}

function emptyOutcome(fileName: string, message: string): ImportOutcome {
  return {
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
    message,
  };
}
