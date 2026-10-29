// Headless checks for the materials update: the palette's sections (no Weather), plants that die
// off the ground, the trees, plain plants and flowers, cement setting into concrete, alcohol and
// vinegar chemistry, painted explosions, light rays, the Paint and Image tools, rubble that keeps
// its colour, solids' density in the weapons, and old saves keeping their trees alive.
// Run: node tools/materialstest.js
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
function run(w, ticks, each) { for (let k = 0; k < ticks; k++) { if (each) each(w, k); w.step(); w.resetEvents(); } }
const ground = (w, t = ID.SOIL) => rect(w, 0, w.H - 10, w.W - 1, w.H - 1, t);
const isLeaf = (w, i, kind) => w.type[i] === ID.PLANT && (w.flags[i] & Sim.LEAF) && w.aux[i] === kind;

// ── the palette ──
{
  const g = (k) => byKey[k].group;
  check('No Weather section: clouds and fog are gases, hail a powder',
    !ELEM.GROUPS.includes('Weather') && ['cloud', 'raincloud', 'stormcloud', 'snowcloud', 'fog'].every((k) => g(k) === 'Gases') && g('hail') === 'Powders',
    ELEM.GROUPS.join(', '));
  const seeds = ['seed', 'acorn', 'grassseed', 'cactusseed', 'vineseed', 'spores', 'lilyseed', 'pinecone', 'coconut', 'catkin'];
  const plants = ['plant', 'flower', 'grass', 'cactus', 'vine', 'mushroom', 'lily', 'sapling', 'pine', 'palm', 'willow'];
  // (Plant and Flower are starters; the rest are found when a plant grows into them: see lifetest.js)
  check('Seeds and Ember have no tiles; every plant has a tile',
    seeds.every((k) => byKey[k].hidden) && byKey.ember.hidden && plants.every((k) => !byKey[k].hidden) && byKey.plant.starter && byKey.flower.starter,
    `${plants.length} plants, oak tile: ${byKey.sapling.name}`);
  const where = { soil: 'Solids', concrete: 'Solids', cement: 'Liquids', alcohol: 'Liquids', vinegar: 'Liquids',
    explosion: 'Energy', light: 'Energy', pine: 'Plants', palm: 'Plants', willow: 'Plants', paint: 'Special', image: 'Special' };
  check('The new materials sit in their sections', Object.entries(where).every(([k, gr]) => g(k) === gr),
    `${list.length} element types, ${255 - list.length} free`);
  check('Every solid has its own density', list.filter((d) => d.cat === ELEM.CAT.STATIC && d.key !== 'wall').every((d) => d.density !== 100),
    `stone ${byKey.stone.density}, metal ${byKey.metal.density}, wood ${byKey.wood.density}, concrete ${byKey.concrete.density}`);
}

// ── plants die off the ground ──
{
  const w = world();
  ground(w);
  w.paint(30, w.H - 12, 2, ID.PLANT, 1, false);
  w.paint(85, w.H - 12, 3, ID.SAPLING, 1, false);
  run(w, 3000);
  const before = cells(w, (t) => t === ID.PLANT);
  rect(w, 0, w.H - 14, w.W - 1, w.H - 10, ID.EMPTY); // cut everything off the ground
  let gone = -1; // (above the cut: a seed that fell to the ground below may sprout there, rooted)
  run(w, 400, (ww, k) => { if (gone < 0 && cells(ww, (t, i) => (t === ID.PLANT || t === ID.SAPLING) && ((i / ww.SW) | 0) - 1 < ww.H - 14) === 0) gone = k; });
  check('A plant and a tree left hanging in the air die in about three seconds', before > 100 && gone >= 0 && gone <= 220,
    `${before} leaves; all dead after ${gone} ticks (${(gone / 60).toFixed(1)} s)`);
  const w2 = world();
  ground(w2);
  w2.paint(60, w2.H - 12, 2, ID.PLANT, 1, false);
  run(w2, 2500);
  check('…while a rooted plant lives on', cells(w2, (t) => t === ID.PLANT) > 10 && cells(w2, (t) => t === ID.LITTER) < cells(w2, (t) => t === ID.PLANT) * 0.1,
    `${cells(w2, (t) => t === ID.PLANT)} plant cells, ${cells(w2, (t) => t === ID.LITTER)} dead leaves`);
}

