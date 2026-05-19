/**
 * Hepsiburada deep probe — farklı endpoint'ler + farklı auth formatları.
 */
const MERCHANT_ID = "ed812a85-e25c-4cdb-933b-2efeba9751d6";
const PASSWORD = "8NfJp3KgrREm";
const USERNAMES_PRIMARY = [
  "stockmount_dev",
  "entegra_dev",
  "radium",
  "7000056851",      // Cari no — yeni keşif!
  "alfasoylu",       // store slug (hepsiburada.com/magaza/alfasoylu)
];

const ENDPOINTS: { label: string; url: string }[] = [
  { label: "MPOP prod  /product/api/products/all-products-of-merchant", url: `https://mpop.hepsiburada.com/product/api/products/all-products-of-merchant/${MERCHANT_ID}?page=0&size=1` },
  { label: "MPOP sit   /product/api/products/all-products-of-merchant", url: `https://mpop-sit.hepsiburada.com/product/api/products/all-products-of-merchant/${MERCHANT_ID}?page=0&size=1` },
  { label: "OMS prod   /orders/merchantid/.../paid",                     url: `https://oms-external.hepsiburada.com/orders/merchantid/${MERCHANT_ID}/paid?limit=1&offset=0` },
  { label: "OMS sit    /orders/merchantid/.../paid",                     url: `https://oms-external-sit.hepsiburada.com/orders/merchantid/${MERCHANT_ID}/paid?limit=1&offset=0` },
  { label: "Listings prod /listings/merchantid",                          url: `https://listing-external.hepsiburada.com/listings/merchantid/${MERCHANT_ID}?page=0&size=1` },
  { label: "Listings sit  /listings/merchantid",                          url: `https://listing-external-sit.hepsiburada.com/listings/merchantid/${MERCHANT_ID}?page=0&size=1` },
];

async function tryFetch(url: string, username: string, password: string): Promise<{ status: number; body: string }> {
  const auth = Buffer.from(`${username}:${password}`).toString("base64");
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "User-Agent": `iotomasyon-crm/1.0 ${MERCHANT_ID}`,
      },
    });
    const body = await res.text();
    return { status: res.status, body: body.slice(0, 200) };
  } catch (e) {
    return { status: -1, body: (e as Error).message.slice(0, 200) };
  }
}

(async () => {
  console.log(`merchantId: ${MERCHANT_ID}\npassword: ${PASSWORD.slice(0,4)}…\n`);
  console.log("Endpoint × username matrix:\n");
  for (const ep of ENDPOINTS) {
    console.log(`▸ ${ep.label}`);
    for (const u of USERNAMES_PRIMARY) {
      const r = await tryFetch(ep.url, u, PASSWORD);
      const tag = r.status === 200 ? "✓ 200 OK" : `✗ ${r.status}`;
      console.log(`    username=${u.padEnd(16)} → ${tag.padEnd(10)} ${r.body.slice(0, 120)}`);
      if (r.status === 200) {
        console.log(`\n🎉 BAŞARILI: ${ep.url}  with username=${u}\n`);
        console.log(`Response (first 500 chars): ${r.body.slice(0, 500)}`);
        return;
      }
    }
  }
  console.log("\n❌ Hiçbir endpoint+username kombinasyonu 200 dönmedi.");
})().catch((e) => { console.error(e); process.exit(1); });
