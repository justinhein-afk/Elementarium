// Headless checks that each explosive goes off the way the real thing does: the colour of its
// fire and flash, and what it leaves behind. Also that metals mixed into gunpowder colour its
// fire, as in fireworks.
// Run: node tools/blasttest.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', 'js');
for (const f of ['elements.js', 'periodic.js', 'materials.js', 'sim.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
}
const { ELEM, Sim } = globalThis;
const ID = ELEM.ID;
const name = (t) => (t ? ELEM.list[t].name : 'plain');

function rect(w, x0, y0, x1, y1, t) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) w.place(w.idx(x, y), t);
}

// Builds a world with `setup`, lights the cell at (lx, ly), then watches 120 ticks: which tint
// the fire had, what the blasts reported, and how much smoke and steam there was at the peak.
function blast(setup, lx, ly) {
  const w = Sim.createWorld(160, 100);
  for (const d of ELEM.list) w.disc[d.id] = 1;
  rect(w, 0, 90, 159, 99, ID.STONE);
  setup(w);
  w.ignite(w.idx(lx, ly));
  const tint = {}, kinds = {};
  let whiteSmoke = 0, greySmoke = 0, steam = 0, booms = 0;
  for (let k = 0; k < 120; k++) {
    w.step();
    const b = w.events.booms;
    for (let n = 0; n < b.length; n += 4) { booms++; kinds[b[n + 3]] = (kinds[b[n + 3]] || 0) + 1; }
    w.resetEvents();
    let ws = 0, gs = 0, st = 0;
    for (let i = 0; i < w.N; i++) {
      const t = w.type[i];
      if (t === ID.FIRE) tint[w.aux[i]] = (tint[w.aux[i]] || 0) + 1;
      else if (t === ID.SMOKE) { if (w.aux[i] === 1) ws++; else gs++; }
      else if (t === ID.STEAM) st++;
    }
    whiteSmoke = Math.max(whiteSmoke, ws); greySmoke = Math.max(greySmoke, gs); steam = Math.max(steam, st);
  }
  const top = (o) => +Object.entries(o).sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
  return { tint: top(tint), kind: top(kinds), booms, whiteSmoke, greySmoke, steam };
}

const out = [];
function check(label, ok, r) {
  out.push({ label, ok, detail: `${r.booms} blasts; fire ${name(r.tint)}, flash ${name(r.kind)}; smoke ${r.whiteSmoke} white / ${r.greySmoke} grey; steam ${r.steam}` });
}

const powder = blast((w) => rect(w, 70, 82, 89, 89, ID.GUNPOWDER), 80, 89);
check('Gunpowder: orange fire, white smoke', powder.booms > 20 && powder.tint === 0 && powder.kind === ID.GUNPOWDER &&
  powder.whiteSmoke > 150 && powder.whiteSmoke > powder.greySmoke * 3, powder);

const nitro = blast((w) => rect(w, 70, 82, 89, 89, ID.NITRO), 80, 89);
check('Nitro: white flash, almost no smoke', nitro.booms > 20 && nitro.tint === ID.NITRO && nitro.kind === ID.NITRO &&
  nitro.whiteSmoke + nitro.greySmoke < powder.whiteSmoke / 4 && nitro.steam > 30, nitro);

const hydrogen = blast((w) => rect(w, 65, 45, 94, 64, ID.EL_H), 80, 54);
check('Hydrogen: pale blue fire, only steam', hydrogen.booms > 10 && hydrogen.tint === ID.EL_H && hydrogen.kind === ID.EL_H &&
  hydrogen.greySmoke + hydrogen.whiteSmoke < 20 && hydrogen.steam > 50, hydrogen);

const methane = blast((w) => rect(w, 65, 45, 94, 64, ID.METHANE), 80, 54);
check('Methane: blue fire, steam', methane.booms > 10 && methane.tint === ID.METHANE && methane.kind === ID.METHANE &&
  methane.greySmoke + methane.whiteSmoke < powder.whiteSmoke / 10 && methane.steam > 20, methane);

for (const [sym, label] of [['NA', 'yellow'], ['K', 'lilac'], ['LI', 'crimson']]) {
  const t = ID['EL_' + sym];
  // the metal is dropped onto water and lit by the reaction itself, so light nothing
  const w = Sim.createWorld(160, 100);
  for (const d of ELEM.list) w.disc[d.id] = 1;
  rect(w, 0, 90, 159, 99, ID.STONE);
  rect(w, 40, 70, 120, 89, ID.WATER);
  rect(w, 70, 60, 89, 63, t);
  const kinds = {};
  let n = 0;
  for (let k = 0; k < 600; k++) {
    w.step();
    const b = w.events.booms;
    for (let q = 0; q < b.length; q += 4) { n++; kinds[b[q + 3]] = (kinds[b[q + 3]] || 0) + 1; }
    w.resetEvents();
  }
  const own = kinds[t] || 0;
  out.push({ label: `${ELEM.list[t].name} in water: ${label} blasts`, ok: n > 0 && own > n * 0.5, detail: `${own} of ${n} blasts in its flame colour` });
}

// fireworks: a metal powder stirred into gunpowder colours the whole burst
for (const [sym, colour] of [['SR', 'red'], ['BA', 'green'], ['CU', 'blue-green']]) {
  const t = ID['EL_' + sym];
  const r = blast((w) => {
    for (let y = 82; y <= 89; y++) for (let x = 70; x <= 89; x++) w.place(w.idx(x, y), (x + y) % 3 === 0 ? t : ID.GUNPOWDER);
  }, 81, 89);
  check(`Gunpowder + ${ELEM.list[t].name}: ${colour} fireworks`, r.booms > 10 && r.tint === t && r.kind === t, r);
}

let fail = 0;
for (const r of out) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.label.padEnd(40)} ${r.detail}`);
}
process.exit(fail ? 1 : 0);
