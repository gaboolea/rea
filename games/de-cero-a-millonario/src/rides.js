// Vehículos del jugador: los pequeños (monopatín, bici, scooter) se llevan
// encima y se usan con V; las motos y coches quedan aparcados donde los
// dejas y se sube a ellos con E. También compra, prueba en la pista del
// concesionario y servicio de grúa.
import { VEHICLES, STAGES } from "./config.js";
import { rideModel, rideSize } from "./vehicles.js";

const SMALL = new Set(["board", "bike", "scooter"]);
const TOW_PRICE = 15;
// Pista de pruebas del concesionario (zona comercial).
const TRACK = { minX: 36, maxX: 62, minZ: -90, maxZ: -64 };
const TRACK_START = { x: 49, z: -67, h: Math.PI };

export const isSmall = (id) => SMALL.has(VEHICLES[id]?.kind);

export class Rides {
  constructor(game) {
    this.game = game;
    this.parkedModels = new Map();
    this.test = null;
  }

  get state() {
    return this.game.state;
  }

  owned() {
    return Object.keys(VEHICLES).filter((id) => this.state.items[id]);
  }

  ownedSmall() {
    return this.owned().filter(isSmall);
  }

  // Vehículo pequeño que se usa con V (el elegido o el mejor que tengas).
  selectedSmall() {
    const s = this.state.ride;
    if (s && this.state.items[s] && isSmall(s)) return s;
    return (
      ["scooter", "bici", "skate"].find((id) => this.state.items[id]) ?? null
    );
  }

  makeRide(id) {
    const def = VEHICLES[id];
    return { id, def, model: rideModel(id, def), size: rideSize(def, id) };
  }

  // ---------- Subir y bajar ----------

  canRideHere() {
    const g = this.game;
    const p = g.player.pos;
    if (Object.values(g.world.buildings).some((b) => b.contains(p.x, p.z))) {
      g.ui.toast("Sal a la calle para subirte", "bad");
      return false;
    }
    if (g.state.carried.length || g.state.cart) {
      g.ui.toast("No puedes llevar cajas ni carro en el vehículo", "bad");
      return false;
    }
    return true;
  }

  // V: subir o bajar del vehículo pequeño.
  toggleSmall() {
    const g = this.game;
    const p = g.player;
    if (p.ride) {
      if (p.driving || !isSmall(p.ride.id)) return;
      return this.dismount();
    }
    const id = this.selectedSmall();
    if (!id)
      return g.ui.toast(
        "Compra un monopatín, una bici o un scooter en VEHÍCULOS",
        "bad",
      );
    if (!this.canRideHere()) return;
    p.setRide(this.makeRide(id));
    g.audio.sfx("jump");
  }

  dismount() {
    const g = this.game;
    const p = g.player;
    const ride = p.ride;
    if (!ride) return;
    if (this.test) return this.endTest("Prueba terminada");
    if (!isSmall(ride.id)) {
      // Se aparca donde está y el jugador baja por la izquierda.
      this.state.parked[ride.id] = { x: p.pos.x, z: p.pos.z, h: p.heading };
      const side = ride.size.width + 0.9;
      const out = {
        x: p.pos.x + Math.cos(p.heading) * side,
        z: p.pos.z - Math.sin(p.heading) * side,
      };
      p.setRide(null);
      g.world.physics.resolveCircle(out, p.radius);
      p.teleport(out.x, out.z, p.heading);
      this.spawnParked(ride.id);
    } else p.setRide(null);
    g.audio.sfx("land");
    g.syncLook?.();
    g.save();
  }

  // Sube a un vehículo aparcado (coche o moto).
  enter(id) {
    const g = this.game;
    const spot = this.state.parked[id];
    if (!spot) return;
    if (g.state.carried.length || g.state.cart)
      return g.ui.toast("Deja las cajas o el carro antes de conducir", "bad");
    this.removeParked(id);
    g.player.teleport(spot.x, spot.z, spot.h);
    g.player.setRide(this.makeRide(id));
    g.cameraRig.yaw = spot.h + Math.PI;
    g.audio.sfx("horn");
    if (!this.state.drivenOnce) {
      this.state.drivenOnce = true;
      g.ui.toast(
        g.input.isTouch
          ? "🚗 Joystick: arriba acelera, abajo frena/atrás, a los lados gira · ✋ para bajar"
          : "🚗 W acelera · S frena/atrás · A/D gira · Espacio freno de mano · E para bajar",
        "event",
      );
    }
  }

