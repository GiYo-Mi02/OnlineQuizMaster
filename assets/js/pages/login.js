// assets/js/pages/login.js  –  SECURE VERSION
// All authentication goes through the backend API.
// Passwords are NEVER stored client-side.
// Session is managed via HTTP-only cookies set by the server.

(function () {
    'use strict';

    // =============================================
    // Constants
    // =============================================

    var COUNTRIES = ["Afghanistan","Albania","Algeria","Andorra","Angola","Antigua and Barbuda","Argentina","Armenia","Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi","Cabo Verde","Cambodia","Cameroon","Canada","Central African Republic","Chad","Chile","China","Colombia","Comoros","Congo","Costa Rica","Croatia","Cuba","Cyprus","Czech Republic","Denmark","Djibouti","Dominica","Dominican Republic","Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia","Fiji","Finland","France","Gabon","Gambia","Georgia","Germany","Ghana","Greece","Grenada","Guatemala","Guinea","Guyana","Haiti","Honduras","Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kiribati","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein","Lithuania","Luxembourg","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Marshall Islands","Mauritania","Mauritius","Mexico","Micronesia","Moldova","Monaco","Mongolia","Montenegro","Morocco","Mozambique","Myanmar","Namibia","Nauru","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Macedonia","Norway","Oman","Pakistan","Palau","Panama","Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia","Rwanda","Saint Kitts and Nevis","Saint Lucia","Samoa","San Marino","Saudi Arabia","Senegal","Serbia","Seychelles","Sierra Leone","Singapore","Slovakia","Slovenia","Solomon Islands","Somalia","South Africa","South Korea","Spain","Sri Lanka","Sudan","Suriname","Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Timor-Leste","Togo","Tonga","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Tuvalu","Uganda","Ukraine","United Arab Emirates","United Kingdom","United States of America","Uruguay","Uzbekistan","Vanuatu","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe"].sort();

    var DISPOSABLE = ['mailinator.com','10minutemail.com','temp-mail.org','guerrillamail.com','sharklasers.com','trashmail.com','yopmail.com','fakeinbox.com'];

    var PASS_REGEX = {
        len  : /.{12,}/,
        upper: /[A-Z]/,
        num  : /[0-9]/,
        sym  : /[!@#$%^&*(),.?":{}|<>]/
    };

    // =============================================
    // Language
    // =============================================

    var currentLang = (typeof DB !== 'undefined' ? DB.lang() : null) || localStorage.getItem('qm_lang') || 'EN';

    var TRANSLATIONS = {
        EN: {
            socialSimMsg   : function(p){ return p + ' sign-in requires a real ' + p + ' app integration. For this demo, use email/password registration.'; },
            forgotMsg      : 'Enter your registered email in the field above, then we\'ll send a reset link.',
            signupSuccess  : function(u){ return '🎉 Welcome, ' + u + '! Your account is ready. Redirecting…'; },
            loginSuccess   : function(u){ return 'Welcome back, ' + u + '! Redirecting…'; },
            errUsernameReq : 'Username is required.',
            errUsernameLong: 'Username must be 3–30 characters.',
            errUsernameInv : 'Username can only contain letters, numbers, and underscores.',
            errUsernameTaken:'This username is already taken.',
            errEmailReq    : 'Email is required.',
            errEmailFmt    : 'Please enter a valid email address.',
            errEmailDisp   : 'Disposable email addresses are not allowed.',
            errEmailTaken  : 'This email is already registered.',
            errCountry     : 'Please select your country.',
            errPassReq     : 'Password is required.',
            errPassWeak    : 'Password does not meet all security requirements.',
            errConfirmReq  : 'Please confirm your password.',
            errConfirmMatch: 'Passwords do not match.',
            errLoginReq    : 'Please enter your username or email.',
            errLoginPassReq: 'Please enter your password.',
            errNotFound    : 'No account found with that username or email.',
            errWrongPass   : 'Incorrect password. Please try again.',
            strengthWeak   : '🔴 Weak',
            strengthFair   : '🟡 Fair',
            strengthGood   : '🟢 Good',
            strengthStrong : '✅ Strong',
        },
        FIL: {
            socialSimMsg   : function(p){ return 'Ang ' + p + ' sign-in ay nangangailangan ng tunay na ' + p + ' app integration. Para sa demo na ito, gamitin ang email/password registration.'; },
            forgotMsg      : 'Ilagay ang iyong nakarehistrong email sa field sa itaas, at magpapadala kami ng reset link.',
            signupSuccess  : function(u){ return '🎉 Maligayang pagdating, ' + u + '! Handa na ang iyong account. Nire-redirect…'; },
            loginSuccess   : function(u){ return 'Maligayang pagbabalik, ' + u + '! Nire-redirect…'; },
            errUsernameReq : 'Kinakailangan ang username.',
            errUsernameLong: 'Ang username ay dapat 3–30 karakter.',
            errUsernameInv : 'Ang username ay maaaring maglaman lamang ng mga titik, numero, at underscore.',
            errUsernameTaken:'Ang username na ito ay ginagamit na.',
            errEmailReq    : 'Kinakailangan ang email.',
            errEmailFmt    : 'Mangyaring maglagay ng wastong email address.',
            errEmailDisp   : 'Hindi pinapayagan ang mga disposable email address.',
            errEmailTaken  : 'Ang email na ito ay nakarehistrong na.',
            errCountry     : 'Mangyaring piliin ang iyong bansa.',
            errPassReq     : 'Kinakailangan ang password.',
            errPassWeak    : 'Hindi natutugunan ng password ang lahat ng kinakailangan sa seguridad.',
            errConfirmReq  : 'Mangyaring kumpirmahin ang iyong password.',
            errConfirmMatch: 'Hindi magkatugma ang mga password.',
            errLoginReq    : 'Mangyaring ilagay ang iyong username o email.',
            errLoginPassReq: 'Mangyaring ilagay ang iyong password.',
            errNotFound    : 'Walang account na natagpuan sa username o email na iyon.',
            errWrongPass   : 'Maling password. Pakisubukan muli.',
            strengthWeak   : '🔴 Mahina',
            strengthFair   : '🟡 Katamtaman',
            strengthGood   : '🟢 Mabuti',
            strengthStrong : '✅ Malakas',
        }
    };

    function T(key) {
        var tbl = TRANSLATIONS[currentLang] || TRANSLATIONS.EN;
        var val = tbl[key];
        var args = Array.prototype.slice.call(arguments, 1);
        return typeof val === 'function' ? val.apply(null, args) : (val || key);
    }

    // =============================================
    // reCAPTCHA state
    // =============================================
    var captchaSignupDone = false;
    var captchaLoginDone  = false;

    window.onSignupCaptcha  = function () { captchaSignupDone = true; var el = document.getElementById('err_captcha_signup'); if (el) el.classList.remove('show'); };
    window.onLoginCaptcha   = function () { captchaLoginDone  = true; var el = document.getElementById('err_captcha_login'); if (el) el.classList.remove('show'); };
    window.onCaptchaExpired = function () { captchaSignupDone = false; captchaLoginDone = false; };

    // =============================================
    // Init
    // =============================================
    document.addEventListener('DOMContentLoaded', function () {
        populateCountries();
        syncLangUI();
        applyLang(currentLang);

        // If already logged in via session cookie, redirect
        if (typeof DB !== 'undefined') {
            DB.checkSession().then(function (user) {
                if (user) window.location.href = 'homepage.html';
            }).catch(function () { /* not logged in */ });
        }
    });

    function populateCountries() {
        var sel = document.getElementById('su_country');
        if (!sel) return;
        COUNTRIES.forEach(function (c) {
            var opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            sel.appendChild(opt);
        });
    }

    // =============================================
    // Tab switching
    // =============================================
    window.switchTab = function (tab) {
        document.getElementById('tabSignup').classList.toggle('active', tab === 'signup');
        document.getElementById('tabLogin').classList.toggle('active',  tab === 'login');
        document.getElementById('panelSignup').classList.toggle('active', tab === 'signup');
        document.getElementById('panelLogin').classList.toggle('active',  tab === 'login');
        clearErrors();

        var errCaptchaSignup = document.getElementById('err_captcha_signup');
        var errCaptchaLogin  = document.getElementById('err_captcha_login');
        if (errCaptchaSignup) errCaptchaSignup.classList.remove('show');
        if (errCaptchaLogin)  errCaptchaLogin.classList.remove('show');
        captchaSignupDone = false;
        captchaLoginDone  = false;
        if (window.grecaptcha) {
            try { grecaptcha.reset(); } catch(e) {}
        }
    };

    // =============================================
    // Password strength meter
    // =============================================
    window.checkPasswordStrength = function () {
        var val   = document.getElementById('su_password').value;
        var fill  = document.getElementById('strengthFill');
        var label = document.getElementById('strengthLabel');
        var box   = document.getElementById('reqBox');

        box.classList.toggle('visible', val.length > 0);

        var r = {
            len  : PASS_REGEX.len.test(val),
            upper: PASS_REGEX.upper.test(val),
            num  : PASS_REGEX.num.test(val),
            sym  : PASS_REGEX.sym.test(val),
        };

        setReq('r_len', r.len);
        setReq('r_up',  r.upper);
        setReq('r_num', r.num);
        setReq('r_sym', r.sym);

        var score  = [r.len, r.upper, r.num, r.sym].filter(Boolean).length;
        var bars   = [0, 25, 50, 75, 100];
        var colors = ['#e2e8f0','#E53E3E','#F97316','#F6C343','#2F855A'];
        var labels = ['', T('strengthWeak'), T('strengthFair'), T('strengthGood'), T('strengthStrong')];

        fill.style.width      = bars[score] + '%';
        fill.style.background = colors[score];
        label.textContent     = labels[score];
        label.style.color     = colors[score];

        checkConfirm();
    };

    function setReq(id, valid) {
        var el   = document.getElementById(id);
        if (!el) return;
        var icon = el.querySelector('.icon');
        el.classList.toggle('valid',   valid);
        el.classList.toggle('invalid', !valid);
        if (icon) icon.textContent = valid ? '✔' : '✖';
    }

    window.checkConfirm = function () {
        var pass    = document.getElementById('su_password').value;
        var confirm = document.getElementById('su_confirm').value;
        var msg     = document.getElementById('matchMsg');
        if (!confirm.length) { msg.className = 'match-msg'; return; }
        if (pass === confirm) {
            msg.className   = 'match-msg good';
            msg.textContent = '✔ Passwords match';
        } else {
            msg.className   = 'match-msg bad';
            msg.textContent = '✖ Passwords do not match';
        }
    };

    // =============================================
    // Password visibility toggle
    // =============================================
    window.toggleEye = function (inputId, btn) {
        var inp = document.getElementById(inputId);
        if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; }
        else                         { inp.type = 'password'; btn.textContent = '👁'; }
    };

    // =============================================
    // SIGNUP – calls backend API (password never stored locally)
    // =============================================
    window.handleSignup = async function () {
        clearErrors();
        var ok = true;

        var username = document.getElementById('su_username').value.trim();
        var email    = document.getElementById('su_email').value.trim().toLowerCase();
        var country  = document.getElementById('su_country').value;
        var pass     = document.getElementById('su_password').value;
        var confirm  = document.getElementById('su_confirm').value;

        // --- Client-side validation (server re-validates) ---
        if (!username) {
            setError('err_username', T('errUsernameReq'));   ok = false;
        } else if (username.length < 3 || username.length > 30) {
            setError('err_username', T('errUsernameLong'));  ok = false;
        } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            setError('err_username', T('errUsernameInv'));   ok = false;
        }

        if (!email) {
            setError('err_email', T('errEmailReq'));   ok = false;
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setError('err_email', T('errEmailFmt'));   ok = false;
        } else if (DISPOSABLE.some(function(d){ return email.endsWith('@' + d); })) {
            setError('err_email', T('errEmailDisp'));  ok = false;
        }

        if (!country) {
            setError('err_country', T('errCountry')); ok = false;
        }

        if (!pass) {
            setError('err_password', T('errPassReq')); ok = false;
        } else {
            var allMet = Object.keys(PASS_REGEX).every(function(k){ return PASS_REGEX[k].test(pass); });
            if (!allMet) { setError('err_password', T('errPassWeak')); ok = false; }
        }

        if (!confirm) {
            setError('err_confirm', T('errConfirmReq'));   ok = false;
        } else if (pass !== confirm) {
            setError('err_confirm', T('errConfirmMatch')); ok = false;
        }

        if (!ok) return;

        // reCAPTCHA
        if (!captchaSignupDone) {
            var errEl = document.getElementById('err_captcha_signup');
            if (errEl) {
                errEl.classList.add('show');
                errEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
        }

        // --- Call backend API ---
        var btn = document.getElementById('btn_signup');
        btn.disabled = true;
        btn.textContent = currentLang === 'FIL' ? 'Ginagawa…' : 'Creating…';

        try {
            var data = await DB.register(email, username, pass, username, country);
            // HTTP-only session cookie set automatically by the server
            toast(T('signupSuccess', data.user.username), 'success');
            setTimeout(function () { window.location.href = 'homepage.html'; }, 1600);
        } catch (err) {
            var msg = err.message || 'Registration failed.';
            if (msg.toLowerCase().indexOf('email') !== -1) {
                setError('err_email', msg);
            } else if (msg.toLowerCase().indexOf('username') !== -1) {
                setError('err_username', msg);
            } else {
                toast(msg, 'error');
            }
            btn.disabled = false;
            btn.textContent = currentLang === 'FIL' ? 'Gumawa ng Account' : 'Create Account';
        }
    };

    // =============================================
    // LOGIN – calls backend API
    // =============================================
    window.handleLogin = async function () {
        clearErrors();
        var ok = true;

        var identifier = document.getElementById('li_user').value.trim();
        var pass       = document.getElementById('li_pass').value;

        if (!identifier) { setError('err_liuser', T('errLoginReq'));     ok = false; }
        if (!pass)       { setError('err_lipass', T('errLoginPassReq')); ok = false; }
        if (!ok) return;

        // reCAPTCHA
        if (!captchaLoginDone) {
            var errEl = document.getElementById('err_captcha_login');
            if (errEl) {
                errEl.classList.add('show');
                errEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
        }

        // --- Call backend API ---
        var btn = document.getElementById('btn_login');
        btn.disabled = true;
        btn.textContent = currentLang === 'FIL' ? 'Nagsa-sign in…' : 'Signing in…';

        try {
            var data = await DB.login(identifier, pass);
            toast(T('loginSuccess', data.user.username), 'success');
            setTimeout(function () { window.location.href = 'homepage.html'; }, 1200);
        } catch (err) {
            var msg = err.message || 'Login failed.';
            if (msg.toLowerCase().indexOf('password') !== -1) {
                setError('err_lipass', msg);
            } else if (msg.toLowerCase().indexOf('account') !== -1 || msg.toLowerCase().indexOf('found') !== -1) {
                setError('err_liuser', msg);
            } else {
                toast(msg, 'error');
            }
            btn.disabled = false;
            btn.textContent = currentLang === 'FIL' ? 'Mag-sign In' : 'Sign In';
        }
    };

    // =============================================
    // Social login placeholder (safe – no redirect to real OAuth)
    // =============================================
    window.socialLogin = function (provider) {
        toast(T('socialSimMsg', provider), 'info');
    };

    // =============================================
    // Forgot password placeholder
    // =============================================
    window.handleForgot = function () {
        toast(T('forgotMsg'));
    };

    // =============================================
    // Error helpers
    // =============================================
    function setError(id, msg) {
        var el = document.getElementById(id);
        if (el) el.textContent = msg;
        var formGroup = el ? el.closest('.form-group') : null;
        var input = formGroup ? formGroup.querySelector('input, select') : null;
        if (input) input.classList.add('has-error');
    }

    function clearErrors() {
        document.querySelectorAll('.field-error').forEach(function(e){ e.textContent = ''; });
        document.querySelectorAll('input.has-error, select.has-error').forEach(function(e){ e.classList.remove('has-error'); });
    }

    // =============================================
    // Toast (uses shared showToast if available)
    // =============================================
    function toast(msg, type) {
        if (typeof showToast === 'function') {
            showToast(msg, type || 'info');
            return;
        }
        var t = document.getElementById('toast');
        if (!t) return;
        t.textContent = msg;
        t.className   = 'toast' + (type ? ' ' + type : '');
        t.classList.add('show');
        setTimeout(function () { t.classList.remove('show'); }, 3500);
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
        localStorage.setItem('qm_lang', lang);
        if (typeof DB !== 'undefined' && DB.saveLang) DB.saveLang(lang);
        syncLangUI();
        applyLang(lang);
        var dd = document.getElementById('selectLang');
        if (dd) dd.classList.remove('active');
    };

    function syncLangUI() {
        var rl = document.getElementById('recentLang');
        if (rl) rl.textContent = currentLang;
        var en = document.getElementById('btnEN');
        var fil = document.getElementById('btnFIL');
        if (en) en.classList.toggle('lang-active', currentLang === 'EN');
        if (fil) fil.classList.toggle('lang-active', currentLang === 'FIL');
    }

    function applyLang(lang) {
        var attr   = lang === 'FIL' ? 'data-fil' : 'data-en';
        var phAttr = lang === 'FIL' ? 'data-fil-ph' : 'data-en-ph';

        document.querySelectorAll('[data-en]').forEach(function (el) {
            var v = el.getAttribute(attr);
            if (v === null) return;
            if (el.children.length === 0) el.innerHTML = v;
            else if (el.tagName === 'BUTTON' || el.tagName === 'A') el.textContent = v;
        });

        document.querySelectorAll('[data-en-ph]').forEach(function (el) {
            var v = el.getAttribute(phAttr);
            if (v) el.placeholder = v;
        });
    }
})();
