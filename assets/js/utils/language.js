// assets/js/utils/language.js
// Centralized language management
// Include via <script src="assets/js/utils/language.js"></script>  (after db.js)

var LangManager = (function () {
  'use strict';

  var currentLang = (typeof DB !== 'undefined' ? DB.lang() : null) || localStorage.getItem('qm_lang') || 'EN';

  function getLang() {
    return currentLang;
  }

  function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('qm_lang', lang);
    if (typeof DB !== 'undefined' && DB.saveLang) DB.saveLang(lang);
    applyLang(lang);
    syncLangUI();
  }

  // Apply translations to elements with data-en / data-fil attributes
  function applyLang(lang) {
    lang = lang || currentLang;
    var attr = lang === 'FIL' ? 'data-fil' : 'data-en';
    var phAttr = lang === 'FIL' ? 'data-fil-ph' : 'data-en-ph';

    document.querySelectorAll('[data-en]').forEach(function (el) {
      var val = el.getAttribute(attr);
      if (val === null) return;
      // If it's a leaf node or a button/link set textContent; else innerHTML
      if (el.children.length === 0) {
        el.textContent = val;
      } else if (el.tagName === 'BUTTON' || el.tagName === 'A') {
        el.textContent = val;
      }
    });

    document.querySelectorAll('[data-en-ph]').forEach(function (el) {
      var val = el.getAttribute(phAttr);
      if (val) el.placeholder = val;
    });
  }

  // Sync language toggle UI elements (shared across pages)
  function syncLangUI() {
    var recentLang = document.getElementById('recentLang');
    if (recentLang) recentLang.textContent = currentLang;

    var btnEN = document.getElementById('btnEN');
    var btnFIL = document.getElementById('btnFIL');
    if (btnEN) btnEN.classList.toggle('lang-active', currentLang === 'EN');
    if (btnFIL) btnFIL.classList.toggle('lang-active', currentLang === 'FIL');
  }

  // Toggle the language dropdown open/closed
  function toggleDropdown(e) {
    if (e) e.stopPropagation();
    var dd = document.getElementById('selectLang');
    if (dd) dd.classList.toggle('active');
  }

  // Close dropdown when clicking elsewhere
  document.addEventListener('click', function () {
    var dd = document.getElementById('selectLang');
    if (dd) dd.classList.remove('active');
  });

  return {
    getLang: getLang,
    setLanguage: setLanguage,
    applyLang: applyLang,
    syncLangUI: syncLangUI,
    toggleDropdown: toggleDropdown,
  };
})();
