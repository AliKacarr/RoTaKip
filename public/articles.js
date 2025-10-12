// ==================== Articles Section JavaScript ====================

class ArticlesManager {
    constructor() {
        this.articles = [];
        this.filteredArticles = [];
        this.categories = [];
        this.currentCategory = 'all';
        this.currentPage = 0;
        this.articlesPerPage = 4;
        this.isLoading = false;
        this.hasMoreArticles = true;
        
        this.init();
    }

    init() {
        this.loadArticles();
        this.attachEventListeners();
    }

    attachEventListeners() {
        // Kategori butonları
        document.addEventListener('click', (e) => {
            if (e.target.closest('.category-btn')) {
                // Makale kategori değiştirme işlemini logla
                if (typeof logUnauthorizedAccess === 'function') {
                    logUnauthorizedAccess('Makale kategori değiştirme');
                }
                
                const btn = e.target.closest('.category-btn');
                const category = btn.dataset.category;
                this.filterByCategory(category);
            }
        });

        // Daha fazla yükle butonu
        const loadMoreBtn = document.getElementById('loadMoreArticles');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => {
                // Daha fazla makale yükleme işlemini logla
                if (typeof logUnauthorizedAccess === 'function') {
                    logUnauthorizedAccess('Daha fazla makale yükleme');
                }
                
                this.loadMoreArticles();
            });
        }
    }

    async loadArticles() {
        try {
            this.isLoading = true;
            this.showLoadingState();

            const response = await fetch('/api/articles');
            if (!response.ok) {
                throw new Error('Makaleler yüklenemedi');
            }

            const data = await response.json();
            this.articles = data.articles || [];
            this.categories = data.categories || [];
            
            // Rastgele sırala
            this.shuffleArray(this.articles);
            
            this.setupCategories();
            this.filterByCategory('all');
            
        } catch (error) {
            console.error('Makaleler yüklenirken hata:', error);
            this.showErrorState();
        } finally {
            this.isLoading = false;
        }
    }

    setupCategories() {
        const categoriesContainer = document.querySelector('.articles-categories');
        if (!categoriesContainer) return;

        // Mevcut kategorileri temizle (Tümü butonu hariç)
        const allBtn = categoriesContainer.querySelector('[data-category="all"]');
        categoriesContainer.innerHTML = '';
        if (allBtn) {
            categoriesContainer.appendChild(allBtn);
        }

        // Kategori butonlarını ekle
        this.categories.forEach(category => {
            const btn = document.createElement('button');
            btn.className = 'category-btn';
            btn.dataset.category = category;
            btn.innerHTML = `<i class="fa-solid fa-tag"></i> ${category}`;
            categoriesContainer.appendChild(btn);
        });
    }

    filterByCategory(category) {
        this.currentCategory = category;
        this.currentPage = 0;
        this.hasMoreArticles = true;

        // Aktif kategori butonunu güncelle
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-category="${category}"]`).classList.add('active');

        // Makaleleri filtrele
        if (category === 'all') {
            this.filteredArticles = [...this.articles];
        } else {
            this.filteredArticles = this.articles.filter(article => 
                article.category === category
            );
        }

        // Rastgele sırala
        this.shuffleArray(this.filteredArticles);

        // Geçiş efekti ile render et
        this.renderArticlesWithTransition();
    }

    async loadMoreArticles() {
        if (this.isLoading || !this.hasMoreArticles) return;

        try {
            this.isLoading = true;
            this.updateLoadMoreButton(true);

            // Simüle edilmiş gecikme (gerçek API çağrısı için)
            await new Promise(resolve => setTimeout(resolve, 500));

            this.currentPage++;
            this.renderArticles();

        } catch (error) {
            console.error('Daha fazla makale yüklenirken hata:', error);
        } finally {
            this.isLoading = false;
            this.updateLoadMoreButton(false);
        }
    }

    renderArticlesWithTransition() {
        const container = document.getElementById('articlesContainer');
        if (!container) return;

        const startIndex = 0;
        const endIndex = (this.currentPage + 1) * this.articlesPerPage;
        const articlesToShow = this.filteredArticles.slice(startIndex, endIndex);

        // Mevcut kartlara fade-out efekti ver
        const existingCards = container.querySelectorAll('.article-card');
        existingCards.forEach((card, index) => {
            setTimeout(() => {
                card.style.opacity = '0';
                card.style.transform = 'translateY(20px)';
            }, index * 50); // Her kart için 50ms gecikme
        });

        // Kartlar kaybolduktan sonra yeni içeriği yükle
        setTimeout(() => {
            container.innerHTML = '';

            if (articlesToShow.length === 0) {
                this.showEmptyState();
                return;
            }

            // Yeni makale kartlarını oluştur
            articlesToShow.forEach((article, index) => {
                const articleCard = this.createArticleCard(article);
                
                // Başlangıçta görünmez yap
                articleCard.style.opacity = '0';
                articleCard.style.transform = 'translateY(20px)';
                
                container.appendChild(articleCard);

                // Fade-in efekti ver
                setTimeout(() => {
                    articleCard.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
                    articleCard.style.opacity = '1';
                    articleCard.style.transform = 'translateY(0)';
                }, index * 100); // Her kart için 100ms gecikme
            });

            // Daha fazla makale var mı kontrol et
            this.hasMoreArticles = endIndex < this.filteredArticles.length;
            this.updateLoadMoreButton(false);
        }, existingCards.length * 50 + 200); // Tüm kartlar kaybolduktan sonra 200ms bekle
    }

    renderArticles() {
        const container = document.getElementById('articlesContainer');
        if (!container) return;

        const startIndex = 0;
        const endIndex = (this.currentPage + 1) * this.articlesPerPage;
        const articlesToShow = this.filteredArticles.slice(startIndex, endIndex);

        // Loading state'i temizle
        container.innerHTML = '';

        if (articlesToShow.length === 0) {
            this.showEmptyState();
            return;
        }

        // Makale kartlarını oluştur
        articlesToShow.forEach(article => {
            const articleCard = this.createArticleCard(article);
            container.appendChild(articleCard);
        });

        // Daha fazla makale var mı kontrol et
        this.hasMoreArticles = endIndex < this.filteredArticles.length;
        this.updateLoadMoreButton(false);
    }

    createArticleCard(article) {
        const card = document.createElement('div');
        card.className = 'article-card';
        
        card.innerHTML = `
            <div class="article-title">
                • ${article.title}
            </div>
            <div class="article-content-wrapper">
                <div class="article-image">
                    <img src="${article.image_url}" alt="${article.title}"  
                         onerror="this.src='/images/default-article.png'">
                </div>
                <div class="article-content">
                    <div class="article-category" onclick="window.open('${article.category_url}', '_blank')">
                       • ${article.category} 
                    </div>
                    <div class="article-date">${article.date}</div>
                    <div class="article-text">${this.truncateText(article.text, 200)}</div>
                    <div class="article-share">
                        <svg class="article-share-icon" viewBox="0 0 24 24" fill="currentColor" onclick="shareArticle('${article.destination_url}', '${article.title}')">
                            <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
                        </svg>
                    </div>
                </div>
            </div>
        `;

        // Kartın kendisine ve içindeki öğelere tıklama olayı ekle (kategori ve paylaş butonu hariç)
        card.addEventListener('click', function(e) {
            // Eğer tıklanan element kategori veya paylaş butonu ise işlemi durdur
            if (e.target.closest('.article-category') || e.target.closest('.article-share')) {
                return;
            }
            
            // Diğer tüm tıklamalarda destination_url'ye yönlendir
            window.open(article.destination_url, '_blank');
        });

        return card;
    }

    showLoadingState() {
        const container = document.getElementById('articlesContainer');
        if (!container) return;

        container.innerHTML = `
            <div class="article-card article-loading-card">
                <div class="article-loading-title">
                    <div class="article-loading-line article-loading-line-1"></div>
                    <div class="article-loading-line article-loading-line-2"></div>
                </div>
                <div class="article-content-wrapper">
                    <div class="article-loading-image">
                        <div class="article-loading-spinner"></div>
                    </div>
                    <div class="article-loading-content">
                        <div class="article-loading-category">
                            <div class="article-loading-line article-loading-line-3"></div>
                        </div>
                        <div class="article-loading-date">
                            <div class="article-loading-line article-loading-line-4"></div>
                        </div>
                        <div class="article-loading-text">
                            <div class="article-loading-line article-loading-line-5"></div>
                            <div class="article-loading-line article-loading-line-6"></div>
                            <div class="article-loading-line article-loading-line-7"></div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="article-card article-loading-card">
                <div class="article-loading-title">
                    <div class="article-loading-line article-loading-line-1"></div>
                    <div class="article-loading-line article-loading-line-2"></div>
                </div>
                <div class="article-content-wrapper">
                    <div class="article-loading-image">
                        <div class="article-loading-spinner"></div>
                    </div>
                    <div class="article-loading-content">
                        <div class="article-loading-category">
                            <div class="article-loading-line article-loading-line-3"></div>
                        </div>
                        <div class="article-loading-date">
                            <div class="article-loading-line article-loading-line-4"></div>
                        </div>
                        <div class="article-loading-text">
                            <div class="article-loading-line article-loading-line-5"></div>
                            <div class="article-loading-line article-loading-line-6"></div>
                            <div class="article-loading-line article-loading-line-7"></div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="article-card article-loading-card">
                <div class="article-loading-title">
                    <div class="article-loading-line article-loading-line-1"></div>
                    <div class="article-loading-line article-loading-line-2"></div>
                </div>
                <div class="article-content-wrapper">
                    <div class="article-loading-image">
                        <div class="article-loading-spinner"></div>
                    </div>
                    <div class="article-loading-content">
                        <div class="article-loading-category">
                            <div class="article-loading-line article-loading-line-3"></div>
                        </div>
                        <div class="article-loading-date">
                            <div class="article-loading-line article-loading-line-4"></div>
                        </div>
                        <div class="article-loading-text">
                            <div class="article-loading-line article-loading-line-5"></div>
                            <div class="article-loading-line article-loading-line-6"></div>
                            <div class="article-loading-line article-loading-line-7"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    showEmptyState() {
        const container = document.getElementById('articlesContainer');
        if (!container) return;

        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: #6c757d;">
                <i class="fa-solid fa-newspaper" style="font-size: 48px; margin-bottom: 20px; opacity: 0.5;"></i>
                <h4 style="margin-bottom: 10px; color: #495057;">Bu kategoride makale bulunamadı</h4>
                <p>Farklı bir kategori seçmeyi deneyin.</p>
            </div>
        `;
    }

    showErrorState() {
        const container = document.getElementById('articlesContainer');
        if (!container) return;

        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: #dc3545;">
                <i class="fa-solid fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 20px;"></i>
                <h4 style="margin-bottom: 10px;">Makaleler yüklenemedi</h4>
                <p>Lütfen daha sonra tekrar deneyin.</p>
                <button onclick="location.reload()" style="margin-top: 15px; padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    <i class="fa-solid fa-refresh"></i> Yeniden Dene
                </button>
            </div>
        `;
    }

    updateLoadMoreButton(loading) {
        const btn = document.getElementById('loadMoreArticles');
        if (!btn) return;

        if (loading) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Yükleniyor...';
        } else if (!this.hasMoreArticles) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Tüm Makaleler Yüklendi';
        } else {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-plus"></i> Daha Fazla Yükle';
        }
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) {
            return text;
        }
        
        // Son kelimenin ortasında kesmemek için son boşluğu bul
        const truncated = text.substring(0, maxLength);
        const lastSpaceIndex = truncated.lastIndexOf(' ');
        
        if (lastSpaceIndex > maxLength * 0.8) {
            return truncated.substring(0, lastSpaceIndex) + '...';
        } else {
            return truncated + '...';
        }
    }
}

