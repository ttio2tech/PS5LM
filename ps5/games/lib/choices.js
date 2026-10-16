/*
  A list of buttons the D-pad moves through, for the AI games' menus and
  answers. Choices.show(box, labels, fn(index)) draws them and focuses the
  first; Up/Down move, Cross picks.
  SPDX-License-Identifier: GPL-3.0-or-later
*/
(function (global) {
  'use strict';
  var current = null;   // { buttons, fn }

  function show(box, labels, fn) {
    box.innerHTML = '';
    var list = document.createElement('div');
    list.className = 'choices';
    var buttons = [];
    for (var i = 0; i < labels.length; i++) {
      var b = document.createElement('button');
      b.className = 'choice';
      var k = document.createElement('span');
      k.className = 'k';
      k.textContent = String.fromCharCode(65 + i);
      b.appendChild(k);
      b.appendChild(document.createTextNode(labels[i]));
      b.onclick = (function (n) { return function () { pick(n); }; })(i);
      list.appendChild(b);
      buttons.push(b);
    }
    box.appendChild(list);
    current = { buttons: buttons, fn: fn };
    if (buttons.length) { buttons[0].focus(); }
    return buttons;
  }

  function pick(n) {
    if (!current) { return; }
    var fn = current.fn;
    current = null;  // one pick per list
    fn(n);
  }

  function clear() { current = null; }

  Kit.on(function (action) {
    if (!current) { return true; }
    var b = current.buttons, at = b.indexOf(document.activeElement);
    if (action === 'up' || action === 'left') { b[(at <= 0 ? b.length : at) - 1].focus(); return false; }
    if (action === 'down' || action === 'right') { b[(at + 1) % b.length].focus(); return false; }
    if (action === 'a') { pick(at < 0 ? 0 : at); return false; }
    return true;
  });

  global.Choices = { show: show, clear: clear };
})(window);
