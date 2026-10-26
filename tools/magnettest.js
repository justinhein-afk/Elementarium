// Headless checks for magnetism: permanent magnets, Curie points, electromagnets, bismuth and
// liquid oxygen, and the Magnet tool switched to Magnetic.
// Run: node tools/magnettest.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
for (const f of ['elements.js', 'periodic.js', 'sim.js']) {
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
const temps = (w, t, T) => { for (let i = 0; i < w.N; i++) if (w.type[i] === t) w.temp[i] = T; };
const run = (w, n, each) => { for (let k = 0; k < n; k++) { if (each) each(w, k); w.step(); w.resetEvents(); } };
const rowOf = (w, i) => ((i / w.SW) | 0) - 1;
const colOf = (w, i) => (i % w.SW) - 1;
// how many of type t sit above the floor row (y < 94), i.e. have been lifted
function lifted(w, t) {
  let up = 0, all = 0;
  for (let i = 0; i < w.N; i++) if (w.type[i] === t) { all++; if (rowOf(w, i) < 94) up++; }
  return { up, all };
}

const out = [];
const check = (label, ok, detail) => out.push({ label, ok, detail });

// A neodymium magnet on a shelf `gap` cells above a floor strewn with grains of t (alternating with
// sand, if mixed)
function bench(t, gap = 6, mixed = true) {
  const w = world();
  const shelf = 94 - gap;
  rect(w, 60, shelf, 100, shelf, ID.WALL);
  rect(w, 72, shelf - 5, 88, shelf - 1, ID.EL_ND);
  rect(w, 0, 95, 159, 99, ID.STONE);
  for (let x = 60; x <= 100; x++) w.place(w.idx(x, 94), !mixed || x % 2 ? t : ID.SAND);
  return w;
}
{
  const w = bench(ID.EL_FE);
  run(w, 600);
  const fe = lifted(w, ID.EL_FE), sand = lifted(w, ID.SAND);
  check('A magnet lifts iron out of sand', fe.up > fe.all * 0.7 && sand.up === 0, `${fe.up} of ${fe.all} iron lifted, ${sand.up} sand`);
  // heat the magnet past neodymium's Curie point (310°C) and the iron drops (onto the sand, where it
  // may heap up, so count only what is still pressed against the underside of the shelf)
  const high = () => { let n = 0; for (let i = 0; i < w.N; i++) if (w.type[i] === ID.EL_FE && w.type[i - w.SW] === ID.WALL) n++; return n; };
  const before = high();
  run(w, 200, (ww) => temps(ww, ID.EL_ND, 400));
  check('…heated past 310°C, it drops the iron', before > 10 && high() === 0, `${before} held up under the shelf → ${high()}`);
}
{
  const w = bench(ID.EL_CU);
  run(w, 600);
  const cu = lifted(w, ID.EL_CU);
  check('Copper is not magnetic', cu.up === 0, `${cu.up} of ${cu.all} copper lifted`);
}
{
  const w = bench(ID.EL_FE);
  run(w, 600, (ww) => temps(ww, ID.EL_FE, 900));
  const fe = lifted(w, ID.EL_FE);
  check('Iron past its Curie point (770°C) is not pulled', fe.up === 0, `${fe.up} of ${fe.all} red-hot iron lifted`);
}
{
  const warm = bench(ID.EL_GD), cold = bench(ID.EL_GD);
  run(warm, 600, (ww) => temps(ww, ID.EL_GD, 24));
  run(cold, 600, (ww) => temps(ww, ID.EL_GD, 5));
  const a = lifted(warm, ID.EL_GD), b = lifted(cold, ID.EL_GD);
  check('Gadolinium: not magnetic at 24°C, magnetic at 5°C', a.up === 0 && b.up > b.all * 0.5, `${a.up} lifted warm, ${b.up} of ${b.all} cold`);
}
function electromagnet(powered) {
  const w = world();
  rect(w, 60, 85, 100, 87, ID.METAL); // an iron bar six cells above the floor
  if (powered) w.place(w.idx(59, 86), ID.BATTERY);
  rect(w, 0, 95, 159, 99, ID.STONE);
  for (let x = 62; x <= 98; x += 2) w.place(w.idx(x, 94), ID.EL_FE);
  run(w, 600);
  return lifted(w, ID.EL_FE);
}
{
  const on = electromagnet(true), off = electromagnet(false);
  check('An iron bar carrying current is an electromagnet', on.up > on.all * 0.5, `${on.up} of ${on.all} iron lifted`);
  check('…without current, it isn’t', off.up === 0, `${off.up} lifted`);
}
{ // bismuth is pushed away from a magnet standing on the floor
  const w = world();
  rect(w, 0, 95, 159, 99, ID.STONE);
  rect(w, 70, 85, 74, 94, ID.WALL);
  rect(w, 75, 85, 80, 94, ID.EL_ND);
  for (let x = 81; x <= 86; x++) w.place(w.idx(x, 94), ID.EL_BI);
  const mean = () => { let s = 0, n = 0; for (let i = 0; i < w.N; i++) if (w.type[i] === ID.EL_BI) { s += colOf(w, i); n++; } return s / n; };
  const x0 = mean();
  run(w, 400);
  const x1 = mean();
  check('Bismuth is pushed away from a magnet', x1 > x0 + 2, `mean x ${x0.toFixed(1)} → ${x1.toFixed(1)}`);
}
{ // liquid oxygen poured near a magnet clings to it
  const w = world();
  rect(w, 60, 70, 100, 70, ID.WALL);
  rect(w, 72, 65, 88, 69, ID.EL_ND);
  rect(w, 0, 95, 159, 99, ID.STONE);
  rect(w, 74, 74, 86, 76, ID.EL_O);
  let held = 0;
  run(w, 300, (ww, k) => {
    temps(ww, ID.EL_O, -200);
    if (k === 299) for (let i = 0; i < ww.N; i++) if (ww.type[i] === ID.EL_O && rowOf(ww, i) < 80) held++;
  });
  check('Liquid oxygen clings to a magnet', held > 10, `${held} oxygen cells held up under it`);
}

// ── the Magnet tool switched to Magnetic ──
function grabMix(magnetic) {
  const w = world();
  rect(w, 0, 95, 159, 99, ID.STONE);
  for (let y = 88; y <= 94; y++) for (let x = 70; x <= 90; x++) w.place(w.idx(x, y), (x + y) % 2 ? ID.EL_FE : ID.SAND);
  w.grab(80, 91, 8, magnetic);
  run(w, 2);
  const held = { iron: 0, sand: 0 };
  for (let i = 0; i < w.N; i++) {
    if (!(w.flags[i] & 256)) continue;
    if (w.type[i] === ID.EL_FE) held.iron++; else if (w.type[i] === ID.SAND) held.sand++;
  }
  return { w, held };
}
{
  const mag = grabMix(true), any = grabMix(false);
  check('Magnetic on: the Magnet takes only the iron', mag.held.iron > 20 && mag.held.sand === 0, `${mag.held.iron} iron, ${mag.held.sand} sand held`);
  check('Magnetic off: it takes everything loose', any.held.iron > 20 && any.held.sand > 20, `${any.held.iron} iron, ${any.held.sand} sand held`);
  // heat what the magnetic hand holds past iron's Curie point and it lets go
  run(mag.w, 3, (ww) => temps(ww, ID.EL_FE, 900));
  let still = 0;
  for (let i = 0; i < mag.w.N; i++) if ((mag.w.flags[i] & 256) && mag.w.type[i] === ID.EL_FE) still++;
  check('…and drops iron heated past 770°C', still === 0, `${still} red-hot iron still held`);
  mag.w.release(0, 0);
}

let fail = 0;
for (const r of out) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.label.padEnd(50)} ${r.detail}`);
}
process.exit(fail ? 1 : 0);
