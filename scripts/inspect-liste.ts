/**
 * Excel keşif scripti — ithalat/liste.xlsx
 * Hangi kanallar var, müşteri profili nasıl, vergi numarası dağılımı, vs.
 */
import * as XLSX from "xlsx";

interface Row {
  ID: string;
  "Sipariş Numarası": string | null;
  "Platform Ref. No": string | null;
  Tarih: string | null;
  Entegrasyon: string | null;
  Tedarikçi: string | null;
  Firma: string | null;
  "Fatura Adı": string | null;
  "Fatura Şehir": string | null;
  "Vergi Dairesi": string | null;
  "Vergi No": string | null;
  "TC Kimlik": string | null;
  "Müşteri Kodu": string | null;
  "Durum Adı": string | null;
  Toplam: string | null;
  Vergi: string | null;
  "Genel Toplam": string | null;
  "Komisyon Tutarı": string | null;
  "Komisyon Oranı": string | null;
  "Ürün Adı": string | null;
  "Ürün Kodu": string | null;
  Model: string | null;
  "Toplam Miktar": string | null;
  "Toplam Desi": string | null;
  "Kargo Firması": string | null;
  PazaryerindenGelenOdemeTutar: string | null;
  store_stock_name: string | null;
  [key: string]: string | null;
}

const wb = XLSX.readFile("C:/dev/iotomasyoncom/iotomasyon/ithalat/liste.xlsx");
const ws = wb.Sheets["sayfa"];
const rows = XLSX.utils.sheet_to_json<Row>(ws, { defval: null, raw: false });

console.log(`Total rows: ${rows.length.toLocaleString("tr-TR")}\n`);

// ── Kanallar (Entegrasyon değerleri) ───────────────────────────────────────
const channelCounts = new Map<string, number>();
for (const r of rows) {
  const c = (r.Entegrasyon ?? "—").trim();
  channelCounts.set(c, (channelCounts.get(c) ?? 0) + 1);
}
console.log("── Entegrasyon (Kanal) dağılımı ──");
const sortedChannels = [...channelCounts.entries()].sort((a, b) => b[1] - a[1]);
for (const [c, n] of sortedChannels) {
  console.log(`  ${c.padEnd(20)} ${n.toLocaleString("tr-TR").padStart(8)} (${((n / rows.length) * 100).toFixed(1)}%)`);
}

