# Banka yükleme — 2026-10-04

PR #129'daki yarım kalan ekstre yükleme işi ana uygulamaya uyarlanmıştır.

## Kullanım

Ana oturumda CFO → Banka Yükleme (`/admin/banka-yukleme`) ekranını açın.
Aktif hesabı seçin, bankadan aldığınız XLSX/XLS/CSV dosyasını yükleyin ve Önizle'ye basın.
Dosya sınırı 4 MB / 20.000 satırdır. PDF desteklenmez. Sütunlar bulunamazsa elle eşleyin.

Hareket aktarımı ayrı onay ister ve bakiyeyi değiştirmez.
Bakiye formundaki tutarı bankanın güncel ekranıyla karşılaştırın; ekstrede en son görünen
satır en yeni işlem olmayabilir. Bakiye tarih ve saatini kendiniz belirtin, önizleyin,
ardından Onayla ve bakiyeyi kaydet'e basın. Dosya yüklemeden de bu form kullanılabilir.
Eski tarihli bakiyenin tarihi değiştirilmez. Gelecek tarih kabul edilmez.

## Uygulama

- Sayfa ve üç POST API ucu CFO_WRITE yetkisi ister; API'ler aynı kaynak kontrolü yapar.
- Dosya önizlemesi salt okunurdur. Onay anahtarı kullanıcı, dosya, hesap ve eşlemeye
  bağlı HMAC imzasıdır; 15 dakika geçerlidir.
- Bakiye tam hesap kimliğiyle güncellenir. Hesap önizleme sonrası değiştiyse yazma
  reddedilir. Bakiye ve mevcut CFO değişiklik kaydı aynı transaction içinde yazılır.
- Yeni bağlantı, ortam değişkeni veya migration gerekmez. Mevcut bağlantı ve
  `cfo_change_log` kullanılır; PR #129'un yeni log modeli alınmamıştır.
- Mevcut hareket tablosunun alanları ve boş import_id desteği okunarak kontrol edilir.
  Uygun değilse hareket yazma kapalıdır; dosya önizlemesi ve bakiye formu kullanılabilir.
  Hareketler yalnız INSERT / satir_hash ON CONFLICT DO NOTHING ile yazılır.
- Aynı dosyanın tekrar aktarımı engellenir. Farklı sıralanmış veya kısmen örtüşen
  ekstrelerin tüm mükerrerleri yakalanacağı garanti edilmez; PR #129'un sıra temelli
  hash davranışı korunmuştur. Hareket önizlemesini kontrol edin.
- Aynı isimde birden fazla aktif hesap varsa dosya aktarımında isimle otomatik
  seçim yapılmaz; bakiye formunda tam hesap seçimi kullanılabilir.
- Finansal dosya içerikleri GitHub'a veya uygulama hata loglarına gönderilmez.

## Doğrulama

Türkçe başlık/tutar/tarih testleri, gerçek XLSX ayrıştırması, HMAC kullanıcı ve süre
kontrolleri, geçersiz tarih/tutar, eski bakiye tarihi, PostgreSQL üzerinde mükerrer
INSERT, eşzamanlı değişiklik reddi ve audit hatasında rollback testleri geçti.
TypeScript, değişen kodun lint kontrolü ve üretim derlemesi geçti.
HTTP testi sayfanın giriş istediğini, üç API'nin oturumsuz POST için 401 ve GET için
405 döndürdüğünü doğrular. CI aynı kontrolleri çalıştırır.

Canlı finansal dosya veya hesap bakiyesi doğrulama sırasında değiştirilmedi.
Gerçek banka dosyasının son kontrolü yetkili kullanıcının önizlemesinde yapılır.

Dokümantasyon deltası ayrı tutuldu: daha önceki otomatik inceleme büyük mevcut
PDKS/CHANGELOG belgelerinin yeniden yayımlanmasını reddetmişti. Bu belge ve
CHANGELOG-BANK-UPLOAD.md yalnız bu görevin teknik değişikliklerini içerir.
