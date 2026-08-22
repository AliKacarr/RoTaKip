/**
 * Okuma düzenleme modları: none | status | amount
 * Durum: ➖→✔→✖ döngüsü
 * Miktar: tıklanınca hemen okudum (✔); sayı+Enter → "10 ✔"
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
    status: 'Durumu değiştirmek için hücreye tıklayın: ➖ → ✔ → ✖',
    amount: 'Miktar eklemek için hücreye tıklayın, sayıyı yazıp Enter’a basın.'
  };

  function $(id) {
    return document.getElementById(id);
  }

  function updateHint() {
    var hint = $('readingEditModeHint');
    if (hint) hint.innerHTML = HINTS[window.readingEditMode] || HINTS.none;
  }

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

  function cancelAmountCellEdit() {
    if (!amountEditState || !amountEditState.cell) {
      amountEditState = null;
      return;
    }
    var cell = amountEditState.cell;
    // Tıklamada okudum yazıldı; Escape sadece miktar girişini iptal eder, ✔ kalır
    cell.classList.remove('amount-editing', 'red', 'empty');
    cell.classList.add('green');
    cell.textContent = '✔';
    amountEditState = null;
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
      var newStreak = calculateStreakFromCache(userId);
      var lastTd = rowEl.querySelector('td:last-child');
      if (!lastTd) return;
      lastTd.innerHTML =
        newStreak > 0 ? '<span class="weekly-fire-emoji">⭐</span> ' + newStreak : '-';
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

  async function commitAmountCellEdit() {
    if (!amountEditState) return;
    var state = amountEditState;
    var buffer = String(state.buffer || '').trim();
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

    amountEditState = null;
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

  function updateEditingCellPreview() {
    if (!amountEditState || !amountEditState.cell) return;
    var buf = amountEditState.buffer;
    var cell = amountEditState.cell;
    cell.classList.add('green');
    cell.classList.remove('red', 'empty');
    // Tıklanınca "..."; yazarken "5 ..."; Enter sonrası "10 ✔"
    cell.textContent = buf.length ? buf + ' ...' : '...';
  }

  window.beginAmountCellEdit = async function beginAmountCellEdit(userId, date, cell) {
    if (!cell) return;
    if (cell.classList.contains('future-date')) return;

    if (amountEditState) {
      if (amountEditState.cell === cell) return;
      if (amountEditState.buffer && String(amountEditState.buffer).trim()) {
        await commitAmountCellEdit();
      } else {
        cancelAmountCellEdit();
      }
    }

    var prevText = (cell.textContent || '').trim();
    amountEditState = {
      userId: userId,
      date: date,
      cell: cell,
      buffer: '',
      prevText: prevText
    };

    cell.classList.add('amount-editing', 'green');
    cell.classList.remove('red', 'empty');
    cell.textContent = '...';

    await markCellOkudumOnAmountClick(userId, date, cell, prevText);
    if (amountEditState && amountEditState.cell === cell) {
      cell.classList.add('amount-editing', 'green');
      updateEditingCellPreview();
    }
  };

  function onAmountKeydown(e) {
    if (!amountEditState) return;
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
      amountEditState.buffer = String(amountEditState.buffer || '').slice(0, -1);
      updateEditingCellPreview();
      return;
    }
    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      var next = String(amountEditState.buffer || '') + e.key;
      if (next.length > 5) return;
      if (next.length > 1 && next.startsWith('0')) {
        next = String(Number(next));
      }
      amountEditState.buffer = next;
      updateEditingCellPreview();
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
