// Sucesos inesperados en el mundo: el ladrón que huye de tu tienda con
// género y las cosas perdidas (cartera, perro, paquete) que hay que llevar a
// su dueño. Las reglas (puntos, caminos, recompensas) están en surprises.js;
// en online el servidor elige el suceso y comprueba cada paso.
import * as THREE from "three";
import { PRODUCTS } from "./config.js";
import {
  SURPRISES,
  SURPRISE_GAP,
  SURPRISE_SECONDS,
  NEAR,
  THIEF_MAX_UNITS,
  THIEF_PATHS,
  THIEF_DELAY,
  THIEF_SPEED,
  thiefAt,
  thiefSeconds,
  surpriseReward,
  planStops,
} from "./surprises.js";
import { ToyCharacter } from "./character.js";
import { randomLook } from "./look.js";
import { dogModel } from "./critters.js";
import { mat, mesh, roundedBox, box, cylinder, sphere } from "./gfx.js";

const rand = (a, b) => a + Math.random() * (b - a);
// El ladrón solo aparece si estás cerca de tu tienda para poder perseguirlo.
const THIEF_RANGE = 45;

export class Surprises {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.pending = false;
    this.timer = rand(...SURPRISE_GAP);
  }

  // ---------- Consultas de otros sistemas ----------

  // Hacia dónde apunta la flecha mientras hay un suceso.
  target() {
    const a = this.active;
    if (!a || a.over) return null;
    if (a.type === "ladron")
      return {
        x: a.thief.root.position.x,
        z: a.thief.root.position.z,
        label: "Ladrón",
      };
    const [x, z] = a.stops[a.step];
    return { x, z, label: a.step ? a.def.owner : a.def.name };
  }

  hud() {
    const a = this.active;
    if (!a || a.over) return null;
    let text;
    if (a.type === "ladron") {
      const d = Math.hypot(
        a.thief.root.position.x - this.game.player.pos.x,
        a.thief.root.position.z - this.game.player.pos.z,
      );
      text = `¡Atrapa al ladrón! (${Math.round(d)} m) · lleva ${a.stolen.units} × ${PRODUCTS[a.stolen.product].name}`;
    } else text = a.step ? a.def.deliver : a.def.find;
    return { icon: a.def.icon, text, left: a.left, total: a.total };
  }

  // ---------- Empezar ----------

  async start() {
    const g = this.game;
    const types = ["cartera", "perro", "paquete"];
    const steal = this.stealCandidate();
    if (steal) types.push("ladron", "ladron");
    let plan;
    if (g.online) {
      this.pending = true;
      const r = await g.serverAction(
        "surprise",
        {
          types: [...new Set(types)],
          steal: steal && { product: steal.product, units: steal.units },
        },
        true,
      );
      this.pending = false;
      if (!r.ok) {
        this.timer = 30;
        return;
      }
      plan = r.surprise;
    } else {
      const type = types[Math.floor(Math.random() * types.length)];
      plan =
        type === "ladron"
          ? {
              type,
              path: THIEF_PATHS[this.plot()],
              stolen: { product: steal.product, units: steal.units },
              elapsed: 0,
              left: thiefSeconds(THIEF_PATHS[this.plot()]),
            }
          : {
              type,
              stops: planStops(type),
              step: 0,
              elapsed: 0,
              left: SURPRISE_SECONDS,
            };
    }
    if (g.mode !== "play") return;
    this.begin(plan, steal);
  }

  plot() {
    return this.game.businesses.tienda.building.id;
  }

  // Lo que se llevaría el ladrón: de la estantería más llena de tu tienda.
  stealCandidate() {
    const g = this.game;
    const shop = g.businesses.tienda;
    if (!THIEF_PATHS[this.plot()] || g.tutorial?.active()) return null;
    const door = shop.building.doorPoint(1.5);
    if (
      Math.hypot(door.x - g.player.pos.x, door.z - g.player.pos.z) > THIEF_RANGE
    )
      return null;
    let best = null;
    for (const entry of shop.displays) {
      const d = entry.display;
      if (!d.product || PRODUCTS[d.product].crafted || d.stock < 2) continue;
      if (!best || d.stock > best.display.stock) best = entry;
    }
    if (!best) return null;
    return {
      entry: best,
      product: best.display.product,
      units: Math.min(THIEF_MAX_UNITS, best.display.stock),
    };
  }

  begin(plan, steal) {
    const g = this.game;
    const def = SURPRISES[plan.type];
    const a = {
      ...plan,
      def,
      step: plan.step ?? 0,
      t: plan.elapsed ?? 0,
      left: plan.left,
      total: plan.left,
      objects: [],
    };
    a.clock0 = performance.now() / 1000;
    a.t0 = a.t;
    a.left0 = a.left;
    this.active = a;
    if (a.type === "ladron") {
      // El género desaparece de la estantería (en online el servidor ya lo
      // descontó de tus existencias).
      const entry = steal?.product === a.stolen.product ? steal.entry : null;
      if (entry) entry.display.setStock(entry.display.stock - a.stolen.units);
      a.thief = this.buildThief();
      g.ui.toast(`${def.icon} ${def.intro}`, "event");
    } else {
      this.buildFindAndDeliver(a);
      g.ui.toast(`${def.icon} ${def.find}`, "event");
    }
    g.audio.sfx("event");
  }

  buildThief() {
    const g = this.game;
    const look = {
      ...randomLook(),
      top: { id: "sudadera", color: "negro" },
      bottom: { id: "vaqueros", color: "marino" },
      hat: { id: "gorro", color: "negro" },
      glasses: { id: "sol", color: "negro" },
      back: { id: "none" },
    };
    const char = new ToyCharacter({ look });
    // Saco con el botín a la espalda.
    const sack = mesh(
      sphere(0.32, 12),
      mat(0xc9a36b, { roughness: 0.9 }),
      0,
      1.15,
      -0.32,
    );
    sack.scale.set(1, 1.15, 0.85);
    char.root.add(sack);
    g.scene.add(char.root);
    char.think("💰", "#1d2b44", 4);
    this.active.objects.push(char.root);
    return char;
  }

  buildFindAndDeliver(a) {
    const g = this.game;
    const [fx, fz] = a.stops[0];
    const y = g.world.physics.groundHeight(fx, fz);
    let item;
    if (a.type === "perro") {
      const dog = dogModel(0xc68642, 0xf5deb3);
      item = dog.g;
      a.dog = dog;
    } else if (a.type === "cartera") {
      item = new THREE.Group();
      item.add(
        mesh(roundedBox(0.34, 0.08, 0.24, 0.03), mat(0x8e3b46), 0, 0.3, 0),
      );
      item.add(mesh(box(0.06, 0.09, 0.08), mat(0xffd23f), 0.15, 0.3, 0, false));
    } else {
      item = new THREE.Group();
      item.add(
        mesh(roundedBox(0.6, 0.45, 0.5, 0.03), mat(0xc9935a), 0, 0.23, 0),
      );
      item.add(mesh(box(0.62, 0.06, 0.12), mat(0xf2e3c6), 0, 0.46, 0, false));
    }
    item.position.set(fx, y, fz);
    g.scene.add(item);
    a.item = item;
    a.objects.push(item);
    // Columna de luz para verlo de lejos.
    const beam = mesh(
      cylinder(0.5, 0.5, 14, 16, true),
      new THREE.MeshBasicMaterial({
        color: 0xffd23f,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      fx,
      y + 7,
      fz,
      false,
    );
    g.scene.add(beam);
    a.beam = beam;
    a.objects.push(beam);
    // El dueño espera en su sitio (el Mayorista tiene su puerta).
    if (a.type !== "paquete") {
      const [ox, oz] = a.stops[1];
      const owner = new ToyCharacter({ look: randomLook() });
      owner.root.position.set(ox, g.world.physics.groundHeight(ox, oz), oz);
      g.scene.add(owner.root);
      owner.think("?", "#e67e22", 600);
      a.owner = owner;
      a.objects.push(owner.root);
    }
  }

  // ---------- Bucle ----------

  update(dt, time) {
    const g = this.game;
    const a = this.active;
    if (!a) {
      // Empiezan cuando el tutorial ya enseñó lo básico.
      if (g.tutorial?.active() || g.state.mission < 6 || this.pending) return;
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = rand(...SURPRISE_GAP);
        this.start();
      }
      return;
    }
    if (g.online) {
      // En online manda el reloj del servidor, que no se para en pausa.
      const w = performance.now() / 1000 - a.clock0;
      a.t = a.t0 + w;
      a.left = a.left0 - w;
    } else {
      a.t += dt;
      a.left -= dt;
    }
    if (a.over) {
      a.over -= dt;
      a.owner?.animate(dt, 0);
      if (a.thief) a.thief.animate(dt, 0);
      if (a.over <= 0) this.clear();
      return;
    }
    if (a.type === "ladron") this.updateThief(a, dt);
    else this.updateFind(a, dt, time);
    if (!a.over && a.left <= 0) this.fail();
  }

  updateThief(a, dt) {
    const g = this.game;
    const q = thiefAt(a.path, a.t);
    const root = a.thief.root;
    root.position.set(q.x, g.world.physics.groundHeight(q.x, q.z), q.z);
    root.rotation.y = q.heading;
    a.thief.animate(dt, q.escaped || a.t < THIEF_DELAY ? 0 : THIEF_SPEED);
    if (q.escaped) return this.fail();
    const p = g.player.pos;
    if (
      a.t > THIEF_DELAY &&
      this.ready(a) &&
      Math.hypot(q.x - p.x, q.z - p.z) < NEAR + 0.4
    )
      this.advance();
  }

  updateFind(a, dt, time) {
    const g = this.game;
    const p = g.player.pos;
    a.owner?.animate(dt, 0);
    if (a.step === 0) {
      a.item.rotation.y += dt * 1.5;
      if (a.type !== "perro")
        a.item.position.y = 0.15 + Math.sin(time * 3) * 0.08;
      else this.animateDog(a.dog, dt, false, time);
      a.beam.material.opacity = 0.16 + Math.sin(time * 4) * 0.06;
    } else if (a.type === "perro") {
      // El perro te sigue de cerca.
      const d = a.item.position;
      const dx = p.x - d.x;
      const dz = p.z - d.z;
      const dist = Math.hypot(dx, dz);
      const moving = dist > 1.3;
      if (moving) {
        const step = Math.min(dist - 1.2, dt * Math.max(3, dist * 2));
        d.x += (dx / dist) * step;
        d.z += (dz / dist) * step;
        a.item.rotation.y = Math.atan2(dx, dz);
      }
      d.y = g.world.physics.groundHeight(d.x, d.z);
      this.animateDog(a.dog, dt, moving, time);
    }
    if (a.owner) {
      const o = a.owner.root.position;
      a.owner.root.rotation.y = Math.atan2(p.x - o.x, p.z - o.z);
    }
    const [x, z] = a.stops[a.step];
    if (this.ready(a) && Math.hypot(x - p.x, z - p.z) < NEAR) this.advance();
  }

  animateDog(dog, dt, moving, time) {
    dog.walk = (dog.walk ?? 0) + dt * (moving ? 12 : 0);
    dog.legs.forEach((leg, i) => {
      leg.rotation.x = moving
        ? Math.sin(
            dog.walk + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0),
          ) * 0.6
        : 0;
    });
    dog.tail.rotation.y = Math.sin(time * 18) * 0.6;
  }

  // ---------- Pasos ----------

  ready(a) {
    return !this.pending && a.t >= (a.retryAt ?? 0);
  }

  async advance() {
    const g = this.game;
    const a = this.active;
    let res = { ok: true };
    if (g.online) {
      this.pending = true;
      res = await g.serverAction("surpriseStep", {}, true);
      this.pending = false;
      if (this.active !== a || a.over) return;
      // Las posiciones llegan al servidor con algo de retraso: si aún no te
      // ve allí, se vuelve a intentar enseguida.
      if (!res.ok) {
        if (res.error === "El suceso ya terminó") this.fail(true);
        a.retryAt = a.t + 0.4;
        return;
      }
    }
    const last = a.type === "ladron" || a.step + 1 >= a.stops.length;
    if (!last) {
      a.step = res.step ?? a.step + 1;
      this.pickUp(a);
      return;
    }
    const reward = g.online
      ? res.reward
      : surpriseReward(a.type, g.stageIndex());
    if (!g.online) g.state.money += reward;
    const st = g.state.stats;
    st.surprises = (st.surprises ?? 0) + 1;
    if (a.type === "ladron") {
      st.thieves = (st.thieves ?? 0) + 1;
      this.recover(a.stolen);
      a.thief.think("😵", "#d9534f", 3);
      a.thief.playAction("cheer", 0.4);
      g.ui.toast(
        `🚓 ¡Atrapaste al ladrón! Recuperas ${a.stolen.units} × ${PRODUCTS[a.stolen.product].name} · Recompensa +$${reward}`,
        "good",
      );
    } else {
      this.handOver(a);
      g.ui.toast(
        `${a.def.icon} ¡Gracias! ${a.def.name} resuelto · +$${reward}`,
        "good",
      );
    }
    g.ui.floatMoney(reward);
    g.audio.sfx("mission");
    g.player.char.playAction("cheer", 0.9);
    g.fx.confetti(g.player.pos);
    a.over = 2.5;
    g.goals.check();
    g.save();
  }

  pickUp(a) {
    const g = this.game;
    g.audio.sfx("pickup");
    g.scene.remove(a.beam);
    if (a.type === "perro") {
      g.ui.toast("🐶 ¡Lo encontraste! Te sigue: llévalo con su dueño", "good");
      return;
    }
    // Lo llevas en la mano.
    g.scene.remove(a.item);
    a.item.position.set(0.35, 0.55, 0.35);
    a.item.scale.setScalar(a.type === "paquete" ? 0.7 : 1);
    g.player.char.root.add(a.item);
    a.carried = true;
    g.ui.toast(
      a.type === "paquete"
        ? "📦 ¡Paquete encontrado! Llévalo a la puerta del Mayorista"
        : "👛 ¡Cartera encontrada! Llévasela a su dueña",
      "good",
    );
  }

  handOver(a) {
    if (a.carried) a.item.parent?.remove(a.item);
    if (a.owner) {
      a.owner.think("♥", "#e84393", 3);
      a.owner.playAction("cheer", 1);
    }
  }

  // El género recuperado vuelve a la estantería (o al almacén).
  recover({ product, units }) {
    const shop = this.game.businesses.tienda;
    let left = units;
    for (const entry of shop.displays) {
      const d = entry.display;
      if (!left) break;
      if (
        d.product !== product &&
        !(d.stock === 0 && d.spec.accepts(PRODUCTS[product]))
      )
        continue;
      if (!d.product) d.setProduct(product);
      const put = Math.min(left, d.capacity - d.stock);
      d.setStock(d.stock + put);
      left -= put;
    }
    if (left) shop.addToStorage(product, left);
  }

  fail(silent = false) {
    const g = this.game;
    const a = this.active;
    if (!a || a.over) return;
    if (!silent) {
      if (a.type === "ladron")
        g.ui.toast(
          `🦹 El ladrón escapó con ${a.stolen.units} × ${PRODUCTS[a.stolen.product].name}`,
          "bad",
        );
      else g.ui.toast(`⌛ Se acabó el tiempo: ${a.def.name}`, "bad");
    }
    if (a.carried) a.item.parent?.remove(a.item);
    a.owner?.think("☹", "#7f8c8d", 2);
    a.over = a.type === "ladron" ? 0.01 : 1.5;
  }

  clear() {
    const a = this.active;
    if (!a) return;
    for (const o of a.objects) o.parent?.remove(o);
    this.active = null;
  }
}
