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
    modules/        Sunucu iş kuralları; özellik bazında ayrılır
    integrations/   ERP ve benzeri dış sistem bağlantıları

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
- Build çıktıları elle düzenlenmez. `npm run build:assets` ile yeniden üretilir.
- Kullanıcı yüklemeleri kaynak kodla birlikte sürümlenmez.

## Sunucu Modülü Kuralı

Yeni bir sunucu özelliği mümkün olduğunda şu sınırları kullanır:

```text
modules/example/
  example.routes.js       HTTP rotaları
  example.controller.js   İstek ve yanıt dönüşümü
  example.service.js      İş kuralları
  example.repository.js   Veritabanı erişimi
  example.schema.js       Mongoose şemaları
```

Küçük özelliklerde gereksiz boş katmanlar oluşturulmaz. Bir dosya tek başına yeterliyse modül klasöründe tek dosya olarak kalabilir.

## Build ve Test

- `npm run build:assets`: `src/client` kaynaklarından minify edilmiş paketleri `public/` içine yazar ve manifesti günceller.
- `npm test`: `tests/` altındaki bütün `*.test.js` dosyalarını otomatik keşfeder.
- `npm run lint`: kaynak kodun statik analizini çalıştırır.

## Geçiş İlkesi

`server.js` halen uygulamanın ana giriş dosyasıdır. Yeni kod doğrudan bu dosyayı büyütmek yerine `src/server/modules` veya `src/server/integrations` altında oluşturulur. Mevcut rotalar davranış değişikliği yapılmadan, test kapsamı eşliğinde kademeli olarak modüllere taşınır.
