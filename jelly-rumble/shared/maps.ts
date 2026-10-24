// Definición de los cinco mapas. Toda la geometría dinámica (plataformas
// móviles, plataformas que desaparecen, sectores que caen, anillo que encoge)
// es una función determinista del tiempo de ronda, así cliente y servidor
// calculan exactamente el mismo escenario sin enviarlo por la red. Solo las
// baldosas que se derrumban al pisarlas (ronda 4) dependen del estado del
// servidor y se sincronizan como una cadena compacta.

export interface MoveDef {
  ax: number; ay: number; az: number;
  period: number;
  phase: number;
}

export interface VanishDef {
  period: number;
  /** Fracción del periodo en que la plataforma es sólida. */
  on: number;
  phase: number;
}

export type BoxKind = 'static' | 'moving' | 'vanish' | 'bounce' | 'tile' | 'goal';

export interface BoxDef {
  x: number; y: number; z: number;
  w: number; h: number; d: number;
  kind: BoxKind;
  style: string;
  move?: MoveDef;
  vanish?: VanishDef;
  /** Índice de baldosa en el array de estados (solo kind 'tile'). */
  tile?: number;
}

export interface CylDef {
  x: number; z: number;
  /** Altura de la cara superior. */
  top: number;
  h: number;
  r: number;
  style: string;
  /** Anillo que encoge con el tiempo: radio(t). */
  shrink?: { from: number; to: number; start: number; end: number };
  /** Radio interior hueco (para anillos sectorizados). */
  inner?: number;
  /** Sectores que desaparecen según la agenda determinista de la ronda 3. */
  sectors?: number;
}

export interface BarDef {
  x: number; z: number;
  y: number;
  /** Longitud desde el centro hasta cada punta. */
  len: number;
  /** Si es true la barra va del centro hacia un lado; si no, cruza el centro. */
  oneSided?: boolean;
  speed: number;
  phase: number;
  thick: number;
  power: number;
}

export interface Theme {
  skyTop: string;
  skyBottom: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  sun: string;
  ambient: string;
  ground?: 'clouds' | 'lava' | 'void' | 'sea';
  music: number;
}

export interface MapDef {
  id: number;
  name: string;
  subtitle: string;
  rules: string;
  timeLimit: number;
  lives: number;
  killY: number;
  theme: Theme;
  boxes: BoxDef[];
  cyls: CylDef[];
  bars: BarDef[];
  spawns: [number, number, number][];
  /** Puntos de reaparición ordenados por progreso (ronda 2). */
  checkpoints?: { z: number; spawn: [number, number, number] }[];
  weaponSpots: [number, number][];
  weaponInterval: number;
  maxWeapons: number;
  weaponPool: Partial<Record<'sword' | 'hammer' | 'quake', number>>;
  goalZ?: number;
  tileCount?: number;
  /** Baldosas: segundos pisadas antes de temblar y segundos temblando. */
  tileRules?: { standTime: number; shakeTime: number; ringCollapseEvery: number };
}

function ringSpawns(n: number, r: number, y: number, cx = 0, cz = 0): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]);
  }
  return out;
}

