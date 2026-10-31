// Peatones que dan vida a la ciudad: pasean por las aceras, cruzan por los
// pasos de cebra, entran en comercios, charlan entre ellos, esperan el
// autobús y saludan al jugador. Usan la misma navegación que los clientes.
// Hay varios tipos de persona (look.js: PERSON_TYPES) con su forma de
// moverse: deportistas que corren, turistas que hacen fotos, oficinistas
// con prisa, personas mayores que pasean despacio, familias con niños,
// grupos de amigos y repartidores con cajas.
import { Agent } from "./npc.js";
import { ToyCharacter } from "./character.js";
import { randomPerson, workerLook, PERSON_TYPES } from "./look.js";
import { PRODUCTS } from "./config.js";

const CHAT_LINES = [
  "…",
  "¡Ja, ja!",
  "¿Sí?",
  "¡Qué bien!",
  "💬",
  "☕?",
  "¡Hola!",
];
// Pensamientos al pasear según el tipo de persona.
const MOODS = {
  nino: ["🎈", "🍦", "⚽", "¡Mira!"],
  mayor: ["🍞", "☀️", "¡Qué tiempo!", "🌷"],
  oficinista: ["📱", "☕", "⏰", "📈"],
  deportista: ["💪", "💦", "⏱️"],
  turista: ["📸", "🗺️", "😍"],
  estudiante: ["🎧", "📚", "🍕"],
  adulto: ["🛍️", "🙂", "🎶"],
};
// Cómo reparte su tiempo cada tipo (pesos relativos).
const ACTIVITIES = {
  adulto: { walk: 38, shop: 20, park: 12, chat: 12, bus: 10, leave: 8 },
  nino: { walk: 40, shop: 15, park: 30, chat: 5, bus: 5, leave: 5 },
  mayor: { walk: 28, shop: 14, park: 26, chat: 22, bus: 8, leave: 2 },
  oficinista: { walk: 40, shop: 24, park: 2, chat: 8, bus: 16, leave: 10 },
  deportista: { jog: 70, stretch: 14, walk: 6, leave: 10 },
  turista: { photo: 34, walk: 26, shop: 20, park: 10, bus: 6, leave: 4 },
  estudiante: { walk: 36, shop: 18, park: 12, chat: 18, bus: 12, leave: 4 },
  repartidor: { deliver: 100 },
};
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const rand = (a, b) => a + Math.random() * (b - a);
// Productos que puede llevar un repartidor (cualquiera con caja).
const PARCELS = Object.keys(PRODUCTS).filter((p) => !PRODUCTS[p].ingredient);

// Quien pasea solo puede ser de cualquier tipo salvo niño (los niños van
// siempre con una persona adulta).
const SOLO = Object.fromEntries(
  Object.entries(PERSON_TYPES)
    .filter(([id]) => id !== "nino")
    .map(([id, t]) => [id, t.weight]),
);

function weighted(table) {
  let total = 0;
  for (const w of Object.values(table)) total += w;
  let r = Math.random() * total;
  for (const [k, w] of Object.entries(table)) {
    r -= w;
    if (r < 0) return k;
  }
  return Object.keys(table)[0];
}

class Pedestrian extends Agent {
  // opts.type: tipo de persona (o "repartidor"); opts.leader: a quién
  // acompaña (familias y amigos).
  constructor(game, crowd, x, z, opts = {}) {
    const courier = opts.type === "repartidor";
    const person = courier ? null : randomPerson(undefined, opts.type);
    super(
      game,
      new ToyCharacter(
        courier
          ? { look: workerLook("naranja"), scale: 0.95 }
          : { look: person.look, scale: person.scale },
      ),
      x,
      z,
    );
    this.crowd = crowd;
    this.type = courier ? "repartidor" : person.type;
    this.walkSpeed = rand(1.4, 2.1) * (person?.speed ?? 1.15);
    this.speed = this.walkSpeed;
    this.state = "idle";
    this.timer = rand(0.2, 1.5);
    this.waveCooldown = rand(5, 15);
    this.moodCooldown = rand(4, 12);
    this.partner = null;
    this.leader = opts.leader ?? null;
    this.followers = [];
    this.followT = 0;
    this.offset = opts.offset ?? { x: 0.8, z: -0.4 };
    this.done = false;
    if (this.leader) this.leader.followers.push(this);
    if (courier) this.char.setCarry([pick(PARCELS)]);
  }

