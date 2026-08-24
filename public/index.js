/* ==================== LocalStorage Manager ==================== */
class LocalStorageManager {
    static loginUser(groupId, userId, authority, username, groupName, name) {
        // Mevcut grupları al
        const groups = this.getGroups();
        
        // Yeni grubu ekle
        groups[groupId] = userId;
        
        // LocalStorage'a kaydet
        localStorage.setItem('groups', JSON.stringify(groups));
        
        // Kullanıcı bilgilerini kaydet
        localStorage.setItem('groupid', groupId);
        localStorage.setItem('userid', userId);
        localStorage.setItem('userAuthority', authority);
        localStorage.setItem('userName', username);
        localStorage.setItem('groupName', groupName);
        localStorage.setItem('name', name || '');
    }
    
    static getGroups() {
        const groups = localStorage.getItem('groups');
        return groups ? JSON.parse(groups) : {};
    }
    
    static removeUserFromGroup(groupId) {
        const groups = this.getGroups();
        delete groups[groupId];
        localStorage.setItem('groups', JSON.stringify(groups));
    }
    
    static isAdmin() {
        return localStorage.getItem('userAuthority') === 'admin';
    }
    
    static clearCookies() {
        const keysToRemove = ['groupid', 'userid', 'userAuthority', 'userName', 'groupName', 'name'];
        keysToRemove.forEach(key => localStorage.removeItem(key));
    }

    // Katılma istekleri yönetimi
    static addJoinRequest(groupId, requestId) {
        const joinRequests = this.getJoinRequests();
        joinRequests[groupId] = requestId;
        localStorage.setItem('jointogroups', JSON.stringify(joinRequests));
    }

    static getJoinRequests() {
        const joinRequests = localStorage.getItem('jointogroups');
        return joinRequests ? JSON.parse(joinRequests) : {};
    }

    static removeJoinRequest(groupId) {
        const joinRequests = this.getJoinRequests();
        delete joinRequests[groupId];
        localStorage.setItem('jointogroups', JSON.stringify(joinRequests));
    }

    static hasJoinRequest(groupId) {
        const joinRequests = this.getJoinRequests();
        return Object.hasOwn(joinRequests, groupId);
    }

    static getJoinRequestId(groupId) {
        const joinRequests = this.getJoinRequests();
        return joinRequests[groupId] || null;
    }
}

/* ==================== Constants ==================== */
const CONFIG = {
    GROUPS_PER_PAGE: 12,
    SEARCH_DEBOUNCE_MS: 300,
    TOAST_DURATION_MS: 4000,
    TOAST_HIDE_DELAY_MS: 300,
    NEXT_TOAST_DELAY_MS: 2000,
    SCROLL_THRESHOLD_PX: 200,
    MIN_LOAD_INTERVAL_MS: 600
};

/* ==================== Groups Page Manager ==================== */
class GroupsPage {
    constructor() {
        // Data
        this.groups = [];
        this.filteredGroups = [];
        this.memberCounts = new Map();
        this.joinRequestStatuses = new Map();
        
        // Pagination
        this.currentPage = 0;
        this.groupsPerPage = CONFIG.GROUPS_PER_PAGE;
        
        // State
        this.isLoading = false;
        this.searchQuery = '';
        /** Sunucudaki herkese açık grup toplamı (yalnızca arama boşken /api/groups yanıtından) */
        this.totalPublicGroups = null;
        this.selectedAvatarPath = null;
        this.selectedAdminAvatarPath = null;
        this.currentJoinGroup = null;
        this.avatarsLoaded = false; // Avatar'ların yüklenip yüklenmediğini takip et
        this.adminAvatarsLoaded = false; // Admin avatar'larının yüklenip yüklenmediğini takip et
        this.createGroupStage = 1; // 1: Group Info, 2: Admin Info
        this.isCreatingGroup = false; // Grup oluşturma isteği devam ediyor mu
        
        // Message Queue
        this.messageQueue = [];
        this.isShowingMessage = false;
        
        // Debounce Timer
        this.searchTimeout = null;

        this.init();
    }

    init() {
        this.bindEvents();
        // Önce katılma isteklerini kontrol et, sonra grupları yükle
        this.checkJoinRequestStatuses().then(() => {
            this.loadGroups(true); // reset=true ile başlat
        });
        this.setupInfiniteScroll();
        // Avatar'lar modal açıldığında lazy-load edilecek
    }

