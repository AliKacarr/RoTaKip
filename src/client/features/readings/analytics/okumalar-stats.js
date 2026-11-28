/*
 * Okumalar istatistikleri (grafikler yalın SVG/CSS'tir; veriler window.globalDataStore'dan
 * istemcide hesaplanır, okuma verisi okuma alanından (ilk alan) gelir).
 *  - Sayfam (#okumalarMyStats): giriş yapan kişinin grafikleri — özet kutuları, son 7 gün,
 *    alışkanlık takvimi (alışkanlık seçilir), haftalık okuma, haftanın günleri, diğer alışkanlıklar,
 *    son bir yıl, rozetler.
 *  - Grup › Sıralama ve Grup mesajlarının altı (#okumalarStats): grup grafikleri — özet kutuları,
 *    alışkanlık takvimi (üye + alışkanlık seçilir; Sayfam'daki takvimle aynı bileşen), haftalık katılım,
 *    haftanın günleri. (Kişi sıralamaları Sıralama'dadır.)
 *  - Sıralamadaki üye panelinden "İstatistikler": aynı kişi grafikleri bir alt panelde açılır.
 *
 * Eski giriş noktaları (loadReadingStats, loadMonthlyCalendar, renderLongestSeries,
 * refreshMonthlyCalendarForUser, updateMonthlyCalendarUsers) korunur; hepsi tek bir
 * çizimi zamanlar. Bölüm gizliyken çizim ertelenir ve bölüm açıldığında yapılır.
 */
