// Headless checks for the progress backup (backup.js): a backup holds everything the game keeps
// and nothing that belongs to the device alone, a real saved world survives the round trip and
// loads, files that aren't backups (or come from a newer game) are refused with nothing changed,
// a restore swaps the whole store and puts it back if the browser runs out of room, and the
// browser is asked to keep the storage only when there is progress to lose, at most once a week.
// Run: node tools/backuptest.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
for (const f of ['elements.js', 'periodic.js', 'materials.js', 'sim.js', 'scenes.js', 'backup.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
}
const { ELEM, Sim, Scenes, Backup } = globalThis;

const out = [];
const check = (label, ok, detail = '') => out.push({ label, ok, detail });

// the game's store over a Map, like localStorage: values kept as JSON text, an optional size limit
function makeStore(room = Infinity) {
  const mem = new Map();
  const used = () => [...mem].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    mem,
    get: (k, d) => (mem.has(k) ? JSON.parse(mem.get(k)) : d),
    set(k, v) {
      const text = JSON.stringify(v), was = mem.get(k);
      mem.set(k, text);
      if (used() > room) { if (was === undefined) mem.delete(k); else mem.set(k, was); return false; }
      return true;
    },
    del: (k) => { mem.delete(k); },
    keys: () => [...mem.keys()],
  };
}
const snapshot = (s) => JSON.stringify([...s.mem].sort());

// a player some way in: discoveries, a won chapter, achievements, settings and a real saved world
const world = Sim.createWorld(320, 200);
Scenes.island(world);
for (let k = 0; k < 120; k++) world.step();
const saved = world.serialize();
function player() {
  const s = makeStore();
  s.set('found', ['mud', 'steam', 'glass', 'brick', 'plant']);
  s.set('journey', { prologue: true, stars: { drought: 3, kiln: 1 } });
  s.set('achieve', { got: ['first', 'ten'], wipes: 0 });
  s.set('sound', false);
  s.set('save1', saved);
  s.set('saves', [{ name: 'My island', desc: '', at: 1, W: 320, H: 200, pic: '' }]);
  s.set('keepAsked', 5);
  return s;
}

{ // a backup holds everything but what belongs to this device
  const s = player();
  const b = Backup.make(s, Date.UTC(2026, 10, 2, 9, 30));
  const keys = Object.keys(b.data).sort().join(',');
  check('A backup holds every stored key except the device\'s own', keys === 'achieve,found,journey,save1,saves,sound',
    keys);
  check('A backup says what it is, its format and when it was made', b.kind === 'elementarium-backup' && b.format === Backup.FORMAT && b.at === Date.UTC(2026, 10, 2, 9, 30));
  check('Its file is named for the day it was made', /^elementarium-backup-2026-11-0[12]\.json$/.test(Backup.fileName(b.at)), Backup.fileName(b.at));
}

{ // a full round trip: download, a fresh browser, restore, and the saved world loads as it was
  const text = JSON.stringify(Backup.make(player()));
  const r = Backup.read(text);
  const fresh = makeStore();
  fresh.set('welcomed', true);
  fresh.set('keepAsked', 99);
  const ok = r.ok && Backup.restore(fresh, r.backup);
  check('A backup file reads back and restores into a fresh browser', ok, r.ok ? '' : r.why);
  check('Everything comes back, what was there before is gone, and the device\'s own key stays',
    fresh.get('found', []).length === 5 && fresh.get('journey').stars.drought === 3 && fresh.get('sound') === false
    && fresh.get('welcomed', null) === null && fresh.get('keepAsked') === 99);
  const w2 = Sim.createWorld(320, 200);
  w2.load(fresh.get('save1'));
  let same = 0;
  for (let i = 0; i < world.N; i++) if (w2.type[i] === world.type[i]) same++;
  check('A saved world restored from a backup loads cell for cell', same === world.N, `${same} of ${world.N} cells`);
}

{ // what isn't a backup is refused, and says why
  const refuse = (text) => { const r = Backup.read(text); return r.ok ? '' : r.why; };
  const good = Backup.make(player());
  check('Not JSON is refused', /isn’t an Elementarium backup/.test(refuse('hello')));
  check('Some other JSON is refused', /isn’t an Elementarium backup/.test(refuse('{"a":1}')));
  check('A file that couldn\'t be read is refused', /couldn’t be read/.test(refuse(null)));
  check('A file far too big is refused', /too big/.test(refuse(' '.repeat(Backup.BIGGEST + 1))));
  check('A backup from a newer version of the game is refused', /newer version/.test(refuse(JSON.stringify({ ...good, format: Backup.FORMAT + 1 }))));
  check('An empty backup is refused', /empty/.test(refuse(JSON.stringify({ ...good, data: {} }))));
  const odd = Backup.read(JSON.stringify({ ...good, data: { ...good.data, 'bad key!': 1, keepAsked: 1, __proto__x: 2 } }));
  check('Keys the game never writes, and the device\'s own, are left out', odd.ok && !('bad key!' in odd.backup.data) && !('keepAsked' in odd.backup.data),
    odd.ok ? Object.keys(odd.backup.data).join(',') : odd.why);
}

{ // no room: nothing changes
  const big = Backup.make(player());
  const small = makeStore(JSON.stringify(big.data).length / 3);
  small.set('found', ['mud']);
  small.set('sound', true);
  const before = snapshot(small);
  const ok = Backup.restore(small, Backup.read(JSON.stringify(big)).backup);
  check('A backup too big for the browser leaves its progress exactly as it was', !ok && snapshot(small) === before);
}

{ // the side by side count
  const n = Backup.summary(Backup.make(player()).data, { found: (keys) => keys.length + 10, chapters: ['drought', 'kiln', 'river'] });
  check('The summary counts discoveries, won chapters, achievements and saved worlds',
    n.found === 15 && n.chapters === 2 && n.achievements === 2 && n.worlds === 1, JSON.stringify(n));
  const none = Backup.summary({});
  check('An empty store counts as nothing at all', none.found === 0 && none.chapters === 0 && none.achievements === 0 && none.worlds === 0);
}

(async () => {
  // asking the browser to keep the storage
  let asked = 0, grant = false;
  // Node has a navigator of its own (with no storage): stand a browser's in for it
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { storage: { persisted: async () => false, persist: async () => { asked++; return grant; } } } });
  const NOW = Date.UTC(2026, 10, 2);
  const newbie = makeStore();
  check('The browser is said to keep nothing before it has been asked', (await Backup.check()) === 'may-clear');
  check('A new player with nothing to lose isn\'t asked about', Backup.keep(newbie, NOW) === null && asked === 0);
  const s = player();
  s.del('keepAsked');
  const first = Backup.keep(s, NOW);
  await first;
  check('A player with progress is asked about once', first !== null && asked === 1 && s.get('keepAsked') === NOW);
  check('…and not again the same week', Backup.keep(s, NOW + 6 * 864e5) === null && asked === 1);
  grant = true;
  const again = await Backup.keep(s, NOW + 8 * 864e5);
  check('…but again a week later, and a yes is remembered', again === true && asked === 2 && Backup.state() === 'kept');
  check('Once kept, the browser isn\'t asked again', Backup.keep(s, NOW + 30 * 864e5) === null && asked === 2);

  let fail = 0;
  for (const r of out) {
    if (!r.ok) fail++;
    console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.label.padEnd(84)} ${r.detail}`);
  }
  console.log(fail ? `\n${fail} check(s) failed` : '\nall backup checks pass');
  process.exitCode = fail ? 1 : 0;
})();