// ── trees, plants and flowers ──
{
  const SEED = { [ID.SAPLING]: ID.ACORN, [ID.PINE]: ID.PINECONE, [ID.PALM]: ID.COCONUT, [ID.WILLOW]: ID.CATKIN };
  const grow = (tree, floor, extra) => {
    const w = world();
    ground(w, floor);
    if (extra) extra(w);
    w.paint(60, w.H - 12, 3, tree, 1, false);
    w.seeds = 0; // the most of its seeds lying about at once (they sprout or blow away)
    const watch = (ww, k) => { if (k % 5 === 0) ww.seeds = Math.max(ww.seeds, cells(ww, (t) => t === SEED[tree])); };
    run(w, 6000, watch);
    for (let k = 0; k < 4000 && (!w.seeds || cells(w, (t) => t === tree) > 0); k += 500) run(w, 500, watch); // a slow one finishes
    return w;
  };
  const oak = grow(ID.SAPLING, ID.SOIL), pine = grow(ID.PINE, ID.DIRT), palm = grow(ID.PALM, ID.SAND);
  // a pine on its own, its pinecones cleared away so no seedling grows up beside it
  const lone = world();
  ground(lone, ID.DIRT);
  lone.paint(60, lone.H - 12, 1, ID.PINE, 1, false);
  run(lone, 4000, (ww) => { for (let i = 0; i < ww.N; i++) if (ww.type[i] === ID.PINECONE) ww.place(i, ID.EMPTY); });
  const willow = grow(ID.WILLOW, ID.SOIL, (w) => rect(w, 0, w.H - 12, 20, w.H - 10, ID.WATER));
  const leaves = (w, kind) => cells(w, (t, i) => isLeaf(w, i, kind));
  const trunk = (w) => cells(w, (t, i) => t === ID.WOOD && (w.flags[i] & Sim.LEAF));
  check('An oak, a pine, a palm (on sand) and a willow grow, each with its own leaves',
    leaves(oak, 0) > 60 && leaves(pine, 1) > 60 && leaves(palm, 2) > 25 && leaves(willow, 3) > 60 && trunk(pine) > 15 && trunk(palm) > 10,
    `oak ${leaves(oak, 0)}, pine ${leaves(pine, 1)} needles, palm ${leaves(palm, 2)} fronds, willow ${leaves(willow, 3)} leaves; trunks ${trunk(oak)}/${trunk(pine)}/${trunk(palm)}/${trunk(willow)}`);
  // the pine is a cone: wider low down than near the top
  const span = (w, y) => { let a = Infinity, b = -1; for (let x = 0; x < w.W; x++) if (isLeaf(w, w.idx(x, y), 1)) { a = Math.min(a, x); b = Math.max(b, x); } return b < 0 ? 0 : b - a + 1; };
  const rows = [];
  for (let y = 0; y < lone.H; y++) if (span(lone, y)) rows.push(span(lone, y));
  const hi = Math.max(...rows.slice(0, Math.max(1, Math.floor(rows.length / 4)))), lo = Math.max(...rows); // its top quarter, and its widest
  check('…the pine a cone, the willow with hanging curtains', lo > hi + 3 && cells(willow, (t, i) => isLeaf(willow, i, 3) && willow.type[i + willow.SW] === ID.EMPTY && willow.type[i - willow.SW] === ID.PLANT && willow.type[i - 2 * willow.SW] === ID.PLANT && willow.type[i - 3 * willow.SW] === ID.PLANT) > 1,
    `pine ${hi} wide near the top, ${lo} at the bottom`);
  const seeds = [pine, palm, willow, oak].map((w) => w.seeds);
  check('Trees drop their seeds: pinecones, coconuts, willow fluff, acorns', seeds.every((n) => n > 0), seeds.join(', '));

  const w = world();
  ground(w);
  w.paint(30, w.H - 12, 2, ID.PLANT, 1, false);
  w.paint(90, w.H - 12, 2, ID.FLOWER, 1, false);
  run(w, 3000);
  const petalsL = cells(w, (t, i) => t === ID.FLOWER && w.idx(0, 0) <= i && (i % w.SW) < 60);
  const petalsR = cells(w, (t, i) => t === ID.FLOWER && (i % w.SW) >= 60);
  check('Plant grows leafy with no flowers; Flower blooms', petalsL === 0 && petalsR > 0 && cells(w, (t, i) => t === ID.PLANT && (i % w.SW) < 60) > 20,
    `${petalsL} petals on the plant, ${petalsR} on the flowers`);
}

