// Can a player brew a thunderstorm the way the hint suggests? Hold the Heat tool on a big pool.
// Run: node tools/stormtest.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
for (const f of ['elements.js', 'sim.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
}
const { ELEM, Sim } = globalThis;
const ID = ELEM.ID;

for (const [label, setup, each] of [
  ['heat tool sweeping a pool', (w) => {
    for (let y = 140; y < 200; y++) for (let x = 0; x < w.W; x++) w.place(w.idx(x, y), ID.WATER);
  }, (w, k) => {
    const x = 20 + ((k * 2) % (w.W - 40)); // the player sweeps the brush back and forth
    w.heat(x, 150, 8, 28);
  }],
  ['lava under a lake', (w) => {
    for (let y = 120; y < 185; y++) for (let x = 0; x < w.W; x++) w.place(w.idx(x, y), ID.WATER);
    for (let y = 185; y < 200; y++) for (let x = 0; x < w.W; x++) w.place(w.idx(x, y), ID.LAVA);
  }, null],
]) {
  const w = Sim.createWorld(258, 200);
  for (const d of ELEM.list) if (d.starter || d.hidden || d.special) w.disc[d.id] = 1;
  setup(w);
  let found = -1, maxSteam = 0, bolts = 0;
  for (let k = 0; k < 60 * 120; k++) {
    if (each) each(w, k);
    w.step();
    bolts += w.events.bolts.length / 4;
    w.resetEvents();
    if (k % 60 === 0) maxSteam = Math.max(maxSteam, w.counts[ID.STEAM]);
    if (found < 0 && w.disc[ID.LIGHTNING]) found = k;
  }
  console.log(`${label.padEnd(28)} lightning at ${found < 0 ? 'never' : (found / 60).toFixed(1) + 's'} · peak steam ${maxSteam} · bolts in 2 min ${bolts}`);
}
