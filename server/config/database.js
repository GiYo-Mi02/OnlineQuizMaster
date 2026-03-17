// server/config/database.js
// MySQL database connection with connection pooling

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'quizmaster',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  // Timeout settings
  connectTimeout: 10000,
  // Timezone
  timezone: '+00:00',
});

// Helper: run a query and return rows
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// Helper: run a query and return the result metadata (insertId, affectedRows, etc.)
async function execute(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}

// Helper: get a single row
async function getOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

// Helper: run a transaction
async function transaction(callback) {
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  try {
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// Initialize database – create tables if they don't exist
async function initDatabase() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      username VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      country VARCHAR(100) DEFAULT 'Philippines',
      provider VARCHAR(50) DEFAULT 'local',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP NULL,
      INDEX idx_email (email),
      INDEX idx_username (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS quiz_results (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      strand VARCHAR(50) NOT NULL,
      subject VARCHAR(100) NOT NULL,
      mode VARCHAR(50) DEFAULT 'Start Quiz',
      score INT NOT NULL,
      total_questions INT NOT NULL,
      percentage DECIMAL(5,2) NOT NULL,
      time_taken INT NOT NULL,
      completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user (user_id),
      INDEX idx_strand (strand),
      INDEX idx_completed (completed_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS user_stats (
      user_id INT PRIMARY KEY,
      total_quizzes INT DEFAULT 0,
      day_streak INT DEFAULT 0,
      last_quiz_date DATE NULL,
      average_score DECIMAL(5,2) DEFAULT 0,
      total_score INT DEFAULT 0,
      leaderboard_rank INT DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS sessions (
      session_id VARCHAR(128) PRIMARY KEY,
      user_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_expires (expires_at),
      INDEX idx_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS reviews (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      username VARCHAR(100) NOT NULL,
      role VARCHAR(100) DEFAULT 'QuizMaster Learner',
      text TEXT NOT NULL,
      stars INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS uploaded_documents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      stored_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(120) NOT NULL,
      file_size INT NOT NULL,
      extracted_text LONGTEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_uploaded_user (user_id),
      INDEX idx_uploaded_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS ai_generated_quizzes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      mode VARCHAR(50) NOT NULL,
      difficulty VARCHAR(50) NOT NULL,
      question_count INT NOT NULL,
      source_document_ids JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_ai_quiz_user (user_id),
      INDEX idx_ai_quiz_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS ai_generated_questions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      quiz_id INT NOT NULL,
      question_order INT NOT NULL,
      question_text TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      option_d TEXT NOT NULL,
      correct_option TINYINT NOT NULL,
      explanation TEXT,
      difficulty VARCHAR(20) DEFAULT 'medium',
      FOREIGN KEY (quiz_id) REFERENCES ai_generated_quizzes(id) ON DELETE CASCADE,
      INDEX idx_ai_q_quiz (quiz_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  ];

  for (const sql of statements) {
    await pool.execute(sql);
  }
  console.log('[DB] All tables verified / created.');
}

// Test connection
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('[DB] MySQL connected successfully.');
    connection.release();
    return true;
  } catch (err) {
    console.error('[DB] MySQL connection failed:', err.message);
    return false;
  }
}

// Cleanup expired sessions (call periodically)
async function cleanupExpiredSessions() {
  const result = await execute('DELETE FROM sessions WHERE expires_at < NOW()');
  if (result.affectedRows > 0) {
    console.log(`[DB] Cleaned up ${result.affectedRows} expired sessions.`);
  }
}

module.exports = {
  pool,
  query,
  execute,
  getOne,
  transaction,
  initDatabase,
  testConnection,
  cleanupExpiredSessions,
};
