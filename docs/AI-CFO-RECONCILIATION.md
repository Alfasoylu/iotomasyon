# AI CFO — aynı transaction'da kaynak uzlaştırması

04.10.2026. Kullanıcının Vercel JSON karşılaştırması sabit referansla tüm kontrolleri geçmedi; ölçülen finansal tutarlar bu public belgeye kopyalanmaz.

Preview admin kabul route'u artık ek `reconciliation` alanı üretir. Sabit 12 kabul kontrolü ve referans değerler korunur; kaynak hizalama sonucuyla değiştirilmez.

- `canonicalWindows`: yalnız iki referans SKU için kanal bazında güncel30gün ve bir önceki günün30gün penceresi; İstanbul gün sınırı, pozitif adet, trust ve duplicate sayıları. Ham sipariş veya müşteri kimliği döndürülmez.
- `signals[].alignment`: aynı transaction'da snapshot ile native satış/XML/hız/örtü/aktif Product stok karşılaştırması. Match finansal doğruluk veya tarihli kabul kanıtı değildir. Birden fazla native hız satırı veya eksik kaynak unknown kalır.
- `signals[].demand`: Entegra/30gün kapsamı eksik olduğunda salesVelocity null, seçilen hız XML'dir. Native stockDays doğrudan mevcut view'dan alınır; agent'ın seçtiği hızla yeniden yazılmaz. XML adet/30 ile aynı olacağı varsayılmaz; native ihtiyatlı motor korunur.
- `bankFreshness`: aktif hesap sayısı, eksik bakiye/zaman sayısı, yedi günden eski hesap sayısı, en eski/en yeni güncelleme. Banka adı, hesap kimliği veya bakiye döndürülmez. Snapshot güncelliği artık tüm aktif hesapların timestamp taşımasını da zorunlu kılar; min(timestamp) null'ları atlayarak taze hesapla eksik zamanı gizleyemez.
- `setComponentSchemaMissing`: eksik SET ilişki kolonu, sıfır bilinmeyen SET sayısının yanında ayrıca görünür.

Geçmiş XML/stok değeri güncel view ile yeniden oluşturulmaz. Komisyon120gün kararı ve bağımsız aynı dönemli kabul referansı gereksinimi değişmez. Bu değişiklik veri senkronizasyonu, stok/maliyet/banka düzeltmesi veya migration uygulamaz; AI/release kapılarını açmaz.

Yeni SQL regresyonları sentetik PostgreSQL'de çalışır; canlı finansal ölçüm yalnız Vercel admin route'undadır. [08a879a CI validation](https://github.com/Alfasoylu/iotomasyon/actions/runs/37193877841) başarılı: typecheck, mevcut ve yeni regresyonlar, lint, build ve HTTP erişim kapıları. Vercel önizleme commit status'u success; gerçek girişsiz HTTP isteği 401 JSON döndü. Yeni yetkili finansal JSON henüz alınmadı. Önceki hassas PDKS yeniden yayını reddedildiğinden görev delta'sı bu küçük belgede tutulur.
