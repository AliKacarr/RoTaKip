// Genel Paylaşma Yardımcı Fonksiyonları

// Paylaş işlemi devam ediyor mu kontrolü (her modal için ayrı)
const shareProcessingFlags = new Map(); // modalId -> { isProcessing: bool, cancel: bool }

// Modal yapılandırmaları
function getShareModalConfig(modalId) {
    const configs = {
        'tableShareModal': {
            modal: 'tableShareModal',
            title: 'tableShareModalTitle',
            image: 'tableShareImage',
            imageContainer: '.table-share-image-container',
            footer: '.table-share-modal-footer',
            downloadBtn: 'downloadTableImageBtn',
            shareBtn: 'shareTableImageBtn',
            closeBtn: 'closeTableShareModal'
        },
        'monthShareModal': {
            modal: 'monthShareModal',
            title: 'monthShareModalTitle',
            image: 'monthShareImage',
            imageContainer: '.month-share-image-container',
            footer: '.month-share-modal-footer',
            downloadBtn: 'downloadMonthImageBtn',
            shareBtn: 'shareMonthImageBtn',
            closeBtn: 'closeMonthShareModal'
        },
        'longestSeriesShareModal': {
            modal: 'longestSeriesShareModal',
            title: 'longestSeriesShareModalTitle',
            image: 'longestSeriesShareImage',
            imageContainer: '.longest-series-share-image-container',
            footer: '.longest-series-share-modal-footer',
            downloadBtn: 'downloadLongestSeriesImageBtn',
            shareBtn: 'shareLongestSeriesImageBtn',
            closeBtn: 'closeLongestSeriesShareModal'
        },
        'readingStatsShareModal': {
            modal: 'readingStatsShareModal',
            title: 'readingStatsShareModalTitle',
            image: 'readingStatsShareImage',
            imageContainer: '.reading-stats-share-image-container',
            footer: '.reading-stats-share-modal-footer',
            downloadBtn: 'downloadReadingStatsImageBtn',
            shareBtn: 'shareReadingStatsImageBtn',
            closeBtn: 'closeReadingStatsShareModal'
        }
    };
    return configs[modalId];
}

// Genel paylaşma fonksiyonu - herhangi bir container'ı resme çevirir
async function shareContainerAsImage(config) {
    const {
        container,
        modalId,
        titleText,
        fileNamePrefix,
        shareTitle,
        shareText,
        onRestore,
        prepareImages = null // Opsiyonel: resimleri hazırlamak için fonksiyon
    } = config;
    
    const modalConfig = getShareModalConfig(modalId);
    if (!modalConfig) {
        console.error(`Modal yapılandırması bulunamadı: ${modalId}`);
        return;
    }
    
    try {
        // Eğer zaten bir paylaş işlemi devam ediyorsa yeni talep oluşturma
        const flags = shareProcessingFlags.get(modalId) || { isProcessing: false, cancel: false };
        if (flags.isProcessing) {
            return;
        }

        // Container görünür mü kontrol et
        if (!container || container.style.display === 'none') {
            console.warn('Container görünür değil');
            return;
        }

        // İşlem başladı flag'ini set et ve iptal flag'ini sıfırla
        shareProcessingFlags.set(modalId, { isProcessing: true, cancel: false });

        // Modal'ı hemen aç (loading durumunda)
        showShareModalLoading(modalId, titleText);

        // Resimleri hazırla (eğer fonksiyon sağlandıysa)
        if (prepareImages) {
            await prepareImages();
        }

        // İptal kontrolü
        let currentFlags = shareProcessingFlags.get(modalId);
        if (currentFlags && currentFlags.cancel) {
            if (onRestore) onRestore();
            shareProcessingFlags.set(modalId, { isProcessing: false, cancel: false });
            return;
        }

        // Container'ı geçici bir div'e al (padding için)
        const tempContainer = document.createElement('div');
        tempContainer.style.cssText = 'background: #ffffff; display: block;';
        const parent = container.parentNode;
        const nextSibling = container.nextSibling;
        
        // Container'ı geçici container'a taşı
        tempContainer.appendChild(container);
        if (nextSibling) {
            parent.insertBefore(tempContainer, nextSibling);
        } else {
            parent.appendChild(tempContainer);
        }

        // İptal kontrolü
        currentFlags = shareProcessingFlags.get(modalId);
        if (currentFlags && currentFlags.cancel) {
            requestAnimationFrame(() => {
                if (nextSibling) {
                    parent.insertBefore(container, nextSibling);
                } else {
                    parent.appendChild(container);
                }
                parent.removeChild(tempContainer);
                if (onRestore) onRestore();
            });
            shareProcessingFlags.set(modalId, { isProcessing: false, cancel: false });
            return;
        }

        // html2canvas ile container'ı resme çevir
        const canvas = await html2canvas(tempContainer, {
            backgroundColor: '#ffffff',
            scale: 2,
            logging: false,
            useCORS: true,
            allowTaint: false
        });

        // Container'ı geri yerine koy
        requestAnimationFrame(() => {
            if (nextSibling) {
                parent.insertBefore(container, nextSibling);
            } else {
                parent.appendChild(container);
            }
            parent.removeChild(tempContainer);
        });

        // İptal kontrolü
        currentFlags = shareProcessingFlags.get(modalId);
        if (currentFlags && currentFlags.cancel) {
            shareProcessingFlags.set(modalId, { isProcessing: false, cancel: false });
            return;
        }

        // Resmi daha büyük bir beyaz canvas'ın ortasına yerleştir (padding için)
        const paddingPx = 20;
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = canvas.width + (paddingPx * 2);
        finalCanvas.height = canvas.height + (paddingPx * 2);
        
        const ctx = finalCanvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
        ctx.drawImage(canvas, paddingPx, paddingPx);

        // Canvas'ı blob'a çevir
        try {
            const finalBlob = await new Promise((resolve, reject) => {
                finalCanvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('Blob oluşturulamadı'));
                }, 'image/png', 0.95);
            });
            
            // İptal kontrolü
            currentFlags = shareProcessingFlags.get(modalId);
            if (currentFlags && currentFlags.cancel) {
                shareProcessingFlags.set(modalId, { isProcessing: false, cancel: false });
                return;
            }

            const fileName = `${fileNamePrefix}-${titleText.replace(/\s+/g, '-')}-${Date.now()}.png`;
            const imageUrl = URL.createObjectURL(finalBlob);

            // Modal'ı resim ile güncelle
            showShareModalReady(modalId, titleText, imageUrl, finalBlob, fileName, shareTitle, shareText, onRestore);

            shareProcessingFlags.set(modalId, { isProcessing: false, cancel: false });
        } catch (blobError) {
            console.error('Blob oluşturma hatası:', blobError);
            closeShareModal(modalId, onRestore);
            shareProcessingFlags.set(modalId, { isProcessing: false, cancel: false });
            throw blobError;
        }
    } catch (error) {
        console.error('Container paylaşılırken hata oluştu:', error);
        closeShareModal(modalId, onRestore);
        shareProcessingFlags.set(modalId, { isProcessing: false, cancel: false });
    }
}

