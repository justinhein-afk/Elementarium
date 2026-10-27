// Headless checks for the Weapons tab: each disaster does what its card says, undo stops it,
// and none of them slows the simulation to a crawl.
// Run: node tools/weapontest.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
for (const f of ['elements.js', 'periodic.js', 'materials.js', 'sim.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
}
const { ELEM, Sim } = globalThis;
const ID = ELEM.ID;

function world(W = 256, H = 160) {
  const w = Sim.createWorld(W, H);
  for (const d of ELEM.list) w.disc[d.id] = 1;
  return w;
}
function rect(w, x0, y0, x1, y1, t) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) w.place(w.idx(x, y), t);
}
const slowest = {};
function run(w, n, each, label) {
  for (let k = 0; k < n; k++) {
    if (each) each(w, k);
    const t0 = process.hrtime.bigint();
    w.step();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (label) slowest[label] = Math.max(slowest[label] || 0, ms);
    w.resetEvents();
  }
}
function count(w, test, x0 = 0, y0 = 0, x1 = w.W - 1, y1 = w.H - 1) {
  let n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (test(w.type[w.idx(x, y)], x, y)) n++;
  return n;
}
const liquid = (t) => ELEM.list[t].cat === ELEM.CAT.LIQUID;

const out = [];
function check(label, ok, detail) { out.push({ label, ok, detail }); }

// Tsunami: a sea on the left, land higher than the sea on the right. The wave should carry the
// sea far inland, where no water could reach by itself.
{
  const w = world();
  rect(w, 0, 130, 255, 159, ID.STONE);
  rect(w, 0, 112, 79, 129, ID.SALTWATER);
  rect(w, 80, 104, 255, 129, ID.DIRT);
  for (let x = 100; x < 250; x += 30) { w.place(w.idx(x, 103), ID.HUMAN); w.place(w.idx(x, 102), ID.HEAD); }
  run(w, 60);
  const inlandBefore = count(w, (t, x, y) => liquid(t) && x > 150);
  w.launch('tsunami', 100, 100, 1);
  let far = 0, moved = 0, inland = 0;
  run(w, 360, (w, k) => {
    if (k % 20) return;
    for (let x = w.W - 1; x > far; x--) if (count(w, (t) => liquid(t), x, 0, x, w.H - 1)) { far = x; break; }
    inland = Math.max(inland, count(w, (t, x, y) => liquid(t) && x > 150));
  }, 'tsunami');
  for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) if (w.type[w.idx(x, y)] === ID.HUMAN && Math.abs((x - 100) % 30) > 2) moved++;
  check('A tsunami floods far inland', inlandBefore === 0 && inland > 300 && far > 200,
    `water reached x=${far}; up to ${inland} cells of it past x=150 at once (none before); ${moved} people carried off their spot`);
}

// Earthquake: a heap of sand slumps, a tunnel in packed soil falls in, and rock cracks.
{
  const w = world();
  rect(w, 0, 130, 255, 159, ID.STONE);
  for (let k = 0; k < 24; k++) rect(w, 90 + k, 129 - k, 138 - k, 129 - k, ID.SAND); // a heap
  rect(w, 150, 96, 220, 129, ID.DIRT);
  rect(w, 158, 110, 212, 114, ID.EMPTY); // a tunnel through it
  for (let i = 0; i < w.N; i++) if (w.type[i] === ID.DIRT) w.flags[i] |= 32; // packed, as soil is once it has lain still
  rect(w, 60, 120, 85, 129, ID.WATER);
  run(w, 200);
  const top = () => { for (let y = 0; y < w.H; y++) if (count(w, (t) => t === ID.SAND, 90, y, 138, y)) return y; return w.H; };
  const heap0 = 130 - top(), tunnel0 = count(w, (t) => t !== ID.EMPTY, 158, 110, 212, 114);
  const stone0 = count(w, (t) => t === ID.STONE);
  w.launch('quake', 140, 125, 1, { magnitude: 7.5 });
  run(w, 330, null, 'quake');
  run(w, 120);
  const heap1 = 130 - top(), tunnel1 = count(w, (t) => t !== ID.EMPTY, 158, 110, 212, 114);
  const rubble = count(w, (t) => t === ID.RUBBLE), cracked = stone0 - count(w, (t) => t === ID.STONE);
  check('An earthquake slumps heaps, caves in tunnels and cracks rock', heap1 < heap0 - 3 && tunnel1 > tunnel0 + 40 && rubble > 20,
    `heap ${heap0} → ${heap1} cells high; tunnel ${tunnel0} → ${tunnel1} cells filled; ${cracked} stone cracked, ${rubble} rubble`);
}

