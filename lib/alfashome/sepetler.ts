/**
 * ALFAS Home SEPETLER sayfasının saf yardımcıları — ağ/DB yok, test edilebilir.
 *
 * KARARLAR BURADA DEĞİL: "mail gitti mi / ne zaman gidecek / gecikti mi" kararını
 * ALFAS verir (`backend/src/lib/cart-recovery.ts`, mail gönderen job ile AYNI
 * fonksiyonlar). Bu dosya yalnız o kararı Türkçeye çevirir, süzer ve sıralar.
 * Panelde eşik/karar mantığı YENİDEN yazılmaz: yazılsaydı panel "1 saat sonra
 * gidecek" derken job başka eşikle çalışırdı ve operatör müşteriye yanlış şey
 * söylerdi.
 *
 * ⚠️ BİLİNMEYEN DEĞER GİZLENMEZ: ALFAS yeni bir durum/sebep kodu eklerse (panel
 * henüz bilmiyor) kod OLDUĞU GİBİ gösterilir — "—" ya da boş hücre, sorunu
 * gizlerdi (`odemeEtiketi` ile aynı ilke).
 */

import type { AlfasSepet, AlfasSepetEsikler, AlfasSepetMail } from "./client";

export type Ton = "success" | "warning" | "danger" | "neutral" | "info";

// ── Süre metinleri ───────────────────────────────────────────────────────────

/** 45 → "45 dk", 135 → "2 sa 15 dk", 3000 → "2 gün". */
export function sureMetni(dk: number | null | undefined): string {
  if (dk === null || dk === undefined || !Number.isFinite(dk) || dk < 0) return "—";
  if (dk < 1) return "1 dk'dan az";
  if (dk < 60) return `${Math.round(dk)} dk`;
  if (dk < 48 * 60) {
    const sa = Math.floor(dk / 60);
    const d = Math.round(dk - sa * 60);
    return d > 0 ? `${sa} sa ${d} dk` : `${sa} sa`;
  }
  return `${Math.floor(dk / (24 * 60))} gün`;
}

/** Sepetin boşta kalma süresi. `belirsiz` → alt sınırdır ("en az …"). */
export function bostaMetni(saat: number | null, belirsiz = false): string {
  if (saat === null) return "—";
  return `${belirsiz ? "en az " : ""}${sureMetni(saat * 60)}`;
}

// ── Etiketler ────────────────────────────────────────────────────────────────

export function uyelikEtiketi(u: AlfasSepet["uyelik"] | string): { etiket: string; ton: Ton } {
  switch (u) {
    case "kayitli":
      return { etiket: "Kayıtlı üye", ton: "success" };
    case "kayitsiz":
      return { etiket: "Kayıtsız · e-posta var", ton: "neutral" };
    case "anonim":
      return { etiket: "Kayıtsız · kimliği yok", ton: "neutral" };
    case "bilinmiyor":
      return { etiket: "Üyelik bilinmiyor", ton: "warning" };
    default:
      return { etiket: String(u), ton: "neutral" };
  }
}

export function fazEtiketi(f: AlfasSepet["faz"] | string, e: AlfasSepetEsikler): { etiket: string; ton: Ton } {
  switch (f) {
    case "bekliyor":
      return { etiket: "Sepette bekliyor", ton: "info" };
    case "terk":
      return { etiket: "Terk edildi", ton: "warning" };
    case "eski":
      return { etiket: `Eski (${e.max_gun} gün+)`, ton: "neutral" };
    default:
      return { etiket: String(f), ton: "neutral" };
  }
}

/** ALFAS'ın `mail.sebep` kodları → açıklama. Bilinmeyen kod olduğu gibi. */
export function mailSebepMetni(sebep: string | null, e: AlfasSepetEsikler): string {
  switch (sebep) {
    case "eposta_yok":
      return "E-posta adresi yok — ulaşılamaz";
    case "bos_sepet":
      return "Sepet boş";
    case "cok_eski":
      return `Sepet ${e.max_gun} günden eski — mail gitmez`;
    case "mail_kapali":
      return "Mail servisi kapalı (ALFAS'ta RESEND yapılandırılmamış)";
    case "tarih_yok":
      return "Sepet tarihi okunamadı";
    case null:
      return "—";
    default:
      return sebep;
  }
}

export type MailEtiketi = { etiket: string; ton: Ton; ayrinti: string[] };

/**
 * Hatırlatma maili durumu → etiket + satırlar. `tarih` tarihi biçimlendirir
 * (sayfa `formatDateTime`, test düz bir fonksiyon geçer).
 */
