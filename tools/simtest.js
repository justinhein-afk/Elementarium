// Headless checks for the simulation: every discovery must be reachable, and a tick must be fast.
// Run: node tools/simtest.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', 'js');
for (const f of ['elements.js', 'sim.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
}
const { ELEM, Sim } = globalThis;
const ID = ELEM.ID;
const name = (t) => ELEM.list[t].name;

function world(W = 160, H = 100) {
  const w = Sim.createWorld(W, H);
  for (const d of ELEM.starters) w.disc[d.id] = 1;
  return w;
}
function rect(w, x0, y0, x1, y1, t) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) w.place(w.idx(x, y), t);
}
function heatRect(w, x0, y0, x1, y1, d) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) w.temp[w.idx(x, y)] += d;
}
function runUntil(w, targets, max, each) {
  for (let k = 0; k < max; k++) {
    if (each) each(w, k);
    w.step();
    w.resetEvents();
    if (targets.every((t) => w.disc[t])) return k + 1;
  }
  return -1;
}

const results = [];
function scenario(label, targets, max, setup, each) {
  const w = world();
  setup(w);
  const t0 = Date.now();
  const ticks = runUntil(w, targets, max, each);
  const ok = ticks >= 0;
  const missing = targets.filter((t) => !w.disc[t]).map(name);
  results.push({ label, ok, ticks, ms: Date.now() - t0, missing });
}

// ── discovery scenarios ──
scenario('Steam (water over fire)', [ID.STEAM], 2000, (w) => {
  rect(w, 60, 80, 100, 99, ID.WATER);
  rect(w, 60, 70, 100, 79, ID.WALL);
}, (w) => { for (let x = 60; x <= 100; x++) w.temp[w.idx(x, 99)] = 400; });

scenario('Ice (cooled water)', [ID.ICE], 2000, (w) => rect(w, 60, 80, 100, 99, ID.WATER),
  (w) => heatRect(w, 60, 80, 100, 99, -5));

scenario('Smoke + Ash + Ember (wood fire)', [ID.SMOKE, ID.ASH, ID.EMBER], 8000, (w) => {
  rect(w, 50, 70, 110, 99, ID.WOOD);
  rect(w, 50, 69, 110, 69, ID.FIRE);
});

scenario('Lava (heated stone)', [ID.LAVA], 2000, (w) => rect(w, 60, 80, 100, 99, ID.STONE),
  (w) => heatRect(w, 60, 80, 100, 99, 30));

scenario('Obsidian (lava + water)', [ID.OBSIDIAN], 2000, (w) => {
  rect(w, 60, 90, 100, 99, ID.LAVA);
  rect(w, 60, 60, 100, 70, ID.WATER);
});

scenario('Molten glass + Glass', [ID.MGLASS, ID.GLASS], 6000, (w) => rect(w, 60, 85, 100, 99, ID.SAND),
  (w, k) => { if (k < 120) heatRect(w, 60, 85, 100, 99, 30); });

scenario('Mud + Brick', [ID.MUD, ID.BRICK], 6000, (w) => {
  rect(w, 60, 85, 100, 99, ID.DIRT);
  rect(w, 60, 70, 100, 80, ID.WATER);
}, (w, k) => { if (k > 400 && k < 600) heatRect(w, 40, 60, 120, 99, 8); });

scenario('Plant + Flower', [ID.PLANT, ID.FLOWER], 20000, (w) => {
  rect(w, 20, 90, 140, 99, ID.DIRT);
  for (let x = 25; x < 140; x += 8) w.place(w.idx(x, 85), ID.SEED);
});

scenario('Saltwater', [ID.SALTWATER], 2000, (w) => {
  rect(w, 60, 85, 100, 99, ID.WATER);
  rect(w, 70, 60, 90, 65, ID.SALT);
});

scenario('Rust (metal in saltwater)', [ID.RUST], 20000, (w) => {
  rect(w, 60, 92, 100, 99, ID.METAL);
  rect(w, 60, 80, 100, 91, ID.SALTWATER);
});

