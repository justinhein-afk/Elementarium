// Headless checks for the plants: each kind of seed must sprout where its plant really would and
// grow the plant's shape; painting a plant must plant it rather than stamp a block; and plants
// need water from their roots: cut off, on bare rock or frozen they dry out and crumble.
// Run: node tools/planttest.js            (add --show to print each world as text)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', 'js');
for (const f of ['elements.js', 'periodic.js', 'sim.js', 'scenes.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
}
const { ELEM, Sim, Scenes } = globalThis;
const ID = ELEM.ID;
const SHOW = process.argv.includes('--show');
const LEAF = Sim.LEAF;

function world(W = 120, H = 90) {
  const w = Sim.createWorld(W, H);
  for (const d of ELEM.list) w.disc[d.id] = 1;
  return w;
}
function rect(w, x0, y0, x1, y1, t) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) w.place(w.idx(x, y), t);
}
function run(w, n) { for (let k = 0; k < n; k++) { w.step(); w.resetEvents(); } }
function cells(w, test) {
  const out = [];
  for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) { const i = w.idx(x, y); if (test(w.type[i], i)) out.push([x, y]); }
  return out;
}
const CH = { [ID.STONE]: '#', [ID.WALL]: '#', [ID.DIRT]: ':', [ID.MUD]: ';', [ID.SAND]: '.', [ID.WATER]: '~', [ID.WOOD]: '|',
  [ID.PLANT]: '*', [ID.GRASS]: '"', [ID.CACTUS]: 'C', [ID.VINE]: 'v', [ID.MUSHROOM]: 'm', [ID.LILY]: 'o', [ID.FLOWER]: '@', [ID.SAPLING]: 'T' };
function show(label, w) {
  if (!SHOW) return;
  console.log(`── ${label}`);
  for (let y = 0; y < w.H; y++) {
    let s = '';
    for (let x = 0; x < w.W; x++) { const t = w.type[w.idx(x, y)]; s += t === ID.EMPTY ? ' ' : CH[t] || '?'; }
    if (s.trim()) console.log(s);
  }
}

const out = [];
const check = (label, ok, detail) => out.push({ label, ok, detail });

// An acorn in damp soil grows into an oak: a tall trunk and a crown of leaves.
{
  const tops = [], leaves = [];
  for (let k = 0; k < 3; k++) {
    const w = world();
    rect(w, 0, 80, 119, 89, ID.DIRT); rect(w, 50, 79, 70, 79, ID.MUD);
    w.place(w.idx(60, 78), ID.ACORN);
    run(w, 6000);
    const wood = cells(w, (t) => t === ID.WOOD);
    tops.push(80 - Math.min(...wood.map(([, y]) => y)));
    leaves.push(cells(w, (t, i) => t === ID.PLANT && (w.flags[i] & LEAF)).length);
    if (k === 0) show('oak', w);
  }
  check('An acorn grows into an oak', Math.min(...tops) >= 8 && Math.min(...leaves) >= 60,
    `trunk ${tops.join(', ')} cells tall; ${leaves.join(', ')} leaves`);
}

// Grass seed creeps across a strip of soil.
{
  const w = world();
  rect(w, 0, 80, 119, 89, ID.DIRT);
  for (let x = 55; x <= 65; x += 2) w.place(w.idx(x, 79), ID.GRASSSEED);
  run(w, 4000);
  const cols = new Set(cells(w, (t) => t === ID.GRASS).map(([x]) => x));
  show('grass', w);
  check('Grass spreads over bare soil', cols.size >= 70, `${cols.size} of 120 columns green after 4000 ticks`);
}

// A cactus grows in dry sand, but a cactus seed in soil never sprouts.
{
  const w = world();
  rect(w, 0, 80, 59, 89, ID.SAND); rect(w, 60, 80, 119, 89, ID.DIRT);
  for (const x of [15, 35, 75, 95]) w.place(w.idx(x, 79), ID.CACTUSSEED);
  run(w, 5000);
  const cac = cells(w, (t) => t === ID.CACTUS);
  const inSand = cac.filter(([x]) => x < 60), inSoil = cac.filter(([x]) => x >= 60);
  const tall = inSand.length ? 80 - Math.min(...inSand.map(([, y]) => y)) : 0;
  show('cactus', w);
  check('Cactus grows in sand, not in soil', inSand.length >= 20 && tall >= 6 && inSoil.length === 0,
    `${inSand.length} cactus cells in sand (${tall} tall), ${inSoil.length} in soil`);
  // now flood it: it rots
  const before = inSand.length;
  for (let y = 60; y < 80; y++) for (let x = 0; x < 60; x++) { const i = w.idx(x, y); if (w.type[i] === ID.EMPTY) w.place(i, ID.WATER); }
  run(w, 3000);
  const after = cells(w, (t) => t === ID.CACTUS).length;
  check('Drowned cactus rots', after < before * 0.5, `${before} cactus cells → ${after} after 3000 ticks under water`);
}

