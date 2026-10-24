// Sala de juego autoritativa: simula a todos los jugadores con la física
// compartida, valida ataques, recogidas y entregas, y dirige el torneo de
// cinco rondas (plazas, clasificación, eliminaciones y campeón). Los clientes
// solo envían entradas.
import {
  CORE_MAX_CARRY, CORE_PICK_RANGE, CORE_SLOW, DT, EMOTE_COOLDOWN, EYES, FREE_ACCESSORIES, GRAVITY,
  KO_CREDIT_WINDOW, MAX_DAMAGE, MAX_PLAYERS, PALETTE, PICKUP_RANGE, PLAYER_RADIUS, RESPAWN_DELAY,
  SHIELD_HITS, SHIELD_TIME, SPAWN_INVULNERABILITY, WEAPONS, WEAPON_GROUND_LIFETIME,
  type Look, type PickupType, type WeaponType, knockbackScale,
} from '../shared/constants.ts';
import type { MatchResult } from '../shared/cosmetics.ts';
import {
  MAPS, R4_GRID, ROUND_COUNT, TILE_GONE, TILE_SHAKE, TILE_SOLID, type MapDef, energyZoneIndex,
} from '../shared/maps.ts';
import { type PhysState, type Solid, buildSolids, groundHeightAt, newPhysState, separatePlayers, stepPlayer } from '../shared/physics.ts';
import {
  type FinalResult, type GameEvent, INPUT_ATTACK, INPUT_BLOCK, INPUT_INTERACT, INPUT_JUMP, INPUT_RUN,
  type NetCore, type NetPlayer, PICKUP_CODES, type RoomInfo, type RoomPhase, type RoundResult, STATUS_ALIVE, STATUS_OUT,
  STATUS_QUALIFIED, STATUS_RESPAWNING, STATUS_SPECTATOR, type ServerMsg, type Snapshot, type Standing,
  encodePlayer,
} from '../shared/protocol.ts';
import { BOT_NAMES, BotBrain, type BotView } from './bots.ts';

export interface Conn {
  send(msg: ServerMsg | string): void;
}

interface QueuedInput { s: number; mx: number; mz: number; yaw: number; b: number }

let nextId = 1;
export function allocId(): number {
  return nextId++;
}

export class Player implements NetPlayer {
  x = 0; y = 0; z = 0; vx = 0; vy = 0; vz = 0;
  grounded = false; ground = -1; stun = 0; coyote = 0; jumpHeld = false; barCd = 0;
  yaw = 0;
  status = STATUS_SPECTATOR;
  damage = 0;
  lives = 0;
  weapon: WeaponType = 'fists';
  uses = Infinity;
  atk = -1;
  atkW: WeaponType = 'fists';
  atkHit = false;
  atkCd = 0;
  blocking = false;
  invuln = 0;
  kos = 0;
  wins = 0;
  carry = 0;
  score = 0;
  shield = 0;
  shieldHits = 0;
  rank = 0;
  queue: QueuedInput[] = [];
  last: QueuedInput = { s: 0, mx: 0, mz: 0, yaw: 0, b: 0 };
  ack = 0;
  prevInteract = false;
  lastHitBy = -1;
  lastHitAt = -100;
  respawnAt = 0;
  outRound = 0;
  outTime = 0;
  /** Datos de la ronda en curso. */
  best = 0;
  finishedAt = Infinity;
  finishPlace = 0;
  kosRound = 0;
  dmgRound = 0;
  repesca = false;
  lastGX = 0; lastGY = 0; lastGZ = 0;
  /** Acumulados del torneo (recompensas). */
  roundsCleared = 0;
  coresTotal = 0;
  totalDamageDealt = 0;
  participant = false;
  inRound = false;
  lastEmoteAt = -100;
  /** Perfil persistente: identificador y cosméticos desbloqueados. */
  token: string | null = null;
  owned = new Set<string>();
  brain: BotBrain | null = null;

  constructor(
    public id: number,
    public name: string,
    public look: Look,
    public conn: Conn | null,
  ) {
    if (!conn) this.brain = new BotBrain(id);
  }

  get bot(): boolean {
    return this.conn === null;
  }

  get inPlay(): boolean {
    return this.status === STATUS_ALIVE || this.status === STATUS_RESPAWNING || this.status === STATUS_QUALIFIED;
  }

  phys(): PhysState {
    return this;
  }
}

interface Weapon { id: number; type: PickupType; x: number; y: number; z: number; landed: boolean; landedAt: number }
interface Core { id: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; landed: boolean }

export interface MatchEndEntry {
  player: Player;
  result: MatchResult;
}

const PUBLIC_COUNTDOWN = 15;
const START_COUNTDOWN = 4;
const INTRO_TIME = 6;
const ROUND_END_TIME = 8;
const FINAL_TIME = 16;
const SUDDEN_KNOCK = 1.6;

/** Plazas de una ronda: siempre elimina a alguien si hay más de 2 y nunca deja menos de 1. */
export function roundSlots(map: MapDef, n: number): number {
  if (map.mode === 'final') return 1;
  if (n <= 2) return 1;
  return Math.min(n - 1, Math.max(2, Math.round(n * map.keep)));
}

export class Room {
  players = new Map<number, Player>();
  hostId = -1;
  phase: RoomPhase = 'lobby';
  phaseTimer = 0;
  round = 0;
  t = 0;
  clock = 0;
  weapons: Weapon[] = [];
  cores: Core[] = [];
  slots = 0;
  private finishers = 0;
  private sudden = false;
  private nextWeaponId = 1;
  private nextCoreId = 1;
  private nextWeaponAt = 0;
  private nextCoreAt = 0;
  tiles = '';
  private tileStand: Float32Array = new Float32Array(0);
  private tileShake: Float32Array = new Float32Array(0);
  private ringCollapses = 0;
  private tilesDirty = false;
  private events: GameEvent[] = [];
  private tickCount = 0;
  private solids: Solid[] = [];
  private roomDirty = true;
  private lastResult: RoundResult | FinalResult | null = null;
  /** Recompensas al terminar el torneo (lo gestiona el registro de salas). */
  onMatchEnd: ((entries: MatchEndEntry[]) => void) | null = null;

