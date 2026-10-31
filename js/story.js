/* Elementarium — the Apprentice's Journey: story chapters as data.
 * Ten chapters follow your master's trail from a dry village to a launch pad, each one leaning on
 * a different part of the lab and each a little harder than the last. A chapter builds its own
 * world, sets the weather and any bent laws, fills the apprentice's pouch, scripts a few events and
 * judges its goals from the simulation itself. No DOM here, so tools/storytest.js can play the
 * chapters headless. */
(function (G) {
  'use strict';

  const { ID, byKey } = G.ELEM;
  const K = G.SceneKit;
  const { noise1, fillCol, blob, rect, paintBox, tone, mixRGB, rgb, pick } = K;

  const SEC = 60; // simulation ticks per second of game time
  const EVAL_EVERY = 10;

  // ───── helpers ─────
  function countIn(w, z, types) {
    let n = 0;
    for (let y = Math.max(0, z.y0); y <= Math.min(w.H - 1, z.y1); y++) {
      for (let x = Math.max(0, z.x0); x <= Math.min(w.W - 1, z.x1); x++) {
        if (types.includes(w.type[w.idx(x, y)])) n++;
      }
    }
    return n;
  }

  // Wooden walls two planks thick with a doorway in each, under a brick roof. Returns the timber.
  function hut(w, hx, wd, g) {
    const timber = [], top = g - 9;
    for (let y = top; y < g - 3; y++) {
      for (const x of [hx, hx + 1, hx + wd - 1, hx + wd]) { const i = w.idx(x, y); w.place(i, ID.WOOD); timber.push(i); }
    }
    for (let x = hx - 2; x <= hx + wd + 2; x++) { w.place(w.idx(x, top - 1), ID.BRICK); w.place(w.idx(x, top - 2), ID.BRICK); }
    return timber;
  }

  function villagers(w, x0, x1, n, standY) {
    let placed = 0;
    for (let tries = 0; placed < n && tries < n * 40; tries++) {
      const x = x0 + ((Math.random() * (x1 - x0)) | 0);
      const y = standY(x);
      const b = w.idx(x, y), h = w.idx(x, y - 1);
      if (w.type[b] === ID.EMPTY && w.type[h] === ID.EMPTY) { w.place(b, ID.HUMAN); w.place(h, ID.HEAD); placed++; }
    }
    return placed;
  }

  // A low stone wall: people step up one cell at most, so two cells keep them on their side.
  function curb(w, x, g, h = 2) { for (let y = g - h; y < g; y++) w.place(w.idx(x, y), ID.STONE); }
  // A stile: stone held a cell off the ground, so water runs under it and people can't get past.
  function stile(w, x, g) { for (let y = g - 4; y < g - 1; y++) w.place(w.idx(x, y), ID.STONE); }

  // Falling stones (Skywatch): a burning rock that comes in at a slant from high over the east,
  // trailing fire, and bursts against the first solid thing in its way: a small crater, and the
  // stone itself left glowing in it. (The Meteor weapon is far bigger, and throws fragments.)
  function throwStone(w, s, x, y) {
    const sx = x + (y + 8) * 0.55, sy = -6, dx = x - sx, dy = y - sy, len = Math.hypot(dx, dy);
    s.stones.push({ x: sx, y: sy, vx: (dx / len) * 3.2, vy: (dy / len) * 3.2 });
  }
  function flyStones(w, s) {
    const AIRY = (t) => t === ID.EMPTY || t === ID.FIRE || t === ID.SMOKE || t === ID.STEAM;
    s.stones = s.stones.filter((st) => {
      for (let k = 0; k < 4; k++) {
        st.x += st.vx / 4; st.y += st.vy / 4;
        const x = Math.round(st.x), y = Math.round(st.y);
        if (x < 0 || x >= w.W || y >= w.H) return false;
        if (y < 0) continue;
        const i = w.idx(x, y);
        if (!AIRY(w.type[i])) {
          w.explode(x, y, 4, 1.25, 0);
          for (const j of [i, i - w.SW]) if (w.type[j] === ID.EMPTY) { w.place(j, ID.MMETAL); w.temp[j] = 1500; }
          return false;
        }
        if (w.type[i] === ID.EMPTY) { w.place(i, ID.FIRE); w.data[i] = 8 + ((Math.random() * 10) | 0); w.temp[i] = 1600; }
      }
      return true;
    });
  }

  // ───── guides ─────
  // A chapter's Hint is a visual guide in three steps, one per thing to do, in the order you do them:
  // `use` is what to pick up from the pouch (an element's key, or 'tool:heat' and so on), `makes`
  // what comes of it, `at(w, s)` the box on the map to light up, and `done(w, s)` whether it has
  // been done. The guide always shows the first step not yet done, and a done step stays done.
  const pad = (z, d) => ({ x0: z.x0 - d, x1: z.x1 + d, y0: z.y0 - d, y1: z.y1 + d });
  const goalMet = (s, id) => s.goals.some((g) => g.id === id && g.met);
  // the mean temperature of the cells of type t in a box (every other cell, for speed)
  function meanTemp(w, z, t) {
    let sum = 0, n = 0;
    for (let y = z.y0; y <= z.y1; y += 2) for (let x = z.x0; x <= z.x1; x += 2) { const i = w.idx(x, y); if (w.type[i] === t) { sum += w.temp[i]; n++; } }
    return n ? sum / n : 0;
  }
  // where the test sledge is (chapter IX): the box round its engines
  function sledgeBox(w) {
    let x0 = w.W, x1 = -1, y0 = w.H, y1 = -1;
    for (let y = 0; y < w.H; y++) for (let x = 0, i = w.idx(0, y); x < 280; x++, i++) {
      if (w.type[i] !== ID.THRUSTER) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return x1 < 0 ? null : { x0, x1, y0: y0 - 5, y1: y1 + 2 };
  }
  // The step the player is on: { k, n, step }, or k = -1 once all are done.
  function step(ch, w, s) {
    const g = ch.guide;
    if (!g) return null;
    s.stepsDone = s.stepsDone || [];
    for (let k = 0; k < g.length; k++) if (!s.stepsDone[k] && g[k].done(w, s)) s.stepsDone[k] = true;
    const k = g.findIndex((_, q) => !s.stepsDone[q]);
    return k < 0 ? { k: -1, n: g.length } : { k, n: g.length, step: g[k] };
  }

  // ───── the launch (chapter X) ─────
  // What a ship is built of (as sim.js counts it): machine parts, metal, glass and cast metal.
  const SHIPPY = new Set([ID.WIRE, ID.SWITCH, ID.SENSOR, ID.PIPE, ID.VALVE, ID.PUMP, ID.TANK, ID.PISTON, ID.ROD,
    ID.CASING, ID.BATTERY, ID.THRUSTER, ID.LEGS, ID.METAL, ID.GLASS, ...G.ELEM.list.filter((d) => d.castOf !== undefined).map((d) => d.id)]);
  const HULLISH = new Set([ID.METAL, ...G.ELEM.list.filter((d) => d.castOf !== undefined).map((d) => d.id)]);
  const FUELS = new Set(['oil', 'methane', 'alcohol', 'napalm', 'el_h'].filter((k) => byKey[k]).map((k) => byKey[k].id));

  // The ship standing in (or rising out of) the silo: every cell joined to its engines, and what
  // they add up to.
  function surveyShip(w, s) {
    let seed = -1;
    for (let y = 0; y < w.H && seed < 0; y++) for (let x = 130; x <= 190; x++) { const i = w.idx(x, y); if (w.type[i] === ID.THRUSTER) { seed = i; break; } }
    if (seed < 0) return null;
    const seen = new Set([seed]), q = [seed];
    while (q.length && seen.size < 4000) {
      const i = q.pop();
      for (const d of [1, -1, w.SW, -w.SW]) { const j = i + d; if (!seen.has(j) && SHIPPY.has(w.type[j])) { seen.add(j); q.push(j); } }
    }
    // Everything is judged on the ship proper, the columns it stands in: the fuel line and the depot
    // it may still be joined to don't count (the line lets go at launch)
    const own = (x) => x >= s.shipBox.x0 && x <= s.shipBox.x1;
    const r = { all: seen, cells: new Set(), n: 0, up: 0, fuel: 0, legs: 0, bypass: false, x0: w.W, x1: -1, y0: w.H, y1: -1, vy: 0, attached: false, powered: false };
    let nt = 0;
    for (const i of seen) {
      const t = w.type[i], x = i % w.SW, y = (i / w.SW) | 0;
      if (!own(x)) { r.attached = true; continue; }
      r.cells.add(i); r.n++;
      if (x < r.x0) r.x0 = x; if (x > r.x1) r.x1 = x; if (y < r.y0) r.y0 = y; if (y > r.y1) r.y1 = y;
      if (t === ID.THRUSTER) { nt++; r.vy += w.vy[i]; if ((w.aux[i] & 3) === 0) r.up++; if (w.sap[i] > 0) r.powered = true; }
      else if (t === ID.TANK) { if (FUELS.has(w.aux[i])) r.fuel += w.data[i]; }
      else if (t === ID.LEGS) r.legs++;
      else if (t === ID.BATTERY) for (const d of [1, -1, w.SW, -w.SW]) if (HULLISH.has(w.type[i + d])) r.bypass = true;
    }
    r.vy = nt ? r.vy / nt : 0;
    // the cabin: is the air round you shut in by the ship?
    r.head = -1;
    for (let y = r.y0; y <= r.y1 && r.head < 0; y++) for (let x = r.x0; x <= r.x1; x++) { const i = w.idx(x, y); if (w.type[i] === ID.HEAD) { r.head = i; break; } }
    r.sealed = false;
    if (r.head >= 0) {
      const air = new Set(), aq = [];
      for (const d of [1, -1, w.SW, -w.SW]) { const j = r.head + d; if (w.type[j] === ID.EMPTY) { air.add(j); aq.push(j); } }
      let out = false;
      while (aq.length && !out && air.size < 900) {
        const i = aq.pop(), x = i % w.SW, y = (i / w.SW) | 0;
        if (x <= r.x0 || x >= r.x1 || y <= r.y0 || y >= r.y1) { out = true; break; }
        for (const d of [1, -1, w.SW, -w.SW]) { const j = i + d, t = w.type[j]; if (!air.has(j) && (t === ID.EMPTY || t === ID.HUMAN || t === ID.SMOKE || t === ID.FIRE)) { air.add(j); aq.push(j); } }
      }
      r.sealed = !out && air.size < 900;
    }
    return r;
  }

  const READY = [
    ['The porthole is sealed', 'The cabin holds its air.'],
    ['The engines answer to the switch', 'No current round the hull any more.'],
    ['Engines enough to climb', 'Under fifty cells of ship for every engine.'],
    ['Fuel aboard', 'Switch the depot off. The fuel line lets go by itself when the engines light.'],
    ['Legs fitted', 'Something to stand on when you get there.'],
  ];
  function launchPad(w, s) {
    if (s.shards0 == null) s.shards0 = w.counts[ID.SHARDS] || 3;
    if (s.t % 15) return;
    const r = surveyShip(w, s);
    if (!r) return;
    s.ship = r;
    if (s.lifted) { s.ship = r; return launchCheck(w, s, r); } // the checklist is done with once it flies
    // light enough: an engine can just about lift 74 cells; to climb out of the silo briskly, it
    // wants under 50 each
    const ready = [r.sealed, !r.bypass && w.counts[ID.BATTERY] > 0, r.up > 0 && r.n / r.up < 50, r.fuel >= 240, r.legs >= 2];
    s.ready = s.ready || [false, false, false, false, false];
    ready.forEach((ok, k) => {
      if (ok && !s.ready[k]) s.say.push({ eyebrow: `Ready ${ready.filter(Boolean).length} of 5`, name: READY[k][0], how: READY[k][1] });
      s.ready[k] = ok;
    });
    if (w.counts[ID.SCRAP] > 0 || w.counts[ID.SHARDS] > s.shards0) s.dented = true;
    // the engines light: the clamps let the fuel line go, once the ship is ready to fly; until then
    // the line holds it down on the pad
    if (r.attached && r.powered && r.fuel > 0) {
      if (ready.every(Boolean)) {
        for (const i of r.all) {
          const x = i % w.SW;
          if ((x > s.shipBox.x1 && x <= s.shipBox.x1 + 3) || (x < s.shipBox.x0 && x >= s.shipBox.x0 - 3)) w.place(i, ID.EMPTY);
        }
        s.say.push({ eyebrow: 'The pad', name: 'The fuel line lets go', how: 'Nothing holds the ship now.' });
      } else if (!s.heldNote || s.t - s.heldNote > 8 * SEC) {
        s.heldNote = s.t;
        const missing = READY.filter((_, k) => !ready[k]).map((m) => m[0].toLowerCase());
        s.say.push({ eyebrow: 'The pad', name: 'The fuel line holds the ship down', how: `It lets go when the ship is ready. Still to do: ${missing.join('; ')}.` });
      }
    }
    if (!s.lifted && r.vy < -0.05 && r.y1 < s.shipBox.y1 - 2) { s.lifted = true; s.say.push({ eyebrow: 'Lift-off', name: 'It flies', how: 'Up the silo and out.' }); }
    launchCheck(w, s, r);
  }
  // through the silo's mouth and away, toward the moon: the chapter (and the story so far) ends here
  function launchCheck(w, s, r) {
    if (r.y0 <= 14 && r.vy < -0.1) {
      if (!r.sealed) { s.abort = 'Past the air there is nothing to breathe, and your cabin was open to it. You turned back and came down hard in the dark.'; return; }
      if (r.legs < 2) { s.abort = 'Halfway there you remembered: no legs. A ship that can’t stand can’t land. You turned back.'; return; }
      s.phase = 'gone'; s.cutscene = true;
      s.say.push({ eyebrow: 'The sky', name: 'Out of the silo and away', how: 'The plateau drops away beneath you.' });
    }
  }
  // the ship climbs on out of the top of the map: whatever reaches the top edge has gone
  function flyOff(w) {
    for (let y = 0; y < 3; y++) for (let x = 0; x < w.W; x++) {
      const i = w.idx(x, y), t = w.type[i];
      if (SHIPPY.has(t) || t === ID.HUMAN || t === ID.HEAD || t === ID.FIRE) w.place(i, ID.EMPTY);
    }
  }

  // the powders a paddle can stir together
  const STIRS = new Set([ID.ASH, ID.SALT, ID.RUST, ID.GUNPOWDER, ID.THERMITE]);

  // Everything that is on fire right now: flames, embers, and burning matter.
  function burning(w) { return w.counts[ID.FIRE] + w.counts[ID.EMBER] + w.events.burning; }

  function clock(ticks) {
    const s = Math.max(0, Math.ceil(ticks / SEC));
    return `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`;
  }

  // Chapter I: the field counts as soaked once this much of its top three rows is mud (rain only
  // ever wets the top row, so about half of that)
  const SOAK = 0.15;

  // a star goal that holds while the clock is under `secs`
  function beforeBell(id, text, secs) {
    return {
      id, keep: true, text,
      eval(w, s) {
        const limit = secs * SEC;
        return { holds: s.t <= limit, value: s.t <= limit ? clock(limit - s.t) : 'missed' };
      },
    };
  }
  // a star goal that holds while at least `need` people (or all of them) are alive
  function nobodyHurt(id, text, key = 'villagers') {
    return {
      id, keep: true, text,
      eval(w, s) {
        const alive = w.counts[ID.HUMAN];
        return { holds: alive >= s[key], value: `${Math.min(alive, s[key])} / ${s[key]}` };
      },
    };
  }

  // Ground strata painted in earth colours: a top crust, then soil, then rock in bands.
  function strata(w, x, top, bands) {
    let y = top;
    for (const [t, depth, colors] of bands) {
      for (let k = 0; k < depth && y < w.H; k++, y++) {
        const i = w.idx(x, y);
        w.place(i, t);
        if (colors) tone(w, i, pick(colors, x, y));
      }
    }
    for (; y < w.H; y++) w.place(w.idx(x, y), ID.STONE);
  }

  // ───── the master's letter ─────
  const prologue = {
    title: 'The Empty Workshop',
    body: [
      'You came back from market to find the Elementarium unlocked and the furnace cold. Your master’s coat was gone from its hook, and so were the big copper boiler, the brass telescope and every roll of wire in the house. On the bench lay the table of elements, half its slots still dark, and a letter.',
    ],
    letter: {
      text: [
        'Apprentice —',
        'For forty nights a light has burned on the dark face of the moon, where no light should be. It blinks, and it keeps time, like someone signalling. Since it came the valley has gone wrong: rain falls in the wrong places, stones fall out of clear skies, the mountain hums in its sleep.',
        'I am going up to see who is calling. It will take a ship, and I have to build it from whatever the valley can spare. Do not follow me. Help the valley instead. Everything you need is in the table; the rest you will learn by watching what the world does.',
      ],
      sign: '— O.',
    },
    after: 'You folded the letter into your pocket, took down the travelling pouch, and looked at the moon for a long time.',
  };

  // ───── chapters ─────
  const chapters = [
    {
      id: 'drought',
      num: 'I',
      title: 'The Dry Season',
      place: 'Millbrook',
      blurb: 'No rain since spring. The furrows are dust and the seed sacks are full.',
      size: [320, 180],
      sky: 'day',
      weather: { mode: 'natural', wind: 1, ambient: 32 },
      rules: { drySoil: true },
      pouch: [
        { kind: 'tool', name: 'heat' },
        { kind: 'element', key: 'fire', n: 300 },
        { kind: 'element', key: 'seed', n: 60 },
      ],
      intro: {
        body: [
          'Millbrook has not seen rain since the spring fair. The furrows have cracked like old pottery, the willow by the millpond is dropping its leaves, and the farmers will not sow: seed thrown into this dust only lies there like gravel.',
          'The miller remembers your master. “Stood by that pond half the afternoon,” he says. “Said the water wasn’t gone, only resting. Said it has to go up before it can come down. Then they bought my old boiler and drove off with it.”',
        ],
        task: 'Bring rain to the bare field until the ground there is mud, then sow your seed in it and green the field.',
      },
      guide: [
        {
          title: 'Heat the millpond', use: ['tool:heat'], makes: 'steam',
          note: 'Hold Heat on the water. Steam rises and gathers into clouds high above.',
          at: (w, s) => pad(s.pond, 3),
          done: (w, s) => s.rained || w.counts[ID.CLOUD] + w.counts[ID.RAINCLOUD] >= 120,
        },
        {
          title: 'Bring the rain', use: ['tool:heat'], makes: 'raincloud',
          note: 'Keep heating until the clouds crowd together and darken. The breeze blows them east over the field.',
          at: (w, s) => ({ x0: s.pond.x0, x1: s.soil.x1, y0: 6, y1: s.soil.y0 + 2 }),
          done: (w, s) => !!s.rained,
        },
        {
          title: 'Sow the field', use: ['seed'], makes: 'plant',
          note: 'The field is mud now. Brush Seed along it: every seed grows into a crop.',
          at: (w, s) => ({ x0: s.soil.x0, x1: s.soil.x1, y0: s.soil.y0 - 10, y1: s.soil.y1 }),
          done: (w, s) => goalMet(s, 'crops'),
        },
      ],
      outro: {
        title: 'Rain on Millbrook',
        body: [
          'The first drops hit the dust like thrown coins. By evening the furrows are black with mud and green threads are standing up out of them. Someone starts singing in the square, and the miller brings you a jug of the first milk of the week.',
        ],
        found: 'Tucked under the miller’s door, a page in your master’s hand:',
        page: [
          'The water here no longer rises of its own accord: the ground drinks the heat that should lift it. The moon’s light pulls at everything in this valley, even the weather.',
          'The boiler will make a fine fuel tank. A ship also needs a window that can hold back nothing at all, and no fire in the valley is hot enough to make one. I am going to the glassworks at Sandmouth.',
        ],
        sign: '— O.',
      },
      part: 'The miller’s boiler: your master took it for a fuel tank.',

      build(w, s) {
        const { W, H } = w;
        const n = noise1();
        const g = (x) => Math.round(H * 0.68 + n(x) * 3);
        const p0 = 6, p1 = 74;                  // the millpond
        const f0 = 114, f1 = 208;               // the field
        const v0 = 222;                         // the village wall
        // the village stands on a rise, so the rain runs off it down into the field and the pond
        const fieldG = g(f0), villageG = fieldG - 6;
        const ground = new Int32Array(W);
        for (let x = 0; x < W; x++) {
          ground[x] = x >= f0 - 3 && x <= f1 + 3 ? fieldG : x > f1 + 3 ? Math.max(villageG, fieldG - (((x - f1 - 3) / 2) | 0)) : g(x);
        }
        const DUST = [0x9c7d55, 0xa3845b, 0x94764f, 0xa98a62], SOILC = [0x7a5a3b, 0x6f5236, 0x80603f];
        const ROCK = [0x6f675e, 0x7a7167, 0x655d55], DEEP = [0x57504a, 0x5f5750];
        for (let x = 0; x < W; x++) {
          strata(w, x, ground[x], [[ID.DIRT, 3, DUST], [ID.DIRT, 7, SOILC], [ID.STONE, 14, ROCK], [ID.STONE, 60, DEEP]]);
        }
        // the millpond: a steep stone basin, its water sunk well below the rim by the drought
        const pg = Math.min(...Array.from({ length: p1 - p0 + 1 }, (_, k) => ground[p0 + k]));
        for (let x = p0; x <= p1; x++) {
          fillCol(w, x, ground[x], pg + 26, ID.STONE);
          for (let y = ground[x]; y <= pg + 26; y++) tone(w, w.idx(x, y), pick(ROCK, x, y));
          if (x >= p0 + 2 && x <= p1 - 2) {
            fillCol(w, x, ground[x], pg + 23, ID.EMPTY);
            fillCol(w, x, pg + 12, pg + 23, ID.WATER);
          }
        }
        // a dry tidemark of cracked mud where the water used to stand
        for (let x = p0 + 2; x <= p1 - 2; x++) {
          const i = w.idx(x, pg + 11);
          if (w.type[i] === ID.EMPTY && (x < p0 + 6 || x > p1 - 6)) { w.place(i, ID.CLAY); }
        }
        // the field: bare, cracked furrows between two stone curbs that keep the mud in
        curb(w, f0 - 1, fieldG); curb(w, f1 + 1, fieldG);
        for (let x = f0; x <= f1; x++) {
          for (let y = fieldG; y < fieldG + 3; y++) tone(w, w.idx(x, y), (x - f0) % 4 === 0 ? 0x8a6c47 : pick(DUST, x, y));
        }
        s.field = { x0: f0, x1: f1, y0: fieldG - 70, y1: fieldG + 4 };
        s.pond = { x0: p0 + 2, x1: p1 - 2, y0: pg + 6, y1: pg + 16 };
        s.soil = { x0: f0, x1: f1, y0: fieldG, y1: fieldG + 2, n: (f1 - f0 + 1) * 3 };
        // dry grass by the millpond, gone brown (none toward the village: rain greens it, and grass
        // that greens spreads, and would grow over the people)
        for (let x = p1 + 3; x <= f0 - 3; x++) if (Math.random() < 0.8) { const y = ground[x] - 1; w.place(w.idx(x, y), ID.DRYGRASS); }
        for (let x = f1 + 3; x < v0; x += 3 + ((Math.random() * 4) | 0)) w.place(w.idx(x, ground[x] - 1), ID.STONE);
        // a willow drooping over the millpond and an oak by the lane (leaves green and spread in rain,
        // so no tree stands in the village itself: it would grow over the people sheltering there)
        K.willow(w, p1 + 9, ground[p1 + 9], 16);
        K.oak(w, f0 - 14, ground[f0 - 14], 19);
        // the village behind its stile: two cottages, the mill house with its glass windows, and oaks
        stile(w, v0, villageG);
        s.timber = [...hut(w, 232, 14, villageG), ...hut(w, 300, 13, villageG)];
        const m0 = 256, m1 = 282, top = villageG - 16;
        for (let y = top; y < villageG; y++) for (const x of [m0, m0 + 1, m1 - 1, m1]) w.place(w.idx(x, y), ID.BRICK);
        for (let x = m0 - 2; x <= m1 + 2; x++) { w.place(w.idx(x, top), ID.BRICK); w.place(w.idx(x, top - 1), ID.BRICK); }
        for (let k = 0; k < 6; k++) for (let x = m0 + 3 + k; x <= m1 - 3 - k; x++) w.place(w.idx(x, top - 2 - k), ID.WOOD);
        for (let y = top + 4; y < top + 8; y++) { w.place(w.idx(m0, y), ID.GLASS); w.place(w.idx(m1, y), ID.GLASS); }
        for (let y = villageG - 4; y < villageG; y++) w.place(w.idx(m0, y), ID.EMPTY); // the door
        paintBox(w, m0 - 2, top - 1, m1 + 2, villageG, ID.BRICK, [0xb5653e, 0xa85b37, 0xbd7148]);
        // a well under its little roof (dry, and boarded over), a hay cart and the dead plum trees
        for (let x = 289; x <= 294; x++) for (let y = villageG - 3; y < villageG; y++) w.place(w.idx(x, y), x === 289 || x === 294 || y === villageG - 3 ? ID.STONE : ID.WOOD);
        for (let y = villageG - 9; y < villageG - 3; y++) { w.place(w.idx(289, y), ID.WOOD); w.place(w.idx(294, y), ID.WOOD); }
        for (let x = 288; x <= 295; x++) w.place(w.idx(x, villageG - 10), ID.WOOD);
        K.snag(w, 248, villageG, 12);
        K.snag(w, 316, villageG, 10);
        for (let x = 225; x <= 229; x++) w.place(w.idx(x, villageG - 2), ID.WOOD);
        w.place(w.idx(225, villageG - 1), ID.WOOD); w.place(w.idx(229, villageG - 1), ID.WOOD);
        s.villagers = villagers(w, v0 + 3, W - 3, 8, () => villageG - 1);
        // the cells just above the parched ground outside the field, where rain soaks away into it
        // (the field keeps its water between the curbs, for the crops)
        s.drink = [];
        for (let x = p1 + 1; x < W; x++) if (x < 289 || x > 294) s.drink.push(w.idx(x, ground[x] - 1));
        s.f0 = f0; s.f1 = f1;
        s.skyTo = villageG - 12;
      },

      script(w, s) {
        if (s.t === 2 * SEC) s.say.push({ eyebrow: 'Millbrook', name: 'Not a cloud in the sky', how: 'The farmers watch you walk down to the millpond.' });
        // ground this dry drinks the rain as it lands, so a downpour soaks in instead of flooding
        // (the field more slowly, so the crops have a shallow pool to drink from)
        if (s.t % 10 === 0) {
          for (const i of s.drink) {
            if (w.type[i] !== ID.WATER) continue;
            const x = i % w.SW;
            if (Math.random() < (x >= s.f0 && x <= s.f1 ? 0.12 : 0.3)) w.place(i, ID.EMPTY);
          }
        }
        // the pouch holds the miller's wheat: whatever you sow grows into leafy crops, not flowers
        // (checked every tick, before a seed on mud has a chance to sprout)
        {
          const z = s.field;
          for (let y = z.y0; y <= z.y1; y++) for (let x = 0, i = w.idx(0, y); x < w.W; x++, i++) if (w.type[i] === ID.SEED) w.aux[i] = 1;
        }
        // once the rain has really come, it soaks into the whole field, so seed takes wherever it falls
        if (s.rained && s.t % 10 === 0) {
          const z = s.soil;
          for (let k = 0; k < 6; k++) {
            const x = z.x0 + ((Math.random() * (z.x1 - z.x0 + 1)) | 0), i = w.idx(x, z.y0);
            if (w.type[i] === ID.DIRT) w.place(i, ID.MUD);
          }
        }
        // a soft summer rain: these clouds never build into thunderheads
        if (w.counts[ID.STORMCLOUD]) {
          for (let i = 0, end = w.idx(w.W - 1, s.skyTo); i <= end; i++) if (w.type[i] === ID.STORMCLOUD) w.place(i, ID.RAINCLOUD);
        }
        // the rain and the greening are judged once each: a field that is mud stays counted
        if (!s.rained && s.t % 30 === 0) {
          const mud = countIn(w, s.soil, [ID.MUD]);
          s.mud = mud;
          if (mud >= s.soil.n * SOAK) {
            s.rained = true;
            w.ambient = 21; // the heat breaks with the rain
            s.say.push({ eyebrow: 'Rain', name: 'The field is mud again', how: 'The heat breaks. Now sow the seed in it.' });
          }
        }
      },

      goals: [
        {
          id: 'rain', main: true, text: 'Soak the field',
          eval(w, s) {
            const want = s.soil.n * SOAK, have = s.rained ? want : s.mud || 0;
            return { met: !!s.rained, progress: Math.min(1, have / want), value: s.rained ? 'mud' : `${Math.round((have / want) * 100)}%` };
          },
        },
        {
          id: 'crops', main: true, text: 'Green the field',
          eval(w, s) {
            // how much of the field's width has crops standing on it: green from end to end, near enough
            const z = s.soil, cols = z.x1 - z.x0 + 1;
            let green = 0;
            for (let x = z.x0; x <= z.x1; x++) {
              for (let y = z.y0 - 24; y < z.y0 + 1; y++) {
                const i = w.idx(x, y), t = w.type[i];
                if ((t === ID.PLANT && !(w.flags[i] & G.Sim.LEAF)) || t === ID.FLOWER) { green++; break; }
              }
            }
            const f = green / (cols * 0.6); // green over most of its width is a green field
            return { met: f >= 1, progress: Math.min(1, f), value: `${Math.min(100, Math.floor(f * 100))}%` };
          },
        },
        nobodyHurt('safe', 'No villager comes to harm'),
        beforeBell('swift', 'Green before the third bell', 210),
      ],
    },

    {
      id: 'kiln',
      num: 'II',
      title: 'The Cold Kiln',
      place: 'Sandmouth glassworks',
      blurb: 'A glassworks with no coal, and a window that must be poured anyway.',
      size: [320, 180],
      sky: 'day',
      weather: { mode: 'natural', wind: -1, ambient: 18 },
      rules: {},
      pouch: [
        { kind: 'element', key: 'ash', n: 160 },
        { kind: 'element', key: 'salt', n: 160 },
        { kind: 'element', key: 'rust', n: 260 },
        { kind: 'element', key: 'oil', n: 40 },
        { kind: 'element', key: 'fire', n: 30 },
      ],
      intro: {
        body: [
          'Sandmouth sits on the dunes where the river meets the sea, and its glassworks has made every window in the valley. Today its kiln is cold. Your master came a week ago, paid for a round porthole “thick enough to hold back nothing at all”, and left with every sack of coal in the yard.',
          'Wenna the glassblower shows you the crucible, its sand still waiting. “Sand melts at seventeen hundred degrees,” she says. “Coal barely gets there; wood never does. Your master scribbled something on the wall before they left. I can’t make head or tail of it.” On the wall, in charcoal: ash and salt → black powder. Black powder and rust burn like the sun. Light it with something hotter than a flame.',
        ],
        task: 'Make something that burns hot enough to melt sand, and pour the porthole: 12 cells of glass in the crucible. Mind the barrels of black powder by the door.',
      },
      guide: [
        {
          title: 'Make black powder', use: ['ash', 'salt'], makes: 'gunpowder',
          note: 'Pour ash into the crucible, then salt on top. Where they meet they turn to black powder.',
          at: (w, s) => pad(s.mould, 2),
          done: (w, s) => countIn(w, s.mould, [ID.GUNPOWDER, ID.THERMITE]) >= 20,
        },
        {
          title: 'Make thermite', use: ['rust'], makes: 'thermite',
          note: 'Pour rust over the black powder. Together they make thermite.',
          at: (w, s) => pad(s.mould, 2),
          done: (w, s) => countIn(w, s.mould, [ID.THERMITE]) >= 30 || (s.molten || 0) + (s.glass || 0) > 0,
        },
        {
          title: 'Light it', use: ['oil', 'fire'], makes: 'mglass',
          note: 'A flame alone can’t light thermite. Pour a little oil on top and set it alight.',
          at: (w, s) => pad(s.mould, 2),
          done: (w, s) => (s.molten || 0) + (s.glass || 0) > 0,
        },
      ],
      outro: {
        title: 'A Window onto Nothing',
        body: [
          'The thermite burns white, too bright to look at. When the glare dies there is a disc of glass at the bottom of the crucible, still red at the edges, and under it a puddle of iron. Wenna lifts it out with tongs, holds it to the sky and says nothing for a long while. Then she wraps it in straw for you.',
        ],
        found: 'Pressed into the sand of the mould, under where the glass had been, a folded page:',
        page: [
          'Thermite: the hottest fire you can make in a bucket. Remember it. You will need hotter things than fire before the end.',
          'A ship has to be steered, and steering means current: wires, a switch, a battery that doesn’t drown. The lighthouse keeper at Gull Point owes me a favour. I have gone to collect it.',
        ],
        sign: '— O.',
      },
      part: 'A porthole of thermite-poured glass, wrapped in straw.',
      failText: 'The sand was blown out of the crucible. There is nothing left to melt.',

      build(w, s) {
        const { W, H } = w;
        const n = noise1();
        const g = 140;
        const SANDC = [0xe3c98a, 0xdcbf7c, 0xe9d197, 0xd6b673];
        const BRICKC = [0xa4552f, 0x99502c, 0xae6038, 0x8f4a29];
        // the sea, the beach and the dunes, then the yard of the glassworks
        for (let x = 0; x < W; x++) {
          const dune = x < 34 ? g + 10 : x < 118 ? Math.round(g - 6 - n(x) * 6 - Math.sin((x - 34) / 84 * Math.PI) * 8) : g;
          strata(w, x, dune, x < 118 ? [[ID.SAND, 12, SANDC], [ID.STONE, 6, null]] : [[ID.DIRT, 3, [0x8a7457, 0x7f6a4f]], [ID.STONE, 10, null]]);
          if (x < 34) for (let y = g - 2; y < dune; y++) w.place(w.idx(x, y), ID.WATER);
        }
        for (let k = 0; k < 6; k++) K.grassOver(w, 50 + k * 10, 54 + k * 10, 0.5);
        // the glassworks: brick walls with doors and windows, a roof with a chimney hole over the kiln
        const b0 = 122, b1 = 252, roof = g - 44;
        rect(w, b0, roof, b0 + 1, g - 1, ID.BRICK); rect(w, b1 - 1, roof, b1, g - 1, ID.BRICK);
        rect(w, b0 - 3, roof - 2, b1 + 3, roof - 1, ID.BRICK);
        rect(w, b0, g - 5, b0 + 1, g - 1, ID.EMPTY); rect(w, b1 - 1, g - 5, b1, g - 1, ID.EMPTY); // doors
        for (const [x0, y0] of [[b0, g - 30], [b1 - 1, g - 30]]) rect(w, x0, y0, x0 + 1, y0 + 8, ID.GLASS);
        // the kiln: a brick hearth with the crucible sunk in it, open to the chimney above
        const c0 = 160, c1 = 173, cf = g - 8;         // crucible inside x c0..c1, its floor row cf
        rect(w, c0 - 8, cf - 18, c1 + 8, g - 1, ID.BRICK);
        rect(w, c0, cf - 18, c1, cf - 1, ID.EMPTY);   // the crucible's well
        rect(w, c0 - 6, cf - 18, c0 - 3, cf - 4, ID.EMPTY); rect(w, c1 + 3, cf - 18, c1 + 6, cf - 4, ID.EMPTY); // flues
        rect(w, c0, cf - 3, c1, cf - 1, ID.SAND);      // the mould's sand
        rect(w, c0 - 9, roof - 2, c1 + 9, roof - 1, ID.EMPTY); // the chimney hole
        for (let y = roof - 14; y < roof - 2; y++) { w.place(w.idx(c0 - 10, y), ID.BRICK); w.place(w.idx(c1 + 10, y), ID.BRICK); }
        paintBox(w, b0 - 3, roof - 16, b1 + 3, g - 1, ID.BRICK, BRICKC);
        paintBox(w, c0, cf - 3, c1, cf - 1, ID.SAND, [0xf0dfb0, 0xeadaa8]);
        s.mould = { x0: c0, x1: c1, y0: cf - 18, y1: cf - 1 };
        s.stir = { x0: c0, x1: c1, y0: cf - 18, y1: cf - 4 }; // above the sand: what Wenna's paddle reaches
        // the workbench and shelves of finished glass
        rect(w, 190, g - 10, 214, g - 10, ID.WOOD); rect(w, 190, g - 9, 190, g - 1, ID.WOOD); rect(w, 214, g - 9, 214, g - 1, ID.WOOD);
        for (let x = 192; x <= 212; x += 4) rect(w, x, g - 13, x + 1, g - 11, ID.GLASS);
        rect(w, 130, g - 24, 146, g - 24, ID.WOOD);
        for (let x = 131; x <= 145; x += 3) rect(w, x, g - 27, x + 1, g - 25, ID.GLASS);
        // the powder store by the east door: barrels of black powder in a wooden rack
        rect(w, 230, g - 12, 246, g - 12, ID.WOOD); rect(w, 230, g - 11, 230, g - 1, ID.WOOD); rect(w, 246, g - 11, 246, g - 1, ID.WOOD);
        rect(w, 232, g - 6, 244, g - 1, ID.GUNPOWDER);
        s.powder = { x0: 228, x1: 248, y0: g - 30, y1: g - 1 };
        s.powder0 = countIn(w, s.powder, [ID.GUNPOWDER]);
        // the glassblowers keep to their benches, well back from the kiln
        stile(w, 198, g);
        s.villagers = villagers(w, 202, 228, 5, () => g - 1);
        // cottages of Sandmouth along the shore road
        s.timber = [...hut(w, 264, 14, g), ...hut(w, 292, 16, g)];
        paintBox(w, 260, g - 12, 312, g - 1, ID.BRICK, BRICKC);
      },

      script(w, s) {
        if (s.t === 3 * SEC) s.say.push({ eyebrow: 'Sandmouth', name: 'The kiln is stone cold', how: 'Wenna watches from her bench.' });
        // Wenna stirs whatever powders you tip into the crucible with her long paddle, so they meet
        // (cold ones only: nobody puts a paddle into a fire)
        if (s.t % 2 === 0) {
          const z = s.stir;
          for (let k = 0; k < 24; k++) {
            const x = z.x0 + ((Math.random() * (z.x1 - z.x0 + 1)) | 0), y = z.y0 + ((Math.random() * (z.y1 - z.y0 + 1)) | 0);
            const i = w.idx(x, y), j = i + w.SW * (y < z.y1 ? 1 : -1) + (Math.random() < 0.5 ? 1 : -1) * (Math.random() < 0.5 ? 1 : 0);
            const a = w.type[i], b = w.type[j];
            if (a === b || !STIRS.has(a) || !STIRS.has(b) || w.temp[i] > 120 || w.temp[j] > 120) continue;
            w.place(i, b); w.place(j, a);
          }
        }
        if (s.t % 30 === 0) {
          s.glass = countIn(w, s.mould, [ID.GLASS]);
          s.molten = countIn(w, s.mould, [ID.MGLASS]);
          s.sand = countIn(w, s.mould, [ID.SAND]);
          if (!s.hot && s.molten > 0) { s.hot = true; s.say.push({ eyebrow: 'The crucible', name: 'The sand is melting', how: 'Let it cool and set.' }); }
        }
      },

      goals: [
        {
          id: 'glass', main: true, text: 'Pour the porthole',
          eval(w, s) {
            const have = s.glass || 0, want = 12;
            const value = have >= want ? 'poured' : s.molten ? `${s.molten} molten` : `${have} / ${want} glass`;
            return { met: have >= want, progress: Math.min(1, (have + (s.molten || 0) * 0.5) / want), value };
          },
        },
        nobodyHurt('safe', 'No glassblower is hurt'),
        {
          id: 'powder', keep: true, text: 'The powder store never goes off',
          eval(w, s) {
            const left = countIn(w, s.powder, [ID.GUNPOWDER]);
            return { holds: left >= s.powder0 * 0.9, value: left >= s.powder0 * 0.9 ? 'safe' : 'went off' };
          },
        },
      ],
      fail(w, s) {
        if (s.t > 2 * SEC && (s.sand || 0) + (s.glass || 0) + (s.molten || 0) < 12 && s.t % 30 === 0) return this.failText;
        return null;
      },
    },

    {
      id: 'lighthouse',
      num: 'III',
      title: 'The Dark Lighthouse',
      place: 'Gull Point',
      blurb: 'A storm coming in, the boats still out, and the light gone dark.',
      size: [320, 180],
      sky: 'night',
      weather: { mode: 'natural', wind: 2, ambient: 9 }, // no rain: it would fill the map; the gale's spray is scripted
      rules: {},
      pouch: [
        { kind: 'element', key: 'battery', n: 3 },
        { kind: 'element', key: 'wire', n: 180 },
        { kind: 'element', key: 'metal', n: 120 },
        { kind: 'element', key: 'switch', n: 2 },
      ],
      intro: {
        body: [
          'Gull Point is the last rock before open sea, and its lighthouse brings the fishing boats home. Tonight a gale is driving spray over the jetty, four boats are still out, and the lamp at the top of the tower is dark.',
          'The keeper, Mags, shows you the line: a bare copper strap from the battery bench up the seaward face of the tower, gone green and crumbling. “Salt eats metal,” she says. “Your master told me so last week, while they were taking my spare batteries and every reel of wire I had. Left me one reel. Said you’d know what it was for.”',
        ],
        task: 'Put current through the lamp at the top of the tower and keep it lit until all four boats are home. The bench at the tower’s foot holds the batteries; the line needs mending all the way up.',
      },
      guide: [
        {
          title: 'A battery on the bench', use: ['battery'],
          note: 'Put a battery on the bench at the foot of the tower, right against the tower.',
          at: (w, s) => ({ x0: s.bench.x0, x1: s.face.x, y0: s.bench.y - 5, y1: s.bench.y + 4 }),
          done: (w, s) => s.litAny || countIn(w, { x0: s.bench.x0 - 1, x1: s.face.x, y0: s.bench.y - 6, y1: s.bench.y }, [ID.BATTERY]) > 0,
        },
        {
          title: 'Wire up the tower', use: ['wire', 'switch'],
          note: 'Draw Wire from the battery straight up the tower to the iron bar under the lamp, with a switch on the way. Bare metal rusts in the spray.',
          at: (w, s) => ({ x0: s.face.x - 3, x1: s.face.x + 3, y0: s.face.top - 3, y1: s.bench.y + 1 }),
          done: (w, s) => !!s.litAny,
        },
        {
          title: 'Keep it burning', use: [],
          note: 'A boat comes home for every eight seconds of light. Keep the line whole until all four are in.',
          at: (w, s) => ({ x0: 8, x1: 128, y0: s.sea - 12, y1: s.sea + 2 }),
          done: (w, s) => goalMet(s, 'boats'),
        },
      ],
      outro: {
        title: 'The Boats Come Home',
        body: [
          'The lamp throws its white beam across the waves, and one by one the boats come round the point and in under the jetty. The fishers climb up soaked to the skin, and Mags pours everyone something hot from a kettle that has been on the stove all night.',
        ],
        found: 'Under the battery bench, wrapped in tarred cloth against the salt:',
        page: [
          'A ship lives or dies by its wiring. Bare metal carries current anywhere it touches, and salt eats it; coated wire goes only where you lay it. And always put a switch where you can reach it.',
          'Now the hull. Iron, and a great deal of it, and pure: copper in the plates makes them weak. The foundry at Copperhill has a mountain of mixed ore and a magnet that picks out iron. I am going to see what it makes.',
        ],
        sign: '— O.',
      },
      part: 'A coil of coated wire and a brass switch from the lighthouse.',
      failText: 'The boats couldn’t find the harbour in the dark. They rode out the storm at sea, and Mags will not forgive you soon.',

      build(w, s) {
        const { W, H } = w;
        const n = noise1();
        const sea = 128, g = 120;                     // the sea's surface, and the top of the headland
        const ROCK = [0x5b5f63, 0x666a6e, 0x52565a, 0x6f7376];
        // the sea to the west, a jetty at the foot of the headland, the headland rising to the east
        for (let x = 0; x < W; x++) {
          const top = x < 150 ? 150 + Math.round(n(x) * 6) : x < 168 ? sea + 4 : g + Math.round(Math.max(0, 230 - x) * 0.08);
          strata(w, x, top, [[ID.STONE, 70, ROCK]]);
          if (x < 168) for (let y = sea; y < top; y++) w.place(w.idx(x, y), ID.SALTWATER);
        }
        // the jetty: planks on posts out over the water
        rect(w, 140, sea - 2, 170, sea - 2, ID.WOOD);
        for (const x of [142, 152, 162]) rect(w, x, sea - 1, x, sea + 8, ID.WOOD);
        // the lighthouse: a stone tower, painted white with a red band, the lamp room on top
        const t0 = 186, t1 = 200, top = 34;
        const tg = g + Math.round(Math.max(0, 230 - t0) * 0.08);
        rect(w, t0, top, t1, tg, ID.STONE);
        for (let y = top; y <= tg; y++) for (let x = t0; x <= t1; x++) tone(w, w.idx(x, y), ((y - top) / 12 | 0) % 2 ? 0xc0392b : 0xeeeae2);
        rect(w, t0 - 3, top - 1, t1 + 3, top, ID.METAL);                   // the gallery floor
        const lamp0 = t0 + 1, lamp1 = t1 - 1, lampTop = top - 16;
        rect(w, t0 - 1, lampTop, t0 - 1, top - 2, ID.GLASS); rect(w, t1 + 1, lampTop, t1 + 1, top - 2, ID.GLASS);
        rect(w, t0 - 1, lampTop - 1, t1 + 1, lampTop - 1, ID.GLASS);
        rect(w, t0 - 2, lampTop - 3, t1 + 2, lampTop - 2, ID.METAL);       // the cap
        // three tubes of krypton (white light), each standing on the electrode bar
        const KR = byKey.el_kr.id;
        s.lamps = [];
        for (const x of [lamp0 + 2, (lamp0 + lamp1) >> 1, lamp1 - 2]) {
          rect(w, x - 1, lampTop + 1, x - 1, top - 3, ID.GLASS); rect(w, x + 1, lampTop + 1, x + 1, top - 3, ID.GLASS);
          rect(w, x, lampTop + 1, x, lampTop + 1, ID.GLASS);
          rect(w, x, lampTop + 2, x, top - 3, KR);
          s.lamps.push({ x, y0: lampTop + 2, y1: top - 3 });
        }
        rect(w, lamp0, top - 2, lamp1, top - 2, ID.METAL);                 // the electrode bar
        // the battery bench at the tower's foot, on the seaward side, and the old strap up the tower,
        // rusted through in a dozen places
        const bx0 = t0 - 12, bg = tg;
        rect(w, bx0, bg - 4, t0 - 2, bg - 4, ID.WOOD);
        rect(w, bx0, bg - 3, bx0, bg - 1, ID.WOOD); rect(w, t0 - 2, bg - 3, t0 - 2, bg - 1, ID.WOOD);
        s.bench = { x0: bx0, x1: t0 - 2, y: bg - 5 };
        s.face = { x: t0 - 1, top: top - 2 }; s.sea = sea;
        for (let y = top - 1; y <= bg - 5; y++) {
          const i = w.idx(t0 - 1, y);
          w.place(i, Math.random() < 0.22 ? ID.RUST : ID.EMPTY);
        }
        rect(w, t0 - 1, top - 2, t0 - 1, top - 2, ID.METAL);               // the strap's last stub, at the bar
        // the keeper's cottage on the lee side
        s.timber = hut(w, 222, 16, g);
        s.villagers = villagers(w, 226, 236, 3, () => g - 1);
        stile(w, 214, g + Math.round(Math.max(0, 230 - 214) * 0.08));
        // four fishing boats out on the water, hulls and masts
        s.boats = [];
        for (const bx of [16, 46, 78, 108]) {
          const cells = [];
          const hull = (x, y, t) => { const i = w.idx(x, y); w.place(i, t); cells.push(i); };
          for (let x = bx; x < bx + 9; x++) hull(x, sea - 1, ID.WOOD);
          for (let x = bx + 1; x < bx + 8; x++) hull(x, sea, ID.WOOD);
          for (let y = sea - 8; y < sea - 1; y++) hull(bx + 4, y, ID.WOOD);
          s.boats.push({ cells, home: false });
        }
        s.seaTop = sea - 30;
        s.lit = 0; s.litAny = false;
        s.spray = { x0: 120, x1: t0 - 1, y0: top - 4, y1: bg - 1 };
      },

      script(w, s) {
        // is the lamp lit? current ran through one of its tubes in the last moment
        let on = false;
        for (const L of s.lamps) {
          for (let y = L.y0; y <= L.y1 && !on; y++) if (w.charge[w.idx(L.x, y)]) on = true;
        }
        if (on) s.lastOn = s.t;
        const lit = s.lastOn != null && s.t - s.lastOn < 40;
        if (lit) {
          s.lit++;
          if (!s.litAny) { s.litAny = true; s.say.push({ eyebrow: 'Gull Point', name: 'The lamp is lit', how: 'Keep it burning until the boats are home.' }); }
          if (!s.switched) for (let i = 0; i < w.N; i += 1) if (w.type[i] === ID.SWITCH && w.charge[i]) { s.switched = true; break; }
        }
        // a boat comes home for every eight seconds of light
        const due = Math.min(4, Math.floor(s.lit / (8 * SEC)));
        const home = s.boats.filter((b) => b.home).length;
        if (due > home) {
          const b = s.boats.find((q) => !q.home);
          for (const i of b.cells) w.place(i, ID.EMPTY);
          b.home = true;
          s.say.push({ eyebrow: 'The harbour', name: `Boat ${home + 1} is home`, how: home + 1 < 4 ? `${3 - home} still out.` : 'All four are in.' });
        }
        // the gale throws spray over the jetty and against the tower's seaward face, and salt eats
        // any bare metal it wets there (coated wire shrugs it off)
        if (s.t % 6 === 0) {
          const z = s.spray;
          for (let k = 0; k < 6; k++) {
            const near = Math.random() < 0.7;
            const x = near ? z.x1 - ((Math.random() * 8) | 0) : z.x0 + ((Math.random() * (z.x1 - z.x0)) | 0);
            const y = z.y0 + ((Math.random() * (z.y1 - z.y0)) | 0);
            const i = w.idx(x, y);
            if (w.type[i] !== ID.EMPTY) continue;
            w.place(i, ID.SALTWATER);
            // the spray comes off the sea: take as much from its surface, so the sea doesn't rise
            const sx = 2 + ((Math.random() * 126) | 0);
            for (let sy = s.seaTop; sy < w.H; sy++) { const j = w.idx(sx, sy); if (w.type[j] === ID.SALTWATER) { w.place(j, ID.EMPTY); break; } }
          }
        }
        if (s.t % 10 === 0) {
          const z = s.spray;
          for (let y = z.y0; y <= z.y1; y++) {
            for (let x = z.x1 - 10; x <= z.x1 + 1; x++) {
              const i = w.idx(x, y);
              if (w.type[i] !== ID.METAL) continue;
              const wet = w.type[i - 1] === ID.SALTWATER || w.type[i + 1] === ID.SALTWATER || w.type[i - w.SW] === ID.SALTWATER || w.type[i + w.SW] === ID.SALTWATER;
              if (wet && Math.random() < 0.35) w.place(i, ID.RUST);
            }
          }
        }
        if (s.t === 4 * SEC) s.say.push({ eyebrow: 'Gull Point', name: 'Four boats are still out', how: 'Without the light they will not find the harbour.' });
        if (s.t === 75 * SEC && !s.litAny) s.say.push({ eyebrow: 'The harbour', name: 'The boats are getting close to the rocks', how: 'Light the lamp, quickly.' });
      },

      goals: [
        {
          id: 'boats', main: true, text: 'Bring the four boats home',
          eval(w, s) {
            const home = s.boats.filter((b) => b.home).length;
            return { met: home === 4, progress: Math.min(1, s.lit / (32 * SEC)), value: `${home} / 4 home` };
          },
        },
        {
          id: 'switch', keep: true, text: 'The light runs through a switch',
          eval(w, s) {
            const holds = !s.litAny || s.switched || s.t - (s.firstLit || (s.firstLit = s.t)) < 4 * SEC;
            return { holds, value: s.switched ? 'yes' : s.litAny ? 'no switch' : 'not lit' };
          },
        },
        beforeBell('swift', 'All home before 1:40', 100),
      ],
      fail(w, s) { return s.t >= 100 * SEC && !s.litAny ? this.failText : null; },
    },

    {
      id: 'foundry',
      num: 'IV',
      title: 'The Iron Hills',
      place: 'Copperhill foundry',
      blurb: 'A mountain of mixed ore, and a hull plate that must be pure iron.',
      size: [320, 180],
      sky: 'dusk',
      weather: { mode: 'natural', wind: 0, ambient: 16 },
      rules: {},
      magnetOnly: true,
      pouch: [
        { kind: 'tool', name: 'magnet' },
        { kind: 'tool', name: 'heat' },
        { kind: 'tool', name: 'cool' },
      ],
      intro: {
        body: [
          'Copperhill digs its ore out of the hill in one rattling heap: iron, nickel and copper all together, with the rock still clinging to them. The foundry sorts it with a great magnet. Your master was here three days ago and cast a stack of iron plates; then the foundry’s furnace cracked, and the forge-master has been trying to cast the last plate by hand ever since.',
          '“Every plate comes out brittle,” he says. “The magnet picks up nickel along with the iron. Your master just laughed and said a magnet can be taught to forget. Then they heated the heap and left me to work out why.”',
        ],
        task: 'Carry iron, and only iron, from the ore heap to the mould with the magnet, melt it there and let it set: a hull plate of 120 cells of cast iron, with no nickel or copper in it.',
      },
      guide: [
        {
          title: 'Warm the heap', use: ['tool:heat'],
          note: 'Nickel forgets the magnet at 358°C, iron only at 770°C. Hold Heat over the heap until it is warm, about 400–700°C.',
          at: (w, s) => s.heap,
          done: (w, s) => (s.iron || 0) + (s.plate || 0) > 20 || meanTemp(w, s.heap, s.FE) >= 380,
        },
        {
          title: 'Carry the iron', use: ['tool:magnet'],
          note: 'Hold the Magnet over the heap: only iron jumps to it. Drag it under the roof and let go over the mould.',
          at: (w, s) => ({ x0: s.heap.x0, x1: s.mould.x1, y0: s.mould.y1 - 26, y1: s.heap.y1 }),
          done: (w, s) => (s.iron || 0) + (s.plate || 0) >= 120,
        },
        {
          title: 'Cast the plate', use: ['tool:heat', 'tool:cool'], makes: 'solid_fe',
          note: 'Hold Heat on the mould until the iron melts and runs flat, then Cool it so it sets.',
          at: (w, s) => ({ x0: s.mould.x0 - 2, x1: s.mould.x1 + 2, y0: s.mould.y1 - 10, y1: s.mould.y1 + 2 }),
          done: (w, s) => (s.plate || 0) >= 120,
        },
      ],
      outro: {
        title: 'Pure Iron',
        body: [
          'The plate rings like a bell when the forge-master knocks it out of the mould, and doesn’t crack when he hits it with a sledge. He hits it twice more to be sure, then sits down on the heap and laughs the way your master must have.',
        ],
        found: 'Riveted to the back of the mould, where the plate had hidden it:',
        page: [
          'Every magnet has a temperature where it forgets. Past it, iron is only metal. You will see that again.',
          'The hull is cast. Now fuel: something light that burns hot, more of it than any lamp holds. The spring at Saltmarsh has turned sour, and sour water and the right metal make the lightest fuel there is. I have gone to fetch it.',
        ],
        sign: '— O.',
      },
      part: 'A plate of pure cast iron for the hull.',

      build(w, s) {
        const { W, H } = w;
        const n = noise1();
        const g = 140;
        const ROCK = [0x7c6650, 0x6f5a46, 0x86705a, 0x5e4c3c], GREEN = [0x5f8a73, 0x4e7a63, 0x6b9680];
        // the hill the ore comes out of, streaked with copper green, with the yard at its foot
        for (let x = 0; x < W; x++) {
          const hill = x < 64 ? Math.round(g - (64 - x) * 1.1 - 6 + n(x) * 5) : g;
          for (let y = hill; y < g; y++) {
            const i = w.idx(x, y);
            w.place(i, ID.STONE);
            tone(w, i, (y + x + ((n(x * 3) * 9) | 0)) % 13 < 2 ? pick(GREEN, x, y) : pick(ROCK, x, y));
          }
          strata(w, x, g, [[ID.DIRT, 3, [0x6b5845, 0x5f4e3e]], [ID.STONE, 20, ROCK]]);
        }
        // the mine's mouth, propped with timber
        rect(w, 20, g - 14, 34, g - 1, ID.EMPTY);
        rect(w, 20, g - 15, 34, g - 15, ID.WOOD); rect(w, 20, g - 14, 20, g - 1, ID.WOOD); rect(w, 34, g - 14, 34, g - 1, ID.WOOD);
        // the ore heap in the yard
        const FE = byKey.el_fe.id, NI = byKey.el_ni.id, CU = byKey.el_cu.id;
        for (let x = 52; x <= 150; x++) {
          const h = Math.round(22 * Math.sin(((x - 52) / 98) * Math.PI));
          for (let y = g - h; y < g; y++) {
            const r = Math.random();
            w.place(w.idx(x, y), r < 0.42 ? FE : r < 0.66 ? NI : r < 0.82 ? CU : ID.RUBBLE);
          }
        }
        s.heap = { x0: 52, x1: 150, y0: g - 40, y1: g - 1 };
        // the foundry: open to the yard under a roof on brick posts, a mould of firebrick (wall)
        const f0 = 166, f1 = 300, roof = g - 46;
        rect(w, f0, roof, f0 + 1, g - 1, ID.BRICK); rect(w, f1 - 1, roof, f1, g - 1, ID.BRICK);
        rect(w, f0, roof + 4, f0 + 1, g - 1, ID.EMPTY); // the yard side stands open below the eaves
        rect(w, f0 - 3, roof - 2, f1 + 3, roof - 1, ID.BRICK);
        for (let x = f0 + 10; x < f1; x += 24) rect(w, x, roof, x + 1, roof + 2, ID.WOOD);
        paintBox(w, f0 - 3, roof - 2, f1 + 3, g - 1, ID.BRICK, [0x8c4a2f, 0x80432a, 0x97523a]);
        const m0 = 196, m1 = 250, mf = g - 6;
        rect(w, m0 - 2, mf - 5, m1 + 2, g - 1, ID.WALL);
        rect(w, m0, mf - 5, m1, mf - 1, ID.EMPTY);
        s.mould = { x0: m0, x1: m1, y0: mf - 30, y1: mf - 1 };
        // the cracked furnace, cold, and the forge-master's crew by the far wall
        rect(w, 268, g - 26, 290, g - 1, ID.BRICK);
        rect(w, 272, g - 22, 286, g - 6, ID.EMPTY);
        paintBox(w, 268, g - 26, 290, g - 1, ID.BRICK, [0x6e3a26, 0x7a412b]);
        stile(w, 258, g);
        s.villagers = villagers(w, 261, 266, 2, () => g - 1) + villagers(w, 292, 296, 1, () => g - 1);
        s.FE = FE; s.SFE = byKey.solid_fe.id;
        s.dirty = [NI, CU, byKey.solid_ni.id, byKey.solid_cu.id];
      },

      script(w, s) {
        if (s.t % 30 === 0) {
          s.plate = countIn(w, s.mould, [s.SFE]);
          s.dirt = countIn(w, s.mould, s.dirty);
          s.iron = countIn(w, s.mould, [s.FE]);
        }
        if (s.t === 3 * SEC) s.say.push({ eyebrow: 'Copperhill', name: 'The magnet is yours', how: 'Hold it over the heap and drag what sticks to the mould.' });
        if (!s.warned && (s.dirt || 0) > 0) { s.warned = true; s.say.push({ eyebrow: 'The forge-master', name: 'Nickel in the mould!', how: 'That will make the plate brittle. Teach the magnet to forget it.' }); }
      },

      goals: [
        {
          id: 'plate', main: true, text: 'Cast a hull plate',
          eval(w, s) {
            const have = s.plate || 0, want = 120;
            const value = have ? `${have} / ${want} cast` : s.iron ? `${s.iron} iron in` : 'empty';
            return { met: have >= want, progress: Math.min(1, (have + (s.iron || 0) * 0.5) / want), value };
          },
        },
        {
          id: 'pure', keep: true, text: 'Pure iron: no nickel or copper in it',
          eval(w, s) { return { holds: !(s.dirt > 0), value: s.dirt ? `${s.dirt} impure` : 'pure' }; },
        },
        beforeBell('swift', 'Cast before the night shift', 180),
      ],
    },

    {
      id: 'spring',
      num: 'V',
      title: 'The Bitter Spring',
      place: 'Saltmarsh',
      blurb: 'A spring gone sour, and the lightest fuel there is waiting in it.',
      size: [320, 180],
      sky: 'day',
      weather: { mode: 'natural', wind: 0, ambient: 15 },
      rules: {},
      pouch: [
        { kind: 'element', key: 'el_zn', n: 700 },
        { kind: 'element', key: 'glass', n: 40 },
        { kind: 'element', key: 'water', n: 300 },
      ],
      intro: {
        body: [
          'The spring at Saltmarsh turned sour in the spring: its water bites, the reeds round it have gone yellow, and nothing drinks from it. The marsh folk lined its pool with glass, the only thing it won’t eat, and waited for someone clever.',
          'Your master came, and built a great glass bell over the pool, a gasholder, dipping into the sour water. Then a heron knocked a hole in its top, and the old ferryman hung his lantern from the gantry right above it, “so folk can see the thing at night”.',
        ],
        task: 'Drop zinc into the sour spring under the bell. The gas that fizzes off is hydrogen, and it rises and gathers in the bell. Fill it with 100 cells of hydrogen. Hydrogen and a flame make a bang.',
      },
      guide: [
        {
          title: 'Mend the bell', use: ['glass'],
          note: 'Hydrogen finds any hole. Fill the gap in the top of the bell with Glass.',
          at: (w, s) => pad(s.hole, 4),
          done: (w, s) => countIn(w, s.hole, [ID.GLASS]) >= 8,
        },
        {
          title: 'Zinc into the spring', use: ['el_zn'], makes: 'el_h',
          note: 'Pour zinc into the pool inside the bell’s rim. It fizzes off hydrogen, which rises into the bell.',
          at: (w, s) => ({ x0: s.bell.x0, x1: s.bell.x1, y0: s.bell.y1 - 14, y1: s.bell.y1 }),
          done: (w, s) => (s.h || 0) >= 25,
        },
        {
          title: 'Fill the bell', use: ['el_zn'],
          note: 'Keep adding zinc until the bell holds 100 hydrogen.',
          at: (w, s) => pad(s.bell, 2),
          done: (w, s) => (s.h || 0) >= 100,
        },
      ],
      outro: {
        title: 'A Bell Full of Nothing',
        body: [
          'The bell fills with something you can’t see; you can only tell by the way the sour water has been pushed down inside its rim. The ferryman knocks on the glass, listens, and asks if it is empty. You tell him it is full of the lightest thing in the world, and he hangs his lantern somewhere else.',
        ],
        found: 'In the ferryman’s tackle box, among the hooks, a page:',
        page: [
          'Hydrogen burns hotter than oil and weighs almost nothing: the best fuel a ship could carry. But it has to be moved: pumped, piped, poured into a tank, and kept away from every flame on the way.',
          'There is an oil seep at Oilbeck too, and a pumphouse that hasn’t pumped in years. I need both fuels in the depot on the hill before the moon is full. I have gone ahead to lay the pipes; I may not finish.',
        ],
        sign: '— O.',
      },
      part: 'A gasholder of hydrogen, the lightest fuel there is.',
      failText: 'The hydrogen met the flame. The gasholder went off like a cannon and the marsh will be picking glass out of the reeds for a month.',

      build(w, s) {
        const { W, H } = w;
        const n = noise1();
        const g = 136;
        const MUDC = [0x5d4a35, 0x524230, 0x67533c];
        for (let x = 0; x < W; x++) {
          const top = g + Math.round(n(x) * 2);
          strata(w, x, top, [[ID.MUD, 4, MUDC], [ID.DIRT, 6, [0x5a4a3a, 0x504234]], [ID.STONE, 30, null]]);
        }
        // marsh pools and reeds to either side
        for (const [a, b] of [[8, 70], [244, 312]]) {
          for (let x = a; x <= b; x++) { const d = 3 + Math.round(2 * Math.sin(((x - a) / (b - a)) * Math.PI)); rect(w, x, g - 1, x, g + d, ID.WATER); }
          for (let x = a; x <= b; x += 5) if (Math.random() < 0.7) { const h = 4 + ((Math.random() * 6) | 0); for (let y = g - h; y < g - 1; y++) w.place(w.idx(x, y), ID.PLANT); }
        }
        K.scatter(w, ID.FISH, 6, 250, g, 306, g + 3, ID.WATER);
        // the sour spring: a pool lined with glass, full of acid
        const p0 = 112, p1 = 208, pf = g + 18;
        rect(w, p0 - 2, g - 6, p1 + 2, pf + 1, ID.GLASS);
        rect(w, p0, g - 6, p1, pf - 1, ID.EMPTY);
        rect(w, p0, g - 2, p1, pf - 1, ID.ACID);
        s.pool = { x0: p0, x1: p1, y0: g - 2, y1: pf - 1 };
        // the gasholder: a glass bell on legs, its rim dipping into the acid, a hole in its top
        const b0 = 132, b1 = 188, top = g - 54;
        rect(w, b0, top, b0 + 1, g + 6, ID.GLASS); rect(w, b1 - 1, top, b1, g + 6, ID.GLASS);
        rect(w, b0, top, b1, top + 1, ID.GLASS);
        const hx = 158;
        rect(w, hx, top, hx + 3, top + 1, ID.EMPTY); // the heron's hole
        s.bell = { x0: b0 + 2, x1: b1 - 2, y0: top + 2, y1: g + 6 };
        s.hole = { x0: hx, x1: hx + 3, y0: top, y1: top + 1 };
        s.bellGlass = countIn(w, { x0: b0, x1: b1, y0: top, y1: g + 6 }, [ID.GLASS]);
        s.bellBox = { x0: b0, x1: b1, y0: top, y1: g + 6 };
        // the gantry above it, and the ferryman's lantern hanging over the hole
        const gy = top - 26;
        rect(w, 120, gy, 200, gy, ID.METAL);
        rect(w, 120, gy + 1, 121, g - 7, ID.METAL); rect(w, 199, gy + 1, 200, g - 7, ID.METAL);
        rect(w, hx - 2, gy + 1, hx - 2, gy + 6, ID.METAL); rect(w, hx + 5, gy + 1, hx + 5, gy + 6, ID.METAL); // its hangers
        rect(w, hx - 2, gy + 7, hx - 2, gy + 13, ID.GLASS); rect(w, hx + 5, gy + 7, hx + 5, gy + 13, ID.GLASS); // open-topped
        s.flame = [w.idx(hx + 1, gy + 12), w.idx(hx + 2, gy + 12)];
        rect(w, hx, gy + 13, hx + 3, gy + 13, ID.METAL);            // its wick tray (open at the sides)
        s.lantern = { x0: hx - 6, x1: hx + 9, y0: gy + 2, y1: gy + 18 };
        // the ferryman's hut and the marsh folk, well back
        s.timber = hut(w, 222, 14, g);
        stile(w, 216, g);
        s.villagers = villagers(w, 224, 234, 3, () => g - 1);
        s.lit = true;
      },

      script(w, s) {
        // the ferryman keeps his lantern trimmed, until water puts it out for good
        if (s.lit) {
          for (const i of s.flame) {
            const t = w.type[i];
            if (t === ID.WATER || t === ID.STEAM) { s.lit = false; s.say.push({ eyebrow: 'The ferryman', name: 'Hey! My lantern!', how: 'He’ll relight it at dusk. The gas is safe for now.' }); break; }
            if (t === ID.EMPTY) { w.place(i, ID.FIRE); w.data[i] = 40; }
          }
        }
        if (s.t % 20 === 0) {
          s.h = countIn(w, s.bell, [ID.EL_H]);
          s.glassLeft = countIn(w, s.bellBox, [ID.GLASS]);
          if (!s.fizz && w.counts[ID.EL_H] > 0) { s.fizz = true; s.say.push({ eyebrow: 'The spring', name: 'It fizzes', how: 'Hydrogen is rising into the bell.' }); }
          // a flame among the gas: it goes up all at once
          if (!s.boom && s.lit) {
            const z = s.lantern;
            for (let y = z.y0; y <= z.y1 && !s.boom; y++) for (let x = z.x0; x <= z.x1; x++) {
              if (w.type[w.idx(x, y)] === ID.EL_H) { s.boom = true; break; }
            }
            if (s.boom) { s.say.push({ eyebrow: 'Bang', name: 'The hydrogen caught', how: 'The flame ran back down into the bell.' }); w.explode(158, s.bell.y0 + 10, 14, 2.2, 0); }
          }
        }
        if (s.t === 4 * SEC) s.say.push({ eyebrow: 'Saltmarsh', name: 'The ferryman’s lantern is lit', how: 'Right above the hole in the bell.' });
      },

      goals: [
        {
          id: 'gas', main: true, text: 'Fill the gasholder',
          eval(w, s) {
            const have = s.h || 0, want = 100;
            return { met: have >= want && !s.boom, progress: Math.min(1, have / want), value: `${have} / ${want} hydrogen` };
          },
        },
        {
          id: 'calm', keep: true, text: 'No flame ever reaches the gas',
          eval(w, s) { return { holds: !s.boom, value: s.boom ? 'bang' : 'safe' }; },
        },
        beforeBell('swift', 'Filled before the tide turns', 120),
      ],
      fail(w, s) {
        if (s.boom && s.t % 60 === 0) return this.failText;
        return null;
      },
    },

    {
      id: 'pumphouse',
      num: 'VI',
      title: 'The Pumphouse',
      place: 'Oilbeck',
      blurb: 'An oil seep, a broken pipeline, and a depot on the hill that must be full by moonrise.',
      size: [320, 180],
      sky: 'dusk',
      weather: { mode: 'natural', wind: 0, ambient: 14 },
      rules: {},
      pouch: [
        { kind: 'element', key: 'pipe', n: 320 },
        { kind: 'element', key: 'battery', n: 2 },
        { kind: 'element', key: 'switch', n: 2 },
        { kind: 'element', key: 'wire', n: 80 },
      ],
      intro: {
        body: [
          'Oil seeps out of the ground at Oilbeck, black and slow, into a stone sump by the old pumphouse. Your master has built a fuel depot on the hill across the ravine, a great iron tank, and laid a pipeline to it. They didn’t finish: the pipe stops at the edge of the ravine and starts again on the far side, and the pump’s battery is gone.',
          'Down in the ravine, right under the gap, the smith of Oilbeck has her forge going. “Your master said not to worry,” she says. “Said nobody would be fool enough to pump oil through half a pipe.”',
        ],
        task: 'Fill the depot tank on the hill with oil: 400 measures. Mend the pipeline across the ravine, then power the pump at the sump and the valve on the tank.',
      },
      guide: [
        {
          title: 'Mend the pipeline', use: ['pipe'],
          note: 'Draw Pipe across the gap in one stroke, from one open end to the other. Drawn onto old pipe, it joins it.',
          at: (w, s) => ({ x0: s.gapRow.x0 - 5, x1: s.gapRow.x1 + 5, y0: s.gapRow.y - 5, y1: s.gapRow.y + 5 }),
          done: (w, s) => countIn(w, { x0: s.gapRow.x0, x1: s.gapRow.x1, y0: s.gapRow.y, y1: s.gapRow.y }, [ID.PIPE]) >= s.gapRow.x1 - s.gapRow.x0 - 2,
        },
        {
          title: 'Power the pump', use: ['battery', 'switch'],
          note: 'The pump’s wire comes up at this post. Put a battery on top of it (a switch between them lets you choose when).',
          at: (w, s) => ({ x0: s.post.x - 5, x1: s.post.x + 5, y0: s.post.y - 6, y1: s.post.y + 3 }),
          done: (w, s) => countIn(w, { x0: s.post.x - 3, x1: s.post.x + 3, y0: s.post.y - 4, y1: s.post.y + 1 }, [ID.BATTERY]) > 0,
        },
        {
          title: 'Open the valve', use: ['battery'],
          note: 'The tank’s valve only opens with current. Put a battery on the post beside the depot.',
          at: (w, s) => ({ x0: s.post2.x - 5, x1: s.post2.x + 5, y0: s.post2.y - 6, y1: s.post2.y + 3 }),
          done: (w, s) => countIn(w, { x0: s.post2.x - 3, x1: s.post2.x + 3, y0: s.post2.y - 4, y1: s.post2.y + 1 }, [ID.BATTERY]) > 0,
        },
      ],
      outro: {
        title: 'Fuel for the Depot',
        body: [
          'Oil gurgles up the pipe, along the ravine and up the hill, and the depot tank’s gauge creeps up as the moon does. The smith comes up from the ravine, sniffs the pipeline the whole way along it, finds not a drop, and shakes your hand with a hand like a vice.',
        ],
        found: 'Chalked inside the depot’s door:',
        page: [
          'Pump, pipe, valve, tank: a ship is plumbing with a fire at one end. You will need to fill one yourself before long.',
          'Stones are falling at the observatory at Skywatch, more every night, all from the same corner of the sky. The astronomer thinks they come from the moon. I think she is right. I have gone to look through her telescope, if there is a telescope left.',
        ],
        sign: '— O.',
      },
      part: 'A depot tank of oil on the hill, and a pipeline that doesn’t leak.',
      failText: 'Oil poured out of the open pipe onto the forge. The ravine went up in flames.',

      build(w, s) {
        const { W, H } = w;
        const k = K.kit(w);
        const { part, facing, holding, pipe } = k;
        const n = noise1();
        const ROCK = [0x6a5d52, 0x5f544a, 0x74665a];
        // the ground: the sump's shelf on the left, a deep ravine, the depot hill on the right
        const ground = new Int32Array(W);
        for (let x = 0; x < W; x++) {
          let gtop = 132 + Math.round(n(x) * 2);
          if (x >= 116 && x <= 172) gtop = 132 + Math.round(30 * Math.sin(((x - 116) / 56) * Math.PI)); // the ravine
          if (x > 186) gtop = Math.max(102, 132 - Math.round((x - 186) * 0.9));                       // the hill
          ground[x] = gtop;
          strata(w, x, gtop, [[ID.DIRT, 3, [0x5c4b3b, 0x524334]], [ID.STONE, 60, ROCK]]);
        }
        K.grassOver(w, 0, 110, 0.6);
        K.grassOver(w, 190, 319, 0.5);
        // the sump: a stone basin of oil, fed by the seep, with the pump on its floor facing up
        const s0 = 18, s1 = 74, sb = 158;
        rect(w, s0, 120, s1, sb + 2, ID.STONE);
        rect(w, s0 + 2, 120, s1 - 2, sb, ID.EMPTY);
        rect(w, s0 + 2, 136, s1 - 2, sb, ID.OIL);
        // a slim pipeline (a bore one cell wide), so it doesn't swallow the whole sump before the tank
        // sees a drop; the pump is as wide as the pipe and its walls
        const r2 = 0, pw = 1;
        const pc = 46, pumpTop = sb - 3;
        part(pc - pw, pumpTop, pc + pw, sb, ID.PUMP, facing(0));
        s.sump = { x0: s0 + 2, x1: s1 - 2, top: 136, sb };
        // the pumphouse over the sump (the riser goes up through its roof)
        rect(w, 30, 104, 31, 119, ID.BRICK); rect(w, 62, 104, 63, 119, ID.BRICK); rect(w, 28, 102, 65, 103, ID.BRICK);
        paintBox(w, 28, 102, 65, 119, ID.BRICK, [0x8a4b31, 0x7e452d]);
        // the pipeline: straight up out of the sump (a pump's push only lifts so far, so it climbs first),
        // then high along over the ravine, open at its edge, and down into the depot
        const py = 74;
        pipe([[pc, pumpTop - 1 - r2], [pc, py], [112, py]], r2, [[112, py, r2]]);
        // the far side: from the ravine's other edge, along and up the hill to the tank's valve
        const t0 = 262, t1 = 284, tTop = 82, tBot = 89;
        const vc = (t0 + t1) >> 1;
        part(t0, tTop, t1, tBot, ID.TANK);
        part(vc - pw, tTop - 4, vc + pw, tTop - 1, ID.VALVE);
        pipe([[176, py], [vc, py], [vc, tTop - 5]], r2, [[176, py, r2]]);
        // each broken end is open only straight ahead, so new pipe drawn on from there seals onto it
        for (const ex of [112, 176]) for (const dx of [-1, 0, 1]) for (const dy of [-1, 1]) {
          const i = w.idx(ex + dx, py + dy);
          if (w.type[i] !== ID.PIPE) w.place(i, ID.CASING);
        }
        s.tank = { x0: t0, x1: t1, y0: tTop, y1: tBot };
        // the tank's stand
        rect(w, t0 + 1, tBot + 1, t0 + 2, ground[t0 + 1] - 1, ID.METAL); rect(w, t1 - 2, tBot + 1, t1 - 1, ground[t1 - 1] - 1, ID.METAL);
        // the pump's wire: from the pump's foot down through the floor, under the sump, and up to a
        // post on the shelf beside the pumphouse
        rect(w, pc - 1, sb + 1, pc + 1, sb + 4, ID.WIRE);
        rect(w, pc - 1, sb + 4, 86, sb + 6, ID.WIRE);
        rect(w, 84, ground[85] - 4, 86, sb + 6, ID.WIRE);
        s.post = { x: 85, y: ground[85] - 5 };
        // the valve's wire: down the tank stand to a post beside the depot
        rect(w, vc + pw + 1, tTop - 4, vc + pw + 1, tTop - 1, ID.WIRE);
        rect(w, vc + pw + 1, tTop - 1, 296, tTop - 1, ID.WIRE);
        rect(w, 296, tTop - 1, 296, ground[296] - 4, ID.WIRE);
        s.post2 = { x: 296, y: ground[296] - 5 };
        s.gapRow = { x0: 113, x1: 175, y: py };
        // the forge in the ravine, right under the gap, and the smith beside it
        const fy = ground[144];
        rect(w, 136, fy - 6, 152, fy - 1, ID.BRICK);
        rect(w, 139, fy - 6, 149, fy - 4, ID.COAL);
        s.forge = [];
        for (let x = 139; x <= 149; x++) s.forge.push(w.idx(x, fy - 7));
        s.ravine = { x0: 116, x1: 172, y0: 60, y1: 170 };
        K.person(w, 158, ground[158]);
        s.villagers = 1;
        s.OIL = ID.OIL;
      },

      script(w, s) {
        // the forge stays lit
        if (s.t % 4 === 0) for (const i of s.forge) if (w.type[i] === ID.EMPTY && Math.random() < 0.3) { w.place(i, ID.FIRE); w.data[i] = 20; }
        // the seep keeps the sump topped up
        if (s.t % 6 === 0) {
          const x = s.sump.x0 + 2 + ((Math.random() * (s.sump.x1 - s.sump.x0 - 4)) | 0);
          for (let y = s.sump.top - 6; y < s.sump.sb; y++) { const i = w.idx(x, y); if (w.type[i] === ID.EMPTY && w.type[i + w.SW] !== ID.EMPTY) { w.place(i, ID.OIL); break; } }
        }
        if (s.t % 20 === 0) {
          let oil = 0;
          const z = s.tank;
          for (let y = z.y0; y <= z.y1; y++) for (let x = z.x0; x <= z.x1; x++) { const i = w.idx(x, y); if (w.type[i] === ID.TANK && w.aux[i] === ID.OIL) oil += w.data[i]; }
          s.oil = oil;
          // oil spilt in the ravine: the thing the smith was afraid of
          s.spilt = countIn(w, s.ravine, [ID.OIL]);
          if (!s.warned && s.spilt > 4) { s.warned = true; s.say.push({ eyebrow: 'The smith', name: 'Oil in the ravine!', how: 'It’s pouring out of the gap onto my forge!' }); }
        }
        if (s.t === 4 * SEC) s.say.push({ eyebrow: 'Oilbeck', name: 'The moon is rising', how: 'The depot should be full by the time it clears the hill.' });
      },

      goals: [
        {
          id: 'fuel', main: true, text: 'Fill the depot tank',
          eval(w, s) {
            const have = s.oil || 0, want = 400;
            return { met: have >= want, progress: Math.min(1, have / want), value: `${have} / ${want}` };
          },
        },
        {
          id: 'clean', keep: true, text: 'Not a drop in the ravine',
          eval(w, s) { return { holds: !(s.spilt > 4), value: s.spilt > 4 ? 'spilt' : 'clean' }; },
        },
        beforeBell('swift', 'Full by moonrise', 150),
      ],
      fail(w, s) { return w.counts[ID.HUMAN] < 1 ? this.failText : null; },
    },

    {
      id: 'skywatch',
      num: 'VII',
      title: 'Falling Stars',
      place: 'Skywatch observatory',
      blurb: 'Stones falling out of a clear sky, and a telescope that has to stay open.',
      size: [320, 180],
      sky: 'night',
      weather: { mode: 'natural', wind: 0, ambient: 10 },
      rules: {},
      pouch: [
        { kind: 'element', key: 'sand', n: 500 },
        { kind: 'element', key: 'lime', n: 500 },
        { kind: 'element', key: 'water', n: 400 },
        { kind: 'element', key: 'switch', n: 1 },
      ],
      intro: {
        body: [
          'Skywatch is a village of stargazers on a bare hill, and for a month stones have been falling on it out of a clear sky, three at a time, every half a minute, all from the same corner of the heavens. The astronomer, Ilse, has worked out when the next showers come.',
          '“Your master stood at my telescope all last night,” she says, “and left at dawn, very pale. I have to see what they saw. The dome’s shutter closes with that switch. Close it when they fall and open it between, or I lose the lens; and the cottages have nothing over them but slate.”',
        ],
        task: 'Get through three meteor showers. Close the observatory’s shutter while the stones fall and open it between them, so Ilse can watch the sky for 30 seconds in all, and roof the cottages so nobody is hurt.',
      },
      guide: [
        {
          title: 'Roof the cottages', use: ['sand', 'lime'], makes: 'concrete',
          note: 'Pour sand into the trays on the roofs, then lime over it. It turns to cement and sets into concrete.',
          at: (w, s) => ({ x0: s.huts[0].tray.x0 - 2, x1: s.huts[2].tray.x1 + 2, y0: s.huts[0].tray.y0 - 4, y1: s.huts[0].tray.y1 + 15 }),
          done: (w, s) => s.t >= s.waves[0] || s.huts.reduce((n, h) => n + countIn(w, h.tray, [ID.CONCRETE, ID.CEMENT]), 0) >= 150,
        },
        {
          title: 'Shut the dome for each shower', use: ['switch'],
          note: 'When Ilse calls, select Switch and click the switch by the door: the shutter slides over the slit. Click again after the shower to open it.',
          at: (w, s) => ({ x0: s.slit.x0 - 6, x1: s.switchAt.x + 4, y0: s.slit.y0 - 10, y1: s.switchAt.y + 4 }),
          done: (w, s) => s.t > s.waves[2] + 4 * SEC,
        },
        {
          title: 'Let Ilse watch', use: [],
          note: 'Leave the shutter open now, so Ilse can watch the sky: 30 seconds in all.',
          at: (w, s) => ({ x0: s.slit.x0 - 6, x1: s.slit.x1 + 6, y0: s.slit.y0 - 10, y1: s.lens.y1 + 4 }),
          done: (w, s) => goalMet(s, 'watch'),
        },
      ],
      outro: {
        title: 'What the Telescope Saw',
        body: [
          'After the third shower the sky goes quiet. Ilse watches until her eye waters, then steps back and lets you look. On the moon’s dark face, a light blinks: long, short, long. And far nearer, on the high plateau beyond the valley, something tall and metal stands in a cradle of scaffolding, with men swarming over it.',
          '“That is a ship,” says Ilse. “And the stones have all been falling from where that light is. Something up there does not want it to come.”',
        ],
        found: 'Pinned to the telescope’s eyepiece, a page torn from your master’s notebook:',
        page: [
          'The stones are aimed. Whoever signals from the moon has been knocking down every ship this valley has ever started, for a hundred years. I need a heart that never goes out, to power a ship that can’t be stopped.',
          'There is one under the mountain: the old uranium seam. It is waking, and the town over it is shaking. I am going down to put it to work.',
        ],
        sign: '— O.',
      },
      part: 'Ilse’s star chart, with the launch plateau marked.',
      failText: 'A stone came through the open dome and smashed the telescope’s lens.',

      build(w, s) {
        const { W, H } = w;
        const k = K.kit(w);
        const n = noise1();
        const g = 140, hillTop = 112;
        const ROCK = [0x55585e, 0x5e6168, 0x4d5056];
        const ground = new Int32Array(W);
        for (let x = 0; x < W; x++) {
          ground[x] = x < 170 ? g + Math.round(n(x) * 1.5) : Math.max(hillTop, g - Math.round((x - 170) * 0.7));
          strata(w, x, ground[x], [[ID.DIRT, 3, [0x4d4438, 0x463e33]], [ID.STONE, 60, ROCK]]);
        }
        K.grassOver(w, 0, 319, 0.7);
        // three cottages with flat slate roofs and a tray round each for whatever you can pour on top
        s.huts = []; s.villagers = 0;
        for (const hx of [22, 70, 118]) {
          const x0 = hx, x1 = hx + 26, top = g - 15;
          rect(w, x0, top, x0 + 1, g - 1, ID.STONE); rect(w, x1 - 1, top, x1, g - 1, ID.STONE);
          rect(w, x0 - 1, top, x1 + 1, top, ID.STONE);                     // the slate roof
          rect(w, x0 - 1, top - 7, x0 - 1, top - 1, ID.STONE); rect(w, x1 + 1, top - 7, x1 + 1, top - 1, ID.STONE); // the tray's lips
          rect(w, x0 + 2, top + 1, x1 - 2, g - 1, ID.EMPTY);
          paintBox(w, x0 - 1, top - 7, x1 + 1, g - 1, ID.STONE, [0x6a6e76, 0x737781]);
          rect(w, x0 + 3, g - 9, x0 + 5, g - 7, ID.GLASS);                  // a window
          s.villagers += villagers(w, x0 + 6, x1 - 3, 2, () => g - 1);
          s.huts.push({ x: (x0 + x1) >> 1, roof: top - 1, tray: { x0, x1, y0: top - 7, y1: top - 1 } });
        }
        // the observatory on the hill: a brick dome with a slit in its roof, and a shutter of two iron
        // plates on sticky pistons that close the slit when powered. The telescope stands to one side
        // of the slit and looks out through it at a slant, the way the stones come in.
        const d0 = 214, d1 = 286, roof = 70, slit0 = 244, slit1 = 262, rb = roof + 4;
        rect(w, d0, roof, d0 + 2, hillTop - 1, ID.BRICK); rect(w, d1 - 2, roof, d1, hillTop - 1, ID.BRICK);
        rect(w, d0, roof, d1, rb, ID.BRICK);
        for (let k2 = 1; k2 <= 8; k2++) rect(w, d0 + k2 * 4, roof - k2, d1 - k2 * 4, roof - k2, ID.BRICK); // the dome
        rect(w, d0 + 3, rb + 1, d1 - 3, hillTop - 1, ID.EMPTY);
        rect(w, slit0, roof - 8, slit1, rb, ID.EMPTY);                       // the slit, through dome and roof
        paintBox(w, d0, roof - 8, d1, hillTop - 1, ID.BRICK, [0x9a8e7e, 0x8f8474, 0xa49888]);
        const STICKY = 4;
        k.part(slit0 - 14, roof, slit0 - 11, rb, ID.PISTON, (i) => { w.aux[i] = 1 | STICKY; w.sap[i] = 0; });  // pushes right
        k.part(slit1 + 11, roof, slit1 + 14, rb, ID.PISTON, (i) => { w.aux[i] = 3 | STICKY; w.sap[i] = 0; });  // pushes left
        rect(w, slit0 - 10, roof, slit0 - 1, rb, ID.METAL);                 // the plates, drawn back
        rect(w, slit1 + 1, roof, slit1 + 10, rb, ID.METAL);
        // a rail down the middle of the slit that each plate closes against, so the two never shove
        // (or, sticky, drag back) each other
        const mid = (slit0 + slit1) >> 1;
        rect(w, mid, roof, mid, rb, ID.WALL);
        paintBox(w, mid, roof, mid, rb, ID.WALL, [0x6e655a, 0x645c52]);
        s.slit = { x0: slit0, x1: slit1, y0: roof, y1: rb };
        // the telescope: a glass lens on an iron stand, below and to the west of the slit
        const ly = 100;
        rect(w, 230, ly, 240, ly + 1, ID.GLASS);
        s.lens = { x0: 230, x1: 240, y0: ly, y1: ly + 1 };
        s.lens0 = 22;
        s.aim = 235;
        rect(w, 233, ly + 2, 237, hillTop - 5, ID.METAL);
        rect(w, 229, hillTop - 4, 241, hillTop - 1, ID.METAL);
        K.person(w, 252, hillTop);
        s.villagers += 1;
        // the shutter's battery and switch outside the door, wired through the walls up to the roof.
        // Current takes seconds to run that far, and the far piston would lag the near one, so each
        // piston has a battery of its own in the roof and a relay switch between them that follows
        // the door switch at once (see the script): both plates move together.
        const bx = 290, by = ground[290];
        rect(w, bx, by - 4, bx + 2, by - 1, ID.BATTERY);
        k.part(bx - 3, by - 3, bx - 1, by - 1, ID.SWITCH, k.switched(0));
        s.switchAt = { x: bx - 2, y: by - 2 };
        s.door = w.idx(bx - 2, by - 2);
        rect(w, bx - 4, by - 2, bx - 4, by - 2, ID.WIRE);
        rect(w, bx - 4, by - 2, bx - 4, by + 1, ID.WIRE);
        rect(w, d0 + 1, by + 1, bx - 4, by + 1, ID.WIRE);                    // under the hill, west
        rect(w, d0 + 1, rb + 1, d0 + 1, by + 1, ID.WIRE);                    // up the west wall
        rect(w, d0 + 1, rb + 1, slit0 - 17, rb + 1, ID.WIRE);                // under the roof to the west battery
        rect(w, slit1 + 16, rb + 1, d1 - 1, rb + 1, ID.WIRE);                // and from the east wall to the east one
        rect(w, d1 - 1, rb + 1, d1 - 1, by + 1, ID.WIRE);
        rect(w, d1 - 1, by + 1, bx - 4, by + 1, ID.WIRE);
        rect(w, slit0 - 17, roof, slit0 - 16, rb, ID.BATTERY);              // battery | relay | piston, west
        k.part(slit0 - 15, roof, slit0 - 15, rb, ID.SWITCH, k.switched(0));
        rect(w, slit1 + 16, roof, slit1 + 17, rb, ID.BATTERY);              // piston | relay | battery, east
        k.part(slit1 + 15, roof, slit1 + 15, rb, ID.SWITCH, k.switched(0));
        s.relays = [];
        for (let y = roof; y <= rb; y++) s.relays.push(w.idx(slit0 - 15, y), w.idx(slit1 + 15, y));
        s.dome = { x0: d0, x1: d1, y0: roof - 10, y1: hillTop };
        s.waves = [35, 70, 105].map((t) => t * SEC);
        s.stones = [];
        s.watch = 0;
      },

      script(w, s) {
        // the relays in the roof follow the door switch
        const on = w.type[s.door] === ID.SWITCH ? w.aux[s.door] : 0;
        for (const i of s.relays) if (w.type[i] === ID.SWITCH && w.aux[i] !== on) w.aux[i] = on;
        flyStones(w, s);
        const metalIn = countIn(w, s.slit, [ID.METAL, ID.ROD]);
        s.open = metalIn < 8;
        const falling = s.stones.length > 0;
        s.lensLeft = countIn(w, s.lens, [ID.GLASS]);
        if (s.open && !falling && s.lensLeft >= s.lens0 * 0.5) s.watch++;
        for (const T of s.waves) {
          if (s.t === T - 6 * SEC) s.say.push({ eyebrow: 'Ilse', name: 'Stones in the east!', how: 'Close the dome. They will be here in a few seconds.' });
          // the shower: one stone at the dome, two at the cottages, a moment apart
          if (s.t === T) throwStone(w, s, s.aim, s.lens.y0);
          if (s.t === T + 30 || s.t === T + 60) {
            const h = s.huts[(Math.random() * s.huts.length) | 0];
            throwStone(w, s, h.x + ((Math.random() * 7) | 0) - 3, h.roof);
          }
          if (s.t === T + 4 * SEC) s.say.push({ eyebrow: 'Ilse', name: 'It’s passed', how: s.waves.indexOf(T) < 2 ? 'Open the dome! I need to see.' : 'That was the last. Open up and let me look.' });
        }
        if (s.t === 3 * SEC) s.say.push({ eyebrow: 'Skywatch', name: 'The first shower is half a minute away', how: 'The cottages’ roofs are only slate.' });
      },

      goals: [
        {
          id: 'watch', main: true, text: 'Watch the sky for 30 seconds',
          eval(w, s) {
            const done = s.t > s.waves[2] + 4 * SEC;
            const want = 30 * SEC;
            return { met: done && s.watch >= want, progress: Math.min(1, s.watch / want), value: `${Math.floor(s.watch / SEC)} s${s.open ? ' · open' : ' · shut'}` };
          },
        },
        nobodyHurt('safe', 'Nobody in Skywatch is hurt'),
        {
          id: 'lens', keep: true, text: 'Not a scratch on the lens',
          eval(w, s) { return { holds: (s.lensLeft ?? s.lens0) >= s.lens0, value: `${s.lensLeft ?? s.lens0} / ${s.lens0}` }; },
        },
      ],
      fail(w, s) { return (s.lensLeft ?? s.lens0) < s.lens0 * 0.5 ? this.failText : null; },
    },

    {
      id: 'deepdown',
      num: 'VIII',
      title: 'The Sleeping Heart',
      place: 'Deepdown power station',
      blurb: 'The uranium heart under the mountain is waking, and its keeper is broken.',
      size: [320, 180],
      sky: 'dusk',
      weather: { mode: 'natural', wind: 0, ambient: 12 },
      rules: {},
      pouch: [
        { kind: 'element', key: 'wire', n: 30 },
        { kind: 'element', key: 'switch', n: 1 },
      ],
      intro: {
        body: [
          'Deepdown lives on the heart: a low core of uranium in a concrete vessel, cut into sections with hafnium columns between them. Its heat comes up through a diamond plate to a strip of tellurium that makes the town’s current. A heat sensor on the plate pushes the columns up into the core when it runs hot, and lets them drop as it cools. It has run itself for forty years.',
          'Tonight the seam it was dug from is waking: more neutrons are coming up out of the rock every minute. And the sensor’s wire has been cut, neatly, with snips. The station keeper looks at you. “Your master was down here this morning,” he says. “Took a lump of the core’s curium for their ship. Said you would fix whatever they broke.”',
        ],
        task: 'Keep the heart from melting, and keep Deepdown lit: 40 seconds of light with the plant running on its own control, the SCRAM switch released.',
      },
      guide: [
        {
          title: 'SCRAM the heart', use: ['switch'],
          note: 'The core is heating up. Select Switch and click the SCRAM switch outside the vessel: the hafnium columns drive into the core.',
          at: (w, s) => ({ x0: s.scramAt.x - 4, x1: s.scramAt.x + 4, y0: s.scramAt.y - 5, y1: s.scramAt.y + 4 }),
          done: (w, s) => !!(s.scrammed || s.mended),
        },
        {
          title: 'Mend the sensor’s wire', use: ['wire'],
          note: 'The heat sensor’s wire runs down inside the vessel’s west wall, and a stretch is gone. Draw Wire into the gap.',
          at: (w, s) => pad(s.gapBox, 4),
          done: (w, s) => !!s.mended,
        },
        {
          title: 'Release the SCRAM', use: ['switch'],
          note: 'Click the SCRAM switch again. Now the plant pushes its columns in by itself whenever it runs hot, and the town stays lit.',
          at: (w, s) => ({ x0: s.scramAt.x - 4, x1: s.scramAt.x + 4, y0: s.scramAt.y - 5, y1: s.scramAt.y + 4 }),
          done: (w, s) => goalMet(s, 'lit') || (s.mended && !s.scrammed && s.lit > 3 * SEC),
        },
      ],
      outro: {
        title: 'The Heart Keeps Time',
        body: [
          'The columns rise and fall in the core like a slow breath, and the lamps of Deepdown burn steady. The keeper sits down for the first time in a day and puts his feet on the console. “Forty years,” he says. “And it took a stranger with a reel of wire.”',
        ],
        found: 'Stuck to the snipped end of the wire with a blob of solder:',
        page: [
          'Forgive me the wire. I needed to know you could keep a heart, not just stop one. A ship needs a heart that never goes out, and mine is in the hold now: a curium cell against tellurium, warm for a hundred years.',
          'The proving ground is on the high plateau. The stones are falling faster; I can’t wait any more. If you see me go, don’t try to stop me. My first ship is still in the hangar; it never flew. You will see why.',
        ],
        sign: '— O.',
      },
      part: 'A curium power cell, and the knack of keeping a heart.',
      failText: 'The heart ran away. The core slumped into a white-hot puddle at the bottom of its vessel, and Deepdown will be dark for a generation.',

      build(w, s) {
        G.Scenes.reactor(w);
        const U = byKey.el_u.id, HF = byKey.el_hf.id;
        const box = (pred) => {
          let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
          for (let i = 0; i < w.N; i++) {
            if (!pred(w.type[i], i)) continue;
            const x = i % w.SW, y = (i / w.SW) | 0;
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
          return { x0, x1, y0, y1 };
        };
        s.core = box((t) => t === U);
        s.U = U; s.HF = HF;
        s.u0 = countIn(w, s.core, [U]);
        s.ore = [];
        for (let y = s.core.y0; y <= s.core.y1; y++) for (let x = s.core.x0; x <= s.core.x1; x++) { const i = w.idx(x, y); if (w.type[i] === U) s.ore.push(i); }
        s.hf0 = countIn(w, box((t) => t === HF), [HF]);
        // the SCRAM switch is the one that starts off (the breaker on the vessel starts on)
        for (let i = 0; i < w.N; i++) if (w.type[i] === ID.SWITCH && !w.aux[i]) { s.scram = i; break; }
        s.scramAt = { x: s.scram % w.SW, y: (s.scram / w.SW) | 0 };
        // cut the heat sensor's wire inside the vessel wall
        const sensor = box((t) => t === ID.SENSOR);
        const wx = sensor.x0 - 1;
        s.gap = [];
        for (let y = sensor.y1 + 2; y <= sensor.y1 + 11; y++) { const i = w.idx(wx, y); if (w.type[i] === ID.WIRE) { w.place(i, ID.EMPTY); s.gap.push(i); } }
        s.gapBox = { x0: wx, x1: wx, y0: sensor.y1 + 2, y1: sensor.y1 + 11 };
        const gases = ['el_ne', 'el_ar', 'el_kr', 'el_xe', 'el_he'].map((k) => byKey[k].id);
        s.lamps = [];
        for (let i = 0; i < w.N; i++) if (gases.includes(w.type[i])) s.lamps.push(i);
        s.lit = 0; s.hot = 0; s.peak = 0;
      },

      script(w, s) {
        // the waking seam: neutrons come up into the core, more as the minute goes on, unless the
        // hafnium columns are up between its sections to drink them
        if (s.t % 6 === 0) {
          const hf = countIn(w, s.core, [s.HF]);
          const wake = Math.min(1, s.t / (20 * SEC));
          if (Math.random() < 0.6 * wake * Math.max(0, 1 - hf / (s.hf0 * 0.5))) {
            const i = s.ore[(Math.random() * s.ore.length) | 0];
            if (w.type[i] === s.U) w.fireNeutrons(i, 2);
          }
        }
        if (s.t % 30 === 0) {
          let hot = 0;
          const z = s.core;
          for (let y = z.y0; y <= z.y1; y++) for (let x = z.x0; x <= z.x1; x++) { const i = w.idx(x, y); if (w.type[i] === s.U && w.temp[i] > hot) hot = w.temp[i]; }
          s.hot = hot; s.peak = Math.max(s.peak, hot);
          s.uLeft = countIn(w, s.core, [s.U]);
          s.scrammed = w.type[s.scram] === ID.SWITCH && w.aux[s.scram] === 1;
          s.lampsOn = s.lamps.some((i) => w.charge[i]);
          if (s.lampsOn && !s.scrammed) s.lit += 30;
          if (!s.warned && hot > 900) { s.warned = true; s.say.push({ eyebrow: 'The keeper', name: 'It’s running hot!', how: 'SCRAM it! The switch outside the vessel!' }); }
          if (!s.mended && s.gap.every((i) => w.type[i] === ID.WIRE)) { s.mended = true; s.say.push({ eyebrow: 'The keeper', name: 'The sensor’s back on the line', how: 'Release the SCRAM and let her run.' }); }
        }
        if (s.t === 3 * SEC) s.say.push({ eyebrow: 'Deepdown', name: 'The seam is waking', how: 'More neutrons every minute, and the sensor is cut.' });
      },

      goals: [
        {
          id: 'lit', main: true, text: 'Light Deepdown on the plant’s own control',
          eval(w, s) {
            const want = 40 * SEC;
            const value = `${Math.floor(s.lit / SEC)} s${s.scrammed ? ' · SCRAM on' : s.lampsOn ? ' · lit' : ' · dark'}`;
            return { met: s.lit >= want, progress: Math.min(1, s.lit / want), value };
          },
        },
        {
          id: 'cool', keep: true, text: 'The core never melts (1,132°C)',
          eval(w, s) { return { holds: s.peak < 1132, value: `${Math.round(s.hot)}°C` }; },
        },
        beforeBell('swift', 'Lit before the night shift', 150),
      ],
      // the uranium melts at 1,132°C; well past it, the core slumps together and there is no stopping it
      fail(w, s) { return s.hot >= 1350 || (s.uLeft != null && s.uLeft < s.u0 * 0.55) ? this.failText : null; },
    },

    {
      id: 'proving',
      num: 'IX',
      title: 'The Proving Ground',
      place: 'The high plateau',
      blurb: 'Your master’s ship goes up as you arrive. Theirs is not the only ship here.',
      size: [320, 180],
      sky: 'dusk',
      weather: { mode: 'natural', wind: 0, ambient: 8 },
      rules: {},
      pouch: [
        { kind: 'element', key: 'switch', n: 3 },
      ],
      intro: {
        body: [
          'The road to the plateau ends at a canyon. On the far side, in a cradle of scaffolding, your master’s ship stands with steam curling off its tanks. As you come over the rise its engines light.',
          'On this side, by the canyon’s edge, sits the sledge your master tested everything on: a glass cabin on three engines, one to lift and one to push each way, each on its own switch. Chalked on its door: “To get across, you have to fly. Land on the legs.”',
        ],
        task: 'Fly the test sledge across the canyon and land it on the far pad, standing on its legs.',
      },
      guide: [
        {
          title: 'Lift off', use: ['switch'],
          note: 'Select Switch and click the sledge’s middle switch, under the battery: the lift engine fires. Click it again to cut it.',
          at: (w, s) => pad(sledgeBox(w) || s.pad, 3),
          done: (w, s) => { const b = sledgeBox(w); return !!b && b.y1 < s.sledgeFloor - 4; },
        },
        {
          title: 'Fly east', use: ['switch'],
          note: 'Click the left switch to push east, over the canyon. The air brakes slow the sledge whenever its engines are off.',
          at: (w, s) => { const b = sledgeBox(w) || s.pad; return { x0: b.x0 - 3, x1: s.pad.x1, y0: Math.min(b.y0 - 3, s.pad.y - 40), y1: s.pad.y + 2 }; },
          done: (w, s) => { const b = sledgeBox(w); return !!b && (b.x0 + b.x1) / 2 > 200; },
        },
        {
          title: 'Land on the pad', use: ['switch'],
          note: 'Over the pad, cut the lift and let the sledge settle onto its legs.',
          at: (w, s) => ({ x0: s.pad.x0, x1: s.pad.x1, y0: s.pad.y - 30, y1: s.pad.y + 1 }),
          done: (w, s) => goalMet(s, 'land'),
        },
      ],
      outro: {
        title: 'Landed',
        body: [
          'The sledge settles on its legs with a creak, and the engines tick as they cool. Your master’s ship is a speck of flame high above the plateau, then nothing. In the cradle where it stood there is only steam, and a page weighted down with a spanner.',
        ],
        found: 'Under the spanner:',
        page: [
          'I am sorry. The stones were falling faster every night, and I could not wait for you.',
          'My first ship is in the hangar below the plateau. It never flew: I could not see why. You have done everything it needs, one piece at a time, all the way from Millbrook. If you are as good as I think you are, follow me. I will leave a light on.',
        ],
        sign: '— O.',
      },
      part: 'Your master’s last page, and the hangar key.',
      failText: 'The sledge broke up against the rock. The canyon is still there.',

      build(w, s) {
        const { W, H } = w;
        const n = noise1();
        const ROCK = [0x8a5a44, 0x7d5140, 0x93624b, 0x6f4838], PAD = 0x8d8b86;
        // the plateau: a near rim, a deep canyon, a far rim with the landing pad and the launch cradle
        const ground = new Int32Array(W);
        for (let x = 0; x < W; x++) {
          ground[x] = x < 70 ? 128 : x < 236 ? 176 - Math.round(Math.max(0, Math.sin(((x - 70) / 166) * Math.PI)) * 6 + n(x) * 3) : 116;
          strata(w, x, ground[x], [[ID.STONE, 70, ROCK]]);
        }
        rect(w, 4, 127, 60, 127, ID.STONE); paintBox(w, 4, 127, 60, 127, ID.STONE, PAD);
        rect(w, 244, 115, 290, 115, ID.STONE); paintBox(w, 244, 115, 290, 115, ID.STONE, PAD);
        s.pad = { x0: 244, x1: 290, y: 115 };
        // the test sledge: glass cabin, a battery and three switches, a lift engine in the floor and a
        // pushing engine in each wall, all fed from tanks of oil, standing on four legs
        const sx = 20, sy = 127 - 11; // its roof row; the legs stand on the pad (row 127)
        s.sledgeFloor = sy + 8;
        const at = (dx, dy, t, set) => { const i = w.idx(sx + dx, sy + dy); w.place(i, t); if (set) set(i); return i; };
        for (let dx = 0; dx <= 14; dx++) at(dx, 0, ID.GLASS);
        for (let dy = 1; dy <= 4; dy++) { at(0, dy, ID.GLASS); at(14, dy, ID.GLASS); }
        at(7, 1, ID.BATTERY); at(7, 2, ID.BATTERY);
        const off = (i) => { w.aux[i] = 0; };
        s.swLift = at(7, 3, ID.SWITCH, off); s.swEast = at(6, 1, ID.SWITCH, off); s.swWest = at(8, 1, ID.SWITCH, off);
        for (let dx = 1; dx <= 5; dx++) at(dx, 1, ID.WIRE);                 // east engine's wire
        for (let dy = 2; dy <= 4; dy++) at(1, dy, ID.WIRE);
        at(0, 4, ID.WIRE);
        for (let dx = 9; dx <= 13; dx++) at(dx, 1, ID.WIRE);                // west engine's wire
        for (let dy = 2; dy <= 4; dy++) at(13, dy, ID.WIRE);
        at(14, 4, ID.WIRE);
        for (let dy = 4; dy <= 7; dy++) at(7, dy, ID.WIRE);                 // lift engine's wire
        const fuel = (amount) => (i) => { w.aux[i] = ID.OIL; w.data[i] = amount; };
        for (let dy = 5; dy <= 7; dy++) {
          at(0, dy, ID.THRUSTER, (i) => { w.aux[i] = 1; });                // pushes east
          at(14, dy, ID.THRUSTER, (i) => { w.aux[i] = 3; });               // pushes west
          at(1, dy, ID.TANK, fuel(40)); at(13, dy, ID.TANK, fuel(40));
          for (let dx = 3; dx <= 6; dx++) at(dx, dy, ID.TANK, fuel(24));
          for (let dx = 8; dx <= 11; dx++) at(dx, dy, ID.TANK, fuel(24));
        }
        for (let dx = 0; dx <= 14; dx++) at(dx, 8, dx >= 6 && dx <= 8 ? ID.THRUSTER : ID.GLASS, (i) => { if (w.type[i] === ID.THRUSTER) w.aux[i] = 0; });
        for (const dx of [0, 1, 13, 14]) { at(dx, 9, ID.LEGS); at(dx, 10, ID.LEGS); }
        s.legs0 = 8; s.glass0 = countIn(w, { x0: sx, x1: sx + 14, y0: sy, y1: sy + 10 }, [ID.GLASS]);
        // your master's ship in its cradle at the far end, already lit
        const ox = 298, ob = 115;
        rect(w, ox - 2, ob - 40, ox - 2, ob - 1, ID.WOOD); rect(w, ox + 14, ob - 40, ox + 14, ob - 1, ID.WOOD); // the scaffold
        const mk = (x, y, t, set) => { const i = w.idx(x, y); w.place(i, t); if (set) set(i); };
        for (let y = ob - 34; y <= ob - 3; y++) for (let x = ox; x <= ox + 12; x++) {
          const edge = x === ox || x === ox + 12 || y === ob - 34 || y === ob - 3;
          if (y < ob - 34 + (Math.abs(x - ox - 6) >> 1)) continue; // a pointed nose
          if (edge) mk(x, y, ID.METAL);
        }
        for (let x = ox + 1; x <= ox + 11; x++) for (let y = ob - 10; y <= ob - 4; y++) mk(x, y, ID.TANK, fuel(40));
        for (let x = ox + 3; x <= ox + 9; x++) mk(x, ob - 3, ID.THRUSTER, (i) => { w.aux[i] = 0; }); // its engines, in the floor
        mk(ox + 2, ob - 3, ID.BATTERY);                                       // wired straight in: it is going
        mk(ox + 6, ob - 20, ID.GLASS); mk(ox + 5, ob - 19, ID.GLASS); mk(ox + 7, ob - 19, ID.GLASS); // its porthole
        rect(w, ox, ob - 2, ox + 1, ob - 1, ID.STONE); rect(w, ox + 11, ob - 2, ox + 12, ob - 1, ID.STONE); // the cradle's blocks
        s.villagers = 0;
        s.cutscene = true;
      },

      script(w, s) {
        // the opening: your master's ship climbs out of its cradle and away into the dusk
        if (s.cutscene) {
          if (s.t === SEC) s.say.push({ eyebrow: 'The plateau', name: 'Your master’s ship is lifting off', how: 'You are too late to stop it.' });
          let top = w.H; // its engines' row: it is the only thing over there that flies
          for (let y = 0; y < 116 && top === w.H; y++) for (let x = 280; x < w.W; x++) if (w.type[w.idx(x, y)] === ID.THRUSTER) { top = y; break; }
          if (top < 40 || s.t > 20 * SEC) {
            // gone into the sky: clear away all that is left of it
            const z = { x0: 280, x1: 319, y0: 0, y1: 114 };
            for (let y = z.y0; y <= z.y1; y++) for (let x = z.x0; x <= z.x1; x++) {
              const i = w.idx(x, y), t = w.type[i];
              if (t === ID.METAL || t === ID.TANK || t === ID.THRUSTER || t === ID.BATTERY || t === ID.WIRE || t === ID.GLASS || t === ID.SCRAP) w.place(i, ID.EMPTY);
            }
            s.cutscene = false;
            s.flown = s.t;
            s.say.push({ eyebrow: 'The plateau', name: 'Gone', how: 'Now you. Fly the sledge across.' });
          }
          return;
        }
        // the sledge flies with its air brakes out: big canvas flaps that bleed off its speed, so it
        // drifts to a stop and falls no faster than its legs can take (a ship's speed is kept in its
        // engines, so damping theirs slows the whole sledge)
        for (let y = 0; y < w.H; y++) {
          for (let x = 0, i = w.idx(0, y); x < 280; x++, i++) {
            if (w.type[i] !== ID.THRUSTER) continue;
            w.vx[i] *= 0.975; w.vy[i] *= w.vy[i] > 0 ? 0.95 : 0.985;
          }
        }
        if (s.t % 10 === 0) {
          // where the sledge is: its engines carry its speed
          let x0 = w.W, x1 = -1, y1 = -1, vx = 0, vy = 0, n = 0;
          for (let y = 0; y < w.H; y++) for (let x = 0; x < 300; x++) {
            const i = w.idx(x, y);
            if (w.type[i] !== ID.THRUSTER) continue;
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); y1 = Math.max(y1, y); vx += w.vx[i]; vy += w.vy[i]; n++;
          }
          s.engines = n;
          // at rest: it hasn't moved a cell since the last look (a grounded ship keeps a little
          // downward speed that the ground cancels, so its position says more than its speed)
          const pos = `${x0},${y1}`, still = n && pos === s.lastPos;
          s.lastPos = pos;
          const onPad = n && x0 >= s.pad.x0 && x1 <= s.pad.x1 && y1 < s.pad.y;
          s.rest = still && onPad ? (s.rest || 0) + 10 : 0;
          s.scrap = w.counts[ID.SCRAP] + w.counts[ID.SHARDS];
          s.legs = w.counts[ID.LEGS];
        }
      },

      goals: [
        {
          id: 'land', main: true, text: 'Land the sledge on the far pad',
          eval(w, s) {
            const want = 2 * SEC;
            return { met: (s.rest || 0) >= want, progress: s.cutscene ? 0 : Math.min(1, (s.rest || 0) / want), value: s.cutscene ? 'watch' : s.rest ? 'settling' : 'flying' };
          },
        },
        {
          id: 'whole', keep: true, text: 'Not a scratch on the sledge',
          eval(w, s) { return { holds: !(s.scrap > 0), value: s.scrap > 0 ? 'dented' : 'whole' }; },
        },
        beforeBell('swift', 'Across within two minutes', 120),
      ],
      fail(w, s) { return !s.cutscene && s.engines != null && s.engines < 5 ? this.failText : null; },
    },

    {
      id: 'launch',
      num: 'X',
      title: 'The Launch',
      place: 'The hangar under the plateau',
      blurb: 'Your master’s first ship never flew. Five things are wrong with it.',
      size: [320, 180],
      sky: 'night',
      weather: { mode: 'natural', wind: 0, ambient: 6 },
      rules: {},
      pouch: [
        { kind: 'tool', name: 'erase', n: 60 },
        { kind: 'element', key: 'glass', n: 20 },
        { kind: 'element', key: 'battery', n: 2 },
        { kind: 'element', key: 'thruster', n: 6 },
        { kind: 'element', key: 'legs', n: 16 },
        { kind: 'element', key: 'switch', n: 2 },
      ],
      intro: {
        body: [
          'The hangar is a silo cut down into the plateau, open to the sky at the top. In it stands your master’s first ship on its pad, cold, a fuel depot on stilts beside it. You climb into its cabin and sit where the pilot sits, and the light from the moon falls through the hole where its porthole should be.',
          'Your master said they couldn’t see why it never flew. You can. You have mended every one of its faults before, one at a time, from Millbrook to here.',
        ],
        task: 'Make the ship fly, with you in it, and take it up out of the silo into the sky. Before you go: a ship for the moon needs a sealed cabin and legs to stand on.',
      },
      guide: [
        {
          title: 'Seal it and rewire it', use: ['glass', 'tool:erase', 'battery'],
          note: 'Mend the smashed porthole with Glass. Erase the battery on the floor (it touches the iron hull) and put a new one on the shelf against the switch.',
          at: (w, s) => ({ x0: s.hull.x0 - 2, x1: s.hull.x1 + 2, y0: s.hull.top - 7, y1: s.hull.base }),
          done: (w, s) => !!(s.lifted || (s.ready && s.ready[0] && s.ready[1])),
        },
        {
          title: 'Engines and legs', use: ['thruster', 'legs'],
          note: 'Draw Thrusters into the four empty sockets in the floor, facing up (Faces in the panel). Stand Landing legs against both sides of its foot.',
          at: (w, s) => ({ x0: s.hull.x0 - 4, x1: s.hull.x1 + 4, y0: s.hull.base - 4, y1: s.hull.base + 1 }),
          done: (w, s) => !!(s.lifted || (s.ready && s.ready[2] && s.ready[4])),
        },
        {
          title: 'Fuel up and fly', use: ['switch'],
          note: 'Select Switch and click the depot’s switch: fuel runs down the line into the ship. When Fuel aboard comes up, switch it off and click the ship’s switch. The line lets go.',
          at: (w, s) => ({ x0: s.hull.x1 - 1, x1: s.fuelSwitch.x + 4, y0: s.valveOut.y - 6, y1: s.hull.base + 1 }),
          done: (w, s) => !!s.lifted,
        },
      ],
      outro: {
        title: 'Into the Dark',
        body: [
          'The ship climbs out of the silo on a column of flame, and the plateau drops away beneath you: the valley, the river, the field at Millbrook still green, the lighthouse turning on its point. Then the sky turns from blue to black, and the stars come out all at once.',
          'For a long time there is only the hum of the engines and the moon growing in the porthole. On its dark face a light is blinking, long, short, long, the way it has every night since your master left.',
        ],
        found: 'Folded small behind the pilot’s seat, a page in your master’s hand:',
        page: [
          'If you are reading this, you are already flying. I left the table half empty so you would follow.',
          'Bring everything you have learned. Up there the world does not fall the way it does at home, and whoever is calling has been waiting a very long time.',
        ],
        sign: '— O.',
      },
      // the last thing the story says for now, over a dark screen, before the journal's page
      finale: {
        line: 'Below you the valley sleeps, and every light you lit in it is still burning. Ahead, the moon is waiting.',
        soon: 'Coming soon…',
      },
      failText: 'The apprentice didn’t make it.',

      build(w, s) {
        const { W, H } = w;
        const k = K.kit(w);
        const ROCK = [0x8a5a44, 0x7d5140, 0x93624b, 0x6f4838], CONC = [0x9b9a95, 0x8f8e89];
        // the plateau, with the silo cut down into it
        const top = 40, floor = 167;
        rect(w, 0, top, W - 1, H - 1, ID.STONE);
        paintBox(w, 0, top, W - 1, H - 1, ID.STONE, ROCK);
        rect(w, 120, top, 250, floor - 1, ID.EMPTY);                        // the hangar
        rect(w, 120, floor, 250, floor, ID.CONCRETE); paintBox(w, 120, floor, 250, floor, ID.CONCRETE, CONC);
        // the ship: an iron hull 15 wide with a nose, standing on the pad
        const x0 = 150, x1 = 164, base = floor - 1, hullTop = base - 26;
        s.shipBox = { x0: x0 - 4, x1: x1 + 4, y0: hullTop - 8, y1: base };
        s.hull = { x0, x1, top: hullTop, base };
        rect(w, x0, hullTop, x1, base, ID.METAL);
        rect(w, x0 + 1, hullTop + 1, x1 - 1, base - 1, ID.EMPTY);
        for (let q = 1; q <= 6; q++) rect(w, x0 + q, hullTop - q, x1 - q, hullTop - q, ID.METAL);
        paintBox(w, x0, hullTop - 6, x1, base, ID.METAL, [0x9aa0a8, 0x8f959d]);
        // the engines in the floor: two fitted, four sockets empty
        const thr = (x) => { const i = w.idx(x, base); w.place(i, ID.THRUSTER); w.aux[i] = 0; };
        thr(x0 + 4); thr(x0 + 5);
        rect(w, x0 + 6, base, x0 + 9, base, ID.EMPTY);
        s.sockets = [6, 7, 8, 9].map((d) => w.idx(x0 + d, base));
        // the tank over them (empty), and its fuel port out through the starboard side
        k.part(x0 + 5, base - 6, x1 - 4, base - 1, ID.TANK);
        k.pipe([[x1 - 3, base - 4], [x1 + 2, base - 4]], 0, [[x1 + 2, base - 4, 0]]);
        for (const dx of [-1, 0, 1]) for (const dy of [-1, 1]) { const i = w.idx(x1 + 2 + dx, base - 4 + dy); if (w.type[i] !== ID.PIPE) w.place(i, ID.CASING); } // open only straight ahead
        s.port = { x: x1 + 2, y: base - 4 };
        // the shelf with the switch and its wire down to the engines; the battery belongs on the
        // shelf against the switch, but it has been left on the floor against the hull
        rect(w, x0 + 3, base - 12, x0 + 8, base - 12, ID.GLASS);
        k.part(x0 + 5, base - 14, x0 + 5, base - 13, ID.SWITCH, k.switched(0));
        rect(w, x0 + 6, base - 13, x0 + 6, base - 12, ID.WIRE);
        rect(w, x0 + 4, base - 11, x0 + 6, base - 11, ID.WIRE);
        rect(w, x0 + 4, base - 11, x0 + 4, base - 1, ID.WIRE);
        rect(w, x0 + 1, base - 2, x0 + 1, base - 1, ID.BATTERY);
        s.shelf = { x0: x0 + 3, x1: x0 + 4, y0: base - 14, y1: base - 13 };
        // the smashed porthole, its shards on the shelf
        rect(w, x0, hullTop + 4, x0, hullTop + 6, ID.EMPTY);
        s.porthole = [hullTop + 4, hullTop + 5, hullTop + 6].map((y) => w.idx(x0, y));
        for (let x = x0 + 7; x <= x0 + 8; x++) w.place(w.idx(x, base - 13), ID.SHARDS); // (clear of the wire)
        // you, in the pilot's place on top of the tank
        s.seat = { x: x1 - 3, y: base - 7 };
        w.place(w.idx(x1 - 3, base - 7), ID.HUMAN); w.place(w.idx(x1 - 3, base - 8), ID.HEAD);
        s.villagers = 1;
        // the fuel depot on concrete stilts, its valve wired to a switch at its foot
        const t0 = 205, t1 = 225, tt = 104, tb = 111, vc = 215;
        k.part(t0, tt, t1, tb, ID.TANK, k.holding(ID.OIL, 40));
        rect(w, t0 + 1, tb + 1, t0 + 2, floor - 1, ID.CONCRETE); rect(w, t1 - 2, tb + 1, t1 - 1, floor - 1, ID.CONCRETE);
        paintBox(w, t0, tb + 1, t1, floor - 1, ID.CONCRETE, CONC);
        k.part(vc, tb + 1, vc, tb + 3, ID.VALVE);                         // a valve under the tank, walled in, open below
        rect(w, vc - 1, tb + 1, vc - 1, tb + 3, ID.CASING); rect(w, vc + 1, tb + 1, vc + 1, tb + 3, ID.CASING);
        s.valveOut = { x: vc, y: tb + 4 };
        k.pipe([[vc, tb + 4], [vc, base - 4], [x1 + 3, base - 4]], 0);           // the fuel line, joined to the port
        rect(w, vc + 1, tb + 2, 230, tb + 2, ID.WIRE);
        rect(w, 230, tb + 2, 230, floor - 4, ID.WIRE);
        k.part(231, floor - 4, 231, floor - 3, ID.SWITCH, k.switched(0));
        rect(w, 232, floor - 4, 233, floor - 1, ID.BATTERY);
        s.fuelSwitch = { x: 231, y: floor - 3 };
        // a workbench, some crates and the hangar's lamps
        rect(w, 124, floor - 7, 140, floor - 7, ID.WOOD); rect(w, 125, floor - 6, 125, floor - 1, ID.WOOD); rect(w, 139, floor - 6, 139, floor - 1, ID.WOOD);
        rect(w, 242, floor - 8, 249, floor - 1, ID.WOOD);
        s.line = 26; // the sky line: past it, the ship is away
        s.phase = 'build';
      },

      script(w, s) {
        if (s.phase === 'build') return launchPad(w, s);
        if (s.phase === 'gone') return flyOff(w);
      },

      goals: [
        {
          id: 'fly', main: true, text: 'Fly for the moon',
          eval(w, s) {
            const n = (s.ready || []).filter(Boolean).length;
            return { met: s.phase === 'gone', progress: s.phase === 'gone' ? 1 : n / 5 * 0.9, value: s.phase === 'gone' ? 'away' : `${n} / 5 ready` };
          },
        },
        nobodyHurt('safe', 'You come to no harm'),
        {
          id: 'whole', keep: true, text: 'Not a scratch on the ship',
          eval(w, s) { return { holds: !s.dented, value: s.dented ? 'dented' : 'whole' }; },
        },
      ],
      fail(w, s) {
        if (s.phase === 'gone') return null; // away: whatever leaves the top of the map has flown
        if (w.counts[ID.HEAD] < 1) return this.failText;
        return s.abort || null;
      },
    },
  ];

  // ───── running a chapter ─────
  // Builds the chapter into a fresh world and returns its state.
  function start(ch, w) {
    w.ambient = ch.weather.ambient;
    w.weather.mode = ch.weather.mode;
    w.weather.wind = ch.weather.wind;
    Object.assign(w.rules, { drySoil: false, births: false, goalX: -1, farming: false }, ch.rules); // nobody plants in a crisis
    w.clear();
    const s = { t: 0, say: [], goals: [], over: null };
    ch.build(w, s);
    s.goals = ch.goals.map((gl) => ({ id: gl.id, text: gl.text, main: !!gl.main, keep: !!gl.keep, met: false, lost: false, progress: 0, value: '' }));
    w.counts.fill(0); // the simulation tallies these each step; the goals need them before the first
    for (let i = 0; i < w.N; i++) w.counts[w.type[i]]++;
    judge(ch, w, s);
    return s;
  }

  function judge(ch, w, s) {
    ch.goals.forEach((gl, k) => {
      const st = s.goals[k], r = gl.eval(w, s);
      st.value = r.value;
      if (gl.main) { st.met = r.met; st.progress = r.progress; }
      else if (!st.lost && !r.holds) st.lost = true;
    });
  }

  // Call once per simulation tick, after the step.
  function update(ch, w, s) {
    if (s.over) return s.over;
    s.t++;
    if (ch.script) ch.script(w, s);
    // a step of the guide done: say so, and what comes next
    if (ch.guide && s.t % 15 === 0) {
      const before = (s.stepsDone || []).slice();
      const r = step(ch, w, s);
      const k = s.stepsDone.findIndex((d, q) => d && !before[q]);
      if (k >= 0 && s.t > SEC) {
        s.say.push({ eyebrow: `Step ${k + 1} of ${r.n} done`, name: ch.guide[k].title, how: r.k >= 0 ? `Next: ${r.step.title.toLowerCase()}. Hint shows you how.` : 'Nearly there.' });
      }
    }
    if (s.t % EVAL_EVERY) return null;
    judge(ch, w, s);
    const reason = ch.fail && ch.fail(w, s);
    if (reason) s.over = { won: false, reason };
    else if (s.goals.filter((g) => g.main).every((g) => g.met)) {
      // one star for the win, one for each star goal kept
      s.over = { won: true, stars: Math.min(3, 1 + s.goals.filter((g) => !g.main && !g.lost).length) };
      if (ch.guide) s.stepsDone = ch.guide.map(() => true); // won: every step of the guide is done
    }
    return s.over;
  }

  G.Story = { chapters, prologue, start, update, step, clock, SEC };
})(globalThis);
