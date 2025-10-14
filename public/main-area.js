// Global değişkenler
let renderUserListTimeout = null;

// Mesaj kuyruğu sistemi
let messageQueue = [];
let isShowingMessage = false;

// Mesaj kuyruğunu işle
function processMessageQueue() {
    if (messageQueue.length === 0) {
        isShowingMessage = false;
        return;
    }

    isShowingMessage = true;
    const { message, type } = messageQueue.shift();

    // Mevcut bildirimleri kaldır
    const existingNotifications = document.querySelectorAll('.notification-toast, .success-message, .error-message');
    existingNotifications.forEach(notification => notification.remove());

    // Yeni bildirim oluştur
    const notification = document.createElement('div');
    notification.className = `notification-toast notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fa-solid fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        </div>
    `;

    // Stil CSS'ten gelecek

    document.body.appendChild(notification);

    // 3 saniye sonra kaldır, sonra kuyruktaki sonraki mesajı göster
    setTimeout(() => {
        notification.classList.add('notification-hide');
        setTimeout(() => {
            if (document.body.contains(notification)) {
                notification.remove();
            }
            // Kuyruktaki sonraki mesajı göster (2 saniye bekle - daha uzun aralık)
            setTimeout(() => {
                processMessageQueue();
            }, 2000);
        }, 500);
    }, 3000);
}

newUserForm.addEventListener('submit', async (e) => {  //Kullanıcı ekleme fonksiyonu
    e.preventDefault();

    // Check if user is authenticated and has admin rights
    if (!LocalStorageManager.isAdmin()) {
        logUnauthorizedAccess('Yeni kullanıcı ekleme');
        return;
    }

    const input = document.getElementById('newUserInput');
    const imageInput = document.getElementById('profileImage');
    const submitBtn = document.querySelector('#newUserForm button[type="submit"]');
    const name = input.value.trim();

    if (!name) return;

    // Loading göstergesi
    const originalBtnText = submitBtn.textContent;
    submitBtn.textContent = 'Ekleniyor...';
    submitBtn.disabled = true;

    try {
        const formData = new FormData();
        formData.append('name', name);

        if (imageInput.files.length > 0) {
            formData.append('profileImage', imageInput.files[0]);
        }
        if (selectedAddUserAvatarPath) {
            formData.append('selectedAvatarPath', selectedAddUserAvatarPath);
        }

        // Kullanıcıyı ekle (yeni sistem: önce yerel, sonra Dropbox)
        const response = await fetch(`/api/add-user/${window.groupid}`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Kullanıcı ekleme başarısız');
        }

        const result = await response.json();

        // Form alanlarını temizle
        input.value = '';
        imageInput.value = '';
        if (uploadBtn) {
            uploadBtn.innerHTML = '<i class="fa-solid fa-upload"></i>Yükle';
        }
        imagePreviewContainer.style.display = 'none';
        
        // Input-profile-image'i varsayılan resme döndür
        inputProfileImage.src = '/images/default.png';
        
        // Add-user-input-profile-image'i de varsayılan resme döndür
        const addUserInputProfileImage = document.getElementById('addUserInputProfileImage');
        if (addUserInputProfileImage) {
            addUserInputProfileImage.src = '/images/default.png';
        }
        
        // Avatar seçimini sıfırla
        selectedAddUserAvatarPath = null;

        // UI'ı güncelle (yerel resim ile başlar, Dropbox yüklemesi arka planda olur)
        if (LocalStorageManager.isAdmin()) {
            renderUserList();
        }
        loadTrackerTable();
        loadUserCards();
        loadReadingStats();
        renderLongestSeries();
        showSuccessMessage('Kullanıcı başarıyla eklendi!');
        if (window.updateMonthlyCalendarUsers) window.updateMonthlyCalendarUsers();

    } catch (error) {
        console.error('Kullanıcı ekleme hatası:', error);
        showErrorMessage('Kullanıcı eklenirken hata oluştu!');
    } finally {
        // Loading göstergesini kaldır
        submitBtn.textContent = originalBtnText;
        submitBtn.disabled = false;
    }
});

