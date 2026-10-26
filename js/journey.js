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
  const run = { ch: null, s: null, left: new Map(), lab: null, hint: 0, ending: false, emptyNote: 0 };
  const progress = Object.assign({ prologue: false, stars: {} }, UI.store.get('journey', {}));
  const saveProgress = () => UI.store.set('journey', progress);

  const keyOf = (sel) => (sel.kind === 'tool' ? `tool:${sel.name}` : `el:${sel.t}`);
  const selOf = (it) => (it.kind === 'tool' ? { kind: 'tool', name: it.name } : { kind: 'element', t: byKey[it.key].id });
  const nameOf = (it) => (it.kind === 'tool' ? UI.toolName(it.name) : byKey[it.key].name);
  const starText = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
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
          else chip.append(el('span', `glyph ${it.name}`, it.name === 'heat' ? '▲' : it.name === 'cool' ? '▼' : '⌫'));
          chip.append(el('span', '', nameOf(it)), el('span', 'n', it.n == null ? '∞' : fmt(it.n)));
          row.append(chip);
        }
        box.append(row);
        body.append(box);
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
      const state = ch.sealed ? 'Sealed' : !open ? 'Locked' : run.ch === ch ? 'Playing' : stars ? starText(stars) : 'Begin';
      b.append(el('span', 'num', ch.num), txt, el('span', 'state', state));
      if (ch.sealed) b.title = 'These pages are still sealed. More of the journey is coming.';
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
      const blocks = [...ch.outro.body.map((p) => ({ p })), { goals: s.goals }];
      if (ch.outro.page) blocks.push({ p: ch.outro.found, cls: 'found' }, { letter: ch.outro.page, sign: ch.outro.sign });
      if (next && next.sealed) blocks.push({ p: `Chapter ${next.num}, “${next.title}”, is still sealed. More of the journey is coming.`, cls: 'after' });
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
    closeStory();
    if (!run.ch) run.lab = api.borrowLab();
    const w = api.newWorld(...ch.size);
    run.ch = ch;
    run.s = Story.start(ch, w);
    run.left = new Map(ch.pouch.map((it) => [keyOf(selOf(it)), it.n == null ? Infinity : it.n]));
    run.hint = 0;
    run.ending = false;
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
    if (!run.ch) return;
    run.ch = null;
    run.s = null;
    document.body.classList.remove('questing');
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
      else b.append(el('span', `pglyph ${it.name}`, it.name === 'heat' ? '▲' : it.name === 'cool' ? '▼' : '⌫'));
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

  function hint() {
    const hs = run.ch.hints;
    const k = Math.min(run.hint, hs.length - 1);
    run.hint++;
    UI.toast({ eyebrow: `Hint ${k + 1} of ${hs.length}`, name: hs[k], note: true, ms: 9000 });
  }

  function openJourney() {
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
    $('#q-leave').addEventListener('click', () => {
      if (!confirm('Leave this chapter? Your lab will be just as you left it, and the chapter waits on the journey map.')) return;
      leave();
      UI.note('Back in the lab', 'The Journey button opens the map again.');
    });
  }

  G.Journey = {
    init, afterTick, refreshPouch, hint, left, spend, empty,
    get active() { return !!run.ch; },
    allows: (sel) => !!run.ch && run.left.has(keyOf(sel)),
  };
})(globalThis);
