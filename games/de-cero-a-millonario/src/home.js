// Casita propia: compra, muebles colocados, modo decoración (mover, girar,
// confirmar, cancelar, recolocar y guardar) y cosas que se pueden usar:
// televisión, lámparas, sentarse, cama, ordenador y altavoz.
import * as THREE from "three";
import { FURNITURE, HOME, DAY_SECONDS } from "./config.js";
import { furnitureModel } from "./furniture.js";
import { STARTER_LAYOUT, footprint } from "./homelayout.js";

export class Home {
  constructor(game) {
    this.game = game;
    this.items = []; // { item, model, collider }
    this.deco = null;
    this.tvs = [];
    // Dos luces reutilizables para las lámparas encendidas (sin cambiar el
    // número de luces de la escena, que obligaría a recompilar).
    this.lights = [0, 1].map(() => {
      const l = new THREE.PointLight(0xffd8a0, 0, 6, 1.6);
      game.scene.add(l);
      return l;
    });
  }

  get state() {
    return this.game.state.home;
  }

  // Parcela del jugador: en online, la de su local; si no, la primera.
  setup(lotIndex = 0) {
    const lots = this.game.world.homeLots;
    this.lot = lots[lotIndex];
    for (const lot of lots) {
      if (lot === this.lot) continue;
      lot.building.setLocked(true, this.game.online ? "LIBRE" : "OCUPADA");
    }
    this.refresh();
  }

  // Muebles comprados que aún no están en la casa.
  stored(id) {
    const placed = this.state.layout.filter((it) => it.f === id).length;
    return (this.game.state.furniture[id] ?? 0) - placed;
  }

  // ---------- Compra de la casita ----------

  async buy() {
    const g = this.game;
    if (this.state.owned) return;
    if (g.online) {
      const r = await g.serverAction("home", {});
      if (!r.ok) return;
      g.state.home = r.home;
      g.state.furniture = r.furniture;
    } else {
      if (!g.spend(HOME.price)) return;
      this.state.owned = true;
      for (const f of HOME.starter)
        g.state.furniture[f] = (g.state.furniture[f] ?? 0) + 1;
      this.state.layout = STARTER_LAYOUT.map((it) => ({ ...it }));
    }
    this.refresh();
    g.rebuildInteractables();
    g.ui.toast(
      "🏡 ¡Ya tienes casa! Pulsa 🛋️ Decorar dentro para colocar muebles",
      "good",
    );
    g.audio.sfx("mission");
    g.player.char.playAction("cheer", 1.2);
    g.checkGoals?.();
    g.save();
  }

  // ---------- Muebles en la casa ----------

  // Vuelve a montar los muebles según el estado guardado.
  refresh() {
    const b = this.lot.building;
    for (const it of this.items) {
      b.interior.remove(it.model);
      if (it.collider) this.game.world.physics.remove(it.collider);
    }
    this.items = [];
    this.tvs = [];
    if (this.state.owned) b.setLocked(false);
    else b.setLocked(true, `SE VENDE\n$${HOME.price}`);
    if (!this.state.owned) return;
    for (const item of this.state.layout) this.items.push(this.mount(b, item));
    this.syncLamps();
  }

  mount(b, item) {
    const def = FURNITURE[item.f];
    const model = furnitureModel(item.f);
    b.place(model, item.x, item.z, (item.r * Math.PI) / 2, 0.12);
    b.interior.add(model);
    let collider = null;
    if (!def.flat && !def.wall) {
      const fp = footprint(item);
      collider = b.addLocalCollider(
        (fp[0] + fp[2]) / 2,
        (fp[1] + fp[3]) / 2,
        fp[2] - fp[0],
        fp[3] - fp[1],
        "mueble",
      );
    }
    if (def.use === "tv") this.tvs.push({ item, model });
    return { item, model, collider };
  }

