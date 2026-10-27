// Pantalla de personalización: un estudio 3D con el personaje sobre un
// podio que se puede girar. Se prueban prendas reales sobre el modelo y se
// equipan (comprándolas si hace falta). Se usa desde el inicio y la Boutique.
import * as THREE from "three";
import { ToyCharacter } from "./character.js";
import {
  SLOTS,
  ITEMS,
  SKINS,
  COLORS,
  findItem,
  STARTER_ITEMS,
} from "./look.js";
import { STAGES } from "./config.js";
import { mat, mesh, cylinder } from "./gfx.js";

const $ = (id) => document.getElementById(id);
const hex = (c) => `#${c.toString(16).padStart(6, "0")}`;
const COLOR_NAMES = Object.keys(COLORS);

export class Wardrobe {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbfe9ff);
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xf3d9a4, 1.6));
    const key = new THREE.DirectionalLight(0xfff1d6, 2.2);
    key.position.set(3, 6, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xa6e3ff, 1.2);
    rim.position.set(-4, 3, -4);
    this.scene.add(rim);
    this.podium = new THREE.Group();
    this.podium.add(
      mesh(cylinder(1.25, 1.35, 0.3, 40), mat(0xffd166), 0, 0.15, 0),
    );
    this.podium.add(
      mesh(cylinder(1.05, 1.05, 0.04, 40), mat(0xfff3c4), 0, 0.31, 0),
    );
    this.scene.add(this.podium);
    const floor = mesh(
      new THREE.CircleGeometry(8, 40),
      mat(0x9fd8f5),
      0,
      0,
      0,
      false,
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    // Confeti flotante de fondo.
    this.confetti = [];
    const colors = [0xff7eb6, 0xffd23f, 0x5bd47a, 0x4f8dff, 0xff9f43];
    for (let i = 0; i < 26; i++) {
      const c = mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.02),
        mat(colors[i % 5]),
        (Math.random() - 0.5) * 7,
        Math.random() * 4,
        -2 - Math.random() * 3,
        false,
      );
      this.scene.add(c);
      this.confetti.push(c);
    }
    this.char = null;
    this.spin = 0;
    this.spinVel = 0;
    this.slot = "top";
    this.open = false;
    this.bindUi();
  }

  bindUi() {
    const view = $("wardrobe-view");
    let last = null;
    const down = (x) => (last = x);
    const move = (x) => {
      if (last === null) return;
      this.spinVel = (x - last) * 0.012;
      this.spin += this.spinVel;
      last = x;
    };
    view.addEventListener("pointerdown", (e) => down(e.clientX));
    window.addEventListener("pointermove", (e) => move(e.clientX));
    window.addEventListener("pointerup", () => (last = null));
    $("wd-prev").onclick = () => this.cycle(-1);
    $("wd-next").onclick = () => this.cycle(1);
    $("wd-equip").onclick = () => this.equip();
    $("wd-start").onclick = () => this.leave(true);
    $("wd-back").onclick = () => this.leave(false);
  }

  // from: "title" o "game" (cambia el texto del botón principal).
  show(from) {
    const g = this.game;
    this.from = from;
    this.open = true;
    this.preview = structuredClone(g.state.look);
    if (!this.char) {
      this.char = new ToyCharacter({ look: this.preview, scale: 1 });
      this.char.root.position.y = 0.33;
      this.scene.add(this.char.root);
    } else this.char.setLook(this.preview);
    this.spin = -0.35;
    $("wardrobe").hidden = false;
    $("wd-start").textContent =
      from === "title" ? "COMENZAR PARTIDA" : "VOLVER AL JUEGO";
    $("wd-back").hidden = from !== "title";
    this.render();
    this.resize();
  }

  hide() {
    this.open = false;
    $("wardrobe").hidden = true;
  }

  // Al salir se descartan las prendas probadas pero no equipadas.
  leave(start) {
    const g = this.game;
    g.audio.sfx("click");
    this.hide();
    g.player.char.setLook(g.state.look);
    g.onWardrobeClosed(this.from, start);
  }

  options(slot) {
    if (slot === "skin") return SKINS;
    return ITEMS[slot];
  }

  currentId(slot) {
    return slot === "skin" ? this.preview.skin : this.preview[slot].id;
  }

  cycle(step) {
    const list = this.options(this.slot);
    const idx = list.findIndex((i) => i.id === this.currentId(this.slot));
    const next = list[(idx + step + list.length) % list.length];
    this.tryOn(this.slot, next.id);
  }

  tryOn(slot, id, color) {
    if (slot === "skin") this.preview.skin = id;
    else {
      const item = findItem(slot, id);
      const prev = this.preview[slot];
      const keep = prev.color && item.colors ? prev.color : undefined;
      this.preview[slot] = {
        id,
        color: color ?? keep ?? this.game.state.look[slot]?.color ?? "rojo",
      };
    }
    this.char.setLook(this.preview);
    this.char.playAction("pose", 0.8);
    this.game.audio.sfx("click");
    this.render();
  }

  status(slot, id) {
    const g = this.game;
    const item = findItem(slot, id);
    const owned = g.state.wardrobe.includes(id);
    if (owned) return { owned: true, label: "Tuyo" };
    if (item.reward) return { locked: true, label: `🔒 ${item.reward}` };
    // La ropa se compra en las tiendas físicas; aquí solo los tonos de piel.
    if (slot !== "skin")
      return {
        locked: true,
        label: item.lux
          ? "💎 En la Galería de lujo"
          : "🛍️ En la Tienda de ropa",
      };
    if ((item.stage ?? 0) > g.stageIndex())
      return { locked: true, label: `🔒 Etapa ${STAGES[item.stage].name}` };
    return {
      price: item.price ?? 0,
      label: `$${(item.price ?? 0).toLocaleString("es")}`,
    };
  }

  async equip() {
    const g = this.game;
    const slot = this.slot;
    const id = this.currentId(slot);
    const st = this.status(slot, id);
    if (st.locked) {
      g.audio.sfx("error");
      return;
    }
    // En online la compra (o el premio ya ganado) la confirma el servidor.
    if (!st.owned || (g.online && !STARTER_ITEMS.includes(id))) {
      if (g.online) {
        if (!(await g.serverAction("clothing", { slot, id })).ok) return;
        g.audio.sfx("buy");
      } else if (!g.spend(st.price)) return;
      if (!g.state.wardrobe.includes(id)) {
        g.state.wardrobe.push(id);
        g.state.stats.clothesBought = (g.state.stats.clothesBought ?? 0) + 1;
        g.ui.toast(`¡Nueva prenda: ${findItem(slot, id).name}!`, "good");
      }
    }
    if (slot === "skin") g.state.look.skin = id;
    else g.state.look[slot] = { ...this.preview[slot] };
    g.player.char.setLook(g.state.look);
    g.net?.send("look", { look: g.state.look });
    this.char.playAction("cheer", 0.9);
    g.audio.sfx("sparkle");
    g.save();
    this.render();
  }

  render() {
    const g = this.game;
    $("wd-money").textContent =
      `$${Math.floor(g.state.money).toLocaleString("es")}`;
    $("wd-slots").innerHTML = SLOTS.map(
      (s) =>
        `<button data-slot="${s.id}" class="${s.id === this.slot ? "on" : ""}"><span>${s.icon}</span>${s.name}</button>`,
    ).join("");
    $("wd-slots")
      .querySelectorAll("[data-slot]")
      .forEach((b) => {
        b.onclick = () => {
          this.slot = b.dataset.slot;
          g.audio.sfx("click");
          this.render();
        };
      });
    const slot = this.slot;
    const list = this.options(slot);
    const id = this.currentId(slot);
    const item = findItem(slot, id);
    const idx = list.findIndex((i) => i.id === id);
    $("wd-item").textContent = item.name;
    $("wd-count").textContent = `${idx + 1} / ${list.length}`;
    const st = this.status(slot, id);
    const equipped =
      slot === "skin"
        ? g.state.look.skin === id
        : g.state.look[slot].id === id &&
          g.state.look[slot].color === this.preview[slot].color;
    const tag = $("wd-status");
    tag.textContent = equipped ? "Equipado" : st.label;
    tag.className =
      equipped || st.owned ? "tag good" : st.locked ? "tag locked" : "tag";
    const btn = $("wd-equip");
    btn.disabled = !!st.locked || equipped;
    btn.textContent = equipped
      ? "EQUIPADO"
      : st.owned
        ? "EQUIPAR"
        : st.locked
          ? st.label.replace("🔒 ", "")
          : `COMPRAR Y EQUIPAR · ${st.label}`;
    // Muestras de color (gratis) si la prenda lo admite.
    const colors = slot !== "skin" && item.colors;
    $("wd-colors").innerHTML = colors
      ? COLOR_NAMES.filter((c) => c !== "oro")
          .map(
            (c) =>
              `<button data-color="${c}" title="${c}" class="${this.preview[slot].color === c ? "on" : ""}" style="background:${hex(COLORS[c])}"></button>`,
          )
          .join("")
      : slot === "skin"
        ? SKINS.map(
            (s) =>
              `<button data-skin="${s.id}" title="${s.name}" class="${this.preview.skin === s.id ? "on" : ""}" style="background:${hex(s.color)}"></button>`,
          ).join("")
        : `<small>Esta prenda tiene un color único.</small>`;
    $("wd-colors")
      .querySelectorAll("[data-color]")
      .forEach(
        (b) => (b.onclick = () => this.tryOn(slot, id, b.dataset.color)),
      );
    const dirty = JSON.stringify(this.preview) !== JSON.stringify(g.state.look);
    const hint = document.querySelector(".wd-hint");
    hint.textContent = dirty
      ? "Pulsa EQUIPAR para quedarte lo que pruebas: al salir se descarta"
      : "Arrastra el personaje para girarlo";
    hint.classList.toggle("dirty", dirty);
    $("wd-colors")
      .querySelectorAll("[data-skin]")
      .forEach((b) => (b.onclick = () => this.tryOn("skin", b.dataset.skin)));
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // El panel tapa parte de la pantalla: se desplaza la vista para que el
    // personaje quede a la derecha (horizontal) o arriba (vertical).
    const wide = w > h * 1.1;
    this.camera.position.set(0, 1.3, wide ? 5.4 : 10.2);
    this.camera.lookAt(0, wide ? 0.95 : 1.05, 0);
    if (wide) this.camera.setViewOffset(w, h, -w * 0.17, 0, w, h);
    else this.camera.setViewOffset(w, h, 0, h * 0.24, w, h);
    this.podium.position.x = 0;
  }

  update(dt, time) {
    if (!this.open) return;
    this.spinVel *= 0.92;
    this.spin += this.spinVel * 0.2 + dt * 0.15;
    this.char.root.rotation.y = this.spin;
    this.char.animate(dt, 0);
    for (const [i, c] of this.confetti.entries()) {
      c.position.y -= dt * (0.3 + (i % 3) * 0.1);
      c.rotation.x += dt * 2;
      c.rotation.y += dt * 1.3;
      if (c.position.y < 0) c.position.y = 4.5;
    }
    void time;
  }
}
