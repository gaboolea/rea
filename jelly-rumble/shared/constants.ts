// Constantes compartidas entre cliente y servidor. Cualquier cambio aquí afecta
// a la simulación de ambos lados, así que deben mantenerse idénticas.

export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;
export const MAX_PLAYERS = 12;
export const PROTOCOL_VERSION = 2;

export const PLAYER_RADIUS = 0.55;
export const PLAYER_HEIGHT = 1.45;
export const STEP_HEIGHT = 0.45;

export const GRAVITY = -32;
export const MAX_FALL_SPEED = -45;
export const JUMP_SPEED = 11.5;
export const WALK_SPEED = 6.2;
export const RUN_SPEED = 9.2;
export const BLOCK_SPEED_FACTOR = 0.45;
export const GROUND_ACCEL = 55;
export const AIR_ACCEL = 16;
export const STUN_CONTROL = 0.15;
export const STUN_GROUND_FRICTION = 7;
export const COYOTE_TIME = 0.12;
export const BOUNCE_SPEED = 19;

export const PICKUP_RANGE = 2.2;
export const WEAPON_GROUND_LIFETIME = 25;
export const RESPAWN_DELAY = 2;
export const SPAWN_INVULNERABILITY = 2.5;
export const KO_CREDIT_WINDOW = 6;
export const MAX_DAMAGE = 300;

export type WeaponType = 'fists' | 'sword' | 'hammer' | 'quake' | 'gloves';
/** Objetos que caen del cielo: armas y el escudo temporal (no ocupa la mano). */
export type PickupType = Exclude<WeaponType, 'fists'> | 'shield';

export interface WeaponStats {
  name: string;
  /** Tiempo entre que se pulsa el botón y el golpe efectivo. */
  windup: number;
  /** Tiempo mínimo entre dos ataques. */
  cooldown: number;
  /** Alcance horizontal desde el centro del atacante. */
  range: number;
  /** Ángulo total del arco frontal en grados; 360 = onda expansiva. */
  arc: number;
  knockback: number;
  lift: number;
  damage: number;
  stun: number;
  /** Usos antes de romperse; Infinity para los puños. */
  uses: number;
  /** Fracción del empuje que atraviesa el bloqueo. */
  blockPierce: number;
}

export const WEAPONS: Record<WeaponType, WeaponStats> = {
  fists: { name: 'Puños', windup: 0.06, cooldown: 0.45, range: 1.75, arc: 100, knockback: 6, lift: 3.5, damage: 5, stun: 0.35, uses: Infinity, blockPierce: 0.25 },
  sword: { name: 'Espada', windup: 0.1, cooldown: 0.5, range: 2.5, arc: 110, knockback: 10, lift: 4.5, damage: 11, stun: 0.5, uses: 10, blockPierce: 0.35 },
  hammer: { name: 'Martillo', windup: 0.42, cooldown: 1.1, range: 2.8, arc: 140, knockback: 17, lift: 7.5, damage: 22, stun: 0.85, uses: 6, blockPierce: 0.7 },
  quake: { name: 'Mazo Sísmico', windup: 0.5, cooldown: 1.5, range: 4.8, arc: 360, knockback: 15, lift: 10, damage: 18, stun: 0.9, uses: 3, blockPierce: 0.5 },
  gloves: { name: 'Guantes de Impacto', windup: 0.12, cooldown: 0.75, range: 2, arc: 90, knockback: 16, lift: 5, damage: 8, stun: 0.6, uses: 8, blockPierce: 0.5 },
};

export const PICKUP_NAMES: Record<PickupType, string> = {
  sword: 'Espada', hammer: 'Martillo', quake: 'Mazo Sísmico', gloves: 'Guantes de Impacto', shield: 'Escudo Temporal',
};

/** Escudo temporal: anula casi todo el empuje durante un tiempo o unos golpes. */
export const SHIELD_TIME = 8;
export const SHIELD_HITS = 3;
/** Núcleos de energía (ronda 3). */
export const CORE_MAX_CARRY = 3;
export const CORE_SLOW = 0.08;
export const CORE_PICK_RANGE = 1.2;
export const EMOTE_COOLDOWN = 2;

export const BLOCK_KNOCK_FACTOR = 0.3;
export const BLOCK_DAMAGE_FACTOR = 0.5;

/** Multiplicador de empuje según el daño acumulado (estilo "porcentaje"). */
export function knockbackScale(damage: number): number {
  return 1 + Math.min(damage, MAX_DAMAGE) / 110;
}

export const PALETTE = [
  '#ff5a7a', '#ffb13b', '#ffe14d', '#7be35b', '#3ddbb8', '#3bb4ff',
  '#6d7bff', '#b06dff', '#ff7ae0', '#f4f4f4', '#ff7b3b', '#5e5e6e',
];

export const ACCESSORIES = ['none', 'crown', 'cone', 'antenna', 'bow', 'horns', 'tophat', 'leaf', 'halo', 'chef', 'viking', 'flowers'] as const;
export type Accessory = (typeof ACCESSORIES)[number];
export const ACCESSORY_NAMES: Record<Accessory, string> = {
  none: 'Nada', crown: 'Corona', cone: 'Gorro fiesta', antenna: 'Antena', bow: 'Lazo', horns: 'Cuernos', tophat: 'Chistera', leaf: 'Brote',
  halo: 'Aureola', chef: 'Gorro de chef', viking: 'Casco vikingo', flowers: 'Corona de flores',
};

export const EYES = ['round', 'happy', 'angry', 'sleepy'] as const;
export type EyeStyle = (typeof EYES)[number];
export const EYE_NAMES: Record<EyeStyle, string> = { round: 'Redondos', happy: 'Felices', angry: 'Furiosos', sleepy: 'Dormilones' };

export interface Look {
  color: string;
  accessory: Accessory;
  eyes: EyeStyle;
  /** Título elegido (id de cosmético, opcional). */
  title?: string;
  /** Efecto de celebración al ganar (id de cosmético, opcional). */
  fx?: string;
}

/** Accesorios gratuitos (los originales); el resto se desbloquea con monedas. */
export const FREE_ACCESSORIES: readonly Accessory[] = ['none', 'crown', 'cone', 'antenna', 'bow', 'horns', 'tophat', 'leaf'];

/**
 * Valida un aspecto recibido. `owns` decide si un cosmético de pago está
 * desbloqueado; sin él solo se aceptan los elementos gratuitos.
 */
export function sanitizeLook(raw: unknown, owns: (id: string) => boolean = () => false): Look {
  const r = (raw ?? {}) as Partial<Record<keyof Look, unknown>>;
  const hex = typeof r.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.color) ? r.color.toLowerCase() : '';
  const color = hex && (PALETTE.includes(hex) || owns(`color:${hex}`)) ? hex : PALETTE[0]!;
  const acc = ACCESSORIES.includes(r.accessory as Accessory) ? (r.accessory as Accessory) : 'none';
  const accessory = FREE_ACCESSORIES.includes(acc) || owns(`acc:${acc}`) ? acc : 'none';
  const eyes = EYES.includes(r.eyes as EyeStyle) ? (r.eyes as EyeStyle) : 'round';
  const look: Look = { color, accessory, eyes };
  if (typeof r.title === 'string' && owns(r.title)) look.title = r.title;
  if (typeof r.fx === 'string' && owns(r.fx)) look.fx = r.fx;
  return look;
}

export function sanitizeName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  const clean = s.replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 14);
  return clean.length > 0 ? clean : 'Gelatina';
}
