// Compra de ropa en las tiendas físicas: ver la prenda puesta en el propio
// personaje, probarla (mientras sigas dentro de la tienda), comprarla o
// cancelar. La ropa comprada va al armario y se puede equipar luego.
import { findItem, COLORS } from "./look.js";
import { STAGES } from "./config.js";
import { displayColor } from "./stores/clothing.js";

export class Shopping {
  constructor(game) {
    this.game = game;
    // Prueba en curso: { slot, id, color, prev (look anterior), building }.
    this.trial = null;
  }

  // Puntos «VER PRENDA» y probadores de todas las tiendas de ropa.
  interactables() {
    const g = this.game;
    const list = [];
    for (const [storeId, store] of Object.entries(g.world.stores ?? {})) {
      if (!store.spots?.some((s) => s.kind === "clothes")) continue;
      const building = g.world.buildings[storeId];
      for (const s of store.spots) {
        list.push({
          x: s.x,
          z: s.z,
          radius: 0.95,
          label: () => this.label(s.slot, s.id),
          action: () => this.open(s.slot, s.id, building),
        });
      }
      for (const f of store.fitting ?? [])
        list.push({
          x: f.x,
          z: f.z,
          radius: 1.2,
          label: () => ({
            text: "PROBADOR · cambiarte con tu ropa",
            enabled: true,
          }),
          action: () => {
            this.revert();
            g.openWardrobe("game");
          },
        });
    }
    return list;
  }

  label(slot, id) {
    const g = this.game;
    const item = findItem(slot, id);
    if (g.state.wardrobe.includes(id))
      return { text: `VER PRENDA · ${item.name} (ya es tuya)`, enabled: true };
    const price = item.price ? `$${item.price.toLocaleString("es")}` : "gratis";
    return { text: `VER PRENDA · ${item.name} · ${price}`, enabled: true };
  }

  status(slot, id) {
    const g = this.game;
    const item = findItem(slot, id);
    if (g.state.wardrobe.includes(id)) return { owned: true };
    if ((item.stage ?? 0) > g.stageIndex())
      return { locked: `Requiere la etapa ${STAGES[item.stage].name}` };
    const missing = Math.max(0, (item.price ?? 0) - g.state.money);
    return { price: item.price ?? 0, missing };
  }

  // Abre la ficha: la prenda se pone en el personaje como vista previa.
  open(slot, id, building, color) {
    const g = this.game;
    const item = findItem(slot, id);
    const prev = this.trial?.prev ?? structuredClone(g.state.look);
    const chosen =
      color ??
      (this.trial?.slot === slot && this.trial?.id === id
        ? this.trial.color
        : null) ??
      (g.state.look[slot]?.id === id ? g.state.look[slot].color : null) ??
      displayColor(item);
    this.trial = { slot, id, color: chosen, prev, building };
    this.applyTrial();
    g.player.char.playAction("pose", 1.2);
    g.examinePlayer();
    g.ui.openGarment(this, slot, id);
  }

  applyTrial() {
    const g = this.game;
    const t = this.trial;
    if (!t) return;
    const look = structuredClone(t.prev);
    look[t.slot] = { id: t.id, ...(t.color ? { color: t.color } : {}) };
    g.player.char.setLook(look);
  }

  setColor(color) {
    if (!this.trial || !COLORS[color]) return;
    this.trial.color = color;
    this.applyTrial();
    this.game.player.char.playAction("pose", 0.8);
  }

  // Quitarse la prenda de prueba (vuelve la ropa de antes).
  revert(message) {
    const g = this.game;
    if (!this.trial) return;
    this.trial = null;
    g.player.char.setLook(g.state.look);
    if (message) g.ui.toast(message);
  }

  // Comprar y ponérsela.
  async buy() {
    const g = this.game;
    const t = this.trial;
    if (!t) return false;
    const st = this.status(t.slot, t.id);
    if (st.locked) return false;
    if (!st.owned) {
      if (g.online) {
        if (!(await g.serverAction("clothing", { slot: t.slot, id: t.id })).ok)
          return false;
      } else if (!g.spend(st.price)) return false;
      g.state.wardrobe.push(t.id);
      g.state.stats.clothesBought = (g.state.stats.clothesBought ?? 0) + 1;
      g.audio.sfx("buy");
      g.ui.toast(
        `🛍️ ¡${findItem(t.slot, t.id).name} es tuya! Está en tu armario`,
        "good",
      );
    }
    this.wear();
    return true;
  }

  // Equipar la prenda (ya comprada) que se está probando.
  wear() {
    const g = this.game;
    const t = this.trial;
    g.state.look[t.slot] = { id: t.id, ...(t.color ? { color: t.color } : {}) };
    this.trial = null;
    g.player.char.setLook(g.state.look);
    g.net?.send("look", { look: g.state.look });
    g.player.char.playAction("cheer", 0.9);
    g.audio.sfx("sparkle");
    g.checkGoals?.();
    g.save();
  }

  // Si sales de la tienda con una prenda sin pagar, te la quitas.
  update() {
    const t = this.trial;
    if (!t || this.game.ui.panelOpen) return;
    const p = this.game.player.pos;
    if (!t.building.contains(p.x, p.z))
      this.revert("Dejaste la prenda de prueba en la tienda");
  }
}
