/**
 * CFO / Ödeme Takvimi — "ödeyebilecek miyim?" sorusunun tek ekranda cevabı.
 *
 * Ödemeler dört ayrı tabloda (kredi, kart, sabit gider, vergi) duruyordu; tahsilatlar
 * bir beşincisinde. `cfo_yaklasan_odeme` görünümü hepsini tarih sırasına dizer ve her
 * hareketten sonra kalan nakdi yürütür. Bu sayfa o yürüyen bakiyeyi gün gün gösterir.
 *
 * Tahsilatlar da ekranda — çünkü yalnız ödemeler listelenirse yürüyen bakiye
 * hesaplanamaz ve "hangi gün para bitiyor" sorusu cevapsız kalır.
 *
 * İki şey bilinçli olarak nakit rakamının yanında duruyor:
 *   • Kullanılabilir KMH — bir gün eksiye düşmesi tek başına kriz demek değildir,
 *     boş limitle kapanıyorsa değildir. Kapasiteyi göstermeyen ekran yanlış alarm verir.
 *   • Bakiye yaşı — yürüyen bakiyenin tamamı açılış bakiyesine dayanır. Açılış bayatsa
 *     tüm sütun bayattır; ekran bunu saklarsa olmayan bir kesinlik hissi yaratır.
 */
import Link from "next/link";
import { CalendarClock, ArrowRight, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fmtTry, fmtDate } from "@/lib/cfo/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SettleButton } from "./row-actions";

export const dynamic = "force-dynamic";

type Gun = {
  tarih: Date;
  kalan_gun: number;
  tarih_str: string;
  gun_adi: string;
  odeme_adet: bigint;
  cikacak: unknown;
  girecek: unknown;
  gun_sonu_nakit: unknown;
  gun_ici_dip: unknown;
  kesin_odeme_var: boolean;
  tumu_islendi: boolean;
};

type Hareket = {
  id: string;
  tarih: Date;
  yon: string;
  tur: string;
  aciklama: string | null;
  banka: string | null;
  tutar: unknown;
  kesinlik: string;
  odendi: boolean;
  kalan_gun: number;
  aciliyet: string;
};

type Dip = { tarih_str: string; kalan_nakit: unknown; kalan_gun: number };

type Kapasite = {
  acilis: unknown;
  ticari_kmh: unknown;
  sahsi_kmh: unknown;
  amac_kmh: unknown;
  en_bayat_gun: number | null;
  bayat_hesap: bigint;
};

const n = (v: unknown) => (v == null ? 0 : Number(v));

/** Ufuk seçenekleri — varsayılan 30 gün. */
const UFUKLAR = [
  { key: "30", label: "30 gün", days: 30 },
  { key: "60", label: "60 gün", days: 60 },
  { key: "90", label: "90 gün", days: 90 },
  { key: "tum", label: "Tümü", days: 3650 },
] as const;