    bindEvents() {
        // Search functionality
        const searchInput = document.getElementById('searchInput');
        const clearSearch = document.getElementById('clearSearch');

        searchInput.addEventListener('input', this.handleSearch.bind(this));
        clearSearch.addEventListener('click', this.clearSearch.bind(this));

        // Create group modal
        const openCreateGroupBtn = document.getElementById('openCreateGroupBtn');
        const closeModal = document.getElementById('closeModal');
        const cancelCreate = document.getElementById('cancelCreate');
        const createGroupForm = document.getElementById('createGroupForm');
        const modal = document.getElementById('createGroupModal');
        const nextToAdminInfo = document.getElementById('nextToAdminInfo');
        const backToGroupInfo = document.getElementById('backToGroupInfo');

        openCreateGroupBtn.addEventListener('click', () => this.openCreateModal());
        closeModal.addEventListener('click', () => this.closeCreateModal());
        cancelCreate.addEventListener('click', () => this.closeCreateModal());
        createGroupForm.addEventListener('submit', this.handleCreateGroup.bind(this));
        nextToAdminInfo.addEventListener('click', () => this.nextToAdminInfo());
        backToGroupInfo.addEventListener('click', () => this.backToGroupInfo());

        // Close modal when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeCreateModal();
            }
        });

        // Hazır görseller modal'ı için dışına tıklama
        const readyImagesModal = document.getElementById('readyImagesModal');
        if (readyImagesModal) {
            readyImagesModal.addEventListener('click', (e) => {
                if (e.target === readyImagesModal) {
                    this.closeReadyImagesModal();
                }
            });
        }

        // Join avatar modal'ı için dışına tıklama
        const joinAvatarModal = document.getElementById('joinAvatarModal');
        if (joinAvatarModal) {
            joinAvatarModal.addEventListener('click', (e) => {
                if (e.target === joinAvatarModal) {
                    if (avatarModalManager) {
                        avatarModalManager.toggleJoinAvatarModal();
                    }
                }
            });
        }

        // ESC key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeCreateModal();
                this.closeReadyImagesModal();
                this.closeJoinModal();
                if (avatarModalManager) {
                    const joinModal = document.getElementById('joinAvatarModal');
                    const adminModal = document.getElementById('adminAvatarModal');
                    if (joinModal && joinModal.classList.contains('show')) {
                        avatarModalManager.toggleJoinAvatarModal();
                    }
                    if (adminModal && adminModal.classList.contains('show')) {
                        this.toggleAdminAvatarModal();
                    }
                }
            }
        });

        // Password toggle functionality
        const passwordToggle = document.getElementById('passwordToggle');
        if (passwordToggle) {
            passwordToggle.addEventListener('click', this.togglePasswordVisibility.bind(this));
        }

        // Visibility icon change functionality
        const visibilitySelect = document.getElementById('groupVisibilityInput');
        if (visibilitySelect) {
            visibilitySelect.addEventListener('change', this.updateVisibilityIcon.bind(this));
        }

        const groupImageInput = document.getElementById('groupImageInput');
        groupImageInput.addEventListener('change', (e) => {
            const fileInput = e.target;
            const fileInputText = document.querySelector('#groupInfoStage .file-input-text');
            if (fileInput.files.length > 0) {
                fileInputText.textContent = fileInput.files[0].name;
            } else {
                fileInputText.textContent = 'Bir resim seçin...';
            }
        });

        const adminProfileImageInput = document.getElementById('adminProfileImageInput');
        adminProfileImageInput.addEventListener('change', (e) => {
            const fileInput = e.target;
            const fileInputText = document.querySelector('#adminInfoStage .file-input-text');
            if (fileInput.files.length > 0) {
                fileInputText.textContent = fileInput.files[0].name;
            } else {
                fileInputText.textContent = 'Bir resim seçin...';
            }
        });

        // Join group modal events
        const closeJoinModal = document.getElementById('closeJoinModal');
        const cancelJoin = document.getElementById('cancelJoin');
        const joinGroupForm = document.getElementById('joinGroupForm');
        const joinModal = document.getElementById('joinGroupModal');
        const cancelJoinRequest = document.getElementById('cancelJoinRequest');
        const goToHomePage = document.getElementById('goToHomePage');

        closeJoinModal.addEventListener('click', () => this.closeJoinModal());
        cancelJoin.addEventListener('click', () => this.closeJoinModal());
        joinGroupForm.addEventListener('submit', this.handleJoinGroupRequest.bind(this));
        cancelJoinRequest.addEventListener('click', this.handleCancelJoinRequest.bind(this));
        goToHomePage.addEventListener('click', () => this.goToHomePage());

        // Close join modal when clicking outside
        joinModal.addEventListener('click', (e) => {
            if (e.target === joinModal) {
                this.closeJoinModal();
            }
        });

        // Join modal password toggle
        const joinPasswordToggle = document.getElementById('joinPasswordToggle');
        if (joinPasswordToggle) {
            joinPasswordToggle.addEventListener('click', this.toggleJoinPasswordVisibility.bind(this));
        }

        // Join modal file input
        const joinProfileImageInput = document.getElementById('joinProfileImageInput');
        joinProfileImageInput.addEventListener('change', (e) => {
            const fileInput = e.target;
            const fileInputText = document.querySelector('#joinProfileImageInput').parentElement.querySelector('.file-input-text');
            if (fileInput.files.length > 0) {
                fileInputText.textContent = fileInput.files[0].name;
            } else {
                fileInputText.textContent = 'Bir resim seçin...';
            }
        });
    }

    async loadGroups(reset = false) {
        if (this.isLoading) return;

        this.isLoading = true;
        this.showLoading(true);

        try {
            // İlk yükleme ise önce kullanıcının gruplarını yükle
            if (reset && this.currentPage === 0) {
                await this.loadUserGroups();
                // Kullanıcının grupları yüklendikten sonra normal grupları yükle
                const skip = 0;
                const response = await fetch(`/api/groups?skip=${skip}&limit=${this.groupsPerPage}&search=${this.searchQuery}`);
                
                if (response.ok) {
                    const data = await response.json();
                    if (!this.searchQuery && typeof data.total === 'number') {
                        this.totalPublicGroups = data.total;
                    }
                    // Sadece kullanıcının gruplarında olmayan grupları ekle
                    const userGroupIds = new Set();
                    const userGroups = localStorage.getItem('groups');
                    if (userGroups) {
                        const groupsData = JSON.parse(userGroups);
                        Object.keys(groupsData).forEach(id => userGroupIds.add(id));
                    }
                    
                    const newGroups = data.groups.filter(group => !userGroupIds.has(group.groupId));
                    this.groups = [...this.groups, ...newGroups];
                    this.filteredGroups = this.groups;
                    await this.loadMemberCounts(newGroups);
                    this.renderGroups();
                    this.currentPage++;
                }
            } else {
                // Normal infinite scroll
                const skip = this.currentPage * this.groupsPerPage;
                const response = await fetch(`/api/groups?skip=${skip}&limit=${this.groupsPerPage}&search=${this.searchQuery}`);

                if (!response.ok) {
                    throw new Error('Failed to fetch groups');
                }

                const data = await response.json();

                if (!this.searchQuery && typeof data.total === 'number') {
                    this.totalPublicGroups = data.total;
                }

                // Sadece yeni grupları ekle (duplicate kontrolü)
                const existingGroupIds = new Set(this.groups.map(g => g.groupId));
                const newGroups = data.groups.filter(group => !existingGroupIds.has(group.groupId));
                this.groups = [...this.groups, ...newGroups];

                this.filteredGroups = this.groups;
                await this.loadMemberCounts(newGroups);
                this.renderGroups();
                this.currentPage++;

                // Eğer yüklenen grup sayısı limit'ten azsa, daha fazla grup yok demektir
                if (data.groups.length < this.groupsPerPage) {
                    return { groups: data.groups, hasMore: false };
                }

                return { groups: data.groups, hasMore: true };
            }

        } catch (error) {
            console.error('Error loading groups:', error);
            this.showError('Failed to load groups. Please try again.');
            return { groups: [], hasMore: false };
        } finally {
            this.isLoading = false;
            this.showLoading(false);
            this.renderGroups();
        }
    }

    async loadUserGroups() {
        try {
            // LocalStorage'dan kullanıcının gruplarını al
            const userGroups = localStorage.getItem('groups');
            if (!userGroups) return;

            const groupsData = JSON.parse(userGroups);
            const groupIds = Object.keys(groupsData);

            if (groupIds.length === 0) return;

            // Silinmiş grupları tutmak için array
            const deletedGroupIds = [];

            // Her grup için detayları al
            const groupPromises = groupIds.map(async (groupId) => {
                try {
                    const response = await fetch(`/api/group/${groupId}`);
                    if (response.ok) {
                        const data = await response.json();
                        return { groupId, group: data.group, exists: true };
                    } else if (response.status === 404) {
                        // Grup bulunamadı - silinmiş
                        console.log(`⚠️ Grup bulunamadı, LocalStorage'dan temizlenecek: ${groupId}`);
                        deletedGroupIds.push(groupId);
                        return { groupId, group: null, exists: false };
                    }
                } catch (error) {
                    console.error(`Error loading group ${groupId}:`, error);
                }
                return { groupId, group: null, exists: false };
            });

            const results = await Promise.all(groupPromises);
            const userGroupsData = results
                .filter(result => result.exists && result.group !== null)
                .map(result => result.group);

            // Silinmiş grupları LocalStorage'dan temizle
            if (deletedGroupIds.length > 0) {
                deletedGroupIds.forEach(groupId => {
                    LocalStorageManager.removeUserFromGroup(groupId);
                    console.log(`✅ Silinmiş grup LocalStorage'dan temizlendi: ${groupId}`);
                });
            }

            if (userGroupsData.length > 0) {
                // Kullanıcının gruplarını en başa ekle
                this.groups = [...userGroupsData, ...this.groups];
                this.filteredGroups = this.groups;
                await this.loadMemberCounts(userGroupsData);
                await this.loadUserAuthorities(userGroupsData, groupsData);
                this.renderGroups();
            }
        } catch (error) {
            console.error('Error loading user groups:', error);
        }
    }

    async loadMemberCounts(groups) {
        try {
            const promises = groups.map(async (group) => {
                if (!this.memberCounts.has(group.groupId)) {
                    const response = await fetch(`/api/groups/${group.groupId}/member-count`);
                    if (response.ok) {
                        const data = await response.json();
                        this.memberCounts.set(group.groupId, data.count);
                    } else {
                        this.memberCounts.set(group.groupId, 0);
                    }
                }
            });

            await Promise.all(promises);
        } catch (error) {
            console.error('Error loading member counts:', error);
        }
    }

    async loadUserAuthorities(groups, groupsData) {
        try {
            const promises = groups.map(async (group) => {
                const userId = groupsData[group.groupId];
                if (userId) {
                    try {
                        const response = await fetch(`/api/users/${group.groupId}`);
                        if (response.ok) {
                            const data = await response.json();
                            const user = data.users.find(u => u._id === userId);
                            if (user) {
                                // Kullanıcının yetkisini grup objesine ekle
                                group.userAuthority = user.authority;
                            }
                        }
                    } catch (error) {
                        console.error(`Error loading user authority for group ${group.groupId}:`, error);
                    }
                }
            });

            await Promise.all(promises);
        } catch (error) {
            console.error('Error loading user authorities:', error);
        }
    }

    // Grupları öncelik sırasına göre sırala
    sortGroupsByPriority(groups) {
        const userGroups = LocalStorageManager.getGroups();
        const joinRequests = LocalStorageManager.getJoinRequests();
        
        return groups.sort((a, b) => {
            const aInUserGroups = Object.hasOwn(userGroups, a.groupId);
            const bInUserGroups = Object.hasOwn(userGroups, b.groupId);
            const aInJoinRequests = Object.hasOwn(joinRequests, a.groupId);
            const bInJoinRequests = Object.hasOwn(joinRequests, b.groupId);
            
            // 1. Öncelik: Yetki sahibi olduğumuz gruplar
            if (aInUserGroups && !bInUserGroups) return -1;
            if (!aInUserGroups && bInUserGroups) return 1;
            
            // 2. Öncelik: Katılma isteği gönderdiğimiz gruplar
            if (aInJoinRequests && !bInJoinRequests && !aInUserGroups && !bInUserGroups) return -1;
            if (!aInJoinRequests && bInJoinRequests && !aInUserGroups && !bInUserGroups) return 1;
            
            // 3. Rastgele sıralama (aynı öncelik seviyesindeki gruplar için)
            return 0;
        });
    }

    renderGroups() {
        const groupsGrid = document.getElementById('groupsGrid');
        const noResults = document.getElementById('noResults');
        const noPublicGroups = document.getElementById('noPublicGroups');
        
        // Grupları sırala: 1) Yetki sahibi olduğumuz gruplar, 2) Katılma isteği gönderdiğimiz gruplar, 3) Rastgele gruplar
        const sortedGroups = this.sortGroupsByPriority(this.filteredGroups);
        
        const existingCardIds = new Set(Array.from(groupsGrid.querySelectorAll('.group-card')).map(card => card.getAttribute('data-group-id')));
        const resultsCardIds = new Set(sortedGroups.map(g => g.groupId));

        // Remove cards that are no longer in the results
        existingCardIds.forEach(id => {
            if (!resultsCardIds.has(id)) {
                const card = groupsGrid.querySelector(`[data-group-id="${id}"]`);
                if (card) {
                    card.classList.add('hide');
                    setTimeout(() => card.remove(), 300);
                }
            }
        });

        // Add new cards
        sortedGroups.forEach(group => {
            if (!existingCardIds.has(group.groupId)) {
                const groupCard = this.createGroupCard(group);
                groupCard.classList.add('hide');
                groupsGrid.appendChild(groupCard);
                setTimeout(() => groupCard.classList.remove('hide'), 50);
            }
        });

        if (this.filteredGroups.length === 0 && !this.isLoading) {
            if (this.searchQuery) {
                noResults.style.display = 'block';
                if (noPublicGroups) noPublicGroups.style.display = 'none';
            } else if (this.totalPublicGroups === 0) {
                noResults.style.display = 'none';
                if (noPublicGroups) noPublicGroups.style.display = 'block';
            } else {
                noResults.style.display = 'none';
                if (noPublicGroups) noPublicGroups.style.display = 'none';
            }
        } else {
            noResults.style.display = 'none';
            if (noPublicGroups) noPublicGroups.style.display = 'none';
        }
    }


    handleSearch(e) {
        const query = e.target.value.trim().toLowerCase();
        this.searchQuery = query;

        const clearBtn = document.getElementById('clearSearch');
        clearBtn.style.display = query ? 'block' : 'none';

        // Debounce search
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.performSearch();
        }, CONFIG.SEARCH_DEBOUNCE_MS);
    }

    async performSearch() {
        if (this.searchQuery === '') {
            this.filteredGroups = this.groups;
            this.renderGroups();
            return;
        }

        try {
            this.isLoading = true;
            this.showLoading(true);
            this.renderGroups();
            const response = await fetch(`/api/groups?search=${this.searchQuery}&limit=50`);

            if (!response.ok) {
                throw new Error('Search failed');
            }

            const data = await response.json();
            this.filteredGroups = data.groups;

            await this.loadMemberCounts(this.filteredGroups);

        } catch (error) {
            console.error('Search error:', error);
            this.showError('Search failed. Please try again.');
        } finally {
            this.isLoading = false;
            this.showLoading(false);
            this.renderGroups();
        }
    }

    clearSearch() {
        const searchInput = document.getElementById('searchInput');
        const clearBtn = document.getElementById('clearSearch');

        searchInput.value = '';
        this.searchQuery = '';
        clearBtn.style.display = 'none';

        this.filteredGroups = this.groups;
        this.renderGroups();
    }

    setupInfiniteScroll() {
        let ticking = false;
        let lastLoadTime = 0;
        let hasMoreGroups = true;
        let loadedGroupIds = new Set();
        
        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
                    const nearBottom = scrollTop + clientHeight >= scrollHeight - CONFIG.SCROLL_THRESHOLD_PX;
                    const now = Date.now();
                    
                    if (nearBottom && !this.isLoading && this.searchQuery === '' && hasMoreGroups && now - lastLoadTime > CONFIG.MIN_LOAD_INTERVAL_MS) {
                        this.loadGroups();
                        lastLoadTime = now;
                    }
                    ticking = false;
                });
                ticking = true;
            }
        });
        
        // hasMoreGroups'u güncellemek için loadGroups'u override et
        const originalLoadGroups = this.loadGroups.bind(this);
        this.loadGroups = async (reset = false) => {
            const result = await originalLoadGroups(reset);
            
            if (result && result.groups) {
                // Yeni gelen grupları kontrol et
                const newGroups = result.groups.filter(group => !loadedGroupIds.has(group.groupId));
                
                // Eğer yeni grup yoksa veya çok az varsa daha fazla grup yok demektir
                if (newGroups.length === 0 || (result.groups.length < this.groupsPerPage && newGroups.length < 3)) {
                    hasMoreGroups = false;
                }
                
                // Yüklenen grup ID'lerini kaydet
                result.groups.forEach(group => loadedGroupIds.add(group.groupId));
            }
            
            return result;
        };
    }

    openCreateModal() {
        const modal = document.getElementById('createGroupModal');
        modal.style.display = 'flex';
        modal.style.opacity = '1';
        modal.style.visibility = 'visible';
        document.body.style.overflow = 'hidden';

        // Reset to stage 1
        this.createGroupStage = 1;
        this.showCreateGroupStage(1);

        // Update visibility icon based on current selection
        this.updateVisibilityIcon();
    }

    closeCreateModal() {
        const modal = document.getElementById('createGroupModal');
        const form = document.getElementById('createGroupForm');

        modal.style.opacity = '0';
        modal.style.visibility = 'hidden';
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
        document.body.style.overflow = 'auto';
        form.reset();
        
        // Reset stages
        this.createGroupStage = 1;
        this.showCreateGroupStage(1);
        
        // Hazır avatar seçimini temizle
        this.selectedAvatarPath = null;
        this.selectedAdminAvatarPath = null;
        
        // Dosya seçim metinlerini sıfırla
        const groupFileInputText = document.querySelector('#groupInfoStage .file-input-text');
        const adminFileInputText = document.querySelector('#adminInfoStage .file-input-text');
        if (groupFileInputText) {
            groupFileInputText.textContent = 'Bir resim seçin...';
            groupFileInputText.style.color = '#6c757d';
        }
        if (adminFileInputText) {
            adminFileInputText.textContent = 'Bir resim seçin...';
            adminFileInputText.style.color = '#6c757d';
        }

        if (adminPasswordError) {
            adminPasswordError.style.display = 'none';
        }
    }

    togglePasswordVisibility() {
        const passwordInput = document.getElementById('adminPasswordInput');
        const toggleIcon = document.querySelector('#passwordToggle i');
        
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            toggleIcon.className = 'fas fa-eye-slash';
        } else {
            passwordInput.type = 'password';
            toggleIcon.className = 'fas fa-eye';
        }
    }

    updateVisibilityIcon() {
        const visibilitySelect = document.getElementById('groupVisibilityInput');
        const visibilityIcon = document.querySelector('#groupVisibilityInput').parentElement.querySelector('.input-icon');
        const visibilityInfo = document.getElementById('createGroupVisibilityInfo');
        const infoSpan = visibilityInfo ? visibilityInfo.querySelector('span') : null;
        
        if (visibilitySelect.value === 'public') {
            visibilityIcon.className = 'fas fa-eye input-icon';
            if (infoSpan) infoSpan.textContent = 'Herkes bu grubu görüntüleyebilir';
        } else if (visibilitySelect.value === 'private') {
            visibilityIcon.className = 'fas fa-eye-slash input-icon';
            if (infoSpan) infoSpan.textContent = 'Sadece üyeler grubu görüntüleyebilir';
        }
    }

    // Stage management methods
    showCreateGroupStage(stage) {
        const groupInfoStage = document.getElementById('groupInfoStage');
        const adminInfoStage = document.getElementById('adminInfoStage');
        const nextBtn = document.getElementById('nextToAdminInfo');
        const backBtn = document.getElementById('backToGroupInfo');
        const createBtn = document.getElementById('createGroupBtn');
        const cancelBtn = document.getElementById('cancelCreate');
        const modalTitle = document.getElementById('createModalTitle');

        // Stage 1: Grup Bilgileri
        if (stage === 1) {
            groupInfoStage.style.display = 'block';
            adminInfoStage.style.display = 'none';
            
            nextBtn.style.display = 'block';
            backBtn.style.display = 'none';
            createBtn.style.display = 'none';
            cancelBtn.style.display = 'block';
            modalTitle.textContent = 'Yeni Grup Oluştur';
        }
        
        // Stage 2: Yönetici Bilgileri
        if (stage === 2) {
            groupInfoStage.style.display = 'none';
            adminInfoStage.style.display = 'block';
            
            nextBtn.style.display = 'none';
            backBtn.style.display = 'block';
            createBtn.style.display = 'block';
            cancelBtn.style.display = 'none';
            modalTitle.textContent = 'Yönetici Bilgileri';
        }
    }

    nextToAdminInfo() {
        // Validate group info stage
        const groupName = document.getElementById('groupNameInput').value.trim();
        const errors = [];

        if (!groupName) {
            errors.push('Grup ismi zorunludur.');
        }

        if (groupName.length > 40) {
            errors.push('Grup ismi 40 karakterden uzun olamaz.');
        }

        if (errors.length > 0) {
            this.showErrorMessage(errors.join('\n'));
            return;
        }

        this.createGroupStage = 2;
        this.showCreateGroupStage(2);
    }

    backToGroupInfo() {
        this.createGroupStage = 1;
        this.showCreateGroupStage(1);
    }

    // Admin avatar modal methods
    async toggleAdminAvatarModal() {
        const modal = document.getElementById('adminAvatarModal');
        if (modal) {
            const willBeVisible = !modal.classList.contains('show');
            modal.classList.toggle('show');
            
            // Modal açılıyorsa ve avatar'lar henüz yüklenmediyse, yükle
            if (willBeVisible && !this.adminAvatarsLoaded) {
                await this.loadAdminAvatarOptions();
                this.adminAvatarsLoaded = true;
            }
        }
    }

    async loadAdminAvatarOptions() {
        const avatarGrid = document.getElementById('adminAvatarGrid');
        if (!avatarGrid) return;

        try {
            const response = await fetch('/api/user-avatars');
            const avatars = await response.json();
            
            avatarGrid.innerHTML = '';
            
            avatars.forEach((avatar, index) => {
                const avatarItem = document.createElement('div');
                avatarItem.className = 'avatar-item';
                avatarItem.innerHTML = `<img src="/userAvatars/${avatar}" alt="Avatar ${index + 1}">`;
                
                avatarItem.addEventListener('click', () => this.selectAdminAvatar(avatar));
                avatarGrid.appendChild(avatarItem);
            });
        } catch (error) {
            console.error('Admin avatar yükleme hatası:', error);
            avatarGrid.innerHTML = '<p>Avatar yüklenirken hata oluştu.</p>';
        }
    }

    selectAdminAvatar(avatar) {
        const fileInputText = document.querySelector('#adminInfoStage .file-input-text');
        if (fileInputText) {
            fileInputText.textContent = 'Avatar seçildi';
            fileInputText.style.color = '#28a745';
        }
        
        this.selectedAdminAvatarPath = `/userAvatars/${avatar}`;
        
        const adminProfileImageInput = document.getElementById('adminProfileImageInput');
        if (adminProfileImageInput) {
            adminProfileImageInput.value = '';
        }
        
        this.toggleAdminAvatarModal();
    }

    setCreateGroupSubmitting(isSubmitting) {
        this.isCreatingGroup = isSubmitting;
        const createBtn = document.getElementById('createGroupBtn');
        if (!createBtn) return;
        if (isSubmitting) {
            createBtn.disabled = true;
            createBtn.dataset.originalText = createBtn.textContent;
            createBtn.textContent = 'Oluşturuluyor...';
        } else {
            createBtn.disabled = false;
            if (createBtn.dataset.originalText) {
                createBtn.textContent = createBtn.dataset.originalText;
                delete createBtn.dataset.originalText;
            }
        }
    }

    async handleCreateGroup(event) {
        event.preventDefault();
        if (this.isCreatingGroup) return;
        
        const groupNameEl = document.getElementById('groupNameInput');
        const groupDescEl = document.getElementById('groupDescInput');
        const adminUserNameEl = document.getElementById('adminUserNameInput');
        const adminNameEl = document.getElementById('adminNameInput');
        const adminPasswordEl = document.getElementById('adminPasswordInput');

        const groupName = groupNameEl ? groupNameEl.value.trim() : '';
        const groupDescription = groupDescEl ? groupDescEl.value.trim() : '';
        const adminUserName = adminUserNameEl ? adminUserNameEl.value.trim() : '';
        const adminName = adminNameEl ? adminNameEl.value.trim() : '';
        const adminPassword = adminPasswordEl ? adminPasswordEl.value.trim() : '';
        const groupImageInput = document.getElementById('groupImageInput');
        const adminProfileImageInput = document.getElementById('adminProfileImageInput');
        const visibility = document.getElementById('groupVisibilityInput').value;
        const autoMarkUnreadInput = document.getElementById('autoMarkUnreadInput');
        const autoMarkUnread = autoMarkUnreadInput ? autoMarkUnreadInput.value : 'true';

        // Karakter limiti kontrolü
        const errors = [];

        // Kontroller
        if (!groupName || !adminUserName || !adminName || !adminPassword) {
            errors.push('Lütfen tüm zorunlu alanları doldurun.');
        }

        if (groupName.length > 40) {
            errors.push('Grup ismi 40 karakterden uzun olamaz.');
        }
        
        if (groupDescription.length > 200) {
            errors.push('Grup açıklaması 200 karakterden uzun olamaz.');
        }
        
        if (adminUserName.length > 40) {
            errors.push('Kullanıcı adı 40 karakterden uzun olamaz.');
        }
        
        if (adminName.length > 40) {
            errors.push('Yönetici adı 40 karakterden uzun olamaz.');
        }
        
        if (adminPassword.length > 40) {
            errors.push('Yönetici şifresi 40 karakterden uzun olamaz.');
        }

        // Hata varsa göster
        if (errors.length > 0) {
            const adminPasswordError = document.getElementById('adminPasswordError');
            if (adminPasswordError) {
                adminPasswordError.textContent = errors.join('\n');
                adminPasswordError.style.display = 'block';
            }
            return;
        } else {
            const adminPasswordError = document.getElementById('adminPasswordError');
            if (adminPasswordError) {
                adminPasswordError.style.display = 'none';
            }
        }

        const formData = new FormData();
        formData.append('groupName', groupName);
        formData.append('description', groupDescription);
        formData.append('adminUserName', adminUserName);
        formData.append('adminName', adminName);
        formData.append('adminPassword', adminPassword);
        formData.append('visibility', visibility);
        formData.append('autoMarkUnread', autoMarkUnread);
        
        // Grup resmi
        if (this.selectedAvatarPath) {
            formData.append('selectedGroupAvatarPath', this.selectedAvatarPath);
        } else if (groupImageInput.files[0]) {
            formData.append('groupImage', groupImageInput.files[0]);
        }
        
        // Admin profil resmi
        if (this.selectedAdminAvatarPath) {
            formData.append('selectedAdminAvatarPath', this.selectedAdminAvatarPath);
        } else if (adminProfileImageInput.files[0]) {
            formData.append('adminProfileImage', adminProfileImageInput.files[0]);
        }

        this.setCreateGroupSubmitting(true);
        try {
            const response = await fetch('/api/groups', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                // Yeni sistem ile admin girişi yap
                LocalStorageManager.loginUser(result.group.groupId, result.userId, 'admin', adminUserName, result.group.groupName, adminName);
                
                this.closeCreateModal();
                window.location.href = `/groupid=${result.group.groupId}`;
            } else {
                alert(`Grup oluşturulamadı: ${result.error}`);
            }
        } catch (error) {
            console.error('Grup oluşturma hatası:', error);
            alert('Grup oluşturulurken bir hata oluştu.');
        } finally {
            this.setCreateGroupSubmitting(false);
        }
    }

    // Grup kartı oluşturma
    createGroupCard(group) {
        const memberCount = this.memberCounts.get(group.groupId) || 0;
        
        // Kullanıcının grupları için private kontrolü yapma
        const userGroups = localStorage.getItem('groups');
        let isUserGroup = false;
        if (userGroups) {
            const groupsData = JSON.parse(userGroups);
            isUserGroup = Object.hasOwn(groupsData, group.groupId);
        }
        
        const isPrivate = group.visibility === 'private' && !isUserGroup;

        let avatarHtml;
        if (group.groupImage) {
            avatarHtml = `<img src="${group.groupImage}" alt="${group.groupName}" class="group-avatar-image group-avatar-image-loading" onload="this.classList.remove('group-avatar-image-loading')" onerror="this.classList.remove('group-avatar-image-loading'); this.src='/images/open-book.webp'">`;
        } else {
            const groupInitial = group.groupName.charAt(0).toUpperCase();
            avatarHtml = `<span>${groupInitial}</span>`;
        }

        // Gizli grup için kilit ikonu (sadece kullanıcının grubu değilse)
        const lockIcon = isPrivate ? '<img src="/images/lock.webp" alt="Kilit" title="Gizli Grup" class="private-group-lock">' : '';
        
        // Kullanıcının grubu için özel işaret - yetkiye göre
        let userGroupIcon = '';
        if (isUserGroup) {
            const userAuthority = group.userAuthority || 'member';
            const iconClass = userAuthority === 'admin' ? 'fas fa-user-shield' : 'fas fa-user';
            const badgeClass = userAuthority === 'admin' ? 'user-group-badge admin-badge' : 'user-group-badge member-badge';
            userGroupIcon = `<div class="${badgeClass}"><i class="${iconClass}"></i></div>`;
        }

        const card = document.createElement('div');
        card.setAttribute('data-group-id', group.groupId);
        // Kullanıcının grubu ise özel class ekle
        if (isUserGroup) {
            card.className = isPrivate ? 'group-card private-group user-group' : 'group-card user-group';
        } else {
            card.className = isPrivate ? 'group-card private-group' : 'group-card';
        }
        card.setAttribute('data-group-id', group.groupId);

        card.innerHTML = `
            <div class="group-header">
                <div class="group-avatar">
                    ${avatarHtml}
                </div>
                <div class="group-info">
                    <h3 class="group-name">${this.escapeHtml(group.groupName)}</h3>
                    <p class="group-id">@${this.escapeHtml(group.groupId)}</p>
                </div>
                ${lockIcon}
                ${userGroupIcon}
            </div>
            <div>
               <span class="groupDescription">${this.escapeHtml((group.description || '').substring(0, 100))}</span>
            </div>

        <div class="group-stats">
            <div class="stat-item">
                <i class="fas fa-users"></i>
                <span class="member-count"><span class="memberCount">${memberCount}</span> üye</span>
            </div>
            ${!isUserGroup ? this.getJoinButtonHtml(group) : ''}
        </div>
    `;

        // Gruba katıl butonu için event listener
        if (!isUserGroup) {
            const joinBtn = card.querySelector('.join-group-btn');
            if (joinBtn) {
                joinBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Kart tıklamasını engelle
                    this.openJoinModal(group);
                });
            }
        }

        // Tüm gruplar için tıklama işlevi (private gruplar da dahil)
        card.addEventListener('click', () => {
            window.location.href = `/groupid=${group.groupId}`;
        });

        // Hover efekti
        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-5px)';
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'translateY(0)';
        });

        return card;
    }

    showLoading(show) {
        const loadingSpinner = document.getElementById('loadingSpinner');
        loadingSpinner.style.display = show ? 'block' : 'none';
    }

    showError(message) {
        const toast = document.createElement('div');
        toast.className = 'toast toast-error';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('toast-hide');
            setTimeout(() => {
                if (document.body.contains(toast)) {
                    document.body.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Hazır görseller modal'ını aç/kapat
    toggleReadyImagesModal() {
        const modal = document.getElementById('readyImagesModal');
        if (modal.classList.contains('show')) {
            this.closeReadyImagesModal();
        } else {
            this.openReadyImagesModal();
        }
    }

    async openReadyImagesModal() {
        const modal = document.getElementById('readyImagesModal');
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
        
        // Avatar'ları sadece ilk açılışta yükle
        if (!this.avatarsLoaded) {
            await this.loadAvatarOptions();
            this.avatarsLoaded = true;
        }
    }

    closeReadyImagesModal() {
        const modal = document.getElementById('readyImagesModal');
        modal.classList.remove('show');
        document.body.style.overflow = 'auto';
    }

    // Hazır avatar seçeneklerini yükle
    async loadAvatarOptions() {
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
                    
                    avatarItem.addEventListener('click', () => this.selectAvatar(avatar.path, avatarItem));
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
    selectAvatar(avatarPath, avatarElement) {
        // Önceki seçimi kaldır
        document.querySelectorAll('.avatar-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        // Yeni seçimi işaretle
        avatarElement.classList.add('selected');
        
        // Modal'ı kapat
        this.closeReadyImagesModal();
        
        // Seçilen avatar'ı sakla (grup oluşturulurken kullanılacak)
        this.selectedAvatarPath = avatarPath;
        
        // Dosya input'unu temizle
        const fileInput = document.getElementById('groupImageInput');
        fileInput.value = '';
        
        // Dosya seçim metnini güncelle
        const fileInputText = document.querySelector('.file-input-text');
        fileInputText.textContent = 'Hazır görsel seçildi';
        fileInputText.style.color = '#28a745';
    }

    // Katılma isteği durumlarını kontrol et
    async checkJoinRequestStatuses() {
        const joinRequests = LocalStorageManager.getJoinRequests();
        const entries = Object.entries(joinRequests);
        
        if (entries.length === 0) return;
        
        // Tüm kontrolleri paralel olarak yap
        const promises = entries.map(async ([groupId, requestId]) => {
            try {
                const response = await fetch(`/api/join-request-status-by-id/${requestId}`);
                if (!response.ok) {
                    LocalStorageManager.removeJoinRequest(groupId);
                    return;
                }
                
                const data = await response.json();
                
                switch (data.status) {
                    case 'none':
                        LocalStorageManager.removeJoinRequest(groupId);
                        break;
                        
                    case 'accepted':
                        LocalStorageManager.removeJoinRequest(groupId);
                        LocalStorageManager.loginUser(
                            groupId, 
                            requestId, 
                            'member', 
                            data.userName || '', 
                            '', 
                            data.userName || ''
                        );
                        this.showSuccessMessage(
                            `"${data.groupName || 'Bilinmeyen Grup'}" grubuna katılma isteğiniz kabul edildi!`
                        );
                        break;
                        
                    case 'rejected':
                        await fetch(`/api/delete-join-request/${requestId}`, { method: 'DELETE' });
                        LocalStorageManager.removeJoinRequest(groupId);
                        this.showErrorMessage(
                            `"${data.groupName || 'Bilinmeyen Grup'}" grubuna katılma isteğiniz reddedildi.`
                        );
                        break;
                        
                    case 'pending':
                        this.joinRequestStatuses.set(groupId, data);
                        break;
                }
            } catch (error) {
                console.error(`Katılma isteği durum kontrol hatası (${groupId}):`, error);
                LocalStorageManager.removeJoinRequest(groupId);
            }
        });
        
        await Promise.all(promises);
    }

    // Katılma butonu HTML'ini oluştur
    getJoinButtonHtml(group) {
        const joinRequestStatus = this.joinRequestStatuses.get(group.groupId);
        
        // Eğer istek varsa (pending, accepted, rejected) pending sınıfı kullan
        if (joinRequestStatus || LocalStorageManager.hasJoinRequest(group.groupId)) {
            return '<button class="join-group-btn pending"><i class="fas fa-times"></i> İptal Et</button>';
        } else {
            return '<button class="join-group-btn"><i class="fas fa-plus"></i> Gruba Katıl</button>';
        }
    }

    // Belirli bir grubun butonunu güncelle
    updateGroupButton(groupId) {
        const groupCard = document.querySelector(`[data-group-id="${groupId}"]`);
        if (!groupCard) return;

        const joinBtn = groupCard.querySelector('.join-group-btn');
        if (!joinBtn) return;

        const group = this.groups.find(g => g.groupId === groupId);
        if (!group) return;

        const newButtonHtml = this.getJoinButtonHtml(group);
        joinBtn.outerHTML = newButtonHtml;

        // Yeni buton için event listener ekle
        const newJoinBtn = groupCard.querySelector('.join-group-btn');
        if (newJoinBtn) {
            newJoinBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openJoinModal(group);
            });
        }
    }

    // Katılma modalını aç
    openJoinModal(group) {
        this.currentJoinGroup = group;
        
        // Eğer zaten istek varsa iptal etme onayı göster
        if (LocalStorageManager.hasJoinRequest(group.groupId)) {
            this.showCancelConfirmModal(group);
            return;
        }
        
        // Modal içeriğini güncelle
        document.getElementById('joinGroupName').textContent = group.groupName;
        document.getElementById('joinGroupId').textContent = `@${group.groupId}`;
        document.getElementById('joinGroupAvatar').src = group.groupImage || '/images/open-book.webp';
        
        // Formu sıfırla
        document.getElementById('joinGroupForm').reset();
        document.querySelector('#joinProfileImageInput').parentElement.querySelector('.file-input-text').textContent = 'Bir resim seçin...';
        
        // Form alanlarını tekrar göster (sadece join modal içinde)
        const joinModal = document.getElementById('joinGroupModal');
        const joinInfoSection = joinModal.querySelector('.join-info-section');
        const formSections = joinModal.querySelectorAll('.form-section');
        
        if (joinInfoSection) {
            joinInfoSection.style.display = 'block';
        }
        
        formSections.forEach(section => {
            section.style.display = 'block';
        });
        
        // Durum mesajını ve açıklamayı gizle
        document.getElementById('joinStatusMessage').style.display = 'none';
        
        // Butonları sıfırla
        document.getElementById('submitJoinRequest').style.display = 'block';
        document.getElementById('cancelJoin').style.display = 'block';
        const successActions = document.getElementById('successActions');
        successActions.style.display = 'none';
        successActions.classList.remove('show');
        
        // Modal'ı göster
        const modal = document.getElementById('joinGroupModal');
        modal.style.display = 'flex';
        modal.style.opacity = '1';
        modal.style.visibility = 'visible';
        document.body.style.overflow = 'hidden';
    }

    // Katılma modalını kapat
    closeJoinModal() {
        const modal = document.getElementById('joinGroupModal');
        modal.style.opacity = '0';
        modal.style.visibility = 'hidden';
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
        document.body.style.overflow = 'auto';
        this.currentJoinGroup = null;
    }

    // Katılma isteği gönder
    async handleJoinGroupRequest(event) {
        event.preventDefault();
        
        if (!this.currentJoinGroup) return;

        const userNameEl = document.getElementById('joinUserNameInput');
        const memberNameEl = document.getElementById('joinMemberNameInput');
        const memberPasswordEl = document.getElementById('joinMemberPasswordInput');
        const profileImageInput = document.getElementById('joinProfileImageInput');

        // Kayıt öncesi trim
        const userName = userNameEl ? userNameEl.value.trim() : '';
        const memberName = memberNameEl ? memberNameEl.value.trim() : '';
        const memberPassword = memberPasswordEl ? memberPasswordEl.value.trim() : '';

        // Validasyon
        const errors = [];
        if (!userName || !memberName || !memberPassword) {
            errors.push('Lütfen tüm zorunlu alanları doldurun.');
        }
        if (userName.length > 40) {
            errors.push('Kullanıcı adı 40 karakterden uzun olamaz.');
        }
        if (memberName.length > 40) {
            errors.push('Üye adı 40 karakterden uzun olamaz.');
        }
        if (memberPassword.length > 40) {
            errors.push('Üye şifresi 40 karakterden uzun olamaz.');
        }

        if (errors.length > 0) {
            const errorDiv = document.getElementById('joinPasswordError');
            errorDiv.textContent = errors.join('\n');
            errorDiv.style.display = 'block';
            return;
        } else {
            document.getElementById('joinPasswordError').style.display = 'none';
        }

        const formData = new FormData();
        formData.append('groupId', this.currentJoinGroup.groupId);
        formData.append('userName', userName);
        formData.append('memberName', memberName);
        formData.append('userPassword', memberPassword);
        
        if (profileImageInput.files[0]) {
            formData.append('profileImage', profileImageInput.files[0]);
        }
        
        const selectedAvatarPath = avatarModalManager ? avatarModalManager.getSelectedAvatarPath() : null;
        if (selectedAvatarPath) {
            formData.append('selectedAvatarPath', selectedAvatarPath);
        }

        try {
            const response = await fetch('/api/join-group-request', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                // Başarılı
                LocalStorageManager.addJoinRequest(this.currentJoinGroup.groupId, result.requestId);
                this.joinRequestStatuses.set(this.currentJoinGroup.groupId, { status: 'pending' });
                
                // UI'yi güncelle - başarı paneli göster
                this.showSuccessPanel();
                
                // Grup kartını yenile (buton güncellenir)
                this.updateGroupButton(this.currentJoinGroup.groupId);
            } else {
                this.showErrorMessage(result.error || 'Katılma isteği gönderilemedi.');
            }
        } catch (error) {
            console.error('Katılma isteği hatası:', error);
            this.showErrorMessage('Katılma isteği gönderilirken bir hata oluştu.');
        }
    }

    // Katılma isteğini iptal et
    async handleCancelJoinRequest(group = null) {
        const targetGroup = group || this.currentJoinGroup;
        
        if (!targetGroup || !targetGroup.groupId) {
            console.error('Grup bilgisi bulunamadı');
            return;
        }

        const requestId = LocalStorageManager.getJoinRequestId(targetGroup.groupId);
        if (!requestId) {
            console.error('RequestId bulunamadı:', targetGroup.groupId);
            return;
        }

        try {
            const response = await fetch(`/api/cancel-join-request-by-id/${requestId}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                // Başarılı
                LocalStorageManager.removeJoinRequest(targetGroup.groupId);
                this.joinRequestStatuses.delete(targetGroup.groupId);
                
                // Modal'ı kapat
                this.closeJoinModal();
                
                // Grup kartını yenile (buton normal "Gruba Katıl" tasarımına döner)
                this.updateGroupButton(targetGroup.groupId);
                
                this.showSuccessMessage('Katılma isteği iptal edildi.');
            } else {
                this.showErrorMessage(result.error || 'Katılma isteği iptal edilemedi.');
            }
        } catch (error) {
            console.error('Katılma isteği iptal hatası:', error);
            this.showErrorMessage('Katılma isteği iptal edilirken bir hata oluştu.');
        }
    }

    // Join modal şifre görünürlüğü
    toggleJoinPasswordVisibility() {
        const passwordInput = document.getElementById('joinMemberPasswordInput');
        const toggleIcon = document.querySelector('#joinPasswordToggle i');
        
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            toggleIcon.className = 'fas fa-eye-slash';
        } else {
            passwordInput.type = 'password';
            toggleIcon.className = 'fas fa-eye';
        }
    }

    // Grubu görüntüle
    goToHomePage() {
        if (this.currentJoinGroup) {
            // Grup sayfasına yönlendir
            window.location.href = `/groupid=${this.currentJoinGroup.groupId}`;
        } else {
            this.closeJoinModal();
        }
    }

    // Başarı mesajı göster
    showSuccessMessage(message) {
        this.showToast(message, 'success');
    }

    // Hata mesajı göster
    showErrorMessage(message) {
        this.showToast(message, 'error');
    }

    // Toast mesajı göster (kuyruk sistemi ile)
    showToast(message, type = 'info') {
        // Mesajı kuyruğa ekle
        this.messageQueue.push({ message, type });
        
        // Eğer şu anda mesaj gösterilmiyorsa, kuyruktan mesaj göster
        if (!this.isShowingMessage) {
            this.processMessageQueue();
        }
    }

    // Mesaj kuyruğunu işle
    processMessageQueue() {
        if (this.messageQueue.length === 0) {
            this.isShowingMessage = false;
            return;
        }

        this.isShowingMessage = true;
        const { message, type } = this.messageQueue.shift();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-hide');
            setTimeout(() => {
                if (document.body.contains(toast)) {
                    document.body.removeChild(toast);
                }
                setTimeout(() => { 
                    this.processMessageQueue(); 
                }, CONFIG.NEXT_TOAST_DELAY_MS);
            }, CONFIG.TOAST_HIDE_DELAY_MS);
        }, CONFIG.TOAST_DURATION_MS);
    }

    // Başarı paneli göster
    showSuccessPanel() {
        // Tüm form alanlarını ve info section'ı gizle (sadece join modal içinde)
        const joinModal = document.getElementById('joinGroupModal');
        const joinInfoSection = joinModal.querySelector('.join-info-section');
        const formSections = joinModal.querySelectorAll('.form-section');
        
        if (joinInfoSection) {
            joinInfoSection.style.display = 'none';
        }
        
        formSections.forEach(section => {
            section.style.display = 'none';
        });
        
        // Normal butonları gizle, başarı butonlarını göster
        document.getElementById('cancelJoin').style.display = 'none';
        document.getElementById('submitJoinRequest').style.display = 'none';
        const successActions = document.getElementById('successActions');
        successActions.style.display = 'flex';
        successActions.classList.add('show');
        
        // Başarı mesajını göster
        document.getElementById('joinStatusMessage').style.display = 'block';
        
        // Debug: Butonları kontrol et
        const cancelJoinRequest = document.getElementById('cancelJoinRequest');
        const goToHomePage = document.getElementById('goToHomePage');

        
        // Eski event listener'ları kaldır
        cancelJoinRequest.replaceWith(cancelJoinRequest.cloneNode(true));
        goToHomePage.replaceWith(goToHomePage.cloneNode(true));
        
        // Yeni event listener'ları ekle
        document.getElementById('cancelJoinRequest').addEventListener('click', () => {
            this.handleCancelJoinRequest(this.currentJoinGroup);
        });
        document.getElementById('goToHomePage').addEventListener('click', () => {
            this.goToHomePage();
        });
    }

    // İptal etme onay modalı göster
    showCancelConfirmModal(group) {
        const confirmModal = document.createElement('div');
        confirmModal.className = 'modal confirm-modal';
        confirmModal.innerHTML = `
            <div class="confirm-modal-content">
                <div class="confirm-modal-icon">
                    <i class="fas fa-question"></i>
                </div>
                <h3 class="confirm-modal-title">İsteği İptal Et</h3>
                <p class="confirm-modal-text">
                    <strong>${this.escapeHtml(group.groupName)}</strong> grubuna gönderdiğiniz katılma isteğini iptal etmek istediğinizden emin misiniz?
                </p>
                <div class="confirm-modal-actions">
                    <button id="cancelConfirmNo" class="btn-cancel-no">Hayır</button>
                    <button id="cancelConfirmYes" class="btn-cancel-yes">Evet, İptal Et</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(confirmModal);
        
        // Event listener'lar
        document.getElementById('cancelConfirmNo').addEventListener('click', () => {
            document.body.removeChild(confirmModal);
        });
        
        document.getElementById('cancelConfirmYes').addEventListener('click', () => {
            document.body.removeChild(confirmModal);
            this.handleCancelJoinRequest(group);
        });
        
        // Dışına tıklama
        confirmModal.addEventListener('click', (e) => {
            if (e.target === confirmModal) {
                document.body.removeChild(confirmModal);
            }
        });
    }
}

/* ==================== Avatar Modal Management ==================== */
class AvatarModalManager {
    constructor() {
        this.selectedJoinAvatarPath = null;
        this.joinAvatarsLoaded = false; // Avatar'ların yüklenip yüklenme diğini takip et
    }

    async toggleJoinAvatarModal() {
        const modal = document.getElementById('joinAvatarModal');
        if (modal) {
            const willBeVisible = !modal.classList.contains('show');
            modal.classList.toggle('show');
            
            // Modal açılıyorsa ve avatar'lar henüz yüklenmediyse, yükle
            if (willBeVisible && !this.joinAvatarsLoaded) {
                await this.loadJoinAvatarOptions();
                this.joinAvatarsLoaded = true;
            }
        }
    }

    async loadJoinAvatarOptions() {
        const avatarGrid = document.getElementById('joinAvatarGrid');
        if (!avatarGrid) return;

        try {
            const response = await fetch('/api/user-avatars');
            const avatars = await response.json();
            
            avatarGrid.innerHTML = '';
            
            avatars.forEach((avatar, index) => {
                const avatarItem = document.createElement('div');
                avatarItem.className = 'avatar-item';
                avatarItem.innerHTML = `<img src="/userAvatars/${avatar}" alt="Avatar ${index + 1}">`;
                
                avatarItem.addEventListener('click', () => this.selectJoinAvatar(avatar));
                avatarGrid.appendChild(avatarItem);
            });
        } catch (error) {
            console.error('Avatar yükleme hatası:', error);
            avatarGrid.innerHTML = '<p>Avatar yüklenirken hata oluştu.</p>';
        }
    }

    selectJoinAvatar(avatar) {
        const fileInputText = document.querySelector('#joinGroupModal .file-input-text');
        if (fileInputText) {
            fileInputText.textContent = 'Avatar seçildi';
            fileInputText.style.color = '#28a745';
        }
        
        this.selectedJoinAvatarPath = `/userAvatars/${avatar}`;
        
        const joinProfileImageInput = document.getElementById('joinProfileImageInput');
        if (joinProfileImageInput) {
            joinProfileImageInput.value = '';
        }
        
        this.toggleJoinAvatarModal();
    }

    getSelectedAvatarPath() {
        return this.selectedJoinAvatarPath;
    }

    resetSelection() {
        this.selectedJoinAvatarPath = null;
    }
}

/* ==================== Global Instances ==================== */
let groupsPageInstance = null;
let avatarModalManager = null;

async function logHomePageVisit(userName) {
    try {
        const deviceInfo = {
            userAgent: navigator.userAgent,
            screenWidth: window.screen.width,
            screenHeight: window.screen.height
        };

        await fetch('/api/log-home-visit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userName: userName || null,
                deviceInfo
            })
        });
    } catch (error) {
        console.error('Ana sayfa ziyaret logu gönderilemedi:', error);
    }
}

/* ==================== DOM Content Loaded ==================== */
document.addEventListener('DOMContentLoaded', function() {
    const cachedUserName = localStorage.getItem('userName');
    logHomePageVisit(cachedUserName);

    // 1. Çerezleri temizle
    LocalStorageManager.clearCookies();
    
    // 2. Avatar modal manager'ı başlat
    avatarModalManager = new AvatarModalManager();
    
    // 3. Groups page'i başlat
    groupsPageInstance = new GroupsPage();
    
    // 4. Ready images modal butonları
    const readyImagesBtn = document.getElementById('readyImagesBtn');
    const closeReadyImagesModal = document.getElementById('closeReadyImagesModal');
    
    if (readyImagesBtn) {
        readyImagesBtn.addEventListener('click', () => {
            if (groupsPageInstance) {
                groupsPageInstance.toggleReadyImagesModal();
            }
        });
    }
    
    if (closeReadyImagesModal) {
        closeReadyImagesModal.addEventListener('click', () => {
            if (groupsPageInstance) {
                groupsPageInstance.closeReadyImagesModal();
            }
        });
    }
    
    // 5. Join avatar modal butonları
    const joinAvatarBtn = document.getElementById('joinAvatarBtn');
    const closeJoinAvatarModal = document.getElementById('closeJoinAvatarModal');
    
    if (joinAvatarBtn) {
        joinAvatarBtn.addEventListener('click', () => avatarModalManager.toggleJoinAvatarModal());
    }
    
    if (closeJoinAvatarModal) {
        closeJoinAvatarModal.addEventListener('click', () => avatarModalManager.toggleJoinAvatarModal());
    }
    
    // 6. Admin avatar modal butonları
    const adminAvatarBtn = document.getElementById('adminAvatarBtn');
    const closeAdminAvatarModal = document.getElementById('closeAdminAvatarModal');
    
    if (adminAvatarBtn) {
        adminAvatarBtn.addEventListener('click', () => {
            if (groupsPageInstance) {
                groupsPageInstance.toggleAdminAvatarModal();
            }
        });
    }
    
    if (closeAdminAvatarModal) {
        closeAdminAvatarModal.addEventListener('click', () => {
            if (groupsPageInstance) {
                groupsPageInstance.toggleAdminAvatarModal();
            }
        });
    }
    
    // 7. Join profile image input change listener
    const joinProfileImageInput = document.getElementById('joinProfileImageInput');
    if (joinProfileImageInput) {
        joinProfileImageInput.addEventListener('change', function() {
            if (this.files.length > 0) {
                const fileInputText = document.querySelector('#joinGroupModal .file-input-text');
                if (fileInputText) {
                    fileInputText.textContent = this.files[0].name;
                }
                
                // Avatar seçimini sıfırla (tek seçim mantığı)
                avatarModalManager.resetSelection();
            }
        });
    }
    
    // 8. Admin profile image input change listener
    const adminProfileImageInput = document.getElementById('adminProfileImageInput');
    if (adminProfileImageInput) {
        adminProfileImageInput.addEventListener('change', function() {
            if (this.files.length > 0) {
                const fileInputText = document.querySelector('#adminInfoStage .file-input-text');
                if (fileInputText) {
                    fileInputText.textContent = this.files[0].name;
                }
                
                // Admin avatar seçimini sıfırla (tek seçim mantığı)
                if (groupsPageInstance) {
                    groupsPageInstance.selectedAdminAvatarPath = null;
                }
            }
        });
    }
});