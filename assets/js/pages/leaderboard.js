// assets/js/pages/leaderboard.js – SECURE VERSION
// Fetches leaderboard data from backend API.
// Falls back to demo data when server is unavailable.

(function () {
  'use strict';

  /* ── Fallback demo data (used when API is unavailable) ── */
  var DEMO_PLAYERS = [
    { username:'Alejandro Reyes',  full_name:'Alejandro Reyes',  average_score:100, total_quizzes:10, day_streak:67 },
    { username:'Maria Santos',     full_name:'Maria Santos',     average_score:90,  total_quizzes:10, day_streak:0  },
    { username:'Jose Dela Cruz',   full_name:'Jose Dela Cruz',   average_score:80,  total_quizzes:10, day_streak:0  },
    { username:'Isabella Torres',  full_name:'Isabella Torres',  average_score:70,  total_quizzes:10, day_streak:0  },
    { username:'Carlos Mendoza',   full_name:'Carlos Mendoza',   average_score:60,  total_quizzes:10, day_streak:0  },
    { username:'Sofia Villanueva', full_name:'Sofia Villanueva', average_score:50,  total_quizzes:10, day_streak:3  },
    { username:'Rafael Aquino',    full_name:'Rafael Aquino',    average_score:40,  total_quizzes:10, day_streak:1  },
    { username:'Gabriela Ramos',   full_name:'Gabriela Ramos',  average_score:30,  total_quizzes:10, day_streak:0  },
    { username:'Miguel Castro',    full_name:'Miguel Castro',    average_score:20,  total_quizzes:10, day_streak:0  },
    { username:'Valentina Cruz',   full_name:'Valentina Cruz',   average_score:10,  total_quizzes:10, day_streak:0  },
    { username:'Andres Navarro',   full_name:'Andres Navarro',   average_score:90,  total_quizzes:10, day_streak:5  },
    { username:'Camila Flores',    full_name:'Camila Flores',    average_score:70,  total_quizzes:10, day_streak:2  },
    { username:'Diego Morales',    full_name:'Diego Morales',    average_score:60,  total_quizzes:10, day_streak:0  },
    { username:'Lucia Hernandez',  full_name:'Lucia Hernandez',  average_score:50,  total_quizzes:10, day_streak:0  }
  ];

  var players = [];               // populated by API or fallback
  var currentSorted = [];
  var usingAPI = false;
  var authUser = null;

  /* ── Helpers ── */
  var ords = ['1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10th'];

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function ini(name) {
    return name.split(' ').slice(0, 2).map(function (n) { return n[0]; }).join('').toUpperCase();
  }
  function rkClass(i) { return ['rk1','rk2','rk3'][i] || 'rk-n'; }

  window.toggleMenu = function () {
    var links = document.getElementById('navlinks');
    if (links) links.classList.toggle('show');
  };

  window.handleUserBtn = function () {
    if (authUser) {
      window.location.href = 'dashboard.html';
    } else {
      window.location.href = 'login.html';
    }
  };

  function setUserUI() {
    var labelEl = document.getElementById('userBtnLabel');
    var initialEl = document.getElementById('userInitial');
    if (!labelEl || !initialEl) return;

    if (!authUser) {
      labelEl.textContent = 'Sign In';
      initialEl.textContent = 'U';
      return;
    }

    var fullName = authUser.full_name || authUser.username || 'User';
    labelEl.textContent = fullName.split(' ')[0];
    initialEl.textContent = ini(fullName).charAt(0) || 'U';
  }

  async function hydrateSession() {
    try {
      if (typeof DB !== 'undefined' && typeof DB.checkSession === 'function') {
        var res = await DB.checkSession();
        authUser = res && res.user ? res.user : null;
      }
    } catch (_) {
      authUser = null;
    }
    setUserUI();
  }

  function updateMetrics() {
    var total = players.length;
    var top = players.slice().sort(function (a, b) { return b.avgPct - a.avgPct; })[0] || null;

    var totalEl = document.getElementById('mTotalPlayers');
    var topEl = document.getElementById('mTopScore');
    var streakEl = document.getElementById('mTopStreak');
    var sourceEl = document.getElementById('mSource');

    if (totalEl) totalEl.textContent = String(total);
    if (topEl) topEl.textContent = top ? (top.avgPct + '%') : '0%';
    if (streakEl) {
      var streak = top ? Math.max.apply(null, players.map(function (p) { return p.streak || 0; })) : 0;
      streakEl.textContent = streak + ' day' + (streak === 1 ? '' : 's');
    }
    if (sourceEl) sourceEl.textContent = usingAPI ? 'Live API' : 'Demo Data';
  }

  /* Normalize player object from API to a common shape */
  function normalize(p) {
    var name = p.full_name || p.username || 'Player';
    return {
      name:    name,
      score:   Math.round((p.average_score || 0) / 10),  // avg score out of ~10
      total:   10,
      avgPct:  Math.round(p.average_score || 0),
      streak:  p.day_streak || 0,
      hot:     (p.day_streak || 0) > 0,
      quizzes: p.total_quizzes || 0
    };
  }

  /* ── Streak badge ── */
  function streakBadge(p) {
    var days = p.streak + ' day' + (p.streak !== 1 ? 's' : '');
    return p.hot
      ? '<span class="streak-badge s-hot"><img src="assets/images/leaderboard/Streak.png" width="20" height="20">' + days + '</span>'
      : '<span class="streak-badge s-cold"><img src="assets/images/leaderboard/Cold Streak.png" width="20" height="20">' + days + '</span>';
  }

  /* ── Render Top 10 ── */
  function renderTop10() {
    var sorted = players.slice().sort(function (a, b) { return b.avgPct - a.avgPct; }).slice(0, 10);
    var el = document.getElementById('top10List');
    if (!el) return;
    el.innerHTML = sorted.map(function (p, i) {
      return '<div class="lb-row top10-cols">' +
        '<div class="rank-cell"><div class="rank-pill ' + rkClass(i) + '">' + (ords[i] || (i + 1)) + '</div></div>' +
        '<div class="player-cell"><div class="avatar">' + esc(ini(p.name)) + '</div><span class="player-name">' + esc(p.name) + '</span></div>' +
        '<div class="score-cell"><div class="score-frac">' + p.score + '/' + p.total + '</div></div>' +
        '<div class="score-cell"><div class="score-frac">' + p.avgPct + '%</div></div>' +
        '<div class="streak-cell">' + streakBadge(p) + '</div>' +
      '</div>';
    }).join('');
  }

  /* ── Render Full leaderboard ── */
  function renderFull() {
    var sel = document.getElementById('sortSel');
    var by = sel ? sel.value : 'score';
    var searchInput = document.getElementById('searchPlayer');
    var q = searchInput ? String(searchInput.value || '').trim().toLowerCase() : '';
    currentSorted = players.slice();

    if (by === 'score')       currentSorted.sort(function (a, b) { return b.avgPct - a.avgPct; });
    else if (by === 'streak') currentSorted.sort(function (a, b) { return b.streak - a.streak; });
    else                      currentSorted.sort(function (a, b) { return a.name.localeCompare(b.name); });

    if (q) {
      currentSorted = currentSorted.filter(function (p) {
        return p.name.toLowerCase().indexOf(q) !== -1;
      });
    }

    var el = document.getElementById('fullList');
    if (!el) return;
    if (!currentSorted.length) {
      el.innerHTML = '<div class="lb-row full-cols"><div class="player-cell"><span class="player-name">No matching players found.</span></div><div></div><div></div><div></div><div></div></div>';
      return;
    }
    el.innerHTML = currentSorted.map(function (p, i) {
      return '<div class="lb-row full-cols" style="animation-delay:' + (i * 0.04) + 's">' +
        '<div class="player-cell"><div class="avatar">' + esc(ini(p.name)) + '</div><span class="player-name">' + esc(p.name) + '</span></div>' +
        '<div class="score-cell"><div class="score-frac">' + p.score + '/' + p.total + '</div></div>' +
        '<div class="score-cell"><div class="score-frac">' + p.avgPct + '%</div></div>' +
        '<div class="streak-cell">' + streakBadge(p) + '</div>' +
        '<div class="action-cell"><button class="btn-review" onclick="openModal(' + i + ')">Answer</button></div>' +
      '</div>';
    }).join('');
  }
  window.renderFull = renderFull;

  /* ── Tabs ── */
  window.switchTab = function (tab, btn) {
    document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    document.getElementById('tab-top10').style.display = tab === 'top10' ? '' : 'none';
    document.getElementById('tab-full').style.display  = tab === 'full'  ? '' : 'none';
    if (tab === 'full') renderFull();
  };

  /* ── Modal ── */
  // Sample questions used in the modal breakdown view
  var questions = [
    { text:'What is the value of x in the equation 2x + 5 = 13?',            type:'Multiple choice', time:20, pts:1 },
    { text:'Simplify: (3x² + 2x − 1) ÷ (x + 1)',                            type:'Multiple choice', time:60, pts:1 },
    { text:'What is the area of a circle with radius 7 cm?',                  type:'Multiple choice', time:30, pts:1 },
    { text:'Solve for y: 3y − 4 = 2y + 6',                                   type:'Problem solving', time:45, pts:1 },
    { text:'What is the slope of the line passing through (1,2) and (3,8)?',  type:'Multiple choice', time:25, pts:1 },
    { text:'Evaluate: log₂(64)',                                              type:'Multiple choice', time:30, pts:1 },
    { text:'What is the GCD of 48 and 36?',                                   type:'Multiple choice', time:20, pts:1 },
    { text:'Expand: (x + 3)²',                                                type:'Multiple choice', time:20, pts:1 },
    { text:'What is the median of: 4, 7, 2, 9, 5?',                           type:'Multiple choice', time:20, pts:1 },
    { text:'Convert 0.75 to a fraction in lowest terms.',                     type:'Multiple choice', time:20, pts:1 }
  ];

  window.openModal = function (index) {
    var p = currentSorted[index];
    if (!p) return;
    var pc = p.avgPct;

    document.getElementById('mAv').textContent      = ini(p.name);
    document.getElementById('mName').textContent     = p.name;
    document.getElementById('mPct').textContent      = pc + '%';
    document.getElementById('mFrac').textContent     = p.score + '/' + p.total;
    document.getElementById('mCorrect').textContent  = p.score;
    document.getElementById('mWrong').textContent    = p.total - p.score;
    document.getElementById('mPoints').textContent   = p.score;
    var donut = document.querySelector('.donut');
    if (donut) donut.style.setProperty('--score', pc + '%');

    var lbl = pc >= 100 ? 'Perfect score!' : pc >= 90 ? 'Amazing!' : pc >= 80 ? 'Great job!' : pc >= 70 ? 'Good job!' : 'Keep it up!';
    document.getElementById('mLbl').textContent = lbl;

    document.getElementById('qList').innerHTML = questions.map(function (q, i) {
      var ok = i < p.score;
      return '<div class="q-item ' + (ok ? 'ok' : 'bad') + '">' +
        '<div class="q-icon ' + (ok ? 'qi-ok' : 'qi-err') + '">' + (ok ? '✅' : '❌') + '</div>' +
        '<div class="q-meta">' +
          '<div class="q-tags">' +
            '<span class="q-num">Q' + (i + 1) + '</span>' +
            '<span class="q-tag">' + q.type + '</span>' +
            '<span class="q-time">⏱ ' + q.time + 's</span>' +
            '<span class="q-pts">⭐ ' + q.pts + ' pt</span>' +
          '</div>' +
          '<div class="q-text">' + esc(q.text) + '</div>' +
        '</div></div>';
    }).join('');

    document.getElementById('overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  window.closeModal = function () {
    document.getElementById('overlay').classList.remove('open');
    document.body.style.overflow = '';
  };
  window.overlayClick = function (e) {
    if (e.target === document.getElementById('overlay')) window.closeModal();
  };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') window.closeModal(); });

  /* ── Init: try API first, fall back to demo ── */
  async function init() {
    await hydrateSession();
    try {
      if (typeof API !== 'undefined') {
        var data = await API.getLeaderboard('score', 50);
        if (data && data.players && data.players.length > 0) {
          players = data.players.map(normalize);
          usingAPI = true;
        }
      }
    } catch (_) { /* ignore – will use demo data */ }

    if (!usingAPI) {
      players = DEMO_PLAYERS.map(normalize);
    }
    updateMetrics();
    renderTop10();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
