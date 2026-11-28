/*
 * Okumalar › Grup bölümünün başındaki Sıralama (okuma alanına göre).
 * "Bugün" (bugün kim ne kadar okudu, okumayanlar altta), "Bu ay" (her ay sıfırlanır: okunan gün, eşitlikte miktar),
 * "Geçmiş aylar" (ay seçilir, aynı ölçüt), ve "Toplam" (lig: toplam okuma günü) anahtarları. İlk üçte madalya, giriş yapan üyenin satırı vurgulanır.
 * Satıra dokununca üyenin özeti alttan açılır; yönetici oradan üyenin gününü doldurabilir.
 * Eski giriş noktası window.loadUserCards korunur.
 */
(function initializeOkumalarRanking() {
  const metrics = () => window.RoTaKipReadingMetrics;
  const MODES = [
    ['today', 'Bugün'],
    ['month', 'Bu ay'],
    ['past', 'Geçmiş aylar'],
    ['total', 'Toplam']
  ];
  const MODE_KEYS = MODES.map(([key]) => key);
  const LEGACY_MODES = { league: 'total', promotion: 'total', total: 'total', month: 'month', percentage: 'total', name: 'total' };
  const MEDALS = { 1: 'birincilik.webp', 2: 'ikincilik.webp', 3: 'üçüncülük.webp' };
  let frame = null;
  let dirty = true;
  let bound = false;
  // Kullanıcı ölçüt/ay değiştirdiğinde bir sonraki çizim animasyonla gelir (veri tazelemelerinde animasyon yok).
  let animateNext = false;

  function esc(value) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(String(value ?? ''))
      : String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
  }

  function avatarSrc(user) {
    return typeof window.safeImageSrc === 'function'
      ? window.safeImageSrc(user && user.profileImage, '/images/default.png')
      : '/images/default.png';
  }

  function amountUnit() {
    return typeof window.getCurrentAmountType === 'function' ? window.getCurrentAmountType() : 'sayfa';
  }

  function currentUser() {
    return typeof LocalStorageManager !== 'undefined' ? LocalStorageManager.getCurrentUserInfo() : null;
  }

  // Giriş yapmamış ziyaretçi yalnız "Bu ayın sıralaması" kartını görür (en çok okuyandan başlayarak).
  function isGuest() {
    return !currentUser();
  }

  const GUEST_LIMIT = 10;

  function guestAmount(value) {
    const amount = Math.round(Number(value) || 0);
    return amountUnit() === 'dakika' ? `${amount} dk` : `${amount} ${amountUnit()}`;
  }

  // Günlük ortalama: dakikada "2 saat 13 dk." biçimi, sayfada "12 sayfa".
  function guestAverage(value) {
    const amount = Math.round(Number(value) || 0);
    if (amountUnit() !== 'dakika') return `${amount} ${amountUnit()}`;
    if (amount < 60) return `${amount} dk.`;
    const hours = Math.floor(amount / 60);
    const rest = amount % 60;
    return rest ? `${hours} saat ${rest} dk.` : `${hours} saat`;
  }

  function guestRowMarkup(row, index) {
    const position = MEDALS[row.position]
      ? `<img src="/images/${MEDALS[row.position]}" alt="${row.position}." width="26" height="26">`
      : row.position;
    const league = row.league;
    const small = league ? esc(league.name) : '';
    const avatar = avatarSrc(row.user);
    const average = row.month.amount / Math.max(1, new Date().getDate());
    return `
      <li class="ok-rank-row ok-ranking-row">
        <span class="ok-rank-pos">${position}</span>
        <span class="ok-rank-ring"><img class="ok-rank-avatar ${window.photoFadeClass(avatar)}" src="${esc(avatar)}" alt="" width="36" height="36" loading="lazy" decoding="async" onerror="this.src='/images/default.png'"></span>
        <span class="ok-rank-name"><span class="ok-rank-label">${esc(row.user.name)}</span>
          <small>${small}</small>
        </span>
        <span class="ok-rank-score"><strong class="ok-rank-value">${esc(guestAmount(row.month.amount))}</strong><span class="ok-rank-sub">${index === 0 ? 'Günlük ' : ''}${esc(guestAverage(average))}</span></span>
      </li>`;
  }

  function guestListMarkup(rows) {
    const readers = rows.filter(row => row.month.amount > 0).slice(0, GUEST_LIMIT);
    if (!readers.length) return '<li class="ok-empty">Bu ay henüz okuma kaydı yok.</li>';
    return readers.map(guestRowMarkup).join('');
  }

  // Misafir kartının altındaki "Yöneticiler" kartı. Grubu ilk açan (en eski) yönetici "Sahip" sayılır.
  function renderGuestAdmins(root, guest) {
    let card = document.getElementById('okumalarGuestAdmins');
    const admins = guest
      ? window.globalDataStore.getUsers().filter(user => user.authority === 'admin')
        .sort((a, b) => String(a._id).localeCompare(String(b._id)))
      : [];
    if (!admins.length) {
      card?.remove();
      return;
    }
    if (!card) {
      card = document.createElement('article');
      card.className = 'ok-card ok-guest-admins';
      card.id = 'okumalarGuestAdmins';
      root.appendChild(card);
    }
    card.innerHTML = `
      <h3 class="ok-guest-admins-title">Yöneticiler <span>· ${admins.length}</span></h3>
      <ul class="ok-guest-admin-list">${admins.map((user, index) => {
        const avatar = avatarSrc(user);
        return `<li class="ok-guest-admin">
          <span class="ok-guest-admin-ring"><img class="${window.photoFadeClass(avatar)}" src="${esc(avatar)}" alt="" width="36" height="36" loading="lazy" decoding="async" onerror="this.src='/images/default.png'"></span>
          <span class="ok-guest-admin-text"><strong>${esc(user.name)}</strong>${index === 0 ? '<em class="is-owner">Sahip</em>' : '<em>Yönetici</em>'}</span>
        </li>`;
      }).join('')}</ul>`;
  }

  function storageKey() {
    return `leaderboardSort:${window.groupid || 'default'}`;
  }

  function readMode() {
    try {
      const saved = localStorage.getItem(storageKey());
      return MODE_KEYS.includes(saved) ? saved : (LEGACY_MODES[saved] || 'month');
    } catch (_error) {
      return 'month';
    }
  }

  function saveMode(mode) {
    try {
      localStorage.setItem(storageKey(), mode);
    } catch (_error) {
      // Depolama kapalıysa seçim yalnız bu oturumda kalır.
    }
  }

  let mode = null;
  let modeGroup = null;
  let pastMonth = null; // "YYYY-MM"; Geçmiş aylar görünümünde seçili ay

  function sectionVisible() {
    const section = document.getElementById('okumalarBolumGrup');
    return Boolean(section && !section.hidden);
  }

  function shortDate(key) {
    if (!key) return '–';
    const date = metrics().parseKey(key);
    return `${date.getDate()} ${metrics().MONTH_NAMES[date.getMonth()].slice(0, 3)}`;
  }

  function longDate(key) {
    if (!key) return '–';
    const date = metrics().parseKey(key);
    return `${date.getDate()} ${metrics().MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
  }

  function relativeDay(key) {
    if (!key) return '';
    const today = metrics().todayKey();
    if (key === today) return 'bugün';
    if (key === metrics().addDays(today, -1)) return 'dün';
    const diff = Math.round((metrics().parseKey(today) - metrics().parseKey(key)) / 86400000);
    return `${diff} gün önce`;
  }

  function isAdmin() {
    const user = currentUser();
    return Boolean(user && user.userAuthority === 'admin');
  }

  // Bugünün durumu: okudum (miktar) / çetelenin diğer alanları doldu / okumadım / boş.
  function todayState(user, records) {
    const today = metrics().todayKey();
    const record = records.find(item => item.date === today);
    const read = Boolean(record && record.status === 'okudum');
    const missed = Boolean(record && record.status === 'okumadım');
    const cetele = window.RoTaKipCetele;
    const filled = Boolean(cetele && cetele.loaded && cetele.getEntry(user._id, today));
    const amount = read && record.amount != null && Number.isFinite(Number(record.amount)) ? Number(record.amount) : null;
    return { read, missed, filled, amount, rank: read ? 0 : filled ? 1 : missed ? 2 : 3 };
  }

  function todayExtras(userId) {
    const cetele = window.RoTaKipCetele;
    if (!cetele || !cetele.loaded) return '';
    const values = cetele.getEntry(userId, metrics().todayKey())?.values;
    if (!values) return '';
    return cetele.extraFields()
      .filter(field => field.type === 'sayi' && Number.isFinite(Number(values[field.key])) && Number(values[field.key]) > 0)
      .slice(0, 3)
      .map(field => `${esc(field.label)} ${formatNumber(values[field.key])}${field.unit ? ` ${esc(field.unit)}` : ''}`)
      .join(' · ');
  }

  function summarize(user) {
    const records = window.globalDataStore ? window.globalDataStore.getStatsForUser(String(user._id)) : [];
    const total = metrics().totalReadDays(records);
    const missed = records.filter(record => record.status === 'okumadım').length;
    const month = metrics().monthSummary(records);
    const best = metrics().longestStreak(records);
    const lastRead = records.reduce((latest, record) => (record.status === 'okudum' && record.date > latest ? record.date : latest), '');
    return {
      user,
      records,
      today: todayState(user, records),
      past: pastMonth ? metrics().monthSummary(records, `${pastMonth}-01`) : { days: 0, amount: 0 },
      total,
      missed,
      rate: total + missed > 0 ? Math.round((total / (total + missed)) * 100) : 0,
      month,
      amount: metrics().totalAmount(records),
      streak: metrics().currentStreak(records),
      best,
      lastRead,
      league: metrics().leagueFor(total)
    };
  }

  const collator = new Intl.Collator('tr-TR', { sensitivity: 'base' });

  function compare(a, b) {
    if (mode === 'guest') {
      return b.month.amount - a.month.amount || b.month.days - a.month.days || b.total - a.total;
    }
    if (mode === 'today') {
      return a.today.rank - b.today.rank || (b.today.amount || 0) - (a.today.amount || 0);
    }
    if (mode === 'past') {
      return b.past.days - a.past.days || b.past.amount - a.past.amount || b.total - a.total;
    }
    if (mode === 'month') {
      return b.month.days - a.month.days || b.month.amount - a.month.amount || b.total - a.total;
    }
    return b.total - a.total || b.amount - a.amount;
  }

  // Eşit skorlar aynı sırayı paylaşır (1, 2, 2, 4).
  function rank(rows) {
    const sorted = rows.slice().sort((a, b) => compare(a, b) || collator.compare(a.user.name || '', b.user.name || ''));
    let position = 0;
    return sorted.map((row, index) => {
      if (index === 0 || compare(sorted[index - 1], row) !== 0) position = index + 1;
      // Bugün: okumayanlar eşit sayılmaz, numaralandırma kesintisiz devam eder.
      if (mode === 'today' && !row.today.read) return { ...row, position: index + 1 };
      return { ...row, position };
    });
  }

  function valueMarkup(row) {
    const unit = amountUnit();
    if (mode === 'today') {
      const state = row.today;
      const text = state.read
        ? (state.amount !== null ? `${formatNumber(state.amount)}<small> ${esc(unit)}</small>` : 'Okudu')
        : state.filled ? 'Doldurdu' : state.missed ? 'Okumadı' : `0<small> ${esc(unit)}</small>`;
      return `<strong class="ok-rank-value">${text}</strong>`;
    }
    if (mode === 'past') {
      return `<strong class="ok-rank-value">${row.past.days}<small> gün</small></strong>${row.past.amount > 0 ? `<span class="ok-rank-sub">${formatNumber(row.past.amount)} ${esc(unit)}</span>` : ''}`;
    }
    if (mode === 'month') {
      return `<strong class="ok-rank-value">${row.month.days}<small> gün</small></strong>${row.month.amount > 0 ? `<span class="ok-rank-sub">${formatNumber(row.month.amount)} ${esc(unit)}</span>` : ''}`;
    }
    return `<strong class="ok-rank-value">${row.total}<small> gün</small></strong>${row.amount > 0 ? `<span class="ok-rank-sub">${formatNumber(row.amount)} ${esc(unit)}</span>` : ''}`;
  }

  function rowMarkup(row, isMe) {
    const league = row.league;
    const idle = mode === 'today' && !row.today.read;
    const position = !idle && MEDALS[row.position]
      ? `<img src="/images/${MEDALS[row.position]}" alt="${row.position}." width="26" height="26">`
      : row.position;
    const extras = mode === 'today' ? todayExtras(row.user._id) : '';
    const small = extras || (league ? `<img src="/images/${esc(league.img)}" alt="" width="14" height="14"> ${esc(league.name)}` : '');
    const avatar = avatarSrc(row.user);
    const stateClass = idle ? ` is-idle${row.today.missed ? ' is-missed' : ''}` : '';
    return `
      <li class="ok-rank-row ok-ranking-row${isMe ? ' is-me' : ''}${stateClass}">
        <button type="button" class="ok-ranking-hit" data-user-id="${esc(row.user._id)}" aria-label="${esc(row.user.name)} özetini aç"></button>
        <span class="ok-rank-pos">${position}</span>
        <span class="ok-rank-ring"><img class="ok-rank-avatar ${window.photoFadeClass(avatar)}" src="${esc(avatar)}" alt="" width="36" height="36" loading="lazy" decoding="async" onerror="this.src='/images/default.png'"></span>
        <span class="ok-rank-name"><span class="ok-rank-label">${esc(row.user.name)}${isMe ? ' <em>(sen)</em>' : ''}</span>
          <small>${small}</small>
        </span>
        <span class="ok-rank-score">${valueMarkup(row)}</span>
      </li>`;
  }

  function openMemberSheet(row) {
    if (!window.RoTaKipBottomSheet) return;
    const unit = amountUnit();
    const progress = metrics().leagueProgress(row.total);
    const content = document.createElement('div');
    content.className = 'ok-member-sheet';
    content.innerHTML = `
      <div class="ok-member-league">
        ${row.league ? `<img src="/images/${esc(row.league.img)}" alt="" width="52" height="52">` : ''}
        <div>
          <strong>${row.league ? esc(row.league.name) : ''}</strong>
          <span>${progress && progress.next ? `${esc(progress.next.name)} ligine ${progress.remaining} gün` : 'En üst lig'}</span>
        </div>
      </div>
      <dl class="ok-member-facts">
        <div><dt>Okunan gün</dt><dd>${row.total}<small> / ${row.total + row.missed}</small></dd></div>
        <div><dt>Okuma oranı</dt><dd>%${row.rate}</dd></div>
        <div><dt>Bu ay</dt><dd>${row.month.days}<small> gün${row.month.amount > 0 ? ` · ${formatNumber(row.month.amount)} ${esc(unit)}` : ''}</small></dd></div>
        <div><dt>Toplam ${esc(unit)}</dt><dd>${formatNumber(row.amount)}</dd></div>
        <div><dt>Seri</dt><dd>${row.streak}<small> gün</small></dd></div>
        <div><dt>En uzun seri</dt><dd>${row.best.streak}<small> gün${row.best.streak ? ` · ${esc(shortDate(row.best.startDate))} – ${esc(shortDate(row.best.endDate))}` : ''}</small></dd></div>
        <div class="is-wide"><dt>Son okuma</dt><dd>${row.lastRead ? `${esc(longDate(row.lastRead))} <small>(${esc(relativeDay(row.lastRead))})</small>` : '–'}</dd></div>
      </dl>
      <div class="ok-member-actions">
        <button type="button" class="ok-btn ok-btn-soft" data-action="stats"><i class="fa-solid fa-chart-simple" aria-hidden="true"></i> İstatistikler</button>
        ${isAdmin() && window.openOkumalarMemberEntry ? '<button type="button" class="ok-btn ok-btn-soft" data-action="entry"><i class="fa-solid fa-pen" aria-hidden="true"></i> Günlük kayıt</button>' : ''}
        <button type="button" class="ok-btn ok-btn-ghost" data-action="share"><i class="fa-solid fa-share-nodes" aria-hidden="true"></i> Paylaş</button>
      </div>`;
    const sheet = window.RoTaKipBottomSheet.open({
      title: row.user.name,
      subtitle: `${row.position}. sıra · ${MODES.find(([key]) => key === mode)[1]}`,
      className: 'ok-sheet',
      content
    });
    content.querySelector('[data-action="stats"]').addEventListener('click', () => {
      sheet.close();
      window.openOkumalarStatsFor?.(row.user._id);
    });
    content.querySelector('[data-action="entry"]')?.addEventListener('click', () => {
      sheet.close();
      window.openOkumalarMemberEntry(row.user._id);
    });
    content.querySelector('[data-action="share"]').addEventListener('click', () => shareSummary(row));
  }

  function shareSummary(row) {
    const unit = amountUnit();
    const lines = [`*${row.user.name} · okuma özeti*`, ''];
    if (row.amount > 0) lines.push(`*Toplam:* ${formatNumber(row.amount)} ${unit}`);
    if (row.month.amount > 0) lines.push(`*${metrics().MONTH_NAMES[new Date().getMonth()]} ayı:* ${formatNumber(row.month.amount)} ${unit}`);
    lines.push(
      `*Okunan gün:* ${row.total}`,
      `*Okunmayan gün:* ${row.missed}`,
      `*Başarı oranı:* %${row.rate}`,
      '',
      `*Mevcut seri:* ${row.streak} gün`,
      `*En uzun seri:* ${row.best.streak} gün${row.best.streak ? ` (${shortDate(row.best.startDate)} – ${shortDate(row.best.endDate)})` : ''}`,
      `*Son okuma:* ${row.lastRead ? `${longDate(row.lastRead)} (${relativeDay(row.lastRead)})` : '–'}`
    );
    const text = lines.join('\n');
    if (navigator.share) {
      navigator.share({ title: 'Okuma özeti', text }).catch(() => {});
      return;
    }
    navigator.clipboard?.writeText(text)
      .then(() => window.showNotification?.('Özet kopyalandı', 'success'))
      .catch(() => window.showNotification?.('Özet kopyalanamadı', 'error'));
  }

  function bind(root) {
    if (bound) return;
    bound = true;
    root.addEventListener('change', event => {
      const select = event.target.closest('#okumalarRankingMonth');
      if (!select) return;
      pastMonth = select.value;
      animateNext = true;
      render();
    });
    root.addEventListener('click', event => {
      const modeButton = event.target.closest('[data-rank-mode]');
      if (modeButton) {
        if (modeButton.dataset.rankMode === mode) return;
        mode = modeButton.dataset.rankMode;
        saveMode(mode);
        animateNext = true;
        render();
        return;
      }
      if (event.target.closest('[data-action="ladder"]')) {
        window.openOkumalarLadderSheet?.();
        return;
      }
      const hit = event.target.closest('.ok-ranking-hit');
      if (hit) {
        const row = (root._rows || []).find(item => String(item.user._id) === hit.dataset.userId);
        if (row) openMemberSheet(row);
      }
    });
  }

  function render() {
    const root = document.getElementById('okumalarRanking');
    if (!root || !window.globalDataStore || !metrics()) return;
    if (!sectionVisible()) {
      dirty = true;
      return;
    }
    dirty = false;
    const guest = isGuest();
    if (guest) {
      mode = 'guest';
    } else if (!mode || mode === 'guest' || modeGroup !== window.groupid) {
      mode = readMode();
      modeGroup = window.groupid;
      pastMonth = null;
    }
    root.classList.toggle('is-guest', guest);
    document.getElementById('okumalarBolumGrup')?.classList.toggle('is-guest', guest);
    bind(root);
    root.hidden = false;
    root.querySelectorAll('[data-rank-mode]').forEach(button => {
      const active = button.dataset.rankMode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    const me = currentUser();
    const users = window.globalDataStore.getUsers();
    const months = mode === 'past' ? pastMonths(users) : [];
    if (mode === 'past' && !months.includes(pastMonth)) pastMonth = months[0] || null;
    const rows = rank(users.map(summarize));
    root._rows = rows;
    renderMonthPicker(months);
    const list = document.getElementById('okumalarRankingList');
    const caption = document.getElementById('okumalarRankingCaption');
    if (caption) caption.innerHTML = captionMarkup(rows);
    const empty = !rows.length ? 'Henüz üye yok.' : mode === 'past' && !pastMonth ? 'Geçmiş aylara ait okuma kaydı yok.' : '';
    if (empty) list.innerHTML = `<li class="ok-empty">${empty}</li>`;
    else if (guest) list.innerHTML = guestListMarkup(rows);
    else list.innerHTML = rows.map(row => rowMarkup(row, me && String(me.userId) === String(row.user._id))).join('');
    renderGuestAdmins(root, guest);
    if (animateNext) {
      animateNext = false;
      animateRanking(list);
    }
  }

  function animateRanking(list) {
    const card = list.closest('.ok-ranking-card');
    if (!card) return;
    Array.from(list.children).forEach((item, index) => item.style.setProperty('--i', String(Math.min(index, 10))));
    card.classList.remove('is-switching');
    void card.offsetWidth;
    card.classList.add('is-switching');
    window.setTimeout(() => card.classList.remove('is-switching'), 900);
  }

  // Okuma kaydı olan geçmiş aylar (bu ay hariç), yeniden eskiye.
  function pastMonths(users) {
    const current = metrics().monthKey();
    const months = new Set();
    users.forEach(user => {
      window.globalDataStore.getStatsForUser(String(user._id)).forEach(record => {
        const month = String(record.date || '').slice(0, 7);
        if (record.status === 'okudum' && month && month < current) months.add(month);
      });
    });
    return Array.from(months).sort().reverse();
  }

  function renderMonthPicker(months) {
    const select = document.getElementById('okumalarRankingMonth');
    if (!select) return;
    select.hidden = !(mode === 'past' && months.length);
    if (select.hidden) return;
    select.innerHTML = months.map(month => `<option value="${month}"${month === pastMonth ? ' selected' : ''}>${esc(metrics().monthLabel(`${month}-01`))}</option>`).join('');
  }

  function captionMarkup(rows) {
    if (mode === 'guest') return `<strong>Bu ayın sıralaması</strong><span class="ok-ranking-unit">${esc(amountUnit())}</span>`;
    if (mode === 'today') {
      const readers = rows.filter(row => row.today.read);
      const total = readers.reduce((sum, row) => sum + (row.today.amount || 0), 0);
      const sum = total > 0 ? ` · toplam ${formatNumber(total)} ${esc(amountUnit())}` : '';
      return `Bugün · <strong>${readers.length}</strong>/${rows.length} okudu${sum}`;
    }
    if (mode === 'month') return `${esc(metrics().monthLabel())} · okunan gün`;
    if (mode === 'past') return pastMonth ? `${esc(metrics().monthLabel(`${pastMonth}-01`))} · okunan gün` : 'Geçmiş aylar';
    return 'Toplam okuma günü · lig';
  }

  function scheduleRender() {
    if (frame !== null) return Promise.resolve();
    return new Promise(resolve => {
      frame = window.requestAnimationFrame(() => {
        frame = null;
        try {
          render();
        } catch (error) {
          console.error('Sıralama çizilemedi:', error);
        }
        resolve();
      });
    });
  }

  window.renderOkumalarRanking = function renderOkumalarRanking() {
    if (dirty || sectionVisible()) return scheduleRender();
    return Promise.resolve();
  };
  window.loadUserCards = scheduleRender;
  window.addEventListener('rotakip:amount-type-changed', scheduleRender);
  window.addEventListener('rotakip:auth-changed', scheduleRender);
  window.addEventListener('rotakip:cetele-changed', scheduleRender);
})();
