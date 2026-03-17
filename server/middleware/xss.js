// server/middleware/xss.js
// XSS protection middleware – sanitizes all user input

const xss = require('xss');

const xssOptions = {
  whiteList: {},                    // Allow NO HTML tags
  stripIgnoreTag: true,             // Strip all unknown tags
  stripIgnoreTagBody: ['script', 'style', 'iframe', 'object', 'embed'],
};

function sanitizeValue(value) {
  if (typeof value === 'string') {
    return xss(value, xssOptions);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value !== null && typeof value === 'object') {
    const clean = {};
    for (const key of Object.keys(value)) {
      clean[key] = sanitizeValue(value[key]);
    }
    return clean;
  }
  return value; // numbers, booleans, null
}

function xssProtection(req, _res, next) {
  if (req.body) {
    req.body = sanitizeValue(req.body);
  }
  if (req.query) {
    req.query = sanitizeValue(req.query);
  }
  if (req.params) {
    req.params = sanitizeValue(req.params);
  }
  next();
}

module.exports = xssProtection;
