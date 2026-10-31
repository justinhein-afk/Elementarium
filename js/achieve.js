/* Elementarium — achievements (no DOM; ui.js shows them in their own window).
 * Milestones on the way, time spent in one scene, wiping the map clean, feeding a black hole, a
 * secret for each element that only the world makes (an acorn, an ember, a piston's rod…), and at
 * the bottom the big ones: every element, every star, every chapter, every weapon. Earned ones are
 * kept in localStorage; feats in a scene count only in your own world (not in a chapter), and none
 * count in sandbox mode. */
(function (G) {
  'use strict';

  const { ELEM } = G;
  const { ID, byKey, CAT } = ELEM;
  const HOUR = 3600e3;
  const SECTIONS = ['Milestones', 'Staying put', 'Destruction', 'Secrets', 'The whole of it'];

  // ───── the achievements, in the order the window lists them ─────
  // test(f): true once earned (f: what ui.js knows); have(f): [have, want] for a progress bar
  const ALL = [];
  const add = (sec, id, title, line, o = {}) => ALL.push({ sec, id, title, line, ...o });
  const atLeast = (fn, n) => ({ test: (f) => fn(f) >= n, have: (f) => [Math.min(fn(f), n), n] });
  const found = (f) => f.found(), stars = (f) => f.stars(), lab = (f) => f.lab();
  const won = (f) => f.chapters().filter((c) => f.won(c)).length;
  const weapons = (f) => G.Unlocks.weapons.filter((n) => G.Unlocks.has('weapon', n)).length;
  const scenes = (f) => G.Unlocks.scenes.filter((n) => G.Unlocks.has('scene', n)).length;

  add('Milestones', 'found10', 'First Steps', 'Find 10 elements', atLeast(found, 10));
  add('Milestones', 'found25', 'Apprentice', 'Find 25 elements', atLeast(found, 25));
  add('Milestones', 'found50', 'Journeyman', 'Find 50 elements', atLeast(found, 50));
  add('Milestones', 'found75', 'Adept', 'Find 75 elements', atLeast(found, 75));
  add('Milestones', 'lab20', 'Lab Coat', 'Unlock 20 elements of the periodic table', atLeast(lab, 20));
  add('Milestones', 'lab59', 'Halfway There', 'Unlock half the periodic table: 59 elements', atLeast(lab, 59));
  add('Milestones', 'star1', 'Eureka!', 'Earn your first Try it star', atLeast(stars, 1));
  add('Milestones', 'star25', 'Experimenter', 'Earn 25 Try it stars', atLeast(stars, 25));
  add('Milestones', 'part1', 'Tinkerer', 'Open your first machine part', { test: () => 'wire switch sensor pipe pump valve tank piston thruster legs'.split(' ').some((p) => G.Unlocks.has('part', p)) });
  add('Milestones', 'scene1', 'Wanderer', 'Find your first new scene', atLeast(scenes, 1));
  add('Milestones', 'weapon1', 'Armed', 'Earn your first weapon', atLeast(weapons, 1));
  add('Milestones', 'chapter1', 'Rain at Last', 'Win the first chapter of the Journey', { test: (f) => f.won(f.chapters()[0]) });

  add('Staying put', 'stay1', 'Settler', 'Stay in one scene for an hour', { stay: 1 });
  add('Staying put', 'stay4', 'Homesteader', 'Stay in one scene for 4 hours', { stay: 4 });
  add('Staying put', 'stay8', 'Rooted', 'Stay in one scene for 8 hours', { stay: 8 });

  const WIPES = [[1, 'wipe1', 'Clean Slate', 'Destroy everything on the map'],
    [5, 'wipe5', 'Again and Again', 'Destroy everything on the map 5 times'],
    [10, 'wipe10', 'World Ender', 'Destroy everything on the map 10 times']];
  for (const [n, id, title, line] of WIPES) add('Destruction', id, title, line, { wipes: n });
  add('Destruction', 'glutton', 'Glutton', 'Feed one black hole 5 hydrogen bombs', { fed: 5 });
  add('Destruction', 'lastsupper', 'Last Supper', 'Feed a black hole one hydrogen bomb more than it can hold');

  // a secret for each element only the world makes: hidden until it first appears in your world
  const SECRETS = [
    ['seed', 'Seed of an Idea', 'A plant dropped a seed'],
    ['acorn', 'Mighty Oaks', 'An oak dropped an acorn'],
    ['pinecone', 'Pine Knot', 'A pine dropped a pinecone'],
    ['coconut', 'Castaway', 'A palm dropped a coconut'],
    ['catkin', 'On the Wind', 'A willow sent its seeds drifting'],
    ['grassseed', 'Lawn Care', 'Grass went to seed'],
    ['cactusseed', 'Desert Bloom', 'A cactus dropped a seed'],
    ['vineseed', 'Climbing Up', 'A vine dropped a seed'],
    ['lilyseed', 'Pond Life', 'A water lily dropped a seed'],
    ['spores', 'Damp Corner', 'A mushroom let go of its spores'],
    ['litter', 'Autumn', 'Leaves died and fell'],
    ['drygrass', 'Tinder Dry', 'Grass dried out in a drought'],
    ['splinters', 'Kindling', 'Wood torn into splinters'],
    ['ember', 'Last Embers', 'A long fire threw off an ember'],
    ['mspark', 'Shower of Sparks', 'Burning metal threw sparks'],
    ['rad', 'Invisible Glow', 'Something gave off radiation'],
    ['casing', 'Plumber', 'Laid your first pipe'],
    ['rod', 'Push Comes to Shove', 'A piston pushed out its rod'],
  ];
  for (const [key, title, line] of SECRETS) add('Secrets', `secret-${key}`, title, line, { secret: true, el: byKey[key].id });

  const secretsGot = () => ALL.filter((a) => a.secret && got.has(a.id)).length;
  add('The whole of it', 'allfound', 'The Full Table', 'Find every element on the table', { test: (f) => found(f) >= f.tableTotal, have: (f) => [found(f), f.tableTotal] });
  add('The whole of it', 'allstars', 'Star Chart', 'Earn every Try it star', { test: (f) => stars(f) >= f.starsTotal, have: (f) => [stars(f), f.starsTotal] });
  add('The whole of it', 'allchapters', 'Moonbound', 'Win every chapter of the Journey', { test: (f) => won(f) >= f.chapters().length, have: (f) => [won(f), f.chapters().length] });
  add('The whole of it', 'allweapons', 'Arsenal', 'Earn every weapon', { test: (f) => weapons(f) >= G.Unlocks.weapons.length, have: (f) => [weapons(f), G.Unlocks.weapons.length] });
  add('The whole of it', 'allscenes', 'Globetrotter', 'Find every scene', { test: (f) => scenes(f) >= G.Unlocks.scenes.length, have: (f) => [scenes(f), G.Unlocks.scenes.length] });
  add('The whole of it', 'allsecrets', 'Nothing Hidden', 'Find every secret', { test: () => secretsGot() >= SECRETS.length, have: () => [secretsGot(), SECRETS.length] });
  add('The whole of it', 'everything', 'Elementarium', 'Earn every other achievement', { test: () => ALL.every((a) => a.id === 'everything' || got.has(a.id)), have: () => [got.size - (got.has('everything') ? 1 : 0), ALL.length - 1] });
  const byId = new Map(ALL.map((a) => [a.id, a]));

  // ───── what is earned ─────
  const got = new Set();
  let store = null, facts = null, wipes = 0;
  // this scene: how long you have been in it, the most matter it has held, the hidden elements seen
  let sceneMs = 0, peak = -1, lastWeapon = -1e9, seen = null;

  function init(s, f) {
    store = s; facts = f;
    const saved = s.get('achieve', null) || {};
    got.clear();
    for (const id of saved.got || []) if (byId.has(id)) got.add(id);
    wipes = saved.wipes || 0;
    newScene();
    check(); // what you have already done counts now
  }
  function save() { if (store) store.set('achieve', { got: [...got], wipes }); }
  function reset() { got.clear(); wipes = 0; newScene(); save(); }
  function newScene() { sceneMs = 0; peak = -1; seen = null; lastWeapon = -1e9; }
  function rebase() { seen = null; lastWeapon = -1e9; } // the world was put back (undo): count on from what is there now

  const off = () => !facts || facts.sandbox();
  function earn(id, out) { if (!got.has(id)) { got.add(id); out.push(id); } }

  // Everything that follows from what you have (found, starred, won, earned). Returns what is new.
  function check() {
    const out = [];
    if (off()) return out;
    // twice: "every secret" and "everything" can follow from one just earned
    for (let k = 0; k < 2; k++) for (const a of ALL) if (a.test && !got.has(a.id) && a.test(facts)) earn(a.id, out);
    if (out.length) save();
    return out;
  }

  // the matter on the map: everything but air, gases, fire and what nothing can break
  const MATTER = ELEM.list.filter((d) => d && (d.cat === CAT.STATIC || d.cat === CAT.POWDER || d.cat === CAT.LIQUID || d.cat === CAT.LIFE)
    && !['wall', 'clone', 'void'].includes(d.key) && !d.virtual).map((d) => d.id);
  const matter = (w) => { let n = 0; for (const t of MATTER) n += w.counts[t]; return n; };
  const WIPE_LEFT = 0.05, WIPE_FULL = 0.08, WIPE_WINDOW = 1800; // under 5% of what was there, a map at least 8% full, within 30 s of a weapon

  // Each frame in your own world (not a chapter): the time in this scene, a map wiped clean, a black
  // hole fed, and the secret elements. dt: milliseconds since the last frame.
  function frame(w, ev, dt) {
    const out = [];
    if (off()) return out;
    sceneMs += dt;
    for (const a of ALL) if (a.stay && sceneMs >= a.stay * HOUR) earn(a.id, out);
    if (ev.holeFed >= 5) earn('glutton', out);
    if (ev.holeBurst) earn('lastsupper', out);
    if (w.disasters.length) lastWeapon = w.tick;
    if (w.tick % 30 === 0) {
      const m = matter(w);
      peak = Math.max(peak, m);
      if (w.tick >= lastWeapon && w.tick - lastWeapon < WIPE_WINDOW && peak >= WIPE_FULL * w.W * w.H && m <= WIPE_LEFT * peak) {
        wipes++;
        peak = m; // the map has to fill up again before the next one counts
        for (const [n, id] of WIPES) if (wipes >= n) earn(id, out);
        save();
      }
    }
    // a secret element, the first time there is more of it than a moment ago (not what a scene set out)
    if (w.tick % 10 === 0) {
      const c = w.counts;
      if (seen) for (const a of ALL) if (a.secret && !got.has(a.id) && c[a.el] > seen[a.id]) earn(a.id, out);
      seen = seen || {};
      for (const a of ALL) if (a.secret) seen[a.id] = c[a.el];
    }
    if (out.length) { save(); out.push(...check()); }
    return out;
  }

  // every achievement, for the window: secrets you haven't found show only that they are there
  function list() {
    return ALL.map((a) => {
      const has = got.has(a.id), hide = a.secret && !has;
      let have = null;
      if (!has && a.have && facts) have = a.have(facts);
      else if (!has && a.stay) have = [Math.min(sceneMs, a.stay * HOUR) / HOUR, a.stay, `${Math.floor(sceneMs / 60e3)} min of ${a.stay * 60} in this scene`];
      else if (!has && a.wipes) have = [Math.min(wipes, a.wipes), a.wipes];
      return { id: a.id, sec: a.sec, got: has, secret: !!a.secret, title: hide ? '???' : a.title, line: hide ? 'A secret: something in your world makes it.' : `${a.line}.`, have };
    });
  }

  G.Achieve = {
    init, reset, check, frame, newScene, rebase, list, SECTIONS,
    get: (id) => byId.get(id),
    count: () => got.size, total: ALL.length,
    has: (id) => got.has(id),
  };
})(globalThis);
