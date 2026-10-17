/* Z Fashion backoffice shell: navigation between the real pages.
   Each page is its own module (backoffice-*.js) that loads real data
   through the signed-in admin session. French only. */
(function () {
  'use strict';
  var sidebar = document.getElementById('sidebar');
  var backdrop = document.getElementById('backdrop');
  function closeMenu() { sidebar.classList.remove('open'); backdrop.hidden = true; }
  document.getElementById('menuButton').addEventListener('click', function () { sidebar.classList.add('open'); backdrop.hidden = false; });
  backdrop.addEventListener('click', closeMenu);
  function show(id) {
    document.querySelectorAll('.page').forEach(function (p) { p.classList.toggle('active', p.id === id); });
    var title = id;
    document.querySelectorAll('.nav button[data-page]').forEach(function (b) {
      var on = b.dataset.page === id;
      b.classList.toggle('active', on);
      if (on) { var spans = b.querySelectorAll('span'); title = (spans.length ? spans[spans.length - 1].textContent : b.textContent).trim(); }
    });
    document.getElementById('pageTitle').textContent = title;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    closeMenu();
    document.dispatchEvent(new CustomEvent('zfashion:admin-page', { detail: { page: id } }));
  }
  document.querySelectorAll('[data-page]').forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.page); }); });
  window.ZFashionAdmin = { show: show };
})();