async function deleteUser(id) {     //Kullanıcıyı silme fonksiyonu
    // Check if user is authenticated and has admin rights
    if (!LocalStorageManager.isAdmin()) {
        logUnauthorizedAccess('Kullanıcı silme');
        return;
    }

    // Find the user name for the confirmation message
    const userContainer = document.querySelector(`#userList [data-user-id="${id}"]`);
    if (!userContainer) {
        console.error('User container not found for userId:', id);
        return;
    }
    const userElement = userContainer.querySelector('li');
    const userName = userElement ? userElement.querySelector('.profil-image-user-name').textContent : 'this user';

    // Admin sayısını kontrol et
    const currentAdminCount = await getAdminCount();
    const userAuthority = userContainer.querySelector('.authority-select').value;
    
    // Eğer son admin'i silmeye çalışıyorsa engelle
    if (userAuthority === 'admin' && currentAdminCount <= 1) {
        showErrorMessage('En az bir yönetici hesabı bulunmalıdır!');
        return;
    }

    // Kendi hesabını silme kontrolü
    const currentUserInfo = LocalStorageManager.getCurrentUserInfo();
    const isDeletingSelf = currentUserInfo && currentUserInfo.userId === id;
    
    let confirmMessage = `Silmek istediğine emin misin: ->  ${userName}  <- Bu işlem geri alınamaz.`;
    if (isDeletingSelf) {
        confirmMessage = `Kendi hesabınızı silmek istediğinizi onaylıyor musunuz?\n\n` +
                        `Bu işlem sonrasında otomatik olarak çıkış yapacaksınız ve hesabınız tamamen silinecektir.\n\n` +
                        `Bu işlem geri alınamaz!`;
    }

    // Ask for confirmation before deleting
    const confirmed = confirm(confirmMessage);

    if (confirmed) {
        // Loading göstergesi
        const deleteBtn = document.querySelector(`li[data-user-id="${id}"] .delete-user-btn`);
        if (deleteBtn) {
            const originalText = deleteBtn.textContent;
            deleteBtn.textContent = 'Siliniyor...';
            deleteBtn.disabled = true;
        }

        try {
            await fetch(`/api/delete-user/${window.groupid}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });

            // Eğer kendi hesabını sildiyse
            if (isDeletingSelf) {
                showSuccessMessage('Hesabınız silindi. Çıkış yapılıyor...');
                // LocalStorage'dan çıkış yap
                LocalStorageManager.logoutUser();
                // Sayfayı yenile
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
                return;
            }
            
            if (LocalStorageManager.isAdmin()) {
                renderUserList();
            }
            loadTrackerTable();
            loadUserCards();
            loadReadingStats();
            renderLongestSeries();
            showSuccessMessage('Kullanıcı başarıyla silindi!');
            if (window.updateMonthlyCalendarUsers) window.updateMonthlyCalendarUsers();
        } catch (error) {
            console.error('Kullanıcı silme hatası:', error);
            showErrorMessage('Kullanıcı silinirken hata oluştu!');
        } finally {
            // Loading göstergesini kaldır
            if (deleteBtn) {
                deleteBtn.textContent = originalText;
                deleteBtn.disabled = false;
            }
        }
    }
}

async function saveUserName(userId) {   //Kullanıcı adını güncelleme fonksiyonu
    // Check if user is authenticated and has admin rights
    if (!LocalStorageManager.isAdmin()) {
        logUnauthorizedAccess('Kullanıcı adı güncelleme');
        return;
    }

    const userContainer = document.querySelector(`#userList [data-user-id="${userId}"]`);
    if (!userContainer) {
        console.error('User container not found for userId:', userId);
        return;
    }
    const userItem = userContainer.querySelector('li');
    if (!userItem) {
        console.error('1-User item not found in container for userId:', userId);
        return;
    }
    const nameSpan = userItem.querySelector('.profil-image-user-name');
    const nameInput = userItem.querySelector('.edit-name-input');
    const saveButton = userItem.querySelector('.save-name-button');

    const newName = nameInput.value.trim();
    if (!newName) {
        showErrorMessage('Kullanıcı adı boş olamaz!');
        return; // Don't save empty names
    }

    saveButton.disabled = true;

    try {
        // Update the user name in the database
        const response = await fetch(`/api/update-user/${window.groupid}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, name: newName })
        });

        if (!response.ok) {
            throw new Error('Kullanıcı adı güncellenemedi');
        }

        // Hide input, save button and cancel button, show name span, edit button and settings button
        nameSpan.style.display = 'inline-block';
        nameInput.style.display = 'none';
        saveButton.style.display = 'none';
        
        const cancelButton = userItem.querySelector('.cancel-edit-button');
        if (cancelButton) {
            cancelButton.style.display = 'none';
        }
        
        // Show edit button and settings button
        const editButton = userItem.querySelector('.edit-name-button');
        if (editButton) {
            editButton.style.display = 'inline-block';
        }
        
        const settingsButton = userItem.querySelector('.settings-button');
        if (settingsButton) {
            settingsButton.style.display = 'inline-block';
        }

        // Update the name span with new name
        nameSpan.textContent = newName;

        // Profile image'ı normal haline döndür
        const profileImage = userItem.querySelector('.user-profile-image');
        if (profileImage) {
            profileImage.style.border = '';
            profileImage.style.boxShadow = '';
            profileImage.style.transform = '';
            profileImage.style.transition = '';
        }

        // Update other components that might show the user name
        loadTrackerTable();
        loadUserCards();
        loadReadingStats();
        renderLongestSeries();
        if (window.updateMonthlyCalendarUsers) window.updateMonthlyCalendarUsers();
        
        // Update user select dropdown for invites (only the dropdown, not the entire list)
        updateUserSelectDropdownForSingleUser(userId, newName);
        
        saveButton.disabled = false;
        showSuccessMessage('Kullanıcı adı başarıyla güncellendi!');

    } catch (error) {
        console.error('Kullanıcı adı güncelleme hatası:', error);
        showErrorMessage('Kullanıcı adı güncellenirken hata oluştu!');
        
        // Reset button state
        saveButton.disabled = false;
        
        // Hide cancel button and show edit button and settings button again on error
        const cancelButton = userItem.querySelector('.cancel-edit-button');
        if (cancelButton) {
            cancelButton.style.display = 'none';
        }
        
        const editButton = userItem.querySelector('.edit-name-button');
        if (editButton) {
            editButton.style.display = 'inline-block';
        }
        
        const settingsButton = userItem.querySelector('.settings-button');
        if (settingsButton) {
            settingsButton.style.display = 'inline-block';
        }
    }
}

function editUserName(userId) {     //Kullanıcı adını düzenleme fonksiyonu
    // Check if user is authenticated and has admin rights
    if (!LocalStorageManager.isAdmin()) {
        logUnauthorizedAccess('Kullanıcı adı düzenleme');
        return;
    }

    const userContainer = document.querySelector(`#userList [data-user-id="${userId}"]`);
    if (!userContainer) {
        console.error('User container bulunamadı, userId:', userId);
        return;
    }
    
    const userItem = userContainer.querySelector('li');
    if (!userItem) {
        console.error('Li element bulunamadı, userId:', userId);
        return;
    }
    
    const nameSpan = userItem.querySelector('.profil-image-user-name');
    const nameInput = userItem.querySelector('.edit-name-input');
    const editButton = userItem.querySelector('.edit-name-button');
    const saveButton = userItem.querySelector('.save-name-button');
    const cancelButton = userItem.querySelector('.cancel-edit-button');
    const settingsButton = userItem.querySelector('.settings-button');
    const profileImage = userItem.querySelector('.user-profile-image');

    // Hide name span, edit button and settings button, show input, save button and cancel button
    if (nameSpan) nameSpan.style.display = 'none';
    if (editButton) editButton.style.display = 'none';
    if (settingsButton) settingsButton.style.display = 'none';
    if (nameInput) nameInput.style.display = 'inline-block';
    if (saveButton) saveButton.style.display = 'inline-block';
    if (cancelButton) cancelButton.style.display = 'inline-block';
    
    // Profile image'ı belirgin hale getir
    if (profileImage) {
        profileImage.style.border = '1px solid rgb(0 13 255)';
        profileImage.style.boxShadow = '0 0 5px rgba(78, 84, 200, 0.5)'
        profileImage.style.transition = 'all 0.3s ease';
    }
    
    // Focus on input and select text
    if (nameInput) {
        nameInput.focus();
        nameInput.select();
    }
}

function changeUserImage(userId) {     //Kullanıcı resmi değiştirme fonksiyonu
    // Check if user is authenticated and has admin rights
    if (!LocalStorageManager.isAdmin()) {
        logUnauthorizedAccess('Kullanıcı resmi değiştirme');
        return;
    }

    // Create a hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    // Trigger click on the file input
    fileInput.click();

    // Handle file selection
    fileInput.addEventListener('change', async function () {
        if (this.files.length > 0) {
            const file = this.files[0];
            
            // Önce UI'da resmi güncelle
            const userContainer = document.querySelector(`#userList [data-user-id="${userId}"]`);
            if (!userContainer) {
                console.error('User container not found for userId:', userId);
                return;
            }
            const userItem = userContainer.querySelector('li');
            if (userItem) {
                const userImage = userItem.querySelector('.user-profile-image');
                if (userImage) {
                    // Yeni resmi önizleme olarak göster
                    const reader = new FileReader();
                    reader.onload = function (e) {
                        userImage.src = e.target.result;
                    };
                    reader.readAsDataURL(file);
                }
            }

            // Resim güncelleme (yeni sistem: önce yerel, sonra Dropbox)
            const formData = new FormData();
            formData.append('userId', userId);
            formData.append('profileImage', file);

            try {
                const response = await fetch(`/api/update-user-image/${window.groupid}`, {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    throw new Error('Resim güncelleme başarısız');
                }

                const result = await response.json();
                
                // Diğer bileşenleri güncelle (yerel resim ile başlar, Dropbox yüklemesi arka planda olur)
                loadTrackerTable();
                loadUserCards();
                loadReadingStats();
                renderLongestSeries();

            } catch (error) {
                console.error('Resim güncelleme hatası:', error);
                // Hata durumunda resmi eski haline geri döndür
                if (userItem) {
                    const userImage = userItem.querySelector('.user-profile-image');
                    if (userImage) {
                        userImage.src = userImage.src; // Sayfayı yenile
                    }
                }
                showErrorMessage('Resim güncellenirken hata oluştu!');
            }

            document.body.removeChild(fileInput);
        }
    });
}

// File input display handler
const profileImageInput = document.getElementById('profileImage');
const uploadBtn = document.getElementById('uploadBtn');
const imagePreview = document.getElementById('imagePreview');
const imagePreviewContainer = document.getElementById('imagePreviewContainer');
const closePreviewButton = document.getElementById('closePreview');
const inputProfileImage = document.getElementById('imagePreview'); // imagePreview element'ini kullan

// Add User Avatar Selection
let selectedAddUserAvatarPath = null; // Kullanıcı ekleme için seçilen avatar yolu

// Upload butonu event listener
if (uploadBtn) {
    uploadBtn.addEventListener('click', function() {
        if (profileImageInput) {
            profileImageInput.click();
        }
    });
}

// Avatar seç butonu event listener
const addUserAvatarBtn = document.getElementById('addUserAvatarBtn');
if (addUserAvatarBtn) {
    addUserAvatarBtn.addEventListener('click', () => {
        if (typeof logUnauthorizedAccess === 'function') {
            logUnauthorizedAccess('Kullanıcı ekleme avatar seçimi');
        }
        toggleAddUserAvatarModal();
    });
}

// Sil butonu event listener
const addUserRemoveBtn = document.getElementById('addUserRemoveBtn');
if (addUserRemoveBtn) {
    addUserRemoveBtn.addEventListener('click', function() {
        if (typeof logUnauthorizedAccess === 'function') {
            logUnauthorizedAccess('Kullanıcı ekleme resim silme');
        }
        
        // Profil önizlemesini varsayılan resme döndür
        const previewImg = document.getElementById('addUserInputProfileImage');
        if (previewImg) {
            previewImg.src = '/images/default.png';
        }
        
        // Dosya input'unu temizle
        if (profileImageInput) {
            profileImageInput.value = '';
        }
        
        // Avatar seçimini sıfırla
        selectedAddUserAvatarPath = null;
        
        // Resim önizleme container'ını gizle
        if (imagePreviewContainer) {
            imagePreviewContainer.style.display = 'none';
        }
        
        // Buton metnini sıfırla
        if (uploadBtn) {
            uploadBtn.innerHTML = '<i class="fa-solid fa-upload"></i>Yükle';
        }
        
    });
}

// inputProfileImage tıklanınca file seçim işlemi
if (inputProfileImage) {
    inputProfileImage.addEventListener('click', function() {
        const fileInputLabel = document.querySelector('label.custom-file-input');
        if (fileInputLabel) {
            fileInputLabel.click();
        }
    });
}

function resetImagePreview() {    // Resim önizleme kapatma fonksiyonu
    imagePreviewContainer.style.display = 'none';
    if (uploadBtn) {
        uploadBtn.innerHTML = '<i class="fa-solid fa-upload"></i>Yükle';
    }
    profileImageInput.value = ''; // Input değerini de temizle
    
    // Input-profile-image'i varsayılan resme döndür
    inputProfileImage.src = '/images/default.png';
    
    // Add-user-input-profile-image'i de varsayılan resme döndür
    const addUserInputProfileImage = document.getElementById('addUserInputProfileImage');
    if (addUserInputProfileImage) {
        addUserInputProfileImage.src = '/images/default.png';
    }
    
    // Avatar seçimini de sıfırla
    selectedAddUserAvatarPath = null;
}

if (closePreviewButton) {
    closePreviewButton.addEventListener('click', function (e) {
        e.preventDefault();
        resetImagePreview();
    });
}

if (profileImageInput) {
    profileImageInput.addEventListener('change', function () {
        if (this.files.length > 0) {
            if (uploadBtn) {
                uploadBtn.innerHTML = '<i class="fa-solid fa-upload"></i>Değiştir';
            }

            // Resim ön izlemesi göster
            const file = this.files[0];
            const reader = new FileReader();

            reader.onload = function (e) {
                // Ana önizleme alanını güncelle
                imagePreview.src = e.target.result;
                imagePreviewContainer.style.display = 'flex';
                
                // Input-profile-image'i güncelle
                inputProfileImage.src = e.target.result;
                
                // Add-user-input-profile-image'i de güncelle
                const addUserInputProfileImage = document.getElementById('addUserInputProfileImage');
                if (addUserInputProfileImage) {
                    addUserInputProfileImage.src = e.target.result;
                }
                
                // Avatar seçimini sıfırla (tek seçim mantığı)
                selectedAddUserAvatarPath = null;
            }

            reader.readAsDataURL(file);
        } else {
            resetImagePreview();
        }
    });
}

function showSuccessMessage(message) {
    // Mesajı kuyruğa ekle
    messageQueue.push({ message, type: 'success' });
    
    // Eğer şu anda mesaj gösterilmiyorsa, kuyruktan mesaj göster
    if (!isShowingMessage) {
        processMessageQueue();
    }
}

function showErrorMessage(message) {
    // Mesajı kuyruğa ekle
    messageQueue.push({ message, type: 'error' });
    
    // Eğer şu anda mesaj gösterilmiyorsa, kuyruktan mesaj göster
    if (!isShowingMessage) {
        processMessageQueue();
    }
}

function toggleDeleteButton(userId) {     //Kullanıcı silme butonunu açma fonksiyonu
    // Check if user is authenticated and has admin rights
    if (!LocalStorageManager.isAdmin()) {
        logUnauthorizedAccess('Kullanıcı silme butonu açma');
        return;
    }

    const userContainer = document.querySelector(`#userList [data-user-id="${userId}"]`);
    if (!userContainer) {
        console.error('User container bulunamadı, userId:', userId);
        return;
    }
    
    const userItem = userContainer.querySelector('li');
    if (!userItem) {
        console.error('Li element bulunamadı, userId:', userId);
        return;
    }
    
    const deleteButton = userItem.querySelector('.delete-button');
    const settingsButton = userItem.querySelector('.settings-button');
    const cancelButton = userItem.querySelector('.cancel-settings-button');
    const editButton = userItem.querySelector('.edit-name-button');

    if (deleteButton && deleteButton.style.display === 'none') {
        if (deleteButton) deleteButton.style.display = 'inline-block';
        if (settingsButton) settingsButton.style.display = 'none';
        if (editButton) editButton.style.display = 'none';
        if (cancelButton) cancelButton.style.display = 'inline-block';
    } else {
        if (settingsButton) settingsButton.style.display = 'inline-block';
        if (editButton) editButton.style.display = 'inline-block';
        if (deleteButton) deleteButton.style.display = 'none';
        if (cancelButton) cancelButton.style.display = 'none';
    }
}

function cancelEditUserName(userId) {     //Kullanıcı adı düzenleme iptal fonksiyonu
    // Check if user is authenticated and has admin rights
    if (!LocalStorageManager.isAdmin()) {
        logUnauthorizedAccess('Kullanıcı adı düzenleme iptal');
        return;
    }

    const userContainer = document.querySelector(`#userList [data-user-id="${userId}"]`);
    if (!userContainer) {
        console.error('User container not found for userId:', userId);
        return;
    }
    const userItem = userContainer.querySelector('li');
    if (!userItem) {
        console.error('4-User item not found in container for userId:', userId);
        return;
    }
    const nameSpan = userItem.querySelector('.profil-image-user-name');
    const nameInput = userItem.querySelector('.edit-name-input');
    const editButton = userItem.querySelector('.edit-name-button');
    const saveButton = userItem.querySelector('.save-name-button');
    const cancelButton = userItem.querySelector('.cancel-edit-button');
    const settingsButton = userItem.querySelector('.settings-button');
    const profileImage = userItem.querySelector('.user-profile-image');

    // Reset to original state: hide input, save and cancel buttons, show name span, edit button and settings button
    nameSpan.style.display = 'inline-block';
    nameInput.style.display = 'none';
    saveButton.style.display = 'none';
    cancelButton.style.display = 'none';
    editButton.style.display = 'inline-block';
    settingsButton.style.display = 'inline-block';

    // Profile image'ı normal haline döndür
    if (profileImage) {
        profileImage.style.border = '';
        profileImage.style.boxShadow = '';
        profileImage.style.transform = '';
        profileImage.style.transition = '';
    }

    // Reset input value to original name
    nameInput.value = nameSpan.textContent;
}

function cancelSettings(userId) {     //Ayarlar iptal fonksiyonu
    // Check if user is authenticated and has admin rights
    if (!LocalStorageManager.isAdmin()) {
        logUnauthorizedAccess('Ayarlar iptal');
        return;
    }

    const userContainer = document.querySelector(`#userList [data-user-id="${userId}"]`);
    if (!userContainer) {
        console.error('User container not found for userId:', userId);
        return;
    }
    const userItem = userContainer.querySelector('li');
    if (!userItem) {
        console.error('5-User item not found in container for userId:', userId);
        return;
    }
    const deleteButton = userItem.querySelector('.delete-button');
    const settingsButton = userItem.querySelector('.settings-button');
    const cancelButton = userItem.querySelector('.cancel-settings-button');
    const editButton = userItem.querySelector('.edit-name-button');

    // Reset to original state: hide delete and cancel buttons, show settings button and edit button
    deleteButton.style.display = 'none';
    cancelButton.style.display = 'none';
    settingsButton.style.display = 'inline-block';
    editButton.style.display = 'inline-block';
}

// Admin sayısını kontrol eden yardımcı fonksiyon
async function getAdminCount() {
    try {
        const response = await fetch(`/api/users/${window.groupid}`);
        if (!response.ok) return 0;
        
        const data = await response.json();
        return data.users.filter(user => user.authority === 'admin').length;
    } catch (error) {
        console.error('Admin sayısı alınırken hata:', error);
        return 0;
    }
}

// Kullanıcı yetkisini değiştirme fonksiyonu
async function changeUserAuthority(userId, newAuthority) {
    // Check if user is authenticated and has admin rights
    if (!LocalStorageManager.isAdmin()) {
        logUnauthorizedAccess('Kullanıcı yetkisi değiştirme denemesi');
        return;
    }

    // Admin sayısını kontrol et (önce admin sayısını kontrol et)
    const currentAdminCount = await getAdminCount();
    const currentUserInfo = LocalStorageManager.getCurrentUserInfo();
    
    // Eğer son admin'i üye yapmaya çalışıyorsa engelle
    if (currentUserInfo && currentUserInfo.userId === userId && 
        currentUserInfo.userAuthority === 'admin' && newAuthority === 'member' && 
        currentAdminCount <= 1) {
        showErrorMessage('En az bir yönetici hesabı bulunmalıdır!');
        // Combobox'ı eski değerine geri döndür
        const authoritySelect = document.querySelector(`#userList [data-user-id="${userId}"] .authority-select`);
        if (authoritySelect) {
            authoritySelect.value = 'admin';
        }
        return;
    }

    // Kendi yetkisini değiştirme kontrolü (admin sayısı kontrolünden sonra)
    if (currentUserInfo && currentUserInfo.userId === userId) {
        // Kendi yetkisini değiştirmek istiyor
        const currentAuthority = currentUserInfo.userAuthority;
        const newAuthorityText = newAuthority === 'admin' ? 'Yönetici' : 'Üye';
        const currentAuthorityText = currentAuthority === 'admin' ? 'Yönetici' : 'Üye';
        
        if (currentAuthority === newAuthority) {
            // Aynı yetkiye değiştirmeye çalışıyor, combobox'ı eski değerine döndür
            const authoritySelect = document.querySelector(`#userList [data-user-id="${userId}"] .authority-select`);
            if (authoritySelect) {
                authoritySelect.value = currentAuthority;
            }
            return;
        }
        
        // Kendi yetkisini değiştirmek istediğini onayla
        const confirmed = confirm(
            `Kendi yetkinizi "${currentAuthorityText}" den "${newAuthorityText}" ye değiştirmek istediğinizi onaylıyor musunuz?\n\n` +
            `Bu işlem sonrasında yetkiniz değişecek ve bazı işlemler için yeniden giriş yapmanız gerekebilir.`
        );
        
        if (!confirmed) {
            // Onaylanmadı, combobox'ı eski değerine döndür
            const authoritySelect = document.querySelector(`#userList [data-user-id="${userId}"] .authority-select`);
            if (authoritySelect) {
                authoritySelect.value = currentAuthority;
            }
            return;
        }
    }

    try {
        const response = await fetch(`/api/update-user-authority/${window.groupid}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: userId,
                authority: newAuthority
            })
        });

        if (response.ok) {
            const result = await response.json();
            showSuccessMessage(`Kullanıcı yetkisi başarıyla ${newAuthority === 'admin' ? 'Yönetici' : 'Üye'} olarak güncellendi!`);
            
            // Eğer kendi yetkisini değiştirdiyse
            if (currentUserInfo && currentUserInfo.userId === userId) {
                // Kendi yetkisi değişti, otomatik çıkış yap
                setTimeout(() => {
                    showSuccessMessage('Yetkiniz değiştirildi. Sayfa yenileniyor...');
                    // LocalStorage'dan çıkış yap
                    LocalStorageManager.logoutUser();
                    // Sayfayı yenile
                    window.location.reload();
                }, 1500);
                return;
            }
      
            if (newAuthority === 'admin' && currentUserInfo && currentUserInfo.userAuthority === 'admin') {
                // Sayfayı yenile veya admin indicator'ı güncelle
                if (typeof showAdminIndicator === 'function') {
                    showAdminIndicator();
                }
            }
        } else {
            throw new Error('Yetki güncellenemedi');
        }
    } catch (error) {
        console.error('Yetki güncelleme hatası:', error);
        showErrorMessage('Yetki güncellenirken hata oluştu!');
        
        // Hata durumunda combobox'ı eski değerine geri döndür
        const authoritySelect = document.querySelector(`li[data-user-id="${userId}"] .authority-select`);
        if (authoritySelect) {
            // Eski değeri geri yükle (API'den alınan değer)
            fetch(`/api/users/${window.groupid}`)
                .then(res => res.json())
                .then(data => {
                    const user = data.users.find(u => u._id === userId);
                    if (user) {
                        authoritySelect.value = user.authority;
                    }
                });
        }
    }
}

// Kullanıcı seçim kutusunu güncelle
function updateUserSelectDropdown(users) {
    const userSelect = document.getElementById('userSelectForInvite');
    if (!userSelect) return;
    
    // Mevcut seçimi temizle (ilk seçenek hariç)
    userSelect.innerHTML = '<option value="">Kullanıcı seçiniz...</option>';
    
    // Kullanıcıları seçim kutusuna ekle
    users.forEach(user => {
        const option = document.createElement('option');
        option.value = user._id;
        option.textContent = user.name;
        userSelect.appendChild(option);
    });
}

// Tek bir kullanıcının adını dropdown'da güncelle (performans için)
function updateUserSelectDropdownForSingleUser(userId, newName) {
    const userSelect = document.getElementById('userSelectForInvite');
    if (!userSelect) return;
    
    // İlgili kullanıcının option'ını bul ve güncelle
    const options = userSelect.querySelectorAll('option');
    options.forEach(option => {
        if (option.value === userId) {
            option.textContent = newName;
        }
    });
}

// Seçili kullanıcıyı davet et
async function inviteSelectedUser() {
    // Kullanıcı davet etme işlemini logla
    if (typeof logUnauthorizedAccess === 'function') {
        logUnauthorizedAccess('Kullanıcı davet etme');
    }
    
    const userSelect = document.getElementById('userSelectForInvite');
    const inviteBtn = document.querySelector('.invite-selected-btn');
    
    if (!userSelect || !inviteBtn) {
        showErrorMessage('Davet sistemi bulunamadı!');
        return;
    }
    
    const selectedUserId = userSelect.value;
    if (!selectedUserId) {
        showErrorMessage('Lütfen davet edilecek kullanıcıyı seçiniz!');
        return;
    }
    
    // Kullanıcı adını al
    const selectedUserName = userSelect.options[userSelect.selectedIndex].textContent;
    
    // Butonu devre dışı bırak
    inviteBtn.disabled = true;
    const originalText = inviteBtn.innerHTML;
    inviteBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    
    try {
        // Davet token'ı oluştur
        const response = await fetch(`/api/create-invite/${window.groupid}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId: selectedUserId })
        });

        if (!response.ok) {
            throw new Error('Davet token oluşturulamadı');
        }

        const data = await response.json();
        const { inviteToken, groupName } = data;

        // Grup URL'lerini oluştur
        const baseUrl = window.location.origin;
        const quickLoginUrl = `${baseUrl}/groupid=${window.groupid}?quick-login&invite=${inviteToken}`;
        const groupUrl = `${baseUrl}/groupid=${window.groupid}`;
        
        // Davet metnini oluştur
        const inviteText = `*${groupName} okuma grubu*

*• Katılma linkiniz:*
${quickLoginUrl}

*• Grup sayfası:*
${groupUrl}`;
        
        // Panoya kopyala
        await navigator.clipboard.writeText(inviteText);
        
        // Web Share API'yi dene
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `RoTaKip - ${groupName} Daveti`,
                    text: inviteText,
                });
                showSuccessMessage(`${selectedUserName} için davet linki panoya kopyalandı!`);
            } catch (shareError) {
                showSuccessMessage(`${selectedUserName} için davet linki panoya kopyalandı!`);
            }
        } else {
            showSuccessMessage(`${selectedUserName} için davet linki panoya kopyalandı!`);
        }
        
        // Seçimi temizle
        userSelect.value = '';
        
    } catch (error) {
        console.error('Davet hatası:', error);
        showErrorMessage('Davet linki oluşturulamadı. Lütfen tekrar deneyin.');
    } finally {
        // Butonu eski haline döndür
        inviteBtn.disabled = false;
        inviteBtn.innerHTML = originalText;
    }
}

