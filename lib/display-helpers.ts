/**
 * UI display helpers — uzun/karmaşık Google Maps başlıklarını kısaltır.
 */

/**
 * Google Maps başlıklarını trim eder:
 * - "ADANA - Güvenlik Kamerası, Bilgisayar Tamiri, Notebook Tamiri, Çukurova"
 *   → "ADANA - Güvenlik Kamerası"
 * - "Logostech | Güvenlik | Kamera | Alarm | Turnike | Bilgisayar"
 *   → "Logostech | Güvenlik | Kamera"
 *
 * Davranış:
 * - 50 karakterden uzunsa, ilk virgül veya pipe'ta keser
 * - 3 segmentten fazlasını "+N daha" ile kısaltır
 */
export function shortenCustomerName(name: string, maxLength = 50): string {
  if (!name) return "";
  const trimmed = name.trim();
  if (trimmed.length <= maxLength) return trimmed;

  // Virgül veya pipe ile böl
  const separators = /[,|]/;
  if (separators.test(trimmed)) {
    const parts = trimmed.split(separators).map((s) => s.trim()).filter(Boolean);
    if (parts.length > 2) {
      const head = parts.slice(0, 2).join(parts.includes(parts[0].split(" ")[0] + "|") ? " | " : ", ");
      return head.length <= maxLength ? `${head}…` : `${head.slice(0, maxLength)}…`;
    }
  }

  // Düz kısa kes
  return `${trimmed.slice(0, maxLength)}…`;
}
