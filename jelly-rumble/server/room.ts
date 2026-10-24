// Sala de juego autoritativa: simula a todos los jugadores con la física
// compartida, valida ataques y recogidas, gestiona rondas, eliminaciones y la
// elección del ganador. Los clientes solo envían entradas.
import {
  DT, KO_CREDIT_WINDOW, MAX_DAMAGE, MAX_PLAYERS, PALETTE, PICKUP_RANGE, PLAYER_RADIUS, RESPAWN_DELAY,
  SPAWN_INVULNERABILITY, WEAPONS, WEAPON_GROUND_LIFETIME, ACCESSORIES, EYES,
  type Look, type WeaponType, knockbackScale,
} from '../shared/constants.ts';
import { MAPS, R4_GRID, ROUND_COUNT, TILE_GONE, TILE_SHAKE, TILE_SOLID, type MapDef } from '../shared/maps.ts';
import { type PhysState, type Solid, buildSolids, groundHeightAt, newPhysState, separatePlayers, stepPlayer } from '../shared/physics.ts';
import {
  type FinalResult, type GameEvent, INPUT_ATTACK, INPUT_BLOCK, INPUT_INTERACT, INPUT_JUMP, INPUT_RUN,
  type NetPlayer, type RoomInfo, type RoomPhase, type RoundResult, STATUS_ALIVE, STATUS_OUT,
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
  queue: QueuedInput[] = [];
  last: QueuedInput = { s: 0, mx: 0, mz: 0, yaw: 0, b: 0 };
  ack = 0;
  prevInteract = false;
  lastHitBy = -1;
  lastHitAt = -100;
  respawnAt = 0;
  checkpoint = 0;
  outRound = 0;
  outTime = 0;
  totalDamageDealt = 0;
  participant = false;
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

interface Weapon { id: number; type: WeaponType; x: number; y: number; z: number; landed: boolean; landedAt: number }

const PUBLIC_COUNTDOWN = 15;
const START_COUNTDOWN = 4;
const INTRO_TIME = 4;
const ROUND_END_TIME = 7;
const FINAL_TIME = 14;
/** Fracción máxima de jugadores (por encima de 2) eliminable en las rondas 1-4. */
const ROUND_CUT = [0.35, 0.4, 0.45, 0.6];

export class Room {
  players = new Map<number, Player>();
  hostId = -1;
  phase: RoomPhase = 'lobby';
  phaseTimer = 0;
  round = 0;
  t = 0;
  clock = 0;
  weapons: Weapon[] = [];
  private nextWeaponId = 1;
  private nextWeaponAt = 0;
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
  /** Eliminaciones permitidas en esta ronda (rondas 1-4) y las ya ocurridas. */
  roundCap = 0;
  private roundOuts = 0;
  private pendingEnd: string | null = null;

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

  // ------------------------------------------------------------- Miembros

  addHuman(p: Player): void {
    this.players.set(p.id, p);
    p.status = STATUS_SPECTATOR;
    p.participant = false;
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
    if (p.participant && p.inPlay && this.isMatchRunning()) {
      this.eliminate(p, 'left', true);
    }
    this.players.delete(id);
    if (this.hostId === id) {
      this.hostId = this.humans()[0]?.id ?? -1;
    }
    if (this.phase === 'countdown' && this.isPublic && this.participantsReady() < 2) {
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
        accessory: ACCESSORIES[(i * 3 + 1) % ACCESSORIES.length]!,
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

  private participantsReady(): number {
    return this.players.size;
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
    this.nextWeaponAt = 2.5;
    const map = this.map;
    this.tiles = map.tileCount ? TILE_SOLID.repeat(map.tileCount) : '';
    this.tileStand = new Float32Array(map.tileCount ?? 0);
    this.tileShake = new Float32Array(map.tileCount ?? 0);
    this.ringCollapses = 0;
    this.tilesDirty = true;
    this.solids = buildSolids(map, 0, this.tiles);
    const alive = [...this.players.values()].filter((p) => p.participant && p.status !== STATUS_OUT && p.status !== STATUS_SPECTATOR);
    // Cupo: nunca se elimina a tanta gente como para que no lleguen 2 a la final.
    this.roundCap = r >= ROUND_COUNT - 1 ? Infinity : Math.floor(Math.max(0, alive.length - 2) * ROUND_CUT[r]!);
    this.roundOuts = 0;
    this.pendingEnd = null;
    alive.forEach((p, i) => {
      const sp = map.spawns[i % map.spawns.length]!;
      Object.assign(p, newPhysState(sp[0], sp[1], sp[2]));
      p.yaw = Math.atan2(-sp[0], -sp[2]);
      p.status = STATUS_ALIVE;
      p.lives = map.lives;
      p.damage = 0;
      p.weapon = 'fists';
      p.uses = Infinity;
      p.atk = -1;
      p.atkCd = 0;
      p.invuln = 0;
      p.checkpoint = 0;
      p.lastHitBy = -1;
      p.queue.length = 0;
    });
    this.pushMsg(`RONDA ${r + 1}/${ROUND_COUNT}: ${map.name}`);
    this.roomDirty = true;
  }

  private backToLobby(): void {
    this.phase = 'lobby';
    this.round = 0;
    this.t = 0;
    this.weapons = [];
    for (const p of this.players.values()) {
      p.status = STATUS_SPECTATOR;
      p.participant = false;
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
        weapon: p.weapon, atk: p.atk, grounded: p.grounded, invuln: p.invuln,
      }));
      const world = { map, t: this.t, solids: this.solids, players: views, weapons: this.weapons };
      for (const p of actors) {
        if (p.brain && p.inPlay) {
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
      if (!p.participant || p.status === STATUS_OUT || p.status === STATUS_SPECTATOR) continue;
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
        mx, mz, jump: (b & INPUT_JUMP) !== 0, run: (b & INPUT_RUN) !== 0, block: p.blocking,
      }, map, this.solids, this.t, DT);
      if (ev.barHit) this.events.push({ k: 'bar', p: p.id });
      if (p.atk < 0 && (mx !== 0 || mz !== 0) && p.stun <= 0) p.yaw = Math.atan2(mx, mz);
      p.invuln = Math.max(0, p.invuln - DT);
      p.atkCd = Math.max(0, p.atkCd - DT);

      if (!live) continue;
      const interact = (b & INPUT_INTERACT) !== 0;
      if (interact && !p.prevInteract) this.tryPickup(p);
      p.prevInteract = interact;
      if ((b & INPUT_ATTACK) !== 0 && p.atk < 0 && p.atkCd <= 0 && p.stun <= 0 && p.status === STATUS_ALIVE) {
        this.startAttack(p, yaw);
      }
    }

    // Colisiones entre cuerpos.
    const bodies = actors.filter((p) => p.participant && (p.status === STATUS_ALIVE || p.status === STATUS_QUALIFIED));
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) separatePlayers(bodies[i]!, bodies[j]!);
    }

    if (!live) return;
    for (const p of bodies) this.updateAttack(p, bodies);
    this.updateWeapons();
    if (map.tileCount) this.updateTiles(bodies);
    for (const p of bodies) this.checkFall(p);
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
        this.events.push({ k: 'break', p: p.id, w: p.weapon });
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
      const scale = knockbackScale(o.damage);
      let kb = st.knockback * scale;
      let lift = st.lift * (0.75 + 0.25 * scale);
      let dmg = st.damage;
      let stun = st.stun;
      // Bloqueo: solo funciona mirando hacia el atacante.
      const ofx = Math.sin(o.yaw);
      const ofz = Math.cos(o.yaw);
      const blocked = o.blocking && (ofx * -nx + ofz * -nz) > 0.2;
      if (blocked) {
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
      this.events.push({ k: 'hit', a: p.id, v: o.id, x: o.x, y: o.y + 0.8, z: o.z, w: p.atkW, blocked, power: kb });
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
    p.weapon = best.type;
    p.uses = WEAPONS[best.type].uses;
    p.atk = -1;
    this.events.push({ k: 'pick', p: p.id, w: best.type });
  }

  private updateWeapons(): void {
    const map = this.map;
    if (this.t >= this.nextWeaponAt) {
      this.nextWeaponAt = this.t + map.weaponInterval * (0.8 + Math.random() * 0.4);
      if (this.weapons.length < map.maxWeapons) this.spawnWeapon();
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

  private spawnWeapon(): void {
    const map = this.map;
    const pool = Object.entries(map.weaponPool) as [WeaponType, number][];
    const total = pool.reduce((s, [, n]) => s + n, 0);
    let r = Math.random() * total;
    let type: WeaponType = 'sword';
    for (const [k, n] of pool) {
      r -= n;
      if (r <= 0) { type = k; break; }
    }
    const spots = [...map.weaponSpots].sort(() => Math.random() - 0.5);
    for (const [x, z] of spots) {
      if (this.weapons.some((w) => Math.hypot(w.x - x, w.z - z) < 2)) continue;
      const g = groundHeightAt(this.solids, x, z, 50, 0.3);
      if (g < map.killY + 5 || (map.tileCount && g < -1)) continue;
      const jx = x + (Math.random() - 0.5) * 1.2;
      const jz = z + (Math.random() - 0.5) * 1.2;
      this.weapons.push({ id: this.nextWeaponId++, type, x: jx, y: g + 22, z: jz, landed: false, landedAt: 0 });
      this.events.push({ k: 'wspawn', w: type, x: jx, z: jz });
      return;
    }
  }

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

  private checkFall(p: Player): void {
    const map = this.map;
    if (p.y >= map.killY) {
      // Clasificación en la meta (ronda 2).
      if (map.goalZ !== undefined && p.status === STATUS_ALIVE && p.grounded && p.z >= map.goalZ) {
        p.status = STATUS_QUALIFIED;
        p.invuln = 999;
        this.events.push({ k: 'qual', p: p.id });
        this.pushMsg(`${p.name} ha llegado a la meta`);
      }
      if (map.checkpoints) {
        for (let i = map.checkpoints.length - 1; i > p.checkpoint; i--) {
          if (p.z >= map.checkpoints[i]!.z && p.grounded) { p.checkpoint = i; break; }
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
      if (k && k !== p) { by = k.id; k.kos++; }
    }
    p.lives = forceOut ? 0 : p.lives - 1;
    p.weapon = 'fists';
    p.uses = Infinity;
    p.atk = -1;
    p.lastHitBy = -1;
    let final = p.lives <= 0;
    if (final && reason !== 'left' && this.round < ROUND_COUNT - 1) {
      if (this.roundOuts < this.roundCap) {
        this.roundOuts++;
        if (this.roundOuts >= this.roundCap) this.pendingEnd = `Cupo de eliminados alcanzado (${this.roundCap})`;
      } else {
        // Sin cupo: la ronda termina y el jugador se salva para no dejar la final sin rivales.
        final = false;
        p.lives = 1;
        this.pendingEnd = `${p.name} perdió su última vida: fin de la ronda (se salva por la regla de finalistas)`;
      }
    }
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
    if (map.checkpoints) {
      sp = map.checkpoints[p.checkpoint]!.spawn;
    } else {
      const order = [...map.spawns].sort(() => Math.random() - 0.5);
      for (const s of order) {
        const g = groundHeightAt(this.solids, s[0], s[2], s[1] + 1, 0.3);
        if (g > s[1] - 1) { sp = s; break; }
      }
    }
    const s = sp ?? map.spawns[0]!;
    Object.assign(p, newPhysState(s[0], s[1] + 0.5, s[2]));
    p.status = STATUS_ALIVE;
    p.invuln = SPAWN_INVULNERABILITY;
    p.damage = Math.max(0, p.damage * 0.5);
    this.events.push({ k: 'respawn', p: p.id });
  }

  // --------------------------------------------------------- Fin de ronda

  private checkRoundEnd(): void {
    const map = this.map;
    const parts = [...this.players.values()].filter((p) => p.participant && p.status !== STATUS_SPECTATOR);
    const remaining = parts.filter((p) => p.inPlay);
    const timeUp = this.t >= map.timeLimit;
    if (this.pendingEnd) return this.endRound(this.pendingEnd);
    if (remaining.length === 0) return this.endRound('Todos han caído');
    if (remaining.length === 1 && parts.length > 1) return this.endRound('Solo queda uno en pie');
    if (map.goalZ !== undefined && remaining.every((p) => p.status === STATUS_QUALIFIED)) {
      return this.endRound('Todos los supervivientes han llegado a la meta');
    }
    if (timeUp) return this.endRound('¡Se acabó el tiempo!');
  }

  private endRound(reason: string): void {
    const parts = [...this.players.values()].filter((p) => p.participant && p.status !== STATUS_SPECTATOR);
    let survivors = parts.filter((p) => p.inPlay);
    if (survivors.length === 0) {
      // Nadie en pie: se salvan los últimos en caer en esta ronda.
      const thisRound = parts.filter((p) => p.outRound === this.round + 1);
      const lastTime = Math.max(...thisRound.map((p) => p.outTime));
      survivors = thisRound.filter((p) => lastTime - p.outTime < 0.5);
      for (const p of survivors) {
        p.status = STATUS_ALIVE;
        p.outRound = 0;
      }
      reason = `${reason}: se salvan los últimos en caer`;
    }
    for (const p of survivors) p.status = STATUS_ALIVE;

    const isLast = this.round >= ROUND_COUNT - 1;
    if (isLast || survivors.length <= 1) {
      let winner: Player;
      let why: string;
      if (survivors.length === 1) {
        winner = survivors[0]!;
        why = isLast ? 'Último en pie en la Gran Final' : `Único superviviente tras la ronda ${this.round + 1}`;
      } else {
        survivors.sort((a, b) => a.damage - b.damage || b.kos - a.kos || b.lives - a.lives || b.totalDamageDealt - a.totalDamageDealt);
        winner = survivors[0]!;
        why = 'Tiempo agotado: gana el superviviente con menos daño recibido';
        for (const p of survivors.slice(1)) {
          p.status = STATUS_OUT;
          p.outRound = this.round + 1;
          p.outTime = this.clock;
        }
      }
      winner.wins++;
      const res: FinalResult = {
        type: 'final', winnerId: winner.id, winnerName: winner.name, reason: why,
        standings: this.standings(winner.id),
      };
      this.lastResult = res;
      this.broadcast(res);
      this.phase = 'final';
      this.phaseTimer = FINAL_TIME;
      this.roomDirty = true;
      return;
    }
    const res: RoundResult = {
      type: 'roundEnd', round: this.round + 1, reason, standings: this.standings(-1),
      next: `Siguiente: ronda ${this.round + 2} — ${MAPS[this.round + 1]!.name}`,
    };
    this.lastResult = res;
    this.broadcast(res);
    this.phase = 'roundEnd';
    this.phaseTimer = ROUND_END_TIME;
    this.roomDirty = true;
  }

  private standings(winnerId: number): Standing[] {
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
      outRound: p.outRound, place: i + 1,
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
    const base: Snapshot = {
      type: 's', t: Math.round(this.t * 1000) / 1000, phase: this.phase, round: this.round,
      timeLeft: this.phase === 'playing' ? Math.max(0, this.map.timeLimit - this.t) : this.phaseTimer,
      ack: 0,
      p: inMatch ? [...this.players.values()].filter((p) => p.participant).map((p) => encodePlayer(p)) : [],
      w: this.weapons.map((w) => [w.id, ['fists', 'sword', 'hammer', 'quake'].indexOf(w.type), round2(w.x), round2(w.y), round2(w.z), w.landed ? 1 : 0]),
    };
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
