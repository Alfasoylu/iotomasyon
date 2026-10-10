# Koçtaş (Mirakl) API entegrasyonu

Durum (2026-10-10): istemci + teşhis ucu + mesaj ekranı kuruldu; **bağlantı henüz doğrulanmadı** (Alperen Vercel'e `KOCTAS_API_KEY`
girecek — Koçtaş Satış Ortağım paneli → profil → API anahtarı; isteğe bağlı `KOCTAS_SHOP_ID`, `KOCTAS_BASE_URL` → Actions
"Pazaryeri API teşhisi" kanal=koctas).

Koçtaş pazaryeri **Mirakl Marketplace Platform** üzerinde: örnek `https://koctas.mirakl.net` (giriş sayfası "Koçtaş Satış Ortağım";
herkese açık `GET /api/version` → 3.1314, 2026-10-10). Kaynak: Mirakl satıcı OpenAPI (developer.mirakl.com, seller openapi3.json).

## Kimlik ve sınırlar
- Başlık `Authorization: <API anahtarı>` (Bearer YOK); `shop_id` isteğe bağlı. Sınır aşımı 429 + `Retry-After` (istemci saniyeyi hataya yazar).
- Çağrı sıklığı: OR11 dakikada en fazla 1 yoklama; TL02 dakikada 20 / saatte 60; RT11 5 dakikada 1; M10/M11/M12 yalnız ekran açılışında.

## Okumalar (`lib/koctas/client.ts`, izin listeli)
- **OR11** `GET /api/orders` — `start_date`/`end_date` (ISO), `max` ≤ 100 + `offset`. Satırda **komisyon tutarı**: `commission_fee`
  (KDV hariç), `total_commission` (KDV dahil); `price` kargo hariç satır tutarı.
- **M11** `GET /api/inbox/threads` — `with_messages`, `updated_since`, `limit` ≤ 100, `page_token`; `metadata.shop_reply_needed_since`.
  Mirakl'da ayrı "ürün sorusu" servisi yok: sorular sipariş (`MMP_ORDER`) ve teklif (`MMP_OFFER`) konuları olarak gelir.
- **TL02** `GET /api/sellerpayment/transactions_logs` — `limit` ≤ 2000, `page_token`; tür bazında toplam (COMMISSION_FEE / COMMISSION_VAT /
  REFUND_COMMISSION_* → komisyon çapraz kontrolü; PAYMENT → ödeme).
- **RT11** `GET /api/returns`, **OF21** `GET /api/offers` (izinli, şimdilik teşhiste kullanılmıyor).

## Tek yazma — müşteri mesajı yanıtı (M12)
`POST /api/inbox/threads/{id}/message`, multipart `message_input` (JSON `{body, to:[{type:"CUSTOMER"}]}`), gövde 3–50.000 karakter.
`lib/actions/koctas-message-actions.ts` — `marketplaceQuestions.answer` + `MarketplaceQuestionActionLog` (platform `KOCTAS`, hata dahil).
Ekran `/marketplace/koctas/messages` (menü: Pazaryerleri → Koçtaş Mesajları). Gönderen adı gösterilmez/saklanmaz, yalnız türü.

## Komisyon (CFO-028)
Koçtaş satırları Entegra'da komisyonsuz geliyor (son 90 gün 13 satır, ≈67,6k TL ciro). API'de satır bazında komisyon **tutarı** var →
teşhis `commissionPctOfGross` (commission_fee / fiyat) ölçülmüş oran kaynağı; TL02 komisyon kalemleriyle çapraz kontrol.

## Kurulmayanlar (bilinçli)
Teklif fiyat/stok yazma (OF24 — gönderilmeyen alanları varsayılana sıfırlar; OF01), sipariş kabul/ret/kargo, iade işlemleri —
docs/AI-RULES.md (Entegra'nın işi). Siparişler veritabanına yazılmaz (Entegra MIRAKL_KOCTAS satışlarıyla çift sayım riski).
Test `__tests__/koctas-client.test.ts` (CI); teşhis `/api/cron/koctas-tani`.