  // ---------- Vehículos aparcados ----------

  spawnParked(id) {
    const spot = this.state.parked[id];
    if (!spot || this.parkedModels.has(id)) return;
    const def = VEHICLES[id];
    const model = rideModel(id, def);
    model.position.set(
      spot.x,
      this.game.world.physics.groundHeight(spot.x, spot.z),
      spot.z,
    );
    model.rotation.y = spot.h;
    this.game.scene.add(model);
    // Colisión del coche aparcado (caja aproximada según su giro).
    const size = rideSize(def, id);
    const along = Math.abs(Math.cos(spot.h)) > 0.7;
    const w = along ? size.width * 2 : size.half * 2;
    const d = along ? size.half * 2 : size.width * 2;
    const collider = this.game.world.physics.addCentered(
      spot.x,
      spot.z,
      w * 0.9,
      d * 0.9,
      "parked",
    );
    this.parkedModels.set(id, { model, collider });
  }

  removeParked(id) {
    const p = this.parkedModels.get(id);
    if (!p) return;
    this.game.scene.remove(p.model);
    this.game.world.physics.remove(p.collider);
    this.parkedModels.delete(id);
  }

  // Al cargar la partida: coches en su sitio.
  restore() {
    for (const id of [...this.parkedModels.keys()]) this.removeParked(id);
    this.state.parked ??= {};
    for (const id of this.owned()) {
      if (isSmall(id) || this.game.player.ride?.id === id) continue;
      this.state.parked[id] ??= this.deliverySpot(id);
      this.spawnParked(id);
    }
  }

  // Dónde aparece un vehículo recién comprado.
  deliverySpot(id) {
    if (id === "furgoneta") return { x: 25, z: 13, h: 0 };
    if (id === "lujo") return { x: -236, z: -13.5, h: Math.PI / 2 };
    const order = ["moto", "compacto", "familiar", "deportivo"];
    const i = Math.max(0, order.indexOf(id));
    return { x: 40 + i * 6, z: -84, h: 0 };
  }

  // Grúa: trae el vehículo junto al jugador (si está en la calle).
  async tow(id) {
    const g = this.game;
    const p = g.player.pos;
    if (Object.values(g.world.buildings).some((b) => b.contains(p.x, p.z)))
      return g.ui.toast("Sal a la calle para que la grúa te encuentre", "bad");
    if (g.online) {
      if (!(await g.serverAction("tow", { id })).ok) return;
    } else if (!g.spend(TOW_PRICE)) return;
    const h = g.player.heading + Math.PI / 2;
    const spot = {
      x: p.x + Math.sin(h) * 3,
      z: p.z + Math.cos(h) * 3,
      h: g.player.heading,
    };
    this.removeParked(id);
    g.world.physics.resolveCircle(spot, 1.2);
    this.state.parked[id] = spot;
    this.spawnParked(id);
    g.ui.toast(
      `🚚 La grúa trajo tu ${VEHICLES[id].name} (−$${TOW_PRICE})`,
      "good",
    );
    g.save();
  }

  // ---------- Compra y prueba ----------

  status(id) {
    const g = this.game;
    const def = VEHICLES[id];
    if (this.state.items[id]) return { owned: true };
    if ((def.stage ?? 0) > g.stageIndex())
      return { locked: `Requiere la etapa ${STAGES[def.stage].name}` };
    if (def.zone === "financiero" && !this.state.unlocked?.financiero)
      return { locked: "Desbloquea el distrito financiero" };
    return {
      price: def.price,
      missing: Math.max(0, def.price - g.state.money),
    };
  }

