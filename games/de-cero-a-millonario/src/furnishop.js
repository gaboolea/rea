// Compra de muebles y aparatos en las tiendas físicas: examinar el
// expuesto, comprar (el servidor valida en online) y guardarlo en el
// inventario. Nunca se coloca solo: se pone en casa con «Decorar».
import { FURNITURE, FURNITURE_MAX, STAGES } from "./config.js";
import { findSpot } from "./homelayout.js";

export class FurnitureShop {
  constructor(game) {
    this.game = game;
  }

  interactables() {
    const list = [];
    for (const store of Object.values(this.game.world.stores ?? {}))
      for (const s of store.spots ?? []) {
        if (s.kind !== "furniture") continue;
        list.push({
          x: s.x,
          z: s.z,
          radius: 0.9,
          label: () => {
            const def = FURNITURE[s.id];
            const verb =
              def.section === "tecnologia"
                ? "EXAMINAR PRODUCTO"
                : "COMPRAR MUEBLE";
            return {
              text: `${verb} · ${def.name} · $${def.price}`,
              enabled: true,
            };
          },
          action: () => this.examine(s),
        });
      }
    return list;
  }

  examine(spot) {
    const g = this.game;
    const c = spot.center;
    const dx = spot.x - c.x;
    const dz = spot.z - c.z;
    const d = Math.hypot(dx, dz) || 1;
    const far = spot.span;
    g.examineObject(
      { x: c.x, y: c.y, z: c.z },
      {
        x: c.x + (dx / d) * far + (dz / d) * far * 0.35,
        y: c.y + far * 0.55,
        z: c.z + (dz / d) * far - (dx / d) * far * 0.35,
      },
    );
    g.ui.openFurniture(this, spot.id);
  }

  // Cuántos tiene (colocados + guardados) y si puede comprar otro.
  status(id) {
    const g = this.game;
    const def = FURNITURE[id];
    const have = g.state.furniture[id] ?? 0;
    const home = g.state.home;
    if (!home.owned)
      return {
        have,
        locked: "Necesitas casa: compra la casita en la zona residencial",
      };
    if ((def.stage ?? 0) > g.stageIndex())
      return { have, locked: `Requiere la etapa ${STAGES[def.stage].name}` };
    if (have >= FURNITURE_MAX)
      return { have, locked: `Ya tienes ${FURNITURE_MAX}` };
    // No se vende lo que no se podría colocar: debe caber en la casa tal
    // como está ahora.
    if (!findSpot(home.layout, id))
      return {
        have,
        locked: "No cabe en tu casa: guarda o mueve algún mueble primero",
      };
    return {
      have,
      price: def.price,
      missing: Math.max(0, def.price - g.state.money),
    };
  }

  async buy(id) {
    const g = this.game;
    const st = this.status(id);
    if (st.locked) return false;
    if (g.online) {
      const r = await g.serverAction("furniture", { id });
      if (!r.ok) return false;
      g.state.furniture = r.furniture;
    } else {
      if (!g.spend(st.price)) return false;
      g.state.furniture[id] = st.have + 1;
    }
    g.ui.toast(
      `📦 ${FURNITURE[id].name} guardado en tu inventario. Colócalo en casa con 🛋️ Decorar`,
      "good",
    );
    g.audio.sfx("buy");
    g.goals.check();
    g.save();
    return true;
  }
}