// renderUserList için debounce mekanizması
function renderUserList() {
    // Sadece admin yetkisi kontrolü
    if (!LocalStorageManager.isAdmin()) {
        return;
    }

    // Debounce: Eğer zaten bir render işlemi varsa iptal et
    if (renderUserListTimeout) {
        clearTimeout(renderUserListTimeout);
    }

    // 100ms sonra render işlemini başlat
    renderUserListTimeout = setTimeout(() => {
        performRenderUserList();
        // Katılma isteklerini de yükle
        loadJoinRequests();
    }, 100);
}

function performRenderUserList() {
    const userList = document.getElementById('userList');
    if (!userList) {
        console.error('userList element bulunamadı');
        return;
    }
    
    const prevScrollTop = userList.scrollTop; // scroll pozisyonunu koru
    
    fetch(`/api/users/${window.groupid}`)
        .then(res => res.json())
        .then(data => {
            const users = data.users;
            
            // Kullanıcı listesini tamamen temizle ve yeniden oluştur
            userList.innerHTML = '';
            
            // Tüm kullanıcıları yeniden oluştur
            users.forEach((user, index) => {
                const userProfileImage = user.profileImage || '/images/default.png';
                const liHTML = `<div class="kullanıcı-item"><img src="${userProfileImage}" alt="${user.name}" class="user-profile-image user-profile-image-loading" onclick="changeUserImage('${user._id}')" onload="this.classList.remove('user-profile-image-loading')" onerror="this.classList.remove('user-profile-image-loading'); this.src='/images/default.png'"/><span class="profil-image-user-name">${user.name}</span><input type="text" class="edit-name-input" value="${user.name}" style="display:none;"><button class="edit-name-button" onclick="editUserName('${user._id}')" alt="Düzenle" title="İsmi Düzenle"><i class="fa-solid fa-pen"></i></button><button class="save-name-button" onclick="saveUserName('${user._id}')" alt="Onayla" title="İsmi Onayla" style="display:none; justify-content:center;"><i class="fa-solid fa-check"></i></button><button class="cancel-edit-button" onclick="cancelEditUserName('${user._id}')" alt="İptal" title="Düzenlemeyi İptal Et" style="display:none;"><i class="fa-solid fa-times"></i></button></div><div class="user-actions"><button class="settings-button" onclick="toggleDeleteButton('${user._id}')"><i class="fa-solid fa-user-minus"></i></button><button class="delete-button" style="display:none;" onclick="deleteUser('${user._id}')"><i class="fa-solid fa-trash-can"></i></button><button class="cancel-settings-button" onclick="cancelSettings('${user._id}')" alt="İptal" title="Ayarları İptal Et" style="display:none;"><i class="fa-solid fa-times"></i></button></div>`;
                
                // Kullanıcı container'ı oluştur
                const userContainer = document.createElement('div');
                userContainer.className = 'user-container';
                userContainer.setAttribute('data-user-id', user._id);
                
                // Li elementini oluştur ve container'a ekle
                const li = document.createElement('li');
                li.setAttribute('data-user-id', user._id); // data-user-id attribute'u ekle
                
                // Giriş yapılan kullanıcı için özel class ekle
                const currentUserInfo = LocalStorageManager.getCurrentUserInfo();
                if (currentUserInfo && currentUserInfo.userId === user._id) {
                    li.classList.add('current-user');
                }
                
                li.innerHTML = liHTML;
                userContainer.appendChild(li);
                
                // Authority select'i oluştur ve container'a ekle
                const authoritySelect = document.createElement('select');
                authoritySelect.className = 'authority-select';
                authoritySelect.setAttribute('onchange', `changeUserAuthority('${user._id}', this.value)`);
                authoritySelect.setAttribute('title', 'Kullanıcı Yetkisi');
                authoritySelect.innerHTML = `
                    <option value="member" ${user.authority === 'member' ? 'selected' : ''}>Üye</option>
                    <option value="admin" ${user.authority === 'admin' ? 'selected' : ''}>Yönetici</option>
                `;
                userContainer.appendChild(authoritySelect);
                
                // Davet butonunu kaldır - artık ayrı bir davet sistemi kullanıyoruz
                
                userList.appendChild(userContainer);
            });
            
            userList.scrollTop = prevScrollTop; // scroll pozisyonunu geri yükle
            
            // Kullanıcı seçim kutusunu güncelle
            updateUserSelectDropdown(users);
        })
        .catch(error => {
            console.error('Kullanıcı listesi yüklenirken hata:', error);
        });
}

