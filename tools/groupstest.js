// Headless checks for the Element Groups book: it builds every group from the game's data, shows
// every element somewhere, and nothing in it comes out blank or broken.
// Run: node tools/groupstest.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
for (const f of ['elements.js', 'periodic.js', 'sim.js', 'facts.js', 'lab.js', 'groups.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
}
const { ELEM, Groups } = globalThis;
const P = ELEM.periodic;

const out = [];
const check = (label, ok, detail) => out.push({ label, ok, detail });
const groups = Groups.build(), html = Groups.html();

check('Every group builds', groups.length >= 25 && groups.every((g) => g.html.length > 50), `${groups.length} groups in ${new Set(groups.map((g) => g.part)).size} parts`);
const shown = new Set([...html.matchAll(/data-t="(\d+)"/g)].map((m) => +m[1]));
check('Every element appears in a group', P.every((d) => shown.has(d.id)), `${shown.size} of ${P.length}`);
check('Every tile is a real element', [...shown].every((t) => ELEM.list[t] && ELEM.list[t].periodic), 'all periodic');
const bad = html.match(/undefined|NaN|>null<|\[object/g) || [];
check('Nothing comes out blank or broken', !bad.length, bad.length ? bad.slice(0, 5).join(', ') : 'no undefined, NaN or null');
const ids = groups.map((g) => g.id);
check('Every jump link has its group', new Set(ids).size === ids.length && [...html.matchAll(/data-goto="g-([a-z-]+)"/g)].every((m) => ids.includes(m[1])), `${ids.length} links`);
const colours = [...html.matchAll(/--c:(#[0-9a-fA-F]{6}|undefined|null)/g)].map((m) => m[1]);
check('Every swatch has a colour', colours.length > 50 && colours.every((c) => c.startsWith('#')), `${colours.length} swatches`);

let fail = 0;
for (const r of out) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.label.padEnd(46)} ${r.detail}`);
}
process.exit(fail ? 1 : 0);
