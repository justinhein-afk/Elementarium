// Headless checks for the periodic table and the living things.
// Run: node tools/periodictest.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
for (const f of ['elements.js', 'periodic.js', 'materials.js', 'sim.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
}
const { ELEM, Sim } = globalThis;
const ID = ELEM.ID;

function world(W = 160, H = 100) {
  const w = Sim.createWorld(W, H);
  for (const d of ELEM.list) w.disc[d.id] = 1;
  return w;
}
function rect(w, x0, y0, x1, y1, t) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) w.place(w.idx(x, y), t);
}
function count(w, t) {
  let n = 0;
  for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) if (w.type[w.idx(x, y)] === t) n++;
  return n;
}
function meanY(w, t) {
  let s = 0, n = 0;
  for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) if (w.type[w.idx(x, y)] === t) { s += y; n++; }
  return n ? s / n : NaN;
}
function run(w, n, each) {
  const tot = { fission: 0, booms: 0, decay: 0 };
  for (let k = 0; k < n; k++) {
    if (each) each(w, k);
    w.step();
    tot.fission += w.events.fission; tot.booms += w.events.booms.length / 4; tot.decay += w.events.decay;
    w.resetEvents();
  }
  return tot;
}

const out = [];
const check = (label, ok, detail) => out.push({ label, ok, detail });

