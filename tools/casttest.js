// Headless checks for cast metal: each metal's powder, melted and left to cool, sets into its solid
// form (the way its hint says: in the open on a floor of Wall, sealed in argon for tungsten and
// molybdenum, packed into a capsule for magnesium), and the solid forms behave as their metals do.
// Run: node tools/casttest.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
for (const f of ['elements.js', 'periodic.js', 'sim.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
}
const { ELEM, Sim } = globalThis;
const { ID, list } = ELEM;
const P = ELEM.periodic;
const el = (s) => P.find((d) => d.sym === s);

const out = [];
const check = (label, ok, detail) => out.push({ label, ok, detail });
function world(W = 96, H = 64) { const w = Sim.createWorld(W, H); w.disc.fill(1); return w; }
const rect = (w, x0, y0, x1, y1, t) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) w.place(w.idx(x, y), t); };
const count = (w, t) => { let n = 0; for (let i = 0; i < w.N; i++) if (w.type[i] === t) n++; return n; };

// Melt a heap with the Heat tool, then cool it with the Cool tool; returns the solid grains made,
// and whether the casting was reported as a discovery.
function cast(p, how) {
  const t = p.id, s = p.castTo, w = world();
  w.disc[s] = 0;
  if (how === 'capsule') { rect(w, 38, 46, 57, 57, ID.WALL); rect(w, 39, 47, 56, 56, t); }
  else {
    rect(w, 30, 36, 65, 57, ID.WALL); rect(w, 31, 37, 64, 56, how === 'argon' ? ID.EL_AR : ID.EMPTY);
    if (how !== 'argon') rect(w, 31, 30, 64, 36, ID.EMPTY);
    rect(w, 40, 50, 55, 56, t);
  }
  let melted = -1, found = false;
  for (let k = 0; k < 3000; k++) {
    if (k % 5 === 0) {
      let liq = 0;
      for (let i = 0; i < w.N; i++) if (w.type[i] === t && w.temp[i] >= p.mp) liq++;
      if (melted < 0 && liq > 70) melted = k;
      if (melted >= 0 && count(w, s) > 70) return { solid: count(w, s), found };
    }
    if (melted < 0) w.heat(47, 52, 9, 35); else if (k > melted + 40) w.heat(47, 52, 10, -40);
    w.step();
    for (let j = 0; j < w.events.found.length; j += 3) if (w.events.found[j] === s) found = true;
    w.resetEvents();
  }
  return { solid: count(w, s), found };
}

const castable = P.filter((d) => d.castTo);
{
  const how = { Mg: 'capsule', W: 'argon', Mo: 'argon' };
  const bad = [];
  // most of the heap is enough: red-hot iron in open air throws a few sparks and burns to rust, and
  // chance can go against a run, so each metal gets a second try
  for (const p of castable) {
    let r = cast(p, how[p.sym] || 'air');
    if (r.solid < 60 || !r.found) r = cast(p, how[p.sym] || 'air');
    if (r.solid < 60 || !r.found) bad.push(`${p.sym} (${r.solid} solid${r.found ? '' : ', not discovered'})`);
  }
  check('Every metal casts the way its hint says', !bad.length, bad.length ? bad.join(', ') : `${castable.length} of ${castable.length}, each discovered as it set`);
}
{
  const mg = cast(el('Mg'), 'air'), w = cast(el('W'), 'air');
  check('Magnesium in open air burns before it casts', mg.solid < 10, `${mg.solid} solid grains`);
  check('…and tungsten in air burns away', w.solid < 10, `${w.solid} solid grains`);
}
{ // powder heated short of its melting point stays powder
  const w = world(), au = el('Au');
  rect(w, 0, 56, 95, 63, ID.WALL); rect(w, 40, 50, 55, 55, au.id);
  for (let k = 0; k < 400; k++) { if (k < 200) for (let i = 0; i < w.N; i++) if (w.type[i] === au.id) w.temp[i] = 1000; w.step(); w.resetEvents(); }
  for (let k = 0; k < 1500; k++) { w.step(); w.resetEvents(); }
  check('Powder that never melted stays powder', count(w, au.castTo) === 0 && count(w, au.id) === 96, `${count(w, au.id)} gold grains, ${count(w, au.castTo)} solid`);
}
{ // a block stands in mid-air, melts back into liquid metal, and sets again
  const w = world(), au = el('Au'), s = au.castTo;
  rect(w, 40, 20, 50, 25, s);
  for (let k = 0; k < 300; k++) { w.step(); w.resetEvents(); }
  const stood = count(w, s) === 66 && w.type[w.idx(45, 20)] === s;
  let liquid = 0;
  for (let k = 0; k < 300; k++) { w.heat(45, 22, 8, 40); w.step(); w.resetEvents(); liquid = Math.max(liquid, count(w, au.id)); }
  for (let k = 0; k < 3000 && count(w, au.id); k++) { w.step(); w.resetEvents(); }
  check('A solid block stands in mid-air', stood, `${count(w, s)} cells`);
  check('…melts back into liquid metal and sets again', liquid > 10 && count(w, au.id) <= 2 && count(w, s) > 50, `up to ${liquid} liquid, then ${count(w, s)} solid, ${count(w, au.id)} stray grains`);
}
{
  const ok = castable.every((p) => { const s = list[p.castTo]; return s.castOf === p.id && s.hi[1] === p.id && s.hi[0] === p.mp && s.group === 'Solids' && s.fromIds[0] === p.id; });
  check('Every solid melts into its own metal', ok, `${castable.length} solids, each in the Solids group`);
}
// ── the solid forms do what their metals do ──
{ // a neodymium block, held up by nothing (no shelf, as magnettest's powder needs), lifts iron filings
  const w = world(), nd = el('Nd').castTo, fe = ID.EL_FE;
  rect(w, 0, 56, 95, 63, ID.STONE); rect(w, 39, 45, 55, 49, nd);
  for (let x = 37; x <= 57; x++) w.place(w.idx(x, 55), fe);
  for (let k = 0; k < 600; k++) { w.step(); w.resetEvents(); }
  let lifted = 0; for (let i = 0; i < w.N; i++) if (w.type[i] === fe && ((i / w.SW) | 0) < 54) lifted++;
  check('A neodymium block is a magnet', lifted > 21 * 0.7 && count(w, nd) === 85, `${lifted} of 21 iron filings lifted, the magnet still in place`);
}
{ // a slab of silicon under open sky makes current
  const w = world(), si = el('Si').castTo;
  rect(w, 0, 56, 95, 63, ID.STONE); rect(w, 30, 50, 65, 50, si);
  let live = 0;
  for (let k = 0; k < 300; k++) { w.step(); w.resetEvents(); for (let i = 0; i < w.N; i++) if (w.type[i] === si && w.charge[i] > 0) live++; }
  check('A silicon slab is a solar panel', live > 0, `${live} live cell-ticks`);
}
{ // a big block of uranium goes critical like a heap
  const w = world(), u = el('U').castTo;
  rect(w, 0, 56, 95, 63, ID.WALL); rect(w, 33, 24, 62, 55, u);
  let fission = 0;
  for (let k = 0; k < 600; k++) { w.step(); fission += w.events.fission; w.resetEvents(); }
  check('A uranium block still splits', fission > 20, `${fission} fissions`);
}

let fail = 0;
for (const r of out) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.label.padEnd(46)} ${r.detail}`);
}
process.exit(fail ? 1 : 0);
