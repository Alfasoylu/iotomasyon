/**
 * Phase 99 — Industry hiyerarşisi seed + Customer backfill
 *
 * Ana gruplar (sortOrder ile sıralı):
 *   1. Güvenlik Bayisi
 *   2. Yan Bayi
 *   3. Montaj Müşterisi
 *   4. Pazaryeri Müşterisi
 *   5. Diğer
 *
 * Her ana grubun altında alt sektörler. Excel import sırasında Customer.tags'e
 * yazılmış sektör adı baz alınarak müşteriler backfill edilir.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/seed-industries.ts          # dry-run
 *   DATABASE_URL=... npx tsx scripts/seed-industries.ts --apply  # gerçek
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");

// Hiyerarşi: parent slug -> children
interface IndustryNode {
  slug: string;
  name: string;
  sortOrder: number;
  children?: IndustryNode[];
}

const HIERARCHY: IndustryNode[] = [
  {
    slug: "guvenlik-bayisi",
    name: "Güvenlik Bayisi",
    sortOrder: 10,
    children: [
      { slug: "guvenlik-sistemi-tedarikcisi", name: "Güvenlik Sistemi Tedarikçisi", sortOrder: 11 },
      { slug: "guvenlik-sistemi-kurulum", name: "Güvenlik Sistemi Kurulum Hizmeti", sortOrder: 12 },
      { slug: "guvenlik-sirketi", name: "Güvenlik Şirketi", sortOrder: 13 },
      { slug: "bilgisayar-guvenlik", name: "Bilgisayar Güvenlik Hizmetleri", sortOrder: 14 },
    ],
  },
  {
    slug: "yan-bayi",
    name: "Yan Bayi",
    sortOrder: 20,
    children: [
      { slug: "nalbur", name: "Nalbur / Yapı Marketi", sortOrder: 21 },
      { slug: "elektronik-magaza", name: "Elektronik Eşya Mağazası", sortOrder: 22 },
      { slug: "bilgisayar-servisi", name: "Bilgisayar Servisi / Destek", sortOrder: 23 },
      { slug: "elektrikci", name: "Elektrikçi", sortOrder: 24 },
      { slug: "muhendislik", name: "Mühendislik Firması", sortOrder: 25 },
      { slug: "kablosuz-internet", name: "Kablosuz İnternet / Telekom", sortOrder: 26 },
    ],
  },
  {
    slug: "montaj-musterisi",
    name: "Montaj Müşterisi",
    sortOrder: 30,
    children: [
      { slug: "restoran-cafe", name: "Restoran / Cafe", sortOrder: 31 },
      { slug: "site-yonetimi", name: "Site Yönetimi", sortOrder: 32 },
      { slug: "otel-pansiyon", name: "Otel / Pansiyon", sortOrder: 33 },
      { slug: "ofis-isyeri", name: "Ofis / İşyeri", sortOrder: 34 },
      { slug: "perakende-magaza", name: "Perakende Mağaza", sortOrder: 35 },
      { slug: "fabrika-depo", name: "Fabrika / Depo", sortOrder: 36 },
    ],
  },
  {
    slug: "pazaryeri-musterisi",
    name: "Pazaryeri Müşterisi",
    sortOrder: 40,
    children: [
      { slug: "entegra-pazaryeri", name: "Entegra (Trendyol/Hepsiburada vb.)", sortOrder: 41 },
    ],
  },
  {
    slug: "diger",
    name: "Diğer",
    sortOrder: 90,
    children: [
      { slug: "diger-alt", name: "Sınıflandırılmamış", sortOrder: 91 },
    ],
  },
];

// ─── Excel sektör tag'lerinden alt-Industry slug'una mapping ──────────────
// Customer.tags'lerden hangi pattern hangi slug'a gidecek
function tagToIndustrySlug(tagOrSector: string): string | null {
  const s = tagOrSector.toLocaleLowerCase("tr-TR");
  // Güvenlik Bayisi grubu
  if (/g[uü]venlik sistemi tedarik/.test(s)) return "guvenlik-sistemi-tedarikcisi";
  if (/g[uü]venlik sistemi kurulum/.test(s)) return "guvenlik-sistemi-kurulum";
  if (/bilgisayar g[uü]venlik/.test(s)) return "bilgisayar-guvenlik";
  if (/g[uü]venlik [sş]irketi/.test(s)) return "guvenlik-sirketi";
  // Yan Bayi
  if (/nalbur|yapi market|yapı market/.test(s)) return "nalbur";
  if (/elektronik e[sş]ya|elektronik ma[gğ]aza/.test(s)) return "elektronik-magaza";
  if (/bilgisayar (servis|destek|tamir)/.test(s)) return "bilgisayar-servisi";
  if (/elektrik[cç]i/.test(s)) return "elektrikci";
  if (/m[uü]hendislik/.test(s)) return "muhendislik";
  if (/kablosuz internet|telekom/.test(s)) return "kablosuz-internet";
  // Montaj Müşterisi
  if (/restoran|lokantas|et yemekleri|kebab|pide|hamburger|kahvalt|cafe|kafe|mangal|[cç]orba/.test(s)) {
    return "restoran-cafe";
  }
  if (/site y[oö]netim/.test(s)) return "site-yonetimi";
  if (/otel|pansiyon/.test(s)) return "otel-pansiyon";
  if (/ofis|i[sş]yeri/.test(s)) return "ofis-isyeri";
  return null;
}

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);

  // 1) Industry hiyerarşisini seed et
  const slugToId = new Map<string, string>();
  for (const parent of HIERARCHY) {
    let parentRow = await prisma.industry.findUnique({ where: { slug: parent.slug } });
    if (!parentRow) {
      if (APPLY) {
        parentRow = await prisma.industry.create({
          data: { slug: parent.slug, name: parent.name, sortOrder: parent.sortOrder },
        });
      } else {
        console.log(`[DRY] Create parent: ${parent.name}`);
      }
    }
    if (parentRow) slugToId.set(parent.slug, parentRow.id);

    for (const child of parent.children ?? []) {
      let childRow = await prisma.industry.findUnique({ where: { slug: child.slug } });
      if (!childRow) {
        if (APPLY) {
          childRow = await prisma.industry.create({
            data: {
              slug: child.slug,
              name: child.name,
              sortOrder: child.sortOrder,
              parentId: parentRow?.id ?? null,
            },
          });
        } else {
          console.log(`[DRY]   Create child: ${child.name}  (parent: ${parent.name})`);
        }
      }
      if (childRow) slugToId.set(child.slug, childRow.id);
    }
  }
  console.log(`\nIndustry seed: ${slugToId.size} kayıt\n`);

  if (!APPLY) {
    console.log("DRY-RUN: hiçbir şey yazılmadı. --apply ile çalıştır.");
    return;
  }

  // 2) Müşterileri backfill et
  const stats = {
    fromTags: 0,
    fromSegment: 0,
    fromCustomerType: 0,
    noMatch: 0,
  };

  // Önce Marketplace müşterileri
  const entegraId = slugToId.get("entegra-pazaryeri");
  if (entegraId) {
    const updated = await prisma.customer.updateMany({
      where: { segment: "MARKETPLACE", industryId: null },
      data: { industryId: entegraId },
    });
    stats.fromSegment += updated.count;
    console.log(`Pazaryeri müşterileri: ${updated.count} kayıt entegra-pazaryeri'ye atandı`);
  }

  // Sonra tags ile match
  const customers = await prisma.customer.findMany({
    where: { industryId: null, isActive: true },
    select: { id: true, tags: true, customerType: true, segment: true },
  });
  console.log(`Backfill bekliyor: ${customers.length} müşteri`);

  for (const c of customers) {
    let matchedSlug: string | null = null;
    for (const tag of c.tags) {
      const s = tagToIndustrySlug(tag);
      if (s) {
        matchedSlug = s;
        break;
      }
    }
    // Tags'te bulunamadı → customerType'tan tahmin et
    if (!matchedSlug) {
      switch (c.customerType) {
        case "GUVENLIK_SIRKETI":
          matchedSlug = "guvenlik-sistemi-tedarikcisi";
          break;
        case "MAGAZA":
          matchedSlug = "elektronik-magaza";
          break;
        case "ONLINE_SATICI":
          matchedSlug = "bilgisayar-servisi";
          break;
        case "SITE_YONETICISI":
          matchedSlug = "site-yonetimi";
          break;
        case "PERAKENDE":
          matchedSlug = "perakende-magaza";
          break;
        case "TOPTAN":
          matchedSlug = "guvenlik-sistemi-tedarikcisi";
          break;
        default:
          matchedSlug = "diger-alt";
      }
      stats.fromCustomerType++;
    } else {
      stats.fromTags++;
    }

    const indId = slugToId.get(matchedSlug);
    if (!indId) {
      stats.noMatch++;
      continue;
    }
    await prisma.customer.update({
      where: { id: c.id },
      data: { industryId: indId },
    });
  }

  console.log("\n========== ÖZET ==========");
  console.log(`Pazaryeri segment'ten atanan:   ${stats.fromSegment}`);
  console.log(`Tag pattern eşleşmesinden:      ${stats.fromTags}`);
  console.log(`CustomerType varsayılanından:   ${stats.fromCustomerType}`);
  console.log(`Eşleşmedi (diger-alt'a düştü):  ${stats.noMatch}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
