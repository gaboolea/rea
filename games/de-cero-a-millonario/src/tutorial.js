// Tutorial de los primeros minutos: ocho pasos cortos y visuales (icono,
// frase breve y flecha en el mundo) que enseñan el ciclo completo de la
// tienda. Cada paso se celebra; al final se presenta la automatización.
// Se puede saltar y no se repite: state.tutorial.inicio = paso | "hecho" |
// "saltado". Mientras dura, las misiones esperan (ver missions.js).
import { finishTutorialMissions } from "./missions.js";

const $ = (id) => document.getElementById(id);

const inShop = (g) => {
  const p = g.player.pos;
  return g.businesses.tienda.building.contains(p.x, p.z);
};

// Estantería que se puede reponer con lo que llevas (o el almacén).
function stockTarget(g) {
  const shop = g.businesses.tienda;
  const box = g.state.carried.find((b) => !b.unpaid);
  const product = box?.product ?? shop.bestStorageProduct();
  const spot = product
    ? shop.displays.find(
        (d) =>
          d.display.accepts(product) && d.display.stock < d.display.capacity,
      )
    : null;
  if (box && spot) return { ...spot.approach, label: "Estantería" };
  return { ...shop.storagePoint, label: "Almacén" };
}

export const TUTORIAL_STEPS = [
  {
    icon: "🏪",
    text: "Esta es tu tienda. ¡Entra!",
    target: (g) => ({
      ...g.businesses.tienda.building.doorPoint(-1),
      label: "Mi tienda",
      building: g.businesses.tienda.building,
    }),
    done: (g) => inShop(g),
  },
  {
    icon: "🏭",
    text: "Ve al Mayorista a comprar",
    target: (g) => ({
      ...g.world.buildings.mayorista.doorPoint(1),
      label: "Mayorista",
      building: g.world.buildings.mayorista,
    }),
    done: (g) => {
      const p = g.player.pos;
      return g.world.buildings.mayorista.contains(p.x, p.z);
    },
  },
  {
    icon: "🛒",
    text: "Coge un carro y mete cajas",
    target: (g) =>
      g.state.cart
        ? { ...g.world.warehouseSpots.racks[0], label: "Cajas" }
        : { ...g.world.cartPoint, label: "Carros" },
    done: (g) => g.state.carried.some((b) => b.unpaid),
  },
  {
    icon: "💵",
    text: "Paga en la CAJA",
    target: (g) => ({ ...g.world.supplierCounter, label: "CAJA" }),
    done: (g, d) => d("unitsBought") > 0,
  },
  {
    icon: "🏠",
    text: "Vuelve a tu tienda",
    target: (g) => ({
      ...g.businesses.tienda.building.doorPoint(0),
      label: "Mi tienda",
      building: g.businesses.tienda.building,
    }),
    done: (g) => inShop(g),
  },
  {
    icon: "📦",
    text: "Repón las estanterías",
    target: stockTarget,
    done: (g, d) => d("unitsStocked") > 0,
  },
  {
    icon: "🙋",
    text: "¡Llegan clientes! Espera a que elijan",
    target: (g) => ({
      ...g.businesses.tienda.registers[0].cashierPoint,
      label: "Caja",
    }),
    done: (g, d) =>
      d("sales") > 0 ||
      g.businesses.tienda.registers.some((r) => r.queue[0]?.ready),
  },
  {
    icon: "💰",
    text: "Cobra en la caja (E)",
    target: (g) => ({
      ...g.businesses.tienda.registers[0].cashierPoint,
      label: "Cobrar",
    }),
    done: (g, d) => d("sales") > 0,
  },
];

// Pequeña recompensa de cada paso (solo sin conexión: en online el dinero
// lo da el servidor con las misiones).
const STEP_REWARD = 3;

export class Tutorial {
  constructor(game) {
    this.game = game;
    this.base = null;
  }

  get step() {
    const v = this.game.state.tutorial.inicio;
    return typeof v === "number" ? v : -1;
  }

  set step(v) {
    this.game.state.tutorial.inicio = v;
    this.base = { ...this.game.state.stats };
    this.render();
  }

  active() {
    return this.step >= 0 && this.step < TUTORIAL_STEPS.length;
  }

  // Partida nueva: empieza. Partidas guardadas de antes del tutorial (con
  // misiones o ventas hechas) lo dan por visto.
  begin() {
    const s = this.game.state;
    if (s.tutorial.inicio !== undefined) return this.render();
    if (s.mission > 0 || s.stats.sales > 0) {
      s.tutorial.inicio = "hecho";
      return this.render();
    }
    this.step = 0;
  }

  // Repetirlo desde el menú de Ayuda (sin recompensas de nuevo).
  restart() {
    this.replay = true;
    this.step = 0;
  }

  target() {
    if (!this.active() || this.game.mode !== "play") return null;
    return TUTORIAL_STEPS[this.step].target(this.game);
  }

  update() {
    if (!this.active()) return;
    const g = this.game;
    const s = g.state;
    this.base ??= { ...s.stats };
    const d = (k) => (s.stats[k] ?? 0) - (this.base[k] ?? 0);
    if (!TUTORIAL_STEPS[this.step].done(g, d)) return;
    this.celebrate(this.step);
    this.step = this.step + 1;
    if (!this.active()) this.finish();
  }

  // Sonido, «+$» y, en la primera venta, confeti en la caja.
  celebrate(index) {
    const g = this.game;
    g.audio.sfx("sparkle");
    g.player.char.playAction("cheer", 0.6);
    if (!g.online && !this.replay) {
      g.state.money += STEP_REWARD;
      g.ui.floatMoney(STEP_REWARD);
    }
    if (index === TUTORIAL_STEPS.length - 1) {
      const reg = g.businesses.tienda.registers[0];
      g.fx.confetti({ ...reg.cashierPoint, y: 1.6 }, 80);
      g.audio.sfx("mission");
    }
  }

  finish() {
    const g = this.game;
    g.state.tutorial.inicio = "hecho";
    this.render();
    finishTutorialMissions(g);
    g.save();
    if (!this.replay) g.ui.openAutomationIntro();
    this.replay = false;
  }

  skip() {
    const g = this.game;
    g.state.tutorial.inicio = "saltado";
    this.render();
    finishTutorialMissions(g);
    g.ui.toast("Tutorial saltado · puedes repetirlo en Menú → Ayuda", "event");
    g.save();
  }

  render() {
    const card = $("tutorial-card");
    if (!this.active()) {
      card.hidden = true;
      $("objective").hidden = false;
      return;
    }
    // El tutorial sustituye al objetivo mientras dura.
    $("objective").hidden = true;
    card.hidden = false;
    const st = TUTORIAL_STEPS[this.step];
    card.querySelector(".tut-icon").textContent = st.icon;
    card.querySelector(".tut-text").textContent = st.text;
    card.querySelector(".tut-count").textContent =
      `${this.step + 1}/${TUTORIAL_STEPS.length}`;
    card.querySelector(".tut-dots").innerHTML = TUTORIAL_STEPS.map(
      (_, i) =>
        `<i class="${i < this.step ? "done" : i === this.step ? "now" : ""}"></i>`,
    ).join("");
    card.classList.remove("pop");
    void card.offsetWidth;
    card.classList.add("pop");
  }
}
