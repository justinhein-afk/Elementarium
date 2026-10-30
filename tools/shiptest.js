// Headless checks for machines as solids (they break, pistons shove pistons) and for ships: a thruster
// flies whatever it is built into.
// Run: node tools/shiptest.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
for (const f of ['elements.js', 'periodic.js', 'materials.js', 'sim.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
}
const { ELEM, Sim } = globalThis;
const ID = ELEM.ID;

function world(W = 160, H = 120) {
  const w = Sim.createWorld(W, H);
  for (const d of ELEM.list) w.disc[d.id] = 1;
  return w;
}
function rect(w, x0, y0, x1, y1, t, set) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = w.idx(x, y); w.place(i, t); if (set) set(i); }
}
const run = (w, n, each) => { for (let k = 0; k < n; k++) { if (each) each(w, k); w.step(); w.resetEvents(); } };
const count = (w, t) => { let n = 0; for (let i = 0; i < w.N; i++) if (w.type[i] === t) n++; return n; };
// the topmost row holding type t
const top = (w, t) => { for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) if (w.type[w.idx(x, y)] === t) return y; return -1; };
const meanX = (w, t) => { let s = 0, n = 0; for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) if (w.type[w.idx(x, y)] === t) { s += x; n++; } return n ? s / n : -1; };

const out = [];
const check = (label, ok, detail) => out.push({ label, ok, detail });

