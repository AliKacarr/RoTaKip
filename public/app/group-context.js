const groupCache = new Map();
const groupDataCache = new Map();
// cetele-store.js (RANGE_DAYS) ile aynı aralık; adres birebir eşleşmezse ön istek kullanılmaz.
const CETELE_RANGE_DAYS = 63;
const PREFETCH_MAX_AGE_MS = 30 * 1000;

async function readJson(response) {
  return response.json().catch(() => ({}));
}

function requestJson(url) {
  return fetch(url, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin'
  });
}

// app-shell.html grup sayfasında grup, oturum ve okuma verisi isteklerini modüller yüklenmeden başlatır.
// Her istek bir kez devralınır (yanıt gövdesi tek kez okunabilir); süresi geçmiş istek kullanılmaz.
function takeEarlyRequest(groupId, kind) {
  const early = globalThis.__rotakipEarlyGroupRequests;
  if (!early || early.groupId !== groupId || !early[kind]) return null;
  const request = early[kind];
  early[kind] = null;
  if (Date.now() - early.startedAt > PREFETCH_MAX_AGE_MS) return null;
  return request;
}

async function fetchGroup(groupId) {
  const response = await (takeEarlyRequest(groupId, 'group') || requestJson(`/api/group/${encodeURIComponent(groupId)}`));
  const data = await readJson(response);
  if (response.status === 404) {
    const error = new Error('Grup bulunamadı.');
    error.code = 'GROUP_NOT_FOUND';
    throw error;
  }
  if (!response.ok || !data.group) throw new Error(data.error || 'Grup bilgisi alınamadı.');
  return data.group;
}

async function fetchSession(groupId) {
  const response = await (takeEarlyRequest(groupId, 'session') || requestJson(`/api/auth/me/${encodeURIComponent(groupId)}`));
  if (response.status === 401) return null;
  const data = await readJson(response);
  if (!response.ok) throw new Error(data.error || 'Oturum doğrulanamadı.');
  return data;
}

export async function resolveGroupContext(groupId) {
  if (!groupCache.has(groupId)) {
    groupCache.set(groupId, Promise.all([fetchGroup(groupId), fetchSession(groupId)])
      .then(([group, session]) => {
        const sessionUser = session && session.user ? session.user : null;
        const resolvedGroup = session && session.group ? session.group : group;
        return {
          groupId,
          group: resolvedGroup,
          user: sessionUser,
          authority: sessionUser ? sessionUser.authority : 'guest',
          isAuthenticated: Boolean(sessionUser),
          isAdmin: Boolean(sessionUser && sessionUser.authority === 'admin'),
          canRead: resolvedGroup.visibility !== 'private' || Boolean(sessionUser),
          isPrivate: resolvedGroup.visibility === 'private'
        };
      }).catch(error => {
        groupCache.delete(groupId);
        throw error;
      }));
  }
  return groupCache.get(groupId);
}

function requestGroupData(groupId) {
  if (!groupDataCache.has(groupId)) {
    const request = takeEarlyRequest(groupId, 'data') || requestJson(`/api/all-data/${encodeURIComponent(groupId)}`);
    const promise = request.then(async response => {
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || 'Grup verileri alınamadı.');
      return data;
    }).catch(error => {
      if (groupDataCache.get(groupId) === promise) groupDataCache.delete(groupId);
      throw error;
    });
    // Ön istek beklenmeden düşebilir; hata loadGroupData çağrısında ele alınır.
    promise.catch(() => {});
    groupDataCache.set(groupId, promise);
  }
  return groupDataCache.get(groupId);
}

// Okuma verisi, grup bağlamı (oturum/görünürlük) çözülmesi beklenmeden istenir. Gizli grupta misafirin
// isteğini sunucu reddeder; loadGroupData yalnız okunabilir grupta çağrıldığı için bu sonuç kullanılmaz.
export function prefetchGroupData(groupId) {
  if (groupId) requestGroupData(groupId);
}

export async function loadGroupData(context) {
  if (!context.canRead) {
    const error = new Error('Bu grubu görüntülemek için giriş yapmalısınız.');
    error.code = 'PRIVATE_GROUP';
    throw error;
  }
  const pending = groupDataCache.get(context.groupId);
  if (pending) {
    try {
      return await pending;
    } catch (_error) {
      // Bağlam çözülmeden başlatılan istek düştü (ör. oturum henüz yokken); bir kez yeniden denenir.
    }
  }
  return requestGroupData(context.groupId);
}

function localDateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function ceteleRangeUrl(groupId, now = new Date()) {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (CETELE_RANGE_DAYS - 1), 12);
  return `/api/cetele/${encodeURIComponent(groupId)}?from=${localDateKey(from)}&to=${localDateKey(now)}`;
}

// Giriş yapmış üyenin çetele kayıtları okumalar paketi yüklenmeden istenir; cetele-store.js ilk
// yüklemede aynı adresi bulursa bu isteği devralır.
export function prefetchCeteleEntries(groupId) {
  if (!groupId) return;
  const url = ceteleRangeUrl(groupId);
  const current = globalThis.rotakipCetelePrefetch;
  if (current && current.url === url && Date.now() - current.startedAt < PREFETCH_MAX_AGE_MS) return;
  const request = requestJson(url);
  request.catch(() => {});
  globalThis.rotakipCetelePrefetch = { url, startedAt: Date.now(), request };
}

export function invalidateGroupContext(groupId) {
  groupCache.delete(groupId);
  groupDataCache.delete(groupId);
  if (globalThis.__rotakipEarlyGroupRequests?.groupId === groupId) globalThis.__rotakipEarlyGroupRequests = null;
}
