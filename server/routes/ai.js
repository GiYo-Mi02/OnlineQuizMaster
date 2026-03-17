const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const MAX_DOCUMENTS = 20;
const MAX_QUESTIONS = 30;
const MAX_TEXT_CHARS = 120000;
const DEFAULT_MODEL_CANDIDATES = [
  'gemini-2.0-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash',
  'gemini-1.5-pro-latest',
  'gemini-1.5-pro',
];

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = String(file.originalname || 'doc').replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: {
    files: MAX_DOCUMENTS,
    fileSize: 10 * 1024 * 1024,
  },
});

function isAllowedDocument(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();

  if (ext === '.pdf' || mime === 'application/pdf') return true;
  if (ext === '.docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return true;
  if (ext === '.txt' || mime === 'text/plain') return true;
  return false;
}

async function extractTextFromDocument(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ext === '.pdf') {
    const buffer = fs.readFileSync(file.path);
    const data = await pdfParse(buffer);
    return String(data.text || '').trim();
  }
  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: file.path });
    return String(result.value || '').trim();
  }
  if (ext === '.txt') {
    return String(fs.readFileSync(file.path, 'utf8') || '').trim();
  }
  throw new Error('Only PDF, DOCX, and TXT documents are supported.');
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error('Failed to parse Gemini response as JSON.');
  }
}

function normalizeModelName(name) {
  return String(name || '').trim().replace(/^models\//, '');
}

function isModelNotFoundError(err) {
  const msg = String((err && err.message) || '').toLowerCase();
  return (err && err.status === 404) || (msg.includes('not found') && msg.includes('model'));
}

function isRetryableModelError(err) {
  const msg = String((err && err.message) || '').toLowerCase();
  return (
    isModelNotFoundError(err) ||
    (err && (err.status === 429 || err.status === 403)) ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('permission') ||
    msg.includes('access')
  );
}

function isQuotaError(err) {
  const msg = String((err && err.message) || '').toLowerCase();
  return (err && err.status === 429) || msg.includes('quota') || msg.includes('rate limit') || msg.includes('too many requests');
}

function splitSentences(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 40 && s.length <= 260);
}

function shuffle(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildLocalFallbackQuiz(params) {
  const allSentences = splitSentences(params.contextText);
  if (!allSentences.length) {
    throw new Error('Unable to generate fallback quiz: no usable text extracted from documents.');
  }

  const pool = shuffle(Array.from(new Set(allSentences)));
  const target = Math.min(Math.max(params.maxQuestions || 15, 5), MAX_QUESTIONS, pool.length);
  const picked = pool.slice(0, target);

  const questions = picked.map((s, idx) => {
    const distractorPool = shuffle(pool.filter((x) => x !== s)).slice(0, 3);
    while (distractorPool.length < 3) {
      distractorPool.push('This statement is not supported by the uploaded modules.');
    }

    const choices = [s].concat(distractorPool);
    const shuffledChoices = shuffle(choices);
    const answerIndex = shuffledChoices.indexOf(s);

    return {
      question: `Based on the uploaded modules, which statement is correct? (${idx + 1})`,
      choices: shuffledChoices,
      answerIndex,
      explanation: 'This question was generated from your uploaded document text because Gemini quota is currently unavailable.',
      difficulty: 'medium',
    };
  });

  return {
    title: `${params.mode} • Document-Based Quiz`,
    questions,
    generatedBy: 'fallback',
  };
}

async function fetchAvailableGenerateModels(apiKey) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      return [];
    }
    const data = await resp.json();
    const models = Array.isArray(data.models) ? data.models : [];
    return models
      .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => normalizeModelName(m.name))
      .filter((m) => m.toLowerCase().includes('gemini'));
  } catch (_) {
    return [];
  }
}