  hidden() {
    return !this.char.root.visible;
  }

  go(target, then, reach) {
    this.state = "walk";
    this.speed = this.walkSpeed;
    this.moveTo(target, then, reach);
  }

  idle(seconds) {
    this.state = "idle";
    this.timer = seconds;
  }

  pickActivity() {
    const c = this.crowd;
    // El parque y la parada de autobús solo existen en el barrio inicial.
    const home = c.zone() === "barrio";
    let act = weighted(ACTIVITIES[this.type] ?? ACTIVITIES.adulto);
    if (!home && (act === "park" || act === "bus")) act = "walk";
    // Quien lleva niños o amigos no se sube al autobús sin ellos.
    if (act === "bus" && this.followers.length) act = "walk";
    if (act === "walk")
      this.go(c.randomSidewalkPoint(), () => this.idle(this.pause()));
    else if (act === "shop") this.visitShop();
    else if (act === "park")
      this.go(c.randomParkPoint(), () =>
        this.idle(this.type === "mayor" ? rand(10, 18) : rand(5, 10)),
      );
    else if (act === "chat") {
      if (!this.tryChat()) this.idle(1);
    } else if (act === "bus") this.waitForBus();
    else if (act === "jog") this.jog();
    else if (act === "stretch") {
      this.char.playAction("pose", 1.6);
      this.char.think("💪", "#2e8a43", 1.4);
      this.idle(1.8);
    } else if (act === "photo") this.takePhoto();
    else if (act === "deliver") this.deliver();
    else this.go(c.exitPoint(), () => (this.done = true));
  }

  pause() {
    if (this.type === "mayor") return rand(2, 6);
    if (this.type === "oficinista") return rand(0.2, 1);
    return rand(0.5, 3);
  }

  // Deportista: corre de un punto de la acera a otro.
  jog() {
    this.state = "walk";
    this.speed = rand(3.3, 4.1);
    this.moveTo(this.crowd.randomSidewalkPoint(), () => this.idle(0.2), 0.6);
  }

  // Turista: se acerca a un edificio, lo mira y le hace una foto.
  takePhoto() {
    const b = pick(this.crowd.shops());
    this.go(
      b.doorPoint(rand(4, 6), rand(-3, 3)),
      () => {
        this.face(b.x, b.z);
        this.char.playAction("pose", 1.4);
        this.char.think("📸", "#2f6fd6", 1.6);
        this.idle(rand(1.5, 3));
      },
      1,
    );
  }

  // Repartidor: lleva una caja a la puerta de un comercio y se va.
  deliver() {
    const b = pick(this.crowd.shops());
    this.go(
      b.doorPoint(1.4, rand(-1, 1)),
      () => {
        this.face(b.x, b.z);
        this.char.setCarry([]);
        this.char.playAction("stock", 0.7);
        this.char.think("📦", "#e67e22", 1.6);
        this.waitTimer = 0.8;
        this.go(this.crowd.exitPoint(), () => (this.done = true));
      },
      0.8,
    );
  }

  visitShop() {
    const b = pick(this.crowd.shops());
    const lane = rand(0.5, 1.1);
    if (b.shutter) {
      // Cerrado: lo mira desde la acera, sin plantarse en la puerta.
      this.go(
        b.doorPoint(2.6, rand(-1.5, 1.5)),
        () => {
          this.face(b.x, b.z);
          this.char.think(b.id === "restaurante" ? "🔒" : "$", "#7f8c8d", 2);
          this.idle(2);
        },
        0.8,
      );
      return;
    }
    this.go(
      b.doorPoint(1.6, lane),
      () =>
        this.go(
          b.doorPoint(-1.2, lane),
          () => {
            this.char.root.visible = false;
            this.state = "inside";
            this.timer = rand(4, 9);
            this.shop = b;
          },
          0.6,
        ),
      0.6,
    );
  }

