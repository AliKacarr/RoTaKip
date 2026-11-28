// Günün görevleri (okuma / hediye / video) ve Günün Hediyesi (Esmaül Hüsna) paneli.
// Görev durumu bu cihazda, gün bazında localStorage 'dailyTasks' altında tutulur.
let dailyGiftData = null;
let lastGiftDate = null;
const DAILY_TASKS_KEY = 'dailyTasks';

function readDailyTasksStore() {
    try {
        const parsed = JSON.parse(localStorage.getItem(DAILY_TASKS_KEY) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_error) {
        return {};
    }
}

window.RoTaKipDailyTasks = Object.freeze({
    get() {
        const today = new Date().toDateString();
        const stored = readDailyTasksStore()[today] || {};
        return { reading: stored.reading === true, gift: stored.gift === true, video: stored.video === true };
    },
    set(taskType, isCompleted) {
        if (!['reading', 'gift', 'video'].includes(taskType)) return;
        const today = new Date().toDateString();
        const tasksData = readDailyTasksStore();
        // Yalnızca bugünün kaydı tutulur; eski günler birikmez.
        const todayTasks = { reading: false, gift: false, video: false, ...(tasksData[today] || {}) };
        if (todayTasks[taskType] === isCompleted) return;
        todayTasks[taskType] = isCompleted === true;
        try {
            localStorage.setItem(DAILY_TASKS_KEY, JSON.stringify({ [today]: todayTasks }));
        } catch (_error) {
            // Depolama kapalıysa görev yalnızca bu oturumda tamamlanmış sayılmaz; sorun değil.
        }
        window.dispatchEvent(new CustomEvent('rotakip:daily-tasks-changed', { detail: { taskType, isCompleted } }));
    }
});

// Shell her okumalar açılışında çağırır; eski sürümle uyumluluk için korunur.
window.initializeDailyGift = function initializeDailyGift() {};

async function loadDailyGift() {
    const today = new Date().toDateString();
    if (lastGiftDate === today && dailyGiftData) return dailyGiftData;
    const response = await fetch('/esmaulhusna.json');
    if (!response.ok) throw new Error('Esmaül Hüsna listesi yüklenemedi');
    const list = await response.json();
    dailyGiftData = list[Math.floor(Math.random() * list.length)];
    lastGiftDate = today;
    return dailyGiftData;
}

function getYouTubeThumbnail(videoUrl) {
    try {
        const url = new URL(videoUrl);
        let videoId = null;
        if (url.hostname === 'youtube.com' || url.hostname.endsWith('.youtube.com')) {
            videoId = url.searchParams.get('v');
        } else if (url.hostname === 'youtu.be' || url.hostname.endsWith('.youtu.be')) {
            videoId = url.pathname.split('/').filter(Boolean)[0];
        }
        return videoId ? `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg` : null;
    } catch (_error) {
        return null;
    }
}

function isSafeExternalUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:';
    } catch (_error) {
        return false;
    }
}

window.openDailyGift = async function openDailyGift() {
    let esma;
    try {
        esma = await loadDailyGift();
    } catch (error) {
        console.error('Günün hediyesi yüklenemedi:', error);
        showNotification('Günün hediyesi yüklenemedi. Lütfen tekrar deneyin.', 'error');
        return;
    }
    window.RoTaKipDailyTasks.set('gift', true);
    if (!window.RoTaKipBottomSheet) return;

    const content = document.createElement('div');
    content.className = 'daily-gift-sheet';
    const description = document.createElement('p');
    description.className = 'daily-gift-description';
    description.textContent = esma.esmaulhusna_description || '';
    content.appendChild(description);

    const videoUrl = esma.esmaulhusna_video_url;
    const thumbnail = videoUrl && isSafeExternalUrl(videoUrl) ? getYouTubeThumbnail(videoUrl) : null;
    if (thumbnail) {
        const link = document.createElement('a');
        link.className = 'daily-gift-video-link';
        link.href = videoUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.setAttribute('aria-label', `${esma.esmaulhusna_name} videosunu izle`);
        const image = document.createElement('img');
        image.className = 'daily-gift-video-thumbnail';
        image.src = thumbnail;
        image.alt = '';
        image.loading = 'lazy';
        const play = document.createElement('span');
        play.className = 'daily-gift-play-icon';
        play.innerHTML = '<i class="fa-solid fa-play" aria-hidden="true"></i>';
        link.append(image, play);
        content.appendChild(link);
    }

    const quote = document.createElement('p');
    quote.className = 'daily-gift-quote';
    quote.textContent = 'En güzel isimler Allah\'ındır; bu güzel isimlerle O\'na dua edin. (A\'râf Sûresi, 180)';
    content.appendChild(quote);

    window.RoTaKipBottomSheet.open({
        title: esma.esmaulhusna_name || 'Esmaül Hüsna',
        subtitle: 'Günün hediyesi',
        className: 'daily-gift-panel',
        content
    });
};

// Toast bildirim göster (tablo ve yönetim modülleri de kullanır).
function showNotification(message, type = 'success') {
    document.querySelectorAll('.toast, .notification-toast, .share-toast').forEach(toast => toast.remove());
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast-hide');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
