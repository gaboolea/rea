// Gimnasio y objetivos opcionales de la expansión.
import { GYM, GOALS, goalProgress } from "./config.js";

// Entrenamiento: se paga en el mostrador del gimnasio (el servidor cobra
// en online) y da velocidad extra a pie durante GYM.seconds.
export class Gym {
  constructor(game) {
    this.game = game;
  }

  interactables() {
    const g = this.game;
    const spots = g.world.stores?.gimnasio?.spots ?? [];
    return spots.map((s) => ({
      x: s.x,
      z: s.z,
      radius: 1.3,
      label: () => {
        const left = (g.buff?.until ?? 0) - g.elapsed;
        if (left > 0)
          return {
            text: `💪 Ya estás en forma (${Math.ceil(left)} s)`,
            enabled: false,
          };
        return {
          text: `🏋️ ENTRENAR · $${GYM.price}: +${Math.round((GYM.boost - 1) * 100)}% velocidad ${GYM.seconds / 60} min`,
          enabled: g.state.money >= GYM.price,
        };
      },
      action: () => this.train(),
    }));
  }

  async train() {
    const g = this.game;
    if (g.online) {
      if (!(await g.serverAction("gym", {})).ok) return;
    } else if (!g.spend(GYM.price)) return;
    g.fade(() => {
      g.buff = { until: g.elapsed + GYM.seconds };
      g.player.char.playAction("cheer", 1.2);
      g.ui.toast(
        `💪 ¡Entrenamiento hecho! Corres un ${Math.round((GYM.boost - 1) * 100)}% más rápido`,
        "good",
      );
      g.ui.refreshHud(true);
    });
  }
}

// Objetivos: se cobran solos al cumplirse, una sola vez cada uno.
export class Goals {
  constructor(game) {
    this.game = game;
    this.pending = new Set();
  }

  progress(goal) {
    return goalProgress(goal.id, this.game.state);
  }

  claimed(goal) {
    return this.game.state.goals.includes(goal.id);
  }

  async check() {
    const g = this.game;
    for (const goal of GOALS) {
      if (this.claimed(goal) || this.pending.has(goal.id)) continue;
      if (!this.progress(goal).done) continue;
      this.pending.add(goal.id);
      let ok = true;
      if (g.online)
        ok = (await g.serverAction("goal", { id: goal.id }, true)).ok;
      else g.state.money += goal.reward;
      this.pending.delete(goal.id);
      if (!ok || this.claimed(goal)) continue;
      g.state.goals.push(goal.id);
      g.ui.toast(
        `🏆 Objetivo cumplido: ${goal.name} (+$${goal.reward})`,
        "good",
      );
      g.audio.sfx("sparkle");
      g.save();
    }
  }
}
