'use strict';

/*
 * Günlük çetele: her grubun tek takip biçimi.
 * - Alanlar UserGroup.ceteleFields içinde gruba özeldir. En az bir alan vardır;
 *   ilk açık alan "okuma alanı"dır (varsayılan "Kitap okuma"): lig, seri ve sıralama
 *   bu alana göre hesaplanır.
 * - Okuma alanının değeri readingstatuses_<groupId> içinde tutulur (değer > 0 → okudum
 *   + miktar, 0 → okumadım, boş → satır yok). Eski okuma kayıtları da buradadır.
 * - Diğer alanların değerleri cetele_<groupId> koleksiyonunda kişi + gün başına tek belgedir.
 */

const MAX_ACTIVE_FIELDS = 12;
const MAX_OPTIONS = 8;
const MAX_LABEL_LENGTH = 30;
const MAX_TEXT_LENGTH = 280;
const MAX_RANGE_DAYS = 400;
const DEFAULT_RANGE_DAYS = 35;
const MAX_NUMBER = 99999;
const VALID_UNITS = new Set(['sayfa', 'dakika', 'vakit', 'saat', 'adet', 'bab', '']);
const READ_FIELD_UNITS = new Set(['sayfa', 'dakika']);
const VALID_STEPS = new Set([1, 0.5, 0.25]);
const FIELD_KEY_PATTERN = /^[a-z][a-z0-9-]{1,23}$/;
const DEFAULT_READ_FIELD_KEY = 'kitap';
const MAX_ZERO_LABEL_LENGTH = 20;

function defaultReadField(unit = 'sayfa', key = DEFAULT_READ_FIELD_KEY) {
  return {
    key,
    label: 'Kitap okuma',
    type: 'sayi',
    unit: READ_FIELD_UNITS.has(unit) ? unit : 'sayfa',
    options: [5, 10, 20, 30, 50],
    step: 1,
    max: 9999,
    allowCustom: true,
    zeroLabel: '',
    required: false,
    archived: false
  };
}

function cloneField(field) {
  return {
    key: field.key,
    label: field.label,
    type: field.type,
    unit: field.unit || '',
    options: Array.isArray(field.options) ? [...field.options] : [],
    step: field.step,
    max: field.max,
    allowCustom: field.allowCustom !== false,
    zeroLabel: typeof field.zeroLabel === 'string' ? field.zeroLabel : '',
    required: field.required === true,
    archived: field.archived === true
  };
}

function defaultCeteleFields(unit = 'sayfa') {
  return [defaultReadField(unit)];
}

function isStepMultiple(value, step) {
  const ratio = value / step;
  return Math.abs(ratio - Math.round(ratio)) < 1e-9;
}

function activeFields(fields) {
  return fields.filter(field => !field.archived);
}

function findField(fields, key) {
  return fields.find(field => field.key === key) || null;
}

function isValidReadFieldDefinition(field) {
  return Boolean(field)
    && !field.archived
    && field.type === 'sayi'
    && READ_FIELD_UNITS.has(field.unit)
    && field.step === 1;
}

function uniqueKey(fields, base) {
  const used = new Set(fields.map(field => field.key));
  let key = base;
  let index = 2;
  while (used.has(key)) key = `${base}-${index++}`;
  return key;
}

// Gruptan istemciye gidecek, her zaman geçerli yapılandırma.
// Alan kaydı yoksa ya da ilk açık alan okuma alanı olamıyorsa başa "Kitap okuma" eklenir.
function getCeteleConfig(group) {
  const unit = group?.amountType === 'dakika' ? 'dakika' : 'sayfa';
  const fields = Array.isArray(group?.ceteleFields) ? group.ceteleFields.map(cloneField) : [];
  if (!isValidReadFieldDefinition(activeFields(fields)[0])) {
    fields.unshift(defaultReadField(unit, uniqueKey(fields, DEFAULT_READ_FIELD_KEY)));
  }
  return {
    fields,
    readField: activeFields(fields)[0].key
  };
}

