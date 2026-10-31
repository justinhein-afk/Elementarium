/* Elementarium — Element Groups (no DOM; ui.js shows them in their own window).
 * Every periodic element grouped by what it does in the game: the colours it gives a flame, glass,
 * a tube of gas or a spark, how it carries current and what to build with it, magnetism, how it
 * reacts, its radioactivity, its state, melting point and density, the metals that cast, the
 * machines and ships it powers, and the scenes and weapons it opens. All of it is read from the
 * game's own element data, so it always matches what happens when you play. Built as HTML text;
 * each element is a button carrying its type id (data-t) so the window can pick it up. */
(function (G) {
  'use strict';

  const { ELEM, Lab } = G;
  const P = ELEM.periodic;
  const S = Object.fromEntries(P.map((d) => [d.sym, d]));
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const deg = (v) => Lab.deg(v);

  // ───── building blocks ─────
  // An element: its family's colour, number, symbol, name, and a value line and a colour if it has them.
  function chip(sym, value, color) {
    const d = S[sym];
    return `<button type="button" class="g-el fam-${d.fam}${color ? ' has-c' : ''}" data-t="${d.id}"${color ? ` style="--c:${color}"` : ''}`
      + ` title="${esc(`${d.name}, element ${d.z} · ${d.family}`)}"><i>${d.z}</i><b>${d.sym}</b><small>${esc(d.name)}</small>`
      + `${value != null ? `<em>${esc(value)}</em>` : ''}</button>`;
  }
  const chips = (items) => `<div class="g-els">${items.map((it) => (typeof it === 'string' ? chip(it) : chip(it[0], it[1], it[2]))).join('')}</div>`;
  // one colour: a swatch, its name, the elements that give it
  const hue = (name, color, items, note) => `<div class="g-hue"><span class="g-sw" style="--c:${color}" aria-hidden="true"></span>`
    + `<div class="g-hue-body"><div class="g-hue-name">${esc(name)}${note ? ` <span>${esc(note)}</span>` : ''}</div>${chips(items)}</div></div>`;
  // a labelled row of elements
  const row = (label, items, note) => `<div class="g-row"><div class="g-row-label">${esc(label)}${note ? `<span>${esc(note)}</span>` : ''}</div>${chips(items)}</div>`;
  // something to make: what goes in, what you get
  const recipe = (title, parts, result) => `<div class="g-recipe"><div class="g-recipe-title">${esc(title)}</div>`
    + `<div class="g-parts">${parts}</div><p>${esc(result)}</p></div>`;
  const plus = '<span class="g-op">+</span>', or = '<span class="g-op">or</span>', arrow = '<span class="g-op">→</span>';
  const thing = (s) => `<span class="g-thing">${esc(s)}</span>`;
  const plural = (name) => `${name}${name.endsWith('gas') ? 'es' : 's'}`;

  function build() {
    const groups = []; // { part, id, title, how, html }
    const add = (part, id, title, how, html) => groups.push({ part, id, title, how, html });

    // ───── colours ─────
    { // flame colours, by the name the Lab gives them
      const by = new Map();
      for (const d of P.filter((e) => e.flameColor)) {
        const name = Lab.result('flame', d).band;
        if (!by.has(name)) by.set(name, []);
        by.get(name).push(d);
      }
      const order = ['crimson', 'red', 'red-violet', 'pink', 'orange-red', 'yellow', 'pale yellow', 'brilliant white', 'white', 'apple green',
        'bright green', 'green', 'blue-green', 'pale blue', 'blue', 'indigo', 'blue-violet', 'lilac'];
      const names = [...by.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));
      add('Colours', 'flame', 'Flame colours', 'Sprinkle the element into any fire, or drop an alkali metal into water. Sodium’s yellow swamps every other colour in the same fire. Each colour you make yourself can then be painted with the dot on the Fire tile; make every one for rainbow fire.',
        names.map((n) => hue(n, by.get(n)[0].flameColor, by.get(n).map((d) => [d.sym, d.flam ? 'burns itself' : null, d.flameColor]))).join(''));
    }
    { // glow with current
      const names = { He: 'peach', Ne: 'orange-red', Ar: 'violet', Kr: 'white', Xe: 'blue', Rn: 'red', N: 'purple', Na: 'yellow', Hg: 'blue' };
      const gases = P.filter((d) => d.dischargeColor && Lab.stateOf(d) === 'gas'), vapour = P.filter((d) => d.dischargeColor && Lab.stateOf(d) !== 'gas');
      add('Colours', 'current-glow', 'Glow with current', 'Seal a gas in glass with a battery at each end, or wire a phosphor to a battery. Phosphors also light up when radiation hits them, and keep glowing for a moment after.',
        `<h4>Gases that glow</h4>${gases.map((d) => hue(names[d.sym], d.dischargeColor, [[d.sym, d.fam === 'ng' ? 'noble gas' : 'gas', d.dischargeColor]])).join('')}`
        + `<h4>Vapours that glow, once boiled</h4>${vapour.map((d) => hue(names[d.sym], d.dischargeColor, [[d.sym, `boils at ${deg(d.bp)}`, d.dischargeColor]])).join('')}`
        + `<h4>Phosphors: glow, then fade</h4>${P.filter((d) => d.chem.phos).map((d) => hue(d.chem.phos[2], d.phosColor,
          [[d.sym, `afterglow ${(d.chem.phos[1] / 60).toFixed(d.chem.phos[1] < 60 ? 1 : 0)} s`, d.phosColor]])).join('')}`
        + '<h4>Glow from the heat of the current</h4>'
        + hue('white-hot', '#fff4dc', [['W', 'filament, up to 2,600°C'], ['Mo', 'filament, up to 2,300°C']], 'burns out in open air past 1,500°C')
        + hue('red-hot', '#ff5a2a', [['Ni', 'touching chromium'], ['Cr', 'touching nickel']], 'nichrome'));
    }
    add('Colours', 'glass', 'Glass colours', 'Stir a pinch of the metal into molten glass (sand past 1,700°C). The stain spreads through the melt and stays through any number of remelts. Each colour you make can then be painted with the dot on the Glass tile.',
      P.filter((d) => d.glassColor).map((d) => hue((d.desc.match(/turns molten glass ([^,.]+)/) || [])[1] || 'stained', d.glassColor, [[d.sym, null, d.glassColor]])).join(''));
    { // sparks
      const how = { Mg: 'while it burns', Al: 'its dust flashing in a fire', Ti: 'red-hot in open air', Fe: 'filings red-hot in open air', Zr: 'burning past 1,100°C', Ce: 'dropped hard: a lighter flint' };
      const names = { Mg: 'white', Al: 'white', Ti: 'warm white', Fe: 'orange', Zr: 'white', Ce: 'yellow' };
      add('Colours', 'sparks', 'Spark colours', 'Burning metals throw sparks that fly in arcs and light what they land on.',
        P.filter((d) => d.sparkColor).map((d) => hue(names[d.sym] || 'bright', d.sparkColor, [[d.sym, how[d.sym], d.sparkColor]])).join(''));
    }
    { // glow in the dark
      const names = { P: 'green', Pm: 'green', Po: 'blue', Ra: 'mint green', Ac: 'blue', Cm: 'violet', Es: 'blue' };
      add('Colours', 'dark-glow', 'Glow in the dark', 'These shine on their own: white phosphorus by slowly burning in air, the rest by their own radioactivity.',
        P.filter((d) => d.glowColor).map((d) => hue(names[d.sym] || 'glowing', d.glowColor, [[d.sym, d.sym === 'P' ? 'chemiluminescence' : 'radioactive', d.glowColor]])).join(''));
    }
    add('Colours', 'fluids', 'Coloured gases and liquids', 'Most gases are invisible; these are not. Bromine and iodine show their colour once they boil.',
      hue('pale yellow', S.F.gasColor, [['F', 'gas', S.F.gasColor]]) + hue('yellow-green', S.Cl.gasColor, [['Cl', 'gas', S.Cl.gasColor]])
      + hue('red-brown', S.Br.gasColor, [['Br', `vapour past ${deg(S.Br.bp)}`, S.Br.gasColor]]) + hue('violet', S.I.gasColor, [['I', `vapour past ${deg(S.I.bp)}`, S.I.gasColor]])
      + hue('pale blue', S.O.liqColor, [['O', `liquid below ${deg(S.O.bp)}`, S.O.liqColor]]) + hue('clear', S.N.liqColor, [['N', `liquid below ${deg(S.N.bp)}`, S.N.liqColor]])
      + hue('dark red', S.S.liqColor, [['S', `molten past ${deg(S.S.mp)}`, S.S.liqColor]]));
    add('Colours', 'blasts', 'Blast colours', 'Every explosion flashes in its own colour. Mix a metal into gunpowder and the blast takes that metal’s colour, the way fireworks get theirs.',
      hue('pale blue', S.H.blastColor, [['H', 'hydrogen with a spark']])
      + hue('blinding white', '#f0f4ff', P.filter((d) => d.chem.fis).map((d) => [d.sym, 'going critical']))
      + '<h4>Fireworks: the metal mixed into gunpowder</h4>'
      + hue('red', S.Sr.flameColor, [['Sr', null, S.Sr.flameColor]]) + hue('orange', S.Ca.flameColor, [['Ca', null, S.Ca.flameColor]])
      + hue('yellow', S.Na.flameColor, [['Na', null, S.Na.flameColor]]) + hue('green', S.Ba.flameColor, [['Ba', null, S.Ba.flameColor]])
      + hue('blue-green', S.Cu.flameColor, [['Cu', null, S.Cu.flameColor]]) + hue('white', '#ffffff', [['Mg', null, '#ffffff']]));

    // ───── electricity and magnetism ─────
    {
      const ins = P.filter((d) => !d.conduct), con = P.filter((d) => d.conduct);
      add('Electricity and magnetism', 'conduct', 'Conductors and insulators', `${con.length} elements carry current and ${ins.length} don’t. Every metal conducts; so do carbon, the metalloids silicon, germanium, arsenic, antimony and tellurium, the noble gases and nitrogen.`,
        row('Insulators', ins.map((d) => d.sym), `${ins.length}`)
        + Object.keys(ELEM.FAMILY).map((f) => [ELEM.FAMILY[f], con.filter((d) => d.fam === f)]).filter(([, l]) => l.length)
          .map(([name, l]) => row(`Conducts · ${plural(name.toLowerCase())}`, l.map((d) => d.sym), `${l.length}`)).join(''));
    }
    add('Electricity and magnetism', 'superconduct', 'Superconductors', 'Chill one below its temperature and current races through it without heating it.',
      chips(P.filter((d) => d.chem.sc).sort((a, b) => b.chem.sc - a.chem.sc).map((d) => [d.sym, `below ${deg(d.chem.sc)}`])));
    add('Electricity and magnetism', 'sources', 'Makes its own current', 'Power with no battery: each of these makes current when it is set up the right way.',
      recipe('Solar cell', `${chip('Si')}${plus}${thing('open sky or a fire’s light')}`, 'Silicon in light makes current.')
      + recipe('Thermoelectric generator', `${chip('Te')}${or}${chip('Bi')}${plus}${thing('hot at one end, cold at the other')}`, 'A temperature difference across the bar makes current.')
      + recipe('Lemon battery', `${chip('Zn')}${plus}${chip('Cu')}${plus}${thing('saltwater or acid')}`, 'Zinc and copper in the same bath make current; the zinc slowly dissolves.')
      + recipe('Car battery', `${chip('Pb')}${plus}${thing('acid')}`, 'Lead resists the acid and makes current standing in it.')
      + recipe('Nuclear battery', `${chip('Cm')}${plus}${chip('Te')}`, 'Curium heats itself; pressed against tellurium, the heat becomes current.'));
    add('Electricity and magnetism', 'devices', 'Electrical devices to build', 'Wire these to a battery and they do something more than carry current.',
      recipe('Light bulb', `${chip('W')}${or}${chip('Mo')}${plus}${thing('2 batteries')}${plus}${chip('Ar')}${plus}${thing('sealed glass')}`, 'The filament glows white-hot. In open air it burns out past 1,500°C, so the bulb is filled with argon.')
      + recipe('Nichrome heater', `${chip('Ni')}${plus}${chip('Cr')}${plus}${thing('battery')}`, 'Nickel touching chromium glows red-hot and lights fuel laid on it: a toaster element.')
      + recipe('Carbon arc lamp', `${chip('C')}${plus}${chip('C')}${plus}${thing('a gap of 1–2 cells')}${plus}${thing('battery')}`, 'A blinding thread of plasma jumps the gap and carries the current on.')
      + recipe('Capacitor', `${chip('Ta')}${plus}${thing('battery')}`, 'Tantalum soaks up a dozen pulses, glowing bluer, then lets them all go in one crack of sparks.')
      + recipe('Neon sign', `${chip('Ne')}${plus}${thing('sealed glass')}${plus}${thing('2 batteries')}`, 'Any glowing gas from Glow with current works the same way.')
      + recipe('Electromagnet', `${chip('Fe')}${plus}${thing('battery')}`, 'Iron, cobalt or nickel carrying current lifts filings; take the battery away and they fall.'));
    add('Electricity and magnetism', 'magnets', 'Magnetism', 'Magnetic only below the real Curie temperature: heat one past it and it lets go of everything. Switch the Magnet tool to Magnetic and it picks up only these.',
      row('Permanent magnets', P.filter((d) => d.chem.magnet).map((d) => [d.sym, `up to ${deg(d.chem.curie)}`]))
      + row('Pulled by a magnet', P.filter((d) => d.chem.curie !== null && !d.chem.magnet).sort((a, b) => b.chem.curie - a.chem.curie).map((d) => [d.sym, `below ${deg(d.chem.curie)}`]))
      + row('Clings to a magnet as a liquid', [['O', `below ${deg(S.O.bp)}`]])
      + row('Pushed away by a magnet', [['Bi', 'diamagnetic']]));

    // ───── chemistry ─────
    {
      const word = (p) => (p < 0.3 ? 'gentle' : p < 0.6 ? 'sharp' : p < 0.8 ? 'violent' : 'most violent');
      add('Chemistry', 'water', 'In water', 'Drop the element into water.',
        row('Explodes', P.filter((d) => d.chem.wr).sort((a, b) => a.chem.wr[2] - b.chem.wr[2]).map((d) => [d.sym, word(d.chem.wr[2]), d.flameColor]), 'gentlest first')
        + row('Fizzes hydrogen', P.filter((d) => d.chem.fizz).map((d) => d.sym))
        + row('Safe under water', [['P', 'ignites in air instead'], ['Mg', 'until it burns']]));
    }
    {
      const solids = P.filter((d) => Lab.stateOf(d) !== 'gas');
      const res = solids.filter((d) => d.acidRes >= 0.97), fiz = solids.filter((d) => d.acidRes < 0.97 && d.chem.acidH), eaten = solids.filter((d) => d.acidRes < 0.97 && !d.chem.acidH);
      add('Chemistry', 'acid', 'In acid', 'Drop the element into acid. Metals more reactive than hydrogen dissolve with a fizz; the noble metals don’t dissolve at all.',
        row('Fizzes hydrogen', fiz.map((d) => d.sym), `${fiz.length}`) + row('Resists acid', res.map((d) => d.sym), `${res.length}`) + row('Eaten slowly, no fizz', eaten.map((d) => d.sym), `${eaten.length}`));
    }
    add('Chemistry', 'burns', 'Burns', 'Heat it past its ignition point in air. Any gas counts as air for burning; sealed away from it, nothing burns.',
      chips(P.filter((d) => d.flam).sort((a, b) => a.ign - b.ign).map((d) => [d.sym, `lights at ${deg(d.ign)}${d.burnTemp >= 2000 ? `, burns at ${deg(d.burnTemp)}` : ''}`, d.flameColor])));
    add('Chemistry', 'corrosive', 'Corrosive and toxic', 'Halogens eat metals into salt, strongest first. Toxic elements poison fish and plants.',
      row('Corrosive', P.filter((d) => d.chem.corr).sort((a, b) => b.chem.corr - a.chem.corr).map((d) => [d.sym, `strength ${d.chem.corr}`]))
      + row('Toxic', P.filter((d) => d.chem.toxic).map((d) => d.sym)));
    add('Chemistry', 'contact', 'Contact reactions', 'Two things that react when they touch. Each flashes a burst of light where it happens.',
      recipe('Salt from metal and gas', `${chip('Na')}${plus}${chip('Cl')}`, 'Sodium (or any alkali metal) burns in chlorine in its flame colour, leaving salt and white smoke.')
      + recipe('Crumbling aluminium', `${chip('Ga')}${thing('molten')}${plus}${chip('Al')}`, 'Molten gallium seeps between aluminium’s grains and it falls apart.')
      + recipe('Burning aluminium', `${chip('Br')}${plus}${chip('Al')}`, 'Bromine sets aluminium alight on contact.')
      + recipe('Purple eruption', `${chip('I')}${plus}${chip('Al')}${plus}${thing('a drop of water')}`, 'Nothing happens dry; one drop of water starts it, and iodine boils off in a purple cloud.')
      + recipe('Amalgam', `${chip('Au')}${plus}${chip('Hg')}`, 'Gold dissolves in liquid mercury. Boil the mercury off and the gold is left.')
      + recipe('Hydrogen sponge', `${chip('Pd')}${plus}${chip('H')}`, 'Palladium soaks up hydrogen deep into the metal and breathes it out past 300°C.')
      + recipe('Flameless catalyst', `${chip('Pt')}${plus}${chip('H')}`, 'Platinum warms up as hydrogen or methane reacts on its surface, then lights it.')
      + recipe('Burning in carbon dioxide', `${chip('Mg')}${thing('burning')}${plus}${thing('carbon dioxide or water')}`, 'Burning magnesium carries on in carbon dioxide, leaving carbon; water turns to hydrogen and explodes.')
      + recipe('Splitting steam', `${chip('Zr')}${thing('red-hot')}${plus}${thing('steam')}`, 'Zirconium tears the oxygen out of steam and leaves hydrogen, as at Fukushima.')
      + recipe('Self-igniting', `${chip('P')}${plus}${thing('open air')}`, 'White phosphorus warms itself in air until it bursts into flame. Under water it is safe.')
      + recipe('Bleach', `${chip('Cl')}${plus}${thing('flowers')}`, 'Chlorine bleaches petals white before it kills them.')
      + recipe('Radium paint', `${chip('Ra')}${plus}${chip('Zn')}`, 'Every alpha particle makes a green spark of light in the zinc, as on an old watch dial.')
      + recipe('Diamond', `${chip('C')}${plus}${thing('sealed from air')}${plus}${thing('2,500°C')}`, 'Carbon turns to diamond.'));

    // ───── nuclear ─────
    {
      const fast = P.filter((d) => Lab.band('geiger', d) === 'crackles'), slow = P.filter((d) => Lab.band('geiger', d) === 'clicks');
      add('Nuclear', 'radioactive', 'Radioactive', 'Hold a Geiger counter to it. The strongest also warm themselves with their own decay.',
        row('Crackles non-stop', fast.map((d) => d.sym), `${fast.length}`) + row('Clicks now and then', slow.map((d) => d.sym), `${slow.length}`)
        + row('Warms itself', P.filter((d) => d.chem.heat >= 0.05).sort((a, b) => b.chem.heat - a.chem.heat).map((d) => d.sym), 'hottest first'));
    }
    { // decay chains, from the elements nothing decays into down to a stable one
      const to = new Map(P.filter((d) => d.chem.decay).map((d) => [d.sym, d.chem.decay[1]]));
      const children = new Set(to.values());
      const chain = (s) => { const c = [s]; while (to.has(c[c.length - 1])) c.push(to.get(c[c.length - 1])); return c; };
      add('Nuclear', 'chains', 'Decay chains', 'Each element decays into the next. An alpha decay also gives off a puff of helium.',
        [...to.keys()].filter((s) => !children.has(s)).sort((a, b) => S[b].z - S[a].z).map((s) => `<div class="g-chain">${chain(s).map((x) => chip(x)).join(arrow)}</div>`).join(''));
    }
    add('Nuclear', 'fission', 'Fission and neutrons', 'A fissile lump big enough goes critical: about 400 grains of uranium in the open. Neutron emitters start chain reactions on their own.',
      row('Fissile', P.filter((d) => d.chem.fis).sort((a, b) => b.chem.fis - a.chem.fis).map((d) => [d.sym, `split chance ${d.chem.fis}`]))
      + row('Gives off neutrons', P.filter((d) => d.chem.nem).sort((a, b) => b.chem.nem - a.chem.nem).map((d) => d.sym), 'strongest first')
      + row('Control rods: absorb neutrons', P.filter((d) => d.chem.abs).sort((a, b) => b.chem.abs - a.chem.abs).map((d) => [d.sym, `${Math.round(d.chem.abs * 100)}%`]), 'strongest first')
      + recipe('Neutron reflector', `${chip('Be')}${plus}${chip('U')}`, 'Beryllium bounces neutrons back, so a lump too small on its own goes critical.')
      + recipe('Moderator', `${chip('C')}${plus}${chip('U')}`, 'Graphite slows neutrons, and a slow neutron is three times as likely to split the next nucleus.')
      + recipe('Neutron source', `${chip('Po')}${or}${chip('Am')}${plus}${chip('Be')}`, 'Radiation striking beryllium knocks neutrons out of it.'));
    add('Nuclear', 'fusion', 'Fusion', 'Seal calcium in with an actinide and heat them past 3,000°C (or fire the calcium in fast). They fuse into a superheavy element that lasts about a second.',
      P.filter((d) => d.chem.fuse).map((d) => `<div class="g-chain">${chip('Ca')}${plus}${chip(d.sym)}${arrow}${chip(d.chem.fuse)}</div>`).join(''));

    // ───── physical ─────
    add('Physical', 'state', 'State at room temperature', 'The game decides solid, liquid or gas for every grain from its own temperature.',
      row('Gases', P.filter((d) => Lab.stateOf(d) === 'gas').map((d) => [d.sym, `boils ${deg(d.bp)}`]))
      + row('Liquids', P.filter((d) => Lab.stateOf(d) === 'liquid').map((d) => [d.sym, `freezes ${deg(d.mp)}`]))
      + row('Melts in your hand', P.filter((d) => d.mp > 20 && d.mp < 40).sort((a, b) => a.mp - b.mp).map((d) => [d.sym, `melts ${deg(d.mp)}`]), 'under 40°C'));
    add('Physical', 'melting', 'Melting points', 'The bands the Lab’s handbook uses for the Heat test, each element’s exact melting point under its symbol.',
      ['melts below 100°C', 'melts 100–500°C', 'melts 500–1,000°C', 'melts 1,000–2,000°C', 'solid past 2,000°C'].map((b) => {
        const l = P.filter((d) => Lab.band('heat', d) === b).sort((x, y) => x.mp - y.mp);
        return row(b[0].toUpperCase() + b.slice(1), l.map((d) => [d.sym, deg(d.mp)]), `${l.length}`);
      }).join(''));
    {
      const g = (d) => d.density / 10, num = (v) => (v < 10 ? v.toFixed(2) : v.toFixed(1));
      add('Physical', 'density', 'Density', 'The bands the Lab’s handbook uses for the Weigh test, with each element’s real density. Gases are weighed against air (1.3 g/L).',
        [['under 1 g/cm³', 'Floats on water'], ['1–5 g/cm³', '1–5 g/cm³'], ['5–10 g/cm³', '5–10 g/cm³'], ['10–15 g/cm³', '10–15 g/cm³'], ['over 15 g/cm³', 'Over 15 g/cm³: sinks even in mercury']].map(([b, label]) => {
          const l = P.filter((d) => Lab.band('weigh', d) === b).sort((x, y) => g(x) - g(y));
          return row(label, l.map((d) => [d.sym, num(g(d))]), `${l.length}`);
        }).join('')
        + row('Gases lighter than air', P.filter((d) => Lab.band('weigh', d) === 'gas, lighter than air').map((d) => [d.sym, `${d.gl} g/L`]))
        + row('Gases heavier than air', P.filter((d) => /gas, (heavier|far heavier)/.test(Lab.band('weigh', d))).sort((a, b) => a.gl - b.gl).map((d) => [d.sym, `${d.gl} g/L`])));
    }
    add('Physical', 'families', 'Families', 'The table’s own groups, as coloured on the Periodic table tab.',
      Object.entries(ELEM.FAMILY).map(([f, name]) => { const l = P.filter((d) => d.fam === f); return row(plural(name), l.map((d) => d.sym), `${l.length}`); }).join(''));
    // ───── machines and building ─────
    add('Machines and building', 'cast', 'Cast metals', 'Melt the metal in your world and let it cool: it sets into a solid block that stays where you put it, and the block joins the alchemy table. Magnesium has to be sealed in, packed full, or it burns; tungsten is melted sealed in argon.',
      chips(ELEM.list.filter((d) => d && d.castOf !== undefined).map((d) => ELEM.list[d.castOf]).sort((a, b) => a.mp - b.mp).map((d) => [d.sym, `melts ${deg(d.mp)}`])));
    { // each part opens the first time a battery touches its partner
      const parts = ELEM.list.filter((d) => d && d.special && d.needs);
      add('Machines and building', 'parts', 'Machine parts', 'Each part opens the first time a battery touches the right thing in your world. Any conductor above carries their current; wire does it without rusting or leaking into water.',
        parts.map((d) => recipe(d.name, `${thing('Battery')}${plus}${thing(ELEM.byKey[G.Unlocks.partner(d.key)].name)}`, d.desc.split('. ')[0].replace(/\.$/, '') + '.')).join(''));
    }
    add('Machines and building', 'ships', 'Ships and fuel', 'Whatever a thruster is joined to in metal, glass or machine parts flies as one ship. Hydrogen is the only element on this table a thruster burns; the other fuels come from the alchemy table.',
      recipe('Rocket', `${thing('Thruster')}${plus}${thing('battery')}${plus}${chip('H')}${or}${thing('oil, methane, alcohol or napalm')}`, 'Each thruster lifts up to 75 cells of ship. Land on landing legs and a hard landing breaks nothing.'));

    // ───── what they open ─────
    { // a scene built from periodic elements opens once every one of them is unlocked
      const needs = Lab.sceneNeeds(G.Scenes), name = (n) => (G.UI ? G.UI.sceneName(n) : n);
      const also = { reactor: 'and win chapter VIII of the Journey', city: 'and make 5 colours of stained glass' };
      add('What they open', 'scenes', 'Scenes they open', 'A scene built from periodic elements opens once you have unlocked every one of them in the Lab.',
        ['magnets', 'reactor', 'city'].filter((n) => needs[n]).map((n) => row(name(n), needs[n].map((t) => ELEM.list[t].sym), also[n])).join('')
        + row(name('electrics'), [['W', 'its Try it star']], 'a light bulb'));
    }
    add('What they open', 'weapons', 'Weapons they earn', 'Most weapons are earned in your own world or in the Journey. One of them needs an element of this table.',
      recipe('Hydrogen bomb', `${thing('Nuke')}${plus}${chip('H')}`, 'Set off 5 Nukes with 60 or more cells of hydrogen in their reach.'));
    return groups;
  }

  // The whole window's contents: a list of the groups by part, then the parts.
  function html() {
    const groups = build(), parts = [...new Set(groups.map((g) => g.part))];
    const nav = parts.map((p) => `<div class="g-nav-part"><span>${esc(p)}</span>`
      + groups.filter((g) => g.part === p).map((g) => `<a href="#g-${g.id}" data-goto="g-${g.id}">${esc(g.title)}</a>`).join('') + '</div>').join('');
    return `<nav class="g-nav" aria-label="Groups">${nav}</nav>` + parts.map((p) => `<section class="g-part"><h3>${esc(p)}</h3>`
      + groups.filter((g) => g.part === p).map((g) => `<article class="g-group" id="g-${g.id}"><header><h4 class="g-title">${esc(g.title)}</h4>`
        + `<p>${esc(g.how)}</p></header>${g.html}</article>`).join('') + '</section>').join('');
  }

  G.Groups = { build, html, count: () => build().length };
})(globalThis);
