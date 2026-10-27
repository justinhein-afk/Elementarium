/* Elementarium — Try it: one real experiment for every element, done in your own world (no DOM).
 * Each experiment is a sentence and what the watcher looks for in the world: a cell of the
 * element in some state (melted, boiled, frozen, live with current, white-hot, touching
 * something), something it leaves behind (a fire in its colour, its sparks, stained glass, what it
 * decays into), or an event (a blast in its colour, a chain reaction, a fusion). Doing it puts a
 * star on the element's cell. Only unlocked elements count, and anything a scene or a chapter put
 * in the world is set aside there: the experiment has to be your own. */
(function (G) {
  'use strict';

  const { ELEM, Lab } = G;
  const { ID, list } = ELEM;
  const P = ELEM.periodic;
  const bySym = Object.fromEntries(P.map((d) => [d.sym, d]));
  const T = (k) => (bySym[k] ? bySym[k].id : ID[k]); // 'Hg' or 'WATER'
  const BURN = 1;
  const FIRE = ID.FIRE, MSPARK = ID.MSPARK, GLASS = ID.GLASS, MGLASS = ID.MGLASS, RAD = ID.RAD; // read once: ID is a big table
  const CHAIN = 20; // fissions between two scans that make a chain reaction

  // What the watcher looks for, beside the sentence:
  //   state 'solid' | 'liquid' | 'gas', minT, maxT, live (current in it), burn, aux (a phosphor
  //   glowing, mercury holding gold, palladium holding hydrogen), touch [types], above (the type
  //   directly above it), touchAux / touchLive [types] (a neighbour glowing / carrying current),
  //   touchBurn (a neighbour on fire), touchT (the touched neighbour at least this hot),
  //   whileFission (a chain reaction running), whileNeutrons (neutrons flying), noChain (none),
  //   pile [type, n] / pileMax [type, n] (at least n grains of it in the world / at most n lately:
  //   a big pile that has just blown itself apart doesn't count as a small one),
  //   hold (true at every look for this many ticks running)
  //                                                                   … tested on its own cells
  //   flame · spark · glass   a fire, a spark or glass coloured by it
  //   becomes [types]         one of its cells turns into one of these (decay, a reaction)
  //   boom · fission · fused  a blast in its colour, a chain reaction in it, made by fusion
  //   any [specs]             any one of these will do
  // req: elements the experiment needs besides this one.
  const melt = { state: 'liquid' };
  const live = { live: true };
  const decays = (s) => ({ becomes: [s] });
  const EXPERIMENTS = {
    H: ['Light hydrogen with a spark or a flame: it goes off with a pale blue flash', { boom: true }],
    He: ['Seal helium in glass with a battery at each end: it glows peach', live],
    Li: ['Drop lithium into water, or sprinkle it into a fire: it burns crimson', { any: [{ flame: true }, { boom: true }] }],
    Be: ['Wrap a small lump of uranium (under 300 grains, too little alone) in beryllium and it goes critical', { touch: ['U'], whileFission: true, pileMax: ['U', 300] }, ['U']],
    B: ['Sprinkle boron into a wood fire: the flames turn bright green', { flame: true }],
    C: ['Seal carbon away from the air and heat it to 2,500°C: it turns to diamond', { becomes: ['DIAMOND'] }],
    N: ['Cool nitrogen below −196°C until it turns liquid', { state: 'liquid' }],
    O: ['Cool oxygen below −183°C: it turns into a pale blue liquid', { state: 'liquid' }],
    F: ['Let fluorine touch wood or oil: it sets it alight with no flame at all', { touchBurn: true }],
    Ne: ['Make a neon sign: seal neon in glass with a battery at each end', live],
    Na: ['Drop sodium into water: it explodes in a yellow flash', { any: [{ flame: true }, { boom: true }] }],
    Mg: ['Set magnesium alight: it burns brilliant white', { burn: true }],
    Al: ['Blow a cloud of aluminium dust over a fire: it flashes and throws sparks, though a heap never does', { spark: true }],
    Si: ['Make current with silicon: a solar cell under open sky (or wire it to a battery)', live],
    P: ['Leave white phosphorus out in the open air until it bursts into flame by itself', { burn: true }],
    S: ['Set sulfur alight: it burns with a blue flame', { burn: true }],
    // the reaction is over in a tick, so look for what it leaves: fresh salt, still hot, beside chlorine
    Cl: ['Drop an alkali metal (lithium, sodium…) into chlorine: it burns to salt', { touch: ['SALT'], touchT: 250 }],
    Ar: ['Seal argon in glass with a battery at each end: it glows violet', live],
    K: ['Drop potassium into water: it explodes in a lilac flash', { any: [{ flame: true }, { boom: true }] }],
    Ca: ['Sprinkle calcium into a wood fire: the flames turn orange-red', { flame: true }],
    Sc: ['Melt scandium (1,541°C)', melt],
    Ti: ['Heat titanium red-hot in the open air: it throws white sparks like a sparkler', { spark: true }],
    V: ['Melt vanadium (1,910°C), the metal that toughens steel for tools', melt],
    Cr: ['Stir chromium into molten glass: it stains it emerald green', { glass: true }],
    Mn: ['Stir manganese into molten glass: it stains it amethyst purple', { glass: true }],
    Fe: ['Heat iron filings red-hot in the open air: they throw orange sparks', { spark: true }],
    Co: ['Stir cobalt into molten glass: it stains it a deep blue', { glass: true }],
    Ni: ['Make nichrome: wire nickel touching chromium to a battery until it glows red-hot', { touch: ['Cr'], minT: 500, state: 'solid' }, ['Cr']],
    Cu: ['Sprinkle copper into a wood fire: the flames turn blue-green', { flame: true }],
    Zn: ['Make a lemon battery: zinc and copper in the same bath of saltwater or acid make current', { live: true, touch: ['SALTWATER', 'ACID'] }, ['Cu']],
    Ga: ['Pour molten gallium onto aluminium: it seeps between the grains and the aluminium crumbles', { state: 'liquid', touch: ['Al'] }, ['Al']],
    Ge: ['Melt germanium (938°C), the metal of the first transistors', melt],
    As: ['Heat arsenic to 615°C: it turns straight to vapour without melting', { state: 'gas' }],
    Se: ['Stir selenium into molten glass: it stains it red', { glass: true }],
    Br: ['Boil bromine: at just 58.8°C it turns to a red-brown vapour', { state: 'gas' }],
    Kr: ['Seal krypton in glass with a battery at each end: it glows white', live],
    Rb: ['Drop rubidium into water: it explodes in a red-violet flash', { any: [{ flame: true }, { boom: true }] }],
    Sr: ['Sprinkle strontium into a wood fire: the flames turn red, the red of fireworks', { flame: true }],
    Y: ['Make yttrium superconduct: chill it below −180°C and run current through it', { live: true, maxT: -180 }],
    Zr: ['Heat zirconium past 1,100°C in the open air: it burns brilliant white', { burn: true }],
    Nb: ['Make niobium superconduct: chill it below −264°C and run current through it', { live: true, maxT: -264 }],
    Mo: ['Run current through molybdenum, or heat it, until it glows white-hot (1,800°C)', { minT: 1800, state: 'solid' }],
    Tc: ['Melt technetium (2,157°C), the first element people ever made', melt],
    Ru: ['Drop ruthenium into acid: it lies there and won’t dissolve', { touch: ['ACID'] }],
    Rh: ['Melt rhodium (1,964°C), one of the costliest metals there is', melt],
    Pd: ['Let palladium soak up hydrogen: it takes in hundreds of times its own volume', { aux: true }, ['H']],
    Ag: ['Stir silver into molten glass: it stains it amber yellow', { glass: true }],
    Cd: ['Build a reactor: lay cadmium rods through 400 grains of uranium and hold it below critical for 10 s (pause while you build)', { touch: ['U'], pile: ['U', 400], noChain: true, hold: 600 }, ['U']],
    In: ['Sprinkle indium into a wood fire: the flames turn indigo', { flame: true }],
    Sn: ['Melt tin (232°C), the metal in the solder of every circuit board', melt],
    Sb: ['Melt antimony (631°C)', melt],
    Te: ['Make current with tellurium: heat one end of a bar and chill the other', { live: true, minT: 150 }],
    I: ['Heat iodine past 184°C: it boils off as a violet vapour', { state: 'gas' }],
    Xe: ['Seal xenon in glass with a battery at each end: it glows blue', live],
    Cs: ['Drop caesium into water: the most violent of them all', { any: [{ flame: true }, { boom: true }] }],
    Ba: ['Sprinkle barium into a wood fire: the flames turn apple green', { flame: true }],
    La: ['Melt lanthanum (920°C)', melt],
    Ce: ['Drop cerium hard onto stone: like a lighter flint, it throws sparks', { spark: true }],
    Pr: ['Stir praseodymium into molten glass: it stains it yellow-green', { glass: true }],
    Nd: ['Hold neodymium by iron filings: they jump to the magnet and cling', { touch: ['Fe'] }, ['Fe']],
    Pm: ['Melt promethium (1,042°C)', melt],
    Sm: ['Heat a samarium magnet past 350°C, where neodymium gives up: it still holds iron', { touch: ['Fe'], minT: 350 }, ['Fe']],
    Eu: ['Light europium with current: it glows red and fades slowly after', { aux: true }],
    Gd: ['Chill gadolinium below 19.5°C, just under room temperature: it turns magnetic', { maxT: 19, state: 'solid' }],
    Tb: ['Light terbium with current: it glows green, the green of fluorescent lamps', { aux: true }],
    Dy: ['Chill dysprosium below −185°C: only then does it turn magnetic', { maxT: -185 }],
    Ho: ['Melt holmium (1,461°C)', melt],
    Er: ['Stir erbium into molten glass: it stains it rose pink', { glass: true }],
    Tm: ['Light thulium with current: it glows blue', { aux: true }],
    Yb: ['Melt ytterbium (819°C)', melt],
    Lu: ['Light lutetium with current: it flashes violet-blue with every pulse', { aux: true }],
    Hf: ['Build a submarine reactor: hafnium rods through 400 grains of uranium, held below critical for 10 s (pause while you build)', { touch: ['U'], pile: ['U', 400], noChain: true, hold: 600 }, ['U']],
    Ta: ['Wire tantalum to a battery: it soaks up current and lets it all go at once', live],
    W: ['Build a light bulb: tungsten between two batteries, sealed in glass full of argon, white-hot (1,500°C)', { minT: 1500, state: 'solid', touch: ['Ar'] }, ['Ar']],
    Re: ['Melt rhenium (3,186°C), the last stable element ever found', melt],
    Os: ['Drop osmium into mercury: the densest element sinks straight through', { above: 'Hg' }, ['Hg']],
    Ir: ['Melt iridium (2,446°C)', melt],
    Pt: ['Let platinum touch hydrogen: it warms up and lights it without a flame', { touch: ['H'], minT: 250 }, ['H']],
    Au: ['Stir gold into molten glass: it stains it ruby red', { glass: true }],
    Hg: ['Drop gold into liquid mercury: it dissolves', { aux: true }, ['Au']],
    Tl: ['Sprinkle thallium into a wood fire: the flames turn green', { flame: true }],
    Pb: ['Make a car battery: stand lead in acid until it makes current', { live: true, touch: ['ACID'] }],
    Bi: ['Make a thermoelectric generator: heat one end of a bismuth bar and chill the other', { live: true, minT: 150 }],
    Po: ['Make a neutron source: mix polonium into beryllium', { touch: ['Be'], whileNeutrons: true }, ['Be']],
    At: ['Watch astatine decay into bismuth', decays('Bi')],
    Rn: ['Watch radon decay into polonium', decays('Po')],
    Fr: ['Drop francium into water: it explodes as violently as caesium', { any: [{ flame: true }, { boom: true }] }],
    Ra: ['Make radium paint: mix radium into zinc and watch it sparkle green', { touchAux: ['Zn'] }, ['Zn']],
    Ac: ['Watch actinium decay into thorium', decays('Th')],
    Th: ['Hold thorium in a flame: it glows white, like the mantle of a gas lamp', { touch: ['FIRE'] }],
    Pa: ['Melt protactinium (1,572°C)', melt],
    U: ['Pile up enough uranium to go critical: a chain reaction', { fission: true }],
    Np: ['Melt neptunium (644°C)', melt],
    Pu: ['Pile up enough plutonium to go critical: a chain reaction', { fission: true }],
    Am: ['Make the neutron source oil prospectors use: mix americium into beryllium', { touch: ['Be'], whileNeutrons: true }, ['Be']],
    Cm: ['Make a nuclear battery: press curium against tellurium', { touchLive: ['Te'] }, ['Te']],
    Bk: ['Watch berkelium decay into americium', decays('Am')],
    Cf: ['Watch californium split by itself into barium and krypton: it fissions with no help at all', { becomes: ['Ba', 'Kr'] }],
    Es: ['Watch einsteinium decay into berkelium', decays('Bk')],
    Fm: ['Watch fermium decay into californium', decays('Cf')],
    Md: ['Watch mendelevium decay into einsteinium', decays('Es')],
    No: ['Watch nobelium decay into fermium', decays('Fm')],
    Lr: ['Watch lawrencium decay into mendelevium', decays('Md')],
    Rf: ['Watch rutherfordium decay into nobelium', decays('No')],
    Db: ['Watch dubnium decay into lawrencium', decays('Lr')],
    Sg: ['Watch seaborgium decay into rutherfordium', decays('Rf')],
    Bh: ['Watch bohrium decay into dubnium', decays('Db')],
    Hs: ['Watch hassium decay into seaborgium', decays('Sg')],
    Mt: ['Watch meitnerium decay into bohrium', decays('Bh')],
    Ds: ['Watch darmstadtium decay into hassium', decays('Hs')],
    Rg: ['Watch roentgenium decay into meitnerium', decays('Mt')],
    Cn: ['Make copernicium: seal calcium in with uranium and heat them past 3,000°C', { fused: true }, ['Ca', 'U']],
    Nh: ['Make nihonium: seal calcium in with neptunium and heat them past 3,000°C', { fused: true }, ['Ca', 'Np']],
    Fl: ['Make flerovium: seal calcium in with plutonium and heat them past 3,000°C', { fused: true }, ['Ca', 'Pu']],
    Mc: ['Make moscovium: seal calcium in with americium and heat them past 3,000°C', { fused: true }, ['Ca', 'Am']],
    Lv: ['Make livermorium: seal calcium in with curium and heat them past 3,000°C', { fused: true }, ['Ca', 'Cm']],
    Ts: ['Make tennessine: seal calcium in with berkelium and heat them past 3,000°C', { fused: true }, ['Ca', 'Bk']],
    Og: ['Make oganesson: seal calcium in with californium and heat them past 3,000°C', { fused: true }, ['Ca', 'Cf']],
  };

  // ───── each experiment as tests the watcher can run fast ─────
  const EXP = new Array(256).fill(null);
  function compile(d, spec) {
    if (spec.any) return { any: spec.any.map((s) => compile(d, s)) };
    const c = { ...spec };
    for (const k of ['touch', 'touchAux', 'touchLive', 'becomes']) if (spec[k]) c[k] = spec[k].map(T);
    if (spec.above) c.above = T(spec.above);
    for (const k of ['pile', 'pileMax']) if (spec[k]) c[k] = [T(spec[k][0]), spec[k][1]];
    c.cell = ['state', 'minT', 'maxT', 'live', 'burn', 'aux', 'touch', 'above', 'touchAux', 'touchLive', 'touchBurn', 'whileFission', 'whileNeutrons',
      'noChain', 'pile', 'pileMax'].some((k) => spec[k] !== undefined);
    return c;
  }
  for (const d of P) {
    const [text, spec, req] = EXPERIMENTS[d.sym];
    const c = compile(d, spec);
    EXP[d.id] = { text, spec: c, parts: c.any || [c], req: (req || []).map(T), d };
  }

  // ───── progress ─────
  const done = new Uint8Array(256);
  let store = null;
  function init(s) {
    store = s;
    done.fill(0);
    for (const k of s.get('tried', [])) if (bySym[k]) done[bySym[k].id] = 1;
  }
  const save = () => { if (store) store.set('tried', P.filter((d) => done[d.id]).map((d) => d.sym)); };
  function reset() { done.fill(0); save(); }
  const count = () => P.reduce((n, d) => n + done[d.id], 0);

  // ───── the watcher ─────
  // Elements a scene or a chapter put in a world, which don't count there: as grains, or as the
  // colour of its stained glass or campfires.
  const setAside = new WeakMap();
  function staged(w) {
    const s = new Uint8Array(256), { type, aux, N } = w;
    for (let i = 0; i < N; i++) {
      const t = type[i];
      if (list[t] && list[t].periodic) s[t] = 1;
      else if (t === GLASS || t === MGLASS || t === FIRE) s[aux[i]] = 1;
    }
    setAside.set(w, s);
  }
  let onDone = () => {};
  let lastScan = -1, fission = 0, scanned = null, neutrons = 0; // neutrons: tracks seen at the last scan
  let counts = new Uint32Array(256); // grains of each element at the last scan
  let peak = new Float32Array(256);  // …and the most there have been lately, fading over a few seconds
  const since = new Map(); // when an experiment that has to hold first came true
  let lastTick = 0;
  const prev = new Map(); // where each element waiting to turn into something was at the last scan

  const open = (t, w) => EXP[t] && !done[t] && Lab.has(t) && !(setAside.get(w) || [])[t];
  function complete(t, x, y) {
    if (done[t]) return;
    done[t] = 1;
    save();
    onDone(t, x, y);
  }

  // A: the world's arrays, looked up once per scan (reading them off the world is slow)
  function cellOK(A, i, d, c) {
    const T0 = A.temp[i];
    if (c.whileFission && A.fission < CHAIN) return false;
    if (c.whileNeutrons && !A.neutrons) return false;
    if (c.noChain && A.fission >= CHAIN) return false;
    if (c.pile && A.counts[c.pile[0]] < c.pile[1]) return false;
    if (c.pileMax && A.peak[c.pileMax[0]] > c.pileMax[1]) return false;
    if (c.state) {
      const st = T0 >= d.bp ? 'gas' : T0 >= d.mp ? 'liquid' : 'solid';
      if (st !== c.state) return false;
    }
    if (c.minT !== undefined && T0 < c.minT) return false;
    if (c.maxT !== undefined && T0 > c.maxT) return false;
    if (c.live && !(A.charge[i] > 0)) return false;
    if (c.burn && !(A.flags[i] & BURN)) return false;
    if (c.aux && !A.aux[i]) return false;
    if (c.above !== undefined && A.type[i - A.SW] !== c.above) return false;
    if (c.touch || c.touchAux || c.touchLive || c.touchBurn) {
      let ok = !c.touch, okAux = !c.touchAux, okLive = !c.touchLive, okBurn = !c.touchBurn;
      for (let k = 0; k < 4; k++) {
        const n = i + (k === 0 ? -1 : k === 1 ? 1 : k === 2 ? -A.SW : A.SW), nt = A.type[n];
        if (c.touch && c.touch.includes(nt) && (c.touchT === undefined || A.temp[n] >= c.touchT)) ok = true;
        if (c.touchAux && c.touchAux.includes(nt) && A.aux[n]) okAux = true;
        if (c.touchLive && c.touchLive.includes(nt) && A.charge[n] > 0) okLive = true;
        if (c.touchBurn && (A.flags[n] & BURN)) okBurn = true;
      }
      if (!(ok && okAux && okLive && okBurn)) return false;
    }
    return true;
  }

  // Called every frame with the world and the events of its last ticks (before they are cleared).
  function frame(w, ev) {
    for (let k = 0; k < ev.booms.length; k += 4) {
      const t = ev.booms[k + 3];
      if (open(t, w) && EXP[t].parts.some((s) => s.boom)) complete(t, ev.booms[k], ev.booms[k + 1]);
    }
    for (const t of ev.fused) if (open(t, w) && EXP[t].spec.fused) complete(t, w.W >> 1, w.H >> 1);
    fission += ev.fission;
    if (w !== scanned) { prev.clear(); since.clear(); scanned = w; lastScan = -1; neutrons = 0; counts = new Uint32Array(256); peak = new Float32Array(256); } // a different world (a chapter, a new map)
    if (w.tick - lastScan >= 5 || w.tick < lastScan) { scan(w); lastScan = w.tick; }
  }

  function scan(w) {
    const { type, aux, N, SW } = w;
    const A = { type, aux, SW, temp: w.temp, charge: w.charge, flags: w.flags, fission, neutrons, counts, peak };
    // which elements, and which kinds of leftover, are worth looking for
    const want = new Uint8Array(256), byAux = new Uint8Array(256); // byAux: 1 flame, 2 spark, 4 glass
    let any = false;
    for (const d of P) {
      if (!open(d.id, w)) continue;
      any = true;
      for (const s of EXP[d.id].parts) {
        if (s.cell || s.becomes || s.fission) want[d.id] = 1;
        if (s.flame) byAux[d.id] |= 1;
        if (s.spark) byAux[d.id] |= 2;
        if (s.glass) byAux[d.id] |= 4;
      }
    }
    // an element waiting to turn into something: did one of its cells, where it was last time?
    for (const [t, at] of prev) {
      if (!want[t]) continue;
      const to = EXP[t].parts.find((s) => s.becomes).becomes;
      for (const i of at) if (to.includes(type[i])) { complete(t, i % SW, (i / SW) | 0); break; }
    }
    prev.clear();
    if (!any) { fission = 0; neutrons = 0; since.clear(); return; }
    const seen = new Uint8Array(256), now = new Uint32Array(256), held = new Map();
    let tracks = 0;
    for (let i = 0; i < N; i++) {
      const t = type[i];
      now[t]++;
      if (want[t]) {
        seen[t] = 1;
        const e = EXP[t];
        for (const s of e.parts) {
          if (s.cell && !done[t] && cellOK(A, i, e.d, s)) {
            if (s.hold) held.set(t, i);
            else complete(t, i % SW, (i / SW) | 0);
          }
          if (s.becomes) {
            let at = prev.get(t);
            if (!at) prev.set(t, at = []);
            if (at.length < 4000) at.push(i);
          }
        }
      } else if (t === FIRE || t === MSPARK || t === GLASS || t === MGLASS) {
        const a = aux[i], bit = t === FIRE ? 1 : t === MSPARK ? 2 : 4;
        if (a < 256 && (byAux[a] & bit) && !done[a]) complete(a, i % SW, (i / SW) | 0);
      } else if (t === RAD && aux[i] === 1) tracks++; // a neutron's track
    }
    neutrons = tracks;
    counts = now;
    for (let t = 0; t < 256; t++) peak[t] = Math.max(now[t], peak[t] * 0.97);
    lastTick = w.tick;
    // a chain reaction: credit the fissile elements in the world while it runs
    // an experiment that has to hold: true at every look since it first came true
    for (const d of P) {
      const s = want[d.id] && EXP[d.id].spec;
      if (!s || !s.hold) continue;
      const i = held.get(d.id);
      if (i === undefined) since.delete(d.id);
      else if (!since.has(d.id)) since.set(d.id, w.tick);
      else if (w.tick - since.get(d.id) >= s.hold) complete(d.id, i % SW, (i / SW) | 0);
    }
    if (fission >= CHAIN) {
      for (const d of P) if (want[d.id] && seen[d.id] && EXP[d.id].spec.fission) complete(d.id, w.W >> 1, w.H >> 1);
    }
    fission = 0;
  }

  // How far along an experiment that needs a pile or has to hold is: grains in the world so far,
  // and seconds held. Null for the others, and once done.
  function progress(t) {
    const e = EXP[t];
    if (!e || done[t] || !Lab.has(t)) return null;
    const s = e.spec;
    if (!s.pile && !s.hold) return null;
    return {
      pile: s.pile ? { name: list[s.pile[0]].name.toLowerCase(), have: counts[s.pile[0]], need: s.pile[1] } : null,
      hold: s.hold ? { secs: since.has(t) ? Math.floor((lastTick - since.get(t)) / 60) : 0, need: s.hold / 60 } : null,
    };
  }

  G.TryIt = {
    init, reset, count, frame, staged, progress,
    own: (w) => setAside.delete(w),
    aside: (w, t) => !!(setAside.get(w) || [])[t], // did a scene or a chapter put t in this world?
    has: (t) => !!done[t],
    text: (t) => (EXP[t] ? EXP[t].text : ''),
    needs: (t) => (EXP[t] ? EXP[t].req : []),
    set onDone(fn) { onDone = fn; },
    EXPERIMENTS,
  };
})(globalThis);
