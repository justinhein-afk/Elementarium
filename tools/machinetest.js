// Headless checks for the machine parts: wire, switch, sensor, pipe, valve, pump, tank and piston,
// and the Machines section they sit in.
// Run: node tools/machinetest.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
for (const f of ['elements.js', 'periodic.js', 'materials.js', 'sim.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
}
const { ELEM, Sim } = globalThis;
const { ID, byKey } = ELEM;

const out = [];
const check = (label, ok, detail) => out.push({ label, ok, detail });
function world(W = 60, H = 40) { const w = Sim.createWorld(W, H); w.disc.fill(1); w.ambient = 20; return w; }
const rect = (w, x0, y0, x1, y1, t) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) w.place(w.idx(x, y), t); };
const cells = (w, pred) => { let n = 0; for (let i = 0; i < w.N; i++) if (pred(w.type[i], i)) n++; return n; };
const count = (w, t) => cells(w, (u) => u === t);
const inBox = (w, x0, y0, x1, y1, t) => { let n = 0; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (w.type[w.idx(x, y)] === t) n++; return n; };
function run(w, ticks, each) { for (let k = 0; k < ticks; k++) { w.step(); const stop = each && each(w, k) === false; w.resetEvents(); if (stop) return k; } return ticks; }
const set = (w, x, y, t, aux, data) => { const i = w.idx(x, y); w.place(i, t); if (aux !== undefined) w.aux[i] = aux; if (data !== undefined) w.data[i] = data; return i; };
// a battery feeding a run of wire to (x1, y)
const circuit = (w, x0, x1, y, t = ID.WIRE) => { set(w, x0, y, ID.BATTERY); rect(w, x0 + 1, y, x1, y, t); };
// how often cell i is powered (a machine) or carries a pulse, over n ticks
const live = (w, i, n, machine) => { let k = 0; run(w, n, (ww) => { if (machine ? ww.sap[i] > 0 : ww.charge[i] > 0) k++; }); return k; };

// ── the section ──
{
  const parts = ['battery', 'wire', 'switch', 'sensor', 'pipe', 'valve', 'pump', 'tank', 'piston'];
  check('A Machines section holds the battery and the parts', ELEM.GROUPS.includes('Machines') && parts.every((k) => byKey[k].group === 'Machines')
    && parts.slice(1).every((k) => byKey[k].special && byKey[k].needs === 'battery'),
    `${parts.length} in Machines; the parts open with the battery`);
}

// ── wire and switches ──
{
  const w = world();
  const basin = (ww) => { rect(ww, 9, 17, 31, 17, ID.WALL); rect(ww, 9, 12, 9, 16, ID.WALL); rect(ww, 31, 12, 31, 16, ID.WALL); rect(ww, 10, 12, 30, 16, ID.WATER); };
  circuit(w, 2, 30, 10);
  basin(w); rect(w, 5, 11, 30, 11, ID.WIRE); set(w, 5, 10, ID.WIRE); // a wire laid along the water's surface
  const far = w.idx(30, 10);
  const wireLive = live(w, far, 120);
  const wetWater = cells(w, (t, i) => t === ID.WATER && w.charge[i] > 0);
  const m = world();
  circuit(m, 2, 30, 10, ID.METAL);
  basin(m); rect(m, 5, 11, 30, 11, ID.METAL); set(m, 5, 10, ID.METAL);
  let leak = 0;
  run(m, 120, (ww) => { leak = Math.max(leak, cells(ww, (t, i) => t === ID.WATER && ww.charge[i] > 0)); });
  check('Wire carries current, and keeps it out of the water round it (metal doesn\'t)', wireLive > 20 && wetWater === 0 && leak > 0,
    `far end live ${wireLive} of 120 ticks; water charged beside wire 0, beside metal ${leak}`);
  const w2 = world();
  circuit(w2, 2, 20, 10);
  rect(w2, 21, 10, 22, 10, ID.SWITCH); rect(w2, 23, 10, 30, 10, ID.WIRE);
  for (let x = 21; x <= 22; x++) w2.aux[w2.idx(x, 10)] = 1;
  const end = w2.idx(30, 10);
  const on = live(w2, end, 120);
  const flipped = w2.flip(21, 10);
  run(w2, 20); // the last pulse past it dies away
  const off = live(w2, end, 120);
  w2.flip(22, 10);
  const back = live(w2, end, 120);
  check('A switch lets current through while on; a click flips it and the switches joined to it', on > 20 && off === 0 && back > 20 && flipped === 2,
    `live past it ${on} / ${off} / ${back} ticks (on, off, on again); flipped ${flipped} at once`);
}

