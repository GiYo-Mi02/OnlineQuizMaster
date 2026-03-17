// assets/js/utils/api.js
// Centralized API client for all backend communication
// Include via <script src="assets/js/utils/api.js"></script>

const API = (function () {
  'use strict';

  const BASE = '/api';

  async function request(endpoint, options) {
    const url = BASE + endpoint;
    const isFormData = options && options.body && typeof FormData !== 'undefined' && options.body instanceof FormData;
    const baseHeaders = isFormData ? {} : { 'Content-Type': 'application/json' };
    const config = Object.assign({}, options || {}, {
      headers: Object.assign(baseHeaders, (options && options.headers) || {}),
      credentials: 'include',   // send session cookie
    });

    const response = await fetch(url, config);
    let data;
    try {
      data = await response.json();
    } catch (_) {
      data = {};
    }

    if (!response.ok) {
      const err = new Error(data.error || 'Request failed');
      err.status = response.status;
      throw err;
    }
    return data;
  }

  // ---------- Auth ----------

  function register(email, username, password, fullName, country) {
    return request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: email, username: username, password: password, fullName: fullName, country: country }),
    });
  }

  function login(identifier, password) {
    return request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: identifier, password: password }),
    });
  }

  function logout() {
    return request('/auth/logout', { method: 'POST' });
  }

  function getCurrentUser() {
    return request('/auth/me');
  }

  // ---------- Quiz ----------

  function submitQuiz(quizData) {
    return request('/quiz/submit', {
      method: 'POST',
      body: JSON.stringify(quizData),
    });
  }

  function getQuizHistory(limit, offset) {
    var qs = '?limit=' + (limit || 50) + '&offset=' + (offset || 0);
    return request('/quiz/history' + qs);
  }

  function getUserStats() {
    return request('/quiz/stats');
  }

  function getLeaderboard(sort, limit) {
    var qs = '?sort=' + (sort || 'score') + '&limit=' + (limit || 50);
    return request('/quiz/leaderboard' + qs);
  }

  // ---------- Reviews ----------

  function submitReview(text, stars, role) {
    return request('/quiz/review', {
      method: 'POST',
      body: JSON.stringify({ text: text, stars: stars, role: role }),
    });
  }

  function getReviews() {
    return request('/quiz/reviews');
  }

  // ---------- AI Quiz ----------

  function uploadDocuments(files) {
    var form = new FormData();
    files.forEach(function (f) { form.append('documents', f); });
    return request('/ai/documents/upload', {
      method: 'POST',
      body: form,
    });
  }

  function getUploadedDocuments(limit, offset) {
    var qs = '?limit=' + (limit || 5) + '&offset=' + (offset || 0);
    return request('/ai/documents' + qs);
  }

  function generateAiQuiz(documentIds, maxQuestions, mode) {
    return request('/ai/quiz/generate', {
      method: 'POST',
      body: JSON.stringify({
        documentIds: documentIds,
        maxQuestions: maxQuestions,
        mode: mode,
      }),
    });
  }

  function getAiQuiz(quizId) {
    return request('/ai/quiz/' + quizId);
  }

  // Public API
  return {
    request: request,
    register: register,
    login: login,
    logout: logout,
    getCurrentUser: getCurrentUser,
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
  };
})();
