# Banka yükleme — 2026-10-04

PR #129'daki yarım kalan ekstre yükleme işi ana uygulamaya uyarlanmıştır.

## Kullanım

Ana oturumda CFO → Banka Yükleme (`/admin/banka-yukleme`) ekranını açın.
Aktif hesabı seçin, bankadan aldığınız XLSX/XLS/CSV/PDF dosyasını yükleyin ve Önizle'ye basın.
Dosya sınırı 4 MB / 20.000 satırdır. PDF en fazla 100 sayfa olabilir.
PDF desteği bankadan indirilen metinli hesap hareketleri tabloları içindir; taranmış
sayfalar, şifreli dosyalar ve tanınamayan tablolar açıklamalı hata ile reddedilir.
Tablodaki tarih/açıklama ve tutar veya borç/alacak başlıkları okunabilir olmalıdır.
PDF metni sunucuda çıkarılır; dosya başka bir servise gönderilmez. Çok sayfalı
ekstreler, tekrarlanan başlıklar ve açıklama devam satırları okunur. Sütunlar
bulunamazsa Excel/CSV için elle eşleyin.

Hareket aktarımı ayrı onay ister ve bakiyeyi değiştirmez.
Bakiye formundaki tutarı bankanın güncel ekranıyla karşılaştırın; ekstrede en son görünen
satır en yeni işlem olmayabilir. Bakiye tarih ve saatini kendiniz belirtin, önizleyin,
ardından Onayla ve bakiyeyi kaydet'e basın. Dosya yüklemeden de bu form kullanılabilir. Tarihsel ekstre tutarı forma otomatik
aktarılmaz; ekstre tarihi gösterilir ve güncel bakiye ile fark uyarısı üretilmez.
Eski tarihli bakiyenin tarihi değiştirilmez. Gelecek tarih kabul edilmez.

## Eklenen bankaları inceleme

Sayfadaki Banka inceleme raporunu aç (JSON) bağlantısı `/api/admin/banka-yukleme/inceleme`
ucunu mevcut oturumla çağırır. Rapor salt okunurdur; yeni bir bağlantı veya migration istemez.
Son 30 gündeki en fazla 500 başarılı yüklemeyi ve aktif hesapların güncelliğini gösterir.
Hareketlerin tarih aralıkları tarihsel bilgi olarak kalır. Okunamayan satır sayıları
farklı yükleme denemeleri boyunca toplanır; aynı dosyanın tekrar yüklemesi aynı hatayı
tekrar sayabilir. Asıl dosyalar ve atlanan satır ayrıntıları saklanmadığından bunların
nedenini incelemek için orijinal dosya gerekir. Şifre, cookie veya bağlantı dizesi paylaşılmaz.

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

## 2026-10-04 — Statement parser recovery and currency safeguards

Positioned PDF text now stays in its real column. The supported bank table layout associates descriptions above a transaction with that transaction, and numeric references stay outside monetary columns. Spaced negative amounts and TL-labelled spreadsheet headers are supported.

PDF re-import reconstructs legacy identities and checks them under the account import lock, preserving existing entries while inserting missing rows. New PDF identities use a separate version namespace so shifted daily ordinals cannot collide with legitimate old rows. Legacy matching also requires identical date, amount and balance. Preview tokens include the parser version.

Foreign-currency account selection and statement metadata are rejected by the TRY importer. The read-only review explicitly marks existing foreign-currency movement groups as unsuitable for TRY cash flows. Existing raw movement rows and account balances are preserved; no currency conversion or production-data correction is claimed. Native-currency storage/reconciliation remains necessary before those groups can enter cash-flow calculations.

Validation: synthetic positioned PDFs, actual XLSX metadata/header parsing, PGlite legacy recovery/re-import, changed-amount protection, review currency flags, typecheck and lint. Private source files were inspected only locally and are excluded from the repository and CI. Live repair requires the protected production session and original file; deployment alone does not replay uploads.
