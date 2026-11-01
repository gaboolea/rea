// Audio sintetizado en tiempo real con Web Audio: música generativa con
// estructura (music.js), efectos de sonido y ambiente urbano (con lluvia).
// No usa archivos. El contexto se crea tras la primera interacción
// (política de autoplay).
import { Music, STYLES } from "./music.js";

// Estilo de cada zona y sus variantes de atardecer y noche (más lentas y
// suaves; de noche, lo-fi en la tonalidad relativa menor).
const ZONE_STYLE = {
  barrio: "barrio",
  comercial: "comercial",
  residencial: "residencial",
  financiero: "financiero",
};
for (const z of Object.values(ZONE_STYLE)) {
  const base = STYLES[z];
  STYLES[`${z}_tarde`] = {
    ...base,
    bpm: Math.round(base.bpm * 0.88),
    lead: base.lead === "square" ? "soft" : base.lead,
    groove: base.groove === "funk" ? "pop" : base.groove,
    comp: base.comp === "stabs" ? "offbeat" : base.comp,
    swing: Math.max(base.swing ?? 0, 0.08),
  };
  STYLES[`${z}_noche`] = { ...STYLES.noche, key: base.key - 3 };
}

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.mood = "title";
    this.style = "title";
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
    // Entrada del bus de música (el compositor mezcla aquí).
    this.musicIn = this.musicFilter;
    this.sfxGain = ctx.createGain();
    this.sfxGain.connect(this.master);
    this.ambGain = ctx.createGain();
    this.ambGain.connect(this.sfxGain);
    this.noise = this.makeNoise();
    this.applySettings();
    this.startAmbience();
    this.music = new Music(this);
    this.music.request(this.style);
    this.timer = setInterval(() => this.music.schedule(), 25);
  }

  applySettings() {
    if (!this.ctx) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : 1, t, 0.05);
    this.musicGain.gain.setTargetAtTime(s.music * 0.9, t, 0.05);
    this.sfxGain.gain.setTargetAtTime(s.sfx, t, 0.05);
  }

  // "title" o "city": en la ciudad el estilo lo decide update() según la
  // zona, la hora y lo que pasa.
  setMood(mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    if (mood === "title") this.setStyle("title", true);
  }

  setStyle(style, urgent = false) {
    if (style === this.style) return;
    this.style = style;
    this.music?.request(style, urgent);
  }

  // Fanfarria: "bigbuy" (compra grande), "stage" (subes de etapa) o
  // "million" (llegas al millón).
  cue(kind) {
    if (this.ready) this.music.stinger(kind);
  }

  // Estilo de música según dónde y cuándo: situación > tienda > noche >
  // atardecer > zona.
  pickStyle(info) {
    if (info.title || this.mood === "title") return "title";
    if (info.surprise) return "suceso";
    if (info.rush) return "hora_punta";
    if (info.shop) return "tienda";
    const zone = ZONE_STYLE[info.zone] ?? "barrio";
    if (info.night > 0.55) return `${zone}_noche`;
    if (info.dusk > 0.5) return `${zone}_tarde`;
    return zone;
  }

  makeNoise() {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ---------- Instrumentos de los efectos ----------

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
    // Lluvia: ruido filtrado (rumor) más gotas sueltas en update().
    const rain = ctx.createBufferSource();
    rain.buffer = this.noise;
    rain.loop = true;
    const rf = ctx.createBiquadFilter();
    rf.type = "bandpass";
    rf.frequency.value = 2600;
    rf.Q.value = 0.4;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    rain.connect(rf).connect(this.rainGain).connect(this.ambGain);
    rain.start();
    this.dropTimer = 0;
  }

  // info: { title, night, dusk, zone, rush, surprise, shop, rain, carDist,
  // peopleNear, inside }
  update(dt, info) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const style = this.pickStyle(info);
    // Las situaciones (suceso, hora punta) entran en el siguiente tiempo.
    this.setStyle(style, style === "suceso" || style === "hora_punta");
    const rain = info.rain ?? 0;
    this.rainGain.gain.setTargetAtTime(rain * (info.inside ? 0.05 : 0.11), t, 0.8);
    this.dropTimer -= dt;
    if (rain > 0.2 && !info.inside && this.dropTimer <= 0) {
      this.dropTimer = 0.03 + Math.random() * 0.12 / rain;
      this.noiseHit(t + 0.01, 0.02 * rain, "bandpass", 3000 + Math.random() * 3000, 0.02, this.ambGain, 6);
    }
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
      if (info.night < 0.4 && !info.inside && rain < 0.2) this.birds();
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
