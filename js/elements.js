/* Elementarium — element definitions.
 * Every element is data: physics (density, heat), chemistry (burning, phase changes),
 * appearance and its place in the discovery tree. sim.js compiles these into flat tables. */
(function (G) {
  'use strict';

  const CAT = { EMPTY: 0, STATIC: 1, POWDER: 2, LIQUID: 3, GAS: 4, LIFE: 5, SPECIAL: 6 };
  const AMBIENT = 20;
  // How many element numbers there are. A cell's element is a 16-bit number; the last two numbers
  // are taken (NT − 1 is the invisible map border, NT − 2 marks rainbow fire), so 1,022 elements
  // fit. Tables indexed by a pair of elements (contact reactions) are NT × NT, which is why this
  // isn't 65,536.
  const NT = 1024;

  // How the renderer colors a cell.
  const R = {
    PAL: 0, FIRE: 1, LAVA: 2, LIQUID: 3, SMOKE: 4, FLOWER: 5, FIREFLY: 6, BRICK: 7, PLASMA: 8,
    SPARK: 9, DIAMOND: 10, CLONE: 11, VOID: 12, MOLTEN: 13, EMBER: 14, BATTERY: 15, GAS: 16,
    WOOD: 17, PLANT: 18, FISH: 19, WALL: 20, METAL: 21, HUMAN: 22, HEAD: 23, BIRD: 24, PERIODIC: 25, RAD: 26,
    GLASS: 27, ICE: 28, CLOUD: 29, FOG: 30, FOAM: 31, SPARKLE: 32, CO2: 33,
    GRASS: 34, CACTUS: 35, VINE: 36, MUSHROOM: 37, LILY: 38, MSPARK: 39, LIGHT: 40,
    CELL: 41, COW: 42, WOLF: 43, SHARK: 44, LIMESTONE: 45, CONCRETE: 46,
  };

  const GROUPS = ['Solids', 'Powders', 'Liquids', 'Gases', 'Energy', 'Plants', 'Life', 'Special'];

  // hi / lo: [temperature, becomes, probability per tick]
  // burnInto: [[element, weight], ...]
  // explode: [radius, power]
  const list = [
    {
      key: 'empty', name: 'Air', cat: CAT.EMPTY, hidden: true, cond: 0.003, cap: 0.5, colors: ['#000000'],
      acidRes: 1, blastRes: 0,
    },

    // ───────────────────────── starters ─────────────────────────
    {
      key: 'wall', name: 'Wall', group: 'Solids', cat: CAT.STATIC, render: R.WALL, starter: true,
      colors: ['#3b4150', '#41475a', '#373c4a'], cond: 0, acidRes: 1, blastRes: 99,
      desc: 'Unbreakable and inert. Blocks heat and everything else.',
    },
    {
      key: 'sand', name: 'Sand', group: 'Powders', cat: CAT.POWDER, starter: true,
      colors: ['#e3c170', '#d8b462', '#ecce86', '#cfa955'], density: 16, cond: 0.08,
      hi: [1700, 'mglass', 0.04], blastRes: 0.05, slide: 0.9, acidRes: 0.95,
      desc: 'Shrugs off acid. Melts into glass at 1700°C.',
    },
    {
      key: 'water', name: 'Water', group: 'Liquids', cat: CAT.LIQUID, render: R.LIQUID, starter: true,
      colors: ['#2c74d6', '#3080e0', '#276bc7', '#3a8ae6'], alpha: 0.86, density: 10, cond: 0.2, cap: 4,
      loss: 0.0004, hi: [100, 'steam', 0.08], lo: [0, 'ice', 0.03], acidRes: 1, conduct: true, disp: 5,
      blastRes: 0.2,
      desc: 'Freezes, boils, conducts. Most discoveries start here.',
    },
    {
      key: 'stone', name: 'Stone', group: 'Solids', cat: CAT.STATIC, density: 26, starter: true,
      colors: ['#6e7177', '#64676d', '#787b81', '#5d6066'], cond: 0.18, hi: [1100, 'lava', 0.02],
      acidRes: 0.5, blastRes: 0.55,
      desc: 'Solid rock. Melts into lava at 1100°C.',
    },
    {
      key: 'wood', name: 'Wood', group: 'Solids', cat: CAT.STATIC, density: 6, render: R.WOOD, starter: true,
      colors: ['#7d5231', '#8a5c37', '#714a2c', '#93653d'], cond: 0.06,
      flam: 0.25, ign: 300, burn: [260, 420], burnTemp: 850, fireEmit: 0.25,
      burnInto: [['ash', 6], ['ember', 2], ['empty', 2]], hi: [350, 'coal', 0.01], blastRes: 0.3,
      desc: 'Burns slow and hot. Heated without air, it turns to coal.',
    },
    {
      key: 'fire', name: 'Fire', group: 'Energy', cat: CAT.GAS, render: R.FIRE, starter: true,
      colors: ['#ffd25a', '#ff8a2a', '#e8401a'], density: 0.3, cond: 0.3, cap: 0.5, temp: 850,
      life: [18, 48], emit: 1, acidRes: 1, blastRes: 0,
      desc: 'Heats what it touches and spreads to anything that burns.',
    },
    {
      key: 'dirt', name: 'Dirt', group: 'Powders', cat: CAT.POWDER, starter: true,
      colors: ['#6a4a2e', '#5d4128', '#765336', '#553a22'], density: 15, cond: 0.07, slide: 0.35,
      hi: [1300, 'lava', 0.01],
      desc: 'Loose soil. Plants root in it; water makes it mud.',
    },
    {
      key: 'seed', name: 'Seed', group: 'Plants', cat: CAT.POWDER, starter: true, hidden: true,
      colors: ['#cdb57a', '#bba062', '#dbc58f'], density: 8, flam: 0.5, ign: 250, burn: [8, 16],
      burnTemp: 600, fireEmit: 0.2, burnInto: [['ash', 1]], slide: 0.5,
      desc: 'Sprouts on soil, fastest in mud.',
    },
    // the other kinds of seed: each sprouts where its plant really would (see sprout() in sim.js)
    {
      key: 'acorn', name: 'Acorn', group: 'Plants', cat: CAT.POWDER, starter: true, hidden: true,
      colors: ['#8a5a2b', '#9b6a35', '#7a4e24', '#a8783e'], density: 9, flam: 0.4, ign: 260, burn: [10, 18],
      burnTemp: 600, fireEmit: 0.2, burnInto: [['ash', 1]], slide: 0.4,
      desc: 'Plant it in soil to grow an oak.',
    },
    {
      key: 'grassseed', name: 'Grass seed', group: 'Plants', cat: CAT.POWDER, starter: true, hidden: true,
      colors: ['#cfc77a', '#bdb465', '#ddd690'], density: 6, flam: 0.6, ign: 240, burn: [6, 12],
      burnTemp: 550, fireEmit: 0.2, burnInto: [['ash', 1]], slide: 0.6,
      desc: 'Sow on soil; grass creeps across bare ground.',
    },
    {
      key: 'cactusseed', name: 'Cactus seed', group: 'Plants', cat: CAT.POWDER, starter: true, hidden: true,
      colors: ['#2e2622', '#3a2f28', '#241e1a'], density: 9, flam: 0.3, ign: 280, burn: [8, 14],
      burnTemp: 550, fireEmit: 0.15, burnInto: [['ash', 1]], slide: 0.5,
      desc: 'Sprouts only in dry sand. Rots in water.',
    },
    {
      key: 'vineseed', name: 'Vine seed', group: 'Plants', cat: CAT.POWDER, starter: true, hidden: true,
      colors: ['#6a5030', '#7a5c38', '#5c4428'], density: 8, flam: 0.5, ign: 250, burn: [8, 16],
      burnTemp: 600, fireEmit: 0.2, burnInto: [['ash', 1]], slide: 0.5,
      desc: 'Sow at the foot of a wall or tree and it climbs.',
    },
    {
      key: 'spores', name: 'Spores', group: 'Plants', cat: CAT.POWDER, starter: true, hidden: true,
      colors: ['#d9c9ad', '#c9b596', '#e8dcc6', '#bfa888'], density: 2, flam: 0.3, ign: 250, burn: [2, 4],
      burnTemp: 400, burnInto: [['empty', 1]], slide: 0.8, life: [1200, 2400],
      desc: 'Sprouts mushrooms where it is damp or shaded.',
    },
    {
      key: 'lilyseed', name: 'Lily seed', group: 'Plants', cat: CAT.POWDER, starter: true, hidden: true,
      colors: ['#4a5a30', '#566838', '#3e4c28'], density: 12, flam: 0.4, ign: 250, burn: [8, 16],
      burnTemp: 600, fireEmit: 0.2, burnInto: [['ash', 1]], slide: 0.5,
      desc: 'Drop it in a pond; it grows up to the surface.',
    },
    {
      key: 'sapling', name: 'Oak', group: 'Plants', cat: CAT.STATIC, render: R.WOOD,
      colors: ['#6f8a3a', '#7a9844', '#647c34'], density: 7, cond: 0.06, flam: 0.3, ign: 300, burn: [60, 120],
      burnTemp: 750, fireEmit: 0.25, burnInto: [['ash', 2], ['ember', 1], ['empty', 1]], blastRes: 0.3,
      desc: 'A broad oak with a low, spreading crown. Grows in soil and drops acorns.',
      recipe: 'A plant growing against wood', hint: 'Let a plant grow up against a block of wood.', from: ['plant', 'wood'],
    },
    {
      key: 'litter', name: 'Dead leaves', group: 'Plants', cat: CAT.POWDER, hidden: true,
      colors: ['#8a6a3a', '#7a5a2e', '#9c7a44', '#6a4a26', '#a8864c'], density: 3, cond: 0.05,
      flam: 0.8, ign: 220, burn: [4, 10], burnTemp: 520, fireEmit: 0.2, burnInto: [['ash', 1], ['empty', 1]],
      slide: 0.6, blastRes: 0,
      desc: 'Dead leaves. Burns fast; rots into soil when damp.',
    },
    {
      key: 'salt', name: 'Salt', group: 'Powders', cat: CAT.POWDER, starter: true, render: R.SPARKLE,
      colors: ['#eeeeea', '#e3e3dd', '#f8f8f5', '#d9d9d2'], density: 13, slide: 0.8,
      desc: 'Dissolves in water and melts ice.',
    },
    {
      key: 'oil', name: 'Oil', group: 'Liquids', cat: CAT.LIQUID, render: R.LIQUID, starter: true,
      colors: ['#3a2c1f', '#433324', '#33271b'], density: 7, cond: 0.1, cap: 2,
      flam: 0.6, ign: 250, burn: [60, 110], burnTemp: 1000, fireEmit: 0.35,
      burnInto: [['smoke', 1], ['empty', 2]], disp: 4, visc: 0.85, acidRes: 0.9,
      desc: 'Floats on water and burns, even on a lake.',
    },
    {
      key: 'metal', name: 'Metal', group: 'Solids', cat: CAT.STATIC, density: 79, render: R.METAL, starter: true,
      colors: ['#8e98a3', '#9aa4af', '#838d98', '#a6b0ba'], cond: 0.9, hi: [1538, 'mmetal', 0.03],
      conduct: true, blastRes: 0.8, acidRes: 0.5,
      desc: 'Conducts heat and electricity. Rusts when wet.',
    },

    // ───────────────────────── discoveries ─────────────────────────
    {
      key: 'steam', name: 'Steam', group: 'Gases', cat: CAT.GAS, render: R.GAS, starter: true,
      colors: ['#c8d4e2', '#d4dfeb', '#bccada'], alpha: 0.5, density: 0.4, cond: 0.06, cap: 0.6,
      loss: 0.002, temp: 130, lo: [90, 'water', 0.012], acidRes: 1, blastRes: 0,
      desc: 'Rises, cools and rains back down. Makes clouds.',
    },
    {
      key: 'ice', name: 'Ice', group: 'Solids', cat: CAT.STATIC, density: 9.2, render: R.ICE,
      colors: ['#bfe6f5', '#cdeefa', '#b2ddf0'], alpha: 0.8, cond: 0.4, cap: 2, temp: -25,
      hi: [1, 'water', 0.02], acidRes: 0.6, blastRes: 0.3,
      desc: 'Frozen water. Salt melts it.',
      recipe: 'Water cooled below 0°C', hint: 'Try the Cool tool on some water.', from: ['water'],
    },
    {
      key: 'smoke', name: 'Smoke', group: 'Gases', cat: CAT.GAS, render: R.SMOKE,
      colors: ['#4c4c52', '#55555b', '#444449'], alpha: 0.6, density: 0.5, cond: 0.02, loss: 0.01,
      life: [70, 190], acidRes: 1, blastRes: 0,
      desc: 'Rises from fires and sours the clouds it reaches.',
      recipe: 'What fire leaves in the air', hint: 'Let a fire burn out.', from: ['fire'],
    },
    {
      key: 'ash', name: 'Ash', group: 'Powders', cat: CAT.POWDER,
      colors: ['#8f8a85', '#9b9691', '#837e79', '#a6a19c'], density: 6, slide: 0.6, cond: 0.04,
      desc: 'What fire leaves. Mixed with the right salt, dangerous.',
      recipe: 'Burnt wood, plants or coal', hint: 'Burn some wood and wait.', from: ['wood', 'fire'],
    },
    {
      key: 'ember', name: 'Ember', group: 'Energy', cat: CAT.POWDER, render: R.EMBER, hidden: true,
      colors: ['#ff9a3a', '#ff7a24', '#e8561a'], density: 6, temp: 800, life: [140, 320], emit: 0.9,
      slide: 0.7, cond: 0.2,
      desc: 'A glowing scrap from a long fire. Lights what it lands on.',
      recipe: 'Shed by burning wood or coal', hint: 'A big wood fire throws something off.', from: ['wood', 'fire'],
    },
    {
      key: 'lava', name: 'Lava', group: 'Liquids', cat: CAT.LIQUID, render: R.LAVA,
      colors: ['#ff5a1a', '#ff7424', '#f04414', '#ffa236'], density: 25, cond: 0.22, cap: 1.5,
      loss: 0.00005, temp: 1400, lo: [850, 'stone', 0.02], disp: 2, visc: 0.35, emit: 0.85,
      acidRes: 1, blastRes: 0.5,
      desc: 'Molten rock at 1400°C. Crusts into stone as it cools.',
      recipe: 'Stone heated past 1100°C', hint: 'Stone is lava that cooled. Reverse it with the Heat tool.', from: ['stone'],
    },
    {
      key: 'obsidian', name: 'Obsidian', group: 'Solids', cat: CAT.STATIC, density: 24,
      colors: ['#1c1424', '#16101d', '#241a30', '#120d18'], cond: 0.12, hi: [1100, 'lava', 0.02],
      acidRes: 0.97, blastRes: 0.85,
      desc: 'Volcanic glass. Shrugs off acid and blasts.',
      recipe: 'Lava quenched by water', hint: 'Molten rock meets something that quenches it.', from: ['lava', 'water'],
    },
    {
      key: 'mglass', name: 'Molten Glass', group: 'Liquids', cat: CAT.LIQUID, render: R.MOLTEN,
      colors: ['#ffb04a', '#ffc266', '#ff9a3a'], alpha: 0.88, density: 22, cond: 0.15, temp: 1500,
      lo: [800, 'glass', 0.03], disp: 1, visc: 0.1, emit: 0.7, acidRes: 1,
      desc: 'Thick as honey. Sets into glass below 800°C.',
      recipe: 'Sand heated past 1700°C', hint: 'Sand melts — if you can get it far hotter than lava.', from: ['sand'],
    },
    {
      key: 'glass', name: 'Glass', group: 'Solids', cat: CAT.STATIC, density: 25, render: R.GLASS,
      colors: ['#e6f6fa', '#d8f0f6', '#f2fbfd'], alpha: 0.12, cond: 0.15, hi: [1400, 'mglass', 0.02],
      acidRes: 1, blastRes: 0.15,
      desc: 'Clear and acid-proof: the perfect beaker.',
      recipe: 'Molten glass, cooled below 800°C', hint: 'Let molten glass cool down.', from: ['mglass'],
    },
    {
      key: 'mud', name: 'Mud', group: 'Liquids', cat: CAT.LIQUID,
      colors: ['#523b25', '#5b422a', '#4a3520'], render: R.LIQUID, density: 14, cond: 0.12, cap: 2.5,
      hi: [100, 'clay', 0.01], disp: 1, visc: 0.25,
      desc: 'Seeds love it. Heat dries it into clay.',
      recipe: 'Dirt + Water', hint: 'Get some soil wet.', from: ['dirt', 'water'],
    },
    {
      key: 'brick', name: 'Brick', group: 'Solids', cat: CAT.STATIC, density: 19, render: R.BRICK,
      colors: ['#a3442c', '#963d27', '#b04e33'], cond: 0.1, hi: [2000, 'lava', 0.01],
      acidRes: 0.9, blastRes: 0.65,
      desc: 'Fired clay. Tough and acid-resistant.',
      recipe: 'Clay fired above 800°C', hint: 'Fire some clay in a hot kiln.', from: ['clay', 'fire'],
    },
    {
      key: 'plant', name: 'Plant', group: 'Plants', cat: CAT.STATIC, render: R.PLANT, starter: true,
      colors: ['#3a9a35', '#43a83d', '#33892f', '#4cb545'], density: 6, cond: 0.06,
      flam: 0.5, ign: 250, burn: [14, 30], burnTemp: 650, fireEmit: 0.3,
      burnInto: [['ash', 3], ['empty', 4], ['fire', 3]], blastRes: 0.1,
      desc: 'A leafy green plant. Grows from roots in soil; off the ground it dies in seconds.',
    },
    {
      key: 'flower', name: 'Flower', group: 'Plants', cat: CAT.STATIC, render: R.FLOWER, starter: true,
      colors: ['#ff5fa2'], density: 6, cond: 0.06, flam: 0.55, ign: 220, burn: [10, 20], burnTemp: 600,
      fireEmit: 0.3, burnInto: [['ash', 1], ['fire', 1]], blastRes: 0.1,
      desc: 'A plant in bloom. Drops seeds that grow more flowers.',
    },
    {
      key: 'grass', name: 'Grass', group: 'Plants', cat: CAT.STATIC, density: 4, render: R.GRASS,
      colors: ['#5aa83a', '#68b844', '#4e9832', '#76c24e'], cond: 0.06,
      flam: 0.6, ign: 220, burn: [8, 16], burnTemp: 600, fireEmit: 0.3,
      burnInto: [['ash', 2], ['empty', 3], ['fire', 1]], blastRes: 0.05,
      desc: 'Creeps over bare soil. Burns fast.',
      recipe: 'A plant touching ash', hint: 'Grass is the first thing to come back after a fire: let a plant grow into ash.', from: ['plant', 'ash'],
    },
    {
      key: 'cactus', name: 'Cactus', group: 'Plants', cat: CAT.STATIC, density: 9, render: R.CACTUS,
      colors: ['#3f8a4a', '#479653', '#377a40', '#4fa05b'], cond: 0.08, cap: 3,
      flam: 0.08, ign: 420, burn: [80, 140], burnTemp: 600, fireEmit: 0.15,
      burnInto: [['steam', 2], ['ash', 1]], blastRes: 0.15,
      desc: 'Grows in dry sand. Burns slowly; rots if drowned.',
      recipe: 'A plant touching sand', hint: 'Plant something at the edge of the desert, where soil meets sand.', from: ['plant', 'sand'],
    },
    {
      key: 'vine', name: 'Vine', group: 'Plants', cat: CAT.STATIC, density: 5, render: R.VINE,
      colors: ['#2f7a2c', '#38883a', '#2a6c28', '#44963e'], cond: 0.06,
      flam: 0.45, ign: 240, burn: [12, 24], burnTemp: 620, fireEmit: 0.3,
      burnInto: [['ash', 2], ['empty', 3], ['fire', 1]], blastRes: 0.1,
      desc: 'Climbs walls, stone and trees; trails on the ground.',
      recipe: 'A plant touching brick', hint: 'Let a plant grow against a brick wall.', from: ['plant', 'brick'],
    },
    {
      key: 'mushroom', name: 'Mushroom', group: 'Plants', cat: CAT.STATIC, density: 4, render: R.MUSHROOM,
      colors: ['#c8402e', '#d4523a', '#b8382a', '#cc4a34'], cond: 0.05,
      flam: 0.2, ign: 260, burn: [20, 40], burnTemp: 550, fireEmit: 0.15,
      burnInto: [['ash', 1], ['empty', 1]], blastRes: 0.05,
      desc: 'Feeds on rot. Puffs spores and turns wood to soil.',
      recipe: 'A cell left on wood', hint: 'Fungi are living cells too. Leave one on a log.', from: ['cell', 'wood'],
    },
    {
      key: 'lily', name: 'Water lily', group: 'Plants', cat: CAT.STATIC, density: 5, render: R.LILY,
      colors: ['#3f9a4a', '#48a855', '#378a42'], cond: 0.08,
      flam: 0.2, ign: 280, burn: [12, 24], burnTemp: 550, fireEmit: 0.2,
      burnInto: [['ash', 1], ['empty', 2]], blastRes: 0.1,
      desc: 'Roots on a pond bed and floats its pads on top.',
      recipe: 'A flower dropped in water', hint: 'Drop a flower into a pond.', from: ['flower', 'water'],
    },
    {
      key: 'saltwater', name: 'Saltwater', group: 'Liquids', cat: CAT.LIQUID, render: R.LIQUID,
      colors: ['#2a8ba8', '#2f96b4', '#26809c'], alpha: 0.86, density: 10.5, cond: 0.22, cap: 4,
      loss: 0.0004, hi: [102, 'salt', 0.08], lo: [-2, 'ice', 0.02], conduct: true, disp: 5,
      acidRes: 1, blastRes: 0.2,
      desc: 'Conducts better, rusts faster, boils down to salt.',
      recipe: 'Salt dissolved in water', hint: 'Season the water.', from: ['salt', 'water'],
    },
    {
      key: 'rust', name: 'Rust', group: 'Powders', cat: CAT.POWDER,
      colors: ['#9c4f2a', '#8a4423', '#ad5c31', '#7d3c1e'], density: 17, slide: 0.4, cond: 0.1,
      hi: [1565, 'mmetal', 0.02],
      desc: 'Crumbling iron oxide. Half of a very hot recipe.',
      recipe: 'Metal left in water (faster in saltwater)', hint: 'Leave metal wet. Salty is quicker.', from: ['metal', 'water'],
    },
    {
      key: 'mmetal', name: 'Molten Metal', group: 'Liquids', cat: CAT.LIQUID, render: R.MOLTEN,
      colors: ['#ffd877', '#ffc04d', '#ffe9a3'], density: 40, cond: 0.7, temp: 1800,
      lo: [1500, 'metal', 0.03], disp: 2, visc: 0.5, emit: 0.9, conduct: true, acidRes: 0.5,
      desc: 'Liquid iron, heavier than anything else here.',
      recipe: 'Metal heated past 1500°C', hint: 'Metal melts too — far hotter than stone does.', from: ['metal'],
    },
    {
      key: 'snow', name: 'Snow', group: 'Powders', cat: CAT.POWDER, render: R.SPARKLE,
      colors: ['#f2f6fc', '#e6edf6', '#ffffff'], density: 5, temp: -8, hi: [1, 'water', 0.02], lo: [-150, 'cryo', 0.03],
      slide: 0.6, cond: 0.1,
      desc: 'Frozen vapour that drifts down softly.',
      recipe: 'Steam cooled below 0°C', hint: 'Freeze vapour, not water.', from: ['steam'],
    },
    {
      key: 'gunpowder', name: 'Gunpowder', group: 'Powders', cat: CAT.POWDER,
      colors: ['#3b3b3b', '#2f2f2f', '#474747', '#555150'], density: 12, flam: 1, ign: 300,
      burn: [1, 3], explode: [4, 0.9], needAir: false, slide: 0.7, blastColor: '#ffb048', blastGlow: 0.75,
      desc: 'Explodes at a spark. A metal mixed in colours the blast.',
      recipe: 'Ash + Salt', hint: 'An ancient recipe: charcoal and a salt.', from: ['ash', 'salt'],
    },
    {
      key: 'acid', name: 'Acid', group: 'Liquids', cat: CAT.LIQUID, render: R.LIQUID,
      colors: ['#8dfc39', '#7ae82d', '#a3ff5c'], density: 11, cond: 0.2, cap: 3,
      hi: [200, 'smoke', 0.05], acidRes: 1, conduct: true, disp: 4, emit: 0.18,
      desc: 'Eats almost anything but glass and diamond.',
      recipe: 'Smoke + Steam (acid rain)', hint: 'Pollute a cloud.', from: ['smoke', 'steam'],
    },
    {
      key: 'methane', name: 'Methane', group: 'Gases', cat: CAT.GAS, render: R.GAS,
      colors: ['#a4c99a', '#b2d4a8'], alpha: 0.3, density: 0.2, flam: 1, ign: 580, burn: [1, 2],
      explode: [3, 0.45], needAir: false, acidRes: 1, blastRes: 0,
      flameColor: '#4f7bff', blastColor: '#7d9dff', blastGlow: 0.55,
      desc: 'Swamp gas. Explodes in a blue flash.',
      recipe: 'Plants rotting in mud', hint: 'Swamps breathe something flammable.', from: ['plant', 'mud'],
    },
    {
      key: 'coal', name: 'Coal', group: 'Solids', cat: CAT.STATIC, density: 14,
      colors: ['#262626', '#1e1e1e', '#2f2f2f', '#191919'], cond: 0.1, flam: 0.08, ign: 450,
      burn: [700, 1100], burnTemp: 1150, fireEmit: 0.2, burnInto: [['ash', 3], ['ember', 1]],
      hi: [2500, 'diamond', 0.01], acidRes: 0.85, blastRes: 0.35, // carbon: acid hardly touches it
      desc: 'Burns for ages. Sealed and heated, it turns rare.',
      recipe: 'Wood heated above 350°C with no air', hint: 'Bury wood and heat it — don\'t let it breathe.', from: ['wood'],
    },
    {
      key: 'diamond', name: 'Diamond', group: 'Solids', cat: CAT.STATIC, density: 35, render: R.DIAMOND,
      colors: ['#dff8ff', '#eefcff', '#cdf2fb', '#f7feff'], alpha: 0.55, cond: 1, cap: 0.6, acidRes: 1, blastRes: 0.98,
      flam: 0.03, ign: 900, burn: [200, 400], burnTemp: 1000, fireEmit: 0.1, burnInto: [['co2', 1]],
      desc: 'The hardest thing here. Acid-proof, but burns above 900°C.',
      recipe: 'Coal sealed away from air at 2500°C', hint: 'Crush carbon with unbearable heat, sealed away from air.', from: ['coal'],
    },
    {
      key: 'battery', name: 'Battery', group: 'Energy', cat: CAT.STATIC, density: 30, render: R.BATTERY,
      colors: ['#d9c22a', '#2a2a2e'], cond: 0.3, hi: [1500, 'mmetal', 0.02], acidRes: 0.5, blastRes: 0.5,
      desc: 'Pulses electricity into conductors it touches.',
      recipe: 'Acid eating into metal', hint: 'Pour something corrosive onto metal.', from: ['acid', 'metal'],
    },
    {
      key: 'spark', name: 'Electricity', group: 'Energy', cat: CAT.SPECIAL, render: R.SPARK,
      colors: ['#fffbd4', '#bfeaff'], life: [2, 4], emit: 1, acidRes: 1, blastRes: 0,
      desc: 'Sends a pulse through conductors. Ignites powder.',
      recipe: 'Current flowing through a conductor', hint: 'A battery needs something to push current through.', from: ['battery'],
    },
    {
      key: 'lightning', name: 'Lightning', group: 'Energy', cat: CAT.SPECIAL, render: R.SPARK, virtual: true,
      colors: ['#dbe8ff', '#a9c8ff'], emit: 1,
      desc: 'Strikes down from where you click.',
      recipe: 'Born in dense storm clouds', hint: 'Boil a LOT of water and let the clouds gather up high.', from: ['steam'],
    },
    {
      key: 'plasma', name: 'Plasma', group: 'Energy', cat: CAT.GAS, render: R.PLASMA,
      colors: ['#e4b5ff', '#c08bff', '#ffffff', '#a66bff'], density: 0.1, cond: 0.4, cap: 0.5, temp: 4000,
      life: [3, 9], emit: 1, acidRes: 1, blastRes: 0,
      desc: 'Gas at thousands of degrees. Lightning is made of it.',
      recipe: 'The path of a lightning bolt', hint: 'What is a lightning bolt made of?', from: ['lightning'],
    },
    {
      key: 'fish', name: 'Fish', group: 'Life', cat: CAT.LIFE, render: R.FISH,
      colors: ['#ff8a2a', '#ffa43c', '#ff7316', '#f2c14e'], density: 10, cond: 0.1, cap: 2,
      hi: [55, 'ash', 0.1], blastRes: 0.1,
      desc: 'Swims and breeds. Hates heat and electricity.',
      recipe: 'A cell left in water (or lightning striking saltwater)', hint: 'Leave a cell in water for a while.', from: ['cell', 'water'],
    },
    {
      key: 'worm', name: 'Worm', group: 'Life', cat: CAT.LIFE, render: R.PAL,
      colors: ['#e3899a', '#d97b8c', '#ee9aaa'], density: 15, cond: 0.1, hi: [60, 'ash', 0.1],
      desc: 'Burrows through soil, turning ash into dirt.',
      recipe: 'A cell in damp earth (or lightning striking mud)', hint: 'Bury a cell in wet earth.', from: ['cell', 'mud'],
    },
    {
      key: 'firefly', name: 'Firefly', group: 'Life', cat: CAT.LIFE, render: R.FIREFLY,
      colors: ['#fff38a', '#e9ff8a'], density: 0.5, cond: 0.05, hi: [90, 'ash', 0.2],
      desc: 'Drifts and blinks. Breeds near flowers.',
      recipe: 'A cell on a flower (or a flower touched by electricity)', hint: 'Put a cell on a flower.', from: ['cell', 'flower'],
    },
    {
      key: 'thermite', name: 'Thermite', group: 'Powders', cat: CAT.POWDER,
      colors: ['#8c4a3c', '#7b3e31', '#9a5a4a', '#6e6a6a'], density: 18, flam: 0.03, ign: 1000,
      burn: [240, 380], burnTemp: 3200, fireEmit: 0.4, needAir: false, waterproof: true,
      burnInto: [['mmetal', 1], ['ash', 1]], slide: 0.6,
      desc: 'Burns at 3200°C and leaves molten iron.',
      recipe: 'Rust + Gunpowder', hint: 'Oxidised metal meets an explosive powder.', from: ['rust', 'gunpowder'],
    },
    {
      key: 'napalm', name: 'Napalm', group: 'Liquids', cat: CAT.LIQUID,
      colors: ['#c76d2c', '#b86226', '#d47a35'], density: 8, cond: 0.1, flam: 0.9, ign: 180,
      burn: [380, 600], burnTemp: 1300, fireEmit: 0.45, waterproof: true,
      burnInto: [['smoke', 1], ['empty', 1]], disp: 1, visc: 0.35,
      desc: 'Sticky fire that keeps burning on water.',
      recipe: 'Oil + Gunpowder', hint: 'Thicken oil with an explosive powder.', from: ['oil', 'gunpowder'],
    },

    // ───────────────────────── milestone unlocks ─────────────────────────
    {
      key: 'clone', name: 'Clone', group: 'Special', cat: CAT.SPECIAL, render: R.CLONE, special: true, unlockAt: 8,
      colors: ['#c9a227', '#b38f1c'], cond: 0, acidRes: 1, blastRes: 99,
      desc: 'Copies the first thing that touches it, forever.',
    },
    {
      key: 'void', name: 'Void', group: 'Special', cat: CAT.SPECIAL, render: R.VOID, special: true, unlockAt: 16,
      colors: ['#140b1f', '#1d0f2e'], cond: 0, acidRes: 1, blastRes: 99,
      desc: 'Deletes anything that touches it.',
    },

    // ───────────────────────── expansion ─────────────────────────
    {
      key: 'cryo', name: 'Cryo', group: 'Liquids', cat: CAT.LIQUID, render: R.LIQUID,
      colors: ['#bfe9ff', '#d6f2ff', '#a8dcff'], alpha: 0.8, density: 8, cond: 0.5, cap: 1, temp: -196,
      loss: 0.0006, hi: [-180, 'empty', 0.03], disp: 5, emit: 0.12, acidRes: 1, blastRes: 0.1,
      desc: 'Liquid at −196°C. Freezes water, snuffs fire.',
      recipe: 'Snow cooled below −150°C', hint: 'Freezing is only the start. Push snow far, far colder.', from: ['snow'],
    },
    {
      key: 'nitro', name: 'Nitro', group: 'Liquids', cat: CAT.LIQUID, render: R.LIQUID,
      colors: ['#e6e09a', '#dcd68c', '#f0eab4'], alpha: 0.9, density: 9, cond: 0.12, flam: 1, ign: 110,
      burn: [1, 2], explode: [5, 1.1], needAir: false, disp: 3,
      flameColor: '#fff1c2', blastColor: '#fffaf0', blastGlow: 1,
      desc: 'Liquid explosive. Goes off from heat, sparks or a hard fall.',
      recipe: 'Oil + Acid', hint: 'Treat oil with something corrosive.', from: ['oil', 'acid'],
    },
    {
      key: 'moss', name: 'Moss', group: 'Plants', cat: CAT.STATIC, density: 3, render: R.PAL,
      colors: ['#4f7a35', '#5a8a3c', '#456b2e', '#668f45'], cond: 0.06, flam: 0.3, ign: 200,
      burn: [20, 40], burnTemp: 600, fireEmit: 0.2, burnInto: [['ash', 1], ['empty', 1]], blastRes: 0.2,
      desc: 'Creeps across damp stone.',
      recipe: 'A plant touching wet stone', hint: 'Let a plant grow against stone where water is close.', from: ['plant', 'stone'],
    },
    {
      key: 'human', name: 'Human', group: 'Life', cat: CAT.LIFE, render: R.HUMAN,
      colors: ['#3d6fb6', '#b6463d', '#3d9a5a', '#b68a3d', '#7a4db6', '#3d9ab0'], density: 10, cond: 0.08, cap: 2,
      flam: 0.3, ign: 160, burn: [40, 70], burnTemp: 600, fireEmit: 0.25, burnInto: [['ash', 1]],
      hi: [70, 'ash', 0.05], lo: [-25, 'ice', 0.02], blastRes: 0.05,
      desc: 'Walks, farms and raises families. Flees danger. Nine in ten can swim.',
      recipe: 'A cell touching clay', hint: 'The old stories say people were shaped from clay and given life.', from: ['cell', 'clay'],
    },
    {
      key: 'head', name: 'Human', group: 'Life', cat: CAT.LIFE, render: R.HEAD, hidden: true,
      colors: ['#f1c9a5', '#d9a37a', '#a8724d', '#6e4a32'], density: 10, cond: 0.08, cap: 2, blastRes: 0.05,
    },
    {
      key: 'bird', name: 'Bird', group: 'Life', cat: CAT.LIFE, render: R.BIRD,
      colors: ['#2e2e36', '#4a3e34', '#3a4450', '#5a4636'], density: 1, cond: 0.05,
      flam: 0.4, ign: 120, burn: [6, 12], burnTemp: 500, burnInto: [['ash', 1]], hi: [80, 'ash', 0.1],
      desc: 'Flies in flocks, perches on trees, eats seeds.',
      recipe: 'A cell among a tree’s leaves', hint: 'Put a cell up in the leaves of a tree.', from: ['cell', 'sapling'],
    },
    {
      key: 'ant', name: 'Ant', group: 'Life', cat: CAT.LIFE,
      colors: ['#1c1410', '#2a1a12', '#3a2216'], density: 12, cond: 0.05,
      flam: 0.2, ign: 150, burn: [4, 8], burnTemp: 400, burnInto: [['ash', 1]], hi: [70, 'ash', 0.1],
      desc: 'Digs tunnels and piles up anthills.',
      recipe: 'A cell touching sugar', hint: 'Leave a cell beside something sweet.', from: ['cell', 'sugar'],
    },
    {
      key: 'rad', name: 'Radiation', group: 'Energy', cat: CAT.GAS, render: R.RAD, hidden: true,
      colors: ['#7dff6a', '#b8ffb0'], density: 0.01, cond: 0, life: [2, 5], emit: 1, acidRes: 1, blastRes: 0,
    },
    {
      // a white-hot fleck of burning metal, flung off iron, titanium, magnesium or a lighter flint;
      // it flies in an arc and lights whatever it lands on (aux: the metal it came from, for its colour)
      key: 'mspark', name: 'Spark', group: 'Energy', cat: CAT.POWDER, render: R.MSPARK, hidden: true,
      colors: ['#ffd27a', '#fff2c0'], density: 1, cond: 0.02, temp: 1400, life: [10, 26], emit: 1, slide: 1,
      acidRes: 1, blastRes: 0,
    },

    // ───────────────────────── weather: clouds and fog are gases, hail a powder ─────────────────────────
    {
      key: 'cloud', name: 'Cloud', group: 'Gases', cat: CAT.GAS, render: R.CLOUD,
      colors: ['#eef2f6', '#e2e8ee', '#f6f8fa'], alpha: 0.85, density: 0.45, cond: 0.02, cap: 0.6, loss: 0.01, temp: 5,
      acidRes: 1, blastRes: 0,
      desc: 'Drifts with the wind. Packed tight, it brings rain.',
      recipe: 'Steam rising high into cool air', hint: 'Let steam rise to the top of the sky.', from: ['steam'],
    },
    {
      key: 'raincloud', name: 'Rain cloud', group: 'Gases', cat: CAT.GAS, render: R.CLOUD,
      colors: ['#8e99a5', '#7f8a96', '#9ba5af'], alpha: 0.9, density: 0.45, cond: 0.02, cap: 0.6, loss: 0.01, temp: 5,
      acidRes: 1, blastRes: 0,
      desc: 'Rains until wrung out; snows below freezing.',
      recipe: 'Clouds packed tightly together', hint: 'Gather a lot of cloud in one place.', from: ['cloud'],
    },
    {
      key: 'stormcloud', name: 'Storm cloud', group: 'Gases', cat: CAT.GAS, render: R.CLOUD,
      colors: ['#454d5a', '#3a414d', '#525a66'], alpha: 0.95, density: 0.45, cond: 0.02, cap: 0.6, loss: 0.01, temp: 5,
      acidRes: 1, blastRes: 0,
      desc: 'Heavy rain, hail and lightning.',
      recipe: 'A rain cloud grown huge, or charged with electricity', hint: 'Feed a rain cloud until it towers, or give it a spark.', from: ['raincloud'],
    },
    {
      key: 'snowcloud', name: 'Snow cloud', group: 'Gases', cat: CAT.GAS, render: R.CLOUD,
      colors: ['#c6cfda', '#bac4d0', '#d2dae4'], alpha: 0.9, density: 0.45, cond: 0.02, cap: 0.6, loss: 0.01, temp: -12,
      acidRes: 1, blastRes: 0,
      desc: 'Sifts snow onto everything below.',
      recipe: 'Clouds in freezing air, or snow thrown into a cloud', hint: 'Throw snow into a cloud.', from: ['cloud', 'snow'],
    },
    {
      key: 'fog', name: 'Fog', group: 'Gases', cat: CAT.GAS, render: R.FOG,
      colors: ['#dfe5ea', '#d3dae0', '#e8edf1'], alpha: 0.32, density: 0.6, cond: 0.02, cap: 0.6, loss: 0.01, temp: 6,
      life: [700, 1800], acidRes: 1, blastRes: 0,
      desc: 'A cloud on the ground. Burns off as it warms.',
      recipe: 'Steam drifting over snow', hint: 'Breathe warm steam over cold snow.', from: ['steam', 'snow'],
    },
    {
      key: 'hail', name: 'Hail', group: 'Powders', cat: CAT.POWDER, render: R.SPARKLE,
      colors: ['#e9f4fb', '#d6e8f3', '#f6fbfe'], density: 9, cond: 0.4, cap: 2, temp: -5,
      hi: [1, 'water', 0.03], slide: 0.8, blastRes: 0.2,
      desc: 'Ice pellets from storms. Melts above 0°C.',
      recipe: 'A storm cloud in cool air', hint: 'A thunderstorm drops ice when the air is below 12°C.', from: ['stormcloud'],
    },

    // ───────────────────────── more discoveries ─────────────────────────
    {
      key: 'co2', name: 'Carbon Dioxide', group: 'Gases', cat: CAT.GAS, render: R.CO2,
      colors: ['#c9ced3', '#bfc5ca'], alpha: 0.1, density: 0.65, cond: 0.02, cap: 0.6, loss: 0.003,
      lo: [-78.5, 'dryice', 0.05], acidRes: 1, blastRes: 0,
      desc: 'Heavier than air. Pools low and smothers flames.',
      recipe: 'What smoke leaves behind as it clears', hint: 'Let smoke settle. Part of it sinks instead of rising.', from: ['smoke'],
    },
    {
      key: 'dryice', name: 'Dry Ice', group: 'Powders', cat: CAT.POWDER, render: R.SPARKLE,
      colors: ['#eef3f6', '#e2e9ee', '#f6f9fb'], density: 15, cond: 0.25, cap: 2, temp: -78.5, slide: 0.5,
      blastRes: 0.2,
      desc: 'Frozen CO₂ at −78.5°C. Turns straight to fog.',
      recipe: 'Carbon dioxide frozen below −78.5°C', hint: 'Freeze what burning breathes out.', from: ['co2'],
    },
    {
      key: 'clay', name: 'Clay', group: 'Solids', cat: CAT.STATIC, density: 17,
      colors: ['#b98a62', '#c39670', '#ad7f58', '#b58660'], cond: 0.1, hi: [800, 'brick', 0.02], acidRes: 0.6, blastRes: 0.3,
      desc: 'Dried mud. Fire it past 800°C for brick.',
      recipe: 'Mud dried above 100°C', hint: 'Dry some mud out.', from: ['mud'],
    },
    {
      key: 'soap', name: 'Soap', group: 'Powders', cat: CAT.POWDER,
      colors: ['#f1e4ee', '#e9ddf0', '#f6eef4', '#e6eef2'], density: 11, slide: 0.5, cond: 0.05,
      desc: 'Whips water into foam.',
      recipe: 'Ash + Oil (lye + fat)', hint: 'Wood ash holds lye. Mix it with something greasy.', from: ['ash', 'oil'],
    },
    {
      key: 'foam', name: 'Foam', group: 'Gases', cat: CAT.GAS, render: R.FOAM,
      colors: ['#f4f8fb', '#eaf2f8', '#fbfdff'], alpha: 0.75, density: 0.3, cond: 0.02, life: [400, 1100],
      acidRes: 1, blastRes: 0,
      desc: 'Soap bubbles that drift up and pop.',
      recipe: 'Soap + Water', hint: 'Wet the soap.', from: ['soap', 'water'],
    },

    // ───────────────────────── story-only ─────────────────────────
    {
      key: 'drygrass', name: 'Dry grass', group: 'Plants', cat: CAT.STATIC, density: 3, hidden: true,
      colors: ['#c9a85a', '#b8954a', '#d6b86a', '#a8863f'], cond: 0.08,
      flam: 0.9, ign: 200, burn: [40, 80], burnTemp: 750, fireEmit: 0.35, needAir: false,
      burnInto: [['ash', 4], ['empty', 4], ['fire', 2]], blastRes: 0.05,
      desc: 'Drought-dry grass. One spark and it burns.',
    },
    // what an earthquake, a meteor or a black hole leaves of rock and masonry (see the Weapons tab)
    {
      key: 'rubble', name: 'Rubble', group: 'Powders', cat: CAT.POWDER,
      colors: ['#5f6268', '#6b6e74', '#54575c', '#77706a'], density: 24, cond: 0.15, slide: 0.45,
      hi: [1100, 'lava', 0.02], acidRes: 0.5, blastRes: 0.3,
      desc: 'Broken rock. Melts back into lava.',
      recipe: 'Stone, brick or obsidian broken up by an earthquake or a black hole',
      hint: 'Shake stone hard enough and it breaks up: an earthquake of magnitude 7 will do it.', from: ['stone'],
    },
    {
      key: 'splinters', name: 'Splinters', group: 'Powders', cat: CAT.POWDER, hidden: true,
      colors: ['#9a6a40', '#8a5c37', '#a8784a', '#7d5231'], density: 6, cond: 0.06, slide: 0.35,
      flam: 0.4, ign: 280, burn: [30, 70], burnTemp: 800, fireEmit: 0.25,
      burnInto: [['ash', 3], ['ember', 1], ['empty', 2]], blastRes: 0.05,
      desc: 'Torn wood. Catches fire fast.',
    },
  ];

  const CAT_DENSITY = { 0: 0, 1: 100, 2: 15, 3: 10, 4: 0.5, 5: 10, 6: 100 };
  const CAT_GROUP = { 1: 'Solids', 2: 'Powders', 3: 'Liquids', 4: 'Gases', 5: 'Life', 6: 'Special' };

  const ID = {};
  const byKey = {};

  function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function register(d) {
    d.id = list.indexOf(d);
    ID[d.key.toUpperCase()] = d.id;
    byKey[d.key] = d;
  }

  // Fill defaults and resolve string references to ids.
  function prepare(d) {
    const def = (k, v) => { if (d[k] === undefined) d[k] = v; };
    def('group', CAT_GROUP[d.cat] || 'Special');
    def('render', R.PAL);
    def('alpha', 1);
    def('density', CAT_DENSITY[d.cat]);
    def('cond', 0.1);
    def('cap', 1);
    def('loss', d.cat === CAT.LIQUID ? 0.0005 : 0.0002);
    def('temp', AMBIENT);
    def('flam', 0);
    def('ign', Infinity);
    def('burn', [0, 0]);
    def('burnTemp', 0);
    def('fireEmit', 0);
    def('needAir', true);
    def('waterproof', false);
    def('acidRes', 0);
    def('blastRes', 0.1);
    def('conduct', false);
    def('disp', 0);
    def('visc', 1);
    def('slide', 1);
    def('emit', 0);
    def('starter', false);
    def('from', []);
    d.rgb = d.colors.map(hexToRgb);
    const ref = (k) => (k === 'keep' ? -1 : byKey[k].id);
    if (d.hi) d.hi = [d.hi[0], ref(d.hi[1]), d.hi[2]];
    if (d.lo) d.lo = [d.lo[0], ref(d.lo[1]), d.lo[2]];
    if (d.burnInto) d.burnInto = d.burnInto.map(([k, w]) => [ref(k), w]);
  }

  list.forEach(register);
  list.forEach(prepare);

  const ELEM = {
    CAT, R, GROUPS, AMBIENT, NT, list, ID, byKey, hexToRgb,
    discoverable: [], starters: [],
    // Add more elements (e.g. the periodic table). Must run before sim.js compiles its tables.
    extend(defs) {
      if (list.length + defs.length > NT - 2) throw new Error(`Too many elements: ${list.length + defs.length} of ${NT - 2}`);
      for (const d of defs) { list.push(d); register(d); }
      for (const d of defs) prepare(d);
      refresh();
    },
  };
  function refresh() {
    // recipes may name an element added later (a cell, sugar), so they are looked up once all are in
    for (const d of list) d.fromIds = d.from.map((k) => (byKey[k] ? byKey[k].id : -1));
    ELEM.discoverable = list.filter((d) => !d.hidden && !d.starter && !d.special && !d.periodic);
    ELEM.starters = list.filter((d) => d.starter);
  }
  refresh();
  G.ELEM = ELEM;
})(globalThis);
