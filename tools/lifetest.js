// Headless checks for the life and starters update: the starter set and the table's order, cells
// growing into every animal, cows, wolves and sharks, people who can and can't swim, animals
// buried alive, sugar and lime chemistry, plants that grow into other kinds, stalactites, the
// Smash tool, rainbow fire, and what used to be a starter being found in the world.
// Run: node tools/lifetest.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
for (const f of ['elements.js', 'periodic.js', 'materials.js', 'sim.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
}
const { ELEM, Sim } = globalThis;
const { ID, byKey, list } = ELEM;

const out = [];
const check = (label, ok, detail) => out.push({ label, ok, detail });
function world(W = 120, H = 80) { const w = Sim.createWorld(W, H); w.disc.fill(1); return w; }
const rect = (w, x0, y0, x1, y1, t) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) w.place(w.idx(x, y), t); };
const cells = (w, pred) => { let n = 0; for (let i = 0; i < w.N; i++) if (pred(w.type[i], i)) n++; return n; };
const count = (w, t) => cells(w, (u) => u === t);
// each(w, k) runs after every tick, with that tick's events; returning false stops early
function run(w, ticks, each) { for (let k = 0; k < ticks; k++) { w.step(); const stop = each && each(w, k) === false; w.resetEvents(); if (stop) return k; } return ticks; }
// ticks until pred() holds (checked every tick), or -1
const until = (w, max, pred) => { for (let k = 0; k < max; k++) { if (pred(w)) return k; w.step(); w.resetEvents(); } return pred(w) ? max : -1; };
const ground = (w, t = ID.SOIL, h = 10) => rect(w, 0, w.H - h, w.W - 1, w.H - 1, t);
const s = (ticks) => `${(ticks / 60).toFixed(1)} s`;

// ── the starters, and the order of the table ──
{
  const want = ['wall', 'soil', 'stone', 'wood', 'metal', 'sand', 'dirt', 'salt', 'sugar', 'water', 'oil', 'lime', 'steam', 'fire', 'plant', 'flower', 'cell'];
  const have = list.filter((d) => d.starter && !d.hidden).map((d) => d.key);
  check('The starters are exactly the ones asked for', want.every((k) => have.includes(k)) && have.every((k) => want.includes(k)),
    have.join(', '));
  const found = ['concrete', 'cement', 'alcohol', 'vinegar', 'explosion', 'light', 'pine', 'palm', 'willow', 'sapling', 'grass', 'cactus', 'vine',
    'mushroom', 'lily', 'human', 'bird', 'ant', 'cloud', 'raincloud', 'stormcloud', 'snowcloud', 'fog', 'hail', 'limestone', 'cow', 'wolf', 'shark'];
  check('What was on the board from the start is found in the world now, each with a recipe', found.every((k) => !byKey[k].starter && byKey[k].hint && byKey[k].fromIds.length && byKey[k].fromIds.every((f) => f >= 0)),
    found.filter((k) => byKey[k].starter || !byKey[k].hint).join(', ') || `${found.length} elements`);
  check('Paint and Image open after enough discoveries, like Clone and Void', ['clone', 'void', 'paint', 'image'].every((k) => byKey[k].special && byKey[k].unlockAt > 0),
    ['clone', 'void', 'paint', 'image'].map((k) => `${k} ${byKey[k].unlockAt}`).join(', '));
  check('New types still fit in a byte', list.length <= 254, `${list.length} element types`);
}

