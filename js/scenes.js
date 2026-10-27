/* Elementarium — starting scenes, built procedurally from starter elements only,
 * so loading one never hands out a discovery for free. */
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

  const scenes = {
    empty(w) { w.clear(); },

    // A mountain over a sealed magma chamber. The chamber is lined with obsidian and the
    // lava kept just under stone's melting point, so nothing melts (or is discovered) until you dig.
    volcano(w) {
      w.clear();
      const { W, H } = w;
      const n = noise1();
      const px = Math.round(W / 2);
      for (let x = 0; x < W; x++) {
        const u = Math.abs(x - px) / (W * 0.42);
        let top = Math.round(H - 3 - Math.max(0, 1 - u) * H * 0.72 + n(x) * 3);
        if (Math.abs(x - px) < W * 0.035) top += Math.round(H * 0.06); // crater
        fillCol(w, x, Math.max(2, top), H - 1, ID.STONE);
      }
      const ry = Math.round(H * 0.13), rx = Math.round(W * 0.12), cy = H - ry + 2; // rests on the hot floor
      blob(w, px, cy, rx + 2, ry + 2, ID.OBSIDIAN);
      blob(w, px, cy, rx, ry, ID.LAVA);
      let crater = 0;
      while (crater < H && w.type[w.idx(px, crater)] === ID.EMPTY) crater++;
      for (let y = crater + 2; y < cy; y++) {
        for (let dx = -3; dx <= 3; dx++) w.place(w.idx(px + dx, y), Math.abs(dx) >= 2 ? ID.OBSIDIAN : ID.LAVA);
      }
      for (let i = 0; i < w.N; i++) if (w.type[i] === ID.LAVA) w.temp[i] = 1080;
      // foothills with soil and seeds
      for (const side of [-1, 1]) {
        for (let k = 0; k < W * 0.14; k++) {
          const x = side < 0 ? k : W - 1 - k;
          let top = 0;
          while (top < H && w.type[w.idx(x, top)] === ID.EMPTY) top++;
          fillCol(w, x, top - 3, top - 1, ID.DIRT);
          if (k % 6 === 2) w.place(w.idx(x, top - 4), ID.SEED);
        }
      }
    },

    // Rolling soil, wooden trees with leafy crowns, and a stone-lined pond. Made for fire.
    forest(w) {
      w.clear();
      const { W, H } = w;
      const n = noise1();
      const ground = (x) => Math.round(H * 0.72 + n(x) * H * 0.06);
      const pond0 = Math.round(W * 0.58), pond1 = Math.round(W * 0.78);
      for (let x = 0; x < W; x++) {
        const g = ground(x);
        fillCol(w, x, g + 10, H - 1, ID.STONE);
        if (x >= pond0 && x <= pond1) {
          const depth = Math.round(Math.sin(((x - pond0) / (pond1 - pond0)) * Math.PI) * 14);
          fillCol(w, x, g + depth - 1, g + 9, ID.STONE);
          fillCol(w, x, g, g + depth - 2, ID.WATER);
        } else {
          fillCol(w, x, g, g + 9, ID.DIRT);
          if (x % 9 === 4) w.place(w.idx(x, g - 1), ID.SEED);
        }
      }
      for (let tx = Math.round(W * 0.06); tx < W * 0.95; tx += 14 + ((Math.random() * 12) | 0)) {
        if (tx > pond0 - 8 && tx < pond1 + 8) continue;
        const g = ground(tx);
        const h = 18 + ((Math.random() * 18) | 0);
        for (let y = g - h; y < g; y++) { w.place(w.idx(tx, y), ID.WOOD); w.place(w.idx(tx + 1, y), ID.WOOD); }
        blob(w, tx, g - h - 3, 7 + ((Math.random() * 4) | 0), 6, ID.PLANT, true);
      }
      w.livenTrees(); // their trunks carry water up to the leaves
    },

    // People living on gentle hills: wooden huts, a farm, a pond, trees, birds and an anthill.
    village(w) {
      w.clear();
      const { W, H } = w;
      const n = noise1();
      const huts = [[0.1, 16], [0.3, 14], [0.7, 18]].map(([u, wd]) => [Math.round(W * u), wd]);
      const pond0 = Math.round(W * 0.46), pond1 = Math.round(W * 0.6);
      const base = (x) => Math.round(H * 0.74 + n(x) * H * 0.04);
      const ground = new Int32Array(W);
      for (let x = 0; x < W; x++) {
        ground[x] = base(x);
        for (const [hx, wd] of huts) if (x >= hx - 2 && x <= hx + wd + 2) ground[x] = base(hx);
      }
      for (let x = 0; x < W; x++) {
        const g = ground[x];
        fillCol(w, x, g + 8, H - 1, ID.STONE);
        if (x >= pond0 && x <= pond1) {
          const depth = Math.round(Math.sin(((x - pond0) / (pond1 - pond0)) * Math.PI) * 10);
          fillCol(w, x, g + depth - 1, g + 7, ID.STONE);
          fillCol(w, x, g, g + depth - 2, ID.WATER);
        } else fillCol(w, x, g, g + 7, ID.DIRT);
      }
      // huts: wooden walls, a brick roof and a door on each side tall enough to walk through
      for (const [hx, wd] of huts) {
        const g = ground[hx], top = g - 9;
        for (let y = top; y < g; y++) {
          const door = y >= g - 3;
          if (!door) { w.place(w.idx(hx, y), ID.WOOD); w.place(w.idx(hx + wd, y), ID.WOOD); }
        }
        for (let x = hx - 2; x <= hx + wd + 2; x++) { w.place(w.idx(x, top - 1), ID.BRICK); w.place(w.idx(x, top - 2), ID.BRICK); }
      }
      // farm: furrows of seeds between the second hut and the pond
      for (let x = Math.round(W * 0.4) - 18; x < pond0 - 4; x += 3) w.place(w.idx(x, ground[x] - 1), ID.SEED);
      // trees
      for (const u of [0.24, 0.65, 0.86, 0.95]) {
        const tx = Math.round(W * u), g = ground[tx], h = 16 + ((Math.random() * 10) | 0);
        for (let y = g - h; y < g; y++) w.place(w.idx(tx, y), ID.WOOD);
        blob(w, tx, g - h - 3, 6, 5, ID.PLANT, true);
      }
      w.livenTrees();
      // villagers, birds and an ant colony
      for (let k = 0; k < 14; k++) {
        const x = 4 + ((Math.random() * (W - 8)) | 0);
        if (x >= pond0 - 1 && x <= pond1 + 1) continue;
        const g = ground[x];
        const i = w.idx(x, g - 1), h = w.idx(x, g - 2);
        if (w.type[i] === ID.EMPTY && w.type[h] === ID.EMPTY) { w.place(i, ID.HUMAN); w.place(h, ID.HEAD); }
      }
      for (let k = 0; k < 8; k++) w.place(w.idx(((Math.random() * W) | 0), 8 + ((Math.random() * H * 0.3) | 0)), ID.BIRD);
      const ax = Math.round(W * 0.8);
      for (let k = 0; k < 10; k++) w.place(w.idx(ax + k * 2, ground[ax + k * 2] - 1), ID.ANT);
    },

    // A uranium core in a water pool, kept subcritical by cadmium control rods. Pull the rods out.
    reactor(w) {
      w.clear();
      const { W, H } = w;
      const x0 = Math.round(W * 0.2), x1 = Math.round(W * 0.8), y0 = Math.round(H * 0.25);
      for (let y = y0; y < H; y++) for (let x = 0; x < W; x++) {
        if (x < x0 || x > x1) w.place(w.idx(x, y), ID.STONE);
      }
      for (let y = y0; y < H; y++) { fillCol(w, x0, y, y, ID.WALL); fillCol(w, x1, y, y, ID.WALL); }
      for (let x = x0; x <= x1; x++) for (let y = H - 3; y < H; y++) w.place(w.idx(x, y), ID.WALL);
      for (let y = y0 + 6; y < H - 3; y++) for (let x = x0 + 1; x < x1; x++) w.place(w.idx(x, y), ID.WATER);
      const cx = Math.round((x0 + x1) / 2), half = 14, cb = H - 4, ct = cb - 28;
      for (let y = ct; y <= cb; y++) for (let x = cx - half; x <= cx + half; x++) w.place(w.idx(x, y), ID.EL_U);
      // control rods reach up out of the water so you can erase them from above
      for (let x = cx - half + 1; x <= cx + half; x += 4) for (let y = y0 + 2; y <= cb; y++) w.place(w.idx(x, y), ID.EL_CD);
    },

    // Sealed glass tubes of gas, each with a battery at both ends: the classic discharge lamps.
    lamps(w) {
      w.clear();
      const { W, H } = w;
      const gases = [ID.EL_HE, ID.EL_NE, ID.EL_AR, ID.EL_KR, ID.EL_XE, ID.EL_N, ID.EL_RN];
      const x0 = Math.round(W * 0.12), x1 = Math.round(W * 0.88);
      const pitch = Math.max(7, Math.floor((H - 10) / gases.length));
      gases.forEach((g, k) => {
        const y = 6 + k * pitch;
        for (let x = x0; x <= x1; x++) { w.place(w.idx(x, y), ID.GLASS); w.place(w.idx(x, y + 4), ID.GLASS); }
        for (let yy = y + 1; yy <= y + 3; yy++) {
          w.place(w.idx(x0, yy), ID.GLASS); w.place(w.idx(x1, yy), ID.GLASS);
          for (let x = x0 + 1; x < x1; x++) w.place(w.idx(x, yy), g);
        }
        w.place(w.idx(x0, y + 2), ID.BATTERY);
        w.place(w.idx(x1, y + 2), ID.BATTERY);
      });
    },

    // A chemistry bench: shelves of phosphors wired to batteries, a plaque of radium paint, a sealed
    // jar of chlorine with sodium dropping into it, and a row of campfires, each salted with a metal
    // that colours its flames (none, copper, strontium, sodium, potassium, barium).
    chemistry(w) {
      w.clear();
      const { W, H } = w;
      const rect = (x0, y0, x1, y1, t) => {
        for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
          for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) w.place(w.idx(x, y), t);
        }
      };
      rect(0, H - 4, W - 1, H - 1, ID.STONE);
      // phosphors, lit by current: europium red, terbium green, thulium blue, zinc, lutetium, cerium
      const sx0 = Math.round(W * 0.1), sx1 = Math.round(W * 0.9), pitch = Math.max(4, Math.floor(H * 0.03));
      [ID.EL_EU, ID.EL_TB, ID.EL_TM, ID.EL_ZN, ID.EL_LU, ID.EL_CE].forEach((t, k) => {
        const y = Math.round(H * 0.05) + k * pitch;
        rect(sx0 - 1, y + 2, sx1 + 1, y + 2, ID.WALL);
        rect(sx0, y, sx1, y + 1, t);
        w.place(w.idx(sx0 - 1, y + 1), ID.BATTERY);
      });
      // radium paint: zinc speckled with radium sparkles green with every alpha particle
      const ry0 = Math.round(H * 0.05) + 6 * pitch + 3, ry1 = ry0 + Math.max(4, Math.round(H * 0.03));
      const rx0 = Math.round(W * 0.3), rx1 = Math.round(W * 0.7);
      rect(rx0 - 1, ry1 + 1, rx1 + 1, ry1 + 1, ID.WALL);
      rect(rx0, ry0, rx1, ry1, ID.EL_ZN);
      for (let x = rx0 + 2; x < rx1; x += 4) w.place(w.idx(x, (ry0 + ry1) >> 1), ID.EL_RA);
      // a sealed glass jar of chlorine, with pellets of sodium falling in to burn yellow into salt
      const jx0 = Math.round(W * 0.38), jx1 = Math.round(W * 0.62);
      const jy0 = ry1 + Math.max(5, Math.round(H * 0.04)), jy1 = Math.round(H * 0.66);
      rect(jx0, jy0, jx1, jy1, ID.GLASS);
      rect(jx0 + 1, jy0 + 1, jx1 - 1, jy1 - 1, ID.EL_CL);
      for (let x = jx0 + 4; x < jx1 - 2; x += 6) w.place(w.idx(x, jy0 + 2), ID.EL_NA);
      // campfires, already lit; the metal mixed into the top of each colours its flames
      const fuel = [0, ID.EL_CU, ID.EL_SR, ID.EL_NA, ID.EL_K, ID.EL_BA];
      const fw = Math.floor(W / fuel.length), fh = Math.max(6, Math.round(H * 0.08));
      fuel.forEach((c, k) => {
        const x0 = k * fw + 4, x1 = (k + 1) * fw - 5, top = H - 5 - fh;
        rect(x0, top, x1, H - 5, ID.WOOD);
        for (let y = top; y <= top + 3; y++) {
          for (let x = x0; x <= x1; x++) {
            if (c && (x + y) % 3 === 0) w.place(w.idx(x, y), c);
            else w.ignite(w.idx(x, y));
          }
        }
      });
    },

    // An electric workshop: a stained-glass window, a light bulb, a carbon arc lamp, an electric
    // sparkler, and two neon signs, one run off a lemon battery and one off a solar panel.
    electrics(w) {
      w.clear();
      const { W, H } = w;
      const rect = (x0, y0, x1, y1, t) => {
        for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
          for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) w.place(w.idx(x, y), t);
        }
      };
      const X = (u) => Math.round(W * u), Y = (u) => Math.round(H * u);
      rect(0, H - 4, W - 1, H - 1, ID.STONE);
      // stained glass, in the colours metals give it
      const stains = [ID.EL_CO, ID.EL_CR, ID.EL_AU, ID.EL_MN, ID.EL_AG, ID.EL_ER, ID.EL_U, ID.EL_CU];
      const gx0 = X(0.1), gx1 = X(0.9), gy0 = Y(0.04), gy1 = gy0 + Math.max(5, Y(0.06));
      for (let x = gx0; x <= gx1; x++) {
        const tint = stains[Math.floor(((x - gx0) / (gx1 - gx0 + 1)) * stains.length)];
        for (let y = gy0; y <= gy1; y++) { const i = w.idx(x, y); w.place(i, ID.GLASS); w.aux[i] = tint; }
      }
      // a light bulb: a tungsten filament between two batteries, sealed in glass full of argon
      const by0 = Y(0.2), bx0 = X(0.06), bx1 = bx0 + Math.max(16, X(0.16)), by1 = by0 + 10;
      rect(bx0, by0, bx1, by1, ID.GLASS); rect(bx0 + 1, by0 + 1, bx1 - 1, by1 - 1, ID.EL_AR);
      rect(bx0 + 2, by0 + 6, bx1 - 2, by0 + 6, ID.WALL);
      rect(bx0 + 4, by0 + 5, bx1 - 4, by0 + 5, ID.EL_W);
      for (const bx of [bx0 + 3, bx1 - 3]) { // each battery capped in wall so it feeds only the filament
        w.place(w.idx(bx, by0 + 5), ID.BATTERY);
        rect(bx - 1, by0 + 4, bx + 1, by0 + 4, ID.WALL);
        w.place(w.idx(bx + (bx < bx0 + 8 ? -1 : 1), by0 + 5), ID.WALL);
      }
      // a carbon arc lamp: two carbon rods with a gap between them
      const ay = by0 + 6, ax0 = X(0.3), ax1 = X(0.5), mid = Math.round((ax0 + ax1) / 2);
      rect(ax0 - 1, ay + 1, ax1 + 1, ay + 1, ID.WALL);
      rect(ax0, ay, mid - 2, ay, ID.EL_C); rect(mid + 1, ay, ax1, ay, ID.EL_C);
      w.place(w.idx(ax0 - 1, ay), ID.BATTERY);
      // an electric sparkler: titanium filings on a nichrome heater
      const sx0 = X(0.6), sx1 = X(0.9), sy = by0 + 6;
      rect(sx0 - 1, sy + 1, sx1 + 1, sy + 1, ID.WALL);
      for (let x = sx0; x <= sx1; x++) w.place(w.idx(x, sy), x & 1 ? ID.EL_CR : ID.EL_NI);
      w.place(w.idx(sx0 - 1, sy), ID.BATTERY);
      for (let x = sx0 + 1; x < sx1; x += 3) w.place(w.idx(x, sy - 1), ID.EL_TI);
      // two neon tubes, each fed by a wire from below
      const tube = (x0, x1, y) => {
        rect(x0, y, x1, y + 4, ID.GLASS); rect(x0 + 1, y + 1, x1 - 1, y + 3, ID.EL_NE);
      };
      const ty = Y(0.42), wireTop = ty + 4;
      // a lemon battery: zinc along the floor of a saltwater bath with copper in it, the dry end wired up
      const lx0 = X(0.05), lx1 = X(0.42), lwall = Math.round(lx0 + (lx1 - lx0) * 0.6), floor = H - 5;
      rect(lx0, floor - 8, lx0, floor, ID.GLASS);
      rect(lx0 + 1, floor - 1, lx1, floor, ID.EL_ZN);
      rect(lwall, floor - 8, lwall, floor - 2, ID.GLASS);
      rect(lx0 + 1, floor - 8, lwall - 1, floor - 2, ID.SALTWATER);
      rect(lx0 + 3, floor - 4, lx0 + 8, floor - 2, ID.EL_CU);
      const lw = lx1 - 2;
      tube(lw - 14, lw + 2, ty);
      rect(lw, wireTop, lw, floor - 2, ID.METAL);
      // a solar panel of silicon on a stand, under open sky, wired to the other sign
      const px0 = X(0.55), px1 = X(0.93), py = Y(0.62);
      rect(px0, py + 1, px1, py + 1, ID.WALL);
      rect(px0, py, px1, py, ID.EL_SI);
      const pw = px0 + 2;
      tube(pw - 2, pw + 16, ty);
      rect(pw, wireTop, pw, py - 1, ID.METAL);
    },

    // A magnet lab: a neodymium magnet sorting iron out of sand, an iron bar wired to a battery (an
    // electromagnet), chilled gadolinium that jumps to a magnet and falls off again as it warms past
    // 20°C, and bismuth shoved away from a magnet.
    magnets(w) {
      w.clear();
      const { W, H } = w;
      const rect = (x0, y0, x1, y1, t) => {
        for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
          for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) w.place(w.idx(x, y), t);
        }
      };
      const X = (u) => Math.round(W * u), floor = H - 5;
      rect(0, H - 4, W - 1, H - 1, ID.STONE);
      // a magnet on a shelf ten cells above a floor of iron filings mixed into sand
      const magnet = (x0, x1, gap) => {
        const shelf = floor - gap;
        rect(x0, shelf, x1, shelf, ID.WALL);
        rect(x0 + 2, shelf - 4, x1 - 2, shelf - 1, ID.EL_ND);
      };
      magnet(X(0.04), X(0.3), 10);
      for (let x = X(0.04); x <= X(0.3); x++) w.place(w.idx(x, floor), x & 1 ? ID.EL_FE : ID.SAND);
      // an electromagnet: an iron bar with a battery at one end (erase the battery to switch it off)
      const ex0 = X(0.37), ex1 = X(0.6);
      rect(ex0, floor - 9, ex1, floor - 7, ID.METAL);
      w.place(w.idx(ex0 - 1, floor - 8), ID.BATTERY);
      for (let x = ex0 + 1; x < ex1; x += 2) w.place(w.idx(x, floor), ID.EL_FE);
      // gadolinium chilled to 10°C: magnetic until it warms past its Curie point of 19.5°C, then it drops
      magnet(X(0.66), X(0.82), 8);
      for (let x = X(0.67); x <= X(0.81); x += 2) { const i = w.idx(x, floor); w.place(i, ID.EL_GD); w.temp[i] = 10; }
      // a magnet standing on the floor, with bismuth beside it
      const bx = X(0.88);
      rect(bx - 4, floor - 8, bx - 3, floor, ID.WALL);
      rect(bx - 2, floor - 8, bx + 2, floor, ID.EL_ND);
      for (let x = bx + 3; x <= bx + 7; x++) w.place(w.idx(x, floor), ID.EL_BI);
    },

    // Solid rock riddled with tunnels: pockets of water and oil, veins of metal, a sand drift.
    caves(w) {
      w.clear();
      const { W, H } = w;
      for (let y = Math.round(H * 0.12); y < H; y++) for (let x = 0; x < W; x++) w.place(w.idx(x, y), ID.STONE);
      const carve = (x, y, r) => blob(w, x | 0, y | 0, r, r, ID.EMPTY);
      for (let k = 0; k < 7; k++) {
        let x = Math.random() * W, y = H * (0.3 + Math.random() * 0.6), a = Math.random() * Math.PI * 2;
        for (let s = 0; s < 70; s++) {
          carve(x, y, 4 + ((Math.random() * 3) | 0));
          a += (Math.random() - 0.5) * 0.8;
          x += Math.cos(a) * 3; y += Math.sin(a) * 1.6;
          if (x < 4 || x > W - 4) a = Math.PI - a;
          if (y < H * 0.25 || y > H - 6) a = -a;
        }
      }
      for (let k = 0; k < 5; k++) {
        let x = Math.random() * W, y = H * (0.3 + Math.random() * 0.65), a = Math.random() * Math.PI * 2;
        for (let s = 0; s < 40; s++) {
          const i = w.idx(Math.max(0, Math.min(W - 1, x | 0)), Math.max(0, Math.min(H - 1, y | 0)));
          if (w.type[i] === ID.STONE) w.place(i, ID.METAL);
          a += (Math.random() - 0.5) * 0.9;
          x += Math.cos(a); y += Math.sin(a);
        }
      }
      // let gravity fill the lowest pockets: water on one side, oil on the other, a sand drift up top
      const fillPocket = (x0, x1, t, rows) => {
        for (let x = x0; x < x1; x++) {
          let y = H - 1;
          while (y > 0 && w.type[w.idx(x, y)] !== ID.EMPTY) y--;
          for (let k = 0; k < rows && y > 0 && w.type[w.idx(x, y)] === ID.EMPTY; k++, y--) w.place(w.idx(x, y), t);
        }
      };
      fillPocket(0, Math.round(W * 0.4), ID.WATER, 6);
      fillPocket(Math.round(W * 0.6), W, ID.OIL, 5);
      blob(w, Math.round(W * 0.5), Math.round(H * 0.08), Math.round(W * 0.12), 3, ID.SAND);
    },

    island(w) {
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

    canyon(w) {
      w.clear();
      const { W, H } = w;
      const n = noise1();
      for (let x = 0; x < W; x++) {
        const u = x / W;
        const wallH = u < 0.38 || u > 0.62 ? 0.55 + n(x) * 0.08 : 0.12 + Math.abs(u - 0.5) * 1.4;
        const top = Math.round(H - wallH * H);
        fillCol(w, x, top, H - 1, ID.STONE);
        if (u < 0.36) fillCol(w, x, top - 3, top - 1, ID.DIRT);
        if (u < 0.3 && x % 11 === 5) w.place(w.idx(x, top - 4), ID.SEED);
      }
      // reservoir on the right plateau, held by a wall
      const rx0 = Math.round(W * 0.7), rx1 = Math.round(W * 0.95);
      for (let x = rx0; x <= rx1; x++) {
        let top = 0;
        while (top < H && w.type[w.idx(x, top)] === ID.EMPTY) top++;
        fillCol(w, x, top - 18, top - 1, ID.WATER);
      }
      fillCol(w, rx0 - 1, Math.round(H * 0.25), H - 1, ID.WALL);
      fillCol(w, rx0 - 2, Math.round(H * 0.25), H - 1, ID.WALL);
      // wooden bridge across the gap
      const by = Math.round(H - 0.55 * H) - 1;
      for (let x = Math.round(W * 0.36); x <= Math.round(W * 0.64); x++) {
        w.place(w.idx(x, by), ID.WOOD);
        w.place(w.idx(x, by + 1), ID.WOOD);
      }
      // a seam of metal in the canyon floor
      for (let x = Math.round(W * 0.45); x < Math.round(W * 0.55); x++) w.place(w.idx(x, H - 4), ID.METAL);
    },

    workshop(w) {
      w.clear();
      const { W, H } = w;
      const shelf = Math.round(H * 0.55);
      for (let x = 0; x < W; x++) { w.place(w.idx(x, shelf), ID.WALL); w.place(w.idx(x, H - 1), ID.WALL); }
      const bins = [ID.SAND, ID.WATER, ID.SALT, ID.OIL, ID.DIRT, ID.SEED];
      const bw = Math.floor(W / bins.length);
      bins.forEach((t, k) => {
        const x0 = k * bw + 3, x1 = (k + 1) * bw - 4;
        for (let y = shelf - 22; y < shelf; y++) { w.place(w.idx(x0, y), ID.WALL); w.place(w.idx(x1, y), ID.WALL); }
        for (let y = shelf - 16; y < shelf; y++) for (let x = x0 + 1; x < x1; x++) w.place(w.idx(x, y), t);
      });
      // lower bench: a metal block, a wood stack and a stone slab
      const fl = H - 2;
      const block = (x0, x1, h, t) => { for (let y = fl - h + 1; y <= fl; y++) for (let x = x0; x <= x1; x++) w.place(w.idx(x, y), t); };
      block(Math.round(W * 0.08), Math.round(W * 0.2), 14, ID.METAL);
      block(Math.round(W * 0.32), Math.round(W * 0.46), 18, ID.WOOD);
      block(Math.round(W * 0.58), Math.round(W * 0.72), 10, ID.STONE);
      block(Math.round(W * 0.82), Math.round(W * 0.92), 6, ID.DIRT);
    },
  };

  G.Scenes = scenes;
  G.SceneKit = { noise1, fillCol, blob }; // shared with the story chapters
})(globalThis);