// Tornado: on sandy ground with grass and people, it lifts sand high, rips up the grass and
// carries people up.
{
  const w = world();
  rect(w, 0, 130, 255, 159, ID.STONE);
  rect(w, 0, 118, 255, 129, ID.SAND);
  rect(w, 0, 117, 255, 117, ID.GRASS);
  for (let x = 30; x < 230; x += 12) { w.place(w.idx(x, 116), ID.HUMAN); w.place(w.idx(x, 115), ID.HEAD); }
  run(w, 30);
  w.launch('tornado', 60, 100, 1);
  let aloft = 0, lifted = 0, maxX = 0;
  run(w, 600, (w, k) => {
    if (k % 10) return;
    aloft = Math.max(aloft, count(w, (t, x, y) => (t === ID.SAND || t === ID.LITTER) && y < 95));
    lifted = Math.max(lifted, count(w, (t, x, y) => t === ID.HUMAN && y < 105));
    maxX = Math.max(maxX, w.disasters[0] ? w.disasters[0].x : 0);
  }, 'tornado');
  const litter = count(w, (t) => t === ID.LITTER), grass = count(w, (t) => t === ID.GRASS);
  check('A tornado lifts sand and people and rips up grass', aloft > 60 && lifted > 0 && grass < 230 && maxX > 100,
    `${aloft} grains and leaves 22+ cells up at once; ${lifted} people lifted at once; grass 256 → ${grass} (${litter} dead leaves lie about); travelled to x=${maxX}`);
}

// Volcano: magma rises slowly from the bottom of the map, melting its way up; a big brush's gets
// through to the surface and erupts, building a cone, a small brush's runs out underground, and
// over open ground it throws lava, bombs and ash no higher than its reach.
{
  const rock = () => { const w = world(256, 200); rect(w, 0, 60, 255, 199, ID.STONE); return w; };
  const lavaTop = (w, x0, x1) => { for (let y = 0; y < w.H; y++) for (let x = x0; x <= x1; x++) if (w.type[w.idx(x, y)] === ID.LAVA) return y; return w.H; };

  // big brush: it climbs, never showing above its head, then breaks out and builds a cone
  let w = rock();
  w.launch('volcano', 128, 30, 3.5);
  let d = w.disasters[0], ahead = 0, rise = 0, high = 0;
  run(w, 1500, (w, k) => {
    if (d.phase === 'rise') { rise++; if (lavaTop(w, 120, 136) < Math.floor(d.head) - 1) ahead++; }
    if (k % 20 === 0) high = Math.max(high, count(w, (t, x, y) => t === ID.LAVA && y < 50));
  }, 'volcano');
  const cone = count(w, (t) => t === ID.STONE || t === ID.OBSIDIAN || t === ID.RUBBLE, 0, 0, 255, 59);
  check('A volcano\'s magma rises slowly from the bottom, then erupts and builds a cone',
    ahead === 0 && rise > 150 && high > 10 && cone > 100,
    `rose for ${rise} ticks (lava never ahead of it: ${ahead === 0}); then up to ${high} lava cells 10+ cells over the surface at once; ${cone} cells of new rock above the old ground`);

  // small brush: it runs out of strength underground
  w = rock();
  w.launch('volcano', 128, 30, 0.5);
  d = w.disasters[0];
  const reach = d.reach;
  let surfaced = 0;
  run(w, 600, (w) => { if (lavaTop(w, 110, 146) < 60) surfaced++; });
  check('A small volcano\'s magma stays underground', surfaced === 0 && d.phase !== 'erupt',
    `could rise ${reach} of the ${200 - 60} cells to the surface; lava at the surface on ${surfaced} ticks`);

  // over open ground: nothing it throws goes higher than its reach
  w = world(256, 200);
  w.launch('volcano', 128, 30, 0.5);
  d = w.disasters[0];
  const ceiling = w.H - d.reach;
  let over = 0, smokeOver = 0;
  run(w, 900, (w, k) => {
    if (k % 10) return;
    over = Math.max(over, count(w, (t, x, y) => (t === ID.LAVA || t === ID.EMBER || t === ID.ASH || t === ID.RUBBLE) && y < ceiling - 4));
    smokeOver = Math.max(smokeOver, count(w, (t, x, y) => t === ID.SMOKE && y < ceiling - 12));
  });
  check('Over open ground a volcano rises only as high as its reach', over === 0 && smokeOver < 15, // a few wisps of smoke at most
    `reach ${d.reach} cells (up to y=${ceiling}); lava, bombs or ash above it: ${over}; smoke well above it: ${smokeOver}`);
}

