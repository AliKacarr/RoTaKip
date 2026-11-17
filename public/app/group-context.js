const groupCache = new Map();
const groupDataCache = new Map();

async function readJson(response) {
  return response.json().catch(() => ({}));
}

async function fetchGroup(groupId) {
  const response = await fetch(`/api/group/${encodeURIComponent(groupId)}`, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin'
  });
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
  const response = await fetch(`/api/auth/me/${encodeURIComponent(groupId)}`, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin'
  });
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

export async function loadGroupData(context) {
  if (!context.canRead) {
    const error = new Error('Bu grubu görüntülemek için giriş yapmalısınız.');
    error.code = 'PRIVATE_GROUP';
    throw error;
  }
  if (!groupDataCache.has(context.groupId)) {
    const url = `/api/all-data/${encodeURIComponent(context.groupId)}`;
    groupDataCache.set(context.groupId, fetch(url, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin'
    }).then(async response => {
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || 'Grup verileri alınamadı.');
      return data;
    }).catch(error => {
      groupDataCache.delete(context.groupId);
      throw error;
    }));
  }
  return groupDataCache.get(context.groupId);
}

export function invalidateGroupContext(groupId) {
  groupCache.delete(groupId);
  groupDataCache.delete(groupId);
}
