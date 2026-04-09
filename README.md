# 📚 RoTaKip Okuma Takip Sistemi

Modern ve kullanıcı dostu bir okuma takip platformu. Grup üyelerinin günlük okuma alışkanlıklarını takip etmek, istatistiklerini görüntülemek ve motivasyonlarını artırmak için geliştirilmiştir.

🌐 [RoTaKip Web Uygulaması](https://rotakip.onrender.com/)

## ✨ Özellikler

### 🏠 Ana Sayfa & Grup Yönetimi

- **Grup Oluşturma**: Yeni okuma grupları oluşturma
- **Grup Katılımı**: Admin onayı ile üyelik sistemi
- **Görünürlük Ayarları**: Herkese açık veya özel gruplar
- **Grup Arama**: Gerçek zamanlı arama ve filtreleme
- **Hazır Avatar Seçimi**: Grup ve kullanıcı avatarları
- **Responsive Tasarım**: Tüm cihazlarda uyumlu

### 👥 Kullanıcı Yönetimi

- **Kullanıcı Yönetimi**: Ekleme, silme ve güncelleme
- **Profil Resimleri**: Dropbox cloud storage entegrasyonu
- **Yetkilendirme**: Admin ve üye rolleri
- **Güvenli Giriş**: Şifre korumalı erişim

### 📊 Okuma Takibi

- **Günlük Takip**: Haftalık okuma durumu takibi
- **Lig Sistemi**: Okuma sayısına göre lig atlama
- **Seri Takibi**: Ardışık okuma günleri
- **İstatistikler**: Detaylı okuma analizleri
- **Aylık Görünüm**: Takvim formatında okuma geçmişi

### 🎯 Motivasyon Özellikleri

- **Günün Sözü**: İlham verici sözler
- **Ayet & Hadis**: Dini içerik paylaşımı
- **Dua Paylaşımı**: Günlük dualar
- **YouTube Entegrasyonu**: Eğitici videolar
- **Lig Atlama Bildirimleri**: Başarı kutlamaları

### 🔒 Güvenlik & Yönetim

- **Admin Paneli**: Kapsamlı yönetim arayüzü
- **Katılma İstekleri**: Kabul/red yönetimi
- **Güvenlik Logları**: Erişim ve giriş kayıtları
- **Otomatik Yedekleme**: Günlük veri yedeği

### 📱 Kullanıcı Deneyimi

- **Modern UI/UX**: Şık ve kullanıcı dostu arayüz
- **Animasyonlar**: Smooth geçiş efektleri
- **Responsive**: Tüm cihazlarda uyumlu
- **Push Notifications**: OneSignal entegrasyonu
- **Hızlı Yükleme**: Optimize edilmiş performans
- **Video Sessizlik Kaldırıcı**: `/video-silence-remover` adresinden video içindeki sessiz bölümleri kısaltma

## 🛠️ Teknolojiler

### Backend

- **Node.js** - JavaScript runtime
- **Express.js** - Web framework
- **MongoDB** - NoSQL veritabanı
- **Mongoose** - MongoDB ODM
- **Multer** - Dosya yükleme middleware
- **Sharp** - Resim optimizasyonu ve işleme
- **Dropbox API** - Cloud storage entegrasyonu
- **node-schedule** - Zamanlanmış görevler (yedekleme, temizlik)
- **Moment.js** - Tarih/saat işlemleri

### Frontend

- **Vanilla JavaScript** - Modern ES6+ (Classes, Async/Await)
- **CSS3** - Flexbox, Grid, Animations, Variables
- **FontAwesome** - İkon kütüphanesi
- **Responsive Design** - Mobile-first yaklaşım

### Entegrasyonlar

- **Dropbox API** - Cloud storage için resim ve dosya yönetimi
- **OneSignal** - Push notification servisi
- **YouTube API** - Video içerik entegrasyonu
- **Python Scripts** - WhatsApp anket entegrasyonu

## 🚀 Kurulum

### 1. Projeyi Klonlayın

```bash
git clone [repo-url]
cd reading-tracker
```

### 2. Bağımlılıkları Yükleyin

```bash
npm install
```

### 3. Ortam Değişkenlerini Ayarlayın

`.env` dosyası oluşturun:

```env
# MongoDB
MONGO_URI=mongodb://localhost:27017/reading-tracker
DB_NAME=reading-tracker
BACKUP_DB_NAME=reading-tracker-backup

# API Keys
YOUTUBE_API_KEY=your_youtube_api_key_here
DROPBOX_ACCESS_TOKEN=your_dropbox_access_token_here

# OneSignal (Push Notifications)
ONESIGNAL_APP_ID=your_onesignal_app_id
ONESIGNAL_REST_API_KEY=your_onesignal_rest_api_key

# Server
PORT=3000
```

### 4. MongoDB'yi Başlatın

```bash
# MongoDB servisini başlatın
mongod
```

### 5. Uygulamayı Çalıştırın

```bash
node server.js
```

Uygulama `http://localhost:3000` adresinde çalışacaktır.

## 📁 Proje Yapısı

```
reading-tracker/
├── public/                      # Frontend dosyaları
│   ├── *.html                   # HTML sayfaları (index, groups)
│   ├── *.css                    # Stil dosyaları (modüler CSS)
│   ├── *.js                     # JavaScript dosyaları
│   │   ├── index.js            # Ana sayfa (grup listesi)
│   │   ├── script.js           # GlobalDataStore ve temel fonksiyonlar
│   │   ├── main-area.js        # Grup sayfası ana mantığı
│   │   ├── tracker-table.js    # Takip tablosu
│   │   ├── user-cards.js       # Kullanıcı kartları
│   │   ├── monthly.js          # Aylık takvim
│   │   └── ...                 # Diğer modüller
│   ├── images/                  # Genel resimler
│   ├── groupAvatars/            # Grup avatar seçenekleri
│   ├── userAvatars/             # Kullanıcı avatar seçenekleri
│   ├── quotes/                  # Günün sözü resimleri
│   ├── risaleoku/               # Risale-i Nur görselleri
│   ├── uploads/                 # Yüklenen dosyalar (temp)
│   └── push/                    # OneSignal push notification
├── poll-data-extraction/        # WhatsApp anket entegrasyonu
│   ├── ateizmfikri_scraper.js  # Web scraping
│   ├── wp-anket-veri.js        # Veri işleme
│   └── wp-send-poll.py         # WhatsApp gönderimi
├── server.js                    # Ana sunucu dosyası
├── backupService.js             # Otomatik yedekleme servisi
├── add-quotes.js                # Söz ekleme utility
└── package.json                 # Proje bağımlılıkları
```

## 🔌 API Endpoints

### Grup İşlemleri

- `POST /api/groups` - Yeni grup oluşturma
- `GET /api/groups` - Grup listesi (arama ve pagination desteği)
- `GET /api/group/:groupId` - Tek grup detayı
- `GET /api/groups/:groupId/member-count` - Üye sayısı
- `POST /api/delete-group/:groupId` - Grup silme
- `POST /api/update-group/:groupId` - Grup güncelleme
- `POST /api/remove-group-image/:groupId` - Grup resmini kaldırma

### Kullanıcı İşlemleri

- `POST /api/add-user/:groupId` - Kullanıcı ekleme
- `POST /api/delete-user/:groupId` - Kullanıcı silme
- `POST /api/update-user/:groupId` - Kullanıcı güncelleme
- `POST /api/update-user-image/:groupId` - Profil resmi güncelleme (Dropbox)
- `GET /api/users/:groupId` - Grup kullanıcıları

### Katılma İstekleri

- `POST /api/join-group-request` - Katılma isteği gönderme
- `GET /api/join-requests/:groupId` - Grup katılma istekleri
- `GET /api/join-request-status-by-id/:requestId` - İstek durumu sorgulama
- `POST /api/accept-join-request/:requestId` - İsteği kabul etme
- `POST /api/reject-join-request/:requestId` - İsteği reddetme
- `DELETE /api/cancel-join-request-by-id/:requestId` - İsteği iptal etme
- `DELETE /api/delete-join-request/:requestId` - İsteği silme

### Okuma Takibi

- `GET /api/all-data/:groupId` - Tüm veriler
- `POST /api/update-status/:groupId` - Okuma durumu güncelleme
- `GET /api/user-stats/:groupId/:userId` - Kullanıcı istatistikleri
- `GET /api/reading-stats/:groupId` - Okuma istatistikleri
- `GET /api/longest-streaks/:groupId` - En uzun seriler

### İçerik API'leri

- `GET /api/random-quote` - Rastgele söz
- `GET /api/random-ayet` - Rastgele ayet
- `GET /api/random-hadis` - Rastgele hadis
- `GET /api/random-dua` - Rastgele dua
- `GET /api/quote-images` - Söz resimleri listesi
- `GET /api/group-avatars` - Grup avatar seçenekleri
- `GET /api/user-avatars` - Kullanıcı avatar seçenekleri

### Admin İşlemleri

- `POST /api/admin-login` - Admin girişi
- `POST /api/verify-admin` - Admin doğrulama
- `GET /api/access-logs` - Erişim kayıtları (unauthorized access)
- `GET /api/login-logs` - Giriş kayıtları

### YouTube Entegrasyonu

- `GET /api/config` - YouTube API yapılandırması
- `GET /api/videos/:groupId` - Grup videoları

### Yedekleme & Bakım

- `POST /api/backup` - Manuel yedekleme
- Otomatik yedekleme: Her gece 00:00
- Otomatik temizlik: Eski profil resimleri

## 🎮 Kullanım

### Grup Oluşturma

1. Ana sayfada "Grup Oluştur" butonuna tıklayın
2. Grup bilgilerini doldurun (ad, açıklama, görünürlük)
3. Admin bilgilerini girin
4. Grup resmi yükleyin (isteğe bağlı)
5. "Grup Oluştur" butonuna tıklayın

### Grup Katılımı

1. Ana sayfada mevcut grupları görüntüleyin
2. Katılmak istediğiniz gruba tıklayın
3. Admin girişi yapın
4. Gruba katılın

### Okuma Takibi

1. Haftalık takip tablosunda günlere tıklayın
2. Okuma durumunuzu işaretleyin (✔ Okudum, ✖ Okumadım)
3. İstatistiklerinizi görüntüleyin
4. Lig atlama durumunuzu takip edin

## 🔧 Yapılandırma

### MongoDB Koleksiyonları

- `usergroups` - Grup bilgileri (groupId, groupName, description, visibility, groupImage)
- `users_[groupId]` - Grup üyeleri (dinamik collection per grup)
- `readingstatuses_[groupId]` - Okuma durumları (dinamik collection per grup)
- `joinrequests` - Katılma istekleri (pending, accepted, rejected)
- `admins` - Admin bilgileri
- `accesslogs` - Yetkisiz erişim logları
- `loginlogs` - Giriş logları

### Lig Sistemi

```javascript
const LEAGUES = [
  { min: 0, max: 5, name: "Bronz" },
  { min: 5, max: 10, name: "Gümüş" },
  { min: 10, max: 20, name: "Altın" },
  // ... daha fazla lig
];
```

## 🔄 Yedekleme Sistemi

- **Otomatik Yedekleme**: Her gün gece yarısı (00:00)
- **Manuel Yedekleme**: Admin panelinden
- **Otomatik Temizlik**: Kullanılmayan dosyaların temizlenmesi
- **Cloud Backup**: Dropbox entegrasyonu ile güvenli saklama

## 📊 İstatistikler

### Takip Edilen Metrikler

- Günlük okuma durumu
- Ardışık okuma serileri
- Lig atlama durumu
- Haftalık/aylık özetler
- Grup performansı

### Görselleştirme

- Haftalık takip tablosu
- Aylık takvim görünümü
- İstatistik kartları
- Progress bar'lar
- Lig gösterimi

## 🛡️ Güvenlik

### Yetkilendirme

- **Admin Şifre Koruması**: Bcrypt ile hash'lenmiş şifreler
- **Grup Bazlı Erişim**: Her grup için ayrı kullanıcı yetkilendirmesi
- **LocalStorage Session**: Client-side oturum yönetimi
- **Rol Tabanlı Erişim**: Admin ve member rolleri

### Güvenlik Logları

- **Access Logs**: Yetkisiz erişim denemeleri
- **Login Logs**: Başarılı/başarısız giriş kayıtları
- **Timestamp Tracking**: Tüm işlemlerin zaman damgası
- **IP Logging**: İstek kaynaklarının takibi

### Veri Güvenliği

- **Otomatik Yedekleme**: Veri kaybı önleme
- **Dropbox Cloud Storage**: Güvenli dosya saklama
- **Input Validasyonu**: XSS ve injection saldırı önleme
- **File Type Checking**: Sadece izin verilen dosya türleri
- **Image Optimization**: Sharp ile güvenli resim işleme
- **CORS Yapılandırması**: Cross-origin istekleri kontrolü

## 🚀 Deployment

### Render (Mevcut)

Uygulama şu anda [Render.com](https://rotakip.onrender.com/) üzerinde çalışmaktadır.

**Gereksinimler:**

- Node.js 16+
- MongoDB Atlas (veya başka MongoDB servisi)
- Dropbox API token
- OneSignal hesabı
- YouTube API key
- Video sessizlik kaldırıcı için Python 3 ve FFmpeg

**Environment Variables:**

```env
MONGO_URI=mongodb+srv://...
DROPBOX_ACCESS_TOKEN=...
ONESIGNAL_APP_ID=...
YOUTUBE_API_KEY=...
```

### Docker

```dockerfile
FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

**Docker Compose:**

```yaml
version: "3.8"
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - MONGO_URI=${MONGO_URI}
      - DROPBOX_ACCESS_TOKEN=${DROPBOX_ACCESS_TOKEN}
    depends_on:
      - mongodb
  mongodb:
    image: mongo:latest
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db

volumes:
  mongodb_data:
```

## ⚡ Performans

- **Lazy Loading**: İçerik ihtiyaç anında yüklenir
- **Image Optimization**: WebP formatı ve Sharp ile optimizasyon
- **Database Indexing**: Hızlı sorgulama için index kullanımı
- **Dropbox CDN**: Cloud storage ile hızlı erişim
- **Async Operations**: Non-blocking I/O işlemleri

## 🤝 Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit yapın (`git commit -m 'Add amazing feature'`)
4. Push yapın (`git push origin feature/amazing-feature`)
5. Pull Request oluşturun

## 📝 Lisans

Bu proje özel kullanım için geliştirilmiştir. Ticari kullanım için izin gereklidir.

## 📞 İletişim

- **Proje Yöneticisi**: alikacardev@gmail.com
- **Teknik Destek**: GitHub Issues
- **Özellik İstekleri**: GitHub Discussions

**RoTaKip** ile okuma alışkanlıklarınızı takip edin, motivasyonunuzu artırın ve hedeflerinize ulaşın! 📚✨
