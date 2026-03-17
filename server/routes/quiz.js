// server/routes/quiz.js
// Quiz API endpoints: submit, history, stats, leaderboard, reviews

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireAuth, optionalAuth } = require('../middleware/auth');

// =============================================
// POST /api/quiz/submit
// =============================================
router.post('/submit', requireAuth, async (req, res) => {
  try {
    const { strand, subject, mode, score, totalQuestions, timeTaken } = req.body;

    // --- Validate ---
    if (!strand || typeof strand !== 'string') {
      return res.status(400).json({ error: 'Strand is required.' });
    }
    if (!subject || typeof subject !== 'string') {
      return res.status(400).json({ error: 'Subject is required.' });
    }
    if (typeof score !== 'number' || score < 0) {
      return res.status(400).json({ error: 'Valid score is required.' });
    }
    if (typeof totalQuestions !== 'number' || totalQuestions < 1) {
      return res.status(400).json({ error: 'Total questions must be at least 1.' });
    }
    if (score > totalQuestions) {
      return res.status(400).json({ error: 'Score cannot exceed total questions.' });
    }
    if (typeof timeTaken !== 'number' || timeTaken < 0) {
      return res.status(400).json({ error: 'Valid time taken is required.' });
    }

    const percentage = parseFloat(((score / totalQuestions) * 100).toFixed(2));
    const userId = req.userId;

    // --- Save quiz result ---
    const result = await db.execute(
      `INSERT INTO quiz_results (user_id, strand, subject, mode, score, total_questions, percentage, time_taken)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, strand, subject, mode || 'Start Quiz', score, totalQuestions, percentage, timeTaken]
    );

    // --- Update user stats ---
    await updateUserStats(userId);

    return res.status(201).json({
      message: 'Quiz result saved!',
      result: {
        id: result.insertId,
        strand,
        subject,
        mode: mode || 'Start Quiz',
        score,
        totalQuestions,
        percentage,
        timeTaken,
      },
    });
  } catch (err) {
    console.error('[Quiz] Submit error:', err);
    return res.status(500).json({ error: 'Failed to save quiz result.' });
  }
});

// =============================================
// GET /api/quiz/history
// =============================================
router.get('/history', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;

    const results = await db.query(
      `SELECT id, strand, subject, mode, score, total_questions, percentage, time_taken, completed_at
       FROM quiz_results
       WHERE user_id = ?
       ORDER BY completed_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );

    const countRow = await db.getOne(
      'SELECT COUNT(*) AS total FROM quiz_results WHERE user_id = ?',
      [userId]
    );

    return res.json({
      results,
      total: countRow.total,
      limit,
      offset,
    });
  } catch (err) {
    console.error('[Quiz] History error:', err);
    return res.status(500).json({ error: 'Failed to load quiz history.' });
  }
});

// =============================================
// GET /api/quiz/stats
// =============================================
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;

    // Basic stats
    const stats = await db.getOne(
      'SELECT * FROM user_stats WHERE user_id = ?',
      [userId]
    );

    // Performance by subject (for bar chart)
    const subjectPerformance = await db.query(
      `SELECT subject, ROUND(AVG(percentage), 1) AS avg_score, COUNT(*) AS quiz_count
       FROM quiz_results
       WHERE user_id = ?
       GROUP BY subject
       ORDER BY avg_score DESC`,
      [userId]
    );

    // Weekly activity (for line chart) – quizzes per day for the last 7 days
    const weeklyActivity = await db.query(
      `SELECT DATE(completed_at) AS quiz_date, COUNT(*) AS quiz_count
       FROM quiz_results
       WHERE user_id = ? AND completed_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
       GROUP BY DATE(completed_at)
       ORDER BY quiz_date ASC`,
      [userId]
    );

    // Recent assessments
    const recentAssessments = await db.query(
      `SELECT strand, subject, mode, score, total_questions, percentage, time_taken, completed_at
       FROM quiz_results
       WHERE user_id = ?
       ORDER BY completed_at DESC
       LIMIT 10`,
      [userId]
    );

    // Leaderboard rank
    const rankRow = await db.getOne(
      `SELECT COUNT(*) + 1 AS user_rank
       FROM user_stats
       WHERE average_score > (SELECT COALESCE(average_score, 0) FROM user_stats WHERE user_id = ?)`,
      [userId]
    );

    return res.json({
      totalQuizzes: stats ? stats.total_quizzes : 0,
      dayStreak: stats ? stats.day_streak : 0,
      averageScore: stats ? parseFloat(stats.average_score) : 0,
      totalScore: stats ? stats.total_score : 0,
      leaderboardRank: rankRow ? rankRow.user_rank : 0,
      lastQuizDate: stats ? stats.last_quiz_date : null,
      subjectPerformance,
      weeklyActivity,
      recentAssessments,
    });
  } catch (err) {
    console.error('[Quiz] Stats error:', err);
    return res.status(500).json({ error: 'Failed to load statistics.' });
  }
});

