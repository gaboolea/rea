// Peatones que dan vida a la ciudad: pasean por las aceras, cruzan por los
// pasos de cebra, entran en comercios, charlan entre ellos, esperan el
// autobús y saludan al jugador. Usan la misma navegación que los clientes.
import { Agent } from "./npc.js";
import { ToyCharacter } from "./character.js";
import { randomLook } from "./look.js";

const CHAT_LINES = [
  "…",
  "¡Ja, ja!",
  "¿Sí?",
  "¡Qué bien!",
  "💬",
  "☕?",
  "¡Hola!",
];
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const rand = (a, b) => a + Math.random() * (b - a);

class Pedestrian extends Agent {
  constructor(game, crowd, x, z) {
    super(
      game,
      new ToyCharacter({
        look: randomLook(),
        scale: 0.82 + Math.random() * 0.2,
      }),
      x,
      z,
    );
    this.crowd = crowd;
    this.speed = rand(1.4, 2.1);
    this.state = "idle";
    this.timer = rand(0.2, 1.5);
    this.waveCooldown = rand(5, 15);
    this.partner = null;
    this.done = false;
  }

  hidden() {
    return !this.char.root.visible;
  }

  go(target, then) {
    this.state = "walk";
    this.moveTo(target, then);
  }

  idle(seconds) {
    this.state = "idle";
    this.timer = seconds;
  }

  pickActivity() {
    const c = this.crowd;
    const r = Math.random();
    if (r < 0.38)
      this.go(c.randomSidewalkPoint(), () => this.idle(rand(0.5, 3)));
    else if (r < 0.58) this.visitShop();
    else if (r < 0.7)
      this.go(c.randomParkPoint(), () => this.idle(rand(5, 10)));
    else if (r < 0.82) {
      if (!this.tryChat()) this.idle(1);
    } else if (r < 0.92) this.waitForBus();
    else this.go(c.exitPoint(), () => (this.done = true));
  }

  visitShop() {
    const b = pick(this.crowd.shops());
    this.go(b.doorPoint(1.6), () => {
      if (b.shutter) {
        this.face(b.x, b.z);
        this.char.think(b.id === "restaurante" ? "🔒" : "$", "#7f8c8d", 2);
        this.idle(2);
        return;
      }
      this.go(b.doorPoint(-1.2), () => {
        this.char.root.visible = false;
        this.state = "inside";
        this.timer = rand(4, 9);
        this.shop = b;
      });
    });
  }

  tryChat() {
    const other = this.crowd.people.find(
      (p) =>
        p !== this &&
        p.state === "idle" &&
        !p.partner &&
        !p.hidden() &&
        Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 12,
    );
    if (!other) return false;
    this.partner = other;
    other.partner = this;
    const mx = (this.pos.x + other.pos.x) / 2;
    const mz = (this.pos.z + other.pos.z) / 2;
    const dx = other.pos.x - this.pos.x;
    const dz = other.pos.z - this.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const meet = (p, sign) => ({
      x: mx - (dx / len) * 0.55 * sign,
      z: mz - (dz / len) * 0.55 * sign,
    });
    const start = (p) => {
      p.arrivedChat = true;
      if (p.partner?.arrivedChat) {
        for (const q of [p, p.partner]) {
          q.state = "chat";
          q.timer = rand(4, 7);
          q.face(q.partner.pos.x, q.partner.pos.z);
        }
      }
    };
    this.go(meet(this, 1), () => start(this));
    other.go(meet(other, -1), () => start(other));
    return true;
  }

  waitForBus() {
    const stop = this.crowd.busStop;
    const spot = { x: stop.x + rand(-1.3, 1.3), z: stop.z + rand(-0.1, 0.5) };
    this.go(spot, () => {
      this.state = "bus";
      this.timer = rand(25, 45);
      this.face(spot.x, spot.z + 3);
    });
  }

  endChat() {
    const p = this.partner;
    this.partner = null;
    this.arrivedChat = false;
    if (p && p.partner === this) p.endChat();
    this.idle(rand(0.3, 1));
  }

