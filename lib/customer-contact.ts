/**
 * Helper'lar: telefon/WhatsApp numarası normalize ve tel:/wa.me link üretimi.
 */

/**
 * Türkiye telefon numarasını canonical +90xxxxxxxxxx formatına çevirir.
 * Geçersizse null döner.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // tüm boşluk, parantez, tire, +, nokta'yı kaldır
  let digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;

  // Eğer 90 ile başlamıyorsa ve 10 haneli ise (5xx...) önüne 90 ekle
  if (digits.length === 10 && digits.startsWith("5")) {
    digits = "90" + digits;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    // 0 ile başlıyor (05xx) → 0'ı at, 90 ekle
    digits = "90" + digits.slice(1);
  } else if (digits.length === 11 && digits.startsWith("9")) {
    // Eğer 11 haneli ve 9 ile başlıyorsa muhtemelen 90 prefix var
    // 90 ile başlamıyorsa anlamsız, ama olabildiğince koru
    if (!digits.startsWith("90")) return null;
  }

  if (digits.length !== 12 || !digits.startsWith("90")) return null;
  return "+" + digits;
}

export function telLink(raw: string | null | undefined): string | null {
  const n = normalizePhone(raw);
  return n ? `tel:${n}` : null;
}

export function whatsappLink(raw: string | null | undefined): string | null {
  const n = normalizePhone(raw);
  if (!n) return null;
  // wa.me/ + numeric only (without +)
  return `https://wa.me/${n.slice(1)}`;
}

/**
 * Görüntü için: +90 5xx xxx xx xx formatı
 */
export function displayPhone(raw: string | null | undefined): string {
  const n = normalizePhone(raw);
  if (!n) return raw ?? "";
  // +90 5XX XXX XX XX
  const d = n.slice(1); // 90...
  return `+${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10, 12)}`;
}