// Grup bilgilerini yükle
async function loadGroupSettings() {
    if (!LocalStorageManager.isUserLoggedIn()) {
        return;
    }

    try {
        const response = await fetch(`/api/group/${window.groupid}`);
        if (response.ok) {
            const data = await response.json();
            const group = data.group;
            
            // Form alanlarını doldur
            document.getElementById('groupName').value = group.groupName || '';
            document.getElementById('groupDescription').value = group.description || '';
            document.getElementById('groupVisibility').value = group.visibility || 'public';
            
            // Grup resmini ayarla
            const groupImage = document.getElementById('currentGroupImage');
            const removeBtn = document.querySelector('.group-image-remove-btn');
            
            if (group.groupImage) {
                groupImage.src = group.groupImage;
                removeBtn.style.display = 'flex';
            } else {
                groupImage.src = '/images/open-book.webp';
                removeBtn.style.display = 'none';
            }
            
            // Görünürlük ikonunu güncelle
            updateVisibilityIcon(group.visibility || 'public');
        }
    } catch (error) {
        console.error('Grup ayarları yüklenirken hata:', error);
    }
}

// Karakter sınırı kontrolü
function checkCharacterLimit(event) {
    const input = event.target;
    const currentLength = input.value.length;
    const maxLength = parseInt(input.getAttribute('maxlength'));
    
    if (currentLength >= maxLength) {
        // Fazla karakter durumunda uyarı göster
        if (input.id === 'groupName') {
            showErrorMessage('Grup adı en fazla 40 karakter olabilir!');
        } else if (input.id === 'groupDescription') {
            showErrorMessage('Grup açıklaması en fazla 200 karakter olabilir!');
        }
        
        // Fazla karakterleri kes
        input.value = input.value.substring(0, maxLength);
    }
}

