/* Elementarium — procedural sound.
 * Everything is synthesised from noise and oscillators; the simulation's per-frame event
 * counts drive it, with rate limits so a thousand sizzles still sound like one sizzle. */
(function (G) {
  'use strict';

  let ac = null, master = null, noise = null, fireBed = null, fireGain = null;
  let enabled = true;
  let volume = 0.7;
  const last = { sizzle: 0, boom: 0, thunder: 0, fizz: 0, zap: 0, crackle: 0, pour: 0, geiger: 0, fission: 0, cracks: 0, howl: 0 };

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = G.AudioContext || G.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = enabled ? volume : 0;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    master.connect(comp);
    comp.connect(ac.destination);

    noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const ch = noise.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;

    // a soft continuous roar whose level follows how much is burning
    fireBed = ac.createBufferSource();
    fireBed.buffer = noise;
    fireBed.loop = true;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    fireGain = ac.createGain();
    fireGain.gain.value = 0;
    fireBed.connect(lp); lp.connect(fireGain); fireGain.connect(master);
    fireBed.start();
  }

  function noiseHit({ dur = 0.2, type = 'bandpass', freq = 1000, q = 1, gain = 0.3, attack = 0.005, freqEnd = null, at = 0 }) {
    const t = ac.currentTime + at;
    const src = ac.createBufferSource();
    src.buffer = noise;
    src.loop = dur > 0.45; // the noise is two seconds long, and a long swell would run off its end
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  function tone({ freq = 440, freqEnd = null, dur = 0.3, type = 'sine', gain = 0.2, attack = 0.01, at = 0 }) {
    const t = ac.currentTime + at;
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  const ready = () => ac && enabled && ac.state === 'running';

  function sizzle(n) {
    const amt = Math.min(1, Math.log2(n + 1) / 6);
    noiseHit({ type: 'highpass', freq: 3500, q: 0.7, dur: 0.25 + amt * 0.35, gain: 0.05 + amt * 0.12, attack: 0.02 });
  }
  function fizz(n) {
    const amt = Math.min(1, Math.log2(n + 1) / 5);
    for (let k = 0; k < 3; k++) {
      noiseHit({ type: 'bandpass', freq: 1800 + Math.random() * 2600, q: 6, dur: 0.05, gain: 0.04 + amt * 0.06, at: k * 0.04 * Math.random() });
    }
  }
  function boom(size) {
    const s = Math.min(1, size / 30);
    noiseHit({ type: 'lowpass', freq: 900, freqEnd: 80, q: 0.8, dur: 0.6 + s * 0.9, gain: 0.35 + s * 0.4, attack: 0.004 });
    tone({ freq: 90, freqEnd: 32, dur: 0.5 + s * 0.6, type: 'sine', gain: 0.35 + s * 0.3, attack: 0.004 });
    noiseHit({ type: 'highpass', freq: 2500, q: 0.5, dur: 0.08, gain: 0.12 });
  }
  // A hydrogen bomb going off, far bigger than any other blast: a sharp crack, a roar sweeping
  // down from a scream to a growl over five seconds, a blow in the sub-bass, the blast wave
  // arriving a moment later as a second boom, and a rumble rolling on long after.
  function megaBoom() {
    noiseHit({ type: 'highpass', freq: 1400, q: 0.5, dur: 0.3, gain: 0.7, attack: 0.002 });
    noiseHit({ type: 'lowpass', freq: 5000, freqEnd: 90, q: 0.6, dur: 5, gain: 1, attack: 0.008 });
    noiseHit({ type: 'bandpass', freq: 420, freqEnd: 140, q: 0.7, dur: 6.5, gain: 0.6, attack: 0.04 });
    tone({ freq: 75, freqEnd: 24, dur: 4, type: 'sine', gain: 0.8, attack: 0.01 });
    tone({ freq: 150, freqEnd: 45, dur: 2.8, type: 'triangle', gain: 0.35, attack: 0.01 });
    noiseHit({ type: 'lowpass', freq: 2200, freqEnd: 130, q: 0.7, dur: 3.5, gain: 0.8, attack: 0.01, at: 0.7 });
    tone({ freq: 62, freqEnd: 26, dur: 3, type: 'sine', gain: 0.55, attack: 0.01, at: 0.7 });
    noiseHit({ type: 'lowpass', freq: 700, freqEnd: 160, q: 0.6, dur: 9, gain: 0.45, attack: 1.4, at: 1.2 });
  }
  // A falling bomb's whistle: one held note sliding down in pitch and growing louder as the bomb
  // comes down (p is how far down it has come, 0 to 1), with a slight waver and the rush of air
  // round it, cut off the instant it lands.
  let whistle = null;
  function whistleFrame(p) {
    if (p > 0 && ready()) {
      const t = ac.currentTime;
      if (!whistle) {
        const o = ac.createOscillator(), lfo = ac.createOscillator(), depth = ac.createGain(), g = ac.createGain();
        const air = ac.createBufferSource(), bp = ac.createBiquadFilter(), ag = ac.createGain();
        o.type = 'sine';
        lfo.frequency.value = 5.5; depth.gain.value = 14;
        lfo.connect(depth); depth.connect(o.frequency);
        g.gain.value = 0.0001;
        o.connect(g); g.connect(master);
        air.buffer = noise; air.loop = true;
        bp.type = 'bandpass'; bp.Q.value = 6; ag.gain.value = 0.0001;
        air.connect(bp); bp.connect(ag); ag.connect(master);
        o.start(t); lfo.start(t); air.start(t);
        whistle = { o, lfo, g, air, bp, ag };
      }
      const f = 1600 * Math.pow(0.3, p);
      whistle.o.frequency.setTargetAtTime(f, t, 0.05);
      whistle.bp.frequency.setTargetAtTime(f * 1.5, t, 0.05);
      whistle.g.gain.setTargetAtTime(0.05 + 0.13 * p, t, 0.08);
      whistle.ag.gain.setTargetAtTime(0.02 + 0.06 * p, t, 0.08);
    } else if (whistle) {
      const t = ac.currentTime, w = whistle;
      for (const g of [w.g.gain, w.ag.gain]) { g.cancelScheduledValues(t); g.setTargetAtTime(0.0001, t, 0.01); }
      for (const n of [w.o, w.lfo, w.air]) n.stop(t + 0.08);
      whistle = null;
    }
  }
  function thunder() {
    noiseHit({ type: 'highpass', freq: 1800, q: 0.6, dur: 0.12, gain: 0.35, attack: 0.002 });
    noiseHit({ type: 'lowpass', freq: 500, freqEnd: 60, q: 0.7, dur: 2.2, gain: 0.45, attack: 0.05, at: 0.06 });
    noiseHit({ type: 'lowpass', freq: 260, freqEnd: 50, q: 1, dur: 1.6, gain: 0.3, attack: 0.3, at: 0.4 });
  }
  function zap() {
    tone({ freq: 120, freqEnd: 90, dur: 0.12, type: 'square', gain: 0.03 });
    noiseHit({ type: 'bandpass', freq: 5000, q: 2, dur: 0.06, gain: 0.05 });
  }
  function crackle(burning) {
    const n = 1 + Math.min(3, (Math.log2(burning + 1) / 3) | 0);
    for (let k = 0; k < n; k++) {
      noiseHit({ type: 'bandpass', freq: 900 + Math.random() * 3200, q: 3, dur: 0.012 + Math.random() * 0.03, gain: 0.04 + Math.random() * 0.07, attack: 0.001, at: Math.random() * 0.08 });
    }
  }

  // The dry tick of a Geiger counter — one per detected decay, up to a few per frame.
  function geiger(n) {
    const clicks = Math.min(4, n);
    for (let k = 0; k < clicks; k++) {
      noiseHit({ type: 'highpass', freq: 3000, q: 0.7, dur: 0.008, gain: 0.09, attack: 0.0005, at: Math.random() * 0.05 });
    }
  }

  // A tornado's howl: overlapping swells of filtered noise, so while one lasts it sounds unbroken.
  // Rock cracking and rubble knocking together as an earthquake breaks things: more cracks the
  // more solid cells give way.
  function cracks(n) {
    const k = Math.min(4, 1 + (Math.log2(n + 1) | 0));
    for (let j = 0; j < k; j++) {
      noiseHit({ type: 'bandpass', freq: 450 + Math.random() * 1300, q: 2.5, dur: 0.03 + Math.random() * 0.06, gain: 0.07 + Math.random() * 0.08, attack: 0.002, at: Math.random() * 0.12 });
    }
  }
  function howl(level) {
    const f = 520 + Math.random() * 380;
    noiseHit({ type: 'bandpass', freq: f, freqEnd: f * (0.75 + Math.random() * 0.5), q: 5, dur: 0.7, gain: 0.05 + level * 0.1, attack: 0.2 });
    noiseHit({ type: 'lowpass', freq: 300, q: 0.7, dur: 0.7, gain: 0.04 + level * 0.08, attack: 0.2 });
  }

  // Recordings that play while a disaster lasts (the README says where each is from): one starts
  // as its disaster does, its volume follows the disaster's strength, and it stops when the
  // disaster ends. A tsunami's is real heavy surf, which swells in with the wave and dies away
  // after the backwash. The rumble is a deep roar that plays whenever the ground shakes the
  // screen, except for a blast (which has its own sound): it builds in as an earthquake, a
  // volcano, a tsunami or a black hole starts to shake things, roars as long as the shaking lasts
  // (loud even for a small one, louder the harder it shakes) and stops with it. They play through
  // <audio> elements rather than Web Audio, so they work in a page opened straight off the disk
  // too. `floor` is how loud the faintest shaking still plays, `rise` and `fall` how fast the
  // volume follows its disaster up and down.
  // Each recording builds in at its start and dies away at its end, so one that a disaster
  // outlasts isn't simply looped: the roar would dip and build up again every time round, with a
  // click from the mp3's padding. Instead a second copy starts at the steady middle as the first
  // nears its end, and the two crossfade. `from` and `to` bound that steady middle (in seconds).
  const XFADE = 1; // how long the two copies overlap
  const track = (src, gain, floor, rise, fall, from, to) => ({ src, gain, floor, rise, fall, from, to, els: null, cur: 0, vol: 0, stopped: 0 });
  const surf = track('sounds/tsunami.mp3', 1.2, 0, 0.1, 0.03, 1, 38.5);
  const rumble = track('sounds/quake.mp3', 1.6, 0.3, 0.35, 0.2, 1, 16);
  function playTrack(tr, level) {
    const want = enabled && level > 0 ? Math.min(1, (tr.floor + Math.min(1, level)) * volume * tr.gain) : 0;
    if (!tr.els) {
      if (!want) return;
      tr.els = [new Audio(tr.src), new Audio(tr.src)];
      for (const e of tr.els) e.preload = 'auto';
    }
    let a = tr.els[tr.cur], b = tr.els[1 - tr.cur]; // a is playing; b comes in for the crossfade
    tr.vol += (want - tr.vol) * (want > tr.vol ? tr.rise : tr.fall);
    if (!want && tr.vol < 0.01) {
      tr.vol = 0;
      if (!a.paused || !b.paused) { a.pause(); b.pause(); tr.stopped = performance.now(); }
      return;
    }
    if (a.ended) { // it ran out before the other copy came in: carry on from the steady middle
      a.currentTime = tr.from;
      a.play().catch(() => {});
    } else if (a.paused) {
      // a new disaster starts its recording from the top; one that only paused for a moment
      // (the game paused mid-quake, say) carries on where it was
      if (a.duration && performance.now() - tr.stopped > 1500) a.currentTime = 0;
      a.play().catch(() => { /* not loaded yet, or blocked: try again next frame */ });
    }
    const fadeAt = tr.to - XFADE;
    if (!a.paused && b.paused && a.currentTime >= fadeAt) {
      b.currentTime = tr.from;
      b.volume = 0;
      b.play().catch(() => {});
    }
    let share = 0; // how far through the crossfade, 0 to 1
    if (!b.paused) {
      share = Math.min(1, Math.max(0, (a.currentTime - fadeAt) / XFADE));
      if (share >= 1 || a.paused) { a.pause(); tr.cur = 1 - tr.cur; [a, b] = [b, a]; share = 0; }
    }
    // an equal-power crossfade, so the roar holds steady through it
    a.volume = Math.min(1, tr.vol * Math.cos(share * Math.PI / 2));
    if (!b.paused) b.volume = Math.min(1, tr.vol * Math.sin(share * Math.PI / 2));
  }

  // Called once per frame with the simulation's accumulated events.
  function frame(ev) {
    if (!ac) return;
    const now = performance.now();
    if (fireGain) {
      const target = enabled ? Math.min(0.22, Math.log2(ev.burning + 1) / 40) : 0;
      fireGain.gain.setTargetAtTime(target, ac.currentTime, 0.25);
    }
    playTrack(surf, ev.surge);
    playTrack(rumble, ev.rumble);
    whistleFrame(ev.whistle);
    if (!ready()) return;
    if (ev.booms.length && now - last.boom > 70) {
      let size = 0;
      for (let k = 2; k < ev.booms.length; k += 4) size += ev.booms[k];
      boom(size);
      last.boom = now;
    }
    if (ev.hbomb.length) megaBoom();
    if (ev.bolts.length && now - last.thunder > 250) { thunder(); last.thunder = now; }
    if (ev.fission && now - last.fission > 120) { boom(Math.min(60, ev.fission * 2)); last.fission = now; }
    if (ev.rad && now - last.geiger > 25) { geiger(ev.rad); last.geiger = now; }
    if (ev.cracks && now - last.cracks > 110) { cracks(ev.cracks); last.cracks = now; }
    if (ev.howl && now - last.howl > 360) { howl(ev.howl); last.howl = now; }
    if (ev.sizzle && now - last.sizzle > 140) { sizzle(ev.sizzle); last.sizzle = now; }
    if (ev.fizz && now - last.fizz > 90) { fizz(ev.fizz); last.fizz = now; }
    if (ev.zap && now - last.zap > 160) { zap(); last.zap = now; }
    if (ev.burning) {
      const gap = 260 / Math.min(6, 1 + Math.log2(ev.burning + 1) / 2);
      if (now - last.crackle > gap * (0.5 + Math.random())) { crackle(ev.burning); last.crackle = now; }
    }
  }

  // Bright, glassy arpeggio for a discovery — like tapping a row of flasks.
  function discovery() {
    if (!ready()) return;
    const base = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    base.forEach((f, k) => {
      tone({ freq: f, dur: 1.2, type: 'sine', gain: 0.1, attack: 0.005, at: k * 0.07 });
      tone({ freq: f * 2.01, dur: 0.5, type: 'sine', gain: 0.025, attack: 0.005, at: k * 0.07 });
    });
  }
  function unlock() {
    if (!ready()) return;
    [392, 523.25, 659.25, 783.99, 1046.5, 1567.98].forEach((f, k) => {
      tone({ freq: f, dur: 1.6, type: 'triangle', gain: 0.08, attack: 0.01, at: k * 0.09 });
    });
  }
  function click() {
    if (!ready()) return;
    tone({ freq: 1400, freqEnd: 900, dur: 0.04, type: 'sine', gain: 0.04, attack: 0.002 });
  }
  // A soft granular hiss while painting; filtered by how "wet" the material is.
  function pour(kind) {
    if (!ready()) return;
    const now = performance.now();
    if (now - last.pour < 70) return;
    last.pour = now;
    const f = kind === 'liquid' ? 700 : kind === 'gas' ? 2600 : kind === 'powder' ? 4200 : 1500;
    noiseHit({ type: 'bandpass', freq: f * (0.8 + Math.random() * 0.4), q: kind === 'liquid' ? 4 : 1.2, dur: 0.09, gain: 0.025, attack: 0.01 });
  }

  function setEnabled(on) {
    enabled = on;
    if (master) master.gain.setTargetAtTime(on ? volume : 0, ac.currentTime, 0.05);
  }

  G.AudioFX = { init, frame, discovery, unlock, click, pour, setEnabled, get enabled() { return enabled; } };
})(globalThis);
