// ============================================================
// SDMS — Launch polish helper
// Purely presentational: animates rows/items as they're
// inserted by each page's own script, and gently counts up
// the dashboard's stat values. Never touches app state or logic.
// ============================================================
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  // ----------------------------------------------------------
  // Stagger-animate rows/items whenever a container's content
  // is (re)rendered by the page's own JS.
  // ----------------------------------------------------------
  function animateChildren(container) {
    var items = container.children;
    for (var i = 0; i < items.length; i++) {
      var el = items[i];
      el.style.animationDelay = (Math.min(i, 16) * 26) + 'ms';
      el.classList.remove('row-pop');
      // Force reflow so the class can be re-added to replay the animation.
      void el.offsetWidth;
      el.classList.add('row-pop');
    }
  }

  var dynamicSelectors = [
    'tbody',
    '.watch-list',
    '.combobox__list',
    '.offense-reference',
    '#list-panel'
  ];

  document.querySelectorAll(dynamicSelectors.join(',')).forEach(function (container) {
    if (container.children.length) animateChildren(container);
    var observer = new MutationObserver(function () {
      animateChildren(container);
    });
    observer.observe(container, { childList: true });
  });

  // ----------------------------------------------------------
  // Count up numeric stat values the first time each one is
  // populated (e.g. dashboard-admin's stat-ledger figures).
  // ----------------------------------------------------------
  function animateCount(el, rawText) {
    var match = rawText.match(/-?[\d,]+(\.\d+)?/);
    if (!match) return;

    var target = parseFloat(match[0].replace(/,/g, ''));
    if (isNaN(target)) return;

    var prefix = rawText.slice(0, match.index);
    var suffix = rawText.slice(match.index + match[0].length);
    var isDecimal = /\./.test(match[0]);
    var duration = 650;
    var start = null;

    function step(timestamp) {
      if (start === null) start = timestamp;
      var progress = Math.min((timestamp - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = target * eased;
      el.textContent = prefix + (isDecimal ? current.toFixed(1) : Math.round(current).toLocaleString()) + suffix;
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = rawText;
      }
    }
    requestAnimationFrame(step);
  }

  document.querySelectorAll('.stat-ledger__value').forEach(function (el) {
    var observer = new MutationObserver(function () {
      var text = el.textContent.trim();
      if (!text || text === '—') return;
      observer.disconnect();
      animateCount(el, text);
    });
    observer.observe(el, { childList: true, characterData: true, subtree: true });
  });
})();