// Görünürlük ikonunu güncelle
function updateVisibilityIcon(visibility) {
    const icon = document.getElementById('visibilityIcon');
    const info = document.getElementById('visibilityInfo');
    const infoSpan = info ? info.querySelector('span') : null;
    
    if (!icon) return;
    
    // Mevcut sınıfları temizle
    icon.classList.remove('public', 'private');
    if (info) info.classList.remove('public', 'private');
    
    // Yeni sınıfı ekle
    icon.classList.add(visibility);
    if (info) info.classList.add(visibility);
    
    // İkonu değiştir
    if (visibility === 'public') {
        icon.className = 'fa-solid fa-eye visibility-icon public';
        if (infoSpan) infoSpan.textContent = 'Herkes bu grubu görüntüleyebilir';
    } else {
        icon.className = 'fa-solid fa-eye-slash visibility-icon private';
        if (infoSpan) infoSpan.textContent = 'Sadece üyeler grubu görüntüleyebilir';
    }
}

// Avatar'ları önceden yükle (sayfa yüklendiğinde)
async function preloadMainAreaAvatars() {
    try {
        // Grup avatar'larını önceden yükle
        await loadAvatarOptions();
        // Kullanıcı avatar'larını önceden yükle
        await loadAddUserAvatarOptions();
    } catch (error) {
        console.error('Main area avatar ön yükleme hatası:', error);
    }
}

