// Música generativa con estructura (Web Audio, sin archivos).
//
// Cada pieza se compone a partir de un estilo y una semilla: progresiones
// de acordes, motivos de melodía y su variación, línea de bajo y arreglo
// por secciones (intro → estrofa → estribillo → estrofa → puente →
// estribillo → final, unos 44 compases). Al acabar una pieza se compone
// otra con semilla nueva, así que no se repite un bucle corto.
//
// El estilo depende de dónde y cuándo estás: zona (barrio, comercial,
// residencial, distrito financiero), momento del día (día, atardecer,
// noche) y situación (hora punta, suceso inesperado, dentro de tu tienda).
// Los cambios se hacen al empezar un compás con un fundido. Las compras
// grandes y las subidas de etapa suenan con una fanfarria que baja un
// momento la música (ducking).
//
// La mezcla va por buses (batería, bajo, acordes, melodía y eco) que
// acaban en el bus de música del AudioManager, que respeta el volumen de
// música de Opciones.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Generador pseudoaleatorio con semilla (mulberry32).
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MIXO = [0, 2, 4, 5, 7, 9, 10];

// Ritmos de batería por estilo (16 semicorcheas por compás).
const GROOVES = {
  soft: { kick: [0, 10], snare: [], hat: [0, 4, 8, 12], open: [], shaker: false },
  pop: { kick: [0, 7, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], open: [14], shaker: false },
  funk: { kick: [0, 3, 8, 10], snare: [4, 12], hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], open: [6], shaker: false },
  bossa: { kick: [0, 6, 8, 14], snare: [3, 6, 10, 13], hat: [], open: [], shaker: true, rim: true },
  jazz: { kick: [0, 10], snare: [7, 15], hat: [4, 12], open: [], shaker: false, ride: true },
  lofi: { kick: [0, 7, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], open: [], shaker: false, dusty: true },
  lounge: { kick: [0, 8], snare: [12], hat: [2, 6, 10, 14], open: [], shaker: true },
  drive: { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14], open: [6, 14], shaker: false },
  tension: { kick: [0, 3, 6, 8, 11, 14], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], open: [], shaker: false },
};

// Estilos. key: tónica MIDI; progs: grados de la escala (0 = I).
export const STYLES = {
  title: { bpm: 86, key: 53, scale: MAJOR, progs: [[0, 4, 5, 3], [0, 5, 3, 4], [5, 3, 0, 4]], groove: "soft", lead: "bell", sevenths: true, bass: "soft", comp: "pad" },
  barrio: { bpm: 104, key: 60, scale: MAJOR, progs: [[0, 5, 3, 4], [0, 3, 4, 0], [5, 3, 0, 4], [0, 2, 3, 4]], groove: "pop", lead: "pluck", sevenths: false, bass: "pop", comp: "offbeat" },
  comercial: { bpm: 116, key: 55, scale: MIXO, progs: [[0, 6, 3, 0], [0, 3, 6, 3], [0, 4, 3, 0]], groove: "funk", lead: "square", sevenths: true, bass: "funk", comp: "stabs" },
  residencial: { bpm: 92, key: 65, scale: MAJOR, progs: [[0, 3, 0, 4], [0, 5, 1, 4], [3, 4, 0, 5]], groove: "bossa", lead: "flute", sevenths: true, bass: "bossa", comp: "bossa", swing: 0.12 },
  financiero: { bpm: 98, key: 62, scale: DORIAN, progs: [[0, 3, 0, 3], [0, 6, 5, 4], [1, 4, 0, 0]], groove: "jazz", lead: "ep", sevenths: true, bass: "walk", comp: "jazz", swing: 0.22 },
  noche: { bpm: 78, key: 57, scale: MINOR, progs: [[0, 5, 2, 6], [0, 3, 4, 0], [5, 6, 0, 0]], groove: "lofi", lead: "soft", sevenths: true, bass: "soft", comp: "pad", swing: 0.18 },
  tienda: { bpm: 96, key: 58, scale: MAJOR, progs: [[0, 1, 3, 4], [0, 5, 1, 4]], groove: "lounge", lead: "vibes", sevenths: true, bass: "soft", comp: "lounge" },
  hora_punta: { gain: 0.72, bpm: 128, key: 62, scale: MAJOR, progs: [[0, 4, 5, 3], [5, 3, 0, 4]], groove: "drive", lead: "square", sevenths: false, bass: "drive", comp: "stabs" },
  suceso: { gain: 0.72, bpm: 132, key: 57, scale: MINOR, progs: [[0, 0, 5, 4], [0, 6, 5, 6]], groove: "tension", lead: "square", sevenths: false, bass: "ostinato", comp: "stabs" },
};

