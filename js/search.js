/* Elementarium — search (no DOM; ui.js shows the box and the results).
 * A number finds the periodic element with that atomic number. Words find anything by its name,
 * symbol, family or group, what it does, the colours it gives, its story and its Try it
 * experiment, best matches first, sorted into categories. Every word has to match somewhere; when
 * nothing does, near misses of a name ("potasium") are tried instead. */
(function (G) {
  'use strict';

  const { ELEM, Lab, TryIt } = G;
  const CATS = ['Periodic table', 'Alchemy', 'Weapons', 'Tools'];
  // lower case, accents off, and the letters that aren't accented ones (Ørsted) swapped one for one,
  // so a normalised text still lines up with the original for highlighting
  const PLAIN = { ø: 'o', æ: 'a', œ: 'o', ß: 's', ł: 'l', đ: 'd', ð: 'd', þ: 't' };
  const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[øæœßłđðþ]/g, (c) => PLAIN[c]);
  const pad = (s) => ` ${norm(s).replace(/[^a-z0-9]+/g, ' ')} `; // words with single spaces round them

  // An entry: { cat, kind ('element' | 'weapon' | 'tool'), id, name, order, visible?(),
  //             fields: [[text, weight, role ('name' | 'sym')?], …] }
  const entries = [];
  function add(e) {
    e.fields = e.fields.filter((f) => f[0]).map(([text, weight, role]) => ({ text, weight, role, p: pad(text) }));
    entries.push(e);
  }

  // the periodic table indexes itself
  const byZ = new Map();
  for (const d of ELEM.periodic) {
    const f = G.FACTS.FACTS[d.sym];
    const state = Lab.stateOf(d);
    const colours = [];
    if (d.flameColor || d.flam) colours.push(`${Lab.result('flame', d).band} flame`);
    const current = Lab.result('current', d).band;
    if (current.startsWith('glows')) colours.push(current);
    const e = {
      cat: 'Periodic table', kind: 'element', id: d.id, name: d.name, order: d.z, d,
      fields: [
        [d.name, 10, 'name'], [d.sym, 0, 'sym'], [d.family, 5], [`${state} at room temperature`, 3],
        [colours.join(', '), 4], [d.desc, 3],
        [f[0] === 'ancient' ? 'known since ancient times' : `discovered ${f[0]} by ${f[1]}`, 2],
        [`its name comes from ${f[2]}`, 2], [f[3], 2], [`Try it: ${TryIt.text(d.id)}`, 2],
      ],
    };
    add(e);
    byZ.set(d.z, e);
  }

  // within one edit of each other (a letter missing, added or changed)
  function near(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (a.length > b.length) i++;
      else if (b.length > a.length) j++;
      else { i++; j++; }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
  }

  // How well one word matches one field: a symbol must match exactly, and beats everything; elsewhere
  // the start of a word scores the field's weight, a whole word or the start of the name more, and
  // the middle of a word (three letters or more) less.
  function scoreField(f, w, fuzzy) {
    if (f.role === 'sym') return f.p === ` ${w} ` ? 20 : 0;
    if (w.length <= 2 && f.role !== 'name') return 0; // one or two letters: a symbol, or the start of a name
    if (f.p.includes(` ${w} `)) return f.weight + (f.role === 'name' ? 8 : 2);
    if (f.p.includes(` ${w}`)) return f.weight + (f.role === 'name' && f.p.startsWith(` ${w}`) ? 4 : 0);
    if (w.length >= 3 && f.p.includes(w)) return f.weight * 0.5;
    if (fuzzy && f.role === 'name' && w.length >= 4 && f.p.trim().split(' ').some((x) => near(x, w))) return f.weight * 0.8;
    return 0;
  }

  function match(words, fuzzy) {
    const hits = [];
    for (const e of entries) {
      if (e.visible && !e.visible()) continue;
      let score = 0, why = null;
      for (const w of words) {
        let best = 0, bestField = null;
        for (const f of e.fields) {
          const s = scoreField(f, w, fuzzy);
          if (s > best) { best = s; bestField = f; }
        }
        if (!best) { score = 0; break; } // every word has to match somewhere
        score += best;
        // the line shown under the name: the first field that isn't the name or symbol
        if (!why && bestField.role !== 'name' && bestField.role !== 'sym') why = bestField.text;
      }
      if (score) hits.push({ e, score, why });
    }
    return hits;
  }

  // Search. Returns null for an empty box, else { number?, fuzzy?, groups: [{ cat, items }] }.
  function query(q) {
    const s = norm(q).trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) { // an atomic number
      const e = byZ.get(+s);
      return { number: +s, groups: e ? [{ cat: 'Periodic table', items: [{ e, score: 100, why: null }] }] : [] };
    }
    const words = pad(s).trim().split(' ').filter(Boolean); // split as the index is: "orange-red" is two words
    let hits = match(words, false), fuzzy = false;
    if (!hits.length) { hits = match(words, true); fuzzy = hits.length > 0; }
    hits.sort((a, b) => b.score - a.score || a.e.order - b.e.order);
    // the category with the best match comes first ("heat" finds the Heat tool before the elements it heats)
    const groups = CATS.map((cat) => ({ cat, items: hits.filter((h) => h.e.cat === cat) })).filter((g) => g.items.length)
      .sort((a, b) => b.items[0].score - a.items[0].score || CATS.indexOf(a.cat) - CATS.indexOf(b.cat));
    return { fuzzy, words, groups };
  }

  // A short piece of `text` around the first query word, cut into [text, isMatch] runs for showing.
  function snippet(text, words, room = 90) {
    const n = norm(text);
    let at = -1;
    for (const w of words) { const k = n.indexOf(w); if (k >= 0 && (at < 0 || k < at)) at = k; }
    let a = 0, b = text.length;
    if (text.length > room) {
      a = Math.max(0, at - 30);
      b = Math.min(text.length, a + room);
      if (a > 0) a = text.indexOf(' ', a) + 1 || a;
    }
    const part = text.slice(a, b), np = n.slice(a, b);
    const marks = new Uint8Array(part.length);
    for (const w of words) for (let k = np.indexOf(w); k >= 0 && w; k = np.indexOf(w, k + w.length)) marks.fill(1, k, k + w.length);
    const runs = [];
    for (let k = 0; k < part.length; k++) {
      if (runs.length && runs[runs.length - 1][1] === !!marks[k]) runs[runs.length - 1][0] += part[k];
      else runs.push([part[k], !!marks[k]]);
    }
    if (a > 0) runs.unshift(['…', false]);
    if (b < text.length) runs.push(['…', false]);
    return runs;
  }

  G.Search = { add, query, snippet, CATS, MAX_Z: ELEM.periodic.length };
})(globalThis);
