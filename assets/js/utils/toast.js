// assets/js/utils/toast.js
// Unified toast notification system
// Include via <script src="assets/js/utils/toast.js"></script>

var showToast = (function () {
  'use strict';

  // Ensure a toast container exists
  function getContainer() {
    var container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.cssText =
        'position:fixed;top:24px;right:24px;z-index:100000;display:flex;flex-direction:column;gap:10px;pointer-events:none;';
      document.body.appendChild(container);
    }
    return container;
  }

  function show(message, type, duration) {
    type = type || 'info';
    duration = duration || 3200;

    // Also update legacy #toast element if present
    var legacy = document.getElementById('toast');
    if (legacy) {
      legacy.textContent = message;
      legacy.className = 'toast' + (type ? ' ' + type : '');
      legacy.classList.add('show');
      setTimeout(function () { legacy.classList.remove('show'); }, duration);
    }

    // Modern stacked toast
    var container = getContainer();
    var toast = document.createElement('div');
    toast.style.cssText =
      'pointer-events:auto;padding:14px 22px;border-radius:12px;font-family:Inter,sans-serif;' +
      'font-size:14px;color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.18);opacity:0;' +
      'transform:translateX(40px);transition:opacity .3s,transform .3s;max-width:380px;word-break:break-word;';

    var colors = {
      success: '#2F855A',
      error: '#E53E3E',
      warning: '#D69E2E',
      info: '#3182ce',
    };
    toast.style.background = colors[type] || colors.info;
    toast.textContent = message;

    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(function () {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(0)';
    });

    // Animate out
    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 320);
    }, duration);
  }

  return show;
})();
