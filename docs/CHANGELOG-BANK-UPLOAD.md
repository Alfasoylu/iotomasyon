# Banka yükleme delta günlüğü

## 2026-10-04

- PR #129'un banka ekstresi yükleme ekranı ana uygulamaya uyarlandı; CFO menüsüne
  Banka Yükleme eklendi.
- Yeni migration olmadan mevcut CFO günlüğüne transaction içinde kayıt eklenir.
- Ayrı önizleme ve onayla bakiye güncellemesi eklendi; gerçek bakiye tarihi korunur,
  eşzamanlı değişiklikler eski önizlemenin üzerine yazılmasını engeller.
- Dosya sınırı Vercel'e uygun 4 MB oldu. Tutar/tarih doğrulaması, kullanıcıya bağlı
  süreli onay imzası ve güvenli hata mesajları eklendi.
- Ayrıştırma, PostgreSQL rollback/idempotency, yetki, TypeScript, lint ve üretim
  derlemesi doğrulandı; kontroller CI'ya eklendi.

Kullanım ve sınırlar: [BANK-UPLOAD-MAIN.md](BANK-UPLOAD-MAIN.md).
