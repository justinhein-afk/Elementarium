// Headless checks for the air field and momentum: blasts throw things and blow gas outward,
// a falling mass of water surges along the ground and crashes against what it meets, the air
// settles afterwards, and snapshots and saves carry the motion with them.
// The "before" figures in the comments are what the engine did before momentum existed.
// Run: node tools/airtest.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', 'js');
for (const f of ['elements.js', 'periodic.js', 'materials.js', 'sim.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
}
const { ELEM, Sim } = globalThis;
const ID = ELEM.ID;

function rect(w, x0, y0, x1, y1, t) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) w.place(w.idx(x, y), t);
}
function run(w, n, each) { for (let k = 0; k < n; k++) { if (each) each(w, k); w.step(); w.resetEvents(); } }
function cells(w, t) {
  const out = [];
  for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) if (w.type[w.idx(x, y)] === t) out.push([x, y]);
  return out;
}
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const TRIALS = 3;

const out = [];
function check(label, ok, detail) { out.push({ label, ok, detail }); }

// A bomb beside a heap of sand throws the heap sideways.
// Before: the farthest grain moved +10 cells and none went more than 10.
{
  const far = [], thrown = [];
  for (let k = 0; k < TRIALS; k++) {
    const w = Sim.createWorld(240, 100);
    rect(w, 0, 90, 239, 99, ID.STONE);
    rect(w, 104, 82, 113, 89, ID.SAND);
    w.explode(100, 88, 4, 0.9);
    run(w, 150);
    const dx = cells(w, ID.SAND).map(([x]) => x - 108.5);
    far.push(Math.max(...dx));
    thrown.push(dx.filter((d) => Math.abs(d) > 10).length / dx.length);
  }
  check('A bomb throws sand sideways', Math.min(...far) >= 18 && mean(thrown) >= 0.06,
    `farthest grain +${far.join(', +')} cells; ${Math.round(mean(thrown) * 100)}% thrown over 10 cells (before: +10, 0%)`);
}

// A blast's pressure wave blows a ring of smoke outward.
// Before: the smoke's mean distance from the blast went 22 → 26 in 20 ticks.
{
  const r = [];
  for (let k = 0; k < TRIALS; k++) {
    const w = Sim.createWorld(200, 120);
    for (let y = 30; y < 90; y += 2) for (let x = 50; x < 150; x += 2) {
      const d = Math.hypot(x - 100, y - 60);
      if (d > 12 && d < 30) w.place(w.idx(x, y), ID.SMOKE);
    }
    w.explode(100, 60, 4, 0.9);
    run(w, 20);
    r.push(mean(cells(w, ID.SMOKE).map(([x, y]) => Math.hypot(x - 100, y - 60))));
  }
  check('A blast blows smoke outward', mean(r) >= 32, `mean distance 22 → ${mean(r).toFixed(1)} (before: 26)`);
}

// A column of water dropped against the left wall surges right along the floor.
// Before: 80 ticks after release the water's centroid was at x = 61 and its 75th percentile at 94.
{
  const cx = [], p75 = [];
  for (let k = 0; k < TRIALS; k++) {
    const w = Sim.createWorld(320, 120);
    rect(w, 0, 112, 319, 119, ID.STONE);
    rect(w, 0, 10, 29, 60, ID.WATER);
    run(w, 80);
    const xs = cells(w, ID.WATER).map(([x]) => x).sort((a, b) => a - b);
    cx.push(mean(xs)); p75.push(xs[(xs.length * 0.75) | 0]);
  }
  check('Released water travels further sideways', mean(cx) >= 80 && mean(p75) >= 115,
    `centroid x ${cx.map((v) => v.toFixed(0)).join(', ')}; 75th percentile ${p75.join(', ')} (before: 61, 94)`);
}

