# RoTaKip – Okuma Takip Sistemi

[![Live Demo](https://img.shields.io/badge/Live-Demo-4B0082?logo=render&logoColor=white)](https://rotakip.onrender.com/)
[![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-4.x-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)

Okuma alışkanlığınızı takip etmek, kullanıcı istatistiklerini görmek ve grup motivasyonunu artırmak için geliştirilmiş modern bir uygulaması.

🌐 [https://rotakip.onrender.com/](https://rotakip.onrender.com/)

---

## 📸 Ekran Görüntüleri

| Ana Sayfa | Haftalık Tablo | Günlük Görevler |
|:---------:|:--------------:|:---------------:|
| <img src="public/site_gorselleri/1-%20Ana%20sayfa.png" width="250"> | <img src="public/site_gorselleri/2%20-%20Haftal%C4%B1k%20Tablo.png" width="250"> | <img src="public/site_gorselleri/3%20-%20G%C3%BCnl%C3%BCk%20g%C3%B6revler.png" width="250"> |

| Günün Hediyesi | Profil Ekranı | Kutlama Mesajları |
|:--------------:|:-------------:|:-----------------:|
| <img src="public/site_gorselleri/4-%20G%C3%BCn%C3%BCn%20hediyesi.png" width="250"> | <img src="public/site_gorselleri/5-%20Profil%20Ekran%C4%B1.png" width="250"> | <img src="public/site_gorselleri/6%20-%20Kutlama%20Mesajlar%C4%B1.png" width="250"> |

| Liderlik Panosu | Aylık Takvim | En Uzun Seri Grafiği |
|:----------------:|:------------:|:--------------------:|
| <img src="public/site_gorselleri/7%20-%20Liderlik%20panosu.png" width="250"> | <img src="public/site_gorselleri/8%20-%20Ayl%C4%B1k%20takvim.png" width="250"> | <img src="public/site_gorselleri/9%20-En%20uzun%20seri%20%20grafi%C4%9Fi.png" width="250"> |

| Okuma Grafiği | Rahmet Penceresi | Videolar |
|:-------------:|:----------------:|:--------:|
| <img src="public/site_gorselleri/10%20-%20Okuma%20grafi%C4%9Fi.png" width="250"> | <img src="public/site_gorselleri/11%20-%20Rahmet%20Penceresi.png" width="250"> | <img src="public/site_gorselleri/12%20-%20Videolar.png" width="250"> |

| Makaleler | Grup Ayarları | Tercihler |
|:---------:|:-------------:|:---------:|
| <img src="public/site_gorselleri/13%20-%20Makaleler.png" width="250"> | <img src="public/site_gorselleri/14-%20Grup%20Ayarlar%C4%B1.png" width="250"> | <img src="public/site_gorselleri/15%20-%20Tercihler.png" width="250"> |

---

## Temel Özellikler

### Grup & Kullanıcı

- Grup oluşturma ve katılım (admin onaylı)  
- Herkese açık / özel grup görünürlüğü, arama ve filtreleme  
- Admin / üye rol sistemi  
- Profil ve grup avatarları (Dropbox ile görsel yükleme)  

### Okuma Takibi

- Haftalık tabloda günlük okuma işaretleme (okudum / okumadım / boş)  
- Lig sistemi (Bronz → Gümüş → Altın)
- Okuma serisi takibi  
- Haftalık ve aylık istatistikler, takvim görünümü  

### Motivasyon

- Günün sözü, ayet & hadis, dua paylaşımları  
- YouTube video entegrasyonu  
- Lig atlama ve diğer bildirimler (**OneSignal**)  

### Güvenlik & Yönetim

- Şifreli giriş (**bcrypt**), rol tabanlı yetkilendirme  
- Giriş ve erişim logları  
- Zamanlanmış **otomatik yedekleme** (ayrı yedek veritabanı)  
- Admin paneli, katılma isteklerini yönetme  

---

## Teknolojiler

**Backend:** Node.js, Express, MongoDB / Mongoose, Multer, Sharp, node-schedule, Moment.js  

**Frontend:** Vanilla JavaScript, CSS3, Font Awesome  

**Entegrasyonlar:** Dropbox, OneSignal, YouTube Data API, Google Analytics, Tawk.to canlı destek 

---

## Kurulum

```bash
git clone [repo-url]
cd reading-tracker
npm install
node server.js
```

Uygulama varsayılan olarak **http://localhost:3000** adresinde açılır (`PORT` ile değiştirilebilir). İsterseniz `npm start` da kullanılabilir.

---

## Ortam Değişkenleri (`.env`)

Kök dizinde `.env` oluşturup değerleri doldurun:

```env
# MongoDB
MONGO_URI=mongodb://localhost:27017/reading-tracker
DB_NAME=readingTracker
BACKUP_DB_NAME=backups

# YouTube
YOUTUBE_API_KEY=

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
