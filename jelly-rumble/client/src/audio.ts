// Sonido 100% sintetizado con WebAudio: efectos y música procedural, sin
// archivos externos.
import { options } from './settings.ts';

type Wave = OscillatorType;

class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private noiseBuf!: AudioBuffer;
  private seqTimer: number | null = null;
  private track = -1;
  private step = 0;
  private nextNoteTime = 0;

  /** Debe llamarse tras una interacción del usuario (política de autoplay). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    const comp = this.ctx.createDynamicsCompressor();
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    if (this.track >= 0) this.startSequencer();
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    this.master.gain.value = options.master;
    this.musicGain.gain.value = options.music * 0.35;
    this.sfxGain.gain.value = options.sfx;
  }

  private tone(freq: number, dur: number, type: Wave, vol: number, when = 0, slideTo?: number, dest?: AudioNode): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest ?? this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol: number, freq: number, q = 1, when = 0, type: BiquadFilterType = 'bandpass', dest?: AudioNode, sweepTo?: number): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + when;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest ?? this.sfxGain);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  click(): void { this.tone(660, 0.08, 'triangle', 0.25, 0, 990); }
  hover(): void { this.tone(880, 0.04, 'sine', 0.08); }
  jump(): void { this.tone(260, 0.18, 'sine', 0.35, 0, 620); }
  land(power: number): void { this.tone(140, 0.14, 'sine', Math.min(0.45, 0.1 + power * 0.02), 0, 70); }
  bounce(): void { this.tone(200, 0.35, 'sine', 0.4, 0, 900); this.tone(300, 0.3, 'triangle', 0.15, 0.03, 1200); }
  swing(w: string): void {
    if (w === 'hammer' || w === 'quake') this.noise(0.4, 0.5, 500, 1.5, 0, 'bandpass', undefined, 1500);
    else this.noise(0.16, 0.4, 1800, 2, 0, 'bandpass', undefined, 4000);
  }
  hit(power: number, blocked: boolean): void {
    if (blocked) { this.tone(900, 0.12, 'square', 0.15); this.tone(1300, 0.1, 'square', 0.1, 0.02); return; }
    this.tone(180, 0.22, 'sine', 0.6, 0, 50);
    this.noise(0.18, Math.min(0.7, 0.2 + power * 0.025), 900, 0.8);
    this.tone(500, 0.1, 'square', 0.12, 0, 200);
  }
  quake(): void { this.tone(70, 0.7, 'sine', 0.8, 0, 30); this.noise(0.6, 0.6, 200, 0.7, 0, 'lowpass'); }
  pickup(): void { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.25, i * 0.05)); }
  weaponIncoming(): void { this.tone(1400, 0.9, 'sine', 0.12, 0, 300); }
  weaponBreak(): void { this.noise(0.25, 0.5, 3000, 1); this.tone(400, 0.2, 'sawtooth', 0.12, 0, 100); }
  fall(): void { this.tone(700, 0.9, 'triangle', 0.3, 0, 90); }
  eliminated(): void { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.25, 'square', 0.12, i * 0.13)); }
  countdown(final = false): void { this.tone(final ? 1046 : 523, final ? 0.5 : 0.18, 'square', 0.18); }
  qualify(): void { [523, 784, 1046].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.3, i * 0.08)); }
  bar(): void { this.tone(120, 0.3, 'sawtooth', 0.25, 0, 60); this.noise(0.2, 0.5, 600, 1); }
  victory(): void {
    const notes = [523, 659, 784, 1046, 784, 1046, 1318];
    notes.forEach((f, i) => { this.tone(f, 0.28, 'square', 0.13, i * 0.13); this.tone(f / 2, 0.28, 'triangle', 0.2, i * 0.13); });
  }
  defeat(): void { [392, 370, 349, 330].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.25, i * 0.25)); }

  // ------------------------------------------------------------- Música

  private static TRACKS = [
    // tempo, progresión (grados de acorde en semitonos sobre la raíz), raíz, escala para melodía
    { bpm: 108, root: 60, chords: [0, 5, 9, 7], scale: [0, 2, 4, 7, 9, 12] },
    { bpm: 118, root: 62, chords: [0, 7, 9, 5], scale: [0, 2, 4, 7, 9, 12] },
    { bpm: 122, root: 57, chords: [0, 8, 3, 10], scale: [0, 3, 5, 7, 10, 12] },
    { bpm: 128, root: 64, chords: [0, 3, 8, 7], scale: [0, 3, 5, 7, 10, 12] },
    { bpm: 138, root: 55, chords: [0, 8, 10, 7], scale: [0, 3, 5, 7, 10, 12] },
    { bpm: 146, root: 60, chords: [0, 3, 8, 10], scale: [0, 2, 3, 7, 8, 12] },
  ];

  playMusic(track: number): void {
    if (this.track === track) return;
    this.track = track;
    this.step = 0;
    if (this.ctx) this.startSequencer();
  }

  stopMusic(): void {
    this.track = -1;
    if (this.seqTimer !== null) clearInterval(this.seqTimer);
    this.seqTimer = null;
  }

  private startSequencer(): void {
    if (!this.ctx) return;
    if (this.seqTimer !== null) clearInterval(this.seqTimer);
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.seqTimer = window.setInterval(() => this.schedule(), 50);
  }

  private schedule(): void {
    const c = this.ctx;
    if (!c || this.track < 0) return;
    const tr = AudioEngine.TRACKS[this.track % AudioEngine.TRACKS.length]!;
    const sixteenth = 60 / tr.bpm / 4;
    while (this.nextNoteTime < c.currentTime + 0.15) {
      const when = this.nextNoteTime - c.currentTime;
      const s = this.step % 64;
      const bar = Math.floor(s / 16);
      const chord = tr.root + tr.chords[bar]!;
      const beat = s % 16;
      const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
      // Bajo
      if (beat % 4 === 0 || beat === 6 || beat === 14) this.tone(midi(chord - 24), sixteenth * 1.8, 'triangle', 0.5, when, undefined, this.musicGain);
      // Bombo / caja / charles
      if (beat % 4 === 0) this.tone(120, 0.12, 'sine', 0.7, when, 45, this.musicGain);
      if (beat === 4 || beat === 12) this.noise(0.12, 0.35, 1800, 0.8, when, 'bandpass', this.musicGain);
      if (beat % 2 === 1) this.noise(0.04, 0.12, 8000, 1, when, 'highpass', this.musicGain);
      // Acorde en contratiempo
      if (beat === 2 || beat === 10) {
        for (const iv of [0, tr.scale.includes(4) ? 4 : 3, 7]) this.tone(midi(chord + iv - 12), sixteenth * 2, 'square', 0.05, when, undefined, this.musicGain);
      }
      // Melodía pseudoaleatoria repetible
      const h = (this.step * 73 + bar * 31) % 11;
      if ((beat % 2 === 0 && h < 5) || beat === 0) {
        const deg = tr.scale[(h + bar) % tr.scale.length]!;
        this.tone(midi(chord + deg + 12), sixteenth * 1.6, 'triangle', 0.12, when, undefined, this.musicGain);
      }
      this.nextNoteTime += sixteenth;
      this.step++;
    }
  }
}

export const audio = new AudioEngine();