// ── sensors ──
{
  const w = world();
  const s = set(w, 20, 20, ID.SENSOR, 1 << 1, 300); // hotter than 300°C
  rect(w, 21, 20, 30, 20, ID.WIRE);
  const end = w.idx(30, 20);
  const cold = live(w, end, 100);
  rect(w, 16, 19, 19, 21, ID.STONE); rect(w, 16, 22, 21, 22, ID.WALL); // a block of stone at 900°C against it
  for (let y = 19; y <= 21; y++) for (let x = 16; x <= 19; x++) w.temp[w.idx(x, y)] = 900;
  const hot = live(w, end, 100);
  const t2 = world();
  set(t2, 20, 20, ID.SENSOR, 0, 0); rect(t2, 21, 20, 30, 20, ID.WIRE); rect(t2, 0, 21, 59, 21, ID.WALL);
  const e2 = t2.idx(30, 20);
  const bare = live(t2, e2, 100);
  set(t2, 20, 15, ID.SAND);
  const touched = live(t2, e2, 100);
  check('A sensor sends current when what touches it is hotter than its setting, or when something lands on it',
    cold === 0 && hot > 20 && bare === 0 && touched > 20, `set to 300°C: ${cold} live ticks cold, ${hot} against lava; touch: ${bare} bare, ${touched} with sand on it`);
}

