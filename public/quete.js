document.addEventListener('DOMContentLoaded', function () {
    // Tüm yenileme butonlarını seç

    const quote = document.querySelector('.quote');
    const refreshQuoteButtons = document.querySelectorAll('.refresh-quote');
    
    // Her buton için animasyonu başlat
    refreshQuoteButtons.forEach(button => {
        const icon = button.querySelector('i');
        if (icon) {
            // Her 30 saniyede bir animasyonu tetikle
            setInterval(() => {
                icon.classList.add('attention');
                // Animasyon bittikten sonra sınıfı kaldır
                setTimeout(() => {
                    icon.classList.remove('attention');
                }, 1500); // Animasyon süresi kadar bekle
            }, 10000); // 10 saniye
        }
    });

    // Tüm alıntı metinlerine tıklama olayı ekle
    document.querySelectorAll('.quote-text').forEach(element => {
        element.addEventListener('click', async function() {
            try {
                // Mevcut yüksekliği kaydet
                const currentHeight = this.offsetHeight;
                this.style.height = currentHeight - 4 + 'px';
                
                // Metni panoya kopyala
                await navigator.clipboard.writeText(this.textContent);
                
                // Kopyalandı bildirimi göster
                const originalText = this.textContent;
                this.textContent = '✓ Kopyalandı!';
                this.style.color = '#4CAF50';
                
                // 1.5 saniye sonra orijinal metne geri dön
                setTimeout(() => {
                    this.textContent = originalText;
                    this.style.color = '#454545';
                    // Yüksekliği tekrar auto yap
                    this.style.height = 'auto';
                }, 1500);
            } catch (err) {
                console.error('Kopyalama hatası:', err);
                // Hata durumunda da yüksekliği auto yap
                this.style.height = 'auto';
            }
        });
    });

    // Intersection Observer'ı oluştur
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Inline style'ları kaldır ve visible sınıfını ekle
                entry.target.style.opacity = '';
                entry.target.style.transform = '';
                entry.target.classList.add('visible');
            } else {
                // Element görünür alandan çıktığında visible sınıfını kaldır ve tekrar gizle
                entry.target.classList.remove('visible');
                entry.target.style.opacity = '0';
                entry.target.style.transform = 'translateY(30px)';
            }
        });
    }, {
        threshold: 0.1, // Elementin %10'u görünür olduğunda tetikle
        rootMargin: '50px' // Element ekranın 50px yakınına geldiğinde tetikle
    });

    // Tüm alıntı bölümlerini gözlemle
    document.querySelectorAll('.quote-section, .quote-section-image').forEach(section => {
        observer.observe(section);
    });

    // Sayfa yüklendiğinde tüm quote-section'ları manuel olarak gizle
    document.querySelectorAll('.quote-section, .quote-section-image').forEach(section => {
        section.style.opacity = '0';
        section.style.transform = 'translateY(30px)';
    });
    
    // Mevcut içerikleri görünür yap
    document.querySelectorAll('.quote-text').forEach(element => {
        if (element.innerHTML.trim() !== '') {
            element.classList.add('visible');
        }
    });
    
    const quoteImage = document.getElementById('quoteImage');
    if (quoteImage && quoteImage.style.display !== 'none') {
        quoteImage.classList.add('visible');
    }

    const refreshBtn = document.getElementById('refreshQuote');
    if (refreshBtn) {
        refreshBtn.onclick = function () {
            fetchRandomQuote();
            logUnauthorizedAccess('Bir söz yenileme');
            this.classList.add('refresh-quote-spinning');
            setTimeout(() => {
                this.classList.remove('refresh-quote-spinning');
            }, 1000);
        };
    }

    const refreshImageBtn = document.getElementById('refreshQuoteImage');
    if (refreshImageBtn) {
        refreshImageBtn.onclick = function () {
            fetchRandomQuoteImage();
            logUnauthorizedAccess('Bir söz resmi yenileme');
            this.classList.add('refresh-quote-spinning');
            setTimeout(() => {
                this.classList.remove('refresh-quote-spinning');
            }, 1000);
        };
    }

    const refreshAyatButton = document.getElementById('refreshAyat');
    if (refreshAyatButton) {
        refreshAyatButton.onclick = function () {
            fetchRandomAyet();
            logUnauthorizedAccess('Bir ayet yenileme');
            this.classList.add('refresh-quote-spinning');
            setTimeout(() => {
                this.classList.remove('refresh-quote-spinning');
            }, 1000);
        };
    }

    const refreshHadithButton = document.getElementById('refreshHadith');
    if (refreshHadithButton) {
        refreshHadithButton.onclick = function () {
            fetchRandomHadis();
            logUnauthorizedAccess('Bir hadis yenileme');
            this.classList.add('refresh-quote-spinning');
            setTimeout(() => {
                this.classList.remove('refresh-quote-spinning');
            }, 1000);
        };
    }

    const refreshDuaButton = document.getElementById('refreshDua');
    if (refreshDuaButton) {
        refreshDuaButton.onclick = function () {
            fetchRandomDua();
            logUnauthorizedAccess('Bir dua yenileme');
            this.classList.add('refresh-quote-spinning');
            setTimeout(() => {
                this.classList.remove('refresh-quote-spinning');
            }, 1000);
        };
    }
});

