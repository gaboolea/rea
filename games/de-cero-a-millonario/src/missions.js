// Cadena de misiones. Las primeras forman un tutorial práctico de un par de
// minutos; después se alternan metas cortas y objetivos de progreso. Cada
// misión comprueba condiciones reales del estado; `base` es la foto de las
// estadísticas al empezar la misión, para contar solo lo hecho desde entonces.
import { GOAL_NET_WORTH, STAGES } from "./config.js";

const owns = (g, id) => g.businesses[id]?.owned;
const upg = (g, biz, id) => g.businesses[biz]?.upgrades.has(id);
// Lugares descubiertos aparte de la propia tienda.
const placesFound = (g) =>
  g.state.discovered.filter((p) => p !== "tienda").length;
const delta = (g, base, key) => (g.state.stats[key] ?? 0) - (base[key] ?? 0);
const count = (n, max) => [Math.min(n, max), max];

export const MISSIONS = [
  {
    text: "Entra en tu tienda",
    hint: "Usa WASD o el joystick",
    target: (g) => g.world.buildings.tienda.doorPoint(-1),
    done: (g) =>
      g.world.buildings.tienda.contains(g.player.pos.x, g.player.pos.z),
    reward: 5,
  },
  {
    text: "Cobra a tu primer cliente en la caja",
    hint: "Acércate a la caja y pulsa E",
    target: (g) => g.businesses.tienda.registers[0]?.cashierPoint,
    done: (g, b) => delta(g, b, "sales") >= 1,
    reward: 10,
  },
  {
    text: "Toma una caja del ALMACÉN y repón la estantería vacía",
    hint: "E en el almacén, luego E en la estantería",
    target: (g) =>
      g.state.carried.length
        ? g.businesses.tienda.displays[2]?.approach
        : g.businesses.tienda.storagePoint,
    done: (g, b) => delta(g, b, "unitsStocked") >= 1,
    reward: 10,
  },
  {
    text: "Completa 5 ventas",
    target: (g) => g.businesses.tienda.registers[0]?.cashierPoint,
    progress: (g, b) => count(delta(g, b, "sales"), 5),
    done: (g, b) => delta(g, b, "sales") >= 5,
    reward: 15,
  },
  {
    text: "Cruza la calle y compra 2 cajas en el Mayorista",
    hint: "Toma un carro, elige en las estanterías y paga en la CAJA",
    target: (g) =>
      g.state.carried.some((b) => b.unpaid)
        ? g.world.supplierCounter
        : g.world.warehouseSpots.racks[0],
    progress: (g, b) => count(delta(g, b, "unitsBought") / 10, 2),
    done: (g, b) => delta(g, b, "unitsBought") >= 20,
    reward: 15,
  },
  {
    text: "Lleva tu mercadería a la tienda",
    hint: "Repón las estanterías o guárdala en el almacén",
    target: (g) =>
      g.state.carried.length
        ? g.world.buildings.tienda.doorPoint(0)
        : g.world.supplierCounter,
    progress: (g, b) =>
      count(
        Math.floor(
          (delta(g, b, "unitsStocked") + delta(g, b, "unitsStored")) / 10,
        ),
        2,
      ),
    done: (g, b) =>
      delta(g, b, "unitsStocked") + delta(g, b, "unitsStored") >= 20,
    reward: 15,
  },
  {
    text: "Compra una estantería extra",
    hint: "Gestión → Mejoras",
    done: (g) => upg(g, "tienda", "estanteria1"),
    reward: 20,
  },
  {
    text: "Descubre 3 lugares de la ciudad",
    hint: "Cada lugar nuevo da $10",
    progress: (g) => count(placesFound(g), 3),
    done: (g) => placesFound(g) >= 3,
    reward: 15,
  },
  {
    text: "Gana $120 de ganancia bruta",
    progress: (g, b) => count(Math.floor(delta(g, b, "grossProfit")), 120),
    done: (g, b) => delta(g, b, "grossProfit") >= 120,
    reward: 25,
  },
  {
    text: "Completa un encargo de un comerciante",
    hint: "Busca a quien tenga un «!» encima",
    target: (g) =>
      g.events.merchants.find((m) => m.request)?.char.root.position,
    done: (g) => (g.state.stats.encargos ?? 0) >= 1,
    reward: 25,
  },
  {
    text: `Llega a la etapa Comerciante ($${STAGES[1].revenue} en ventas)`,
    progress: (g) =>
      count(Math.floor(g.state.stats.revenue), STAGES[1].revenue),
    done: (g) => g.stageIndex() >= 1,
    reward: 30,
  },
  {
    text: "Contrata a tu primer empleado",
    hint: "Gestión → Personal",
    done: (g) =>
      Object.values(g.businesses).some((b) => b.employees.length > 0),
    reward: 40,
  },
  {
    text: "Estrena ropa nueva en la Boutique",
    target: (g) => g.world.boutiqueCounter,
    done: (g) => (g.state.stats.clothesBought ?? 0) >= 1,
    reward: 20,
  },
  {
    text: "Ajusta el precio de un producto",
    hint: "Gestión → Precios",
    done: (g, b) => delta(g, b, "priceChanges") >= 1,
    reward: 10,
  },
  {
    text: "Compra un refrigerador o una segunda caja",
    done: (g) => upg(g, "tienda", "refrigerador") || upg(g, "tienda", "caja2"),
    reward: 50,
  },
  {
    text: "Amplía tu negocio: derriba la pared trasera",
    done: (g) => upg(g, "tienda", "ampliacion"),
    reward: 80,
  },
  {
    text: `Llega a la etapa Empresario ($${STAGES[2].revenue.toLocaleString("es")} en ventas)`,
    progress: (g) =>
      count(Math.floor(g.state.stats.revenue), STAGES[2].revenue),
    done: (g) => g.stageIndex() >= 2,
    reward: 100,
  },
  {
    text: "Compra la cafetería «Café Aroma»",
    target: (g) => g.world.buildings.cafeteria.doorPoint(1.4),
    done: (g) => owns(g, "cafeteria"),
    reward: 150,
  },
  {
    text: "Vende 20 cafés (compra granos en el Mayorista)",
    progress: (g, b) => count(delta(g, b, "coffeeSold"), 20),
    done: (g, b) => delta(g, b, "coffeeSold") >= 20,
    reward: 120,
  },
  {
    text: "Compra tu primer vehículo",
    target: (g) => g.world.dealerCounter,
    done: (g) => g.state.items.scooter || g.state.items.furgoneta,
    reward: 100,
  },
  {
    text: "Compra tu segundo local: «Minimercado Sol»",
    target: (g) => g.world.buildings.minimercado.doorPoint(1.4),
    done: (g) => owns(g, "minimercado"),
    reward: 300,
  },
  {
    text: "Múdate a la «Villa Bonita»",
    target: (g) => g.world.buildings.casagrande.doorPoint(1.4),
    done: (g) => g.state.items.casa,
    reward: 500,
  },
  {
    text: `Llega a la etapa Magnate ($${STAGES[3].revenue.toLocaleString("es")} en ventas)`,
    progress: (g) =>
      count(Math.floor(g.state.stats.revenue), STAGES[3].revenue),
    done: (g) => g.stageIndex() >= 3,
    reward: 500,
  },
  {
    text: "Abre el supermercado «Súper Millonario»",
    target: (g) => g.world.buildings.supermercado.doorPoint(1.4),
    done: (g) => owns(g, "supermercado"),
    reward: 2000,
  },
  {
    text: `Conviértete en millonario: patrimonio de $${GOAL_NET_WORTH.toLocaleString("es")}`,
    progress: (g) => count(Math.floor(g.netWorth()), GOAL_NET_WORTH),
    done: (g) => g.netWorth() >= GOAL_NET_WORTH,
    reward: 0,
  },
];

