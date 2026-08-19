const EventEmitter = require('events');
const ActivityLog = require('../models/ActivityLog');

const sseEmitter = new EventEmitter();

/**
 * Parses browser, OS, and device type from User-Agent header.
 */
const parseUserAgent = (uaString) => {
  const ua = uaString || '';
  let browser = 'Unknown Browser';
  let os = 'Unknown OS';
  let device = 'Desktop';

  if (/mobile/i.test(ua)) {
    device = 'Mobile';
  } else if (/tablet|ipad/i.test(ua)) {
    device = 'Tablet';
  }

  if (/chrome|crios/i.test(ua) && !/edge|edg|opr|opera|opios/i.test(ua)) {
    browser = 'Chrome';
  } else if (/safari/i.test(ua) && !/chrome|crios|edge|edg|opr|opera|opios/i.test(ua)) {
    browser = 'Safari';
  } else if (/firefox|fxios/i.test(ua)) {
    browser = 'Firefox';
  } else if (/edge|edg/i.test(ua)) {
    browser = 'Edge';
  } else if (/opr|opera/i.test(ua)) {
    browser = 'Opera';
  } else if (/msie|trident/i.test(ua)) {
    browser = 'Internet Explorer';
  }

  if (/windows/i.test(ua)) {
    os = 'Windows';
  } else if (/macintosh|mac os x/i.test(ua) && !/iphone|ipad|ipod/i.test(ua)) {
    os = 'macOS';
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    os = 'iOS';
  } else if (/android/i.test(ua)) {
    os = 'Android';
  } else if (/linux/i.test(ua)) {
    os = 'Linux';
  }

  return { browser, operatingSystem: os, device };
};

/**
 * Computes difference between old and new state, returning sanitized key-value updates.
 */
const diffObjects = (oldData, newData) => {
  if (!oldData && !newData) return { oldValue: null, newValue: null, changedFields: [] };
  
  const ignoreFields = ['createdAt', 'updatedAt', 'password', 'salt', 'token', 'aadhaarFront', 'aadhaarBack', 'guestPhoto', 'signature'];
  const diffOld = {};
  const diffNew = {};
  const changedFields = [];

  const sanitizeValue = (val) => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  // Convert Sequelize model instances to plain objects if needed
  const oldObj = oldData && typeof oldData.toJSON === 'function' ? oldData.toJSON() : oldData;
  const newObj = newData && typeof newData.toJSON === 'function' ? newData.toJSON() : newData;

  const keys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);

  keys.forEach(key => {
    if (ignoreFields.includes(key)) return;
    const oldVal = oldObj ? oldObj[key] : undefined;
    const newVal = newObj ? newObj[key] : undefined;

    if (sanitizeValue(oldVal) !== sanitizeValue(newVal)) {
      if (oldObj && oldVal !== undefined) diffOld[key] = oldVal;
      if (newObj && newVal !== undefined) diffNew[key] = newVal;
      changedFields.push(key);
    }
  });

  return {
    oldValue: Object.keys(diffOld).length > 0 ? diffOld : null,
    newValue: Object.keys(diffNew).length > 0 ? diffNew : null,
    changedFields: changedFields.length > 0 ? changedFields : []
  };
};

/**
 * Automatically records a user action into the database and triggers real-time SSE.
 */
const logActivity = async ({
  req,
  hotelId,
  branchId = null,
  moduleName,
  action,
  entityType,
  entityId = null,
  entityName = null,
  description,
  oldValue = null,
  newValue = null,
  success = true,
  failureReason = null,
  status = 'success'
}) => {
  try {
    const today = new Date();
    // Enforce IST values
    const dateStr = today.toLocaleDateString('en-GB').split('/').reverse().join('-'); // YYYY-MM-DD
    const timeStr = today.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    // Client connection info
    const ipAddress = req ? (req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || '127.0.0.1').split(',')[0].trim() : '127.0.0.1';
    const uaInfo = req ? parseUserAgent(req.headers['user-agent']) : { browser: 'System', operatingSystem: 'System', device: 'Server' };

    // Performed by user details
    const performedByUserId = req && req.user ? req.user.id : null;
    const performedByName = req && req.user ? (req.user.name || req.user.username) : 'System';
    const performedByRole = req && req.user ? req.user.role : 'System';
    const finalHotelId = hotelId || (req && req.user ? req.user.hotelId : null);

    // Compute diffs if oldValue or newValue is supplied
    let computedDiff = { oldValue, newValue, changedFields: [] };
    if (oldValue || newValue) {
      computedDiff = diffObjects(oldValue, newValue);
    }

    const logEntry = await ActivityLog.create({
      hotelId: finalHotelId,
      branchId,
      moduleName,
      action,
      entityType,
      entityId: entityId ? String(entityId) : null,
      entityName,
      description,
      oldValue: computedDiff.oldValue,
      newValue: computedDiff.newValue,
      changedFields: computedDiff.changedFields,
      performedByUserId,
      performedByName,
      performedByRole,
      date: dateStr,
      time: timeStr,
      timezone: 'Asia/Kolkata',
      ipAddress,
      device: uaInfo.device,
      browser: uaInfo.browser,
      operatingSystem: uaInfo.operatingSystem,
      requestMethod: req ? req.method : 'SYSTEM',
      requestURL: req ? req.originalUrl : 'SYSTEM',
      status: success ? 'success' : 'failed',
      success,
      failureReason,
      sessionId: req && req.headers && req.headers['authorization'] ? String(req.headers['authorization']).substring(0, 255) : null,
      // Geolocation fallbacks (can be integrated with headers or GeoIP in future)
      latitude: req && req.headers['x-latitude'] ? String(req.headers['x-latitude']) : null,
      longitude: req && req.headers['x-longitude'] ? String(req.headers['x-longitude']) : null,
      city: req && req.headers['x-city'] ? String(req.headers['x-city']) : null,
      country: req && req.headers['x-country'] ? String(req.headers['x-country']) : null
    });

    // Notify listeners via Server-Sent Events (SSE)
    sseEmitter.emit('new-log', logEntry.toJSON());

    return logEntry;
  } catch (err) {
    console.error('Failed to write audit activity log:', err);
  }
};

module.exports = {
  logActivity,
  diffObjects,
  sseEmitter
};
