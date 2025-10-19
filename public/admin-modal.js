// Global flag for join request success
let isJoinRequestSuccess = false;

// Create navigation buttons function (her zaman görünür)
function createNavigationButtons() {
    // Create articles button if it doesn't exist
    let articlesButton = document.querySelector('.articles-button');
    if (!articlesButton) {
        articlesButton = document.createElement('div');
        articlesButton.className = 'articles-button';
        articlesButton.innerHTML = '<i class="fa-regular fa-newspaper"></i> Makaleler';

        // Add click event to scroll to articles section
        articlesButton.addEventListener('click', function() {
            const articlesSection = document.querySelector('.articles');
            if (articlesSection) {
                articlesSection.scrollIntoView({ 
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });

        document.body.appendChild(articlesButton);
    }

    // Create videos button if it doesn't exist
    let videosButton = document.querySelector('.videos-button');
    if (!videosButton) {
        videosButton = document.createElement('div');
        videosButton.className = 'videos-button';
        videosButton.innerHTML = '<i class="fa-regular fa-circle-play"></i> Videolar';

        // Add click event to scroll to videos section
        videosButton.addEventListener('click', function() {
            const videosSection = document.querySelector('.videos');
            if (videosSection) {
                videosSection.scrollIntoView({ 
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });

        document.body.appendChild(videosButton);
    }

    // Create quotes button if it doesn't exist
    let quotesButton = document.querySelector('.quotes-button');
    if (!quotesButton) {
        quotesButton = document.createElement('div');
        quotesButton.className = 'quotes-button';
        quotesButton.innerHTML = '<i class="fa-solid fa-star-and-crescent"></i> Vecizeler';

        // Add click event to scroll to quotes section
        quotesButton.addEventListener('click', function() {
            const quotesSection = document.querySelector('.quote');
            if (quotesSection) {
                quotesSection.scrollIntoView({ 
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });

        document.body.appendChild(quotesButton);
    }
}

async function showAdminIndicator() {     //admin modu butonunu gösterme
    // Check if user is logged in and valid
    console.log('show');
    if (!LocalStorageManager.isUserLoggedIn()) {
        // Çıkış yapmış kullanıcı için tüm elementleri gizle
        const adminIndicator = document.querySelector('.admin-indicator');
        const mainArea = document.querySelector('.main-area');
        const userStatsArea = document.querySelector('.user-stats-info-area');
        const scrollToMainButton = document.querySelector('.scroll-to-main-button');
        
        if (adminIndicator) adminIndicator.style.display = 'none';
        if (mainArea) mainArea.style.display = 'none';
        if (userStatsArea) {
            userStatsArea.classList.remove('show');
            setTimeout(() => {
                userStatsArea.style.display = 'none';
            }, 300); // Animasyon süresi kadar bekle
        }
        if (scrollToMainButton) scrollToMainButton.style.display = 'none';
        
        return;
    }
    
    const userInfo = LocalStorageManager.getCurrentUserInfo();
    if (!userInfo) return;
    
    // Create scroll to main area button if it doesn't exist (only for admin)
    let scrollToMainButton = document.querySelector('.scroll-to-main-button');
    if (!scrollToMainButton && userInfo.userAuthority === 'admin') {
        scrollToMainButton = document.createElement('div');
        scrollToMainButton.className = 'scroll-to-main-button';
        scrollToMainButton.innerHTML = '<i class="fa-solid fa-gear"></i> Grup Ayarları';

        // Add click event to scroll to main area
        scrollToMainButton.addEventListener('click', function() {
            const mainArea = document.querySelector('.main-area');
            if (mainArea) {
                mainArea.scrollIntoView({ 
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });

        document.body.appendChild(scrollToMainButton);
    }
    
    // Scroll butonunu göster (sadece admin yetkisi olan kullanıcılar için)
    if (scrollToMainButton) {
        if (userInfo.userAuthority === 'admin') {
            scrollToMainButton.style.display = 'flex';
        } else {
            scrollToMainButton.style.display = 'none';
        }
    }

    // Create admin indicator if it doesn't exist
    let adminIndicator = document.querySelector('.admin-indicator');
    if (!adminIndicator) {
        adminIndicator = document.createElement('div');
        adminIndicator.className = 'admin-indicator';
        const displayName = userInfo.name && userInfo.name !== 'null' ? userInfo.name : '';
        adminIndicator.innerHTML = userInfo.userAuthority === 'admin' ? 
            `<i class="fa-solid fa-user-shield"></i> ${displayName}` : 
            `<i class="fa-solid fa-user"></i> ${displayName}`;

        // Add click event to open admin info panel
        adminIndicator.addEventListener('click', function () {
            showAdminInfoPanel();
        });

        document.body.appendChild(adminIndicator);
        adminIndicator.style.display = 'flex';
    } else {
        // Update text based on user authority
        const displayName = userInfo.name && userInfo.name !== 'null' ? userInfo.name : '';
        adminIndicator.innerHTML = userInfo.userAuthority === 'admin' ? 
            `<i class="fa-solid fa-user-shield"></i> ${displayName}` : 
            `<i class="fa-solid fa-user"></i> ${displayName}`;
        adminIndicator.style.display = 'flex';
    }

  
    const userStatsArea = document.querySelector('.user-stats-info-area');

    // Sadece admin yetkisi olan kullanıcılar için main-area göster
    const mainArea = document.querySelector('.main-area');
    if (mainArea && userInfo.userAuthority === 'admin') {
        mainArea.style.display = 'flex';
        
        // Admin girişi yapıldığında user list'i yükle
        if (typeof renderUserList === 'function') {
            renderUserList();
        }
        
        // Grup ayarlarını da yükle (sadece admin için)
        if (typeof loadGroupSettings === 'function') {
            loadGroupSettings();
        }
    }
}


document.addEventListener('DOMContentLoaded', function () {
    // Sayfa yüklendiğinde yeni butonları oluştur (her zaman görünür)
    createNavigationButtons();

    const adminLogin = document.getElementById('secretAdminLogin');
    const groupsAuthLoginModal = document.getElementById('groupsAuthLoginModal');
    const groupsAuthForgotModal = document.getElementById('groupsAuthForgotModal');
    
    // Login modal elements
    const closeGroupsAuthLoginModal = document.getElementById('closeGroupsAuthLoginModal');
    const groupsAuthLoginForm = document.getElementById('groupsAuthLoginForm');
    const groupsAuthLoginError = document.getElementById('groupsAuthLoginError');
    const groupsAuthLoginName = document.getElementById('groupsAuthLoginName');
    const groupsAuthLoginPassword = document.getElementById('groupsAuthLoginPassword');
    const groupsAuthTogglePassword = document.getElementById('groupsAuthTogglePassword');
    const groupsAuthForgotPasswordLink = document.getElementById('groupsAuthForgotPasswordLink');
    
    // Forgot password modal elements
    const closeGroupsAuthForgotModal = document.getElementById('closeGroupsAuthForgotModal');

    // Admin login button click handler
    adminLogin.addEventListener('click', async function () {
        // Check if already authenticated
        if (LocalStorageManager.isUserLoggedIn()) {
            showAdminInfoPanel();
        } else {
            hideInfoMessage(); // Normal giriş için bilgilendirme mesajını gizle
            showModal(groupsAuthLoginModal);
        }
    });

    // Profile button click handler
    const profileButton = document.getElementById('profileButton');
    if (profileButton) {
        profileButton.addEventListener('click', function () {
            // Check if already authenticated
            if (LocalStorageManager.isUserLoggedIn()) {
                showAdminInfoPanel();
            } else {
                hideInfoMessage(); // Normal giriş için bilgilendirme mesajını gizle
                showModal(groupsAuthLoginModal);
                // Normal giriş için de grup bilgilerini güncelle
                if (typeof updateLoginGroupInfo === 'function') {
                    updateLoginGroupInfo();
                }
            }
        });
    }

    // Modal show/hide functions
    // Global modal fonksiyonları
    window.showModal = function(modal) {
        modal.classList.add('show');
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    window.hideModal = function(modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }

    // Bilgilendirme mesajını gizle
    function hideInfoMessage() {
        const infoMessage = document.getElementById('groupsAuthLoginInfoMessage');
        if (infoMessage) {
            infoMessage.style.display = 'none';
        }
    }

    // Bilgilendirme mesajını göster
    function showInfoMessage(text) {
        const infoMessage = document.getElementById('groupsAuthLoginInfoMessage');
        const infoText = document.getElementById('groupsAuthLoginInfoText');
        if (infoMessage && infoText) {
            infoText.textContent = text;
            infoMessage.style.display = 'flex';
        }
    }

    // Close user login modal
    closeGroupsAuthLoginModal.addEventListener('click', function () {
        window.hideModal(groupsAuthLoginModal);
        groupsAuthLoginError.textContent = '';
        groupsAuthLoginError.classList.remove('show');
        hideInfoMessage(); // Bilgilendirme mesajını gizle
        
        // Private grup erişimi için modal kapatıldıysa ana sayfaya yönlendir
        if (window.isPrivateGroupAccessModal) {
            window.location.href = '/';
        }
    });

    // Close forgot password modal
    closeGroupsAuthForgotModal.addEventListener('click', function () {
        window.hideModal(groupsAuthForgotModal);
        
        // Private grup erişimi için modal kapatıldıysa ana sayfaya yönlendir
        if (window.isPrivateGroupAccessModal) {
            window.location.href = '/';
        }
    });

    // Close modals when clicking outside
    window.addEventListener('click', function (event) {
        if (event.target === groupsAuthLoginModal) {
            window.hideModal(groupsAuthLoginModal);
            groupsAuthLoginError.textContent = '';
            groupsAuthLoginError.classList.remove('show');
            hideInfoMessage(); // Bilgilendirme mesajını gizle
            
            // Private grup erişimi için modal kapatıldıysa ana sayfaya yönlendir
            if (window.isPrivateGroupAccessModal) {
                window.location.href = '/';
            }
        }
        if (event.target === groupsAuthForgotModal) {
            window.hideModal(groupsAuthForgotModal);
            
            // Private grup erişimi için modal kapatıldıysa ana sayfaya yönlendir
            if (window.isPrivateGroupAccessModal) {
                window.location.href = '/';
            }
        }
    });

    // Password toggle functionality
    groupsAuthTogglePassword.addEventListener('click', function () {
        const passwordInput = groupsAuthLoginPassword;
        const icon = this.querySelector('i');
        
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            passwordInput.type = 'password';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    });

                // Forgot password link
                groupsAuthForgotPasswordLink.addEventListener('click', function (e) {
                    e.preventDefault();
                    window.hideModal(groupsAuthLoginModal);
                    showModal(groupsAuthForgotModal);
                });

                // Join group link
                const groupsAuthJoinGroupLink = document.getElementById('groupsAuthJoinGroupLink');
                const groupsAuthJoinModal = document.getElementById('groupsAuthJoinModal');
                const closeGroupsAuthJoinModal = document.getElementById('closeGroupsAuthJoinModal');
                const groupsAuthJoinCancelBtn = document.getElementById('groupsAuthJoinCancelBtn');

                if (groupsAuthJoinGroupLink && groupsAuthJoinModal) {
                    groupsAuthJoinGroupLink.addEventListener('click', async function (e) {
                        e.preventDefault();
                        window.hideModal(groupsAuthLoginModal);
                        clearJoinModalForm();
                        await updateGroupInfoInModal();
                        // Join modal açıldığında flag'i false yap
                        isJoinRequestSuccess = false;
                        showModal(groupsAuthJoinModal);
                    });
                }

                // Close join modal
                if (closeGroupsAuthJoinModal) {
                    closeGroupsAuthJoinModal.addEventListener('click', function () {
                        clearJoinModalForm();
                        window.hideModal(groupsAuthJoinModal);
                        
                        // Private grup erişimi için modal kapatıldıysa ana sayfaya yönlendir
                        if (window.isPrivateGroupAccessModal) {
                            window.location.href = '/';
                        }
                    });
                }

                // Cancel join modal
                if (groupsAuthJoinCancelBtn) {
                    groupsAuthJoinCancelBtn.addEventListener('click', function () {
                        clearJoinModalForm();
                        window.hideModal(groupsAuthJoinModal);
                        
                        // Private grup erişimi için modal kapatıldıysa ana sayfaya yönlendir
                        if (window.isPrivateGroupAccessModal) {
                            window.location.href = '/';
                        }
                    });
                }

                // Close join modal when clicking outside
                if (groupsAuthJoinModal) {
                    window.addEventListener('click', function (event) {
                        if (event.target === groupsAuthJoinModal) {
                            clearJoinModalForm();
                            window.hideModal(groupsAuthJoinModal);
                            
                            // Private grup erişimi için modal kapatıldıysa ana sayfaya yönlendir
                            if (window.isPrivateGroupAccessModal) {
                                window.location.href = '/';
                            }
                        }
                    });
                }

                // Password toggle for join modal
                const groupsAuthJoinPasswordToggle = document.getElementById('groupsAuthJoinPasswordToggle');
                const groupsAuthJoinMemberPasswordInput = document.getElementById('groupsAuthJoinMemberPasswordInput');

                if (groupsAuthJoinPasswordToggle && groupsAuthJoinMemberPasswordInput) {
                    groupsAuthJoinPasswordToggle.addEventListener('click', function () {
                        const icon = this.querySelector('i');
                        
                        if (groupsAuthJoinMemberPasswordInput.type === 'password') {
                            groupsAuthJoinMemberPasswordInput.type = 'text';
                            icon.classList.remove('fa-eye');
                            icon.classList.add('fa-eye-slash');
                        } else {
                            groupsAuthJoinMemberPasswordInput.type = 'password';
                            icon.classList.remove('fa-eye-slash');
                            icon.classList.add('fa-eye');
                        }
                    });
                }

                // File input handling for join modal
                const groupsAuthJoinProfileImageInput = document.getElementById('groupsAuthJoinProfileImageInput');
                const groupsAuthJoinFileName = document.getElementById('groupsAuthJoinFileName');
                const groupsAuthJoinFileInputText = document.querySelector('.groups-auth-join-file-input-text');

                // Clear join modal form function
                function clearJoinModalForm() {
                    // Clear file input
                    if (groupsAuthJoinProfileImageInput) {
                        groupsAuthJoinProfileImageInput.value = '';
                    }
                    
                    // Reset file display
                    if (groupsAuthJoinFileName) {
                        groupsAuthJoinFileName.style.display = 'none';
                        groupsAuthJoinFileName.textContent = '';
                    }
                    
                    if (groupsAuthJoinFileInputText) {
                        groupsAuthJoinFileInputText.style.display = 'inline';
                    }
                    
                    // Clear other form inputs
                    const groupsAuthJoinUserNameInput = document.getElementById('groupsAuthJoinUserNameInput');
                    const groupsAuthJoinMemberNameInput = document.getElementById('groupsAuthJoinMemberNameInput');
                    const groupsAuthJoinMemberPasswordInput = document.getElementById('groupsAuthJoinMemberPasswordInput');
                    
                    if (groupsAuthJoinUserNameInput) groupsAuthJoinUserNameInput.value = '';
                    if (groupsAuthJoinMemberNameInput) groupsAuthJoinMemberNameInput.value = '';
                    if (groupsAuthJoinMemberPasswordInput) groupsAuthJoinMemberPasswordInput.value = '';
                }

                // Update group info in modal function
                async function updateGroupInfoInModal() {
                    // Get current group info from URL or page context
                    const currentPath = window.location.pathname;
                    let groupId = currentPath.replace('/', ''); // Remove leading slash
                    
                    // Clean groupId if it contains 'groupid=' prefix
                    if (groupId.startsWith('groupid=')) {
                        groupId = groupId.replace('groupid=', '');
                    }
                    
                    // Decode URL encoded characters
                    try {
                        groupId = decodeURIComponent(groupId);
                    } catch (e) {
                        // If decoding fails, use original value
                        console.warn('URL decode failed for groupId:', groupId);
                    }
                    
                    // Get group name and ID elements
                    const groupsAuthJoinGroupName = document.getElementById('groupsAuthJoinGroupName');
                    const groupsAuthJoinGroupId = document.getElementById('groupsAuthJoinGroupId');
                    const groupsAuthJoinGroupAvatar = document.getElementById('groupsAuthJoinGroupAvatar');
                    
                    if (groupsAuthJoinGroupName && groupsAuthJoinGroupId) {
                        // Update group name (you can customize this based on your group data)
                        if (groupId && groupId !== 'groups.html') {
                            // If we have a group ID from URL, use it
                            groupsAuthJoinGroupName.textContent = groupId.charAt(0).toUpperCase() + groupId.slice(1);
                            groupsAuthJoinGroupId.textContent = '@' + groupId;
                            
                            // Get group info from API (same method as secretAdminLogin)
                            try {
                                const response = await fetch(`/api/group/${groupId}`);
                                if (response.ok) {
                                    const data = await response.json();
                                    const groupName = data.group.groupName;
                                    const groupImage = data.group.groupImage;
                                    
                                    // Update group name with real data
                                    groupsAuthJoinGroupName.textContent = groupName;
                                    
                                    // Update group avatar with real group image
                                    if (groupsAuthJoinGroupAvatar) {
                                        const imgSrc = groupImage || '/images/open-book.webp';
                                        groupsAuthJoinGroupAvatar.src = imgSrc;
                                        groupsAuthJoinGroupAvatar.alt = groupName + ' Avatar';
                                        
                                        // Handle image load error - fallback to default
                                        groupsAuthJoinGroupAvatar.onerror = function() {
                                            this.src = '/images/open-book.webp';
                                            this.alt = 'Grup Avatar';
                                        };
                                    }
                                } else {
                                    // Fallback if API fails
                                    if (groupsAuthJoinGroupAvatar) {
                                        groupsAuthJoinGroupAvatar.src = '/images/open-book.webp';
                                        groupsAuthJoinGroupAvatar.alt = 'Grup Avatar';
                                    }
                                }
                            } catch (error) {
                                console.error('Grup bilgisi alınamadı:', error);
                                // Fallback if API fails
                                if (groupsAuthJoinGroupAvatar) {
                                    groupsAuthJoinGroupAvatar.src = '/images/open-book.webp';
                                    groupsAuthJoinGroupAvatar.alt = 'Grup Avatar';
                                }
                            }
                        } else {
                            // Default values if no group ID found
                            groupsAuthJoinGroupName.textContent = 'Grup Adı';
                            groupsAuthJoinGroupId.textContent = '@grup-id';
                            
                            // Default avatar
                            if (groupsAuthJoinGroupAvatar) {
                                groupsAuthJoinGroupAvatar.src = '/images/open-book.webp';
                                groupsAuthJoinGroupAvatar.alt = 'Grup Avatar';
                            }
                        }
                    }
                }

                if (groupsAuthJoinProfileImageInput && groupsAuthJoinFileName && groupsAuthJoinFileInputText) {
                    // File selection handler
                    groupsAuthJoinProfileImageInput.addEventListener('change', function (e) {
                        const file = e.target.files[0];
                        if (file) {
                            groupsAuthJoinFileName.textContent = file.name;
                            groupsAuthJoinFileName.style.display = 'inline';
                            groupsAuthJoinFileInputText.style.display = 'none';
                        }
                    });
                }

                // Success modal elements
                const groupsAuthJoinSuccessModal = document.getElementById('groupsAuthJoinSuccessModal');
                const closeGroupsAuthJoinSuccessModal = document.getElementById('closeGroupsAuthJoinSuccessModal');
                const groupsAuthJoinSuccessCancelBtn = document.getElementById('groupsAuthJoinSuccessCancelBtn');
                const groupsAuthJoinSuccessViewBtn = document.getElementById('groupsAuthJoinSuccessViewBtn');
                const groupsAuthJoinSubmitBtn = document.getElementById('groupsAuthJoinSubmitBtn');

                // Update success button based on flag
                function updateSuccessButton() {
                    const groupsAuthJoinSuccessViewBtn = document.getElementById('groupsAuthJoinSuccessViewBtn');
                    if (groupsAuthJoinSuccessViewBtn) {
                        if (isJoinRequestSuccess) {
                            groupsAuthJoinSuccessViewBtn.textContent = 'Ana Sayfa';
                        } else {
                            groupsAuthJoinSuccessViewBtn.textContent = 'Grubu Görüntüle';
                        }
                    }
                }

                // Show success modal function
                function showSuccessModal() {
                    // Grup visibility bilgisini al
                    const currentPath = window.location.pathname;
                    let groupId = currentPath.replace('/', '');
                    if (groupId.startsWith('groupid=')) {
                        groupId = groupId.replace('groupid=', '');
                    }
                    
                    // Decode URL encoded characters
                    try {
                        groupId = decodeURIComponent(groupId);
                    } catch (e) {
                        console.warn('URL decode failed for groupId:', groupId);
                    }
                    
                    // Grup bilgilerini al ve visibility kontrolü yap
                    fetch(`/api/group/${groupId}`)
                        .then(response => response.json())
                        .then(data => {
                            const group = data.group;
                            // Sadece private gruplar için flag'i true yap
                            isJoinRequestSuccess = (group.visibility === 'private');
                            
                            window.hideModal(groupsAuthJoinModal);
                            showModal(groupsAuthJoinSuccessModal);
                            
                            // Success modal açıldığında buton metnini güncelle
                            updateSuccessButton();
                        })
                        .catch(error => {
                            console.error('Grup bilgileri alınırken hata:', error);
                            // Hata durumunda varsayılan olarak false yap
                            isJoinRequestSuccess = false;
                            
                            window.hideModal(groupsAuthJoinModal);
                            showModal(groupsAuthJoinSuccessModal);
                            updateSuccessButton();
                        });
                }

                // Close success modal
                if (closeGroupsAuthJoinSuccessModal) {
                    closeGroupsAuthJoinSuccessModal.addEventListener('click', function () {
                        window.hideModal(groupsAuthJoinSuccessModal);
                        
                        // Private grup erişimi için modal kapatıldıysa ana sayfaya yönlendir
                        if (window.isPrivateGroupAccessModal || isJoinRequestSuccess) {
                            window.location.href = '/';
                        }
                    });
                }

                // Cancel success modal
                if (groupsAuthJoinSuccessCancelBtn) {
                    groupsAuthJoinSuccessCancelBtn.addEventListener('click', async function () {
                        // Get current group ID from URL
                        const currentPath = window.location.pathname;
                        let groupId = currentPath.replace('/', '');
                        
                        // Clean groupId if it contains 'groupid=' prefix
                        if (groupId.startsWith('groupid=')) {
                            groupId = groupId.replace('groupid=', '');
                        }
                        
                        // Decode URL encoded characters
                        try {
                            groupId = decodeURIComponent(groupId);
                        } catch (e) {
                            console.warn('URL decode failed for groupId:', groupId);
                        }
                        
                        if (groupId && groupId !== 'groups.html') {
                            // Get join request ID from localStorage
                            const joinRequests = JSON.parse(localStorage.getItem('jointogroups') || '{}');
                            const requestId = joinRequests[groupId];
                            
                            if (requestId) {
                                try {
                                    // Cancel join request via API
                                    const response = await fetch(`/api/cancel-join-request-by-id/${requestId}`, {
                                        method: 'DELETE'
                                    });
                                    
                                    const result = await response.json();
                                    
                                    if (result.success) {
                                        // Remove from localStorage
                                        delete joinRequests[groupId];
                                        localStorage.setItem('jointogroups', JSON.stringify(joinRequests));
                                        
                                        console.log('Katılma isteği iptal edildi');
                                    } else {
                                        console.error('Katılma isteği iptal edilemedi:', result.error);
                                    }
                                } catch (error) {
                                    console.error('Cancel join request error:', error);
                                }
                            }
                        }
                        
                        window.hideModal(groupsAuthJoinSuccessModal);
                        
                        // Private grup erişimi için modal kapatıldıysa ana sayfaya yönlendir
                        if (window.isPrivateGroupAccessModal || isJoinRequestSuccess) {
                            window.location.href = '/';
                        }
                    });
                }

                // View group button
                if (groupsAuthJoinSuccessViewBtn) {
                    groupsAuthJoinSuccessViewBtn.addEventListener('click', function () {
                        window.hideModal(groupsAuthJoinSuccessModal);
                        
                        // Private grup erişimi için modal kapatıldıysa ana sayfaya yönlendir
                        if (window.isPrivateGroupAccessModal) {
                            window.location.href = '/';
                        } else if (isJoinRequestSuccess) {
                            // Join request başarılı olduysa ana sayfaya yönlendir
                            window.location.href = '/';
                        } else {
                            // Normal durumda grubu görüntüle (mevcut davranış)
                            // Burada grubu görüntüleme işlemi yapılabilir
                        }
                    });
                }

                // Close success modal when clicking outside
                if (groupsAuthJoinSuccessModal) {
                    window.addEventListener('click', function (event) {
                        if (event.target === groupsAuthJoinSuccessModal) {
                            window.hideModal(groupsAuthJoinSuccessModal);
                            
                            // Private grup erişimi için modal kapatıldıysa ana sayfaya yönlendir
                            if (window.isPrivateGroupAccessModal || isJoinRequestSuccess) {
                                window.location.href = '/';
                            }
                        }
                    });
                }

                // Submit button click handler
                if (groupsAuthJoinSubmitBtn) {
                    groupsAuthJoinSubmitBtn.addEventListener('click', async function (e) {
                        e.preventDefault();
                        
                        // Get form values
                        const userName = document.getElementById('groupsAuthJoinUserNameInput').value.trim(); // name field
                        const memberName = document.getElementById('groupsAuthJoinMemberNameInput').value.trim(); // username field
                        const memberPassword = document.getElementById('groupsAuthJoinMemberPasswordInput').value.trim();
                        const profileImage = groupsAuthJoinProfileImageInput.files[0];
                        
                        // Basic validation
                        if (!userName || !memberName || !memberPassword) {
                            alert('Lütfen tüm alanları doldurunuz.');
                            return;
                        }
                        
                        // Character limit validation
                        if (userName.length > 40 || memberName.length > 40 || memberPassword.length > 40) {
                            alert('Tüm alanlar 40 karakterden kısa olmalıdır.');
                            return;
                        }
                        
                        // Get current group ID from URL
                        const currentPath = window.location.pathname;
                        let groupId = currentPath.replace('/', '');
                        
                        // Clean groupId if it contains 'groupid=' prefix
                        if (groupId.startsWith('groupid=')) {
                            groupId = groupId.replace('groupid=', '');
                        }
                        
                        // Decode URL encoded characters
                        try {
                            groupId = decodeURIComponent(groupId);
                        } catch (e) {
                            console.warn('URL decode failed for groupId:', groupId);
                        }
                        
                        if (!groupId || groupId === 'groups.html') {
                            alert('Grup bilgisi bulunamadı.');
                            return;
                        }
                        
                        // Username uniqueness will be checked on the server side
                        
                        // Show loading state
                        const originalText = groupsAuthJoinSubmitBtn.innerHTML;
                        groupsAuthJoinSubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gönderiliyor...';
                        groupsAuthJoinSubmitBtn.disabled = true;
                        
                        try {
                            // Create FormData for the request
                            const formData = new FormData();
                            formData.append('groupId', groupId);
                            formData.append('userName', userName); 
                            formData.append('memberName', memberName);
                            formData.append('userPassword', memberPassword);
                            
                            if (profileImage) {
                                formData.append('profileImage', profileImage);
                            }
                            
                            if (selectedGroupsAuthJoinAvatarPath) {
                                formData.append('selectedAvatarPath', selectedGroupsAuthJoinAvatarPath);
                            }
                            
                            // Send join request
                            const response = await fetch('/api/join-group-request', {
                                method: 'POST',
                                body: formData
                            });
                            
                            const result = await response.json();
                            
                            if (result.success) {
                                // Store join request info in localStorage
                                const joinRequests = JSON.parse(localStorage.getItem('jointogroups') || '{}');
                                joinRequests[groupId] = result.requestId;
                                localStorage.setItem('jointogroups', JSON.stringify(joinRequests));
                                
                                // Show success modal
                                showSuccessModal();
                            } else {
                                alert(result.error || 'Katılma isteği gönderilemedi.');
                            }
                        } catch (error) {
                            console.error('Join request error:', error);
                            alert('Katılma isteği gönderilirken bir hata oluştu.');
                        } finally {
                            // Reset button state
                            groupsAuthJoinSubmitBtn.innerHTML = originalText;
                            groupsAuthJoinSubmitBtn.disabled = false;
                        }
                    });
                }

    // Welcome Invite Modal Event Listeners
    const welcomeInviteModal = document.getElementById('welcomeInviteModal');
    const closeWelcomeInviteModal = document.getElementById('closeWelcomeInviteModal');
    const welcomeInviteJoinBtn = document.getElementById('welcomeInviteJoinBtn');
    const welcomeInviteCancelBtn = document.getElementById('welcomeInviteCancelBtn');

    // Close welcome invite modal
    if (closeWelcomeInviteModal) {
        closeWelcomeInviteModal.addEventListener('click', function () {
            window.hideModal(welcomeInviteModal);
            handleWelcomeModalClose();
        });
    }

    // Cancel welcome invite modal
    if (welcomeInviteCancelBtn) {
        welcomeInviteCancelBtn.addEventListener('click', function () {
            window.hideModal(welcomeInviteModal);
            handleWelcomeModalClose();
        });
    }

    // Close modal when clicking outside
    if (welcomeInviteModal) {
        welcomeInviteModal.addEventListener('click', function (e) {
            if (e.target === welcomeInviteModal) {
                window.hideModal(welcomeInviteModal);
                handleWelcomeModalClose();
            }
        });
    }

    // Join group button
    if (welcomeInviteJoinBtn) {
        welcomeInviteJoinBtn.addEventListener('click', async function () {
            // Get form values
            const userName = document.getElementById('welcomeInviteUserName').value.trim();
            const memberName = document.getElementById('welcomeInviteMemberName').value.trim();
            const memberPassword = document.getElementById('welcomeInviteMemberPassword').value.trim();
            const profileImageFile = document.getElementById('welcomeInviteProfileImage').files[0];

            // Basic validation
            if (!userName || !memberName || !memberPassword) {
                alert('Lütfen tüm alanları doldurunuz.');
                return;
            }

            // Character limit validation
            if (userName.length > 40 || memberName.length > 40 || memberPassword.length > 40) {
                alert('Tüm alanlar 40 karakterden kısa olmalıdır.');
                return;
            }

            // Get invite token from URL
            const inviteParams = getInviteParams();
            if (!inviteParams.hasInvite || !inviteParams.inviteToken) {
                alert('Davet linki geçersiz.');
                return;
            }

            // Check if username already exists (but allow user to keep their own username)
            let verifyData;
            try {
                // First verify invite token to get current user data
                const verifyResponse = await fetch(`/api/verify-invite/${window.groupid}?invite=${inviteParams.inviteToken}`);
                verifyData = await verifyResponse.json();

                if (!verifyData.success) {
                    alert('Davet linki geçersiz veya süresi dolmuş.');
                    return;
                }

                // Only check username if it's different from current username
                if (memberName !== verifyData.username) {
                    const checkResponse = await fetch(`/api/check-username-exists/${window.groupid}/${encodeURIComponent(memberName)}`);
                    const checkData = await checkResponse.json();
                    
                    if (checkData.exists) {
                        alert('Bu kullanıcı adı zaten kullanılıyor. Lütfen farklı bir kullanıcı adı seçin.');
                        return;
                    }
                }
            } catch (error) {
                console.error('Kullanıcı adı kontrolü hatası:', error);
                alert('Kullanıcı adı kontrol edilirken hata oluştu.');
                return;
            }

            // Show loading state
            const originalText = welcomeInviteJoinBtn.innerHTML;
            welcomeInviteJoinBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Güncelleniyor...';
            welcomeInviteJoinBtn.disabled = true;

            try {
                // verifyData is already available from the username check above

                // Create FormData for file upload
                const formData = new FormData();
                formData.append('inviteId', verifyData.inviteId);
                formData.append('userName', userName);
                formData.append('memberName', memberName);
                formData.append('memberPassword', memberPassword);
                if (profileImageFile) {
                    formData.append('profileImage', profileImageFile);
                }
                if (selectedAvatarPath) {
                    formData.append('selectedAvatarPath', selectedAvatarPath);
                }

                // Update user information
                const updateResponse = await fetch(`/api/update-user-via-invite/${window.groupid}`, {
                    method: 'POST',
                    body: formData
                });

                const updateData = await updateResponse.json();

                if (updateData.success) {
                    // Auto login with updated info
                    LocalStorageManager.loginUser(
                        updateData.groupId,
                        updateData.userId,
                        updateData.authority,
                        updateData.username,
                        updateData.groupName,
                        updateData.name
                    );

                    // Close modal
                    window.hideModal(welcomeInviteModal);

                    // Update UI
                    if (typeof window.updateProfileButton === 'function') {
                        window.updateProfileButton();
                    }

                    if (typeof loadTrackerTable === 'function') loadTrackerTable();
                    
                    if (typeof showAdminIndicator === 'function') {
                        showAdminIndicator();
                        console.log('Admin indicator - hoşgeldin paneli');
                    }

                    // Reload data
                    if (typeof loadUserCards === 'function') loadUserCards();
                    if (typeof loadReadingStats === 'function') loadReadingStats();
                    if (typeof renderLongestSeries === 'function') renderLongestSeries();
                    if (typeof loadMonthlyCalendar === 'function') loadMonthlyCalendar();

                    // Clean URL
                    window.history.replaceState({}, document.title, window.location.pathname);
                } else {
                    alert(updateData.error || 'Bilgiler güncellenirken bir hata oluştu.');
                }
            } catch (error) {
                console.error('Update error:', error);
                alert('Bilgiler güncellenirken bir hata oluştu.');
            } finally {
                // Reset button state
                welcomeInviteJoinBtn.innerHTML = originalText;
                welcomeInviteJoinBtn.disabled = false;
            }
        });
    }

    // Close welcome modal when clicking outside
    if (welcomeInviteModal) {
        window.addEventListener('click', function (event) {
            if (event.target === welcomeInviteModal) {
                window.hideModal(welcomeInviteModal);
                handleWelcomeModalClose();
            }
        });
    }

    // Handle welcome modal close based on group visibility
    function handleWelcomeModalClose() {
        // Clean URL first - remove invite parameters
        const cleanUrl = `/groupid=${encodeURIComponent(window.groupid)}`;
        window.history.replaceState({}, '', cleanUrl);

        // Always check group visibility (don't depend on localStorage)
        fetch(`/api/group/${window.groupid}`)
            .then(response => response.json())
            .then(data => {
                if (data.group.visibility === 'private') {
                    // Private group - redirect to home
                    window.location.href = '/';
                }
                // Public group - stay on page (URL already cleaned)
            })
            .catch(error => {
                console.error('Error checking group visibility:', error);
                // Default to staying on page (URL already cleaned)
            });
    }

    // Password toggle functionality
    const welcomeInviteMemberPasswordToggle = document.getElementById('welcomeInviteMemberPasswordToggle');
    const welcomeInviteMemberPasswordInput = document.getElementById('welcomeInviteMemberPassword');

    if (welcomeInviteMemberPasswordToggle && welcomeInviteMemberPasswordInput) {
        welcomeInviteMemberPasswordToggle.addEventListener('click', function () {
            const icon = this.querySelector('i');
            if (welcomeInviteMemberPasswordInput.type === 'password') {
                welcomeInviteMemberPasswordInput.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            } else {
                welcomeInviteMemberPasswordInput.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        });
    }

    // Profile image upload functionality
    const welcomeInviteUploadBtn = document.getElementById('welcomeInviteUploadBtn');
    const welcomeInviteProfileImage = document.getElementById('welcomeInviteProfileImage');
    const welcomeInviteProfilePreview = document.getElementById('welcomeInviteProfilePreview');

    if (welcomeInviteUploadBtn && welcomeInviteProfileImage && welcomeInviteProfilePreview) {
        welcomeInviteUploadBtn.addEventListener('click', function () {
            welcomeInviteProfileImage.click();
        });

        welcomeInviteProfileImage.addEventListener('change', function (e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    welcomeInviteProfilePreview.src = e.target.result;
                    
                    // Dosya yüklendiğinde avatar seçimini sıfırla
                    selectedAvatarPath = null;
                    console.log('Dosya yüklendi, avatar seçimi sıfırlandı');
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Show welcome invite modal
    window.showWelcomeInviteModal = async function(groupData, userData) {
        if (!welcomeInviteModal) return;

        // Update group info in modal
        const groupAvatar = document.getElementById('welcomeInviteGroupAvatar');
        const groupName = document.getElementById('welcomeInviteGroupName');
        const groupDescription = document.getElementById('welcomeInviteGroupDescription');
        const messageTitle = document.getElementById('welcomeInviteMessageTitle');
        const messageText = document.getElementById('welcomeInviteMessageText');

        if (groupAvatar) {
            const imgSrc = groupData.groupImage || '/images/open-book.webp';
            groupAvatar.src = imgSrc;
            groupAvatar.alt = groupData.groupName + ' Avatar';
            groupAvatar.onerror = function() {
                this.src = '/images/open-book.webp';
            };
        }

        if (groupName) {
            groupName.textContent = groupData.groupName;
        }

        if (groupDescription) {
            groupDescription.textContent = groupData.groupDescription || 'Bu gruba hoş geldiniz!';
        }

        // Update welcome message with user name
        const welcomeUserName = document.getElementById('welcomeUserName');
        if (welcomeUserName && userData && userData.name) {
            welcomeUserName.textContent = `Hoşgeldin ${userData.name}!`;
        }

        // Pre-fill form with existing user data
        if (userData) {
            const userNameInput = document.getElementById('welcomeInviteUserName');
            const memberNameInput = document.getElementById('welcomeInviteMemberName');
            const profilePreview = document.getElementById('welcomeInviteProfilePreview');
            
            if (userNameInput && userData.name) {
                userNameInput.value = userData.name;
            }
            
            if (memberNameInput && userData.username) {
                memberNameInput.value = userData.username;
            }

            if (profilePreview) {
                if (userData.profileImage) {
                    profilePreview.src = userData.profileImage;
                    profilePreview.onerror = function() {
                        this.src = '/images/default.png';
                    };
                } else {
                    profilePreview.src = '/images/default.png';
                }
            }
        }

        // Show modal
        window.showModal(welcomeInviteModal);
    };

    // Handle user login form submission
    groupsAuthLoginForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const username = groupsAuthLoginName.value.trim();
        const password = groupsAuthLoginPassword.value;

        // Clear previous errors
        groupsAuthLoginError.textContent = '';
        groupsAuthLoginError.classList.remove('show');

        // Basic validation
        if (!username || !password) {
            showError(groupsAuthLoginError, 'Lütfen tüm alanları doldurun');
            return;
        }

        try {
            const groupId = getGroupIdFromUrl();
            const response = await fetch('/api/admin-login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password, groupId })
            });

            const data = await response.json();

            if (data.success) {
                // 1. ÖNCE: Veri kaydetme ve temel işlemler
                LocalStorageManager.loginUser(data.groupId, data.userId, data.authority, username, data.groupName, data.name);
                
                // Private grup erişimi flag'ini sıfırla
                window.isPrivateGroupAccessModal = false;
                
                // Modal'ı kapat ve form'u temizle
                window.hideModal(groupsAuthLoginModal);
                groupsAuthLoginForm.reset();

                // 2. KULLANICI BİLGİLERİNİ UI'DA GÜNCELLE
                // Giriş serisi bilgisini UI'da güncelle
                if (data.loginStreak) {
                    const streakNumber = document.querySelector('.streak-number');
                    if (streakNumber) {
                        streakNumber.textContent = data.loginStreak;
                    }
                }
                
                // Kullanıcı profil bilgilerini UI'da güncelle
                const profileUsername = document.getElementById('profileUsername');
                const profileMemberName = document.getElementById('profileMemberName');
                const profileImagePreview = document.getElementById('profileImagePreview');
                
                if (profileUsername && data.name) {
                    profileUsername.textContent = data.name;
                }
                if (profileMemberName && data.username) {
                    profileMemberName.textContent = data.username;
                }
                if (profileImagePreview && data.profileImage) {
                    profileImagePreview.src = data.profileImage;
                }

                // 3. YETKİ VE NAVİGASYON GÜNCELLEMELERİ
                // adminIndicator güncelle
                if (typeof showAdminIndicator === 'function') {
                    showAdminIndicator();
                    console.log('Admin indicator - giriş yapıldı');
                }

                // Profil butonunu güncelle
                if (typeof window.updateProfileButton === 'function') {
                    window.updateProfileButton();
                }

                // 4. KULLANICI BİLDİRİMİ
                // Hoşgeldin mesajı göster
                showToast(`Hoşgeldin ${data.name}!`, 'success');

                // 5. VERİ YÜKLEME VE UI GÜNCELLEMELERİ
                // Reload data to update UI with admin privileges
                if (typeof loadTrackerTable === 'function') loadTrackerTable();
                if (typeof loadUserCards === 'function') loadUserCards();
                if (typeof loadMonthlyCalendar === 'function') loadMonthlyCalendar();
                if (typeof renderLongestSeries === 'function') renderLongestSeries();

                
            } else {
                showError(groupsAuthLoginError, 'Geçersiz kullanıcı adı veya şifre');
                if (typeof logUnauthorizedAccess === 'function') {
                logUnauthorizedAccess('Başarısız Yönetici girişi denemesi');
                }
                return;
            }
        } catch (error) {
            console.error('Login error:', error);
            showError(groupsAuthLoginError, 'Giriş işlemi sırasında bir hata oluştu');
            if (typeof logUnauthorizedAccess === 'function') {
            logUnauthorizedAccess('Başarısız Yönetici girişi denemesi');
            }
        }
    });

    // Helper functions
    function showError(errorElement, message) {
        errorElement.textContent = message;
        errorElement.classList.add('show');
    }

    function showSuccess(successElement, message) {
        successElement.textContent = message;
        successElement.classList.add('show');
    }

    // Keyboard navigation for user login form
    groupsAuthLoginName.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            groupsAuthLoginPassword.focus();
        }
    });

    groupsAuthLoginPassword.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            groupsAuthLoginForm.dispatchEvent(new Event('submit', {
                bubbles: true,
                cancelable: true
            }));
        }
    });

    // Groups Auth Join Avatar Button Event Listener
    const groupsAuthJoinAvatarBtn = document.getElementById('groupsAuthJoinAvatarBtn');
    if (groupsAuthJoinAvatarBtn) {
        groupsAuthJoinAvatarBtn.addEventListener('click', toggleGroupsAuthJoinAvatarModal);
    }

    // Groups Auth Join Profile Image Input Event Listener (already defined above, just add the avatar reset logic)
    if (groupsAuthJoinProfileImageInput) {
        // Add avatar reset logic to existing change event listener
        const existingChangeHandler = groupsAuthJoinProfileImageInput.onchange;
        groupsAuthJoinProfileImageInput.addEventListener('change', function() {
            if (this.files.length > 0) {
                selectedGroupsAuthJoinAvatarPath = null;
                console.log('Groups auth join modal - Dosya yüklendi, avatar seçimi sıfırlandı');
            }
        });
    }

    // Avatar'ları önceden yükle
    preloadAdminAvatars();

    // Avatar selection functionality
    const avatarBtn = document.getElementById('welcomeInviteAvatarBtn');
    if (avatarBtn) {
        avatarBtn.addEventListener('click', toggleUserAvatarModal);
    }

    // Remove image functionality
    const removeBtn = document.getElementById('welcomeInviteRemoveBtn');
    if (removeBtn) {
        removeBtn.addEventListener('click', function() {
            const previewImg = document.getElementById('welcomeInviteProfilePreview');
            const fileInput = document.getElementById('welcomeInviteProfileImage');
            
            if (previewImg) {
                previewImg.src = '/images/default.png';
            }
            
            if (fileInput) {
                fileInput.value = '';
            }
            
            // Avatar seçimini de sıfırla
            selectedAvatarPath = null;
            
            console.log('Resim kaldırıldı, varsayılan resim seçildi');
        });
    }

    // Profil resmi tıklanabilir yap ve başlangıçta loading efekti
    const profileImagePreview = document.getElementById('profileImagePreview');
    if (profileImagePreview) {
        profileImagePreview.addEventListener('click', function() {
            selectProfileImage();
        });
        
        // Başlangıçta loading efekti başlat
        profileImagePreview.classList.add('profile-image-loading');
    }
});


// ==================== Profile Modal Functions ====================

function showAdminInfoPanel() {
    // Yeni profil modalını aç
    openProfileModal();
}

async function openProfileModal() {
    const profileModal = document.getElementById('profileModal');
    if (!profileModal) return;

    // Önce modalı aç
    profileModal.style.display = 'flex';
    
    // Sonra kullanıcı bilgilerini yükle
    await loadProfileData();
}

function closeProfileModal() {
    const profileModal = document.getElementById('profileModal');
    if (profileModal) {
        profileModal.style.display = 'none';
    }
}

async function loadProfileData() {
    try {
        const userInfo = LocalStorageManager.getCurrentUserInfo();
        if (!userInfo) return;

        // Profil resmi için loading efekti başlat (default.png gösterme)
        const profileImage = document.getElementById('profileImagePreview');
        if (profileImage) {
            profileImage.classList.add('profile-image-loading');
            // Default resmi gizle, sadece loading efekti göster
            profileImage.style.display = 'none';
        }

        // Tüm verileri al (kullanıcılar ve istatistikler)
        const response = await fetch(`/api/all-data/${userInfo.groupId}`);
        const data = await response.json();

        if (data.users && data.stats) {
            // Kullanıcı bilgilerini bul
            const user = data.users.find(u => u._id === userInfo.userId);
            
            if (user) {
                // Kullanıcı bilgilerini güncelle
                document.getElementById('profileUsername').textContent = user.name || '-';
                document.getElementById('profileMemberName').textContent = user.username || '-';
                
                // Profil resmini güncelle
                if (user.profileImage) {
                    // Gerçek resim yüklenene kadar loading efekti devam eder
                    profileImage.onload = function() {
                        profileImage.classList.remove('profile-image-loading');
                        profileImage.style.display = 'block';
                    };
                    profileImage.onerror = function() {
                        profileImage.classList.remove('profile-image-loading');
                        profileImage.src = '/images/default.png';
                        profileImage.style.display = 'block';
                    };
                    profileImage.src = user.profileImage;
                } else {
                    // Default resim için loading efekti kaldır
                    profileImage.classList.remove('profile-image-loading');
                    profileImage.src = '/images/default.png';
                    profileImage.style.display = 'block';
                }
            }

            // Okuma skorunu hesapla (readingstatuses koleksiyonundan)
            const userReadingCount = data.stats.filter(stat => 
                stat.userId === userInfo.userId && stat.status === 'okudum'
            ).length;
            
            document.querySelector('.score-number').textContent = userReadingCount;
            
            // Giriş serisi bilgisini güncelle
            const streakNumber = document.querySelector('.streak-number');
            if (streakNumber && user.loginStreak !== undefined) {
                streakNumber.textContent = user.loginStreak;
            }
        }
    } catch (error) {
        console.error('Profil verileri yüklenirken hata:', error);
        
        // Hata durumunda loading efekti kaldır
        const profileImage = document.getElementById('profileImagePreview');
        if (profileImage) {
            profileImage.classList.remove('profile-image-loading');
            profileImage.src = '/images/default.png';
            profileImage.style.display = 'block';
        }
    }
}

function selectProfileImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
            uploadProfileImage(file);
        }
    };
    input.click();
}

async function uploadProfileImage(file) {
    try {
        const userInfo = LocalStorageManager.getCurrentUserInfo();
        if (!userInfo) return;

        // Loading efekti başlat
        const profileImagePreview = document.getElementById('profileImagePreview');
        if (profileImagePreview) {
            profileImagePreview.classList.add('profile-image-loading');
        }

        // Önce UI'da resmi güncelle (preview)
        const reader = new FileReader();
        reader.onload = function (e) {
            profileImagePreview.src = e.target.result;
        };
        reader.readAsDataURL(file);

        const formData = new FormData();
        formData.append('profileImage', file);
        formData.append('userId', userInfo.userId);
        formData.append('groupId', userInfo.groupId);

        const response = await fetch(`/api/update-user-image/${userInfo.groupId}`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        if (data.success) {
            // Loading efekti kaldır
            profileImagePreview.classList.remove('profile-image-loading');
            showToast('Profil resmi güncellendi!', 'success');
            
            // UI'ı güncelle
            await updateUIAfterProfileChange();
        } else {
            // Loading efekti kaldır
            profileImagePreview.classList.remove('profile-image-loading');
            showToast('Profil resmi güncellenemedi!', 'error');
        }
    } catch (error) {
        console.error('Profil resmi yüklenirken hata:', error);
        const profileImagePreview = document.getElementById('profileImagePreview');
        if (profileImagePreview) {
            profileImagePreview.classList.remove('profile-image-loading');
        }
        showToast('Profil resmi yüklenirken hata oluştu!', 'error');
    }
}

async function removeProfileImage() {
    if (confirm('Profil resmini silmek istediğinizden emin misiniz?')) {
        try {
            const userInfo = LocalStorageManager.getCurrentUserInfo();
            if (!userInfo) return;

            // Loading efekti başlat
            const profileImagePreview = document.getElementById('profileImagePreview');
            if (profileImagePreview) {
                profileImagePreview.classList.add('profile-image-loading');
            }

            const response = await fetch('/api/remove-user-profile-image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: userInfo.userId,
                    groupId: userInfo.groupId
                })
            });

            const data = await response.json();
            if (data.success) {
                // Default resme geri döndür
                profileImagePreview.src = '/images/default.png';
                profileImagePreview.classList.remove('profile-image-loading');
                showToast('Profil resmi silindi!', 'success');
                
                // UI'ı güncelle
                await updateUIAfterProfileChange();
            } else {
                profileImagePreview.classList.remove('profile-image-loading');
                showToast('Profil resmi silinemedi!', 'error');
            }
        } catch (error) {
            console.error('Profil resmi silinirken hata:', error);
            const profileImagePreview = document.getElementById('profileImagePreview');
            if (profileImagePreview) {
                profileImagePreview.classList.remove('profile-image-loading');
            }
            showToast('Profil resmi silinirken hata oluştu!', 'error');
        }
    }
}

function openProfileAvatarModal() {
    const avatarModal = document.getElementById('profileAvatarModal');
    if (!avatarModal) return;

    // Avatarlar zaten önceden yüklenmiş, sadece modalı aç
    avatarModal.style.display = 'flex';
}

function closeProfileAvatarModal() {
    const avatarModal = document.getElementById('profileAvatarModal');
    if (avatarModal) {
        avatarModal.style.display = 'none';
    }
}

async function loadProfileAvatars() {
    try {
        const response = await fetch('/api/user-avatars');
        const avatars = await response.json();
        
        const avatarGrid = document.getElementById('profileAvatarGrid');
        if (!avatarGrid) return;
        
        avatarGrid.innerHTML = '';
        
        avatars.forEach((avatar, index) => {
            const avatarItem = document.createElement('div');
            avatarItem.className = 'profile-modal-avatar-item';
            avatarItem.innerHTML = `
                <img src="/userAvatars/${avatar}" alt="Avatar ${index + 1}">
            `;
            
            avatarItem.addEventListener('click', function() {
                selectProfileAvatar(`/userAvatars/${avatar}`);
            });
            
            avatarGrid.appendChild(avatarItem);
        });
    } catch (error) {
        console.error('Avatarlar yüklenirken hata:', error);
        const avatarGrid = document.getElementById('profileAvatarGrid');
        if (avatarGrid) {
            avatarGrid.innerHTML = '<p>Avatar yüklenirken hata oluştu.</p>';
        }
    }
}

async function selectProfileAvatar(avatarPath) {
    try {
        const userInfo = LocalStorageManager.getCurrentUserInfo();
        if (!userInfo) return;

        // Önce mevcut resmi Dropbox'tan sil (eğer Dropbox resmi ise)
        const profileImagePreview = document.getElementById('profileImagePreview');
        const currentImageSrc = profileImagePreview.src;
        
        if (currentImageSrc && currentImageSrc.includes('dropbox.com')) {
            try {
                await fetch('/api/remove-user-profile-image', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        userId: userInfo.userId,
                        groupId: userInfo.groupId
                    })
                });
                console.log('Eski resim Dropbox\'tan silindi');
            } catch (deleteError) {
                console.error('Eski resim silme hatası:', deleteError);
                // Silme hatası olsa bile devam et
            }
        }

        // Avatar'ı güncelle
        const response = await fetch('/api/update-user-avatar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: userInfo.userId,
                groupId: userInfo.groupId,
                avatarPath: avatarPath
            })
        });

        const data = await response.json();
        if (data.success) {
            // Profil resmini güncelle
            profileImagePreview.src = avatarPath;
            closeProfileAvatarModal();
            showToast('Avatar seçildi!', 'success');
            
            // API başarılı olduktan sonra UI'ı güncelle
            await updateUIAfterProfileChange();
        } else {
            showToast('Avatar seçilemedi!', 'error');
        }
    } catch (error) {
        console.error('Avatar seçilirken hata:', error);
        showToast('Avatar seçilirken hata oluştu!', 'error');
    }
}

