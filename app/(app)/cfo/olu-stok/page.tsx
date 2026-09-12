/**
 * CFO / Ölü Stok — hapsolmuş sermaye ve onu serbest bırakma kuyruğu.
 *
 * Ölü stok "satmayan ürün" değil, **çalışmayan para**. Bu sayfa tek soruyu
 * cevaplar: hangi üründe ne kadar param duruyor ve onu çıkarmak için bugün ne
 * yapmam gerekiyor.
 *
 * Veri kaynağı `cfo_olu_stok` görünümü. Üç kural: 30 günde sıfır · örtü > 180 gün ·
 * 90 günlük satış stok değerinin %20'sinden düşük (eşik `cfo_settings`). Kukla stok
 * hariç, AMAZON_FBA dahil, çift sayımsız SKU eşleşmesi. Sayfa hesap yapmaz — kural
 * görünümde yaşar ki rapor ile ekran aynı rakamı göstersin.
 *
 * Stok değeri maliyet öncelikli, maliyet yoksa 90 günde gerçekleşen satış
 * fiyatından türetiliyor. Bu önemli: 1.299 ürünün yalnız 76'sında birim maliyet
 * var, eskiden maliyeti olmayan ürün bu listede HİÇ görünmüyordu.
 *
 * Kontrol vakti geçmiş bulgular en üstte ve kırmızı kenarlıklı: takip kişiye
 * değil sisteme bağlı.
 */
import Link from "next/link";
import { PackageX, ArrowRight } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fmtTry, fmtNum, fmtDate } from "@/lib/cfo/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CfoTable, Th, Td } from "@/components/cfo/data-table";
import { RowActions } from "./row-actions";

export const dynamic = "force-dynamic";

type Row = {
  sku: string | null;
  ad: string | null;
  stok: number | null;
  bagli_sermaye: unknown;
  adet_30g: bigint | null;
  adet_90g: bigint | null;
  fba_90g: bigint | null;
  son_satis: Date | null;
  gecen_gun: number | null;
  ortu_gun: unknown;
  stok_deger: unknown;
  deger_kaynagi: string | null;
  satis_90g_try: unknown;
  satis_stok_orani: unknown;
  alarm: string | null;
  alarm_sebep: string | null;
  bulgu_id: bigint | null;
  bulgu_durum: string | null;
  aksiyon: string | null;
  kontrol_notu: string | null;
  sonraki_kontrol: Date | null;
  kontrol_gecikti: boolean | null;
};

type Ozet = {
  toplam_sku: bigint;
  kirmizi: bigint;
  sari: bigint;
  bagli_sermaye: unknown;
  kirmizi_bagli: unknown;
  otuz_gun_sifir: bigint;
  doksan_gun_sifir: bigint;
  doksan_gun_sifir_bagli: unknown;
  kontrol_gecikti: bigint;
};

type Released = { ay: Date; tutar: unknown; adet: bigint };

const n = (v: unknown) => (v == null ? null : Number(v));

/**
 * Ölü stok oran kuralı eşiği — 90 günlük satış, stok değerinin bu oranından
 * düşükse ürün listeye girer. Gerçek eşik `cfo_settings.deadStockSalesRatioPct`;
 * buradaki yalnız boyamak için, kapı veritabanındaki görünümde.
 */
const ORAN_ESIGI = 0.2;

const DURUM_TR: Record<string, string> = {
  acik: "Açık",
  izleniyor: "İzleniyor",
  aksiyon_alindi: "Aksiyon alındı",
  kapandi: "Kapandı",
  gecersiz: "Geçersiz",
};