// ── cells ──
{
  // a cell beside each thing, on its own little bench; returns what it became
  const trial = (setup, ticks = 900) => {
    const w = world(40, 30);
    ground(w, ID.STONE, 4);
    setup(w);
    const before = new Int32Array(256);
    for (let i = 0; i < w.N; i++) before[w.type[i]]++;
    run(w, ticks, (ww) => count(ww, ID.CELL) === 0 ? false : undefined);
    return w;
  };
  const grew = (w, t) => count(w, t) > 0;
  const tries = (setup, t, ticks) => { for (let k = 0; k < 3; k++) { const w = trial(setup, ticks); if (grew(w, t)) return w; } return trial(setup, ticks); };
  const fish = trial((w) => { rect(w, 5, 10, 34, 25, ID.WATER); w.place(w.idx(20, 18), ID.CELL); }, 3000);
  const cow = trial((w) => { rect(w, 10, 25, 30, 25, ID.GRASS); w.place(w.idx(20, 24), ID.CELL); });
  const wolf = trial((w) => { w.place(w.idx(20, 25), ID.COW); w.place(w.idx(22, 25), ID.COW); w.place(w.idx(21, 25), ID.CELL); });
  const shark = tries((w) => { rect(w, 5, 10, 34, 25, ID.SALTWATER); for (const [x, y] of [[20, 18], [22, 18], [21, 17], [21, 19]]) w.place(w.idx(x, y), ID.FISH); w.place(w.idx(21, 18), ID.CELL); }, ID.SHARK);
  const human = trial((w) => { rect(w, 10, 25, 30, 25, ID.CLAY); w.place(w.idx(20, 24), ID.CELL); });
  const ant = trial((w) => { rect(w, 10, 25, 30, 25, ID.SUGAR); w.place(w.idx(20, 24), ID.CELL); });
  const worm = trial((w) => { rect(w, 10, 24, 30, 25, ID.DIRT); w.place(w.idx(20, 23), ID.CELL); });
  const firefly = trial((w) => { rect(w, 10, 25, 30, 25, ID.FLOWER); w.place(w.idx(20, 24), ID.CELL); });
  const bird = trial((w) => { for (let x = 14; x <= 26; x++) { const i = w.idx(x, 12); w.place(i, ID.PLANT); w.flags[i] = Sim.LEAF; } w.place(w.idx(20, 11), ID.CELL); rect(w, 0, 11, 13, 11, ID.WALL); rect(w, 27, 11, 39, 11, ID.WALL); });
  const shroom = trial((w) => { rect(w, 10, 25, 30, 25, ID.WOOD); w.place(w.idx(20, 24), ID.CELL); });
  const vinegar = trial((w) => { rect(w, 10, 20, 30, 25, ID.ALCOHOL); w.place(w.idx(20, 22), ID.CELL); });
  const all = { fish: grew(fish, ID.FISH), cow: grew(cow, ID.COW), wolf: grew(wolf, ID.WOLF), shark: grew(shark, ID.SHARK),
    human: grew(human, ID.HUMAN) && grew(human, ID.HEAD), ant: grew(ant, ID.ANT), worm: grew(worm, ID.WORM), firefly: grew(firefly, ID.FIREFLY),
    bird: grew(bird, ID.BIRD), mushroom: grew(shroom, ID.MUSHROOM), vinegar: grew(vinegar, ID.VINEGAR) };
  check('A cell grows into what its surroundings call for', Object.values(all).every(Boolean),
    Object.entries(all).map(([k, v]) => `${k} ${v ? 'yes' : 'NO'}`).join(', '));
  // and the birth is a discovery
  const w = world(40, 30); w.disc.fill(1); w.disc[ID.COW] = 0;
  ground(w, ID.STONE, 4); rect(w, 10, 25, 30, 25, ID.GRASS); w.place(w.idx(20, 24), ID.CELL);
  let found = false;
  run(w, 900, (ww) => { for (let k = 0; k < ww.events.found.length; k += 3) if (ww.events.found[k] === ID.COW) found = true; });
  check('…and the first cow it grows into is a discovery', found, found ? 'found' : 'not found');
  // a cell left out on dry rock dries up
  const dry = world(40, 30); ground(dry, ID.STONE, 4); dry.place(dry.idx(20, 25), ID.CELL);
  const died = until(dry, 4000, (ww) => count(ww, ID.CELL) === 0);
  check('A cell left on dry rock dries up within a minute', died > 0 && died < 3600, s(died));
}

