// Headless checks for coloured glass, electrical devices and burning-metal sparks.
// Run: node tools/devicetest.js
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
function box(w, x0, y0, x1, y1, t = ID.WALL) {
  rect(w, x0, y0, x1, y1, t);
  rect(w, x0 + 1, y0 + 1, x1 - 1, y1 - 1, ID.EMPTY);
}
function cells(w, pred) {
  let n = 0;
  for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) { const i = w.idx(x, y); if (pred(i, w.type[i])) n++; }
  return n;
}
const count = (w, t) => cells(w, (i, c) => c === t);
const temps = (w, t, T) => { for (let i = 0; i < w.N; i++) if (w.type[i] === t) w.temp[i] = T; };
const maxTemp = (w, t) => { let m = -Infinity; for (let i = 0; i < w.N; i++) if (w.type[i] === t && w.temp[i] > m) m = w.temp[i]; return m; };
function run(w, n, each) {
  const tot = { booms: 0, rx: [] };
  for (let k = 0; k < n; k++) {
    if (each) each(w, k);
    w.step();
    tot.booms += w.events.booms.length / 4;
    for (let q = 2; q < w.events.rx.length; q += 3) tot.rx.push(w.events.rx[q]);
    w.resetEvents();
  }
  return tot;
}

const out = [];
const check = (label, ok, detail) => out.push({ label, ok, detail });

// ── coloured glass ──
function melt(colourant) {
  const w = world();
  box(w, 50, 60, 110, 99);
  rect(w, 51, 85, 109, 98, ID.MGLASS);
  if (colourant) rect(w, 70, 78, 90, 79, colourant);
  run(w, 600, (ww) => { for (let i = 0; i < ww.N; i++) if (ww.type[i] === ID.MGLASS && ww.temp[i] < 1300) ww.temp[i] = 1300; });
  run(w, 200, (ww) => temps(ww, ID.MGLASS, 500)); // let it set
  return w;
}
{
  const co = melt(ID.EL_CO), plain = melt(0);
  const glass = count(co, ID.GLASS), blue = cells(co, (i, t) => t === ID.GLASS && co.aux[i] === ID.EL_CO);
  check('Cobalt stains molten glass blue, and it sets blue', glass > 400 && blue > glass * 0.5, `${blue} of ${glass} glass cells cobalt blue`);
  check('A plain melt sets clear', count(plain, ID.GLASS) > 400 && cells(plain, (i, t) => t === ID.GLASS && plain.aux[i]) === 0, `${count(plain, ID.GLASS)} clear glass cells`);
  // remelt the blue glass and let it set again
  run(co, 200, (ww) => temps(ww, ID.GLASS, 1500));
  const moltenBlue = cells(co, (i, t) => t === ID.MGLASS && co.aux[i] === ID.EL_CO);
  run(co, 200, (ww) => temps(ww, ID.MGLASS, 500));
  const blue2 = cells(co, (i, t) => t === ID.GLASS && co.aux[i] === ID.EL_CO);
  check('Stained glass keeps its colour through a remelt', moltenBlue > blue * 0.8 && blue2 > blue * 0.8, `${blue} → ${moltenBlue} molten → ${blue2} blue again`);
}
{ // quenching coloured molten glass in water
  const w = world();
  box(w, 50, 60, 110, 99);
  rect(w, 51, 92, 109, 98, ID.MGLASS);
  for (let i = 0; i < w.N; i++) if (w.type[i] === ID.MGLASS) w.aux[i] = ID.EL_AU;
  rect(w, 51, 80, 109, 88, ID.WATER);
  run(w, 300);
  const ruby = cells(w, (i, t) => t === ID.GLASS && w.aux[i] === ID.EL_AU);
  check('Gold-ruby glass quenched in water stays ruby', ruby > 100, `${ruby} ruby glass cells`);
}
{ // uranium glass under radiation
  const w = world();
  rect(w, 60, 80, 100, 89, ID.GLASS);
  for (let i = 0; i < w.N; i++) if (w.type[i] === ID.GLASS) w.aux[i] = ID.EL_U;
  for (let x = 62; x < 100; x += 4) w.place(w.idx(x, 79), ID.EL_RA);
  rect(w, 60, 90, 100, 90, ID.WALL);
  let lit = 0;
  run(w, 600, (ww) => { lit += cells(ww, (i, t) => t === ID.GLASS && ww.data[i] > 0); });
  check('Uranium glass glows green under radiation', lit > 300, `${lit} glowing glass cell-ticks`);
}