// ── machines are solids ──
{
  const w = world();
  rect(w, 0, 110, 159, 119, ID.STONE);
  rect(w, 40, 96, 60, 109, ID.PUMP);
  rect(w, 90, 100, 110, 109, ID.TANK);
  const n0 = count(w, ID.PUMP) + count(w, ID.TANK);
  for (let k = 0; k < 20; k++) { w.smash(50, 102, 8); w.smash(100, 104, 8); }
  const left = count(w, ID.PUMP) + count(w, ID.TANK), scrap = count(w, ID.SCRAP);
  check('Smash breaks machines into scrap', left < n0 * 0.5 && scrap > n0 * 0.4, `${n0} pump and tank cells → ${left} left, ${scrap} scrap`);
}
{
  // scrap keeps the colour of what it broke from: a pump's, a tank's, a battery's (batteries break too)
  const w = world();
  rect(w, 0, 110, 159, 119, ID.STONE);
  rect(w, 20, 100, 30, 109, ID.PUMP); rect(w, 70, 100, 80, 109, ID.TANK); rect(w, 120, 100, 130, 109, ID.BATTERY);
  for (let k = 0; k < 20; k++) for (const x of [25, 75, 125]) w.smash(x, 104, 7);
  const of = (t) => { let n = 0; for (let i = 0; i < w.N; i++) if (w.type[i] === ID.SCRAP && w.aux[i] === t) n++; return n; };
  let plain = 0; for (let i = 0; i < w.N; i++) if (w.type[i] === ID.SCRAP && !w.aux[i]) plain++;
  check('Scrap is the colour of what broke, batteries too', of(ID.PUMP) > 40 && of(ID.TANK) > 40 && of(ID.BATTERY) > 40 && plain === 0 && count(w, ID.BATTERY) < 60,
    `pump scrap ${of(ID.PUMP)}, tank scrap ${of(ID.TANK)}, battery scrap ${of(ID.BATTERY)}, uncoloured ${plain}; ${count(w, ID.BATTERY)} of 121 battery cells left`);
}
{
  const w = world(200, 140);
  rect(w, 0, 130, 199, 139, ID.STONE);
  rect(w, 80, 110, 120, 129, ID.PIPE);
  const n0 = count(w, ID.PIPE);
  w.launch('quake', 100, 125, 1, { magnitude: 9.5 });
  run(w, 600);
  check('A great earthquake shakes pipes apart', count(w, ID.PIPE) < n0 * 0.9 && count(w, ID.SCRAP) > 0, `${n0} pipe cells → ${count(w, ID.PIPE)}, ${count(w, ID.SCRAP)} scrap`);
}
// ── pistons ──
{
  const w = world();
  rect(w, 0, 110, 159, 119, ID.WALL);
  // piston A on the floor facing up, powered by a battery; a gap; then piston B (unpowered, and not
  // touching A, so not part of it) with a block on it: A's rod reaches B and lifts it
  rect(w, 70, 106, 74, 109, ID.PISTON, (i) => { w.aux[i] = 0; });
  w.place(w.idx(69, 108), ID.BATTERY);
  rect(w, 70, 100, 74, 104, ID.PISTON, (i) => { w.aux[i] = 0; });
  rect(w, 70, 95, 74, 99, ID.STONE);
  const b0 = top(w, ID.STONE);
  run(w, 200);
  const b1 = top(w, ID.STONE);
  check('A piston\'s rod shoves another piston, and what is on it', b1 <= b0 - 8 && count(w, ID.PISTON) === 45, `the block rose from y=${b0} to y=${b1}; ${count(w, ID.PISTON)} of 45 piston cells`);
}
{
  // a sticky piston pulls back what it pushed; a plain one leaves it there
  const home = (sticky) => {
    const w = world(60, 40);
    rect(w, 0, 35, 59, 39, ID.WALL);
    rect(w, 5, 28, 8, 34, ID.PISTON, (i) => { w.aux[i] = 1 | (sticky ? 4 : 0); }); // facing right
    w.place(w.idx(4, 31), ID.BATTERY);
    rect(w, 9, 30, 13, 34, ID.STONE);
    run(w, 120);
    const left = () => { let m = 99; for (let i = 0; i < w.N; i++) if (w.type[i] === ID.STONE) m = Math.min(m, (i % w.SW) - 1); return m; };
    const out = left();
    w.place(w.idx(4, 31), ID.EMPTY);
    run(w, 120);
    return [out, left()];
  };
  const plain = home(false), sticky = home(true);
  check('A sticky piston pulls back what it pushed', plain[0] >= 24 && plain[1] === plain[0] && sticky[0] >= 24 && sticky[1] === 9,
    `plain: pushed to x=${plain[0]}, left at x=${plain[1]}; sticky: pushed to x=${sticky[0]}, pulled back to x=${sticky[1]}`);
}
{
  // a thick piston strokes from its front face only and stays in one piece
  const w = world();
  rect(w, 0, 110, 159, 119, ID.WALL);
  rect(w, 70, 104, 76, 109, ID.PISTON, (i) => { w.aux[i] = 0; });
  w.place(w.idx(69, 107), ID.BATTERY);
  rect(w, 70, 98, 76, 103, ID.STONE);
  run(w, 200);
  let whole = true;
  for (let y = 104; y <= 109; y++) for (let x = 70; x <= 76; x++) if (w.type[w.idx(x, y)] !== ID.PISTON) whole = false;
  check('A thick piston stays whole and pushes from its face', whole && count(w, ID.PISTON) === 42 && count(w, ID.ROD) === 7 * 16 && top(w, ID.STONE) === 98 - 16,
    `body in place: ${whole}; ${count(w, ID.PISTON)} piston cells, ${count(w, ID.ROD)} rod cells; the block's top at y=${top(w, ID.STONE)}`);
}
// ── ships ──
// A little rocket standing on stone: a metal box with a tank of fuel in it, a thruster under the tank
// facing up, and a battery and a switch on a shelf inside, wired down to the thruster (clear of the
// metal hull, which would carry the current round the switch). Optional landing legs at its feet.
function rocket(w, x0, fuel, on, opts = {}) {
  const g = w.H - 12, x1 = x0 + 14;
  rect(w, 0, g, w.W - 1, w.H - 1, ID.STONE);
  const base = g - (opts.legs ? 3 : 1);
  if (opts.legs) { rect(w, x0, g - 2, x0 + 1, g - 1, ID.LEGS); rect(w, x1 - 1, g - 2, x1, g - 1, ID.LEGS); }
  rect(w, x0, base - 26, x1, base, ID.METAL);                                  // the hull
  rect(w, x0 + 1, base - 25, x1 - 1, base - 1, ID.EMPTY);
  rect(w, x0 + 4, base, x1 - 4, base, ID.THRUSTER, (i) => { w.aux[i] = opts.dir || 0; }); // its engine, in the floor
  rect(w, x0 + 5, base - 6, x1 - 4, base - 1, ID.TANK, (i) => { w.aux[i] = fuel; w.data[i] = fuel ? (opts.fill || 40) : 0; });
  rect(w, x0 + 3, base - 12, x0 + 8, base - 12, ID.GLASS);                     // a shelf
  rect(w, x0 + 3, base - 14, x0 + 4, base - 13, ID.BATTERY);
  rect(w, x0 + 5, base - 14, x0 + 5, base - 13, ID.SWITCH, (i) => { w.aux[i] = on ? 1 : 0; });
  rect(w, x0 + 6, base - 13, x0 + 6, base - 13, ID.WIRE);
  rect(w, x0 + 6, base - 12, x0 + 6, base - 12, ID.WIRE);                       // through the shelf…
  rect(w, x0 + 4, base - 11, x0 + 6, base - 11, ID.WIRE);                       // …and down beside the tank to the engine
  rect(w, x0 + 4, base - 11, x0 + 4, base - 1, ID.WIRE);
  if (opts.passenger) { w.place(w.idx(x0 + 10, base - 8), ID.HUMAN); w.place(w.idx(x0 + 10, base - 9), ID.HEAD); }
  return { x0, x1, base, g };
}
{
  const w = world(160, 200), r = rocket(w, 70, ID.OIL, true, { passenger: true });
  const y0 = top(w, ID.METAL), stone0 = count(w, ID.STONE);
  let fired = 0;
  run(w, 150, (ww) => { if (count(ww, ID.FIRE)) fired++; });
  const high = top(w, ID.METAL), head = top(w, ID.HEAD);
  check('A powered thruster with fuel lifts its ship off', high < y0 - 20 && fired > 50, `the hull's top rose from y=${y0} to y=${high}; flame on ${fired} ticks`);
  check('…carrying what is inside it, leaving the ground behind', head >= 0 && head < r.base - 30 && count(w, ID.STONE) === stone0, `passenger's head at y=${head}; ${stone0 - count(w, ID.STONE)} stone cells taken`);
}
{
  const off = world(); rocket(off, 70, ID.OIL, false);
  const y0 = top(off, ID.METAL);
  run(off, 200);
  const dry = world(); rocket(dry, 70, 0, true);
  run(dry, 200);
  check('Switched off, or with no fuel, it stays put', top(off, ID.METAL) === y0 && top(dry, ID.METAL) === y0 && count(off, ID.FIRE) === 0,
    `off: top at y=${top(off, ID.METAL)}; dry: y=${top(dry, ID.METAL)} (was ${y0})`);
}
{
  // a splash of fuel: it climbs, runs dry and comes back down, landing on its legs
  const w = world(160, 240); rocket(w, 70, ID.OIL, true, { fill: 1, legs: true });
  const y0 = top(w, ID.METAL);
  let peak = 999, falling = -1;
  run(w, 2000, (ww, k) => {
    const t = top(ww, ID.METAL);
    peak = Math.min(peak, t);
    if (falling < 0 && t > peak + 10) falling = k;
  });
  const fuel = (() => { let s = 0; for (let i = 0; i < w.N; i++) if (w.type[i] === ID.TANK) s += w.data[i]; return s; })();
  check('It burns its fuel, then falls back and lands', peak < y0 - 30 && fuel === 0 && falling > 0 && top(w, ID.METAL) === y0,
    `rose from y=${y0} to y=${peak}; fuel left ${fuel}; falling from tick ${falling}; at rest at y=${top(w, ID.METAL)}`);
}
{
  // a thruster facing right pushes the ship right
  const w = world(200, 120); rocket(w, 40, ID.OIL, true, { dir: 1 });
  const x0 = meanX(w, ID.METAL);
  run(w, 300);
  check('Facing right, it pushes its ship right', meanX(w, ID.METAL) > x0 + 15, `the hull moved from x=${x0.toFixed(0)} to x=${meanX(w, ID.METAL).toFixed(0)}`);
}
// a hard landing: drop a ship from high up, with and without legs
function drop(legs) {
  const w = world(160, 160);
  rect(w, 0, 150, 159, 159, ID.STONE);
  const x0 = 70, y = 20;
  rect(w, x0, y, x0 + 12, y + 12, ID.METAL);
  rect(w, x0 + 3, y + 12, x0 + 9, y + 12, ID.THRUSTER);
  if (legs) { rect(w, x0, y + 13, x0 + 1, y + 14, ID.LEGS); rect(w, x0 + 11, y + 13, x0 + 12, y + 14, ID.LEGS); }
  const n0 = count(w, ID.METAL) + count(w, ID.THRUSTER);
  run(w, 600);
  return { lost: n0 - count(w, ID.METAL) - count(w, ID.THRUSTER), scrap: count(w, ID.SCRAP), bottom: top(w, ID.THRUSTER) };
}
{
  const bare = drop(false), legs = drop(true);
  check('A hard landing breaks up its underside', bare.lost > 3 && bare.scrap > 0, `${bare.lost} cells lost, ${bare.scrap} scrap`);
  check('…landing legs take the blow', legs.lost === 0 && legs.bottom > 130, `${legs.lost} cells lost; it came to rest at y=${legs.bottom}`);
}
{
  // a ship too big to fly (built into a huge slab) stays where it is
  const w = world(200, 120);
  rect(w, 0, 60, 199, 99, ID.METAL);
  rect(w, 90, 100, 110, 100, ID.THRUSTER);
  rect(w, 90, 55, 110, 59, ID.TANK, (i) => { w.aux[i] = ID.OIL; w.data[i] = 40; });
  const y0 = top(w, ID.METAL);
  run(w, 200);
  check('Something huge built round a thruster stays put', top(w, ID.METAL) === y0, `top of the slab at y=${top(w, ID.METAL)} (was ${y0})`);
}

let fail = 0;
for (const r of out) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.label.padEnd(56)} ${r.detail}`);
}
process.exit(fail ? 1 : 0);
