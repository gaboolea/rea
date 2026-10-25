// Cadena de misiones: cada una comprueba condiciones reales del estado.
import { GOAL_NET_WORTH } from "./config.js";

const owns = (g, id) => g.businesses[id]?.owned;
const upg = (g, biz, id) => g.businesses[biz]?.upgrades.has(id);

export const MISSIONS = [
  {
    text: "Camina hasta tu tienda «Mi Tiendita»",
    target: (g) => g.world.buildings.tienda.doorPoint(0),
    done: (g) =>
      g.world.buildings.tienda.contains(g.player.pos.x, g.player.pos.z),
    reward: 0,
  },
  {
    text: "Ve al Mayorista y compra tus primeros 10 productos",
    target: (g) => g.world.supplierCounter,
    done: (g) => g.state.stats.unitsBought >= 10,
    reward: 10,
  },
  {
    text: "Recoge la caja en RECOGIDA y repón una estantería de tu tienda",
    target: (g) =>
      g.state.carried.length
        ? g.world.buildings.tienda.doorPoint(0)
        : g.world.pickupPoint,
    done: (g) => g.state.stats.unitsStocked >= 1,
    reward: 10,
  },
  {
    text: "Atiende la caja: completa tus primeras 5 ventas",
    target: (g) => g.businesses.tienda.registers[0]?.cashierPoint,
    done: (g) => g.state.stats.sales >= 5,
    reward: 20,
  },
  {
    text: "Gana tu primer beneficio: $40 de ganancia bruta",
    done: (g) => g.state.stats.grossProfit >= 40,
    reward: 25,
  },
  {
    text: "Abre Gestión (G) y ajusta el precio de un producto",
    done: (g) => g.state.stats.priceChanges >= 1,
    reward: 10,
  },
  {
    text: "Llega a la etapa Comerciante ($400 en ventas totales)",
    done: (g) => g.stageIndex() >= 1,
    reward: 40,
  },
  {
    text: "Compra una estantería extra (Gestión → Mejoras)",
    done: (g) => upg(g, "tienda", "estanteria1"),
    reward: 30,
  },
  {
    text: "Contrata a tu primer empleado (Gestión → Personal)",
    done: (g) =>
      Object.values(g.businesses).some((b) => b.employees.length > 0),
    reward: 50,
  },
  {
    text: "Compra un refrigerador o una segunda caja registradora",
    done: (g) => upg(g, "tienda", "refrigerador") || upg(g, "tienda", "caja2"),
    reward: 50,
  },
  {
    text: "Amplía tu negocio: derriba la pared trasera",
    done: (g) => upg(g, "tienda", "ampliacion"),
    reward: 100,
  },
  {
    text: "Llega a la etapa Empresario ($1.500 en ventas totales)",
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
    done: (g) => g.state.stats.coffeeSold >= 20,
    reward: 150,
  },
  {
    text: "Compra tu primer vehículo en el Concesionario",
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
    text: "Múdate a una casa mejor: compra la «Villa Bonita»",
    target: (g) => g.world.buildings.casagrande.doorPoint(1.4),
    done: (g) => g.state.items.casa,
    reward: 500,
  },
  {
    text: "Llega a la etapa Magnate ($8.000 en ventas totales)",
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
    done: (g) => g.netWorth() >= GOAL_NET_WORTH,
    reward: 0,
  },
];

export function checkMissions(game) {
  const s = game.state;
  while (s.mission < MISSIONS.length && MISSIONS[s.mission].done(game)) {
    const m = MISSIONS[s.mission];
    s.mission++;
    if (m.reward) game.state.money += m.reward;
    game.ui.missionComplete(m, MISSIONS[s.mission]);
    game.player.char.playAction("cheer", 0.9);
    game.save();
  }
}

export function currentMission(game) {
  return MISSIONS[game.state.mission] ?? null;
}
