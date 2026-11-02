/* Elementarium — interface: the element table, discoveries, codex, hints and toasts. */
(function (G) {
  'use strict';

  const { ELEM, Renderer, AudioFX, Lab, TryIt, Tints } = G;
  const { list, GROUPS, ID } = ELEM;

  const SYM = {
    wall: 'Wl', sand: 'Sd', water: 'Aq', stone: 'St', wood: 'Wd', fire: 'Ig', dirt: 'Te', seed: 'Se', salt: 'Sl',
    oil: 'Ol', metal: 'Fe', steam: 'Vp', ice: 'Ic', smoke: 'Fu', ash: 'As', ember: 'Em', lava: 'Lv', obsidian: 'Ob',
    mglass: 'Gm', glass: 'Gl', mud: 'Md', brick: 'Bk', plant: 'Pl', flower: 'Fl', saltwater: 'Sw', rust: 'Ru',
    mmetal: 'Mm', snow: 'Sn', gunpowder: 'Gp', acid: 'Ac', methane: 'Ch', coal: 'C', diamond: 'Dm', battery: 'Bt',
    spark: 'El', lightning: 'Lt', plasma: 'Pz', fish: 'Fs', worm: 'Wm', firefly: 'Ff', thermite: 'Th', napalm: 'Np',
    clone: 'Cl', void: 'Vo', cryo: 'Cy', nitro: 'Ni', moss: 'Ms',
    human: 'Hu', bird: 'Bd', ant: 'An',
    cloud: 'Cu', raincloud: 'Ns', stormcloud: 'Cb', snowcloud: 'Nv', fog: 'Fg', hail: 'Hl', rubble: 'Rbl', shards: 'Sh',
    co2: 'CO₂', dryice: 'Dr', clay: 'Kl', soap: 'Sp', foam: 'Fm',
    acorn: 'Qu', grassseed: 'Gs', cactusseed: 'Cs', vineseed: 'Vs', spores: 'Sv', lilyseed: 'Ls',
    grass: 'Gr', cactus: 'Ct', vine: 'Vi', mushroom: 'Mu', lily: 'Ny',
    soil: 'So', concrete: 'Cc', cement: 'Cm', alcohol: 'Et', vinegar: 'Vg', explosion: 'Ex', light: 'Lx',
    sapling: 'Qr', pine: 'Pi', palm: 'Pm', willow: 'Sx', pinecone: 'Pc', coconut: 'Cn', catkin: 'Ck', paint: 'Pa', image: 'Im',
    sugar: 'Su', lime: 'Cx', limestone: 'Lp', cell: 'Cel', cow: 'Bo', wolf: 'Wf', shark: 'Sk',
    wire: 'Wr', switch: 'Swt', sensor: 'Sen', pipe: 'Ppe', valve: 'Vlv', pump: 'Pmp', tank: 'Tnk', piston: 'Pst',
  };

  for (const d of list) if (d.castOf !== undefined) SYM[d.key] = list[d.castOf].sym; // a solid metal shows its metal's symbol

  const STORE = 'elementarium.v1.';
  let locked = false; // a backup was just restored: nothing still in memory may write over it before the reload
  const store = {
    get(k, d) { try { const v = localStorage.getItem(STORE + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { if (locked) return false; try { localStorage.setItem(STORE + k, JSON.stringify(v)); return true; } catch { return false; } },
    del(k) { if (locked) return; try { localStorage.removeItem(STORE + k); } catch { /* storage unavailable */ } },
    // every key the game has stored (without the prefix), for a backup
    keys() {
      const out = [];
      try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(STORE)) out.push(k.slice(STORE.length)); } } catch { /* storage unavailable */ }
      return out;
    },
    lock() { locked = true; },
  };

  const $ = (s) => document.querySelector(s);
  // Each section opens with its starters. The Solids then run from rock and building stuff to the
  // cast metals, lightest first, with diamond, the hardest of all, last.
  const FIRST = {
    Solids: ['wall', 'soil', 'stone', 'wood', 'metal'], Powders: ['sand', 'dirt', 'salt', 'sugar'],
    Liquids: ['water', 'oil', 'lime'], Plants: ['plant', 'flower'], Life: ['cell'], Machines: ['battery'],
  };
  const tableOrder = [];
  for (const g of GROUPS) {
    const first = (FIRST[g] || []).map((k) => ELEM.byKey[k]);
    let rest = list.filter((d) => !d.hidden && d.group === g && !first.includes(d));
    if (g === 'Solids') {
      const cast = rest.filter((d) => d.castOf !== undefined).sort((a, b) => a.density - b.density);
      rest = rest.filter((d) => d.castOf === undefined && d.key !== 'diamond').concat(cast, ELEM.byKey.diamond);
    }
    // the Oak's tile sits with the other trees rather than at the head of the plants (its element is older)
    if (g === 'Plants') { rest.splice(rest.indexOf(ELEM.byKey.sapling), 1); rest.splice(rest.indexOf(ELEM.byKey.pine), 0, ELEM.byKey.sapling); }
    tableOrder.push(...first, ...rest);
  }
  const number = new Map(tableOrder.map((d, k) => [d.id, k + 1]));
  const tiles = new Map();
  const swatches = new Map();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let game = null;
  const known = new Uint8Array(ELEM.NT);   // persisted discoveries (starters always known)
  const fresh = new Set();             // discovered but not yet selected

  const swatchFor = (t, w = 12, h = 13) => {
    const key = `${t}:${w}:${h}`;
    if (!swatches.has(key)) swatches.set(key, Renderer.swatch(t, w, h));
    return swatches.get(key);
  };
  const cloneCanvas = (src) => {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
  };

  // ───── discovery bookkeeping ─────
  const totalKnown = () => tableOrder.filter((d) => !d.special && known[d.id]).length;
  const tableTotal = tableOrder.filter((d) => !d.special).length;
  // the plants and creatures there are to find: the last of them grows the Island scene into the tropical one
  const LIFE = ELEM.discoverable.filter((d) => d.group === 'Plants' || d.group === 'Life');
  const lifeFound = () => LIFE.reduce((n, d) => n + (known[d.id] ? 1 : 0), 0);

  function unlocked(t) {
    const d = list[t];
    if (game.sandbox) return true;
    // whatever a chapter puts in the pouch can be used, discovered or not
    if (G.Journey && G.Journey.active && G.Journey.allows({ kind: 'element', t })) return true;
    if (d.periodic) return Lab.has(t); // identified in the Lab
    if (d.special) return d.needs ? G.Unlocks.has('part', d.key) : specialMet(d); // a part: a battery touched its partner
    return !!known[t];
  }
  // Clone and Void open with discoveries, Paint and Image with Try it stars. Only Hint says so.
  const specialMet = (d) => (d.unlockStars ? TryIt.count() >= d.unlockStars : totalKnown() >= d.unlockAt);
  const SPECIALS = list.filter((d) => d.special && !d.needs);
  const partnerName = (d) => ELEM.byKey[G.Unlocks.partner(d.key)].name;
  // how a special element opens, in a sentence, and how far along you are
  const opensWhen = (d) => (d.needs ? `Let a battery touch ${partnerName(d).toLowerCase()} in your world`
    : d.unlockStars ? `Earn ${d.unlockStars} Try it stars: each periodic element has an experiment to do (the ☆ under it)`
      : `Find ${d.unlockAt} elements`);
  const specialProgress = (d) => (d.unlockStars ? [TryIt.count(), d.unlockStars, `★ ${TryIt.count()} of ${d.unlockStars}`] : [totalKnown(), d.unlockAt, `${totalKnown()} of ${d.unlockAt} found`]);
  function near(t) {
    const d = list[t];
    return !known[t] && !d.special && d.fromIds.length > 0 && d.fromIds.every((f) => known[f] || (list[f].periodic && Lab.has(f)));
  }

  function loadKnown() {
    for (const d of ELEM.starters) known[d.id] = 1;
    for (const k of store.get('found', [])) if (ELEM.byKey[k]) known[ELEM.byKey[k].id] = 1;
  }
  function saveKnown() {
    store.set('found', list.filter((d) => known[d.id] && !d.starter).map((d) => d.key));
  }
  function syncWorldDisc(world) {
    world.disc.fill(0);
    for (let t = 0; t < ELEM.NT; t++) if (known[t]) world.disc[t] = 1;
    // air and the specials are never "discovered" by the simulation. A locked periodic element
    // is: if the world makes it (radium decaying to radon, uranium splitting), it unlocks. Not in
    // sandbox mode, where everything can be painted.
    for (const d of list) if (d.hidden || d.special || (d.periodic && (Lab.has(d.id) || game.sandbox))) world.disc[d.id] = 1;
  }

  // ───── the table ─────
  function makeTile(d, opts = {}) {
    const b = document.createElement('button');
    b.className = 'tile';
    b.type = 'button';
    b.dataset.t = d.id;
    const c = cloneCanvas(swatchFor(d.id));
    b.append(c);
    b.insertAdjacentHTML('beforeend', `<span class="num">${number.get(d.id)}</span><span class="sym"></span><span class="nm"></span>`);
    if (!opts.codex) b.addEventListener('click', () => { select({ kind: 'element', t: d.id }, b); if (d.key === 'image' && unlocked(d.id)) pickPicture(); });
    if (!opts.codex && Tints.kindOf(d.id)) b.append(tintBadge(d.id)); // Glass, Fire and Explosion: the colour they paint in
    if (!opts.codex && d.key in paints) b.append(colorBadge(d.key)); // Concrete and Paint: any colour at all
    return b;
  }

  // ───── any colour: Concrete and the Paint tool ─────
  // Concrete can be laid in any colour, and the Paint tool recolours whatever it touches. The dot on
  // their tiles picks the colour, from a palette or from the full colour picker.
  const PALETTE = ['#ece8de', '#9a9a94', '#3a3a3e', '#111111', '#c0392b', '#e67e22', '#f1c40f', '#7dbb3a',
    '#1e8449', '#36a3c9', '#2e5cb8', '#6c3fb5', '#d35e9b', '#8a5a34', '#f5cba7', '#ffffff'];
  const paints = { concrete: null, paint: '#c0392b' };
  Object.assign(paints, store.get('paints', {}));
  // Concrete's colours come with the Paint tool: until Paint opens, concrete is laid plain grey
  const colourOpen = (key) => key !== 'concrete' || unlocked(ELEM.byKey.paint.id);
  const paintRGB = (key) => (paints[key] && colourOpen(key) ? parseInt(paints[key].slice(1), 16) : 0);
  function colorBadge(key) {
    const s = document.createElement('span');
    s.className = 'tint-badge';
    s.setAttribute('role', 'button');
    s.tabIndex = 0;
    const open = (e) => { e.preventDefault(); e.stopPropagation(); openColorMenu(key, s); };
    s.addEventListener('click', open);
    s.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(e); });
    return s;
  }
  function paintColorBadge(s, key, shown) {
    s.hidden = !shown;
    s.classList.toggle('set', !!paints[key]);
    s.style.setProperty('--c', paints[key] || 'transparent');
    const label = key === 'concrete' ? (paints.concrete ? `Concrete colour: ${paints.concrete}. Click to change.` : 'Concrete colour: plain grey. Click to choose a colour.')
      : paints.paint ? `Paint colour: ${paints.paint}. Click to change.` : 'Paint: washing paint off. Click to choose a colour.';
    s.title = label;
    s.setAttribute('aria-label', label);
  }
  function openColorMenu(key, anchor) {
    const again = tintMenu && tintMenu.dataset.kind === key;
    closeTintMenu();
    if (again) return;
    const noun = key === 'concrete' ? 'Concrete' : 'Paint';
    const m = document.createElement('div');
    m.className = 'tint-menu';
    m.dataset.kind = key;
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-label', `${noun} colour`);
    m.innerHTML = `<div class="tint-head"><b>${noun} colour</b><span>${paints[key] || (key === 'concrete' ? 'plain' : 'wash off')}</span></div>`;
    const choose = (hex) => {
      paints[key] = hex;
      store.set('paints', paints);
      closeTintMenu();
      select({ kind: 'element', t: ELEM.byKey[key].id }); // and pick it up to paint with
      refreshTable();
    };
    const grid = document.createElement('div');
    grid.className = 'tint-grid swatches';
    const plain = document.createElement('button');
    plain.type = 'button';
    plain.className = `tint-opt${paints[key] ? '' : ' on'}`;
    plain.innerHTML = '<span class="tint-dot"></span><span class="tint-name"></span>';
    plain.querySelector('.tint-name').textContent = key === 'concrete' ? 'Plain' : 'Wash off';
    plain.title = key === 'concrete' ? 'Plain grey concrete' : 'Take paint off whatever the brush touches';
    plain.addEventListener('click', () => choose(null));
    grid.append(plain);
    for (const hex of PALETTE) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `tint-chip${paints[key] === hex ? ' on' : ''}`;
      b.style.setProperty('--c', hex);
      b.title = hex;
      b.setAttribute('aria-label', hex);
      b.addEventListener('click', () => choose(hex));
      grid.append(b);
    }
    const any = document.createElement('label');
    any.className = 'tint-any';
    any.innerHTML = '<input type="color"><span>Any colour…</span>';
    const input = any.querySelector('input');
    input.value = paints[key] || '#9a9a94';
    input.addEventListener('change', () => choose(input.value));
    const foot = document.createElement('p');
    foot.className = 'tint-note';
    foot.textContent = key === 'concrete' ? 'Concrete is laid in this colour. Pictures from the Image tool are built of concrete too.'
      : 'Paint recolours anything under the brush: stone, water, plants, even people. The bucket shape paints a whole area.';
    m.append(grid, any, foot);
    m.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeTintMenu(); anchor.focus(); } });
    document.body.append(m);
    const r = anchor.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.right - w))}px`;
    m.style.top = `${r.bottom + 6 + h < innerHeight ? r.bottom + 6 : Math.max(8, r.top - h - 6)}px`;
    tintMenu = m;
    document.addEventListener('pointerdown', outsideTint, true);
    (m.querySelector('.on') || plain).focus();
  }

  // ───── the Image tool ─────
  // A picture from a file, chosen when the Image tile is clicked; main.js builds it in concrete.
  let picture = null; // { img, name, sized }
  const filePick = document.createElement('input');
  filePick.type = 'file'; filePick.accept = 'image/*'; filePick.hidden = true;
  filePick.addEventListener('change', () => {
    const f = filePick.files && filePick.files[0];
    filePick.value = '';
    if (!f) return;
    const url = URL.createObjectURL(f), img = new Image();
    img.onload = () => {
      picture = { img, name: f.name, sized: null };
      note('Picture ready', 'Click the map to build it in concrete. The brush size sets how big.');
      renderInspect();
    };
    img.onerror = () => note('That file isn’t a picture', 'Pick a PNG, JPEG, GIF or WebP image.');
    img.src = url;
  });
  function pickPicture() { filePick.click(); }

  // ───── colours for glass and fire ─────
  // The dot in the corner of the Glass and Fire tiles: the colour they paint in (tints.js keeps
  // which colours you have made). Click it for the colours, made and still to make.
  function tintBadge(t) {
    const s = document.createElement('span');
    s.className = 'tint-badge';
    s.setAttribute('role', 'button');
    s.tabIndex = 0;
    const open = (e) => { e.preventDefault(); e.stopPropagation(); openTintMenu(Tints.kindOf(t), s, t); };
    s.addEventListener('click', open);
    s.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(e); });
    return s;
  }
  function paintBadge(s, t, shown) {
    const kind = Tints.kindOf(t), pick = Tints.chosen(kind), made = Tints.count(kind);
    s.hidden = !shown;
    s.classList.toggle('none', !made);
    s.classList.toggle('set', !!pick);
    s.classList.toggle('rainbow', !!(pick && pick.rainbow));
    s.style.setProperty('--c', pick ? pick.color : 'transparent');
    const noun = list[t].name;
    const label = pick ? `${noun} colour: ${pick.name} (${pick.d.name.toLowerCase()}). Click to change.`
      : made ? `${noun} colours: ${made} made. Click to choose one.`
        : kind === 'glass' ? 'Glass colours: stir a metal into molten glass to make the first.' : 'Fire colours: colour a flame with an element to make the first.';
    s.title = label;
    s.setAttribute('aria-label', label);
  }

  let tintMenu = null;
  function closeTintMenu() {
    if (!tintMenu) return;
    tintMenu.remove();
    tintMenu = null;
    document.removeEventListener('pointerdown', outsideTint, true);
  }
  const outsideTint = (e) => { if (tintMenu && !tintMenu.contains(e.target) && !e.target.closest('.tint-badge')) closeTintMenu(); };
  function openTintMenu(kind, anchor, t = Tints.base(kind)) {
    const again = tintMenu && tintMenu.dataset.kind === kind;
    closeTintMenu();
    if (again) return; // a second click on the dot closes it
    const opts = Tints.options(kind), made = opts.filter((o) => o.open).length, pick = Tints.chosen(kind);
    const m = document.createElement('div');
    m.className = 'tint-menu';
    m.dataset.kind = kind;
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-label', `${kind === 'glass' ? 'Glass' : 'Fire'} colours`);
    const head = document.createElement('div');
    head.className = 'tint-head';
    head.innerHTML = `<b>${kind === 'glass' ? 'Glass' : 'Fire'} colours</b><span>${made} of ${opts.length} made</span>`;
    const grid = document.createElement('div');
    grid.className = 'tint-grid';
    const option = (o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `tint-opt${o && !o.open ? ' locked' : ''}${o && o.rainbow ? ' rainbow' : ''}${(o ? o.t : 0) === (pick ? pick.t : 0) ? ' on' : ''}`;
      if (o) b.style.setProperty('--c', o.color);
      const name = !o ? 'Plain' : o.open ? o.name : '?';
      b.innerHTML = `<span class="tint-dot"></span><span class="tint-name"></span><small></small>`;
      b.querySelector('.tint-name').textContent = name;
      b.querySelector('small').textContent = o ? o.d.sym : '';
      const el = o && o.d.name.toLowerCase();
      b.title = !o ? `Plain ${kind}`
        : o.rainbow ? (o.open ? 'Rainbow: every fire colour in turn, changing every two seconds' : `Make all ${opts.length} fire colours to burn in every one of them in turn`)
        : o.open ? `${o.name}, from ${el}`
          : !Lab.has(o.t) ? `Unlock ${el} in the Lab first`
            : kind === 'glass' ? `Stir ${el} into molten glass to make this colour` : `Colour a fire with ${el} to make this colour`;
      b.addEventListener('click', () => {
        if (o && !o.open) { note(o.rainbow ? 'Rainbow fire' : o.d.name, b.title + '.'); return; }
        Tints.choose(kind, o ? o.t : 0);
        closeTintMenu();
        select({ kind: 'element', t }); // and pick up the glass, fire or explosion to paint with
      });
      return b;
    };
    grid.append(option(null), ...opts.map(option));
    if (kind === 'fire') grid.append(option(Tints.rainbow())); // every colour in turn, once all are made
    const foot = document.createElement('p');
    foot.className = 'tint-note';
    foot.textContent = kind === 'glass' ? 'Stir a metal into molten glass yourself to add its colour here.'
      : 'Colour a flame yourself (a pinch of the element in a fire, or fireworks) to add its colour here.';
    m.append(head, grid, foot);
    m.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeTintMenu(); anchor.focus(); } });
    document.body.append(m);
    // beside the dot, kept on screen
    const r = anchor.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.right - w))}px`;
    m.style.top = `${r.bottom + 6 + h < innerHeight ? r.bottom + 6 : Math.max(8, r.top - h - 6)}px`;
    tintMenu = m;
    document.addEventListener('pointerdown', outsideTint, true);
    (m.querySelector('.tint-opt.on') || m.querySelector('.tint-opt')).focus();
  }
  // a colour made for the first time
  function tintMade(kind, o, x, y) {
    game.renderer.ring(x, y, o.color);
    AudioFX.discovery();
    toast({ eyebrow: 'New colour', name: `${o.name[0].toUpperCase()}${o.name.slice(1)} ${kind}`, icon: [o.color, '<circle cx="8" cy="8" r="6.5" fill="currentColor"/>'],
      how: `From ${o.d.name.toLowerCase()}. Paint ${kind} in it: the colour dot on the ${kind === 'glass' ? 'Glass' : 'Fire'} tile.`, ms: 6500 });
    refreshTable();
  }

  function paintTile(b, d, codex) {
    const isOpen = codex ? (known[d.id] || (d.special && unlocked(d.id))) : unlocked(d.id);
    b.classList.toggle('locked', !isOpen);
    b.classList.toggle('near', !isOpen && near(d.id));
    b.classList.toggle('new', !codex && fresh.has(d.id));
    b.querySelector('canvas').style.display = isOpen ? '' : 'none';
    b.querySelector('.sym').textContent = isOpen ? SYM[d.key] : '?';
    b.querySelector('.nm').textContent = isOpen ? d.name : '';
    let title;
    if (isOpen) title = `${d.name} — ${d.desc}`;
    else if (codex) title = 'Not found yet';
    else if (near(d.id)) title = 'Within reach — click for a hint';
    else title = 'Not found yet — click for a hint';
    b.title = title;
    b.setAttribute('aria-label', isOpen ? d.name : 'Undiscovered element');
    const badge = b.querySelector('.tint-badge');
    if (badge) { if (d.key in paints) paintColorBadge(badge, d.key, isOpen && colourOpen(d.key)); else paintBadge(badge, d.id, isOpen); }
  }

  function buildTable() {
    const root = $('#table');
    root.innerHTML = '';
    for (const g of GROUPS) {
      const items = tableOrder.filter((d) => d.group === g);
      if (!items.length) continue;
      const label = document.createElement('div');
      label.className = 'group-label';
      label.textContent = g;
      const grid = document.createElement('div');
      grid.className = 'tiles';
      for (const d of items) {
        const b = makeTile(d);
        tiles.set(d.id, b);
        grid.append(b);
      }
      root.append(label, grid);
    }
    refreshTable();
  }

  function refreshTable() {
    for (const d of tableOrder) paintTile(tiles.get(d.id), d, false);
    $('#found-count').textContent = totalKnown();
    $('#found-total').textContent = tableTotal;
    $('#found-bar').style.width = `${(totalKnown() / tableTotal) * 100}%`;
    for (const [name, b] of Object.entries(toolButtons)) b.classList.toggle('on', game.selected.kind === 'tool' && game.selected.name === name);
    for (const [name, b] of Object.entries(weaponButtons)) b.classList.toggle('on', game.selected.kind === 'weapon' && game.selected.name === name);
    const box = $('#magnitude');
    if (box) box.hidden = !(game.selected.kind === 'weapon' && game.selected.name === 'quake');
    for (const [t, b] of tiles) b.classList.toggle('on', game.selected.kind === 'element' && game.selected.t === t);
    paintMachineBox();
    paintPeriodic();
    renderInspect();
    if (G.Journey) G.Journey.refreshPouch();
    if (searchQ) renderSearch();
  }

  // ───── selection ─────
  const toolButtons = {};
  const TOOL_INFO = {
    erase: ['Erase', 'Removes matter. Right-drag erases with anything selected.'],
    heat: ['Heat', 'Heats what is under the brush. Hold it to melt stone.'],
    cool: ['Cool', 'Chills what is under the brush, down to absolute zero.'],
    magnet: ['Magnet', 'Hold to carry loose matter and people. Flick to throw. Switch Magnetic on and it picks up only magnetic metals, as a real magnet would.'],
    shock: ['Shock', 'Electricity under the brush, no battery needed. Hold it on a wire, a metal or a machine and the current runs through it, and machines in reach run. In the open air sparks fly, and gunpowder and other volatile things catch.'],
    ground: ['Ground', 'Hold it over a circuit: every current within the brush runs to earth. Wires go dead, sparks and lightning vanish, and pumps, pistons, valves and thrusters in reach stop while you hold it.'],
    smash: ['Smash', 'Breaks what is brittle under the brush: stone and brick to rubble, glass to shards, ice to snow, wood to splinters. Smash rubble or shards again for sand. A cast metal block breaks back into its grains, the denser the slower; diamond grinds to dust slowest of all. Plain metal bends.'],
  };

  // ───── weapons ─────
  // name, a line for its card, what it does, its colour, and its icon (16 × 16 SVG)
  const stroke = (d, w = 1.5) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const CLOUD_ICON = (y) => `<path d="M4.2 ${y}a3 3 0 01.4-6 3.6 3.6 0 016.6 1.2 2.4 2.4 0 01.6 4.8z" fill="currentColor" opacity=".55"/>`;
  const WEAPON_INFO = {
    tsunami: ['Tsunami', 'Rolls in from the nearer edge',
      'A wall of sea rolls in from the nearer edge and floods the land.',
      '#4aa3ff', stroke('M1 12.5c2.2 0 2.6-2 4.4-2s2.2 2 4.2 2 2.4-2 4.4-2') + stroke('M2 9c.6-4.4 4.6-7.3 8.6-6 2.4.8 3 3.6 1.2 4.3-1.4.5-2.3-.9-1.4-1.8')],
    quake: ['Earthquake', 'Set its magnitude, then strike',
      '',
      '#d2a062', stroke('M1 8.5h2.5l1.5-4 2 8 2-10 2 9 1.5-3H15')],
    tornado: ['Tornado', 'Lifts everything in its path',
      'Invisible wind that lifts all it passes. Hold to steer; Air view shows it.',
      '#c3cbd4', stroke('M2 2.5h12M3.5 5.3h9.5M5.5 8.1h6.5M6.5 10.9h4M7.6 13.7h1.8', 1.6)],
    volcano: ['Volcano', 'Magma rises from the bottom',
      'Magma rises from below, higher with a bigger brush, and erupts at the surface.',
      '#ff6a2a', '<path d="M1 14.5l4.2-7h5.6l4.2 7z" fill="currentColor"/>' + stroke('M7 5.5c-.4-1.6.6-2.4 1.6-2.6s1.2-1.6.4-2.4', 1.3)],
    meteor: ['Meteor', 'Strikes from the sky',
      'Streaks down at a slant, digs a crater and leaves iron.',
      '#ffb04a', '<circle cx="10.5" cy="10.5" r="3.2" fill="currentColor"/>' + stroke('M1.5 1.5l6 6M4.5 1.3l4.3 4.3M1.3 4.5l4.3 4.3', 1.4)],
    storm: ['Lightning storm', 'Bolt after bolt from above',
      'Storm clouds roll in and strike again and again.',
      '#c9a3ff', CLOUD_ICON(9.5) + stroke('M8.6 7.5L6.4 11h2.4l-1.6 4')],
    solar: ['Solar storm', 'Knocks out every circuit',
      'Charged particles from the sun: switches trip, circuits fail and an aurora lights the sky. The bigger, the longer.',
      '#5effa8', '<circle cx="4.6" cy="4.6" r="2.3" fill="currentColor"/>' + stroke('M4.6.6v1M4.6 7.6v1M.6 4.6h1M7.6 4.6h1', 1.2) + stroke('M1.5 13.5c2-1.6 3.4 1.2 5.4-.4s3.4-1.2 5.4.4M5 10.6c2-1.4 3.2.8 5-.4s2.6-.9 4.5.3', 1.3)],
    freeze: ['Ice age', 'A front of deadly cold',
      'A front of −100°C cold: water and lava freeze, fire goes out.',
      '#8fd4ff', stroke('M8 1v14M1.9 4.5l12.2 7M1.9 11.5l12.2-7', 1.4) + stroke('M6 2.5L8 4l2-1.5M6 13.5L8 12l2 1.5', 1.2)],
    acidrain: ['Acid rain', 'Rain that eats what it hits',
      'A dark cloud rains acid that eats what it lands on.',
      '#9be04a', CLOUD_ICON(8) + stroke('M5 10.5l-.8 2M8.4 10.5l-.8 2M11.8 10.5l-.8 2M6.6 13l-.6 1.6M10 13l-.6 1.6', 1.4)],
    nuke: ['Nuke', 'The end of everything near it',
      'Fireball, blast wave, heat flash and a mushroom cloud.',
      '#ffe066', '<circle cx="8" cy="8" r="1.5" fill="currentColor"/><path d="M6.7 5.75L4.5 1.94A7 7 0 0111.5 1.94L9.3 5.75A2.6 2.6 0 006.7 5.75zM10.6 8H15A7 7 0 0111.5 14.06L9.3 10.25A2.6 2.6 0 0010.6 8zM6.7 10.25L4.5 14.06A7 7 0 011 8H5.4A2.6 2.6 0 006.7 10.25z" fill="currentColor"/>'],
    hbomb: ['Hydrogen bomb', 'Falls from the sky, takes ⅔ of the map',
      'Falls from the sky and levels two-thirds of the map.',
      '#ff7a52', '<path d="M8 15.2c-1.9 0-2.9-2.3-2.9-4.9V6.2h5.8v4.1c0 2.6-1 4.9-2.9 4.9z" fill="currentColor"/><path d="M5.6 6.2L4 1.2h8l-1.6 5z" fill="currentColor" opacity=".55"/><path d="M5.1 8.4h5.8" stroke="#05070a" stroke-width="1"/>'],
    blackhole: ['Black hole', 'Swallows all that comes near',
      'Pulls everything in, tears solids apart and swallows them.',
      '#b06cff', '<ellipse cx="8" cy="8" rx="7" ry="2.6" fill="none" stroke="currentColor" stroke-width="1.3" transform="rotate(-18 8 8)"/><circle cx="8" cy="8" r="3.4" fill="#05070a" stroke="currentColor" stroke-width="1.2"/>'],
  };
  const WEAPON_GROUPS = [
    ['Natural disasters', ['tsunami', 'quake', 'tornado', 'volcano', 'meteor', 'storm', 'solar', 'freeze', 'acidrain']],
    ['Doomsday', ['nuke', 'hbomb', 'blackhole']],
  ];
  const weaponButtons = {}, weaponGroups = [];
  function buildWeapons() {
    const root = $('#weapons');
    root.innerHTML = '';
    root.append(buildMagnitude());
    weaponGroups.length = 0;
    for (const [group, names] of WEAPON_GROUPS) {
      const label = document.createElement('div');
      label.className = 'group-label';
      label.textContent = group;
      const grid = document.createElement('div');
      grid.className = 'weapons';
      for (const name of names) {
        const [title, line, , color, icon] = WEAPON_INFO[name];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'weapon';
        b.style.setProperty('--wc', color);
        b.innerHTML = `<svg viewBox="0 0 16 16" width="24" height="24" aria-hidden="true">${icon}</svg><b>${title}</b><small>${line}</small>`;
        b.title = `${title}: ${line}`;
        b.addEventListener('click', () => select({ kind: 'weapon', name }));
        weaponButtons[name] = b;
        grid.append(b);
      }
      root.append(label, grid);
      weaponGroups.push({ label, grid, names });
    }
    const more = document.createElement('p');
    more.className = 'weapons-more';
    more.id = 'weapons-more';
    root.append(more);
  }

  // ───── earthquake magnitude ─────
  // The magnitude (as the news gives it) decides everything an earthquake does; sim.js works out
  // the shaking from it. This box sets it and says, in plain words, what that magnitude does.
  const MAG_MIN = 2, MAG_MAX = 9.5;
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const MERCALLI = ['not felt', 'weak', 'weak', 'light', 'moderate', 'strong', 'very strong', 'severe', 'violent', 'extreme', 'extreme', 'extreme'];
  const magClass = (m) => (m < 3 ? 'micro' : m < 4 ? 'minor' : m < 5 ? 'light' : m < 6 ? 'moderate' : m < 7 ? 'strong' : m < 8 ? 'major' : 'great');
  // The worst that shaking of intensity I at the epicentre does (sim.js has the same thresholds,
  // taken from what each material does in real earthquakes).
  function quakeWorst(I) {
    return I < 3.5 ? 'Barely felt.'
      : I <= 4.5 ? 'Sand trickles, ponds ripple.'
      : I <= 6 ? 'Glass and ice crack.'
      : I <= 7 ? 'Brick cracks, cliffs shed rock.'
      : I <= 8.5 ? 'Walls fall, the ground ruptures.'
      : I <= 9.5 ? 'Rock breaks up, wet ground liquefies.'
      : I <= 11 ? 'Timber gives way too.'
      : 'Steel snaps. Only diamond holds.';
  }
  function quakeDesc(m) {
    const q = game.world.quakeInfo(m), I = q.intensity, k = Math.max(0, Math.min(11, Math.round(I) - 1));
    return `Shakes ${Math.max(1, Math.round(q.seconds))} s at intensity ${ROMAN[k]} (${MERCALLI[k]}). ${quakeWorst(I)}`;
  }
  function buildMagnitude() {
    const box = document.createElement('div');
    box.className = 'magnitude';
    box.id = 'magnitude';
    box.hidden = true;
    box.innerHTML = `<label for="mag-range">Magnitude</label>
      <input id="mag-range" type="range" min="${MAG_MIN}" max="${MAG_MAX}" step="0.1">
      <input id="mag-num" type="number" min="${MAG_MIN}" max="${MAG_MAX}" step="0.1" aria-label="Magnitude" inputmode="decimal">
      <div class="mag-note" id="mag-note"></div>`;
    const range = box.querySelector('#mag-range'), num = box.querySelector('#mag-num');
    // a box left empty or holding something that isn't a number keeps the magnitude it had
    const typed = () => setMagnitude(parseFloat(num.value));
    range.addEventListener('input', () => setMagnitude(+range.value));
    num.addEventListener('change', typed);
    num.addEventListener('keydown', (e) => { if (e.key === 'Enter') typed(); });
    return box;
  }
  function setMagnitude(m) {
    if (!Number.isFinite(m)) m = game.magnitude;
    m = Math.round(Math.max(MAG_MIN, Math.min(MAG_MAX, m)) * 10) / 10;
    game.magnitude = m;
    store.set('magnitude', m);
    $('#mag-range').value = m;
    $('#mag-num').value = m.toFixed(1);
    const I = game.world.quakeInfo(m).intensity, k = Math.max(0, Math.min(11, Math.round(I) - 1));
    $('#mag-note').innerHTML = `<b>${magClass(m)}</b> · intensity ${ROMAN[k]} at the epicentre`;
    renderInspect();
  }

  // ───── machine settings ─────
  // How newly painted machines are set: which way a piston or a pump faces, and what a sensor senses
  // (touch, or hotter or colder than a temperature). Shown in the tools while one is selected.
  const DIRS = [['↑', 'Up'], ['→', 'Right'], ['↓', 'Down'], ['←', 'Left']];
  const SENSES = [['Touch', 'anything loose landing on it'], ['Hotter than', ''], ['Colder than', '']];
  function buildMachineBox() {
    const box = $('#machine-set');
    box.innerHTML = `<div class="ms-row ms-dir"><span class="ms-lbl">Faces</span><div class="ms-btns" role="radiogroup" aria-label="Which way it faces">${
      DIRS.map(([g, n], k) => `<button type="button" role="radio" data-dir="${k}" title="${n}" aria-label="${n}">${g}</button>`).join('')}</div>
      <button type="button" class="ms-toggle" id="ms-sticky" aria-pressed="false" title="A sticky piston pulls back what it pushed">Sticky</button></div>
      <div class="ms-row ms-sense"><span class="ms-lbl">Senses</span><select id="ms-mode" aria-label="What it senses">${
      SENSES.map(([n], k) => `<option value="${k}">${n}</option>`).join('')}</select>
      <input id="ms-temp" type="number" step="10" aria-label="Temperature, °C" inputmode="numeric"><span class="ms-unit">°C</span></div>
      <div class="ms-note" id="ms-note"></div>`;
    box.querySelectorAll('[data-dir]').forEach((b) => b.addEventListener('click', () => { AudioFX.click(); setMachine({ dir: +b.dataset.dir }); }));
    $('#ms-sticky').addEventListener('click', () => { AudioFX.click(); setMachine({ sticky: !game.machine.sticky }); });
    $('#ms-mode').addEventListener('change', (e) => setMachine({ mode: +e.target.value }));
    const temp = $('#ms-temp'), typed = () => { const v = parseFloat(temp.value); setMachine({ set: Number.isFinite(v) ? Math.max(-273, Math.min(9000, Math.round(v))) : game.machine.set }); };
    temp.addEventListener('change', typed);
    temp.addEventListener('keydown', (e) => { if (e.key === 'Enter') typed(); });
  }
  function setMachine(o) {
    Object.assign(game.machine, o);
    store.set('machine', game.machine);
    paintMachineBox();
  }
  function paintMachineBox() {
    const box = $('#machine-set');
    const t = game.selected.kind === 'element' ? game.selected.t : -1;
    const k = t === ID.PISTON || t === ID.PUMP || t === ID.THRUSTER ? 'dir' : t === ID.SENSOR ? 'sense' : t === ID.SWITCH ? 'switch' : '';
    box.hidden = !k;
    if (!k) return;
    const m = game.machine;
    box.querySelector('.ms-dir').hidden = k !== 'dir';
    box.querySelector('.ms-sense').hidden = k !== 'sense';
    box.querySelectorAll('[data-dir]').forEach((b) => b.setAttribute('aria-checked', +b.dataset.dir === m.dir));
    $('#ms-sticky').hidden = t !== ID.PISTON;
    $('#ms-sticky').setAttribute('aria-pressed', !!m.sticky);
    $('#ms-mode').value = m.mode;
    $('#ms-temp').value = m.set;
    $('#ms-temp').hidden = box.querySelector('.ms-unit').hidden = m.mode === 0;
    $('#ms-note').textContent = k === 'dir' ? (t === ID.PISTON ? (m.sticky ? `New pistons push ${DIRS[m.dir][1].toLowerCase()}, and are sticky: they pull back what they pushed.` : `New pistons push ${DIRS[m.dir][1].toLowerCase()}.`)
      : t === ID.THRUSTER ? `New thrusters push their ship ${DIRS[m.dir][1].toLowerCase()}, firing out of the ${['bottom', 'left side', 'top', 'right side'][m.dir]}.`
        : `New pumps push ${DIRS[m.dir][1].toLowerCase()}, drawing in from the other sides.`)
      : k === 'sense' ? (m.mode === 0 ? 'New sensors fire while anything loose rests against them: a heap, a pool, a creature (not a drop falling past).'
        : `New sensors fire while what touches them is ${m.mode === 1 ? 'hotter' : 'colder'} than ${m.set}°C.`)
        : 'New switches start on. Click a switch to flip it, and every switch joined to it.';
  }

  // `at`: the button it was picked from, for a hint box beside it
  function select(sel, at) {
    // in a story chapter only what is in the pouch can be picked up
    if (G.Journey && G.Journey.active && !G.Journey.allows(sel)) {
      note('Not in your pouch', 'This chapter can only be solved with what you carry.');
      return;
    }
    if (sel.kind === 'weapon' && !G.Unlocks.has('weapon', sel.name)) {
      note('Not earned yet', `${G.Unlocks.line('weapon', sel.name)}.`);
      return;
    }
    if (sel.kind === 'weapon') clearNew(`weapon:${sel.name}`);
    if (sel.kind === 'element') {
      if (!unlocked(sel.t)) {
        const d = list[sel.t];
        if (d.periodic) note(`${d.name} is locked`, Lab.ready(d.id) ? 'Identify it in the Lab to use it.' : 'Unlock an element beside it on the table first.');
        else elementHint(sel.t, at); // a locked tile shows how to get it, straight away
        return;
      }
      fresh.delete(sel.t);
    }
    game.selected = sel;
    AudioFX.click();
    refreshTable();
  }

  function renderInspect() {
    const el = $('#inspect');
    const sel = game.selected;
    if (sel.kind === 'tool') {
      const [n, desc] = TOOL_INFO[sel.name];
      el.innerHTML = `<div class="title"><strong>${n}</strong><span class="meta">tool</span></div><div>${desc}</div>`;
    } else if (sel.kind === 'weapon') {
      const [n, , desc] = WEAPON_INFO[sel.name], quake = sel.name === 'quake';
      const meta = quake ? 'magnitude' : sel.name === 'hbomb' ? 'drops from above' : 'brush sets size';
      el.innerHTML = `<div class="title"><strong>${n}</strong><span class="meta">weapon · ${meta}</span></div><div>${quake ? quakeDesc(game.magnitude) : desc}</div>`;
    } else {
      const d = list[sel.t];
      const meta = d.periodic ? `${d.sym} · ${d.z} · ${d.family.toLowerCase()}` : `${SYM[d.key]} · ${d.group.toLowerCase()}`;
      el.innerHTML = `<div class="title"><strong></strong><span class="meta"></span></div><div></div>`;
      el.querySelector('strong').textContent = d.name;
      el.querySelector('.meta').textContent = meta;
      el.lastChild.textContent = d.desc;
      if (d.periodic) { // what the Lab taught about it
        const f = Lab.fact(d), story = document.createElement('div');
        story.className = 'story';
        story.textContent = `${G.LabView.discoveredLine(d)}. Its name: ${f[2]}.`;
        el.append(story);
        if (Lab.has(d.id)) el.append(tryLine(d));
      }
      const tint = Tints.kindOf(d.id) && Tints.chosen(Tints.kindOf(d.id));
      const line = (text, done) => { const l = document.createElement('div'); l.className = done ? 'try done' : 'try'; l.textContent = text; el.append(l); };
      if (tint) line(`Painting in ${tint.name}, from ${tint.d.name.toLowerCase()}.`, true); // glass, fire or an explosion in a colour
      if (d.key === 'concrete' && paints.concrete && colourOpen('concrete')) line(`Laying it in ${paints.concrete}.`, true);
      if (d.key === 'paint') line(paints.paint ? `Painting in ${paints.paint}.` : 'Washing paint off.', true);
      if (d.key === 'image') line(picture ? `Picture: ${picture.name}. Click the map to build it; click the tile for another.` : 'Click the Image tile to choose a picture.', !!picture);
    }
  }

  // Try it: the element's experiment, done (a star) or still to do, and anything it needs
  function tryLine(d) {
    const line = document.createElement('div'), done = TryIt.has(d.id);
    line.className = `try${done ? ' done' : ''}`;
    const missing = TryIt.needs(d.id).filter((t) => !unlocked(t)).map((t) => list[t].name.toLowerCase());
    line.textContent = `${done ? '★ Done' : '☆ Try it'}: ${TryIt.text(d.id)}${!done && missing.length ? ` (needs ${missing.join(' and ')})` : ''}.`;
    const p = TryIt.progress(d.id); // a pile to build or a wait to hold: how far along it is
    if (p) {
      const bits = [];
      if (p.pile) bits.push(`${p.pile.name}: ${p.pile.have} of ${p.pile.need} grains`);
      if (p.hold) bits.push(`held ${Math.min(p.hold.secs, p.hold.need)} of ${p.hold.need} s`);
      const span = document.createElement('span');
      span.className = 'progress';
      span.textContent = ` ${bits.join(' · ')}`;
      line.append(span);
    }
    return line;
  }

  // ───── the periodic table tab ─────
  const pcells = new Map();
  function buildPeriodic() {
    const grid = $('#pgrid');
    grid.innerHTML = '';
    for (const d of ELEM.periodic) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `pcell fam-${d.fam}`;
      const [row, col] = d.pos;
      b.style.gridRow = row >= 9 ? row : row; // rows 9–10 sit below a spacer row (8)
      b.style.gridColumn = col;
      b.style.setProperty('--swatch', d.colors[0]);
      b.innerHTML = `<i>${d.z}</i>${d.sym}`;
      // a locked element ready to research opens the Lab
      b.addEventListener('click', () => (!unlocked(d.id) && Lab.ready(d.id) ? G.LabView.open() : select({ kind: 'element', t: d.id })));
      pcells.set(d.id, b);
      grid.append(b);
    }
    const gap = document.createElement('div');
    gap.className = 'pgap';
    gap.style.gridRow = 8;
    grid.append(gap);
    const legend = $('#plegend');
    legend.innerHTML = '';
    for (const [k, v] of Object.entries(ELEM.FAMILY)) {
      const s = document.createElement('span');
      s.className = `fam-${k}`;
      s.textContent = v;
      legend.append(s);
    }
  }

  function paintPeriodic() {
    if (!pcells.size) return; // the alchemy table is built first
    for (const d of ELEM.periodic) {
      const b = pcells.get(d.id), open = unlocked(d.id), ready = !open && Lab.ready(d.id);
      b.classList.toggle('locked', !open);
      b.classList.toggle('ready', ready);
      b.classList.toggle('on', game.selected.kind === 'element' && game.selected.t === d.id);
      // Try it: a star once its experiment is done, a faint one while it waits
      const tried = Lab.has(d.id) && TryIt.has(d.id);
      b.classList.toggle('tried', tried);
      b.classList.toggle('trying', Lab.has(d.id) && !tried);
      b.title = open ? `${d.name} — ${d.desc}${Lab.has(d.id) ? `
${tried ? '★ Done' : 'Try it'}: ${TryIt.text(d.id)}` : ''}`
        : ready ? `${d.name} — ready to research: identify it in the Lab` : `${d.name} — locked: unlock an element beside it first`;
      b.setAttribute('aria-label', `${d.name}, ${d.z}${open ? '' : ready ? ', ready to research' : ', locked'}`);
    }
    const ready = Lab.readyList().length;
    const stars = TryIt.count();
    const book = $('#btn-groups'), shut = !groupsOpen();
    book.classList.toggle('locked', shut);
    book.title = shut ? `Element Groups: opens once every element has its Try it star (★ ${stars} of ${ELEM.periodic.length})`
      : 'Element Groups: every element sorted by what it does';
    $('#plab-text').innerHTML = `<b>${Lab.count()}</b> of ${ELEM.periodic.length} unlocked${ready ? ` · <b>${ready}</b> ready to research` : ''}`
      + `${stars ? ` · <span class="stars">★ ${stars}</span>` : ''}${game.sandbox ? ' · sandbox mode opens them all' : ''}`;
  }

  const TABS = { alchemy: '#table', periodic: '#ptable', weapons: '#weapons' };
  function showTab(which) {
    if (!TABS[which] || (which === 'weapons' && !G.Unlocks.has('weapons'))) which = 'alchemy';
    closePop();
    if (which === 'weapons') clearNew('weapons');
    for (const [k, panel] of Object.entries(TABS)) {
      $(`#tab-${k}`).setAttribute('aria-selected', k === which);
      $(panel).hidden = k !== which;
    }
    $('#panel').classList.toggle('wide', which === 'periodic');
    store.set('tab', which);
  }

  // ───── toasts ─────
  // A toast about an element shows its swatch; one about anything else shows what kind of thing it
  // is: a scene, a sky, a weapon (its own icon), an achievement, a colour, the Journey…
  const TROPHY_PATH = '<path d="M4.5 2h7v3.6a3.5 3.5 0 01-7 0z" fill="currentColor"/><path d="M4.5 3.4H2.3c0 2 .9 3.2 2.6 3.4M11.5 3.4h2.2c0 2-.9 3.2-2.6 3.4" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 9v2.6M5.3 14h5.4" fill="none" stroke="currentColor" stroke-width="1.3"/>';
  const TOAST_ICONS = {
    scene: ['#9fd18b', '<path d="M.8 13.5l4.6-7.2 3 4.1 2-2.6 4.8 5.7z" fill="currentColor"/><circle cx="11.6" cy="3.8" r="1.7" fill="currentColor"/>'],
    dusk: ['#f2a65a', '<path d="M3.6 10.5a4.4 4.4 0 018.8 0z" fill="currentColor"/><path d="M1.5 12.5h13M3 14.5h10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>'],
    night: ['#c9d4ff', '<path d="M10.2 1.8a6 6 0 104.4 9.4 5 5 0 01-4.4-9.4z" fill="currentColor"/>'],
    weapons: ['#ff7a52', '<path d="M8 1l1.6 3.9 3.9-1.5-1.5 3.9L16 8.9l-4 1.3 1.5 3.9-3.9-1.5L8 16l-1.6-3.4-3.9 1.5L4 10.2 0 8.9l4-1.6-1.5-3.9 3.9 1.5z" fill="currentColor"/>'],
    trophy: ['#d6a84f', TROPHY_PATH],
    secret: ['#b98cff', TROPHY_PATH],
    table: ['#d6a84f', '<path d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z" fill="currentColor"/>'],
    book: ['#d6a84f', '<path d="M8 3.6C6.5 2.6 4.4 2.2 1.8 2.4v10.2c2.6-.2 4.7.2 6.2 1.2 1.5-1 3.6-1.4 6.2-1.2V2.4c-2.6-.2-4.7.2-6.2 1.2z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M8 3.6v10.2" stroke="currentColor" stroke-width="1.3"/>'],
    journey: ['#e8c47a', '<circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10.6 5.4L9 9 5.4 10.6 7 7z" fill="currentColor"/>'],
  };
  function toastIcon(icon) {
    const [color, svg] = Array.isArray(icon) ? icon : TOAST_ICONS[icon] || TOAST_ICONS.trophy;
    const s = document.createElement('span');
    s.className = 't-icon';
    s.style.color = color;
    s.innerHTML = `<svg viewBox="0 0 16 16" width="26" height="26" aria-hidden="true">${svg}</svg>`;
    return s;
  }
  function toast({ eyebrow, name, how, t, icon, note: isNote, ms = 4200 }) {
    const box = $('#toasts');
    while (box.children.length >= 3) box.firstChild.remove();
    const el = document.createElement('div');
    el.className = 'toast' + (isNote ? ' note' : '');
    if (t != null) el.append(cloneCanvas(swatchFor(t, 22, 22)));
    else if (icon) el.append(toastIcon(icon));
    const txt = document.createElement('div');
    txt.innerHTML = `<div class="eyebrow"></div><div class="name"></div><div class="how"></div>`;
    txt.querySelector('.eyebrow').textContent = eyebrow;
    txt.querySelector('.name').textContent = name;
    txt.querySelector('.how').textContent = how || '';
    const x = Object.assign(document.createElement('button'), { type: 'button', className: 't-close', textContent: '×' });
    x.setAttribute('aria-label', 'Dismiss');
    let gone = false;
    const dismiss = () => { if (gone) return; gone = true; el.classList.add('out'); setTimeout(() => el.remove(), 400); };
    x.addEventListener('click', dismiss);
    el.append(txt, x);
    box.append(el);
    setTimeout(dismiss, ms);
  }
  const note = (name, how) => toast({ eyebrow: 'Note', name, how, note: true, ms: 3000 });

  // ───── discoveries arriving from the simulation ─────
  function onFound(t, x, y) {
    if (list[t].periodic) { foundInWild(t, x, y); return; }
    if (known[t] || list[t].hidden || list[t].special) return;
    known[t] = 1;
    fresh.add(t);
    saveKnown();
    const d = list[t];
    const color = `rgb(${d.rgb[0].join(',')})`;
    game.renderer.ring(x, y, color);
    AudioFX.discovery();
    toast({ eyebrow: 'New element', name: d.name, how: d.recipe, t, ms: 5200 });
    flyToTile(t, x, y);
    // the same element may appear in other worlds (after a load) — keep them in sync
    game.world.disc[t] = 1;

    specialsReached((s) => s.unlockAt === totalKnown()); // Clone at 40 found, Void at 70
    if (LIFE.includes(d) && lifeFound() === LIFE.length) {
      setTimeout(() => {
        AudioFX.unlock();
        toast({ eyebrow: 'Scene unlocked', name: 'A new Island', icon: 'scene', how: 'Every plant and creature found: the Island in Scenes is now a tropical one, with palm beaches, a jungle, a coral reef and a hut on stilts.', ms: 8000 });
      }, 2000);
    }
    if (totalKnown() === tableTotal) {
      setTimeout(() => {
        AudioFX.unlock();
        toast({ eyebrow: 'Complete', name: 'The table is full', icon: 'table', how: `All ${tableTotal} elements found. The lab is yours.`, ms: 9000 });
      }, 2600);
    }
    refreshTable();
    announce(G.Unlocks.check());
    achieved(G.Achieve.check());
  }

  // ───── what is earned (unlocks.js): the Journey, the Weapons tab, scenes, skies, weapons, parts ─────
  const SCENE_NAMES = {
    canyon: 'Canyon', volcano: 'Volcano', forest: 'Forest', caves: 'Caves', workshop: 'Workshop', village: 'Village',
    machines: 'Waterworks', electrics: 'Electric workshop', magnets: 'Magnet lab', reactor: 'Nuclear plant', city: 'City', empty: 'Empty bench',
  };
  // newly opened things, one toast each, a moment apart, and a yellow dot on where to find them. A
  // machine part arrives like a discovery, at once, from where the battery touched.
  function announce(opened) {
    if (!opened || !opened.length) return;
    paintUnlocks();
    let k = 0;
    for (const [kind, name, x, y] of opened) {
      if (kind === 'part') { partFound(ELEM.byKey[name], x, y); continue; }
      if (kind === 'journey') markNew('journey');
      if (kind === 'weapons') markNew('weapons');
      if (kind === 'scene') markNew('scenes', `scene:${name}`);
      if (kind === 'sky') markNew('map', `sky:${name}`);
      if (kind === 'weapon') markNew('weapons', `weapon:${name}`);
      setTimeout(() => {
        AudioFX.unlock();
        const say = {
          journey: ['Unlocked', 'The Apprentice’s Journey', 'Your master has gone, and left you a letter. Open it with the Journey button.', 'journey'],
          weapons: ['Unlocked', 'Weapons', 'A tab of disasters. Each one is earned: with the Weapons tab open, Hint says how.', 'weapons'],
          scene: ['New scene', SCENE_NAMES[name], 'Open it from Scenes.', 'scene'],
          sky: ['New sky', name === 'dusk' ? 'Dusk' : 'Night', 'Choose it from Map → Sky.', name === 'dusk' ? 'dusk' : 'night'],
          weapon: ['New weapon', name && WEAPON_INFO[name] ? WEAPON_INFO[name][0] : '',
            G.Unlocks.has('weapons') ? 'In the Weapons tab.' : `It is yours once the Weapons tab opens, at ${G.Unlocks.WEAPONS_AT} elements found.`,
            WEAPON_INFO[name] ? [WEAPON_INFO[name][3], WEAPON_INFO[name][4]] : 'weapons'],
        }[kind];
        toast({ eyebrow: say[0], name: say[1], how: say[2], icon: say[3], ms: 6500 });
        refreshTable();
        if (G.UI.onUnlock) G.UI.onUnlock();
      }, 1400 + k++ * 1000);
    }
  }
  function partFound(d, x, y) {
    fresh.add(d.id);
    if (x != null) game.renderer.ring(x, y, `rgb(${d.rgb[0].join(',')})`);
    AudioFX.discovery();
    toast({ eyebrow: 'New machine part', name: d.name, how: `A battery touched ${partnerName(d).toLowerCase()}. ${d.desc.split('. ')[0].replace(/\.$/, '')}.`, t: d.id, ms: 6500 });
    if (x != null) flyToTile(d.id, x, y);
    refreshTable();
  }
  // ───── the yellow dot: something new is waiting behind this button ─────
  // A key for each place a dot can show: a button, or a row in a menu. Opening it clears the dot.
  const NEWS_AT = {
    journey: '#btn-journey', scenes: '#btn-scenes', map: '#btn-world', weapons: '#tab-weapons',
    trophy: '#btn-achieve', lab: '#tab-periodic, #btn-plab',
  };
  const news = new Set();
  const newsTarget = (k) => {
    const [kind, name] = k.split(':');
    if (kind === 'scene') return `[data-scene="${name}"]`;
    if (kind === 'sky') return `[data-sky="${name}"]`;
    return NEWS_AT[k] || '';
  };
  function paintNews() {
    document.querySelectorAll('.has-new').forEach((b) => { if (b.id !== 'tb-prev' && b.id !== 'tb-next') b.classList.remove('has-new'); });
    for (const k of news) {
      if (k.startsWith('weapon:')) { const b = weaponButtons[k.slice(7)]; if (b) b.classList.add('has-new'); continue; }
      const sel = newsTarget(k);
      if (sel) document.querySelectorAll(sel).forEach((b) => b.classList.add('has-new'));
    }
    // a phone keeps Journey, the trophy and the rest in a tray behind ‹: the dot shows there too
    const more = $('#btn-more'), tray = $('#brand-tray');
    if (more && tray) more.classList.toggle('has-new', !!tray.querySelector('.has-new'));
    if (G.UI.onNews) G.UI.onNews();
  }
  function markNew(...keys) {
    if (game.sandbox) return;
    for (const k of keys) news.add(k);
    store.set('news', [...news]);
    paintNews();
  }
  function clearNew(k) {
    if (!news.delete(k)) return;
    store.set('news', [...news]);
    paintNews();
  }
  // Locked things stay out of sight: the Weapons tab and each weapon, the Journey's buttons
  function paintUnlocks() {
    const U = G.Unlocks;
    const tabOpen = U.has('weapons');
    $('#tab-weapons').hidden = !tabOpen;
    if (!tabOpen && !$('#weapons').hidden) showTab('alchemy');
    let shut = 0;
    for (const [name, b] of Object.entries(weaponButtons)) { b.hidden = !U.has('weapon', name); if (b.hidden) shut++; }
    for (const g of weaponGroups) g.label.hidden = g.grid.hidden = g.names.every((n) => !U.has('weapon', n));
    const more = $('#weapons-more');
    if (more) {
      more.hidden = !shut;
      more.textContent = shut === U.weapons.length ? `${shut} to earn.` : `${shut} more to earn.`;
    }
    $('#btn-journey').hidden = !U.has('journey');
  }

  // ───── hints: a box with the answer in it ─────
  // Alchemy: a recipe you can make now (Ash + Salt → Gunpowder). With the Weapons tab open: how to
  // earn the next weapon you haven't got. From the Scenes menu: how to find the next scene.
  let pop = null, floodShown = false;
  function chip(t, label) {
    const c = document.createElement('span');
    c.className = 'hp-chip';
    if (t != null) c.append(cloneCanvas(swatchFor(t, 18, 18)));
    c.append(Object.assign(document.createElement('span'), { textContent: label || list[t].name }));
    return c;
  }
  // an ingredient: dashed while you still have to find it
  function need(t) {
    const c = chip(t);
    if (!unlocked(t)) { c.classList.add('missing'); c.title = 'Not found yet'; }
    return c;
  }
  function closePop() {
    if (!pop) return;
    pop.remove(); pop = null; floodShown = false;
    removeEventListener('pointerdown', popOutside, true);
  }
  function popOutside(e) { if (pop && !pop.contains(e.target) && !e.target.closest('#btn-hint, .scene-more')) closePop(); }
  function hintPop({ eyebrow, title, icon, swatch, color, recipe, line, prog, foot, near: at }) {
    closePop();
    const box = document.createElement('div');
    box.className = 'hint-pop';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', title || eyebrow);
    const head = document.createElement('div');
    head.className = 'hp-head';
    head.append(Object.assign(document.createElement('span'), { className: 'hp-eyebrow', textContent: eyebrow }));
    const x = Object.assign(document.createElement('button'), { className: 'hp-close', type: 'button', textContent: '×' });
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', closePop);
    head.append(x);
    box.append(head);
    if (title) {
      const t = document.createElement('div');
      t.className = 'hp-title';
      if (icon) { const i = document.createElement('span'); i.className = 'hp-icon'; i.style.color = color || ''; i.innerHTML = `<svg viewBox="0 0 16 16" width="22" height="22" aria-hidden="true">${icon}</svg>`; t.append(i); }
      if (swatch != null) t.append(cloneCanvas(swatchFor(swatch, 22, 22)));
      t.append(Object.assign(document.createElement('b'), { textContent: title }));
      box.append(t);
    }
    if (recipe) {
      const r = document.createElement('div');
      r.className = 'hp-recipe';
      recipe.ins.forEach((c, k) => { if (k) r.append(Object.assign(document.createElement('span'), { className: 'hp-op', textContent: '+' })); r.append(c); });
      r.append(Object.assign(document.createElement('span'), { className: 'hp-op', textContent: '→' }), recipe.out);
      box.append(r);
    }
    if (line) box.append(Object.assign(document.createElement('p'), { textContent: line }));
    if (prog) {
      const bar = document.createElement('div');
      bar.className = 'hp-bar';
      const f = Math.max(0, Math.min(1, prog[0] / prog[1]));
      bar.append(Object.assign(document.createElement('i'), { style: `width:${Math.round(f * 100)}%` }));
      box.append(bar, Object.assign(document.createElement('small'), { className: 'hp-prog', textContent: prog[2] || `${Math.round(prog[0]).toLocaleString()} of ${prog[1].toLocaleString()}` }));
    }
    if (foot) box.append(Object.assign(document.createElement('small'), { className: 'hp-foot', textContent: foot }));
    document.body.append(box);
    pop = box;
    const a = (at || $('#btn-hint')).getBoundingClientRect(), bw = box.offsetWidth, bh = box.offsetHeight;
    let top = a.top - bh - 10;
    if (top < 8) top = a.bottom + 10;
    top = Math.max(8, Math.min(innerHeight - bh - 8, top)); // on screen, whatever it is beside
    const left = Math.max(8, Math.min(innerWidth - bw - 8, a.right - bw));
    Object.assign(box.style, { left: `${left}px`, top: `${top}px` });
    setTimeout(() => addEventListener('pointerdown', popOutside, true));
  }
  // Hint picks at random from what is left, never the same one twice running
  const pickOne = (a, last) => { const b = a.length > 1 ? a.filter((x) => x !== last) : a; return b[(Math.random() * b.length) | 0]; };
  const MADE_IN_SCENE = new Set(['quake', 'freeze']);
  let weaponTurn = null, sceneTurn = null, alchemyTurn = null;
  function weaponHint() {
    const U = G.Unlocks, left = U.weapons.filter((n) => !U.has('weapon', n));
    if (!left.length) { closePop(); note('Every weapon is yours', 'There is nothing left to earn here.'); return; }
    const name = weaponTurn = pickOne(left, weaponTurn);
    const [title, , , color, icon] = WEAPON_INFO[name];
    const p = U.progress('weapon', name, game.world);
    hintPop({
      eyebrow: 'To earn a weapon', title, icon, color, line: `${U.line('weapon', name)}.`,
      prog: p && (name === 'tsunami' ? [p[0], p[1], `${Math.round((p[0] / p[1]) * 100)}% of the way across`]
        : MADE_IN_SCENE.has(name) ? [p[0], p[1], `${Math.round(p[0]).toLocaleString()} of ${p[1].toLocaleString()} made in this scene`] : p),
      foot: name === 'tsunami' ? 'The dashed line is on the map now. Press Hint again for another weapon.'
        : MADE_IN_SCENE.has(name) ? 'A new scene starts the count again. Press Hint again for another weapon.' : 'Press Hint again for another weapon.',
    });
    floodShown = name === 'tsunami';
  }
  function sceneHint(at) {
    const U = G.Unlocks, left = U.scenes.filter((n) => !U.has('scene', n));
    if (!left.length) { closePop(); note('Every scene is yours', 'There are no more to find.'); return; }
    const name = sceneTurn = pickOne(left, sceneTurn);
    const p = U.progress('scene', name, game.world);
    hintPop({
      eyebrow: 'To find a scene', title: SCENE_NAMES[name], line: `${U.line('scene', name)}.`,
      prog: p && p[1] > 1 ? p : null, foot: 'Click again for another scene.', near: at,
    });
  }
  // alchemy: something to make or open, at random from all there is: what is within reach, the
  // machine parts once you have a battery, and the special tools still locked
  function alchemyHint() {
    const parts = known[ID.BATTERY] ? tableOrder.filter((d) => d.special && d.needs && !unlocked(d.id)) : [];
    const all = tableOrder.filter((d) => near(d.id)).concat(parts, SPECIALS.filter((d) => !unlocked(d.id)));
    if (!all.length) {
      if (totalKnown() === tableTotal) note('Nothing left to find', 'Every element is on your table.');
      else note('Nothing within reach', 'Every remaining element needs one you have not found yet.');
      return;
    }
    const d = alchemyTurn = pickOne(all, alchemyTurn);
    elementHint(d.id, null, all.length > 1 ? 'Press Hint again for another.' : '');
  }
  const sentence = (s) => (/[.!?]$/.test(s) ? s : `${s}.`);
  // The straight answer for one element: what goes in and what comes out (or what opens it), with
  // anything still to find dashed. Clicking a locked tile shows it; so does Hint.
  function elementHint(t, at, foot = '') {
    const d = list[t];
    if (d.special && !d.needs) { // Clone, Void, Paint, Image
      hintPop({ eyebrow: 'To unlock', title: d.name, swatch: t, line: `${opensWhen(d)}.`, prog: specialProgress(d), foot, near: at });
      return;
    }
    const ins = d.special ? [ID.BATTERY, ELEM.byKey[G.Unlocks.partner(d.key)].id] : d.castOf !== undefined ? [d.castOf] : d.fromIds;
    const missing = ins.filter((f) => !unlocked(f));
    const still = missing.map((f) => (list[f].periodic ? `${list[f].name.toLowerCase()} (from the Lab)` : list[f].name.toLowerCase()));
    hintPop({
      eyebrow: missing.length ? 'How to make it' : 'Within reach',
      recipe: ins.length ? { ins: ins.map(need), out: chip(t) } : null,
      title: ins.length ? null : d.name, swatch: ins.length ? null : t,
      line: d.special ? `${opensWhen(d)}.` : sentence(d.recipe),
      foot: [missing.length ? `Still to find: ${still.join(', ')}.` : '', foot].filter(Boolean).join(' '), near: at,
    });
  }

  // Try it: an element's experiment done in the world
  function tried(t, x, y) {
    const d = list[t];
    game.renderer.ring(x, y, '#d6a84f');
    AudioFX.unlock();
    toast({ eyebrow: `Experiment done ★ ${TryIt.count()}`, name: d.name, how: `${TryIt.text(t)}.`, t, ms: 6500 });
    specialsReached((s) => s.unlockStars === TryIt.count()); // Paint at 50 stars, Image at 80
    achieved(G.Achieve.check());
    if (groupsOpen()) { // the last star: the book opens
      setTimeout(() => {
        AudioFX.unlock();
        markNew('lab');
        toast({ eyebrow: 'Unlocked', name: 'Element Groups', icon: 'book', how: 'Every element has its star. Open the book beside the Lab button on the Periodic table tab.', ms: 9000 });
      }, 1800);
    }
    refreshTable();
  }

  // a special tool just opened (one find or one star at a time, so it opens on the very number)
  function specialsReached(test) {
    for (const s of SPECIALS) {
      if (game.sandbox || !test(s)) continue;
      setTimeout(() => {
        AudioFX.unlock();
        toast({ eyebrow: 'Unlocked', name: s.name, how: s.desc, t: s.id, ms: 6000 });
        fresh.add(s.id);
        refreshTable();
      }, 1400);
    }
  }

  // ───── achievements ─────
  // Earned ones arrive as a toast; the trophy button opens all of them, by section, with the big
  // ones (every element, every star, every chapter, every weapon) at the bottom.
  const TROPHY = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${TROPHY_PATH}</svg>`;
  function achieved(ids) {
    if (!ids || !ids.length) return;
    paintAchieveButton();
    markNew('trophy');
    ids.forEach((id, k) => setTimeout(() => {
      const a = G.Achieve.get(id);
      AudioFX.unlock();
      toast({ eyebrow: a.secret ? 'Secret achievement' : 'Achievement', name: a.title, how: `${a.line}.`, icon: a.secret ? 'secret' : 'trophy', ms: 6500 });
      if (!$('#achieve').hidden) renderAchievements();
    }, 900 + k * 1200));
  }
  function paintAchieveButton() {
    const b = $('#btn-achieve');
    if (b) b.title = `Achievements: ${G.Achieve.count()} of ${G.Achieve.total}`;
  }
  function renderAchievements() {
    const body = $('#achieve-body'), all = G.Achieve.list();
    body.innerHTML = '';
    $('#achieve-sum').textContent = `${G.Achieve.count()} of ${G.Achieve.total} earned${game.sandbox ? ' · none are earned in sandbox mode' : ''}`;
    for (const sec of G.Achieve.SECTIONS) {
      const items = all.filter((a) => a.sec === sec);
      const label = document.createElement('div');
      label.className = 'group-label';
      label.textContent = sec;
      label.append(Object.assign(document.createElement('span'), { className: 'codex-count', textContent: `${items.filter((a) => a.got).length} of ${items.length}` }));
      const grid = document.createElement('div');
      grid.className = 'ach-grid';
      for (const a of items) {
        const c = document.createElement('div');
        c.className = `ach${a.got ? ' got' : ''}${a.secret && !a.got ? ' secret' : ''}`;
        c.innerHTML = `<span class="ach-icon">${a.secret && !a.got ? '?' : TROPHY}</span><div class="ach-txt"><b></b><small></small></div>`;
        c.querySelector('b').textContent = a.title;
        c.querySelector('small').textContent = a.line;
        if (a.have && a.have[0] > 0) {
          const [have, want, say] = a.have, txt = c.querySelector('.ach-txt');
          const bar = document.createElement('div');
          bar.className = 'ach-bar';
          bar.append(Object.assign(document.createElement('i'), { style: `width:${Math.round(Math.min(1, have / want) * 100)}%` }));
          txt.append(bar, Object.assign(document.createElement('span'), { className: 'ach-prog', textContent: say || `${Math.floor(have).toLocaleString()} of ${want.toLocaleString()}` }));
        }
        grid.append(c);
      }
      body.append(label, grid);
    }
  }
  function openAchievements() {
    clearNew('trophy');
    AudioFX.click();
    renderAchievements();
    openModal('#achieve');
    $('#achieve-body').scrollTop = 0;
  }

  // ───── element groups ─────
  // A book of every element sorted by what it does (groups.js builds it), opened by the last Try it star.
  const groupsOpen = () => TryIt.count() >= ELEM.periodic.length;
  let groupsBuilt = false;
  function openGroups() {
    if (!groupsOpen()) {
      note('Element Groups is still locked', `It opens once every element has its Try it star. You have ${TryIt.count()} of ${ELEM.periodic.length}.`);
      return;
    }
    const body = $('#groups-body');
    if (!groupsBuilt) {
      body.innerHTML = G.Groups.html();
      body.addEventListener('click', (e) => {
        const go = e.target.closest('[data-goto]');
        if (go) { e.preventDefault(); body.querySelector(`#${go.dataset.goto}`).scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' }); return; }
        const el = e.target.closest('.g-el');
        if (el) { closeModal($('#groups')); select({ kind: 'element', t: +el.dataset.t }); } // pick it up
      });
      // the ^ in the corner, once you have scrolled a way down: back to the start
      const top = $('#groups-top');
      body.addEventListener('scroll', () => top.classList.toggle('show', body.scrollTop > 240), { passive: true });
      top.addEventListener('click', () => { AudioFX.click(); body.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' }); });
      groupsBuilt = true;
    }
    AudioFX.click();
    openModal('#groups');
  }

  // A locked periodic element the world made by itself (a decay, a fission, a fusion) unlocks.
  function foundInWild(t, x, y) {
    if (game.sandbox || !Lab.unlock(t)) return;
    const d = list[t];
    game.renderer.ring(x, y, d.colors[0]);
    AudioFX.discovery();
    toast({ eyebrow: 'Found in the wild', name: `${d.name}, element ${d.z}`, how: `Your world made it, so it joins your table. ${G.LabView.discoveredLine(d)}.`, t, ms: 7000 });
    markNew('lab');
    refreshTable();
  }

  function flyToTile(t, x, y) {
    const tile = tiles.get(t);
    if (!tile) return;
    const strike = () => { tile.classList.remove('strike'); void tile.offsetWidth; tile.classList.add('strike'); };
    const from = game.renderer.worldToClient(x + 0.5, y + 0.5);
    const to = tile.getBoundingClientRect();
    const visible = to.bottom > 0 && to.top < innerHeight && to.width > 0;
    if (reducedMotion || !visible || !tile.animate) { strike(); return; }
    const f = document.createElement('div');
    f.className = 'flyer';
    f.textContent = SYM[list[t].key];
    document.body.append(f);
    const dx = to.left + to.width / 2 - from.x, dy = to.top + to.height / 2 - from.y;
    const sx = 0, sy = 0;
    f.style.left = `${from.x - 28}px`;
    f.style.top = `${from.y - 30}px`;
    const anim = f.animate([
      { transform: `translate(${sx}px, ${sy}px) scale(0.2)`, opacity: 0 },
      { transform: `translate(${sx}px, ${sy - 40}px) scale(1.15)`, opacity: 1, offset: 0.28 },
      { transform: `translate(${dx}px, ${dy}px) scale(${to.width / 56})`, opacity: 0.9 },
    ], { duration: 1150, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'forwards' });
    anim.onfinish = () => { f.remove(); strike(); };
  }

  // ───── codex ─────
  let codexSel = null;
  // sorted into the table's own categories, each with how many of it you have found
  function openCodex() {
    const grid = $('#codex-grid');
    grid.innerHTML = '';
    for (const g of GROUPS) {
      const items = tableOrder.filter((d) => d.group === g);
      if (!items.length) continue;
      const label = document.createElement('div');
      label.className = 'group-label';
      label.textContent = g;
      const n = document.createElement('span');
      n.className = 'codex-count';
      n.textContent = `${items.filter((d) => known[d.id] || (d.special && unlocked(d.id))).length} of ${items.length}`;
      label.append(n);
      grid.append(label);
      for (const d of items) {
        const b = makeTile(d, { codex: true });
        paintTile(b, d, true);
        b.addEventListener('click', () => { codexSel = d.id; renderCodexDetail(); });
        grid.append(b);
      }
    }
    if (codexSel == null) codexSel = game.selected.kind === 'element' ? game.selected.t : ID.WATER;
    renderCodexDetail();
    openModal('#codex');
  }

  function fmtT(v) { return `${Math.round(v).toLocaleString()}°C`; }

  function renderCodexDetail() {
    const d = list[codexSel];
    const box = $('#codex-detail');
    const open = known[d.id] || (d.special && unlocked(d.id));
    box.innerHTML = '';
    if (!open) { // only a hint says how
      box.innerHTML = `<h3>Unknown</h3><div class="kind">${d.group}</div>
        <p>${near(d.id) ? 'Within reach: everything it needs is on your table.' : 'Not found yet.'}</p>`;
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'pill', textContent: 'Hint' });
      b.addEventListener('click', () => elementHint(d.id, b));
      box.append(b);
      return;
    }
    box.append(cloneCanvas(swatchFor(d.id, 60, 18)));
    const rows = [];
    rows.push(['Found by', d.starter ? 'Starter element' : d.special ? (d.needs ? `A battery touching ${partnerName(d).toLowerCase()}` : d.unlockStars ? `${d.unlockStars} Try it stars` : `${d.unlockAt} discoveries`) : d.recipe]);
    if (d.hi && d.hi[1] >= 0) rows.push(['Above', `${fmtT(d.hi[0])} → ${list[d.hi[1]].name}`]);
    if (d.lo && d.lo[1] >= 0) rows.push(['Below', `${fmtT(d.lo[0])} → ${list[d.lo[1]].name}`]);
    if (d.flam > 0) rows.push(['Ignites', d.explode ? `${fmtT(d.ign)} — explodes` : fmtT(d.ign)]);
    if (d.conduct) rows.push(['Electricity', 'Conducts']);
    if (d.acidRes >= 0.9 && !d.virtual && d.cat !== ELEM.CAT.GAS) rows.push(['Acid', 'Resists']);
    const h = document.createElement('div');
    h.innerHTML = `<h3></h3><div class="kind">${SYM[d.key]} · ${d.group}</div><p></p><dl></dl>`;
    h.querySelector('h3').textContent = d.name;
    h.querySelector('p').textContent = d.desc;
    const dl = h.querySelector('dl');
    for (const [k, v] of rows) {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      dl.append(dt, dd);
    }
    box.append(...h.childNodes);
  }

  // ───── search ─────
  // The box above the tabs: a number shows that periodic element, words show everything that
  // matches, sorted into categories (search.js does the finding). Click a result to pick it up.
  let searchQ = '';
  function buildSearch() {
    // the periodic table indexes itself; the alchemy table, the weapons and the tools join it here
    for (const d of tableOrder) {
      G.Search.add({
        cat: 'Alchemy', kind: 'element', id: d.id, name: d.name, order: number.get(d.id),
        visible: () => game.sandbox || !!known[d.id] || (!!d.special && unlocked(d.id)), // nothing undiscovered is given away
        fields: [[d.name, 10, 'name'], [SYM[d.key], 0, 'sym'], [d.group, 5], [d.desc, 3], [d.starter ? '' : d.recipe, 2]],
      });
    }
    let k = 0;
    for (const [group, names] of WEAPON_GROUPS) for (const name of names) {
      const [title, line, desc] = WEAPON_INFO[name];
      G.Search.add({ cat: 'Weapons', kind: 'weapon', id: name, name: title, order: k++, visible: () => G.Unlocks.has('weapon', name), fields: [[title, 10, 'name'], [group, 4], [line, 3], [desc, 3]] });
    }
    for (const [name, [title, desc]] of Object.entries(TOOL_INFO)) {
      G.Search.add({ cat: 'Tools', kind: 'tool', id: name, name: title, order: k++, fields: [[title, 10, 'name'], [desc, 3]] });
    }
  }

  function searchTile(e) {
    const t = document.createElement('span');
    if (e.d) { // a periodic element
      t.className = `sr-tile fam-${e.d.fam}`;
      t.innerHTML = `<i>${e.d.z}</i><b>${e.d.sym}</b>`;
    } else if (e.kind === 'element') {
      t.className = 'sr-tile alch';
      const b = document.createElement('b');
      b.textContent = SYM[list[e.id].key];
      t.append(cloneCanvas(swatchFor(e.id)), b);
    } else if (e.kind === 'weapon') {
      t.className = 'sr-tile icon';
      t.style.color = WEAPON_INFO[e.id][3];
      t.innerHTML = `<svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true">${WEAPON_INFO[e.id][4]}</svg>`;
    } else {
      t.className = 'sr-tile icon';
      const g = document.querySelector(`[data-tool="${e.id}"] .glyph`);
      if (g) t.append(g.cloneNode(true));
    }
    return t;
  }

  function pickResult(e) {
    if (e.kind === 'weapon' || e.kind === 'tool') { select({ kind: e.kind, name: e.id }); return; }
    if (e.d && !unlocked(e.id) && Lab.ready(e.id)) { G.LabView.open(); return; } // ready to research: off to the Lab
    select({ kind: 'element', t: e.id });
  }

  function renderSearch() {
    const box = $('#search-results');
    const r = G.Search.query(searchQ);
    $('#panel').classList.toggle('searching', !!r);
    box.hidden = !r;
    $('#search-clear').hidden = !searchQ;
    if (!r) return;
    box.innerHTML = '';
    const say = (cls, text) => { const p = document.createElement('p'); p.className = cls; p.textContent = text; box.append(p); };
    if (!r.groups.length) {
      say('sr-empty', r.number != null
        ? `There is no element ${r.number}. The table runs from 1, hydrogen, to ${G.Search.MAX_Z}, oganesson.`
        : `Nothing matches “${searchQ.trim()}”.`);
      return;
    }
    if (r.fuzzy) say('sr-fuzzy', 'Nothing matches exactly. Did you mean:');
    const sel = game.selected;
    for (const g of r.groups) {
      const label = document.createElement('div');
      label.className = 'group-label';
      label.textContent = g.cat;
      const n = document.createElement('span');
      n.className = 'sr-count';
      n.textContent = g.items.length;
      label.append(n);
      const ul = document.createElement('div');
      ul.className = 'sr-list';
      for (const h of g.items) {
        const e = h.e, d = e.d;
        const b = document.createElement('button');
        b.type = 'button';
        const open = e.kind !== 'element' || unlocked(e.id);
        b.className = `sr${open ? '' : ' locked'}${r.number != null ? ' big' : ''}`;
        b.classList.toggle('on', sel.kind === e.kind && (e.kind === 'element' ? sel.t === e.id : sel.name === e.id));
        const text = document.createElement('span');
        text.className = 'sr-text';
        const name = document.createElement('span');
        name.className = 'sr-name';
        name.textContent = e.name;
        const meta = document.createElement('small');
        meta.textContent = d ? `${d.z} · ${d.family.toLowerCase()}` : e.kind === 'element' ? list[e.id].group.toLowerCase() : e.kind;
        name.append(meta);
        text.append(name);
        // the line under the name: where it matched, or for an atomic number, the element itself
        const line = r.number != null ? `${d.desc} ${G.LabView.discoveredLine(d)}.` : h.why;
        if (line) {
          const snip = document.createElement('span');
          snip.className = 'sr-snip';
          for (const [part, hit] of r.number != null ? [[line, false]] : G.Search.snippet(line, r.words)) {
            if (hit) { const m = document.createElement('mark'); m.textContent = part; snip.append(m); } else snip.append(part);
          }
          text.append(snip);
        }
        const badge = document.createElement('span');
        badge.className = 'sr-badge';
        if (d && !open) { badge.textContent = Lab.ready(e.id) ? 'Lab' : 'locked'; badge.classList.toggle('ready', Lab.ready(e.id)); }
        else if (d && Lab.has(e.id)) { badge.textContent = G.TryIt.has(e.id) ? '★' : '☆'; badge.classList.add('star'); }
        b.title = d && !open ? (Lab.ready(e.id) ? `${e.name} is ready to research: open the Lab` : `${e.name} is locked`) : `Pick up ${e.name}`;
        b.append(searchTile(e), text, badge);
        b.addEventListener('click', () => pickResult(e));
        ul.append(b);
      }
      box.append(label, ul);
    }
  }
  function setSearch(q) {
    searchQ = q;
    if ($('#search').value !== q) $('#search').value = q;
    renderSearch();
  }

  // ───── hints ─────
  function hint() {
    if (G.Journey && G.Journey.active) { G.Journey.hint(); return; }
    if (!$('#weapons').hidden) weaponHint();
    else alchemyHint();
  }

  // ───── modals ─────
  let lastFocus = null;
  function openModal(sel) {
    closePop();
    lastFocus = document.activeElement;
    const m = $(sel);
    m.hidden = false;
    const focusable = m.querySelector('[data-close], button');
    if (focusable) focusable.focus();
  }
  function closeModal(m) {
    m.hidden = true;
    closePop();
    if (lastFocus) lastFocus.focus();
  }
  const anyModalOpen = () => !!document.querySelector('.modal:not([hidden])');

  function init(g) {
    game = g;
    loadKnown();
    Lab.init(store);
    TryIt.init(store);
    TryIt.onDone = tried;
    Tints.init(store);
    Tints.onOpen = tintMade;
    G.Unlocks.init(store, {
      sandbox: () => game.sandbox,
      found: () => totalKnown(),
      known: (t) => !!known[t],
      glass: () => Tints.count('glass'),
      tried: (sym) => TryIt.has(ELEM.periodic.find((d) => d.sym === sym).id),
      journeyWon: (cid) => ((store.get('journey', {}).stars || {})[cid] || 0) > 0,
      labMet: (scene) => (Lab.sceneNeeds(G.Scenes)[scene] || []).every((t) => Lab.has(t)),
    });
    G.Achieve.init(store, {
      sandbox: () => game.sandbox,
      found: () => totalKnown(), tableTotal,
      lab: () => Lab.count(),
      stars: () => TryIt.count(), starsTotal: ELEM.periodic.length,
      chapters: () => G.Story.chapters.filter((c) => !c.sealed).map((c) => c.id),
      won: (cid) => ((store.get('journey', {}).stars || {})[cid] || 0) > 0,
    });
    game.sandbox = false;
    store.del('sandbox');
    for (const k of store.get('news', [])) news.add(k);
    game.magnitude = store.get('magnitude', 7);
    game.machine = Object.assign({ dir: 0, mode: 1, set: 100, sticky: false }, store.get('machine', {}));
    buildMachineBox();
    syncWorldDisc(game.world);

    document.querySelectorAll('[data-tool]').forEach((b) => {
      toolButtons[b.dataset.tool] = b;
      b.addEventListener('click', () => select({ kind: 'tool', name: b.dataset.tool }));
    });
    // the Magnetic switch in the Magnet's box: on, the Magnet picks up only magnetic metals
    const magSwitch = $('#magnet-mode');
    const setMagnetic = (on) => {
      game.magnetOnly = on;
      magSwitch.setAttribute('aria-checked', on);
      $('#magnet-box').classList.toggle('magnetic', on);
      magSwitch.title = `Magnetic is ${on ? 'ON' : 'OFF'}. On, the Magnet picks up only what a real magnet would (iron, cobalt, nickel, neodymium, liquid oxygen…) and drops it once heated past its Curie point. Off, it carries any loose matter.`;
      store.set('magnetOnly', on);
    };
    setMagnetic(store.get('magnetOnly', false));
    magSwitch.addEventListener('click', () => {
      setMagnetic(!game.magnetOnly);
      if (game.magnetOnly) select({ kind: 'tool', name: 'magnet' }); // switching it on means you want the magnet
    });
    buildTable();
    buildPeriodic();
    buildWeapons();
    buildSearch();
    const box = $('#search');
    box.addEventListener('input', () => setSearch(box.value));
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setSearch(''); box.blur(); } });
    $('#search-clear').addEventListener('click', () => { setSearch(''); box.focus(); });
    setMagnitude(game.magnitude);
    for (const k of Object.keys(TABS)) $(`#tab-${k}`).addEventListener('click', () => { setSearch(''); showTab(k); });
    showTab(store.get('tab', 'alchemy'));
    refreshTable();
    paintUnlocks();

    $('#btn-codex').addEventListener('click', openCodex);
    $('#btn-groups').addEventListener('click', openGroups);
    $('#btn-hint').addEventListener('click', hint);
    $('#btn-achieve').addEventListener('click', openAchievements);
    paintAchieveButton();
    $('#btn-help').addEventListener('click', () => openModal('#welcome'));
    $('#btn-info').addEventListener('click', () => openModal('#info'));
    $('#btn-replay-guide').addEventListener('click', () => { closeModal($('#welcome')); G.FirstRun.start(); });
    document.querySelectorAll('.modal').forEach((m) => {
      // a sticky modal (a journal page) waits for one of its own buttons
      m.addEventListener('click', (e) => { if ((e.target === m && !m.dataset.sticky) || e.target.closest('[data-close]')) closeModal(m); });
      m.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !m.dataset.sticky) closeModal(m); });
    });
    document.body.append(filePick);
    paintNews();
  }

  G.UI = {
    init, refreshTable, onFound, toast, note, store, syncWorldDisc, anyModalOpen, select, openModal, closeModal,
    refreshInspect: () => renderInspect(),
    focusSearch: () => { $('#search').focus(); $('#search').select(); },
    unlocked: (t) => unlocked(t),
    lifeFound: () => ({ found: game.sandbox ? LIFE.length : lifeFound(), total: LIFE.length }),
    symbol: (t) => SYM[list[t].key],
    swatch: (t, w, h) => cloneCanvas(swatchFor(t, w, h)),
    toolName: (name) => TOOL_INFO[name][0],
    weaponColor: (name) => WEAPON_INFO[name][3],
    announce, achieved, paintUnlocks, sceneHint, closePop, markNew, clearNew, paintNews, onNews: null,
    tile: (key) => tiles.get(ELEM.byKey[key].id),
    known: (key) => !!known[ELEM.byKey[key].id],
    showAlchemy: () => { setSearch(''); showTab('alchemy'); }, sceneName: (n) => SCENE_NAMES[n], weaponName: (n) => WEAPON_INFO[n][0],
    found: () => totalKnown(),
    // what Found would say for a saved list of found keys (a backup's), starters included
    countFound: (keys) => { const s = new Set(keys); return tableOrder.filter((d) => !d.special && (d.starter || s.has(d.key))).length; },
    tableTotal,
    // the tsunami's line, while its hint is up (a row of the map, or null)
    floodLine: () => (floodShown && pop ? Math.round(game.world.H * G.Unlocks.FLOOD_ROW) : null),
    onUnlock: null,
    // the colour Concrete is laid in, or the Paint tool paints in (0xrrggbb, 0 for none)
    paintColor: (t) => (list[t].key in paints ? paintRGB(list[t].key) : 0),
    picture: () => picture,
  };
})(globalThis);
