(function () {
    'use strict';

    const LEAGUES = [
        { min: 0, max: 5, name: 'Bronz', color1: '#e2b07a', color2: '#ffe0b2' },
        { min: 5, max: 10, name: 'Gümüş', color1: '#d3d3d3', color2: '#e0e0e0' },
        { min: 10, max: 20, name: 'Altın', color1: '#ffd700', color2: '#ffe789' },
        { min: 20, max: 40, name: 'İnci', color1: '#b2dfdb', color2: '#c8eef3' },
        { min: 40, max: 60, name: 'Safir', color1: '#49b7ff', color2: '#bbdefb' },
        { min: 60, max: 100, name: 'Zümrüt', color1: '#58c089', color2: '#a5d6a7' },
        { min: 100, max: 150, name: 'Elmas', color1: '#36e873', color2: '#c4edb8' },
        { min: 150, max: 200, name: 'Yakut', color1: '#ffb199', color2: '#ffe0b2' },
        { min: 200, max: 365, name: 'Mercan', color1: '#ff6f63', color2: '#ffafb7' },
        { min: 365, max: Infinity, name: 'Pırlanta', color1: '#ffbf00', color2: '#ffe789' }
    ];

    const MONTH_NAMES = [
        'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
        'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
    ];
    const SHORT_MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haz', 'Tem', 'Ağu', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const DAY_NAMES = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cts'];
    const FONT_FAMILY = '"Segoe UI", Arial, sans-serif';
    const RENDER_SCALE = 3;

    function parseDateKey(dateKey) {
        const parts = String(dateKey || '').split('-').map(Number);
        return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
    }

    function addDays(dateKey, amount) {
        const date = parseDateKey(dateKey);
        date.setDate(date.getDate() + amount);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function getSevenDaysEndingAt(referenceDate) {
        const dates = [];
        for (let offset = 6; offset >= 0; offset--) dates.push(addDays(referenceDate, -offset));
        return dates;
    }

    function formatDateRange(dates) {
        if (!Array.isArray(dates) || dates.length !== 7) return '';
        const first = parseDateKey(dates[0]);
        const last = parseDateKey(dates[6]);
        if (first.getMonth() === last.getMonth()) {
            return `${first.getDate()} - ${last.getDate()} ${MONTH_NAMES[last.getMonth()]}`;
        }
        return `${first.getDate()} ${MONTH_NAMES[first.getMonth()]} - ${last.getDate()} ${MONTH_NAMES[last.getMonth()]}`;
    }

    function parseAmount(value) {
        if (value == null || value === '') return null;
        const parsed = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
        return Number.isFinite(parsed) ? parsed : null;
    }

    function sumAmounts(stats, userId, seasonKey) {
        const normalizedUserId = String(userId);
        let total = 0;
        stats.forEach(function (status) {
            if (String(status.userId) !== normalizedUserId) return;
            if (seasonKey && String(status.date || '').slice(0, 7) !== seasonKey) return;
            const amount = parseAmount(status.amount);
            if (amount != null) total += amount;
        });
        return total;
    }

    function calculateStreak(statusMap, todayKey) {
        let cursor;
        if (statusMap[todayKey] === 'okudum') cursor = todayKey;
        else if (statusMap[todayKey] === 'okumadım') return 0;
        else cursor = addDays(todayKey, -1);

        let streak = 0;
        while (statusMap[cursor] === 'okudum') {
            streak++;
            cursor = addDays(cursor, -1);
        }
        return streak;
    }

    function getLeague(readCount) {
        return LEAGUES.find(function (league) {
            return readCount >= league.min && readCount < league.max;
        }) || LEAGUES[LEAGUES.length - 1];
    }

    function fillAndStrokeCell(ctx, x, y, width, height, fill, stroke, lineWidth) {
        ctx.fillStyle = fill;
        ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = stroke || '#c7c7c7';
        ctx.lineWidth = lineWidth || 1;
        ctx.strokeRect(x, y, width, height);
    }

    // Bugün sütununu bölümüne uygun 2px border ile belirginleştirir.
    function drawTodayCellHighlight(ctx, x, y, width, height, borderColor) {
        ctx.save();
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
        ctx.restore();
    }

    function drawTodayBodyCellHighlight(ctx, x, y, width, height) {
        ctx.save();
        ctx.lineWidth = 1;

        ctx.strokeStyle = '#d0d0d0';
        ctx.beginPath();
        ctx.moveTo(x + 1, y + 1);
        ctx.lineTo(x + width - 1, y + 1);
        ctx.moveTo(x + 1, y + height - 1);
        ctx.lineTo(x + width - 1, y + height - 1);
        ctx.stroke();

        ctx.strokeStyle = '#c7c7c7';
        ctx.beginPath();
        ctx.moveTo(x + 1, y + 1);
        ctx.lineTo(x + 1, y + height - 1);
        ctx.moveTo(x + width - 1, y + 1);
        ctx.lineTo(x + width - 1, y + height - 1);
        ctx.stroke();
        ctx.restore();
    }

    function drawCheckmark(ctx, cx, cy, size, color, strokeWidth) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx - size * 0.38, cy + size * 0.05);
        ctx.lineTo(cx - size * 0.1, cy + size * 0.32);
        ctx.lineTo(cx + size * 0.38, cy - size * 0.32);
        ctx.strokeStyle = color || '#4b0082';
        ctx.lineWidth = strokeWidth || 2.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.restore();
    }

    function drawCross(ctx, cx, cy, size) {
        const half = size * 0.32;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx - half, cy - half);
        ctx.lineTo(cx + half, cy + half);
        ctx.moveTo(cx + half, cy - half);
        ctx.lineTo(cx - half, cy + half);
        ctx.strokeStyle = '#8b0000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();
    }

    function drawMinus(ctx, cx, cy, size) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx - size * 0.35, cy);
        ctx.lineTo(cx + size * 0.35, cy);
        ctx.strokeStyle = '#5e49b2';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();
    }

    function drawStar(ctx, cx, cy, radius) {
        const innerRadius = radius * 0.42;
        let rotation = Math.PI * 1.5;
        const step = Math.PI / 5;
        ctx.save();
        ctx.beginPath();
        for (let index = 0; index < 5; index++) {
            ctx.lineTo(cx + Math.cos(rotation) * radius, cy + Math.sin(rotation) * radius);
            rotation += step;
            ctx.lineTo(cx + Math.cos(rotation) * innerRadius, cy + Math.sin(rotation) * innerRadius);
            rotation += step;
        }
        ctx.closePath();
        const gradient = ctx.createLinearGradient(cx, cy - radius, cx, cy + radius);
        gradient.addColorStop(0, '#fff366');
        gradient.addColorStop(0.4, '#ffc700');
        gradient.addColorStop(1, '#ff8800');
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = '#d96c00';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
    }

    function drawTextWithCheck(ctx, cx, cy, text, options) {
        const opts = options || {};
        const font = opts.font || `600 14px ${FONT_FAMILY}`;
        const color = opts.color || '#208a3c';
        const checkSize = opts.checkSize || 11;
        const gap = opts.gap == null ? 3 : opts.gap;
        ctx.save();
        ctx.font = font;
        ctx.textBaseline = 'middle';
        const value = String(text);
        const textWidth = ctx.measureText(value).width;
        const startX = cx - (textWidth + gap + checkSize) / 2;
        ctx.textAlign = 'left';
        ctx.fillStyle = color;
        ctx.fillText(value, startX, cy);
        drawCheckmark(ctx, startX + textWidth + gap + checkSize / 2, cy, checkSize, opts.checkColor || color, opts.checkStroke || 1.9);
        ctx.restore();
    }

    function drawStreak(ctx, cx, cy, value) {
        if (!value) {
            ctx.fillStyle = '#ff1717';
            ctx.font = `700 17px ${FONT_FAMILY}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('-', cx, cy);
            return;
        }
        const text = String(value);
        ctx.font = `700 17px ${FONT_FAMILY}`;
        const textWidth = ctx.measureText(text).width;
        const startX = cx - (18 + 5 + textWidth) / 2;
        drawStar(ctx, startX + 9, cy, 9);
        ctx.fillStyle = '#ff1717';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, startX + 23, cy);
    }

    function drawDefaultAvatar(ctx, x, y, radius) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, radius - 0.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.clip();
        ctx.beginPath();
        ctx.arc(x, y - radius * 0.18, radius * 0.38, 0, Math.PI * 2);
        ctx.fillStyle = '#000000';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y + radius * 0.9, radius * 0.65, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, radius - 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 0.85;
        ctx.stroke();
        ctx.restore();
    }

    function fitText(ctx, value, maxWidth) {
        let text = String(value || 'Kullanıcı');
        if (ctx.measureText(text).width <= maxWidth) return text;
        while (text.length > 1 && ctx.measureText(`${text}…`).width > maxWidth) text = text.slice(0, -1);
        return `${text}…`;
    }

    function getSafeAvatarUrl(source) {
        if (!source || String(source).includes('default.png')) return null;
        try {
            const url = new URL(source, window.location.href);
            const hostname = url.hostname.toLowerCase();
            const isDropboxUrl = hostname === 'dropbox.com'
                || hostname.endsWith('.dropbox.com')
                || hostname === 'dropboxusercontent.com'
                || hostname.endsWith('.dropboxusercontent.com');
            if (url.protocol === 'https:' && isDropboxUrl) {
                return `/api/dropbox-image?url=${encodeURIComponent(url.href)}`;
            }
            if (url.origin !== window.location.origin && url.protocol !== 'data:' && url.protocol !== 'blob:') return null;
            return url.href;
        } catch (_) {
            return null;
        }
    }

    function loadImage(source) {
        const safeUrl = getSafeAvatarUrl(source);
        if (!safeUrl) return Promise.resolve(null);
        return new Promise(function (resolve) {
            const image = new Image();
            let settled = false;
            const finish = function (result) {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutId);
                resolve(result);
            };
            const timeoutId = setTimeout(function () { finish(null); }, 12000);
            image.crossOrigin = 'anonymous';
            image.onload = function () { finish(image); };
            image.onerror = function () { finish(null); };
            image.src = safeUrl;
        });
    }

    function drawAvatar(ctx, image, x, y, radius) {
        if (!image) {
            drawDefaultAvatar(ctx, x, y, radius);
            return;
        }
        const sourceSize = Math.min(image.naturalWidth || image.width, image.naturalHeight || image.height);
        const sourceX = ((image.naturalWidth || image.width) - sourceSize) / 2;
        const sourceY = ((image.naturalHeight || image.height) - sourceSize) / 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, x - radius, y - radius, radius * 2, radius * 2);
        ctx.restore();
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.75;
        ctx.stroke();
        ctx.restore();
    }

    function canvasToBlob(canvas) {
        return new Promise(function (resolve, reject) {
            canvas.toBlob(function (blob) {
                if (blob) resolve(blob);
                else reject(new Error('Haftalık tablo görseli oluşturulamadı.'));
            }, 'image/png');
        });
    }

    async function generateWeeklyTableImage(options) {
        const config = options || {};
        const users = Array.isArray(config.users) ? config.users : [];
        const stats = Array.isArray(config.stats) ? config.stats : [];
        const todayKey = config.todayKey;
        const dates = Array.isArray(config.dates) && config.dates.length === 7
            ? config.dates.slice()
            : getSevenDaysEndingAt(config.referenceDate || todayKey);
        if (!todayKey || dates.length !== 7) throw new Error('Haftalık görsel için geçerli tarih bilgisi bulunamadı.');

        const statMap = {};
        const amountMap = {};
        const readCounts = {};
        stats.forEach(function (status) {
            const userId = String(status.userId);
            if (!statMap[userId]) statMap[userId] = {};
            if (!amountMap[userId]) amountMap[userId] = {};
            statMap[userId][status.date] = status.status;
            const amount = parseAmount(status.amount);
            if (amount != null) amountMap[userId][status.date] = amount;
            if (status.status === 'okudum') readCounts[userId] = (readCounts[userId] || 0) + 1;
        });

        const avatarEntries = await Promise.all(users.map(async function (user) {
            return [String(user._id), await loadImage(user.profileImage)];
        }));
        const avatars = new Map(avatarEntries);

        const seasonKey = dates[6].slice(0, 7);
        const seasonMonth = MONTH_NAMES[Number(seasonKey.slice(5, 7)) - 1] || '';
        const dailyReadCounts = {};
        let weeklyRead = 0;
        let weeklyMarked = 0;
        dates.forEach(function (dateKey) {
            let dailyRead = 0;
            users.forEach(function (user) {
                const status = (statMap[String(user._id)] || {})[dateKey];
                if (status === 'okudum') {
                    dailyRead++;
                    weeklyRead++;
                    weeklyMarked++;
                } else if (status === 'okumadım') {
                    weeklyMarked++;
                }
            });
            dailyReadCounts[dateKey] = dailyRead;
        });
        const weeklySuccess = weeklyMarked ? Math.round((weeklyRead / weeklyMarked) * 100) : 0;

        const seasonAmounts = {};
        const allTimeAmounts = {};
        const streaks = {};
        let totalSeasonAmount = 0;
        let totalStreak = 0;
        users.forEach(function (user) {
            const userId = String(user._id);
            seasonAmounts[userId] = sumAmounts(stats, userId, seasonKey);
            allTimeAmounts[userId] = sumAmounts(stats, userId);
            streaks[userId] = calculateStreak(statMap[userId] || {}, todayKey);
            totalSeasonAmount += seasonAmounts[userId];
            totalStreak += streaks[userId];
        });

        const nameWidth = 148;
        const dayWidth = 64;
        const amountWidth = 90;
        const streakWidth = 88;
        const rowHeight = 64;
        const headerHeight = 62;
        const statsHeight = 62;
        const margin = 10;
        const logicalWidth = margin * 2 + nameWidth + dayWidth * 7 + amountWidth + streakWidth;
        const logicalHeight = margin * 2 + headerHeight + statsHeight + Math.max(users.length, 1) * rowHeight;
        const canvas = document.createElement('canvas');
        canvas.width = logicalWidth * RENDER_SCALE;
        canvas.height = logicalHeight * RENDER_SCALE;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas desteği bulunamadı.');
        ctx.scale(RENDER_SCALE, RENDER_SCALE);
        ctx.imageSmoothingEnabled = true;
        if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, logicalWidth, logicalHeight);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const headerY = margin;
        fillAndStrokeCell(ctx, margin, headerY, nameWidth, headerHeight, '#f7f7f7');
        ctx.fillStyle = '#333333';
        ctx.font = `600 15px ${FONT_FAMILY}`;
        ctx.fillText(`${users.length} Kişi`, margin + nameWidth / 2, headerY + headerHeight / 2);

        dates.forEach(function (dateKey, index) {
            const date = parseDateKey(dateKey);
            const x = margin + nameWidth + index * dayWidth;
            const isToday = dateKey === todayKey;
            fillAndStrokeCell(ctx, x, headerY, dayWidth, headerHeight, isToday ? '#ebf3fa' : '#f0f0f0');
            ctx.fillStyle = '#505050';
            ctx.font = `600 14px ${FONT_FAMILY}`;
            ctx.fillText(isToday ? 'Bugün' : `${date.getDate()} ${SHORT_MONTH_NAMES[date.getMonth()]}`, x + dayWidth / 2, headerY + 21);
            ctx.fillStyle = '#5b9bd5';
            ctx.font = `600 16px ${FONT_FAMILY}`;
            ctx.fillText(DAY_NAMES[date.getDay()], x + dayWidth / 2, headerY + 44);
        });

        const amountX = margin + nameWidth + dayWidth * 7;
        const streakX = amountX + amountWidth;
        fillAndStrokeCell(ctx, amountX, headerY, amountWidth, headerHeight, '#f0f0f0');
        ctx.fillStyle = '#208a3c';
        ctx.font = `600 15px ${FONT_FAMILY}`;
        ctx.fillText(seasonMonth, amountX + amountWidth / 2, headerY + 21);
        ctx.font = `600 14px ${FONT_FAMILY}`;
        ctx.fillText('Okuması', amountX + amountWidth / 2, headerY + 42);
        fillAndStrokeCell(ctx, streakX, headerY, streakWidth, headerHeight, '#f0f0f0');
        ctx.fillStyle = '#ff1717';
        ctx.fillText('Okuma', streakX + streakWidth / 2, headerY + 21);
        ctx.fillText('Serisi', streakX + streakWidth / 2, headerY + 42);

        const statsY = headerY + headerHeight;
        fillAndStrokeCell(ctx, margin, statsY, nameWidth, statsHeight, '#f7f7f7');
        drawTextWithCheck(ctx, margin + nameWidth / 2, statsY + statsHeight / 2, `%${weeklySuccess}`, {
            font: `700 16px ${FONT_FAMILY}`, checkSize: 13, gap: 1
        });
        dates.forEach(function (dateKey, index) {
            const x = margin + nameWidth + index * dayWidth;
            const isToday = dateKey === todayKey;
            fillAndStrokeCell(ctx, x, statsY, dayWidth, statsHeight, isToday ? '#ebf3fa' : '#f0f0f0');
            drawTextWithCheck(ctx, x + dayWidth / 2, statsY + statsHeight / 2, dailyReadCounts[dateKey], {
                font: `600 15px ${FONT_FAMILY}`
            });
        });
        fillAndStrokeCell(ctx, amountX, statsY, amountWidth, statsHeight, '#f0f0f0');
        drawTextWithCheck(ctx, amountX + amountWidth / 2, statsY + statsHeight / 2, totalSeasonAmount, {
            font: `700 16px ${FONT_FAMILY}`, checkSize: 13
        });
        fillAndStrokeCell(ctx, streakX, statsY, streakWidth, statsHeight, '#f0f0f0');
        drawStreak(ctx, streakX + streakWidth / 2, statsY + statsHeight / 2, totalStreak);

        if (!users.length) {
            const emptyY = statsY + statsHeight;
            fillAndStrokeCell(ctx, margin, emptyY, logicalWidth - margin * 2, rowHeight, '#f8f9fa');
            ctx.fillStyle = '#777777';
            ctx.font = `500 15px ${FONT_FAMILY}`;
            ctx.textAlign = 'center';
            ctx.fillText('Henüz kullanıcı bulunmuyor', logicalWidth / 2, emptyY + rowHeight / 2);
        }

        users.forEach(function (user, userIndex) {
            const userId = String(user._id);
            const rowY = statsY + statsHeight + userIndex * rowHeight;
            const league = getLeague(readCounts[userId] || 0);
            const nameGradient = ctx.createLinearGradient(margin, rowY, margin + nameWidth, rowY);
            nameGradient.addColorStop(0, league.color1);
            nameGradient.addColorStop(1, league.color2);
            ctx.fillStyle = nameGradient;
            ctx.fillRect(margin, rowY, nameWidth, rowHeight);
            ctx.strokeStyle = '#f1f1f1';
            ctx.lineWidth = 1;
            ctx.strokeRect(margin, rowY, nameWidth, rowHeight);
            drawAvatar(ctx, avatars.get(userId), margin + 25, rowY + rowHeight / 2, 18);

            const textX = margin + 48;
            ctx.textAlign = 'left';
            ctx.fillStyle = '#000000';
            ctx.font = `600 15px ${FONT_FAMILY}`;
            ctx.fillText(fitText(ctx, user.name, nameWidth - 54), textX, rowY + rowHeight / 2 - 10);
            ctx.font = `500 13px ${FONT_FAMILY}`;
            const allTimeAmount = allTimeAmounts[userId] || 0;
            const metaText = allTimeAmount > 0 ? `${league.name} · ${allTimeAmount}` : league.name;
            ctx.fillText(metaText, textX, rowY + rowHeight / 2 + 11);
            if (allTimeAmount > 0) {
                const metaWidth = ctx.measureText(metaText).width;
                drawCheckmark(ctx, textX + metaWidth + 7, rowY + rowHeight / 2 + 11, 8, 'rgba(0, 0, 0, 0.8)', 1.5);
            }

            dates.forEach(function (dateKey, dateIndex) {
                const x = margin + nameWidth + dateIndex * dayWidth;
                const status = (statMap[userId] || {})[dateKey];
                const dayAmount = (amountMap[userId] || {})[dateKey];
                if (status === 'okudum') {
                    fillAndStrokeCell(ctx, x, rowY, dayWidth, rowHeight, 'rgb(76, 217, 100)', '#f0f0f0');
                    if (dayAmount != null) {
                        drawTextWithCheck(ctx, x + dayWidth / 2, rowY + rowHeight / 2, dayAmount, {
                            color: '#4b0082', checkColor: '#4b0082', checkSize: 11, checkStroke: 2.1
                        });
                    } else {
                        drawCheckmark(ctx, x + dayWidth / 2, rowY + rowHeight / 2, 11, '#4b0082', 2);
                    }
                } else if (status === 'okumadım') {
                    fillAndStrokeCell(ctx, x, rowY, dayWidth, rowHeight, 'rgb(255, 100, 60)', '#f0f0f0');
                    drawCross(ctx, x + dayWidth / 2, rowY + rowHeight / 2, 11);
                } else {
                    fillAndStrokeCell(ctx, x, rowY, dayWidth, rowHeight, dateKey === todayKey ? '#ebf3fa' : '#f8f9fa', '#d0d0d0');
                    drawMinus(ctx, x + dayWidth / 2, rowY + rowHeight / 2, 10);
                }
            });

            fillAndStrokeCell(ctx, amountX, rowY, amountWidth, rowHeight, '#f3faf5');
            if (seasonAmounts[userId] > 0) {
                drawTextWithCheck(ctx, amountX + amountWidth / 2, rowY + rowHeight / 2, seasonAmounts[userId], {
                    font: `700 17px ${FONT_FAMILY}`, checkSize: 13
                });
            } else {
                ctx.fillStyle = '#208a3c';
                ctx.font = `600 17px ${FONT_FAMILY}`;
                ctx.textAlign = 'center';
                ctx.fillText('-', amountX + amountWidth / 2, rowY + rowHeight / 2);
            }
            fillAndStrokeCell(ctx, streakX, rowY, streakWidth, rowHeight, '#f5f5f5');
            drawStreak(ctx, streakX + streakWidth / 2, rowY + rowHeight / 2, streaks[userId]);
        });

        const todayIndex = dates.indexOf(todayKey);
        if (todayIndex >= 0) {
            const todayX = margin + nameWidth + todayIndex * dayWidth;
            drawTodayCellHighlight(ctx, todayX, headerY, dayWidth, headerHeight, '#c7c7c7');
            drawTodayCellHighlight(ctx, todayX, statsY, dayWidth, statsHeight, '#c7c7c7');
            const highlightedRowCount = Math.max(users.length, 1);
            for (let rowIndex = 0; rowIndex < highlightedRowCount; rowIndex++) {
                drawTodayBodyCellHighlight(
                    ctx,
                    todayX,
                    statsY + statsHeight + rowIndex * rowHeight,
                    dayWidth,
                    rowHeight
                );
            }
        }

        ctx.strokeStyle = '#b5b5b5';
        ctx.lineWidth = 2;
        ctx.strokeRect(margin, margin, logicalWidth - margin * 2, logicalHeight - margin * 2);
        const blob = await canvasToBlob(canvas);
        return {
            blob: blob,
            canvas: canvas,
            dates: dates,
            dateRangeText: formatDateRange(dates),
            width: canvas.width,
            height: canvas.height
        };
    }

    window.generateWeeklyTableImage = generateWeeklyTableImage;
    window.getWeeklyImageDates = getSevenDaysEndingAt;
}());