  // Punto de uso delante de un mueble (mundo).
  usePoint(item) {
    const def = FURNITURE[item.f];
    const reach = def.size[1] / 2 + 0.55;
    const a = (item.r * Math.PI) / 2;
    return this.lot.building.toWorld(
      item.x + Math.sin(a) * reach,
      item.z + Math.cos(a) * reach,
    );
  }

  // ---------- Interacciones ----------

  interactables() {
    const g = this.game;
    const list = [];
    for (const lot of g.world.homeLots) {
      list.push({
        ...lot.door,
        radius: 1.8,
        label: () => {
          if (lot !== this.lot) {
            const owner = g.online?.homeOwner?.(lot.index);
            return {
              text: owner
                ? `🏡 Casa de ${owner.name}`
                : "🏡 Casita de un vecino",
              enabled: false,
            };
          }
          if (this.state.owned)
            return { text: "🏡 ENTRAR A CASA", enabled: false };
          return {
            text: `🏡 Comprar esta casita · $${HOME.price} (con muebles básicos)`,
            enabled: g.state.money >= HOME.price,
          };
        },
        action: () => {
          if (lot === this.lot && !this.state.owned) this.buy();
        },
      });
    }
    return list;
  }

  // Interacciones de los muebles (se recalculan al cambiar la casa).
  furnitureInteractables() {
    const g = this.game;
    if (!this.state.owned) return [];
    const list = [];
    for (const it of this.items) {
      const def = FURNITURE[it.item.f];
      if (!def.use) continue;
      const at = this.usePoint(it.item);
      list.push({
        ...at,
        alt: this.lot.building.toWorld(it.item.x, it.item.z),
        radius: 1.1,
        label: () => this.useLabel(it),
        action: () => this.use(it),
      });
    }
    return list;
  }

  useLabel(it) {
    const def = FURNITURE[it.item.f];
    switch (def.use) {
      case "tv":
        return {
          text: it.on ? "📺 Apagar la tele" : "📺 Encender la tele",
          enabled: true,
        };
      case "lamp":
        return {
          text: it.item.on ? "💡 Apagar la lámpara" : "💡 Encender la lámpara",
          enabled: true,
        };
      case "sit":
        return {
          text: `🪑 Sentarse en ${def.name.toLowerCase()}`,
          enabled: true,
        };
      case "bed":
        return {
          text: this.game.online
            ? "🛏️ Descansar y guardar"
            : "🛏️ Dormir hasta mañana (termina el día)",
          enabled: true,
        };
      case "pc":
        return {
          text: "💻 Usar el ordenador · gestión de tus negocios",
          enabled: true,
        };
      case "music":
        return {
          text: it.on ? "🔈 Apagar la música" : "🎵 Poner música",
          enabled: true,
        };
      default:
        return null;
    }
  }

  use(it) {
    const g = this.game;
    const def = FURNITURE[it.item.f];
    if (def.use === "tv") {
      it.on = !it.on;
      if (!it.on) it.model.userData.screen.map = null;
      it.model.userData.screen.color.setHex(it.on ? 0xffffff : 0x111418);
      it.model.userData.screen.needsUpdate = true;
      g.audio.sfx("click");
    } else if (def.use === "lamp") {
      it.item.on = !it.item.on;
      this.syncLamps();
      g.audio.sfx("click");
      g.save();
    } else if (def.use === "sit") this.sit(it);
    else if (def.use === "bed") this.sleep();
    else if (def.use === "pc") g.ui.openManagement();
    else if (def.use === "music") {
      it.on = !it.on;
      g.audio.sfx(it.on ? "sparkle" : "click");
      if (it.on) g.player.char.playAction("dance", 2.5);
    }
  }