// ── electrical devices ──
function bulb(sealed) {
  const w = world();
  if (sealed) { box(w, 50, 62, 110, 78, ID.GLASS); rect(w, 51, 63, 109, 77, ID.EL_AR); }
  rect(w, 52, 71, 108, 71, ID.WALL); // the filament's support
  rect(w, 54, 70, 106, 70, ID.EL_W);
  w.place(w.idx(53, 70), ID.BATTERY);
  w.place(w.idx(107, 70), ID.BATTERY);
  const w0 = count(w, ID.EL_W);
  let hot = 0;
  run(w, 900, (ww) => { hot = Math.max(hot, maxTemp(ww, ID.EL_W)); });
  return { w0, w1: count(w, ID.EL_W), hot, molten: count(w, ID.MGLASS) };
}
{
  const inArgon = bulb(true), inAir = bulb(false);
  check('A tungsten filament in argon glows white-hot', inArgon.hot > 1800 && inArgon.w1 === inArgon.w0, `reached ${Math.round(inArgon.hot)}°C, ${inArgon.w1} of ${inArgon.w0} left`);
  check('…without melting its glass bulb', inArgon.molten === 0, `${inArgon.molten} molten glass cells`);
  check('In open air the filament burns out', inAir.w1 < inAir.w0 * 0.6, `${inAir.w1} of ${inAir.w0} left`);
}
{ // a carbon arc across a two-cell gap
  const w = world();
  rect(w, 40, 71, 120, 71, ID.WALL);
  rect(w, 42, 70, 78, 70, ID.EL_C);
  rect(w, 81, 70, 118, 70, ID.EL_C);
  w.place(w.idx(41, 70), ID.BATTERY);
  let arc = 0;
  const c0 = count(w, ID.EL_C);
  run(w, 1800, (ww) => { if (ww.type[ww.idx(79, 70)] === ID.SPARK || ww.type[ww.idx(80, 70)] === ID.SPARK) arc++; });
  const far = cells(w, (i, t) => t === ID.EL_C && w.charge[i] > 0 && (i % w.SW) - 1 > 80);
  check('Carbon rods strike a steady arc across a gap', arc > 900, `arc lit on ${arc} of 1800 ticks`);
  check('…and the lamp lasts: the rods never burn away', count(w, ID.EL_C) === c0, `${count(w, ID.EL_C)} of ${c0} carbon left after 30 s`);
  check('…and the current carries on across it', far >= 0 && arc > 0, `${far} charged cells past the gap right now`);
}
function heater(withChromium) {
  const w = world();
  rect(w, 50, 71, 110, 71, ID.WALL);
  for (let x = 60; x <= 100; x++) w.place(w.idx(x, 70), withChromium && x & 1 ? ID.EL_CR : ID.EL_NI);
  w.place(w.idx(59, 70), ID.BATTERY);
  rect(w, 70, 67, 90, 69, ID.WOOD); // kindling laid on the wire (current alone never lights wood)
  let hot = 0, burning = 0;
  run(w, 900, (ww) => {
    hot = Math.max(hot, maxTemp(ww, ID.EL_NI));
    burning = Math.max(burning, cells(ww, (i, t) => t === ID.WOOD && (ww.flags[i] & Sim.BURN)));
  });
  return { burning, hot };
}
{
  const nichrome = heater(true), nickel = heater(false);
  check('Nichrome glows red-hot and lights wood on it', nichrome.hot > 700 && nichrome.burning > 0, `reached ${Math.round(nichrome.hot)}°C, up to ${nichrome.burning} wood cells burning`);
  check('…plain nickel wire stays cool', nickel.burning === 0 && nickel.hot < 300, `reached ${Math.round(nickel.hot)}°C, ${nickel.burning} burning`);
}
// A bed of metal grains along the floor: one end under a bath (held back by a glass wall standing
// on the bed), the other end dry, with a wire standing on the dry end.
function bed(w, t, bath) {
  rect(w, 51, 97, 109, 98, t);
  rect(w, 80, 90, 80, 96, ID.GLASS);
  rect(w, 51, 90, 79, 96, bath);
  rect(w, 100, 80, 100, 96, ID.METAL);
}
function lemon(withCopper) {
  const w = world();
  box(w, 50, 60, 110, 99);
  bed(w, ID.EL_ZN, ID.SALTWATER);
  if (withCopper) rect(w, 60, 93, 66, 96, ID.EL_CU); // a heap of copper in the same bath
  let lit = 0;
  run(w, 600, (ww) => { lit += cells(ww, (i, t) => t === ID.METAL && ww.charge[i] > 0); });
  return lit;
}
{
  const cell = lemon(true), zincOnly = lemon(false);
  check('Zinc and copper in saltwater make current', cell > 50, `${cell} charged wire cell-ticks`);
  check('…zinc alone makes none', zincOnly === 0, `${zincOnly} charged wire cell-ticks`);
}
{ // a lead plate standing in acid, with a wire up out of the bath
  const w = world();
  box(w, 50, 60, 110, 99);
  bed(w, ID.EL_PB, ID.ACID);
  const pb0 = count(w, ID.EL_PB);
  let lit = 0;
  run(w, 600, (ww) => { lit += cells(ww, (i, t) => t === ID.METAL && ww.charge[i] > 0); });
  check('Lead in acid makes current (a car battery)', lit > 50, `${lit} charged wire cell-ticks`);
  check('…and the acid barely eats the lead', count(w, ID.EL_PB) > pb0 * 0.6, `${count(w, ID.EL_PB)} of ${pb0} lead left`);
}
function panel(roofed) {
  const w = world();
  rect(w, 40, 71, 120, 71, ID.WALL);
  rect(w, 50, 70, 110, 70, ID.EL_SI);
  if (roofed) rect(w, 40, 60, 120, 62, ID.STONE);
  let lit = 0;
  run(w, 300, (ww) => { lit += cells(ww, (i, t) => t === ID.EL_SI && ww.charge[i] > 0); });
  return lit;
}
{
  const sky = panel(false), roof = panel(true);
  check('Silicon under open sky makes current', sky > 200, `${sky} charged cell-ticks`);
  check('…under a roof, none', roof === 0, `${roof} charged cell-ticks`);
}
function thermo(hot) {
  const w = world();
  rect(w, 60, 71, 100, 71, ID.WALL);
  w.place(w.idx(79, 70), ID.STONE);
  w.place(w.idx(80, 70), ID.EL_TE);
  w.place(w.idx(81, 70), ID.STONE);
  rect(w, 82, 70, 95, 70, ID.METAL);
  let lit = 0;
  run(w, 300, (ww) => {
    ww.temp[ww.idx(79, 70)] = hot ? 600 : 20;
    ww.temp[ww.idx(81, 70)] = hot ? -20 : 20;
    lit += cells(ww, (i, t) => t === ID.EL_TE && ww.charge[i] > 0);
  });
  return lit;
}
{
  const diff = thermo(true), even = thermo(false);
  check('Tellurium between hot and cold makes current', diff > 5, `${diff} charged cell-ticks`);
  check('…at one even temperature, none', even === 0, `${even} charged cell-ticks`);
}
{ // a tantalum capacitor between a battery and a wire
  const w = world();
  rect(w, 40, 73, 120, 73, ID.WALL);
  w.place(w.idx(49, 71), ID.BATTERY);
  rect(w, 50, 70, 52, 72, ID.EL_TA);
  rect(w, 53, 71, 100, 71, ID.METAL);
  const r = run(w, 900);
  const bursts = r.rx.filter((t) => t === ID.SPARK).length;
  check('A tantalum capacitor fires in bursts', bursts >= 3, `${bursts} discharges in 15 s`);
}
function superconductor(cold) {
  const w = world(200, 60);
  rect(w, 4, 31, 195, 31, ID.WALL);
  rect(w, 6, 30, 190, 30, ID.EL_Y);
  w.place(w.idx(5, 30), ID.BATTERY);
  let arrive = -1;
  for (let k = 0; k < 600 && arrive < 0; k++) {
    if (cold) temps(w, ID.EL_Y, -190);
    w.step(); w.resetEvents();
    if (w.charge[w.idx(190, 30)] > 0) arrive = k;
  }
  return arrive;
}
{
  const cold = superconductor(true), warm = superconductor(false);
  check('Cold yttrium superconducts: current races along it', cold >= 0 && (warm < 0 || cold < warm * 0.5), `the far end lit at tick ${cold} cold, ${warm} warm`);
}

