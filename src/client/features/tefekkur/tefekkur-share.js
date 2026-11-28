(function () {
    const ns = window.RoTaKipTefekkur;
    const ARABIC_FONT = '"KFGQPC Uthman Taha Naskh", "Amiri", "Noto Naskh Arabic", "Traditional Arabic", serif';
    const CARD_WIDTH = 1080;
    const CARD_PADDING = 150;
    const CARD_SERIF = 'Georgia, "Times New Roman", serif';
    const CARD_ACCENT = '#ff6b33';
    const CARD_INK = '#2a1f17';
    const CARD_BODY = '#3d3128';
    const CARD_MUTED = '#8b7460';
    const MAX_PREPARED_FILES = 6;
    const preparedFiles = new Map();

    function absoluteUrl(url) {
        return new URL(url, window.location.href).href;
    }

    function composeText(item) {
        return [
            item.arabic,
            item.title,
            item.text,
            item.caption ? `— ${item.caption}` : ''
        ].filter(Boolean).join('\n');
    }

    function sansFont() {
        return window.getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
    }

    function wrapLines(context, text, maxWidth) {
        const lines = [];
        String(text || '').split(/\n+/).forEach(paragraph => {
            const words = paragraph.trim().split(/\s+/).filter(Boolean);
            let line = '';
            words.forEach(word => {
                const candidate = line ? `${line} ${word}` : word;
                if (line && context.measureText(candidate).width > maxWidth) {
                    lines.push(line);
                    line = word;
                } else {
                    line = candidate;
                }
            });
            if (line) lines.push(line);
        });
        return lines;
    }

    // Metin içerikleri, sıcak krem zeminli, çerçeveli ve süslü ayraçlı bir görsele çizilir (marka yazısı yok).
    // Arapça şekillendirmesini tarayıcının kendi metin motoru yapar (html2canvas gerekmez).
    async function renderTextCard(item, label) {
        if (document.fonts?.load) {
            await Promise.allSettled([
                document.fonts.load(`64px ${ARABIC_FONT}`),
                document.fonts.load(`700 60px ${sansFont()}`)
            ]);
        }
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const sans = sansFont();
        const contentWidth = CARD_WIDTH - CARD_PADDING * 2;
        const textLength = String(item.text || '').length;
        const bodySize = textLength > 900 ? 32 : textLength > 450 ? 36 : 42;

        const blocks = [];
        blocks.push({ type: 'label', font: `700 26px ${sans}`, color: CARD_ACCENT, lines: [label.toLocaleUpperCase('tr-TR')], lineHeight: 34, gapAfter: 34, letterSpacing: '6px' });
        blocks.push({ type: 'ornament', height: 20, gapAfter: 64 });
        if (item.arabic) {
            context.font = `400 76px ${ARABIC_FONT}`;
            context.direction = 'rtl';
            blocks.push({ type: 'text', font: context.font, color: CARD_INK, lines: wrapLines(context, item.arabic, contentWidth), lineHeight: 128, gapAfter: 32, rtl: true });
            context.direction = 'ltr';
        }
        if (item.title) {
            context.font = `700 58px ${CARD_SERIF}`;
            blocks.push({ type: 'text', font: context.font, color: CARD_INK, lines: wrapLines(context, item.title, contentWidth), lineHeight: 74, gapAfter: 28 });
        }
        if (item.text) {
            context.font = `400 ${bodySize}px ${CARD_SERIF}`;
            blocks.push({ type: 'text', font: context.font, color: CARD_BODY, lines: wrapLines(context, item.text, contentWidth), lineHeight: Math.round(bodySize * 1.6), gapAfter: 28 });
        }
        if (item.caption) {
            context.font = `italic 400 30px ${CARD_SERIF}`;
            blocks.push({ type: 'text', font: context.font, color: CARD_MUTED, lines: wrapLines(context, `— ${item.caption}`, contentWidth), lineHeight: 44, gapAfter: 28 });
        }
        blocks.push({ type: 'ornament', height: 20, gapBefore: 36, gapAfter: 0 });

        const blockHeight = block => (block.type === 'ornament' ? block.height : block.lines.length * block.lineHeight);
        const contentHeight = blocks.reduce((sum, block) => sum + (block.gapBefore || 0) + blockHeight(block) + block.gapAfter, 0);
        const height = Math.max(CARD_WIDTH, contentHeight + CARD_PADDING * 2);

        canvas.width = CARD_WIDTH;
        canvas.height = height;
        const background = context.createLinearGradient(0, 0, 0, height);
        background.addColorStop(0, '#fffaf2');
        background.addColorStop(1, '#fdeedd');
        context.fillStyle = background;
        context.fillRect(0, 0, CARD_WIDTH, height);
        drawFrame(context, height);
        context.textAlign = 'center';
        context.textBaseline = 'middle';

        let y = Math.max(CARD_PADDING, (height - contentHeight) / 2);
        blocks.forEach(block => {
            y += block.gapBefore || 0;
            if (block.type === 'ornament') {
                drawOrnament(context, y + block.height / 2);
                y += block.height + block.gapAfter;
                return;
            }
            context.font = block.font;
            context.fillStyle = block.color;
            context.direction = block.rtl ? 'rtl' : 'ltr';
            if ('letterSpacing' in context) context.letterSpacing = block.letterSpacing || '0px';
            block.lines.forEach(line => {
                context.fillText(line, CARD_WIDTH / 2 + (block.letterSpacing ? 3 : 0), y + block.lineHeight / 2);
                y += block.lineHeight;
            });
            if ('letterSpacing' in context) context.letterSpacing = '0px';
            context.direction = 'ltr';
            y += block.gapAfter;
        });

        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob(result => (result ? resolve(result) : reject(new Error('Görsel oluşturulamadı'))), 'image/png');
        });
        return new File([blob], 'tefekkur.png', { type: 'image/png' });
    }

    // Kartın çevresinde ince çift çizgili çerçeve.
    function drawFrame(context, height) {
        const frames = [
            { inset: 44, width: 3, color: 'rgba(255, 107, 51, 0.55)', radius: 28 },
            { inset: 62, width: 1.5, color: 'rgba(255, 107, 51, 0.28)', radius: 18 }
        ];
        frames.forEach(({ inset, width, color, radius }) => {
            context.beginPath();
            if (typeof context.roundRect === 'function') context.roundRect(inset, inset, CARD_WIDTH - inset * 2, height - inset * 2, radius);
            else context.rect(inset, inset, CARD_WIDTH - inset * 2, height - inset * 2);
            context.lineWidth = width;
            context.strokeStyle = color;
            context.stroke();
        });
    }

    // İki yanda solan çizgi, ortada küçük bir elmas.
    function drawOrnament(context, centerY) {
        const centerX = CARD_WIDTH / 2;
        [-1, 1].forEach(side => {
            const start = centerX + side * 26;
            const end = centerX + side * 150;
            const gradient = context.createLinearGradient(start, 0, end, 0);
            gradient.addColorStop(0, 'rgba(255, 107, 51, 0.85)');
            gradient.addColorStop(1, 'rgba(255, 107, 51, 0)');
            context.strokeStyle = gradient;
            context.lineWidth = 2.5;
            context.beginPath();
            context.moveTo(start, centerY);
            context.lineTo(end, centerY);
            context.stroke();
        });
        context.fillStyle = CARD_ACCENT;
        context.beginPath();
        context.moveTo(centerX, centerY - 10);
        context.lineTo(centerX + 10, centerY);
        context.lineTo(centerX, centerY + 10);
        context.lineTo(centerX - 10, centerY);
        context.closePath();
        context.fill();
    }

    async function fetchImageFile(item) {
        const response = await fetch(item.image);
        if (!response.ok) throw new Error('Görsel indirilemedi.');
        const blob = await response.blob();
        const name = item.name || `tefekkur.${(blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}`;
        return new File([blob], name, { type: blob.type || 'image/jpeg' });
    }

    // Paylaşım dosyası slayt gösterilirken arka planda hazırlanır. iOS Safari, kullanıcı
    // dokunuşundan sonra uzun süren işler bitene kadar paylaşım menüsünü açmaya izin vermez.
    function prepareFile(item, label) {
        if (!item) return Promise.resolve(null);
        const key = item.key;
        if (preparedFiles.has(key)) return preparedFiles.get(key);
        const promise = (item.image ? fetchImageFile(item) : renderTextCard(item, label))
            .catch(error => {
                preparedFiles.delete(key);
                throw error;
            });
        preparedFiles.set(key, promise);
        while (preparedFiles.size > MAX_PREPARED_FILES) {
            preparedFiles.delete(preparedFiles.keys().next().value);
        }
        return promise;
    }

    function openFallbackSheet({ item, text, file, label }) {
        const shareTarget = text || absoluteUrl(item.image);
        ns.openSheet({
            title: label ? `${label} · Paylaş` : 'Paylaş',
            className: 'is-share',
            labelId: 'tefekkurShareTitle',
            render(body, close) {
                body.innerHTML = `
                    <div class="tefekkur-share-options">
                        <button type="button" data-share="whatsapp" data-autofocus><i class="fa-brands fa-whatsapp" aria-hidden="true"></i><span>WhatsApp'ta paylaş</span></button>
                        <button type="button" data-share="x"><i class="fa-brands fa-x-twitter" aria-hidden="true"></i><span>X'te paylaş</span></button>
                        ${file ? '<button type="button" data-share="download"><i class="fa-solid fa-download" aria-hidden="true"></i><span>Görseli indir</span></button>' : ''}
                        ${text ? '<button type="button" data-share="copy"><i class="fa-regular fa-copy" aria-hidden="true"></i><span>Metni kopyala</span></button>' : ''}
                    </div>
                `;
                body.addEventListener('click', async event => {
                    const option = event.target.closest('[data-share]')?.dataset.share;
                    if (!option) return;
                    if (option === 'whatsapp') {
                        window.open(`https://wa.me/?text=${encodeURIComponent(shareTarget)}`, '_blank', 'noopener');
                    } else if (option === 'x') {
                        const tweet = shareTarget.length > 260 ? `${shareTarget.slice(0, 257)}…` : shareTarget;
                        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}`, '_blank', 'noopener');
                    } else if (option === 'download') {
                        ns.downloadBlob(file, file.name);
                    } else if (option === 'copy') {
                        try {
                            await ns.copyText(text);
                            ns.toast('Panoya kopyalandı');
                        } catch (_error) {
                            ns.toast('Kopyalanamadı', 'error');
                        }
                    }
                    close();
                });
            }
        });
    }

    async function shareItem(item, { label }) {
        if (!item) return;
        const text = item.image ? '' : composeText(item);
        let file = null;
        try {
            file = await prepareFile(item, label);
        } catch (error) {
            console.warn('Paylaşım görseli hazırlanamadı:', error);
        }

        if (typeof navigator.share === 'function') {
            const data = { title: `RoTaKip · ${label}` };
            const canShareFile = file && (typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] }));
            if (canShareFile) {
                // Görsel hazırsa yalnız görsel gider; yazı yalnızca görsel oluşturulamazsa paylaşılır.
                data.files = [file];
                delete data.title;
            } else if (text) {
                data.text = text;
            } else {
                data.url = absoluteUrl(item.image);
            }
            try {
                await navigator.share(data);
                return;
            } catch (error) {
                if (error?.name === 'AbortError') return;
                console.warn('Paylaşım menüsü açılamadı:', error);
            }
        }
        openFallbackSheet({ item, text, file, label });
    }

    // Dosyası olmayan, yalnız bağlantı içeren paylaşım (ör. ilahi videosu).
    async function shareLink({ title, text, url, label }) {
        if (!url) return;
        if (typeof navigator.share === 'function') {
            try {
                await navigator.share({ title: `RoTaKip · ${label}`, text, url });
                return;
            } catch (error) {
                if (error?.name === 'AbortError') return;
                console.warn('Paylaşım menüsü açılamadı:', error);
            }
        }
        const message = [text || title, url].filter(Boolean).join('\n');
        ns.openSheet({
            title: `${label} · Paylaş`,
            className: 'is-share',
            labelId: 'tefekkurShareTitle',
            render(body, close) {
                body.innerHTML = `
                    <div class="tefekkur-share-options">
                        <button type="button" data-share="whatsapp" data-autofocus><i class="fa-brands fa-whatsapp" aria-hidden="true"></i><span>WhatsApp'ta paylaş</span></button>
                        <button type="button" data-share="x"><i class="fa-brands fa-x-twitter" aria-hidden="true"></i><span>X'te paylaş</span></button>
                        <button type="button" data-share="copy"><i class="fa-regular fa-copy" aria-hidden="true"></i><span>Bağlantıyı kopyala</span></button>
                    </div>
                `;
                body.addEventListener('click', async event => {
                    const option = event.target.closest('[data-share]')?.dataset.share;
                    if (!option) return;
                    if (option === 'whatsapp') {
                        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
                    } else if (option === 'x') {
                        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text || title || '')}&url=${encodeURIComponent(url)}`, '_blank', 'noopener');
                    } else if (option === 'copy') {
                        try {
                            await ns.copyText(url);
                            ns.toast('Bağlantı kopyalandı');
                        } catch (_error) {
                            ns.toast('Kopyalanamadı', 'error');
                        }
                    }
                    close();
                });
            }
        });
    }

    function imageToPngBlob(url) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = image.naturalWidth;
                canvas.height = image.naturalHeight;
                canvas.getContext('2d').drawImage(image, 0, 0);
                canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Görsel dönüştürülemedi'))), 'image/png');
            };
            image.onerror = () => reject(new Error('Görsel yüklenemedi'));
            image.src = url;
        });
    }

    // Görsel panoya PNG olarak kopyalanır; desteklenmiyorsa bağlantısı kopyalanır.
    async function copyItem(item) {
        if (!item) return null;
        if (!item.image) {
            await ns.copyText(composeText(item));
            return 'text';
        }
        if (navigator.clipboard?.write && typeof window.ClipboardItem === 'function' && window.isSecureContext) {
            try {
                await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': imageToPngBlob(item.image) })]);
                return 'image';
            } catch (error) {
                console.warn('Görsel panoya kopyalanamadı, bağlantı kopyalanacak:', error);
            }
        }
        await ns.copyText(absoluteUrl(item.image));
        return 'link';
    }

    ns.share = {
        composeText,
        copyItem,
        prepareFile,
        shareItem,
        shareLink
    };
})();