// Modal'ı loading durumunda göster (genel)
function showShareModalLoading(modalId, titleText) {
    const config = getShareModalConfig(modalId);
    if (!config) return;

    const modal = document.getElementById(config.modal);
    const modalTitle = document.getElementById(config.title);
    const modalImage = document.getElementById(config.image);
    const imageContainer = document.querySelector(config.imageContainer);
    const footer = document.querySelector(config.footer);
    
    if (!modal || !modalTitle || !modalImage || !imageContainer) return;

    modalTitle.textContent = titleText;
    modalImage.style.display = 'none';
    
    let loadingMessage = imageContainer.querySelector('.share-loading-message');
    if (!loadingMessage) {
        loadingMessage = document.createElement('div');
        loadingMessage.className = 'share-loading-message';
        const loadingText = document.createElement('span');
        loadingText.textContent = 'Resim hazırlanıyor...';
        loadingMessage.appendChild(loadingText);
        imageContainer.appendChild(loadingMessage);
    }
    loadingMessage.style.display = 'flex';

    if (footer) {
        footer.style.display = 'none';
    }

    modal.style.display = 'block';
    setTimeout(() => {
        modal.classList.add('show');
    }, 10);
}

// Modal'ı resim hazır olduğunda güncelle (genel)
function showShareModalReady(modalId, titleText, imageUrl, blob, fileName, shareTitle, shareText, onRestore) {
    const config = getShareModalConfig(modalId);
    if (!config) return;

    const modal = document.getElementById(config.modal);
    const modalTitle = document.getElementById(config.title);
    const modalImage = document.getElementById(config.image);
    const imageContainer = document.querySelector(config.imageContainer);
    const footer = document.querySelector(config.footer);
    
    if (!modal || !modalTitle || !modalImage || !imageContainer) return;

    const flags = shareProcessingFlags.get(modalId);
    if (flags && flags.cancel) {
        closeShareModal(modalId, onRestore);
        return;
    }

    const loadingMessage = imageContainer.querySelector('.share-loading-message');
    if (loadingMessage) {
        loadingMessage.style.display = 'none';
    }

    modalImage.style.display = 'block';
    modalImage.style.opacity = '0';
    modalImage.style.maxHeight = '0px';
    modalImage.style.overflow = 'hidden';
    modalImage.src = imageUrl;
    
    modalImage.onload = function() {
        const flags = shareProcessingFlags.get(modalId);
        if (flags && flags.cancel) {
            return;
        }
        
        const naturalHeight = this.naturalHeight;
        const containerWidth = imageContainer.getBoundingClientRect().width - 20;
        const naturalWidth = this.naturalWidth;
        
        let calculatedHeight = naturalHeight;
        if (naturalWidth > containerWidth && containerWidth > 0) {
            const scale = containerWidth / naturalWidth;
            calculatedHeight = naturalHeight * scale;
        }
        
        requestAnimationFrame(() => {
            const flags = shareProcessingFlags.get(modalId);
            if (flags && flags.cancel) {
                return;
            }
            this.style.opacity = '1';
            this.style.maxHeight = calculatedHeight + 'px';
            this.style.overflow = 'visible';
        });
    };

    if (footer) {
        footer.style.display = 'flex';
    }

    // İndir butonu
    const downloadBtn = document.getElementById(config.downloadBtn);
    if (downloadBtn) {
        const newDownloadBtn = downloadBtn.cloneNode(true);
        downloadBtn.parentNode.replaceChild(newDownloadBtn, downloadBtn);
        
        newDownloadBtn.addEventListener('click', () => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        });
    }

    // Paylaş butonu
    const shareBtn = document.getElementById(config.shareBtn);
    if (shareBtn) {
        const newShareBtn = shareBtn.cloneNode(true);
        shareBtn.parentNode.replaceChild(newShareBtn, shareBtn);
        
        newShareBtn.addEventListener('click', async () => {
            try {
                if (navigator.share && navigator.canShare) {
                    const file = new File([blob], fileName, { type: 'image/png' });
                    const shareData = {
                        title: shareTitle || 'Paylaş',
                        text: shareText || titleText,
                        files: [file]
                    };

                    if (navigator.canShare(shareData)) {
                        await navigator.share(shareData);
                        console.log(`${titleText} Web Share API ile paylaşıldı`);
                        closeShareModal(modalId, onRestore);
                    }
                } else {
                    console.warn('Web Share API desteklenmiyor');
                }
            } catch (shareError) {
                if (shareError.name !== 'AbortError') {
                    console.log('Web Share API hatası:', shareError);
                }
            }
        });
    }
}