// Secciones de una pieza: compases e intensidad (0 = solo acordes, 3 = todo).
const FORM = [
  { name: "intro", bars: 4, level: 0 },
  { name: "estrofa", bars: 8, level: 1, melody: "A" },
  { name: "estribillo", bars: 8, level: 3, melody: "B" },
  { name: "estrofa", bars: 8, level: 2, melody: "A2" },
  { name: "puente", bars: 4, level: 1, melody: "C", alt: true },
  { name: "estribillo", bars: 8, level: 3, melody: "B2" },
  { name: "final", bars: 4, level: 0, melody: "end" },
];
// Las situaciones urgentes usan una forma corta que se repite variando.
const SHORT_FORM = [
  { name: "estrofa", bars: 4, level: 2, melody: "A" },
  { name: "estribillo", bars: 4, level: 3, melody: "B" },
];

// Acorde (notas MIDI) del grado `deg` de la escala.
function chordOf(style, deg, octave = 0) {
  const sc = style.scale;
  const notes = [];
  const n = style.sevenths ? 4 : 3;
  for (let i = 0; i < n; i++) {
    const idx = deg + i * 2;
    notes.push(style.key + sc[idx % 7] + 12 * Math.floor(idx / 7) + octave);
  }
  return notes;
}

// Compone una pieza: por compás, el acorde, la nota de bajo y la melodía.
export function compose(styleId, seed) {
  const style = STYLES[styleId];
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const verseProg = pick(style.progs);
  let chorusProg = pick(style.progs);
  if (chorusProg === verseProg && style.progs.length > 1)
    chorusProg = style.progs[(style.progs.indexOf(verseProg) + 1) % style.progs.length];
  const bridgeProg = [3, 4, 5, 4].map((d) => d % 7);
  // Motivo rítmico de la melodía (posiciones en semicorcheas en 2 compases).
  const rhythms = [
    [0, 3, 6, 8, 12, 16, 19, 22, 24],
    [0, 2, 4, 8, 10, 16, 18, 20, 24, 28],
    [0, 4, 6, 8, 14, 16, 20, 24],
    [2, 4, 6, 10, 12, 18, 20, 22, 26],
    [0, 6, 8, 12, 16, 22, 24],
  ];
  const motifs = {};
  const makeMotif = (rhythm, low, high) => {
    // Paseo por las notas de la escala, con notas del acorde en los tiempos.
    let deg = low + Math.floor(r() * (high - low));
    return rhythm.map((pos) => {
      deg += Math.floor(r() * 5) - 2;
      deg = Math.max(low, Math.min(high, deg));
      return { pos, deg, len: 2 + Math.floor(r() * 3) };
    });
  };
  motifs.A = makeMotif(pick(rhythms), 7, 12);
  motifs.B = makeMotif(pick(rhythms), 9, 15);
  motifs.C = makeMotif(pick(rhythms), 5, 10);
  // Variaciones: la segunda estrofa y el segundo estribillo cambian el
  // final del motivo; el final repite el principio resolviendo en la tónica.
  const vary = (m, shift) =>
    m.map((n, i) => (i >= m.length - 3 ? { ...n, deg: n.deg + shift } : n));
  motifs.A2 = vary(motifs.A, r() < 0.5 ? 2 : -1);
  motifs.B2 = vary(motifs.B, 1);
  motifs.end = motifs.A.slice(0, 4).map((n, i, a) =>
    i === a.length - 1 ? { ...n, deg: 7, len: 8 } : n,
  );
  const form = styleId === "suceso" || styleId === "hora_punta" ? SHORT_FORM : FORM;
  const bars = [];
  for (const sec of form) {
    const prog = sec.alt ? bridgeProg : sec.name === "estribillo" ? chorusProg : verseProg;
    for (let b = 0; b < sec.bars; b++) {
      const deg = prog[b % prog.length];
      const motif = motifs[sec.melody];
      const half = b % 2;
      const notes = [];
      if (motif && sec.level > 0) {
        for (const n of motif) {
          const local = n.pos - half * 16;
          if (local < 0 || local >= 16) continue;
          // Las notas fuera del acorde en un tiempo fuerte bajan a la más
          // cercana del acorde: la melodía siempre «encaja».
          let d = n.deg;
          if (local % 4 === 0) {
            const tones = [deg, deg + 2, deg + 4, deg + 7, deg + 9, deg + 11];
            d = tones.reduce((a, t) => (Math.abs(t - d) < Math.abs(a - d) ? t : a), tones[0]);
          }
          const sc = style.scale;
          const midi = style.key + sc[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
          notes.push({ s: local, n: midi, len: n.len });
        }
      } else if (sec.name === "final" && motif) {
        for (const n of motif)
          if (n.pos < 16)
            notes.push({
              s: n.pos,
              n: style.key + style.scale[((n.deg % 7) + 7) % 7] + 12 * Math.floor(n.deg / 7),
              len: n.len,
            });
      }
      bars.push({
        section: sec.name,
        level: sec.level,
        chord: chordOf(style, deg),
        root: style.key - 24 + style.scale[deg % 7],
        notes,
        last: b === sec.bars - 1,
      });
    }
  }
  return { styleId, style, seed, bars };
}

export class Music {
  constructor(audio) {
    this.audio = audio;
    this.ctx = audio.ctx;
    const ctx = this.ctx;
    const out = audio.musicIn;
    // Buses de la mezcla.
    this.duck = ctx.createGain();
    this.duck.connect(out);
    // Nivel de cada estilo (las situaciones urgentes suenan algo más
    // fuertes que la música de zona, pero no mucho más).
    this.styleGain = ctx.createGain();
    this.styleGain.connect(this.duck);
    const bus = (vol) => {
      const g = ctx.createGain();
      g.gain.value = vol;
      g.connect(this.styleGain);
      return g;
    };
    this.drums = bus(0.85);
    this.bassBus = bus(0.9);
    this.chords = bus(0.7);
    this.leadBus = bus(0.75);
    // Eco suave (retardo con realimentación filtrada) para melodía y pads.
    this.echo = ctx.createDelay(1.0);
    this.echo.delayTime.value = 0.32;
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 2400;
    this.echoSend = ctx.createGain();
    this.echoSend.gain.value = 0.22;
    this.echoSend.connect(this.echo);
    this.echo.connect(damp).connect(fb).connect(this.echo);
    damp.connect(this.styleGain);
    // Fanfarrias (compras grandes, etapas): no se atenúan con el ducking.
    this.stingers = ctx.createGain();
    this.stingers.gain.value = 0.9;
    this.stingers.connect(out);
    this.seedBase = Math.floor(Math.random() * 1e9);
    this.pieceCount = 0;
    this.piece = null;
    this.bar = 0;
    this.step = 0;
    this.want = "title";
    this.nextTime = ctx.currentTime + 0.1;
    this.pending = null;
  }

  // Estilo que debería sonar ahora; el cambio se hace al empezar un compás.
  request(styleId, urgent = false) {
    if (!STYLES[styleId]) return;
    this.want = styleId;
    if (urgent && this.piece?.styleId !== styleId) this.switchAt = "beat";
  }

  newPiece(styleId) {
    this.pieceCount++;
    this.piece = compose(styleId, this.seedBase + this.pieceCount * 7919);
    this.styleGain.gain.setValueAtTime(this.piece.style.gain ?? 1, this.nextTime);
    this.bar = 0;
    this.step = 0;
    // Al entrar en una pieza nueva por cambio de lugar se salta la intro.
    if (this.skipIntro) {
      this.skipIntro = false;
      while (this.bar < this.piece.bars.length - 1 && this.piece.bars[this.bar].section === "intro")
        this.bar++;
    }
  }

  fade(to, seconds, at = this.ctx.currentTime) {
    const g = this.audio.musicFade.gain;
    g.cancelScheduledValues(at);
    g.setValueAtTime(g.value, at);
    g.linearRampToValueAtTime(to, at + seconds);
  }

  schedule() {
    const ctx = this.ctx;
    if (!this.piece) this.newPiece(this.want);
    while (this.nextTime < ctx.currentTime + 0.15) {
      const style = this.piece.style;
      const sx = 60 / style.bpm / 4;
      // Cambio de estilo: en el siguiente compás (o en el siguiente tiempo
      // si es urgente), con un fundido corto.
      const boundary = this.step === 0 || (this.switchAt === "beat" && this.step % 4 === 0);
      if (boundary && this.want !== this.piece.styleId) {
        const urgent = this.switchAt === "beat";
        this.switchAt = null;
        this.fade(0.0001, urgent ? 0.25 : 0.6, this.nextTime - (urgent ? 0.25 : 0.6));
        this.skipIntro = true;
        this.newPiece(this.want);
        this.fade(1, urgent ? 0.4 : 1.4, this.nextTime + 0.05);
        continue;
      }
      const b = this.piece.bars[this.bar];
      // Swing: las semicorcheas pares de cada tiempo se retrasan un poco.
      const swing = style.swing && this.step % 2 === 1 ? style.swing * sx : 0;
      this.playStep(style, b, this.step, this.nextTime + swing, sx);
      this.nextTime += sx;
      this.step++;
      if (this.step >= 16) {
        this.step = 0;
        this.bar++;
        if (this.bar >= this.piece.bars.length) this.newPiece(this.want);
      }
    }
  }

  playStep(style, b, s, t, sx) {
    const lvl = b.level;
    const g = GROOVES[style.groove];
    // Batería (desde la estrofa; relleno en el último compás de sección).
    if (lvl >= 1) {
      if (g.kick.includes(s)) this.kick(t, style.groove === "drive" ? 0.55 : 0.45);
      if (lvl >= 2 && g.snare.includes(s)) this.snare(t, g.rim ? 0.12 : 0.22, !!g.rim);
      if (g.hat.includes(s)) this.hat(t, lvl >= 3 ? 0.05 : 0.035, g.dusty);
      if (lvl >= 3 && g.open.includes(s)) this.openHat(t, 0.05);
      if (g.shaker && s % 2 === 0) this.shaker(t, s % 4 === 0 ? 0.02 : 0.035);
      if (g.ride && s % 4 === 0) this.ride(t, 0.035);
      if (b.last && lvl >= 2 && s >= 12) this.snare(t, 0.12 + (s - 12) * 0.03, false);
    } else if (style.groove === "soft" && s % 4 === 0) this.hat(t, 0.015, true);
    // Bajo.
    this.bassLine(style, b, s, t, sx, lvl);
    // Acordes.
    this.comp(style, b, s, t, sx, lvl);
    // Melodía.
    for (const n of b.notes)
      if (n.s === s) this.lead(style.lead, n.n + 12, t, n.len * sx, lvl >= 3 ? 0.06 : 0.05);
    // Arpegio en los estribillos.
    if (lvl >= 3 && s % 2 === 0 && style.groove !== "jazz") {
      const order = [0, 1, 2, 1, 2, 3 % b.chord.length, 2, 1];
      const n = b.chord[order[(s / 2) % 8] % b.chord.length] + 12;
      this.pluck(n, t, sx * 1.5, 0.022);
    }
  }

  bassLine(style, b, s, t, sx, lvl) {
    const root = b.root;
    const fifth = root + 7;
    const third = root + (b.chord[1] - b.chord[0]);
    const pat = {
      soft: { 0: root, 10: root },
      pop: { 0: root, 6: root, 8: fifth, 12: root + 12, 14: fifth },
      funk: { 0: root, 3: root + 12, 6: root, 8: fifth, 10: root + 10, 11: root + 12, 14: fifth },
      bossa: { 0: root, 6: fifth, 8: fifth, 14: root },
      walk: { 0: root, 4: third, 8: fifth, 12: fifth + 2 },
      drive: { 0: root, 2: root, 4: root, 6: root, 8: root, 10: root, 12: fifth, 14: root + 12 },
      ostinato: { 0: root, 2: root + 12, 4: root, 6: root + 7, 8: root, 10: root + 12, 12: root, 14: root + 8 },
    }[style.bass];
    const n = pat?.[s];
    if (n === undefined) return;
    if (lvl === 0 && s !== 0) return;
    const len = style.bass === "walk" ? sx * 3.6 : style.bass === "soft" ? sx * 7 : sx * 1.8;
    this.bassNote(n, t, len, style.bass === "drive" || style.bass === "ostinato" ? 0.2 : 0.24);
  }

  comp(style, b, s, t, sx, lvl) {
    const c = b.chord;
    if (s === 0) this.pad(c, t, sx * 16, lvl === 0 ? 0.03 : 0.02);
    const hits = {
      pad: [],
      offbeat: [4, 12],
      stabs: [2, 6, 10, 14],
      bossa: [0, 3, 6, 10, 12],
      jazz: [3, 10],
      lounge: [0, 8],
    }[style.comp];
    if (lvl >= 1 && hits.includes(s))
      this.ep(c, t, style.comp === "stabs" ? sx * 1.2 : sx * 3, style.comp === "stabs" ? 0.028 : 0.032);
  }

  // ---------- Instrumentos sintetizados ----------

  osc(type, freq, t, dur, vol, dest, opts = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (opts.detune) o.detune.value = opts.detune;
    const g = ctx.createGain();
    const a = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    if (opts.hold) g.gain.setValueAtTime(vol, t + a + opts.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + (opts.hold ?? 0) + dur);
    let node = o;
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(opts.filter, t);
      if (opts.sweep) f.frequency.exponentialRampToValueAtTime(opts.sweep, t + dur);
      f.Q.value = opts.q ?? 0.7;
      node = node.connect(f);
    }
    node.connect(g).connect(dest);
    if (opts.send) g.connect(this.echoSend);
    o.start(t);
    o.stop(t + a + (opts.hold ?? 0) + dur + 0.05);
    return o;
  }

  // Bajo: diente de sierra filtrado con envolvente (punteado) y sub.
  bassNote(n, t, dur, vol) {
    const f = mtof(n);
    this.osc("sawtooth", f, t, dur, vol * 0.5, this.bassBus, { filter: 900, sweep: 220, q: 2 });
    this.osc("sine", f, t, dur * 1.1, vol, this.bassBus, { attack: 0.01 });
  }

  // Piano eléctrico: seno + triángulo una octava arriba, ataque rápido.
  ep(chord, t, dur, vol) {
    for (const n of chord) {
      this.osc("sine", mtof(n), t, dur + 0.3, vol, this.chords, { send: true });
      this.osc("triangle", mtof(n + 12), t, dur * 0.4, vol * 0.25, this.chords, { filter: 3000 });
    }
  }

  // Colchón: sierras desafinadas con filtro suave (cálido, no chillón).
  pad(chord, t, dur, vol) {
    for (const n of chord)
      for (const det of [-7, 7])
        this.osc("sawtooth", mtof(n), t, 0.6, vol * 0.5, this.chords, {
          detune: det,
          attack: 0.6,
          hold: Math.max(0.1, dur - 1.2),
          filter: 900,
          send: true,
        });
  }

  pluck(n, t, dur, vol) {
    this.osc("triangle", mtof(n), t, dur, vol, this.chords, { filter: 4000, sweep: 800 });
  }

  // Melodía según el instrumento del estilo (con vibrato en las largas).
  lead(kind, n, t, dur, vol) {
    const f = mtof(n);
    const out = this.leadBus;
    const o = (() => {
      switch (kind) {
        case "bell":
          this.osc("sine", f * 2.01, t, dur * 0.6, vol * 0.3, out);
          return this.osc("sine", f, t, dur + 0.8, vol, out, { send: true });
        case "square":
          return this.osc("square", f, t, dur, vol * 0.45, out, { filter: 2400, send: true });
        case "flute":
          return this.osc("sine", f, t, dur, vol, out, { attack: 0.05, send: true });
        case "ep":
          this.osc("triangle", f * 2, t, dur * 0.3, vol * 0.2, out);
          return this.osc("sine", f, t, dur + 0.3, vol, out, { send: true });
        case "vibes":
          return this.osc("sine", f, t, dur + 0.6, vol, out, { send: true });
        case "soft":
          return this.osc("triangle", f, t, dur, vol * 0.8, out, { filter: 1600, attack: 0.03, send: true });
        default:
          this.osc("square", f, t, dur * 0.5, vol * 0.2, out, { filter: 3000 });
          return this.osc("triangle", f, t, dur, vol, out, { send: true });
      }
    })();
    if (dur > 0.35) {
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 5.2;
      const depth = this.ctx.createGain();
      depth.gain.value = f * 0.006;
      lfo.connect(depth).connect(o.frequency);
      lfo.start(t + 0.15);
      lfo.stop(t + dur + 0.6);
    }
  }

  kick(t, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(g).connect(this.drums);
    o.start(t);
    o.stop(t + 0.35);
    this.audio.noiseHit(t, vol * 0.15, "highpass", 3000, 0.01, this.drums);
  }

  snare(t, vol, rim) {
    if (rim) {
      this.audio.noiseHit(t, vol, "bandpass", 2600, 0.04, this.drums, 4);
      return;
    }
    this.audio.noiseHit(t, vol, "bandpass", 1800, 0.16, this.drums, 0.7);
    this.osc("triangle", 190, t, 0.08, vol * 0.6, this.drums);
  }

  hat(t, vol, dusty) {
    this.audio.noiseHit(t, vol, "highpass", dusty ? 6000 : 8500, 0.035, this.drums);
  }

  openHat(t, vol) {
    this.audio.noiseHit(t, vol, "highpass", 7000, 0.22, this.drums);
  }

  shaker(t, vol) {
    this.audio.noiseHit(t, vol, "bandpass", 5200, 0.05, this.drums, 1.5);
  }

  ride(t, vol) {
    this.audio.noiseHit(t, vol, "highpass", 5000, 0.4, this.drums);
    this.osc("sine", 3520, t, 0.35, vol * 0.25, this.drums);
  }

  // ---------- Fanfarrias ----------

  // Compra grande o subida de etapa: la música baja y suena una fanfarria
  // en la tonalidad de lo que está sonando.
  stinger(kind) {
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.05;
    const key = this.piece?.style.key ?? 60;
    const long = kind === "stage" || kind === "million";
    const dur = long ? 3.2 : 1.6;
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setValueAtTime(this.duck.gain.value, t);
    this.duck.gain.linearRampToValueAtTime(0.25, t + 0.08);
    this.duck.gain.setValueAtTime(0.25, t + dur);
    this.duck.gain.linearRampToValueAtTime(1, t + dur + 0.8);
    const notes = long ? [0, 4, 7, 12, 16, 19, 24] : [0, 4, 7, 12];
    notes.forEach((d, i) => {
      const at = t + i * (long ? 0.11 : 0.09);
      this.osc("square", mtof(key + 12 + d), at, 0.25, 0.04, this.stingers, { filter: 3000 });
      this.osc("triangle", mtof(key + 12 + d), at, 0.5, 0.07, this.stingers, { send: true });
    });
    const end = t + notes.length * (long ? 0.11 : 0.09);
    for (const d of [0, 4, 7, 12])
      this.osc("sawtooth", mtof(key + d), end, long ? 2.0 : 0.9, 0.025, this.stingers, {
        filter: 2200,
        attack: 0.02,
        send: true,
      });
    // Redoble y platillo en las grandes.
    if (long) {
      for (let i = 0; i < 8; i++) this.audio.noiseHit(t + i * 0.05, 0.05 + i * 0.01, "bandpass", 1800, 0.06, this.stingers, 0.7);
      this.audio.noiseHit(end, 0.12, "highpass", 5000, 1.6, this.stingers);
      this.osc("sine", mtof(key - 12), end, 1.2, 0.2, this.stingers);
    }
  }
}