// ── cement and concrete ──
{
  const w = world();
  ground(w, ID.STONE);
  rect(w, 50, w.H - 15, 50, w.H - 11, ID.WALL); rect(w, 70, w.H - 15, 70, w.H - 11, ID.WALL);
  w.paint(60, w.H - 20, 4, ID.CEMENT, 1, false);
  for (let i = 0; i < w.N; i++) if (w.type[i] === ID.CEMENT && (i % w.SW) < 60) w.col[i] = Sim.PAINTED | 0xc0392b;
  run(w, 900);
  const conc = cells(w, (t) => t === ID.CONCRETE), red = cells(w, (t, i) => t === ID.CONCRETE && (w.col[i] & 0xffffff) === 0xc0392b);
  check('Poured cement sets into concrete, keeping any paint', cells(w, (t) => t === ID.CEMENT) === 0 && conc > 30 && red > 5,
    `${conc} concrete, ${red} of it painted red`);
}

// ── alcohol ──
{
  const w = world();
  ground(w, ID.STONE);
  rect(w, 40, w.H - 14, 80, w.H - 11, ID.ALCOHOL);
  w.paint(60, w.H - 16, 2, ID.FIRE, 1, false);
  let blue = 0, fire = 0;
  run(w, 300, (ww, k) => { if (k < 80) return; fire += cells(ww, (t) => t === ID.FIRE); blue += cells(ww, (t, i) => t === ID.FIRE && ww.aux[i] === ID.ALCOHOL); }); // once the match's own flame is out
  check('Alcohol burns with its own pale blue flame', fire > 100 && blue > fire * 0.5, `${blue} of ${fire} fire cell-ticks blue`);

  const w2 = world();
  ground(w2, ID.STONE);
  rect(w2, 40, w2.H - 16, 80, w2.H - 11, ID.ALCOHOL);
  for (let x = 45; x < 76; x += 5) w2.place(w2.idx(x, w2.H - 17), ID.EL_NA);
  let h = 0, booms = 0;
  run(w2, 600, (ww) => { h += cells(ww, (t) => t === ID.EL_H) > 0 ? 1 : 0; booms += ww.events.booms.length; });
  check('Sodium in alcohol fizzes off hydrogen gently, with no bang', h > 20 && booms === 0 && cells(w2, (t) => t === ID.EL_NA) < 7,
    `hydrogen on ${h} ticks, ${booms} blasts, ${cells(w2, (t) => t === ID.EL_NA)} of 7 sodium left`);

  const w3 = world();
  ground(w3);
  w3.paint(30, w3.H - 12, 2, ID.PLANT, 1, false);
  run(w3, 2000);
  const p0 = cells(w3, (t) => t === ID.PLANT);
  let px = 0, top = w3.H; // pour it straight onto the plant's top
  for (let i = 0; i < w3.N; i++) if (w3.type[i] === ID.PLANT && ((i / w3.SW) | 0) < top) { top = (i / w3.SW) | 0; px = (i % w3.SW) - 1; }
  for (let k = 0; k < 8; k++) w3.paint(px, top - 6, 4, ID.ALCOHOL, 1, false);
  run(w3, 900);
  check('Alcohol poured on a plant kills what it soaks', cells(w3, (t) => t === ID.PLANT) < p0 * 0.85 && cells(w3, (t) => t === ID.LITTER) > 0, `${p0} plant cells, then ${cells(w3, (t) => t === ID.PLANT)}`);
}

// ── vinegar ──
{
  const w = world();
  ground(w, ID.STONE);
  rect(w, 10, w.H - 16, 110, w.H - 11, ID.VINEGAR);
  const metals = [['EL_MG', 20], ['EL_CU', 50], ['EL_AU', 80], ['ASH', 100]];
  for (const [k, x] of metals) rect(w, x, w.H - 11, x + 4, w.H - 11, ID[k]);
  let h = 0, co2 = 0;
  run(w, 1500, (ww) => { h = Math.max(h, cells(ww, (t) => t === ID.EL_H)); co2 = Math.max(co2, cells(ww, (t) => t === ID.CO2)); });
  const left = (k) => cells(w, (t) => t === ID[k]);
  const green = cells(w, (t, i) => t === ID.EL_CU && w.col[i]);
  check('Vinegar: magnesium fizzes away, copper goes green, gold stays, ash fizzes', left('EL_MG') < 3 && green > 0 && left('EL_AU') === 5 && co2 > 0 && h > 0,
    `Mg ${left('EL_MG')}/5 left, ${green} copper green, Au ${left('EL_AU')}/5, ash ${left('ASH')}/5 left, CO₂ up to ${co2}`);
}

