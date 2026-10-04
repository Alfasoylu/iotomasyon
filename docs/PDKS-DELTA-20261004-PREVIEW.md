# PDKS delta — 04.10.2026

- Vercel önizleme için admin+CFO/Executive korumalı `/api/admin/ai-cfo/acceptance` route'u eklendi. Mevcut Prisma bağlantısını kullanır; salt okunur transaction ve private/no-store JSON döndürür.
- CLI ve route ortak kabul raporu mantığını kullanır. Sabit referanslar ve release şartları korunur. Finansal karşılaştırma push CI'dan çıkarıldı; build ve erişim kapısı smoke kontrolleri CI'da çalışır.
- Kullanım: [AI-CFO-PREVIEW-ACCEPTANCE.md](AI-CFO-PREVIEW-ACCEPTANCE.md). CI/preview sonucu doğrulandıktan sonra kayıt güncellenir. Canlı finansal sonuç henüz alınmadı.
- Büyük mevcut PDKS dosyasının yeniden yayınlanması otomatik incelemede hassas içerik nedeniyle reddedildiği için bu görev notu ayrı tutulur.

## Kaynak uzlaştırması ve banka timestamp koruması

- Preview raporuna aggregate `reconciliation`: iki SKU için kayan dönemler, kaynak/snapshot hizalaması, kullanılan hız kaynağı, en eski/en yeni banka tarihi ve eksik timestamp sayısı eklendi. Sabit referanslar değişmedi.
- Tüm aktif hesapların güncelleme tarihi zorunlu kılındı; taze hesap eksik timestamp'i gizleyemez. SQL dönem/UTC/duplicate/trust/XML/banka/privacy regresyonları ve mevcut build/testler [CI'da](https://github.com/Alfasoylu/iotomasyon/actions/runs/37193877841) geçti. Vercel preview yayımlandı; girişsiz 401 JSON doğrulandı.
- Canlı yeni reconciliation JSON'u henüz alınmadı; finansal kabul/migration/AI açılışı yapılmadı. Ayrıntılar AI-CFO-RECONCILIATION.md.