// ── people who can and can't swim ──
{
  const pond = () => {
    const w = world(120, 60);
    ground(w, ID.STONE, 4);
    rect(w, 0, 20, w.W - 1, w.H - 5, ID.WATER);
    return w;
  };
  // nine in ten people can swim (counted over many, so it is no matter of luck)
  const many = world(200, 20);
  let born = 0, swim = 0;
  for (let k = 0; k < 2000; k++) { const i = many.idx(k % 200, 5 + ((k / 200) | 0)); many.place(i, ID.HUMAN); born++; if (many.aux[i] & Sim.SWIMS) swim++; }
  check('Nine in ten people can swim', swim > born * 0.86 && swim < born * 0.94, `${swim} of ${born} (${Math.round((swim / born) * 100)}%)`);
  // drop people into deep water, some of whom can't swim: they sink and drown within ten seconds
  const w = pond();
  let n = 0;
  for (let x = 4; x < w.W - 4; x += 3) {
    const i = w.idx(x, 18); w.place(i, ID.HUMAN); w.place(i - w.SW, ID.HEAD); n++;
    if (n % 4 === 0) w.aux[i] &= ~Sim.SWIMS; // a few who certainly can't
  }
  const swimmers = cells(w, (t, i) => t === ID.HUMAN && (w.aux[i] & Sim.SWIMS));
  w.rules.births = false;
  run(w, 660);
  const alive = count(w, ID.HUMAN);
  const aliveSwim = cells(w, (t, i) => t === ID.HUMAN && (w.aux[i] & Sim.SWIMS));
  check('Those who can\'t sink and drown within ten seconds; swimmers stay up', alive === aliveSwim && aliveSwim >= swimmers * 0.9,
    `after 11 s: ${alive} alive (${aliveSwim} swimmers of ${swimmers}); ${n - swimmers} non-swimmers dropped in`);
  // one non-swimmer: dead by 10 s, not long before either
  const w2 = pond();
  const i = w2.idx(60, 18); w2.place(i, ID.HUMAN); w2.place(i - w2.SW, ID.HEAD); w2.aux[i] &= ~Sim.SWIMS;
  const t = until(w2, 900, (ww) => count(ww, ID.HUMAN) === 0);
  check('…a non-swimmer in deep water drowns by ten seconds', t > 300 && t <= 640, s(t));
}

// ── buried alive ──
{
  const bury = (setup) => {
    const w = world(60, 40);
    ground(w, ID.STONE, 4);
    rect(w, 20, 20, 40, 35, ID.SAND); // a heap of sand all round
    const t = setup(w);
    w.rules.births = false;
    return until(w, 900, (ww) => count(ww, t) === 0);
  };
  const human = bury((w) => { const i = w.idx(30, 35); w.place(i, ID.HUMAN); w.place(i - w.SW, ID.HEAD); return ID.HUMAN; });
  const bird = bury((w) => { w.place(w.idx(30, 35), ID.BIRD); return ID.BIRD; });
  const cow = bury((w) => { w.place(w.idx(30, 35), ID.COW); return ID.COW; });
  const wolf = bury((w) => { w.place(w.idx(30, 35), ID.WOLF); return ID.WOLF; });
  const beasts = { bird, cow, wolf };
  check('A person buried under sand is dead by five seconds; an animal by ten',
    human > 0 && human <= 310 && Object.values(beasts).every((t) => t >= 400 && t <= 610),
    Object.entries({ human, ...beasts }).map(([k, v]) => `${k} ${v < 0 ? 'ALIVE' : s(v)}`).join(', '));
  // …and under rock too
  const w = world(60, 40); ground(w, ID.STONE, 4); w.rules.births = false;
  const i = w.idx(30, 35); w.place(i, ID.HUMAN); w.place(i - w.SW, ID.HEAD);
  rect(w, 29, 33, 29, 35, ID.STONE); rect(w, 31, 33, 31, 35, ID.STONE); rect(w, 29, 33, 31, 33, ID.STONE);
  const rock = until(w, 900, (ww) => count(ww, ID.HUMAN) === 0);
  // and a person under a roof with air beside them is fine
  const hut = world(60, 40); ground(hut, ID.STONE, 4); hut.rules.births = false;
  const j = hut.idx(30, 35); hut.place(j, ID.HUMAN); hut.place(j - hut.SW, ID.HEAD);
  rect(hut, 20, 33, 40, 33, ID.WOOD); rect(hut, 20, 33, 20, 35, ID.WOOD); rect(hut, 40, 33, 40, 35, ID.WOOD);
  run(hut, 900);
  check('…walled in by rock as well, while a hut with room to breathe is safe', rock > 0 && rock <= 310 && count(hut, ID.HUMAN) === 1,
    `rock ${rock < 0 ? 'ALIVE' : s(rock)}; in the hut after 15 s: ${count(hut, ID.HUMAN)}`);
}

