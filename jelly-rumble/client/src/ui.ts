// Utilidades de interfaz DOM: pantallas, avisos, rótulos y registro de eventos.
import { audio } from './audio.ts';

export function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Falta el elemento #${id}`);
  return el;
}

const SCREENS = ['screen-menu', 'screen-play', 'screen-customize', 'screen-options', 'screen-lobby', 'hud', 'screen-pause', 'screen-round', 'screen-final', 'screen-quit'];

export function show(...ids: string[]): void {
  for (const s of SCREENS) $(s).classList.toggle('on', ids.includes(s));
}

export function isShown(id: string): boolean {
  return $(id).classList.contains('on');
}

let toastTimer = 0;
export function toast(text: string, ms = 3200): void {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('on'), ms);
}

let bannerTimer = 0;
export function banner(text: string, sub?: string, ms = 1600): void {
  const b = $('hud-banner');
  b.innerHTML = '';
  b.append(document.createTextNode(text));
  if (sub) {
    const s = document.createElement('small');
    s.textContent = sub;
    b.append(s);
  }
  b.classList.remove('on');
  void b.offsetWidth;
  b.classList.add('on');
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => b.classList.remove('on'), ms);
}

export function feed(text: string, mine = false): void {
  const f = $('hud-feed');
  const d = document.createElement('div');
  d.textContent = text;
  if (mine) d.className = 'me';
  f.prepend(d);
  while (f.children.length > 6) f.lastChild?.remove();
  setTimeout(() => d.remove(), 6000);
}

/** Sonidos al pasar el ratón y al pulsar cualquier botón. */
export function wireButtonSounds(): void {
  document.addEventListener('pointerover', (e) => {
    if ((e.target as HTMLElement).closest?.('.btn')) audio.hover();
  });
  document.addEventListener('pointerdown', (e) => {
    audio.unlock();
    if ((e.target as HTMLElement).closest?.('.btn')) audio.click();
  });
  document.addEventListener('keydown', () => audio.unlock(), { once: true });
}
