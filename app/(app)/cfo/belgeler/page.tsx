/**
 * CFO / Belgeler — belge kütüphanesi (CFO-027, Cowork brief'i 2026-10-09).
 *
 * Komisyon oranları, kart/banka ekstreleri, KDV beyannamesi, platform faturaları… soruya bağlı olmadan, sabit kategori ve ZORUNLU açıklamayla.
 * Üç kural: ham dosya motora girmez (bağlama yalnız açıklama + kısa özet + çıkarılan sayılar); kullanıcı açıklaması AI özetinden üstün;
 * belge KANITTIR — yükleme hiçbir defteri değiştirmez, çıkarılan sayılar öneridir ve onaysız deftere yazılmaz.
 */
import { FileText } from "lucide-react";
import { requirePermission, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fmtDate, fmtTry } from "@/lib/cfo/format";
import { categoryLabel, maskSensitive } from "@/lib/cfo/documents";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CfoTable, Th, Td } from "@/components/cfo/data-table";
import { UploadDocumentForm, ArchiveDocumentButton } from "./upload-form";

export const dynamic = "force-dynamic";

type Doc = { id: string; kategori: string; baslik: string; aciklama: string; donem_baslangic: string | null; donem_bitis: string | null;
  gecerlilik_bitis: string | null; dosya_adi: string; boyut: number; yukleyen: string; yuklendi_at: Date; ozet: string | null; ozet_durumu: string;
  cikarilan: Record<string, unknown> | null; celiski: string | null; arsiv_at: Date | null };

// Kendi sitelerimiz (komisyon yok): soluelektronik.com (IDEASOFT) ve Alfashome
const OWN_CHANNELS = new Set(["IDEASOFT", "ALFASHOME"]);

/** Sayfa açıldığında kart ekstresinden önce bakılacak 4 belge — her biri bugün ölçülemeyen bir kararı kapatır (Cowork 2026-10-09). */
const PRIORITY = [
  { cat: "KART_EKSTRESI", why: "KKDF/BSMV satırı görünen ekstre → kart faiz çarpanı ×1,20 mi ×1,05 mi (yılda ~253.000 TL fark)" },
  { cat: "KDV_BEYANNAMESI", why: "devreden KDV → net sermayede 564.310 TL'lik kalem (CFO-007)" },
  { cat: "KOMISYON_ORANI", why: "6 kanalda komisyon kayıtsız → aşağıdaki tablo" },
  { cat: "PLATFORM_FATURASI", why: "Trendyol / HB komisyon dışı hizmet bedelleri sabit giderde var mı — hiç ölçülmedi" },
];

