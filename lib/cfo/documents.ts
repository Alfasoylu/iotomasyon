// CFO BELGE KÜTÜPHANESİ — saf çekirdek (CFO-027, Cowork brief'i 2026-10-09). DB'ye bağlanmaz; test edilir.
// Üç kural:
//  1) Ham dosya motora/AI bağlamına GİRMEZ. Bağlama yalnız kullanıcının açıklaması + kısa özet + çıkarılan sayılar, sınırlı boyutta girer.
//  2) Kullanıcının açıklaması AI özetinden üstündür: bağlamda önce açıklama, özet "AI özeti" etiketiyle; çelişki kayda düşer.
//  3) Belge KANITTIR, sayı değildir: yükleme hiçbir defteri değiştirmez. Defter değişikliği yalnız onaylı akışla, belge kimliği kanıt olarak.
// Sitede LLM yok (karar 2026-10-07): belgeyi okuyup özet/sayı çıkaran taraf Cowork'tür; yazma `cfo_belge_ozet_yaz()` ile (maskeli).

export const DOCUMENT_CATEGORIES = [
  { key: "KOMISYON_ORANI", label: "Pazaryeri komisyon oranları", reads: "kanal komisyonu / net tahsilat oranı (N11, Amazon, Pazarama, Idefix, Temu, Koçtaş komisyonu kayıtsız)" },
  { key: "PLATFORM_FATURASI", label: "Pazaryeri / platform faturası", reads: "komisyon dışı hizmet bedelleri (sabit gider, kanal maliyeti)" },
  { key: "KART_EKSTRESI", label: "Kredi kartı ekstresi", reads: "kart maliyeti: devreden bakiye, akdi aylık faiz, KKDF/BSMV çarpanı (CFO-015)" },
  { key: "BANKA_EKSTRESI", label: "Banka / KMH ekstresi", reads: "KMH aylık oranı ve bakiye (CFO-015)" },
  { key: "KREDI_SOZLESMESI", label: "Kredi sözleşmesi / ödeme planı", reads: "kredi kalan anapara, faiz, taksit takvimi" },
  { key: "KDV_BEYANNAMESI", label: "KDV beyannamesi", reads: "devreden KDV / KDV yükümlülüğü (net sermaye, CFO-007)" },
  { key: "GUMRUK_BEYANNAMESI", label: "Gümrük beyannamesi", reads: "GTİP ve ödenen vergi (yasal gümrük yükü, CFO-026)" },
  { key: "TEDARIKCI_FATURASI", label: "Tedarikçi faturası / proforma", reads: "ürün maliyeti (CFO-011 / CFO-025)" },
  { key: "DIGER", label: "Diğer", reads: "yalnız açıklamadaki bilgi" },
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]["key"];
export const CATEGORY_KEYS = DOCUMENT_CATEGORIES.map(c => c.key) as readonly DocumentCategory[];
export const categoryLabel = (k: string) => DOCUMENT_CATEGORIES.find(c => c.key === k)?.label ?? k;

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MIN_DESCRIPTION_CHARS = 30;
export const ALLOWED_MIME: Record<string, string> = {
  "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "text/csv": "csv", "text/plain": "txt",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx", "application/vnd.ms-excel": "xls",
};

export type DocumentInput = { category: string; title: string; description: string; periodStart?: string | null; periodEnd?: string | null; validUntil?: string | null };
const isoDate = (s: string | null | undefined) => s == null || s === "" || (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)));

/** Form doğrulaması (sunucu ve istemci aynı kural). Boş dizi = geçerli. */
export function validateDocument(i: DocumentInput, file?: { size: number; type: string; name: string } | null): string[] {
  const e: string[] = [];
  if (!CATEGORY_KEYS.includes(i.category as DocumentCategory)) e.push("Kategori listeden seçilmeli.");
  if ((i.title ?? "").trim().length < 3) e.push("Başlık en az 3 karakter.");
  if ((i.description ?? "").trim().length < MIN_DESCRIPTION_CHARS)
    e.push(`Açıklama zorunlu (en az ${MIN_DESCRIPTION_CHARS} karakter): belgede ne var, hangi karar için, hangi sayı önemli.`);
  for (const [k, v] of [["Dönem başı", i.periodStart], ["Dönem sonu", i.periodEnd], ["Geçerlilik", i.validUntil]] as const)
    if (!isoDate(v)) e.push(`${k} tarihi YYYY-AA-GG olmalı.`);
  if (i.periodStart && i.periodEnd && i.periodStart > i.periodEnd) e.push("Dönem başı dönem sonundan sonra olamaz.");
  if (file !== undefined) {
    if (!file) e.push("Dosya seçilmedi.");
    else {
      if (file.size <= 0) e.push("Dosya boş.");
      if (file.size > MAX_DOCUMENT_BYTES) e.push("Dosya 10 MB sınırını aşıyor.");
      if (!ALLOWED_MIME[file.type]) e.push("Dosya türü desteklenmiyor (PDF, PNG, JPG, XLSX, XLS, CSV, TXT).");
    }
  }
  return e;
}

