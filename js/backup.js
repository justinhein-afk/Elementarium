/* Elementarium — your progress as a file you keep (no DOM).
 * Everything the game remembers lives in this browser's storage. A backup is all of it in one
 * file: discoveries, the Journey, the Lab, Try it stars, achievements, settings and the five saved
 * worlds (not the world on screen, unless it is saved in a slot). Restoring one checks the file
 * first, then swaps it in whole, and puts back what was here if the browser runs out of room.
 * The same file is what a player's account will start from, if the game ever gets accounts.
 *
 * It also asks the browser to keep the game's storage rather than clear it when the device runs
 * short of space. Chrome and Edge decide without asking anyone (more readily once the game is
 * installed or bookmarked) and Safari likewise; Firefox asks the player. So the game asks only
 * once there is progress to lose, from a click or a key press (Firefox will not ask otherwise),
 * and at most once a week. */
(function (G) {
  'use strict';

  const KIND = 'elementarium-backup';
  const FORMAT = 1; // raise it when the file's layout changes, and keep reading the older ones
  // what belongs to this browser alone and stays out of a backup (and is left alone by a restore)
  const DEVICE = ['keepAsked'];
  const NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/; // the store's own key names
  const BIGGEST = 32 * 1024 * 1024;            // far more than a browser will store for one site
  const WEEK = 7 * 24 * 3600e3;

  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const pad = (n) => String(n).padStart(2, '0');

  // everything the store holds, as one object ready to be written to a file
  function make(store, now = Date.now()) {
    const data = {};
    for (const k of store.keys().sort()) {
      if (DEVICE.includes(k) || !NAME.test(k)) continue;
      const v = store.get(k, undefined);
      if (v !== undefined) data[k] = v;
    }
    return { kind: KIND, format: FORMAT, at: now, data };
  }

  // the file's name, with the day it was made in the player's own time
  function fileName(at = Date.now()) {
    const d = new Date(at);
    return `elementarium-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
  }

  // a file's text, checked: { ok: true, backup } or { ok: false, why }
  function read(text) {
    const no = (why) => ({ ok: false, why });
    if (typeof text !== 'string') return no('That file couldn’t be read.');
    if (text.length > BIGGEST) return no('That file is too big to be an Elementarium backup.');
    let b;
    try { b = JSON.parse(text); } catch { return no('That file isn’t an Elementarium backup.'); }
    if (!isObj(b) || b.kind !== KIND || !isObj(b.data)) return no('That file isn’t an Elementarium backup.');
    if (!(b.format >= 1)) return no('That file isn’t an Elementarium backup.');
    if (b.format > FORMAT) return no('That backup comes from a newer version of the game. Reload the page to get it, then try again.');
    const data = {};
    for (const [k, v] of Object.entries(b.data)) if (NAME.test(k) && !DEVICE.includes(k) && v !== undefined) data[k] = v;
    if (!Object.keys(data).length) return no('That backup is empty.');
    return { ok: true, backup: { kind: KIND, format: b.format, at: typeof b.at === 'number' ? b.at : 0, data } };
  }

  // what a backup (or this browser) holds, counted the way the game shows it
  // found(keys) turns the found list into the table's count (starters included)
  function summary(data, { found = (keys) => keys.length, chapters = null } = {}) {
    const arr = (v) => (Array.isArray(v) ? v : []);
    const stars = isObj(data.journey) && isObj(data.journey.stars) ? data.journey.stars : {};
    const won = Object.values(stars).filter((n) => n > 0).length;
    return {
      found: found(arr(data.found).filter((k) => typeof k === 'string')),
      chapters: chapters ? Object.keys(stars).filter((id) => stars[id] > 0 && chapters.includes(id)).length : won,
      achievements: isObj(data.achieve) ? arr(data.achieve.got).length : 0,
      worlds: arr(data.saves).filter(Boolean).length,
    };
  }

  // swap a checked backup in for everything the store holds; false (and nothing changed) if the
  // browser has no room for it
  function restore(store, backup) {
    const before = new Map();
    for (const k of store.keys()) if (!DEVICE.includes(k)) before.set(k, store.get(k, null));
    for (const k of before.keys()) store.del(k); // room first: the old saved worlds go before the new arrive
    for (const [k, v] of Object.entries(backup.data)) {
      if (store.set(k, v)) continue;
      for (const k2 of Object.keys(backup.data)) store.del(k2);
      for (const [k2, v2] of before) store.set(k2, v2);
      return false;
    }
    return true;
  }

  // ───── keeping the storage ─────
  // 'kept': the browser has promised to keep it; 'may-clear': it may clear it to free up space;
  // 'unknown': this browser can't say
  let kept = null;
  const storageApi = () => (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist ? navigator.storage : null);
  async function check() {
    const s = storageApi();
    if (!s || !s.persisted) return 'unknown';
    try { kept = await s.persisted(); } catch { return 'unknown'; }
    return kept ? 'kept' : 'may-clear';
  }
  const state = () => (kept === null ? 'unknown' : kept ? 'kept' : 'may-clear');

  // is there anything here a player would be sorry to lose?
  function hasProgress(store) {
    if (store.get('found', []).length) return true;
    const j = store.get('journey', {});
    if (j.prologue || Object.values(j.stars || {}).some((n) => n > 0)) return true;
    return store.get('saves', []).some(Boolean);
  }

  // Ask the browser to keep the storage. Call it from a click or a key press, and with nothing
  // awaited before it: Firefox only asks the player from inside one. It asks at most once a week.
  function keep(store, now = Date.now()) {
    const s = storageApi();
    if (!s || kept !== false) return null; // nothing to ask, or the answer isn't in yet
    if (now - store.get('keepAsked', 0) < WEEK || !hasProgress(store)) return null;
    store.set('keepAsked', now);
    return s.persist().then((ok) => { kept = !!ok; return kept; }, () => false);
  }

  G.Backup = { KIND, FORMAT, DEVICE, BIGGEST, make, fileName, read, summary, restore, check, state, keep, hasProgress };
})(globalThis);