// ── Tedarikçi dağılımı (Entegrasyon ile redundant olabilir) ───────────────
const supCounts = new Map<string, number>();
for (const r of rows) {
  const c = (r.Tedarikçi ?? "—").trim();
  supCounts.set(c, (supCounts.get(c) ?? 0) + 1);
}
console.log("\n── Tedarikçi dağılımı (top 15) ──");
const sortedSup = [...supCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
for (const [c, n] of sortedSup) {
  console.log(`  ${c.padEnd(25)} ${n.toLocaleString("tr-TR").padStart(8)}`);
}

// ── Tarih aralığı ──────────────────────────────────────────────────────────
const dates = rows.map((r) => r.Tarih).filter((d): d is string => !!d);
console.log(`\n── Tarih ──`);
console.log(`  En eski: ${dates[dates.length - 1]}`);
console.log(`  En yeni: ${dates[0]}`);

// ── Vergi No / TC Kimlik kompozisyonu ──────────────────────────────────────
let hasVergiNo = 0, hasTcKimlik = 0, hasBoth = 0, hasNeither = 0;
for (const r of rows) {
  const v = (r["Vergi No"] ?? "").trim();
  const t = (r["TC Kimlik"] ?? "").trim();
  if (v && t) hasBoth++;
  else if (v) hasVergiNo++;
  else if (t) hasTcKimlik++;
  else hasNeither++;
}
console.log(`\n── Kimlik bilgisi ──`);
console.log(`  Vergi No var (firma):     ${hasVergiNo.toLocaleString("tr-TR")}`);
console.log(`  TC Kimlik var (bireysel): ${hasTcKimlik.toLocaleString("tr-TR")}`);
console.log(`  İkisi de:                 ${hasBoth.toLocaleString("tr-TR")}`);
console.log(`  Hiçbiri:                  ${hasNeither.toLocaleString("tr-TR")}`);

// ── Müşteri kodu — tekrar alan müşteri ────────────────────────────────────
const customerCounts = new Map<string, { count: number; firma: string; vergiNo: string; vergiDairesi: string; faturaAdi: string; sehir: string }>();
for (const r of rows) {
  const code = (r["Müşteri Kodu"] ?? "").trim();
  if (!code) continue;
  const existing = customerCounts.get(code);
  const firma = (r.Firma ?? "").trim();
  const vergiNo = (r["Vergi No"] ?? "").trim();
  const vergiDairesi = (r["Vergi Dairesi"] ?? "").trim();
  const faturaAdi = (r["Fatura Adı"] ?? "").trim();
  const sehir = (r["Fatura Şehir"] ?? "").trim();
  if (existing) {
    existing.count++;
    if (!existing.vergiNo && vergiNo) existing.vergiNo = vergiNo;
    if (!existing.firma && firma) existing.firma = firma;
  } else {
    customerCounts.set(code, { count: 1, firma, vergiNo, vergiDairesi, faturaAdi, sehir });
  }
}
console.log(`\n── Müşteri dağılımı ──`);
console.log(`  Toplam tekil müşteri kodu: ${customerCounts.size.toLocaleString("tr-TR")}`);
const repeats = [...customerCounts.values()].filter((c) => c.count >= 2);
console.log(`  ≥2 sipariş verenler:        ${repeats.length.toLocaleString("tr-TR")}`);
const commercialAll = [...customerCounts.values()].filter((c) => c.vergiNo);
console.log(`  Vergi No'lu (ticari):       ${commercialAll.length.toLocaleString("tr-TR")}`);
const commercialRepeat = repeats.filter((c) => c.vergiNo);
console.log(`  Vergi No'lu + tekrar alan:  ${commercialRepeat.length.toLocaleString("tr-TR")}`);

// ── En çok alan ticari firmalar (top 10) ───────────────────────────────────
console.log(`\n── Top 10 ticari müşteri (Vergi No'lu, ≥2 sipariş) ──`);
const topCommercial = commercialRepeat.sort((a, b) => b.count - a.count).slice(0, 10);
for (const c of topCommercial) {
  console.log(`  ${c.count.toString().padStart(4)} sipariş · VN ${c.vergiNo.padEnd(12)} · ${c.firma || c.faturaAdi}`);
}

// ── Durum dağılımı ────────────────────────────────────────────────────────
const statusCounts = new Map<string, number>();
for (const r of rows) {
  const s = (r["Durum Adı"] ?? "—").trim();
  statusCounts.set(s, (statusCounts.get(s) ?? 0) + 1);
}
console.log(`\n── Durum dağılımı ──`);
for (const [s, n] of [...statusCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${s.padEnd(30)} ${n.toLocaleString("tr-TR").padStart(8)}`);
}

// ── Sipariş Numarası unique check ──────────────────────────────────────────
const orderNumbers = new Set<string>();
let dupOrderNums = 0;
for (const r of rows) {
  const o = (r["Sipariş Numarası"] ?? "").trim();
  if (!o) continue;
  if (orderNumbers.has(o)) dupOrderNums++;
  orderNumbers.add(o);
}
console.log(`\n── Sipariş Numarası ──`);
console.log(`  Toplam dolu:        ${rows.length - rows.filter((r) => !r["Sipariş Numarası"]).length}`);
console.log(`  Tekil:              ${orderNumbers.size.toLocaleString("tr-TR")}`);
console.log(`  Tekrar (line item): ${dupOrderNums.toLocaleString("tr-TR")} (bir sipariş içinde birden fazla ürün)`);

// ── Komisyon oranı dağılımı (kanal başına) ────────────────────────────────
console.log(`\n── Komisyon oranı (kanal başına ortalama) ──`);
const commByChannel = new Map<string, { sum: number; count: number }>();
for (const r of rows) {
  const c = (r.Entegrasyon ?? "—").trim();
  const co = parseFloat(r["Komisyon Oranı"] ?? "0");
  if (!Number.isFinite(co) || co <= 0) continue;
  const ex = commByChannel.get(c) ?? { sum: 0, count: 0 };
  ex.sum += co;
  ex.count++;
  commByChannel.set(c, ex);
}
for (const [c, { sum, count }] of commByChannel) {
  console.log(`  ${c.padEnd(20)} ortalama %${(sum / count).toFixed(2)} (${count} kayıt)`);
}
