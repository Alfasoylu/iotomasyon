/**
 * Tek ürün adayı — ilan hazırlık sayfası.
 *
 * Prompt sunucuda üretiliyor (istemcide değil): kural değiştiğinde tek yerden
 * değişsin ve promptun neye dayandığı veritabanındaki değerle aynı kalsın.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { PackagePlus, ArrowLeft, ExternalLink } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fmtNum, fmtUsd } from "@/lib/cfo/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ozellikPromptu, kutuPromptu, promptHazirMi } from "@/lib/urun-aday/prompt";
import { PUAN_ESIGI } from "@/lib/urun-aday/sabitler";
import { AdayEditor, type Aday, type Gorsel } from "./editor";

export const dynamic = "force-dynamic";

const n = (v: unknown) => (v == null ? 0 : Number(v));

const PUAN_KIRILIM: [string, keyof PuanSatiri, number][] = [
  ["Türkçe ad", "p_ad", 12],
  ["Marka", "p_marka", 5],
  ["Kategori", "p_kategori", 8],
  ["Açıklama", "p_aciklama", 12],
  ["Ürün görseli", "p_ana_gorsel", 15],
  ["3+ görsel", "p_gorsel3", 8],
  ["Satış fiyatı", "p_fiyat", 10],
  ["Maliyet + ağırlık", "p_maliyet", 10],
  ["Kutu ölçüsü", "p_kutu", 6],
  ["Barkod", "p_barkod", 8],
  ["Menşei + garanti", "p_mensei", 6],
];

type PuanSatiri = Aday & {
  p_ad: number; p_marka: number; p_kategori: number; p_aciklama: number;
  p_ana_gorsel: number; p_gorsel3: number; p_fiyat: number; p_maliyet: number;
  p_kutu: number; p_barkod: number; p_mensei: number;
  urun_gorsel: number; cince_gorsel: number; info_gorsel: number;
};

export default async function AdayPage({ params }: { params: Promise<{ sku: string }> }) {
  await requirePermission(PERMISSIONS.PRODUCTS_UPDATE);
  const { sku } = await params;
  const cozulmus = decodeURIComponent(sku);

  const [aday] = await prisma.$queryRaw<PuanSatiri[]>`
    select * from urun_aday_skor where sku = ${cozulmus}`;
  if (!aday) notFound();

  // Tek `sira` sütununa göre — tür bazlı ikinci bir sıralama uygulasaydık
  // kullanıcının seçtiği ana görsel ekranda başka yere düşerdi.
  const gorseller = await prisma.$queryRaw<Gorsel[]>`
    select id, url, tur, sira, dosya_adi
      from urun_aday_gorsel where aday_id = ${aday.id}
     order by sira, id`;

  const girdi = {
    sku: aday.sku,
    ad: aday.ad_tr ?? aday.invoice_ad ?? aday.sku,
    marka: aday.marka,
    kategori: aday.kategori,
    aciklama: aday.aciklama,
    ozellikler: null,
    kutuEn: aday.kutu_en_cm == null ? null : n(aday.kutu_en_cm),
    kutuBoy: aday.kutu_boy_cm == null ? null : n(aday.kutu_boy_cm),
    kutuYuk: aday.kutu_yuk_cm == null ? null : n(aday.kutu_yuk_cm),
    agirlikKg: aday.agirlik_kg == null ? null : n(aday.agirlik_kg),
    mensei: aday.mensei,
    garantiAy: aday.garanti_ay,
  };
  const hazir = promptHazirMi(girdi);

  const marj =
    n(aday.satis_try) > 0 && n(aday.gumruklu_usd) > 0
      ? ((n(aday.satis_try) * 0.8 - n(aday.kargo_try) - n(aday.gumruklu_usd) * 48.5) /
          (n(aday.satis_try) * 0.8)) * 100
      : null;

  return (
    <>
      <PageHeader
        icon={PackagePlus}
        title={aday.ad_tr ?? aday.invoice_ad ?? aday.sku}
        subtitle={`${aday.sku}${aday.kaynak ? ` · ${aday.kaynak} partisi` : ""}`}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={aday.puan >= PUAN_ESIGI ? "ok" : aday.puan >= 60 ? "warn" : "danger"}>
              {aday.puan}/100
            </Badge>
            <Badge variant="neutral">{aday.durum}</Badge>
          </div>
        }
        actions={
          <Link href="/admin/yeni-urunler" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border-default)] px-3 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            <ArrowLeft size={12} /> Listeye dön
          </Link>
        }
      />

      {/* ── Puan kırılımı + gelen mal ─────────────────────────────── */}
      <Card className="mb-4 p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
          Puan kırılımı — {aday.puan}/100
        </h2>
        <div className="mb-4 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {PUAN_KIRILIM.map(([etiket, alan, tam]) => {
            const alinan = Number(aday[alan] ?? 0);
            const tamMi = alinan >= tam;
            return (
              <div
                key={etiket}
                className="flex items-center justify-between gap-2 rounded border border-[var(--border-subtle)] px-2.5 py-1.5"
              >
                <span className="text-[11px] text-[var(--text-secondary)]">{etiket}</span>
                <span
                  className={`text-[11px] font-medium tabular-nums ${
                    tamMi ? "text-[var(--ok)]" : alinan > 0 ? "text-[var(--warn)]" : "text-[var(--danger)]"
                  }`}
                >
                  {alinan}/{tam}
                </span>
              </div>
            );
          })}
        </div>

        <div className="grid gap-3 text-[12px] sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Gelen adet</p>
            <p className="mt-0.5 font-medium tabular-nums text-[var(--text-primary)]">
              {fmtNum(aday.adet ?? 0)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Alış</p>
            <p className="mt-0.5 font-medium tabular-nums text-[var(--text-primary)]">
              {n(aday.alis_rmb) > 0 ? `${n(aday.alis_rmb)} RMB` : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Gümrüklü maliyet</p>
            <p className="mt-0.5 font-medium tabular-nums text-[var(--text-primary)]">
              {n(aday.gumruklu_usd) > 0 ? fmtUsd(n(aday.gumruklu_usd)) : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Ağırlık</p>
            <p className="mt-0.5 font-medium tabular-nums text-[var(--text-primary)]">
              {n(aday.agirlik_kg) > 0 ? `${n(aday.agirlik_kg)} kg` : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Tahmini marj</p>
            <p
              className={`mt-0.5 font-medium tabular-nums ${
                marj == null ? "text-[var(--text-muted)]" : marj < 15 ? "text-[var(--danger)]" : "text-[var(--text-primary)]"
              }`}
            >
              {marj == null ? "—" : `%${marj.toFixed(1)}`}
            </p>
          </div>
        </div>

        {marj != null && marj < 15 && (
          <p className="mt-3 rounded-md border border-[var(--danger-border)] bg-[var(--danger-dim)] px-3 py-2 text-[11px] leading-snug text-[var(--danger)]">
            Tahmini marj %{marj.toFixed(1)} — komisyon %20 ve kargo düşüldükten sonra. Bu fiyatla
            ilan açmak zarar yazabilir; fiyatı gözden geçirin. (Kur 48,50 varsayıldı.)
          </p>
        )}

        {aday.link_1688 && (
          <a
            href={aday.link_1688}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-[var(--accent)] hover:underline"
          >
            1688 ürün sayfası <ExternalLink size={11} />
          </a>
        )}
        {aday.invoice_ad && (
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">
            Faturadaki ad: <span className="font-mono">{aday.invoice_ad}</span>
          </p>
        )}
      </Card>

      <AdayEditor
        aday={aday}
        gorseller={gorseller}
        ozellikPrompt={hazir.hazir ? ozellikPromptu(girdi) : null}
        kutuPrompt={hazir.hazir ? kutuPromptu(girdi, []) : null}
        promptEksik={hazir.eksik}
      />
    </>
  );
}
