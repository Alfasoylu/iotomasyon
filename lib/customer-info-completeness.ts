/**
 * lib/customer-info-completeness.ts — Müşteri Bilgi Tamlığı Skoru
 *
 * Kullanıcı talebi: Power Queue + akıllı öneri sıralamasında "bilgisi en
 * eksiksiz" müşteri öne çıkar. Telefon numarası olan müşteri öncelikli.
 *
 * Formül (0-100):
 *   hasPhone        25pt  ← telefon olan en öncelikli
 *   hasWhatsapp     15pt
 *   hasEmail        10pt
 *   hasTaxNumber    10pt
 *   hasCompany      10pt
 *   hasInterests    10pt  (en az 1 ProductInterest)
 *   hasCity         5pt
 *   hasAddress      5pt
 *   hasNotes        10pt  (customerNotes dolu)
 *
 * Anti-monotony rotation:
 * Power Queue + öneri listelerinde aynı müşteri tekrar tekrar görünmesin.
 * Customer.shownInQueueCount field her render'da artırılır. Sıralama
 * formülü = priority × (1 / (1 + shownInQueueCount × 0.1)) — yüksek shown
 * olan müşteri "soğutulur" ve sonraki sırada başkalarına yer açar.
 * shownInQueueCount 7 günde bir sıfırlanır (cron job).
 */

export interface InfoCompletenessInput {
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  taxNumber: string | null;
  company: string | null;
  city: string | null;
  address: string | null;
  customerNotes: string | null;
  hasInterests: boolean;
}

export interface InfoCompletenessResult {
  score: number;          // 0-100
  missing: string[];      // boş alanların listesi (UI'da hint için)
  hasPhone: boolean;      // hızlı erişim
}

export function calcInfoCompleteness(input: InfoCompletenessInput): InfoCompletenessResult {
  const hasPhone = !!(input.phone && input.phone.trim());
  const hasWhatsapp = !!(input.whatsapp && input.whatsapp.trim());
  const hasEmail = !!(input.email && input.email.trim());
  const hasTaxNumber = !!(input.taxNumber && input.taxNumber.trim());
  const hasCompany = !!(input.company && input.company.trim());
  const hasCity = !!(input.city && input.city.trim());
  const hasAddress = !!(input.address && input.address.trim());
  const hasNotes = !!(input.customerNotes && input.customerNotes.trim());

  const score =
    (hasPhone ? 25 : 0) +
    (hasWhatsapp ? 15 : 0) +
    (hasEmail ? 10 : 0) +
    (hasTaxNumber ? 10 : 0) +
    (hasCompany ? 10 : 0) +
    (input.hasInterests ? 10 : 0) +
    (hasCity ? 5 : 0) +
    (hasAddress ? 5 : 0) +
    (hasNotes ? 10 : 0);

  const missing: string[] = [];
  if (!hasPhone) missing.push("telefon");
  if (!hasWhatsapp) missing.push("WhatsApp");
  if (!hasEmail) missing.push("e-posta");
  if (!hasTaxNumber) missing.push("vergi no");
  if (!hasCompany) missing.push("şirket");
  if (!input.hasInterests) missing.push("ürün ilgisi");
  if (!hasCity) missing.push("şehir");
  if (!hasAddress) missing.push("adres");
  if (!hasNotes) missing.push("not");

  return { score, missing, hasPhone };
}

/**
 * Anti-monotony rotation çarpanı.
 * shownInQueueCount yüksek olan müşteri sıralamada "soğutulur".
 * Çıktı: 1.0 (hiç gösterilmemiş) → 0.5 (5 kez gösterilmiş) → 0.3 (10 kez)
 */
export function rotationFactor(shownInQueueCount: number): number {
  return 1 / (1 + shownInQueueCount * 0.1);
}

/**
 * Çağrı merkezi smart priority: lead skoru + bilgi tamlığı + rotation.
 *   - Lead skoru yüksek = sıcak müşteri (öncelikli)
 *   - Bilgi tamlığı yüksek = aranabilir (telefon var, vb.)
 *   - Rotation = aynı müşteri tekrar tekrar çıkmasın
 *
 * Telefon yoksa skor 0 — çağrı merkezi listesinde anlamsız.
 */
export function calcCallPriority(input: {
  leadScore: number;          // 0-100
  infoCompleteness: number;   // 0-100
  shownInQueueCount: number;
  hasPhone: boolean;
  doNotCall: boolean;
}): number {
  if (input.doNotCall) return 0;
  if (!input.hasPhone) return 0;

  // Lead %60 + Info %40 ağırlıklı blend
  const base = input.leadScore * 0.6 + input.infoCompleteness * 0.4;
  const rotated = base * rotationFactor(input.shownInQueueCount);
  return Math.round(rotated * 100) / 100;
}