// The same surge crashes into a wall 120 cells away and throws water up it: count the water
// above y = 100 (the level it settles to is about 102) within 15 cells of the wall, every tick.
// Before: 0 to 9 such cell-ticks over 240 ticks; the water only ever pooled against the wall.
{
  const high = [];
  for (let k = 0; k < TRIALS; k++) {
    const w = Sim.createWorld(320, 120);
    rect(w, 0, 112, 319, 119, ID.STONE);
    rect(w, 150, 80, 152, 111, ID.WALL);
    rect(w, 0, 10, 29, 60, ID.WATER);
    let n = 0;
    run(w, 240, (ww) => {
      for (let y = 0; y < 100; y++) for (let x = 135; x < 150; x++) if (ww.type[ww.idx(x, y)] === ID.WATER) n++;
    });
    high.push(n);
  }
  check('A surge splashes up the wall it hits', Math.min(...high) >= 25, `water thrown up the wall: ${high.join(', ')} cell-ticks (before: at most 9)`);
}

// A blast's pressure pushes any liquid, in inverse proportion to its density: the same pulse
// shoves oil hardest, then water, then bromine, and barely stirs mercury.
{
  const top = {};
  for (const k of ['OIL', 'WATER', 'EL_BR', 'EL_HG']) {
    top[k] = 0;
    for (let n = 0; n < TRIALS; n++) {
      const w = Sim.createWorld(200, 100);
      for (const d of ELEM.list) w.disc[d.id] = 1;
      rect(w, 0, 90, 199, 99, ID.STONE); rect(w, 30, 70, 170, 89, ID[k]);
      rect(w, 28, 60, 29, 89, ID.WALL); rect(w, 171, 60, 172, 89, ID.WALL); // a tank, so every pool's surface is level
      run(w, 30);
      w.explode(100, 58, 5, 1.1); // 12 cells up: out of the blast's direct reach, only its pressure gets there
      let v = 0;
      run(w, 30, (ww) => { for (let y = 60; y < 90; y++) for (let x = 30; x <= 170; x++) { const i = ww.idx(x, y); if (ww.type[i] === ID[k]) v = Math.max(v, Math.abs(ww.vx[i])); } });
      top[k] += v / TRIALS;
    }
  }
  const f = (k) => top[k].toFixed(2);
  check('Pressure pushes liquids by their density', top.OIL > top.WATER && top.WATER > top.EL_BR && top.EL_BR > top.EL_HG && top.WATER >= 0.8 && top.EL_HG < 0.3,
    `top speed after a blast overhead: oil ${f('OIL')}, water ${f('WATER')}, bromine ${f('EL_BR')}, mercury ${f('EL_HG')} cells/tick`);
}

// The gentle pressure of hot air rising doesn't stir a pond, even beside a big fire.
{
  const w = Sim.createWorld(200, 100);
  for (const d of ELEM.list) w.disc[d.id] = 1;
  rect(w, 0, 90, 199, 99, ID.STONE); rect(w, 20, 70, 90, 89, ID.WATER); rect(w, 91, 60, 92, 89, ID.STONE);
  rect(w, 93, 80, 180, 89, ID.WOOD); rect(w, 93, 60, 180, 79, ID.OIL);
  for (let x = 93; x <= 180; x += 4) w.ignite(w.idx(x, 60));
  let stir = 0;
  run(w, 1200, (ww, k) => {
    if (k < 200) return;
    for (let y = 60; y < 90; y++) for (let x = 20; x <= 90; x++) { const i = ww.idx(x, y); if (ww.type[i] === ID.WATER) stir = Math.max(stir, Math.abs(ww.vx[i])); }
  });
  check('A fire beside a pond leaves it still', stir === 0, `fastest the pond moved: ${stir.toFixed(2)} cells/tick (${w.counts[ID.FIRE]} fire cells burning at the end)`);
}

// Water poured into a basin settles: no endless sloshing.
{
  const w = Sim.createWorld(160, 100);
  rect(w, 0, 90, 159, 99, ID.STONE); rect(w, 40, 60, 41, 89, ID.STONE); rect(w, 120, 60, 121, 89, ID.STONE);
  rect(w, 50, 10, 70, 40, ID.WATER);
  run(w, 400);
  const moving = cells(w, ID.WATER).filter(([x, y]) => w.vx[w.idx(x, y)] !== 0).length;
  check('Poured water comes to rest', moving === 0, `${moving} water cells still moving sideways after 400 ticks`);
}