// ---------------------------------------------------------------- Ronda 1
function buildArena(): MapDef {
  const boxes: BoxDef[] = [
    // Plataforma elevada central con escalones.
    { x: 0, y: 0.5, z: 0, w: 5, h: 1, d: 5, kind: 'static', style: 'grass' },
    { x: 0, y: 0.25, z: 3.2, w: 2.4, h: 0.5, d: 1.4, kind: 'static', style: 'grass' },
    { x: 0, y: 0.25, z: -3.2, w: 2.4, h: 0.5, d: 1.4, kind: 'static', style: 'grass' },
    // Cajas de cobertura.
    { x: 7, y: 0.6, z: 6, w: 1.6, h: 1.2, d: 1.6, kind: 'static', style: 'crate' },
    { x: -7.5, y: 0.6, z: 5, w: 1.6, h: 1.2, d: 1.6, kind: 'static', style: 'crate' },
    { x: 6, y: 0.6, z: -7.5, w: 1.6, h: 1.2, d: 1.6, kind: 'static', style: 'crate' },
    { x: -6, y: 0.6, z: -7, w: 1.6, h: 1.2, d: 1.6, kind: 'static', style: 'crate' },
    // Islas laterales con premio y plataformas móviles para llegar.
    { x: 25, y: -0.5, z: 0, w: 6, h: 2, d: 6, kind: 'static', style: 'grass' },
    { x: -25, y: -0.5, z: 0, w: 6, h: 2, d: 6, kind: 'static', style: 'grass' },
    { x: 18.5, y: -0.25, z: 0, w: 3, h: 0.5, d: 3, kind: 'moving', style: 'mover', move: { ax: 2.5, ay: 0, az: 0, period: 5, phase: 0 } },
    { x: -18.5, y: -0.25, z: 0, w: 3, h: 0.5, d: 3, kind: 'moving', style: 'mover', move: { ax: 2.5, ay: 0, az: 0, period: 5, phase: 0.5 } },
    // Plataforma flotante que sube y baja.
    { x: 0, y: 3, z: -20, w: 4, h: 0.6, d: 4, kind: 'moving', style: 'mover', move: { ax: 0, ay: 2.5, az: 0, period: 6, phase: 0 } },
    { x: 0, y: -0.5, z: -26, w: 7, h: 2, d: 5, kind: 'static', style: 'grass' },
    // Trampolines.
    { x: 6, y: 0.15, z: -0.5, w: 1.8, h: 0.3, d: 1.8, kind: 'bounce', style: 'bounce' },
    { x: -6, y: 0.15, z: 0.5, w: 1.8, h: 0.3, d: 1.8, kind: 'bounce', style: 'bounce' },
    { x: 0, y: 0.15, z: -12, w: 1.8, h: 0.3, d: 1.8, kind: 'bounce', style: 'bounce' },
  ];
  return {
    id: 1,
    name: 'Arena de Entrenamiento',
    subtitle: 'Calienta, coge un arma y empuja',
    rules: '3 vidas. Sobrevive hasta que acabe el tiempo.',
    timeLimit: 75,
    lives: 3,
    killY: -18,
    theme: { skyTop: '#5fc8ff', skyBottom: '#d9f6ff', fog: '#bfefff', fogNear: 60, fogFar: 170, sun: '#fff4dd', ambient: '#a8d8ff', ground: 'clouds', music: 0 },
    boxes,
    cyls: [{ x: 0, z: 0, top: 0, h: 3, r: 14, style: 'grass' }],
    bars: [],
    spawns: ringSpawns(12, 10, 0.1),
    weaponSpots: [[0, 0], [10, 8], [-10, 8], [10, -8], [-10, -8], [25, 0], [-25, 0], [0, -26], [4, 11], [-4, -11]],
    weaponInterval: 6,
    maxWeapons: 4,
    weaponPool: { sword: 3, hammer: 2 },
  };
}

