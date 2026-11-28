/*
 * Okumalar › Bugün bölümü.
 * - Giriş kartı: okuma alanı (ilk alan, varsayılan "Kitap okuma") için hızlı seçimler (5, 10, 20…);
 *   altında grubun diğer alanları. Değişiklikler önce taslakta (form.drafts) tutulur; "Kaydet" hepsini
 *   tek seferde yazar, "Temizle" tüm alanları boşaltır. Zorunlu alanlar (field.required) kayıtta denetlenir.
 *   Grup düzenleme aralığı izin veriyorsa önceki günler de seçilebilir.
 * - Özetim: bu ay, toplam, lig ilerlemesi ve son 30 günün çubuk grafiği.
 * Grubun bugünkü durumu Grup bölümündeki Sıralama › Bugün'dedir (user-cards.js); yönetici orada
 * üyenin özetinden window.openOkumalarMemberEntry ile onun gününü doldurur.
 * Veri: window.RoTaKipCetele (cetele-store.js) ve window.globalDataStore.
 */
(function initializeOkumalarToday() {
  const metrics = () => window.RoTaKipReadingMetrics;
  const cetele = () => window.RoTaKipCetele;
  const MILESTONES = [7, 14, 30, 50, 100, 150, 200, 365, 500, 1000];
  const WEEKDAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const WEEKDAY_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  const STRIP_DAYS = 7;
  const WEEKS_BACK = 8; // 8 hafta + bu hafta = 63 günden az: çetele deposunun yüklediği aralığın içinde
  const CHART_DAYS = 30;
  const sheetForms = new Set();

  // ---- Yardımcılar ---------------------------------------------------------

  function esc(value) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(String(value ?? ''))
      : String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  }

  function currentUser() {
    return typeof LocalStorageManager !== 'undefined' ? LocalStorageManager.getCurrentUserInfo() : null;
  }

  function isAdmin() {
    const user = currentUser();
    return Boolean(user && user.userAuthority === 'admin');
  }

  function store() {
    const dataStore = window.globalDataStore;
    return dataStore && dataStore.groupId === window.groupid ? dataStore : null;
  }

  function recordsOf(userId) {
    return store() ? store().getStatsForUser(String(userId)) : [];
  }

  function withUnit(value, unit) {
    return `${formatNumber(value)}${unit ? ` ${esc(unit)}` : ''}`;
  }

  function dateTitle(key) {
    const date = metrics().parseKey(key);
    return `${date.getDate()} ${metrics().MONTH_NAMES[date.getMonth()]} ${WEEKDAY_NAMES[date.getDay()]}`;
  }

  function isEditable(date) {
    return typeof window.isReadingDateEditableForCurrentUser === 'function'
      ? window.isReadingDateEditableForCurrentUser(date)
      : date === metrics().todayKey();
  }

  function editableDays() {
    const today = metrics().todayKey();
    const days = [];
    for (let offset = STRIP_DAYS - 1; offset >= 0; offset--) {
      const date = metrics().addDays(today, -offset);
      if (isEditable(date)) days.push(date);
    }
    return days;
  }

  function canWrite(date) {
    if (typeof window.checkSessionTimeout === 'function' && window.checkSessionTimeout()) return false;
    if (date > metrics().todayKey()) {
      window.showReadingEditRestrictionInfo?.('future');
      return false;
    }
    if (!isEditable(date)) {
      window.showReadingEditRestrictionInfo?.('date_restricted');
      return false;
    }
    return true;
  }

  function isOnStep(value, step) {
    return Math.abs(value / step - Math.round(value / step)) < 1e-9;
  }

  // ---- Kutlama ---------------------------------------------------------------

  function snapshot(userId) {
    const records = recordsOf(userId).slice();
    return { total: metrics().totalReadDays(records), streak: metrics().currentStreak(records) };
  }

  function celebrate(form, before, date) {
    const me = currentUser();
    if (!me || String(me.userId) !== form.userId || !before) return;
    if (cetele().readingOf(form.userId, date)?.status !== 'okudum' || before.wasRead) return;
    const after = snapshot(form.userId);
    const previousLeague = metrics().leagueFor(before.total);
    const nextLeague = metrics().leagueFor(after.total);
    window.RoTaKipDailyTasks?.set('reading', true);
    if (previousLeague && nextLeague && nextLeague.name !== previousLeague.name) {
      window.showOkumalarCelebration?.({
        kind: 'league',
        image: `/images/${nextLeague.img}`,
        title: `${nextLeague.name} ligine yükseldin!`,
        message: `${formatNumber(after.total)} okuma gününe ulaştın. Böyle devam!`
      });
    } else if (after.streak > before.streak && MILESTONES.includes(after.streak)) {
      window.showOkumalarCelebration?.({
        kind: 'streak',
        icon: '🔥',
        title: `${after.streak} günlük seri!`,
        message: 'Düzenli okumak en güzel alışkanlık. Zinciri kırma!'
      });
    } else if (date === metrics().todayKey()) {
      window.showOkumalarCelebration?.({
        kind: 'daily',
        icon: '✓',
        title: 'Bugünkü okuman kaydedildi',
        message: after.streak > 1 ? `🔥 ${after.streak} günlük seri` : 'Yarın da devam et, seri başlasın!',
        autoClose: 2400
      });
    }
  }

  function beforeChange(form) {
    return { ...snapshot(form.userId), wasRead: cetele().readingOf(form.userId, form.date)?.status === 'okudum' };
  }

  // ---- Giriş formu -----------------------------------------------------------

  function formFor(root, userId) {
    let form = root._okEntryForm;
    if (!form || form.userId !== String(userId) || form.groupId !== window.groupid) {
      form = { root, userId: String(userId), groupId: window.groupid, date: null, openCustom: new Set(), drafts: new Map(), invalid: null, signature: '' };
      root._okEntryForm = form;
    }
    if (root.dataset.entryBound !== 'true') {
      root.dataset.entryBound = 'true';
      root.addEventListener('click', event => handleClick(root._okEntryForm, event));
      root.addEventListener('input', event => handleInput(root._okEntryForm, event));
      root.addEventListener('keydown', event => handleKeydown(root._okEntryForm, event));
    }
    return form;
  }

  // Giriş yapan kullanıcının adı: kendi giriş kartında karşılama satırı olarak görünür.
  function greetingName(form) {
    const me = currentUser();
    if (!me || String(me.userId) !== form.userId || form.root.classList.contains('ok-entry-sheet')) return '';
    const member = store() ? store().getUserById(String(me.userId)) : null;
    return String((member && member.name) || me.name || me.userName || '').trim();
  }

  // Profil başlığının sağında güncel seri (0 ise gösterilmez).
  function streakBadgeMarkup(form) {
    const streak = metrics().currentStreak(recordsOf(form.userId));
    return streak > 0 ? `<span class="ok-entry-streak-badge" title="Güncel seri"><i class="fa-solid fa-fire-flame-curved" aria-hidden="true"></i>${formatNumber(streak)}<small> gün seri</small></span>` : '';
  }

  // Profil başlığı: halkalı avatar (daire.webp), ad + düzenle simgesi, seri ve "Lig · okuma günü · günlük ortalama" alt satırı.
  function profileDetails(form) {
    const me = currentUser();
    const member = store() && me ? store().getUserById(String(me.userId)) : null;
    const records = recordsOf(form.userId);
    const total = metrics().totalReadDays(records);
    const league = metrics().leagueFor(total);
    const month = metrics().monthSummary(records);
    const unit = cetele().readField()?.unit;
    const parts = [];
    if (league) parts.push(league.name);
    parts.push(`${formatNumber(total)} okuma günü`);
    if (month.days > 0 && month.amount > 0) {
      parts.push(`Günde ${formatNumber(Math.round(month.amount / month.days))} ${unit === 'dakika' ? 'dk' : unit || ''}`.trim());
    }
    const image = (member && member.profileImage) || (me && me.profileImage) || '';
    return {
      avatar: typeof window.safeImageSrc === 'function' ? window.safeImageSrc(image, '/images/default.png') : '/images/default.png',
      subtitle: parts.join(' · ')
    };
  }

  function profileHeaderMarkup(form, name) {
    const details = profileDetails(form);
    return `<div class="ok-entry-greeting">
        <button type="button" class="ok-entry-avatar" data-action="open-profile" aria-label="Profilimi aç"><img class="${window.photoFadeClass(details.avatar)}" src="${esc(details.avatar)}" alt="" width="64" height="64" decoding="async" onerror="this.src='/images/default.png'"></button>
        <div class="ok-entry-greeting-main">
          <div class="ok-entry-greeting-top">
            <p class="ok-entry-greeting-text"><strong>${esc(name)}</strong><button type="button" class="ok-entry-edit" data-action="open-profile" aria-label="Profili düzenle" title="Profili düzenle"><i class="fa-solid fa-pen" aria-hidden="true"></i></button></p>
          </div>
          <p class="ok-entry-greeting-sub" data-slot="profile-sub">${esc(details.subtitle)}</p>
          <span class="ok-entry-streak" data-slot="streak">${streakBadgeMarkup(form)}</span>
        </div>
      </div>`;
  }

  // Seçilebilir gün: gün şeridinde (son haftalar) bulunan, gelecek olmayan ve düzenlenebilen günler.
  function isSelectableDay(date) {
    return Boolean(date) && date <= metrics().todayKey() && isEditable(date) && weekPages().some(days => days.includes(date));
  }

  function activeDate(form) {
    if (isSelectableDay(form.date)) return form.date;
    const days = editableDays();
    form.date = days.length ? days[days.length - 1] : metrics().todayKey();
    return form.date;
  }

  function dayState(userId, date) {
    const reading = cetele().readingOf(userId, date);
    if (reading?.status === 'okudum') return 'is-read';
    if (reading?.status === 'okumadım') return 'is-missed';
    return cetele().getEntry(userId, date) ? 'is-filled' : 'is-empty';
  }

  // ---- Taslak (kaydedilmemiş değişiklikler) ---------------------------------------

  const isBlank = value => value === undefined || value === null;

  // Kayıtlı değerlerin üzerine o günün taslağı uygulanır; taslakta null = alan temizlendi.
  function displayValues(form, date) {
    const values = { ...cetele().valuesFor(form.userId, date) };
    const draft = form.drafts.get(date);
    if (draft) {
      Object.entries(draft).forEach(([key, value]) => {
        if (value === null) delete values[key];
        else values[key] = value;
      });
    }
    return values;
  }

  function isDirty(form) {
    return Boolean(form.drafts.get(form.date));
  }

  // Taslağa yalnız kayıtlı değerden farklı değişiklikler yazılır.
  function setDraft(form, field, value) {
    const saved = cetele().valuesFor(form.userId, form.date)[field.key];
    const draft = { ...(form.drafts.get(form.date) || {}) };
    if (value === saved || (value === null && isBlank(saved))) delete draft[field.key];
    else draft[field.key] = value;
    if (Object.keys(draft).length) form.drafts.set(form.date, draft);
    else form.drafts.delete(form.date);
  }

  // Gün için en az bir değer varsa zorunlu alanların hepsi dolu olmalı (sunucuyla aynı kural).
  function missingRequired(values) {
    const fields = cetele().activeFields();
    if (!fields.some(field => !isBlank(values[field.key]))) return [];
    return fields.filter(field => field.required && isBlank(values[field.key]));
  }

  // Zincir şeridi: haftalık sayfalar, yatay kaydırılır (en yeni hafta sağda, açılışta seçili güne gelinir).
  // Okunan gün yeşil kutu + onay, bugün kalın, gelecek günler soluk; yalnız düzenlenebilen geçmiş günler
  // ve bugün seçilebilir.
  function weekOf(date) {
    const offset = (metrics().parseKey(date).getDay() + 6) % 7;
    const start = metrics().addDays(date, -offset);
    return Array.from({ length: 7 }, (_, index) => metrics().addDays(start, index));
  }

  // Düzenlenebilir günü olmayan eski haftalar gösterilmez (ör. üyeler yalnız dünü düzenleyebiliyorsa tek hafta kalır).
  function weekPages() {
    const today = metrics().todayKey();
    const currentStart = weekOf(today)[0];
    const pages = [];
    for (let back = WEEKS_BACK; back >= 0; back--) {
      const start = metrics().addDays(currentStart, -7 * back);
      pages.push(Array.from({ length: 7 }, (_, index) => metrics().addDays(start, index)));
    }
    return pages.filter((days, index) => index === pages.length - 1 || days.some(date => date <= today && isEditable(date)));
  }

  function isOwnForm(form) {
    const me = currentUser();
    return Boolean(me && String(me.userId) === form.userId && !form.root.classList.contains('ok-entry-sheet'));
  }

  // Görünen haftanın başlığı: "23 – 29 Kasım 2026" (ay ya da yıl değişiyorsa iki ucu da yazılır).
  function weekHeadText(days) {
    const first = metrics().parseKey(days[0]);
    const last = metrics().parseKey(days[6]);
    const months = metrics().MONTH_NAMES;
    const short = date => `${date.getDate()} ${months[date.getMonth()].slice(0, 3)}`;
    if (first.getFullYear() !== last.getFullYear()) return `${short(first)} ${first.getFullYear()} – ${short(last)} ${last.getFullYear()}`;
    if (first.getMonth() !== last.getMonth()) return `${short(first)} – ${short(last)} ${last.getFullYear()}`;
    return `${first.getDate()} – ${last.getDate()} ${months[last.getMonth()]} ${last.getFullYear()}`;
  }

  function weekHeadMarkup(days) {
    const current = days.includes(metrics().todayKey());
    return `${current ? '<small>Bu hafta</small>' : ''}<strong>${esc(weekHeadText(days))}</strong>`;
  }

  // Alt satır görünen haftayı anlatır: bu haftaysa "Bu hafta", değilse tarih aralığı.
  function weekSummaryText(form, days) {
    const count = days.filter(date => cetele().readingOf(form.userId, date)?.status === 'okudum').length;
    const own = isOwnForm(form);
    const label = days.includes(metrics().todayKey()) ? 'Bu hafta' : 'O hafta';
    if (!count) {
      if (!days.includes(metrics().todayKey())) return `${label} okuma yok`;
      return own ? 'Bu hafta henüz okumadınız' : 'Bu hafta henüz okumadı';
    }
    return own ? `${label} ${count} gün okudunuz` : `${label} ${count} gün okudu`;
  }

  // Şu an ekranda görünen hafta (kaydırıldıysa o); görünmüyorsa seçili günün haftası.
  function visibleWeek(form) {
    const strip = form.root.querySelector('.ok-days');
    if (strip && strip.clientWidth) {
      const page = strip.children[Math.round(strip.scrollLeft / strip.clientWidth)];
      if (page && page.dataset.start) return weekOf(page.dataset.start);
    }
    return weekOf(form.date);
  }

  // Başlık, alt satır ve ok düğmeleri görünen haftaya göre güncellenir.
  function syncWeekView(form) {
    const root = form.root;
    const days = visibleWeek(form);
    const title = root.querySelector('[data-slot="week-title"]');
    if (title) title.innerHTML = weekHeadMarkup(days);
    const week = root.querySelector('[data-slot="week"]');
    if (week) week.textContent = weekSummaryText(form, days);
    const strip = root.querySelector('.ok-days');
    if (!strip || !strip.clientWidth) return;
    const prev = root.querySelector('[data-action="week-prev"]');
    const next = root.querySelector('[data-action="week-next"]');
    if (prev) prev.disabled = strip.scrollLeft <= 1;
    if (next) next.disabled = strip.scrollLeft >= strip.scrollWidth - strip.clientWidth - 1;
  }

  function scrollToSelectedWeek(form) {
    const strip = form.root.querySelector('.ok-days');
    if (!strip) return;
    if (!strip.clientWidth) {
      // Bölüm gizliyken ölçü alınamaz; görünür olunca syncForm yeniden dener.
      form.pendingWeekScroll = true;
      return;
    }
    const page = strip.querySelector('.ok-day.is-selected')?.closest('.ok-week') || strip.lastElementChild;
    if (page) strip.scrollLeft = page.offsetLeft;
    form.pendingWeekScroll = false;
  }

  function dayStateMarkup(form) {
    const reading = cetele().readingOf(form.userId, form.date);
    if (reading?.status === 'okudum') return '<span class="is-read"><i class="fa-regular fa-circle-check" aria-hidden="true"></i> Okudum</span>';
    if (reading?.status === 'okumadım') return `<span class="is-missed"><i class="fa-regular fa-circle-xmark" aria-hidden="true"></i> ${esc(zeroChoiceLabel(cetele().readField()))}</span>`;
    return '';
  }

  function daysMarkup(form) {
    const today = metrics().todayKey();
    return `
      <div class="ok-week-head">
        <button type="button" class="ok-week-nav" data-action="week-prev" aria-label="Önceki hafta"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
        <span class="ok-week-title" data-slot="week-title" aria-live="polite">${weekHeadMarkup(weekOf(form.date))}</span>
        <button type="button" class="ok-week-nav" data-action="week-next" aria-label="Sonraki hafta"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
      </div>
      <div class="ok-days" role="group" aria-label="Gün seç">
        ${weekPages().map(days => `
          <div class="ok-week" data-start="${days[0]}">
            ${days.map(date => {
              const parsed = metrics().parseKey(date);
              const selected = date === form.date;
              const future = date > today;
              const selectable = !future && isEditable(date);
              return `
                <button type="button" class="ok-day ${dayState(form.userId, date)}${selected ? ' is-selected' : ''}${date === today ? ' is-today' : ''}${future ? ' is-future' : ''}" data-date="${date}" aria-pressed="${selected}" aria-label="${esc(dateTitle(date))}"${selectable ? '' : ' disabled'}>
                  <span class="ok-day-name">${WEEKDAY_SHORT[parsed.getDay()]}</span>
                  <span class="ok-day-box">
                    <span class="ok-day-num">${parsed.getDate()}</span>
                    <i class="fa-solid fa-check ok-day-check" aria-hidden="true"></i>
                    <span class="ok-day-dot" aria-hidden="true"></span>
                  </span>
                </button>`;
            }).join('')}
          </div>`).join('')}
      </div>
      <div class="ok-week-foot">
        <span class="ok-week-text" data-slot="week">${esc(weekSummaryText(form, weekOf(form.date)))}</span>
        <span class="ok-week-state" data-slot="day-state" aria-live="polite">${dayStateMarkup(form)}</span>
      </div>`;
  }

  // Okuma alanında 0 değeri "Okumadım" demektir (okuma durumu 'okumadım').
  function isReadField(field) {
    return field.key === cetele().readField()?.key;
  }

  // 0 değerli "yapmadım" seçeneğinin adı: yöneticinin verdiği ad. Okuma alanında boşsa "Okumadım" olur
  // (her zaman vardır); diğer alanlarda boşsa seçenek yoktur ('').
  function zeroChoiceLabel(field) {
    const label = String(field.zeroLabel || '');
    return isReadField(field) ? label || 'Okumadım' : label;
  }

  function fieldValueText(field, value) {
    if (value === undefined || value === null) return esc(field.unit);
    return value === 0 && zeroChoiceLabel(field) ? esc(zeroChoiceLabel(field)) : withUnit(value, field.unit);
  }

  function requiredMark(field) {
    return field.required ? '<span class="ct-required" title="Zorunlu alışkanlık" aria-hidden="true">*</span><span class="ct-sr-only"> (zorunlu)</span>' : '';
  }

  function numberFieldMarkup(form, field, value) {
    const hasValue = value !== undefined && value !== null;
    const zeroLabel = zeroChoiceLabel(field);
    const isCustomValue = hasValue && !field.options.includes(value) && !(zeroLabel && value === 0);
    const unreadChip = zeroLabel
      ? `<button type="button" class="ct-chip ct-chip-unread${value === 0 ? ' is-selected' : ''}" role="radio"
          aria-checked="${value === 0}" data-value="0">${esc(zeroLabel)}</button>`
      : '';
    // Hızlı seçimlerde 0 yazılmışsa ve "yapmadım" adı da varsa aynı hap iki kez çıkmasın.
    const chips = field.options.filter(option => !(option === 0 && zeroLabel)).map(option => `
      <button type="button" class="ct-chip${hasValue && value === option ? ' is-selected' : ''}" role="radio"
        aria-checked="${hasValue && value === option}" data-value="${option}">${formatNumber(option)}</button>`).join('') + unreadChip;
    const customChip = isCustomValue
      ? `<button type="button" class="ct-chip is-selected" role="radio" aria-checked="true" data-value="${value}">${formatNumber(value)}</button>`
      : '';
    const customEditor = field.allowCustom
      ? (form.openCustom.has(field.key)
        ? `<span class="ct-custom">
            <input type="number" inputmode="decimal" min="0" max="${field.max}" step="${field.step}"
              aria-label="${esc(field.label)} için değer" data-custom-input placeholder="${esc(field.unit || 'değer')}">
            <button type="button" class="ct-chip ct-chip-ok" data-action="custom-ok">Tamam</button>
          </span>`
        : '<button type="button" class="ct-chip ct-chip-add" data-action="custom" aria-label="Başka değer gir"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>')
      : '';
    return `
      <div class="ct-field${form.invalid?.has(field.key) && !hasValue ? ' is-invalid' : ''}" data-key="${esc(field.key)}">
        <div class="ct-field-head">
          <span class="ct-field-label">${esc(field.label)}${requiredMark(field)}</span>
          <span class="ct-field-value">${fieldValueText(field, value)}</span>
        </div>
        <div class="ct-chips" role="radiogroup" aria-label="${esc(field.label)}"${field.required ? ' aria-required="true"' : ''}>${chips}${customChip}${customEditor}</div>
      </div>`;
  }

  function extraTextMarkup(form, field, value) {
    const id = `okText-${form.userId}-${field.key}`;
    return `
      <div class="ct-field ct-field-text${form.invalid?.has(field.key) && !value ? ' is-invalid' : ''}" data-key="${esc(field.key)}">
        <label class="ct-field-label" for="${esc(id)}">${esc(field.label)}${requiredMark(field)}</label>
        <textarea id="${esc(id)}" rows="2" maxlength="280" data-text-input${field.required ? ' aria-required="true"' : ''} placeholder="Kısa not">${esc(value || '')}</textarea>
      </div>`;
  }

  function statusMarkup(form) {
    const status = cetele().saveStateFor(form.userId, form.date);
    if (isDirty(form)) return '<span class="ok-entry-state is-dirty">Kaydedilmedi</span>';
    if (status === 'saving' || status === 'pending') return '<span class="ok-entry-state">Kaydediliyor…</span>';
    if (status === 'saved') return '<span class="ok-entry-state is-saved"><i class="fa-solid fa-check" aria-hidden="true"></i> Kaydedildi</span>';
    if (status === 'error') return '<button type="button" class="ok-entry-state is-error" data-action="retry">Kaydedilemedi · Tekrar dene</button>';
    return '';
  }

  function renderForm(form, options = {}) {
    const fields = cetele().activeFields();
    const date = activeDate(form);
    const signature = [
      window.groupid, form.userId, greetingName(form), greetingName(form) ? profileDetails(form).avatar : '', date, metrics().todayKey(), editableDays().join(','), weekPages().map(days => days[0]).join(','),
      fields.map(field => `${field.key}:${field.label}:${field.unit}:${field.options.join(',')}:${field.zeroLabel || ''}:${field.max}:${field.required ? 1 : 0}`).join(';'),
      [...form.openCustom].join(','),
      cetele().loaded
    ].join('|');
    if (!options.force && form.signature === signature) {
      syncForm(form);
      if (form.signature === signature) return;
    }
    const values = displayValues(form, date);
    const name = greetingName(form);
    form.root.innerHTML = `
      ${name ? profileHeaderMarkup(form, name) : ''}
      <div class="ok-entry-head">
        <span class="ok-entry-status" data-slot="status" aria-live="polite">${statusMarkup(form)}</span>
      </div>
      ${daysMarkup(form)}
      <div class="ok-extras">
        ${fields.map((field, index) => `${index === 1 && !cetele().loaded ? '<p class="ct-loading">Diğer alışkanlıklar yükleniyor…</p>' : ''}${field.type === 'metin'
          ? extraTextMarkup(form, field, values[field.key])
          : numberFieldMarkup(form, field, values[field.key])}`).join('')}
      </div>
      <div class="ok-entry-actions">
        <button type="button" class="ok-btn ok-btn-ghost" data-action="clear"><i class="fa-solid fa-eraser" aria-hidden="true"></i> Temizle</button>
        <button type="button" class="ok-btn ok-btn-primary" data-action="save"><i class="fa-solid fa-check" aria-hidden="true"></i> Kaydet</button>
      </div>`;
    form.signature = signature;
    // Gün değiştiğinde form baştan kurulur; içerik hafifçe belirerek gelir (ilk çizimde animasyon yok).
    if (form.renderedDate && form.renderedDate !== date) {
      form.root.querySelectorAll('.ok-extras, .ok-entry-head, .ok-week-foot').forEach(element => {
        element.classList.add('is-switching');
        element.addEventListener('animationend', () => element.classList.remove('is-switching'), { once: true });
      });
    }
    form.renderedDate = date;
    const strip = form.root.querySelector('.ok-days');
    if (strip) {
      let frame = 0;
      strip.addEventListener('scroll', () => {
        window.cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(() => syncWeekView(form));
      }, { passive: true });
    }
    scrollToSelectedWeek(form);
    syncForm(form);
  }

  // Aynı gün içindeki değişikliklerde yalnız değerler güncellenir (yazarken odak kaybolmasın).
  function syncForm(form) {
    const root = form.root;
    if (form.pendingWeekScroll) scrollToSelectedWeek(form);
    const values = displayValues(form, form.date);
    const reading = cetele().readingOf(form.userId, form.date);
    const dirty = isDirty(form);
    const saving = ['saving', 'pending'].includes(cetele().saveStateFor(form.userId, form.date));
    const area = root.querySelector('.ok-extras');
    if (area) {
      // Yeşil/kırmızı zemin yalnız kaydedilmiş okuma durumunu gösterir; taslak anında renklendirmez.
      area.classList.toggle('is-read', reading?.status === 'okudum');
      area.classList.toggle('is-missed', reading?.status === 'okumadım');
    }
    const streakSlot = root.querySelector('[data-slot="streak"]');
    if (streakSlot) {
      const badge = streakBadgeMarkup(form);
      if (streakSlot.innerHTML !== badge) {
        const hadBadge = Boolean(streakSlot.firstElementChild);
        streakSlot.innerHTML = badge;
        if (hadBadge) streakSlot.firstElementChild?.classList.add('is-new');
      }
    }
    const subSlot = root.querySelector('[data-slot="profile-sub"]');
    if (subSlot) {
      const subtitle = profileDetails(form).subtitle;
      if (subSlot.textContent !== subtitle) subSlot.textContent = subtitle;
    }
    const saveButton = root.querySelector('[data-action="save"]');
    if (saveButton) saveButton.disabled = !dirty || saving;
    const clearButton = root.querySelector('[data-action="clear"]');
    if (clearButton) clearButton.disabled = saving || !Object.keys(values).length;
    root.querySelectorAll('.ok-day[data-date]').forEach(day => {
      day.classList.remove('is-read', 'is-missed', 'is-filled', 'is-empty');
      day.classList.add(dayState(form.userId, day.dataset.date));
    });
    root.querySelectorAll('.ct-field').forEach(fieldElement => {
      const field = cetele().activeFields().find(item => item.key === fieldElement.dataset.key);
      if (!field) return;
      fieldElement.classList.toggle('is-invalid', Boolean(form.invalid?.has(field.key)) && isBlank(values[field.key]));
      if (field.type !== 'sayi') return;
      const fieldValue = values[field.key];
      const hasValue = fieldValue !== undefined && fieldValue !== null;
      const chipValues = Array.from(fieldElement.querySelectorAll('.ct-chip[data-value]')).map(chip => Number(chip.dataset.value));
      if (hasValue && !chipValues.includes(fieldValue)) {
        form.signature = '';
        return;
      }
      fieldElement.querySelectorAll('.ct-chip[data-value]').forEach(chip => {
        const selected = hasValue && Number(chip.dataset.value) === fieldValue;
        chip.classList.toggle('is-selected', selected);
        chip.setAttribute('aria-checked', String(selected));
      });
      const label = fieldElement.querySelector('.ct-field-value');
      if (label) label.innerHTML = fieldValueText(field, fieldValue);
    });
    const status = root.querySelector('[data-slot="status"]');
    if (status) {
      const statusHtml = statusMarkup(form);
      // Aynı içerikle yeniden yazılırsa rozet animasyonu her çağrıda yeniden oynamasın.
      if (status.dataset.state !== statusHtml) {
        status.dataset.state = statusHtml;
        status.innerHTML = statusHtml;
      }
    }
    syncWeekView(form);
    const dayStatus = root.querySelector('[data-slot="day-state"]');
    if (dayStatus) {
      const dayHtml = dayStateMarkup(form);
      if (dayStatus.dataset.state !== dayHtml) {
        dayStatus.dataset.state = dayHtml;
        dayStatus.innerHTML = dayHtml;
      }
    }
  }

  function setNumberField(form, field, value) {
    if (!canWrite(form.date)) return;
    setDraft(form, field, value);
    renderForm(form);
  }

  // Taslaktaki tüm değişiklikleri tek seferde yazar; okuma alanı ilk kez dolarsa kutlama tetiklenir.
  function saveForm(form) {
    const date = form.date;
    const draft = form.drafts.get(date);
    if (!draft || !canWrite(date)) return;
    if (!cetele().loaded) {
      window.showNotification?.('Günlük alışkanlıklar yükleniyor, birazdan tekrar deneyin', 'error');
      return;
    }
    const missing = missingRequired(displayValues(form, date));
    if (missing.length) {
      form.invalid = new Set(missing.map(field => field.key));
      renderForm(form, { force: true });
      window.showNotification?.(`Zorunlu alışkanlıkları doldurun: ${missing.map(field => field.label).join(', ')}`, 'error');
      form.root.querySelector('.ct-field.is-invalid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const before = beforeChange(form);
    const readKey = cetele().readField().key;
    const changes = { ...draft };
    form.drafts.delete(date);
    form.invalid = null;
    form.openCustom.clear();
    void cetele().setValues(form.userId, date, changes);
    if (changes[readKey] > 0) celebrate(form, before, date);
    renderForm(form, { force: true });
  }

  function clearForm(form) {
    if (!canWrite(form.date)) return;
    cetele().activeFields().forEach(field => setDraft(form, field, null));
    form.invalid = null;
    form.openCustom.clear();
    renderForm(form, { force: true });
  }

  function handleClick(form, event) {
    if (!form) return;
    const target = event.target.closest('button');
    if (!target || !form.root.contains(target)) return;
    if (target.dataset.date) {
      form.date = target.dataset.date;
      form.openCustom.clear();
      renderForm(form, { force: true });
      return;
    }
    const action = target.dataset.action;
    if (action === 'open-profile') {
      window.showAdminInfoPanel?.();
      return;
    }
    if (action === 'week-prev' || action === 'week-next') {
      const strip = form.root.querySelector('.ok-days');
      if (strip) strip.scrollBy({ left: (action === 'week-next' ? 1 : -1) * strip.clientWidth, behavior: 'smooth' });
      return;
    }
    if (action === 'retry') {
      cetele().retry(form.userId, form.date);
      return;
    }
    if (action === 'save') {
      saveForm(form);
      return;
    }
    if (action === 'clear') {
      clearForm(form);
      return;
    }
    const fieldElement = target.closest('.ct-field');
    const field = fieldElement && cetele().activeFields().find(item => item.key === fieldElement.dataset.key);
    if (!field) return;
    if (target.dataset.value !== undefined) {
      const value = Number(target.dataset.value);
      const current = displayValues(form, form.date)[field.key];
      // Seçili hapa yeniden dokunmak alanı boşaltır.
      setNumberField(form, field, current === value ? null : value);
    } else if (action === 'custom') {
      form.openCustom.add(field.key);
      renderForm(form, { force: true });
      form.root.querySelector(`.ct-field[data-key="${CSS.escape(field.key)}"] [data-custom-input]`)?.focus();
    } else if (action === 'custom-ok') {
      commitCustom(form, field, fieldElement.querySelector('[data-custom-input]'));
    }
  }

  function commitCustom(form, field, input) {
    const raw = String(input?.value || '').replace(',', '.').trim();
    form.openCustom.delete(field.key);
    if (raw !== '') {
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > field.max || !isOnStep(value, field.step)) {
        window.showNotification?.(`${field.label} için 0–${formatNumber(field.max)} arasında geçerli bir değer girin`, 'error');
        form.openCustom.add(field.key);
        return;
      }
      setNumberField(form, field, value);
    }
    renderForm(form, { force: true });
  }

  function handleInput(form, event) {
    if (!form) return;
    const target = event.target;
    if (target.matches('[data-text-input]')) {
      const fieldElement = target.closest('.ct-field');
      const field = fieldElement && cetele().activeFields().find(item => item.key === fieldElement.dataset.key);
      if (!field || !canWrite(form.date)) return;
      setDraft(form, field, target.value.trim() ? target.value.trim() : null);
      syncForm(form);
    }
  }

  function handleKeydown(form, event) {
    if (!form) return;
    const target = event.target;
    if (!target.matches('[data-custom-input]')) return;
    const fieldElement = target.closest('.ct-field');
    const field = fieldElement && cetele().activeFields().find(item => item.key === fieldElement.dataset.key);
    if (!field) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      commitCustom(form, field, target);
    } else if (event.key === 'Escape') {
      form.openCustom.delete(field.key);
      renderForm(form, { force: true });
    }
  }

  // Yönetici bir üyenin gününü alttan açılan panelde doldurur.
  function openMemberEntry(userId, date) {
    const member = store()?.getUserById(userId);
    if (!member || !window.RoTaKipBottomSheet) return;
    const content = document.createElement('div');
    content.className = 'ok-entry ok-entry-sheet';
    const form = formFor(content, userId);
    if (date) form.date = date;
    const sheet = window.RoTaKipBottomSheet.open({
      title: member.name,
      subtitle: 'Günlük kayıt',
      className: 'ok-sheet',
      content,
      onClose: () => sheetForms.delete(form)
    });
    sheetForms.add(form);
    renderForm(form, { force: true });
    if (!cetele().loaded) cetele().load().catch(() => {});
    return sheet;
  }

  window.openOkumalarMemberEntry = function openOkumalarMemberEntry(userId, date) {
    if (isAdmin()) openMemberEntry(userId, date);
  };

  // İstatistik takviminden bir güne dokunulduğunda.
  window.openOkumalarDaySheet = function openOkumalarDaySheet(date, options = {}) {
    const me = currentUser();
    if (!me) return;
    const userId = options.userId != null ? String(options.userId) : String(me.userId);
    if (userId !== String(me.userId)) {
      if (!isAdmin()) return;
      if (!isSelectableDay(date)) {
        window.showNotification?.('Bu günün kaydı buradan açılamıyor', 'info');
        return;
      }
      openMemberEntry(userId, date);
      return;
    }
    const root = document.getElementById('okumalarEntry');
    if (!root) return;
    window.RoTaKipOkumalarSections?.open('bugun');
    const form = formFor(root, userId);
    if (!isSelectableDay(date)) {
      window.showNotification?.('Bu günün kaydı buradan açılamıyor', 'info');
      return;
    }
    form.date = date;
    form.openCustom.clear();
    renderForm(form, { force: true });
    root.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ---- Özetim --------------------------------------------------------------------

  function chartMarkup(userId, unit) {
    const today = metrics().todayKey();
    const days = [];
    for (let offset = CHART_DAYS - 1; offset >= 0; offset--) days.push(metrics().addDays(today, -offset));
    const readings = days.map(date => cetele().readingOf(userId, date));
    const amounts = readings.map(reading => (reading?.status === 'okudum' ? reading.amount : null));
    const max = Math.max(1, ...amounts.filter(Number.isFinite));
    const total = amounts.reduce((sum, amount) => sum + (Number.isFinite(amount) ? amount : 0), 0);
    const readDays = readings.filter(reading => reading?.status === 'okudum').length;
    const width = 300;
    const height = 84;
    const gap = 2;
    const barWidth = (width - gap * (CHART_DAYS - 1)) / CHART_DAYS;
    const bars = readings.map((reading, index) => {
      const x = (index * (barWidth + gap)).toFixed(2);
      if (reading?.status === 'okudum') {
        const amount = amounts[index];
        const barHeight = Number.isFinite(amount) ? Math.max(4, (amount / max) * (height - 6)) : height * 0.3;
        const kind = Number.isFinite(amount) ? 'is-read' : 'is-read-plain';
        return `<rect class="ok-spark-bar ${kind}" x="${x}" y="${(height - barHeight).toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" rx="2"><title>${esc(dateTitle(days[index]))}: ${Number.isFinite(amount) ? withUnit(amount, unit) : 'okudu'}</title></rect>`;
      }
      if (reading?.status === 'okumadım') {
        return `<rect class="ok-spark-bar is-missed" x="${x}" y="${height - 4}" width="${barWidth.toFixed(2)}" height="4" rx="2"><title>${esc(dateTitle(days[index]))}: okumadı</title></rect>`;
      }
      return `<rect class="ok-spark-bar is-empty" x="${x}" y="${height - 2}" width="${barWidth.toFixed(2)}" height="2" rx="1"></rect>`;
    }).join('');
    const first = metrics().parseKey(days[0]);
    return `
      <figure class="ok-spark">
        <figcaption class="ok-spark-head">
          <span>Son 30 gün</span>
          <strong>${readDays} gün${total > 0 ? ` · ${withUnit(total, unit)}` : ''}</strong>
        </figcaption>
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Son 30 günde ${readDays} gün okundu${total > 0 ? `, toplam ${formatNumber(total)} ${esc(unit)}` : ''}">${bars}</svg>
        <div class="ok-spark-axis" aria-hidden="true"><span>${first.getDate()} ${metrics().MONTH_NAMES[first.getMonth()].slice(0, 3)}</span><span>Bugün</span></div>
      </figure>`;
  }

  function renderMine(card, user) {
    const records = recordsOf(user.userId);
    const read = cetele().readField();
    const total = metrics().totalReadDays(records);
    const month = metrics().monthSummary(records);
    const totalAmount = metrics().totalAmount(records);
    const progress = metrics().leagueProgress(total);
    const caption = progress && progress.next
      ? `${esc(progress.next.name)} ligine <strong>${progress.remaining}</strong> gün`
      : 'En üst ligdesin, maşallah!';
    card.innerHTML = `
      <div class="ok-card-head">
        <h3 class="ok-card-title">İstatistiklerim</h3>
      </div>
      <div class="ok-stats">
        <div class="ok-stat"><span class="ok-stat-label">Bu ay</span><strong class="ok-stat-value">${formatNumber(month.days)}<small> gün</small></strong>${month.amount > 0 ? `<span class="ok-stat-sub">${withUnit(month.amount, read.unit)}</span>` : ''}</div>
        <div class="ok-stat"><span class="ok-stat-label">Toplam</span><strong class="ok-stat-value">${formatNumber(total)}<small> gün</small></strong>${totalAmount > 0 ? `<span class="ok-stat-sub">${withUnit(totalAmount, read.unit)}</span>` : ''}</div>
      </div>
      ${progress ? `
        <button type="button" class="ok-league-row" data-action="ladder" aria-label="Ligleri göster">
          <img src="/images/${esc(progress.current.img)}" alt="" width="44" height="44">
          <span class="ok-league-row-text">
            <span class="ok-league-row-name">${esc(progress.current.name)} ligi</span>
            <span class="ok-bar ok-bar-thin" aria-hidden="true"><span class="ok-bar-fill" style="width: ${progress.percent.toFixed(1)}%; background: ${esc(progress.current.bg)};"></span></span>
            <small>${caption}</small>
          </span>
          <i class="fa-solid fa-chevron-right ok-league-row-chevron" aria-hidden="true"></i>
        </button>` : ''}
      ${chartMarkup(user.userId, read.unit)}
      ${dailyExtrasMarkup()}`;
    card.querySelector('[data-action="ladder"]')?.addEventListener('click', () => openLadderSheet(total));
    card.querySelector('[data-daily="gift"]')?.addEventListener('click', () => window.openDailyGift?.());
    card.querySelector('[data-daily="video"]')?.addEventListener('click', openDailyVideo);
  }

  // Günün hediyesi (Esmaül Hüsna) ve Günün videosu: Özetim'in altında iki küçük düğme.
  function dailyExtrasMarkup() {
    const tasks = window.RoTaKipDailyTasks ? window.RoTaKipDailyTasks.get() : {};
    const button = (key, icon, label, done) => `
      <button type="button" class="ok-daily${done ? ' is-done' : ''}" data-daily="${key}">
        <i class="${done ? 'fa-solid fa-check' : icon}" aria-hidden="true"></i><span>${label}</span>
      </button>`;
    return `
      <div class="ok-daily-row">
        ${typeof window.openDailyGift === 'function' ? button('gift', 'fa-solid fa-gift', 'Günün hediyesi', tasks.gift) : ''}
        ${button('video', 'fa-solid fa-circle-play', 'Günün videosu', tasks.video)}
      </div>`;
  }

  function openDailyVideo() {
    window.RoTaKipDailyTasks?.set('video', true);
    const target = window.currentVideoData && window.currentVideoData.url;
    let path = '/videolar';
    try {
      if (target) {
        const url = new URL(target, window.location.origin);
        if (url.origin === window.location.origin) path = `${url.pathname}${url.search}`;
      }
    } catch (_error) { /* geçersiz adres: Videolar ana sayfası */ }
    window.navigateRoTaKip?.(path);
  }

  // total === null: giriş yapmamış ziyaretçi; hiçbir kademe "şu an" ya da geçilmiş sayılmaz.
  function openLadderSheet(total) {
    if (!window.RoTaKipBottomSheet) return;
    const leagues = Array.isArray(window.ROTAKIP_LEAGUES) ? window.ROTAKIP_LEAGUES : [];
    const current = total === null ? null : metrics().leagueFor(total);
    const read = cetele().readField();
    const content = document.createElement('div');
    content.className = 'ok-ladder';
    content.innerHTML = `
      <p class="ok-ladder-intro"><strong>${esc(read.label)}</strong> alışkanlığını doldurduğun her gün bir okuma günü sayılır. Toplam okuma günün arttıkça üst liglere yükselirsin; ligin hiç düşmez.</p>
      <ol class="ok-ladder-list">
        ${leagues.map((league, index) => {
          const isCurrent = current && league.name === current.name;
          const isPassed = total !== null && total >= league.max && !isCurrent;
          const isLast = index === leagues.length - 1;
          const range = isLast ? `${league.min}+ gün` : `${league.min}–${league.max - 1} gün`;
          return `
            <li class="ok-ladder-item${isCurrent ? ' is-current' : ''}${isPassed ? ' is-passed' : ''}">
              <span class="ok-ladder-step" aria-hidden="true">${isPassed ? '<i class="fa-solid fa-check"></i>' : index + 1}</span>
              <img src="/images/${esc(league.img)}" alt="" width="40" height="40">
              <span class="ok-ladder-name">${esc(league.name)}</span>
              <span class="ok-ladder-range">${isCurrent ? '<em>Şu an</em> · ' : ''}${range}</span>
            </li>`;
        }).join('')}
      </ol>`;
    window.RoTaKipBottomSheet.open({
      title: 'Ligler',
      subtitle: current ? `${current.name} · ${formatNumber(total)} okuma günü` : 'Ligler',
      className: 'ok-sheet',
      content
    });
  }
  window.openOkumalarLadderSheet = () => {
    const user = currentUser();
    openLadderSheet(user ? metrics().totalReadDays(recordsOf(user.userId)) : null);
  };

  // ---- Ana çizim -----------------------------------------------------------------

  function renderToday() {
    const section = document.getElementById('okumalarBolumBugun');
    if (!section || !metrics() || !store() || !cetele()) return;
    const user = currentUser();
    const entry = document.getElementById('okumalarEntry');
    const mine = document.getElementById('okumalarMine');
    if (entry) entry.hidden = !user;
    if (mine) mine.hidden = !user;
    if (user) {
      if (!cetele().loaded) cetele().load().catch(() => {});
      if (entry) renderForm(formFor(entry, user.userId));
      if (mine) renderMine(mine, user);
    }
    sheetForms.forEach(form => renderForm(form));
  }

  window.renderOkumalarToday = renderToday;
  window.addEventListener('rotakip:cetele-changed', () => renderToday());
  window.addEventListener('rotakip:amount-type-changed', () => renderToday());
  window.addEventListener('rotakip:reading-edit-policy-changed', () => renderToday());
  window.addEventListener('rotakip:daily-tasks-changed', () => renderToday());
})();
