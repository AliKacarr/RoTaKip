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
    const tasksModal = document.getElementById('dailyTasksModal');
    const giftCloseButton = document.getElementById('dailyGiftClose');
    const tasksCloseButton = document.getElementById('dailyTasksClose');
    const giftOverlay = document.querySelector('.daily-gift-overlay');
    const tasksOverlay = document.querySelector('.daily-tasks-overlay');

    if (giftButton) {
        giftButton.addEventListener('click', openDailyGiftModal);
    }

    if (tasksButton) {
        tasksButton.addEventListener('click', openDailyTasksModal);
    }

    if (giftCloseButton) {
        giftCloseButton.addEventListener('click', closeDailyGiftModal);
    }

    if (tasksCloseButton) {
        tasksCloseButton.addEventListener('click', closeDailyTasksModal);
    }

    if (giftOverlay) {
        giftOverlay.addEventListener('click', closeDailyGiftModal);
    }

    if (tasksOverlay) {
        tasksOverlay.addEventListener('click', closeDailyTasksModal);
    }

    // Modal dışına tıklandığında kapatma
    if (giftModal) {
        giftModal.addEventListener('click', function(e) {
            if (e.target === giftModal) {
                closeDailyGiftModal();
            }
        });
    }

    if (tasksModal) {
        tasksModal.addEventListener('click', function(e) {
            if (e.target === tasksModal) {
                closeDailyTasksModal();
            }
        });
    }

    // Günlük görevler için event listener'lar
    setupDailyTasksEvents();
}

