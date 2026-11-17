# RoTaKip Mimarisi

RoTaKip, Express tabanlı bir **modüler monolit** ve Vanilla JavaScript istemcisinden oluşur. Amaç, tek uygulama olarak dağıtımı korurken iş kurallarını özellik sınırlarına göre ayırmaktır.

## Çalışma Akışı

1. Express, grup ve içerik rotalarında `public/app-shell.html` dosyasını sunar.
2. `public/app/shell-router.js` URL'yi çözer.
3. İlgili görünüm `public/fragments/` altından yüklenir.
4. `public/assets-manifest.json`, route için üretilen CSS ve JavaScript paketini seçer.
5. İstemci `/api` uç noktaları üzerinden sunucu modülleriyle iletişim kurar.

## Dizin Sahipliği

```text
src/
  client/
    features/       Ürüne ait istemci özellikleri
    shared/         Birden fazla özelliğin kullandığı kod ve stiller
    shell/          Uygulama kabuğunun kaynak stilleri
  server/
    start.js        Süreç başlangıcı, bağlantılar ve zamanlanmış işler
    app.js          İnce composition root; middleware, servis ve router montajı
    config/         Ortam, veritabanı ve oturum yapılandırması
    middleware/     HTTP, rate-limit ve hata middleware'leri
    jobs/           Zamanlanmış arka plan görevleri
    modules/        Auth, grup, kullanıcı, okuma gibi özellik sınırları
    integrations/   Dropbox, ERP ve OneSignal bağlantıları
    shared/         Tarih ve doğrulama gibi çerçeveden bağımsız yardımcılar

public/
  app/              Tarayıcıda doğrudan çalışan ESM shell modülleri
  fragments/        Route görünüm parçaları
  images/           Sürümlenen statik görseller
  *.html            Doğrudan sunulan giriş belgeleri
  *.min.js/css      Build çıktısı; Git tarafından takip edilmez

scripts/            Build ve bakım araçları
tests/
  unit/             Saf iş kuralı testleri
  integration/      Birden fazla bileşenin sözleşmesini doğrulayan testler
```

## Dosya Kuralları

- Dosya ve klasörler `kebab-case` kullanır.
- Genel `script.js`, `style.css`, `index.js` gibi adlar kullanılmaz; ad dosyanın sorumluluğunu açıklar.
- Kod ve teknik dosya adları İngilizcedir. Türkçe ürün rotaları ve kullanıcı metinleri korunur.
- Bir özellik kendi JavaScript ve CSS kaynaklarını aynı özellik klasöründe tutar.
- Paylaşılan kod yalnızca gerçekten birden fazla özellik tarafından kullanılıyorsa `shared/` altına taşınır.
- Grup üst çubuğu gibi ekranda görünen route öğeleri ilgili route fragmentinde tutulur; shell içinde ayrı bir görünür kök oluşturulmaz.
- Bir route'a özgü markup kendi `public/fragments/<route>.html` dosyasında, CSS ve JavaScript ise o route'un özellik paketinde bulunur.
- Grup giriş ve profil pencereleri `common-overlays.html` içinde, yalnız grup rotası açıldığında yüklenir. Tek özelliğe ait modallar ilgili özellik fragmentinde kalır.
- Build çıktıları elle düzenlenmez. `npm run build:assets` ile yeniden üretilir.
- Kullanıcı yüklemeleri kaynak kodla birlikte sürümlenmez.

## Sunucu Modülü Kuralı

Yeni bir sunucu özelliği mümkün olduğunda şu sınırları kullanır:

```text
modules/example/
  example.routes.js       HTTP rotaları
  example.service.js      İş kuralları
  example.models.js       Mongoose şemaları ve modelleri
  example.middleware.js   Özelliğe özel middleware (gerekiyorsa)
```

Rota dosyaları HTTP sözleşmesini, servis dosyaları iş kurallarını, model dosyaları veri tanımlarını taşır. Küçük özelliklerde gereksiz boş katmanlar oluşturulmaz. Bir dosya tek başına yeterliyse modül klasöründe tek dosya olarak kalabilir.

## Bağımlılık Yönü

- `app.js` bütün modülleri oluşturur ve açık bir bağımlılık bağlamıyla router'lara verir.
- Özellik modülleri başka bir özelliğin rota dosyasını çağırmaz.
- Dış servis erişimi yalnızca `integrations/` altında tutulur.
- Genel yardımcılar Express veya Mongoose'a bağlı değilse `shared/` altında tutulur.
- `app.js` içine iş kuralı veya doğrudan endpoint eklenmez; mimari testi dosyayı 250 satırın altında ve doğrudan `app.get/post` çağrılarından arınmış tutar.

## Build ve Test

- `npm run build:assets`: `src/client` kaynaklarından minify edilmiş paketleri `public/` içine yazar ve manifesti günceller.
- `npm test`: `tests/` altındaki bütün `*.test.js` dosyalarını otomatik keşfeder.
- `npm run lint`: kaynak kodun statik analizini çalıştırır.

## Uygulama Yaşam Döngüsü

`src/server/start.js` süreç girişidir; veritabanını, indeksleri, entegrasyonları ve zamanlanmış işleri başlatır, kapanış sinyallerinde kaynakları temizler. `src/server/app.js` yalnızca Express uygulamasını oluşturur ve bağımlılıkları özellik router'larına bağlar. Yeni kod sorumluluğuna göre `modules/`, `middleware/`, `jobs/`, `integrations/` veya `shared/` altında oluşturulur.