// Global share fonksiyonu
window.shareArticle = async function(url, title) {
    try {
        if (navigator.share) {
            // Web Share API destekleniyorsa
            await navigator.share({
                title: title,
                url: url
            });
        } else {
            // Web Share API desteklenmiyorsa clipboard'a kopyala
            await navigator.clipboard.writeText(url);
            
            // Toast mesajı göster
            showShareToast('Link panoya kopyalandı!');
        }
    } catch (error) {
        console.error('Paylaşım hatası:', error);
        
        // Fallback: clipboard'a kopyala
        try {
            await navigator.clipboard.writeText(url);
            showShareToast('Link panoya kopyalandı!');
        } catch (clipboardError) {
            showShareToast('Paylaşım başarısız!');
        }
    }
};

// Toast mesajı fonksiyonu
function showShareToast(message) {
    // Mevcut toast'ı kaldır
    const existingToast = document.querySelector('.share-toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    // Yeni toast oluştur
    const toast = document.createElement('div');
    toast.className = 'share-toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #28a745;
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        font-size: 14px;
        font-weight: 500;
        animation: slideIn 0.3s ease;
    `;
    
    // CSS animasyonu ekle
    if (!document.querySelector('#share-toast-styles')) {
        const style = document.createElement('style');
        style.id = 'share-toast-styles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(toast);
    
    // 3 saniye sonra kaldır
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 300);
    }, 3000);
}