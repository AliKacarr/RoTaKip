let bound = false;
let routeEnabled = false;
let button = null;

function updateButtonVisibility() {
  if (!button) return;
  const shouldShow = routeEnabled && window.scrollY > 700;
  button.hidden = !routeEnabled;
  button.classList.toggle('show', shouldShow);
  button.classList.toggle('hidden', !shouldShow);
}

export function initializeScrollManager() {
  if (bound) return;
  bound = true;
  button = document.getElementById('scrollToTopBtn');
  if (!button) return;
  let frame = null;
  const update = () => {
    frame = null;
    updateButtonVisibility();
  };
  window.addEventListener('scroll', () => {
    if (frame !== null) return;
    frame = requestAnimationFrame(update);
  }, { passive: true });
  button.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  update();
}

export function setScrollToTopEnabled(isEnabled) {
  routeEnabled = Boolean(isEnabled);
  updateButtonVisibility();
}

export function resetRouteScroll() {
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
}
