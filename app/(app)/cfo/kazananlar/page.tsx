/**
 * CFO / Ayın Kazananları — kârı hangi ürün getirdi?
 *
 * Kaynak `cfo_ay_kazanan`: ay kapanınca DONDURULAN tablo. Dondurulmasının sebebi
 * `Product.unitCostTry`'nin bugünkü maliyet olması — geçmiş ayın kârını bugünkü
 * maliyetle hesaplarsan rakam her ay değişir ve geçmiş sabit kalmaz.
 *
 * Sayfa hesap yapmaz, dondurulmuş satırı gösterir. Ama üç şeyi ısrarla görünür kılar,
 * çünkü rakamın kendisi kadar rakamın ne kadar sağlam olduğu da karar değiştirir:
 *
 *   • KAPSAM — maliyeti bilinmeyen ürün hesaba girmiyor. %85'in altında ay
 *     "kâr arttı" demeye yetmez; ölçüm iyileşmiş de olabilir.
 *   • ORAN GÜVENİ — kanalın net tahsilat oranı ölçülmediyse (Pazarama, Temu)
 *     o satırın kârı varsayıma dayanır. Satır bazında rozetle duruyor.
 *   • TOP-10 DIŞI — payı %100'ü aşan ayda ilk 10 dışındaki ürünler zarar yazmıştır.
 *     Bu kendi başına bir bulgudur, dipnot değil.
 */
import Link from "next/link";
import { Trophy, ArrowRight, TriangleAlert } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fmtTry, fmtNum } from "@/lib/cfo/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CfoTable, Th, Td } from "@/components/cfo/data-table";
import {
  ImportOrderSection,
  type OneriSatiri,
  type OneriOzeti,
  type CiroHedefi,
} from "./import-order";
import { QaRow, type PanelSorusu, type PanelKarari } from "@/components/cfo/row-qa-panel";
import {
  loadRowQa,
  ithalatSorulari,
  kazananSorulari,
  birlestir,
  anahtar,
} from "@/lib/cfo/row-qa";

export const dynamic = "force-dynamic";

type Ozet = {
  ay_str: string;
  ay: Date;
  ay_toplam_kar: unknown;
  kapsam_pct: unknown;
  top10_kar: unknown;
  top10_payi_pct: unknown;
  birinci: string | null;
  birinci_kar: unknown;
  dondurulma: Date | null;
  maliyet_kaynagi: string | null;
  guven: string | null;
};

type Satir = {
  sira: number;
  sku: string | null;
  ad: string | null;
  category: string | null;
  adet: unknown;
  brut_ciro: unknown;
  kargo_pct: unknown;
  net_kar: unknown;
  marj_pct: unknown;
  kar_payi_pct: unknown;
  oran_guveni: string | null;
  kanal_sayisi: number | null;
  siparis_satiri: number | null;
};

const n = (v: unknown) => (v == null ? 0 : Number(v));

const GUVEN_VARIANT: Record<string, "ok" | "warn" | "danger"> = {
  YUKSEK: "ok",
  ORTA: "warn",
  DUSUK: "danger",
};
const GUVEN_LABEL: Record<string, string> = {
  YUKSEK: "Yüksek güven",
  ORTA: "Orta güven",
  DUSUK: "Düşük güven",
};

