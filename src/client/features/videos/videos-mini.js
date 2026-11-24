// Mini oynatıcının ekranda sürüklenmesi. Konum oturum boyunca bellekte tutulur; mini oynatıcı
// kapanıp yeniden açılınca kullanıcının bıraktığı yerde görünür.
(function () {
    'use strict';

    const ns = window.RoTaKipVideos;
    const DRAG_THRESHOLD_PX = 6;
    const EDGE_MARGIN_PX = 8;

    let page = null;
    let stage = null;
    let handle = null;
    let drag = null;
    let moved = false;
    let position = null; // { left, top } px

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), Math.max(min, max));
    }

    function clampPosition(left, top, rect) {
        return {
            left: clamp(left, EDGE_MARGIN_PX, window.innerWidth - rect.width - EDGE_MARGIN_PX),
            top: clamp(top, EDGE_MARGIN_PX, window.innerHeight - rect.height - EDGE_MARGIN_PX)
        };
    }

    function applyPosition() {
        if (!stage || !position) return;
        position = clampPosition(position.left, position.top, { width: stage.offsetWidth, height: stage.offsetHeight });
        stage.style.left = `${position.left}px`;
        stage.style.top = `${position.top}px`;
        stage.style.right = 'auto';
        stage.style.bottom = 'auto';
        stage.classList.add('is-moved');
    }

    function clearInline() {
        if (!stage) return;
        ['left', 'top', 'right', 'bottom'].forEach(property => stage.style.removeProperty(property));
        stage.classList.remove('is-moved', 'is-dragging');
    }

    // Mini oynatıcı açılınca kayıtlı konum uygulanır; kapanınca satır içi konum temizlenir.
    function sync(active) {
        if (!stage) return;
        if (active) applyPosition();
        else clearInline();
    }

    // ---------- Küçülme animasyonu (FLIP) ----------
    // İzleme sayfasından akışa dönerken oynatıcı olduğu yerden mini konumuna (sağ alt) küçülerek kayar.
    // iframe taşınmaz ve yeniden yüklenmez: sahne CSS'te anında mini boyuta geçer, sonra eski konum ve
    // boyuta denk gelen ters dönüşümden (translate + scale) dönüşümsüz hale animasyonla getirilir.
    //
    // Sekme içi geri tuşu kabuktan geçer: kabuk görünümü önce `visible` sınıfı olmadan (translateY(16px),
    // is-preparing-return) hazırlar, sonra giriş animasyonuyla (0,4 sn, yine transform'lu) açar. Dönüşümlü
    // bir atanın içinde `position: fixed` ekrana değil o ataya (tüm sayfa kadar uzun görünüme) göre
    // konumlandığından sahne bu sürede ekranın çok altında ölçülür. Bu yüzden görünüm tamamen oturana
    // kadar (visible, gizli hazırlık yok, giriş animasyonu bitti) ölçüm yapılmaz; o sırada sahne eski,
    // büyük konumunda satır içi koordinatlarla tutulur.
    const SHRINK_MS = 460;
    const SHRINK_EASING = 'cubic-bezier(0.33, 0, 0.2, 1)';
    const SHRINK_VIEW_WAIT_MS = 1400;
    const HOLD_PROPERTIES = ['left', 'top', 'right', 'bottom', 'width'];

    function viewSettled() {
        const view = stage.closest('.tab-view');
        return !view
            || (view.classList.contains('visible')
                && !view.classList.contains('is-preparing-return')
                && view.getAnimations().length === 0);
    }

    function radiusOf(element) {
        return parseFloat(window.getComputedStyle(element).borderTopLeftRadius) || 0;
    }

    // Mini oynatıcıya geçmeden hemen önce çağrılır: sahnenin bulunduğu konum ve köşe yuvarlaklığı alınır.
    function capture() {
        if (!stage || ns.prefersReducedMotion() || typeof stage.animate !== 'function') return null;
        const rect = stage.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        return { rect, radius: radiusOf(stage) };
    }

    function playShrink(first) {
        const last = stage.getBoundingClientRect();
        if (!last.width || !last.height) return;
        const scaleX = first.rect.width / last.width;
        const scaleY = first.rect.height / last.height;
        const dx = first.rect.left - last.left;
        const dy = first.rect.top - last.top;
        // Ölçek köşe yuvarlaklığını da büyüteceğinden başlangıç değeri ölçeğe bölünür.
        const startRadius = `${first.radius / scaleX}px / ${first.radius / scaleY}px`;
        stage.getAnimations().forEach(animation => animation.cancel());
        stage.animate([
            {
                transformOrigin: 'top left',
                transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`,
                borderRadius: startRadius,
                boxShadow: '0 0 0 0 rgba(0, 0, 0, 0)'
            },
            {
                transformOrigin: 'top left',
                transform: 'none',
                borderRadius: `${radiusOf(stage)}px`,
                boxShadow: '0 14px 36px 0 rgba(0, 0, 0, 0.35)'
            }
        ], { duration: SHRINK_MS, easing: SHRINK_EASING });
    }

    // Mini sınıfı uygulandıktan (ve kayıtlı konum yerleştirildikten) sonra çağrılır.
    function shrinkFrom(first) {
        if (!first || !stage) return;
        if (viewSettled()) {
            playShrink(first);
            return;
        }
        // Görünüm henüz oturmadı: sahne eski konumunda tutulur (atanın dönüşümü koordinatlardan düşülür).
        const saved = HOLD_PROPERTIES.map(property => [property, stage.style.getPropertyValue(property)]);
        const hold = () => {
            stage.style.width = `${first.rect.width}px`;
            stage.style.right = 'auto';
            stage.style.bottom = 'auto';
            stage.style.left = `${first.rect.left}px`;
            stage.style.top = `${first.rect.top}px`;
            const placed = stage.getBoundingClientRect();
            stage.style.left = `${first.rect.left - (placed.left - first.rect.left)}px`;
            stage.style.top = `${first.rect.top - (placed.top - first.rect.top)}px`;
        };
        const release = () => saved.forEach(([property, value]) => {
            if (value) stage.style.setProperty(property, value);
            else stage.style.removeProperty(property);
        });
        const deadline = performance.now() + SHRINK_VIEW_WAIT_MS;
        const wait = () => {
            if (!stage.isConnected || !page?.classList.contains('has-mini-player')) {
                release();
                return;
            }
            if (viewSettled() || performance.now() > deadline) {
                release();
                playShrink(first);
                return;
            }
            hold();
            window.requestAnimationFrame(wait);
        };
        hold();
        window.requestAnimationFrame(wait);
    }

    function onPointerDown(event) {
        if (!page?.classList.contains('has-mini-player') || (event.button !== undefined && event.button > 0)) return;
        const rect = stage.getBoundingClientRect();
        drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, rect };
        moved = false;
    }

    function onPointerMove(event) {
        if (!drag || event.pointerId !== drag.id) return;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        // Yakalama yalnız sürükleme başlayınca yapılır; düz dokunuş düğmelere normal ulaşır.
        if (!moved) handle.setPointerCapture?.(event.pointerId);
        moved = true;
        stage.classList.add('is-dragging');
        position = clampPosition(drag.rect.left + dx, drag.rect.top + dy, drag.rect);
        applyPosition();
    }

    function onPointerEnd(event) {
        if (!drag || event.pointerId !== drag.id) return;
        if (handle.hasPointerCapture?.(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        drag = null;
        stage.classList.remove('is-dragging');
    }

    // Sürükleme sonunda tarayıcının ürettiği tıklama mini oynatıcıyı genişletmesin.
    function onClickCapture(event) {
        if (!moved) return;
        moved = false;
        event.preventDefault();
        event.stopPropagation();
    }

    function onResize() {
        if (position && page?.classList.contains('has-mini-player')) applyPosition();
    }

    function init(root) {
        page = root;
        stage = root.querySelector('.videos-watch-stage');
        handle = root.querySelector('.videos-mini-controls');
        if (!stage || !handle) return;
        handle.addEventListener('pointerdown', onPointerDown);
        handle.addEventListener('pointermove', onPointerMove);
        handle.addEventListener('pointerup', onPointerEnd);
        handle.addEventListener('pointercancel', onPointerEnd);
        stage.addEventListener('click', onClickCapture, true);
        window.addEventListener('resize', onResize);
    }

    ns.mini = { init, sync, capture, shrinkFrom };
})();
