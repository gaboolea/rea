// Agentes no jugadores: se mueven siguiendo rutas A* sobre la rejilla de
// navegación y respetan las colisiones. Los clientes y empleados añaden su
// propia máquina de estados encima.
import { ToyCharacter } from "./character.js";

const CUSTOMER_COLORS = [
  0xf2a531, 0xf7b733, 0xff8f3d, 0xffc94a, 0xe9893a, 0x7ec8e3, 0xff9ab8,
  0x9bd770,
];

export class Agent {
  constructor(game, character, x, z) {
    this.game = game;
    this.char = character;
    this.pos = { x, z, y: 0.12 };
    this.path = [];
    this.speed = 1.9;
    this.radius = 0.3;
    this.heading = 0;
    this.stuck = 0;
    this.target = null;
    this.onArrive = null;
    this.waitTimer = 0;
    character.root.position.set(x, this.pos.y, z);
    game.scene.add(character.root);
  }

  moveTo(target, onArrive) {
    this.target = { x: target.x, z: target.z };
    this.onArrive = onArrive ?? null;
    this.path = this.game.world.physics
      .navGrid()
      .findPath(this.pos, this.target) ?? [this.target];
    this.stuck = 0;
  }

  get arrived() {
    return !this.target;
  }

  face(x, z) {
    this.heading = Math.atan2(x - this.pos.x, z - this.pos.z);
  }

  update(dt) {
    let speed = 0;
    if (this.waitTimer > 0) this.waitTimer -= dt;
    else if (this.target && this.path.length) {
      const wp = this.path[0];
      const dx = wp.x - this.pos.x;
      const dz = wp.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      const last = this.path.length === 1;
      if (dist < (last ? 0.12 : 0.35)) {
        this.path.shift();
        if (!this.path.length) this.finish();
      } else {
        const step = Math.min(dist, this.speed * dt);
        const before = { x: this.pos.x, z: this.pos.z };
        this.pos.x += (dx / dist) * step;
        this.pos.z += (dz / dist) * step;
        this.game.world.physics.resolveCircle(this.pos, this.radius);
        const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
        speed = moved / Math.max(dt, 1e-4);
        this.heading = turnTowards(this.heading, Math.atan2(dx, dz), dt * 10);
        this.stuck =
          moved < step * 0.3 ? this.stuck + dt : Math.max(0, this.stuck - dt);
        if (this.stuck > 1.5) this.recover();
      }
    }
    const ground = this.game.world.physics.groundHeight(this.pos.x, this.pos.z);
    this.pos.y += (ground - this.pos.y) * Math.min(1, dt * 15);
    this.char.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.char.root.rotation.y = this.heading;
    this.char.animate(dt, speed);
  }

  // Si algo bloquea el paso, recalcula la ruta o se desplaza un poco.
  recover() {
    this.stuck = 0;
    if (!this.target) return;
    const t = this.target;
    const cb = this.onArrive;
    if (Math.hypot(t.x - this.pos.x, t.z - this.pos.z) < 1.0) {
      this.finish();
      return;
    }
    this.moveTo(t, cb);
  }

  finish() {
    this.target = null;
    this.path = [];
    const cb = this.onArrive;
    this.onArrive = null;
    if (cb) cb();
  }

  dispose() {
    this.game.scene.remove(this.char.root);
  }
}

export function turnTowards(current, target, maxStep) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + Math.max(-maxStep, Math.min(maxStep, diff));
}

export class Customer extends Agent {
  constructor(game, business, spawn) {
    const color =
      CUSTOMER_COLORS[Math.floor(Math.random() * CUSTOMER_COLORS.length)];
    super(
      game,
      new ToyCharacter({ body: color, scale: 0.85 + Math.random() * 0.15 }),
      spawn.x,
      spawn.z,
    );
    this.business = business;
    this.spawn = spawn;
    this.speed = 1.7 + Math.random() * 0.6;
    this.wants = business.rollWants();
    this.basket = [];
    this.patience = 45 + Math.random() * 20;
    this.waited = 0;
    this.register = null;
    this.ready = false;
    this.state = "toStore";
    this.done = false;
    this.moveTo(business.building.doorPoint(1.6), () => this.enter());
  }

