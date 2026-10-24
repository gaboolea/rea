// Mensajes intercambiados por WebSocket (JSON). Las instantáneas de jugadores
// se codifican como arrays para reducir el tamaño de cada paquete.
import type { Look, WeaponType } from './constants.ts';
import type { PhysState } from './physics.ts';

export const INPUT_JUMP = 1;
export const INPUT_RUN = 2;
export const INPUT_BLOCK = 4;
export const INPUT_ATTACK = 8;
export const INPUT_INTERACT = 16;

export type ClientMsg =
  | { type: 'hello'; v: number; name: string; look: Look }
  | { type: 'profile'; name: string; look: Look }
  | { type: 'quick' }
  | { type: 'create' }
  | { type: 'join'; code: string }
  | { type: 'leave' }
  | { type: 'start' }
  | { type: 'bots'; n: number }
  | { type: 'in'; s: number; mx: number; mz: number; yaw: number; b: number }
  | { type: 'ping'; t: number };

export type RoomPhase = 'lobby' | 'countdown' | 'intro' | 'playing' | 'roundEnd' | 'final';

export const STATUS_ALIVE = 0;
export const STATUS_RESPAWNING = 1;
export const STATUS_OUT = 2;
export const STATUS_QUALIFIED = 3;
export const STATUS_SPECTATOR = 4;

export const WEAPON_CODES: WeaponType[] = ['fists', 'sword', 'hammer', 'quake'];

export interface RoomPlayerInfo {
  id: number;
  name: string;
  look: Look;
  bot: boolean;
  spectator: boolean;
  wins: number;
}

export interface Standing {
  id: number;
  name: string;
  bot: boolean;
  status: number;
  kos: number;
  damage: number;
  /** Ronda en la que quedó eliminado (0 = sigue vivo). */
  outRound: number;
  place: number;
}

export interface RoomInfo {
  type: 'room';
  code: string;
  isPublic: boolean;
  hostId: number;
  phase: RoomPhase;
  round: number;
  phaseEndsIn: number;
  players: RoomPlayerInfo[];
  minPlayers: number;
}

export interface NetPlayer extends PhysState {
  id: number;
  yaw: number;
  status: number;
  damage: number;
  lives: number;
  weapon: WeaponType;
  uses: number;
  /** Segundos desde el inicio del ataque en curso, o -1. */
  atk: number;
  atkW: WeaponType;
  blocking: boolean;
  invuln: number;
  kos: number;
}

export function encodePlayer(p: NetPlayer): number[] {
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return [
    p.id, r(p.x), r(p.y), r(p.z), r(p.vx), r(p.vy), r(p.vz),
    (p.grounded ? 1 : 0) | (p.jumpHeld ? 2 : 0) | (p.blocking ? 4 : 0),
    p.ground, r(p.stun), r(p.coyote), r(p.barCd), r(p.yaw),
    p.status, Math.round(p.damage), p.lives, WEAPON_CODES.indexOf(p.weapon),
    Number.isFinite(p.uses) ? p.uses : -1,
    r(p.atk), WEAPON_CODES.indexOf(p.atkW), r(p.invuln), p.kos,
  ];
}

export function decodePlayer(a: number[]): NetPlayer {
  const flags = a[7] ?? 0;
  const uses = a[17] ?? -1;
  return {
    id: a[0]!, x: a[1]!, y: a[2]!, z: a[3]!, vx: a[4]!, vy: a[5]!, vz: a[6]!,
    grounded: (flags & 1) !== 0, jumpHeld: (flags & 2) !== 0, blocking: (flags & 4) !== 0,
    ground: a[8]!, stun: a[9]!, coyote: a[10]!, barCd: a[11]!, yaw: a[12]!,
    status: a[13]!, damage: a[14]!, lives: a[15]!, weapon: WEAPON_CODES[a[16]!] ?? 'fists',
    uses: uses < 0 ? Infinity : uses,
    atk: a[18]!, atkW: WEAPON_CODES[a[19]!] ?? 'fists', invuln: a[20]!, kos: a[21]!,
  };
}

export interface NetWeapon {
  id: number;
  type: WeaponType;
  x: number; y: number; z: number;
  landed: boolean;
}

export type GameEvent =
  | { k: 'hit'; a: number; v: number; x: number; y: number; z: number; w: WeaponType; blocked: boolean; power: number }
  | { k: 'swing'; p: number; w: WeaponType }
  | { k: 'out'; v: number; by: number; lifeLost: boolean; final: boolean; reason: 'void' | 'lava' | 'left' }
  | { k: 'pick'; p: number; w: WeaponType }
  | { k: 'break'; p: number; w: WeaponType }
  | { k: 'wspawn'; w: WeaponType; x: number; z: number }
  | { k: 'qual'; p: number }
  | { k: 'respawn'; p: number }
  | { k: 'bar'; p: number }
  | { k: 'msg'; text: string };

export interface Snapshot {
  type: 's';
  /** Tiempo de ronda (segundos). */
  t: number;
  phase: RoomPhase;
  round: number;
  timeLeft: number;
  ack: number;
  p: number[][];
  w: [number, number, number, number, number, number][];
  tiles?: string;
  e?: GameEvent[];
}

export interface RoundResult {
  type: 'roundEnd';
  round: number;
  reason: string;
  standings: Standing[];
  next: string;
}

export interface FinalResult {
  type: 'final';
  winnerId: number;
  winnerName: string;
  reason: string;
  standings: Standing[];
}

export type ServerMsg =
  | { type: 'welcome'; id: number; v: number }
  | { type: 'error'; msg: string }
  | { type: 'left' }
  | { type: 'pong'; t: number }
  | RoomInfo
  | Snapshot
  | RoundResult
  | FinalResult;