// A vine climbs a wall; with nothing to climb it trails along the ground.
{
  const w = world();
  rect(w, 0, 80, 119, 89, ID.DIRT); rect(w, 30, 30, 32, 79, ID.WALL);
  w.place(w.idx(29, 79), ID.VINESEED); w.place(w.idx(90, 79), ID.VINESEED);
  run(w, 5000);
  const v = cells(w, (t) => t === ID.VINE);
  const byWall = v.filter(([x]) => x < 60), open = v.filter(([x]) => x >= 60 && x < 112); // the world's edge is a wall too
  const climbed = byWall.length ? 80 - Math.min(...byWall.map(([, y]) => y)) : 0;
  const rose = open.length ? 80 - Math.min(...open.map(([, y]) => y)) : 0;
  const spread = open.length ? Math.max(...open.map(([x]) => x)) - Math.min(...open.map(([x]) => x)) : 0;
  show('vine', w);
  check('A vine climbs a wall', climbed >= 20, `climbed ${climbed} cells up the wall`);
  check('With nothing to climb it trails', rose <= 4 && spread >= 10, `in the open it rose ${rose} cells and spread ${spread} cells along the ground`);
}

// Spores grow mushrooms in a damp cave, and none on dry open ground.
{
  const w = world();
  rect(w, 0, 80, 119, 89, ID.DIRT);
  rect(w, 0, 60, 59, 63, ID.STONE); rect(w, 10, 78, 14, 79, ID.MUD); // a cave roof over the left half, a damp patch
  for (let x = 5; x < 115; x += 3) w.place(w.idx(x, 70), ID.SPORES);
  run(w, 3000);
  const caps = cells(w, (t, i) => t === ID.MUSHROOM && (w.flags[i] & LEAF));
  const inCave = caps.filter(([x]) => x < 60).length, outside = caps.filter(([x]) => x >= 60).length;
  show('mushrooms', w);
  check('Mushrooms grow in a damp cave', inCave >= 10 && outside === 0, `${inCave} cap cells under the roof, ${outside} on open dry ground`);
}

// A lily seed sinks, roots on the pond floor and floats pads on the surface.
{
  const w = world();
  rect(w, 0, 80, 119, 89, ID.DIRT); rect(w, 0, 50, 119, 79, ID.WATER);
  for (const x of [30, 60, 90]) w.place(w.idx(x, 52), ID.LILYSEED);
  run(w, 4000);
  const pads = cells(w, (t, i) => t === ID.LILY && (w.flags[i] & LEAF));
  const surface = pads.filter(([, y]) => y <= 52).length, flowers = cells(w, (t) => t === ID.FLOWER).length;
  show('lilies', w);
  check('Water lilies float pads and flower', surface >= 6 && flowers >= 1, `${surface} pad cells at the surface, ${flowers} flower cells`);
}

// Painting a plant on soil plants a few real plants, which grow stems and flower, rather than
// stamping a disc of leaves (a brush of radius 6 used to fill about 130 cells).
{
  const w = world();
  rect(w, 0, 80, 119, 89, ID.DIRT);
  for (let k = 0; k < 40; k++) w.paint(60, 77, 6, ID.PLANT, 1, false); // the brush held still for 40 frames
  const starts = w.counts.fill(0) && cells(w, (t) => t === ID.PLANT).length;
  run(w, 2500);
  const stems = new Set(cells(w, (t) => t === ID.PLANT || t === ID.FLOWER).map(([x]) => x));
  const flowers = cells(w, (t) => t === ID.FLOWER).length;
  const top = 80 - Math.min(...cells(w, (t) => t === ID.PLANT || t === ID.FLOWER).map(([, y]) => y));
  show('painted plants', w);
  check('Painting plants grows plants, not a block', starts >= 2 && starts <= 6 && flowers >= 3 && top >= 8,
    `the brush started ${starts} plants; they grew ${top} tall across ${stems.size} columns, with ${flowers} flower cells`);
}

