/* Elementarium — starting scenes, built procedurally. Placing an element is never a discovery, but
 * what a scene's things grow or turn into can be (a meadow's grass spreading, a cow's calf). Scenes
 * with periodic elements stay locked until the Lab has unlocked them (Lab.sceneNeeds). */
(function (G) {
  'use strict';
  const { ID } = G.ELEM;

  function noise1(seed) {
    // smooth 1-D value noise from a few octaves of sines with random phases
    const ph = [Math.random() * 10, Math.random() * 10, Math.random() * 10];
    return (x) => Math.sin(x * 0.021 + ph[0]) * 0.5 + Math.sin(x * 0.057 + ph[1]) * 0.3 + Math.sin(x * 0.13 + ph[2]) * 0.2;
  }

  function fillCol(w, x, y0, y1, t) {
    for (let y = Math.max(0, y0); y <= Math.min(w.H - 1, y1); y++) w.place(w.idx(x, y), t);
  }

  function blob(w, cx, cy, rx, ry, t, onlyEmpty) {
    for (let y = Math.max(0, cy - ry); y <= Math.min(w.H - 1, cy + ry); y++) {
      for (let x = Math.max(0, cx - rx); x <= Math.min(w.W - 1, cx + rx); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy > 1) continue;
        const i = w.idx(x, y);
        if (onlyEmpty && w.type[i] !== ID.EMPTY) continue;
        w.place(i, t);
      }
    }
  }

  // ───── for the landscapes: painted rock, finished trees, flowers and creatures ─────
  const { PAINTED, LEAF, PETAL } = G.Sim;
  const rgb = (h) => parseInt(h.slice(1), 16);
  function mixRGB(a, b, f) {
    const ch = (s) => Math.round(((a >> s) & 255) + ((((b >> s) & 255) - ((a >> s) & 255)) * f)) << s;
    return ch(16) | ch(8) | ch(0);
  }
  const tone = (w, i, c) => { w.col[i] = PAINTED | c; };
  const inMap = (w, x, y) => x >= 0 && y >= 0 && x < w.W && y < w.H;
  function put(w, x, y, t) {
    if (!inMap(w, x, y)) return -1;
    const i = w.idx(x, y);
    w.place(i, t);
    return i;
  }
  function rect(w, x0, y0, x1, y1, t) {
    for (let y = Math.max(0, y0); y <= Math.min(w.H - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(w.W - 1, x1); x++) w.place(w.idx(x, y), t);
    }
  }
  // paint the cells of type t in a box one colour (or, given a list, a speckle of its colours)
  function paintBox(w, x0, y0, x1, y1, t, c) {
    for (let y = Math.max(0, y0); y <= Math.min(w.H - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(w.W - 1, x1); x++) {
        const i = w.idx(x, y);
        if (w.type[i] === t) tone(w, i, Array.isArray(c) ? pick(c, x, y) : c);
      }
    }
  }
  // a steady pick from a list by position: speckle that stays put when the scene is rebuilt elsewhere
  const pick = (list, x, y) => list[(((x * 73856093) ^ (y * 19349663)) >>> 0) % list.length];
  // the first cell down column x that isn't empty
  function topOf(w, x) {
    let y = 0;
    while (y < w.H && w.type[w.idx(x, y)] === ID.EMPTY) y++;
    return y;
  }
  const rand = (a, b) => a + Math.random() * (b - a);

  // Grown trees, built finished: living trunk is wood with LEAF (a palm's with PETAL too, as it
  // drinks from sand), leaves are plant with LEAF and their tree in aux (as sim.js grows them).
  const OAK = 0, PINE = 1, PALM = 2, WILLOW = 3;
  function wood(w, x, y, palm) {
    if (!inMap(w, x, y)) return;
    const i = w.idx(x, y);
    w.place(i, ID.WOOD); w.flags[i] = palm ? LEAF | PETAL : LEAF; w.sap[i] = 230;
  }
  function leaf(w, x, y, kind) {
    if (!inMap(w, x, y)) return;
    const i = w.idx(x, y);
    if (w.type[i] !== ID.EMPTY) return;
    w.place(i, ID.PLANT); w.flags[i] = LEAF; w.aux[i] = kind; w.data[i] = 0; w.sap[i] = 230;
  }
  function limb(w, x0, y0, x1, y1) {
    const n = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let q = 0; q <= n; q++) wood(w, Math.round(x0 + ((x1 - x0) * q) / n), Math.round(y0 + ((y1 - y0) * q) / n));
  }
  // a clump of leaves with a ragged edge and a few gaps for the sky to show through
  function clump(w, cx, cy, rx, ry, kind) {
    rx = Math.max(1, rx); ry = Math.max(1, ry);
    for (let dy = -ry; dy <= ry; dy++) {
      for (let dx = -rx; dx <= rx; dx++) {
        const f = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
        if (f > 1 - Math.random() * 0.3 || (f > 0.45 && Math.random() < 0.1)) continue;
        leaf(w, cx + dx, cy + dy, kind);
      }
    }
  }
  // An oak h tall standing on the ground at row g: a stout trunk, limbs angling up and out, and a
  // broad crown of overlapping clumps over their ends.
  function oak(w, x, g, h) {
    const R = Math.max(5, Math.round(h * 0.42)), top = g - h;
    for (let k = 0; k < h; k++) {
      const wd = k < 2 ? 4 : k < h * 0.4 ? 3 : 2;
      for (let d = 0; d < wd; d++) wood(w, x - (wd >> 1) + d, g - 1 - k);
    }
    const ends = [];
    const n = 3 + ((Math.random() * 3) | 0);
    for (let k = 0; k < n; k++) {
      const side = k % 2 ? 1 : -1, y0 = top + Math.round(h * rand(0.05, 0.4)), len = R * rand(0.55, 1), a = rand(0.3, 0.9);
      const x1 = x + side * Math.round(Math.cos(a) * len), y1 = y0 - Math.round(Math.sin(a) * len);
      limb(w, x, y0, x1, y1);
      ends.push([x1, y1]);
    }
    clump(w, x, top - Math.round(R * 0.15), Math.round(R * 0.85), Math.round(R * 0.5), OAK);
    for (const [ex, ey] of ends) clump(w, ex, ey, Math.round(R * rand(0.45, 0.7)), Math.round(R * rand(0.3, 0.42)), OAK);
  }
  // A pine: a straight trunk under a cone of needles in tiers, each wider at its foot.
  function pine(w, x, g, h) {
    for (let k = 0; k < h; k++) { wood(w, x, g - 1 - k); if (k < 3) wood(w, x + 1, g - 1 - k); }
    const top = g - h, depth = Math.round(h * 0.8), tier = Math.max(4, Math.round(depth / 6));
    leaf(w, x, top - 1, PINE);
    for (let dy = 0; dy < depth; dy++) {
      const t = ((dy + tier - 1) % tier) / tier, hw = (1 + dy * 0.33) * (0.4 + 0.6 * t), y = top + dy;
      if (t > 0.75 && hw > 3) { limb(w, x, y, x - Math.round(hw * 0.6), y + 1); limb(w, x, y, x + Math.round(hw * 0.6), y + 1); }
      for (let dx = -Math.ceil(hw); dx <= Math.ceil(hw); dx++) if (Math.abs(dx) <= hw + rand(-0.5, 0.5)) leaf(w, x + dx, y, PINE);
    }
  }
  // A palm: a slender trunk curving over toward `lean` (−1 left, 1 right), a crown of fronds arching
  // out and drooping, and a coconut or two at its foot.
  function palm(w, x, g, h, lean) {
    let px = x, py = g - 1;
    for (let k = 0; k < h; k++) {
      px = x + Math.round(lean * h * 0.4 * (k / h) * (k / h)); py = g - 1 - k;
      wood(w, px, py, true);
      if (k < 2) wood(w, px + 1, py, true);
    }
    for (let f = 0; f < 9; f++) {
      const a = -Math.PI * (0.03 + f * 0.117) + rand(-0.1, 0.1), len = Math.round(h * rand(0.32, 0.45));
      let fx = 0, fy = 0, uy = Math.sin(a) * 0.8;
      const ux = Math.cos(a);
      for (let st = 0; st < len; st++) {
        fx += ux; fy += uy; uy += 1.9 / len;
        leaf(w, px + Math.round(fx), py - 1 + Math.round(fy), PALM);
        if (st < len * 0.6) leaf(w, px + Math.round(fx), py + Math.round(fy), PALM);
      }
    }
    for (const d of [-2, 3]) { const y = topOf(w, x + d); if (y > 0 && y < w.H) put(w, x + d, y - 1, ID.COCONUT); }
  }
  // A willow: a short, stout trunk with spreading limbs, a broad flat crown, and curtains of leaves
  // hanging from its underside most of the way to the ground.
  function willow(w, x, g, h) {
    const R = Math.round(h * 0.8), top = g - h;
    for (let k = 0; k < h; k++) {
      const wd = k < 2 ? 5 : k < h * 0.5 ? 4 : 3;
      for (let d = 0; d < wd; d++) wood(w, x - (wd >> 1) + d, g - 1 - k);
    }
    for (let k = 0; k < 5; k++) {
      const side = k % 2 ? 1 : -1, y0 = top + Math.round(h * rand(0, 0.35)), len = R * rand(0.5, 0.9), a = rand(0.15, 0.5);
      limb(w, x, y0, x + side * Math.round(Math.cos(a) * len), y0 - Math.round(Math.sin(a) * len));
    }
    clump(w, x, top - 2, R, Math.round(R * 0.36), WILLOW);
    for (let xx = x - R; xx <= x + R; xx++) {
      if (Math.random() < 0.3 || xx < 0 || xx >= w.W) continue;
      let low = -1;
      for (let y = Math.max(0, top - 2 - R); y <= top + 4; y++) {
        const i = w.idx(xx, y);
        if (w.type[i] === ID.PLANT && w.aux[i] === WILLOW) low = y;
      }
      if (low < 0) continue;
      const len = Math.round((g - 2 - low) * rand(0.3, 0.85));
      for (let st = 1; st <= len && w.type[w.idx(xx, low + st)] === ID.EMPTY; st++) leaf(w, xx, low + st, WILLOW);
    }
  }
  // A bush: a mound of leaves on the ground at row g
  const bush = (w, x, g, r, kind = OAK) => clump(w, x, g - Math.round(r * 0.45), r, Math.max(1, Math.round(r * 0.6)), kind);
  // a dead tree: bare wood (PETAL alone), a trunk and a few broken limbs
  function snag(w, x, g, h) {
    const dead = (xx, y) => { const i = put(w, xx, y, ID.WOOD); if (i >= 0) w.flags[i] = PETAL; };
    for (let k = 0; k < h; k++) { dead(x, g - 1 - k); if (k < 2) dead(x + 1, g - 1 - k); }
    for (let k = 0; k < 3; k++) {
      const y0 = g - h + Math.round(h * rand(0.1, 0.5)), side = k % 2 ? 1 : -1, len = Math.round(h * rand(0.15, 0.35));
      for (let q = 1; q <= len; q++) dead(x + side * q, y0 - (q >> 1));
    }
  }
  // A flower: a short stem that grows and opens within a second or two.
  function flower(w, x, y, hue) {
    if (!inMap(w, x, y) || (w.type[w.idx(x, y)] !== ID.EMPTY && w.type[w.idx(x, y)] !== ID.GRASS)) return;
    const i = put(w, x, y, ID.PLANT);
    w.data[i] = 2 + ((Math.random() * 4) | 0); w.aux[i] = hue || 1 + ((Math.random() * 255) | 0);
  }
  // Grass on bare soil or dirt between x0 and x1, a blade or three tall
  function grassOver(w, x0, x1, p = 0.85) {
    for (let x = Math.max(0, x0); x <= Math.min(w.W - 1, x1); x++) {
      if (Math.random() > p) continue;
      const y = topOf(w, x), t = y < w.H ? w.type[w.idx(x, y)] : 0;
      if (y > 0 && (t === ID.SOIL || t === ID.DIRT)) { const i = put(w, x, y - 1, ID.GRASS); w.data[i] = (Math.random() * 3) | 0; }
    }
  }
  // a person standing on the ground at row g
  function person(w, x, g) {
    if (!inMap(w, x, g - 2) || w.type[w.idx(x, g - 1)] !== ID.EMPTY || w.type[w.idx(x, g - 2)] !== ID.EMPTY) return;
    put(w, x, g - 1, ID.HUMAN); put(w, x, g - 2, ID.HEAD);
  }
  // n creatures of type t dropped into cells of type `into` (EMPTY, WATER…) inside a box
  function scatter(w, t, n, x0, y0, x1, y1, into = ID.EMPTY) {
    for (let k = 0, tries = 0; k < n && tries < n * 60; tries++) {
      const x = Math.round(rand(x0, x1)), y = Math.round(rand(y0, y1));
      if (!inMap(w, x, y) || w.type[w.idx(x, y)] !== into) continue;
      put(w, x, y, t); k++;
    }
  }
  // a thick pipe of half-width r along a path of points, walled in, open at the caps given
  function pipe(w, pts, r, caps) {
    w.beginStroke();
    w.setBrush('square');
    for (let k = 1; k < pts.length; k++) {
      const [x0, y0] = pts[k - 1], [x1, y1] = pts[k], n = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let q = 0; q <= n; q++) w.paint(Math.round(x0 + ((x1 - x0) * q) / n), Math.round(y0 + ((y1 - y0) * q) / n), r, ID.PIPE, 1, true);
    }
    w.setBrush('circle');
    w.encase(caps || []);
  }

  // The tools the machine scenes build with. A layout is drawn for a 256 × 160 map and scaled up
  // with the map by P(); rect fills a box, part fills one with a machine and sets each cell up.
  function kit(w) {
    const { W, H } = w;
    const s = H / 160, P = (v) => Math.max(1, Math.round(v * s));
    const rect = (x0, y0, x1, y1, t) => {
      for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
        for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) w.place(w.idx(x, y), t);
      }
    };
    const each = (x0, y0, x1, y1, f) => {
      for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) f(w.idx(x, y));
    };
    const tint = (x0, y0, x1, y1, t, hex) => each(x0, y0, x1, y1, (i) => { if (w.type[i] === t) w.col[i] = G.Sim.PAINTED | parseInt(hex.slice(1), 16); });
    const part = (x0, y0, x1, y1, t, set) => { rect(x0, y0, x1, y1, t); if (set) each(x0, y0, x1, y1, set); };
    const facing = (d) => (i) => { w.data[i] = d; };           // a pump: the way it pushes (0 up)
    const pushing = (d) => (i) => { w.aux[i] = d; w.sap[i] = 255; }; // a piston: the way it pushes (0 up), powered until its battery's current arrives
    const switched = (v) => (i) => { w.aux[i] = v; };          // a switch: on (1) or off (0)
    const senses = (mode, T) => (i) => { w.aux[i] = mode << 1; w.data[i] = T; }; // 0 touch, 1 hotter than T
    const holding = (c, n) => (i) => { w.aux[i] = c; w.data[i] = n; }; // a tank cell: what it holds, and how much
    // a thick pipe of half-width r along a path of points, walled in, open at the caps given
    const pipe = (pts, r, caps) => {
      w.beginStroke();
      w.setBrush('square');
      for (let k = 1; k < pts.length; k++) {
        const [x0, y0] = pts[k - 1], [x1, y1] = pts[k], n = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0));
        for (let q = 0; q <= n; q++) w.paint(Math.round(x0 + ((x1 - x0) * q) / n), Math.round(y0 + ((y1 - y0) * q) / n), r, ID.PIPE, 1, true);
      }
      w.setBrush('circle');
      w.encase(caps || []);
    };
    const r1 = P(1), r2 = P(2);           // half-widths: a pipe 3 or 5 cells across (more on a big map)
    const pw = r2 + 1;                    // a pump's half-width: its pipe's, walls and all
    const gy = H - P(30);                 // the top of the ground
    return { W, H, s, P, rect, each, tint, part, facing, pushing, switched, senses, holding, pipe, r1, r2, pw, gy };
  }
  // the ground from row gy down: soil over stone, grass on top
  function ground(w, gy) {
    const { P, rect } = kit(w);
    rect(0, gy, w.W - 1, w.H - 1, ID.STONE);
    rect(0, gy, w.W - 1, gy + P(3), ID.SOIL);
    for (let x = 0; x < w.W; x++) if (Math.random() < 0.8) w.place(w.idx(x, gy - 1), ID.GRASS);
  }

  const scenes = {
    empty(w) { w.clear(); },

    // A volcano from a storybook: a dark brown cone, a red-hot mouth holding a lake of lava, glowing
    // magma rising to it from a chamber deep below, and smoke above. Dig into its side to let it out.
    volcano(w) {
      w.clear();
      const { W, H } = w, s = H / 200, P = (v) => Math.max(1, Math.round(v * s));
      const n = noise1(), n2 = noise1();
      const px = Math.round(W / 2), base = H - P(3), lip = Math.round(H * 0.22), mouth = P(13), bowl = P(12);
      const top = new Int32Array(W);
      for (let x = 0; x < W; x++) {
        const d = Math.abs(x - px), u = Math.min(1, Math.max(0, (d - mouth) / (W * 0.46)));
        top[x] = d < mouth
          ? lip + Math.round(bowl * Math.sqrt(1 - (d / mouth) ** 2)) - P(1)
          : Math.round(base - (base - lip) * Math.pow(1 - u, 1.9) + n(x) * P(3) * Math.min(1, u * 3));
      }
      const BODY = ['#3e2b20', '#48321f', '#36261c', '#4f3826', '#43301f'].map(rgb), RED = rgb('#a32513'), HOT = rgb('#d8461c');
      for (let x = 0; x < W; x++) {
        for (let y = Math.max(2, top[x]); y < H; y++) {
          const i = w.idx(x, y);
          w.place(i, ID.STONE);
          // dark brown, layered by old flows, turning red toward the mouth
          let c = pick(BODY, x >> 1, (y + Math.round(n2(x) * 3)) >> 1);
          if (((y + Math.round(n2(x * 0.7) * 4)) % P(9)) === 0) c = mixRGB(c, 0x241812, 0.5);
          const dist = Math.hypot((x - px) * 0.8, (y - lip) * 1.3), f = Math.max(0, 1 - (dist - mouth) / P(34));
          if (f > 0) c = mixRGB(c, f > 0.75 ? HOT : RED, Math.min(1, f * f * 1.4));
          tone(w, i, c);
        }
      }
      // lava runs frozen down the flanks, still glowing orange at their hearts
      const FLOW = ['#e2541e', '#f07a28', '#c83a18'].map(rgb);
      for (const [side, len, th] of [[-1, 0.55, P(2)], [1, 0.4, P(2)], [-1, 0.25, P(1)]]) {
        const x0 = px + side * (mouth + P(1)), x1 = px + side * (mouth + Math.round(W * 0.46 * len));
        for (let x = x0; side < 0 ? x >= x1 : x <= x1; x += side) {
          if (x < 0 || x >= W) break;
          const tl = Math.max(1, Math.round(th * (1 - Math.abs(x - x0) / Math.abs(x1 - x0 || 1)) + rand(-0.4, 0.8)));
          for (let k = 0; k < tl; k++) { const i = w.idx(x, top[x] + k); if (w.type[i] === ID.STONE) tone(w, i, pick(FLOW, x, top[x] + k)); }
        }
      }
      // the magma chamber, resting on the hot floor, and the pipe up to the lava lake in the mouth
      const ry = Math.round(H * 0.12), rx = Math.round(W * 0.13), cy = H - ry + 2;
      blob(w, px, cy, rx, ry, ID.LAVA);
      const pw = P(4); // the pipe runs straight up, as magma only rises straight up through itself
      for (let y = top[px] - 1; y < cy; y++) for (let dx = -pw; dx <= pw; dx++) put(w, px + dx, y, ID.LAVA);
      const lake = lip + P(3);
      for (let x = px - mouth; x <= px + mouth; x++) for (let y = lake; y < top[x] + 2; y++) put(w, x, y, ID.LAVA);
      // all of it deep magma (CENTER: it stays molten until it meets the open air), in a skin of
      // obsidian (red at the mouth). Nothing in it is wall, so the Volcano weapon fired at the middle
      // of the mountain melts its way in and pushes the magma up and out of the mouth.
      const OBS = ['#1d1520', '#241a2b', '#17111c'].map(rgb);
      for (let i = 0; i < w.N; i++) {
        if (w.type[i] !== ID.LAVA) continue;
        w.temp[i] = 1080; w.flags[i] = G.Sim.CENTER;
        for (const j of [i - 1, i + 1, i - w.SW, i + w.SW]) {
          if (w.type[j] !== ID.STONE) continue;
          const y = ((j / w.SW) | 0) - 1;
          w.place(j, ID.OBSIDIAN);
          tone(w, j, y < lip + bowl + P(3) ? HOT : pick(OBS, j, y));
        }
      }
      // foothills: soil and grass, pines far out, dead trees and black boulders nearer the mountain
      for (const side of [-1, 1]) {
        for (let k = 0; k < W * 0.2; k++) {
          const x = side < 0 ? k : W - 1 - k;
          fillCol(w, x, top[x] - P(3), top[x] - 1, ID.SOIL);
        }
        for (const [u, f] of [[0.03, pine], [0.1, pine], [0.16, snag]]) {
          const x = side < 0 ? Math.round(W * u) : W - 1 - Math.round(W * u);
          f(w, x, topOf(w, x), P(f === pine ? 22 : 12) + ((Math.random() * P(6)) | 0));
        }
        const bx = side < 0 ? Math.round(W * 0.21) : W - 1 - Math.round(W * 0.21);
        blob(w, bx, topOf(w, bx) - 1, P(3), P(2), ID.OBSIDIAN, true);
      }
      grassOver(w, 0, Math.round(W * 0.2)); grassOver(w, W - 1 - Math.round(W * 0.2), W - 1);
      w.livenTrees();
    },

    // A dense old wood on rolling ground: tall pines and broad oaks crowded together, willows over a
    // pond of lilies, bushes and flowers beneath, a fallen log and mushrooms in the shade. Made for fire.
    forest(w) {
      w.clear();
      const { W, H } = w, s = H / 200, P = (v) => Math.max(1, Math.round(v * s));
      const n = noise1();
      const pond0 = Math.round(W * 0.6), pond1 = Math.round(W * 0.75);
      const ground = new Int32Array(W);
      for (let x = 0; x < W; x++) ground[x] = Math.round(H * 0.8 + n(x) * H * 0.05);
      const level = Math.max(ground[pond0], ground[pond1]);
      for (let x = pond0; x <= pond1; x++) ground[x] = level;
      const BANDS = ['#6a655e', '#615c56', '#736d65'].map(rgb);
      for (let x = 0; x < W; x++) {
        const g = ground[x];
        for (let y = g + P(10); y < H; y++) tone(w, put(w, x, y, ID.STONE), BANDS[(((y + Math.sin(x * 0.05) * 2) / P(4)) | 0) % 3]);
        fillCol(w, x, g, g + P(9), ID.SOIL);
        if (x > pond0 && x < pond1) {
          const depth = Math.round(Math.sin(((x - pond0) / (pond1 - pond0)) * Math.PI) * P(16));
          fillCol(w, x, g, g + depth, ID.WATER);
          for (let y = g + depth + 1; y <= g + depth + P(2); y++) tone(w, put(w, x, y, ID.STONE), BANDS[0]);
        }
      }
      grassOver(w, 0, W - 1, 0.95);
      // the trees, close together: mostly pines to the west, oaks in the middle, both past the pond
      const trees = [];
      for (let x = P(4); x < W - P(3);) {
        if (x > pond0 - P(8) && x < pond1 + P(8)) { x = pond1 + P(10); continue; }
        const u = x / W, r = Math.random();
        const kind = u < 0.3 ? (r < 0.7 ? pine : oak) : u < 0.58 ? (r < 0.6 ? oak : pine) : r < 0.5 ? pine : oak;
        trees.push([x, kind]);
        x += kind === pine ? P(9) + ((Math.random() * P(5)) | 0) : P(16) + ((Math.random() * P(7)) | 0);
      }
      for (const [x, kind] of trees) if (kind === oak) oak(w, x, ground[x], P(34) + ((Math.random() * P(18)) | 0));
      for (const [x, kind] of trees) if (kind === pine) pine(w, x, ground[x], P(52) + ((Math.random() * P(34)) | 0));
      willow(w, pond0 - P(3), ground[pond0 - P(3)], P(22));
      willow(w, pond1 + P(4), ground[pond1 + P(4)], P(18));
      // a fallen log, with spores on it for mushrooms
      const lx = Math.round(W * 0.47), lg = ground[lx];
      for (let x = lx; x < lx + P(16); x++) for (let y = lg - P(3); y < ground[x]; y++) { const i = put(w, x, y, ID.WOOD); if (i >= 0) w.flags[i] = PETAL; }
      for (let x = lx + 1; x < lx + P(16); x += P(3)) { const y = topOf(w, x); if (y > 0) put(w, x, y - 1, ID.SPORES); }
      // bushes, flowers and more spores under the canopy
      for (let k = 0; k < Math.round(W / P(12)); k++) {
        const x = Math.round(rand(P(2), W - P(2)));
        if (x > pond0 - 2 && x < pond1 + 2) continue;
        bush(w, x, ground[x], P(2) + ((Math.random() * P(3)) | 0));
      }
      for (let k = 0; k < Math.round(W / P(9)); k++) {
        const x = Math.round(rand(P(2), W - P(2)));
        if (x < pond0 - 2 || x > pond1 + 2) flower(w, x, ground[x] - 1);
      }
      for (let k = 0; k < 10; k++) { const x = Math.round(rand(P(2), pond0 - P(10))); if (w.type[w.idx(x, ground[x] - 1)] !== ID.WOOD) put(w, x, ground[x] - 1, ID.SPORES); }
      // lilies and fish in the pond, fireflies over it, birds in the trees
      for (let x = pond0 + P(4); x < pond1 - P(4); x += P(6)) { const y = topOf(w, x); for (let d = y; d < H && w.type[w.idx(x, d)] === ID.WATER; d++) if (w.type[w.idx(x, d + 1)] !== ID.WATER) put(w, x, d, ID.LILYSEED); }
      scatter(w, ID.FISH, 5, pond0, level, pond1, level + P(14), ID.WATER);
      scatter(w, ID.FIREFLY, 8, pond0 - P(10), level - P(20), pond1 + P(10), level - P(3));
      scatter(w, ID.BIRD, 6, 0, P(10), W - 1, H * 0.4);
      w.livenTrees();
    },

    // A village on level ground: a pasture of cows behind a white fence, a red barn, three houses (brick,
    // timber-framed and wooden), a limestone church with a spire and a rose window, a well on a paved
    // square, a garden, a pond with a willow and lilies, and a field of crops under a windmill.
    village(w) {
      w.clear();
      const { W, H } = w, s = H / 200, P = (v) => Math.max(1, Math.round(v * s)), X = (u) => Math.round(W * u);
      const n = noise1();
      const gy = Math.round(H * 0.8);
      const ground = new Int32Array(W);
      for (let x = 0; x < W; x++) ground[x] = gy - Math.round(Math.max(0, 0.08 - x / W) * 12 * P(8)) + (x / W < 0.12 || x / W > 0.84 ? Math.round(n(x) * P(1)) : 0);
      const BANDS = ['#6a655e', '#615c56', '#736d65'].map(rgb);
      for (let x = 0; x < W; x++) {
        for (let y = ground[x] + P(12); y < H; y++) tone(w, put(w, x, y, ID.STONE), BANDS[(((y + Math.sin(x * 0.05) * 2) / P(4)) | 0) % 3]);
        fillCol(w, x, ground[x], ground[x] + P(11), ID.SOIL);
      }
      const paint = (x0, y0, x1, y1, t, c) => { rect(w, x0, y0, x1, y1, t); paintBox(w, x0, y0, x1, y1, t, Array.isArray(c) ? c.map(rgb) : rgb(c)); };
      // a pitched roof over [x0, x1] whose eaves sit at row y, in material t
      const roof = (x0, x1, y, t, c) => {
        for (let k = 0; x0 + k <= x1 - k; k++) paint(x0 + k, y - k, x1 - k, y - k, t, c);
      };
      // a house: walls of t from x0 to x1, h tall, with windows, a door on one side and a roof
      const house = (x0, x1, h, wall, wallC, roofT, roofC, doorRight) => {
        const g = gy, top = g - h;
        paint(x0, top, x1, g - 1, wall, wallC);
        rect(w, x0 + 2, top + 2, x1 - 2, g - 1, ID.EMPTY);
        paint(x0, g - 1, x1, g - 1, ID.WOOD, '#6b4e34');                             // floor boards
        const dx = doorRight ? x1 - 1 : x0;
        rect(w, dx, g - P(8), dx + 1, g - 2, ID.EMPTY);                              // the door
        for (const wx of [x0 + Math.round((x1 - x0) * 0.25), x0 + Math.round((x1 - x0) * 0.65)]) paint(wx, top + P(3), wx + P(3), top + P(5), ID.GLASS, '#bfe3f2');
        roof(x0 - P(2), x1 + P(2), top, roofT, roofC);
        const cx = doorRight ? x0 + P(3) : x1 - P(5);                                 // the chimney
        paint(cx, top - P(9), cx + P(2), top - 1, ID.BRICK, '#8a3a26');
        return top;
      };
      // ── the pasture: a solid white fence, cows on grass, trees behind ──
      const f0 = P(2), f1 = X(0.15);
      paint(f1, gy - P(5), f1 + 1, gy - 1, ID.WOOD, '#ece6da');
      for (let x = f0; x <= f1; x += P(6)) paint(x, gy - P(6), x, gy - 1, ID.WOOD, '#ece6da');
      pine(w, P(6), ground[P(6)], P(40));
      oak(w, X(0.07), ground[X(0.07)], P(26));
      // ── the barn: red boards, white trim, a dark roof, a hay loft ──
      const b0 = X(0.17), b1 = X(0.27), bh = P(24), btop = gy - bh;
      paint(b0, btop, b1, gy - 1, ID.WOOD, ['#9e2f22', '#a8382a']);
      rect(w, b0 + 2, btop + 2, b1 - 2, gy - 1, ID.EMPTY);
      paint(b0, btop, b1, btop + 1, ID.WOOD, '#ece6da');                            // white trim under the eaves
      rect(w, b1 - 1, gy - P(12), b1, gy - 2, ID.EMPTY);                            // its big door…
      paint(b1 - 1, gy - P(13), b1, gy - P(13), ID.WOOD, '#ece6da');                  // …framed in white
      paint(b0 + 2, gy - P(13), b1 - P(6), gy - P(13), ID.WOOD, '#6b4e34');            // the loft
      paint(b0 + 2, gy - P(18), b0 + P(8), gy - P(14), ID.WOOD, ['#d9b65e', '#c9a64e']); // hay up in it
      paint(b0 + 2, gy - P(4), b0 + P(7), gy - 2, ID.WOOD, ['#d9b65e', '#c9a64e']);
      roof(b0 - P(2), b1 + P(2), btop, ID.WOOD, ['#4e342a', '#5a3d30']);
      // ── three houses ──
      house(X(0.29), X(0.37), P(18), ID.BRICK, '#a3442c', ID.BRICK, ['#5a5f6b', '#525764'], true);
      const tb = house(X(0.39), X(0.47), P(18), ID.CONCRETE, '#ece0c4', ID.BRICK, ['#b4532f', '#a64b2a'], false);
      for (const x of [X(0.39), X(0.39) + 1, X(0.47) - 1, X(0.47)]) paint(x, tb, x, gy - 1, ID.CONCRETE, '#ece0c4');
      for (let x = X(0.39); x <= X(0.47); x += P(5)) paint(x, tb, x, tb + 1, ID.WOOD, '#4a3426'); // timber frame
      paint(X(0.39), tb, X(0.47), tb, ID.WOOD, '#4a3426');
      for (const x of [X(0.39), X(0.47) - 1]) paint(x, tb, x + 1, tb + P(1), ID.WOOD, '#4a3426');
      rect(w, X(0.39), gy - P(8), X(0.39) + 1, gy - 2, ID.EMPTY);
      house(X(0.66), X(0.73), P(16), ID.WOOD, ['#c7a57a', '#b8966c'], ID.WOOD, ['#3e4a5c', '#465366'], false);
      // ── the church: a limestone nave with a spire on its tower and a rose window ──
      const c0 = X(0.5), c1 = X(0.585), ch = P(22), ctop = gy - ch, t0 = X(0.49), t1 = t0 + P(8), ttop = gy - P(48);
      rect(w, c0, ctop, c1, gy - 1, ID.LIMESTONE);
      rect(w, c0 + 1, ctop + 1, c1 - 1, gy - 1, ID.EMPTY);
      paint(c0 + 1, gy - 1, c1 - 1, gy - 1, ID.STONE, '#8f8678');
      rect(w, c1, gy - P(9), c1, gy - 2, ID.EMPTY);
      for (let wx = c0 + P(5); wx < c1 - P(3); wx += P(6)) paint(wx, ctop + P(5), wx + 1, ctop + P(12), ID.GLASS, ['#c83a3a', '#3a6ad0', '#e8c040']);
      roof(c0 - P(1), c1 + P(1), ctop, ID.STONE, ['#4c5566', '#454e5e']);
      rect(w, t0, ttop, t1, gy - 1, ID.LIMESTONE);
      rect(w, t0 + 1, ttop + P(3), t1 - 1, ttop + P(9), ID.EMPTY);                  // the belfry
      paint(t0 + P(3), ttop + P(3), t1 - P(3), ttop + P(5), ID.METAL, '#b08d57');     // its bell
      for (let k = 0; k < P(18); k++) paint(t0 + (k * (t1 - t0)) / (2 * P(18)) | 0, ttop - 1 - k, t1 - (k * (t1 - t0)) / (2 * P(18)) | 0, ttop - 1 - k, ID.STONE, '#3f4757');
      const rx = (t0 + t1) >> 1, ry = ttop + P(15), rr = P(3);                          // the rose window
      const ROSE = ['#c83a3a', '#3a6ad0', '#e8c040', '#3aa060'];
      for (let y = ry - rr; y <= ry + rr; y++) for (let x = rx - rr; x <= rx + rr; x++) {
        const d = Math.hypot(x - rx, y - ry);
        if (d <= rr) paint(x, y, x, y, ID.GLASS, d < 1 ? '#e8c040' : ROSE[(((Math.atan2(y - ry, x - rx) + Math.PI) / (Math.PI / 2)) | 0) & 3]);
      }
      // ── the square: paving, and a well with a little roof ──
      const s0 = X(0.6), s1 = X(0.65), wc = (s0 + s1) >> 1;
      paint(X(0.16), gy, X(0.75), gy, ID.STONE, ['#a59a88', '#9a8f7e', '#b0a594']);  // the street
      rect(w, wc - P(3), gy, wc + P(3), gy + P(16), ID.STONE);
      paintBox(w, wc - P(3), gy, wc + P(3), gy + P(16), ID.STONE, ['#8f8678', '#857c6f'].map(rgb));
      rect(w, wc - P(2), gy - P(3), wc + P(2), gy + P(15), ID.EMPTY);
      rect(w, wc - P(2), gy + P(10), wc + P(2), gy + P(15), ID.WATER);
      paint(wc - P(4), gy - P(3), wc - P(3), gy - 1, ID.STONE, '#8f8678'); paint(wc + P(3), gy - P(3), wc + P(4), gy - 1, ID.STONE, '#8f8678');
      paint(wc - P(4), gy - P(10), wc - P(4), gy - P(4), ID.WOOD, '#6b4e34'); paint(wc + P(4), gy - P(10), wc + P(4), gy - P(4), ID.WOOD, '#6b4e34');
      roof(wc - P(6), wc + P(6), gy - P(10), ID.WOOD, '#7a4a32');
      // ── a garden in front of the wooden house ──
      for (let x = X(0.615) + 2; x < X(0.655) - 2; x += 2) if (Math.abs(x - wc) > P(6)) flower(w, x, gy - 1);
      // ── the pond, with a willow, lilies and fish ──
      const p0 = X(0.76), p1 = X(0.84);
      for (let x = p0; x <= p1; x++) {
        const depth = Math.round(Math.sin(((x - p0) / (p1 - p0)) * Math.PI) * P(10));
        if (depth < 1) continue;
        rect(w, x, gy, x, gy + depth, ID.WATER);
        paint(x, gy + depth + 1, x, gy + depth + P(2), ID.STONE, '#706a62');
      }
      for (let x = p0 + P(3); x < p1 - P(3); x += P(5)) { let y = gy; while (y < H - 1 && w.type[w.idx(x, y + 1)] === ID.WATER) y++; put(w, x, y, ID.LILYSEED); }
      scatter(w, ID.FISH, 3, p0, gy + 1, p1, gy + P(8), ID.WATER);
      willow(w, X(0.75), gy, P(18));
      // ── the field: furrows of crops, and a windmill ──
      const fl0 = X(0.86), fl1 = X(0.91), mill = X(0.95);
      for (let x = fl0; x <= W - 1; x++) tone(w, w.idx(x, ground[x]), rgb(x % 3 ? '#3e2a1a' : '#4e3622'));
      grassOver(w, 0, W - 1, 0.92);
      for (let x = fl0; x <= fl1; x += 2) { const i = put(w, x, ground[x] - 1, ID.PLANT); w.data[i] = 4 + ((Math.random() * 5) | 0); w.aux[i] = 0; }
      const mt = ground[mill] - P(34);
      for (let y = mt; y < ground[mill]; y++) {
        const hw = Math.round(P(3) + (y - mt) * 0.1);
        paint(mill - hw, y, mill + hw, y, ID.STONE, ['#d8d0c0', '#cdc5b4']);
      }
      roof(mill - P(5), mill + P(5), mt, ID.WOOD, '#4e342a');
      const hubY = mt + P(3), hubX = mill - P(5);
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        for (let k = 1; k <= P(15); k++) {
          paint(hubX + dx * k, hubY + dy * k, hubX + dx * k, hubY + dy * k, ID.WOOD, '#8a6a48');
          if (k > P(4) && k % 2 === 0) paint(hubX + dx * k + dx, hubY + dy * k, hubX + dx * k + dx, hubY + dy * k, ID.WOOD, '#ece6da');
        }
      }
      // ── the anthill, people, cows and birds ──
      const ax = X(0.88);
      blob(w, ax, gy - 1, P(4), P(3), ID.DIRT, true);
      scatter(w, ID.ANT, 10, ax - P(4), gy - P(4), ax + P(4), gy - 1);
      for (let k = 0; k < 4; k++) { const x = Math.round(rand(f0 + P(3), f1 - P(3))); if (w.type[w.idx(x, ground[x] - 1)] !== ID.WOOD) put(w, x, ground[x] - 1, ID.COW); }
      for (const u of [0.28, 0.33, 0.38, 0.43, 0.48, 0.545, 0.6, 0.63, 0.645, 0.695, 0.745, 0.865]) person(w, X(u), gy);
      scatter(w, ID.BIRD, 8, 0, P(10), W - 1, H * 0.35);
      w.livenTrees();
    },

    // A nuclear power plant that runs itself. A low uranium core, cut into sections with a radium-
    // beryllium neutron source in each (radium's alpha rays knock neutrons out of beryllium), simmers
    // below critical. Hafnium columns pushed up between the sections by pistons cut the chain reaction
    // to a third. The core's heat rises through a glass layer (which soaks up each fission's flash)
    // into a diamond hot plate, walled over except for a window in the middle where a strip of
    // tellurium lies in the open air: hot below and cold above, it makes current (the Seebeck effect,
    // as in a space probe's nuclear battery). The current runs through a breaker and under the ground
    // to the town: its houses' lights and street lamps glow, and the fountain in the square plays. A
    // heat sensor on the hot plate drives the columns in when it runs too hot and lets them drop out
    // as it cools; the SCRAM switch outside drives them in by hand, and the lights fade as the core
    // cools. The vessel is lined with wall, which lets no heat through, so the heat goes to the
    // generator and the fuel lasts.
    reactor(w) {
      w.clear();
      const { W, P, rect, each, tint, part, facing, switched, senses, r1, gy } = kit(w);
      ground(w, gy);
      // in cells at any map size, since neutrons fly 16 cells whatever the map: a control column's
      // length (a piston shoves at most 12); the core's height, which a column pushed home covers but
      // for its bottom row (a taller core would chain up and down past the columns); the width of a
      // section of uranium, and of a shaft
      const ROD = 10, CH = 11, SEC = 5, SW = 2, PITCH = SEC + SW + 2;

      // ── the core: sections of uranium, and the walled shafts between them the columns rise in ──
      const n = Math.max(2, Math.round((P(40) - SEC) / PITCH)), cw = SEC + n * PITCH;
      const x0 = P(52), x1 = x0 + cw - 1, cb = gy - 1, ct = cb - CH + 1, wl = P(3);
      const shafts = [];
      for (let k = 0; k < n; k++) shafts.push(x0 + k * PITCH + SEC + 1);
      const sLast = shafts[shafts.length - 1] + SW - 1;
      // the lid, from the core up: glass, the diamond hot plate, and a wall over it with the generator's window
      const glass = ct - 1, hot1 = glass - 1, hot0 = hot1 - P(2) + 1, te = hot0 - 1, lid = te - P(1);
      rect(x0 - wl, lid, x0 - 1, cb, ID.BRICK);                               // the vessel's walls…
      rect(x1 + 1, lid, x1 + wl, cb, ID.BRICK);
      rect(x0 - wl, gy, x1 + wl, gy + P(14), ID.CONCRETE);                    // …and the basement under it
      tint(x0 - wl, gy, x1 + wl, gy + P(14), ID.CONCRETE, '#bdb8ae');
      rect(x0 - 1, glass, x0 - 1, cb, ID.WALL); rect(x1 + 1, glass, x1 + 1, cb, ID.WALL); // lined with wall, which
      rect(x0, gy, x1, gy, ID.WALL);                                          // lets no heat out: it goes to the generator
      rect(x0, ct, x1, cb, ID.EL_U);
      for (const x of shafts) {
        rect(x - 1, ct, x - 1, cb, ID.WALL); rect(x + SW, ct, x + SW, cb, ID.WALL);
        rect(x, ct, x + SW - 1, cb, ID.EMPTY);                                // the shaft, empty above the column
        rect(x, gy, x + SW - 1, gy + ROD - 1, ID.EL_HF);                      // the control column, parked below the core
      }
      for (let k = 0; k <= n; k++) {                                          // the neutron sources: radium between two beryllium
        const m = x0 + k * PITCH + (SEC >> 1), my = ct + (CH >> 1);
        rect(m, my - 1, m, my + 1, ID.EL_BE); rect(m, my, m, my, ID.EL_RA);
      }
      const bar = gy + ROD;                                                   // the pistons under the columns, facing up
      part(shafts[0], bar, sLast, bar + 1, ID.PISTON, (i) => { w.aux[i] = 0; });
      rect(x0, glass, x1, glass, ID.GLASS);
      rect(x0, hot0, x1, hot1, ID.DIAMOND);
      rect(x0, lid, x1, te, ID.WALL);
      const t0 = ((x0 + x1) >> 1) - P(5), t1 = t0 + P(10);                   // the generator
      rect(t0, lid, t1, te, ID.EMPTY);
      rect(t0, te, t1, te, ID.EL_TE);
      // it has been running a while: the core and the hot plate start warm
      each(x0, glass, x1, cb, (i) => { w.temp[i] = 300; });
      each(x0, hot0, x1, hot1, (i) => { w.temp[i] = 260; });

      // ── the thermostat: a heat sensor on the hot plate, wired down the left wall to the pistons ──
      part(x0 - 1, hot0, x0 - 1, hot1, ID.SENSOR, senses(1, 270));
      const wp = x0 - 2;
      rect(wp, hot0, wp, bar + 2, ID.WIRE);
      rect(wp, bar + 2, sLast, bar + 2, ID.WIRE);

      // ── the containment: thick concrete walls and a dome over the vessel ──
      const dc = (x0 + x1) >> 1, dw = P(3), dr = ((x1 - x0) >> 1) + wl + P(8) + dw, dBase = lid - P(14);
      rect(dc - dr, dBase, dc - dr + dw - 1, gy - 1, ID.CONCRETE);
      rect(dc + dr - dw + 1, dBase, dc + dr, gy - 1, ID.CONCRETE);
      for (let x = dc - dr; x <= dc + dr; x++) {
        const dx = x - dc, outer = Math.sqrt(Math.max(0, dr * dr - dx * dx)), inner = Math.sqrt(Math.max(0, (dr - dw) * (dr - dw) - dx * dx));
        rect(x, Math.round(dBase - outer), x, Math.round(dBase - inner), ID.CONCRETE);
      }
      tint(dc - dr, 0, dc + dr, gy - 1, ID.CONCRETE, '#d6d2c8');
      rect(dc - dr, gy - P(10), dc - dr + dw - 1, gy - 1, ID.EMPTY);          // its door
      // a vent stack beside it, banded red and white
      const v0 = P(12), v1 = v0 + P(4), vTop = dBase - dr - P(6);
      rect(v0 - P(2), gy - P(3), v1 + P(2), gy - 1, ID.CONCRETE);
      rect(v0, vTop, v1, gy - P(4), ID.CONCRETE);
      tint(v0 - P(2), vTop, v1 + P(2), gy - 1, ID.CONCRETE, '#e2ded6');
      for (let y = vTop; y < gy - P(10); y += P(12)) tint(v0, y, v1, y + P(4), ID.CONCRETE, '#c4473a');

      // the SCRAM switch (off) and its battery, outside; its wire runs in under the door to the pistons' wire
      const sw1 = dc - dr - P(4), sw0 = sw1 - P(3);
      part(sw0, gy - P(4), sw1, gy - 1, ID.SWITCH, switched(0));
      part(sw0 - P(5), gy - P(5), sw0 - 1, gy - 1, ID.BATTERY);
      rect(sw1 + 1, gy - P(2), sw1 + 1, gy + P(1), ID.WIRE);
      rect(sw1 + 1, gy + P(1), wp - 1, gy + P(1), ID.WIRE);

      // ── the power line: out of the generator through the right wall, down through the breaker (on) on
      //    its outside, and under the ground to the town ──
      const wo = x1 + wl, under = gy + P(18), br0 = gy - P(8), br1 = gy - P(4);
      rect(t1 + 1, te, wo, te, ID.WIRE);
      rect(wo, te, wo, br0 - 1, ID.WIRE);
      part(wo, br0, wo + P(3), br1, ID.SWITCH, switched(1));
      rect(wo, br1 + 1, wo, under + r1, ID.WIRE);
      rect(wo, under, W - P(6), under + r1, ID.WIRE);

      // ── the town: houses with neon ceiling lights, neon street lamps, and a fountain in the square ──
      const bulb = (x0b, y0b, x1b, y1b) => {                                  // glass round neon, one cell in
        rect(x0b, y0b, x1b, y1b, ID.GLASS);
        rect(x0b + 1, y0b + 1, x1b - 1, y1b - 1, ID.EL_NE);
      };
      const lamp = (x, y) => {                                               // a street lamp: a bulb on a wire post
        bulb(x - P(2), y - P(3), x + P(2), y);
        rect(x, y, x, under, ID.WIRE);
      };
      const house = (h0, h1, hh) => {
        const hTop = gy - hh, wall = P(2), ceil = hTop + wall;
        rect(h0, hTop, h1, gy - 1, ID.BRICK);
        rect(h0 + wall, ceil, h1 - wall, gy - 1, ID.EMPTY);
        for (let k = 0; k <= P(6); k++) rect(h0 - P(2) + k, hTop - 1 - k, h1 + P(2) - k, hTop - 1 - k, ID.WOOD); // the roof
        rect(h0, gy - P(9), h0 + wall - 1, gy - 1, ID.EMPTY);                // the door
        // a light hanging from the ceiling, wired up the far wall and along the ceiling
        const wc = (h0 + h1) >> 1, ww = h1 - wall + 1, b0 = ceil + P(3);
        bulb(wc - P(3), b0, wc + P(3), b0 + P(4));
        rect(ww, ceil - 1, ww, under, ID.WIRE);
        rect(wc, ceil - 1, ww, ceil - 1, ID.WIRE);
        rect(wc, ceil, wc, b0, ID.WIRE);
      };
      house(P(113), P(136), P(22));
      lamp(P(143), gy - P(16));
      // the fountain: a pump standing in a basin, its top above the water, jetting it up when powered
      const f0 = P(150), f1 = P(172), fc = (f0 + f1) >> 1, fb = gy + P(8);
      rect(f0, gy - 1, f1, fb + P(2), ID.STONE);
      rect(f0 + P(2), gy - 1, f1 - P(2), fb, ID.EMPTY);
      rect(f0 + P(2), gy, f1 - P(2), fb, ID.WATER);
      part(fc - r1, gy - P(3), fc + r1, fb, ID.PUMP, facing(0));
      rect(fc, fb + 1, fc, under, ID.WIRE);
      lamp(P(180), gy - P(16));
      house(P(188), P(214), P(26));
      lamp(P(219), gy - P(14));
      house(P(225), P(250), P(20));
    },

    // A city at night: skyscrapers whose floors are lit by tubes of noble gas behind the windows (xenon
    // blue, krypton white, neon red, argon violet, helium peach), crowns of stained glass glowing over
    // the tallest, a spire with a red beacon, neon signs, street lamps, and the moon.
    city(w) {
      w.clear();
      const { W, H } = w, s = H / 200, P = (v) => Math.max(1, Math.round(v * s));
      const gy = H - P(14);
      rect(w, 0, gy, W - 1, H - 1, ID.CONCRETE);
      paintBox(w, 0, gy, W - 1, H - 1, ID.CONCRETE, ['#2a2c31', '#26282d'].map(rgb));
      paintBox(w, 0, gy, W - 1, gy + P(2), ID.CONCRETE, ['#85817a', '#7b7771'].map(rgb));
      for (let x = P(4); x < W; x += P(14)) paintBox(w, x, gy + P(8), x + P(7), gy + P(8), ID.CONCRETE, rgb('#d8c25a'));
      const GAS = [ID.EL_XE, ID.EL_KR, ID.EL_NE, ID.EL_AR, ID.EL_HE];
      const BODY = ['#323a48', '#3a4252', '#2b313c', '#463f3a', '#3d4a4f', '#4a4458'].map(rgb);
      const TINTS = [ID.EL_CO, ID.EL_AU, ID.EL_CR, ID.EL_MN, ID.EL_AG, ID.EL_CU, ID.EL_ER];
      const stained = (x, y, tint) => { const i = put(w, x, y, ID.GLASS); if (i >= 0) w.aux[i] = tint; };
      // a sealed tube of gas lying from x0 to x1 with its top at row y (5 rows: glass, gas ×3, glass), lit by a battery at its west end
      const tube = (x0, x1, y, gas, tint) => {
        for (let yy = y; yy <= y + 4; yy++) for (let x = x0; x <= x1; x++) {
          if (yy === y || yy === y + 4 || x === x0 || x === x1) { if (tint) stained(x, yy, tint); else put(w, x, yy, ID.GLASS); }
          else put(w, x, yy, gas);
        }
        put(w, x0 + 1, y + 2, ID.BATTERY);
      };
      // the skyline, rising toward the middle
      const plan = [];
      for (let x = P(2); x < W - P(14);) {
        const x1 = Math.min(W - P(2), x + P(16) + ((Math.random() * P(18)) | 0));
        const mid = 1 - Math.abs((x + x1) / 2 / W - 0.5) * 1.3;
        plan.push([x, x1, Math.max(P(30), gy - Math.round(H * rand(0.28, 0.42) * (0.55 + mid)))]);
        x = x1 + P(4) + ((Math.random() * P(4)) | 0);
      }
      let tallest = 0;
      plan.forEach((b, k) => { if (b[2] < plan[tallest][2]) tallest = k; });
      plan.forEach(([x0, x1, top], k) => {
        const gas = GAS[k % GAS.length];
        rect(w, x0, top, x1, gy - 1, ID.CONCRETE);
        paintBox(w, x0, top, x1, gy - 1, ID.CONCRETE, BODY[k % BODY.length]);
        // floors of windows, about half of them lit: a run of gas behind the panes, joined along the top
        for (let y = top + P(4); y < gy - P(6); y += P(5)) {
          const lit = Math.random() < 0.55, g = Math.random() < 0.2 ? GAS[(k + 2) % GAS.length] : gas;
          for (let x = x0 + 2; x + 1 <= x1 - 2; x += 3) {
            for (const xx of [x, x + 1]) for (const yy of [y, y + 1]) put(w, xx, yy, lit ? g : ID.GLASS);
            if (lit && x + 4 <= x1 - 2) put(w, x + 2, y, g);
          }
          if (lit) put(w, x0 + 1, y, ID.BATTERY);
        }
        // a lobby of glass on the ground floor
        for (let x = x0 + 2; x <= x1 - 2; x++) for (let y = gy - P(5); y < gy; y++) put(w, x, y, (x - x0) % P(8) === 0 ? ID.CONCRETE : ID.GLASS);
        paintBox(w, x0, gy - P(5), x1, gy - 1, ID.CONCRETE, BODY[k % BODY.length]);
        // an art deco crown of stained glass, lit from inside, on the tallest and some others
        if (k === tallest || (Math.random() < 0.35 && x1 - x0 > P(18))) {
          let c0 = x0 + P(2), c1 = x1 - P(2), y = top;
          const g = k === tallest ? ID.EL_XE : ID.EL_AR;
          for (let step = 0; step < 3 && c1 - c0 > P(5); step++) {
            const h = P(6), tint = TINTS[(k + step) % TINTS.length];
            for (let yy = y - h; yy < y; yy++) for (let x = c0; x <= c1; x++) {
              if (x === c0 || x === c1 || yy === y - h) stained(x, yy, tint);
              else put(w, x, yy, g);
            }
            put(w, (c0 + c1) >> 1, y - 1, ID.BATTERY);
            y -= h; c0 += P(3); c1 -= P(3);
          }
          if (k === tallest) { // a spire with a red beacon
            const sx = (x0 + x1) >> 1, by = y - P(16) - 1;
            rect(w, sx, by + 1, sx, y - 1, ID.METAL);
            put(w, sx, by, ID.BATTERY); put(w, sx, by - 1, ID.EL_NE);
            for (const [dx, dy] of [[-1, -1], [1, -1], [0, -2], [-1, 0], [1, 0]]) stained(sx + dx, by + dy, ID.EL_AU);
          }
        } else if (Math.random() < 0.5 && x1 - x0 > P(20)) { // a sign on the roof, on two legs
          const sx0 = x0 + P(2), sx1 = x1 - P(2), sy = top - P(10);
          rect(w, sx0 + P(2), sy + 5, sx0 + P(2), top - 1, ID.METAL); rect(w, sx1 - P(2), sy + 5, sx1 - P(2), top - 1, ID.METAL);
          tube(sx0, sx1, sy, k & 1 ? ID.EL_NE : ID.EL_HE, k & 2 ? TINTS[k % TINTS.length] : 0);
        }
      });
      // neon signs hung down the sides of some buildings, and street lamps in the gaps
      for (let k = 0; k + 1 < plan.length; k++) {
        const [, a1, atop] = plan[k], [b0, , btop] = plan[k + 1], gap = b0 - a1 - 1;
        if (gap >= 5 && k % 2 === 0) {
          const x = a1 + 1, y0 = Math.max(atop, btop) + P(6), y1 = y0 + P(28);
          for (let y = y0; y <= y1; y++) { put(w, x, y, ID.GLASS); put(w, x + 2, y, ID.GLASS); put(w, x + 1, y, k % 4 ? ID.EL_AR : ID.EL_NE); }
          put(w, x + 1, y0, ID.GLASS); put(w, x + 1, y1, ID.BATTERY); put(w, x + 1, y1 + 1, ID.GLASS);
        }
        if (gap >= 3 && k % 2 === 1) {
          const x = a1 + 1 + (gap >> 1), ty = gy - P(14);
          rect(w, x, ty + 1, x, gy - 1, ID.METAL);
          put(w, x, ty, ID.BATTERY); put(w, x, ty - 1, ID.EL_HE);
          for (const [dx, dy] of [[-1, -1], [1, -1], [0, -2], [-1, -2], [1, -2]]) put(w, x + dx, ty + dy, ID.GLASS);
        }
      }
      // the moon
      const mx = Math.round(W * 0.08), my = P(20), mr = P(9);
      for (let y = my - mr; y <= my + mr; y++) for (let x = mx - mr; x <= mx + mr; x++) {
        if ((x - mx) ** 2 + (y - my) ** 2 > mr * mr) continue;
        const crater = ((x - mx + P(3)) ** 2 + (y - my + P(2)) ** 2 < P(3) ** 2) || ((x - mx - P(3)) ** 2 + (y - my - P(3)) ** 2 < P(2) ** 2);
        tone(w, put(w, x, y, ID.STONE), rgb(crater ? '#cbc6b6' : '#ebe7d8'));
      }
    },

    // An electric workshop on three benches, every device a working circuit. Top: a stained-glass
    // window, a light bulb, a carbon arc lamp, an electric sparkler, and a solar panel under the open
    // sky lighting a neon sign. Middle: a lemon battery and a car battery each lighting a tube, a
    // tantalum capacitor firing a xenon flash, and a screen of red, green and blue phosphors. Floor: a
    // lamp on a switch, an electric kettle, a fountain with a pump, a piston lift (switch it on) and a
    // fire alarm, its heat sensor beside a burning lump of coal.
    electrics(w) {
      w.clear();
      const { W, H } = w, s = H / 200, P = (v) => Math.max(1, Math.round(v * s)), X = (u) => Math.round(W * u);
      const r = (x0, y0, x1, y1, t) => rect(w, x0, y0, x1, y1, t);
      const y1 = Math.round(H * 0.34), y2 = Math.round(H * 0.66), gy = H - P(4);
      r(0, y1, W - 1, y1 + 1, ID.WALL); r(0, y2, W - 1, y2 + 1, ID.WALL); r(0, gy, W - 1, H - 1, ID.WALL);
      // a neon tube lying from x0 to x1, its top at row y: glass round three rows of gas
      const tube = (x0, x1, y, gas = ID.EL_NE) => { r(x0, y, x1, y + 4, ID.GLASS); r(x0 + 1, y + 1, x1 - 1, y + 3, gas); };
      // ── top bench ──
      const stains = [ID.EL_CO, ID.EL_CR, ID.EL_AU, ID.EL_MN, ID.EL_AG, ID.EL_ER, ID.EL_U, ID.EL_CU];
      const gx0 = X(0.04), gx1 = X(0.6), gy0 = P(4), gy1 = gy0 + P(6);
      for (let x = gx0; x <= gx1; x++) {
        const tint = stains[Math.floor(((x - gx0) / (gx1 - gx0 + 1)) * stains.length)];
        for (let y = gy0; y <= gy1; y++) { const i = w.idx(x, y); w.place(i, ID.GLASS); w.aux[i] = tint; }
      }
      // a light bulb: a tungsten filament between two batteries, sealed in glass full of argon
      const bx0 = X(0.03), bx1 = bx0 + Math.max(16, X(0.15)), by1 = y1 - 1, by0 = by1 - 10;
      r(bx0, by0, bx1, by1, ID.GLASS); r(bx0 + 1, by0 + 1, bx1 - 1, by1 - 1, ID.EL_AR);
      r(bx0 + 2, by0 + 6, bx1 - 2, by0 + 6, ID.WALL);
      r(bx0 + 4, by0 + 5, bx1 - 4, by0 + 5, ID.EL_W);
      for (const bx of [bx0 + 3, bx1 - 3]) { // each battery capped in wall so it feeds only the filament
        w.place(w.idx(bx, by0 + 5), ID.BATTERY);
        r(bx - 1, by0 + 4, bx + 1, by0 + 4, ID.WALL);
        w.place(w.idx(bx + (bx < bx0 + 8 ? -1 : 1), by0 + 5), ID.WALL);
      }
      // a carbon arc lamp: two carbon rods with a gap between them
      const ax0 = X(0.24), ax1 = X(0.4), mid = Math.round((ax0 + ax1) / 2), ay = y1 - 1;
      r(ax0, ay, mid - 2, ay, ID.EL_C); r(mid + 1, ay, ax1, ay, ID.EL_C);
      w.place(w.idx(ax0 - 1, ay), ID.BATTERY);
      // an electric sparkler: titanium filings on a nichrome heater
      const sx0 = X(0.45), sx1 = X(0.6), sy = y1 - 1;
      for (let x = sx0; x <= sx1; x++) w.place(w.idx(x, sy), x & 1 ? ID.EL_CR : ID.EL_NI);
      w.place(w.idx(sx0 - 1, sy), ID.BATTERY);
      for (let x = sx0 + 1; x < sx1; x += 3) w.place(w.idx(x, sy - 1), ID.EL_TI);
      // a solar panel of silicon on legs, under the open sky, wired down to a neon sign beneath it
      const px0 = X(0.67), px1 = X(0.96), py = y1 - P(22);
      r(px0, py, px1, py, ID.EL_SI); r(px0, py + 1, px1, py + 1, ID.WALL);
      r(px0, py + 2, px0, y1 - 1, ID.WALL); r(px1, py + 2, px1, y1 - 1, ID.WALL);
      const tx0 = px0 + P(4), tx1 = px1 - P(4), ty = y1 - 6;
      tube(tx0, tx1, ty);
      r(tx1 - 1, py + 1, tx1 - 1, ty, ID.METAL);
      // ── middle bench ──
      const floor = y2 - 1, ty2 = y1 + P(10);
      // a lemon battery: zinc along the floor of a saltwater bath with copper in it, the dry end wired up
      const lx0 = X(0.03), lx1 = X(0.26), lwall = Math.round(lx0 + (lx1 - lx0) * 0.55);
      r(lx0, floor - 8, lx0, floor, ID.GLASS);
      r(lx0 + 1, floor - 1, lx1, floor, ID.EL_ZN);
      r(lwall, floor - 8, lwall, floor - 2, ID.GLASS);
      r(lx0 + 1, floor - 7, lwall - 1, floor - 2, ID.SALTWATER);
      r(lx0 + 3, floor - 4, lx0 + 8, floor - 2, ID.EL_CU);
      tube(lx1 - P(22), lx1 + 1, ty2);
      r(lx1 - 1, ty2 + 4, lx1 - 1, floor - 2, ID.METAL);
      // a car battery: plates of lead standing in acid, the dry end wired to a krypton tube
      const cx0 = X(0.31), cx1 = X(0.53), cwall = Math.round(cx0 + (cx1 - cx0) * 0.55);
      r(cx0, floor - 8, cx0, floor, ID.GLASS);
      r(cx0 + 1, floor - 1, cx1, floor, ID.EL_PB);
      r(cwall, floor - 8, cwall, floor - 2, ID.GLASS);
      r(cx0 + 1, floor - 7, cwall - 1, floor - 2, ID.ACID);
      tube(cx1 - P(22), cx1 + 1, ty2, ID.EL_KR);
      r(cx1 - 1, ty2 + 4, cx1 - 1, floor - 2, ID.METAL);
      // a tantalum capacitor between a battery and a wire up to a xenon flash tube
      const qx0 = X(0.58), qx1 = X(0.74);
      w.place(w.idx(qx0, floor), ID.BATTERY);
      r(qx0 + 1, floor - 2, qx0 + 3, floor, ID.EL_TA);
      r(qx0 + 4, floor, qx1, floor, ID.METAL);
      tube(qx1 - P(18), qx1 + 1, ty2, ID.EL_XE);
      r(qx1, ty2 + 4, qx1, floor, ID.METAL);
      // a screen of phosphors, each row lit by its own battery: europium red, terbium green, thulium blue
      const fx0 = X(0.8), fx1 = X(0.97);
      [ID.EL_EU, ID.EL_TB, ID.EL_TM].forEach((t, k) => {
        const yb = floor - k * 5;
        if (k) r(fx0 - 1, yb + 1, fx1 + 1, yb + 1, ID.WALL);
        r(fx0, yb - 1, fx1, yb, t);
        w.place(w.idx(fx0 - 1, yb), ID.BATTERY);
      });
      // ── the floor ──
      const fl = gy - 1;
      // a battery and a switch (on or off), the wire leaving the switch's east side at row wy
      const power = (x, on) => {
        r(x, fl - P(4), x + P(3), fl, ID.BATTERY);
        const sw0 = x + P(3) + 1, sw1 = sw0 + P(2);
        r(sw0, fl - P(3), sw1, fl, ID.SWITCH);
        for (let yy = fl - P(3); yy <= fl; yy++) for (let xx = sw0; xx <= sw1; xx++) w.aux[w.idx(xx, yy)] = on ? 1 : 0;
        return sw1 + 1;
      };
      // a lamp on a switch: an argon tube on a stand
      let x = power(X(0.02), true);
      const lt = fl - P(22);
      tube(x + P(2), x + P(20), lt, ID.EL_AR);
      r(x, lt + 4, x, fl, ID.WIRE); r(x, lt + 4, x + P(2) + 1, lt + 4, ID.WIRE);
      r(x + P(20), lt + 5, x + P(20), fl, ID.WALL);
      // an electric kettle: a nichrome coil under a stone hotplate and a metal pot of water (off)
      x = power(X(0.23), false);
      const k0 = x + 1, k1 = k0 + P(16);
      r(x, fl, x, fl, ID.WIRE);
      for (let xx = k0; xx <= k1; xx++) w.place(w.idx(xx, fl), xx & 1 ? ID.EL_CR : ID.EL_NI);
      r(k0, fl - 1, k1, fl - 1, ID.STONE);
      r(k0, fl - 2, k1, fl - 2, ID.METAL); r(k0, fl - P(10), k0, fl - 2, ID.METAL); r(k1, fl - P(10), k1, fl - 2, ID.METAL);
      r(k0 + 1, fl - P(8), k1 - 1, fl - 3, ID.WATER);
      // a fountain: a pump at the bottom of a pool, pushing water up a pipe and back in
      x = power(X(0.45), true);
      const f0 = x + P(3), f1 = f0 + P(42), fc = f0 + P(12), r1 = P(1), pw = r1 + 1, ox = fc + P(17);
      r(f0, fl - P(12), f0, fl, ID.GLASS); r(f1, fl - P(12), f1, fl, ID.GLASS);
      r(f0 + 1, fl - P(9), f1 - 1, fl, ID.WATER);
      r(fc - pw, fl - P(3), fc + pw, fl, ID.PUMP);
      r(x, gy, fc, gy, ID.WIRE); r(x, fl, x, fl, ID.WIRE);
      const top = fl - P(26);
      pipe(w, [[fc, fl - P(3) - 1 - r1], [fc, top], [ox, top], [ox, fl - P(17)]], r1, [[ox, fl - P(17), r1]]);
      // a piston lift with a crate on it (off: switch it on to raise it)
      x = power(X(0.72), false);
      const pl = x + P(2);
      r(x, fl, pl - 1, fl, ID.WIRE);
      r(pl, fl - P(2), pl + P(4), fl, ID.PISTON);
      r(pl, fl - P(3), pl + P(4), fl - P(3), ID.WOOD);
      r(pl + 1, fl - P(8), pl + P(4) - 1, fl - P(4), ID.WOOD);
      // a fire alarm: a heat sensor beside a burning lump of coal, wired up to a neon lamp
      const a0 = X(0.88);
      r(a0, fl - P(1), a0 + P(10), fl, ID.STONE);
      r(a0 + P(3), fl - P(5), a0 + P(7), fl - P(2), ID.COAL);
      for (let xx = a0 + P(3); xx <= a0 + P(7); xx++) w.ignite(w.idx(xx, fl - P(5)));
      const sx = a0 + P(8);
      r(sx, fl - P(4), sx + 1, fl - P(2), ID.SENSOR);
      for (let yy = fl - P(4); yy <= fl - P(2); yy++) for (const xx of [sx, sx + 1]) { const i = w.idx(xx, yy); w.aux[i] = 1 << 1; w.data[i] = 150; }
      const at = fl - P(18) - 4;
      tube(sx + 1, Math.min(W - 2, sx + P(12)), at);
      r(sx + 2, at + 4, sx + 2, fl - P(2), ID.WIRE);
    },

    // A magnet lab on three floors. Top: a hopper pouring iron filings mixed with sand past a magnet,
    // which keeps the iron and lets the sand through; a magnet over grains of iron, cobalt, nickel,
    // copper, aluminium and zinc (only the first three jump); and bismuth shoved away from a magnet.
    // Middle: an electromagnet crane over a heap of iron (switch it off to drop the load), and a
    // neodymium and a samarium magnet each holding iron, on heaters you can switch on: neodymium lets
    // go past 310°C, samarium holds on to 720°C. Ground: gadolinium chilled to 10°C, clinging to a magnet
    // until it warms past 19.5°C, and iron filings drawn up through the lid of a glass jar.
    magnets(w) {
      w.clear();
      const { W, H } = w, s = H / 200, P = (v) => Math.max(1, Math.round(v * s)), X = (u) => Math.round(W * u);
      const r = (x0, y0, x1, y1, t) => rect(w, x0, y0, x1, y1, t);
      const f1 = Math.round(H * 0.34), f2 = Math.round(H * 0.67), gy = H - P(4);
      r(0, f1, W - 1, f1 + 1, ID.WALL); r(0, f2, W - 1, f2 + 1, ID.WALL); r(0, gy, W - 1, H - 1, ID.WALL);
      // a magnet sitting on a shelf `gap` cells above floor row `fl`, from x0 to x1
      const magnet = (x0, x1, fl, gap, t = ID.EL_ND) => {
        const shelf = fl - gap;
        r(x0, shelf, x1, shelf, ID.WALL);
        r(x0 + 2, shelf - 4, x1 - 2, shelf - 1, t);
        return shelf;
      };
      // a battery and a switch, the wire leaving the switch's east side
      const power = (x, fl, on) => {
        r(x, fl - P(4), x + P(3), fl, ID.BATTERY);
        const sw0 = x + P(3) + 1, sw1 = sw0 + P(2);
        r(sw0, fl - P(3), sw1, fl, ID.SWITCH);
        for (let yy = fl - P(3); yy <= fl; yy++) for (let xx = sw0; xx <= sw1; xx++) w.aux[w.idx(xx, yy)] = on ? 1 : 0;
        return sw1 + 1;
      };
      // ── top floor ──
      let fl = f1 - 1;
      // the separator: iron filings mixed with sand trickle from a hopper past a magnet on a shelf, which
      // snatches the iron out of the stream; the sand falls on into a bin
      const hx = X(0.1), hw = P(10), hb = P(16);
      r(hx - hw, P(3), hx - hw, hb, ID.WALL); r(hx + hw, P(3), hx + hw, hb, ID.WALL); r(hx - hw, hb, hx + hw, hb, ID.WALL);
      for (let y = P(5); y < hb; y++) for (let x = hx - hw + 1; x < hx + hw; x++) put(w, x, y, (x + y) % 3 ? ID.SAND : ID.EL_FE);
      put(w, hx, hb, ID.EMPTY);
      const ms = hb + P(22);
      r(hx + P(3), ms, hx + P(16), ms, ID.WALL);
      r(hx + P(6), ms - P(4), hx + P(15), ms - 1, ID.EL_ND);
      r(hx - P(7), fl - P(8), hx - P(7), fl, ID.GLASS); r(hx + P(2), fl - P(8), hx + P(2), fl, ID.GLASS);
      // which metals a magnet takes: grains of each in turn under one long magnet
      const m0 = X(0.33), m1 = X(0.66);
      magnet(m0, m1, fl, P(9));
      const metals = [ID.EL_FE, ID.EL_CO, ID.EL_NI, ID.EL_CU, ID.EL_AL, ID.EL_ZN], span = (m1 - m0) / metals.length;
      metals.forEach((t, k) => { for (let x = Math.round(m0 + k * span + 1); x < Math.round(m0 + (k + 1) * span - 1); x++) put(w, x, fl, t); });
      // bismuth beside a magnet standing on the floor
      const bx = X(0.84);
      r(bx - 4, fl - 8, bx - 3, fl, ID.WALL); r(bx + 3, fl - 8, bx + 3, fl, ID.WALL); // a cup holding the magnet upright
      r(bx - 2, fl - 7, bx + 2, fl, ID.EL_ND);
      for (let x = bx + 4; x <= bx + 9; x++) put(w, x, fl, ID.EL_BI);
      // ── middle floor ──
      fl = f2 - 1;
      // the electromagnet crane: an iron bar hung from a gantry, wired through a switch (on) to a battery
      const g0 = X(0.03), g1 = X(0.4), beam = f1 + P(12);
      r(g0 + P(10), beam, g1, beam + 1, ID.WALL); r(g1, beam, g1 + 1, fl, ID.WALL);
      const e0 = Math.round((g0 + g1) / 2) - P(14), e1 = e0 + P(26), ey = fl - P(8);
      r(e0, ey, e1, ey + 2, ID.METAL);
      r(e1 - 1, beam + 2, e1 - 1, ey - 1, ID.WIRE);
      r(e1 - 1, beam + 2, g1 - 1, beam + 2, ID.WIRE);
      r(g1 - 1, beam + 2, g1 - 1, fl - P(5), ID.WIRE);
      const wx = power(g1 - P(9), fl, true);
      r(wx, fl - P(5), g1 - 1, fl - P(5), ID.WIRE); r(wx, fl - P(5), wx, fl, ID.WIRE);
      for (let x = e0 - P(4); x <= e1 + P(4); x++) { put(w, x, fl, ID.EL_FE); if (x % 2) put(w, x, fl - 1, ID.EL_FE); }
      // two magnets on heaters: neodymium (lets go at 310°C) and samarium (holds to 720°C)
      [[X(0.5), ID.EL_ND], [X(0.75), ID.EL_SM]].forEach(([x0, t]) => {
        const x1 = x0 + P(18), shelf = fl - P(10);
        r(x0 - 3, shelf, x1 + 3, shelf, ID.WALL);
        for (let x = x0; x <= x1; x++) w.place(w.idx(x, shelf - 1), x & 1 ? ID.EL_CR : ID.EL_NI); // the heater, laid on the shelf
        r(x0 + 2, shelf - 5, x1 - 2, shelf - 2, t);                                           // and the magnet on it
        const sx = power(x0 - P(10), fl, false);
        r(sx, shelf - 1, sx, fl, ID.WIRE); r(sx, shelf - 1, x0 - 1, shelf - 1, ID.WIRE);
        for (let x = x0 + 1; x < x1; x += 2) put(w, x, fl, ID.EL_FE);
      });
      // ── ground floor ──
      fl = gy - 1;
      // gadolinium chilled to 10°C under a magnet
      magnet(X(0.08), X(0.3), fl, P(8));
      for (let x = X(0.09); x <= X(0.29); x += 2) { const i = put(w, x, fl, ID.EL_GD); w.temp[i] = 10; }
      // iron filings in a sealed glass jar, drawn up against its lid by a magnet above it
      const j0 = X(0.48), j1 = X(0.66), jt = fl - P(12);
      r(j0, jt, j1, fl, ID.GLASS); r(j0 + 1, jt + 1, j1 - 1, fl - 1, ID.EMPTY);
      for (let x = j0 + 1; x < j1; x++) put(w, x, fl - 1, x % 2 ? ID.EL_FE : ID.SAND);
      r(j0 + P(4), jt - P(5), j1 - P(4), jt - 1, ID.EL_ND);
      // iron held up by a samarium magnet over a coal fire: heated past 770°C it lets go and drops into
      // the flames (once the fire dies down and it cools, it leaps back up)
      const h0 = X(0.78), h1 = h0 + P(20), hs = magnet(h0, h1, fl, P(10), ID.EL_SM);
      for (let x = h0 + 2; x <= h1 - 2; x++) put(w, x, hs + 1, ID.EL_FE);
      r(h0 + P(3), fl - P(2), h1 - P(3), fl, ID.COAL);
      for (let x = h0 + P(3); x <= h1 - P(3); x++) w.ignite(w.idx(x, fl - P(2)));
    },

    // The waterworks: every machine part, drawn big, doing a useful job. Laid out for a 256 × 160
    // map and scaled up with the map (s); every joint is worked out from the part it joins, so the
    // wires and pipes meet at any size. Left to right:
    //   a house with a fire sprinkler: a heat sensor against the logs in the hearth opens a valve under
    //     a tank on the roof, and water sprays from a pipe across the room (light the logs);
    //   a pond with a pump at the bottom, driving water up a pipe into a tank on a tower (its switch,
    //     under the tower, starts on);
    //   a garden watered from the tower's tank through a valve on its side (its switch, also under
    //     the tower, starts off);
    //   a reservoir: a sluice gate (a piston's rod) over the outlet in the foot of the dam (switch it
    //     off to drop the gate and let the water out into the basin), and a touch sensor at the
    //     high-water mark that starts a pump sending the overflow over the dam (pour in water to see it).
    // Whatever the house and the garden spill runs back into the pond. Wires run inside walls and
    // under the ground.
    machines(w) {
      w.clear();
      const { W, P, rect, each, tint, part, facing, pushing, switched, senses, holding, pipe, r1, r2, pw, gy } = kit(w);
      ground(w, gy);

      // ── the house with a fire sprinkler ──
      const h0 = P(4), h1 = P(56), hTop = gy - P(32), wall = P(3), ceil = hTop + wall;
      rect(h0, hTop, h1, gy - 1, ID.WOOD);
      rect(h0 + wall, ceil, h1 - wall, gy - 1, ID.EMPTY);
      const roofTop = hTop - P(2), roofBot = hTop + P(1);
      rect(h0 - P(2), roofTop, h1 + P(2), roofBot, ID.BRICK);                // the roof
      rect(h0, gy - P(20), h0 + wall - 1, gy - P(12), ID.GLASS);             // a window
      rect(h1 - wall + 1, gy - P(14), h1, gy - 1, ID.EMPTY);                 // the door, towards the pond
      const f0 = h0 + P(18), f1 = h0 + P(34);
      rect(f0 - P(3), gy - P(1), f1 + P(3), gy - 1, ID.BRICK);               // the hearth, with logs on it
      rect(f0, gy - P(6), f1, gy - P(1) - 1, ID.WOOD);
      const tb0 = f1 + P(5), tb1 = tb0 + P(5);                               // a table
      rect(tb0, gy - P(7), tb1, gy - P(6), ID.WOOD);
      rect(tb0 + 1, gy - P(5), tb0 + 1, gy - 1, ID.WOOD); rect(tb1 - 1, gy - P(5), tb1 - 1, gy - 1, ID.WOOD);
      const rt0 = h0 + P(14), rt1 = h1 - P(14), rc = (rt0 + rt1) >> 1, rtTop = roofTop - P(4);
      part(rt0, rtTop, rt1, roofTop - 1, ID.TANK);                           // a tank on the roof, some water in it
      each(rt0, roofTop - 1, rt1, roofTop - 1, holding(ID.WATER, G.Sim.TANK_CAP));
      part(rc - P(2), roofTop, rc + P(2), roofBot, ID.VALVE);               // a valve through the roof
      const head = gy - P(17), hx0 = h0 + wall + P(3), hx1 = h1 - wall - P(3), outlets = [];
      for (let x = hx0 + P(2); x <= hx1 - P(2); x += P(6)) outlets.push([x, head + r1 + 1, 0]);
      pipe([[rc, roofBot + 1 + r1], [rc, head], [hx0, head], [hx1, head]], r1, outlets); // the sprinkler: down, then across the room
      const sH0 = f0 - P(3), sH1 = f0 - 1;                                   // the heat sensor, against the logs
      part(sH0, gy - P(5), sH1, gy - P(3), ID.SENSOR, senses(1, 120));
      // wired along the floor to the wall, up the wall, along the ceiling and up into the valve
      const wx = h0 + wall, vw = rc - P(2) - 1;
      rect(wx, gy - P(4), sH0 - 1, gy - P(4), ID.WIRE);
      rect(wx, ceil, wx, gy - P(4), ID.WIRE);
      rect(wx, ceil, vw, ceil, ID.WIRE);
      rect(vw, roofBot, vw, ceil, ID.WIRE);

      // ── the pond, with a pump on its bottom facing up ──
      const p0 = P(60), p1 = P(102), pb = gy + P(24);
      rect(p0, gy - 1, p1, pb + P(2), ID.STONE);
      rect(p0 + P(2), gy - 1, p1 - P(2), pb, ID.EMPTY);
      rect(p0 + P(2), gy, p1 - P(2), pb, ID.WATER);
      const pc = (p0 + p1) >> 1, pumpTop = pb - P(4);
      part(pc - pw, pumpTop, pc + pw, pb, ID.PUMP, facing(0));

      // ── the water tower: a tank on a concrete platform on two pillars ──
      const t0 = P(136), t1 = P(162), tc = (t0 + t1) >> 1, k0 = tc - P(7), k1 = tc + P(7);
      const tTop = gy - P(67), tBot = gy - P(62), plat = tBot + 1, platBot = plat + P(2);
      rect(t0 - P(8), plat, t1 + P(4), platBot, ID.CONCRETE);
      rect(t0 - P(2), platBot + 1, t0 + P(1), gy - 1, ID.CONCRETE);
      rect(t1 - P(1), platBot + 1, t1 + P(2), gy - 1, ID.CONCRETE);
      tint(t0 - P(8), plat, t1 + P(4), gy - 1, ID.CONCRETE, '#cfcac0');
      rect(k0, tTop, k1, tBot, ID.TANK);                                     // empty: the pump fills it
      const over = tTop - P(10);
      pipe([[pc, pumpTop - 1 - r2], [pc, over], [tc, over], [tc, tTop - 1 - r2]], r2); // up out of the pond, over, into the tank
      // the pump's battery and switch (on), under the tower; the wire runs down, under the garden and the pond, up to the pump
      const bA = tc + P(1), sA = bA + P(5), sA1 = sA + P(3), wA = sA1 + 1, under = pb + P(3);
      part(bA, gy - P(5), sA - 1, gy - 1, ID.BATTERY);
      part(sA, gy - P(4), sA1, gy - 1, ID.SWITCH, switched(1));
      rect(wA, gy - P(2), wA + r1, under + r1, ID.WIRE);
      rect(pc - r1, under, wA + r1, under + r1, ID.WIRE);
      rect(pc - r1, pb + 1, pc + r1, under, ID.WIRE);

      // ── the garden, watered from the tower's tank through a valve on its side ──
      const g0 = P(104), g1 = P(126), gc = (g0 + g1) >> 1;
      rect(g0, gy - P(3), g1, gy - 1, ID.SOIL);
      w.paint(gc - P(7), gy - P(6), P(4), ID.FLOWER, 1, false);
      w.paint(gc + P(7), gy - P(6), P(4), ID.PLANT, 1, false);
      w.paint(gc, gy - P(6), P(3), ID.FLOWER, 1, false);
      const vx0 = k0 - P(5), vx1 = k0 - 1;
      part(vx0, tBot - P(4), vx1, tBot, ID.VALVE);
      const shower = gy - P(20);
      pipe([[vx0 - 1 - r2, tBot - r2], [gc, tBot - r2], [gc, shower]], r2, [[gc, shower, r2]]); // out of the valve and down to a shower over the garden
      // its switch (off), under the tower: wired through the platform and down inside the left pillar
      const sG = t0 + P(2), sG1 = sG + P(3), bG = sG1 + 1, wG = t0 - 1;
      rect(vx1, plat, vx1, platBot, ID.WIRE);
      rect(wG, platBot, vx1, platBot, ID.WIRE);
      rect(wG, platBot, wG, gy - P(2), ID.WIRE);
      rect(wG, gy - P(2), sG - 1, gy - P(2), ID.WIRE);
      part(sG, gy - P(4), sG1, gy - 1, ID.SWITCH, switched(0));
      part(bG, gy - P(5), bG + P(4), gy - 1, ID.BATTERY);

      // ── the reservoir ──
      const r0 = P(178), d0 = P(216), d1 = P(227), rTop = gy - P(28), level = gy - P(14);
      rect(r0, gy, d1, gy + P(1), ID.CONCRETE);                              // its floor…
      rect(r0, gy - P(22), r0 + P(3), gy - 1, ID.CONCRETE);                  // …far wall…
      rect(d0, rTop, d1, gy - 1, ID.CONCRETE);                               // …and dam
      tint(r0, rTop, d1, gy + P(1), ID.CONCRETE, '#aaa59b');
      rect(r0 + P(4), level, d0 - 1, gy - 1, ID.WATER);
      // the sluice: an outlet through the foot of the dam, shut by the rod of a piston under the ground
      // on the far side; switch the piston off and the rod drops back into it, letting the water out
      const gh = P(4), q0 = d1 + 1, q1 = d1 + P(2);
      rect(d0, gy - gh, d1, gy - 1, ID.WATER);                               // the outlet, full up to the gate
      part(q0, gy, q1, gy + P(2), ID.PISTON, pushing(0));                    // the piston, facing up…
      rect(q0, gy - 16, q1, gy - 1, ID.ROD);                                 // …with its rod out, shutting the outlet
      const b0 = q1 + 1, b1 = W - P(3), bb = gy + P(22);                     // the basin it lets out into
      rect(b0, gy, b1 + 1, bb + P(2), ID.STONE);
      rect(b1 + 1, gy - 1, b1 + 1, gy - 1, ID.STONE);
      rect(b0 + 1, gy - 1, b1, bb, ID.EMPTY);
      rect(b0, gy - 1, b0, gy - 1, ID.EMPTY);                                // nothing on its lip, so the water runs straight in
      // its battery and switch (on, so the sluice starts shut), between the tower and the reservoir;
      // the wire runs down, under the reservoir, up to the piston
      const bS = P(167), sS = bS + P(5), sS1 = sS + P(3), wS = sS1 + 1, deep = gy + P(8);
      part(bS, gy - P(5), sS - 1, gy - 1, ID.BATTERY);
      part(sS, gy - P(4), sS1, gy - 1, ID.SWITCH, switched(1));
      rect(wS, gy - P(2), wS + r1, deep + r1, ID.WIRE);
      rect(wS, deep, q0 + r1, deep + r1, ID.WIRE);
      rect(q0, gy + P(2) + 1, q0 + r1, deep, ID.WIRE);
      // the overflow pump, hung against the dam just above the water, and a touch sensor on its open
      // side at the high-water mark (under a hood, so drips off the dam don't set it off): water rising
      // to the sensor starts the pump, which sends what is over the mark across the dam
      const oc = d0 - 1 - pw, oTop = level - P(5), sx0 = oc - pw - P(3), sx1 = oc - pw - 1;
      part(oc - pw, oTop, oc + pw, level - 1, ID.PUMP, facing(0));
      part(sx0, oTop, sx1, level - P(3), ID.SENSOR, senses(0, 0));
      rect(sx0 - 1, oTop - 1, sx1, oTop - 1, ID.CONCRETE);
      tint(sx0 - 1, oTop - 1, sx1, oTop - 1, ID.CONCRETE, '#aaa59b');
      const top = rTop - P(6), out = (b0 + b1) >> 1;
      pipe([[oc, oTop - 1 - r2], [oc, top], [out, top], [out, gy - P(6)]], r2, [[out, gy - P(6), r2]]);
    },

    // Deep underground: a meadow on top, then rock in layers, cut by tunnels and caverns. Stalactites
    // hang in a limestone cavern under an underground lake; there are veins of iron, copper and gold
    // ore, a coal seam, an amethyst geode, diamonds round a pocket of magma at the bottom, a lake, an
    // oil pocket, and mushrooms in the dark.
    caves(w) {
      w.clear();
      const { W, H } = w, s = H / 200, P = (v) => Math.max(1, Math.round(v * s));
      const n = noise1(), nb = noise1();
      const surf = new Int32Array(W);
      for (let x = 0; x < W; x++) surf[x] = Math.round(H * 0.17 + n(x) * H * 0.025);
      const lime0 = Math.round(H * 0.32), lime1 = Math.round(H * 0.5);
      const TOP = rgb('#7d7266'), MID = rgb('#66625e'), DEEP = rgb('#45424a');
      for (let x = 0; x < W; x++) {
        const wob = Math.round(nb(x) * P(4));
        for (let y = surf[x]; y < H; y++) {
          if (y < surf[x] + P(6)) { put(w, x, y, ID.SOIL); continue; }
          if (y >= lime0 + wob && y < lime1 + wob) { // limestone, toned down so its pale stalactites stand out
            tone(w, put(w, x, y, ID.LIMESTONE), pick(['#a79e8a', '#9d947f', '#b0a793'].map(rgb), x >> 1, (y / P(3)) | 0));
            continue;
          }
          const f = (y - surf[x]) / (H - surf[x]), band = ((((y + Math.sin(x * 0.04) * 3) / P(4)) | 0) & 1) ? 0.06 : 0;
          tone(w, put(w, x, y, ID.STONE), mixRGB(f < 0.5 ? mixRGB(TOP, MID, f * 2) : mixRGB(MID, DEEP, f * 2 - 1), 0x000000, band));
        }
      }
      const carve = (x, y, rx, ry) => blob(w, Math.round(x), Math.round(y), Math.max(1, Math.round(rx)), Math.max(1, Math.round(ry)), ID.EMPTY);
      // a limestone cavern, with an underground lake sealed in the rock above it
      const c1x = Math.round(W * 0.3), c1y = Math.round((lime0 + lime1) / 2 + P(8)), c1r = P(34);
      carve(c1x, c1y, c1r, P(12));
      blob(w, c1x, c1y - P(20), P(22), P(4), ID.WATER);
      // a great cavern lower down, half full of water, and an oil pocket sealed in the rock
      const c2x = Math.round(W * 0.72), c2y = Math.round(H * 0.64);
      carve(c2x, c2y, P(32), P(14));
      for (let x = c2x - P(32); x <= c2x + P(32); x++) for (let y = c2y + P(4); y <= c2y + P(14); y++) if (inMap(w, x, y) && w.type[w.idx(x, y)] === ID.EMPTY) put(w, x, y, ID.WATER);
      blob(w, Math.round(W * 0.12), Math.round(H * 0.72), P(18), P(6), ID.OIL);
      // tunnels: a sinkhole from the meadow, and passages winding between the caverns
      const tunnel = (x, y, a, steps) => {
        for (let k = 0; k < steps; k++) {
          carve(x, y, P(3) + Math.random() * P(2), P(3) + Math.random() * P(2));
          a += (Math.random() - 0.5) * 0.6;
          x += Math.cos(a) * 2.5; y += Math.sin(a) * 1.5;
          if (x < P(6) || x > W - P(6)) a = Math.PI - a;
          if (y < surf[Math.max(0, Math.min(W - 1, x | 0))] + P(4) || y > H - P(18)) a = -a;
        }
      };
      tunnel(W * 0.5, surf[Math.round(W * 0.5)], Math.PI / 2, P(30));
      tunnel(W * 0.5, H * 0.3, Math.PI * 0.85, P(40));
      tunnel(W * 0.5, H * 0.35, Math.PI * 0.2, P(50));
      tunnel(W * 0.3, H * 0.6, 0.1, P(60));
      tunnel(W * 0.85, H * 0.4, Math.PI / 2, P(30));
      // magma pooled on the hot floor, walled in obsidian, with diamonds in the dark rock round it
      const mx = Math.round(W * 0.48), my = H - P(4);
      for (let y = my - P(22); y < H; y++) for (let x = mx - P(30); x <= mx + P(30); x++) {
        const d = ((x - mx) / P(30)) ** 2 + ((y - my) / P(22)) ** 2;
        if (d <= 1 && inMap(w, x, y) && w.type[w.idx(x, y)] === ID.STONE) { const i = w.idx(x, y); tone(w, i, pick(['#3b4450', '#44505e', '#353d48'].map(rgb), x, y)); if (Math.random() < 0.02) w.place(i, ID.DIAMOND); }
      }
      blob(w, mx, my, P(16), P(7), ID.OBSIDIAN);
      blob(w, mx, my, P(14), P(5), ID.LAVA);
      for (let i = 0; i < w.N; i++) if (w.type[i] === ID.LAVA) w.temp[i] = 1080;
      // ores, only where there is plain rock
      const inRock = (x, y) => inMap(w, x, y) && w.type[w.idx(x, y)] === ID.STONE;
      const lode = (x0, y0, r, colours, fleck, fleckCol, p) => {
        for (let y = y0 - r; y <= y0 + r; y++) for (let x = x0 - r; x <= x0 + r; x++) {
          if (!inRock(x, y) || (x - x0) ** 2 + (y - y0) ** 2 > r * r * rand(0.5, 1.1)) continue;
          const i = w.idx(x, y);
          if (Math.random() < p) { w.place(i, fleck); if (fleckCol) tone(w, i, fleckCol); } else tone(w, i, pick(colours, x, y));
        }
      };
      const IRON = ['#8b4a2f', '#9a5a3a', '#7a3f2a', '#a0603c'].map(rgb), COPPER = ['#2e8b67', '#3aa57c', '#2b6f9e', '#237a5c'].map(rgb);
      for (let k = 0; k < 6; k++) lode(Math.round(rand(0.05, 0.95) * W), Math.round(rand(0.25, 0.9) * H), P(6) + ((Math.random() * P(4)) | 0), IRON, ID.METAL, 0, 0.18);
      for (let k = 0; k < 4; k++) lode(Math.round(rand(0.05, 0.95) * W), Math.round(rand(0.55, 0.92) * H), P(6) + ((Math.random() * P(3)) | 0), COPPER, ID.METAL, rgb('#c47a45'), 0.12);
      // gold in white quartz veins
      for (let k = 0; k < 2; k++) {
        let x = rand(0.1, 0.9) * W, y = rand(0.6, 0.9) * H;
        const a = rand(-0.5, 0.5);
        for (let q = 0; q < P(45); q++) {
          for (let d = 0; d < 2; d++) {
            const xx = Math.round(x), yy = Math.round(y) + d;
            if (!inRock(xx, yy)) continue;
            const i = w.idx(xx, yy);
            if (Math.random() < 0.12) { w.place(i, ID.METAL); tone(w, i, pick(['#e8c24a', '#f5d76a'].map(rgb), xx, yy)); }
            else tone(w, i, pick(['#e9e4d6', '#dcd5c3'].map(rgb), xx, yy));
          }
          x += Math.cos(a); y += Math.sin(a) + rand(-0.6, 0.6);
        }
      }
      // diamonds: a light scatter in a few pockets of the deep rock, a brush 4 across (a dab of spray)
      for (let k = 0; k < 5; k++) {
        const x0 = Math.round(rand(0.08, 0.92) * W), y0 = Math.round(rand(0.62, 0.95) * H), r = P(4);
        for (let y = y0 - r; y <= y0 + r; y++) for (let x = x0 - r; x <= x0 + r; x++) {
          if (!inRock(x, y) || (x - x0) ** 2 + (y - y0) ** 2 > r * r || Math.random() > 0.22) continue;
          w.place(w.idx(x, y), ID.DIAMOND);
        }
      }
      // a coal seam
      const sy = Math.round(H * 0.25);
      for (let x = Math.round(W * 0.55); x < Math.round(W * 0.95); x++) {
        const th = Math.round(P(5) * Math.sin(((x - W * 0.55) / (W * 0.4)) * Math.PI) + 0.4);
        for (let y = sy + Math.round(nb(x * 2) * P(2)); th > 0 && y < sy + th + Math.round(nb(x * 2) * P(2)); y++) if (inRock(x, y)) put(w, x, y, ID.COAL);
      }
      // an amethyst geode
      const gx = Math.round(W * 0.88), gyy = Math.round(H * 0.84), R = P(8);
      const AME = ['#9b59d0', '#b47ee5', '#7d3fb5', '#c9a3f0'].map(rgb);
      for (let y = gyy - R; y <= gyy + R; y++) for (let x = gx - R; x <= gx + R; x++) {
        if (!inMap(w, x, y)) continue;
        const d = Math.hypot(x - gx, y - gyy), i = w.idx(x, y);
        if (d > R) continue;
        if (d > R - 1.5) { w.place(i, ID.STONE); tone(w, i, rgb('#d8d2c8')); }
        else if (d > R - 4 - Math.random() * 2) { w.place(i, ID.GLASS); tone(w, i, pick(AME, x, y)); }
        else w.place(i, ID.EMPTY);
      }
      // stalactites from the ceilings, thickest in the limestone cavern, and stalagmites under some
      const hang = (x, y, L, up) => {
        for (let k = 1; k <= L; k++) {
          const yy = up ? y - k : y + k;
          for (let d = 0; d < (k <= L / 3 ? 2 : 1); d++) {
            if (!inMap(w, x + d, yy) || w.type[w.idx(x + d, yy)] !== ID.EMPTY) continue;
            const i = put(w, x + d, yy, ID.LIMESTONE);
            w.data[i] = k;
          }
        }
      };
      for (let x = 2; x < W - 2; x++) {
        for (let y = surf[x] + P(7); y < H - 2; y++) {
          const i = w.idx(x, y);
          if (w.type[i] === ID.EMPTY || w.type[i + w.SW] !== ID.EMPTY) continue;
          const t = w.type[i];
          if (t !== ID.LIMESTONE && t !== ID.STONE) continue;
          const lime = t === ID.LIMESTONE;
          if (Math.random() > (lime ? 0.16 : 0.03)) continue;
          let room = 0;
          while (room < 60 && y + room + 1 < H && w.type[i + (room + 1) * w.SW] === ID.EMPTY) room++;
          if (room < P(6)) continue;
          const L = Math.min(room - 2, P(3) + ((Math.random() * (lime ? P(9) : P(4))) | 0));
          hang(x, y, L, false);
          if (lime && Math.random() < 0.6) { const fy = y + room + 1; hang(x, fy, Math.min(room - L - 2, P(2) + ((Math.random() * P(4)) | 0)), true); }
          x += P(4);
        }
      }
      // soil and spores by the lake for mushrooms, and the meadow on top
      for (let x = c2x - P(30); x < c2x + P(30); x += 1) {
        const y = c2y + P(3);
        if (inMap(w, x, y) && w.type[w.idx(x, y)] === ID.EMPTY && w.type[w.idx(x, y + 1)] !== ID.EMPTY && w.type[w.idx(x, y + 1)] !== ID.WATER) {
          put(w, x, y, ID.SOIL);
          if (Math.random() < 0.3) put(w, x, y - 1, ID.SPORES);
        }
      }
      grassOver(w, 0, W - 1, 0.95);
      for (const [u, f, h] of [[0.08, pine, 26], [0.2, oak, 18], [0.66, oak, 20], [0.8, pine, 28], [0.92, pine, 22]]) {
        const x = Math.round(W * u);
        if (w.type[w.idx(x, surf[x])] === ID.SOIL) f(w, x, surf[x], P(h));
      }
      scatter(w, ID.BIRD, 4, 0, 2, W - 1, H * 0.08);
      w.livenTrees();
    },

    // The plain island every game starts on: sea, sand and a garden. The Island scene grows into the
    // tropical one below once every plant and creature has been found (main.js picks which).
    islandClassic(w) {
      w.clear();
      const { W, H } = w;
      const n = noise1();
      const sea = Math.round(H * 0.62);
      // a flat-topped island: a garden bed on the plateau, held in by a stone lip so the
      // soil can't roll into the sea (which would hand out Mud for free)
      const plateau = Math.round(H * 0.4);
      const bedL = Math.round(W * 0.36), bedR = Math.round(W * 0.56);
      for (let x = 0; x < W; x++) {
        const u = x / W;
        const hump = Math.max(0, 1 - Math.pow((u - 0.46) / 0.3, 2));
        const ground = Math.max(plateau, Math.round(H - 6 - hump * H * 0.62 - n(x) * 5));
        fillCol(w, x, H - 5 + Math.round(n(x * 3) * 2), H - 1, ID.STONE);
        fillCol(w, x, ground, H - 6, ID.SAND);
        // a rock core that widens toward bedrock: sand slumps, so the garden needs real support
        const outside = x < bedL ? bedL - x : x > bedR ? x - bedR : 0;
        const coreTop = plateau + Math.round(outside * 4 + (outside ? 4 : 0));
        if (coreTop < H) fillCol(w, x, coreTop, H - 1, ID.STONE);
        if (x >= bedL && x <= bedR) {
          if (x === bedL || x === bedR) fillCol(w, x, plateau - 7, plateau - 1, ID.STONE);
          else {
            fillCol(w, x, plateau - 6, plateau - 1, ID.DIRT);
            if (x % 6 === 3) w.place(w.idx(x, plateau - 7), ID.SEED);
          }
        }
        if (ground > sea) fillCol(w, x, sea, ground - 1, ID.WATER);
      }
    },

    // A tropical island: palm beaches, a jungle hill rising to a rocky peak, a fishing hut on stilts,
    // a coral reef in the shallows, a sea stack, and fish (and a shark) in the sea.
    island(w) {
      w.clear();
      const { W, H } = w, s = H / 200, P = (v) => Math.max(1, Math.round(v * s));
      const n = noise1();
      const sea = Math.round(H * 0.56), c = W * 0.5, peakX = W * 0.6;
      // its outline: height over the sea (a share of the map's height) at points across the map: a reef
      // shelf, the west beach, the jungle hill, a rocky peak dropping in a cliff, the east beach, deep sea
      const PTS = [[0, -0.37], [0.08, -0.35], [0.12, -0.21], [0.25, -0.16], [0.3, -0.05], [0.335, 0], [0.37, 0.025],
        [0.42, 0.06], [0.47, 0.11], [0.52, 0.16], [0.56, 0.2], [0.59, 0.215], [0.62, 0.2], [0.645, 0.12], [0.66, 0.05],
        [0.69, 0.025], [0.72, 0.01], [0.745, -0.02], [0.77, -0.1], [0.8, -0.3], [0.86, -0.36], [1, -0.37]];
      const lift = (u) => {
        let k = 0;
        while (k + 2 < PTS.length && u > PTS[k + 1][0]) k++;
        const [u0, h0] = PTS[k], [u1, h1] = PTS[k + 1], f = Math.min(1, Math.max(0, (u - u0) / (u1 - u0)));
        return h0 + (h1 - h0) * (0.5 - Math.cos(f * Math.PI) / 2);
      };
      const ground = new Int32Array(W);
      for (let x = 0; x < W; x++) ground[x] = Math.min(H - P(4), Math.round(sea - lift(x / W) * H + n(x) * P(2)));
      // dark volcanic rock in bands, darkening with depth, weathered red-brown under the soil
      const BANDS = ['#5c5550', '#544d48', '#635b55', '#4d4743'].map(rgb), DEEP = rgb('#24303a'), LATERITE = ['#7a4e36', '#6e4630'].map(rgb);
      const rock = (x, y) => mixRGB(BANDS[(((y + Math.sin(x * 0.04) * 3) / P(5)) | 0) & 3], DEEP, Math.min(0.6, Math.max(0, (y - sea) / H)));
      for (let x = 0; x < W; x++) {
        const g = ground[x], slope = Math.abs(ground[Math.min(W - 1, x + 1)] - ground[Math.max(0, x - 1)]) / 2;
        fillCol(w, x, g, H - 1, ID.STONE);
        for (let y = g; y < H; y++) tone(w, w.idx(x, y), rock(x, y));
        if (g >= sea - P(7)) fillCol(w, x, g, g + (slope < 0.8 ? P(9) : P(4)), ID.SAND); // beaches and the sandy sea floor
        else if (slope < 2.2 && g > sea - H * 0.26) {                                       // the hill, under the jungle
          fillCol(w, x, g, g + P(9), ID.SOIL);
          for (let y = g + P(9) + 1; y <= g + P(16); y++) tone(w, w.idx(x, y), pick(LATERITE, x >> 1, y >> 1));
        }
        if (g > sea) fillCol(w, x, sea, g - 1, ID.SALTWATER);
      }
      // a sea stack off the east shore
      const sx = Math.round(W * 0.93), sTop = sea - P(13);
      for (let x = sx - P(5); x <= sx + P(5); x++) {
        if (x < 0 || x >= W) continue;
        const t = sTop + Math.round(Math.abs(x - sx) ** 1.4 * 0.35 + n(x * 5) * 2);
        fillCol(w, x, t, ground[x], ID.STONE);
        for (let y = t; y <= ground[x]; y++) tone(w, w.idx(x, y), rock(x, y - P(20)));
      }
      // the coral reef: branching, brain and fan corals over the sand in the shallows
      const CORAL = ['#ff7a6b', '#f39a3e', '#c46bd6', '#ff6ea8', '#f2d468', '#5fd0c0'].map(rgb);
      const coralAt = (x, y, col) => { if (inMap(w, x, y) && y > sea + 2 && w.type[w.idx(x, y)] === ID.SALTWATER) tone(w, put(w, x, y, ID.STONE), col); };
      for (let x = P(4); x < W - P(4); x += P(4) + ((Math.random() * P(5)) | 0)) {
        const g = ground[x], d = g - sea;
        if (d < P(7) || d > P(40) || (x > W * 0.3 && x < W * 0.76)) continue;
        const col = CORAL[(Math.random() * CORAL.length) | 0], kind = Math.random();
        if (kind < 0.4) { // branching
          const h = P(4) + ((Math.random() * P(5)) | 0);
          for (let k = 1; k <= h; k++) coralAt(x, g - k, col);
          for (let b = 0; b < 2; b++) {
            const y0 = g - 2 - ((Math.random() * (h - 2)) | 0), side = b ? 1 : -1;
            for (let q = 1; q <= P(3); q++) coralAt(x + side * q, y0 - q, col);
          }
        } else if (kind < 0.7) { // brain
          const r = P(2) + ((Math.random() * 2) | 0);
          for (let dy = 0; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + 1) coralAt(x + dx, g - 1 - dy, col);
        } else { // fan
          const h = P(5);
          for (let q = 0; q <= h; q++) for (let dx = -(q >> 1); dx <= q >> 1; dx++) if (q === h || Math.abs(dx) === q >> 1 || dx === 0) coralAt(x + dx, g - 1 - q, col);
        }
      }
      // where the beaches and the hill are
      const beach = [], hill = [];
      for (let x = 2; x < W - 2; x++) {
        const t = w.type[w.idx(x, ground[x])];
        if (t === ID.SAND && ground[x] < sea - 1) beach.push(x);
        if (t === ID.SOIL) hill.push(x);
      }
      const left = beach.filter((x) => x < c), right = beach.filter((x) => x > peakX);
      grassOver(w, 0, W - 1, 0.9);
      // palms leaning out over each beach
      if (left.length) for (const f of [0.3, 0.8]) { const x = left[Math.floor(left.length * f)]; palm(w, x, ground[x], P(24) + ((Math.random() * P(8)) | 0), -1); }
      if (right.length) for (const f of [0.25, 0.7]) { const x = right[Math.floor(right.length * f)]; palm(w, x, ground[x], P(22) + ((Math.random() * P(8)) | 0), 1); }
      // the jungle: broad trees and bushes on the hill, flowers in the clearings
      const hl = hill.length;
      if (hl) {
        for (const f of [0.1, 0.45, 0.85]) { const x = hill[Math.floor(hl * f)]; oak(w, x, ground[x], P(20) + ((Math.random() * P(8)) | 0)); }
        for (const f of [0.28, 0.65]) { const x = hill[Math.floor(hl * f)]; palm(w, x, ground[x], P(28), f < 0.5 ? -1 : 1); }
        for (let k = 0; k < 9; k++) { const x = hill[Math.floor(hl * rand(0.02, 0.98))]; bush(w, x, ground[x], P(3) + ((Math.random() * P(3)) | 0)); }
        for (let k = 0; k < 16; k++) { const x = hill[Math.floor(hl * rand(0, 1))]; flower(w, x, ground[x] - 1); }
      }
      // boulders on the beaches
      for (const x of [left[Math.floor(left.length * 0.55)], right[Math.floor(right.length * 0.5)]]) {
        if (x === undefined) continue;
        const g = topOf(w, x);
        blob(w, x, g - 1, P(3), P(2), ID.STONE, true);
        paintBox(w, x - P(3), g - P(3), x + P(3), g, ID.STONE, rock(x, sea - H * 0.2));
      }
      // a fishing hut on stilts at the end of the west beach, out over the water
      if (left.length) {
        const bx = left[0], deck = sea - P(5), hx0 = bx - P(20), hx1 = bx + P(2);
        for (const px of [hx0, hx0 + P(10), hx1 - P(2)]) rect(w, px, deck, px, ground[Math.max(0, px)], ID.WOOD);
        for (let x = hx0; x <= hx1; x++) { const i = put(w, x, deck, ID.WOOD); if (i >= 0) tone(w, i, rgb('#8a6a48')); }
        const r0 = hx0 + P(2), r1 = hx0 + P(13), wallTop = deck - P(8);
        rect(w, r0, wallTop, r0, deck - 1, ID.WOOD); rect(w, r1, wallTop, r1, deck - P(5), ID.WOOD);
        for (let k = 0; k <= P(6); k++) { // a thatched roof
          for (let x = r0 - P(3) + k; x <= r1 + P(3) - k; x++) { const i = put(w, x, wallTop - k, ID.WOOD); if (i >= 0) tone(w, i, pick(['#c9a95c', '#b8974c', '#d6b86a'].map(rgb), x, wallTop - k)); }
        }
        person(w, hx1 - P(1), deck);
      }
      scatter(w, ID.FISH, 16, 0, sea + P(4), W - 1, H - 1, ID.SALTWATER);
      scatter(w, ID.SHARK, 1, W * 0.75, sea + P(10), W - 1, H - 1, ID.SALTWATER);
      scatter(w, ID.BIRD, 6, W * 0.4, P(10), W * 0.95, sea - P(40));
      w.livenTrees();
    },

    // A canyon cut down through layers of rock in their real colours, as in the Grand Canyon: pale
    // limestone and cream sandstone at the rim, red shales and the great red cliff, the green-grey
    // Tonto platform and the dark schist of the inner gorge, with a green river at the bottom, a rope
    // bridge over the gorge and pinyon pines along the rim.
    canyon(w) {
      w.clear();
      const { W, H } = w, s = H / 200, P = (v) => Math.max(1, Math.round(v * s));
      const nL = noise1(), nR = noise1(), nb = noise1(), nt = noise1();
      const rim = Math.round(H * 0.24), river = Math.round(H * 0.86), floor = river + P(9), D = river - rim;
      // [share of the depth, two shades, how it weathers: 1 a cliff, 0 a slope, 2 ledges, 3 a platform]
      const LAYERS = [
        [0.07, ['#dbcca8', '#cfbe98'], 1], // Kaibab limestone: the pale cliff at the rim
        [0.05, ['#c9a67e', '#be9b72'], 0], // Toroweap
        [0.09, ['#e8d6ac', '#dccb9e'], 1], // Coconino sandstone: a cream cliff
        [0.07, ['#a64a2e', '#9a4229'], 0], // Hermit shale: deep red slopes
        [0.13, ['#b95a32', '#c8703f'], 2], // the Supai group: red ledges
        [0.15, ['#9c4128', '#aa4a2d'], 1], // Redwall limestone: the great red cliff
        [0.05, ['#968b6c', '#8b8063'], 1], // Muav limestone
        [0.12, ['#808a6c', '#8c9477'], 3], // Bright Angel shale: the green-grey Tonto platform
        [0.06, ['#71553b', '#7e6043'], 1], // Tapeats sandstone
        [0.21, ['#40394a', '#4b4352'], 1], // Vishnu schist: the dark inner gorge
      ].map(([f, c, k]) => [f, c.map(rgb), k]);
      const starts = [];
      let acc = 0;
      for (const L of LAYERS) { starts.push(rim + Math.round(acc * D)); acc += L[0]; }
      const layerAt = (y) => { let k = 0; while (k + 1 < LAYERS.length && y >= starts[k + 1]) k++; return k; };
      // how far the walls have stepped back by each row: a little down a cliff, a lot down a slope
      const back = new Float32Array(H + 1);
      for (let y = rim + 1; y <= H; y++) {
        const k = layerAt(y), L = LAYERS[k], into = (y - starts[k]) / Math.max(1, (starts[k + 1] || river) - starts[k]);
        const step = y > river ? 0 : L[2] === 1 ? 0.2 : L[2] === 0 ? 1.4 : L[2] === 2 ? (((y - starts[k]) / P(4)) & 1 ? 1.5 : 0.15) : into < 0.3 ? 6 : 0.8;
        back[y] = back[y - 1] + step;
      }
      const hwTop = W * 0.37, hwBot = W * 0.04, scale = (hwTop - hwBot) / back[river];
      const cxAt = (y) => W * 0.5 + Math.sin(y * 0.045) * W * 0.015;
      const edgeL = (y) => Math.round(cxAt(y) - (hwTop - back[Math.min(H, y)] * scale) - nL(y * 1.7) * P(3));
      const edgeR = (y) => Math.round(cxAt(y) + (hwTop - back[Math.min(H, y)] * scale) + nR(y * 1.7) * P(3));
      for (let x = 0; x < W; x++) {
        const lip = rim + Math.round(nt(x) * P(1.5));
        for (let y = lip; y < H; y++) {
          if (y < floor && x > edgeL(y) && x < edgeR(y)) continue; // the canyon itself
          const i = w.idx(x, y);
          w.place(i, ID.STONE);
          const yy = y + Math.round(nb(x) * P(2)), k = layerAt(Math.max(rim, yy)), band = ((yy + Math.round(Math.sin(x * 0.05) * 1.5)) / P(3)) | 0;
          tone(w, i, LAYERS[k][1][band & 1]);
        }
      }
      // pink granite dikes through the schist
      for (let d = 0; d < 3; d++) {
        let x = edgeL(river) - P(10) + d * P(14) + (d === 2 ? W * 0.06 : 0), y = floor + P(4);
        for (let q = 0; q < P(30); q++) {
          const i = inMap(w, x | 0, y | 0) ? w.idx(x | 0, y | 0) : -1;
          if (i >= 0 && w.type[i] === ID.STONE && y > starts[9]) tone(w, i, rgb('#b88270'));
          x += rand(-0.6, 0.9); y -= 1;
        }
      }
      // the river: green water over a sandy bed
      for (let x = 0; x < W; x++) {
        for (let y = river; y < floor; y++) {
          const i = w.idx(x, y);
          if (w.type[i] !== ID.EMPTY) continue;
          w.place(i, y >= floor - P(2) ? ID.SAND : ID.WATER);
          if (w.type[i] === ID.WATER) tone(w, i, rgb('#3f8f80'));
        }
      }
      // a thin red soil on the rim, with pinyon pines and sagebrush
      for (let x = 0; x < W; x++) {
        const y = topOf(w, x);
        if (y > rim + P(3) || y >= H) continue;
        for (let k = 1; k <= P(2); k++) { const i = put(w, x, y - k, ID.SOIL); if (i >= 0) tone(w, i, pick(['#8a5034', '#7c4a30'].map(rgb), x, y - k)); }
      }
      for (const u of [0.02, 0.07, 0.1, 0.9, 0.94, 0.98]) {
        const x = Math.round(W * u), g = topOf(w, x);
        if (g < rim + P(4)) pine(w, x, g, P(10) + ((Math.random() * P(6)) | 0));
      }
      for (const u of [0.045, 0.125, 0.875, 0.955]) { const x = Math.round(W * u), g = topOf(w, x); if (g < rim + P(4)) bush(w, x, g, P(3), WILLOW); }
      grassOver(w, 0, Math.round(W * 0.14), 0.25); grassOver(w, Math.round(W * 0.86), W - 1, 0.25);
      // a rope bridge across the inner gorge, from the top of the brown sandstone
      const by = starts[8] - 1, bx0 = edgeL(by) - P(4), bx1 = edgeR(by) + P(4), sag = P(4);
      const deckY = (x) => by + Math.round(sag * Math.sin((Math.PI * (x - bx0)) / (bx1 - bx0)));
      const tower = P(9);
      for (const tx of [bx0, bx1]) rect(w, tx, by - tower, tx, by, ID.WOOD);
      for (let x = bx0; x <= bx1; x++) {
        put(w, x, deckY(x), ID.WOOD);
        const cable = by - tower + Math.round((tower - 2) * Math.sin((Math.PI * (x - bx0)) / (bx1 - bx0)) ** 0.7);
        if (x > bx0 && x < bx1) {
          put(w, x, cable, ID.WOOD);
          if ((x - bx0) % P(4) === 0) rect(w, x, cable, x, deckY(x), ID.WOOD);
        }
      }
      paintBox(w, bx0, by - tower, bx1, by + sag + 1, ID.WOOD, ['#8a6440', '#7a5636'].map(rgb));
      scatter(w, ID.BIRD, 3, W * 0.25, P(8), W * 0.75, rim - P(10));
      scatter(w, ID.FISH, 3, 0, river, W - 1, floor, ID.WATER);
      w.livenTrees();
    },

    // A workshop stocked with every starter: jars of sand, dirt, salt and sugar on the top shelf; water,
    // oil, lime, a flask of steam and a jar of cells on the middle one; and on the floor blocks of wall,
    // stone, soil, wood and metal, a potted plant, a pot of flowers and a fire in the grate.
    workshop(w) {
      w.clear();
      const { W, H } = w, s = H / 200, P = (v) => Math.max(1, Math.round(v * s));
      const floor = H - P(6);
      rect(w, 0, floor, W - 1, H - 1, ID.WALL);
      paintBox(w, 0, floor, W - 1, H - 1, ID.WALL, ['#4e3c2c', '#57432f', '#4a392a'].map(rgb));
      const shelf = (y) => {
        rect(w, P(4), y, W - P(5), y + P(1), ID.WALL);
        paintBox(w, P(4), y, W - P(5), y + P(1), ID.WALL, ['#7a5a3c', '#6e5036'].map(rgb));
        for (let x = P(10); x < W - P(5); x += Math.round(W / 4)) { rect(w, x, y + P(2), x + 1, y + P(4), ID.WALL); paintBox(w, x, y + P(2), x + 1, y + P(4), ID.WALL, rgb('#3b3f46')); }
      };
      // a glass jar standing on row y, filled with t (a lid on top if sealed)
      const jar = (x0, x1, y, h, t, fill, sealed) => {
        rect(w, x0, y - h, x0, y - 1, ID.GLASS); rect(w, x1, y - h, x1, y - 1, ID.GLASS); rect(w, x0, y - 1, x1, y - 1, ID.GLASS);
        if (sealed) rect(w, x0, y - h, x1, y - h, ID.GLASS);
        rect(w, x0 + 1, y - 1 - fill, x1 - 1, y - 2, t);
        return [x0 + 1, y - 1 - fill, x1 - 1, y - 2];
      };
      const row = (y, items) => {
        const n = items.length, span = (W - P(14)) / n;
        items.forEach((f, k) => f(Math.round(P(7) + k * span + P(3)), Math.round(P(7) + (k + 1) * span - P(3)), y));
      };
      const top = Math.round(H * 0.3), mid = Math.round(H * 0.62), jh = P(22);
      shelf(top); shelf(mid);
      row(top, [ID.SAND, ID.DIRT, ID.SALT, ID.SUGAR].map((t) => (x0, x1, y) => jar(x0, x1, y, jh, t, P(15))));
      row(mid, [
        (x0, x1, y) => jar(x0, x1, y, jh, ID.WATER, P(15)),
        (x0, x1, y) => jar(x0, x1, y, jh, ID.OIL, P(15)),
        (x0, x1, y) => jar(x0, x1, y, jh, ID.LIME, P(15)),
        (x0, x1, y) => { const [a, b, c, d] = jar(x0, x1, y, jh, ID.STEAM, jh - 3, true); for (let yy = b; yy <= d; yy++) for (let x = a; x <= c; x++) w.temp[w.idx(x, yy)] = 160; },
        (x0, x1, y) => { const [a, b, c, d] = jar(x0, x1, y, jh, ID.WATER, P(14)); scatter(w, ID.CELL, 8, a, b, c, d, ID.WATER); },
      ]);
      // the floor: blocks of the five solids, two pots, and a fire in an iron grate
      const pot = (a, b, y, flowers) => {
        const ph = P(12), m = (a + b) >> 1, x0 = m - P(8), x1 = m + P(8);
        for (let k = 0; k < ph; k++) { const inset = Math.round(k * 0.25); rect(w, x0 + inset, y - 1 - k, x0 + inset, y - 1 - k, ID.WALL); rect(w, x1 - inset, y - 1 - k, x1 - inset, y - 1 - k, ID.WALL); }
        rect(w, x0, y - 1, x1, y - 1, ID.WALL);
        paintBox(w, x0, y - ph, x1, y - 1, ID.WALL, ['#b5653a', '#a85c34'].map(rgb));
        for (let yy = y - ph + 1; yy < y - 1; yy++) for (let x = x0 + 1; x < x1; x++) if (w.type[w.idx(x, yy)] === ID.EMPTY && x > x0 + Math.round((y - 1 - yy) * 0.25) && x < x1 - Math.round((y - 1 - yy) * 0.25)) put(w, x, yy, ID.SOIL);
        const mx = (x0 + x1) >> 1, sy = y - ph;
        if (flowers) { for (const d of [-P(3), 0, P(3)]) { const i = put(w, mx + d, sy, ID.PLANT); w.data[i] = P(6) + ((Math.random() * P(5)) | 0); w.aux[i] = 1 + ((Math.random() * 255) | 0); } }
        else { const i = put(w, mx, sy, ID.PLANT); w.data[i] = P(20); }
      };
      const block = (t, h) => (x0, x1, y) => rect(w, x0, y - h, x1, y - 1, t);
      row(floor, [
        block(ID.WALL, P(16)), block(ID.STONE, P(16)), block(ID.SOIL, P(12)), block(ID.WOOD, P(14)), block(ID.METAL, P(10)),
        (x0, x1, y) => pot(x0, x1, y, false),
        (x0, x1, y) => pot(x0, x1, y, true),
        (x0, x1, y) => {
          rect(w, x0, y - P(3), x0, y - 1, ID.METAL); rect(w, x1, y - P(3), x1, y - 1, ID.METAL); rect(w, x0, y - 1, x1, y - 1, ID.METAL);
          rect(w, x0 + 1, y - P(5), x1 - 1, y - 2, ID.WOOD);
          for (let x = x0 + 1; x < x1; x++) w.ignite(w.idx(x, y - P(5)));
        },
      ]);
    },
  };

  G.Scenes = scenes;
  // shared with the story chapters
  G.SceneKit = {
    noise1, fillCol, blob, rgb, mixRGB, tone, put, rect, paintBox, pick, topOf, rand,
    oak, pine, palm, willow, bush, snag, flower, grassOver, person, scatter, pipe, kit, ground,
  };
})(globalThis);
