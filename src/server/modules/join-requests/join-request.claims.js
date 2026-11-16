'use strict';

const crypto = require('crypto');

function hasMatchingJoinClaimHash(joinRequest, storedHash) {
  if (!joinRequest.claimTokenHash || !/^[a-f0-9]{64}$/i.test(String(storedHash || ''))) return false;
  const actual = Buffer.from(String(storedHash), 'hex');
  const expected = Buffer.from(joinRequest.claimTokenHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function getSessionJoinClaim(req, requestId) {
  const id = String(requestId || '');
  if (!id || !req.session?.joinClaims || !Object.hasOwn(req.session.joinClaims, id)) {
    return null;
  }
  return req.session.joinClaims[id] || null;
}

function setSessionJoinClaim(req, requestId, claimToken) {
  const id = String(requestId || '');
  if (!id || !claimToken) throw new Error('Geçersiz katılma isteği oturum bilgisi');
  req.session.joinClaims ||= {};
  req.session.joinClaims[id] = crypto.createHash('sha256').update(String(claimToken)).digest('hex');
}

function clearSessionJoinClaim(req, requestId) {
  const id = String(requestId || '');
  if (!id || !req.session?.joinClaims) return;
  delete req.session.joinClaims[id];
  if (Object.keys(req.session.joinClaims).length === 0) delete req.session.joinClaims;
}

function verifyJoinRequestClaim(req, joinRequest) {
  const requestId = String(joinRequest?._id || '');
  const sessionClaimHash = getSessionJoinClaim(req, requestId);
  return hasMatchingJoinClaimHash(joinRequest, sessionClaimHash);
}



module.exports = {
  clearSessionJoinClaim,
  getSessionJoinClaim,
  setSessionJoinClaim,
  verifyJoinRequestClaim
};

