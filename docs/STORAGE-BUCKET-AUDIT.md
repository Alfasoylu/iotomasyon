# STORAGE BUCKET AUDIT (2026-10-06) — salt-okunur; hiçbir bucket değiştirilmedi

| Bucket | public | Nesne | Boyut | İçerik | Sınır |
|---|---|---|---|---|---|
| `cfo-files` | **true** | 8 | 3,1 MB | **finansal belgeler** (aşağıda) | yok |
| `ip-set` | true | 22 | 22,5 MB | IP kamera seti pazarlama görselleri (PNG) | yok |
| `urun-gorsel` | true | 102 | 36,8 MB | ürün/aday ürün görselleri (JPEG) | 10 MB, yalnız image/* |

## 🔴 HIGH — `cfo-files` (public) finansal belge içeriyor
8 nesnenin tamamı CFO soru ekleri (`cfo_question_file`, yol = `<soru UUID>/<epoch>_<dosya>`):
- 2 × `Enpara_irketim_hesap_hareketleri.xls` (şirket banka hesap hareketleri, 405 KB, 2026-09-07)
- 1 × `30062601_COMMERCIAL_INVOICE_40GP.xlsx` (ithalat ticari faturası, 1 MB, 2026-09-07)
- 5 × `IMG_75xx.png` ekran görüntüleri (2026-08-27; içerik açılmadı — banka/ödeme ekranı olması muhtemel, doğrulanmadı)
Bucket `public=true` olduğundan **URL'yi bilen herkes kimlik doğrulamasız okur** (`/storage/v1/object/public/cfo-files/...`). Kimlik doğrulamasız **listeleme/yükleme/silme yok**: `storage.objects` RLS açık ve hiçbir policy yok. Dosya yolları tahmin edilemez (UUID + epoch) ama 8 kaydın tamamı veritabanında **public URL** olarak saklı (`cfo_question_file.url`: 8/8 public, 0 `private:` referans) — bağlantı sızdıysa (e-posta, ekran görüntüsü, ajan günlükleri) belgeler açıktır.
Kod zaten **özel bucket bekliyor** (`lib/cfo-agent/private-files.ts`): yükleme ve indirme `bucket.public === false` doğrulamadan reddeder ("özel depolama doğrulanamadı"); eski public bağlantıları `privateFilePath()` ile yalnız yapılandırılmış proje+bucket için `authenticated` uç noktasıyla (service_role) okur. Yani bucket'ı `public=false` yapmak uygulamanın tasarladığı durumdur ve eski 8 dosyanın uygulama içi indirmesini bozmaz; yalnız tarayıcıda doğrudan public URL açan kullanımlar kesilir. **Şu an yeni yükleme de fiilen kapalı** (bucket public olduğu için).
**Öneri (onay bekliyor):** `UPDATE storage.buckets SET public=false WHERE id='cfo-files'` + yükleme/indirme akışı testi; ardından 8 kaydın `url` değerinin `private:cfo-files/<yol>` biçimine taşınması. Bağlantının dışarı sızmış olma ihtimali için belge içeriği (özellikle banka ekstreleri) hassas kabul edilmeli.

## `urun-gorsel` — public gerekli
Repo migration'ı (`20260911100000_urun_aday`) bilerek `public=true`, 10 MB + image/* sınırıyla yaratır; `lib/actions/urun-aday-actions.ts` `publicUrl` üretir; 96 `urun_aday_gorsel` satırı bu bucket'a bağlı. İçerik ürün fotoğrafı (JPEG); pazaryeri ilanları dış URL'den çekeceği için public olması normal. Hassas veri yok.

## `ip-set` — public makul, repo dışı
Migration/kodda **hiç referans yok** (SQL editöründen/elle açılmış). 22 PNG pazarlama görseli (özellik/kutu içeriği); veritabanındaki ürün açıklamalarında referansı bulunamadı (`Product` 0). Pazaryeri ilan görseli olarak kullanılıyorsa public gerekir; kullanılmıyorsa özel yapılabilir. **Karar:** sahibi (ilan görseli mi?) netleştirsin; ayrıca `file_size_limit` ve `allowed_mime_types` (image/png) kısıtı eklenmesi önerilir.

## Genel
- `storage.objects`/`storage.buckets`: RLS açık, **policy yok** → anon/authenticated listeleyemez/yükleyemez (tablo yetkisi `true` olsa da RLS engelliyor).
- Yazma yalnız service_role (`SUPABASE_SERVICE_ROLE_KEY`) ile.
- Bucket tanımları migration'sız (`cfo-files`, `ip-set`) — baseline planı kapsamına alınmalı.
