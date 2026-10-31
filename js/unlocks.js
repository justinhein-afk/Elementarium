/* Elementarium — what is earned (no DOM; ui.js and main.js show it).
 * The Journey opens once 30 elements are found and the Weapons tab at 50. Then every weapon, every
 * scene but the plain Island, each machine part and the dusk and night skies are earned, each by
 * its own quest: things found, a chapter of the Journey won, or a feat done in your own world (not
 * in a chapter): flooding it, heating lava past 3,000°C, a battery touching metal… What you had
 * already done counts at once; the feats are counted from the day they were added. Locked things
 * stay out of sight until they open. Sandbox mode opens everything. */
(function (G) {
  'use strict';

  const { ELEM } = G;
  const { ID, byKey } = ELEM;
  const JOURNEY_AT = 30, WEAPONS_AT = 50;
  const FLOOD_ROW = 0.15; // the tsunami's line: water standing this far below the top of the map
  const id = (key) => byKey[key].id;

  // ───── the quests ─────
  const chapter = (cid, num, title) => ({ journey: cid, line: `Win chapter ${num} of the Journey, ${title}` });
  const WEAPONS = {
    tsunami: { line: 'Flood your world until the water stands above the dashed line', feat: 'flood' },
    volcano: { line: 'Open the Volcano scene', scene: 'volcano' },
    storm: { line: 'Brew a storm cloud big enough to throw its own lightning', feat: 'bolt' },
    quake: { line: 'Smash 5,000 cells with the Smash tool', count: ['smashed', 5000] },
    freeze: { line: 'Have 3,000 cells of ice in your world at once', feat: 'ice' },
    tornado: { line: 'Set off 10 big explosions that throw the wind about', count: ['blasts', 10] },
    hbomb: { line: 'Set off 5 Nukes right beside hydrogen', count: ['hnukes', 5] },
    acidrain: chapter('spring', 'V', 'The Bitter Spring'),
    solar: chapter('pumphouse', 'VI', 'The Pumphouse'),
    meteor: chapter('skywatch', 'VII', 'Falling Stars'),
    nuke: chapter('deepdown', 'VIII', 'The Sleeping Heart'),
    blackhole: chapter('launch', 'X', 'The Launch'),
  };
  const SCENES = {
    canyon: { finds: ['clay', 'brick', 'bird', 'pine'] },
    volcano: { finds: ['obsidian'], feat: 'lava', line: 'Find obsidian, and heat lava past 3,000°C' },
    forest: { finds: ['sapling', 'pine', 'willow', 'firefly'] },
    caves: { finds: ['limestone', 'coal', 'diamond'] },
    workshop: { count: 25 },
    village: { finds: ['cow', 'human'], glass: 3 },
    machines: { parts: ['wire', 'switch', 'sensor', 'pipe', 'pump', 'valve', 'tank', 'piston'] },
    electrics: { tried: 'W', line: 'Earn tungsten’s Try it star: a light bulb' },
    magnets: { lab: true },
    reactor: { lab: true, journey: 'deepdown', jline: 'win chapter VIII of the Journey' },
    city: { lab: true, glass: 5 },
    empty: { count: 20 },
  };
  // a machine part opens the first time a battery touches its partner in your world
  const PARTS = { wire: 'metal', switch: 'wood', sensor: 'fire', pipe: 'water', pump: 'oil', valve: 'steam', tank: 'glass', piston: 'stone', thruster: 'methane', legs: 'rubble' };
  const SKIES = { dusk: ['volcano', 'reactor'], night: ['empty', 'city', 'workshop', 'electrics', 'magnets'] };

  // ───── what is open ─────
  const got = { weapon: new Set(), scene: new Set(), part: new Set(), sky: new Set(), journey: false, weapons: false };
  const feats = { smashed: 0, blasts: 0, hnukes: 0, flood: false, lava: false, bolt: false, ice: false };
  let store = null, facts = null, lastBlast = -1e9;

  function init(s, f) {
    store = s; facts = f;
    const saved = s.get('unlocks', null) || {};
    const g = saved.got || {};
    for (const k of ['weapon', 'scene', 'part', 'sky']) { got[k].clear(); for (const n of g[k] || []) got[k].add(n); }
    got.journey = !!g.journey; got.weapons = !!g.weapons;
    Object.assign(feats, { smashed: 0, blasts: 0, hnukes: 0, flood: false, lava: false, bolt: false, ice: false }, saved.feats || {});
    check(); // what you had already done opens now, without a fanfare
  }
  function save() {
    if (!store) return;
    store.set('unlocks', {
      got: { weapon: [...got.weapon], scene: [...got.scene], part: [...got.part], sky: [...got.sky], journey: got.journey, weapons: got.weapons },
      feats,
    });
  }
  function reset() {
    for (const k of ['weapon', 'scene', 'part', 'sky']) got[k].clear();
    got.journey = false; got.weapons = false;
    Object.assign(feats, { smashed: 0, blasts: 0, hnukes: 0, flood: false, lava: false, bolt: false, ice: false });
    save();
  }

  const open = (kind, name) => (facts && facts.sandbox()) || (kind === 'journey' ? got.journey : kind === 'weapons' ? got.weapons : got[kind].has(name));

  // the progress toward a quest, as [have, want] (null if it is all or nothing)
  function progress(kind, name, w) {
    const q = kind === 'weapon' ? WEAPONS[name] : kind === 'scene' ? SCENES[name] : null;
    if (kind === 'journey') return [facts.found(), JOURNEY_AT];
    if (kind === 'weapons') return [facts.found(), WEAPONS_AT];
    if (!q) return null;
    if (kind === 'weapon' && q.count) return [Math.min(feats[q.count[0]], q.count[1]), q.count[1]];
    if (q.feat === 'flood' && w) return [Math.min(floodShare(w), 0.4), 0.4];
    if (q.feat === 'ice' && w) return [Math.min(w.counts[ID.ICE], 3000), 3000];
    if (kind === 'scene') {
      const parts = [];
      if (q.finds) for (const k of q.finds) parts.push(facts.known(id(k)));
      if (q.parts) for (const k of q.parts) parts.push(got.part.has(k));
      if (q.count) parts.push(facts.found() >= q.count);
      if (q.feat) parts.push(feats[q.feat]);
      if (q.glass) parts.push(facts.glass() >= q.glass);
      if (q.tried) parts.push(facts.tried(q.tried));
      if (q.journey) parts.push(facts.journeyWon(q.journey));
      if (q.lab) parts.push(facts.labMet(name));
      if (q.count && parts.length === 1) return [Math.min(facts.found(), q.count), q.count];
      return [parts.filter(Boolean).length, parts.length];
    }
    return null;
  }
  // how to open it, in one line
  function line(kind, name) {
    if (kind === 'journey') return `Find ${JOURNEY_AT} elements`;
    if (kind === 'weapons') return `Find ${WEAPONS_AT} elements`;
    if (kind === 'part') return `A battery touching ${byKey[PARTS[name]].name.toLowerCase()}`;
    if (kind === 'weapon') return WEAPONS[name].line;
    const q = SCENES[name], bits = [];
    if (q.line) bits.push(q.line);
    else if (q.finds) bits.push(`Find ${listOf(q.finds.map((k) => byKey[k].name.toLowerCase()))}`);
    if (q.parts) bits.push('Open every machine part but thruster and landing legs');
    if (q.count) bits.push(`Find ${q.count} elements`);
    if (q.glass) bits.push(`make ${q.glass} colours of stained glass`);
    if (q.lab) bits.push('unlock its elements in the Lab');
    if (q.jline) bits.push(q.jline);
    const s = bits.join(', ');
    return s[0].toUpperCase() + s.slice(1);
  }
  const listOf = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
  // the recipe for a part: what touches the battery
  const partner = (name) => PARTS[name];

  function met(kind, name) {
    if (kind === 'journey') return facts.found() >= JOURNEY_AT;
    if (kind === 'weapons') return facts.found() >= WEAPONS_AT;
    if (kind === 'sky') return SKIES[name].some((sc) => got.scene.has(sc));
    if (kind === 'weapon') {
      const q = WEAPONS[name];
      if (q.journey) return facts.journeyWon(q.journey);
      if (q.scene) return got.scene.has(q.scene);
      if (q.count) return feats[q.count[0]] >= q.count[1];
      return !!feats[q.feat];
    }
    if (kind === 'scene') { const p = progress('scene', name); return p[0] >= p[1]; }
    return false;
  }

  // Everything that opens on what you have (found, won, unlocked, made). Returns what newly opened,
  // as [kind, name]; the first time (at load) it opens them without a word.
  function check() {
    if (!facts) return [];
    const fresh = [];
    const take = (kind, name) => { fresh.push([kind, name]); };
    if (!got.journey && met('journey')) { got.journey = true; take('journey'); }
    if (!got.weapons && met('weapons')) { got.weapons = true; take('weapons'); }
    for (const n of Object.keys(SCENES)) if (!got.scene.has(n) && met('scene', n)) { got.scene.add(n); take('scene', n); }
    for (const n of Object.keys(SKIES)) if (!got.sky.has(n) && met('sky', n)) { got.sky.add(n); take('sky', n); }
    for (const n of Object.keys(WEAPONS)) if (!got.weapon.has(n) && met('weapon', n)) { got.weapon.add(n); take('weapon', n); }
    if (fresh.length) save();
    return fresh;
  }

  // ───── feats in your own world (call each frame, outside the Journey) ─────
  // the share of the map's width that has water on the tsunami's line
  function floodShare(w) {
    const y = Math.round(w.H * FLOOD_ROW);
    let n = 0;
    for (let x = 0, i = w.idx(0, y); x < w.W; x++, i++) { const t = w.type[i]; if (t === ID.WATER || t === ID.SALTWATER) n++; }
    return n / w.W;
  }
  function frame(w, ev) {
    if (!facts || facts.sandbox()) return [];
    let changed = false;
    if (ev.naturalBolt && !feats.bolt) { feats.bolt = true; changed = true; }
    // a big blast throws the air about: each one, a moment after the last, counts
    for (let k = 0; k < ev.booms.length; k += 4) {
      if (ev.booms[k + 2] >= 4 && w.tick - lastBlast >= 30 && feats.blasts < 10) { feats.blasts++; lastBlast = w.tick; changed = true; }
    }
    if (w.tick % 30 === 0) {
      if (!feats.flood && floodShare(w) >= 0.4) { feats.flood = true; changed = true; }
      if (!feats.ice && w.counts[ID.ICE] >= 3000) { feats.ice = true; changed = true; }
    }
    // often, as these don't last: lava held white-hot, and (every frame) a battery touching a
    // machine part's partner (water runs off, fire dies down, a gas drifts away)
    if (w.tick % 5 === 0 && !feats.lava && w.counts[ID.LAVA]) {
      for (let i = 0; i < w.N; i++) if (w.type[i] === ID.LAVA && w.temp[i] >= 3000) { feats.lava = true; changed = true; break; }
    }
    {
      if (w.counts[ID.BATTERY] && got.part.size < Object.keys(PARTS).length) {
        const want = new Map();
        for (const [p, k] of Object.entries(PARTS)) if (!got.part.has(p)) want.set(id(k), p);
        for (let i = 0; i < w.N && want.size; i++) {
          if (w.type[i] !== ID.BATTERY) continue;
          for (const d of [1, -1, w.SW, -w.SW]) {
            const p = want.get(w.type[i + d]);
            if (p) { got.part.add(p); want.delete(w.type[i + d]); partsNew.push(p); changed = true; }
          }
        }
      }
    }
    if (changed) save();
    const fresh = partsNew.splice(0).map((p) => ['part', p]);
    return fresh.concat(changed ? check() : []);
  }
  const partsNew = [];
  // the Smash tool broke n cells
  function smashed(n) {
    if (!n || feats.smashed >= 5000 || (facts && facts.sandbox())) return [];
    feats.smashed = Math.min(5000, feats.smashed + n);
    save();
    return feats.smashed >= 5000 ? check() : [];
  }
  // a Nuke went off at (x, y) with reach r: beside hydrogen, it counts toward the H-bomb
  function nuked(w, x, y, r) {
    if (feats.hnukes >= 5 || (facts && facts.sandbox())) return [];
    let h = 0;
    const R = Math.ceil(r);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w.W || yy >= w.H) continue;
      if (w.type[w.idx(xx, yy)] === ID.EL_H) h++;
    }
    if (h < 60) return [];
    feats.hnukes++;
    save();
    return check();
  }

  // the first locked one of a kind after `after` (for Hint), or null
  function nextLocked(kind, after) {
    const names = kind === 'weapon' ? Object.keys(WEAPONS) : Object.keys(SCENES);
    const locked = names.filter((n) => !open(kind, n));
    if (!locked.length) return null;
    const k = locked.indexOf(after);
    return locked[(k + 1) % locked.length];
  }

  G.Unlocks = {
    init, reset, check, frame, smashed, nuked, line, progress, partner, nextLocked,
    has: open, FLOOD_ROW, JOURNEY_AT, WEAPONS_AT,
    isPart: (key) => !!PARTS[key],
    scenes: Object.keys(SCENES), weapons: Object.keys(WEAPONS),
    feats: () => ({ ...feats }),
  };
})(globalThis);