// Painting a plant in mid-air scatters its seed, which falls and sprouts where it lands.
{
  const w = world();
  rect(w, 0, 80, 119, 89, ID.DIRT);
  for (let k = 0; k < 30; k++) w.paint(60, 20, 6, ID.PLANT, 1, false);
  const seeds = cells(w, (t) => t === ID.SEED).length, early = cells(w, (t) => t === ID.PLANT).length;
  run(w, 3000);
  const grown = cells(w, (t) => t === ID.PLANT).length;
  check('Painted in the air, plants fall as seed', seeds >= 3 && early === 0 && grown >= 20, `${seeds} seeds dropped, ${early} plant cells in the air; ${grown} plant cells grew on the ground`);
}

// Plants live on water from their roots: a stem rooted in soil lives, one standing on bare rock
// (or a block of leaves stamped in the air) dries out and crumbles into dead leaves.
{
  const w = world();
  rect(w, 0, 80, 119, 89, ID.DIRT); rect(w, 70, 60, 74, 79, ID.STONE);
  rect(w, 30, 65, 30, 79, ID.PLANT);   // rooted
  rect(w, 72, 45, 72, 59, ID.PLANT);   // on a stone pillar
  rect(w, 95, 20, 104, 29, ID.PLANT);  // a block in the air
  run(w, 3000);
  const rooted = cells(w, (t) => t === ID.PLANT).filter(([x]) => x === 30).length;
  const rock = cells(w, (t) => t === ID.PLANT).filter(([x]) => x === 72).length;
  const air = cells(w, (t) => t === ID.PLANT).filter(([x]) => x >= 95).length;
  const litter = cells(w, (t) => t === ID.LITTER).length;
  show('roots', w);
  check('Rooted plants live, rootless ones crumble', rooted >= 14 && rock === 0 && air === 0 && litter > 0,
    `rooted stem ${rooted} of 15 cells alive; on rock ${rock} of 15; block in the air ${air} of 100; ${litter} dead leaves`);
}

// Cut a plant's stem and the part above the cut dies.
{
  const w = world();
  rect(w, 0, 80, 119, 89, ID.DIRT);
  rect(w, 40, 60, 40, 79, ID.PLANT); rect(w, 80, 60, 80, 79, ID.PLANT);
  run(w, 300);
  w.erase(80, 75, 0); // cut the second one near the ground
  run(w, 3000);
  const whole = cells(w, (t) => t === ID.PLANT).filter(([x]) => x === 40).length;
  const above = cells(w, (t) => t === ID.PLANT).filter(([x, y]) => x === 80 && y < 75).length;
  check('A cut stem withers above the cut', whole >= 18 && above === 0, `uncut ${whole} of 20 alive; above the cut ${above} left`);
}

// Frost kills plants.
{
  const w = world();
  w.ambient = -20;
  rect(w, 0, 80, 119, 89, ID.DIRT);
  rect(w, 40, 65, 40, 79, ID.PLANT); rect(w, 60, 79, 80, 79, ID.GRASS);
  run(w, 4000);
  const alive = cells(w, (t) => t === ID.PLANT || t === ID.GRASS).length;
  check('Frost kills plants', alive === 0, `${alive} of 36 plant cells alive after 4000 ticks at -20°C`);
}

// Dead leaves on soil rot into dirt.
{
  const w = world();
  rect(w, 0, 80, 119, 89, ID.DIRT); rect(w, 30, 70, 89, 79, ID.LITTER);
  run(w, 6000);
  const left = cells(w, (t) => t === ID.LITTER).length;
  check('Dead leaves rot into soil', left < 600 * 0.5, `${left} of 600 dead leaves left after 6000 ticks`);
}

// The forest scene's trees stay alive: their crowns draw water through the trunks.
{
  const w = Sim.createWorld(240, 140);
  for (const d of ELEM.list) w.disc[d.id] = 1;
  Scenes.forest(w);
  const leaves0 = cells(w, (t) => t === ID.PLANT).length;
  run(w, 3000);
  const leaves1 = cells(w, (t) => t === ID.PLANT).length;
  check('Trees in the forest scene stay alive', leaves1 >= leaves0 * 0.85, `${leaves0} leaves → ${leaves1} after 3000 ticks`);
}

let fail = 0;
for (const r of out) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.label.padEnd(40)} ${r.detail}`);
}
process.exit(fail ? 1 : 0);
