/* DEAD AIR — ui.js
 * DA.ui — everything the player reads: subtitles, objectives, prompt/crosshair, hints, toasts,
 * title cards, the fade overlay, the wristwatch, documents, choices, the shift binder
 * (journal) and the menu screens (title, shift register, pause, settings).
 * Contract: PLAN.md §6.6. Modes: title name pause settings journal doc choice.
 *
 * Layers (all inside #stage):
 *   #screens (z20)  .ui-screen: #ui-title #ui-name #ui-pause #ui-settings #ui-journal #ui-doc
 *   #hud     (z30)  .ui-hud: objectives, toasts, crosshair, prompt, look hint, hint, watch
 *   #fade    (z40)  colour overlay driven by DA.ui.fade()
 *   #ui-over (z41)  title card + subtitles + choice list (they stay readable over a fade)
 * CSS hides crosshair/prompt/objectives/watch (class .ui-xo) unless body[data-mode=explore];
 * body.ui-at-title hides the HUD and subtitles while the title (or anything over it) is up.
 *
 * Timing: the UI animates from the core 'frame' event (so DA.step drives it in tests).
 * Subtitle lifetimes, say()/think()/card() promises and choice timeouts use a UI clock that
 * stops while DA.paused; fades and typewriters run on real frame time.
 *
 * Keys: UI modes swallow the keys they own but never F1–F12 or Ctrl/Alt/Meta chords.
 * Other modules' screens: each ui screen re-appends itself to #screens when shown, so the
 * newest overlay (journal over the radio desk, doc over the journal) is always on top.
 *
 * ADDITIONS beyond PLAN.md (backwards compatible):
 *   ui.wait(sec) → Promise                     UI-clock wait (frozen while DA.paused)
 *   ui.updateSubtitle(id, {text, clarity, dur}) live re-garble/edit of a visible subtitle
 *   ui.removeSubtitle(id)
 *   ui.historyRaw(n) → [{text, speaker, name, kind, t, frag?}]  the last n REAL lines plus any jam-flood
 *     fragments posted among/after them (marked frag: true); history(n) → plain text of the last n
 *     real lines only — a flood fragment (subtitle opts.frag) is never in it and never evicts a real
 *     line (fragments are capped apart, 12); death records should drop entries with frag: true
 *   ui.speakerName(id) / ui.speakerColor(id)   DA.content.speakers lookups with fallbacks
 *   ui.objective(id) with text omitted → DA.content.objectives[id] (string or {text})
 *   ui.objectives() → copy of DA.state.objectives; ui.hasObjective(id); ui.objectiveText(id)
 *   ui.closeDoc(), ui.isDocOpen(), ui.closeChoice(id?), ui.closeJournal()
 *   ui.pause() — push 'pause' if a game runs and it is not open; ui.settings() — mode 'settings'
 *   ui.fadeLevel() → current overlay opacity; ui.clearHud() — drop transient HUD
 *   ui.markup(text, style) → HTML string (the document renderer)
 *   ui.placeName('vent_office') → 'Office vent' (interactable ids → words)
 *   subtitle opts: {color, tag, seed, frag}; say opts: {kind, name, color, clarity, radio, phone,
 *     vol, x, y, voice:false, dur} (radio/phone/clarity/vol/x/y are passed to audio.voice);
 *   choice: options may use {text|t|label}, {disabled}; opts {speaker, name}; Esc → pause
 *   doc fields: {id, title, body|text, style, where, date, masthead, headline, formNo, svg};
 *     doc(id) falls back to DA.content.notes[id] (on 'paper', labelled with place + date).
 *     newspaper: an opening '# NAME' in the body is the masthead and a following short
 *     '·'-separated line the dateline; form: an opening '# TITLE' goes in the header box;
 *     blueprint: doc.svg is appended only when the body carries no <svg> of its own.
 *   markup extras: '### h3', '- item' lists, '[x] / [ ] checkboxes', '~~strike~~',
 *     '||redacted||', 'LABEL: value' field rows (form style), a paragraph that is only
 *     **bold** becomes a lead line (.ui-d-lead: story headlines), raw <svg>…</svg> anywhere.
 *   journal: 1–5 / ←→ / L switch tabs; TAPES offers INSERT INTO DECK while mode 'radio' is in
 *     the stack (DA.radio.insertTape); OBJECTIVES shows SUNRISE (DA.state.sunrise, '--:--'
 *     when flag sunrise_unknown); LOG/NOTES tabs carry a dot for unseen entries/unread notes.
 *   Events: subtitle {id, text, speaker, kind} · objective:set {id, text, glitch} ·
 *     objective:done {id} · objective:remove {id} · watch {on} · journal:open {tab} ·
 *     journal:close · journal:tab {tab} · settings:open · settings:close
 *     (journal:log-open/close carry {count}; doc:open {id, style, title}; doc:close {id};
 *     choice:made {id, text, index, timedOut})
 *   State: DA.state.ui = {watch: bool, read: {docOrNoteId: true}, logSeen: n, logSeenSig: hash}
 *   Body classes: ui-at-title (title in the stack), ui-card-on (title card showing).
 *
 * WAVE-3 ADDITIONS (behaviour; the API is unchanged):
 *   Objectives in cursor modes (decision 1): an objective set or changed while the list is hidden
 *     (radio desk, CCTV, map, a document…) raises a toast 'NEW DUTY — <text>' (not in menus or
 *     scenes), and every such line flashes again the moment explore is back on top.
 *   Hints (decision 20): ui.hint() draws only while 'explore' or 'radio' is on top; posted over a
 *     document, the binder, a device or a menu it is held (up to 25 s of UI time) and shown on return.
 *   Menus, settings rows and choices select on hover only after the pointer has really moved since
 *     they opened (a resting cursor no longer steals the keyboard selection; the settings screen also
 *     holds back mouseenter/over for rows other modules inject, e.g. the minimap's).
 *   The title always sets its complete ambience bed (DA.audio.resetAmbience if present).
 *   The shift register on the name screen is DA.content.register (rows + your line) — the same page
 *     as the lobby's doc_signin; a built-in copy of that page is the fallback.
 *   LOG tab dot: new entries OR an entry that changed since the log was last read (logSeenSig).
 *   Legibility: small functional text has a px floor (≈8 px) at small window sizes; the interaction
 *     prompt is larger (≥13 px) with a soft dark backing.
 *
 * FIX-C2 (behaviour; the API is unchanged):
 *   Subtitle opts.frag (radio's ACT 5 jam flood): shown as usual, 'subtitle' event carries frag: true,
 *     kept out of history(n) (see historyRaw above).
 *   Hints at the desk: while the mic panel is open the hint is held (hidden that frame via CSS :has,
 *     its remaining time kept) and shown again when the panel closes — never over the panel's rows.
 *   Toasts at the desk live on the bare wall right of the rack, under the CCTV MONITOR panel and above
 *     the quick-reference card (35.8u–63.2u), newest on top; the oldest are retired when the stack
 *     would not fit there (measured on the finished text), also when the player sits down with toasts
 *     already up. Other modes keep the 3-toast cap.
 *   Title cards never draw over a document, the binder, a device close-up, the map or a menu: while
 *     one is on top the card is held (hidden, clock stopped) and starts over from its fade-in once the
 *     player is back; card() resolves a full duration after that.
 *   Documents come up opaque (slide + brighten, no opacity fade): a half-transparent sheet let the
 *     world behind show through (the lobby's in-world register drew grey bars across doc_signin).
 *
 * FIX-D ADDITIONS (additive API + behaviour):
 *   ui.countdown(secs, {label, get, urgent = 10, hold = 1.5}) → handle {done: Promise<bool>, cancel(),
 *     set(secs), left()} — a red LCD countdown at the top centre of the HUD (decision 5: the DESTROY
 *     escape, e.g. countdown(55, {label: 'CAR', get: () => deadline - DA.simTime})). One at a time
 *     (a new one replaces the old: its done → false); done → true the moment it reaches 0, then 0:00
 *     blinks for `hold` s and it goes away; countdown(null | 0) cancels (done → false). Without
 *     opts.get it runs on the UI clock (frozen while paused). The last `urgent` s pulse. Hidden
 *     under the menus, the title/register, the plan and the cinematics; cleared by a new night/load.
 *   ui.hint(text, dur, {mode}) — a hint belongs to a mode (default 'radio' when posted while seated):
 *     a desk hint is retired the moment the player stands (never lingers over the 3D view) and a held
 *     one is dropped once its mode has left the stack; {mode} holds a hint until that mode is on top.
 *   Title cards over a cursor/opaque mode (the radio desk, the phone, a choice…) get a dark full-stage
 *     scrim (.ui-card-scrim, faded with the card; body.ui-card-scrim-on while it shows). None over the
 *     plain world view or the cinematics.
 *   Handwriting (decision 8): 'paper' documents written by hand — doc.hand / content hand: true, the
 *     duct notes (DA.content.notes; hand: false opts out) and Hollis's sticky note — render in
 *     var(--font-hand) (sheet class s-hand), each line tilted/drifted a little; a sheet of '— ' slips
 *     (note_wad) becomes torn scraps on the duct floor (s-slips) with its plain paragraph as the
 *     narrator's description; in hand docs 'X (crossed out)' strikes X ('… (crossed out again)'
 *     twice) and '(later, different pen:) Y' writes Y in a second ink. Typed docs keep the typewriter.
 *     A note handed over as an object ({id: noteId, …}) still gets its place + date label.
 *     doc:open carries {hand}.
 *   Settings: a bool switch's OFF / ON halves set that value (never a blind toggle); a click on the
 *     rest of the row toggles; ← / A = OFF, → / D = ON, Enter / Space toggle. Row defs may carry
 *     warn() (a live amber line under the note) and unavailable {value: fn} (dims a choice): VOICES
 *     says when the browser has no speech voices (DA.audio.systemVoicesAvailable() when present, else
 *     DA.audio.systemVoices() / speechSynthesis.getVoices(); repainted on 'voiceschanged').
 *   Pause: LAST ARCHIVE is DA.archive.latest(DA.state.night) — what death / quit would return to.
 *   Legibility at 854×480: settings row notes, the letterhead sub-line and stamp have an 8 px floor
 *     (the letterhead wraps inside itself instead of running out of the sheet).
 */