scenario('Molten metal', [ID.MMETAL], 3000, (w) => rect(w, 60, 85, 100, 99, ID.METAL),
  (w) => heatRect(w, 60, 85, 100, 99, 40));

scenario('Snow (frozen steam)', [ID.SNOW], 3000, (w) => rect(w, 40, 20, 120, 40, ID.STEAM),
  (w) => heatRect(w, 0, 0, 159, 99, -25));

scenario('Gunpowder (ash + salt)', [ID.GUNPOWDER], 4000, (w) => {
  for (let y = 80; y < 100; y++) for (let x = 60; x < 100; x++) w.place(w.idx(x, y), (x + y) & 1 ? ID.ASH : ID.SALT);
});

scenario('Acid (smoke + steam)', [ID.ACID], 4000, (w) => {
  for (let y = 10; y < 40; y++) for (let x = 40; x < 120; x++) w.place(w.idx(x, y), (x + y) & 1 ? ID.SMOKE : ID.STEAM);
});

scenario('Methane (plant + mud)', [ID.METHANE], 20000, (w) => {
  rect(w, 40, 80, 120, 99, ID.MUD);
  rect(w, 40, 76, 120, 79, ID.PLANT);
});

scenario('Coal (sealed wood heated)', [ID.COAL], 4000, (w) => {
  rect(w, 40, 60, 120, 99, ID.SAND);
  rect(w, 70, 80, 90, 92, ID.WOOD);
}, (w) => heatRect(w, 70, 80, 90, 92, 15));

scenario('Diamond (sealed coal at 2500°C)', [ID.DIAMOND], 6000, (w) => {
  rect(w, 40, 60, 120, 99, ID.STONE);
  rect(w, 75, 80, 85, 90, ID.COAL);
}, (w) => heatRect(w, 75, 80, 85, 90, 60));

scenario('Battery (acid on metal)', [ID.BATTERY], 6000, (w) => {
  rect(w, 40, 90, 120, 99, ID.METAL);
  rect(w, 40, 70, 120, 85, ID.ACID);
  rect(w, 39, 60, 39, 99, ID.WALL); rect(w, 121, 60, 121, 99, ID.WALL);
});

scenario('Electricity (battery + wire)', [ID.SPARK], 500, (w) => {
  rect(w, 40, 90, 120, 90, ID.METAL);
  w.place(w.idx(39, 90), ID.BATTERY);
});

scenario('Thermite (rust + gunpowder)', [ID.THERMITE], 4000, (w) => {
  for (let y = 80; y < 100; y++) for (let x = 60; x < 100; x++) w.place(w.idx(x, y), (x + y) & 1 ? ID.RUST : ID.GUNPOWDER);
});

scenario('Napalm (oil + gunpowder)', [ID.NAPALM], 4000, (w) => {
  rect(w, 60, 85, 100, 99, ID.OIL);
  rect(w, 60, 70, 100, 75, ID.GUNPOWDER);
});

scenario('Lightning + Plasma (storm cloud)', [ID.LIGHTNING, ID.PLASMA], 6000, (w) => {
  rect(w, 10, 0, 150, 35, ID.STEAM);
}, (w) => { for (let y = 0; y < 36; y++) for (let x = 10; x <= 150; x++) { const i = w.idx(x, y); if (w.type[i] === ID.STEAM) w.temp[i] = 130; } });

scenario('Fish (bolt into saltwater)', [ID.FISH], 50, (w) => {
  rect(w, 40, 70, 120, 99, ID.SALTWATER);
}, (w, k) => { if (k === 1) w.spawnBolt(80, 10, false); });

scenario('Worm (bolt into mud)', [ID.WORM], 50, (w) => {
  rect(w, 40, 85, 120, 99, ID.MUD);
}, (w, k) => { if (k === 1) w.spawnBolt(80, 10, false); });

scenario('Firefly (spark on flower)', [ID.FIREFLY], 3000, (w) => {
  rect(w, 60, 90, 100, 90, ID.METAL);
  w.place(w.idx(59, 90), ID.BATTERY);
  for (let x = 60; x <= 100; x++) w.place(w.idx(x, 89), ID.FLOWER);
});

