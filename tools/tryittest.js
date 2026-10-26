// Headless checks for Try it: every element's experiment, done the way a player would (the Heat
// and Cool tools, batteries, a fire, a beaker, a big lump), earns its star; and things that
// shouldn't (a locked element, a scene's own set-up, an element just sitting there) don't.
// Run: node tools/tryittest.js            (--only Fe,Cu  to run some)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
for (const f of ['elements.js', 'periodic.js', 'sim.js', 'scenes.js', 'facts.js', 'lab.js', 'tryit.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
}
const { ELEM, Sim, Lab, TryIt, Scenes } = globalThis;
const { ID } = ELEM;
const P = ELEM.periodic;
const el = (s) => P.find((d) => d.sym === s);
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;

const out = [];
const check = (label, ok, detail) => out.push({ label, ok, detail });
const mem = {};
const store = { get: (k, d) => (k in mem ? mem[k] : d), set: (k, v) => { mem[k] = v; } };
Lab.init(store);
TryIt.init(store);
Lab.restore(P.map((d) => d.sym)); // everything unlocked

function world(W = 96, H = 64) {
  const w = Sim.createWorld(W, H);
  w.disc.fill(1);
  return w;
}
function rect(w, x0, y0, x1, y1, t) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) w.place(w.idx(x, y), t);
}
function vessel(w, x0, y0, x1, y1, t = ID.GLASS) { rect(w, x0, y0, x1, y1, t); rect(w, x0 + 1, y0 + 1, x1 - 1, y1 - 1, ID.EMPTY); }
const cellsOf = (w, t) => { const a = []; for (let i = 0; i < w.N; i++) if (w.type[i] === t) a.push(i); return a; };
function hottest(w, t, cold) {
  let v = cold ? Infinity : -Infinity;
  for (let i = 0; i < w.N; i++) if (w.type[i] === t) v = cold ? Math.min(v, w.temp[i]) : Math.max(v, w.temp[i]);
  return v;
}

// Run a world, letting the watcher see every tick, until the element earns its star.
function play(w, t, ticks, each) {
  for (let k = 0; k < ticks; k++) {
    if (each) each(w, k);
    w.step();
    TryIt.frame(w, w.events);
    w.resetEvents();
    if (TryIt.has(t)) return k + 1;
  }
  return 0;
}
// the Heat (or Cool) tool held over a heap until its hottest (coldest) grain reaches `to`
const tool = (x, y, r, to, rate = 25) => (w, k, t) => {
  const cold = to < 20, v = hottest(w, t, cold);
  if (cold ? v > to : v < to) w.heat(x, y, r, cold ? -rate : rate);
};
function benchOf(test, d) { // the Lab's own test tubes make good benches
  const b = Lab.bench(test, d);
  return b.world;
}