// After a blast the air calms down again.
{
  const w = Sim.createWorld(240, 160);
  w.explode(120, 80, 5, 1.1);
  const A = w.air;
  let peak = 0, calm = -1;
  for (let k = 1; k <= 600 && calm < 0; k++) {
    run(w, 1);
    let v = 0;
    for (let a = 0; a < A.W * A.H; a++) v = Math.max(v, Math.abs(A.vx[a]) + Math.abs(A.vy[a]), Math.abs(A.p[a]) * 0.1);
    peak = Math.max(peak, v);
    if (k > 5 && v < 0.05) calm = k;
  }
  check('The air settles after a blast', peak > 2 && calm > 0 && calm <= 400, `peak wind ${peak.toFixed(1)}, still by tick ${calm}`);
}

// Heat lifts the air above it.
{
  const w = Sim.createWorld(160, 100);
  rect(w, 0, 90, 159, 99, ID.STONE);
  run(w, 120, (ww) => rect(ww, 70, 88, 89, 89, ID.FIRE));
  const A = w.air, ax = Math.floor(80 / A.S);
  let up = 0;
  for (let ay = 10; ay < Math.floor(88 / A.S); ay++) up = Math.min(up, A.vy[ay * A.W + ax]);
  check('Hot air rises over a fire', up < -0.2, `strongest updraft ${up.toFixed(2)} cells/tick`);
}

// Undo snapshots and saves keep the motion; an old save (no velocities) loads at rest.
{
  const w = Sim.createWorld(120, 80);
  rect(w, 0, 70, 119, 79, ID.STONE);
  rect(w, 40, 40, 70, 69, ID.SAND);
  w.explode(55, 55, 5, 1.1);
  run(w, 3);
  const sig = (ww) => {
    let m = 0, a = 0;
    for (let i = 0; i < ww.N; i++) m += Math.abs(ww.vx[i]) + Math.abs(ww.vy[i]);
    for (let k = 0; k < ww.air.W * ww.air.H; k++) a += Math.abs(ww.air.vx[k]) + Math.abs(ww.air.p[k]);
    return [m, a];
  };
  const [m0, a0] = sig(w);
  const snap = w.snapshot();
  const save = JSON.parse(JSON.stringify(w.serialize()));
  run(w, 200);
  w.restore(snap);
  const [m1, a1] = sig(w);
  check('Snapshots carry velocity and air', m0 > 20 && a0 > 5 && m1 === m0 && a1 === a0, `motion ${m0.toFixed(0)} → ${m1.toFixed(0)}, air ${a0.toFixed(0)} → ${a1.toFixed(0)}`);

  const w2 = Sim.createWorld(120, 80);
  w2.load(save);
  const [m2, a2] = sig(w2);
  check('Saves carry velocity and air', Math.abs(m2 - m0) / m0 < 0.02 && Math.abs(a2 - a0) / a0 < 0.02, `motion ${m2.toFixed(0)} of ${m0.toFixed(0)}, air ${a2.toFixed(0)} of ${a0.toFixed(0)}`);

  const old = { ...save, v: 2 };
  delete old.vx; delete old.vy; delete old.air;
  const w3 = Sim.createWorld(120, 80);
  w3.place(w3.idx(5, 5), ID.SAND); w3.vx[w3.idx(5, 5)] = 3; // leftovers a load must clear
  w3.load(old);
  const [m3, a3] = sig(w3);
  check('Old saves load at rest', m3 === 0 && a3 === 0 && cells(w3, ID.SAND).length === cells(w2, ID.SAND).length, `motion ${m3}, air ${a3}`);
}

let fail = 0;
for (const r of out) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.label.padEnd(40)} ${r.detail}`);
}
process.exit(fail ? 1 : 0);