  constructor(public code: string, public isPublic: boolean) {}

  get map(): MapDef {
    return MAPS[this.round]!;
  }

  humans(): Player[] {
    return [...this.players.values()].filter((p) => !p.bot);
  }

  isEmpty(): boolean {
    return this.humans().length === 0;
  }

  canJoin(): boolean {
    return this.players.size < MAX_PLAYERS;
  }

  private roundPlayers(): Player[] {
    return [...this.players.values()].filter((p) => p.inRound);
  }

  // ------------------------------------------------------------- Miembros

  addHuman(p: Player): void {
    this.players.set(p.id, p);
    p.status = STATUS_SPECTATOR;
    p.participant = false;
    p.inRound = false;
    if (this.hostId < 0 || !this.players.get(this.hostId) || this.players.get(this.hostId)!.bot) this.hostId = p.id;
    if (this.phase !== 'lobby' && this.phase !== 'countdown') {
      this.pushMsg(`${p.name} mira la partida y jugará en la siguiente`);
      if (this.lastResult) p.conn?.send(this.lastResult);
    }
    this.roomDirty = true;
  }

  removePlayer(id: number): void {
    const p = this.players.get(id);
    if (!p) return;
    if (p.inRound && p.inPlay && this.isMatchRunning()) {
      this.eliminate(p, 'left', true);
    }
    p.inRound = false;
    this.players.delete(id);
    if (this.hostId === id) {
      this.hostId = this.humans()[0]?.id ?? -1;
    }
    if (this.phase === 'countdown' && this.isPublic && this.players.size < 2) {
      this.phase = 'lobby';
    }
    this.roomDirty = true;
  }

  setBots(requesterId: number, n: number): string | null {
    if (requesterId !== this.hostId) return 'Solo el anfitrión puede añadir bots';
    if (this.phase !== 'lobby' && this.phase !== 'countdown') return 'Los bots se cambian en la sala de espera';
    const bots = [...this.players.values()].filter((p) => p.bot);
    const want = Math.max(0, Math.min(Math.floor(n), MAX_PLAYERS - this.humans().length));
    while (bots.length > want) {
      const b = bots.pop()!;
      this.players.delete(b.id);
    }
    let i = bots.length;
    while (bots.length < want) {
      const used = new Set(bots.map((b) => b.name));
      const nm = BOT_NAMES.find((n2) => !used.has(`Bot ${n2}`)) ?? `${i}`;
      const look: Look = {
        color: PALETTE[(i * 5 + 3) % PALETTE.length]!,
        accessory: FREE_ACCESSORIES[(i * 3 + 1) % FREE_ACCESSORIES.length]!,
        eyes: EYES[i % EYES.length]!,
      };
      const b = new Player(allocId(), `Bot ${nm}`, look, null);
      this.players.set(b.id, b);
      bots.push(b);
      i++;
    }
    this.roomDirty = true;
    return null;
  }

  requestStart(requesterId: number): string | null {
    if (requesterId !== this.hostId) return 'Solo el anfitrión puede empezar';
    if (this.phase !== 'lobby' && this.phase !== 'countdown') return 'La partida ya está en marcha';
    if (this.players.size < 2) return 'Hacen falta al menos 2 jugadores. Añade bots para entrenar o invita a alguien con el código.';
    const wasCounting = this.phase === 'countdown';
    this.phase = 'countdown';
    this.phaseTimer = wasCounting ? Math.min(this.phaseTimer, START_COUNTDOWN) : START_COUNTDOWN;
    this.roomDirty = true;
    return null;
  }

  /** Gesto: solo si el jugador lo tiene desbloqueado y respetando un tiempo de espera. */
  emote(id: number, e: string): void {
    const p = this.players.get(id);
    if (!p || !p.owned.has(`emote:${e}`) || this.clock - p.lastEmoteAt < EMOTE_COOLDOWN) return;
    p.lastEmoteAt = this.clock;
    this.events.push({ k: 'emote', p: id, e });
  }

  isMatchRunning(): boolean {
    return this.phase === 'intro' || this.phase === 'playing' || this.phase === 'roundEnd';
  }

  queueInput(id: number, inp: QueuedInput): void {
    const p = this.players.get(id);
    if (!p || p.bot) return;
    if (!Number.isFinite(inp.s) || inp.s <= p.ack) return;
    p.queue.push(inp);
    if (p.queue.length > 30) p.queue.splice(0, p.queue.length - 30);
  }

  // ------------------------------------------------------------- Ciclo

  tick(): void {
    this.tickCount++;
    this.clock += DT;
    switch (this.phase) {
      case 'lobby':
        if (this.isPublic && this.humans().length >= 2) {
          this.phase = 'countdown';
          this.phaseTimer = PUBLIC_COUNTDOWN;
          this.roomDirty = true;
        }
        this.drainInputs();
        break;
      case 'countdown':
        this.drainInputs();
        this.phaseTimer -= DT;
        if (this.players.size < 2) {
          this.phase = 'lobby';
          this.roomDirty = true;
        } else if (this.phaseTimer <= 0) {
          this.startMatch();
        }
        break;
      case 'intro':
        this.phaseTimer -= DT;
        this.simulate(false);
        if (this.phaseTimer <= 0) {
          this.phase = 'playing';
          this.pushMsg('¡YA!');
          this.roomDirty = true;
        }
        break;
      case 'playing':
        this.t += DT;
        this.simulate(true);
        this.checkRoundEnd();
        break;
      case 'roundEnd':
        this.drainInputs();
        this.phaseTimer -= DT;
        if (this.phaseTimer <= 0) this.beginRound(this.round + 1);
        break;
      case 'final':
        this.drainInputs();
        this.phaseTimer -= DT;
        if (this.phaseTimer <= 0) this.backToLobby();
        break;
    }
  }

