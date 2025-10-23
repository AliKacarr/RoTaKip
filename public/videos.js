// Farklı kanalların ID'leri
const CHANNEL_IDS = [
  'UCa4B618R90dxe7N9OK0LJyQ', // Çatı Katı Elazığ
  'UCb2NNTeDSPr2sFHrI2AwHTQ', //Hisar Kapısı
  'UCgC81lrIwMJJvAjyKm1ooow', //Maksat 114
  'UCN5t14BCdTIQ-116TxJuBMg' //Sözler Köşkü
];

// DOM elementleri
const videosContainer = document.getElementById('videos');
const videoModal = document.getElementById('videoModal');
const videoFrame = document.getElementById('videoFrame');
const closeBtn = document.querySelector('.close');


// Video yükleme durumu
let videoInitialized = false;

// Global video verisi - daily-gift.js için
window.currentVideoData = null;


// Video bölümünü başlatma fonksiyonu
function initializeVideos() {
    if (videoInitialized) return;
    videoInitialized = true;
    
    // API anahtarını sunucudan al
    fetch('/api/config')
        .then(response => response.json())
        .then(config => {
            API_KEY = config.youtubeApiKey;
            // API anahtarı alındıktan sonra videoları yükle
            showRandomVideos();
        })
        .catch(error => {
            console.error('API anahtarı alınırken hata oluştu:', error);
            videosContainer.innerHTML = `<div class="error">Yapılandırma yüklenirken bir hata oluştu. Lütfen daha sonra tekrar deneyin.</div>`;
        });
}

// Tek bir kanalın son 50 videosunu getir (hızlı yükleme için)
async function fetchLatestVideosFromChannel(channelId) {
    try {
        // Kanalın uploads playlist ID'sini al
        const channelResponse = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${API_KEY}`);
        const channelData = await channelResponse.json();
        if (!channelData.items || channelData.items.length === 0) return [];
        
        const uploadsPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.uploads;
        
        // Sadece son 50 videoyu al (tüm sayfaları çekmek yerine)
        const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${uploadsPlaylistId}&key=${API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        
        return data.items || [];
    } catch (error) {
        console.error(`Kanal ${channelId} videoları alınırken hata:`, error);
        return [];
    }
}

// Tüm kanallardan son videoları getir (hızlı yükleme)
async function fetchLatestVideosFromAllChannels() {
    let allVideos = [];
    
    // Tüm kanallardan son 50 videoyu paralel olarak çek
    const channelPromises = CHANNEL_IDS.map(channelId => fetchLatestVideosFromChannel(channelId));
    const channelResults = await Promise.all(channelPromises);
    
    // Tüm videoları birleştir
    channelResults.forEach(videos => {
        allVideos = allVideos.concat(videos);
    });
    
    return allVideos;
}

// Video detaylarını toplu olarak getir (viewCount için)
async function fetchVideosDetails(videoIds) {
    const ids = videoIds.join(',');
    const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids}&key=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    return data.items;
}

function getRandomVideos(videos, count) {
    const shuffled = videos.slice().sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

// Videoları ekrana bas
function renderVideos(videos) {
    videosContainer.innerHTML = '';

    const videoIds = videos.map(item => item.snippet.resourceId.videoId);

    fetchVideosDetails(videoIds).then(details => {
        const viewMap = {};
        details.forEach(item => {
            viewMap[item.id] = parseInt(item.statistics.viewCount, 10) || 0;
        });

        // Tüm video kartlarını topluca oluştur ve ekle
        const fragment = document.createDocumentFragment();

        videos.forEach((item, index) => {
            const videoId = item.snippet.resourceId.videoId;
            const title = item.snippet.title;
            const thumbnail = item.snippet.thumbnails.high.url;
            const viewCount = viewMap[videoId] || 0;
            const formattedViewCount = new Intl.NumberFormat('tr-TR').format(viewCount);

            // İlk videoyu global olarak sakla (daily-gift.js için)
            if (index === 0) {
                window.currentVideoData = {
                    url: `https://www.youtube.com/watch?v=${videoId}`,
                    thumbnail: thumbnail,
                    title: title,
                    videoId: videoId
                };
            }

            const videoCard = document.createElement('div');
            videoCard.className = 'video-card';
            videoCard.style.opacity = '0';
            videoCard.style.transform = 'translateY(30px)';
            videoCard.innerHTML = `
                <img src="${thumbnail}" alt="${title}" class="thumbnail">
                <span class="play-icon"><i class="fa-solid fa-play"></i></span>
                <div class="video-title">
                    <div class="title-text">${title}</div>
                    <div class="view-count"><i class="fa-solid fa-eye"></i> ${formattedViewCount}</div>
                </div>
            `;

            videoCard.addEventListener('click', () => {
                openVideoModal(videoId);
            });

            fragment.appendChild(videoCard);
        });

        videosContainer.appendChild(fragment);

        // Intersection Observer'ı oluştur
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                } else {
                    // Element görünür alandan çıktığında animasyonu sıfırla
                    entry.target.style.opacity = '0';
                    entry.target.style.transform = 'translateY(30px)';
                }
            });
        }, {
            threshold: 0.1, // Kartın %10'u görünür olduğunda tetikle
            rootMargin: '50px' // Kartlar ekranın 50px yakınına geldiğinde tetikle
        });

        // Tüm video kartlarını gözlemle
        document.querySelectorAll('.video-card').forEach(card => {
            observer.observe(card);
        });

    }).catch(error => {
        console.error("Video detayları alınırken hata oluştu:", error);
    });
}

let isLoading = false;