// ── cows, wolves and sharks ──
{
  const w = world(160, 50);
  ground(w, ID.SOIL, 6);
  rect(w, 0, 43, w.W - 1, 43, ID.GRASS);
  for (let x = 20; x < 140; x += 10) w.place(w.idx(x, 42), ID.COW);
  run(w, 3000);
  const cows = count(w, ID.COW), meals = [];
  for (let i = 0; i < w.N; i++) if (w.type[i] === ID.COW) meals.push((w.aux[i] >> 1) & 7); // meals since its last calf
  const fed = meals.filter((m) => m > 0).length;
  check('Cows graze the meadow, keep to it and have calves', cows >= 10 && fed >= cows * 0.7,
    `${cows} cows (12 at first), ${fed} of them have eaten lately; ${count(w, ID.GRASS)} grass`);
  const w2 = world(120, 40);
  ground(w2, ID.STONE, 4);
  for (let x = 10; x < 110; x += 8) w2.place(w2.idx(x, 35), ID.COW);
  w2.place(w2.idx(60, 35), ID.WOLF); w2.place(w2.idx(62, 35), ID.WOLF);
  const c0 = count(w2, ID.COW);
  run(w2, 3600);
  check('Wolves hunt cows down', count(w2, ID.COW) < c0 - 3 && count(w2, ID.WOLF) >= 2, `${c0} cows, ${count(w2, ID.COW)} left after a minute; ${count(w2, ID.WOLF)} wolves`);
  const w3 = world(120, 40);
  ground(w3, ID.STONE, 4); w3.rules.births = false;
  for (let x = 10; x < 110; x += 10) { const i = w3.idx(x, 35); w3.place(i, ID.HUMAN); w3.place(i - w3.SW, ID.HEAD); }
  const h0 = count(w3, ID.HUMAN);
  w3.place(w3.idx(60, 35), ID.WOLF);
  run(w3, 3600);
  check('…and people, who run from them', count(w3, ID.HUMAN) < h0, `${h0} people, ${count(w3, ID.HUMAN)} left after a minute`);
  const w4 = world(120, 50);
  ground(w4, ID.SAND, 4);
  rect(w4, 0, 10, w4.W - 1, w4.H - 5, ID.SALTWATER);
  for (let k = 0; k < 30; k++) w4.place(w4.idx(5 + ((k * 37) % 110), 15 + ((k * 13) % 28)), ID.FISH);
  w4.place(w4.idx(60, 30), ID.SHARK);
  const f0 = count(w4, ID.FISH);
  run(w4, 3600);
  // stranded on the sand it dies
  const w5 = world(60, 30); ground(w5, ID.SAND, 4); w5.place(w5.idx(30, 25), ID.SHARK);
  const beached = until(w5, 900, (ww) => count(ww, ID.SHARK) === 0);
  check('A shark eats fish, and dies on dry land within ten seconds', count(w4, ID.FISH) < f0 * 0.8 && count(w4, ID.SHARK) >= 1 && beached >= 400 && beached <= 610,
    `${f0} fish, ${count(w4, ID.FISH)} after a minute; beached shark dead in ${s(beached)}`);
}

