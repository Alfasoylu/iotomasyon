/**
 * Kokpitin servet bloğu — `cfo_servet` görünümünden.
 *
 * Üç şey rakamın yanında duruyor, çünkü tek başına tutar karar verdirmiyor:
 *
 *   • GÜVEN — her satır kendi güven etiketiyle geliyor. Servetin en büyük kalemi
 *     (stok) ORTA güvende: gerçekleşen satış fiyatına dayanıyor ama fiyat da hız da
 *     değişebilir. Bunu saklamak, az önce düzeltilen hatanın aynısını yapmak olur.
 *   • LİKİDİTE — servet "param var" demek değil. Stok değerinin yarısından fazlası
 *     bir yıldan uzun sürede eriyor; bu manşetten okunamıyor, ayrı tablo gerekiyor.
 *   • YOĞUNLAŞMA — tek bir SKU servetin üçte birini tutuyorsa bu bir servet değil,
 *     bir bahis. İlk 5 kalem ve payları görünür duruyor.
 *
 * Sayfa hesap yapmaz; view'in verdiğini basar ve neyin ne kadar sağlam olduğunu yazar.
 */
import Link from "next/link";
import { Target, TriangleAlert, Scale, Layers, ArrowRight } from "lucide-react";
import { fmtTry, fmtUsd, fmtNum } from "@/lib/cfo/format";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CfoTable, Th, Td } from "@/components/cfo/data-table";
import {
  DILIM_ETIKET,
  type ServetVerisi,
} from "@/lib/cfo/wealth";

const n = (v: unknown) => (v == null ? 0 : Number(v));

const GUVEN: Record<string, { v: "ok" | "warn" | "danger"; t: string }> = {
  YUKSEK: { v: "ok", t: "Yüksek" },
  ORTA: { v: "warn", t: "Orta" },
  DUSUK: { v: "danger", t: "Düşük" },
};