export default async function CfoWinnersPage({
  searchParams,
}: {
  searchParams: Promise<{ ay?: string }>;
}) {
  await requirePermission(PERMISSIONS.CFO_READ);

  const { ay } = await searchParams;

  const aylar = await prisma.$queryRaw<Ozet[]>`
    select ay_str, ay, ay_toplam_kar, kapsam_pct, top10_kar, top10_payi_pct,
           birinci, birinci_kar, dondurulma, maliyet_kaynagi, guven
      from cfo_ay_kazanan_ozet order by ay desc`;

  if (aylar.length === 0) {
    return (
      <>
        <PageHeader icon={Trophy} title="Ayın Kazananları" subtitle="Kârı hangi ürün getirdi?" />
        <Card className="p-8">
          <p className="text-center text-sm text-[var(--text-muted)]">
            Henüz dondurulmuş ay yok. Ay kapanışında{" "}
            <code>cfo_ay_kazanan_yaz()</code> çalıştığında burada görünür.
          </p>
        </Card>
      </>
    );
  }

  const secili = aylar.find((a) => a.ay_str === ay) ?? aylar[0];

  // Kazanan listesi ile ithalat önerisi aynı ekranda: kârı getiren ürünün stoğu
  // bitiyorsa kazanan liste bir sonraki ay küçülür. Üç sorgu da salt-okunur view.
  const [satirlar, oneriOzet, oneriSatir, ciroHedef, dusukKanal] = await Promise.all([
    prisma.$queryRaw<Satir[]>`
      select sira, sku, ad, category, adet, brut_ciro, kargo_pct, net_kar, marj_pct,
             kar_payi_pct, oran_guveni, kanal_sayisi, siparis_satiri
        from cfo_ay_kazanan where ay = ${secili.ay} order by sira`,
    prisma.$queryRaw<OneriOzeti[]>`select * from cfo_ithalat_oneri_ozet order by mod`,
    prisma.$queryRaw<OneriSatiri[]>`select * from cfo_ithalat_oneri order by mod, sira`,
    prisma.$queryRaw<CiroHedefi[]>`select * from cfo_ciro_hedef`,
    // Hangi ürün, oranı ÖLÇÜLMEMİŞ hangi kanalda satmış? Soru bunu adıyla sorabilsin diye.
    // Kanal bilgisi satır düzeyinde `cfo_satis_birim`de; `cfo_aylik_urun_kar` ürün×ay
    // düzeyinde toplandığı için orada kanal ADI yok (yalnız kanal_sayisi var).
    prisma.$queryRaw<{ sku: string; kanallar: string[] }[]>`
      select p.sku, array_agg(distinct s.channel order by s.channel) as kanallar
        from cfo_satis_birim s
        join "Product" p on p.id = s."productId"
        join cfo_kanal_net_oran o on o.channel = s.channel
       where date_trunc('month', s."orderDate") = ${secili.ay} and o.guven = 'DUSUK'
       group by p.sku`,
  ]);

  // ── Satır bazında soru-cevap ────────────────────────────────────
  // İki ekran da aynı depoyu kullanıyor: cevaplar cfo_question'a düşüyor,
  // oradan hem /cfo/sorular hem Cowork'teki CFO ajanı okuyor.
  const ithalatAnahtarlari = oneriSatir.map((s) => anahtar(s.mod, s.sku));
  const kazananAnahtarlari = satirlar.filter((s) => s.sku).map((s) => anahtar(secili.ay_str, s.sku!));

  const [ithalatQa, kazananQa] = await Promise.all([
    loadRowQa("ITHALAT_SATIRI", ithalatAnahtarlari),
    loadRowQa("KAZANAN_SATIRI", kazananAnahtarlari),
  ]);

  const ithalatSoru = new Map<string, PanelSorusu[]>();
  for (const r of oneriSatir) {
    const key = anahtar(r.mod, r.sku);
    ithalatSoru.set(key, birlestir(ithalatSorulari(r), ithalatQa.kayitli.get(key)));
  }

  const urunKarar = new Map<string, PanelKarari>();
  for (const [sku, k] of ithalatQa.kararlar) {
    urunKarar.set(sku, {
      karar: k.karar, sebep: k.sebep,
      gecerli_bitis: k.gecerli_bitis, karar_veren: k.karar_veren,
    });
  }

  const kanalMap = new Map(dusukKanal.map((d) => [d.sku, d.kanallar]));
  const kazananSoru = new Map<string, PanelSorusu[]>();
  for (const r of satirlar) {
    if (!r.sku) continue;
    const key = anahtar(secili.ay_str, r.sku);
    kazananSoru.set(
      key,
      birlestir(
        kazananSorulari({
          sku: r.sku, ad: r.ad, oran_guveni: r.oran_guveni,
          ay: secili.ay_str, dusukKanallar: kanalMap.get(r.sku) ?? [],
        }),
        kazananQa.kayitli.get(key),
      ),
    );
  }

  const toplam = n(secili.ay_toplam_kar);
  const top10 = n(secili.top10_kar);
  const kapsam = n(secili.kapsam_pct);
  const disi = toplam - top10;

  // Oran güveni düşük satırların kârdaki ağırlığı: ölçülmemiş kanal oranına dayanan pay.
  const dusukKar = satirlar
    .filter((s) => s.oran_guveni === "DUSUK")
    .reduce((a, s) => a + n(s.net_kar), 0);
  const dusukPay = top10 > 0 ? (dusukKar / top10) * 100 : 0;

  // Kâr negatifse "pay" oranı okunamaz: negatif bir bütünün yüzdesi anlam taşımaz.
  const payOkunur = toplam > 0;

  const kart = (
    baslik: string,
    deger: string,
    alt: string,
    renk?: "danger" | "warn" | "ok",
  ) => (
    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-4">
      <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">{baslik}</p>
      <p
        className={`mt-1.5 text-[20px] font-semibold tabular-nums ${
          renk === "danger"
            ? "text-[var(--danger)]"
            : renk === "warn"
              ? "text-[var(--warn)]"
              : renk === "ok"
                ? "text-[var(--ok)]"
                : "text-[var(--text-primary)]"
        }`}
      >
        {deger}
      </p>
      <p className="mt-1 text-[11px] text-[var(--text-muted)]">{alt}</p>
    </div>
  );

  const uyari = (metin: string, ton: "danger" | "warn") => (
    <p
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-[11px] leading-snug ${
        ton === "danger"
          ? "border-[var(--danger-border)] bg-[var(--danger-dim)] text-[var(--danger)]"
          : "border-[var(--warn-border)] bg-[var(--warn-dim)] text-[var(--warn)]"
      }`}
    >
      <TriangleAlert size={13} className="mt-px shrink-0" />
      <span>{metin}</span>
    </p>
  );

  return (
    <>
      <PageHeader
        icon={Trophy}
        title="Ayın Kazananları"
        subtitle="Kârı hangi ürün getirdi? Ay kapanınca dondurulur, bir daha oynamaz."
      />

      {/* ── Ay seçimi ─────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {aylar.map((a) => {
          const dusuk = n(a.kapsam_pct) < 85;
          const aktif = a.ay_str === secili.ay_str;
          return (
            <Link
              key={a.ay_str}
              href={`/cfo/kazananlar?ay=${a.ay_str}`}
              title={`kapsam %${n(a.kapsam_pct).toFixed(1)}`}
              className={`rounded-md border px-2.5 py-1 text-[11px] tabular-nums transition ${
                aktif
                  ? "border-[var(--accent-border)] bg-[var(--accent-dim,var(--surface-2))] text-[var(--accent)]"
                  : dusuk
                    ? "border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                    : "border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {a.ay_str}
              {dusuk && <span className="ml-1 opacity-60">·</span>}
            </Link>
          );
        })}
      </div>

      {/* ── Üst şerit ─────────────────────────────────────────────── */}
      <Card className="mb-6 p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kart(
            "Ayın toplam kârı",
            fmtTry(toplam),
            secili.ay_str,
            toplam < 0 ? "danger" : "ok",
          )}
          {kart(
            "İlk 10'un kârı",
            fmtTry(top10),
            payOkunur ? `toplamın %${n(secili.top10_payi_pct).toFixed(1)}'i` : "pay okunamaz — toplam negatif",
            payOkunur && n(secili.top10_payi_pct) > 100 ? "warn" : undefined,
          )}
          {kart(
            "Maliyet kapsamı",
            `%${kapsam.toFixed(1)}`,
            kapsam >= 85 ? "ciro bazında, güvenilir" : "maliyeti bilinmeyen ürünler hesap dışı",
            kapsam >= 85 ? "ok" : kapsam >= 60 ? "warn" : "danger",
          )}
          {kart(
            "Ayın birincisi",
            fmtTry(n(secili.birinci_kar)),
            secili.birinci ?? "—",
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {secili.guven && (
            <Badge variant={GUVEN_VARIANT[secili.guven] ?? "neutral"}>
              {GUVEN_LABEL[secili.guven] ?? secili.guven}
            </Badge>
          )}
          {secili.maliyet_kaynagi?.startsWith("GERIYE DONUK") && (
            <Badge variant="warn">Geriye dönük hesaplandı</Badge>
          )}
          <Link href="/cfo" className="ml-auto text-xs text-[var(--accent)] hover:underline">
            CFO kokpiti <ArrowRight size={11} className="inline" />
          </Link>
        </div>

        {/* Rakamın kendisi kadar sağlamlığı da karar değiştirir — uyarılar tabloyla aynı ekranda. */}
        <div className="mt-3 space-y-2">
          {kapsam < 85 &&
            uyari(
              `Maliyet kapsamı %${kapsam.toFixed(1)}. Bu ayın kârı, maliyeti bilinen ürünlerin kârıdır — ` +
                `gerçek toplam bundan farklıdır. Kapsamı farklı aylar birbiriyle KARŞILAŞTIRILAMAZ: ` +
                `rakamın büyümesi kârın değil ölçümün büyümesi olabilir.`,
              kapsam < 60 ? "danger" : "warn",
            )}

          {payOkunur &&
            n(secili.top10_payi_pct) > 100 &&
            uyari(
              `İlk 10'un payı %${n(secili.top10_payi_pct).toFixed(1)} — yani %100'ü aşıyor. ` +
                `Bu, ilk 10 dışındaki ürünlerin toplamda ${fmtTry(Math.abs(disi))} ZARAR yazdığı anlamına gelir. ` +
                `Kazananları kutlamadan önce kaybedenlere bakın.`,
              "danger",
            )}

          {!payOkunur &&
            uyari(
              `Ayın toplam kârı negatif (${fmtTry(toplam)}). Bu durumda "kâr payı" yüzdesi anlam taşımaz; ` +
                `tablodaki pay sütunu gizlendi. İlk 10 ${fmtTry(top10)} kâr yazarken geri kalan ` +
                `${fmtTry(Math.abs(disi))} zarar yazmış.`,
              "danger",
            )}

          {dusukPay >= 40 &&
            uyari(
              `İlk 10'un kârının %${dusukPay.toFixed(0)}'i (${fmtTry(dusukKar)}) net tahsilat oranı ` +
                `ÖLÇÜLMEMİŞ kanallara dayanıyor. O kanalların gerçek kesintisi varsayımdan yüksekse ` +
                `bu kâr olduğundan büyük görünür. Tablodaki "düşük güven" satırlarının sonundaki ` +
                `soru rozetine tıklayıp o kanalın ekstredeki gerçek oranını yazarsanız bu belirsizlik kapanır.`,
              "warn",
            )}
        </div>
      </Card>

      {/* ── Tablo ─────────────────────────────────────────────────── */}
      <Card className="mb-6 p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">
          {secili.ay_str} — kârı getiren ilk 10 ürün
        </h2>
        <p className="mb-4 text-[11px] text-[var(--text-muted)]">
          Net kâra göre sıralı. Kargo sütunu ayrı duruyor çünkü düşük fiyatlı üründe kâr
          orada eriyor — düz kanal oranıyla hesaplanan kâr o ürünlerde %43&apos;e kadar abartılıyordu.
          Satır sonundaki <strong>Bilgi</strong> rozeti, o satır hakkında cevabını bilmediğim
          soruları açar; cevabınız kaydedilir ve hem panel hem CFO aynı yerden okur.
        </p>

        <CfoTable
          empty={satirlar.length === 0 ? "Bu ay için dondurulmuş satır yok." : undefined}
          head={
            <tr>
              <Th>#</Th>
              <Th>Ürün</Th>
              <Th right>Adet</Th>
              <Th right>Ciro</Th>
              <Th right>Kargo</Th>
              <Th right>Net kâr</Th>
              <Th right>Marj</Th>
              {payOkunur && <Th right>Pay</Th>}
              <Th>Oran güveni</Th>
              <Th right>Bilgi</Th>
            </tr>
          }
        >
          {satirlar.map((s) => {
            const kargo = n(s.kargo_pct);
            const kar = n(s.net_kar);
            const key = s.sku ? anahtar(secili.ay_str, s.sku) : "";
            return (
              <QaRow
                key={`${s.sira}-${s.sku}`}
                colSpan={payOkunur ? 9 : 8}
                scope="KAZANAN_SATIRI"
                entityKey={key}
                sku={s.sku ?? ""}
                urunAdi={s.ad ?? s.sku ?? "—"}
                sorular={kazananSoru.get(key) ?? []}
                karar={null}
                kararGoster={false}
              >
                <Td muted>{s.sira}</Td>
                <Td>
                  <p className="font-medium text-[var(--text-primary)]">{s.ad ?? "—"}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-[var(--text-muted)]">
                    {s.sku}
                    {s.kanal_sayisi ? ` · ${s.kanal_sayisi} kanal` : ""}
                    {s.siparis_satiri ? ` · ${fmtNum(s.siparis_satiri)} sipariş` : ""}
                  </p>
                </Td>
                <Td right muted>{fmtNum(n(s.adet))}</Td>
                <Td right>{fmtTry(n(s.brut_ciro))}</Td>
                <Td right danger={kargo >= 20}>
                  %{kargo.toFixed(1)}
                </Td>
                <Td right strong danger={kar < 0}>
                  {fmtTry(kar)}
                </Td>
                <Td right muted>%{n(s.marj_pct).toFixed(1)}</Td>
                {payOkunur && <Td right muted>%{n(s.kar_payi_pct).toFixed(1)}</Td>}
                <Td>
                  <Badge variant={GUVEN_VARIANT[s.oran_guveni ?? ""] ?? "neutral"}>
                    {GUVEN_LABEL[s.oran_guveni ?? ""] ?? s.oran_guveni ?? "—"}
                  </Badge>
                </Td>
              </QaRow>
            );
          })}
        </CfoTable>
      </Card>

      {/* ── İthalat sipariş önerisi ───────────────────────────────── */}
      {/* Diğer sayfalardan kaldırılan listeler buraya bağlanıyor (#ithalat). */}
      <div id="ithalat" className="scroll-mt-20">
        <ImportOrderSection
          ozet={oneriOzet}
          satirlar={oneriSatir}
          hedef={ciroHedef[0] ?? null}
          sorular={ithalatSoru}
          kararlar={urunKarar}
        />
      </div>

      {/* ── Aylık seyir ───────────────────────────────────────────── */}
      <Card className="p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">Aylık seyir</h2>
        <p className="mb-4 text-[11px] text-[var(--text-muted)]">
          Kapsamı %85&apos;in altındaki aylar soluk. Bu aylar diğerleriyle aynı ölçekte değil —
          aradaki büyümenin ne kadarı kâr, ne kadarı ölçüm iyileşmesi ayrılamaz.
        </p>
        <CfoTable
          head={
            <tr>
              <Th>Ay</Th>
              <Th right>Toplam kâr</Th>
              <Th right>İlk 10</Th>
              <Th right>Pay</Th>
              <Th right>Kapsam</Th>
              <Th>Birincisi</Th>
            </tr>
          }
        >
          {aylar.map((a) => {
            const k = n(a.kapsam_pct);
            const t = n(a.ay_toplam_kar);
            const pay = n(a.top10_payi_pct);
            const zayif = k < 85;
            return (
              <tr key={a.ay_str} className={zayif ? "opacity-50" : ""}>
                <Td strong>
                  <Link href={`/cfo/kazananlar?ay=${a.ay_str}`} className="hover:text-[var(--accent)]">
                    {a.ay_str}
                  </Link>
                </Td>
                <Td right strong danger={t < 0}>{fmtTry(t)}</Td>
                <Td right muted>{fmtTry(n(a.top10_kar))}</Td>
                <Td right danger={pay > 100}>
                  {t > 0 ? `%${pay.toFixed(1)}` : "—"}
                </Td>
                <Td right danger={k < 60}>%{k.toFixed(1)}</Td>
                <Td muted>{a.birinci ?? "—"}</Td>
              </tr>
            );
          })}
        </CfoTable>
      </Card>

      <p className="mt-6 text-[11px] leading-relaxed text-[var(--text-muted)]">
        Kaynak: <code>cfo_ay_kazanan</code> — ay kapanışında dondurulan tablo.{" "}
        {secili.maliyet_kaynagi && <>Maliyet kaynağı: {secili.maliyet_kaynagi}. </>}
        Geriye dönük doldurulan aylar bugünkü birim maliyetle hesaplandı; o ayki gerçek alım
        maliyeti farklıysa kâr da farklıdır. Tarihsel maliyet (parti bazlı) kurulana kadar bu
        rakamlar yaklaşıktır.
      </p>
    </>
  );
}
