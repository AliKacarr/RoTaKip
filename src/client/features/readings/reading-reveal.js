(function initializeReadingRevealManager() {
  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reducedMotion = motionQuery?.matches === true;
  const MAX_REVEAL_VISIBLE_PIXELS = 120;
  const intersectingTargets = new Set();
  let revealObserver = null;
  let revealCheckFrame = null;

  function reveal(target) {
    if (!target?.isConnected) return;
    target.classList.add('is-revealed');
  }

  function resetReveal(target) {
    target.classList.remove('is-revealed');
  }

  function getViewportVisibility(target) {
    const rect = target.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
    const requiredHeight = Math.min(Math.max(rect.height, 1) * 0.1, MAX_REVEAL_VISIBLE_PIXELS);
    return { visibleHeight, requiredHeight };
  }

  function hasRevealAmount(target) {
    const { visibleHeight, requiredHeight } = getViewportVisibility(target);
    return visibleHeight >= requiredHeight;
  }

  function revealIfReady(target) {
    if (!target?.isConnected) {
      intersectingTargets.delete(target);
      return;
    }
    if (hasRevealAmount(target) && !target.classList.contains('is-revealed')) reveal(target);
  }

  function scheduleRevealCheck() {
    if (revealCheckFrame !== null) return;
    revealCheckFrame = window.requestAnimationFrame(() => {
      revealCheckFrame = null;
      intersectingTargets.forEach(revealIfReady);
    });
  }

  window.addEventListener('scroll', scheduleRevealCheck, { passive: true });
  window.addEventListener('resize', scheduleRevealCheck, { passive: true });

  function getRevealObserver() {
    if (revealObserver || !('IntersectionObserver' in window)) return revealObserver;
    revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) {
          intersectingTargets.delete(entry.target);
          resetReveal(entry.target);
        } else {
          intersectingTargets.add(entry.target);
          revealIfReady(entry.target);
        }
      });
    }, {
      threshold: 0,
      rootMargin: '0px'
    });
    return revealObserver;
  }

  window.observeReadingScrollReveal = function observeReadingScrollReveal(target, options = {}) {
    if (!target) return;
    const restart = options.restart === true;
    const alreadyPrepared = target.dataset.readingRevealPrepared === 'true';
    target.classList.remove('reading-content-reveal');
    target.classList.add('reading-scroll-reveal');
    if (alreadyPrepared && !restart) return;

    target.dataset.readingRevealPrepared = 'true';
    const visibility = getViewportVisibility(target);
    if (restart && target.classList.contains('is-revealed')
      && visibility.visibleHeight > 0 && visibility.visibleHeight < visibility.requiredHeight) {
      return;
    }
    resetReveal(target);
    if (reducedMotion) {
      reveal(target);
      return;
    }

    // Yenilemede aynı sınıfı tekrar çalıştırabilmek için görünmez başlangıç
    // karesini tarayıcıya uygulat.
    target.getBoundingClientRect();
    const observer = getRevealObserver();
    if (observer) observer.observe(target);
    if (hasRevealAmount(target)) {
      window.requestAnimationFrame(() => reveal(target));
      return;
    }

    if (!observer) reveal(target);
  };

  window.replayReadingContentReveal = function replayReadingContentReveal(target) {
    window.observeReadingScrollReveal(target, { restart: true });
  };
}());
