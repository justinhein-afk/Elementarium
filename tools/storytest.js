// Plays the story chapters headless, over several seeded maps: each chapter must stay unsolved
// (or be lost) if the apprentice does nothing, and be won by doing the right thing.
// Run: node tools/storytest.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Seeded Math.random, so a failing map can be replayed (the chapters build with Math.random).
let seed = 1;
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

for (const f of ['elements.js', 'periodic.js', 'sim.js', 'scenes.js', 'story.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
}
const { ELEM, Sim, Story } = globalThis;
const ID = ELEM.ID;
const SEC = Story.SEC;
const SEEDS = [1, 2, 3];

// Plays a chapter for at most `secs` seconds; `act(w, s, spent)` runs before every tick.
function play(id, mapSeed, secs, act) {
  seed = mapSeed;
  const ch = Story.chapters.find((c) => c.id === id);
  const w = Sim.createWorld(...ch.size);
  for (const d of ELEM.list) w.disc[d.id] = 1;
  const s = Story.start(ch, w);
  const spent = {};
  let over = null;
  for (let k = 0; k < secs * SEC && !over; k++) {
    if (act) act(w, s, spent);
    w.step();
    w.resetEvents();
    over = Story.update(ch, w, s);
  }
  return { w, s, over, spent };
}

const soil = (w, x) => { let y = 0; while (y < w.H && w.type[w.idx(x, y)] !== ID.DIRT) y++; return y; };
const add = (spent, k, n) => { spent[k] = (spent[k] || 0) + n; };

let failures = 0;
function expect(label, want, runs) {
  const outcome = (r) => (!r.over ? 'unsolved' : r.over.won ? `won★${r.over.stars}` : 'lost');
  const ok = runs.every((r) => (want === 'won' ? r.over && r.over.won : !(r.over && r.over.won)));
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(34)} want ${want.padEnd(8)} ` +
    runs.map((r) => `${outcome(r)}@${Story.clock(r.s.t)}${Object.keys(r.spent).length ? ' ' + JSON.stringify(r.spent) : ''}`).join('  '));
}

// ── Chapter I: the dry season ──
expect('I  · do nothing for 3 minutes', 'unsolved', SEEDS.map((sd) => play('drought', sd, 180)));

// sweep the Heat tool across the pond's surface until it has boiled off
const heatPond = (w, s, spent) => {
  if (s.t >= 30 * SEC) return;
  const p0 = Math.round(w.W * 0.05) + 6, p1 = Math.round(w.W * 0.27) - 6;
  const span = p1 - p0, k = s.t % (2 * span);
  const x = p0 + (k < span ? k : 2 * span - k);
  let y = 0;
  while (y < w.H && w.type[w.idx(x, y)] !== ID.WATER) y++;
  if (y < w.H) { w.heat(x, y, 4, 28); add(spent, 'heat', 1); }
};
expect('I  · heat the pond', 'won', SEEDS.map((sd) => play('drought', sd, 180, heatPond)));

// ── Chapter II: wildfire (rain at 0:30; won the moment no fire is left) ──
expect('II · do nothing', 'lost', SEEDS.map((sd) => play('wildfire', sd, 90)));

// clear a firebreak across the meadow at time `at`
const firebreak = (at, width) => (w, s, spent) => {
  if (s.t !== at * SEC) return;
  const x0 = Math.round(w.W * 0.63);
  for (let x = x0; x <= x0 + width; x += 2) add(spent, 'erase', w.erase(x, soil(w, x) - 2, 2));
};
expect('II · firebreak at 0:04', 'won', SEEDS.map((sd) => play('wildfire', sd, 90, firebreak(4, 20))));
expect('II · firebreak at 0:25 (too late)', 'lost', SEEDS.map((sd) => play('wildfire', sd, 90, firebreak(25, 20))));

// sweep water back and forth over a strip of the meadow so its grass greens, from a pouch of 1,500
const soak = (at, width) => (w, s, spent) => {
  if (s.t < at * SEC || (spent.water || 0) >= 1500) return;
  const x0 = Math.round(w.W * 0.63), k = (s.t - at * SEC) % (2 * width);
  const x = x0 + (k < width ? k : 2 * width - k);
  add(spent, 'water', w.paint(x, soil(w, x) - 6, 3, ID.WATER, 0.45, false, 1500 - (spent.water || 0)));
};
expect('II · soak the meadow at 0:02', 'won', SEEDS.map((sd) => play('wildfire', sd, 90, soak(2, 24))));

// ── Chapter III: the broken bridge ──
expect('III · do nothing', 'unsolved', SEEDS.map((sd) => play('bridge', sd, 160)));
const bridge = (w, s, spent) => {
  const g = s.g, c0 = s.c0, c1 = s.c1;
  if (s.t >= 2 * SEC && s.t < 40 * SEC && (spent.water || 0) < 1500) {
    // pour water into the gorge until it stands three cells below the road
    let y = g; while (y < w.H && w.type[w.idx(c0 + 3, y)] === ID.EMPTY) y++;
    if (y > g + 3) add(spent, 'water', w.paint(c0 + 6 + ((s.t >> 3) % 24), g - 2, 2, ID.WATER, 0.45, false, 1500 - (spent.water || 0)));
    return;
  }
  // then freeze the surface: the Cool tool on any open water left at the top
  if (s.t < 40 * SEC || s.crossing) return;
  for (let x = c0; x <= c1; x++) {
    let y = g - 3; while (y < w.H && w.type[w.idx(x, y)] === ID.EMPTY) y++;
    if (w.type[w.idx(x, y)] === ID.WATER) { w.heat(x, y + 1, 3, -18); add(spent, 'cool', 1); return; }
  }
};
expect('III · fill with water, then freeze it', 'won', SEEDS.map((sd) => play('bridge', sd, 200, bridge)));

// ── Chapter IV: the flooded mine ──
expect('IV · do nothing', 'lost', SEEDS.map((sd) => play('mine', sd, 70)));
const freezeSpring = (w, s, spent) => {
  if (s.t < 3 * SEC + 20 || s.t > 20 * SEC) return;
  const c = s.crack[2], x = (c % w.SW) - 1, y = ((c / w.SW) | 0) - 1;
  w.heat(x, y, 3, -18); add(spent, 'cool', 1);
};
expect('IV · freeze the spring', 'won', SEEDS.map((sd) => play('mine', sd, 70, freezeSpring)));
const drain = (w, s, spent) => {
  if (s.t !== 6 * SEC) return;
  // knock a hole through the gallery floor, near the shaft, into the cave below
  // at the far end, where the gallery is lowest and the water gathers
  const sx1 = Math.round(w.W * 0.22) + 6, gx1 = Math.round(w.W * 0.6), gy1 = Math.round(w.H * 0.7) + 4;
  const dip = Math.floor((gx1 - 24 - sx1) / 18);
  w.setBrush('box', gx1 - 26, gy1 + dip, gx1 - 22, gy1 + dip + 4);
  add(spent, 'erase', w.erase(0, 0, 0, 260));
  w.setBrush('circle');
};

// ── Chapter V: the waking mountain ──
expect('V · do nothing', 'lost', SEEDS.map((sd) => play('mountain', sd, 60)));
const quench = (w, s, spent) => {
  // a steady pour into the crater, a little at a time, for as long as the mountain erupts
  if (s.t < 6 * SEC || s.t > 40 * SEC || s.t % 3 || (spent.water || 0) >= 2400) return;
  const px = Math.round(w.W * 0.34), peak = Math.round(w.H * 0.32);
  add(spent, 'water', w.paint(px + ((s.t >> 3) % 7) - 3, peak - 8, 1, ID.WATER, 0.45, false, 2400 - (spent.water || 0)));
};
expect('V · quench the crater', 'won', SEEDS.map((sd) => play('mountain', sd, 60, quench)));

// ── Chapter VI: the dark city ──
expect('VI · do nothing', 'unsolved', SEEDS.map((sd) => play('city', sd, 70)));
const mend = (w, s, spent) => {
  if (s.t !== 1 * SEC) return;
  w.place(s.benchAt, ID.BATTERY); add(spent, 'battery', 1);
  for (const i of s.gaps) { w.place(i, ID.METAL); add(spent, 'metal', 1); }
};
expect('VI · battery and mend the line', 'won', SEEDS.map((sd) => play('city', sd, 70, mend)));

// ── Chapter VII: the heart ──
expect('VII · do nothing', 'lost', SEEDS.map((sd) => play('heart', sd, 60)));
const rods = (w, s, spent) => {
  if (s.t < 2 * SEC || s.t > 8 * SEC) return;
  // fill the channels with cadmium from the bottom up, a few cells a tick, as a player would
  let n = 0;
  for (const i of s.channels) { if (n >= 2) break; if (w.type[i] === ID.EMPTY) { w.place(i, ID.EL_GD); n++; } }
  add(spent, 'gadolinium', n);
};
expect('VII · fill the channels with gadolinium', 'won', SEEDS.map((sd) => play('heart', sd, 70, rods)));

console.log(failures ? `\n${failures} check(s) failed` : '\nall chapters behave');
process.exitCode = failures ? 1 : 0;
