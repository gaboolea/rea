// Preferencias del jugador guardadas en el navegador.
import { type Look, PALETTE, sanitizeLook, sanitizeName } from '../../shared/constants.ts';

export interface Options {
  master: number;
  music: number;
  sfx: number;
  sensitivity: number;
  invertY: boolean;
  showHelp: boolean;
  quality: 'high' | 'medium' | 'low';
}

export interface Profile {
  name: string;
  look: Look;
}

const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
const DEFAULT_OPTIONS: Options = { master: 0.8, music: 0.5, sfx: 0.8, sensitivity: 1, invertY: false, showHelp: true, quality: coarse ? 'medium' : 'high' };

function read<T>(key: string): Partial<T> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as Partial<T>;
  } catch {
    return {};
  }
}

function write(key: string, v: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* almacenamiento no disponible: se usan los valores en memoria */
  }
}

export const options: Options = { ...DEFAULT_OPTIONS, ...read<Options>('jr.options') };

const storedProfile = read<Profile>('jr.profile');
export const profile: Profile = {
  name: sanitizeName(storedProfile.name ?? `Gelatina${Math.floor(Math.random() * 900 + 100)}`),
  look: sanitizeLook(storedProfile.look ?? { color: PALETTE[Math.floor(Math.random() * 9)], accessory: 'none', eyes: 'round' }),
};

export function saveOptions(): void {
  write('jr.options', options);
}

export function saveProfile(): void {
  write('jr.profile', profile);
}
