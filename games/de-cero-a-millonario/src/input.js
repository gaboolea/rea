// Entrada unificada: teclado + ratón en ordenador; joystick virtual,
// botones y arrastre de cámara en pantallas táctiles.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set(); // pulsaciones de este fotograma
    this.look = { dx: 0, dy: 0, zoom: 0 };
    this.joy = { x: 0, y: 0, active: false };
    this.touchRun = false;
    this.enabled = true;
    this.isTouch =
      matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement || e.defaultPrevented) return;
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if (
        [
          " ",
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
          "tab",
        ].includes(k)
      )
        e.preventDefault();
    });
    window.addEventListener("keyup", (e) =>
      this.keys.delete(e.key.toLowerCase()),
    );
    window.addEventListener("blur", () => this.keys.clear());
    this.bindMouse(canvas);
    this.bindTouch(canvas);
  }

  bindMouse(canvas) {
    let dragging = false;
    let last = null;
    canvas.addEventListener("mousedown", (e) => {
      dragging = true;
      last = [e.clientX, e.clientY];
    });
    window.addEventListener("mouseup", () => (dragging = false));
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      this.look.dx += e.clientX - last[0];
      this.look.dy += e.clientY - last[1];
      last = [e.clientX, e.clientY];
    });
    canvas.addEventListener(
      "wheel",
      (e) => {
        this.look.zoom += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false },
    );
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  // Joystick dinámico: aparece donde el pulgar toca la mitad izquierda.
  bindTouch(canvas) {
    const zone = document.getElementById("joy-zone");
    const base = document.getElementById("joystick");
    const knob = document.getElementById("joystick-knob");
    let joyId = null;
    let center = null;
    const lookTouches = new Map();
    zone.addEventListener(
      "touchstart",
      (e) => {
        const t = e.changedTouches[0];
        joyId = t.identifier;
        center = [t.clientX, t.clientY];
        const zr = zone.getBoundingClientRect();
        base.style.left = `${t.clientX - zr.left}px`;
        base.style.top = `${t.clientY - zr.top}px`;
        base.classList.add("active");
        this.updateJoy(t, center, knob);
        e.preventDefault();
      },
      { passive: false },
    );
    window.addEventListener(
      "touchmove",
      (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier === joyId) this.updateJoy(t, center, knob);
          else if (lookTouches.has(t.identifier)) {
            const [lx, ly] = lookTouches.get(t.identifier);
            this.look.dx += (t.clientX - lx) * 1.2;
            this.look.dy += (t.clientY - ly) * 1.2;
            lookTouches.set(t.identifier, [t.clientX, t.clientY]);
          }
        }
      },
      { passive: true },
    );
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) {
          joyId = null;
          this.joy = { x: 0, y: 0, active: false };
          knob.style.transform = "translate(-50%, -50%)";
          base.classList.remove("active");
          base.style.left = "";
          base.style.top = "";
        }
        lookTouches.delete(t.identifier);
      }
    };
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
    canvas.addEventListener(
      "touchstart",
      (e) => {
        for (const t of e.changedTouches)
          lookTouches.set(t.identifier, [t.clientX, t.clientY]);
      },
      { passive: true },
    );
    const hold = (id, on, off) => {
      const el = document.getElementById(id);
      el.addEventListener(
        "touchstart",
        (e) => {
          on();
          el.classList.add("held");
          e.preventDefault();
        },
        { passive: false },
      );
      el.addEventListener("touchend", () => {
        off?.();
        el.classList.remove("held");
      });
      el.addEventListener("mousedown", on);
      el.addEventListener("mouseup", () => off?.());
    };
    hold("btn-interact", () => this.pressed.add("e"));
    hold("btn-jump", () => this.pressed.add(" "));
    hold("btn-run", () => {
      this.touchRun = !this.touchRun;
      document.getElementById("btn-run").classList.toggle("on", this.touchRun);
    });
    hold("btn-ride", () => this.pressed.add("v"));
  }

  updateJoy(t, center, knob) {
    const max = 44;
    let dx = t.clientX - center[0];
    let dy = t.clientY - center[1];
    const len = Math.hypot(dx, dy);
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    this.joy = { x: dx / max, y: dy / max, active: true };
  }

  // Vector de movimiento (x: derecha, y: adelante) en [-1, 1].
  moveVector() {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = 0;
    let y = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) y += 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) y -= 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) x -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) x += 1;
    if (this.joy.active) {
      x += this.joy.x;
      y -= this.joy.y;
    }
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }

  running() {
    const held = this.keys.has("shift") || this.touchRun;
    return this.settings?.alwaysRun ? !held : held;
  }

  consume(key) {
    const had = this.pressed.has(key);
    this.pressed.delete(key);
    return had;
  }

  endFrame() {
    this.pressed.clear();
    this.look.dx = 0;
    this.look.dy = 0;
    this.look.zoom = 0;
  }
}