// ---------------------------------------------------------------- Ronda 2
function buildBridge(): MapDef {
  const boxes: BoxDef[] = [];
  const S = 'plank';
  // Plataforma de salida.
  boxes.push({ x: 0, y: -1, z: 0, w: 14, h: 2, d: 12, kind: 'static', style: 'grass' });
  // Puente estrecho 1.
  boxes.push({ x: 0, y: -0.25, z: 12, w: 2.6, h: 0.5, d: 12, kind: 'static', style: S });
  // Isla 1 (checkpoint).
  boxes.push({ x: 0, y: -1, z: 22, w: 9, h: 2, d: 8, kind: 'static', style: 'grass' });
  // Zona de plataformas que desaparecen.
  const vz = [29.5, 33.5, 37.5, 41.5];
  vz.forEach((z, i) => {
    boxes.push({ x: -2.6, y: -0.25, z, w: 3, h: 0.5, d: 3, kind: 'vanish', style: 'vanish', vanish: { period: 4, on: 0.62, phase: i * 0.25 } });
    boxes.push({ x: 2.6, y: -0.25, z, w: 3, h: 0.5, d: 3, kind: 'vanish', style: 'vanish', vanish: { period: 4, on: 0.62, phase: i * 0.25 + 0.5 } });
  });
  // Isla 2 (checkpoint).
  boxes.push({ x: 0, y: -1, z: 49, w: 10, h: 2, d: 8, kind: 'static', style: 'grass' });
  // Puentes dobles con huecos.
  boxes.push({ x: -2.5, y: -0.25, z: 57, w: 2, h: 0.5, d: 6, kind: 'static', style: S });
  boxes.push({ x: 2.5, y: -0.25, z: 57.5, w: 2, h: 0.5, d: 5, kind: 'static', style: S });
  boxes.push({ x: -2.5, y: -0.25, z: 63.5, w: 2, h: 0.5, d: 4, kind: 'static', style: S });
  boxes.push({ x: 2.5, y: -0.25, z: 64, w: 2, h: 0.5, d: 5, kind: 'static', style: S });
  // Plataformas móviles laterales.
  boxes.push({ x: 0, y: -0.25, z: 70, w: 3, h: 0.5, d: 3, kind: 'moving', style: 'mover', move: { ax: 4, ay: 0, az: 0, period: 4.5, phase: 0 } });
  boxes.push({ x: 0, y: -0.25, z: 74.5, w: 3, h: 0.5, d: 3, kind: 'moving', style: 'mover', move: { ax: 4, ay: 0, az: 0, period: 4.5, phase: 0.5 } });
  // Isla 3 (checkpoint) y rampa final.
  boxes.push({ x: 0, y: -1, z: 81, w: 9, h: 2, d: 7, kind: 'static', style: 'grass' });
  boxes.push({ x: 0, y: -0.25, z: 88, w: 2.6, h: 0.5, d: 8, kind: 'static', style: S });
  // Meta.
  boxes.push({ x: 0, y: -1, z: 98, w: 14, h: 2, d: 12, kind: 'goal', style: 'goal' });
  // Obstáculos en las islas.
  boxes.push({ x: -2.5, y: 0.6, z: 22, w: 1.4, h: 1.2, d: 1.4, kind: 'static', style: 'crate' });
  boxes.push({ x: 3, y: 0.6, z: 50, w: 1.4, h: 1.2, d: 1.4, kind: 'static', style: 'crate' });

  return {
    id: 2,
    name: 'El Puente Roto',
    subtitle: 'Cruza, esquiva y no mires abajo',
    rules: '2 vidas (reapareces en el último punto de control). Llega a la meta para clasificarte.',
    timeLimit: 90,
    lives: 2,
    killY: -16,
    theme: { skyTop: '#ff8a5c', skyBottom: '#ffd9a8', fog: '#ffc69a', fogNear: 50, fogFar: 160, sun: '#ffd0a0', ambient: '#ffb3a0', ground: 'clouds', music: 1 },
    boxes,
    cyls: [],
    bars: [
      { x: 0, z: 12, y: 0.55, len: 3.4, speed: 2.2, phase: 0, thick: 0.25, power: 13 },
      { x: 0, z: 49, y: 0.55, len: 4.6, speed: -1.6, phase: 1, thick: 0.25, power: 14 },
      { x: 0, z: 81, y: 0.55, len: 4.2, speed: 1.9, phase: 2, thick: 0.25, power: 14 },
      { x: 0, z: 88, y: 1.2, len: 3.2, speed: -2.6, phase: 0.4, thick: 0.25, power: 13 },
    ],
    spawns: Array.from({ length: 12 }, (_, i): [number, number, number] => [((i % 6) - 2.5) * 2, 0.1, -2 + Math.floor(i / 6) * 2.5]),
    checkpoints: [
      { z: -10, spawn: [0, 0.2, 0] },
      { z: 18.5, spawn: [0, 0.2, 22] },
      { z: 45.5, spawn: [0, 0.2, 49] },
      { z: 78, spawn: [0, 0.2, 81] },
    ],
    weaponSpots: [[0, 2], [3, 22], [-3, 49], [2, 81], [-3, 0], [3, 3]],
    weaponInterval: 9,
    maxWeapons: 3,
    weaponPool: { sword: 3, hammer: 2 },
    goalZ: 92.5,
  };
}

// ---------------------------------------------------------------- Ronda 3
function buildSpinner(): MapDef {
  return {
    id: 3,
    name: 'La Arena Giratoria',
    subtitle: 'Las barras giran y el suelo cambia',
    rules: '2 vidas. Los sectores rojos van a desaparecer: ¡muévete!',
    timeLimit: 75,
    lives: 2,
    killY: -18,
    theme: { skyTop: '#2a1b5e', skyBottom: '#8a5bd6', fog: '#5c3e9e', fogNear: 45, fogFar: 140, sun: '#d8c8ff', ambient: '#8a74d8', ground: 'void', music: 2 },
    boxes: [
      { x: 13, y: 1.5, z: 13, w: 3, h: 0.5, d: 3, kind: 'moving', style: 'mover', move: { ax: 0, ay: 1.2, az: 0, period: 4, phase: 0 } },
      { x: -13, y: 1.5, z: -13, w: 3, h: 0.5, d: 3, kind: 'moving', style: 'mover', move: { ax: 0, ay: 1.2, az: 0, period: 4, phase: 0.5 } },
    ],
    cyls: [
      { x: 0, z: 0, top: 0, h: 2.5, r: 15, inner: 3, style: 'neon', sectors: 8 },
      { x: 0, z: 0, top: 0, h: 2.5, r: 3, style: 'neonHub' },
      { x: 0, z: 0, top: 1.6, h: 1.6, r: 1.1, style: 'pillar' },
    ],
    bars: [
      { x: 0, z: 0, y: 0.5, len: 14.5, speed: 1.15, phase: Math.PI / 12, thick: 0.3, power: 15 },
      { x: 0, z: 0, y: 1.5, len: 10, speed: -0.8, phase: Math.PI / 2 + Math.PI / 12, thick: 0.3, power: 13, oneSided: true },
    ],
    spawns: ringSpawns(12, 9, 0.1),
    weaponSpots: [[8, 0], [-8, 0], [0, 8], [0, -8], [11, 11], [-11, -11], [6, -10], [-6, 10], [13, 13], [-13, -13]],
    weaponInterval: 6,
    maxWeapons: 4,
    weaponPool: { sword: 3, hammer: 3, quake: 1 },
  };
}

