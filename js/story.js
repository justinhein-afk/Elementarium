/* Elementarium — the Apprentice's Journey: story chapters as data.
 * A chapter builds its own world, sets the weather and any bent laws, fills the apprentice's
 * pouch, scripts a few events and judges its goals from the simulation itself. No DOM here,
 * so tools/storytest.js can play the chapters headless. */
(function (G) {
  'use strict';

  const { ID } = G.ELEM;
  const { noise1, fillCol, blob } = G.SceneKit;

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

  // Everything that is on fire right now: flames, embers, and burning matter.
  function burning(w) { return w.counts[ID.FIRE] + w.counts[ID.EMBER] + w.events.burning; }

  function clock(ticks) {
    const s = Math.max(0, Math.ceil(ticks / SEC));
    return `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`;
  }

  // ───── the master's letter ─────
  const prologue = {
    title: 'The Empty Workshop',
    body: [
      'You came back from market to find the Elementarium unlocked and the furnace cold. Your master’s coat was gone from its hook. On the bench lay the table of elements, half its slots still dark, and a letter.',
    ],
    letter: {
      text: [
        'Apprentice —',
        'The rain falls in the wrong places this year. The pines are warm at night. The mountain hums. Something beneath the valley is out of balance, and I have gone to find it.',
        'Do not follow me. Help the valley instead. Everything you need is in the table; the rest you will learn by watching what the world does.',
      ],
      sign: '— O.',
    },
    after: 'You folded the letter into your pocket and took down the travelling pouch.',
  };

  // ───── chapters ─────
  const chapters = [
    {
      id: 'drought',
      num: 'I',
      title: 'The Dry Season',
      place: 'Millbrook',
      blurb: 'No rain since spring. The seed lies in the furrows like gravel.',
      size: [320, 180],
      weather: { mode: 'natural', wind: 1, ambient: 32 },
      rules: { drySoil: true },
      pouch: [
        { kind: 'tool', name: 'heat' },
        { kind: 'element', key: 'fire', n: 300 },
        { kind: 'element', key: 'seed', n: 40 },
      ],
      intro: {
        body: [
          'Millbrook has not seen rain since the spring fair. The furrows have cracked like old pottery and the seed lies in them like gravel. The pond has shrunk to a muddy eye at the bottom of its banks.',
          'The miller remembers your master. “Stood by that pond half the afternoon,” he says. “Said the water wasn’t gone, only resting. Said it has to go up before it can come down.”',
        ],
        task: 'Bring rain to the fields so the crops can sprout. Seeds won’t take in this dust; they need mud.',
      },
      hints: [
        'The miller’s riddle: water has to go up before it can come down. What sends water up?',
        'Select Heat and hold it over the pond. Steam rises, cools high in the sky and gathers into clouds.',
        'A lone wisp of cloud just fades. Keep the steam coming until the clouds crowd together and darken. The breeze carries them east over the fields.',
      ],
      outro: {
        title: 'Rain on Millbrook',
        body: [
          'The first drops hit the dust like thrown coins. By evening the furrows are black with mud and green threads are standing up out of them. Someone starts singing in the square.',
        ],
        found: 'Tucked under the miller’s door, a page in your master’s hand:',
        page: [
          'The water here no longer rises of its own accord. The ground drinks the heat that should lift it. Something below is thirsty.',
          'I am going north to the old pines. Trees feel the ground first.',
        ],
        sign: '— O.',
      },

      build(w, s) {
        const { W, H } = w;
        const n = noise1();
        const g = (x) => Math.round(H * 0.7 + n(x) * 3);
        const p0 = Math.round(W * 0.05), p1 = Math.round(W * 0.27);
        const f0 = Math.round(W * 0.35), f1 = Math.round(W * 0.64);
        const v0 = Math.round(W * 0.7);
        const fieldG = g(f0), villageG = g(Math.round(W * 0.85));
        const ground = new Int32Array(W);
        for (let x = 0; x < W; x++) ground[x] = x >= f0 - 3 && x <= f1 + 3 ? fieldG : x >= v0 - 2 ? villageG : g(x);
        for (let x = 0; x < W; x++) {
          fillCol(w, x, ground[x] + 10, H - 1, ID.STONE);
          fillCol(w, x, ground[x], ground[x] + 9, ID.DIRT);
        }
        // the pond: a steep stone basin, its water sunk well below the rim by the drought
        const pg = Math.min(...Array.from({ length: p1 - p0 + 1 }, (_, k) => ground[p0 + k]));
        for (let x = p0; x <= p1; x++) {
          fillCol(w, x, ground[x], pg + 26, ID.STONE);
          if (x >= p0 + 2 && x <= p1 - 2) {
            fillCol(w, x, ground[x], pg + 23, ID.EMPTY);
            fillCol(w, x, pg + 12, pg + 23, ID.WATER);
          }
        }
        // the field: furrows of seed between two stone curbs that keep the mud in
        curb(w, f0 - 1, fieldG); curb(w, f1 + 1, fieldG);
        for (let x = f0 + 1; x < f1; x += 3) w.place(w.idx(x, fieldG - 1), ID.SEED);
        s.field = { x0: f0, x1: f1, y0: fieldG - 70, y1: fieldG + 4 };
        // the village behind its wall, and the people who live there
        curb(w, v0, villageG);
        hut(w, Math.round(W * 0.75), 14, villageG);
        hut(w, Math.round(W * 0.88), 16, villageG);
        for (const u of [0.31, 0.68]) {
          const tx = Math.round(W * u), tg = ground[tx], h = 14 + ((Math.random() * 6) | 0);
          for (let y = tg - h; y < tg; y++) w.place(w.idx(tx, y), ID.WOOD);
          blob(w, tx, tg - h - 3, 5, 4, ID.PLANT, true);
        }
        s.villagers = villagers(w, v0 + 3, W - 3, 8, (x) => villageG - 1);
      },

      goals: [
        {
          id: 'crops', main: true, text: 'Green the fields',
          eval(w, s) {
            const have = countIn(w, s.field, [ID.PLANT, ID.FLOWER]);
            const want = 1000; // about ten seedlings' worth: long enough to watch the rain land
            return { met: have >= want, progress: Math.min(1, have / want), value: `${Math.min(100, Math.round((have / want) * 100))}%` };
          },
        },
        {
          id: 'safe', keep: true, text: 'No villager comes to harm',
          eval(w, s) {
            const alive = w.counts[ID.HUMAN];
            return { holds: alive >= s.villagers, value: `${Math.min(alive, s.villagers)} / ${s.villagers}` };
          },
        },
        {
          id: 'swift', keep: true, text: 'Rain before the third bell',
          eval(w, s) {
            const limit = 180 * SEC;
            return { holds: s.t <= limit, value: s.t <= limit ? clock(limit - s.t) : 'missed' };
          },
        },
      ],
    },

    {
      id: 'wildfire',
      num: 'II',
      title: 'Wildfire',
      place: 'Hollow End',
      blurb: 'Dry thunder over the old pines, and no rain in it.',
      size: [320, 180],
      weather: { mode: 'natural', wind: 1, ambient: 30 },
      rules: {},
      pouch: [
        { kind: 'tool', name: 'erase', n: 700 },
        { kind: 'element', key: 'water', n: 1500 },
      ],
      intro: {
        body: [
          'North of Millbrook the old pines stand so dry that their needles crackle underfoot. The woodcutters of Hollow End say the forest has been warm to the touch ever since your master walked through it.',
          'Tonight the sky is full of thunder and there is no rain in it. The woodcutters keep looking west.',
        ],
        task: 'When the forest catches, keep the fire out of Hollow End. The rain comes in 30 seconds, and the night is over the moment no fire is left. At least 8 of the 12 woodcutters must survive.',
      },
      hints: [
        'Fire only travels through what can burn. Take that away and it stops.',
        'Use Erase to clear a firebreak across the meadow, right down to bare soil. Make it wide, because flames lean.',
        'Water greens dry grass, and green grass barely burns. Soak your break, or the ground in front of the huts, before the fire arrives, not after.',
      ],
      outro: {
        title: 'The Rain Comes',
        body: [
          'The fire reaches your break, gnaws at its edge and dies there. When the rain finally comes it falls on black stumps to the west and on Hollow End, still standing, to the east.',
        ],
        found: 'Nailed to the woodcutters’ notice board, curling from the heat:',
        page: [
          'The pines are hot at the roots, not the crowns. The heat is coming up through the rock. The mountain is waking.',
          'I am taking the canyon road. If you have followed me this far, learn what cold does to water. You will need it at the gorge.',
        ],
        sign: '— O.',
      },
      failText: 'Too many of the woodcutters were lost. Hollow End will remember this night.',

      build(w, s) {
        const { W, H } = w;
        const n = noise1();
        const v0 = Math.round(W * 0.72), m0 = Math.round(W * 0.58);
        const hills = (x) => Math.round(H * 0.72 + n(x) * H * 0.03);
        const villageG = hills(v0 - 6); // level with the meadow where they meet: no cliff for the fire to stop at
        const ground = new Int32Array(W);
        for (let x = 0; x < W; x++) ground[x] = x >= v0 - 6 ? villageG : hills(x);
        for (let x = 0; x < W; x++) {
          fillCol(w, x, ground[x] + 10, H - 1, ID.STONE);
          fillCol(w, x, ground[x], ground[x] + 9, ID.DIRT);
          // dry grass over everything: the fuse between the forest and Hollow End. Where the ground
          // steps, it climbs the step too, so every blade touches the next one edge to edge.
          const top = Math.min(ground[x], ground[Math.max(0, x - 1)], ground[Math.min(W - 1, x + 1)]);
          for (let y = top - 1; y < ground[x]; y++) w.place(w.idx(x, y), ID.DRYGRASS);
        }
        // the old pines, close enough that their crowns touch
        s.trees = [];
        const tree = (tx) => {
          const tg = ground[tx], h = 22 + ((Math.random() * 14) | 0);
          for (let y = tg - h; y < tg - 1; y++) { w.place(w.idx(tx, y), ID.WOOD); w.place(w.idx(tx + 1, y), ID.WOOD); }
          crown(tx, tg - h - 4, 7 + ((Math.random() * 4) | 0), 6 + ((Math.random() * 3) | 0));
          s.trees.push([tx, tg - h - 10, tg]);
        };
        // needles with air between them: a solid blob would smother its own fire
        const crown = (cx, cy, rx, ry) => {
          for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
            const dx = (x - cx) / rx, dy = (y - cy) / ry;
            if (x < 0 || x >= W || y < 0 || dx * dx + dy * dy > 1 || Math.random() < 0.45) continue;
            const i = w.idx(x, y);
            if (w.type[i] === ID.EMPTY) w.place(i, ID.PLANT);
          }
        };
        for (let tx = 6; tx < m0 - 4; tx += 8 + ((Math.random() * 5) | 0)) tree(tx);
        // Hollow End: a stone stile keeps the woodcutters home (water and grass pass under it),
        // three huts and a woodpile
        for (let y = villageG - 4; y < villageG - 1; y++) w.place(w.idx(v0, y), ID.STONE);
        s.timber = [];
        for (const [u, wd] of [[0.76, 14], [0.84, 13], [0.92, 14]]) s.timber.push(...hut(w, Math.round(W * u), wd, villageG));
        for (let y = villageG - 4; y < villageG - 1; y++) for (let x = v0 + 4; x < v0 + 9; x++) w.place(w.idx(x, y), ID.WOOD);
        s.villagers = villagers(w, v0 + 3, W - 3, 12, () => villageG - 2);
        s.strikeAt = 5 * SEC;
        s.rainAt = 30 * SEC;
        s.endAt = 75 * SEC; // the rain puts out whatever is left long before this
      },

      script(w, s) {
        if (s.t === s.strikeAt) {
          // the bolt hits the pine nearest the meadow and sets the litter at its foot alight
          const [x, y, tg] = s.trees[s.trees.length - 1];
          w.spawnBolt(x, Math.max(0, y - 30), true);
          for (let dx = -4; dx <= 5; dx++) for (let dy = 1; dy <= 3; dy++) {
            const i = w.idx(x + dx, tg - dy);
            if (w.type[i] === ID.DRYGRASS || w.type[i] === ID.WOOD) w.ignite(i);
          }
          s.say.push({ eyebrow: 'Lightning', name: 'The old pines are burning', how: 'The rain is half a minute away. The fire won’t wait for it.' });
        }
        if (s.t === s.rainAt - 8 * SEC) s.say.push({ eyebrow: 'Thunder', name: 'The rain is nearly here', how: 'Hold on a little longer.' });
        if (s.t === s.rainAt) {
          w.weather.mode = 'rain';
          w.ambient = 14;
          s.say.push({ eyebrow: 'At last', name: 'The rain breaks', how: 'Keep the fire off the huts until it is out.' });
        }
      },

      goals: [
        {
          id: 'hold', main: true, text: 'Put the fire out, or hold it until the rain',
          eval(w, s) {
            // won the moment nothing is burning any more, or when the rain has had its say
            const out = s.t > s.strikeAt + SEC && burning(w) === 0;
            const left = s.endAt - s.t;
            const value = out ? 'the fire is out' : s.t < s.strikeAt ? 'waiting' : s.t < s.rainAt ? `rain in ${clock(s.rainAt - s.t)}` : 'raining';
            return { met: out || left <= 0, progress: out ? 1 : Math.min(0.95, s.t / s.rainAt), value };
          },
        },
        {
          id: 'everyone', keep: true, text: 'Every woodcutter survives',
          eval(w, s) {
            const alive = w.counts[ID.HUMAN];
            return { holds: alive >= s.villagers, value: `${Math.min(alive, s.villagers)} / ${s.villagers}` };
          },
        },
        {
          id: 'huts', keep: true, text: 'The huts still stand',
          eval(w, s) {
            let left = 0;
            for (const i of s.timber) if (w.type[i] === ID.WOOD) left++;
            const f = left / s.timber.length;
            return { holds: f >= 0.85, value: `${Math.round(f * 100)}%` };
          },
        },
      ],
      fail(w, s) {
        if (w.counts[ID.HUMAN] < 8) return this.failText;
        let left = 0;
        for (const i of s.timber) if (w.type[i] === ID.WOOD) left++;
        return left < s.timber.length * 0.8 ? 'The fire got into Hollow End and the huts burned.' : null;
      },
    },

    {
      id: 'bridge',
      num: 'III',
      title: 'The Broken Bridge',
      place: 'The canyon road',
      blurb: 'Travellers stranded on the far side of a gorge.',
      size: [320, 180],
      weather: { mode: 'natural', wind: 0, ambient: 1 }, // a raw morning: right at the edge of freezing
      rules: {},
      pouch: [
        { kind: 'element', key: 'water', n: 1500 },
        { kind: 'tool', name: 'cool' },
      ],
      intro: {
        body: [
          'The canyon road ends at a gorge with nothing across it. The rope bridge burned the same night the pines did. Eight travellers sit on their packs at the edge, looking at the inn on the far side.',
          'One of them, a tinker, saw your master pass. “Poured water down there, then breathed frost on it, and walked straight over the top. Never seen the like.”',
        ],
        task: 'Make a way across the gorge so the travellers can reach the inn. They will set off once it is filled almost to the road and its surface is solid enough to stand on. At least 6 of the 8 must reach the far side.',
      },
      hints: [
        'Your master’s page said to learn what cold does to water. The air here is right at freezing; it only needs a push.',
        'Pour water into the gorge until it stands nearly level with the road.',
        'Then sweep the Cool tool across its surface. Water below 0°C freezes into ice, and ice is solid ground.',
      ],
      outro: {
        title: 'Across the Gorge',
        body: [
          'The ice creaks under them, but the travellers cross it in a line, testing each step, and the innkeeper is waiting with the door open. That night the common room is louder than it has been all year.',
        ],
        found: 'Scratched into the inn’s doorframe, at the height your master would write:',
        page: [
          'Water and cold, and from the two of them, ground to stand on. Remember that.',
          'The springs in the foothills are running backwards. I am going down into the old mine to see why.',
        ],
        sign: '— O.',
      },
      failText: 'Too many of the travellers were lost on the way across.',

      build(w, s) {
        const { W, H } = w;
        const g = Math.round(H * 0.45);
        const depth = 38;
        const c0 = Math.round(W * 0.42);       // the near cliff
        const flatEnd = c0 + 14;               // the gorge floor, then the far side climbs a step a column
        const c1 = flatEnd + depth;            // where the far side meets the road again
        for (let x = 0; x < W; x++) {
          const top = x < c0 || x > c1 ? g : x <= flatEnd ? g + depth : g + depth - (x - flatEnd);
          fillCol(w, x, top, H - 1, ID.STONE);
          if (x < c0 - 4 || x > c1 + 4) fillCol(w, x, top, top + 2, ID.DIRT);
        }
        // a trickle of a stream at the bottom of the gorge
        for (let x = c0 + 1; x < flatEnd; x++) w.place(w.idx(x, g + depth - 1), ID.WATER);
        hut(w, Math.round(W * 0.8), 16, g);
        s.far = { x0: c1 + 4, x1: W - 1, y0: 0, y1: H - 1 };
        s.g = g; s.c0 = c0; s.c1 = c1;
        // they camp well back from the edge, and only set off once the way across is safe
        s.travellers = villagers(w, 6, c0 - 34, 8, () => g - 1);
        w.rules.goalX = c0 - 40;
        s.status = 'the gorge is too deep';
      },

      script(w, s) {
        if (s.crossing || s.t % 20) return;
        // safe to cross: every column of the gorge filled to within four cells of the road, with
        // something solid on top: nobody will walk out onto open water
        const AIRY = [ID.EMPTY, ID.STEAM, ID.SMOKE, ID.FOG, ID.CO2];
        let deep = false, wet = 0;
        for (let x = s.c0; x <= s.c1 && !deep; x++) {
          let y = s.g - 3;
          while (y < w.H && AIRY.includes(w.type[w.idx(x, y)])) y++;
          if (y - s.g > 4) { deep = true; break; }
          if (w.type[w.idx(x, y)] === ID.WATER) wet++;
        }
        s.status = deep ? 'the gorge is too deep' : wet ? `${wet} cells of open water` : 'safe';
        if (!deep && !wet) {
          s.crossing = true;
          w.rules.goalX = w.W - 12; // everyone makes for the inn
          s.say.push({ eyebrow: 'The canyon road', name: 'The travellers set off', how: 'The ice will hold them.' });
        }
      },

      goals: [
        {
          id: 'across', main: true, text: 'Bring 6 travellers across',
          eval(w, s) {
            const n = countIn(w, s.far, [ID.HUMAN]);
            return { met: n >= 6, progress: Math.min(1, n / 6), value: s.crossing ? `${n} / ${s.travellers} across` : s.status };
          },
        },
        {
          id: 'everyone', keep: true, text: 'No traveller is hurt',
          eval(w, s) {
            const alive = w.counts[ID.HUMAN];
            return { holds: alive >= s.travellers, value: `${Math.min(alive, s.travellers)} / ${s.travellers}` };
          },
        },
        {
          id: 'swift', keep: true, text: 'Across before the fourth bell',
          eval(w, s) {
            const limit = 150 * SEC;
            return { holds: s.t <= limit, value: s.t <= limit ? clock(limit - s.t) : 'missed' };
          },
        },
      ],
      fail(w, s) { return w.counts[ID.HUMAN] < 6 ? this.failText : null; },
    },

    {
      id: 'mine',
      num: 'IV',
      title: 'The Flooded Mine',
      place: 'Under the foothills',
      blurb: 'Miners trapped below, and the water still rising.',
      size: [320, 180],
      weather: { mode: 'natural', wind: 0, ambient: 14 },
      rules: {},
      pouch: [
        { kind: 'tool', name: 'cool' },
        { kind: 'tool', name: 'erase', n: 260 },
        { kind: 'element', key: 'sand', n: 500 },
      ],
      intro: {
        body: [
          'The old silver mine runs deep under the foothills. Six miners went down at dawn. An hour later the shaft began to sing, and then to run with water: a spring has broken through the rock halfway down.',
          'The rescue rope is coming from the next valley. It will not be here for most of a minute.',
        ],
        task: 'Keep the miners from drowning until the rescue rope arrives. At least 5 of the 6 must live.',
      },
      hints: [
        'Water you cannot stop, you can still send somewhere else, or turn into something that does not flow.',
        'The spring pours from a crack in the shaft wall. Hold the Cool tool over the crack: frozen water plugs it like a cork.',
        'There is an old cave under the gallery floor. Erase a hole through the floor where the water gathers and it drains away beneath the miners, but only until the cave is full. It buys time; it doesn’t stop the spring.',
      ],
      outro: {
        title: 'Up the Rope',
        body: [
          'The rope comes down the shaft hand over hand, and the miners come up it one by one, wet to the chest and swearing about the cold. The spring behind its plug of ice has gone quiet.',
        ],
        found: 'Wrapped in oilcloth on a ledge in the shaft, where no miner would put it:',
        page: [
          'The water was not rising. It was being pushed: something under the mountain is so hot that the rock is sweating out its springs.',
          'The mountain itself, then. I am going up.',
        ],
        sign: '— O.',
      },
      failText: 'The water rose faster than you could stop it, and too many miners were lost.',

      build(w, s) {
        const { W, H } = w;
        const surf = Math.round(H * 0.18);
        for (let x = 0; x < W; x++) {
          fillCol(w, x, surf, H - 1, ID.STONE);
          fillCol(w, x, surf, surf + 3, ID.DIRT);
        }
        const sx0 = Math.round(W * 0.22), sx1 = sx0 + 6;         // the shaft
        const gy0 = Math.round(H * 0.7), gy1 = gy0 + 4;          // the bottom gallery: rows gy0 … gy1-1, just head height
        const gx1 = Math.round(W * 0.6);
        // the gallery runs gently downhill from the shaft to its dead end, where the miners are:
        // that end floods first, and the last air gathers back by the shaft
        const dip = (x) => Math.max(0, Math.floor((x - sx1) / 18));
        for (let y = surf; y < gy1; y++) for (let x = sx0; x < sx1; x++) w.place(w.idx(x, y), ID.EMPTY);
        for (let x = sx0; x <= gx1; x++) for (let y = gy0; y < gy1; y++) w.place(w.idx(x, y + dip(x)), ID.EMPTY);
        // an old cave under the gallery, behind three rows of rock: somewhere for the water to go
        const cy0 = gy1 + dip(gx1) + 3;
        for (let y = cy0; y < cy0 + 14; y++) for (let x = sx0 + 6; x < gx1 - 10; x++) w.place(w.idx(x, y), ID.EMPTY);
        // the spring: a crack in the shaft's right wall, half way down
        const mid = Math.round((surf + gy0) / 2);
        s.crack = [];
        for (let y = mid - 2; y <= mid + 2; y++) { const i = w.idx(sx1, y); w.place(i, ID.EMPTY); s.crack.push(i); }
        // a windlass at the top of the shaft, for the story
        for (let x = sx0 - 3; x <= sx1 + 2; x++) w.place(w.idx(x, surf - 8), ID.WOOD);
        for (let y = surf - 8; y < surf; y++) { w.place(w.idx(sx0 - 3, y), ID.WOOD); w.place(w.idx(sx1 + 2, y), ID.WOOD); }
        s.gallery = { x0: sx1 + 8, x1: gx1, y0: gy0, y1: gy1 - 1 + dip(gx1) };
        s.miners = villagers(w, gx1 - 40, gx1 - 2, 6, (x) => gy1 - 1 + dip(x));
        s.springAt = 3 * SEC;
        s.rescueAt = 55 * SEC;
      },

      script(w, s) {
        if (s.t === s.springAt) s.say.push({ eyebrow: 'Below', name: 'The spring breaks through', how: 'Water is pouring down the shaft.' });
        if (s.t >= s.springAt) {
          // the spring keeps its crack full of water; once the water in it freezes, the crack is plugged
          let flowing = false;
          for (const c of s.crack) {
            const t = w.type[c];
            if (t === ID.EMPTY || t === ID.WATER) flowing = true;
            if (t === ID.EMPTY && Math.random() < 0.6) { w.place(c, ID.WATER); w.temp[c] = Math.min(w.temp[c], 12); }
          }
          // while it still flows the water is under pressure, and squeezes out any pocket of air it
          // hems in (the sim has no air pressure of its own to hold a bubble against the ceiling)
          if (flowing && s.t % 10 === 0) {
            const z = s.gallery;
            for (let y = z.y0; y <= z.y1; y++) for (let x = z.x0; x <= z.x1; x++) {
              const i = w.idx(x, y);
              if (w.type[i] !== ID.EMPTY) continue;
              let wet = 0;
              for (const d of [-1, 1, -w.SW, w.SW]) if (w.type[i + d] === ID.WATER) wet++;
              if (wet >= 2) w.place(i, ID.WATER);
            }
          }
        }
        if (s.t === s.rescueAt - 10 * SEC) s.say.push({ eyebrow: 'Above', name: 'Voices at the top of the shaft', how: 'The rope is nearly here.' });
      },

      goals: [
        {
          id: 'rescue', main: true, text: 'Keep the miners alive until the rope comes',
          eval(w, s) {
            const left = s.rescueAt - s.t;
            return { met: left <= 0 && w.counts[ID.HUMAN] >= 5, progress: Math.min(1, s.t / s.rescueAt), value: left > 0 ? `rope in ${clock(left)}` : 'here' };
          },
        },
        {
          id: 'everyone', keep: true, text: 'Every miner survives',
          eval(w, s) {
            const alive = w.counts[ID.HUMAN];
            return { holds: alive >= s.miners, value: `${Math.min(alive, s.miners)} / ${s.miners}` };
          },
        },
        {
          id: 'dry', keep: true, text: 'The gallery never floods',
          eval(w, s) {
            const wet = countIn(w, s.gallery, [ID.WATER]);
            return { holds: wet < 100, value: `${wet} water` };
          },
        },
      ],
      fail(w, s) { return w.counts[ID.HUMAN] < 5 ? this.failText : null; },
    },

    {
      id: 'mountain',
      num: 'V',
      title: 'The Waking Mountain',
      place: 'Ashford, under the mountain',
      blurb: 'The magma chamber is full and the village is downhill.',
      size: [320, 180],
      weather: { mode: 'natural', wind: 0, ambient: 22 },
      rules: {},
      pouch: [
        { kind: 'element', key: 'water', n: 2400 },
        { kind: 'tool', name: 'erase', n: 500 },
      ],
      intro: {
        body: [
          'Ashford sits at the foot of the mountain like a cat at a stove. The ground has been warm for a month; this morning the well water came up steaming and the goats would not go uphill.',
          'Smoke is rising from the crater. The villagers are packing, but the road out runs past the mountain’s foot.',
        ],
        task: 'When the mountain erupts, keep the lava out of Ashford until it falls quiet again.',
      },
      hints: [
        'Lava set by water becomes rock, and rock doesn’t flow. Where would a plug of rock do the most good?',
        'Lava only comes out where the vent is open. Pour water into the crater as the lava rises and it seals itself shut.',
        'Or meet the flow on the slope: a wall of quenched rock, or a trench to catch it, turns the lava before it reaches the huts.',
      ],
      outro: {
        title: 'The Mountain Sleeps',
        body: [
          'By evening the crater is capped with black glass, still hissing where the rain of steam lands on it. Ashford smells of sulphur and wet stone, and every roof is still on.',
        ],
        found: 'On the crater rim, weighted with a lump of obsidian, a page:',
        page: [
          'This was only a symptom. The heat is coming from far deeper: a heart of stone that burns without fire.',
          'Before I go down to it, I need the lamps of Gaslight. You cannot work in that dark without light.',
        ],
        sign: '— O.',
      },
      failText: 'The lava ran into Ashford.',

      build(w, s) {
        const { W, H } = w;
        const g = Math.round(H * 0.8);
        const px = Math.round(W * 0.34), peak = Math.round(H * 0.32);
        const left0 = Math.round(W * 0.06), right1 = Math.round(W * 0.55);
        const n = noise1();
        for (let x = 0; x < W; x++) {
          let top = g;
          if (x >= left0 && x <= px) top = Math.round(g - (g - peak) * ((x - left0) / (px - left0)));
          else if (x > px && x <= right1) top = Math.round(peak + (g - peak) * ((x - px) / (right1 - px)));
          top += Math.round(n(x) * 1.5);
          if (Math.abs(x - px) <= 4) top = peak + 4; // the crater
          else if (x >= px - 9 && x < px - 4) top = peak - 4; // its high west rim: the lava spills east
          fillCol(w, x, top, H - 1, ID.STONE);
          if (x > right1 + 2 || x < left0 - 2) fillCol(w, x, top, top + 3, ID.DIRT);
        }
        s.vent = [];
        for (let x = px - 3; x <= px + 3; x++) s.vent.push(w.idx(x, peak + 3));
        for (const i of s.vent) w.place(i, ID.EMPTY);
        const v0 = Math.round(W * 0.62);
        curb(w, v0, g);
        s.timber = [];
        for (const [u, wd] of [[0.68, 14], [0.84, 14]]) s.timber.push(...hut(w, Math.round(W * u), wd, g));
        s.villagers = villagers(w, v0 + 3, W - 3, 8, () => g - 1);
        s.village = { x0: v0 - 4, x1: W - 1, y0: 0, y1: H - 1 };
        s.eruptAt = 6 * SEC;
        s.quietAt = 40 * SEC;
        s.endAt = 52 * SEC;
      },

      script(w, s) {
        if (s.t === s.eruptAt) s.say.push({ eyebrow: 'The mountain', name: 'It wakes', how: 'Lava is welling up in the crater.' });
        if (s.t > s.eruptAt && s.t < s.quietAt) {
          // magma rises wherever the vent is open; a vent sealed by rock stays sealed
          for (const v of s.vent) {
            const t = w.type[v];
            if (t === ID.STONE) w.transform(v, ID.LAVA); // a natural crust is melted from below
            else if (t === ID.EMPTY) { if (Math.random() < 0.6) w.place(v, ID.LAVA); }
            else if (t === ID.LAVA && Math.random() < 0.35) {
              // magma wells up under pressure: the crater fills and spills over its low east rim
              let u = v - w.SW;
              while (w.type[u] === ID.LAVA) u -= w.SW;
              if (w.type[u] === ID.EMPTY) w.place(u, ID.LAVA);
            }
            if (w.type[v] === ID.LAVA && w.temp[v] < 1450) w.temp[v] = 1450;
          }
        }
        if (s.t === s.quietAt) s.say.push({ eyebrow: 'The mountain', name: 'The rumbling fades', how: 'Hold on until the last of the lava cools.' });
      },

      goals: [
        {
          id: 'safe', main: true, text: 'Keep the lava out of Ashford',
          eval(w, s) {
            const left = s.endAt - s.t;
            return { met: left <= 0, progress: Math.min(1, s.t / s.endAt), value: s.t < s.eruptAt ? 'waiting' : left > 0 ? clock(left) : 'quiet' };
          },
        },
        {
          id: 'everyone', keep: true, text: 'Every villager survives',
          eval(w, s) {
            const alive = w.counts[ID.HUMAN];
            return { holds: alive >= s.villagers, value: `${Math.min(alive, s.villagers)} / ${s.villagers}` };
          },
        },
        {
          id: 'huts', keep: true, text: 'Not a plank scorched',
          eval(w, s) {
            let left = 0;
            for (const i of s.timber) if (w.type[i] === ID.WOOD && !(w.flags[i] & 1)) left++;
            return { holds: left === s.timber.length, value: `${Math.round((left / s.timber.length) * 100)}%` };
          },
        },
      ],
      fail(w, s) {
        if (countIn(w, s.village, [ID.LAVA]) > 25) return this.failText;
        return w.counts[ID.HUMAN] < 6 ? 'Too many of the villagers were lost.' : null;
      },
    },

    {
      id: 'city',
      num: 'VI',
      title: 'The Dark City',
      place: 'Gaslight',
      blurb: 'A city whose lamps went out all at once.',
      size: [320, 180],
      weather: { mode: 'natural', wind: 0, ambient: 8 },
      rules: {},
      pouch: [
        { kind: 'element', key: 'battery', n: 3 },
        { kind: 'element', key: 'metal', n: 40 },
      ],
      intro: {
        body: [
          'Gaslight is famous for its lamps: tubes of rare air that glow red and violet and blue all down the high street. Three nights ago they all went out at once, and the powerhouse batteries were found eaten through.',
          'The lamplighter shows you the line. “Snapped in four places,” she says, “and every battery dead. Whatever came through here was hungry.”',
        ],
        task: 'Put a battery on the line in the powerhouse and mend the four breaks so every lamp lights.',
      },
      hints: [
        'Current needs an unbroken path. A battery pushes it into any conductor it touches.',
        'Place a battery against the end of the line inside the powerhouse, at the left.',
        'Then mend each gap in the line with metal. The Pen brush lays one cell at a time, so you waste none.',
      ],
      outro: {
        title: 'Lamps of Gaslight',
        body: [
          'One by one the tubes stutter and catch: neon red, argon violet, xenon blue, krypton white, helium peach. People come out of their doors to look at the street they have been feeling their way down for three nights.',
        ],
        found: 'The lamplighter gives you a page your master left in her keeping, “for whoever mends the lamps”:',
        page: [
          'The batteries were not eaten. They were drained: something deep below drinks current the way a fire drinks air. It is a heart of uranium, and it has woken.',
          'Bring gadolinium: it drinks neutrons better than anything, and it will not melt in the heat down there. I have gone ahead.',
        ],
        sign: '— O.',
      },

      build(w, s) {
        const { W, H } = w;
        const g = Math.round(H * 0.8);
        for (let x = 0; x < W; x++) {
          fillCol(w, x, g + 2, H - 1, ID.STONE);
          fillCol(w, x, g, g + 1, ID.BRICK); // the cobbled high street
        }
        // the powerhouse at the west end: brick walls, an empty battery bench
        const p0 = Math.round(W * 0.03), p1 = Math.round(W * 0.13), roof = g - 22;
        for (let y = roof; y < g; y++) { w.place(w.idx(p0, y), ID.BRICK); w.place(w.idx(p1, y), ID.BRICK); }
        for (let x = p0; x <= p1; x++) w.place(w.idx(x, roof), ID.BRICK);
        for (let y = g - 3; y < g; y++) w.place(w.idx(p1, y), ID.EMPTY); // a doorway
        // the line, on wooden poles, from the powerhouse down the whole street
        const ly = g - 14, l0 = p0 + 3, l1 = Math.round(W * 0.93);
        for (let x = l0; x <= l1; x++) w.place(w.idx(x, ly), ID.METAL);
        for (let y = ly; y < g; y++) w.place(w.idx(p0 + 2, y), ID.BRICK); // the bench the batteries sat on
        for (let x = p1 + 18; x < l1; x += 40) for (let y = ly + 1; y < g; y++) w.place(w.idx(x, y), ID.WOOD);
        // five lamps hanging from the line: a glass tube of gas with a metal tip touching the wire
        s.lamps = [];
        const gases = ['el_ne', 'el_ar', 'el_xe', 'el_kr', 'el_he'];
        gases.forEach((key, k) => {
          const lx = Math.round(W * (0.24 + k * 0.155));
          for (let y = ly + 1; y <= ly + 11; y++) { w.place(w.idx(lx - 1, y), ID.GLASS); w.place(w.idx(lx + 1, y), ID.GLASS); }
          w.place(w.idx(lx, ly + 11), ID.GLASS);
          w.place(w.idx(lx, ly + 1), ID.METAL); // the electrode
          for (let y = ly + 2; y <= ly + 10; y++) w.place(w.idx(lx, y), G.ELEM.byKey[key].id);
          s.lamps.push({ x: lx, y0: ly + 2, y1: ly + 10, last: -1e9 });
        });
        // four breaks in the line, one before each lamp after the first
        s.gaps = [];
        for (let k = 1; k < 5; k++) {
          const gx = s.lamps[k].x - 14;
          for (let x = gx; x < gx + 5; x++) { const i = w.idx(x, ly); w.place(i, ID.EMPTY); s.gaps.push(i); }
        }
        s.lineStart = w.idx(l0, ly);
        s.benchAt = w.idx(l0 - 1, ly); // where a battery touches the end of the line
        s.metal0 = 0;
        for (let i = 0; i < w.N; i++) if (w.type[i] === ID.METAL) s.metal0++;
        s.villagers = villagers(w, p1 + 4, W - 3, 6, () => g - 1);
      },

      script(w, s) {
        // a lamp counts as lit if current ran through its gas in the last moment
        for (const L of s.lamps) {
          for (let y = L.y0; y <= L.y1; y++) if (w.charge[w.idx(L.x, y)]) { L.last = s.t; break; }
        }
      },

      goals: [
        {
          id: 'lamps', main: true, text: 'Light every lamp',
          eval(w, s) {
            const lit = s.lamps.filter((L) => s.t - L.last < 40).length;
            return { met: lit === s.lamps.length, progress: lit / s.lamps.length, value: `${lit} / ${s.lamps.length}` };
          },
        },
        {
          id: 'quick', keep: true, text: 'Lit within a minute',
          eval(w, s) {
            const limit = 60 * SEC;
            return { holds: s.t <= limit, value: s.t <= limit ? clock(limit - s.t) : 'missed' };
          },
        },
        {
          id: 'thrift', keep: true, text: 'Mend it with 25 cells of metal or fewer',
          eval(w, s) {
            const used = Math.max(0, w.counts[ID.METAL] - s.metal0);
            return { holds: used <= 25, value: `${used} used` };
          },
        },
      ],
    },

    {
      id: 'heart',
      num: 'VII',
      title: 'The Heart',
      place: 'Beneath the mountain',
      blurb: 'Where your master went, and what they found there.',
      size: [320, 180],
      weather: { mode: 'natural', wind: 0, ambient: 30 },
      rules: {},
      pouch: [
        { kind: 'element', key: 'el_gd', n: 440 },
        { kind: 'element', key: 'water', n: 800 },
        { kind: 'tool', name: 'cool' },
      ],
      intro: {
        body: [
          'At the bottom of the deepest cave there is a seam of black ore the size of a house, warm as a loaf. It is uranium, and it has started to burn without fire: a natural reactor, its control long since gone. The springs, the heat, the drained lamps all lead here.',
          'Your master is alive, sheltering behind the glass of an old survey niche in the cavern wall, and can go no further. The old miners cut channels into the seam once. They are empty now.',
        ],
        task: 'The seam is creeping back into its old channels. Fill them with gadolinium before they close, and keep the heart quiet.',
      },
      hints: [
        'Every split atom throws out neutrons that split more. Something has to catch them.',
        'Gadolinium drinks neutrons. Pour it into the empty channels in the ore and let it fill them from the bottom up, as fast as you can.',
        'If the ore is already glowing, pour water on it and use the Cool tool: melted ore slumps together and burns hotter.',
      ],
      outro: {
        title: 'The Heart Sleeps',
        body: [
          'The ore goes dark channel by channel. The roar in the rock fades to a tick, and then to nothing you can hear. Your master comes out from behind the glass, stiff and grey with dust, and looks at the silver-grey metal in the channels for a long time.',
          '“You came,” they say. “Of course you did. I left the table half empty so you would.”',
        ],
        found: 'That night, in the Elementarium, your master writes the last page of the journal and hands it to you:',
        page: [
          'The valley is in balance again, and its keeper is you. The table is yours to fill.',
        ],
        sign: '— O.',
      },
      failText: 'The heart ran away. Deep under the mountain the rock gave way, and the valley shook for a week.',

      build(w, s) {
        const { W, H } = w;
        const n = noise1();
        for (let x = 0; x < W; x++) fillCol(w, x, 0, H - 1, ID.STONE);
        // the cavern
        const floor = Math.round(H * 0.88);
        for (let x = Math.round(W * 0.08); x < Math.round(W * 0.92); x++) {
          const top = Math.round(H * 0.22 + n(x) * 8);
          fillCol(w, x, top, floor - 1, ID.EMPTY);
        }
        // the heart: a seam of uranium on the cavern floor, cut through with empty rod channels
        const hx = Math.round(W * 0.58), half = 15, top = floor - 28;
        for (let y = top; y < floor; y++) for (let x = hx - half; x <= hx + half; x++) w.place(w.idx(x, y), ID.EL_U);
        s.core = { x0: hx - half, x1: hx + half, y0: top, y1: floor - 1 };
        s.channels = [];
        // two columns open in every four: with them empty the seam only ticks; closed, it runs away
        for (let x = hx - half; x <= hx + half; x++) {
          const k = x - (hx - half);
          if (k % 4 !== 2 && k % 4 !== 3) continue;
          for (let y = top; y < floor - 1; y++) { const i = w.idx(x, y); w.place(i, ID.EMPTY); s.channels.push(i); }
        }
        s.channels.sort((a, b) => b - a); // bottom rows first, so the seam slumps upward from the floor
        const byCol = new Map();
        for (const i of s.channels) { const x = i % w.SW; if (!byCol.has(x)) byCol.set(x, []); byCol.get(x).push(i); }
        s.columns = [...byCol.values()];
        for (let y = top; y < floor; y++) for (let x = hx - half; x <= hx + half; x++) { const i = w.idx(x, y); if (w.type[i] === ID.EL_U) w.temp[i] = 260; }
        // your master shelters in an old survey niche cut into the west wall, behind a glass pane
        // (hot vapour from the splitting ore fills the cavern; it can't get through glass)
        const nx0 = Math.round(W * 0.02), nx1 = Math.round(W * 0.09), ny = Math.round(H * 0.6);
        for (let y = ny - 8; y < ny; y++) for (let x = nx0; x <= nx1; x++) w.place(w.idx(x, y), ID.EMPTY);
        for (let y = ny - 9; y < ny; y++) w.place(w.idx(nx1 + 1, y), ID.GLASS);
        const lx = Math.round((nx0 + nx1) / 2);
        w.place(w.idx(lx, ny - 1), ID.HUMAN); w.place(w.idx(lx, ny - 2), ID.HEAD);
        s.u0 = 0;
        s.ore = [];
        for (let y = s.core.y0; y <= s.core.y1; y++) for (let x = s.core.x0; x <= s.core.x1; x++) { const i = w.idx(x, y); if (w.type[i] === ID.EL_U) s.ore.push(i); }
        for (let i = 0; i < w.N; i++) if (w.type[i] === ID.EL_U) s.u0++;
        s.uPrev = s.u0;
        s.splits = []; // when each recent split happened
        s.quietSince = -1;
      },

      script(w, s) {
        // the simulation counts uranium each step: every drop is an atom split
        const u = w.counts[ID.EL_U];
        if (s.t > 1 && u < s.uPrev) for (let k = 0; k < s.uPrev - u; k++) s.splits.push(s.t);
        s.uPrev = u;
        while (s.splits.length && s.splits[0] < s.t - 10 * SEC) s.splits.shift();
        const quiet = s.splits.length <= 20; // two splits a second at most: settling down
        if (!quiet) s.quietSince = -1;
        else if (s.quietSince < 0) s.quietSince = s.t;
        if (s.t === 4 * SEC) s.say.push({ eyebrow: 'The heart', name: 'The seam is settling', how: 'The ore will creep into its empty channels and close them.' });
        if (s.t === 12 * SEC) s.say.push({ eyebrow: 'The heart', name: 'The channels are closing', how: 'Once the seam is whole, it will run away.' });
        // the heart's own pulse: neutrons fired into the ore for as long as its channels hold no
        // absorber, so a closed seam always runs away and a seam full of absorber falls quiet
        // a channel with a good charge of absorber in it is rodded: it stays open and drinks neutrons
        const ABS = [ID.EL_GD, ID.EL_CD, ID.EL_B];
        let bareCols = 0;
        const rodded = new Set();
        for (const col of s.columns) {
          let rod = 0;
          for (const i of col) if (ABS.includes(w.type[i])) rod++;
          if (rod >= col.length * 0.3) for (const i of col) rodded.add(i);
          else bareCols++;
        }
        const f = bareCols / s.columns.length;
        if (s.t >= 12 * SEC && Math.random() < f * 0.05 && s.ore.length) w.fireNeutrons(s.ore[(Math.random() * s.ore.length) | 0], 2); // it wakes as the seam closes
        // the hot seam slumps into its old channels, bottom first; an absorber in a channel holds it open
        if (s.t >= 12 * SEC && s.t < 22 * SEC && s.t % 2 === 0) {
          // the ore pushes through air, gas or water; only a neutron absorber (or ore already there) holds it back
          const open = (i) => { const t = w.type[i]; return !rodded.has(i) && t !== ID.EL_U && !ABS.includes(t) && w.type[i + w.SW] !== ID.EMPTY; };
          for (const i of s.channels) if (open(i)) { w.place(i, ID.EL_U); w.temp[i] = 260; break; }
          for (let k = s.channels.length - 1; k >= 0; k--) { const i = s.channels[k]; if (open(i)) { w.place(i, ID.EL_U); w.temp[i] = 260; break; } }
        }
      },

      goals: [
        {
          id: 'quiet', main: true, text: 'Quiet the heart for 10 seconds',
          eval(w, s) {
            // judged once the seam has stopped moving: quiet for ten seconds after that
            const q = s.quietSince < 0 || s.t < 22 * SEC ? 0 : s.t - Math.max(s.quietSince, 22 * SEC);
            return { met: q >= 10 * SEC, progress: Math.min(1, q / (10 * SEC)), value: `${s.splits.length} splits / 10 s` };
          },
        },
        {
          id: 'master', keep: true, text: 'Your master survives',
          eval(w) {
            const alive = w.counts[ID.HUMAN] >= 1;
            return { holds: alive, value: alive ? 'alive' : 'lost' };
          },
        },
        {
          id: 'cool', keep: true, text: 'The ore never melts',
          eval(w, s) {
            let hot = 0;
            const z = s.core;
            for (let y = z.y0; y <= z.y1; y++) for (let x = z.x0; x <= z.x1; x++) { const T = w.temp[w.idx(x, y)]; if (T > hot) hot = T; }
            return { holds: hot < 1132, value: `${Math.round(hot)}°C` };
          },
        },
      ],
      fail(w, s) { return w.counts[ID.EL_U] < s.u0 * 0.7 ? this.failText : null; },
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
    if (s.t % EVAL_EVERY) return null;
    judge(ch, w, s);
    const reason = ch.fail && ch.fail(w, s);
    if (reason) s.over = { won: false, reason };
    else if (s.goals.filter((g) => g.main).every((g) => g.met)) {
      s.over = { won: true, stars: s.goals.filter((g) => (g.main ? g.met : !g.lost)).length };
    }
    return s.over;
  }

  G.Story = { chapters, prologue, start, update, clock, SEC };
})(globalThis);
