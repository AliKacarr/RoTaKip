// Monthly Calendar Functionality
function loadMonthlyCalendar() {
    console.log('🔍 Monthly Calendar Loading...');
    // Elements
    const prevMonthBtn = document.getElementById('prevMonth');
    const nextMonthBtn = document.getElementById('nextMonth');
    const monthYearHeader = document.getElementById('monthYearHeader');
    const calendarBody = document.getElementById('calendarBody');

    // Track current month and year
    let currentDate = new Date();
    let currentMonth = currentDate.getMonth();
    let currentYear = currentDate.getFullYear();

    // Track selected user
    let selectedUser = null;

    // Month names in Turkish
    const monthNames = [
        'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
        'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
    ];

    // Add user selector above the calendar (only if it doesn't exist)
    let userSelectorContainer = document.querySelector('.user-selector-container');
    if (!userSelectorContainer) {
        userSelectorContainer = document.createElement('div');
        userSelectorContainer.className = 'user-selector-container';
        userSelectorContainer.innerHTML = `
        <label for="userSelector">Kullanıcı Seçin:</label>
        <select id="userSelector" class="user-selector"></select>
      `;

        // Insert user selector into monthly-calendar-share-container before the calendar container
        const monthlyCalendarShareContainer = document.querySelector('.monthly-calendar-share-container');
        const monthlyCalendarContainer = document.querySelector('.monthly-calendar-container');
        if (monthlyCalendarShareContainer && monthlyCalendarContainer) {
            monthlyCalendarShareContainer.insertBefore(userSelectorContainer, monthlyCalendarContainer);
        }
    }


    // Get user selector element
    const userSelector = document.getElementById('userSelector');

    // Populate user selector with users from the main table
    function populateUserSelector() {
        const userSelector = document.getElementById('userSelector');
        if (!userSelector) return;

        // Clear existing options
        userSelector.innerHTML = '';

        // Global store'dan kullanıcıları al
        try {
            const allData = window.globalDataStore ? window.globalDataStore.getAllData() : { users: [] };
            const data = { users: allData.users };
            if (data.users && Array.isArray(data.users)) {
                // Sort users alphabetically
                data.users.sort((a, b) => a.name.localeCompare(b.name));

                // Get current user info
                const currentUserInfo = LocalStorageManager.getCurrentUserInfo();
                let defaultUser = null;

                // Add each user to the selector
                data.users.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user.name;
                    option.textContent = user.name;
                    option.dataset.userId = user._id; // Store user ID for easier access
                    userSelector.appendChild(option);

                    // If this is the current user, mark it as default
                    if (currentUserInfo && currentUserInfo.userId === user._id) {
                        defaultUser = user.name;
                    }
                });

                // Set the default user (current user if logged in, otherwise first user)
                if (defaultUser) {
                    selectedUser = defaultUser;
                    userSelector.value = selectedUser;
                } else if (userSelector.options.length > 0) {
                    selectedUser = userSelector.options[0].value;
                    userSelector.value = selectedUser;
                }

                // Generate calendar with the selected user
                generateCalendar(currentMonth, currentYear);
            }
        } catch (error) {
            console.error('Error loading users from store:', error);
        }
    }

    // Call this function after the main table is loaded
    window.updateMonthlyCalendarUsers = populateUserSelector;

    // Listen for user selection changes
    userSelector.addEventListener('change', function () {
        const previousUser = selectedUser;
        selectedUser = this.value;

        // Log the user selection change
        if (typeof logUnauthorizedAccess === 'function') {
            logUnauthorizedAccess(`Aylık takvim kullanıcı değiştirme: ${previousUser}-to-${selectedUser}`);
        }

        generateCalendar(currentMonth, currentYear);
    });

    // Initialize calendar
    generateCalendar(currentMonth, currentYear);

    // Event listeners for navigation buttons
    prevMonthBtn.addEventListener('click', function () {
        currentMonth--;
        if (currentMonth < 0) {
            currentMonth = 11;
            currentYear--;
        }
        generateCalendar(currentMonth, currentYear);
    });

    nextMonthBtn.addEventListener('click', function () {
        currentMonth++;
        if (currentMonth > 11) {
            currentMonth = 0;
            currentYear++;
        }
        generateCalendar(currentMonth, currentYear);
    });

    // Function to generate the calendar
    function generateCalendar(month, year, showLoading = true) {
        // Update month display
        monthYearHeader.textContent = `${monthNames[month]} ${year}`;

        // Add selected user name to the header if available
        if (selectedUser) {
            monthYearHeader.textContent = `${monthNames[month]} ${year}`;
        }

        // Add loading indicator to the calendar container
        const calendarContainer = calendarBody.closest('.monthly-calendar-container');

        // Remove any existing loading indicator first
        const existingLoader = document.querySelector('.calendar-loading');
        if (existingLoader) {
            existingLoader.remove();
        }

        // Sadece showLoading true ise loading göster
        if (showLoading) {
            const loadingIndicator = document.createElement('div');
            loadingIndicator.className = 'calendar-loading';
            loadingIndicator.innerHTML = '<div class="monthly-spinner"></div><p>Yükleniyor...</p>';
            if (calendarContainer) {
                calendarContainer.appendChild(loadingIndicator);
            }
        }

        // Get first day of month (0 = Sunday, 1 = Monday, etc.)
        let firstDay = new Date(year, month, 1).getDay();
        // Adjust for Monday as first day of week
        firstDay = firstDay === 0 ? 6 : firstDay - 1;

        // Get number of days in month
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // Get number of days in previous month
        const daysInPrevMonth = new Date(year, month, 0).getDate();

        // Calculate rows needed (maximum 6 rows)
        const rows = Math.ceil((daysInMonth + firstDay) / 7);

        // Current date for highlighting today
        const today = new Date();
        const todayDate = today.getDate();
        const todayMonth = today.getMonth();
        const todayYear = today.getFullYear();

        // If a user is selected, fetch their reading data
        if (selectedUser) {
            try {
                const allData = window.globalDataStore ? window.globalDataStore.getAllData() : { users: [], stats: [] };
                const user = (allData.users || []).find(u => u.name === selectedUser);
                if (!user) return;

                const userStats = (allData.stats || []).filter(s => {
                    if (s.userId !== user._id) return false;
                    const dateParts = s.date.split('-');
                    const statYear = parseInt(dateParts[0]);
                    const statMonth = parseInt(dateParts[1]) - 1;
                    return statYear === year && statMonth === month;
                });

                calendarBody.innerHTML = '';
                const loadingElement = calendarContainer.querySelector('.calendar-loading');
                if (loadingElement) {
                    loadingElement.remove();
                }

                renderCalendarWithData(rows, firstDay, daysInMonth, daysInPrevMonth, todayDate, todayMonth, todayYear, userStats);
            } catch (error) {
                console.error('Error loading monthly data from store:', error);
                calendarBody.innerHTML = '';
                const loadingElement = calendarContainer.querySelector('.calendar-loading');
                if (loadingElement) {
                    loadingElement.remove();
                }
                renderCalendarWithData(rows, firstDay, daysInMonth, daysInPrevMonth, todayDate, todayMonth, todayYear, []);
            }
        } else {
            // No user selected, clear and render empty calendar
            calendarBody.innerHTML = '';
            const loadingElement = calendarContainer ? calendarContainer.querySelector('.calendar-loading') : null;
            if (loadingElement) {
                loadingElement.remove();
            }

            renderCalendarWithData(rows, firstDay, daysInMonth, daysInPrevMonth, todayDate, todayMonth, todayYear, []);
        }
    }

    // Helper function to render calendar with data
    function renderCalendarWithData(rows, firstDay, daysInMonth, daysInPrevMonth, todayDate, todayMonth, todayYear, stats) {
        let date = 1;
        for (let i = 0; i < rows; i++) {
            // Create row
            const row = document.createElement('tr');

            // Create cells for each day of the week
            for (let j = 0; j < 7; j++) {
                const cell = document.createElement('td');

                if (i === 0 && j < firstDay) {
                    // Previous month days
                    const prevMonthDay = daysInPrevMonth - firstDay + j + 1;
                    cell.textContent = prevMonthDay;
                    cell.classList.add('other-month');
                    cell.style.backgroundColor = '#f0f0f0'; // Açık gri arka plan
                    cell.style.color = '#999'; // Soluk metin rengi
                } else if (date > daysInMonth) {
                    // Next month days
                    const nextMonthDay = date - daysInMonth;
                    cell.textContent = nextMonthDay;
                    cell.classList.add('other-month');
                    cell.style.backgroundColor = '#f0f0f0'; // Açık gri arka plan
                    cell.style.color = '#999'; // Soluk metin rengi
                    date++;
                } else {
                    // Current month days
                    cell.textContent = date;
                    const currentDate = date;

                    // Check if it's today
                    if (currentDate === todayDate && currentMonth === todayMonth && currentYear === todayYear) {
                        cell.classList.add('today');
                    }

                    // Find status for this date
                    const dateStr = formatDateForTable(currentDate, currentMonth, currentYear);
                    const dayStat = stats.find(s => s.date === dateStr);

                    // Rest of the code remains the same
                    if (dayStat) {
                        // Apply appropriate styling based on status
                        if (dayStat.status === 'okudum') {
                            cell.classList.add('read');
                            const statusIndicator = document.createElement('div');
                            statusIndicator.className = 'monthly-reading-status';
                            statusIndicator.textContent = '✔️';
                            cell.style.backgroundColor = '#d4edda';
                            cell.style.color = '#155724';
                            cell.style.fontWeight = 'bold';
                            cell.appendChild(statusIndicator);
                        } else if (dayStat.status === 'okumadım') {
                            cell.classList.add('not-read');
                            const statusIndicator = document.createElement('div');
                            statusIndicator.className = 'monthly-reading-status';
                            statusIndicator.textContent = '❌';
                            cell.style.backgroundColor = '#f8d7da';
                            cell.style.color = '#721c24';
                            cell.appendChild(statusIndicator);
                        } else {
                            cell.classList.add('not-applicable');
                            const statusIndicator = document.createElement('div');
                            statusIndicator.className = 'monthly-reading-status';
                            statusIndicator.textContent = '➖';
                            cell.style.backgroundColor = '#e2e3e5';
                            cell.style.color = '#383d41';
                            cell.appendChild(statusIndicator);
                        }

                        // Add click event to toggle reading status
                        cell.addEventListener('click', function () {
                            toggleUserReadingStatus(selectedUser, currentDate, currentMonth, currentYear, this);
                        });
                    } else {
                        // No status yet, add click event to set status
                        cell.addEventListener('click', function () {
                            toggleUserReadingStatus(selectedUser, currentDate, currentMonth, currentYear, this);
                        });
                    }

                    date++;
                }

                row.appendChild(cell);
            }

            calendarBody.appendChild(row);
        }
    }

    function toggleUserReadingStatus(userName, day, month, year, clickedCell) {
        if (!LocalStorageManager.isUserLoggedIn()) {
            logUnauthorizedAccess('Aylık takvim okuma durumu değiştirme');
            return;
        }

        if (typeof window.getReadingEditMode === 'function' && window.getReadingEditMode() !== 'status') {
            if (window.getReadingEditMode() === 'none' && typeof window.promptReadingEditMode === 'function') {
                window.promptReadingEditMode();
            }
            return;
        }

        const userInfo = LocalStorageManager.getCurrentUserInfo();
        if (!userInfo) {
            logUnauthorizedAccess('Aylık takvim okuma durumu değiştirme');
            return;
        }

        const dateStr = formatDateForTable(day, month, year);
        // Haftalık tabloyla uyumlu şekilde Türkiye saatine göre bugünden sonrası engellenir.
        const today = new Date();
        today.setHours(today.getHours() + 3);
        const todayString = today.toISOString().split('T')[0];
        if (dateStr > todayString) {
            return;
        }

        // Session kontrolü
        if (window.checkSessionTimeout && window.checkSessionTimeout()) {
            return; // İşlemi durdur
        }

        // Member kullanıcıları sadece kendi verilerini güncelleyebilir
        if (userInfo.userAuthority === 'member') {
            // Member kullanıcılar için kullanıcı adını API'den al
            fetch(`/api/users/${window.groupid}`)
                .then(response => response.json())
                .then(data => {
                    const currentUser = data.users.find(u => u._id === userInfo.userId);
                    if (!currentUser) {
                        logUnauthorizedAccess('Aylık takvim okuma durumu değiştirme-kullanıcı bulunamadı');
                        return;
                    }

                    if (currentUser.name !== userName) {
                        logUnauthorizedAccess('Aylık takvim okuma durumu değiştirme-başka kullanıcı');
                        return;
                    }

                    // Yetki kontrolü başarılı, işlemi devam ettir
                    continueWithToggle();
                })
                .catch(error => {
                    console.error('Aylık takvim okuma durumu değiştirme-kullanıcı bilgisi alınırken hata:', error);
                    return;
                });
            return; // Async işlem başladı, fonksiyondan çık
        }

        // Admin kullanıcılar için direkt devam et
        continueWithToggle();

        function continueWithToggle() {
            // Mevcut durumu hücreden tespit et
            let currentStatus = '';
            if (clickedCell.classList.contains('read')) {
                currentStatus = 'okudum';
            } else if (clickedCell.classList.contains('not-read')) {
                currentStatus = 'okumadım';
            } else {
                currentStatus = '';
            }

            // Yeni durumu hesapla
            let newStatus = '';
            if (currentStatus === '') {
                newStatus = 'okudum';
            } else if (currentStatus === 'okudum') {
                newStatus = 'okumadım';
            } else if (currentStatus === 'okumadım') {
                newStatus = '';
            }

            // Önce UI'ı anında güncelle
            updateMonthlyCellStatus(clickedCell, newStatus);

            // Sonra veritabanını güncelle
            fetch(`/api/all-data/${window.groupid}`)
                .then(response => response.json())
                .then(data => {
                    const user = data.users.find(u => u.name === userName);
                    if (!user) throw new Error('User not found');

                    return fetch(`/api/update-status/${window.groupid}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            userId: user._id,
                            date: dateStr,
                            status: newStatus,
                            requestingUserId: userInfo.userId,
                            requestingUserAuthority: userInfo.userAuthority
                        })
                    });
                })
                .then(response => {
                    if (response && response.ok) {
                        // Global store'u da güncelle
                        try {
                            if (window.globalDataStore) {
                                window.globalDataStore.applyLocalUpdate(userInfo.userId, dateStr, newStatus);
                            }
                        } catch (e) {
                            console.error('Global store senkronizasyon hatası:', e);
                        }
                        // Veritabanı güncellemesi başarılı olduktan sonra diğer bileşenleri güncelle
                        if (window.loadTrackerTable) {
                            window.loadTrackerTable();
                        }
                        if (window.loadUserCards) {
                            window.loadUserCards();
                        }
                        if (window.loadReadingStats) {
                            window.loadReadingStats();
                        }
                        if (window.renderLongestSeries) {
                            window.renderLongestSeries();
                        }
                    } else {
                        // Veritabanı güncellemesi başarısız olursa UI'ı eski haline döndür
                        console.error('Veritabanı güncellemesi başarısız');
                        generateCalendar(currentMonth, currentYear, false);
                    }
                })
                .catch(error => {
                    console.error('Error toggling reading status:', error);
                    // Hata durumunda UI'ı eski haline döndür
                    generateCalendar(currentMonth, currentYear, false);
                });
        }
    }

    // Aylık takvim hücresini güncelleme yardımcı fonksiyonu
    function updateMonthlyCellStatus(cell, newStatus) {
        // Gün numarasını koru
        const dayNumber = cell.textContent.match(/\d+/);
        const day = dayNumber ? dayNumber[0] : cell.textContent.trim();

        // Hücreyi tamamen temizle
        cell.innerHTML = '';
        cell.className = '';
        cell.style.cssText = '';

        // Sadece gün numarasını ekle
        cell.textContent = day;

        // Yeni duruma göre görünümü güncelle
        if (newStatus === 'okudum') {
            cell.classList.add('read');
            const statusIndicator = document.createElement('div');
            statusIndicator.className = 'monthly-reading-status';
            statusIndicator.textContent = '✔️';
            cell.style.backgroundColor = '#d4edda';
            cell.style.color = '#155724';
            cell.style.fontWeight = 'bold';
            cell.appendChild(statusIndicator);
        } else if (newStatus === 'okumadım') {
            cell.classList.add('not-read');
            const statusIndicator = document.createElement('div');
            statusIndicator.className = 'monthly-reading-status';
            statusIndicator.textContent = '❌';
            cell.style.backgroundColor = '#f8d7da';
            cell.style.color = '#721c24';
            cell.appendChild(statusIndicator);
        } else {
            // Boş durum - sınıf ekleme, sadece gün numarası kalır
            // Hücre zaten temizlenmiş ve sadece gün numarası var
        }
    }



    // Helper function to format date for table lookup
    function formatDateForTable(day, month, year) {
        return `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }

    // Function to update the calendar with actual user reading data
    function updateCalendarWithUserData() {
        // This function would be called after fetching user data
        populateUserSelector();
        generateCalendar(currentMonth, currentYear);
    }

    // Show monthly calendar section
    const monthlyCalendarSection = document.querySelector('.monthly-calendar-section');
    if (monthlyCalendarSection) {
        monthlyCalendarSection.style.display = 'block';
    }

    // Expose the update function globally so it can be called from your main script
    window.updateMonthlyCalendar = updateCalendarWithUserData;

    // Try to populate users initially if the table is already loaded
    setTimeout(populateUserSelector, 500);

    // Paylaş butonu için event listener ekle
    const monthShareBtn = document.getElementById('monthShareBtn');
    if (monthShareBtn) {
        monthShareBtn.addEventListener('click', shareMonthlyCalendar);
    }
}

// Aylık takvimi resme çevirip modal'da göster
async function shareMonthlyCalendar() {
    const monthlyCalendarShareContainer = document.querySelector('.monthly-calendar-share-container');
    if (!monthlyCalendarShareContainer) {
        console.warn('Monthly calendar share container bulunamadı');
        return;
    }

    const monthYearHeader = document.getElementById('monthYearHeader');
    const titleText = monthYearHeader ? monthYearHeader.textContent.trim() : 'aylik-takvim';
    const titleParts = titleText.split(' ');
    const shareText = titleParts.length >= 2
        ? `${titleParts[titleParts.length - 1]} ${titleParts.slice(0, -1).join(' ')} ayı okuma takviminiz`
        : `${titleText} ayı okuma takviminiz`;

    await shareContainerAsImage({
        container: monthlyCalendarShareContainer,
        modalId: 'monthShareModal',
        titleText: titleText,
        fileNamePrefix: 'aylik-takvim',
        shareTitle: 'Aylık Takvim',
        shareText: shareText,
        onRestore: () => {
            // Monthly calendar için restore işlemi gerekmiyor
            // Çünkü kullanıcı resmi bilgisi kullanmıyoruz
        },
        prepareImages: null // Monthly calendar'da resim hazırlama ihtiyacı yok
    });
}