export default async function CfoPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ ufuk?: string }>;
}) {
  await requirePermission(PERMISSIONS.CFO_READ);

  const { ufuk } = await searchParams;
  const secili = UFUKLAR.find((u) => u.key === ufuk) ?? UFUKLAR[0];
  const gun = secili.days;

  const [gunler, hareketler, dipler, kapasiteRows] = await Promise.all([
    prisma.$queryRaw<Gun[]>`
      select tarih, kalan_gun, tarih_str, gun_adi, odeme_adet, cikacak, girecek,
             gun_sonu_nakit, gun_ici_dip, kesin_odeme_var, tumu_islendi
        from cfo_odeme_gunluk
       where kalan_gun <= ${gun} order by tarih`,
    prisma.$queryRaw<Hareket[]>`
      select id, tarih, yon, tur, aciklama, banka, tutar, kesinlik, odendi, kalan_gun, aciliyet
        from cfo_yaklasan_odeme
       where kalan_gun <= ${gun} order by tarih, yon desc, tutar desc`,
    prisma.$queryRaw<Dip[]>`select tarih_str, kalan_nakit, kalan_gun from cfo_nakit_dibi`,
    prisma.$queryRaw<Kapasite[]>`
      select coalesce(sum("balanceTry"), 0) as acilis,
             coalesce(sum("kmhLimitTry") filter (where "accountType" not like '%ŞAHSİ%'), 0) as ticari_kmh,
             coalesce(sum("kmhLimitTry") filter (where "accountType" like '%ŞAHSİ%'), 0) as sahsi_kmh,
             coalesce(sum("purposeLimitTry"), 0) as amac_kmh,
             max(current_date - "lastUpdatedAt"::date) as en_bayat_gun,
             count(*) filter (where current_date - "lastUpdatedAt"::date > 7) as bayat_hesap
        from cfo_bank_account where "isActive"`,
  ]);

  const k = kapasiteRows[0];
  const ticariKmh = n(k?.ticari_kmh);
  const sahsiKmh = n(k?.sahsi_kmh);
  const dip = dipler[0];

  // Bu hafta = bugün dahil 7 gün.
  const buHafta = gunler.filter((g) => g.kalan_gun >= 0 && g.kalan_gun <= 7);
  const haftaCikis = buHafta.reduce((a, g) => a + n(g.cikacak), 0);
  const haftaGiris = buHafta.reduce((a, g) => a + n(g.girecek), 0);

  const gecikmis = gunler.filter((g) => g.kalan_gun < 0);
  const gecikmisTutar = gecikmis.reduce((a, g) => a + n(g.cikacak), 0);

  const hareketByGun = new Map<string, Hareket[]>();
  for (const h of hareketler) {
    const key = h.tarih.toISOString().slice(0, 10);
    const list = hareketByGun.get(key);
    if (list) list.push(h);
    else hareketByGun.set(key, [h]);
  }

  /** Nakit negatifse: ticari limitle kapanıyor mu, şahsiye mi iniyor mu? */
  function nakitRengi(nakit: number) {
    if (nakit < 0 && Math.abs(nakit) > ticariKmh) return "danger" as const;
    if (nakit < 0) return "warn" as const;
    if (nakit < 50_000) return "warn" as const;
    return "ok" as const;
  }

  const RENK = {
    danger: "text-[var(--danger)]",
    warn: "text-[var(--warn)]",
    ok: "text-[var(--text-primary)]",
  };

  const kart = (baslik: string, deger: string, alt: string, renk?: "danger" | "warn" | "ok") => (
    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-4">
      <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">{baslik}</p>
      <p className={`mt-1.5 text-[20px] font-semibold tabular-nums ${renk ? RENK[renk] : RENK.ok}`}>
        {deger}
      </p>
      <p className="mt-1 text-[11px] text-[var(--text-muted)]">{alt}</p>
    </div>
  );

  return (
    <>
      <PageHeader
        icon={CalendarClock}
        title="Ödeme Takvimi"
        subtitle="Gelen ve giden para tarih sırasında. Her günün sonunda kasada ne kalıyor?"
      />

      {/* ── Üst şerit ─────────────────────────────────────────────── */}
      <Card className="mb-6 p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kart("Bu hafta çıkacak", fmtTry(haftaCikis), `${buHafta.reduce((a, g) => a + Number(g.odeme_adet), 0)} ödeme · 7 gün`)}
          {kart("Bu hafta girecek", fmtTry(haftaGiris), "beklenen tahsilat", "ok")}
          {kart(
            "Nakit dibi",
            dip ? fmtTry(n(dip.kalan_nakit)) : "—",
            dip ? `${dip.tarih_str} · ${dip.kalan_gun} gün sonra` : "90 günde negatif nokta yok",
            dip && n(dip.kalan_nakit) < 0 ? "danger" : "ok",
          )}
          {kart(
            "Kullanılabilir kapasite",
            fmtTry(n(k?.acilis) + ticariKmh),
            `nakit ${fmtTry(n(k?.acilis))} + ticari KMH ${fmtTry(ticariKmh)}`,
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {gecikmis.length > 0 && (
            <Badge variant="danger">
              {gecikmis.length} gün gecikmiş · {fmtTry(gecikmisTutar)}
            </Badge>
          )}
          <Badge variant="neutral">Şahsi KMH {fmtTry(sahsiKmh)} (son çare)</Badge>
          {n(k?.amac_kmh) > 0 && (
            <Badge variant="neutral">Amaca bağlı limit {fmtTry(n(k?.amac_kmh))}</Badge>
          )}
          <Link href="/cfo/nakit-akisi" className="ml-auto text-xs text-[var(--accent)] hover:underline">
            Nakit akışı <ArrowRight size={11} className="inline" />
          </Link>
        </div>

        {/* Yürüyen bakiyenin tamamı açılış bakiyesine dayanır — yaşı gizlenmez. */}
        {Number(k?.bayat_hesap ?? 0) > 0 && (
          <p className="mt-3 rounded-md border border-[var(--warn-border,var(--border-default))] bg-[var(--warn-dim,var(--surface-1))] px-3 py-2 text-[11px] text-[var(--warn)]">
            Dikkat: {Number(k?.bayat_hesap)} hesabın bakiyesi 7 günden eski (en eskisi{" "}
            {k?.en_bayat_gun} gün). Aşağıdaki tüm gün sonu rakamları bu açılış bakiyesinden
            yürüdüğü için aynı ölçüde belirsizdir.
          </p>
        )}
      </Card>

      {/* ── Ufuk seçimi ───────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap gap-2">
        {UFUKLAR.map((u) => (
          <Link
            key={u.key}
            href={`/cfo/odemeler?ufuk=${u.key}`}
            className={`rounded-md border px-3 py-1.5 text-xs transition ${
              u.key === secili.key
                ? "border-[var(--accent-border)] bg-[var(--accent-dim,var(--surface-2))] text-[var(--accent)]"
                : "border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {u.label}
          </Link>
        ))}
      </div>

      {/* ── Gün gün ───────────────────────────────────────────────── */}
      {gunler.length === 0 ? (
        <Card className="p-8">
          <p className="text-center text-sm text-[var(--text-muted)]">
            Seçilen dönemde bekleyen hareket yok.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {gunler.map((g) => {
            const nakit = n(g.gun_sonu_nakit);
            const dipIci = n(g.gun_ici_dip);
            const renk = nakitRengi(nakit);
            const satirlar = hareketByGun.get(g.tarih.toISOString().slice(0, 10)) ?? [];
            const gecikti = g.kalan_gun < 0;

            return (
              <Card
                key={g.tarih_str}
                className={`p-0 ${gecikti ? "border-l-2 border-l-[var(--danger)]" : ""}`}
              >
                {/* Gün başlığı */}
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[var(--border-subtle)] px-5 py-3">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    {g.tarih_str}
                  </span>
                  <span className="text-xs text-[var(--text-secondary)]">{g.gun_adi}</span>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {g.kalan_gun === 0
                      ? "bugün"
                      : g.kalan_gun < 0
                        ? `${Math.abs(g.kalan_gun)} gün gecikti`
                        : `${g.kalan_gun} gün sonra`}
                  </span>
                  {g.kesin_odeme_var && <Badge variant="danger">kesin ödeme</Badge>}
                  {g.tumu_islendi && <Badge variant="ok">tamamlandı</Badge>}

                  <span className="ml-auto text-right">
                    <span className="block text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                      gün sonu nakit
                    </span>
                    <span className={`text-[17px] font-semibold tabular-nums ${RENK[renk]}`}>
                      {fmtTry(nakit)}
                    </span>
                    {nakit < 0 && (
                      <span className="block text-[11px] text-[var(--text-muted)]">
                        {Math.abs(nakit) <= ticariKmh
                          ? `ticari KMH ile kapanır · kalan kapasite ${fmtTry(ticariKmh + nakit)}`
                          : `ticari KMH yetmiyor · açık ${fmtTry(Math.abs(nakit) - ticariKmh)}`}
                      </span>
                    )}
                    {nakit >= 0 && dipIci < 0 && (
                      <span className="block text-[11px] text-[var(--warn)]">
                        gün içi dip {fmtTry(dipIci)}
                      </span>
                    )}
                  </span>
                </div>

                {/* Hareketler */}
                <ul className="divide-y divide-[var(--border-subtle)]">
                  {satirlar.map((h) => {
                    const giris = h.yon === "GIRIS";
                    const tahmini = h.kesinlik !== "KESIN";
                    const islendi = h.odendi;
                    return (
                      <li
                        key={`${h.id}-${h.yon}`}
                        className={`flex flex-wrap items-start gap-x-3 gap-y-2 px-5 py-3 ${
                          islendi ? "opacity-45" : tahmini ? "opacity-70" : ""
                        }`}
                      >
                        {giris ? (
                          <ArrowDownRight size={15} className="mt-0.5 shrink-0 text-[var(--ok)]" />
                        ) : (
                          <ArrowUpRight size={15} className="mt-0.5 shrink-0 text-[var(--danger)]" />
                        )}

                        <div className="min-w-[180px] flex-1">
                          <p className="text-[13px] font-medium text-[var(--text-primary)]">
                            {h.tur}
                            {h.banka ? (
                              <span className="font-normal text-[var(--text-muted)]"> · {h.banka}</span>
                            ) : null}
                          </p>
                          {h.aciklama && (
                            <p className="mt-0.5 text-[11px] leading-snug text-[var(--text-muted)]">
                              {h.aciklama}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {islendi && <Badge variant="ok">Gerçekleşti</Badge>}
                          {!islendi && tahmini && <Badge variant="warn">Tahmini</Badge>}
                          <span
                            className={`min-w-[110px] text-right text-[14px] font-semibold tabular-nums ${
                              giris ? "text-[var(--ok)]" : "text-[var(--danger)]"
                            }`}
                          >
                            {giris ? "+" : "−"}
                            {fmtTry(n(h.tutar))}
                          </span>
                          <SettleButton
                            id={h.id}
                            tur={h.tur}
                            aciklama={h.aciklama ?? ""}
                            giris={giris}
                            islendi={islendi}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-[11px] text-[var(--text-muted)]">
        Kaynak: <code>cfo_yaklasan_odeme</code> görünümü. Açılış bakiyesi{" "}
        {fmtTry(n(k?.acilis))} ({fmtDate(new Date())} itibarıyla aktif hesap toplamı).{" "}
        <strong>İşaretleme yürüyen bakiyeyi değiştirmez</strong> — yalnızca &quot;bu hareket
        oldu&quot; kaydıdır ve değişiklik günlüğüne yazılır. Rakamlar ancak gerçek banka bakiyesi
        güncellenince değişir.
      </p>
    </>
  );
}