function normalizeFieldInput(raw) {
  if (!raw || typeof raw !== 'object') return { error: 'Alışkanlık bilgisi geçersiz' };
  const key = String(raw.key || '').trim();
  if (!FIELD_KEY_PATTERN.test(key)) return { error: 'Alışkanlık anahtarı geçersiz' };
  const label = typeof raw.label === 'string' ? raw.label.trim().replace(/\s+/g, ' ') : '';
  if (!label || label.length > MAX_LABEL_LENGTH) {
    return { error: `Alışkanlık adı 1-${MAX_LABEL_LENGTH} karakter olmalıdır` };
  }
  const type = raw.type === 'metin' ? 'metin' : raw.type === 'sayi' ? 'sayi' : null;
  if (!type) return { error: `"${label}" alışkanlığının türü geçersiz` };
  const archived = raw.archived === true;
  const required = raw.required === true && !archived;

  if (type === 'metin') {
    return {
      field: { key, label, type, unit: '', options: [], step: 1, max: MAX_TEXT_LENGTH, allowCustom: true, zeroLabel: '', required, archived }
    };
  }

  const unit = typeof raw.unit === 'string' ? raw.unit : '';
  if (!VALID_UNITS.has(unit)) return { error: `"${label}" alışkanlığının birimi geçersiz` };
  const step = Number(raw.step ?? 1);
  if (!VALID_STEPS.has(step)) return { error: `"${label}" alışkanlığının adımı geçersiz` };
  const max = Number(raw.max ?? MAX_NUMBER);
  if (!Number.isFinite(max) || max < step || max > MAX_NUMBER || !isStepMultiple(max, step)) {
    return { error: `"${label}" alışkanlığının üst sınırı geçersiz` };
  }
  const options = Array.isArray(raw.options) ? raw.options.map(Number) : [];
  if (options.length > MAX_OPTIONS) return { error: `"${label}" alışkanlığında en çok ${MAX_OPTIONS} hızlı seçim olabilir` };
  if (options.some(option => !Number.isFinite(option) || option < 0 || option > max || !isStepMultiple(option, step))) {
    return { error: `"${label}" alışkanlığının hızlı seçimleri geçersiz` };
  }
  const uniqueOptions = [...new Set(options)].sort((a, b) => a - b);
  const allowCustom = raw.allowCustom !== false;
  // "Kılmadım" / "Yapmadım" gibi, kişinin o gün alışkanlığı yapmadığını bildirdiği isteğe bağlı seçenek (değer 0).
  const zeroLabel = typeof raw.zeroLabel === 'string' ? raw.zeroLabel.trim().replace(/\s+/g, ' ') : '';
  if (zeroLabel.length > MAX_ZERO_LABEL_LENGTH) {
    return { error: `"${label}" alışkanlığındaki "yapılmadı" seçeneği en çok ${MAX_ZERO_LABEL_LENGTH} karakter olabilir` };
  }
  if (!allowCustom && uniqueOptions.length === 0 && !zeroLabel) {
    return { error: `"${label}" alışkanlığında hızlı seçim ya da özel giriş olmalıdır` };
  }
  return {
    field: { key, label, type, unit, options: uniqueOptions, step, max, allowCustom, zeroLabel, required, archived }
  };
}

// Yöneticinin gönderdiği alan listesini doğrular. İlk alan okuma alanıdır ve kapatılamaz.
// Önceki alanlar silinmez; listede yoksa arşivlenmiş olarak korunur (geçmiş kayıtlar anlamını yitirmesin).
function validateCeteleFields(input, previousFields = []) {
  if (!Array.isArray(input) || input.length === 0) return { error: 'En az bir alışkanlık gerekli' };
  const fields = [];
  const keys = new Set();
  for (const raw of input) {
    const { field, error } = normalizeFieldInput(raw);
    if (error) return { error };
    if (keys.has(field.key)) return { error: 'Aynı anahtara sahip iki alışkanlık olamaz' };
    const previous = findField(previousFields, field.key);
    if (previous && previous.type !== field.type) {
      return { error: `"${field.label}" alışkanlığının türü sonradan değiştirilemez` };
    }
    keys.add(field.key);
    fields.push(field);
  }
  if (!isValidReadFieldDefinition(fields[0])) {
    return { error: 'İlk alışkanlık lig hesabında kullanılır: açık, sayfa ya da dakika birimli ve tam sayılı olmalıdır' };
  }
  previousFields.forEach(previous => {
    if (!keys.has(previous.key)) fields.push({ ...cloneField(previous), required: false, archived: true });
  });
  if (activeFields(fields).length > MAX_ACTIVE_FIELDS) {
    return { error: `En çok ${MAX_ACTIVE_FIELDS} açık alışkanlık olabilir` };
  }
  return { fields };
}

