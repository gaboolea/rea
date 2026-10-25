// Tutorial del Mayorista: seis pasos cortos con marcador en el mundo. El
// progreso se guarda (state.tutorial.mayorista) y se puede repetir desde
// el menú de Ayuda.
const $ = (id) => document.getElementById(id);

export const WHOLESALE_STEPS = [
  "Acércate al mostrador A · PEDIR MERCADERÍA",
  "Elige tus productos con + y −",
  "Confirma el pedido con COMPRAR",
  "Recoge las cajas en la zona B · RECOGER PEDIDO",
  "Lleva la mercadería a tu tienda",
  "Coloca los productos en las estanterías",
];

export class Tutorial {
  constructor(game) {
    this.game = game;
    this.base = null;
  }

  get step() {
    return this.game.state.tutorial.mayorista ?? -1;
  }

  set step(v) {
    this.game.state.tutorial.mayorista = v;
    this.base = { ...this.game.state.stats };
    this.render();
  }

  active() {
    return this.step >= 0 && this.step < WHOLESALE_STEPS.length;
  }

  start() {
    this.step = 0;
  }

  // Marcador del paso actual (posición real del objetivo).
  target() {
    if (!this.active() || this.game.mode !== "play") return null;
    const g = this.game;
    const w = g.world;
    const shop = g.businesses.tienda;
    switch (this.step) {
      case 0:
      case 1:
      case 2:
        return { ...w.supplierCounter, label: "Pedir mercadería" };
      case 3:
        return { ...w.pickupPoint, label: "Recoger pedido" };
      case 4:
        return {
          ...shop.building.doorPoint(1.2),
          label: "Mi tienda",
          building: shop.building,
        };
      default: {
        const box = g.state.carried[0];
        const spot = box
          ? shop.displays.find(
              (d) =>
                d.display.accepts(box.product) &&
                d.display.stock < d.display.capacity,
            )
          : null;
        return spot
          ? { ...spot.approach, label: "Estantería" }
          : { ...shop.storagePoint, label: "Almacén" };
      }
    }
  }

  update() {
    const g = this.game;
    const s = g.state;
    if (!this.active()) {
      // Empieza solo la primera vez que entras al Mayorista.
      if (
        s.tutorial.mayorista === undefined &&
        g.world.buildings.mayorista.contains(g.player.pos.x, g.player.pos.z)
      )
        this.start();
      return;
    }
    this.base ??= { ...s.stats };
    const p = g.player.pos;
    const near = (t, r) => Math.hypot(t.x - p.x, t.z - p.z) < r;
    const d = (k) => (s.stats[k] ?? 0) - (this.base[k] ?? 0);
    const done = [
      () => near(g.world.supplierCounter, 2.6),
      () =>
        Object.values(g.ui.order).some((n) => n > 0) ||
        s.pendingPickup.length > 0 ||
        s.pickup.length > 0,
      () =>
        s.pendingPickup.length > 0 ||
        s.pickup.length > 0 ||
        s.carried.length > 0,
      () => s.carried.length > 0,
      () => g.businesses.tienda.building.contains(p.x, p.z),
      () => d("unitsStocked") + d("unitsStored") > 0,
    ][this.step];
    if (done()) {
      g.audio.sfx("sparkle");
      this.step = this.step + 1;
      if (!this.active())
        g.ui.toast("🎉 ¡Tutorial del Mayorista completado!", "good");
    }
  }

  render() {
    const card = $("tutorial-card");
    if (!this.active()) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    card.querySelector("ol").innerHTML = WHOLESALE_STEPS.map(
      (t, i) =>
        `<li class="${i < this.step ? "done" : i === this.step ? "now" : ""}">${t}</li>`,
    ).join("");
    card.querySelector(".tut-count").textContent =
      `${this.step + 1}/${WHOLESALE_STEPS.length}`;
  }

  skip() {
    this.step = WHOLESALE_STEPS.length;
  }
}
