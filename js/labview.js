/* Elementarium — the Lab on screen.
 * lab.js holds the rules. This file shows the bench: a mystery sample, seven tests that run in a
 * test tube of their own (a separate little world with its own renderer and loop, only while the
 * Lab is open; the main world stays paused under the modal), your master's handbook to compare
 * the candidates in, and the card each element earns when you name it. */
(function (G) {
  'use strict';

  const { ELEM, Lab, UI, AudioFX, Renderer, TryIt } = G;
  const { list } = ELEM;
  const P = ELEM.periodic;
  const bySym = Object.fromEntries(P.map((d) => [d.sym, d]));
  const $ = (s) => document.querySelector(s);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TICK_MS = 1000 / 60;

  let game = null;
  // The sample on the bench. It is kept in the browser too, so closing the Lab (or reloading)
  // can't swap a hard sample for an easier one, and a wrong answer's wait can't be skipped.
  let cur = null;    // { target, candidates, need, ran: [test], struck: Set }
  let verdict = null; // what the last answer earned: { right, target, guess, ran, need, first }
  let wait = 0;      // Date.now() until which the next sample is still being prepared
  let bench = null, shown = true; // the test running in the tube, and whether its reading is out yet

  function saveState() {
    UI.store.set('lab', cur
      ? { t: cur.target.sym, c: cur.candidates.map((d) => d.sym), ran: cur.ran, wait }
      : { wait });
  }
  function loadState() {
    const s = UI.store.get('lab', {});
    wait = s.wait || 0;
    const target = bySym[s.t], candidates = (s.c || []).map((k) => bySym[k]);
    if (!target || Lab.has(target.id) || !candidates.includes(target) || candidates.some((d) => !d)) return;
    const others = candidates.filter((d) => d !== target);
    cur = { target, candidates, need: Lab.fewest(target, others), ran: (s.ran || []).filter((k) => Lab.TESTS.includes(k)), struck: new Set() };
  }
  function newSample() {
    const s = Lab.makeSample();
    cur = s ? { ...s, ran: [], struck: new Set() } : null;
    saveState();
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function button(label, cls, fn) {
    const b = el('button', cls, label);
    b.type = 'button';
    b.addEventListener('click', () => { AudioFX.click(); fn(); });
    return b;
  }
  function clearJar() {
    const c = el('canvas');
    c.width = c.height = 40;
    const x = c.getContext('2d');
    x.fillStyle = '#16262a';
    x.fillRect(0, 0, 40, 40);
    x.fillStyle = 'rgba(220, 236, 245, 0.16)';
    x.fillRect(6, 4, 4, 32);
    return c;
  }
  const lower = (d) => d.name.toLowerCase();
  const famName = (d) => d.family.toLowerCase();
  function discoveredLine(d) {
    const f = Lab.fact(d);
    return f[0] === 'ancient' ? 'Known since ancient times' : `Discovered ${f[0]} by ${f[1]}`;
  }

  // ───── test icons (16 × 16) ─────
  const stroke = (d, w = 1.4) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const ICON = {
    flame: '<path d="M8 15c-3 0-4.6-2.2-4.6-4.6 0-2.6 2-4 2.6-6.4.9 1.2 1.2 2.4 1.1 3.4C8.4 6 9.6 4 9.2 1.3c2.4 1.7 3.4 4.6 3.4 7.6 0 3.4-1.8 6.1-4.6 6.1z" fill="currentColor"/>',
    water: '<path d="M8 1.5C5.6 5.3 3.6 7.6 3.6 10.2a4.4 4.4 0 008.8 0C12.4 7.6 10.4 5.3 8 1.5z" fill="currentColor"/>',
    acid: stroke('M5.5 1.5h5M6.3 1.5v4.2L2.4 13a1.3 1.3 0 001.1 1.9h9a1.3 1.3 0 001.1-1.9L9.7 5.7V1.5') + '<path d="M4.4 10.3h7.2l1.8 3.2a.9.9 0 01-.8 1.3H3.4a.9.9 0 01-.8-1.3z" fill="currentColor"/>',
    heat: stroke('M6.5 9.4V2.8a1.5 1.5 0 013 0v6.6') + '<circle cx="8" cy="11.8" r="2.7" fill="currentColor"/><path d="M7.3 5h1.4v6H7.3z" fill="currentColor"/>',
    weigh: stroke('M8 2v12M4.5 14h7M2.5 4.5h11') + stroke('M2.5 4.5L.9 9h3.2zM13.5 4.5L11.9 9h3.2z', 1.1) + '<path d="M.9 9a1.6 1.6 0 003.2 0zM11.9 9a1.6 1.6 0 003.2 0z" fill="currentColor"/>',
    current: '<path d="M9.5 1L3.5 9.2h3.8L6 15l6.5-8.6H8.6z" fill="currentColor"/>',
    geiger: '<circle cx="8" cy="8" r="1.4" fill="currentColor"/><path d="M6.8 5.9L4.9 2.6A6.2 6.2 0 0111.1 2.6L9.2 5.9A2.4 2.4 0 006.8 5.9zM10.4 8h3.8A6.2 6.2 0 0111.1 13.4L9.2 10.1A2.4 2.4 0 0010.4 8zM6.8 10.1L4.9 13.4A6.2 6.2 0 011.8 8h3.8A2.4 2.4 0 006.8 10.1z" fill="currentColor"/>',
  };
  const icon = (k) => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${ICON[k]}</svg>`;

  // ───── the test tube: a world and renderer of its own ─────
  const canvas = el('canvas', 'tube');
  canvas.setAttribute('aria-label', 'The test tube');
  const tube = Renderer.createRenderer(canvas);
  let tubeWorld = null;
  function showInTube(b) {
    tubeWorld = b.world;
    tube.setWorld(tubeWorld);
  }
  function tubeEvents(ev) {
    for (let k = 0; k < ev.booms.length; k += 4) {
      tube.shake(ev.booms[k + 2] * 0.4);
      tube.blast(ev.booms[k], ev.booms[k + 1], ev.booms[k + 2], ev.booms[k + 3]);
    }
    for (let k = 0; k < ev.rx.length; k += 3) tube.sparkle(ev.rx[k], ev.rx[k + 1], ev.rx[k + 2]);
    if (ev.bolts.length) tube.flash(0.6);
    if (ev.fission) tube.flash(Math.min(0.7, ev.fission * 0.03));
    AudioFX.frame(ev);
  }

  let raf = 0, prev = 0, acc = 0;
  const isOpen = () => !$('#lab').hidden;
  function loop(now) {
    raf = 0;
    if (!isOpen()) { bench = null; if (tour >= 0) { endTour(false); tourWanted = true; } return; } // closed mid-tour: it picks up next time
    const dt = Math.min(100, now - prev);
    prev = now;
    if (bench) {
      acc += dt;
      let n = 0;
      while (acc >= TICK_MS && n < 4) { bench.step(); acc -= TICK_MS; n++; }
      if (n === 4) acc = 0;
      bench.flush(tubeEvents);
      const r = $('#lab .tube-reading');
      if (r) r.textContent = bench.reading();
      if (!shown && bench.showing) { shown = true; render(); tourEvent('shown'); }
    }
    if (tubeWorld) tube.draw(tubeWorld.tick, { thermal: false, air: false, reducedMotion, lens: false, weather: { ambient: 20, gloom: 0 }, disasters: tubeWorld.disasters });
    const w = $('#lab .wait-left');
    if (w) {
      const ms = wait - Date.now(), left = Math.ceil(ms / 1000);
      if (left > 0) {
        w.textContent = `${left} s`;
        const fill = $('#lab .lt-fill');
        if (fill) fill.style.width = `${(1 - ms / Lab.RETRY_MS) * 100}%`;
      } else render();
    }
    placeTour();
    raf = requestAnimationFrame(loop);
  }
  function startLoop() {
    if (raf) return;
    prev = performance.now();
    acc = 0;
    raf = requestAnimationFrame(loop);
  }

  // ───── running a test ─────
  function runTest(test) {
    if (!cur || !shown || cur.ran.includes(test) || cur.ran.length >= Lab.TEST_BUDGET) return;
    cur.ran.push(test);
    saveState();
    bench = Lab.bench(test, cur.target);
    shown = false;
    showInTube(bench);
    render();
    tourEvent('test');
  }

  function guess(d) {
    if (!cur || !shown) return;
    if (tour >= 0) endTour(true); // named it: the tour has done its job
    const target = cur.target, right = d === target;
    // the first time you identify one of a family, its card comes with it (the start set doesn't count)
    const first = right && !P.some((e) => e !== target && e.fam === target.fam && Lab.has(e.id) && !Lab.START.includes(e.sym));
    verdict = { right, target, guess: d, ran: cur.ran.slice(), need: cur.need, first };
    bench = null;
    shown = true;
    if (right) {
      Lab.unlock(target.id);
      game.world.disc[target.id] = 1;
      AudioFX.discovery();
      if (first) setTimeout(() => AudioFX.unlock(), 700);
      UI.refreshTable();
    } else {
      wait = Date.now() + Lab.RETRY_MS;
    }
    cur = null;
    saveState();
    render();
  }

  function next() {
    verdict = null;
    if (Date.now() >= wait) newSample();
    if (cur) showInTube(Lab.bench('idle', cur.target));
    render();
  }

  // ───── the wait for a fresh sample ─────
  // A flask bubbling away on the bench, and a bar that fills as the sample gets ready; once it is,
  // the flask settles and the bar turns gold.
  const FLASK = '<svg class="lt-flask" viewBox="0 0 40 48" width="40" height="48" aria-hidden="true">'
    + '<path class="lt-liquid" d="M9.3 30h21.4l4.1 8.1a3.4 3.4 0 01-3 4.9H8.2a3.4 3.4 0 01-3-4.9z"/>'
    + '<circle class="lt-b b1" cx="16" cy="38" r="1.9"/><circle class="lt-b b2" cx="23" cy="39" r="1.4"/><circle class="lt-b b3" cx="20" cy="35" r="1.1"/>'
    + '<path class="lt-glass" d="M14 3.5h12M16 3.5v12.2L5.5 37.4a4.4 4.4 0 004 6.1h21a4.4 4.4 0 004-6.1L24 15.7V3.5"/></svg>';
  function waitBox() {
    const ms = wait - Date.now(), ready = ms <= 0;
    const box = el('div', `lab-timer${ready ? ' ready' : ''}`);
    box.insertAdjacentHTML('afterbegin', FLASK);
    const txt = el('div', 'lt-text');
    txt.append(el('div', 'lt-label', ready ? 'A fresh sample is ready' : 'Preparing a fresh sample'),
      el('div', 'lt-sub', ready ? 'It is on the bench, waiting for you.' : 'Your master is weighing it out and sealing it in its jar.'));
    const bar = el('div', 'lt-bar'), fill = el('i', 'lt-fill');
    fill.style.width = `${ready ? 100 : (1 - ms / Lab.RETRY_MS) * 100}%`;
    bar.append(fill);
    txt.append(bar);
    box.append(txt, el('span', ready ? 'lt-left' : 'lt-left wait-left', ready ? '✓' : `${Math.ceil(ms / 1000)} s`));
    return box;
  }

  // ───── the tour, the first time the Lab opens (and again from its ?) ─────
  // It walks you through your first sample on the bench itself: the page dims and each part lights
  // up in turn, with a note beside it. You run a real test when it asks, and it moves on by itself.
  // `wait`: what you must do before it goes on (run a test, or let the reading come out).
  const TOUR = [
    { at: '.sample-card', title: 'Your mystery sample', text: 'An element you haven’t unlocked yet, sealed in a jar. Your job is to work out which one it is.' },
    { at: '.handbook thead', title: 'What it might be', text: 'It is one of these. Each column is what your master’s handbook says that element does in each test, roughly.' },
    { at: '.test-row', title: 'Run a test', text: 'You may run three. Pick one whose row reads differently for the candidates (◆ marks those for your first samples). Try one now.', wait: 'test' },
    { at: '.tube-wrap', title: 'Watch the tube', text: 'The test runs here, in a tube of its own. Its exact reading comes out under the tube.', wait: 'shown' },
    { at: '.handbook-wrap', title: 'Which one matches?', text: 'The reading is in the Sample column now. Compare it with each candidate’s row, and click a name to cross out one that doesn’t fit. Two still fit? Run another test.' },
    { at: '.handbook tfoot', title: 'Name it', text: 'When only one fits, name it. Right, and it unlocks: you can paint with it, and its neighbours on the table become ready to research. Wrong, and it stays locked, and the next sample takes ten seconds.' },
  ];
  let tour = -1, tourWanted = false; // the step on show (-1: none), and whether to start it at the next bench
  let tourHole = null, tourTip = null;
  function startTour() { tourWanted = false; tour = 0; drawTour(); }
  function endTour(done) {
    tour = -1;
    if (done) UI.store.set('labGuide', true);
    if (tourHole) { tourHole.remove(); tourTip.remove(); tourHole = tourTip = null; }
  }
  // something happened on the bench: a waiting step may now go on
  function tourEvent(kind) {
    if (tour < 0 || TOUR[tour].wait !== kind) return;
    tour++;
    drawTour();
  }
  function drawTour() {
    if (tour < 0) return;
    if (tour >= TOUR.length) { endTour(true); return; }
    if (!tourHole) {
      tourHole = el('div', 'tour-hole');
      tourTip = el('div', 'tour-tip');
      tourTip.setAttribute('role', 'dialog');
      tourTip.setAttribute('aria-live', 'polite');
      document.body.append(tourHole, tourTip);
    }
    const st = TOUR[tour], last = tour === TOUR.length - 1;
    // a step waiting for something that can't happen now (no tests left, no test running) just goes on
    const waits = st.wait === 'test' ? !!cur && cur.ran.length < Lab.TEST_BUDGET : st.wait === 'shown' ? !shown : false;
    tourTip.innerHTML = '';
    const head = el('div', 'tt-head');
    head.append(el('span', 'tt-step', `${tour + 1} of ${TOUR.length}`), el('b', '', st.title));
    const btns = el('div', 'tt-btns');
    btns.append(button('Skip the tour', 'tt-skip', () => endTour(true)));
    if (waits) btns.append(el('span', 'tt-wait', st.wait === 'test' ? 'Click a test to go on' : 'Running the test…'));
    else btns.append(button(last ? 'Start researching' : 'Next', 'pill primary', () => { tour++; drawTour(); }));
    tourTip.append(head, el('p', '', st.text), btns);
    placeTour();
  }
  // keep the light on its part (the bench is redrawn often, and scrolls), the note beside it
  function placeTour() {
    if (tour < 0 || !tourHole) return;
    const t = $(`#lab ${TOUR[tour].at}`);
    if (!t) { tourHole.style.opacity = 0; tourTip.style.opacity = 0; return; }
    const r = t.getBoundingClientRect(), pad = 6;
    Object.assign(tourHole.style, { opacity: 1, left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const tw = tourTip.offsetWidth, th = tourTip.offsetHeight, gap = 14;
    let top = r.bottom + pad + gap;
    if (top + th > innerHeight - 8) top = r.top - pad - gap - th; // no room below: above it
    if (top < 8) top = Math.max(8, Math.min(innerHeight - th - 8, r.top + 8)); // nor above: over its edge
    const left = Math.max(8, Math.min(innerWidth - tw - 8, r.left + Math.min(24, r.width / 4)));
    Object.assign(tourTip.style, { opacity: 1, left: `${left}px`, top: `${top}px` });
  }

  // ───── what the Lab shows ─────
  function render() {
    const body = $('#lab-body'), actions = $('#lab-actions');
    body.innerHTML = '';
    actions.innerHTML = '';
    const ready = Lab.readyList().length;
    $('#lab-progress').textContent = `${Lab.count()} of ${P.length} unlocked · ${ready} ready to research`;
    const close = button('Back to the table', 'pill', () => UI.closeModal($('#lab')));

    if (verdict) { renderVerdict(body, actions, close); return; }
    if (!cur && Date.now() < wait) {
      $('#lab-eyebrow').textContent = 'The Lab';
      $('#lab-title').textContent = 'Preparing a sample';
      const box = el('div', 'lab-wait');
      box.append(el('p', '', 'Your master always said a wrong guess costs time, not just pride. A fresh sample is on its way.'));
      box.append(waitBox());
      body.append(box);
      actions.append(close);
      return;
    }
    if (!cur) newSample();
    if (!cur) {
      $('#lab-eyebrow').textContent = 'The Lab';
      $('#lab-title').textContent = 'The table is complete';
      body.append(el('p', 'lab-wait', `Every one of the ${P.length} elements is on your table. There is nothing left to identify.`));
      actions.append(close);
      return;
    }
    renderBench(body);
    actions.append(close);
    if (tourWanted) requestAnimationFrame(startTour); // once the bench is laid out
    else if (tour >= 0) requestAnimationFrame(drawTour);
  }

  function renderBench(body) {
    const { target, candidates, ran } = cur;
    const left = Lab.TEST_BUDGET - ran.length;
    $('#lab-eyebrow').textContent = `The Lab · sample ${Lab.identified() + 1}`;
    $('#lab-title').textContent = 'Mystery sample';

    const grid = el('div', 'lab-bench');
    const leftCol = el('div', 'lab-left');
    // the sample
    const card = el('div', 'sample-card');
    const s = Lab.stateOf(target);
    // a colourless gas looks like nothing in its jar (its swatch would show its discharge glow)
    card.append(s === 'gas' && !target.gasColor ? clearJar() : UI.swatch(target.id, 40, 40));
    const what = el('div', 'what');
    what.append(el('div', 'lbl', 'The sample'), el('div', 'desc', s === 'gas' ? 'A gas, in a sealed jar' : s === 'liquid' ? 'A liquid'
      : ['alk', 'ae', 'tm', 'pt', 'ln', 'an', 'sh'].includes(target.fam) ? 'A metal' : 'A solid'));
    const dots = el('div', 'tests-left');
    dots.append(el('span', 'lbl', 'Tests left'));
    for (let k = 0; k < Lab.TEST_BUDGET; k++) dots.append(el('i', k < left ? 'on' : ''));
    card.append(what, dots);
    leftCol.append(card);
    // the tube
    const wrap = el('div', 'tube-wrap');
    wrap.append(canvas, el('div', 'tube-reading', bench ? bench.reading() : ''));
    if (!bench) wrap.append(el('div', 'tube-idle', ran.length ? 'Run another test, or name the sample' : 'Pick a test'));
    leftCol.append(wrap);
    // the tests
    const row = el('div', 'test-row');
    for (const k of Lab.TESTS) {
      const [name, how] = Lab.TEST_INFO[k];
      const b = el('button', `test${ran.includes(k) ? ' done' : ''}${bench && ran[ran.length - 1] === k ? ' running' : ''}`);
      b.type = 'button';
      b.innerHTML = `${icon(k)}<span></span>`;
      b.lastChild.textContent = name;
      b.title = ran.includes(k) ? `${name}: done` : `${name}: ${how}`;
      b.disabled = ran.includes(k) || !left || !shown;
      b.addEventListener('click', () => { AudioFX.click(); runTest(k); });
      row.append(b);
    }
    leftCol.append(row);
    // what the tests showed
    const log = el('ol', 'lab-log');
    ran.forEach((k, j) => {
      if (j === ran.length - 1 && !shown) return;
      const r = Lab.result(k, target);
      const li = el('li');
      li.append(el('b', '', Lab.TEST_INFO[k][0]), ` ${r.text[0].toUpperCase()}${r.text.slice(1)}.`, el('span', 'why', Lab.why(r.why)));
      log.append(li);
    });
    if (!ran.length) {
      log.append(el('li', 'empty', `You have ${Lab.TEST_BUDGET} tests. Choose them well: compare the handbook first, and pick the test that splits the candidates.${Lab.identified() < Lab.EASY_UNTIL
        ? ' For your first samples, the handbook marks those tests with ◆.' : ''}`));
    }
    leftCol.append(log);

    // the handbook
    const right = el('div', 'lab-right');
    right.append(el('div', 'group-label', 'Your master’s handbook'));
    const table = el('table', 'handbook');
    const head = el('tr');
    head.append(el('th'), el('th', 'samp', 'Sample'));
    for (const d of candidates) {
      const th = el('th', `cand fam-${d.fam}${cur.struck.has(d.sym) ? ' struck' : ''}`);
      const b = el('button');
      b.type = 'button';
      b.title = cur.struck.has(d.sym) ? 'Put it back' : 'Cross it out';
      b.append(el('span', 'sym', d.sym), el('span', 'nm', d.name), el('span', 'fm', famName(d)));
      b.addEventListener('click', () => { cur.struck.has(d.sym) ? cur.struck.delete(d.sym) : cur.struck.add(d.sym); render(); });
      th.append(b);
      head.append(th);
    }
    const thead = el('thead');
    thead.append(head);
    const tbody = el('tbody');
    // for the first samples the handbook marks the tests that give the candidates different results
    const teach = Lab.identified() < Lab.EASY_UNTIL;
    for (const k of Lab.TESTS) {
      const splits = teach && new Set(candidates.filter((d) => !cur.struck.has(d.sym)).map((d) => Lab.band(k, d))).size > 1;
      const tr = el('tr', `${ran.includes(k) && (shown || ran[ran.length - 1] !== k) ? 'ran' : ''}${splits ? ' splits' : ''}`);
      const th = el('th');
      th.innerHTML = icon(k);
      th.append(Lab.TEST_INFO[k][0]);
      tr.append(th);
      const known = ran.includes(k) && (shown || ran[ran.length - 1] !== k);
      tr.append(el('td', 'samp', known ? Lab.result(k, target).short : '·'));
      for (const d of candidates) tr.append(el('td', cur.struck.has(d.sym) ? 'struck' : '', Lab.band(k, d)));
      tbody.append(tr);
    }
    const foot = el('tr');
    foot.append(el('th'), el('td'));
    for (const d of candidates) {
      const td = el('td');
      const b = button(`It’s ${d.sym}`, 'pill guess', () => guess(d));
      b.disabled = !ran.length || !shown;
      b.title = !ran.length ? 'Run a test first' : `Name the sample ${d.name}`;
      td.append(b);
      foot.append(td);
    }
    const tfoot = el('tfoot');
    tfoot.append(foot);
    table.append(thead, tbody, tfoot);
    const scroll = el('div', 'handbook-wrap');
    scroll.append(table);
    right.append(scroll, el('p', 'hb-note', 'Click a name to cross it out. The handbook gives each property roughly; the bench measures it exactly.'));

    grid.append(leftCol, right);
    body.append(grid);
    requestAnimationFrame(() => { if (isOpen()) tube.resize(); });
  }

  function renderVerdict(body, actions, close) {
    const v = verdict, d = v.target;
    if (v.right) {
      const f = Lab.fact(d);
      $('#lab-eyebrow').textContent = `Identified · element ${d.z} · ${famName(d)}`;
      $('#lab-title').textContent = d.name;
      const box = el('div', 'lab-fact');
      const big = el('div', `big-tile fam-${d.fam}`);
      big.style.setProperty('--swatch', d.colors[0]);
      big.append(el('i', '', d.z), el('b', '', d.sym), el('span', '', d.name));
      const txt = el('div', 'fact-text');
      const dl = el('dl');
      const row = (k, v2) => { dl.append(el('dt', '', k), el('dd', '', v2)); };
      row('Discovered', f[0] === 'ancient' ? 'Known since ancient times' : `${f[0]}, by ${f[1]}`);
      row('Its name', `From ${f[2]}`);
      row('Used for', f[3]);
      row('In the lab', d.desc);
      txt.append(dl);
      // its experiment, for a star on the table
      const tryBox = el('div', 'try-note');
      tryBox.append(el('div', 'lbl', '☆ Try it in your world'), el('p', '', `${TryIt.text(d.id)}.`));
      const missing = TryIt.needs(d.id).filter((t) => !UI.unlocked(t)).map((t) => list[t].name.toLowerCase());
      if (missing.length) tryBox.append(el('p', 'needs', `You’ll need ${missing.join(' and ')} as well, from the Lab.`));
      txt.append(tryBox);
      if (v.first) {
        const fam = el('div', 'family-note');
        fam.append(el('div', 'lbl', `New family · ${d.family}${d.family.endsWith('gas') ? 'es' : 's'}`), el('p', '', Lab.familyNote(d.fam)));
        txt.append(fam);
      }
      const n = v.ran.length;
      txt.append(el('p', 'sharp', n <= v.need.n
        ? `A sharp eye: ${n} test${n > 1 ? 's' : ''}, the fewest that could settle it.`
        : `You used ${n} tests. ${v.need.tests.map((k) => Lab.TEST_INFO[k][0]).join(' and ')} alone would have settled it.`));
      box.append(big, txt);
      body.append(box);
      actions.append(
        button('Next sample', 'pill primary', next),
        button(`Use ${d.name}`, 'pill', () => { UI.closeModal($('#lab')); UI.select({ kind: 'element', t: d.id }); }),
        close,
      );
      return;
    }
    $('#lab-eyebrow').textContent = 'Not quite';
    $('#lab-title').textContent = `It was ${d.name}`;
    const box = el('div', 'lab-wrong');
    box.append(el('p', '', `You named it ${lower(v.guess)}, but the sample was ${lower(d)} (${d.sym}, element ${d.z}). It stays locked for now.`));
    const diff = Lab.differences(d, v.guess);
    box.append(el('div', 'lbl', 'What tells them apart'));
    const ul = el('ul');
    for (const k of diff) {
      const li = el('li', v.ran.includes(k) ? 'ran' : '');
      li.innerHTML = icon(k);
      li.append(el('b', '', Lab.TEST_INFO[k][0]), ` ${d.name}: ${Lab.band(k, d)} · ${v.guess.name}: ${Lab.band(k, v.guess)}`);
      ul.append(li);
    }
    box.append(ul);
    // the loop re-renders this page once the wait is over
    const waiting = Date.now() < wait;
    box.append(waitBox());
    body.append(box);
    const nb = button('Next sample', 'pill primary', next);
    nb.disabled = waiting;
    actions.append(nb, close);
  }

  // ───── opening and closing ─────
  function open() {
    if (!UI.store.get('labGuide', false) && tour < 0) tourWanted = true; // the first visit starts with the tour
    if (verdict && verdict.right) verdict = null; // a card already read
    if (cur && Lab.has(cur.target.id)) cur = null; // found in the wild while you were away
    if (!verdict && !cur && Date.now() >= wait) newSample();
    if (cur && !bench) showInTube(Lab.bench('idle', cur.target));
    render();
    UI.openModal('#lab');
    tube.resize();
    startLoop();
  }
  function reset() {
    cur = null; verdict = null; wait = 0; bench = null; shown = true;
    UI.store.del('lab');
  }

  function init(g) {
    game = g;
    loadState();
    $('#btn-lab').addEventListener('click', open);
    $('#btn-plab').addEventListener('click', open);
    // the ? runs the tour again (on the bench; with no sample out yet, it waits for the next one)
    $('#lab-help').addEventListener('click', () => {
      AudioFX.click();
      if (tour >= 0) { endTour(true); return; }
      tourWanted = true;
      if (cur && !verdict) render();
    });
    addEventListener('resize', () => { if (isOpen()) tube.resize(); });
  }

  G.LabView = { init, open, reset, isOpen, discoveredLine };
})(globalThis);
