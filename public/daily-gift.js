// Günlük Hediye Sistemi
let dailyGiftData = null;
let lastGiftDate = null;

// Sayfa yüklendiğinde çalışacak
document.addEventListener('DOMContentLoaded', function() {
    setupDailyGiftEvents();
});

// Event listener'ları ayarla
function setupDailyGiftEvents() {
    const giftButton = document.getElementById('dailyGiftButton');
    const tasksButton = document.getElementById('dailyTasksButton');
    const giftModal = document.getElementById('dailyGiftModal');
    const closeButton = document.getElementById('dailyGiftClose');
    const overlay = document.querySelector('.daily-gift-overlay');

    if (giftButton) {
        giftButton.addEventListener('click', openDailyGiftModal);
    }

    if (tasksButton) {
        tasksButton.addEventListener('click', openDailyTasksModal);
    }

    if (closeButton) {
        closeButton.addEventListener('click', closeDailyGiftModal);
    }

    if (overlay) {
        overlay.addEventListener('click', closeDailyGiftModal);
    }

    // Modal dışına tıklandığında kapatma
    if (giftModal) {
        giftModal.addEventListener('click', function(e) {
            // Eğer modal'ın kendisine tıklandıysa (content değilse) kapat
            if (e.target === giftModal) {
                closeDailyGiftModal();
            }
        });
    }
}

// Günlük hediye modalını aç
function openDailyGiftModal() {
    const modal = document.getElementById('dailyGiftModal');
    if (!modal) return;

    // Bugünün tarihini al
    const today = new Date().toDateString();
    
    // Eğer bugün için hediye alınmışsa, aynı hediye göster
    if (lastGiftDate === today && dailyGiftData) {
        showGiftData(dailyGiftData);
        modal.style.display = 'flex';
        // Animasyon için kısa gecikme
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
        return;
    }

    // Yeni hediye yükle
    loadDailyGift().then(() => {
        modal.style.display = 'flex';
        // Animasyon için kısa gecikme
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
    }).catch(error => {
        console.error('Hediye yükleme hatası:', error);
        alert('Hediye yüklenirken bir hata oluştu. Lütfen tekrar deneyin.');
    });
}

// Günlük hediye verilerini yükle
async function loadDailyGift() {
    try {
        const response = await fetch('/esmaulhusna.json');
        if (!response.ok) {
            throw new Error('JSON dosyası yüklenemedi');
        }
        
        const esmaulhusnaList = await response.json();
        
        // Rastgele bir esmaül hüsna seç
        const randomIndex = Math.floor(Math.random() * esmaulhusnaList.length);
        const selectedEsma = esmaulhusnaList[randomIndex];
        
        // Veriyi sakla
        dailyGiftData = selectedEsma;
        lastGiftDate = new Date().toDateString();
        
        // Modalda göster
        showGiftData(selectedEsma);
        
    } catch (error) {
        console.error('Esmaül Hüsna yükleme hatası:', error);
        throw error;
    }
}

// Hediye verilerini modalda göster
function showGiftData(esmaData) {
    const nameElement = document.getElementById('esmaulhusnaName');
    const descriptionElement = document.getElementById('esmaulhusnaDescription');
    const videoLinkElement = document.getElementById('esmaulhusnaVideoLink');
    const videoThumbnailElement = document.getElementById('esmaulhusnaVideoThumbnail');

    if (nameElement) {
        nameElement.textContent = esmaData.esmaulhusna_name;
    }

    if (descriptionElement) {
        descriptionElement.textContent = esmaData.esmaulhusna_description;
    }

    if (videoLinkElement) {
        videoLinkElement.href = esmaData.esmaulhusna_video_url;
    }

    // YouTube video thumbnail oluştur (sadece API ile)
    if (videoThumbnailElement && esmaData.esmaulhusna_video_url) {
        // Thumbnail container'ı göster
        const thumbnailContainer = document.querySelector('.daily-gift-video-thumbnail-container');
        if (thumbnailContainer) {
            thumbnailContainer.style.display = 'block';
        }
        
        // Sadece API'den gerçek thumbnail'ı al
        getYouTubeThumbnailFromAPI(esmaData.esmaulhusna_video_url).then(apiThumbnail => {
            if (apiThumbnail && videoThumbnailElement) {
                videoThumbnailElement.src = apiThumbnail;
                videoThumbnailElement.style.display = 'block';
            } else {
                // API'den thumbnail alınamazsa container'ı gizle
                if (thumbnailContainer) {
                    thumbnailContainer.style.display = 'none';
                }
            }
        }).catch(error => {
            console.log('API thumbnail yüklenemedi, container gizleniyor:', error);
            // Hata durumunda container'ı gizle
            if (thumbnailContainer) {
                thumbnailContainer.style.display = 'none';
            }
        });
    } else {
        // Video URL yoksa thumbnail container'ı gizle
        const thumbnailContainer = document.querySelector('.daily-gift-video-thumbnail-container');
        if (thumbnailContainer) {
            thumbnailContainer.style.display = 'none';
        }
    }
}


// YouTube API kullanarak gerçek thumbnail al
async function getYouTubeThumbnailFromAPI(videoUrl) {
    try {
        // Video ID'yi çıkar
        const url = new URL(videoUrl);
        let videoId = null;
        
        if (url.hostname.includes('youtube.com')) {
            videoId = url.searchParams.get('v');
        } else if (url.hostname.includes('youtu.be')) {
            videoId = url.pathname.substring(1);
        }
        
        if (!videoId) return null;
        
        // API anahtarını al
        const configResponse = await fetch('/api/config');
        const config = await configResponse.json();
        const API_KEY = config.youtubeApiKey;
        
        if (!API_KEY) {
            console.warn('YouTube API anahtarı bulunamadı, fallback thumbnail kullanılıyor');
            return getYouTubeThumbnail(videoUrl);
        }
        
        // YouTube API'den video detaylarını al
        const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${API_KEY}`);
        const data = await response.json();
        
        if (data.items && data.items.length > 0) {
            const thumbnails = data.items[0].snippet.thumbnails;
            // En yüksek kaliteli thumbnail'ı seç
            return thumbnails.maxres?.url || thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url;
        }
        
        return null;
    } catch (error) {
        console.error('YouTube API thumbnail hatası:', error);
        // Fallback olarak basit thumbnail kullan
        return getYouTubeThumbnail(videoUrl);
    }
}

// Günlük görevler modalını aç
function openDailyTasksModal() {
    // Şimdilik basit bir alert göster
    alert('Günlük Görevler özelliği yakında eklenecek!');
}

// Modalı kapat
function closeDailyGiftModal() {
    const modal = document.getElementById('dailyGiftModal');
    if (modal) {
        // Önce animasyonu başlat
        modal.classList.remove('show');
        // Animasyon bitince modal'ı gizle
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }
}

