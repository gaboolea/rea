// Jugador controlable y cámara en tercera persona.
import * as THREE from "three";
import { ToyCharacter } from "./character.js";
import { turnTowards } from "./npc.js";
import { GYM } from "./config.js";

const WALK = 3.6;
const RUN = 6.4;
const ACCEL = 16;
const DECEL = 20;
const GRAVITY = 22;
const STEP = 0.32;

export class Player {
  constructor(game, x, z, look) {
    this.game = game;
    this.char = new ToyCharacter({ look, scale: 1.08 });
    this.pos = { x, y: 0.12, z };
    this.vel = { x: 0, z: 0 };
    this.vy = 0;
    this.grounded = true;
    this.heading = Math.PI;
    this.radius = 0.36;
    // Vehículo en uso: { id, def, model, size } o null (a pie).
    this.ride = null;
    this.rideSpeed = 0;
    game.scene.add(this.char.root);
    // Marcador bajo el jugador para reconocerlo siempre.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.62, 32),
      new THREE.MeshBasicMaterial({
        color: 0x2ec4c4,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    this.ring = ring;
    this.char.root.add(ring);
  }

  get riding() {
    return !!this.ride;
  }

  get driving() {
    return this.ride?.def.kind === "car";
  }

  // Sube a un vehículo (o baja con null). El modelo viaja con el personaje.
  setRide(ride) {
    if (this.ride) this.char.root.remove(this.ride.model);
    this.ride = ride;
    this.rideSpeed = ride ? Math.hypot(this.vel.x, this.vel.z) : 0;
    this.char.rig.visible = !ride || ride.def.kind !== "car";
    this.char.rig.position.y = 0;
    this.char.rig.rotation.set(0, 0, 0);
    if (ride) this.char.root.add(ride.model);
  }

  teleport(x, z, heading) {
    this.pos.x = x;
    this.pos.z = z;
    this.pos.y = this.game.world.physics.groundHeight(x, z);
    this.vel.x = this.vel.z = 0;
    if (heading !== undefined) this.heading = heading;
  }

  update(dt, input, cameraYaw) {
    if (this.driving) return this.updateCar(dt, input);
    const physics = this.game.world.physics;
    const mv = input.moveVector();
    const run = input.running();
    const ride = this.ride;
    let speed = run ? RUN : WALK;
    const st = this.game.state;
    if (st.carried.length && !st.cart) speed *= 0.88;
    if (this.game.buff?.until > this.game.elapsed) speed *= GYM.boost;
    // Dirección deseada relativa a la cámara, con aceleración suave.
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    const dirX = mv.x * cos - mv.y * sin;
    const dirZ = -mv.x * sin - mv.y * cos;
    const mag = Math.min(1, Math.hypot(mv.x, mv.y));
    if (ride) {
      // Dos ruedas y monopatín: giran poco a poco y avanzan siempre hacia
      // delante; soltar el control frena.
      const def = ride.def;
      if (mag > 0.05)
        this.heading = turnTowards(
          this.heading,
          Math.atan2(dirX, dirZ),
          dt * def.turn,
        );
      const target = mag * def.speed;
      const rate = target > this.rideSpeed ? def.accel : def.accel * 1.6;
      this.rideSpeed += Math.max(
        -rate * dt,
        Math.min(rate * dt, target - this.rideSpeed),
      );
      this.vel.x = Math.sin(this.heading) * this.rideSpeed;
      this.vel.z = Math.cos(this.heading) * this.rideSpeed;
    } else {
      const wantX = dirX * speed;
      const wantZ = dirZ * speed;
      const rate =
        (mag > 0.05 ? ACCEL : DECEL) * (this.grounded ? 1 : 0.4) * dt;
      const dvx = wantX - this.vel.x;
      const dvz = wantZ - this.vel.z;
      const dlen = Math.hypot(dvx, dvz);
      if (dlen > rate) {
        this.vel.x += (dvx / dlen) * rate;
        this.vel.z += (dvz / dlen) * rate;
      } else {
        this.vel.x = wantX;
        this.vel.z = wantZ;
      }
      if (mag > 0.05)
        this.heading = turnTowards(
          this.heading,
          Math.atan2(dirX, dirZ),
          dt * 11,
        );
    }
    const before = { x: this.pos.x, z: this.pos.z };
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    physics.resolveCircle(this.pos, this.radius);
    if (this.game.state.cart) this.resolveCart(physics);
    this.game.world.traffic.pushOut(this.pos, this.radius);
    this.pushFromAgents();
    // Escalones: subir aceras bajas; si es más alto, se comporta como pared.
    const ground = physics.groundHeight(this.pos.x, this.pos.z);
    if (ground - this.pos.y > STEP && this.grounded) {
      this.pos.x = before.x;
      this.pos.z = before.z;
    }
    const canJump = !ride || ride.def.kind === "board";
    if (input.consume(" ") && this.grounded && canJump) {
      this.vy = ride ? 6 : 7.2;
      this.grounded = false;
      this.game.audio.sfx("jump");
    }
    this.vy -= GRAVITY * dt;
    this.pos.y += this.vy * dt;
    const floor = physics.groundHeight(this.pos.x, this.pos.z);
    if (this.pos.y <= floor) {
      if (!this.grounded && this.vy < -4) {
        this.char.land(Math.min(1, -this.vy / 8));
        this.game.audio.sfx("land");
        this.game.fx.dust(this.pos, 6);
      }
      if (this.grounded && floor - this.pos.y <= STEP)
        this.pos.y += (floor - this.pos.y) * Math.min(1, dt * 20);
      else this.pos.y = floor;
      if (this.pos.y < floor - 0.001) this.pos.y = floor;
      this.vy = 0;
      this.grounded = true;
    } else if (this.pos.y - floor > 0.05) {
      this.grounded = false;
    }
    // La velocidad real (tras colisiones) se usa para animar y frenar.
    const moved =
      Math.hypot(this.pos.x - before.x, this.pos.z - before.z) /
      Math.max(dt, 1e-4);
    if (moved < Math.hypot(this.vel.x, this.vel.z) * 0.5) {
      this.vel.x *= 0.5;
      this.vel.z *= 0.5;
      if (ride) this.rideSpeed *= 0.5;
    }
    this.char.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.char.root.rotation.y = this.heading;
    this.char.animate(dt, ride ? 0 : moved, this.grounded);
    if (this.char.stepped && !ride) {
      this.game.audio.sfx("step", { vol: moved > 5 ? 0.05 : 0.03 });
      if (moved > 5) this.game.fx.dust(this.pos, 2);
    }
    if (ride) this.poseOnRide(dt, moved);
    this.lastHeading = this.heading;
    this.speedNow = moved;
  }

  // Postura y animación sobre el vehículo: pedalear, empujar el monopatín…
  poseOnRide(dt, speed) {
    const turn =
      -Math.sin(this.heading - (this.lastHeading ?? this.heading)) * 4;
    this.ridePose ??= {};
    poseRider(this.char, this.ride, this.ridePose, dt, speed, turn);
  }

  // Conducción de coches: acelerar, frenar/marcha atrás, girar (más cuanto
  // más rápido), freno de mano con Espacio y choques con todo el chasis.
  updateCar(dt, input) {
    const { def, size } = this.ride;
    const physics = this.game.world.physics;
    const mv = input.enabled ? input.moveVector() : { x: 0, y: 0 };
    const throttle = mv.y;
    const steer = mv.x;
    let v = this.rideSpeed;
    if (throttle > 0.05)
      v += (v < 0 ? def.accel * 2.2 : def.accel) * throttle * dt;
    else if (throttle < -0.05)
      v += (v > 0 ? -def.accel * 2.2 : -def.accel * 0.6) * -throttle * dt;
    else v -= Math.sign(v) * Math.min(Math.abs(v), 2.5 * dt);
    if (input.keys.has(" ")) v -= Math.sign(v) * Math.min(Math.abs(v), 16 * dt);
    v = Math.max(-5, Math.min(def.speed, v));
    const grip = Math.min(1, Math.abs(v) / 4) * Math.sign(v);
    this.heading -= steer * def.turn * grip * dt;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    const before = { x: this.pos.x, z: this.pos.z };
    this.pos.x += fx * v * dt;
    this.pos.z += fz * v * dt;
    // Chasis = tres círculos a lo largo del coche.
    let hit = 0;
    const r = size.width + 0.05;
    for (let pass = 0; pass < 2; pass++)
      for (const k of [-1, 0, 1]) {
        const off = k * (size.half - size.width);
        const c = { x: this.pos.x + fx * off, z: this.pos.z + fz * off };
        const bx = c.x;
        const bz = c.z;
        physics.resolveCircle(c, r);
        this.game.world.traffic.pushOut(c, r);
        const dx = c.x - bx;
        const dz = c.z - bz;
        hit = Math.max(hit, Math.hypot(dx, dz));
        this.pos.x += dx;
        this.pos.z += dz;
      }
    // Los coches no entran en los locales.
    const inside = Object.values(this.game.world.buildings).some((b) =>
      b.contains(this.pos.x, this.pos.z, -0.6),
    );
    if (inside) {
      this.pos.x = before.x;
      this.pos.z = before.z;
      hit = 1;
    }
    if (hit > 0.02) {
      if (Math.abs(v) > 4) {
        this.game.audio.sfx("land");
        this.char.land(0.4);
      }
      v *= 0.55;
    }
    this.rideSpeed = v;
    this.pushAgentsAway(fx, fz, r);
    this.vel.x = fx * v;
    this.vel.z = fz * v;
    const floor = physics.groundHeight(this.pos.x, this.pos.z);
    this.pos.y += (floor - this.pos.y) * Math.min(1, dt * 12);
    this.vy = 0;
    this.grounded = true;
    this.char.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.char.root.rotation.y = this.heading;
    this.ride.model.rotation.z = -steer * grip * 0.04;
    this.speedNow = Math.abs(v);
    this.lastHeading = this.heading;
  }

  // Sentado en un sofá o una silla: quieto en el asiento.
  sit(dt) {
    const s = this.sitting;
    this.pos.x = s.x;
    this.pos.z = s.z;
    this.pos.y = s.y;
    this.vel.x = this.vel.z = 0;
    this.heading = s.heading;
    this.char.root.position.set(s.x, s.y, s.z);
    this.char.root.rotation.y = s.heading;
    this.char.animate(dt, 0, true);
    const c = this.char;
    c.legs.forEach((l) => (l.rotation.x = -1.45));
    c.arms.forEach((a) => (a.rotation.x = -0.4));
    this.speedNow = 0;
  }

  // Un coche aparta a la gente que tiene delante (nadie queda atrapado).
  pushAgentsAway(fx, fz, r) {
    const { size } = this.ride;
    for (const a of this.game.agentPositions()) {
      for (const k of [-1, 0, 1]) {
        const off = k * (size.half - size.width);
        const cx = this.pos.x + fx * off;
        const cz = this.pos.z + fz * off;
        const dx = a.x - cx;
        const dz = a.z - cz;
        const d = Math.hypot(dx, dz);
        const min = r + 0.3;
        if (d > 1e-3 && d < min) {
          a.x += (dx / d) * (min - d);
          a.z += (dz / d) * (min - d);
        }
      }
    }
  }

  // El carro va delante: si choca con una pared o un mueble, el jugador
  // retrocede lo mismo, para que el carro no atraviese nada.
  resolveCart(physics) {
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    for (const reach of [0.75, 1.3]) {
      const c = { x: this.pos.x + fx * reach, z: this.pos.z + fz * reach };
      const bx = c.x;
      const bz = c.z;
      physics.resolveCircle(c, 0.42);
      this.pos.x += c.x - bx;
      this.pos.z += c.z - bz;
    }
    physics.resolveCircle(this.pos, this.radius);
  }

  // Empuje suave contra personas para no atravesarlas.
  pushFromAgents() {
    for (const a of this.game.agentPositions()) {
      const dx = this.pos.x - a.x;
      const dz = this.pos.z - a.z;
      const d = Math.hypot(dx, dz);
      const min = this.radius + 0.28;
      if (d > 1e-3 && d < min) {
        this.pos.x += (dx / d) * (min - d);
        this.pos.z += (dz / d) * (min - d);
      }
    }
  }
}

export class CameraRig {
  constructor(camera, settings) {
    this.camera = camera;
    this.settings = settings;
    this.yaw = 0;
    this.pitch = 0.42;
    this.distance = 8;
    this.target = new THREE.Vector3();
    this.inside = 0;
    this.drive = 0;
  }

  update(dt, input, player, insideBuilding) {
    const sens = this.settings.sensitivity ?? 1;
    const invert = this.settings.invertY ? -1 : 1;
    this.yaw -= input.look.dx * 0.006 * sens;
    this.pitch = Math.max(
      0.12,
      Math.min(1.25, this.pitch + input.look.dy * 0.004 * sens * invert),
    );
    this.distance = Math.max(
      4,
      Math.min(16, this.distance + input.look.zoom * 0.8),
    );
    this.inside +=
      ((insideBuilding ? 1 : 0) - this.inside) * Math.min(1, dt * 3);
    // En marcha, la cámara se coloca sola detrás del vehículo (salvo
    // mientras el jugador la gira a mano).
    const moving = player.driving || (player.riding && player.speedNow > 2.5);
    if (moving && !input.look.dx) {
      let diff = player.heading + Math.PI - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * Math.min(1, dt * (player.driving ? 2.6 : 1.2));
    }
    this.drive += ((player.driving ? 1 : 0) - this.drive) * Math.min(1, dt * 2);
    const pitch = this.pitch + this.inside * 0.38 - this.drive * 0.08;
    const dist =
      this.distance * (1 - this.inside * 0.12) +
      this.drive * Math.max(0, 10.5 - this.distance);
    const goal = new THREE.Vector3(
      player.pos.x,
      player.pos.y + 1.3,
      player.pos.z,
    );
    this.target.lerp(goal, Math.min(1, dt * 10));
    const cx = this.target.x + Math.sin(this.yaw) * Math.cos(pitch) * dist;
    const cz = this.target.z + Math.cos(this.yaw) * Math.cos(pitch) * dist;
    const cy = this.target.y + Math.sin(pitch) * dist;
    this.camera.position.lerp(
      new THREE.Vector3(cx, cy, cz),
      Math.min(1, dt * 12),
    );
    this.camera.lookAt(this.target);
  }

  snap(player) {
    this.target.set(player.pos.x, player.pos.y + 1.3, player.pos.z);
    const p = this.pitch;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * Math.cos(p) * this.distance,
      this.target.y + Math.sin(p) * this.distance,
      this.target.z + Math.cos(this.yaw) * Math.cos(p) * this.distance,
    );
    this.camera.lookAt(this.target);
  }
}

// Postura del personaje sobre un vehículo: empujar el monopatín, pedalear,
// moto, scooter o al volante. La usan el jugador y los avatares remotos.
export function poseRider(c, ride, pose, dt, speed, turn) {
  const { def, model } = ride;
  pose.phase = (pose.phase ?? 0) + dt * speed * 2.2;
  const ph = pose.phase;
  for (const w of model.userData.spin ?? []) w.rotation.x += dt * speed * 3;
  model.rotation.z = turn * (def.kind === "board" ? 1.4 : 1);
  if (def.kind === "board") {
    c.rig.position.y = 0.17;
    c.legs[0].rotation.x = 0.15;
    // Empuja con el pie al acelerar.
    const pushing = speed < def.speed * 0.85 && speed > 0.3;
    c.legs[1].rotation.x = pushing ? Math.sin(ph * 1.5) * 0.7 : -0.1;
    c.arms[0].rotation.z = -0.6;
    c.arms[1].rotation.z = 0.6;
    c.rig.rotation.y = 0.35;
  } else if (def.kind === "bike") {
    c.rig.position.y = 0.42;
    c.rig.rotation.x = 0.18;
    c.legs[0].rotation.x = -0.9 + Math.sin(ph) * 0.55;
    c.legs[1].rotation.x = -0.9 - Math.sin(ph) * 0.55;
    c.arms.forEach((a) => (a.rotation.x = -1.25));
    if (model.userData.crank) model.userData.crank.rotation.x = ph;
  } else if (def.kind === "moto") {
    c.rig.position.y = 0.48;
    c.rig.rotation.x = 0.15;
    c.legs.forEach((l) => (l.rotation.x = -1.1));
    c.arms.forEach((a) => (a.rotation.x = -1.3));
  } else {
    c.legs.forEach((l) => (l.rotation.x = 0));
    c.arms.forEach((a) => (a.rotation.x = -1.0));
    c.rig.position.y = 0.42;
  }
}