// How to do each experiment, by what it asks for.
function setup(d) {
  const sym = d.sym, t = d.id, s = TryIt.EXPERIMENTS[sym][1];
  const heap = (w) => { rect(w, 0, 56, 95, 63, ID.WALL); rect(w, 40, 48, 55, 55, t); return w; };
  const gasBox = (w, fill = 2) => { vessel(w, 30, 20, 65, 55); for (let y = 21; y <= 54; y++) for (let x = 31; x <= 64; x++) if ((x + y) % fill === 0) w.place(w.idx(x, y), t); return w; };
  const gas = Lab.stateOf(d) === 'gas';
  switch (sym) {
    case 'H': return { w: benchOf('flame', d) };
    case 'C': { // a sealed wall capsule packed with carbon, heated to 2,600°C
      const w = world(); vessel(w, 38, 40, 57, 55, ID.WALL); rect(w, 39, 41, 56, 54, t);
      return { w, each: (ww) => { for (const i of cellsOf(ww, t)) ww.temp[i] = 2600; } };
    }
    case 'F': { const w = world(); rect(w, 0, 56, 95, 63, ID.STONE); rect(w, 40, 50, 55, 55, ID.WOOD); rect(w, 40, 44, 55, 49, t); return { w }; }
    case 'Ga': { // molten gallium poured onto aluminium
      const w = world(); rect(w, 0, 56, 95, 63, ID.WALL); rect(w, 40, 52, 55, 55, ID.EL_AL); rect(w, 42, 46, 53, 50, t);
      return { w, each: (ww) => { for (const i of cellsOf(ww, t)) ww.temp[i] = 60; } };
    }
    case 'Al': { // a cloud of aluminium dust (sprayed, a grain in every other cell) falling onto a wood fire
      const w = world(); rect(w, 0, 56, 95, 63, ID.STONE); rect(w, 30, 49, 65, 55, ID.WOOD);
      for (let x = 30; x <= 65; x++) w.ignite(w.idx(x, 49));
      for (let y = 14; y < 34; y += 2) for (let x = 34; x <= 62; x += 2) w.place(w.idx(x, y), t);
      return { w };
    }
    case 'Be': { // a lump of uranium too small to go critical (16 × 16), in a beryllium jacket
      const w = world(); rect(w, 0, 56, 95, 63, ID.WALL); rect(w, 37, 37, 58, 55, t); rect(w, 40, 40, 55, 55, ID.EL_U); return { w };
    }
    case 'Cd': case 'Hf': { // a reactor: rods every fourth column, uranium poured round them (546 grains)
      const w = world(); rect(w, 0, 56, 95, 63, ID.WALL); rect(w, 34, 30, 61, 55, ID.EL_U);
      for (let x = 35; x < 62; x += 4) rect(w, x, 30, x, 55, t);
      return { w };
    }
    case 'Te': case 'Bi': { // a bar on a shelf, hot at one end and cold at the other
      const w = world(); rect(w, 20, 41, 75, 41, ID.WALL); rect(w, 24, 40, 66, 40, t);
      return { w, each: (ww) => { for (let x = 24; x <= 27; x++) ww.temp[ww.idx(x, 40)] = 450; ww.temp[ww.idx(66, 40)] = -50; } };
    }
    case 'Pb': { // a slab of lead standing in a glass trough of acid
      const w = world(); rect(w, 0, 56, 95, 63, ID.STONE); vessel(w, 30, 40, 65, 56); rect(w, 31, 44, 64, 55, ID.ACID); rect(w, 45, 42, 50, 55, t); return { w };
    }
    case 'W': { // a light bulb as anyone would build it: argon sealed in glass, a filament on a glass shelf, a battery at each end
      const w = world(); rect(w, 0, 56, 95, 63, ID.STONE);
      vessel(w, 30, 30, 66, 44); rect(w, 31, 31, 65, 43, ID.EL_AR); rect(w, 33, 38, 63, 38, ID.GLASS); rect(w, 35, 37, 61, 37, t);
      w.place(w.idx(34, 37), ID.BATTERY); w.place(w.idx(62, 37), ID.BATTERY);
      return { w };
    }
    case 'Sm': { // a samarium magnet held above iron filings, kept at 420°C
      const w = world(); rect(w, 0, 56, 95, 63, ID.STONE); rect(w, 44, 30, 51, 33, ID.WALL); rect(w, 44, 34, 51, 36, t);
      for (let x = 40; x < 56; x += 2) w.place(w.idx(x, 55), ID.EL_FE);
      return { w, each: (ww) => { for (const i of cellsOf(ww, t)) ww.temp[i] = 420; } };
    }
    case 'Po': case 'Am': { // the element speckled through a block of beryllium
      const w = world(); rect(w, 0, 56, 95, 63, ID.WALL); rect(w, 36, 44, 59, 55, ID.EL_BE);
      for (let y = 45; y < 55; y += 2) for (let x = 37; x < 59; x += 3) w.place(w.idx(x, y), t);
      return { w };
    }
    case 'Cl': { const w = world(); vessel(w, 30, 20, 65, 55); rect(w, 31, 21, 64, 54, t); for (let x = 34; x < 62; x += 5) w.place(w.idx(x, 23), ID.EL_NA); return { w }; }
    case 'Ti': case 'Fe': { // loose filings heated red-hot in the open air
      const w = world(); rect(w, 0, 56, 95, 63, ID.STONE); for (let x = 30; x < 66; x += 2) w.place(w.idx(x, 55), t);
      return { w, each: tool(48, 55, 20, 1000, 40) };
    }
    case 'Ce': { const w = world(96, 90); rect(w, 0, 86, 95, 89, ID.STONE); rect(w, 44, 2, 51, 4, t); return { w }; }
    case 'Ni': { // nichrome: nickel and chromium side by side on a shelf, a battery at one end
      const w = world(); rect(w, 20, 41, 75, 41, ID.WALL); for (let x = 22; x <= 73; x++) w.place(w.idx(x, 40), x & 1 ? ID.EL_CR : t);
      w.place(w.idx(21, 40), ID.BATTERY); return { w };
    }
    case 'Zn': { // a lemon battery, as in the Electric workshop
      const w = world(); rect(w, 0, 56, 95, 63, ID.STONE);
      rect(w, 20, 46, 20, 55, ID.GLASS); rect(w, 21, 54, 60, 55, t); rect(w, 40, 46, 40, 53, ID.GLASS);
      rect(w, 21, 46, 39, 53, ID.SALTWATER); rect(w, 23, 50, 28, 53, ID.EL_CU); return { w };
    }
    case 'Ru': return { w: benchOf('acid', d) };
    case 'Pd': { const w = world(); vessel(w, 30, 20, 65, 55); rect(w, 31, 21, 64, 47, ID.EL_H); rect(w, 31, 48, 64, 54, t); return { w }; } // hydrogen rises: fill the jar
    case 'Pt': { const w = world(); vessel(w, 30, 20, 65, 55); rect(w, 31, 21, 64, 49, ID.EL_H); rect(w, 31, 50, 64, 54, t); return { w }; }
    case 'Hg': { const w = world(); vessel(w, 30, 30, 65, 55); rect(w, 31, 44, 64, 54, t); for (let x = 33; x < 63; x += 3) w.place(w.idx(x, 32), ID.EL_AU); return { w }; }
    case 'Os': { const w = world(); vessel(w, 30, 30, 65, 55); rect(w, 31, 40, 64, 54, ID.EL_HG); rect(w, 44, 32, 50, 34, t); return { w }; }
    case 'Nd': { // a magnet lying near iron filings
      const w = world(); rect(w, 0, 56, 95, 63, ID.STONE); rect(w, 44, 30, 51, 33, ID.WALL); rect(w, 44, 34, 51, 36, t);
      for (let x = 40; x < 56; x += 2) w.place(w.idx(x, 55), ID.EL_FE); return { w };
    }
    case 'Th': return { w: benchOf('flame', d) };
    case 'Ra': { // radium paint: zinc speckled with radium
      const w = world(); rect(w, 30, 41, 65, 41, ID.WALL); rect(w, 30, 36, 65, 40, ID.EL_ZN);
      for (let x = 32; x < 64; x += 4) w.place(w.idx(x, 38), t); return { w };
    }
    case 'Cm': { // a nuclear battery: a tellurium bar, hot curium at one end, cold at the other
      const w = world(); rect(w, 20, 41, 75, 41, ID.WALL); rect(w, 30, 40, 66, 40, ID.EL_TE); rect(w, 24, 36, 29, 40, t);
      return { w, each: (ww) => { for (const i of cellsOf(ww, t)) ww.temp[i] = 900; ww.temp[ww.idx(66, 40)] = -50; } };
    }
    case 'U': case 'Pu': { const w = world(); rect(w, 0, 56, 95, 63, ID.WALL); rect(w, 33, 24, 62, 55, t); return { w }; }
  }
  if (s.fused) { // calcium sealed in a crucible with the actinide, heated white-hot
    const target = { Cn: 'U', Nh: 'Np', Fl: 'Pu', Mc: 'Am', Lv: 'Cm', Ts: 'Bk', Og: 'Cf' }[sym];
    const w = world(); vessel(w, 38, 40, 57, 56, ID.WALL);
    rect(w, 39, 50, 56, 55, el(target).id); rect(w, 39, 47, 56, 49, ID.EL_CA);
    return { w, each: (ww) => { for (const i of cellsOf(ww, ID.EL_CA)) ww.temp[i] = 3500; } };
  }
  if (s.any || s.boom) return { w: benchOf('water', d) };
  if (s.flame) return { w: benchOf('flame', d) };
  if (s.glass) { // a pool of molten glass kept hot, the metal sprinkled on top
    const w = world(); rect(w, 0, 56, 95, 63, ID.WALL); rect(w, 30, 48, 65, 55, ID.MGLASS);
    for (let x = 32; x < 64; x += 3) w.place(w.idx(x, 45), t);
    return { w, each: (ww) => { for (const i of cellsOf(ww, ID.MGLASS)) ww.temp[i] = 1500; } };
  }
  if (s.becomes) return { w: heap(world()), ticks: 4000 };
  if (s.live) {
    const w = benchOf('current', d);
    return { w, each: s.maxT !== undefined ? (ww) => { for (const i of cellsOf(ww, t)) ww.temp[i] = s.maxT - 5; } : null };
  }
  if (s.aux) return { w: benchOf('current', d) }; // the phosphors
  if (s.burn) { const w = world(); rect(w, 0, 56, 95, 63, ID.STONE); rect(w, 40, 52, 55, 55, t); return { w, each: tool(47, 53, 10, (d.ign || 500) + 100, 30) }; }
  if (s.state === 'liquid' && gas) return { w: gasBox(world()), each: tool(47, 37, 22, d.bp - 10, 30) };
  if (s.maxT !== undefined) return { w: heap(world()), each: tool(47, 51, 12, s.maxT - 5, 30) };
  if (s.minT !== undefined) return { w: heap(world()), each: tool(47, 51, 12, s.minT + 100, 40) };
  if (s.state === 'gas') return { w: heap(world()), each: tool(47, 51, 12, d.bp + 30, 30) };
  if (s.state === 'liquid') return { w: heap(world()), each: tool(47, 51, 12, d.mp + Math.min(60, (d.bp - d.mp) / 2), 40) };
  return null;
}

