# AI CFO — Vercel önizleme kabul karşılaştırması

04.10.2026. Route: `GET /api/admin/ai-cfo/acceptance`.

Vercel önizleme dağıtımında admin hesabıyla giriş yapıp aynı host üzerinde route'u açın. ADMIN rolü ve mevcut CFO_READ + EXECUTIVE_READ izinleri zorunludur. Girişsiz isteğe 401, yetkisiz oturuma 403, production/local ortamına 404 JSON döner. Yanıt private/no-store ve Cookie Vary taşır; query/body ile SQL, bağlantı veya referans değiştirilemez.

Route mevcut uygulamanın Prisma/DATABASE_URL bağlantısını kullanır; AI_CFO_READ_DATABASE_URL veya yeni credential gerekmez. Tek REPEATABLE READ / READ ONLY transaction, 15 saniye statement ve 105 saniye toplam timeout kullanılır. Kaynak başına savepoint, isteğe bağlı kaynak hatasının transaction'ın kalanını bozmasını önler. Transaction hiçbir işletme verisi veya agent audit tablosuna yazmaz; AI/provider/monitor kapalı config yalnız çağrı içinde kullanılır.

CLI ve route aynı `buildCfoAcceptanceReport` fonksiyonunu kullanır: 12 sabit kontrol, canonical view hash doğrulaması, hesap sürümü, snapshotHash, adapter doğrulaması, aggregate komisyon teşhisi ve veri kalitesi korunur. Route güncel tarihle `current_comparison` ve incelenmiş `alfas_2026_10_04` kaynak profilini kullanır. Ham sipariş/müşteri, SQL tanımı, URI veya driver hata mesajı JSON/log'a çıkarılmaz.

JSON `completed`, `execution:vercel_preview`, `mode`, `asOf`, `passed`, `total:12`, `checks`, `adapterVerification`, `dataQuality` ve `productionApproval:false` içerir. Fark olması HTTP 200 ile tamamlanmış karşılaştırma anlamındadır; erişim/kaynak/yürütme hatası 503 olur. Güncel mutable stok/bakiye geçmiş referansı yeniden üretmez; 12/12 bile tek başına production onayı değildir. Komisyon120gün kararı ve yedi günlük gölge şartı korunur.

GitHub validation job yalnız sentetik testler, typecheck/build ve gerçek HTTP girişsiz/production kapısı smoke testini çalıştırır. Finansal kabul karşılaştırması push CI'da çalıştırılmaz; Vercel önizleme route'undan istenir. Mevcut ayrı reader erişim/şifreli adapter incelemesi değişmez.

Preview build/status doğrulandıktan sonra admin oturumuyla route'tan JSON alınmalıdır. Oturum veya preview uygulama bağlantısı yoksa canlı sonuç üretildiği iddia edilmez. Yeni migration/main merge/production deploy bu değişikliğin parçası değildir.
