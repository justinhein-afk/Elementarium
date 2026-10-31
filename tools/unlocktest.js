// Headless checks for what is earned (unlocks.js): the Journey at 30 finds and the Weapons tab at
// 50, every weapon's quest (feats in your own world, chapters won), every scene's, the skies, the
// machine parts a battery opens by touch, sandbox opening everything; and the black hole that
// swallows a falling hydrogen bomb.
// Run: node tools/unlocktest.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
for (const f of ['elements.js', 'periodic.js', 'materials.js', 'sim.js', 'facts.js', 'lab.js', 'tryit.js', 'tints.js', 'scenes.js', 'unlocks.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
}
const { ELEM, Sim, Unlocks } = globalThis;
const { ID, byKey } = ELEM;

const out = [];
const check = (label, ok, detail = '') => out.push({ label, ok, detail });
const rect = (w, x0, y0, x1, y1, t) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) w.place(w.idx(x, y), t); };

// a fresh set of unlocks with made-up progress
function setup(over = {}) {
  const mem = new Map();
  const store = { get: (k, d) => (mem.has(k) ? JSON.parse(mem.get(k)) : d), set: (k, v) => mem.set(k, JSON.stringify(v)) };
  const f = Object.assign({
    sandbox: () => false, found: () => 17, known: () => false, glass: () => 0, tried: () => false,
    journeyWon: () => false, labMet: () => false,
  }, over);
  Unlocks.init(store, f);
  return { store, f };
}
const world = (W = 320, H = 200) => { const w = Sim.createWorld(W, H); w.disc.fill(1); return w; };
// run a world for n ticks, handing each tick's events to the unlocks as main.js does; returns what opened
function run(w, n, each) {
  const fresh = [];
  for (let k = 0; k < n; k++) {
    if (each) each(w, k);
    w.step();
    fresh.push(...Unlocks.frame(w, w.events));
    w.resetEvents();
  }
  return fresh;
}
const opened = (fresh, kind, name) => fresh.some(([k, n]) => k === kind && n === name);