  enter() {
    this.state = "enter";
    this.moveTo(this.business.building.doorPoint(-1.4), () => this.nextWant());
  }

  nextWant() {
    if (!this.wants.length) {
      this.goPay();
      return;
    }
    const want = this.wants[0];
    const entry =
      this.business.findDisplayFor(want) ?? this.business.randomDisplay();
    if (!entry) {
      this.wants.shift();
      this.char.think("?", "#e67e22");
      this.business.disappoint(0.5);
      this.nextWant();
      return;
    }
    this.state = "shopping";
    this.moveTo(entry.approach, () => {
      this.face(entry.pos.x, entry.pos.z);
      this.state = "browsing";
      this.waitTimer = 0.8 + Math.random() * 0.8;
      this.browseEntry = entry;
    });
  }

  takeFromShelf() {
    const entry = this.browseEntry;
    this.browseEntry = null;
    const want = this.wants.shift();
    const result = this.business.tryTake(entry, want);
    if (result.ok) {
      this.basket.push(...result.items);
      this.char.playAction("pickup", 0.5);
    } else if (result.reason === "price") {
      this.char.think("$$", "#c0392b");
    } else {
      this.char.think("?", "#e67e22");
    }
    this.nextWant();
  }

  goPay() {
    if (!this.basket.length) {
      this.char.think("☹", "#7f8c8d");
      this.leave();
      return;
    }
    const reg = this.business.pickRegister();
    if (!reg) {
      this.business.returnItems(this.basket);
      this.basket = [];
      this.leave();
      return;
    }
    this.register = reg;
    reg.queue.push(this);
    this.state = "queued";
    this.goToQueueSpot();
  }

  goToQueueSpot() {
    const idx = this.register.queue.indexOf(this);
    this.ready = false;
    const spot = this.business.queueSpot(this.register, idx);
    this.moveTo(spot, () => {
      this.face(this.register.pos.x, this.register.pos.z);
      if (idx === 0) this.ready = true;
    });
  }

  paid() {
    this.char.think("♥", "#e84393", 2);
    this.register = null;
    this.ready = false;
    this.leave();
  }

  leave() {
    this.state = "leaving";
    this.moveTo(this.business.building.doorPoint(1.8), () => {
      this.state = "exit";
      this.moveTo(this.spawn, () => (this.done = true));
    });
  }

  update(dt) {
    super.update(dt);
    if (this.state === "browsing" && this.waitTimer <= 0 && this.browseEntry)
      this.takeFromShelf();
    if (this.state === "queued") {
      this.waited += dt;
      if (this.waited > this.patience) {
        this.char.think("!", "#c0392b", 3);
        this.business.abandonQueue(this);
      }
    }
  }
}

export class Employee extends Agent {
  constructor(game, business, role) {
    const door = business.building.doorPoint(-1.5);
    const colors = { cajero: 0x5bd47a, reponedor: 0x4f8dff, barista: 0x8b5a3c };
    super(
      game,
      new ToyCharacter({ body: colors[role], apron: 0xffffff, hat: "gorra" }),
      door.x,
      door.z,
    );
    this.business = business;
    this.role = role;
    this.speed = 2.3;
    this.task = null;
    this.idle = 0;
    this.carry = null;
    this.busy = false;
  }

  update(dt) {
    super.update(dt);
    if (this.busy || this.target || this.waitTimer > 0) return;
    this.idle -= dt;
    if (this.idle > 0) return;
    const b = this.business;
    if (this.role === "cajero") b.cashierTick(this);
    else if (this.role === "reponedor") b.stockerTick(this);
    else if (this.role === "barista") b.baristaTick(this);
  }
}