(function () {
  'use strict';
  const DA = (window.DA = window.DA || {});
  const U = DA.util;
  const ui = (DA.ui = DA.ui || {});

  /* ============================================================ helpers */
  const fmt = (t) => (t == null ? '' : DA.fmt ? DA.fmt(String(t)) : String(t));
  const C = (k) => (DA.content && DA.content[k]) || {};
  const el = U.el;
  const clamp = U.clamp;
  const pretty = (id) => String(id == null ? '' : id).replace(/[_-]+/g, ' ').trim().toUpperCase();
  const uiState = () => {
    if (!DA.state.ui || typeof DA.state.ui !== 'object') DA.state.ui = {};
    return DA.state.ui;
  };
  const objList = () => {
    if (!Array.isArray(DA.state.objectives)) DA.state.objectives = [];
    return DA.state.objectives;
  };
  /** Null-guarded call into DA.audio. */
  function aud(fn, ...args) {
    const a = DA.audio;
    if (!a || typeof a[fn] !== 'function') return null;
    try { return a[fn](...args); } catch (e) { console.error('[ui→audio.' + fn + ']', e); return null; }
  }
  const sfx = (name, vol) => aud('play', name, { vol: vol == null ? 1 : vol });
  const topName = () => { const t = DA.modes && DA.modes.top(); return t ? t.name : ''; };
  const isRepeat = (e) => !!(e && e.repeat);
  /** Browser keys (F1–F12, Ctrl/Alt/Meta chords) are never swallowed by UI modes. */
  const browserKey = (e) => !!(e && (/^F\d{1,2}$/.test(e.code) || e.ctrlKey || e.metaKey || e.altKey));

  const R = {}; // DOM registry (filled on boot)
  let booted = false;
  let uiTime = 0; // real seconds of UI animation

  /*
   * Hover selection only after the pointer really moves. A menu, the settings list or a choice
   * that opens under a resting cursor must keep its keyboard selection: browsers send
   * mouseenter (and synthetic moves) to whatever appears under a stationary pointer.
   * armHover() is called when such a list opens; hoverOk() turns true after a move of > 2 px.
   */
  const PTR = { x: NaN, y: NaN, ax: NaN, ay: NaN, need: false };
  window.addEventListener('mousemove', (e) => {
    PTR.x = e.clientX;
    PTR.y = e.clientY;
    if (PTR.need && (isNaN(PTR.ax) || Math.abs(e.clientX - PTR.ax) + Math.abs(e.clientY - PTR.ay) > 2)) PTR.need = false;
  }, true);
  function armHover() { PTR.need = true; PTR.ax = PTR.x; PTR.ay = PTR.y; }
  const hoverOk = () => !PTR.need;
  /** Select-on-hover for a list row: mouseenter/mousemove call fn only after a real pointer move. */
  function onHover(elm, fn) {
    const h = () => { if (hoverOk()) fn(); };
    elm.addEventListener('mouseenter', h);
    elm.addEventListener('mousemove', h);
  }

  /* ========================================================== UI clock */
  const waits = [];
  /** Promise that resolves after `sec` of UI time (does not advance while DA.paused). */
  ui.wait = (sec) => new Promise((res) => waits.push({ t: Math.max(0, +sec || 0), res }));
  function updateWaits(gdt) {
    if (!waits.length) return;
    for (const w of waits.slice()) {
      w.t -= gdt;
      if (w.t <= 0) {
        const i = waits.indexOf(w);
        if (i >= 0) waits.splice(i, 1);
        w.res(true);
      }
    }
  }

  /* ========================================================= typewriter */
  const typers = new Set();
  const typerOf = new WeakMap();
  /** Type `text` into element `elm` (replaces its content). Returns the typer record. */
  function typeInto(elm, text, opts) {
    opts = opts || {};
    stopTyper(elm, false);
    elm.textContent = '';
    const ty = {
      elm, text: String(text), tn: document.createTextNode(''), caret: null, pos: 0, shown: -1,
      cps: opts.cps || 40, delay: opts.delay || 0, jitter: !!opts.jitter, onDone: opts.onDone || null,
      noCaret: !!opts.noCaret,
    };
    elm.appendChild(ty.tn);
    typers.add(ty);
    typerOf.set(elm, ty);
    return ty;
  }
  function stopTyper(elm, finish) {
    const ty = typerOf.get(elm);
    if (!ty || !typers.has(ty)) return;
    typers.delete(ty);
    if (ty.caret) ty.caret.remove();
    if (finish) ty.tn.nodeValue = ty.text;
  }
  function setText(elm, text) {
    stopTyper(elm, false);
    elm.textContent = text;
  }
  function updateTypers(dt) {
    for (const ty of typers) {
      if (!ty.elm.isConnected) { typers.delete(ty); continue; }
      if (ty.delay > 0) { ty.delay -= dt; continue; }
      if (!ty.caret && !ty.noCaret) {
        ty.caret = el('span', { class: 'ui-caret' });
        ty.elm.appendChild(ty.caret);
      }
      const speed = ty.jitter ? (Math.random() < 0.08 ? 0 : 0.3 + Math.random() * 1.6) : 1;
      ty.pos += ty.cps * dt * speed;
      const n = Math.min(ty.text.length, Math.floor(ty.pos));
      if (n !== ty.shown) { ty.tn.nodeValue = ty.text.slice(0, n); ty.shown = n; }
      if (n >= ty.text.length) {
        typers.delete(ty);
        if (ty.caret) ty.caret.remove();
        if (ty.onDone) try { ty.onDone(); } catch (e) { console.error('[ui typer]', e); }
      }
    }
  }

  /* ============================================ glitch character flicker */
  const GLITCH_CH = '▒█#/\\_|%?01';
  const flickers = new Map(); // element → {text, restoreAt}
  function addFlicker(elm, text) { if (text && String(text).trim()) flickers.set(elm, { text, restoreAt: 0 }); }
  function updateFlickers(dt) {
    for (const [elm, f] of flickers) {
      const node = elm.firstChild;
      if (!elm.isConnected || !node || node.nodeType !== 3) { flickers.delete(elm); continue; }
      if (typers.has(typerOf.get(elm))) continue;
      if (f.restoreAt) {
        if (uiTime >= f.restoreAt) { node.nodeValue = f.text; f.restoreAt = 0; }
        continue;
      }
      if (node.nodeValue !== f.text) { flickers.delete(elm); continue; }
      if (Math.random() < dt * 0.9) {
        const chars = [...f.text];
        const n = 1 + (Math.random() < 0.3 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          const i = Math.floor(Math.random() * chars.length);
          if (chars[i] !== ' ') chars[i] = GLITCH_CH[Math.floor(Math.random() * GLITCH_CH.length)];
        }
        node.nodeValue = chars.join('');
        f.restoreAt = uiTime + 0.05 + Math.random() * 0.1;
      }
    }
  }

  /* ========================================================= subtitles */
  const KINDS = new Set(['speech', 'radio', 'phone', 'sfx', 'thought', 'system']);
  const SUB_MAX = 3;
  const subs = []; // live records, oldest first
  const hist = [];
  let subSeq = 0;

  const speakerRec = (id) => (id && C('speakers')[id]) || null;
  ui.speakerName = (id) => {
    const s = speakerRec(id);
    return fmt((s && s.name) || pretty(id));
  };
  ui.speakerColor = (id) => {
    const s = speakerRec(id);
    return (s && s.color) || null;
  };
  const bracket = (t) => (/^\s*[[(].*[\])]\s*$/.test(t) ? t : `[${t}]`);

  /** Show a subtitle line. Returns its id (null when an sfx caption is disabled). */
  ui.subtitle = (text, opts) => {
    opts = opts || {};
    const kind = KINDS.has(opts.kind) ? opts.kind : 'speech';
    const plain = fmt(text);
    const speaker = opts.speaker || null;
    const name = opts.name != null ? fmt(opts.name) : speaker ? ui.speakerName(speaker) : '';
    // history keeps plain, ungarbled lines (deaths replay them); the jam flood's fragments
    // (opts.frag) are kept apart — marked, capped, never counted as something that was said
    histPush(kind === 'sfx' ? bracket(plain) : plain, speaker, name, kind, !!opts.frag);
    if (kind === 'sfx' && DA.settings && DA.settings.subtitles === false) return null;
    const dur = opts.dur || (kind === 'sfx' ? Math.max(2.2, U.lineDur(plain)) : U.lineDur(plain) + 0.9);
    const clarity = opts.clarity == null ? null : clamp(+opts.clarity, 0, 1);
    // a repeated hail refreshes the line instead of stacking a copy
    const dup = subs.find((s) => !s.out && s.text === plain && s.kind === kind && s.speaker === speaker);
    if (dup) {
      dup.t = Math.max(dup.t, dur);
      if (clarity != null && clarity !== dup.clarity) { dup.clarity = clarity; paintSub(dup); }
      return dup.id;
    }
    const rec = {
      id: ++subSeq, text: plain, kind, speaker, name, clarity, t: dur, out: false, removeAt: 0,
      color: opts.color || ui.speakerColor(speaker),
      tag: opts.tag != null ? opts.tag : kind === 'radio' ? '[RADIO]' : kind === 'phone' ? '[PHONE]' : '',
      seed: opts.seed || subSeq,
    };
    if (booted) {
      rec.el = buildSub(rec);
      R.subs.appendChild(rec.el);
    }
    subs.push(rec);
    const live = subs.filter((s) => !s.out);
    for (let i = 0; i < live.length - SUB_MAX; i++) retireSub(live[i], true);
    const ev = { id: rec.id, text: plain, speaker, kind };
    if (opts.frag) ev.frag = true;
    DA.bus.emit('subtitle', ev);
    return rec.id;
  };
  const HIST_MAX = 40, HIST_FRAG_MAX = 12;
  /** Record a subtitle line. A repeat of the last line of the same sort (a hail) is not re-added. */
  function histPush(text, speaker, name, kind, frag) {
    let last = null;
    for (let i = hist.length - 1; i >= 0; i--) if (!hist[i].frag === !frag) { last = hist[i]; break; }
    if (last && last.text === text && last.speaker === speaker) return;
    const h = { text, speaker, name, kind, t: DA.simTime || 0 };
    if (frag) h.frag = true;
    hist.push(h);
    // a flood never pushes real lines out: real lines and fragments are capped separately
    let real = 0, frags = 0;
    for (const x of hist) if (x.frag) frags++; else real++;
    while (real > HIST_MAX) { const x = hist.shift(); if (x.frag) frags--; else real--; }
    while (frags > HIST_FRAG_MAX) { const i = hist.findIndex((x) => x.frag); hist.splice(i, 1); frags--; }
  }
  function buildSub(rec) {
    const e = el('div', { class: 'ui-sub k-' + rec.kind });
    if (rec.tag) e.appendChild(el('span', { class: 'ui-sub-tag', text: rec.tag }));
    if (/[\p{L}\p{N}]/u.test(rec.name || '') && (rec.kind === 'speech' || rec.kind === 'radio' || rec.kind === 'phone')) {
      e.appendChild(el('span', { class: 'ui-sub-name', text: rec.name, style: rec.color ? { color: rec.color } : null }));
    }
    rec.textEl = el('span', { class: 'ui-sub-text' });
    e.appendChild(rec.textEl);
    paintSub(rec);
    return e;
  }
  function paintSub(rec) {
    if (!rec.textEl) return;
    let t = rec.text;
    const c = rec.clarity;
    if ((rec.kind === 'radio' || rec.kind === 'phone') && c != null && c < 0.97) t = U.garble(t, c, rec.seed);
    if (rec.kind === 'sfx') t = bracket(t);
    rec.textEl.textContent = t;
    // weak signals read fainter (a CSS variable so the fade-out class still wins)
    if (rec.el) rec.el.style.setProperty('--ui-cl', c != null && rec.kind === 'radio' ? (0.55 + 0.45 * c).toFixed(2) : '1');
  }
  function retireSub(rec, fast) {
    if (rec.out) return;
    rec.out = true;
    rec.removeAt = uiTime + (fast ? 0.15 : 0.45);
    if (rec.el) {
      rec.el.classList.add(fast ? 'gone' : 'out');
    }
  }
  function updateSubs(gdt) {
    for (let i = subs.length - 1; i >= 0; i--) {
      const s = subs[i];
      if (!s.out) {
        s.t -= gdt;
        if (s.t <= 0) retireSub(s, false);
      } else if (uiTime >= s.removeAt) {
        if (s.el) s.el.remove();
        subs.splice(i, 1);
      }
    }
  }
  ui.updateSubtitle = (id, patch) => {
    const s = subs.find((r) => r.id === id);
    if (!s || !patch) return false;
    if (patch.text != null) s.text = fmt(patch.text);
    if (patch.clarity != null) s.clarity = clamp(+patch.clarity, 0, 1);
    if (patch.dur != null) s.t = patch.dur;
    paintSub(s);
    return true;
  };
  ui.removeSubtitle = (id) => {
    const s = subs.find((r) => r.id === id);
    if (s) retireSub(s, false);
  };
  ui.clearSubtitles = () => {
    for (const s of subs) if (s.el) s.el.remove();
    subs.length = 0;
  };
  /** Last n subtitle lines as plain strings (oldest first) — never the jam flood's fragments. */
  ui.history = (n) => hist.filter((h) => !h.frag).slice(-(n || 3)).map((h) => h.text);
  /**
   * The last n real lines as records (oldest first), with any flood fragments posted among or
   * after them included and marked {frag: true} — so a flood never crowds real lines out.
   */
  ui.historyRaw = (n) => {
    n = n || 3;
    let i = hist.length, real = 0;
    while (i > 0 && real < n) { i--; if (!hist[i].frag) real++; }
    return hist.slice(i).map((h) => Object.assign({}, h));
  };

  /** Speech subtitle + synthesized voice. Resolves after DA.util.lineDur(text). */
  ui.say = (speaker, text, opts) => {
    opts = opts || {};
    const line = fmt(text);
    const kind = KINDS.has(opts.kind) ? opts.kind : 'speech';
    ui.subtitle(line, {
      speaker, kind, name: opts.name, color: opts.color, clarity: opts.clarity, tag: opts.tag,
      dur: opts.dur,
    });
    if (opts.voice !== false) {
      const vo = {};
      if (kind === 'radio' || opts.radio) vo.radio = true;
      if (kind === 'phone' || opts.phone) vo.phone = true;
      for (const k of ['clarity', 'vol', 'x', 'y']) if (opts[k] != null) vo[k] = opts[k];
      aud('voice', line, speaker, vo);
    }
    return ui.wait(U.lineDur(line));
  };
  /** Inner monologue (italic, no name, no voice). */
  ui.think = (text, opts) => {
    const line = fmt(text);
    ui.subtitle(line, { kind: 'thought', dur: opts && opts.dur });
    return ui.wait(U.lineDur(line));
  };

  /* ======================================================== objectives */
  const HUD_OBJ_MAX = 6;
  const hudObjs = new Map(); // id → {el, textEl, markEl, doneAt, goneAt}
  function contentObjText(id) {
    const o = C('objectives')[id];
    if (!o) return null;
    return typeof o === 'string' ? o : o.text || o.t || null;
  }
  /** Add or update an objective. Text omitted → DA.content.objectives[id]. */
  ui.objective = (id, text, opts) => {
    if (id == null) return;
    opts = opts || {};
    if (text == null) text = contentObjText(id) || pretty(id);
    const list = objList();
    let o = list.find((x) => x.id === id);
    const glitch = !!opts.glitch;
    let changed = true;
    if (o) {
      changed = o.text !== text || !!o.glitch !== glitch || o.done;
      o.text = text;
      o.glitch = glitch;
      o.done = false;
    } else {
      o = { id, text, done: false, glitch };
      list.push(o);
    }
    if (changed) hudObjShow(o, true);
    refreshJournal('objectives');
    if (changed) objNotice(o);
    DA.bus.emit('objective:set', { id, text, glitch });
  };
  /*
   * Decision 1: the objective list is explore-only HUD. A duty set while the player sits at the
   * radio desk (or any other cursor mode: CCTV, the map, a document…) raises a toast, which shows
   * in every mode, and the new line flashes again the moment they are back on their feet.
   */
  const QUIET_MODES = new Set(['title', 'name', 'pause', 'settings', 'drive', 'cutscene', 'multiverse', 'death', 'ending', 'credits']);
  const objUnseen = new Set();
  function objNotice(o) {
    if (!booted || !DA.running) return;
    const top = topName();
    if (!top || top === 'explore') return;
    objUnseen.add(o.id);
    if (QUIET_MODES.has(top) || DA.modes.stack.some((m) => QUIET_MODES.has(m.name))) return;
    ui.toast((o.glitch ? '' : 'NEW DUTY — ') + fmt(o.text), 4);
  }
  function objReflash() {
    if (!objUnseen.size || topName() !== 'explore') return;
    let d = 0.25;
    for (const id of objUnseen) {
      const h = hudObjs.get(id);
      if (!h || h.doneAt || h.goneAt) continue;
      h.el.classList.remove('flash');
      void h.el.offsetWidth;
      setTimeout(() => { if (h.el.isConnected && !h.doneAt) h.el.classList.add('flash'); }, d * 1000);
      d += 0.3;
    }
    objUnseen.clear();
  }
  ui.objectiveDone = (id) => {
    const o = objList().find((x) => x.id === id);
    if (!o || o.done) return;
    o.done = true;
    const h = hudObjs.get(id);
    if (h) {
      stopTyper(h.textEl, true);
      h.el.classList.add('done');
      h.el.classList.remove('flash');
      h.doneAt = uiTime;
    }
    refreshJournal('objectives');
    DA.bus.emit('objective:done', { id });
  };
  ui.objectiveRemove = (id) => {
    const list = objList();
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0) list.splice(i, 1);
    const h = hudObjs.get(id);
    if (h) hudObjFadeOut(id, h);
    refreshJournal('objectives');
    DA.bus.emit('objective:remove', { id });
  };
  ui.objectivesClear = () => {
    objList().length = 0;
    for (const [id, h] of hudObjs) hudObjFadeOut(id, h);
    refreshJournal('objectives');
  };
  ui.objectives = () => objList().map((o) => Object.assign({}, o));
  ui.hasObjective = (id) => objList().some((o) => o.id === id && !o.done);
  ui.objectiveText = (id) => { const o = objList().find((x) => x.id === id); return o ? fmt(o.text) : null; };

  function hudObjShow(o, animate, delay) {
    if (!booted) return;
    let h = hudObjs.get(o.id);
    if (!h) {
      h = { el: el('div', { class: 'ui-obj', dataset: { id: o.id } }), doneAt: 0, goneAt: 0 };
      h.markEl = el('span', { class: 'ui-obj-mark' });
      h.textEl = el('span', { class: 'ui-obj-text' });
      h.el.append(h.markEl, h.textEl);
      h.textEl.addEventListener('animationend', (e) => { if (e.animationName === 'ui-obj-flash') h.el.classList.remove('flash'); });
      R.objs.appendChild(h.el);
      hudObjs.set(o.id, h);
    }
    h.doneAt = 0;
    h.goneAt = 0;
    h.el.classList.remove('done', 'gone');
    h.textEl.classList.toggle('glitch', !!o.glitch);
    h.el.classList.toggle('is-glitch', !!o.glitch);
    const text = fmt(o.text);
    flickers.delete(h.textEl);
    if (animate) {
      h.el.classList.remove('flash');
      void h.el.offsetWidth; // restart the flash animation
      h.el.classList.add('flash');
      typeInto(h.textEl, text, {
        cps: o.glitch ? 26 : 42, delay: delay || 0, jitter: !!o.glitch,
        onDone: () => { if (o.glitch) addFlicker(h.textEl, text); },
      });
    } else {
      setText(h.textEl, text);
      if (o.glitch) addFlicker(h.textEl, text);
    }
    layoutHudObjs();
  }
  function hudObjFadeOut(id, h) {
    if (h.goneAt) return;
    h.el.classList.add('gone');
    h.goneAt = uiTime + 1.0;
  }
  function layoutHudObjs() {
    // keep state order; cap the visible list and summarize the overflow
    let shown = 0, hidden = 0;
    const want = [];
    for (const o of objList()) {
      const h = hudObjs.get(o.id);
      if (!h) continue;
      want.push(h.el);
      const visible = shown < HUD_OBJ_MAX || h.doneAt;
      h.el.classList.toggle('ui-off', !visible);
      if (visible) shown++;
      else hidden++;
    }
    // only touch the DOM order when it is actually wrong (moving a node restarts its animations)
    const set = new Set(want);
    const cur = [...R.objs.children].filter((c) => set.has(c));
    if (cur.length !== want.length || cur.some((c, i) => c !== want[i])) for (const e of want) R.objs.appendChild(e);
    if (!R.objMore) R.objMore = el('div', { class: 'ui-obj-more' });
    R.objMore.textContent = hidden ? `+${hidden} more — TAB` : '';
    if (R.objs.lastChild !== R.objMore) R.objs.appendChild(R.objMore);
  }
  function updateObjectives() {
    for (const [id, h] of hudObjs) {
      if (h.doneAt && !h.goneAt && uiTime - h.doneAt >= 3) hudObjFadeOut(id, h);
      if (h.goneAt && uiTime >= h.goneAt) {
        h.el.remove();
        hudObjs.delete(id);
        layoutHudObjs();
      }
    }
  }
  function rebuildHudObjectives() {
    if (!booted) return;
    for (const [, h] of hudObjs) h.el.remove();
    hudObjs.clear();
    let d = 0.4;
    for (const o of objList()) {
      if (o.done) continue;
      hudObjShow(o, true, d);
      d += 0.25;
    }
    layoutHudObjs();
  }

  /* ============================================= prompt / crosshair / hint */
  let promptText = null;
  ui.prompt = (text) => {
    const s = text ? fmt(text) : null;
    if (s === promptText) return;
    promptText = s;
    if (!booted) return;
    R.prompt.textContent = s || '';
    R.prompt.classList.toggle('on', !!s);
    R.cross.classList.toggle('hot', !!s);
  };
  ui.crosshair = (on) => { if (booted) R.cross.classList.toggle('ui-off', on === false); };
  /*
   * Control hints (decision 20): drawn only while the player walks (explore) or sits at the desk
   * (radio). A hint that arrives over a document, the binder or a device close-up waits (up to
   * HINT_HOLD s of UI time) and shows once the player is back; CSS hides one already showing.
   */
  let hintT = 0, hintPending = null, hintText = null;
  const HINT_HOLD = 25;
  /*
   * At the desk a hint sits where the mic panel opens (over the RX strip, 64%): while the panel
   * is up the hint is held — hidden at once (CSS :has) with its remaining time kept — and it
   * comes back when the panel closes.
   */
  const DESK_PANELS = '.radio-desk .radio-micpanel:not(.hidden)';
  const deskPanelOpen = () => !!document.querySelector(DESK_PANELS);
  const hintModeOk = () => {
    const t = topName();
    return t === 'explore' || (t === 'radio' && !deskPanelOpen());
  };
  /*
   * A hint belongs to a mode (opts.mode, default: 'radio' when posted at the desk): a desk hint
   * ('Wheel or ← → to tune…') is retired the moment the player stands up — it never lingers over
   * the 3D view where those keys do something else — and one held for later is dropped once its
   * mode has left the stack.
   */
  let hintMode = null;
  ui.hint = (text, dur, opts) => {
    if (!booted) return;
    if (!text) { hintT = 0; hintPending = null; hintText = null; hintMode = null; R.hint.classList.remove('on'); return; }
    const mode = (opts && opts.mode) || (topName() === 'radio' ? 'radio' : null);
    if (!hintModeOk() || (mode && topName() !== mode)) {
      // held until its mode is on top; dropped if that mode was up and has left meanwhile
      hintPending = { text, dur, at: uiTime, mode, seen: !!(mode && DA.modes.has(mode)) };
      return;
    }
    hintPending = null;
    hintText = text;
    hintMode = mode;
    R.hint.textContent = fmt(text);
    R.hint.classList.add('on');
    hintT = dur || 4;
  };
  function updateHint(gdt) {
    if (hintT > 0) {
      hintT -= gdt;
      if (hintT <= 0) { R.hint.classList.remove('on'); hintMode = null; }
      else if (hintMode && hintMode !== 'explore' && !DA.modes.has(hintMode)) {
        // its mode left the stack (stood up from the desk): retire it for good
        hintT = 0;
        hintMode = null;
        R.hint.classList.remove('on');
      } else if (topName() === 'radio' && deskPanelOpen()) {
        // a desk panel opened over a showing hint: hold the rest of it for when the panel closes
        hintPending = { text: hintText, dur: Math.max(1.5, hintT), at: uiTime, mode: hintMode, seen: true };
        hintT = 0;
        R.hint.classList.remove('on');
      }
    }
    if (hintPending) {
      const h = hintPending;
      if (h.mode && !h.seen && DA.modes.has(h.mode)) h.seen = true;
      if (uiTime - h.at > HINT_HOLD || !DA.running || (h.seen && h.mode !== 'explore' && !DA.modes.has(h.mode))) hintPending = null;
      else if (hintModeOk() && !DA.paused && (!h.mode || topName() === h.mode)) { hintPending = null; ui.hint(h.text, h.dur, { mode: h.mode }); }
    }
  }
  let lookT = 0, lookOn = false;
  function updateLook(dt) {
    const want = topName() === 'explore' && DA.running && !DA.paused && !(DA.input && DA.input.locked);
    lookT = want ? lookT + dt : 0;
    const on = lookT > 0.6;
    if (on !== lookOn) { lookOn = on; R.look.classList.toggle('on', on); }
  }

  /* ============================================================ toasts */
  const toasts = [];
  const TOAST_MAX = 3;
  ui.toast = (text, dur) => {
    if (!booted || !text) return;
    const span = el('span', { class: 'ui-toast-t' });
    const e = el('div', { class: 'ui-toast' }, span);
    R.toasts.appendChild(e);
    const s = fmt(text);
    typeInto(span, s, { cps: 48 });
    toasts.push({ el: e, text: s, t: (dur || 3.5) + s.length / 48, out: 0 });
    fitToasts();
  };
  function retireToast(x) {
    x.out = uiTime + 0.4;
    x.el.classList.add('out');
  }
  /*
   * At most TOAST_MAX live toasts — and where the stack is given a max-height (the bare wall
   * under the CCTV panel at the radio desk, ui.css) only as many as fit there, newest kept.
   * Heights are measured on the finished text (a hidden twin), not the half-typed line.
   */
  function fitToasts() {
    if (!booted) return;
    const live = toasts.filter((x) => !x.out);
    while (live.length > TOAST_MAX) retireToast(live.shift());
    if (live.length < 2) return;
    const cs = getComputedStyle(R.toasts);
    const maxH = parseFloat(cs.maxHeight);
    if (!(maxH > 0)) return;
    const gap = parseFloat(cs.rowGap) || 0;
    const hs = live.map((x) => toastHeight(x.text));
    let total = hs.reduce((a, h) => a + h, 0) + gap * (live.length - 1);
    while (live.length > 1 && total > maxH + 0.5) {
      total -= hs.shift() + gap;
      retireToast(live.shift());
    }
  }
  function toastHeight(text) {
    const m = R.toastMeasure;
    if (m.parentNode !== R.toasts) R.toasts.appendChild(m);
    m.firstChild.textContent = text;
    return m.offsetHeight;
  }
  function updateToasts(gdt) {
    for (let i = toasts.length - 1; i >= 0; i--) {
      const t = toasts[i];
      if (!t.out) {
        t.t -= gdt;
        if (t.t <= 0) { t.out = uiTime + 0.6; t.el.classList.add('out'); }
      } else if (uiTime >= t.out) {
        t.el.remove();
        toasts.splice(i, 1);
      }
    }
  }

  /* ======================================================= title card */
  let cardRec = null;
  ui.card = (title, sub, dur) =>
    new Promise((res) => {
      if (!booted) return res(true);
      if (cardRec) finishCard();
      dur = Math.max(1.5, dur || 5);
      const edge = Math.min(1.8, dur * 0.3);
      R.cardTitle.textContent = fmt(title || '');
      R.cardSub.textContent = fmt(sub || '');
      R.cardSub.classList.toggle('ui-off', !sub);
      cardRec = { t: 0, dur, edge, res };
      R.card.style.opacity = '0';
      R.card.classList.add('on');
      document.body.classList.add('ui-card-on');
    });
  function finishCard() {
    const c = cardRec;
    cardRec = null;
    document.body.classList.remove('ui-card-on', 'ui-card-scrim-on');
    R.card.classList.remove('on');
    R.card.style.opacity = '0';
    R.cardScrim.style.opacity = '0';
    if (c) c.res(true);
  }
  /*
   * Decision 5: a card that plays while a cursor or opaque mode is up (the radio desk, the phone,
   * a choice…) gets a dark full-stage scrim behind it, faded with the card — the busy desk DOM
   * made the white spaced title unreadable. Over the plain world view (explore) and the
   * cinematics (which compose their own backdrops) there is no scrim.
   */
  const SCENE_MODES = new Set(['drive', 'cutscene', 'multiverse', 'death', 'ending', 'credits']);
  function cardScrimWanted() {
    const t = topName();
    return !!t && t !== 'explore' && !SCENE_MODES.has(t);
  }
  /*
   * A title card never draws over a document, the binder, a device close-up, the map or a menu:
   * while one of those is on top the card is held — hidden, its clock stopped — and once the
   * player is back it starts over from the fade-in (the story awaiting card() waits with it).
   */
  const CARD_HOLD_MODES = new Set(['doc', 'journal', 'pause', 'settings', 'plan', 'debug_beats', 'debug_map']);
  function cardHeld() {
    const t = topName();
    if (!t) return false;
    if (CARD_HOLD_MODES.has(t)) return true;
    const D = DA.devices;
    try { return !!(D && typeof D.names === 'function' && D.names().indexOf(t) >= 0); } catch (e) { return false; }
  }
  function updateCard(gdt) {
    const c = cardRec;
    if (!c) return;
    if (cardHeld()) {
      if (!c.held) {
        c.held = true;
        R.card.classList.remove('on');
        R.card.style.opacity = '0';
        R.cardScrim.style.opacity = '0';
        document.body.classList.remove('ui-card-on', 'ui-card-scrim-on');
      }
      return;
    }
    if (c.held) {
      c.held = false;
      c.t = 0;
      R.card.classList.add('on');
      document.body.classList.add('ui-card-on');
    }
    c.t += gdt;
    const a = c.t < c.edge ? c.t / c.edge : c.t > c.dur - c.edge ? (c.dur - c.t) / c.edge : 1;
    const e = U.smoothstep(0, 1, clamp(a, 0, 1));
    R.card.style.opacity = e.toFixed(3);
    // the scrim follows the card; it eases in/out over ~0.4 s when the mode under it changes
    const want = cardScrimWanted() ? e : 0;
    c.scrim = c.scrim == null ? want : c.scrim + (want - c.scrim) * Math.min(1, gdt * 6);
    R.cardScrim.style.opacity = c.scrim.toFixed(3);
    document.body.classList.toggle('ui-card-scrim-on', c.scrim > 0.02);
    R.cardTitle.style.letterSpacing = (0.62 + 0.16 * (c.t / c.dur)).toFixed(3) + 'em';
    if (c.t >= c.dur) finishCard();
  }

  /* ========================================================= countdown */
  /*
   * DA.ui.countdown(secs, {label}) — decision 5: a red LCD countdown at the top centre of the HUD
   * (the DESTROY escape: 'CAR 0:47'). One at a time; a new one replaces the old. Runs on the UI
   * clock (frozen while paused) unless opts.get supplies the truth each frame (e.g. the director's
   * own deadline: get: () => deadline - DA.simTime). The last `urgent` seconds (default 10) pulse.
   * At 0 it blinks 0:00 for opts.hold s (default 1.5) and goes away. Shown over the world, the desk
   * and device close-ups; hidden under the menus, the title and the cinematics (CSS).
   *   → handle {done: Promise<bool> (true the moment it reaches 0, false when cancelled or
   *             replaced first), cancel(),
   *             set(secs), left() → secs remaining}
   *   countdown(null | 0 | false) — cancel the one showing (also what a new night / load does).
   */
  let cdRec = null;
  function buildCountdown() {
    const root = el('div', { class: 'ui-cd ui-off', 'aria-live': 'off' });
    const label = el('div', { class: 'ui-cd-l' });
    const ghost = el('span', { class: 'ui-cd-ghost', text: '8:88' });
    const val = el('span', { class: 'ui-cd-v' });
    root.append(label, el('div', { class: 'ui-cd-n' }, ghost, val));
    return { root, label, ghost, val };
  }
  const cdFmt = (secs) => {
    const s = Math.max(0, Math.ceil(secs - 1e-6));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
  function cdEnd(ok) {
    const c = cdRec;
    if (!c) return;
    cdRec = null;
    if (R.cd) {
      R.cd.root.classList.add('ui-off');
      R.cd.root.classList.remove('urgent', 'zero', 'on');
    }
    if (!c.resolved) { c.resolved = true; c.res(!!ok); }
  }
  ui.countdown = (secs, opts) => {
    if (cdRec) cdEnd(false);
    if (secs == null || secs === false || !(+secs > 0)) return null;
    opts = opts || {};
    let res;
    const done = new Promise((r) => { res = r; });
    const c = { left: +secs, get: typeof opts.get === 'function' ? opts.get : null, urgent: opts.urgent == null ? 10 : +opts.urgent, hold: opts.hold == null ? 1.5 : +opts.hold, zeroT: -1, res, shown: '' };
    cdRec = c;
    const handle = {
      done,
      cancel() { if (cdRec === c) cdEnd(false); },
      set(v) { if (cdRec === c && isFinite(+v)) { c.left = Math.max(0, +v); c.zeroT = -1; } },
      left() { return cdRec === c ? Math.max(0, c.left) : 0; },
    };
    if (!booted) return handle;
    R.cd.label.textContent = fmt(opts.label || '');
    R.cd.label.classList.toggle('ui-off', !opts.label);
    R.cd.ghost.textContent = cdFmt(secs).replace(/\d/g, '8');
    R.cd.root.classList.remove('ui-off', 'urgent', 'zero');
    void R.cd.root.offsetWidth; // restart the entry animation
    R.cd.root.classList.add('on');
    updateCountdown(0);
    return handle;
  };
  function updateCountdown(gdt) {
    const c = cdRec;
    if (!c) return;
    if (c.get) {
      let v = NaN;
      try { v = +c.get(); } catch (e) { v = NaN; }
      if (isFinite(v)) c.left = v;
      else c.left -= gdt;
    } else c.left -= gdt;
    const txt = cdFmt(c.left);
    if (txt !== c.shown) {
      c.shown = txt;
      R.cd.val.textContent = txt;
      if (txt.length !== R.cd.ghost.textContent.length) R.cd.ghost.textContent = txt.replace(/\d/g, '8');
    }
    R.cd.root.classList.toggle('urgent', c.left > 0 && c.left <= c.urgent);
    if (c.left <= 0) {
      if (c.zeroT < 0) {
        c.zeroT = 0;
        R.cd.root.classList.add('zero');
        if (!c.resolved) { c.resolved = true; c.res(true); } // done resolves at 0; the 0:00 lingers
      }
      c.zeroT += gdt;
      if (c.zeroT >= c.hold) cdEnd(true);
    } else R.cd.root.classList.remove('zero');
  }

  /* ============================================================== fade */
  let fadeRec = null, fadeLevel = 0;
  function setFade(v) {
    fadeLevel = clamp(v, 0, 1);
    if (R.fade) {
      R.fade.style.opacity = fadeLevel.toFixed(3);
      R.fade.style.visibility = fadeLevel > 0.001 ? 'visible' : 'hidden';
    }
  }
  /** Fade the full-stage overlay to opacity `to` over `secs`. Resolves when done. */
  ui.fade = (to, secs, color) =>
    new Promise((res) => {
      to = clamp(to == null ? 1 : +to, 0, 1);
      if (color && R.fade) R.fade.style.background = color;
      else if (R.fade && to > fadeLevel && !fadeRec) R.fade.style.background = '#000';
      if (fadeRec) { const r = fadeRec.res; fadeRec = null; r(true); }
      if (!secs || secs <= 0 || !booted) { setFade(to); return res(true); }
      fadeRec = { from: fadeLevel, to, t: 0, dur: secs, res };
    });
  ui.fadeLevel = () => fadeLevel;
  function updateFade(dt) {
    const f = fadeRec;
    if (!f) return;
    f.t += dt;
    const k = clamp(f.t / f.dur, 0, 1);
    setFade(U.lerp(f.from, f.to, k * k * (3 - 2 * k)));
    if (k >= 1) { fadeRec = null; f.res(true); }
  }

  /* ============================================================= watch */
  // 7-segment LCD geometry (digit box 12×20)
  const hSeg = (y) => `1.9,${y} 2.9,${y - 1} 9.1,${y - 1} 10.1,${y} 9.1,${y + 1} 2.9,${y + 1}`;
  const vSeg = (x, y0, y1) => `${x},${y0} ${x + 1},${y0 + 1} ${x + 1},${y1 - 1} ${x},${y1} ${x - 1},${y1 - 1} ${x - 1},${y0 + 1}`;
  const SEGS = {
    a: hSeg(1.1), g: hSeg(10), d: hSeg(18.9),
    f: vSeg(1.1, 1.9, 9.6), b: vSeg(10.9, 1.9, 9.6), e: vSeg(1.1, 10.4, 18.1), c: vSeg(10.9, 10.4, 18.1),
  };
  const DIGIT = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '' };
  const DOW = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  let watchTemp = 0, watchShown = false, watchStr = '', watchGlitch = 0;
  function buildWatch() {
    let svg = '<svg class="ui-w-seg" viewBox="-2 -1 66 22" aria-hidden="true">';
    [0, 14.5, 35, 49.5].forEach((ox, i) => {
      svg += `<g transform="translate(${ox} 0) skewX(-6)" data-d="${i}">`;
      for (const k of 'abcdefg') svg += `<polygon data-s="${k}" points="${SEGS[k]}"/>`;
      svg += '</g>';
    });
    svg += '<g class="ui-w-colon" transform="skewX(-6)"><rect x="29.9" y="5.2" width="2.1" height="2.1"/><rect x="29.9" y="12.8" width="2.1" height="2.1"/></g></svg>';
    const w = el('div', { class: 'ui-watch ui-xo' },
      el('div', { class: 'ui-w-strap top' }),
      el('div', { class: 'ui-w-case' },
        el('div', { class: 'ui-w-bez' }, el('span', { text: 'LIGHT' }), el('span', { text: 'ALARM CHRONO' })),
        el('div', { class: 'ui-w-lcd' },
          el('div', { class: 'ui-w-row' }, el('span', { class: 'ui-w-dow' }), el('span', { class: 'ui-w-24', text: '24H' }), el('span', { class: 'ui-w-date' })),
          el('div', { class: 'ui-w-digits', html: svg })),
        el('div', { class: 'ui-w-bez low' }, el('span', { text: 'MODE' }), el('span', { text: 'WR 50M' }), el('span', { text: 'START' }))),
      el('div', { class: 'ui-w-strap bot' }));
    R.wDow = w.querySelector('.ui-w-dow');
    R.wDate = w.querySelector('.ui-w-date');
    R.wColon = w.querySelector('.ui-w-colon');
    R.wDigits = [...w.querySelectorAll('g[data-d]')].map((g) => [...g.querySelectorAll('polygon')]);
    return w;
  }
  function paintWatch(str) {
    for (let i = 0; i < 4; i++) {
      const on = DIGIT[str[i]] || '';
      for (const p of R.wDigits[i]) p.classList.toggle('on', on.includes(p.dataset.s));
    }
  }
  ui.toggleWatch = () => {
    const s = uiState();
    s.watch = !s.watch;
    if (!s.watch) watchTemp = 0;
    sfx('switch', 0.25);
    syncWatch();
    DA.bus.emit('watch', { on: !!s.watch });
  };
  ui.showWatch = (secs) => {
    watchTemp = Math.max(watchTemp, secs || 4);
    syncWatch();
  };
  function syncWatch(force) {
    if (!booted) return;
    const on = !!uiState().watch || watchTemp > 0;
    if (on !== watchShown || force) {
      watchShown = on;
      R.watch.classList.toggle('on', on);
      if (on) updateWatchFace(true);
    }
  }
  function updateWatchFace(force) {
    if (!DA.clock) return;
    const p = DA.clock.parts();
    let str = U.pad(p.h) + U.pad(p.m);
    if (watchGlitch > 0) str = '----';
    if (force || str !== watchStr) {
      watchStr = str;
      paintWatch(str);
      const d = new Date(DA.START_UTC + Math.floor(DA.clock.min * 60) * 1000);
      R.wDow.textContent = DOW[d.getUTCDay()];
      R.wDate.textContent = `${p.d} ${p.mon}`;
    }
    R.wColon.classList.toggle('dim', uiTime % 1 > 0.5);
  }
  function updateWatch(dt, gdt) {
    if (watchTemp > 0) {
      watchTemp -= gdt;
      if (watchTemp <= 0) { watchTemp = 0; syncWatch(); }
    }
    if (!watchShown) return;
    // instability: the watch occasionally loses its reading
    if (watchGlitch > 0) watchGlitch -= dt;
    else if (DA.v && DA.v('instability') >= 6 && Math.random() < dt * 0.05) watchGlitch = 0.12 + Math.random() * 0.2;
    updateWatchFace(false);
  }

  /* ================================================ documents: markup */
  /** Render the light markup used by docs/notes into HTML (escaped; raw <svg> passes through). */
  ui.markup = (src, style) => {
    const svgs = [];
    src = fmt(Array.isArray(src) ? src.join('\n') : src || '');
    src = src.replace(/<svg[\s\S]*?<\/svg>/gi, (m) => { svgs.push(m); return '\u0001' + (svgs.length - 1) + '\u0002'; });
    const inline = (s) => U.esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/~~(.+?)~~/g, '<s>$1</s>')
      .replace(/\|\|(.+?)\|\|/g, '<span class="ui-d-redact">$1</span>')
      .replace(/\u0001(\d+)\u0002/g, (m, i) => svgs[+i] || '');
    const out = [];
    let para = [], quote = [], list = [];
    const flushPara = () => {
      if (!para.length) return;
      const lead = para.length === 1 && /^\*\*[^*]+\*\*[.:]?$/.test(para[0].trim());
      out.push(`<p class="ui-d-p${lead ? ' ui-d-lead' : ''}">${para.map(inline).join('<br>')}</p>`);
      para = [];
    };
    const flushQuote = () => { if (quote.length) out.push(`<blockquote class="ui-d-q">${quote.map(inline).join('<br>')}</blockquote>`); quote = []; };
    const flushList = () => { if (list.length) out.push(`<ul class="ui-d-ul">${list.map((l) => `<li>${inline(l)}</li>`).join('')}</ul>`); list = []; };
    const flush = () => { flushPara(); flushQuote(); flushList(); };
    for (const raw of src.split(/\r?\n/)) {
      const line = raw.replace(/\s+$/, '');
      let m;
      if (!line.trim()) { flush(); continue; }
      if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) { flush(); const n = m[1].length; out.push(`<h${n + 1} class="ui-d-h${n}">${inline(m[2])}</h${n + 1}>`); continue; }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flush(); out.push('<hr class="ui-d-hr">'); continue; }
      if ((m = /^\s*\u0001(\d+)\u0002\s*$/.exec(line))) { flush(); out.push(`<div class="ui-d-svg">${svgs[+m[1]] || ''}</div>`); continue; }
      if ((m = /^>\s?(.*)$/.exec(line))) { flushPara(); flushList(); quote.push(m[1]); continue; }
      if ((m = /^\s*\[( |x|X)\]\s+(.*)$/.exec(line))) {
        flush();
        out.push(`<div class="ui-d-check${m[1] === ' ' ? '' : ' on'}"><span class="ui-d-box"></span><span>${inline(m[2])}</span></div>`);
        continue;
      }
      if ((m = /^\s*[-*•]\s+(.*)$/.exec(line))) { flushPara(); flushQuote(); list.push(m[1]); continue; }
      if (style === 'form' && (m = /^([A-Z0-9][A-Z0-9 .,/#()&'’-]{0,34}):\s*(.*)$/.exec(line))) {
        flush();
        out.push(`<div class="ui-d-field"><span class="ui-d-fl">${inline(m[1])}</span><span class="ui-d-fv">${inline(m[2]) || '&nbsp;'}</span></div>`);
        continue;
      }
      flushQuote(); flushList();
      para.push(line);
    }
    flush();
    return out.join('');
  };

  /* ===================================================== documents: mode */
  const DOC_STYLES = new Set(['paper', 'typed', 'form', 'blueprint', 'newspaper', 'plaque', 'screen']);
  let docRec = null;
  const PLACE = { b1: 'basement', b2: 'basement', bath: 'bathroom', hall: 'hall', office: 'office', kitchen: 'kitchen', workshop: 'workshop', storage: 'storage', basement: 'basement', radio: 'radio room', equipment: 'equipment room', records: 'records room', lobby: 'lobby' };
  /** 'vent_office' → 'Office vent'; free text passes through untouched. */
  function placeName(where) {
    if (!where) return '';
    const w = String(where);
    if (!/^[a-z0-9_]+$/.test(w)) return fmt(w);
    const parts = w.split('_');
    const thing = parts[0];
    const place = parts.slice(1).map((p) => PLACE[p] || p).join(' ');
    const text = place ? `${place} ${thing}` : thing;
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  ui.placeName = placeName;
  /*
   * Handwriting (decision 8): a 'paper' document is written by hand when it says so (doc.hand /
   * content hand: true), when it is one of the duct notes (DA.content.notes — the README's
   * "handwritten notes inside ventilation ducts"; hand: false opts one out) or Hollis's sticky note.
   * Typed documents, forms and the corkboard keep the typewriter face.
   */
  const HAND_DOCS = new Set(['doc_hollis_note']);
  function isHand(doc) {
    if (!doc || (doc.style || 'paper') !== 'paper') return false;
    if (doc.hand != null) return !!doc.hand;
    const n = doc.id != null && C('notes')[doc.id];
    if (n) return n.hand !== false;
    return HAND_DOCS.has(doc.id);
  }
  function resolveDoc(d) {
    let doc;
    if (d && typeof d === 'object') {
      doc = Object.assign({ style: 'paper' }, d);
      // a note handed over as an object (world.js 'note' kind) still gets its place + date label
      const n = doc.id != null && C('notes')[doc.id];
      if (n && !doc.where) { doc.where = [placeName(n.where), n.date].filter(Boolean).join(' · '); doc.note = true; }
    } else {
      const id = String(d || '');
      const docs = C('docs');
      const n = C('notes')[id];
      if (docs[id]) doc = Object.assign({ id, style: 'typed' }, docs[id]);
      else if (n) doc = { id, title: n.title, body: n.body != null ? n.body : n.text, style: n.style || 'paper', where: [placeName(n.where), n.date].filter(Boolean).join(' · '), note: true, hand: n.hand, author: n.author };
      else {
        console.warn('[ui] unknown doc', id);
        return { id, title: pretty(id), body: '', style: 'typed' };
      }
    }
    doc.hand = isHand(doc);
    return doc;
  }
  /*
   * Dress a handwritten sheet: every paragraph gets its own slight tilt, drift and size (seeded by
   * the doc, so it is the same each time); in a sheet of '— ' slips (the duct wad) each slip is
   * its own torn scrap and any plain paragraph is the narrator's description, not handwriting.
   * Stage directions become ink: 'X (crossed out)' strikes X ('… again' twice), and
   * '(later, different pen:) Y' writes Y in a second pen.
   */
  function dressHand(sheet, doc) {
    const rnd = U.mulberry32(U.hash('hand:' + (doc.id || doc.title || '')));
    const ps = Array.from(sheet.querySelectorAll('.ui-d-body > .ui-d-p'));
    const slip = (p) => /^\s*—\s/.test(p.textContent);
    const slips = ps.filter(slip).length >= 3;
    if (slips) sheet.classList.add('s-slips');
    for (const p of ps) {
      if (slips && !slip(p)) { p.classList.add('ui-d-narr'); continue; }
      if (slips) {
        p.classList.add('ui-d-slip');
        p.innerHTML = p.innerHTML.replace(/^\s*—\s*/, '');
      }
      p.innerHTML = p.innerHTML
        .replace(/^(.*?)\s*\(crossed out\)\s*\(crossed out again\)/, '<s class="ui-d-x ui-d-x2">$1</s>')
        .replace(/^(.*?)\s*\(crossed out\)/, '<s class="ui-d-x">$1</s>')
        .replace(/\(later, different pen:\)\s*(.*)$/, '<span class="ui-d-pen2">$1</span>');
      const rot = (rnd() - 0.5) * (slips ? 3.2 : 1.5);
      const dx = (rnd() - 0.3) * (slips ? 3.2 : 1.1);
      const sz = 0.94 + rnd() * 0.14;
      p.style.setProperty('--hr', rot.toFixed(2) + 'deg');
      p.style.setProperty('--hx', dx.toFixed(2));
      p.style.setProperty('--hs', sz.toFixed(3));
    }
  }
  /** Open a document (content id or {title, body, style}). Resolves when it is put down. */
  ui.doc = (docIdOrObj) =>
    new Promise((res) => {
      if (!booted) return res(true);
      if (docRec) ui.closeDoc();
      const doc = resolveDoc(docIdOrObj);
      docRec = { doc, res, opened: uiTime };
      DA.modes.push('doc', doc);
    });
  ui.closeDoc = () => { if (DA.modes.has('doc')) DA.modes.pop('doc'); };
  ui.isDocOpen = () => !!docRec;

  function buildDocScreen() {
    const s = el('div', { id: 'ui-doc', class: 'ui-screen ui-off' });
    R.docLabel = el('div', { class: 'ui-doc-label' });
    R.docClose = el('div', { class: 'ui-doc-close', role: 'button', text: 'CLOSE ✕', onclick: () => ui.closeDoc() });
    R.docWrap = el('div', { class: 'ui-doc-wrap' });
    R.docFoot = el('div', { class: 'ui-doc-foot', text: 'E / ESC — PUT DOWN' });
    s.append(R.docWrap, R.docLabel, R.docClose, R.docFoot);
    return s;
  }
  function docHtml(doc) {
    const style = DOC_STYLES.has(doc.style) ? doc.style : 'typed';
    const title = fmt(doc.title || '');
    let body = doc.body != null ? doc.body : doc.text;
    if (Array.isArray(body)) body = body.join('\n');
    body = String(body || '');
    let mast = null, dateline = null, formTitle = null;
    if (style === 'form') {
      // a form's opening '# TITLE' belongs in its printed header box, not repeated beneath it
      const m = /^\s*#\s+([^\n]+)\n+/.exec(body);
      if (m) { formTitle = m[1]; body = body.slice(m[0].length); }
    }
    if (style === 'newspaper') {
      // '# NAME' opening the body is the masthead; a short '·'-separated line after it is the dateline
      const m = /^\s*#\s+([^\n]+)\n+/.exec(body);
      if (m && !doc.masthead) { mast = m[1]; body = body.slice(m[0].length); }
      const d = /^\s*([^\n]{0,160}·[^\n]{0,160})\n+/.exec(body);
      if (d && !doc.date) { dateline = d[1].replace(/\*\*/g, '').split(/\s+·\s+/); body = body.slice(d[0].length); }
    }
    let md = ui.markup(body, style);
    if (doc.svg && !/<svg[\s>]/i.test(body)) md += `<div class="ui-d-svg">${doc.svg}</div>`;
    const startsWithHeading = /^\s*#\s/.test(body);
    const esc = U.esc;
    switch (style) {
      case 'typed':
        return `<div class="ui-d-lh"><div class="ui-d-lh-seal">${SEAL_SVG}</div><div class="ui-d-lh-main"><div class="ui-d-lh-name">RELAY STATION 14</div><div class="ui-d-lh-sub">EMERGENCY COMMUNICATIONS RELAY · COUNTY ROUTE 9</div></div><div class="ui-d-lh-side">INTERNAL<br>NOT FOR DISTRIBUTION</div></div>` +
          (title && !startsWithHeading ? `<h2 class="ui-d-h1 ui-d-title">${esc(title)}</h2>` : '') + `<div class="ui-d-body">${md}</div>`;
      case 'form':
        return `<div class="ui-d-fhead"><div class="ui-d-fh-l">RELAY STATION 14</div><div class="ui-d-fh-c">${esc(fmt(formTitle) || title || 'FORM')}</div><div class="ui-d-fh-r">${esc(doc.formNo || 'FORM RS-14')}</div></div><div class="ui-d-body">${md}</div><div class="ui-d-ffoot">RETAIN ON SITE · ${esc(doc.formNo || 'RS-14')} (REV. 3/78)</div>`;
      case 'blueprint':
        return `<div class="ui-d-body">${md}</div><div class="ui-d-tblock"><div class="ui-d-tb-t">${esc(title || 'DRAWING')}</div><div class="ui-d-tb-g"><span>PROJECT</span><b>RELAY STATION 14</b><span>SHEET</span><b>${esc(doc.formNo || 'A-1')}</b><span>SCALE</span><b>1 : 100</b><span>DRAWN</span><b>1978</b></div></div>`;
      case 'newspaper': {
        const name = fmt(doc.masthead || mast || title || 'The County Record');
        const parts = dateline || ['VOL. CXII · NO. 301', fmt(doc.date || ''), 'FIFTY CENTS'].filter(Boolean);
        const headline = doc.headline || (doc.masthead && title && !startsWithHeading ? title : '');
        return `<div class="ui-d-mast">${esc(name)}</div><div class="ui-d-dateline">${parts.map((p) => `<span>${esc(fmt(p))}</span>`).join('')}</div>` +
          (headline ? `<h2 class="ui-d-h1 ui-d-headline">${esc(fmt(headline))}</h2>` : '') + `<div class="ui-d-body">${md}</div>`;
      }
      case 'plaque':
        return `<i class="ui-d-screw s1"></i><i class="ui-d-screw s2"></i><i class="ui-d-screw s3"></i><i class="ui-d-screw s4"></i><div class="ui-d-body">${md}</div>`;
      case 'screen':
        return (title ? `<div class="ui-d-scr-bar">${esc(title)}</div>` : '') + `<div class="ui-d-body">${md}<span class="ui-d-cursor"></span></div>`;
      default: // paper
        return `<div class="ui-d-body">${md}</div>`;
    }
  }
  /** A clip-path with a slightly ragged top edge: a sheet torn off a pad. */
  function tornEdge(key) {
    const rnd = U.mulberry32(U.hash('torn:' + key));
    const pts = [];
    for (let i = 0; i <= 28; i++) pts.push(`${((i / 28) * 100).toFixed(2)}% calc(var(--u) * ${(0.15 + rnd() * 0.75).toFixed(2)})`);
    pts.push('100% 100%', '0% 100%');
    return `polygon(${pts.join(', ')})`;
  }
  // letterhead seal: a lattice mast broadcasting from its tip, inside a double ring
  const SEAL_SVG = '<svg viewBox="0 0 40 40" aria-hidden="true" fill="none" stroke="currentColor"><circle cx="20" cy="20" r="18.5" stroke-width="1.3"/><circle cx="20" cy="20" r="15.6" stroke-width=".5"/>' +
    '<path d="M20 13.5 L15.2 32 M20 13.5 L24.8 32 M16.6 26.6 L23.4 26.6 M17.7 22.3 L22.3 22.3 M18.6 18.3 L21.4 18.3 M16.6 26.6 L22.3 22.3 M23.4 26.6 L17.7 22.3 M17.7 22.3 L21.4 18.3 M22.3 22.3 L18.6 18.3" stroke-width=".8"/>' +
    '<circle cx="20" cy="12.4" r="1.1" fill="currentColor" stroke="none"/>' +
    '<path d="M16.4 9.6 A4.6 4.6 0 0 0 16.4 15.2 M23.6 9.6 A4.6 4.6 0 0 1 23.6 15.2 M13.6 7.4 A8 8 0 0 0 13.6 17.4 M26.4 7.4 A8 8 0 0 1 26.4 17.4" stroke-width=".9"/>' +
    '<path d="M11 32 H29" stroke-width=".9"/></svg>';

  const docMode = {
    enter(doc) {
      const style = DOC_STYLES.has(doc.style) ? doc.style : 'typed';
      R.docWrap.innerHTML = '';
      R.docSheet = el('div', { class: 'ui-doc-sheet s-' + style + (doc.hand ? ' s-hand' : ''), html: docHtml(doc) });
      if (doc.hand) dressHand(R.docSheet, doc);
      R.docWrap.appendChild(el('div', { class: 'ui-doc-frame f-' + style }, R.docSheet, style === 'screen' ? el('div', { class: 'ui-doc-scan' }) : null));
      R.docWrap.className = 'ui-doc-wrap w-' + style;
      R.docLabel.innerHTML = '';
      R.docLabel.appendChild(el('div', { class: 'ui-doc-label-t', text: fmt(doc.title || '') }));
      if (doc.where) R.docLabel.appendChild(el('div', { class: 'ui-doc-label-w', text: doc.note ? doc.where : placeName(doc.where) }));
      if (style === 'paper') R.docSheet.style.clipPath = tornEdge(doc.id || doc.title || '');
      showScreen(R.docScreen);
      R.docSheet.scrollTop = 0;
      const scrolls = R.docSheet.scrollHeight > R.docSheet.clientHeight + 4;
      R.docFoot.textContent = scrolls ? 'E / ESC — PUT DOWN  ·  ↑ ↓ / WHEEL — READ ON' : 'E / ESC — PUT DOWN';
      const syncMore = () => R.docSheet.classList.toggle('more', R.docSheet.scrollTop + R.docSheet.clientHeight < R.docSheet.scrollHeight - 6);
      R.docSheet.addEventListener('scroll', syncMore, { passive: true });
      syncMore();
      if (doc.id) {
        const st = uiState();
        st.read = st.read || {};
        st.read[doc.id] = true;
      }
      if (style !== 'plaque' && style !== 'screen') sfx('paper', 0.55);
      else if (style === 'screen') sfx('beep', 0.2);
      DA.bus.emit('doc:open', { id: doc.id || null, style, title: doc.title || '', hand: !!doc.hand });
    },
    exit() {
      hideScreen(R.docScreen);
      const rec = docRec;
      docRec = null;
      if (rec && rec.doc.style !== 'plaque' && rec.doc.style !== 'screen') sfx('paper', 0.35);
      DA.bus.emit('doc:close', { id: rec && rec.doc.id ? rec.doc.id : null });
      if (rec) rec.res(true);
    },
    onKey(e, down) {
      if (browserKey(e)) return false;
      if (!down) return true;
      const c = e.code;
      if ((c === 'KeyE' || c === 'Escape') && !isRepeat(e)) { ui.closeDoc(); return true; }
      const sh = R.docSheet;
      if (sh) {
        const step = sh.clientHeight * 0.12;
        if (c === 'ArrowDown' || c === 'KeyS') sh.scrollTop += step;
        else if (c === 'ArrowUp' || c === 'KeyW') sh.scrollTop -= step;
        else if (c === 'PageDown' || c === 'Space') sh.scrollTop += sh.clientHeight * 0.85;
        else if (c === 'PageUp') sh.scrollTop -= sh.clientHeight * 0.85;
      }
      return true;
    },
    onMouseDown(e) {
      if (!docRec || uiTime - docRec.opened < 0.25) return true;
      const t = e.target;
      if (R.docSheet && R.docSheet.contains(t)) return true;
      if (R.docClose.contains(t) || (R.over && R.over.contains(t))) return true;
      if (R.docScreen.contains(t)) ui.closeDoc();
      return true;
    },
  };

  /* ============================================================ choice */
  let choiceRec = null;
  /** Numbered choice list. Resolves the chosen id, or opts.timeoutId || null on timeout. */
  ui.choice = (options, opts) =>
    new Promise((res) => {
      opts = opts || {};
      if (choiceRec) resolveChoice(choiceRec.opts.timeoutId || null, 'replaced');
      const list = (options || []).map((o, i) =>
        typeof o === 'string' ? { id: String(i + 1), text: o } : Object.assign({}, o, { text: o.text != null ? o.text : o.t != null ? o.t : o.label || o.id }));
      if (!booted || !list.length) return res(opts.timeoutId || null);
      choiceRec = { opts, list, res, sel: Math.max(0, list.findIndex((o) => !o.disabled)), t: 0, timeout: +opts.timeout || 0, opened: uiTime };
      buildChoice(choiceRec);
      DA.modes.push('choice');
    });
  ui.closeChoice = (id) => { if (choiceRec) resolveChoice(id === undefined ? choiceRec.opts.timeoutId || null : id, 'closed'); };
  function buildChoice(rec) {
    const c = R.choice;
    c.innerHTML = '';
    const o = rec.opts;
    if (o.speaker || o.prompt || o.name) {
      const head = el('div', { class: 'ui-ch-head' });
      if (o.speaker || o.name) {
        const nm = o.name != null ? fmt(o.name) : ui.speakerName(o.speaker);
        const col = ui.speakerColor(o.speaker);
        head.appendChild(el('span', { class: 'ui-ch-spk', text: nm, style: col ? { color: col } : null }));
      }
      if (o.prompt) head.appendChild(el('span', { class: 'ui-ch-prompt', text: fmt(o.prompt) }));
      c.appendChild(head);
    }
    rec.els = rec.list.map((opt, i) => {
      const row = el('div', { class: 'ui-ch-opt' + (opt.disabled ? ' dis' : ''), role: 'button' },
        el('span', { class: 'ui-ch-n', text: String(i + 1) }),
        el('span', { class: 'ui-ch-t', text: fmt(opt.text) }));
      onHover(row, () => { if (!opt.disabled && choiceRec === rec && rec.sel !== i) setChoiceSel(i); });
      row.addEventListener('click', () => pickChoice(i));
      c.appendChild(row);
      return row;
    });
    rec.bar = null;
    if (rec.timeout > 0) {
      rec.bar = el('i');
      c.appendChild(el('div', { class: 'ui-ch-bar' }, rec.bar));
    }
    setChoiceSel(rec.sel);
    armHover();
  }
  function setChoiceSel(i) {
    const rec = choiceRec;
    if (!rec) return;
    rec.sel = i;
    rec.els.forEach((e, k) => e.classList.toggle('sel', k === i));
  }
  function pickChoice(i) {
    const rec = choiceRec;
    if (!rec || uiTime - rec.opened < 0.15) return;
    const opt = rec.list[i];
    if (!opt || opt.disabled) return;
    rec.els[i].classList.add('picked');
    resolveChoice(opt.id, 'pick', i);
  }
  function resolveChoice(id, how, index) {
    const rec = choiceRec;
    if (!rec) return;
    choiceRec = null;
    R.choice.classList.add('ui-off');
    R.choice.innerHTML = '';
    if (DA.modes.has('choice')) DA.modes.pop('choice');
    const opt = index != null ? rec.list[index] : rec.list.find((o) => o.id === id);
    DA.bus.emit('choice:made', { id, text: opt ? fmt(opt.text) : null, index: index != null ? index : -1, timedOut: how === 'timeout' });
    rec.res(id);
  }
  function updateChoice(gdt) {
    const rec = choiceRec;
    if (!rec || !rec.timeout) return;
    rec.t += gdt;
    const k = clamp(1 - rec.t / rec.timeout, 0, 1);
    if (rec.bar) rec.bar.style.transform = `scaleX(${k.toFixed(4)})`;
    if (rec.t >= rec.timeout) resolveChoice(rec.opts.timeoutId || null, 'timeout');
  }
  const choiceMode = {
    enter() {
      R.choice.classList.remove('ui-off');
      R.choice.classList.remove('in');
      void R.choice.offsetWidth;
      R.choice.classList.add('in');
    },
    cover(c) { R.choice.classList.toggle('covered', !!c); },
    exit() {
      R.choice.classList.remove('covered');
      if (choiceRec) {
        // removed from outside (mode stack cleared, etc.) — resolve like a timeout
        const rec = choiceRec;
        choiceRec = null;
        R.choice.classList.add('ui-off');
        rec.res(rec.opts.timeoutId || null);
      }
    },
    onKey(e, down) {
      if (browserKey(e)) return false;
      if (!down || !choiceRec) return true;
      const c = e.code;
      const m = /^(?:Digit|Numpad)([1-9])$/.exec(c);
      if (m) { pickChoice(+m[1] - 1); return true; }
      const n = choiceRec.list.length;
      const step = (d) => {
        let i = choiceRec.sel;
        for (let k = 0; k < n; k++) {
          i = (i + d + n) % n;
          if (!choiceRec.list[i].disabled) break;
        }
        setChoiceSel(i);
      };
      if (c === 'ArrowDown' || c === 'KeyS') step(1);
      else if (c === 'ArrowUp' || c === 'KeyW') step(-1);
      else if ((c === 'Enter' || c === 'Space' || c === 'NumpadEnter') && !isRepeat(e)) pickChoice(choiceRec.sel);
      else if (c === 'Escape' && !isRepeat(e)) ui.pause();
      return true;
    },
  };

  /* =========================================================== journal */
  const TABS = [
    { id: 'objectives', label: 'OBJECTIVES' },
    { id: 'log', label: 'LOG' },
    { id: 'notes', label: 'NOTES' },
    { id: 'tapes', label: 'TAPES' },
    { id: 'items', label: 'ITEMS' },
  ];
  const J = { tab: 'objectives', open: false, covered: false, logVisible: false, rows: new Map(), cols: null, clockAt: 0 };
  const normTab = (t) => {
    if (t == null) return null;
    if (typeof t === 'number') return (TABS[t] || {}).id || null;
    const s = String(t).toLowerCase();
    return TABS.some((x) => x.id === s) ? s : null;
  };
  /** Open the shift binder on a tab (objectives/log/notes/tapes/items). */
  ui.journal = (tab) => {
    if (!booted) return;
    const t = normTab(tab);
    if (DA.modes.has('journal')) { if (t) setTab(t); return; }
    DA.modes.push('journal', t);
  };
  ui.closeJournal = () => { if (DA.modes.has('journal')) DA.modes.pop('journal'); };

  function buildJournal() {
    const s = el('div', { id: 'ui-journal', class: 'ui-screen ui-off' });
    R.jClock = el('div', { class: 'ui-j-clock' });
    R.jTabs = el('div', { class: 'ui-j-tabs' });
    R.jTabEls = {};
    TABS.forEach((t, i) => {
      const e = el('div', { class: 'ui-j-tab', role: 'button', dataset: { tab: t.id }, onclick: () => setTab(t.id) },
        el('i', { text: String(i + 1) }), el('span', { text: t.label }), el('b', { class: 'ui-j-dot' }));
      R.jTabEls[t.id] = e;
      R.jTabs.appendChild(e);
    });
    R.jSheet = el('div', { class: 'ui-j-sheet' });
    R.jPanel = el('div', { class: 'ui-j-panel' },
      el('div', { class: 'ui-j-top' }, el('div', { class: 'ui-j-title', text: 'SHIFT BINDER — RELAY STATION 14' }), R.jClock),
      R.jTabs, R.jSheet, el('div', { class: 'ui-j-holes' }, el('i'), el('i'), el('i')),
      el('div', { class: 'ui-j-foot' },
        el('span', { text: '1–5 / ← → SECTION' }),
        el('span', { class: 'ui-j-close', role: 'button', text: 'TAB / ESC — CLOSE', onclick: () => ui.closeJournal() })));
    s.appendChild(R.jPanel);
    s.addEventListener('mousedown', (e) => { if (e.target === s) ui.closeJournal(); });
    return s;
  }
  function setTab(tab) {
    tab = normTab(tab) || 'objectives';
    const changed = tab !== J.tab;
    J.tab = tab;
    for (const t of TABS) R.jTabEls[t.id].classList.toggle('on', t.id === tab);
    renderJournalBody();
    setLogVisible(J.open && !J.covered && tab === 'log');
    if (changed) sfx('paper', 0.25);
    DA.bus.emit('journal:tab', { tab });
  }
  function setLogVisible(v) {
    if (v === J.logVisible) return;
    J.logVisible = v;
    if (v) { markLogSeen(); updateTabDots(); }
    DA.bus.emit(v ? 'journal:log-open' : 'journal:log-close', { count: logEntries().length });
  }
  /** A fingerprint of what the log says (entries, summaries, statuses, stamps, glitches). */
  function logSig() {
    let s = '';
    for (const e of logEntries()) {
      const st = e.stamp && typeof e.stamp === 'object' ? e.stamp.text || JSON.stringify(e.stamp) : e.stamp;
      s += `${e.num}|${e.txId || ''}|${e.summary || ''}|${e.status || ''}|${e.logged ? 1 : 0}|${e.glitch ? 1 : 0}|${st == null ? '' : st}|${e.offset == null ? '' : e.offset}|${e.sender || ''};`;
    }
    return U.hash(s);
  }
  function markLogSeen() {
    const st = uiState();
    st.logSeen = logEntries().length;
    st.logSeenSig = logSig();
  }
  function refreshJournal(tab) {
    if (!J.open || (tab && tab !== J.tab)) return;
    if (J.tab === 'log') renderLog(true);
    else renderJournalBody();
  }
  function updateTabDots() {
    if (!R.jTabEls) return;
    const st = uiState();
    // new entries, or an entry that changed since you last read the log (a rewrite, a status)
    const n = logEntries().length;
    const unseenLog = !J.logVisible && (n > (st.logSeen || 0) || (n > 0 && st.logSeenSig != null && st.logSeenSig !== logSig()));
    const read = st.read || {};
    const unreadNote = noteIds().some((id) => !read[id]);
    R.jTabEls.log.classList.toggle('new', unseenLog);
    R.jTabEls.notes.classList.toggle('new', unreadNote);
  }
  function renderJournalBody() {
    const sh = R.jSheet;
    sh.innerHTML = '';
    sh.className = 'ui-j-sheet j-' + (J.tab === 'log' ? 'greenbar' : 'paper');
    R.jPanel.dataset.tab = J.tab;
    J.rows = new Map();
    J.logTable = null;
    ({ objectives: jObjectives, log: jLog, notes: jNotes, tapes: jTapes, items: jItems })[J.tab]();
    updateTabDots();
    sh.scrollTop = J.tab === 'log' ? sh.scrollHeight : 0;
  }
  function jHead(title, meta) {
    return el('div', { class: 'ui-j-head' }, el('div', { class: 'ui-j-h', text: title }), meta ? el('div', { class: 'ui-j-meta', text: meta }) : null);
  }
  function jEmpty(text) { return el('div', { class: 'ui-j-empty', text }); }

  function sunriseText() {
    if (DA.flag && DA.flag('sunrise_unknown')) return '--:--';
    const sr = DA.state && DA.state.sunrise;
    return typeof sr === 'number' && DA.clock ? DA.clock.hhmm(sr) : '06:42';
  }
  function jObjectives() {
    const list = objList();
    R.jSheet.appendChild(jHead('SHIFT DUTIES', `RELIEF OPERATOR: ${fmt('{NAME_UP}')} · NIGHT SHIFT 26/27 OCT 1999 · SUNRISE ${sunriseText()}`));
    if (!list.length) { R.jSheet.appendChild(jEmpty('No duties assigned.')); return; }
    const section = (title, items) => {
      if (!items.length) return;
      const box = el('div', { class: 'ui-j-objs' }, el('div', { class: 'ui-j-sec', text: title }));
      for (const o of items) {
        const t = el('span', { class: 'ui-j-ot' + (o.glitch ? ' glitch' : ''), text: fmt(o.text) });
        box.appendChild(el('div', { class: 'ui-j-obj' + (o.done ? ' done' : '') }, el('span', { class: 'ui-j-ob' }), t));
        if (o.glitch) addFlicker(t, fmt(o.text));
      }
      R.jSheet.appendChild(box);
    };
    section('OUTSTANDING', list.filter((o) => !o.done));
    section('COMPLETED', list.filter((o) => o.done));
    R.jSheet.appendChild(el('div', { class: 'ui-j-note-foot', text: 'Duties are set by the outgoing operator. Report irregularities to the District Office.' }));
  }

  /* ---- receiver log (green-bar printout) */
  const COL_LABEL = { num: '#', received: 'RECEIVED', origin: 'ORIGIN', offset: 'OFFSET', freq: 'FREQ', sender: 'SENDER', summary: 'SUMMARY', status: 'STATUS' };
  const logEntries = () => {
    const r = DA.state && DA.state.radio;
    return r && Array.isArray(r.log) ? r.log : [];
  };
  const logCols = () => {
    const off = !!(DA.state.radio && DA.state.radio.offsetUnit);
    return off ? ['num', 'received', 'origin', 'offset', 'freq', 'sender', 'summary', 'status'] : ['num', 'received', 'origin', 'freq', 'sender', 'summary', 'status'];
  };
  function fmtWhen(v, nullText) {
    if (v == null || v === '') return nullText;
    if (typeof v === 'number') return DA.clock.stamp(v);
    if (typeof v === 'object') {
      if (v.text) return String(v.text);
      if (v.day != null) return DA.clock.stamp(DA.clock.toMin(v.day, v.h || 0, v.m || 0));
      return nullText;
    }
    return fmt(v);
  }
  function fmtFreq(f) {
    if (f == null || f === '') return '---.--';
    const n = +f;
    return isFinite(n) && typeof f !== 'string' ? n.toFixed(2).padStart(6, '0') : String(f);
  }
  function logCell(e, col) {
    switch (col) {
      case 'num': return e.num != null ? U.pad(e.num, 2) : '--';
      case 'received': return fmtWhen(e.received, '—');
      case 'origin': return fmtWhen(e.stamp, 'NULL');
      case 'offset': return e.offset == null || e.offset === '' ? '—' : typeof e.offset === 'number' ? U.fmtOffset(e.offset) : String(e.offset);
      case 'freq': return fmtFreq(e.freq);
      case 'sender': return fmt(e.sender || 'UNIDENTIFIED');
      case 'summary': return fmt(e.summary || '');
      case 'status': return fmt(e.status || (e.logged ? 'LOGGED' : 'UNLOGGED')).toUpperCase();
      default: return '';
    }
  }
  function jLog() {
    const now = DA.clock ? `${DA.clock.date()} ${DA.clock.hhmm()}` : '';
    R.jSheet.appendChild(el('div', { class: 'ui-log-head' },
      el('span', { text: 'RELAY STATION 14 · RECEIVER 2 · AUTOMATIC TRAFFIC LOG' }),
      el('span', { text: 'PRINTED ' + now })));
    J.cols = logCols();
    const colg = el('colgroup');
    for (const c of J.cols) colg.appendChild(el('col', { class: 'c-' + c }));
    const thr = el('tr');
    for (const c of J.cols) thr.appendChild(el('th', { class: 'c-' + c, text: COL_LABEL[c] }));
    J.tbody = el('tbody');
    J.logTable = el('table', { class: 'ui-log' + (J.cols.includes('offset') ? ' has-off' : '') }, colg, el('thead', null, thr), J.tbody);
    R.jSheet.appendChild(J.logTable);
    J.logEmpty = el('div', { class: 'ui-log-empty', text: 'NO TRAFFIC RECORDED THIS SHIFT.' });
    R.jSheet.appendChild(J.logEmpty);
    R.jSheet.appendChild(el('div', { class: 'ui-log-tear' }));
    renderLog(false);
  }
  /** Keyed re-render of the log: new rows and changed cells type themselves in. */
  function renderLog(animate) {
    if (!J.open || J.tab !== 'log') return;
    if (!J.logTable || logCols().join() !== J.cols.join()) { renderJournalBody(); return; }
    const entries = logEntries();
    const seen = new Set();
    let newest = null;
    entries.forEach((e, i) => {
      const key = e.num != null ? 'n' + e.num : 'i' + i + ':' + (e.txId || '');
      seen.add(key);
      let row = J.rows.get(key);
      const fresh = !row;
      if (!row) {
        row = { tr: el('tr'), spans: [], texts: [], glitch: null };
        for (const c of J.cols) {
          const sp = el('span');
          row.tr.appendChild(el('td', { class: 'c-' + c }, sp));
          row.spans.push(sp);
        }
        J.rows.set(key, row);
      }
      J.tbody.appendChild(row.tr);
      const g = !!e.glitch;
      const glitchChanged = row.glitch !== g;
      row.glitch = g;
      row.tr.classList.toggle('g', g);
      let delay = fresh && animate ? 0.15 : 0;
      let touched = false;
      J.cols.forEach((c, ci) => {
        const txt = logCell(e, c);
        const sp = row.spans[ci];
        if (row.texts[ci] === txt && !glitchChanged) return;
        row.texts[ci] = txt;
        sp.classList.toggle('glitch', g);
        flickers.delete(sp);
        touched = true;
        if (animate) {
          const cps = g ? (c === 'summary' ? 9 : 26) : 60;
          typeInto(sp, txt, { cps, delay, jitter: g, onDone: g ? () => addFlicker(sp, txt) : null });
          delay += txt.length / cps + (g ? 0.35 : 0.06);
        } else {
          setText(sp, txt);
          if (g && txt) addFlicker(sp, txt);
        }
      });
      if (touched && animate) {
        newest = row;
        row.tr.classList.remove('new');
        void row.tr.offsetWidth;
        row.tr.classList.add('new');
      }
    });
    for (const [key, row] of J.rows) if (!seen.has(key)) { row.tr.remove(); J.rows.delete(key); }
    J.logEmpty.classList.toggle('ui-off', entries.length > 0);
    if (newest) {
      const sh = R.jSheet;
      const rr = newest.tr.getBoundingClientRect(), sr = sh.getBoundingClientRect();
      const top = rr.top - sr.top + sh.scrollTop; // row position inside the scrolling sheet
      if (top + rr.height > sh.scrollTop + sh.clientHeight - 20 || top < sh.scrollTop) sh.scrollTo({ top: Math.max(0, top - sh.clientHeight * 0.6), behavior: 'smooth' });
      if (J.logVisible) markLogSeen();
    }
  }

  const noteIds = () => (Array.isArray(DA.state.notes) ? DA.state.notes : []).map((n) => (n && typeof n === 'object' ? n.id : n)).filter(Boolean);
  function jNotes() {
    const ids = noteIds();
    R.jSheet.appendChild(jHead('NOTES', ids.length ? `${ids.length} RECOVERED` : null));
    if (!ids.length) { R.jSheet.appendChild(jEmpty('Nothing collected yet.')); return; }
    const read = uiState().read || {};
    const box = el('div', { class: 'ui-j-list' });
    ids.forEach((id, i) => {
      const n = C('notes')[id] || {};
      box.appendChild(el('div', { class: 'ui-j-note' + (read[id] ? '' : ' unread'), role: 'button', onclick: () => ui.doc(id) },
        el('span', { class: 'ui-j-nn', text: U.pad(i + 1, 2) }),
        el('span', { class: 'ui-j-nt', text: fmt(n.title || pretty(id)) }),
        el('span', { class: 'ui-j-nw', text: placeName(n.where) }),
        el('span', { class: 'ui-j-nr', text: read[id] ? 'READ' : 'NEW' })));
    });
    R.jSheet.appendChild(box);
  }
  function jTapes() {
    const ids = (Array.isArray(DA.state.tapes) ? DA.state.tapes : []).map((t) => (t && typeof t === 'object' ? t.id : t)).filter(Boolean);
    R.jSheet.appendChild(jHead('TAPES', ids.length ? `${ids.length} CASSETTE${ids.length > 1 ? 'S' : ''}` : null));
    if (!ids.length) { R.jSheet.appendChild(jEmpty('No tapes.')); }
    const atDesk = DA.modes.has('radio') && DA.radio && typeof DA.radio.insertTape === 'function';
    const box = el('div', { class: 'ui-j-tapes' });
    for (const id of ids) {
      const t = C('tapes')[id] || {};
      const label = fmt(t.label || pretty(id));
      const year = t.year && !label.includes(String(t.year)) ? String(t.year) : '';
      box.appendChild(el('div', { class: 'ui-j-tape' },
        el('div', { class: 'ui-cass' },
          el('div', { class: 'ui-cass-label' },
            el('div', { class: 'ui-cass-line' }, el('span', { class: 'ui-cass-t', text: label }), el('span', { class: 'ui-cass-y', text: year })),
            el('div', { class: 'ui-cass-stripe' })),
          el('div', { class: 'ui-cass-win' }, el('i'), el('i')),
          el('div', { class: 'ui-cass-ab', text: 'A' })),
        el('div', { class: 'ui-j-td' },
          el('div', { class: 'ui-j-tl', text: label + (year ? ` — ${year}` : '') }),
          el('div', { class: 'ui-j-tx', text: fmt(t.desc || '') }),
          atDesk ? el('div', { class: 'ui-j-ins', role: 'button', text: 'INSERT INTO DECK', onclick: () => { try { DA.radio.insertTape(id); } catch (e) { console.error(e); } ui.closeJournal(); } }) : null)));
    }
    R.jSheet.appendChild(box);
    R.jSheet.appendChild(el('div', { class: 'ui-j-note-foot', text: 'Play on the cassette deck at the radio desk.' }));
  }
  function jItems() {
    const inv = Array.isArray(DA.state.inventory) ? DA.state.inventory : [];
    R.jSheet.appendChild(jHead('CARRIED', null));
    if (!inv.length) { R.jSheet.appendChild(jEmpty('Empty pockets.')); return; }
    const box = el('div', { class: 'ui-j-items' });
    for (const id of inv) {
      const it = C('items')[id];
      const name = it ? (typeof it === 'string' ? it : it.name || it.title || pretty(id)) : (C('tapes')[id] && C('tapes')[id].label) || pretty(id);
      const desc = it && typeof it === 'object' ? it.desc || it.description || it.text || '' : '';
      box.appendChild(el('div', { class: 'ui-j-item' }, el('div', { class: 'ui-j-in', text: fmt(name) }), el('div', { class: 'ui-j-id', text: fmt(desc) })));
    }
    R.jSheet.appendChild(box);
  }
  const journalMode = {
    enter(tab) {
      J.open = true;
      J.covered = false;
      J.logVisible = false;
      showScreen(R.journal);
      J.tab = normTab(tab) || J.tab || 'objectives';
      for (const t of TABS) R.jTabEls[t.id].classList.toggle('on', t.id === J.tab);
      renderJournalBody();
      updateJournalClock(true);
      sfx('paper', 0.45);
      DA.bus.emit('journal:open', { tab: J.tab });
      setLogVisible(J.tab === 'log');
    },
    exit() {
      setLogVisible(false);
      J.open = false;
      hideScreen(R.journal);
      DA.bus.emit('journal:close', {});
    },
    cover(c) {
      J.covered = !!c;
      if (c) setLogVisible(false);
      else { renderJournalBody(); setLogVisible(J.tab === 'log'); }
    },
    onKey(e, down) {
      if (browserKey(e)) return false;
      if (!down) return true;
      const c = e.code;
      if ((c === 'Tab' || c === 'Escape') && !isRepeat(e)) { ui.closeJournal(); return true; }
      const m = /^(?:Digit|Numpad)([1-5])$/.exec(c);
      if (m) { setTab(TABS[+m[1] - 1].id); return true; }
      const i = TABS.findIndex((t) => t.id === J.tab);
      if (c === 'ArrowRight' || c === 'KeyD') setTab(TABS[(i + 1) % TABS.length].id);
      else if (c === 'ArrowLeft' || c === 'KeyA') setTab(TABS[(i + TABS.length - 1) % TABS.length].id);
      else if (c === 'KeyL') setTab('log');
      else if (c === 'ArrowDown' || c === 'KeyS') R.jSheet.scrollTop += R.jSheet.clientHeight * 0.15;
      else if (c === 'ArrowUp' || c === 'KeyW') R.jSheet.scrollTop -= R.jSheet.clientHeight * 0.15;
      else if (c === 'PageDown') R.jSheet.scrollTop += R.jSheet.clientHeight * 0.85;
      else if (c === 'PageUp') R.jSheet.scrollTop -= R.jSheet.clientHeight * 0.85;
      return true;
    },
  };
  function updateJournalClock(force) {
    if (!J.open || !DA.clock) return;
    if (!force && uiTime - J.clockAt < 0.5) return;
    J.clockAt = uiTime;
    R.jClock.textContent = `${DA.clock.date()} · ${DA.clock.hhmm()}`;
  }

  /* ============================================================ menus */
  /**
   * A vertical list of text items with hover/keyboard selection.
   * items: [{label, action, disabled, cls, sub}] → {root, select(i), key(e)→bool, items}
   */
  function makeMenu(items, cls) {
    const root = el('div', { class: 'ui-menu ' + (cls || '') });
    const m = { root, items, sel: -1 };
    m.els = items.map((it, i) => {
      const e = el('div', { class: 'ui-mi' + (it.disabled ? ' dis' : '') + (it.cls ? ' ' + it.cls : ''), role: 'button' },
        el('span', { class: 'ui-mi-t', text: it.label }), it.sub ? el('span', { class: 'ui-mi-sub', text: it.sub }) : null);
      onHover(e, () => { if (!it.disabled && m.sel !== i) m.select(i); });
      e.addEventListener('click', () => m.activate(i));
      root.appendChild(e);
      return e;
    });
    m.select = (i) => {
      m.sel = i;
      m.els.forEach((e, k) => e.classList.toggle('sel', k === i));
    };
    m.activate = (i) => {
      const it = items[i == null ? m.sel : i];
      if (!it || it.disabled) return;
      sfx('radio_click', 0.3);
      it.action && it.action();
    };
    m.move = (d) => {
      const n = items.length;
      if (!n) return;
      let i = m.sel < 0 ? (d > 0 ? -1 : 0) : m.sel;
      for (let k = 0; k < n; k++) {
        i = (i + d + n) % n;
        if (!items[i].disabled) break;
      }
      m.select(i);
    };
    m.key = (e) => {
      const c = e.code;
      if (c === 'ArrowDown' || c === 'KeyS') { m.move(1); return true; }
      if (c === 'ArrowUp' || c === 'KeyW') { m.move(-1); return true; }
      if ((c === 'Enter' || c === 'Space' || c === 'NumpadEnter') && !isRepeat(e)) { m.activate(); return true; }
      return false;
    };
    const first = items.findIndex((it) => !it.disabled);
    m.select(first);
    armHover();
    return m;
  }

  /* ============================================================= title */
  const T = { canvas: null, ctx: null, img: null, buf: null, rain: null, rctx: null, drops: [], last: 0, jitAt: 0, jitEnd: 0, menu: null, sub: null, audioOn: false };
  /**
   * The title's own bed: rain on the building and a little wind, nothing else. Always the COMPLETE
   * parameter set (ambience() merges), so an array drone, the generator, hum, thunder or a heartbeat
   * left over from the game never carries on under the title. DA.audio.resetAmbience wins if present.
   */
  function titleBed() {
    const a = DA.audio;
    if (a && typeof a.resetAmbience === 'function') {
      try { a.resetAmbience({ rain: 0.6, indoor: true, wind: 0.3 }); return; } catch (e) { console.error('[ui→audio.resetAmbience]', e); }
    }
    aud('ambience', {
      rain: 0.6, indoor: true, wind: 0.3, hum: 0, generator: 'off', genDist: 0, drone: 0, heartbeat: 0,
      thunder: 0, birds: false, daylight: false, room: 'small',
    });
  }
  function initAudioOnce() {
    if (T.audioOn) return;
    T.audioOn = true;
    aud('init');
    titleBed();
  }
  function buildTitle() {
    const s = el('div', { id: 'ui-title', class: 'ui-screen ui-off' });
    T.canvas = el('canvas', { class: 'ui-t-static', width: 320, height: 180 });
    T.rain = el('canvas', { class: 'ui-t-rain', width: 480, height: 270 });
    T.ctx = T.canvas.getContext('2d');
    T.rctx = T.rain.getContext('2d');
    T.img = T.ctx.createImageData(320, 180);
    T.buf = new Uint32Array(T.img.data.buffer);
    for (let i = 0; i < 90; i++) T.drops.push({ x: Math.random() * 560, y: Math.random() * 270, v: 260 + Math.random() * 220, l: 6 + Math.random() * 14 });
    T.mark = el('div', { class: 'ui-t-mark', dataset: { text: 'DEAD AIR' }, text: 'DEAD AIR' });
    T.menuBox = el('div', { class: 'ui-t-menu' });
    T.pips = el('div', { class: 'ui-t-pips' });
    s.append(T.rain, T.canvas, el('div', { class: 'ui-t-vig' }),
      el('div', { class: 'ui-t-center' }, T.mark, el('div', { class: 'ui-t-sub', text: 'RELAY STATION 14 — 26 OCT 1999' }), T.menuBox),
      el('div', { class: 'ui-t-foot l', text: 'Headphones recommended.' }),
      el('div', { class: 'ui-t-foot r' }, T.pips, el('span', { class: 'ui-t-ver', text: 'v' + (DA.VERSION || '1.0') })));
    return s;
  }
  function titleMainMenu() {
    const archives = DA.archive ? DA.archive.list() : [];
    T.sub = null;
    T.menu = makeMenu([
      { label: 'BEGIN SHIFT', action: () => DA.modes.push('name') },
      { label: 'LOAD ARCHIVE', disabled: !archives.length, action: titleArchiveMenu },
      { label: 'SETTINGS', action: () => DA.modes.push('settings') },
    ], 'ui-t-main');
    T.menuBox.innerHTML = '';
    T.menuBox.appendChild(T.menu.root);
  }
  const archiveLine = (a) => `TIMELINE ${U.pad(a.timeline != null ? a.timeline : a.slot, 2)} — ${a.stamp || '--'} — ${String(a.name || 'OPERATOR').toUpperCase()}`;
  function titleArchiveMenu() {
    const list = (DA.archive ? DA.archive.list() : []).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    const items = list.map((a) => ({ label: archiveLine(a), sub: a.slot === 0 ? `CHECKPOINT · ${a.label || ''}` : a.label || 'MANUAL', cls: 'ui-arch', action: () => DA.archive.load(a.slot) }));
    items.push({ label: 'BACK', cls: 'ui-back', action: titleMainMenu });
    T.menu = makeMenu(items, 'ui-t-arch');
    T.sub = 'archive';
    T.menuBox.innerHTML = '';
    T.menuBox.appendChild(el('div', { class: 'ui-t-arch-h', text: 'LOAD ARCHIVE' }));
    T.menuBox.appendChild(T.menu.root);
  }
  function titlePips() {
    T.pips.innerHTML = '';
    const found = (DA.meta && DA.meta.endings) || {};
    const ids = ['destroy', 'maintain', 'open', 'secret'];
    if (!Object.keys(found).some((k) => found[k])) return;
    T.pips.appendChild(el('span', { class: 'ui-t-pl', text: 'ENDINGS' }));
    const E = C('endings');
    for (const id of ids) {
      const e = E[id] || {};
      const hidden = id === 'secret' && !found[id];
      if (hidden) continue;
      T.pips.appendChild(el('i', { class: 'ui-t-pip' + (found[id] ? ' on' : ''), title: found[id] ? fmt(e.title || pretty(id)) : '' }));
    }
  }
  function titleRender() {
    if (uiTime - T.last < 1 / 24) return;
    const dt = Math.min(0.1, uiTime - T.last);
    T.last = uiTime;
    // static: grey noise, alternate-line darkening and a slow rolling brighter band
    const b = T.buf, w = 320, h = 180;
    let seed = (Math.random() * 4294967295) >>> 0;
    const roll = ((uiTime * 18) % (h + 60)) - 30;
    for (let y = 0; y < h; y++) {
      const band = Math.abs(y - roll) < 10 ? 1.5 : 1;
      const line = y & 1 ? 0.72 : 1;
      const k = band * line;
      const row = y * w;
      for (let x = 0; x < w; x++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        let v = ((seed >>> 24) * k) | 0;
        if (v > 255) v = 255;
        b[row + x] = 0xff000000 | (v << 16) | (v << 8) | v;
      }
    }
    T.ctx.putImageData(T.img, 0, 0);
    // rain: thin slanted streaks
    const r = T.rctx;
    r.clearRect(0, 0, 480, 270);
    r.strokeStyle = 'rgba(170,185,200,0.22)';
    r.lineWidth = 1;
    r.beginPath();
    for (const d of T.drops) {
      d.y += d.v * dt;
      d.x -= d.v * dt * 0.18;
      if (d.y > 280) { d.y = -20; d.x = Math.random() * 560; }
      r.moveTo(d.x, d.y);
      r.lineTo(d.x + d.l * 0.18, d.y - d.l);
    }
    r.stroke();
    // wordmark: an occasional chromatic shiver
    if (uiTime > T.jitAt && !T.jitEnd) { T.mark.classList.add('jit'); T.jitEnd = uiTime + 0.08 + Math.random() * 0.18; }
    if (T.jitEnd && uiTime > T.jitEnd) { T.mark.classList.remove('jit'); T.jitEnd = 0; T.jitAt = uiTime + 1.5 + Math.random() * 5; }
  }
  const titleMode = {
    opaque: true,
    enter() {
      document.body.classList.add('ui-at-title');
      titleMainMenu();
      titlePips();
      showScreen(R.title);
      T.jitAt = uiTime + 2;
      titleBed();
    },
    exit() {
      document.body.classList.remove('ui-at-title');
      hideScreen(R.title);
    },
    cover(c) {
      if (!c) { if (T.sub !== 'archive') titleMainMenu(); titlePips(); if (!DA.running) titleBed(); }
    },
    render() { titleRender(); },
    onKey(e, down) {
      if (browserKey(e)) return false;
      if (!down) return true;
      initAudioOnce();
      if (T.menu && T.menu.key(e)) return true;
      if (e.code === 'Escape' && T.sub) titleMainMenu();
      return true;
    },
    onMouseDown() { initAudioOnce(); return false; },
  };

  /* ================================================== name (register) */
  /*
   * The shift register is ONE document: DA.content.register (content.js) also builds the lobby's
   * doc_signin. The name screen shows its current page (`rows`, oldest first) and your line
   * (`you`); the older pages and the loose 2049 sheet are the lobby copy's business. The fallback
   * below is the same page, for a content-less harness.
   */
  const REGISTER_FALLBACK = {
    form: 'FORM RS-14/3',
    title: 'RELAY STATION 14 — SHIFT REGISTER',
    rule: 'Night watch. Sign in on arrival. Sign out on relief. PRINT NAME.',
    cols: ['DATE', 'SHIFT', 'RELIEVING', 'RELIEF OPERATOR (PRINT)', 'SIGNATURE', 'REMARKS'],
    rows: [
      { date: '20 OCT 1999', in: '23:30', out: '06:43', relieving: 'DAY CREW', name: 'T. HOLLIS', rem: '' },
      { date: '21 OCT 1999', in: '23:30', out: '06:42', relieving: 'DAY CREW', name: 'T. HOLLIS', rem: 'Breaker C twice' },
      { date: '22 OCT 1999', in: '23:30', out: '06:44', relieving: 'DAY CREW', name: 'T. HOLLIS', rem: '' },
      { date: '23 OCT 1999', in: '23:30', out: '06:42', relieving: 'DAY CREW', name: 'T. HOLLIS', rem: '' },
      { date: '24 OCT 1999', in: '23:30', out: '06:44', relieving: 'DAY CREW', name: 'T. HOLLIS', rem: 'Logged 148 x1' },
      { date: '25 OCT 1999', in: '23:30', out: '06:43', relieving: 'DAY CREW', name: 'T. HOLLIS', rem: '' },
      { date: '26 OCT 1999', in: '16:00', out: '23:40', relieving: 'DAY CREW', name: 'T. HOLLIS', rem: 'Double. Relief late (cover).' },
    ],
    you: { date: '26 OCT 1999', in: '23:40', relieving: 'T. HOLLIS', name: '{NAME_UP}', rem: 'Cover' },
  };
  function registerData() {
    const c = C('register');
    const ok = c && Array.isArray(c.rows) && c.rows.length && c.you;
    return ok ? Object.assign({}, REGISTER_FALLBACK, c) : REGISTER_FALLBACK;
  }
  /** '23:30' + '06:43' → '2330–0643' (the register's shift column); no out time → '2330–'. */
  const shiftCell = (a, b) => {
    const t = (v) => String(v || '').replace(/[^0-9]/g, '').slice(0, 4);
    const o = t(b);
    return `${t(a)}–${o && !/^_+$/.test(String(b)) ? o : ''}`;
  };
  // one man, one pen: the same ink night after night, the hand only a little different each time
  const REG_INKS = ['#1e2a55', '#1f2d4d', '#1e2a55', '#18233f', '#1e2a55', '#202a50', '#2a3a6a'];
  /**
   * Deterministic pseudo-handwritten signature for a name → {d, w} (viewBox height 36).
   * Each word gets a looped capital; lowercase letters become humps, ascender loops (bdfhklt)
   * or descender loops (gjpqy); the whole thing leans right and ends in an underline flourish.
   */
  function signature(name) {
    const rnd = U.mulberry32(U.hash('sig:' + String(name).toLowerCase()));
    const words = String(name).trim().split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).slice(0, 3);
    if (!words.length) words.push('x');
    const slant = 0.3 + rnd() * 0.2;
    const baseY = 25;
    const P = (x, y, base) => `${(x + (base - y) * slant).toFixed(1)} ${y.toFixed(1)}`;
    let d = '', x = 3;
    words.forEach((w, wi) => {
      let base = baseY - wi * 1.2;
      const capH = 15 + rnd() * 7;
      const cap = w.toUpperCase().charCodeAt(0) % 4;
      if (cap === 0) { // tall loop
        d += `M ${P(x, base, base)} `;
        d += `C ${P(x + 1, base - capH, base)} ${P(x + 10 + rnd() * 4, base - capH - 1, base)} ${P(x + 5, base - 3, base)} `;
        d += `C ${P(x + 2, base + 2, base)} ${P(x + 6, base + 1.5, base)} ${P(x + 9, base - 1, base)} `;
        x += 9;
      } else if (cap === 1) { // hooked downstroke with a crossbar
        d += `M ${P(x - 2, base - capH + 3, base)} C ${P(x + 1, base - capH - 1, base)} ${P(x + 4, base - capH, base)} ${P(x + 4, base - capH + 2, base)} `;
        d += `C ${P(x + 4, base - capH * 0.5, base)} ${P(x + 2, base + 2, base)} ${P(x - 1, base + 1, base)} `;
        d += `M ${P(x - 3, base - capH * 0.55, base)} C ${P(x + 3, base - capH * 0.62, base)} ${P(x + 8, base - capH * 0.6, base)} ${P(x + 11, base - capH * 0.66, base)} `;
        d += `M ${P(x + 6, base - 2, base)} `;
        x += 7;
      } else if (cap === 2) { // big open bowl
        d += `M ${P(x + 9, base - capH + 2, base)} C ${P(x + 2, base - capH - 1, base)} ${P(x - 3, base - capH * 0.4, base)} ${P(x + 1, base, base)} `;
        d += `C ${P(x + 5, base + 3, base)} ${P(x + 11, base - 2, base)} ${P(x + 12, base - 5, base)} `;
        x += 11;
      } else { // zigzag peaks
        d += `M ${P(x, base + 1, base)} C ${P(x + 1, base - capH * 0.6, base)} ${P(x + 2, base - capH, base)} ${P(x + 4, base - capH, base)} `;
        d += `C ${P(x + 5, base - capH * 0.6, base)} ${P(x + 6, base - 3, base)} ${P(x + 7, base - capH * 0.8, base)} `;
        d += `C ${P(x + 8, base - capH * 0.9, base)} ${P(x + 9, base - 4, base)} ${P(x + 11, base - 1, base)} `;
        x += 11;
      }
      const initial = /^[A-Za-z]\.?$/.test(w);
      if (initial) { // an initial: capital, a dot, move on
        x += 2;
        d += `M ${P(x, base, base)} l 0.6 0.2 `;
        x += 6;
        return;
      }
      const letters = w.slice(1).replace(/[^A-Za-z]/g, '').toLowerCase() || 'n';
      const n = Math.min(letters.length, wi === words.length - 1 ? 8 : 4);
      for (let i = 0; i < n; i++) {
        const ch = letters[i];
        const wd = 4 + rnd() * 3;
        if ('bdfhklt'.includes(ch)) {
          const H = 12 + rnd() * 5;
          d += `C ${P(x + wd * 1.3, base - H, base)} ${P(x - wd * 0.5, base - H, base)} ${P(x + wd * 0.6, base, base)} `;
        } else if ('gjpqy'.includes(ch)) {
          const H = 8 + rnd() * 4;
          d += `C ${P(x + wd, base + H, base)} ${P(x - wd * 0.6, base + H, base)} ${P(x + wd * 0.7, base - 2, base)} `;
        } else {
          const H = 4 + rnd() * 3.5;
          d += `C ${P(x + wd * 0.1, base - H, base)} ${P(x + wd * 0.8, base - H, base)} ${P(x + wd, base, base)} `;
        }
        x += wd * (0.72 + rnd() * 0.2);
        base -= 0.35;
      }
      x += 5 + rnd() * 4; // pen lift between words
    });
    d += `M ${P(x - 6, baseY - 1, baseY)} C ${P(x + 5, baseY + 3, baseY)} ${P(x * 0.55, baseY + 8, baseY)} ${P(4, baseY + 5, baseY)}`;
    return { d, w: Math.ceil(x + 8) };
  }
  const sigSvg = (name, ink, drawn) => {
    const g = signature(name);
    return `<svg class="ui-sig${drawn ? '' : ' draw'}" viewBox="0 0 ${g.w} 36" preserveAspectRatio="xMinYMid meet"><path pathLength="1" d="${g.d}" stroke="${ink}"/></svg>`;
  };
  const N = { input: null, sigCell: null, signing: false, err: null };
  function buildName() {
    const s = el('div', { id: 'ui-name', class: 'ui-screen ui-off' });
    const reg = registerData();
    const tb = el('tbody');
    const rows = reg.rows.slice(-8);
    rows.forEach((r, i) => {
      const rnd = U.mulberry32(U.hash('reg:' + r.date + r.name));
      const rot = ((rnd() - 0.5) * 1.3).toFixed(2), ink = REG_INKS[i % REG_INKS.length];
      const name = fmt(r.name || '');
      tb.appendChild(el('tr', { style: { color: ink } },
        el('td', { class: 'hw', text: fmt(r.date || ''), style: { transform: `rotate(${rot}deg)` } }),
        el('td', { class: 'hw', text: shiftCell(r.in, r.out) }),
        el('td', { class: 'hw', text: fmt(r.relieving || '') }),
        el('td', { class: 'hw nm', text: name, style: { transform: `rotate(${(-rot * 0.6).toFixed(2)}deg)` } }),
        el('td', { class: 'sg', html: name && !r.noSig ? sigSvg(name, ink, true) : '' }),
        el('td', { class: 'hw rm', text: fmt(r.rem || '') })));
    });
    const you = reg.you || REGISTER_FALLBACK.you;
    N.input = el('input', { class: 'ui-reg-in', type: 'text', maxlength: '20', spellcheck: 'false', autocomplete: 'off', placeholder: 'print your name' });
    N.sigCell = el('td', { class: 'sg you' });
    N.row = el('tr', { class: 'you' },
      el('td', { class: 'hw', text: fmt(you.date || '') }),
      el('td', { class: 'hw', text: shiftCell(you.in, you.out) }),
      el('td', { class: 'hw', text: fmt(you.relieving || '') }),
      el('td', { class: 'nm' }, N.input),
      N.sigCell,
      el('td', { class: 'hw rm', text: fmt(you.rem || '') }));
    tb.appendChild(N.row);
    for (let i = 0; i < 2; i++) tb.appendChild(el('tr', { class: 'blank' }, ...Array.from({ length: 6 }, () => el('td'))));
    const cols = Array.isArray(reg.cols) && reg.cols.length === 6 ? reg.cols : REGISTER_FALLBACK.cols;
    const head = el('tr', null, ...cols.map((h) => el('th', { text: h })));
    N.err = el('div', { class: 'ui-reg-err' });
    const paper = el('div', { class: 'ui-reg' },
      el('div', { class: 'ui-reg-top' }, el('span', { text: reg.form || 'FORM RS-14/3' }), el('span', { text: 'CURRENT PAGE' })),
      el('div', { class: 'ui-reg-h', text: fmt(reg.title || REGISTER_FALLBACK.title) }),
      el('div', { class: 'ui-reg-s', text: fmt(reg.rule || REGISTER_FALLBACK.rule) }),
      el('table', { class: 'ui-reg-t' }, el('thead', null, head), tb),
      el('div', { class: 'ui-reg-fine', text: 'Relief operators are reminded that 148.32 MHz is a reserved frequency. Retain this register on site.' }),
      N.err);
    const clip = el('div', { class: 'ui-clip' }, el('div', { class: 'ui-clip-clamp' }, el('i')), paper);
    N.back = el('div', { class: 'ui-mi ui-name-back', role: 'button', onclick: () => { if (!N.signing) DA.modes.pop('name'); } }, el('span', { class: 'ui-mi-t', text: '← BACK' }));
    s.append(el('div', { class: 'ui-name-desk' }), clip,
      el('div', { class: 'ui-name-help' }, el('div', { class: 'ui-name-q', text: 'Sign the register.' }), el('div', { class: 'ui-name-k', text: 'ENTER — SIGN · ESC — BACK' })),
      N.back);
    N.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); signRegister(); }
      else if (e.key === 'Tab') e.preventDefault();
      else if (e.key === 'Escape') { e.preventDefault(); if (!N.signing) DA.modes.pop('name'); }
      else if (N.err.textContent) N.err.textContent = '';
    });
    s.addEventListener('mousedown', (e) => {
      if (!N.signing && e.target !== N.input && !N.back.contains(e.target)) setTimeout(() => N.input.focus(), 0);
    });
    return s;
  }
  function signRegister() {
    if (N.signing) return;
    const name = N.input.value.replace(/\s+/g, ' ').trim().slice(0, 20);
    if (!name) {
      N.err.textContent = 'The register must be signed.';
      N.input.classList.remove('shake');
      void N.input.offsetWidth;
      N.input.classList.add('shake');
      N.input.focus();
      return;
    }
    N.signing = true;
    N.input.value = name;
    N.input.readOnly = true;
    N.input.blur();
    N.sigCell.innerHTML = sigSvg(name, '#1b2a63', false);
    requestAnimationFrame(() => requestAnimationFrame(() => { const p = N.sigCell.querySelector('svg'); if (p) p.classList.add('go'); }));
    sfx('pen', 0.8);
    ui.wait(1.5)
      .then(() => ui.fade(1, 0.9))
      .then(() => {
        N.signing = false;
        DA.newGame(name);
      });
  }
  const nameMode = {
    opaque: true,
    enter() {
      N.signing = false;
      N.input.readOnly = false;
      N.input.value = '';
      N.err.textContent = '';
      N.sigCell.innerHTML = '';
      showScreen(R.name);
      setTimeout(() => { if (DA.modes.is('name')) N.input.focus(); }, 30);
    },
    exit() {
      N.input.blur();
      hideScreen(R.name);
    },
    onKey(e, down) {
      if (browserKey(e)) return false;
      if (!down) return true;
      if (e.code === 'Escape' && !N.signing && !isRepeat(e)) DA.modes.pop('name');
      else if (e.code === 'Enter') signRegister();
      else if (!N.signing && e.key && e.key.length === 1) {
        N.input.focus(); // the keystroke itself lands in the input
        return false;
      }
      return true;
    },
  };

  /* ============================================================= pause */
  const P = { menu: null, confirm: false, openedAt: 0 };
  /** Open the pause menu (no-op if it is already open or no game is running). */
  ui.pause = () => {
    if (!booted || !DA.running || DA.modes.has('pause')) return;
    DA.modes.push('pause');
  };
  function buildPause() {
    const s = el('div', { id: 'ui-pause', class: 'ui-screen ui-off' });
    P.stamp = el('div', { class: 'ui-p-stamp' });
    P.box = el('div', { class: 'ui-p-menu' });
    P.arch = el('div', { class: 'ui-p-arch' });
    s.append(el('div', { class: 'ui-p-inner' }, el('div', { class: 'ui-p-title', text: 'PAUSED' }), P.stamp, P.box, P.arch));
    return s;
  }
  function pauseMain() {
    P.confirm = false;
    P.menu = makeMenu([
      { label: 'RESUME', action: () => DA.modes.pop('pause') },
      { label: 'SETTINGS', action: () => DA.modes.push('settings') },
      { label: 'QUIT TO TITLE', action: pauseConfirm },
    ]);
    P.box.innerHTML = '';
    P.box.appendChild(P.menu.root);
  }
  function pauseConfirm() {
    P.confirm = true;
    P.menu = makeMenu([
      { label: 'STAY', action: pauseMain },
      { label: 'QUIT TO TITLE', cls: 'warn', action: () => DA.quitToTitle() },
    ]);
    P.box.innerHTML = '';
    P.box.append(el('div', { class: 'ui-p-q', text: 'Leave the station?' }),
      el('div', { class: 'ui-p-qs', text: 'Anything since the last archive will be lost.' }), P.menu.root);
  }
  const pauseMode = {
    blocksWorld: true,
    enter() {
      DA.setPaused(true);
      P.openedAt = performance.now();
      pauseMain();
      P.stamp.textContent = DA.clock ? `${DA.clock.date()} — ${DA.clock.hhmm()} · RELAY STATION 14` : '';
      // the archive a death or a quit would really return to: the newest of THIS night (the
      // same filter DA.archive.loadLatest uses), never another run's newer tape
      const night = DA.state && DA.state.night;
      const l = DA.archive && (night ? DA.archive.latest(night) : DA.archive.latest());
      P.arch.textContent = l ? `LAST ARCHIVE · ${archiveLine(l)}` : 'NO ARCHIVE THIS SHIFT';
      showScreen(R.pause);
    },
    exit() {
      hideScreen(R.pause);
      if (!DA.modes.has('pause')) DA.setPaused(false);
    },
    onKey(e, down) {
      if (browserKey(e)) return false;
      if (!down) return true;
      if (e.code === 'Escape' && !isRepeat(e)) {
        if (performance.now() - P.openedAt < 300) return true;
        if (P.confirm) pauseMain();
        else DA.modes.pop('pause');
        return true;
      }
      if (P.menu) P.menu.key(e);
      return true;
    },
  };

  /* ========================================================== settings */
  const SETTINGS = [
    { key: 'volume', label: 'VOLUME', type: 'range', min: 0, max: 1, step: 0.05, show: (v) => Math.round(v * 100) + '%' },
    { key: 'sensitivity', label: 'MOUSE SENSITIVITY', type: 'range', min: 0.2, max: 3, step: 0.05, show: (v) => (+v).toFixed(2) + '×' },
    { key: 'invertY', label: 'INVERT MOUSE Y', type: 'bool' },
    { key: 'fov', label: 'FIELD OF VIEW', type: 'range', min: 55, max: 90, step: 1, show: (v) => Math.round(v) + '°' },
    { key: 'subtitles', label: 'SOUND CAPTIONS', type: 'bool', note: 'Captions for sounds. Speech is always subtitled.' },
    { key: 'voiceStyle', label: 'VOICES', type: 'choice', options: [['natural', 'NATURAL'], ['classic', 'CLASSIC'], ['system', 'SYSTEM SPEECH']],
      note: 'Classic is the old murmur. System speech has your browser read the words aloud.',
      // decision 4: say so when the browser has no speech voices (audio then plays NATURAL)
      unavailable: { system: () => systemVoicesOk() === false },
      warn: () => (systemVoicesOk() === false
        ? (choiceValue(SETTINGS_BY_KEY.voiceStyle) === 'system' ? 'No system voices are installed in this browser — you are hearing NATURAL.' : 'No system voices are installed in this browser.')
        : '') },
    { key: 'grain', label: 'FILM GRAIN', type: 'bool' },
    { key: 'headBob', label: 'HEAD BOB', type: 'bool' },
  ];
  const SETTINGS_BY_KEY = {};
  for (const d of SETTINGS) SETTINGS_BY_KEY[d.key] = d;
  /**
   * Does this browser offer speech voices for VOICES = SYSTEM SPEECH? true / false, or null while
   * unknown (no speechSynthesis answer yet). Prefers DA.audio.systemVoicesAvailable() (G4), then
   * DA.audio.systemVoices(), then the browser's own list (English voices, as audio.js ranks them).
   */
  function systemVoicesOk() {
    const a = DA.audio;
    try {
      if (a && typeof a.systemVoicesAvailable === 'function') return !!a.systemVoicesAvailable();
      if (a && typeof a.systemVoices === 'function') { const v = a.systemVoices(); if (Array.isArray(v) && v.length) return true; }
      const ss = window.speechSynthesis;
      if (!ss || !window.SpeechSynthesisUtterance) return false;
      return ss.getVoices().some((v) => /^en/i.test(v.lang || ''));
    } catch (e) { return null; }
  }
  try {
    // voices arrive asynchronously in Chrome: repaint an open settings screen when they do
    if (window.speechSynthesis && window.speechSynthesis.addEventListener) {
      window.speechSynthesis.addEventListener('voiceschanged', () => { if (booted && DA.modes && DA.modes.has('settings')) paintSettings(); });
    }
  } catch (e) { /* no speech API */ }
  const S = { rows: [], sel: 0, drag: null };
  ui.settings = () => {
    if (!booted || DA.modes.has('settings')) return;
    DA.modes.push('settings');
  };
  function buildSettings() {
    const s = el('div', { id: 'ui-settings', class: 'ui-screen ui-off' });
    const list = el('div', { class: 'ui-s-list' });
    S.rows = SETTINGS.map((def, i) => {
      const row = { def, el: el('div', { class: 'ui-s-row', role: 'button' }) };
      row.val = el('span', { class: 'ui-s-val' });
      // def.warn (fn → text | '') adds a live amber line under the note (repainted with the row)
      row.warn = def.warn ? el('small', { class: 'ui-s-warn ui-off' }) : null;
      const label = el('span', { class: 'ui-s-lab' }, el('span', { text: def.label }), def.note ? el('small', { text: def.note }) : null, row.warn);
      if (def.type === 'range') {
        row.fill = el('i', { class: 'ui-s-fill' });
        row.knob = el('b', { class: 'ui-s-knob' });
        row.track = el('span', { class: 'ui-s-track' }, row.fill, row.knob);
        row.ctrl = el('span', { class: 'ui-s-slider' }, row.track);
        row.ctrl.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          S.drag = row; setFromX(row, e.clientX); e.preventDefault();
        });
      } else if (def.type === 'choice') {
        row.opts = def.options.map(([v, t]) => {
          const o = el('span', { text: t });
          o.addEventListener('click', (e) => { e.stopPropagation(); chooseSetting(row, v); });
          return o;
        });
        row.ctrl = el('span', { class: 'ui-s-sw ui-s-choice' }, ...row.opts);
        row.el.addEventListener('click', () => stepChoice(row, 1));
      } else {
        // decision 4: 'OFF' sets off and 'ON' sets on — never a blind toggle; a click on the
        // rest of the row (the label) still toggles
        const off = el('span', { class: 'off', text: 'OFF' }), on = el('span', { class: 'on', text: 'ON' });
        off.addEventListener('click', (e) => { e.stopPropagation(); setBool(row, false); });
        on.addEventListener('click', (e) => { e.stopPropagation(); setBool(row, true); });
        row.ctrl = el('span', { class: 'ui-s-sw' }, off, on);
        row.el.addEventListener('click', () => toggleSetting(row));
      }
      if (def.type === 'choice') row.el.append(label, row.ctrl);
      else row.el.append(label, row.ctrl, row.val);
      onHover(row.el, () => { if (S.sel !== i) selectSetting(i); });
      list.appendChild(row.el);
      return row;
    });
    S.back = el('div', { class: 'ui-mi ui-s-back', role: 'button', onclick: () => DA.modes.pop('settings') }, el('span', { class: 'ui-mi-t', text: 'BACK' }));
    onHover(S.back, () => { if (S.sel !== SETTINGS.length) selectSetting(SETTINGS.length); });
    s.appendChild(el('div', { class: 'ui-s-panel' },
      el('div', { class: 'ui-s-h' }, el('span', { text: 'SETTINGS' }), el('span', { class: 'ui-s-hint', text: '↑ ↓ SELECT · ← → ADJUST · ESC BACK' })),
      list, S.back));
    window.addEventListener('mousemove', (e) => {
      if (!(e.buttons & 1)) S.drag = null;
      if (S.drag) setFromX(S.drag, e.clientX);
    });
    window.addEventListener('blur', () => { S.drag = null; });
    window.addEventListener('mouseup', () => { S.drag = null; });
    // rows other modules inject (the minimap's) select on mouseenter/over too: hold those back
    // until the pointer has really moved since the screen opened (capture phase, before them)
    const holdHover = (e) => { if (!hoverOk()) e.stopPropagation(); };
    s.addEventListener('mouseenter', holdHover, true);
    s.addEventListener('mouseover', holdHover, true);
    return s;
  }
  function settingsSet(key, v) {
    DA.settings[key] = v;
    if (key === 'voiceStyle') DA.settings.tts = v === 'system'; // legacy flag: tts:true = system speech
    if (DA.saveSettings) DA.saveSettings();
  }
  /** Current value of a choice row (voiceStyle honours the legacy tts flag). */
  function choiceValue(d) {
    if (d.key === 'voiceStyle') {
      if (DA.audio && typeof DA.audio.voiceStyle === 'function') return DA.audio.voiceStyle();
      if (DA.settings.tts === true) return 'system';
    }
    const v = DA.settings[d.key];
    return d.options.some((o) => o[0] === v) ? v : d.options[0][0];
  }
  function chooseSetting(row, v) {
    if (choiceValue(row.def) === v) return;
    settingsSet(row.def.key, v);
    sfx('switch', 0.3);
    paintSettings();
  }
  function stepChoice(row, dir) {
    const o = row.def.options, i = Math.max(0, o.findIndex((x) => x[0] === choiceValue(row.def)));
    chooseSetting(row, o[(i + dir + o.length) % o.length][0]);
  }
  function paintSettings() {
    for (const row of S.rows) {
      const d = row.def, v = DA.settings[d.key];
      if (d.type === 'range') {
        const k = clamp(((+v || 0) - d.min) / (d.max - d.min), 0, 1);
        row.fill.style.width = (k * 100).toFixed(2) + '%';
        row.knob.style.left = (k * 100).toFixed(2) + '%';
        row.val.textContent = d.show(+v || 0);
      } else if (d.type === 'choice') {
        const cur = choiceValue(d);
        d.options.forEach((o, i) => {
          row.opts[i].classList.toggle('is-sel', o[0] === cur);
          const na = !!(d.unavailable && d.unavailable[o[0]] && d.unavailable[o[0]]());
          row.opts[i].classList.toggle('is-na', na);
        });
      } else {
        row.ctrl.classList.toggle('is-on', !!v);
        row.val.textContent = '';
      }
      if (row.warn) {
        let w = '';
        try { w = d.warn() || ''; } catch (e) { w = ''; }
        row.warn.textContent = w;
        row.warn.classList.toggle('ui-off', !w);
      }
    }
  }
  function setFromX(row, x) {
    const r = row.track.getBoundingClientRect();
    const d = row.def;
    const k = clamp((x - r.left) / Math.max(1, r.width), 0, 1);
    const v = Math.round((d.min + k * (d.max - d.min)) / d.step) * d.step;
    settingsSet(d.key, +v.toFixed(3));
    paintSettings();
  }
  function toggleSetting(row) {
    settingsSet(row.def.key, !DA.settings[row.def.key]);
    sfx('switch', 0.3);
    paintSettings();
  }
  /** Set a bool row explicitly (the OFF / ON halves of its switch); a no-op when already so. */
  function setBool(row, v) {
    if (!!DA.settings[row.def.key] === !!v) { paintSettings(); return; }
    settingsSet(row.def.key, !!v);
    sfx('switch', 0.3);
    paintSettings();
  }
  function selectSetting(i) {
    S.sel = i;
    S.rows.forEach((r, k) => r.el.classList.toggle('sel', k === i));
    S.back.classList.toggle('sel', i === SETTINGS.length);
  }
  const settingsMode = {
    blocksWorld: true,
    enter() {
      armHover();
      showScreen(R.settings);
      paintSettings();
      selectSetting(0);
      DA.bus.emit('settings:open');
    },
    exit() {
      S.drag = null;
      hideScreen(R.settings);
      DA.bus.emit('settings:close');
    },
    onKey(e, down) {
      if (browserKey(e)) return false;
      if (!down) return true;
      const c = e.code;
      const n = SETTINGS.length + 1;
      if (c === 'Escape' && !isRepeat(e)) { DA.modes.pop('settings'); return true; }
      if (c === 'ArrowDown' || c === 'KeyS') selectSetting((S.sel + 1) % n);
      else if (c === 'ArrowUp' || c === 'KeyW') selectSetting((S.sel + n - 1) % n);
      else if (S.sel === SETTINGS.length) {
        if ((c === 'Enter' || c === 'Space') && !isRepeat(e)) DA.modes.pop('settings');
      } else {
        const row = S.rows[S.sel], d = row.def;
        if (d.type === 'range' && (c === 'ArrowLeft' || c === 'ArrowRight' || c === 'KeyA' || c === 'KeyD')) {
          const dir = c === 'ArrowRight' || c === 'KeyD' ? 1 : -1;
          const big = Math.max(d.step, (d.max - d.min) / 20);
          const v = clamp((+DA.settings[d.key] || 0) + dir * big, d.min, d.max);
          settingsSet(d.key, +(Math.round(v / d.step) * d.step).toFixed(3));
          paintSettings();
        } else if (d.type === 'bool' && (c === 'Enter' || c === 'Space') && !isRepeat(e)) {
          toggleSetting(row);
        } else if (d.type === 'bool' && (c === 'ArrowLeft' || c === 'ArrowRight' || c === 'KeyA' || c === 'KeyD') && !isRepeat(e)) {
          setBool(row, c === 'ArrowRight' || c === 'KeyD'); // ← / A = OFF (left half), → / D = ON
        } else if (d.type === 'choice' && (c === 'Enter' || c === 'Space' || c === 'ArrowLeft' || c === 'ArrowRight' || c === 'KeyA' || c === 'KeyD') && !isRepeat(e)) {
          stepChoice(row, c === 'ArrowLeft' || c === 'KeyA' ? -1 : 1);
        }
      }
      return true;
    },
  };

  /* ========================================================= screens */
  function showScreen(s) {
    if (!s) return;
    s.classList.remove('ui-off');
    R.screens.appendChild(s); // newest screen on top of its siblings
  }
  function hideScreen(s) { if (s) s.classList.add('ui-off'); }

  /** Paper-grain texture generated once (no image assets). */
  function makeGrain() {
    try {
      const n = 180;
      const c = el('canvas', { width: n, height: n });
      const g = c.getContext('2d');
      const img = g.createImageData(n, n);
      const d = img.data;
      const rnd = U.mulberry32(1999);
      for (let i = 0; i < d.length; i += 4) {
        const v = rnd();
        const dark = v < 0.5;
        const a = Math.pow(Math.abs(v - 0.5) * 2, 3) * 38;
        d[i] = d[i + 1] = d[i + 2] = dark ? 60 : 255;
        d[i + 3] = a;
      }
      g.putImageData(img, 0, 0);
      g.strokeStyle = 'rgba(90,70,40,0.06)';
      for (let i = 0; i < 40; i++) {
        const x = rnd() * n, y = rnd() * n, a = rnd() * Math.PI, l = 4 + rnd() * 10;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
      R.stage.style.setProperty('--ui-grain', `url(${c.toDataURL()})`);
    } catch (e) { /* purely cosmetic */ }
  }

  /* ============================================================ frame */
  function onFrame(dt) {
    if (!booted) return;
    dt = +dt || 0;
    uiTime += dt;
    const gdt = DA.paused ? 0 : dt;
    updateWaits(gdt);
    updateSubs(gdt);
    updateTypers(dt);
    updateFlickers(dt);
    updateObjectives();
    updateToasts(gdt);
    updateHint(gdt);
    updateCard(gdt);
    updateCountdown(gdt);
    updateFade(dt);
    updateWatch(dt, gdt);
    updateLook(dt);
    updateChoice(gdt);
    updateJournalClock(false);
  }

  /** Remove transient HUD: subtitles, toasts, hint, card, prompt. */
  ui.clearHud = () => {
    ui.clearSubtitles();
    for (const t of toasts) t.el.remove();
    toasts.length = 0;
    ui.hint(null);
    if (cardRec) finishCard();
    if (cdRec) cdEnd(false);
    ui.prompt(null);
  };

  /* ============================================================= boot */
  DA.bus.on('boot', () => {
    R.stage = document.getElementById('stage') || document.body;
    R.hudRoot = document.getElementById('hud') || R.stage.appendChild(el('div', { id: 'hud' }));
    R.screens = document.getElementById('screens') || R.stage.appendChild(el('div', { id: 'screens' }));
    makeGrain();

    R.hud = el('div', { class: 'ui-hud' });
    R.objs = el('div', { class: 'ui-objs ui-xo' });
    R.toasts = el('div', { class: 'ui-toasts' });
    R.toastMeasure = el('div', { class: 'ui-toast-twin', 'aria-hidden': 'true' }, el('span'));
    R.toasts.appendChild(R.toastMeasure);
    R.cross = el('div', { class: 'ui-cross ui-xo' });
    R.prompt = el('div', { class: 'ui-prompt ui-xo' });
    R.look = el('div', { class: 'ui-look ui-xo', text: 'CLICK TO LOOK AROUND' });
    R.hint = el('div', { class: 'ui-hint' });
    R.watch = buildWatch();
    R.hud.append(R.objs, R.toasts, R.cross, R.prompt, R.look, R.hint, R.watch);
    R.hudRoot.appendChild(R.hud);

    R.fade = document.getElementById('fade') || el('div', { id: 'fade' });
    R.fade.classList.add('ui-fade');
    R.stage.appendChild(R.fade);
    R.over = el('div', { id: 'ui-over' });
    R.cardTitle = el('div', { class: 'ui-card-title' });
    R.cardSub = el('div', { class: 'ui-card-sub' });
    R.card = el('div', { class: 'ui-card' }, R.cardTitle, R.cardSub);
    R.cardScrim = el('div', { class: 'ui-card-scrim' });
    R.subs = el('div', { class: 'ui-subs' });
    R.choice = el('div', { class: 'ui-choice ui-off' });
    R.cd = buildCountdown();
    R.over.append(R.cardScrim, R.card, el('div', { class: 'ui-bottom' }, R.subs, R.choice));
    R.hud.appendChild(R.cd.root);
    R.stage.appendChild(R.over);

    R.title = buildTitle();
    R.name = buildName();
    R.pause = buildPause();
    R.settings = buildSettings();
    R.journal = buildJournal();
    R.docScreen = buildDocScreen();
    R.screens.append(R.title, R.name, R.pause, R.settings, R.journal, R.docScreen);

    booted = true;
    setFade(0);
    if (promptText) { const p = promptText; promptText = null; ui.prompt(p); }

    DA.modes.register('title', titleMode);
    DA.modes.register('name', nameMode);
    DA.modes.register('pause', pauseMode);
    DA.modes.register('settings', settingsMode);
    DA.modes.register('journal', journalMode);
    DA.modes.register('doc', docMode);
    DA.modes.register('choice', choiceMode);
  });

  DA.bus.on('frame', onFrame);

  // A fresh night or an archive load: drop everything transient from the previous session.
  const onSessionStart = () => {
    if (!booted) return;
    ui.clearHud();
    if (choiceRec) { const r = choiceRec; choiceRec = null; R.choice.classList.add('ui-off'); r.res(r.opts.timeoutId || null); }
    for (const [, h] of hudObjs) h.el.remove();
    hudObjs.clear();
    objUnseen.clear();
    layoutHudObjs();
    watchTemp = 0;
    if (fadeLevel > 0 && !fadeRec) ui.fade(0, 1.2);
  };
  DA.bus.on('game:new', onSessionStart);
  DA.bus.on('game:load', onSessionStart);
  DA.bus.on('game:ready', () => {
    if (!booted) return;
    rebuildHudObjectives();
    syncWatch(true);
  });
  DA.bus.on('game:quit', () => {
    if (!booted) return;
    onSessionStart();
    watchShown = false;
    R.watch.classList.remove('on');
  });
  DA.bus.on('runtime:reset', () => {
    waits.length = 0;
    // Like session waits, a discarded fade must not finish or resume its old script.
    // Keep its current opacity so the new session can fade smoothly back to visible.
    fadeRec = null;
  });

  // Back on your feet: objectives that arrived while the list was hidden flash again.
  // (Toasts re-fit: each mode places them somewhere else — the desk has only a strip of wall.)
  DA.bus.on('mode:exit', () => { if (booted) { objReflash(); fitToasts(); } });
  DA.bus.on('mode:enter', () => { if (booted) { objReflash(); fitToasts(); } });

  // The look hint disappears the moment the pointer is captured.
  DA.bus.on('input:lock', (d) => { if (d && d.locked && booted) { lookT = 0; lookOn = false; R.look.classList.remove('on'); } });

  // Losing pointer lock while exploring (Esc, alt-tab) opens the pause menu.
  DA.bus.on('input:lost-lock', () => { if (topName() === 'explore' && DA.running) ui.pause(); });

  // The receiver log re-renders live while the binder is open.
  const onLog = () => {
    if (J.open && J.tab === 'log') { renderLog(true); if (J.logVisible) markLogSeen(); } else updateTabDots();
  };
  DA.bus.on('radio:log-changed', onLog);
  DA.bus.on('radio:received', onLog);
  DA.bus.on('radio:logged', onLog);
  DA.bus.on('item:add', () => refreshJournal('items'));
  DA.bus.on('item:remove', () => refreshJournal('items'));
  DA.bus.on('tape:found', () => refreshJournal('tapes'));
  // Notes arrive from world (kind 'note') and devices (vents) via 'note:found' — keep NOTES live.
  DA.bus.on('note:found', () => { refreshJournal('notes'); updateTabDots(); });
  DA.bus.on('settings', () => { if (DA.modes && DA.modes.is('settings')) paintSettings(); });
})();
