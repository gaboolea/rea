// Audio sintetizado en tiempo real con Web Audio: música en bucle generada
// por un secuenciador, efectos de sonido y ambiente urbano. No usa archivos.
// El contexto se crea tras la primera interacción (política de autoplay).

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Frases de melodía (una por compás, 16 semicorcheas; null = silencio).
const A = [
  72,
  null,
  76,
  null,
  79,
  null,
  76,
  null,
  74,
  null,
  72,
  null,
  69,
  null,
  null,
  null,
];
const B = [
  72,
  null,
  74,
  null,
  76,
  null,
  79,
  null,
  81,
  null,
  79,
  76,
  74,
  null,
  null,
  null,
];
const C = [
  76,
  null,
  74,
  72,
  null,
  69,
  72,
  null,
  74,
  null,
  null,
  null,
  67,
  null,
  null,
  null,
];
const D = [
  72,
  null,
  null,
  null,
  74,
  null,
  76,
  null,
  72,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
];

const SONGS = {
  title: {
    bpm: 84,
    chords: [
      [65, 69, 72, 76],
      [64, 67, 71, 74],
      [62, 65, 69, 72],
      [60, 64, 67, 71],
    ],
    bass: [41, 40, 38, 36],
    bells: [
      { 0: 81, 8: 79 },
      { 0: 76 },
      { 0: 77, 8: 76, 12: 74 },
      { 0: 72, 10: 74 },
    ],
  },
  city: {
    bpm: 112,
    chords: [
      [60, 64, 67, 71],
      [57, 60, 64, 67],
      [53, 57, 60, 64],
      [55, 59, 62, 65],
    ],
    bass: [36, 33, 29, 31],
    melody: [A, B, A, D, null, null, C, D],
  },
};