{ // sodium dropped into water
  const w = world();
  rect(w, 40, 80, 120, 99, ID.WATER);
  rect(w, 78, 30, 82, 34, ID.EL_NA);
  const r = run(w, 400);
  check('Sodium explodes in water', r.booms > 0 && count(w, ID.EL_NA) < 25, `${r.booms} blasts, ${count(w, ID.EL_NA)} Na left, H ${count(w, ID.EL_H)}`);
}
{ // mercury is liquid and spreads; gold sinks in it, lead floats
  const w = world();
  rect(w, 60, 60, 100, 99, ID.WALL); rect(w, 61, 60, 99, 98, ID.EMPTY);
  rect(w, 61, 85, 99, 98, ID.EL_HG);
  rect(w, 70, 70, 72, 72, ID.EL_AU);
  rect(w, 88, 70, 90, 72, ID.EL_PB);
  run(w, 600);
  check('Gold sinks in mercury, lead floats', meanY(w, ID.EL_AU) > meanY(w, ID.EL_PB) + 4,
    `Au mean y ${meanY(w, ID.EL_AU).toFixed(1)}, Pb mean y ${meanY(w, ID.EL_PB).toFixed(1)}`);
}
{ // hydrogen rises, xenon sinks
  const w = world();
  rect(w, 30, 45, 40, 55, ID.EL_H);
  rect(w, 120, 45, 130, 55, ID.EL_XE);
  run(w, 400);
  check('Hydrogen rises, xenon sinks', meanY(w, ID.EL_H) < 35 && meanY(w, ID.EL_XE) > 65,
    `H mean y ${meanY(w, ID.EL_H).toFixed(1)}, Xe mean y ${meanY(w, ID.EL_XE).toFixed(1)} (started at 50)`);
}
{ // gallium melts just above room temperature: warmed to 35°C it flows out of its block
  const w = world();
  rect(w, 70, 80, 80, 99, ID.EL_GA);
  for (let y = 80; y <= 99; y++) for (let x = 70; x <= 80; x++) w.temp[w.idx(x, y)] = 35;
  const cold = world();
  rect(cold, 70, 80, 80, 99, ID.EL_GA);
  run(w, 150); run(cold, 150);
  // a liquid levels out flat; a pile of solid granules keeps a peak
  const top = (ww) => { for (let y = 0; y < 100; y++) for (let x = 0; x < 160; x++) if (ww.type[ww.idx(x, y)] === ID.EL_GA) return y; return 100; };
  check('Gallium levels out at 35°C, piles at 20°C', top(w) > top(cold) + 5, `surface at y ${top(w)} warm, peak at y ${top(cold)} cold`);
}
{ // a big lump of uranium goes critical; a small one doesn't
  const big = world(); rect(big, 60, 40, 90, 70, ID.EL_U);
  const rb = run(big, 3000);
  const small = world(); rect(small, 78, 48, 81, 51, ID.EL_U);
  const rs = run(small, 3000);
  check('Big uranium block goes critical', rb.fission > 200, `${rb.fission} fissions`);
  check('Small uranium lump stays subcritical', rs.fission < 10, `${rs.fission} fissions`);
}
{ // control rods
  const w = world();
  rect(w, 60, 40, 90, 70, ID.EL_U);
  for (let x = 62; x <= 90; x += 4) rect(w, x, 40, x, 70, ID.EL_CD);
  const r = run(w, 3000);
  check('Cadmium rods hold the same block back', r.fission < 200, `${r.fission} fissions`);
}
{ // superheavy decay chain
  const w = world();
  rect(w, 70, 60, 79, 69, ID.EL_OG);
  const r = run(w, 1500);
  check('Oganesson decays down the chain', count(w, ID.EL_OG) === 0 && r.decay > 100,
    `${r.decay} decays, He made: ${count(w, ID.EL_HE)}`);
}
{ // chlorine + sodium = salt
  const w = world();
  rect(w, 60, 90, 100, 99, ID.EL_NA);
  rect(w, 60, 60, 100, 80, ID.EL_CL);
  run(w, 600);
  check('Chlorine + sodium makes salt', count(w, ID.SALT) > 20, `${count(w, ID.SALT)} salt`);
}
{ // neon lights up when a battery pushes current through it
  const w = world();
  rect(w, 60, 50, 100, 52, ID.GLASS); rect(w, 60, 56, 100, 58, ID.GLASS);
  rect(w, 60, 53, 60, 55, ID.GLASS); rect(w, 100, 53, 100, 55, ID.GLASS);
  rect(w, 61, 53, 99, 55, ID.EL_NE);
  w.place(w.idx(60, 54), ID.BATTERY);
  let lit = 0;
  run(w, 200, (ww) => { for (let x = 61; x < 100; x++) if (ww.charge[ww.idx(x, 54)]) lit++; });
  check('Neon conducts and glows', lit > 50, `${lit} lit cell-ticks`);
}
{ // humans live, walk and flee
  const w = world(200, 100);
  rect(w, 0, 85, 199, 99, ID.DIRT);
  for (let x = 20; x < 180; x += 20) { w.place(w.idx(x, 84), ID.HUMAN); w.place(w.idx(x, 83), ID.HEAD); }
  const before = [];
  for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) if (w.type[w.idx(x, y)] === ID.HUMAN) before.push(x);
  run(w, 1500);
  const alive = count(w, ID.HUMAN), heads = count(w, ID.HEAD);
  const after = [];
  for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) if (w.type[w.idx(x, y)] === ID.HUMAN) after.push(x);
  const moved = after.filter((x, k) => before[k] !== x).length;
  check('Humans survive and walk', alive >= 8 && alive === heads && moved > 3, `${alive} humans, ${heads} heads, ${moved} moved`);

  rect(w, 95, 70, 105, 84, ID.FIRE);
  let near = 0;
  // count while the fire still burns (a few dozen ticks), not after it has gone out
  run(w, 45, (ww, k) => {
    if (k === 44) for (let y = 70; y < 86; y++) for (let x = 89; x < 112; x++) if (ww.type[ww.idx(x, y)] === ID.HUMAN) near++;
  });
  check('Humans flee fire', near <= 2, `${near} humans still within 6 cells of the fire`);
}
{ // ants dig and build hills
  const w = world();
  rect(w, 0, 70, 159, 99, ID.DIRT);
  for (let x = 40; x < 120; x += 5) w.place(w.idx(x, 69), ID.ANT);
  run(w, 8000);
  let above = 0;
  for (let y = 0; y < 70; y++) for (let x = 0; x < 160; x++) if (w.type[w.idx(x, y)] === ID.DIRT) above++;
  let holes = 0;
  for (let y = 71; y < 100; y++) for (let x = 0; x < 160; x++) if (w.type[w.idx(x, y)] === ID.EMPTY) holes++;
  check('Ants dig tunnels and pile anthills', above > 20 && holes > 8, `${above} dirt above ground, ${holes} tunnel cells, ${count(w, ID.ANT)} ants`);
}
{ // birds stay airborne
  const w = world();
  rect(w, 0, 90, 159, 99, ID.DIRT);
  for (let x = 20; x < 140; x += 20) w.place(w.idx(x, 40), ID.BIRD);
  run(w, 1500);
  check('Birds keep flying', count(w, ID.BIRD) >= 5 && meanY(w, ID.BIRD) < 85, `${count(w, ID.BIRD)} birds, mean y ${meanY(w, ID.BIRD).toFixed(1)}`);
}

let fail = 0;
for (const r of out) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.label.padEnd(40)} ${r.detail}`);
}
process.exit(fail ? 1 : 0);
