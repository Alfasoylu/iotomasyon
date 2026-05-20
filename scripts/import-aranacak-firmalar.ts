/**
 * Phase 98b — Excel'deki "aranacak firmalar.xlsx" listesini Customer + LeadList'e aktar.
 *
 * Tek seferlik kullanım. Sayfa1 (1953 satır güvenlik/IT) + Sayfa3 (998 satır restoran/kafe)
 * → her İl/İlçe + sektör kombinasyonu için bir LeadList oluştur, üyelerini Customer olarak ekle.
 *
 * Konuşma notu mapping:
 *   "İlgilenmiyor"           → status=LOST, doNotCall=true, tag ilgilenmiyor-excel
 *   "Fiyat listesi paylaşıldı"→ status=CONTACTED, lastContactedAt=now, tag teklif-paylasildi
 *   "Gruba eklendi"          → tag wa-grup, status=CONTACTED
 *   diğer                    → status=NEW
 *
 * Sektör → segment + customerType mapping (B2B_RESELLER = sürekli alıcı bayi):
 *   Güvenlik Sistemi Tedarikçisi/Kurulum    → B2B_RESELLER + GUVENLIK_SIRKETI
 *   Güvenlik Şirketi                        → B2B_RESELLER + GUVENLIK_SIRKETI
 *   Bilgisayar Servisi/Destek/Güvenlik      → B2B_RESELLER + ONLINE_SATICI
 *   Nalbur, Elektronik mağazası             → B2B_RESELLER + MAGAZA
 *   Elektrikçi                              → INSTALLATION + PERAKENDE (kendi kullanır)
 *   Restoran, Cafe, Et lokantası, Pideci    → INSTALLATION + PERAKENDE (Sayfa3)
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/import-aranacak-firmalar.ts          # dry-run
 *   DATABASE_URL=... npx tsx scripts/import-aranacak-firmalar.ts --apply  # gerçek import
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type CustomerSegment, type CustomerStatus, type CustomerType } from "@prisma/client";
import * as XLSX from "xlsx";
import path from "path";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");
const EXCEL_PATH = path.resolve(process.cwd(), "docs/aranacak firmalar.xlsx");
const IMPORT_TAG = "excel-import-2026";
const CREATED_BY_EMAIL = "info@soyluelektronik.com"; // admin

// ─── Telefon normalizasyonu ────────────────────────────────────────────────
function normalizePhone(raw: number | string | null | undefined): string | null {
  if (raw == null) return null;
  let s = String(raw).replace(/\D/g, "");
  if (s.length === 0) return null;
  // Excel float → trailing .0 zaten replace edildi
  if (s.startsWith("90") && s.length === 12) s = s.slice(2); // 90 prefix at başında
  if (s.startsWith("0") && s.length === 11) s = s.slice(1);
  if (s.length !== 10) return null;
  // Turkish mobile/landline must start with 2-5
  if (!/^[2-5]/.test(s)) return null;
  return `+90${s}`;
}

// ─── Sektör → segment/customerType mapping ─────────────────────────────────
interface SectorMap {
  segment: CustomerSegment;
  customerType: CustomerType;
}

function mapSector(sektor: string | null | undefined): SectorMap {
  const s = (sektor ?? "").toLowerCase().trim();
  if (!s) return { segment: "B2B_RESELLER", customerType: "TOPTAN" };

  // Restoran/cafe — Sayfa3
  if (/restoran|lokantas|et yemekleri|kebab|pide|hamburger|kahvalt|cafe|kafe|mangal/.test(s)) {
    return { segment: "INSTALLATION", customerType: "PERAKENDE" };
  }
  // Güvenlik sistemi tedarikçisi/kurulum/şirketi → bayi
  if (/g[uü]venlik/.test(s)) {
    return { segment: "B2B_RESELLER", customerType: "GUVENLIK_SIRKETI" };
  }
  // Bilgisayar/IT
  if (/bilgisayar/.test(s)) {
    return { segment: "B2B_RESELLER", customerType: "ONLINE_SATICI" };
  }
  // Nalbur
  if (/nalbur/.test(s)) {
    return { segment: "B2B_RESELLER", customerType: "MAGAZA" };
  }
  // Elektronik mağazası
  if (/elektronik|teknoloji ma|ma[gğ]aza/.test(s)) {
    return { segment: "B2B_RESELLER", customerType: "MAGAZA" };
  }
  // Elektrikçi — kendi kullanır
  if (/elektrik[cç]i/.test(s)) {
    return { segment: "INSTALLATION", customerType: "PERAKENDE" };
  }
  // Varsayılan: B2B
  return { segment: "B2B_RESELLER", customerType: "TOPTAN" };
}

// ─── Türkiye il listesi (section header parse için) ───────────────────────
const TR_ILLER = new Set([
  "Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Aksaray", "Amasya", "Ankara",
  "Antalya", "Ardahan", "Artvin", "Aydın", "Balıkesir", "Bartın", "Batman",
  "Bayburt", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa",
  "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır", "Düzce", "Edirne",
  "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", "Giresun",
  "Gümüşhane", "Hakkari", "Hatay", "Iğdır", "Isparta", "İstanbul", "İzmir",
  "Kahramanmaraş", "Karabük", "Karaman", "Kars", "Kastamonu", "Kayseri", "Kilis",
  "Kırıkkale", "Kırklareli", "Kırşehir", "Kocaeli", "Konya", "Kütahya", "Malatya",
  "Manisa", "Mardin", "Mersin", "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu",
  "Osmaniye", "Rize", "Sakarya", "Samsun", "Şanlıurfa", "Siirt", "Sinop", "Sivas",
  "Şırnak", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Uşak", "Van", "Yalova",
  "Yozgat", "Zonguldak",
]);

interface CityDistrict {
  city: string;
  district: string;
}

function parseLocation(header: string): CityDistrict {
  const trimmed = header.trim();
  // "Diyarbakır Kayapınar" → il=Diyarbakır, ilçe=Kayapınar
  // "Bakırköy" → il=İstanbul (varsayılan), ilçe=Bakırköy
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2 && TR_ILLER.has(parts[0])) {
    return { city: parts[0], district: parts.slice(1).join(" ") };
  }
  // Standalone city name?
  if (parts.length === 1 && TR_ILLER.has(parts[0])) {
    return { city: parts[0], district: "Merkez" };
  }
  // Default: İstanbul ilçesi (Excel'in ilk kısmı tamamen İstanbul ilçeleri)
  return { city: "İstanbul", district: trimmed };
}

// ─── Konuşma notu mapping ──────────────────────────────────────────────────
interface KonusmaMap {
  status: CustomerStatus;
  doNotCall: boolean;
  tag: string | null;
  contacted: boolean;
}

function normalizeText(s: string): string {
  // Türkçe locale + combining diacritic temizliği (İ → i, ş → s, vb. tolerant)
  return s
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function mapKonusma(note: string | null | undefined): KonusmaMap {
  const n = normalizeText(note ?? "");
  if (!n) return { status: "NEW", doNotCall: false, tag: null, contacted: false };
  if (/ilgilenmiyor/.test(n)) {
    return { status: "LOST", doNotCall: true, tag: "ilgilenmiyor-excel", contacted: true };
  }
  if (/fiyat listesi/.test(n)) {
    return { status: "CONTACTED", doNotCall: false, tag: "teklif-paylasildi", contacted: true };
  }
  if (/grub|gruba/.test(n)) {
    return { status: "CONTACTED", doNotCall: false, tag: "wa-grup", contacted: true };
  }
  return { status: "NEW", doNotCall: false, tag: null, contacted: false };
}

// ─── Konuşma not'u customerNotes alanına yaz ───────────────────────────────
function buildCustomerNotes(parts: {
  konusma?: string | null;
  mapsLink?: string | null;
  email?: string | null;
  aramaTarihi?: string | null;
}): string {
  const lines: string[] = [];
  if (parts.konusma) lines.push(`[Önceki konuşma] ${parts.konusma}`);
  if (parts.aramaTarihi) lines.push(`[Arama tarihi] ${parts.aramaTarihi}`);
  if (parts.mapsLink) lines.push(`[Google Maps] ${parts.mapsLink}`);
  return lines.join("\n");
}

// ─── Ana akış ──────────────────────────────────────────────────────────────
interface RawRow {
  name: string;
  phone: string;
  sektor: string | null;
  email: string | null;
  address: string | null;
  link: string | null;
  konusma: string | null;
  aramaTarihi: string | null;
  city: string;
  district: string;
  sheet: "Sayfa1" | "Sayfa3";
}

function loadExcel(): RawRow[] {
  const wb = XLSX.readFile(EXCEL_PATH);

  const results: RawRow[] = [];

  // Sayfa1 — güvenlik/IT (Bakırköy, Bağcılar, ... section headers)
  const sh1 = wb.Sheets["Sayfa1"];
  if (sh1) {
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sh1, {
      header: 1,
      defval: null,
      raw: true,
    });
    let currentLoc: CityDistrict = { city: "İstanbul", district: "Bilinmeyen" };
    for (let i = 1; i < aoa.length; i++) {
      const r = aoa[i];
      const name = String(r[0] ?? "").trim();
      const phoneRaw = r[1];
      const sektor = r[2] ? String(r[2]).trim() : null;
      // Section header detection: name var, phone yok, sektor yok
      if (name && phoneRaw == null && !sektor) {
        currentLoc = parseLocation(name);
        continue;
      }
      const phone = normalizePhone(phoneRaw as number | string | null);
      if (!name || !phone) continue;
      results.push({
        name,
        phone,
        sektor,
        email: r[3] ? String(r[3]).trim() : null,
        address: r[4] ? String(r[4]).trim() : null,
        link: r[5] ? String(r[5]).trim() : null,
        konusma: r[6] ? String(r[6]).trim() : null,
        aramaTarihi: r[10] ? String(r[10]).trim() : null,
        city: currentLoc.city,
        district: currentLoc.district,
        sheet: "Sayfa1",
      });
    }
  }

  // Sayfa3 — restoran/cafe
  const sh3 = wb.Sheets["Sayfa3"];
  if (sh3) {
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sh3, {
      header: 1,
      defval: null,
      raw: true,
    });
    let currentLoc: CityDistrict = { city: "İstanbul", district: "Bilinmeyen" };
    for (let i = 2; i < aoa.length; i++) {
      const r = aoa[i];
      const name = String(r[0] ?? "").trim();
      const phoneRaw = r[1];
      const sektor = r[2] ? String(r[2]).trim() : null;
      if (name && phoneRaw == null && !sektor) {
        currentLoc = parseLocation(name.replace(/^İstanbul\s+/i, "İstanbul "));
        continue;
      }
      const phone = normalizePhone(phoneRaw as number | string | null);
      if (!name || !phone) continue;
      results.push({
        name,
        phone,
        sektor,
        email: r[3] ? String(r[3]).trim() : null,
        address: r[4] ? String(r[4]).trim() : null,
        link: r[5] ? String(r[5]).trim() : null,
        konusma: r[6] ? String(r[6]).trim() : null,
        aramaTarihi: null,
        city: currentLoc.city,
        district: currentLoc.district,
        sheet: "Sayfa3",
      });
    }
  }

  return results;
}

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY (write)" : "DRY-RUN"}`);
  console.log(`Excel: ${EXCEL_PATH}\n`);

  const rows = loadExcel();
  console.log(`Excel parse: ${rows.length} valid satır (telefon dolu)\n`);

  // Phone dedup within Excel + against DB
  const seenInExcel = new Set<string>();
  const uniqueRows: RawRow[] = [];
  let duplicateInExcel = 0;
  for (const r of rows) {
    if (seenInExcel.has(r.phone)) {
      duplicateInExcel++;
      continue;
    }
    seenInExcel.add(r.phone);
    uniqueRows.push(r);
  }
  console.log(`Excel içinde duplicate telefon: ${duplicateInExcel}`);
  console.log(`Unique telefon: ${uniqueRows.length}\n`);

  // Find admin user
  const admin = await prisma.user.findUnique({ where: { email: CREATED_BY_EMAIL } });
  if (!admin) {
    console.error(`Admin user (${CREATED_BY_EMAIL}) bulunamadı!`);
    process.exit(1);
  }

  // Existing DB phones
  const existing = await prisma.customer.findMany({
    where: {
      OR: [
        { phone: { in: uniqueRows.map((r) => r.phone) } },
        { whatsapp: { in: uniqueRows.map((r) => r.phone) } },
      ],
    },
    select: { id: true, phone: true, whatsapp: true, name: true, segment: true, tags: true },
  });
  const existingByPhone = new Map<string, (typeof existing)[number]>();
  for (const e of existing) {
    if (e.phone) existingByPhone.set(e.phone, e);
    if (e.whatsapp) existingByPhone.set(e.whatsapp, e);
  }
  console.log(`DB'de zaten var olan: ${existingByPhone.size}\n`);

  // Bucket rows by city+district — sektör Customer.customerType + tag ile filtrelenir
  const buckets = new Map<string, RawRow[]>();
  for (const r of uniqueRows) {
    const key = `${r.city}__${r.district}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(r);
  }
  console.log(`Oluşacak LeadList sayısı: ${buckets.size}\n`);

  // Stats
  const stats = {
    newCustomers: 0,
    skippedExisting: 0,
    updatedTagsOnExisting: 0,
    statusLost: 0,
    statusContacted: 0,
    statusNew: 0,
    segmentB2B: 0,
    segmentInstallation: 0,
    leadListsCreated: 0,
  };

  // Process each bucket
  for (const [key, bucketRows] of buckets) {
    const [city, district] = key.split("__");
    const leadListName = `${city} ${district} (Excel 2024-2025)`;
    const sektorLabel = "Karışık sektör";

    if (!APPLY) {
      console.log(`[DRY] LeadList: ${leadListName} (${bucketRows.length} firma)`);
    }

    // Create LeadList
    let leadListId: string | null = null;
    if (APPLY) {
      const leadList = await prisma.leadList.create({
        data: {
          name: leadListName,
          source: "Excel Import",
          city,
          category: sektorLabel,
          createdById: admin.id,
        },
      });
      leadListId = leadList.id;
      stats.leadListsCreated++;
    } else {
      stats.leadListsCreated++;
    }

    // Insert each customer
    for (const r of bucketRows) {
      const sector = mapSector(r.sektor);
      const konusma = mapKonusma(r.konusma);

      if (sector.segment === "B2B_RESELLER") stats.segmentB2B++;
      else stats.segmentInstallation++;

      if (konusma.status === "LOST") stats.statusLost++;
      else if (konusma.status === "CONTACTED") stats.statusContacted++;
      else stats.statusNew++;

      const customerNotes = buildCustomerNotes({
        konusma: r.konusma,
        mapsLink: r.link,
        aramaTarihi: r.aramaTarihi,
      });

      const cityTag = normalizeText(r.city).replace(/\s+/g, "-");
      const districtTag = normalizeText(r.district).replace(/\s+/g, "-");
      const sectorTag = r.sektor ? normalizeText(r.sektor).replace(/\s+/g, "-").slice(0, 30) : null;
      const baseTags = [IMPORT_TAG, cityTag, `${cityTag}-${districtTag}`];
      if (sectorTag) baseTags.push(sectorTag);
      if (konusma.tag) baseTags.push(konusma.tag);

      const existing = existingByPhone.get(r.phone);
      if (existing) {
        // Mevcut müşteriye sadece tag merge + membership
        if (APPLY) {
          const mergedTags = Array.from(new Set([...existing.tags, ...baseTags]));
          await prisma.customer.update({
            where: { id: existing.id },
            data: { tags: mergedTags },
          });
          if (leadListId) {
            await prisma.customerLeadListMembership.upsert({
              where: { customerId_leadListId: { customerId: existing.id, leadListId } },
              create: { customerId: existing.id, leadListId },
              update: {},
            });
          }
        }
        stats.updatedTagsOnExisting++;
        continue;
      }

      // Yeni müşteri
      if (APPLY) {
        const customer = await prisma.customer.create({
          data: {
            name: r.name,
            phone: r.phone,
            whatsapp: r.phone,
            email: r.email,
            city: r.city,
            district: r.district,
            address: r.address,
            status: konusma.status,
            customerType: sector.customerType,
            segment: sector.segment,
            source: "Excel Import — Google Maps 2024-2025",
            customerNotes,
            tags: baseTags,
            doNotCall: konusma.doNotCall,
            isActive: true,
            ownedById: admin.id,
            lastContactedAt: konusma.contacted ? new Date() : null,
          },
        });
        if (leadListId) {
          await prisma.customerLeadListMembership.create({
            data: { customerId: customer.id, leadListId },
          });
        }
      }
      stats.newCustomers++;
    }

    if (APPLY && leadListId) {
      await prisma.leadList.update({
        where: { id: leadListId },
        data: { totalCount: bucketRows.length },
      });
    }
  }

  console.log("\n========== ÖZET ==========");
  console.log(`LeadList oluşturulacak/oluşturuldu: ${stats.leadListsCreated}`);
  console.log(`Yeni Customer:                       ${stats.newCustomers}`);
  console.log(`Mevcut Customer (tag merge):         ${stats.updatedTagsOnExisting}`);
  console.log(`\nSegment dağılımı:`);
  console.log(`  B2B_RESELLER:    ${stats.segmentB2B}`);
  console.log(`  INSTALLATION:    ${stats.segmentInstallation}`);
  console.log(`\nStatus dağılımı (önceki konuşmaya göre):`);
  console.log(`  NEW (hiç konuşulmamış):      ${stats.statusNew}`);
  console.log(`  CONTACTED (teklif/wa-grup):  ${stats.statusContacted}`);
  console.log(`  LOST (ilgilenmiyor):         ${stats.statusLost}`);
  console.log(`\nMode: ${APPLY ? "APPLIED ✅" : "DRY-RUN (nothing written)"}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
