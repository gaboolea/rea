// Tutorial del Mayorista: seis pasos cortos con marcador en el mundo. El
// progreso se guarda (state.tutorial.mayorista) y se puede repetir desde
// el menú de Ayuda.
const $ = (id) => document.getElementById(id);

export const WHOLESALE_STEPS = [
  "Toma un carro a la izquierda de la entrada",
  "Ve a una estantería del fondo y mete cajas con +",
  "Lleva tu compra a la CAJA y paga",
  "Sal por la puerta con tu compra",
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
        return { ...w.cartPoint, label: "Carros" };
      case 1:
        return { ...w.warehouseSpots.racks[0], label: "Estantería" };
      case 2:
        return { ...w.supplierCounter, label: "CAJA · pagar" };
      case 3:
        return { ...w.warehouseExit, label: "Salida" };
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
    const d = (k) => (s.stats[k] ?? 0) - (this.base[k] ?? 0);
    const inWarehouse = g.world.buildings.mayorista.contains(p.x, p.z);
    const done = [
      () => s.cart || s.carried.length > 0,
      () => s.carried.some((b) => b.unpaid) || d("unitsBought") > 0,
      () => d("unitsBought") > 0,
      () => !inWarehouse,
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