function openProfileSettingsModal() {
    const settingsModal = document.getElementById('profileSettingsModal');
    if (!settingsModal) return;

    // Profil modalını kapat
    closeProfileModal();

    // Ayarlar modalını aç
    settingsModal.style.display = 'flex';
    
    // Mevcut bilgileri doldur
    loadProfileSettings();
}

function closeProfileSettingsModal() {
    const settingsModal = document.getElementById('profileSettingsModal');
    if (settingsModal) {
        settingsModal.style.display = 'none';
    }
}

async function loadProfileSettings() {
    try {
        const userInfo = LocalStorageManager.getCurrentUserInfo();
        if (!userInfo) return;

        const response = await fetch(`/api/all-data/${userInfo.groupId}`);
        const data = await response.json();

        if (data.users) {
            // Kullanıcı bilgilerini bul
            const user = data.users.find(u => u._id === userInfo.userId);
            
            if (user) {
                // Mevcut bilgileri input alanlarına yaz
                document.getElementById('settingsUsername').value = user.name || '';
                document.getElementById('settingsMemberName').value = user.username || '';
                
                // Şifre alanlarını temizle
                document.getElementById('settingsPassword').value = '';
                document.getElementById('settingsPasswordConfirm').value = '';
            }
        }
    } catch (error) {
        console.error('Ayarlar yüklenirken hata:', error);
    }
}

