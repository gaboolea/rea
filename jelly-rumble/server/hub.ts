// Registro de salas y despacho de mensajes de cada conexión. No depende de
// Node: lo usa el servidor WebSocket y también el modo sin conexión del
// navegador, que ejecuta la misma lógica autoritativa en local.
import { DT, PROTOCOL_VERSION, sanitizeLook, sanitizeName } from '../shared/constants.ts';
import { levelFromXp } from '../shared/cosmetics.ts';
import type { ClientMsg } from '../shared/protocol.ts';
import { type ProfileRecord, type ProfileStore, MemoryProfileStore, applyMatch, buy, newRecord, sanitizeToken, toPublic } from './profiles.ts';
import { type Conn, type MatchEndEntry, Player, Room, allocId } from './room.ts';

export interface Session {
  receive(raw: unknown): void;
  close(): void;
}

export class Hub {
  rooms = new Map<string, Room>();
  private last = 0;
  private acc = 0;

  constructor(private store: ProfileStore = new MemoryProfileStore()) {}

  playerCount(): number {
    return [...this.rooms.values()].reduce((n, r) => n + r.humans().length, 0);
  }

  private makeCode(): string {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let c = '';
    do {
      c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('');
    } while (this.rooms.has(c));
    return c;
  }

  private record(p: Player): ProfileRecord {
    return (p.token && this.store.load(p.token)) || newRecord();
  }

  private sendProfile(p: Player, rec = this.record(p)): void {
    p.conn?.send({ type: 'profile', profile: toPublic(rec, this.store.kind) });
  }

  /** Reparte recompensas al acabar un torneo y las guarda en el almacén. */
  private rewardMatch(entries: MatchEndEntry[]): void {
    for (const { player, result } of entries) {
      if (!player.token) continue;
      const rec = this.record(player);
      const before = levelFromXp(rec.xp);
      const reward = applyMatch(rec, result);
      this.store.save(player.token, rec);
      player.conn?.send({ type: 'reward', reward, levelBefore: before, levelAfter: levelFromXp(rec.xp), profile: toPublic(rec, this.store.kind) });
    }
  }

  private newRoom(isPublic: boolean): Room {
    const r = new Room(this.makeCode(), isPublic);
    r.onMatchEnd = (entries) => this.rewardMatch(entries);
    this.rooms.set(r.code, r);
    return r;
  }

  connect(conn: Conn): Session {
    let player: Player | null = null;
    let room: Room | null = null;
    const fail = (msg: string) => conn.send({ type: 'error', msg });

    const leaveRoom = () => {
      if (room && player) {
        room.removePlayer(player.id);
        if (room.isEmpty()) this.rooms.delete(room.code);
      }
      room = null;
    };
    const enter = (r: Room) => {
      if (!player) return;
      leaveRoom();
      room = r;
      r.addHuman(player);
      conn.send(r.roomInfo());
    };
    const owns = (id: string) => !!player?.owned.has(id);

    const receive = (raw: unknown) => {
      const msg = raw as ClientMsg;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'hello') {
        if (msg.v !== PROTOCOL_VERSION) return fail('Versión del cliente incompatible: recarga la página');
        player = new Player(allocId(), sanitizeName(msg.name), sanitizeLook(null), conn);
        player.token = sanitizeToken(msg.token);
        const rec = this.record(player);
        player.owned = new Set(rec.owned);
        player.look = sanitizeLook(msg.look, owns);
        conn.send({ type: 'welcome', id: player.id, v: PROTOCOL_VERSION });
        this.sendProfile(player, rec);
        return;
      }
      if (!player) return;
      switch (msg.type) {
        case 'profile':
          player.name = sanitizeName(msg.name);
          player.look = sanitizeLook(msg.look, owns);
          room?.markDirty();
          break;
        case 'buy': {
          if (!player.token) return fail('Este navegador no tiene perfil: recarga la página');
          const rec = this.record(player);
          const err = buy(rec, String(msg.item));
          if (err) return fail(err);
          this.store.save(player.token, rec);
          player.owned = new Set(rec.owned);
          this.sendProfile(player, rec);
          break;
        }
        case 'emote':
          room?.emote(player.id, String(msg.e));
          break;
        case 'quick': {
          const open = [...this.rooms.values()].find((r) => r.isPublic && (r.phase === 'lobby' || r.phase === 'countdown') && r.canJoin());
          enter(open ?? this.newRoom(true));
          break;
        }
        case 'create':
          enter(this.newRoom(false));
          break;
        case 'join': {
          const code = String(msg.code ?? '').toUpperCase().trim();
          const r = this.rooms.get(code);
          if (!r) return fail(`No existe ninguna sala con el código ${code}`);
          if (!r.canJoin()) return fail('La sala está llena');
          enter(r);
          break;
        }
        case 'leave':
          leaveRoom();
          conn.send({ type: 'left' });
          break;
        case 'start': {
          const err = room?.requestStart(player.id);
          if (err) fail(err);
          break;
        }
        case 'bots': {
          const err = room?.setBots(player.id, Number(msg.n));
          if (err) fail(err);
          break;
        }
        case 'in':
          room?.queueInput(player.id, { s: Number(msg.s), mx: Number(msg.mx), mz: Number(msg.mz), yaw: Number(msg.yaw), b: Number(msg.b) | 0 });
          break;
        case 'ping':
          conn.send({ type: 'pong', t: Number(msg.t) });
          break;
      }
    };
    return { receive, close: leaveRoom };
  }

  /** Avanza la simulación a tasa fija; llamar con frecuencia (p. ej. 120 Hz). */
  pump(nowMs: number): void {
    if (this.last === 0) this.last = nowMs;
    this.acc += (nowMs - this.last) / 1000;
    this.last = nowMs;
    let steps = 0;
    while (this.acc >= DT && steps < 5) {
      this.acc -= DT;
      steps++;
      for (const r of this.rooms.values()) r.tick();
    }
    if (steps === 5) this.acc = 0;
    if (steps > 0) for (const r of this.rooms.values()) r.sendState();
  }
}