  private drainInputs(): void {
    for (const p of this.players.values()) {
      const last = p.queue[p.queue.length - 1];
      if (last) {
        p.ack = last.s;
        p.last = last;
        p.queue.length = 0;
      }
    }
  }

  private startMatch(): void {
    for (const p of this.players.values()) {
      p.participant = true;
      p.status = STATUS_ALIVE;
      p.kos = 0;
      p.outRound = 0;
      p.outTime = 0;
      p.totalDamageDealt = 0;
      p.roundsCleared = 0;
      p.coresTotal = 0;
    }
    this.lastResult = null;
    this.beginRound(0);
  }

  private beginRound(r: number): void {
    this.round = r;
    this.t = 0;
    this.phase = 'intro';
    this.phaseTimer = INTRO_TIME;
    this.weapons = [];
    this.cores = [];
    this.finishers = 0;
    this.sudden = false;
    this.nextWeaponAt = 2.5;
    this.nextCoreAt = 0;
    const map = this.map;
    this.tiles = map.tileCount ? TILE_SOLID.repeat(map.tileCount) : '';
    this.tileStand = new Float32Array(map.tileCount ?? 0);
    this.tileShake = new Float32Array(map.tileCount ?? 0);
    this.ringCollapses = 0;
    this.tilesDirty = true;
    this.solids = buildSolids(map, 0, this.tiles);
    const alive = [...this.players.values()].filter((p) => p.participant && p.status !== STATUS_OUT && p.status !== STATUS_SPECTATOR);
    this.slots = roundSlots(map, alive.length);
    alive.forEach((p, i) => {
      const sp = map.spawns[i % map.spawns.length]!;
      Object.assign(p, newPhysState(sp[0], sp[1], sp[2]));
      p.yaw = map.goalZ !== undefined ? 0 : Math.atan2(-sp[0], -sp[2]);
      p.status = STATUS_ALIVE;
      p.inRound = true;
      p.lives = map.lives;
      p.damage = 0;
      p.weapon = 'fists';
      p.uses = Infinity;
      p.atk = -1;
      p.atkCd = 0;
      p.invuln = 0;
      p.lastHitBy = -1;
      p.carry = 0;
      p.score = 0;
      p.shield = 0;
      p.shieldHits = 0;
      p.best = sp[2];
      p.finishedAt = Infinity;
      p.finishPlace = 0;
      p.kosRound = 0;
      p.dmgRound = 0;
      p.repesca = false;
      p.lastGX = sp[0]; p.lastGY = sp[1]; p.lastGZ = sp[2];
      p.queue.length = 0;
    });
    for (const p of this.players.values()) if (!alive.includes(p)) p.inRound = false;
    this.pushMsg(`RONDA ${r + 1}/${ROUND_COUNT}: ${map.name}`);
    this.roomDirty = true;
  }

  private backToLobby(): void {
    this.phase = 'lobby';
    this.round = 0;
    this.t = 0;
    this.weapons = [];
    this.cores = [];
    for (const p of this.players.values()) {
      p.status = STATUS_SPECTATOR;
      p.participant = false;
      p.inRound = false;
    }
    this.roomDirty = true;
  }

  // ------------------------------------------------------------ Simulación

