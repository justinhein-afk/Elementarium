// Plays the ten story chapters headless on one seeded map each: every chapter must stay unsolved
// (or be lost) if the apprentice does nothing, and be won by doing the right thing, the way a
// player would (each solution only uses what the chapter's pouch holds). A few chapters also check
// that the wrong way fails. Takes a few minutes.
// Run: node tools/storytest.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Seeded Math.random, so a failing map can be replayed (the chapters build with Math.random).
let seed = 1;
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

for (const f of ['elements.js', 'periodic.js', 'materials.js', 'sim.js', 'scenes.js', 'story.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
}
const { ELEM, Sim, Story, SceneKit } = globalThis;
const { ID, byKey } = ELEM;
const SEC = Story.SEC;
const SEED = 1;

// Plays a chapter for at most `secs` seconds; `act(w, s)` runs before every tick.
function play(id, secs, act) {
  seed = SEED;
  const ch = Story.chapters.find((c) => c.id === id);
  const w = Sim.createWorld(...ch.size);
  for (const d of ELEM.list) w.disc[d.id] = 1;
  const s = Story.start(ch, w);
  let over = null;
  for (let k = 0; k < secs * SEC && !over; k++) {
    if (act) act(w, s);
    w.step();
    w.resetEvents();
    over = Story.update(ch, w, s);
  }
  return { w, s, over };
}
// a scripted run: `steps` is a list of [second, fn(w, s)]; `every(w, s)` runs each tick
const plan = (steps, every) => (w, s) => {
  for (const [t, fn] of steps) if (s.t === Math.round(t * SEC)) fn(w, s);
  if (every) every(w, s);
};

let failures = 0;
function expect(label, want, r) {
  const outcome = !r.over ? 'unsolved' : r.over.won ? `won★${r.over.stars}` : 'lost';
  let ok = want === 'won' ? r.over && r.over.won : want === 'lost' ? r.over && !r.over.won : !(r.over && r.over.won);
  // a win walks the guide's three steps, in order (the 'Step n done' messages come out one by one)
  let steps = '';
  if (ok && want === 'won') {
    const done = (r.s.stepsDone || []).filter(Boolean).length;
    const order = r.s.say.filter((m) => /^Step \d/.test(m.eyebrow)).map((m) => +m.eyebrow.split(' ')[1]);
    const inOrder = order.every((k, q) => q === 0 || k > order[q - 1]);
    if (done < 3 || !inOrder) { ok = false; steps = ` · guide: ${done} of 3 steps done, in the order ${order.join(',') || '-'}`; }
  }
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(44)} want ${want.padEnd(8)} ${outcome}@${Story.clock(r.s.t)}${steps}`);
}

// Every chapter's guide: three steps, each lighting a real place on the map from the start
for (const ch of Story.chapters.filter((c) => !c.sealed)) {
  seed = SEED;
  const w = Sim.createWorld(...ch.size);
  const s = Story.start(ch, w);
  let bad = '';
  if (!ch.guide || ch.guide.length !== 3) bad = 'not three steps';
  else {
    for (const [k, st] of ch.guide.entries()) {
      const z = st.at(w, s);
      if (!(z.x1 >= z.x0 && z.y1 >= z.y0 && z.x1 >= 0 && z.y1 >= 0 && z.x0 < w.W && z.y0 < w.H)) bad += ` step ${k + 1} lights nothing (${JSON.stringify(z)})`;
      if (st.done(w, s)) bad += ` step ${k + 1} is done before you start`;
      for (const u of st.use) if (!ch.pouch.some((it) => (it.kind === 'tool' ? `tool:${it.name}` : it.key) === u)) bad += ` step ${k + 1} wants ${u}, not in the pouch`;
    }
  }
  if (bad) failures++;
  console.log(`${bad ? 'FAIL' : 'ok  '} ${`${ch.num.padEnd(4)} · the guide`.padEnd(44)}${bad}`);
}
const count = (w, t, z) => {
  let n = 0;
  for (let y = z.y0; y <= z.y1; y++) for (let x = z.x0; x <= z.x1; x++) if (w.type[w.idx(x, y)] === t) n++;
  return n;
};
// pour n cells of t onto whatever is below, across columns x0..x1
const pour = (w, x0, x1, t, n) => {
  for (let x = x0; x <= x1; x++) {
    let y = 0;
    while (y < w.H - 1 && w.type[w.idx(x, y + 1)] === ID.EMPTY) y++;
    for (let k = 0; k < n; k++) if (w.type[w.idx(x, y - k)] === ID.EMPTY) w.place(w.idx(x, y - k), t);
  }
};

// ── I · The Dry Season: heat the pond into rain, then sow the mud ──
expect('I    · do nothing', 'unsolved', play('drought', 120));
{
  let sown = 0;
  expect('I    · heat the pond, sow the mud', 'won', play('drought', 220, (w, s) => {
    if (s.t < 15 * SEC) { // sweep Heat over the pond's surface
      const k = s.t % 112, x = 12 + (k < 56 ? k : 112 - k);
      let y = 0;
      while (y < w.H && w.type[w.idx(x, y)] !== ID.WATER) y++;
      if (y < w.H) w.heat(x, y, 4, 28);
    }
    if (s.rained && sown < 40 && s.t % 6 === 0) { // seed only where the field is mud (with air over it)
      for (let x = 116 + ((sown * 37) % 90), tries = 0; tries < 90; tries++, x = 116 + ((x - 116 + 7) % 90)) {
        let done = false;
        for (let y = s.soil.y0 - 2; y <= s.soil.y1 && !done; y++) {
          if (w.type[w.idx(x, y)] === ID.MUD && w.type[w.idx(x, y - 1)] === ID.EMPTY) { w.place(w.idx(x, y - 1), ID.SEED); done = true; }
        }
        if (done) break;
      }
      sown++;
    }
  }));
}

// ── II · The Cold Kiln: ash + salt → gunpowder, + rust → thermite, lit with oil ──
expect('II   · do nothing', 'unsolved', play('kiln', 60));
expect('II   · thermite in the crucible', 'won', play('kiln', 120, plan([
  [2, (w) => pour(w, 160, 173, ID.ASH, 4)],
  [3, (w) => pour(w, 160, 173, ID.SALT, 4)],
  [11, (w) => pour(w, 160, 173, ID.RUST, 6)],
  [19, (w) => pour(w, 160, 173, ID.OIL, 2)],
  [21, (w) => pour(w, 160, 173, ID.FIRE, 1)],
])));

// ── III · The Dark Lighthouse: a battery, wire up the tower, a switch in the line ──
expect('III  · do nothing', 'lost', play('lighthouse', 110));
const lighthouse = (line, sw) => plan([[3, (w, s) => {
  const b = s.bench, x = b.x1 + 1;
  w.place(w.idx(x - 1, b.y), ID.BATTERY); w.place(w.idx(x - 1, b.y - 1), ID.BATTERY);
  let y = b.y;
  while (w.type[w.idx(x, y)] !== ID.METAL && y > 10) { w.place(w.idx(x, y), line); y--; }
  if (sw) { const i = w.idx(x, b.y - 10); w.place(i, ID.SWITCH); w.aux[i] = 1; }
}]]);
expect('III  · wire and a switch up the tower', 'won', play('lighthouse', 110, lighthouse(ID.WIRE, true)));
expect('III  · bare metal rusts away in the spray', 'lost', play('lighthouse', 110, lighthouse(ID.METAL, false)));

// ── IV · The Iron Hills: warm the heap past nickel's Curie point, carry iron, melt it, cast it ──
// Heat held over the heap's surface (a few cells into it), all along
const warmHeap = (w) => {
  for (let x = 62; x <= 140; x += 8) {
    let y = 100;
    while (y < 139 && w.type[w.idx(x, y)] === ID.EMPTY) y++;
    w.heat(x, y + 3, 6, 14);
  }
};
const foundry = (warm) => (w, s) => {
  const t = s.t;
  if (warm && t > SEC && t <= SEC + 40) warmHeap(w);
  // six trips with the magnet: grab on the heap, carry under the eaves to the mould, drop
  const T0 = 2 * SEC, TRIP = 230;
  const k = t - T0, trip = Math.floor(k / TRIP), q = k % TRIP;
  if (k >= 0 && trip < 6) {
    const hx = 70 + trip * 12;
    if (q === 0) w.grab(hx, 122, 12, true);
    else if (q < 20) w.holdTo(hx, 122, 12);
    else if (q <= 110) w.holdTo(Math.round(hx + ((223 - hx) * (q - 20)) / 90), 110, 12);
    else if (q < 200) w.holdTo(223, 118, 12);
    else if (q === 200) w.release(0, 0);
    if (warm && q > 200 && q < 206) warmHeap(w);
  }
  const melt = T0 + 6 * TRIP;
  if (t >= melt && t < melt + 160) for (let x = 200; x <= 246; x += 9) w.heat(x, 130, 6, 28);
  if (t >= melt + 400) for (let x = 200; x <= 246; x += 9) w.heat(x, 130, 6, -18);
};
expect('IV   · do nothing', 'unsolved', play('foundry', 60));
{
  const r = play('foundry', 90, foundry(true));
  expect('IV   · warm heap: pure iron cast', 'won', r);
  if (r.over && r.over.stars < 3) { failures++; console.log('FAIL IV   · the warm heap should cast pure iron (3 stars)'); }
  const cold = play('foundry', 90, foundry(false));
  const pure = cold.s.goals.find((g) => g.id === 'pure');
  if (!pure.lost) { failures++; console.log('FAIL IV   · a cold heap should let nickel in'); } else console.log('ok   IV   · a cold heap lets nickel into the plate');
}

// ── V · The Bitter Spring: mend the bell with glass, then zinc into the acid ──
const spring = (patch) => (w, s) => {
  if (patch && s.t === 2 * SEC) for (let x = 158; x <= 161; x++) for (const dy of [0, 1]) w.place(w.idx(x, s.bell.y0 - 2 + dy), ID.GLASS);
  if (s.t > 2 * SEC && s.t % (4 * SEC) === 0 && s.t < 110 * SEC) {
    for (let x = 140; x <= 180; x += 2) { const i = w.idx(x, s.bell.y0 + 30); if (w.type[i] === ID.EMPTY) w.place(i, byKey.el_zn.id); }
  }
};
expect('V    · do nothing', 'unsolved', play('spring', 60));
expect('V    · mend the bell, zinc into the acid', 'won', play('spring', 130, spring(true)));
expect('V    · zinc with the hole open: bang', 'lost', play('spring', 60, spring(false)));

// ── VI · The Pumphouse: mend the pipe over the ravine, then power the pump and the valve ──
const pumphouse = (early) => {
  const power = (w, s) => {
    for (const p of [s.post, s.post2]) { w.place(w.idx(p.x, p.y), ID.BATTERY); w.place(w.idx(p.x, p.y - 1), ID.BATTERY); }
  };
  const mend = (w) => SceneKit.kit(w).pipe([[113, 74], [175, 74]], 0);
  return plan(early ? [[2, power], [17, mend]] : [[2, mend], [3, power]]);
};
expect('VI   · do nothing', 'unsolved', play('pumphouse', 60));
expect('VI   · mend the pipe, then pump', 'won', play('pumphouse', 150, pumphouse(false)));
expect('VI   · pump through the gap: the forge burns', 'lost', play('pumphouse', 60, pumphouse(true)));

// ── VII · Falling Stars: concrete roofs, and the dome shut for each shower ──
const skywatch = (roofs, shutter) => (w, s) => {
  if (roofs && s.t === SEC) for (const h of s.huts) for (let y = h.tray.y1; y >= h.tray.y1 - 2; y--) for (let x = h.tray.x0; x <= h.tray.x1; x++) if (w.type[w.idx(x, y)] === ID.EMPTY) w.place(w.idx(x, y), ID.SAND);
  if (roofs && s.t === 2 * SEC) for (const h of s.huts) for (let y = h.tray.y0 - 4; y <= h.tray.y0 + 3; y++) for (let x = h.tray.x0; x <= h.tray.x1; x++) if (w.type[w.idx(x, y)] === ID.EMPTY) w.place(w.idx(x, y), ID.LIME);
  if (shutter && s.t % SEC === 0) {
    const near = s.waves.some((T) => s.t >= T - 5 * SEC && s.t < T + 4 * SEC);
    const i = w.idx(s.switchAt.x, s.switchAt.y);
    if ((w.aux[i] === 1) !== near) w.flip(s.switchAt.x, s.switchAt.y);
  }
};
expect('VII  · do nothing', 'lost', play('skywatch', 130));
expect('VII  · roofs, and the dome shut in showers', 'won', play('skywatch', 140, skywatch(true, true)));

// ── VIII · The Sleeping Heart: SCRAM, mend the sensor's wire, release ──
const heart = (scram, mend, release) => (w, s) => {
  const x = s.scram % w.SW, y = (s.scram / w.SW) | 0;
  if (s.t === scram * SEC || s.t === release * SEC) w.flip(x, y);
  if (s.t === mend * SEC) for (const i of s.gap) w.place(i, ID.WIRE);
};
expect('VIII · do nothing', 'lost', play('deepdown', 90));
expect('VIII · SCRAM, mend the sensor, release', 'won', play('deepdown', 150, heart(4, 12, 25)));

// ── IX · The Proving Ground: fly the sledge across on its three switches ──
function sledge(w) {
  let bx = -1, by = 1e9;
  for (let y = 0; y < w.H; y++) for (let x = 0; x < 280; x++) if (w.type[w.idx(x, y)] === ID.BATTERY && y < by) { by = y; bx = x; }
  let x0 = 1e9, x1 = -1, y1 = -1, vx = 0, vy = 0, n = 0;
  for (let y = 0; y < w.H; y++) for (let x = 0; x < 300; x++) {
    const i = w.idx(x, y);
    if (w.type[i] !== ID.THRUSTER) continue;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y1 = Math.max(y1, y); vx += w.vx[i]; vy += w.vy[i]; n++;
  }
  return { bx, by, y1, vx: vx / n, vy: vy / n, cx: (x0 + x1) / 2 };
}
{
  let phase = 'climb';
  const pilot = (w, s) => {
    if (s.cutscene || s.t % 10) return;
    const p = sledge(w), padC = (s.pad.x0 + s.pad.x1) / 2, alt = 90;
    const set = (x, y, on) => { const i = w.idx(x, y); if (w.type[i] === ID.SWITCH && (w.aux[i] === 1) !== on) w.flip(x, y); };
    const hold = (p.y1 > alt && p.vy > -0.15) || p.vy > 0.15;
    let lift = false, east = false, west = false;
    if (phase === 'climb') { lift = hold; if (p.y1 <= alt + 4) phase = 'cross'; }
    if (phase === 'cross') { lift = hold; east = p.vx < 0.35; if (p.cx >= padC - 45) phase = 'coast'; }
    if (phase === 'coast') {
      lift = hold; west = p.cx > padC + 2 && p.vx > -0.1; east = p.cx < padC - 8 && p.vx < 0.15;
      if (Math.abs(p.vx) < 0.03 && Math.abs(p.cx - padC) < 12) phase = 'down';
    }
    if (phase === 'down') { lift = p.vy > 0.3; east = p.vx < -0.03; west = p.vx > 0.03; }
    set(p.bx, p.by + 2, lift); set(p.bx - 1, p.by, east); set(p.bx + 1, p.by, west);
  };
  expect('IX   · do nothing', 'unsolved', play('proving', 60));
  expect('IX   · fly the sledge across and land', 'won', play('proving', 120, pilot));
}

// ── X · The Launch: five faults mended, fuelled down the laid line, flown to the moon ──
const launch = (opts) => {
  const x0 = 150, x1 = 164, base = 166;
  let fuelled = -1;
  const own = (w) => { let n = 0; for (let y = 160; y <= 165; y++) for (let x = 155; x <= 160; x++) { const i = w.idx(x, y); if (w.type[i] === ID.TANK) n += w.data[i]; } return n; };
  return (w, s) => {
    if (s.t === SEC) {
      if (!opts.noGlass) for (const i of s.porthole) w.place(i, ID.GLASS);
      w.erase(x0 + 1, base - 1, 0); w.erase(x0 + 1, base - 2, 0);
      for (let y = base - 14; y <= base - 13; y++) for (let x = x0 + 3; x <= x0 + 4; x++) w.place(w.idx(x, y), ID.BATTERY);
      for (const i of s.sockets) { w.place(i, ID.THRUSTER); w.aux[i] = 0; }
      if (!opts.noLegs) for (let y = base - 2; y <= base; y++) for (const x of [x0 - 2, x0 - 1, x1 + 1, x1 + 2]) w.place(w.idx(x, y), ID.LEGS);
      // a player who draws a fuel pipe of their own, straight from the valve to the port, as well
      if (opts.ownLine) SceneKit.kit(w).pipe([[215, 115], [x1 + 3, base - 4]], 0);
    }
    if (s.t === 2 * SEC) w.flip(s.fuelSwitch.x, s.fuelSwitch.y);
    if (fuelled < 0 && s.t > 2 * SEC && s.t % 30 === 0 && own(w) >= 400) {
      fuelled = s.t;
      w.flip(s.fuelSwitch.x, s.fuelSwitch.y);
    }
    if (fuelled > 0 && s.t === fuelled + 2 * SEC) w.flip(x0 + 5, base - 13);
  };
};
expect('X    · do nothing', 'unsolved', play('launch', 60));
expect('X    · mend, fuel, fly to the moon', 'won', play('launch', 150, launch({})));
expect('X    · with a fuel pipe of your own too', 'won', play('launch', 150, launch({ ownLine: true })));
{
  const r = play('launch', 90, launch({ noLegs: true }));
  expect('X    · no legs: the line holds it down', 'unsolved', r);
  const held = r.s.say.some((m) => m.name === 'The fuel line holds the ship down' && /legs/.test(m.how));
  if (!held) { failures++; console.log('FAIL X    · …and says the legs are still to do'); } else console.log('ok   X    · …and says the legs are still to do');
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall chapters behave');
process.exitCode = failures ? 1 : 0;