// Günlük görevler event listener'larını ayarla
function setupDailyTasksEvents() {
    // Okuma hedefi kaydet butonu
    const saveGoalBtn = document.getElementById('saveDailyGoal');
    if (saveGoalBtn) {
        saveGoalBtn.addEventListener('click', saveDailyReadingGoal);
    }

    // Görev kutularına tıklama olayları
    const taskItems = document.querySelectorAll('.daily-task-item');
    taskItems.forEach(item => {
        item.addEventListener('click', function(e) {
            // Checkbox veya checkbox alanına tıklanmışsa işlem yapma
            if (e.target.type === 'checkbox' || 
                e.target.closest('.daily-task-checkbox') || 
                e.target.closest('.daily-task-check-label')) {
                return;
            }
            
            const taskType = this.getAttribute('data-task');
            const checkbox = this.querySelector('.daily-task-check');
            const isCompleted = checkbox.checked;
            
            // Checkbox durumunu tersine çevir
            checkbox.checked = !isCompleted;
            
            // Görev durumunu kaydet
            saveTaskStatus(taskType, !isCompleted);
            
            // Görev item'larını güncelle
            updateTaskItems();
            
            // Başarı mesajı ve özel işlemler
            if (!isCompleted) {
                showNotification('Görev tamamlandı! 🎉', 'success');
                handleTaskCompletion(taskType);
            } else {
                showNotification('Görev geri alındı', 'info');
            }
        });
    });

    // Checkbox'lara ayrı event listener ekle
    const taskCheckboxes = document.querySelectorAll('.daily-task-check');
    taskCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function(e) {
            // Event propagation'ı durdur
            e.stopPropagation();
            
            const taskType = this.id.replace('task', '').toLowerCase();
            const isCompleted = this.checked;
            
            // Görev durumunu kaydet
            saveTaskStatus(taskType, isCompleted);
            
            // Görev item'larını güncelle
            updateTaskItems();
            
            // Sadece basit bildirim, özel işlem yok
            if (isCompleted) {
                showNotification('Görev tamamlandı! 🎉', 'success');
            } else {
                showNotification('Görev geri alındı', 'info');
            }
        });
        
        // Checkbox'a tıklama olayını da yakala
        checkbox.addEventListener('click', function(e) {
            // Event propagation'ı durdur
            e.stopPropagation();
        });
    });

    // Enter tuşu ile hedef kaydetme
    const goalInput = document.getElementById('dailyReadingGoal');
    if (goalInput) {
        goalInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                saveDailyReadingGoal();
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
    const modal = document.getElementById('dailyTasksModal');
    if (!modal) return;

    // Modalı göster
    modal.style.display = 'flex';
    // Animasyon için kısa gecikme
    setTimeout(() => {
        modal.classList.add('show');
    }, 10);

    // Günlük görevleri yükle
    loadDailyTasks();
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

// Günlük görevler modalını kapat
function closeDailyTasksModal() {
    const modal = document.getElementById('dailyTasksModal');
    if (modal) {
        // Önce animasyonu başlat
        modal.classList.remove('show');
        // Animasyon bitince modal'ı gizle
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }
}

// Günlük görevler verilerini yükle
function loadDailyTasks() {
    // Günlük okuma hedefini yükle
    loadDailyReadingGoal();
    
    // Görev durumlarını yükle
    loadTaskStatuses();
    
    // Günün videosunu yükle
    loadDailyVideo();
    
    // İlerleme göstergesini güncelle
    updateProgressIndicator();
}

// Günlük okuma hedefini yükle
function loadDailyReadingGoal() {
    const goalInput = document.getElementById('dailyReadingGoal');
    const savedGoal = localStorage.getItem('dailyReadingGoal');
    
    if (savedGoal) {
        goalInput.value = savedGoal;
    }
}

// Günlük okuma hedefini kaydet
function saveDailyReadingGoal() {
    const goalInput = document.getElementById('dailyReadingGoal');
    const goal = parseInt(goalInput.value);
    
    if (goal && goal > 0) {
        localStorage.setItem('dailyReadingGoal', goal);
        
        // Başarı mesajı göster
        showNotification('Günlük okuma hedefi kaydedildi!', 'success');
        
        // Input'u temizle
        goalInput.value = '';
    } else {
        showNotification('Lütfen geçerli bir sayfa sayısı girin!', 'error');
    }
}

// Görev durumlarını yükle
function loadTaskStatuses() {
    const today = new Date().toDateString();
    const tasksData = JSON.parse(localStorage.getItem('dailyTasks') || '{}');
    
    // Eğer bugünün verisi yoksa, yeni görevler oluştur
    if (!tasksData[today]) {
        tasksData[today] = {
            reading: false,
            gift: false,
            video: false
        };
        localStorage.setItem('dailyTasks', JSON.stringify(tasksData));
    }
    
    const todayTasks = tasksData[today];
    
    // Checkbox'ları güncelle
    document.getElementById('taskReading').checked = todayTasks.reading;
    document.getElementById('taskGift').checked = todayTasks.gift;
    document.getElementById('taskVideo').checked = todayTasks.video;
    
    // Görev item'larını güncelle
    updateTaskItems();
}

// Görev item'larını güncelle
function updateTaskItems() {
    const taskItems = document.querySelectorAll('.daily-task-item');
    
    taskItems.forEach(item => {
        const checkbox = item.querySelector('.daily-task-check');
        
        if (checkbox.checked) {
            item.classList.add('completed');
        } else {
            item.classList.remove('completed');
        }
    });
}

// Görev durumunu kaydet
function saveTaskStatus(taskType, isCompleted) {
    const today = new Date().toDateString();
    const tasksData = JSON.parse(localStorage.getItem('dailyTasks') || '{}');
    
    if (!tasksData[today]) {
        tasksData[today] = {
            reading: false,
            gift: false,
            video: false
        };
    }
    
    tasksData[today][taskType] = isCompleted;
    localStorage.setItem('dailyTasks', JSON.stringify(tasksData));
    
    // İlerleme göstergesini güncelle
    updateProgressIndicator();
}

// İlerleme göstergesini güncelle
function updateProgressIndicator() {
    const today = new Date().toDateString();
    const tasksData = JSON.parse(localStorage.getItem('dailyTasks') || '{}');
    const todayTasks = tasksData[today] || { reading: false, gift: false, video: false };
    
    const completedCount = Object.values(todayTasks).filter(Boolean).length;
    const totalCount = 3;
    const percentage = (completedCount / totalCount) * 100;
    
    // İstatistikleri güncelle
    document.getElementById('completedTasksCount').textContent = completedCount;
    document.getElementById('totalTasksCount').textContent = totalCount;
    
    // Progress bar'ı güncelle
    const progressFill = document.getElementById('tasksProgressFill');
    progressFill.style.width = percentage + '%';
}

// Günün videosunu yükle
function loadDailyVideo() {
    try {
        const videoContainer = document.getElementById('dailyTasksVideoThumbnail');
        const videoLink = document.getElementById('dailyTasksVideoLink');
        const videoTitle = document.getElementById('dailyTasksVideoTitle');
        
        // Eğer videos.js'den video bilgileri varsa kullan
        if (window.currentVideoData) {
            videoLink.href = window.currentVideoData.url;
            videoContainer.src = window.currentVideoData.thumbnail;
            videoTitle.textContent = window.currentVideoData.title;
        } else {
            // Eğer video verisi yoksa, videos.js'i başlat
            if (typeof initializeVideos === 'function') {
                initializeVideos();
                
                // Video yüklendikten sonra tekrar dene
                setTimeout(() => {
                    if (window.currentVideoData) {
                        videoLink.href = window.currentVideoData.url;
                        videoContainer.src = window.currentVideoData.thumbnail;
                        videoTitle.textContent = window.currentVideoData.title;
                    } else {
                        videoTitle.textContent = 'Video yükleniyor...';
                    }
                }, 2000);
            } else {
                videoTitle.textContent = 'Video yükleniyor...';
                videoLink.href = '#';
                videoContainer.src = '/images/default.png';
            }
        }
    } catch (error) {
        console.error('Günün videosu yüklenirken hata:', error);
        const videoTitle = document.getElementById('dailyTasksVideoTitle');
        videoTitle.textContent = 'Video yüklenemedi';
    }
}


// Görev tamamlandığında özel işlemler
function handleTaskCompletion(taskType) {
    switch (taskType) {
        case 'reading':
            // Günlük okuma tamamlandı - paneli kapat
            setTimeout(() => {
                closeDailyTasksModal();
            }, 1000);
            break;
            
        case 'gift':
            // Günün hediyesi alındı - hediye panelini aç
            setTimeout(() => {
                closeDailyTasksModal();
                openDailyGiftModal();
            }, 1000);
            break;
            
        case 'video':
            // Günün videosu izlendi - video modalını aç
            setTimeout(() => {
                closeDailyTasksModal();
                openVideoModal();
            }, 1000);
            break;
    }
}

// Video modalını aç
function openVideoModal() {
    const videoModal = document.getElementById('videoModal');
    const videoFrame = document.getElementById('videoFrame');
    
    if (videoModal && window.currentVideoData) {
        // Mevcut video verisini kullan
        const videoId = window.currentVideoData.videoId;
        if (videoId) {
            videoFrame.src = `https://www.youtube.com/embed/${videoId}`;
            videoModal.style.display = 'flex';
        } else {
            showNotification('Video bulunamadı!', 'error');
        }
    } else {
        showNotification('Video yükleniyor, lütfen bekleyin...', 'info');
    }
}

// Toast bildirim göster
function showNotification(message, type = 'info') {
    // Mevcut toast'ları temizle
    const existingToasts = document.querySelectorAll('.toast, .notification-toast, .share-toast');
    existingToasts.forEach(toast => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    });
    
    // Toast oluştur
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // 3 saniye sonra kaldır
    setTimeout(() => {
        toast.classList.add('toast-hide');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

