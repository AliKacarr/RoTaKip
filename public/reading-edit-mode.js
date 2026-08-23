/**
 * Okuma düzenleme modları: none | status | amount
 * Durum: ➖→✔→✖ döngüsü
 * Miktar: tıklanınca hemen okudum (✔); hücrede sayı input’u (mobil klavye); Tamam/Enter → "10 ✔"
 */
(function () {
  window.readingEditMode = 'none';

  window.getReadingEditMode = function getReadingEditMode() {
    return window.readingEditMode || 'none';
  };

  var amountEditState = null;
  // { userId, date, cell, buffer, prevText }

  var HINTS = {
    none: 'Tabloyu düzenlemek için bir mod seçin.',
    status: 'Okuma durumunuzu değiştirmek için bir hücreye tıklayın: ➖ → ✔ → ✖',
    amount: 'Sayfa veya dakika okuma miktarınızı eklemek için bir hücreye tıklayın.'
  };

  function $(id) {
    return document.getElementById(id);
  }

  function updateHint() {
    var hint = $('readingEditModeHint');
    if (hint) hint.innerHTML = HINTS[window.readingEditMode] || HINTS.none;
  }

  var promptTimer = null;

  window.promptReadingEditMode = function promptReadingEditMode() {
    var bar = $('readingEditModeBar');
    if (!bar || bar.style.display === 'none') return;
    var segment = bar.querySelector('.reading-edit-mode-segment');

    if (segment) segment.classList.add('needs-choice');
    try {
      bar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {
      /* scroll yok */
    }

    if (promptTimer) clearTimeout(promptTimer);
    promptTimer = setTimeout(function () {
      if (segment) segment.classList.remove('needs-choice');
      promptTimer = null;
    }, 2200);
  };

  function updateSegmentButtons() {
    var statusBtn = $('readingEditModeStatus');
    var amountBtn = $('readingEditModeAmount');
    if (statusBtn) {
      statusBtn.classList.toggle('is-active', window.readingEditMode === 'status');
      statusBtn.setAttribute('aria-pressed', window.readingEditMode === 'status' ? 'true' : 'false');
    }
    if (amountBtn) {
      amountBtn.classList.toggle('is-active', window.readingEditMode === 'amount');
      amountBtn.setAttribute('aria-pressed', window.readingEditMode === 'amount' ? 'true' : 'false');
    }
    var tableArea = document.querySelector('.table-area');
    if (tableArea) {
      tableArea.setAttribute('data-reading-edit-mode', window.readingEditMode);
    }
    document.body.setAttribute('data-reading-edit-mode', window.readingEditMode);
  }

  function hideAmountOverlay() {
    var input = document.getElementById('amountEditInputOverlay');
    if (input) {
      input.value = '';
      input.style.display = 'none';
    }
    window.removeEventListener('scroll', repositionAmountOverlay, true);
    window.removeEventListener('resize', repositionAmountOverlay);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', repositionAmountOverlay);
      window.visualViewport.removeEventListener('scroll', repositionAmountOverlay);
    }
  }

  function repositionAmountOverlay() {
    if (!amountEditState || !amountEditState.cell || !amountEditState.input) return;
    var r = amountEditState.cell.getBoundingClientRect();
    var input = amountEditState.input;
    input.style.left = r.left + 'px';
    input.style.top = r.top + 'px';
    input.style.width = r.width + 'px';
    input.style.height = r.height + 'px';
  }

  function cancelAmountCellEdit() {
    if (!amountEditState || !amountEditState.cell) {
      amountEditState = null;
      hideAmountOverlay();
      return;
    }
    var cell = amountEditState.cell;
    var existingAmount = amountEditState.existingAmount;
    amountEditState = null;
    hideAmountOverlay();
    cell.classList.remove('amount-editing', 'red', 'empty');
    cell.classList.add('green');
    if (existingAmount != null) {
      refreshAmountCellDisplay(cell, existingAmount);
    } else {
      cell.textContent = '✔';
    }
  }

  function setReadingEditMode(mode) {
    var next = mode === 'status' || mode === 'amount' ? mode : 'none';
    if (window.readingEditMode === next) {
      next = 'none';
    }
    if (window.readingEditMode === 'amount' && next !== 'amount') {
      cancelAmountCellEdit();
    }
    window.readingEditMode = next;
    updateSegmentButtons();
    updateHint();
    var segment = document.querySelector('.reading-edit-mode-segment');
    if (segment) segment.classList.remove('needs-choice');
  }

  window.setReadingEditMode = setReadingEditMode;
  window.cancelAmountCellEdit = cancelAmountCellEdit;

  window.showReadingEditModeBar = function showReadingEditModeBar() {
    var bar = $('readingEditModeBar');
    if (!bar) return;
    bar.style.display = 'flex';
    bar.classList.remove('collapsed');
    setTimeout(function () {
      bar.classList.add('show');
    }, 50);
  };

  window.hideReadingEditModeBar = function hideReadingEditModeBar() {
    var bar = $('readingEditModeBar');
    cancelAmountCellEdit();
    window.readingEditMode = 'none';
    updateSegmentButtons();
    updateHint();
    if (!bar) return;
    if (bar.style.display === 'none' || !bar.classList.contains('show')) {
      bar.classList.remove('show', 'collapsed');
      bar.style.display = 'none';
      return;
    }
    bar.classList.remove('show');
    bar.classList.add('collapsed');
    setTimeout(function () {
      bar.style.display = 'none';
      bar.classList.remove('collapsed');
    }, 800);
  };

  window.syncReadingEditModeBarVisibility = function syncReadingEditModeBarVisibility() {
    var loggedIn =
      typeof LocalStorageManager !== 'undefined' && LocalStorageManager.isUserLoggedIn();
    if (!loggedIn) {
      window.hideReadingEditModeBar();
    }
  };

  function recountDayAndWeekFooters(date) {
    try {
      var statsRow = document.querySelector('#trackerTable thead .stats-footer-row');
      if (!statsRow || typeof cellTextIsOkudum !== 'function') return;
      var countsEl = statsRow.querySelector('.col-counts[data-date="' + date + '"] .col-read');
      if (countsEl) {
        var readCount = 0;
        var dates = typeof getWeekDates === 'function' ? getWeekDates(window.weekOffset || 0) : [];
        var idx = dates.indexOf(date);
        document.querySelectorAll('#trackerTable tbody tr.user-row').forEach(function (row) {
          var cells = row.querySelectorAll('td[onclick*="toggleStatus"]');
          if (idx >= 0 && cells[idx] && cellTextIsOkudum(cells[idx].textContent)) {
            readCount++;
          }
        });
        countsEl.textContent = readCount + '✔';
      }
      var totalReadEl = document.getElementById('tfoot-total-read');
      if (totalReadEl && typeof computeWeekMarkedReadFromTable === 'function') {
        var weekStats = computeWeekMarkedReadFromTable();
        totalReadEl.textContent = formatWeekReadSuccessText(weekStats.okudum, weekStats.marked);
      }
    } catch (e) {
      console.error('Footer sayaç güncellenemedi:', e);
    }
  }

  function refreshRowStreak(userId, cell) {
    try {
      var rowEl = cell && cell.closest('tr');
      if (!rowEl || typeof calculateStreakFromCache !== 'function') return;
      var lastTd = rowEl.querySelector('td:last-child');
      if (!lastTd) return;
      var oldStreakText = lastTd.textContent || lastTd.innerText;
      var oldStreak = oldStreakText === '-' ? 0 : parseInt(oldStreakText.replace('⭐', '').trim(), 10) || 0;
      var newStreak = calculateStreakFromCache(userId);
      lastTd.innerHTML =
        newStreak > 0 ? '<span class="weekly-fire-emoji">⭐</span> ' + newStreak : '-';
      if (
        newStreak > oldStreak &&
        newStreak > 0 &&
        typeof window.animateStreakIncrease === 'function'
      ) {
        window.animateStreakIncrease(lastTd, oldStreak, newStreak, cell);
      }
    } catch (e) {
      console.error('Seri güncellenemedi:', e);
    }
  }

  function refreshAmountCellDisplay(cell, amount) {
    if (!cell) return;
    cell.classList.remove('red', 'empty', 'amount-editing');
    cell.classList.add('green');
    var a =
      typeof parseFiniteAmount === 'function'
        ? parseFiniteAmount(amount)
        : Number(amount);
    if (typeof formatOkudumCellSymbol === 'function') {
      cell.textContent = formatOkudumCellSymbol(a);
    } else if (Number.isFinite(a)) {
      cell.textContent = a + ' ✔';
    } else {
      cell.textContent = '✔';
    }
  }

  /** Arka planda okudum kaydı (seri/sayaç); hücre metnini değiştirmez */
  async function markCellOkudumOnAmountClick(userId, date, cell, prevText) {
    var userInfo = LocalStorageManager.getCurrentUserInfo();
    if (!userInfo) return;

    var alreadyOkudum =
      typeof cellTextIsOkudum === 'function' ? cellTextIsOkudum(prevText) : false;

    if (typeof updateUserStatsCache === 'function') {
      updateUserStatsCache(userId, date, 'okudum');
    }

    if (!alreadyOkudum && typeof updateDateColumnCounts === 'function') {
      updateDateColumnCounts(date, prevText, 'okudum');
    } else {
      recountDayAndWeekFooters(date);
    }

    try {
      if (window.globalDataStore) {
        window.globalDataStore.applyLocalUpdate(userId, date, 'okudum');
      }
    } catch (e) {
      console.error('Global store okudum güncellenemedi:', e);
    }

    if (typeof userReadingCounts !== 'undefined' && userReadingCounts && !alreadyOkudum) {
      userReadingCounts.set(userId, (userReadingCounts.get(userId) || 0) + 1);
    }

    refreshRowStreak(userId, cell);

    if (typeof refreshAmountTotalsInTable === 'function') {
      refreshAmountTotalsInTable();
    }

    if (!alreadyOkudum) {
      if (userInfo.userId === userId && typeof window.animateStarToUserStats === 'function') {
        window.animateStarToUserStats(cell);
      }
      if (typeof updateUserStatsArea === 'function') {
        updateUserStatsArea();
      }
      if (typeof window.schedulePostToggleUiRefresh === 'function') {
        window.schedulePostToggleUiRefresh();
      }
    }

    try {
      await fetch('/api/update-status/' + window.groupid, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          date: date,
          status: 'okudum',
          requestingUserId: userInfo.userId,
          requestingUserAuthority: userInfo.userAuthority
        })
      });
    } catch (err) {
      console.error('Okudum kaydı başarısız:', err);
    }
  }

  function parseAmountFromCellText(text) {
    var t = String(text || '').trim();
    var m = t.match(/(\d+(?:[.,]\d+)?)/);
    if (!m) return null;
    if (typeof parseFiniteAmount === 'function') {
      return parseFiniteAmount(m[1]);
    }
    var n = Number(String(m[1]).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  function sanitizeAmountDigits(value) {
    var digits = String(value || '').replace(/\D/g, '').slice(0, 5);
    if (digits.length > 1 && digits.startsWith('0')) {
      digits = String(Number(digits));
    }
    return digits;
  }

  var amountOverlayBound = false;

  function getAmountOverlayInput() {
    var input = document.getElementById('amountEditInputOverlay');
    if (input) return input;
    input = document.createElement('input');
    input.id = 'amountEditInputOverlay';
    input.type = 'text';
    input.size = 1;
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('pattern', '[0-9]*');
    input.setAttribute('maxlength', '5');
    input.setAttribute('enterkeyhint', 'done');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('aria-label', 'Okuma miktarı');
    input.className = 'amount-edit-input';
    input.placeholder = '...';
    input.style.display = 'none';
    document.body.appendChild(input);

    if (!amountOverlayBound) {
      amountOverlayBound = true;
      input.addEventListener('input', function () {
        if (!amountEditState || amountEditState.input !== input) return;
        var digits = sanitizeAmountDigits(input.value);
        if (input.value !== digits) input.value = digits;
        amountEditState.buffer = digits;
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitAmountCellEdit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelAmountCellEdit();
        }
      });
      input.addEventListener('blur', function () {
        if (!amountEditState || amountEditState.input !== input) return;
        var buf = String(amountEditState.buffer || input.value || '').trim();
        if (buf) {
          commitAmountCellEdit();
        } else {
          cancelAmountCellEdit();
        }
      });
    }
    return input;
  }

  function showAmountOverlay(cell, initialDigits) {
    var input = getAmountOverlayInput();
    var start = initialDigits ? String(initialDigits) : '';
    input.value = start;
    var r = cell.getBoundingClientRect();
    input.style.left = r.left + 'px';
    input.style.top = r.top + 'px';
    input.style.width = r.width + 'px';
    input.style.height = r.height + 'px';
    input.style.display = 'block';
    if (amountEditState) {
      amountEditState.input = input;
      amountEditState.buffer = start;
    }
    window.addEventListener('scroll', repositionAmountOverlay, true);
    window.addEventListener('resize', repositionAmountOverlay);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', repositionAmountOverlay);
      window.visualViewport.addEventListener('scroll', repositionAmountOverlay);
    }
    return input;
  }

  async function commitAmountCellEdit() {
    if (!amountEditState) return;
    var state = amountEditState;
    var buffer = sanitizeAmountDigits(state.buffer || (state.input && state.input.value) || '');
    if (!buffer) {
      cancelAmountCellEdit();
      return;
    }
    var amount = Number(buffer);
    if (!Number.isFinite(amount)) {
      cancelAmountCellEdit();
      return;
    }

    var userInfo = LocalStorageManager.getCurrentUserInfo();
    if (!userInfo) {
      cancelAmountCellEdit();
      return;
    }

    var cell = state.cell;
    var userId = state.userId;
    var date = state.date;
    var existingAmount = state.existingAmount;

    amountEditState = null;
    hideAmountOverlay();
    cell.classList.remove('amount-editing');
    refreshAmountCellDisplay(cell, amount);

    try {
      if (window.globalDataStore) {
        window.globalDataStore.applyLocalUpdate(userId, date, 'okudum', amount);
      }
    } catch (e) {
      console.error('Global store amount güncellenemedi:', e);
    }

    if (typeof refreshAmountTotalsInTable === 'function') {
      refreshAmountTotalsInTable();
    }

    var amountDelta = existingAmount != null ? amount - existingAmount : amount;
    if (amountDelta > 0 && typeof window.celebrateOkudumCell === 'function') {
      window.celebrateOkudumCell(cell, { amountDelta: amountDelta });
    }

    recountDayAndWeekFooters(date);

    try {
      await fetch('/api/update-status/' + window.groupid, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          date: date,
          status: 'okudum',
          amount: amount,
          requestingUserId: userInfo.userId,
          requestingUserAuthority: userInfo.userAuthority
        })
      });
    } catch (err) {
      console.error('Amount kaydı başarısız:', err);
    }

    if (typeof updateUserStatsArea === 'function') {
      updateUserStatsArea();
    }
  }

  window.beginAmountCellEdit = async function beginAmountCellEdit(userId, date, cell) {
    if (!cell) return;
    if (cell.classList.contains('future-date')) return;

    if (amountEditState) {
      if (amountEditState.cell === cell) {
        if (amountEditState.input) {
          amountEditState.input.focus();
        }
        return;
      }
      if (amountEditState.buffer && String(amountEditState.buffer).trim()) {
        commitAmountCellEdit();
      } else {
        cancelAmountCellEdit();
      }
    }

    var prevText = (cell.textContent || '').trim();
    var alreadyOkudum =
      typeof cellTextIsOkudum === 'function' ? cellTextIsOkudum(prevText) : false;
    var existingAmount = parseAmountFromCellText(prevText);
    var startDigits = existingAmount != null ? String(existingAmount) : '';

    cell.classList.add('green');
    cell.classList.remove('red', 'empty');

    amountEditState = {
      userId: userId,
      date: date,
      cell: cell,
      buffer: startDigits,
      prevText: prevText,
      existingAmount: existingAmount,
      alreadyOkudum: alreadyOkudum,
      input: null
    };
    var input = showAmountOverlay(cell, startDigits);
    amountEditState.input = input;
    // Mobil klavye için focus tıklama jestiyle aynı anda olmalı (await öncesi)
    input.focus();
    if (existingAmount != null) {
      try {
        input.select();
      } catch (e) {
        /* select desteklenmeyebilir */
      }
    }

    if (!alreadyOkudum) {
      await markCellOkudumOnAmountClick(userId, date, cell, prevText);
    }
    if (amountEditState && amountEditState.cell === cell && amountEditState.input) {
      cell.classList.add('green');
      repositionAmountOverlay();
      try {
        amountEditState.input.focus();
        if (amountEditState.existingAmount != null) {
          amountEditState.input.select();
        }
      } catch (e) {
        /* odak kaybı sessiz */
      }
    }
  };

  function onAmountKeydown(e) {
    if (!amountEditState) return;
    if (amountEditState.input) return;
    if (window.getReadingEditMode() !== 'amount') {
      cancelAmountCellEdit();
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      cancelAmountCellEdit();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      commitAmountCellEdit();
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      amountEditState.buffer = sanitizeAmountDigits(
        String(amountEditState.buffer || '').slice(0, -1)
      );
      return;
    }
    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      amountEditState.buffer = sanitizeAmountDigits(
        String(amountEditState.buffer || '') + e.key
      );
    }
  }

  function initReadingEditModeBar() {
    var statusBtn = $('readingEditModeStatus');
    var amountBtn = $('readingEditModeAmount');
    if (statusBtn) {
      statusBtn.addEventListener('click', function () {
        setReadingEditMode('status');
      });
    }
    if (amountBtn) {
      amountBtn.addEventListener('click', function () {
        setReadingEditMode('amount');
      });
    }
    document.addEventListener('keydown', onAmountKeydown, true);
    updateSegmentButtons();
    updateHint();
    window.syncReadingEditModeBarVisibility();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReadingEditModeBar);
  } else {
    initReadingEditModeBar();
  }
})();
