// Controles táctiles: joystick dinámico en la mitad izquierda, arrastre para
// la cámara en la mitad derecha y botones de acción.
export const isTouchDevice = (): boolean =>
  typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window);

export class TouchControls {
  /** Joystick: x derecha, y adelante, en [-1, 1]. */
  x = 0;
  y = 0;
  jump = false;
  attack = false;
  block = false;
  private jumpQueued = false;
  private interactQueued = false;
  private lookDx = 0;
  private lookDy = 0;
  private stickId = -1;
  private stickX = 0;
  private stickY = 0;
  private lookId = -1;
  private lookX = 0;
  private lookY = 0;
  private cleanup: (() => void)[] = [];
  private static RADIUS = 60;

  constructor(private root: HTMLElement, private stick: HTMLElement, private knob: HTMLElement, onPause: () => void) {
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      el.addEventListener(type, fn as EventListener, { passive: false });
      this.cleanup.push(() => el.removeEventListener(type, fn as EventListener));
    };

    on(root, 'pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.tb')) return;
      e.preventDefault();
      if (e.clientX < window.innerWidth * 0.45 && this.stickId < 0) {
        this.stickId = e.pointerId;
        this.stickX = e.clientX;
        this.stickY = e.clientY;
        this.stick.style.left = `${e.clientX}px`;
        this.stick.style.top = `${e.clientY}px`;
        this.stick.classList.add('on');
        this.knob.style.transform = 'translate(-50%, -50%)';
      } else if (this.lookId < 0) {
        this.lookId = e.pointerId;
        this.lookX = e.clientX;
        this.lookY = e.clientY;
      }
    });
    on(window, 'pointermove', (e) => {
      if (e.pointerId === this.stickId) {
        let dx = e.clientX - this.stickX;
        let dy = e.clientY - this.stickY;
        const d = Math.hypot(dx, dy);
        const R = TouchControls.RADIUS;
        if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
        this.x = dx / R;
        this.y = -dy / R;
        this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      } else if (e.pointerId === this.lookId) {
        this.lookDx += e.clientX - this.lookX;
        this.lookDy += e.clientY - this.lookY;
        this.lookX = e.clientX;
        this.lookY = e.clientY;
      }
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.stickId) {
        this.stickId = -1;
        this.x = this.y = 0;
        this.stick.classList.remove('on');
      }
      if (e.pointerId === this.lookId) this.lookId = -1;
    };
    on(window, 'pointerup', end);
    on(window, 'pointercancel', end);

    for (const btn of root.querySelectorAll<HTMLElement>('.tb')) {
      const kind = btn.dataset.t;
      const set = (v: boolean) => {
        btn.classList.toggle('down', v);
        if (kind === 'jump') { this.jump = v; if (v) this.jumpQueued = true; }
        if (kind === 'attack') this.attack = v;
        if (kind === 'block') this.block = v;
        if (kind === 'interact' && v) this.interactQueued = true;
        if (kind === 'pause' && v) onPause();
      };
      on(btn, 'pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); btn.setPointerCapture?.(e.pointerId); set(true); });
      on(btn, 'pointerup', () => set(false));
      on(btn, 'pointercancel', () => set(false));
      on(btn, 'contextmenu', (e) => e.preventDefault());
    }
  }

  takeJump(): boolean {
    const v = this.jumpQueued;
    this.jumpQueued = false;
    return v;
  }

  takeInteract(): boolean {
    const v = this.interactQueued;
    this.interactQueued = false;
    return v;
  }

  takeLook(): [number, number] {
    const r: [number, number] = [this.lookDx, this.lookDy];
    this.lookDx = this.lookDy = 0;
    return r;
  }

  reset(): void {
    this.x = this.y = 0;
    this.jump = this.attack = this.block = false;
    this.stickId = this.lookId = -1;
    this.stick.classList.remove('on');
    for (const b of this.root.querySelectorAll('.tb')) b.classList.remove('down');
  }

  dispose(): void {
    this.reset();
    for (const c of this.cleanup) c();
  }
}
