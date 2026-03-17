// server/middleware/auth.js
// Secure authentication middleware: hashing, sessions, guards

const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../config/database');

const SALT_ROUNDS = 12;
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// --------------- Password utilities ---------------

async function hashPassword(password) {
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  return bcrypt.hash(password, salt);
}

async function verifyPassword(plaintext, hash) {
  return bcrypt.compare(plaintext, hash);
}

// --------------- Session utilities ---------------

function generateSessionToken() {
  return crypto.randomBytes(64).toString('hex');
}

async function createSession(userId) {
  const sessionId = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.execute(
    'INSERT INTO sessions (session_id, user_id, expires_at) VALUES (?, ?, ?)',
    [sessionId, userId, expiresAt]
  );

  return { sessionId, expiresAt };
}

async function deleteSession(sessionId) {
  await db.execute('DELETE FROM sessions WHERE session_id = ?', [sessionId]);
}

async function deleteAllUserSessions(userId) {
  await db.execute('DELETE FROM sessions WHERE user_id = ?', [userId]);
}

// --------------- Cookie helper ---------------

function setSessionCookie(res, sessionId, expiresAt) {
  res.cookie('session_id', sessionId, {
    httpOnly: true,          // JS cannot access
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie('session_id', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

// --------------- Middleware ---------------

async function requireAuth(req, res, next) {
  try {
    const sessionId = req.cookies && req.cookies.session_id;

    if (!sessionId) {
      return res.status(401).json({ error: 'Not authenticated. Please log in.' });
    }

    const session = await db.getOne(
      'SELECT s.*, u.id AS uid, u.email, u.username, u.full_name, u.country, u.provider ' +
      'FROM sessions s JOIN users u ON s.user_id = u.id ' +
      'WHERE s.session_id = ? AND s.expires_at > NOW()',
      [sessionId]
    );

    if (!session) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    // Attach user info to request
    req.userId = session.user_id;
    req.user = {
      id: session.uid,
      email: session.email,
      username: session.username,
      fullName: session.full_name,
      country: session.country,
      provider: session.provider,
    };

    next();
  } catch (err) {
    console.error('[Auth] requireAuth error:', err);
    return res.status(500).json({ error: 'Authentication check failed.' });
  }
}

// Optional auth – attaches user if session exists, but doesn't block
async function optionalAuth(req, res, next) {
  try {
    const sessionId = req.cookies && req.cookies.session_id;
    if (sessionId) {
      const session = await db.getOne(
        'SELECT s.*, u.id AS uid, u.email, u.username, u.full_name ' +
        'FROM sessions s JOIN users u ON s.user_id = u.id ' +
        'WHERE s.session_id = ? AND s.expires_at > NOW()',
        [sessionId]
      );
      if (session) {
        req.userId = session.user_id;
        req.user = {
          id: session.uid,
          email: session.email,
          username: session.username,
          fullName: session.full_name,
        };
      }
    }
  } catch (_) { /* swallow */ }
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  createSession,
  deleteSession,
  deleteAllUserSessions,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  optionalAuth,
};