// Meteor: digs a crater in solid rock and leaves its iron behind.
{
  const w = world();
  rect(w, 0, 120, 255, 159, ID.STONE);
  w.launch('meteor', 128, 110, 1);
  run(w, 200, null, 'meteor');
  const dug = count(w, (t) => t !== ID.STONE, 100, 120, 156, 140);
  const iron = count(w, (t) => t === ID.METAL || t === ID.MMETAL), rubble = count(w, (t) => t === ID.RUBBLE);
  check('A meteor digs a crater and leaves iron', dug > 60 && iron > 0,
    `${dug} cells dug out of the rock round the impact; ${iron} cells of meteoric iron; ${rubble} rubble thrown out`);
}

// Lightning storm: bolt after bolt.
{
  const w = world();
  rect(w, 0, 130, 255, 159, ID.STONE);
  rect(w, 80, 110, 180, 129, ID.WOOD);
  w.launch('storm', 128, 100, 1);
  let bolts = 0, burning = 0;
  for (let k = 0; k < 520; k++) {
    w.step();
    bolts += w.events.bolts.length / 4;
    burning = Math.max(burning, w.events.burning);
    w.resetEvents();
  }
  check('A lightning storm strikes again and again', bolts >= 15 && burning > 0, `${bolts} bolts; up to ${burning} cells burning`);
}

// Ice age: a pond freezes over and a fire goes out.
{
  const w = world();
  rect(w, 0, 130, 255, 159, ID.STONE);
  rect(w, 98, 104, 99, 129, ID.STONE); rect(w, 177, 104, 178, 129, ID.STONE); // the pond's banks
  rect(w, 100, 110, 176, 129, ID.WATER);
  rect(w, 180, 120, 188, 129, ID.WOOD);
  run(w, 30);
  for (let x = 180; x <= 188; x++) w.ignite(w.idx(x, 120));
  run(w, 30);
  const water0 = count(w, (t) => t === ID.WATER);
  w.launch('freeze', 140, 118, 1.2);
  run(w, 200, null, 'freeze');
  const ice = count(w, (t) => t === ID.ICE), water1 = count(w, (t) => t === ID.WATER), fire = count(w, (t) => t === ID.FIRE);
  check('An ice age freezes a pond and puts out fire', ice > water0 * 0.8 && fire === 0,
    `${water0} water → ${water1} water and ${ice} ice; ${fire} fire left`);
}

// Acid rain: acid falls and eats into a stone roof.
{
  const w = world();
  rect(w, 0, 130, 255, 159, ID.STONE);
  rect(w, 80, 100, 180, 104, ID.STONE);
  const stone0 = count(w, (t) => t === ID.STONE);
  w.launch('acidrain', 128, 80, 1);
  let acid = 0;
  run(w, 700, (w, k) => { if (k % 20 === 0) acid = Math.max(acid, count(w, (t) => t === ID.ACID)); }, 'acidrain');
  const eaten = stone0 - count(w, (t) => t === ID.STONE);
  check('Acid rain falls and eats stone', acid > 50 && eaten > 30, `up to ${acid} drops of acid at once; ${eaten} stone eaten`);
}

