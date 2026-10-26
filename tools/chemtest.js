// Headless checks for flame colours, phosphors and the periodic table's contact chemistry.
// Run: node tools/chemtest.js
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
// a sealed box of wall with an empty inside
function box(w, x0, y0, x1, y1) {
  rect(w, x0, y0, x1, y1, ID.WALL);
  rect(w, x0 + 1, y0 + 1, x1 - 1, y1 - 1, ID.EMPTY);
}
function cells(w, pred) {
  let n = 0;
  for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) { const i = w.idx(x, y); if (pred(i, w.type[i])) n++; }
  return n;
}
const count = (w, t) => cells(w, (i, c) => c === t);
function run(w, n, each) {
  const tot = { booms: 0 };
  for (let k = 0; k < n; k++) {
    if (each) each(w, k);
    w.step();
    tot.booms += w.events.booms.length / 4;
    w.resetEvents();
  }
  return tot;
}
const temps = (w, t, T) => { for (let i = 0; i < w.N; i++) if (w.type[i] === t) w.temp[i] = T; };

const out = [];
const check = (label, ok, detail) => out.push({ label, ok, detail });

// ── flame colours ──
function campfire(colourant) {
  const w = world();
  rect(w, 0, 90, 159, 99, ID.STONE);
  rect(w, 60, 80, 100, 89, ID.WOOD);
  if (colourant) for (let x = 60; x <= 100; x += 2) w.place(w.idx(x, 79), colourant);
  for (let x = 60; x <= 100; x++) w.ignite(w.idx(x, 80));
  let tinted = 0, fire = 0;
  run(w, 400, (ww) => {
    tinted += cells(ww, (i, t) => t === ID.FIRE && ww.aux[i] !== 0 && ww.aux[i] === (colourant || ww.aux[i]));
    fire += count(ww, ID.FIRE);
  });
  return { tinted, fire };
}
{
  const cu = campfire(ID.EL_CU), plain = campfire(0), sr = campfire(ID.EL_SR);
  check('Copper turns a wood fire green', cu.tinted > cu.fire * 0.15, `${cu.tinted} of ${cu.fire} fire cell-ticks tinted by copper`);
  check('Strontium turns it red', sr.tinted > sr.fire * 0.15, `${sr.tinted} of ${sr.fire} tinted by strontium`);
  check('A plain wood fire stays orange', plain.fire > 1000 && plain.tinted === 0, `${plain.fire} fire cell-ticks, ${plain.tinted} tinted`);
}
{ // sodium's yellow swamps the copper's green
  const w = world();
  rect(w, 0, 90, 159, 99, ID.STONE);
  rect(w, 60, 80, 100, 89, ID.WOOD);
  for (let x = 60; x <= 100; x++) w.place(w.idx(x, 79), x & 1 ? ID.EL_CU : ID.EL_NA);
  for (let x = 60; x <= 100; x++) w.ignite(w.idx(x, 80));
  let na = 0, cu = 0;
  run(w, 300, (ww) => {
    na += cells(ww, (i, t) => t === ID.FIRE && ww.aux[i] === ID.EL_NA);
    cu += cells(ww, (i, t) => t === ID.FIRE && ww.aux[i] === ID.EL_CU);
  });
  check('Sodium yellow swamps copper green', na > cu, `${na} sodium-tinted vs ${cu} copper-tinted fire cell-ticks`);
}