// Hazır görseller modal'ını aç/kapat
function toggleReadyImagesModal() {
    // Hazır görseller modal açma işlemini logla
    if (typeof logUnauthorizedAccess === 'function') {
        logUnauthorizedAccess('Hazır görseller modal açma');
    }
    
    const modal = document.getElementById('readyImagesModal');
    if (modal.classList.contains('show')) {
        modal.classList.remove('show');
        document.body.style.overflow = 'auto'; // Scroll'u geri aç
    } else {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden'; // Scroll'u kapat
        // Avatar'lar önceden yüklendiği için tekrar yüklemeye gerek yok
    }
}

// Hazır avatar seçeneklerini yükle
async function loadAvatarOptions() {
    try {
        const response = await fetch('/api/group-avatars');
        if (response.ok) {
            const avatars = await response.json();
            const avatarGrid = document.getElementById('avatarGrid');
            
            avatarGrid.innerHTML = '';
            
            if (avatars.length === 0) {
                avatarGrid.innerHTML = `
                    <div style="grid-column: 1 / -1; text-align: center; padding: 20px; color: #6c757d;">
                        <i class="fa-solid fa-images" style="font-size: 24px; margin-bottom: 10px; display: block;"></i>
                        <p>Henüz hazır görsel bulunmuyor.</p>
                        <small>groupAvatars klasörüne resim dosyaları ekleyin.</small>
                    </div>
                `;
                return;
            }
            
            avatars.forEach(avatar => {
                const avatarItem = document.createElement('div');
                avatarItem.className = 'avatar-item';
                avatarItem.dataset.avatarPath = avatar.path;
                
                avatarItem.innerHTML = `
                    <img src="${avatar.path}" alt="Avatar">
                    <div class="check-icon">
                        <i class="fa-solid fa-check"></i>
                    </div>
                `;
                
                avatarItem.addEventListener('click', () => selectAvatar(avatar.path, avatarItem));
                avatarGrid.appendChild(avatarItem);
            });
        } else {
            console.error('Avatar seçenekleri yüklenemedi');
        }
    } catch (error) {
        console.error('Avatar yükleme hatası:', error);
    }
}

// Avatar seç
function selectAvatar(avatarPath, avatarElement) {
    // Önceki seçimi kaldır
    document.querySelectorAll('.avatar-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    // Yeni seçimi işaretle
    avatarElement.classList.add('selected');
    
    // Grup resmini güncelle
    const currentGroupImage = document.getElementById('currentGroupImage');
    currentGroupImage.src = avatarPath;
    
    // Sil butonunu göster (hazır avatar seçildi, artık bir resim var)
    const removeBtn = document.querySelector('.group-image-remove-btn');
    removeBtn.style.display = 'flex';
    
    // Modal'ı kapat
    toggleReadyImagesModal();
    
    // Grup resmini güncelle (sunucuya gönder)
    updateGroupImageFromAvatar(avatarPath);
}

// Hazır avatar ile grup resmini güncelle
async function updateGroupImageFromAvatar(avatarPath) {
    try {
        const response = await fetch(`/api/update-group-image-from-avatar/${window.groupid}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ avatarPath: avatarPath })
        });
        
        if (response.ok) {
            const result = await response.json();
            
            // secretAdminLogin resmini de güncelle
            const secretAdminLoginImages = document.querySelectorAll('.secretAdminLoginImage');
            secretAdminLoginImages.forEach(img => {
                img.src = result.imageUrl;
            });
        } else {
            console.error('Grup resmi güncellenemedi');
        }
    } catch (error) {
        console.error('Avatar güncelleme hatası:', error);
    }
}

// Grup ayarlarını kaydet
async function saveGroupSettings() {
    if (!LocalStorageManager.isAdmin()) {
        showErrorMessage('Bu işlem için admin yetkisi gereklidir!');
        return;
    }

    // Grup bilgilerini kaydetme işlemini logla
    if (typeof logUnauthorizedAccess === 'function') {
        logUnauthorizedAccess('Grup bilgilerini kaydetme');
    }

    const groupName = document.getElementById('groupName').value.trim();
    const groupDescription = document.getElementById('groupDescription').value.trim();
    const groupVisibility = document.getElementById('groupVisibility').value;

    if (!groupName) {
        showErrorMessage('Grup adı boş olamaz!');
        return;
    }

    // Grup adı karakter sınırı kontrolü
    if (groupName.length > 40) {
        showErrorMessage('Grup adı en fazla 40 karakter olabilir!');
        return;
    }

    // Grup açıklaması karakter sınırı kontrolü
    if (groupDescription.length > 200) {
        showErrorMessage('Grup açıklaması en fazla 200 karakter olabilir!');
        return;
    }

    const saveBtn = document.querySelector('.save-group-btn');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Kaydediliyor...';
    saveBtn.disabled = true;

    try {
        const response = await fetch(`/api/update-group/${window.groupid}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                groupName,
                description: groupDescription,
                visibility: groupVisibility
            })
        });

        if (response.ok) {
            showSuccessMessage('Grup ayarları başarıyla kaydedildi!');
            // Sayfa başlığını güncelle
            if (typeof updatePageTitle === 'function') {
                updatePageTitle();
            }
        } else {
            throw new Error('Grup ayarları kaydedilemedi');
        }
    } catch (error) {
        console.error('Grup ayarları kaydetme hatası:', error);
        showErrorMessage('Grup ayarları kaydedilirken hata oluştu!');
    } finally {
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
    }
}