// Nuke: everyone near ground zero dies, the ground is blown out, and a mushroom cloud rises.
{
  const w = world();
  rect(w, 0, 130, 255, 159, ID.STONE);
  rect(w, 0, 122, 255, 129, ID.DIRT);
  rect(w, 60, 112, 75, 121, ID.WOOD);
  for (let x = 20; x < 240; x += 10) { w.place(w.idx(x, 121), ID.HUMAN); w.place(w.idx(x, 120), ID.HEAD); }
  run(w, 20);
  const people0 = count(w, (t) => t === ID.HUMAN);
  w.launch('nuke', 128, 118, 1);
  let smokeHigh = 0, plasma = 0;
  run(w, 330, (w, k) => {
    if (k === 1) plasma = count(w, (t) => t === ID.PLASMA);
    if (k % 20 === 0) smokeHigh = Math.max(smokeHigh, count(w, (t, x, y) => t === ID.SMOKE && y < 90));
  }, 'nuke');
  const people = count(w, (t) => t === ID.HUMAN), near = count(w, (t, x) => t === ID.HUMAN && Math.abs(x - 128) < 30);
  const crater = count(w, (t) => t === ID.EMPTY, 110, 118, 146, 130);
  check('A nuke kills, craters and raises a mushroom cloud', near === 0 && people < people0 * 0.75 && crater > 100 && smokeHigh > 300,
    `${people0} people → ${people} (${near} left within 30 cells); ${crater} cells blown out at ground zero; ${smokeHigh} smoke 28+ cells up; ${plasma} plasma at first`);
}

// Black hole: swallows a heap of sand and a pool beside it.
{
  const w = world();
  rect(w, 0, 130, 255, 159, ID.STONE);
  for (let k = 0; k < 20; k++) rect(w, 90 + k, 129 - k, 130 - k, 129 - k, ID.SAND);
  rect(w, 140, 118, 170, 129, ID.WATER);
  const loose0 = count(w, (t) => t === ID.SAND || t === ID.WATER);
  w.launch('blackhole', 128, 105, 1);
  run(w, 700, null, 'blackhole');
  const loose1 = count(w, (t) => t === ID.SAND || t === ID.WATER), left = w.disasters.length;
  check('A black hole swallows what comes near, then evaporates', loose1 < loose0 * 0.6 && left === 0,
    `${loose0} sand and water → ${loose1}; ${left} disasters still running`);
}

// Solids break as readily as the real thing would. A block of each, all the same distance from
// a quake's epicentre (or a black hole): the weak and glassy go first, the tough hold out, and
// what a quake breaks follows its magnitude the way real earthquakes do.
{
  const mats = ['ICE', 'GLASS', 'CLAY', 'BRICK', 'STONE', 'WOOD', 'METAL', 'DIAMOND'];
  const broken = (kind, R, ticks, trials, magnitude) => {
    const share = Object.fromEntries(mats.map((m) => [m, 0]));
    for (let k = 0; k < trials; k++) {
      const w = world(200, 200);
      w.ambient = -30; // cold, so the ice holds by itself
      rect(w, 98, 98, 102, 102, ID.WALL); // bedrock at the centre, so the quake strikes there
      const blocks = mats.map((m, n) => {
        const a = (n / mats.length) * Math.PI * 2, cx = Math.round(100 + Math.cos(a) * R), cy = Math.round(100 + Math.sin(a) * R);
        rect(w, cx - 4, cy - 4, cx + 3, cy + 3, ID[m]);
        const cells = [];
        for (let y = cy - 4; y <= cy + 3; y++) for (let x = cx - 4; x <= cx + 3; x++) { cells.push(w.idx(x, y)); if (m === 'ICE') w.temp[w.idx(x, y)] = -30; }
        return cells;
      });
      w.launch(kind, 100, 100, 1.5, { magnitude });
      run(w, ticks || w.disasters[0].life);
      mats.forEach((m, n) => { share[m] += blocks[n].filter((i) => w.type[i] !== ID[m]).length / blocks[n].length / trials; });
    }
    return share;
  };
  const show = (s) => mats.map((m) => `${m.toLowerCase()} ${Math.round(s[m] * 100)}%`).join(' · ');
  const q = broken('quake', 24, 0, 4, 7);
  check('An earthquake cracks solids by how brittle they really are',
    q.ICE > q.STONE && q.GLASS > q.STONE && q.BRICK > q.STONE && q.STONE > 0.06 && q.STONE > q.WOOD * 2 && q.METAL < q.STONE / 4 && q.DIAMOND < q.STONE / 4,
    `share cracked 24 cells from a magnitude 7 epicentre: ${show(q)}`);
  const m = Object.fromEntries([4, 5.5, 6.5, 7, 8, 9].map((M) => [M, broken('quake', 12, 0, 2, M)]));
  check('What a quake breaks follows its magnitude',
    mats.every((k) => m[4][k] === 0) && m[5.5].GLASS > 0 && m[5.5].STONE === 0 && m[6.5].BRICK > 0 && m[7].STONE > 0.1
      && m[7].WOOD < 0.05 && m[8].WOOD > 0.1 && m[8].METAL < 0.05 && m[9].METAL < 0.5 && [4, 5.5, 6.5, 7, 8, 9].every((M) => m[M].DIAMOND === 0),
    [4, 5.5, 6.5, 7, 8, 9].map((M) => `M${M}: ${show(m[M])}`).join('\n      ') + '\n      (12 cells from the epicentre)');
  const b = broken('blackhole', 20, 120, 2), e = broken('blackhole', 20, 700, 1);
  check('A black hole tears every solid to powder, the weakest first',
    b.GLASS > b.STONE && b.STONE > b.WOOD && b.WOOD > b.METAL && mats.every((m) => e[m] > 0.7),
    `torn away after 2 s: ${show(b)}\n      by the end: ${show(e)}`);
}

