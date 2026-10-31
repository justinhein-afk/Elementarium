// Headless checks for the achievements (achieve.js): milestones from what you have, an hour (and
// four, and eight) in one scene, a map wiped clean, a black hole fed five hydrogen bombs and burst
// by a sixth, the secret elements (made, not set out by a scene), the big ones at the bottom, and
// nothing at all in sandbox mode.
// Run: node tools/achievetest.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
for (const f of ['elements.js', 'periodic.js', 'materials.js', 'sim.js', 'facts.js', 'lab.js', 'tryit.js', 'tints.js', 'scenes.js', 'unlocks.js', 'achieve.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
}
const { ELEM, Sim, Unlocks, Achieve } = globalThis;
const { ID } = ELEM;

const out = [];
const check = (label, ok, detail = '') => out.push({ label, ok, detail });
const rect = (w, x0, y0, x1, y1, t) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) w.place(w.idx(x, y), t); };
const HOUR = 3600e3;

// fresh achievements (and unlocks) with made-up progress
function setup(over = {}) {
  const mem = new Map();
  const store = { get: (k, d) => (mem.has(k) ? JSON.parse(mem.get(k)) : d), set: (k, v) => mem.set(k, JSON.stringify(v)) };
  const f = Object.assign({
    sandbox: () => false, found: () => 5, tableTotal: 95, lab: () => 2, stars: () => 0, starsTotal: 118,
    chapters: () => ['drought', 'kiln'], won: () => false,
  }, over);
  Unlocks.init(store, { sandbox: f.sandbox, found: f.found, known: () => false, glass: () => 0, tried: () => false, journeyWon: () => false, labMet: () => false });
  Achieve.init(store, f);
  return { store, f };
}
const world = (W = 320, H = 200) => { const w = Sim.createWorld(W, H); w.disc.fill(1); return w; };
// run a world for n ticks, each a 1/60 s frame handed to the achievements as main.js does
function run(w, n, dt = 1000 / 60, each) {
  const got = [];
  for (let k = 0; k < n; k++) {
    if (each) each(w, k);
    w.step();
    got.push(...Achieve.frame(w, w.events, dt));
    w.resetEvents();
  }
  return got;
}

{ // milestones follow from what you have, and what was done before counts at once
  let found = 5, stars = 0;
  setup({ found: () => found, stars: () => stars });
  const none = Achieve.has('found10');
  found = 26; stars = 1;
  const got = Achieve.check();
  check('Finds and stars earn their milestones', !none && got.includes('found10') && got.includes('found25') && got.includes('star1') && !got.includes('found50'), got.join(', '));
  setup({ found: () => 60 });
  check('What was already done counts the moment the game loads', Achieve.has('found50') && !Achieve.has('found75'));
}
{ // an hour, four, eight in one scene; a new scene starts the clock again
  setup();
  const w = world(64, 40);
  const a = run(w, 1, 0.99 * HOUR);
  const b = run(w, 1, 0.02 * HOUR);
  Achieve.newScene();
  const c = run(w, 1, 3.5 * HOUR);
  const d = run(w, 1, 0.6 * HOUR);
  const e = run(w, 1, 4 * HOUR);
  check('An hour in one scene, then four, then eight', !a.length && b.includes('stay1') && !c.includes('stay4') && d.includes('stay4') && e.includes('stay8'),
    `59 min ${a.join(',') || '–'}; 1 h ${b.join(',')}; after a new scene, 3.5 h ${c.join(',') || '–'}, 4.1 h ${d.join(',')}, 8.1 h ${e.join(',')}`);
}
{ // a black hole fed five hydrogen bombs, then burst by a sixth: the whole map goes, wiped clean
  setup();
  const w = world(320, 200);
  rect(w, 0, 110, 319, 199, ID.STONE);
  rect(w, 0, 196, 319, 199, ID.WALL);
  const got = run(w, 30);
  w.launch('blackhole', 160, 50, 1);
  const hole = w.disasters.find((d) => d.kind === 'blackhole');
  let fedAt5 = -1;
  for (let k = 0; k < 6; k++) {
    w.launch('hbomb', 160, 109, 1);
    got.push(...run(w, 150));
    if (k === 4) fedAt5 = hole.fed;
    if (k === 4) check('Five hydrogen bombs in one black hole earn Glutton', got.includes('glutton') && !got.includes('lastsupper'), `fed ${fedAt5}; ${got.join(', ')}`);
  }
  got.push(...run(w, 900));
  check('The sixth bursts it: Last Supper, and the map wiped clean', got.includes('lastsupper') && got.includes('wipe1') && !got.includes('wipe5'), got.join(', '));
}
{ // erasing the map without a weapon isn't destroying it
  setup();
  const w = world(200, 120);
  rect(w, 0, 60, 199, 119, ID.STONE);
  run(w, 60);
  rect(w, 0, 0, 199, 119, ID.EMPTY);
  const got = run(w, 60);
  check('Clearing the map by hand doesn’t count as destroying everything', !got.includes('wipe1'), got.join(', ') || 'nothing');
}
{ // a secret: the first time the world makes one; what a scene sets out doesn't count
  setup();
  const w = world(120, 80);
  rect(w, 10, 70, 30, 79, ID.STONE);
  rect(w, 40, 76, 60, 79, ID.CASING); // pipe wall a scene set out
  Achieve.newScene();
  const set = run(w, 20);
  w.place(w.idx(80, 70), ID.EMBER);
  const ember = run(w, 12);
  const list = Achieve.list().find((a) => a.id === 'secret-acorn');
  check('A secret element made in your world earns its secret; one set out by a scene doesn’t', !set.includes('secret-casing') && ember.includes('secret-ember'), `set out ${set.join(',') || '–'}; made ${ember.join(',')}`);
  check('Secrets not yet found show only that they are there', list.title === '???' && !list.got);
}
{ // the big ones at the bottom
  setup({ found: () => 95, stars: () => 118, won: () => true });
  const l = Achieve.list(), last = l.slice(-7).map((a) => a.id);
  check('Every element, every star and every chapter earn the big ones, listed last', Achieve.has('allfound') && Achieve.has('allstars') && Achieve.has('allchapters') && last[0] === 'allfound' && last[6] === 'everything',
    last.join(', '));
}
{ // sandbox mode earns nothing
  setup({ sandbox: () => true, found: () => 95 });
  const w = world(64, 40);
  const got = run(w, 1, 9 * HOUR);
  check('Sandbox mode earns no achievements', Achieve.count() === 0 && !got.length);
}

let fail = 0;
for (const r of out) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.label.padEnd(84)} ${r.detail}`);
}
console.log(fail ? `\n${fail} check(s) failed` : '\nall achievement checks pass');
process.exitCode = fail ? 1 : 0;
