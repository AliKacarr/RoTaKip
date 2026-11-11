/* exported initializeVideos */

const videosContainer = document.getElementById('videos');
const videoModal = document.getElementById('videoModal');
const videoFrame = document.getElementById('videoFrame');
const closeBtn = document.querySelector('.close');

let videoInitialized = false;
let isLoading = false;

// İlk video daily-gift.js tarafından kullanılıyor.
window.currentVideoData = null;

function initializeVideos() {
    if (videoInitialized) return;
    videoInitialized = true;
    showRandomVideos();
}

async function fetchVideos(type) {
    const response = await fetch(`/api/videos?type=${encodeURIComponent(type)}&limit=6`, {
        headers: { Accept: 'application/json' }
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.success || !Array.isArray(data.videos)) {
        throw new Error(data.message || 'Videolar alınamadı');
    }

    return data.videos;
}

function getVideoThumbnail(videoId) {
    return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}

function getVideoUrl(video) {
    return window.safeExternalUrl(video.link)
        || `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`;
}

function preloadVideoThumbnails(videos) {
    const imageLoads = videos.map(video => new Promise(resolve => {
        const image = new Image();
        image.onload = resolve;
        image.onerror = resolve;
        image.src = getVideoThumbnail(String(video.videoId || ''));
    }));

    const timeout = new Promise(resolve => setTimeout(resolve, 5000));
    return Promise.race([Promise.all(imageLoads), timeout]);
}

function lockVideosContainerHeight() {
    const currentHeight = videosContainer.getBoundingClientRect().height;

    if (currentHeight > 0) {
        videosContainer.style.setProperty('--videos-container-locked-height', `${currentHeight}px`);
        videosContainer.classList.add('is-updating');
    }
}

function unlockVideosContainerHeight() {
    videosContainer.classList.remove('is-updating');
    videosContainer.style.removeProperty('--videos-container-locked-height');
}

function waitForVideoThumbnails() {
    const thumbnails = Array.from(videosContainer.querySelectorAll('.thumbnail'));

    if (thumbnails.length === 0) return Promise.resolve();

    const thumbnailsReady = Promise.all(thumbnails.map(thumbnail => {
        if (thumbnail.complete) return Promise.resolve();

        return new Promise(resolve => {
            thumbnail.addEventListener('load', resolve, { once: true });
            thumbnail.addEventListener('error', resolve, { once: true });
        });
    }));

    const timeout = new Promise(resolve => setTimeout(resolve, 3000));
    return Promise.race([thumbnailsReady, timeout]);
}

async function renderVideos(videos) {
    // Mevcut kartları ekranda tut; yeni görseller hazır olduğunda içeriği tek seferde değiştir.
    await preloadVideoThumbnails(videos);

    const previousVisibility = Array.from(
        videosContainer.querySelectorAll('.video-card:not(.loading-card)'),
        card => card.classList.contains('visible')
    );
    const fragment = document.createDocumentFragment();

    videos.forEach((video, index) => {
        const videoId = String(video.videoId || '');
        const title = String(video.baslik || 'Başlıksız video');
        const thumbnail = getVideoThumbnail(videoId);
        const videoUrl = getVideoUrl(video);
        const viewCount = Number.isFinite(Number(video.izlenmeSayisi))
            ? Number(video.izlenmeSayisi)
            : 0;
        const formattedViewCount = new Intl.NumberFormat('tr-TR').format(viewCount);

        if (index === 0) {
            window.currentVideoData = {
                url: videoUrl,
                thumbnail,
                videoId
            };
        }

        const videoCard = document.createElement('div');
        videoCard.className = 'video-card scroll-fade-in';
        if (previousVisibility[index]) {
            videoCard.classList.add('visible');
        }
        videoCard.innerHTML = `
                <div class="video-thumbnail-wrapper">
                    <img src="${window.escapeHtml(thumbnail)}" alt="${window.escapeHtml(title)}" class="thumbnail">
                    <span class="play-icon"><i class="fa-solid fa-play"></i></span>
                </div>
                <div class="video-title">
                    <div class="title-text">${window.escapeHtml(title)}</div>
                    <div class="video-bottom-bar">
                        <svg class="video-share-icon" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
                        </svg>
                        <div class="view-count"><i class="fa-solid fa-eye"></i> ${formattedViewCount}</div>
                    </div>
                </div>
            `;

        videoCard.addEventListener('click', () => openVideoModal(videoId));

        const shareIcon = videoCard.querySelector('.video-share-icon');
        shareIcon?.addEventListener('click', event => {
            event.stopPropagation();
            shareVideo(title, videoUrl);
        });

        fragment.appendChild(videoCard);
    });

    lockVideosContainerHeight();
    videosContainer.replaceChildren(fragment);

    try {
        if (typeof window.observeScrollFadeIn === 'function') {
            videosContainer.querySelectorAll('.video-card').forEach(card => {
                window.observeScrollFadeIn(card);
            });
        }

        await waitForVideoThumbnails();
    } finally {
        unlockVideosContainerHeight();
    }
}

function shareVideo(title, videoUrl) {
    const shareText = `${title} - ${videoUrl}`;
    if (navigator.share) {
        navigator.share({ title, text: shareText })
            .catch(() => {});
        return;
    }

    navigator.clipboard.writeText(shareText)
        .then(() => alert('Paylaşım metni panoya kopyalandı!'))
        .catch(error => {
            console.error('Kopyalama hatası:', error);
            alert('Metin panoya kopyalanamadı.');
        });
}

async function showVideos(type, activeButtonId) {
    if (isLoading) return;
    isLoading = true;
    document.querySelectorAll('.top-bar button').forEach(button => button.classList.remove('active'));
    document.getElementById(activeButtonId).classList.add('active');

    try {
        const videos = await fetchVideos(type);
        if (videos.length === 0) throw new Error('Video bulunamadı');
        await renderVideos(videos);
    } catch (error) {
        console.error('Videolar yüklenirken hata:', error);
        window.currentVideoData = null;
        videosContainer.innerHTML = '<div class="error">Videolar yüklenirken bir hata oluştu. Lütfen daha sonra tekrar deneyin.</div>';
    } finally {
        isLoading = false;
    }
}

function showLatestVideos() {
    return showVideos('latest', 'latestBtn');
}

function showMostViewedVideos() {
    return showVideos('most-viewed', 'mostViewedBtn');
}

function showRandomVideos() {
    return showVideos('random', 'randomBtn');
}

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

document.getElementById('refreshBtn').addEventListener('click', () => {
    if (typeof logUnauthorizedAccess === 'function') {
        logUnauthorizedAccess('Video listesini yenileme');
    }

    const activeButton = document.querySelector('.top-bar button.active');
    if (activeButton?.id === 'latestBtn') {
        showLatestVideos();
    } else if (activeButton?.id === 'mostViewedBtn') {
        showMostViewedVideos();
    } else {
        showRandomVideos();
    }
});

function openVideoModal(videoId) {
    videoFrame.src = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`;
    videoModal.style.display = 'flex';
}

function closeModal() {
    videoModal.style.display = 'none';
    videoFrame.src = '';
}

closeBtn.addEventListener('click', closeModal);
window.addEventListener('click', event => {
    if (event.target === videoModal) closeModal();
});

const refreshBtn = document.getElementById('refreshBtn');
const refreshIcon = refreshBtn.querySelector('i');
let rotateDeg = 0;

setInterval(() => {
    refreshIcon.classList.add('pulse');
    setTimeout(() => refreshIcon.classList.remove('pulse'), 1000);
}, 15000);

refreshBtn.addEventListener('click', () => {
    rotateDeg += 180;
    refreshIcon.style.transition = 'transform 0.6s';
    refreshIcon.style.transform = `rotate(${rotateDeg}deg)`;
});