// ── pipes, pumps, valves and tanks ──
{
  // gravity: a pool drains into an open top end and runs down the pipe and out of the bottom
  const w = world();
  rect(w, 0, 39, 59, 39, ID.WALL);
  rect(w, 4, 4, 4, 12, ID.WALL); rect(w, 16, 4, 16, 12, ID.WALL); rect(w, 4, 12, 16, 12, ID.WALL); // a basin up high…
  rect(w, 5, 6, 15, 11, ID.WATER);
  w.place(w.idx(10, 12), ID.PIPE); rect(w, 10, 13, 10, 30, ID.PIPE); rect(w, 11, 30, 40, 30, ID.PIPE); rect(w, 40, 31, 40, 34, ID.PIPE); // …and a pipe down, along and down
  w.encase([[10, 12, 0], [40, 34, 0]], true); // walled in, open at its two ends
  const w0 = inBox(w, 5, 5, 15, 11, ID.WATER);
  run(w, 900);
  const left = inBox(w, 5, 5, 15, 11, ID.WATER), below = inBox(w, 0, 31, 59, 38, ID.WATER);
  check('Water drains into a pipe\'s open top end, runs down and along it, and pours out of the far end', left < w0 * 0.3 && below > w0 * 0.5,
    `${w0} cells in the basin → ${left}; ${below} came out at the bottom`);
  // with no push, water won't climb
  const u = world();
  rect(u, 0, 39, 59, 39, ID.WALL);
  rect(u, 5, 30, 15, 38, ID.WATER); rect(u, 4, 29, 4, 38, ID.WALL); rect(u, 16, 20, 16, 38, ID.WALL);
  u.place(u.idx(10, 29), ID.PIPE); // a pipe end sitting in the pool's surface, going up
  rect(u, 10, 15, 10, 28, ID.PIPE); rect(u, 11, 15, 25, 15, ID.PIPE);
  u.encase([[10, 29, 0], [25, 15, 0]], true);
  run(u, 600);
  const climbed = inBox(u, 17, 16, 59, 38, ID.WATER);
  // a pump lifts it: the same pool, a pump on its bottom pushing up the pipe
  const p = world();
  rect(p, 0, 39, 59, 39, ID.WALL);
  rect(p, 5, 30, 15, 38, ID.WATER); rect(p, 4, 20, 4, 38, ID.WALL); rect(p, 16, 20, 16, 38, ID.WALL);
  const pmp = set(p, 10, 38, ID.PUMP, 0, 0); // facing up (data: the way it faces)
  rect(p, 10, 15, 10, 37, ID.PIPE); rect(p, 11, 15, 25, 15, ID.PIPE); rect(p, 25, 16, 25, 18, ID.PIPE);
  for (let y = 30; y <= 37; y++) p.place(p.idx(10, y), ID.PIPE); // (the pipe runs up through the pool)
  circuit(p, 40, 44, 38); rect(p, 11, 38, 15, 38, ID.WATER); rect(p, 9, 37, 9, 37, ID.WIRE);
  // power it straight from a battery on its far side
  set(p, 9, 38, ID.WIRE); set(p, 8, 38, ID.BATTERY); rect(p, 5, 38, 7, 38, ID.WATER);
  p.encase([[25, 18, 0]], true);
  run(p, 1500);
  const lifted = inBox(p, 17, 19, 59, 38, ID.WATER);
  check('Water won\'t climb a pipe by itself, but a powered pump pushes it up and over', climbed < 5 && lifted > 20, // (a drop or two of evaporated water can condense past the wall)
    `with no pump ${climbed} cells got over the wall; with a pump ${lifted}`);
  // a valve stops the flow until it is powered
  const v = world();
  rect(v, 0, 39, 59, 39, ID.WALL);
  rect(v, 4, 4, 4, 12, ID.WALL); rect(v, 16, 4, 16, 12, ID.WALL); rect(v, 4, 12, 16, 12, ID.WALL);
  rect(v, 5, 6, 15, 11, ID.WATER);
  v.place(v.idx(10, 12), ID.PIPE); rect(v, 10, 13, 10, 18, ID.PIPE);
  const valve = set(v, 10, 19, ID.VALVE); rect(v, 10, 20, 10, 30, ID.PIPE);
  v.encase([[10, 12, 0], [10, 30, 0]], true);
  run(v, 400);
  const shut = inBox(v, 0, 31, 59, 38, ID.WATER);
  set(v, 11, 19, ID.WIRE); set(v, 12, 19, ID.WIRE); set(v, 13, 19, ID.BATTERY);
  run(v, 600);
  const opened = inBox(v, 0, 31, 59, 38, ID.WATER);
  check('A valve holds the water back until it is powered', shut === 0 && opened > 15, `${shut} through while shut, ${opened} once powered`);
  // a tank fills from a pipe, and a pipe under it draws it back out
  const t = world();
  rect(t, 0, 39, 59, 39, ID.WALL);
  rect(t, 4, 4, 4, 10, ID.WALL); rect(t, 16, 4, 16, 10, ID.WALL); rect(t, 4, 10, 16, 10, ID.WALL);
  rect(t, 5, 5, 15, 9, ID.WATER);
  t.place(t.idx(10, 10), ID.PIPE); rect(t, 10, 11, 10, 15, ID.PIPE);
  rect(t, 8, 16, 12, 18, ID.TANK); // a 5 × 3 tank
  t.encase([[10, 10, 0]], true);
  const stored = () => cells(t, (u, i) => u === ID.TANK && t.aux[i] === ID.WATER ? true : false) && Array.from(t.data).reduce((s, d, i) => s + (t.type[i] === ID.TANK ? d : 0), 0);
  run(t, 900);
  const inTank = stored();
  const lowest = Math.min(...[8, 9, 10, 11, 12].map((x) => t.data[t.idx(x, 18)]));
  set(t, 10, 19, ID.VALVE); rect(t, 10, 20, 10, 30, ID.PIPE);
  t.encase([[10, 30, 0]], true);
  set(t, 11, 19, ID.WIRE); set(t, 12, 19, ID.BATTERY);
  run(t, 900);
  const after = stored(), out2 = inBox(t, 0, 31, 59, 38, ID.WATER);
  check('A tank fills from a pipe and settles to its bottom; a valve under it lets it out', inTank >= 40 && lowest > 0 && after < inTank && out2 > 10,
    `${inTank} cells' worth stored (bottom row ${lowest}+ each); after opening the valve ${after} left, ${out2} poured out`);
  // a cold pipe condenses steam; a hot one boils water
  const h = world();
  rect(h, 0, 39, 59, 39, ID.WALL);
  rect(h, 4, 4, 4, 10, ID.WALL); rect(h, 16, 4, 16, 10, ID.WALL); rect(h, 4, 10, 16, 10, ID.WALL);
  rect(h, 5, 5, 15, 9, ID.WATER);
  h.place(h.idx(10, 10), ID.PIPE); rect(h, 10, 11, 10, 30, ID.PIPE);
  h.encase([[10, 10, 0]], true); // open at the top only: the water stands in it
  rect(h, 12, 18, 14, 24, ID.LAVA); rect(h, 12, 25, 14, 25, ID.WALL); rect(h, 15, 18, 15, 25, ID.WALL); // lava against the pipe's wall
  let steam = 0;
  run(h, 900, (ww) => { steam = Math.max(steam, cells(ww, (u, i) => u === ID.PIPE && ww.aux[i] === ID.STEAM)); });
  check('Water running through a pipe past lava boils to steam inside it', steam > 0, `up to ${steam} pipe cells of steam`);
}

