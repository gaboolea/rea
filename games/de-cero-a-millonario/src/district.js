// Acceso al distrito financiero: el cartel de las obras muestra el
// requisito y el progreso real; al cumplirlo se abre para siempre (en
// online lo valida el servidor) con un aviso y las barreras se levantan.
import { DISTRICT } from "./config.js";
import { setFinancialTraffic } from "./city/index.js";

const $ = (id) => document.getElementById(id);

export class District {
  constructor(game) {
    this.game = game;
    this.timer = 0;
    this.pending = false;
  }

  get barrier() {
    return this.game.world.expansion.financial.barrier;
  }

  get open() {
    return !!this.game.state.unlocked.financiero;
  }

  // Al cargar una partida: deja la barrera como estaba, sin aviso.
  apply() {
    if (this.open) this.openBarrier();
    this.refreshSign();
  }

  openBarrier() {
    this.barrier.open_();
    setFinancialTraffic(this.game.world, true);
    for (const poi of this.game.world.pois)
      if (poi.id === "distrito" || poi.id === "lujo") poi.locked = false;
  }

  refreshSign() {
    const sales = Math.floor(this.game.state.stats.revenue);
    this.barrier.setText(
      this.open
        ? "DISTRITO FINANCIERO\n¡ACCESO ABIERTO!"
        : `DISTRITO FINANCIERO\nACCESO BLOQUEADO\nVentas: $${Math.min(sales, DISTRICT.revenue)} / $${DISTRICT.revenue}`,
    );
  }

  interactables() {
    const b = this.barrier;
    return [
      {
        x: b.x + 3.5,
        z: 0,
        radius: 3,
        label: () =>
          this.open
            ? null
            : {
                text: `🚧 Distrito financiero: vende $${DISTRICT.revenue} en total para abrirlo (llevas $${Math.floor(this.game.state.stats.revenue)})`,
                enabled: false,
              },
        action: () => {},
      },
    ];
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.5;
    this.refreshSign();
    if (this.open || this.pending) return;
    if (this.game.state.stats.revenue >= DISTRICT.revenue) this.unlock();
  }

  async unlock() {
    const g = this.game;
    this.pending = true;
    if (g.online) {
      const r = await g.serverAction("unlock", { zone: "financiero" }, true);
      this.pending = false;
      if (!r.ok) {
        this.timer = 10; // se reintenta más tarde
        return;
      }
    }
    this.pending = false;
    g.state.unlocked.financiero = true;
    this.openBarrier();
    this.refreshSign();
    this.announce();
    g.guide.setDestination({ x: -251, z: 8, label: "Distrito financiero" });
    g.checkGoals?.();
    g.save();
  }

  // Aviso grande con efecto de monedas y fanfarria.
  announce() {
    const g = this.game;
    const el = $("unlock-banner");
    el.querySelector("b").textContent = "🏙️ ¡DISTRITO FINANCIERO DESBLOQUEADO!";
    el.querySelector("span").textContent =
      "Las obras se han retirado: sigue la avenida hacia el oeste. Allí te espera la Galería de lujo.";
    el.hidden = false;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => (el.hidden = true), 5200);
    g.audio.sfx("mission");
    g.fx.confetti({ ...g.player.pos, y: g.player.pos.y + 1.2 }, 70);
    g.player.char.playAction("cheer", 1.4);
  }
}
