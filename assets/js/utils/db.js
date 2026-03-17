// assets/js/utils/db.js
// Unified data-access layer – replaces the copy-pasted DB objects.
// Now proxies to the backend API while keeping localStorage as a
// client-side cache for non-sensitive data (theme, language).
// Include via <script src="assets/js/utils/db.js"></script>  (after api.js)

const DB = (function () {
  'use strict';

  // ---- Cached session (populated by checkSession) ----
  let _cachedUser = null;

  // ---- Auth / session ----

  async function checkSession() {
    if (_cachedUser) return _cachedUser;
    try {
      var data = await API.getCurrentUser();
      _cachedUser = data.user || null;
      return _cachedUser;
    } catch (_) {
      _cachedUser = null;
      return null;
    }
  }

  function getCachedUser() {
    return _cachedUser;
  }

  function clearCache() {
    _cachedUser = null;
  }

  async function login(identifier, password) {
    var data = await API.login(identifier, password);
    _cachedUser = data.user || null;
    return data;
  }

  async function register(email, username, password, fullName, country) {
    var data = await API.register(email, username, password, fullName, country);
    _cachedUser = data.user || null;
    return data;
  }

  async function logout() {
    await API.logout();
    _cachedUser = null;
  }

  // ---- Quiz ----

  function submitQuiz(quizData) {
    return API.submitQuiz(quizData);
  }

  function getQuizHistory(limit, offset) {
    return API.getQuizHistory(limit, offset);
  }

  function getUserStats() {
    return API.getUserStats();
  }

  function getLeaderboard(sort, limit) {
    return API.getLeaderboard(sort, limit);
  }

  // ---- Reviews ----

  function submitReview(text, stars, role) {
    return API.submitReview(text, stars, role);
  }

  function getReviews() {
    return API.getReviews();
  }

  // ---- AI Quiz ----

  function uploadDocuments(files) {
    return API.uploadDocuments(files);
  }

  function getUploadedDocuments(limit, offset) {
    return API.getUploadedDocuments(limit, offset);
  }

  function generateAiQuiz(documentIds, maxQuestions, mode) {
    return API.generateAiQuiz(documentIds, maxQuestions, mode);
  }

  function getAiQuiz(quizId) {
    return API.getAiQuiz(quizId);
  }

  // ---- Local preferences (non-sensitive) ----

  function lang() {
    return localStorage.getItem('qm_lang') || 'EN';
  }
  function saveLang(l) {
    localStorage.setItem('qm_lang', l);
  }

  function theme() {
    return localStorage.getItem('qm_theme') || 'light';
  }
  function saveTheme(t) {
    localStorage.setItem('qm_theme', t);
  }

  // Public API
  return {
    checkSession: checkSession,
    getCachedUser: getCachedUser,
    clearCache: clearCache,
    login: login,
    register: register,
    logout: logout,
    submitQuiz: submitQuiz,
    getQuizHistory: getQuizHistory,
    getUserStats: getUserStats,
    getLeaderboard: getLeaderboard,
    submitReview: submitReview,
    getReviews: getReviews,
    uploadDocuments: uploadDocuments,
    getUploadedDocuments: getUploadedDocuments,
    generateAiQuiz: generateAiQuiz,
    getAiQuiz: getAiQuiz,
    lang: lang,
    saveLang: saveLang,
    theme: theme,
    saveTheme: saveTheme,
  };
})();
