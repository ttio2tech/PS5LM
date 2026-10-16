/*
  The game store: reads games.json, draws the featured banner, the recently
  played row and the grid, and moves a focus frame between them with the
  D-pad (the nearest item in the direction pressed). Cross opens a game's
  page, Circle goes back, L1 and R1 change the category.
  SPDX-License-Identifier: GPL-3.0-or-later
*/
(function () {
  'use strict';

  var catalog = { categories: ['All'], games: [] };
  var byId = {};
  var category = 0;
  var featured = [];
  var featuredAt = 0;
  var heroTimer = null;
  var open = null;        // the game whose page is open
  var lastFocus = null;   // where focus goes back to when it closes
  var aiUp = null;

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined) { e.appendChild(document.createTextNode(text)); }
    return e;
  }

  function gradient(g) {
    return 'linear-gradient(135deg, ' + g.colors[0] + ' 0%, ' + g.colors[1] + ' 100%)';
  }

  function icon(g) {
    var img = el('img');
    img.src = 'games/' + g.id + '/icon.svg';
    img.alt = '';
    return img;
  }

  function play(g) {
    window.location.href = 'games/' + g.id + '/index.html';
  }

  // ---- drawing ----------------------------------------------------------------------

  function tile(g) {
    var b = el('button', 'tile');
    b.setAttribute('data-nav', '');
    var art = el('div', 'art');
    art.style.background = gradient(g);
    art.appendChild(icon(g));
    if (g.needsAi) { art.appendChild(el('span', 'badge', 'AI')); }
    b.appendChild(art);
    b.appendChild(el('div', 'name', g.name));
    b.appendChild(el('div', 'sub', g.category + (best(g) ? ' · best ' + best(g) : '')));
    b.onclick = function () { showDetail(g); };
    return b;
  }

  function best(g) {
    return Kit.store('best.' + g.id) || 0;
  }

  function drawTabs() {
    var tabs = $('tabs');
    tabs.innerHTML = '';
    for (var i = 0; i < catalog.categories.length; i++) {
      var t = el('button', 'tab' + (i === category ? ' on' : ''), catalog.categories[i]);
      t.setAttribute('data-nav', '');
      t.onclick = (function (n) { return function () { setCategory(n); }; })(i);
      tabs.appendChild(t);
    }
  }

  function drawHero() {
    var g = featured[featuredAt % featured.length];
    if (!g) { return; }
    var hero = $('hero');
    var hadFocus = hero.contains(document.activeElement) ? document.activeElement.className : null;
    hero.innerHTML = '';
    hero.style.background = gradient(g);
    var art = el('div', 'art');
    art.appendChild(icon(g));
    hero.appendChild(art);
    var text = el('div', 'text');
    text.appendChild(el('div', 'kicker', 'Featured · ' + g.category));
    text.appendChild(el('h1', '', g.name));
    text.appendChild(el('p', '', g.tagline));
    var actions = el('div', 'actions');
    var p = el('button', 'play', 'Play');
    p.setAttribute('data-nav', '');
    p.onclick = function () { play(g); };
    var d = el('button', 'ghost', 'Details');
    d.setAttribute('data-nav', '');
    d.onclick = function () { showDetail(g); };
    actions.appendChild(p);
    actions.appendChild(d);
    text.appendChild(actions);
    hero.appendChild(text);
    if (featured.length > 1) {
      var dots = el('div', 'dots');
      for (var i = 0; i < featured.length; i++) {
        dots.appendChild(el('i', i === featuredAt % featured.length ? 'on' : ''));
      }
      hero.appendChild(dots);
    }
    if (hadFocus) { (hadFocus === 'play' ? p : d).focus(); }
  }

  // The banner turns to the next featured game, unless the cursor is on it.
  function rotateHero() {
    window.clearInterval(heroTimer);
    heroTimer = window.setInterval(function () {
      if (open || $('hero').contains(document.activeElement)) { return; }
      featuredAt++;
      drawHero();
    }, 8000);
  }

  function drawRecent() {
    var recent = Kit.store('recent') || [];
    var row = $('recent');
    row.innerHTML = '';
    var n = 0;
    for (var i = 0; i < recent.length; i++) {
      if (byId[recent[i]]) {
        row.appendChild(tile(byId[recent[i]]));
        n++;
      }
    }
    $('recent-shelf').style.display = n ? '' : 'none';
  }

  function drawGrid() {
    var name = catalog.categories[category];
    var grid = $('grid');
    grid.innerHTML = '';
    $('grid-title').textContent = name === 'All' ? 'All games' : name + ' games';
    var n = 0;
    for (var i = 0; i < catalog.games.length; i++) {
      var g = catalog.games[i];
      if (name === 'All' || g.category === name) {
        grid.appendChild(tile(g));
        n++;
      }
    }
    if (!n) { grid.appendChild(el('p', 'empty', 'Nothing here yet.')); }
  }

  function setCategory(n) {
    var count = catalog.categories.length;
    category = ((n % count) + count) % count;
    drawTabs();
    drawGrid();
    var tabs = $('tabs').children;
    if (tabs[category]) { tabs[category].focus(); }
  }

  // ---- a game's page ------------------------------------------------------------------

  function showDetail(g) {
    open = g;
    lastFocus = document.activeElement;
    $('d-art').style.background = gradient(g);
    $('d-icon').src = 'games/' + g.id + '/icon.svg';
    $('d-cat').textContent = g.category + (g.needsAi ? ' · uses the PS5 model' : '');
    $('d-name').textContent = g.name;
    $('d-tag').textContent = g.tagline;
    $('d-desc').textContent = g.description;
    var plays = (Kit.store('plays') || {})[g.id] || 0;
    var stats = $('d-stats');
    stats.innerHTML = '';
    var s1 = el('div'); s1.appendChild(el('b', '', String(best(g) || '–'))); s1.appendChild(document.createTextNode('Best'));
    var s2 = el('div'); s2.appendChild(el('b', '', String(plays))); s2.appendChild(document.createTextNode('Plays'));
    stats.appendChild(s1);
    stats.appendChild(s2);
    var list = $('d-controls');
    list.innerHTML = '';
    for (var i = 0; i < (g.controls || []).length; i++) {
      var li = el('li');
      li.appendChild(el('b', '', g.controls[i][0]));
      li.appendChild(el('span', '', g.controls[i][1]));
      list.appendChild(li);
    }
    $('d-warn').textContent = g.needsAi && aiUp === false
      ? 'No model is loaded on the PS5. Load one from the PS5LM app’s library, then play.' : '';
    $('detail').className = 'detail open';
    $('d-play').focus();
  }

  function closeDetail() {
    open = null;
    $('detail').className = 'detail';
    if (lastFocus && lastFocus.focus) { lastFocus.focus(); }
  }

  // ---- moving the cursor --------------------------------------------------------------

  function navItems() {
    var scope = open ? $('detail') : document;
    var all = scope.querySelectorAll('[data-nav]');
    var out = [];
    for (var i = 0; i < all.length; i++) {
      if (all[i].offsetParent !== null && (open || !$('detail').contains(all[i]))) { out.push(all[i]); }
    }
    return out;
  }

  // The nearest item whose centre lies in the direction pressed, favouring
  // ones in line with the cursor.
  function move(dir) {
    var items = navItems();
    var cur = document.activeElement;
    if (items.indexOf(cur) < 0) {
      if (items.length) { items[0].focus(); }
      return;
    }
    var a = cur.getBoundingClientRect();
    var ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    var bestEl = null, bestScore = Infinity;
    var sideways = dir === 'left' || dir === 'right';
    for (var i = 0; i < items.length; i++) {
      if (items[i] === cur) { continue; }
      var b = items[i].getBoundingClientRect();
      // Left and right stay in the row: the end of a row is the end.
      if (sideways && (b.bottom <= a.top || b.top >= a.bottom)) { continue; }
      var bx = b.left + b.width / 2, by = b.top + b.height / 2;
      var dx = bx - ax, dy = by - ay;
      var along, across;
      if (dir === 'left') { along = -dx; across = dy; }
      if (dir === 'right') { along = dx; across = dy; }
      if (dir === 'up') { along = -dy; across = dx; }
      if (dir === 'down') { along = dy; across = dx; }
      if (along <= 1) { continue; }
      var score = along + Math.abs(across) * 2.5;
      if (score < bestScore) { bestScore = score; bestEl = items[i]; }
    }
    if (bestEl) {
      bestEl.focus();
      keepInView(bestEl);
    }
  }

  function keepInView(e) {
    var scroll = $('scroll');
    if (!scroll.contains(e)) { return; }
    var r = e.getBoundingClientRect(), s = scroll.getBoundingClientRect();
    var pad = 40;
    if (r.top < s.top + pad) {
      scroll.scrollTop -= s.top + pad - r.top;
    } else if (r.bottom > s.bottom - pad) {
      scroll.scrollTop += r.bottom - (s.bottom - pad);
    }
    var row = e.parentNode;
    if (row && row.className === 'row') {
      var rr = row.getBoundingClientRect();
      if (r.left < rr.left) {
        row.scrollLeft -= rr.left - r.left + 12;
      } else if (r.right > rr.right) {
        row.scrollLeft += r.right - rr.right + 12;
      }
    }
  }

  Kit.on(function (action) {
    if (action === 'up' || action === 'down' || action === 'left' || action === 'right') {
      move(action);
    } else if (action === 'a') {
      var f = document.activeElement;
      if (f && f.hasAttribute && f.hasAttribute('data-nav')) {
        f.click();
      } else {
        move('down');
      }
    } else if (action === 'b') {
      if (open) { closeDetail(); }
    } else if (action === 'l1' && !open) {
      setCategory(category - 1);
    } else if (action === 'r1' && !open) {
      setCategory(category + 1);
    } else if (action === 'start' && !open && featured.length) {
      play(featured[featuredAt % featured.length]);
    }
  });

  // ---- the model ----------------------------------------------------------------------

  function checkAi() {
    Kit.aiReady(function (up) {
      aiUp = up;
      var pill = $('ai');
      pill.className = 'ai ' + (up ? 'up' : 'down');
      pill.lastChild.textContent = up ? 'AI ready' : 'No model loaded';
    });
  }

  // ---- start --------------------------------------------------------------------------

  function start(data) {
    catalog = data;
    for (var i = 0; i < catalog.games.length; i++) {
      var g = catalog.games[i];
      byId[g.id] = g;
      if (g.featured) { featured.push(g); }
    }
    if (!featured.length && catalog.games.length) { featured.push(catalog.games[0]); }
    $('d-play').onclick = function () { if (open) { play(open); } };
    $('d-close').onclick = closeDetail;
    $('detail').onclick = function (e) { if (e.target === $('detail')) { closeDetail(); } };
    drawTabs();
    drawHero();
    rotateHero();
    drawRecent();
    drawGrid();
    var first = $('hero').querySelector('.play');
    if (first) { first.focus(); }
    checkAi();
    window.setInterval(checkAi, 15000);
  }

  var xhr = new XMLHttpRequest();
  xhr.open('GET', 'games.json');
  xhr.onload = function () {
    var data = null;
    try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
    if (!data) {
      $('grid').innerHTML = '<p class="empty">The game list could not be read.</p>';
      return;
    }
    start(data);
  };
  xhr.onerror = function () { $('grid').innerHTML = '<p class="empty">The game list could not be loaded.</p>'; };
  xhr.send();
})();
