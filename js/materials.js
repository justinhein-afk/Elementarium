/* Elementarium — materials added after the periodic table: soil, concrete and cement, alcohol and
 * vinegar, explosion and light, three more trees, and the Paint and Image tools. They are added
 * here, after periodic.js, so every element number before them stays where it was (a saved
 * world's stained glass and fire colours are element numbers). */
(function (G) {
  'use strict';

  const { CAT, R } = G.ELEM;

  G.ELEM.extend([
    // ───── solids ─────
    {
      key: 'soil', name: 'Soil', group: 'Solids', cat: CAT.STATIC, starter: true,
      colors: ['#4a3523', '#523b27', '#3f2c1d', '#5a4130'], density: 13, cond: 0.08, cap: 1.6,
      hi: [1300, 'lava', 0.01], acidRes: 0.3, blastRes: 0.25,
      desc: 'Packed earth that stays put. Plants root in it as in dirt.',
    },
    {
      key: 'concrete', name: 'Concrete', group: 'Solids', cat: CAT.STATIC, render: R.CONCRETE,
      colors: ['#a2a29c', '#a0a09a', '#a4a49e', '#9e9e98'], density: 24, cond: 0.12, cap: 1.2,
      hi: [1500, 'lava', 0.01], acidRes: 0.6, blastRes: 0.75,
      desc: 'Hard, heavy and fireproof. Paint it any colour with the dot on its tile.',
      recipe: 'Cement left to set', hint: 'Pour some cement and wait for it to harden.', from: ['cement'],
    },
    // ───── liquids ─────
    {
      // data: how long it has left before it sets
      key: 'cement', name: 'Cement', group: 'Liquids', cat: CAT.LIQUID, render: R.LIQUID,
      colors: ['#8c8c86', '#96968f', '#84847e', '#909089'], density: 22, cond: 0.12, cap: 2,
      life: [420, 720], disp: 1, visc: 0.12, acidRes: 0.5, blastRes: 0.3,
      desc: 'Wet concrete. Pour it into shape and it sets hard in about ten seconds.',
      recipe: 'Lime stirred into sand', hint: 'Mortar is lime and sand: pour lime over sand.', from: ['lime', 'sand'],
    },
    {
      key: 'alcohol', name: 'Alcohol', group: 'Liquids', cat: CAT.LIQUID, render: R.LIQUID,
      colors: ['#e3eef2', '#d9e7ec', '#ecf4f6'], alpha: 0.5, density: 7.9, cond: 0.15, cap: 2.4,
      flam: 0.95, ign: 365, burn: [50, 100], burnTemp: 900, fireEmit: 0.4,
      burnInto: [['empty', 4], ['steam', 1]], flameColor: '#7f9cff',
      hi: [78, 'empty', 0.004], disp: 5, acidRes: 1, blastRes: 0.1, // boils off slowly, so a flame catches it first
      desc: 'Clear and very flammable: a pale blue flame. Mixes into water, kills plants, fizzes with sodium.',
      recipe: 'Sugar left to ferment in water', hint: 'Dissolve sugar in water and wait.', from: ['sugar', 'water'],
    },
    {
      key: 'vinegar', name: 'Vinegar', group: 'Liquids', cat: CAT.LIQUID, render: R.LIQUID,
      colors: ['#d8c595', '#e0cfa2', '#cfbb8a'], alpha: 0.72, density: 10.1, cond: 0.2, cap: 4,
      hi: [100, 'steam', 0.06], lo: [-2, 'ice', 0.02], conduct: true, disp: 5, acidRes: 1, blastRes: 0.2,
      desc: 'A weak acid. Fizzes with magnesium, zinc and ash, eats rust and concrete, turns copper green, kills weeds.',
      recipe: 'A cell in alcohol', hint: 'Bacteria sour alcohol into vinegar: drop a cell into it.', from: ['cell', 'alcohol'],
    },
    // ───── energy ─────
    {
      key: 'explosion', name: 'Explosion', group: 'Energy', cat: CAT.SPECIAL, render: R.FIRE, virtual: true,
      colors: ['#ffd25a', '#ff8a2a', '#e8401a'], emit: 1, acidRes: 1, blastRes: 0,
      desc: 'A blast in the shape of your brush. Colour it like fire with the dot on its tile.',
      recipe: 'Anything blowing up', hint: 'Set off some gunpowder.', from: ['gunpowder'],
    },
    {
      // a ray of light: aux is its direction (0–7), data how long it has left
      key: 'light', name: 'Light', group: 'Energy', cat: CAT.SPECIAL, render: R.LIGHT,
      colors: ['#fffbe8', '#fff4c8'], density: 0, cond: 0, life: [110, 170], emit: 1, acidRes: 1, blastRes: 0,
      desc: 'Rays that fly straight, bounce off metal, take the colour of stained glass and light up phosphors and solar panels.',
      recipe: 'A flash of lightning', hint: 'Lightning lights up the whole sky.', from: ['lightning'],
    },
    // ───── trees: the tile is the growing tip; each drops its own seed ─────
    {
      key: 'pine', name: 'Pine', group: 'Plants', cat: CAT.STATIC, render: R.WOOD,
      colors: ['#4a6432', '#55703a', '#41592c'], density: 6, cond: 0.06, flam: 0.35, ign: 280, burn: [60, 120],
      burnTemp: 800, fireEmit: 0.3, burnInto: [['ash', 2], ['ember', 1], ['empty', 1]], blastRes: 0.3,
      desc: 'A tall evergreen cone of needles. Grows in soil, drops pinecones, burns hot.',
      recipe: 'A plant touching snow', hint: 'Sprinkle snow on a plant: the hardiest grow into evergreens.', from: ['plant', 'snow'],
    },
    {
      key: 'pinecone', name: 'Pinecone', group: 'Plants', cat: CAT.POWDER, starter: true, hidden: true,
      colors: ['#7a4e2a', '#8a5a30', '#6a4424', '#94643a'], density: 8, flam: 0.5, ign: 250, burn: [10, 20],
      burnTemp: 650, fireEmit: 0.2, burnInto: [['ash', 1]], slide: 0.4,
      desc: 'A pine’s seed case. It sprouts in soil.',
    },
    {
      key: 'palm', name: 'Palm', group: 'Plants', cat: CAT.STATIC, render: R.WOOD,
      colors: ['#8a7a3a', '#9a8844', '#7c6c34'], density: 6, cond: 0.06, flam: 0.3, ign: 300, burn: [60, 120],
      burnTemp: 750, fireEmit: 0.25, burnInto: [['ash', 2], ['empty', 1]], blastRes: 0.3,
      desc: 'A bare, leaning trunk with a crown of fronds. Grows in sand or soil and drops coconuts.',
      recipe: 'A plant touching saltwater', hint: 'Grow a plant at the edge of the sea.', from: ['plant', 'saltwater'],
    },
    {
      key: 'coconut', name: 'Coconut', group: 'Plants', cat: CAT.POWDER, starter: true, hidden: true,
      colors: ['#5a3e24', '#6a4a2c', '#4e3420'], density: 9, flam: 0.2, ign: 300, burn: [20, 40],
      burnTemp: 600, fireEmit: 0.15, burnInto: [['ash', 1]], slide: 0.3,
      desc: 'Floats on the sea and sprouts where it washes up on sand.',
    },
    {
      key: 'willow', name: 'Willow', group: 'Plants', cat: CAT.STATIC, render: R.WOOD,
      colors: ['#7a8a4a', '#86965a', '#6e7e40'], density: 6, cond: 0.06, flam: 0.25, ign: 300, burn: [60, 120],
      burnTemp: 750, fireEmit: 0.25, burnInto: [['ash', 2], ['ember', 1], ['empty', 1]], blastRes: 0.3,
      desc: 'Loves water: plant it in damp soil. A broad crown with long curtains of hanging leaves.',
      recipe: 'A plant touching clay', hint: 'Willows root in the clay of riverbanks.', from: ['plant', 'clay'],
    },
    {
      key: 'catkin', name: 'Willow seed', group: 'Plants', cat: CAT.POWDER, starter: true, hidden: true,
      colors: ['#eeeede', '#e2e2d0', '#f6f6ea'], density: 1.5, flam: 0.6, ign: 220, burn: [2, 4],
      burnTemp: 400, burnInto: [['empty', 1]], slide: 0.8, life: [900, 1800],
      desc: 'Fluffy seed that drifts on the wind and sprouts in damp soil.',
    },
    // ───── tools ─────
    {
      key: 'paint', name: 'Paint', group: 'Special', cat: CAT.SPECIAL, render: R.CLONE, virtual: true, special: true, unlockAt: 24,
      colors: ['#ff5a8a', '#5ab0ff', '#ffd25a'], acidRes: 1, blastRes: 0,
      desc: 'Recolours whatever is under the brush. Pick the colour with the dot on its tile.',
    },
    {
      key: 'image', name: 'Image', group: 'Special', cat: CAT.SPECIAL, render: R.CLONE, virtual: true, special: true, unlockAt: 32,
      colors: ['#c9b27a', '#7a9ac9', '#9ac97a'], acidRes: 1, blastRes: 0,
      desc: 'Place a picture from a file, built out of concrete in its own colours. The brush size sets how big.',
    },
    // ───── new starters: sugar, lime and the cell, and what they lead to ─────
    {
      key: 'sugar', name: 'Sugar', group: 'Powders', cat: CAT.POWDER, render: R.SPARKLE, starter: true,
      colors: ['#f6f3ec', '#ece7dc', '#fbfaf5', '#e3ddd0'], density: 15.9, cond: 0.06, slide: 0.7,
      flam: 0.12, ign: 340, burn: [30, 60], burnTemp: 650, fireEmit: 0.2, burnInto: [['coal', 2], ['smoke', 2], ['empty', 1]],
      hi: [190, 'coal', 0.004], acidRes: 1, blastRes: 0.05, // it caramelises, then chars to carbon (acid: see sim.js)
      desc: 'Sweet crystals. Ferments into alcohol in water, chars black in acid, and ants love it.',
    },
    {
      // milk of lime: slaked lime stirred into water
      key: 'lime', name: 'Lime', group: 'Liquids', cat: CAT.LIQUID, render: R.LIQUID, starter: true,
      colors: ['#eef0ea', '#e6e9e1', '#f5f6f1'], alpha: 0.92, density: 11, cond: 0.18, cap: 3.5,
      hi: [100, 'steam', 0.05], lo: [0, 'ice', 0.02], disp: 3, visc: 0.7, acidRes: 1, blastRes: 0.2,
      desc: 'Milk of lime. Stir it into sand for cement; carbon dioxide turns it to limestone; it neutralises acid.',
    },
    {
      // data: how far a stalactite cell hangs below the rock it grew from (0 for the rock itself)
      key: 'limestone', name: 'Limestone', group: 'Solids', cat: CAT.STATIC, render: R.LIMESTONE,
      colors: ['#d9d1bd', '#cfc6b0', '#e3dcc9', '#c6bca4'], density: 25, cond: 0.15, cap: 1.1,
      hi: [1100, 'lava', 0.02], acidRes: 0.15, blastRes: 0.45,
      desc: 'Pale rock laid down in layers. Acid fizzes it away; water seeping through it grows sharp stalactites.',
      recipe: 'Lime meeting carbon dioxide', hint: 'Let smoke clear over a pool of lime: what it leaves behind turns lime to stone.', from: ['lime', 'co2'],
    },
    {
      // data: age
      key: 'cell', name: 'Cell', group: 'Life', cat: CAT.LIFE, render: R.CELL, starter: true,
      colors: ['#9fe0a8', '#8ad49a', '#b4ecbc', '#7cc890'], density: 10.2, cond: 0.1, cap: 2,
      flam: 0.3, ign: 150, burn: [3, 6], burnTemp: 400, burnInto: [['ash', 1]], hi: [60, 'empty', 0.05], blastRes: 0.05,
      desc: 'A single living cell. What it touches decides what it becomes: in water a fish, on grass a cow, on clay a person…',
    },
    {
      // aux: bit 0 facing, bits 1–7 a counter (meals, or how long it has been buried); data: age
      key: 'cow', name: 'Cow', group: 'Life', cat: CAT.LIFE, render: R.COW,
      colors: ['#f2efe6', '#e6e0d2', '#2f2824', '#f6f3ec'], density: 12, cond: 0.08, cap: 2,
      flam: 0.3, ign: 160, burn: [40, 70], burnTemp: 600, fireEmit: 0.2, burnInto: [['ash', 1]],
      hi: [70, 'ash', 0.05], lo: [-30, 'ice', 0.02], blastRes: 0.05,
      desc: 'Grazes grass and plants, and has calves when well fed. Flees fire, and wolves.',
      recipe: 'A cell on grass', hint: 'Leave a cell in a meadow.', from: ['cell', 'grass'],
    },
    {
      key: 'wolf', name: 'Wolf', group: 'Life', cat: CAT.LIFE, render: R.WOLF,
      colors: ['#7d7a76', '#6a6763', '#8c8984', '#5e5b57'], density: 11, cond: 0.08, cap: 2,
      flam: 0.3, ign: 160, burn: [40, 70], burnTemp: 600, fireEmit: 0.2, burnInto: [['ash', 1]],
      hi: [70, 'ash', 0.05], lo: [-40, 'ice', 0.02], blastRes: 0.05,
      desc: 'A hunter. Runs down cows and people, and breeds when it has eaten. Keeps out of water.',
      recipe: 'A cell touching a cow', hint: 'Where there is prey, a hunter evolves: put a cell beside a cow.', from: ['cell', 'cow'],
    },
    {
      key: 'shark', name: 'Shark', group: 'Life', cat: CAT.LIFE, render: R.SHARK,
      colors: ['#6e7f8e', '#7a8b9a', '#62737f', '#8596a3'], density: 10.5, cond: 0.1, cap: 2,
      hi: [45, 'ash', 0.1], blastRes: 0.15,
      desc: 'Hunts fish, and swimmers. Dies on dry land.',
      recipe: 'A cell touching a fish', hint: 'Where fish swim, a hunter evolves: put a cell beside a fish.', from: ['cell', 'fish'],
    },
    // ───── machines: they open once you have made a battery ─────
    {
      key: 'wire', name: 'Wire', group: 'Machines', cat: CAT.STATIC, render: R.WIRE, special: true, needs: 'battery',
      colors: ['#b8683a', '#c47442', '#a95f34'], density: 89, cond: 0.6, hi: [1085, 'mmetal', 0.03],
      conduct: true, acidRes: 0.6, blastRes: 0.6,
      desc: 'Insulated copper wire. Carries current without rusting, without warming up, and without leaking it into water.',
    },
    {
      // aux: 1 on, 0 off
      key: 'switch', name: 'Switch', group: 'Machines', cat: CAT.STATIC, render: R.SWITCH, special: true, needs: 'battery',
      colors: ['#3c4148', '#43484f'], density: 40, cond: 0.2, conduct: true, hi: [1200, 'mmetal', 0.02], acidRes: 0.6, blastRes: 0.6,
      desc: 'Lets current through while it is on. With Switch selected, click a switch to flip it, and every switch joined to it.',
    },
    {
      // aux: bit 0 set off, bits 1–2 what it senses (0 touch, 1 hotter than, 2 colder than); data: its temperature setting
      key: 'sensor', name: 'Sensor', group: 'Machines', cat: CAT.STATIC, render: R.SENSOR, special: true, needs: 'battery',
      colors: ['#2e3438', '#353b40'], density: 40, cond: 0.5, hi: [1400, 'mmetal', 0.02], acidRes: 0.6, blastRes: 0.6,
      desc: 'Sends current into wire beside it while something rests against it (a heap, a pool, a creature, but not a drop falling past), or while what touches it is hotter (or colder) than its setting.',
    },
    {
      // aux: what it holds (an element, or 0); data: bits 0–1 the way it is going, the rest the push it has left
      key: 'pipe', name: 'Pipe', group: 'Machines', cat: CAT.STATIC, render: R.PIPE, special: true, needs: 'battery',
      colors: ['#6b7480', '#737c88', '#646d78'], density: 60, cond: 0.25, cap: 4, hi: [1500, 'mmetal', 0.02], acidRes: 0.7, blastRes: 0.6, // cap: it holds as much heat as the water in it
      desc: 'Carries liquids, gases and powders. Draw it any width: each stroke is one pipe, walled in on every edge. Erase a bit of wall where you want it open; it joins a pump, tank or valve it touches. Liquid runs down it; only a pump pushes it uphill.',
    },
    {
      key: 'valve', name: 'Valve', group: 'Machines', cat: CAT.STATIC, render: R.PIPE, special: true, needs: 'battery',
      colors: ['#a8823a', '#b48e44', '#9c7632'], density: 60, cond: 0.25, cap: 4, conduct: true, hi: [1500, 'mmetal', 0.02], acidRes: 0.7, blastRes: 0.6,
      desc: 'A tap in a pipe: it lets things through only while powered. Under a tank or a pool it is a plug.',
    },
    {
      // aux: the way it pushes (0 up, 1 right, 2 down, 3 left)
      key: 'pump', name: 'Pump', group: 'Machines', cat: CAT.STATIC, render: R.PUMP, special: true, needs: 'battery',
      colors: ['#3f5f7a', '#46688a', '#3a5670'], density: 70, cond: 0.4, conduct: true, hi: [1500, 'mmetal', 0.02], acidRes: 0.7, blastRes: 0.6,
      desc: 'Powered, it draws in what touches it and pushes it out of the side it faces, into a pipe and uphill if need be. A blob of pump is one big pump.',
    },
    {
      // aux: what it holds; data: how much of it (up to 40 cells' worth)
      key: 'tank', name: 'Tank', group: 'Machines', cat: CAT.STATIC, render: R.TANK, special: true, needs: 'battery',
      colors: ['#5c646c', '#646c74'], density: 70, cond: 0.3, cap: 12, hi: [1500, 'mmetal', 0.02], acidRes: 0.8, blastRes: 0.7, // cap: a tankful warms slowly
      desc: 'Holds forty cells’ worth of one liquid or gas. Fill it from a pipe or by pouring on top; a pipe below draws from it.',
    },
    {
      // aux: the way it pushes (0 up, 1 right, 2 down, 3 left); data: ticks to its next stroke
      key: 'piston', name: 'Piston', group: 'Machines', cat: CAT.STATIC, render: R.PISTON, special: true, needs: 'battery',
      colors: ['#4a4f57', '#52575f'], density: 80, cond: 0.4, conduct: true, hi: [1500, 'mmetal', 0.02], acidRes: 0.7, blastRes: 0.8,
      desc: 'Powered, it pushes out a rod, shoving whatever is in front along, up to 16 cells. Unpowered, it pulls the rod back in.',
    },
    {
      key: 'rod', name: 'Piston rod', group: 'Machines', cat: CAT.STATIC, render: R.ROD, hidden: true,
      colors: ['#c4ccd4', '#b8c0c8'], density: 80, cond: 0.4, hi: [1500, 'mmetal', 0.02], acidRes: 0.7, blastRes: 0.8,
    },
    {
      // the walls built round a pipe when it is drawn (see encase() in sim.js); erase some to make a hole
      key: 'casing', name: 'Pipe wall', group: 'Machines', cat: CAT.STATIC, render: R.CASING, hidden: true,
      colors: ['#6e7884', '#76808c', '#68727e'], density: 60, cond: 0.25, cap: 4, hi: [1500, 'mmetal', 0.02], acidRes: 0.7, blastRes: 0.6,
    },
  ]);
})(globalThis);