// ── explosion, painted ──
{
  // a square brush: the blast is square
  const sq = Sim.createWorld(120, 80); sq.disc.fill(1);
  rect(sq, 20, 20, 100, 70, ID.CLAY);
  const before = cells(sq, (t) => t === ID.CLAY);
  sq.setBrush('square');
  const n = sq.blastPaint(60, 45, 8, ID.EL_CU);
  sq.setBrush('circle');
  // what broke: nothing outside the 17 × 17 square
  let outside = 0;
  for (let y = 20; y <= 70; y++) for (let x = 20; x <= 100; x++) if (sq.type[sq.idx(x, y)] !== ID.CLAY && (Math.abs(x - 60) > 8 || Math.abs(y - 45) > 8)) outside++;
  let corner = 0; // the square's corners, which a round brush of this size never reaches
  for (let y = 37; y <= 53; y++) for (let x = 52; x <= 68; x++) if (Math.abs(x - 60) > 5 && Math.abs(y - 45) > 5 && sq.type[sq.idx(x, y)] !== ID.CLAY) corner++;
  const blue = cells(sq, (t, i) => t === ID.FIRE && sq.aux[i] === ID.EL_CU);
  check('A painted explosion takes the brush’s shape and the fire colour', n > 200 && outside === 0 && corner > 10 && blue > 0 && sq.events.booms[3] === ID.EL_CU,
    `${n} cells in the blast, ${before - cells(sq, (t) => t === ID.CLAY)} clay broken (${corner} in the corners), ${outside} outside the square, ${blue} blue-green flames`);
}

// ── light ──
{
  const w = world();
  rect(w, 60, 30, 61, 50, ID.GLASS);
  for (let y = 30; y <= 50; y++) for (const x of [60, 61]) w.aux[w.idx(x, y)] = ID.EL_CO;
  rect(w, 100, 30, 101, 50, ID.METAL);
  const i0 = w.idx(20, 40);
  w.place(i0, ID.LIGHT); w.aux[i0] = 0; // east
  let past = false, back = false, colour = 0;
  run(w, 90, (ww) => {
    for (let i = 0; i < ww.N; i++) if (ww.type[i] === ID.LIGHT) {
      const x = (i % ww.SW) - 1;
      if (x > 61) { past = true; colour = ww.col[i]; }
      if (past && x < 95 && ww.aux[i] === 4) back = true;
    }
  });
  check('Light runs through stained glass, takes its colour, and bounces off metal', past && (colour & 0xffffff) !== 0 && back,
    `through the glass: ${past}, colour #${(colour & 0xffffff).toString(16)}, back off the metal: ${back}`);
  const w2 = world();
  rect(w2, 80, 30, 84, 50, ID.EL_SI);
  for (let y = 32; y < 48; y += 2) { const i = w2.idx(10, y); w2.place(i, ID.LIGHT); w2.aux[i] = 0; }
  let charged = 0;
  run(w2, 80, (ww) => { charged = Math.max(charged, cells(ww, (t, i) => t === ID.EL_SI && ww.charge[i])); });
  check('Light on a silicon solar cell makes current', charged > 0, `${charged} silicon cells carrying current`);
}

// ── paint and pictures ──
{
  const w = world();
  ground(w, ID.STONE);
  rect(w, 40, 20, 60, 40, ID.WOOD);
  const n = w.tintPaint(50, 30, 4, 0x2e5cb8);
  const px = new Uint8ClampedArray(4 * 4 * 3);
  for (let k = 0; k < 12; k++) { px[k * 4] = 200; px[k * 4 + 1] = 40 + k; px[k * 4 + 2] = 10; px[k * 4 + 3] = k === 5 ? 0 : 255; }
  const m = w.placeImage(90, 30, 4, 3, px);
  const saved = JSON.parse(JSON.stringify(w.serialize()));
  const w2 = world(); w2.load(saved);
  const blueWood = cells(w2, (t, i) => t === ID.WOOD && (w2.col[i] & 0xffffff) === 0x2e5cb8);
  const pic = cells(w2, (t, i) => t === ID.CONCRETE && (w2.col[i] & Sim.EXACT));
  const exact = w2.col[w2.idx(88, 29)] & 0xffffff;
  check('Paint recolours wood; a picture is built in concrete, see-through pixels skipped; both saved', n > 30 && blueWood === n && m === 11 && pic === 11 && exact === ((200 << 16) | (40 << 8) | 10),
    `${blueWood} wood cells blue, picture ${m} cells (${pic} after loading)`);
  const sn = w.snapshot();
  w.tintPaint(50, 30, 4, 0);
  const off = cells(w, (t, i) => w.col[i] && t === ID.WOOD);
  w.restore(sn);
  check('Paint washes off, and undo brings it back', off === 0 && cells(w, (t, i) => t === ID.WOOD && w.col[i]) === n, `${off} painted after washing, ${n} after undo`);
}

