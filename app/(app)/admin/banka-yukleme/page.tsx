/**
 * Banka hesap hareketleri yükleme — dosya → önizleme → onay → yaz.
 *
 * Entegra yükleme ekranıyla AYNI desen (`/admin/entegra-yukleme`). Yazma
 * `cfo_banka_hareket`'e yalnız INSERT ile sınırlı (+ BankaImportLog).
 * `cfo_bank_account.balanceTry` bu ekrandan hiç değişmez — yalnız
 * karşılaştırma için okunur.
 */
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { numOrNull } from "@/lib/cfo/engine";
import { Card } from "@/components/ui/card";
import { BankaUpload } from "@/components/banka/banka-upload";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function dt(d: Date | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(d));
}

function gun(d: Date | null) {
  return d ? new Date(d).toISOString().slice(0, 10) : "—";
}

export default async function BankaYuklemePage() {
  await requirePermission(PERMISSIONS.CFO_WRITE);

  const [bankalarHam, loglar] = await Promise.all([
    prisma.cfoBankAccount.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { name: true, balanceTry: true },
    }),
    prisma.bankaImportLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  const bankalar = bankalarHam.map((b) => ({ name: b.name, balanceTry: numOrNull(b.balanceTry) }));

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">CFO</p>
        <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
          Banka Hareketleri
        </h1>
        <p className="mt-1 text-sm leading-7 text-[var(--text-secondary)]">
          Banka ekstresini (.xlsx/.xls/.csv) <code>cfo_banka_hareket</code>&apos;e yazar. Akış her zaman{" "}
          <strong>yükle → önizleme → onayla</strong>; onay verilmeden tek satır yazılmaz. Aynı dosya iki kez
          yüklenirse mükerrer kayıt oluşmaz.
        </p>
      </div>

      {bankalar.length === 0 ? (
        <Card className="border-[var(--warn-border)] bg-[var(--warn-dim)] p-6 text-sm text-[var(--warn)]">
          Aktif banka hesabı yok (<code>cfo_bank_account</code>). Önce CFO panelinden en az bir banka hesabı
          ekleyin — hangi hesaba yazıldığı burada seçilir.
        </Card>
      ) : (
        <BankaUpload bankalar={bankalar} />
      )}

      <div className="space-y-3">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Yükleme geçmişi</h2>
        {loglar.length === 0 ? (
          <Card className="p-6 text-center text-sm text-[var(--text-muted)]">Henüz yükleme yapılmadı.</Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)]">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium uppercase tracking-widest text-[var(--text-muted)]">Tarih</th>
                    <th className="px-3 py-2 text-left font-medium uppercase tracking-widest text-[var(--text-muted)]">Banka</th>
                    <th className="px-3 py-2 text-left font-medium uppercase tracking-widest text-[var(--text-muted)]">Kullanıcı</th>
                    <th className="px-3 py-2 text-left font-medium uppercase tracking-widest text-[var(--text-muted)]">Dosya</th>
                    <th className="px-3 py-2 text-right font-medium uppercase tracking-widest text-[var(--text-muted)]">Satır</th>
                    <th className="px-3 py-2 text-right font-medium uppercase tracking-widest text-[var(--text-muted)]">Eklenen</th>
                    <th className="px-3 py-2 text-right font-medium uppercase tracking-widest text-[var(--text-muted)]">Atlanan</th>
                    <th className="px-3 py-2 text-left font-medium uppercase tracking-widest text-[var(--text-muted)]">Aralık</th>
                  </tr>
                </thead>
                <tbody>
                  {loglar.map((l) => (
                    <tr key={l.id.toString()} className="border-b border-[var(--border-subtle)] hover:bg-[var(--surface-3)]">
                      <td className="px-3 py-2 font-mono tabular-nums">{dt(l.createdAt)}</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{l.banka}</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{l.userEmail ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-[var(--text-muted)]" title={l.fileName}>
                        {l.fileName.slice(0, 32)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.rowCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-[var(--ok)]">{l.addedCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">{l.skippedCount}</td>
                      <td className="px-3 py-2 tabular-nums text-[var(--text-muted)]">
                        {gun(l.dateFrom)} → {gun(l.dateTo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      <Card className="border-[var(--info-border)] bg-[var(--info-dim)] p-6">
        <p className="mb-2 text-sm font-semibold text-[var(--info)]">Bu ekran ne yapar, ne yapmaz</p>
        <ul className="list-inside list-disc space-y-1 text-xs text-[var(--info)] opacity-90">
          <li>Yalnız <strong>cfo_banka_hareket</strong>&apos;e INSERT eder; UPDATE/DELETE yok, şemasına dokunmaz.</li>
          <li><strong>cfo_bank_account.balanceTry</strong> bu ekrandan hiç güncellenmez — bakiye kararı CFO&apos;nun.</li>
          <li>Benzersiz anahtar <strong>satır hash&apos;i</strong> (banka + tarih + tutar + açıklama + referans + aynı gün sırası). Aynı dosya tekrar yüklenirse mükerrer oluşmaz.</li>
          <li>Sütunlar otomatik tanınmazsa <strong>elle eşleme</strong> istenir; hiçbir zaman sessizce hata vermez.</li>
          <li>PDF bu fazda <strong>desteklenmiyor</strong> — xls/csv indirilmesi istenir.</li>
        </ul>
      </Card>
    </div>
  );
}
