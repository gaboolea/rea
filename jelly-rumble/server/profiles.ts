// Perfiles persistentes: experiencia, monedas, estadísticas y cosméticos.
// La lógica no depende de dónde se guardan; cada entorno aporta su almacén
// (archivo JSON en el servidor Node, localStorage en el modo sin conexión).
import {
  COSMETIC_BY_ID, FREE_COSMETICS, type MatchResult, type PlayerStats, type PublicProfile, type Reward,
  computeReward, emptyStats, levelFromXp, xpForLevel,
} from '../shared/cosmetics.ts';

export interface ProfileRecord {
  xp: number;
  coins: number;
  stats: PlayerStats;
  owned: string[];
  updatedAt: number;
}

export interface ProfileStore {
  readonly kind: PublicProfile['storage'];
  load(token: string): ProfileRecord | null;
  save(token: string, rec: ProfileRecord): void;
}

/** Almacén en memoria: se pierde al reiniciar (pruebas o si no hay disco). */
export class MemoryProfileStore implements ProfileStore {
  readonly kind = 'memory' as const;
  private data = new Map<string, ProfileRecord>();
  load(token: string): ProfileRecord | null {
    const r = this.data.get(token);
    return r ? structuredClone(r) : null;
  }
  save(token: string, rec: ProfileRecord): void {
    this.data.set(token, structuredClone(rec));
  }
}

export function sanitizeToken(raw: unknown): string | null {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(raw) ? raw : null;
}

export function newRecord(): ProfileRecord {
  return { xp: 0, coins: 0, stats: emptyStats(), owned: [...FREE_COSMETICS], updatedAt: Date.now() };
}

/** Corrige registros antiguos o dañados sin perder lo que sea válido. */
export function normalizeRecord(raw: unknown): ProfileRecord {
  const r = (raw ?? {}) as Partial<ProfileRecord>;
  const base = newRecord();
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
  const stats = { ...base.stats };
  for (const k of Object.keys(stats) as (keyof PlayerStats)[]) stats[k] = num(r.stats?.[k], stats[k]);
  const owned = new Set(base.owned);
  if (Array.isArray(r.owned)) for (const id of r.owned) if (typeof id === 'string' && COSMETIC_BY_ID.has(id)) owned.add(id);
  return { xp: num(r.xp, 0), coins: num(r.coins, 0), stats, owned: [...owned], updatedAt: num(r.updatedAt, Date.now()) };
}

export function toPublic(rec: ProfileRecord, storage: PublicProfile['storage']): PublicProfile {
  const level = levelFromXp(rec.xp);
  return {
    xp: rec.xp, coins: rec.coins, level,
    levelXp: rec.xp - xpForLevel(level), nextXp: xpForLevel(level + 1) - xpForLevel(level),
    stats: { ...rec.stats }, owned: [...rec.owned], storage,
  };
}

export function buy(rec: ProfileRecord, item: string): string | null {
  const c = COSMETIC_BY_ID.get(item);
  if (!c) return 'Ese objeto no existe';
  if (rec.owned.includes(item)) return 'Ya lo tienes';
  if (levelFromXp(rec.xp) < c.level) return `Necesitas nivel ${c.level}`;
  if (rec.coins < c.price) return `Te faltan ${c.price - rec.coins} monedas`;
  rec.coins -= c.price;
  rec.owned.push(item);
  rec.updatedAt = Date.now();
  return null;
}

export function applyMatch(rec: ProfileRecord, r: MatchResult): Reward {
  const reward = computeReward(r);
  rec.coins += reward.coins;
  rec.xp += reward.xp;
  const s = rec.stats;
  s.matches++;
  if (r.won) s.wins++;
  s.kos += r.kos;
  s.roundsCleared += r.roundsCleared;
  s.coresDelivered += r.cores;
  if (s.bestPlace === 0 || r.place < s.bestPlace) s.bestPlace = r.place;
  rec.updatedAt = Date.now();
  return reward;
}