(function initializeOkumalarStats() {
  const metrics = () => window.RoTaKipReadingMetrics;
  const WEEKDAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const SHORT_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const HEATMAP_WEEKS = 53;
  const TREND_WEEKS = 12;

  // Çetele deposu diğer alışkanlıkların son 63 gününü tutar (cetele-store.js RANGE_DAYS); daha eski aylar ayrıca istenir.
  const CETELE_STORE_DAYS = 63;

  const state = {
    dirty: true,
    frame: null,
    bound: false
  };

  // ---- Yardımcılar ---------------------------------------------------------

  function esc(value) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(String(value ?? ''))
      : String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
  }

  function amountUnit() {
    return typeof window.getCurrentAmountType === 'function' ? window.getCurrentAmountType() : 'sayfa';
  }

  function currentUser() {
    return typeof LocalStorageManager !== 'undefined' ? LocalStorageManager.getCurrentUserInfo() : null;
  }

  function store() {
    return window.globalDataStore || null;
  }

  function users() {
    const dataStore = store();
    return dataStore ? dataStore.getUsers() : [];
  }

  function recordsOf(userId) {
    const dataStore = store();
    return dataStore && typeof dataStore.getStatsForUser === 'function'
      ? dataStore.getStatsForUser(String(userId))
      : [];
  }

  function statusMapOf(userId) {
    const dataStore = store();
    const map = dataStore && typeof dataStore.getStatMap === 'function' ? dataStore.getStatMap() : null;
    return (map && map.get(String(userId))) || {};
  }

  function amountOf(record) {
    const value = Number(record && record.amount);
    return record && record.status === 'okudum' && record.amount != null && record.amount !== '' && Number.isFinite(value)
      ? value
      : null;
  }

  function shortDate(key) {
    const date = metrics().parseKey(key);
    return `${date.getDate()} ${SHORT_MONTHS[date.getMonth()]}`;
  }

  function sectionVisible(id) {
    const section = document.getElementById(id);
    return Boolean(section && !section.hidden);
  }

  function datesBetween(from, to) {
    const list = [];
    for (let cursor = from; cursor <= to; cursor = metrics().addDays(cursor, 1)) list.push(cursor);
    return list;
  }

  function canEditCalendar(userId) {
    const me = currentUser();
    if (!me) return false;
    return String(userId) === String(me.userId) || me.userAuthority === 'admin';
  }

  // ---- Kişisel -------------------------------------------------------------

  // Bu ayın toplamı Özetim kartındadır; burada ortalama, oran ve seriler gösterilir.
  function personalTilesCard(records) {
    const today = metrics().todayKey();
    const month = metrics().monthSummary(records);
    const elapsed = Number(today.slice(8, 10));
    const hasAmounts = records.some(record => amountOf(record) !== null);
    const streak = metrics().currentStreak(records);
    const best = metrics().longestStreak(records).streak;
    const read = metrics().totalReadDays(records);
    const missed = records.filter(record => record.status === 'okumadım').length;
    const rate = read + missed ? Math.round((read / (read + missed)) * 100) : 0;
    const average = hasAmounts
      ? `${formatNumber(month.amount / elapsed)}<small> ${esc(amountUnit())}</small>`
      : `%${Math.round((month.days / elapsed) * 100)}`;
    return `
      <article class="ok-card ok-stats-card ok-stats-wide">
        <div class="ok-card-head">
          <h3 class="ok-card-title">Okuma düzeni</h3>
          <span class="ok-card-aside">${read} okuma günü</span>
        </div>
        <div class="ok-stats ok-stats-4">
          <div class="ok-stat"><span class="ok-stat-label">${hasAmounts ? 'Bu ay günlük ort.' : 'Bu ay oran'}</span><strong class="ok-stat-value">${average}</strong></div>
          <div class="ok-stat"><span class="ok-stat-label">Genel oran</span><strong class="ok-stat-value">%${rate}</strong></div>
          <div class="ok-stat"><span class="ok-stat-label">Seri</span><strong class="ok-stat-value">${streak}<small> gün</small></strong></div>
          <div class="ok-stat"><span class="ok-stat-label">En uzun seri</span><strong class="ok-stat-value">${best}<small> gün</small></strong></div>
        </div>
      </article>`;
  }

  // Son 7 gün; miktar girilmişse miktar, girilmemişse okunan gün karşılaştırılır.
  function lastSevenCard(records) {
    const today = metrics().todayKey();
    const byDate = new Map(records.map(record => [record.date, record]));
    const hasAmounts = records.some(record => amountOf(record) !== null);
    const valueFor = date => {
      const record = byDate.get(date);
      if (!record || record.status !== 'okudum') return 0;
      return hasAmounts ? (amountOf(record) || 0) : 1;
    };
    const days = datesBetween(metrics().addDays(today, -6), today);
    const previous = datesBetween(metrics().addDays(today, -13), metrics().addDays(today, -7));
    const sum = list => list.reduce((total, date) => total + valueFor(date), 0);
    const current = sum(days);
    const before = sum(previous);
    const diff = current - before;
    const unit = hasAmounts ? amountUnit() : 'gün';
    const peak = Math.max(1, ...days.map(valueFor));
    let compare = 'geçen haftayla aynı';
    if (diff > 0) compare = `geçen haftadan <strong class="is-up">${formatNumber(diff)} ${esc(unit)} fazla</strong>`;
    if (diff < 0) compare = `geçen haftadan <strong class="is-down">${formatNumber(-diff)} ${esc(unit)} az</strong>`;

    return `
      <article class="ok-card ok-stats-card">
        <div class="ok-card-head">
          <h3 class="ok-card-title">Son 7 gün</h3>
          <span class="ok-card-aside">${formatNumber(current)} ${esc(unit)}</span>
        </div>
        <p class="ok-stats-compare">${compare}</p>
        <div class="ct-chart ok-chart" role="img" aria-label="Son 7 günün okuma değerleri">
          ${days.map(date => {
            const value = valueFor(date);
            const record = byDate.get(date);
            const parsed = metrics().parseKey(date);
            const label = metrics().DAY_LABELS[(parsed.getDay() + 6) % 7];
            const missed = record && record.status === 'okumadım';
            const text = missed ? 'okumadı' : value ? (hasAmounts ? `${formatNumber(value)} ${unit}` : 'okudu') : 'boş';
            return `
              <div class="ct-bar${date === today ? ' is-today' : ''}${missed ? ' is-missed' : ''}" title="${esc(`${shortDate(date)}: ${text}`)}">
                <span class="ct-bar-fill" style="height: ${value ? Math.max(6, (value / peak) * 100).toFixed(1) : 0}%;">${hasAmounts && value ? `<span class="ok-bar-value">${formatNumber(value)}</span>` : ''}</span>
                <span class="ct-bar-label">${label}</span>
              </div>`;
          }).join('')}
        </div>
      </article>`;
  }

  // Miktar dağılımına göre 1–4 yoğunluk düzeyi; miktarsız okuma orta düzeydir.
  function levelScale(records) {
    return levelScaleFor(records.map(amountOf));
  }

  function levelScaleFor(values) {
    const amounts = values.filter(value => value !== null && value > 0).sort((a, b) => a - b);
    if (!amounts.length) return () => 3;
    const quantile = ratio => amounts[Math.min(amounts.length - 1, Math.floor(ratio * amounts.length))];
    const q1 = quantile(0.25);
    const q2 = quantile(0.5);
    const q3 = quantile(0.75);
    return amount => {
      if (amount === null || amount <= 0) return 3;
      if (amount <= q1) return 1;
      if (amount <= q2) return 2;
      if (amount <= q3) return 3;
      return 4;
    };
  }

  function heatmapCard(records) {
    const today = metrics().todayKey();
    const start = metrics().addDays(metrics().weekStartKey(today), -7 * (HEATMAP_WEEKS - 1));
    const byDate = new Map(records.map(record => [record.date, record]));
    const level = levelScale(records);
    const columns = [];
    const months = [];
    let readDays = 0;
    let lastMonth = null;
    for (let week = 0; week < HEATMAP_WEEKS; week++) {
      const weekStart = metrics().addDays(start, week * 7);
      const firstOfMonth = datesBetween(weekStart, metrics().addDays(weekStart, 6)).find(date => date.endsWith('-01'));
      const monthIndex = metrics().parseKey(firstOfMonth || weekStart).getMonth();
      if (week === 0) lastMonth = monthIndex;
      if (firstOfMonth && monthIndex !== lastMonth) {
        months.push(`<span style="grid-column: ${week + 1};">${SHORT_MONTHS[monthIndex]}</span>`);
        lastMonth = monthIndex;
      }
      const cells = [];
      for (let day = 0; day < 7; day++) {
        const date = metrics().addDays(weekStart, day);
        if (date > today) {
          cells.push('<i class="is-future"></i>');
          continue;
        }
        const record = byDate.get(date);
        let className = '';
        if (record && record.status === 'okudum') {
          className = `lv-${level(amountOf(record))}`;
          readDays += 1;
        } else if (record && record.status === 'okumadım') {
          className = 'is-missed';
        }
        cells.push(`<i class="${className}" title="${esc(shortDate(date))}"></i>`);
      }
      columns.push(`<span class="ok-heat-week">${cells.join('')}</span>`);
    }
    return `
      <article class="ok-card ok-stats-card ok-stats-wide ok-heatmap">
        <div class="ok-card-head">
          <h3 class="ok-card-title">Son bir yıl</h3>
          <span class="ok-card-aside">${readDays} gün</span>
        </div>
        <div class="ok-heat-scroll" data-heat-scroll>
          <div class="ok-heat">
            <div class="ok-heat-months" aria-hidden="true">${months.join('')}</div>
            <div class="ok-heat-grid" role="img" aria-label="Son bir yılda ${readDays} gün okundu">${columns.join('')}</div>
          </div>
        </div>
      </article>`;
  }

  function badgesCard(records) {
    const badges = metrics().badgesFor(records, amountUnit());
    const earned = badges.filter(badge => badge.earned).length;
    return `
      <article class="ok-card ok-stats-card ok-stats-wide">
        <div class="ok-card-head">
          <h3 class="ok-card-title">Rozetler</h3>
          <span class="ok-card-aside">${earned}/${badges.length}</span>
        </div>
        <ul class="ok-badges">
          ${badges.map(badge => `
            <li class="ok-badge${badge.earned ? ' is-earned' : ''}">
              <span class="ok-badge-icon" aria-hidden="true">${badge.icon}</span>
              <span class="ok-badge-title">${esc(badge.title)}</span>
            </li>`).join('')}
        </ul>
      </article>`;
  }

  // Bir üyenin tüm kişi grafikleri; ctx = { habit, rerender, beforeEdit } her çizim alanına (Sayfam / alt panel) özeldir.
  function renderPersonal(container, user, ctx) {
    const records = recordsOf(user._id);
    const list = [user];
    const habitConfig = { view: ctx.habit, pickUser: false, user, share: true, beforeEdit: ctx.beforeEdit };
    container.innerHTML = `
      ${personalTilesCard(records)}
      ${habitCalendarCard(habitConfig)}
      ${lastSevenCard(records)}
      ${trendCard(list, { title: 'Haftalık okuma', label: 'Bu hafta', personal: true })}
      ${weekdayCard(list)}
      ${fieldTotalsCard(list, { personal: true })}
      ${heatmapCard(records)}
      ${badgesCard(records)}`;

    bindHabitCalendar(container.querySelector('.ok-habit-calendar'), habitConfig);
    const scroller = container.querySelector('[data-heat-scroll]');
    if (scroller) scroller.scrollLeft = scroller.scrollWidth;
  }

  // ---- Grup ----------------------------------------------------------------

  function participationRate(list, dates) {
    if (!list.length || !dates.length) return 0;
    let read = 0;
    list.forEach(user => {
      const map = statusMapOf(user._id);
      dates.forEach(date => { if (map[date] === 'okudum') read += 1; });
    });
    return read / (list.length * dates.length);
  }

  function groupTiles(list) {
    const today = metrics().todayKey();
    const monthDates = datesBetween(`${metrics().monthKey(today)}-01`, today);
    const readToday = list.filter(user => statusMapOf(user._id)[today] === 'okudum').length;
    const me = currentUser();
    let groupDays = 0;
    let groupAmount = 0;
    let myDays = 0;
    let myAmount = 0;
    list.forEach(user => {
      const month = metrics().monthSummary(recordsOf(user._id));
      groupDays += month.days;
      groupAmount += month.amount;
      if (me && String(me.userId) === String(user._id)) {
        myDays = month.days;
        myAmount = month.amount;
      }
    });
    const useAmount = groupAmount > 0;
    const share = useAmount ? (groupAmount ? myAmount / groupAmount : 0) : (groupDays ? myDays / groupDays : 0);
    const isMember = me && list.some(user => String(user._id) === String(me.userId));
    return `
      <div class="ok-stats ok-stats-4">
        <div class="ok-stat"><span class="ok-stat-label">Bugün okuyan</span><strong class="ok-stat-value">${readToday}<small>/${list.length}</small></strong></div>
        <div class="ok-stat"><span class="ok-stat-label">Bu ay katılım</span><strong class="ok-stat-value">%${Math.round(participationRate(list, monthDates) * 100)}</strong></div>
        <div class="ok-stat"><span class="ok-stat-label">Bu ay toplam</span><strong class="ok-stat-value">${useAmount ? `${formatNumber(groupAmount)}<small> ${esc(amountUnit())}</small>` : `${groupDays}<small> gün</small>`}</strong></div>
        ${isMember ? `<div class="ok-stat"><span class="ok-stat-label">Katkın</span><strong class="ok-stat-value">%${Math.round(share * 100)}</strong></div>` : ''}
      </div>`;
  }

  // Okuma alanı dışındaki sayı alanlarının bu ayki toplamları (Sayfam'da kişinin kendisi için).
  function fieldTotalsCard(list, options = {}) {
    const cetele = window.RoTaKipCetele;
    if (!cetele || !cetele.loaded) return '';
    const fields = cetele.extraFields().filter(field => field.type === 'sayi');
    if (!fields.length) return '';
    const month = metrics().monthKey();
    const rows = fields.map(field => {
      let total = 0;
      let days = 0;
      const byUser = new Map();
      list.forEach(user => {
        cetele.entriesForUser(user._id).forEach(entry => {
          if (String(entry.date).slice(0, 7) !== month) return;
          const value = Number(entry.values?.[field.key]);
          // 0 = "yapmadım" bildirimi: toplama katkısı yok, yapılan gün sayılmaz.
          if (!Number.isFinite(value) || value <= 0) return;
          total += value;
          days += 1;
          byUser.set(String(user._id), (byUser.get(String(user._id)) || 0) + value);
        });
      });
      const top = [...byUser.entries()].sort((a, b) => b[1] - a[1])[0];
      const topUser = top ? list.find(user => String(user._id) === top[0]) : null;
      return { field, total, days, topUser, topValue: top ? top[1] : 0 };
    });
    const max = Math.max(1, ...rows.map(row => row.days));
    return `
      <article class="ok-card ok-stats-card ok-stats-wide">
        <div class="ok-card-head">
          <h3 class="ok-card-title">Diğer alışkanlıklar</h3>
          <span class="ok-card-aside">${esc(metrics().monthLabel())}</span>
        </div>
        <ul class="ok-field-totals">
          ${rows.map(row => `
            <li>
              <div class="ok-field-total-head">
                <span>${esc(row.field.label)}</span>
                <strong>${formatNumber(row.total)}${row.field.unit ? ` <small>${esc(row.field.unit)}</small>` : ''}</strong>
              </div>
              <div class="ok-bar ok-bar-thin" aria-hidden="true"><span class="ok-bar-fill" style="width: ${((row.days / max) * 100).toFixed(1)}%;"></span></div>
              <small>${row.days} kayıt${row.topUser && !options.personal ? ` · en çok ${esc(row.topUser.name)} (${formatNumber(row.topValue)})` : ''}</small>
            </li>`).join('')}
        </ul>
      </article>`;
  }

  // ---- Alışkanlık takvimi --------------------------------------------------
  // Seçilen üyenin seçilen alışkanlığı aylık takvimde görünür; Sayfam'da (ve üye panelinde) üye sabittir,
  // Grup'ta üye de seçilir. Okuma alışkanlığı tüm okuma geçmişinden, diğerleri son 63 gün için çetele
  // deposundan, daha eski günler için /api/cetele'den ay ay alınır. Kendi günü ve (yönetici) herkesin günü
  // dokununca günlük kayıt paneliyle açılır. config = { view, pickUser, user?, share?, beforeEdit? }.

  function newHabitView() {
    return { groupId: null, userId: null, fieldKey: null, month: null };
  }

  const habitViews = { own: newHabitView(), group: newHabitView() };
  const habitMonths = new Map(); // `${groupId}|${YYYY-MM}` -> { status: 'loading' | 'ready' | 'error', entries: Map, waiters: [] }

  function resetHabitViews() {
    habitViews.own = newHabitView();
    habitViews.group = newHabitView();
    habitMonths.clear();
  }

  function monthEndKey(monthKey) {
    const [year, month] = monthKey.split('-').map(Number);
    return `${monthKey}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
  }

  function shiftMonth(monthKey, step) {
    const base = metrics().parseKey(`${monthKey}-01`);
    base.setMonth(base.getMonth() + step);
    return metrics().monthKey(metrics().dateKey(base));
  }

  function remoteHabitMonth(monthKey) {
    const groupId = window.groupid;
    const cacheKey = `${groupId}|${monthKey}`;
    const cached = habitMonths.get(cacheKey);
    if (cached) return cached;
    const item = { status: 'loading', entries: new Map(), waiters: [] };
    habitMonths.set(cacheKey, item);
    fetch(`/api/cetele/${encodeURIComponent(groupId)}?from=${monthKey}-01&to=${monthEndKey(monthKey)}`, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin'
    }).then(async response => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Alışkanlık kayıtları alınamadı');
      (data.entries || []).forEach(entry => item.entries.set(`${String(entry.userId)}|${entry.date}`, entry.values || {}));
      item.status = 'ready';
    }).catch(error => {
      console.warn('Alışkanlık takvimi yüklenemedi:', error);
      item.status = 'error';
    }).finally(() => {
      item.waiters.splice(0).forEach(callback => callback());
    });
    return item;
  }

  function onHabitMonthSettled(monthKey, callback) {
    const item = habitMonths.get(`${window.groupid}|${monthKey}`);
    if (item && item.status === 'loading') item.waiters.push(callback);
  }

  // En eski okuma kaydının ayı; en az son 12 ay gezilebilir.
  function earliestHabitMonth(list) {
    let earliest = null;
    list.forEach(user => {
      recordsOf(user._id).forEach(record => {
        if (record.date && (!earliest || record.date < earliest)) earliest = record.date;
      });
    });
    const fallback = shiftMonth(metrics().monthKey(), -11);
    const month = earliest ? metrics().monthKey(earliest) : fallback;
    return month < fallback ? month : fallback;
  }

  // { done, missed, amount, text } ya da boş gün için null.
  function habitDayOf(value, isRead) {
    if (isRead) {
      if (!value || !value.status) return null;
      if (value.status === 'okumadım') return { missed: true };
      return value.status === 'okudum' ? { done: true, amount: amountOf(value) } : null;
    }
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'string') return { done: true, text: value };
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return number > 0 ? { done: true, amount: number } : { missed: true };
  }

  function habitCalendarCard(config) {
    const cetele = window.RoTaKipCetele;
    const view = config.view;
    if (view.groupId !== window.groupid) Object.assign(view, newHabitView(), { groupId: window.groupid });
    const fields = cetele ? cetele.activeFields() : [];
    const people = config.pickUser
      ? [...users()].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'tr'))
      : [config.user];
    if (!cetele || !fields.length || !people.length || !people[0]) return '';
    const me = currentUser();
    const user = config.pickUser
      ? people.find(item => String(item._id) === String(view.userId))
        || (me && people.find(item => String(item._id) === String(me.userId)))
        || people[0]
      : config.user;
    const field = fields.find(item => item.key === view.fieldKey) || fields[0];
    view.userId = String(user._id);
    view.fieldKey = field.key;

    const isRead = field.key === cetele.readField().key;
    const today = metrics().todayKey();
    const currentMonth = metrics().monthKey(today);
    const minMonth = earliestHabitMonth(config.pickUser ? users() : [user]);
    if (view.month && (view.month >= currentMonth || view.month < minMonth)) view.month = null;
    const monthKey = view.month || currentMonth;
    const [year, month] = monthKey.split('-').map(Number);
    const first = `${monthKey}-01`;
    const daysInMonth = new Date(year, month, 0).getDate();
    const offset = (metrics().parseKey(first).getDay() + 6) % 7;

    // Son 63 günün değerleri çetele deposundadır (düzenlemeler orada hemen görünür); daha eski günler ay ay istenir.
    const storeStart = metrics().addDays(today, -(CETELE_STORE_DAYS - 1));
    const remote = !isRead && first < storeStart ? remoteHabitMonth(monthKey) : null;
    const remoteLoading = Boolean(remote && remote.status === 'loading');
    const failed = Boolean(remote && remote.status === 'error');
    const loading = !isRead && (!cetele.loaded || remoteLoading);
    let valueAt;
    if (isRead) {
      const byDate = new Map(recordsOf(user._id).map(record => [record.date, record]));
      valueAt = date => byDate.get(date);
    } else {
      valueAt = date => (remote && date < storeStart
        ? remote.entries.get(`${String(user._id)}|${date}`)?.[field.key]
        : cetele.getEntry(user._id, date)?.values?.[field.key]);
    }

    const unit = isRead ? amountUnit() : (field.unit || '');
    const doneWord = isRead ? 'okudu' : 'yapıldı';
    const missedWord = field.zeroLabel ? field.zeroLabel.toLocaleLowerCase('tr') : (isRead ? 'okumadı' : 'yapılmadı');
    const days = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${monthKey}-${String(day).padStart(2, '0')}`;
      days.push({ day, date, info: loading || failed ? null : habitDayOf(valueAt(date), isRead) });
    }
    const level = levelScaleFor(days.map(item => (item.info && item.info.done ? item.info.amount ?? null : null)));
    const doneDays = days.filter(item => item.info && item.info.done).length;
    const total = days.reduce((sum, item) => sum + (item.info && item.info.amount ? item.info.amount : 0), 0);
    const editable = canEditCalendar(user._id);

    const cells = [];
    for (let index = 0; index < offset; index++) cells.push('<span class="ok-cal-cell is-pad" aria-hidden="true"></span>');
    days.forEach(({ day, date, info }) => {
      const classes = ['ok-cal-cell'];
      const amount = info && info.done ? info.amount ?? null : null;
      const future = date > today;
      if (info && info.done) classes.push('is-read', `lv-${level(amount)}`);
      if (info && info.missed) classes.push('is-missed');
      if (date === today) classes.push('is-today');
      if (future) classes.push('is-future');
      let detail = 'boş';
      if (info && info.missed) detail = missedWord;
      else if (info && info.done) {
        detail = doneWord;
        if (amount !== null) detail += `, ${formatNumber(amount)}${unit ? ` ${unit}` : ''}`;
        else if (info.text) detail += `: ${info.text.length > 60 ? `${info.text.slice(0, 60)}…` : info.text}`;
      }
      let mark = '';
      if (amount !== null) mark = `<span class="ok-cal-amount">${formatNumber(amount)}</span>`;
      else if (info && info.text) mark = '<span class="ok-cal-amount">✓</span>';
      else if (info && info.missed) mark = '<span class="ok-cal-amount">✕</span>';
      const inner = `<span class="ok-cal-day">${day}</span>${mark}`;
      const label = `${day} ${metrics().MONTH_NAMES[month - 1]}: ${detail}`;
      cells.push(editable && !future
        ? `<button type="button" class="${classes.join(' ')}" data-date="${date}" aria-label="${esc(label)}">${inner}</button>`
        : `<span class="${classes.join(' ')}" title="${esc(label)}">${inner}</span>`);
    });

    let foot = `<span>${doneDays} gün ${isRead ? 'okundu' : 'yapıldı'}${total > 0 ? ` · ${formatNumber(total)}${unit ? ` ${esc(unit)}` : ''}` : ''}</span>`;
    if (loading) foot = '<span>Kayıtlar yükleniyor…</span>';
    if (failed) foot = '<span>Kayıtlar yüklenemedi. <button type="button" class="ok-habit-retry" data-habit-retry>Tekrar dene</button></span>';

    return `
      <article class="ok-card ok-stats-card ok-stats-wide ok-habit-calendar${loading ? ' is-loading' : ''}"${remoteLoading ? ` data-habit-loading-month="${monthKey}"` : ''}>
        <div class="ok-card-head">
          <h3 class="ok-card-title">Alışkanlık takvimi</h3>
          ${config.share ? '<button type="button" class="ok-icon-btn ok-habit-share" data-habit-share aria-label="Takvimi paylaş"><i class="fa-solid fa-share-nodes" aria-hidden="true"></i></button>' : ''}
        </div>
        <div class="ok-habit-pickers">
          ${config.pickUser ? `
          <select class="ok-habit-select" data-habit-pick="user" aria-label="Üye seç">
            ${people.map(item => `<option value="${esc(item._id)}"${String(item._id) === String(user._id) ? ' selected' : ''}>${esc(item.name)}</option>`).join('')}
          </select>` : ''}
          <select class="ok-habit-select" data-habit-pick="field" aria-label="Alışkanlık seç">
            ${fields.map(item => `<option value="${esc(item.key)}"${item.key === field.key ? ' selected' : ''}>${esc(item.label)}</option>`).join('')}
          </select>
        </div>
        <div class="ok-habit-body">
          <p class="ok-habit-caption" hidden>${esc(`${user.name} · ${field.label}`)}</p>
          <div class="ok-card-head ok-calendar-head ok-habit-month">
            <button type="button" class="ok-icon-btn" data-habit-step="-1" aria-label="Önceki ay"${monthKey <= minMonth ? ' disabled' : ''}><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
            <h4 class="ok-card-title ok-habit-month-label">${esc(metrics().monthLabel(first))}</h4>
            <button type="button" class="ok-icon-btn" data-habit-step="1" aria-label="Sonraki ay"${monthKey === currentMonth ? ' disabled' : ''}><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
          </div>
          <div class="ok-cal-grid ok-cal-weekdays" aria-hidden="true">${metrics().DAY_LABELS.map(label => `<span>${label}</span>`).join('')}</div>
          <div class="ok-cal-grid" aria-busy="${loading ? 'true' : 'false'}">${cells.join('')}</div>
          <div class="ok-cal-foot">
            ${foot}
            <span class="ok-legend" aria-hidden="true">Az<i class="lv-1"></i><i class="lv-2"></i><i class="lv-3"></i><i class="lv-4"></i>Çok</span>
          </div>
        </div>
      </article>`;
  }

  // Takvim kartının olaylarını bağlar; seçim ve ay değişince yalnız kart yeniden çizilir.
  function bindHabitCalendar(card, config) {
    if (!card) return;
    const view = config.view;
    const redraw = (options = {}) => {
      const holder = document.createElement('template');
      holder.innerHTML = habitCalendarCard(config).trim();
      const next = holder.content.firstElementChild;
      if (!next) return;
      card.replaceWith(next);
      if (options.step) {
        next.style.setProperty('--ok-step-x', `${options.step > 0 ? 18 : -18}px`);
        next.classList.add('is-stepping');
      }
      bindHabitCalendar(next, config);
      if (options.focus) next.querySelector(options.focus)?.focus();
    };

    card.querySelectorAll('[data-habit-pick]').forEach(select => {
      select.addEventListener('change', () => {
        if (select.dataset.habitPick === 'user') view.userId = select.value;
        else view.fieldKey = select.value;
        redraw({ focus: `[data-habit-pick="${select.dataset.habitPick}"]` });
      });
    });
    card.querySelectorAll('[data-habit-step]').forEach(button => {
      button.addEventListener('click', () => {
        const step = Number(button.dataset.habitStep);
        const next = shiftMonth(view.month || metrics().monthKey(), step);
        view.month = next >= metrics().monthKey() ? null : next;
        redraw({ step, focus: `[data-habit-step="${step}"]:not(:disabled)` });
      });
    });
    card.querySelectorAll('.ok-cal-cell[data-date]').forEach(cell => {
      cell.addEventListener('click', () => {
        const date = cell.dataset.date;
        const isMine = String(view.userId) === String(currentUser()?.userId);
        if (isMine && typeof window.isReadingDateEditableForCurrentUser === 'function'
          && !window.isReadingDateEditableForCurrentUser(date)) {
          window.showReadingEditRestrictionInfo?.('date_restricted');
          return;
        }
        if (typeof config.beforeEdit === 'function') config.beforeEdit();
        window.openOkumalarDaySheet?.(date, { userId: view.userId });
      });
    });
    card.querySelector('[data-habit-retry]')?.addEventListener('click', () => {
      habitMonths.delete(`${window.groupid}|${view.month}`);
      redraw();
    });
    card.querySelector('[data-habit-share]')?.addEventListener('click', () => shareHabitCalendar(card));
    const loadingMonth = card.dataset.habitLoadingMonth;
    if (loadingMonth) onHabitMonthSettled(loadingMonth, () => { if (card.isConnected) redraw(); });
  }

  // Paylaşılan resimde seçiciler yoktur; üye · alışkanlık satırı ve ay başlığı görünür.
  function shareHabitCalendar(card) {
    const body = card.querySelector('.ok-habit-body');
    if (!body || typeof window.shareContainerAsImage !== 'function') return;
    const caption = card.querySelector('.ok-habit-caption')?.textContent || '';
    const monthText = card.querySelector('.ok-habit-month-label')?.textContent || '';
    const title = [caption, monthText].filter(Boolean).join(' · ');
    void window.shareContainerAsImage({
      container: body,
      modalId: 'monthShareModal',
      titleText: title,
      fileNamePrefix: 'aylik-takvim',
      shareTitle: 'Aylık takvim',
      shareText: `${title} takvimi`,
      onRestore: () => {},
      prepareImages: null,
      prepareClone: clonedDocument => {
        clonedDocument.querySelectorAll('.ok-habit-body .ok-icon-btn').forEach(button => { button.style.display = 'none'; });
        clonedDocument.querySelectorAll('.ok-habit-caption').forEach(element => element.removeAttribute('hidden'));
        // html2canvas içe dönük (inset) gölgeyi bozuk çizer; bugünün çerçevesi resimde düz kenarlık olur.
        clonedDocument.querySelectorAll('.ok-habit-body .ok-cal-cell.is-today').forEach(cell => {
          const accent = clonedDocument.defaultView.getComputedStyle(cell).getPropertyValue('--ok-accent').trim() || '#4e54c8';
          cell.style.boxShadow = 'none';
          cell.style.boxSizing = 'border-box';
          cell.style.border = `2px solid ${accent}`;
        });
      }
    });
  }

  // "%80'e", "%100'den" gibi yüzde ekleri: ek, sayının söylenişindeki son sözcüğe göre seçilir (0-100).
  // Ayrılma (-den) ve yönelme (-e) halleri için [ayrılma, yönelme] sırasıyla.
  const PERCENT_SUFFIXES = {
    1: ["'den", "'e"], 2: ["'den", "'ye"], 3: ["'ten", "'e"], 4: ["'ten", "'e"], 5: ["'ten", "'e"],
    6: ["'dan", "'ya"], 7: ["'den", "'ye"], 8: ["'den", "'e"], 9: ["'dan", "'a"],
    10: ["'dan", "'a"], 20: ["'den", "'ye"], 30: ["'dan", "'a"], 40: ["'tan", "'a"], 50: ["'den", "'ye"],
    60: ["'tan", "'a"], 70: ["'ten", "'e"], 80: ["'den", "'e"], 90: ["'dan", "'a"],
    100: ["'den", "'e"], 0: ["'dan", "'a"]
  };

  function percentSuffix(value, kind) {
    const key = value === 100 || value === 0 ? value : (value % 10 || value);
    return PERCENT_SUFFIXES[key][kind === 'den' ? 0 : 1];
  }

  // 12 haftalık katılım yüzdesi; içinde bulunulan hafta yalnız geçen günlerle hesaplanır.
  function trendCard(list, options = {}) {
    const today = metrics().todayKey();
    const thisWeek = metrics().weekStartKey(today);
    const points = [];
    for (let index = TREND_WEEKS - 1; index >= 0; index--) {
      const start = metrics().addDays(thisWeek, -7 * index);
      const end = metrics().addDays(start, 6);
      const dates = datesBetween(start, end < today ? end : today);
      points.push({ start, value: Math.round(participationRate(list, dates) * 100) });
    }
    const width = 320;
    const height = 150;
    const left = 30;
    const right = 10;
    const top = 14;
    const bottom = 26;
    const x = index => left + (index * (width - left - right)) / (points.length - 1);
    const y = value => top + ((100 - value) * (height - top - bottom)) / 100;
    const line = points.map((point, index) => `${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ');
    const area = `${x(0).toFixed(1)},${y(0)} ${line} ${x(points.length - 1).toFixed(1)},${y(0)}`;
    const last = points[points.length - 1];
    const previous = points[points.length - 2];
    const grid = [0, 50, 100].map(value => `
      <line x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}" class="ok-line-grid"></line>
      <text x="${left - 6}" y="${y(value) + 4}" text-anchor="end" class="ok-line-axis">%${value}</text>`).join('');
    const labels = points.map((point, index) => (index % 3 === 2 || index === points.length - 1)
      ? `<text x="${x(index).toFixed(1)}" y="${height - 6}" text-anchor="middle" class="ok-line-axis">${esc(shortDate(point.start))}</text>`
      : '').join('');
    const dots = points.map((point, index) => `<circle cx="${x(index).toFixed(1)}" cy="${y(point.value).toFixed(1)}" r="${index === points.length - 1 ? 4.5 : 3}" class="ok-line-dot${index === points.length - 1 ? ' is-last' : ''}"><title>${esc(shortDate(point.start))} haftası: %${point.value}</title></circle>`).join('');
    const delta = last.value - previous.value;

    return `
      <article class="ok-card ok-stats-card">
        <div class="ok-card-head">
          <h3 class="ok-card-title">${esc(options.title || 'Haftalık katılım')}</h3>
          <span class="ok-card-aside">${esc(options.label || 'Bu hafta')} %${last.value}</span>
        </div>
        <p class="ok-stats-compare">${delta === 0 ? 'geçen haftayla aynı' : `<strong class="${delta > 0 ? 'is-up' : 'is-down'}">%${previous.value}${percentSuffix(previous.value, 'den')} %${last.value}${percentSuffix(last.value, 'e')} ${delta > 0 ? 'yükseliş' : 'düşüş'}</strong>`}</p>
        <svg class="ok-line" viewBox="0 0 ${width} ${height}" role="img" aria-label="Son ${TREND_WEEKS} haftanın ${options.personal ? 'okuma' : 'katılım'} yüzdesi">
          ${grid}
          <polygon points="${area}" class="ok-line-area"></polygon>
          <polyline points="${line}" class="ok-line-path"></polyline>
          ${dots}
          ${labels}
        </svg>
      </article>`;
  }

  function weekdayCard(list) {
    const today = metrics().todayKey();
    const from = metrics().addDays(metrics().weekStartKey(today), -7 * (TREND_WEEKS - 1));
    const buckets = metrics().DAY_LABELS.map(() => []);
    datesBetween(from, today).forEach(date => {
      buckets[(metrics().parseKey(date).getDay() + 6) % 7].push(date);
    });
    const values = buckets.map(dates => Math.round(participationRate(list, dates) * 100));
    const peak = Math.max(...values);
    const low = Math.min(...values);
    const dayName = index => WEEKDAY_NAMES[(index + 1) % 7];
    const namesAt = target => values.flatMap((value, index) => (value === target ? [dayName(index)] : []));
    const bestNames = namesAt(peak);
    const weakNames = namesAt(low);
    // Eşitlikte tek bir günü "en çok/en az" göstermek yanıltır: eşit günler birlikte vurgulanır,
    // üçten fazla günün eşit olduğu uç cümlede anılmaz.
    const listNames = names => `<strong>${names.join(' ve ')}</strong>`;
    let compare;
    if (peak === low) compare = 'Tüm günlerde katılım <strong>eşit</strong>';
    else if (bestNames.length > 2) compare = `En az ${listNames(weakNames)} okunuyor`;
    else if (weakNames.length > 2) compare = `En çok ${listNames(bestNames)} okunuyor`;
    else compare = `En çok ${listNames(bestNames)}, en az ${listNames(weakNames)} okunuyor`;
    const highlightPeak = peak > 0 && peak !== low;
    return `
      <article class="ok-card ok-stats-card">
        <div class="ok-card-head">
          <h3 class="ok-card-title">Gün gün katılım</h3>
          <span class="ok-card-aside">son ${TREND_WEEKS} hafta</span>
        </div>
        <p class="ok-stats-compare">${compare}</p>
        <div class="ct-chart ok-chart" role="img" aria-label="Haftanın günlerine göre katılım">
          ${values.map((value, index) => `
            <div class="ct-bar${highlightPeak && value === peak ? ' is-today' : ''}" title="${dayName(index)}: %${value}">
              <span class="ct-bar-fill" style="height: ${value ? Math.max(4, value).toFixed(1) : 0}%;"><span class="ok-bar-value">%${value}</span></span>
              <span class="ct-bar-label">${metrics().DAY_LABELS[index]}</span>
            </div>`).join('')}
        </div>
      </article>`;
  }

  function renderGroup(panel) {
    const list = users();
    if (!list.length) {
      panel.innerHTML = '<p class="ok-empty">Henüz üye yok.</p>';
      return;
    }
    panel.innerHTML = `
      <article class="ok-card ok-stats-card ok-stats-wide">
        <div class="ok-card-head">
          <h3 class="ok-card-title">Grup istatistikleri</h3>
          <span class="ok-card-aside">${list.length} üye</span>
        </div>
        ${groupTiles(list)}
      </article>
      ${habitCalendarCard(groupHabitConfig)}
      ${trendCard(list)}
      ${weekdayCard(list)}`;
    bindHabitCalendar(panel.querySelector('.ok-habit-calendar'), groupHabitConfig);
  }

  // ---- Çizim döngüsü -------------------------------------------------------

  function renderGroupView() {
    const root = document.getElementById('okumalarStats');
    const panel = document.getElementById('okumalarStatsGroup');
    if (!root || !panel) return;
    root.hidden = false;
    renderGroup(panel);
  }

  const ownContext = {
    get habit() { return habitViews.own; },
    rerender: () => render()
  };

  // Grup › Alışkanlık takvimi: üye de seçilir.
  const groupHabitConfig = {
    get view() { return habitViews.group; },
    pickUser: true
  };

  // Sayfam: yalnız giriş yapan üyenin kendi grafikleri.
  function renderOwnView() {
    const root = document.getElementById('okumalarMyStats');
    const panel = document.getElementById('okumalarStatsPersonal');
    if (!root || !panel) return;
    const me = currentUser();
    const user = me ? users().find(item => String(item._id) === String(me.userId)) : null;
    root.hidden = !user;
    if (!user) {
      panel.replaceChildren();
      return;
    }
    renderPersonal(panel, user, ownContext);
  }

  function render() {
    if (!store()) return;
    // Misafir grup istatistiklerini görmez; giriş yapınca çizilir.
    const groupVisible = sectionVisible('okumalarBolumGrup') && Boolean(currentUser());
    const ownVisible = sectionVisible('okumalarBolumBugun');
    if (!groupVisible && !ownVisible) {
      state.dirty = true;
      return;
    }
    state.dirty = false;
    if (groupVisible) renderGroupView();
    if (ownVisible) renderOwnView();
  }

  function scheduleRender() {
    if (state.frame !== null) return Promise.resolve();
    return new Promise(resolve => {
      state.frame = window.requestAnimationFrame(() => {
        state.frame = null;
        try {
          render();
        } catch (error) {
          console.error('İstatistikler çizilemedi:', error);
        }
        resolve();
      });
    });
  }

  // Sıralamadaki üye panelinden bir üyenin kişi grafikleri: kendisiyse Sayfam'daki grafiklere iner,
  // başkasıysa aynı grafikler bir alt panelde açılır.
  window.openOkumalarStatsFor = function openOkumalarStatsFor(userId) {
    const me = currentUser();
    if (me && String(me.userId) === String(userId)) {
      window.RoTaKipOkumalarSections?.open('bugun');
      window.requestAnimationFrame(() => {
        document.getElementById('okumalarMyStats')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return;
    }
    const user = users().find(item => String(item._id) === String(userId));
    if (!user || !window.RoTaKipBottomSheet) return;
    const content = document.createElement('div');
    content.className = 'ok-stats-panel is-single';
    let sheet = null;
    const ctx = {
      habit: newHabitView(),
      rerender: () => renderPersonal(content, user, ctx),
      beforeEdit: () => { if (sheet) sheet.close(); }
    };
    renderPersonal(content, user, ctx);
    sheet = window.RoTaKipBottomSheet.open({
      title: user.name,
      subtitle: 'İstatistikler',
      className: 'ok-sheet ok-stats-sheet',
      content
    });
  };

  window.renderOkumalarStats = function renderOkumalarStats() {
    return scheduleRender();
  };
  window.loadReadingStats = scheduleRender;
  window.loadMonthlyCalendar = scheduleRender;
  window.renderLongestSeries = scheduleRender;
  window.updateMonthlyCalendar = scheduleRender;
  window.updateMonthlyCalendarUsers = scheduleRender;
  window.refreshMonthlyCalendarForUser = scheduleRender;
  window.destroyReadingStatsChart = function destroyReadingStatsChart() {
    if (state.frame !== null) window.cancelAnimationFrame(state.frame);
    state.frame = null;
    state.dirty = true;
  };
  window.addEventListener('rotakip:amount-type-changed', scheduleRender);
  window.addEventListener('rotakip:cetele-changed', scheduleRender);
  window.addEventListener('rotakip:auth-changed', () => {
    resetHabitViews();
    scheduleRender();
  });
})();
