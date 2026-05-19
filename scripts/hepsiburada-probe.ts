/**
 * Hepsiburada canlı bağlantı testi — doğru creds aramaca.
 *
 * Ekrandaki bilgiler:
 *   merchantId = "ed812a85-e25c-4cdb-933b-2efeba9751d6" (UUID)
 *   Servis Anahtarı = "8NfJp3KgrREm" (password)
 *   Aday username'ler: stockmount_dev / entegra_dev / radium
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { testHepsiburadaConnection, fetchHepsiburadaCatalog } from "@/lib/hepsiburada-api";

const cs = process.env.DIRECT_URL!;
const adapter = new PrismaPg({ connectionString: cs });
const p = new PrismaClient({ adapter });

const MERCHANT_ID = "ed812a85-e25c-4cdb-933b-2efeba9751d6";
const PASSWORD = "8NfJp3KgrREm";

const USERNAMES = [
  "stockmount_dev",
  "entegra_dev",
  "radium",
  "alfasoylu",
  // composite formats (Hepsiburada bazen merchantId.integrator istiyor)
  `${MERCHANT_ID}.stockmount_dev`,
  `${MERCHANT_ID}.entegra_dev`,
  `${MERCHANT_ID}.radium`,
  // sade merchantId
  MERCHANT_ID,
  // mağaza ID sayısal (önceki paylaştığınız)
  "5789510254568",
];

(async () => {
  console.log(`merchantId: ${MERCHANT_ID}\npassword: ${PASSWORD.slice(0,4)}…\n`);
  let winner: string | null = null;

  for (const u of USERNAMES) {
    process.stdout.write(`username=${u.padEnd(16)} → `);
    const res = await testHepsiburadaConnection({
      merchantId: MERCHANT_ID, username: u, password: PASSWORD,
    });
    console.log(res.ok ? "✓ BAŞARILI" : `✗ ${res.message.slice(0, 90)}`);
    if (res.ok) {
      console.log(`   ↳ ${res.message}`);
      winner = u;
      break;
    }
  }

  if (winner) {
    console.log(`\n✅ Doğru username: ${winner}`);
    const cat = await fetchHepsiburadaCatalog(
      { merchantId: MERCHANT_ID, username: winner, password: PASSWORD },
      { page: 0, size: 5 },
    );
    console.log(`\nMağazada toplam ${cat.totalElements ?? "?"} ürün, ${cat.totalPages ?? "?"} sayfa.`);
    console.log("İlk 5 örnek:");
    for (const it of cat.content?.slice(0, 5) ?? []) {
      console.log(`  bar=${it.barcode ?? "—"}  sku=${it.merchantSku ?? "—"}  hb=${it.hbSku ?? "—"}  name=${(it.productName ?? "").slice(0, 50)}`);
    }

    await p.hepsiburadaConfig.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        merchantId: MERCHANT_ID,
        username: winner,
        password: PASSWORD,
        storeName: "alfasoylu",
        isEnabled: true,
      },
      update: {
        merchantId: MERCHANT_ID,
        username: winner,
        password: PASSWORD,
        storeName: "alfasoylu",
        isEnabled: true,
      },
    });
    console.log("\n💾 HepsiburadaConfig DB'ye kaydedildi (isEnabled=true).");
  } else {
    console.log("\n❌ Hiçbir username çalışmadı. Mağaza panelinde 'Servis Anahtarı'na tıklayıp tam bilgilerin görüldüğü ekranı paylaşabilir misiniz?");
  }

  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
