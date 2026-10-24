// Catálogo de cosméticos desbloqueables y reglas de progresión. Todo es
// opcional y se añade encima del personaje base: nada cambia sus estadísticas
// ni el modelo original, así que un veterano no tiene ventaja en combate.

export type CosmeticKind = 'color' | 'acc' | 'title' | 'emote' | 'fx';

export interface Cosmetic {
  id: string;
  kind: CosmeticKind;
  name: string;
  price: number;
  /** Nivel mínimo para poder comprarlo (0 = sin requisito). */
  level: number;
  /** Color (hex), emoji del gesto o texto del título. */
  value: string;
}

export const COSMETICS: Cosmetic[] = [
  // Colores adicionales (la paleta original sigue siendo gratuita).
  { id: 'color:#ffd700', kind: 'color', name: 'Oro brillante', price: 300, level: 3, value: '#ffd700' },
  { id: 'color:#00e5c0', kind: 'color', name: 'Menta neón', price: 150, level: 0, value: '#00e5c0' },
  { id: 'color:#ff2e63', kind: 'color', name: 'Fresa ácida', price: 150, level: 0, value: '#ff2e63' },
  { id: 'color:#8be9fd', kind: 'color', name: 'Hielo', price: 150, level: 0, value: '#8be9fd' },
  { id: 'color:#2b2b3f', kind: 'color', name: 'Regaliz', price: 200, level: 2, value: '#2b2b3f' },
  { id: 'color:#c8ff4d', kind: 'color', name: 'Lima', price: 150, level: 0, value: '#c8ff4d' },
  // Disfraces (accesorios nuevos).
  { id: 'acc:flowers', kind: 'acc', name: 'Corona de flores', price: 120, level: 0, value: 'flowers' },
  { id: 'acc:chef', kind: 'acc', name: 'Gorro de chef', price: 180, level: 0, value: 'chef' },
  { id: 'acc:viking', kind: 'acc', name: 'Casco vikingo', price: 250, level: 2, value: 'viking' },
  { id: 'acc:halo', kind: 'acc', name: 'Aureola', price: 400, level: 4, value: 'halo' },
  // Gestos (el saludo es gratuito).
  { id: 'emote:wave', kind: 'emote', name: 'Saludo', price: 0, level: 0, value: '👋' },
  { id: 'emote:laugh', kind: 'emote', name: 'Carcajada', price: 80, level: 0, value: '😂' },
  { id: 'emote:cool', kind: 'emote', name: 'Chulería', price: 120, level: 0, value: '😎' },
  { id: 'emote:angry', kind: 'emote', name: 'Rabieta', price: 120, level: 0, value: '💢' },
  { id: 'emote:party', kind: 'emote', name: 'Fiesta', price: 200, level: 2, value: '🎉' },
  // Celebraciones de victoria (el confeti es gratuito).
  { id: 'fx:confetti', kind: 'fx', name: 'Confeti', price: 0, level: 0, value: 'confetti' },
  { id: 'fx:fireworks', kind: 'fx', name: 'Fuegos artificiales', price: 250, level: 2, value: 'fireworks' },
  { id: 'fx:hearts', kind: 'fx', name: 'Lluvia de corazones', price: 200, level: 0, value: 'hearts' },
  { id: 'fx:stars', kind: 'fx', name: 'Estrellas doradas', price: 350, level: 4, value: 'stars' },
  // Títulos.
  { id: 'title:rookie', kind: 'title', name: 'Novata gelatinosa', price: 0, level: 0, value: 'Novata gelatinosa' },
  { id: 'title:parkour', kind: 'title', name: 'Reina del parkour', price: 150, level: 2, value: 'Reina del parkour' },
  { id: 'title:bruiser', kind: 'title', name: 'Rompeplatos', price: 150, level: 2, value: 'Rompeplatos' },
  { id: 'title:thief', kind: 'title', name: 'Ladrona de energía', price: 200, level: 3, value: 'Ladrona de energía' },
  { id: 'title:legend', kind: 'title', name: 'Leyenda del Caos', price: 800, level: 6, value: 'Leyenda del Caos' },
];

export const COSMETIC_BY_ID = new Map(COSMETICS.map((c) => [c.id, c]));
export const FREE_COSMETICS = COSMETICS.filter((c) => c.price === 0).map((c) => c.id);

export interface PlayerStats {
  matches: number;
  wins: number;
  kos: number;
  roundsCleared: number;
  coresDelivered: number;
  bestPlace: number;
}

/** Lo que el cliente ve de su perfil. */
export interface PublicProfile {
  xp: number;
  coins: number;
  level: number;
  /** XP del nivel actual y XP necesaria para el siguiente. */
  levelXp: number;
  nextXp: number;
  stats: PlayerStats;
  owned: string[];
  /** Dónde se guarda: 'server' (archivo del servidor), 'browser' (este navegador) o 'memory' (se pierde al cerrar). */
  storage: 'server' | 'browser' | 'memory';
}

export function emptyStats(): PlayerStats {
  return { matches: 0, wins: 0, kos: 0, roundsCleared: 0, coresDelivered: 0, bestPlace: 0 };
}

/** XP total necesaria para alcanzar un nivel (nivel 1 = 0 XP). */
export function xpForLevel(level: number): number {
  return 60 * (level - 1) * level;
}

export function levelFromXp(xp: number): number {
  let l = 1;
  while (xpForLevel(l + 1) <= xp) l++;
  return l;
}

export interface MatchResult {
  place: number;
  players: number;
  roundsCleared: number;
  kos: number;
  cores: number;
  won: boolean;
}

export interface Reward {
  coins: number;
  xp: number;
  lines: string[];
}

/** Recompensa por participación y rendimiento (no por gastar ni por nivel). */
export function computeReward(r: MatchResult): Reward {
  const lines: string[] = [];
  let coins = 15;
  lines.push('Participar: +15');
  if (r.roundsCleared > 0) {
    coins += r.roundsCleared * 12;
    lines.push(`Rondas superadas (${r.roundsCleared}): +${r.roundsCleared * 12}`);
  }
  if (r.kos > 0) {
    coins += r.kos * 5;
    lines.push(`Eliminaciones (${r.kos}): +${r.kos * 5}`);
  }
  if (r.cores > 0) {
    coins += r.cores * 2;
    lines.push(`Núcleos entregados (${r.cores}): +${r.cores * 2}`);
  }
  if (r.won) {
    coins += 60;
    lines.push('¡Campeón del torneo!: +60');
  }
  return { coins, xp: coins * 2, lines };
}
