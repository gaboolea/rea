// Mensajes intercambiados por WebSocket (JSON). Las instantáneas de jugadores
// se codifican como arrays para reducir el tamaño de cada paquete.
import type { Look, PickupType, WeaponType } from './constants.ts';
import type { PublicProfile, Reward } from './cosmetics.ts';
import type { PhysState } from './physics.ts';

export const INPUT_JUMP = 1;
export const INPUT_RUN = 2;
export const INPUT_BLOCK = 4;
export const INPUT_ATTACK = 8;
export const INPUT_INTERACT = 16;
export const INPUT_EMOTE = 32;

export type ClientMsg =
  | { type: 'hello'; v: number; name: string; look: Look; token?: string }
  | { type: 'profile'; name: string; look: Look }
  | { type: 'quick' }
  | { type: 'create' }
  | { type: 'join'; code: string }
  | { type: 'leave' }
  | { type: 'start' }
  | { type: 'bots'; n: number }
  | { type: 'buy'; item: string }
  | { type: 'emote'; e: string }
  | { type: 'in'; s: number; mx: number; mz: number; yaw: number; b: number }
  | { type: 'ping'; t: number };

export type RoomPhase = 'lobby' | 'countdown' | 'intro' | 'playing' | 'roundEnd' | 'final';

export const STATUS_ALIVE = 0;
export const STATUS_RESPAWNING = 1;
export const STATUS_OUT = 2;
export const STATUS_QUALIFIED = 3;
export const STATUS_SPECTATOR = 4;

export const WEAPON_CODES: WeaponType[] = ['fists', 'sword', 'hammer', 'quake', 'gloves'];
export const PICKUP_CODES: PickupType[] = ['sword', 'hammer', 'quake', 'gloves', 'shield'];

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
  /** Se clasifica para la siguiente ronda. */
  qualified: boolean;
  /** Motivo legible de su puesto (meta, distancia, puntos, combate…). */
  detail: string;
  title?: string;
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
  /** Núcleos que lleva encima (ronda de energía). */
  carry: number;
  /** Puntos de la ronda (núcleos entregados). */
  score: number;
  /** Segundos de escudo temporal restantes. */
  shield: number;
  /** Puesto provisional en la ronda (1 = primero). */
  rank: number;
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
    p.carry, p.score, r(p.shield), p.rank,
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
    carry: a[22] ?? 0, score: a[23] ?? 0, shield: a[24] ?? 0, rank: a[25] ?? 0,
  };
}

export interface NetWeapon {
  id: number;
  type: PickupType;
  x: number; y: number; z: number;
  landed: boolean;
}

export type GameEvent =
  | { k: 'hit'; a: number; v: number; x: number; y: number; z: number; w: WeaponType; blocked: boolean; power: number }
  | { k: 'swing'; p: number; w: WeaponType }
  | { k: 'out'; v: number; by: number; lifeLost: boolean; final: boolean; reason: 'void' | 'lava' | 'left' }
  | { k: 'pick'; p: number; w: PickupType }
  | { k: 'break'; p: number; w: PickupType }
  | { k: 'wspawn'; w: PickupType; x: number; z: number }
  | { k: 'qual'; p: number; place: number }
  | { k: 'respawn'; p: number }
  | { k: 'bar'; p: number }
  | { k: 'core'; p: number; a: 'pick' | 'deliver' | 'drop'; n: number; pts: number }
  | { k: 'emote'; p: number; e: string }
  | { k: 'sudden' }
  | { k: 'msg'; text: string };

/** Núcleo de energía suelto: [id, x, y, z]. */
export type NetCore = [number, number, number, number];

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
  /** Núcleos sueltos (ronda de energía). */
  c?: NetCore[];
  /** Plazas de clasificación de la ronda y cuántas están ya aseguradas. */
  slots: number;
  secured: number;
  /** Muerte súbita activa (final). */
  sudden?: boolean;
  tiles?: string;
  e?: GameEvent[];
}

export interface RoundResult {
  type: 'roundEnd';
  round: number;
  name: string;
  reason: string;
  standings: Standing[];
  next: string;
}

export interface FinalResult {
  type: 'final';
  winnerId: number;
  winnerName: string;
  winnerFx: string;
  reason: string;
  standings: Standing[];
}

export type ServerMsg =
  | { type: 'welcome'; id: number; v: number }
  | { type: 'error'; msg: string }
  | { type: 'left' }
  | { type: 'pong'; t: number }
  | { type: 'profile'; profile: PublicProfile }
  | { type: 'reward'; reward: Reward; levelBefore: number; levelAfter: number; profile: PublicProfile }
  | RoomInfo
  | Snapshot
  | RoundResult
  | FinalResult;
