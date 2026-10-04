# PDKS delta — 04.10.2026

- Vercel önizleme için admin+CFO/Executive korumalı `/api/admin/ai-cfo/acceptance` route'u eklendi. Mevcut Prisma bağlantısını kullanır; salt okunur transaction ve private/no-store JSON döndürür.
- CLI ve route ortak kabul raporu mantığını kullanır. Sabit referanslar ve release şartları korunur. Finansal karşılaştırma push CI'dan çıkarıldı; build ve erişim kapısı smoke kontrolleri CI'da çalışır.
- Kullanım: [AI-CFO-PREVIEW-ACCEPTANCE.md](AI-CFO-PREVIEW-ACCEPTANCE.md). CI/preview sonucu doğrulandıktan sonra kayıt güncellenir. Canlı finansal sonuç henüz alınmadı.
- Büyük mevcut PDKS dosyasının yeniden yayınlanması otomatik incelemede hassas içerik nedeniyle reddedildiği için bu görev notu ayrı tutulur.
