'use strict';

const moment = require('moment');
const { SiteActivityLog } = require('./activity.models');
const { getGroupCollections } = require('../groups/group.models');
const { isSafeGroupId } = require('../../shared/group-id');

function createActivityService({ getSessionMembership }) {
  function getTurkeyMinuteBounds(at = new Date()) {
    const m = moment(at).utcOffset(3);
    const start = m.clone().startOf('minute').toDate();
    const end = m.clone().add(1, 'minute').startOf('minute').toDate();
    return { start, end };
  }

  /** timestamp aynı TR dakikasında ve alanlar eşleşiyorsa true */
  async function hasLogInSameTurkeyMinute(Model, matchFields) {
    const { start, end } = getTurkeyMinuteBounds();
    const found = await Model.findOne({
      ...matchFields,
      timestamp: { $gte: start, $lt: end }
    })
      .select('_id')
      .lean();
    return !!found;
  }

  /** trDate: YYYY-MM-DD (İstanbul takvim günü) — o günün [00:00, ertesi gün 00:00) aralığı UTC Date olarak */
  function getTurkeyDayBoundsFromTrDateString(trDate) {
    const parts = String(trDate).split('-').map((x) => parseInt(x, 10));
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
      return null;
    }
    const [y, mo, d] = parts;
    const start = moment({ year: y, month: mo - 1, date: d, hour: 0, minute: 0, second: 0, millisecond: 0 }).utcOffset(3, true);
    const end = start.clone().add(1, 'day');
    return { start: start.toDate(), end: end.toDate() };
  }

  function extractClientIp(req) {
    return req.ip || req.socket?.remoteAddress || '';
  }

  function buildDeviceInfo(req, fallbackDeviceInfo = {}) {
    const width = Number(fallbackDeviceInfo?.screenWidth);
    const height = Number(fallbackDeviceInfo?.screenHeight);
    return {
      userAgent: String(req.headers['user-agent'] || 'unknown').slice(0, 500),
      screenWidth: Number.isFinite(width) && width > 0 && width <= 20000 ? Math.round(width) : null,
      screenHeight: Number.isFinite(height) && height > 0 && height <= 20000 ? Math.round(height) : null
    };
  }

  async function resolveLogActor(req, groupId) {
    const membership = getSessionMembership(req, groupId);
    if (!membership) return extractClientIp(req);

    const { users } = getGroupCollections(groupId);
    const user = await users.findById(membership.userId).select('username').lean();
    return typeof user?.username === 'string' && user.username.trim()
      ? user.username.trim().slice(0, 100)
      : extractClientIp(req);
  }

  async function logSiteActivity({ action, req, groupId, deviceInfo, actor }) {
    try {
      const allowedSiteActions = new Set([
        'grup_görüntüleme',
        'ana_sayfa_görüntüleme',
        'grup_oluşturma',
        'grup_silme'
      ]);
      const normalizeSiteAction = (rawAction) => {
        const a = typeof rawAction === 'string' ? rawAction.trim() : '';
        return allowedSiteActions.has(a) ? a : 'bilinmeyen_eylem';
      };

      const normalizedAction = normalizeSiteAction(action);
      const storedGroupId = isSafeGroupId(groupId) ? String(groupId) : null;
      const storedActor = actor || await resolveLogActor(req, storedGroupId);

      if (await hasLogInSameTurkeyMinute(SiteActivityLog, {
        groupId: storedGroupId,
        action: normalizedAction,
        ipAddress: storedActor
      })) {
        return;
      }

      const log = new SiteActivityLog({
        action: normalizedAction,
        timestamp: new Date(),
        deviceInfo: buildDeviceInfo(req, deviceInfo),
        ipAddress: storedActor,
        groupId: storedGroupId
      });

      await log.save();
    } catch (error) {
      console.error('Error writing site activity log:', error);
    }
  }



  return {
    buildDeviceInfo,
    getTurkeyDayBoundsFromTrDateString,
    hasLogInSameTurkeyMinute,
    logSiteActivity,
    resolveLogActor
  };
}

module.exports = {
  createActivityService
};

