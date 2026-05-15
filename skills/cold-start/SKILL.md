# Skill: cold-start (İlk Kurulum Mülakatı)

## Amaç
`CLAUDE.md` içindeki şirket profilini dolduracak soruları sorar ve
yanıtları dosyaya yazar. Bu skill tamamlanmadan diğer skill'ler
substantif iş yapamaz — her skill başında profil kontrol eder.

## Tetikleyiciler
- `/cold-start`
- "Profili doldur", "kurulum yap", "ayarları tamamla", "setup"
- Herhangi bir skill çalıştırılmaya çalışıldığında `[PLACEHOLDER]`
  içeren alanlar hâlâ varsa otomatik yönlendir.

## Ön Kontrol
```
CLAUDE.md içinde [PLACEHOLDER] var mı?
  EVET → Bu skill'i çalıştır.
  HAYIR → "Profil zaten dolu. /cold-start ile güncelleyebilirsiniz."
```

## İki Yol

### Hızlı (3 dakika)
Sadece zorunlu beş alan:
1. Şirket adı
2. Sektör
3. Para birimi (TRY / USD / EUR)
4. KDV oranı
5. Teklif geçerlilik süresi

Diğer alanlar varsayılan değerlerle doldurulur ve kullanıcıya gösterilir.

### Tam (10-15 dakika)
Tüm bölümler sırayla:
Şirket → Pipeline → Teklif şablonu → Görev → Eskalasyon → Entegrasyonlar

## Workflow

Mülakat sırayla 6 bölümden oluşur. Her bölüm tamamlanınca bir sonraki
bölüme geç. Kullanıcı "atla" derse varsayılan değerle devam et.

## Mülakat Akışı

### Bölüm 1: Şirket Tanımı
```
Sorular:
1. Şirket adınız nedir?
2. Hangi sektörde faaliyet gösteriyorsunuz?
   (IoT entegrasyon / otomasyon sistemleri / SCADA / endüstriyel yazılım / diğer)
3. Hedef müşteri profiliniz? (KOBİ / kurumsal / kamu / karma)
4. Kaç çalışanınız var?
5. Coğrafi odak? (Türkiye geneli / bölgesel / yurt dışı da)
```

### Bölüm 2: Para Birimi ve Fiyatlama
```
Sorular:
1. Varsayılan para birimi? (TRY / USD / EUR)
2. Standart KDV oranı? (%20 / %10 / %0 / karışık)
3. Teklif geçerlilik süresi kaç gün? (varsayılan: 30)
4. İskonto politikanız var mı? (örn: max %15, üzeri müdür onayı)
```

### Bölüm 3: Teklif Şablonu
```
Sorular:
1. Standart ödeme koşullarınız nedir?
   (örn: %30 peşin, %70 teslimatta)
2. Standart teslimat süreniz?
   (örn: 4-6 hafta)
3. Standart garanti süreniz?
   (örn: 2 yıl)
```

### Bölüm 4: Görev Yönetimi
```
Sorular:
1. Varsayılan görev önceliği? (LOW / MEDIUM / HIGH)
2. Kritik görev yanıt SLA'ı kaç saat? (örn: 24)
3. Kaç gün geçince vadesi geçmiş sayılsın? (örn: 2)
```

### Bölüm 5: Eskalasyon
```
Sorular:
1. Hangi teklif tutarının üzerinde manuel onay gerekiyor? (örn: ₺500.000)
2. Onaylayan kişi/rol kim?
3. Acil bildirimi nereden yapayım? (e-posta / WhatsApp / Slack)
```

### Bölüm 6: Entegrasyonlar
```
Sorular:
Hangisi bağlı? (bağlı olanları işaretle)
[ ] E-posta
[ ] WhatsApp
[ ] Muhasebe sistemi (hangisi?)
[ ] Takvim (Google / Outlook)
[ ] ERP
```

## Çıktı
`CLAUDE.md` dosyasındaki tüm `[PLACEHOLDER]` değerlerini
kullanıcının yanıtlarıyla değiştirir.

Yazma öncesi özeti göster:
```
Şu değerleri kaydediyorum:
─────────────────────────
Şirket adı     : Acme Otomasyon A.Ş.
Sektör         : IoT entegrasyon
Para birimi    : TRY  KDV: %20
Teklif süresi  : 30 gün
Ödeme koşulu   : %30 peşin, %70 teslimatta
...
─────────────────────────
Onaylıyor musunuz? (evet / düzelt)
```

Onay gelince yaz, "Profil dolu. tarihi güncellendi." mesajını ver.

## Kural
- Kullanıcı "atla" derse o bölüm varsayılan değerle doldurulur,
  varsayılan değer yoksa `[PLACEHOLDER]` olarak kalır.
- Hiçbir zaman otomatik kaydetme yapma — mutlaka onay al.
- Profil düz metin formatında kalır, YAML/JSON'a çevirme.
