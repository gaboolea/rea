// Almacén de perfiles del modo sin conexión: guarda el progreso en este
// navegador (localStorage). Si el navegador no permite guardar, avisa como
// almacenamiento en memoria para no fingir que se conserva.
import { type ProfileRecord, type ProfileStore, normalizeRecord } from '../../server/profiles.ts';

const KEY = 'jr.localProfiles';

function available(): boolean {
  try {
    localStorage.setItem('jr.probe', '1');
    localStorage.removeItem('jr.probe');
    return true;
  } catch {
    return false;
  }
}

export class LocalProfileStore implements ProfileStore {
  readonly kind = available() ? ('browser' as const) : ('memory' as const);
  private mem = new Map<string, ProfileRecord>();

  load(token: string): ProfileRecord | null {
    if (this.kind === 'memory') return this.mem.get(token) ?? null;
    try {
      const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
      return all[token] ? normalizeRecord(all[token]) : null;
    } catch {
      return null;
    }
  }

  save(token: string, rec: ProfileRecord): void {
    if (this.kind === 'memory') {
      this.mem.set(token, structuredClone(rec));
      return;
    }
    try {
      const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
      all[token] = rec;
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch {
      this.mem.set(token, structuredClone(rec));
    }
  }
}
