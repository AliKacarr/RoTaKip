# RoTaKip – Okuma Takip Sistemi

Okuma alışkanlığınızı takip etmek, kullanıcı istatistiklerini görmek ve grup motivasyonunu artırmak için geliştirilmiş modern bir uygulaması.

🌐 [https://rotakip.up.railway.app/](https://rotakip.up.railway.app/)

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Online-brightgreen?style=for-the-badge&logo=google-chrome&logoColor=white)](https://rotakip.up.railway.app/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![REST API](https://img.shields.io/badge/REST_API-02569B?style=for-the-badge&logo=fastapi&logoColor=white)](#-api-mimarisi-rest-api)
[![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/CSS)

---

## Temel Özellikler

### Grup & Kullanıcı

- Okuma grupları oluşturma ve katılım
- Herkese açık / özel grup görünürlüğü, arama ve filtreleme  
- Admin / üye rol sistemi  
- Profil ve grup avatarları (**Dropbox**)  

### Okuma Takibi

- Haftalık tabloda günlük okuma işaretleme (okudum / okumadım / boş)  
- Lig sistemi (Bronz → Gümüş → Altın)
- Okuma serisi takibi  
- Haftalık ve aylık istatistikler, takvim görünümü  
- Otomatik okuma işaretleme entegrasyonları (**WhatsApp**)

### Motivasyon

- Günün sözü, ayet & hadis, dua paylaşımları  
- YouTube video entegrasyonu  
- Lig atlama ve diğer bildirimler (**OneSignal**)  

### Güvenlik & Yönetim

- Şifreli giriş, rol tabanlı yetkilendirme  
- Giriş ve erişim logları  
- Zamanlanmış otomatik yedekleme  
- Admin paneli, katılma isteklerini yönetme  
- Site trafiği ve kullanım analizi (**Google Analytics**)  

---

## 📸 Ekran Görüntüleri

| Ana Sayfa | Haftalık Tablo | Günlük Görevler |
|:---------:|:--------------:|:---------------:|
| <img src="docs/assets/screenshots/01-home.png" width="250"> | <img src="docs/assets/screenshots/02-weekly-table.png" width="250"> | <img src="docs/assets/screenshots/03-daily-tasks.png" width="250"> |

| Günün Hediyesi | Profil Ekranı | Kutlama Mesajları |
|:--------------:|:-------------:|:-----------------:|
| <img src="docs/assets/screenshots/04-daily-gift.png" width="250"> | <img src="docs/assets/screenshots/05-profile.png" width="250"> | <img src="docs/assets/screenshots/06-celebration-messages.png" width="250"> |

| Liderlik Panosu | Aylık Takvim | En Uzun Seri Grafiği |
|:----------------:|:------------:|:--------------------:|
| <img src="docs/assets/screenshots/07-leaderboard.png" width="250"> | <img src="docs/assets/screenshots/08-monthly-calendar.png" width="250"> | <img src="docs/assets/screenshots/09-longest-streak-chart.png" width="250"> |

| Okuma Grafiği | Tefekkür | Videolar |
|:-------------:|:----------------:|:--------:|
| <img src="docs/assets/screenshots/10-reading-chart.png" width="250"> | <img src="docs/assets/screenshots/11-mercy-window.png" width="250"> | <img src="docs/assets/screenshots/12-videos.png" width="250"> |

| Makaleler | Grup Ayarları | Tercihler |
|:---------:|:-------------:|:---------:|
| <img src="docs/assets/screenshots/13-articles.png" width="250"> | <img src="docs/assets/screenshots/14-group-settings.png" width="250"> | <img src="docs/assets/screenshots/15-preferences.png" width="250"> |

---

## API Mimarisi (REST API)

İstemci ve sunucu arasındaki veri iletişimi **REST API** standartlarına uygun uç noktalar (endpoints) üzerinden gerçekleştirilir:

- **Grup & Üye İşlemleri:** `GET /api/groups`, `GET /api/users/:groupId`, `POST /api/add-user/:groupId`, `DELETE /api/delete-group/:groupId` ...
- **Okuma & Durum Güncelleme:** `POST /api/update-status/:groupId`, `GET /api/user-stats/:groupId/:userId`, `GET /api/reading-stats/:groupId` ...
- **Yönetim & Loglar:** `POST /api/admin-login`, `GET /api/access-logs`, `GET /api/login-logs` ...

---

## Teknolojiler

**Backend:** Node.js, Express, MongoDB / Mongoose, Multer, Sharp, node-schedule, Moment.js  

**Frontend:** Vanilla JavaScript, CSS3, Font Awesome  

**Entegrasyonlar:** Whatsapp, Dropbox, OneSignal, YouTube, Google Analytics

---

## Sekmeli Uygulama Mimarisi

Kaynak yerleşimi, dosya sahipliği ve geliştirme kuralları için [mimari belgesine](docs/architecture.md) bakın.

Grup deneyimi ortak `app-shell.html` kabuğu üzerinde, route'a göre tembel yüklenen fragment ve asset paketlerinden oluşur. Okuma gruplarını keşfetme ekranının görünümü `public/fragments/gruplar.html` dosyasıdır ve `/gruplar` rotasında shell içine yüklenir:

- `/grup/:groupId/` — haftalık takip, motivasyon panelleri, grup ayarları, lig kartları, aylık takvim ve grafikler
- `/tesbihat` — bağımsız Tesbihat sekmesi; `/` bu adrese yönlendirilir (içerik daha sonra eklenecek)
- `/videolar`, `/tefekkur`, `/makaleler` — grup bağlamından bağımsız içerikler

İstemci kaynakları `src/client/`, shell yönlendirmesi `public/app/`, görünüm HTML'leri `public/fragments/` altındadır. `npm run build` sekmeye özel CSS/JS paketlerini üretir ve içerik hash'lerini `public/assets-manifest.json` içine yazar. Üretilmiş paketler Git tarafından takip edilmez. `/groupid=:groupId` bağlantıları query parametrelerini koruyarak kanonik grup adresine yönlendirilir.

`admin.html`, `access-logs.html` ve `login-logs.html` bağımsız yönetim belgeleridir. Kaynakları `src/client/features/site-activity-admin/` ve `src/client/features/activity-logs/` altında paketlenir; uygulama shell'inin sekme ön yükleme akışına dahil edilmez ve yalnız doğrudan açıldıklarında yüklenir.

---

## Kurulum

```bash
git clone [repo-url]
cd reading-tracker
npm install
npm start
```

Uygulama varsayılan olarak **http://localhost:3000** adresinde açılır (`PORT` ile değiştirilebilir).

---

## Ortam Değişkenleri (`.env`)

Kök dizinde `.env` oluşturup değerleri doldurun:

```env
# MongoDB
MONGO_URI=mongodb://localhost:27017/reading-tracker
DB_NAME=readingTracker
SESSION_SECRET=uzun-rastgele-bir-deger

# Dropbox — yükleme için erişim jetonu; yenileme için uygulama anahtarları
DROPBOX_APP_KEY=
DROPBOX_APP_SECRET=
DROPBOX_REFRESH_TOKEN=

# OneSignal (REST API anahtarı ONESIGNAL_API_KEY ile)
ONESIGNAL_APP_ID=
ONESIGNAL_API_KEY=
```

Dropbox ve OneSignal olmadan temel sayfalar çalışabilir; dosya yükleme ve push bildirimleri bu anahtarlara bağlıdır.

---

## Geliştirici

**Ali Kaçar**

[![Instagram](https://img.shields.io/badge/Instagram-E4405F?logo=instagram&logoColor=white)](https://www.instagram.com/alikacar23/)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?logo=linkedin&logoColor=white)](https://www.linkedin.com/in/alikacar23/)
[![GitHub](https://img.shields.io/badge/GitHub-181717?logo=github&logoColor=white)](https://github.com/AliKacarr)
[![YouTube](https://img.shields.io/badge/YouTube-FF0000?logo=youtube&logoColor=white)](https://www.youtube.com/@alikacardev)

[alikacardev@gmail.com](mailto:alikacardev@gmail.com)

---

## Lisans

Bu proje [MIT Lisansı](LICENSE.txt) ile lisanslanmıştır.
