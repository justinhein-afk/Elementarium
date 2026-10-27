// Headless checks for colours in glass and fire, and for the powders rubble and glass shards:
// a colour opens the first time you make it in your own world (not from a scene, not with a locked
// element), Glass and Fire paint in the chosen colour, stained glass breaks into shards of its colour
// and they melt back into stained glass, and rubble is found when rock breaks up.
// Run: node tools/tintstest.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
for (const f of ['elements.js', 'periodic.js', 'sim.js', 'scenes.js', 'facts.js', 'lab.js', 'tryit.js', 'tints.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
}
const { ELEM, Sim, Lab, TryIt, Tints, Scenes } = globalThis;
const { ID, byKey } = ELEM;

const out = [];
const check = (label, ok, detail) => out.push({ label, ok, detail });
const mem = {};
const store = { get: (k, d) => (k in mem ? mem[k] : d), set: (k, v) => { mem[k] = v; } };
Lab.init(store); TryIt.init(store); Tints.init(store);
Lab.restore(ELEM.periodic.map((d) => d.sym)); // every element unlocked
function world(W = 96, H = 64) { const w = Sim.createWorld(W, H); w.disc.fill(1); return w; }
const rect = (w, x0, y0, x1, y1, t) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) w.place(w.idx(x, y), t); };
const cells = (w, pred) => { let n = 0; for (let i = 0; i < w.N; i++) if (pred(w.type[i], w.aux[i], i)) n++; return n; };
function run(w, ticks, each) { for (let k = 0; k < ticks; k++) { if (each) each(w, k); w.step(); Tints.frame(w); w.resetEvents(); } }

// a pool of molten glass kept hot, with grains of `t` stirred in from above
function stir(t, aside) {
  const w = world();
  rect(w, 0, 56, 95, 63, ID.WALL); rect(w, 30, 48, 65, 55, ID.MGLASS);
  for (let x = 32; x < 64; x += 3) w.place(w.idx(x, 45), t);
  if (aside) TryIt.staged(w);
  run(w, 400, (ww) => { for (let i = 0; i < ww.N; i++) if (ww.type[i] === ID.MGLASS) ww.temp[i] = 1500; });
  return w;
}
// a wood fire with grains of `t` sprinkled in
function campfire(t) {
  const w = world();
  rect(w, 0, 56, 95, 63, ID.STONE); rect(w, 30, 48, 65, 55, ID.WOOD);
  for (let x = 30; x <= 65; x++) w.ignite(w.idx(x, 48));
  for (let x = 32; x < 64; x += 3) w.place(w.idx(x, 44), t);
  run(w, 600);
  return w;
}
const open = (kind, sym) => Tints.options(kind).find((o) => o.d.sym === sym).open;

