let lastCanvasDataUrl = null;
let lastQuoteText = "";
let lastQuoteSection = null;
document.addEventListener('DOMContentLoaded', function () {
    // Paylaş butonuna tıklandığında
    document.querySelectorAll('.share-quote').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const targetId = btn.getAttribute('data-target');
            const targetElem = document.getElementById(targetId);
            if (!targetElem) return;

            // Metin içeriğini al
            lastQuoteText = targetElem.innerText || "";

            // Quote section'ı sakla
            lastQuoteSection = btn.closest('.quote-section');
            if (!lastQuoteSection) return;

            // Web Share API kontrolü
            if (navigator.share) {
                // Web Share API varsa, resmi oluştur ve paylaş
                createImage().then(canvas => {
                    shareImage(canvas);
                }).catch(error => {
                    console.error('Resim oluşturma hatası:', error);
                    showSharePanel();
                });
            } else {
                // Web Share API yoksa, paylaşım panelini göster
                showSharePanel();
            }
        });
    });

    // Resmi oluştur - Promise döndüren tek bir fonksiyon
    function createImage() {
        return new Promise((resolve, reject) => {
            if (!lastQuoteSection) {
                reject(new Error('Quote section bulunamadı'));
                return;
            }

            // Geçici kapsayıcı oluştur ve padding ekle
            const tempContainer = document.createElement('div');
            tempContainer.style.padding = '15px';
            tempContainer.style.background = '#fff';
            tempContainer.style.display = 'flex';
            tempContainer.style.flexDirection = 'column';
            tempContainer.style.alignItems = 'center';
            tempContainer.style.justifyContent = 'center'
            tempContainer.style.boxSizing = 'border-box';
            tempContainer.style.width = (lastQuoteSection.offsetWidth) + 'px';

            // Orijinal içeriği klonla ve kapsayıcıya ekle
            const clonedContent = lastQuoteSection.cloneNode(true);

            // Klonlanan içerikteki .share-quote ve .refresh-quote butonlarını kaldır
            clonedContent.querySelectorAll('.share-quote, .refresh-quote').forEach(btn => btn.remove());

            tempContainer.appendChild(clonedContent);
            document.body.appendChild(tempContainer);

            html2canvas(tempContainer, {
                backgroundColor: null,
                useCORS: true,
                scale: Math.max(3, window.devicePixelRatio || 1),
                willReadFrequently: true
            }).then(function (canvas) {
                // Geçici kapsayıcıyı kaldır
                document.body.removeChild(tempContainer);

                lastCanvasDataUrl = canvas.toDataURL('image/png');
                resolve(canvas);
            }).catch(function (error) {
                if (tempContainer.parentNode) document.body.removeChild(tempContainer);
                console.error('Canvas oluşturma hatası:', error);
                reject(error);
            });
        });
    }

    // Web Share API ile paylaş
    function shareImage(canvas) {
        canvas.toBlob(function (blob) {
            // Dosya adı oluştur
            const fileName = 'bir-soz.png';

            // Blob'dan dosya oluştur
            const file = new File([blob], fileName, { type: 'image/png' });

            // Paylaşım verilerini hazırla
            const shareData = {
                title: 'Çatı Katı Elazığ - Bir Söz',
                text: lastQuoteText,
                files: [file]
            };

            // Paylaşım menüsünü aç
            navigator.share(shareData)

                .catch((error) => {
                    console.error('Paylaşım hatası:', error);
                    showSharePanel();
                });
        }, 'image/png');
    }

    // Paylaşım panelini göster
    function showSharePanel() {
        const panel = document.getElementById('sharePanel');
        panel.style.display = 'flex';

        // WhatsApp ve Twitter butonlarını tekrar görünür yap
        const whatsappBtn = document.getElementById('shareWhatsappBtn');
        const twitterBtn = document.getElementById('shareTwitterBtn');
        if (whatsappBtn) whatsappBtn.style.display = 'flex';
        if (twitterBtn) twitterBtn.style.display = 'flex';

        // Panel dışına tıklanınca paneli kapat
        setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutsidePanel);
        }, 0);
    }

    // Paylaşım panelini gizle
    function hideSharePanel() {
        const panel = document.getElementById('sharePanel');
        panel.style.display = 'none';
        document.removeEventListener('mousedown', handleClickOutsidePanel);
    }

    // Resmi indir
    function downloadImage(dataUrl) {
        try {
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = 'bir-soz.png';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            hideSharePanel();
        } catch (error) {
            console.error('İndirme hatası:', error);
            alert('Resim indirilemedi. Lütfen tekrar deneyin.');
        }
    }

    // Panel dışına tıklama kontrolü
    function handleClickOutsidePanel(event) {
        const panelContent = document.querySelector('.share-panel-content');
        const panelWrapper = document.getElementById('sharePanel');
        if (panelWrapper.style.display !== 'none') {
            if (panelContent && !panelContent.contains(event.target)) {
                hideSharePanel();
            }
        }
    }

    // Kapat butonuna tıklandığında
    document.getElementById('closeSharePanel').addEventListener('click', hideSharePanel);

    // İndir butonuna tıklandığında (sadece metin/canvas için)
    document.getElementById('downloadImageBtn').addEventListener('click', function (e) {
        // Eğer sadece görsel paylaşımı için panel açıldıysa bu fonksiyon çalışmasın
        if (this.dataset.imageShare === "true") return;
        createImage().then((canvas) => {
            const dataUrl = canvas.toDataURL('image/png');
            downloadImage(dataUrl);
        }).catch(error => {
            console.error('Resim oluşturma hatası:', error);
            alert('Resim oluşturulamadı. Lütfen tekrar deneyin.');
        });
    });

    // --- Sadece quote görseli paylaşımı için özel kod ---
    const shareQuoteImageBtn = document.getElementById('shareQuoteImageBtn');
    if (shareQuoteImageBtn) {
        shareQuoteImageBtn.addEventListener('click', async function () {
            const img = document.getElementById('quoteImage');
            if (!img || !img.src || img.style.display === 'none') {
                alert('Paylaşılacak bir görsel bulunamadı.');
                return;
            }

            // Web Share API ile resmi paylaşmayı dene
            if (navigator.canShare && navigator.canShare({ files: [new File([], '')] })) {
                try {
                    const response = await fetch(img.src);
                    const blob = await response.blob();
                    const file = new File([blob], 'bir-soz-resim.webp', { type: blob.type });

                    await navigator.share({
                        files: [file],
                        title: 'Çatı Katı Elazığ - Bir Söz Görseli'
                    });
                    return;
                } catch (err) {
                    // Paylaşım başarısızsa paneli göster
                }
            }

            // Web Share API yoksa veya başarısızsa paneli göster
            document.getElementById('sharePanel').style.display = 'flex';
            document.getElementById('shareWhatsappBtn').style.display = 'none';
            document.getElementById('shareTwitterBtn').style.display = 'none';
            const downloadBtn = document.getElementById('downloadImageBtn');
            downloadBtn.style.display = 'flex';

            // Sadece bu durumda çalışacak şekilde işaretle
            downloadBtn.dataset.imageShare = "true";

            // Önceki click event'ini kaldırmak için butonu klonla ve değiştir
            const newBtn = downloadBtn.cloneNode(true);
            downloadBtn.parentNode.replaceChild(newBtn, downloadBtn);

            newBtn.dataset.imageShare = "true";
            newBtn.onclick = function () {
                const a = document.createElement('a');
                a.href = img.src;
                a.download = 'bir-soz-resim.webp';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                hideSharePanel();
                // Panel kapandıktan sonra flag'i sıfırla
                newBtn.dataset.imageShare = "false";
            };

            setTimeout(() => {
                document.addEventListener('mousedown', handleClickOutsidePanel);
            }, 0);
        });
    }

    // WhatsApp paylaşımı
    document.getElementById('shareWhatsappBtn').addEventListener('click', function () {
        // WhatsApp'ta paylaşılacak metin
        const text = encodeURIComponent(lastQuoteText || 'Çatı Katı Elazığ');

        // WhatsApp paylaşım URL'i
        window.open('https://wa.me/?text=' + text, '_blank');
        hideSharePanel();
    });

    // Twitter paylaşımı
    document.getElementById('shareTwitterBtn').addEventListener('click', function () {
        // Twitter'da paylaşılacak metin
        const tweetText = encodeURIComponent((lastQuoteText || '').substring(0, 300) + " #ÇatıKatıElazığ");

        // Twitter paylaşım URL'i
        window.open('https://twitter.com/intent/tweet?text=' + tweetText, '_blank');
        hideSharePanel();
    });

});