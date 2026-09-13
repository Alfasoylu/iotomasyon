/**
 * Meta reklam verisi normalleştirme testleri — ağ GEREKTİRMEZ.
 * Çalıştır: npm run check:ads
 *
 * Neden bu kadar test: bu katmandaki hataların hepsi SESSİZ. Graph API hata
 * döndürmez, sadece yanlış sayı üretir — ve o sayıya bakıp bütçe kararı
 * verilir. Canlı API'ye bu ortamdan erişilemediği için tuzaklar burada,
 * gerçek yanıt biçimleri taklit edilerek yakalanır.
 */

import assert from "node:assert/strict";
import {
  num,
  pickAction,
  normalizeInsight,
  summarize,
  normalizeAccountId,
  PURCHASE_ACTION_PRIORITY,
} from "../lib/meta/insights";

let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  OK   ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL ${name}\n         ${e instanceof Error ? e.message : e}`);
  }
}

console.log("\nMeta reklam verisi testleri\n");

// ── Sayı çevirimi ─────────────────────────────────────────────────────────
check("Graph API string sayıları sayıya çevrilir", () => {
  // Graph TUM sayilari string dondurur. Cevrilmezse "12" + "34" = "1234".
  assert.equal(num("1234.56"), 1234.56);
  assert.equal(num("0"), 0);
  assert.equal(num(42), 42);
});

check("Eksik/bozuk değer 0 olur, NaN yayılmaz", () => {
  // NaN bir kez girerse tum toplam NaN olur ve panel bos gorunur.
  assert.equal(num(undefined), 0);
  assert.equal(num(null), 0);
  assert.equal(num(""), 0);
  assert.equal(num("abc"), 0);
  assert.ok(!Number.isNaN(num("abc")));
});

// ── Satın alma seçimi: EN KRİTİK NOKTA ────────────────────────────────────
check("Satın alma TEK tipten okunur, TOPLANMAZ", () => {
  // Meta ayni satisi uc ayri action_type altinda raporlar. Toplamak ciroyu
  // uce katlar ve ROAS'i uydurur.
  const actions = [
    { action_type: "omni_purchase", value: "3" },
    { action_type: "offsite_conversion.fb_pixel_purchase", value: "3" },
    { action_type: "purchase", value: "3" },
  ];
  assert.equal(pickAction(actions), 3, "3 olmali — 9 degil");
});

check("Öncelik sırası: omni_purchase kazanır", () => {
  assert.equal(PURCHASE_ACTION_PRIORITY[0], "omni_purchase");
  const actions = [
    { action_type: "purchase", value: "5" },
    { action_type: "omni_purchase", value: "2" },
  ];
  assert.equal(pickAction(actions), 2, "tekillestirilmis olcu tercih edilmeli");
});

check("omni yoksa pixel sayacına, o da yoksa purchase'a düşülür", () => {
  assert.equal(
    pickAction([{ action_type: "offsite_conversion.fb_pixel_purchase", value: "7" }]),
    7
  );
  assert.equal(pickAction([{ action_type: "purchase", value: "9" }]), 9);
});

check("Alakasız action tipleri satın alma sayılmaz", () => {
  // "link_click" ve "landing_page_view" her kampanyada bulunur; bunlari
  // satis sanmak donusum oranini uydururdu.
  const actions = [
    { action_type: "link_click", value: "500" },
    { action_type: "landing_page_view", value: "300" },
    { action_type: "add_to_cart", value: "20" },
  ];
  assert.equal(pickAction(actions), 0);
});

check("Hiç dönüşüm yoksa alan YOKTUR — çökmemeli", () => {
  // Meta bos dizi degil, alani HIC gondermez.
  assert.equal(pickAction(undefined), 0);
  assert.equal(pickAction([]), 0);
});

// ── Tek kampanya ──────────────────────────────────────────────────────────
check("Kampanya normalleştirmesi", () => {
  const k = normalizeInsight({
    campaign_id: "1",
    campaign_name: "ALFAS Katalog",
    spend: "350.00",
    impressions: "10000",
    clicks: "200",
    actions: [{ action_type: "omni_purchase", value: "4" }],
    action_values: [{ action_type: "omni_purchase", value: "7000.00" }],
  });
  assert.equal(k.spend, 350);
  assert.equal(k.purchases, 4);
  assert.equal(k.revenue, 7000);
  assert.equal(k.ctr, 2, "200/10000 = %2");
  assert.equal(k.cpc, 1.75);
  assert.equal(k.cpa, 87.5);
  assert.equal(k.roas, 20);
});

check("Satış yokken CPA null — 0 DEĞİL", () => {
  // 0 gostermek "satin alma bedavaya geldi" demekti.
  const k = normalizeInsight({ spend: "100", clicks: "10", impressions: "1000" });
  assert.equal(k.cpa, null);
  assert.equal(k.purchases, 0);
});

check("Harcama yokken ROAS null — 0 DEĞİL", () => {
  // 0 gostermek "hic getirisi yok" derdi; oysa olcu tanimsiz.
  const k = normalizeInsight({ spend: "0", impressions: "0", clicks: "0" });
  assert.equal(k.roas, null);
  assert.equal(k.ctr, 0, "sifira bolme cokmemeli");
  assert.equal(k.cpc, 0);
});

check("Adsız kampanya panelde boş satır bırakmaz", () => {
  assert.equal(normalizeInsight({}).campaignName, "(adsız kampanya)");
});

// ── Özet ──────────────────────────────────────────────────────────────────
check("Özet oranları TOPLAM paydan hesaplanır, ortalama ALINMAZ", () => {
  // 1 TL harcayan kampanyayi 1000 TL harcayanla esit agirliga sokmak
  // toplam ROAS'i tamamen yanlis gosterirdi.
  const kucuk = normalizeInsight({
    spend: "1", impressions: "10", clicks: "1",
    actions: [{ action_type: "omni_purchase", value: "1" }],
    action_values: [{ action_type: "omni_purchase", value: "100" }],
  });
  const buyuk = normalizeInsight({
    spend: "1000", impressions: "100000", clicks: "1000",
    actions: [{ action_type: "omni_purchase", value: "10" }],
    action_values: [{ action_type: "omni_purchase", value: "2000" }],
  });

  const o = summarize([kucuk, buyuk]);
  assert.equal(o.spend, 1001);
  assert.equal(o.revenue, 2100);
  // Dogru: 2100/1001 ≈ 2,098. Ortalama alinsaydi (100 + 2)/2 = 51 cikardi.
  assert.ok(o.roas !== null && Math.abs(o.roas - 2100 / 1001) < 1e-9);
  assert.ok(o.roas !== null && o.roas < 3, "ortalama alinmis olsaydi 51 cikardi");
});

check("Boş kampanya listesi çökertmez", () => {
  const o = summarize([]);
  assert.equal(o.spend, 0);
  assert.equal(o.roas, null);
  assert.equal(o.cpa, null);
  assert.equal(o.ctr, 0);
});

// ── Hesap kimliği ─────────────────────────────────────────────────────────
check("Hesap kimliği act_ önekine normalleştirilir", () => {
  // Yanlis bicim Graph'ta "Unsupported get request" verir ve hata mesaji
  // sebebi SOYLEMEZ — saatler kaybettirir.
  assert.equal(normalizeAccountId("1234567890"), "act_1234567890");
  assert.equal(normalizeAccountId("act_1234567890"), "act_1234567890");
  assert.equal(normalizeAccountId("  act_1234567890  "), "act_1234567890");
});

check("Geçersiz hesap kimliği BOŞ döner (uydurma istek atılmaz)", () => {
  assert.equal(normalizeAccountId(""), "");
  assert.equal(normalizeAccountId("abc"), "");
  assert.equal(normalizeAccountId("act_"), "");
  assert.equal(normalizeAccountId("act_12ab"), "");
});

console.log(failed === 0 ? "\n✅ Tumu gecti\n" : `\n❌ ${failed} test basarisiz\n`);
process.exit(failed === 0 ? 0 : 1);
