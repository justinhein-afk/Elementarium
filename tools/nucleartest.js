// Headless checks for the reactor extras: the beryllium reflector and neutron source, the graphite
// moderator, the blue glow of a reactor pool, calcium fusion into superheavy elements, and a
// nuclear battery.
// Run: node tools/nucleartest.js
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
const temps = (w, t, T) => { for (let i = 0; i < w.N; i++) if (w.type[i] === t) w.temp[i] = T; };
function run(w, n, each) {
  const tot = { fission: 0, fused: [] };
  for (let k = 0; k < n; k++) {
    if (each) each(w, k);
    w.step();
    tot.fission += w.events.fission;
    tot.fused.push(...w.events.fused);
    w.resetEvents();
  }
  return tot;
}
const cells = (w, pred) => { let n = 0; for (let i = 0; i < w.N; i++) if (pred(i, w.type[i])) n++; return n; };

const out = [];
const check = (label, ok, detail) => out.push({ label, ok, detail });

// A small slab of uranium on the floor with a californium neutron source in it, bare or wrapped in
// beryllium. Averaged over a few worlds, since a chain reaction is a matter of chance.
function slab(reflector) {
  let total = 0;
  for (let k = 0; k < 4; k++) {
    const w = world();
    rect(w, 0, 95, 159, 99, ID.WALL);
    if (reflector) rect(w, 70, 82, 89, 94, ID.EL_BE);
    rect(w, 74, 86, 85, 94, ID.EL_U);
    w.place(w.idx(79, 90), ID.EL_CF);
    total += run(w, 600).fission;
  }
  return total / 4;
}
{
  const bare = slab(false), wrapped = slab(true);
  check('A beryllium reflector multiplies fissions', wrapped > bare * 1.5 && wrapped > 5, `${bare.toFixed(1)} fissions bare, ${wrapped.toFixed(1)} wrapped in beryllium`);
}
// Rows of uranium separated by rows of graphite, or by rows of wall (which neither slows nor stops
// a neutron), with a neutron source in the middle.
function lattice(spacer) {
  let total = 0;
  for (let k = 0; k < 4; k++) {
    const w = world();
    rect(w, 0, 95, 159, 99, ID.WALL);
    for (let y = 70; y <= 94; y++) rect(w, 66, y, 94, y, (y & 1) ? ID.EL_U : spacer);
    w.place(w.idx(80, 82), ID.EL_CF);
    total += run(w, 600).fission;
  }
  return total / 4;
}
{
  const plain = lattice(ID.WALL), graphite = lattice(ID.EL_C);
  check('A graphite moderator speeds the chain reaction', graphite > plain * 1.3, `${plain.toFixed(1)} fissions with wall spacers, ${graphite.toFixed(1)} with graphite`);
}
{ // a neutron source in a pool: the water around it glows blue
  const w = world();
  rect(w, 0, 95, 159, 99, ID.WALL);
  rect(w, 50, 60, 110, 94, ID.WATER);
  rect(w, 78, 90, 82, 94, ID.EL_CF);
  let glow = 0;
  run(w, 300, (ww) => { glow += cells(ww, (i, t) => t === ID.WATER && ww.aux[i] > 0); });
  check('Water round a neutron source glows blue', glow > 500, `${glow} glowing water cell-ticks`);
}
function source(withBe) { // polonium's alpha particles knock neutrons out of beryllium
  const w = world();
  rect(w, 0, 95, 159, 99, ID.WALL);
  rect(w, 76, 90, 79, 94, ID.EL_PO);
  if (withBe) { rect(w, 72, 90, 75, 94, ID.EL_BE); rect(w, 80, 90, 83, 94, ID.EL_BE); rect(w, 72, 86, 83, 89, ID.EL_BE); }
  let tracks = 0;
  run(w, 600, (ww) => { tracks += cells(ww, (i, t) => t === ID.RAD && ww.aux[i] === 1); });
  return tracks;
}
{
  const po = source(false), poBe = source(true);
  check('Polonium + beryllium makes neutrons', poBe > 20 && po === 0, `${po} neutron tracks from polonium alone, ${poBe} with beryllium`);
}
function fuse(hot) { // in a sealed crucible, so white-hot calcium vapour stays on the target
  const w = world();
  rect(w, 0, 95, 159, 99, ID.WALL);
  rect(w, 69, 86, 86, 94, ID.WALL);
  rect(w, 70, 87, 85, 94, ID.EMPTY);
  rect(w, 70, 90, 79, 94, ID.EL_PU);
  rect(w, 80, 90, 85, 94, ID.EL_CA);
  return run(w, 120, (ww) => { if (hot) temps(ww, ID.EL_CA, 3500); }).fused;
}
{
  const hot = fuse(true), cold = fuse(false);
  const fl = hot.filter((t) => t === ID.EL_FL).length;
  check('White-hot calcium fuses with plutonium into flerovium', fl > 0, `${fl} flerovium nuclei made`);
  check('…cold calcium does nothing', cold.length === 0, `${cold.length} made`);
}
{ // fast calcium thrown into a target fuses too
  const w = world();
  rect(w, 0, 95, 159, 99, ID.WALL);
  rect(w, 100, 85, 104, 94, ID.EL_CF);
  rect(w, 60, 88, 61, 89, ID.EL_CA);
  for (let i = 0; i < w.N; i++) if (w.type[i] === ID.EL_CA) { w.vx[i] = 5; w.vy[i] = -0.5; }
  const fused = run(w, 120, (ww) => { for (let i = 0; i < ww.N; i++) if (ww.type[i] === ID.EL_CA && ww.vx[i] > 0) ww.vx[i] = 5; }).fused;
  const og = fused.filter((t) => t === ID.EL_OG).length;
  check('Calcium fired into californium makes oganesson', og > 0, `${og} oganesson nuclei made`);
}
{ // a nuclear battery: hot curium against tellurium, with a wire off its cold side
  const w = world();
  rect(w, 0, 95, 159, 99, ID.WALL);
  rect(w, 70, 92, 74, 94, ID.EL_CM);
  rect(w, 75, 94, 75, 94, ID.EL_TE);
  rect(w, 76, 94, 90, 94, ID.METAL);
  temps(w, ID.EL_CM, 500); // a lump of curium is hot from its own decay
  let lit = 0;
  run(w, 900, (ww) => { lit += cells(ww, (i, t) => t === ID.METAL && ww.charge[i] > 0); });
  check('Curium heat through tellurium makes current', lit > 20, `${lit} charged wire cell-ticks`);
}

let fail = 0;
for (const r of out) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.label.padEnd(52)} ${r.detail}`);
}
process.exit(fail ? 1 : 0);
