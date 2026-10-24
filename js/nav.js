/* Tab navigation for the site sections (game, docs).
   Supports deep links: #game, #architecture, #bugs, #journey. */
(function () {
  'use strict';

  var tabs = document.querySelectorAll('.tab');
  var panels = document.querySelectorAll('.tab-panel');

  function activate(name) {
    var found = false;
    tabs.forEach(function (tab) {
      var on = tab.dataset.tab === name;
      if (on) found = true;
      tab.classList.toggle('active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (!found) return;
    panels.forEach(function (panel) {
      panel.classList.toggle('hidden', panel.id !== 'tab-' + name);
    });
    if (('#' + name) !== window.location.hash) {
      history.replaceState(null, '', '#' + name);
    }
  }

  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () { activate(tab.dataset.tab); });
    tab.addEventListener('keydown', function (e) {
      var next = null;
      if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
      if (e.key === 'ArrowLeft') next = tabs[(i + tabs.length - 1) % tabs.length];
      if (next) { next.focus(); activate(next.dataset.tab); }
    });
  });

  var initial = window.location.hash.replace('#', '');
  if (initial) activate(initial);
})();