// Grup resmini değiştir
async function changeGroupImage() {
    if (!LocalStorageManager.isAdmin()) {
        showErrorMessage('Bu işlem için admin yetkisi gereklidir!');
        return;
    }

    const fileInput = document.getElementById('groupImage');
    const file = fileInput.files[0];
    
    if (!file) return;

    const formData = new FormData();
    formData.append('groupImage', file);

    const changeBtn = document.querySelector('.change-image-btn');
    const originalText = changeBtn.innerHTML;
    changeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    changeBtn.disabled = true;

    try {
        const response = await fetch(`/api/update-group-image/${window.groupid}`, {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            const groupImage = document.getElementById('currentGroupImage');
            
            groupImage.src = data.imageUrl;
            document.querySelector('.group-image-remove-btn').style.display = 'flex';
            
            // secretAdminLogin'deki grup resmini de güncelle
            const secretAdminImage = document.querySelector('.secretAdminLogin img');
            const secretAdminLoginImage = document.querySelector('.secretAdminLoginImage');
            if (secretAdminImage) {
                secretAdminImage.src = data.imageUrl;
            }
            if (secretAdminLoginImage) {
                secretAdminLoginImage.src = data.imageUrl;
            }
            
            showSuccessMessage('Grup resmi başarıyla güncellendi!');
        } else {
            throw new Error('Grup resmi güncellenemedi');
        }
    } catch (error) {
        console.error('Grup resmi güncelleme hatası:', error);
        showErrorMessage('Grup resmi güncellenirken hata oluştu!');
    } finally {
        changeBtn.innerHTML = originalText;
        changeBtn.disabled = false;
        fileInput.value = ''; // Input'u temizle
    }
}

// Grup resmini kaldır
async function removeGroupImage() {
    if (!LocalStorageManager.isAdmin()) {
        showErrorMessage('Bu işlem için admin yetkisi gereklidir!');
        return;
    }

    const confirmed = confirm('Grup resmini kaldırmak istediğinize emin misiniz?');
    if (!confirmed) return;

    const removeBtn = document.querySelector('.group-image-remove-btn');
    const originalText = removeBtn.innerHTML;
    removeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    removeBtn.disabled = true;

    try {
        const response = await fetch(`/api/remove-group-image/${window.groupid}`, {
            method: 'POST'
        });

        if (response.ok) {
            document.getElementById('currentGroupImage').src = '/images/open-book.webp';
            document.querySelector('.group-image-remove-btn').style.display = 'none';
            
            // secretAdminLogin'deki grup resmini de güncelle
            const secretAdminImage = document.querySelector('.secretAdminLogin img');
            const secretAdminLoginImage = document.querySelector('.secretAdminLoginImage');
            if (secretAdminImage) {
                secretAdminImage.src = '/images/open-book.webp';
            }
            if (secretAdminLoginImage) {
                secretAdminLoginImage.src = '/images/open-book.webp';
            }
            
            showSuccessMessage('Grup resmi başarıyla kaldırıldı!');
        } else {
            throw new Error('Grup resmi kaldırılamadı');
        }
    } catch (error) {
        console.error('Grup resmi kaldırma hatası:', error);
        showErrorMessage('Grup resmi kaldırılırken hata oluştu!');
    } finally {
        removeBtn.innerHTML = originalText;
        removeBtn.disabled = false;
    }
}

// Grup silme butonunu göster/gizle
function toggleDeleteGroupButton() {
    const deleteBtn = document.querySelector('.delete-group-btn');
    const toggleBtn = document.querySelector('.danger-toggle-btn');
    const dangerText = toggleBtn.querySelector('.danger-text');
    
    if (deleteBtn.style.display === 'none' || deleteBtn.style.display === '') {
        deleteBtn.style.display = 'flex';
        toggleBtn.classList.add('active');
        dangerText.textContent = 'İptal Et';
        toggleBtn.style.backgroundColor = '#27ae60'; // yeşil yap
    } else {
        deleteBtn.style.display = 'none';
        toggleBtn.classList.remove('active');
        dangerText.textContent = 'Grubu Sil';
        toggleBtn.style.backgroundColor = '#95a5a6'; // Gri yap
    }
}

// Grubu paylaş
async function shareGroup() {
    try {
        // Grup adını al
        const groupName = document.getElementById('groupName').value || 'Grup';
        
        // URL formatını oluştur
        const groupUrl = `${window.location.origin}/groupid=${window.groupid}`;
        
        // Paylaşım metnini oluştur
        const shareText = `RoTaKip ${groupName}\n${groupUrl}`;
        
        // Her durumda panoya kopyala
        await navigator.clipboard.writeText(shareText);
        
        // Web Share API'yi de dene (eğer varsa)
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `RoTaKip ${groupName}`,
                    text: shareText, // Tam metni paylaş
                });
                showSuccessMessage('Grup davet linki panoya kopyalandı!');
            } catch (shareError) {
                // Web Share API iptal edilirse sadece panoya kopyalama mesajı göster
                showSuccessMessage('Grup davet linki panoya kopyalandı!');
            }
        } else {
            // Web Share API yoksa sadece panoya kopyalama mesajı göster
            showSuccessMessage('Grup davet linki panoya kopyalandı!');
        }
        
    } catch (error) {
        console.error('Paylaşım hatası:', error);
        showErrorMessage('Link kopyalanamadı. Lütfen manuel olarak kopyalayın.');
    }
}

// Grubu sil
async function deleteGroup() {
    // Admin kontrolü
    if (!LocalStorageManager.isAdmin()) {
        showErrorMessage('Bu işlem için admin yetkisi gereklidir!');
        return;
    }

    if (!window.groupid) {
        showErrorMessage('Grup ID bulunamadı!');
        return;
    }

    const groupName = document.getElementById('groupName').value || 'Bu grup';
    const confirmed = confirm(`"${groupName}" grubunu silmek istediğinize emin misiniz?\n\nBu işlem geri alınamaz ve tüm grup verileri (kullanıcılar, okuma kayıtları, vb.) kalıcı olarak silinecektir.`);
    
    if (!confirmed) {
        return;
    }

    const deleteBtn = document.querySelector('.delete-group-btn');
    if (!deleteBtn) {
        showErrorMessage('Sil butonu bulunamadı!');
        return;
    }

    const originalText = deleteBtn.innerHTML;
    deleteBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Siliniyor...';
    deleteBtn.disabled = true;

    try {
        const response = await fetch(`/api/delete-group/${window.groupid}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            showSuccessMessage('Grup başarıyla silindi!');
            
            // Yeni sistem ile çıkış yap
            LocalStorageManager.logoutUser();
            
            setTimeout(() => {
                window.location.href = '/';
            }, 1500);
        } else {
            let errorData;
            try {
                errorData = await response.json();
            } catch (parseError) {
                errorData = { message: `HTTP ${response.status}: ${response.statusText}` };
            }
            throw new Error(errorData.message || 'Grup silinemedi');
        }
    } catch (error) {
        console.error('Grup silme hatası:', error);
        showErrorMessage('Grup silinirken hata oluştu: ' + error.message);
    } finally {
        deleteBtn.innerHTML = originalText;
        deleteBtn.disabled = false;
    }
}

// Event listener'ları ekle
document.addEventListener('DOMContentLoaded', function() {
    // Avatar'ları önceden yükle
    preloadMainAreaAvatars();
    
    // Grup ayarları butonları
    const saveGroupBtn = document.querySelector('.save-group-btn');
    const changeImageBtn = document.querySelector('.change-image-btn');
    const removeImageBtn = document.querySelector('.group-image-remove-btn');
    const toggleDeleteBtn = document.querySelector('.danger-toggle-btn');
    const deleteGroupBtn = document.querySelector('.delete-group-btn');
    const groupImageInput = document.getElementById('groupImage');

    if (saveGroupBtn) {
        saveGroupBtn.addEventListener('click', saveGroupSettings);
    }

    if (changeImageBtn) {
        changeImageBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            groupImageInput.click();
        });
    }

    if (groupImageInput) {
        groupImageInput.addEventListener('change', changeGroupImage);
    }

    if (removeImageBtn) {
        removeImageBtn.addEventListener('click', removeGroupImage);
    }

    if (toggleDeleteBtn) {
        toggleDeleteBtn.addEventListener('click', toggleDeleteGroupButton);
    }

    const shareGroupBtn = document.querySelector('.share-group-btn');
    if (shareGroupBtn) {
        shareGroupBtn.addEventListener('click', shareGroup);
    }

    if (deleteGroupBtn) {
        deleteGroupBtn.addEventListener('click', function(e) {
            e.preventDefault();
            deleteGroup();
        });
    }

    // Görünürlük değiştiğinde ikonu güncelle
    const groupVisibilitySelect = document.getElementById('groupVisibility');
    if (groupVisibilitySelect) {
        groupVisibilitySelect.addEventListener('change', function() {
            updateVisibilityIcon(this.value);
        });
    }

    // Admin girişi yapıldığında grup ayarlarını yükle
    if (LocalStorageManager.isUserLoggedIn()) {
        loadGroupSettings();
    }
    
    // Karakter sınırı kontrolü event listener'ları
    const groupNameInput = document.getElementById('groupName');
    const groupDescriptionInput = document.getElementById('groupDescription');
    
    if (groupNameInput) {
        groupNameInput.addEventListener('input', checkCharacterLimit);
    }
    
    if (groupDescriptionInput) {
        groupDescriptionInput.addEventListener('input', checkCharacterLimit);
    }
    
    // Modal dışına tıklandığında kapat
    const readyImagesModal = document.getElementById('readyImagesModal');
    if (readyImagesModal) {
        readyImagesModal.addEventListener('click', function(e) {
            if (e.target === readyImagesModal) {
                toggleReadyImagesModal();
            }
        });
    }
    
    // ESC tuşu ile modal'ı kapat
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const modal = document.getElementById('readyImagesModal');
            if (modal && modal.classList.contains('show')) {
                toggleReadyImagesModal();
            }
        }
    });

});

// Katılma isteklerini yükle
async function loadJoinRequests() {
    try {
        const groupId = localStorage.getItem('groupid');
        if (!groupId) return;

        const response = await fetch(`/api/join-requests/${groupId}`);
        if (!response.ok) {
            throw new Error('Katılma istekleri yüklenemedi');
        }

        const data = await response.json();
        displayJoinRequests(data.requests);

    } catch (error) {
        console.error('Katılma istekleri yükleme hatası:', error);
    }
}

// Katılma isteklerini görüntüle
function displayJoinRequests(requests) {
    const joinRequestsList = document.getElementById('joinRequestsList');
    
    if (!requests || requests.length === 0) {
        joinRequestsList.innerHTML = '<div class="no-join-requests"><i class="fa-solid fa-exclamation-circle"></i> Gruba katılma isteği bulunmamakta.</div>';
        return;
    }

    joinRequestsList.innerHTML = requests.map(request => {
        const requestDate = new Date(request.createdAt).toLocaleDateString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <div class="join-request-item" data-request-id="${request._id}">
                <img src="${request.profileImage || 'images/default.png'}" 
                     alt="${request.userName}" 
                     class="join-request-avatar"
                     onerror="this.src='images/default.png'">
                <div class="join-request-info">
                    <div class="join-request-name">${request.name}</div>
                    <div class="join-request-date">${requestDate}</div>
                </div>
                <div class="join-request-actions">
                    <button class="join-request-btn reject" onclick="rejectJoinRequest('${request._id}')">
                            <i class="fa-solid fa-times"></i>
                            Reddet
                        </button>
                    <button class="join-request-btn accept" onclick="acceptJoinRequest('${request._id}')">
                        <i class="fa-solid fa-check"></i>
                        Kabul Et
                    </button>
                    
                </div>
            </div>
        `;
    }).join('');
}