export default async function CfoDocumentsPage() {
  const user = await requirePermission(PERMISSIONS.CFO_READ);
  const canWrite = await checkPermission(user, PERMISSIONS.CFO_WRITE);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
  const [ready] = await prisma.$queryRaw<{ t: string | null }[]>`select to_regclass('public.cfo_belge')::text as t`;
  const docs = ready?.t ? await prisma.$queryRaw<Doc[]>`select id, kategori, baslik, aciklama, donem_baslangic::text, donem_bitis::text, gecerlilik_bitis::text,
      dosya_adi, boyut, yukleyen, yuklendi_at, ozet, ozet_durumu, cikarilan, celiski, arsiv_at from cfo_belge order by yuklendi_at desc limit 500` : [];
  const gaps = await prisma.$queryRaw<{ channel: string; n: number; ciro: unknown; kom: unknown; bos: number }[]>`
    select channel::text as channel, count(*)::int as n, sum("totalAmountTry") as ciro, sum(coalesce("commissionTry", 0)) as kom,
           count(*) filter (where coalesce("commissionTry", 0) = 0)::int as bos
      from "MarketplaceSalesRecord" where "orderDate" >= current_date - 30 group by 1 order by 3 desc`.catch(() => []);
  const missing = gaps.filter(g => !OWN_CHANNELS.has(g.channel) && g.bos / g.n >= 0.5);
  const measured = gaps.filter(g => !OWN_CHANNELS.has(g.channel) && g.bos / g.n < 0.5 && Number(g.ciro) > 0);
  const refRate = measured.length ? measured.reduce((a, g) => a + Number(g.kom), 0) / measured.reduce((a, g) => a + Number(g.ciro), 0) : null;
  const missingCiro = missing.reduce((a, g) => a + Number(g.ciro), 0);

  const active = docs.filter(d => !d.arsiv_at), archived = docs.filter(d => d.arsiv_at);
  const have = new Set(active.map(d => d.kategori));

  return (
    <>
      <PageHeader icon={FileText} title="Belgeler"
        subtitle="Ekstre, beyanname, fatura ve komisyon belgeleri. Belge kanıttır: yüklemek hiçbir defteri değiştirmez; çıkarılan sayılar onayınla deftere geçer." />

      {!ready?.t && (
        <Card className="mb-6 p-4 text-sm text-[var(--danger)]">
          Belge tablosu bu veritabanında yok (migration <code>20261009240000_cfo_belge</code> uygulanmamış).
        </Card>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Önce bu dört belge</h2>
          <ul className="space-y-2 text-sm">
            {PRIORITY.map(p => (
              <li key={p.cat} className="flex items-start gap-2">
                <Badge variant={have.has(p.cat) ? "ok" : "warn"}>{have.has(p.cat) ? "var" : "yok"}</Badge>
                <span><strong>{categoryLabel(p.cat)}</strong> — <span className="text-[var(--text-muted)]">{p.why}</span></span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Komisyonu kayıtsız kanallar (son 30 gün)</h2>
          {missing.length === 0 ? <p className="text-sm text-[var(--text-muted)]">Yok.</p> : (
            <>
              <CfoTable head={<tr><Th>Kanal</Th><Th right>Satır</Th><Th right>Ciro</Th><Th right>Kayıtlı komisyon</Th></tr>}>
                {missing.map(g => (
                  <tr key={g.channel}><Td strong>{g.channel}</Td><Td right>{g.bos}/{g.n}</Td><Td right>{fmtTry(Number(g.ciro))}</Td><Td right>{fmtTry(Number(g.kom))}</Td></tr>
                ))}
              </CfoTable>
              <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                Hiçbir pazaryeri komisyonsuz satış yaptırmaz — bu veri eksikliği. {refRate != null && <>Ölçülen kanalların oranı (%{(refRate * 100).toFixed(1)}) uygulanırsa
                ayda ~{fmtTry(missingCiro * refRate)} görünmeyen maliyet (TAHMİNİ). </>}Motor bu kanalların komisyonunu 0 değil BİLİNMİYOR sayar; toplamı doğrudan okuyan raporlarda görünmez.
                Kanal başına komisyon oranı belgesi (<em>Pazaryeri komisyon oranları</em>) bu boşluğu kapatır.
              </p>
            </>
          )}
        </Card>
      </div>

      {canWrite && ready?.t && (
        <Card className="mb-6 p-5">
          <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Belge yükle</h2>
          <UploadDocumentForm />
          <p className="mt-3 text-[11px] text-[var(--text-muted)]">
            Dosya özel depoda saklanır; motora ham dosya girmez. Cowork okuduktan sonra kısa özet ve çıkarılan sayılar burada görünür (IBAN / kart numarası maskeli).
            Sayılar öneridir: onaylamadıkça hiçbir defter değişmez.
          </p>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Kütüphane ({active.length})</h2>
        {active.length === 0 ? <p className="text-sm text-[var(--text-muted)]">Henüz belge yok.</p> : (
          <ul className="space-y-3">
            {active.map(d => {
              const expired = d.gecerlilik_bitis != null && d.gecerlilik_bitis < today;
              return (
                <li key={d.id} className="rounded-lg border border-[var(--border)] p-4">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge variant="info">{categoryLabel(d.kategori)}</Badge>
                    <Badge variant={d.ozet_durumu === "HAZIR" ? "ok" : d.ozet_durumu === "OKUNAMADI" ? "danger" : "neutral"}>
                      {d.ozet_durumu === "HAZIR" ? "özet hazır" : d.ozet_durumu === "OKUNAMADI" ? "okunamadı" : "özet bekliyor"}</Badge>
                    {expired && <Badge variant="warn">geçerliliği bitti ({fmtDate(d.gecerlilik_bitis)})</Badge>}
                    {d.celiski && <Badge variant="danger">açıklamayla çelişki</Badge>}
                    <strong className="text-sm text-[var(--text-primary)]">{d.baslik}</strong>
                    <span className="ml-auto flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                      {d.donem_baslangic || d.donem_bitis ? `dönem ${fmtDate(d.donem_baslangic)} – ${fmtDate(d.donem_bitis)} · ` : ""}
                      {fmtDate(d.yuklendi_at)} · {d.yukleyen}
                      <a className="text-[var(--accent)] hover:underline" href={`/api/admin/cfo/belge/${d.id}`}>{d.dosya_adi}</a>
                      {canWrite && <ArchiveDocumentButton id={d.id} archived={false} />}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-primary)]"><span className="text-[var(--text-muted)]">Açıklama (geçerli): </span>{d.aciklama}</p>
                  {d.ozet && <p className="mt-1 text-sm text-[var(--text-secondary)]"><span className="text-[var(--text-muted)]">AI özeti: </span>{maskSensitive(d.ozet)}</p>}
                  {d.cikarilan && Object.keys(d.cikarilan).length > 0 && (
                    <p className="mt-1 text-[12px] text-[var(--text-muted)]">Çıkarılan sayılar (öneri, onaysız deftere yazılmaz): {
                      Object.entries(d.cikarilan).map(([k, v]) => `${k}: ${maskSensitive(String(v))}`).join(" · ")}</p>
                  )}
                  {d.celiski && <p className="mt-1 text-[12px] text-[var(--danger)]">Çelişki: {maskSensitive(d.celiski)} — senin açıklaman geçerli.</p>}
                </li>
              );
            })}
          </ul>
        )}
        {archived.length > 0 && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-[var(--text-muted)]">Arşiv ({archived.length})</summary>
            <ul className="mt-2 space-y-1">
              {archived.map(d => (
                <li key={d.id} className="flex items-center gap-2 text-[var(--text-muted)]">
                  {categoryLabel(d.kategori)} · {d.baslik} · {fmtDate(d.arsiv_at)}
                  {canWrite && <ArchiveDocumentButton id={d.id} archived />}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>
    </>
  );
}