async function buildModelCandidates(apiKey) {
  const preferred = normalizeModelName(process.env.GEMINI_MODEL);
  const envFallbacks = String(process.env.GEMINI_MODEL_FALLBACKS || '')
    .split(',')
    .map((m) => normalizeModelName(m))
    .filter(Boolean);
  const discovered = await fetchAvailableGenerateModels(apiKey);

  const all = [];
  if (preferred) all.push(preferred);
  all.push(...envFallbacks);
  all.push(...DEFAULT_MODEL_CANDIDATES);
  all.push(...discovered);

  const seen = new Set();
  return all.filter((m) => {
    if (!m) return false;
    const key = m.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function generateQuizWithGemini(params) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing in environment variables.');
  }

  const client = new GoogleGenerativeAI(apiKey);
  const modelCandidates = await buildModelCandidates(apiKey);
  if (!modelCandidates.length) {
    throw new Error('No Gemini models are available for generateContent on this API key.');
  }

  const prompt = [
    'You are an expert teacher. Generate a medium-to-difficult quiz from the given module texts.',
    `Mode: ${params.mode}`,
    `Question count: ${params.maxQuestions}`,
    'Return ONLY valid JSON object with this exact shape:',
    '{"title":"string","questions":[{"question":"string","choices":["A","B","C","D"],"answerIndex":0,"explanation":"string","difficulty":"medium|difficult"}]}',
    'Rules:',
    '- Exactly 4 choices per question.',
    '- answerIndex must be 0 to 3.',
    '- Questions must be medium or difficult only.',
    '- No markdown code fences.',
    '',
    'Module texts:',
    params.contextText,
  ].join('\n');

  let text = '';
  let lastError = null;
  const failures = [];
  for (const modelName of modelCandidates) {
    try {
      const model = client.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      text = result.response.text();
      break;
    } catch (err) {
      lastError = err;
      failures.push(`${modelName}: ${err && err.status ? err.status : 'ERR'}`);
      if (isRetryableModelError(err)) {
        continue;
      }
      throw err;
    }
  }

  if (!text) {
    const tried = modelCandidates.join(', ');
    const reason = lastError && lastError.message ? lastError.message : 'No supported model was found.';
    const hint = 'Check GEMINI_API_KEY project quota/billing and enable Gemini API, then retry.';
    throw new Error(`Failed to generate with Gemini. Tried models: ${tried}. Failures: ${failures.join(' | ')}. Last error: ${reason}. ${hint}`);
  }

  const parsed = tryParseJson(text);

  if (!parsed || !Array.isArray(parsed.questions)) {
    throw new Error('Gemini returned an invalid quiz format.');
  }

  const cleanQuestions = parsed.questions
    .slice(0, params.maxQuestions)
    .map((q) => ({
      question: String(q.question || '').trim(),
      choices: Array.isArray(q.choices) ? q.choices.slice(0, 4).map((c) => String(c || '').trim()) : [],
      answerIndex: Number.isInteger(q.answerIndex) ? q.answerIndex : parseInt(q.answerIndex, 10),
      explanation: String(q.explanation || '').trim(),
      difficulty: String(q.difficulty || 'medium').toLowerCase() === 'difficult' ? 'difficult' : 'medium',
    }))
    .filter((q) => q.question && q.choices.length === 4 && q.answerIndex >= 0 && q.answerIndex <= 3);

  if (cleanQuestions.length === 0) {
    throw new Error('No valid questions were generated from the uploaded documents.');
  }

  return {
    title: String(parsed.title || 'AI Generated Quiz').trim(),
    questions: cleanQuestions,
  };
}

router.post('/documents/upload', requireAuth, upload.array('documents', MAX_DOCUMENTS), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ error: 'Please upload at least one document.' });
    }

    const existing = await db.getOne('SELECT COUNT(*) AS total FROM uploaded_documents WHERE user_id = ?', [req.userId]);
    if ((existing?.total || 0) + files.length > MAX_DOCUMENTS) {
      files.forEach((f) => {
        try { fs.unlinkSync(f.path); } catch (_) { /* noop */ }
      });
      return res.status(400).json({ error: `You can only store up to ${MAX_DOCUMENTS} documents.` });
    }

    const savedDocs = [];
    for (const file of files) {
      if (!isAllowedDocument(file)) {
        try { fs.unlinkSync(file.path); } catch (_) { /* noop */ }
        return res.status(400).json({ error: 'Only PDF, DOCX, and TXT files are allowed.' });
      }

      const text = await extractTextFromDocument(file);
      const extractedText = String(text || '').slice(0, MAX_TEXT_CHARS);

      const inserted = await db.execute(
        `INSERT INTO uploaded_documents (user_id, original_name, stored_name, mime_type, file_size, extracted_text)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [req.userId, file.originalname, file.filename, file.mimetype || 'application/octet-stream', file.size || 0, extractedText]
      );

      savedDocs.push({
        id: inserted.insertId,
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        createdAt: new Date().toISOString(),
      });
    }

    return res.status(201).json({
      message: 'Documents uploaded and parsed successfully.',
      documents: savedDocs,
    });
  } catch (err) {
    console.error('[AI] Document upload error:', err);
    return res.status(500).json({ error: err.message || 'Failed to upload documents.' });
  }
});

router.get('/documents', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 5, 50);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const docs = await db.query(
      `SELECT id, original_name, mime_type, file_size, created_at
       FROM uploaded_documents
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [req.userId, limit, offset]
    );

    const totalRow = await db.getOne(
      'SELECT COUNT(*) AS total FROM uploaded_documents WHERE user_id = ?',
      [req.userId]
    );

    return res.json({
      documents: docs,
      total: totalRow?.total || 0,
      limit,
      offset,
    });
  } catch (err) {
    console.error('[AI] List documents error:', err);
    return res.status(500).json({ error: 'Failed to load uploaded documents.' });
  }
});