  update(dt) {
    super.update(dt);
    if (this.hidden() && this.state !== "inside") return;
    this.waveCooldown -= dt;
    const player = this.game.player.pos;
    const near = Math.hypot(player.x - this.pos.x, player.z - this.pos.z);
    if (
      this.waveCooldown <= 0 &&
      near < 3 &&
      !this.target &&
      this.state !== "inside"
    ) {
      this.waveCooldown = rand(20, 40);
      this.face(player.x, player.z);
      this.char.playAction("wave", 1.2);
      this.char.think(pick(["¡Hola!", "👋", "¡Buenas!"]), "#2e8a43", 1.6);
    }
    if (this.state === "walk") {
      // Si su compañero de charla se fue, cancelar.
      if (this.partner && this.partner.partner !== this) this.partner = null;
      return;
    }
    this.timer -= dt;
    if (this.state === "chat") {
      if (!this.char.action) this.char.playAction("talk", rand(0.8, 1.6));
      if (Math.random() < dt * 0.6)
        this.char.think(pick(CHAT_LINES), "#3e4a59", 1.2);
      if (this.timer <= 0) this.endChat();
      return;
    }
    if (this.state === "inside" && this.timer <= 0) {
      this.char.root.visible = true;
      this.state = "walk";
      this.moveTo(this.shop.doorPoint(1.8), () => this.idle(0.5));
      return;
    }
    if (this.state === "bus" && this.timer <= 0) this.idle(0.2);
    if (this.state === "idle" && this.timer <= 0 && !this.partner)
      this.pickActivity();
  }
}

export class Crowd {
  constructor(game) {
    this.game = game;
    this.people = [];
    this.target = 8;
    this.spawnTimer = 0;
    this.busStop = game.world.busStopPoint;
  }

  setDensity(n) {
    this.target = n;
  }

  shops() {
    const b = this.game.world.buildings;
    return [
      b.boutique,
      b.mayorista,
      b.restaurante,
      b.casa,
      b.minimercado,
      b.cafeteria,
    ].filter(Boolean);
  }

  randomSidewalkPoint() {
    const r = Math.random();
    if (r < 0.35) return { x: rand(-70, 70), z: rand(-8.5, -5) };
    if (r < 0.7) return { x: rand(-70, 70), z: rand(5, 8.5) };
    const x = Math.random() < 0.5 ? rand(-6.5, -4.6) : rand(4.6, 6.5);
    return { x, z: Math.random() < 0.5 ? rand(-45, -12) : rand(12, 48) };
  }

  randomParkPoint() {
    return pick([
      { x: rand(34, 46), z: rand(32, 34) },
      { x: rand(24, 36), z: rand(42.5, 44) },
      { x: rand(14, 24), z: rand(30, 32) },
    ]);
  }

  exitPoint() {
    return pick([
      { x: -73, z: -6.5 },
      { x: 73, z: -6.5 },
      { x: -73, z: 6.5 },
      { x: 73, z: 6.5 },
      { x: -5.5, z: -47 },
      { x: 5.5, z: 51 },
    ]);
  }

  spawn(at) {
    const p = at ?? this.exitPoint();
    const ped = new Pedestrian(this.game, this, p.x, p.z);
    this.people.push(ped);
    return ped;
  }

  // El autobús deja pasajeros y recoge a quienes esperan.
  onBusStop() {
    for (const p of this.people) {
      if (p.state === "bus") p.done = true;
    }
    const n = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n && this.people.length < this.target + 3; i++) {
      const p = this.spawn({
        x: this.busStop.x + rand(-1, 1),
        z: this.busStop.z + 0.8,
      });
      p.idle(rand(0.2, 1));
    }
  }

  update(dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.people.length < this.target) {
      this.spawnTimer = rand(1.5, 4);
      // Al principio aparecen ya repartidos por la ciudad.
      this.spawn(
        this.people.length < this.target / 2
          ? this.randomSidewalkPoint()
          : null,
      );
    }
    for (const p of this.people) p.update(dt);
    for (let i = this.people.length - 1; i >= 0; i--) {
      const p = this.people[i];
      if (p.done || this.people.length > this.target + 4) {
        if (p.partner) p.partner.partner = null;
        p.dispose();
        this.people.splice(i, 1);
      }
    }
  }

  positions() {
    return this.people.filter((p) => !p.hidden()).map((p) => p.pos);
  }
}
