document.addEventListener('DOMContentLoaded', function () { //Tablonun ilk günü seçimi
    const savedFirstDay = localStorage.getItem('firstDayOfWeek');

    if (firstDaySelect) {
        if (savedFirstDay !== null) {
            window.firstDayOfWeek = parseInt(savedFirstDay);
            firstDaySelect.value = savedFirstDay;
        } else {
            // Varsayılan olarak Pazartesi (value="1") seçili olmalı
            window.firstDayOfWeek = 1;
            firstDaySelect.value = "1";
        }

        // Add event listener for combobox changes
        firstDaySelect.addEventListener('change', function () {
            // Tablonun ilk günü değiştirme işlemini logla
            if (typeof logUnauthorizedAccess === 'function') {
                logUnauthorizedAccess('Tablonun ilk günü değiştirme');
            }
            
            window.firstDayOfWeek = parseInt(this.value);
            localStorage.setItem('firstDayOfWeek', this.value);
            weekOffset = 0;
            loadTrackerTable();
            loadUserCards();
        });
    }
});