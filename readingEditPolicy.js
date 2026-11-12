const READING_EDIT_POLICY_ALL = 'all';
const READING_EDIT_POLICY_TODAY = 'today';
const READING_EDIT_POLICY_TODAY_YESTERDAY = 'today_yesterday';

const VALID_READING_EDIT_POLICIES = new Set([
  READING_EDIT_POLICY_ALL,
  READING_EDIT_POLICY_TODAY,
  READING_EDIT_POLICY_TODAY_YESTERDAY
]);

function normalizeReadingEditPolicy(value) {
  return VALID_READING_EDIT_POLICIES.has(value) ? value : READING_EDIT_POLICY_ALL;
}

function isReadingDateAllowedByPolicy(dateKey, policy, todayKey, yesterdayKey) {
  if (dateKey > todayKey) return false;
  const normalizedPolicy = normalizeReadingEditPolicy(policy);
  if (normalizedPolicy === READING_EDIT_POLICY_TODAY) return dateKey === todayKey;
  if (normalizedPolicy === READING_EDIT_POLICY_TODAY_YESTERDAY) {
    return dateKey === todayKey || dateKey === yesterdayKey;
  }
  return true;
}

module.exports = {
  READING_EDIT_POLICY_ALL,
  VALID_READING_EDIT_POLICIES,
  normalizeReadingEditPolicy,
  isReadingDateAllowedByPolicy
};
