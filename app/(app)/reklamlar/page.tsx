import Link from "next/link";
import { Megaphone, CircleAlert, TrendingUp } from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/layout/empty-state";
import { KpiCard } from "@/components/layout/kpi-card";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { DATE_PRESETS, fetchAdsSummary, isDatePreset, type DatePreset } from "@/lib/meta/ads";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const para = (n: number, cur: string) =>
  `${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;
const sayi = (n: number) => n.toLocaleString("tr-TR");
const oran = (n: number) => `%${n.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`;

export default async function ReklamlarPage({
  searchParams,
}: {
  searchParams: Promise<{ donem?: string }>;
}) {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.ADS_READ))) {
    return (
      <EmptyState
        icon={CircleAlert}
        title="Bu sayfa için yetkiniz yok"
        hint="Reklam performansı için `ads.read` izni gerekir."
      />
    );
  }

  const sp = await searchParams;
  const donem: DatePreset = isDatePreset(sp.donem) ? sp.donem : "last_7d";
  const sonuc = await fetchAdsSummary(donem);

  const th =
    "py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]";
  const thR = th.replace("text-left", "text-right");
  const td = "py-3 px-4";
  const tdR = "py-3 px-4 text-right tabular-nums";

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Megaphone}
        breadcrumb={[{ label: "Sistem" }, { label: "Meta Reklamları" }]}
        title="Meta Reklam Performansı"
        subtitle="Kampanya bazında harcama, satış ve ROAS. Yalnız okuma — bütçe ve durum Meta panelinden yönetilir."
      />

      {/* Dönem seçimi: filtreler grafiklerin üstünde tek sırada. */}
      <nav className="flex flex-wrap gap-1.5">
        {(Object.keys(DATE_PRESETS) as DatePreset[]).map((d) => (
          <Link
            key={d}
            href={`/reklamlar?donem=${d}`}
            className={`rounded-md border px-3 py-1.5 text-xs transition ${
              d === donem
                ? "border-[var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]"
                : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {DATE_PRESETS[d]}
          </Link>
        ))}
      </nav>

      {!sonuc.ok ? (
        // Hata SESSİZ KALMAZ. Boş panel "kampanya durmuş" diye okunur ve
        // yanlış paniğe yol açardı; sebep burada yazılı.
        <Card className="border-[var(--danger)] p-4">
          <div className="flex gap-3">
            <CircleAlert size={18} className="mt-0.5 shrink-0 text-[var(--danger)]" />
            <div className="space-y-2 text-sm">
              <p className="font-medium">{sonuc.hata.mesaj}</p>
              {sonuc.hata.detay && (
                <p className="font-mono text-xs text-[var(--text-tertiary)]">{sonuc.hata.detay}</p>
              )}
              <div className="space-y-1 text-xs text-[var(--text-secondary)]">
                <p>Gerekli değişkenler (Vercel → Environment Variables):</p>
                <ul className="list-inside list-disc">
                  <li>
                    <code>META_ADS_TOKEN</code> — <code>ads_read</code> izinli Sistem Kullanıcısı
                    anahtarı (geçici anahtar 24 saatte ölür)
                  </li>
                  <li>
                    <code>META_AD_ACCOUNT_ID</code> — reklam hesabı kimliği (<code>act_…</code> ya da
                    yalnız rakam)
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <>
          {/* KPI satırı: manşet sayılar için tablo/grafik değil, stat kartı. */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="ROAS"
              value={sonuc.ozet.roas === null ? "—" : `${sonuc.ozet.roas.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}×`}
              tone={sonuc.ozet.roas === null ? "neutral" : sonuc.ozet.roas >= 1 ? "success" : "danger"}
              hint="Ciro ÷ harcama. 1×'in altı zarar."
            />
            <KpiCard label="Harcama" value={para(sonuc.ozet.spend, sonuc.currency)} />
            <KpiCard label="Ciro" value={para(sonuc.ozet.revenue, sonuc.currency)} />
            <KpiCard
              label="Satış"
              value={sayi(sonuc.ozet.purchases)}
              hint={
                sonuc.ozet.cpa === null
                  ? "Henüz satış yok"
                  : `Satış başı ${para(sonuc.ozet.cpa, sonuc.currency)}`
              }
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard label="Gösterim" value={sayi(sonuc.ozet.impressions)} />
            <KpiCard label="Tıklama" value={sayi(sonuc.ozet.clicks)} hint={`CTR ${oran(sonuc.ozet.ctr)}`} />
            <KpiCard label="Tıklama başı maliyet" value={para(sonuc.ozet.cpc, sonuc.currency)} />
          </div>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Kampanyalar
            </h2>
            {sonuc.ozet.campaigns.length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                title="Bu dönemde veri yok"
                hint="Kampanya bu tarih aralığında hiç yayınlanmamış olabilir. Daha geniş bir dönem seçin."
              />
            ) : (
              <Card className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)]">
                      <th className={th}>Kampanya</th>
                      <th className={thR}>Harcama</th>
                      <th className={thR}>Ciro</th>
                      <th className={thR}>ROAS</th>
                      <th className={thR}>Satış</th>
                      <th className={thR}>Satış başı</th>
                      <th className={thR}>Tıklama</th>
                      <th className={thR}>CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sonuc.ozet.campaigns.map((k) => (
                      <tr key={k.campaignId || k.campaignName} className="border-b border-[var(--border-subtle)]">
                        <td className={td}>{k.campaignName}</td>
                        <td className={tdR}>{para(k.spend, sonuc.currency)}</td>
                        <td className={tdR}>{para(k.revenue, sonuc.currency)}</td>
                        {/* ROAS rengi durum bildirir, seri kimliği değil:
                            1×'in altı harcamanın ciroyu geçtiği anlamına gelir. */}
                        <td
                          className={`${tdR} font-medium`}
                          style={{
                            color:
                              k.roas === null
                                ? undefined
                                : k.roas >= 1
                                  ? "var(--ok)"
                                  : "var(--danger)",
                          }}
                        >
                          {k.roas === null ? "—" : `${k.roas.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}×`}
                        </td>
                        <td className={tdR}>{sayi(k.purchases)}</td>
                        <td className={tdR}>{k.cpa === null ? "—" : para(k.cpa, sonuc.currency)}</td>
                        <td className={tdR}>{sayi(k.clicks)}</td>
                        <td className={tdR}>{oran(k.ctr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </section>

          <p className="text-xs text-[var(--text-tertiary)]">
            Hesap {sonuc.hesap} · {formatDateTime(sonuc.guncellendi)} itibarıyla ·{" "}
            Meta&apos;nın dönüşüm verisi geriye dönük güncellenir, son saatlerin rakamları yükselebilir.
          </p>
        </>
      )}
    </div>
  );
}