// ---------------------------------------------------------------- Ronda 4
export const R4_GRID = { layers: [{ n: 11, y: 0 }, { n: 9, y: -7 }], size: 2.7 };

function buildCollapse(): MapDef {
  const boxes: BoxDef[] = [];
  let tile = 0;
  for (const layer of R4_GRID.layers) {
    const half = (layer.n - 1) / 2;
    for (let i = 0; i < layer.n; i++) {
      for (let j = 0; j < layer.n; j++) {
        boxes.push({
          x: (i - half) * R4_GRID.size,
          y: layer.y - 0.3,
          z: (j - half) * R4_GRID.size,
          w: R4_GRID.size - 0.12, h: 0.6, d: R4_GRID.size - 0.12,
          kind: 'tile', style: layer.y === 0 ? 'tileTop' : 'tileLow', tile: tile++,
        });
      }
    }
  }
  // Empujadores que barren la capa superior.
  boxes.push({ x: 0, y: 0.8, z: -8, w: 1.2, h: 1.6, d: 1.2, kind: 'moving', style: 'pusher', move: { ax: 13, ay: 0, az: 0, period: 7, phase: 0 } });
  boxes.push({ x: 0, y: 0.8, z: 8, w: 1.2, h: 1.6, d: 1.2, kind: 'moving', style: 'pusher', move: { ax: 13, ay: 0, az: 0, period: 7, phase: 0.5 } });
  boxes.push({ x: 8, y: 0.8, z: 0, w: 1.2, h: 1.6, d: 1.2, kind: 'moving', style: 'pusher', move: { ax: 0, ay: 0, az: 13, period: 8, phase: 0.25 } });
  const spots: [number, number][] = [];
  for (let i = -4; i <= 4; i += 2) for (let j = -4; j <= 4; j += 2) spots.push([i * R4_GRID.size, j * R4_GRID.size]);
  return {
    id: 4,
    name: 'Supervivencia Extrema',
    subtitle: 'El suelo se derrumba sobre la lava',
    rules: '1 vida. Las baldosas caen al pisarlas y el borde se derrumba. La lava elimina.',
    timeLimit: 75,
    lives: 1,
    killY: -12,
    theme: { skyTop: '#3a0d05', skyBottom: '#c2410c', fog: '#7a2008', fogNear: 35, fogFar: 120, sun: '#ffb070', ambient: '#ff8a4a', ground: 'lava', music: 3 },
    boxes,
    cyls: [],
    bars: [{ x: 0, z: 0, y: -6.5, len: 12, speed: 0.9, phase: 0, thick: 0.3, power: 13 }],
    spawns: ringSpawns(12, 8, 0.2),
    weaponSpots: spots,
    weaponInterval: 5,
    maxWeapons: 4,
    weaponPool: { sword: 2, hammer: 3, quake: 1 },
    tileCount: tile,
    tileRules: { standTime: 0.5, shakeTime: 1.1, ringCollapseEvery: 14 },
  };
}

