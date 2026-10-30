/* Elementarium — boot, game loop and input. */
(function (G) {
  'use strict';

  const { ELEM, Sim, Renderer, AudioFX, UI, Scenes, Journey, Lab, LabView, TryIt, Tints } = G;
  const { ID, CAT, list } = ELEM;
  const $ = (s) => document.querySelector(s);

  const canvas = $('#view');
  const stage = $('#stage');
  const renderer = Renderer.createRenderer(canvas);

  // Map size: four sizes, all the same shape (8 : 5), so a scene or a save looks alike in any of
  // them. Fit, the default, suits most screens. (Older choices map onto the nearest: the square
  // 256 × 256 is Small now, and "fit" used to follow the screen.)
  const SIZES = { small: [256, 160], fit: [320, 200], wide: [384, 240], large: [512, 320] };
  const OLD_SIZES = { '256x256': 'small', '384x256': 'wide', '512x320': 'large' };
  function pickWorldSize(choice) {
    const [W, H] = SIZES[choice] || SIZES.fit;
    return { W, H };
  }

  let mapSize = UI.store.get('mapsize', 'fit');
  if (OLD_SIZES[mapSize]) { mapSize = OLD_SIZES[mapSize]; UI.store.set('mapsize', mapSize); }
  if (!SIZES[mapSize]) mapSize = 'fit';
  const size = pickWorldSize(mapSize);
  const game = {
    world: Sim.createWorld(size.W, size.H),
    renderer,
    selected: { kind: 'element', t: ID.SAND },
    brush: 4,
    replace: false,
    paused: false,
    speed: 1,
    thermal: false,
    air: false,
    lens: false,
    sandbox: false,
    scene: 'island',
  };
  renderer.setWorld(game.world);

  function setWorld(w) {
    w.ambient = game.world.ambient;
    Object.assign(w.weather, game.world.weather);
    game.world = w;
    UI.syncWorldDisc(w);
    renderer.setWorld(w);
  }

  UI.init(game);
  LabView.init(game);
  // The Island is the plain one (sea, sand and a garden) until every plant and creature has been found;
  // then it grows into the tropical one. Every game starts on it.
  const islandGrown = () => { const f = UI.lifeFound(); return f.found >= f.total; };
  const build = (name) => Scenes[name === 'island' && !islandGrown() ? 'islandClassic' : name];
  build('island')(game.world);

  // ───── undo / redo ─────
  // Whole-world snapshots taken just before each change you make (a stroke, a scene, a clear…).
  const history = { undo: [], redo: [] };
  const btnUndo = $('#btn-undo'), btnRedo = $('#btn-redo');
  function historyLimit() {
    const bytes = game.world.N * 21;
    return Math.max(5, Math.min(40, Math.floor(90e6 / bytes)));
  }
  function refreshHistory() {
    btnUndo.disabled = history.undo.length === 0;
    btnRedo.disabled = history.redo.length === 0;
  }
  function checkpoint() {
    if (Journey.active) return; // a chapter is played forward: restart it instead
    history.undo.push(game.world.snapshot());
    const lim = historyLimit();
    while (history.undo.length > lim) history.undo.shift();
    history.redo.length = 0;
    refreshHistory();
  }
  function applySnapshot(sn) {
    if (sn.W !== game.world.W || sn.H !== game.world.H) setWorld(Sim.createWorld(sn.W, sn.H));
    game.world.restore(sn);
  }
  function undo() {
    if (!history.undo.length || Journey.active) return;
    history.redo.push(game.world.snapshot());
    applySnapshot(history.undo.pop());
    refreshHistory();
  }
  function redo() {
    if (!history.redo.length || Journey.active) return;
    history.undo.push(game.world.snapshot());
    applySnapshot(history.redo.pop());
    refreshHistory();
  }
  btnUndo.addEventListener('click', undo);
  btnRedo.addEventListener('click', redo);
  refreshHistory();

  // ───── painting ─────
  const pointer = {
    x: 0, y: 0, cx: 0, cy: 0, inside: false, down: false, button: 0, lastX: 0, lastY: 0, boltCd: 0,
    panning: false, panX: 0, panY: 0, panMoved: 0,
    anchor: null, // where a Line or Box drag began
    shift: false, // Shift is held: a Line or Box being dragged is kept straight (see dragEnd)
    weapon: 0,    // the disaster this press set off, steered while the button is held (a tornado)
  };

  // ───── brush shapes ─────
  // circle and square paint as you drag; pen draws single cells; spray scatters; line and box
  // are dragged out and drawn on release; fill pours into everything connected (a paint bucket).
  const SHAPES = ['circle', 'square', 'pen', 'spray', 'line', 'box', 'fill'];
  game.shape = SHAPES.includes(UI.store.get('shape', 'circle')) ? UI.store.get('shape', 'circle') : 'circle';
  const shapeButtons = document.querySelectorAll('[data-shape]');
  function setShape(sh) {
    game.shape = sh;
    UI.store.set('shape', sh);
    for (const b of shapeButtons) b.setAttribute('aria-pressed', b.dataset.shape === sh);
  }
  for (const b of shapeButtons) b.addEventListener('click', () => { AudioFX.click(); setShape(b.dataset.shape); });
  setShape(game.shape);
  const isMagnet = () => game.selected.kind === 'tool' && game.selected.name === 'magnet';
  const dragged = () => game.shape === 'line' || game.shape === 'box';
  const radius = () => (game.shape === 'pen' ? 0 : game.shape === 'spray' ? game.brush + 3 : game.brush);
  const magnetReach = () => game.brush + 8; // the dashed ring drawn round the magnet
  const isWeapon = () => game.selected.kind === 'weapon';
  const weaponSize = () => 0.5 + game.brush / 8; // the brush slider sizes a disaster: 1 at its default

  const CLOUDY = new Set([ID.CLOUD, ID.RAINCLOUD, ID.STORMCLOUD, ID.SNOWCLOUD, ID.FOG]);
  function densityFor(t) {
    const d = list[t];
    if (t === ID.HUMAN || t === ID.COW || t === ID.WOLF || t === ID.SHARK || t === ID.CELL) return 0.006; // a few at a time
    if (t === ID.BIRD) return 0.01;
    if (t === ID.FISH || t === ID.WORM || t === ID.FIREFLY || t === ID.ANT) return 0.02;
    if (t === ID.SEED || t === ID.ACORN || t === ID.CACTUSSEED || t === ID.VINESEED || t === ID.LILYSEED) return 0.06;
    if (t === ID.GRASSSEED || t === ID.SPORES) return 0.12;
    if (t === ID.SPARK) return 1;
    if (t === ID.LIGHT) return 0.2;
    if (t === ID.HAIL) return 0.15;
    switch (d.cat) {
      case CAT.POWDER: return 0.35;
      case CAT.LIQUID: return 0.45;
      case CAT.GAS: return t === ID.FIRE ? 0.5 : CLOUDY.has(t) ? 0.6 : 0.3;
      default: return 1;
    }
  }

  // In a story chapter every stroke draws on the pouch; in the lab supplies never run out.
  // `fn(max)` does the work and returns how many cells it changed.
  function use(sel, fn) {
    if (!Journey.active) return fn(Infinity);
    if (!Journey.allows(sel)) return 0;
    const left = Journey.left(sel);
    if (left <= 0) { Journey.empty(sel); return 0; }
    const n = fn(left);
    Journey.spend(sel, n);
    return n;
  }
  const ERASE = { kind: 'tool', name: 'erase' };

  function applyAt(x, y, erase, r = radius()) {
    const w = game.world;
    if (erase) { use(ERASE, (max) => w.erase(x, y, r, max)); return; }
    const sel = game.selected;
    if (sel.kind === 'tool') {
      if (sel.name === 'erase') use(sel, (max) => w.erase(x, y, r, max));
      else if (sel.name === 'heat') use(sel, () => w.heat(x, y, r, 28 * game.speed));
      else if (sel.name === 'cool') use(sel, () => w.heat(x, y, r, -18 * game.speed));
      else if (sel.name === 'smash') { if (use(sel, (max) => w.smash(x, y, r, max))) AudioFX.pour('powder'); }
      return; // the magnet acts every tick while held (see tickOnce), not along the stroke
    }
    if (sel.kind === 'weapon') return; // a weapon goes off once, on the press
    const t = sel.t;
    Object.assign(w.machine, game.machine); // which way new pistons and pumps face, what new sensors sense
    if (t === ID.LIGHTNING) {
      if (pointer.boltCd <= 0) { w.spawnBolt(x, y, false); pointer.boltCd = 9; }
      return;
    }
    if (t === ID.SPARK) { w.sparkPaint(x, y, r); return; }
    if (t === ID.EXPLOSION) { // a blast in the brush's shape; dragged, one every few ticks
      if (pointer.boomCd <= 0 || dragged()) { use(sel, () => w.blastPaint(x, y, r, Tints.tintFor(t))); pointer.boomCd = 6; }
      return;
    }
    if (t === ID.PAINT) { use(sel, () => w.tintPaint(x, y, r, UI.paintColor(t))); return; }
    if (t === ID.IMAGE) { // the picture goes down once, where you click
      const p = pictureAt();
      if (!p) { UI.note('No picture yet', 'Click the Image tile to choose one.'); pointer.down = false; return; }
      if (pointer.placed) return;
      pointer.placed = true;
      use(sel, () => w.placeImage(x, y, p.w, p.h, p.px));
      AudioFX.pour('solid');
      return;
    }
    // shaped strokes lay matter down solid (the spray scatters it by itself); sparse things like
    // people and seeds keep their own spacing
    const solid = game.shape !== 'circle' && game.shape !== 'square' && densityFor(t) >= 0.3;
    const replace = game.replace || game.shape === 'fill';
    const n = use(sel, (max) => w.paint(x, y, r, t, solid ? 1 : densityFor(t), replace, max, Tints.tintFor(t), UI.paintColor(t))); // glass and fire, and concrete, in their colour
    if (!n) return;
    const c = list[t].cat;
    AudioFX.pour(c === CAT.LIQUID ? 'liquid' : c === CAT.GAS ? 'gas' : c === CAT.POWDER ? 'powder' : 'solid');
  }

  // The Image tool's picture at the brush's size: w × h cells, one pixel each (made once per size).
  function pictureAt() {
    const p = UI.picture();
    if (!p) return null;
    const W = game.world.W, H = game.world.H, ar = p.img.naturalHeight / Math.max(1, p.img.naturalWidth);
    let w = Math.min(W, 6 + game.brush * 6), h = Math.max(1, Math.round(w * ar));
    if (h > H) { h = H; w = Math.max(1, Math.round(h / ar)); }
    if (p.sized && p.sized.w === w && p.sized.h === h) return p.sized;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(p.img, 0, 0, w, h);
    p.sized = { canvas: c, w, h, px: x.getImageData(0, 0, w, h).data };
    return p.sized;
  }
  const isImage = () => game.selected.kind === 'element' && game.selected.t === ID.IMAGE;

  // Paint every point between the last brush position and this one so fast strokes leave no gaps.
  function stroke() {
    const erase = pointer.button === 2;
    const x0 = pointer.lastX, y0 = pointer.lastY, x1 = pointer.x, y1 = pointer.y;
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const stepLen = Math.max(1, game.brush * 0.6);
    const n = Math.max(1, Math.ceil(dist / stepLen));
    const isBolt = !erase && game.selected.kind === 'element' && game.selected.t === ID.LIGHTNING;
    for (let k = isBolt ? n : 1; k <= n; k++) {
      applyAt(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), erase);
    }
    pointer.lastX = x1; pointer.lastY = y1;
  }

  // The hand: what it holds follows the cursor every frame (even paused), and it keeps pulling
  // in whatever comes within reach while the button is down; let go and it is thrown with the
  // cursor's velocity over the last tenth of a second, in cells per tick.
  const hand = { trail: [], gx: 0, gy: 0 };
  function handTrack(now) {
    game.world.holdTo(pointer.x, pointer.y, magnetReach());
    hand.trail.push([now, pointer.x, pointer.y]);
    while (hand.trail.length && now - hand.trail[0][0] > 100) hand.trail.shift();
  }
  function handThrow() {
    const t = hand.trail, now = performance.now();
    let ux = 0, uy = 0;
    if (t.length >= 2 && now - t[t.length - 1][0] < 80) { // a hand that stopped first just drops
      const a = t[0], b = t[t.length - 1], ticks = Math.max(1, (b[0] - a[0]) / (1000 / 60));
      ux = ((b[1] - a[1]) / ticks) * 0.8; uy = ((b[2] - a[2]) / ticks) * 0.8;
    }
    game.world.release(ux, uy);
    hand.trail = [];
  }

  // Where a Line or Box being dragged ends. Holding Shift keeps it straight, as in a slides or
  // drawing app: a Line snaps to the nearest 45° (flat, upright or a true diagonal) and a Box
  // becomes a square.
  function dragEnd() {
    const a = pointer.anchor, x = pointer.x, y = pointer.y;
    if (!a || !pointer.shift) return { x, y };
    const dx = x - a.x, dy = y - a.y;
    if (game.shape === 'box') {
      const side = Math.max(Math.abs(dx), Math.abs(dy));
      return { x: a.x + (dx < 0 ? -side : side), y: a.y + (dy < 0 ? -side : side) };
    }
    const step = Math.PI / 4, ang = Math.round(Math.atan2(dy, dx) / step) * step;
    const ux = Math.cos(ang), uy = Math.sin(ang), along = dx * ux + dy * uy; // the cursor, brought onto that line
    return { x: Math.round(a.x + ux * along), y: Math.round(a.y + uy * along) };
  }

  // A dragged Line is laid along its length; a Box fills its rectangle.
  function finishShape() {
    const a = pointer.anchor, end = dragEnd();
    pointer.anchor = null;
    if (!a) return;
    const erase = pointer.button === 2, w = game.world;
    if (game.shape === 'box') {
      w.setBrush('box', a.x, a.y, end.x, end.y);
      applyAt(end.x, end.y, erase, 0);
      w.setBrush('circle');
      return;
    }
    const r = game.brush, dist = Math.hypot(end.x - a.x, end.y - a.y);
    const n = Math.max(1, Math.ceil(dist / Math.max(1, r * 0.6)));
    for (let k = 0; k <= n; k++) applyAt(Math.round(a.x + ((end.x - a.x) * k) / n), Math.round(a.y + ((end.y - a.y) * k) / n), erase, r);
  }

  // The cursor's world cell changes when the camera moves too, so recompute it from screen coords.
  function updatePointer() {
    const p = renderer.clientToWorld(pointer.cx, pointer.cy);
    pointer.x = p.x; pointer.y = p.y;
  }

  canvas.addEventListener('pointerdown', (e) => {
    AudioFX.init();
    pointer.cx = e.clientX; pointer.cy = e.clientY;
    pointer.shift = e.shiftKey;
    updatePointer();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // middle-drag (or Alt+drag) moves the map; a middle click without moving picks an element
      e.preventDefault();
      pointer.panning = true; pointer.panX = e.clientX; pointer.panY = e.clientY; pointer.panMoved = 0;
      canvas.classList.add('panning');
      return;
    }
    checkpoint();
    pointer.down = true;
    pointer.button = e.button;
    // a pipe drawn in one stroke is one pipe, walled in on every side when the stroke ends
    pointer.pipe = e.button === 0 && game.selected.kind === 'element' && game.selected.t === ID.PIPE;
    if (pointer.pipe) game.world.beginStroke();
    pointer.lastX = pointer.x; pointer.lastY = pointer.y;
    pointer.boltCd = 0; pointer.boomCd = 0; pointer.placed = false;
    if (isMagnet() && e.button === 0) { // pick up what is within reach, and keep pulling while held
      hand.trail = [];
      game.world.grab(pointer.x, pointer.y, magnetReach(), game.magnetOnly);
      hand.gx = pointer.x; hand.gy = pointer.y;
      return;
    }
    if (e.button === 0 && game.selected.kind === 'element' && game.selected.t === ID.SWITCH && game.world.flip(pointer.x, pointer.y)) {
      AudioFX.click(); // a click on a switch flips it (and those joined to it) instead of painting more
      pointer.down = false;
      return;
    }
    if (isWeapon() && e.button === 0) { // one click sets the disaster off
      pointer.weapon = game.world.launch(game.selected.name, pointer.x, pointer.y, weaponSize(), { magnitude: game.magnitude });
      return;
    }
    if (dragged()) { pointer.anchor = { x: pointer.x, y: pointer.y }; return; }
    if (game.shape === 'fill') {
      game.world.setBrush('fill');
      applyAt(pointer.x, pointer.y, e.button === 2, 0);
      game.world.setBrush('circle');
      if (pointer.pipe) game.world.encase(); // a pipe poured with the bucket is walled in at once
      pointer.down = false; pointer.pipe = false;
      return;
    }
    game.world.setBrush(game.shape === 'square' || game.shape === 'spray' ? game.shape : 'circle');
    stroke();
  });
  canvas.addEventListener('pointermove', (e) => {
    pointer.cx = e.clientX; pointer.cy = e.clientY;
    pointer.shift = e.shiftKey;
    pointer.inside = true;
    if (pointer.panning) {
      const dx = e.clientX - pointer.panX, dy = e.clientY - pointer.panY;
      pointer.panMoved += Math.abs(dx) + Math.abs(dy);
      renderer.panBy(dx, dy);
      pointer.panX = e.clientX; pointer.panY = e.clientY;
    }
    updatePointer();
    if ((game.world.gripping || pointer.weapon) && !(e.buttons & 1)) up(e); // the button came up where we didn't see it
  });
  const up = (e) => {
    if (pointer.panning) {
      pointer.panning = false;
      canvas.classList.remove('panning');
      if (pointer.panMoved < 4 && e && e.button === 1) {
        const c = game.world.cell(pointer.x, pointer.y);
        if (c && c.t !== ID.EMPTY && UI.unlocked(c.t) && !list[c.t].hidden) UI.select({ kind: 'element', t: c.t });
      }
    }
    const piping = pointer.pipe && pointer.down;
    if (pointer.down && pointer.anchor) finishShape();
    if (piping) game.world.encase(); // walled in on every edge: erase a bit of wall to let things in or out
    pointer.pipe = false;
    if (game.world.gripping) handThrow();
    if (pointer.weapon) { game.world.steer(pointer.weapon, -1); pointer.weapon = 0; }
    pointer.down = false;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', () => { pointer.inside = false; });
  canvas.addEventListener('pointerenter', () => { pointer.inside = true; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('auxclick', (e) => e.preventDefault());
  // Wheel zooms the map around the cursor; Ctrl+wheel resizes the brush.
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) { setBrush(game.brush + (e.deltaY < 0 ? 1 : -1)); return; }
    renderer.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.18 : 1 / 1.18);
    updatePointer();
  }, { passive: false });

  const brushInput = $('#brush-size');
  function setBrush(v) {
    game.brush = Math.max(0, Math.min(24, v));
    brushInput.value = game.brush;
    $('#brush-out').textContent = game.brush;
  }
  brushInput.addEventListener('input', () => setBrush(+brushInput.value));
  $('#replace').addEventListener('change', (e) => { game.replace = e.target.checked; });

  // ───── zoom controls ─────
  const btnZoom = $('#btn-zoom');
  function zoomCentre(f) {
    const r = canvas.getBoundingClientRect();
    renderer.zoomAt(r.left + r.width / 2, r.top + r.height / 2, f);
  }
  $('#btn-zoom-in').addEventListener('click', () => zoomCentre(1.5));
  $('#btn-zoom-out').addEventListener('click', () => zoomCentre(1 / 1.5));
  btnZoom.addEventListener('click', () => renderer.fitView());

  // ───── toolbar toggles ─────
  const btnPlay = $('#btn-play');
  function setPaused(p) {
    game.paused = p;
    btnPlay.querySelector('.ico').textContent = p ? '▶' : '❚❚';
    btnPlay.setAttribute('aria-label', p ? 'Resume' : 'Pause');
  }
  btnPlay.addEventListener('click', () => setPaused(!game.paused));
  $('#btn-step').addEventListener('click', () => { setPaused(true); tickOnce(); });

  const SPEEDS = [1, 2, 0.5];
  $('#btn-speed').addEventListener('click', (e) => {
    game.speed = SPEEDS[(SPEEDS.indexOf(game.speed) + 1) % SPEEDS.length];
    e.currentTarget.textContent = game.speed === 0.5 ? '½×' : `${game.speed}×`;
  });

  const btnLens = $('#btn-lens');
  function setLens(on) { game.lens = on; btnLens.setAttribute('aria-pressed', on); }
  btnLens.addEventListener('click', () => setLens(!game.lens));

  // the thermal and air views take turns: switching one on switches the other off
  const btnThermal = $('#btn-thermal'), btnAir = $('#btn-air');
  function setThermal(on) {
    game.thermal = on; btnThermal.setAttribute('aria-pressed', on);
    if (on && game.air) setAir(false);
  }
  function setAir(on) {
    game.air = on; btnAir.setAttribute('aria-pressed', on);
    if (on && game.thermal) setThermal(false);
  }
  btnThermal.addEventListener('click', () => setThermal(!game.thermal));
  btnAir.addEventListener('click', () => setAir(!game.air));

  const btnSound = $('#btn-sound');
  function setSound(on) {
    AudioFX.init();
    AudioFX.setEnabled(on);
    btnSound.setAttribute('aria-pressed', on);
    UI.store.set('sound', on);
  }
  btnSound.addEventListener('click', () => setSound(!AudioFX.enabled));
  if (UI.store.get('sound', true) === false) { AudioFX.setEnabled(false); btnSound.setAttribute('aria-pressed', 'false'); }

  // ───── menus (one open at a time) ─────
  const menus = { scenes: $('#scene-menu'), weather: $('#weather-menu'), world: $('#world-menu') };
  function toggleMenu(name) {
    for (const [k, m] of Object.entries(menus)) m.hidden = k === name ? !m.hidden : true;
  }
  $('#btn-scenes').addEventListener('click', (e) => { e.stopPropagation(); paintScenes(); toggleMenu('scenes'); });
  $('#btn-weather').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu('weather'); });
  $('#btn-world').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu('world'); });
  document.addEventListener('click', (e) => {
    for (const m of Object.values(menus)) if (!m.hidden && !m.contains(e.target)) m.hidden = true;
  });

  function loadScene(name) {
    checkpoint();
    game.scene = name;
    build(name)(game.world);
    TryIt.staged(game.world); // what the scene set up doesn't count toward Try it
  }
  // A scene built from periodic elements opens once every one of them is unlocked.
  const sceneMissing = (name) => (Lab.sceneNeeds(Scenes)[name] || []).filter((t) => !UI.unlocked(t));
  function paintScenes() {
    for (const b of menus.scenes.querySelectorAll('[data-scene]')) {
      const miss = sceneMissing(b.dataset.scene);
      let needs = b.querySelector('.needs');
      if (miss.length && !needs) { needs = document.createElement('span'); needs.className = 'needs'; b.append(needs); }
      if (needs) needs.textContent = miss.length ? `Needs ${miss.map((t) => list[t].sym).join(', ')} from the Lab` : '';
      b.classList.toggle('locked', miss.length > 0);
      b.setAttribute('aria-disabled', miss.length > 0);
    }
    const f = UI.lifeFound(), island = menus.scenes.querySelector('[data-scene="island"] small');
    island.textContent = islandGrown() ? 'palm beaches, a jungle hill, a coral reef and a hut on stilts'
      : `sea, sand and a garden: it turns tropical once every plant and creature is found (${f.found} of ${f.total})`;
  }
  menus.scenes.addEventListener('click', (e) => {
    const b = e.target.closest('[data-scene]');
    if (!b) return;
    const miss = sceneMissing(b.dataset.scene);
    if (miss.length) {
      UI.note('This scene is locked', `It needs ${miss.map((t) => list[t].name.toLowerCase()).join(', ')}. Identify them in the Lab first.`);
      return;
    }
    loadScene(b.dataset.scene);
    menus.scenes.hidden = true;
  });

  // map size, save, load, clear
  function markSize() {
    for (const b of menus.world.querySelectorAll('[data-size]')) b.setAttribute('aria-pressed', b.dataset.size === mapSize);
  }
  markSize();
  // The sky behind the map. Auto suits the scene: day over the outdoor ones, dusk round the volcano and
  // the nuclear plant, night in the city, indoors, in a story chapter and in the Thermal and Air views.
  // The Map menu can pin it to one (store 'sky').
  const SCENE_SKY = { island: 'day', canyon: 'day', forest: 'day', caves: 'day', village: 'day', machines: 'day', volcano: 'dusk', reactor: 'dusk' };
  let skyPick = UI.store.get('sky', 'auto');
  const skyNow = () => (game.thermal || game.air ? 'night'
    : skyPick !== 'auto' ? skyPick : Journey.active ? 'night' : SCENE_SKY[game.scene] || 'night');
  function markSky() {
    for (const b of menus.world.querySelectorAll('[data-sky]')) b.setAttribute('aria-pressed', b.dataset.sky === skyPick);
  }
  markSky();
  menus.world.addEventListener('click', (e) => {
    const k = e.target.closest('[data-sky]');
    if (k) {
      skyPick = k.dataset.sky;
      UI.store.set('sky', skyPick);
      markSky();
      return;
    }
    const b = e.target.closest('[data-size]');
    if (!b) return;
    checkpoint();
    mapSize = b.dataset.size;
    UI.store.set('mapsize', mapSize);
    const s = pickWorldSize(mapSize);
    setWorld(Sim.createWorld(s.W, s.H));
    build(game.scene)(game.world);
    TryIt.staged(game.world);
    markSize();
    menus.world.hidden = true;
    UI.note(`Map is now ${s.W} × ${s.H}`, 'Scroll to zoom, middle-drag to move around.');
  });
  $('#btn-clear').addEventListener('click', () => { checkpoint(); game.world.clear(); TryIt.staged(game.world); menus.world.hidden = true; });
  $('#btn-save').addEventListener('click', () => {
    const ok = UI.store.set('world', game.world.serialize());
    menus.world.hidden = true;
    if (ok) UI.note('World saved', 'Load brings it back, even after you close the tab.');
    else UI.note('Could not save', 'Browser storage is full or blocked. Clear a little space and try again.');
  });
  $('#btn-load').addEventListener('click', () => {
    menus.world.hidden = true;
    const s = UI.store.get('world', null);
    if (!s) { UI.note('No saved world yet', 'Press Save first.'); return; }
    checkpoint();
    if (s.W !== game.world.W || s.H !== game.world.H) setWorld(Sim.createWorld(s.W, s.H));
    game.world.load(s);
    TryIt.own(game.world); // a saved world is your own work
    syncWeatherUI();
    UI.note('Saved world loaded', '');
  });

  // ───── weather ─────
  const WEATHER = {
    natural: ['Natural', 20, 0], clear: ['Clear', 22, 0], cloudy: ['Cloudy', 16, 0.5], rain: ['Rain', 12, 1],
    storm: ['Thunderstorm', 18, 2], snow: ['Snow', -6, 0.5], blizzard: ['Blizzard', -22, 3], fog: ['Fog', 6, 0],
    heatwave: ['Heatwave', 42, 0],
  };
  const ambientInput = $('#ambient'), windInput = $('#wind');
  function windText(v) {
    if (v === 0) return 'calm';
    const a = Math.abs(v);
    return `${v > 0 ? '→' : '←'} ${a <= 1 ? 'breeze' : a <= 2 ? 'wind' : 'gale'}`;
  }
  function syncWeatherUI() {
    const w = game.world;
    ambientInput.value = Math.round(w.ambient);
    windInput.value = w.weather.wind;
    $('#ambient-out').textContent = `${Math.round(w.ambient)}°C`;
    $('#wind-out').textContent = windText(+w.weather.wind);
    for (const b of menus.weather.querySelectorAll('[data-weather]')) b.setAttribute('aria-pressed', b.dataset.weather === w.weather.mode);
    $('#weather-label').textContent = `${WEATHER[w.weather.mode][0]} · ${Math.round(w.ambient)}°`;
  }
  function saveWeather() {
    const w = game.world;
    UI.store.set('weather', { mode: w.weather.mode, wind: w.weather.wind, ambient: w.ambient });
  }
  menus.weather.addEventListener('click', (e) => {
    const b = e.target.closest('[data-weather]');
    if (!b) return;
    const [, temp, wind] = WEATHER[b.dataset.weather];
    game.world.weather.mode = b.dataset.weather;
    game.world.weather.wind = wind;
    game.world.ambient = temp;
    syncWeatherUI(); saveWeather();
  });
  ambientInput.addEventListener('input', () => { game.world.ambient = +ambientInput.value; syncWeatherUI(); saveWeather(); });
  windInput.addEventListener('input', () => { game.world.weather.wind = +windInput.value; syncWeatherUI(); saveWeather(); });
  {
    const saved = UI.store.get('weather', null);
    if (saved && WEATHER[saved.mode]) {
      game.world.weather.mode = saved.mode;
      game.world.weather.wind = saved.wind;
      game.world.ambient = saved.ambient;
    }
    syncWeatherUI();
  }

  // ───── keyboard ─────
  const held = new Set();
  addEventListener('keydown', (e) => {
    if (e.key === 'Shift') pointer.shift = true; // straightens a Line or Box mid-drag, mouse still or not
    if (UI.anyModalOpen()) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
      return;
    }
    // keys typed into a box belong to it (Space too, in a text box; on a slider it still pauses)
    const field = e.target.closest('input, textarea');
    if (field && (e.key !== ' ' || field.tagName === 'TEXTAREA' || /^(search|text|number)$/.test(field.type))) return;
    if (e.key === '/' && !e.altKey) { e.preventDefault(); UI.focusSearch(); return; }
    if (e.altKey) return;
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'w', 'a', 's', 'd'].includes(k)) {
      held.add(k);
      if (k.startsWith('arrow')) e.preventDefault();
      return;
    }
    if (k === ' ') { e.preventDefault(); setPaused(!game.paused); }
    else if (k === '.') { setPaused(true); tickOnce(); }
    else if (k === '[') setBrush(game.brush - 1);
    else if (k === ']') setBrush(game.brush + 1);
    else if (k === '=' || k === '+') zoomCentre(1.25);
    else if (k === '-' || k === '_') zoomCentre(1 / 1.25);
    else if (k === '0') renderer.fitView();
    else if (k === 't') setThermal(!game.thermal);
    else if (k === 'v') setAir(!game.air);
    else if (k === 'l') setLens(!game.lens);
    else if (k === 'm') setSound(!AudioFX.enabled);
    else if (k === 'e') UI.select({ kind: 'tool', name: 'erase' });
    else if (k === 'h') UI.select({ kind: 'tool', name: 'heat' });
    else if (k === 'c') UI.select({ kind: 'tool', name: 'cool' });
    else if (k === 'g') UI.select({ kind: 'tool', name: 'magnet' });
    else if (k === 'x') UI.select({ kind: 'tool', name: 'smash' });
    else if (k >= '1' && k <= '7') setShape(SHAPES[+k - 1]);
  });
  addEventListener('keyup', (e) => { held.delete(e.key.toLowerCase()); if (e.key === 'Shift') pointer.shift = false; });
  addEventListener('blur', () => { held.clear(); pointer.shift = false; });

  function keyboardPan(dt) {
    if (!held.size) return;
    const v = 0.6 * dt; // CSS px per ms
    let dx = 0, dy = 0;
    if (held.has('arrowleft') || held.has('a')) dx += v;
    if (held.has('arrowright') || held.has('d')) dx -= v;
    if (held.has('arrowup') || held.has('w')) dy += v;
    if (held.has('arrowdown') || held.has('s')) dy -= v;
    if (dx || dy) { renderer.panBy(dx, dy); updatePointer(); }
  }

  // ───── readout ─────
  const readout = $('#readout');
  let lastReadout = '';
  function updateReadout() {
    let html = '';
    if (pointer.inside) {
      const c = game.world.cell(pointer.x, pointer.y);
      if (c) {
        const T = Math.round(c.temp);
        const cls = T >= 100 ? 'hot' : T <= 0 ? 'cold' : '';
        const d = list[c.t];
        let name = c.t === ID.EMPTY ? 'Air' : d.name;
        if (d.periodic) {
          const state = c.temp >= d.bp ? 'gas' : c.temp >= d.mp ? 'liquid' : 'solid';
          name = `${d.sym} ${d.name}</b> · ${state}<b>`;
        }
        let extra = (c.burning ? ' · burning' : '') + (c.charge ? ' · live' : '');
        if (game.air) {
          const [wx, wy] = c.wind, sp = Math.hypot(wx, wy), p = c.pressure;
          const arrow = sp < 0.05 ? 'still' : '→↘↓↙←↖↑↗'[Math.round(Math.atan2(wy, wx) / (Math.PI / 4) + 8) % 8] + ' ' + sp.toFixed(1);
          extra += ` · wind ${arrow} · pressure ${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(1)}`;
        }
        html = `<b>${name}</b> · <span class="${cls}">${T.toLocaleString()}°C</span>${extra}`;
      }
    }
    if (html !== lastReadout) { readout.innerHTML = html; lastReadout = html; }
  }

  // ───── loop ─────
  const TICK_MS = 1000 / 60;
  let acc = 0, prev = performance.now();

  function tickOnce() {
    game.world.step();
    Journey.afterTick();
    if (pointer.boltCd > 0) pointer.boltCd--;
    if (pointer.boomCd > 0) pointer.boomCd--;
  }

  const fusedSeen = new Set(); // superheavy elements made by fusion this session
  function handleEvents() {
    const ev = game.world.events;
    for (let k = 0; k < ev.found.length; k += 3) UI.onFound(ev.found[k], ev.found[k + 1], ev.found[k + 2]);
    for (let k = 0; k < ev.booms.length; k += 4) {
      renderer.shake(ev.booms[k + 2] * 0.9);
      renderer.blast(ev.booms[k], ev.booms[k + 1], ev.booms[k + 2], ev.booms[k + 3]);
    }
    for (let k = 0; k < ev.rx.length; k += 3) renderer.sparkle(ev.rx[k], ev.rx[k + 1], ev.rx[k + 2]);
    for (const t of ev.fused) { // the first time each superheavy element is made, say so
      if (fusedSeen.has(t)) continue;
      fusedSeen.add(t);
      const d = list[t];
      UI.toast({ eyebrow: 'Fusion', name: `${d.name}, element ${d.z}`, how: 'Calcium fused into an actinide. It lasts about a second before it decays.', t, ms: 6500 });
    }
    if (ev.bolts.length) renderer.flash(0.9);
    for (let k = 0; k < ev.hbomb.length; k += 3) { // a hydrogen bomb going off
      renderer.blast(ev.hbomb[k], ev.hbomb[k + 1], ev.hbomb[k + 2] * 0.45, 0);
      renderer.glare(1.4);
      renderer.shake(14);
    }
    if (ev.flash) renderer.flash(Math.min(1, ev.flash));
    if (ev.shake) renderer.shake(ev.shake);
    if (ev.fission) { renderer.shake(Math.min(10, ev.fission * 0.4)); renderer.flash(Math.min(0.7, ev.fission * 0.03)); }
    TryIt.frame(game.world, ev);
    Tints.frame(game.world);
    // an experiment with a pile to build or a wait to hold shows how far along it is
    if (game.world.tick % 20 === 0 && game.selected.kind === 'element' && TryIt.progress(game.selected.t)) UI.refreshInspect();
    if (!LabView.isOpen()) AudioFX.frame(ev); // the Lab's test tube has the sound while it is open
    game.world.resetEvents();
  }

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const GLOOM = { rain: 0.18, storm: 0.32, snow: 0.1, blizzard: 0.22, fog: 0.08, cloudy: 0.06 };
  let lastZoom = '';

  function frame(now) {
    const dt = Math.min(100, now - prev);
    prev = now;
    keyboardPan(dt);
    if (pointer.down && !pointer.anchor && !isMagnet() && !(isWeapon() && pointer.button === 0)) stroke();
    if (game.world.gripping) handTrack(now);
    if (pointer.weapon) game.world.steer(pointer.weapon, pointer.x);
    if (!game.paused && !UI.anyModalOpen()) {
      acc += dt * game.speed;
      let n = 0;
      while (acc >= TICK_MS && n < 4) { tickOnce(); acc -= TICK_MS; n++; }
      if (n === 4) acc = 0; // falling behind: drop time rather than spiral
    }
    handleEvents();

    const sel = game.selected;
    const b = renderer.brush;
    b.visible = pointer.inside && !pointer.panning;
    const end = dragEnd(); // a Line or Box being dragged shows where it will end (straightened with Shift)
    b.x = end.x; b.y = end.y;
    b.shape = isMagnet() ? 'magnet' : isWeapon() ? 'weapon' : isImage() ? 'image' : game.shape;
    b.image = isImage() ? pictureAt() : null;
    const drop = isWeapon() && sel.name === 'hbomb' ? game.world.dropPoint(pointer.x) : null; // where a bomb would land
    b.r = isMagnet() ? game.brush + 8 : drop ? drop.r : isWeapon() ? game.world.weaponReach(sel.name, weaponSize(), game.magnitude) : radius();
    b.ty = drop ? drop.y : 0;
    // where a quake does severe damage, or how far up from the bottom of the map a volcano's magma can rise
    b.r2 = !isWeapon() ? 0 : sel.name === 'quake' ? game.world.quakeInfo(game.magnitude).severe
      : sel.name === 'volcano' ? game.world.volcanoReach(weaponSize()) : 0;
    b.weapon = isWeapon() ? sel.name : null;
    b.anchor = pointer.anchor;
    b.active = pointer.down;
    b.color = sel.kind === 'weapon' ? UI.weaponColor(sel.name)
      : sel.kind === 'tool'
        ? sel.name === 'heat' ? '#ff7a3d' : sel.name === 'cool' ? '#8fd4ff' : sel.name === 'magnet' ? '#d08cff' : sel.name === 'smash' ? '#e0b070' : '#ece5d3'
        : sel.t === ID.PAINT && UI.paintColor(sel.t) ? `#${UI.paintColor(sel.t).toString(16).padStart(6, '0')}`
          : `rgb(${list[sel.t].rgb[0].join(',')})`;

    const w = game.world;
    renderer.draw(w.tick, {
      thermal: game.thermal, air: game.air, reducedMotion, lens: game.lens,
      weather: { ambient: w.ambient, gloom: GLOOM[w.weather.mode] || 0 }, sky: skyNow(),
      disasters: w.disasters,
    });
    const z = `${Math.round(renderer.zoom * 100)}%`;
    if (z !== lastZoom) { btnZoom.textContent = z; lastZoom = z; }
    updateReadout();
    requestAnimationFrame(frame);
  }

  // ───── story mode ─────
  // A chapter runs in a world of its own. The lab (its world, selection and undo history) waits
  // here untouched and comes back when you leave the chapter.
  Journey.init(game, {
    newWorld: (W, H) => Sim.createWorld(W, H),
    useWorld(w) {
      game.world = w;
      TryIt.staged(w); // a chapter's own set-up doesn't count toward Try it
      UI.syncWorldDisc(w);
      renderer.setWorld(w);
      refreshHistory();
    },
    borrowLab() {
      const lab = { world: game.world, selected: game.selected, undo: history.undo.splice(0), redo: history.redo.splice(0) };
      refreshHistory();
      return lab;
    },
    returnLab(lab) {
      game.world = lab.world;
      game.selected = lab.selected;
      history.undo.push(...lab.undo);
      history.redo.push(...lab.redo);
      UI.syncWorldDisc(game.world);
      renderer.setWorld(game.world);
      refreshHistory();
      syncWeatherUI();
    },
    setPaused,
  });

  // ───── resizable panel ─────
  // Drag the divider between the map and the panel to give the elements more room, or the map.
  // Beside the map it sets the panel's width; under it (narrow screens) its height. Each is
  // remembered; double-click or Home puts it back, and the arrow keys nudge it.
  const panel = $('#panel'), splitter = $('#splitter');
  const narrow = matchMedia('(max-width: 820px)');
  const panelSize = Object.assign({ w: 0, h: 0 }, UI.store.get('panel', {}));
  // never so big that the map disappears: keep 120px of it in view above the toolbar
  const panelLimits = () => (narrow.matches
    ? [140, Math.max(140, innerHeight - splitter.offsetHeight - $('#toolbar').offsetHeight - 22 - 120)]
    : [260, Math.max(260, Math.min(760, innerWidth - 360))]);
  function applyPanel() {
    const [lo, hi] = panelLimits(), v = narrow.matches ? panelSize.h : panelSize.w;
    panel.style.removeProperty('--panel-user');
    panel.style.removeProperty('--panel-user-h');
    if (v) panel.style.setProperty(narrow.matches ? '--panel-user-h' : '--panel-user', `${Math.round(Math.min(hi, Math.max(lo, v)))}px`);
    splitter.setAttribute('aria-orientation', narrow.matches ? 'horizontal' : 'vertical');
  }
  function setPanel(v) {
    const [lo, hi] = panelLimits();
    v = Math.round(Math.min(hi, Math.max(lo, v)));
    if (narrow.matches) panelSize.h = v; else panelSize.w = v;
    applyPanel();
  }
  function resetPanel() {
    if (narrow.matches) panelSize.h = 0; else panelSize.w = 0;
    applyPanel();
    UI.store.set('panel', panelSize);
  }
  splitter.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { splitter.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    splitter.classList.add('dragging');
    document.body.classList.add('resizing');
    document.body.classList.toggle('rows', narrow.matches);
    const move = (ev) => setPanel(narrow.matches ? innerHeight - ev.clientY - splitter.offsetHeight / 2 : innerWidth - ev.clientX);
    const end = () => {
      splitter.removeEventListener('pointermove', move);
      splitter.removeEventListener('pointerup', end);
      splitter.removeEventListener('pointercancel', end);
      splitter.classList.remove('dragging');
      document.body.classList.remove('resizing', 'rows');
      UI.store.set('panel', panelSize);
    };
    splitter.addEventListener('pointermove', move);
    splitter.addEventListener('pointerup', end);
    splitter.addEventListener('pointercancel', end);
  });
  splitter.addEventListener('dblclick', resetPanel);
  splitter.addEventListener('keydown', (e) => {
    const size = narrow.matches ? panel.offsetHeight : panel.offsetWidth;
    const grow = e.key === (narrow.matches ? 'ArrowUp' : 'ArrowLeft');
    const shrink = e.key === (narrow.matches ? 'ArrowDown' : 'ArrowRight');
    if (grow || shrink) { setPanel(size + (grow ? 32 : -32)); UI.store.set('panel', panelSize); }
    else if (e.key === 'Home') resetPanel();
    else return;
    e.preventDefault();
    e.stopPropagation(); // the arrow keys would otherwise pan the map too
  });
  narrow.addEventListener('change', applyPanel);
  addEventListener('resize', applyPanel);
  applyPanel();

  // ───── the panel's parts ─────
  // A grip under the tools and another over the description at the foot of the panel: drag one
  // to give that part more room or less (the element table takes what is left; a part made
  // smaller than what it holds scrolls). Remembered; double-click or Home puts one back to its
  // natural size, and the arrow keys nudge it. The title can be minimized to one slim line.
  const parts = Object.assign({ tools: null, info: null }, UI.store.get('panelParts', {}));
  const PARTS = { tools: [$('#tools'), $('#grip-tools'), 1, 32], info: [$('#inspect'), $('#grip-info'), -1, 0] };
  function applyParts() {
    for (const [key, [box]] of Object.entries(PARTS)) {
      const h = parts[key];
      box.style.height = h == null ? '' : `${h}px`;
      box.classList.toggle('sized', h != null);
    }
  }
  for (const [key, [box, grip, sign, least]] of Object.entries(PARTS)) {
    // sign: which way dragging the grip down takes the part (the tools grow, the description shrinks)
    const setPart = (h) => { parts[key] = Math.round(Math.max(least, Math.min(Math.max(80, panel.clientHeight * 0.6), h))); applyParts(); };
    const save = () => UI.store.set('panelParts', parts);
    const reset = () => { parts[key] = null; applyParts(); save(); };
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { grip.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      const y0 = e.clientY, h0 = box.getBoundingClientRect().height;
      grip.classList.add('dragging');
      document.body.classList.add('resizing', 'rows');
      const move = (ev) => setPart(h0 + sign * (ev.clientY - y0));
      const end = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', end);
        grip.removeEventListener('pointercancel', end);
        grip.classList.remove('dragging');
        document.body.classList.remove('resizing', 'rows');
        save();
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', end);
      grip.addEventListener('pointercancel', end);
    });
    grip.addEventListener('dblclick', reset);
    grip.addEventListener('keydown', (e) => {
      const h = box.getBoundingClientRect().height;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { setPart(h + sign * (e.key === 'ArrowDown' ? 16 : -16)); save(); }
      else if (e.key === 'Home') reset();
      else return;
      e.preventDefault();
      e.stopPropagation(); // the arrow keys would otherwise pan the map too
    });
  }
  applyParts();

  const brand = $('#brand'), brandMin = $('#brand-min');
  function setBrandMin(min) {
    brand.classList.toggle('min', min);
    brandMin.textContent = min ? '+' : '–';
    brandMin.title = min ? 'Show the full title' : 'Minimize the title';
    brandMin.setAttribute('aria-label', brandMin.title);
    brandMin.setAttribute('aria-expanded', !min);
    UI.store.set('brandMin', min);
  }
  brandMin.addEventListener('click', () => setBrandMin(!brand.classList.contains('min')));
  setBrandMin(UI.store.get('brandMin', true));

  // On a phone or a tablet, Journey, Lab, Codex, Hint and Help fold away behind the ‹ in the
  // panel's header, and slide out over it when you press it; on a wide screen they sit in the footer.
  const footBtns = $('#foot-btns'), tray = $('#brand-tray'), more = $('#btn-more'), foot = $('.panel-foot');
  const compact = matchMedia('(max-width: 1024px)');
  function setTray(open) {
    brand.classList.toggle('tray-open', open);
    more.setAttribute('aria-expanded', open);
    more.firstElementChild.textContent = open ? '›' : '‹';
    more.title = open ? 'Fold them away' : 'Journey, Lab, Codex, Hint and Help';
  }
  function placeFootButtons() {
    if (compact.matches) tray.append(footBtns); else foot.append(footBtns);
    setTray(false);
  }
  compact.addEventListener('change', placeFootButtons);
  placeFootButtons();
  more.addEventListener('click', () => { AudioFX.click(); setTray(!brand.classList.contains('tray-open')); });
  footBtns.addEventListener('click', (e) => { if (compact.matches && e.target.closest('button')) setTray(false); });
  document.addEventListener('pointerdown', (e) => { if (brand.classList.contains('tray-open') && !brand.contains(e.target)) setTray(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && brand.classList.contains('tray-open')) setTray(false); });

  new ResizeObserver(() => renderer.resize()).observe(stage);
  // keep pop-up menus just above the toolbar, however many rows it wraps onto
  const toolbar = $('#toolbar');
  new ResizeObserver(() => {
    stage.style.setProperty('--tb-h', `${toolbar.offsetHeight}px`);
    renderer.setInsetBottom(toolbar.offsetHeight + 22); // the map fits in the space above the toolbar
  }).observe(toolbar);
  requestAnimationFrame(frame);

  G.game = game; // handy from the console
})(globalThis);