// En son eklenen videolar (tüm kanallardan)
async function showLatestVideos() {
    if (isLoading) return;
    isLoading = true;
    // Set active button
    document.querySelectorAll('.top-bar button').forEach(btn => btn.classList.remove('active'));
    document.getElementById('latestBtn').classList.add('active');

    try {
        const allVideos = await fetchLatestVideosFromAllChannels();
        if (!allVideos || allVideos.length === 0) throw new Error('Video bulunamadı');
        
        // Tarihe göre sırala (en yeni önce)
        allVideos.sort((a, b) => new Date(b.snippet.publishedAt) - new Date(a.snippet.publishedAt));
        
        // İlk 6 videoyu al
        renderVideos(allVideos.slice(0, 6));
    } catch (error) {
        videosContainer.innerHTML = `<div class="error">Videolar yüklenirken bir hata oluştu. Lütfen daha sonra tekrar deneyin.</div>`;
    } finally {
        isLoading = false;
    }
}

// En çok izlenen videolar (tüm kanallardan)
async function showMostViewedVideos() {
    if (isLoading) return;
    isLoading = true;
    // Set active button
    document.querySelectorAll('.top-bar button').forEach(btn => btn.classList.remove('active'));
    document.getElementById('mostViewedBtn').classList.add('active');

    try {
        const allVideos = await fetchLatestVideosFromAllChannels();
        if (!allVideos || allVideos.length === 0) throw new Error('Video bulunamadı');
        
        const videoIdList = allVideos.map(item => item.snippet.resourceId.videoId);
        let stats = [];
        for (let i = 0; i < videoIdList.length; i += 50) {
            const batch = videoIdList.slice(i, i + 50);
            const details = await fetchVideosDetails(batch);
            stats = stats.concat(details);
        }
        const viewMap = {};
        stats.forEach(item => {
            viewMap[item.id] = parseInt(item.statistics.viewCount, 10) || 0;
        });
        allVideos.sort((a, b) => (viewMap[b.snippet.resourceId.videoId] || 0) - (viewMap[a.snippet.resourceId.videoId] || 0));
        renderVideos(allVideos.slice(0, 6));
    } catch (error) {
        videosContainer.innerHTML = `<div class="error">Videolar yüklenirken bir hata oluştu. Lütfen daha sonra tekrar deneyin.</div>`;
    } finally {
        isLoading = false;
    }
}

// Rastgele videolar (tüm kanallardan)
async function showRandomVideos() {
    if (isLoading) return;
    isLoading = true;
    // Set active button
    document.querySelectorAll('.top-bar button').forEach(btn => btn.classList.remove('active'));
    document.getElementById('randomBtn').classList.add('active');

    try {
        const allVideos = await fetchLatestVideosFromAllChannels();
        if (!allVideos || allVideos.length === 0) throw new Error('Video bulunamadı');
        const randomVideos = getRandomVideos(allVideos, 6);
        renderVideos(randomVideos);
    } catch (error) {
        videosContainer.innerHTML = `<div class="error">Videolar yüklenirken bir hata oluştu. Lütfen daha sonra tekrar deneyin.</div>`;
    } finally {
        isLoading = false;
    }
}

// Butonlara tıklama olayları
document.getElementById('latestBtn').addEventListener('click', () => {
    if (typeof logUnauthorizedAccess === 'function') {
        logUnauthorizedAccess('En son eklenen videoları görüntüleme');
    }
    showLatestVideos();
});

document.getElementById('mostViewedBtn').addEventListener('click', () => {
    if (typeof logUnauthorizedAccess === 'function') {
        logUnauthorizedAccess('En çok izlenen videoları görüntüleme');
    }
    showMostViewedVideos();
});

document.getElementById('randomBtn').addEventListener('click', () => {
    if (typeof logUnauthorizedAccess === 'function') {
        logUnauthorizedAccess('Rastgele videoları görüntüleme');
    }
    showRandomVideos();
});

// Yenile butonuna tıklandığında aktif kategoriye göre videoları yenile
document.getElementById('refreshBtn').addEventListener('click', () => {
    // Video yenileme işlemini logla
    if (typeof logUnauthorizedAccess === 'function') {
        logUnauthorizedAccess('Video listesini yenileme');
    }
    
    // Aktif olan butonu bul
    const activeButton = document.querySelector('.top-bar button.active');

    if (activeButton) {
        // Aktif butona göre ilgili fonksiyonu çağır
        if (activeButton.id === 'latestBtn') {
            showLatestVideos();
        } else if (activeButton.id === 'mostViewedBtn') {
            showMostViewedVideos();
        } else if (activeButton.id === 'randomBtn') {
            showRandomVideos();
        }
    } else {
        // Eğer aktif buton yoksa varsayılan olarak son eklenen videoları göster
        showLatestVideos();
    }
});

// Video modalını aç
function openVideoModal(videoId) {
    videoFrame.src = `https://www.youtube.com/embed/${videoId}`;
    videoModal.style.display = 'flex';
}

// Modal kapatma işlemleri
closeBtn.addEventListener('click', closeModal);
window.addEventListener('click', (event) => {
    if (event.target === videoModal) {
        closeModal();
    }
});

function closeModal() {
    videoModal.style.display = 'none';
    videoFrame.src = '';
}

const refreshBtn = document.getElementById('refreshBtn');
const refreshIcon = refreshBtn.querySelector('i');
let rotateDeg = 0;

setInterval(() => {
    refreshIcon.classList.add('pulse');
    // Animasyon bittikten sonra sınıfı kaldır
    setTimeout(() => {
        refreshIcon.classList.remove('pulse');
    }, 1000); // Animasyon süresi kadar bekle
}, 15000);

refreshBtn.addEventListener('click', function () {
    rotateDeg += 180;
    refreshIcon.style.transition = 'transform 0.6s';
    refreshIcon.style.transform = `rotate(${rotateDeg}deg)`;
});