// ── painting creatures: a few at a time, apart, like people ──
{
  // a big brush held down for half a second (a paint every tick, as dragging does), at each one's
  // own brush density (main.js densityFor)
  const stroke = (t, density, setup) => {
    const w = world(120, 60);
    ground(w, ID.STONE, 4);
    if (setup) setup(w);
    for (let k = 0; k < 30; k++) w.paint(60, 30, 20, t, density, false);
    const at = [];
    for (let i = 0; i < w.N; i++) if (w.type[i] === t) at.push(i);
    // the closest two of them, in cells (Chebyshev)
    let close = Infinity;
    for (let a = 0; a < at.length; a++) for (let b = a + 1; b < at.length; b++) {
      const dx = Math.abs((at[a] % w.SW) - (at[b] % w.SW)), dy = Math.abs(((at[a] / w.SW) | 0) - ((at[b] / w.SW) | 0));
      close = Math.min(close, Math.max(dx, dy));
    }
    return { n: at.length, close };
  };
  const pond = (w) => rect(w, 0, 20, w.W - 1, w.H - 5, ID.SALTWATER);
  const r = {
    cow: stroke(ID.COW, 0.006), wolf: stroke(ID.WOLF, 0.006), shark: stroke(ID.SHARK, 0.006, pond),
    cell: stroke(ID.CELL, 0.006), 'cell in water': stroke(ID.CELL, 0.006, pond),
  };
  // the same stroke of people, for comparison (a disc of radius 20 is about 1,260 cells)
  const w = world(120, 60);
  ground(w, ID.STONE, 4);
  for (let k = 0; k < 30; k++) w.paint(60, 30, 20, ID.HUMAN, 0.006, false);
  const people = count(w, ID.HUMAN);
  const ok = Object.entries(r).every(([k, v]) => v.n > 0 && v.n <= people * 1.1 && v.close >= (k.startsWith('cell') ? 2 : 3));
  check('A brush stroke of cows, wolves, sharks or cells scatters a few, apart, as with people', ok,
    `${Object.entries(r).map(([k, v]) => `${k} ${v.n} (closest ${v.close})`).join(', ')}; people ${people}`);
}

// ── sugar and lime ──
{
  const w = world(60, 40);
  ground(w, ID.STONE, 4);
  rect(w, 10, 20, 50, 35, ID.WATER);
  rect(w, 25, 14, 35, 19, ID.SUGAR);
  run(w, 1200);
  check('Sugar in water ferments into alcohol', count(w, ID.ALCOHOL) > 10 && count(w, ID.SUGAR) < 66, `${count(w, ID.ALCOHOL)} alcohol, ${count(w, ID.SUGAR)} of 66 sugar left`);
  const w2 = world(60, 40);
  ground(w2, ID.STONE, 4);
  rect(w2, 20, 30, 40, 35, ID.SUGAR); rect(w2, 20, 26, 40, 29, ID.ACID);
  run(w2, 300);
  check('Acid chars sugar into black carbon', count(w2, ID.COAL) > 5, `${count(w2, ID.COAL)} coal`);
  const w3 = world(60, 40);
  ground(w3, ID.STONE, 4);
  rect(w3, 10, 30, 50, 35, ID.SAND); rect(w3, 10, 25, 50, 29, ID.LIME);
  run(w3, 1500);
  check('Lime stirred into sand makes cement, which sets into concrete', count(w3, ID.CONCRETE) > 30, `${count(w3, ID.CONCRETE)} concrete, ${count(w3, ID.CEMENT)} cement`);
  const w4 = world(60, 40);
  ground(w4, ID.STONE, 4);
  rect(w4, 10, 30, 50, 35, ID.LIME); rect(w4, 10, 22, 50, 29, ID.CO2);
  run(w4, 400);
  check('Carbon dioxide turns lime to limestone', count(w4, ID.LIMESTONE) > 20, `${count(w4, ID.LIMESTONE)} limestone`);
  const w5 = world(60, 40);
  ground(w5, ID.STONE, 4);
  rect(w5, 20, 30, 40, 35, ID.LIMESTONE); rect(w5, 20, 26, 40, 29, ID.ACID);
  const l0 = count(w5, ID.LIMESTONE);
  let fizz = 0;
  run(w5, 300, (ww) => { fizz += ww.events.fizz; });
  check('Acid fizzes limestone away to carbon dioxide', count(w5, ID.LIMESTONE) < l0 - 10 && fizz > 10, `${l0} → ${count(w5, ID.LIMESTONE)} limestone, ${fizz} fizzes`);
}