async function saveProfileSettings() {
    try {
        // Kullanıcı bilgileri güncelleme işlemini logla
        if (typeof logUnauthorizedAccess === 'function') {
            logUnauthorizedAccess('Kullanıcı bilgileri güncelleme');
        }
        
        const userInfo = LocalStorageManager.getCurrentUserInfo();
        if (!userInfo) return;

        const usernameEl = document.getElementById('settingsUsername');
        const memberNameEl = document.getElementById('settingsMemberName');
        const passwordEl = document.getElementById('settingsPassword');
        const passwordConfirmEl = document.getElementById('settingsPasswordConfirm');

        const username = usernameEl ? usernameEl.value.trim() : '';
        const memberName = memberNameEl ? memberNameEl.value.trim() : '';
        const password = passwordEl ? passwordEl.value.trim() : '';
        const passwordConfirm = passwordConfirmEl ? passwordConfirmEl.value.trim() : '';

        if (password && password !== passwordConfirm) {
            showToast('Şifreler eşleşmiyor!', 'error');
            return;
        }

        const updateData = {
            userId: userInfo.userId,
            groupId: userInfo.groupId,
            username: username,
            memberName: memberName
        };

        if (password) {
            updateData.password = password;
        }

        const response = await fetch('/api/update-user-settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData)
        });

        const data = await response.json();
        if (data.success) {
            closeProfileSettingsModal();
            closeProfileModal();
            showToast('Ayarlar güncellendi!', 'success');
            // Sayfayı yeniden yükle
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } else {
            showToast('Ayarlar güncellenemedi!', 'error');
        }
    } catch (error) {
        console.error('Ayarlar kaydedilirken hata:', error);
        showToast('Ayarlar kaydedilirken hata oluştu!', 'error');
    }
}

