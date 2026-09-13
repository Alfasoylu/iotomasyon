/**
 * Yeni Ürünler — ilan açılacak adayların hazırlık panosu.
 *
 * 07.26sea konteynerindeki 152 kalemin 149'u katalogda yok. Bunlar 05.10'da
 * rafa girecek ve Trendyol / Hepsiburada / Amazon'da ilan açılması gerekiyor.
 * İlan açmak için gereken bilgi (Türkçe ad, açıklama, görsel, barkod, desi)
 * bugüne kadar hiçbir yerde toplu durmuyordu.
 *
 * PUAN NEDEN VAR: "hangi üründe ne eksik" sorusunu 149 ürün için tek tek
 * sormak mümkün değil. Puan bunu tek sayıya indiriyor, eksikler ise adıyla
 * yazılıyor — çünkü "62 puan" tek başına ne yapılacağını söylemez.
 *
 * 90 EŞİĞİ: Alperen'in kuralı — 90'ın altında ilan açılmaz. Eşik sunucu
 * tarafında da doğrulanıyor (bkz. setCandidateStatusAction); ekrandaki rozet
 * yalnız gösterge, kapı değil.
 */
import Link from "next/link";
import { PackagePlus, ArrowRight, TriangleAlert, PackageCheck } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fmtTry, fmtNum } from "@/lib/cfo/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CfoTable, Th, Td } from "@/components/cfo/data-table";
import { PUAN_ESIGI, BASLIK_TRENDYOL } from "@/lib/urun-aday/sabitler";

export const dynamic = "force-dynamic";

type Satir = {
  id: string;
  sku: string;
  kaynak: string | null;
  invoice_ad: string | null;
  ad_tr: string | null;
  katalogda_var: boolean;
  katalog_sku: string | null;
  katalog_ad: string | null;
  marka: string | null;
  kategori: string | null;
  adet: number | null;
  satis_try: unknown;
  birim_usd: unknown;
  agirlik_kg: unknown;
  link_1688: string | null;
  durum: string;
  urun_gorsel: number;
  cince_gorsel: number;
  info_gorsel: number;
  puan: number;
  eksikler: string[] | null;
  kutu_kaynak: string | null;
  desi: unknown;
};

const n = (v: unknown) => (v == null ? 0 : Number(v));

const DURUM_ETIKET: Record<string, { t: string; v: "ok" | "warn" | "danger" | "neutral" | "info" }> = {
  TASLAK: { t: "Taslak", v: "neutral" },
  HAZIR: { t: "Hazır", v: "ok" },
  LISTELENDI: { t: "Listelendi", v: "info" },
  REDDEDILDI: { t: "Reddedildi", v: "danger" },
};

function puanRengi(p: number) {
  if (p >= PUAN_ESIGI) return "text-[var(--ok)]";
  if (p >= 60) return "text-[var(--warn)]";
  return "text-[var(--danger)]";
}

