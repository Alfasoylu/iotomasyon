/**
 * GTİP açıklama atama scripti
 *
 * 1) 98 TGTC Excel fasılını okur → GTİP→açıklama haritası
 * 2) Her ürün için gtip1/2/3'ün açıklamasını bulup gtip1Desc/2Desc/3Desc'e yazar
 *
 * Usage:
 *   DATABASE_URL=... DIRECT_URL=... npx tsx scripts/assign-gtip-descriptions.ts          # dry-run
 *   DATABASE_URL=... DIRECT_URL=... npx tsx scripts/assign-gtip-descriptions.ts --apply
 */
import * as fs from "fs";
import * as path from "path";
import * as xlsx from "xlsx";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const cs = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString: cs! });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");

const TGTC_DIR = "C:/dev/iotomasyoncom/iotomasyon/ithalat/gtip/2024 TGTC";
const CODE_RE = /^\d{4}\.\d{2}\.\d{2}\.\d{2}\.\d{2}$/;

// "- - - " prefixlerini temizle, fazla boşlukları azalt
function cleanDesc(s: string): string {
  return s
    .replace(/^[\s-]+/, "")   // baştaki "- - - " hiyerarşi göstergesi
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * DB'deki kod formatı: "85.25.81.99.00" (10 hane, 2-2-2-2-2)
 * Excel formatı: "8525.81.99.00.00" (12 hane, 4-2-2-2-2)
 *
 * İlk iki bloğu birleştirip sonuna "00" ekle. Eğer kod zaten 4-2-2-2-2 ise
 * olduğu gibi döner.
 */
function toExcelFormat(dbCode: string): string {
  const parts = dbCode.split(".");
  if (parts.length === 5) {
    // 2-2-2-2-2 → 4-2-2-2-2 (sonuna .00 eklenmiş)
    if (parts[0].length === 2) {
      return `${parts[0]}${parts[1]}.${parts[2]}.${parts[3]}.${parts[4]}.00`;
    }
    // 4-2-2-2-2 zaten doğru
    if (parts[0].length === 4) {
      return dbCode;
    }
  }
  return dbCode;
}

function loadGtipMap(): Map<string, string> {
  const map = new Map<string, string>();
  const files = fs.readdirSync(TGTC_DIR).filter((f) => f.endsWith(".xls"));
  console.log(`📂 ${files.length} fasıl dosyası okunuyor...`);
  for (const f of files) {
    try {
      const wb = xlsx.readFile(path.join(TGTC_DIR, f));
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
      let count = 0;
      for (const row of rows) {
        if (!Array.isArray(row) || row.length < 2) continue;
        const code = String(row[0] ?? "").trim();
        const descRaw = String(row[1] ?? "").trim();
        if (!CODE_RE.test(code) || !descRaw) continue;
        map.set(code, cleanDesc(descRaw));
        count++;
      }
      // console.log(`  ${f}: ${count} kod`);
    } catch (e) {
      console.error(`  ✗ ${f} okunamadı:`, (e as Error).message);
    }
  }
  console.log(`✓ Toplam ${map.size} GTİP kodu yüklendi.`);
  return map;
}

async function main() {
  const gtipMap = loadGtipMap();

  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true, name: true, gtip1: true, gtip2: true, gtip3: true },
  });

  console.log(`\n═══ ${products.length} aktif ürün için açıklama lookup ═══\n`);

  let totalSlots = 0;
  let matchedSlots = 0;
  const missingCodes = new Set<string>();
  const updates: { id: string; gtip1Desc: string | null; gtip2Desc: string | null; gtip3Desc: string | null }[] = [];

  for (const p of products) {
    const lookup = (code: string | null): string | null => {
      if (!code) return null;
      totalSlots++;
      if (code === "00.00.00.00.00") return null;
      const excelCode = toExcelFormat(code);

      // 1) Tam eşleşme
      const direct = gtipMap.get(excelCode);
      if (direct) {
        matchedSlots++;
        return direct;
      }

      // 2) Prefix fallback: aynı fasıl/pozisyonda alt-kodlardan birinin açıklamasını al
      // (8203.20.00.00.00 yoksa, 8203.20.XX.XX.XX'ten birini dene)
      const prefixes = [
        excelCode.split(".").slice(0, 4).join(".") + ".",   // 8203.20.00.00.
        excelCode.split(".").slice(0, 3).join(".") + ".",   // 8203.20.00.
        excelCode.split(".").slice(0, 2).join(".") + ".",   // 8203.20.
      ];
      for (const prefix of prefixes) {
        for (const [k, v] of gtipMap.entries()) {
          if (k.startsWith(prefix)) {
            matchedSlots++;
            // İçeriği "kategori üst tanım: kapsayan ifade" olarak işaretle
            return `${v.split("(")[0].trim()} (kapsayan)`.replace(/\s+/g, " ").trim();
          }
        }
      }

      missingCodes.add(`${code} (lookup: ${excelCode})`);
      return null;
    };

    updates.push({
      id: p.id,
      gtip1Desc: lookup(p.gtip1),
      gtip2Desc: lookup(p.gtip2),
      gtip3Desc: lookup(p.gtip3),
    });
  }

  console.log(`Lookup özeti:`);
  console.log(`  Toplam GTİP slot: ${totalSlots}`);
  console.log(`  Açıklama eşleşen: ${matchedSlots} (%${((matchedSlots / totalSlots) * 100).toFixed(1)})`);
  console.log(`  Açıklama bulunamayan: ${totalSlots - matchedSlots}`);

  if (missingCodes.size > 0 && missingCodes.size < 50) {
    console.log(`\n⚠ Eşleşmeyen kodlar (TGTC'de yok):`);
    for (const c of Array.from(missingCodes).sort()) console.log(`    ${c}`);
  } else if (missingCodes.size >= 50) {
    console.log(`\n⚠ ${missingCodes.size} kod eşleşmedi (ilk 20):`);
    for (const c of Array.from(missingCodes).sort().slice(0, 20)) console.log(`    ${c}`);
  }

  // 10 örnek
  console.log(`\n10 örnek:`);
  for (const u of updates.filter((x) => x.gtip1Desc).slice(0, 10)) {
    const p = products.find((x) => x.id === u.id)!;
    console.log(`  [${p.gtip1}] ${u.gtip1Desc?.slice(0, 70)}`);
    console.log(`     ${p.name.slice(0, 70)}`);
  }

  if (!APPLY) {
    console.log("\n⚠ Dry-run. --apply ekleyerek uygula.");
    return;
  }

  console.log("\n═══ Açıklamalar uygulanıyor... ═══");
  let done = 0;
  const BATCH = 50;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    await Promise.all(batch.map((u) =>
      prisma.product.update({
        where: { id: u.id },
        data: {
          gtip1Desc: u.gtip1Desc,
          gtip2Desc: u.gtip2Desc,
          gtip3Desc: u.gtip3Desc,
        },
      })
    ));
    done += batch.length;
    process.stdout.write(`\r  ${done}/${updates.length}`);
  }
  console.log(`\n✅ Toplam ${done} ürün güncellendi.`);
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
