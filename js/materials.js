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
      key: 'concrete', name: 'Concrete', group: 'Solids', cat: CAT.STATIC, starter: true,
      colors: ['#9a9a94', '#a4a49e', '#8f8f89', '#adada7'], density: 24, cond: 0.12, cap: 1.2,
      hi: [1500, 'lava', 0.01], acidRes: 0.6, blastRes: 0.75,
      desc: 'Hard, heavy and fireproof. Paint it any colour with the dot on its tile.',
    },
    // ───── liquids ─────
    {
      // data: how long it has left before it sets
      key: 'cement', name: 'Cement', group: 'Liquids', cat: CAT.LIQUID, render: R.LIQUID, starter: true,
      colors: ['#8c8c86', '#96968f', '#84847e', '#909089'], density: 22, cond: 0.12, cap: 2,
      life: [420, 720], disp: 1, visc: 0.12, acidRes: 0.5, blastRes: 0.3,
      desc: 'Wet concrete. Pour it into shape and it sets hard in about ten seconds.',
    },
    {
      key: 'alcohol', name: 'Alcohol', group: 'Liquids', cat: CAT.LIQUID, render: R.LIQUID, starter: true,
      colors: ['#e3eef2', '#d9e7ec', '#ecf4f6'], alpha: 0.5, density: 7.9, cond: 0.15, cap: 2.4,
      flam: 0.95, ign: 365, burn: [50, 100], burnTemp: 900, fireEmit: 0.4,
      burnInto: [['empty', 4], ['steam', 1]], flameColor: '#7f9cff',
      hi: [78, 'empty', 0.004], disp: 5, acidRes: 1, blastRes: 0.1, // boils off slowly, so a flame catches it first
      desc: 'Clear and very flammable: a pale blue flame. Mixes into water, kills plants, fizzes with sodium.',
    },
    {
      key: 'vinegar', name: 'Vinegar', group: 'Liquids', cat: CAT.LIQUID, render: R.LIQUID, starter: true,
      colors: ['#d8c595', '#e0cfa2', '#cfbb8a'], alpha: 0.72, density: 10.1, cond: 0.2, cap: 4,
      hi: [100, 'steam', 0.06], lo: [-2, 'ice', 0.02], conduct: true, disp: 5, acidRes: 1, blastRes: 0.2,
      desc: 'A weak acid. Fizzes with magnesium, zinc and ash, eats rust and concrete, turns copper green, kills weeds.',
    },
    // ───── energy ─────
    {
      key: 'explosion', name: 'Explosion', group: 'Energy', cat: CAT.SPECIAL, render: R.FIRE, virtual: true, starter: true,
      colors: ['#ffd25a', '#ff8a2a', '#e8401a'], emit: 1, acidRes: 1, blastRes: 0,
      desc: 'A blast in the shape of your brush. Colour it like fire with the dot on its tile.',
    },
    {
      // a ray of light: aux is its direction (0–7), data how long it has left
      key: 'light', name: 'Light', group: 'Energy', cat: CAT.SPECIAL, render: R.LIGHT, starter: true,
      colors: ['#fffbe8', '#fff4c8'], density: 0, cond: 0, life: [110, 170], emit: 1, acidRes: 1, blastRes: 0,
      desc: 'Rays that fly straight, bounce off metal, take the colour of stained glass and light up phosphors and solar panels.',
    },
    // ───── trees: the tile is the growing tip; each drops its own seed ─────
    {
      key: 'pine', name: 'Pine', group: 'Plants', cat: CAT.STATIC, render: R.WOOD, starter: true,
      colors: ['#4a6432', '#55703a', '#41592c'], density: 6, cond: 0.06, flam: 0.35, ign: 280, burn: [60, 120],
      burnTemp: 800, fireEmit: 0.3, burnInto: [['ash', 2], ['ember', 1], ['empty', 1]], blastRes: 0.3,
      desc: 'A tall evergreen cone of needles. Grows in soil, drops pinecones, burns hot.',
    },
    {
      key: 'pinecone', name: 'Pinecone', group: 'Plants', cat: CAT.POWDER, starter: true, hidden: true,
      colors: ['#7a4e2a', '#8a5a30', '#6a4424', '#94643a'], density: 8, flam: 0.5, ign: 250, burn: [10, 20],
      burnTemp: 650, fireEmit: 0.2, burnInto: [['ash', 1]], slide: 0.4,
      desc: 'A pine’s seed case. It sprouts in soil.',
    },
    {
      key: 'palm', name: 'Palm', group: 'Plants', cat: CAT.STATIC, render: R.WOOD, starter: true,
      colors: ['#8a7a3a', '#9a8844', '#7c6c34'], density: 6, cond: 0.06, flam: 0.3, ign: 300, burn: [60, 120],
      burnTemp: 750, fireEmit: 0.25, burnInto: [['ash', 2], ['empty', 1]], blastRes: 0.3,
      desc: 'A bare, leaning trunk with a crown of fronds. Grows in sand or soil and drops coconuts.',
    },
    {
      key: 'coconut', name: 'Coconut', group: 'Plants', cat: CAT.POWDER, starter: true, hidden: true,
      colors: ['#5a3e24', '#6a4a2c', '#4e3420'], density: 9, flam: 0.2, ign: 300, burn: [20, 40],
      burnTemp: 600, fireEmit: 0.15, burnInto: [['ash', 1]], slide: 0.3,
      desc: 'Floats on the sea and sprouts where it washes up on sand.',
    },
    {
      key: 'willow', name: 'Willow', group: 'Plants', cat: CAT.STATIC, render: R.WOOD, starter: true,
      colors: ['#7a8a4a', '#86965a', '#6e7e40'], density: 6, cond: 0.06, flam: 0.25, ign: 300, burn: [60, 120],
      burnTemp: 750, fireEmit: 0.25, burnInto: [['ash', 2], ['ember', 1], ['empty', 1]], blastRes: 0.3,
      desc: 'Loves water: plant it in damp soil. A broad crown with long curtains of hanging leaves.',
    },
    {
      key: 'catkin', name: 'Willow seed', group: 'Plants', cat: CAT.POWDER, starter: true, hidden: true,
      colors: ['#eeeede', '#e2e2d0', '#f6f6ea'], density: 1.5, flam: 0.6, ign: 220, burn: [2, 4],
      burnTemp: 400, burnInto: [['empty', 1]], slide: 0.8, life: [900, 1800],
      desc: 'Fluffy seed that drifts on the wind and sprouts in damp soil.',
    },
    // ───── tools ─────
    {
      key: 'paint', name: 'Paint', group: 'Special', cat: CAT.SPECIAL, render: R.CLONE, virtual: true, starter: true,
      colors: ['#ff5a8a', '#5ab0ff', '#ffd25a'], acidRes: 1, blastRes: 0,
      desc: 'Recolours whatever is under the brush. Pick the colour with the dot on its tile.',
    },
    {
      key: 'image', name: 'Image', group: 'Special', cat: CAT.SPECIAL, render: R.CLONE, virtual: true, starter: true,
      colors: ['#c9b27a', '#7a9ac9', '#9ac97a'], acidRes: 1, blastRes: 0,
      desc: 'Place a picture from a file, built out of concrete in its own colours. The brush size sets how big.',
    },
  ]);
})(globalThis);