function Uyari({ ton, children }: { ton: "danger" | "warn"; children: React.ReactNode }) {
  const cls =
    ton === "danger"
      ? "border-[var(--danger-border)] bg-[var(--danger-dim)] text-[var(--danger)]"
      : "border-[var(--warn-border)] bg-[var(--warn-dim)] text-[var(--warn)]";
  return (
    <p className={`flex items-start gap-2 rounded-md border px-3 py-2 text-[11px] leading-snug ${cls}`}>
      <TriangleAlert size={13} className="mt-px shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function WealthSection({
  veri,
  hedefUsd,
}: {
  veri: ServetVerisi;
  hedefUsd: number | null;
}) {
  const { ozet, kalemler, likidite, yogunlasma } = veri;

  if (!ozet) {
    return (
      <Card className="mb-6 p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <Scale size={15} /> Servet
        </h2>
        <p className="text-[12px] text-[var(--text-muted)]">
          <code>cfo_servet</code> görünümü boş döndü. Stok değerlemesi kurulmadan servet
          hesaplanamaz.
        </p>
      </Card>
    );
  }

  const servetTry = n(ozet.servet_try);
  const servetUsd = n(ozet.servet_usd);
  const varlik = n(ozet.varlik);
  const borc = n(ozet.borc);
  const riskli = n(ozet.riskli_haric_tutulan);

  const stokNrv = n(kalemler.find((k) => k.kalem.startsWith("Stok — net"))?.tutar);
  const stokMaliyet = n(kalemler.find((k) => k.kalem.startsWith("Stok — satis") || k.kalem.startsWith("Stok — satış"))?.tutar);
  const stokToplam = stokNrv + stokMaliyet;

  // Likidite: bir yıl içinde nakde dönmeyen kısım servetin ne kadarı?
  const nakde1y = likidite.reduce((a, d) => a + n(d.bir_yilda_nakde_donen), 0);
  const stokDegeri = likidite.reduce((a, d) => a + n(d.net_deger), 0);
  const donmeyen = stokDegeri - nakde1y;
  const donmeyenPay = stokDegeri > 0 ? (donmeyen / stokDegeri) * 100 : 0;

  // Yoğunlaşma: en büyük tek kalem stok değerinin yüzde kaçı?
  const enBuyuk = yogunlasma[0];
  const enBuyukPay = enBuyuk && stokToplam > 0 ? (n(enBuyuk.net_deger) / stokToplam) * 100 : 0;

  const hedefKalan = hedefUsd != null ? hedefUsd - servetUsd : null;
  const ay = veri.hedefAyKalan;
  const gerekenAylik = hedefKalan != null && ay != null && ay > 0 ? hedefKalan / ay : null;
  const ilerleme = hedefUsd != null && hedefUsd > 0 ? servetUsd / hedefUsd : 0;

  return (
    <Card className="mb-6 p-5">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Scale size={15} className="text-[var(--accent)]" />
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Servet</h2>
        <Badge variant="neutral">varlık − borç</Badge>
        <Link href="/cfo/ayarlar" className="ml-auto text-xs text-[var(--accent)] hover:underline">
          Kalemlerin kaynağı <ArrowRight size={11} className="inline" />
        </Link>
      </div>
      <p className="mb-4 text-[11px] leading-snug text-[var(--text-muted)]">
        Stok, elle girilen bir sabit değil: her SKU&apos;nun son 90 günde{" "}
        <strong>gerçekleşen</strong> satış fiyatından komisyon, hizmet, reklam ve kargo
        düşülerek bulunan <strong>net gerçekleşebilir değer</strong>. Yani &quot;satarsam
        elime ne geçer&quot;.
      </p>

      {/* ── Manşet ─────────────────────────────────────────────────── */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-4">
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Servet</p>
          <p className="mt-1 text-[22px] font-semibold tabular-nums text-[var(--text-primary)]">
            {fmtUsd(servetUsd)}
          </p>
          <p className="text-[11px] text-[var(--text-muted)]">{fmtTry(servetTry)}</p>
        </div>
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-4">
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Varlık</p>
          <p className="mt-1 text-[18px] font-semibold tabular-nums text-[var(--ok)]">{fmtTry(varlik)}</p>
          <p className="text-[11px] text-[var(--text-muted)]">nakit + alacak + stok + yoldaki</p>
        </div>
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-4">
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Borç</p>
          <p className="mt-1 text-[18px] font-semibold tabular-nums text-[var(--danger)]">{fmtTry(borc)}</p>
          <p className="text-[11px] text-[var(--text-muted)]">kredi + kart + ödenmemiş gümrük</p>
        </div>
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-4">
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
            1 yılda nakde dönen
          </p>
          <p className="mt-1 text-[18px] font-semibold tabular-nums text-[var(--text-primary)]">
            {fmtTry(nakde1y)}
          </p>
          <p className="text-[11px] text-[var(--text-muted)]">
            stok değerinin %{(100 - donmeyenPay).toFixed(0)}&apos;i
          </p>
        </div>
      </div>

      {/* ── Hedef ──────────────────────────────────────────────────── */}
      {hedefUsd != null && (
        <div className="mb-4 rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-4">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
              <Target size={13} /> Servet hedefi
            </span>
            <span className="text-[15px] font-semibold tabular-nums text-[var(--text-primary)]">
              {fmtUsd(hedefUsd)}
            </span>
            <span className="text-[12px] text-[var(--text-muted)]">
              kalan {fmtUsd(hedefKalan ?? 0)}
              {ay != null && ` · ${ay.toFixed(1)} ay`}
              {gerekenAylik != null && ` · aylık ${fmtUsd(gerekenAylik)} gerekiyor`}
            </span>
            <span className="ml-auto text-[12px] tabular-nums text-[var(--text-secondary)]">
              %{(ilerleme * 100).toFixed(1)}
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
            <div
              className="h-full rounded-full bg-[var(--accent)]"
              style={{ width: `${Math.max(0, Math.min(100, ilerleme * 100))}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Uyarılar ───────────────────────────────────────────────── */}
      <div className="mb-4 space-y-2">
        {donmeyenPay >= 30 && (
          <Uyari ton="danger">
            Stok değerinin %{donmeyenPay.toFixed(0)}&apos;i ({fmtTry(donmeyen)}) bir yıl içinde
            nakde dönmüyor. Servet rakamı doğru ama <strong>likit değil</strong> — bu parayla
            bugün ödeme yapılamaz. Nakit kapısı kapalıyken servetin büyük görünmesi bu yüzden
            yanıltıcı.
          </Uyari>
        )}

        {enBuyuk && enBuyukPay >= 20 && (
          <Uyari ton="danger">
            Tek bir üründe yoğunlaşma: <strong>{enBuyuk.name ?? enBuyuk.sku}</strong> —{" "}
            {fmtNum(enBuyuk.stok)} adet, {fmtTry(n(enBuyuk.net_deger))}, stok değerinin %
            {enBuyukPay.toFixed(0)}&apos;i
            {enBuyuk.ortu_gun != null &&
              `, mevcut hızda ${fmtNum(Math.round(n(enBuyuk.ortu_gun)))} gün (${(n(enBuyuk.ortu_gun) / 365).toFixed(1)} yıl) yeter`}
            . Bu bir servet kalemi değil, tek ürüne yapılmış bir bahis.
          </Uyari>
        )}

        {stokMaliyet > 0 && (
          <Uyari ton="warn">
            {fmtTry(stokMaliyet)}&apos;lik stok, 90 günde <strong>hiç satmamış</strong> ürünlerde
            ve satış kanıtı olmadığı için maliyetle değerlendi — yani bu satırın gerçekten
            elden çıkarılabileceğinin kanıtı yok. Satılamazsa servet bu kadar düşer.
          </Uyari>
        )}

        {riskli > 0 && (
          <Uyari ton="warn">
            Romanya 1. partisi ({fmtTry(riskli)}) manşete <strong>dâhil değil</strong>: hukuki
            mülkiyet başkasında, müsadere riski var ve ardiye işliyor. Süreç lehe sonuçlanırsa
            servet {fmtUsd(n(ozet.servet_riskli_dahil) / n(ozet.kur))} olur.
          </Uyari>
        )}
      </div>

      {/* ── Kalemler ───────────────────────────────────────────────── */}
      <h3 className="mb-2 text-[13px] font-semibold text-[var(--text-primary)]">
        Servet nasıl oluşuyor
      </h3>
      <CfoTable
        head={
          <tr>
            <Th>Kalem</Th>
            <Th right>Tutar</Th>
            <Th>Güven</Th>
            <Th>Kaynak</Th>
          </tr>
        }
      >
        {kalemler.map((k) => {
          const tutar = n(k.tutar);
          const g = GUVEN[k.guven ?? ""] ?? { v: "warn" as const, t: k.guven ?? "—" };
          return (
            <tr key={k.sira} className={k.tur === "RISKLI" ? "opacity-60" : ""}>
              <Td strong>
                {k.kalem}
                {k.tur === "RISKLI" && (
                  <Badge variant="neutral" className="ml-2">
                    manşet dışı
                  </Badge>
                )}
              </Td>
              <Td right strong danger={tutar < 0}>
                {fmtTry(tutar)}
              </Td>
              <Td>
                <Badge variant={g.v}>{g.t}</Badge>
              </Td>
              <Td muted>{k.kaynak}</Td>
            </tr>
          );
        })}
      </CfoTable>

      {/* ── Likidite ───────────────────────────────────────────────── */}
      <h3 className="mb-2 mt-6 flex items-center gap-2 text-[13px] font-semibold text-[var(--text-primary)]">
        <Layers size={14} className="text-[var(--text-secondary)]" />
        Stok ne kadar sürede nakde döner
      </h3>
      <p className="mb-2 text-[11px] text-[var(--text-muted)]">
        Örtü süresi = mevcut satış hızıyla stoğun kaç günde biteceği. &quot;1 yılda nakde
        dönen&quot; sütunu, 12 ay+ diliminde yalnız bir yıllık satışa denk gelen kısmı sayar.
      </p>
      <CfoTable
        head={
          <tr>
            <Th>Örtü süresi</Th>
            <Th right>Ürün</Th>
            <Th right>Adet</Th>
            <Th right>Net değer</Th>
            <Th right>1 yılda nakde dönen</Th>
          </tr>
        }
      >
        {likidite.map((d) => {
          const deger = n(d.net_deger);
          const nakde = n(d.bir_yilda_nakde_donen);
          const gec = d.dilim.startsWith("3_") || d.dilim.startsWith("4_");
          return (
            <tr key={d.dilim} className={gec ? "opacity-80" : ""}>
              <Td strong>{DILIM_ETIKET[d.dilim] ?? d.dilim}</Td>
              <Td right muted>{fmtNum(d.urun)}</Td>
              <Td right muted>{fmtNum(d.adet)}</Td>
              <Td right strong>{fmtTry(deger)}</Td>
              <Td right danger={nakde < deger}>{fmtTry(nakde)}</Td>
            </tr>
          );
        })}
      </CfoTable>

      {/* ── Yoğunlaşma ─────────────────────────────────────────────── */}
      <h3 className="mb-2 mt-6 text-[13px] font-semibold text-[var(--text-primary)]">
        Servetin en çok kilitlendiği 5 ürün
      </h3>
      <CfoTable
        head={
          <tr>
            <Th>Ürün</Th>
            <Th right>Adet</Th>
            <Th right>Net değer</Th>
            <Th right>Stok payı</Th>
            <Th right>Örtü süresi</Th>
          </tr>
        }
      >
        {yogunlasma.map((y) => {
          const deger = n(y.net_deger);
          const pay = stokToplam > 0 ? (deger / stokToplam) * 100 : 0;
          const gun = y.ortu_gun == null ? null : Math.round(n(y.ortu_gun));
          return (
            <tr key={y.sku}>
              <Td>
                <p className="font-medium text-[var(--text-primary)]">{y.name ?? "—"}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1 font-mono text-[11px] text-[var(--text-muted)]">
                  {y.sku}
                  {y.deger_kaynagi === "MALIYET" && (
                    <Badge variant="warn" className="font-sans">
                      satış kanıtı yok
                    </Badge>
                  )}
                </p>
              </Td>
              <Td right muted>{fmtNum(y.stok)}</Td>
              <Td right strong>{fmtTry(deger)}</Td>
              <Td right danger={pay >= 20}>%{pay.toFixed(1)}</Td>
              <Td right danger={gun != null && gun > 365}>
                {gun == null ? "satmıyor" : `${fmtNum(gun)} gün`}
              </Td>
            </tr>
          );
        })}
      </CfoTable>

      <p className="mt-4 text-[11px] leading-relaxed text-[var(--text-muted)]">
        Kaynak: <code>cfo_servet</code> · <code>cfo_stok_deger</code> ·{" "}
        <code>cfo_yoldaki_mal</code>. Kukla stoklu SKU&apos;lar (999 / 1.000 / 10.000 gibi
        yer tutucu adetler) değerlemeye alınmaz — alınsaydı tek bir kamera seti kaydı tek
        başına 14,6 M ₺ değer üretiyordu. Bu, servetin eksik değil, <strong>doğru</strong>{" "}
        sayılması demek; kukla stokların gerçek adetleri girilirse servet artabilir.
      </p>
    </Card>
  );
}
