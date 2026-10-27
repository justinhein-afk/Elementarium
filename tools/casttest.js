// Headless checks for cast metal: each metal's powder, melted and left to cool, sets into its solid
// form (the way its hint says: in the open on a floor of Wall, sealed in argon for tungsten, packed
// into a capsule for magnesium), and the solid forms behave as their metals do.
// Run: node tools/casttest.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
for (const f of ['elements.js', 'periodic.js', 'materials.js', 'sim.js']) {
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
  const how = { Mg: 'capsule', W: 'argon' };
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
{ // a copper block, held up by nothing, carries current from a battery along its length
  const w = world(), cu = el('Cu').castTo;
  rect(w, 30, 30, 65, 31, cu); w.place(w.idx(29, 30), ID.BATTERY);
  let far = 0;
  for (let k = 0; k < 300; k++) { w.step(); w.resetEvents(); if (w.charge[w.idx(65, 31)] > 0) far++; }
  check('A copper block carries current', far > 0 && count(w, cu) === 72, `current reached the far end ${far} times, the bar still in place`);
}
{ // a tungsten block sealed in argon, between two batteries, glows white-hot as a filament and lasts
  const w = world(), wb = el('W').castTo;
  rect(w, 30, 30, 66, 44, ID.GLASS); rect(w, 31, 31, 65, 43, ID.EL_AR);
  rect(w, 35, 37, 61, 37, wb); w.place(w.idx(34, 37), ID.BATTERY); w.place(w.idx(62, 37), ID.BATTERY);
  let hot = 0;
  for (let k = 0; k < 600; k++) { w.step(); w.resetEvents(); for (let i = 0; i < w.N; i++) if (w.type[i] === wb) hot = Math.max(hot, w.temp[i]); }
  check('A tungsten block is a filament', hot >= 1500 && count(w, wb) === 27, `up to ${Math.round(hot)}°C, all 27 cells still there`);
}
{ // an iron block wired to a battery is an electromagnet: it lifts iron filings
  const w = world(), fe = ID.EL_FE, bar = el('Fe').castTo;
  rect(w, 0, 56, 95, 63, ID.STONE); rect(w, 36, 47, 59, 49, bar); w.place(w.idx(35, 48), ID.BATTERY);
  for (let x = 36; x <= 59; x++) w.place(w.idx(x, 55), fe);
  for (let k = 0; k < 600; k++) { w.step(); w.resetEvents(); }
  let lifted = 0; for (let i = 0; i < w.N; i++) if (w.type[i] === fe && ((i / w.SW) | 0) < 54) lifted++;
  check('An iron block with current is an electromagnet', lifted > 24 * 0.5, `${lifted} of 24 iron filings lifted`);
}

let fail = 0;
for (const r of out) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.label.padEnd(46)} ${r.detail}`);
}
process.exit(fail ? 1 : 0);
