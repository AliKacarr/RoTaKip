(function () {
    const ns = window.RoTaKipTefekkur = window.RoTaKipTefekkur || {};

    // İlahi kuyruğu ve kişiselleştirme kuralları (DOM'a dokunmaz; birim testlerle doğrulanır).
    //   - Yalnız 👎 ile işaretlenen ilahi karışıma girmez (`disliked`).
    //   - Kısa sürede geçilen ilahi listede kalır ama en alta itilir (`short` ≥ SKIP_LIMIT).
    //   - Son çalınanlar (RECENT_LIMIT kadar) alta, kısa geçilenlerin hemen üstüne itilir.
    //   - Beğenilenlerden her LIKED_EVERY sıranın en çok biri kadarı üst sıralara serpiştirilir;
    //     geri kalan hep keşif içindir.
    const SKIP_SECONDS = 15;
    const LISTENED_SECONDS = 60;
    const SKIP_LIMIT = 1;
    const LIKED_EVERY = 4;
    const RECENT_LIMIT = 20;

    function emptyStats() {
        return { liked: false, disliked: false, short: 0, last: 0 };
    }

    function statsOf(items, videoId) {
        return items && Object.hasOwn(items, videoId) ? { ...emptyStats(), ...items[videoId] } : emptyStats();
    }

    function isHidden(items, videoId) {
        return statsOf(items, videoId).disliked === true;
    }

    function isLiked(items, videoId) {
        return statsOf(items, videoId).liked === true && !isHidden(items, videoId);
    }

    // Beğenilen ilahi kısa geçilmiş olsa da alta itilmez.
    function isSkipped(items, videoId) {
        return statsOf(items, videoId).short >= SKIP_LIMIT && !isLiked(items, videoId);
    }

    function shuffle(list, random = Math.random) {
        const result = list.slice();
        for (let index = result.length - 1; index > 0; index -= 1) {
            const swap = Math.floor(random() * (index + 1));
            [result[index], result[swap]] = [result[swap], result[index]];
        }
        return result;
    }

    // İlahi listesinden yeni bir çalma sırası kurar: önce keşif (beğenilenler serpiştirilmiş), sonra son
    // çalınanlar, en altta kısa geçilenler. Her bölüm kendi içinde karışıktır.
    function buildQueue(ilahiler, items, random = Math.random) {
        const visible = ilahiler.filter(ilahi => !isHidden(items, ilahi.videoId));
        const skipped = shuffle(visible.filter(ilahi => isSkipped(items, ilahi.videoId)), random);
        const candidates = visible.filter(ilahi => !isSkipped(items, ilahi.videoId));
        const recentIds = new Set(
            candidates
                .map(ilahi => ({ id: ilahi.videoId, last: statsOf(items, ilahi.videoId).last }))
                .filter(entry => entry.last > 0)
                .sort((a, b) => b.last - a.last)
                .slice(0, RECENT_LIMIT)
                .map(entry => entry.id)
        );
        const fresh = shuffle(candidates.filter(ilahi => !recentIds.has(ilahi.videoId)), random);
        const recent = shuffle(candidates.filter(ilahi => recentIds.has(ilahi.videoId)), random);

        const liked = fresh.filter(ilahi => isLiked(items, ilahi.videoId));
        const others = fresh.filter(ilahi => !isLiked(items, ilahi.videoId));
        const queue = [];
        // Beğenilenler her LIKED_EVERY sıranın birinde gelir; hangi sırada geleceği her karışımda değişir.
        const offset = Math.floor(random() * LIKED_EVERY);
        let position = 0;
        while (liked.length > 0 || others.length > 0) {
            const useLiked = liked.length > 0 && (position % LIKED_EVERY === offset || others.length === 0);
            queue.push(useLiked ? liked.shift() : others.shift());
            position += 1;
        }
        return queue.concat(recent, skipped);
    }

    // Çalma süresine göre kayıt güncellemesi: kısa atlama sayacı artar, uzun dinleme ya da bitiş sıfırlar.
    function afterPlayback(stats, listenedSeconds, completed) {
        const next = { ...emptyStats(), ...stats };
        if (completed || listenedSeconds >= LISTENED_SECONDS) next.short = 0;
        else if (listenedSeconds < SKIP_SECONDS) next.short += 1;
        return next;
    }

    ns.ilahiQueue = Object.freeze({
        SKIP_LIMIT,
        SKIP_SECONDS,
        LISTENED_SECONDS,
        LIKED_EVERY,
        afterPlayback,
        buildQueue,
        emptyStats,
        isHidden,
        isLiked,
        isSkipped,
        shuffle,
        statsOf
    });
})();