// ── phosphors ──
{ // europium on a shelf, wired to a battery
  const w = world();
  rect(w, 40, 51, 120, 51, ID.WALL);
  rect(w, 42, 50, 118, 50, ID.EL_EU);
  w.place(w.idx(41, 50), ID.BATTERY);
  let lit = 0, after = 0;
  run(w, 300, (ww, k) => { lit += cells(ww, (i, t) => t === ID.EL_EU && ww.aux[i] > 0); });
  w.erase(41, 50, 0);
  run(w, 60);
  after = cells(w, (i, t) => t === ID.EL_EU && w.aux[i] > 0);
  check('Europium glows under current', lit > 2000, `${lit} lit cell-ticks`);
  check('…and keeps an afterglow', after > 20, `${after} cells still glowing 1 s after the battery went`);
}
{ // radium paint: radium mixed into zinc makes it sparkle
  const w = world();
  rect(w, 0, 90, 159, 99, ID.WALL);
  rect(w, 60, 80, 100, 89, ID.EL_ZN);
  for (let k = 0; k < 30; k++) w.place(w.idx(62 + k, 84), ID.EL_RA);
  let lit = 0;
  run(w, 600, (ww) => { lit += cells(ww, (i, t) => t === ID.EL_ZN && ww.aux[i] > 0); });
  check('Radium makes zinc glow (radium paint)', lit > 500, `${lit} glowing zinc cell-ticks`);
}

// ── alkali + halogen ──
{
  const w = world();
  box(w, 50, 40, 110, 99);
  rect(w, 51, 41, 109, 98, ID.EL_CL);
  rect(w, 78, 45, 82, 47, ID.EL_NA);
  let yellow = 0;
  run(w, 400, (ww) => { yellow += cells(ww, (i, t) => t === ID.FIRE && ww.aux[i] === ID.EL_NA); });
  check('Sodium burns yellow in chlorine, to salt', yellow > 5 && count(w, ID.SALT) > 5, `${yellow} yellow fire cell-ticks, ${count(w, ID.SALT)} salt`);
}

// ── hydrogen ──
function hydrogenBox(withOxygen) {
  const w = world();
  box(w, 50, 40, 110, 99);
  for (let y = 41; y <= 98; y++) for (let x = 51; x <= 109; x++) w.place(w.idx(x, y), withOxygen && (x + y) % 3 === 0 ? ID.EL_O : ID.EL_H);
  const o0 = count(w, ID.EL_O);
  w.sparkPaint(80, 70, 2);
  const r = run(w, 300);
  return { booms: r.booms, o0, o1: count(w, ID.EL_O), steam: count(w, ID.STEAM) };
}
{
  const h = hydrogenBox(false), ho = hydrogenBox(true);
  check('A spark sets hydrogen off', h.booms > 10, `${h.booms} blasts`);
  check('Oxygen burns with it, into water', ho.o1 < ho.o0 * 0.5 && ho.steam > 100, `O ${ho.o0} → ${ho.o1}, ${ho.steam} steam`);
}

// ── acid on metals ──
function acidOn(metal) {
  const w = world();
  box(w, 50, 40, 110, 99);
  rect(w, 51, 80, 109, 98, ID.ACID);
  rect(w, 70, 70, 90, 72, metal);
  let h = 0;
  run(w, 400, (ww) => { h = Math.max(h, count(ww, ID.EL_H)); });
  return h;
}
{
  const zn = acidOn(ID.EL_ZN), cu = acidOn(ID.EL_CU);
  check('Zinc in acid fizzes hydrogen', zn > 10, `up to ${zn} hydrogen`);
  check('Copper in acid gives none', cu === 0, `up to ${cu} hydrogen`);
}

{ // every reaction lights a burst where it happens, so even one grain reacting shows
  const w = world();
  box(w, 50, 40, 110, 99);
  rect(w, 51, 80, 109, 98, ID.ACID);
  rect(w, 74, 70, 86, 72, ID.EL_ZN);
  let bursts = 0, first = -1;
  for (let k = 0; k < 300; k++) {
    w.step();
    const n = w.events.rx.length / 3;
    if (n && first < 0) first = k;
    bursts += n;
    w.resetEvents();
  }
  check('Reactions flash where they happen', bursts >= 5 && first >= 0 && first < 60, `${bursts} bursts, the first at tick ${first}`);
}

