/**
 * Faz 91 — Trendyol e-fatura PDF metin çıkarıcı.
 *
 * Neden kendi çıkarıcımız var: Trendyol'un ürettiği PDF'ler gömülü **subset CID
 * font** kullanıyor. Akıştaki `<0027003600300003...> Tj` dizileri glyph id'leri;
 * ASCII değiller. Doğru okumak için her fontun `/ToUnicode` CMap'i gerekiyor —
 * ki bu PDF'lerde `beginbfchar`/`beginbfrange` blokları olarak mevcut.
 *
 * Bu yüzden yeni bir bağımlılık (pdf-parse / pdfjs-dist) eklemek yerine, bu
 * belge ailesine yeten ~120 satırlık bir okuyucu yazıldı:
 *   1. Tüm stream'ler inflate edilir.
 *   2. ToUnicode CMap'leri tek haritada birleştirilir. (Aynı dokümandaki
 *      fontlar aynı temel fontun subset'i olduğu için kod→unicode eşlemesi
 *      tutarlı; çakışmada ilk eşleme korunur.)
 *   3. İçerik akışındaki `Tj` dizileri çözülür. `Td` **boşluk üretmez** —
 *      gerçek boşluklar glyph 0x0003 olarak akışta zaten var; `Td` yalnız
 *      kerning atlamasıdır. Satır kırılımı `Tm` (yeni konum) ile yapılır.
 *
 * Tarama (görüntü) PDF'lerinde metin çıkmaz — çağıran taraf boş sonucu
 * "ayrıştırılamadı" olarak ele almalı.
 */

import zlib from "node:zlib";

/** PDF içindeki tüm stream'leri açar; açılamayanları ham bırakır. */
function inflateStreams(buf: Buffer): string[] {
  const latin = buf.toString("latin1");
  const out: string[] = [];
  const re = /stream\r?\n?/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(latin))) {
    const start = m.index + m[0].length;
    const end = latin.indexOf("endstream", start);
    if (end < 0) continue;
    const raw = buf.subarray(start, end);
    try {
      out.push(zlib.inflateSync(raw).toString("latin1"));
    } catch {
      // Sıkıştırılmamış ya da desteklenmeyen filtre — ham haliyle dene.
      out.push(raw.toString("latin1"));
    }
  }
  return out;
}

/** ToUnicode CMap bloklarını tek bir kod→karakter haritasında birleştirir. */
function buildCmap(streams: string[]): Map<number, string> {
  const map = new Map<number, string>();

  for (const s of streams) {
    if (!s.includes("beginbfchar") && !s.includes("beginbfrange")) continue;

    for (const blk of s.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []) {
      for (const mm of blk.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        const code = parseInt(mm[1], 16);
        if (map.has(code)) continue;
        map.set(code, String.fromCodePoint(parseInt(mm[2].slice(0, 4), 16)));
      }
    }

    for (const blk of s.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? []) {
      for (const mm of blk.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        const lo = parseInt(mm[1], 16);
        const hi = parseInt(mm[2], 16);
        const dst = parseInt(mm[3], 16);
        // Bozuk aralığa karşı üst sınır — normalde 200-300 kod olur.
        if (hi < lo || hi - lo > 65535) continue;
        for (let c = lo; c <= hi; c++) {
          if (!map.has(c)) map.set(c, String.fromCodePoint(dst + (c - lo)));
        }
      }
    }
  }
  return map;
}

function decodeHex(hex: string, cmap: Map<number, string>): string {
  let out = "";
  for (let i = 0; i + 4 <= hex.length; i += 4) {
    const code = parseInt(hex.substr(i, 4), 16);
    if (Number.isNaN(code)) continue;
    out += cmap.get(code) ?? "";
  }
  return out;
}

/**
 * PDF'i satır listesine çevirir. Etiket ve değer çoğu zaman ayrı satırlara
 * düşer ("Belge" / "No:" / "DDF..."), bu yüzden alan çıkarımı satır sınırını
 * aşan (`\s` newline'ı da yakalar) desenlerle yapılmalı.
 */
export function extractPdfText(buf: Buffer): string {
  const streams = inflateStreams(buf);
  const cmap = buildCmap(streams);
  if (cmap.size === 0) return "";

  const lines: string[] = [];

  for (const s of streams) {
    if (!/\bTj\b/.test(s)) continue;
    let cur = "";
    // Tm (mutlak konum → satır kırılımı) | Td (kerning, boşluk üretmez) | <hex> Tj
    const tok = /(?:-?[\d.]+\s+){4}(-?[\d.]+)\s+(-?[\d.]+)\s+Tm|(-?[\d.]+)\s+(-?[\d.]+)\s+Td|<([0-9A-Fa-f\s]+)>\s*Tj/g;
    let m: RegExpExecArray | null;

    while ((m = tok.exec(s))) {
      if (m[5] != null) {
        cur += decodeHex(m[5].replace(/\s/g, ""), cmap);
      } else if (m[2] != null) {
        // Yeni Tm → yeni satır.
        if (cur.trim()) lines.push(cur.trim());
        cur = "";
      }
      // Td: yalnızca kerning; hiçbir şey eklenmez.
    }
    if (cur.trim()) lines.push(cur.trim());
  }

  return lines.join("\n");
}