// ── a colour opens the first time you make it yourself ──
{
  check('Nothing is open at first', Tints.count('glass') === 0 && Tints.count('fire') === 0 && Tints.tintFor(ID.GLASS) === 0, 'no colours made');
  stir(ID.EL_CO);
  check('Cobalt stirred into molten glass opens cobalt blue', open('glass', 'Co') && Tints.count('glass') === 1, `${Tints.count('glass')} glass colour`);
  campfire(ID.EL_CU);
  check('Copper in a fire opens blue-green fire', open('fire', 'Cu') && Tints.count('fire') === 1, `${Tints.count('fire')} fire colour`);
  stir(ID.EL_AU, true);
  check('A scene’s own stained glass opens nothing', !open('glass', 'Au'), 'gold set aside as the scene’s');
  Lab.restore(ELEM.periodic.filter((d) => d.sym !== 'Mn').map((d) => d.sym));
  stir(ID.EL_MN);
  check('A locked element’s colour stays shut', !open('glass', 'Mn'), 'manganese locked in the Lab');
  Lab.restore(ELEM.periodic.map((d) => d.sym));
}
{ // choosing, and keeping the choice
  Tints.choose('glass', ID.EL_CO);
  Tints.choose('fire', ID.EL_AU); // not made: ignored
  const glass = Tints.tintFor(ID.GLASS), fire = Tints.tintFor(ID.FIRE), sand = Tints.tintFor(ID.SAND);
  Tints.init(store);
  check('A colour can be chosen once made, and is kept', glass === ID.EL_CO && fire === 0 && sand === 0 && Tints.tintFor(ID.GLASS) === ID.EL_CO,
    `glass ${glass ? 'cobalt' : 'plain'}, fire ${fire ? 'gold?' : 'plain'}, sand ${sand ? 'tinted?' : 'plain'}, after reloading: ${Tints.chosen('glass').name}`);
}
// ── painting in a colour ──
{
  const w = world();
  w.paint(48, 30, 5, ID.GLASS, 1, false, Infinity, ID.EL_CO);
  const all = cells(w, (t) => t === ID.GLASS), blue = cells(w, (t, a) => t === ID.GLASS && a === ID.EL_CO);
  check('Glass paints in its colour', all > 50 && blue === all, `${blue} of ${all} glass cells cobalt blue`);
}
{ // fire painted onto a woodpile burns in its colour, and the colour runs through the blaze
  const w = world();
  rect(w, 0, 56, 95, 63, ID.STONE); rect(w, 30, 46, 65, 55, ID.WOOD);
  w.paint(47, 46, 6, ID.FIRE, 1, false, Infinity, ID.EL_CU);
  let fire = 0, green = 0;
  run(w, 300, (ww, k) => { if (k > 60) { fire += cells(ww, (t) => t === ID.FIRE); green += cells(ww, (t, a) => t === ID.FIRE && a === ID.EL_CU); } });
  check('Fire paints in its colour, and the blaze keeps it', fire > 300 && green > fire * 0.6, `${green} of ${fire} fire cell-ticks blue-green`);
}
// ── glass shards and rubble ──
{
  const w = world();
  rect(w, 0, 56, 95, 63, ID.STONE); rect(w, 30, 40, 65, 55, ID.GLASS);
  for (let y = 40; y <= 55; y++) for (let x = 30; x <= 47; x++) w.aux[w.idx(x, y)] = ID.EL_CO; // the left half cobalt blue
  w.disc[ID.RUBBLE] = 0;
  let rubble = false;
  w.launch('quake', 48, 50, 1, 7.5);
  for (let k = 0; k < 900; k++) { w.step(); for (let j = 0; j < w.events.found.length; j += 3) if (w.events.found[j] === ID.RUBBLE) rubble = true; w.resetEvents(); }
  const shards = cells(w, (t) => t === ID.SHARDS), blue = cells(w, (t, a) => t === ID.SHARDS && a === ID.EL_CO);
  check('An earthquake breaks glass into shards', shards > 200 && cells(w, (t) => t === ID.SAND) === 0, `${shards} shards, no sand`);
  check('…and stained glass into shards of its colour', blue > shards * 0.3 && blue < shards * 0.7, `${blue} of ${shards} shards cobalt blue (half the glass was)`);
  check('Rock broken up by it is found as rubble', rubble && cells(w, (t) => t === ID.RUBBLE) > 0, `${cells(w, (t) => t === ID.RUBBLE)} rubble`);
}
{ // coloured shards melt back into molten glass of their colour, and set as stained glass
  const w = world();
  rect(w, 0, 56, 95, 63, ID.WALL); rect(w, 40, 50, 55, 55, ID.SHARDS);
  for (let i = 0; i < w.N; i++) if (w.type[i] === ID.SHARDS) w.aux[i] = ID.EL_AU;
  run(w, 300, (ww, k) => { if (k < 150) for (let i = 0; i < ww.N; i++) if (ww.type[i] === ID.SHARDS || ww.type[i] === ID.MGLASS) ww.temp[i] = 1600; });
  const molten = cells(w, (t) => t === ID.MGLASS), ruby = cells(w, (t, a) => (t === ID.MGLASS || t === ID.GLASS) && a === ID.EL_AU);
  run(w, 3000);
  const set = cells(w, (t, a) => t === ID.GLASS && a === ID.EL_AU);
  check('Ruby shards melt into ruby glass', ruby > 60 && set > 60, `${ruby} ruby molten or set, then ${set} ruby glass`);
}
{
  const g = (k) => byKey[k].group;
  check('Rubble, glass shards and dry ice are powders', g('rubble') === 'Powders' && g('shards') === 'Powders' && g('dryice') === 'Powders'
    && !byKey.rubble.hidden && ELEM.discoverable.includes(byKey.rubble) && ELEM.discoverable.includes(byKey.shards), 'all three in Powders, rubble and shards to discover');
}
{
  const w = world();
  Scenes.electrics(w);
  check('The Electric workshop’s window counts as the scene’s', TryIt.staged(w) === undefined && TryIt.aside(w, ID.EL_CO), 'its stained glass is set aside');
}

let fail = 0;
for (const r of out) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.label.padEnd(46)} ${r.detail}`);
}
process.exit(fail ? 1 : 0);