export default async function CfoDeadStockPage() {
  await requirePermission(PERMISSIONS.CFO_READ);

  const [rows, ozetRows, released] = await Promise.all([
    prisma.$queryRaw<Row[]>`select * from cfo_olu_stok order by kontrol_gecikti desc nulls last, bagli_sermaye desc`,
    prisma.$queryRaw<Ozet[]>`select * from cfo_olu_stok_ozet`,
    prisma.$queryRaw<Released[]>`
      select date_trunc('month', coalesce(action_applied_at, updated_at))::date as ay,
             sum(released_capital_try) as tutar, count(*) as adet
        from cfo_dead_stock_finding
       where status = 'kapandi' and released_capital_try is not null
       group by 1 order by 1 desc limit 12`,
  ]);

  const o = ozetRows[0];
  const gecikmis = rows.filter((r) => r.kontrol_gecikti);
  const temizlenenToplam = released.reduce((a, r) => a + (n(r.tutar) ?? 0), 0);

  const kart = (baslik: string, deger: string, alt: string, vurgu?: "danger" | "warn" | "ok") => (
    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-4">
      <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">{baslik}</p>
      <p
        className={`mt-1.5 text-[20px] font-semibold tabular-nums ${
          vurgu === "danger"
            ? "text-[var(--danger)]"
            : vurgu === "warn"
              ? "text-[var(--warn)]"
              : vurgu === "ok"
                ? "text-[var(--ok)]"
                : "text-[var(--text-primary)]"
        }`}
      >
        {deger}
      </p>
      <p className="mt-1 text-[11px] text-[var(--text-muted)]">{alt}</p>
    </div>
  );

  return (
    <>
      <PageHeader
        icon={PackageX}
        title="Ölü Stok"
        subtitle="Satmayan ürün değil, çalışmayan para. Bağlı sermayeyi serbest bırakma kuyruğu."
      />

      {/* ── Üst şerit ─────────────────────────────────────────────── */}
      <Card className="mb-6 p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kart(
            "Bağlı sermaye",
            fmtTry(n(o?.bagli_sermaye)),
            `${fmtNum(Number(o?.toplam_sku ?? 0))} SKU`,
          )}
          {kart(
            "Kırmızı",
            fmtTry(n(o?.kirmizi_bagli)),
            `${fmtNum(Number(o?.kirmizi ?? 0))} SKU · acil elden geçmeli`,
            "danger",
          )}
          {kart(
            "90 gündür sıfır",
            fmtTry(n(o?.doksan_gun_sifir_bagli)),
            `${fmtNum(Number(o?.doksan_gun_sifir ?? 0))} SKU · hiç satmadı`,
            "warn",
          )}
          {kart(
            "Temizlenen sermaye",
            fmtTry(temizlenenToplam),
            `${released.reduce((a, r) => a + Number(r.adet), 0)} bulgu kapandı`,
            "ok",
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge variant="neutral">{fmtNum(Number(o?.otuz_gun_sifir ?? 0))} SKU 30 günde sıfır</Badge>
          <Badge variant="neutral">{fmtNum(Number(o?.sari ?? 0))} sarı</Badge>
          {gecikmis.length > 0 ? (
            <Badge variant="danger">{gecikmis.length} bulgunun kontrol vakti geçti</Badge>
          ) : (
            <Badge variant="ok">Kontrol kuyruğu temiz</Badge>
          )}
          <Link href="/cfo" className="ml-auto text-xs text-[var(--accent)] hover:underline">
            CFO kokpiti <ArrowRight size={11} className="inline" />
          </Link>
        </div>
      </Card>

      {/* ── Liste ─────────────────────────────────────────────────── */}
      <Card className="mb-6 p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">
          Bulgular — en çok parayı hapseden üstte
        </h2>
        <p className="mb-4 text-[11px] text-[var(--text-muted)]">
          Kontrol vakti geçenler en üstte ve kırmızı kenarlıklı. Her satırda üç eylem var;
          üçü de deftere ve değişiklik günlüğüne yazılır.
        </p>

        <CfoTable
          empty={rows.length === 0 ? "Ölü stok bulgusu yok — bağlı sermaye temiz." : undefined}
          head={
            <tr>
              <Th>Ürün</Th>
              <Th right>Stok</Th>
              <Th right>Bağlı sermaye</Th>
              <Th right>30g / 90g</Th>
              <Th right>90g satış / stok</Th>
              <Th right>Örtü</Th>
              <Th>Durum</Th>
              <Th>Aksiyon</Th>
            </tr>
          }
        >
          {rows.map((r) => {
            const gecikti = !!r.kontrol_gecikti;
            const kirmizi = r.alarm === "KIRMIZI";
            const oran = n(r.satis_stok_orani);
            return (
              <tr
                key={r.sku ?? String(r.bulgu_id)}
                className={gecikti ? "border-l-2 border-l-[var(--danger)] bg-[var(--danger-dim)]" : ""}
              >
                <Td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-[var(--text-primary)]">{r.ad ?? "—"}</span>
                    {Number(r.fba_90g ?? 0) > 0 && <Badge variant="info">FBA</Badge>}
                  </div>
                  <p className="mt-0.5 font-mono text-[11px] text-[var(--text-muted)]">{r.sku}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{r.alarm_sebep}</p>
                  {r.kontrol_notu && (
                    <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{r.kontrol_notu}</p>
                  )}
                  {r.aksiyon && (
                    <p className="mt-1 text-[11px] text-[var(--ok)]">Uygulanan: {r.aksiyon}</p>
                  )}
                </Td>
                <Td right>{fmtNum(r.stok)}</Td>
                <Td right strong>{fmtTry(n(r.bagli_sermaye))}</Td>
                <Td right muted>
                  {fmtNum(Number(r.adet_30g ?? 0))} / {fmtNum(Number(r.adet_90g ?? 0))}
                  <br />
                  <span className="text-[11px]">
                    {r.gecen_gun == null ? "hiç satmadı" : `${r.gecen_gun} gün önce`}
                  </span>
                </Td>
                {/* 90 günde bağlı sermayenin ne kadarı ciroya döndü. Eşiğin
                    altındaysa kırmızı — ürün yavaş değil, sıkışmış demektir. */}
                <Td right muted>
                  {oran == null ? (
                    "—"
                  ) : (
                    <>
                      <span className={oran < ORAN_ESIGI ? "text-[var(--danger)]" : undefined}>
                        %{(oran * 100).toFixed(1)}
                      </span>
                      <br />
                      <span className="text-[11px]">
                        {fmtTry(n(r.satis_90g_try))} / {fmtTry(n(r.stok_deger))}
                      </span>
                    </>
                  )}
                </Td>
                <Td right muted>
                  {r.ortu_gun == null ? "—" : `${fmtNum(n(r.ortu_gun))} gün`}
                </Td>
                <Td>
                  <Badge variant={kirmizi ? "danger" : "warn"}>{r.alarm ?? "—"}</Badge>
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                    {DURUM_TR[r.bulgu_durum ?? ""] ?? r.bulgu_durum ?? "—"}
                  </p>
                  <p className={`text-[11px] ${gecikti ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`}>
                    kontrol: {fmtDate(r.sonraki_kontrol)}
                  </p>
                </Td>
                <Td>
                  {r.bulgu_id != null ? (
                    <RowActions id={String(r.bulgu_id)} tiedTry={n(r.bagli_sermaye)} />
                  ) : (
                    <span className="text-[11px] text-[var(--text-muted)]">defterde kayıt yok</span>
                  )}
                </Td>
              </tr>
            );
          })}
        </CfoTable>
      </Card>

      {/* ── Temizlenen sermaye ────────────────────────────────────── */}
      <Card className="p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">Temizlenen sermaye</h2>
        <p className="mb-4 text-[11px] text-[var(--text-muted)]">
          Kapatılan bulguların serbest bıraktığı para, ay ay. Hedef bu sayının büyümesi —
          ölü stoktan çıkan para, satan ürüne giren paradır.
        </p>
        {released.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">
            Henüz kapatılmış bulgu yok. Bir bulguyu &quot;Kapat&quot; ile kapattığında serbest kalan
            sermaye burada birikmeye başlar.
          </p>
        ) : (
          <CfoTable
            head={
              <tr>
                <Th>Ay</Th>
                <Th right>Kapanan bulgu</Th>
                <Th right>Serbest kalan</Th>
              </tr>
            }
          >
            {released.map((r) => (
              <tr key={String(r.ay)}>
                <Td strong>{fmtDate(r.ay)}</Td>
                <Td right>{fmtNum(Number(r.adet))}</Td>
                <Td right strong>{fmtTry(n(r.tutar))}</Td>
              </tr>
            ))}
          </CfoTable>
        )}
      </Card>
    </>
  );
}
