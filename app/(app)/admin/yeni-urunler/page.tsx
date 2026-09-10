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
import { PackagePlus, ArrowRight, TriangleAlert } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fmtTry, fmtNum } from "@/lib/cfo/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CfoTable, Th, Td } from "@/components/cfo/data-table";
import { PUAN_ESIGI } from "@/lib/urun-aday/sabitler";

export const dynamic = "force-dynamic";

type Satir = {
  id: string;
  sku: string;
  kaynak: string | null;
  invoice_ad: string | null;
  ad_tr: string | null;
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
           urun_gorsel, cince_gorsel, info_gorsel, puan, eksikler
      from urun_aday_skor
     order by puan desc, coalesce(satis_try, 0) * coalesce(adet, 0) desc, sku`;

  const hazir = satirlar.filter((s) => s.puan >= PUAN_ESIGI);
  const orta = satirlar.filter((s) => s.puan >= 60 && s.puan < PUAN_ESIGI);
  const dusuk = satirlar.filter((s) => s.puan < 60);
  const gorselsiz = satirlar.filter((s) => s.urun_gorsel === 0);
  const cinceli = satirlar.filter((s) => s.cince_gorsel > 0);

  // Potansiyel ciro: bu adayların hepsi listelenirse gelen maldan ne kadar ciro çıkar.
  const potansiyel = satirlar.reduce((a, s) => a + n(s.satis_try) * (s.adet ?? 0), 0);
  const kilitli = satirlar
    .filter((s) => s.puan < PUAN_ESIGI)
    .reduce((a, s) => a + n(s.satis_try) * (s.adet ?? 0), 0);

  const gosterilen =
    f === "hazir" ? hazir : f === "orta" ? orta : f === "dusuk" ? dusuk : f === "gorselsiz" ? gorselsiz : satirlar;

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
        meta={<Badge variant="neutral">{satirlar.length} aday</Badge>}
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
        {filtre("hepsi", "Hepsi", satirlar.length)}
        {filtre("hazir", "İlana hazır", hazir.length)}
        {filtre("orta", "Eksiği var", orta.length)}
        {filtre("dusuk", "Başlanmadı", dusuk.length)}
        {filtre("gorselsiz", "Görselsiz", gorselsiz.length)}
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
                  <span className={`text-[15px] font-semibold tabular-nums ${puanRengi(s.puan)}`}>
                    {s.puan}
                  </span>
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
                  <span className="text-[11px] leading-snug">
                    {(s.eksikler ?? []).slice(0, 3).join(" · ") || "—"}
                    {(s.eksikler ?? []).length > 3 ? ` +${(s.eksikler ?? []).length - 3}` : ""}
                  </span>
                </Td>
                <Td>
                  <Badge variant={d.v}>{d.t}</Badge>
                </Td>
              </tr>
            );
          })}
        </CfoTable>

        <p className="mt-4 text-[11px] leading-relaxed text-[var(--text-muted)]">
          Puan 100 üzerinden: Türkçe ad 12 · marka 5 · kategori 8 · açıklama 12 · ürün görseli 15 ·
          3+ görsel 8 · fiyat 10 · maliyet+ağırlık 10 · kutu ölçüsü 6 · barkod 8 · menşei+garanti 6.
          Ağırlıklar &quot;ilanı fiilen ne bloke ediyor&quot;a göre seçildi; görselsiz veya barkodsuz
          ilan hiç açılamıyor.{" "}
          <Link href="/cfo/kazananlar#ithalat" className="text-[var(--accent)] hover:underline">
            Yoldaki parti <ArrowRight size={11} className="inline" />
          </Link>
        </p>
      </Card>
    </>
  );
}