export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.mood = "title";
    this.step = 0;
    this.nextTime = 0;
    this.chatterTimer = 3;
    this.birdTimer = 5;
  }

  get ready() {
    return !!this.ctx && this.ctx.state === "running";
  }

  // Llamar desde un gesto del usuario (clic, tecla, toque).
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = "lowpass";
    this.musicFilter.frequency.value = 9000;
    this.musicGain = ctx.createGain();
    this.musicFade = ctx.createGain();
    this.musicFilter
      .connect(this.musicFade)
      .connect(this.musicGain)
      .connect(this.master);
    this.sfxGain = ctx.createGain();
    this.sfxGain.connect(this.master);
    this.ambGain = ctx.createGain();
    this.ambGain.connect(this.sfxGain);
    this.noise = this.makeNoise();
    this.applySettings();
    this.startAmbience();
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  applySettings() {
    if (!this.ctx) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : 1, t, 0.05);
    this.musicGain.gain.setTargetAtTime(s.music * 0.9, t, 0.05);
    this.sfxGain.gain.setTargetAtTime(s.sfx, t, 0.05);
  }

  setMood(mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    if (!this.ctx) return;
    // Fundido corto y reinicio del compás para cambiar de canción sin cortes.
    const t = this.ctx.currentTime;
    this.musicFade.gain.cancelScheduledValues(t);
    this.musicFade.gain.setValueAtTime(this.musicFade.gain.value, t);
    this.musicFade.gain.linearRampToValueAtTime(0, t + 0.6);
    this.musicFade.gain.linearRampToValueAtTime(1, t + 1.6);
    this.step = 0;
    this.nextTime = t + 0.7;
  }

  makeNoise() {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ---------- Secuenciador ----------

  schedule() {
    if (!this.ctx || this.ctx.state !== "running") return;
    const song = SONGS[this.mood] ?? SONGS.city;
    const sixteenth = 60 / song.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      this.playStep(song, this.step, this.nextTime, sixteenth);
      this.nextTime += sixteenth;
      this.step = (this.step + 1) % (16 * 8);
    }
  }

  playStep(song, step, t, sx) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const chord = song.chords[bar % 4];
    const root = song.bass[bar % 4];
    if (this.mood === "title") {
      if (s === 0) this.pad(chord, t, sx * 16);
      if (s % 4 === 0) this.keys(chord[(s / 4) % 4] + 12, t, 0.08, 0.035);
      if (s === 0 || s === 10) this.bass(root, t, sx * 5, 0.12);
      if (s % 2 === 0) this.hat(t, 0.012, 9000);
      const bell = song.bells[bar % 4][s];
      if (bell && bar % 8 < 6) this.bell(bell, t, 0.05);
      return;
    }
    if (s === 0) this.pad(chord, t, sx * 16, 0.022);
    const arp = [0, 1, 2, 3, 2, 1, 2, 3];
    if (s % 2 === 0) this.keys(chord[arp[(s / 2) % 8]] + 12, t, 0.12, 0.03);
    const bassPattern = { 0: 0, 6: 0, 8: 7, 12: 12, 14: 7 };
    if (bassPattern[s] !== undefined)
      this.bass(root + bassPattern[s], t, sx * 1.6, 0.14);
    if (s === 0 || s === 8 || (s === 11 && bar % 2)) this.kick(t, 0.2);
    if (s === 4 || s === 12) this.clap(t, 0.05);
    if (s % 2 === 0) this.hat(t, s % 4 === 2 ? 0.022 : 0.012, 8000);
    const phrase = song.melody[bar];
    if (phrase && phrase[s]) this.lead(phrase[s], t, sx * 1.8, 0.045);
  }

  // ---------- Instrumentos ----------

  env(gain, t, a, peak, d, sustain = 0.0001) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + a);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, sustain),
      t + a + d,
    );
  }

  voice(type, freq, t, dur, vol, dest, filterFreq = 4000, attack = 0.005) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = filterFreq;
    this.env(g, t, attack, vol, dur);
    o.connect(f).connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
    return o;
  }

  pad(chord, t, dur, vol = 0.03) {
    const ctx = this.ctx;
    for (const n of chord) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.value = mtof(n);
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.5);
        g.gain.setValueAtTime(vol, t + dur - 0.4);
        g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.3);
        const f = ctx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = 1400;
        o.connect(f).connect(g).connect(this.musicFilter);
        o.start(t);
        o.stop(t + dur + 0.4);
      }
    }
  }

  keys(n, t, dur, vol) {
    this.voice("triangle", mtof(n), t, dur + 0.2, vol, this.musicFilter, 2600);
    this.voice("sine", mtof(n + 12), t, dur, vol * 0.4, this.musicFilter, 5000);
  }

  lead(n, t, dur, vol) {
    this.voice(
      "square",
      mtof(n),
      t,
      dur,
      vol * 0.5,
      this.musicFilter,
      2200,
      0.01,
    );
    this.voice(
      "triangle",
      mtof(n),
      t,
      dur + 0.1,
      vol,
      this.musicFilter,
      3000,
      0.01,
    );
  }

  bell(n, t, vol) {
    this.voice("sine", mtof(n), t, 1.6, vol, this.musicFilter, 8000, 0.003);
    this.voice(
      "sine",
      mtof(n) * 2.01,
      t,
      0.8,
      vol * 0.35,
      this.musicFilter,
      8000,
      0.003,
    );
  }

  bass(n, t, dur, vol) {
    this.voice("sine", mtof(n), t, dur, vol, this.musicFilter, 600, 0.01);
    this.voice(
      "triangle",
      mtof(n),
      t,
      dur * 0.8,
      vol * 0.4,
      this.musicFilter,
      500,
      0.01,
    );
  }

  kick(t, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = ctx.createGain();
    this.env(g, t, 0.003, vol, 0.25);
    o.connect(g).connect(this.musicFilter);
    o.start(t);
    o.stop(t + 0.3);
  }

  noiseHit(t, vol, type, freq, dur, dest, q = 1) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, 0.002, vol, dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
    return { src, f, g };
  }

  clap(t, vol) {
    this.noiseHit(t, vol, "bandpass", 1600, 0.12, this.musicFilter, 0.8);
  }

  hat(t, vol, freq) {
    this.noiseHit(t, vol, "highpass", freq, 0.04, this.musicFilter);
  }

  // ---------- Efectos ----------

  sfx(name, opts = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.005;
    const out = this.sfxGain;
    const tone = (type, f, at, dur, vol, ff = 6000) =>
      this.voice(type, f, t + at, dur, vol, out, ff);
    const sweep = (type, f0, f1, at, dur, vol) => {
      const o = tone(type, f0, at, dur, vol);
      o.frequency.exponentialRampToValueAtTime(f1, t + at + dur);
    };
    switch (name) {
      case "click":
        sweep("sine", 900, 1300, 0, 0.05, 0.12);
        break;
      case "hover":
        tone("sine", 1500, 0, 0.03, 0.03);
        break;
      case "coin":
        tone("square", 988, 0, 0.07, 0.06, 4000);
        tone("square", 1319, 0.07, 0.22, 0.06, 4000);
        break;
      case "cash":
        this.noiseHit(t, 0.12, "bandpass", 3500, 0.07, out, 2);
        tone("sine", 1047, 0.04, 0.5, 0.08);
        tone("sine", 1319, 0.08, 0.5, 0.07);
        tone("sine", 1568, 0.12, 0.6, 0.07);
        break;
      case "buy":
        this.noiseHit(t, 0.1, "lowpass", 600, 0.1, out);
        tone("triangle", 523, 0.02, 0.12, 0.1);
        tone("triangle", 784, 0.1, 0.18, 0.1);
        break;
      case "pickup":
        sweep("sine", 200, 70, 0, 0.12, 0.25);
        this.noiseHit(t, 0.08, "lowpass", 500, 0.08, out);
        break;
      case "place":
        sweep("sine", 280, 720, 0, 0.09, 0.15);
        this.noiseHit(t, 0.05, "lowpass", 700, 0.06, out);
        break;
      case "mission":
        [72, 76, 79, 84, 88].forEach((n, i) =>
          tone("triangle", mtof(n), i * 0.08, 0.35, 0.08, 5000),
        );
        [72, 76, 79].forEach((n) =>
          tone("sine", mtof(n + 12), 0.42, 0.9, 0.05),
        );
        break;
      case "sparkle":
        for (let i = 0; i < 6; i++)
          tone("sine", 1200 + i * 220, i * 0.035, 0.18, 0.05);
        break;
      case "error":
        tone("square", 170, 0, 0.16, 0.05, 900);
        break;
      case "step":
        this.noiseHit(
          t,
          opts.vol ?? 0.035,
          "bandpass",
          900 + Math.random() * 500,
          0.045,
          out,
          1.5,
        );
        break;
      case "jump":
        sweep("sine", 320, 640, 0, 0.12, 0.08);
        break;
      case "land":
        sweep("sine", 160, 60, 0, 0.1, 0.18);
        break;
      case "horn":
        tone("square", 392, 0, 0.18, 0.04, 1200);
        tone("square", 494, 0, 0.18, 0.04, 1200);
        break;
      case "whoosh": {
        const n = this.noiseHit(t, 0.12, "bandpass", 300, 0.7, out, 1.2);
        n.f.frequency.exponentialRampToValueAtTime(3000, t + 0.6);
        break;
      }
      case "event":
        tone("triangle", 784, 0, 0.14, 0.09);
        tone("triangle", 1047, 0.12, 0.3, 0.09);
        break;
    }
  }

  // ---------- Ambiente urbano ----------

  startAmbience() {
    const ctx = this.ctx;
    const bed = ctx.createBufferSource();
    bed.buffer = this.noise;
    bed.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 320;
    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = 0.05;
    bed.connect(f).connect(this.bedGain).connect(this.ambGain);
    bed.start();
    const hum = ctx.createOscillator();
    hum.type = "sawtooth";
    hum.frequency.value = 52;
    const hf = ctx.createBiquadFilter();
    hf.type = "lowpass";
    hf.frequency.value = 180;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    hum.connect(hf).connect(this.humGain).connect(this.ambGain);
    hum.start();
  }

  // info: { night, carDist, peopleNear, inside }
  update(dt, info) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const dayLevel = info.title ? 0.035 : info.inside ? 0.03 : 0.06;
    this.bedGain.gain.setTargetAtTime(
      dayLevel * (1 - info.night * 0.4),
      t,
      0.5,
    );
    const car = Math.max(0, 1 - info.carDist / 14);
    this.humGain.gain.setTargetAtTime(car * car * 0.07, t, 0.15);
    this.musicFilter.frequency.setTargetAtTime(
      info.inside ? 4200 : 9000 - info.night * 5000,
      t,
      0.5,
    );
    this.chatterTimer -= dt;
    if (this.chatterTimer <= 0) {
      this.chatterTimer = 2 + Math.random() * 4;
      if (info.peopleNear > 0) this.chatter(Math.min(1, info.peopleNear / 4));
    }
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 4 + Math.random() * 7;
      if (info.night < 0.4 && !info.inside) this.birds();
    }
  }

  // Conversación lejana: sílabas de ruido filtrado.
  chatter(level) {
    const ctx = this.ctx;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.ambGain);
    let t = ctx.currentTime + 0.05;
    const base = 500 + Math.random() * 700;
    const n = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      this.noiseHit(
        t,
        0.03 * level,
        "bandpass",
        base * (0.8 + Math.random() * 0.5),
        0.07,
        pan,
        7,
      );
      t += 0.09 + Math.random() * 0.08;
    }
  }

  birds() {
    const ctx = this.ctx;
    let t = ctx.currentTime + 0.05;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const o = this.voice(
        "sine",
        2600 + Math.random() * 800,
        t,
        0.08,
        0.02,
        this.ambGain,
        9000,
      );
      o.frequency.exponentialRampToValueAtTime(
        3800 + Math.random() * 900,
        t + 0.07,
      );
      t += 0.12 + Math.random() * 0.1;
    }
  }
}