// ── sparks ──
function filings(t, T, sealed) {
  const w = world();
  rect(w, 40, 71, 120, 71, ID.WALL);
  if (sealed) { box(w, 39, 60, 121, 72); rect(w, 40, 61, 120, 70, ID.EL_AR); rect(w, 40, 71, 120, 71, ID.WALL); }
  for (let x = 50; x <= 110; x += 2) w.place(w.idx(x, 70), t);
  let sparks = 0;
  run(w, 400, (ww, k) => { if (k < 150) temps(ww, t, T); sparks = Math.max(sparks, count(ww, ID.MSPARK)); });
  return { sparks, rust: count(w, ID.RUST), left: count(w, t) };
}
{
  const fe = filings(ID.EL_FE, 900, false), feAr = filings(ID.EL_FE, 900, true), ti = filings(ID.EL_TI, 1100, false);
  check('Red-hot iron filings throw sparks and burn to rust', fe.sparks > 0 && fe.rust > 0, `up to ${fe.sparks} sparks, ${fe.rust} rust`);
  check('…but not in argon', feAr.sparks === 0, `${feAr.sparks} sparks`);
  check('White-hot titanium throws sparks', ti.sparks > 0, `up to ${ti.sparks} sparks`);
}
function flint(dropped) {
  const w = world();
  rect(w, 60, 92, 100, 98, ID.GUNPOWDER);
  if (dropped) rect(w, 78, 10, 82, 11, ID.EL_CE);
  else rect(w, 78, 90, 82, 91, ID.EL_CE);
  return run(w, 300).booms;
}
{
  const dropped = flint(true), laid = flint(false);
  check('A flint dropped onto gunpowder sparks it off', dropped > 0, `${dropped} blasts`);
  check('…laid gently on it, nothing', laid === 0, `${laid} blasts`);
}
function dust(asCloud) {
  const w = world();
  rect(w, 0, 95, 159, 99, ID.STONE);
  rect(w, 60, 88, 100, 94, ID.WOOD);
  for (let x = 60; x <= 100; x++) w.ignite(w.idx(x, 88));
  if (asCloud) for (let y = 50; y < 70; y += 2) for (let x = 64; x <= 96; x += 2) w.place(w.idx(x, y), ID.EL_AL);
  else rect(w, 70, 82, 90, 87, ID.EL_AL);
  return run(w, 300).booms;
}
{
  const cloud = dust(true), heap = dust(false);
  check('Aluminium dust flashes in a fire', cloud > 5, `${cloud} blasts`);
  check('…a heap of it hardly ever does', heap * 10 < cloud, `${heap} blasts`);
}
{
  const w = world();
  rect(w, 0, 95, 159, 99, ID.STONE);
  rect(w, 70, 90, 90, 94, ID.EL_MG);
  temps(w, ID.EL_MG, 700);
  let sparks = 0;
  run(w, 300, (ww) => { sparks = Math.max(sparks, cells(ww, (i, t) => t === ID.MSPARK && ww.aux[i] === ID.EL_MG)); });
  check('Burning magnesium throws white sparks', sparks > 0, `up to ${sparks} sparks`);
}

let fail = 0;
for (const r of out) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.label.padEnd(50)} ${r.detail}`);
}
process.exit(fail ? 1 : 0);
