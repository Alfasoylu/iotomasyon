# Ana oturumdan CFO kabul karşılaştırması

Kullanıcının 04.10.2026 talebi: önizleme yerine ana iotomasyon oturumundan devam et.

Ana uygulamada CFO Kokpiti üzerindeki “Kabul karşılaştırmasını çalıştır (JSON)” bağlantısı `/api/admin/ai-cfo/acceptance` adresini aynı origin'de açar. ADMIN + CFO_READ + EXECUTIVE_READ koruması ve private/no-store JSON korunur. Production ortamına konan eski preview-only kısıtı kaldırılmıştır. Sonuç execution:vercel_production ve productionApproval:false taşır.

Bu değişiklik yalnız okuma modüllerini feature branch'ten taşır. Schema/migration, cfo_run/cfo_insight/cfo_usage, provider, monitor, scheduler ve AI control-center dahil değildir. Mevcut Prisma bağlantısını kullanır; yeni DB credential veya migration gerekmez. Tek REPEATABLE READ/READ ONLY transaction ve kaynak savepoint'leri korunur; query/body referans veya SQL belirleyemez.

Sabit 12 referans ve komisyon120gün kararı korunur. Reconciliation güncel kaynak hizalamasıdır; geçmiş defter kabulü değildir. Kaynak hash/görünürlük/semantik korumaları ve eksik aktif banka timestamp güncellik düzeltmesi taşınır. İşletme kayıtlarına veya release flag'lerine yazılmaz.

CI sentetik SQL/profile/RBAC/Entegra kontrolleri, Prisma/typecheck/lint/build ve preview+production girişsiz401/POST405 HTTP kontrolleri çalıştırır. Finansal kabul CI'dan çalıştırılmaz. Ana deploy'dan sonra admin oturumu ile JSON alınmalıdır; şu an yeni canlı sonuç iddia edilmez.

PDKS görev delta'sı: ana oturumda korumalı kabul bağlantısı ve read-only bağımlılıkları hazırlanmıştır. Büyük hassas PDKS belgesini yeniden yayınlama reddi nedeniyle görev notu bu küçük belgede tutulur. Doğrulama sonucu deployment kaydı/PR ile ayrıca izlenir.