// ── plants grow into other kinds ──
{
  // did the plant grow into t at some point? (a pine in snow may freeze to death soon after)
  const grow = (beside, t) => {
    const w = world(60, 40);
    w.disc[t] = 0; w.grew = false;
    ground(w, ID.SOIL, 6);
    rect(w, 0, 33, 59, 33, ID.EMPTY);
    w.paint(30, 33, 1, ID.PLANT, 1, false);
    run(w, 400);
    // the thing it should grow into: beside the stem
    for (let i = 0; i < w.N; i++) if (w.type[i] === ID.PLANT && !(w.flags[i] & Sim.LEAF)) {
      for (const d of [-1, 1]) if (w.type[i + d] === ID.EMPTY) w.place(i + d, beside);
    }
    run(w, 1500, (ww) => { for (let k = 0; k < ww.events.found.length; k += 3) if (ww.events.found[k] === t) ww.grew = true; });
    return w;
  };
  const wants = [['wood', ID.WOOD, ID.SAPLING], ['snow', ID.SNOW, ID.PINE], ['saltwater', ID.SALTWATER, ID.PALM], ['clay', ID.CLAY, ID.WILLOW],
    ['ash', ID.ASH, ID.GRASS], ['sand', ID.SAND, ID.CACTUS], ['brick', ID.BRICK, ID.VINE]];
  const got = wants.map(([k, b, t]) => [k, [0, 1, 2].some(() => grow(b, t).grew)]); // a few tries: it is a matter of chance
  check('A plant grows into an oak by wood, a pine in snow, a palm by the sea…', got.every(([, ok]) => ok), got.map(([k, ok]) => `${k} ${ok ? 'yes' : 'NO'}`).join(', '));
  const w = world(60, 40);
  ground(w, ID.SAND, 6); rect(w, 10, 22, 50, 33, ID.WATER);
  for (let k = 0; k < 6; k++) w.paint(30, 18, 4, ID.FLOWER, 1, false); // over the water: its seeds drop in
  run(w, 4000);
  check('A flower dropped in a pond seeds a water lily', count(w, ID.LILY) > 0, `${count(w, ID.LILY)} lily cells`);
}

// ── stalactites ──
{
  const w = world(80, 60);
  ground(w, ID.STONE, 4);
  rect(w, 0, 0, 79, 3, ID.WATER);        // a pond on the rock above
  rect(w, 0, 4, 79, 14, ID.LIMESTONE);   // the rock
  rect(w, 0, 15, 0, 55, ID.WALL); rect(w, 79, 15, 79, 55, ID.WALL);
  run(w, 3000, (ww) => { rect(ww, 1, 0, 78, 1, ID.WATER); }); // kept topped up
  const hanging = cells(w, (t, i) => t === ID.LIMESTONE && w.data[i] > 0 && ((i / w.SW) | 0) - 1 < 30);
  const longest = Math.max(0, ...Array.from(w.data).filter((v, i) => w.type[i] === ID.LIMESTONE && ((i / w.SW) | 0) - 1 < 30));
  const rising = cells(w, (t, i) => t === ID.LIMESTONE && ((i / w.SW) | 0) - 1 > 40);
  check('Water seeping through limestone grows stalactites, and stalagmites under them', hanging > 20 && longest >= 3 && rising > 0,
    `${hanging} stalactite cells, the longest ${longest}; ${rising} stalagmite cells`);
}