// Kayıt değerlerini alan tanımlarına göre temizler. Boş bırakılan alan kaydedilmez.
function sanitizeEntryValues(fields, values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    return { error: 'Çetele değerleri geçersiz' };
  }
  const result = {};
  for (const field of activeFields(fields)) {
    if (!Object.hasOwn(values, field.key)) continue;
    const raw = values[field.key];
    if (raw === null || raw === undefined || raw === '') continue;
    if (field.type === 'metin') {
      if (typeof raw !== 'string') return { error: `${field.label} metin olmalıdır` };
      const text = raw.trim();
      if (text.length > MAX_TEXT_LENGTH) return { error: `${field.label} en çok ${MAX_TEXT_LENGTH} karakter olabilir` };
      if (text) result[field.key] = text;
      continue;
    }
    const number = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(number) || number < 0 || number > field.max || !isStepMultiple(number, field.step)) {
      return { error: `${field.label} için geçersiz değer` };
    }
    const isZeroChoice = number === 0 && Boolean(field.zeroLabel);
    if (!field.allowCustom && !field.options.includes(number) && !isZeroChoice) {
      return { error: `${field.label} için hızlı seçimlerden biri seçilmelidir` };
    }
    result[field.key] = number;
  }
  return { values: result };
}

// Okuma alanının değerinden okuma satırını üretir. null: o gün için satır olmamalı.
function readingStatusForEntry(readField, values) {
  if (!readField || !values || !Object.hasOwn(values, readField)) return null;
  const value = Number(values[readField]);
  if (!Number.isFinite(value)) return null;
  if (value > 0) return { status: 'okudum', amount: Math.min(MAX_NUMBER, Math.round(value)) };
  return { status: 'okumadım', amount: null };
}

// Gün için en az bir değer varsa zorunlu alanların hepsi dolu olmalıdır.
// Boş gün (hiç değer yok) kayıt sayılmaz; temizlemek serbesttir.
// Okuma alanında 0 ("Okumadım") da dolu sayılır.
function missingRequiredFields(fields, hasValue) {
  const present = activeFields(fields).map(field => ({ field, filled: hasValue(field) }));
  if (!present.some(item => item.filled)) return [];
  return present.filter(item => item.field.required && !item.filled).map(item => item.field.label);
}

