// Jugador controlable y cámara en tercera persona.
import * as THREE from "three";
import { ToyCharacter } from "./character.js";
import { toyScooter } from "./vehicles.js";
import { turnTowards } from "./npc.js";

const WALK = 3.4;
const RUN = 6.2;
const GRAVITY = 22;
const STEP = 0.32;

export class Player {
  constructor(game, x, z) {
    this.game = game;
    this.char = new ToyCharacter({ body: 0x2ec4c4, scale: 1.08 });
    this.pos = { x, y: 0.12, z };
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
    this.char.root.add(ring);
  }

  setRiding(on) {
    this.riding = on;
    this.scooter.visible = on;
    this.char.rig.position.z = 0;
  }

  update(dt, input, cameraYaw) {
    const physics = this.game.world.physics;
    const mv = input.moveVector();
    const run = input.running();
    let speed = this.riding ? 9.5 : run ? RUN : WALK;
    if (this.game.state.carried.length && !this.riding) speed *= 0.85;
    // Movimiento relativo a la cámara.
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    const dirX = mv.x * cos - mv.y * sin;
    const dirZ = -mv.x * sin - mv.y * cos;
    const mag = Math.min(1, Math.hypot(mv.x, mv.y));
    const before = { x: this.pos.x, z: this.pos.z };
    if (mag > 0.05) {
      this.pos.x += dirX * speed * dt;
      this.pos.z += dirZ * speed * dt;
      this.heading = turnTowards(this.heading, Math.atan2(dirX, dirZ), dt * 12);
    }
    physics.resolveCircle(this.pos, this.radius);
    this.game.world.traffic.pushOut(this.pos, this.radius);
    this.pushFromAgents();
    // Escalones: subir aceras bajas; si es más alto, se comporta como pared.
    const ground = physics.groundHeight(this.pos.x, this.pos.z);
    if (ground - this.pos.y > STEP && this.grounded) {
      this.pos.x = before.x;
      this.pos.z = before.z;
    }
    if (input.consume(" ") && this.grounded) {
      this.vy = 7.2;
      this.grounded = false;
    }
    this.vy -= GRAVITY * dt;
    this.pos.y += this.vy * dt;
    const floor = physics.groundHeight(this.pos.x, this.pos.z);
    if (this.pos.y <= floor) {
      if (this.grounded && floor - this.pos.y <= STEP)
        this.pos.y += (floor - this.pos.y) * Math.min(1, dt * 20);
      else this.pos.y = floor;
      if (this.pos.y < floor - 0.001) this.pos.y = floor;
      this.vy = 0;
      this.grounded = true;
    } else if (this.pos.y - floor > 0.05) {
      this.grounded = false;
    }
    const moved =
      Math.hypot(this.pos.x - before.x, this.pos.z - before.z) /
      Math.max(dt, 1e-4);
    this.char.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.char.root.rotation.y = this.heading;
    this.char.animate(dt, this.riding ? 0 : moved, this.grounded);
    if (this.riding) {
      this.char.legs.forEach((l) => (l.rotation.x = 0));
      this.char.arms.forEach((a) => (a.rotation.x = -1.0));
      this.char.rig.position.y = 0.42;
    }
    this.speedNow = moved;
  }

  // Empuje suave contra clientes y empleados para no atravesarlos.
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
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0.42;
    this.distance = 8;
    this.target = new THREE.Vector3();
    this.inside = 0;
  }

  update(dt, input, player, insideBuilding) {
    this.yaw -= input.look.dx * 0.006;
    this.pitch = Math.max(
      0.12,
      Math.min(1.25, this.pitch + input.look.dy * 0.004),
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
