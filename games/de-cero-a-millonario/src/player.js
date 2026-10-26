// Jugador controlable y cámara en tercera persona.
import * as THREE from "three";
import { ToyCharacter } from "./character.js";
import { toyScooter } from "./vehicles.js";
import { turnTowards } from "./npc.js";

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
    this.riding = false;
    this.scooter = toyScooter(0xff5a4e);
    this.scooter.visible = false;
    this.char.root.add(this.scooter);
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

  setRiding(on) {
    this.riding = on;
    this.scooter.visible = on;
  }

  teleport(x, z, heading) {
    this.pos.x = x;
    this.pos.z = z;
    this.pos.y = this.game.world.physics.groundHeight(x, z);
    this.vel.x = this.vel.z = 0;
    if (heading !== undefined) this.heading = heading;
  }

  update(dt, input, cameraYaw) {
    const physics = this.game.world.physics;
    const mv = input.moveVector();
    const run = input.running();
    let speed = this.riding ? 9.5 : run ? RUN : WALK;
    const st = this.game.state;
    if (st.carried.length && !this.riding && !st.cart) speed *= 0.88;
    // Dirección deseada relativa a la cámara, con aceleración suave.
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    const dirX = mv.x * cos - mv.y * sin;
    const dirZ = -mv.x * sin - mv.y * cos;
    const mag = Math.min(1, Math.hypot(mv.x, mv.y));
    const wantX = dirX * speed;
    const wantZ = dirZ * speed;
    const rate = (mag > 0.05 ? ACCEL : DECEL) * (this.grounded ? 1 : 0.4) * dt;
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
    const before = { x: this.pos.x, z: this.pos.z };
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    if (mag > 0.05)
      this.heading = turnTowards(this.heading, Math.atan2(dirX, dirZ), dt * 11);
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
    if (input.consume(" ") && this.grounded && !this.riding) {
      this.vy = 7.2;
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
    }
    this.char.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.char.root.rotation.y = this.heading;
    this.char.animate(dt, this.riding ? 0 : moved, this.grounded);
    if (this.char.stepped && !this.riding) {
      this.game.audio.sfx("step", { vol: moved > 5 ? 0.05 : 0.03 });
      if (moved > 5) this.game.fx.dust(this.pos, 2);
    }
    if (this.riding) {
      this.char.legs.forEach((l) => (l.rotation.x = 0));
      this.char.arms.forEach((a) => (a.rotation.x = -1.0));
      this.char.rig.position.y = 0.42;
      this.scooter.rotation.z =
        -Math.sin(this.heading - (this.lastHeading ?? this.heading)) * 4;
    }
    this.lastHeading = this.heading;
    this.speedNow = moved;
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
    const pitch = this.pitch + this.inside * 0.38;
    const dist = this.distance * (1 - this.inside * 0.12);
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
