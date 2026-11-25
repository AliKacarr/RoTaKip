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

Tefekkür sekmesi (`/tefekkur`) tek route olarak çalışır; bölüm ve okuma biçimi sorgu parametreleriyle seçilir (`?bolum=esma`, `?bolum=risale&mod=metin|resim`). Bölümler: ayet, hadis, dua, Risale-i Nur (metin/görsel), Esmaül Hüsna, Zikirmatik, İlahiler (`?bolum=ilahi`), iki canlı radyo (Kur'an Radyo, Risalet Radyo) ve Kaydedilenler (`?bolum=kaydedilenler`).

- **İstemci** (`src/client/features/tefekkur/`): `tefekkur-core.js` ortak ad alanını ve bölüm tanımlarını (`SECTIONS`), `tefekkur-tab.js` bölüm geçişlerini ve URL durumunu, `tefekkur-slider.js` kaydırmalı okuyucuyu, `tefekkur-zikirmatik.js` sayacı, `tefekkur-radio.js` radyo oynatıcısını, `tefekkur-share.js` kopyalama ve paylaşımı, `tefekkur-favorites.js` kaydedilenleri yönetir. Bu dosyalar `scripts/build-assets.js` içindeki `tefekkur` paketinde sıralı birleştirilir; yeni dosya eklenirse oradaki sıraya da eklenmelidir. Route markup'ı `public/fragments/tefekkur.html` içindedir.
- **Sunucu** (`src/server/modules/inspiration/`): `tefekkur.routes.js` `/api/tefekkur/*` uç noktalarını (metinler, görseller, radyolar), `tefekkur.service.js` içerik okuma ve radyo listesini sağlar. Servis `app.js` içinde oluşturulur ve `routeDependencies` ile rotaya verilir.
- **Esmaül Hüsna** verisi `public/esmaulhusna.json` dosyasından okunur. Her kayıt Arapça yazım, açıklama ve `esmaulhusna_video_url` alanı taşır; video bağlantısı yalnızca `https` ve YouTube alan adları için "Tefekkür videosu" düğmesi olarak gösterilir.
- **Kaydedilenler**: okuyucuda başlığın altındaki çubukta, Metin/Resim anahtarının solundaki yıldız geçerli kartı kaydeder/çıkarır. Kayıtlar yalnız cihazda, `localStorage` içindeki `rotakip:tefekkur-favorites` anahtarında, kartın o anki kopyasıyla (bölüm, okuma biçimi, metin/görsel yolu) tutulur; sunucuya gitmez. `?bolum=kaydedilenler[&mod=ayet|hadis|dua|risale|esma]` ayrı bir görünüm değil, aynı okuyucudur: kayıtlar en yeniden eskiye sağa-sola kaydırılır, Rastgele düğmesi çalışır, Metin/Resim anahtarının yerinde "tür" düğmesi türe göre süzme penceresini açar (`mod` süzülen bölümdür). Yıldızı çıkarılan kart o oturumda okuyucuda kalır, yıldıza yeniden dokunarak geri eklenebilir.
- **İlahiler** (`?bolum=ilahi`): YouTube ilahilerinden her açılışta yeniden karıştırılan bir çalma listesi. Veri `ilahiler` koleksiyonundadır (`videoId`, `baslik`, `kanalAdi`, `sureSaniye`, `aktif`); `scripts/import-ilahiler.js` (`scripts/data/ilahi-linkleri.txt` + `YOUTUBE_API_KEY`) YouTube Data API'den başlık, süre ve gömülebilirlik bilgisini çekip upsert eder (`--dry-run` ile yalnız rapor verir). `GET /api/tefekkur/ilahiler` aktif listeyi (`ilahi.service.js`, 10 dk önbellek), `POST /api/tefekkur/ilahi-onerileri` kullanıcı önerisini `ilahi_onerileri` koleksiyonuna video kimliğiyle yazar (IP başına saatte 10; tekrar önerilerde `oneriSayisi` artar; yönetici ekranı yoktur). İstemci: `tefekkur-ilahi-queue.js` (saf kuyruk ve kişiselleştirme kuralları, birim testli), `tefekkur-ilahi-player.js` (YouTube iframe'i), `tefekkur-ilahi.js` (görünüm, kuyruk, öneri penceresi), `tefekkur-ilahi.css`. Kişiselleştirme yalnız cihazda, `localStorage` içindeki `rotakip:tefekkur-ilahi` anahtarında tutulur: yalnız 👎 ile işaretlenen ilahi karışıma girmez; ilk ~15 sn içinde geçilen ilahi listede kalır ama en alta, son çalınan 20 ilahi de onun hemen üstüne itilir; beğenilenler (kısa geçilmiş olsalar da) her 4 sıranın en çok birine serpiştirilir. Bir ilahi bitince 3 sn sonra sonraki başlar; oynatılamayan ilahi sessizce atlanır. 👎 çalan ilahiyi kesmez ve listeden silmez: işaret kaydedilir, ilahi bir sonraki karışımda gösterilmez (tekrar basmak geri alır; 👍 da 👎'yı kaldırır). Listenin üstündeki sekmeler Sıradaki / Beğendiklerim / Beğenmediklerim listelerini açar (sayaçlı, en son çalınan üstte); satıra dokunmak ilahiyi çalar (sırada yoksa çalanın arkasına eklenir), satırdaki × işareti geri alır. Paylaş düğmesi ilahinin YouTube bağlantısını `navigator.share` ile, yoksa WhatsApp/X/kopyala penceresiyle (`ns.share.shareLink`) paylaşır.
- **İlahi oynatıcısı**: iframe, `document.body` altındaki kalıcı bir sahnede (`#tefekkurIlahiStage`) yaşar; sekme görünümü DOM'dan sökülünce iframe taşınıp baştan yüklenmesin diye. İlahi sayfasında sahne `#tefekkurIlahiSlot` yer tutucusunun üstüne oturur (her karede konum eşitlenir). Başka bir Tefekkür görünümüne ya da sekmeye geçilince, çalmaya başlamışsa sağ alt köşede sürüklenebilir mini oynatıcıya dönüşür (sol üstte oynat/duraklat, sağ üstte kapat); dokununca `?bolum=ilahi` tam ekran açılır. Oynatıcı Kur'an/Risalet Radyo başlatılınca (`tefekkur-radio.js` → `ns.ilahi.dispose()`; ilahi çalarken radyo da susar) ve Videolar sekmesine geçilince (`tefekkur-tab.js` `destroy()` hedef adresi okur, ayrıca `rotakip:primary-content-ready` dinlenir) yok edilir. YouTube iframe'i mobilde ekran kilidinde durur.
- **Radyolar** yayın adreslerini ortam değişkenlerinden alır: `TEFEKKUR_KURAN_RADYO_URL` ve `TEFEKKUR_RISALET_RADYO_URL` (`.env.example`). Adres boş ya da `https/http` dışındaysa ilgili radyo "kullanılamıyor" durumunda kalır. Site HTTPS ile sunulduğundan `https://` adres tercih edilir.
- **Etkinlik günlüğü**: bölüm görüntülemeleri `tefekkur_bölüm_görüntüleme` eylemiyle `activity` modülüne yazılır (bölüm anahtarı ve okuma biçimi `activity.service.js` içindeki izinli listeyle doğrulanır). Sekme içi geçişlerde `shell-router.js` "sekme açıldı" kaydını tekrarlamaz.

## Makaleler

Makaleler sekmesi (`/makaleler`) iki görünümden oluşur: kategori listesi (2 sütunlu kartlar) ve seçilen kategorinin makale listesi. Kategori adresi `?kategori=<slug>` ile saklanır; slug ve kategori adı `public/fragments/articles.html` içindeki kartlarda (`data-slug`, `data-category`) tanımlıdır. Veritabanındaki `articles.category` değeriyle birebir eşleşmelidir.

- **Önceden hazırlık**: sekme açılırken (başka sekme açıkken arka planda ısıtılırken de) `GET /api/articles/preview?perCategory=4` her kategorinin ilk makalelerini tek istekte getirir; görseller boşta kalınca sırayla indirilir (`saveData`/2G bağlantıda görseller indirilmez).
- **Efekt**: kategori seçilince görünüm, makaleler ve görselleri hazır olunca (en fazla 1,5 sn beklenir) `is-entering` efektiyle açılır; kartlar `--card-index` ile sırayla gelir. `prefers-reduced-motion` altında efekt kapalıdır.
- **Arama**: kategori kartlarının üstündeki kutu `GET /api/articles/search?q=&limit=` ister (yazarken 220 ms gecikmeli, eski istek `AbortController` ile iptal edilir, sonuçlar istemcide önbelleğe alınır). Sunucu tüm makalelerin katlanmış (Türkçe küçük harf, aksansız; `ı/İ`, `â`, kesme işareti farkı yok) bir kopyasını 60 sn bellekte tutar ve başlık > kategori > metin ağırlığıyla puanlar. Soru sözcükleri (`nedir`, `neden`, `mi`…) yok sayılır, uzun sözcüklerin kökü sözcük başında da aranır ("kötülüğe" → "kötülükler"), 3 harf ve altı sözcükler yalnız sözcük başında eşleşir. Yanıt her makale için `matches.title` / `matches.text` vurgu aralıklarını içerir; istemci bunları `<mark class="articles-mark">` ile sarar. Sonuç varken kategori kartları gizlenir, sonuç yoksa yeniden görünür.
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
- **Kişisel veriler yalnızca tarayıcıda** (`localStorage` `rotakip:videos:v1`): beğenilenler, kaydedilenler, izleme geçmişi (ilerlemeyle birlikte, en fazla 200) ve takipten çıkarılan kanallar. Takip "çıkarılanlar" listesiyle saklandığından yeni eklenen kanallar herkes için otomatik takipli gelir. Oynatmada 5. saniyeye ulaşılan video ve Shorts "izlendi" sayılır (süresi 5 sn'den kısaysa süresinin tamamı; `videos-store.js` `WATCHED_SECONDS`); akıştaki kart önizlemesinde toplam 10 sn oynayan video da "izlendi" olur (`markWatched`). Akış (Tümü veya seçili kanal) ve Shorts önce izlenmemişleri listeler; sunucu sayfaları bitince liste hemen sona ermez, aynı sırayla baştan izlenmişler eklenir (`pass: 'unwatched' → 'watched'`). Liste tamamen bitince akışın sonunda, kullanıcıyı Tefekkür ve Makaleler sekmelerine yönlendiren bir bitiş kartı (`endHtml()`) gösterilir. Kırmızı ilerleme çubuğu ve kaldığı yerden devam ise izlenmiş sayılmaktan bağımsız olarak gerçek konuma göre çalışır. Sekmeler arası `storage` olayıyla eşitlenir.
- **Önceden hazırlık**: kabuk sekmeyi başka sekme açıkken ısıttığında `init()` son ana akış yanıtını cihazdan (`rotakip:videos:home-cache`, 30 dk) anında çizer, `GET /api/videos/home` ile tazeler ve boşta ilk küçük resimleri, shorts posterlerini ve kanal logolarını sırayla indirir (`saveData`/2G'de indirilmez). YouTube IFrame API betiği diğer sekmelerde yüklenmez.
- **Oynatıcılar**: her bölüm tek bir oynatıcıyı yeniden kullanır (akış önizlemesi, izleme, Shorts). Önizleme ve Shorts oynatıcısı karta/slayta taşınmaz, üstüne konumlanan bir katmandır (iframe taşınırsa yeniden yüklenir). Kabuk sekmeden çıkarken görünümü DOM'dan kaldırdığı için oynatıcılar `rotakip:primary-content-ready` olayında atılır ve dönüşte yeniden kurulur; ısınmış sekmenin ilk gösterimi de bu olayla anlaşılır (kabuk bu durumda `resume()` çağırmaz).
- **Mini oynatıcı**: izleme sayfasından akışa veya Hesabım'a dönülürken (geri tuşu dahil) oynayan ya da duraklatılmış video sağ altta mini oynatıcıda sürer; dokununca izleme sayfasına döner, sol üstte oynat/duraklat, sağ üstte kapat vardır. Oynatıcı DOM'da taşınmaz (iframe yeniden yüklenirdi); `.videos.has-mini-player` sınıfıyla `.videos-watch-stage` `position: fixed` olur. Bu yüzden `videos-watch.css`, giriş animasyonundan sonra `.tab-view-videos` üzerinde transform bırakmaz. İzleme sayfasından mini oynatıcıya geçerken oynatıcı bulunduğu yerden sağ alttaki konumuna küçülerek kayar: `videos-mini.js` `capture()` geçişten önce sahnenin konumunu ve köşe yuvarlaklığını alır, `shrinkFrom()` mini sınıf uygulandıktan sonra ters dönüşümden (translate + scale) dönüşümsüze 460 ms Web Animations (FLIP) ile oynatır; iframe taşınmadığı ve yeniden yüklenmediği için video kesilmez. Videolar sekmesi kendi içinde gezindiğinde (izleme ↔ akış, geri tuşu dahil) kabuk görünümü gizleyip yeniden açmaz: `window.RoTaKipVideoTab.keepVisibleInTab` ile `shell-router.js` `navigate()` `activateView(route, null, { keepVisible })` çağırır, `visible` sınıfı kaldırılmaz ve `is-preparing-return` eklenmez; böylece sekme giriş efekti (solma + `translateY`) oynamaz ve mini oynatıcıya geçiş doğrudan görünür. Aşağıdaki bekleme yolu yalnız görünüm gerçekten gizli açıldığında (sekmeye ilk giriş, başka sekmeden dönüş) devreye girer: `.tab-view` önce `visible` sınıfı olmadan (`translateY(16px)`, `is-preparing-return`) hazırlanır, sonra 0,4 sn'lik giriş animasyonuyla açılır; dönüşümlü bir atanın içinde `position: fixed` ekrana değil o ataya (sayfa kadar uzun görünüme) göre konumlandığından mini oynatıcı bu sürede ekranın en altında ölçülürdü. Bu yüzden `viewSettled()` (visible + hazırlık yok + giriş animasyonu bitti) olana kadar ölçüm yapılmaz; sahne bu sürede eski, büyük konumunda satır içi koordinatlarla tutulur ve görünüm oturunca küçülme oynatılır. `prefers-reduced-motion` altında animasyon yoktur. Mini oynatıcı açıkken akış önizlemesi çalışmaz; Shorts'a geçilince mini oynatıcı kapanır. Sekme içi geri/ileri de `destroy()` → `resume()` yolundan geçtiğinden `destroy()` izleme videosunu durdurmaz.
- **Taze/eski karışımı**: izlenmemiş olduğu için en yeni videolar hep en üstte kalmasın diye (`videos-core.js` `ns.mixFresh`) her sayfanın en yeni üçte biri "taze" sayılır ve kalan eskilerle karıştırılır; sıralamanın yaklaşık %40'ı tazedir, üst sıra eski bir videoyla başlar (örüntü: eski, taze, eski, taze, eski, eski, taze…). Grup içi sıra (tazeler kendi aralarında, eskiler kendi aralarında) korunur; 4'ten az öğede karıştırılmaz. "Tümü" akışında, Shorts rafında, Shorts görünümünde ve "Sıradaki" devam sayfalarında uygulanır; kanal seçiliyken ve izlenmişler aşamasında kronolojik sıra korunur. Karışım için ana akışın ilk sayfası (`HOME_VIDEO_LIMIT`) ve sonraki sayfalar 24 videodur.
- **Sıradaki listesi sonsuz kayar**: izleme sayfasında `GET /api/videos/:videoId` yalnız ilk 12 öneriyi verir; liste sonundaki gözcü (`#videosWatchRelatedSentinel`) ekrana 500 px yaklaşınca `videos-watch.js` `loadMoreRelated()` aynı `GET /api/videos/feed` ucundan (24'lük sayfalar, imleçle) yeni öneriler ekler. Gösterilenler ve geçerli video tekrarlanmaz; takipten çıkarılan kanallar (geçerli videonun kanalı hariç) elenir.
- **Otomatik oynatma**: izleme sayfasındaki "Sıradaki" başlığının yanındaki anahtar (`role="switch"`, varsayılan açık, cihazda `autoplay` olarak saklanır) açıkken video bitince (`ENDED`; yalnız IFrame API oynatıcısında, mini oynatıcıda değil) oynatıcının üstünde "Sıradaki video N içinde oynatılacak" katmanı (`.videos-autonext`) 5 sn geri sayar ve "Sıradaki" listesindeki Shorts/canlı olmayan ilk videoyu (izlenmemişler önce) açar. İptal / ✕ katmanı kapatır, "Şimdi oynat" veya küçük resim hemen geçer; video yeniden oynatılınca ya da sayfadan çıkılınca geri sayım iptal olur.
- **Shorts iframe'i yatay**: dikey iframe'de YouTube kendi Shorts arayüzünü (kanal, başlık, beğen/paylaş, logo) çizer ve bizimkilerle üst üste biner. Bu yüzden `videos-shorts.js` `positionLayer()` iframe'i videonun yüksekliğinde ve 16:9 genişlikte kurar; dikey video ortada kalır, YouTube'un öğeleri iki yandaki boşlukta, oynatıcı katmanının `overflow: hidden` sınırı dışında kırpılır.
- **Shorts tam ekran (telefon)**: Shorts iç kaydırıcıda kaydığı için tarayıcı adres çubuğu kendiliğinden gizlenmez. Shorts görünümünün sağ üstündeki yatay üç nokta düğmesi (`.videos-shorts-more`, yalnızca ≤768px) iki seçenekli menü açar: "Tam ekran" sayfayı Fullscreen API ile tam ekrana alır/çıkarır (başka görünüme veya sekmeye geçilince `videos-tab.js` tam ekrandan çıkar; kendiliğinden açılmaz); "Bu kanalı önerme" o anki Shorts'un kanalını takipten çıkarır (`store.setFollow(channelId, false)`), akış yenilenir. iPhone Safari Fullscreen API'yi desteklemediği için orada yalnız kanal seçeneği görünür. Video durdurulunca (bölüm sekmeleri görünürken) üç noktanın soluna ses aç/kapat düğmesi (`.videos-shorts-sound`) gelir; videoyu yeniden başlatmadan yalnız sesi değiştirir (`shorts.toggleMute()`).
- **Bölüm sekmesi göstergesi**: seçili sekmenin altındaki kırmızı çizgi her sekmede yeniden genişleyerek belirmez; nav içindeki tek bir `.videos-section-indicator` öğesi sekme değişince eski konumundan yenisine sağa/sola kayar (`transform: translateX` + `width` geçişi, 0,34 sn). Konum ve genişliği `videos-tab.js` `placeIndicator()` seçili sekmenin `offsetLeft`/`offsetWidth` değerinden `--indicator-x` / `--indicator-w` olarak verir; ilk yerleşimde (ve sekme görünümü gizliyken ölçülemediğinde) kayma olmaz, `is-ready` sınıfı ilk konum yerleştikten sonraki karede geçişleri açar. Gösterge yeni sekmeye geçerken çizginin üstünden metne doğru yükselen kırmızı ışıma (`.is-rising::before`) yalnız gerçek sekme değişiminde oynar; yeniden boyutlandırma ve yazı tipi yüklemesinde gösterge yalnız yeniden hizalanır. `prefers-reduced-motion` altında geçiş ve ışıma yoktur.
- **Shorts tam ekran**: bölüm sekmeleri Shorts'ta akışın üstünde yüzer ve gizlidir; kullanıcı dokunup duraklatınca (`.videos.is-shorts-paused`) görünür. Başka bir görünümden Shorts'a geçilirken çubuk hemen gizlenmez: `.videos.is-shorts-entering` sınıfı (`holdSectionsForShorts`, 1 sn) çubuğu görünür tutar; kırmızı gösterge "Shorts" yazısının altına kayıp yükselen ışımayı oynar, sonra çubuk her zamanki gibi gizlenir. Doğrudan Shorts'ta açılışta ve `prefers-reduced-motion` altında beklenmez.
- **Shorts rafı**: "Tümü" seçiliyken akışın 3. kartından sonra ve ardından her 12 kartta bir beyaz, yuvarlak bir kart olarak girer (en çok 4, çift sayıda kutu; mobilde 2×2, masaüstünde tek satır 4 sütun). Raflar arasında aynı short tekrar etmez; önce izlenmemişler, sonra izlenmişler kullanılır ve havuz azalınca arka planda yeni shorts sayfası istenir. Kutularda ilerleme çizgisi yoktur; ekranda yeterince görünen rafın ilk kutusu sessizce ilk 5 saniyesini döngüler (izlendi sayılmaz). Başlık "Shorts" sayfasına gider; başlıktaki ve kutulardaki ⋯ "Daha az Shorts videosu göster" menüsünü açar. Bu seçenek rafı bu cihazda 7 gün gizler (`localStorage` `shelfHiddenUntil`). Yalnızca bugün (yerel gün başlangıcından itibaren) yüklenenlere "Yeni" rozeti konur.
- **"Gözlerini dinlendir" alanı**: "Tümü" seçiliyken akışın 9. kartından sonra yalnız bir kez (akış yenilenene kadar) Shorts rafı gibi tam genişlikte bir kart olarak girer (`listenHtml`, `LISTEN_ITEMS`). Üç renkli kutu Tefekkür'deki İlahiler (`?bolum=ilahi`), Kur'an Radyo ve Risalet Radyo (`?bolum=kuran-radyo|risalet-radyo`, "Canlı" rozetli) bölümlerine `data-app-path` ile kabuk üzerinden, sayfa yenilenmeden geçirir; başlıktaki "Tefekkür" bağlantısı sekmenin ana listesine gider. Masaüstünde 3 sütun, ≤640 px'de alt alta yatay satırlardır.
- **Kanal seçimi**: takip edilen kanallar bölüm sekmelerinin sonundaki açılır listeyle (combobox, `renderChannelTabs` / `.videos-channel-select`) seçilir; varsayılan "Tümü"; son seçilen kanal cihazda saklanır (`selectedChannel`) ve sekme yeniden açılınca geri yüklenir (kanal silinmiş ya da takipten çıkarılmışsa "Tümü"ne dönülür). Liste düğmenin altında `position: fixed` açılır, klavye (↑ ↓ Home End Esc) desteklenir.
- **Önizleme**: mobilde kaydırma durunca (150 ms) ekranın ortasındaki kart, masaüstünde üzerine 250 ms gelinen kart sessiz oynar; kart yoksa ekrandaki Shorts rafının ilk kutusu oynar. Oynatıcı en yavaş adım olduğundan sekme görünür olunca boşta, görünmez bir katmanda önceden kurulur (`prewarm`). Kartın sağ üstündeki ses düğmesi sesi açar (tercih oturum boyunca korunur; simge her zaman beyaz, arka plan saydamdır). Altta sürüklenebilir ilerleme çubuğu ve geri sayan kalan süre vardır; videonun tamamı önizlemeden gezilebilir. `prefers-reduced-motion`, `saveData` ve 2G bağlantıda önizleme ve önceden hazırlık kapalıdır.
- **Etkinlik günlüğü**: sekme içi bölüm geçişleri `videolar_bölüm_görüntüleme` eylemiyle (`section: videolar|izle|shorts|hesabim`) yazılır; sekmenin ilk akış görünümü ayrıca kaydedilmez. İzinli liste `activity.service.js` içindeki `VIDEO_SECTIONS` ile `videos-tab.js` içindeki `LOG_SECTIONS` birebir aynı kalmalıdır (bir test bunu doğrular).
- **Günün Videosu**: Okumalar'daki görev kartı (`daily-gift.js`) `window.currentVideoData` üzerinden akıştaki ilk videoyu kullanır.

## Build ve Test

- `npm run build:assets`: `src/client` kaynaklarından minify edilmiş paketleri `public/` içine yazar ve manifesti günceller.
- `npm test`: `tests/` altındaki bütün `*.test.js` dosyalarını otomatik keşfeder.
- `npm run lint`: kaynak kodun statik analizini çalıştırır.

## Uygulama Yaşam Döngüsü

`src/server/start.js` süreç girişidir; veritabanını, indeksleri, entegrasyonları ve zamanlanmış işleri başlatır, kapanış sinyallerinde kaynakları temizler. `src/server/app.js` yalnızca Express uygulamasını oluşturur ve bağımlılıkları özellik router'larına bağlar. Yeni kod sorumluluğuna göre `modules/`, `middleware/`, `jobs/`, `integrations/` veya `shared/` altında oluşturulur.
