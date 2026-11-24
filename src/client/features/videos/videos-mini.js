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

    ns.mini = { init, sync };
})();
