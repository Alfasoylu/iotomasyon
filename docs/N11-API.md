# N11 API entegrasyonu

Durum (2026-10-10): istemci + teşhis ucu + soru-cevap ekranı kuruldu; **bağlantı henüz doğrulanmadı** (Alperen Vercel'e
`N11_APP_KEY` / `N11_APP_SECRET` girecek → Actions "Pazaryeri API teşhisi" kanal=n11).

Kaynak: https://developer.n11.com/documentation/ (portal) + public WSDL'ler (`https://api.n11.com/ws/<Servis>.wsdl`).

## Kimlik ve uçlar
- **REST** `https://api.n11.com` — başlık `appKey` + `appSecret` (Authorization yok).
  - Sipariş paketleri `GET /rest/delivery/v1/shipmentPackages` — en fazla **15 gün** (daha geniş aralık sessizce kırpılır; istemci 14 günlük
    dilimler), `size` ≤ 100, Kasım 2024 öncesi veri yok, dakikada 1000 istek.
  - Satıcı ürün sorgusu `GET /ms/product-query` — `size` ≤ 250; fiyat, stok, `commissionRate`.
- **SOAP** `https://api.n11.com/ws/<servis>/` (ad alanı `http://www.n11.com/ws/schemas`, `SOAPAction: ""`, gövdede
  `<auth><appKey/><appSecret/></auth>`):
  - Ürün soruları `GetProductQuestionList` (tarih dd/MM/yyyy zorunlu, **dakikada 1**), `GetProductQuestionDetail`, yanıt `SaveProductAnswer`
    (1–2048 karakter, soru başına bir kez → CLOSED).
  - İadeler `ClaimReturnList` (ReturnService; sayfa 20).
  - Hakediş `GetSettlementList` / `GetSettlementDetail` (SettlementService) — **portalda yok, WSDL yayında; çalıştığı doğrulanmadı.**
- SOAP ürün/stok/fiyat yazma metotları 25.01.2025'te kapatıldı; yazma REST `/ms/product/tasks/*` (KURULMADI).

## Komisyon (CFO-028)
REST sipariş satırında **yalnız oran** var: etkin oran = `commissionRate − sellerCampaignCommissionRate` (yüzde). Tutar alanı REST'te yok →
tahmin = `sellerInvoiceAmount` × etkin oran. İptal / tedarik edilemedi satırları hariç. Teşhis ucu `commissionPctOfRated` döndürür;
bağlantı doğrulanınca N11 için ölçülmüş oran kaynağı olur (bugün UNKNOWN). Hakediş servisi çalışırsa kesinti tutarıyla çapraz kontrol.

## Kod
- `lib/n11/client.ts` — REST okuma izin listesi (yalnız sipariş paketleri + ürün sorgusu), SOAP okuma izin listesi; tek yazma
  `answerQuestion` (ayrı izinli yol). Kişisel veri (alıcı adı, adres, e-posta) özetlere/günlüğe yazılmaz. XML ayrıştırıcı `lib/pttavm/xml.ts`.
- `lib/actions/n11-question-actions.ts` — `marketplaceQuestions.answer` + `MarketplaceQuestionActionLog` (platform `N11`, hata dahil).
- Ekran `/marketplace/n11/questions` (menü: Pazaryerleri → N11 Soruları).
- Teşhis `/api/cron/n11-tani` (CRON_SECRET; yalnız elle) — sipariş komisyon özeti, ürün sayısı, açık soru, iade, hakediş.
- Test `__tests__/n11-client.test.ts` (CI).

## Kurulmayanlar (bilinçli)
Fiyat/stok/ürün yazma (`/ms/product/tasks/price-stock-update`, `product-create`, `product-update`, `product-delete`), sipariş durumu
(`/rest/order/v1/update`, paket bölme), iade onay/ret, parçalı iptal — docs/AI-RULES.md (Entegra'nın işi). Siparişler veritabanına
yazılmaz (Entegra N11 satışlarıyla çift sayım riski).
