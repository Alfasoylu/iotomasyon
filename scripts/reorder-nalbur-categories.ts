/**
 * Nalbur profili kategorilerini doğru sıraya çek:
 *   1. Musluk (banyo-mutfak-bataryasi) — ANA ürün
 *   2. El aleti (el-aleti-lehim)
 *   3. Aydınlatma (aydinlatma-led)
 *   4. Su arıtma (su-aritma-pompa-akvaryum)
 *   5. Pil (pil-aku)
 *   6. Güç kaynağı (guc-kaynagi-donusturucu) — EN SON (nalbur'a az ilgili)
 */
import { config as loadEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

loadEnv();
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL!;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  const correctOrder = [
    "banyo-mutfak-bataryasi",
    "el-aleti-lehim",
    "aydinlatma-led",
    "su-aritma-pompa-akvaryum",
    "pil-aku",
    "guc-kaynagi-donusturucu",
  ];

  const updated = await prisma.catalogProfile.update({
    where: { slug: "nalbur" },
    data: {
      categorySlugs: correctOrder,
      title: "Nalbur & Yapı Marketi Kataloğu",
      subtitle: "Musluk · El Aleti · Aydınlatma · Su Arıtma · Pil",
    },
  });
  console.log("Nalbur kategorileri yeniden sıralandı:");
  updated.categorySlugs.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));

  // Aynı düzeltmeyi elektrikçi için de yap (aydınlatma ilk)
  const elektrikciOrder = [
    "aydinlatma-led",
    "el-aleti-lehim",
    "elektronik-modul-gelistirme",
    "olcum-test-cihazlari",
    "motor-rc-surucu",
    "guc-kaynagi-donusturucu",
  ];
  const ele = await prisma.catalogProfile.update({
    where: { slug: "elektrikci" },
    data: {
      categorySlugs: elektrikciOrder,
      subtitle: "Aydınlatma · El Aleti · Modül · Ölçüm · Motor",
    },
  });
  console.log("\nElektrikçi kategorileri yeniden sıralandı:");
  ele.categorySlugs.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
