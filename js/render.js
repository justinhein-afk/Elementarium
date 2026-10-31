/* Elementarium — renderer.
 * Writes every cell into a W×H ImageData (colour) plus a second buffer of emitted light,
 * then composites: backdrop → pixels (nearest-neighbour) → two blurred bloom layers (additive). */
(function (G) {
  'use strict';

  const { ELEM, Sim } = G;
  const { R, list } = ELEM;
  const NT = ELEM.NT;
  const { BURN, LEAF, PETAL, CENTER, BLEACH, EXACT, SWIMS, RAINBOW, TANK_CAP } = Sim;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const hex = ELEM.hexToRgb;

  function hash(n) {
    n = (n ^ 61) ^ (n >>> 16);
    n = (n + (n << 3)) | 0;
    n ^= n >>> 4;
    n = Math.imul(n, 0x27d4eb2d);
    n ^= n >>> 15;
    return n >>> 0;
  }

  // Build an n-entry RGB ramp from [[pos 0..1, '#hex'], ...]
  function ramp(stops, n) {
    const out = new Uint8Array(n * 3);
    const s = stops.map(([p, h]) => [p, hex(h)]);
    for (let k = 0; k < n; k++) {
      const p = k / (n - 1);
      let a = 0;
      while (a < s.length - 2 && p > s[a + 1][0]) a++;
      const [p0, c0] = s[a], [p1, c1] = s[a + 1];
      const f = clamp((p - p0) / (p1 - p0 || 1), 0, 1);
      for (let c = 0; c < 3; c++) out[k * 3 + c] = Math.round(c0[c] + (c1[c] - c0[c]) * f);
    }
    return out;
  }

  // ───── colour tables ─────
  const PR = new Uint8Array(NT * 16), PG = new Uint8Array(NT * 16), PB = new Uint8Array(NT * 16);
  const MODE = new Uint8Array(NT), ALPHA = new Uint8Array(NT);
  const EMIT = new Float32Array(NT);
  for (const d of list) {
    MODE[d.id] = d.render;
    ALPHA[d.id] = Math.round(d.alpha * 255);
    EMIT[d.id] = d.emit;
    for (let k = 0; k < 16; k++) {
      const c = d.rgb[k % d.rgb.length];
      const j = 1 + ((hash(d.id * 16 + k) % 100) - 50) / 950;
      PR[d.id * 16 + k] = clamp(Math.round(c[0] * j), 0, 255);
      PG[d.id * 16 + k] = clamp(Math.round(c[1] * j), 0, 255);
      PB[d.id * 16 + k] = clamp(Math.round(c[2] * j), 0, 255);
    }
  }

  const FIRE = ramp([[0, '#5a0d06'], [0.18, '#b8260f'], [0.4, '#f0561a'], [0.65, '#ff9a2a'], [0.85, '#ffd25a'], [1, '#fff3c0']], 64);
  const LAVA = ramp([[0, '#7a1406'], [0.35, '#d93a12'], [0.6, '#ff6a1f'], [0.85, '#ffa236'], [1, '#ffd77a']], 64);
  const MGLASS = ramp([[0, '#c2501c'], [0.5, '#ff9a3a'], [1, '#ffe2a8']], 64);
  const MMETAL = ramp([[0, '#e07a22'], [0.5, '#ffc04d'], [1, '#fff6d6']], 64);
  const HEAT = ramp([[0, '#4a0a04'], [0.15, '#a3200c'], [0.35, '#e8461a'], [0.6, '#ff9a2a'], [0.8, '#ffe07a'], [1, '#ffffff']], 64);
  const PLASMA = ramp([[0, '#7a3cff'], [0.5, '#d9a8ff'], [1, '#ffffff']], 16);

  // Thermal camera: index = (T + 120) / 2
  const TSTOPS = [[-120, '#5a3cff'], [-40, '#2f6bff'], [0, '#29a8f0'], [20, '#0b1622'], [60, '#2c1a5c'],
    [150, '#86286e'], [400, '#e0402c'], [900, '#ff9a2a'], [1600, '#ffe066'], [3200, '#ffffff']];
  const TMIN = -120, TMAX = 3200, TN = (TMAX - TMIN) / 2 + 1;
  const THERM = new Uint8Array(TN * 3);
  {
    const s = TSTOPS.map(([t, h]) => [t, hex(h)]);
    for (let k = 0; k < TN; k++) {
      const T = TMIN + k * 2;
      let a = 0;
      while (a < s.length - 2 && T > s[a + 1][0]) a++;
      const f = clamp((T - s[a][0]) / (s[a + 1][0] - s[a][0]), 0, 1);
      for (let c = 0; c < 3; c++) THERM[k * 3 + c] = Math.round(s[a][1][c] + (s[a + 1][1][c] - s[a][1][c]) * f);
    }
  }

  // Flower petals: hue from the plant's genes (aux byte)
  const FLR = new Uint8Array(256), FLG = new Uint8Array(256), FLB = new Uint8Array(256);
  for (let h = 0; h < 256; h++) {
    // skip greens so petals never vanish against leaves
    let hue = (h / 256) * 260 + 160;
    hue %= 360;
    const [r, g, b] = hsl(hue, 0.78, 0.66);
    FLR[h] = r; FLG[h] = g; FLB[h] = b;
  }
  function hsl(h, s, l) {
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
      const k = (n + h / 30) % 12;
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return [f(0), f(8), f(4)];
  }

  const SELF_LIT = new Uint8Array(64);
  for (const m of [R.FIRE, R.LAVA, R.MOLTEN, R.EMBER, R.PLASMA, R.SPARK, R.RAD, R.MSPARK, R.LIGHT]) SELF_LIT[m] = 1;

  // thin-film / prism colours: oil sheen, soap bubbles, diamond fire
  const RB = new Uint8Array(256 * 3);
  for (let h = 0; h < 256; h++) {
    const [r, g, b] = hsl((h / 256) * 360, 0.85, 0.62);
    RB[h * 3] = r; RB[h * 3 + 1] = g; RB[h * 3 + 2] = b;
  }
  // molten glass by temperature: deep red near its setting point, honey-yellow when very hot
  const MGLASS_T = ramp([[0, '#9c2a0c'], [0.3, '#d9531a'], [0.6, '#ff9a34'], [0.85, '#ffcf72'], [1, '#fff0c4']], 64);
  const ID = ELEM.ID;
  const IS_CLOUD = new Uint8Array(NT);
  for (const t of [ID.CLOUD, ID.RAINCLOUD, ID.STORMCLOUD, ID.SNOWCLOUD]) IS_CLOUD[t] = 1;
  const METALLIC = new Uint8Array(NT);
  for (const d of list) if (d.periodic && ['alk', 'ae', 'tm', 'pt', 'ln', 'an', 'sh'].includes(d.fam)) METALLIC[d.id] = 1;
  const WATERY = new Uint8Array(NT);
  for (const t of [ID.WATER, ID.SALTWATER, ID.CRYO, ID.ACID]) WATERY[t] = 1;
  // liquids, and the gases that show as bubbles while they rise through one
  const LIQ = new Uint8Array(NT), BUBBLY = new Uint8Array(NT);
  for (const d of list) if (!d.periodic && d.cat === ELEM.CAT.LIQUID) LIQ[d.id] = 1;
  for (const t of [ID.STEAM, ID.METHANE, ID.CO2]) BUBBLY[t] = 1;

  // periodic elements: phase limits and their special colours
  const MP = new Float32Array(NT).fill(Infinity), BP = new Float32Array(NT).fill(Infinity);
  const colorTable = () => ({ on: new Uint8Array(NT), r: new Uint8Array(NT), g: new Uint8Array(NT), b: new Uint8Array(NT) });
  const FLAMEC = colorTable(), DISC = colorTable(), GASC = colorTable(), LIQC = colorTable(), GLOWC = colorTable();
  const PHOSC = colorTable(), PHOSLEN = new Uint8Array(NT); // phosphors, and how long their afterglow lasts
  // the colour each metal stains glass; the colour of the sparks it throws; capacitors
  const GLASSC = colorTable(), SPARKC = colorTable(), CAPAC = new Uint8Array(NT);
  const setC = (tab, t, h) => { if (!h) return; const [r, g, b] = hex(h); tab.on[t] = 1; tab.r[t] = r; tab.g[t] = g; tab.b[t] = b; };
  for (const d of list) {
    setC(FLAMEC, d.id, d.flameColor);
    setC(DISC, d.id, d.dischargeColor);
    setC(GASC, d.id, d.gasColor);
    setC(LIQC, d.id, d.liqColor);
    setC(GLOWC, d.id, d.glowColor);
    setC(PHOSC, d.id, d.phosColor);
    if (d.phosColor) PHOSLEN[d.id] = d.chem.phos[1];
    setC(GLASSC, d.id, d.glassColor);
    setC(SPARKC, d.id, d.sparkColor);
    if (d.chem && d.chem.capacitor) CAPAC[d.id] = 1;
    if (d.periodic) { MP[d.id] = d.mp; BP[d.id] = d.bp; }
  }
  const HG = ELEM.ID.EL_HG, URANIUM = ELEM.ID.EL_U, THORIUM = ELEM.ID.EL_TH;

  // living plant tissue: it yellows and browns as it dries out (world.sap)
  const SAPPY = new Uint8Array(NT);
  for (const k of ['PLANT', 'FLOWER', 'GRASS', 'CACTUS', 'VINE', 'MUSHROOM', 'LILY', 'SAPLING', 'PINE', 'PALM', 'WILLOW']) SAPPY[ID[k]] = 1;
  // leaves by tree (a leaf's aux): oak (the plant's own green), pine needles, palm fronds, willow
  const LEAF_RGB = [null, [38, 96, 62], [126, 172, 58], [150, 186, 112]];
  // what sways in the wind (see the ripple in paintCells)
  const SWAYS = new Uint8Array(64);
  for (const m of [R.PLANT, R.GRASS, R.FLOWER, R.VINE, R.LILY]) SWAYS[m] = 1;
  const SINE = new Float32Array(256);
  for (let k = 0; k < 256; k++) SINE[k] = Math.sin((k / 256) * Math.PI * 2);
  const RUBBLE = ID.RUBBLE, SCRAP = ID.SCRAP;

  // Explosion flashes: an explosive's own blastColor, else the flame-test colour of whatever
  // coloured the blast, else fire orange; blastGlow is how bright the flash is.
  const BLAST_RGB = new Array(NT).fill('255,150,60'), BLAST_GLOW = new Float32Array(NT).fill(0.7);
  for (const d of list) {
    const h = d.blastColor || d.flameColor;
    if (h) BLAST_RGB[d.id] = hex(h).join(',');
    if (d.blastGlow) BLAST_GLOW[d.id] = d.blastGlow;
  }
  // Rainbow fire (a fire whose aux is Sim.RAINBOW, painted once every fire colour is made): the fire
  // colours in turn round the colour wheel, each held two seconds (120 ticks), blending quickly into
  // the next.
  const RAINBOW_RGB = ELEM.periodic.filter((d) => d.flameColor).map((d) => hex(d.flameColor)).sort((p, q) => {
    const hue = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn || 1;
      const h = mx === r ? (g - b) / d : mx === g ? 2 + (b - r) / d : 4 + (r - g) / d; return (h + 6) % 6; };
    return hue(p) - hue(q);
  });
  const rainbowNow = [255, 150, 60];
  function rainbowAt(tick) {
    const n = RAINBOW_RGB.length, ph = tick / 120, k = Math.floor(ph), f = Math.min(1, (ph - k) * 6);
    const a = RAINBOW_RGB[(k + n - 1) % n], b = RAINBOW_RGB[k % n];
    for (let c = 0; c < 3; c++) rainbowNow[c] = (a[c] + (b[c] - a[c]) * f) | 0;
    return rainbowNow;
  }
  // A reaction's burst of light: the element's flame colour, else its gas colour, else its own
  const SPARK_RGB = list.map((d) => hex(d.flameColor || d.gasColor || d.colors[0]).join(','));

  function createRenderer(canvas) {
    const ctx = canvas.getContext('2d', { alpha: false });
    const mk = () => document.createElement('canvas');
    const wc = mk(), gc = mk(), b1 = mk(), b2 = mk();
    const wctx = wc.getContext('2d'), gctx = gc.getContext('2d');
    const b1ctx = b1.getContext('2d'), b2ctx = b2.getContext('2d');
    const bg = mk(), bgctx = bg.getContext('2d');
    const ac = mk(), actx = ac.getContext('2d'); // the air field, one pixel per air cell
    let aimg = null, aout = null;
    const hasFilter = typeof ctx.filter === 'string';

    let world = null, W = 0, H = 0;
    let depth = new Uint16Array(1); // how far below a liquid's surface each column's current cell is
    let img, out, gimg, glow;
    let dpr = 1, cw = 0, ch = 0;
    // camera: zoom 1 fits the whole map; cx/cy is the world point at the centre of the screen
    const view = { ox: 0, oy: 0, s: 1, fit: 1, zoom: 1, cx: 0, cy: 0, availH: 1 };
    let insetBottom = 0; // CSS px at the bottom covered by the toolbar
    let shakeAmt = 0, flashAmt = 0, glareAmt = 0;
    const rings = [];
    const brush = { x: 0, y: 0, r: 4, r2: 0, ty: 0, visible: false, color: '#ffffff', mode: 'paint' };

    function setWorld(w) {
      world = w; W = w.W; H = w.H;
      wc.width = gc.width = W; wc.height = gc.height = H;
      b1.width = Math.max(1, W >> 1); b1.height = Math.max(1, H >> 1);
      b2.width = Math.max(1, Math.round(W / 6)); b2.height = Math.max(1, Math.round(H / 6));
      img = wctx.createImageData(W, H); out = new Uint32Array(img.data.buffer);
      gimg = gctx.createImageData(W, H); glow = new Uint32Array(gimg.data.buffer);
      ac.width = w.air.W; ac.height = w.air.H;
      aimg = actx.createImageData(w.air.W, w.air.H); aout = new Uint32Array(aimg.data.buffer);
      depth = new Uint16Array(W);
      view.zoom = 1; view.cx = W / 2; view.cy = H / 2;
      resize();
    }

    function layout() {
      if (!W) return;
      const availH = view.availH = Math.max(1, ch - insetBottom * dpr);
      view.fit = Math.min(cw / W, availH / H);
      const maxZoom = Math.max(1, (28 * dpr) / view.fit);
      view.zoom = clamp(view.zoom, 1, maxZoom);
      const s = view.fit * view.zoom;
      view.s = s;
      // keep the map on screen: centred when smaller than the view; when larger it can be
      // dragged until its edge is a little way in from the screen edge
      const hw = cw / 2 / s, hh = availH / 2 / s, m = (90 * dpr) / s;
      view.cx = W * s <= cw ? W / 2 : clamp(view.cx, hw - m, W - hw + m);
      view.cy = H * s <= availH ? H / 2 : clamp(view.cy, hh - m, H - hh + m);
      view.ox = Math.round(cw / 2 - view.cx * s);
      view.oy = Math.round(availH / 2 - view.cy * s);
    }
    function setInsetBottom(px) {
      if (Math.abs(px - insetBottom) < 1) return;
      insetBottom = px;
      layout();
    }

    // Zoom by a factor, keeping the world point under the cursor fixed (like a map).
    function zoomAt(clientX, clientY, factor) {
      const rect = canvas.getBoundingClientRect();
      const px = (clientX - rect.left) * dpr, py = (clientY - rect.top) * dpr;
      const wx = (px - view.ox) / view.s, wy = (py - view.oy) / view.s;
      view.zoom *= factor;
      layout();
      view.cx = wx - (px - cw / 2) / view.s;
      view.cy = wy - (py - view.availH / 2) / view.s;
      layout();
    }
    function panBy(dxClient, dyClient) {
      view.cx -= (dxClient * dpr) / view.s;
      view.cy -= (dyClient * dpr) / view.s;
      layout();
    }
    function fitView() { view.zoom = 1; view.cx = W / 2; view.cy = H / 2; layout(); }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cw = Math.max(1, Math.round(rect.width * dpr));
      ch = Math.max(1, Math.round(rect.height * dpr));
      canvas.width = cw; canvas.height = ch;
      layout();
      buildBackdrop();
    }

    function buildBackdrop() {
      bg.width = cw; bg.height = ch;
      const g = bgctx.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, '#0d1418');
      g.addColorStop(1, '#070a0c');
      bgctx.fillStyle = g;
      bgctx.fillRect(0, 0, cw, ch);
      // soft lamp-light from above, like a bench under a hanging light
      const rg = bgctx.createRadialGradient(cw * 0.5, -ch * 0.15, 0, cw * 0.5, -ch * 0.15, ch * 1.1);
      rg.addColorStop(0, 'rgba(214,168,79,0.07)');
      rg.addColorStop(1, 'rgba(214,168,79,0)');
      bgctx.fillStyle = rg;
      bgctx.fillRect(0, 0, cw, ch);
    }

    // The vessel the world sits in, drawn each frame because the camera moves. Behind the map is a sky
    // (only where nothing is: it changes no cell's colour): a day sky, blue overhead and hazy toward the
    // horizon with the sun high in a corner; dusk, indigo to an orange glow low on the horizon; or the
    // dark of night. Its tint follows the weather: colder is bluer, hotter is warmer, storms are darker.
    const SKIES = {
      day: [[0, '#2c64a8'], [0.45, '#5b97d0'], [0.8, '#a9d0ea'], [1, '#d4e8f2']],
      dusk: [[0, '#14122c'], [0.35, '#3b2349'], [0.65, '#8c3a45'], [0.85, '#d2683a'], [1, '#f0a35a']],
    };
    // the space sky's stars, where they sit on the map (0–1), their size, and how they twinkle
    const STARS = Array.from({ length: 260 }, () => [Math.random(), Math.random(), Math.random() < 0.12 ? 2 : 1, Math.random() * 6.3, 0.6 + Math.random() * 2.2]);
    function drawVessel(sx, sy, weather, sky) {
      const { ox, oy, s } = view;
      const x0 = ox + sx, y0 = oy + sy, w = W * s, h = H * s;
      const stops = SKIES[sky];
      if (stops) {
        const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
        for (const [f, c] of stops) g.addColorStop(f, c);
        ctx.fillStyle = g;
        ctx.fillRect(x0, y0, w, h);
        // the sun: high to the left by day, low and large at dusk
        const day = sky === 'day', cx = x0 + w * (day ? 0.18 : 0.72), cy = y0 + h * (day ? 0.12 : 0.62), r = h * (day ? 0.35 : 0.55);
        const sun = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        sun.addColorStop(0, day ? 'rgba(255,250,225,0.55)' : 'rgba(255,196,120,0.5)');
        sun.addColorStop(day ? 0.08 : 0.12, day ? 'rgba(255,248,220,0.35)' : 'rgba(255,170,90,0.3)');
        sun.addColorStop(1, 'rgba(255,240,210,0)');
        ctx.fillStyle = sun;
        ctx.fillRect(x0, y0, w, h);
      } else if (sky === 'space') {
        // the black above the air: a deep blue-black, and stars that twinkle
        const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
        g.addColorStop(0, '#010207');
        g.addColorStop(1, '#070b18');
        ctx.fillStyle = g;
        ctx.fillRect(x0, y0, w, h);
        const now = performance.now() / 1000;
        for (const [fx, fy, r, ph, sp] of STARS) {
          const a = 0.45 + 0.4 * Math.sin(now * sp + ph);
          const d = Math.max(dpr, r * s * 0.6);
          ctx.fillStyle = `rgba(232,238,255,${a.toFixed(2)})`;
          ctx.fillRect(x0 + fx * w, y0 + fy * h, d, d);
        }
      } else {
        ctx.fillStyle = '#0a1013';
        ctx.fillRect(x0, y0, w, h);
      }
      if (weather && sky !== 'space') {
        const a = weather.ambient;
        let tint = null;
        if (a < 5) tint = `rgba(120,170,255,${Math.min(0.16, (5 - a) / 45 * 0.16)})`;
        else if (a > 28) tint = `rgba(255,150,70,${Math.min(0.14, (a - 28) / 25 * 0.14)})`;
        if (tint) { ctx.fillStyle = tint; ctx.fillRect(ox + sx, oy + sy, W * s, H * s); }
        if (weather.gloom > 0 && stops) { // a day or dusk sky clouds over grey: a storm darkens it the most
          ctx.fillStyle = `rgba(78,86,98,${Math.min(0.85, weather.gloom * 2.4)})`;
          ctx.fillRect(x0, y0, w, h);
        } else if (weather.gloom > 0) {
          const g = ctx.createLinearGradient(0, oy, 0, oy + H * s);
          g.addColorStop(0, `rgba(30,34,42,${weather.gloom})`);
          g.addColorStop(1, 'rgba(30,34,42,0)');
          ctx.fillStyle = g;
          ctx.fillRect(ox + sx, oy + sy, W * s, H * s);
        }
      }
      ctx.strokeStyle = 'rgba(78,154,136,0.22)';
      ctx.lineWidth = Math.max(1, dpr);
      ctx.strokeRect(ox + sx - 0.5 * dpr, oy + sy - 0.5 * dpr, W * s + dpr, H * s + dpr);
      if (s >= 2) {
        // graduation marks along the left wall, like a measuring vessel
        ctx.fillStyle = 'rgba(233,227,211,0.07)';
        for (let y = 0; y < H; y += 10) {
          const len = y % 50 === 0 ? 6 : 3;
          ctx.fillRect(ox + sx, oy + sy + (H - y) * s, len * dpr, Math.max(1, dpr * 0.75));
        }
      }
    }

    // creatures found this frame, drawn as sprites over the pixels
    let people = new Int32Array(256), nPeople = 0;
    let birds = new Int32Array(256), nBirds = 0;
    let beasts = new Int32Array(256), nBeasts = 0; // cows, wolves and sharks
    const HUMAN = ELEM.ID.HUMAN, BIRD = ELEM.ID.BIRD, HEADT = ELEM.ID.HEAD;
    const COW = ELEM.ID.COW, WOLF = ELEM.ID.WOLF, SHARK = ELEM.ID.SHARK;
    let frameTick = 0;

    function paintCells(tick, thermal) {
      const { SW, type, shade, flags, charge, aux, data, temp, sap, col } = world;
      // the wind each plant feels: the air flowing past it, plus the weather's breeze
      const AVX = world.air.vx, AW = world.air.W, breeze = world.weather.wind * 0.6;
      const liquidAt = (j) => {
        const u = type[j];
        return MODE[u] === R.PERIODIC ? temp[j] >= MP[u] && temp[j] < BP[u] : LIQ[u] === 1;
      };
      let o = 0;
      nPeople = 0; nBirds = 0; nBeasts = 0;
      frameTick = tick;
      const rbw = rainbowAt(tick);
      // drawn as figures (zoomed in far enough), a swimmer lies along the water: the two cells they
      // stand in show what is around them instead, so no upright outline shows behind the figure
      const figures = view.s >= 1;
      const swimming = (j) => (aux[j] & SWIMS) && (liquidAt(j + SW) || liquidAt(j - 1) || liquidAt(j + 1));
      for (let y = 0; y < H; y++) {
        let i = (y + 1) * SW + 1;
        for (let x = 0; x < W; x++, i++, o++) {
          const t = type[i];
          const T = temp[i];

          if (thermal) {
            const k = (clamp(T, TMIN, TMAX) - TMIN) >> 1;
            let r = THERM[k * 3], g = THERM[k * 3 + 1], b = THERM[k * 3 + 2];
            if (t !== 0) {
              const p = t * 16 + (shade[i] >> 4);
              r = (r * 0.82 + PR[p] * 0.18) | 0; g = (g * 0.82 + PG[p] * 0.18) | 0; b = (b * 0.82 + PB[p] * 0.18) | 0;
            }
            out[o] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
            glow[o] = T > 700 ? ((255 << 24) | ((b * 0.5) << 16) | ((g * 0.5) << 8) | (r * 0.5)) >>> 0 : 0;
            continue;
          }

          if (t === 0) { out[o] = 0; glow[o] = 0; depth[x] = 0; continue; }
          if (t === HUMAN) {
            if (nPeople === people.length) { const n = new Int32Array(nPeople * 2); n.set(people); people = n; }
            people[nPeople++] = i;
          } else if (t === BIRD) {
            if (nBirds === birds.length) { const n = new Int32Array(nBirds * 2); n.set(birds); birds = n; }
            birds[nBirds++] = i;
          } else if (t === COW || t === WOLF || t === SHARK) {
            if (nBeasts === beasts.length) { const n = new Int32Array(nBeasts * 2); n.set(beasts); beasts = n; }
            beasts[nBeasts++] = i;
          }
          if (figures && ((t === HUMAN && swimming(i)) || (t === HEADT && type[i + SW] === HUMAN && swimming(i + SW)))) {
            // in the water, the water beside it; above the surface, nothing (the air)
            const j = liquidAt(i - 1) ? i - 1 : liquidAt(i + 1) ? i + 1 : -1;
            if (j < 0) { out[o] = 0; glow[o] = 0; depth[x] = 0; continue; }
            out[o] = out[o - 1 >= 0 && j === i - 1 ? o - 1 : o] || 0; // the cell to its left, already drawn
            if (j === i + 1 || !out[o]) { const q = type[j] * 16 + (shade[j] >> 4); out[o] = (((ALPHA[type[j]] | 0) << 24) | (PB[q] << 16) | (PG[q] << 8) | PR[q]) >>> 0; }
            glow[o] = 0; depth[x] = depth[x] + 1;
            continue;
          }

          const s = shade[i];
          const p = t * 16 + (s >> 4);
          let r = PR[p], g = PG[p], b = PB[p], a = ALPHA[t];
          let gl = EMIT[t];
          const mode = MODE[t];
          const liq = mode === R.LIQUID || mode === R.LAVA || mode === R.MOLTEN ||
            (mode === R.PERIODIC && T >= MP[t] && T < BP[t]);
          const dep = depth[x] = liq ? depth[x] + 1 : 0;

          switch (mode) {
            case R.WALL: {
              if ((x & 7) === 0 || (y & 7) === 0) { r += 9; g += 10; b += 12; }
              break;
            }
            case R.METAL: {
              const q = t * 16 + ((((x * 3 + y) >> 1) ^ (s >> 6)) & 15);
              r = PR[q]; g = PG[q]; b = PB[q];
              if ((x + y * 2 + (tick >> 4)) % 23 === 0) { r += 18; g += 18; b += 20; }
              break;
            }
            case R.WOOD: {
              const q = t * 16 + (((y * 3 + (x >> 3) + (s >> 6)) & 15));
              r = PR[q]; g = PG[q]; b = PB[q];
              break;
            }
            case R.CONCRETE: {
              // poured smooth: only a faint, slow mottle, no grain
              const m = SINE[(x * 3 + y * 5) & 255] * 1.6 + SINE[(x * 2 - y * 3 + 96) & 255] * 1.4;
              r = PR[t * 16] + m; g = PG[t * 16] + m; b = PB[t * 16] + m;
              break;
            }
            case R.LIMESTONE: {
              const hang = data[i];
              if (hang) {
                // a stalactite or stalagmite: pale calcite, wet and glinting at its tip
                r = 238 - hang * 3; g = 230 - hang * 3; b = 212 - hang * 3;
                if (type[i + SW] === 0 || type[i - SW] === 0) { r += 12; g += 14; b += 18; }
                if ((hash(i + (tick >> 3)) & 31) === 0) { r = 252; g = 252; b = 248; }
                break;
              }
              // beds of rock in gently wavy layers, sharp joints across them, and fossil shells
              const yy = y + SINE[(x * 5) & 255] * 1.6 + 64, bed = (yy / 3) | 0, bh = hash(bed * 7919);
              const tone = (bh & 31) - 15, grain = (s & 7) - 3; // each bed its own shade, with little grain
              r = PR[t * 16] + tone + grain; g = PG[t * 16] + tone + grain; b = PB[t * 16] + tone * 0.8 + grain;
              if (yy - bed * 3 < 0.55 && (bh & 3) === 0) { r -= 28; g -= 28; b -= 26; } // a bedding plane
              if ((x + (bh >> 5)) % 17 === 0) { r -= 24; g -= 24; b -= 22; } // a joint
              if ((hash(i * 13) & 127) === 0) { r += 24; g += 22; b += 16; } // a shell
              break;
            }
            // ── machines ──
            case R.WIRE: {
              if ((x + y) & 1) { r -= 12; g -= 8; b -= 5; } // twisted copper
              break;
            }
            case R.SWITCH: {
              const on = aux[i] !== 0, f = 0.55; // a lamp in it: green while on, red while off
              r = r * (1 - f) + (on ? 80 : 215) * f; g = g * (1 - f) + (on ? 214 : 74) * f; b = b * (1 - f) + (on ? 120 : 64) * f;
              if (on) gl = 0.25;
              break;
            }
            case R.SENSOR: {
              const lit = aux[i] & 1, f = lit ? 0.7 : 0.35; // amber while it is set off, a dim teal while it waits
              r = r * (1 - f) + (lit ? 255 : 70) * f; g = g * (1 - f) + (lit ? 186 : 160) * f; b = b * (1 - f) + (lit ? 74 : 150) * f;
              if (lit) gl = 0.55;
              break;
            }
            case R.PIPE: {
              // a pipe's bore is dark and hollow inside its walls; a valve is brass, shining while open
              if (t === ID.PIPE) { r = 30 + (s & 7); g = 35 + (s & 7); b = 42 + (s & 7); }
              else if (sap[i] > 0) { r += 26; g += 22; b += 10; }
              if (aux[i]) { // what is flowing through it shows through
                const q = aux[i] * 16 + (s >> 4), f = t === ID.PIPE ? 0.82 : 0.58;
                r = r * (1 - f) + PR[q] * f; g = g * (1 - f) + PG[q] * f; b = b * (1 - f) + PB[q] * f;
              }
              break;
            }
            case R.CASING: {
              // the pipe's walls: brushed steel, lit along the side that faces out
              const outer = type[i - SW] === 0 || type[i - 1] === 0;
              if (outer) { r += 22; g += 22; b += 24; }
              if (((x + y) & 3) === 0) { r -= 8; g -= 8; b -= 8; }
              break;
            }
            case R.PUMP: {
              if (aux[i]) { const q = aux[i] * 16 + (s >> 4); r = r * 0.5 + PR[q] * 0.5; g = g * 0.5 + PG[q] * 0.5; b = b * 0.5 + PB[q] * 0.5; }
              if (sap[i] > 0 && ((x + y + (tick >> 1)) & 3) === 0) { r += 46; g += 52; b += 60; gl = 0.15; } // whirring
              break;
            }
            case R.TANK: {
              if (aux[i] && data[i] > 0) { // filled to its level with what it holds
                const q = aux[i] * 16 + (s >> 4), f = 0.25 + 0.6 * Math.min(1, data[i] / TANK_CAP);
                r = r * (1 - f) + PR[q] * f; g = g * (1 - f) + PG[q] * f; b = b * (1 - f) + PB[q] * f;
              }
              if ((x & 3) === 0) { r -= 10; g -= 10; b -= 10; } // riveted plates
              break;
            }
            case R.PISTON: {
              if (sap[i] > 0) { r += 30; g += 26; b += 10; gl = 0.12; }
              if (aux[i] & 4) { // sticky: its front face is coated in green glue
                const q = aux[i] & 3;
                if (type[i + (q === 0 ? -SW : q === 1 ? 1 : q === 2 ? SW : -1)] !== t) { r = r * 0.4 + 96 * 0.6; g = g * 0.4 + 190 * 0.6; b = b * 0.4 + 84 * 0.6; }
              }
              break;
            }
            case R.ROD: {
              if (((x + y) & 3) === 0) { r += 20; g += 20; b += 22; } // polished
              if (aux[i] & 1) { r = r * 0.4 + 96 * 0.6; g = g * 0.4 + 190 * 0.6; b = b * 0.4 + 84 * 0.6; } // a sticky piston's glued tip
              break;
            }
            case R.THRUSTER: {
              // ribbed steel; firing, it glows, white-hot at the nozzle end (the side it doesn't push)
              if ((((aux[i] & 1) ? x : y) & 1) === 0) { r -= 10; g -= 10; b -= 8; }
              if (aux[i] & 4) {
                const q = aux[i] & 3, nozzle = type[i + (q === 0 ? SW : q === 1 ? -1 : q === 2 ? -SW : 1)] !== t;
                const f = nozzle ? 0.85 : 0.3;
                r = r * (1 - f) + 255 * f; g = g * (1 - f) + (nozzle ? 214 : 150) * f; b = b * (1 - f) + (nozzle ? 150 : 70) * f;
                gl = nozzle ? 0.9 : 0.3;
              }
              break;
            }
            case R.LEGS: {
              if ((((x + y) >> 1) & 1) === 0) { r = r * 0.45 + 230 * 0.55; g = g * 0.45 + 190 * 0.55; b = b * 0.45 + 40 * 0.55; } // hazard stripes
              break;
            }
            case R.CELL: {
              // a living cell: a soft green blob that pulses
              const ph = SINE[(s + tick * 3) & 255];
              r += ph * 14; g += ph * 18; b += ph * 12;
              a = 225; gl = 0.12;
              break;
            }
            case R.BRICK: {
              const row = (y / 3) | 0;
              if (y % 3 === 0 || (x + (row & 1) * 3) % 6 === 0) { r = 120; g = 104; b = 92; }
              break;
            }
            case R.LIQUID: {
              // light fades with depth (reds first, blues last); shallow water is see-through
              const dk = Math.min(0.62, (dep - 1) * 0.018);
              r *= 1 - dk; g *= 1 - dk * 0.75; b *= 1 - dk * 0.5;
              if (WATERY[t]) a = Math.min(240, 120 + dep * 10);
              if (dep === 1 && type[i - SW] === 0) { r += 42; g += 44; b += 40; if (a < 230) a = 230; }
              else if (dep < 16 && (hash(x * 7 + (tick >> 2) + dep * 131) & 63) === 0) { r += 24; g += 28; b += 26; } // caustics
              if (aux[i] && (t === ID.WATER || t === ID.SALTWATER)) {
                // Cherenkov light: the eerie blue glow of a reactor pool, where neutrons and radiation pass
                const e = Math.min(1, aux[i] / 30);
                r = r * (1 - e) + 70 * e; g = g * (1 - e) + 130 * e; b = b * (1 - e) + 255 * e;
                a = Math.max(a, 220); if (gl < e * 0.85) gl = e * 0.85;
              }
              if (t === ID.OIL && dep === 1) { // thin-film rainbow on the very surface of oil
                const h = ((x * 9 + (tick >> 1)) & 255) * 3;
                r = r * 0.6 + RB[h] * 0.4; g = g * 0.6 + RB[h + 1] * 0.4; b = b * 0.6 + RB[h + 2] * 0.4;
              } else if (t === ID.ACID && (hash(s * 5 + (tick >> 1) + x * 3) & 127) === 0) {
                r = 220; g = 255; b = 170; gl = 0.6; // bubbles
              }
              break;
            }
            case R.GLASS: {
              // clear: almost nothing inside, a bright rim where it meets anything else, and glints
              const edge = type[i - SW] !== t || type[i + SW] !== t || type[i - 1] !== t || type[i + 1] !== t;
              // a pane is mostly seen through; only its faces catch a little light
              const face = type[i - SW] === 0 || type[i + SW] === 0 || type[i - 1] === 0 || type[i + 1] === 0;
              const tint = aux[i];
              if (tint && GLASSC.on[tint]) {
                // stained glass: the colour fills the pane, deeper inside than at the faces
                r = GLASSC.r[tint]; g = GLASSC.g[tint]; b = GLASSC.b[tint];
                a = face ? 200 : edge ? 180 : 160;
                if (tint === URANIUM) { // uranium glass: a faint green glow, bright when radiation hits it
                  const e = Math.min(1, data[i] / 60);
                  r = (r * (1 - e) + 170 * e) | 0; g = (g * (1 - e) + 255 * e) | 0; b = (b * (1 - e) + 110 * e) | 0;
                  gl = 0.14 + e * 0.8; a = 210 + ((e * 45) | 0);
                }
              } else if (face) { r = 214; g = 238; b = 246; a = 58; } else if (edge) { r = 214; g = 238; b = 246; a = 34; } else a = 10;
              if ((x - y + 1024) % 9 === 0 && (hash(x * 31 + y) & 3)) { r = 255; g = 255; b = 255; a += 46; }
              break;
            }
            case R.ICE: {
              const edge = type[i - SW] !== t || type[i - 1] !== t || type[i + 1] !== t;
              if (edge) { r += 26; g += 22; b += 12; a = 230; }
              if ((hash(((x + (y >> 1)) * 13) ^ (y * 7)) & 31) === 0) { r = 246; g = 252; b = 255; a = 240; } // cracks
              break;
            }
            case R.SPARKLE: {
              if ((hash(s * 7 + (tick >> 2) + x) & 255) === 0) { r = 255; g = 255; b = 255; gl = 0.3; }
              break;
            }
            case R.CLOUD: {
              // lit from above, shadowed underneath, soft at the edges
              const up = type[i - SW], dn = type[i + SW];
              if (!IS_CLOUD[up]) { r += 16; g += 16; b += 16; }
              if (dn === 0) { r *= 0.8; g *= 0.8; b *= 0.84; }
              a = ALPHA[t] - (hash(s + (tick >> 5)) & 31);
              if (up === 0 || dn === 0 || type[i - 1] === 0 || type[i + 1] === 0) a *= 0.7;
              if (t === ID.STORMCLOUD && hash(i * 3 + (tick >> 2)) % 6000 === 0) { r = 228; g = 234; b = 255; gl = 0.8; }
              break;
            }
            case R.FOG: {
              a = ALPHA[t] * 255 / 255 + (hash(s + (tick >> 4)) & 15) - 8;
              if (type[i - SW] === 0 || type[i + SW] === 0 || type[i - 1] === 0 || type[i + 1] === 0) a *= 0.65;
              break;
            }
            case R.FOAM: {
              const h = ((s + x * 11 + (tick >> 1)) & 255) * 3;
              r = r * 0.78 + RB[h] * 0.22; g = g * 0.78 + RB[h + 1] * 0.22; b = b * 0.78 + RB[h + 2] * 0.22;
              a = (hash(i) & 3) === 0 ? 220 : 150;
              break;
            }
            case R.CO2: {
              a = 10 + (hash(s + (tick >> 3)) & 15); // invisible, but for a faint shimmer
              break;
            }
            case R.FIRE: {
              const life = data[i];
              let k = (life * 1.5 + ((hash(s + tick * 7) & 15) - 6)) | 0;
              k = clamp(k, 0, 63);
              r = FIRE[k * 3]; g = FIRE[k * 3 + 1]; b = FIRE[k * 3 + 2];
              const fc = aux[i];
              if (fc === RAINBOW) { r = (r * 0.18 + rbw[0] * 0.82) | 0; g = (g * 0.18 + rbw[1] * 0.82) | 0; b = (b * 0.18 + rbw[2] * 0.82) | 0; }
              else if (fc && FLAMEC.on[fc]) { // flame test: the burning element tints its fire
                r = (r * 0.18 + FLAMEC.r[fc] * 0.82) | 0; g = (g * 0.18 + FLAMEC.g[fc] * 0.82) | 0; b = (b * 0.18 + FLAMEC.b[fc] * 0.82) | 0;
              }
              a = clamp(120 + life * 6, 120, 255);
              gl = 0.6 + k / 160;
              break;
            }
            case R.EMBER: {
              const k = clamp(26 + (hash(s * 3 + (tick >> 1)) & 31) + (data[i] >> 4), 0, 63);
              r = FIRE[k * 3]; g = FIRE[k * 3 + 1]; b = FIRE[k * 3 + 2];
              gl = 0.9;
              break;
            }
            case R.LAVA: {
              const ph = ((s >> 2) + ((tick + x * 2 + y * 3) >> 2)) & 63;
              const k = ph < 32 ? ph * 2 : (63 - ph) * 2;
              r = LAVA[k * 3]; g = LAVA[k * 3 + 1]; b = LAVA[k * 3 + 2];
              // cooling lava darkens toward its crust
              if (T < 1150) {
                const f = clamp((1150 - T) / 300, 0, 0.75);
                r = (r * (1 - f) + 70 * f) | 0; g = (g * (1 - f) + 40 * f) | 0; b = (b * (1 - f) + 34 * f) | 0;
                gl *= 1 - f;
              }
              gl *= 0.6 + k / 160;
              break;
            }
            case R.MOLTEN: {
              if (t === ID.MGLASS) {
                // glowing jelly: translucent, honey-bright when hot, deep red near setting, glossy skin
                const f = clamp((T - 800) / 900, 0, 1);
                const k = (f * 63) | 0;
                r = MGLASS_T[k * 3]; g = MGLASS_T[k * 3 + 1]; b = MGLASS_T[k * 3 + 2];
                // brighter, thinner skin; deeper inside the colour thickens toward amber
                const dk = Math.min(0.3, dep * 0.02);
                r *= 1 - dk * 0.3; g *= 1 - dk; b *= 1 - dk * 1.2;
                a = 210;
                if (type[i - SW] !== t) { r += 30; g += 30; b += 26; a = 228; }
                gl = 0.3 + f * 0.55;
                const tint = aux[i];
                if (tint && GLASSC.on[tint]) { // its stain shows through the glow as it cools
                  const m = clamp((1500 - T) / 700, 0.3, 0.75);
                  r = r * (1 - m) + GLASSC.r[tint] * m; g = g * (1 - m) + GLASSC.g[tint] * m; b = b * (1 - m) + GLASSC.b[tint] * m;
                }
              } else {
                const ph = ((s >> 2) + ((tick + x * 3 + y * 2) >> 3)) & 63;
                const k = ph < 32 ? ph * 2 : (63 - ph) * 2;
                r = MMETAL[k * 3]; g = MMETAL[k * 3 + 1]; b = MMETAL[k * 3 + 2];
                if (type[i - SW] === 0) { r += 20; g += 20; b += 20; }
              }
              break;
            }
            case R.SMOKE: {
              a = clamp(data[i] * 1.6, 0, 165) | 0;
              if (aux[i] === 1) { r = 192 + (s & 15); g = r - 3; b = r - 8; a = clamp(a + 20, 0, 185); } // white powder smoke
              break;
            }
            case R.GAS: {
              a = clamp(a + (s & 31) - 16, 20, 255);
              break;
            }
            case R.PLANT: {
              if (flags[i] & LEAF) {
                const lc = LEAF_RGB[aux[i]];
                if (lc) { const j = 0.88 + (s & 31) / 130; r = lc[0] * j; g = lc[1] * j; b = lc[2] * j; } // pine, palm or willow
                else { r += 26; g += 40; b += 10; }
              }
              break;
            }
            case R.GRASS: {
              // blade tips catch the light; each column of blades is its own shade
              const hx = hash(x * 13) & 31;
              r += hx - 12; g += (hx >> 1) - 6;
              if (type[i - SW] !== t) { r += 30; g += 34; b += 6; }
              break;
            }
            case R.CACTUS: {
              if ((x & 1) === 0) { r -= 10; g -= 14; b -= 8; } // ribs
              if ((hash(x * 31 + y * 17) & 15) === 0) { r = 236; g = 228; b = 190; } // spines
              break;
            }
            case R.VINE: {
              if (flags[i] & LEAF) { r += 22; g += 36; b += 8; } else { r -= 8; g -= 10; b -= 6; }
              break;
            }
            case R.MUSHROOM: {
              if (flags[i] & LEAF) {
                if (flags[i] & PETAL) { r = 140 + (s & 15); g = 92 + (s & 7); b = 56; } // brown cap
                else if ((hash(x * 7 + y * 13) & 7) === 0) { r = 244; g = 236; b = 220; } // white spots on red
                if (type[i + SW] !== t) { r = (r * 0.7) | 0; g = (g * 0.7) | 0; b = (b * 0.7) | 0; } // gills underneath
              } else { r = 226 + (s & 15); g = 214 + (s & 7); b = 186; } // the stem
              break;
            }
            case R.LILY: {
              if (flags[i] & LEAF) { r += 14; g += 26; b += 6; if (type[i - 1] !== t || type[i + 1] !== t) { r -= 18; g -= 22; b -= 10; } }
              else { r -= 14; g -= 18; b -= 8; a = 220; } // the stem, seen through the water
              break;
            }
            case R.FLOWER: {
              if (flags[i] & BLEACH) { r = 242 + (s & 7); g = 240 + (s & 7); b = 234; } // bleached by chlorine
              else if (flags[i] & CENTER) { r = 255; g = 210; b = 70; }
              else { const h = aux[i]; r = FLR[h]; g = FLG[h]; b = FLB[h]; }
              break;
            }
            case R.FIREFLY: {
              const ph = (tick + s * 7) % 150;
              if (ph < 32) { r = 255; g = 243; b = 138; gl = ph < 4 || ph > 27 ? 0.5 : 1; }
              else { r = 64; g = 66; b = 30; gl = 0; }
              break;
            }
            case R.PLASMA: {
              const k = hash(s + tick * 13) & 15;
              r = PLASMA[k * 3]; g = PLASMA[k * 3 + 1]; b = PLASMA[k * 3 + 2];
              gl = 1;
              break;
            }
            case R.SPARK: {
              if (hash(s + tick) & 1) { r = 255; g = 252; b = 214; } else { r = 190; g = 236; b = 255; }
              gl = 1;
              break;
            }
            case R.DIAMOND: {
              // brilliant: bright and icy, splitting light into colour, flashing as it catches the light
              const h = ((s + x * 5 + y * 3 + (tick >> 1)) & 255) * 3;
              r = r * 0.62 + RB[h] * 0.38; g = g * 0.62 + RB[h + 1] * 0.38; b = b * 0.62 + RB[h + 2] * 0.38;
              a = 215;
              const ph = (s * 13 + tick) % 70;
              if (ph < 3) { r = 255; g = 255; b = 255; gl = 0.9; a = 255; }
              else gl = 0.12;
              break;
            }
            case R.CLONE: {
              const ct = aux[i];
              const pulse = 0.5 + 0.5 * Math.sin((tick + x + y) * 0.08);
              if (ct) {
                const q = ct * 16 + (s >> 4);
                r = (r * 0.45 + PR[q] * 0.55) | 0; g = (g * 0.45 + PG[q] * 0.55) | 0; b = (b * 0.45 + PB[q] * 0.55) | 0;
              }
              r = (r * (0.8 + pulse * 0.25)) | 0; g = (g * (0.8 + pulse * 0.25)) | 0; b = (b * (0.8 + pulse * 0.25)) | 0;
              gl = 0.12 * pulse;
              break;
            }
            case R.VOID: {
              if (hash(i + (tick >> 3) * 977) % 97 === 0) { r = 170; g = 110; b = 255; gl = 0.5; }
              break;
            }
            case R.BATTERY: {
              if (((x + y) >> 1) & 1) { r = 42; g = 42; b = 46; }
              break;
            }
            case R.PERIODIC: {
              if (T >= BP[t]) { // gas
                if (GASC.on[t]) { r = GASC.r[t]; g = GASC.g[t]; b = GASC.b[t]; a = 110 + (s & 47); }
                else a = 26 + (s & 15); // colourless gases are barely there — until current lights them
              } else if (T >= MP[t]) { // liquid
                if (LIQC.on[t]) { const j = 0.92 + (s & 15) / 100; r = LIQC.r[t] * j; g = LIQC.g[t] * j; b = LIQC.b[t] * j; }
                const dk = Math.min(0.4, (dep - 1) * 0.02);
                r *= 1 - dk; g *= 1 - dk; b *= 1 - dk;
                if (type[i - SW] === 0) { r += 30; g += 30; b += 30; }
                else if (((s + (tick >> 3)) & 31) === 0) { r += 14; g += 14; b += 14; }
              } else if (METALLIC[t] && (x + y * 2 + (tick >> 4)) % 19 === 0) { r += 20; g += 20; b += 22; } // metallic glint
              if (t === HG && aux[i]) { r = r * 0.7 + 70; g = g * 0.7 + 52; b *= 0.62; } // amalgam: mercury holding gold
              if (t === THORIUM && T > 600 && T < MP[t]) { // a gas mantle: thorium in a flame glows brilliant white
                const e = Math.min(1, (T - 600) / 400);
                r = r * (1 - e) + 255 * e; g = g * (1 - e) + 252 * e; b = b * (1 - e) + 236 * e;
                a = 255; if (gl < e) gl = e;
              }
              if (CAPAC[t] && aux[i]) { // a capacitor filling with charge glows bluer until it fires
                const e = aux[i] / 12;
                r = r * (1 - e * 0.5) + 120 * e * 0.5; g = g * (1 - e * 0.5) + 200 * e * 0.5; b = b * (1 - e * 0.5) + 255 * e * 0.5;
                if (gl < e * 0.4) gl = e * 0.4;
              }
              if (GLOWC.on[t]) {
                r = (r * 0.5 + GLOWC.r[t] * 0.5) | 0; g = (g * 0.5 + GLOWC.g[t] * 0.5) | 0; b = (b * 0.5 + GLOWC.b[t] * 0.5) | 0;
                gl = EMIT[t] * (0.75 + ((hash(s + (tick >> 2)) & 15) / 60));
              }
              break;
            }
            case R.HUMAN: {
              const q = t * 16 + ((aux[i] >> 1) & 15);
              r = PR[q]; g = PG[q]; b = PB[q];
              break;
            }
            case R.BIRD: {
              if (((tick + s) >> 3) & 1) { r += 22; g += 20; b += 18; }
              break;
            }
            case R.MSPARK: {
              // a spark of burning metal: the metal's own colour (iron orange, titanium white), flickering
              const src = aux[i];
              if (SPARKC.on[src]) { r = SPARKC.r[src]; g = SPARKC.g[src]; b = SPARKC.b[src]; }
              if (hash(s + tick * 5) & 1) { r += 30; g += 30; b += 30; }
              a = 255; gl = 1;
              break;
            }
            case R.RAD: {
              if (aux[i]) { r = 210; g = 232; b = 255; } else { r = 125; g = 255; b = 106; }
              a = 150 + data[i] * 20;
              gl = 1;
              break;
            }
            case R.LIGHT: {
              // a ray: warm white, or the colour stained glass gave it
              const pc = col[i];
              if (pc) { r = (pc >> 16) & 255; g = (pc >> 8) & 255; b = pc & 255; r += (255 - r) * 0.25; g += (255 - g) * 0.25; b += (255 - b) * 0.25; }
              else { r = 255; g = 248; b = 214; }
              a = 255; gl = 1;
              break;
            }
          }

          // plants ripple in waves that run the way the wind blows, faster and stronger in a gale
          if (SWAYS[mode]) {
            const wv = AVX[(y >> 2) * AW + (x >> 2)] + breeze, sp = wv < 0 ? -wv : wv;
            const amp = 4 + (sp > 2 ? 2 : sp) * 11;
            const ph = (x * 22 - y * 6 - (wv < 0 ? -1 : 1) * tick * (2 + (sp > 2 ? 2 : sp) * 3)) & 255;
            const k = SINE[ph] * amp;
            r += k * 0.55; g += k; b += k * 0.3;
          }
          // rubble and scrap look like what they broke from: brick red, concrete grey, black obsidian, a
          // pump's blue, a battery's yellow and black
          if ((t === RUBBLE || t === SCRAP) && aux[i]) {
            const q = aux[i] * 16 + (s >> 4), j = 0.74 + (hash(i) & 15) / 60;
            r = PR[q] * j; g = PG[q] * j; b = PB[q] * j;
          }
          // a colour painted on: the paint's colour with the material's own grain showing through;
          // a picture's pixels exactly
          const pc = col[i];
          if (pc && mode !== R.LIGHT) {
            const cr = (pc >> 16) & 255, cg = (pc >> 8) & 255, cb = pc & 255;
            if (pc & EXACT) { r = cr; g = cg; b = cb; }
            else { const j = mode === R.CONCRETE ? 0.97 + (s & 3) / 100 : 0.84 + (s & 15) / 50; r = cr * j; g = cg * j; b = cb * j; } // painted concrete stays smooth
            if (a < 150) a = 170;
          }

          if (t === ID.OBSIDIAN && (x * 2 + y) % 13 === 0) { r += 46; g += 36; b += 58; } // glassy gloss
          // gas rising through a liquid shows as bubbles: hydrogen fizzing off zinc in acid or off
          // sodium in water, steam in a boiling pot
          if ((BUBBLY[t] || (mode === R.PERIODIC && T >= BP[t])) && (liquidAt(i - SW) || liquidAt(i + SW))) {
            r = 226 + (s & 15); g = 236 + (s & 15); b = 252; a = 235;
            if (gl < 0.15) gl = 0.15;
          }
          if (SAPPY[t] && sap[i] < 140) { // a thirsty plant yellows, then browns
            const f = (140 - sap[i]) / 140;
            r += (168 - r) * f; g += (128 - g) * f; b += (64 - b) * f;
          }

          // ── state overlays ──
          if (flags[i] & BURN) {
            // charring surface with glowing embers flickering across it
            const k = 28 + (hash(s * 31 + tick * 17) & 31);
            const ember = (hash(s * 7 + (tick >> 1)) & 3) !== 0;
            const f = ember ? 0.65 : 0.25;
            r = (r * 0.18 + 26 * (0.82 - f) + FIRE[k * 3] * f) | 0;
            g = (g * 0.18 + 18 * (0.82 - f) + FIRE[k * 3 + 1] * f) | 0;
            b = (b * 0.18 + 14 * (0.82 - f) + FIRE[k * 3 + 2] * f) | 0;
            if (gl < 0.7) gl = 0.7;
          } else if (T > (mode === R.SMOKE ? 950 : 480) && !SELF_LIT[mode] && !(t === THORIUM && T < MP[t])) {
            // things glow red-hot past 480°C; smoke only glows like a flame does, far hotter
            const t0 = mode === R.SMOKE ? 950 : 480;
            const k = clamp(((T - t0) / 1800) * 63, 0, 63) | 0;
            const f = clamp((T - t0) / 700, 0, 0.88);
            r = (r * (1 - f) + HEAT[k * 3] * f) | 0; g = (g * (1 - f) + HEAT[k * 3 + 1] * f) | 0; b = (b * (1 - f) + HEAT[k * 3 + 2] * f) | 0;
            if (a < 255 && f > 0.3) a = 255;
            if (gl < f * 0.8) gl = f * 0.8;
          } else if (T < -12 && mode !== R.GAS) {
            const f = clamp((-12 - T) / 140, 0, 0.4);
            r = (r * (1 - f) + 200 * f) | 0; g = (g * (1 - f) + 232 * f) | 0; b = (b * (1 - f) + 255 * f) | 0;
          }

          const c = charge[i];
          if (PHOSC.on[t] && (c || aux[i])) {
            // a phosphor lit by current or radiation: europium red, terbium green, thulium blue…
            const e = c ? 1 : Math.min(1, (aux[i] * 1.6) / PHOSLEN[t]);
            r = (r * (1 - e) + PHOSC.r[t] * e) | 0; g = (g * (1 - e) + PHOSC.g[t] * e) | 0; b = (b * (1 - e) + PHOSC.b[t] * e) | 0;
            a = 255;
            if (gl < e) gl = e;
          } else if (c && DISC.on[t] && (MODE[t] !== R.PERIODIC || T >= BP[t])) {
            // gas discharge: neon red, argon violet, xenon blue…
            const e = c >= 7 ? 1 : c / 9;
            r = DISC.r[t]; g = DISC.g[t]; b = DISC.b[t]; a = 255;
            if (gl < e) gl = e;
          } else if (c) {
            const e = c >= 7 ? 1 : c / 9;
            const f = 0.35 + 0.6 * e;
            r = (r * (1 - f) + 200 * f) | 0; g = (g * (1 - f) + 240 * f) | 0; b = (b * (1 - f) + 255 * f) | 0;
            if (gl < e) gl = e;
          }

          if (r > 255) r = 255; if (g > 255) g = 255; if (b > 255) b = 255;
          out[o] = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
          if (gl > 0.02) {
            glow[o] = ((255 << 24) | (((b * gl) | 0) << 16) | (((g * gl) | 0) << 8) | ((r * gl) | 0)) >>> 0;
          } else glow[o] = 0;
        }
      }
    }

    function draw(tick, opts) {
      if (!world) return;
      const air = !!opts.air;
      paintCells(tick, opts.thermal && !air);
      wctx.putImageData(img, 0, 0);
      gctx.putImageData(gimg, 0, 0);

      // bloom: tight halo + wide soft light, both cheap because they blur tiny canvases
      b1ctx.clearRect(0, 0, b1.width, b1.height);
      b2ctx.clearRect(0, 0, b2.width, b2.height);
      b1ctx.imageSmoothingEnabled = true;
      b2ctx.imageSmoothingEnabled = true;
      if (hasFilter) b1ctx.filter = 'blur(1px)';
      b1ctx.drawImage(gc, 0, 0, b1.width, b1.height);
      if (hasFilter) b1ctx.filter = 'none';
      if (hasFilter) b2ctx.filter = 'blur(1.5px)';
      b2ctx.drawImage(gc, 0, 0, b2.width, b2.height);
      if (hasFilter) b2ctx.filter = 'none';

      const { ox, oy, s } = view;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.drawImage(bg, 0, 0);

      let sx = 0, sy = 0;
      if (shakeAmt > 0.2 && !opts.reducedMotion) {
        sx = (Math.random() - 0.5) * shakeAmt * dpr;
        sy = (Math.random() - 0.5) * shakeAmt * dpr;
      }
      shakeAmt *= 0.86;

      drawVessel(sx, sy, opts.weather, opts.sky);
      if (opts.disasters) for (const d of opts.disasters) if (d.kind === 'solar') drawAurora(d, tick, sx, sy);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(wc, ox + sx, oy + sy, W * s, H * s);

      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(b1, ox + sx, oy + sy, W * s, H * s);
      ctx.globalAlpha = 0.75;
      ctx.drawImage(b2, ox + sx - s * 2, oy + sy - s * 2, W * s + s * 4, H * s + s * 4);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      drawBlasts(sx, sy, opts.reducedMotion ? 0.45 : 1);
      drawSparks(sx, sy, opts.reducedMotion ? 0.5 : 1);
      if (opts.disasters && opts.disasters.length) drawDisasters(opts.disasters, tick, sx, sy);

      if (flashAmt > 0.01) {
        ctx.fillStyle = `rgba(225,235,255,${flashAmt * 0.35})`;
        ctx.fillRect(ox, oy, W * s, H * s);
        flashAmt *= 0.8;
      }
      if (glareAmt > 0.01) { // a hydrogen bomb's light whites out the whole view, then fades
        ctx.fillStyle = `rgba(255,250,236,${Math.min(1, glareAmt) * (opts.reducedMotion ? 0.5 : 1)})`;
        ctx.fillRect(0, 0, cw, ch);
        glareAmt *= 0.96;
      }

      if (air) drawAir(sx, sy);
      else if (!opts.thermal) drawCreatures(tick, sx, sy);
      drawRings();
      if (opts.floodLine != null) drawFloodLine(opts.floodLine, tick, sx, sy);
      if (opts.lens && brush.visible) drawLens();
      drawBrush();
    }
    // the tsunami's quest: a dashed line across the map at the height the water has to reach
    function drawFloodLine(row, tick, sx, sy) {
      const { ox, oy, s } = view, y = oy + sy + row * s;
      ctx.save();
      ctx.strokeStyle = `rgba(110, 190, 255, ${0.65 + 0.25 * Math.sin(tick / 9)})`;
      ctx.lineWidth = Math.max(1.5, 1.5 * dpr);
      ctx.setLineDash([10 * dpr, 7 * dpr]);
      ctx.lineDashOffset = -tick * 0.6;
      ctx.beginPath(); ctx.moveTo(ox + sx, y); ctx.lineTo(ox + sx + W * s, y); ctx.stroke();
      ctx.restore();
    }

    // A flash for each blast: a white-hot core in the blast's own colour that swells and fades
    // in a third of a second. A chain of blasts in one place keeps one flash going.
    const blasts = [];
    const BLAST_MS = 320;
    function blast(x, y, r, kind) {
      const now = performance.now();
      for (const b of blasts) {
        if (b.kind === kind && Math.abs(b.x - x) <= b.r && Math.abs(b.y - y) <= b.r) {
          b.t0 = now; b.r = Math.min(b.r0 * 3, b.r + r * 0.15);
          return;
        }
      }
      if (blasts.length >= 32) blasts.shift();
      blasts.push({ x, y, r, r0: r, kind, t0: now });
    }
    function drawBlasts(sx, sy, dim) {
      if (!blasts.length) return;
      const now = performance.now(), s = view.s;
      ctx.globalCompositeOperation = 'lighter';
      for (let k = blasts.length - 1; k >= 0; k--) {
        const b = blasts[k], age = (now - b.t0) / BLAST_MS;
        if (age >= 1) { blasts.splice(k, 1); continue; }
        const c = b.kind === RAINBOW ? rainbowAt(frameTick).join(',') : BLAST_RGB[b.kind], a = (1 - age) * (1 - age) * BLAST_GLOW[b.kind] * dim;
        const px = view.ox + sx + (b.x + 0.5) * s, py = view.oy + sy + (b.y + 0.5) * s;
        const R = b.r * (2 + age * 2.4) * s;
        const g = ctx.createRadialGradient(px, py, 0, px, py, R);
        g.addColorStop(0, `rgba(255,255,255,${a})`);
        g.addColorStop(0.16, `rgba(${c},${a * 0.95})`);
        g.addColorStop(0.5, `rgba(${c},${a * 0.32})`);
        g.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // A small burst of light where a contact reaction happened (zinc fizzing in acid, gold going
    // into mercury, sodium burning in chlorine), in the reacting element's colour. It is sized in
    // screen pixels, not cells, so a single grain reacting still shows on a zoomed-out map.
    const sparks = [];
    const SPARK_MS = 520;
    function sparkle(x, y, t) {
      const now = performance.now();
      for (const p of sparks) { // reactions side by side share one burst, which brightens
        if (p.t === t && Math.abs(p.x - x) <= 2 && Math.abs(p.y - y) <= 2) { p.t0 = now; p.n = Math.min(3, p.n + 0.4); return; }
      }
      if (sparks.length >= 90) sparks.shift();
      sparks.push({ x, y, t, n: 1, t0: now });
    }
    function drawSparks(sx, sy, dim) {
      if (!sparks.length) return;
      const now = performance.now(), s = view.s;
      ctx.globalCompositeOperation = 'lighter';
      for (let k = sparks.length - 1; k >= 0; k--) {
        const p = sparks[k], age = (now - p.t0) / SPARK_MS;
        if (age >= 1) { sparks.splice(k, 1); continue; }
        const c = SPARK_RGB[p.t], a = (1 - age) * dim * Math.min(1, 0.55 + p.n * 0.25);
        const px = view.ox + sx + (p.x + 0.5) * s, py = view.oy + sy + (p.y + 0.5) * s;
        const R = Math.max(s * 2.5, (5 + p.n * 2) * dpr) * (0.7 + age * 0.6);
        const g = ctx.createRadialGradient(px, py, 0, px, py, R);
        g.addColorStop(0, `rgba(255,255,255,${a})`);
        g.addColorStop(0.25, `rgba(${c},${a * 0.9})`);
        g.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // A tornado as you would see it, over the cells and see-through enough to show the debris whirling
    // in it: a funnel of cloud hanging from the storm, narrowing to the ground, bending back from the way
    // it is going and swaying, with bands of cloud winding round it as it turns, a dark wall cloud where
    // it leaves the storm, and a whirl of dust and debris round its foot (spray, over water). The funnel
    // is drawn a little narrower than the winds it stands for (sim.js tornado()).
    function drawTornado(d, env, tick, X, Y) {
      const s = view.s, top = d.top, gy = d.gy, tall = gy - top;
      if (tall < 4) return;
      const lean = d.vx || 0, x0 = d.fx === undefined ? d.x : d.fx;
      const axis = (h) => x0 - lean * h * 0.7 + Math.sin(tick * 0.04 + h * 0.07) * (1 + h * 0.04);
      // a narrow rope low down that flares like a trumpet into the cloud
      const half = (h) => { const f = h / tall; return d.b * 0.6 + h * d.slope * 0.4 + f * f * f * f * tall * 0.16; };
      const n = 32, yAt = (k) => top + (tall * k) / n;
      // the funnel: dark where it leaves the cloud, paler and thinner toward the ground
      const g = ctx.createLinearGradient(0, Y(top), 0, Y(gy));
      g.addColorStop(0, `rgba(56,60,68,${0.92 * env})`);
      g.addColorStop(0.55, `rgba(118,122,128,${0.78 * env})`);
      g.addColorStop(1, `rgba(150,142,128,${0.5 * env})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      for (let k = 0; k <= n; k++) { const y = yAt(k), h = gy - y; ctx.lineTo(X(axis(h) - half(h)), Y(y)); }
      for (let k = n; k >= 0; k--) { const y = yAt(k), h = gy - y; ctx.lineTo(X(axis(h) + half(h)), Y(y)); }
      ctx.closePath(); ctx.fill();
      // bands of cloud winding round it, only where they pass across its near side
      ctx.lineWidth = Math.max(1, s * 0.6);
      ctx.lineCap = 'round';
      for (let b = 0; b < 8; b++) {
        ctx.strokeStyle = b & 1 ? `rgba(206,210,216,${0.24 * env})` : `rgba(34,38,44,${0.3 * env})`;
        ctx.beginPath();
        let on = false;
        for (let k = 0; k <= n; k++) {
          const y = yAt(k), h = gy - y, th = tick * 0.13 + b * 0.8 + y * 0.09;
          if (Math.cos(th) < 0) { on = false; continue; }
          const x = X(axis(h) + half(h) * 0.92 * Math.sin(th));
          if (on) ctx.lineTo(x, Y(y)); else { ctx.moveTo(x, Y(y)); on = true; }
        }
        ctx.stroke();
      }
      // the wall cloud it hangs from, swallowing the top of the funnel
      const tx = axis(tall), tw = half(tall), tr = (tw * 1.6 + 10) * s;
      ctx.save(); // soft-edged, squashed flat: a radial gradient drawn into a scaled circle
      ctx.translate(X(tx), Y(top + 1));
      ctx.scale(1, 0.3);
      const wc = ctx.createRadialGradient(0, 0, 0, 0, 0, tr);
      wc.addColorStop(0, `rgba(36,40,48,${0.95 * env})`);
      wc.addColorStop((tw + 2) * s / tr, `rgba(40,44,52,${0.85 * env})`);
      wc.addColorStop(1, 'rgba(40,44,52,0)');
      ctx.fillStyle = wc;
      ctx.beginPath(); ctx.arc(0, 0, tr, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // the debris cloud round its foot: dust and bits whirling round and up, or spray over water
      const bx = axis(0), bw = d.b * 2.6 + 7, bh = d.b * 1.4 + 6, cy = gy - bh * 0.4;
      const gx = Math.max(0, Math.min(W - 1, Math.round(bx))), gyi = Math.max(0, Math.min(H - 1, Math.round(gy)));
      const wet = MODE[world.type[world.idx(gx, gyi)]] === R.LIQUID;
      const dust = wet ? '214,230,238' : '124,106,86';
      const dc = ctx.createRadialGradient(X(bx), Y(cy), 0, X(bx), Y(cy), bw * s);
      dc.addColorStop(0, `rgba(${dust},${0.8 * env})`);
      dc.addColorStop(0.55, `rgba(${dust},${0.5 * env})`);
      dc.addColorStop(1, `rgba(${dust},0)`);
      ctx.fillStyle = dc;
      ctx.beginPath(); ctx.ellipse(X(bx), Y(cy), bw * s, bh * s, 0, 0, Math.PI * 2); ctx.fill();
      const bit = Math.max(1, s * 0.8);
      for (let p = 0; p < 40; p++) {
        const ph = tick * 0.1 + p * 0.73, up = (tick * 0.5 + p * 7.3) % (bh * 3), r = bw * (0.35 + 0.065 * ((p * 37) % 10)) * (1 - up / (bh * 6));
        if (Math.sin(ph) < -0.2 && p & 1) continue; // some pass behind it
        ctx.fillStyle = wet ? `rgba(230,240,248,${0.7 * env})` : p % 3 ? `rgba(88,72,56,${0.85 * env})` : `rgba(58,62,56,${0.85 * env})`;
        ctx.fillRect(X(bx + Math.cos(ph) * r) - bit / 2, Y(gy - up) - bit / 2, bit, bit);
      }
    }

    // A solar storm's aurora: curtains of green light hanging in the sky, violet toward their tops,
    // rippling and shimmering. It is drawn behind the cells (it is high in the sky), and the sky dims a
    // little while it lasts so it shows by day too.
    let auroraStrip = null; // one column of the curtain's light, stretched into place
    function drawAurora(d, tick, sx, sy) {
      const { ox, oy, s } = view, env = Math.max(0, Math.min(1, (d.age + 1) / 60, (d.life - d.age) / 150));
      if (env <= 0) return;
      if (!auroraStrip) {
        auroraStrip = document.createElement('canvas');
        auroraStrip.width = 1; auroraStrip.height = 64;
        const c = auroraStrip.getContext('2d'), g = c.createLinearGradient(0, 64, 0, 0);
        g.addColorStop(0, 'rgba(120,255,170,0)');
        g.addColorStop(0.06, 'rgba(120,255,170,1)');
        g.addColorStop(0.35, 'rgba(70,230,170,0.75)');
        g.addColorStop(0.7, 'rgba(150,100,255,0.4)');
        g.addColorStop(1, 'rgba(200,90,255,0)');
        c.fillStyle = g; c.fillRect(0, 0, 1, 64);
      }
      const x0 = ox + sx, y0 = oy + sy;
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, y0, W * s, H * s); ctx.clip();
      ctx.fillStyle = `rgba(6,14,24,${0.35 * env})`;
      ctx.fillRect(x0, y0, W * s, H * s);
      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = true;
      for (let c = 0; c < 3; c++) {
        for (let x = 0; x < W; x += 2) {
          const base = H * (0.3 + c * 0.07) + Math.sin(x * 0.03 + tick * 0.012 + c * 2.1) * H * 0.05 + Math.sin(x * 0.09 - tick * 0.03 + c) * H * 0.015;
          const len = H * (0.16 + 0.08 * Math.sin(x * 0.045 + tick * 0.008 + c * 1.3));
          ctx.globalAlpha = env * (0.45 + 0.55 * Math.max(0, Math.sin(x * 0.12 + tick * 0.06 + c * 2.7))) * (0.55 - c * 0.12);
          ctx.drawImage(auroraStrip, x0 + x * s, y0 + (base - len) * s, 2 * s + 0.5, len * s);
        }
      }
      ctx.restore();
    }

    // What the cells alone can't show of a disaster from the Weapons tab: a black hole and its
    // glowing disc, a meteor's white-hot head, the edge of the frost, a tornado's funnel of cloud.
    function drawDisasters(list, tick, sx, sy) {
      const s = view.s;
      const X = (x) => view.ox + sx + (x + 0.5) * s, Y = (y) => view.oy + sy + (y + 0.5) * s;
      ctx.save();
      for (const d of list) {
        if (d.delay > 0) continue;
        const env = Math.max(0, Math.min(1, (d.age + 1) / 30, (d.life - d.age) / 40));
        if (d.kind === 'blackhole') {
          const px = X(d.x), py = Y(d.y), R = d.rh * s * 1.15;
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createRadialGradient(px, py, R * 0.9, px, py, R * 3.4);
          g.addColorStop(0, `rgba(255,222,170,${0.75 * env})`);
          g.addColorStop(0.35, `rgba(255,120,40,${0.38 * env})`);
          g.addColorStop(1, 'rgba(120,40,170,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(px, py, R * 3.4, 0, Math.PI * 2); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          // the disc, seen nearly edge-on, turning
          const spin = tick * 0.05;
          ctx.lineWidth = Math.max(1, s * 0.55);
          ctx.strokeStyle = `rgba(255,205,140,${0.65 * env})`;
          ctx.beginPath(); ctx.ellipse(px, py, R * 2.7, R * 0.72, -0.25, spin, spin + Math.PI * 1.6); ctx.stroke();
          ctx.fillStyle = '#000';
          ctx.beginPath(); ctx.arc(px, py, R * Math.max(0.2, env), 0, Math.PI * 2); ctx.fill();
          ctx.lineWidth = Math.max(1, dpr);
          ctx.strokeStyle = `rgba(255,240,215,${0.7 * env})`;
          ctx.beginPath(); ctx.arc(px, py, R * Math.max(0.2, env) + dpr, 0, Math.PI * 2); ctx.stroke();
        } else if (d.kind === 'hbomb' && (d.phase === 'fall' || d.phase === 'drift')) {
          // the bomb itself, nose down, swaying a little as it falls (d.py is where its nose is);
          // caught by a black hole, it turns its nose to the middle and shrinks as it spirals in
          const L = Math.max(18 * dpr, s * 9), w = L * 0.34;
          ctx.save();
          ctx.translate(X(d.px), Y(d.py));
          if (d.phase === 'drift') { ctx.rotate(d.rot); ctx.scale(d.scale, d.scale); }
          else ctx.rotate(Math.sin(d.age * 0.07) * 0.05);
          ctx.fillStyle = '#596150'; // the casing
          ctx.beginPath();
          ctx.moveTo(-w / 2, -L * 0.72);
          ctx.lineTo(-w / 2, -L * 0.3);
          ctx.quadraticCurveTo(-w / 2, 0, 0, 0);
          ctx.quadraticCurveTo(w / 2, 0, w / 2, -L * 0.3);
          ctx.lineTo(w / 2, -L * 0.72);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#3d4337'; // the tail and its fins
          ctx.beginPath();
          ctx.moveTo(-w * 0.42, -L * 0.72); ctx.lineTo(-w * 0.2, -L); ctx.lineTo(w * 0.2, -L); ctx.lineTo(w * 0.42, -L * 0.72);
          ctx.closePath(); ctx.fill();
          for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(side * w * 0.3, -L * 0.74); ctx.lineTo(side * w * 0.9, -L * 1.04); ctx.lineTo(side * w * 0.16, -L * 0.98);
            ctx.closePath(); ctx.fill();
          }
          ctx.fillStyle = '#d8b84a'; // a yellow band round it
          ctx.fillRect(-w / 2, -L * 0.62, w, L * 0.06);
          ctx.fillStyle = 'rgba(255,255,255,0.18)'; // light catching one side
          ctx.fillRect(-w * 0.32, -L * 0.7, w * 0.12, L * 0.56);
          ctx.restore();
        } else if (d.kind === 'meteor' && !d.hit && d.py > -8) {
          const px = X(d.px), py = Y(d.py), v = Math.hypot(d.vx, d.vy) || 1;
          const tx = -d.vx / v, ty = -d.vy / v, L = (10 + 8 * d.size) * s, hr = Math.max(2 * dpr, (1 + d.size) * s);
          ctx.globalCompositeOperation = 'lighter';
          const tg = ctx.createLinearGradient(px, py, px + tx * L, py + ty * L);
          tg.addColorStop(0, 'rgba(255,200,120,0.85)');
          tg.addColorStop(1, 'rgba(255,90,30,0)');
          ctx.strokeStyle = tg; ctx.lineCap = 'round'; ctx.lineWidth = hr * 1.5;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + tx * L, py + ty * L); ctx.stroke();
          const hg = ctx.createRadialGradient(px, py, 0, px, py, hr * 2.6);
          hg.addColorStop(0, 'rgba(255,255,255,1)');
          hg.addColorStop(0.35, 'rgba(255,214,140,0.9)');
          hg.addColorStop(1, 'rgba(255,110,40,0)');
          ctx.fillStyle = hg;
          ctx.beginPath(); ctx.arc(px, py, hr * 2.6, 0, Math.PI * 2); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        } else if (d.kind === 'tornado') {
          drawTornado(d, env, tick, X, Y);
        } else if (d.kind === 'freeze' && d.age < 90) {
          const a = 1 - d.age / 90;
          ctx.lineWidth = Math.max(1, s * 0.8);
          ctx.strokeStyle = `rgba(200,236,255,${0.55 * a})`;
          ctx.beginPath(); ctx.arc(X(d.x), Y(d.y), Math.max(1, d.rf) * s, 0, Math.PI * 2); ctx.stroke();
        }
      }
      ctx.restore();
    }

    // Air view: the scene dimmed under the air field, glowing red where the pressure is high and
    // blue where it is low, with pale streaks along the wind so its swirls show.
    const STREAK_A = [0.22, 0.45, 0.8];
    function drawAir(sx, sy) {
      const A = world.air, { ox, oy, s } = view;
      const n = A.W * A.H, P = A.p, VX = A.vx, VY = A.vy, BLK = A.blocked;
      for (let a = 0; a < n; a++) {
        if (BLK[a]) { aout[a] = 0xff000000; continue; }
        const p = P[a], v = Math.abs(VX[a]) + Math.abs(VY[a]);
        const f = Math.sqrt(p < 0 ? (p < -8 ? 1 : -p / 8) : p > 8 ? 1 : p / 8); // faint pressure still shows
        let r, g, b;
        if (p >= 0) { r = 255 * f; g = 64 * f; b = 36 * f; }
        else { r = 36 * f; g = 104 * f; b = 255 * f; }
        const q = (v > 3 ? 1 : v / 3) * 54; // moving air has a faint sheen of its own
        r += q; g += q; b += q * 1.15;
        aout[a] = ((255 << 24) | ((b > 255 ? 255 : b) << 16) | ((g > 255 ? 255 : g) << 8) | (r > 255 ? 255 : r)) >>> 0;
      }
      actx.putImageData(aimg, 0, 0);
      const x0 = ox + sx, y0 = oy + sy, cs = A.S * s;
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, y0, W * s, H * s); ctx.clip();
      ctx.fillStyle = 'rgba(4,7,10,0.64)';
      ctx.fillRect(x0, y0, W * s, H * s);
      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(ac, x0, y0, A.W * cs, A.H * cs);
      ctx.globalCompositeOperation = 'source-over';
      if (cs >= 5) {
        ctx.lineWidth = Math.max(1, dpr * 0.9);
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#e4eef6';
        for (let band = 0; band < 3; band++) {
          const lo = band === 0 ? 0.06 : band === 1 ? 0.4 : 1.5, hi = band === 0 ? 0.4 : band === 1 ? 1.5 : Infinity;
          ctx.globalAlpha = STREAK_A[band];
          ctx.beginPath();
          for (let a = 0; a < n; a++) {
            const vx = VX[a], vy = VY[a], v = Math.sqrt(vx * vx + vy * vy);
            if (v < lo || v >= hi) continue;
            const ax = a % A.W, ay = (a / A.W) | 0, len = (v > 2.5 ? 1 : v / 2.5) * cs * 0.95 + dpr;
            const cx = x0 + (ax + 0.5) * cs, cy = y0 + (ay + 0.5) * cs;
            ctx.moveTo(cx - (vx / v) * len * 0.5, cy - (vy / v) * len * 0.5);
            ctx.lineTo(cx + (vx / v) * len * 0.5, cy + (vy / v) * len * 0.5);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    // Little figures over the pixels, drawn twice the size of the two cells a person takes up so
    // they read at any zoom: a square head, a shirt, swinging arms and walking legs; in water, a
    // swimmer lying flat doing the crawl at the surface, and one who can't swim thrashing upright
    // with bubbles rising. Birds are flapping Vs; cows, wolves and sharks are drawn over their cell.
    function wetAt(j) { const u = world.type[j]; return MODE[u] === R.PERIODIC ? world.temp[j] >= MP[u] && world.temp[j] < BP[u] : LIQ[u] === 1; }
    function drawCreatures(tick, sx, sy) {
      const { SW, aux, flags, shade, type } = world;
      const { ox, oy, s } = view;
      if (s < 1) return;
      const u = s * 2; // a person is drawn at twice their cells' size
      const lw = Math.max(1, u * 0.2);
      ctx.lineCap = 'round';
      for (let k = 0; k < nPeople; k++) {
        const i = people[k];
        if (type[i] !== HUMAN) continue;
        const x = (i % SW) - 1, y = ((i / SW) | 0) - 1;
        const fx = ox + sx + (x + 0.5) * s, fy = oy + sy + (y + 1) * s; // the middle of their feet
        const burning = flags[i] & 1, face = aux[i] & 1 ? 1 : -1;
        const q = HUMAN * 16 + ((aux[i] >> 1) & 15);
        const hq = ELEM.ID.HEAD * 16 + (shade[i - SW] >> 4);
        const shirt = burning ? '#ff8a2a' : `rgb(${PR[q]},${PG[q]},${PB[q]})`;
        const skin = `rgb(${PR[hq]},${PG[hq]},${PB[hq]})`;
        ctx.strokeStyle = '#2a2622';
        ctx.lineWidth = lw;
        const wet = wetAt(i + SW) || wetAt(i - 1) || wetAt(i + 1);
        if (wet && !(aux[i] & SWIMS)) {
          // can't swim: upright, arms thrashing over their head, bubbles rising
          const ph = ((tick + x * 7) % 20) / 20 * Math.PI * 2, wave = Math.sin(ph) * u * 0.25;
          ctx.beginPath();
          ctx.moveTo(fx, fy - u * 0.55); ctx.lineTo(fx - u * 0.25, fy - wave * 0.4);
          ctx.moveTo(fx, fy - u * 0.55); ctx.lineTo(fx + u * 0.25, fy + wave * 0.4);
          ctx.stroke();
          ctx.fillStyle = shirt;
          ctx.fillRect(fx - u * 0.32, fy - u * 1.15, u * 0.64, u * 0.66);
          ctx.strokeStyle = skin;
          ctx.beginPath();
          ctx.moveTo(fx - u * 0.3, fy - u * 1.1); ctx.lineTo(fx - u * 0.55 + wave, fy - u * 2.1);
          ctx.moveTo(fx + u * 0.3, fy - u * 1.1); ctx.lineTo(fx + u * 0.55 - wave, fy - u * 2.1);
          ctx.stroke();
          ctx.fillStyle = skin;
          ctx.fillRect(fx - u * 0.36, fy - u * 1.9, u * 0.72, u * 0.72);
          ctx.fillStyle = 'rgba(230,244,255,0.8)';
          for (let q = 0; q < 2; q++) {
            const bp = ((tick + x * 13 + q * 17) % 34) / 34;
            ctx.fillRect(fx + (q ? 0.25 : -0.2) * u, fy - u * 2 - bp * u * 1.4, Math.max(1, s * 0.45), Math.max(1, s * 0.45));
          }
          continue;
        }
        if (wet) {
          // swimming: lying along the water line, arms turning over in a crawl, legs kicking
          const wy = fy + s * 0.15, ph = ((tick + x * 7) % 32) / 32 * Math.PI * 2, kick = Math.sin(ph * 2) * u * 0.12;
          ctx.beginPath();
          ctx.moveTo(fx - face * u * 0.25, wy); ctx.lineTo(fx - face * u * 0.95, wy + kick);
          ctx.moveTo(fx - face * u * 0.25, wy + u * 0.08); ctx.lineTo(fx - face * u * 0.9, wy + u * 0.1 - kick);
          ctx.stroke();
          ctx.fillStyle = shirt;
          ctx.fillRect(fx - u * 0.35, wy - u * 0.16, u * 0.7, u * 0.3);
          ctx.strokeStyle = skin;
          ctx.beginPath(); // one arm reaching over, the other pulling under
          const sh = fx + face * u * 0.3;
          ctx.moveTo(sh, wy - u * 0.05); ctx.lineTo(sh + face * Math.cos(ph) * u * 0.5, wy - Math.sin(ph) * u * 0.45);
          ctx.moveTo(sh, wy - u * 0.05); ctx.lineTo(sh - face * Math.cos(ph) * u * 0.35, wy + Math.sin(ph) * u * 0.3);
          ctx.stroke();
          ctx.fillStyle = skin; // the head, turned to breathe
          ctx.fillRect(fx + face * u * 0.55 - u * 0.24, wy - u * 0.44, u * 0.48, u * 0.46);
          // the splash of their stroke
          ctx.fillStyle = 'rgba(230,244,255,0.75)';
          const spl = (tick + x * 5) & 7;
          if (spl < 3) ctx.fillRect(sh + face * u * 0.45, wy - u * 0.05 - spl * s * 0.2, Math.max(1, s * 0.4), Math.max(1, s * 0.4));
          continue;
        }
        const step = ((tick >> 3) + x) & 1 ? 0.2 : -0.2;
        ctx.beginPath(); // legs
        ctx.moveTo(fx, fy - u * 0.55); ctx.lineTo(fx + u * (-0.2 + step), fy);
        ctx.moveTo(fx, fy - u * 0.55); ctx.lineTo(fx + u * (0.2 - step), fy);
        ctx.stroke();
        ctx.strokeStyle = skin;
        ctx.beginPath(); // arms, swinging against the legs
        ctx.moveTo(fx - u * 0.3, fy - u * 1.1); ctx.lineTo(fx - u * 0.38 - step * u * 0.6, fy - u * 0.65);
        ctx.moveTo(fx + u * 0.3, fy - u * 1.1); ctx.lineTo(fx + u * 0.38 + step * u * 0.6, fy - u * 0.65);
        ctx.stroke();
        ctx.fillStyle = shirt;
        ctx.fillRect(fx - u * 0.32, fy - u * 1.15, u * 0.64, u * 0.66);
        ctx.fillStyle = skin;
        ctx.fillRect(fx - u * 0.36, fy - u * 1.9, u * 0.72, u * 0.72);
        ctx.fillStyle = '#2a2622'; // an eye, looking the way they walk
        ctx.fillRect(fx + face * u * 0.16 - u * 0.05, fy - u * 1.62, Math.max(1, u * 0.1), Math.max(1, u * 0.1));
      }
      ctx.strokeStyle = '#1c1c22';
      ctx.lineWidth = Math.max(1, s * 0.22);
      for (let k = 0; k < nBirds; k++) {
        const i = birds[k];
        if (type[i] !== BIRD) continue;
        const x = (i % SW) - 1, y = ((i / SW) | 0) - 1;
        const cxp = ox + sx + (x + 0.5) * s, cyp = oy + sy + (y + 0.5) * s;
        const flap = ((tick >> 2) + x * 3) & 2 ? -0.55 : 0.25;
        ctx.beginPath();
        ctx.moveTo(cxp - s * 0.9, cyp + s * flap); ctx.lineTo(cxp, cyp + s * 0.2); ctx.lineTo(cxp + s * 0.9, cyp + s * flap);
        ctx.stroke();
      }
      for (let k = 0; k < nBeasts; k++) {
        const i = beasts[k], t = type[i];
        if (t !== COW && t !== WOLF && t !== SHARK) continue;
        const x = (i % SW) - 1, y = ((i / SW) | 0) - 1;
        const fx = ox + sx + (x + 0.5) * s, fy = oy + sy + (y + 1) * s, face = aux[i] & 1 ? 1 : -1;
        const burning = flags[i] & 1;
        if (t === SHARK) drawShark(fx, fy - s * 0.5, face, s, tick + x * 5, burning);
        else drawBeast(t === COW, fx, fy, face, s, ((tick >> 3) + x) & 1, shade[i], burning);
      }
    }
    // A cow (white with black patches, horns and a pink snout) or a wolf (grey, pointed ears and a
    // bushy tail) standing on the bottom of its cell, about the size of a person.
    function drawBeast(isCow, fx, fy, face, s, stepping, sh, burning) {
      const L = isCow ? 2.2 : 1.9, top = isCow ? 2.6 : 2.2, belly = isCow ? 1.2 : 1.1;
      const body = burning ? '#ff8a2a' : isCow ? '#f2efe6' : '#7d7a76', dark = isCow ? '#2a2420' : '#55524e';
      ctx.lineWidth = Math.max(1, s * 0.45);
      ctx.strokeStyle = dark;
      ctx.beginPath(); // four legs, walking
      const st = stepping ? 0.25 : -0.25;
      for (const lx of [-L * 0.7, -L * 0.45, L * 0.45, L * 0.7]) {
        const sw = (lx < 0 ? st : -st) * s;
        ctx.moveTo(fx + lx * s, fy - belly * s); ctx.lineTo(fx + lx * s + sw, fy);
      }
      ctx.stroke();
      ctx.fillStyle = body;
      ctx.fillRect(fx - L * s, fy - top * s, L * 2 * s, (top - belly) * s);
      if (isCow) { // patches
        ctx.fillStyle = dark;
        const p = (sh >> 4) & 3;
        ctx.fillRect(fx + (p - 1.6) * 0.5 * s, fy - top * s, 1.1 * s, 0.8 * s);
        ctx.fillRect(fx - (p * 0.3 + 0.4) * s * face, fy - (top - 0.7) * s, 0.8 * s, 0.6 * s);
      }
      // the head, out front and a little up
      const hx = fx + face * (L + 0.5) * s, hy = fy - (top + (isCow ? 0.3 : 0.5)) * s, hw = (isCow ? 1.2 : 1.1) * s;
      ctx.fillStyle = body;
      ctx.fillRect(hx - hw / 2, hy, hw, (isCow ? 1.2 : 0.9) * s);
      if (isCow) {
        ctx.fillStyle = '#e8a0a0'; // snout
        ctx.fillRect(hx + face * hw * 0.15 - hw * 0.3, hy + 0.75 * s, hw * 0.6, 0.45 * s);
        ctx.strokeStyle = '#d8ceb8'; ctx.lineWidth = Math.max(1, s * 0.3);
        ctx.beginPath(); ctx.moveTo(hx - hw * 0.35, hy); ctx.lineTo(hx - hw * 0.5, hy - 0.5 * s); ctx.moveTo(hx + hw * 0.35, hy); ctx.lineTo(hx + hw * 0.5, hy - 0.5 * s); ctx.stroke();
      } else {
        ctx.fillRect(hx + face * hw * 0.4 - hw * 0.25, hy + 0.35 * s, hw * 0.6, 0.45 * s); // muzzle
        ctx.fillStyle = dark; // pointed ears
        ctx.beginPath(); ctx.moveTo(hx - hw * 0.45, hy); ctx.lineTo(hx - hw * 0.25, hy - 0.7 * s); ctx.lineTo(hx - hw * 0.02, hy); ctx.fill();
      }
      ctx.fillStyle = '#1c1a18'; // an eye
      ctx.fillRect(hx + face * hw * 0.2 - s * 0.15, hy + 0.3 * s, Math.max(1, s * 0.3), Math.max(1, s * 0.3));
      ctx.strokeStyle = isCow ? dark : body; ctx.lineWidth = Math.max(1, s * (isCow ? 0.3 : 0.55));
      ctx.beginPath(); // the tail
      const tx = fx - face * L * s, ty = fy - (top - 0.2) * s;
      if (isCow) { ctx.moveTo(tx, ty); ctx.lineTo(tx - face * 0.4 * s, ty + 1.2 * s); }
      else { ctx.moveTo(tx, ty + 0.2 * s); ctx.lineTo(tx - face * 1.1 * s, ty - 0.3 * s); }
      ctx.stroke();
    }
    // A shark: a grey torpedo with a white belly, a tall fin and a beating tail.
    function drawShark(cx0, cy0, face, s, ph, burning) {
      const L = 2.6 * s, Hh = 0.75 * s, beat = Math.sin(ph * 0.35) * 0.5 * s;
      ctx.fillStyle = burning ? '#ff8a2a' : '#6e7f8e';
      ctx.beginPath();
      ctx.moveTo(cx0 + face * L, cy0); // the snout
      ctx.quadraticCurveTo(cx0 + face * L * 0.4, cy0 - Hh, cx0 - face * L * 0.7, cy0 - Hh * 0.3);
      ctx.lineTo(cx0 - face * L * 0.7, cy0 + Hh * 0.3);
      ctx.quadraticCurveTo(cx0 + face * L * 0.4, cy0 + Hh, cx0 + face * L, cy0);
      ctx.fill();
      ctx.beginPath(); // the dorsal fin
      ctx.moveTo(cx0 + face * L * 0.25, cy0 - Hh * 0.8); ctx.lineTo(cx0 - face * L * 0.05, cy0 - Hh * 2.1); ctx.lineTo(cx0 - face * L * 0.2, cy0 - Hh * 0.75);
      ctx.fill();
      ctx.beginPath(); // the tail, beating
      ctx.moveTo(cx0 - face * L * 0.65, cy0); ctx.lineTo(cx0 - face * L * 1.15, cy0 - Hh * 1.4 + beat); ctx.lineTo(cx0 - face * L * 1.05, cy0 + Hh * 1.1 + beat);
      ctx.fill();
      ctx.fillStyle = '#dfe6ea'; // the belly
      ctx.fillRect(cx0 - face * L * 0.4 - (face < 0 ? 0 : L * 0.9), cy0 + Hh * 0.2, L * 0.9 + L * 0.4, Hh * 0.4);
      ctx.fillStyle = '#101418';
      ctx.fillRect(cx0 + face * L * 0.62 - s * 0.15, cy0 - Hh * 0.35, Math.max(1, s * 0.3), Math.max(1, s * 0.3));
    }

    // A circular 3× magnifier that follows the cursor.
    function drawLens() {
      const { px, py } = worldToCanvas(brush.x + 0.5, brush.y + 0.5);
      const R = 95 * dpr, Z = 3, src = (2 * R) / Z;
      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py, R, 0, Math.PI * 2);
      ctx.clip();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(canvas, px - src / 2, py - src / 2, src, src, px - R, py - R, 2 * R, 2 * R);
      ctx.restore();
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = 'rgba(214,168,79,0.85)';
      ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.arc(px, py, R + 2 * dpr, 0, Math.PI * 2); ctx.stroke();
    }

    function drawRings() {
      const t = performance.now();
      for (let k = rings.length - 1; k >= 0; k--) {
        const rg = rings[k];
        const age = (t - rg.t0) / 1400;
        if (age >= 1) { rings.splice(k, 1); continue; }
        const { px, py } = worldToCanvas(rg.x + 0.5, rg.y + 0.5);
        const ease = 1 - Math.pow(1 - age, 3);
        ctx.globalAlpha = 1 - age;
        ctx.strokeStyle = rg.color;
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.arc(px, py, (6 + ease * 46) * dpr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = (1 - age) * 0.5;
        ctx.beginPath();
        ctx.arc(px, py, (3 + ease * 22) * dpr, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // The cursor shows exactly what the brush will touch: its shape, and while dragging a Line or
    // Box, the line or rectangle it will draw. Each outline gets a dark halo so it reads on anything.
    function drawBrush() {
      if (!brush.visible) return;
      const { px, py } = worldToCanvas(brush.x + 0.5, brush.y + 0.5);
      const s = view.s, rad = Math.max(0.5, brush.r + 0.5) * s;
      const lw = Math.max(1, dpr);
      const outline = (path, dash) => {
        ctx.setLineDash(dash || []);
        ctx.lineWidth = lw * 3; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; path(); ctx.stroke();
        ctx.lineWidth = lw; ctx.strokeStyle = brush.color; path(); ctx.stroke();
        ctx.setLineDash([]);
      };
      const dash = [4 * dpr, 4 * dpr];
      const circle = (r) => () => { ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); };
      const cellBox = (x0, y0, x1, y1) => () => {
        const a = worldToCanvas(Math.min(x0, x1), Math.min(y0, y1)), b = worldToCanvas(Math.max(x0, x1) + 1, Math.max(y0, y1) + 1);
        ctx.beginPath(); ctx.rect(a.px, a.py, b.px - a.px, b.py - a.py);
      };
      const cross = (len) => () => {
        ctx.beginPath();
        ctx.moveTo(px - len, py); ctx.lineTo(px + len, py);
        ctx.moveTo(px, py - len); ctx.lineTo(px, py + len);
      };
      switch (brush.shape) {
        case 'square': outline(cellBox(brush.x - brush.r, brush.y - brush.r, brush.x + brush.r, brush.y + brush.r), dash); break;
        case 'pen':
          outline(cellBox(brush.x, brush.y, brush.x, brush.y));
          outline(cross(Math.max(6 * dpr, s * 2)));
          break;
        case 'spray':
          outline(circle(rad), [1.5 * dpr, 5 * dpr]);
          ctx.fillStyle = brush.color;
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2 + 0.4, d = rad * (0.35 + (k % 2) * 0.3);
            ctx.fillRect(px + Math.cos(a) * d - dpr, py + Math.sin(a) * d - dpr, 2 * dpr, 2 * dpr);
          }
          break;
        case 'line':
          if (brush.anchor) {
            const a = worldToCanvas(brush.anchor.x + 0.5, brush.anchor.y + 0.5);
            ctx.lineCap = 'round';
            ctx.globalAlpha = 0.35; ctx.lineWidth = Math.max(lw, (brush.r * 2 + 1) * s);
            ctx.strokeStyle = brush.color;
            ctx.beginPath(); ctx.moveTo(a.px, a.py); ctx.lineTo(px, py); ctx.stroke();
            ctx.globalAlpha = 1;
            outline(() => { ctx.beginPath(); ctx.moveTo(a.px, a.py); ctx.lineTo(px, py); }, dash);
          }
          outline(circle(rad), dash);
          break;
        case 'box':
          if (brush.anchor) {
            ctx.globalAlpha = 0.18; ctx.fillStyle = brush.color;
            cellBox(brush.anchor.x, brush.anchor.y, brush.x, brush.y)(); ctx.fill();
            ctx.globalAlpha = 1;
            outline(cellBox(brush.anchor.x, brush.anchor.y, brush.x, brush.y), dash);
          } else outline(cellBox(brush.x, brush.y, brush.x, brush.y));
          outline(cross(Math.max(7 * dpr, s * 2.5)));
          break;
        case 'fill': {
          // a paint bucket: a tilted pail with a drop falling from its lip
          const u = Math.max(5 * dpr, s * 1.6);
          outline(() => {
            ctx.beginPath();
            ctx.moveTo(px - u, py - u * 0.2); ctx.lineTo(px - u * 0.2, py - u); ctx.lineTo(px + u * 0.6, py - u * 0.2);
            ctx.lineTo(px - u * 0.2, py + u * 0.6); ctx.closePath();
          });
          ctx.fillStyle = brush.color;
          ctx.beginPath(); ctx.arc(px + u * 0.75, py + u * 0.55, u * 0.22, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'weapon': {
          // a sight on where it will strike, and how far it reaches
          const kind = brush.weapon, notch = 5 * dpr;
          outline(() => {
            ctx.beginPath();
            ctx.arc(px, py, 4 * dpr, 0, Math.PI * 2);
            for (let k = 0; k < 4; k++) {
              const a = (k * Math.PI) / 2, c = Math.cos(a), sn = Math.sin(a);
              ctx.moveTo(px + c * 6 * dpr, py + sn * 6 * dpr); ctx.lineTo(px + c * (6 * dpr + notch), py + sn * (6 * dpr + notch));
            }
          });
          if (kind === 'tsunami') {
            // which way it will roll: in from the nearer edge
            const dir = brush.x < W / 2 ? 1 : -1, len = Math.max(30 * dpr, rad), hx = px - dir * 14 * dpr;
            outline(() => {
              ctx.beginPath();
              ctx.moveTo(hx - dir * len, py); ctx.lineTo(hx, py);
              ctx.moveTo(hx - dir * 7 * dpr, py - 6 * dpr); ctx.lineTo(hx, py); ctx.lineTo(hx - dir * 7 * dpr, py + 6 * dpr);
            });
          } else if (kind === 'storm' || kind === 'acidrain') {
            // the width of sky it covers
            outline(() => {
              ctx.beginPath();
              ctx.moveTo(px - rad, py - 7 * dpr); ctx.lineTo(px - rad, py); ctx.lineTo(px + rad, py); ctx.lineTo(px + rad, py - 7 * dpr);
            }, dash);
          } else if (kind === 'meteor') {
            // the way it comes in, at a slant from high over that side of the map
            const dir = brush.x < W / 2 ? -1 : 1, a = worldToCanvas(brush.x + dir * (brush.y + 8) * 0.55 + 0.5, -6);
            outline(() => { ctx.beginPath(); ctx.moveTo(a.px, a.py); ctx.lineTo(px, py); }, [2 * dpr, 6 * dpr]);
            outline(circle(rad), dash);
          } else if (kind === 'hbomb') {
            // the line it will fall down, where it will land, and how much of the map it will take
            const top = worldToCanvas(brush.x + 0.5, 0), land = worldToCanvas(brush.x + 0.5, brush.ty + 0.5);
            outline(() => { ctx.beginPath(); ctx.moveTo(top.px, top.py); ctx.lineTo(land.px, land.py); }, [2 * dpr, 6 * dpr]);
            outline(() => { ctx.beginPath(); ctx.arc(land.px, land.py, 5 * dpr, 0, Math.PI * 2); });
            outline(() => { ctx.beginPath(); ctx.arc(land.px, land.py, (brush.r + 0.5) * s, 0, Math.PI * 2); }, dash);
          } else if (kind === 'quake') {
            // how far out it does damage (dashed) and severe damage (solid); a small quake does neither
            if (brush.r >= 1) outline(circle(rad), dash);
            if (brush.r2 >= 1) outline(circle((brush.r2 + 0.5) * s));
          } else if (kind === 'volcano') {
            // the magma rises from the bottom of the map: how far up it can get, with a tick at the top
            const base = worldToCanvas(brush.x + 0.5, H), top = worldToCanvas(brush.x + 0.5, H - brush.r2);
            outline(() => {
              ctx.beginPath();
              ctx.moveTo(base.px, base.py); ctx.lineTo(top.px, top.py);
              ctx.moveTo(top.px - 6 * dpr, top.py); ctx.lineTo(top.px + 6 * dpr, top.py);
            }, [2 * dpr, 4 * dpr]);
            outline(circle(rad));
          } else if (kind === 'tornado') {
            outline(circle(rad));
          } else outline(circle(rad), dash);
          break;
        }
        case 'image': {
          // the picture itself, faint, where it will be built
          const im = brush.image;
          if (!im) { outline(circle(rad), dash); break; }
          const a = worldToCanvas(brush.x - (im.w >> 1), brush.y - (im.h >> 1));
          ctx.globalAlpha = 0.55; ctx.imageSmoothingEnabled = false;
          ctx.drawImage(im.canvas, a.px, a.py, im.w * s, im.h * s);
          ctx.globalAlpha = 1;
          outline(cellBox(brush.x - (im.w >> 1), brush.y - (im.h >> 1), brush.x - (im.w >> 1) + im.w - 1, brush.y - (im.h >> 1) + im.h - 1), dash);
          break;
        }
        case 'magnet': {
          // the reach, with arrows pointing in: it pulls everything loose toward the centre
          outline(circle(rad), [2 * dpr, 6 * dpr]);
          outline(circle(Math.max(3 * dpr, s)));
          ctx.fillStyle = brush.color;
          const spin = brush.active ? performance.now() / 600 : 0;
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2 + spin, r1 = rad * 0.82, r2 = rad * 0.62;
            const tipX = px + Math.cos(a) * r2, tipY = py + Math.sin(a) * r2;
            const bx = px + Math.cos(a) * r1, by = py + Math.sin(a) * r1;
            const nx = -Math.sin(a) * 3 * dpr, ny = Math.cos(a) * 3 * dpr;
            ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(bx + nx, by + ny); ctx.lineTo(bx - nx, by - ny); ctx.closePath(); ctx.fill();
          }
          break;
        }
        default: outline(circle(rad), dash);
      }
    }

    function worldToCanvas(x, y) {
      return { px: view.ox + x * view.s, py: view.oy + y * view.s };
    }
    function worldToClient(x, y) {
      const rect = canvas.getBoundingClientRect();
      const { px, py } = worldToCanvas(x, y);
      return { x: rect.left + px / dpr, y: rect.top + py / dpr };
    }
    function clientToWorld(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const px = (clientX - rect.left) * dpr, py = (clientY - rect.top) * dpr;
      return { x: Math.floor((px - view.ox) / view.s), y: Math.floor((py - view.oy) / view.s) };
    }

    return {
      setWorld, resize, draw, brush, zoomAt, panBy, fitView, setInsetBottom,
      get zoom() { return view.zoom; },
      clientToWorld, worldToClient,
      ring(x, y, color) { rings.push({ x, y, color, t0: performance.now() }); },
      blast, sparkle,
      shake(a) { shakeAmt = Math.min(14, shakeAmt + a); },
      flash(a) { flashAmt = Math.min(1, flashAmt + a); },
      glare(a) { glareAmt = Math.min(1.4, glareAmt + a); },
      get cellSize() { return view.s / dpr; },
    };
  }

  // A small static texture of an element, for palette tiles and the codex.
  function swatch(t, w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const im = x.createImageData(w, h);
    const d = im.data;
    const def = list[t];
    const mode = MODE[t];
    for (let y = 0; y < h; y++) {
      for (let xx = 0; xx < w; xx++) {
        const k = (y * w + xx) * 4;
        const s = hash(xx * 131 + y * 977 + t * 7919) & 255;
        const p = t * 16 + (s >> 4);
        let r = PR[p], g = PG[p], b = PB[p];
        if (mode === R.FIRE || mode === R.EMBER) {
          const q = clamp(((h - y) / h) * 63 + (s & 15) - 8, 0, 63) | 0;
          r = FIRE[q * 3]; g = FIRE[q * 3 + 1]; b = FIRE[q * 3 + 2];
        } else if (mode === R.LAVA || mode === R.MOLTEN) {
          const RM = mode === R.LAVA ? LAVA : t === ELEM.ID.MGLASS ? MGLASS : MMETAL;
          const q = (s >> 2) & 63;
          r = RM[q * 3]; g = RM[q * 3 + 1]; b = RM[q * 3 + 2];
        } else if (mode === R.FLOWER) {
          const hh = (xx * 40 + y * 13) & 255;
          r = FLR[hh]; g = FLG[hh]; b = FLB[hh];
          if ((xx + y) % 3 === 0) { r = 255; g = 210; b = 70; }
        } else if (mode === R.PLASMA) {
          const q = s & 15;
          r = PLASMA[q * 3]; g = PLASMA[q * 3 + 1]; b = PLASMA[q * 3 + 2];
        } else if (mode === R.BRICK) {
          if (y % 3 === 0 || (xx + (((y / 3) | 0) & 1) * 3) % 6 === 0) { r = 120; g = 104; b = 92; }
        } else if (mode === R.BATTERY) {
          if (((xx + y) >> 1) & 1) { r = 42; g = 42; b = 46; }
        } else if (mode === R.WALL) {
          if ((xx & 3) === 0 || (y & 3) === 0) { r += 9; g += 10; b += 12; }
        } else if (mode === R.FIREFLY) {
          if (s < 40) { r = 255; g = 243; b = 138; } else { r = 20; g = 26; b = 24; }
        } else if (mode === R.LIGHT) { // rays fanning out from a bright point
          const dx = xx - w * 0.3, dy = y - h * 0.35, dd = Math.sqrt(dx * dx + dy * dy) / Math.max(w, h);
          const beam = Math.cos(Math.atan2(dy, dx) * 7) > 0.55 ? 1 : 0.25, f = Math.max(0.12, (1 - dd * 1.3) * beam);
          r = 255 * f; g = 246 * f; b = 210 * f;
        } else if (def.key === 'paint') { // a rainbow of paint
          const hh = ((xx * 6 + y * 3) & 255) * 3;
          r = RB[hh]; g = RB[hh + 1]; b = RB[hh + 2];
        } else if (def.key === 'image') { // a little picture: sky, a sun and a hill
          const hill = y > h * 0.62 - Math.sin((xx / w) * 3) * h * 0.12;
          const sun = (xx - w * 0.7) ** 2 + (y - h * 0.3) ** 2 < (h * 0.14) ** 2;
          [r, g, b] = sun ? [255, 214, 90] : hill ? [70, 150, 70] : [110, 170, 230];
        }
        if (mode === R.PERIODIC) {
          const gc = def.gasColor || def.dischargeColor;
          if (def.cat === ELEM.CAT.GAS && gc) {
            const [gr, gg, gb] = hex(gc);
            r = gr; g = gg; b = gb;
          } else if (def.cat === ELEM.CAT.LIQUID && def.liqColor) {
            const [lr, lg, lb] = hex(def.liqColor);
            r = lr; g = lg; b = lb;
          }
          if (def.glowColor && s < 70) { const [gr, gg, gb] = hex(def.glowColor); r = gr; g = gg; b = gb; }
        } else if (mode === R.HUMAN) {
          if (y < h / 2) { const sk = list[ELEM.ID.HEAD].rgb[(xx >> 2) & 3]; r = sk[0]; g = sk[1]; b = sk[2]; }
        }
        let a = def.alpha < 1 ? Math.max(120, def.alpha * 255) : 255;
        if (mode === R.PERIODIC && def.cat === ELEM.CAT.GAS) a = 120 + (s & 63);
        if (mode === R.SMOKE || mode === R.GAS) a = 150 + (s & 63);
        if (mode === R.SPARK) { if (s & 1) { r = 255; g = 252; b = 214; } else { r = 140; g = 210; b = 255; } a = s < 90 ? 255 : 40; }
        d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = a;
      }
    }
    x.putImageData(im, 0, 0);
    return c;
  }

  G.Renderer = { createRenderer, swatch };
})(globalThis);
