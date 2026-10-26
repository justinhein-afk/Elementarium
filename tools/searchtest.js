// Headless checks for the search box: atomic numbers, names, symbols, colours, misspellings, and
// the categories coming in order of their best match.
// Run: node tools/searchtest.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
for (const f of ['elements.js', 'periodic.js', 'sim.js', 'facts.js', 'lab.js', 'tryit.js', 'search.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
}
const { ELEM, Search } = globalThis;
const P = ELEM.periodic;

const out = [];
const check = (label, ok, detail) => out.push({ label, ok, detail });
const top = (q) => { const r = Search.query(q); return r && r.groups.length ? r.groups[0].items[0].e : null; };
const names = (q, cat = 'Periodic table') => { const g = Search.query(q).groups.find((x) => x.cat === cat); return g ? g.items.map((h) => h.e.name) : []; };

// the UI adds the alchemy table, the weapons and the tools; a few stand-ins for them here
Search.add({ cat: 'Tools', kind: 'tool', id: 'heat', name: 'Heat', order: 0, fields: [['Heat', 10, 'name'], ['Heats what is under the brush.', 3]] });
Search.add({ cat: 'Alchemy', kind: 'element', id: 6, name: 'Fire', order: 5, fields: [['Fire', 10, 'name'], ['Ig', 0, 'sym'], ['Energy', 5]] });
Search.add({ cat: 'Alchemy', kind: 'element', id: 9, name: 'Metal', order: 9, fields: [['Metal', 10, 'name'], ['Fe', 0, 'sym']] });
Search.add({ cat: 'Weapons', kind: 'weapon', id: 'nuke', name: 'Nuke', order: 0, fields: [['Nuke', 10, 'name'], ['Doomsday', 4]] });
Search.add({ cat: 'Alchemy', kind: 'element', id: 30, name: 'Secret', order: 30, visible: () => false, fields: [['Secret', 10, 'name']] });

{
  const wrong = P.filter((d) => top(String(d.z)) !== Search.query(String(d.z)).groups[0].items[0].e || top(String(d.z)).d !== d);
  check('Every atomic number finds its element', !wrong.length, wrong.length ? wrong.map((d) => d.z).join(' ') : '1 to 118');
  check('A number past the table finds nothing', Search.query('200').groups.length === 0 && Search.query('0').groups.length === 0, '0 and 200');
}
{
  const byName = P.filter((d) => !top(d.name) || top(d.name).d !== d), bySym = P.filter((d) => !top(d.sym) || top(d.sym).d !== d);
  check('Every element is the top hit for its name', !byName.length, byName.map((d) => d.sym).join(' ') || '118 of 118');
  check('…and for its symbol', !bySym.length, bySym.map((d) => d.sym).join(' ') || '118 of 118');
  check('Accents and capitals don’t matter', top('CAESIUM').name === 'Caesium' && names('ørsted').includes('Aluminium'), 'CAESIUM, ørsted');
}
{
  check('Colours find their elements', names('lilac').join() === 'Potassium' && names('cobalt blue')[0] === 'Cobalt'
    && names('orange-red').includes('Neon') && names('glows orange red').includes('Neon'), `lilac: ${names('lilac')}; orange red: ${names('glows orange red')}`);
  const blue = names('blue flame');
  check('“blue flame” finds the blue-flame elements', ['Hydrogen', 'Sulfur', 'Copper', 'Selenium', 'Caesium'].every((n) => blue.includes(n)), blue.join(', '));
  check('Stories and experiments are searchable', names('davy').includes('Potassium') && names('lemon battery').includes('Zinc'), `davy: ${names('davy').length} elements`);
}
{
  const r = Search.query('potasium');
  check('A misspelt name finds the element', r.fuzzy && r.groups[0].items[0].e.name === 'Potassium', 'potasium → Potassium');
  check('One or two letters match only names and symbols', names('fe').join() === 'Iron,Fermium', names('fe').join(', '));
  check('Undiscovered things stay hidden', !Search.query('secret').groups.length, 'an alchemy element not found yet');
}
{
  const order = (q) => Search.query(q).groups.map((g) => g.cat).join(' > ');
  check('The best match’s category comes first', order('heat').startsWith('Tools') && order('fire').startsWith('Alchemy') && order('nuke') === 'Weapons',
    `heat: ${order('heat')}; fire: ${order('fire')}`);
  check('An empty box closes the results', Search.query('   ') === null, 'blank');
}

let fail = 0;
for (const r of out) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.label.padEnd(46)} ${r.detail}`);
}
process.exit(fail ? 1 : 0);