// ── one brush stroke, one machine ──
{
  // a thick pipe drawn in one stroke from a basin down and out is one pipe, walled in on every edge:
  // sealed until a bit of its wall is erased at each end
  const w = world(80, 60);
  rect(w, 0, 59, 79, 59, ID.WALL);
  rect(w, 10, 4, 10, 20, ID.WALL); rect(w, 40, 4, 40, 20, ID.WALL); rect(w, 10, 20, 40, 20, ID.WALL);
  rect(w, 11, 8, 39, 19, ID.WATER);
  w.beginStroke();
  for (let y = 16; y <= 44; y++) w.paint(25, y, 3, ID.PIPE, 1, true); // a pipe 7 cells wide, from in the water down through the floor
  const walls = w.encase();
  const holes = cells(w, (t, i) => t === ID.PIPE && [-1, 1, -w.SW, w.SW].some((d) => w.type[i + d] === ID.EMPTY || w.type[i + d] === ID.WATER));
  const bore = count(w, ID.PIPE), w0 = inBox(w, 11, 8, 39, 19, ID.WATER);
  run(w, 300);
  const sealedOut = inBox(w, 0, 46, 79, 58, ID.WATER);
  w.setBrush('circle'); w.erase(25, 12, 4); w.erase(25, 48, 4); // a hole in the wall at the top (in the water) and at the bottom
  run(w, 900);
  const left = inBox(w, 11, 8, 39, 19, ID.WATER), out = inBox(w, 0, 46, 79, 58, ID.WATER);
  check('A pipe drawn thick in one stroke is one pipe, walled in on every edge; erase a hole at each end and it drains',
    walls > 20 && holes === 0 && sealedOut === 0 && left < w0 * 0.5 && out > w0 * 0.25,
    `${bore} cells of bore, ${walls} of wall, ${holes} gaps; ${sealedOut} out while sealed; with holes: basin ${w0} → ${left}, ${out} poured out`);
  // a blob of pump is one pump: wired at one corner, every cell of it runs
  const p = world(60, 40);
  rect(p, 0, 39, 59, 39, ID.WALL);
  for (let y = 30; y <= 32; y++) for (let x = 20; x <= 24; x++) set(p, x, y, ID.PUMP, 0, 0); // 5 × 3, facing up
  set(p, 19, 32, ID.WIRE); set(p, 18, 32, ID.BATTERY);
  let all = 0;
  run(p, 120, (ww) => { all = Math.max(all, cells(ww, (t, i) => t === ID.PUMP && ww.sap[i] > 0)); });
  // and a blob of valve is one valve
  const v = world(60, 40);
  for (let y = 10; y <= 12; y++) for (let x = 20; x <= 24; x++) set(v, x, y, ID.VALVE);
  set(v, 25, 12, ID.WIRE); set(v, 26, 12, ID.BATTERY);
  let open = 0;
  run(v, 120, (ww) => { open = Math.max(open, cells(ww, (t, i) => t === ID.VALVE && ww.sap[i] > 0)); });
  check('A blob of pump or valve is one machine: power at one corner runs every cell', all === 15 && open === 15, `${all} of 15 pump cells, ${open} of 15 valve cells powered`);
}