// ── rubble keeps its colour; density in the weapons ──
{
  const w = world();
  rect(w, 30, 40, 50, 60, ID.BRICK); rect(w, 70, 40, 90, 60, ID.CONCRETE);
  for (let y = 40; y <= 60; y++) for (let x = 70; x <= 90; x++) w.col[w.idx(x, y)] = Sim.PAINTED | 0x7dbb3a;
  w.launch('quake', 60, 50, 1, { magnitude: 9 });
  run(w, 900);
  const red = cells(w, (t, i) => t === ID.RUBBLE && w.aux[i] === ID.BRICK), green = cells(w, (t, i) => t === ID.RUBBLE && w.aux[i] === ID.CONCRETE && (w.col[i] & 0xffffff) === 0x7dbb3a);
  check('Broken brick is red rubble; painted concrete breaks into rubble of its paint', red > 20 && green > 5, `${red} brick rubble, ${green} green concrete rubble`);

  const w2 = world(160, 100);
  rect(w2, 50, 40, 60, 60, ID.WOOD); rect(w2, 100, 40, 110, 60, ID.METAL);
  w2.launch('blackhole', 80, 50, 1.4);
  run(w2, 160);
  const wood = 231 - cells(w2, (t) => t === ID.WOOD), metal = 231 - cells(w2, (t) => t === ID.METAL);
  check('A black hole tears light wood apart before dense metal', wood > metal * 1.5, `${wood} wood torn, ${metal} metal torn`);

  const w3 = world(160, 100);
  rect(w3, 0, 90, 159, 99, ID.WALL);
  rect(w3, 60, 86, 75, 89, ID.SAND); rect(w3, 85, 86, 100, 89, ID.EL_AU);
  w3.explode(80, 88, 3, 1, 0);
  let sandUp = 0, goldUp = 0;
  run(w3, 30, (ww) => {
    for (let i = 0; i < ww.N; i++) {
      const y = ((i / ww.SW) | 0) - 1;
      if (ww.type[i] === ID.SAND) sandUp = Math.max(sandUp, 86 - y);
      if (ww.type[i] === ID.EL_AU) goldUp = Math.max(goldUp, 86 - y);
    }
  });
  check('A blast throws sand higher than heavy gold grains', sandUp > goldUp, `sand up ${sandUp} cells, gold ${goldUp}`);

  const w4 = world();
  rect(w4, 40, 40, 60, 60, ID.SOLID_AU);
  w4.launch('quake', 50, 50, 1, { magnitude: 10 });
  run(w4, 900);
  check('A great earthquake breaks a solid gold block into gold grains', cells(w4, (t) => t === ID.EL_AU) > 0, `${cells(w4, (t) => t === ID.EL_AU)} gold grains, ${cells(w4, (t) => t === ID.SOLID_AU)} block left`);
}

// ── old saves keep their trees ──
{
  const w = world();
  ground(w);
  rect(w, 60, w.H - 30, 61, w.H - 11, ID.WOOD);
  for (let y = w.H - 36; y <= w.H - 30; y++) for (let x = 55; x <= 66; x++) if (w.type[w.idx(x, y)] === ID.EMPTY) { const i = w.idx(x, y); w.place(i, ID.PLANT); w.flags[i] = Sim.LEAF; }
  const s = w.serialize();
  s.v = 4; delete s.col; // as an older version saved it
  const w2 = world(); w2.load(JSON.parse(JSON.stringify(s)));
  const l0 = cells(w2, (t) => t === ID.PLANT);
  run(w2, 600);
  check('An older save’s tree comes back alive and stays so', l0 > 50 && cells(w2, (t) => t === ID.PLANT) > l0 * 0.9,
    `${l0} leaves, ${cells(w2, (t) => t === ID.PLANT)} after ten seconds`);
}

let fail = 0;
for (const r of out) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.label.padEnd(58)} ${r.detail}`);
}
process.exit(fail ? 1 : 0);
