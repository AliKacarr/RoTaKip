/*
 * Alttan açılan panel (bottom sheet). Telefonda ekranın altına yapışır, geniş ekranda
 * ortalanmış pencere olur. Esc, arka plana dokunma, kapatma düğmesi ve aşağı sürükleme kapatır.
 *
 *   const sheet = window.RoTaKipBottomSheet.open({ title, subtitle, content, className, onClose });
 *   sheet.body   // içerik kapsayıcısı
 *   sheet.close()
 */
(function initializeBottomSheet() {
  if (window.RoTaKipBottomSheet) return;

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const openSheets = [];
  let sheetSequence = 0;

  function appendContent(target, content) {
    if (content == null) return;
    if (content instanceof Node) target.appendChild(content);
    else target.insertAdjacentHTML('beforeend', String(content));
  }

  function open(options = {}) {
    sheetSequence += 1;
    const titleId = `rkSheetTitle${sheetSequence}`;
    const previousFocus = document.activeElement;

    const backdrop = document.createElement('div');
    backdrop.className = 'rk-sheet-backdrop';

    const sheet = document.createElement('div');
    sheet.className = `rk-sheet ${options.className || ''}`.trim();
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    if (options.title) sheet.setAttribute('aria-labelledby', titleId);
    else if (options.ariaLabel) sheet.setAttribute('aria-label', options.ariaLabel);

    const handle = document.createElement('div');
    handle.className = 'rk-sheet-handle';
    handle.setAttribute('aria-hidden', 'true');

    const header = document.createElement('div');
    header.className = 'rk-sheet-header';
    const headings = document.createElement('div');
    headings.className = 'rk-sheet-headings';
    if (options.title) {
      const title = document.createElement('h2');
      title.className = 'rk-sheet-title';
      title.id = titleId;
      title.textContent = options.title;
      headings.appendChild(title);
    }
    if (options.subtitle) {
      const subtitle = document.createElement('p');
      subtitle.className = 'rk-sheet-subtitle';
      subtitle.textContent = options.subtitle;
      headings.appendChild(subtitle);
    }
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'rk-sheet-close';
    closeButton.setAttribute('aria-label', 'Kapat');
    closeButton.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
    header.append(headings, closeButton);

    const body = document.createElement('div');
    body.className = 'rk-sheet-body';
    appendContent(body, options.content);

    sheet.append(handle, header, body);
    backdrop.appendChild(sheet);
    document.body.appendChild(backdrop);
    document.body.classList.add('rk-sheet-open');

    let closed = false;
    const api = {
      element: sheet,
      body,
      close
    };

    function onKeyDown(event) {
      if (openSheets[openSheets.length - 1] !== api) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(sheet.querySelectorAll(FOCUSABLE)).filter(element => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function close() {
      if (closed) return;
      closed = true;
      const index = openSheets.indexOf(api);
      if (index >= 0) openSheets.splice(index, 1);
      document.removeEventListener('keydown', onKeyDown, true);
      if (resizeObserver) resizeObserver.disconnect();
      backdrop.classList.remove('is-open');
      if (!openSheets.length) document.body.classList.remove('rk-sheet-open');
      window.setTimeout(() => backdrop.remove(), 260);
      if (previousFocus && typeof previousFocus.focus === 'function' && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
      if (typeof options.onClose === 'function') options.onClose();
    }

    // İçerik açıldıktan sonra (istek listesi, çetele verisi…) dolup panelin boyu değişirse üst kenar
    // bir kerede sıçramasın: eski yükseklikten yenisine yumuşakça geçilir.
    let lastHeight = 0;
    let resizing = false;
    let resizeObserver = null;
    if (typeof ResizeObserver === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      resizeObserver = new ResizeObserver(() => {
        if (closed || resizing || sheet.classList.contains('is-dragging')) return;
        const next = sheet.offsetHeight;
        const previous = lastHeight;
        lastHeight = next;
        if (!previous || Math.abs(next - previous) < 2) return;
        resizing = true;
        sheet.style.transition = 'none';
        sheet.style.height = `${previous}px`;
        void sheet.offsetHeight;
        sheet.style.transition = 'height 0.28s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.25s ease, transform 0.25s ease';
        sheet.style.height = `${next}px`;
        const finish = () => {
          sheet.removeEventListener('transitionend', onEnd);
          window.clearTimeout(timer);
          sheet.style.transition = '';
          sheet.style.height = '';
          resizing = false;
          lastHeight = sheet.offsetHeight;
        };
        const onEnd = event => { if (event.target === sheet && event.propertyName === 'height') finish(); };
        const timer = window.setTimeout(finish, 400);
        sheet.addEventListener('transitionend', onEnd);
      });
      resizeObserver.observe(sheet);
    }

    closeButton.addEventListener('click', close);
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) close();
    });
    document.addEventListener('keydown', onKeyDown, true);

    // Tutamaçtan aşağı sürükleyerek kapatma (telefon).
    let dragStartY = null;
    let dragOffset = 0;
    handle.addEventListener('pointerdown', event => {
      dragStartY = event.clientY;
      dragOffset = 0;
      handle.setPointerCapture(event.pointerId);
      sheet.classList.add('is-dragging');
    });
    handle.addEventListener('pointermove', event => {
      if (dragStartY == null) return;
      dragOffset = Math.max(0, event.clientY - dragStartY);
      sheet.style.transform = `translateY(${dragOffset}px)`;
    });
    const endDrag = () => {
      if (dragStartY == null) return;
      dragStartY = null;
      sheet.classList.remove('is-dragging');
      sheet.style.transform = '';
      if (dragOffset > 90) close();
    };
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);

    function revealBody() {
      if (sheet.classList.contains('is-ready')) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        sheet.classList.add('is-ready');
        return;
      }
      let timer = 0;
      const ready = () => {
        sheet.removeEventListener('transitionend', onEnd);
        window.clearTimeout(timer);
        sheet.classList.add('is-ready');
      };
      const onEnd = event => { if (event.target === sheet && event.propertyName === 'transform') ready(); };
      sheet.addEventListener('transitionend', onEnd);
      timer = window.setTimeout(ready, 420);
    }

    openSheets.push(api);
    // Başlangıç stili hesaplanmadan sınıf eklenirse geçiş atlanır (panel bir kerede belirir). Önce düzeni
    // zorla hesaplatıp, içerik çizimi bitince (çift kare) açılışı başlatıyoruz.
    void sheet.offsetHeight;
    window.requestAnimationFrame(() => {
      if (closed) return;
      window.requestAnimationFrame(() => {
        if (closed) return;
        backdrop.classList.add('is-open');
        // Panel tam boyuyla yükselir; içerik (gövde) açılış bitince yumuşakça belirir.
        revealBody();
        const autofocus = sheet.querySelector('[data-autofocus]') || closeButton;
        autofocus.focus({ preventScroll: true });
      });
    });
    return api;
  }

  function closeAll() {
    openSheets.slice().forEach(sheet => sheet.close());
  }

  window.RoTaKipBottomSheet = Object.freeze({ open, closeAll });
})();