// ── pistons ──
{
  const w = world();
  rect(w, 0, 39, 59, 39, ID.WALL);
  const p = set(w, 10, 30, ID.PISTON, 1); // facing right
  rect(w, 11, 30, 13, 30, ID.STONE);       // three blocks in front
  set(w, 9, 30, ID.WIRE); set(w, 8, 30, ID.BATTERY);
  run(w, 200);
  const rod = cells(w, (t, i) => t === ID.ROD), stone = inBox(w, 0, 30, 59, 30, ID.STONE);
  let firstStone = 99; for (let x = 0; x < 60; x++) if (w.type[w.idx(x, 30)] === ID.STONE) { firstStone = x; break; }
  w.place(w.idx(8, 30), ID.EMPTY); // battery off
  run(w, 200);
  const back = cells(w, (t) => t === ID.ROD);
  check('A powered piston pushes out its rod and shoves what is in front, up to 16 cells; unpowered, it pulls it back',
    rod === 16 && stone === 3 && firstStone === 27 && back === 0, `rod ${rod} cells, stone now from x=${firstStone} (${stone} of 3); rod after power off ${back}`);
  const b = world();
  set(b, 10, 30, ID.PISTON, 1); rect(b, 11, 30, 14, 30, ID.SAND); set(b, 15, 30, ID.WALL);
  set(b, 9, 30, ID.WIRE); set(b, 8, 30, ID.BATTERY); rect(b, 0, 31, 59, 31, ID.WALL);
  run(b, 200);
  check('A wall stops it', cells(b, (t) => t === ID.ROD) === 0 && inBox(b, 11, 30, 14, 30, ID.SAND) === 4, `rod ${cells(b, (t) => t === ID.ROD)} cells`);
  // a piston pushing up holds a column of cadmium up, and drops it when the power goes (a control rod)
  const c = world();
  rect(c, 0, 39, 59, 39, ID.WALL); rect(c, 19, 10, 19, 38, ID.WALL); rect(c, 21, 10, 21, 38, ID.WALL);
  set(c, 20, 38, ID.PISTON, 0); rect(c, 20, 30, 20, 37, ID.EL_CD);
  set(c, 22, 38, ID.BATTERY); set(c, 21, 38, ID.WIRE);
  run(c, 200);
  let top = 99; for (let y = 0; y < 40; y++) if (c.type[c.idx(20, y)] === ID.EL_CD) { top = y; break; }
  c.place(c.idx(22, 38), ID.EMPTY);
  run(c, 300);
  let top2 = 99; for (let y = 0; y < 40; y++) if (c.type[c.idx(20, y)] === ID.EL_CD) { top2 = y; break; }
  check('Pushing up, it raises a column of cadmium, which drops back when the power goes', top === 14 && top2 === 30, `top of the cadmium y=${top} raised, y=${top2} after`);
}

// ── Shock and Ground, the two tools that act on current while they are held ──
{
  const w = world(80, 30);
  rect(w, 13, 11, 50, 11, ID.WIRE); // no battery anywhere
  rect(w, 51, 10, 53, 12, ID.PUMP);
  const pump = w.idx(52, 11);
  const on = (n) => { let c = 0; for (let k = 0; k < n; k++) { w.step(); w.resetEvents(); if (w.sap[pump] > 0) c++; } return c; };
  const dead = on(120);
  w.shock({ x: 30, y: 11, r: 3 });
  on(120);
  const shocked = on(120);
  w.shock(null);
  on(120);
  const letGo = on(120);
  check('Shock runs electricity with no battery while it is held', dead === 0 && shocked > 90 && letGo === 0, `pump powered ${dead} of 120 dead, ${shocked} of 120 shocked, ${letGo} of 120 let go`);
  w.shock({ x: 52, y: 11, r: 2 });
  on(20);
  const direct = on(60);
  w.shock(null);
  on(120);
  check('Held on a machine, Shock powers it directly', direct > 50, `pump powered ${direct} of 60`);
  rect(w, 10, 10, 12, 12, ID.BATTERY); // a battery on the wire, for Ground
  on(120);
  const free = on(120);
  w.ground({ x: 32, y: 11, r: 3 });
  on(90); // pulses already past it run on to the pump
  const grounded = on(120);
  w.ground(null);
  on(120);
  const back = on(120);
  check('Ground draws current off while it is held', free > 90 && grounded === 0 && back > 90, `pump powered ${free} of 120 free, ${grounded} grounded, ${back} let go`);
}
{ // in the open: sparks in the air, and gunpowder catches
  const w = world(60, 40);
  rect(w, 20, 30, 40, 34, ID.GUNPOWDER);
  let sparks = 0, lit = false;
  w.shock({ x: 30, y: 26, r: 6 });
  for (let k = 0; k < 120; k++) { w.step(); w.resetEvents(); sparks = Math.max(sparks, w.counts[ID.SPARK]); if (w.counts[ID.GUNPOWDER] < 100) lit = true; }
  w.shock(null);
  check('Shock fills the air with sparks, and sets gunpowder off', sparks > 0 && lit, `up to ${sparks} sparks; gunpowder left ${w.counts[ID.GUNPOWDER]} of 105`);
}

let fail = 0;
for (const r of out) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.label.padEnd(58)} ${r.detail}`);
}
process.exit(fail ? 1 : 0);