// =============================================
// GET /api/quiz/leaderboard
// =============================================
router.get('/leaderboard', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const sortBy = req.query.sort || 'score'; // score | streak | name

    let orderClause;
    switch (sortBy) {
      case 'streak':
        orderClause = 'us.day_streak DESC, us.average_score DESC';
        break;
      case 'name':
        orderClause = 'u.full_name ASC';
        break;
      default:
        orderClause = 'us.average_score DESC, us.total_quizzes DESC';
        break;
    }

    const players = await db.query(
      `SELECT
         u.id, u.username, u.full_name,
         us.total_quizzes, us.day_streak, us.average_score, us.total_score
       FROM users u
       JOIN user_stats us ON u.id = us.user_id
       WHERE us.total_quizzes > 0
       ORDER BY ${orderClause}
       LIMIT ?`,
      [limit]
    );

    return res.json({ players });
  } catch (err) {
    console.error('[Quiz] Leaderboard error:', err);
    return res.status(500).json({ error: 'Failed to load leaderboard.' });
  }
});

// =============================================
// POST /api/quiz/review  (submit a site review)
// =============================================
router.post('/review', requireAuth, async (req, res) => {
  try {
    const { text, stars, role } = req.body;

    if (!text || text.trim().length < 10) {
      return res.status(400).json({ error: 'Review must be at least 10 characters.' });
    }
    if (!stars || stars < 1 || stars > 5) {
      return res.status(400).json({ error: 'Please select a star rating (1-5).' });
    }

    await db.execute(
      'INSERT INTO reviews (user_id, username, role, text, stars) VALUES (?, ?, ?, ?, ?)',
      [req.userId, req.user.username, role || 'QuizMaster Learner', text.trim(), stars]
    );

    return res.status(201).json({ message: 'Review submitted. Thank you!' });
  } catch (err) {
    console.error('[Quiz] Review error:', err);
    return res.status(500).json({ error: 'Failed to submit review.' });
  }
});

// =============================================
// GET /api/quiz/reviews  (get all reviews)
// =============================================
router.get('/reviews', async (req, res) => {
  try {
    const reviews = await db.query(
      'SELECT username, role, text, stars, created_at FROM reviews ORDER BY created_at DESC LIMIT 50'
    );
    return res.json({ reviews });
  } catch (err) {
    console.error('[Quiz] Reviews error:', err);
    return res.status(500).json({ error: 'Failed to load reviews.' });
  }
});

// =============================================
// Helper: recalculate user_stats after a quiz
// =============================================
async function updateUserStats(userId) {
  const aggregate = await db.getOne(
    `SELECT
       COUNT(*) AS total_quizzes,
       ROUND(AVG(percentage), 2) AS average_score,
       SUM(score) AS total_score,
       MAX(DATE(completed_at)) AS last_quiz_date
     FROM quiz_results
     WHERE user_id = ?`,
    [userId]
  );

  // Calculate streak
  let dayStreak = 1;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const quizDates = await db.query(
    `SELECT DISTINCT DATE(completed_at) AS quiz_date
     FROM quiz_results
     WHERE user_id = ?
     ORDER BY quiz_date DESC`,
    [userId]
  );

  if (quizDates.length > 0) {
    for (let i = 1; i < quizDates.length; i++) {
      const current = new Date(quizDates[i - 1].quiz_date);
      const previous = new Date(quizDates[i].quiz_date);
      const diffDays = Math.round((current - previous) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        dayStreak++;
      } else {
        break;
      }
    }
  }

  // Upsert user_stats
  await db.execute(
    `INSERT INTO user_stats (user_id, total_quizzes, day_streak, last_quiz_date, average_score, total_score)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       total_quizzes = VALUES(total_quizzes),
       day_streak = VALUES(day_streak),
       last_quiz_date = VALUES(last_quiz_date),
       average_score = VALUES(average_score),
       total_score = VALUES(total_score)`,
    [
      userId,
      aggregate.total_quizzes,
      dayStreak,
      aggregate.last_quiz_date,
      aggregate.average_score || 0,
      aggregate.total_score || 0,
    ]
  );
}

module.exports = router;