async function fetchRandomQuote() {
    try {
        const quoteTextElement = document.getElementById('quoteText');
        if (quoteTextElement) {
            // Önce visible sınıfını kaldır (gizle)
            quoteTextElement.classList.remove('visible');
            
            const response = await fetch('/api/random-quote');
            const data = await response.json();

            // Update with the new quote
            quoteTextElement.innerHTML = data.sentence;
            
            // Animasyonu tetikle
            setTimeout(() => {
                quoteTextElement.classList.add('visible');
            }, 50);
        }
    } catch (error) {
        console.error('Bir söz yüklenemedi:', error);
        const quoteTextElement = document.getElementById('quoteText');
        if (quoteTextElement) {
            quoteTextElement.innerHTML = 'Günün sözü yüklenemedi.';
            quoteTextElement.classList.add('visible');
        }
    }
}

async function fetchRandomQuoteImage() {
    const img = document.getElementById('quoteImage');
    if (!img) return;

    try {
        // Önce visible sınıfını kaldır (gizle)
        img.classList.remove('visible');
        
        const response = await fetch('/api/quote-images');
        const data = await response.json();
        const images = data.images;
        if (!images || images.length === 0) {
            img.style.display = 'none';
            return;
        }
        const randomIndex = Math.floor(Math.random() * images.length);
        img.src = `quotes/${images[randomIndex]}`;
        img.style.display = 'block';
        
        // Animasyonu tetikle
        setTimeout(() => {
            img.classList.add('visible');
        }, 50);
    } catch (error) {
        img.style.display = 'none';
        console.error('Bir söz resmi yüklenemedi:', error);
    }
}

async function fetchRandomAyet() {
    try {
        const ayatTextElement = document.getElementById('ayatText');
        if (ayatTextElement) {
            // Önce visible sınıfını kaldır (gizle)
            ayatTextElement.classList.remove('visible');
            
            const response = await fetch('/api/random-ayet');
            if (!response.ok) {
                throw new Error('Ayet getirme hatası');
            }
            const data = await response.json();

            // Ayet metnini sayfada göster
            ayatTextElement.innerHTML = data.sentence || 'Ayet yüklenemedi';
            
            // Animasyonu tetikle
            setTimeout(() => {
                ayatTextElement.classList.add('visible');
            }, 50);
        }
    } catch (error) {
        console.error('Bir ayet yüklenemedi:', error);
        const ayatTextElement = document.getElementById('ayatText');
        if (ayatTextElement) {
            ayatTextElement.innerHTML = 'Ayet yüklenemedi';
            ayatTextElement.classList.add('visible');
        }
    }
}

// Rastgele hadis getirme fonksiyonu
async function fetchRandomHadis() {
    try {
        const hadithTextElement = document.getElementById('hadithText');
        if (hadithTextElement) {
            // Önce visible sınıfını kaldır (gizle)
            hadithTextElement.classList.remove('visible');
            
            const response = await fetch('/api/random-hadis');
            if (!response.ok) {
                throw new Error('Hadis getirme hatası');
            }
            const data = await response.json();

            // Hadis metnini sayfada göster
            hadithTextElement.innerHTML = data.sentence || 'Hadis yüklenemedi';
            
            // Animasyonu tetikle
            setTimeout(() => {
                hadithTextElement.classList.add('visible');
            }, 50);
        }
    } catch (error) {
        console.error('Bir hadis yüklenemedi:', error);
        const hadithTextElement = document.getElementById('hadithText');
        if (hadithTextElement) {
            hadithTextElement.innerHTML = 'Hadis yüklenemedi';
            hadithTextElement.classList.add('visible');
        }
    }
}

async function fetchRandomDua() {
    try {
        const duaTextElement = document.getElementById('duaText');
        if (duaTextElement) {
            // Önce visible sınıfını kaldır (gizle)
            duaTextElement.classList.remove('visible');
            
            const response = await fetch('/api/random-dua');
            if (!response.ok) {
                throw new Error('Dua getirme hatası');
            }
            const data = await response.json();

            // Dua metnini sayfada göster
            duaTextElement.innerHTML = data.sentence || 'Dua yüklenemedi';
            
            // Animasyonu tetikle
            setTimeout(() => {
                duaTextElement.classList.add('visible');
            }, 50);
        }
    } catch (error) {
        console.error('Bir dua yüklenemedi:', error);
        const duaTextElement = document.getElementById('duaText');
        if (duaTextElement) {
            duaTextElement.innerHTML = 'Dua yüklenemedi';
            duaTextElement.classList.add('visible');
        }
    }
}