// ---------------------------------------------------------------- Ronda 5
function buildFinal(): MapDef {
  return {
    id: 5,
    name: 'La Gran Final',
    subtitle: 'Un ring que encoge. Solo uno queda en pie',
    rules: '1 vida. El ring se encoge. Si se acaba el tiempo gana quien tenga menos daño.',
    timeLimit: 90,
    lives: 1,
    killY: -16,
    theme: { skyTop: '#0b1033', skyBottom: '#3b2f8f', fog: '#1d1a55', fogNear: 45, fogFar: 150, sun: '#ffe3a3', ambient: '#9aa3ff', ground: 'void', music: 4 },
    boxes: [
      { x: 6, y: 2.2, z: 0, w: 2.4, h: 0.5, d: 2.4, kind: 'static', style: 'gold' },
      { x: -6, y: 2.2, z: 0, w: 2.4, h: 0.5, d: 2.4, kind: 'static', style: 'gold' },
      { x: 0, y: 3.4, z: 6, w: 2.4, h: 0.5, d: 2.4, kind: 'moving', style: 'mover', move: { ax: 3, ay: 0, az: 0, period: 6, phase: 0 } },
      { x: 0, y: 0.15, z: -5, w: 1.8, h: 0.3, d: 1.8, kind: 'bounce', style: 'bounce' },
    ],
    cyls: [{ x: 0, z: 0, top: 0, h: 3, r: 11, style: 'final', shrink: { from: 11, to: 4.2, start: 15, end: 80 } }],
    bars: [{ x: 0, z: 0, y: 0.5, len: 11, speed: 0.75, phase: Math.PI / 12, thick: 0.3, power: 14, oneSided: true }],
    spawns: ringSpawns(12, 7, 0.1),
    weaponSpots: [[0, 0], [4, 4], [-4, -4], [4, -4], [-4, 4], [6, 0], [-6, 0]],
    weaponInterval: 4.5,
    maxWeapons: 4,
    weaponPool: { sword: 2, hammer: 3, quake: 3 },
  };
}

export const MAPS: MapDef[] = [buildArena(), buildBridge(), buildSpinner(), buildCollapse(), buildFinal()];
export const ROUND_COUNT = MAPS.length;

// ------------------------------------------------------- Geometría dinámica

export function boxOffset(b: BoxDef, t: number): [number, number, number] {
  if (!b.move) return [0, 0, 0];
  const s = Math.sin(((t / b.move.period) + b.move.phase) * Math.PI * 2);
  return [b.move.ax * s, b.move.ay * s, b.move.az * s];
}

/** Devuelve [sólida, aviso] para plataformas que aparecen y desaparecen. */
export function vanishState(b: BoxDef, t: number): { solid: boolean; warn: number } {
  if (!b.vanish) return { solid: true, warn: 0 };
  const f = (((t / b.vanish.period) + b.vanish.phase) % 1 + 1) % 1;
  const solid = f < b.vanish.on;
  const warnWindow = 0.25;
  const warn = solid ? Math.max(0, 1 - (b.vanish.on - f) / warnWindow) : 0;
  return { solid, warn };
}

export function cylRadius(c: CylDef, t: number): number {
  if (!c.shrink) return c.r;
  const { from, to, start, end } = c.shrink;
  const k = Math.min(1, Math.max(0, (t - start) / (end - start)));
  return from + (to - from) * k;
}

export function barAngle(b: BarDef, t: number): number {
  return b.phase + b.speed * t;
}

// Agenda de sectores de la ronda 3: cada fase dura SECTOR_PHASE segundos.
// Durante los primeros SECTOR_WARN segundos de la fase los sectores marcados
// parpadean; después caen hasta el final de la fase.
export const SECTOR_PHASE = 9;
export const SECTOR_WARN = 3;
export const SECTOR_START = 8;

function hash(n: number): number {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 2246822507) >>> 0;
  x ^= x >>> 13;
  return x >>> 0;
}

/** Sectores seleccionados para una fase dada (máscara de bits). */
export function sectorMask(phaseIndex: number, sectors: number): number {
  const count = Math.min(sectors - 2, 2 + Math.floor(phaseIndex / 2));
  let mask = 0;
  let k = 0;
  let picked = 0;
  while (picked < count && k < 64) {
    const s = hash(phaseIndex * 97 + k * 13 + 7) % sectors;
    if (!(mask & (1 << s))) {
      mask |= 1 << s;
      picked++;
    }
    k++;
  }
  return mask;
}

/** Estado de un sector: 0 sólido, 1 aviso, 2 caído. */
export function sectorState(t: number, sector: number, sectors: number): 0 | 1 | 2 {
  if (t < SECTOR_START) return 0;
  const rel = t - SECTOR_START;
  const phase = Math.floor(rel / SECTOR_PHASE);
  const inPhase = rel - phase * SECTOR_PHASE;
  const mask = sectorMask(phase, sectors);
  if (!(mask & (1 << sector))) return 0;
  return inPhase < SECTOR_WARN ? 1 : 2;
}

export function sectorIndexAt(x: number, z: number, cx: number, cz: number, sectors: number): number {
  const a = Math.atan2(z - cz, x - cx);
  const f = (a / (Math.PI * 2) + 1) % 1;
  return Math.min(sectors - 1, Math.floor(f * sectors));
}

// Estados de baldosa (ronda 4). Se codifican como caracteres:
// '0' sólida, '1' temblando, '2' caída.
export type TileStates = string;
export const TILE_SOLID = '0';
export const TILE_SHAKE = '1';
export const TILE_GONE = '2';