// ── gallium, bromine, iodine and aluminium ──
{
  const w = world();
  box(w, 50, 40, 110, 99);
  rect(w, 51, 90, 109, 98, ID.EL_AL);
  rect(w, 51, 85, 109, 89, ID.EL_GA);
  const r0 = count(w, ID.EL_AL);
  run(w, 600, (ww) => temps(ww, ID.EL_GA, 40)); // a warm hand keeps the gallium molten
  check('Molten gallium makes aluminium crumble', count(w, ID.RUBBLE) > 20, `${r0} Al → ${count(w, ID.EL_AL)} Al, ${count(w, ID.RUBBLE)} rubble`);
}
{
  const w = world();
  box(w, 50, 40, 110, 99);
  rect(w, 51, 88, 109, 98, ID.EL_BR);
  rect(w, 75, 70, 85, 72, ID.EL_AL);
  let fire = 0;
  run(w, 300, (ww) => { fire += count(ww, ID.FIRE); });
  check('Bromine sets aluminium alight', fire > 30 && count(w, ID.SALT) > 5, `${fire} fire cell-ticks, ${count(w, ID.SALT)} salt`);
}
function iodineAl(water) {
  const w = world();
  box(w, 50, 40, 110, 99);
  for (let y = 90; y <= 98; y++) for (let x = 60; x <= 100; x++) w.place(w.idx(x, y), (x + y) & 1 ? ID.EL_I : ID.EL_AL);
  if (water) for (let x = 62; x <= 98; x += 3) w.place(w.idx(x, 89), ID.WATER);
  let vapour = 0;
  run(w, 400, (ww) => { vapour = Math.max(vapour, cells(ww, (i, t) => t === ID.EL_I && ww.temp[i] >= 184.3)); });
  return vapour;
}
{
  const wet = iodineAl(true), dry = iodineAl(false);
  check('Iodine + aluminium + water: purple vapour', wet > 20, `up to ${wet} iodine vapour cells`);
  check('…and nothing without the water', dry === 0, `up to ${dry} vapour cells dry`);
}

// ── mercury dissolves gold; boiling it off brings the gold back ──
{
  const w = world();
  box(w, 50, 60, 110, 99);
  rect(w, 51, 80, 109, 98, ID.EL_HG);
  rect(w, 70, 70, 90, 72, ID.EL_AU);
  const au0 = count(w, ID.EL_AU);
  run(w, 6000);
  const au1 = count(w, ID.EL_AU), amalgam = cells(w, (i, t) => t === ID.EL_HG && w.aux[i] > 0);
  check('Gold dissolves in mercury', au1 < au0 * 0.6 && amalgam > 10, `Au ${au0} → ${au1}, ${amalgam} amalgam cells`);
  run(w, 400, (ww) => temps(ww, ID.EL_HG, 420));
  const au2 = count(w, ID.EL_AU);
  check('Boiling the mercury off leaves the gold', au2 > au1 + amalgam * 0.6, `Au ${au1} → ${au2}`);
}

// ── palladium sponge, platinum catalyst ──
{
  const w = world();
  box(w, 50, 40, 110, 99);
  rect(w, 51, 41, 109, 98, ID.EL_H);
  rect(w, 60, 50, 100, 50, ID.WALL); // a shelf up where the hydrogen gathers
  rect(w, 60, 47, 100, 49, ID.EL_PD);
  const h0 = count(w, ID.EL_H);
  run(w, 400);
  const h1 = count(w, ID.EL_H);
  let held = 0;
  for (let i = 0; i < w.N; i++) if (w.type[i] === ID.EL_PD) held += w.aux[i];
  check('Palladium soaks up hydrogen', h1 < h0 - 250 && held > 250, `H ${h0} → ${h1}, ${held} held`);
  const w2 = world();
  box(w2, 50, 40, 110, 99);
  rect(w2, 60, 90, 100, 98, ID.EL_PD);
  for (let i = 0; i < w2.N; i++) if (w2.type[i] === ID.EL_PD) w2.aux[i] = 6;
  run(w2, 300, (ww) => temps(ww, ID.EL_PD, 350));
  check('…and lets it go when heated', count(w2, ID.EL_H) > 100, `${count(w2, ID.EL_H)} hydrogen released`);
}
{
  const w = world();
  box(w, 50, 40, 110, 99);
  rect(w, 51, 41, 109, 98, ID.EL_H);
  rect(w, 79, 97, 81, 98, ID.EL_PT); // a pinch of platinum sponge
  let hot = 0;
  const r = run(w, 600, (ww) => { for (let i = 0; i < ww.N; i++) if (ww.type[i] === ID.EL_PT && ww.temp[i] > hot) hot = ww.temp[i]; });
  check('Platinum warms up and lights hydrogen', hot > 250 && r.booms > 0, `platinum reached ${Math.round(hot)}°C, ${r.booms} blasts`);
}
{ // the same pinch resting on glass, which draws its heat away
  const w = world();
  rect(w, 50, 40, 110, 99, ID.GLASS);
  rect(w, 51, 41, 109, 98, ID.EL_H);
  rect(w, 79, 97, 81, 98, ID.EL_PT);
  const r = run(w, 900);
  check('…even sitting on glass', r.booms > 0, `${r.booms} blasts`);
}

