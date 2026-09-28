import Link from "next/link";
import { ShoppingBasket, TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { KpiCard } from "@/components/layout/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { alfasPara, type AlfasSepet, type SepetSonuc } from "@/lib/alfashome/client";
import {
  GOSTER,
  GOSTER_ETIKET,
  bostaMetni,
  enCokSepettekiUrunler,
  fazEtiketi,
  kalemOzeti,
  mailEtiketi,
  sepetFiltrele,
  sepetSirala,
  uyelikEtiketi,
  type Goster,
  type Sirala,
  type Ton,
} from "@/lib/alfashome/sepetler";
import { formatDateTime } from "@/lib/utils";
import { normalizePhone } from "@/lib/whatsapp/phone";

/**
 * Sepetler sayfasının gövdesi (KPI + süzgeç + tablo + ürün kırılımı).
 *
 * NEDEN AYRI DOSYA: Next `page.tsx`'ten `default` dışında export kabul etmez;
 * gövde sayfada kalırsa render edilerek denenemezdi. İzin kontrolü ve veri
 * çekme `page.tsx`'te kalır — burası yalnız çizer.
 */

export const TON_BADGE: Record<Ton, "ok" | "warn" | "danger" | "info" | "neutral"> = {
  success: "ok",
  warning: "warn",
  danger: "danger",
  info: "info",
  neutral: "neutral",
};

export function SepetGovdesi({
  sonuc,
  goster,
  sirala,
  th,
  thR,
  td,
  tdR,
  tarih,
  href,
}: {
  sonuc: Extract<SepetSonuc, { ok: true }>;
  goster: Goster;
  sirala: Sirala;
  th: string;
  thR: string;
  td: string;
  tdR: string;
  tarih: (iso: string) => string;
  href: (g: string, s: string) => string;
}) {
  const { ozet, esikler, kurtarilan } = sonuc;
  const gorunen = sepetSirala(sepetFiltrele(sonuc.sepetler, goster), sirala);
  const urunler = enCokSepettekiUrunler(sonuc.sepetler, 5);

  return (
    <>
      {!sonuc.mail_yapilandirildi && (
        <Card className="border-[var(--danger)] p-4">
          <div className="flex gap-3">
            <TriangleAlert size={18} className="mt-0.5 shrink-0 text-[var(--danger)]" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">Hatırlatma maili KAPALI — hiçbir sepete mail gitmiyor.</p>
              <p className="text-xs text-[var(--text-secondary)]">
                ALFAS tarafında (Railway → Variables) <code>RESEND_API_KEY</code> ve{" "}
                <code>RESEND_FROM</code> tanımlı değil. Aşağıdaki &quot;Mail bekliyor&quot; yerine
                &quot;Gönderilemez&quot; görünmesinin sebebi budur.
              </p>
            </div>
          </div>
        </Card>
      )}

      {sonuc.kesildi && (
        <Card className="border-[var(--warn)] p-4 text-sm">
          ALFAS sepet taramasını tavanda kesti — liste <strong>eksik olabilir</strong>. Sayılar
          taranan kısma göre.
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Sepette bekleyen"
          value={ozet.bekleyen.toLocaleString("tr-TR")}
          tone={ozet.bekleyen > 0 ? "info" : "neutral"}
          hint={`${alfasPara(ozet.tutar_bekleyen)} · son ${esikler.ilk_saat} saatte hareket var, müşteri hâlâ alışverişte olabilir`}
        />
        <KpiCard
          label="Terk edilen"
          value={ozet.terk.toLocaleString("tr-TR")}
          tone={ozet.terk > 0 ? "warning" : "neutral"}
          hint={`${alfasPara(ozet.tutar_terk)} · ${esikler.ilk_saat} saat–${esikler.max_gun} gün hareketsiz`}
        />
        <KpiCard
          label="Kayıtlı üye sepeti"
          value={ozet.kayitli.toLocaleString("tr-TR")}
          hint={`Kayıtsız ${(ozet.kayitsiz + ozet.anonim).toLocaleString("tr-TR")}${
            ozet.anonim > 0 ? ` (${ozet.anonim}'i kimliksiz)` : ""
          }${ozet.bilinmiyor > 0 ? ` · bilinmiyor ${ozet.bilinmiyor}` : ""}`}
        />
        <KpiCard
          label="Hatırlatma gitti"
          value={ozet.mail_gitti.toLocaleString("tr-TR")}
          tone={ozet.mail_gitti > 0 ? "success" : "neutral"}
          hint={`Bekleyen ${ozet.mail_bekliyor} · gönderilemez ${ozet.mail_gonderilemez}`}
        />
        <KpiCard
          label="Mail gecikti"
          value={ozet.mail_gecikti.toLocaleString("tr-TR")}
          tone={ozet.mail_gecikti > 0 ? "danger" : "neutral"}
          hint="Sırası geldi ama gitmedi — sebep kayıtlı değil, Railway log'una bakın"
        />
        <KpiCard
          label="Mail sonrası satın alınan"
          value={kurtarilan.adet.toLocaleString("tr-TR")}
          tone={kurtarilan.adet > 0 ? "success" : "neutral"}
          hint={`${alfasPara(kurtarilan.tutar)} · son ${sonuc.pencere_gun} gün · korelasyon, kanıt değil`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {GOSTER.map((g) => {
          const sayi = sepetFiltrele(sonuc.sepetler, g).length;
          const aktif = g === goster;
          return (
            <Link
              key={g}
              href={href(g, sirala)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                aktif
                  ? "border-[var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]"
                  : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-2)]"
              }`}
            >
              {GOSTER_ETIKET[g]} <span className="tabular-nums opacity-70">{sayi}</span>
            </Link>
          );
        })}
        <span className="ml-auto text-xs text-[var(--text-tertiary)]">
          Sırala:{" "}
          <Link
            href={href(goster, "yeni")}
            className={sirala === "yeni" ? "font-medium text-[var(--text-primary)]" : "underline"}
          >
            En yeni
          </Link>{" "}
          ·{" "}
          <Link
            href={href(goster, "tutar")}
            className={sirala === "tutar" ? "font-medium text-[var(--text-primary)]" : "underline"}
          >
            Tutar
          </Link>
        </span>
      </div>

      {gorunen.length === 0 ? (
        <EmptyState
          icon={ShoppingBasket}
          title={
            sonuc.sepetler.length === 0
              ? `Son ${sonuc.pencere_gun} günde bekleyen sepet yok`
              : "Bu süzgece uyan sepet yok"
          }
          hint={
            sonuc.sepetler.length === 0
              ? "Bağlantı çalışıyor; ALFAS tarafında ürünü olup siparişe dönmemiş sepet bulunmuyor."
              : "Başka bir süzgeç seçin."
          }
        />
      ) : (
        <>
          {/* Geniş ekran: tablo. Dar ekran (telefon): kart. AYNI bloklar iki düzende
              de kullanılır — mobilde tablo yatay kaydığı için "Hatırlatma maili"
              kolonu ekran dışında kalıyordu ve sayfanın asıl amacı o (ölçüldü). */}
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)]">
                  <th className={th}>Müşteri</th>
                  <th className={th}>Sepet</th>
                  <th className={thR}>Tutar</th>
                  <th className={th}>Durum</th>
                  <th className={th}>Hatırlatma maili</th>
                  <th className={th}>İletişim</th>
                </tr>
              </thead>
              <tbody>
                {gorunen.map((s) => (
                  <tr key={s.id} className="border-b border-[var(--border-subtle)] align-top">
                    <td className={td}>
                      <MusteriBlok s={s} />
                    </td>
                    <td className={td}>
                      <SepetBlok s={s} />
                    </td>
                    <td className={`${tdR} whitespace-nowrap font-medium`}>
                      {alfasPara(s.tutar, s.para)}
                    </td>
                    <td className={td}>
                      <DurumBlok s={s} esikler={esikler} tarih={tarih} />
                    </td>
                    <td className={td}>
                      <MailBlok s={s} esikler={esikler} tarih={tarih} />
                    </td>
                    <td className={`${td} whitespace-nowrap text-xs`}>
                      <IletisimBlok s={s} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="space-y-3 md:hidden">
            {gorunen.map((s) => (
              <Card key={s.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <MusteriBlok s={s} />
                  <div className="whitespace-nowrap text-right font-medium tabular-nums">
                    {alfasPara(s.tutar, s.para)}
                  </div>
                </div>
                <SepetBlok s={s} />
                <DurumBlok s={s} esikler={esikler} tarih={tarih} />
                <div className="border-t border-[var(--border-subtle)] pt-3">
                  <MailBlok s={s} esikler={esikler} tarih={tarih} />
                </div>
                <div className="border-t border-[var(--border-subtle)] pt-3 text-xs">
                  <IletisimBlok s={s} yatay />
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {urunler.length > 0 && (
        <Card className="overflow-x-auto">
          <div className="border-b border-[var(--border-subtle)] px-4 py-3 text-sm font-medium">
            En çok sepette kalan ürünler
            <span className="ml-2 text-xs font-normal text-[var(--text-tertiary)]">
              bekleyen + terk edilen sepetler
            </span>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)]">
                <th className={th}>Ürün</th>
                <th className={thR}>Kaç sepette</th>
                <th className={thR}>Toplam adet</th>
              </tr>
            </thead>
            <tbody>
              {urunler.map((u) => (
                <tr key={u.ad} className="border-b border-[var(--border-subtle)]">
                  <td className={td}>{u.ad}</td>
                  <td className={tdR}>{u.sepet}</td>
                  <td className={tdR}>{u.adet}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <p className="text-xs text-[var(--text-tertiary)]">
        {formatDateTime(sonuc.guncellendi)} itibarıyla · Kaynak: alfashome.com (salt okunur) · Son{" "}
        {sonuc.pencere_gun} gün
        {sonuc.toplam > sonuc.adet
          ? ` · ${sonuc.toplam} sepetten ilk ${sonuc.adet}'i listelenir (üyelik kırılımı yalnız listelenenler için bilinir)`
          : ""}
        {ozet.eski > 0 ? ` · ${ozet.eski} eski sepet (${esikler.max_gun} gün+) sayıya dahil` : ""}
        <br />
        Hatırlatma: sepet {esikler.ilk_saat} saat hareketsiz kalınca 1. mail, ardından{" "}
        {esikler.ikinci_saat} saat sonra 2. mail (ücretsiz kargo kodu) gider; {esikler.max_gun}{" "}
        günden eski sepete gitmez. Mail her saat başı turunda gönderilir. Başarısız denemeler
        kaydedilmez: &quot;Gecikti&quot; = sırası geldi ama gitmedi, sebep Railway log&apos;unda.
        &quot;Mail sonrası satın alınan&quot; mailin satışı getirdiğini KANITLAMAZ.
      </p>
    </>
  );
}

type Esikler = Extract<SepetSonuc, { ok: true }>["esikler"];

function MusteriBlok({ s }: { s: AlfasSepet }) {
  const uy = uyelikEtiketi(s.uyelik);
  return (
    <div>
      <div>{s.ad ?? s.eposta ?? "Kimliği yok"}</div>
      <div className="text-xs text-[var(--text-tertiary)]">
        {[s.ad ? s.eposta : null, s.telefon].filter(Boolean).join(" · ") || "—"}
      </div>
      <div className="mt-1">
        <Badge variant={TON_BADGE[uy.ton]}>{uy.etiket}</Badge>
      </div>
    </div>
  );
}

function SepetBlok({ s }: { s: AlfasSepet }) {
  const o = kalemOzeti(s);
  return (
    <div>
      {o.satirlar.map((k) => (
        <div key={k}>{k}</div>
      ))}
      {o.fazla > 0 && (
        <div className="text-xs text-[var(--text-tertiary)]">+{o.fazla} ürün daha</div>
      )}
    </div>
  );
}

function DurumBlok({
  s,
  esikler,
  tarih,
}: {
  s: AlfasSepet;
  esikler: Esikler;
  tarih: (iso: string) => string;
}) {
  const faz = fazEtiketi(s.faz, esikler);
  return (
    <div>
      <Badge variant={TON_BADGE[faz.ton]}>{faz.etiket}</Badge>
      <div className="mt-1 text-xs text-[var(--text-tertiary)]">
        {bostaMetni(s.bosta_saat, s.bosta_belirsiz)} hareketsiz
      </div>
      <div className="text-xs text-[var(--text-tertiary)]">
        {s.guncelleme ? `Son güncelleme ${tarih(s.guncelleme)}` : "—"}
      </div>
    </div>
  );
}

function MailBlok({
  s,
  esikler,
  tarih,
}: {
  s: AlfasSepet;
  esikler: Esikler;
  tarih: (iso: string) => string;
}) {
  const mail = mailEtiketi(s.mail, esikler, tarih);
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-widest text-[var(--text-muted)] md:hidden">
        Hatırlatma maili
      </div>
      <Badge variant={TON_BADGE[mail.ton]}>{mail.etiket}</Badge>
      {mail.ayrinti.map((a) => (
        <div key={a} className="mt-1 text-xs text-[var(--text-tertiary)]">
          {a}
        </div>
      ))}
    </div>
  );
}

/** WhatsApp / Ara / E-posta. Hazır mesaj metni EKLENMEZ (müşteri adına metin yazmak operatörün kararı). */
function IletisimBlok({ s, yatay = false }: { s: AlfasSepet; yatay?: boolean }) {
  const tel = s.telefon ? normalizePhone(s.telefon) : "";
  if (!s.eposta && !tel) return <span className="text-[var(--text-tertiary)]">—</span>;
  return (
    <div className={yatay ? "flex flex-wrap gap-x-4 gap-y-1" : "flex flex-col gap-1"}>
      {tel && (
        <>
          <a
            href={`https://wa.me/${tel}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            WhatsApp
          </a>
          <a href={`tel:+${tel}`} className="underline">
            Ara
          </a>
        </>
      )}
      {s.eposta && (
        <a href={`mailto:${s.eposta}`} className="underline">
          E-posta
        </a>
      )}
    </div>
  );
}