{ // the Journey and the Weapons tab open on finds
  let n = 17;
  setup({ found: () => n });
  const before = Unlocks.has('journey') || Unlocks.has('weapons');
  n = 30; const a = Unlocks.check();
  n = 49; Unlocks.check(); const tab49 = Unlocks.has('weapons');
  n = 50; const b = Unlocks.check();
  check('The Journey opens at 30 finds, the Weapons tab at 50', !before && opened(a, 'journey') && !tab49 && opened(b, 'weapons'), `journey ${opened(a, 'journey')}, tab at 49 ${tab49}, at 50 ${opened(b, 'weapons')}`);
}
{ // the tsunami: the sea standing above the line
  setup();
  const w = world(), line = Math.round(w.H * Unlocks.FLOOD_ROW);
  rect(w, 0, line + 6, w.W - 1, w.H - 1, ID.WATER);
  const low = run(w, 31);
  rect(w, 0, line - 2, w.W - 1, w.H - 1, ID.WATER);
  const high = run(w, 31);
  check('Water up to the line earns the Tsunami; below it, not', !opened(low, 'weapon', 'tsunami') && opened(high, 'weapon', 'tsunami'), `below ${opened(low, 'weapon', 'tsunami')}, at the line ${opened(high, 'weapon', 'tsunami')}`);
}
{ // the volcano: obsidian found and lava past 3,000°C opens the scene, and the weapon with it
  let obs = false;
  setup({ known: (t) => obs && t === ID.OBSIDIAN });
  const w = world(160, 100);
  rect(w, 0, 90, 159, 99, ID.STONE);
  rect(w, 68, 80, 68, 89, ID.WALL); rect(w, 81, 80, 81, 89, ID.WALL); // a crucible
  rect(w, 69, 85, 80, 89, ID.LAVA);
  const warm = run(w, 31, (ww) => ww.heat(74, 87, 4, 0) || ww.heat(74, 87, 4, Math.max(0, 2500 - ww.temp[ww.idx(74, 87)])));
  const hot = run(w, 31, (ww) => ww.heat(74, 87, 4, 28));
  const lavaFirst = Unlocks.has('scene', 'volcano');
  obs = true;
  const both = Unlocks.check();
  check('Lava past 3,000°C and obsidian open the Volcano scene and weapon', !warm.length && !lavaFirst && opened(both, 'scene', 'volcano') && opened(both, 'weapon', 'volcano') && Unlocks.has('sky', 'dusk'),
    `at 2,500° ${warm.length}, at 3,200° without obsidian ${lavaFirst}, with it ${both.map((x) => x.join(':')).join(' ')}`);
}
{ // the lightning storm: a storm cloud's own bolt, not a weapon's
  setup();
  const w = world(160, 100);
  rect(w, 0, 90, 159, 99, ID.STONE);
  const weapon = run(w, 5, (ww, k) => { if (k === 1) ww.spawnBolt(40, 10, false); });
  const natural = run(w, 5, (ww, k) => { if (k === 1) ww.spawnBolt(80, 10, true); });
  check('A storm cloud’s own bolt earns the Lightning storm; a weapon’s doesn’t', !opened(weapon, 'weapon', 'storm') && opened(natural, 'weapon', 'storm'));
}
{ // the earthquake: 5,000 cells smashed, counted over many strokes
  setup();
  let fresh = [];
  for (let k = 0; k < 49; k++) fresh = fresh.concat(Unlocks.smashed(100));
  const at4900 = Unlocks.has('weapon', 'quake');
  fresh = fresh.concat(Unlocks.smashed(150));
  check('Smashing 5,000 cells earns the Earthquake', !at4900 && opened(fresh, 'weapon', 'quake'), `at 4,900 ${at4900}; smashed ${Unlocks.feats().smashed}`);
}
{ // the ice age: 3,000 cells of ice at once
  setup();
  const w = world();
  rect(w, 0, 190, 199, 199, ID.ICE);
  const few = run(w, 31);
  rect(w, 0, 170, 319, 199, ID.ICE);
  const lots = run(w, 31);
  check('3,000 cells of ice earn the Ice age', !opened(few, 'weapon', 'freeze') && opened(lots, 'weapon', 'freeze'), `${w.counts[ID.ICE]} ice`);
}
{ // the tornado: 10 big blasts, a moment apart
  setup();
  const w = world(200, 120);
  rect(w, 0, 110, 199, 119, ID.STONE);
  const burst = run(w, 10, (ww) => ww.explode(100, 100, 6, 1, 0)); // ten in a row count once
  const once = Unlocks.feats().blasts;
  const spaced = run(w, 40 * 10, (ww, k) => { if (k % 40 === 0) ww.explode(30 + (k / 40) * 14, 100, 6, 1, 0); });
  check('Ten big blasts a moment apart earn the Tornado', once === 1 && !opened(burst, 'weapon', 'tornado') && opened(spaced, 'weapon', 'tornado'), `a burst counted ${once}; then ${Unlocks.feats().blasts}`);
}
{ // the hydrogen bomb: five Nukes beside hydrogen
  setup();
  const w = world(200, 120);
  rect(w, 0, 110, 199, 119, ID.STONE);
  const dry = Unlocks.nuked(w, 100, 100, 20);
  rect(w, 90, 95, 109, 104, ID.EL_H);
  let fresh = [];
  for (let k = 0; k < 4; k++) fresh = fresh.concat(Unlocks.nuked(w, 100, 100, 20));
  const four = Unlocks.has('weapon', 'hbomb');
  fresh = fresh.concat(Unlocks.nuked(w, 100, 100, 20));
  check('Five Nukes beside hydrogen earn the H-bomb', !dry.length && !four && opened(fresh, 'weapon', 'hbomb'), `${Unlocks.feats().hnukes} counted`);
}
{ // machine parts: a battery touching each partner
  setup();
  const w = world(160, 60);
  rect(w, 0, 50, 159, 59, ID.STONE);
  const pairs = { wire: 'metal', switch: 'wood', sensor: 'fire', pipe: 'water', pump: 'oil', valve: 'steam', tank: 'glass', piston: 'stone', thruster: 'methane', legs: 'rubble' };
  let x = 4;
  // each on the floor beside a battery in a little cup, painted on for a few ticks as a brush would
  const fresh = run(w, 31, (ww, k) => {
    if (k > 8) return;
    x = 4;
    for (const p of Object.values(pairs)) {
      if (!k) { rect(ww, x - 1, 46, x - 1, 49, ID.WALL); rect(ww, x + 2, 46, x + 2, 49, ID.WALL); ww.place(ww.idx(x, 49), ID.BATTERY); }
      if (ww.type[ww.idx(x + 1, 49)] === ID.EMPTY || !k) ww.place(ww.idx(x + 1, 49), byKey[p].id);
      x += 8;
    }
  });
  const got = Object.keys(pairs).filter((p) => Unlocks.has('part', p));
  const water = Unlocks.has('scene', 'machines');
  check('A battery touching each partner opens its machine part, and the Waterworks with them', got.length === 10 && water, `${got.join(', ')}; Waterworks ${water}`);
}
{ // weapons from the Journey, scenes from finds, skies with their scenes
  const won = new Set(['spring', 'pumphouse', 'skywatch', 'deepdown', 'launch']);
  setup({ found: () => 95, known: () => true, glass: () => 11, tried: () => true, journeyWon: (c) => won.has(c), labMet: () => true });
  const w = ['acidrain', 'solar', 'meteor', 'nuke', 'blackhole'].filter((n) => Unlocks.has('weapon', n));
  const s = Unlocks.scenes.filter((n) => n !== 'machines' && n !== 'volcano' && !Unlocks.has('scene', n));
  check('Chapters won earn their weapons; finds open their scenes; skies come with them', w.length === 5 && !s.length && Unlocks.has('sky', 'night'),
    `weapons ${w.join(', ')}; scenes still shut ${s.join(', ') || 'none'} (Volcano and Waterworks need feats)`);
  setup({ found: () => 95, known: () => true, glass: () => 11, tried: () => true, journeyWon: (c) => c !== 'deepdown', labMet: () => true });
  check('The Nuclear plant needs chapter VIII as well as its Lab elements', !Unlocks.has('scene', 'reactor') && Unlocks.has('scene', 'city'));
}
{ // sandbox opens everything
  setup({ sandbox: () => true });
  const all = Unlocks.weapons.every((n) => Unlocks.has('weapon', n)) && Unlocks.scenes.every((n) => Unlocks.has('scene', n)) && Unlocks.has('journey') && Unlocks.has('part', 'wire');
  check('Sandbox mode opens everything', all);
}
{ // a hydrogen bomb dropped near a black hole is drawn in and swallowed without a blast or a sound;
  // the hole grows half as big again and lasts 5 s longer, and rumbles louder
  const scene = (bomb) => {
    const w = world(320, 200);
    rect(w, 0, 150, 319, 199, ID.STONE);
    w.launch('blackhole', 160, 140, 1);
    const hole = w.disasters.find((d) => d.kind === 'blackhole'), was = { life: hole.life, r: hole.r, rh: hole.rh };
    for (let k = 0; k < 20; k++) { w.step(); w.resetEvents(); }
    if (bomb) w.launch('hbomb', 185, 149, 1); // 25 cells off to the side, inside the hole's reach
    let booms = 0, rumble = 0;
    for (let k = 0; k < 320; k++) { w.step(); booms += w.events.hbomb.length; rumble = Math.max(rumble, w.events.rumble); w.resetEvents(); }
    return { w, hole, was, booms, rumble, bombs: w.disasters.filter((d) => d.kind === 'hbomb').length, stone: w.counts[ID.STONE] };
  };
  const a = scene(true), b = scene(false); // the same hole with no bomb, for comparison
  const grew = Math.abs(a.hole.r - a.was.r * 1.5) < 1 && Math.abs(a.hole.rh - a.was.rh * 1.5) < 0.01 && a.hole.life === a.was.life + 300;
  check('A hydrogen bomb near a black hole is swallowed: no blast, the hole 1.5× as big, 5 s longer, louder',
    a.booms === 0 && a.bombs === 0 && grew && a.rumble > b.rumble && a.stone > b.stone * 0.9,
    `${a.booms} blasts; reach ${a.was.r}→${Math.round(a.hole.r)}, horizon ${a.was.rh.toFixed(1)}→${a.hole.rh.toFixed(1)}, life ${a.was.life}→${a.hole.life}; rumble ${a.rumble.toFixed(2)} (${b.rumble.toFixed(2)} without)`);
}
{ // the bomb spirals into the middle over a second or so, whistling, and only then does the hole grow
  const w = world(320, 200);
  rect(w, 0, 150, 319, 199, ID.STONE);
  w.launch('blackhole', 160, 140, 1);
  const hole = w.disasters.find((d) => d.kind === 'blackhole'), r0 = hole.r;
  for (let k = 0; k < 20; k++) { w.step(); w.resetEvents(); }
  w.launch('hbomb', 185, 149, 1); // inside the hole's reach (36 cells)
  const bomb = w.disasters.find((d) => d.kind === 'hbomb');
  let drift = 0, whistle = 0, grewEarly = false, path = 0, last = null, after = -1;
  for (let k = 0; k < 300; k++) {
    w.step();
    if (bomb.phase === 'drift') {
      drift++; whistle = Math.max(whistle, w.events.whistle);
      if (hole.r !== r0) grewEarly = true;
      if (last) path += Math.hypot(bomb.px - last[0], bomb.py - last[1]);
      last = [bomb.px, bomb.py];
    } else if (bomb.phase === 'gone' && after < 0) after = k;
    w.resetEvents();
  }
  const near = last ? Math.hypot(last[0] - hole.x, last[1] - hole.y) : 999;
  check('Caught, the bomb spirals into the middle, whistling, and only then does the hole grow',
    drift >= 35 && whistle > 0.5 && !grewEarly && near < 4 && path > 40 && hole.r > r0 * 1.45,
    `${drift} ticks spiralling in along ${Math.round(path)} cells, ending ${near.toFixed(1)} from the middle; whistle up to ${whistle.toFixed(2)}; grew early ${grewEarly}; reach ${r0}→${Math.round(hole.r)}`);
}
{ // one dropped outside the hole's reach is not caught: it falls on and goes off as ever
  const w = world(320, 200);
  rect(w, 0, 150, 319, 199, ID.STONE);
  w.launch('blackhole', 160, 140, 1);
  const hole = w.disasters.find((d) => d.kind === 'blackhole');
  w.launch('hbomb', 160 + Math.round(hole.r) + 12, 149, 1);
  let booms = 0, drifted = false;
  for (let k = 0; k < 300; k++) { w.step(); booms += w.events.hbomb.length / 3; if (w.disasters.some((d) => d.phase === 'drift')) drifted = true; w.resetEvents(); }
  check('A bomb dropped outside the black hole’s reach isn’t caught: it lands and goes off', !drifted && booms === 1, `caught ${drifted}; ${booms} blast`);
}
{ // it holds five; the sixth bursts it, and the whole map goes up
  const w = world(320, 200);
  rect(w, 0, 150, 319, 199, ID.STONE);
  rect(w, 0, 196, 319, 199, ID.WALL); // wall survives anything
  w.launch('blackhole', 160, 60, 1);
  const hole = w.disasters.find((d) => d.kind === 'blackhole');
  let booms = 0, fedAt5 = -1;
  for (let k = 0; k < 6; k++) {
    w.launch('hbomb', 160, 149, 1);
    for (let q = 0; q < 150; q++) { w.step(); booms += w.events.hbomb.length / 3; w.resetEvents(); } // x, y, r per blast
    if (k === 4) fedAt5 = hole.fed;
  }
  for (let q = 0; q < 600; q++) { w.step(); w.resetEvents(); }
  const left = w.counts[ID.STONE];
  check('Five bombs in a black hole are held; the sixth bursts it and the whole map goes', fedAt5 === 5 && booms === 1 && left === 0 && w.counts[ID.WALL] > 0,
    `fed ${fedAt5} with no blast; then ${booms} blast; ${left} stone left; wall ${w.counts[ID.WALL]}`);
}

let fail = 0;
for (const r of out) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.label.padEnd(84)} ${r.detail}`);
}
console.log(fail ? `\n${fail} check(s) failed` : '\nall unlock checks pass');
process.exitCode = fail ? 1 : 0;