// Misiones que cubre el tutorial de inicio (entrar, cobrar, reponer,
// ventas, Mayorista y llevar la mercadería): al acabarlo o saltarlo se dan
// por cumplidas y pagan su recompensa.
const TUTORIAL_MISSIONS = 6;

export function checkMissions(game) {
  const s = game.state;
  s.missionBase ??= { ...s.stats };
  // Mientras el tutorial guía al jugador, las misiones esperan.
  if (game.tutorial?.active()) return;
  while (
    s.mission < MISSIONS.length &&
    MISSIONS[s.mission].done(game, s.missionBase)
  )
    completeMission(game);
}

export function finishTutorialMissions(game) {
  while (game.state.mission < TUTORIAL_MISSIONS) completeMission(game);
}

function completeMission(game) {
  const s = game.state;
  const m = MISSIONS[s.mission];
  const index = s.mission;
  s.mission++;
  s.missionBase = { ...s.stats };
  if (game.online) {
    // El servidor paga la recompensa (una sola vez y en orden).
    game.net.request("mission", { index }).then((r) => {
      game.applyServerMoney(r);
      if (typeof r.mission === "number")
        s.mission = Math.max(s.mission, r.mission);
    });
    if (m.reward) game.ui.floatMoney(m.reward);
  } else if (m.reward) {
    s.money += m.reward;
    game.ui.floatMoney(m.reward);
  }
  game.ui.missionComplete(m, MISSIONS[s.mission]);
  game.audio.sfx("mission");
  game.player.char.playAction("cheer", 0.9);
  game.unlockRewards();
  game.save();
}

export function currentMission(game) {
  return MISSIONS[game.state.mission] ?? null;
}

export function missionProgress(game) {
  const m = currentMission(game);
  if (!m?.progress) return null;
  return m.progress(game, game.state.missionBase ?? game.state.stats);
}
