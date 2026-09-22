/**
 * Entegra satış yükleme — dosya → önizleme → onay → yaz.
 *
 * Yazma MarketplaceSalesRecord ile sınırlı (+ EntegraImportLog). cfo_* tablolarına
 * dokunulmaz; cfo_norm() yalnız ürün eşleştirmede SALT OKUNUR çağrılır.
 */
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { EntegraUpload } from "@/components/entegra/entegra-upload";

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

export default async function EntegraYuklemePage() {
  await requirePermission(PERMISSIONS.CFO_WRITE);

  const loglar = await prisma.entegraImportLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Pazaryerleri</p>
        <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
          Entegra Satış Yükleme
        </h1>
        <p className="mt-1 text-sm leading-7 text-[var(--text-secondary)]">
          Entegra sipariş dışa aktarımını pazaryeri satış kayıtlarına yazar. Akış her zaman{" "}
          <strong>yükle → önizleme → onayla</strong>; onay verilmeden tek satır yazılmaz. Aynı dosya iki kez
          yüklenirse mükerrer kayıt oluşmaz.
        </p>
      </div>

      <EntegraUpload />

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
                    <th className="px-3 py-2 text-left font-medium uppercase tracking-widest text-[var(--text-muted)]">Kullanıcı</th>
                    <th className="px-3 py-2 text-left font-medium uppercase tracking-widest text-[var(--text-muted)]">Dosya</th>
                    <th className="px-3 py-2 text-right font-medium uppercase tracking-widest text-[var(--text-muted)]">Satır</th>
                    <th className="px-3 py-2 text-right font-medium uppercase tracking-widest text-[var(--text-muted)]">Yeni</th>
                    <th className="px-3 py-2 text-right font-medium uppercase tracking-widest text-[var(--text-muted)]">Güncellenen</th>
                    <th className="px-3 py-2 text-right font-medium uppercase tracking-widest text-[var(--text-muted)]">Atlanan</th>
                    <th className="px-3 py-2 text-left font-medium uppercase tracking-widest text-[var(--text-muted)]">Aralık</th>
                    <th className="px-3 py-2 text-right font-medium uppercase tracking-widest text-[var(--text-muted)]">Süre</th>
                  </tr>
                </thead>
                <tbody>
                  {loglar.map((l) => (
                    <tr key={l.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--surface-3)]">
                      <td className="px-3 py-2 font-mono tabular-nums">{dt(l.createdAt)}</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{l.userEmail ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-[var(--text-muted)]" title={l.fileName}>
                        {l.fileName.slice(0, 32)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.rowCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-[var(--ok)]">{l.createdCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-[var(--info)]">{l.updatedCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">{l.skippedCount}</td>
                      <td className="px-3 py-2 tabular-nums text-[var(--text-muted)]">
                        {gun(l.dateFrom)} → {gun(l.dateTo)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">
                        {(l.durationMs / 1000).toFixed(1)} sn
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
          <li>Yalnız <strong>pazaryeri satış kayıtlarına</strong> yazar; CFO tabloları dâhil başka hiçbir tabloya dokunmaz.</li>
          <li>Benzersiz anahtar <strong>kanal + sipariş no + satır ID</strong>. Aynı dosya tekrar yüklenirse mükerrer oluşmaz.</li>
          <li>Ürün bağı önce <strong>birebir</strong> stok kodu, bulunamazsa normalize karşılaştırma ile kurulur; belirsizse <strong>boş bırakılır</strong> (uydurulmaz).</li>
          <li>Mevcut kayıtta ürün bağı varsa ve dosyada eşleşme çıkmazsa <strong>eski bağ korunur</strong>.</li>
          <li>Tarihten <strong>saat atılır</strong>, yalnız gün yazılır.</li>
          <li>Dosyadaki <strong>tüm satırlar</strong> işlenir — yalnız yeni günler değil.</li>
        </ul>
      </Card>
    </div>
  );
}
