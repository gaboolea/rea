// Modo decoración de la casita: vista desde arriba, el mueble elegido se
// mueve con el joystick/WASD (con cuadrícula opcional), se gira, y se
// confirma o cancela. Verde = cabe; rojo = no cabe (con el motivo).
import * as THREE from "three";
import { FURNITURE } from "./config.js";
import { furnitureModel } from "./furniture.js";
import { CASITA } from "./city/residential.js";
import { footprint, placementProblem } from "./home.js";

const $ = (id) => document.getElementById(id);
const GRID = 0.25;
const SPEED = 2.4;

export class Decorator {
  constructor(game, home) {
    this.game = game;
    this.home = home;
    this.active = null; // { item, index (si se mueve uno colocado), ghost }
    this.grid = true;
    const bar = $("deco-bar");
    bar.querySelector("[data-deco=rotate]").onclick = () => this.rotate();
    bar.querySelector("[data-deco=grid]").onclick = () => this.toggleGrid();
    bar.querySelector("[data-deco=ok]").onclick = () => this.confirm();
    bar.querySelector("[data-deco=cancel]").onclick = () => this.cancel();
    bar.querySelector("[data-deco=store]").onclick = () => this.store();
  }

  get b() {
    return this.home.lot.building;
  }

  // Empieza a colocar un mueble guardado (id) o a mover uno ya colocado.
  start({ id, index }) {
    const layout = this.home.state.layout;
    const moving = index !== undefined;
    const item = moving ? { ...layout[index] } : { f: id, x: 0, z: 1.6, r: 0 };
    if (!moving && FURNITURE[id].wall)
      Object.assign(item, { x: 0, z: -0.6, r: 0 });
    if (moving) {
      // Mientras se mueve, el original desaparece de la casa.
      const it = this.home.items[index];
      this.b.interior.remove(it.model);
      if (it.collider) this.game.world.physics.remove(it.collider);
    }
    const ghost = furnitureModel(item.f);
    ghost.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.material.transparent = true;
        o.material.opacity = 0.7;
        o.castShadow = false;
      }
    });
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0x3fbf5f,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    );
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.02;
    ghost.add(base);
    this.b.interior.add(ghost);
    this.active = {
      item,
      index: moving ? index : -1,
      ghost,
      base,
      pos: { x: item.x, z: item.z },
    };
    $("deco-bar").hidden = false;
    $("deco-bar").querySelector("[data-deco=store]").hidden = !moving;
    this.game.player.char.root.visible = false;
    this.update(0);
  }

  // Vista cenital de la casa, mirando desde la puerta.
  camera() {
    const eye = this.b.toWorld(0, 5.2);
    const look = this.b.toWorld(0, -0.2);
    this.game.examine = { eye: { ...eye, y: 12.5 }, look: { ...look, y: 0 } };
  }

  update(dt) {
    const a = this.active;
    if (!a) return;
    const input = this.game.input;
    const mv = input.moveVector();
    // En pantalla: derecha = +x local, arriba = −z local (hacia el fondo).
    a.pos.x += mv.x * SPEED * dt;
    a.pos.z -= mv.y * SPEED * dt;
    a.pos.x = Math.max(-4.7, Math.min(4.7, a.pos.x));
    a.pos.z = Math.max(-4.2, Math.min(4.2, a.pos.z));
    if (input.consume("r")) this.rotate();
    if (input.consume("t")) this.toggleGrid();
    if (input.consume("e") || input.consume("enter")) return this.confirm();
    if (input.consume("escape")) return this.cancel();
    const it = a.item;
    const def = FURNITURE[it.f];
    if (def.wall) this.snapToWall(a);
    else {
      const snap = (v) => (this.grid ? Math.round(v / GRID) * GRID : v);
      it.x = snap(a.pos.x);
      it.z = snap(a.pos.z);
      // Que no se salga del interior por la huella.
      const fp = footprint(it);
      if (fp[0] < -4.7) it.x += -4.7 - fp[0];
      if (fp[2] > 4.7) it.x -= fp[2] - 4.7;
      if (fp[1] < -4.2) it.z += -4.2 - fp[1];
      if (fp[3] > 4.2) it.z -= fp[3] - 4.2;
    }
    this.b.place(a.ghost, it.x, it.z, (it.r * Math.PI) / 2, 0.12);
    const [w, d] = def.size;
    a.base.scale.set(w, d, 1);
    const problem = placementProblem(this.home.state.layout, it, a.index);
    a.problem = problem;
    a.base.material.color.setHex(problem ? 0xe8392f : 0x3fbf5f);
    $("deco-status").textContent = problem
      ? `✖ ${problem}`
      : `✔ ${def.name}: cabe aquí`;
    $("deco-status").className = problem ? "bad" : "good";
    this.camera();
  }

  // Cuadros, espejos y relojes: al punto más cercano de una pared.
  snapToWall(a) {
    const it = a.item;
    const half = FURNITURE[it.f].size[0] / 2;
    let best = null;
    for (const w of CASITA.walls) {
      const [x0, z0, x1, z1, nx, nz] = w;
      const horiz = z0 === z1;
      const lo = (horiz ? Math.min(x0, x1) : Math.min(z0, z1)) + half;
      const hi = (horiz ? Math.max(x0, x1) : Math.max(z0, z1)) - half;
      if (hi < lo) continue;
      const along = Math.max(lo, Math.min(hi, horiz ? a.pos.x : a.pos.z));
      const x = horiz ? along : x0 + nx * 0.06;
      const z = horiz ? z0 + nz * 0.06 : along;
      const dist = Math.hypot(x - a.pos.x, z - a.pos.z);
      if (!best || dist < best.dist)
        best = { x, z, dist, r: nz > 0 ? 0 : nz < 0 ? 2 : nx > 0 ? 1 : 3 };
    }
    if (best) Object.assign(it, { x: best.x, z: best.z, r: best.r });
  }

  rotate() {
    const a = this.active;
    if (!a || FURNITURE[a.item.f].wall) return;
    a.item.r = (a.item.r + 1) % 4;
    this.game.audio.sfx("click");
  }

  toggleGrid() {
    this.grid = !this.grid;
    $("deco-bar")
      .querySelector("[data-deco=grid]")
      .classList.toggle("on", this.grid);
  }

  confirm() {
    const g = this.game;
    const a = this.active;
    if (!a) return;
    if (a.problem) {
      g.ui.toast(`No se puede colocar: ${a.problem}`, "bad");
      g.audio.sfx("error");
      return;
    }
    const layout = this.home.state.layout;
    const placed = {
      f: a.item.f,
      x: round(a.item.x),
      z: round(a.item.z),
      r: a.item.r,
    };
    if (a.index >= 0) layout[a.index] = { ...layout[a.index], ...placed };
    else layout.push(placed);
    this.finish();
    g.audio.sfx("place");
    g.ui.toast(`🛋️ ${FURNITURE[placed.f].name} colocado`, "good");
    this.afterChange();
  }

  // Guardar en el inventario el mueble que se está moviendo.
  store() {
    const a = this.active;
    if (!a || a.index < 0) return;
    this.home.state.layout.splice(a.index, 1);
    this.finish();
    this.game.ui.toast(
      `📦 ${FURNITURE[a.item.f].name} guardado en tu inventario`,
    );
    this.afterChange();
  }

  cancel() {
    if (!this.active) return;
    this.finish();
    this.home.refresh();
    this.game.rebuildInteractables();
  }

  finish() {
    const a = this.active;
    this.b.interior.remove(a.ghost);
    this.active = null;
    $("deco-bar").hidden = true;
    this.game.examine = null;
    this.game.player.char.root.visible = true;
  }

  afterChange() {
    const g = this.game;
    this.home.refresh();
    g.rebuildInteractables();
    // Si el jugador quedó dentro de un mueble, sale hacia la puerta.
    const p = g.player.pos;
    const before = { x: p.x, z: p.z };
    g.world.physics.resolveCircle(p, g.player.radius);
    if (Math.hypot(p.x - before.x, p.z - before.z) > 0.6) {
      const door = this.b.toWorld(CASITA.door[0], CASITA.door[1] - 0.6);
      g.player.teleport(door.x, door.z);
    }
    g.checkGoals?.();
    g.save();
    g.online?.sendHome?.();
  }
}

const round = (v) => Math.round(v * 100) / 100;
