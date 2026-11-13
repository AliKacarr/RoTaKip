/* exported initializeHomeMercyWindow */

let homeMercyImagesPromise = null;

function getHomeMercyImages() {
    if (!homeMercyImagesPromise) {
        homeMercyImagesPromise = fetch('/api/quote-images', { headers: { Accept: 'application/json' } })
            .then(async response => {
                const data = await response.json().catch(() => ({}));
                if (!response.ok || !Array.isArray(data.images)) {
                    throw new Error('Rahmet Penceresi görselleri alınamadı.');
                }
                return data.images.filter(Boolean);
            })
            .catch(error => {
                homeMercyImagesPromise = null;
                throw error;
            });
    }
    return homeMercyImagesPromise;
}

function pickHomeMercyImage(images, excludedNames = []) {
    const excluded = new Set(excludedNames.filter(Boolean));
    const candidates = images.filter(image => !excluded.has(image));
    const pool = candidates.length > 0 ? candidates : images;
    return pool[Math.floor(Math.random() * pool.length)] || null;
}

function setHomeMercyImage(card, imageName) {
    const image = card.querySelector('.home-mercy-image');
    if (!image || !imageName) return Promise.resolve();
    const nextSource = `/quotes/${encodeURIComponent(imageName)}`;
    return new Promise(resolve => {
        const preloadImage = new Image();
        preloadImage.onload = () => {
            image.dataset.imageName = imageName;
            image.src = nextSource;
            resolve();
        };
        preloadImage.onerror = resolve;
        preloadImage.src = nextSource;
    });
}

async function refreshHomeMercyImage(card, allCards) {
    const refreshButton = card.querySelector('.home-mercy-refresh');
    refreshButton?.classList.add('is-spinning');
    try {
        const images = await getHomeMercyImages();
        const excludedNames = allCards.map(item => item.querySelector('.home-mercy-image')?.dataset.imageName);
        await setHomeMercyImage(card, pickHomeMercyImage(images, excludedNames));
        if (typeof window.logUnauthorizedAccess === 'function') {
            window.logUnauthorizedAccess('Ana sayfa Rahmet Penceresi görseli yenileme');
        }
    } catch (error) {
        console.error('Rahmet Penceresi görseli yenilenemedi:', error);
    } finally {
        window.setTimeout(() => refreshButton?.classList.remove('is-spinning'), 650);
    }
}

async function shareHomeMercyImage(card) {
    const image = card.querySelector('.home-mercy-image');
    if (!image?.src) return;

    try {
        const response = await fetch(image.src);
        if (!response.ok) throw new Error('Görsel indirilemedi.');
        const blob = await response.blob();
        const file = new File([blob], 'rahmet-penceresi.webp', { type: blob.type || 'image/webp' });

        if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
            await navigator.share({ files: [file], title: 'RoTaKip · Rahmet Penceresi' });
            return;
        }

        if (navigator.share) {
            await navigator.share({ title: 'RoTaKip · Rahmet Penceresi', url: image.src });
            return;
        }

        const link = document.createElement('a');
        link.href = image.src;
        link.download = 'rahmet-penceresi.webp';
        document.body.appendChild(link);
        link.click();
        link.remove();
    } catch (error) {
        if (error?.name !== 'AbortError') console.error('Rahmet Penceresi görseli paylaşılamadı:', error);
    }
}

window.initializeHomeMercyWindow = async function initializeHomeMercyWindow() {
    const root = document.querySelector('.home-mercy-window');
    if (!root || root.dataset.initialized === 'true') return;
    root.dataset.initialized = 'true';

    const cards = Array.from(root.querySelectorAll('.quote-section-image'));
    cards.forEach(card => {
        card.querySelector('.home-mercy-refresh')?.addEventListener('click', () => refreshHomeMercyImage(card, cards));
        card.querySelector('.home-mercy-share')?.addEventListener('click', () => shareHomeMercyImage(card));
    });

    try {
        const images = await getHomeMercyImages();
        const firstImage = pickHomeMercyImage(images);
        const secondImage = pickHomeMercyImage(images, [firstImage]);
        await Promise.all([
            cards[0] ? setHomeMercyImage(cards[0], firstImage) : Promise.resolve(),
            cards[1] ? setHomeMercyImage(cards[1], secondImage) : Promise.resolve()
        ]);
    } catch (error) {
        console.error('Rahmet Penceresi görselleri yüklenemedi:', error);
    }
};
