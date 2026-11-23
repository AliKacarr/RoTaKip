(function () {
    const ns = window.RoTaKipTefekkur;
    const ARABIC_FONT = '"KFGQPC Uthman Taha Naskh", "Amiri", "Noto Naskh Arabic", "Traditional Arabic", serif';
    const CARD_WIDTH = 1080;
    const CARD_PADDING = 104;
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

    // Metin içerikleri, ekrandaki kart tasarımına benzeyen kare/dikey bir görsele çizilir.
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
        const bodySize = textLength > 900 ? 30 : textLength > 450 ? 34 : 40;

        const blocks = [];
        blocks.push({ type: 'label', font: `700 26px ${sans}`, color: '#8a8f98', lines: [label.toLocaleUpperCase('tr-TR')], lineHeight: 34, gapAfter: 40 });
        blocks.push({ type: 'rule', color: '#111', height: 8, gapAfter: 56 });
        if (item.arabic) {
            context.font = `400 76px ${ARABIC_FONT}`;
            context.direction = 'rtl';
            blocks.push({ type: 'text', font: context.font, color: '#111', lines: wrapLines(context, item.arabic, contentWidth), lineHeight: 124, gapAfter: 28, rtl: true });
            context.direction = 'ltr';
        }
        if (item.title) {
            context.font = `700 60px ${sans}`;
            blocks.push({ type: 'text', font: context.font, color: '#111', lines: wrapLines(context, item.title, contentWidth), lineHeight: 74, gapAfter: 26 });
        }
        if (item.text) {
            context.font = `400 ${bodySize}px ${sans}`;
            blocks.push({ type: 'text', font: context.font, color: '#333', lines: wrapLines(context, item.text, contentWidth), lineHeight: Math.round(bodySize * 1.5), gapAfter: 24 });
        }
        if (item.caption) {
            context.font = `italic 400 30px ${sans}`;
            blocks.push({ type: 'text', font: context.font, color: '#6b7280', lines: wrapLines(context, `— ${item.caption}`, contentWidth), lineHeight: 42, gapAfter: 24 });
        }
        blocks.push({ type: 'rule', color: '#c4c7cc', height: 8, gapBefore: 32, gapAfter: 0 });

        const blockHeight = block => (block.type === 'rule' ? block.height : block.lines.length * block.lineHeight);
        const contentHeight = blocks.reduce((sum, block) => sum + (block.gapBefore || 0) + blockHeight(block) + block.gapAfter, 0);
        const footerHeight = 90;
        const height = Math.max(CARD_WIDTH, contentHeight + CARD_PADDING * 2 + footerHeight);

        canvas.width = CARD_WIDTH;
        canvas.height = height;
        context.fillStyle = '#fff';
        context.fillRect(0, 0, CARD_WIDTH, height);
        context.textAlign = 'center';
        context.textBaseline = 'middle';

        let y = Math.max(CARD_PADDING, (height - footerHeight - contentHeight) / 2);
        blocks.forEach(block => {
            y += block.gapBefore || 0;
            if (block.type === 'rule') {
                context.fillStyle = block.color;
                context.beginPath();
                const ruleWidth = 128;
                const x = (CARD_WIDTH - ruleWidth) / 2;
                if (typeof context.roundRect === 'function') context.roundRect(x, y, ruleWidth, block.height, block.height / 2);
                else context.rect(x, y, ruleWidth, block.height);
                context.fill();
                y += block.height + block.gapAfter;
                return;
            }
            context.font = block.font;
            context.fillStyle = block.color;
            context.direction = block.rtl ? 'rtl' : 'ltr';
            block.lines.forEach(line => {
                context.fillText(line, CARD_WIDTH / 2, y + block.lineHeight / 2);
                y += block.lineHeight;
            });
            context.direction = 'ltr';
            y += block.gapAfter;
        });

        context.font = `600 26px ${sans}`;
        context.fillStyle = '#9aa0a8';
        context.fillText('RoTaKip · Tefekkür', CARD_WIDTH / 2, height - footerHeight / 2 - 10);

        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob(result => (result ? resolve(result) : reject(new Error('Görsel oluşturulamadı'))), 'image/png');
        });
        return new File([blob], 'tefekkur.png', { type: 'image/png' });
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
                            ns.toast('Kopyalandı');
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
                data.files = [file];
                if (text) data.text = text;
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
        shareItem
    };
})();
