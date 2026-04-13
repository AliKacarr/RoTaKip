# 📚 RoTaKip – Okuma Takip Sistemi

Okuma alışkanlıklarını takip etmek, istatistikleri görmek ve grup motivasyonunu artırmak için geliştirilmiş modern bir platform.

🌐 [https://rotakip.onrender.com/](https://rotakip.onrender.com/)

---

## ✨ Temel Özellikler

### 👥 Grup & Kullanıcı

- Grup oluşturma ve katılım (admin onaylı)  
- Herkese açık / özel grup görünürlüğü, arama ve filtreleme  
- Admin / üye rol sistemi  
- Profil ve grup avatarları (Dropbox ile görsel yükleme)  

### 📊 Okuma Takibi

- Haftalık tabloda günlük okuma işaretleme (okudum / okumadım)  
- Lig sistemi (Bronz → Gümüş → Altın)
- Okuma serisi takibi  
- Haftalık ve aylık istatistikler, takvim görünümü  

### 🎯 Motivasyon

- Günün sözü, ayet & hadis, dua paylaşımları  
- YouTube video entegrasyonu  
- Lig atlama ve diğer bildirimler (**OneSignal**)  

### 🔒 Güvenlik & Yönetim

- Şifreli giriş (**bcrypt**), rol tabanlı yetkilendirme  
- Giriş ve erişim logları  
- Zamanlanmış **otomatik yedekleme** (ayrı yedek veritabanı)  
- Admin paneli, katılma isteklerini yönetme  

---

## 🛠️ Teknolojiler

**Backend:** Node.js, Express, MongoDB / Mongoose, Multer, Sharp, node-schedule, Moment.js  

**Frontend:** Vanilla JavaScript, CSS3, Font Awesome  

**Entegrasyonlar:** Dropbox, OneSignal, YouTube Data API, Google Analytics, Tawk.to canlı destek 

---

## 🚀 Kurulum

```bash
git clone [repo-url]
cd reading-tracker
npm install
node server.js
```

Uygulama varsayılan olarak **http://localhost:3000** adresinde açılır (`PORT` ile değiştirilebilir). İsterseniz `npm start` da kullanılabilir.

---

## ⚙️ Ortam Değişkenleri (`.env`)

Kök dizinde `.env` oluşturup değerleri doldurun:

```env
# MongoDB
MONGO_URI=mongodb://localhost:27017/reading-tracker
DB_NAME=readingTracker
BACKUP_DB_NAME=backups

# YouTube
YOUTUBE_API_KEY=

# Dropbox — yükleme için erişim jetonu; yenileme için uygulama anahtarları
DROPBOX_ACCESS_TOKEN=
DROPBOX_APP_KEY=
DROPBOX_APP_SECRET=
DROPBOX_REFRESH_TOKEN=

# OneSignal (REST API anahtarı ONESIGNAL_API_KEY ile)
ONESIGNAL_APP_ID=
ONESIGNAL_API_KEY=
```

Dropbox ve OneSignal olmadan temel sayfalar çalışabilir; dosya yükleme ve push bildirimleri bu anahtarlara bağlıdır.

---

## 📈 Neler sunar?

- Okuma alışkanlığını düzenli ve görünür kılar  
- Grup içi rekabet ve motivasyon sağlar  
- İstatistiklerle gelişimi takip ettirir  

---

## 📌 Not

Bu proje **özel kullanım** için geliştirilmiştir. Ticari kullanım için izin gereklidir.

---

## 📬 İletişim

**alikacardev@gmail.com**

Teknik konular için uygunsa GitHub üzerinden issue açılabilir.