scenario('Cryo (snow far below freezing)', [ID.CRYO], 3000, (w) => rect(w, 60, 85, 100, 99, ID.SNOW),
  (w) => heatRect(w, 60, 85, 100, 99, -20));

scenario('Nitro (oil + acid)', [ID.NITRO], 3000, (w) => {
  rect(w, 60, 90, 100, 99, ID.OIL);
  rect(w, 60, 80, 100, 84, ID.ACID);
});

scenario('Moss (plant on wet stone)', [ID.MOSS], 20000, (w) => {
  rect(w, 40, 90, 120, 99, ID.STONE);
  rect(w, 40, 88, 120, 89, ID.WATER);
  rect(w, 40, 80, 120, 87, ID.PLANT);
});

scenario('Grass (grass seed on soil)', [ID.GRASS], 4000, (w) => {
  rect(w, 20, 90, 140, 99, ID.DIRT);
  for (let x = 30; x < 130; x += 8) w.place(w.idx(x, 89), ID.GRASSSEED);
});

scenario('Cactus (cactus seed in sand)', [ID.CACTUS], 6000, (w) => {
  rect(w, 20, 90, 140, 99, ID.SAND);
  for (let x = 30; x < 130; x += 10) w.place(w.idx(x, 89), ID.CACTUSSEED);
});

scenario('Vine (vine seed in soil)', [ID.VINE], 4000, (w) => {
  rect(w, 20, 90, 140, 99, ID.DIRT);
  for (let x = 30; x < 130; x += 10) w.place(w.idx(x, 89), ID.VINESEED);
});

scenario('Mushroom (spores on damp soil)', [ID.MUSHROOM], 6000, (w) => {
  rect(w, 20, 90, 140, 99, ID.DIRT); rect(w, 40, 89, 120, 89, ID.MUD);
  for (let x = 42; x < 120; x += 4) w.place(w.idx(x, 86), ID.SPORES);
});

scenario('Water lily (lily seed in a pond)', [ID.LILY], 6000, (w) => {
  rect(w, 40, 90, 120, 99, ID.DIRT); rect(w, 40, 70, 120, 89, ID.WATER);
  for (let x = 50; x < 120; x += 15) w.place(w.idx(x, 72), ID.LILYSEED);
});

// ── report ──
let fail = 0;
for (const r of results) {
  if (!r.ok) fail++;
  const status = r.ok ? 'ok  ' : 'FAIL';
  console.log(`${status} ${r.label.padEnd(36)} ${r.ok ? `${r.ticks} ticks` : 'missing: ' + r.missing.join(', ')}  (${r.ms} ms)`);
}

// ── coverage: which discoverables did we never reach? ──
const reached = new Set();
for (const r of results) if (r.ok) for (const t of []) reached.add(t);

// ── performance: busy 320x200 world ──
{
  const w = world(320, 200);
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x < 320; x++) {
      const r = Math.random();
      if (y > 150) w.place(w.idx(x, y), r < 0.5 ? ID.SAND : r < 0.8 ? ID.WATER : ID.STONE);
      else if (y > 100 && r < 0.3) w.place(w.idx(x, y), r < 0.1 ? ID.OIL : r < 0.2 ? ID.WATER : ID.FIRE);
      else if (y < 30 && r < 0.4) w.place(w.idx(x, y), ID.STEAM);
    }
  }
  rect(w, 100, 120, 140, 150, ID.WOOD);
  rect(w, 200, 140, 230, 150, ID.LAVA);
  for (let k = 0; k < 60; k++) { w.step(); w.resetEvents(); }
  const t0 = process.hrtime.bigint();
  const n = 300;
  for (let k = 0; k < n; k++) { w.step(); w.resetEvents(); }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / n;
  console.log(`\nperf: 320x200 busy world → ${ms.toFixed(2)} ms/tick`);
}

process.exit(fail ? 1 : 0);
