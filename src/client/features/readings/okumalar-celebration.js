/*
 * Kutlama penceresi: lig atlama, seri eşikleri ve günlük okuma kaydı.
 * window.showOkumalarCelebration({ kind, icon|image, title, message, autoClose })
 */
(function initializeOkumalarCelebration() {
  const CONFETTI_COLORS = ['#4e54c8', '#ffb400', '#2fb36d', '#ff6b6b', '#38b6ff'];
  let activeCelebration = null;

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function confettiMarkup(count) {
    if (prefersReducedMotion()) return '';
    let pieces = '';
    for (let index = 0; index < count; index++) {
      const left = Math.round(Math.random() * 100);
      const delay = (Math.random() * 0.5).toFixed(2);
      const duration = (1.6 + Math.random() * 1.2).toFixed(2);
      const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
      const rotate = Math.round(Math.random() * 360);
      pieces += `<span class="ok-confetti-piece" style="left:${left}%;background:${color};animation-delay:${delay}s;animation-duration:${duration}s;transform:rotate(${rotate}deg)"></span>`;
    }
    return `<div class="ok-confetti" aria-hidden="true">${pieces}</div>`;
  }

  function close() {
    if (!activeCelebration) return;
    const { element, timer, onKeyDown, previousFocus } = activeCelebration;
    activeCelebration = null;
    window.clearTimeout(timer);
    document.removeEventListener('keydown', onKeyDown, true);
    element.classList.remove('is-open');
    window.setTimeout(() => element.remove(), 220);
    if (previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
  }

  window.showOkumalarCelebration = function showOkumalarCelebration(options = {}) {
    close();
    const isToast = options.autoClose > 0;
    const overlay = document.createElement('div');
    overlay.className = `ok-celebration${isToast ? ' is-toast' : ''} is-${options.kind || 'daily'}`;
    overlay.setAttribute('role', isToast ? 'status' : 'dialog');
    if (!isToast) overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', options.title || 'Tebrikler');

    const visual = options.image
      ? `<img class="ok-celebration-image" src="${options.image}" alt="" width="96" height="96">`
      : `<span class="ok-celebration-icon" aria-hidden="true">${options.icon || '🎉'}</span>`;
    const title = document.createElement('div');
    title.textContent = options.title || '';
    const message = document.createElement('div');
    message.textContent = options.message || '';

    overlay.innerHTML = `
      ${confettiMarkup(isToast ? 18 : 42)}
      <div class="ok-celebration-card">
        <div class="ok-celebration-visual">${visual}</div>
        <h2 class="ok-celebration-title">${title.innerHTML}</h2>
        ${options.message ? `<p class="ok-celebration-message">${message.innerHTML}</p>` : ''}
        ${isToast ? '' : '<button type="button" class="ok-btn ok-btn-primary ok-btn-block" data-action="close">Tamam</button>'}
      </div>`;
    document.body.appendChild(overlay);

    const onKeyDown = event => {
      if (event.key === 'Escape') close();
    };
    const previousFocus = document.activeElement;
    activeCelebration = {
      element: overlay,
      onKeyDown,
      previousFocus: isToast ? null : previousFocus,
      timer: isToast ? window.setTimeout(close, options.autoClose) : null
    };
    document.addEventListener('keydown', onKeyDown, true);
    overlay.addEventListener('click', event => {
      if (isToast || event.target === overlay || event.target.closest('[data-action="close"]')) close();
    });
    window.requestAnimationFrame(() => {
      overlay.classList.add('is-open');
      if (!isToast) overlay.querySelector('[data-action="close"]')?.focus({ preventScroll: true });
    });
  };

  window.closeOkumalarCelebration = close;
})();