const luhn = (digits: string) => {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
};

/** Hassas veriyi maskeler (özet değişiklik günlüğüne ve bağlama girer): IBAN → TR** … son 4; kart no (13–19 hane, Luhn) → **** son 4;
 *  TCKN/VKN biçimli 10–11 hane → ilk 2 + *** + son 2. Tutarlar (nokta/virgül binlik, ≤ 9 hane) dokunulmaz. */
export function maskSensitive(text: string): string {
  return text
    .replace(/\b([A-Z]{2})\d{2}(?:[ ]?[0-9A-Z]{4}){3,7}(?:[ ]?[0-9A-Z]{1,3})?\b/g, m => {
      const c = m.replace(/ /g, ""); return `${c.slice(0, 2)}** **** ${c.slice(-4)}`;
    })
    .replace(/\b(?:\d[ -]?){12,18}\d\b/g, m => {
      const d = m.replace(/[ -]/g, ""); return d.length >= 13 && d.length <= 19 && luhn(d) ? `**** **** **** ${d.slice(-4)}` : m;
    })
    .replace(/(?<![\d.,])\d{10,11}(?![\d.,])/g, m => `${m.slice(0, 2)}${"*".repeat(m.length - 4)}${m.slice(-2)}`);
}

export type DocumentRow = { id: string; category: string; title: string; description: string; periodStart: string | null; periodEnd: string | null;
  validUntil: string | null; summary: string | null; summaryStatus: string; extracted: Record<string, unknown> | null; conflict: string | null; uploadedAt: string };

/** Motor/AI bağlamı için sınırlı belge özeti (ham dosya yok). Önce açıklama (üstün), sonra AI özeti, sonra çıkarılan sayılar.
 *  Toplam karakter sınırı aşılınca kalan belgeler yalnız başlık satırıyla sayılır. */
export function documentContext(rows: DocumentRow[], today: string, maxChars = 3000): string[] {
  const out: string[] = []; let used = 0, skipped = 0;
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  for (const r of rows) {
    const expired = r.validUntil != null && r.validUntil < today;
    const head = `BELGE ${r.id.slice(0, 8)} [${categoryLabel(r.category)}] ${clip(r.title, 80)}${r.periodStart || r.periodEnd ? ` · dönem ${r.periodStart ?? "?"}–${r.periodEnd ?? "?"}` : ""}${expired ? " · GEÇERLİLİĞİ BİTMİŞ" : ""}`;
    const nums = r.extracted ? Object.entries(r.extracted).slice(0, 10).map(([k, v]) => `${k}=${String(v)}`).join(", ") : "";
    const line = [head, `Kullanıcı açıklaması (üstün): ${maskSensitive(clip(r.description, 400))}`,
      r.summary && r.summaryStatus === "HAZIR" ? `AI özeti (açıklamayla çelişirse açıklama geçerli): ${maskSensitive(clip(r.summary, 400))}` : `AI özeti: ${r.summaryStatus === "BEKLIYOR" ? "bekliyor (Cowork okuyacak)" : r.summaryStatus}`,
      nums ? `Çıkarılan sayılar (öneri; onaysız deftere yazılmaz): ${maskSensitive(clip(nums, 300))}` : null,
      r.conflict ? `ÇELİŞKİ: ${maskSensitive(clip(r.conflict, 200))}` : null].filter(Boolean).join(" | ");
    if (used + line.length > maxChars) { skipped++; continue; }
    out.push(line); used += line.length;
  }
  if (skipped) out.push(`… ${skipped} belge daha (bağlam sınırı ${maxChars} karakter; tam liste /cfo/belgeler)`);
  return out;
}
