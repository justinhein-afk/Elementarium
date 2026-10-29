/* Elementarium — the Lab's rules (no DOM; labview.js shows them).
 * Which periodic elements are unlocked and which are ready to research; what each of the seven
 * tests shows for an element, both as the rough band your master's handbook lists and as the
 * exact reading the bench gives; building a mystery sample that can always be solved; and the
 * test tubes the tests run in, each a small world of its own that never steps with the main one. */
(function (G) {
  'use strict';

  const { ELEM, Sim } = G;
  const { ID, list } = ELEM;
  const P = ELEM.periodic;
  const bySym = Object.fromEntries(P.map((d) => [d.sym, d]));

  // ───── difficulty ─────
  const START = ['H', 'He'];  // open from the start: the first two elements of the universe
  const TEST_BUDGET = 3;      // tests you may run on one sample
  const EASY_UNTIL = 10;      // until this many have been identified, samples come with 3 candidates, then 4
  const POOL = 6;             // the sample is one of the six lowest-numbered elements ready to research
  const RETRY_MS = 10000;     // after a wrong answer, the next sample takes this long to prepare
  const FURNACE = 2000;       // the hottest the bench's furnace goes
  const AIR_GL = 1.29;        // air at 0°C in g/L (periodic.js gives gas densities at 0°C too)

  // ───── what is open ─────
  const open = new Uint8Array(ELEM.NT);
  let store = null;
  function restore(syms) {
    open.fill(0);
    for (const s of START) open[bySym[s].id] = 1;
    for (const s of syms || []) if (bySym[s]) open[bySym[s].id] = 1;
  }
  const save = () => { if (store) store.set('periodic', P.filter((d) => open[d.id] && !START.includes(d.sym)).map((d) => d.sym)); };
  function init(s) { store = s; restore(s.get('periodic', [])); }
  function reset() { restore([]); save(); }
  const has = (t) => !!open[t];
  function unlock(t) {
    if (open[t] || !list[t].periodic) return false;
    open[t] = 1;
    save();
    return true;
  }
  const count = () => P.reduce((n, d) => n + open[d.id], 0);
  const identified = () => count() - START.length;

  // ───── neighbours on the table ─────
  // Up, down, left and right. The lanthanide and actinide rows sit below the table but belong in
  // the gap in group 3, so lanthanum joins barium and hafnium, and actinium radium and rutherfordium.
  const at = new Map(P.map((d) => [d.pos.join(','), d]));
  const NEAR = new Map(P.map((d) => {
    const [r, c] = d.pos;
    return [d.id, [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map((p) => at.get(p.join(','))).filter(Boolean)];
  }));
  for (const [a, bs] of [['La', ['Ba', 'Hf']], ['Ac', ['Ra', 'Rf']]]) {
    for (const b of bs) { NEAR.get(bySym[a].id).push(bySym[b]); NEAR.get(bySym[b].id).push(bySym[a]); }
  }
  const ready = (t) => !open[t] && NEAR.has(t) && NEAR.get(t).some((d) => open[d.id]);
  const readyList = () => P.filter((d) => ready(d.id));

  // ───── the tests ─────
  const TESTS = ['flame', 'water', 'acid', 'heat', 'weigh', 'current', 'geiger'];
  const TEST_INFO = {
    flame: ['Flame', 'Sprinkle it into a fire and watch the flame'],
    water: ['Water', 'Drop it into a beaker of water'],
    acid: ['Acid', 'Drop it into a beaker of acid'],
    heat: ['Heat', `Heat it in a sealed capsule, up to ${FURNACE.toLocaleString('en-US')}°C (a gas is cooled instead)`],
    weigh: ['Weigh', 'Measure its density'],
    current: ['Current', 'Wire it between two batteries'],
    geiger: ['Geiger', 'Hold a Geiger counter to it'],
  };
  // flame-test colours, by name (the hex colours are in periodic.js)
  const FLAME = {
    H: 'pale blue', Li: 'crimson', B: 'bright green', Na: 'yellow', Mg: 'brilliant white', P: 'white', S: 'blue',
    K: 'lilac', Ca: 'orange-red', Cu: 'blue-green', Zn: 'pale blue', As: 'pale blue', Se: 'blue', Rb: 'red-violet',
    Sr: 'red', Zr: 'brilliant white', In: 'indigo', Cs: 'blue-violet', Ba: 'apple green', Ce: 'pale yellow',
    Tl: 'green', Fr: 'pink', Ra: 'red',
  };
  // the colour a gas glows with current through it
  const GLOW = { He: 'peach', Ne: 'orange-red', Ar: 'violet', Kr: 'white', Xe: 'blue', Rn: 'red', N: 'purple' };

  const stateOf = (d) => (d.bp <= 20 ? 'gas' : d.mp <= 20 ? 'liquid' : 'solid');
  const grams = (d) => d.density / 10; // g/cm³ (the game's water is 10)
  const deg = (v) => {
    const a = Math.abs(v);
    return `${v < 0 ? '−' : ''}${Number.isInteger(a) || a >= 1000 ? Math.round(a).toLocaleString('en-US') : a.toFixed(1)}°C`;
  };
  const num = (v) => (v < 10 ? v.toFixed(2) : v.toFixed(1));
  // short: the reading as the handbook's Sample column shows it (the band, unless there's a number)
  const R = (band, text, why, short = band) => ({ band, text, why, short });

  // What a test shows for an element: `band` is how the handbook lists it (two elements in the same
  // band can't be told apart by that test), `text` the exact reading, `why` a key into FACTS.WHY.
  function result(test, d) {
    const s = stateOf(d), c = d.chem, sym = d.sym;
    switch (test) {
      case 'flame': {
        const col = FLAME[sym];
        if (col) return R(col, d.flam ? `catches fire and burns with a ${col} flame` : `turns the flame ${col}`, 'flame:colour');
        if (sym === 'Th') return R('glows white', 'glows a brilliant white in the flame', 'flame:mantle');
        if (d.flam) return R('burns, no colour', 'glows red-hot and slowly burns away', 'flame:burns');
        return R('no colour', s === 'gas' ? 'drifts through the fire; the flame stays orange' : 'the flame stays its ordinary orange', 'flame:none');
      }
      case 'water': {
        if (s === 'gas') return R('bubbles out', 'bubbles up through the water and away', 'water:gas');
        if (c.wr) {
          const p = c.wr[2];
          return R('explodes', p < 0.3 ? 'fizzes hard, then bursts into flame' : p < 0.7 ? 'skates over the water, then explodes'
            : 'explodes violently the moment it touches the water', 'water:explodes');
        }
        if (c.fizz) return R('fizzes', 'sinks and fizzes, giving off hydrogen', 'water:fizzes');
        return R('no reaction', `${grams(d) < 1 ? 'floats' : 'sinks'}, and nothing happens`, 'water:nothing');
      }
      case 'acid':
        if (s === 'gas') return R('bubbles out', 'bubbles up through the acid untouched', 'acid:nothing');
        if (d.acidRes >= 0.97) return R('resists', 'lies in the acid, untouched', 'acid:resists');
        if (c.acidH) return R('fizzes', 'dissolves, fizzing with bubbles of hydrogen', 'acid:fizzes');
        return R('eaten slowly', 'the acid slowly eats it away, without a fizz', 'acid:eaten');
      case 'heat': {
        if (s === 'gas') {
          const b = d.bp < -200 ? 'below −200°C' : d.bp < -100 ? '−200 to −100°C' : '−100 to 20°C';
          return R(`gas · liquid ${b}`, `already a gas, so it is cooled instead: it turns liquid at ${deg(d.bp)} and freezes at ${deg(d.mp)}`,
            'heat:gas', `gas · liquid at ${deg(d.bp)}`);
        }
        if (s === 'liquid') {
          return R('liquid at 20°C', `already liquid at room temperature; it freezes at ${deg(d.mp)} and boils at ${deg(d.bp)}`,
            'heat:liquid', `liquid · boils ${deg(d.bp)}`);
        }
        if (d.mp > FURNACE) return R(`solid past ${FURNACE.toLocaleString('en-US')}°C`, `still solid at ${deg(FURNACE)}, as hot as the furnace goes`, 'heat:solid');
        const b = d.mp < 100 ? 'below 100°C' : d.mp < 500 ? '100–500°C' : d.mp < 1000 ? '500–1,000°C' : '1,000–2,000°C';
        return R(`melts ${b}`, d.mp === d.bp ? `turns straight to vapour at ${deg(d.mp)}`
          : `melts at ${deg(d.mp)}${d.bp <= FURNACE ? ` and boils at ${deg(d.bp)}` : ''}`, 'heat:solid', `melts at ${deg(d.mp)}`);
      }
      case 'weigh': {
        if (s === 'gas') {
          const gl = d.gl;
          return R(gl < AIR_GL ? 'gas, lighter than air' : gl < 4 ? 'gas, heavier than air' : 'gas, far heavier than air',
            `${num(gl)} g/L: it ${gl < AIR_GL ? 'rises' : 'sinks'} in air, which weighs ${AIR_GL} g/L`, 'weigh:gas', `${num(gl)} g/L`);
        }
        const g = grams(d);
        const b = g < 1 ? 'under 1' : g < 5 ? '1–5' : g < 10 ? '5–10' : g < 15 ? '10–15' : 'over 15';
        return R(`${b} g/cm³`, `${num(g)} g/cm³: it ${g < 1 ? 'floats on' : 'sinks in'} water${g > 13.53 ? ', and would sink even in mercury' : ''}`,
          'weigh:solid', `${num(g)} g/cm³`);
      }
      case 'current':
        if (s === 'gas') {
          return GLOW[sym] ? R(`glows ${GLOW[sym]}`, `the gas glows ${GLOW[sym]}`, 'current:glows')
            : R('no current', 'nothing: no current flows through the gas', 'current:none');
        }
        if (c.phos) return R(`glows ${c.phos[2]}, fades`, `current flows, and it glows ${c.phos[2]}, fading slowly after each pulse`, 'current:phosphor');
        if (c.ohm) return R('glows white-hot', 'current flows and heats it white-hot', 'current:filament');
        if (d.conduct) return R('conducts', 'current flows through it', 'current:conducts');
        return R('no current', 'nothing: no current flows through it', 'current:none');
      case 'geiger': {
        if (c.rad >= 0.005 || (c.decay && c.decay[0] >= 1e-3)) {
          return R('crackles', `crackles non-stop${d.fam === 'sh' ? ', and the sample decays away as you watch' : ''}`, 'geiger:fast');
        }
        if (c.rad || c.decay || c.nem) return R('clicks', 'clicks now and then', 'geiger:slow');
        return R('silent', 'silent, but for the odd click of the background', 'geiger:silent');
      }
    }
    return R('', '', '');
  }

  const BANDS = new Map(P.map((d) => [d.id, TESTS.map((k) => result(k, d).band)]));
  // every set of one, two or three tests, smallest first
  const COMBOS = [];
  for (let a = 0; a < TESTS.length; a++) COMBOS.push([a]);
  for (let a = 0; a < TESTS.length; a++) for (let b = a + 1; b < TESTS.length; b++) COMBOS.push([a, b]);
  for (let a = 0; a < TESTS.length; a++) for (let b = a + 1; b < TESTS.length; b++) for (let c = b + 1; c < TESTS.length; c++) COMBOS.push([a, b, c]);

  // The fewest tests that tell `t` apart from every one of `others`, and which tests they are.
  function fewest(t, others) {
    const bt = BANDS.get(t.id);
    for (const s of COMBOS) {
      if (others.every((o) => s.some((k) => BANDS.get(o.id)[k] !== bt[k]))) return { n: s.length, tests: s.map((k) => TESTS[k]) };
    }
    return { n: Infinity, tests: [] };
  }
  // the tests on which two elements differ
  const differences = (a, b) => TESTS.filter((k, j) => BANDS.get(a.id)[j] !== BANDS.get(b.id)[j]);

  // ───── a mystery sample ─────
  // One of the lowest-numbered elements ready to research, and candidates like it: other ready
  // elements first (the same family, then the nearest on the table), with known ones to make up the
  // number. Each must differ from the sample on at least one test, so with at most three candidates
  // beside it, three tests always settle it. Early on the lab prefers samples one test can settle;
  // later, ones that take two.
  function makeSample(rng = Math.random, force = null) { // force: the sample to use (for tests)
    const now = readyList();
    if (!now.length && !force) return null;
    const target = force || now[(rng() * Math.min(POOL, now.length)) | 0];
    const easy = identified() < EASY_UNTIL;
    const want = (easy ? 3 : 4) - 1;
    const prefer = easy ? [1, 2, 3] : [2, 1, 3];
    const bt = BANDS.get(target.id);
    const apart = (d) => d !== target && BANDS.get(d.id).some((b, k) => b !== bt[k]);
    const dist = (d) => Math.abs(d.pos[0] - target.pos[0]) + Math.abs(d.pos[1] - target.pos[1]);
    const like = (pool) => pool.filter(apart)
      .map((d) => [(d.fam === target.fam ? 0 : 4) + dist(d) * 0.6 + rng() * 3, d])
      .sort((a, b) => a[0] - b[0]).map((e) => e[1]);
    let pool = like(now);
    if (pool.length < want) pool = pool.concat(like(P.filter((d) => open[d.id])));
    // try every set of decoys from the eight most alike, and keep the one that takes the number
    // of tests we prefer, the most alike first
    const top = pool.slice(0, 8), m = Math.min(want, top.length);
    let best = top.slice(0, m), bestScore = Infinity;
    const pick = (from, chosen, rank) => {
      if (chosen.length === m) {
        const score = prefer.indexOf(fewest(target, chosen).n) * 100 + rank;
        if (score < bestScore) { bestScore = score; best = chosen.slice(); }
        return;
      }
      for (let j = from; j < top.length; j++) { chosen.push(top[j]); pick(j + 1, chosen, rank + j); chosen.pop(); }
    };
    pick(0, [], 0);
    const candidates = [target, ...best];
    for (let k = candidates.length - 1; k > 0; k--) { const j = (rng() * (k + 1)) | 0; [candidates[k], candidates[j]] = [candidates[j], candidates[k]]; }
    return { target, candidates, need: fewest(target, best) };
  }

  // ───── the test tubes ─────
  // Each test runs in a small world of its own, built here and thrown away after: it never steps
  // with the main world, and nothing made in it counts as a discovery.
  const TW = 48, TH = 32;
  const TEST_TICKS = 300, RAMP_TICKS = 240, SHOW_AT = 150; // a test runs 5 s; its reading shows after 2½
  function rect(w, x0, y0, x1, y1, t) {
    for (let y = Math.max(0, y0); y <= Math.min(w.H - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(w.W - 1, x1); x++) w.place(w.idx(x, y), t);
    }
  }
  // a glass box with an empty inside
  function vessel(w, x0, y0, x1, y1, t = ID.GLASS) {
    rect(w, x0, y0, x1, y1, t);
    rect(w, x0 + 1, y0 + 1, x1 - 1, y1 - 1, ID.EMPTY);
  }

  function bench(test, d) {
    const w = Sim.createWorld(TW, TH);
    w.disc.fill(1);
    const t = d.id, s = stateOf(d);
    const put = (x0, y0, x1, y1, every = 1) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if ((x + y) % every === 0) w.place(w.idx(x, y), t);
    };
    let ramp = null, reading = null, clicks = 0, k = 0;
    switch (test) {
      case 'flame': { // a wood fire on a stone hearth; the sample is sprinkled in from above
        rect(w, 0, TH - 3, TW - 1, TH - 1, ID.STONE);
        rect(w, 14, TH - 9, 33, TH - 4, ID.WOOD);
        for (let y = TH - 9; y <= TH - 8; y++) for (let x = 14; x <= 33; x++) w.ignite(w.idx(x, y));
        if (s === 'gas') put(16, TH - 11, 31, TH - 10, 2);
        else put(18, 3, 29, 6, 3);
        break;
      }
      case 'water': case 'acid': { // a glass beaker; an alkali metal goes in as a few pellets only
        rect(w, 0, TH - 2, TW - 1, TH - 1, ID.STONE);
        rect(w, 11, 9, 11, TH - 3, ID.GLASS); rect(w, 36, 9, 36, TH - 3, ID.GLASS); rect(w, 11, TH - 3, 36, TH - 3, ID.GLASS);
        rect(w, 12, 15, 35, TH - 4, test === 'water' ? ID.WATER : ID.ACID);
        if (s === 'gas') put(19, TH - 6, 28, TH - 5);
        else if (d.chem.wr && test === 'water') put(21, 3, 26, 4, 2);
        else put(19, 3, 28, 5);
        break;
      }
      case 'heat': {
        // Any gas counts as air for burning, so the sample is packed into a sealed capsule with no
        // room for air, the way a melting point is taken in a sealed glass tube. A gas fills a sealed
        // box and is cooled instead.
        // Its own vapour would count as air too, so a flammable sample is taken to just short of boiling.
        rect(w, 6, TH - 5, 41, TH - 1, ID.WALL);
        if (s === 'gas') { vessel(w, 12, 6, 35, TH - 6); put(13, 7, 34, TH - 7, 2); } // room for the liquid to fall
        else { vessel(w, 15, TH - 13, 32, TH - 6, ID.WALL); put(16, TH - 12, 31, TH - 7); }
        const to = s === 'gas' ? Math.max(-273, d.mp - 15) : Math.min(FURNACE, d.flam ? d.bp - 10 : d.bp + 60);
        let T = 20;
        ramp = () => {
          T = 20 + (to - 20) * Math.min(1, k / RAMP_TICKS);
          for (let i = 0; i < w.N; i++) if (w.type[i] === t) w.temp[i] = T;
        };
        reading = () => `${s === 'gas' ? 'Cooling' : 'Furnace'} ${deg(Math.round(T))}`;
        break;
      }
      case 'weigh': { // a measuring cylinder of water (an alkali metal stays dry on the pan); a gas fills the middle of a tall tube of air
        rect(w, 0, TH - 2, TW - 1, TH - 1, ID.STONE);
        if (s === 'gas') { vessel(w, 17, 0, 30, TH - 3); put(18, 12, 29, 16); }
        else if (d.chem.wr) { rect(w, 15, TH - 3, 32, TH - 3, ID.GLASS); put(19, TH - 6, 28, TH - 4); }
        else {
          rect(w, 17, 7, 17, TH - 3, ID.GLASS); rect(w, 30, 7, 30, TH - 3, ID.GLASS); rect(w, 17, TH - 3, 30, TH - 3, ID.GLASS);
          rect(w, 18, 12, 29, TH - 4, ID.WATER);
          put(20, 2, 27, 4);
        }
        const r = result('weigh', d).text.split(':')[0];
        reading = () => `Balance ${r}`;
        break;
      }
      case 'current': { // batteries at both ends: a sealed tube of the gas, or a glass trough of the sample
        rect(w, 0, TH - 2, TW - 1, TH - 1, ID.STONE);
        if (s === 'gas') {
          vessel(w, 6, 11, 41, 17);
          put(7, 12, 40, 16);
          w.place(w.idx(6, 14), ID.BATTERY); w.place(w.idx(41, 14), ID.BATTERY);
        } else {
          rect(w, 8, 22, 39, 22, ID.WALL);
          rect(w, 8, 17, 8, 21, ID.GLASS); rect(w, 39, 17, 39, 21, ID.GLASS);
          put(10, 19, 37, 21);
          w.place(w.idx(9, 21), ID.BATTERY); w.place(w.idx(38, 21), ID.BATTERY);
        }
        break;
      }
      case 'idle': // the sample waiting on the bench, before any test
      case 'geiger': { // a dish of the sample (a gas in a sealed jar) and a counter listening
        rect(w, 0, TH - 3, TW - 1, TH - 1, ID.STONE);
        if (s === 'gas') { vessel(w, 15, 12, 32, TH - 4); put(16, 13, 31, TH - 5); }
        else { rect(w, 16, TH - 4, 31, TH - 4, ID.GLASS); rect(w, 16, TH - 7, 16, TH - 4, ID.GLASS); rect(w, 31, TH - 7, 31, TH - 4, ID.GLASS); put(17, TH - 6, 30, TH - 5); }
        if (test === 'geiger') reading = () => `Geiger counter · ${clicks} click${clicks === 1 ? '' : 's'}`;
        break;
      }
    }
    return {
      world: w,
      get tick() { return k; },
      get done() { return k >= TEST_TICKS; },
      get showing() { return k >= SHOW_AT; },
      step() {
        if (ramp) ramp();
        w.step();
        k++;
      },
      // hand the events gathered since the last flush to `fn` (sound, flashes), then clear them
      flush(fn) {
        const ev = w.events;
        clicks += ev.rad + ev.decay;
        if (fn) fn(ev);
        w.resetEvents();
      },
      reading() { return reading ? reading() : ''; },
    };
  }

  // ───── scenes that need periodic elements ─────
  // Built once into a scratch world, so the list follows the scenes as they change.
  let needs = null;
  function sceneNeeds(Scenes) {
    if (needs) return needs;
    needs = {};
    const w = Sim.createWorld(256, 160);
    for (const [name, build] of Object.entries(Scenes)) {
      build(w);
      const found = new Set();
      for (let i = 0; i < w.N; i++) if (list[w.type[i]] && list[w.type[i]].periodic) found.add(w.type[i]);
      if (found.size) needs[name] = [...found].sort((a, b) => list[a].z - list[b].z);
    }
    return needs;
  }

  G.Lab = {
    START, TEST_BUDGET, EASY_UNTIL, RETRY_MS, TESTS, TEST_INFO, TEST_TICKS,
    init, reset, restore, has, unlock, count, identified, ready, readyList,
    near: (t) => NEAR.get(t) || [], stateOf, result, band: (test, d) => result(test, d).band,
    fewest, differences, makeSample, bench, sceneNeeds, deg,
    fact: (d) => G.FACTS.FACTS[d.sym], familyNote: (fam) => G.FACTS.FAMILY_NOTES[fam], why: (key) => G.FACTS.WHY[key] || '',
  };
})(globalThis);
