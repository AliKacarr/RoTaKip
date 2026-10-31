/**
 * Okuma düzenleme modları: default | status | amount
 * Gezinme: tablo kaydırılabilir; hücre tıklamaları veri değiştirmez
 * Durum: ➖→✔→✖ döngüsü
 * Miktar: tıklanınca hemen okudum (✔); hücrede sayı input’u (mobil klavye); Tamam/Enter → "10 ✔"
 */
(function () {
  window.readingEditMode = 'default';

  window.getReadingEditMode = function getReadingEditMode() {
    return window.readingEditMode || 'default';
  };

  var amountEditState = null;
  var tableModePaintToken = 0;
  // { userId, date, cell, buffer, prevText }

  var HINTS = {
    default: 'Tabloyu incelemek için sağa veya sola kaydırın.',
    status: 'Okuma durumunuzu değiştirmek için bir hücreye tıklayın.',
    amount: 'Okuma miktarınızı eklemek için bir hücreye tıklayın.'
  };

  function $(id) {
    return document.getElementById(id);
  }

  function updateHint() {
    var hint = $('readingEditModeHint');
    if (hint) hint.innerHTML = HINTS[window.readingEditMode] || HINTS.default;
  }

  function updateTableModeMarker() {
    var tableArea = document.querySelector('.table-area');
    if (!tableArea) return;
    var marker = window.readingEditMode === 'default' ? 'default' : 'edit';
    if (tableArea.getAttribute('data-reading-edit-mode') !== marker) {
      tableArea.setAttribute('data-reading-edit-mode', marker);
    }
  }

  function scheduleReadingModeSideEffects() {
    var token = ++tableModePaintToken;
    // Tıklama sırasında yalnızca aktif buton değişir. Diğer küçük arayüz
    // işleri yeni renk ekrana çizildikten sonra tek seferde çalışır.
    runAfterNextPaint(function () {
      if (token !== tableModePaintToken) return;
      updateTableModeMarker();
      updateHint();
      if (window.readingEditMode !== 'amount' && amountEditState) {
        cancelAmountCellEdit();
      }
    });
  }

  function updateSegmentButtons() {
    var defaultBtn = $('readingEditModeDefault');
    var statusBtn = $('readingEditModeStatus');
    var amountBtn = $('readingEditModeAmount');
    if (defaultBtn) {
      defaultBtn.classList.toggle('is-active', window.readingEditMode === 'default');
      defaultBtn.setAttribute('aria-pressed', window.readingEditMode === 'default' ? 'true' : 'false');
    }
    if (statusBtn) {
      statusBtn.classList.toggle('is-active', window.readingEditMode === 'status');
      statusBtn.setAttribute('aria-pressed', window.readingEditMode === 'status' ? 'true' : 'false');
    }
    if (amountBtn) {
      amountBtn.classList.toggle('is-active', window.readingEditMode === 'amount');
      amountBtn.setAttribute('aria-pressed', window.readingEditMode === 'amount' ? 'true' : 'false');
    }
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
    var previousText = String(amountEditState.prevText || '➖').trim();
    amountEditState = null;
    hideAmountOverlay();
    cell.classList.remove('amount-editing', 'green', 'red', 'empty');
    cell.textContent = previousText;
    if (typeof cellTextIsOkudum === 'function' && cellTextIsOkudum(previousText)) {
      cell.classList.add('green');
    } else if (typeof cellTextIsOkumadim === 'function' && cellTextIsOkumadim(previousText)) {
      cell.classList.add('red');
    } else {
      cell.classList.add('empty');
    }
  }

  function setReadingEditMode(mode) {
    var next = mode === 'status' || mode === 'amount' || mode === 'default' ? mode : 'default';
    if (window.readingEditMode === next) return;
    window.readingEditMode = next;
    updateSegmentButtons();
    scheduleReadingModeSideEffects();
  }

  window.setReadingEditMode = setReadingEditMode;
  window.cancelAmountCellEdit = cancelAmountCellEdit;

  window.showAuthenticatedUserAreas = function showAuthenticatedUserAreas() {
    var areas = $('authenticatedUserAreas');
    if (!areas) return;
    requestAnimationFrame(function () {
      areas.setAttribute('aria-hidden', 'false');
      areas.classList.add('show');
    });
  };

  window.hideAuthenticatedUserAreas = function hideAuthenticatedUserAreas() {
    var areas = $('authenticatedUserAreas');
    cancelAmountCellEdit();
    window.readingEditMode = 'default';
    updateSegmentButtons();
    updateHint();
    if (areas) {
      areas.setAttribute('aria-hidden', 'true');
      areas.classList.remove('show');
    }
  };

  window.showReadingEditModeBar = window.showAuthenticatedUserAreas;
  window.hideReadingEditModeBar = window.hideAuthenticatedUserAreas;

  window.syncReadingEditModeBarVisibility = function syncReadingEditModeBarVisibility() {
    var loggedIn =
      typeof LocalStorageManager !== 'undefined' && LocalStorageManager.isUserLoggedIn();
    if (!loggedIn) {
      window.hideAuthenticatedUserAreas();
    }
  };

  function refreshRowStreak(userId, cell) {
    try {
      if (!cell || typeof calculateStreakFromCache !== 'function') return;
      var lastTd =
        typeof window.getTrackerSummaryStreakCell === 'function'
          ? window.getTrackerSummaryStreakCell(userId)
          : null;
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
      if (typeof window.refreshStreakTotalInTable === 'function') {
        window.refreshStreakTotalInTable(oldStreak, newStreak);
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
        // Mod düğmesinin click olayı blur'dan sonra çalışır. Kararı bir sonraki
        // göreve bırakarak mod değişiminde taslağın yanlışlıkla kaydedilmesini önle.
        window.setTimeout(function () {
          if (!amountEditState || amountEditState.input !== input) return;
          if (window.getReadingEditMode() !== 'amount') {
            return;
          }
          var buf = String(amountEditState.buffer || input.value || '').trim();
          if (buf) {
            commitAmountCellEdit();
          } else {
            cancelAmountCellEdit();
          }
        }, 0);
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

  function runAfterNextPaint(callback) {
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(function () {
        window.setTimeout(callback, 0);
      });
    } else {
      window.setTimeout(callback, 0);
    }
  }

  function commitAmountCellEdit() {
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
    var previousText = state.prevText;
    var previousStatus =
      typeof cellTextIsOkudum === 'function' && cellTextIsOkudum(previousText)
        ? 'okudum'
        : typeof cellTextIsOkumadim === 'function' && cellTextIsOkumadim(previousText)
          ? 'okumadım'
          : '';

    // Mevcut miktar değişmediyse kapat; önbellek, sayaç ve veritabanına dokunma.
    if (previousStatus === 'okudum' && existingAmount != null && amount === existingAmount) {
      amountEditState = null;
      hideAmountOverlay();
      cell.classList.remove('amount-editing');
      refreshAmountCellDisplay(cell, existingAmount);
      return;
    }

    amountEditState = null;
    hideAmountOverlay();
    cell.classList.remove('amount-editing');
    refreshAmountCellDisplay(cell, amount);

    // Hücre ve input değişikliğinin önce ekrana çizilmesine izin ver; hesaplama
    // ve kayıt işlemleri bir sonraki tarayıcı turunda çalışır.
    runAfterNextPaint(function () {
      if (typeof updateUserStatsCache === 'function') {
        updateUserStatsCache(userId, date, 'okudum');
      }
      if (typeof updateDateColumnCounts === 'function') {
        updateDateColumnCounts(date, previousText, 'okudum');
      }
      if (typeof adjustUserReadingCount === 'function') {
        adjustUserReadingCount(userId, previousStatus, 'okudum');
      }

      try {
        if (window.globalDataStore) {
          window.globalDataStore.applyLocalUpdate(userId, date, 'okudum', amount);
        }
      } catch (e) {
        console.error('Global store amount güncellenemedi:', e);
      }

      refreshRowStreak(userId, cell);

      if (typeof window.queueReadingStatusUpdate === 'function') {
        window.queueReadingStatusUpdate(userId, date, 'okudum', amount, cell, previousText);
      } else {
        fetch('/api/update-status/' + window.groupid, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: userId, date: date, status: 'okudum', amount: amount })
        }).catch(function (error) {
          console.error('Amount kaydı başarısız:', error);
        });
      }

      if (typeof refreshAmountTotalsInTable === 'function') {
        refreshAmountTotalsInTable(userId);
      }

      var amountDelta = existingAmount != null ? amount - existingAmount : amount;
      if (amountDelta > 0 && typeof window.celebrateOkudumCell === 'function') {
        window.celebrateOkudumCell(cell, { amountDelta: amountDelta });
      }
      if (
        previousStatus !== 'okudum' &&
        userInfo.userId === userId &&
        typeof window.animateStarToUserStats === 'function'
      ) {
        window.animateStarToUserStats(cell);
      }

      if (typeof updateUserStatsArea === 'function') {
        updateUserStatsArea();
      }
      if (typeof window.schedulePostToggleUiRefresh === 'function') {
        window.schedulePostToggleUiRefresh(userId);
      }
    });
  }

  window.beginAmountCellEdit = function beginAmountCellEdit(userId, date, cell) {
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
    var defaultBtn = $('readingEditModeDefault');
    var statusBtn = $('readingEditModeStatus');
    var amountBtn = $('readingEditModeAmount');
    if (defaultBtn) {
      defaultBtn.addEventListener('click', function () {
        setReadingEditMode('default');
      });
    }
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
    updateTableModeMarker();
    updateHint();
    window.syncReadingEditModeBarVisibility();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReadingEditModeBar);
  } else {
    initReadingEditModeBar();
  }
})();
