// server/routes/auth.js
// Authentication API endpoints: register, login, logout, me

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const {
  hashPassword,
  verifyPassword,
  createSession,
  deleteSession,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
} = require('../middleware/auth');

// ---------- Input validation helpers ----------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;
const DISPOSABLE_DOMAINS = [
  'mailinator.com', '10minutemail.com', 'temp-mail.org',
  'guerrillamail.com', 'sharklasers.com', 'trashmail.com',
  'yopmail.com', 'fakeinbox.com',
];
const PASS_MIN_LENGTH = 12;

function validateEmail(email) {
  if (!email) return 'Email is required.';
  if (!EMAIL_RE.test(email)) return 'Please enter a valid email address.';
  const domain = email.split('@')[1].toLowerCase();
  if (DISPOSABLE_DOMAINS.includes(domain)) return 'Disposable email addresses are not allowed.';
  return null;
}

function validateUsername(username) {
  if (!username) return 'Username is required.';
  if (!USERNAME_RE.test(username)) return 'Username must be 3–30 characters (letters, numbers, underscores).';
  return null;
}

function validatePassword(password) {
  if (!password) return 'Password is required.';
  if (password.length < PASS_MIN_LENGTH) return `Password must be at least ${PASS_MIN_LENGTH} characters.`;
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return 'Password must contain at least one special character.';
  return null;
}

// =============================================
// POST /api/auth/register
// =============================================
router.post('/register', async (req, res) => {
  try {
    const { email, username, password, fullName, country } = req.body;

    // --- Validate ---
    const emailErr = validateEmail(email);
    if (emailErr) return res.status(400).json({ error: emailErr });

    const usernameErr = validateUsername(username);
    if (usernameErr) return res.status(400).json({ error: usernameErr });

    const passErr = validatePassword(password);
    if (passErr) return res.status(400).json({ error: passErr });

    if (!fullName || fullName.trim().length < 1) {
      return res.status(400).json({ error: 'Full name is required.' });
    }

    // --- Check duplicates ---
    const existingEmail = await db.getOne(
      'SELECT id FROM users WHERE email = ?',
      [email.toLowerCase().trim()]
    );
    if (existingEmail) {
      return res.status(409).json({ error: 'This email is already registered.' });
    }

    const existingUsername = await db.getOne(
      'SELECT id FROM users WHERE username = ?',
      [username.trim()]
    );
    if (existingUsername) {
      return res.status(409).json({ error: 'This username is already taken.' });
    }

    // --- Hash password ---
    const passwordHash = await hashPassword(password);

    // --- Insert user ---
    const result = await db.execute(
      'INSERT INTO users (email, username, password_hash, full_name, country) VALUES (?, ?, ?, ?, ?)',
      [
        email.toLowerCase().trim(),
        username.trim(),
        passwordHash,
        fullName.trim(),
        country || 'Philippines',
      ]
    );

    const userId = result.insertId;

    // --- Initialize user stats ---
    await db.execute(
      'INSERT INTO user_stats (user_id) VALUES (?)',
      [userId]
    );

    // --- Create session ---
    const { sessionId, expiresAt } = await createSession(userId);
    setSessionCookie(res, sessionId, expiresAt);

    // --- Update last login ---
    await db.execute('UPDATE users SET last_login = NOW() WHERE id = ?', [userId]);

    return res.status(201).json({
      message: 'Account created successfully!',
      user: {
        id: userId,
        email: email.toLowerCase().trim(),
        username: username.trim(),
        fullName: fullName.trim(),
        country: country || 'Philippines',
      },
    });
  } catch (err) {
    console.error('[Auth] Register error:', err);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// =============================================
// POST /api/auth/login
// =============================================
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier) {
      return res.status(400).json({ error: 'Please enter your username or email.' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Please enter your password.' });
    }

    // --- Find user by email or username ---
    const user = await db.getOne(
      'SELECT * FROM users WHERE email = ? OR username = ?',
      [identifier.toLowerCase().trim(), identifier.trim()]
    );

    if (!user) {
      return res.status(401).json({ error: 'No account found with that username or email.' });
    }

    // --- Verify password ---
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    // --- Create session ---
    const { sessionId, expiresAt } = await createSession(user.id);
    setSessionCookie(res, sessionId, expiresAt);

    // --- Update last login ---
    await db.execute('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

    return res.json({
      message: 'Login successful!',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.full_name,
        country: user.country,
      },
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// =============================================
// POST /api/auth/logout
// =============================================
router.post('/logout', requireAuth, async (req, res) => {
  try {
    const sessionId = req.cookies.session_id;
    await deleteSession(sessionId);
    clearSessionCookie(res);
    return res.json({ message: 'Logged out successfully.' });
  } catch (err) {
    console.error('[Auth] Logout error:', err);
    return res.status(500).json({ error: 'Logout failed.' });
  }
});

// =============================================
// GET /api/auth/me
// =============================================
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await db.getOne(
      'SELECT id, email, username, full_name, country, provider, created_at, last_login FROM users WHERE id = ?',
      [req.userId]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.full_name,
        country: user.country,
        provider: user.provider,
        createdAt: user.created_at,
        lastLogin: user.last_login,
      },
    });
  } catch (err) {
    console.error('[Auth] /me error:', err);
    return res.status(500).json({ error: 'Failed to fetch user data.' });
  }
});

module.exports = router;