// ── every experiment can be done ──
{
  // The physics is random (a decay, a fusion, gallium creeping into aluminium), so like a player
  // the test tries again in a fresh world, up to three times.
  const failed = [], again = [];
  for (const d of P) {
    if (only && !only.includes(d.sym)) continue;
    let k = 0, tries = 0;
    while (!k && tries < 3) {
      tries++;
      TryIt.reset();
      const st = setup(d);
      if (!st) break;
      const each = st.each ? (w, j) => st.each(w, j, d.id) : null;
      k = play(st.w, d.id, st.ticks || 2000, each);
    }
    if (!k) failed.push(d.sym);
    else if (tries > 1) again.push(`${d.sym} ×${tries}`);
  }
  const n = only ? only.length : P.length;
  check('Every experiment can be done', !failed.length, failed.length ? `not done in 3 tries: ${failed.join(' ')}` : `${n} of ${n}${again.length ? ` (took another try: ${again.join(', ')})` : ''}`);
}

if (!only) {
  // ── and nothing earns a star by itself ──
  const quiet = (label, w, syms, ticks = 600) => {
    TryIt.reset();
    for (let k = 0; k < ticks; k++) { w.step(); TryIt.frame(w, w.events); w.resetEvents(); }
    const got = syms.filter((s) => TryIt.has(el(s).id));
    check(label, !got.length, got.length ? `earned: ${got.join(' ')}` : `none of ${syms.join(' ')}`);
  };
  {
    const w = world(); rect(w, 0, 56, 95, 63, ID.WALL);
    const syms = ['Ga', 'Cu', 'Fe', 'Sn', 'Hg', 'Gd', 'Nd', 'W', 'Pd', 'Ru'];
    syms.forEach((s, k) => rect(w, 4 + k * 9, 50, 9 + k * 9, 55, el(s).id));
    quiet('Elements just sitting there earn nothing', w, syms);
  }
  {
    const w = world(); rect(w, 0, 56, 95, 63, ID.WALL); rect(w, 44, 50, 49, 55, ID.EL_U);
    quiet('A small lump of uranium never goes critical', w, ['U'], 1500);
  }
  // the near misses of the build-it experiments
  quiet('Bismuth or tellurium on a battery isn’t thermoelectric', benchOf('current', el('Bi')), ['Bi'], 600);
  quiet('…nor is tellurium', benchOf('current', el('Te')), ['Te'], 600);
  quiet('Lead on a battery, out of acid, is no car battery', benchOf('current', el('Pb')), ['Pb'], 600);
  { // a filament with no bulb: tungsten white-hot in the open air
    const w = world(); rect(w, 0, 56, 95, 63, ID.STONE); rect(w, 32, 37, 64, 37, ID.WALL); rect(w, 35, 36, 61, 36, ID.EL_W);
    w.place(w.idx(34, 36), ID.BATTERY); w.place(w.idx(62, 36), ID.BATTERY);
    TryIt.reset();
    for (let k = 0; k < 600; k++) { for (const i of cellsOf(w, ID.EL_W)) w.temp[i] = Math.max(w.temp[i], 2200); w.step(); TryIt.frame(w, w.events); w.resetEvents(); }
    check('A filament in open air is no light bulb', !TryIt.has(ID.EL_W), TryIt.has(ID.EL_W) ? 'earned' : 'no star without the argon');
  }
  {
    const w = world(); rect(w, 0, 56, 95, 63, ID.WALL); rect(w, 40, 40, 55, 55, ID.EL_U);
    for (let x = 41; x < 56; x += 4) rect(w, x, 40, x, 55, ID.EL_CD);
    quiet('Cadmium rods through a small lump earn nothing', w, ['Cd'], 900);
  }
  {
    const w = world(); rect(w, 0, 56, 95, 63, ID.WALL); rect(w, 31, 22, 64, 55, ID.EL_BE); rect(w, 33, 24, 62, 55, ID.EL_U);
    quiet('Beryllium round a pile that goes critical anyway', w, ['Be'], 600);
  }
  {
    const w = world(320, 200);
    Scenes.electrics(w);
    TryIt.staged(w);
    quiet('A scene’s own set-up earns nothing', w, ['W', 'Ne', 'Co', 'Cr', 'Au', 'Ni', 'Zn', 'Si', 'C', 'Ti'], 900);
  }
  {
    Lab.restore([]);
    TryIt.reset();
    const k = play(benchOf('flame', el('Cu')), ID.EL_CU, 600);
    check('A locked element earns nothing', !k, k ? `copper earned a star at tick ${k}` : 'copper colours the fire, but is still locked');
    Lab.restore(P.map((d) => d.sym));
  }
  {
    TryIt.reset();
    play(benchOf('flame', el('Cu')), ID.EL_CU, 600);
    const saved = mem.tried.join(' ');
    TryIt.init(store);
    check('Stars are saved and loaded', saved === 'Cu' && TryIt.has(ID.EL_CU) && TryIt.count() === 1, `saved "${saved}"`);
  }
  check('Every experiment has a sentence', P.every((d) => TryIt.text(d.id).length > 10), '118 of 118');
}

let fail = 0;
for (const r of out) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.label.padEnd(46)} ${r.detail}`);
}
process.exit(fail ? 1 : 0);