async function deleteAccount() {
    if (confirm('Hesabınızı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz!')) {
        if (confirm('Son kez soruyorum: Hesabınızı silmek istediğinizden emin misiniz?')) {
            try {
                const userInfo = LocalStorageManager.getCurrentUserInfo();
                if (!userInfo) return;

                const response = await fetch('/api/delete-user-account', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        userId: userInfo.userId,
                        groupId: userInfo.groupId
                    })
                });

                const data = await response.json();
                if (data.success) {
                    showToast('Hesabınız silindi!', 'success');
                    // Ayarlar panelini kapat
                    closeProfileSettingsModal();
                    // Çıkış yap
                    setTimeout(() => {
                        window.location.reload();
                    }, 1500);
                } else {
                    showToast('Hesap silinemedi!', 'error');
                }
            } catch (error) {
                console.error('Hesap silinirken hata:', error);
                showToast('Hesap silinirken hata oluştu!', 'error');
            }
        }
    }
}

function logoutFromProfile() {
            // Yeni sistem ile çıkış yap
            LocalStorageManager.logoutUser();
            closeProfileModal();

            // showAdminIndicator() çıkış durumu için tüm elementleri gizler
            showAdminIndicator();
            console.log('Admin indicator - çıkış yapıldı');
            
            showToast('Çıkış yapıldı!', 'success');
            
            // Reload data to update UI without admin privileges
            loadTrackerTable();

            // Profil butonunu güncelle
            if (typeof window.updateProfileButton === 'function') {
                window.updateProfileButton();
            }
}


