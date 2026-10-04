# Banka yükleme delta günlüğü

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
