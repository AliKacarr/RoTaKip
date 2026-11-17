/* exported initializeHomeTefekkurWindow */

let homeTefekkurImagesPromise = null;

function getHomeTefekkurImages() {
    if (!homeTefekkurImagesPromise) {
        homeTefekkurImagesPromise = fetch('/api/quote-images', { headers: { Accept: 'application/json' } })
            .then(async response => {
                const data = await response.json().catch(() => ({}));
                if (!response.ok || !Array.isArray(data.images)) {
                    throw new Error('Tefekkür görselleri alınamadı.');
                }
                return data.images.filter(Boolean);
            })
            .catch(error => {
                homeTefekkurImagesPromise = null;
                throw error;
            });
    }
    return homeTefekkurImagesPromise;
}

function pickHomeTefekkurImage(images, excludedNames = []) {
    const excluded = new Set(excludedNames.filter(Boolean));
    const candidates = images.filter(image => !excluded.has(image));
    const pool = candidates.length > 0 ? candidates : images;
    return pool[Math.floor(Math.random() * pool.length)] || null;
}

function setHomeTefekkurImage(card, imageName) {
    const image = card.querySelector('.home-tefekkur-image');
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

async function refreshHomeTefekkurImage(card, allCards) {
    const refreshButton = card.querySelector('.home-tefekkur-refresh');
    refreshButton?.classList.add('is-spinning');
    try {
        const images = await getHomeTefekkurImages();
        const excludedNames = allCards.map(item => item.querySelector('.home-tefekkur-image')?.dataset.imageName);
        await setHomeTefekkurImage(card, pickHomeTefekkurImage(images, excludedNames));
        if (typeof window.logUnauthorizedAccess === 'function') {
            window.logUnauthorizedAccess('Tefekkür görseli yenileme');
        }
    } catch (error) {
        console.error('Tefekkür görseli yenilenemedi:', error);
    } finally {
        window.setTimeout(() => refreshButton?.classList.remove('is-spinning'), 650);
    }
}

async function shareHomeTefekkurImage(card) {
    const image = card.querySelector('.home-tefekkur-image');
    if (!image?.src) return;

    try {
        const response = await fetch(image.src);
        if (!response.ok) throw new Error('Görsel indirilemedi.');
        const blob = await response.blob();
        const file = new File([blob], 'tefekkur.webp', { type: blob.type || 'image/webp' });

        if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
            await navigator.share({ files: [file], title: 'RoTaKip · Tefekkür' });
            return;
        }

        if (navigator.share) {
            await navigator.share({ title: 'RoTaKip · Tefekkür', url: image.src });
            return;
        }

        const link = document.createElement('a');
        link.href = image.src;
        link.download = 'tefekkur.webp';
        document.body.appendChild(link);
        link.click();
        link.remove();
    } catch (error) {
        if (error?.name !== 'AbortError') console.error('Tefekkür görseli paylaşılamadı:', error);
    }
}

window.initializeHomeTefekkurWindow = async function initializeHomeTefekkurWindow() {
    const root = document.querySelector('.home-tefekkur-window');
    if (!root || root.dataset.initialized === 'true') return;
    root.dataset.initialized = 'true';

    const cards = Array.from(root.querySelectorAll('.quote-section-image'));
    cards.forEach(card => {
        card.querySelector('.home-tefekkur-refresh')?.addEventListener('click', () => refreshHomeTefekkurImage(card, cards));
        card.querySelector('.home-tefekkur-share')?.addEventListener('click', () => shareHomeTefekkurImage(card));
    });

    try {
        const images = await getHomeTefekkurImages();
        const firstImage = pickHomeTefekkurImage(images);
        const secondImage = pickHomeTefekkurImage(images, [firstImage]);
        await Promise.all([
            cards[0] ? setHomeTefekkurImage(cards[0], firstImage) : Promise.resolve(),
            cards[1] ? setHomeTefekkurImage(cards[1], secondImage) : Promise.resolve()
        ]);
    } catch (error) {
        console.error('Tefekkür görselleri yüklenemedi:', error);
    }
};
