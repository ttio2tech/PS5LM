/*
  The game kit every page in ps5/games shares: one set of actions from the
  DualSense (Gamepad API, when the browser has it), the keyboard and touch;
  best scores and recently played in localStorage; the way back to the
  store; and the loaded model, for the AI games.

  Plain ES5 with no external files, because the PS5 browser renders modern
  bundles blank.

  Actions: up down left right a (Cross, Enter, Space) b (Circle, Escape,
  Backspace) x (Square, X) y (Triangle, Y) l1 (L1, Q) r1 (R1, E) start
  (Options, P).

  SPDX-License-Identifier: GPL-3.0-or-later
*/
(function (global) {
  'use strict';

  var KEYS = {
    37: 'left', 38: 'up', 39: 'right', 40: 'down',
    65: 'left', 87: 'up', 68: 'right', 83: 'down',  // WASD
    13: 'a', 32: 'a', 27: 'b', 8: 'b', 88: 'x', 89: 'y',
    81: 'l1', 69: 'r1', 80: 'start'
  };
  // The standard gamepad layout: Cross, Circle, Square, Triangle, L1, R1,
  // L2, R2, Create, Options, L3, R3, then the D-pad.
  var BUTTONS = { 0: 'a', 1: 'b', 2: 'x', 3: 'y', 4: 'l1', 5: 'r1', 9: 'start',
    12: 'up', 13: 'down', 14: 'left', 15: 'right' };
  var REPEAT_DELAY = 260, REPEAT_EVERY = 90;  // ms, held directions repeat

  var listeners = [];
  var held = {};
  var padState = {};
  var padRepeat = {};

  function store(key, value) {
    try {
      if (value === undefined) {
        var v = global.localStorage.getItem('arcade.' + key);
        return v === null ? null : JSON.parse(v);
      }
      global.localStorage.setItem('arcade.' + key, JSON.stringify(value));
    } catch (e) { /* private window, or storage turned off */ }
    return null;
  }

  function emit(action, repeat) {
    for (var i = 0; i < listeners.length; i++) {
      if (listeners[i](action, !!repeat) === false) { return; }
    }
  }

  function press(action, repeat) {
    held[action] = true;
    emit(action, repeat);
  }

  function release(action) {
    held[action] = false;
  }

  global.addEventListener('keydown', function (e) {
    var t = e.target && e.target.tagName;
    if ((t === 'INPUT' || t === 'TEXTAREA') && e.keyCode !== 27) { return; }
    var action = KEYS[e.keyCode];
    if (!action) { return; }
    e.preventDefault();  // no scrolling, and Backspace does not leave the page
    press(action, e.repeat);
  });
  global.addEventListener('keyup', function (e) {
    var action = KEYS[e.keyCode];
    if (action) { release(action); }
  });

  function pollPads() {
    var pads = global.navigator.getGamepads ? global.navigator.getGamepads() : [];
    var now = Date.now();
    var down = {};
    for (var p = 0; p < pads.length; p++) {
      var pad = pads[p];
      if (!pad) { continue; }
      for (var b in BUTTONS) {
        if (pad.buttons[b] && pad.buttons[b].pressed) { down[BUTTONS[b]] = true; }
      }
      // The left stick, as the D-pad.
      var x = pad.axes[0] || 0, y = pad.axes[1] || 0;
      if (x < -0.5) { down.left = true; }
      if (x > 0.5) { down.right = true; }
      if (y < -0.5) { down.up = true; }
      if (y > 0.5) { down.down = true; }
    }
    for (var a in down) {
      if (!padState[a]) {
        padState[a] = true;
        padRepeat[a] = now + REPEAT_DELAY;
        press(a, false);
      } else if ((a === 'up' || a === 'down' || a === 'left' || a === 'right') && now >= padRepeat[a]) {
        padRepeat[a] = now + REPEAT_EVERY;
        press(a, true);
      }
    }
    for (var s in padState) {
      if (padState[s] && !down[s]) {
        padState[s] = false;
        release(s);
      }
    }
    global.requestAnimationFrame(pollPads);
  }
  if (global.navigator.getGamepads) { global.requestAnimationFrame(pollPads); }

  // ---- the page around a game --------------------------------------------------------

  var game = null;     // { id, name }
  var paused = false;
  var pauseHandler = null;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined) { e.appendChild(document.createTextNode(text)); }
    return e;
  }

  function toStore() {
    global.location.href = '../../index.html';
  }

  function setText(id, text) {
    var e = document.getElementById(id);
    if (e) { e.textContent = text; }
  }

  // The bar on top of every game: back to the store, the name, the score.
  function buildBar(opts) {
    var bar = el('div', 'kit-bar');
    var back = el('button', 'kit-back', '◀ Store');
    back.onclick = toStore;
    bar.appendChild(back);
    bar.appendChild(el('div', 'kit-title', opts.name));
    var score = el('div', 'kit-score');
    if (opts.score !== false) {
      score.innerHTML = '<span>Score <b id="kit-score">0</b></span><span>Best <b id="kit-best">0</b></span>';
    }
    bar.appendChild(score);
    var help = el('button', 'kit-help', '☰ Pause');
    help.onclick = function () { Kit.pause(!paused); };
    bar.appendChild(help);
    document.body.insertBefore(bar, document.body.firstChild);
  }

  function buildPause(opts) {
    var layer = el('div', 'kit-pause');
    layer.id = 'kit-pause';
    var box = el('div', 'kit-pause-box');
    box.appendChild(el('h2', '', 'Paused'));
    var list = el('ul', 'kit-controls');
    for (var i = 0; i < (opts.controls || []).length; i++) {
      var li = el('li');
      li.appendChild(el('b', '', opts.controls[i][0]));
      li.appendChild(el('span', '', opts.controls[i][1]));
      list.appendChild(li);
    }
    box.appendChild(list);
    var row = el('div', 'kit-pause-row');
    var resume = el('button', 'kit-btn kit-primary', 'Resume');
    resume.onclick = function () { Kit.pause(false); };
    var leave = el('button', 'kit-btn', 'Back to store');
    leave.onclick = toStore;
    row.appendChild(resume);
    row.appendChild(leave);
    box.appendChild(row);
    layer.appendChild(box);
    document.body.appendChild(layer);
  }

  // On-screen buttons for phones and tablets, sending the same actions.
  function buildTouch(opts) {
    var pad = el('div', 'kit-touch');
    var dirs = el('div', 'kit-dirs');
    var names = ['up', 'left', 'right', 'down'];
    var marks = { up: '▲', left: '◀', right: '▶', down: '▼' };
    for (var i = 0; i < names.length; i++) {
      dirs.appendChild(touchButton(names[i], marks[names[i]], 'kit-' + names[i]));
    }
    pad.appendChild(dirs);
    var acts = el('div', 'kit-acts');
    var buttons = opts.touch || [['a', '✕']];
    for (var j = 0; j < buttons.length; j++) {
      acts.appendChild(touchButton(buttons[j][0], buttons[j][1], 'kit-act'));
    }
    pad.appendChild(acts);
    document.body.appendChild(pad);
    document.body.className += ' kit-has-touch';
  }

  function touchButton(action, label, cls) {
    var b = el('button', cls, label);
    var timer = null;
    function down(e) {
      e.preventDefault();
      press(action, false);
      if (action === 'up' || action === 'down' || action === 'left' || action === 'right') {
        timer = global.setTimeout(function again() {
          press(action, true);
          timer = global.setTimeout(again, REPEAT_EVERY);
        }, REPEAT_DELAY);
      }
    }
    function up(e) {
      e.preventDefault();
      global.clearTimeout(timer);
      release(action);
    }
    b.addEventListener('touchstart', down);
    b.addEventListener('touchend', up);
    b.addEventListener('touchcancel', up);
    return b;
  }

  var Kit = {
    store: store,
    held: function (action) { return !!held[action]; },

    // fn(action, repeat), in the order added; return false to keep the
    // action from the ones after.
    on: function (fn) { listeners.push(fn); },

    // opts: { id, name, controls: [[button, what]], touch: [[action, label]],
    //         score: false, onPause: fn(paused) }
    init: function (opts) {
      game = opts;
      pauseHandler = opts.onPause || null;
      buildBar(opts);
      buildPause(opts);
      if ('ontouchstart' in global && opts.touch !== false) { buildTouch(opts); }
      Kit.setBest(Kit.best());
      // A click or tap while a banner is up does what Cross would.
      document.addEventListener('click', function (e) {
        var b = document.getElementById('kit-banner');
        if (b && b.className.indexOf('kit-shown') >= 0 && !paused && e.target.tagName !== 'BUTTON') { emit('a', false); }
      });
      var recent = store('recent') || [];
      for (var i = recent.length - 1; i >= 0; i--) {
        if (recent[i] === opts.id) { recent.splice(i, 1); }
      }
      recent.unshift(opts.id);
      store('recent', recent.slice(0, 8));
      var plays = store('plays') || {};
      plays[opts.id] = (plays[opts.id] || 0) + 1;
      store('plays', plays);
      // Pause and the way out come before the game's own handling.
      listeners.unshift(function (action) {
        if (action === 'start') {
          Kit.pause(!paused);
          return false;
        }
        if (paused) {
          if (action === 'b') { Kit.pause(false); }
          if (action === 'a') {
            var f = document.activeElement;
            if (f && f.tagName === 'BUTTON') { f.click(); } else { Kit.pause(false); }
          }
          if (action === 'left' || action === 'right' || action === 'up' || action === 'down') {
            var buttons = document.querySelectorAll('#kit-pause button');
            var idx = 0;
            for (var k = 0; k < buttons.length; k++) { if (buttons[k] === document.activeElement) { idx = k; } }
            idx = (idx + (action === 'left' || action === 'up' ? buttons.length - 1 : 1)) % buttons.length;
            buttons[idx].focus();
          }
          return false;
        }
        return true;
      });
    },

    pause: function (on) {
      paused = !!on;
      var layer = document.getElementById('kit-pause');
      if (layer) { layer.className = paused ? 'kit-pause kit-shown' : 'kit-pause'; }
      if (paused) {
        var first = document.querySelector('#kit-pause button');
        if (first) { first.focus(); }
      }
      if (pauseHandler) { pauseHandler(paused); }
    },
    paused: function () { return paused; },
    back: toStore,

    setScore: function (n) { setText('kit-score', String(n)); },
    best: function () { var b = store('best.' + game.id); return b || 0; },
    setBest: function (n) { setText('kit-best', String(n)); },
    // Saves n when it beats the best; true when it did.
    submit: function (n, lowerIsBetter) {
      var b = store('best.' + game.id);
      if (b === null || b === 0 || (lowerIsBetter ? n < b : n > b)) {
        store('best.' + game.id, n);
        Kit.setBest(n);
        return true;
      }
      return false;
    },

    // A message over the game: title, line, and what Cross does.
    banner: function (title, line, button) {
      var b = document.getElementById('kit-banner');
      if (!b) {
        b = el('div', 'kit-banner');
        b.id = 'kit-banner';
        document.body.appendChild(b);
      }
      if (!title) {
        b.className = 'kit-banner';
        return;
      }
      b.innerHTML = '';
      b.appendChild(el('h2', '', title));
      if (line) { b.appendChild(el('p', '', line)); }
      if (button) { b.appendChild(el('div', 'kit-hint', button)); }
      b.className = 'kit-banner kit-shown';
    },

    // A canvas that fills what the page leaves it, at the screen's pixels.
    fit: function (canvas, aspect) {
      function resize() {
        var bar = document.querySelector('.kit-bar');
        var touch = document.querySelector('.kit-touch');
        var w = global.innerWidth - 32;
        var h = global.innerHeight - (bar ? bar.offsetHeight : 0) - (touch ? touch.offsetHeight : 0) - 32;
        if (w / h > aspect) { w = h * aspect; } else { h = w / aspect; }
        canvas.style.width = Math.floor(w) + 'px';
        canvas.style.height = Math.floor(h) + 'px';
      }
      global.addEventListener('resize', resize);
      resize();
    },

    // ---- the loaded model ----

    // cb(err, text). Asks the PS5's model through the store's own /v1/.
    ai: function (messages, opts, cb) {
      opts = opts || {};
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/v1/chat/completions');
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.timeout = 180000;
      xhr.onload = function () {
        var body = null;
        try { body = JSON.parse(xhr.responseText); } catch (e) { body = null; }
        if (xhr.status !== 200 || !body || !body.choices || !body.choices.length) {
          var msg = body && body.error && body.error.message ? body.error.message : 'The model did not answer (' + xhr.status + ')';
          cb(msg, null);
          return;
        }
        var m = body.choices[0].message || {};
        cb(null, Kit.stripThinking(m.content || ''));
      };
      xhr.onerror = function () { cb('No connection to the PS5', null); };
      xhr.ontimeout = function () { cb('The model took too long', null); };
      xhr.send(JSON.stringify({
        messages: messages,
        temperature: opts.temperature === undefined ? 0.9 : opts.temperature,
        max_tokens: opts.max_tokens || 400,
        stream: false,
        // Reasoning models answer at once instead of thinking first.
        chat_template_kwargs: { enable_thinking: false },
        reasoning_format: 'none'
      }));
    },

    stripThinking: function (text) {
      return text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\S]*<\/think>/, '').trim();
    },

    // The first {...} in a reply, parsed, or null.
    json: function (text) {
      var a = text.indexOf('{'), b = text.lastIndexOf('}');
      if (a < 0 || b <= a) { return null; }
      try { return JSON.parse(text.slice(a, b + 1)); } catch (e) { return null; }
    },

    // cb(true) when a model is loaded and ready.
    aiReady: function (cb) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/health');
      xhr.timeout = 4000;
      xhr.onload = function () { cb(xhr.status === 200); };
      xhr.onerror = xhr.ontimeout = function () { cb(false); };
      xhr.send();
    }
  };

  global.Kit = Kit;
})(window);
