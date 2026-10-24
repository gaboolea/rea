// Vista de partida: recibe instantáneas del servidor, predice el movimiento
// del jugador local (y lo reconcilia con la autoridad), interpola al resto,
// gestiona la cámara, las entradas, los efectos y el HUD.
import * as THREE from 'three';
import { CORE_SLOW, DT, PICKUP_NAMES, PICKUP_RANGE, WEAPONS, type PickupType, type WeaponType } from '../../shared/constants.ts';
import { COSMETIC_BY_ID } from '../../shared/cosmetics.ts';
import { MAPS, ROUND_COUNT, cylRadius, type MapDef } from '../../shared/maps.ts';
import { type MoveInput, type PhysState, type Solid, buildSolids, clonePhys, groundHeightAt, stepPlayer } from '../../shared/physics.ts';
import {
  type GameEvent, INPUT_ATTACK, INPUT_BLOCK, INPUT_INTERACT, INPUT_JUMP, INPUT_RUN, type NetPlayer, type RoomInfo,
  PICKUP_CODES, STATUS_ALIVE, STATUS_OUT, STATUS_QUALIFIED, STATUS_RESPAWNING, type Snapshot, decodePlayer,
} from '../../shared/protocol.ts';
import { audio } from './audio.ts';
import { Fx } from './fx.ts';
import { Jelly, makeWeaponMesh, preloadFaces } from './jelly.ts';
import type { Net } from './net.ts';
import { options } from './settings.ts';
import { $, banner, feed, toast } from './ui.ts';
import { TouchControls, isTouchDevice } from './touch.ts';
import { WorldView } from './world.ts';

const WEAPON_ICON: Record<WeaponType, string> = { fists: '✊', sword: '🗡️', hammer: '🔨', quake: '🔮', gloves: '🥊' };
const CORE_COLOR = '#5ff2ff';
const INTERP_DELAY = 0.1;
const CORE_GEO = new THREE.IcosahedronGeometry(0.32, 0);
const CORE_MAT = new THREE.MeshStandardMaterial({ color: '#bff9ff', emissive: '#22d8ff', emissiveIntensity: 1.1, roughness: 0.2 });

interface Pending { seq: number; inp: MoveInput; t: number }
interface Frame { time: number; players: Map<number, NetPlayer> }
interface WeaponVis { group: THREE.Group; mesh: THREE.Group; marker: THREE.Mesh; beam: THREE.Mesh; type: PickupType; x: number; y: number; z: number; landed: boolean }

export class GameView {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(65, 1, 0.1, 900);
  private fx: Fx;
  private world: WorldView | null = null;
  private map: MapDef = MAPS[0]!;
  private round = -1;
  private jellies = new Map<number, Jelly>();
  private weapons = new Map<number, WeaponVis>();
  private frames: Frame[] = [];
  private latest = new Map<number, NetPlayer>();
  private room: RoomInfo | null = null;
  private tiles = '';
  phase: Snapshot['phase'] = 'intro';
  private timeLeft = 0;
  private serverT = 0;
  private serverTAt = 0;
  private mapT = 0;
  private ack = 0;

  // Predicción local.
  private seq = 0;
  private pred: PhysState | null = null;
  private pending: Pending[] = [];
  private offset = new THREE.Vector3();
  /** Posición predicha antes del último paso fijo: se interpola hacia la actual para dibujar a 60+ fps. */
  private prevPos = new THREE.Vector3();
  private alpha = 0;
  private tmpV = new THREE.Vector3();
  private acc = 0;
  private localAtk = -1;
  private localAtkW: WeaponType = 'fists';
  private localCd = 0;
  private faceYaw = 0;

  // Entradas.
  private keys = new Set<string>();
  private mouseL = false;
  private mouseR = false;
  private interactQueued = false;
  private jumpQueued = false;
  camYaw = 0;
  private camPitch = 0.38;
  private camDist = 8;
  private shake = 0;
  private spectateIdx = 0;
  private lastCountdown = -1;
  private slots = 0;
  private secured = 0;
  private sudden = false;
  private cores = new Map<number, THREE.Mesh>();
  private carried = new Map<number, THREE.Group>();
  private emotes = new Map<number, { sprite: THREE.Sprite; until: number; happy: boolean }>();
  private owned: string[] = [];
  private winner: { id: number; fx: string; next: number } | null = null;
  private lastStatus = -1;
  private disposed = false;
  private listeners: [EventTarget, string, EventListener][] = [];
  private touch: TouchControls | null = null;
  /** El navegador no permite capturar el ratón (p. ej. dentro de un iframe). */
  private lockFailed = false;
  /** Pendiente de precompilar shaders tras cargar una ronda. */
  private needWarm = false;
  private warmGroup: THREE.Group | null = null;

  constructor(private canvas: HTMLCanvasElement, private net: Net, public myId: number, private onPause: () => void) {
    this.fx = new Fx(this.scene);
    this.bindInput();
    if (isTouchDevice()) {
      this.touch = new TouchControls($('touch'), $('t-stick'), $('t-knob'), () => {
        this.touch?.reset();
        this.onPause();
      }, () => this.emote());
      this.camDist = 9;
    }
  }

  // ---------------------------------------------------------------- Entradas

  private on(target: EventTarget, type: string, fn: EventListener): void {
    target.addEventListener(type, fn);
    this.listeners.push([target, type, fn]);
  }