  private simulate(live: boolean): void {
    const map = this.map;
    this.solids = buildSolids(map, this.t, this.tiles);
    const actors = [...this.players.values()];

    // Entradas de bots.
    if (live) {
      const views: BotView[] = actors.map((p) => ({
        id: p.id, x: p.x, y: p.y, z: p.z, vx: p.vx, vz: p.vz, status: p.status,
        weapon: p.weapon, atk: p.atk, grounded: p.grounded, invuln: p.invuln, carry: p.carry,
      }));
      const world = { map, t: this.t, solids: this.solids, players: views, weapons: this.weapons, cores: this.cores };
      for (const p of actors) {
        if (p.brain && p.inPlay && p.inRound) {
          const bi = p.brain.think(views.find((v) => v.id === p.id)!, world);
          p.queue = [{ s: p.ack + 1, ...bi }];
        }
      }
    }

    for (const p of actors) {
      let inp = p.queue.shift();
      if (p.queue.length > 4) p.queue.splice(0, p.queue.length - 2);
      if (inp) {
        p.ack = inp.s;
        p.last = inp;
      } else {
        inp = { ...p.last, b: p.last.b & ~(INPUT_ATTACK | INPUT_INTERACT) };
      }
      if (!p.inRound || p.status === STATUS_OUT || p.status === STATUS_SPECTATOR) continue;
      if (p.status === STATUS_RESPAWNING) {
        if (this.t >= p.respawnAt) this.respawn(p);
        continue;
      }
      const b = live ? inp.b : 0;
      const mx = live ? clampUnit(inp.mx) : 0;
      const mz = live ? clampUnit(inp.mz) : 0;
      const yaw = Number.isFinite(inp.yaw) ? inp.yaw : p.yaw;
      p.blocking = (b & INPUT_BLOCK) !== 0 && p.atk < 0 && p.stun <= 0;
      const ev = stepPlayer(p, {
        mx, mz, jump: (b & INPUT_JUMP) !== 0, run: (b & INPUT_RUN) !== 0, block: p.blocking, load: 1 - CORE_SLOW * p.carry,
      }, map, this.solids, this.t, DT);
      if (ev.barHit) this.events.push({ k: 'bar', p: p.id });
      if (p.atk < 0 && (mx !== 0 || mz !== 0) && p.stun <= 0) p.yaw = Math.atan2(mx, mz);
      p.invuln = Math.max(0, p.invuln - DT);
      p.atkCd = Math.max(0, p.atkCd - DT);
      if (p.shield > 0) p.shield = Math.max(0, p.shield - DT);
      if (p.grounded) { p.lastGX = p.x; p.lastGY = p.y; p.lastGZ = p.z; }

      if (!live) continue;
      const interact = (b & INPUT_INTERACT) !== 0;
      if (interact && !p.prevInteract) this.tryPickup(p);
      p.prevInteract = interact;
      if ((b & INPUT_ATTACK) !== 0 && p.atk < 0 && p.atkCd <= 0 && p.stun <= 0 && p.status === STATUS_ALIVE) {
        this.startAttack(p, yaw);
      }
    }

    // Colisiones entre cuerpos.
    const bodies = actors.filter((p) => p.inRound && (p.status === STATUS_ALIVE || p.status === STATUS_QUALIFIED));
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) separatePlayers(bodies[i]!, bodies[j]!);
    }

    if (!live) return;
    if (map.mode === 'final' && !this.sudden && this.t >= map.timeLimit) {
      this.sudden = true;
      this.events.push({ k: 'sudden' });
      this.pushMsg('¡MUERTE SÚBITA! Los empujones son mucho más fuertes');
    }
    for (const p of bodies) this.updateAttack(p, bodies);
    this.updateWeapons();
    if (map.energy) this.updateEnergy(bodies);
    if (map.tileCount) this.updateTiles(bodies);
    for (const p of bodies) this.checkFall(p);
    this.updateRanks();
  }

  private startAttack(p: Player, yaw: number): void {
    p.yaw = yaw;
    p.atk = 0;
    p.atkW = p.weapon;
    p.atkHit = false;
    const st = WEAPONS[p.weapon];
    p.atkCd = st.cooldown;
    this.events.push({ k: 'swing', p: p.id, w: p.weapon });
    if (p.weapon !== 'fists') {
      p.uses -= 1;
    }
  }

  private updateAttack(p: Player, bodies: Player[]): void {
    if (p.atk < 0) return;
    p.atk += DT;
    const st = WEAPONS[p.atkW];
    if (!p.atkHit && p.atk >= st.windup) {
      p.atkHit = true;
      if (p.stun > 0) {
        p.atk = -1;
        return;
      }
      this.resolveHit(p, st, bodies);
      if (p.atkW !== 'fists' && p.uses <= 0 && p.weapon === p.atkW) {
        this.events.push({ k: 'break', p: p.id, w: p.atkW });
        p.weapon = 'fists';
        p.uses = Infinity;
      }
    }
    if (p.atk >= st.windup + 0.3) p.atk = -1;
  }

  private resolveHit(p: Player, st: (typeof WEAPONS)[WeaponType], bodies: Player[]): void {
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    for (const o of bodies) {
      if (o === p || o.status !== STATUS_ALIVE || o.invuln > 0) continue;
      const dx = o.x - p.x;
      const dz = o.z - p.z;
      const dy = o.y - p.y;
      const dist = Math.hypot(dx, dz);
      if (dist > st.range + PLAYER_RADIUS || Math.abs(dy) > (st.arc >= 360 ? 2 : 1.6)) continue;
      const nx = dist > 1e-4 ? dx / dist : fx;
      const nz = dist > 1e-4 ? dz / dist : fz;
      if (st.arc < 360 && dist > 0.6) {
        const cos = nx * fx + nz * fz;
        if (cos < Math.cos(((st.arc / 2) * Math.PI) / 180)) continue;
      }
      let dirX = st.arc >= 360 ? nx : nx * 0.55 + fx * 0.45;
      let dirZ = st.arc >= 360 ? nz : nz * 0.55 + fz * 0.45;
      const dl = Math.hypot(dirX, dirZ) || 1;
      dirX /= dl; dirZ /= dl;
      const scale = knockbackScale(o.damage) * (this.sudden ? SUDDEN_KNOCK : 1);
      let kb = st.knockback * scale;
      let lift = st.lift * (0.75 + 0.25 * scale);
      let dmg = st.damage;
      let stun = st.stun;
      // Bloqueo: solo funciona mirando hacia el atacante.
      const ofx = Math.sin(o.yaw);
      const ofz = Math.cos(o.yaw);
      let blocked = o.blocking && (ofx * -nx + ofz * -nz) > 0.2;
      if (o.shield > 0) {
        // Escudo temporal: absorbe el golpe venga de donde venga.
        blocked = true;
        kb *= 0.15;
        lift *= 0.3;
        dmg = 0;
        stun = 0;
        o.shieldHits--;
        if (o.shieldHits <= 0) o.shield = 0;
      } else if (blocked) {
        const f = Math.max(0.3, st.blockPierce);
        kb *= f;
        lift *= f;
        dmg *= 0.5;
        stun *= 0.4;
      }
      o.vx = dirX * kb;
      o.vz = dirZ * kb;
      o.vy = Math.max(o.vy, lift);
      o.grounded = false;
      o.ground = -1;
      o.stun = Math.max(o.stun, stun);
      o.damage = Math.min(MAX_DAMAGE, o.damage + dmg);
      o.lastHitBy = p.id;
      o.lastHitAt = this.t;
      if (p.atkW === 'hammer' || p.atkW === 'quake') o.atk = -1;
      p.totalDamageDealt += dmg;
      p.dmgRound += dmg;
      this.events.push({ k: 'hit', a: p.id, v: o.id, x: o.x, y: o.y + 0.8, z: o.z, w: p.atkW, blocked, power: kb });
      // Un golpe que entra hace soltar núcleos: así se roban.
      if (o.carry > 0 && o.shield <= 0 && !blocked) {
        const n = Math.min(o.carry, p.atkW === 'fists' || p.atkW === 'sword' ? 1 : 2);
        this.dropCores(o, n, dirX, dirZ);
      }
    }
  }

  private tryPickup(p: Player): void {
    let best: Weapon | null = null;
    let bestD = PICKUP_RANGE;
    for (const w of this.weapons) {
      if (!w.landed && w.y - p.y > 2.5) continue;
      const d = Math.hypot(w.x - p.x, w.z - p.z);
      if (d <= bestD && Math.abs(w.y - p.y) < 2.5) { best = w; bestD = d; }
    }
    if (!best) return;
    this.weapons = this.weapons.filter((w) => w !== best);
    if (best.type === 'shield') {
      p.shield = SHIELD_TIME;
      p.shieldHits = SHIELD_HITS;
    } else {
      p.weapon = best.type;
      p.uses = WEAPONS[best.type].uses;
      p.atk = -1;
    }
    this.events.push({ k: 'pick', p: p.id, w: best.type });
  }

  private updateWeapons(): void {
    const map = this.map;
    if (map.maxWeapons > 0 && this.t >= this.nextWeaponAt) {
      // En la final las armas caen a intervalos fijos; en el resto, con algo de variación.
      const jitter = map.mode === 'final' ? 1 : 0.85 + Math.random() * 0.3;
      this.nextWeaponAt = this.t + map.weaponInterval * jitter;
      const wave = map.weaponWave ?? 1;
      for (let i = 0; i < wave && this.weapons.length < map.maxWeapons; i++) this.spawnWeapon();
    }
    for (const w of this.weapons) {
      const ground = groundHeightAt(this.solids, w.x, w.z, w.y + 0.3, 0.3);
      if (!w.landed) {
        w.y -= 11 * DT;
        if (w.y <= ground) {
          w.y = ground;
          w.landed = true;
          w.landedAt = this.t;
        }
      } else if (ground < w.y - 0.05) {
        w.landed = false;
      } else {
        w.y = ground;
      }
    }
    this.weapons = this.weapons.filter((w) => w.y > map.killY && !(w.landed && this.t - w.landedAt > WEAPON_GROUND_LIFETIME));
  }

  /** Elige el tipo según el mapa, sin repetir armas especiales a la vez (reparto equilibrado). */
  private pickWeaponType(): PickupType | null {
    const pool = (Object.entries(this.map.weaponPool) as [PickupType, number][]).filter(([k]) => {
      if (k === 'quake' || k === 'shield') return !this.weapons.some((w) => w.type === k);
      return true;
    });
    const total = pool.reduce((s, [, n]) => s + n, 0);
    if (total <= 0) return null;
    let r = Math.random() * total;
    for (const [k, n] of pool) {
      r -= n;
      if (r <= 0) return k;
    }
    return pool[0]![0];
  }

  private spawnWeapon(): void {
    const map = this.map;
    const type = this.pickWeaponType();
    if (!type) return;
    // Lugar libre y lo más alejado posible de las armas que ya hay.
    const spots = [...map.weaponSpots].sort(() => Math.random() - 0.5);
    let chosen: [number, number, number] | null = null;
    let bestScore = -Infinity;
    for (const [x, z] of spots) {
      const g = groundHeightAt(this.solids, x, z, 50, 0.3);
      if (g < map.killY + 5 || (map.tileCount && g < -1)) continue;
      const near = this.weapons.reduce((m, w) => Math.min(m, Math.hypot(w.x - x, w.z - z)), 99);
      if (near < 2) continue;
      if (near > bestScore) { bestScore = near; chosen = [x, g, z]; }
    }
    if (!chosen) return;
    const jx = chosen[0] + (Math.random() - 0.5) * 1.2;
    const jz = chosen[2] + (Math.random() - 0.5) * 1.2;
    this.weapons.push({ id: this.nextWeaponId++, type, x: jx, y: chosen[1] + 22, z: jz, landed: false, landedAt: 0 });
    this.events.push({ k: 'wspawn', w: type, x: jx, z: jz });
  }

  // ------------------------------------------------------- Ronda de energía

  private updateEnergy(bodies: Player[]): void {
    const e = this.map.energy!;
    const zone = e.zones[energyZoneIndex(e, this.t)]!;
    // Aparición de núcleos lejos de la zona de entrega.
    const cap = Math.min(16, this.roundPlayers().length + 4);
    if (this.t >= this.nextCoreAt && this.cores.length < cap) {
      this.nextCoreAt = this.t + e.coreInterval;
      const spots = [...e.coreSpots].sort(() => Math.random() - 0.5);
      for (const [x, z] of spots) {
        if (Math.hypot(x - zone[0], z - zone[1]) < 7) continue;
        if (this.cores.some((c) => Math.hypot(c.x - x, c.z - z) < 2)) continue;
        const g = groundHeightAt(this.solids, x, z, 50, 0.3);
        if (g < this.map.killY + 5) continue;
        this.cores.push({ id: this.nextCoreId++, x, y: g + 0.6, z, vx: 0, vy: 0, vz: 0, landed: true });
        break;
      }
    }
    // Física de los núcleos sueltos.
    for (const c of this.cores) {
      if (c.landed) continue;
      c.vy += GRAVITY * DT;
      c.x += c.vx * DT; c.y += c.vy * DT; c.z += c.vz * DT;
      const g = groundHeightAt(this.solids, c.x, c.z, c.y, 0.2);
      if (c.vy <= 0 && c.y - 0.6 <= g) {
        c.y = g + 0.6;
        c.vx = c.vz = c.vy = 0;
        c.landed = true;
      }
    }
    // Los que caen al vacío reaparecen en un punto de la arena.
    for (const c of this.cores) {
      if (c.y > this.map.killY) continue;
      const [x, z] = e.coreSpots[Math.floor(Math.random() * e.coreSpots.length)]!;
      const g = groundHeightAt(this.solids, x, z, 50, 0.3);
      Object.assign(c, { x, y: (g > -Infinity ? g : 0) + 0.6, z, vx: 0, vy: 0, vz: 0, landed: true });
    }
    // Recogida (al tocarlos) y entrega.
    for (const p of bodies) {
      if (p.status !== STATUS_ALIVE) continue;
      if (p.carry < CORE_MAX_CARRY) {
        for (let i = this.cores.length - 1; i >= 0 && p.carry < CORE_MAX_CARRY; i--) {
          const c = this.cores[i]!;
          if (Math.hypot(c.x - p.x, c.z - p.z) > CORE_PICK_RANGE || Math.abs(c.y - (p.y + 0.7)) > 1.4) continue;
          this.cores.splice(i, 1);
          p.carry++;
          this.events.push({ k: 'core', p: p.id, a: 'pick', n: 1, pts: p.score });
        }
      }
      if (p.carry > 0 && p.grounded && Math.hypot(p.x - zone[0], p.z - zone[1]) < e.zoneRadius) {
        const pts = p.carry + (p.carry === CORE_MAX_CARRY ? 1 : 0);
        p.score += pts;
        p.coresTotal += p.carry;
        this.events.push({ k: 'core', p: p.id, a: 'deliver', n: p.carry, pts: p.score });
        p.carry = 0;
      }
    }
  }

  private dropCores(p: Player, n: number, dirX: number, dirZ: number, fell = false): void {
    if (n <= 0) return;
    p.carry -= n;
    for (let i = 0; i < n; i++) {
      if (fell) {
        // Cayó al vacío: los núcleos quedan en el último suelo que pisó.
        this.cores.push({ id: this.nextCoreId++, x: p.lastGX + (Math.random() - 0.5), y: p.lastGY + 0.6, z: p.lastGZ + (Math.random() - 0.5), vx: 0, vy: 0, vz: 0, landed: true });
      } else {
        const a = Math.atan2(dirZ, dirX) + (Math.random() - 0.5) * 1.6;
        const sp = 4 + Math.random() * 3;
        this.cores.push({ id: this.nextCoreId++, x: p.x, y: p.y + 1.2, z: p.z, vx: Math.cos(a) * sp, vy: 7, vz: Math.sin(a) * sp, landed: false });
      }
    }
    this.events.push({ k: 'core', p: p.id, a: 'drop', n, pts: p.score });
  }

  // ------------------------------------------------------------ Baldosas

  private updateTiles(bodies: Player[]): void {
    const map = this.map;
    const rules = map.tileRules!;
    const chars = this.tiles.split('');
    let changed = false;
    for (const p of bodies) {
      if (!p.grounded || p.ground < 0 || p.ground >= 1000) continue;
      const box = map.boxes[p.ground];
      if (box?.kind !== 'tile' || box.tile === undefined) continue;
      const i = box.tile;
      this.tileStand[i]! += DT;
      if (chars[i] === TILE_SOLID && this.tileStand[i]! >= rules.standTime) {
        chars[i] = TILE_SHAKE;
        this.tileShake[i] = this.t;
        changed = true;
      }
    }
    // Derrumbe progresivo del borde.
    const due = Math.floor(this.t / rules.ringCollapseEvery);
    while (this.ringCollapses < due) {
      const c = this.ringCollapses++;
      let base = 0;
      R4_GRID.layers.forEach((layer, li) => {
        const half = (layer.n - 1) / 2;
        const ring = half - (li === 0 ? c : c - 2);
        if (ring >= 1 && ring <= half) {
          for (let i = 0; i < layer.n; i++) {
            for (let j = 0; j < layer.n; j++) {
              if (Math.max(Math.abs(i - half), Math.abs(j - half)) !== ring) continue;
              const idx = base + i * layer.n + j;
              if (chars[idx] === TILE_SOLID) {
                chars[idx] = TILE_SHAKE;
                this.tileShake[idx] = this.t;
                changed = true;
              }
            }
          }
        }
        base += layer.n * layer.n;
      });
      this.pushMsg('¡El borde se derrumba!');
    }
    for (let i = 0; i < chars.length; i++) {
      if (chars[i] === TILE_SHAKE && this.t - this.tileShake[i]! >= rules.shakeTime) {
        chars[i] = TILE_GONE;
        changed = true;
      }
    }
    if (changed) {
      this.tiles = chars.join('');
      this.tilesDirty = true;
    }
  }

  // ------------------------------------------------------- Caídas y meta

  private checkFall(p: Player): void {
    const map = this.map;
    if (p.y >= map.killY) {
      if (map.mode === 'race' && p.grounded) {
        p.best = Math.max(p.best, p.z);
        if (p.status === STATUS_ALIVE && map.goalZ !== undefined && p.z >= map.goalZ) {
          p.status = STATUS_QUALIFIED;
          p.invuln = 999;
          p.finishedAt = this.t;
          p.finishPlace = ++this.finishers;
          this.events.push({ k: 'qual', p: p.id, place: p.finishPlace });
          this.pushMsg(`${p.name} cruza la meta en ${p.finishPlace}º lugar`);
        }
      }
      return;
    }
    if (p.status === STATUS_QUALIFIED) {
      const g = map.boxes.find((b) => b.kind === 'goal')!;
      Object.assign(p, newPhysState(g.x, g.y + g.h / 2 + 0.1, g.z));
      return;
    }
    this.eliminate(p, map.theme.ground === 'lava' ? 'lava' : 'void', false);
  }

  private eliminate(p: Player, reason: 'void' | 'lava' | 'left', forceOut: boolean): void {
    let by = -1;
    if (p.lastHitBy >= 0 && this.t - p.lastHitAt < KO_CREDIT_WINDOW && reason !== 'left') {
      const k = this.players.get(p.lastHitBy);
      if (k && k !== p) { by = k.id; k.kos++; k.kosRound++; }
    }
    if (p.carry > 0) this.dropCores(p, p.carry, 0, 0, true);
    p.lives = forceOut ? 0 : p.lives - 1;
    p.weapon = 'fists';
    p.uses = Infinity;
    p.atk = -1;
    p.shield = 0;
    p.lastHitBy = -1;
    const final = p.lives <= 0;
    if (final) {
      p.status = STATUS_OUT;
      p.outRound = this.round + 1;
      p.outTime = this.clock;
    } else {
      p.status = STATUS_RESPAWNING;
      p.respawnAt = this.t + RESPAWN_DELAY;
    }
    this.events.push({ k: 'out', v: p.id, by, lifeLost: !final, final, reason });
  }

  private respawn(p: Player): void {
    const map = this.map;
    let sp: [number, number, number] | null = null;
    const order = [...map.spawns].sort(() => Math.random() - 0.5);
    for (const s of order) {
      const g = groundHeightAt(this.solids, s[0], s[2], s[1] + 1, 0.3);
      if (g > s[1] - 1) { sp = s; break; }
    }
    const s = sp ?? map.spawns[0]!;
    Object.assign(p, newPhysState(s[0], s[1] + 0.5, s[2]));
    p.status = STATUS_ALIVE;
    p.invuln = SPAWN_INVULNERABILITY;
    p.damage = Math.max(0, p.damage * 0.5);
    this.events.push({ k: 'respawn', p: p.id });
  }

  // ------------------------------------------------- Clasificación

  /** Orden provisional de la ronda según su objetivo (el mismo que decide las plazas). */
  private ranked(): Player[] {
    const mode = this.map.mode;
    const ps = this.roundPlayers();
    const alive = (p: Player) => (p.inPlay ? 1 : 0);
    const combat = (p: Player) => p.kosRound * 100 + p.dmgRound;
    return ps.sort((a, b) => {
      switch (mode) {
        case 'race':
          return (a.finishedAt - b.finishedAt) || (alive(b) - alive(a)) || (b.best - a.best);
        case 'energy':
          return (b.score - a.score) || (alive(b) - alive(a)) || (b.lives - a.lives) || (b.kosRound - a.kosRound);
        case 'brawl':
          return (alive(b) - alive(a)) || (alive(a) ? combat(b) - combat(a) : b.outTime - a.outTime) || (a.damage - b.damage);
        default:
          return (alive(b) - alive(a)) || (alive(a) ? a.damage - b.damage : b.outTime - a.outTime) || (b.kosRound - a.kosRound);
      }
    });
  }

  private updateRanks(): void {
    this.ranked().forEach((p, i) => { p.rank = i + 1; });
  }

  private checkRoundEnd(): void {
    const map = this.map;
    const parts = this.roundPlayers();
    const alive = parts.filter((p) => p.inPlay);
    const timeUp = this.t >= map.timeLimit;
    switch (map.mode) {
      case 'race': {
        const racing = alive.filter((p) => p.status !== STATUS_QUALIFIED);
        if (this.finishers >= this.slots) return this.finishRound('¡Plazas cubiertas en la meta!');
        if (racing.length === 0) return this.finishRound(this.finishers ? 'Todos han terminado la carrera' : 'Nadie sigue en carrera');
        if (timeUp) return this.finishRound('¡Se acabó el tiempo!');
        return;
      }
      case 'brawl':
      case 'survival':
        if (alive.length <= this.slots) return this.finishRound(alive.length ? 'Solo quedan los clasificados' : 'Todos han caído');
        if (timeUp) return this.finishRound('¡Se acabó el tiempo!');
        return;
      case 'energy':
        if (alive.length === 0) return this.finishRound('Todos han caído');
        if (timeUp) return this.finishRound('¡Se acabó el tiempo!');
        return;
      case 'final':
        if (alive.length <= 1) return this.finishFinal(alive.length ? 'Último en pie en la Gran Final' : '');
        if (this.t >= map.timeLimit + (map.suddenDeath ?? 0)) return this.finishFinal('timeout');
        return;
    }
  }

  private detail(p: Player): string {
    const mode = this.map.mode;
    const alive = p.inPlay;
    switch (mode) {
      case 'race':
        if (p.finishedAt < Infinity) return `Meta en ${p.finishPlace}º lugar (${p.finishedAt.toFixed(1)} s)`;
        return `${alive ? 'Llegó' : 'Cayó'} a los ${Math.max(0, Math.round(p.best))} m`;
      case 'energy':
        return `${p.score} puntos${alive ? '' : ' · sin vidas'}`;
      case 'brawl':
        return `${alive ? 'Sobrevivió' : 'Cayó'} · ${p.kosRound} KO · ${Math.round(p.dmgRound)} de daño hecho`;
      default:
        return alive ? `Sobrevivió con ${Math.round(p.damage)}% de daño` : 'Cayó a la lava';
    }
  }

  private finishRound(reason: string): void {
    const map = this.map;
    const order = this.ranked();
    const eligible = (p: Player) => {
      switch (map.mode) {
        case 'race': return p.inPlay;
        case 'energy': return true;
        default: return p.inPlay;
      }
    };
    const qualified = new Set<Player>();
    // Supervivencia: pasan todos los que siguen vivos; resto de modos: hasta llenar plazas.
    const cap = map.mode === 'survival' ? order.length : this.slots;
    for (const p of order) if (qualified.size < cap && eligible(p)) qualified.add(p);
    // Repesca: siempre deben seguir al menos 2 (si hay 2 en la ronda).
    const minNext = Math.min(2, order.length);
    for (const p of order) {
      if (qualified.size >= minNext) break;
      if (!qualified.has(p)) { qualified.add(p); p.repesca = true; }
    }
    const standings: Standing[] = order.map((p, i) => ({
      id: p.id, name: p.name, bot: p.bot, status: qualified.has(p) ? STATUS_ALIVE : STATUS_OUT, kos: p.kos,
      damage: Math.round(p.damage), outRound: qualified.has(p) ? 0 : this.round + 1, place: i + 1,
      qualified: qualified.has(p), detail: this.detail(p) + (p.repesca ? ' · repesca' : ''),
      ...(p.look.title ? { title: p.look.title } : {}),
    }));
    for (const p of order) {
      if (qualified.has(p)) {
        p.status = STATUS_ALIVE;
        p.outRound = 0;
        p.roundsCleared++;
      } else {
        if (p.status !== STATUS_OUT) p.outTime = this.clock;
        p.status = STATUS_OUT;
        p.outRound = this.round + 1;
      }
      p.carry = 0;
    }
    const res: RoundResult = {
      type: 'roundEnd', round: this.round + 1, name: map.name, reason, standings,
      next: `Siguiente: ronda ${this.round + 2} — ${MAPS[this.round + 1]!.name}`,
    };
    this.lastResult = res;
    this.broadcast(res);
    this.phase = 'roundEnd';
    this.phaseTimer = ROUND_END_TIME;
    this.roomDirty = true;
  }

  private finishFinal(reason: string): void {
    const parts = this.roundPlayers();
    const alive = parts.filter((p) => p.inPlay);
    let winner: Player;
    let why: string;
    if (alive.length === 1) {
      winner = alive[0]!;
      why = reason;
    } else if (alive.length > 1) {
      alive.sort((a, b) => a.damage - b.damage || b.kosRound - a.kosRound || b.dmgRound - a.dmgRound);
      winner = alive[0]!;
      why = 'Fin de la muerte súbita: gana el superviviente con menos daño recibido';
    } else {
      // Caída simultánea: desempatan los últimos en caer (menos daño, luego más KO).
      const lastTime = Math.max(...parts.map((p) => p.outTime));
      const last = parts.filter((p) => lastTime - p.outTime < 0.5);
      last.sort((a, b) => a.damage - b.damage || b.kosRound - a.kosRound);
      winner = last[0]!;
      why = 'Cayeron a la vez: gana el último en caer con menos daño';
    }
    for (const p of parts) {
      if (p !== winner && p.status !== STATUS_OUT) {
        p.status = STATUS_OUT;
        p.outRound = this.round + 1;
        p.outTime = this.clock;
      }
    }
    winner.status = STATUS_ALIVE;
    winner.outRound = 0;
    winner.roundsCleared++;
    winner.wins++;
    const standings = this.matchStandings(winner.id);
    const res: FinalResult = {
      type: 'final', winnerId: winner.id, winnerName: winner.name, winnerFx: winner.look.fx ?? 'fx:confetti',
      reason: why, standings,
    };
    this.lastResult = res;
    this.broadcast(res);
    this.phase = 'final';
    this.phaseTimer = FINAL_TIME;
    this.roomDirty = true;
    const entries: MatchEndEntry[] = [];
    for (const s of standings) {
      const p = this.players.get(s.id);
      if (!p || p.bot) continue;
      entries.push({
        player: p,
        result: { place: s.place, players: standings.length, roundsCleared: p.roundsCleared, kos: p.kos, cores: p.coresTotal, won: p === winner },
      });
    }
    this.onMatchEnd?.(entries);
  }

  private matchStandings(winnerId: number): Standing[] {
    const parts = [...this.players.values()].filter((p) => p.participant);
    parts.sort((a, b) => {
      if (a.id === winnerId) return -1;
      if (b.id === winnerId) return 1;
      const ar = a.outRound === 0 ? 99 : a.outRound;
      const br = b.outRound === 0 ? 99 : b.outRound;
      return br - ar || b.outTime - a.outTime || b.kos - a.kos;
    });
    return parts.map((p, i) => ({
      id: p.id, name: p.name, bot: p.bot, status: p.status, kos: p.kos, damage: Math.round(p.damage),
      outRound: p.outRound, place: i + 1, qualified: p.id === winnerId,
      detail: p.id === winnerId ? `Campeón · ${p.kos} KO` : `Eliminado en la ronda ${p.outRound} · ${p.kos} KO`,
      ...(p.look.title ? { title: p.look.title } : {}),
    }));
  }

  // ------------------------------------------------------------- Red

  private pushMsg(text: string): void {
    this.events.push({ k: 'msg', text });
  }

  broadcast(msg: ServerMsg): void {
    const s = JSON.stringify(msg);
    for (const p of this.players.values()) p.conn?.send(s);
  }

  roomInfo(): RoomInfo {
    return {
      type: 'room', code: this.code, isPublic: this.isPublic, hostId: this.hostId, phase: this.phase,
      round: this.round, phaseEndsIn: Math.max(0, this.phaseTimer), minPlayers: 2,
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, look: p.look, bot: p.bot, spectator: !p.participant, wins: p.wins,
      })),
    };
  }

  markDirty(): void {
    this.roomDirty = true;
  }

  sendState(): void {
    if (this.roomDirty || this.tickCount % 30 === 0) {
      this.roomDirty = false;
      this.broadcast(this.roomInfo());
    }
    const inMatch = this.isMatchRunning() || this.phase === 'final';
    const parts = this.roundPlayers();
    const base: Snapshot = {
      type: 's', t: Math.round(this.t * 1000) / 1000, phase: this.phase, round: this.round,
      timeLeft: this.phase === 'playing' ? Math.max(0, this.map.timeLimit - this.t) : this.phaseTimer,
      ack: 0,
      p: inMatch ? [...this.players.values()].filter((p) => p.participant).map((p) => encodePlayer(p)) : [],
      w: this.weapons.map((w) => [w.id, PICKUP_CODES.indexOf(w.type), round2(w.x), round2(w.y), round2(w.z), w.landed ? 1 : 0]),
      slots: this.slots,
      secured: this.map.mode === 'race' ? this.finishers : parts.filter((p) => p.inPlay).length,
    };
    if (this.cores.length || this.map.energy) base.c = this.cores.map((c): NetCore => [c.id, round2(c.x), round2(c.y), round2(c.z)]);
    if (this.sudden) base.sudden = true;
    if (this.tilesDirty || (this.tiles && this.tickCount % 30 === 0)) {
      base.tiles = this.tiles;
      this.tilesDirty = false;
    }
    if (this.events.length) base.e = this.events;
    this.events = [];
    for (const p of this.players.values()) {
      if (!p.conn) continue;
      base.ack = p.ack;
      p.conn.send(JSON.stringify(base));
    }
  }
}

function clampUnit(v: number): number {
  return Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

