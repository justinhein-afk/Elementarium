/* Elementarium — colours for glass and fire (no DOM; ui.js shows the colour picker).
 * Glass and Fire can be painted in a colour once you have made that colour yourself, in your own
 * world: stirred its metal into molten glass (cobalt blue, gold ruby…) or coloured a flame with its
 * element (copper blue-green, strontium red…), whether by a flame test or by fireworks. A colour
 * a scene or a chapter set up doesn't count, as with Try it, and its element must be unlocked. */
(function (G) {
  'use strict';

  const { ELEM, Lab, TryIt } = G;
  const { ID } = ELEM;
  const P = ELEM.periodic;
  const bySym = Object.fromEntries(P.map((d) => [d.sym, d]));

  // each kind: the element painted, the cells whose `aux` carries a colour, and the colours
  const KINDS = {
    glass: {
      base: ID.GLASS, cells: [ID.GLASS, ID.MGLASS],
      options: P.filter((d) => d.glassColor).map((d) => ({
        t: d.id, d, color: d.glassColor, name: ((d.desc.match(/turns molten glass ([^,.]+)/) || [])[1] || 'stained').replace(/ that .*/, ''),
      })),
    },
    fire: {
      base: ID.FIRE, cells: [ID.FIRE],
      options: P.filter((d) => d.flameColor).map((d) => ({ t: d.id, d, color: d.flameColor, name: Lab.result('flame', d).band })),
    },
  };
  const kindOf = (t) => (t === ID.GLASS ? 'glass' : t === ID.FIRE || t === ID.EXPLOSION ? 'fire' : null); // an explosion burns in fire's colours
  const optionOf = (kind, t) => KINDS[kind].options.find((o) => o.t === t) || null;

  // ───── what is open, and what is chosen ─────
  const made = { glass: new Set(), fire: new Set() }; // element ids
  const chosen = { glass: 0, fire: 0 };
  let store = null;
  function init(s) {
    store = s;
    const m = s.get('tints', {}), c = s.get('tint', {});
    for (const kind of ['glass', 'fire']) {
      made[kind].clear();
      for (const sym of m[kind] || []) if (bySym[sym] && optionOf(kind, bySym[sym].id)) made[kind].add(bySym[sym].id);
      const pick = bySym[c[kind]];
      chosen[kind] = pick && made[kind].has(pick.id) ? pick.id : 0;
    }
  }
  function save() {
    if (!store) return;
    const syms = (kind) => [...made[kind]].map((t) => ELEM.list[t].sym);
    store.set('tints', { glass: syms('glass'), fire: syms('fire') });
    store.set('tint', { glass: chosen.glass ? ELEM.list[chosen.glass].sym : null, fire: chosen.fire ? ELEM.list[chosen.fire].sym : null });
  }
  function reset() { made.glass.clear(); made.fire.clear(); chosen.glass = 0; chosen.fire = 0; save(); }
  function choose(kind, t) {
    chosen[kind] = t && made[kind].has(t) ? t : 0;
    save();
  }
  // the colour to paint an element in: the chosen one for Glass and Fire, none for anything else
  const tintFor = (t) => { const k = kindOf(t); return k ? chosen[k] : 0; };

  // ───── the watcher ─────
  // Every few ticks, look for glass or fire carrying a colour not made yet.
  let onOpen = () => {};
  let lastScan = -1, scanned = null;
  function frame(w) {
    if (w !== scanned) { scanned = w; lastScan = -1; }
    if (w.tick - lastScan < 15 && w.tick >= lastScan) return;
    lastScan = w.tick;
    if (made.glass.size === KINDS.glass.options.length && made.fire.size === KINDS.fire.options.length) return;
    const { type, aux, N, SW } = w;
    const GLASS = ID.GLASS, MGLASS = ID.MGLASS, FIRE = ID.FIRE;
    for (let i = 0; i < N; i++) {
      const c = type[i];
      if (c !== GLASS && c !== MGLASS && c !== FIRE) continue;
      const a = aux[i];
      if (!a) continue;
      const kind = c === FIRE ? 'fire' : 'glass';
      if (made[kind].has(a) || !optionOf(kind, a) || !Lab.has(a) || TryIt.aside(w, a)) continue;
      made[kind].add(a);
      save();
      onOpen(kind, optionOf(kind, a), i % SW, (i / SW) | 0);
    }
  }

  G.Tints = {
    init, reset, choose, tintFor, kindOf, frame,
    chosen: (kind) => (chosen[kind] ? optionOf(kind, chosen[kind]) : null),
    options: (kind) => KINDS[kind].options.map((o) => ({ ...o, open: made[kind].has(o.t) })),
    count: (kind) => made[kind].size,
    base: (kind) => KINDS[kind].base,
    set onOpen(fn) { onOpen = fn; },
  };
})(globalThis);
