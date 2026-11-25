'use strict';

const moment = require('moment');
const { SiteActivityLog } = require('./activity.models');
const { getGroupCollections } = require('../groups/group.models');
const { isSafeGroupId } = require('../../shared/group-id');

const TESBIHAT_VIEW_ACTION = 'tesbihat_görüntüleme';
/** Tefekkür sekmesinde ana listeden bir bölüm açıldığında (sekmenin kendi açılışı 'tefekkur_görüntüleme') */
const TEFEKKUR_SECTION_ACTION = 'tefekkur_bölüm_görüntüleme';
/** Makaleler sekmesinde bir kategori sayfası açıldığında (sekmenin kendi açılışı 'makaleler_görüntüleme') */
const ARTICLE_CATEGORY_ACTION = 'makaleler_kategori_görüntüleme';
/** Videolar sekmesinde bir bölüm (akış, izleme, shorts, kitaplık) açıldığında (sekmenin kendi açılışı 'videolar_görüntüleme') */
const VIDEO_SECTION_ACTION = 'videolar_bölüm_görüntüleme';
/** Tesbihat sekmesindeki .tesbihat-view[data-view] değerleri */
const ALLOWED_SITE_ACTIONS = new Set([
  'grup_görüntüleme',
  'ana_sayfa_görüntüleme',
  'grup_oluşturma',
  'grup_silme',
  TESBIHAT_VIEW_ACTION,
  'videolar_görüntüleme',
  'tefekkur_görüntüleme',
  TEFEKKUR_SECTION_ACTION,
  'makaleler_görüntüleme',
  ARTICLE_CATEGORY_ACTION,
  VIDEO_SECTION_ACTION
]);
const TESBIHAT_VIEWS = new Set(['home', 'location', 'types', 'reader']);
const TESBIHAT_VAKITS = new Set(['sabah', 'ogle', 'ikindi', 'aksam', 'yatsi']);
const TESBIHAT_TURS = new Set(['kisa', 'uzun', 'arapca-uzun']);
/** Tefekkür sekmesindeki .tefekkur-view[data-view] değerleri (ana liste 'home' kaydedilmez) */
const TEFEKKUR_VIEWS = new Set(['slider', 'zikirmatik', 'radio', 'ilahi']);
const TEFEKKUR_SECTIONS = new Set([
  'ayet', 'hadis', 'dua', 'risale', 'esma', 'zikirmatik', 'ilahi', 'kuran-radyo', 'risalet-radyo', 'kaydedilenler'
]);
const TEFEKKUR_MODES = new Set(['metin', 'resim']);
/** Makaleler sekmesindeki .articles-view[data-view] değeri (kategori listesi 'home' kaydedilmez) */
const ARTICLE_VIEWS = new Set(['category']);
/** public/fragments/articles.html içindeki kategori kartlarının data-slug değerleri; birebir aynı kalmalıdır. */
const ARTICLE_CATEGORY_SLUGS = new Set([
  'think-it', 'use-it', 'kader', 'allahin-varliginin-delilleri', 'sen-kimsin', 'islamda-adalet', 'hadisler',
  'ahiretin-varliginin-delilleri', 'kainat-rehberi', 'gayeli-ve-planli-yaratilis', 'temel-sorgulama', 'evrim'
]);

/** Videolar sekmesindeki bölüm değerleri (src/client/features/videos/videos-tab.js ile aynı kalmalıdır) */
const VIDEO_SECTIONS = new Set(['videolar', 'izle', 'shorts', 'hesabim']);

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

  async function logSiteActivity({ action, req, groupId, deviceInfo, actor, view, vakit, tur, section, mode }) {
    try {
      const normalizedAction = typeof action === 'string' ? action.trim() : '';
      // Tanımsız eylemler (ör. istemcinin gönderdiği serbest metinler) kaydedilmez.
      if (!ALLOWED_SITE_ACTIONS.has(normalizedAction)) return;

      const storedGroupId = isSafeGroupId(groupId) ? String(groupId) : null;
      const storedActor = actor || await resolveLogActor(req, storedGroupId);
      // Yalnızca tesbihat / tefekkür bölüm eyleminde ve bilinen değerlerle saklanır (serbest metin kabul edilmez).
      const activityDetails = {};
      if (normalizedAction === TESBIHAT_VIEW_ACTION && TESBIHAT_VIEWS.has(view)) {
        activityDetails.view = view;
        if (TESBIHAT_VAKITS.has(vakit)) activityDetails.vakit = vakit;
        if (TESBIHAT_TURS.has(tur)) activityDetails.tur = tur;
      }
      if (normalizedAction === TEFEKKUR_SECTION_ACTION && TEFEKKUR_VIEWS.has(view) && TEFEKKUR_SECTIONS.has(section)) {
        activityDetails.view = view;
        activityDetails.section = section;
        if (TEFEKKUR_MODES.has(mode)) activityDetails.mode = mode;
      }
      if (normalizedAction === ARTICLE_CATEGORY_ACTION && ARTICLE_VIEWS.has(view) && ARTICLE_CATEGORY_SLUGS.has(section)) {
        activityDetails.view = view;
        activityDetails.section = section;
      }
      if (normalizedAction === VIDEO_SECTION_ACTION && VIDEO_SECTIONS.has(section)) {
        activityDetails.section = section;
      }
      // Ayrıntısız bölüm/kategori kaydı anlamsızdır (aynı dakikadaki tüm kayıtlarla eşleşip tekrarı da bastırır).
      if ((normalizedAction === TEFEKKUR_SECTION_ACTION
        || normalizedAction === ARTICLE_CATEGORY_ACTION
        || normalizedAction === VIDEO_SECTION_ACTION)
        && !activityDetails.section) return;

      if (await hasLogInSameTurkeyMinute(SiteActivityLog, {
        groupId: storedGroupId,
        action: normalizedAction,
        ipAddress: storedActor,
        ...activityDetails
      })) {
        return;
      }

      const log = new SiteActivityLog({
        action: normalizedAction,
        timestamp: new Date(),
        deviceInfo: buildDeviceInfo(req, deviceInfo),
        ipAddress: storedActor,
        groupId: storedGroupId,
        ...activityDetails
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
  ARTICLE_CATEGORY_ACTION,
  ARTICLE_CATEGORY_SLUGS,
  VIDEO_SECTION_ACTION,
  VIDEO_SECTIONS,
  createActivityService
};