router.post('/quiz/generate', requireAuth, async (req, res) => {
  try {
    const modeRaw = String(req.body.mode || 'Quiz').trim();
    const mode = ['Quiz', 'Practice', 'Review'].includes(modeRaw) ? modeRaw : 'Quiz';
    const maxQuestions = Math.min(Math.max(parseInt(req.body.maxQuestions, 10) || 15, 5), MAX_QUESTIONS);
    const documentIds = Array.isArray(req.body.documentIds) ? req.body.documentIds.map((v) => parseInt(v, 10)).filter(Number.isInteger) : [];

    if (!documentIds.length) {
      return res.status(400).json({ error: 'Please select at least one uploaded document.' });
    }

    const placeholders = documentIds.map(() => '?').join(',');
    const docs = await db.query(
      `SELECT id, original_name, extracted_text
       FROM uploaded_documents
       WHERE user_id = ? AND id IN (${placeholders})`,
      [req.userId, ...documentIds]
    );

    if (!docs.length) {
      return res.status(404).json({ error: 'No valid uploaded documents found for this account.' });
    }

    const contextText = docs
      .map((d, i) => `Module ${i + 1} (${d.original_name}):\n${String(d.extracted_text || '').slice(0, 15000)}`)
      .join('\n\n')
      .slice(0, MAX_TEXT_CHARS);

    let generated;
    let generationSource = 'gemini';
    try {
      generated = await generateQuizWithGemini({
        contextText,
        mode,
        maxQuestions,
      });
    } catch (err) {
      if (!isQuotaError(err)) {
        throw err;
      }
      generated = buildLocalFallbackQuiz({ contextText, mode, maxQuestions });
      generationSource = 'fallback';
    }

    const quizId = await db.transaction(async (connection) => {
      const [quizInsert] = await connection.execute(
        `INSERT INTO ai_generated_quizzes (user_id, title, mode, difficulty, question_count, source_document_ids)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [req.userId, generated.title, mode, 'medium-difficult', generated.questions.length, JSON.stringify(docs.map((d) => d.id))]
      );

      for (let i = 0; i < generated.questions.length; i++) {
        const q = generated.questions[i];
        await connection.execute(
          `INSERT INTO ai_generated_questions (
            quiz_id, question_order, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, difficulty
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            quizInsert.insertId,
            i + 1,
            q.question,
            q.choices[0],
            q.choices[1],
            q.choices[2],
            q.choices[3],
            q.answerIndex,
            q.explanation,
            q.difficulty,
          ]
        );
      }

      return quizInsert.insertId;
    });

    return res.status(201).json({
      message: generationSource === 'gemini'
        ? 'AI quiz generated successfully.'
        : 'Quiz generated using local fallback because Gemini quota is currently exceeded.',
      quizId,
      title: generated.title,
      mode,
      questions: generated.questions,
      questionCount: generated.questions.length,
      generationSource,
      sourceDocuments: docs.map((d) => ({ id: d.id, originalName: d.original_name })),
    });
  } catch (err) {
    console.error('[AI] Generate quiz error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate AI quiz.' });
  }
});

router.get('/quiz/:quizId', requireAuth, async (req, res) => {
  try {
    const quizId = parseInt(req.params.quizId, 10);
    if (!Number.isInteger(quizId) || quizId < 1) {
      return res.status(400).json({ error: 'Invalid quiz id.' });
    }

    const quiz = await db.getOne(
      `SELECT id, title, mode, difficulty, question_count, source_document_ids, created_at
       FROM ai_generated_quizzes
       WHERE id = ? AND user_id = ?`,
      [quizId, req.userId]
    );

    if (!quiz) {
      return res.status(404).json({ error: 'AI quiz not found.' });
    }

    const rows = await db.query(
      `SELECT question_order, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, difficulty
       FROM ai_generated_questions
       WHERE quiz_id = ?
       ORDER BY question_order ASC`,
      [quizId]
    );

    const questions = rows.map((r) => ({
      question: r.question_text,
      choices: [r.option_a, r.option_b, r.option_c, r.option_d],
      answerIndex: r.correct_option,
      explanation: r.explanation,
      difficulty: r.difficulty,
    }));

    return res.json({
      quiz: {
        id: quiz.id,
        title: quiz.title,
        mode: quiz.mode,
        difficulty: quiz.difficulty,
        questionCount: quiz.question_count,
        sourceDocumentIds: JSON.parse(quiz.source_document_ids || '[]'),
        createdAt: quiz.created_at,
      },
      questions,
    });
  } catch (err) {
    console.error('[AI] Get generated quiz error:', err);
    return res.status(500).json({ error: 'Failed to fetch generated quiz.' });
  }
});

module.exports = router;
