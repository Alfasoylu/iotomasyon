# Banka yükleme delta günlüğü

## 2026-10-04 — Salt okunur banka inceleme raporu

- Ana oturumda yetkili kullanıcıya banka bazında son yüklemeler, okunamayan satır
  sayıları, hareket tarih aralıkları, boş/mükerrer hash'ler ve bakiye güncelliği raporlanır.
- Rapor mevcut bağlantıda READ ONLY / REPEATABLE READ transaction kullanır;
  banka hareket açıklamaları, dosya adları, kullanıcı e-postaları ve hesap numaraları döndürülmez.
- Son 30 gündeki en fazla 500 başarılı yükleme incelenir; kapsam sınırı ve okunamayan
  satır ayrıntılarının saklanmadığı açıkça bildirilir.
- Gerçek SQL ile kaynak eksikliği, güncellik, bilinmeyen/eski/gelecek bakiyeler,
  mükerrer/eksik hash, kayıt biçimi ve mahremiyet kontrolleri doğrulandı.

## 2026-10-04 — Banka PDF desteği

- Metin içeren banka PDF ekstreleri dosya seçimi, önizleme ve onaylı aktarım akışına eklendi.
- Konumlu sütun çıkarımı, çok sayfalı tablolar, devam açıklamaları ve tekrarlanan
  başlıklar desteklenir. Taranmış/şifreli/geçersiz dosyalar açıklamalı hata verir.
- PDF yerel sunucuda işlenir; harici servis veya yeni veritabanı bağlantısı gerekmez.
- Gerçek sentetik Türkçe PDF ile tutar işareti, çok sayfa, önizleme/onay tutarlılığı
  ve geçersiz dosya/sayfa sınırı test edildi; CI'ya eklendi.

## 2026-10-04 — Tarihsel ekstre bakiye uyarısı

- Dosya son satırı yerine en yeni işlem tarihi seçilir. Aynı gün farklı bakiyeler
  varsa kapanış bakiyesi tahmin edilmez; eksik son-gün bakiyesinde eski güne dönülmez.
- Tarihsel ekstre ile güncel banka bakiyesi arasındaki yanıltıcı fark uyarısı kaldırıldı.
  Ekstre tarihi gösterilir, tarihsel tutar güncel bakiye formuna otomatik aktarılmaz.
- Artan/azalan dosya sırası, aynı gün belirsizliği ve eksik son-gün bakiyesi test edildi.

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

## 2026-10-04 — Statement parser recovery and currency safeguards

Positioned PDF text now stays in its real column. The supported bank table layout associates descriptions above a transaction with that transaction, and numeric references stay outside monetary columns. Spaced negative amounts and TL-labelled spreadsheet headers are supported.

PDF re-import reconstructs legacy identities and checks them under the account import lock, preserving existing entries while inserting missing rows. New PDF identities use a separate version namespace so shifted daily ordinals cannot collide with legitimate old rows. Legacy matching also requires identical date, amount and balance. Preview tokens include the parser version.

Foreign-currency account selection and statement metadata are rejected by the TRY importer. The read-only review explicitly marks existing foreign-currency movement groups as unsuitable for TRY cash flows. Existing raw movement rows and account balances are preserved; no currency conversion or production-data correction is claimed. Native-currency storage/reconciliation remains necessary before those groups can enter cash-flow calculations.

Validation: synthetic positioned PDFs, actual XLSX metadata/header parsing, PGlite legacy recovery/re-import, changed-amount protection, review currency flags, typecheck and lint. Private source files were inspected only locally and are excluded from the repository and CI. Live repair requires the protected production session and original file; deployment alone does not replay uploads.
