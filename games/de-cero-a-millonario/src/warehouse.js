// Mayorista vivo: existencias disponibles por producto y operarios que
// reponen las estanterías de las que los clientes cogen cajas.
import { Agent } from "./npc.js";
import { ToyCharacter } from "./character.js";
import { workerLook } from "./look.js";
import { PRODUCTS, CATEGORIES } from "./config.js";

export const WAREHOUSE_MAX = 30; // cajas por producto
const REGEN_SECONDS = 20;

const CAT_INDEX = Object.keys(CATEGORIES);

export class Warehouse {
  constructor(game) {
    this.game = game;
    this.regen = 0;
    const spots = game.world.warehouseSpots;
    this.workers = ["naranja", "amarillo"].map((color, i) => {
      const start = spots.racks[i * 2];
      const a = new Agent(
        game,
        new ToyCharacter({ look: workerLook(color), apron: 0x3e4a59 }),
        start.x,
        start.z,
      );
      a.speed = 1.8;
      a.busy = false;
      a.idleT = i * 2;
      return a;
    });
  }

  // Cajas disponibles (en online las da el servidor y son compartidas).
  available(product) {
    const net = this.game.online?.warehouseStock;
    if (net) return net[product] ?? 0;
    return this.game.state.warehouse[product] ?? WAREHOUSE_MAX;
  }

  take(product, boxes) {
    if (this.game.online) return;
    const s = this.game.state.warehouse;
    s[product] = Math.max(0, (s[product] ?? WAREHOUSE_MAX) - boxes);
  }

  // Un operario va a reponer la estantería de ese producto.
  restock(product) {
    this.toBring.push(product);
  }

  get toBring() {
    this._toBring ??= [];
    return this._toBring;
  }

  update(dt) {
    const g = this.game;
    const s = g.state;
    // Reposición lenta del almacén (modo un jugador).
    this.regen -= dt;
    if (this.regen <= 0) {
      this.regen = REGEN_SECONDS;
      for (const p of Object.keys(s.warehouse))
        s.warehouse[p] = Math.min(WAREHOUSE_MAX, s.warehouse[p] + 1);
    }
    for (const w of this.workers) this.work(w, dt);
  }

  // Operario: si alguien se llevó cajas, trae otras del palé de reposición
  // a esa estantería; si no, mueve cajas de las estanterías al palé.
  work(w, dt) {
    w.update(dt);
    if (w.busy || w.target) return;
    w.idleT -= dt;
    if (w.idleT > 0) return;
    const spots = this.game.world.warehouseSpots;
    const product = this.toBring.shift();
    const cat = product
      ? CAT_INDEX.indexOf(PRODUCTS[product].cat)
      : Math.floor(Math.random() * 5);
    const rack =
      spots.racks[Math.max(0, Math.min(spots.racks.length - 1, cat))];
    const pallet = {
      x: spots.pallet.x + (Math.random() - 0.5) * 1.4,
      z: spots.pallet.z,
    };
    const [from, to] = product ? [pallet, rack] : [rack, pallet];
    w.busy = true;
    w.moveTo(from, () => {
      w.char.playAction("pickup", 0.5);
      w.char.setCarry([product ?? "agua"]);
      w.waitTimer = 0.4;
      w.moveTo(to, () => {
        w.char.setCarry([]);
        w.char.playAction("stock", 0.5);
        w.busy = false;
        w.idleT = product ? 0.2 : 2 + Math.random() * 3;
      });
    });
  }

  positions() {
    return this.workers.map((w) => w.pos);
  }
}