  tryChat() {
    const other = this.crowd.people.find(
      (p) =>
        p !== this &&
        p.state === "idle" &&
        !p.partner &&
        !p.leader &&
        p.type !== "repartidor" &&
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

  // Acompañante (niño o amigo): va al lado de quien lo lleva, entra y sale
  // de las tiendas con él y se va cuando se va.
  follow(dt) {
    const l = this.leader;
    if (!l || l.done || l.removed) {
      this.done = true;
      return;
    }
    if (l.hidden()) {
      // Entra detrás en la tienda cuando llega a la puerta.
      if (
        !this.hidden() &&
        Math.hypot(l.pos.x - this.pos.x, l.pos.z - this.pos.z) < 3
      ) {
        this.char.root.visible = false;
        this.target = null;
        this.path = [];
      }
      if (this.hidden()) return;
    } else if (this.hidden()) {
      // Sale con él.
      this.pos.x = l.pos.x + this.offset.x;
      this.pos.z = l.pos.z + this.offset.z;
      this.char.root.visible = true;
    }
    this.followT -= dt;
    if (this.followT > 0) return;
    this.followT = 0.5;
    const s = Math.sin(l.heading);
    const c = Math.cos(l.heading);
    // A su lado, un poco por detrás (en su sistema de referencia).
    const spot = {
      x: l.pos.x + c * this.offset.x + s * this.offset.z,
      z: l.pos.z - s * this.offset.x + c * this.offset.z,
    };
    const d = Math.hypot(spot.x - this.pos.x, spot.z - this.pos.z);
    if (d > 0.7) {
      // Si se queda atrás, corre un poco para alcanzarlo.
      this.speed = Math.max(this.walkSpeed, l.speed * (d > 3 ? 1.6 : 1.1));
      if (
        !this.target ||
        Math.hypot(this.target.x - spot.x, this.target.z - spot.z) > 0.8
      )
        this.moveTo(spot, null, 0.3);
    } else if (!this.target) {
      if (l.state === "chat") this.face(l.pos.x, l.pos.z);
      else this.heading = l.heading;
      if (this.type === "nino" && Math.random() < 0.08)
        this.char.playAction("cheer", 0.6);
    }
  }

  update(dt) {
    super.update(dt);
    if (this.leader) {
      this.follow(dt);
      this.mood(dt);
      return;
    }
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
      this.mood(dt);
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
      // Sale por el carril izquierdo y se aparta de la puerta.
      this.moveTo(
        this.shop.doorPoint(2.8, -rand(0.5, 1.1)),
        () => this.idle(0.2),
        0.8,
      );
      return;
    }
    if (this.state === "bus" && this.timer <= 0) this.idle(0.2);
    if (this.state === "idle" && this.timer <= 0 && !this.partner)
      this.pickActivity();
  }

  // De vez en cuando muestra lo que piensa (según su tipo).
  mood(dt) {
    this.moodCooldown -= dt;
    if (this.moodCooldown > 0 || this.hidden()) return;
    this.moodCooldown = rand(10, 22);
    const list = MOODS[this.type];
    if (list) this.char.think(pick(list), "#3e4a59", 1.4);
  }
}

const areaOf = ([x0, z0, x1, z1]) =>
  Math.max(0, x1 - x0) * Math.max(0, z1 - z0);

// Más gente donde hay más vida: la zona comercial y el distrito.
const ZONE_DENSITY = {
  barrio: 1,
  comercial: 1.3,
  residencial: 0.85,
  financiero: 1.2,
};

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

  // Cuántas personas debe haber donde está el jugador.
  wanted() {
    return Math.round(this.target * (ZONE_DENSITY[this.zone()] ?? 1));
  }

  // Zona donde está el jugador: los peatones viven donde se les ve.
  zone() {
    const p = this.game.player?.pos ?? { x: 0, z: 0 };
    const z = this.game.world.zones.find(
      (zn) =>
        p.x >= zn.rect[0] &&
        p.x <= zn.rect[2] &&
        p.z >= zn.rect[1] &&
        p.z <= zn.rect[3],
    );
    return z?.id ?? "barrio";
  }

  shops() {
    const w = this.game.world;
    const b = w.buildings;
    const zone = this.zone();
    if (zone !== "barrio") {
      const list = w.visitShops.filter((s) => w.zoneOf(s.x, s.z) === zone);
      if (list.length) return list;
    }
    return [
      b.boutique,
      b.mayorista,
      b.restaurante,
      b.casagrande,
      b.minimercado,
      b.cafeteria,
    ].filter(Boolean);
  }