export function mailEtiketi(
  m: AlfasSepetMail,
  e: AlfasSepetEsikler,
  tarih: (iso: string) => string
): MailEtiketi {
  const gidenler: string[] = [];
  if (m.mail1) gidenler.push(`1. mail: ${tarih(m.mail1)}`);
  if (m.mail2) gidenler.push(`2. mail: ${tarih(m.mail2)}`);

  const siradaki = (): string | null => {
    if (m.sonraki === null) return null;
    if (m.sonraki_dk === null) return null;
    return m.sonraki_dk > 0
      ? `${m.sonraki}. mail ≈ ${sureMetni(m.sonraki_dk)} sonra uygun olur`
      : `${m.sonraki}. mailin sırası geldi — sonraki saat başı turunda gider`;
  };

  switch (m.durum) {
    case "gitti": {
      const ek: string[] = [...gidenler];
      const s = siradaki();
      if (s) ek.push(s);
      else if (m.sebep) ek.push(mailSebepMetni(m.sebep, e));
      return {
        etiket: m.gonderilen >= 2 ? "2 mail de gitti" : "1. mail gitti",
        ton: "success",
        ayrinti: ek,
      };
    }
    case "bekliyor":
      return {
        etiket: "Mail bekliyor",
        ton: "info",
        ayrinti: [siradaki() ?? "Sırası gelmedi"],
      };
    case "gecikti":
      return {
        etiket: "Gecikti",
        ton: "danger",
        ayrinti: [
          ...gidenler,
          `${m.sonraki ?? 1}. mailin sırası geldi ama gitmedi`,
          // Sebep BİLİNMİYOR ve uydurulmaz: başarısız deneme kaydedilmiyor.
          "Sebep kayıtlı değil (Resend hatası / job durmuş olabilir) — Railway log'una bakın",
        ],
      };
    case "gonderilemez":
      return {
        etiket: "Gönderilemez",
        ton: m.sebep === "mail_kapali" ? "danger" : "neutral",
        ayrinti: [...gidenler, mailSebepMetni(m.sebep, e)],
      };
    default:
      return { etiket: String(m.durum), ton: "neutral", ayrinti: gidenler };
  }
}

// ── Süzme / sıralama ────────────────────────────────────────────────────────

export const GOSTER = [
  "tumu",
  "bekleyen",
  "terk",
  "kayitli",
  "kayitsiz",
  "gecikti",
  "gonderilemez",
] as const;
export type Goster = (typeof GOSTER)[number];

export const GOSTER_ETIKET: Record<Goster, string> = {
  tumu: "Tümü",
  bekleyen: "Sepette bekleyen",
  terk: "Terk edilen",
  kayitli: "Kayıtlı üye",
  kayitsiz: "Kayıtsız",
  gecikti: "Mail gecikti",
  gonderilemez: "Mail gönderilemez",
};

export const SIRALA = ["yeni", "tutar"] as const;
export type Sirala = (typeof SIRALA)[number];

/** Adres çubuğundan gelen değer geçerli mi? Değilse varsayılan (URL uydurması hata vermesin). */
export function gosterParam(v: unknown): Goster {
  return (GOSTER as readonly string[]).includes(String(v)) ? (v as Goster) : "tumu";
}
export function siralaParam(v: unknown): Sirala {
  return (SIRALA as readonly string[]).includes(String(v)) ? (v as Sirala) : "yeni";
}

/**
 * Süzgeç. "Kayıtsız" = e-postası olup hesabı olmayan + kimliği hiç olmayan
 * (anonim): operatör için ikisi de "üye değil". `bilinmiyor` yalnız "Tümü"nde.
 */
export function sepetFiltrele(l: AlfasSepet[], g: Goster): AlfasSepet[] {
  switch (g) {
    case "bekleyen":
      return l.filter((s) => s.faz === "bekliyor");
    case "terk":
      return l.filter((s) => s.faz === "terk");
    case "kayitli":
      return l.filter((s) => s.uyelik === "kayitli");
    case "kayitsiz":
      return l.filter((s) => s.uyelik === "kayitsiz" || s.uyelik === "anonim");
    case "gecikti":
      return l.filter((s) => s.mail.durum === "gecikti");
    case "gonderilemez":
      return l.filter((s) => s.mail.durum === "gonderilemez");
    default:
      return l;
  }
}

/** `yeni`: ALFAS'ın verdiği sıra (en son güncellenen üstte). `tutar`: büyükten küçüğe. */
export function sepetSirala(l: AlfasSepet[], s: Sirala): AlfasSepet[] {
  if (s === "tutar") return [...l].sort((a, b) => b.tutar - a.tutar);
  return l;
}

// ── Ürün kırılımı ───────────────────────────────────────────────────────────

export type SepettekiUrun = { ad: string; sepet: number; adet: number };

/**
 * Sepette en çok kalan ürünler. YALNIZ bekleyen + terk edilen sepetler sayılır:
 * "eski" sepetler haftalardır ölü, listeyi eskiyle doldurmasın.
 * Sıralama: kaç FARKLI sepette geçtiği (aynı ürünü 5 adet alan tek sepet, 5
 * sepette bırakılan ürünle aynı sinyal değildir), eşitlikte adet, sonra ad.
 */
export function enCokSepettekiUrunler(l: AlfasSepet[], n = 5): SepettekiUrun[] {
  const m = new Map<string, SepettekiUrun>();
  for (const s of l) {
    if (s.faz === "eski") continue;
    const buSepet = new Set<string>();
    for (const k of s.kalemler) {
      const u = m.get(k.ad) ?? { ad: k.ad, sepet: 0, adet: 0 };
      u.adet += k.adet;
      if (!buSepet.has(k.ad)) {
        u.sepet += 1;
        buSepet.add(k.ad);
      }
      m.set(k.ad, u);
    }
  }
  return [...m.values()]
    .sort((a, b) => b.sepet - a.sepet || b.adet - a.adet || a.ad.localeCompare(b.ad, "tr"))
    .slice(0, n);
}

/** "Batarya ×2, Hortum" → tablo hücresinde en çok 2 kalem + "+N ürün". */
export function kalemOzeti(s: AlfasSepet, en = 2): { satirlar: string[]; fazla: number } {
  const satirlar = s.kalemler.slice(0, en).map((k) => (k.adet > 1 ? `${k.adet}× ${k.ad}` : k.ad));
  return { satirlar, fazla: Math.max(0, s.kalemler.length - en) };
}
