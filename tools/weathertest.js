// Headless checks for weather and the newest elements.
// Run: node tools/weathertest.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
for (const f of ['elements.js', 'periodic.js', 'sim.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
}
const { ELEM, Sim } = globalThis;
const ID = ELEM.ID;

function world(W = 200, H = 120) {
  const w = Sim.createWorld(W, H);
  for (const d of ELEM.starters) w.disc[d.id] = 1;
  for (const d of ELEM.list) if (d.hidden || d.special || d.periodic) w.disc[d.id] = 1;
  return w;
}
function rect(w, x0, y0, x1, y1, t) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) w.place(w.idx(x, y), t);
}
function count(w, t) {
  let n = 0;
  for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) if (w.type[w.idx(x, y)] === t) n++;
  return n;
}
function run(w, n, each) {
  let bolts = 0;
  for (let k = 0; k < n; k++) { if (each) each(w, k); w.step(); bolts += w.events.bolts.length / 4; w.resetEvents(); }
  return { bolts };
}
function weather(w, mode, ambient, wind = 0) { w.weather.mode = mode; w.ambient = ambient; w.weather.wind = wind; }

const out = [];
const check = (label, ok, detail) => out.push({ label, ok, detail });

{
  const w = world(); rect(w, 0, 110, 199, 119, ID.STONE); weather(w, 'rain', 12);
  run(w, 1500);
  check('Rain weather rains', count(w, ID.WATER) > 200, `${count(w, ID.WATER)} water, ${count(w, ID.RAINCLOUD)} rain-cloud cells`);
}
{
  const w = world(); rect(w, 0, 110, 199, 119, ID.STONE); weather(w, 'rain', -5);
  run(w, 1500);
  check('Rain below 0°C falls as snow', count(w, ID.SNOW) > 1000 && count(w, ID.SNOW) > count(w, ID.WATER) * 5, `${count(w, ID.SNOW)} snow, ${count(w, ID.WATER)} water`);
}
{
  const w = world(); rect(w, 0, 110, 199, 119, ID.STONE); weather(w, 'storm', 18);
  const r = run(w, 3600);
  check('Thunderstorms throw lightning', r.bolts >= 3, `${r.bolts} bolts in a minute`);
}
{
  const w = world(); rect(w, 0, 110, 199, 119, ID.STONE); weather(w, 'storm', 6);
  run(w, 2000);
  check('Cool storms drop hail', count(w, ID.HAIL) > 10, `${count(w, ID.HAIL)} hail`);
}
{
  const w = world(); rect(w, 0, 100, 199, 119, ID.DIRT); weather(w, 'fog', 6);
  run(w, 1200);
  check('Fog weather lays fog on the ground', count(w, ID.FOG) > 300, `${count(w, ID.FOG)} fog`);
}
{
  // natural weather spawns no new clouds, so only this one moves (cloudy weather's random puffs
  // made the average jump about and the check fail now and then); it may darken into rain cloud
  const w = world(); weather(w, 'natural', 16, 2);
  rect(w, 80, 10, 100, 16, ID.CLOUD);
  const cloud = (t) => t === ID.CLOUD || t === ID.RAINCLOUD || t === ID.STORMCLOUD;
  let x0 = 0, n0 = 0;
  for (let y = 0; y < 30; y++) for (let x = 0; x < 200; x++) if (cloud(w.type[w.idx(x, y)])) { x0 += x; n0++; }
  run(w, 60);
  let x1 = 0, n1 = 0;
  for (let y = 0; y < 30; y++) for (let x = 60; x < 140; x++) if (cloud(w.type[w.idx(x, y)])) { x1 += x; n1++; }
  check('Wind blows clouds downwind', x1 / n1 > x0 / n0 + 3, `mean x ${(x0 / n0).toFixed(1)} → ${(x1 / n1).toFixed(1)}`);
}
{
  const w = world(); weather(w, 'clear', 22);
  rect(w, 40, 10, 160, 20, ID.RAINCLOUD);
  run(w, 1200);
  check('Clear weather breaks up clouds', count(w, ID.RAINCLOUD) < 60, `${count(w, ID.RAINCLOUD)} rain-cloud cells left of 1331`);
}
{ // the natural water cycle: warm water evaporates, vapour gathers into cloud up high
  const w = world(160, 100); weather(w, 'natural', 40);
  rect(w, 0, 80, 159, 99, ID.WATER);
  for (let y = 80; y < 100; y++) for (let x = 0; x < 160; x++) w.temp[w.idx(x, y)] = 60;
  let maxCloud = 0;
  run(w, 3000, (ww, k) => { if (k % 100 === 0) maxCloud = Math.max(maxCloud, count(ww, ID.CLOUD) + count(ww, ID.RAINCLOUD)); });
  check('Evaporation forms clouds', maxCloud > 20, `peak ${maxCloud} cloud cells`);
}
{ // dry ice sublimes into CO2 and pours fog
  const w = world(); rect(w, 0, 110, 199, 119, ID.STONE);
  rect(w, 90, 100, 110, 109, ID.DRYICE);
  let fog = 0;
  run(w, 600, (ww, k) => { if (k === 300) fog = count(ww, ID.FOG); });
  check('Dry ice sublimes and fogs', count(w, ID.CO2) > 20 && fog > 10 && w.disc[ID.CO2], `${count(w, ID.CO2)} CO2, ${fog} fog`);
}
{ // carbon dioxide sinks and puts out fire
  const w = world(); rect(w, 0, 110, 199, 119, ID.STONE);
  rect(w, 60, 40, 80, 60, ID.CO2);
  rect(w, 130, 100, 150, 109, ID.FIRE);
  const y0 = 50; run(w, 200);
  let sy = 0, n = 0;
  for (let y = 0; y < 120; y++) for (let x = 0; x < 200; x++) if (w.type[w.idx(x, y)] === ID.CO2) { sy += y; n++; }
  check('Carbon dioxide sinks', n > 0 && sy / n > y0 + 15, `mean y ${(sy / n).toFixed(1)} (started at ${y0})`);
}
{ // wood fire's smoke leaves CO2; CO2 frozen becomes dry ice
  const w = world(); rect(w, 0, 110, 199, 119, ID.STONE);
  rect(w, 80, 90, 120, 109, ID.WOOD); rect(w, 80, 89, 120, 89, ID.FIRE);
  let found = -1;
  run(w, 4000, (ww, k) => { if (found < 0 && ww.disc[ID.CO2]) found = k; });
  check('Smoke leaves carbon dioxide', found >= 0, `CO2 discovered at tick ${found}`);
  const c = world(); rect(c, 60, 40, 100, 60, ID.CO2);
  run(c, 200, (ww) => { for (let y = 0; y < 120; y++) for (let x = 0; x < 200; x++) ww.temp[ww.idx(x, y)] = -120; });
  check('Frozen CO2 becomes dry ice', c.disc[ID.DRYICE], `${count(c, ID.DRYICE)} dry ice`);
}
{ // soap: ash + oil; foam: soap + water
  const w = world();
  for (let y = 100; y < 120; y++) for (let x = 60; x < 140; x++) w.place(w.idx(x, y), (x + y) & 1 ? ID.ASH : ID.OIL);
  run(w, 2000);
  check('Ash + oil makes soap', w.disc[ID.SOAP], `${count(w, ID.SOAP)} soap`);
  const f = world(); rect(f, 60, 100, 140, 119, ID.WATER); rect(f, 90, 80, 110, 85, ID.SOAP);
  run(f, 400);
  check('Soap + water makes foam', f.disc[ID.FOAM], `${count(f, ID.FOAM)} foam`);
}
{ // mud dries to clay, clay fires to brick
  const w = world(); rect(w, 60, 100, 140, 119, ID.MUD);
  let clay = 0;
  run(w, 900, (ww, k) => {
    for (let y = 100; y < 120; y++) for (let x = 60; x <= 140; x++) ww.temp[ww.idx(x, y)] += 4;
    if (k === 300) clay = count(ww, ID.CLAY);
  });
  check('Mud dries to clay, then fires to brick', clay > 50 && count(w, ID.BRICK) > 50, `${clay} clay at tick 300, ${count(w, ID.BRICK)} brick at the end`);
}
{ // undo snapshots restore the world exactly
  const w = world(); rect(w, 60, 100, 140, 119, ID.SAND);
  const snap = w.snapshot();
  rect(w, 0, 0, 199, 50, ID.WATER); run(w, 20);
  w.restore(snap);
  check('Snapshot restores the world', count(w, ID.WATER) === 0 && count(w, ID.SAND) === 81 * 20, `${count(w, ID.SAND)} sand, ${count(w, ID.WATER)} water`);
}
{ // saves survive element ids shifting
  const w = world(); rect(w, 60, 100, 140, 119, ID.EL_U);
  const s = w.serialize();
  s.keys = s.keys.slice(); const k = s.keys.splice(ID.EL_U, 1)[0]; s.keys.push(k); // pretend uranium had another id
  const moved = s.keys.length - 1;
  s.type = s.type.map((v, n) => (n % 2 === 0 && v === ID.EL_U ? moved : n % 2 === 0 && v > ID.EL_U ? v - 1 : v));
  const w2 = world(); w2.load(s);
  check('Saves remap element ids by name', count(w2, ID.EL_U) === 81 * 20, `${count(w2, ID.EL_U)} uranium after load`);
}

let fail = 0;
for (const r of out) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.label.padEnd(42)} ${r.detail}`);
}
process.exit(fail ? 1 : 0);
