(() => {
  const nav = document.querySelector('.policy-nav');
  if (!nav) return;

  const pageCache = new Map();
  let activeRequest = 0;

  const loadPage = async href => {
    if (!pageCache.has(href)) {
      pageCache.set(href, fetch(href, { credentials: 'same-origin' })
        .then(response => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.text();
        })
        .then(html => new DOMParser().parseFromString(html, 'text/html'))
        .catch(error => {
          pageCache.delete(href);
          throw error;
        }));
    }
    return pageCache.get(href);
  };

  const setActiveLink = link => {
    nav.querySelectorAll('a').forEach(item => {
      if (item === link) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
  };

  const showPage = async link => {
    const requestId = ++activeRequest;
    const href = link.getAttribute('href');

    try {
      const nextDocument = await loadPage(href);
      if (requestId !== activeRequest) return;

      const nextCard = nextDocument.querySelector('.policy-card');
      const currentCard = document.querySelector('.policy-card');
      if (!nextCard || !currentCard) throw new Error('İçerik bulunamadı');

      currentCard.replaceWith(document.importNode(nextCard, true));
      document.title = nextDocument.title;
      setActiveLink(link);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      console.warn('Sayfa içeriği yüklenemedi, normal gezinmeye geçiliyor:', error);
      window.location.href = href;
    }
  };

  nav.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link || !nav.contains(link)) return;
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    event.preventDefault();
    if (link.getAttribute('aria-current') === 'page') return;
    showPage(link);
  });
})();