// Katılma isteğini kabul et
async function acceptJoinRequest(requestId) {
    // Katılma isteği kabul etme işlemini logla
    if (typeof logUnauthorizedAccess === 'function') {
        logUnauthorizedAccess('Katılma isteği kabul etme');
    }
    
    try {
        const response = await fetch(`/api/accept-join-request/${requestId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Katılma isteği kabul edilemedi');
        }

        const data = await response.json();
        
        // Başarı mesajı göster
        showSuccessMessage(data.message);
        
        // İsteği listeden kaldır
        const requestItem = document.querySelector(`[data-request-id="${requestId}"]`);
        if (requestItem) {
            requestItem.remove();
        }
        
        // Tüm alanları yenile
        renderUserList();
        loadTrackerTable();
        loadUserCards();
        loadReadingStats();
        renderLongestSeries();
        if (window.updateMonthlyCalendarUsers) window.updateMonthlyCalendarUsers();

        // Eğer hiç istek kalmadıysa mesaj göster
        const remainingRequests = document.querySelectorAll('.join-request-item');
        if (remainingRequests.length === 0) {
            const joinRequestsList = document.getElementById('joinRequestsList');
            joinRequestsList.innerHTML = '<div class="no-join-requests"><i class="fa-solid fa-exclamation-circle"></i> Gruba katılma isteği bulunmamakta.</div>';
        }

    } catch (error) {
        console.error('Katılma isteği kabul etme hatası:', error);
        showNotification('Katılma isteği kabul edilirken hata oluştu', 'error');
    }
}

// Katılma isteğini reddet
async function rejectJoinRequest(requestId) {
    if (!confirm('Bu katılma isteğini reddetmek istediğinizden emin misiniz?')) {
        return;
    }

    // Katılma isteği reddetme işlemini logla
    if (typeof logUnauthorizedAccess === 'function') {
        logUnauthorizedAccess('Katılma isteği reddetme');
    }

    try {
        const response = await fetch(`/api/reject-join-request/${requestId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Katılma isteği reddedilemedi');
        }

        const data = await response.json();
        
        // Başarı mesajı göster
        showSuccessMessage(data.message);
        
        // İsteği listeden kaldır
        const requestItem = document.querySelector(`[data-request-id="${requestId}"]`);
        if (requestItem) {
            requestItem.remove();
        }

        // Eğer hiç istek kalmadıysa mesaj göster
        const remainingRequests = document.querySelectorAll('.join-request-item');
        if (remainingRequests.length === 0) {
            const joinRequestsList = document.getElementById('joinRequestsList');
            joinRequestsList.innerHTML = '<div class="no-join-requests"><i class="fa-solid fa-exclamation-circle"></i> Gruba katılma isteği bulunmamakta.</div>';
        }

    } catch (error) {
        console.error('Katılma isteği reddetme hatası:', error);
        showErrorMessage('Katılma isteği reddedilirken hata oluştu');
    }
}

// Bildirim gösterme fonksiyonu (kuyruk sistemi ile)
function showNotification(message, type = 'info') {
    // Mesajı kuyruğa ekle
    messageQueue.push({ message, type });
    
    // Eğer şu anda mesaj gösterilmiyorsa, kuyruktan mesaj göster
    if (!isShowingMessage) {
        processMessageQueue();
    }
}

// Add User Avatar Modal Functions
function toggleAddUserAvatarModal() {
    const modal = document.getElementById('addUserAvatarModal');
    if (modal) {
        modal.classList.toggle('show');
        // Avatar'lar önceden yüklendiği için tekrar yüklemeye gerek yok
    }
}

async function loadAddUserAvatarOptions() {
    const avatarGrid = document.getElementById('addUserAvatarGrid');
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
                const previewImg = document.getElementById('addUserInputProfileImage');
                if (previewImg) {
                    const avatarPath = `/userAvatars/${avatar}`;
                    previewImg.src = avatarPath;
                    
                    // Avatar yolunu kaydet
                    selectedAddUserAvatarPath = avatarPath;
                    
                    // Dosya yükleme işlemini sıfırla (tek seçim mantığı)
                    if (profileImageInput) {
                        profileImageInput.value = '';
                    }
                    if (uploadBtn) {
                        uploadBtn.innerHTML = '<i class="fa-solid fa-upload"></i>Yükle';
                    }
                    if (imagePreviewContainer) {
                        imagePreviewContainer.style.display = 'none';
                    }
                    
                }
                
                // Modal'ı kapat
                toggleAddUserAvatarModal();
            });
            
            avatarGrid.appendChild(avatarItem);
        });
    } catch (error) {
        console.error('Avatar yükleme hatası:', error);
        avatarGrid.innerHTML = '<p>Avatar yüklenirken hata oluştu.</p>';
    }
}