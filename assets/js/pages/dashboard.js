// assets/js/pages/dashboard.js  –  SECURE VERSION
// Fetches all data from the backend API.
// No passwords or sensitive data in localStorage.

(function () {
    'use strict';

    var currentLang = (typeof DB !== 'undefined' ? DB.lang() : null) || localStorage.getItem('qm_lang') || 'EN';
    var currentUser = null;

    // =============================================
    // Translations
    // =============================================
    var T = {
        EN: {
            dashboardLocked : 'Dashboard Locked',
            lockDesc        : 'Please sign in on the homepage to view your personal learning dashboard, stats, and progress.',
            lockBtn         : 'Go to Homepage →',
            welcomePrefix   : 'Welcome Back, ',
            welcomeSub      : "Here's your learning progress overview.",
            quizzesCompleted: 'Quizzes Completed',
            dayStreak       : 'Day Streak',
            avgScore        : 'Average Score',
            lbRank          : 'Leaderboard Rank',
            noDataYet       : 'No data yet',
            noQuizYet       : 'No quizzes taken yet.',
            emptyChartTxt   : 'Complete some quizzes to see your chart.',
            subjects        : ['Eng','Fil','Math','Sci','AP','MAPEH','ESP','TLE'],
            days            : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
            score           : 'Score',
            quizzes         : 'Quizzes',
            recentAssessments:'Recent Assessments',
            returnHome      : 'Return to Home',
            help            : 'Help & Support',
            signUp          : 'Sign Up',
            logOut          : 'Log Out',
        },
        FIL: {
            dashboardLocked : 'Dashboard ay Naka-lock',
            lockDesc        : 'Mangyaring mag-sign in sa homepage upang makita ang iyong personal na dashboard, stats, at progreso.',
            lockBtn         : 'Pumunta sa Homepage →',
            welcomePrefix   : 'Maligayang pagdating pabalik, ',
            welcomeSub      : 'Narito ang iyong pangkalahatang-ideya ng progreso sa pag-aaral.',
            quizzesCompleted: 'Mga Natapos na Quiz',
            dayStreak       : 'Araw na Streak',
            avgScore        : 'Karaniwang Marka',
            lbRank          : 'Ranggo sa Leaderboard',
            noDataYet       : 'Wala pang datos',
            noQuizYet       : 'Wala pang mga quiz na ginawa.',
            emptyChartTxt   : 'Kumpletuhin ang ilang quiz upang makita ang iyong tsart.',
            subjects        : ['Ing','Fil','Mat','Agham','AP','MAPEH','ESP','TLE'],
            days            : ['Lun','Mar','Miy','Huw','Biy','Sab','Lin'],
            score           : 'Marka',
            quizzes         : 'Mga Quiz',
            recentAssessments:'Mga Kamakailang Pagtatasa',
            returnHome      : 'Bumalik sa Tahanan',
            help            : 'Tulong at Suporta',
            signUp          : 'Mag-sign Up',
            logOut          : 'Mag-log Out',
        }
    };

    function t(key) { return (T[currentLang] || T.EN)[key] || key; }

    // =============================================
    // Init – authenticate via backend session
    // =============================================
    document.addEventListener('DOMContentLoaded', function () {
        applyLang(currentLang);
        syncNavLang();

        // Check session via backend
        DB.checkSession().then(function (user) {
            if (!user) {
                showLocked();
                refreshUserBtn(null);
            } else {
                currentUser = user;
                refreshUserBtn(user);
                loadDashboard(user);
            }
        }).catch(function () {
            showLocked();
            refreshUserBtn(null);
        });
    });

    // =============================================
    // Load dashboard data from API
    // =============================================
    async function loadDashboard(user) {
        try {
            var stats = await DB.getUserStats();
            showDashboard(user, stats);
        } catch (err) {
            console.error('Dashboard load error:', err);
            // If stats fail, still show dashboard with empty data
            showDashboard(user, null);
        }
    }

    // =============================================
    // Show / hide states
    // =============================================
    function showLocked() {
        document.getElementById('lockedScreen').classList.add('show');
        document.getElementById('dashboardWrap').classList.remove('show');
        document.getElementById('lockTitle').textContent = t('dashboardLocked');
        document.getElementById('lockDesc').textContent  = t('lockDesc');
        document.getElementById('lockBtn').textContent   = t('lockBtn');
    }

    function showDashboard(user, stats) {
        document.getElementById('lockedScreen').classList.remove('show');
        document.getElementById('dashboardWrap').classList.add('show');
        renderDashboard(user, stats);
    }

    // =============================================
    // Render dashboard
    // =============================================
    function renderDashboard(user, stats) {
        var displayName =
            (user && user.fullName && String(user.fullName).trim()) ||
            (user && user.username && String(user.username).trim()) ||
            'Learner';
        document.getElementById('welcomeMsg').textContent = t('welcomePrefix') + displayName + '!';
        document.getElementById('welcomeSub').textContent = t('welcomeSub');

        renderStats(stats);

        if (stats && stats.subjectPerformance && stats.subjectPerformance.length > 0) {
            var barData = stats.subjectPerformance.slice(0, 8).map(function (s) { return parseFloat(s.avg_score); });
            var barLabels = stats.subjectPerformance.slice(0, 8).map(function (s) { return formatSubjectLabel(s.subject); });
            renderBarChart(barData, barLabels);
        } else {
            renderBarChart(null);
        }

        if (stats && stats.weeklyActivity && stats.weeklyActivity.length > 0) {
            // Build last 7 days data
            var lineData = buildWeeklyData(stats.weeklyActivity);
            renderLineChart(lineData);
        } else {
            renderLineChart(null);
        }

        if (stats && stats.recentAssessments) {
            renderAssessments(stats.recentAssessments);
        } else {
            renderAssessments(null);
        }
    }

    function buildWeeklyData(weeklyActivity) {
        var result = [];
        var lookup = {};
        weeklyActivity.forEach(function (w) {
            var key = normalizeDateKey(w.quiz_date);
            lookup[key] = Number(w.quiz_count) || 0;
        });
        for (var i = 6; i >= 0; i--) {
            var d = new Date();
            d.setDate(d.getDate() - i);
            var dateStr = normalizeDateKey(d);
            result.push(lookup[dateStr] || 0);
        }
        return result;
    }

    function normalizeDateKey(dateLike) {
        if (dateLike instanceof Date) {
            var y = dateLike.getFullYear();
            var m = String(dateLike.getMonth() + 1).padStart(2, '0');
            var d = String(dateLike.getDate()).padStart(2, '0');
            return y + '-' + m + '-' + d;
        }
        var text = String(dateLike || '').trim();
        if (!text) return '';
        var m2 = text.match(/^\d{4}-\d{2}-\d{2}/);
        if (m2) return m2[0];
        var parsed = new Date(text);
        if (!isNaN(parsed.getTime())) {
            return normalizeDateKey(parsed);
        }
        return text;
    }

    function formatSubjectLabel(subject) {
        var s = String(subject || '').trim();
        if (!s) return 'Subject';
        var map = {
            'General Mathematics': 'Gen Math',
            'General Statistics': 'Gen Stat',
            'General Calculus': 'Gen Calc',
            'General Physics': 'Gen Phys',
            'General Chemistry': 'Gen Chem',
            'General Biology': 'Gen Bio'
        };
        if (map[s]) return map[s];
        if (s.length <= 10) return s;
        var words = s.split(/\s+/).filter(Boolean);
        if (words.length >= 2) {
            var initials = words.map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
            if (initials.length >= 2 && initials.length <= 4) return initials;
            return (words[0].slice(0, 3) + ' ' + words[1].slice(0, 4)).trim();
        }
        return s.slice(0, 10);
    }

    // =============================================
    // Stats cards
    // =============================================
    function renderStats(stats) {
        var grid = document.getElementById('statsGrid');
        var cards = [
            { color:'yellow', icon:'🏆', imgSrc:'assets/images/dashboard/trophyv2.png', value: stats ? stats.totalQuizzes : null,            label: t('quizzesCompleted') },
            { color:'orange', icon:'🔥', imgSrc:'assets/images/dashboard/streak.png',   value: stats ? stats.dayStreak : null,               label: t('dayStreak') },
            { color:'green',  icon:'⭐', imgSrc:'assets/images/dashboard/star.png',     value: stats ? stats.averageScore.toFixed(1) + '%' : null, label: t('avgScore') },
            { color:'blue',   icon:'📈', imgSrc:'assets/images/dashboard/up.png',       value: stats ? '#' + stats.leaderboardRank : null,   label: t('lbRank') },
        ];

        grid.innerHTML = cards.map(function (c) {
            return '<div class="progress-card ' + c.color + '">' +
                '<div class="stats-top">' +
                    '<div class="stat-icon ' + c.color + '">' +
                        '<img src="' + esc(c.imgSrc) + '" onerror="this.outerHTML=\'<span class=icon-emoji>' + c.icon + '</span>\'">' +
                    '</div>' +
                    '<div class="value' + (!c.value ? ' empty' : '') + '">' + (c.value !== null ? esc(String(c.value)) : '—') + '</div>' +
                '</div>' +
                '<div class="label">' + esc(c.label) + '</div>' +
            '</div>';
        }).join('');
    }

    // =============================================
    // Bar chart (SVG)
    // =============================================
    function renderBarChart(data, labels) {
        var container = document.getElementById('barChartContainer');
        if (!data) {
            container.innerHTML = '<div class="chart-empty"><span class="empty-icon">📊</span><p>' + t('emptyChartTxt') + '</p></div>';
            return;
        }

        var subjects = labels || t('subjects');
        var W = 500, H = 280, pad = { l:30, r:10, t:20, b:40 };
        var chartW = W - pad.l - pad.r;
        var chartH = H - pad.t - pad.b;
        var barW   = 34;
        var gap    = (chartW - subjects.length * barW) / (subjects.length + 1);
        var maxVal = 100;

        var bars = subjects.map(function (subj, i) {
            var val = data[i] || 0;
            var x   = pad.l + gap + i * (barW + gap);
            var bH  = (val / maxVal) * chartH;
            var y   = pad.t + chartH - bH;
            return { subj: subj, val: val, x: x, y: y, bH: bH };
        });

        var svgBars = bars.map(function (b) {
            return '<rect class="bar-rect" x="' + b.x + '" y="' + b.y + '" width="' + barW + '" height="' + b.bH + '"' +
                ' rx="6" fill="var(--focus-blue)"' +
                ' onmouseenter="showTip(event,\'' + esc(b.subj) + ': ' + b.val + '%\')"' +
                ' onmouseleave="hideTip()"/>' +
                '<text x="' + (b.x + barW/2) + '" y="' + (H - pad.b + 18) + '" text-anchor="middle" font-size="11" fill="var(--muted-gray)" font-family="Inter,sans-serif">' + esc(b.subj) + '</text>' +
                '<text x="' + (b.x + barW/2) + '" y="' + (b.y - 6) + '" text-anchor="middle" font-size="10" fill="var(--focus-blue)" font-weight="600" font-family="Inter,sans-serif">' + b.val + '%</text>';
        }).join('');

        var gridLines = [0,25,50,75,100].map(function (v) {
            var gy = pad.t + chartH - (v / maxVal) * chartH;
            return '<line x1="' + pad.l + '" y1="' + gy + '" x2="' + (W - pad.r) + '" y2="' + gy + '" stroke="#e2e8f0" stroke-width="1"/>' +
                '<text x="' + (pad.l - 4) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="9" fill="var(--muted-gray)" font-family="Inter,sans-serif">' + v + '</text>';
        }).join('');

        container.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '">' + gridLines + svgBars + '</svg>';
    }

    // =============================================
    // Line chart (SVG)
    // =============================================
    function renderLineChart(data) {
        var container = document.getElementById('lineChartContainer');
        if (!data) {
            container.innerHTML = '<div class="chart-empty"><span class="empty-icon">📈</span><p>' + t('emptyChartTxt') + '</p></div>';
            return;
        }

        var days = t('days');
        var W = 420, H = 260, pad = { l:34, r:16, t:20, b:40 };
        var chartW = W - pad.l - pad.r;
        var chartH = H - pad.t - pad.b;
        var maxVal = Math.max.apply(null, data.concat([1]));
        var xStep  = chartW / (days.length - 1);

        var pts = days.map(function (d, i) {
            return {
                d: d,
                val : data[i] || 0,
                cx  : pad.l + i * xStep,
                cy  : pad.t + chartH - ((data[i] || 0) / maxVal) * chartH,
            };
        });

        var polyline = pts.map(function(p){ return p.cx + ',' + p.cy; }).join(' ');

        var fillPath = 'M' + pts[0].cx + ',' + pts[0].cy + ' ' +
            pts.slice(1).map(function(p){ return 'L' + p.cx + ',' + p.cy; }).join(' ') +
            ' L' + pts[pts.length-1].cx + ',' + (pad.t + chartH) + ' L' + pts[0].cx + ',' + (pad.t + chartH) + ' Z';

        var dots = pts.map(function (p) {
            return '<circle class="line-dot" cx="' + p.cx + '" cy="' + p.cy + '" r="6" fill="var(--calm-green)" stroke="white" stroke-width="2"' +
                ' onmouseenter="showTip(event,\'' + esc(p.d) + ': ' + p.val + ' ' + t('quizzes') + '\')"' +
                ' onmouseleave="hideTip()"/>';
        }).join('');

        var labels = pts.map(function (p) {
            return '<text x="' + p.cx + '" y="' + (pad.t + chartH + 22) + '" text-anchor="middle" font-size="11" fill="var(--muted-gray)" font-family="Inter,sans-serif">' + esc(p.d) + '</text>';
        }).join('');

        var steps = 4;
        var gridLines = [];
        for (var idx = 0; idx <= steps; idx++) {
            var v  = Math.round((idx / steps) * maxVal);
            var gy = pad.t + chartH - (idx / steps) * chartH;
            gridLines.push(
                '<line x1="' + pad.l + '" y1="' + gy + '" x2="' + (W - pad.r) + '" y2="' + gy + '" stroke="#e2e8f0" stroke-width="1"/>' +
                '<text x="' + (pad.l - 4) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="9" fill="var(--muted-gray)" font-family="Inter,sans-serif">' + v + '</text>'
            );
        }

        container.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '">' +
            '<defs><linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="var(--calm-green)" stop-opacity=".25"/>' +
            '<stop offset="100%" stop-color="var(--calm-green)" stop-opacity="0"/>' +
            '</linearGradient></defs>' +
            gridLines.join('') +
            '<path d="' + fillPath + '" fill="url(#lineGrad)"/>' +
            '<polyline points="' + polyline + '" fill="none" stroke="var(--calm-green)" stroke-width="3" stroke-linejoin="round"/>' +
            dots + labels + '</svg>';
    }

    // =============================================
    // Recent assessments
    // =============================================
    function renderAssessments(assessments) {
        var list = document.getElementById('assessmentList');
        if (!assessments || assessments.length === 0) {
            list.innerHTML = '<div class="empty-assessments"><span class="empty-icon">📋</span><p>' + t('noQuizYet') + '</p></div>';
            return;
        }

        var strandIcons = { STEM: '🔬', ABM: '💼', HUMSS: '📚', TVL: '🔧', TRM: '✈️', CPG: '💻', CSS: '👨‍💻', HRS: '🍳', SPT: '🏃' };

        list.innerHTML = assessments.map(function (a) {
            var icon = strandIcons[a.strand] || '📝';
            var when = a.completed_at ? timeAgo(a.completed_at) : '';
            return '<div class="assessment-item">' +
                '<div class="assessment-info">' +
                    '<div class="assessment-icon">' +
                        '<img src="assets/images/dashboard/b1.png" onerror="this.outerHTML=\'<span class=icon-emoji>' + icon + '</span>\'">' +
                    '</div>' +
                    '<div class="assessment-details">' +
                        '<h4>' + esc(a.subject) + '</h4>' +
                        '<div class="assessment-meta">' + esc(a.strand) + ' • ' + esc(when) + '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="assessment-score">' + a.score + '/' + a.total_questions + '</div>' +
            '</div>';
        }).join('');
    }

    function timeAgo(dateStr) {
        var now  = new Date();
        var then = new Date(dateStr);
        var diff = Math.floor((now - then) / 1000);
        if (diff < 60)    return 'Just now';
        if (diff < 3600)  return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        var days = Math.floor(diff / 86400);
        if (days === 1)   return 'Yesterday';
        if (days < 7)     return days + ' days ago';
        return then.toLocaleDateString();
    }

    // =============================================
    // Tooltip
    // =============================================
    window.showTip = function (e, text) {
        var tip = document.getElementById('svgTip');
        tip.textContent = text;
        tip.classList.add('show');
        moveTip(e);
        document.addEventListener('mousemove', moveTip);
    };
    function moveTip(e) {
        var tip = document.getElementById('svgTip');
        tip.style.left = (e.clientX + 14) + 'px';
        tip.style.top  = (e.clientY - 36) + 'px';
        tip.style.position = 'fixed';
    }
    window.hideTip = function () {
        var tip = document.getElementById('svgTip');
        tip.classList.remove('show');
        document.removeEventListener('mousemove', moveTip);
    };

    // =============================================
    // Language
    // =============================================
    window.toggleLanguage = function (e) {
        e.stopPropagation();
        document.getElementById('selectLang').classList.toggle('active');
    };
    document.addEventListener('click', function () {
        var dd = document.getElementById('selectLang');
        if (dd) dd.classList.remove('active');
    });

    window.setLanguage = function (lang, e) {
        if (e) e.stopPropagation();
        currentLang = lang;
        localStorage.setItem('qm_lang', lang);
        if (typeof DB !== 'undefined' && DB.saveLang) DB.saveLang(lang);
        document.getElementById('recentLang').textContent = lang;
        document.getElementById('btnEN').classList.toggle('lang-active',  lang === 'EN');
        document.getElementById('btnFIL').classList.toggle('lang-active', lang === 'FIL');
        document.getElementById('selectLang').classList.remove('active');
        applyLang(lang);
        syncNavLang();
        if (currentUser) {
            loadDashboard(currentUser);
        } else {
            showLocked();
        }
    };

    function applyLang(lang) {
        var attr = lang === 'FIL' ? 'data-fil' : 'data-en';
        document.querySelectorAll('[data-en]').forEach(function (el) {
            var v = el.getAttribute(attr);
            if (v !== null) el.textContent = v;
        });
    }

    function syncNavLang() {
        var helpBtn = document.getElementById('helpBtn');
        if (helpBtn) helpBtn.textContent = t('help');
        var label = document.getElementById('userBtnLabel');
        if (label && !currentUser) label.textContent = t('signUp');
    }

    window.handleHelpSupport = function () {
        var msg = currentLang === 'FIL'
            ? 'Pakikontak: support@quizmaster.com'
            : 'Contact: support@quizmaster.com';
        if (typeof showToast === 'function') {
            showToast(msg, 'info');
        }
    };

    // =============================================
    // User button
    // =============================================
    function refreshUserBtn(user) {
        var btn   = document.getElementById('userBtn');
        var label = document.getElementById('userBtnLabel');
        var init  = document.getElementById('userInitial');
        if (!btn) return;

        if (user) {
            btn.classList.add('logged-in');
            init.textContent  = (user.username || user.fullName || 'U').charAt(0).toUpperCase();
            label.textContent = user.username || user.fullName;
        } else {
            btn.classList.remove('logged-in');
            init.textContent  = '👤';
            label.textContent = t('signUp');
        }
    }

    window.handleUserBtn = function () {
        if (currentUser) {
            DB.logout().then(function () {
                var msg = currentLang === 'FIL' ? 'Naka-log out ka na.' : 'Logged out. Redirecting…';
                if (typeof showToast === 'function') showToast(msg, 'success');
                setTimeout(function () { window.location.href = 'homepage.html'; }, 1200);
            }).catch(function () {
                window.location.href = 'homepage.html';
            });
        } else {
            window.location.href = 'login.html';
        }
    };

    window.toggleMenu = function () {
        var nav = document.getElementById('navlinks');
        if (nav) nav.classList.toggle('open');
    };

    // =============================================
    // Utility
    // =============================================
    function esc(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // Legacy toast for pages that still use #toast element
    window.showToast = window.showToast || function (msg, type) {
        var t = document.getElementById('toast');
        if (!t) return;
        t.textContent = msg;
        t.className = 'toast' + (type ? ' ' + type : '');
        t.classList.add('show');
        setTimeout(function () { t.classList.remove('show'); }, 3200);
    };
})();