  // Sentarse: el personaje se coloca en el asiento hasta que se mueva.
  sit(it) {
    const g = this.game;
    const seat = it.model.userData.seat ?? { x: 0, z: 0, y: 0.45 };
    const a = (it.item.r * Math.PI) / 2;
    const lx = it.item.x + Math.sin(a) * seat.z + Math.cos(a) * seat.x;
    const lz = it.item.z + Math.cos(a) * seat.z - Math.sin(a) * seat.x;
    const p = this.lot.building.toWorld(lx, lz);
    const heading = this.lot.building.worldRot(a);
    g.player.sitting = {
      x: p.x,
      z: p.z,
      y: 0.12 + seat.y - 0.45,
      heading,
      back: this.usePoint(it.item),
    };
    g.audio.sfx("land");
  }

  sleep() {
    const g = this.game;
    if (g.online) return g.rest();
    g.fade(() => {
      g.state.clock = DAY_SECONDS - 0.05;
      g.advanceClock(0.1);
      g.ui.toast("😴 ¡Buenos días! Has dormido hasta la mañana", "good");
    });
  }

  // Enciende las bombillas y reparte las dos luces entre las lámparas
  // encendidas más cercanas.
  syncLamps() {
    const lit = [];
    for (const it of this.items) {
      const bulb = it.model.userData.bulb;
      if (!bulb) continue;
      bulb.emissiveIntensity = it.item.on ? 2.2 : 0.1;
      if (it.item.on) lit.push(it);
    }
    this.lit = lit;
  }

  // ---------- Cada fotograma ----------

  update(dt) {
    const g = this.game;
    if (!this.lot) return;
    const p = g.player.pos;
    const home = this.lot.building.contains(p.x, p.z, -0.5);
    // Luces de las lámparas encendidas (solo con el jugador en casa).
    const lit = home ? (this.lit ?? []) : [];
    this.lights.forEach((l, i) => {
      const it = lit[i];
      if (!it) {
        l.intensity = 0;
        return;
      }
      const w = it.model.position;
      l.position.set(w.x, (it.model.userData.lightY ?? 1.4) + 0.12, w.z);
      l.intensity = 2.2;
    });
    // Televisión encendida: dibujos animados sencillos.
    if (home) for (const tv of this.tvs) if (tv.on) this.drawTv(tv, dt);
    // Sentado: se levanta al moverse.
    const s = g.player.sitting;
    if (s) {
      const mv = g.input.moveVector();
      if (Math.hypot(mv.x, mv.y) > 0.2) {
        g.player.sitting = null;
        g.player.teleport(s.back.x, s.back.z, s.heading);
      }
    }
  }

  drawTv(tv, dt) {
    const sc = tv.model.userData.screen;
    if (!tv.canvas) {
      tv.canvas = document.createElement("canvas");
      tv.canvas.width = 128;
      tv.canvas.height = 64;
      tv.tex = new THREE.CanvasTexture(tv.canvas);
      tv.tex.colorSpace = THREE.SRGBColorSpace;
      tv.t = 0;
    }
    tv.t += dt;
    tv.acc = (tv.acc ?? 0) + dt;
    if (tv.acc < 0.1 && sc.map) return;
    tv.acc = 0;
    const ctx = tv.canvas.getContext("2d");
    const t = tv.t;
    const sky = ctx.createLinearGradient(0, 0, 0, 64);
    sky.addColorStop(0, `hsl(${(t * 20) % 360}, 80%, 65%)`);
    sky.addColorStop(1, "#ffe08a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = "#5bd47a";
    ctx.fillRect(0, 48, 128, 16);
    // Un personaje redondo que salta por la pantalla.
    const x = ((t * 40) % 160) - 16;
    const y = 40 - Math.abs(Math.sin(t * 4)) * 18;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff5a4e";
    ctx.fillRect(x - 7, y + 7, 14, 9);
    ctx.fillStyle = "#1d2b44";
    ctx.font = "bold 10px sans-serif";
    ctx.fillText("CANAL MILLONARIO", 4, 10);
    tv.tex.needsUpdate = true;
    if (sc.map !== tv.tex) {
      sc.map = tv.tex;
      sc.needsUpdate = true;
    }
  }
}
