// Almacén de perfiles en un archivo JSON del servidor (solo Node). La ruta se
// configura con DATA_DIR (por defecto ./data). Escritura atómica y diferida.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { type ProfileRecord, type ProfileStore, normalizeRecord } from './profiles.ts';

export class FileProfileStore implements ProfileStore {
  readonly kind = 'server' as const;
  private data = new Map<string, ProfileRecord>();
  private file: string;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(dir = process.env.DATA_DIR ?? 'data') {
    const d = resolve(dir);
    mkdirSync(d, { recursive: true });
    this.file = join(d, 'profiles.json');
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, unknown>;
      for (const [k, v] of Object.entries(raw)) this.data.set(k, normalizeRecord(v));
    } catch {
      /* primer arranque o archivo ilegible: se empieza vacío */
    }
  }

  load(token: string): ProfileRecord | null {
    const r = this.data.get(token);
    return r ? structuredClone(r) : null;
  }

  save(token: string, rec: ProfileRecord): void {
    this.data.set(token, structuredClone(rec));
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), 1000);
  }

  flush(): void {
    this.timer = null;
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.data)));
    renameSync(tmp, this.file);
  }
}