export default async function YeniUrunlerPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  await requirePermission(PERMISSIONS.PRODUCTS_UPDATE);
  const { f } = await searchParams;

  const satirlar = await prisma.$queryRaw<Satir[]>`
    select id, sku, kaynak, invoice_ad, ad_tr, marka, kategori, adet, satis_try,
           birim_usd, agirlik_kg, link_1688, durum,
           urun_gorsel, cince_gorsel, info_gorsel, puan, eksikler,
           katalogda_var, katalog_sku, katalog_ad, kutu_kaynak,
           round((kutu_en_cm * kutu_boy_cm * kutu_yuk_cm / 3000.0)::numeric, 1) as desi
      from urun_aday_skor
     order by katalogda_var, puan desc, coalesce(satis_try, 0) * coalesce(adet, 0) desc, sku`;

  // KATALOGDA OLANLAR AYRI TUTULUR: bunlar için yapılacak iş yeni ilan açmak
  // değil, gelen malı mevcut ilana stok olarak eklemek. Hazırlık sayıları
  // bunları içerirse "kaç ilan açılacak" sorusu yanlış cevaplanır.
  const mevcut = satirlar.filter((s) => s.katalogda_var);
  const yeniler = satirlar.filter((s) => !s.katalogda_var);

  const hazir = yeniler.filter((s) => s.puan >= PUAN_ESIGI);
  const orta = yeniler.filter((s) => s.puan >= 60 && s.puan < PUAN_ESIGI);
  const dusuk = yeniler.filter((s) => s.puan < 60);
  const gorselsiz = yeniler.filter((s) => s.urun_gorsel === 0);
  const cinceli = yeniler.filter((s) => s.cince_gorsel > 0);
  // Trendyol 100'de kesiyor; faturadan üretilen başlıklar 120'ye kadar çıkabildiği
  // için bir kısmı sınırın üstünde kaldı. Elle kısaltılacaklar bu filtrede.
  const uzunBaslik = yeniler.filter((s) => (s.ad_tr?.length ?? 0) > BASLIK_TRENDYOL);
  // Kargo ücreti max(desi, ağırlık) üzerinden kesilir. Tahmini kutu ölçüsü yalnız
  // desi ağırlığı aşan üründe paraya dönüşür — ölçülmesi gereken kalem odur.
  const olculmeli = yeniler.filter(
    (s) => s.kutu_kaynak === "TAHMINI" && n(s.desi) > n(s.agirlik_kg),
  );

  // Potansiyel ciro: bu adayların hepsi listelenirse gelen maldan ne kadar ciro çıkar.
  const potansiyel = yeniler.reduce((a, s) => a + n(s.satis_try) * (s.adet ?? 0), 0);
  const kilitli = yeniler
    .filter((s) => s.puan < PUAN_ESIGI)
    .reduce((a, s) => a + n(s.satis_try) * (s.adet ?? 0), 0);

  const gosterilen =
    f === "hazir"
      ? hazir
      : f === "orta"
        ? orta
        : f === "dusuk"
          ? dusuk
          : f === "gorselsiz"
            ? gorselsiz
            : f === "uzun"
              ? uzunBaslik
              : f === "mevcut"
                ? mevcut
                : yeniler;

  const filtre = (key: string, etiket: string, adet: number) => (
    <Link
      href={key === "hepsi" ? "/admin/yeni-urunler" : `/admin/yeni-urunler?f=${key}`}
      className={`rounded-md border px-2.5 py-1 text-[11px] tabular-nums transition ${
        (f ?? "hepsi") === key
          ? "border-[var(--accent-border)] bg-[var(--accent-dim,var(--surface-2))] text-[var(--accent)]"
          : "border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      }`}
    >
      {etiket} <span className="opacity-70">{adet}</span>
    </Link>
  );

  return (
    <>
      <PageHeader
        icon={PackagePlus}
        title="Yeni Ürünler"
        subtitle="İlan açılacak adaylar. 90 puanın altında ilan oluşturulmaz."
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">{yeniler.length} yeni ürün</Badge>
            {mevcut.length > 0 && <Badge variant="info">{mevcut.length} katalogda var</Badge>}
          </div>
        }
      />

      {/* ── Üst şerit ─────────────────────────────────────────────── */}
      <Card className="mb-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["İlana hazır", `${hazir.length}`, `${PUAN_ESIGI}+ puan`, "ok"],
            ["Eksiği var", `${orta.length}`, "60–89 puan", "warn"],
            ["Başlanmadı", `${dusuk.length}`, "60 puanın altı", "danger"],
            ["Kilitli ciro", fmtTry(kilitli), `toplam ${fmtTry(potansiyel)} potansiyelin içinde`, "warn"],
          ].map(([b, d, alt, renk]) => (
            <div key={b} className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-4">
              <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">{b}</p>
              <p
                className={`mt-1.5 text-[20px] font-semibold tabular-nums ${
                  renk === "ok" ? "text-[var(--ok)]" : renk === "warn" ? "text-[var(--warn)]" : "text-[var(--danger)]"
                }`}
              >
                {d}
              </p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">{alt}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {mevcut.length > 0 && (
            <p className="flex items-start gap-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-3 py-2 text-[11px] leading-snug text-[var(--text-secondary)]">
              <PackageCheck size={13} className="mt-px shrink-0" />
              <span>
                Konteynerdeki {mevcut.length} kalem <strong>katalogda zaten var</strong> (
                {fmtNum(mevcut.reduce((a, s) => a + (s.adet ?? 0), 0))} adet). Bunlara yeni ilan
                açılmaz — gelen mal mevcut ilanın stoğudur. Hazırlık sayıları bu {mevcut.length}{" "}
                kalemi içermiyor; &laquo;Katalogda var&raquo; filtresinden görebilirsiniz.
              </span>
            </p>
          )}
          {gorselsiz.length > 0 && (
            <p className="flex items-start gap-2 rounded-md border border-[var(--danger-border)] bg-[var(--danger-dim)] px-3 py-2 text-[11px] leading-snug text-[var(--danger)]">
              <TriangleAlert size={13} className="mt-px shrink-0" />
              <span>
                {gorselsiz.length} üründe hiç ürün görseli yok. Görselsiz ilan açılamaz — bu tek
                başına {fmtTry(gorselsiz.reduce((a, s) => a + n(s.satis_try) * (s.adet ?? 0), 0))}{" "}
                ciroyu bekletiyor.
              </span>
            </p>
          )}
          {olculmeli.length > 0 && (
            <p className="flex items-start gap-2 rounded-md border border-[var(--warn-border)] bg-[var(--warn-dim)] px-3 py-2 text-[11px] leading-snug text-[var(--warn)]">
              <TriangleAlert size={13} className="mt-px shrink-0" />
              <span>
                {olculmeli.length} üründe kutu ölçüsü <strong>tahmini</strong> ve desi
                ağırlığı aşıyor — kargo ücretini desi belirlediği için bu tahmin doğrudan
                faturaya dönüyor. İlan açmadan önce ölçün. (Diğer tahminlerde ağırlık
                belirleyici, bedeli yok.)
              </span>
            </p>
          )}
          {uzunBaslik.length > 0 && (
            <p className="flex items-start gap-2 rounded-md border border-[var(--warn-border)] bg-[var(--warn-dim)] px-3 py-2 text-[11px] leading-snug text-[var(--warn)]">
              <TriangleAlert size={13} className="mt-px shrink-0" />
              <span>
                {uzunBaslik.length} başlık {BASLIK_TRENDYOL} karakteri aşıyor — Trendyol bu sınırda
                kesiyor. En uzunu{" "}
                {Math.max(...uzunBaslik.map((s) => s.ad_tr?.length ?? 0))} karakter. Ürün sayfasındaki
                sayaç kısaltırken kaç karakter fazla olduğunu yazıyor.
              </span>
            </p>
          )}
          {cinceli.length > 0 && (
            <p className="flex items-start gap-2 rounded-md border border-[var(--warn-border)] bg-[var(--warn-dim)] px-3 py-2 text-[11px] leading-snug text-[var(--warn)]">
              <TriangleAlert size={13} className="mt-px shrink-0" />
              <span>
                {cinceli.length} üründe Çince bilgi görseli yüklü. Bunlar ilana{" "}
                <strong>girmiyor</strong> — referans olarak duruyorlar. Aynı bilgiyi Türkçe
                görsele çevirmek için ürün sayfasındaki ChatGPT promptunu kullanın.
              </span>
            </p>
          )}
        </div>
      </Card>

      {/* ── Filtre ────────────────────────────────────────────────── */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {filtre("hepsi", "Yeni ürünler", yeniler.length)}
        {filtre("mevcut", "Katalogda var", mevcut.length)}
        {filtre("hazir", "İlana hazır", hazir.length)}
        {filtre("orta", "Eksiği var", orta.length)}
        {filtre("dusuk", "Başlanmadı", dusuk.length)}
        {filtre("gorselsiz", "Görselsiz", gorselsiz.length)}
        {filtre("uzun", "Başlık 100+ karakter", uzunBaslik.length)}
      </div>

      {/* ── Tablo ─────────────────────────────────────────────────── */}
      <Card className="p-5">
        <CfoTable
          empty={gosterilen.length === 0 ? "Bu filtrede ürün yok." : undefined}
          head={
            <tr>
              <Th right>Puan</Th>
              <Th>Ürün</Th>
              <Th right>Gelen</Th>
              <Th right>Fiyat</Th>
              <Th right>Görsel</Th>
              <Th>Eksikler</Th>
              <Th>Durum</Th>
            </tr>
          }
        >
          {gosterilen.map((s) => {
            const d = DURUM_ETIKET[s.durum] ?? { t: s.durum, v: "neutral" as const };
            return (
              <tr key={s.id}>
                <Td right>
                  {/* Katalogdaki ürünün hazırlık puanı anlamsız — ilan zaten açık. */}
                  {s.katalogda_var ? (
                    <span className="text-[13px] text-[var(--text-muted)]">—</span>
                  ) : (
                    <span className={`text-[15px] font-semibold tabular-nums ${puanRengi(s.puan)}`}>
                      {s.puan}
                    </span>
                  )}
                </Td>
                <Td>
                  <Link
                    href={`/admin/yeni-urunler/${encodeURIComponent(s.sku)}`}
                    className="font-medium text-[var(--text-primary)] hover:text-[var(--accent)]"
                  >
                    {s.ad_tr ?? s.invoice_ad ?? s.sku}
                  </Link>
                  <p className="mt-0.5 font-mono text-[11px] text-[var(--text-muted)]">
                    {s.sku}
                    {!s.ad_tr && s.invoice_ad ? " · Türkçe adı yok" : ""}
                    {s.link_1688 ? " · 1688 linki var" : ""}
                    {s.ad_tr && (
                      <span
                        className={
                          s.ad_tr.length > BASLIK_TRENDYOL ? "text-[var(--danger)]" : undefined
                        }
                      >
                        {" · "}
                        {s.ad_tr.length} krk
                        {s.ad_tr.length > BASLIK_TRENDYOL
                          ? ` (${s.ad_tr.length - BASLIK_TRENDYOL} fazla)`
                          : ""}
                      </span>
                    )}
                  </p>
                </Td>
                <Td right muted>{fmtNum(s.adet ?? 0)}</Td>
                <Td right>{n(s.satis_try) > 0 ? fmtTry(n(s.satis_try)) : "—"}</Td>
                <Td right>
                  <span className={s.urun_gorsel === 0 ? "text-[var(--danger)]" : ""}>
                    {s.urun_gorsel}
                  </span>
                  {s.cince_gorsel > 0 && (
                    <span className="text-[var(--text-muted)]"> +{s.cince_gorsel}🇨🇳</span>
                  )}
                </Td>
                <Td muted>
                  {s.katalogda_var ? (
                    <span className="text-[11px] leading-snug">
                      Katalog: <span className="font-mono">{s.katalog_sku}</span>
                      {s.katalog_ad ? ` · ${s.katalog_ad.slice(0, 40)}` : ""}
                    </span>
                  ) : (
                    <span className="text-[11px] leading-snug">
                      {(s.eksikler ?? []).slice(0, 3).join(" · ") || "—"}
                      {(s.eksikler ?? []).length > 3 ? ` +${(s.eksikler ?? []).length - 3}` : ""}
                    </span>
                  )}
                </Td>
                <Td>
                  {s.katalogda_var ? (
                    <Badge variant="info">Katalogda var</Badge>
                  ) : (
                    <Badge variant={d.v}>{d.t}</Badge>
                  )}
                </Td>
              </tr>
            );
          })}
        </CfoTable>

        <p className="mt-4 text-[11px] leading-relaxed text-[var(--text-muted)]">
          Puan 100 üzerinden: Türkçe ad 12 · marka 5 · kategori 9 · açıklama 15 · ürün görseli 17 ·
          3+ görsel 10 · fiyat 10 · maliyet+ağırlık 10 · kutu ölçüsü 6 · menşei+garanti 6.
          Barkod puanlanmıyor — hiçbir üründe yok, kimsenin sağlayamadığı şart herkesi eşit
          bloke eder. O 8 puan görsel ve açıklamaya dağıtıldı.{" "}
          <Link href="/cfo/kazananlar#ithalat" className="text-[var(--accent)] hover:underline">
            Yoldaki parti <ArrowRight size={11} className="inline" />
          </Link>
        </p>
      </Card>
    </>
  );
}
