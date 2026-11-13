let bound = false;

export function initializeScrollManager() {
  if (bound) return;
  bound = true;
  const button = document.getElementById('scrollToTopBtn');
  if (!button) return;
  let frame = null;
  const update = () => {
    frame = null;
    button.classList.toggle('show', window.scrollY > 700);
    button.classList.toggle('hidden', window.scrollY <= 700);
  };
  window.addEventListener('scroll', () => {
    if (frame !== null) return;
    frame = requestAnimationFrame(update);
  }, { passive: true });
  button.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  update();
}

export function resetRouteScroll() {
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
}
