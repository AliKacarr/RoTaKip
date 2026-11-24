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

docs/
  assets/           README ve teknik belgelerde kullanılan, runtime'a çıkmayan görseller

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
- Yönetim ve log belgeleri bağımsız giriş noktalarıdır; kaynakları `src/client/features/` altında paketlenir, shell route ve preload listelerine eklenmez.
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

## Tefekkür

Tefekkür sekmesi (`/tefekkur`) tek route olarak çalışır; bölüm ve okuma biçimi sorgu parametreleriyle seçilir (`?bolum=esma`, `?bolum=risale&mod=metin|resim`). Bölümler: ayet, hadis, dua, Risale-i Nur (metin/görsel), Esmaül Hüsna, Zikirmatik ve iki canlı radyo (Kur'an Radyo, Risalet Radyo).

- **İstemci** (`src/client/features/tefekkur/`): `tefekkur-core.js` ortak ad alanını ve bölüm tanımlarını (`SECTIONS`), `tefekkur-tab.js` bölüm geçişlerini ve URL durumunu, `tefekkur-slider.js` kaydırmalı okuyucuyu, `tefekkur-zikirmatik.js` sayacı, `tefekkur-radio.js` radyo oynatıcısını, `tefekkur-share.js` kopyalama ve paylaşımı yönetir. Bu dosyalar `scripts/build-assets.js` içindeki `tefekkur` paketinde sıralı birleştirilir; yeni dosya eklenirse oradaki sıraya da eklenmelidir. Route markup'ı `public/fragments/tefekkur.html` içindedir.
- **Sunucu** (`src/server/modules/inspiration/`): `tefekkur.routes.js` `/api/tefekkur/*` uç noktalarını (metinler, görseller, radyolar), `tefekkur.service.js` içerik okuma ve radyo listesini sağlar. Servis `app.js` içinde oluşturulur ve `routeDependencies` ile rotaya verilir.
- **Esmaül Hüsna** verisi `public/esmaulhusna.json` dosyasından okunur. Her kayıt Arapça yazım, açıklama ve `esmaulhusna_video_url` alanı taşır; video bağlantısı yalnızca `https` ve YouTube alan adları için "Tefekkür videosu" düğmesi olarak gösterilir.
- **Radyolar** yayın adreslerini ortam değişkenlerinden alır: `TEFEKKUR_KURAN_RADYO_URL` ve `TEFEKKUR_RISALET_RADYO_URL` (`.env.example`). Adres boş ya da `https/http` dışındaysa ilgili radyo "kullanılamıyor" durumunda kalır. Site HTTPS ile sunulduğundan `https://` adres tercih edilir.
- **Etkinlik günlüğü**: bölüm görüntülemeleri `tefekkur_bölüm_görüntüleme` eylemiyle `activity` modülüne yazılır (bölüm anahtarı ve okuma biçimi `activity.service.js` içindeki izinli listeyle doğrulanır). Sekme içi geçişlerde `shell-router.js` "sekme açıldı" kaydını tekrarlamaz.

## Makaleler

Makaleler sekmesi (`/makaleler`) iki görünümden oluşur: kategori listesi (2 sütunlu kartlar) ve seçilen kategorinin makale listesi. Kategori adresi `?kategori=<slug>` ile saklanır; slug ve kategori adı `public/fragments/articles.html` içindeki kartlarda (`data-slug`, `data-category`) tanımlıdır. Veritabanındaki `articles.category` değeriyle birebir eşleşmelidir.

- **Önceden hazırlık**: sekme açılırken (başka sekme açıkken arka planda ısıtılırken de) `GET /api/articles/preview?perCategory=4` her kategorinin ilk makalelerini tek istekte getirir; görseller boşta kalınca sırayla indirilir (`saveData`/2G bağlantıda görseller indirilmez).
- **Efekt**: kategori seçilince görünüm, makaleler ve görselleri hazır olunca (en fazla 1,5 sn beklenir) `is-entering` efektiyle açılır; kartlar `--card-index` ile sırayla gelir. `prefers-reduced-motion` altında efekt kapalıdır.
- **Kalan makaleler**: "Daha fazla yükle" düğmesi yoktur; kategori sayfasında `IntersectionObserver` ile `GET /api/articles?category=&offset=&limit=` sayfalı istenir.
- **Footer**: kategori sayfasında (`data-view="category"`) alt bilgi gösterilmez; `articles.css` içindeki `body:has(...) #footerRoot` kuralı bunu yönetir.
- **Etkinlik günlüğü**: kategori sayfası açılışı `makaleler_kategori_görüntüleme` eylemiyle (`view: 'category'`, `section: <slug>`) `activity` modülüne yazılır; "Yeniden dene" tekrar kaydetmez. İzinli slug listesi `activity.service.js` içindeki `ARTICLE_CATEGORY_SLUGS` ile fragmentteki `data-slug` değerleri birebir aynı kalmalıdır (bir test bunu doğrular); yönetici panelindeki okunur adlar `site-activity-admin.js` içindedir.
- **Sunucu** (`src/server/modules/content/`): `article.service.js` sıralamayı (`_id` artan), sayfalamayı, kategori doğrulamasını (yalnız düz metin) ve önizleme önbelleğini (60 sn) yönetir; liste yanıtlarında makale metni 220 karaktere kısaltılır. `articles` koleksiyonu için `{ category: 1, _id: 1 }` indeksi `config/database-indexes.js` içinde oluşturulur.

## Videolar

Videolar sekmesi (`/videolar`) tek route olarak çalışır ve YouTube benzeri dört görünümden oluşur; görünüm sorgu parametreleriyle seçilir:

| Adres | Görünüm |
|---|---|
| `/videolar` | Önizlemeli video akışı (kartlar, Shorts rafı; kanal seçimi bölüm sekmelerinin devamındaki kanal sekmeleriyle) |
| `/videolar?izle=<videoId>` | İzleme sayfası (oynatıcı, beğen/kaydet/paylaş, "Sıradaki") |
| `/videolar?bolum=shorts[&v=<videoId>]` | Dikey, kaydırdıkça kendiliğinden oynayan Shorts |
| `/videolar?bolum=hesabim[&liste=gecmis\|begenilenler\|kaydedilenler\|kanallar]` | Hesabım. Ana görünümde Geçmiş ve Kanallarım rafları gizli kaydırma çubuğuyla yana kaydırılır; "Kitaplık" başlığı altında Beğendiğim videolar / Kaydedilenler koleksiyonları, kapak yığınlı görünümle ve ⋯ ("Koleksiyonu temizle") menüsüyle listelenir. Bu görünümde bölüm sekmeleri ve alt menü kaydırınca gizlenmez. |

Modal kullanılmaz; video her zaman izleme sayfasında ya da Shorts akışında oynar.

- **Veri**: `videolar` (`videoId`, `baslik`, `kanalId`, `kanalAdi`, `sureSaniye`, `izlenmeSayisi`, `videoTuru: video|shorts`, `yuklenmeTarihi`) ve `video_channels` (`kanalId`, `kanalAdi`, `kanalHandle`, `kanalLogoUrl`) koleksiyonları bu repo dışındaki bir süreçle doldurulur; uygulama yalnızca okur. `sureSaniye: 0` olan kayıtlar (canlı yayın/prömiyer) "YAYIN" rozetiyle gösterilir ve önizlenmez.
- **Sunucu** (`src/server/modules/content/`): `video.service.js` akışı en yeniden eskiye `yuklenmeTarihi + videoId` cursor'ıyla sayfalar (`before=<ms>_<videoId>`), kanal logolarını avatar boyutuna (`=s88`) küçültür ve 60 sn (kanallar 10 dk) bellek önbelleği tutar. `video.routes.js` uçları: `GET /api/videos/home?exclude=` (kanallar + ilk videolar + ilk shorts), `GET /api/videos/feed?type=video|shorts&before=&limit=&exclude=|channel=`, `GET /api/videos/channels`, `GET /api/videos/:videoId` (video + "Sıradaki"). Servis `app.js` içinde oluşturulur ve `routeDependencies.videoService` ile verilir; koleksiyon erişimi `content-db.js` üzerinden yapılır.
- **İstemci** (`src/client/features/videos/`): `videos-core.js` (ad alanı, biçimlendiriciler, API istemcisi), `videos-store.js` (cihazdaki veriler), `videos-player.js` (YouTube IFrame API sarmalayıcısı), `videos-feed.js`, `videos-watch.js`, `videos-shorts.js`, `videos-library.js` ve `videos-tab.js` (yönlendirme ve yaşam döngüsü). `scripts/build-assets.js` içindeki `videos` paketinde bu sırayla birleştirilir.
- **Kişisel veriler yalnızca tarayıcıda** (`localStorage` `rotakip:videos:v1`): beğenilenler, kaydedilenler, izleme geçmişi (ilerlemeyle birlikte, en fazla 200) ve takipten çıkarılan kanallar. Takip "çıkarılanlar" listesiyle saklandığından yeni eklenen kanallar herkes için otomatik takipli gelir. Oynatmada 5. saniyeye ulaşılan video ve Shorts "izlendi" sayılır (süresi 5 sn'den kısaysa süresinin tamamı; `videos-store.js` `WATCHED_SECONDS`) ve akışta tekrar önerilmez; kırmızı ilerleme çubuğu ve kaldığı yerden devam ise izlenmiş sayılmaktan bağımsız olarak gerçek konuma göre çalışır. Sekmeler arası `storage` olayıyla eşitlenir.
- **Önceden hazırlık**: kabuk sekmeyi başka sekme açıkken ısıttığında `init()` son ana akış yanıtını cihazdan (`rotakip:videos:home-cache`, 30 dk) anında çizer, `GET /api/videos/home` ile tazeler ve boşta ilk küçük resimleri, shorts posterlerini ve kanal logolarını sırayla indirir (`saveData`/2G'de indirilmez). YouTube IFrame API betiği diğer sekmelerde yüklenmez.
- **Oynatıcılar**: her bölüm tek bir oynatıcıyı yeniden kullanır (akış önizlemesi, izleme, Shorts). Önizleme ve Shorts oynatıcısı karta/slayta taşınmaz, üstüne konumlanan bir katmandır (iframe taşınırsa yeniden yüklenir). Kabuk sekmeden çıkarken görünümü DOM'dan kaldırdığı için oynatıcılar `rotakip:primary-content-ready` olayında atılır ve dönüşte yeniden kurulur; ısınmış sekmenin ilk gösterimi de bu olayla anlaşılır (kabuk bu durumda `resume()` çağırmaz).
- **Mini oynatıcı**: izleme sayfasından akışa veya Hesabım'a dönülürken (geri tuşu dahil) oynayan ya da duraklatılmış video sağ altta mini oynatıcıda sürer; dokununca izleme sayfasına döner, sol üstte oynat/duraklat, sağ üstte kapat vardır. Oynatıcı DOM'da taşınmaz (iframe yeniden yüklenirdi); `.videos.has-mini-player` sınıfıyla `.videos-watch-stage` `position: fixed` olur. Bu yüzden `videos-watch.css`, giriş animasyonundan sonra `.tab-view-videos` üzerinde transform bırakmaz. Mini oynatıcı açıkken akış önizlemesi çalışmaz; Shorts'a geçilince mini oynatıcı kapanır. Sekme içi geri/ileri de `destroy()` → `resume()` yolundan geçtiğinden `destroy()` izleme videosunu durdurmaz.
- **Shorts iframe'i yatay**: dikey iframe'de YouTube kendi Shorts arayüzünü (kanal, başlık, beğen/paylaş, logo) çizer ve bizimkilerle üst üste biner. Bu yüzden `videos-shorts.js` `positionLayer()` iframe'i videonun yüksekliğinde ve 16:9 genişlikte kurar; dikey video ortada kalır, YouTube'un öğeleri iki yandaki boşlukta, oynatıcı katmanının `overflow: hidden` sınırı dışında kırpılır.
- **Shorts tam ekran (telefon)**: Shorts iç kaydırıcıda kaydığı için tarayıcı adres çubuğu kendiliğinden gizlenmez. Shorts görünümünün sağ üstündeki tam ekran düğmesi (`.videos-shorts-fullscreen`, yalnızca ≤768px) sayfayı Fullscreen API ile tam ekrana alır/çıkarır; başka görünüme veya sekmeye geçilince `videos-tab.js` tam ekrandan çıkar. Tam ekran kendiliğinden açılmaz. iPhone Safari bu API'yi desteklemediği için düğme gizlenir.
- **Shorts tam ekran**: bölüm sekmeleri Shorts'ta akışın üstünde yüzer ve gizlidir; kullanıcı dokunup duraklatınca (`.videos.is-shorts-paused`) görünür.
- **Shorts rafı**: akışın 3. kartından sonra beyaz, yuvarlak bir kart olarak girer (en çok 4, çift sayıda kutu; mobilde 2×2, masaüstünde tek satır 4 sütun). Başlık "Shorts" sayfasına gider; başlıktaki ve kutulardaki ⋯ "Daha az Shorts videosu göster" menüsünü açar. Bu seçenek rafı bu cihazda 7 gün gizler (`localStorage` `shelfHiddenUntil`). Son 2 günde yüklenenlere "Yeni" rozeti konur.
- **Kanal seçimi**: takip edilen kanallar bölüm sekmelerinin sonundaki açılır listeyle (combobox, `renderChannelTabs` / `.videos-channel-select`) seçilir; varsayılan "Tümü". Liste düğmenin altında `position: fixed` açılır, klavye (↑ ↓ Home End Esc) desteklenir.
- **Önizleme**: mobilde kaydırma durunca (150 ms) ekranın ortasındaki kart, masaüstünde üzerine 250 ms gelinen kart sessiz oynar (en fazla 30 sn). Oynatıcı en yavaş adım olduğundan sekme görünür olunca boşta, görünmez bir katmanda önceden kurulur (`prewarm`). Kartın sağ üstündeki ses düğmesi sesi açar (tercih oturum boyunca korunur; simge her zaman beyaz, arka plan saydamdır). Altta sürüklenebilir ilerleme çubuğu ve geri sayan kalan süre vardır; videonun tamamı önizlemeden gezilebilir. YouTube'un mobil oynatıcı arayüzü her oynatma başında ~3 sn ortada duraklat simgesi gösterdiğinden, dokunmatik cihazlarda video bu süre (`PREVIEW_TOUCH_REVEAL_DELAY_MS`) gizli oynar, küçük resim görünür kalır ve simge kaybolunca açılır. `prefers-reduced-motion`, `saveData` ve 2G bağlantıda önizleme ve önceden hazırlık kapalıdır.
- **Etkinlik günlüğü**: sekme içi bölüm geçişleri `videolar_bölüm_görüntüleme` eylemiyle (`section: videolar|izle|shorts|hesabim`) yazılır; sekmenin ilk akış görünümü ayrıca kaydedilmez. İzinli liste `activity.service.js` içindeki `VIDEO_SECTIONS` ile `videos-tab.js` içindeki `LOG_SECTIONS` birebir aynı kalmalıdır (bir test bunu doğrular).
- **Günün Videosu**: Okumalar'daki görev kartı (`daily-gift.js`) `window.currentVideoData` üzerinden akıştaki ilk videoyu kullanır.

## Build ve Test

- `npm run build:assets`: `src/client` kaynaklarından minify edilmiş paketleri `public/` içine yazar ve manifesti günceller.
- `npm test`: `tests/` altındaki bütün `*.test.js` dosyalarını otomatik keşfeder.
- `npm run lint`: kaynak kodun statik analizini çalıştırır.

## Uygulama Yaşam Döngüsü

`src/server/start.js` süreç girişidir; veritabanını, indeksleri, entegrasyonları ve zamanlanmış işleri başlatır, kapanış sinyallerinde kaynakları temizler. `src/server/app.js` yalnızca Express uygulamasını oluşturur ve bağımlılıkları özellik router'larına bağlar. Yeni kod sorumluluğuna göre `modules/`, `middleware/`, `jobs/`, `integrations/` veya `shared/` altında oluşturulur.
