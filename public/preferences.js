// Toast mesajı gösterme fonksiyonu
function showToast(message, type = 'success') {
    // Mevcut toast'ı kaldır
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    // Toast elementi oluştur
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // 3 saniye sonra kaldır
    setTimeout(() => {
        toast.classList.add('toast-hide');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

document.addEventListener('DOMContentLoaded', function () { //Tablonun ilk günü seçimi
    const savedFirstDay = localStorage.getItem('firstDayOfWeek');

    if (firstDaySelect) {
        if (savedFirstDay !== null && savedFirstDay !== 'default') {
            window.firstDayOfWeek = parseInt(savedFirstDay);
            firstDaySelect.value = savedFirstDay;
        } else {
            // Varsayılan olarak "default" seçili olmalı
            window.firstDayOfWeek = 'default';
            firstDaySelect.value = "default";
        }

        // Add event listener for combobox changes
        firstDaySelect.addEventListener('change', function () {
            // Tablonun ilk günü değiştirme işlemini logla
            if (typeof logUnauthorizedAccess === 'function') {
                logUnauthorizedAccess('Tablonun ilk günü değiştirme');
            }
            
            let selectedDayName;
            if (this.value === 'default') {
                window.firstDayOfWeek = 'default';
                selectedDayName = 'Varsayılan (Yarın)';
            } else {
                window.firstDayOfWeek = parseInt(this.value);
                const dayNames = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
                selectedDayName = dayNames[parseInt(this.value)];
            }
            
            localStorage.setItem('firstDayOfWeek', this.value);
            weekOffset = 0;
            loadTrackerTable();
            loadUserCards();
            
            // Sayfanın en üstüne kaydır
            window.scrollTo({ top: 0, behavior: 'smooth' });
            
            // Toast mesajı göster
            showToast(`Tablonun ilk günü ${selectedDayName} olarak ayarlandı`, 'success');
        });
    }
});