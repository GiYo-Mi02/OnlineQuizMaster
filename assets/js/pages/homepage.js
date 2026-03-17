// assets/js/pages/homepage.js  –  SECURE VERSION
// Uses backend API via DB utility for all auth checks.
// No passwords stored locally. Reviews fetched from server.

(function () {
    'use strict';

    var currentLang = (typeof DB !== 'undefined' ? DB.lang() : null) || localStorage.getItem('qm_lang') || 'EN';
    var selectedStar = 0;
    var currentUser = null;
    var strandAlias = {
        STEM: 'STEM',
        ABM: 'ABM',
        HUMSS: 'HUMSS',
        TRM: 'TRM',
        CPG: 'CPG',
        CSS: 'CSS',
        HRS: 'HRS',
        SPT: 'SPT',
    };

    // =============================================
    // Init
    // =============================================
    document.addEventListener('DOMContentLoaded', function () {
        // Expose current language for legacy inline handlers.
        window.currentLang = currentLang;

        applyLang(currentLang);

        // Apply saved theme
        var savedTheme = (typeof DB !== 'undefined' && DB.theme)
            ? DB.theme()
            : (localStorage.getItem('qm_theme') || 'light');
        applyTheme(savedTheme);

        initCategoryCards();
        initCategorySearch();
        initBrowseQuizzesButton();

        // Check session via backend
        DB.checkSession().then(function (user) {
            currentUser = user;
            refreshUserBtn();
            renderReviewForm();
        }).catch(function () {
            currentUser = null;
            refreshUserBtn();
            renderReviewForm();
        });

        // Load reviews from backend
        loadReviews();
    });

    // =============================================
    // Dark mode
    // =============================================
    window.toggleDarkMode = function () {
        var current = (typeof DB !== 'undefined' && DB.theme)
            ? DB.theme()
            : (localStorage.getItem('qm_theme') || 'light');
        var next = current === 'light' ? 'dark' : 'light';
        if (typeof DB !== 'undefined' && DB.saveTheme) {
            DB.saveTheme(next);
        } else {
            localStorage.setItem('qm_theme', next);
        }
        applyTheme(next);
    };

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        var icon = document.getElementById('themeIcon');
        if (icon) {
            icon.src = theme === 'light' ? 'assets/images/homepage/light.png' : 'assets/images/homepage/darkmode.png';
        }
    }

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
        DB.saveLang(lang);
        window.currentLang = lang;
        document.getElementById('recentLang').textContent = lang;
        document.getElementById('btnEN').classList.toggle('lang-active', lang === 'EN');
        document.getElementById('btnFIL').classList.toggle('lang-active', lang === 'FIL');
        document.getElementById('selectLang').classList.remove('active');
        applyLang(lang);
        renderReviewForm();
    };

    function applyLang(lang) {
        var attr = lang === 'FIL' ? 'data-fil' : 'data-en';
        var phAttr = lang === 'FIL' ? 'data-fil-ph' : 'data-en-ph';

        document.querySelectorAll('[data-en]').forEach(function (el) {
            var val = el.getAttribute(attr);
            if (val !== null) el.textContent = val;
        });
        document.querySelectorAll('[data-en-ph]').forEach(function (el) {
            el.placeholder = el.getAttribute(phAttr) || '';
        });

        if (!currentUser) {
            var lbl = document.getElementById('userBtnLabel');
            if (lbl) {
                lbl.textContent = lang === 'FIL' ? 'Mag-log In' : 'Log In';
            }
        }
    }

    function setInner(id, val) {
        var el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    // =============================================
    // User button
    // =============================================
    window.handleUserBtn = function () {
        if (currentUser) {
            DB.logout().then(function () {
                currentUser = null;
                DB.clearCache();
                refreshUserBtn();
                renderReviewForm();
                showToast(
                    currentLang === 'FIL' ? 'Naka-log out ka na.' : 'You have been logged out.',
                    'success'
                );
            }).catch(function () {
                currentUser = null;
                refreshUserBtn();
            });
        } else {
            window.location.href = 'login.html';
        }
    };

    function refreshUserBtn() {
        var btn = document.getElementById('userBtn');
        var label = document.getElementById('userBtnLabel');
        var init = document.getElementById('userInitial');
        if (!btn) return;

        if (currentUser) {
            btn.classList.add('logged-in');
            init.textContent = (currentUser.username || 'U').charAt(0).toUpperCase();
            label.textContent = currentUser.username || currentUser.fullName;
            label.removeAttribute('data-en');
            label.removeAttribute('data-fil');
        } else {
            btn.classList.remove('logged-in');
            // Reset the initial to show profile image
            init.innerHTML = '<img src="assets/images/homepage/profile.png">';
            label.setAttribute('data-en', 'Log In');
            label.setAttribute('data-fil', 'Mag-log In');
            label.textContent = currentLang === 'FIL' ? 'Mag-log In' : 'Log In';
        }
    }

    // =============================================
    // Start Quiz
    // =============================================
    window.startQuiz = function () {
        if (!currentUser) {
            showToast(
                currentLang === 'FIL'
                    ? 'Mag-sign in muna upang magsimula ng quiz.'
                    : 'Please sign in first to start a quiz.',
                'error'
            );
            setTimeout(function () { window.location.href = 'login.html'; }, 1400);
            return;
        }
        window.location.href = 'categories/index.html';
    };

    // =============================================
    // Dashboard
    // =============================================
    window.goToDashboard = function (e) {
        if (!currentUser) {
            if (e) e.preventDefault();
            showToast(
                currentLang === 'FIL'
                    ? 'Mag-sign in muna upang makita ang dashboard.'
                    : 'Please sign in first to view your dashboard.',
                'error'
            );
            setTimeout(function () { window.location.href = 'login.html'; }, 1400);
            return false;
        }
        window.location.href = 'dashboard.html';
        return true;
    };

    // =============================================
    // Reviews – loaded from backend
    // =============================================
    async function loadReviews() {
        try {
            var data = await DB.getReviews();
            renderReviews(data.reviews || []);
        } catch (_) {
            renderReviews([]);
        }
    }

    function renderReviews(reviews) {
        document.querySelectorAll('.user-injected-review').forEach(function (el) { el.remove(); });
        var grid = document.getElementById('reviewsGrid');
        if (!grid) return;

        reviews.forEach(function (r) {
            var div = document.createElement('div');
            div.className = 'thoughts-card user-injected-review';
            div.innerHTML =
                '<div>' +
                    '<div class="rating-icon" style="color:var(--quiz-yellow);font-size:1.1rem">' +
                        '★'.repeat(r.stars) + '☆'.repeat(5 - r.stars) +
                    '</div>' +
                    '<p class="thoughts">"' + esc(r.text) + '"</p>' +
                '</div>' +
                '<div class="user-review">' +
                    '<div class="user-review-initial">' + esc((r.username || 'U').charAt(0).toUpperCase()) + '</div>' +
                    '<div class="user-info">' +
                        '<h4>' + esc(r.username) + '</h4>' +
                        '<p>' + esc(r.role || 'QuizMaster Learner') + '</p>' +
                    '</div>' +
                '</div>';
            grid.appendChild(div);
        });
    }

    function renderReviewForm() {
        var area = document.getElementById('reviewFormArea');
        if (!area) return;
        var fil = currentLang === 'FIL';

        if (!currentUser) {
            area.innerHTML =
                '<div class="login-prompt">' +
                    (fil
                        ? 'Mangyaring <button class="link-btn" onclick="window.location.href=\'login.html\'">mag-sign in</button> upang mag-iwan ng review.'
                        : 'Please <button class="link-btn" onclick="window.location.href=\'login.html\'">sign in</button> to leave a review.') +
                '</div>';
            return;
        }

        area.innerHTML =
            '<div class="review-form">' +
                '<div class="star-row">' +
                    '<label>' + (fil ? 'Rating:' : 'Rating:') + '</label>' +
                    [1,2,3,4,5].map(function (n) {
                        return '<button class="star-btn' + (selectedStar >= n ? ' lit' : '') + '" data-n="' + n + '" onclick="pickStar(' + n + ')">★</button>';
                    }).join('') +
                '</div>' +
                '<div class="review-form-row">' +
                    '<input type="text" id="rv_name" value="' + esc(currentUser.username || '') + '" readonly style="background:var(--light-gray);color:var(--muted-gray);">' +
                    '<input type="text" id="rv_role" placeholder="' + (fil ? 'Iyong papel (hal. Mag-aaral sa Grade 10)' : 'Your role (e.g. Grade 10 Student)') + '">' +
                '</div>' +
                '<textarea id="rv_text" placeholder="' + (fil ? 'Ibahagi ang iyong karanasan sa QuizMaster...' : 'Share your experience with QuizMaster...') + '"></textarea>' +
                '<div>' +
                    '<button class="submit-review-btn" onclick="submitReview()">✉ ' + (fil ? 'Isumite ang Review' : 'Submit Review') + '</button>' +
                '</div>' +
            '</div>';
    }

    window.pickStar = function (n) {
        selectedStar = n;
        document.querySelectorAll('.star-btn').forEach(function (btn) {
            btn.classList.toggle('lit', parseInt(btn.dataset.n) <= n);
        });
    };

    window.submitReview = async function () {
        if (!currentUser) return;
        var fil = currentLang === 'FIL';
        var text = (document.getElementById('rv_text') ? document.getElementById('rv_text').value : '').trim();
        var role = (document.getElementById('rv_role') ? document.getElementById('rv_role').value : '').trim();

        if (!selectedStar) {
            showToast(fil ? 'Mangyaring pumili ng bituin.' : 'Please select a star rating.', 'error');
            return;
        }
        if (text.length < 10) {
            showToast(fil ? 'Mangyaring sumulat ng mas mahabang review.' : 'Please write a longer review (min 10 chars).', 'error');
            return;
        }

        try {
            await DB.submitReview(text, selectedStar, role || 'QuizMaster Learner');
            selectedStar = 0;
            showToast(fil ? 'Salamat sa iyong review! 🌟' : 'Thank you for your review! 🌟', 'success');
            // Reload reviews from server
            await loadReviews();
            renderReviewForm();
        } catch (err) {
            showToast(err.message || 'Failed to submit review.', 'error');
        }
    };

    // =============================================
    // Utilities
    // =============================================
    function esc(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    window.showHome = function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.handleHelpSupport = function () {
        showToast(
            currentLang === 'FIL' ? 'Pakikontak: support@quizmaster.com' : 'Contact: support@quizmaster.com',
            'info'
        );
    };

    window.toggleMobileMenu = function () {
        var nav = document.getElementById('navlinks');
        if (nav) nav.classList.toggle('open');
    };

    function initBrowseQuizzesButton() {
        var btn = document.querySelector('.hero-buttons .secondary');
        if (!btn) return;
        btn.addEventListener('click', function () {
            window.location.href = 'categories/index.html';
        });
    }

    function initCategoryCards() {
        var cards = Array.prototype.slice.call(document.querySelectorAll('.category-cards'));
        cards.forEach(function (card) {
            var strand = getStrandFromCard(card);
            if (!strand) return;

            card.style.cursor = 'pointer';
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');
            card.dataset.strand = strand;

            card.addEventListener('click', function () {
                goToCategories(strand);
            });

            card.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    goToCategories(strand);
                }
            });
        });
    }

    function initCategorySearch() {
        var input = document.getElementById('searchInput');
        if (!input) return;

        input.addEventListener('input', function () {
            var q = input.value.trim().toLowerCase();
            filterCategoryCards(q);
        });

        input.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter') return;
            e.preventDefault();

            var q = input.value.trim().toLowerCase();
            if (!q) {
                window.location.href = 'categories/index.html';
                return;
            }

            var cards = Array.prototype.slice.call(document.querySelectorAll('.category-cards'));
            var matched = cards.find(function (card) {
                var titleEl = card.querySelector('h3');
                return titleEl && titleEl.textContent.toLowerCase().indexOf(q) !== -1;
            });

            if (matched) {
                goToCategories(getStrandFromCard(matched));
            } else {
                showToast(currentLang === 'FIL' ? 'Walang nahanap na kategorya.' : 'No matching category found.', 'warning');
            }
        });
    }

    function filterCategoryCards(query) {
        var cards = Array.prototype.slice.call(document.querySelectorAll('.category-cards'));
        cards.forEach(function (card) {
            var titleEl = card.querySelector('h3');
            var text = titleEl ? titleEl.textContent.toLowerCase() : '';
            var visible = !query || text.indexOf(query) !== -1;
            card.style.display = visible ? '' : 'none';
        });
    }

    function getStrandFromCard(card) {
        if (!card) return '';
        if (card.dataset && card.dataset.strand) return card.dataset.strand;

        var titleEl = card.querySelector('h3');
        if (!titleEl) return '';
        var title = titleEl.textContent || '';

        var match = title.match(/\(([A-Z]{2,5})\)/);
        if (match && strandAlias[match[1]]) return match[1];

        var upper = title.toUpperCase();
        if (upper.indexOf('STEM') !== -1) return 'STEM';
        if (upper.indexOf('ABM') !== -1) return 'ABM';
        if (upper.indexOf('HUMSS') !== -1) return 'HUMSS';
        if (upper.indexOf('TRM') !== -1) return 'TRM';
        if (upper.indexOf('CPG') !== -1) return 'CPG';
        if (upper.indexOf('CSS') !== -1) return 'CSS';
        if (upper.indexOf('HRS') !== -1) return 'HRS';
        if (upper.indexOf('SPT') !== -1) return 'SPT';

        return '';
    }

    function goToCategories(strand) {
        var url = 'categories/index.html';
        if (strand) {
            url += '?strand=' + encodeURIComponent(strand);
        }
        window.location.href = url;
    }
})();
