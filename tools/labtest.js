// Headless checks for the Lab: the locked periodic table, research spreading to table neighbours,
// mystery samples that can always be solved, the test tubes, and elements found in the wild.
// Run: node tools/labtest.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
for (const f of ['elements.js', 'periodic.js', 'materials.js', 'sim.js', 'scenes.js', 'facts.js', 'lab.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
}
const { ELEM, Sim, Lab, Scenes, FACTS } = globalThis;
const { ID } = ELEM;
const P = ELEM.periodic;
const el = (sym) => P.find((d) => d.sym === sym);
const syms = (ds) => ds.map((d) => d.sym).join(' ');

const out = [];
const check = (label, ok, detail) => out.push({ label, ok, detail });
const mem = {};
const store = { get: (k, d) => (k in mem ? mem[k] : d), set: (k, v) => { mem[k] = v; } };
// a seeded Math.random, so a test can build the same world twice
function seeded(s) {
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ── the locked table ──
Lab.init(store);
check('Only hydrogen and helium are open at first', Lab.count() === 2 && Lab.has(ID.EL_H) && Lab.has(ID.EL_HE), `${Lab.count()} open`);
check('Lithium and neon are the first ready', syms(Lab.readyList()) === 'Li Ne', syms(Lab.readyList()));
{
  let waves = 0;
  while (Lab.readyList().length) { for (const d of Lab.readyList()) Lab.unlock(d.id); waves++; }
  check('Research through neighbours reaches all 118', Lab.count() === 118, `${Lab.count()} in ${waves} waves`);
}
{
  Lab.restore(['Ba']);
  const viaBa = Lab.ready(ID.EL_LA);
  Lab.restore(['Rf']);
  check('The f-block joins the table in group 3', viaBa && Lab.ready(ID.EL_AC) && !Lab.ready(ID.EL_LA), 'La via Ba, Ac via Rf');
}
{
  Lab.reset();
  Lab.unlock(ID.EL_LI);
  const saved = mem.periodic.join(' ');
  Lab.restore([]);
  Lab.init(store);
  check('Progress is saved and loaded', saved === 'Li' && Lab.has(ID.EL_LI) && Lab.count() === 3, `saved "${saved}", ${Lab.count()} open after loading`);
  Lab.reset();
  check('Reset locks it all again', Lab.count() === 2 && mem.periodic.length === 0, `${Lab.count()} open`);
}

// ── what it teaches ──
check('Every element has a fact card', P.every((d) => FACTS.FACTS[d.sym] && FACTS.FACTS[d.sym].length === 4),
  P.filter((d) => !FACTS.FACTS[d.sym]).map((d) => d.sym).join(' ') || 'all 118');
check('Every family has a card', Object.keys(ELEM.FAMILY).every((f) => FACTS.FAMILY_NOTES[f]), `${Object.keys(FACTS.FAMILY_NOTES).length} families`);
check('Every flame colour has a name', P.filter((d) => d.flameColor).every((d) => Lab.result('flame', d).why === 'flame:colour'),
  P.filter((d) => d.flameColor && Lab.result('flame', d).why !== 'flame:colour').map((d) => d.sym).join(' ') || 'all named');
check('Every result has a reason', P.every((d) => Lab.TESTS.every((k) => Lab.why(Lab.result(k, d).why))), 'all 7 tests × 118');
check('Readings match the real data', Lab.result('heat', el('K')).text.includes('63.5°C') && Lab.result('weigh', el('Au')).short === '19.3 g/cm³'
  && Lab.result('heat', el('N')).text.includes('−195.8°C') && Lab.band('water', el('Na')) === 'explodes' && Lab.band('acid', el('Au')) === 'resists',
  `K ${Lab.result('heat', el('K')).short}, Au ${Lab.result('weigh', el('Au')).short}, N ${Lab.result('heat', el('N')).short}`);

// ── mystery samples ──
{
  Lab.restore(P.filter((d) => d.z <= 40).map((d) => d.sym));
  const bad = [];
  for (const d of P) {
    const s = Lab.makeSample(Math.random, d), others = s.candidates.filter((c) => c !== d);
    const settles = s.need.tests.length && others.every((o) => s.need.tests.some((k) => Lab.band(k, o) !== Lab.band(k, d)));
    if (!s.candidates.includes(d) || new Set(s.candidates).size !== s.candidates.length || s.candidates.length < 3 || !(s.need.n <= Lab.TEST_BUDGET) || !settles) bad.push(d.sym);
  }
  check('Every element makes a solvable sample', !bad.length, bad.join(' ') || '118 of 118, each settled in 3 tests or fewer');
}
{
  Lab.reset();
  const phase = { early: [], later: [] };
  let s, n = 0;
  while ((s = Lab.makeSample())) {
    (Lab.identified() < Lab.EASY_UNTIL ? phase.early : phase.later).push(s);
    Lab.unlock(s.target.id);
    if (++n > 200) break;
  }
  const two = phase.later.filter((x) => x.need.n >= 2).length;
  check('A playthrough identifies every element', Lab.count() === 118, `${n} samples`);
  check('The first samples are gentle', phase.early.every((x) => x.candidates.length === 3 && x.need.n === 1), `${phase.early.length} samples of 3 candidates, one test each`);
  check('Later samples often take two tests', phase.later.every((x) => x.candidates.length === 4) && two >= phase.later.length * 0.2,
    `${two} of ${phase.later.length} need two tests`);
  Lab.reset();
}

// ── the test tubes ──
function runBench(test, sym, each) {
  const b = Lab.bench(test, el(sym));
  const tot = { booms: 0, fizz: 0 };
  while (!b.done) {
    b.step();
    if (each) each(b.world);
    b.flush((ev) => { tot.booms += ev.booms.length / 4; tot.fizz += ev.fizz; });
  }
  tot.reading = b.reading();
  return tot;
}
const cells = (w, pred) => { let n = 0; for (let i = 0; i < w.N; i++) if (pred(i, w.type[i])) n++; return n; };
{
  const na = runBench('water', 'Na'), fe = runBench('water', 'Fe');
  check('Sodium explodes in the water tube', na.booms > 0, `${na.booms} booms (iron: ${fe.booms})`);
  check('…and iron does nothing', fe.booms === 0, `${fe.booms} booms`);
  let h = 0;
  const ca = runBench('water', 'Ca', (w) => { h = Math.max(h, cells(w, (i, t) => t === ID.EL_H)); });
  check('Calcium fizzes hydrogen', h > 0 && ca.booms === 0, `up to ${h} hydrogen bubbles, ${ca.booms} booms`);
}
{
  let cu = 0, plain = 0;
  runBench('flame', 'Cu', (w) => { cu += cells(w, (i, t) => t === ID.FIRE && w.aux[i] === ID.EL_CU); });
  runBench('flame', 'Fe', (w) => { plain += cells(w, (i, t) => t === ID.FIRE && w.aux[i] !== 0); });
  check('Copper colours the flame tube', cu > 200, `${cu} copper-tinted fire cell-ticks`);
  check('…and iron leaves it orange', plain === 0, `${plain} tinted`);
}
{
  let ne = 0, h = 0;
  runBench('current', 'Ne', (w) => { ne += cells(w, (i, t) => t === ID.EL_NE && w.charge[i] > 0); });
  runBench('current', 'H', (w) => { h += cells(w, (i, t) => t === ID.EL_H && w.charge[i] > 0); });
  check('Neon glows in the current tube', ne > 200, `${ne} live neon cell-ticks`);
  check('…and hydrogen carries nothing', h === 0, `${h} live`);
}
{
  const u = runBench('geiger', 'U'), fe = runBench('geiger', 'Fe'), og = runBench('geiger', 'Og');
  check('The Geiger counter clicks at uranium', /[1-9]\d* click/.test(u.reading), u.reading);
  check('…crackles at oganesson, silent at iron', /\d+ click/.test(og.reading) && parseInt(og.reading.match(/(\d+) click/)[1], 10) > 10 && / 0 clicks/.test(fe.reading), `${og.reading}; ${fe.reading}`);
}
{
  let burnt = 0, left = 0;
  const b = Lab.bench('heat', el('P'));
  while (!b.done) { b.step(); b.flush(); burnt = Math.max(burnt, cells(b.world, (i, t) => t === ID.FIRE || (t === ID.EL_P && (b.world.flags[i] & 1)))); }
  left = cells(b.world, (i, t) => t === ID.EL_P);
  check('Phosphorus melts in its capsule without burning', burnt === 0 && left > 50, `${burnt} burning, ${left} grains left, ${b.reading()}`);
  const n = Lab.bench('heat', el('N'));
  const y = (w) => { let s = 0, c = 0; for (let i = 0; i < w.N; i++) if (w.type[i] === ID.EL_N) { s += Math.floor(i / w.W); c++; } return s / c; };
  const y0 = y(n.world);
  while (!n.done) { n.step(); n.flush(); }
  check('Nitrogen cooled liquefies and pools', y(n.world) > y0 + 3, `average row ${y0.toFixed(1)} → ${y(n.world).toFixed(1)}, ${n.reading()}`);
}
{
  let errors = 0;
  for (const test of [...Lab.TESTS, 'idle']) for (const d of P) {
    try { const b = Lab.bench(test, d); for (let k = 0; k < 40; k++) { b.step(); b.flush(); } } catch (e) { errors++; if (errors < 4) console.log(test, d.sym, e.message); }
  }
  check('Every test runs for every element', errors === 0, `${8 * 118} tubes, ${errors} errors`);
}
{ // a test tube is a world of its own: running one between a world's ticks changes nothing in it
  const real = Math.random;
  const build = () => {
    Math.random = seeded(7);
    const w = Sim.createWorld(160, 100);
    w.disc.fill(1);
    for (let x = 0; x < 160; x++) for (let y = 70; y < 100; y++) w.place(w.idx(x, y), y < 80 ? ID.WATER : ID.SAND);
    for (let x = 60; x < 100; x++) for (let y = 50; y < 60; y++) w.place(w.idx(x, y), ID.WOOD);
    for (let x = 60; x < 100; x++) w.ignite(w.idx(x, 50));
    for (let x = 20; x < 30; x++) w.place(w.idx(x, 60), ID.EL_NA);
    Math.random = real;
    return w;
  };
  const a = build(), b = build();
  for (let k = 0; k < 120; k++) a.step();
  for (let k = 0; k < 60; k++) b.step();
  for (const test of ['water', 'flame', 'heat']) runBench(test, 'K');
  for (let k = 0; k < 60; k++) b.step();
  let diff = 0;
  for (let i = 0; i < a.N; i++) if (a.type[i] !== b.type[i] || a.temp[i] !== b.temp[i]) diff++;
  check('A test tube never touches the main world', diff === 0, `${diff} cells differ after three test tubes ran mid-way`);
}

// ── found in the wild ──
{
  Lab.reset();
  const w = Sim.createWorld(120, 80);
  for (const d of ELEM.list) w.disc[d.id] = 1;
  for (const d of P) if (!Lab.has(d.id)) w.disc[d.id] = 0; // as ui.js sets it: locked elements can be found
  for (let x = 30; x < 90; x++) for (let y = 30; y < 50; y++) w.place(w.idx(x, y), ID.EL_RN);
  const found = new Set();
  for (let k = 0; k < 600 && !found.has(ID.EL_PO); k++) {
    w.step();
    for (let j = 0; j < w.events.found.length; j += 3) if (Lab.unlock(w.events.found[j])) found.add(w.events.found[j]);
    w.resetEvents();
  }
  check('Radon decaying unlocks polonium', found.has(ID.EL_PO) && Lab.has(ID.EL_PO), [...found].map((t) => ELEM.list[t].sym).join(' ') || 'nothing found');
  Lab.reset();
}

// ── scenes ──
{
  const needs = Lab.sceneNeeds(Scenes);
  const show = (n) => (needs[n] || []).map((t) => ELEM.list[t].sym).join(' ');
  check('Scenes with periodic elements need them', show('reactor') === 'Cd U' && show('lamps').includes('Ne') && !needs.island && !needs.village,
    `reactor: ${show('reactor')} · lamps: ${show('lamps')} · magnets: ${show('magnets')}`);
}

let fail = 0;
for (const r of out) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.label.padEnd(46)} ${r.detail}`);
}
process.exit(fail ? 1 : 0);
