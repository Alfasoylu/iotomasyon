# CHANGELOG — CFO ana oturum kabul route'u

04.10.2026. [PR #132](https://github.com/Alfasoylu/iotomasyon/pull/132) main'e merge edildi; uygulama commit'i 38273b46ab3aa8518f14d9aad69fee6b04c2b96c.

- Ana CFO Kokpiti'nde aynı-origin kabul JSON bağlantısı yayımlandı. Preview-only engeli kaldırıldı; ADMIN+CFO/Executive koruması, private/no-store ve salt okunur transaction korundu.
- Yalnız okuma/kabul bağımlılıkları taşındı. Schema/migration, provider/monitor/scheduler ve agent audit tabloları değişmedi. Mevcut bağlantı/oturum kullanılır; yeni credential gerekmez. Sabit referanslar/release flag'leri değişmedi.
- [PR validation](https://github.com/Alfasoylu/iotomasyon/actions/runs/37197780120) ve [main CI](https://github.com/Alfasoylu/iotomasyon/actions/runs/37197910959) başarılı: SQL/profile/RBAC/Entegra, Prisma/typecheck/lint/build ve production+preview girişsiz401/POST405 HTTP kontrolleri.
- Vercel production deployment commit status success: https://vercel.com/alfasoylus-projects/iotomasyon/4i4tF29hJGm9b3ZL7ogojmrU2Rah . Gerçek https://iotomasyon.com/api/admin/ai-cfo/acceptance isteği 401 JSON unauthorized ve private/no-store/Cookie Vary döndürdü.
- Yetkili finansal JSON yeni production route'undan henüz alınmadı. Bu kayıt finansal 12/12 kabul veya AI release onayı değildir. Bundan sonraki read-only kabul işi main/ana site üzerinden yürütülür; tam AI CFO taslak PR #131 ayrı kalır.

PDKS delta: ana oturum isteği tamamlandı, korumalı route ve CFO bağlantısı production'da doğrulandı. Önceki büyük hassas PDKS yeniden yayın reddi nedeniyle görev/doğrulama notları AI-CFO-MAIN-SESSION.md ve bu küçük changelog kaydında tutulur.