// Modal'ı kapat (genel)
function closeShareModal(modalId, onRestore) {
    const config = getShareModalConfig(modalId);
    if (!config) return;

    const flags = shareProcessingFlags.get(modalId);
    if (flags && flags.isProcessing) {
        flags.cancel = true;
        shareProcessingFlags.set(modalId, flags);
    }
    
    const modal = document.getElementById(config.modal);
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
            const modalImage = document.getElementById(config.image);
            if (modalImage && modalImage.src) {
                URL.revokeObjectURL(modalImage.src);
                modalImage.src = '';
                modalImage.style.display = 'none';
                modalImage.style.opacity = '';
                modalImage.style.maxHeight = '';
                modalImage.style.overflow = '';
            }
            
            const imageContainer = document.querySelector(config.imageContainer);
            if (imageContainer) {
                const loadingMessage = imageContainer.querySelector('.share-loading-message');
                if (loadingMessage) {
                    loadingMessage.remove();
                }
            }
            
            if (onRestore) {
                onRestore();
            }
        }, 300);
    }
}

// Modal setup fonksiyonu (genel)
function setupShareModal(modalId, closeBtnId, onRestore) {
    const config = getShareModalConfig(modalId);
    if (!config) return;

    const closeBtn = document.getElementById(closeBtnId || config.closeBtn);
    if (closeBtn) {
        closeBtn.addEventListener('click', () => closeShareModal(modalId, onRestore));
    }

    const modal = document.getElementById(config.modal);
    if (modal) {
        // Overlay class'ını kontrol et (tüm paylaş modal overlay'leri için)
        const overlay = modal.querySelector('.table-share-modal-overlay') || 
                       modal.querySelector('.month-share-modal-overlay') || 
                       modal.querySelector('.longest-series-share-modal-overlay') ||
                       modal.querySelector('.reading-stats-share-modal-overlay') ||
                       modal.querySelector('.share-modal-overlay');
        if (overlay) {
            overlay.addEventListener('click', () => closeShareModal(modalId, onRestore));
        }
    }
}

// Global olarak erişilebilir yap
window.shareContainerAsImage = shareContainerAsImage;
window.setupShareModal = setupShareModal;
window.getShareModalConfig = getShareModalConfig;
window.showShareModalLoading = showShareModalLoading;
window.showShareModalReady = showShareModalReady;
window.closeShareModal = closeShareModal;
