/* Elementarium — the first minute: a new player is walked through their first discovery.
 * Not a page of instructions but the real thing: the screen dims but for what to touch next (a tile,
 * or the map), a short note says what to do, and each step goes on when it has been done. Water and
 * dirt make mud; then the yellow dot and the ? tiles are explained, and the rest is theirs. It runs
 * once (store key `welcomed`), and the Help window's "Show me the first steps" runs it again. */
(function (G) {
  'use strict';

  const { ELEM, UI } = G;
  const { ID } = ELEM;
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  let game = null, step = -1, hole = null, tip = null, timer = 0, base = 0, began = 0, firstTime = false, leaving = 0;

  const holding = (key) => game.selected.kind === 'element' && game.selected.t === ELEM.byKey[key].id;
  const count = (t) => game.world.counts[t];
  const tileOf = (key) => () => UI.tile(key);
  const theMap = () => $('#view');
  // a tile still to find, one within reach if there is one, on screen
  const unknownTile = () => $('#table .tile.near') || $('#table .tile.locked');

  const STEPS = [
    {
      card: true, title: 'Welcome to Elementarium',
      text: 'Every grain here is alive: heat spreads, water runs, fire looks for fuel. You start with 17 elements, and the rest are hiding in what they do to each other. Let’s find your first one.',
      next: 'Show me',
    },
    { at: tileOf('water'), title: 'Pick up water', text: 'Click the Water tile.', until: () => holding('water') },
    {
      at: theMap, map: true, title: 'Pour it on the map', text: 'Press and drag on the map to pour water anywhere you like.',
      begin: () => { base = count(ID.WATER); }, until: () => count(ID.WATER) >= base + 40,
    },
    { at: tileOf('dirt'), title: 'Now pick up dirt', text: 'Click the Dirt tile.', until: () => holding('dirt') },
    {
      at: theMap, map: true, title: 'Pour the dirt into the water', text: 'Drag right over your water and watch what happens where they touch.',
      stuck: 'Keep the dirt falling right onto the water.',
      begin: () => { base = count(ID.MUD); }, until: () => count(ID.MUD) > base, linger: 1800,
    },
    {
      at: tileOf('mud'), title: 'Your first discovery!',
      text: 'Water and dirt make Mud, and it has joined your table. A yellow dot means something new is waiting. Every other element is found the same way: mix things, heat them, burn them, leave them alone.',
      next: 'Next',
    },
    {
      at: unknownTile, title: 'Not sure what to try?',
      text: 'A ? is an element you haven’t found yet. Click one and a box shows you how to make it, and Hint picks one for you.',
      next: 'Start playing',
    },
  ];

  function start() {
    if (G.Journey.active) { UI.note('Not during a chapter', 'Leave the chapter first.'); return; }
    stop();
    UI.showAlchemy();
    hole = el('div', 'tour-hole');
    tip = el('div', 'tour-tip');
    tip.setAttribute('role', 'dialog');
    tip.setAttribute('aria-live', 'polite');
    document.body.append(hole, tip);
    step = 0;
    draw();
    timer = setInterval(tick, 150);
  }
  function stop() {
    clearInterval(timer);
    clearTimeout(leaving);
    leaving = 0;
    if (hole) { hole.remove(); tip.remove(); hole = tip = null; }
    step = -1;
  }
  function finish() {
    stop();
    UI.store.set('welcomed', true);
    if (firstTime) UI.markNew('lab'); // and next, the Lab: its dot shows them where
    firstTime = false;
  }
  function go() {
    step++;
    while (step < STEPS.length && STEPS[step].at && !STEPS[step].at()) step++; // nothing to show for it
    if (step >= STEPS.length) { finish(); return; }
    draw();
  }

  function draw() {
    const st = STEPS[step], n = STEPS.length - 1;
    began = performance.now();
    if (st.begin) st.begin();
    tip.innerHTML = '';
    tip.classList.toggle('welcome', !!st.card);
    if (st.card) tip.append(Object.assign(document.createElement('img'), { src: 'icons/icon-192.png', alt: '', className: 'tt-icon', width: 72, height: 72 }));
    const head = el('div', 'tt-head');
    if (!st.card) head.append(el('span', 'tt-step', `${step} of ${n}`));
    head.append(el('b', '', st.title));
    const say = el('p', '', st.text);
    const btns = el('div', 'tt-btns');
    const skip = Object.assign(el('button', 'tt-skip', st.card ? 'I’ll explore on my own' : 'Skip'), { type: 'button' });
    skip.addEventListener('click', finish);
    btns.append(skip);
    if (st.next) {
      const go1 = Object.assign(el('button', 'pill primary', st.next), { type: 'button' });
      go1.addEventListener('click', go);
      btns.append(go1);
    } else btns.append(el('span', 'tt-wait', st.map ? 'Try it on the map' : 'Click the lit tile'));
    tip.append(head, say, btns);
    const t = st.at && st.at();
    if (t && !st.map) t.scrollIntoView({ block: 'center' });
    place();
    if (st.card) tip.querySelector('.primary').focus();
  }

  // keep the light on its target (the table scrolls and the panel can be resized), the note beside it
  function place() {
    const st = STEPS[step], t = st.at && st.at();
    let top, left;
    const tw = tip.offsetWidth, th = tip.offsetHeight, gap = 12;
    if (!t) { // the welcome: the whole screen dim, the card in the middle
      Object.assign(hole.style, { left: `${innerWidth / 2}px`, top: `${innerHeight / 2}px`, width: 0, height: 0 });
      top = (innerHeight - th) / 2; left = (innerWidth - tw) / 2;
    } else {
      const r = t.getBoundingClientRect(), pad = st.map ? 0 : 5;
      Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
      if (st.map) { top = r.top + 10; left = r.left + (r.width - tw) / 2; } // over the top of the map, out of the way of the pour
      else {
        top = r.top - pad - gap - th; // above the tile, over the dark map if there is room
        if (top < 8) top = r.bottom + pad + gap;
        left = r.left + r.width / 2 - tw / 2;
      }
    }
    tip.style.left = `${Math.max(8, Math.min(innerWidth - tw - 8, left))}px`;
    tip.style.top = `${Math.max(8, Math.min(innerHeight - th - 8, top))}px`;
  }

  function tick() {
    if (step < 0 || !hole) return;
    // a window opened over it (Help, the Codex): out of the way until it closes
    const away = UI.anyModalOpen();
    hole.style.display = tip.style.display = away ? 'none' : '';
    if (away) return;
    place();
    const st = STEPS[step];
    if (st.stuck && performance.now() - began > 18000) tip.querySelector('p').textContent = st.stuck;
    if (st.until && !leaving && st.until()) {
      if (st.linger) leaving = setTimeout(() => { leaving = 0; go(); }, st.linger); // let the moment land
      else go();
    }
  }

  function init(g) {
    game = g;
    if (UI.store.get('welcomed', false)) return;
    firstTime = true;
    setTimeout(start, 300); // once the panel has settled
  }

  G.FirstRun = { init, start };
})(globalThis);