// Modal dışına tıklandığında kapat
document.addEventListener('click', function(event) {
    const profileModal = document.getElementById('profileModal');
    const avatarModal = document.getElementById('profileAvatarModal');
    const settingsModal = document.getElementById('profileSettingsModal');
    
    if (event.target === profileModal) {
        closeProfileModal();
    }
    if (event.target === avatarModal) {
        closeProfileAvatarModal();
    }
    if (event.target === settingsModal) {
        closeProfileSettingsModal();
    }
});

// Profil değişikliği sonrası UI güncelleme
async function updateUIAfterProfileChange() {
    // Kısa bir gecikme ekle (veritabanı güncellemesi için)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Sayfayı yeniden yükle - en garantili çözüm
    window.location.reload();
}

// Toast mesajı fonksiyonu
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('toast-hide');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 300);
    }, 3000);
}


// User Avatar Modal Functions
let selectedAvatarPath = null; // Seçilen avatar yolunu saklamak için

function toggleUserAvatarModal() {
    const modal = document.getElementById('userAvatarModal');
    if (modal) {
        modal.classList.toggle('show');
        // Avatar'lar önceden yüklendiği için tekrar yüklemeye gerek yok
    }
}

async function loadUserAvatarOptions() {
    const avatarGrid = document.getElementById('userAvatarGrid');
    if (!avatarGrid) return;

    try {
        // userAvatars klasöründeki resimleri yükle
        const response = await fetch('/api/user-avatars');
        const avatars = await response.json();
        
        avatarGrid.innerHTML = '';
        
        avatars.forEach((avatar, index) => {
            const avatarItem = document.createElement('div');
            avatarItem.className = 'avatar-item';
            avatarItem.innerHTML = `
                <img src="/userAvatars/${avatar}" alt="Avatar ${index + 1}">
            `;
            
            avatarItem.addEventListener('click', function() {
                // Seçili avatar'ı profil önizlemesine uygula
                const previewImg = document.getElementById('welcomeInviteProfilePreview');
                if (previewImg) {
                    const avatarPath = `/userAvatars/${avatar}`;
                    previewImg.src = avatarPath;
                    
                    // Avatar yolunu kaydet
                    selectedAvatarPath = avatarPath;
                    
                    console.log('Seçilen avatar yolu:', selectedAvatarPath);
                }
                
                // Modal'ı kapat
                toggleUserAvatarModal();
            });
            
            avatarGrid.appendChild(avatarItem);
        });
    } catch (error) {
        console.error('Avatar yükleme hatası:', error);
        avatarGrid.innerHTML = '<p>Avatar yüklenirken hata oluştu.</p>';
    }
}