function parseRange(query, { isValidDate, todayKey, shiftDateKey }) {
  const to = query?.to ? String(query.to) : todayKey;
  const from = query?.from ? String(query.from) : shiftDateKey(to, -(DEFAULT_RANGE_DAYS - 1));
  if (!isValidDate(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return { error: 'Geçersiz tarih aralığı' };
  if (shiftDateKey(from, MAX_RANGE_DAYS) <= to) return { error: `Tarih aralığı en çok ${MAX_RANGE_DAYS} gün olabilir` };
  return { from, to };
}

function withoutKey(values, key) {
  const copy = { ...(values || {}) };
  delete copy[key];
  return copy;
}

function createCeteleService(dependencies) {
  const {
    UserGroup,
    activeUserQuery,
    getGroupCollections
  } = dependencies;

  function configFor(group) {
    return getCeteleConfig(group);
  }

  async function findActiveUser(groupId, userId) {
    const { users } = getGroupCollections(groupId);
    return users.findOne({ _id: userId, ...activeUserQuery() }).select('_id').lean();
  }

  async function syncReadingStatus(groupId, readField, userId, date, values) {
    const { readingStatuses } = getGroupCollections(groupId);
    const reading = readingStatusForEntry(readField, values);
    if (!reading) {
      await readingStatuses.deleteOne({ userId, date });
      return null;
    }
    const updatedAt = new Date();
    const update = reading.amount === null
      ? { $set: { userId, date, status: reading.status, updatedAt }, $unset: { amount: 1 } }
      : { $set: { userId, date, status: reading.status, amount: reading.amount, updatedAt } };
    await readingStatuses.updateOne({ userId, date }, update, { upsert: true });
    return reading;
  }

  // Yalnız gövdede yer alan alanlar güncellenir; null/boş gönderilen alan silinir,
  // gönderilmeyen alana dokunulmaz. Okuma alanı okuma satırına, diğerleri çetele belgesine yazılır.
  async function saveEntry({ group, userId, date, values }) {
    const config = configFor(group);
    const { values: cleanValues, error } = sanitizeEntryValues(config.fields, values);
    if (error) return { status: 400, error };
    if (!await findActiveUser(group.groupId, userId)) return { status: 404, error: 'Kullanıcı bulunamadı' };

    const { ceteleEntries, readingStatuses } = getGroupCollections(group.groupId);
    if (activeFields(config.fields).some(field => field.required)) {
      const existingEntry = await ceteleEntries.findOne({ userId, date }).select('values').lean();
      const existingReading = Object.hasOwn(values, config.readField)
        ? null
        : await readingStatuses.findOne({ userId, date }).select('status amount').lean();
      const missing = missingRequiredFields(config.fields, field => {
        if (Object.hasOwn(values, field.key)) return Object.hasOwn(cleanValues, field.key);
        if (field.key === config.readField) return Boolean(existingReading);
        return existingEntry?.values?.[field.key] !== undefined;
      });
      if (missing.length) {
        return {
          status: 400,
          code: 'REQUIRED_FIELDS_MISSING',
          error: `Zorunlu alışkanlıklar boş bırakılamaz: ${missing.join(', ')}`
        };
      }
    }
    const providedExtras = activeFields(config.fields)
      .filter(field => field.key !== config.readField && Object.hasOwn(values, field.key));
    let entry = await ceteleEntries.findOne({ userId, date }).select('values').lean();
    if (providedExtras.length) {
      const merged = withoutKey(entry?.values, config.readField);
      providedExtras.forEach(field => {
        if (Object.hasOwn(cleanValues, field.key)) merged[field.key] = cleanValues[field.key];
        else delete merged[field.key];
      });
      if (Object.keys(merged).length === 0) {
        await ceteleEntries.deleteOne({ userId, date });
        entry = null;
      } else {
        entry = await ceteleEntries.findOneAndUpdate(
          { userId, date },
          { $set: { userId, date, values: merged, updatedAt: new Date() } },
          { upsert: true, returnDocument: 'after', lean: true }
        );
      }
    }
    const touchesReading = Object.hasOwn(values, config.readField);
    const reading = touchesReading
      ? await syncReadingStatus(group.groupId, config.readField, userId, date, cleanValues)
      : undefined;
    const extraValues = withoutKey(entry?.values, config.readField);
    return {
      status: 200,
      entry: Object.keys(extraValues).length ? { userId, date, values: extraValues } : null,
      readingChanged: touchesReading,
      reading: reading || null
    };
  }

  async function deleteEntry({ group, userId, date }) {
    const config = configFor(group);
    const { ceteleEntries } = getGroupCollections(group.groupId);
    await ceteleEntries.deleteOne({ userId, date });
    await syncReadingStatus(group.groupId, config.readField, userId, date, {});
    return { status: 200 };
  }

  // Okuma alanı dışındaki değerler; gruptaki her üye hepsini görür. Okuma değerleri /api/all-data'dan gelir.
  async function listEntries({ group, from, to }) {
    const config = configFor(group);
    const { ceteleEntries } = getGroupCollections(group.groupId);
    const entries = await ceteleEntries.find({ date: { $gte: from, $lte: to } })
      .select('userId date values')
      .sort({ date: 1 })
      .lean();
    return {
      config,
      from,
      to,
      entries: entries
        .map(entry => ({ ...entry, values: withoutKey(entry.values, config.readField) }))
        .filter(entry => Object.keys(entry.values).length > 0)
        .map(entry => ({ userId: String(entry.userId), date: entry.date, values: entry.values }))
    };
  }

  // Alanlar. Grubun okuma birimi (amountType) ilk alanın birimine eşitlenir.
  async function updateConfig({ group, body }) {
    const config = configFor(group);
    const update = {};
    let fields = config.fields;
    if (body.fields !== undefined) {
      const result = validateCeteleFields(body.fields, config.fields);
      if (result.error) return { status: 400, error: result.error };
      fields = result.fields;
      update.ceteleFields = fields;
      update.amountType = activeFields(fields)[0].unit;
    }
    if (Object.keys(update).length === 0) return { status: 400, error: 'Değişiklik yok' };

    const updatedGroup = await UserGroup.findOneAndUpdate(
      { groupId: group.groupId },
      { $set: update },
      { returnDocument: 'after' }
    ).lean();
    if (!updatedGroup) return { status: 404, error: 'Grup bulunamadı' };
    return { status: 200, group: updatedGroup, config: configFor(updatedGroup) };
  }

  return {
    ceteleService: {
      configFor,
      deleteEntry,
      listEntries,
      saveEntry,
      updateConfig
    }
  };
}

module.exports = {
  DEFAULT_READ_FIELD_KEY,
  MAX_ACTIVE_FIELDS,
  MAX_RANGE_DAYS,
  createCeteleService,
  defaultCeteleFields,
  defaultReadField,
  getCeteleConfig,
  isValidReadFieldDefinition,
  missingRequiredFields,
  parseRange,
  readingStatusForEntry,
  sanitizeEntryValues,
  validateCeteleFields
};
