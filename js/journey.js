/* Elementarium — the Apprentice's Journey on screen.
 * story.js holds the chapters as data. This file shows the journey map and the journal pages,
 * runs a chapter in its own world with a limited pouch and a goals card, and hands the lab back
 * exactly as it was when you leave. */
(function (G) {
  'use strict';

  const { ELEM, Story, UI, AudioFX } = G;
  const { list, byKey } = ELEM;
  const $ = (s) => document.querySelector(s);

  let game = null, api = null;
  // the chapter being played: its world state, what is left in the pouch, the lab waiting for us
  const run = { ch: null, s: null, left: new Map(), lab: null, ending: false, emptyNote: 0, magnet: null };
  const progress = Object.assign({ prologue: false, stars: {} }, UI.store.get('journey', {}));
  const saveProgress = () => UI.store.set('journey', progress);

  const keyOf = (sel) => (sel.kind === 'tool' ? `tool:${sel.name}` : `el:${sel.t}`);
  const selOf = (it) => (it.kind === 'tool' ? { kind: 'tool', name: it.name } : { kind: 'element', t: byKey[it.key].id });
  const nameOf = (it) => (it.kind === 'tool' ? UI.toolName(it.name) : byKey[it.key].name);
  const starText = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
  const GLYPH = { heat: '▲', cool: '▼', erase: '⌫', magnet: '∩', smash: '✶' };
  const glyphOf = (name) => GLYPH[name] || '⌫';
  const chapterOpen = (k) => !Story.chapters[k].sealed && (k === 0 || progress.stars[Story.chapters[k - 1].id] > 0);
  const fmt = (n) => Math.max(0, Math.round(n)).toLocaleString();

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // ───── modals ─────
  function closeStory() {
    for (const id of ['#journey', '#journal']) { const m = $(id); if (!m.hidden) UI.closeModal(m); }
  }

  // A journal page: blocks of { p }, { letter, sign }, { task }, { pouch }, { goals } and buttons.
  function page({ eyebrow, title, stars, blocks, actions }) {
    closeStory();
    $('#journal-eyebrow').textContent = eyebrow;
    $('#journal-title').textContent = title;
    const st = $('#journal-stars');
    st.hidden = stars == null;
    if (stars != null) { st.textContent = starText(stars); st.setAttribute('aria-label', `${stars} of 3 stars`); }
    const body = $('#journal-body');
    body.innerHTML = '';
    for (const b of blocks) {
      if (b.p) body.append(el('p', b.cls || '', b.p));
      if (b.letter) {
        const q = el('blockquote', 'letter');
        for (const line of b.letter) q.append(el('p', '', line));
        if (b.sign) q.append(el('p', 'sign', b.sign));
        body.append(q);
      }
      if (b.task) {
        const t = el('div', 'task');
        t.append(el('div', 'label', 'Your task'), el('p', '', b.task));
        body.append(t);
      }
      if (b.pouch) {
        const box = el('div', 'pouch-preview');
        box.append(el('div', 'label', 'In your pouch'));
        const row = el('div', 'chips');
        for (const it of b.pouch) {
          const chip = el('span', 'chip');
          if (it.kind === 'element') chip.append(UI.swatch(byKey[it.key].id, 14, 14));
          else chip.append(el('span', `glyph ${it.name}`, glyphOf(it.name)));
          chip.append(el('span', '', nameOf(it)), el('span', 'n', it.n == null ? '∞' : fmt(it.n)));
          row.append(chip);
        }
        box.append(row);
        body.append(box);
      }
      if (b.part) {
        const t = el('div', 'task part');
        t.append(el('div', 'label', 'For the ship'), el('p', '', b.part));
        body.append(t);
      }
      if (b.goals) {
        const ul = el('ul', 'page-goals');
        for (const g of b.goals) {
          const ok = g.main ? g.met : !g.lost;
          ul.append(el('li', ok ? 'met' : 'lost', g.text));
        }
        body.append(ul);
      }
    }
    const act = $('#journal-actions');
    act.innerHTML = '';
    for (const a of actions) {
      const btn = el('button', `pill${a.primary ? ' primary' : ''}`, a.label);
      btn.type = 'button';
      btn.addEventListener('click', () => { AudioFX.click(); a.fn(); });
      act.append(btn);
    }
    $('#journal').dataset.sticky = '1';
    UI.openModal('#journal');
  }

  function prologue(then) {
    const P = Story.prologue;
    page({
      eyebrow: 'Prologue',
      title: P.title,
      blocks: [...P.body.map((p) => ({ p })), { letter: P.letter.text, sign: P.letter.sign }, { p: P.after, cls: 'after' }],
      actions: [{ label: then ? 'Open the journey map' : 'Back to the map', primary: true, fn: () => { progress.prologue = true; saveProgress(); openMap(); } }],
    });
  }

  function openMap() {
    closeStory();
    const ol = $('#chapter-list');
    ol.innerHTML = '';
    Story.chapters.forEach((ch, k) => {
      const stars = progress.stars[ch.id] || 0;
      const open = chapterOpen(k);
      const li = el('li', `chapter${ch.sealed ? ' sealed' : open ? '' : ' locked'}${stars ? ' done' : ''}${run.ch === ch ? ' current' : ''}`);
      const b = el('button');
      b.type = 'button';
      b.disabled = !open;
      const txt = el('span', 'txt');
      txt.append(el('span', 'place', ch.place), el('span', 'title', ch.title), el('span', 'blurb', ch.blurb));
      const state = ch.sealed ? 'Coming soon' : !open ? 'Locked' : run.ch === ch ? 'Playing' : stars ? starText(stars) : 'Begin';
      const num = el('span', 'num', ch.num);
      if (ch.num.length > 3) num.dataset.long = '';
      b.append(num, txt, el('span', 'state', state));
      if (ch.sealed) b.title = 'These pages are still sealed. This part of the journey is coming soon.';
      else if (!open) b.title = 'Finish the chapter before this one first.';
      b.addEventListener('click', () => { AudioFX.click(); intro(ch); });
      li.append(b);
      ol.append(li);
    });
    UI.openModal('#journey');
  }

  function intro(ch) {
    page({
      eyebrow: `Chapter ${ch.num} · ${ch.place}`,
      title: ch.title,
      blocks: [...ch.intro.body.map((p) => ({ p })), { task: ch.intro.task }, { pouch: ch.pouch }],
      actions: [
        { label: run.ch === ch ? 'Start over' : 'Begin', primary: true, fn: () => start(ch) },
        { label: 'Back to the map', fn: openMap },
      ],
    });
  }

  function outro() {
    const ch = run.ch, s = run.s, o = s.over;
    const k = Story.chapters.indexOf(ch);
    const next = Story.chapters[k + 1];
    if (o.won) {
      const best = Math.max(progress.stars[ch.id] || 0, o.stars);
      progress.stars[ch.id] = best;
      saveProgress();
      AudioFX.unlock();
      // a win can earn a weapon (or open a scene): say so on the page, and with a toast
      const fresh = G.Unlocks.check();
      UI.announce(fresh);
      const blocks = [...ch.outro.body.map((p) => ({ p })), { goals: s.goals }];
      for (const [kind, name] of fresh) {
        if (kind === 'weapon') blocks.push({ p: `Unlocked: the ${UI.weaponName(name)} weapon, in the Weapons tab.`, cls: 'after' });
        if (kind === 'scene') blocks.push({ p: `Unlocked: the ${UI.sceneName(name)} scene.`, cls: 'after' });
      }
      if (ch.outro.page) blocks.push({ p: ch.outro.found, cls: 'found' }, { letter: ch.outro.page, sign: ch.outro.sign });
      if (ch.part) blocks.push({ part: ch.part });
      if (next && next.sealed) blocks.push({ p: `Chapter ${next.num}, “${next.title}”, is coming soon.`, cls: 'after' });
      const actions = [];
      if (next && !next.sealed) actions.push({ label: `On to chapter ${next.num}`, primary: true, fn: () => intro(next) });
      actions.push({ label: 'Back to the map', primary: !next || next.sealed, fn: () => { leave(); openMap(); } });
      if (o.stars < 3) actions.push({ label: 'Try for three stars', fn: () => start(ch) });
      page({ eyebrow: `Chapter ${ch.num} complete`, title: ch.outro.title, stars: o.stars, blocks, actions });
    } else {
      page({
        eyebrow: `Chapter ${ch.num} · ${ch.place}`,
        title: 'Not this time',
        blocks: [{ p: o.reason }, { goals: s.goals }],
        actions: [
          { label: 'Try again', primary: true, fn: () => start(ch) },
          { label: 'Back to the map', fn: () => { leave(); openMap(); } },
        ],
      });
    }
  }

  // ───── running a chapter ─────
  function start(ch) {
    closeGuide();
    closeStory();
    if (!run.ch) run.lab = api.borrowLab();
    const w = api.newWorld(...ch.size);
    run.ch = ch;
    run.s = Story.start(ch, w);
    run.left = new Map(ch.pouch.map((it) => [keyOf(selOf(it)), it.n == null ? Infinity : it.n]));
    run.ending = false;
    $('#q-hint').textContent = ch.guide ? `Hint 1/${ch.guide.length}` : 'Hint';
    // a chapter can say what the Magnet picks up (the lab's own setting comes back on leaving)
    if (run.magnet == null) run.magnet = game.magnetOnly;
    game.magnetOnly = ch.magnetOnly != null ? ch.magnetOnly : run.magnet;
    document.body.classList.remove('cutscene');
    api.useWorld(w);
    game.selected = selOf(ch.pouch[0]);
    document.body.classList.add('questing');
    $('#quest').hidden = false;
    $('#pouch').hidden = false;
    $('#q-num').textContent = ch.num;
    $('#q-place').textContent = ch.place;
    $('#q-title').textContent = ch.title;
    $('#q-goals').innerHTML = '';
    renderGoals();
    buildPouch();
    UI.refreshTable();
    api.setPaused(false);
  }

  function leave() {
    closeGuide();
    if (!run.ch) return;
    run.ch = null;
    run.s = null;
    document.body.classList.remove('questing', 'cutscene');
    if (run.magnet != null) { game.magnetOnly = run.magnet; run.magnet = null; }
    $('#quest').hidden = true;
    $('#pouch').hidden = true;
    api.returnLab(run.lab);
    run.lab = null;
    UI.refreshTable();
  }

  // Called after every simulation tick.
  function afterTick() {
    if (!run.ch) return;
    const s = run.s;
    const over = Story.update(run.ch, game.world, s);
    while (s.say.length) {
      const m = s.say.shift();
      UI.toast({ eyebrow: m.eyebrow, name: m.name, how: m.how, ms: 5600 });
    }
    if (s.t % 10 === 0) renderGoals();
    document.body.classList.toggle('cutscene', !!s.cutscene);
    if (s.t % 15 === 0 && run.ch.guide) {
      const n = run.ch.guide.length, k = (s.stepsDone || []).filter(Boolean).length;
      const label = k < n ? `Hint ${k + 1}/${n}` : 'Hint';
      if ($('#q-hint').textContent !== label) $('#q-hint').textContent = label;
    }
    if (over && !run.ending) {
      run.ending = true;
      renderGoals();
      // let the moment land before the journal opens
      setTimeout(() => { if (run.s === s) outro(); }, over.won ? 2200 : 1400);
    }
  }

  function renderGoals() {
    const ul = $('#q-goals');
    const goals = run.s.goals;
    if (ul.children.length !== goals.length) {
      ul.innerHTML = '';
      for (const g of goals) {
        const li = el('li');
        li.append(el('i', 'mark'), el('span', 'text', g.text), el('span', 'val'));
        if (g.main) { const m = el('span', 'meter'); m.append(el('i')); li.append(m); }
        ul.append(li);
      }
    }
    const main = goals.find((g) => g.main);
    if (main) $('#q-mini').textContent = `${main.text}: ${main.value}`;
    goals.forEach((g, k) => {
      const li = ul.children[k];
      li.className = g.main ? `main${g.met ? ' met' : ''}` : `keep${g.lost ? ' lost' : ''}`;
      li.querySelector('.val').textContent = g.value;
      if (g.main) li.querySelector('.meter i').style.width = `${Math.round(g.progress * 100)}%`;
    });
  }

  function buildPouch() {
    const grid = $('#pouch-grid');
    grid.innerHTML = '';
    for (const it of run.ch.pouch) {
      const sel = selOf(it);
      const b = el('button', 'ptile');
      b.type = 'button';
      b.dataset.k = keyOf(sel);
      b.dataset.n = it.n == null ? '' : it.n;
      if (sel.kind === 'element') b.append(UI.swatch(sel.t, 40, 40));
      else b.append(el('span', `pglyph ${it.name}`, glyphOf(it.name)));
      const txt = el('span', 'ptxt');
      txt.append(el('span', 'pname', nameOf(it)), el('span', 'pleft'));
      const bar = el('span', 'pbar');
      bar.append(el('i'));
      b.append(txt, bar);
      b.addEventListener('click', () => UI.select(sel));
      grid.append(b);
    }
    refreshPouch();
  }

  function refreshPouch() {
    if (!run.ch) return;
    const cur = keyOf(game.selected);
    for (const b of $('#pouch-grid').children) {
      const left = run.left.get(b.dataset.k), full = +b.dataset.n;
      b.classList.toggle('on', b.dataset.k === cur);
      b.classList.toggle('empty', left <= 0);
      b.querySelector('.pleft').textContent = left === Infinity ? 'as much as you need' : left <= 0 ? 'used up' : `${fmt(left)} left`;
      b.querySelector('.pbar i').style.width = left === Infinity ? '100%' : `${(left / full) * 100}%`;
    }
  }

  function left(sel) { return run.left.has(keyOf(sel)) ? run.left.get(keyOf(sel)) : 0; }
  function spend(sel, n) {
    if (!n) return;
    const k = keyOf(sel), v = run.left.get(k);
    if (v === Infinity || v == null) return;
    run.left.set(k, Math.max(0, v - n));
    refreshPouch();
  }
  // Painting from an empty slot: say so, but not every frame of the stroke.
  function empty(sel) {
    const now = performance.now();
    if (now - run.emptyNote < 2500) return;
    run.emptyNote = now;
    const it = run.ch.pouch.find((p) => keyOf(selOf(p)) === keyOf(sel));
    UI.note(it ? `Your ${nameOf(it).toLowerCase()} is used up` : 'Not in your pouch', 'Restart the chapter to refill the pouch.');
  }

  // ───── the guide: Hint lights up the next thing to do ─────
  // The page dims but for the place on the map where it happens and the pouch items it takes, with a
  // note and the recipe beside them. It always shows the step you are on (story.js keeps track), and
  // the game waits while it is up.
  const NS = 'http://www.w3.org/2000/svg';
  let guide = null;
  const useKey = (u) => (u.startsWith('tool:') ? u : `el:${byKey[u].id}`);
  const useName = (u) => (u.startsWith('tool:') ? UI.toolName(u.slice(5)) : byKey[u].name);
  function chipFor(u) {
    const c = el('span', 'chip');
    if (u.startsWith('tool:')) c.append(el('span', `glyph ${u.slice(5)}`, glyphOf(u.slice(5))));
    else c.append(UI.swatch(byKey[u].id, 16, 16));
    c.append(el('span', '', useName(u)));
    return c;
  }
  function hint() {
    if (!run.ch) return;
    const r = Story.step(run.ch, game.world, run.s);
    if (!r || r.k < 0) {
      const main = run.s.goals.find((g) => g.main && !g.met);
      UI.toast({ eyebrow: 'Hint', name: main ? main.text : 'Nearly there', how: 'Every step of the guide is done. Keep at it.', note: true, ms: 6000 });
      return;
    }
    openGuide(r);
  }
  function openGuide({ k, n, step }) {
    closeGuide();
    const root = el('div', 'guide');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', `Step ${k + 1} of ${n}: ${step.title}`);
    const svg = document.createElementNS(NS, 'svg');
    svg.classList.add('guide-dim');
    svg.addEventListener('click', () => { AudioFX.click(); closeGuide(); });
    const tip = el('div', 'tour-tip guide-tip');
    const head = el('div', 'tt-head');
    head.append(el('span', 'tt-step', `Step ${k + 1} of ${n}`), el('b', '', step.title));
    tip.append(head);
    if (step.use.length) {
      const row = el('div', 'guide-recipe');
      step.use.forEach((u, q) => { if (q) row.append(el('span', 'op', '+')); row.append(chipFor(u)); });
      if (step.makes) row.append(el('span', 'op', '→'), chipFor(step.makes));
      tip.append(row);
    }
    tip.append(el('p', '', step.note));
    const btns = el('div', 'tt-btns');
    const later = el('button', 'tt-skip', 'Close');
    later.type = 'button';
    later.addEventListener('click', () => { AudioFX.click(); closeGuide(); });
    const first = step.use.find((u) => run.left.has(useKey(u)));
    const go = el('button', 'pill primary', first ? `Pick up ${useName(first)}` : 'Got it');
    go.type = 'button';
    go.addEventListener('click', () => {
      AudioFX.click();
      if (first) UI.select(first.startsWith('tool:') ? { kind: 'tool', name: first.slice(5) } : { kind: 'element', t: byKey[first].id });
      closeGuide();
    });
    btns.append(later, go);
    tip.append(btns);
    root.append(svg, tip);
    document.body.append(root);
    guide = { root, svg, tip, step, paused: game.paused };
    api.setPaused(true);
    placeGuide();
    go.focus();
  }
  function closeGuide() {
    if (!guide) return;
    const { root, paused } = guide;
    guide = null;
    root.remove();
    for (const t of document.querySelectorAll('.ptile.guide-on')) t.classList.remove('guide-on');
    if (!paused && run.ch) api.setPaused(false);
  }
  // the holes in the dimmed page: the place on the map, and the pouch tiles; the note beside the map's
  function placeGuide() {
    if (!guide || !run.ch) return;
    const { svg, tip, step } = guide;
    const W = innerWidth, H = innerHeight;
    const holes = [];
    const stage = $('#stage').getBoundingClientRect();
    const z = step.at(game.world, run.s);
    const a = game.renderer.worldToClient(Math.max(0, z.x0), Math.max(0, z.y0));
    const b = game.renderer.worldToClient(Math.min(game.world.W, z.x1 + 1), Math.min(game.world.H, z.y1 + 1));
    const spot = { left: Math.max(stage.left + 4, a.x - 6), top: Math.max(stage.top + 4, a.y - 6), right: Math.min(stage.right - 4, b.x + 6), bottom: Math.min(stage.bottom - 4, b.y + 6) };
    if (spot.right - spot.left < 28) { const c = (spot.left + spot.right) / 2; spot.left = c - 14; spot.right = c + 14; }
    if (spot.bottom - spot.top < 28) { const c = (spot.top + spot.bottom) / 2; spot.top = c - 14; spot.bottom = c + 14; }
    holes.push(spot);
    for (const t of document.querySelectorAll('.ptile.guide-on')) t.classList.remove('guide-on');
    for (const u of step.use) {
      const tile = document.querySelector(`#pouch-grid .ptile[data-k="${useKey(u)}"]`);
      if (!tile) continue;
      tile.classList.add('guide-on');
      const r = tile.getBoundingClientRect();
      if (r.width && r.bottom > 0 && r.top < H) holes.push({ left: r.left - 3, top: r.top - 3, right: r.right + 3, bottom: r.bottom + 3 });
    }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const rect = (h, attrs) => {
      const e = document.createElementNS(NS, 'rect');
      e.setAttribute('x', h.left); e.setAttribute('y', h.top); e.setAttribute('width', h.right - h.left); e.setAttribute('height', h.bottom - h.top);
      for (const [k2, v] of Object.entries(attrs)) e.setAttribute(k2, v);
      return e;
    };
    svg.innerHTML = '';
    const defs = document.createElementNS(NS, 'defs'), mask = document.createElementNS(NS, 'mask');
    mask.setAttribute('id', 'guide-mask');
    mask.append(rect({ left: 0, top: 0, right: W, bottom: H }, { fill: 'white' }));
    for (const h of holes) mask.append(rect(h, { fill: 'black', rx: 8 }));
    defs.append(mask);
    svg.append(defs, rect({ left: 0, top: 0, right: W, bottom: H }, { class: 'shade', mask: 'url(#guide-mask)' }));
    for (const h of holes) svg.append(rect(h, { class: 'ring', rx: 8 }));
    // the note: below the place on the map if there is room, else above it, else inside its top
    const tw = tip.offsetWidth, th = tip.offsetHeight, gap = 12;
    let top = spot.bottom + gap;
    if (top + th > H - 8) top = spot.top - gap - th;
    if (top < 8) top = Math.max(8, Math.min(H - th - 8, spot.top + 8));
    const left = Math.max(8, Math.min(W - tw - 8, (spot.left + spot.right) / 2 - tw / 2));
    Object.assign(tip.style, { left: `${left}px`, top: `${top}px` });
  }

  function openJourney() {
    if (!G.Unlocks.has('journey')) { // it opens once enough elements are found
      UI.note('The Journey is not open yet', `Find ${G.Unlocks.JOURNEY_AT} elements first: you have ${UI.found()}.`);
      return;
    }
    if (!progress.prologue) prologue(true);
    else openMap();
  }

  function init(g, a) {
    game = g;
    api = a;
    // messages stack under the goals card, so they need to know how tall it is
    new ResizeObserver(() => $('#stage').style.setProperty('--quest-h', `${$('#quest').offsetHeight}px`)).observe($('#quest'));
    $('#btn-journey').addEventListener('click', openJourney);
    $('#btn-letter').addEventListener('click', () => prologue(false));
    $('#btn-begin-journey').addEventListener('click', () => { UI.closeModal($('#welcome')); openJourney(); });
    $('#q-hint').addEventListener('click', hint);
    // the goals card can fold down to its title bar so it doesn't hide the map
    const minBtn = $('#q-min');
    const setMin = (on) => {
      $('#quest').classList.toggle('min', on);
      minBtn.textContent = on ? '+' : '–';
      minBtn.title = on ? 'Show the goals' : 'Minimize';
      minBtn.setAttribute('aria-label', on ? 'Show the goals' : 'Minimize the goals');
      minBtn.setAttribute('aria-expanded', String(!on));
      UI.store.set('questMin', on);
    };
    minBtn.addEventListener('click', () => { AudioFX.click(); setMin(!$('#quest').classList.contains('min')); });
    setMin(UI.store.get('questMin', false));

    // drag the card by its title bar; it stays inside the map and remembers where it was put
    const quest = $('#quest'), stage = $('#stage');
    const place = (x, y) => {
      const maxX = stage.clientWidth - quest.offsetWidth - 4, maxY = stage.clientHeight - quest.offsetHeight - 4;
      x = Math.max(4, Math.min(maxX, x)); y = Math.max(4, Math.min(maxY, y));
      quest.style.left = `${x}px`; quest.style.top = `${y}px`;
      return [x, y];
    };
    const saved = UI.store.get('questPos', null);
    if (saved) requestAnimationFrame(() => place(saved[0], saved[1]));
    let drag = null;
    quest.querySelector('header').addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || quest.classList.contains('min')) return;
      drag = { dx: e.clientX - quest.offsetLeft, dy: e.clientY - quest.offsetTop, id: e.pointerId };
      quest.classList.add('dragging');
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer gone */ }
    });
    quest.querySelector('header').addEventListener('pointermove', (e) => {
      if (drag && e.pointerId === drag.id) place(e.clientX - drag.dx, e.clientY - drag.dy);
    });
    const drop = () => {
      if (!drag) return;
      drag = null;
      quest.classList.remove('dragging');
      UI.store.set('questPos', [quest.offsetLeft, quest.offsetTop]);
    };
    quest.querySelector('header').addEventListener('pointerup', drop);
    quest.querySelector('header').addEventListener('pointercancel', drop);
    // double-clicking the title bar puts it back in the corner
    quest.querySelector('header').addEventListener('dblclick', (e) => {
      if (e.target.closest('button')) return;
      quest.style.left = ''; quest.style.top = '';
      UI.store.set('questPos', null);
    });
    $('#q-restart').addEventListener('click', () => { AudioFX.click(); start(run.ch); });
    // Leave asks on a journal page of its own: a browser's confirm() box can be refused without a
    // word (the desktop app's browser pane does), and then Leave would do nothing
    $('#q-leave').addEventListener('click', () => {
      if (!run.ch) return;
      AudioFX.click();
      const ch = run.ch;
      page({
        eyebrow: `Chapter ${ch.num} · ${ch.place}`,
        title: 'Leave this chapter?',
        blocks: [{ p: 'Your lab will be just as you left it, and the chapter waits on the journey map. Whatever you have done in it so far will be lost.' }],
        actions: [
          { label: 'Leave', primary: true, fn: () => { closeStory(); leave(); UI.note('Back in the lab', 'The Journey button opens the map again.'); } },
          { label: 'Keep playing', fn: closeStory },
        ],
      });
    });
    addEventListener('resize', placeGuide);
    addEventListener('keydown', (e) => { if (guide && e.key === 'Escape') { e.preventDefault(); closeGuide(); } });
  }

  G.Journey = {
    init, afterTick, refreshPouch, hint, left, spend, empty,
    get active() { return !!run.ch; },
    // the chapter's sky: its own, or what its script has moved it to
    get sky() { return run.s ? run.s.sky || run.ch.sky : null; },
    // while a chapter plays a scene of its own, hands off the map
    get locked() { return !!(run.s && run.s.cutscene); },
    allows: (sel) => !!run.ch && !(run.s && run.s.cutscene) && run.left.has(keyOf(sel)),
  };
})(globalThis);