// Avatar'ları önceden yükle (sayfa yüklendiğinde)
async function preloadAdminAvatars() {
    try {
        // Hoşgeldiniz panelindeki user avatar'larını önceden yükle
        await loadUserAvatarOptions();
        // Groups auth join panelindeki user avatar'larını önceden yükle
        await loadGroupsAuthJoinAvatarOptions();
        // Profil modalındaki user avatar'larını önceden yükle
        await loadProfileAvatars();
    } catch (error) {
        console.error('Admin avatar ön yükleme hatası:', error);
    }
}

// Groups Auth Join Avatar Modal Functions
let selectedGroupsAuthJoinAvatarPath = null; // Groups auth join modal için seçilen avatar yolu

function toggleGroupsAuthJoinAvatarModal() {
    const modal = document.getElementById('groupsAuthJoinAvatarModal');
    if (modal) {
        modal.classList.toggle('show');
        // Avatar'lar önceden yüklendiği için tekrar yüklemeye gerek yok
    }
}

async function loadGroupsAuthJoinAvatarOptions() {
    const avatarGrid = document.getElementById('groupsAuthJoinAvatarGrid');
    if (!avatarGrid) return;

    try {
        const response = await fetch('/api/user-avatars');
        if (!response.ok) {
            throw new Error('Avatar listesi alınamadı');
        }

        const avatars = await response.json();
        avatarGrid.innerHTML = '';

        avatars.forEach(avatar => {
            const avatarItem = document.createElement('div');
            avatarItem.className = 'avatar-item';
            avatarItem.innerHTML = `
                <img src="/userAvatars/${avatar}" alt="${avatar}">
            `;

            avatarItem.addEventListener('click', function() {
                const fileInputText = document.querySelector('#groupsAuthJoinModal .groups-auth-join-file-input-text');
                if (fileInputText) {
                    fileInputText.textContent = 'Avatar seçildi';
                    fileInputText.style.color = '#28a745'; // Yeşil renk
                }
                selectedGroupsAuthJoinAvatarPath = `/userAvatars/${avatar}`;
                const groupsAuthJoinProfileImageInput = document.getElementById('groupsAuthJoinProfileImageInput');
                if (groupsAuthJoinProfileImageInput) {
                    groupsAuthJoinProfileImageInput.value = '';
                }
                console.log('Groups auth join modal - Avatar seçildi:', selectedGroupsAuthJoinAvatarPath);
                toggleGroupsAuthJoinAvatarModal();
            });

            avatarGrid.appendChild(avatarItem);
        });
    } catch (error) {
        console.error('Groups auth join avatar yükleme hatası:', error);
        avatarGrid.innerHTML = '<p>Avatar yüklenirken hata oluştu.</p>';
    }
}