// Hydrogen bomb: it falls from above (whistling), goes off where it touches down, and its blast
// takes two-thirds of the map: nearly everything inside is gone, the rock outside it stands.
{
  const w = world();
  rect(w, 0, 120, 255, 159, ID.STONE);
  for (let x = 10; x < 250; x += 12) { w.place(w.idx(x, 119), ID.HUMAN); w.place(w.idx(x, 118), ID.HEAD); }
  const drop = w.dropPoint(128), R = drop.r;
  let inside = 0;
  for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) if (Math.hypot(x - drop.x, y - drop.y) <= R) inside++;
  const stoneIn = [], stoneOut = [];
  for (let y = 120; y < 160; y++) for (let x = 0; x < 256; x++) {
    const d = Math.hypot(x - drop.x, y - drop.y);
    if (d <= R) stoneIn.push(w.idx(x, y)); else if (d > R * 1.05) stoneOut.push(w.idx(x, y)); // past the edge only the heat flash reaches
  }
  w.launch('hbomb', 128, 40, 1);
  const bomb = w.disasters[0];
  let falling = 0, whistled = 0, blasts = 0, smokeHigh = 0, whistleAfter = 0;
  for (let k = 0; k < 700; k++) {
    w.step();
    if (bomb.phase === 'fall') { falling++; if (w.events.whistle > 0) whistled++; } else if (w.events.whistle > 0) whistleAfter++;
    blasts += w.events.hbomb.length / 3;
    if (k % 20 === 0) smokeHigh = Math.max(smokeHigh, count(w, (t, x, y) => t === ID.SMOKE && y < 50));
    w.resetEvents();
  }
  const gone = stoneIn.filter((i) => w.type[i] !== ID.STONE).length / stoneIn.length;
  const standing = stoneOut.filter((i) => w.type[i] === ID.STONE).length / stoneOut.length;
  const people = count(w, (t) => t === ID.HUMAN);
  check('A hydrogen bomb falls, then takes two-thirds of the map',
    falling > 40 && whistled === falling && whistleAfter === 0 && blasts === 1 && Math.abs(inside / (w.W * w.H) - 2 / 3) < 0.01
      && gone > 0.9 && standing > 0.6 && people === 0 && smokeHigh > 300,
    `fell for ${falling} ticks, whistling for ${whistled} of them and ${whistleAfter} after it landed; ${blasts} blast; it reached ${Math.round(100 * inside / (w.W * w.H))}% of the map; `
      + `${Math.round(gone * 100)}% of the rock inside gone, ${Math.round(standing * 100)}% of it beyond the edge still standing; ${people} people left; ${smokeHigh} smoke high up`);
}

// Undo: restoring a snapshot taken before a weapon went off stops it.
{
  const w = world();
  rect(w, 0, 130, 255, 159, ID.STONE);
  const sn = w.snapshot();
  w.launch('tornado', 128, 100, 1); w.launch('quake', 128, 120, 1, { magnitude: 7 });
  run(w, 10);
  w.restore(sn);
  check('Undo stops a disaster', w.disasters.length === 0, `${w.disasters.length} running after the restore`);
}

for (const r of out) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}\n      ${r.detail}`);
console.log('\nslowest tick with each weapon (256 × 160):');
console.log('  ' + Object.entries(slowest).map(([k, v]) => `${k} ${v.toFixed(1)}ms`).join(' · '));
process.exitCode = out.every((r) => r.ok) ? 0 : 1;