  // Punto al azar en una acera de la zona (por superficie).
  randomSidewalkPoint() {
    const zone = this.zone();
    const areas = this.game.world.walkAreas.filter((a) => a.zone === zone);
    let total = 0;
    for (const a of areas) total += areaOf(a.rect);
    let r = Math.random() * total;
    for (const a of areas) {
      r -= areaOf(a.rect);
      if (r <= 0) {
        const [x0, z0, x1, z1] = a.rect;
        return { x: rand(x0, x1), z: rand(z0, z1) };
      }
    }
    return { x: rand(-70, 70), z: rand(5, 8.5) };
  }

  randomParkPoint() {
    const [x0, z0, x1, z1] = pick(this.game.world.parkAreas);
    return { x: rand(x0, x1), z: rand(z0, z1) };
  }

  exitPoint() {
    const zone = this.zone();
    const list = this.game.world.exitPoints.filter((p) => p.zone === zone);
    return pick(list.length ? list : this.game.world.exitPoints);
  }

  // Aparece una persona sola o un grupo (familia con niños, amigos o un
  // repartidor). Devuelve quien lo encabeza.
  spawn(at) {
    const p = at ?? this.exitPoint();
    const r = Math.random();
    const add = (opts, dx = 0, dz = 0) => {
      const ped = new Pedestrian(this.game, this, p.x + dx, p.z + dz, opts);
      this.people.push(ped);
      return ped;
    };
    if (r < 0.07) return add({ type: "repartidor" });
    if (r < 0.2) {
      // Familia: una persona adulta (o mayor) con uno o dos niños.
      const lead = add({ type: Math.random() < 0.3 ? "mayor" : "adulto" });
      const kids = Math.random() < 0.4 ? 2 : 1;
      for (let i = 0; i < kids; i++)
        add(
          {
            type: "nino",
            leader: lead,
            offset: { x: i ? -0.75 : 0.75, z: -0.35 },
          },
          i ? -0.6 : 0.6,
        );
      return lead;
    }
    if (r < 0.3) {
      // Amigos que pasean juntos.
      const type = pick(["estudiante", "turista", "adulto", "mayor"]);
      const lead = add({ type });
      add({ type, leader: lead, offset: { x: 0.85, z: 0 } }, 0.7);
      return lead;
    }
    return add({ type: weighted(SOLO) });
  }

  // El autobús deja pasajeros y recoge a quienes esperan.
  onBusStop() {
    for (const p of this.people) {
      if (p.state === "bus") p.done = true;
    }
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n && this.people.length < this.wanted() + 4; i++) {
      const p = this.spawn({
        x: this.busStop.x + rand(-1, 1),
        z: this.busStop.z + 0.8,
      });
      p.idle(rand(0.2, 1));
    }
  }

  update(dt) {
    const wanted = this.wanted();
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.people.length < wanted) {
      // Al principio (o al llegar a otra zona) aparecen enseguida y ya
      // repartidos por las aceras; después entran por los extremos.
      const few = this.people.length < wanted / 2;
      this.spawnTimer = few ? rand(0.2, 0.5) : rand(0.8, 2.2);
      this.spawn(few ? this.randomSidewalkPoint() : null);
    }
    for (const p of this.people) p.update(dt);
    const me = this.game.player?.pos;
    for (let i = this.people.length - 1; i >= 0; i--) {
      const p = this.people[i];
      // Quien se queda muy lejos del jugador (otra zona) desaparece y
      // aparece gente nueva donde está el jugador. Los acompañantes se van
      // con quien los lleva.
      const far =
        me && Math.abs(p.pos.x - me.x) + Math.abs(p.pos.z - me.z) > 170;
      const extra = !p.leader && this.people.length > wanted + 6;
      if (p.done || far || extra) {
        if (p.partner) p.partner.partner = null;
        if (p.leader)
          p.leader.followers = p.leader.followers.filter((f) => f !== p);
        p.removed = true;
        p.dispose();
        this.people.splice(i, 1);
      }
    }
  }

  positions() {
    return this.people.filter((p) => !p.hidden()).map((p) => p.pos);
  }
}
