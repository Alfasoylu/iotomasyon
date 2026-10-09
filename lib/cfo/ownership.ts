// ŞİRKET / ŞAHSİ TEK SINIFLAMA (CFO-006, 2026-10-09). Önceden 6 ayrı kural vardı: /ŞAHSİ/i (JS'te "şahsi"yi yakalamaz — İ'nin
// küçük harfi "i̇"), /ŞAHSİ|şahsi/i hesap adıyla birlikte, SQL ILIKE '%ŞAHSİ%', ~* 'ŞAHSİ|SAHSI', holder = 'Alp'. Tek kural:
//   banka hesabı ŞAHSİ ⇔ "accountType" Türkçe katlanmış (Ş→S, İ/ı→I …) büyük harfte "SAHSI" kelimesini içerir (ad kullanılmaz);
//   kart ŞAHSİ ⇔ sahibi (holder) "Alp".
// Üretim 09.10 doğrulaması: 15 hesap / 6 kartta eski kurallarla aynı sonuç. "Akbank Alp" / "Garanti Alp" hesapları türü gereği ŞİRKET
// (açık soru D-P08). SQL tüketicileri aynı kuralı PERSONAL_*_SQL ile kurar.

const fold = (s: string) => s.replace(/[Şş]/g, "S").replace(/[İıIi]/g, "I").replace(/[Çç]/g, "C").replace(/[Ğğ]/g, "G")
  .replace(/[Öö]/g, "O").replace(/[Üü]/g, "U").toUpperCase();

export const isPersonalAccount = (accountType: string | null | undefined) => /(^|[^A-Z])SAHSI([^A-Z]|$)/.test(fold(accountType ?? ""));
export const isPersonalCard = (holder: string | null | undefined) => fold((holder ?? "").trim()) === "ALP";

/** SQL ifadesi: `col` (accountType) ŞAHSİ mi — isPersonalAccount ile aynı kural. */
export const personalAccountSql = (col: string) =>
  `(upper(translate(coalesce(${col}::text, ''), 'ŞşİıIiÇçĞğÖöÜü', 'SSIIIICCGGOOUU')) ~ '(^|[^A-Z])SAHSI([^A-Z]|$)')`;
/** SQL ifadesi: kart sahibi ŞAHSİ mi — isPersonalCard ile aynı kural. */
export const personalCardSql = (col: string) =>
  `(upper(translate(btrim(coalesce(${col}, '')), 'ŞşİıIiÇçĞğÖöÜü', 'SSIIIICCGGOOUU')) = 'ALP')`;
