// server/app.js
// Main Express server – security, routes, static files, error handling

require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const db = require('./config/database');
const xssProtection = require('./middleware/xss');

const app = express();

// =============================================
// Security middleware
// =============================================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://www.google.com",
        "https://www.gstatic.com",
      ],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com",
      ],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      frameSrc: ["https://www.google.com"],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// =============================================
// Rate limiting
// =============================================
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,                   // stricter for auth endpoints
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait 15 minutes.' },
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// =============================================
// CORS
// =============================================
const FRONTEND_ORIGIN = process.env.FRONTEND_URL || 'http://localhost';
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (same-origin, curl, mobile apps)
    if (!origin) return callback(null, true);
    const allowed = [
      FRONTEND_ORIGIN,
      'http://localhost',
      'http://localhost:3000',
      'http://127.0.0.1',
      'http://127.0.0.1:3000',
    ];
    if (allowed.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// =============================================
// Body parsing + cookies
// =============================================
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// =============================================
// XSS sanitization on all incoming data
// =============================================
app.use(xssProtection);

// =============================================
// Serve static frontend files
// =============================================
const publicDir = path.join(__dirname, '..');
app.use(express.static(publicDir, {
  extensions: ['html'],
  index: 'homepage.html',
}));

// =============================================
// API routes
// =============================================
app.use('/api/auth', require('./routes/auth'));
app.use('/api/quiz', require('./routes/quiz'));

// =============================================
// Catch-all for SPA-like HTML navigation
// =============================================
app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'homepage.html'));
});

// =============================================
// 404 handler for API routes
// =============================================
app.use('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

// =============================================
// Global error handler
// =============================================
app.use((err, _req, res, _next) => {
  console.error('[Server] Unhandled error:', err.stack || err.message);
  res.status(err.status || 500).json({
    error: 'Internal server error.',
    ...(process.env.NODE_ENV === 'development' && { detail: err.message }),
  });
});

// =============================================
// Start server
// =============================================
const PORT = parseInt(process.env.PORT, 10) || 3000;

async function boot() {
  // Test DB connection
  const connected = await db.testConnection();
  if (!connected) {
    console.error('[Server] Cannot start – database connection failed.');
    process.exit(1);
  }

  // Initialize tables
  await db.initDatabase();

  // Cleanup expired sessions every 30 minutes
  setInterval(() => db.cleanupExpiredSessions(), 30 * 60 * 1000);

  app.listen(PORT, () => {
    console.log(`[Server] QuizMaster API running on http://localhost:${PORT}`);
    console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

boot().catch(err => {
  console.error('[Server] Boot failed:', err);
  process.exit(1);
});

module.exports = app;