// ── the Smash tool ──
{
  const w = world(60, 40);
  rect(w, 5, 30, 14, 35, ID.STONE); rect(w, 20, 30, 29, 35, ID.GLASS); rect(w, 35, 30, 44, 35, ID.METAL); rect(w, 48, 30, 55, 35, ID.DIAMOND);
  w.setBrush('box', 0, 28, 59, 39);
  for (let k = 0; k < 8; k++) w.smash(30, 33, 30);
  const stoneRubble = cells(w, (t, i) => t === ID.RUBBLE && w.aux[i] === ID.STONE); // rubble the colour of what it was
  check('Smash breaks stone to rubble of its colour and glass to shards, as a quake would; metal and diamond hold',
    count(w, ID.STONE) < 10 && stoneRubble > 40 && count(w, ID.GLASS) < 10 && count(w, ID.SHARDS) > 40 && count(w, ID.METAL) === 60 && count(w, ID.DIAMOND) === 48 && count(w, ID.SAND) === 0,
    `stone ${count(w, ID.STONE)}, stone rubble ${stoneRubble}, sand ${count(w, ID.SAND)}, glass ${count(w, ID.GLASS)}, shards ${count(w, ID.SHARDS)}, metal ${count(w, ID.METAL)}, diamond ${count(w, ID.DIAMOND)}`);
}

// ── rainbow fire ──
{
  const w = world(60, 40);
  ground(w, ID.STONE, 4);
  rect(w, 20, 30, 40, 35, ID.WOOD);
  w.paint(30, 30, 4, ID.FIRE, 1, false, Infinity, Sim.RAINBOW);
  let rainbow = 0;
  run(w, 400, (ww) => { if (ww.tick % 20 === 0) rainbow = Math.max(rainbow, cells(ww, (t, i) => t === ID.FIRE && ww.aux[i] === Sim.RAINBOW)); });
  check('Rainbow fire painted on wood keeps burning in the rainbow as it spreads', rainbow > 10, `${rainbow} rainbow flames at most`);
}

// ── found in the world ──
{
  const findOf = (t, setup, ticks) => {
    const w = world(80, 60);
    w.disc[t] = 0;
    setup(w);
    let found = false;
    run(w, ticks, (ww) => { for (let k = 0; k < ww.events.found.length; k += 3) if (ww.events.found[k] === t) found = true; return found ? false : undefined; });
    return found;
  };
  const r = {
    explosion: findOf(ID.EXPLOSION, (w) => { ground(w, ID.STONE, 4); rect(w, 30, 50, 40, 55, ID.GUNPOWDER); w.temp[w.idx(35, 50)] = 400; }, 600),
    light: findOf(ID.LIGHT, (w) => { ground(w, ID.STONE, 4); w.spawnBolt(40, 2, true); }, 2),
    fog: findOf(ID.FOG, (w) => { ground(w, ID.STONE, 4); rect(w, 20, 50, 60, 55, ID.SNOW); rect(w, 20, 44, 60, 49, ID.STEAM); }, 300),
    snowcloud: findOf(ID.SNOWCLOUD, (w) => { rect(w, 20, 5, 60, 10, ID.CLOUD); rect(w, 20, 11, 60, 12, ID.SNOW); }, 300),
    stormcloud: findOf(ID.STORMCLOUD, (w) => { rect(w, 20, 5, 60, 10, ID.RAINCLOUD); rect(w, 20, 11, 60, 11, ID.SPARK); }, 60),
    hail: findOf(ID.HAIL, (w) => { w.ambient = 5; ground(w, ID.STONE, 4); rect(w, 10, 5, 70, 12, ID.STORMCLOUD); }, 1200),
  };
  check('Explosions, light, fog and every kind of cloud and hail are found when the world makes them', Object.values(r).every(Boolean),
    Object.entries(r).map(([k, v]) => `${k} ${v ? 'yes' : 'NO'}`).join(', '));
}

let fail = 0;
for (const r of out) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.label.padEnd(58)} ${r.detail}`);
}
process.exit(fail ? 1 : 0);
