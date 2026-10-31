/* Elementarium — simulation engine.
 * A cellular automaton over typed arrays. Each cell carries a type plus temperature, timers,
 * electric charge and velocity (sideways and vertical). Over the cells lies a coarse air field
 * of wind and pressure, as in Powder Game: blasts and heat push it, and it pushes back on gases,
 * powders and liquids. Kept free of DOM access so it can run headless (see tools/). */
(function (G) {
  'use strict';

  const EL = G.ELEM;
  const { CAT, ID, list, AMBIENT } = EL;
  const {
    EMPTY, WALL, SAND, WATER, WOOD, FIRE, DIRT, SEED, SALT, OIL, METAL, STEAM, SMOKE, ASH,
    EMBER, LAVA, OBSIDIAN, MGLASS, GLASS, MUD, PLANT, FLOWER, SALTWATER, RUST, MMETAL, SNOW,
    GUNPOWDER, ACID, METHANE, COAL, DIAMOND, BATTERY, SPARK, LIGHTNING, PLASMA, FISH, WORM, FIREFLY,
    THERMITE, NAPALM, CLONE, VOID, ICE, STONE, CRYO, NITRO, MOSS, HUMAN, HEAD, BIRD, ANT, RAD,
    EL_H, EL_HE, EL_C, EL_O, EL_F, EL_AL, EL_S, EL_FE, EL_KR, EL_BA,
    EL_NA, EL_MG, EL_P, EL_CL, EL_BR, EL_I, EL_GA, EL_ZR, EL_PD, EL_PT, EL_AU, EL_HG,
    EL_TI, EL_CR, EL_NI, EL_CU, EL_ZN, EL_CE, EL_PB, EL_U, MSPARK,
    EL_BE, EL_CA, EL_TH, EL_ND, EL_SM, EL_SR,
    CLOUD, RAINCLOUD, STORMCLOUD, SNOWCLOUD, FOG, HAIL, CO2, DRYICE, CLAY, SOAP, FOAM, DRYGRASS,
    ACORN, GRASSSEED, CACTUSSEED, VINESEED, SPORES, LILYSEED, SAPLING, GRASS, CACTUS, VINE, MUSHROOM, LILY,
    LITTER, BRICK, RUBBLE, SPLINTERS, SHARDS,
    SOIL, CONCRETE, CEMENT, ALCOHOL, VINEGAR, LIGHT, PINE, PINECONE, PALM, COCONUT, WILLOW, CATKIN,
    EXPLOSION, SUGAR, LIME, LIMESTONE, CELL, COW, WOLF, SHARK,
    WIRE, SWITCH, SENSOR, PIPE, VALVE, PUMP, TANK, PISTON, ROD, CASING, THRUSTER, LEGS, SCRAP,
  } = ID;

  const BOUND = EL.NT - 1; // invisible border cell, so neighbour lookups never need bounds checks
  const C_STATIC = CAT.STATIC, C_POWDER = CAT.POWDER, C_LIQUID = CAT.LIQUID, C_GAS = CAT.GAS, C_LIFE = CAT.LIFE;

  // cell flags
  const BURN = 1, LEAF = 2, PETAL = 4, CENTER = 8, FISSION = 16, SETTLED = 32, HELD = 256; // HELD: in the hand's grip (a bit of its own)
  const SMOKE_WHITE = 64, SMOKE_NONE = 128; // what a blast's fire leaves when it dies out
  const BLEACH = 512; // a flower whose petals chlorine has turned white
  const MOLTEN = 1024; // a grain of a castable metal that has melted: it sets solid as it cools
  const SWIMS = 32; // a person's aux bit: this one can swim (nine in ten); the rest sink and drown
  // fire painted in a colour: its colour (an index into FLAME_EL) rides on the fuel it lights, so the
  // blaze keeps burning in it. A pinch of an element in a fire tints only the flames that touch it.
  const DYE = 0xF800, DYE_SHIFT = 11;
  // electric charge: a fresh pulse (NEW) becomes ACTIVE next tick, spreads, then decays (refractory)
  const CH_ACTIVE = 8, CH_NEW = 9;
  const GRAV = 0.22, MAXV = 5;
  const MINVX = 0.06;     // slower than this sideways and a particle is at rest
  const SPLASH_V = 1.5;   // a falling liquid landing faster than this surges sideways

  // The air field: one air cell per AS×AS sim cells, holding a flow velocity (in sim cells per
  // tick) and a pressure. Flow runs down pressure gradients and piles up pressure where it
  // converges; it carries itself along (advection), which is what curls it into swirls.
  const AS = 4;
  const AIR_TSTEPP = 0.3, AIR_TSTEPV = 0.4;   // how fast flow becomes pressure and back
  const AIR_PLOSS = 0.99, AIR_VLOSS = 0.985; // both bleed away, so a blast settles in a second or two
  const AIR_VADV = 0.35, AIR_BLUR = 0.1;      // self-advection and diffusion
  const AIR_MAXV = 6, AIR_MAXP = 60;
  const AIR_FELT = 0.03;                       // flow slower than this pushes nothing
  const HOT_LIFT = 3e-5, HOT_PRES = 1.2e-5;    // per degree of heat above the ambient air
  const BOOM_P = 24;                            // pressure a blast of power 1 adds at its centre
  const PRES_K = 2, PRES_MIN = 1;                // how hard a pressure difference pushes a liquid (÷ its density), and the least that does

  // ───────────── compiled property tables ─────────────
  const NT = EL.NT; // element numbers (see elements.js): cells hold them in 16 bits
  const P_CAT = new Uint8Array(NT);
  const P_DENS = new Float32Array(NT);
  const P_COND = new Float32Array(NT);
  const P_ICAP = new Float32Array(NT);
  const P_LOSS = new Float32Array(NT);
  const P_TEMP = new Float32Array(NT).fill(AMBIENT);
  const P_HI_T = new Float32Array(NT).fill(Infinity);
  const P_HI_TO = new Int16Array(NT);
  const P_HI_P = new Float32Array(NT);
  const P_LO_T = new Float32Array(NT).fill(-Infinity);
  const P_LO_TO = new Int16Array(NT);
  const P_LO_P = new Float32Array(NT);
  const P_FLAM = new Float32Array(NT);
  const P_IGN = new Float32Array(NT).fill(Infinity);
  const P_BURN_MIN = new Int32Array(NT);
  const P_BURN_MAX = new Int32Array(NT);
  const P_BURNTEMP = new Float32Array(NT);
  const P_FIREEMIT = new Float32Array(NT);
  const P_NEEDAIR = new Uint8Array(NT);
  const P_WATERPROOF = new Uint8Array(NT);
  const P_EXPL_R = new Uint8Array(NT);
  const P_EXPL_POW = new Float32Array(NT);
  const P_ACIDRES = new Float32Array(NT);
  const P_BLASTRES = new Float32Array(NT);
  const P_CONDUCT = new Uint8Array(NT);
  const P_VOLATILE = new Uint8Array(NT);
  const P_DISP = new Uint8Array(NT);
  const P_VISC = new Float32Array(NT);
  const P_SLIDE = new Float32Array(NT);
  const P_LIFE_MIN = new Int32Array(NT);
  const P_LIFE_MAX = new Int32Array(NT);
  const P_HASRX = new Uint8Array(NT);
  const BURNINTO = new Array(NT).fill(null);

  // periodic elements: phase is decided per cell from temperature
  const F_ALK = 1, F_AE = 2, F_TM = 3, F_PT = 4, F_MD = 5, F_NM = 6, F_HAL = 7, F_NG = 8, F_LN = 9, F_AN = 10, F_SH = 11;
  const FAMCODE = { alk: F_ALK, ae: F_AE, tm: F_TM, pt: F_PT, md: F_MD, nm: F_NM, hal: F_HAL, ng: F_NG, ln: F_LN, an: F_AN, sh: F_SH };
  const P_PERIODIC = new Uint8Array(NT);
  const P_MP = new Float32Array(NT).fill(Infinity);
  const P_BP = new Float32Array(NT).fill(Infinity);
  const P_GDENS = new Float32Array(NT);
  const P_BUOY = new Float32Array(NT);
  const P_FAM = new Uint8Array(NT);
  const P_WR_P = new Float32Array(NT), P_WR_R = new Uint8Array(NT), P_WR_POW = new Float32Array(NT);
  const P_FIZZ = new Uint8Array(NT), P_CORR = new Float32Array(NT), P_TOXIC = new Uint8Array(NT);
  const P_DHEAT = new Float32Array(NT), P_RAD = new Float32Array(NT), P_NEM = new Float32Array(NT);
  const P_FIS = new Float32Array(NT), P_ABS = new Float32Array(NT), P_SHIELD = new Uint8Array(NT);
  const P_DECAY = new Float32Array(NT), P_DECAYTO = new Int16Array(NT), P_ALPHA = new Uint8Array(NT);
  const P_FLAME = new Uint8Array(NT), P_METALLIC = new Uint8Array(NT), P_LIVING = new Uint8Array(NT);
  // phosphors: aux counts down the afterglow left by the last hit of current or radiation
  const P_PHOS = new Uint8Array(NT), P_ACIDH = new Uint8Array(NT);
  // glass colourants; electrical behaviour (resistance heating and its ceiling, current sources, a
  // capacitor, the temperature a superconductor drops below); metals that throw sparks burning
  const P_GLASS = new Uint8Array(NT), P_OHM = new Float32Array(NT), P_OHMMAX = new Float32Array(NT);
  const P_SOLAR = new Uint8Array(NT), P_SEEBECK = new Uint8Array(NT), P_CAPAC = new Uint8Array(NT);
  const P_SC = new Float32Array(NT), P_SPARK = new Uint8Array(NT);
  // magnetism: what a magnet pulls (below its Curie temperature) and how hard (1 for iron, cobalt,
  // nickel; less for liquid oxygen; negative for bismuth, which is pushed away); the permanent
  // magnets (neodymium, samarium) that make the field; and calcium fusion's products
  const P_FERRO = new Uint8Array(NT), P_CURIE = new Float32Array(NT), P_PERM = new Uint8Array(NT);
  const P_MAGK = new Float32Array(NT), P_FUSE = new Int16Array(NT);
  // cast metal (periodic.js): the solid form a molten metal sets into, and the solid forms themselves,
  // which behave as their metal does but stand still instead of falling as grains
  const P_CASTTO = new Int16Array(NT), P_SOLID = new Uint8Array(NT);

  for (const d of list) {
    const t = d.id;
    P_CAT[t] = d.cat;
    P_DENS[t] = d.density;
    P_COND[t] = d.cond;
    P_ICAP[t] = 1 / d.cap;
    P_LOSS[t] = d.loss;
    P_TEMP[t] = d.temp;
    if (d.hi) { P_HI_T[t] = d.hi[0]; P_HI_TO[t] = d.hi[1]; P_HI_P[t] = d.hi[2]; }
    if (d.lo) { P_LO_T[t] = d.lo[0]; P_LO_TO[t] = d.lo[1]; P_LO_P[t] = d.lo[2]; }
    P_FLAM[t] = d.flam;
    P_IGN[t] = d.ign;
    P_BURN_MIN[t] = d.burn[0];
    P_BURN_MAX[t] = d.burn[1];
    P_BURNTEMP[t] = d.burnTemp;
    P_FIREEMIT[t] = d.fireEmit;
    P_NEEDAIR[t] = d.needAir ? 1 : 0;
    P_WATERPROOF[t] = d.waterproof ? 1 : 0;
    if (d.explode) { P_EXPL_R[t] = d.explode[0]; P_EXPL_POW[t] = d.explode[1]; }
    P_ACIDRES[t] = d.acidRes;
    P_BLASTRES[t] = d.blastRes;
    P_CONDUCT[t] = d.conduct ? 1 : 0;
    P_DISP[t] = d.disp;
    P_VISC[t] = d.visc;
    P_SLIDE[t] = d.slide;
    if (d.life) { P_LIFE_MIN[t] = d.life[0]; P_LIFE_MAX[t] = d.life[1]; }
    if (d.burnInto) {
      const total = d.burnInto.reduce((s, x) => s + x[1], 0);
      BURNINTO[t] = { ids: d.burnInto.map((x) => x[0]), w: d.burnInto.map((x) => x[1] / total) };
    }
  }
  // How hard moving air drags each kind of matter (light grains far more than heavy ones), how
  // quickly it skids to a stop once grounded, and how much of a runny liquid's fall turns into a
  // sideways surge when it lands.
  const P_ADRAG = new Float32Array(NT), P_FRIC = new Float32Array(NT), P_SPLASH = new Float32Array(NT);
  for (const d of list) {
    const t = d.id, dn = Math.max(0.5, d.density);
    if (d.cat === CAT.POWDER) {
      P_ADRAG[t] = Math.min(0.35, 2.4 / dn);
      P_FRIC[t] = 0.5 + 0.35 * d.slide;
    } else if (d.cat === CAT.LIQUID) {
      P_ADRAG[t] = Math.min(0.1, 0.4 / dn);
      const runny = Math.min(1, d.disp / 5) * d.visc;
      P_FRIC[t] = 0.86 + 0.125 * runny;
      if (d.visc >= 0.8) P_SPLASH[t] = Math.min(1, d.disp / 5);
    }
    if (d.periodic) P_FRIC[t] = Math.max(P_FRIC[t], 0.8); // a pellet may melt mid-flight
  }
  for (const t of [GUNPOWDER, METHANE, OIL, NAPALM, THERMITE, NITRO, EL_H]) P_VOLATILE[t] = 1;
  for (const t of [FISH, WORM, FIREFLY, PLANT, FLOWER, SEED, MOSS, HUMAN, HEAD, BIRD, ANT,
    ACORN, GRASSSEED, CACTUSSEED, VINESEED, SPORES, LILYSEED, SAPLING, GRASS, CACTUS, VINE, MUSHROOM, LILY,
    PINE, PINECONE, PALM, COCONUT, WILLOW, CATKIN, CELL, COW, WOLF, SHARK]) P_LIVING[t] = 1;
  // living plant tissue, which needs water from its roots (see thirst())
  const P_SAP = new Uint8Array(NT);
  for (const t of [PLANT, FLOWER, GRASS, CACTUS, VINE, MUSHROOM, LILY, SAPLING, PINE, PALM, WILLOW]) P_SAP[t] = 1;
  // the growing tips of trees (the Oak, Pine, Palm and Willow tiles); see tree growth in createWorld
  const TREE = new Uint8Array(NT);
  for (const t of [SAPLING, PINE, PALM, WILLOW]) TREE[t] = 1;
  // painting one of these plants it (see sow()); over bare ground it drops this seed instead
  const SEED_OF = new Int16Array(NT);
  SEED_OF[PLANT] = SEED; SEED_OF[FLOWER] = SEED; SEED_OF[GRASS] = GRASSSEED; SEED_OF[CACTUS] = CACTUSSEED;
  SEED_OF[VINE] = VINESEED; SEED_OF[MUSHROOM] = SPORES; SEED_OF[LILY] = LILYSEED;
  SEED_OF[SAPLING] = ACORN; SEED_OF[PINE] = PINECONE; SEED_OF[PALM] = COCONUT; SEED_OF[WILLOW] = CATKIN;
  // things that kill a plant they touch (alcohol dries it out, vinegar is a weedkiller)
  const PLANTISH = [PLANT, FLOWER, GRASS, VINE, MOSS, MUSHROOM, LILY, CACTUS, DRYGRASS];
  // vinegar, a weak acid, on metals: how fast it fizzes hydrogen off each (magnesium hard, zinc and
  // iron slowly, copper, silver and gold not at all); alkali metals take it as they take water
  const P_VINEGAR = new Float32Array(NT);
  for (const [sym, v] of [['Mg', 0.08], ['Ca', 0.06], ['Sr', 0.06], ['Ba', 0.06], ['Ra', 0.06], ['Zn', 0.035], ['Mn', 0.03],
    ['Fe', 0.012], ['Cd', 0.012], ['Co', 0.008], ['Pb', 0.008], ['Ni', 0.006], ['Sn', 0.006], ['Al', 0.004], ['Cr', 0.004], ['Be', 0.004]]) {
    if (ID['EL_' + sym.toUpperCase()] !== undefined) P_VINEGAR[ID['EL_' + sym.toUpperCase()]] = v;
  }
  for (const d of list) if (d.periodic && d.fam === 'ln' && d.chem && d.chem.acidH && !P_VINEGAR[d.id]) P_VINEGAR[d.id] = 0.02;
  // a painted colour (the col array): 0x1000000 | rgb, and 0x2000000 more for a picture's exact pixel
  const PAINTED = 0x1000000, EXACT = 0x2000000;
  const rgbOf = (hex) => PAINTED | parseInt(hex.slice(1), 16);
  const VERDIGRIS = rgbOf('#3fa98a'), TINCTURE = rgbOf('#8a4a1c');
  // light through stained glass takes its colour
  const GLASS_RGB = new Uint32Array(NT);
  for (const d of list) if (d.glassColor) GLASS_RGB[d.id] = rgbOf(d.glassColor);
  for (const t of [METAL, MMETAL, BATTERY]) P_METALLIC[t] = 1;
  // gases that sink or hover rather than always rising
  P_BUOY[CO2] = -0.5; P_GDENS[CO2] = 0.65;   // 1.98 g/L: pools on the floor
  P_BUOY[FOG] = -0.04; P_GDENS[FOG] = 0.6;   // hangs in the air, creeps into hollows
  P_BUOY[FOAM] = 0.25; P_GDENS[FOAM] = 0.3;  // bubbles drift upward
  // How each explosive goes off, after the real thing. Black powder deflagrates in an orange
  // flash and thick white smoke (half of what it makes is solid potassium salts); nitroglycerin
  // detonates in a brief white flash and leaves almost no smoke, only steam and gas; hydrogen
  // burns pale blue and leaves water vapour; methane flashes blue and leaves steam; an alkali
  // metal hitting water burns in its flame-test colour. The fire's colour itself comes from
  // flameColor (see explode).
  const BL_SMOKY = 1, BL_CLEAN = 2, BL_STEAM = 3;
  const P_BLAST = new Uint8Array(NT);
  P_BLAST[GUNPOWDER] = BL_SMOKY; P_BLAST[NITRO] = BL_CLEAN; P_BLAST[METHANE] = BL_STEAM;
  const IS_CLOUD = new Uint8Array(NT);
  for (const t of [CLOUD, RAINCLOUD, STORMCLOUD, SNOWCLOUD]) IS_CLOUD[t] = 1;
  // machines that run on current (it powers them for POWER_TICKS, and they pass it no further), and
  // what a pipe won't carry
  const P_CONSUMER = new Uint8Array(NT), NOPIPE = new Uint8Array(NT), POWER_TICKS = 24;
  for (const t of [VALVE, PUMP, PISTON, THRUSTER]) P_CONSUMER[t] = 1;
  // what a ship is built of: whatever is joined to a thruster through these flies with it (see ships())
  const SHIPPY = new Uint8Array(NT);
  for (const t of [WIRE, SWITCH, SENSOR, PIPE, VALVE, PUMP, TANK, PISTON, ROD, CASING, BATTERY, THRUSTER, LEGS, METAL, GLASS]) SHIPPY[t] = 1;
  for (const d of list) if (d.castOf !== undefined) SHIPPY[d.id] = 1; // cast metal
  // what a thruster burns
  const FUEL = new Uint8Array(NT);
  for (const t of [OIL, METHANE, ALCOHOL, NAPALM, EL_H]) FUEL[t] = 1;
  // the plumbing: what a pipe's bore is sealed by, and what keeps matter in (anything else beside a
  // pipe's bore is an opening)
  const PLUMBING = new Uint8Array(NT);
  for (const t of [PIPE, VALVE, PUMP, TANK, CASING]) PLUMBING[t] = 1;
  for (const t of [FIRE, PLASMA, SPARK, LIGHT, RAD, MSPARK, EMBER, LIGHTNING, EXPLOSION]) NOPIPE[t] = 1;
  for (const d of list) {
    if (d.flameColor) P_FLAME[d.id] = 1;
    if (!d.periodic && d.castOf === undefined) continue;
    const t = d.id, src = d.periodic ? d : list[d.castOf], c = src.chem; // a solid form takes its metal's ways
    P_PERIODIC[t] = 1;
    P_MP[t] = src.mp; P_BP[t] = src.bp;
    P_GDENS[t] = src.gdens;
    const gl = src.gl;
    P_BUOY[t] = gl ? (1.29 - gl) / Math.max(gl, 1.29) : 0.6; // vapours of solids are hot, so they rise
    P_FAM[t] = FAMCODE[src.fam];
    P_METALLIC[t] = [F_ALK, F_AE, F_TM, F_PT, F_LN, F_AN, F_SH].includes(P_FAM[t]) ? 1 : 0;
    if (c.wr) { P_WR_P[t] = c.wr[0]; P_WR_R[t] = c.wr[1]; P_WR_POW[t] = c.wr[2]; P_BLAST[t] = BL_STEAM; }
    if (P_EXPL_R[t]) P_BLAST[t] = BL_STEAM; // hydrogen
    P_FIZZ[t] = c.fizz ? 1 : 0; P_CORR[t] = c.corr; P_TOXIC[t] = c.toxic ? 1 : 0;
    P_DHEAT[t] = c.heat; P_RAD[t] = c.rad; P_NEM[t] = c.nem; P_FIS[t] = c.fis; P_ABS[t] = c.abs;
    P_SHIELD[t] = c.shield ? 1 : 0;
    if (c.phos) P_PHOS[t] = c.phos[1];
    P_ACIDH[t] = c.acidH ? 1 : 0;
    P_GLASS[t] = c.glass ? 1 : 0;
    if (c.ohm) { P_OHM[t] = c.ohm[0]; P_OHMMAX[t] = c.ohm[1]; }
    P_SOLAR[t] = c.solar ? 1 : 0; P_SEEBECK[t] = c.seebeck ? 1 : 0; P_CAPAC[t] = c.capacitor ? 1 : 0;
    P_SC[t] = c.sc; P_SPARK[t] = c.spark ? 1 : 0;
    if (c.curie !== null) { P_FERRO[t] = 1; P_CURIE[t] = c.curie; }
    P_PERM[t] = c.magnet ? 1 : 0;
    P_MAGK[t] = c.magnet ? 0 : c.curie !== null ? 1 : c.para ? 0.45 : c.dia ? -0.6 : 0;
    if (c.fuse) P_FUSE[t] = ID['EL_' + c.fuse.toUpperCase()];
    if (c.decay) {
      P_DECAY[t] = c.decay[0];
      P_DECAYTO[t] = ID['EL_' + c.decay[1].toUpperCase()];
      P_ALPHA[t] = c.decay[2] === 'a' ? 1 : 0;
    }
    if (!d.periodic) { P_SOLID[t] = 1; P_MAGK[t] = 0; P_CASTTO[d.castOf] = t; } // a block isn't dragged by a magnet
  }
  P_FERRO[METAL] = 1; P_CURIE[METAL] = 770; // the alchemist's metal is iron: wired up, it makes an electromagnet
  const MAGNETS = []; // the permanent magnets: neodymium and samarium, as grains or as solid blocks
  for (let t = 0; t < NT; t++) if (P_PERM[t]) MAGNETS.push(t);
  const FLAME_EL = [0], FLAME_DYE = new Uint16Array(NT); // dye index → flame element, and element → dye bits
  for (let t = 0; t < NT; t++) if (P_FLAME[t] && FLAME_EL.length < DYE >> DYE_SHIFT) { FLAME_DYE[t] = FLAME_EL.length << DYE_SHIFT; FLAME_EL.push(t); }
  // Rainbow fire, once every fire colour is made: a fire's aux of RAINBOW (no element has that
  // number) burns in each colour in turn (see render.js). It takes the last dye index.
  const RAINBOW = NT - 2, RAINBOW_DYE = DYE >> DYE_SHIFT;
  FLAME_EL[RAINBOW_DYE] = RAINBOW; FLAME_DYE[RAINBOW] = RAINBOW_DYE << DYE_SHIFT;
  P_CAT[BOUND] = C_STATIC; P_DENS[BOUND] = 1e9; P_COND[BOUND] = 0; P_ICAP[BOUND] = 1;
  P_ACIDRES[BOUND] = 1; P_BLASTRES[BOUND] = 99;

  // ───────────── contact reactions ─────────────
  // A touching B (in either order) → A becomes A2, B becomes B2, with probability p per tick.
  const KEEP = -1;
  const EV_SIZZLE = 1;
  const RX = new Uint16Array(NT * NT);
  const RXP = [0], RXA = [0], RXB = [0], RXE = [0];
  function rx(a, b, p, a2, b2, ev) {
    RXP.push(p); RXA.push(a2); RXB.push(b2); RXE.push(ev || 0);
    RX[a * NT + b] = RXP.length - 1;
    RXP.push(p); RXA.push(b2); RXB.push(a2); RXE.push(ev || 0);
    RX[b * NT + a] = RXP.length - 1;
    P_HASRX[a] = 1; P_HASRX[b] = 1;
  }
  rx(WATER, LAVA, 0.25, STEAM, OBSIDIAN, EV_SIZZLE);
  rx(SALTWATER, LAVA, 0.25, STEAM, OBSIDIAN, EV_SIZZLE);
  rx(ICE, LAVA, 0.3, WATER, OBSIDIAN, EV_SIZZLE);
  rx(SNOW, LAVA, 0.5, WATER, KEEP, EV_SIZZLE);
  rx(WATER, SALT, 0.04, SALTWATER, WATER);
  rx(DIRT, WATER, 0.03, MUD, EMPTY);
  rx(ICE, SALT, 0.01, WATER, KEEP);
  rx(SNOW, SALT, 0.03, WATER, KEEP);
  rx(FIRE, WATER, 0.5, STEAM, KEEP, EV_SIZZLE);
  rx(FIRE, SALTWATER, 0.5, STEAM, KEEP, EV_SIZZLE);
  rx(FIRE, ICE, 0.2, EMPTY, WATER);
  rx(FIRE, SNOW, 0.3, EMPTY, WATER);
  rx(EMBER, WATER, 0.5, ASH, STEAM, EV_SIZZLE);
  rx(EMBER, SALTWATER, 0.5, ASH, STEAM, EV_SIZZLE);
  rx(MMETAL, WATER, 0.3, METAL, STEAM, EV_SIZZLE);
  rx(MMETAL, SALTWATER, 0.3, METAL, STEAM, EV_SIZZLE);
  rx(MGLASS, WATER, 0.3, GLASS, STEAM, EV_SIZZLE);
  rx(ASH, SALT, 0.01, GUNPOWDER, EMPTY);
  rx(RUST, GUNPOWDER, 0.03, THERMITE, THERMITE);
  rx(OIL, GUNPOWDER, 0.03, NAPALM, NAPALM);
  rx(METAL, WATER, 0.0004, RUST, KEEP);
  rx(METAL, SALTWATER, 0.003, RUST, KEEP);
  rx(METAL, STEAM, 0.0006, RUST, KEEP);
  rx(PLANT, WATER, 0.004, KEEP, PLANT);
  rx(PLANT, MUD, 0.0006, METHANE, KEEP);
  rx(OIL, ACID, 0.05, NITRO, EMPTY);
  rx(CRYO, WATER, 0.3, KEEP, ICE);
  rx(CRYO, SALTWATER, 0.3, KEEP, ICE);
  rx(CRYO, FIRE, 0.6, KEEP, EMPTY);
  rx(CRYO, STEAM, 0.4, KEEP, SNOW);
  rx(CRYO, LAVA, 0.3, EMPTY, OBSIDIAN);
  rx(EL_AL, RUST, 0.03, THERMITE, THERMITE);  // real thermite: aluminium + iron oxide
  rx(EL_FE, WATER, 0.0004, RUST, KEEP);
  rx(EL_FE, SALTWATER, 0.003, RUST, KEEP);
  rx(EL_O, FIRE, 0.6, FIRE, KEEP);             // oxygen feeds flames
  rx(EL_S, EL_C, 0.01, GUNPOWDER, GUNPOWDER);  // sulfur + charcoal
  rx(ASH, OIL, 0.01, SOAP, EMPTY);             // lye + fat: saponification
  rx(SOAP, WATER, 0.03, FOAM, FOAM);
  rx(FOAM, FIRE, 0.5, EMPTY, KEEP);
  rx(CO2, FIRE, 0.15, KEEP, EMPTY);            // carbon dioxide smothers flames
  rx(HAIL, LAVA, 0.5, WATER, KEEP, EV_SIZZLE);
  rx(DRYICE, LAVA, 0.5, CO2, KEEP, EV_SIZZLE);
  rx(DRYGRASS, WATER, 0.05, PLANT, EMPTY);     // a soaking greens parched grass again
  rx(FIRE, VINEGAR, 0.5, STEAM, KEEP, EV_SIZZLE);
  rx(VINEGAR, LAVA, 0.25, STEAM, OBSIDIAN, EV_SIZZLE);
  rx(METAL, VINEGAR, 0.004, RUST, KEEP);        // iron soaked in vinegar rusts fast
  rx(CEMENT, LAVA, 0.2, CONCRETE, KEEP);        // baked hard at once
  for (const t of PLANTISH) { rx(ALCOHOL, t, 0.04, KEEP, LITTER); rx(VINEGAR, t, 0.05, KEEP, LITTER); }
  rx(LIME, SAND, 0.03, CEMENT, CEMENT);         // lime mortar: lime and sand
  rx(LIME, CO2, 0.08, LIMESTONE, EMPTY);        // lime water clouds over with carbon dioxide: calcium carbonate
  rx(LIME, ACID, 0.1, SALTWATER, EMPTY, EV_SIZZLE); // an alkali neutralises an acid, to a salt in water
  rx(LIME, VINEGAR, 0.05, WATER, WATER);
  rx(LIMESTONE, VINEGAR, 0.008, CO2, WATER);    // vinegar fizzes slowly on limestone (acid is in LIMESTONE below)
  rx(STEAM, SNOW, 0.03, FOG, KEEP);             // warm vapour over snow: fog
  rx(CLOUD, SNOW, 0.05, SNOWCLOUD, EMPTY);      // a cloud seeded with snow
  rx(RAINCLOUD, SNOW, 0.05, SNOWCLOUD, EMPTY);
  rx(RAINCLOUD, SPARK, 0.5, STORMCLOUD, KEEP);  // a rain cloud charged with electricity

  // ───────────── world ─────────────
  function createWorld(W, H) {
    const SW = W + 2, SH = H + 2, N = SW * SH;
    const type = new Uint16Array(N);
    const shade = new Uint8Array(N);
    const flags = new Uint16Array(N);
    const charge = new Uint8Array(N);
    const aux = new Uint16Array(N); // often an element number (a fire's colour, a pane's stain, what rubble was)
    const stamp = new Uint16Array(N);
    const data = new Int32Array(N);
    const temp = new Float32Array(N);
    const vy = new Float32Array(N);
    const vx = new Float32Array(N);
    const sap = new Uint8Array(N); // water reaching each living plant cell (see thirst())
    const col = new Uint32Array(N); // a colour painted on the cell (PAINTED | rgb), or 0 for its own

    // the air field (see AS above). avx[a] is the flow across the right-hand face of air cell a
    // and avy[a] across its bottom face; positive means rightward / downward.
    const AW = Math.ceil(W / AS), AH = Math.ceil(H / AS), AN = AW * AH;
    const avx = new Float32Array(AN), avy = new Float32Array(AN), ap = new Float32Array(AN);
    const bvx = new Float32Array(AN), bvy = new Float32Array(AN), bp = new Float32Array(AN); // scratch
    const asol = new Uint8Array(AN), aden = new Uint8Array(AN), aliq = new Uint8Array(AN), ahot = new Float32Array(AN); // tallied by heatPass
    const ablk = new Uint8Array(AN), adamp = new Float32Array(AN).fill(1);
    const acnt = new Uint8Array(AN);
    const AIRMAP = AN < 65536 ? new Uint16Array(N) : new Uint32Array(N); // sim cell → air cell
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const a = (y >> 2) * AW + (x >> 2);
        AIRMAP[(y + 1) * SW + x + 1] = a;
        acnt[a]++;
      }
    }

    const N4 = new Int32Array([-SW, SW, -1, 1]);
    const N8 = new Int32Array([-SW, SW, -1, 1, -SW - 1, -SW + 1, SW - 1, SW + 1]);
    const UP3 = new Int32Array([-SW - 1, -SW, -SW + 1]);

    const disc = new Uint8Array(NT);
    const counts = new Int32Array(NT);
    // booms: x, y, radius, kind (the element whose colour the blast shows) for each blast this frame
    const events = { sizzle: 0, ignite: 0, fizz: 0, zap: 0, burning: 0, fission: 0, decay: 0, rad: 0, naturalBolt: 0, booms: [], bolts: [], found: [], rx: [], fused: [] };
    // A contact reaction worth seeing: x, y and the element whose colour the renderer flashes there.
    // Capped per frame, so a whole pool of acid eating a heap of zinc doesn't flood the screen.
    function flashRx(i, t) {
      if (events.rx.length < 120) events.rx.push(cx(i), cy(i), t);
    }
    // the disasters set off from the Weapons tab, playing out (see launch()); rumble is how hard
    // the ground rumbles this frame (whatever shakes the screen except a blast, which brings its
    // own sound: an earthquake, a volcano, a tsunami, a black hole), surge and howl how hard the
    // sea roars and the wind howls, cracks how many solid cells an earthquake broke, and flash and
    // shake how much the screen should flash and shake
    const disasters = [];
    // hbomb is x, y, radius for each hydrogen bomb that went off, and whistle how far down a
    // falling one has come (0 when none is falling)
    Object.assign(events, { rumble: 0, cracks: 0, surge: 0, howl: 0, flash: 0, shake: 0, hbomb: [], whistle: 0, pump: 0, piston: 0 });
    // how newly painted machines are set (the panel's machine settings): which way a piston or a pump
    // faces, whether a piston is sticky, and what a sensor senses and at what temperature
    const machine = { dir: 0, mode: 1, set: 100, sticky: false };

    let now = 1;
    let tick = 0;
    let ambient = AMBIENT;                       // temperature the open air relaxes toward
    const weather = { mode: 'natural', wind: 0 }; // see weatherTick()
    const rules = { drySoil: false, births: true, goalX: -1, farming: true }; // story chapters bend a few laws: drySoil = seeds need mud,
    // goalX = a column calm people drift toward (travellers making for a village)
    let seed = (Math.random() * 4294967295) >>> 0 || 0x9e3779b9;
    function rnd() {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      return (seed >>> 0) * 2.3283064365386963e-10;
    }

    const idx = (x, y) => (y + 1) * SW + x + 1;
    const cx = (i) => (i % SW) - 1;
    const cy = (i) => ((i / SW) | 0) - 1;

    let empLeft = 0; // a solar storm: ticks the circuits are still down for (see startSolar())
    function clear() {
      type.fill(EMPTY); flags.fill(0); charge.fill(0); aux.fill(0); stamp.fill(0);
      data.fill(0); temp.fill(ambient); vy.fill(0); vx.fill(0); sap.fill(0); col.fill(0);
      avx.fill(0); avy.fill(0); ap.fill(0);
      disasters.length = 0; empLeft = 0;
      for (let x = 0; x < SW; x++) { type[x] = BOUND; type[(SH - 1) * SW + x] = BOUND; }
      for (let y = 0; y < SH; y++) { type[y * SW] = BOUND; type[y * SW + SW - 1] = BOUND; }
      for (let i = 0; i < N; i++) shade[i] = (rnd() * 256) | 0;
    }
    clear();

    function initData(t) {
      const lo = P_LIFE_MIN[t];
      return lo ? lo + ((rnd() * (P_LIFE_MAX[t] - lo + 1)) | 0) : 0;
    }

    function discover(t, i) {
      disc[t] = 1;
      events.found.push(t, cx(i), cy(i));
    }

    // Change a cell's element in place, keeping its temperature. Counts as a discovery.
    function transform(i, t) {
      type[i] = t; flags[i] = 0; aux[i] = 0; charge[i] = 0; vy[i] = 0; vx[i] = 0; col[i] = 0;
      data[i] = initData(t); stamp[i] = now; sap[i] = P_SAP[t] ? 160 : 0;
      if (t === FIRE) { if (temp[i] < 700) temp[i] = 700 + rnd() * 250; }
      else if (t === PLASMA) { if (temp[i] < 3000) temp[i] = 3000 + rnd() * 1500; }
      else if (t === EMBER) { if (temp[i] < 700) temp[i] = 700; }
      if (!disc[t]) discover(t, i);
    }

    // Put a fresh element at its default temperature (painting, scenes). Never a discovery.
    function place(i, t) {
      type[i] = t; flags[i] = 0; aux[i] = 0; charge[i] = 0; vy[i] = 0; vx[i] = 0; stamp[i] = 0; col[i] = 0;
      data[i] = initData(t); temp[i] = P_TEMP[t]; shade[i] = (rnd() * 256) | 0; sap[i] = P_SAP[t] ? 200 : 0;
      if (t === FISH || t === FIREFLY || t === BIRD || t === COW || t === WOLF || t === SHARK) aux[i] = rnd() < 0.5 ? 1 : 0;
      else if (t === HUMAN) aux[i] = (((rnd() * 16) | 0) << 1) | (rnd() < 0.9 ? SWIMS : 0) | (rnd() < 0.5 ? 1 : 0); // shirt colour in bits 1–4
    }

    function swap(a, b) {
      let v;
      v = type[a]; type[a] = type[b]; type[b] = v;
      v = shade[a]; shade[a] = shade[b]; shade[b] = v;
      v = flags[a]; flags[a] = flags[b]; flags[b] = v;
      v = charge[a]; charge[a] = charge[b]; charge[b] = v;
      v = aux[a]; aux[a] = aux[b]; aux[b] = v;
      v = data[a]; data[a] = data[b]; data[b] = v;
      v = temp[a]; temp[a] = temp[b]; temp[b] = v;
      v = vy[a]; vy[a] = vy[b]; vy[b] = v;
      v = vx[a]; vx[a] = vx[b]; vx[b] = v;
      v = col[a]; col[a] = col[b]; col[b] = v;
      stamp[a] = now; stamp[b] = now;
    }

    // A periodic element's state comes from its temperature; everything else has a fixed category.
    function catOf(j) {
      const t = type[j];
      if (!P_PERIODIC[t]) return P_CAT[t];
      const T = temp[j];
      return T >= P_BP[t] ? C_GAS : T >= P_MP[t] ? C_LIQUID : P_SOLID[t] ? C_STATIC : C_POWDER;
    }
    function densOf(j) {
      const t = type[j];
      return P_PERIODIC[t] && temp[j] >= P_BP[t] ? P_GDENS[t] : P_DENS[t];
    }
    function airAt(j) { const t = type[j]; return t === EMPTY || (t !== BOUND && catOf(j) === C_GAS); }
    function hasAir(i) {
      return airAt(i - SW) || airAt(i + SW) || airAt(i - 1) || airAt(i + 1);
    }
    function canEnter(dens, j) {
      const bt = type[j];
      if (bt === EMPTY) return true;
      if (bt === BOUND) return false;
      const c = catOf(j);
      return c === C_GAS || (c === C_LIQUID && densOf(j) < dens);
    }

    function emitInto(i, t) {
      let n = i - SW;
      if (type[n] !== EMPTY) {
        const s = (rnd() * 8) | 0;
        n = -1;
        for (let k = 0; k < 8; k++) {
          const m = i + N8[(s + k) & 7];
          if (type[m] === EMPTY) { n = m; break; }
        }
        if (n < 0) return -1;
      }
      transform(n, t);
      return n;
    }

    // ───── fire ─────
    function ignite(i) {
      const t = type[i];
      flags[i] |= BURN;
      data[i] = P_BURN_MIN[t] + ((rnd() * (P_BURN_MAX[t] - P_BURN_MIN[t] + 1)) | 0);
      events.ignite++;
    }
    // pass a painted fire's colour on to the fuel it lights
    function dye(n, f) { if (f & DYE) flags[n] = (flags[n] & ~DYE) | (f & DYE); }

    function burnOut(i, t) {
      const b = BURNINTO[t];
      let to = EMPTY;
      if (b) {
        let r = rnd();
        for (let k = 0; k < b.ids.length; k++) { r -= b.w[k]; if (r <= 0) { to = b.ids[k]; break; } }
      }
      transform(i, to);
    }

    // Oxygen within two cells of a hydrogen blast burns with it into steam. Returns how much did.
    function burnOxygen(i) {
      const x0 = cx(i), y0 = cy(i);
      let ox = 0;
      for (let y = Math.max(0, y0 - 2); y <= Math.min(H - 1, y0 + 2); y++) {
        for (let x = Math.max(0, x0 - 2), j = idx(x, y); x <= Math.min(W - 1, x0 + 2); x++, j++) {
          if (type[j] === EL_O) { transform(j, STEAM); temp[j] = 600; ox++; }
        }
      }
      return ox;
    }

    // Returns true if the cell stopped existing as itself.
    function burn(i, t) {
      const d = --data[i];
      const er = P_EXPL_R[t];
      if (er) {
        if (d <= 0) {
          let r = er, pow = P_EXPL_POW[t];
          if (t === EL_H) {
            // oxyhydrogen: oxygen mixed in burns along with it, to water, and the bang grows
            const ox = burnOxygen(i);
            r += (ox >= 3 ? 1 : 0) + (ox >= 9 ? 1 : 0);
            pow += Math.min(0.4, ox * 0.04);
          }
          transform(i, t === EL_H ? STEAM : FIRE);
          if (t === EL_H) temp[i] = 600;
          explode(cx(i), cy(i), r, pow, t);
          return true;
        }
        return false;
      }
      if (P_NEEDAIR[t] && ((i + tick) & 7) === 0 && !hasAir(i)) { flags[i] &= ~BURN; return false; }
      const bt = P_BURNTEMP[t];
      if (temp[i] < bt) temp[i] += (bt - temp[i]) * 0.25;
      if (rnd() < P_FIREEMIT[t]) {
        const j = i + UP3[(rnd() * 3) | 0];
        if (type[j] === EMPTY) {
          transform(j, FIRE); data[j] = 6 + ((rnd() * 16) | 0); temp[j] = bt;
          if (P_FLAME[t]) aux[j] = t; // flame test colour
          else if (flags[i] & DYE) { aux[j] = FLAME_EL[(flags[i] & DYE) >> DYE_SHIFT]; flags[j] |= flags[i] & DYE; }
        }
      }
      if (P_SPARK[t] && rnd() < 0.12) throwSparks(i, t, 1, 3); // magnesium, zirconium, a flint: white sparks
      const n = i + N8[(rnd() * 8) | 0], nt = type[n];
      if (nt === EL_O) { transform(n, FIRE); temp[i] += 120; data[i] += 4; return false; }
      if (t === EL_MG) {
        // burning magnesium takes the oxygen from carbon dioxide (leaving black carbon) and from
        // water (leaving hydrogen, which explodes): never fight a magnesium fire with either
        if (nt === CO2) { transform(n, rnd() < 0.5 ? EL_C : EMPTY); temp[n] = 600; temp[i] += 80; data[i] += 1; flashRx(n, EL_MG); return false; }
        if ((isWater(nt) || nt === STEAM) && rnd() < 0.3) { transform(n, EL_H); temp[n] = 900; events.sizzle++; flashRx(n, EL_MG); return false; }
      }
      if (nt === WATER || nt === SALTWATER) {
        if (!P_WATERPROOF[t] && rnd() < 0.5) {
          flags[i] &= ~BURN; temp[i] = 95;
          transform(n, STEAM); events.sizzle++;
          return false;
        }
      } else if (P_FLAM[nt] > 0 && !(flags[n] & BURN) && rnd() < P_FLAM[nt] * 0.12) {
        if (!P_NEEDAIR[nt] || hasAir(n)) { ignite(n); dye(n, flags[i]); }
      }
      if (t === WOOD || t === COAL) {
        if (rnd() < 0.004) { const j = i + UP3[(rnd() * 3) | 0]; if (type[j] === EMPTY) transform(j, EMBER); }
      } else if (t === THERMITE && rnd() < 0.05) {
        const j = i + N8[(rnd() * 8) | 0];
        if (type[j] === EMPTY) transform(j, EMBER);
      }
      if (d <= 0) { burnOut(i, t); return true; }
      return false;
    }

    // Throw a grain or drop outward from a blast at distance d, harder the closer it was. The same
    // shove sends a light liquid faster than a heavy one (water as the yardstick).
    function fling(j, dx, dy, d, r, power) {
      let s = power * (2.2 + 3.4 * Math.max(0, 1 - (d - r) / r)) * (0.6 + 0.8 * rnd());
      if (catOf(j) === C_LIQUID) s *= Math.max(0.1, Math.min(1.4, 10 / densOf(j)));
      else s *= heft(j); // a heavy grain (gold, lead) is thrown less far than ash
      const k = d > 0 ? s / d : 0, kick = d > 0 ? 0 : s;
      let ux = vx[j] + dx * k, uy = vy[j] + dy * k - power - kick;
      vx[j] = ux > MAXV ? MAXV : ux < -MAXV ? -MAXV : ux;
      vy[j] = uy > MAXV ? MAXV : uy < -MAXV ? -MAXV : uy;
      flags[j] &= ~SETTLED;
    }

    // How readily a shove moves this cell, from its density: about 1 for sand, more for ash and snow,
    // less for heavy metal grains. Blasts, tornadoes, earthquakes and black holes all go by it.
    function heft(j) { return Math.max(0.45, Math.min(1.5, Math.sqrt(15 / Math.max(0.1, densOf(j))))); }

    // The flame-colouring element most common in the heart of a blast, or 0. Metal salts packed
    // into black powder are how fireworks get their colours (strontium red, barium green, copper
    // blue-green, sodium yellow, magnesium white). Fire already tinted by one counts, so a chain
    // of blasts keeps its colour; explosives bring their own colour and don't count.
    const tally = new Uint16Array(NT);
    function colourant(x0, y0, r) {
      let best = 0, most = 0;
      for (let pass = 0; pass < 2; pass++) {
        for (let y = Math.max(0, y0 - r); y <= Math.min(H - 1, y0 + r); y++) {
          for (let x = Math.max(0, x0 - r), j = idx(x, y); x <= Math.min(W - 1, x0 + r); x++, j++) {
            let t = type[j];
            if (t === FIRE) t = aux[j];
            if (!t || !P_FLAME[t] || P_EXPL_R[t]) continue;
            if (pass) { tally[t] = 0; continue; } // second pass: clear the tally for next time
            if (++tally[t] > most) { most = tally[t]; best = t; }
          }
        }
      }
      return best;
    }

    // Fire made by a blast, in the blast's colour. A detonation's flash is over in an instant and
    // a gas flame burns out fast, neither leaving smoke; powder fire dies into white smoke.
    function blastFire(j, tint, kind) {
      transform(j, FIRE);
      aux[j] = tint;
      if (kind === BL_CLEAN) { data[j] = 3 + ((rnd() * 8) | 0); flags[j] = SMOKE_NONE; }
      else if (kind === BL_STEAM) { data[j] = 5 + ((rnd() * 12) | 0); flags[j] = SMOKE_NONE; }
      else if (kind === BL_SMOKY) flags[j] = SMOKE_WHITE;
    }
    // What a blast leaves where it consumed something.
    function blastLeft(j, kind) {
      const q = rnd();
      if (kind === BL_SMOKY) {
        if (q < 0.75) { transform(j, SMOKE); aux[j] = 1; } // white powder smoke
        else transform(j, EMPTY);
      } else if (kind === BL_CLEAN) transform(j, q < 0.3 ? STEAM : EMPTY);
      else if (kind === BL_STEAM) transform(j, q < 0.5 ? STEAM : EMPTY);
      else transform(j, q < 0.5 ? SMOKE : EMPTY);
    }

    // A blast at (x0, y0). `src` is what went off. A metal caught in the blast colours its fire
    // (sodium's yellow swamps hydrogen's faint blue, as it does in a real flame); failing that the
    // explosive's own flameColor does. P_BLAST decides what it leaves behind.
    function explode(x0, y0, r, power, src = 0) {
      const tint = colourant(x0, y0, r) || (P_FLAME[src] ? src : 0), kind = P_BLAST[src];
      events.booms.push(x0, y0, r, tint || src);
      if (src && !disc[EXPLOSION]) discover(EXPLOSION, idx(x0, y0));
      const R = r * 2, r2 = r * r, R2 = R * R;
      for (let dy = -R; dy <= R; dy++) {
        const y = y0 + dy;
        if (y < 0 || y >= H) continue;
        for (let dx = -R; dx <= R; dx++) {
          const x = x0 + dx;
          if (x < 0 || x >= W) continue;
          const d2 = dx * dx + dy * dy;
          if (d2 > R2) continue;
          const j = (y + 1) * SW + x + 1, t = type[j];
          if (t === WALL || t === CLONE || t === VOID) continue;
          if (d2 <= r2) {
            const f = 1 - Math.sqrt(d2) / (r + 0.5);
            temp[j] += 350 * f + 80;
            if (t === EMPTY) {
              if (rnd() < f * 0.8) blastFire(j, tint, kind);
              else if (kind === BL_SMOKY && rnd() < 0.3) { transform(j, SMOKE); aux[j] = 1; }
              continue;
            }
            if (t === EL_CE && rnd() < 0.5) throwSparks(j, EL_CE, 3, 3); // a flint struck by the blast
            if (P_EXPL_R[t]) {
              if (!(flags[j] & BURN)) { flags[j] |= BURN; data[j] = 1 + ((rnd() * 4) | 0); }
              const c = catOf(j);
              if (c === C_POWDER || c === C_LIQUID) fling(j, dx, dy, Math.sqrt(d2), r, power * 0.5);
              continue;
            }
            if (rnd() < f * power * 1.6 - P_BLASTRES[t]) {
              if (t === WATER || t === SALTWATER) transform(j, STEAM);
              else if (rnd() < 0.5 * f + 0.2) blastFire(j, tint, kind);
              else blastLeft(j, kind);
            } else {
              if (P_FLAM[t] > 0 && !(flags[j] & BURN)) ignite(j);
              const c = catOf(j);
              if (c === C_POWDER || c === C_LIQUID) fling(j, dx, dy, Math.sqrt(d2), r, power);
            }
          } else if (t !== EMPTY) {
            const c = catOf(j);
            if (c === C_POWDER || c === C_LIQUID) fling(j, dx, dy, Math.sqrt(d2), r, power);
            else if (c === C_LIFE && rnd() < 0.7) {
              const d = Math.sqrt(d2), k = 1 + ((rnd() * 3) | 0);
              const tx = x + Math.round((dx / d) * k), ty = y + Math.round((dy / d) * k);
              if (tx >= 0 && tx < W && ty >= 0 && ty < H) {
                const tj = (ty + 1) * SW + tx + 1;
                if (type[tj] === EMPTY) swap(j, tj);
              }
            }
          }
        }
      }
      // and a pulse of pressure, which the air carries outward as a gust
      const ax0 = (x0 + 0.5) / AS, ay0 = (y0 + 0.5) / AS, ar = R / AS + 1;
      const ya = Math.max(0, Math.floor(ay0 - ar)), yb = Math.min(AH - 1, Math.floor(ay0 + ar));
      const xa = Math.max(0, Math.floor(ax0 - ar)), xb = Math.min(AW - 1, Math.floor(ax0 + ar));
      for (let ay = ya; ay <= yb; ay++) {
        for (let ax = xa; ax <= xb; ax++) {
          const ex = ax + 0.5 - ax0, ey = ay + 0.5 - ay0, d = Math.sqrt(ex * ex + ey * ey);
          if (d >= ar) continue;
          const a = ay * AW + ax, p = ap[a] + power * BOOM_P * (1 - d / ar);
          ap[a] = p > AIR_MAXP ? AIR_MAXP : p;
        }
      }
    }

    // ───── electricity ─────
    function energize(n) {
      if (empLeft > 0) return; // a solar storm: nothing can drive a current
      if (charge[n] === 0) {
        charge[n] = CH_NEW;
        if (!disc[SPARK]) discover(SPARK, n);
      }
    }

    function zap(n, nt) {
      if (P_VOLATILE[nt]) { if (!(flags[n] & BURN) && rnd() < 0.3) ignite(n); }
      else if (nt === FLOWER) { if (rnd() < 0.08) transform(n, FIREFLY); }
      else if (nt === FISH) { if (rnd() < 0.06) transform(n, ASH); }
    }

    const superconducting = (j) => P_SC[type[j]] !== 0 && temp[j] < P_SC[type[j]];

    function electric(i, t) {
      const c = charge[i];
      if (!P_CONDUCT[t] || empLeft > 0) { charge[i] = 0; return; }
      // a valve, a pump or a piston runs on the current and passes it no further; a switch that is
      // off lets none in
      if (P_CONSUMER[t]) { if (c === CH_ACTIVE) sap[i] = POWER_TICKS; charge[i] = c - 1; return; }
      if (t === SWITCH && !aux[i]) { charge[i] = 0; return; }
      if (c === CH_ACTIVE) {
        if (P_CAPAC[t]) { capacitor(i); charge[i] = c - 1; return; }
        // a cold superconductor hands the pulse on at once, and feels no heat from it
        const sc = superconducting(i);
        for (let k = 0; k < 4; k++) {
          const n = i + N4[k], nt = type[n];
          // a filament keeps its current to itself and its wires: the argon in a bulb stays dark
          // and insulated wire keeps its current from the water round it, both ways
          const insulated = (t === WIRE && catOf(n) === C_LIQUID) || (nt === WIRE && catOf(i) === C_LIQUID);
          if (P_CONDUCT[nt]) { if (charge[n] === 0 && !(P_OHM[t] && catOf(n) === C_GAS) && !insulated) charge[n] = sc && superconducting(n) ? CH_ACTIVE : CH_NEW; }
          else if (nt !== EMPTY && nt !== BOUND) zap(n, nt);
        }
        if (!sc) {
          // resistance heating: a filament climbs to white heat, nichrome to red; other wire barely warms
          const oh = P_OHM[t];
          let heater = oh > 0;
          if (oh) { if (temp[i] < P_OHMMAX[t]) temp[i] += oh; }
          else if (t !== WIRE) temp[i] += t === METAL ? 3 : 0.5;
          if ((t === EL_NI || t === EL_CR) && touches(i, t === EL_NI ? EL_CR : EL_NI)) {
            if (temp[i] < 1100) temp[i] += 80;
            heater = true;
          }
          if (heater && temp[i] > 500) { // a glowing wire lights fuel laid against it
            const n = i + N8[(rnd() * 8) | 0], nt = type[n];
            if (P_FLAM[nt] > 0 && !(flags[n] & BURN) && rnd() < 0.3 && (!P_NEEDAIR[nt] || hasAir(n))) ignite(n);
          }
        }
        if (t === EL_C) arc(i);
        if (P_FERRO[t] && !P_PERM[t]) ironCurrent = tick; // current in iron: the field wakes up (an electromagnet)
        if (P_PHOS[t] && aux[i] < P_PHOS[t]) aux[i] = P_PHOS[t]; // a phosphor lights up, and lingers
        events.zap++;
      }
      charge[i] = c - 1;
    }

    function touches(i, t) {
      for (let k = 0; k < 4; k++) if (type[i + N4[k]] === t) return true;
      return false;
    }

    // Current leaping a gap of one or two cells to more carbon: the carbon arc lamp, the first electric
    // street light. The arc is a steady thread of electric sparks (which don't set the rods alight, so
    // the lamp lasts), and the far rod carries the pulse on.
    function arc(i) {
      for (let k = 0; k < 4; k++) {
        const d = N4[k];
        let j = i + d, gap = 0;
        while (gap < 3 && (type[j] === EMPTY || type[j] === SPARK)) { j += d; gap++; }
        if (gap === 0 || gap === 3 || type[j] !== EL_C) continue;
        for (let m = i + d; m !== j; m += d) {
          if (type[m] !== SPARK) transform(m, SPARK);
          data[m] = 8 + ((rnd() * 6) | 0);
        }
        energize(j);
      }
    }

    // Tantalum soaks up pulses, sharing them only with more tantalum, and after a dozen lets them all
    // go at once into the wire around it, in a crack of sparks: a capacitor.
    function capacitor(i) {
      for (let k = 0; k < 4; k++) { const n = i + N4[k]; if (P_CAPAC[type[n]] && charge[n] === 0) charge[n] = CH_NEW; }
      if (++aux[i] < 12) return;
      aux[i] = 0;
      for (let k = 0; k < 8; k++) {
        const n = i + N8[k], nt = type[n];
        if (P_CONDUCT[nt] && !P_CAPAC[nt]) energize(n);
        else if (nt === EMPTY && rnd() < 0.5) transform(n, SPARK);
      }
      temp[i] += 20;
      events.zap += 4;
      flashRx(i, SPARK);
    }

    // ───── magnetism ─────
    // A coarse field over the map, like the air's. Each MS×MS block adds up its magnets: neodymium
    // and samarium below their Curie points, and iron, cobalt or nickel carrying current (which
    // linger a little between pulses, so a wired coil holds steady). Every block within MR blocks
    // of a magnet block is pulled toward it, falling off with the square of the distance. Rebuilt
    // every fourth tick, and only while there is a magnet, or current in iron, somewhere.
    const MS = 4, MW = Math.ceil(W / MS), MH = Math.ceil(H / MS), MR = 8, MAG_G = 0.06;
    const msrc = new Float32Array(MW * MH), mnow = new Float32Array(MW * MH), memag = new Float32Array(MW * MH);
    const mfx = new Float32Array(MW * MH), mfy = new Float32Array(MW * MH);
    let magOn = false, ironCurrent = -1000;
    const magnetSource = (j) => {
      const u = type[j];
      return P_FERRO[u] === 1 && temp[j] < P_CURIE[u] && (P_PERM[u] === 1 || charge[j] > 0);
    };
    // what a magnet (or the Magnet tool switched to Magnetic) can pull: iron, cobalt, nickel and the
    // rest below their Curie points, and liquid oxygen
    const pullable = (j, t) => (P_FERRO[t] === 1 && temp[j] < P_CURIE[t]) || (t === EL_O && catOf(j) !== C_GAS);

    function magField() {
      if (MAGNETS.every((m) => counts[m] === 0) && tick - ironCurrent > 24) {
        if (magOn) { mfx.fill(0); mfy.fill(0); memag.fill(0); magOn = false; }
        return;
      }
      magOn = true;
      msrc.fill(0); mnow.fill(0);
      for (let y = 0; y < H; y++) {
        let i = (y + 1) * SW + 1;
        const row = ((y / MS) | 0) * MW;
        for (let x = 0; x < W; x++, i++) {
          const t = type[i];
          if (!P_FERRO[t] || temp[i] >= P_CURIE[t]) continue;
          if (P_PERM[t]) msrc[row + ((x / MS) | 0)] += 1;
          else if (charge[i]) mnow[row + ((x / MS) | 0)] += 1;
        }
      }
      for (let b = 0; b < msrc.length; b++) {
        const e = (memag[b] = Math.max(mnow[b], memag[b] * 0.75));
        msrc[b] += e;
      }
      mfx.fill(0); mfy.fill(0);
      const R2 = MR * MR;
      for (let s = 0; s < msrc.length; s++) {
        const m = msrc[s];
        if (m < 0.5) continue;
        const sx = s % MW, sy = (s - sx) / MW;
        for (let by = Math.max(0, sy - MR); by <= Math.min(MH - 1, sy + MR); by++) {
          for (let bx = Math.max(0, sx - MR); bx <= Math.min(MW - 1, sx + MR); bx++) {
            const dx = sx - bx, dy = sy - by, d2 = dx * dx + dy * dy;
            if (d2 === 0 || d2 > R2) continue;
            const f = (m * MAG_G) / (d2 * Math.sqrt(d2)), b = by * MW + bx;
            mfx[b] += dx * f; mfy[b] += dy * f;
          }
        }
      }
    }

    // A grain or drop in the field. Iron is drawn toward the magnet (liquid oxygen gently, bismuth
    // pushed away). Iron touching a magnet clings, and so does iron touching other clinging iron in
    // the direction of the pull, so filings hang off a magnet in chains along the field. Returns
    // true if it clings this tick (and so doesn't fall).
    function magnetic(i, t) {
      const k = P_MAGK[t];
      if (P_FERRO[t] && temp[i] >= P_CURIE[t]) return false; // past its Curie point: no longer magnetic
      if (t === EL_O && catOf(i) === C_GAS) return false;    // only liquid oxygen is drawn
      if (k > 0) {
        for (let q = 0; q < 8; q++) if (magnetSource(i + N8[q])) { vx[i] = 0; vy[i] = 0; return true; }
      }
      const b = ((cy(i) / MS) | 0) * MW + ((cx(i) / MS) | 0), fx = mfx[b], fy = mfy[b], f2 = fx * fx + fy * fy;
      if (f2 < 0.0004) return false;
      if (k > 0.9 && f2 > 0.04) {
        const fm = Math.sqrt(f2), j = i + Math.round(fx / fm) + Math.round(fy / fm) * SW, u = type[j];
        if (P_FERRO[u] && temp[j] < P_CURIE[u] && (P_PERM[u] || charge[j] > 0 || P_MAGK[u] > 0.9)) { vx[i] = 0; vy[i] = 0; return true; }
      }
      let ux = vx[i] + fx * k, uy = vy[i] + fy * k;
      vx[i] = ux > MAXV ? MAXV : ux < -MAXV ? -MAXV : ux;
      vy[i] = uy > MAXV ? MAXV : uy < -MAXV ? -MAXV : uy;
      return false;
    }

    // ───── lightning ─────
    function spawnBolt(x, y, natural) {
      x = Math.max(0, Math.min(W - 1, x | 0));
      y = Math.max(0, Math.min(H - 1, y | 0));
      if (natural && !disc[LIGHTNING]) discover(LIGHTNING, idx(x, y));
      if (natural) events.naturalBolt++; // a storm cloud's own bolt, not a weapon's
      if (!disc[LIGHT]) discover(LIGHT, idx(x, y)); // a flash that lights up the sky
      let bx = x, by = y, drift = 0, hit = -1, last = -1;
      while (by < H) {
        const i = idx(bx, by), t = type[i];
        if (t !== EMPTY && catOf(i) !== C_GAS) { hit = i; break; }
        transform(i, PLASMA); data[i] = 4 + ((rnd() * 6) | 0); last = i;
        if (rnd() < 0.05) boltBranch(bx, by, rnd() < 0.5 ? -1 : 1);
        by++;
        if (rnd() < 0.4) drift = ((rnd() * 3) | 0) - 1;
        bx += drift;
        if (bx < 0) bx = 0; else if (bx >= W) bx = W - 1;
      }
      if (hit < 0) hit = last >= 0 ? last : idx(bx, H - 1);
      impact(hit);
      events.bolts.push(x, y, cx(hit), cy(hit));
    }

    function boltBranch(x, y, dir) {
      const len = 4 + ((rnd() * 14) | 0);
      for (let s = 0; s < len; s++) {
        if (rnd() < 0.6) x += dir;
        y++;
        if (x < 0 || x >= W || y >= H) return;
        const i = idx(x, y), t = type[i];
        if (t !== EMPTY && catOf(i) !== C_GAS) return;
        transform(i, PLASMA); data[i] = 2 + ((rnd() * 4) | 0);
      }
    }

    function impact(ci) {
      const x0 = cx(ci), y0 = cy(ci);
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const d2 = dx * dx + dy * dy;
          if (d2 > 16) continue;
          const x = x0 + dx, y = y0 + dy;
          if (x < 0 || x >= W || y < 0 || y >= H) continue;
          const j = idx(x, y), t = type[j];
          if (t === WALL || t === CLONE || t === VOID) continue;
          if (t === WATER || t === SALTWATER) {
            if (d2 <= 2) { transform(j, STEAM); temp[j] = 160; }
            else if (t === SALTWATER && d2 >= 4 && rnd() < 0.15) transform(j, FISH);
            continue;
          }
          if (d2 <= 4) temp[j] += 2200 * (1 - Math.sqrt(d2) / 2.5);
          if (t === MUD) { if (rnd() < 0.15) transform(j, WORM); }
          else if (P_CONDUCT[t]) energize(j);
          else if (t === EMPTY) { if (d2 <= 9 && rnd() < 0.08) transform(j, SPARK); }
          else if (P_FLAM[t] > 0 && !(flags[j] & BURN)) { if (t === FLOWER && rnd() < 0.3) transform(j, FIREFLY); else ignite(j); }
          else zap(j, t);
        }
      }
    }

    function cloudCheck(i) {
      const y = cy(i);
      if (y > H * 0.6) return;
      let c = 0;
      for (let k = 0; k < 8; k++) if (type[i + N8[k]] === STEAM) c++;
      if (c >= 7 && rnd() < 0.002) spawnBolt(cx(i), y + 1, true);
    }

    // ───── living things ─────
    function crowd(j, from) {
      let c = 0;
      for (let k = 0; k < 4; k++) {
        const n = j + N4[k];
        if (n !== from) { const nt = type[n]; if (nt === PLANT || nt === FLOWER) c++; }
      }
      return c;
    }

    function bloom(c, hue) {
      transform(c, FLOWER); aux[c] = hue; flags[c] = CENTER;
      const ks = [0, 2, 3, 4, 5];
      for (let q = 0; q < ks.length; q++) {
        const k = ks[q], n = c + N8[k];
        if (type[n] === EMPTY && (k < 4 || rnd() < 0.5)) { transform(n, FLOWER); aux[n] = hue; flags[n] = PETAL; }
      }
    }

    // A stem's aux is the colour its flower will be, or 0 for a plain plant that never blooms.
    function growPlant(i) {
      const b = data[i];
      if (b <= 0 || sap[i] < 100 || rnd() > 0.07) return;
      const r = rnd();
      const j = i + (r < 0.64 ? -SW : r < 0.82 ? -SW - 1 : -SW + 1);
      if (type[j] === EMPTY && crowd(j, i) <= 1) {
        const hue = aux[i];
        transform(j, PLANT); data[j] = b - 1; aux[j] = hue; data[i] = 0;
        if (rnd() < 0.3) {
          const s = i + (rnd() < 0.5 ? -1 : 1);
          if (type[s] === EMPTY) { transform(s, PLANT); flags[s] = LEAF; }
        }
        if (b > 10 && rnd() < 0.07) {
          const s = j - SW + (rnd() < 0.5 ? -1 : 1); // a side shoot, joined to the stem at a corner
          if (type[s] === EMPTY) { transform(s, PLANT); data[s] = (b * 0.55) | 0; aux[s] = hue; }
        }
        if (b - 1 <= 0 && hue) bloom(j, hue);
      } else {
        data[i] = b - 1;
        if (b - 1 <= 0 && aux[i] && rnd() < 0.5) bloom(i, aux[i]);
      }
    }

    // A plant's stem grows into another kind where it finds that kind's home: against wood an oak,
    // in snow a pine, by the sea a palm, in clay a willow, in ash grass, by sand a cactus, up a brick
    // wall a vine. (Living wood doesn't count, or every leaf on a tree would turn.)
    function mutate(i) {
      const n = i + N8[(rnd() * 8) | 0], nt = type[n];
      let to = 0;
      if (nt === WOOD) { if (!(flags[n] & LEAF)) to = SAPLING; }
      else if (nt === SNOW || nt === ICE) to = PINE;
      else if (nt === SALTWATER) to = PALM;
      else if (nt === CLAY) to = WILLOW;
      else if (nt === ASH) to = GRASS;
      else if (nt === SAND) to = CACTUS;
      else if (nt === BRICK) to = VINE;
      if (!to) return false;
      startPlant(i, to);
      flashRx(i, PLANT);
      return true;
    }

    function isWater(t) { return t === WATER || t === SALTWATER; }

    // ───── the other plants ─────
    // Soil a root can take hold in: mud always, dirt unless a story chapter has parched it.
    function soil(t) { return t === MUD || ((t === DIRT || t === SOIL) && !rules.drySoil); }
    function wetBeside(i) {
      for (let k = 0; k < 8; k++) { const t = type[i + N8[k]]; if (isWater(t) || t === MUD) return true; }
      return false;
    }
    // Water or mud within two cells (or within r).
    function damp(i, r = 2) {
      const x0 = cx(i), y0 = cy(i);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (x0 + dx < 0 || x0 + dx >= W || y0 + dy < 0 || y0 + dy >= H) continue;
        const t = type[i + dy * SW + dx];
        if (isWater(t) || t === MUD) return true;
      }
      return false;
    }
    // Something solid overhead within a dozen cells: a cave roof, an overhang, a forest canopy.
    function shaded(i) {
      let j = i - SW;
      for (let k = 0; k < 12; k++, j -= SW) {
        const t = type[j];
        if (t === BOUND) return false;
        if (t !== EMPTY && catOf(j) === C_STATIC) return true;
      }
      return false;
    }

    // Each kind of seed sprouts where its plant really would: an acorn, grass or vine seed in soil,
    // a cactus seed only in dry sand (water rots it), spores on damp or shaded soil, ash or wood,
    // a lily seed on the bottom of a pond. Returns true if the seed is gone.
    function sprout(i, t) {
      const below = type[i + SW], open = type[i - SW] === EMPTY;
      const mud = below === MUD;
      switch (t) {
        case ACORN:
          if (!open || !soil(below) || rnd() > (mud ? 0.008 : 0.003)) return false;
          startPlant(i, SAPLING);
          return true;
        case GRASSSEED:
          if (!open || !soil(below) || rnd() > (mud ? 0.03 : 0.012)) return false;
          startPlant(i, GRASS);
          return true;
        case CACTUSSEED:
          if (wetBeside(i)) { if (rnd() < 0.005) { transform(i, DIRT); return true; } return false; } // rots
          if (!open || below !== SAND || rnd() > 0.006) return false;
          startPlant(i, CACTUS);
          return true;
        case VINESEED:
          if (!open || !soil(below) || rnd() > (mud ? 0.02 : 0.008)) return false;
          startPlant(i, VINE);
          return true;
        case SPORES:
          if (!open || !fungusBed(below)) return false;
          if (rnd() > 0.006 || !(damp(i) || shaded(i))) return false;
          startPlant(i, MUSHROOM);
          return true;
        case LILYSEED:
          if (!isWater(type[i - SW]) || !pondFloor(i) || rnd() > 0.01) return false;
          startPlant(i, LILY);
          return true;
        case PINECONE:
          if (!open || !soil(below) || rnd() > (mud ? 0.008 : 0.003)) return false;
          startPlant(i, PINE);
          return true;
        case COCONUT: // washed up on a beach, or dropped on soil
          if (!open || !(below === SAND || soil(below)) || rnd() > 0.004) return false;
          startPlant(i, PALM);
          return true;
        case CATKIN:
          if (!open || !soil(below) || !damp(i, 5) || rnd() > 0.01) return false;
          startPlant(i, WILLOW);
          return true;
      }
      return false;
    }

    function fungusBed(t) { return t === DIRT || t === SOIL || t === MUD || t === WOOD || t === ASH || t === MOSS; }
    // A firm bottom under i for a water lily to root in (mud best, but any will do).
    function pondFloor(i) {
      const b = type[i + SW];
      if (b === BOUND) return false;
      const c = catOf(i + SW);
      return b === MUD || c === C_STATIC || c === C_POWDER;
    }

    // The first cell of a plant of kind t, growing at i: what a seed sprouts into.
    function startPlant(i, t) {
      switch (t) {
        case PLANT: transform(i, PLANT); data[i] = 16 + ((rnd() * 36) | 0); aux[i] = 0; return; // leafy, never flowers
        case FLOWER: transform(i, PLANT); data[i] = 3 + ((rnd() * 6) | 0); aux[i] = 1 + ((rnd() * 255) | 0); return; // a short stem that blooms soon
        case SAPLING: transform(i, SAPLING); data[i] = 10 + ((rnd() * 14) | 0); aux[i] = 0; return;
        case PINE: transform(i, PINE); data[i] = 28 + ((rnd() * 16) | 0); aux[i] = 0; return;
        case PALM: transform(i, PALM); data[i] = 15 + ((rnd() * 12) | 0); aux[i] = 0; if (rnd() < 0.5) flags[i] = PETAL; return; // PETAL: it leans right
        case WILLOW: transform(i, WILLOW); data[i] = 16 + ((rnd() * 6) | 0); aux[i] = 0; return;
        case GRASS: transform(i, GRASS); data[i] = 1 + ((rnd() * 2) | 0); return;
        case CACTUS: transform(i, CACTUS); data[i] = 7 + ((rnd() * 10) | 0); aux[i] = 0; return;
        case VINE: transform(i, VINE); data[i] = 28 + ((rnd() * 30) | 0); return;
        case MUSHROOM: transform(i, MUSHROOM); data[i] = 2 + ((rnd() * 3) | 0); aux[i] = 2 + (rnd() < 0.4 ? 1 : 0); return;
        case LILY: transform(i, LILY); data[i] = 80; return;
      }
    }
    // Could a plant of kind t take root at i?
    function canRoot(i, t) {
      const below = type[i + SW];
      if (t === LILY) return isWater(type[i]) && isWater(type[i - SW]) && pondFloor(i);
      if (type[i] !== EMPTY) return false;
      if (t === CACTUS) return below === SAND;
      if (t === PALM) return below === SAND || soil(below);
      if (t === MUSHROOM) return fungusBed(below);
      return soil(below);
    }
    // Another plant too close to start one here?
    function crowded(i, t) {
      const R = t === CACTUS ? 4 : t === PINE ? 5 : TREE[t] ? 7 : 3, x0 = cx(i);
      for (let dy = -3; dy <= 1; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          if (x0 + dx < 0 || x0 + dx >= W) continue;
          const j = i + dy * SW + dx;
          if (j > 0 && j < N && P_SAP[type[j]]) return true;
        }
      }
      return false;
    }

    // ───── water in plants ─────
    // Every living plant cell holds some sap (0–255): the water reaching it. Cells touching wet
    // soil (or water, for water plants; a trunk, for leaves) are topped up; the rest take what
    // their neighbours have, a little less with each cell, so water climbs a plant from its roots.
    // A plant set on bare rock, frozen or scorched dries out: it yellows, stops growing, then dies and
    // crumbles into dead leaves. Each cell is checked every 8 ticks. A tree's trunk carries water too
    // while it lives (wood with LEAF; see trunk()), losing less on the way up. A plant (or a tree)
    // that no longer touches the ground at all, left hanging in the air, dies in about three seconds:
    // see rootPass().
    const SAP_LOSS = 3, SAP_DRY = 2, CUT_DRY = 16;
    // Which living cells still reach the ground (anything solid, loose or liquid that is not part of
    // a plant, or the world's edge) through the plant they belong to. Worked out every 16 ticks.
    const rooted = new Uint8Array(N);
    let rootQ = new Int32Array(4096), rootsKnown = false;
    function alive(i) { const t = type[i]; return P_SAP[t] === 1 || (t === WOOD && (flags[i] & LEAF) !== 0); }
    // A living trunk's roots reach down past a one-cell gap (mud that flowed out from under it, soil
    // washed away): the cell two below it, if that is ground, or -1.
    function rootReach(i) {
      if (type[i] !== WOOD || type[i + SW] !== EMPTY) return -1;
      return holdsUp(i + 2 * SW) ? i + 2 * SW : -1;
    }
    // Is n ground a plant can stand on? Anything solid, loose or liquid, or the world's edge; but not
    // a plant's own debris: dead leaves, seeds, a dead tree's wood (PETAL alone), nor living plant.
    function holdsUp(n) {
      const nt = type[n];
      if (nt === BOUND) return true;
      if (nt === EMPTY || alive(n) || nt === LITTER || P_LIVING[nt] || (nt === WOOD && (flags[n] & PETAL))) return false;
      const c = catOf(n);
      return c === C_STATIC || c === C_POWDER || c === C_LIQUID;
    }
    function rootPass() {
      rooted.fill(0);
      let tail = 0;
      const push = (i) => {
        rooted[i] = 1;
        if (tail === rootQ.length) { const q = new Int32Array(tail * 2); q.set(rootQ); rootQ = q; }
        rootQ[tail++] = i;
      };
      for (let i = SW + 1; i < N - SW - 1; i++) {
        if (!alive(i)) continue;
        for (let k = 0; k < 8; k++) if (holdsUp(i + N8[k])) { push(i); break; }
        if (!rooted[i] && rootReach(i) >= 0) push(i);
      }
      for (let head = 0; head < tail; head++) {
        const i = rootQ[head];
        for (let k = 0; k < 8; k++) { const n = i + N8[k]; if (!rooted[n] && alive(n)) push(n); }
      }
      rootsKnown = true;
    }
    // How much water a plant cell of kind t draws from a neighbouring cell of kind n.
    function drink(t, n) {
      const parch = ambient > 30 ? (ambient - 30) * 8 : 0; // a heatwave dries out the ground
      switch (n) {
        case WATER: return 255;
        case SALTWATER: return t === LILY ? 170 : 90;
        case MUD: return 255;
        case DIRT: case SOIL: return rules.drySoil ? 70 : 235 - parch;
        case ASH: return 170 - parch;
        case SAND: return (t === CACTUS || t === PALM ? 235 : t === GRASS ? 110 : 60) - (t === CACTUS || t === PALM ? 0 : parch);
        case WOOD: return t === MUSHROOM ? 230 : 0; // dead wood feeds only a fungus (a living trunk: see thirst())
        case MOSS: return t === MUSHROOM ? 200 : 0;
        case CLAY: return 40;
      }
      return 0;
    }
    function thirst(i, t) {
      const isTrunk = t === WOOD, roots = isTrunk ? (flags[i] & PETAL ? PALM : SAPLING) : t;
      let best = 0, open = false;
      for (let k = 0; k < 8; k++) {
        const n = i + N8[k], nt = type[n];
        let v;
        if (nt === WOOD && (flags[n] & LEAF)) v = sap[n] - (isTrunk ? 1 : SAP_LOSS); // up the trunk, out to the leaves
        else if (P_SAP[nt]) v = isTrunk ? 0 : sap[n] - SAP_LOSS; // a trunk draws only from the ground
        else v = drink(roots, nt);
        if (v > best) best = v;
        if (nt === EMPTY) open = true;
      }
      if (isTrunk) { const j = rootReach(i); if (j >= 0) { const v = drink(roots, type[j]); if (v > best) best = v; } }
      let s = sap[i];
      let T = temp[i];
      if (open && ambient < T) T = ambient; // out in the open a plant is as cold as the air
      if (T < -3) s -= 4; // frozen: no water moves, and the frost kills it
      else {
        s = best >= s ? best : s - SAP_DRY; // fills at once, dries slowly
        if (T > 50) s -= (T - 50) * 0.25; // scorched by nearby heat
      }
      if (rootsKnown && !rooted[i] && stamp[i] !== now) s -= CUT_DRY; // hanging in the air: it dies fast
      if (s <= 0) {
        if (isTrunk) { flags[i] = (flags[i] & BURN) | PETAL; sap[i] = 0; return false; } // a dead tree's wood stays (PETAL marks it)
        if (t === MUSHROOM) transform(i, DIRT); // a fungus rots
        else transform(i, LITTER); // dried out, it crumbles into dead leaves
        return true;
      }
      sap[i] = s > 255 ? 255 : s;
      return false;
    }
    // Plants loaded from an older save, or an undo step without sap, start well watered.
    function water() {
      for (let i = 0; i < N; i++) sap[i] = P_SAP[type[i]] ? 200 : 0;
    }


    // ───── trees ─────
    // A tree is a growing tip (the Oak, Pine, Palm and Willow tiles) that climbs, leaving living
    // trunk behind it, then spreads its crown. Living trunk is wood with LEAF (and PETAL too for a
    // palm's, which drinks from sand); leaves are plant cells with LEAF, and aux says whose they are,
    // for their colour.
    const OAK_LEAF = 0, PINE_LEAF = 1, PALM_LEAF = 2, WILLOW_LEAF = 3;
    function trunk(j, palm) { transform(j, WOOD); flags[j] = palm ? LEAF | PETAL : LEAF; sap[j] = 220; }
    function leaf(j, kind = OAK_LEAF) { transform(j, PLANT); flags[j] = LEAF; data[j] = 0; aux[j] = kind; }
    // Does j touch the tree: a leaf, its wood or its growing tip?
    function onTree(j) {
      for (let k = 0; k < 4; k++) { const t = type[j + N4[k]]; if (t === PLANT || t === WOOD || TREE[t]) return true; }
      return false;
    }
    // Seeds dropped round a tree, onto whatever lies under the crown.
    function dropSeeds(x0, y0, R, seed, n) {
      for (let k = 0; k < n; k++) {
        const x = x0 + ((rnd() * (2 * R + 1)) | 0) - R;
        if (x < 0 || x >= W) continue;
        let y = y0;
        while (y < H - 1 && type[idx(x, y)] !== EMPTY) y++;
        if (y < H - 1) place(idx(x, y), seed);
      }
    }
    // One step of a young tree's climb: the tip moves up (or up and aside, for a leaning palm) and
    // leaves trunk behind, `foot` cells wide at the bottom. Returns false once the trunk is done.
    function climb(i, t, lean, foot) {
      const b = data[i], grown = aux[i], up = i - SW + lean;
      if (b <= 0 || type[up] !== EMPTY || cy(i) <= 8) return false;
      const f = flags[i] & PETAL;
      transform(up, t); data[up] = b - 1; aux[up] = grown < 255 ? grown + 1 : 255; flags[up] = f; sap[up] = sap[i];
      trunk(i, t === PALM);
      if (grown < foot && type[i + 1] === EMPTY) trunk(i + 1, t === PALM);
      return true;
    }
    // A broad crown of leaves round (x0, y0): radius R, flattened by `flat`. Puts out up to five
    // leaves a call, from the budget in data[i]; returns true while there is more to put out.
    function crown(i, R, flat, kind, tries = 5) {
      const x0 = cx(i), y0 = cy(i);
      for (let k = 0; k < tries && data[i] > 0; k++) {
        const dx = ((rnd() * (2 * R + 1)) | 0) - R, dy = ((rnd() * (R + 3)) | 0) - R + 2;
        if (dx * dx + dy * dy * flat > R * R) continue;
        const x = x0 + dx, y = y0 + dy;
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const j = idx(x, y);
        if (type[j] === EMPTY && onTree(j)) { leaf(j, kind); data[i]--; }
        else if (rnd() < 0.1) data[i]--; // a crowded crown gives up sooner
      }
      return data[i] > 0;
    }
    // A short limb angling up and out of the trunk, with a tuft of leaves at its end.
    function branch(i, dir, kind = OAK_LEAF) {
      let j = i;
      const len = 3 + ((rnd() * 4) | 0);
      for (let s = 0; s < len; s++) {
        const n = j + dir - (s & 1 ? SW : 0);
        if (type[n] !== EMPTY) break;
        trunk(n); j = n;
      }
      if (j === i) return;
      const x0 = cx(j);
      for (let dy = -2; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dy * dy > 5 || rnd() < 0.3 || x0 + dx < 0 || x0 + dx >= W) continue;
        const n = j + dy * SW + dx;
        if (type[n] === EMPTY) leaf(n, kind);
      }
    }
    // The growing tip of an oak. It climbs, leaving trunk behind (two cells wide at the foot),
    // puts out a branch now and then, and at full height spreads into a crown of leaves, then
    // drops an acorn or two. data: trunk left to grow, then leaves left to put out; aux: trunk
    // grown so far; CENTER marks the crown stage.
    function sapling(i) {
      if ((flags[i] & BURN) || sap[i] < 100 || rnd() > 0.08) return;
      if (!(flags[i] & CENTER)) {
        const up = i - SW, b = data[i], grown = aux[i];
        if (b > 0 && type[up] === EMPTY && cy(i) > 8) {
          transform(up, SAPLING); data[up] = b - 1; aux[up] = grown < 255 ? grown + 1 : 255; sap[up] = sap[i];
          trunk(i);
          if (grown < 5 && type[i + 1] === EMPTY) trunk(i + 1);
          else if (grown > 4 && b > 2 && rnd() < 0.25) branch(i, rnd() < 0.5 ? -1 : 1);
          return;
        }
        flags[i] |= CENTER; data[i] = 110 + ((rnd() * 60) | 0);
        return;
      }
      if (crown(i, 9, 2.4, OAK_LEAF)) return; // an oak's crown is broad and low
      const x0 = cx(i), y0 = cy(i);
      trunk(i);
      if (counts[SAPLING] < 24) dropSeeds(x0, y0, 9, ACORN, 2);
    }

    // Pine: a tall, straight trunk, then a cone of needles in tiers, narrow at the top and widest at
    // the bottom, put out from the top down. data: trunk left to grow, then needles left to put out;
    // aux: trunk grown so far.
    function pine(i) {
      if ((flags[i] & BURN) || sap[i] < 100 || rnd() > 0.09) return;
      if (!(flags[i] & CENTER)) {
        if (climb(i, PINE, 0, 2)) return;
        const depth = Math.max(8, Math.round(aux[i] * 0.78));
        flags[i] |= CENTER; data[i] = Math.round(depth * 3 + depth * depth * 0.38); // about as many needles as the cone holds
        return;
      }
      const x0 = cx(i), y0 = cy(i), depth = Math.max(8, Math.round(aux[i] * 0.78));
      for (let k = 0; k < 8 && data[i] > 0; k++) {
        const dy = (rnd() * depth) | 0, hw = 1 + dy * 0.4 - (dy % 4 === 3 ? 1.6 : 0); // tiers: a notch every fourth row
        if (hw < 0.5) continue;
        const dx = Math.round((rnd() * 2 - 1) * hw), x = x0 + dx, y = y0 - 1 + dy;
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const j = idx(x, y);
        if (type[j] === EMPTY && onTree(j)) { leaf(j, PINE_LEAF); data[i]--; }
        else if (rnd() < 0.08) data[i]--;
      }
      if (data[i] > 0) return;
      leaf(i, PINE_LEAF); // the very top is needles
      if (counts[PINECONE] < 30) dropSeeds(x0, y0, Math.round(depth * 0.4) + 1, PINECONE, 3);
    }

    // Palm: a bare trunk, leaning a little more as it climbs, then a crown of fronds that arch out
    // and droop under their own weight, all at once. Coconuts fall from it now and then (see the
    // PLANT case). flags PETAL: it leans right.
    function palm(i) {
      if ((flags[i] & BURN) || sap[i] < 100 || rnd() > 0.08) return;
      if (!(flags[i] & CENTER)) {
        const lean = aux[i] > 4 && rnd() < 0.2 ? (flags[i] & PETAL ? 1 : -1) : 0;
        if (climb(i, PALM, lean, 1)) return;
        flags[i] |= CENTER;
        return;
      }
      const x0 = cx(i), y0 = cy(i);
      for (let f = 0; f < 8; f++) {
        const a = -Math.PI * (0.04 + f * 0.131) + (rnd() - 0.5) * 0.2; // fanned from right round to left
        let fx = 0, fy = 0, ux = Math.cos(a), uy = Math.sin(a) * 0.8;
        const len = 6 + ((rnd() * 5) | 0);
        for (let s = 0; s < len; s++) {
          fx += ux; fy += uy; uy += 0.17; // each frond bends down further along
          const x = x0 + Math.round(fx), y = y0 + Math.round(fy);
          if (x < 0 || x >= W || y < 0 || y >= H) break;
          const j = idx(x, y);
          if (type[j] === EMPTY) leaf(j, PALM_LEAF);
          else if (type[j] !== PLANT) break;
        }
      }
      trunk(i, true); // the crown's heart
      if (counts[COCONUT] < 20) dropSeeds(x0, y0 + 1, 2, COCONUT, 2);
    }

    // Willow: a short, stout trunk with spreading limbs, a broad crown, and then long curtains of
    // leaves hanging straight down from its underside.
    function willow(i) {
      if ((flags[i] & BURN) || sap[i] < 100 || rnd() > 0.08) return;
      if (!(flags[i] & CENTER)) {
        const grown = aux[i], b = data[i];
        if (climb(i, WILLOW, 0, 3)) {
          if (grown > 3 && b > 1 && rnd() < 0.4) branch(i, rnd() < 0.5 ? -1 : 1, WILLOW_LEAF);
          return;
        }
        flags[i] |= CENTER; data[i] = 150 + ((rnd() * 50) | 0);
        return;
      }
      if (crown(i, 11, 3.2, WILLOW_LEAF, 9)) return; // a big crown: more tries at a time
      const x0 = cx(i), y0 = cy(i);
      trunk(i);
      for (let x = Math.max(0, x0 - 12); x <= Math.min(W - 1, x0 + 12); x++) {
        if (rnd() < 0.35) continue;
        let low = -1; // the lowest leaf of the crown in this column
        for (let y = Math.max(0, y0 - 10); y <= Math.min(H - 1, y0 + 4); y++) {
          const j = idx(x, y);
          if (type[j] === PLANT && aux[j] === WILLOW_LEAF) low = j;
        }
        if (low < 0) continue;
        const len = 4 + ((rnd() * 10) | 0);
        for (let s = 1, j = low + SW; s <= len && type[j] === EMPTY; s++, j += SW) leaf(j, WILLOW_LEAF);
      }
      if (counts[CATKIN] < 40) dropSeeds(x0, y0, 10, CATKIN, 2);
    }

    // Grass: blades a cell to three tall that creep over bare soil on runners.
    // data: how much taller this blade will grow.
    function grass(i) {
      if ((flags[i] & BURN) || sap[i] < 100 || rnd() > 0.05) return;
      const below = type[i + SW];
      if (below === EMPTY || catOf(i + SW) === C_LIQUID) { transform(i, LITTER); return; } // lost its footing or drowned
      const b = data[i];
      if (b > 0) {
        if (type[i - SW] === EMPTY) { transform(i - SW, GRASS); data[i - SW] = b - 1; }
        data[i] = 0;
        return;
      }
      if (!soil(below) || counts[GRASS] > 9000 || rnd() > 0.4) return;
      const dx = (rnd() < 0.5 ? -1 : 1) * (1 + (rnd() < 0.35 ? 1 : 0));
      for (let dy = -1; dy <= 1; dy++) {
        const j = i + dx + dy * SW;
        if (type[j] === EMPTY && soil(type[j + SW])) { transform(j, GRASS); data[j] = (rnd() * 3) | 0; return; }
      }
    }

    // Cactus: a fat column, two cells wide, with an arm or two and a flower on top. It needs no
    // water at all, and rots where water stands against it.
    // data: growth left in this stem (only tips have any); aux: 0 the trunk, 1 an arm.
    function cactus(i) {
      if (flags[i] & BURN) return;
      if (rnd() < 0.004) {
        for (let k = 0; k < 4; k++) if (isWater(type[i + N4[k]])) { transform(i, DIRT); return; }
      }
      const b = data[i];
      if (b <= 0 || sap[i] < 100 || rnd() > 0.04) return;
      const up = i - SW;
      data[i] = 0;
      if (type[up] !== EMPTY) return;
      transform(up, CACTUS); data[up] = b - 1; aux[up] = aux[i];
      if (aux[i] === 0) {
        if (type[up + 1] === EMPTY) transform(up + 1, CACTUS); // the second column
        if (b > 3 && b < 10 && rnd() < 0.28) { // an arm: out one cell, then up
          const left = rnd() < 0.5, c = left ? i - 1 : i + 2, tip = left ? i - 2 : i + 3;
          const x = cx(tip);
          if (x >= 0 && x < W && type[c] === EMPTY && type[tip] === EMPTY) {
            transform(c, CACTUS); transform(tip, CACTUS); data[tip] = 2 + ((rnd() * 4) | 0); aux[tip] = 1;
          }
        }
      }
      if (b - 1 <= 0) { // full grown: a flower on top
        const hue = 150 + ((rnd() * 40) | 0);
        for (const f of [up - SW, up - SW + (aux[i] === 0 ? 1 : 0)]) {
          if (type[f] === EMPTY) { transform(f, FLOWER); aux[f] = hue; }
        }
      }
    }

    // Vine: a tip that climbs whatever it can cling to (walls, stone, trees, the ground) and
    // trails along the ground when there is nothing to climb. data: length left to grow.
    const VINE_STEP = [-SW, -SW - 1, -SW + 1, -1, 1, SW - 1, SW + 1];
    const VINE_PULL = [3, 2, 2, 1, 1, 0.3, 0.3];
    function cling(j, from) {
      for (let k = 0; k < 8; k++) {
        const n = j + N8[k];
        if (n === from) continue;
        const t = type[n];
        if (t === BOUND) return true;
        if (t === EMPTY || t === VINE) continue;
        const c = catOf(n);
        if (c === C_STATIC || c === C_POWDER) return true;
      }
      return false;
    }
    function vine(i) {
      const b = data[i];
      if ((flags[i] & BURN) || b <= 0 || sap[i] < 100 || rnd() > 0.06) return;
      let best = -1, score = 0;
      for (let k = 0; k < 7; k++) {
        const j = i + VINE_STEP[k];
        if (type[j] !== EMPTY || !cling(j, i)) continue;
        let crowd = 0;
        for (let q = 0; q < 8; q++) if (type[j + N8[q]] === VINE) crowd++;
        if (crowd > 2) continue; // no tangles
        const sc = VINE_PULL[k] + rnd();
        if (sc > score) { score = sc; best = j; }
      }
      data[i] = 0;
      if (best < 0) return;
      transform(best, VINE); data[best] = b - 1;
      if (rnd() < 0.35) { const n = i + N4[(rnd() * 4) | 0]; if (type[n] === EMPTY) { transform(n, VINE); flags[n] = LEAF; } }
    }

    // Mushroom: a fungus, which feeds on rot rather than light. data: stem left to grow; aux:
    // the cap's radius. Cap cells carry LEAF (and PETAL for the brown kind). Full grown it puffs
    // spores from under its cap, rots wood and ash it touches into soil, and withers back to dirt.
    function cap(i, r) {
      const brown = rnd() < 0.35 ? PETAL : 0, x0 = cx(i);
      for (let dy = 0; dy >= -1; dy--) {
        for (let dx = -r - dy; dx <= r + dy; dx++) {
          if (x0 + dx < 0 || x0 + dx >= W) continue;
          const j = i + dy * SW + dx;
          if (j !== i && type[j] !== EMPTY) continue;
          transform(j, MUSHROOM); flags[j] = LEAF | brown;
        }
      }
    }
    function mushroom(i) {
      if (flags[i] & BURN) return;
      if (rnd() < 0.0002) { transform(i, DIRT); return; }
      const b = data[i];
      if (b > 0) {
        if (sap[i] < 100 || rnd() > 0.1) return;
        const up = i - SW;
        if (b > 1 && type[up] === EMPTY) { transform(up, MUSHROOM); data[up] = b - 1; aux[up] = aux[i]; data[i] = 0; return; }
        const r = aux[i];
        data[i] = 0; aux[i] = 0;
        cap(i, r);
        return;
      }
      if ((flags[i] & LEAF) && type[i + SW] === EMPTY && rnd() < 0.002 && counts[SPORES] < 300) place(i + SW, SPORES);
      if (rnd() < 0.001) { const n = i + N8[(rnd() * 8) | 0], nt = type[n]; if (nt === WOOD || nt === ASH) transform(n, DIRT); }
    }

    // Water lily: a stem from the pond floor up to the surface, where it floats its pads and
    // flowers. data: stem left to grow. Pads carry LEAF.
    function lily(i) {
      const b = data[i];
      if ((flags[i] & BURN) || b <= 0 || sap[i] < 100 || rnd() > 0.06) return;
      data[i] = 0;
      const up = i - SW;
      if (!isWater(type[up])) return; // grew into air or against something solid
      if (isWater(type[up - SW])) { transform(up, LILY); data[up] = b - 1; return; }
      // up is the surface: the pad spreads along it, and a flower opens on top
      transform(up, LILY); flags[up] = LEAF;
      const w = 1 + ((rnd() * 3) | 0);
      for (let d = -1; d <= 1; d += 2) {
        for (let k = 1; k <= w; k++) {
          const j = up + d * k;
          if (!isWater(type[j]) || type[j - SW] !== EMPTY) break;
          transform(j, LILY); flags[j] = LEAF;
        }
      }
      if (type[up - SW] === EMPTY && rnd() < 0.75) bloom(up - SW, 150 + ((rnd() * 40) | 0));
    }

    // stone next to a plant or moss becomes moss, but only where it is damp
    function mossCheck(i, n) {
      if (type[n] !== STONE) return;
      for (let k = 0; k < 8; k++) {
        const m = n + N8[k], mt = type[m];
        if (isWater(mt) || mt === MUD) { transform(n, MOSS); return; }
      }
      for (let k = 0; k < 8; k++) {
        const mt = type[i + N8[k]];
        if (isWater(mt) || mt === MUD) { transform(n, MOSS); return; }
      }
    }

    function fish(i) {
      const age = ++data[i];
      if (age > 6000 + shade[i] * 24) { transform(i, DIRT); return; }
      let a = aux[i];
      let wet = 0;
      for (let k = 0; k < 4; k++) if (isWater(type[i + N4[k]])) wet++;
      if (wet === 0) {
        const oow = (a >> 1) + 1;
        if (oow > 120) { transform(i, DIRT); return; }
        aux[i] = (a & 1) | (oow << 1);
        const b = i + SW, bt = type[b];
        if (bt === EMPTY || (bt !== BOUND && catOf(b) === C_GAS)) { swap(i, b); return; }
        if (rnd() < 0.04) {
          const j = i - SW + (rnd() < 0.5 ? -1 : 1);
          if (type[j] === EMPTY) swap(i, j);
        }
        return;
      }
      a &= 1; aux[i] = a;
      if (rnd() < 0.35) {
        let dir = a ? 1 : -1;
        if (rnd() < 0.02) { dir = -dir; a ^= 1; aux[i] = a; }
        const r = rnd();
        const j = i + dir + (r < 0.12 ? -SW : r < 0.26 ? SW : 0);
        if (isWater(type[j])) { swap(i, j); i = j; }
        else aux[i] = a ^ 1;
      }
      const n = i + N8[(rnd() * 8) | 0];
      if (type[n] === PLANT && rnd() < 0.03) {
        transform(n, WATER);
        if (rnd() < 0.3 && counts[FISH] < 300) {
          const m = i + N8[(rnd() * 8) | 0];
          if (isWater(type[m])) { transform(m, FISH); aux[m] = rnd() < 0.5 ? 1 : 0; }
        }
      }
    }

    function worm(i) {
      const age = ++data[i];
      if (age > 9000 + shade[i] * 30) { transform(i, DIRT); return; }
      if (canEnter(P_DENS[WORM], i + SW)) {
        movePowder(i, WORM);
        return;
      }
      let wet = 0;
      for (let k = 0; k < 4; k++) if (isWater(type[i + N4[k]])) wet++;
      if (wet) { if (aux[i] >= 200) { transform(i, DIRT); return; } aux[i]++; }
      else aux[i] = 0;
      if (rnd() < 0.12) {
        const j = i + N8[(rnd() * 8) | 0], jt = type[j];
        if (jt === DIRT || jt === MUD || jt === SAND) swap(i, j);
        else if (jt === ASH) {
          if (rnd() < 0.15 && counts[WORM] < 150) transform(j, WORM);
          else transform(j, DIRT);
        }
      }
    }

    function firefly(i) {
      const age = ++data[i];
      if (age > 5000 + shade[i] * 20) { transform(i, EMPTY); return; }
      if (rnd() < 0.45) {
        let k = (rnd() * 8) | 0;
        if ((k === 0 || k === 4 || k === 5) && rnd() < 0.3) k = 1; // drift gently downward
        const j = i + N8[k], jt = type[j];
        if (jt === EMPTY) swap(i, j);
        else if (isWater(jt) && rnd() < 0.05) { transform(i, EMPTY); return; }
      }
      if (rnd() < 0.003 && counts[FIREFLY] < 120) {
        const n = i + N8[(rnd() * 8) | 0];
        if (type[n] === FLOWER) {
          const m = i + N8[(rnd() * 8) | 0];
          if (type[m] === EMPTY) { transform(m, FIREFLY); aux[m] = rnd() < 0.5 ? 1 : 0; }
        }
      }
    }

    // ───── cells, and the animals they grow into ─────
    // A creature born where something else was: it keeps the heat there, and is a discovery.
    function birth(i, t) {
      const T = temp[i];
      place(i, t); temp[i] = T; stamp[i] = now;
      if (!disc[t]) discover(t, i);
    }
    const liquidAt = (j) => { const t = type[j]; return t !== EMPTY && t !== BOUND && catOf(j) === C_LIQUID; };
    const heavyAt = (j) => { const t = type[j]; if (t === BOUND) return true; if (t === EMPTY) return false; const c = catOf(j); return c === C_STATIC || c === C_POWDER; };
    // A one-cell animal under powder or rock with no air beside it suffocates in ten seconds, and
    // one held under water drowns in ten (cows and wolves swim up first). aux bits 4–7 count it, a
    // step every 40 ticks; bit 0 is the way it faces and bits 1–3 are free for the animal.
    function smothered(i) {
      const up = i - SW, wet = liquidAt(up);
      if (!(wet || heavyAt(up)) || airAt(i - 1) || airAt(i + 1) || airAt(i + SW)) { aux[i] &= 15; return false; }
      if (tick % 40 === 0) {
        const c = (aux[i] >> 4) + 1;
        if (c >= 15) return true;
        aux[i] = (aux[i] & 15) | (c << 4);
      }
      return false;
    }
    // Glance around cell i (a few random cells within r) for any of the kinds a, b, c; returns the
    // cell seen, or -1.
    function spot(i, r, a, b = -2, c = -2) {
      const x = cx(i), y = cy(i);
      for (let s = 0; s < 3; s++) {
        const dx = ((rnd() * (2 * r + 1)) | 0) - r, dy = ((rnd() * (r + 1)) | 0) - (r >> 1);
        const xx = x + dx, yy = y + dy;
        if ((dx === 0 && dy === 0) || xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
        const j = idx(xx, yy), t = type[j];
        if (t === a || t === b || t === c) return j;
      }
      return -1;
    }
    // A person caught by a wolf or a shark: both their cells go (into the water, in the sea).
    function killHuman(n) {
      const body = type[n] === HEAD ? n + SW : n, head = body - SW;
      const fill = (j) => become(j, isWater(type[j + SW]) || isWater(type[j - 1]) || isWater(type[j + 1]) ? WATER : EMPTY);
      if (type[body] === HUMAN) fill(body);
      if (type[head] === HEAD) fill(head);
      flashRx(body, EL_SR); // a red flash
    }

    // A cell drifts in water and divides there; out of it, it falls like a grain and dries up in
    // about half a minute. What it touches decides what it grows into (see evolve()).
    function microbe(i) {
      let wet = 0;
      for (let k = 0; k < 4; k++) if (isWater(type[i + N4[k]])) wet++;
      if ((data[i] += wet ? 1 : 2) > 3600 + shade[i] * 8) { transform(i, EMPTY); return; }
      if (rnd() < 0.12) { // what it touches (looking all round, so a cow walking past still counts)
        const k0 = (rnd() * 8) | 0;
        for (let k = 0; k < 8; k++) if (evolve(i, i + N8[(k0 + k) & 7])) return;
      }
      if (wet) {
        if (wet >= 3 && rnd() < 0.002 && counts[FISH] < 300) { birth(i, FISH); flashRx(i, CELL); return; }
        const n = i + N8[(rnd() * 8) | 0];
        if (isWater(type[n])) {
          if (rnd() < 0.002 && counts[CELL] < 400) { transform(n, CELL); return; } // it divides
          if (rnd() < 0.3) { swap(i, n); return; } // and drifts
        }
      }
      if (canEnter(P_DENS[CELL], i + SW)) movePowder(i, CELL);
    }
    function evolve(i, n) {
      const nt = type[n];
      let to = 0;
      switch (nt) {
        case MUD: case DIRT: case SOIL: if (counts[WORM] < 150) to = WORM; break; // in damp earth: a worm
        case SUGAR: if (counts[ANT] < 200) to = ANT; break;                      // at something sweet: an ant
        case FLOWER: if (counts[FIREFLY] < 120) to = FIREFLY; break;              // on a flower: a firefly
        case GRASS: if (counts[COW] < 60) to = COW; break;                        // in a meadow: a cow
        case COW: if (counts[WOLF] < 20) to = WOLF; break;                        // beside its prey: a hunter
        case FISH: if (counts[SHARK] < 12) to = SHARK; break;
        case CLAY: if (counts[HUMAN] < 80 && open(i - SW)) to = HUMAN; break;     // shaped from clay: a person
        case PLANT: if ((flags[n] & LEAF) && counts[BIRD] < 50) to = BIRD; break; // up in the leaves: a bird
        case WOOD: to = flags[n] & LEAF ? (counts[BIRD] < 50 ? BIRD : 0) : MUSHROOM; break; // on a log: a mushroom
        case ALCOHOL: // bacteria sour it into vinegar
          transform(n, VINEGAR); transform(i, EMPTY); flashRx(n, VINEGAR);
          return true;
      }
      if (!to) return false;
      if (to === MUSHROOM) startPlant(i, MUSHROOM);
      else { birth(i, to); if (to === HUMAN) birth(i - SW, HEAD); }
      flashRx(i, CELL);
      return true;
    }

    // Cows and wolves walk the ground on four legs: one cell each, drawn bigger. They fall, step up
    // a ledge a cell high, turn back at a cliff, at fire or at water, and swim up if they fall in.
    // Returns where the animal is now, or -1 if it has died or fallen.
    function quad(i, lifespan) {
      if (!(flags[i] & BURN) && ++data[i] > lifespan) { transform(i, ASH); return -1; }
      if (smothered(i)) { transform(i, ASH); return -1; }
      const b = i + SW;
      if (open(b)) { swap(i, b); return -1; }
      if (liquidAt(i - SW) && rnd() < 0.4) { swap(i, i - SW); return -1; } // swims up
      return i;
    }
    function walk(i) {
      const dir = aux[i] & 1 ? 1 : -1, f = i + dir;
      if (hazardAt(f) || hazardAt(f + SW)) { aux[i] ^= 1; return i; }
      if (open(f)) {
        let drop = 0;
        while (drop < 5 && open(f + SW * (drop + 1))) drop++;
        const land = f + SW * (drop + 1);
        if (drop >= 5 || hazardAt(land) || (liquidAt(land) && !liquidAt(i + SW))) { aux[i] ^= 1; return i; }
        swap(i, f); return f;
      }
      if (open(f - SW) && open(i - SW)) { swap(i, f - SW); return f - SW; } // up a ledge
      aux[i] ^= 1;
      return i;
    }
    // Turn to face (toward > 0) or away from (toward < 0) cell j.
    function face(i, j, toward) { const right = (cx(j) > cx(i)) === toward > 0; aux[i] = (aux[i] & ~1) | (right ? 1 : 0); }
    // A calf, a pup: on open ground beside the parent.
    function young(i, t) {
      const s = i + (aux[i] & 1 ? -1 : 1);
      if (open(s) && !open(s + SW)) place(s, t);
    }

    function cow(i) {
      if ((i = quad(i, 40000 + shade[i] * 60)) < 0) return;
      const run = threat(i, 5), wolf = spot(i, 9, WOLF);
      if (run) aux[i] = (aux[i] & ~1) | (run > 0 ? 1 : 0);
      else if (wolf >= 0) face(i, wolf, -1); // flees
      const scared = run || wolf >= 0;
      if (rnd() < (scared ? 0.5 : 0.07)) i = walk(i);
      else if (rnd() < 0.004) aux[i] ^= 1;
      if (!scared && rnd() < 0.02) { // grazing
        const n = i + N8[(rnd() * 8) | 0], nt = type[n];
        if (nt === GRASS || nt === DRYGRASS || nt === FLOWER || (nt === PLANT && !(flags[n] & LEAF) && cy(n) >= cy(i) - 1)) {
          transform(n, EMPTY);
          const meals = ((aux[i] >> 1) & 7) + 1;
          if (meals >= 6 && counts[COW] < 60 && spot(i, 6, COW) >= 0) { young(i, COW); aux[i] &= ~14; }
          else aux[i] = (aux[i] & ~14) | (Math.min(7, meals) << 1);
        }
      }
    }

    function wolf(i) {
      if ((i = quad(i, 36000 + shade[i] * 60)) < 0) return;
      const run = threat(i, 5), prey = run ? -1 : spot(i, 11, COW, HUMAN, HEAD);
      if (run) aux[i] = (aux[i] & ~1) | (run > 0 ? 1 : 0);
      else if (prey >= 0) face(i, prey, 1);
      if (rnd() < (run || prey >= 0 ? 0.55 : 0.1)) i = walk(i);
      else if (rnd() < 0.004) aux[i] ^= 1;
      for (let k = 0; k < 8; k++) { // a bite at anything to eat beside it
        const n = i + N8[k], nt = type[n];
        if ((nt !== COW && nt !== HUMAN && nt !== HEAD) || rnd() > 0.1) continue;
        if (nt === COW) { become(n, EMPTY); flashRx(n, EL_SR); } else killHuman(n);
        const meals = ((aux[i] >> 1) & 7) + 1;
        if (meals >= 3 && counts[WOLF] < 20 && spot(i, 8, WOLF) >= 0) { young(i, WOLF); aux[i] &= ~14; }
        else aux[i] = (aux[i] & ~14) | (Math.min(7, meals) << 1);
        break;
      }
    }

    // Sharks swim like big fish, hunt fish and swimmers, and die on dry land within seconds.
    function shark(i) {
      if (++data[i] > 30000 + shade[i] * 40) { transform(i, DIRT); return; }
      let wet = 0;
      for (let k = 0; k < 4; k++) if (isWater(type[i + N4[k]])) wet++;
      if (!wet) { // stranded: it flops about and suffocates, in ten seconds
        if (tick % 40 === 0) { const c = (aux[i] >> 4) + 1; if (c >= 15) { transform(i, DIRT); return; } aux[i] = (aux[i] & 15) | (c << 4); }
        if (open(i + SW)) swap(i, i + SW);
        return;
      }
      aux[i] &= 15;
      const prey = spot(i, 12, FISH, HUMAN, HEAD);
      if (prey >= 0) face(i, prey, 1);
      else if (rnd() < 0.01) aux[i] ^= 1;
      if (rnd() < (prey >= 0 ? 0.6 : 0.3)) {
        const dir = aux[i] & 1 ? 1 : -1;
        const dy = prey >= 0 ? Math.sign(cy(prey) - cy(i)) : rnd() < 0.1 ? -1 : rnd() < 0.2 ? 1 : 0;
        const j = i + dir + dy * SW;
        if (isWater(type[j])) i = (swap(i, j), j);
        else if (isWater(type[i + dir])) i = (swap(i, i + dir), i + dir);
        else aux[i] ^= 1;
      }
      for (let k = 0; k < 8; k++) {
        const n = i + N8[k], nt = type[n];
        if ((nt !== FISH && nt !== HUMAN && nt !== HEAD) || rnd() > 0.12) continue;
        if (nt === FISH) { become(n, WATER); flashRx(n, EL_SR); } else killHuman(n);
        const meals = ((aux[i] >> 1) & 7) + 1;
        if (meals >= 4 && counts[SHARK] < 12) {
          const s = i + N4[(rnd() * 4) | 0];
          if (isWater(type[s])) place(s, SHARK);
          aux[i] &= ~14;
        } else aux[i] = (aux[i] & ~14) | (Math.min(7, meals) << 1);
        break;
      }
    }

    // ───── machines ─────
    // Pipes and valves carry matter: each holds one cell's worth of something (aux: its element;
    // data: bits 0–1 the way it is going, an N4 index, and the rest the push it has left) and hands
    // it on to the next each tick. With no push, liquids and powders only run down or along and gases
    // only up or along; a pump's push carries them uphill for PUSH cells. A valve passes nothing while
    // it is unpowered. Matter only gets in or out at an open end (a cell with one pipe beside it).
    // What a pipe or a tank holds keeps the temperature of the cell, so water boils to steam in a hot
    // pipe and steam condenses in a cold one.
    const UP = 0, DOWN = 1;            // N4 indices
    const OPP4 = [1, 0, 3, 2];
    const SIDES = [[2, 3], [2, 3], [0, 1], [0, 1]];
    const DIR_N4 = [0, 3, 1, 2];       // a piston's or a pump's facing (up, right, down, left) as an N4 index
    const PUSH = 240, TANK_CAP = 40, ROD_MAX = 16, SHOVE_MAX = 28; // a piston can shove another with its rod out
    const isConduit = (t) => t === PIPE || t === VALVE;
    const flows = (j) => type[j] === PIPE || (type[j] === VALVE && sap[j] > 0); // a conduit that will pass things on
    // the state something would be in at temperature T, without a cell to ask
    function stateOf(t, T) {
      if (!P_PERIODIC[t]) return P_CAT[t];
      return T >= P_BP[t] ? C_GAS : T >= P_MP[t] ? C_LIQUID : P_SOLID[t] ? C_STATIC : C_POWDER;
    }
    // can the matter in cell j go into a pipe? liquids, gases and powders; not air, flame or creatures
    function carriable(j) {
      const t = type[j];
      if (t === EMPTY || t === BOUND || NOPIPE[t]) return false;
      const c = catOf(j);
      return c === C_LIQUID || c === C_GAS || c === C_POWDER;
    }
    function holdsState(i) { // boiling, condensing or freezing inside
      const c = aux[i], T = temp[i];
      let to = -1;
      if (T > P_HI_T[c]) to = P_HI_TO[c];
      else if (T < P_LO_T[c]) to = P_LO_TO[c];
      if (to >= 0 && !NOPIPE[to]) { aux[i] = to; if (to === EMPTY && type[i] === TANK) data[i] = 0; } // alcohol boils away to nothing
    }
    // Is cell n outside the plumbing, open: air, or loose matter (a liquid, a gas, a powder)? Walls,
    // creatures and the plumbing itself are not.
    function outside(n) {
      const t = type[n];
      if (t === EMPTY) return true;
      if (t === BOUND || PLUMBING[t]) return false;
      const c = catOf(n);
      return c !== C_STATIC && c !== C_LIFE;
    }
    // A bore cell open to the outside. A pipe is drawn walled in (encase()), so it is open only at its
    // two ends, or wherever a hole has been made in its walls.
    function opening(i) {
      for (let k = 0; k < 4; k++) if (outside(i + N4[k])) return true;
      return false;
    }
    // A valve, pump, piston or sensor drawn as a blob is one machine: power reaching any cell of it
    // spreads to the rest (and dies away from all of them together).
    function share(i, t) {
      const p = sap[i];
      for (let k = 0; k < 4; k++) { const n = i + N4[k]; if (type[n] === t && sap[n] < p) sap[n] = p; }
    }
    const goes = (st, d, push) => push > 0 || (st === C_GAS ? d !== DOWN : d !== UP);
    const INTAKE_L = [UP, 2, 3], INTAKE_R = [UP, 3, 2]; // where an opening draws a liquid from: above, then beside
    function fill(j, c, d, push, T) { aux[j] = c; data[j] = d | (push << 2); temp[j] = T; stamp[j] = now; }
    function conduit(i, t) {
      if (t === VALVE && sap[i] > 0) { sap[i]--; share(i, VALVE); }
      const open = t === PIPE || sap[i] > 0;
      if (!aux[i]) { // empty: an opening drains in a liquid or a powder above it or beside it (gases go in only by a pump)
        if (!open || rnd() > 0.5) return;
        for (const d of rnd() < 0.5 ? INTAKE_L : INTAKE_R) {
          const u = i + N4[d];
          if (carriable(u) && catOf(u) !== C_GAS) { fill(i, type[u], OPP4[d], 0, temp[u]); place(u, EMPTY); temp[u] = ambient; return; }
        }
        return;
      }
      holdsState(i);
      const c = aux[i];
      if (!c || !open) return;
      const st = stateOf(c, temp[i]);
      if (st === C_STATIC) return; // frozen solid in the pipe
      const d0 = data[i] & 3, push = data[i] >> 2, r = rnd() < 0.5 ? 0 : 1;
      const order = [d0, SIDES[d0][r], SIDES[d0][1 - r], OPP4[d0]];
      // with nothing pushing it, a liquid falls into any branch below it first (a gas rises), then goes on
      const fall = push > 0 ? -1 : st === C_GAS ? UP : DOWN;
      if (fall >= 0 && order[0] !== fall) { order.splice(order.indexOf(fall), 1); order.unshift(fall); }
      for (let q = 0; q < 4; q++) { // on along the pipe, into a tank, or out of an open end the way it is going
        const d = order[q];
        if (!goes(st, d, push)) continue;
        const j = i + N4[d], jt = type[j];
        if (jt === TANK) { if (tankTake(j, c, temp[i])) { aux[i] = 0; data[i] = 0; return; } continue; } // a full tank: try another way
        if (q === 0 && outside(j) && (jt === EMPTY || (st !== C_GAS && catOf(j) === C_GAS))) { pour(i, j, c, d, st, push); return; }
        if (isConduit(jt) && !aux[j] && flows(j)) {
          const T = temp[j]; fill(j, c, d, push > 0 ? push - 1 : 0, temp[i]); temp[i] = T; aux[i] = 0; data[i] = 0;
          return;
        }
        // a bubble of gas and the liquid over it trade places: the liquid sinks on, the bubble rises
        if (isConduit(jt) && aux[j] && flows(j) && stamp[j] !== now) {
          const sj = stateOf(aux[j], temp[j]);
          if ((st !== C_GAS && sj === C_GAS && d !== UP) || (st === C_GAS && sj !== C_GAS && sj !== C_STATIC && d !== DOWN)) {
            const a = aux[j], dj = data[j], T = temp[j];
            aux[j] = c; data[j] = d | (push << 2); temp[j] = temp[i]; aux[i] = a; data[i] = dj; temp[i] = T; stamp[j] = now;
            return;
          }
        }
        // pressure: pushed into a full stretch of pipe, it passes its push on to what blocks the way,
        // so a pump drives a whole column of water along, not just the cell in front of it
        if (q === 0 && push > 1 && isConduit(jt) && aux[j] && flows(j) && (data[j] >> 2) < push - 1) data[j] = d | ((push - 1) << 2);
      }
      if (opening(i)) {
        for (let q = 0; q < 4; q++) { // out of an open end
          const d = order[q], j = i + N4[d], jt = type[j];
          // into open air; a liquid or a powder pours through smoke or flame too, putting it out
          if (!goes(st, d, push) || !(jt === EMPTY || (st !== C_GAS && jt !== BOUND && catOf(j) === C_GAS))) continue;
          pour(i, j, c, d, st, push);
          return;
        }
      }
      if (push > 0) data[i] = d0 | ((push >> 1) << 2); // stuck: the push fades unless a pump keeps it up
    }
    function pour(i, j, c, d, st, push) {
      place(j, c); temp[j] = temp[i]; aux[i] = 0; data[i] = 0;
      if (push > 0 && st !== C_GAS) { vx[j] = N4[d] === 1 ? 1.5 : N4[d] === -1 ? -1.5 : 0; if (d === UP) vy[j] = -2; } // a jet from a pumped pipe
    }
    // a tank takes one cell's worth of c at temperature T, if it has room and holds c or nothing
    function tankTake(j, c, T) {
      const n = data[j];
      if (n > 0 && aux[j] !== c && P_LO_TO[c] === aux[j]) c = aux[j]; // steam reaching a tank of water condenses into it
      if (n >= TANK_CAP || (n > 0 && aux[j] !== c)) return false;
      temp[j] = n > 0 ? (temp[j] * n + T) / (n + 1) : T; aux[j] = c; data[j] = n + 1;
      return true;
    }
    function tank(i) {
      if (data[i] <= 0) { data[i] = 0; aux[i] = 0; }
      // poured in from above (gases go in only by a pump or a pipe)
      if (data[i] < TANK_CAP && rnd() < 0.5) {
        const u = i - SW;
        if (carriable(u) && catOf(u) !== C_GAS && tankTake(i, type[u], temp[u])) { place(u, EMPTY); temp[u] = ambient; }
      }
      if (!data[i]) return;
      holdsState(i);
      const c = aux[i];
      if (!c) return;
      const st = stateOf(c, temp[i]), gas = st === C_GAS;
      // it settles through a tank of several cells: liquid to the bottom, gas to the top, and levels out
      const v = gas ? i - SW : i + SW;
      if (type[v] === TANK && (!data[v] || aux[v] === c) && data[v] < TANK_CAP) {
        const m = Math.min(data[i], TANK_CAP - data[v]);
        temp[v] = data[v] ? (temp[v] * data[v] + temp[i] * m) / (data[v] + m) : temp[i];
        aux[v] = c; data[v] += m; data[i] -= m;
        if (!data[i]) { aux[i] = 0; return; }
      }
      const s = i + (rnd() < 0.5 ? -1 : 1);
      if (type[s] === TANK && (!data[s] || aux[s] === c) && data[i] > data[s] + 1) { aux[s] = c; data[s]++; data[i]--; temp[s] = temp[i]; }
      if (st === C_STATIC) return; // frozen
      // an empty pipe (or an open valve) below it draws a liquid out, one above it a gas, one beside it either
      const ways = gas ? [UP, 2, 3] : [DOWN, 2, 3];
      for (let q = 0; q < 3; q++) {
        const d = ways[q], j = i + N4[d];
        if (!isConduit(type[j]) || aux[j] || !flows(j)) continue;
        fill(j, c, d, 0, temp[i]);
        if (--data[i] <= 0) { data[i] = 0; aux[i] = 0; }
        return;
      }
    }
    // A pump (aux: what it holds; data: the way it faces, 0 up, 1 right, 2 down, 3 left) is a conduit
    // that drives things the way it faces. Powered, an empty pump cell draws in one cell's worth from
    // any side but the one it faces (loose matter, what a pipe or a tank beside it holds), and a full
    // one hands it on that way: to the next cell of the pump, into a pipe with the push to climb, into
    // a tank, or out into the open as a jet. A blob of pump is one big pump.
    function pump(i) {
      if (sap[i] <= 0) return;
      sap[i]--; share(i, PUMP);
      const od = DIR_N4[data[i] & 3];
      if (aux[i]) {
        holdsState(i);
        const c = aux[i];
        if (!c || rnd() > 0.7) return;
        const o = i + N4[od], ot = type[o], st = stateOf(c, temp[i]);
        if (st === C_STATIC) return;
        if (ot === PUMP && !aux[o] && stamp[o] !== now) { aux[o] = c; const T = temp[o]; temp[o] = temp[i]; temp[i] = T; stamp[o] = now; aux[i] = 0; return; }
        if (isConduit(ot) && !aux[o] && flows(o)) { fill(o, c, od, PUSH, temp[i]); aux[i] = 0; events.pump++; return; }
        if (isConduit(ot) && aux[o] && flows(o)) { data[o] = od | (PUSH << 2); return; } // a full pipe in front: press on it
        if (ot === TANK) { if (tankTake(o, c, temp[i])) { aux[i] = 0; events.pump++; } return; }
        if (outside(o) && (ot === EMPTY || (st !== C_GAS && catOf(o) === C_GAS))) {
          place(o, c); temp[o] = temp[i]; stamp[o] = now; aux[i] = 0; events.pump++;
          if (od === UP) vy[o] = -3; else if (od >= 2) vx[o] = od === 3 ? 2 : -2; // a jet
        }
        return;
      }
      if (rnd() > 0.6) return;
      const k0 = (rnd() * 4) | 0;
      for (let q = 0; q < 4; q++) {
        const d = (k0 + q) & 3;
        if (d === od) continue;
        const j = i + N4[d], jt = type[j];
        if (carriable(j)) { aux[i] = jt; temp[i] = temp[j]; place(j, EMPTY); temp[j] = ambient; }
        else if (isConduit(jt) && aux[j]) { aux[i] = aux[j]; temp[i] = temp[j]; aux[j] = 0; data[j] = 0; }
        else if (jt === TANK && data[j] > 0 && aux[j]) { aux[i] = aux[j]; temp[i] = temp[j]; if (--data[j] <= 0) { data[j] = 0; aux[j] = 0; } }
        else if (jt === PUMP && aux[j] && stamp[j] !== now) { aux[i] = aux[j]; const T = temp[j]; temp[j] = temp[i]; temp[i] = T; aux[j] = 0; } // passed in from the rest of the pump, so a wide pump draws through its whole body
        else continue;
        stamp[i] = now;
        return;
      }
    }
    // A pipe's casing: walls built round the cells of a pipe just drawn (or round every pipe), on
    // every edge where it meets air or loose matter. So a pipe of any width drawn in one stroke is one
    // sealed run: erase a bit of its wall to let things in or out, or draw it onto a pump, a tank or a
    // valve, which it joins. caps ([x, y, r] each) leave openings there instead (the scenes use them);
    // `onlyAir` walls in only the edges open to the air (mending an older pipe).
    const strokeCells = [];
    function beginStroke() { strokeCells.length = 0; }
    function encase(caps, all = false, onlyAir = false) {
      const cells = all ? [] : strokeCells.slice();
      if (all) for (let i = 0; i < N; i++) if (type[i] === PIPE) cells.push(i);
      strokeCells.length = 0;
      if (!cells.length) return 0;
      const mine = new Set(cells);
      const open = (caps || []).filter(([x, y, r]) => { // a cap on old plumbing is a joint, not an opening
        for (let dy = -r - 2; dy <= r + 2; dy++) for (let dx = -r - 2; dx <= r + 2; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H || dx * dx + dy * dy > (r + 2) * (r + 2)) continue;
          const j = idx(xx, yy);
          if (PLUMBING[type[j]] && !mine.has(j)) return false;
        }
        return true;
      });
      const capped = (n) => { const x = cx(n), y = cy(n); return open.some(([a, b, r]) => (x - a) * (x - a) + (y - b) * (y - b) <= (r + 1.2) * (r + 1.2)); };
      let n = 0;
      for (const i of cells) { // walls on the four sides, as matter moves (a diagonal wall would only block a pump's intake)
        if (type[i] !== PIPE) continue;
        for (let k = 0; k < 4; k++) {
          const j = i + N4[k];
          if (!outside(j) || capped(j) || (onlyAir && type[j] !== EMPTY)) continue;
          place(j, CASING); n++;
        }
      }
      return n;
    }
    // A piston, powered, pushes its rod out a cell every few ticks, shoving the line of whatever is in
    // front along into the first gap (up to SHOVE_MAX cells, other machines and other pistons with their
    // rods too; only walls stop it), up to ROD_MAX cells out. Unpowered, it pulls the rod back in, a cell
    // at a time. A sticky piston (aux STICKY) pulls back with it the line of whatever its rod's tip is
    // pressed against, so what it pushed comes home with it; the tip of its rod (aux 1) shows the glue.
    const unshovable = (t) => t === BOUND || t === WALL || t === VOID || t === CLONE;
    const STICKY = 4;
    function piston(i) {
      const on = sap[i] > 0;
      if (on) { sap[i]--; share(i, PISTON); }
      if (tick % 3) return; // every cell of a piston strokes together
      const d = N4[DIR_N4[aux[i] & 3]];
      // pistons that touch are one machine, so only its front face strokes: a cell with piston right in
      // front of it is inside the blob (it must not shove its own body along)
      if (type[i + d] === PISTON) return;
      let j = i + d, L = 0;
      while (type[j] === ROD && L < ROD_MAX) { j += d; L++; }
      if (on) {
        if (L >= ROD_MAX) return;
        let e = j, n = 0;
        while (type[e] !== EMPTY && !(type[e] !== BOUND && catOf(e) === C_GAS)) {
          if (unshovable(type[e]) || ++n > SHOVE_MAX) return;
          e += d;
        }
        for (let k = e; k !== j; k -= d) carry(k, k - d);
        become(j, ROD);
        if (aux[i] & STICKY) { aux[j] = 1; if (L > 0) aux[j - d] = 0; } // the glue moves out to the new tip
        events.piston++;
      } else if (L > 0) {
        place(j - d, EMPTY); temp[j - d] = ambient;
        if (aux[i] & STICKY) {
          if (L > 1) aux[j - 2 * d] = 1;
          let e = j, n = 0; // the line pressed against the tip, as far as a push would shove
          while (n < SHOVE_MAX && type[e] !== EMPTY && !unshovable(type[e]) && catOf(e) !== C_GAS) { e += d; n++; }
          for (let k = j; k !== e; k += d) carry(k - d, k);
        }
        events.piston++;
      }
    }
    // swap two cells along with their sap (a machine's power, a plant's water), for things shoved or
    // carried whole: a piston pushed by another keeps its power, a flying ship its current
    function carry(a, b) { swap(a, b); const s = sap[a]; sap[a] = sap[b]; sap[b] = s; }

    // ───── ships ─────
    // Whatever is joined to a thruster through what ships are built of (machine parts, metal, cast
    // metal, glass: SHIPPY) is one ship, worked out afresh each tick and moved as a whole. A thruster
    // that is powered and has fuel pushes its ship the way it faces and blows flame out of its other
    // side; the ship's speed is kept in its thrusters' vx and vy (they are static, so those are free).
    // It falls when nothing holds it up, ploughs through loose matter (shoving it along, or letting it
    // slip past to its rear), and stops against anything solid: hard, its front breaks into scrap,
    // unless landing legs take the blow.
    const SHIP_MAX = 6000, THRUST = 1.5, G_SHIP = 0.02, V_MAX = 0.6, SAFE_LANDING = 0.4, FUEL_TICKS = 24;
    const shipMark = new Int32Array(N), moveMark = new Int32Array(N);
    let shipNo = 0, moveNo = 0, shipQ = new Int32Array(1024);
    // A thruster, every tick: power spreads through its blob as through a pump's; powered, it takes fuel
    // when it runs out (FUEL_TICKS of burning for each cell's worth) from a tank, pipe or pool it touches,
    // or from the next thruster cell; and while it has fuel, it fires (its flame shows where there is
    // room for it: standing on a launch pad, it still lifts off).
    function thruster(i) {
      if (sap[i] > 0) { sap[i]--; share(i, THRUSTER); }
      let firing = false;
      if (sap[i] > 0) {
        if (data[i] <= 0) refuel(i);
        if (data[i] > 0) {
          data[i]--; firing = true;
          const back = OPP4[DIR_N4[aux[i] & 3]], e = i + N4[back];
          if (type[e] !== THRUSTER) exhaust(e, back);
        }
      }
      aux[i] = (aux[i] & 3) | (firing ? 4 : 0);
    }
    function refuel(i) {
      for (let k = 0; k < 4; k++) {
        const n = i + N4[k], nt = type[n];
        if (nt === TANK && FUEL[aux[n]] && data[n] > 0) { if (--data[n] <= 0) { data[n] = 0; aux[n] = 0; } }
        else if (isConduit(nt) && FUEL[aux[n]]) { aux[n] = 0; data[n] = 0; }
        else if (FUEL[nt] && catOf(n) !== C_STATIC) { place(n, EMPTY); temp[n] = ambient; }
        else if (nt === THRUSTER && data[n] >= 2) { const h = data[n] >> 1; data[n] -= h; data[i] = h; return; }
        else continue;
        data[i] = FUEL_TICKS;
        return;
      }
    }
    // a jet of flame out of the nozzle, a few cells long, that blows the air along with it
    function exhaust(e, back) {
      const d = N4[back], L = 3 + ((rnd() * 6) | 0);
      for (let k = 0, j = e; k < L; k++, j += d) {
        const t = type[j];
        if (t === BOUND || (t !== EMPTY && catOf(j) !== C_GAS)) break;
        place(j, FIRE); temp[j] = 900 + rnd() * 400; data[j] = 3 + ((rnd() * 5) | 0);
      }
      const a = AIRMAP[e];
      if (back === UP || back === DOWN) avy[a] += (back === UP ? -1 : 1) * 0.6; else avx[a] += (d > 0 ? 1 : -1) * 0.6;
      events.rumble = Math.max(events.rumble, 0.3);
    }
    // the ship cell i belongs to: every SHIPPY cell joined to it, or null if it is too big to fly
    // (built into something huge); marks all of them either way
    function gatherShip(i0) {
      let n = 0, head = 0, big = false;
      shipMark[i0] = shipNo; shipQ[n++] = i0;
      while (head < n) {
        const i = shipQ[head++];
        for (let k = 0; k < 4; k++) {
          const j = i + N4[k];
          if (shipMark[j] === shipNo || !SHIPPY[type[j]]) continue;
          shipMark[j] = shipNo;
          if (n >= SHIP_MAX) { big = true; continue; }
          if (n === shipQ.length) { const q = new Int32Array(n * 2); q.set(shipQ); shipQ = q; }
          shipQ[n++] = j;
        }
      }
      if (big) { // go on marking the rest, so its other thrusters don't gather it again this tick
        const stack = [];
        for (let k = 0; k < n; k++) stack.push(shipQ[k]);
        while (stack.length) {
          const i = stack.pop();
          for (let k = 0; k < 4; k++) { const j = i + N4[k]; if (shipMark[j] !== shipNo && SHIPPY[type[j]]) { shipMark[j] = shipNo; stack.push(j); } }
        }
        return null;
      }
      return shipQ.slice(0, n);
    }
    // Move a ship one cell by d. Anything solid in the way (or, going down, a heap or a creature to land
    // on) stops it: returns the ship cells that ran into something, or null once it has moved.
    function moveShip(cells, d) {
      const m = ++moveNo;
      for (const c of cells) moveMark[c] = m;
      const hit = [];
      for (const c of cells) {
        const t = c + d, tt = type[t];
        if (moveMark[t] === m || tt === EMPTY) continue;
        const cat = tt === BOUND ? C_STATIC : catOf(t);
        if (cat === C_STATIC || (d === SW && (cat === C_POWDER || cat === C_LIFE))) hit.push(c);
      }
      if (hit.length) return hit;
      // each line of ship cells along d moves on a cell, front first; what was in front of it (air, or
      // matter that couldn't be shoved on ahead) ends up behind it
      for (const c of cells) {
        const t = c + d;
        if (moveMark[t] === m) continue;
        if (type[t] !== EMPTY && catOf(t) !== C_GAS) shoveOn(t, d);
        for (let k = c; moveMark[k] === m; k -= d) carry(k + d, k);
      }
      for (let k = 0; k < cells.length; k++) { cells[k] += d; stamp[cells[k]] = 0; } // still worked this tick, where it now is
      return null;
    }
    // shove the loose things lined up from t along d on a cell, if a gap opens up within a few cells
    function shoveOn(t, d) {
      let e = t;
      for (let n = 0; n < 8; n++, e += d) {
        const et = type[e];
        if (et === EMPTY || (et !== BOUND && catOf(e) === C_GAS)) {
          for (let k = e; k !== t; k -= d) carry(k, k - d);
          return;
        }
        if (et === BOUND || catOf(e) === C_STATIC) return;
      }
    }
    // A ship stopped by what its cells `hit`, going at speed v along d: landing legs touching down
    // take any blow; otherwise past SAFE_LANDING its front breaks up, and fast, it goes off with a bang.
    function crash(hit, d, v) {
      if (v < SAFE_LANDING || hit.some((c) => type[c] === LEGS)) return;
      const f = Math.min(1, (v - SAFE_LANDING) * 2.5);
      let n = 0;
      for (const c of hit) {
        if (rnd() > f) continue;
        if (type[c] === GLASS) crumble(c);
        else { // scrap of its own colour (the hull's steel grey, a tank's, a thruster's), paint and all
          const from = type[c], paint = col[c];
          become(c, SCRAP); aux[c] = from; if (paint) col[c] = paint;
          if (!disc[SCRAP]) discover(SCRAP, c);
        }
        const o = c + d;
        if (type[o] !== BOUND && BREAKS[type[o]] && rnd() < f * 0.5) crumble(o);
        n++;
      }
      events.shake += 2 + 6 * f; events.cracks += n;
      if (v > 0.7 && hit.length) { const c = hit[(rnd() * hit.length) | 0]; explode(cx(c), cy(c), 2 + Math.round(3 * f), 0.6); }
    }
    function ships() {
      for (let i = SW; i < N - SW; i++) if (type[i] === THRUSTER && stamp[i] !== now) thruster(i);
      shipNo++;
      for (let i = SW; i < N - SW; i++) {
        if (type[i] !== THRUSTER || shipMark[i] === shipNo) continue;
        const cells = gatherShip(i);
        if (cells) flyShip(cells);
      }
    }
    function flyShip(cells) {
      // its speed, and the push of every thruster firing
      let vxs = 0, vys = 0, nt = 0, fx = 0, fy = 0;
      for (const c of cells) {
        if (type[c] !== THRUSTER) continue;
        nt++; vxs += vx[c]; vys += vy[c];
        if (aux[c] & 4) { const d = N4[DIR_N4[aux[c] & 3]]; if (d === -SW) fy--; else if (d === SW) fy++; else fx += d; }
      }
      let u = vxs / nt, v = vys / nt;
      u += (fx * THRUST) / cells.length; v += (fy * THRUST) / cells.length + G_SHIP;
      u = Math.max(-V_MAX, Math.min(V_MAX, u * 0.995)); v = Math.max(-V_MAX, Math.min(V_MAX, v));
      // it goes a cell at a time, as often as its speed says
      if (rnd() < Math.abs(v)) {
        const d = v > 0 ? SW : -SW, hit = moveShip(cells, d);
        if (hit) { crash(hit, d, Math.abs(v)); v = 0; u *= 0.8; } // stopped: and on the ground it drags
      }
      if (rnd() < Math.abs(u)) {
        const d = u > 0 ? 1 : -1, hit = moveShip(cells, d);
        if (hit) { crash(hit, d, Math.abs(u)); u = 0; }
      }
      // where it is now is claimed too, so the scan for thrusters doesn't find it again further on
      for (const c of cells) { shipMark[c] = shipNo; if (type[c] === THRUSTER) { vx[c] = u; vy[c] = v; } }
    }
    // A sensor checks what touches it: anything loose (a grain, a drop, a creature) in touch mode,
    // or how hot (or cold) the things against it are. While it is set off, it sends a pulse into the
    // wire beside it as often as a battery would.
    function sensor(i) {
      const mode = (aux[i] >> 1) & 3;
      let on = false;
      if (mode === 0) {
        for (let k = 0; k < 4; k++) {
          const n = i + N4[k], nt = type[n];
          if (nt === EMPTY || nt === BOUND) continue;
          const c = catOf(n);
          if (c === C_LIFE) { on = true; break; }
          // a grain or a drop counts once it rests against it, on top of it or held up from below
          // (a pool rising to it, a heap beside it), not as it falls past or drips off it
          if ((c === C_POWDER || c === C_LIQUID) && (n + SW === i || (type[n + SW] !== EMPTY && catOf(n + SW) !== C_GAS))) { on = true; break; }
        }
      } else {
        let T = temp[i];
        for (let k = 0; k < 4; k++) {
          const n = i + N4[k];
          if (type[n] === BOUND) continue;
          T = mode === 1 ? Math.max(T, temp[n]) : Math.min(T, temp[n]);
        }
        on = mode === 1 ? T > data[i] : T < data[i];
      }
      // a blob of sensor is one sensor: one cell set off lights it all (sap: how long it stays lit)
      if (on) sap[i] = 20; else if (sap[i] > 0) sap[i]--;
      share(i, SENSOR);
      on = sap[i] > 0;
      aux[i] = (aux[i] & ~1) | (on ? 1 : 0);
      if (on && ((tick + i) & 15) === 0) {
        for (let k = 0; k < 4; k++) { const n = i + N4[k]; if (P_CONDUCT[type[n]]) energize(n); }
      }
    }
    // a click on a switch flips it and every switch joined to it; returns how many flipped
    function flip(x, y) {
      if (x < 0 || y < 0 || x >= W || y >= H) return 0;
      const i0 = idx(x, y);
      if (type[i0] !== SWITCH) return 0;
      const to = aux[i0] ? 0 : 1, q = [i0], seen = new Set(q);
      for (let k = 0; k < q.length; k++) {
        const i = q[k];
        aux[i] = to;
        if (!to) charge[i] = 0;
        for (let m = 0; m < 4; m++) { const n = i + N4[m]; if (type[n] === SWITCH && !seen.has(n)) { seen.add(n); q.push(n); } }
      }
      return q.length;
    }

    // ───── limestone ─────
    // Water seeping down through limestone (a pond or rain on the rock above a cave) drips from its
    // underside, and each drop leaves a little calcite behind: a stalactite grows down from the
    // ceiling, slower the longer it hangs, and the drops landing under it build a stalagmite up.
    // data is how far a stalactite cell hangs (or a stalagmite cell stands): 0 for the rock itself.
    function seeps(i) {
      let j = i - SW;
      for (let k = 0; k < 24; k++, j -= SW) {
        const t = type[j];
        if (isWater(t)) return true;
        if (t !== LIMESTONE) return false;
      }
      return false;
    }
    function drip(i) {
      const L = data[i], b = i + SW;
      if (L >= 12 || rnd() > 1 / (1 + L * 0.6)) return;
      // a new one starts only with clear rock either side, so each hangs as a spike of its own
      if (L === 0 && (rnd() > 0.3 || type[b - 1] !== EMPTY || type[b + 1] !== EMPTY || type[b - 2] !== EMPTY || type[b + 2] !== EMPTY)) return;
      transform(b, LIMESTONE); data[b] = L + 1;
      // the drop falls on: where it lands, a stalagmite rises
      let f = b + SW, gap = 0;
      while (gap < 60 && type[f] === EMPTY) { f += SW; gap++; }
      if (gap < 3 || rnd() > 0.5) return;
      const ft = type[f];
      if (ft === LIMESTONE ? data[f] < 8 : (ft !== BOUND && catOf(f) === C_STATIC && P_SAP[ft] === 0)) {
        transform(f - SW, LIMESTONE); data[f - SW] = ft === LIMESTONE ? data[f] + 1 : 1;
      }
    }

    // ───── the periodic table ─────
    // Burning flecks of metal flung from cell i: up to n of them, at up to `speed` cells a tick.
    function throwSparks(i, src, n, speed) {
      for (let k = 0; k < n; k++) {
        const j = i + N8[(rnd() * 8) | 0];
        if (type[j] !== EMPTY) continue;
        transform(j, MSPARK);
        aux[j] = src; temp[j] = 1300 + rnd() * 400;
        vx[j] = (rnd() * 2 - 1) * speed; vy[j] = -(0.6 + rnd() * speed);
      }
    }

    // Red-hot iron or titanium burning where air reaches it: loose filings (two open sides, or any
    // oxygen) throw a spark now and then and slowly burn to rust or white oxide; a solid lump doesn't.
    function sparkBurn(i, t) {
      let air = 0, ox = -1;
      for (let k = 0; k < 4; k++) {
        const m = i + N4[k], u = type[m];
        if (u === EMPTY) air++;
        else if (u === EL_O) { air += 3; ox = m; }
      }
      if (air < 2 || rnd() > 0.025 * air) return false;
      throwSparks(i, t, 1, t === EL_TI ? 3.2 : 2.4);
      temp[i] += 12;
      if (ox >= 0 && rnd() < 0.3) transform(ox, EMPTY);
      if (rnd() < (t === EL_FE ? 0.03 : 0.012)) { transform(i, t === EL_FE ? RUST : ASH); return true; }
      return false;
    }

    // Aluminium dust: a grain hanging in open air (seven empty neighbours) that meets a flame flashes
    // white and sets off the dust around it, a dust explosion. A heap of it never does.
    function dustFlash(i) {
      let free = 0, hot = temp[i] > 650;
      for (let k = 0; k < 8; k++) {
        const u = type[i + N8[k]];
        if (u === EMPTY) free++;
        else if (u === FIRE || u === PLASMA || u === MSPARK || u === EMBER) hot = true;
      }
      if (free < 7 || !hot) return false;
      transform(i, FIRE); aux[i] = EL_MG; temp[i] = 2200; data[i] = 8;
      throwSparks(i, EL_AL, 2, 3);
      explode(cx(i), cy(i), 2, 0.3, EL_AL);
      return true;
    }

    const ELECTROLYTE = (u) => u === SALTWATER || u === ACID || u === VINEGAR; // a vinegar battery works too
    // light enough to drive a solar cell: open sky straight above (through glass, not cloud), or a
    // flame, lava or something glowing hot within two cells
    function lit(i) {
      let sky = true;
      for (let j = i - SW; type[j] !== BOUND; j -= SW) {
        const u = type[j];
        if (u === EMPTY || u === GLASS) continue;
        if (IS_CLOUD[u] || u === FOG || catOf(j) !== C_GAS) { sky = false; break; }
      }
      if (sky) return true;
      const x0 = cx(i), y0 = cy(i);
      for (let y = Math.max(0, y0 - 2); y <= Math.min(H - 1, y0 + 2); y++) {
        for (let x = Math.max(0, x0 - 2), j = idx(x, y); x <= Math.min(W - 1, x0 + 2); x++, j++) {
          const u = type[j];
          if (u === FIRE || u === PLASMA || u === LAVA || u === EMBER || u === MSPARK || u === LIGHT || (flags[j] & BURN) || (u !== EMPTY && temp[j] > 900)) return true;
        }
      }
      return false;
    }
    // Does this cell make current right now? A solar cell in light; tellurium or bismuth with heat on
    // one side and cold on the other (the Seebeck effect); zinc in saltwater or acid with copper in the
    // same bath, within a dozen cells (Volta's pile, the lemon battery), which slowly eats the zinc
    // away; lead standing in acid (a car battery).
    function makesCurrent(i, t) {
      if (P_SOLAR[t]) return lit(i);
      if (P_SEEBECK[t]) {
        let lo = Infinity, hi = -Infinity;
        for (let k = 0; k < 4; k++) { const T = temp[i + N4[k]]; if (T < lo) lo = T; if (T > hi) hi = T; }
        return hi - lo > 150;
      }
      if (t === EL_ZN || t === EL_PB) {
        let wet = false;
        for (let k = 0; k < 4; k++) {
          const u = type[i + N4[k]];
          if (t === EL_PB ? u === ACID : ELECTROLYTE(u)) { wet = true; break; }
        }
        if (!wet || t === EL_PB) return wet; // lead plates standing in acid: a car battery
        const x0 = cx(i), y0 = cy(i);
        for (let y = Math.max(0, y0 - 12); y <= Math.min(H - 1, y0 + 12); y++) {
          for (let x = Math.max(0, x0 - 12), j = idx(x, y); x <= Math.min(W - 1, x0 + 12); x++, j++) {
            if (type[j] !== EL_CU) continue;
            for (let k = 0; k < 4; k++) if (ELECTROLYTE(type[j + N4[k]])) return true;
          }
        }
      }
      return false;
    }

    // A few metals with a party trick of their own, on contact with a neighbour n. Returns true if
    // the cell at i stopped being itself.
    function metalTricks(i, t, n, nt) {
      switch (t) {
        case EL_HG: // gold dissolves into liquid mercury (an amalgam, how gold was won from river sand)
          if (nt === EL_AU && !aux[i] && temp[i] >= P_MP[t] && temp[i] < P_BP[t] && rnd() < 0.004) {
            aux[i] = 1; transform(n, EMPTY); flashRx(n, EL_AU);
          }
          return false;
        case EL_PD: // palladium soaks up hydrogen, hundreds of times its own volume, deep into the metal
          if (nt === EL_H && aux[i] < 8 && temp[i] < 300 && !(flags[n] & BURN) && rnd() < 0.15) {
            transform(n, EMPTY); aux[i]++; flashRx(n, EL_H);
          } else if (nt === EL_PD && aux[i] > aux[n] + 1) { aux[i]--; aux[n]++; }
          return false;
        case EL_PT: // a catalyst: hydrogen and methane burn on platinum's surface, heating it until it lights them
          if ((nt === EL_H || nt === METHANE) && !(flags[n] & BURN)) {
            if (temp[i] > 250) { if (rnd() < 0.2) ignite(n); }
            else { temp[i] += 60; if (rnd() < 0.2) flashRx(i, EMBER); }
          }
          return false;
        case EL_GA: // molten gallium creeps between aluminium's grains and it falls apart
          if (nt === EL_AL && temp[i] >= P_MP[t] && rnd() < 0.01) { transform(n, RUBBLE); flashRx(n, EL_AL); }
          return false;
        case EL_CA: { // calcium fired fast or white-hot into an actinide fuses with it: how 112 to 118 were made
          const p = P_FUSE[nt];
          if (p && (temp[i] > 3000 || Math.abs(vx[i]) + Math.abs(vy[i]) > 4) && rnd() < 0.3) {
            transform(n, p); temp[n] += 1500;
            transform(i, EMPTY);
            radiate(n); flashRx(n, PLASMA);
            events.fused.push(p);
            return true;
          }
          return false;
        }
        case EL_ZR: // red-hot zirconium tears the oxygen out of steam, leaving hydrogen (Fukushima)
          if (temp[i] > 900 && (nt === STEAM || isWater(nt)) && rnd() < 0.05) {
            transform(n, EL_H); temp[n] = 400; temp[i] += 40; flashRx(n, EL_H);
            if (rnd() < 0.08) { transform(i, SAND); return true; } // zirconia: a white ceramic sand
          }
          return false;
      }
      return false;
    }

    function periodic(i, t) {
      const dh = P_DHEAT[t];
      if (dh) temp[i] += dh;
      // A castable metal that has melted sets into its solid form as it cools, the way a pool of
      // molten gold becomes a gold block; powder that never melted stays powder. (A solid form
      // heated past the melting point turns back into the liquid metal: its own `hi`.)
      const ct = P_CASTTO[t];
      if (ct) {
        if (temp[i] >= P_MP[t]) flags[i] |= MOLTEN;
        else if (flags[i] & MOLTEN) { transform(i, ct); return true; }
      }
      if (P_RAD[t] && rnd() < P_RAD[t]) radiate(i);
      if (P_NEM[t] && rnd() < P_NEM[t]) neutrons(i, 1 + ((rnd() * 2) | 0));
      if (P_DECAY[t] && rnd() < P_DECAY[t]) {
        transform(i, P_DECAYTO[t]);
        radiate(i);
        if (P_ALPHA[t] && rnd() < 0.5) emitInto(i, EL_HE); // an alpha particle is a helium nucleus
        events.decay++;
        return true;
      }
      if (P_PHOS[t] && aux[i]) aux[i]--; // a phosphor's afterglow fades
      if (magOn && P_MAGK[t] !== 0 && !(flags[i] & HELD) && magnetic(i, t)) return true; // clinging to a magnet
      // current sources pulse three times a second (a lemon battery slowly eats its zinc)
      if ((P_SOLAR[t] || P_SEEBECK[t] || t === EL_ZN || t === EL_PB) && ((tick + i) % 20) === 0 && makesCurrent(i, t)) {
        energize(i);
        if (t === EL_ZN && rnd() < 0.015) { transform(i, EMPTY); return true; }
      }
      if (P_OHM[t] && temp[i] > 1500) {
        // a white-hot filament burns away where air reaches it, which is why bulbs are filled with argon
        for (let k = 0; k < 4; k++) {
          const u = type[i + N4[k]];
          if ((u === EMPTY || u === EL_O) && rnd() < 0.03) { transform(i, SMOKE); aux[i] = 1; flashRx(i, EMBER); return true; }
        }
      }
      // sparks: red-hot iron filings and titanium burn in air; a lighter flint sparks when it lands hard;
      // aluminium dust hanging in the air flashes in a fire
      if ((t === EL_FE || t === EL_TI) && temp[i] > (t === EL_FE ? 800 : 700) && sparkBurn(i, t)) return true;
      if (t === EL_CE && vy[i] > 2 && !open(i + SW)) {
        throwSparks(i, EL_CE, 4, 2.5);
        const b = i + SW, bt = type[b]; // and a spark falls straight into whatever it struck
        if (P_FLAM[bt] > 0 && !(flags[b] & BURN) && rnd() < 0.5) ignite(b);
      }
      if (t === EL_AL && !(flags[i] & BURN) && dustFlash(i)) return true;
      if (t === EL_P && !(flags[i] & BURN) &&
        (type[i - SW] === EMPTY || type[i - 1] === EMPTY || type[i + 1] === EMPTY || type[i + SW] === EMPTY)) {
        temp[i] += 0.05; // white phosphorus slowly oxidises in open air until it ignites (it is kept under water)
      }
      if (t === EL_PD && aux[i] && temp[i] > 300 && rnd() < 0.04) {
        // palladium breathes out the hydrogen it soaked up once it is warmed
        const h = emitInto(i, EL_H);
        if (h >= 0) { temp[h] = Math.min(temp[i], 450); aux[i]--; flashRx(h, EL_H); }
      }
      if (t === EL_HG && aux[i] && temp[i] >= P_BP[t]) {
        // an amalgam boils: the mercury goes off as vapour and leaves its gold behind
        const T0 = temp[i];
        transform(i, EL_AU); flashRx(i, EL_AU);
        const v = emitInto(i, EL_HG);
        if (v >= 0) temp[v] = T0;
        return true;
      }
      const n = i + N8[(rnd() * 8) | 0], nt = type[n];
      if (nt === EMPTY || nt === BOUND) return false;
      if (P_GLASS[t] && nt === MGLASS && rnd() < 0.08) {
        // a pinch of metal stains molten glass (cobalt blue, chromium green, gold ruby) and dissolves in
        aux[n] = t;
        if (rnd() < 0.3) { const T0 = Math.max(temp[i], temp[n]); transform(i, MGLASS); aux[i] = t; temp[i] = T0; return true; }
      }
      if (P_FLAME[t] && !P_EXPL_R[t] && temp[i] > 400) {
        // flame test: a hot grain in a fire vaporises into it, and the flames coming off the fuel
        // around it burn in its colour. Only burning fuel or embers feed it, never flame alone.
        if (nt === FIRE) { if (!aux[n] || t === EL_NA) aux[n] = t; }
        else if ((nt === EMBER || (flags[n] & BURN)) && rnd() < 0.5) {
          const j = i + UP3[(rnd() * 3) | 0];
          if (type[j] === EMPTY) { transform(j, FIRE); aux[j] = t; data[j] = 8 + ((rnd() * 14) | 0); temp[j] = Math.max(temp[i], 700); }
        }
      }
      if (metalTricks(i, t, n, nt)) return true;

      // alcohol: an alkali metal (or calcium) fizzes hydrogen off it gently and dissolves, without the
      // bang that water brings
      if (nt === ALCOHOL && (P_WR_P[t] || P_FIZZ[t]) && rnd() < 0.03) {
        transform(n, EL_H); temp[i] += 30; events.fizz++; flashRx(n, EL_H);
        if (rnd() < 0.25) { transform(i, ALCOHOL); return true; }
        return false;
      }
      if (nt === VINEGAR) {
        // vinegar is a weak acid: magnesium fizzes hard in it, zinc and iron slowly, and the metal is
        // eaten away; copper only goes green with verdigris, and silver and gold never mind it
        const v = P_VINEGAR[t];
        if (v && rnd() < v) {
          transform(n, EL_H); events.fizz++; flashRx(n, EL_H);
          if (rnd() < 0.2) { transform(i, rnd() < 0.5 ? VINEGAR : EMPTY); return true; }
          return false;
        }
        if (t === EL_CU && col[i] !== VERDIGRIS && rnd() < 0.004) { col[i] = VERDIGRIS; flashRx(i, EL_CU); }
      }
      // alkali metals and water (and vinegar, which is mostly water)
      if (P_WR_P[t] && (isWater(nt) || nt === VINEGAR) && rnd() < P_WR_P[t]) {
        transform(n, rnd() < 0.5 ? EL_H : STEAM);
        temp[n] = 300;
        transform(i, FIRE); aux[i] = t; temp[i] = 1200;
        events.sizzle++;
        if (rnd() < P_WR_POW[t]) explode(cx(i), cy(i), P_WR_R[t], P_WR_POW[t], t);
        return true;
      }
      if (P_FIZZ[t] && isWater(nt) && rnd() < 0.01) {
        transform(n, EL_H); flashRx(n, EL_H);
        if (rnd() < 0.15) { transform(i, EMPTY); return true; }
        return false;
      }
      // halogens corrode
      const corr = P_CORR[t];
      if (corr) {
        if (P_FAM[nt] === F_ALK) {
          // an alkali metal burns in the halogen in its flame colour (sodium in chlorine: a yellow
          // flash) and leaves salt behind, with a puff of white salt smoke
          transform(n, SALT); temp[n] = 400;
          transform(i, FIRE); aux[i] = nt; temp[i] = 1100; data[i] = 8 + ((rnd() * 10) | 0); flags[i] = SMOKE_WHITE;
          events.fizz++; events.sizzle++; flashRx(i, nt);
          return true;
        }
        if (P_LIVING[nt]) {
          if (t === EL_CL && nt === FLOWER) {
            // chlorine bleaches petals white before it kills the flower
            if (!(flags[n] & BLEACH)) { if (rnd() < 0.3) { flags[n] |= BLEACH; flashRx(n, SALT); } }
            else if (rnd() < corr * 0.1) transform(n, ASH);
            return false;
          }
          if (rnd() < corr) transform(n, ASH);
          return false;
        }
        if (nt === EL_AL && (t === EL_BR || (t === EL_I && (wetBeside(i) || wetBeside(n))))) {
          // bromine sets aluminium alight on contact; iodine needs a drop of water to start it,
          // then the heat boils the iodine off in a purple cloud
          if (rnd() < (t === EL_BR ? 0.2 : 0.1)) {
            transform(n, SALT); temp[n] = 700; events.fizz++;
            flashRx(n, t === EL_BR ? FIRE : EL_I);
            if (t === EL_BR) {
              transform(i, FIRE); temp[i] = 1500;
              const e = emitInto(i, EMBER);
              if (e >= 0) temp[e] = 1200;
              return true;
            }
            temp[i] = 450;
            for (let k = 0; k < 8; k++) { const m = i + N8[k]; if (type[m] === EL_I) temp[m] += 250; }
            if (rnd() < 0.3) emitInto(i, FIRE);
          }
          return false;
        }
        if (P_METALLIC[nt] && P_ACIDRES[nt] < 0.9) {
          if (rnd() < corr * 0.15) {
            transform(n, SALT); events.fizz++; flashRx(n, t);
            if (rnd() < 0.5) { transform(i, EMPTY); return true; }
          }
          return false;
        }
        if (isWater(nt)) {
          if (rnd() < corr * 0.1) { transform(n, ACID); transform(i, EMPTY); flashRx(n, ACID); return true; }
          return false;
        }
        if (t === EL_F && P_FLAM[nt] > 0 && !(flags[n] & BURN) && rnd() < 0.2) ignite(n);
        return false;
      }
      if (P_TOXIC[t] && P_LIVING[nt] && rnd() < 0.003) transform(n, ASH);
      return false;
    }

    // A burst of ionising radiation: lights up the air it crosses, kills what lives in its path.
    function radiate(i) {
      events.rad++;
      const d = N8[(rnd() * 8) | 0];
      let j = i;
      for (let s = 1; s <= 7; s++) {
        j += d;
        const t = type[j];
        if (t === BOUND) return;
        if (t === EMPTY) { if (s <= 5 && rnd() < 0.7) transform(j, RAD); continue; }
        if (t === RAD || catOf(j) === C_GAS) continue;
        if (P_PHOS[t]) aux[j] = P_PHOS[t]; // scintillation: radium paint on zinc, a detector's flash
        else if (t === GLASS && aux[j] === EL_U) data[j] = 120; // uranium glass fluoresces green
        else if (isWater(t)) aux[j] = Math.max(aux[j], 30); // Cherenkov light: water glows blue
        else if (t === EL_BE && rnd() < 0.3) neutrons(j, 1); // alpha on beryllium knocks out a neutron
        if (P_LIVING[t] && rnd() < 0.25) transform(j, ASH);
        if (P_SHIELD[t] || rnd() < 0.6) return;
      }
    }

    // Neutrons fly in straight lines through matter. A fissile nucleus may capture one and split
    // (next tick); absorbers like cadmium and boron stop them. A big enough lump goes critical.
    // Beryllium bounces them back the way they came (a reflector, so a smaller lump goes critical);
    // graphite slows them, and a slow neutron is three times as likely to split the next nucleus it
    // meets (a moderator). Water they cross glows blue.
    function neutrons(i, count) {
      for (let c = 0; c < count; c++) {
        let d = N8[(rnd() * 8) | 0], slow = false, bounces = 0;
        let j = i;
        for (let s = 1; s <= 16; s++) {
          j += d;
          const t = type[j];
          if (t === BOUND) break;
          if (t === EMPTY || t === RAD) {
            if (s <= 6 && t === EMPTY && rnd() < 0.25) { transform(j, RAD); aux[j] = 1; }
            continue;
          }
          if (P_PHOS[t]) aux[j] = P_PHOS[t];
          else if (t === GLASS && aux[j] === EL_U) data[j] = 120;
          if (t === EL_BE && bounces < 2 && rnd() < 0.8) { d = -d; bounces++; s = 0; continue; }
          if (t === EL_C) { slow = true; continue; }
          const f = P_FIS[t];
          if (f && rnd() < (slow ? Math.min(0.9, f * 3) : f)) { flags[j] |= FISSION; break; }
          const ab = P_ABS[t];
          if (ab && rnd() < ab) break;
          if (isWater(t)) { aux[j] = Math.max(aux[j], 45); if (rnd() < 0.12) break; }
          if (P_LIVING[t] && rnd() < 0.2) transform(j, ASH);
        }
      }
    }

    function fission(i) {
      const t = type[i];
      events.fission++;
      for (let k = 0; k < 8; k++) {
        const n = i + N8[k];
        if (type[n] !== BOUND) temp[n] += 250;
        if (isWater(type[n])) aux[n] = 60;
      }
      transform(i, rnd() < 0.5 ? EL_BA : EL_KR); // uranium splits into barium and krypton
      temp[i] += 3500;
      neutrons(i, 2 + (rnd() < 0.5 ? 1 : 0));
      radiate(i);
      if (rnd() < 0.08) explode(cx(i), cy(i), 3, 0.8, t);
    }

    // ───── light ─────
    // A ray of light runs straight on, three cells a tick, until it fades or leaves the map. Clear
    // things let it through (air and gases, water, ice, glass, diamond), and stained glass colours
    // it on the way; metal bounces it off; whatever else it meets soaks it up: a phosphor or
    // uranium glass glows, a solar cell makes current (see lit()), a plant drinks it in, and the
    // rest warms a little. aux: its direction (0–7, clockwise from east); col: its colour, if any.
    const RAY = new Int32Array([1, SW + 1, SW, SW - 1, -1, -SW - 1, -SW, -SW + 1]);
    const RDX = [1, 1, 0, -1, -1, -1, 0, 1], RDY = [0, 1, 1, 1, 0, -1, -1, -1];
    function rayDir(dx, dy) {
      if (!dx && !dy) return (rnd() * 8) | 0;
      return (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) & 7;
    }
    function seeThrough(j) {
      const t = type[j];
      if (t === GLASS || t === ICE || t === DIAMOND || isWater(t) || t === ALCOHOL || t === VINEGAR || t === CRYO) return true;
      return t !== EMPTY && t !== BOUND && t !== SMOKE && t !== FOG && !IS_CLOUD[t] && catOf(j) === C_GAS;
    }
    const shiny = (t) => t === METAL || t === MMETAL || P_SOLID[t] === 1 || (P_PERIODIC[t] === 1 && P_METALLIC[t] === 1);
    function unlight(i) { type[i] = EMPTY; flags[i] = 0; aux[i] = 0; data[i] = 0; col[i] = 0; charge[i] = 0; }
    function shine(j) {
      const t = type[j];
      if (t === BOUND) return;
      if (P_PHOS[t]) aux[j] = P_PHOS[t];
      else if (t === GLASS && aux[j] === EL_U) data[j] = 120;
      else if (P_SAP[t]) { if (sap[j] < 250) sap[j] += 5; if (t === PLANT && data[j] > 0 && rnd() < 0.3) growPlant(j); }
      temp[j] += 4;
    }
    function ray(i) {
      if (stamp[i] === now) return; // it moved here this tick
      if (--data[i] <= 0) { unlight(i); return; }
      let j = i;
      for (let s = 0; s < 3; s++) {
        const d = aux[j], n = j + RAY[d], nt = type[n];
        if (nt === EMPTY || nt === LIGHT) { swap(j, n); j = n; continue; }
        if (nt === BOUND) { unlight(j); return; }
        if (seeThrough(n)) {
          // through to the far side, taking stained glass's colour on the way
          let m = n, k = 0;
          for (; k < 48 && type[m] !== BOUND && seeThrough(m); k++, m += RAY[d]) if (type[m] === GLASS && GLASS_RGB[aux[m]]) col[j] = GLASS_RGB[aux[m]];
          if (type[m] === EMPTY) { swap(j, m); j = m; continue; }
          if (type[m] !== BOUND && k < 48) shine(m);
          unlight(j); return;
        }
        if (shiny(nt)) {
          // a bounce: off a flat face it flips the way the face looks; head on, straight back
          const dx = RDX[d], dy = RDY[d];
          let ndx = -dx, ndy = -dy;
          if (dx && dy) {
            const hb = type[j + dx] !== EMPTY, vb = type[j + dy * SW] !== EMPTY;
            if (hb !== vb) { ndx = hb ? -dx : dx; ndy = vb ? -dy : dy; }
          }
          for (let q = 0; q < 8; q++) if (RDX[q] === ndx && RDY[q] === ndy) { aux[j] = q; break; }
          continue;
        }
        shine(n); unlight(j); return;
      }
      stamp[j] = now;
    }

    // ───── people and animals ─────
    function open(j) { const t = type[j]; return t === EMPTY || (t !== BOUND && catOf(j) === C_GAS); }
    function hazardAt(j) {
      const t = type[j];
      if (t === FIRE || t === LAVA || t === PLASMA || t === EMBER || t === ACID || t === RAD || t === MMETAL || (flags[j] & BURN)) return true;
      // heat only scares what can touch it: hot air, or a hot surface; not rock warm deep down
      return temp[j] > 70 && (t === EMPTY || open(j - SW));
    }
    // Glance around for danger; returns -1 (flee left), 1 (flee right) or 0.
    function threat(i, r) {
      const x = cx(i), y = cy(i);
      for (let s = 0; s < 2; s++) {
        const dx = ((rnd() * (2 * r + 1)) | 0) - r, dy = ((rnd() * (2 * r + 1)) | 0) - r;
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
        if (hazardAt(idx(xx, yy))) return dx > 0 ? -1 : 1;
      }
      return 0;
    }

    function spawnHuman(i) {
      place(i, HUMAN); place(i - SW, HEAD);
    }

    // A human is two cells: a body (this one, which thinks) and a head above it.
    function human(i) {
      const h = i - SW;
      // body heat: people warm themselves back toward 37°C, so cold ground chills but doesn't kill;
      // fire and lava still overwhelm it
      temp[i] += (37 - temp[i]) * 0.05;
      if (type[h] === HEAD) temp[h] += (37 - temp[h]) * 0.05;
      if (type[h] !== HEAD) { transform(i, ASH); return; }
      const burning = flags[i] & BURN;
      if (!burning && ++data[i] > 36000 + shade[i] * 60) { transform(i, ASH); transform(h, ASH); return; }
      // breath (the head's data) runs out in ten seconds with the head under liquid, and in five
      // buried under sand or rubble with no air at all
      const choke = (type[h - SW] === CO2) + (type[h - 1] === CO2) + (type[h + 1] === CO2) >= 2;
      // drowning: liquid over the head, or no air touching the head at all while water is all
      // around (crowded against a flooded ceiling, people don't keep each other breathing)
      const wetAt = liquidAt;
      const airAt2 = (j) => { const t = type[j]; return t === EMPTY || (t !== BOUND && t !== CO2 && catOf(j) === C_GAS); };
      const breath = airAt2(h - SW) || airAt2(h - 1) || airAt2(h + 1);
      const flooded = wetAt(h - 1) || wetAt(h + 1) || wetAt(i - 1) || wetAt(i + 1) || wetAt(i + SW);
      const under = choke || wetAt(h - SW) || (!breath && flooded);
      const buried = !under && !breath && heavyAt(h - SW) && !airAt2(i - 1) && !airAt2(i + 1);
      if (under || buried) {
        if ((data[h] += buried ? 4 : 2) > 1200) { transform(i, ASH); transform(h, ASH); return; }
      } else if (data[h] > 0) data[h] -= 4;

      let panic = vy[i];
      let run = threat(i, 5);
      if (!run && rnd() < 0.3) { const hunter = spot(i, 8, WOLF, SHARK); if (hunter >= 0) run = cx(hunter) > cx(i) ? -1 : 1; }
      if (run) { panic = 110; aux[i] = (aux[i] & ~1) | (run > 0 ? 1 : 0); }
      if (burning) panic = 110;
      if (panic > 0) panic--;
      vy[i] = panic;

      const b = i + SW;
      if (open(b)) { swap(i, b); swap(h, i); return; } // fall
      if (!(aux[i] & SWIMS)) {
        // one who can't swim sinks, thrashing, and drowns on the bottom unless it is shallow
        if (wetAt(b) && rnd() < 0.3) { swap(i, b); swap(h, i); return; }
      } else if (wetAt(h - SW) && rnd() < 0.45) {
        // with water over their head they swim for the surface, pushing off the bottom if need be
        swap(h, h - SW); swap(i, h); return; // swim up
      }

      if (rnd() < (panic > 0 ? 0.75 : 0.22)) {
        const dir = aux[i] & 1 ? 1 : -1;
        const f = i + dir, fh = h + dir;
        if (hazardAt(f) || hazardAt(f + SW)) aux[i] ^= 1; // never step onto lava or fire
        else if (open(f) && open(fh)) {
          let drop = 0;
          while (drop < 6 && open(f + SW * (drop + 1))) drop++;
          // nobody walks off a cliff, even running from fire, or steps down into something burning
          if (drop >= 6 || hazardAt(f + SW * (drop + 1))) aux[i] ^= 1;
          else { swap(i, f); swap(h, fh); i = f; }
        } else if (!open(f) && open(fh) && open(fh - SW)) {
          swap(i, fh); swap(h, fh - SW); // step up a ledge
          i = fh;
        } else aux[i] ^= 1;
      }

      if (panic <= 0) {
        const bt = type[i + SW];
        if (rules.farming && rnd() < 0.0006 && (bt === DIRT || bt === SOIL || bt === MUD) && counts[PLANT] < 3000) {
          const s = i + (aux[i] & 1 ? -1 : 1);
          if (type[s] === EMPTY) { transform(s, SEED); aux[s] = 1; } // crops: plain plants
        }
        if (rnd() < 0.002) aux[i] ^= 1;
        if (rules.goalX >= 0 && rnd() < 0.02) { // travellers keep turning back toward where they are going
          const gx = rules.goalX, x = cx(i);
          if (Math.abs(gx - x) > 3) aux[i] = (aux[i] & ~1) | (gx > x ? 1 : 0);
        }
        if (rules.births && rnd() < 0.0004 && counts[HUMAN] < 80) {
          for (let k = -4; k <= 4; k++) {
            if (k === 0 || type[i + k] !== HUMAN) continue;
            const s = i - (aux[i] & 1 ? 1 : -1);
            if (open(s) && open(s - SW) && !open(s + SW)) spawnHuman(s);
            break;
          }
        }
      }
    }

    function bird(i) {
      const burning = flags[i] & BURN;
      if (!burning && ++data[i] > 30000 + shade[i] * 40) { transform(i, ASH); return; }
      if ((isWater(type[i + SW]) || isWater(type[i - SW])) && rnd() < 0.05) { transform(i, ASH); return; }
      if (smothered(i)) { transform(i, ASH); return; }
      const run = threat(i, 4);
      if (run) { vy[i] = 0; aux[i] = (aux[i] & ~1) | (run > 0 ? 1 : 0); }
      if (vy[i] > 0) { vy[i]--; return; } // perched
      if (rnd() < 0.6) {
        if (rnd() < 0.008) aux[i] ^= 1;
        const dir = aux[i] & 1 ? 1 : -1;
        let ground = 0;
        while (ground < 24 && type[i + SW * (ground + 1)] === EMPTY) ground++;
        let dy = 0;
        if (ground < 6 && !run) dy = rnd() < 0.7 ? -SW : 0;
        else if (ground >= 24) dy = rnd() < 0.4 ? SW : 0;
        else if (rnd() < 0.25) dy = rnd() < 0.5 ? -SW : SW;
        if (run) dy = -SW;
        if (cy(i) < 3) dy = SW;
        const j = i + dir + dy;
        if (type[j] === EMPTY) { swap(i, j); i = j; }
        else if (type[i + dir - SW] === EMPTY) { swap(i, i + dir - SW); i = i + dir - SW; }
        else aux[i] ^= 1;
      }
      const bt = type[i + SW];
      if ((bt === PLANT || bt === WOOD || bt === FLOWER) && rnd() < 0.03) vy[i] = 80 + rnd() * 300;
      const n = i + N8[(rnd() * 8) | 0];
      if (type[n] === SEED && rnd() < 0.2) transform(n, EMPTY);
      if (vy[i] > 0 && rnd() < 0.002 && counts[BIRD] < 50 && type[i - SW] === EMPTY) place(i - SW, BIRD);
    }

    function gripAt(m) {
      const t = type[m];
      if (t === BOUND) return true;
      if (t === EMPTY) return false;
      const c = catOf(m);
      return c === C_STATIC || c === C_POWDER;
    }
    // Ants dig downward, then haul each grain up and away before dropping it on open ground,
    // so tunnels go deep and spoil piles into a hill near the entrance.
    // aux: bit1 carrying, bit2 grain is sand, bits3-7 steps walked while carrying.
    const ANT_UP = [0, 4, 5], ANT_DOWN = [1, 6, 7];
    function ant(i) {
      const burning = flags[i] & BURN;
      if (!burning && ++data[i] > 20000 + shade[i] * 30) { transform(i, ASH); return; }
      if (isWater(type[i - SW]) && rnd() < 0.01) { transform(i, ASH); return; }
      let grip = false;
      for (let k = 0; k < 8; k++) if (gripAt(i + N8[k])) { grip = true; break; }
      if (!grip) { movePowder(i, ANT); return; }
      const sn = i + N8[(rnd() * 8) | 0];
      if (type[sn] === SUGAR && rnd() < 0.02) { // a crumb of sugar: food for the nest
        if (counts[ANT] < 200 && rnd() < 0.25) place(sn, ANT); else transform(sn, EMPTY);
      }
      const carrying = aux[i] & 2;
      if (rnd() < 0.5) {
        const r = rnd();
        const k = carrying && r < 0.55 ? ANT_UP[(rnd() * 3) | 0]
          : !carrying && r < 0.5 ? ANT_DOWN[(rnd() * 3) | 0] : (rnd() * 8) | 0;
        const j = i + N8[k], jt = type[j];
        if (jt === EMPTY) {
          let ok = false;
          for (let q = 0; q < 8; q++) { const m = j + N8[q]; if (m !== i && gripAt(m)) { ok = true; break; } }
          if (ok) {
            swap(i, j); i = j;
            if (carrying && aux[i] < 248) aux[i] += 8;
          }
        } else if (!carrying && k !== 0 && k !== 4 && k !== 5 && (jt === DIRT || jt === SAND || jt === MUD) && rnd() < 0.12) {
          // dig sideways or down: pick up the grain and step into the space it leaves
          transform(j, EMPTY);
          swap(i, j); i = j;
          aux[i] = 2 | (jt === SAND ? 4 : 0);
        }
      }
      if ((aux[i] & 2) && (aux[i] >> 3) >= 10 && rnd() < 0.1) {
        let sky = 0;
        while (sky < 6 && type[i - SW * (sky + 1)] === EMPTY) sky++;
        if (sky >= 6) { transform(i - SW, aux[i] & 4 ? SAND : DIRT); aux[i] = 0; } // add to the anthill
      }
      if (rnd() < 0.0003 && counts[ANT] < 200) {
        const j = i + N8[(rnd() * 8) | 0];
        if (type[j] === EMPTY) place(j, ANT);
      }
    }

    // ───── weather ─────
    // Modes: natural (clouds only form from rising vapour), clear, cloudy, rain, storm, snow,
    // blizzard, fog, heatwave. Weather modes keep the sky stocked with their kind of cloud;
    // clouds that don't belong to the current weather slowly break up.
    const COVER = { natural: 0, clear: 0, cloudy: 0.22, rain: 0.32, storm: 0.42, snow: 0.32, blizzard: 0.45, fog: 0, heatwave: 0 };

    function cloudFor(mode) {
      if (mode === 'cloudy') return CLOUD;
      if (mode === 'storm') return ambient <= 0 ? SNOWCLOUD : STORMCLOUD;
      if (mode === 'snow' || mode === 'blizzard') return SNOWCLOUD;
      if (mode === 'rain') return ambient <= 0 ? SNOWCLOUD : RAINCLOUD;
      return 0;
    }

    function puff(x0, y0, rx, ry, t) {
      for (let dy = -ry; dy <= ry; dy++) {
        const y = y0 + dy;
        if (y < 0 || y >= H) continue;
        for (let dx = -rx; dx <= rx; dx++) {
          const x = x0 + dx;
          if (x < 0 || x >= W) continue;
          const f = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
          if (f > 1 - rnd() * 0.35) continue;
          const i = idx(x, y);
          if (type[i] !== EMPTY) continue;
          place(i, t); aux[i] = 200;
        }
      }
    }

    // Wind carries every cloud and fog bank along together: walk each row from the downwind
    // side so a whole cloud shifts one cell, and anything pushed off the edge is gone.
    function windPass(dir) {
      const yMax = H;
      for (let y = 0; y < yMax; y++) {
        const row = (y + 1) * SW;
        if (dir > 0) {
          for (let x = W; x >= 1; x--) {
            const i = row + x, t = type[i];
            if (!IS_CLOUD[t] && t !== FOG) continue;
            const j = i + 1, jt = type[j];
            if (jt === EMPTY) swap(i, j);
            else if (jt === BOUND) transform(i, EMPTY);
          }
        } else {
          for (let x = 1; x <= W; x++) {
            const i = row + x, t = type[i];
            if (!IS_CLOUD[t] && t !== FOG) continue;
            const j = i - 1, jt = type[j];
            if (jt === EMPTY) swap(i, j);
            else if (jt === BOUND) transform(i, EMPTY);
          }
        }
      }
    }

    function weatherTick() {
      const wind = weather.wind;
      if (wind && rnd() < Math.abs(wind) * 0.08) windPass(wind > 0 ? 1 : -1);
      const mode = weather.mode;
      const want = COVER[mode] || 0;
      if (want > 0 && (tick & 3) === 0) {
        const band = Math.max(8, (H * 0.16) | 0);
        const have = counts[CLOUD] + counts[RAINCLOUD] + counts[STORMCLOUD] + counts[SNOWCLOUD];
        if (have < want * W * band && rnd() < 0.6) {
          const t = cloudFor(mode);
          if (t) puff((rnd() * W) | 0, 2 + ((rnd() * band * 0.55) | 0), 4 + ((rnd() * 6) | 0), 2 + ((rnd() * 2) | 0), t);
        }
      }
      if (mode === 'fog' && counts[FOG] < W * 7 && (tick & 1) === 0) {
        // fog rises off the ground and water: find the surface under a random column
        const x = (rnd() * W) | 0;
        let y = 0;
        while (y < H && type[idx(x, y)] === EMPTY) y++;
        for (let k = 1; k <= 3; k++) {
          const yy = y - k - ((rnd() * 4) | 0);
          if (yy >= 0) { const i = idx(x, yy); if (type[i] === EMPTY) { place(i, FOG); temp[i] = ambient; } }
        }
      }
    }

    // Clouds drift with the wind, billow a little, and drop whatever the air temperature allows.
    function cloud(i, t) {
      // acid rain: smoke drifting into a cloud dissolves into its droplets
      if (rnd() < 0.004) {
        const n = i + N8[(rnd() * 8) | 0];
        if (type[n] === SMOKE) { transform(n, EMPTY); transform(i, ACID); return; }
      }
      if (rnd() < 0.03) { // billow
        const j = i + N8[(rnd() * 8) | 0];
        if (type[j] === EMPTY && cy(j) < H * 0.5) { swap(i, j); i = j; }
      }
      const mode = weather.mode;
      const natural = mode === 'natural';
      if (!natural && t !== cloudFor(mode) && rnd() < (mode === 'clear' || mode === 'heatwave' ? 0.01 : 0.002)) {
        transform(i, EMPTY); return; // breaks up: it isn't this weather's kind of cloud
      }
      if (natural && (tick + i) % 50 === 0) {
        let c = 0;
        for (let k = 0; k < 8; k++) if (IS_CLOUD[type[i + N8[k]]]) c++;
        if (c <= 1 && ambient > 0 && rnd() < 0.04) { transform(i, EMPTY); return; } // lone wisps evaporate
        if (t === CLOUD && c >= 7 && rnd() < 0.15) { transform(i, ambient <= 0 ? SNOWCLOUD : RAINCLOUD); aux[i] = 80; return; }
        if (t === RAINCLOUD && c >= 8 && rnd() < 0.03) { transform(i, STORMCLOUD); aux[i] = 120; return; }
      }
      const b = i + SW;
      if (type[b] !== EMPTY) return; // only the underside of a cloud drops anything
      let p = 0, drop = WATER;
      if (t === RAINCLOUD) p = 0.02;
      else if (t === STORMCLOUD) p = 0.04;
      else if (t === SNOWCLOUD) { p = 0.015; drop = SNOW; }
      if (t === STORMCLOUD) {
        if (rnd() < 0.00005) { spawnBolt(cx(i), cy(i) + 1, true); return; }
        if (ambient < 12 && rnd() < 0.2) drop = HAIL;
      }
      if (drop === WATER && ambient <= 0) drop = SNOW;
      if (p && rnd() < p) {
        place(b, drop);
        if (!disc[drop]) discover(drop, b); // hail from a storm in cool air
        if (drop === WATER) temp[b] = Math.max(1, ambient);
        if (natural) { // a natural cloud wrings itself out
          if (aux[i] > 0) aux[i]--;
          else transform(i, CLOUD);
        }
      }
    }

    // Fog billowing out of the water above a submerged lump of dry ice.
    function fogAbove(i) {
      let j = i - SW;
      for (let k = 0; k < 16; k++, j -= SW) {
        const t = type[j];
        if (t === BOUND) return;
        if (t === EMPTY) {
          place(j, FOG); temp[j] = -10;
          const s = j - SW;
          if (type[s] === EMPTY) { place(s, FOG); temp[s] = -10; }
          return;
        }
      }
    }

    // ───── movement ─────
    const sround = (v) => Math.floor(v + rnd()); // rounds at random: 0.3 is one step 30% of the time

    // Could something of density `dens` move into j? A negative density is a gas, which only
    // moves into empty space. Sets `wet` when the way lies through a lighter liquid.
    let wet = false;
    function enter(j, dens) {
      const t = type[j];
      if (t === EMPTY) return true;
      if (dens < 0 || t === BOUND) return false;
      const c = catOf(j);
      if (c === C_GAS) return true;
      if (c === C_LIQUID && densOf(j) < dens) { wet = true; return true; }
      return false;
    }

    // Move the particle at i by up to (dx, dy) cells along a straight line, one step at a time,
    // until something stops it. Returns the cell it ends in; hitX / hitY say which way it was
    // stopped, and hitJ is what stopped it sideways.
    let hitX = false, hitY = false, hitJ = 0;
    function glide(i, dx, dy, dens) {
      hitX = false; hitY = false; wet = false;
      const mx = dx < 0 ? -dx : dx, my = dy < 0 ? -dy : dy, n = mx > my ? mx : my;
      let cur = i, px = 0, py = 0;
      for (let s = 1; s <= n; s++) {
        if (!hitX) {
          const tx = Math.round((dx * s) / n);
          if (tx !== px) {
            const j = cur + tx - px;
            if (enter(j, dens)) { swap(cur, j); cur = j; px = tx; } else { hitX = true; hitJ = j; }
          }
        }
        if (!hitY) {
          const ty = Math.round((dy * s) / n);
          if (ty !== py) {
            const j = cur + (ty - py) * SW;
            if (enter(j, dens)) { swap(cur, j); cur = j; py = ty; } else hitY = true;
          }
        }
        if (hitX && hitY) break;
      }
      return cur;
    }

    // The moving air drags on what sits at i: returns its new sideways speed and adds the
    // vertical push to vy[i]. Light grains feel it far more than heavy ones.
    function airPush(i, t, ux) {
      const a = AIRMAP[i], ax = avx[a], ay = avy[a];
      if (ax < AIR_FELT && ax > -AIR_FELT && ay < AIR_FELT && ay > -AIR_FELT) return ux;
      const k = P_ADRAG[t];
      vy[i] += ay * k;
      return ux + (ax - ux) * k;
    }

    // Air acts on a liquid where the two meet, and in inverse proportion to the liquid's density
    // (a = F / m: oil is shoved about, water less, mercury barely stirs). The wind drags its
    // surface along, and a difference in pressure pushes it from high to low (a = -∇p / ρ), so a
    // blast's pulse dents a pond and sends waves out across it. Deeper in, the liquid passes the
    // push on itself (see collide()). Returns the new sideways speed and adds the rest to vy[i].
    function airOnLiquid(i, ux) {
      const a = AIRMAP[i], p = ap[a], ax = avx[a], ay = avy[a];
      const windy = ax > AIR_FELT || ax < -AIR_FELT || ay > AIR_FELT || ay < -AIR_FELT;
      if (!windy && p < 0.2 && p > -0.2) return ux;
      if (!open(i - SW) && !open(i - 1) && !open(i + 1) && !open(i + SW)) return ux;
      const inv = 1 / densOf(i);
      let fx = 0, fy = 0;
      if (windy) { const k = Math.min(0.1, 0.4 * inv); fx = (ax - ux) * k; fy = ay * k; }
      const x = a % AW, y = (a - x) / AW;
      const pl = x > 0 && !ablk[a - 1] ? ap[a - 1] : p, pr = x < AW - 1 && !ablk[a + 1] ? ap[a + 1] : p;
      const pu = y > 0 && !ablk[a - AW] ? ap[a - AW] : p, pd = y < AH - 1 && !ablk[a + AW] ? ap[a + AW] : p;
      // a liquid is hundreds of times denser than air: the gentle pressure differences that make
      // warm air rise don't stir it, only a shock does (anything weaker than PRES_MIN is ignored)
      const g = PRES_K * inv, gx = pl - pr, gy = pu - pd;
      if (gx > PRES_MIN) fx += (gx - PRES_MIN) * g; else if (gx < -PRES_MIN) fx += (gx + PRES_MIN) * g;
      if (gy > PRES_MIN) fy += (gy - PRES_MIN) * g; else if (gy < -PRES_MIN) fy += (gy + PRES_MIN) * g;
      // pressed down onto more liquid, it can't sink: it flows out sideways instead
      if (fy > 0 && !open(i + SW)) { fx += (fx > 0 || (fx === 0 && rnd() < 0.5) ? fy : -fy) * 0.7; fy = 0; }
      vy[i] += fy;
      return ux + fx;
    }

    // A gas goes where the air takes it. Returns true if it was carried.
    function airGas(i) {
      const a = AIRMAP[i], ax = avx[a], ay = avy[a];
      if (ax < AIR_FELT && ax > -AIR_FELT && ay < AIR_FELT && ay > -AIR_FELT) return false;
      const dx = sround(ax), dy = sround(ay);
      return (dx !== 0 || dy !== 0) && glide(i, dx, dy, -1) !== i;
    }

    // A grain or drop in flight, thrown by a blast or blown by the air: it keeps its sideways
    // speed, falls under gravity and skids to a stop once it lands.
    function fly(i, t, dens, ux) {
      let v = vy[i] + GRAV;
      if (v > MAXV) v = MAXV; else if (v < -MAXV) v = -MAXV;
      if (ux > MAXV) ux = MAXV; else if (ux < -MAXV) ux = -MAXV;
      const j = glide(i, sround(ux), v >= 0 ? 1 + (v | 0) : sround(v), dens);
      if (wet) { ux *= 0.5; if (v > 0.5) v = 0.5; } // a liquid soaks up the throw
      if (hitY) v = 0;
      if (hitX) {
        // loose grains and liquid in the way take a share of the push, so a blast scatters a
        // whole heap; anything fixed throws it back
        const f = hitJ, ft = type[f], fc = ft === BOUND ? C_STATIC : catOf(f);
        if (fc === C_LIQUID || (fc === C_POWDER && !(ft === DIRT && (flags[f] & SETTLED)))) {
          ux = (ux + vx[f]) * 0.5; vx[f] = ux;
          if (fc === C_POWDER) flags[f] &= ~SETTLED;
        } else ux *= -0.3;
      }
      ux *= canEnter(dens, j + SW) ? 0.99 : P_FRIC[t];
      if (ux < MINVX && ux > -MINVX) ux = 0;
      vx[j] = ux; vy[j] = v;
      if (j !== i) flags[j] &= ~SETTLED;
    }

    // A grounded liquid with sideways momentum ran into the cell beside it (j = i + dir). Liquid
    // there shares the push, so a surge carries a pool along with it, unless this water is the
    // faster and rides up over it as a breaking crest. Loose grains are swept along; a wall or
    // a hut throws the water upward. Returns true if it moved.
    function collide(i, dens, dir, ux) {
      const j = i + dir, ft = type[j], fc = ft === BOUND ? C_STATIC : catOf(j);
      const speed = ux * dir;
      if (fc === C_LIQUID) {
        if (speed > vx[j] * dir + 1 && type[i - SW] === EMPTY && type[j - SW] === EMPTY) {
          swap(i, j - SW);
          return true;
        }
        const m = (vx[j] + ux) * 0.5;
        vx[j] = m; vx[i] = m;
      } else if (fc === C_POWDER && speed > 1.5 && !(ft === DIRT && (flags[j] & SETTLED))) {
        vx[j] += ux * 0.5;
        if (vy[j] > -1) vy[j] -= 0.8;
        flags[j] &= ~SETTLED;
        vx[i] = ux * 0.5;
      } else if (speed > 0.8 && enter(i - SW, dens)) {
        vy[i] = -speed * 0.9; vx[i] = ux * 0.3;
        return true; // it climbs from here next tick
      } else vx[i] = ux * -0.3;
      return false;
    }

    // Which way a landing mass of liquid spills: toward the nearer open space along its row, or
    // away from the wall if there is one on only one side.
    function spillDir(i, dens) {
      let l = true, r = true;
      for (let k = 1; k <= 32 && (l || r); k++) {
        if (l) {
          const j = i - k;
          if (canEnter(dens, j)) { if (!r || !canEnter(dens, i + k)) return -1; break; }
          if (type[j] === BOUND || catOf(j) !== C_LIQUID) l = false;
        }
        if (r) {
          const j = i + k;
          if (canEnter(dens, j)) return 1;
          if (type[j] === BOUND || catOf(j) !== C_LIQUID) r = false;
        }
      }
      return l === r ? (rnd() < 0.5 ? -1 : 1) : l ? -1 : 1;
    }

    function movePowder(i, t) {
      const dens = P_DENS[t];
      // Packed soil is cohesive: held from both sides it arches over gaps and it never crumbles
      // sideways, so tunnels and cliffs stand. Loose dirt still piles like any powder.
      const packed = t === DIRT && (flags[i] & SETTLED);
      if (packed && gripAt(i - 1) && gripAt(i + 1)) return;
      let ux = vx[i];
      if (P_ADRAG[t]) ux = airPush(i, t, ux);
      if (ux > MINVX || ux < -MINVX || vy[i] + GRAV < 0) { fly(i, t, dens, ux); return; }
      if (vx[i] !== 0) vx[i] = 0;
      let v = vy[i] + GRAV;
      if (v > MAXV) v = MAXV;
      let steps = 1 + (v | 0), cur = i, moved = false;
      while (steps-- > 0) {
        const b = cur + SW, bt = type[b];
        const bc = bt === EMPTY ? C_GAS : bt === BOUND ? C_STATIC : catOf(b);
        if (bc === C_GAS) { swap(cur, b); cur = b; moved = true; }
        else if (bc === C_LIQUID && densOf(b) < dens) {
          if (rnd() < 0.5) { swap(cur, b); cur = b; moved = true; }
          v = 0.5;
          break;
        } else break;
      }
      if (moved) { vy[cur] = v; flags[cur] &= ~SETTLED; return; }
      vy[i] = 0;
      if (packed) return;
      const d = rnd() < 0.5 ? -1 : 1;
      const a = canEnter(dens, i + SW + d), b = canEnter(dens, i + SW - d);
      if (!a && !b) { flags[i] |= SETTLED; return; } // stable: nowhere left to roll
      if (rnd() >= P_SLIDE[t]) return;
      if (a) swap(i, i + SW + d);
      else swap(i, i + SW - d);
    }

    function moveLiquid(i, t) {
      const visc = P_VISC[t];
      if (visc < 1 && rnd() > visc) return;
      // molten glass is honey-thick and cohesive: held by its neighbours it sags slowly as one mass
      if (t === MGLASS && type[i - 1] === MGLASS && type[i + 1] === MGLASS && rnd() < 0.85) return;
      const dens = P_DENS[t];
      let ux = airOnLiquid(i, vx[i]);
      let moving = ux > MINVX || ux < -MINVX;
      // airborne with momentum (spray, a crest over a ledge) it flies; otherwise it pours
      if (vy[i] + GRAV < 0 || (moving && canEnter(dens, i + SW))) { fly(i, t, dens, ux); return; }
      let v = vy[i] + GRAV;
      if (v > MAXV) v = MAXV;
      let steps = 1 + (v | 0), cur = i, moved = false;
      while (steps-- > 0) {
        const b = cur + SW, bt = type[b];
        const bc = bt === EMPTY ? C_GAS : bt === BOUND ? C_STATIC : catOf(b);
        if (bc === C_GAS) { swap(cur, b); cur = b; moved = true; }
        else if (bc === C_LIQUID && densOf(b) < dens) {
          if (rnd() < 0.35) { swap(cur, b); cur = b; moved = true; }
          v = 0;
          break;
        } else break;
      }
      if (moved) { vy[cur] = v; return; }
      if (t === NITRO && vy[i] > 2.4 && !(flags[i] & BURN)) { flags[i] |= BURN; data[i] = 1; return; }
      // a falling mass that hits the ground surges outward as a wave (a lone drop just lands)
      const fall = vy[i];
      vy[i] = 0;
      if (fall > SPLASH_V && P_SPLASH[t] && type[i - SW] !== BOUND && catOf(i - SW) === C_LIQUID) {
        ux += spillDir(i, dens) * fall * P_SPLASH[t];
        moving = true;
      }
      // On the ground it rolls downhill or spreads along the surface. Momentum picks the way
      // (mostly) and stretches the reach, so a surge runs on as one body instead of just levelling.
      let d, D = P_DISP[t];
      if (moving) {
        const dir = ux < 0 ? -1 : 1, speed = ux * dir;
        vx[i] = ux;
        if (!canEnter(dens, i + dir) && collide(i, dens, dir, ux)) return;
        ux = vx[i] * P_FRIC[t];
        vx[i] = ux < MINVX && ux > -MINVX ? 0 : ux;
        d = rnd() < 0.5 + speed * 0.5 ? dir : -dir;
        D += sround(speed * 0.6);
      } else {
        // too slow to move yet, but a push keeps building up while it lasts; once nothing pushes,
        // a leftover drift too small to move it simply stops
        if (ux !== 0) { const u = ux * P_FRIC[t]; vx[i] = ux !== vx[i] || u > 0.02 || u < -0.02 ? u : 0; }
        d = rnd() < 0.5 ? -1 : 1;
      }
      if (canEnter(dens, i + SW + d)) { swap(i, i + SW + d); return; }
      if (canEnter(dens, i + SW - d)) { swap(i, i + SW - d); return; }
      for (let pass = 0; pass < 2; pass++, d = -d) {
        let last = -1;
        for (let k = 1; k <= D; k++) {
          const j = i + d * k, jt = type[j];
          if (jt === EMPTY || (jt !== BOUND && catOf(j) === C_GAS)) {
            last = j;
            if (type[j + SW] === EMPTY) break; // stop at a ledge and fall from there
          } else break;
        }
        if (last >= 0) { swap(i, last); return; }
      }
    }

    // A sideways step biased by the wind (-1 or 1).
    function drift() { return rnd() < 0.5 + weather.wind * 0.15 ? 1 : -1; }

    function moveGas(i, t) {
      if (airGas(i)) return;
      const r = rnd();
      if (r < 0.2 + Math.abs(weather.wind) * 0.08) {
        const j = i + drift();
        if (type[j] === EMPTY) { swap(i, j); return; }
      }
      const u = i - SW, ut = type[u];
      if (ut === EMPTY) { swap(i, u); return; }
      if (ut !== t && ut !== BOUND && catOf(u) === C_GAS && densOf(u) > P_DENS[t] && rnd() < 0.5) { swap(i, u); return; }
      const d = rnd() < 0.5 ? -1 : 1;
      if (type[u + d] === EMPTY) { swap(i, u + d); return; }
      if (type[u - d] === EMPTY) { swap(i, u - d); return; }
      if (type[i + d] === EMPTY) swap(i, i + d);
    }

    // Periodic gases rise or sink by their real density against air: hydrogen shoots up,
    // nitrogen drifts, xenon and radon pool on the floor. Anything very hot rises.
    function moveGasP(i, t) {
      if (airGas(i)) return;
      let B = P_BUOY[t];
      if (temp[i] > 300) B = Math.min(1, B + 0.5);
      const dens = P_GDENS[t];
      const r = rnd();
      if (r < 0.2 + Math.abs(weather.wind) * 0.08) {
        const j = i + drift();
        if (type[j] === EMPTY) { swap(i, j); return; }
      }
      const v = rnd() < Math.abs(B) ? (B > 0 ? -SW : SW) : rnd() < 0.5 ? -SW : SW;
      const j = i + v, jt = type[j];
      if (jt === EMPTY) { swap(i, j); return; }
      if (jt !== t && jt !== BOUND && catOf(j) === C_GAS) {
        const dj = densOf(j);
        if (((v < 0 && dj > dens) || (v > 0 && dj < dens)) && rnd() < 0.5) { swap(i, j); return; }
      }
      const d = rnd() < 0.5 ? -1 : 1;
      if (type[j + d] === EMPTY) { swap(i, j + d); return; }
      if (type[i + d] === EMPTY) swap(i, i + d);
    }

    function moveFire(i) {
      if (airGas(i)) return;
      const r = rnd();
      let j = r < 0.5 ? i - SW : r < 0.7 ? i - SW - 1 : r < 0.9 ? i - SW + 1 : i + (r < 0.95 ? -1 : 1);
      // wind leans the flames, so a grass fire runs downwind
      const wind = weather.wind;
      if (wind && rnd() < Math.abs(wind) * 0.2) j = i + (wind > 0 ? 1 : -1) - (rnd() < 0.5 ? SW : 0);
      const jt = type[j];
      if (jt === EMPTY || (jt !== FIRE && jt !== PLASMA && jt !== BOUND && catOf(j) === C_GAS)) swap(i, j);
    }

    // ───── per-cell update ─────
    function update(i, t) {
      if (flags[i] & HELD) {
        if (!hand.on) flags[i] &= ~HELD; // left over from a hand already let go
        else if (t === HUMAN || t === HEAD) return; // a person dangling from the hand
        else { const c = catOf(i); if (c === C_POWDER || c === C_LIQUID) return; } // the hand moves it
      }
      if (flags[i] & FISSION) { fission(i); return; }
      const T = temp[i];

      // 1. phase changes
      if (T > P_HI_T[t]) {
        if (rnd() < P_HI_P[t]) {
          if (t === MUD) {
            transform(i, CLAY);
            const s = emitInto(i, STEAM);
            if (s >= 0) temp[s] = 105;
            return;
          }
          if (t === SALTWATER) {
            transform(i, SALT);
            const s = emitInto(i, STEAM);
            if (s >= 0) temp[s] = 110;
            events.sizzle++;
            return;
          }
          if (t === WOOD || t === COAL || t === EL_C) {
            // wood chars to coal, coal (or carbon) compresses to diamond — but only when sealed from air
            if (!hasAir(i)) { transform(i, t === WOOD ? COAL : DIAMOND); return; }
          } else {
            const to = P_HI_TO[t];
            if (to === STEAM) events.sizzle++;
            const tint = t === GLASS || t === SHARDS ? aux[i] : 0; // stained glass keeps its colour when it melts, as shards too
            transform(i, to);
            if (tint && to === MGLASS) aux[i] = tint;
            return;
          }
        }
      } else if (T < P_LO_T[t]) {
        if (rnd() < P_LO_P[t]) {
          if (t === STEAM) {
            // vapour that cools high in the sky condenses into cloud; lower down it just rains back
            if (T < 0) transform(i, SNOW);
            else if (cy(i) < H * 0.3) { transform(i, CLOUD); aux[i] = 60; }
            else transform(i, WATER);
          } else {
            const tint = t === MGLASS ? aux[i] : 0; // and keeps it when it sets again
            transform(i, P_LO_TO[t]);
            if (tint) aux[i] = tint;
          }
          return;
        }
      }

      // 2. combustion
      if (flags[i] & BURN) {
        if (burn(i, t)) return;
      } else if (T > P_IGN[t]) {
        if (!P_NEEDAIR[t] || hasAir(i)) {
          ignite(i);
          for (let k = 0; k < 8; k++) { const f = flags[i + N8[k]] & DYE; if (f) { dye(i, f); break; } } // lit by a coloured blaze's heat, it burns in its colour
        }
      }

      // 3. electricity
      if (charge[i]) electric(i, t);

      // 4. contact reactions
      if (P_HASRX[t]) {
        const n = i + N8[(rnd() * 8) | 0];
        const r = RX[t * NT + type[n]];
        if (r && rnd() < RXP[r]) {
          const a = RXA[r], b = RXB[r];
          if (RXE[r] === EV_SIZZLE) events.sizzle++;
          // molten glass quenched by water sets into glass of its own colour
          if (b !== KEEP) { const tn = type[n] === MGLASS ? aux[n] : 0; transform(n, b); if (tn && b === GLASS) aux[n] = tn; }
          if (a !== KEEP) { const ti = t === MGLASS ? aux[i] : 0; transform(i, a); if (ti && a === GLASS) aux[i] = ti; return; }
        }
      }

      // 5. element behaviour
      if ((P_SAP[t] || (t === WOOD && (flags[i] & LEAF))) && !(flags[i] & BURN) && ((tick + i) & 7) === 0 && thirst(i, t)) return;
      switch (t) {
        case FIRE: {
          if (--data[i] <= 0) {
            const f = flags[i];
            if (f & SMOKE_NONE) transform(i, EMPTY);
            else {
              transform(i, rnd() < 0.35 ? SMOKE : EMPTY);
              if (f & SMOKE_WHITE && type[i] === SMOKE) aux[i] = 1;
            }
            return;
          }
          if (temp[i] < 650) temp[i] = 650 + rnd() * 250;
          const n = i + N8[(rnd() * 8) | 0], nt = type[n];
          if (P_FLAM[nt] > 0 && !(flags[n] & BURN) && rnd() < P_FLAM[nt] * 0.25) { ignite(n); dye(n, flags[i]); }
          // flame test: a pinch of a flame-colouring element tints the fire that licks it, and the
          // tint rises through the flame. Sodium's yellow swamps the others, as in a real flame.
          if (P_FLAME[nt] && !P_EXPL_R[nt]) { if (!aux[i] || nt === EL_NA) aux[i] = nt; }
          else if (nt === FIRE && !aux[i] && aux[n] && rnd() < 0.7) aux[i] = aux[n];
          moveFire(i);
          return;
        }
        case SMOKE:
          // soot settles out; what is left is carbon dioxide, which sinks
          if (--data[i] <= 0) { transform(i, rnd() < 0.15 ? CO2 : EMPTY); return; }
          break;
        case CLOUD: case RAINCLOUD: case STORMCLOUD: case SNOWCLOUD:
          cloud(i, t);
          return;
        case FOG: {
          let d = --data[i];
          if (temp[i] > 18) d = data[i] -= 3; // burns off in warm air
          if (d <= 0) { transform(i, EMPTY); return; }
          if (rnd() < 0.5) moveGasP(i, t);
          return;
        }
        case CO2:
          if (rnd() < 0.002) { transform(i, EMPTY); return; } // mixes away into the air
          if (T < -78.5 && rnd() < 0.05) { transform(i, DRYICE); return; }
          moveGasP(i, t);
          return;
        case FOAM:
          if (--data[i] <= 0 || T > 60) { transform(i, rnd() < 0.15 ? WATER : EMPTY); return; }
          if (rnd() < 0.3) moveGasP(i, t);
          return;
        case DRYICE: {
          // sublimes straight to gas; while it does, it stays pinned at −78.5°C (latent heat)
          if (T > -78.5) {
            temp[i] = -78.5;
            const n = i + N8[(rnd() * 8) | 0];
            const wet = isWater(type[n]);
            const exposed = type[i - SW] === EMPTY || type[i - 1] === EMPTY || type[i + 1] === EMPTY;
            if (rnd() < (wet ? 0.08 : Math.min(0.2, (T + 78.5) / 500 + (exposed ? 0.004 : 0)))) {
              transform(i, CO2); temp[i] = -60;
              if (wet) fogAbove(i); else { const f = emitInto(i, FOG); if (f >= 0) temp[f] = -10; }
              return;
            }
          }
          if (rnd() < 0.015) { const f = emitInto(i, FOG); if (f >= 0) temp[f] = -10; }
          break;
        }
        case CRYO:
          if (rnd() < 0.01) { const f = emitInto(i, FOG); if (f >= 0) temp[f] = -20; }
          break;
        case HAIL:
          if (weather.wind && rnd() < Math.abs(weather.wind) * 0.1) { const j = i + drift(); if (type[j] === EMPTY) { swap(i, j); return; } }
          break;
        case MGLASS:
          // a stain spreads through the melt as it is stirred; a second colour mottles the first
          if (aux[i] && rnd() < 0.1) {
            const n = i + N8[(rnd() * 8) | 0];
            if (type[n] === MGLASS && aux[n] !== aux[i] && (!aux[n] || rnd() < 0.1)) aux[n] = aux[i];
          }
          break;
        case GLASS:
          if (data[i] > 0) data[i]--; // uranium glass fading after radiation lit it
          break;
        case MSPARK: {
          // a burning fleck of metal: it lights fuel it touches, dies in water and fades once it lands
          let d = --data[i];
          if (vy[i] === 0 && vx[i] === 0) d = data[i] -= 2;
          if (d <= 0) { transform(i, EMPTY); return; }
          if (temp[i] < 900) temp[i] = 900;
          const n = i + N8[(rnd() * 8) | 0], nt = type[n];
          if (isWater(nt)) { transform(i, EMPTY); events.sizzle++; return; }
          if (P_FLAM[nt] > 0 && !(flags[n] & BURN) && rnd() < P_FLAM[nt] * 0.4 && (!P_NEEDAIR[nt] || hasAir(n))) ignite(n);
          break; // then it flies on its own momentum (see movePowder)
        }
        case PLASMA: {
          if (--data[i] <= 0) { transform(i, rnd() < 0.25 ? FIRE : EMPTY); return; }
          if (temp[i] < 2500) temp[i] = 2500;
          const n = i + N8[(rnd() * 8) | 0], nt = type[n];
          if (P_FLAM[nt] > 0 && !(flags[n] & BURN)) ignite(n);
          if (rnd() < 0.3) moveGas(i, t);
          return;
        }
        case EMBER: {
          if (--data[i] <= 0) { transform(i, ASH); return; }
          if (temp[i] < 450) temp[i] = 450 + rnd() * 150;
          const n = i + N8[(rnd() * 8) | 0], nt = type[n];
          if (P_FLAM[nt] > 0 && !(flags[n] & BURN) && rnd() < P_FLAM[nt] * 0.05) {
            if (!P_NEEDAIR[nt] || hasAir(n)) ignite(n);
          }
          break;
        }
        case SPARK: {
          for (let k = 0; k < 8; k++) {
            const n = i + N8[k], nt = type[n];
            if (P_CONDUCT[nt]) energize(n);
            else if (nt !== EMPTY && nt !== BOUND && nt !== SPARK) zap(n, nt);
          }
          if (--data[i] <= 0) transform(i, EMPTY);
          return;
        }
        case STEAM: {
          if (rnd() < 0.002) cloudCheck(i);
          // acid rain: smoke drifting into a cooled cloud (fresh steam over a fire is too hot)
          if (T < 95 && rnd() < 0.002) {
            const n = i + N8[(rnd() * 8) | 0];
            if (type[n] === SMOKE && rnd() < 0.25) { transform(n, EMPTY); transform(i, ACID); return; }
          }
          break;
        }
        case LAVA:
          // geothermal: lava resting on the world's floor stays molten, but never hot enough to melt stone;
          // so does deep magma (CENTER: the Volcano scene's pipe and lake) until it meets the open air
          if (flags[i] & CENTER) {
            for (let k = 0; k < 4; k++) { const n = i + N4[k]; if (type[n] === EMPTY || catOf(n) === C_GAS) { flags[i] &= ~CENTER; break; } }
          }
          if ((type[i + SW] === BOUND || (flags[i] & CENTER)) && temp[i] < 1080) temp[i] = 1080;
          if (rnd() < 0.0015 && type[i - SW] === EMPTY) transform(i - SW, rnd() < 0.6 ? SMOKE : FIRE);
          break;
        case WATER:
        case SALTWATER: {
          if (aux[i]) aux[i]--; // the blue Cherenkov glow of a reactor pool, fading
          // convection: warmer water rises through cooler water
          const u = i - SW;
          if (type[u] === t && temp[i] > temp[u] + 6 && rnd() < 0.3) { swap(i, u); return; }
          // evaporation from an open surface, faster in warm air (sea water leaves its salt behind)
          if (type[u] === EMPTY && ambient > 0 && rnd() < ambient * 0.000015) {
            if (t === SALTWATER) { transform(i, SALT); transform(u, STEAM); temp[u] = 100; }
            else { transform(i, STEAM); temp[i] = 100; }
            return;
          }
          break;
        }
        case SNOW:
          if (weather.wind && rnd() < Math.abs(weather.wind) * 0.15) { const j = i + drift(); if (type[j] === EMPTY) { swap(i, j); return; } }
          if (rnd() < 0.5) return; // drifts down slowly
          break;
        case SEED: { // aux 1: a plain plant's seed (a farmer's, or a Plant painted over bare ground); else a flower's
          const bt = type[i + SW];
          // a flower's seed sunk in a pond grows into a water lily instead
          if (!aux[i] && (isWater(type[i - SW]) || isWater(type[i + SW])) && rnd() < 0.004) { transform(i, LILYSEED); return; }
          if (((bt === DIRT || bt === SOIL) && !rules.drySoil && rnd() < 0.004) || (bt === MUD && rnd() < 0.02)) {
            if (type[i - SW] === EMPTY) { startPlant(i, aux[i] ? PLANT : FLOWER); return; }
          }
          break;
        }
        case ACORN: case GRASSSEED: case CACTUSSEED: case VINESEED: case LILYSEED: case PINECONE: case COCONUT:
          if (sprout(i, t)) return;
          break;
        case CATKIN:
          if (--data[i] <= 0) { transform(i, EMPTY); return; }
          if (sprout(i, t)) return;
          if (rnd() < 0.7) { // fluff: it floats on the air and drifts with the wind
            const j = i + (rnd() < 0.5 + weather.wind * 0.2 ? 1 : -1) - (rnd() < 0.35 ? SW : 0);
            if (type[j] === EMPTY) swap(i, j);
            return;
          }
          break;
        case SPORES:
          if (--data[i] <= 0) { transform(i, EMPTY); return; }
          if (sprout(i, t)) return;
          if (rnd() < 0.6) { // spores float: they drift about and settle only slowly
            const j = i + (rnd() < 0.5 ? -1 : 1) - (rnd() < 0.3 ? SW : 0);
            if (type[j] === EMPTY) swap(i, j);
            return;
          }
          break;
        case LITTER: {
          // dead leaves rot into soil where they lie on damp ground, and flutter as they fall
          if (rnd() < 0.0008) {
            const b = type[i + SW];
            let onPlant = false; // caught in a living plant, it waits to fall (or a clump of soil would grow in mid-air)
            for (let k = 0; k < 8; k++) if (P_SAP[type[i + N8[k]]]) { onPlant = true; break; }
            if (!onPlant && (b === DIRT || b === SOIL || b === MUD || (b === LITTER && rnd() < 0.3) || wetBeside(i))) { transform(i, DIRT); return; }
          }
          if (rnd() < 0.3 && type[i + SW] === EMPTY) {
            const j = i + (rnd() < 0.5 ? -1 : 1);
            if (type[j] === EMPTY) { swap(i, j); return; }
          }
          break;
        }
        case SAPLING: sapling(i); return;
        case PINE: pine(i); return;
        case PALM: palm(i); return;
        case WILLOW: willow(i); return;
        case GRASS: grass(i); return;
        case CACTUS: cactus(i); return;
        case VINE: vine(i); return;
        case MUSHROOM: mushroom(i); return;
        case LILY: lily(i); return;
        case PLANT:
          if (flags[i] & BURN) return; // data is the burn timer now, not growth left
          if ((flags[i] & LEAF) && aux[i] && rnd() < 0.00001 && type[i + SW] === EMPTY) { // a tree sheds a seed now and then
            const s = aux[i] === PINE_LEAF ? PINECONE : aux[i] === PALM_LEAF ? COCONUT : CATKIN;
            if (counts[s] < (s === CATKIN ? 40 : 20)) place(i + SW, s);
          }
          if (rnd() < 0.004) mossCheck(i, i + N8[(rnd() * 8) | 0]);
          if (!(flags[i] & LEAF) && rnd() < 0.006 && mutate(i)) return;
          if (rnd() < 0.02) { // photosynthesis: breathe in carbon dioxide, breathe out oxygen
            const n = i + N8[(rnd() * 8) | 0];
            if (type[n] === CO2) transform(n, EL_O);
          }
          growPlant(i);
          return;
        case MOSS:
          if (rnd() < 0.02) mossCheck(i, i + N8[(rnd() * 8) | 0]);
          return;
        case FLOWER:
          if (rnd() < 0.0005 && counts[PLANT] < 5000) {
            const j = i + N8[(rnd() * 8) | 0];
            if (type[j] === EMPTY) transform(j, SEED);
          }
          if (rnd() < 0.002 && counts[LILY] < 400) { // a flower in a pond drops a seed that roots on the bed: a water lily
            const j = i + N8[(rnd() * 8) | 0];
            if (type[j] === WATER) transform(j, LILYSEED);
          }
          return;
        case FISH: fish(i); return;
        case WORM: worm(i); return;
        case FIREFLY: firefly(i); return;
        case CELL: microbe(i); return;
        case PIPE: case VALVE: conduit(i, t); return;
        case TANK: tank(i); return;
        case PUMP: pump(i); return;
        case PISTON: piston(i); return;
        case THRUSTER: case LEGS: return; // a thruster is worked by ships(), before everything else moves
        case SENSOR: sensor(i); return;
        case WIRE: case SWITCH: case ROD: case CASING: return;
        case COW: cow(i); return;
        case WOLF: wolf(i); return;
        case SHARK: shark(i); return;
        case SUGAR: {
          const n = i + N8[(rnd() * 8) | 0], nt = type[n];
          // dissolved in water it ferments: the water turns to alcohol, bubbling off carbon dioxide
          if (nt === WATER && rnd() < 0.004) { transform(n, ALCOHOL); transform(i, rnd() < 0.4 ? CO2 : EMPTY); flashRx(n, ALCOHOL); return; }
          // acid tears the water out of it and leaves black carbon, hot and steaming
          if (nt === ACID && rnd() < 0.08) {
            transform(i, COAL); temp[i] += 80; events.fizz++; flashRx(i, COAL);
            if (rnd() < 0.4) { transform(n, STEAM); temp[n] = 140; } // the acid is spent slowly: one drop chars several grains
            return;
          }
          break;
        }
        case LIMESTONE: {
          const n = i + N8[(rnd() * 8) | 0];
          if (type[n] === ACID && rnd() < 0.05) { // acid fizzes it away to carbon dioxide
            transform(i, CO2); transform(n, rnd() < 0.5 ? WATER : EMPTY); events.fizz++; flashRx(i, CO2); return;
          }
          if (type[i + SW] === EMPTY && rnd() < 0.002 && seeps(i)) drip(i);
          return;
        }
        case CEMENT:
          // it sets as it stands (sooner when warm, never frozen), keeping any colour painted on it
          if (temp[i] > 0 && (data[i] -= temp[i] > 60 ? 2 : 1) <= 0) { const c = col[i]; transform(i, CONCRETE); col[i] = c; return; }
          break;
        case ALCOHOL: {
          const n = i + N8[(rnd() * 8) | 0], nt = type[n];
          if (isWater(nt)) { if (rnd() < 0.3) { swap(i, n); return; } } // it mixes into water rather than floating on it
          else if (nt === EL_I && rnd() < 0.05) { transform(n, EMPTY); col[i] = TINCTURE; flashRx(i, EL_I); } // tincture of iodine
          // it evaporates from an open surface, far faster than water
          if (type[i - SW] === EMPTY && ambient > 0 && rnd() < ambient * 0.00004) { transform(i, EMPTY); return; }
          break;
        }
        case VINEGAR: {
          const n = i + N8[(rnd() * 8) | 0], nt = type[n];
          if (nt === ASH && rnd() < 0.05) { // ash is lye: vinegar fizzes off carbon dioxide and is spent
            transform(n, CO2); transform(i, rnd() < 0.5 ? WATER : CO2); events.fizz++; flashRx(n, CO2); return;
          }
          if (nt === RUST && rnd() < 0.03) { transform(n, EMPTY); flashRx(n, RUST); if (rnd() < 0.3) { transform(i, WATER); return; } } // eats rust off
          if (nt === CONCRETE && rnd() < 0.004) { // and slowly eats concrete, fizzing
            const c = col[n]; transform(n, SAND); col[n] = c; transform(i, CO2); events.fizz++; flashRx(n, CO2); return;
          }
          break;
        }
        case LIGHT: ray(i); return;
        case ACID: {
          const n = i + N8[(rnd() * 8) | 0], nt = type[n];
          if (nt !== EMPTY && nt !== ACID) {
            const res = P_ACIDRES[nt];
            if (res < 1 && rnd() < 0.2 * (1 - res)) {
              if (nt === METAL && rnd() < 0.06) transform(n, BATTERY);
              else if (P_ACIDH[nt] && rnd() < 0.5) { transform(n, EL_H); flashRx(n, EL_H); } // zinc in acid: the lab's way to make hydrogen
              else transform(n, rnd() < 0.3 ? SMOKE : EMPTY);
              temp[i] += 12;
              events.fizz++;
              if (rnd() < 0.3) { transform(i, EMPTY); return; }
            }
          }
          break;
        }
        case CLONE: {
          const ct = aux[i];
          if (ct === 0) {
            const nt = type[i + N8[(rnd() * 8) | 0]];
            if (nt !== EMPTY && nt !== BOUND && nt !== CLONE && nt !== VOID && nt !== WALL) aux[i] = nt;
          } else if (rnd() < 0.35) {
            const n = i + N8[(rnd() * 8) | 0];
            if (type[n] === EMPTY) place(n, ct);
          }
          return;
        }
        case VOID:
          for (let k = 0; k < 8; k++) {
            const n = i + N8[k], nt = type[n];
            if (nt !== EMPTY && nt !== BOUND && nt !== VOID && nt !== CLONE && nt !== WALL) {
              type[n] = EMPTY; flags[n] = 0; charge[n] = 0; aux[n] = 0; data[n] = 0; temp[n] = ambient; vx[n] = 0; vy[n] = 0;
            }
          }
          return;
        case BATTERY:
          if (((tick + i) & 15) === 0) {
            for (let k = 0; k < 4; k++) { const n = i + N4[k]; if (P_CONDUCT[type[n]]) energize(n); }
          }
          return;
        case HUMAN: human(i); return;
        case HEAD:
          if (type[i + SW] !== HUMAN) transform(i, ASH);
          return;
        case BIRD: bird(i); return;
        case ANT: ant(i); return;
        case RAD:
          if (--data[i] <= 0) transform(i, EMPTY);
          return;
        default:
          if (P_PERIODIC[t]) {
            if (periodic(i, t)) return;
            const c = catOf(i);
            if (c === C_GAS) moveGasP(i, t);
            else if (c === C_LIQUID) moveLiquid(i, t);
            else if (c === C_POWDER) movePowder(i, t);
            return;
          }
      }

      // 6. movement
      switch (P_CAT[t]) {
        case C_POWDER: movePowder(i, t); break;
        case C_LIQUID: moveLiquid(i, t); break;
        case C_GAS: moveGas(i, t); break;
      }
    }

    // ───── heat diffusion (also tallies element counts, and what fills each air cell) ─────
    function heatPass() {
      counts.fill(0);
      let burning = 0;
      const hotT = ambient + 60;
      for (let y = 1; y <= H; y++) {
        let i = y * SW + 1;
        for (let x = 1; x <= W; x++, i++) {
          const t = type[i];
          counts[t]++;
          if (flags[i] & BURN) burning++;
          let Ti = temp[i];
          const ci = P_COND[t];
          if (ci > 0) {
            const j = i + 1;
            let d = temp[j] - Ti;
            if (d > 0.5 || d < -0.5) {
              const tj = type[j], cj = P_COND[tj];
              const k = (ci < cj ? ci : cj) * 0.25;
              if (k > 0) { const q = d * k; Ti += q * P_ICAP[t]; temp[j] -= q * P_ICAP[tj]; }
            }
            const b = i + SW;
            d = temp[b] - Ti;
            if (d > 0.5 || d < -0.5) {
              const tb = type[b], cb = P_COND[tb];
              const k = (ci < cb ? ci : cb) * 0.25;
              if (k > 0) { const q = d * k; Ti += q * P_ICAP[t]; temp[b] -= q * P_ICAP[tb]; }
            }
          }
          if (t === EMPTY) Ti += (ambient - Ti) * 0.08;
          else Ti += (ambient - Ti) * P_LOSS[t];
          temp[i] = Ti;
          // solids wall the air in, powders and liquids slow it, hot gas lifts it
          const c = P_CAT[t];
          if (c === C_STATIC) asol[AIRMAP[i]]++;
          else if (c === C_POWDER) aden[AIRMAP[i]]++;
          else if (c === C_LIQUID) aliq[AIRMAP[i]]++;
          else if (Ti > hotT && (c === C_GAS || t === EMPTY)) ahot[AIRMAP[i]] += Ti - ambient;
        }
      }
      events.burning = burning;
    }

    // ───── the air field ─────
    function sampleAir(f, sx, sy) {
      if (sx < 0) sx = 0; else if (sx > AW - 1) sx = AW - 1;
      if (sy < 0) sy = 0; else if (sy > AH - 1) sy = AH - 1;
      const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
      const x1 = x0 < AW - 1 ? x0 + 1 : x0, r0 = y0 * AW, r1 = (y0 < AH - 1 ? y0 + 1 : y0) * AW;
      return (f[r0 + x0] * (1 - fx) + f[r0 + x1] * fx) * (1 - fy) + (f[r1 + x0] * (1 - fx) + f[r1 + x1] * fx) * fy;
    }

    function airStep() {
      // 1. walls, drag and heat, from what heatPass counted
      for (let a = 0; a < AN; a++) {
        const n = acnt[a];
        ablk[a] = asol[a] * 4 >= n * 3 ? 1 : 0;      // three-quarters solid: no air gets through
        if (ablk[a]) ap[a] = 0;
        // grains slow the air; a liquid all but stops it, so a pressure pulse presses on a pond's
        // surface rather than soaking through it
        adamp[a] = AIR_VLOSS * Math.max(0, 1 - (aden[a] / n) * 0.5 - (aliq[a] / n) * 0.9);
        const h = ahot[a];
        if (h > 0) {
          const q = h / n; // mean heat above the ambient air
          ap[a] += q * HOT_PRES;
          avy[a] -= q * HOT_LIFT;
          if (a >= AW) avy[a - AW] -= q * HOT_LIFT;
          ahot[a] = 0;
        }
        asol[a] = 0; aden[a] = 0; aliq[a] = 0;
      }
      // 2. pressure rises where the flow converges and falls where it spreads out
      for (let y = 0, a = 0; y < AH; y++) {
        for (let x = 0; x < AW; x++, a++) {
          let dp = -avx[a] - avy[a];
          if (x > 0) dp += avx[a - 1];
          if (y > 0) dp += avy[a - AW];
          const p = ap[a] * AIR_PLOSS + dp * AIR_TSTEPP;
          ap[a] = p > AIR_MAXP ? AIR_MAXP : p < -AIR_MAXP ? -AIR_MAXP : p;
        }
      }
      // 3. the flow runs down the pressure gradient; walls and the world's edges stop it
      for (let y = 0, a = 0; y < AH; y++) {
        for (let x = 0; x < AW; x++, a++) {
          if (ablk[a]) { avx[a] = 0; avy[a] = 0; continue; }
          const d = adamp[a];
          avx[a] = x < AW - 1 && !ablk[a + 1] ? (avx[a] + (ap[a] - ap[a + 1]) * AIR_TSTEPV) * d : 0;
          avy[a] = y < AH - 1 && !ablk[a + AW] ? (avy[a] + (ap[a] - ap[a + AW]) * AIR_TSTEPV) * d : 0;
        }
      }
      // 4. diffuse a little, and let the flow carry itself along, which curls it into swirls
      for (let y = 0, a = 0; y < AH; y++) {
        for (let x = 0; x < AW; x++, a++) {
          if (ablk[a]) { bvx[a] = 0; bvy[a] = 0; bp[a] = ap[a]; continue; }
          let sx = 0, sy = 0, sp = 0, n = 0;
          if (x > 0 && !ablk[a - 1]) { sx += avx[a - 1]; sy += avy[a - 1]; sp += ap[a - 1]; n++; }
          if (x < AW - 1 && !ablk[a + 1]) { sx += avx[a + 1]; sy += avy[a + 1]; sp += ap[a + 1]; n++; }
          if (y > 0 && !ablk[a - AW]) { sx += avx[a - AW]; sy += avy[a - AW]; sp += ap[a - AW]; n++; }
          if (y < AH - 1 && !ablk[a + AW]) { sx += avx[a + AW]; sy += avy[a + AW]; sp += ap[a + AW]; n++; }
          let ux = avx[a], uy = avy[a];
          const p = ap[a];
          bp[a] = p + (sp - n * p) * AIR_BLUR;
          ux += (sx - n * ux) * AIR_BLUR; uy += (sy - n * uy) * AIR_BLUR;
          if (ux > AIR_FELT || ux < -AIR_FELT || uy > AIR_FELT || uy < -AIR_FELT) {
            const tx = x - avx[a] / AS, ty = y - avy[a] / AS;
            ux += (sampleAir(avx, tx, ty) - ux) * AIR_VADV;
            uy += (sampleAir(avy, tx, ty) - uy) * AIR_VADV;
          }
          if (x === AW - 1 || ablk[a + 1]) ux = 0;
          if (y === AH - 1 || ablk[a + AW]) uy = 0;
          bvx[a] = ux > AIR_MAXV ? AIR_MAXV : ux < -AIR_MAXV ? -AIR_MAXV : ux > -1e-3 && ux < 1e-3 ? 0 : ux;
          bvy[a] = uy > AIR_MAXV ? AIR_MAXV : uy < -AIR_MAXV ? -AIR_MAXV : uy > -1e-3 && uy < 1e-3 ? 0 : uy;
        }
      }
      avx.set(bvx); avy.set(bvy);
      for (let a = 0; a < AN; a++) { const p = bp[a]; ap[a] = p > -1e-3 && p < 1e-3 ? 0 : p; }
    }

    function step() {
      tick++;
      now = (now + 1) & 0xffff;
      if (now === 0) now = 1;
      heatPass();
      airStep();
      if ((tick & 3) === 0) magField();
      weatherTick();
      if (disasters.length) disasterTick();
      if (empLeft > 0) empLeft--;
      if (hand.on) handPhysics();
      if ((tick & 15) === 0) rootPass();
      if (counts[THRUSTER]) ships();
      const ltr = tick & 1;
      for (let y = H; y >= 1; y--) {
        const row = y * SW;
        if (ltr) {
          for (let i = row + 1, e = row + W; i <= e; i++) {
            const t = type[i];
            if (t !== EMPTY && stamp[i] !== now) update(i, t);
          }
        } else {
          for (let i = row + W, e = row + 1; i >= e; i--) {
            const t = type[i];
            if (t !== EMPTY && stamp[i] !== now) update(i, t);
          }
        }
      }
    }

    // ───── tools (called by the UI) ─────
    // The brush every tool paints with. Its shape is set from the UI:
    //   circle, square, spray (a scattered circle), box (a dragged rectangle: see setBrush)
    //   or fill (every connected cell of the kind under the cursor, like a paint bucket).
    const brush = { shape: 'circle', x0: 0, y0: 0, x1: 0, y1: 0 };
    function setBrush(shape, x0, y0, x1, y1) {
      brush.shape = shape;
      if (x0 != null) {
        brush.x0 = Math.max(0, Math.min(x0, x1)); brush.x1 = Math.min(W - 1, Math.max(x0, x1));
        brush.y0 = Math.max(0, Math.min(y0, y1)); brush.y1 = Math.min(H - 1, Math.max(y0, y1));
      }
    }
    const FILL_MAX = 60000;
    let fillSeen = new Uint8Array(N), fillQueue = new Int32Array(1024);
    function forCircle(x0, y0, r, fn) {
      const shape = brush.shape;
      if (shape === 'box') {
        for (let y = brush.y0; y <= brush.y1; y++) for (let x = brush.x0; x <= brush.x1; x++) fn(idx(x, y), 0);
        return;
      }
      if (shape === 'fill') {
        if (x0 < 0 || y0 < 0 || x0 >= W || y0 >= H) return;
        const start = idx(x0, y0), kind = type[start];
        fillSeen.fill(0);
        let head = 0, tail = 0;
        fillQueue[tail++] = start; fillSeen[start] = 1;
        const cells = [];
        while (head < tail && cells.length < FILL_MAX) {
          const i = fillQueue[head++];
          cells.push(i);
          for (let k = 0; k < 4; k++) {
            const n = i + N4[k];
            if (fillSeen[n] || type[n] !== kind) continue; // the border is BOUND, so this never escapes
            fillSeen[n] = 1;
            if (tail === fillQueue.length) { const q = new Int32Array(tail * 2); q.set(fillQueue); fillQueue = q; }
            fillQueue[tail++] = n;
          }
        }
        for (const i of cells) fn(i, 0);
        return;
      }
      const square = shape === 'square', spray = shape === 'spray';
      const r2 = r * r + r * 0.8;
      const R = Math.ceil(r);
      for (let dy = -R; dy <= R; dy++) {
        const y = y0 + dy;
        if (y < 0 || y >= H) continue;
        for (let dx = -R; dx <= R; dx++) {
          const x = x0 + dx;
          if (x < 0 || x >= W) continue;
          const d2 = dx * dx + dy * dy;
          if (!square && d2 > r2) continue;
          if (spray && rnd() > 0.1) continue;
          fn(idx(x, y), d2);
        }
      }
    }

    // The hand (the Magnet tool). Picking up marks everything loose within its reach (powder,
    // liquid, gas, creatures) as held, and while the button stays down it keeps drawing in every
    // grain and drop that comes within reach. The load then hangs from the hand as one body on a
    // spring: its centre of mass is pulled toward the hand, damped against the hand's own motion
    // and weighed down by gravity, so it lags behind a fast drag, swings past when the hand
    // stops and sags under it. Each grain or drop follows that body's motion and is drawn back
    // into the clump when it strays: sand loosely, water more loosely still, so it sloshes and
    // drips. What gets left behind (caught on a wall, say) falls away. Gas and flame drift after
    // the hand, and people dangle from it. Letting go throws everything still held with the
    // hand's own velocity. Which cells are held is kept in their flags (it moves with them when
    // they swap), so nothing can be left behind stuck in the air.
    // mag: switched to Magnetic, the hand picks up only what a real magnet would (see pullable())
    const hand = { on: false, x: 0, y: 0, lx: 0, ly: 0, vx: 0, vy: 0, bvx: 0, bvy: 0, reach: 0, n: 0, mag: false };
    const HAND_K = 0.06, HAND_C = 0.18, HAND_MAXV = 12, HAND_MAX = 4000;
    let handKeys = new Float64Array(1024);
    // Mark what is loose within r of (x0, y0) as held, up to HAND_MAX cells in all. Only powder
    // and liquid unless `all` (the first grab also takes gas, flame and creatures).
    function gather(x0, y0, r, all) {
      const R = Math.ceil(r), R2 = (r + 0.5) * (r + 0.5);
      let n = 0;
      for (let dy = -R; dy <= R; dy++) {
        const y = y0 + dy;
        if (y < 0 || y >= H) continue;
        for (let dx = -R; dx <= R; dx++) {
          const x = x0 + dx;
          if (x < 0 || x >= W || dx * dx + dy * dy > R2) continue;
          const i = idx(x, y), t = type[i];
          if (t === EMPTY || t === BOUND || flags[i] & HELD) continue;
          if (hand.mag && !pullable(i, t)) continue; // a real magnet leaves sand, wood and people behind
          const c = catOf(i);
          if (c === C_STATIC) continue; // the ground stays put
          if (!all && c !== C_POWDER && c !== C_LIQUID) continue;
          if (hand.n + n >= HAND_MAX) return n;
          flags[i] |= HELD; n++;
          if (t === HUMAN && type[i - SW] === HEAD) flags[i - SW] |= HELD; // a person comes whole
          if (all) { vx[i] = 0; vy[i] = 0; }
        }
      }
      return n;
    }
    function grab(x0, y0, r, magnetic = false) {
      release(0, 0);
      hand.on = true; hand.n = 0; hand.reach = r; hand.mag = !!magnetic;
      hand.x = hand.lx = x0; hand.y = hand.ly = y0;
      hand.vx = hand.vy = hand.bvx = hand.bvy = 0;
      return (hand.n = gather(x0, y0, r, true));
    }

    // Where the hand is now and how far it reaches (called as the cursor moves; the pull acts
    // each tick).
    function holdTo(x0, y0, r) { hand.x = x0; hand.y = y0; if (r !== undefined) hand.reach = r; }

    function handPhysics() {
      const hx = hand.x, hy = hand.y;
      // the hand's own velocity, smoothed over the ticks of a frame
      const hvx = (hand.vx = hand.vx * 0.5 + (hx - hand.lx) * 0.5), hvy = (hand.vy = hand.vy * 0.5 + (hy - hand.ly) * 0.5);
      hand.lx = hx; hand.ly = hy;
      // while the button is down, every grain and drop that comes within reach is drawn in
      hand.n += gather(hx, hy, hand.reach, false);
      const reach2 = (hand.reach + 0.5) * (hand.reach + 0.5);
      // what is held, and where the load's centre of mass is
      let n = 0, m = 0, mc = 0, mx = 0, my = 0;
      for (let y = 0; y < H; y++) {
        let i = (y + 1) * SW + 1;
        for (let x = 0; x < W; x++, i++) {
          if (!(flags[i] & HELD)) continue;
          const t = type[i];
          if (t === EMPTY) { flags[i] &= ~HELD; continue; }
          if (t === HEAD) continue; // moves with its body
          if (hand.mag && !pullable(i, t)) { flags[i] &= ~HELD; continue; } // heated past its Curie point: it drops
          n++;
          if (m === handKeys.length) { const k = new Float64Array(m * 2); k.set(handKeys); handKeys = k; }
          handKeys[m++] = i;
          if (t !== HUMAN) { const c = catOf(i); if (c === C_POWDER || c === C_LIQUID) { mx += x; my += y; mc++; } }
        }
      }
      hand.n = n;
      if (!n) return; // an empty hand stays open until the button comes up
      let bvx = 0, bvy = 0, ball = 0, loose2 = 0;
      if (!mc) { hand.bvx = hvx; hand.bvy = hvy; } // nothing heavy held: a new load starts at the hand's pace
      else {
        mx /= mc; my /= mc;
        // the load as one body on a spring from the hand
        bvx = hand.bvx + (hx - mx) * HAND_K - (hand.bvx - hvx) * HAND_C;
        bvy = hand.bvy + (hy - my) * HAND_K - (hand.bvy - hvy) * HAND_C + GRAV;
        bvx = hand.bvx = bvx > HAND_MAXV ? HAND_MAXV : bvx < -HAND_MAXV ? -HAND_MAXV : bvx;
        bvy = hand.bvy = bvy > HAND_MAXV ? HAND_MAXV : bvy < -HAND_MAXV ? -HAND_MAXV : bvy;
        ball = Math.sqrt(mc / Math.PI) * 0.9; // the clump it gathers into, packed close
        loose2 = (ball * 2 + 10) * (ball * 2 + 10); // further out than this it has been left behind
      }
      // the leading edge moves first and the rest follow it, so the load never jams against itself
      for (let k = 0; k < m; k++) {
        const i = handKeys[k], dx = cx(i) - mx, dy = cy(i) - my;
        handKeys[k] = (Math.round(dx * dx + dy * dy - 8 * (dx * bvx + dy * bvy)) + 1e6) * N + i;
      }
      const order = handKeys.subarray(0, m).sort();
      // one roll of the dice for the whole load this tick, so grains moving together step
      // together and the clump stays packed instead of shuffling into a checkerboard
      const rx = rnd(), ry = rnd();
      for (let k = 0; k < m; k++) {
        const i = order[k] % N, t = type[i];
        if (!(flags[i] & HELD) || stamp[i] === now) continue; // already moved, or knocked loose
        if (t === HUMAN) { dangle(i, hx - cx(i), hy - cy(i)); continue; }
        const c = catOf(i);
        if (c !== C_POWDER && c !== C_LIQUID) {
          // gas, flame and small creatures drift after the hand a step at a time
          const dx = hx - cx(i), dy = hy - cy(i);
          if (dx * dx + dy * dy > 2 && rnd() < 0.5) {
            const j = i + Math.sign(dx) + Math.sign(dy) * SW;
            if (type[j] === EMPTY) swap(i, j);
          }
          continue;
        }
        const dx = mx - cx(i), dy = my - cy(i), d2 = dx * dx + dy * dy;
        const hdx = hx - cx(i), hdy = hy - cy(i), inReach = hdx * hdx + hdy * hdy <= reach2;
        if (d2 > loose2 && !inReach) { flags[i] &= ~HELD; continue; } // left behind: it falls away
        const wetLoad = c === C_LIQUID;
        // a drop hanging from the bottom of a wet load, out of reach, now and then lets go
        if (wetLoad && !inReach && dy < -ball * 0.7 && type[i + SW] === EMPTY && rnd() < 0.004) { flags[i] &= ~HELD; continue; }
        // it follows the body's motion (a liquid more slowly, so it sloshes), and is drawn back
        // into the clump if it strays out of it
        const follow = wetLoad ? 0.25 : 0.5;
        let ux = vx[i] + (bvx - vx[i]) * follow, uy = vy[i] + (bvy - vy[i]) * follow;
        const d = Math.sqrt(d2);
        if (d > ball) { const pull = ((wetLoad ? 0.1 : 0.15) * (d - ball)) / d; ux += dx * pull; uy += dy * pull; }
        if (wetLoad) { ux += (rnd() - 0.5) * 0.06; uy += (rnd() - 0.5) * 0.06; }
        if (ux > HAND_MAXV) ux = HAND_MAXV; else if (ux < -HAND_MAXV) ux = -HAND_MAXV;
        if (uy > HAND_MAXV) uy = HAND_MAXV; else if (uy < -HAND_MAXV) uy = -HAND_MAXV;
        const dens = densOf(i);
        let j = handMove(i, Math.floor(ux + rx), Math.floor(uy + ry), dens);
        if (hitX || hitY) {
          // blocked: slip round whatever is in the way; it keeps some speed against its own
          // load, and bounces off anything else
          const sx = Math.sign(ux), sy = Math.sign(uy), r = rnd() < 0.5 ? 1 : -1;
          const tries = sx && sy ? (r > 0 ? [sx, sy * SW] : [sy * SW, sx]) : sx ? [sx + r * SW, sx - r * SW] : [r + sy * SW, -r + sy * SW];
          for (const e of tries) if (handEnter(j + e, dens)) { swap(j, j + e); j += e; break; }
          if (hitX && !(flags[hitJX] & HELD)) ux *= -0.3; else if (hitX) ux *= 0.6;
          if (hitY && !(flags[hitJY] & HELD)) uy *= -0.3; else if (hitY) uy *= 0.6;
        }
        vx[j] = ux; vy[j] = uy; flags[j] &= ~SETTLED;
      }
    }

    // Like glide(), but the hand shoves through loose matter that isn't in its grip (sand,
    // water, smoke closes in behind), and through the lighter part of its own load.
    let hitJX = 0, hitJY = 0;
    function handMove(i, dx, dy, dens) {
      hitX = false; hitY = false;
      const mx = dx < 0 ? -dx : dx, my = dy < 0 ? -dy : dy, n = mx > my ? mx : my;
      let cur = i, px = 0, py = 0;
      for (let s = 1; s <= n; s++) {
        if (!hitX) {
          const tx = Math.round((dx * s) / n);
          if (tx !== px) {
            const j = cur + tx - px;
            if (handEnter(j, dens)) { swap(cur, j); cur = j; px = tx; } else { hitX = true; hitJX = j; }
          }
        }
        if (!hitY) {
          const ty = Math.round((dy * s) / n);
          if (ty !== py) {
            const j = cur + (ty - py) * SW;
            if (handEnter(j, dens)) { swap(cur, j); cur = j; py = ty; } else { hitY = true; hitJY = j; }
          }
        }
        if (hitX && hitY) break;
      }
      return cur;
    }
    function handEnter(j, dens) {
      const t = type[j];
      if (t === EMPTY) return true;
      if (t === BOUND) return false;
      const c = catOf(j);
      if (flags[j] & HELD) return c === C_GAS || (c === C_LIQUID && densOf(j) < dens);
      return c === C_GAS || c === C_LIQUID || c === C_POWDER;
    }

    // A carried person dangles from the hand: body and head move together toward it, a couple
    // of steps a tick.
    function dangle(i, dx, dy) {
      const head = type[i - SW] === HEAD;
      for (let s = 0; s < 2; s++) {
        const sx = Math.sign(dx), sy = Math.sign(dy);
        if (sx && open(i + sx) && (!head || open(i - SW + sx))) {
          swap(i, i + sx); if (head) swap(i - SW, i - SW + sx);
          i += sx; dx -= sx;
        }
        if (sy < 0 && open(i - SW * (head ? 2 : 1))) {
          if (head) { swap(i - SW, i - 2 * SW); swap(i, i - SW); } else swap(i, i - SW);
          i -= SW; dy++;
        } else if (sy > 0 && open(i + SW)) {
          swap(i, i + SW); if (head) swap(i - SW, i);
          i += SW; dy--;
        }
      }
    }

    // Let go, giving everything still held the hand's velocity (cells per tick).
    function release(ux, uy) {
      if (!hand.on) return;
      ux = ux > MAXV ? MAXV : ux < -MAXV ? -MAXV : ux;
      uy = uy > MAXV ? MAXV : uy < -MAXV ? -MAXV : uy;
      for (let i = 0; i < N; i++) {
        if (!(flags[i] & HELD)) continue;
        flags[i] &= ~(HELD | SETTLED);
        vx[i] = ux; vy[i] = uy;
      }
      hand.on = false; hand.n = 0;
    }

    // ───── disasters (the Weapons tab) ─────
    // Each weapon sets off a disaster that plays out over a few seconds. They are made of the
    // same physics as everything else rather than painted on: a tsunami is a wall of sea water
    // with momentum that drives the sea inland ahead of it, an earthquake sways every loose grain
    // and drop and cracks the rock, a tornado lifts what it passes over on a column of rising
    // air, a volcano throws real lava, a meteor and a nuke are blasts. `size` scales each one
    // (1 at the brush's default size). The renderer draws the list (funnels, the black hole) and
    // the game shakes the screen from the events; none of it is saved with the world.
    let disasterSeq = 0;
    const DISASTERS = {
      tsunami: [startTsunami, tsunami], quake: [startQuake, quake], tornado: [startTornado, tornado],
      volcano: [startVolcano, volcano], meteor: [startMeteor, meteor], storm: [startStorm, storm], solar: [startSolar, solar],
      freeze: [startFreeze, freeze], acidrain: [startAcidRain, acidRain], nuke: [startNuke, nuke],
      hbomb: [startHbomb, hbomb], blackhole: [startBlackHole, blackHole],
    };
    // Each solid as it is in reality decides how a disaster breaks it, and the powder it breaks
    // into. For an earthquake: the intensity of shaking (on the Mercalli scale) at which it starts
    // to give way, and the one that wrecks it, from what each does in real earthquakes. Hardness
    // alone doesn't settle it, toughness does too: glass is harder than iron but shatters where
    // iron bends, and wood is soft but its fibres hold it together. Plants sway instead of
    // breaking. For a black hole: how easily its pull tears it apart. Only Wall holds out.
    //              quake: gives way  wrecked  tears  into         in real earthquakes
    const NEVER = Infinity;
    const SOLIDS = [
      [ICE,             4.5,   7,      1.6,   SNOW],      // lake ice cracks at V
      [GLASS,           4.5,   7,      1.5,   SHARDS],    // a few windows break at V, most by VII
      [CLAY,            6,     8.5,    1.2,   DIRT],      // unfired, it is the first building material to go
      [BRICK,           6.5,   9,      1.1,   RUBBLE],    // unreinforced masonry cracks at VII, falls at VIII–IX
      [COAL,            7,     10,     1,     EL_C],      // a soft, brittle rock (Mohs 2.5)
      [OBSIDIAN,        7,     10,     0.9,   RUBBLE],    // volcanic glass
      [STONE,           7,     10.5,   0.6,   RUBBLE],    // cliffs shed rock at VII; bedrock breaks up at X and over
      [WOOD,            8.5,   11.5,   0.3,   SPLINTERS], // timber frames ride out VIII and are wrecked at X–XI
      [SAPLING,         9,     12,     0.5,   SPLINTERS],
      [BATTERY,         10,    14.5,   0.25,  SCRAP],     // its case bursts open, like any machine's
      [METAL,           11,    16,     0.15,  EL_FE],     // rails bend at X; steel seldom snaps even at XII
      [DIAMOND,         NEVER, NEVER,  0.12,  EL_C],      // the hardest thing there is: no earthquake breaks it
    ];
    for (const t of [PLANT, FLOWER, GRASS, DRYGRASS, VINE, MOSS, MUSHROOM, CACTUS, LILY]) SOLIDS.push([t, NEVER, NEVER, 1, LITTER]);
    SOLIDS.push(
      [SOIL,     5.5, 7.5, 1.3, DIRT],      // packed earth: slumps and slides early
      [LIMESTONE, 6.5, 9.5, 0.8, RUBBLE],   // a soft sedimentary rock (Mohs 3): its overhangs fall early
      [CONCRETE, 7,   10,  0.5, RUBBLE],    // unreinforced concrete cracks at VII and falls at X
      [PINE, 9, 12, 0.5, SPLINTERS], [PALM, 9, 12, 0.5, SPLINTERS], [WILLOW, 9, 12, 0.5, SPLINTERS],
    );
    // cast metal: ductile, like steel, and it breaks back into its own grains
    for (const d of list) if (d.castOf !== undefined) SOLIDS.push([d.id, 10.5, 15.5, 0.15, d.castOf]);
    // machines are solid things too: shaken hard, smashed or torn, they break into scrap (thin pipe and
    // the lighter fittings first, the heavy pumps, tanks, pistons and thrusters last)
    for (const t of [WIRE, SWITCH, SENSOR, PIPE, VALVE, CASING, LEGS]) SOLIDS.push([t, 9, 13, 0.35, SCRAP]);
    for (const t of [PUMP, TANK, PISTON, ROD, THRUSTER]) SOLIDS.push([t, 10, 14.5, 0.25, SCRAP]);
    const BREAKS = new Uint16Array(NT), TEARS = new Float32Array(NT);
    const QUAKE_FROM = new Float32Array(NT).fill(NEVER), QUAKE_RUIN = new Float32Array(NT).fill(NEVER);
    // a black hole tears the lighter of two equally tough solids apart a little sooner: density
    // nudges it, but toughness decides (wood, light as it is, holds out longer than stone)
    for (const [t, from, ruin, tears, into] of SOLIDS) {
      QUAKE_FROM[t] = from; QUAKE_RUIN[t] = ruin; BREAKS[t] = into;
      TEARS[t] = tears * Math.max(0.6, Math.min(1.25, Math.sqrt(25 / P_DENS[t])));
    }
    // rock and masonry with a free face (a cliff, an overhang, the top of a wall) give way a step
    // of intensity sooner than the same stuff held in on every side
    const FACE_FIRST = new Uint8Array(NT);
    for (const t of [STONE, OBSIDIAN, COAL, BRICK, CLAY, CONCRETE, SOIL]) FACE_FIRST[t] = 1;
    const unbreakable = (t) => t === WALL || t === CLONE || t === VOID || t === BOUND;

    // How far a weapon of this size reaches from where it is set off, in cells (the cursor's ring).
    // An earthquake's reach comes from its magnitude instead: how far out it does damage.
    function weaponReach(kind, size, magnitude = 7) {
      switch (kind) {
        case 'tsunami': return Math.round(Math.min(W * 0.3, Math.max(10, W * 0.1 * size))); // the wall's width
        case 'quake': return quakeRange(magnitude, 6);
        case 'tornado': return 2 + 2 * size; // the funnel's foot
        case 'volcano': return Math.max(1, Math.round(size)); // the pipe's half-width
        case 'meteor': return Math.min(22, 6 + 3 * size);
        case 'storm': case 'acidrain': return Math.min(W / 2, 30 * size); // how much sky it covers
        case 'freeze': return Math.min(110, 46 * size);
        case 'nuke': return Math.min(44, 17 * size);
        case 'blackhole': return Math.min(90, 36 * size);
        default: return 0;
      }
    }

    // Set off `kind` at (x0, y0). An earthquake takes its magnitude from opts.magnitude. Returns
    // its id (for steer()), or 0 for an unknown kind.
    function launch(kind, x0, y0, size = 1, opts = {}) {
      const fns = DISASTERS[kind];
      if (!fns) return 0;
      size = Math.max(0.3, Math.min(4, size));
      const mag = Math.max(1, Math.min(10, opts.magnitude == null ? 7 : opts.magnitude));
      const d = {
        id: ++disasterSeq, kind, size, mag, r: weaponReach(kind, size, mag), age: 0, life: 1, delay: 0,
        x: Math.max(0, Math.min(W - 1, Math.round(x0))), y: Math.max(0, Math.min(H - 1, Math.round(y0))),
      };
      disasters.push(d);
      fns[0](d);
      return d.id;
    }
    // Aim a disaster that can be steered (a tornado) at column x, or let it go its own way (-1).
    function steer(id, x) { for (const d of disasters) if (d.id === id) d.tx = x; }

    function disasterTick() {
      for (let k = disasters.length - 1; k >= 0; k--) {
        const d = disasters[k];
        if (d.delay > 0) { d.delay--; continue; }
        DISASTERS[d.kind][1](d);
        if (++d.age >= d.life) disasters.splice(disasters.indexOf(d), 1);
      }
    }

    // A disaster's strength over its life: rising over the first `rise` ticks, dying away over
    // the last `fall`.
    function fade(d, rise, fall) { return Math.max(0, Math.min(1, (d.age + 1) / rise, (d.life - d.age) / fall)); }
    // Turn a cell into t where a weapon puts it, keeping its heat. Never a discovery, as with painting.
    function become(i, t) { const T = temp[i]; place(i, t); temp[i] = T; stamp[i] = now; }
    function crumble(i) {
      const from = type[i], to = BREAKS[from];
      if (to) {
        const tint = from === GLASS ? aux[i] : 0, c = col[i]; // stained glass breaks into shards of its colour
        become(i, to);
        if (tint) aux[i] = tint;
        else if (to === RUBBLE || to === SCRAP) aux[i] = from; // rubble and scrap look like what they broke from: brick red, a pump's blue
        if (c) col[i] = c; // and paint stays on the pieces
        if (!disc[to]) discover(to, i); // rubble, glass shards: found when something breaks up
      }
      return to !== 0;
    }
    // The top of the ground in column x: the first cell from the top with solid, powder or liquid
    // at least four deep under it (so a falling grain or a passing bird isn't taken for it), or H.
    function floorY(x) {
      let run = 0;
      for (let y = 0, i = idx(x, 0); y < H; y++, i += SW) {
        if (airAt(i)) run = 0;
        else if (++run === 4) return y - 3;
      }
      return run ? H - run : H;
    }
    // Every cell within r of (x0, y0): fn(i, dx, dy, d2).
    function forDisc(x0, y0, r, fn) {
      const R = Math.ceil(r), R2 = r * r;
      const ya = Math.max(-R, -y0), yb = Math.min(R, H - 1 - y0), xa = Math.max(-R, -x0), xb = Math.min(R, W - 1 - x0);
      for (let dy = ya; dy <= yb; dy++) {
        const y = y0 + dy;
        for (let dx = xa; dx <= xb; dx++) {
          const d2 = dx * dx + dy * dy;
          if (d2 > R2) continue;
          fn(idx(x0 + dx, y), dx, dy, d2);
        }
      }
    }
    // A row of cloud across the sky over x0 ± span.
    function cloudBank(x0, span, y, t) {
      for (let x = x0 - span; x <= x0 + span; x += 7) {
        if (x >= 0 && x < W) puff(x, y + ((rnd() * 3) | 0), 7, 2 + ((rnd() * 2) | 0), t);
      }
    }
    const skyY = () => Math.max(3, Math.round(H * 0.07)); // where weapons' clouds gather

    // Tsunami: a wall of sea water rises at the edge of the map nearer where you aim and rolls in
    // toward it. The water carries its own momentum (the crest fastest, so it topples forward),
    // and a band of push travelling with the wave keeps the whole sea, the water that was
    // already there too, running inland: it breaks over the shore, floods the land, sweeps sand
    // and people along and crashes up against whatever stands in its way. Once it has passed, the
    // backwash runs out over the edge it came from, and what overtopped the land over the far
    // edge, as the ocean beyond takes back the water the wave brought (what it left lying in
    // hollows inland stays).
    const TSUNAMI_V = 1.9, TSUNAMI_BAND = 28, TSUNAMI_FEED = 70, TSUNAMI_DRAIN = 30;
    function startTsunami(d) {
      const dir = d.dir = d.x < W / 2 ? 1 : -1;
      const ww = d.r;
      d.hh = Math.round(Math.min(H * 0.8, H * 0.42 * d.size));
      // sea water, unless the water at that edge is fresh
      d.liq = SALTWATER;
      for (let k = 0; k < ww; k++) {
        const x = dir > 0 ? k : W - 1 - k, g = floorY(x);
        if (g < H && type[idx(x, g)] === WATER) { d.liq = WATER; break; }
      }
      // where the sea (or the ground) stood at the edge before it rose: the wave's height is
      // measured from there, so feeding it never stacks water on water
      d.sea = [];
      for (let k = 0; k < ww; k++) d.sea.push(floorY(dir > 0 ? k : W - 1 - k));
      d.far = [];
      for (let k = 0; k < 3; k++) d.far.push(floorY(dir > 0 ? W - 1 - k : k));
      d.added = 0;
      // the front stands tallest, so it topples forward
      for (let k = 0; k < ww; k++) raiseSea(d, k, 0.8 + 0.2 * (k / ww));
      d.front = dir > 0 ? ww : W - 1 - ww;
      d.passing = Math.ceil((W - ww) / TSUNAMI_V) + TSUNAMI_BAND; // ticks until the front is off the map
      d.life = d.passing + 900;                                   // the backwash ends it sooner
    }
    // Fill the k-th column in from the edge with sea water up to `f` of the wave's height, every
    // drop of it racing inland (the crest fastest).
    function raiseSea(d, k, f) {
      const x = d.dir > 0 ? k : W - 1 - k, g = floorY(x);
      const top = Math.max(1, d.sea[k] - Math.round(d.hh * f));
      for (let y = top; y < g; y++) {
        const i = idx(x, y);
        if (!airAt(i)) continue;
        place(i, d.liq);
        vx[i] = d.dir * (3 + 1.8 * (1 - (y - top) / Math.max(1, g - top)));
        d.added++;
      }
    }
    function tsunami(d) {
      if (d.age >= d.passing) { backwash(d); return; }
      const dir = d.dir, f = 1 - 0.5 * (d.age / d.passing);
      const push = 3.6 * f * Math.min(1.3, 0.75 + 0.25 * d.size);
      // the sea keeps rising at the edge for a moment, so it comes in as a surge, not one wave
      if (d.age < TSUNAMI_FEED) {
        const fall = 1 - 0.6 * (d.age / TSUNAMI_FEED);
        for (let k = 0; k < Math.min(10, d.sea.length); k++) raiseSea(d, k, fall);
      }
      d.front += dir * TSUNAMI_V;
      events.surge = Math.max(events.surge, f);
      events.shake += 0.25 * f;
      events.rumble = Math.max(events.rumble, 0.6 * f);
      for (let k = 0; k < TSUNAMI_BAND; k++) {
        const x = Math.round(d.front) - dir * k;
        if (x < 0 || x >= W) continue;
        const want = push * (1 - k / TSUNAMI_BAND);
        for (let y = 0, i = idx(x, 0); y < H; y++, i += SW) {
          const t = type[i];
          if (t === EMPTY) continue;
          const c = catOf(i);
          if (c === C_LIQUID) {
            if (vx[i] * dir < want) vx[i] = dir * want;
          } else if (c === C_POWDER) { // the wave rolls light grains along, and barely shifts heavy ones
            const hf = heft(i);
            if (rnd() < 0.3 * hf && vx[i] * dir < want * 0.6 * hf) { vx[i] = dir * want * 0.6 * hf; flags[i] &= ~SETTLED; }
          } else if (c === C_STATIC && BREAKS[t] && P_DENS[t] < 10 && rnd() < 0.004 * (1 - k / TSUNAMI_BAND)) {
            crumble(i); // timber, plants and ice float off
          } else if (t === HUMAN && rnd() < 0.4) {
            // people caught in it are carried along
            const h = i - SW, j = i + dir, jh = h + dir;
            const wet = (n) => type[n] !== BOUND && catOf(n) === C_LIQUID;
            if (type[h] === HEAD && (wet(i + dir) || wet(h)) && (open(j) || wet(j)) && (open(jh) || wet(jh))) { swap(i, j); swap(h, jh); }
          }
        }
      }
    }
    function backwash(d) {
      const dir = d.dir;
      events.surge = Math.max(events.surge, 0.4);
      // the sea near the edge runs back out toward it
      for (let k = 0; k < 40; k++) {
        const x = dir > 0 ? k : W - 1 - k;
        for (let y = 0, i = idx(x, 0); y < H; y++, i += SW) {
          if (type[i] !== EMPTY && catOf(i) === C_LIQUID && vx[i] * dir > -1.2) vx[i] = -dir * 1.2;
        }
      }
      // and over both edges, as much as the wave brought, from above where the sea stood before
      let n = 0;
      for (let k = 0; k < 6 && d.added > 0; k++) {
        const near = k < 3, atLeft = near === (dir > 0); // the near edge is the left one for a wave rolling right
        const x = atLeft ? k % 3 : W - 1 - (k % 3), level = near ? d.sea[k] : d.far[k - 3];
        for (let y = 0, i = idx(x, 0); y < level && n < TSUNAMI_DRAIN && d.added > 0; y++, i += SW) {
          if (type[i] === d.liq || type[i] === WATER || type[i] === SALTWATER) { become(i, EMPTY); d.added--; n++; }
        }
      }
      if (d.added <= 0 || (n === 0 && d.age > d.passing + 120)) d.life = d.age + 1;
    }

    // Earthquake. Its magnitude (the moment magnitude the news reports) settles everything, as in
    // reality: the intensity of shaking at the epicentre (on the Mercalli scale, by Gutenberg and
    // Richter's I0 = 1.5 (M - 1) for a shallow quake), how far the shaking carries (it dies away
    // with distance from a source that grows with the magnitude) and how long it goes on. Every
    // solid gives way at the intensity it does in real quakes (see SOLIDS): below magnitude 4
    // nothing breaks; at 5 glass and ice crack near the epicentre; at 6 clay and brick crack,
    // cliffs start to shed rock and the ground ruptures; at 7 brick buildings fall, rock near the
    // epicentre breaks up and soaked ground liquefies; at 8 timber is wrecked and steel bends;
    // at 9 the ruin is all but total. The ground sways back and forth harder the stronger the
    // shaking (the acceleration doubles with each step of intensity), so heaps slump, packed soil
    // lets go once the shaking reaches VII (tunnels and cliffs fall in) and ponds slosh.
    const quakeI0 = (m) => Math.min(12, Math.max(1, 1.5 * (m - 1)));
    const quakeNear = (m) => 8 * Math.pow(1.6, m - 5); // the size of the source, in cells
    const quakeI = (m, d) => quakeI0(m) - 3 * Math.log10(1 + d / quakeNear(m)); // the intensity d cells out
    // How far out the shaking still reaches intensity I (0 if it never does).
    function quakeRange(m, I) {
      const I0 = quakeI0(m);
      return I0 <= I ? 0 : quakeNear(m) * (Math.pow(10, (I0 - I) / 3) - 1);
    }
    // For the game's panel and cursor: the intensity at the epicentre, how long it shakes, and
    // how far out it does damage (VI) and severe damage (VIII).
    function quakeInfo(m) {
      return { intensity: quakeI0(m), seconds: 2.5 * Math.pow(1.5, m - 5), damage: quakeRange(m, 6), severe: quakeRange(m, 8) };
    }
    function startQuake(d) {
      const m = d.mag;
      d.I0 = quakeI0(m);
      d.life = Math.max(45, Math.round(60 * quakeInfo(m).seconds));
      d.far = Math.ceil(Math.min(Math.hypot(W, H), quakeRange(m, 3.5))); // beyond this nothing stirs
      // the intensity and how hard loose things are thrown about at each distance out
      d.itab = new Float32Array(d.far + 2); d.gtab = new Float32Array(d.far + 2);
      for (let k = 0; k < d.itab.length; k++) { d.itab[k] = quakeI(m, k); d.gtab[k] = 0.2 * Math.pow(2, d.itab[k] - 6); }
      if (airAt(idx(d.x, d.y))) d.y = Math.min(H - 1, floorY(d.x)); // aimed at the sky: it strikes the ground below
      // the surface rupture: from magnitude 6 the fault breaks through to the surface, for a
      // length that grows with the magnitude, and from 8 it splits into branches
      d.crack = []; d.opened = 0;
      if (m >= 6) {
        const len = Math.round(6 * Math.pow(1.9, m - 6)), wide = m >= 8 ? 3 : m >= 7 ? 2 : 1;
        rupture(d, d.x, len, wide);
        if (m >= 8) for (const side of [-1, 1]) rupture(d, d.x + side * Math.round(len * 0.45), Math.round(len * 0.6), 1);
      }
    }
    // A jagged crack down from the surface above column x0 (queued; it opens over the first second).
    function rupture(d, x0, len, wide) {
      let x = Math.max(1, Math.min(W - 3, x0)), y = floorY(x);
      for (let k = 0; k < len && y < H; k++, y++) {
        d.crack.push(x, y, k < len * 0.3 ? wide : Math.max(1, wide - 1));
        if (rnd() < 0.45) x += rnd() < 0.5 ? -1 : 1;
        x = Math.max(1, Math.min(W - 3, x));
      }
    }
    function quake(d) {
      const a = fade(d, 20, d.life * 0.4);
      const ramp = Math.log2(Math.max(a, 0.01)); // half the ground motion is one step of intensity less
      const sway = Math.sin(d.age * 0.5) * a;      // which way the ground is moving this tick
      events.rumble = Math.max(events.rumble, a * Math.max(0.15, Math.min(1, (d.I0 - 3) / 7)));
      events.shake += a * Math.min(2.5, 0.2 * Math.pow(2, d.I0 - 6));
      // the rupture opens over the first second. It splits the ground itself (rock, soil, masonry
      // and the like, whatever gives way by VII); timber and steel in its path buckle instead
      const n = d.crack.length / 3, want = Math.min(n, Math.ceil(((d.age + 1) / 60) * n));
      for (; d.opened < want; d.opened++) {
        const x = d.crack[d.opened * 3], y = d.crack[d.opened * 3 + 1], w = d.crack[d.opened * 3 + 2];
        for (let k = 0; k < w; k++) {
          const i = idx(x + k, y), t = type[i];
          if (P_CAT[t] === C_STATIC && QUAKE_FROM[t] <= 7) become(i, EMPTY);
          else if (catOf(i) === C_POWDER) flags[i] &= ~SETTLED;
        }
      }
      // every cell within reach (a great quake reaches the whole map, so this is kept lean)
      const itab = d.itab, gtab = d.gtab, x0 = d.x, y0 = d.y, far = d.far, F2 = far * far;
      for (let y = Math.max(0, y0 - far); y <= Math.min(H - 1, y0 + far); y++) {
        const dy2 = (y - y0) * (y - y0), span = Math.floor(Math.sqrt(Math.max(0, F2 - dy2)));
        const xa = Math.max(0, x0 - span), xb = Math.min(W - 1, x0 + span);
        for (let x = xa, i = idx(xa, y); x <= xb; x++, i++) {
          const t = type[i];
          if (t === EMPTY) continue;
          const c = catOf(i);
          if (c === C_STATIC && QUAKE_FROM[t] === NEVER) continue;
          const dist = Math.sqrt((x - x0) * (x - x0) + dy2) | 0, I = itab[dist] + ramp;
          if (I < 3.5) continue;
          if (c === C_POWDER) {
            if (t === DIRT && (flags[i] & SETTLED) && I < 7) continue; // packed soil holds till VII
            const g = Math.min(1.3, gtab[dist] * a) * heft(i); // how hard it is thrown about here
            if (rnd() < g * 0.6) {
              vx[i] += sway * Math.min(1, g) * 0.8 + (rnd() - 0.5) * g;
              if (rnd() < 0.25) vy[i] -= rnd() * g * 1.4;
              flags[i] &= ~SETTLED;
            }
            // liquefaction: soaked soil shaken at VIII and over turns to a slurry and flows
            if (t === DIRT && I >= 8 && rnd() < 0.003 * (I - 7)) {
              const u = type[i - SW];
              if (u === WATER || u === SALTWATER) become(i, MUD);
            }
          } else if (c === C_LIQUID) {
            const g = Math.min(1.3, gtab[dist] * a);
            if (rnd() < g * 0.5) vx[i] += sway * Math.min(1, g) * 0.7;
          } else if (c === C_STATIC) {
            const from = QUAKE_FROM[t];
            const Ie = FACE_FIRST[t] && (open(i - SW) || open(i + SW) || open(i - 1) || open(i + 1)) ? I + 1 : I;
            if (Ie <= from) continue;
            const f = Math.min(1.5, (Ie - from) / (QUAKE_RUIN[t] - from));
            if (rnd() < 0.005 * f * f) { crumble(i); events.cracks++; }
          }
        }
      }
    }

    // Tornado: a funnel of rising, whirling air hanging from a storm cloud. It travels along the
    // ground (toward the cursor while the button is held), and what it passes over, sand, water,
    // plants torn up by the roots, people and animals, is drawn in, whirled up the funnel and
    // flung out at the top. The air field carries smoke and spray round with it.
    // The ground under a tornado: the first cell down from row `from` that is solid, or sand or
    // water lying still on more of the same. The debris whirling up the funnel is all moving, so
    // it is never mistaken for the ground.
    function resting(i) {
      const t = type[i];
      if (t === EMPTY || t === BOUND) return t === BOUND;
      const c = catOf(i);
      return c === C_STATIC || ((c === C_POWDER || c === C_LIQUID) && vy[i] > -0.2 && vy[i] < 0.5);
    }
    function groundUnder(x, from) {
      for (let y = Math.max(0, from), i = idx(x, y); y < H; y++, i += SW) if (resting(i) && resting(i + SW)) return y;
      return H - 1;
    }
    function startTornado(d) {
      d.life = Math.round(780 + 180 * d.size);
      d.fx = d.x; d.vx = 0; d.heading = d.x < W / 2 ? 1 : -1; d.tx = -1;
      d.b = d.r;                       // half-width of its foot
      d.slope = 0.22 + 0.06 * d.size;  // how fast it widens with height
      d.top = skyY();
      d.gy = Math.min(H - 1, floorY(d.x));
      cloudBank(d.x, 18, d.top - 2, STORMCLOUD);
    }
    function tornado(d) {
      const env = fade(d, 45, 70);
      const want = d.tx >= 0 ? Math.max(-0.6, Math.min(0.6, (d.tx - d.fx) * 0.02)) : d.heading * 0.18 + weather.wind * 0.04;
      d.vx += (want - d.vx) * 0.04 + (rnd() - 0.5) * 0.02;
      d.fx += d.vx;
      if (d.fx < 6) { d.fx = 6; d.heading = 1; d.vx = Math.abs(d.vx); }
      else if (d.fx > W - 7) { d.fx = W - 7; d.heading = -1; d.vx = -Math.abs(d.vx); }
      const x0 = d.x = Math.round(d.fx);
      d.gy += Math.max(-2, Math.min(2, groundUnder(x0, Math.round(d.gy) - 6) - d.gy)); // follows the lie of the land
      if (d.age % 40 === 0) puff(x0, d.top - 1, 7, 2, STORMCLOUD);
      events.howl = Math.max(events.howl, env * Math.min(1, 0.6 + d.size * 0.4));
      const gy = Math.round(d.gy), top = d.top, tall = gy - top, spin = d.age * 0.35;
      for (let y = top; y <= Math.min(H - 1, gy + 1); y++) {
        const h = gy - y, hw = h <= 2 ? d.b * 2 : d.b + h * d.slope, R = Math.ceil(hw);
        const fling = h > tall * 0.86; // out of the top it goes
        for (let dx = -R; dx <= R; dx++) {
          const x = x0 + dx;
          if (x < 0 || x >= W) continue;
          const i = idx(x, y), t = type[i];
          if (t === EMPTY || t === BOUND) continue;
          const c = catOf(i), core = 1 - Math.abs(dx) / (hw + 1);
          if (c === C_POWDER || c === C_LIQUID) {
            // only the surface is torn off the ground, a little at a time (so it digs a trench as
            // it goes, down to the rock under loose ground)
            if (h <= 2 && (!open(i - SW) || rnd() > 0.12 * env * core * heft(i))) continue; // light stuff goes first
            if (fling) {
              vx[i] = (dx < 0 || (dx === 0 && rnd() < 0.5) ? -1 : 1) * (2 + rnd() * 2.5) * env;
              vy[i] = -rnd() * 0.8;
            } else {
              // whirled about the axis, never further out than the funnel is wide
              vy[i] = Math.min(vy[i], -(0.9 + 1.7 * core) * env * Math.min(1, heft(i)));
              vx[i] = -dx * 0.12 + Math.sin(spin + y * 0.21) * hw * 0.12 * env;
            }
            flags[i] &= ~SETTLED;
          } else if (c === C_LIFE) {
            if (t === HEAD || rnd() > 0.85 * env) continue;
            if (t === HUMAN) dangle(i, -Math.sign(dx), fling ? 0 : -2);
            else { const j = i - SW - Math.sign(dx); if (open(j)) swap(i, j); }
          } else if (c === C_STATIC && h <= 5 && core > 0.25 && BREAKS[t] && P_DENS[t] < 8 && rnd() < 0.03 * env) {
            crumble(i); // ripped up: what is light (plants, timber) goes up as debris
          }
        }
      }
      // the air rises up the funnel, and is drawn in along the ground at its foot
      const ax0 = Math.floor(x0 / AS);
      for (let ay = Math.floor(top / AS); ay <= Math.min(AH - 1, Math.floor(gy / AS)); ay++) {
        const h = gy - ay * AS, hw = (d.b + Math.max(0, h) * d.slope) / AS, n = Math.ceil(hw);
        for (let k = -n; k <= n; k++) {
          const ax = ax0 + k;
          if (ax < 0 || ax >= AW) continue;
          const a = ay * AW + ax;
          if (ablk[a]) continue;
          const core = 1 - Math.abs(k) / (hw + 1);
          if (avy[a] > -4 * core * env) avy[a] = -4 * core * env;
          if (h < 12 && k) avx[a] -= Math.sign(k) * 1.2 * env;
        }
      }
    }

    // Solar storm: a burst of charged particles from the sun meets the world's magnetic field. Every
    // switch trips off at once (and stays off until you flip it back), and while the storm lasts no
    // circuit works: no battery, cell, panel or sensor can drive a current through it (see energize()
    // and electric()), so lamps go dark, pumps, valves and pistons stop, and a flying ship's thrusters
    // cut out. Long runs of wire and metal pick up surges that crackle with sparks and heat them, the
    // more the bigger the storm. An aurora ripples across the sky (render.js drawAurora()).
    function startSolar(d) {
      d.life = Math.round(600 + 300 * d.size);
      empLeft = Math.max(empLeft, d.life);
      for (let i = 0; i < N; i++) {
        const t = type[i];
        if (t === SWITCH) aux[i] = 0;
        else if (P_CONSUMER[t]) sap[i] = 0;
        if (charge[i]) charge[i] = 0;
      }
    }
    function solar(d) {
      const env = fade(d, 60, 150);
      if (empLeft < d.life - d.age) empLeft = d.life - d.age;
      // surges: here and there along the metal and the wiring, a crackle of sparks and a burst of heat
      // (as often as a random look lands on metal, so the more metal there is the more surges, but each
      // warms it only a little: wiring gets hot enough to set a wooden house alight, never to melt)
      const want = Math.round((1 + 2 * d.size) * env);
      for (let k = 0, got = 0; k < 150 && got < want; k++) {
        const i = idx((rnd() * W) | 0, (rnd() * H) | 0), t = type[i];
        if (!P_CONDUCT[t] || catOf(i) !== C_STATIC) continue;
        temp[i] += (25 + rnd() * 50) * (0.6 + 0.4 * d.size);
        flashRx(i, SPARK);
        events.zap++;
        got++;
      }
    }

    // Volcano: magma rises from the bottom of the map under where you aim, slowly, melting a
    // glowing pipe up through the rock as it climbs while the ground rumbles. How far up it can
    // climb grows with the brush size (a third of the map at the smallest, all of it at the
    // largest): if it runs out of strength underground it stays there as a pocket of lava that
    // cools; if it reaches open air or water it erupts. The eruption throws a fountain of lava
    // (which cools on the slopes into new stone, so it builds its own cone), glowing bombs and a
    // column of hot ash, building up to no higher than the rise the magma has left. Aimed over
    // open ground with nothing under it, it erupts straight from the bottom of the map, to that
    // height and no further.
    const VOLCANO_RISE = 0.7; // cells a tick the magma climbs
    // How far above the bottom of the map the magma of a volcano this size can rise.
    const volcanoReach = (size) => Math.round(H * Math.max(0.25, Math.min(1, 0.2 + 0.24 * size)));
    function startVolcano(d) {
      d.phase = 'rise';
      d.reach = volcanoReach(d.size);
      d.w = Math.max(1, Math.round(d.size)); // half the pipe's width
      d.head = H;                            // the top of the magma, which starts under the map
      d.life = Math.ceil(d.reach / VOLCANO_RISE) + 120; // its breaking out (or not) sets the rest
    }
    // Melt the rows of the pipe from y0 down to y1 (where it has cooled, keeping the throat open).
    function meltPipe(d, y0, y1) {
      for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
        const w = y - y0 < 6 ? Math.max(1, d.w - 1) : d.w; // it narrows toward the vent
        for (let dx = -w; dx <= w; dx++) {
          const x = d.x + dx;
          if (x < 0 || x >= W) continue;
          const i = idx(x, y), t = type[i];
          if (t === LAVA || unbreakable(t)) continue;
          const c = catOf(i);
          if (c === C_STATIC || c === C_POWDER) { become(i, LAVA); temp[i] = 1300; }
        }
      }
    }
    function volcanoRise(d) {
      events.shake += 0.15;
      events.rumble = Math.max(events.rumble, 0.45);
      const next = Math.max(H - d.reach, d.head - VOLCANO_RISE);
      for (let y = Math.ceil(d.head) - 1; y >= Math.ceil(next); y--) { // the rows it climbs into this tick
        const i = idx(d.x, y);
        // magma already standing in its way (a volcano's own pipe) is pushed up ahead of it, so climbing
        // through that costs none of its reach: it comes out wherever that magma meets the air
        if (type[i] === LAVA) { d.reach++; d.life += 1.5; continue; }
        if (airAt(i) || catOf(i) === C_LIQUID) { volcanoErupt(d, y + 1); return; } // through to the surface
        if (unbreakable(type[i])) { volcanoSpent(d); return; }                        // nothing gets through that
        meltPipe(d, y, y);
        for (const dx of [-d.w - 1, d.w + 1]) { // the rock round it glows
          const x = d.x + dx;
          if (x >= 0 && x < W) temp[idx(x, y)] += 260;
        }
      }
      d.head = next;
      if (d.head <= H - d.reach) volcanoSpent(d);
    }
    function volcanoErupt(d, vent) {
      d.phase = 'erupt'; d.vent = vent; d.at = d.age;
      d.life = d.age + Math.round(560 + 160 * d.size);
    }
    function volcanoSpent(d) { d.phase = 'spent'; d.at = d.age; d.life = d.age + 90; }
    function volcano(d) {
      if (d.phase === 'rise') { volcanoRise(d); return; }
      if (d.phase === 'spent') { // the rumbling dies away over the pocket of magma it left
        const k = 1 - (d.age - d.at) / 90;
        events.shake += 0.15 * k;
        events.rumble = Math.max(events.rumble, 0.45 * k);
        return;
      }
      const age = d.age - d.at, env = Math.max(0, Math.min(1, (age + 1) / 30, (d.life - d.age) / 120));
      events.shake += 0.3 * env;
      events.rumble = Math.max(events.rumble, 0.7 * env);
      const surge = env * (0.65 + 0.35 * Math.sin(d.age * 0.08)) * (rnd() < 0.04 ? 1.6 : 1);
      if (age % 12 === 0) meltPipe(d, d.vent, d.vent + 24); // keep the throat open as the lava in it cools
      // The magma can push lava no higher than its reach: as the cone builds up toward that, the
      // vent rises with it and the eruption weakens, and once the cone gets there it is spent.
      const ceiling = H - d.reach;
      // where it comes out: the first open cell above the vent, melting through anything in the way.
      // Only what has landed builds the cone: lava still flying in the fountain counts as open air,
      // or the vent would climb its own spray
      let e = -1, ey = d.vent - 1;
      for (let k = 0; k < 24 && ey > ceiling; k++, ey--) {
        const i = idx(d.x, ey), t = type[i];
        if (airAt(i) || !resting(i)) { e = i; break; }
        if (t !== LAVA && !unbreakable(t) && catOf(i) !== C_LIQUID) { become(i, LAVA); temp[i] = 1300; }
      }
      if (e < 0) { if (ey <= ceiling) volcanoSpent(d); return; } // the cone has built up as high as it can push
      // the ash plume rises no higher than the volcano reaches: there it spreads out and thins away,
      // and the ash and embers it carries up fall out of it
      if (ceiling > 4) {
        for (let y = Math.max(0, ceiling - 10); y <= ceiling; y++) {
          for (let x = Math.max(0, d.x - 50); x <= Math.min(W - 1, d.x + 50); x++) {
            const i = idx(x, y);
            const t = type[i];
            if ((t === SMOKE || t === ASH || t === EMBER) && rnd() < 0.8) become(i, EMPTY);
          }
        }
      }
      d.vent = ey + 1;
      // how high it throws: building up, to no more than the height it has left above the vent (a
      // ballistic throw tops out at v² / 2g)
      const high = (d.vent - ceiling) * Math.min(1, (age + 20) / 110), vmax = Math.min(5, Math.sqrt(2 * GRAV * high));
      const n = sround((2 + d.size * 2) * surge);
      for (let k = 0; k < n; k++) {
        const x = d.x + Math.round((rnd() * 2 - 1) * Math.max(1, d.w - 1));
        if (x < 0 || x >= W) continue;
        const i = idx(x, ey);
        if (!airAt(i)) continue;
        place(i, LAVA); temp[i] = 1250 + rnd() * 150;
        vy[i] = -Math.min(vmax, (0.55 + rnd() * 0.45) * vmax * surge); vx[i] = (rnd() - 0.5) * 2.4; // a burst throws harder, never higher
      }
      if (rnd() < 0.06 * surge && airAt(e)) { // a volcanic bomb
        place(e, rnd() < 0.5 ? EMBER : RUBBLE); temp[e] = 950;
        vy[e] = -vmax; vx[e] = (rnd() - 0.5) * 6;
      }
      for (let k = 0; k < 3; k++) { // the ash column, which thins out at about the same height
        const x = d.x + ((rnd() * 7) | 0) - 3, y = ey - 2 - ((rnd() * 6) | 0);
        if (x < 0 || x >= W || y < 0) continue;
        const i = idx(x, y);
        if (type[i] !== EMPTY) continue;
        if (rnd() < 0.12) { place(i, ASH); vy[i] = -Math.min(3, vmax); temp[i] = 300; }
        else { place(i, SMOKE); temp[i] = 420; data[i] = Math.max(6, Math.round(high * (0.3 + 0.3 * rnd()))); } // the warm plume lifts it faster than it rises by itself
      }
      // an updraft over the vent, held at a strength to match (adding to it every tick would build a
      // jet that carried the plume, and the lava with it, right up to the top of the sky)
      const a = Math.floor(Math.max(0, ey - 4) / AS) * AW + Math.floor(d.x / AS), lift = 1.2 * surge * Math.min(1, high / 40);
      if (!ablk[a] && avy[a] > -lift) avy[a] = -lift;
    }

    // Meteor: a burning rock comes in at a slant from high over the side you aim at, trailing
    // fire, and hits where you aimed (or whatever is in its way): a blast that digs a crater,
    // throws rubble out of it and melts the rock round its rim, and the meteorite itself left
    // glowing at the bottom. A couple of smaller fragments follow it down.
    const METEOR_V = 4.5;
    function startMeteor(d) {
      d.life = 600;
      const dir = d.x < W / 2 ? -1 : 1;
      const sx = d.x + dir * (d.y + 8) * 0.55, sy = -6, dx = d.x - sx, dy = d.y - sy, len = Math.hypot(dx, dy);
      d.px = sx; d.py = sy; d.vx = (dx / len) * METEOR_V; d.vy = (dy / len) * METEOR_V; d.hit = false;
      if (d.fragment) return;
      for (let k = 0; k < 2; k++) {
        const x = Math.round(d.x + (k ? 1 : -1) * (12 + rnd() * 24) * Math.sqrt(d.size));
        if (x < 0 || x >= W) continue;
        const f = {
          id: ++disasterSeq, kind: 'meteor', size: d.size * 0.4, age: 0, life: 1, delay: 8 + ((rnd() * 30) | 0), fragment: true,
          x, y: Math.min(H - 1, floorY(x)),
        };
        f.r = weaponReach('meteor', f.size);
        startMeteor(f);
        disasters.push(f);
      }
    }
    function meteor(d) {
      for (let s = 0; s < 5; s++) {
        d.px += d.vx / 5; d.py += d.vy / 5;
        const x = Math.round(d.px), y = Math.round(d.py);
        if (y >= H) { meteorImpact(d, Math.max(0, Math.min(W - 1, x)), H - 1); return; }
        if (x < -60 || x >= W + 60) { d.life = d.age + 1; return; } // gone past the edge of the map
        if (x < 0 || x >= W || y < 0) continue;
        const i = idx(x, y);
        if (!airAt(i)) { meteorImpact(d, x, y); return; }
        if (type[i] !== FIRE) { become(i, FIRE); data[i] = 6 + ((rnd() * 10) | 0); }
        temp[i] = 2500;
      }
      // smoke and flame peel off the trail
      const bx = Math.round(d.px - d.vx * 1.5), by = Math.round(d.py - d.vy * 1.5);
      for (let k = 0; k < 2; k++) {
        const x = bx + ((rnd() * 5) | 0) - 2, y = by + ((rnd() * 5) | 0) - 2;
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const i = idx(x, y);
        if (type[i] === EMPTY) { if (rnd() < 0.5) { place(i, FIRE); data[i] = 10 + ((rnd() * 20) | 0); } else place(i, SMOKE); }
      }
    }
    function meteorImpact(d, x0, y0) {
      d.hit = true; d.life = d.age + 1;
      const r = Math.max(2, Math.round(d.r)), R = Math.round(r * 1.7);
      explode(x0, y0, r, 1.6 + 0.3 * Math.min(2, d.size), 0);
      events.flash += Math.min(0.9, 0.2 + 0.25 * d.size);
      events.shake += 3 + 3 * d.size;
      forDisc(x0, y0, R, (i, dx, dy, d2) => {
        const t = type[i];
        if (unbreakable(t)) return;
        const dist = Math.sqrt(d2);
        if (dist <= r * 0.7) { if (!airAt(i)) become(i, EMPTY); return; } // the crater
        temp[i] += 1100 * (1 - dist / R); // the rim is left red-hot, and some of it melts
        if (P_CAT[t] === C_STATIC && rnd() < 0.35 && crumble(i)) fling(i, dx, dy, dist, r, 1.2); // ejecta
        else if (catOf(i) === C_POWDER) fling(i, dx, dy, dist, r, 1.2);
      });
      // the meteorite: a lump of molten iron that sinks to the floor of the crater and sets
      forDisc(x0, Math.min(H - 1, y0 + Math.round(r * 0.4)), Math.max(1, r * 0.16), (i) => {
        if (!unbreakable(type[i])) { place(i, MMETAL); temp[i] = 1700; }
      });
    }

    // Lightning storm: a bank of storm cloud rolls in over where you aim and calls down bolt after
    // bolt under it, with a downpour.
    function startStorm(d) {
      d.life = Math.round(360 + 120 * d.size);
      d.cy = skyY();
      cloudBank(d.x, Math.round(d.r), d.cy - 2, STORMCLOUD);
      d.next = 12;
    }
    function storm(d) {
      const env = fade(d, 1, 60), span = d.r;
      if (--d.next <= 0) {
        d.next = 4 + (((rnd() * 14) / Math.max(0.6, d.size)) | 0);
        const x = Math.max(0, Math.min(W - 1, Math.round(d.x + (rnd() * 2 - 1) * span)));
        spawnBolt(x, d.cy + 3, false);
      }
      for (let k = sround(2 * d.size * env); k > 0; k--) {
        const x = Math.round(d.x + (rnd() * 2 - 1) * span), y = d.cy + 3 + ((rnd() * 3) | 0);
        if (x < 0 || x >= W || y >= H) continue;
        const i = idx(x, y);
        if (type[i] === EMPTY) { place(i, ambient <= 0 ? SNOW : WATER); vy[i] = 1.5; }
      }
    }

    // Ice age: a front of deadly cold spreads out from where you aim, and everything it passes
    // drops to −100°C or below. Water and lava freeze over, flames go out, plants die of frost,
    // people and animals caught in it freeze solid, and snow falls from a cloud that forms over it.
    function startFreeze(d) {
      d.life = 150; d.rf = 0;
      cloudBank(d.x, Math.round(d.r * 0.8), skyY() - 2, SNOWCLOUD);
    }
    function freeze(d) {
      const rf = d.r * Math.min(1, (d.age + 1) / 80), r0 = d.rf, all = d.age % 3 === 0;
      d.rf = rf;
      forDisc(d.x, d.y, rf, (i, dx, dy, d2) => {
        const dist = Math.sqrt(d2), front = dist > r0 - 1;
        if (!all && !front) return; // the newly reached ring every tick, all of it every third
        const t = type[i], cold = -100 - 80 * (1 - dist / d.r);
        if (temp[i] > cold) temp[i] = cold;
        if (t === EMPTY) {
          // frost settles on the ground as the front passes
          if (front && rnd() < 0.04) { const b = type[i + SW]; if (b !== EMPTY && b !== BOUND && catOf(i + SW) !== C_GAS && catOf(i + SW) !== C_LIQUID) place(i, SNOW); }
          return;
        }
        if (t === FIRE || t === PLASMA) become(i, EMPTY);
        else if (t === EMBER) become(i, ASH); // an ember keeps itself alight, so it is quenched outright
        else if (flags[i] & BURN) flags[i] &= ~BURN;
        else if (P_CAT[t] === C_LIFE && t !== HEAD && rnd() < 0.08) {
          if (t === HUMAN && type[i - SW] === HEAD) become(i - SW, ICE);
          become(i, ICE);
        }
      });
    }

    // Acid rain: a dark bank of cloud drifts over where you aim and rains acid, which eats into
    // whatever it lands on.
    function startAcidRain(d) {
      d.life = Math.round(420 + 140 * d.size);
      d.cy = skyY();
      cloudBank(d.x, Math.round(d.r), d.cy - 2, RAINCLOUD);
    }
    function acidRain(d) {
      const env = fade(d, 20, 80);
      for (let k = sround(1.4 * d.size * env); k > 0; k--) {
        const x = Math.round(d.x + (rnd() * 2 - 1) * d.r), y = d.cy + 3 + ((rnd() * 3) | 0);
        if (x < 0 || x >= W || y >= H) continue;
        const i = idx(x, y);
        if (type[i] === EMPTY) { place(i, ACID); vy[i] = 2; }
      }
    }

    // Nuke: a fireball hotter than the surface of the sun that vaporises everything near it, a
    // blast wave that flattens and throws everything further out, a flash that sets fire to
    // whatever burns and can see it, radiation, and a mushroom cloud climbing over ground zero.
    function startNuke(d) {
      const r = Math.round(d.r), x0 = d.x, y0 = d.y, F = r * 0.75, HOT = r * 2, SEE = r * 5;
      d.life = 330;
      explode(x0, y0, r, 3, 0);
      forDisc(x0, y0, SEE, (i, dx, dy, d2) => {
        const t = type[i];
        if (unbreakable(t)) return;
        const dist = Math.sqrt(d2);
        if (dist <= F) { // vaporised
          become(i, dist < F * 0.4 ? PLASMA : FIRE);
          temp[i] = 6000 - 4000 * (dist / F); data[i] = 10 + ((rnd() * 30) | 0);
          return;
        }
        if (dist <= HOT) temp[i] += 2200 * (1 - (dist - F) / (HOT - F)); // rock melts, sand runs to glass
        if (P_FLAM[t] > 0 && !(flags[i] & BURN) && hasAir(i) && rnd() < 0.9 * (1 - dist / SEE)) ignite(i);
        if (t === EMPTY && dist <= r * 2 && rnd() < 0.03) place(i, RAD);
      });
      // the blast wave: a ring of high pressure the air carries out across the map
      const ax0 = (x0 + 0.5) / AS, ay0 = (y0 + 0.5) / AS, ar = (SEE * 1.4) / AS;
      for (let ay = Math.max(0, Math.floor(ay0 - ar)); ay <= Math.min(AH - 1, Math.floor(ay0 + ar)); ay++) {
        for (let ax = Math.max(0, Math.floor(ax0 - ar)); ax <= Math.min(AW - 1, Math.floor(ax0 + ar)); ax++) {
          const ex = ax + 0.5 - ax0, ey = ay + 0.5 - ay0, dd = Math.sqrt(ex * ex + ey * ey);
          if (dd >= ar || dd < 0.5) continue;
          const a = ay * AW + ax, k = 1 - dd / ar;
          ap[a] = Math.min(AIR_MAXP, ap[a] + 55 * k);
          avx[a] += (ex / dd) * 4 * k; avy[a] += (ey / dd) * 4 * k;
        }
      }
      events.flash += 1.6; events.shake += 14; events.rad += 40;
    }
    function nuke(d) { mushroom(d.r, d.x, d.y, d.age); }
    // A mushroom cloud of scale r over ground zero (x0, y0), `age` ticks after the blast. A big one
    // is laid down thinner, so its smoke doesn't swamp the map.
    function mushroom(r, x0, y0, age) {
      const rise = Math.max(0, Math.min(y0 - 6, r * 3.2)) * Math.min(1, Math.sqrt(age / 160));
      const cy = Math.round(y0 - rise);
      const capR = Math.round(r * (0.5 + 1.1 * Math.min(1, age / 170))), capH = Math.max(2, Math.round(capR * 0.45));
      if (age < 220) {
        const sw = Math.ceil(r * 0.16);
        const pStem = Math.min(0.16, 200 / Math.max(1, (2 * sw + 1) * (y0 - cy - capH)));
        const pCap = Math.min(0.09, 450 / (Math.PI * capR * capH));
        for (let y = cy + capH; y < y0; y++) { // the stem
          for (let dx = -sw; dx <= sw; dx++) {
            const x = x0 + dx;
            if (x < 0 || x >= W || y < 0 || rnd() > pStem) continue;
            const i = idx(x, y);
            if (type[i] === EMPTY) { place(i, SMOKE); temp[i] = 260; }
          }
        }
        forDisc(x0, cy, capR, (i, dx, dy) => { // the cap: a flattened ball, lit by fire underneath while it is young
          if ((dy * dy) / (capH * capH) + (dx * dx) / (capR * capR) > 1 || rnd() > pCap || type[i] !== EMPTY) return;
          if (age < 100 && dy > 0 && rnd() < 0.35) { place(i, FIRE); data[i] = 8 + ((rnd() * 10) | 0); }
          else { place(i, SMOKE); temp[i] = 200; }
        });
      }
      // the air turns over in a ring under the cap, as in a real mushroom cloud: up the stem, out
      // along the cap and curling down round its rim, so the smoke spreads into a cap instead of
      // climbing straight up (smoke goes where the air takes it before it rises by itself)
      if (age < 260) {
        const sw = Math.ceil(r * 0.16);
        for (let ay = Math.max(0, Math.floor((cy - capH) / AS)); ay <= Math.min(AH - 1, Math.floor((y0 - 2) / AS)); ay++) {
          const yy = ay * AS + 2;
          for (let ax = Math.max(0, Math.floor((x0 - capR * 1.2) / AS)); ax <= Math.min(AW - 1, Math.floor((x0 + capR * 1.2) / AS)); ax++) {
            const a = ay * AW + ax;
            if (ablk[a]) continue;
            const ex = (ax * AS + 2 - x0) / capR;
            if (yy <= cy + capH) {
              const ey = (yy - cy) / capH;
              if (ex * ex + ey * ey > 1.44) continue;
              avx[a] = Math.sign(ex) * Math.min(1, Math.abs(ex) * 2.5) * 1.3;
              avy[a] = Math.abs(ex) > 0.8 ? 0.6 : -0.15;
            } else if (Math.abs(ax * AS + 2 - x0) <= sw + 3) avy[a] = -1.6;
          }
        }
      }
      for (let k = 0; k < 3; k++) { // fallout
        const x = Math.round(x0 + (rnd() * 2 - 1) * r * 2), y = Math.round(y0 + (rnd() * 2 - 1) * r);
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const i = idx(x, y);
        if (type[i] === EMPTY) { place(i, RAD); events.rad++; }
      }
    }

    // Hydrogen bomb: a thermonuclear bomb dropped from high above where you aim. It falls nose
    // down, faster and faster until the air holds it to its terminal speed, whistling as it comes,
    // and goes off the moment it touches anything below. Its blast takes two-thirds of the whole
    // map, wherever it lands: the fireball vaporises the heart of it, everything out to the edge
    // of the blast is blown apart, burnt or melted, and what is left near the edge is torn loose
    // and thrown. Beyond that the heat flash sets fire to whatever burns and can see it, the blast
    // wave carries on to the edges of the map, radiation falls out, and a mushroom cloud climbs
    // to the top of the sky. Only Wall, Clone and Void come through it.
    const HBOMB_G = 0.04, HBOMB_VMAX = 1.3, HBOMB_SHARE = 2 / 3; // a drop takes two or three seconds
    function startHbomb(d) {
      d.phase = 'fall'; d.px = d.x; d.py = -8; d.vy = 0.4;
      d.life = 6000; // it falls for as long as it takes; landing sets the blast's own span
    }
    // The radius round (x0, y0) inside which `share` of the whole map lies, worked out row by row.
    function coverRadius(x0, y0, share) {
      const want = share * W * H, cx0 = x0 + 0.5, cy0 = y0 + 0.5;
      let lo = 0, hi = Math.hypot(Math.max(cx0, W - cx0), Math.max(cy0, H - cy0));
      for (let k = 0; k < 30; k++) {
        const r = (lo + hi) / 2;
        let area = 0;
        for (let y = 0; y < H; y++) {
          const dy = y + 0.5 - cy0;
          if (dy > r || dy < -r) continue;
          const half = Math.sqrt(r * r - dy * dy);
          area += Math.max(0, Math.min(W, cx0 + half) - Math.max(0, cx0 - half));
        }
        if (area < want) lo = r; else hi = r;
      }
      return hi;
    }
    // Where a hydrogen bomb dropped over column x would land, and how far its blast would reach
    // (for the cursor; remembered while the cursor stays over the same spot).
    let drop = { x: -1, y: -1, r: 0 };
    function dropPoint(x) {
      x = Math.max(0, Math.min(W - 1, Math.round(x)));
      const y = Math.min(H - 1, floorY(x));
      if (x !== drop.x || y !== drop.y) drop = { x, y, r: coverRadius(x, y, HBOMB_SHARE) };
      return drop;
    }
    function hbomb(d) {
      if (d.phase === 'gone') return; // swallowed by a black hole
      if (d.phase === 'fall') { hbombFall(d); return; }
      if (d.phase === 'drift') { hbombDrift(d); return; }
      const age = d.age - d.at; // ticks since it went off
      events.shake += Math.max(0, 2.5 * (1 - age / 120));
      mushroom(d.mr, d.x, d.y, age);
    }
    function hbombFall(d) {
      // inside a black hole's reach (the ring its brush showed) it is caught and spirals in,
      // whistling, until the hole swallows it
      for (const b of disasters) {
        if (b.kind !== 'blackhole' || b.age >= b.life) continue;
        const dx = d.px - b.x, dy = d.py - b.y, dist = Math.hypot(dx, dy);
        if (dist > b.r) continue;
        d.phase = 'drift'; d.hole = b.id;
        d.rad = d.rad0 = Math.max(1, dist); d.ang = Math.atan2(dy, dx); d.dv = 0.25;
        d.wp = Math.min(0.6, Math.max(0.05, (d.py + 8) / (Math.min(H - 1, floorY(d.x)) + 8)));
        return;
      }
      d.vy = Math.min(HBOMB_VMAX, d.vy + HBOMB_G);
      const x = d.x, y1 = d.py + d.vy;
      for (let y = Math.max(0, Math.ceil(d.py)); y <= Math.min(H - 1, Math.floor(y1)); y++) {
        const i = idx(x, y), t = type[i];
        if (!airAt(i) && t !== BIRD && t !== FIREFLY) { hbombBlast(d, x, y); return; } // it passes birds by
      }
      d.py = y1;
      if (d.py >= H - 1) { hbombBlast(d, x, H - 1); return; }
      // still in the air: how far down it has come, for the whistle (which stops as it lands)
      const land = Math.min(H - 1, floorY(x));
      events.whistle = Math.max(events.whistle, Math.min(1, Math.max(0.01, (d.py + 8) / (land + 8))));
    }
    // Caught by a black hole: the bomb spirals in, faster as it nears, turning to point at the middle
    // and shrinking into the dark, whistling all the way down. Only once it reaches the middle is it
    // swallowed: then, without a sound, the hole grows half as big again (over a second or so) and
    // lasts five seconds longer, and its rumble deepens. It holds five; the sixth is too much, and
    // the whole map goes up. If the hole is gone before it gets there, the bomb falls on.
    function hbombDrift(d) {
      const b = disasters.find((q) => q.id === d.hole && q.age < q.life);
      if (!b) { d.phase = 'fall'; d.vy = 0.4; d.rot = 0; d.scale = 1; d.x = Math.max(0, Math.min(W - 1, Math.round(d.px))); return; }
      d.dv = Math.min(1.4, d.dv + 0.02);
      d.rad -= d.dv;
      d.ang += 0.04 + 0.5 / Math.max(4, d.rad);
      d.px = b.x + Math.cos(d.ang) * Math.max(0, d.rad);
      d.py = b.y + Math.sin(d.ang) * Math.max(0, d.rad);
      d.x = Math.max(0, Math.min(W - 1, Math.round(d.px)));
      d.rot = d.ang + Math.PI / 2; // its nose (drawn pointing down) toward the middle
      d.scale = Math.max(0.12, Math.min(1, d.rad / d.rad0 + 0.15));
      const f = 1 - Math.max(0, d.rad) / d.rad0;
      events.whistle = Math.max(events.whistle, d.wp + (1 - d.wp) * f);
      if (d.rad > b.rh * 0.6) return;
      d.life = d.age + 1; d.phase = 'gone';
      b.fed = (b.fed || 0) + 1;
      if (b.fed > HOLE_HOLDS) { holeBurst(b); return; }
      b.rTo = Math.min(Math.hypot(W, H), (b.rTo || b.r) * 1.5);
      b.rhTo = Math.min(40, (b.rhTo || b.rh) * 1.5);
      b.life += 300;
      events.shake += 3;
    }
    // A black hole that swallowed one hydrogen bomb too many: every bomb in it goes off at once, and
    // the fireball takes the whole map.
    const HOLE_HOLDS = 5;
    function holeBurst(b) {
      b.life = b.age + 1;
      const d = { id: ++disasterSeq, kind: 'hbomb', size: 4, mag: 7, r: 0, age: 0, life: 1, delay: 0, x: b.x, y: b.y };
      disasters.push(d);
      hbombBlast(d, b.x, b.y, true);
    }
    function hbombBlast(d, x0, y0, whole = false) {
      // (whole: a fireball over every cell of the map, as when a black hole bursts)
      const R = whole ? Math.hypot(W, H) + 2 : coverRadius(x0, y0, HBOMB_SHARE), CORE = whole ? R : R * 0.3, WRECK = R * 0.75, FLASH = R * 1.35;
      d.phase = 'blast'; d.x = x0; d.y = y0; d.r = R; d.at = d.age;
      d.mr = Math.max(18, Math.min(W * 0.22, R * 0.28)); // how big its mushroom cloud is
      d.life = d.age + 420;
      events.hbomb.push(x0, y0, Math.round(R));
      events.rad += 120;
      forDisc(x0, y0, FLASH, (i, dx, dy, d2) => {
        const t = type[i];
        if (unbreakable(t)) return;
        const dist = Math.sqrt(d2);
        if (dist <= CORE) { // the fireball: vaporised
          become(i, dist < CORE * 0.5 ? PLASMA : FIRE);
          temp[i] = 9000 - 6000 * (dist / CORE); data[i] = 12 + ((rnd() * 40) | 0);
          return;
        }
        if (dist <= R) { // the blast: blown apart, burnt or melted
          const k = (dist - CORE) / (R - CORE); // 0 at the fireball's edge, 1 at the blast's
          temp[i] += 2800 * (1 - k) + 250;
          if (t === EMPTY) {
            if (rnd() < 0.3 * (1 - k)) { become(i, FIRE); data[i] = 6 + ((rnd() * 20) | 0); }
            return;
          }
          if (dist <= WRECK || rnd() < 1.6 * (1 - k)) {
            if (t === WATER || t === SALTWATER) { become(i, STEAM); return; }
            const q = rnd();
            become(i, q < 0.45 ? FIRE : q < 0.7 ? SMOKE : EMPTY);
            if (type[i] === FIRE) data[i] = 8 + ((rnd() * 30) | 0);
            return;
          }
          // what is left near the edge is torn loose and thrown outward
          if (P_CAT[t] === C_STATIC) crumble(i);
          const c = catOf(i);
          if (c === C_POWDER || c === C_LIQUID) fling(i, dx, dy, dist, WRECK, 2);
          return;
        }
        // beyond the blast: the heat flash
        const k = (dist - R) / (FLASH - R);
        temp[i] += 180 * (1 - k);
        if (P_FLAM[t] > 0 && !(flags[i] & BURN) && hasAir(i) && rnd() < 0.85 * (1 - k)) ignite(i);
      });
      // the blast wave, which the air carries out to the edges of the map
      const ax0 = (x0 + 0.5) / AS, ay0 = (y0 + 0.5) / AS, ar = (R * 1.8) / AS;
      for (let ay = 0; ay < AH; ay++) {
        for (let ax = 0; ax < AW; ax++) {
          const ex = ax + 0.5 - ax0, ey = ay + 0.5 - ay0, dd = Math.sqrt(ex * ex + ey * ey);
          if (dd >= ar || dd < 0.5) continue;
          const a = ay * AW + ax, k = 1 - dd / ar;
          ap[a] = Math.min(AIR_MAXP, ap[a] + 60 * k);
          avx[a] += (ex / dd) * 5 * k; avy[a] += (ey / dd) * 5 * k;
        }
      }
    }

    // Black hole: a point of collapsed matter that pulls everything within reach into a whirling
    // disc and swallows it. Its pull tears solids apart into powder, faster the nearer they are
    // and the weaker they are (see SOLIDS): glass and ice go almost at once, stone soon after,
    // metal and diamond last, and the pieces are drawn in with everything else. Whatever spirals
    // in heats till it glows. When its time is up it evaporates in a flash. Only Wall, Clone and
    // Void resist it.
    function startBlackHole(d) {
      d.life = Math.round(540 + 120 * d.size);
      d.rh = 1.9 + 1.3 * Math.min(3, d.size); // the event horizon
      d.eaten = 0;
    }
    function blackHole(d) {
      if (d.rTo && d.r < d.rTo) d.r = Math.min(d.rTo, d.r + Math.max(0.4, (d.rTo - d.r) * 0.08)); // growing after a bomb
      if (d.rhTo && d.rh < d.rhTo) d.rh = Math.min(d.rhTo, d.rh + Math.max(0.05, (d.rhTo - d.rh) * 0.08));
      const env = fade(d, 30, 40), R = d.r, rh = d.rh, fed = d.fed || 0;
      // its rumble starts low so that it can grow louder with every hydrogen bomb it has swallowed
      events.shake += (0.25 + 0.3 * fed) * env;
      events.rumble = Math.max(events.rumble, Math.min(1, 0.3 + 0.14 * fed) * env);
      forDisc(d.x, d.y, R, (i, dx, dy, d2) => {
        const t = type[i];
        if (t === EMPTY || unbreakable(t)) return;
        const dist = Math.sqrt(d2);
        if (dist <= rh) { become(i, EMPTY); d.eaten++; return; }
        const ux = -dx / dist, uy = -dy / dist, q = 1 - dist / R, g = env * (0.12 + 2.4 * q * q);
        if (dist < rh * 3) temp[i] += 60 * env; // matter spiralling in glows
        const c = catOf(i);
        if (c === C_POWDER || c === C_LIQUID) {
          // pulled in, and round: it spirals rather than falling straight in (the light stuff first)
          const gh = g * heft(i), nx = vx[i] * 0.9 + (ux - uy * 0.45) * gh, ny = vy[i] * 0.9 + (uy + ux * 0.45) * gh;
          vx[i] = nx > MAXV ? MAXV : nx < -MAXV ? -MAXV : nx;
          vy[i] = ny > MAXV ? MAXV : ny < -MAXV ? -MAXV : ny;
          flags[i] &= ~SETTLED;
        } else if (c === C_GAS) {
          if (rnd() < g) { const j = i + Math.round(ux) + Math.round(uy) * SW; if (type[j] === EMPTY) swap(i, j); }
        } else if (c === C_LIFE) {
          if (t === HEAD || rnd() > g * 0.6) return;
          if (t === HUMAN) dangle(i, Math.round(ux * 2), Math.round(uy * 2));
          else { const j = i + Math.round(ux) + Math.round(uy) * SW; if (open(j)) swap(i, j); }
        } else if (c === C_STATIC && rnd() < 0.08 * env * q * q * TEARS[t]) {
          crumble(i); // torn apart, the weakest and the nearest first; the pieces fall in with the rest
        }
      });
      // the air whirls in too
      const ax0 = (d.x + 0.5) / AS, ay0 = (d.y + 0.5) / AS, ar = R / AS;
      for (let ay = Math.max(0, Math.floor(ay0 - ar)); ay <= Math.min(AH - 1, Math.floor(ay0 + ar)); ay++) {
        for (let ax = Math.max(0, Math.floor(ax0 - ar)); ax <= Math.min(AW - 1, Math.floor(ax0 + ar)); ax++) {
          const ex = ax + 0.5 - ax0, ey = ay + 0.5 - ay0, dd = Math.sqrt(ex * ex + ey * ey);
          if (dd >= ar || dd < 0.5) continue;
          const a = ay * AW + ax, k = 0.8 * env * (1 - dd / ar);
          avx[a] -= (ex / dd) * k; avy[a] -= (ey / dd) * k;
        }
      }
      if (d.age === d.life - 1) { explode(d.x, d.y, Math.round(3 + 2 * d.size), 1.2, 0); events.flash += 0.8; }
    }

    // Painting a plant plants it: rather than a block of leaves, each dab starts a plant or two on
    // fitting ground under the brush (well apart, so each has room) and they grow from there. Over
    // air, rock or the wrong ground it scatters that plant's seed, which falls and waits for
    // somewhere it can take root. Returns how many it started.
    function sow(x0, y0, r, t, max) {
      let n = 0;
      const R = Math.max(1, Math.round(r)), carpet = t === GRASS;
      const tries = carpet ? 2 * (2 * R + 1) : 3 + R;
      for (let k = 0; k < tries && n < max; k++) {
        const x = x0 + ((rnd() * (2 * R + 1)) | 0) - R;
        if (x < 0 || x >= W) continue;
        // look down this column of the brush (a lily all the way to the pond's floor) for ground
        const y1 = t === LILY ? H - 1 : Math.min(H - 1, y0 + R);
        let at = -1;
        for (let y = Math.max(0, y0 - R); y <= y1; y++) {
          const j = idx(x, y);
          if (canRoot(j, t)) { at = j; break; }
          if (t === LILY && y > y0 + R && !isWater(type[j])) break;
        }
        if (at < 0 || (!carpet && crowded(at, t))) continue;
        startPlant(at, t);
        n++;
      }
      if (!n && n < max && rnd() < 0.5) {
        const x = x0 + ((rnd() * (2 * R + 1)) | 0) - R, y = y0 + ((rnd() * (2 * R + 1)) | 0) - R;
        if (x >= 0 && x < W && y >= 0 && y < H && type[idx(x, y)] === EMPTY) {
          const j = idx(x, y);
          place(j, SEED_OF[t]);
          if (t === PLANT) aux[j] = 1; // a plain plant's seed, not a flower's
          n++;
        }
      }
      return n;
    }

    // Nothing of kind t within r cells of i, so a brush lays creatures out apart rather than in a heap.
    function roomFor(i, t, r) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) { const j = i + dy * SW + dx; if (j >= 0 && j < N && type[j] === t) return false; }
      }
      return true;
    }

    // Both return how many cells they changed, and stop after `max` (a story chapter's pouch).
    // `tint`: a colour to paint glass or fire in (the number of the element that gives it); `rgb`: a
    // colour to paint concrete in (0xrrggbb)
    function paint(x0, y0, r, t, density, replace, max = Infinity, tint = 0, rgb = 0) {
      if (SEED_OF[t]) return sow(x0, y0, r, t, max);
      const tcat = P_CAT[t], dyed = t === FIRE ? FLAME_DYE[tint] : 0;
      let n = 0;
      forCircle(x0, y0, r, (i) => {
        if (n >= max) return;
        const ct = type[i];
        if (ct === t) return;
        if (t === HUMAN) {
          if (rnd() < density && cy(i) > 0 && open(i) && open(i - SW)) { spawnHuman(i); n++; }
          return;
        }
        if (t === COW || t === WOLF || t === SHARK || t === CELL) {
          // like people: a few at a time, each with room round it, dropped into the air (a shark or a
          // cell into water too), never a solid heap of them
          const into = open(i) || ((t === SHARK || t === CELL) && isWater(ct));
          if (into && rnd() < density && roomFor(i, t, t === CELL ? 1 : 2)) { place(i, t); n++; }
          return;
        }
        if (t === FIRE && P_FLAM[ct] > 0) {
          if (!(flags[i] & BURN)) {
            ignite(i); n++;
            if (tint) { flags[i] |= dyed; const j = emitInto(i, FIRE); if (j >= 0) { aux[j] = tint; flags[j] |= dyed; } } // the blaze burns in its colour
          }
          return;
        }
        // a pipe drawn over another pipe's casing joins it; a valve or a pump drawn over a pipe takes the
        // place of its bore but leaves its casing
        if ((t === VALVE || t === PUMP) && ct === CASING) return;
        const intoPipe = (t === PIPE && ct === CASING) || ((t === VALVE || t === PUMP) && ct === PIPE);
        if (!replace && !intoPipe && ct !== EMPTY && !(catOf(i) === C_GAS && tcat !== C_GAS)) {
          if (t === FIRE) temp[i] += 40;
          return;
        }
        if (rnd() > density) return;
        place(i, t);
        if (tint) { aux[i] = tint; flags[i] |= dyed; }
        if (rgb) col[i] = PAINTED | rgb;
        if (t === LIGHT) aux[i] = rayDir(cx(i) - x0, cy(i) - y0); // rays fly out from the brush
        else if (t === PISTON) aux[i] = (machine.dir & 3) | (machine.sticky ? STICKY : 0);
        else if (t === THRUSTER) aux[i] = machine.dir & 3;
        else if (t === PUMP) data[i] = machine.dir & 3;
        if (t === PIPE) strokeCells.push(i);
        else if (t === SENSOR) { aux[i] = (machine.mode & 3) << 1; data[i] = machine.set | 0; }
        else if (t === SWITCH) aux[i] = 1; // a new switch is on
        n++;
      });
      return n;
    }

    // Explosion, painted with the brush: a blast in the brush's own shape (a circle, a square, a
    // line, a box), about as fierce as black powder and nothing like a bomb. Inside the shape what is
    // weak enough is blown to fire and smoke and the rest is thrown out from the middle; the air
    // round it takes a sharp push. `tint`: the colour its flames burn in, as for painted fire.
    function blastPaint(x0, y0, r, tint = 0) {
      if (brush.shape === 'fill') brush.shape = 'circle'; // never a whole connected cave at once
      const dyed = FLAME_DYE[tint], R = Math.max(1, r);
      let bx = x0, by = y0, br = R;
      if (brush.shape === 'box') { bx = (brush.x0 + brush.x1) >> 1; by = (brush.y0 + brush.y1) >> 1; br = Math.max(brush.x1 - brush.x0, brush.y1 - brush.y0) / 2 + 1; }
      const flame = (i) => { become(i, FIRE); data[i] = 5 + ((rnd() * 16) | 0); if (rnd() < 0.3) flags[i] = SMOKE_WHITE; if (tint) { aux[i] = tint; flags[i] |= dyed; } };
      let n = 0;
      forCircle(x0, y0, R, (i) => {
        const t = type[i];
        if (t === WALL || t === CLONE || t === VOID || t === BOUND) return;
        const dx = cx(i) - bx, dy = cy(i) - by, d = Math.sqrt(dx * dx + dy * dy);
        temp[i] += 450;
        n++;
        if (t === EMPTY || (catOf(i) === C_GAS && !P_EXPL_R[t])) { if (rnd() < 0.7) flame(i); return; }
        if (P_EXPL_R[t]) { if (!(flags[i] & BURN)) { flags[i] |= BURN; data[i] = 1 + ((rnd() * 4) | 0); } return; } // sets off explosives
        const c = catOf(i);
        if (rnd() < 0.85 - P_BLASTRES[t]) {
          if (isWater(t)) become(i, STEAM);
          else if (c === C_STATIC && BREAKS[t] && rnd() < 0.5) crumble(i);
          else if (rnd() < 0.55) flame(i);
          else become(i, rnd() < 0.6 ? SMOKE : EMPTY);
        } else {
          if (P_FLAM[t] > 0 && !(flags[i] & BURN)) ignite(i);
          if (c === C_POWDER || c === C_LIQUID) fling(i, dx, dy, d, br, 0.9);
        }
      });
      if (!n) return 0;
      events.booms.push(bx, by, Math.max(2, Math.round(br)), tint);
      const ax0 = (bx + 0.5) / AS, ay0 = (by + 0.5) / AS, ar = (br * 1.6 + 4) / AS;
      for (let ay = Math.max(0, Math.floor(ay0 - ar)); ay <= Math.min(AH - 1, Math.floor(ay0 + ar)); ay++) {
        for (let ax = Math.max(0, Math.floor(ax0 - ar)); ax <= Math.min(AW - 1, Math.floor(ax0 + ar)); ax++) {
          const ex = ax + 0.5 - ax0, ey = ay + 0.5 - ay0, dd = Math.sqrt(ex * ex + ey * ey);
          if (dd >= ar || dd < 0.5) continue;
          const a = ay * AW + ax, k = 1 - dd / ar;
          ap[a] = Math.min(AIR_MAXP, ap[a] + 22 * k);
          avx[a] += (ex / dd) * 2.5 * k; avy[a] += (ey / dd) * 2.5 * k;
        }
      }
      return n;
    }

    // The Paint tool: recolour whatever is under the brush, whatever it is (rgb 0 takes paint off).
    function tintPaint(x0, y0, r, rgb) {
      let n = 0;
      forCircle(x0, y0, r, (i) => {
        if (type[i] === EMPTY || type[i] === BOUND) return;
        col[i] = rgb ? PAINTED | rgb : 0;
        n++;
      });
      return n;
    }

    // The Image tool: a picture, w × h RGBA pixels (one per cell) centred on (x0, y0), built out of
    // concrete in its own colours. See-through pixels leave what is there.
    function placeImage(x0, y0, w, h, px) {
      const left = x0 - (w >> 1), top = y0 - (h >> 1);
      let n = 0;
      for (let py = 0; py < h; py++) {
        const y = top + py;
        if (y < 0 || y >= H) continue;
        for (let qx = 0; qx < w; qx++) {
          const x = left + qx, k = (py * w + qx) * 4;
          if (x < 0 || x >= W || px[k + 3] < 128) continue;
          const i = idx(x, y);
          place(i, CONCRETE);
          col[i] = PAINTED | EXACT | (px[k] << 16) | (px[k + 1] << 8) | px[k + 2];
          n++;
        }
      }
      return n;
    }

    // Saves from before trees had living trunks, and scenes that build trees out of plain wood:
    // wood joined to a tree's leaves or growing tip is living trunk.
    function livenTrees() {
      const q = [];
      for (let i = 0; i < N; i++) {
        if (type[i] !== WOOD || (flags[i] & LEAF)) continue;
        for (let k = 0; k < 8; k++) {
          const n = i + N8[k], t = type[n];
          if (TREE[t] || t === PLANT) { flags[i] |= LEAF; sap[i] = 220; q.push(i); break; } // (a scene's crown of leaves is plain plant)
        }
      }
      while (q.length) {
        const i = q.pop();
        for (let k = 0; k < 8; k++) {
          const n = i + N8[k];
          if (type[n] === WOOD && !(flags[n] & LEAF)) { flags[n] |= LEAF; sap[n] = 220; q.push(n); }
        }
      }
    }

    function erase(x0, y0, r, max = Infinity) {
      let n = 0;
      forCircle(x0, y0, r, (i) => {
        if (n >= max) return;
        if (type[i] !== EMPTY) n++;
        place(i, EMPTY); temp[i] = ambient;
      });
      return n;
    }

    // The Smash tool: what is brittle breaks, as an earthquake would break it: stone, brick and
    // concrete to rubble of their own colour, glass to shards of its colour, ice and hail to snow,
    // wood to splinters, plants to dead leaves, machines and batteries to scrap of their own colour.
    // Metal bends instead, diamond is too hard, and creatures are left be.
    const CRUSH = new Uint16Array(NT);
    CRUSH[HAIL] = SNOW;
    function smash(x0, y0, r, max = Infinity) {
      let n = 0;
      forCircle(x0, y0, r, (i) => {
        if (n >= max || rnd() > 0.35) return;
        const t = type[i];
        if (t === EMPTY || t === METAL || t === DIAMOND || P_SOLID[t] || unbreakable(t)) return;
        if (BREAKS[t] && P_CAT[t] === C_STATIC) { if (crumble(i)) n++; return; }
        const to = CRUSH[t];
        if (to) { const c = col[i]; become(i, to); if (c) col[i] = c; if (!disc[to]) discover(to, i); n++; }
      });
      if (n) events.cracks += n;
      return n;
    }

    function heat(x0, y0, r, delta) {
      forCircle(x0, y0, r, (i) => {
        let T = temp[i] + delta;
        if (T < -273) T = -273; else if (T > 9000) T = 9000;
        temp[i] = T;
      });
    }

    function sparkPaint(x0, y0, r) {
      forCircle(x0, y0, r, (i) => {
        const t = type[i];
        if (P_CONDUCT[t]) { if (charge[i] === 0) charge[i] = CH_NEW; }
        else if (t === EMPTY) { if (rnd() < 0.04) place(i, SPARK); }
        else zap(i, t);
      });
    }

    function cell(x, y) {
      if (x < 0 || y < 0 || x >= W || y >= H) return null;
      const i = idx(x, y), a = AIRMAP[i];
      return {
        t: type[i], temp: temp[i], burning: !!(flags[i] & BURN), charge: charge[i], aux: aux[i],
        vx: vx[i], vy: vy[i], wind: [avx[a], avy[a]], pressure: ap[a],
      };
    }

    // Full copies of the state, for undo/redo.
    function snapshot() {
      return {
        W, H, a: [type.slice(), shade.slice(), flags.slice(), charge.slice(), aux.slice(), data.slice(), temp.slice(), vy.slice(), vx.slice(), sap.slice(), col.slice()],
        air: [avx.slice(), avy.slice(), ap.slice()],
      };
    }
    function restore(sn) {
      if (sn.W !== W || sn.H !== H) throw new Error('size mismatch');
      type.set(sn.a[0]); shade.set(sn.a[1]); flags.set(sn.a[2]); charge.set(sn.a[3]);
      aux.set(sn.a[4]); data.set(sn.a[5]); temp.set(sn.a[6]); vy.set(sn.a[7]);
      if (sn.a[8]) vx.set(sn.a[8]); else vx.fill(0);
      if (sn.a[9]) sap.set(sn.a[9]); else water();
      if (sn.a[10]) col.set(sn.a[10]); else col.fill(0);
      if (sn.air) { avx.set(sn.air[0]); avy.set(sn.air[1]); ap.set(sn.air[2]); }
      else { avx.fill(0); avy.fill(0); ap.fill(0); }
      stamp.fill(0);
      disasters.length = 0; empLeft = 0; // undoing a disaster stops it (a solar storm's blackout too)
    }

    function resetEvents() {
      events.sizzle = 0; events.ignite = 0; events.fizz = 0; events.zap = 0; events.fission = 0; events.decay = 0; events.rad = 0; events.naturalBolt = 0;
      events.rumble = 0; events.cracks = 0; events.surge = 0; events.howl = 0; events.flash = 0; events.shake = 0;
      events.hbomb.length = 0; events.whistle = 0; events.pump = 0; events.piston = 0;
      events.booms.length = 0; events.bolts.length = 0; events.found.length = 0; events.rx.length = 0;
      events.fused.length = 0;
    }

    // ───── save / load ─────
    function rle(arr, map, n = W * H) {
      const out = [];
      let prev = map(arr, 0), c = 1;
      for (let k = 1; k < n; k++) {
        const v = map(arr, k);
        if (v === prev) c++;
        else { out.push(prev, c); prev = v; c = 1; }
      }
      out.push(prev, c);
      return out;
    }
    function unrle(runs, fn) {
      let k = 0;
      for (let r = 0; r < runs.length; r += 2) {
        const v = runs[r];
        for (let c = runs[r + 1]; c > 0; c--, k++) fn(k, v);
      }
    }
    const vis = (k) => idx(k % W, (k / W) | 0);
    const VQ = 16; // velocities are saved in sixteenths of a cell per tick

    // v3 added velocities and the air field, v4 the water in plants, v5 painted colours and living
    // trunks, v6 16-bit element numbers (rainbow fire's mark moved from 254); older saves load still,
    // with everything at rest, every plant well watered and every tree's wood alive. Element numbers
    // are mapped through the save's own list of keys, so adding elements never breaks a save.
    function serialize() {
      const q = (a, k) => Math.round(a[k] * VQ);
      return {
        v: 6, W, H, ambient, weather: { ...weather },
        keys: list.map((d) => d.key),
        type: rle(type, (a, k) => a[vis(k)]),
        aux: rle(aux, (a, k) => a[vis(k)]),
        flags: rle(flags, (a, k) => a[vis(k)] & ~HELD),
        data: rle(data, (a, k) => a[vis(k)]),
        temp: rle(temp, (a, k) => Math.round(a[vis(k)])),
        vx: rle(vx, (a, k) => Math.round(a[vis(k)] * VQ)),
        vy: rle(vy, (a, k) => Math.round(a[vis(k)] * VQ)),
        sap: rle(sap, (a, k) => a[vis(k)]),
        col: rle(col, (a, k) => a[vis(k)]),
        air: { W: AW, H: AH, vx: rle(avx, q, AN), vy: rle(avy, q, AN), p: rle(ap, q, AN) },
      };
    }

    function load(s) {
      if (s.W !== W || s.H !== H) throw new Error('size mismatch');
      clear();
      let map = null;
      if (s.keys) {
        map = new Uint16Array(Math.max(NT, s.keys.length + 2));
        s.keys.forEach((key, old) => { const d = EL.byKey[key]; map[old] = d ? d.id : EMPTY; });
      }
      if (typeof s.ambient === 'number') ambient = s.ambient;
      if (s.weather) Object.assign(weather, s.weather);
      unrle(s.type, (k, v) => { type[vis(k)] = map ? map[v] : v; });
      unrle(s.aux, (k, v) => { aux[vis(k)] = v; });
      if (!(s.v >= 6)) for (let i = 0; i < N; i++) if (type[i] === FIRE && aux[i] === 254) aux[i] = RAINBOW; // its old mark
      unrle(s.flags, (k, v) => { flags[vis(k)] = v; });
      unrle(s.data, (k, v) => { data[vis(k)] = v; });
      unrle(s.temp, (k, v) => { temp[vis(k)] = v; });
      if (s.vx) unrle(s.vx, (k, v) => { vx[vis(k)] = v / VQ; });
      if (s.vy) unrle(s.vy, (k, v) => { vy[vis(k)] = v / VQ; });
      if (s.sap) unrle(s.sap, (k, v) => { sap[vis(k)] = v; }); else water();
      if (s.col) unrle(s.col, (k, v) => { col[vis(k)] = v; });
      if (!(s.v >= 5)) livenTrees();
      const air = s.air;
      if (air && air.W === AW && air.H === AH) {
        unrle(air.vx, (k, v) => { avx[k] = v / VQ; });
        unrle(air.vy, (k, v) => { avy[k] = v / VQ; });
        unrle(air.p, (k, v) => { ap[k] = v / VQ; });
      }
    }

    return {
      W, H, SW, SH, N,
      type, shade, flags, charge, aux, data, temp, vy, vx, sap, col,
      air: { W: AW, H: AH, S: AS, vx: avx, vy: avy, p: ap, blocked: ablk },
      disc, counts, events,
      get tick() { return tick; },
      idx, step, clear, place, transform, paint, erase, smash, flip, machine, beginStroke, encase, heat, sparkPaint, spawnBolt, explode, blastPaint, tintPaint, placeImage, livenTrees,
      cell, resetEvents, serialize, load, rnd, ignite, snapshot, restore, weather, rules, setBrush, grab, holdTo, release,
      get holding() { return hand.on ? hand.n : 0; },
      get gripping() { return hand.on; },
      launch, steer, weaponReach, quakeInfo, dropPoint, volcanoReach, disasters,
      fireNeutrons: (i, n) => neutrons(i, n),
      get ambient() { return ambient; },
      set ambient(v) { ambient = v; },
    };
  }

  G.Sim = {
    createWorld, BOUND, BURN, LEAF, PETAL, CENTER, BLEACH, CH_ACTIVE, PAINTED, EXACT, SWIMS, RAINBOW, TANK_CAP: 40,
    P: { CAT: P_CAT, DENS: P_DENS, CONDUCT: P_CONDUCT, FLAM: P_FLAM, PERIODIC: P_PERIODIC, MP: P_MP, BP: P_BP },
  };
})(globalThis);