  async buy(id) {
    const g = this.game;
    const st = this.status(id);
    if (st.owned || st.locked) return false;
    if (g.online) {
      if (!(await g.serverAction("item", { id })).ok) return false;
    } else if (!g.spend(st.price)) return false;
    this.state.items[id] = true;
    const def = VEHICLES[id];
    if (isSmall(id)) {
      this.state.ride = id;
      g.ui.toast(
        `🎉 ¡${def.name} es tuyo! Pulsa ${g.input.isTouch ? "🛴" : "V"} para subirte`,
        "good",
      );
    } else {
      this.state.parked[id] = this.deliverySpot(id);
      this.spawnParked(id);
      g.ui.toast(
        `🎉 ¡${def.name} es tuyo! Te espera aparcado junto a la pista de pruebas`,
        "good",
      );
      g.guide.setDestination({ ...this.state.parked[id], label: def.name });
    }
    g.audio.sfx("sparkle");
    g.applyItems();
    g.checkGoals?.();
    g.save();
    return true;
  }

  // Prueba gratis en la pista: el vehículo vuelve solo al salir de ella.
  startTest(id, back) {
    const g = this.game;
    if (g.player.ride) return;
    this.test = { id, back, time: 90 };
    g.player.teleport(TRACK_START.x, TRACK_START.z, TRACK_START.h);
    g.player.setRide(this.makeRide(id));
    g.cameraRig.yaw = TRACK_START.h + Math.PI;
    g.cameraRig.snap(g.player);
    g.ui.toast(
      `🏁 Prueba del ${VEHICLES[id].name}: 90 s dentro de la pista`,
      "event",
    );
  }

  endTest(message) {
    const g = this.game;
    const t = this.test;
    this.test = null;
    g.player.setRide(null);
    g.player.teleport(t.back.x, t.back.z, t.back.h ?? 0);
    g.cameraRig.snap(g.player);
    if (message) g.ui.toast(message);
  }

  // ---------- Interacciones y cada fotograma ----------

  interactables() {
    const g = this.game;
    const list = [];
    for (const store of Object.values(g.world.stores ?? {}))
      for (const s of store.spots ?? []) {
        if (s.kind !== "vehicle") continue;
        list.push({
          x: s.x,
          z: s.z,
          radius: 1.5,
          label: () => {
            const def = VEHICLES[s.id];
            const st = this.status(s.id);
            return {
              text: `EXAMINAR VEHÍCULO · ${def.name} · ${st.owned ? "ya es tuyo" : `$${def.price.toLocaleString("es")}`}`,
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
        x: c.x + (dx / d) * far + (dz / d) * far * 0.45,
        y: c.y + far * 0.42,
        z: c.z + (dz / d) * far - (dx / d) * far * 0.45,
      },
    );
    g.ui.openVehicle(this, spot.id, { x: spot.x, z: spot.z });
  }

  // Interacción dinámica: bajar del vehículo o subir a uno aparcado.
  dynamic() {
    const g = this.game;
    const p = g.player;
    if (p.ride && !isSmall(p.ride.id))
      return {
        x: p.pos.x,
        z: p.pos.z,
        radius: 5,
        label: () => ({
          text: this.test ? "TERMINAR LA PRUEBA" : `BAJAR · ${p.ride.def.name}`,
          enabled: true,
        }),
        action: () => this.dismount(),
      };
    if (p.ride) return null;
    let best = null;
    for (const [id, { model }] of this.parkedModels) {
      const d = Math.hypot(
        model.position.x - p.pos.x,
        model.position.z - p.pos.z,
      );
      const reach = rideSize(VEHICLES[id], id).half + 1.6;
      if (d < reach && (!best || d < best.d)) best = { id, d, model };
    }
    if (!best) return null;
    return {
      x: best.model.position.x,
      z: best.model.position.z,
      radius: 6,
      label: () => ({
        text: `SUBIR · ${VEHICLES[best.id].name}`,
        enabled: true,
      }),
      action: () => this.enter(best.id),
    };
  }

  update(dt) {
    const g = this.game;
    const p = g.player.pos;
    for (const { model } of this.parkedModels.values())
      model.visible =
        Math.abs(model.position.x - p.x) + Math.abs(model.position.z - p.z) <
        220;
    const t = this.test;
    if (t) {
      t.time -= dt;
      const out =
        p.x < TRACK.minX - 1 ||
        p.x > TRACK.maxX + 1 ||
        p.z < TRACK.minZ - 1 ||
        p.z > TRACK.maxZ + 1;
      if (out || t.time <= 0)
        this.endTest(
          out
            ? "Saliste de la pista: la prueba terminó"
            : "Se acabó el tiempo de prueba",
        );
    }
  }
}