// ── magnesium, zirconium ──
{
  const w = world();
  box(w, 50, 40, 110, 99);
  rect(w, 51, 41, 109, 98, ID.CO2);
  rect(w, 75, 94, 85, 98, ID.EL_MG);
  for (let i = 0; i < w.N; i++) if (w.type[i] === ID.EL_MG) w.temp[i] = 700;
  let carbon = 0;
  run(w, 400, (ww) => { temps(ww, ID.CO2, 20); carbon = Math.max(carbon, count(ww, ID.EL_C)); });
  check('Burning magnesium eats CO₂, leaving carbon', carbon > 5, `up to ${carbon} carbon`);
}
{
  const w = world();
  rect(w, 0, 90, 159, 99, ID.STONE);
  rect(w, 70, 80, 90, 89, ID.EL_MG);
  temps(w, ID.EL_MG, 700);
  for (let x = 70; x <= 90; x++) w.ignite(w.idx(x, 80));
  rect(w, 70, 60, 90, 62, ID.WATER);
  const r = run(w, 400);
  check('Water on a magnesium fire explodes', r.booms > 3, `${r.booms} hydrogen blasts`);
}
{
  const w = world();
  box(w, 50, 40, 110, 99);
  rect(w, 51, 41, 109, 98, ID.STEAM);
  rect(w, 76, 92, 84, 98, ID.EL_ZR);
  let h = 0;
  run(w, 300, (ww) => { temps(ww, ID.EL_ZR, 1000); temps(ww, ID.STEAM, 150); h = Math.max(h, count(ww, ID.EL_H)); });
  check('Red-hot zirconium splits steam into hydrogen', h > 20, `up to ${h} hydrogen`);
}

// ── white phosphorus ──
function phosphorus(underWater) {
  const w = world();
  box(w, 50, 60, 110, 99);
  if (underWater) rect(w, 51, 80, 109, 98, ID.WATER);
  rect(w, 76, 96, 84, 98, ID.EL_P);
  let burnt = 0;
  run(w, 900, (ww) => { burnt = Math.max(burnt, cells(ww, (i, t) => t === ID.EL_P && (ww.flags[i] & Sim.BURN))); });
  return { burnt, left: count(w, ID.EL_P) };
}
{
  const air = phosphorus(false), wet = phosphorus(true);
  check('White phosphorus ignites in open air', air.burnt > 0, `${air.burnt} burning, ${air.left} of 27 left`);
  check('…but is safe under water', wet.burnt === 0 && wet.left === 27, `${wet.burnt} burning, ${wet.left} of 27 left`);
}

// ── chlorine bleaches flowers ──
{
  const w = world();
  box(w, 50, 40, 110, 99);
  rect(w, 51, 41, 109, 98, ID.EL_CL);
  rect(w, 70, 90, 90, 92, ID.FLOWER);
  let bleached = 0;
  run(w, 200, (ww) => { bleached = Math.max(bleached, cells(ww, (i, t) => t === ID.FLOWER && (ww.flags[i] & Sim.BLEACH))); });
  check('Chlorine bleaches flowers white', bleached > 20, `up to ${bleached} bleached petals`);
}

let fail = 0;
for (const r of out) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.label.padEnd(46)} ${r.detail}`);
}
process.exit(fail ? 1 : 0);