  private bindInput(): void {
    this.on(window, 'keydown', ((e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      this.keys.add(e.code);
      if (e.code === 'Space') { this.jumpQueued = true; e.preventDefault(); }
      if (e.code === 'KeyE') this.interactQueued = true;
      if (e.code === 'KeyT') this.emote();
      if (/^Digit[1-5]$/.test(e.code)) this.emote(Number(e.code.slice(5)) - 1);
      if (e.code === 'KeyH') {
        options.showHelp = !options.showHelp;
        $('hud-help').classList.toggle('off', !options.showHelp);
      }
      if (e.code === 'Tab') e.preventDefault();
      if (e.code === 'Escape' && document.pointerLockElement !== this.canvas) this.onPause();
    }) as EventListener);
    this.on(window, 'keyup', ((e: KeyboardEvent) => { this.keys.delete(e.code); }) as EventListener);
    this.on(window, 'blur', () => { this.keys.clear(); this.mouseL = this.mouseR = false; });
    this.on(this.canvas, 'mousedown', ((e: MouseEvent) => {
      if (document.pointerLockElement !== this.canvas && !this.lockFailed) {
        this.lock();
        return;
      }
      if (e.button === 0) {
        this.mouseL = true;
        if (this.isSpectating()) this.spectateIdx++;
      }
      if (e.button === 2) this.mouseR = true;
    }) as EventListener);
    this.on(window, 'mouseup', ((e: MouseEvent) => {
      if (e.button === 0) this.mouseL = false;
      if (e.button === 2) this.mouseR = false;
    }) as EventListener);
    this.on(this.canvas, 'contextmenu', (e) => e.preventDefault());
    this.on(document, 'mousemove', ((e: MouseEvent) => {
      // Sin captura del ratón: girar la cámara arrastrando con un botón pulsado.
      if (document.pointerLockElement !== this.canvas && !(this.lockFailed && e.buttons !== 0)) return;
      // Algunos navegadores envían un salto enorme al capturar el ratón.
      if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
      const s = 0.0024 * options.sensitivity;
      this.camYaw -= e.movementX * s;
      this.camPitch += e.movementY * s * (options.invertY ? -1 : 1);
      this.camPitch = THREE.MathUtils.clamp(this.camPitch, -0.12, 1.25);
    }) as EventListener);
    this.on(this.canvas, 'wheel', ((e: WheelEvent) => {
      this.camDist = THREE.MathUtils.clamp(this.camDist + Math.sign(e.deltaY) * 0.8, 4, 14);
    }) as EventListener);
    this.on(document, 'pointerlockerror', () => this.markLockFailed());
    this.on(document, 'pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      $('hud-lock').classList.toggle('on', !locked && !this.lockFailed);
      if (!locked && !this.disposed) {
        this.mouseL = this.mouseR = false;
        this.onPause();
      }
    });
  }

  lock(): void {
    audio.unlock();
    if (this.touch || this.lockFailed) return;
    try {
      const r = this.canvas.requestPointerLock?.() as unknown as Promise<void> | undefined;
      r?.catch?.(() => this.markLockFailed());
    } catch {
      this.markLockFailed();
    }
  }

  private markLockFailed(): void {
    if (this.lockFailed) return;
    this.lockFailed = true;
    $('hud-lock').classList.remove('on');
    toast('Arrastra con el ratón para girar la cámara');
  }

  private isSpectating(): boolean {
    const me = this.latest.get(this.myId);
    return !me || me.status === STATUS_OUT;
  }

  // ------------------------------------------------------------- Red

  setRoom(info: RoomInfo): void {
    this.room = info;
  }

  private playerInfo(id: number) {
    return this.room?.players.find((p) => p.id === id);
  }

  private nameOf(id: number): string {
    return this.playerInfo(id)?.name ?? '???';
  }

  onSnapshot(s: Snapshot): void {
    const now = performance.now() / 1000;
    if (s.round !== this.round) this.loadRound(s.round);
    this.phase = s.phase;
    this.timeLeft = s.timeLeft;
    this.serverT = s.t;
    this.serverTAt = now;
    this.ack = s.ack;
    if (s.tiles !== undefined) this.tiles = s.tiles;

    const players = new Map<number, NetPlayer>();
    for (const a of s.p) {
      const p = decodePlayer(a);
      players.set(p.id, p);
    }
    this.latest = players;
    this.frames.push({ time: now, players });
    while (this.frames.length > 2 && this.frames[1]!.time < now - INTERP_DELAY - 0.5) this.frames.shift();

    // Armas.
    const seen = new Set<number>();
    for (const [id, code, x, y, z, landed] of s.w) {
      seen.add(id);
      let w = this.weapons.get(id);
      const type = PICKUP_CODES[code] ?? 'sword';
      if (!w) w = this.createWeapon(id, type, x, y, z);
      w.x = x; w.y = y; w.z = z;
      if (landed && !w.landed) {
        this.fx.burst({ x, y: y + 0.2, z }, ['#ffffff', '#ffd23f'], 14, 5, 0.5);
        this.fx.ring({ x, y, z }, '#ffd23f', 2.5, 0.5);
      }
      w.landed = landed === 1;
    }
    for (const [id, w] of this.weapons) {
      if (!seen.has(id)) {
        w.group.removeFromParent();
        w.marker.removeFromParent();
        this.weapons.delete(id);
      }
    }

    this.slots = s.slots;
    this.secured = s.secured;
    if (s.sudden) this.sudden = true;
    this.syncCores(s.c ?? []);

    for (const e of s.e ?? []) this.handleEvent(e);
    this.reconcile();
  }

  // --------------------------------------------------- Núcleos de energía

  private syncCores(list: [number, number, number, number][]): void {
    const seen = new Set<number>();
    for (const [id, x, y, z] of list) {
      seen.add(id);
      let m = this.cores.get(id);
      if (!m) {
        m = new THREE.Mesh(CORE_GEO, CORE_MAT);
        m.position.set(x, y, z);
        this.scene.add(m);
        this.cores.set(id, m);
      }
      m.userData.target = [x, y, z];
    }
    for (const [id, m] of this.cores) {
      if (!seen.has(id)) {
        m.removeFromParent();
        this.cores.delete(id);
      }
    }
  }

  /** Núcleos que lleva cada jugador: giran sobre su cabeza. */
  private updateCarried(id: number, j: Jelly, carry: number, now: number): void {
    let g = this.carried.get(id);
    if (!g && carry > 0) {
      g = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(CORE_GEO, CORE_MAT);
        m.scale.setScalar(0.6);
        g.add(m);
      }
      this.scene.add(g);
      this.carried.set(id, g);
    }
    if (!g) return;
    g.visible = carry > 0 && j.root.visible;
    g.position.copy(j.root.position);
    g.children.forEach((c, i) => {
      c.visible = i < carry;
      const a = now * 3 + (i / 3) * Math.PI * 2;
      c.position.set(Math.cos(a) * 0.55, 2.55 + Math.sin(now * 5 + i) * 0.08, Math.sin(a) * 0.55);
      c.rotation.y = now * 4;
    });
  }

  // ------------------------------------------------------------- Gestos

  private showEmote(id: number, emoji: string): void {
    const old = this.emotes.get(id);
    old?.sprite.removeFromParent();
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(255,250,242,0.95)';
    g.beginPath();
    g.arc(64, 58, 50, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(54, 100); g.lineTo(64, 124); g.lineTo(76, 100);
    g.fill();
    g.font = '64px serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(emoji, 64, 62);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sprite.scale.setScalar(1.1);
    sprite.renderOrder = 11;
    this.scene.add(sprite);
    this.emotes.set(id, { sprite, until: performance.now() / 1000 + 2.2, happy: emoji !== '💢' });
    this.jellies.get(id)?.poke(2.5);
  }

  /** Lanza un gesto desbloqueado (tecla T o botón táctil). */
  emote(slot = -1): void {
    const owned = this.emoteIds();
    if (!owned.length) return;
    const id = slot >= 0 ? owned[slot] : owned[Math.floor(Math.random() * owned.length)];
    if (id) this.net.send({ type: 'emote', e: id.slice('emote:'.length) });
  }

  setOwned(owned: string[]): void {
    this.owned = owned;
  }

  private emoteIds(): string[] {
    return this.owned.filter((id) => id.startsWith('emote:'));
  }

  // ----------------------------------------------------------- Victoria

  /** Celebración final: cámara al campeón y efecto elegido (confeti por defecto). */
  setWinner(id: number, fx: string): void {
    this.winner = { id, fx, next: 0 };
  }

  private celebrate(now: number): void {
    const w = this.winner;
    if (!w || now < w.next) return;
    w.next = now + 0.18;
    const j = this.jellies.get(w.id);
    const base = j?.root.position ?? new THREE.Vector3();
    const kind = COSMETIC_BY_ID.get(w.fx)?.value ?? 'confetti';
    const at = { x: base.x + (Math.random() - 0.5) * 5, y: base.y + 3 + Math.random() * 3, z: base.z + (Math.random() - 0.5) * 5 };
    if (kind === 'fireworks') {
      this.fx.burst(at, [['#ff5a7a', '#ffd23f'], ['#3bb4ff', '#ffffff'], ['#7be35b', '#ffe14d']][Math.floor(Math.random() * 3)]!, 40, 10, 1.2, -4, 1.1);
    } else if (kind === 'hearts') {
      this.fx.burst(at, ['#ff5a7a', '#ff7ae0', '#ffffff'], 16, 3, 1.6, -2, 1.3);
    } else if (kind === 'stars') {
      this.fx.burst(at, ['#ffd23f', '#fff3a8', '#ffb000'], 22, 6, 1.4, -6, 1.2);
    } else {
      this.fx.burst(at, ['#ff5a7a', '#ffd23f', '#3bb4ff', '#7be35b', '#b06dff', '#ffffff'], 26, 6, 1.8, -7, 0.9);
    }
  }

  private loadRound(r: number): void {
    this.round = r;
    this.map = MAPS[r]!;
    this.world?.dispose();
    this.world = new WorldView(this.map, this.scene);
    this.world.setShadows(options.quality !== 'low', options.quality === 'high' ? 2048 : 1024);
    for (const w of this.weapons.values()) { w.group.removeFromParent(); w.marker.removeFromParent(); }
    this.weapons.clear();
    this.fx.clear();
    this.pred = null;
    this.pending = [];
    this.tiles = this.map.tileCount ? '0'.repeat(this.map.tileCount) : '';
    this.frames = [];
    this.lastCountdown = -1;
    this.needWarm = true;
    $('hud-map').textContent = `${this.map.name} — 🎯 ${this.map.objective}`;
    this.sudden = false;
    this.winner = null;
    for (const m of this.cores.values()) m.removeFromParent();
    this.cores.clear();
    audio.playMusic(this.map.theme.music + 1);
    // Cámara detrás del jugador mirando al centro.
    const sp = this.map.spawns[0]!;
    this.camYaw = Math.atan2(-sp[0], -sp[2]);
    if (this.map.goalZ !== undefined) this.camYaw = 0;
  }

  private createWeapon(id: number, type: PickupType, x: number, y: number, z: number): WeaponVis {
    const group = new THREE.Group();
    const mesh = makeWeaponMesh(type);
    mesh.scale.setScalar(1.25);
    group.add(mesh);
    const color = type === 'quake' ? '#b06dff' : type === 'hammer' ? '#ff8a3d' : type === 'gloves' ? '#ff3b5c' : type === 'shield' ? '#ffd23f' : '#7fe7ff';
    const marker = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.9, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    marker.rotation.x = -Math.PI / 2;
    this.scene.add(marker);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.6, 30, 12, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
    group.add(beam);
    group.position.set(x, y, z);
    this.scene.add(group);
    const w: WeaponVis = { group, mesh, marker, beam, type, x, y, z, landed: false };
    group.userData.marker = marker;
    this.weapons.set(id, w);
    return w;
  }

  private posOf(id: number): THREE.Vector3 | null {
    const j = this.jellies.get(id);
    if (j) return j.root.position.clone();
    const p = this.latest.get(id);
    return p ? new THREE.Vector3(p.x, p.y, p.z) : null;
  }

  private handleEvent(e: GameEvent): void {
    const me = this.myId;
    switch (e.k) {
      case 'hit': {
        const victimColor = this.playerInfo(e.v)?.look.color ?? '#ffffff';
        this.fx.burst({ x: e.x, y: e.y, z: e.z }, e.blocked ? ['#7fe7ff', '#ffffff'] : [victimColor, '#ffffff', '#ffd23f'], e.blocked ? 10 : 22, 7, 0.7);
        if (e.w === 'quake') {
          const a = this.posOf(e.a);
          if (a) this.fx.ring(a, '#b06dff', 6, 0.6);
        }
        this.jellies.get(e.v)?.poke(4);
        audio.hit(e.power, e.blocked);
        if (e.v === me || e.a === me) this.shake = Math.max(this.shake, e.v === me ? 0.35 : 0.15);
        break;
      }
      case 'swing': {
        if (e.p === me) break;
        const pos = this.posOf(e.p);
        const mine = this.posOf(me);
        if (pos && (!mine || pos.distanceTo(mine) < 25)) audio.swing(e.w);
        if (e.w === 'quake' && pos) setTimeout(() => { this.fx.ring(pos, '#b06dff', 5, 0.5); audio.quake(); }, WEAPONS.quake.windup * 1000);
        break;
      }
      case 'out': {
        const pos = this.posOf(e.v);
        if (pos) this.fx.burst(pos.add(new THREE.Vector3(0, 0.8, 0)), [this.playerInfo(e.v)?.look.color ?? '#fff', '#ffffff'], 30, 9, 1);
        const v = this.nameOf(e.v);
        const how = e.reason === 'lava' ? 'a la lava' : 'al vacío';
        let text: string;
        if (e.reason === 'left') text = `${v} abandonó la partida`;
        else if (e.by >= 0) text = `${this.nameOf(e.by)} empujó a ${v} ${how}${e.final ? ' 💀' : ''}`;
        else text = `${v} cayó ${how}${e.final ? ' 💀' : ''}`;
        feed(text, e.v === me || e.by === me);
        if (e.v === me) {
          if (e.final) { banner('¡ELIMINADO!', 'Ahora eres espectador. Clic para cambiar de cámara'); audio.eliminated(); }
          else { banner('¡HAS CAÍDO!', 'Reapareces en 2 segundos'); audio.fall(); }
          this.pred = null;
          this.pending = [];
        }
        break;
      }
      case 'pick': {
        const pos = this.posOf(e.p);
        if (pos) this.fx.sparkle(pos, e.w === 'shield' ? '#7fe7ff' : '#ffd23f', 20);
        if (e.p === me) {
          audio.pickup();
          if (e.w === 'shield') banner('¡ESCUDO!', 'Bloquea los golpes unos segundos');
          const el = $('hud-weapon');
          el.classList.remove('flash');
          void el.offsetWidth;
          el.classList.add('flash');
        }
        break;
      }
      case 'break':
        if (e.p === me) { toast(`¡Tu ${PICKUP_NAMES[e.w]} se ha roto!`); audio.weaponBreak(); }
        break;
      case 'wspawn':
        feed(`📦 ¡Cae del cielo: ${PICKUP_NAMES[e.w]}!`);
        audio.weaponIncoming();
        break;
      case 'qual':
        if (e.p === me) { banner(`¡META! ${e.place}º`, 'Clasificado: espera a que termine la ronda'); audio.qualify(); }
        else feed(`🏁 ${this.nameOf(e.p)} llega a la meta (${e.place}º)`);
        break;
      case 'core': {
        const pos = this.posOf(e.p);
        if (e.a === 'pick') {
          if (pos) this.fx.sparkle(pos, CORE_COLOR, 10);
          if (e.p === me) audio.pickup();
        } else if (e.a === 'deliver') {
          if (pos) { this.fx.burst(pos.clone().setY(pos.y + 1.5), [CORE_COLOR, '#ffffff', '#ffd23f'], 30, 7, 0.9); this.fx.ring(pos, CORE_COLOR, 4, 0.6); }
          if (e.p === me) { banner(`+${e.n} ⚡`, `Llevas ${e.pts} puntos`); audio.qualify(); }
          else feed(`⚡ ${this.nameOf(e.p)} entrega ${e.n} núcleo${e.n > 1 ? 's' : ''}`);
        } else {
          if (pos) this.fx.burst(pos.clone().setY(pos.y + 1), [CORE_COLOR, '#ffffff'], 16, 6, 0.6);
          if (e.p === me) toast(`¡Te han hecho soltar ${e.n} núcleo${e.n > 1 ? 's' : ''}!`);
        }
        break;
      }
      case 'emote': {
        const em = COSMETIC_BY_ID.get(`emote:${e.e}`);
        if (em) this.showEmote(e.p, em.value);
        break;
      }
      case 'sudden':
        banner('¡MUERTE SÚBITA!', 'Los empujones son mucho más fuertes');
        audio.countdown(true);
        this.shake = 0.4;
        break;
      case 'respawn': {
        const p = this.latest.get(e.p);
        if (p) this.fx.sparkle(p, '#ffffff', 16);
        break;
      }
      case 'bar':
        if (e.p === me) { audio.bar(); this.shake = 0.3; }
        break;
      case 'msg':
        if (e.text === '¡YA!') { banner('¡YA!'); audio.countdown(true); }
        else if (e.text.startsWith('RONDA')) banner(e.text.split(':')[0]!, e.text.split(':')[1]?.trim());
        else feed(e.text);
        break;
    }
  }

  // ---------------------------------------------------------- Predicción

  private canControl(): boolean {
    const me = this.latest.get(this.myId);
    return this.phase === 'playing' && !!me && (me.status === STATUS_ALIVE || me.status === STATUS_QUALIFIED);
  }

  private reconcile(): void {
    const me = this.latest.get(this.myId);
    if (!me || !this.canControl()) {
      this.pred = null;
      this.pending = [];
      this.offset.set(0, 0, 0);
      return;
    }
    this.pending = this.pending.filter((p) => p.seq > this.ack);
    const before = this.pred ? new THREE.Vector3(this.pred.x, this.pred.y, this.pred.z) : null;
    const s = clonePhys(me);
    for (const p of this.pending) {
      stepPlayer(s, p.inp, this.map, solidsAt(this.map, p.t, this.tiles), p.t, DT);
    }
    this.pred = s;
    if (before) {
      const dx = s.x - before.x;
      const dy = s.y - before.y;
      const dz = s.z - before.z;
      this.prevPos.x += dx; this.prevPos.y += dy; this.prevPos.z += dz;
      this.offset.x -= dx; this.offset.y -= dy; this.offset.z -= dz;
      if (this.offset.length() > 3.5) this.offset.set(0, 0, 0);
    } else {
      this.prevPos.set(s.x, s.y, s.z);
    }
  }

  private fixedStep(): void {
    const k = this.keys;
    let fx = 0;
    let fz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) fz += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fz -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
    const tc = this.touch;
    if (tc) { fx += tc.x; fz += tc.y; }
    const sy = Math.sin(this.camYaw);
    const cy = Math.cos(this.camYaw);
    let mx = sy * fz - cy * fx;
    let mz = cy * fz + sy * fx;
    const l = Math.hypot(mx, mz);
    if (l > 1) { mx /= l; mz /= l; }
    const control = this.canControl();
    if (!control) { mx = 0; mz = 0; }

    let b = 0;
    const tJump = tc ? tc.takeJump() || tc.jump : false;
    const tInteract = tc ? tc.takeInteract() : false;
    const jump = control && (k.has('Space') || this.jumpQueued || tJump);
    if (jump) b |= INPUT_JUMP;
    // En táctil se corre al empujar el joystick hasta el borde.
    if (k.has('ShiftLeft') || k.has('ShiftRight') || (tc && Math.hypot(tc.x, tc.y) > 0.92)) b |= INPUT_RUN;
    if (control && (this.mouseR || k.has('KeyF') || tc?.block)) b |= INPUT_BLOCK;
    if (control && (this.mouseL || k.has('KeyJ') || tc?.attack)) b |= INPUT_ATTACK;
    if (control && (this.interactQueued || tInteract)) b |= INPUT_INTERACT;
    this.jumpQueued = false;
    this.interactQueued = false;
    this.seq++;
    this.net.send({ type: 'in', s: this.seq, mx: round3(mx), mz: round3(mz), yaw: round3(this.camYaw), b });

    const me = this.latest.get(this.myId);
    if (!control || !me) return;
    if (!this.pred) {
      this.pred = clonePhys(me);
      this.prevPos.set(me.x, me.y, me.z);
    }

    // Ataque predicho localmente para que la animación sea inmediata.
    this.localCd = Math.max(0, this.localCd - DT);
    if (this.localAtk >= 0) {
      this.localAtk += DT;
      if (this.localAtk > WEAPONS[this.localAtkW].windup + 0.3) this.localAtk = -1;
    }
    const blocking = (b & INPUT_BLOCK) !== 0 && this.localAtk < 0 && this.pred.stun <= 0;
    if ((b & INPUT_ATTACK) && this.localAtk < 0 && this.localCd <= 0 && this.pred.stun <= 0 && !blocking && me.status === STATUS_ALIVE) {
      this.localAtk = 0;
      this.localAtkW = me.weapon;
      this.localCd = WEAPONS[me.weapon].cooldown;
      this.faceYaw = this.camYaw;
      audio.swing(me.weapon);
    }
    const t = this.serverT + (this.seq - this.ack) * DT;
    const inp: MoveInput = { mx, mz, jump: (b & INPUT_JUMP) !== 0, run: (b & INPUT_RUN) !== 0, block: blocking, load: 1 - CORE_SLOW * me.carry };
    this.prevPos.set(this.pred.x, this.pred.y, this.pred.z);
    const ev = stepPlayer(this.pred, inp, this.map, solidsAt(this.map, t, this.tiles), t, DT);
    this.pending.push({ seq: this.seq, inp, t });
    if (this.pending.length > 90) this.pending.shift();
    if (this.localAtk < 0 && (mx !== 0 || mz !== 0) && this.pred.stun <= 0) this.faceYaw = Math.atan2(mx, mz);
    if (ev.jumped) audio.jump();
    if (ev.bounced) { audio.bounce(); this.fx.burst(this.pred, '#ff5ad8', 12, 5, 0.5); }
    if (ev.landed > 9) {
      audio.land(ev.landed);
      this.fx.burst(this.pred, '#ffffff', 8, 3, 0.4, -5);
    }
  }

  // ---------------------------------------------------------- Render

  private emoteHappy(id: number, now: number): boolean {
    const e = this.emotes.get(id);
    return !!e && e.happy && now < e.until;
  }

  private interpolated(id: number, renderTime: number): NetPlayer | null {
    const fr = this.frames;
    if (fr.length === 0) return null;
    let a: Frame | null = null;
    let b: Frame | null = null;
    for (let i = fr.length - 1; i >= 0; i--) {
      if (fr[i]!.time <= renderTime) {
        a = fr[i]!;
        b = fr[i + 1] ?? null;
        break;
      }
    }
    if (!a) return fr[0]!.players.get(id) ?? null;
    const pa = a.players.get(id);
    const pb = b?.players.get(id);
    if (!pa) return pb ?? null;
    if (!pb || !b) return pa;
    const k = THREE.MathUtils.clamp((renderTime - a.time) / Math.max(1e-3, b.time - a.time), 0, 1);
    if (Math.hypot(pb.x - pa.x, pb.y - pa.y, pb.z - pa.z) > 5) return pb;
    let dyaw = pb.yaw - pa.yaw;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    return {
      ...pb,
      x: pa.x + (pb.x - pa.x) * k, y: pa.y + (pb.y - pa.y) * k, z: pa.z + (pb.z - pa.z) * k,
      vx: pa.vx + (pb.vx - pa.vx) * k, vy: pa.vy + (pb.vy - pa.vy) * k, vz: pa.vz + (pb.vz - pa.vz) * k,
      yaw: pa.yaw + dyaw * k,
      atk: pb.atk >= 0 && pa.atk >= 0 ? pa.atk + (pb.atk - pa.atk) * k : pb.atk,
      grounded: k < 0.5 ? pa.grounded : pb.grounded,
    };
  }

  private ensureJelly(id: number): Jelly | null {
    let j = this.jellies.get(id);
    if (j) return j;
    const info = this.playerInfo(id);
    if (!info) return null;
    j = new Jelly(info.look, info.name, { bot: info.bot, me: id === this.myId });
    this.scene.add(j.root);
    this.jellies.set(id, j);
    return j;
  }

  /**
   * Compila de antemano todos los shaders que pueden aparecer en la ronda
   * (personajes, armas, escudos, marcadores, partículas). En móviles cada
   * compilación a mitad de partida congela la imagen un instante.
   */
  private warmup(renderer: THREE.WebGLRenderer): void {
    this.needWarm = false;
    const warm = new THREE.Group();
    const info = this.room?.players[0];
    const j = new Jelly(info?.look ?? { color: '#ff5a7a', accessory: 'crown', eyes: 'round' }, 'warm');
    j.root.traverse((o) => { o.visible = true; });
    warm.add(j.root);
    for (const t of ['sword', 'hammer', 'quake', 'gloves', 'shield'] as const) warm.add(makeWeaponMesh(t));
    warm.add(new THREE.Mesh(CORE_GEO, CORE_MAT));
    const marker = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.9, 8), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    warm.add(marker);
    // Delante de la cámara para dibujarlo de verdad una vez (enlaza los programas).
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    warm.position.copy(this.camera.position).addScaledVector(dir, 6);
    this.scene.add(warm);
    this.fx.ring(warm.position, '#ffffff', 1, 0.01);
    preloadFaces(renderer, (this.room?.players ?? []).map((p) => p.look.eyes));
    renderer.compile(this.scene, this.camera);
    renderer.render(this.scene, this.camera);
    // Se queda oculto (no se libera) para que three.js conserve los programas compilados.
    warm.visible = false;
    this.warmGroup?.removeFromParent();
    this.warmGroup = warm;
  }

  frame(dt: number, renderer: THREE.WebGLRenderer): void {
    if (this.disposed) return;
    if (this.needWarm && this.world) this.warmup(renderer);
    const now = performance.now() / 1000;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= DT && steps < 5) {
      this.acc -= DT;
      this.fixedStep();
      steps++;
    }
    if (steps === 5) this.acc = 0;
    this.alpha = Math.min(1, this.acc / DT);

    // Con predicción, el escenario se dibuja en el mismo instante interpolado que el jugador.
    const mapT = this.mapT = this.pred
      ? this.serverT + (this.seq - this.ack - 1 + this.alpha) * DT
      : this.serverT + (this.phase === 'playing' ? Math.min(0.25, now - this.serverTAt) : 0);
    this.world?.update(mapT, dt, this.tiles, now);
    const solids = solidsAt(this.map, mapT, this.tiles);

    // Personajes.
    const renderTime = now - INTERP_DELAY;
    const ids = new Set(this.latest.keys());
    for (const [id, j] of this.jellies) {
      if (!ids.has(id)) { j.dispose(); this.jellies.delete(id); }
    }
    this.offset.multiplyScalar(Math.exp(-dt * 12));
    for (const id of ids) {
      const server = this.latest.get(id)!;
      const j = this.ensureJelly(id);
      if (!j) continue;
      const visible = server.status === STATUS_ALIVE || server.status === STATUS_QUALIFIED;
      j.root.visible = visible;
      if (!visible) continue;
      if (id === this.myId && this.pred) {
        const p = this.pred;
        this.tmpV.set(p.x, p.y, p.z).sub(this.prevPos).multiplyScalar(this.alpha).add(this.prevPos).add(this.offset);
        j.root.position.copy(this.tmpV);
        j.update(dt, {
          vx: p.vx, vy: p.vy, vz: p.vz, grounded: p.grounded, yaw: this.faceYaw,
          atk: this.localAtk, atkW: this.localAtkW, weapon: server.weapon,
          blocking: (this.mouseR || this.keys.has('KeyF') || !!this.touch?.block) && this.localAtk < 0 && p.stun <= 0,
          stun: p.stun, invuln: server.invuln, happy: server.status === STATUS_QUALIFIED || this.emoteHappy(id, now) || this.winner?.id === id,
          shielded: server.shield > 0,
        });
      } else {
        const p = (id === this.myId ? server : this.interpolated(id, renderTime)) ?? server;
        j.root.position.set(p.x, p.y, p.z);
        j.update(dt, { ...p, happy: p.status === STATUS_QUALIFIED || this.emoteHappy(id, now) || this.winner?.id === id, shielded: p.shield > 0 });
      }
      this.updateCarried(id, j, server.carry, now);
      const em = this.emotes.get(id);
      if (em) {
        em.sprite.position.copy(j.root.position).setY(j.root.position.y + 2.9);
        if (now > em.until) { em.sprite.removeFromParent(); this.emotes.delete(id); }
      }
      const rp = j.root.position;
      j.setGround(groundHeightAt(solids, rp.x, rp.z, rp.y + 0.3, 0.3));
    }

    // Armas en el escenario.
    for (const w of this.weapons.values()) {
      w.group.position.lerp(this.tmpV.set(w.x, w.y, w.z), Math.min(1, dt * 15));
      w.mesh.rotation.y += dt * 2.5;
      w.mesh.position.y = w.landed ? 0.35 + Math.sin(now * 3) * 0.12 : 0;
      w.mesh.rotation.z = w.landed ? 0.35 : now * 6;
      (w.beam.material as THREE.MeshBasicMaterial).opacity = w.landed ? 0.12 : 0.3;
      w.beam.position.y = w.landed ? 15 : 12;
      const g = groundHeightAt(solids, w.x, w.z, w.y + 0.5, 0.3);
      w.marker.visible = g > -Infinity;
      w.marker.position.set(w.x, g + 0.06, w.z);
      w.marker.scale.setScalar(w.landed ? 1 : 1 + Math.sin(now * 10) * 0.15);
      if (!w.landed && Math.random() < 0.4) this.fx.sparkle(w.group.position, '#ffffff', 1);
    }

    for (const m of this.cores.values()) {
      const [x, y, z] = m.userData.target as [number, number, number];
      m.position.lerp(this.tmpV.set(x, y + Math.sin(now * 3 + m.id) * 0.12, z), Math.min(1, dt * 14));
      m.rotation.y += dt * 2;
      m.rotation.x += dt;
    }
    if (this.phase === 'final') this.celebrate(now);
    this.fx.update(dt);
    this.updateCamera(dt);
    this.updateHud(now);
    renderer.render(this.scene, this.camera);
  }

  private updateCamera(dt: number): void {
    if (this.touch) {
      const [dx, dy] = this.touch.takeLook();
      const s = 0.006 * options.sensitivity;
      this.camYaw -= dx * s;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + dy * s * (options.invertY ? -1 : 1), -0.12, 1.25);
    }
    let target: THREE.Vector3 | null = null;
    const winJ = this.winner ? this.jellies.get(this.winner.id) : undefined;
    if (winJ && this.phase === 'final') {
      // Celebración: la cámara gira alrededor del campeón.
      const t0 = winJ.root.position.clone().setY(winJ.root.position.y + 1.1);
      const a = performance.now() / 1000 * 0.4;
      this.camera.position.lerp(this.tmpV.set(t0.x + Math.sin(a) * 5.5, t0.y + 2, t0.z + Math.cos(a) * 5.5), Math.min(1, dt * 3));
      this.camera.lookAt(t0);
      return;
    }
    const meJ = this.jellies.get(this.myId);
    const me = this.latest.get(this.myId);
    if (meJ && meJ.root.visible) {
      target = meJ.root.position.clone();
    } else if (me && me.status === STATUS_RESPAWNING) {
      target = new THREE.Vector3(me.x, Math.max(me.y, this.map.killY + 6), me.z);
    } else {
      const alive = [...this.latest.values()].filter((p) => p.status === STATUS_ALIVE || p.status === STATUS_QUALIFIED);
      const p = alive.length ? alive[this.spectateIdx % alive.length] : undefined;
      if (p) {
        target = this.jellies.get(p.id)?.root.position.clone() ?? new THREE.Vector3(p.x, p.y, p.z);
        $('hud-spectate').textContent = `👀 Siguiendo a ${this.nameOf(p.id)} · clic para cambiar`;
      }
    }
    if (!target) target = new THREE.Vector3(0, 0, this.map.goalZ ? 40 : 0);
    if (!this.isSpectating()) $('hud-spectate').textContent = '';
    target.y += 1.3;
    const cp = Math.cos(this.camPitch);
    const desired = new THREE.Vector3(
      target.x - Math.sin(this.camYaw) * this.camDist * cp,
      target.y + Math.sin(this.camPitch) * this.camDist,
      target.z - Math.cos(this.camYaw) * this.camDist * cp,
    );
    // No dejar que la cámara atraviese el suelo.
    const g = groundHeightAt(solidsAt(this.map, this.mapT, this.tiles), desired.x, desired.z, target.y + 0.5, 0.4);
    if (g > -Infinity && desired.y < g + 0.8) desired.y = g + 0.8;
    this.camera.position.lerp(desired, Math.min(1, dt * 12));
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 1.2);
    }
    this.camera.lookAt(target);
    if (this.world) {
      this.world.sun.position.set(target.x + 25, target.y + 45, target.z + 18);
      this.world.sun.target.position.copy(target);
    }
  }

  /** Línea de objetivo con el progreso propio según el tipo de ronda. */
  private goalText(me: NetPlayer | undefined, total: number): string {
    const m = this.map;
    const rank = me?.rank ? `Puesto ${me.rank}/${total}` : '';
    // Con la repesca siempre avanzan al menos 2.
    const slots = Math.max(this.slots, Math.min(2, total));
    switch (m.mode) {
      case 'race':
        return `🏁 ${this.secured}/${slots} plazas en meta · ${rank}`;
      case 'brawl':
        return `⚔️ Pasan ${slots} · ${rank} · ${me?.kos ?? 0} KO`;
      case 'energy': {
        const e = m.energy!;
        const left = Math.ceil(e.zoneTime - (Math.max(0, this.serverT) % e.zoneTime));
        return `⚡ ${me?.score ?? 0} pts · llevas ${me?.carry ?? 0}/3 · ${rank} · zona se mueve en ${left} s`;
      }
      case 'survival':
        return `🔥 Pasan los que sigan vivos · quedan ${this.secured}`;
      default:
        return this.sudden ? '💀 ¡MUERTE SÚBITA! Último en pie gana' : `👑 Último en pie gana · ${this.secured} en pie`;
    }
  }

  private updateHud(_now: number): void {
    const me = this.latest.get(this.myId);
    $('hud-round').textContent = `RONDA ${this.round + 1}/${ROUND_COUNT}`;
    const tl = Math.max(0, this.timeLeft);
    const timer = $('hud-timer');
    if (this.phase === 'playing') {
      timer.textContent = `${Math.floor(tl / 60)}:${String(Math.floor(tl % 60)).padStart(2, '0')}`;
      timer.classList.toggle('hurry', tl <= 10);
    } else {
      timer.textContent = this.phase === 'intro' ? '¡Prepárate!' : '—';
      timer.classList.remove('hurry');
    }
    // Cuenta atrás de la intro.
    if (this.phase === 'intro') {
      const n = Math.ceil(tl);
      if (n !== this.lastCountdown && n <= 3 && n >= 1) {
        this.lastCountdown = n;
        banner(String(n), this.map.subtitle);
        audio.countdown();
      }
    }
    const players = [...this.latest.values()];
    const alive = players.filter((p) => p.status === STATUS_ALIVE || p.status === STATUS_RESPAWNING || p.status === STATUS_QUALIFIED).length;
    $('hud-alive').textContent = `👥 ${alive}/${players.length} vivos`;
    $('hud-goal').textContent = this.goalText(me, players.length);
    const intro = $('hud-intro');
    if (this.phase === 'intro') {
      intro.classList.add('on');
      $('intro-round').textContent = `RONDA ${this.round + 1}/${ROUND_COUNT}`;
      $('intro-name').textContent = this.map.name;
      $('intro-goal').textContent = `🎯 ${this.map.objective}`;
      $('intro-rules').textContent = this.map.rules;
      $('intro-slots').textContent = this.map.mode === 'final'
        ? `${players.length} finalistas · solo uno será campeón`
        : this.map.mode === 'survival'
          ? `${players.length} jugadores · pasan todos los que sigan vivos (como mínimo ${this.slots})`
          : players.length <= 2
            ? 'Solo quedáis 2: los dos pasáis a la final, ¡pero demuestra quién manda!'
            : `${players.length} jugadores · se clasifican ${this.slots}`;
    } else {
      intro.classList.remove('on');
    }

    const meEl = $('hud-me');
    const wEl = $('hud-weapon');
    if (me && me.status !== STATUS_OUT) {
      meEl.style.display = '';
      wEl.style.display = '';
      $('hud-lives').textContent = me.status === STATUS_QUALIFIED ? '🏁 Clasificado' : '❤️'.repeat(Math.max(0, me.lives)) + '🤍'.repeat(Math.max(0, this.map.lives - me.lives));
      $('hud-dmg').textContent = `${Math.round(me.damage)}%`;
      $('hud-w-icon').textContent = WEAPON_ICON[me.weapon];
      $('hud-w-name').textContent = WEAPONS[me.weapon].name;
      const usesTxt = Number.isFinite(me.uses) ? `${me.uses} usos` : this.touch ? 'Toca 👊 para golpear' : 'Clic izq. para golpear';
      $('hud-w-uses').textContent = me.shield > 0 ? `${usesTxt} · 🛡️ ${Math.ceil(me.shield)} s` : usesTxt;
    } else {
      meEl.style.display = 'none';
      wEl.style.display = 'none';
    }
    if (me && me.status !== this.lastStatus) this.lastStatus = me.status;

    // Aviso de recogida.
    let prompt = '';
    const pos = this.pred ?? me;
    if (pos && this.canControl()) {
      for (const w of this.weapons.values()) {
        if (Math.hypot(w.x - pos.x, w.z - pos.z) < PICKUP_RANGE && Math.abs(w.y - pos.y) < 2.5 && (w.landed || w.y - pos.y < 2.5)) {
          prompt = this.touch ? `Toca ✋ para coger: ${PICKUP_NAMES[w.type]}` : `Pulsa <kbd>E</kbd> para coger: ${PICKUP_NAMES[w.type]}`;
          break;
        }
      }
      if (!prompt && this.world) {
        const sc = this.world.sectorCountdown(this.serverT);
        if (sc > 0) prompt = `⚠️ ¡Los sectores rojos caen en ${Math.ceil(sc)}!`;
      }
      const c = this.map.cyls[0];
      if (!prompt && c?.shrink && this.serverT > c.shrink.start && this.serverT < c.shrink.end) prompt = `⚠️ El ring se encoge: radio ${cylRadius(c, this.serverT).toFixed(1)} m`;
    }
    const pe = $('hud-prompt');
    pe.innerHTML = prompt;
    pe.classList.toggle('on', prompt !== '');
    $('hud-net').textContent = `${this.net.latency} ms · ${this.room?.code ?? ''}`;
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  applyQuality(): void {
    this.world?.setShadows(options.quality !== 'low', options.quality === 'high' ? 2048 : 1024);
  }

  dispose(): void {
    this.disposed = true;
    for (const [t, type, fn] of this.listeners) t.removeEventListener(type, fn);
    this.touch?.dispose();
    this.listeners = [];
    for (const j of this.jellies.values()) j.dispose();
    for (const g of this.carried.values()) g.removeFromParent();
    for (const e of this.emotes.values()) e.sprite.removeFromParent();
    this.world?.dispose();
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

// Caché pequeña de sólidos por paso de simulación: el escenario solo cambia
// una vez por tick, así que no se reconstruye en cada fotograma ni en cada
// repetición de la reconciliación.
const solidCache = new Map<string, Solid[]>();
let tilesRef = '';
let tilesKey = 0;
function solidsAt(map: MapDef, t: number, tiles: string): Solid[] {
  if (tiles !== tilesRef) {
    tilesRef = tiles;
    tilesKey++;
  }
  const key = `${map.id}|${Math.round(t / DT)}|${tilesKey}`;
  let v = solidCache.get(key);
  if (!v) {
    v = buildSolids(map, Math.round(t / DT) * DT, tiles);
    solidCache.set(key, v);
    if (solidCache.size > 24) solidCache.delete(solidCache.keys().next().value!);
  }
  return v;
}
