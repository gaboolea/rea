// La ciudad y las tiendas conectadas: parte de la gente que pasa por la
// calle se para delante de una tienda del jugador (o del rival), mira el
// escaparate, piensa algo (💸 caro, 😍 bonito, 🛒 voy a entrar, ❌ está
// vacía) y puede entrar. Al entrar el peatón se convierte en cliente
// (Customer) con su mismo personaje, tipo y semilla; al salir vuelve a ser
// peatón y sigue su paseo. Las familias y los amigos entran y salen juntos.
//
// Cuántos clientes llegan en total lo sigue decidiendo cada negocio
// (Business.spawnInterval → demand): los que entran desde la calle gastan
// esa demanda y sustituyen a los que llegarían solos.

// Distancia a la puerta a la que alguien «pasa por delante».
const PASS_RADIUS = 8;
// Segundos antes de que la misma persona vuelva a fijarse en una tienda.
const SEEN_AGAIN = 90;
// Quién no se para nunca (va corriendo o trabajando).
const NEVER = new Set(["repartidor", "deportista"]);
// Pararse depende también de quién es.
const NOTICE_BY_TYPE = { oficinista: 0.5, turista: 1.3, mayor: 1.2 };
// Peatones que van a comprar a propósito (actividad «shop»): parte va a
// las tiendas del jugador o del rival en vez de a los demás comercios.
const SHOP_TRIP = 0.7;
// Paseos que pasan por delante de una tienda del jugador.
const STROLL_PAST = 0.3;

const THOUGHT = {
  pretty: ["😍", "#e84393"],
  look: ["👀", "#3e4a59"],
  enter: ["🛒", "#2e8a43"],
  pricey: ["💸", "#c0392b"],
  empty: ["❌", "#c0392b"],
  meh: ["🤔", "#7f8c8d"],
  full: ["⏳", "#7f8c8d"],
};

export class StreetFlow {
  constructor(game) {
    this.game = game;
    this.time = 0;
    this.tick = 0;
  }

  // Negocios donde puede entrar la gente de la calle: los propios (no los
  // de otros jugadores, que son de su navegador) y los rivales del juego.
  shops() {
    const list = Object.values(this.game.businesses).filter(
      (b) => b.owned && !b.remote && b.displays.length,
    );
    for (const r of this.game.competition?.active() ?? []) list.push(r);
    return list;
  }

  zoneOf(b) {
    return this.game.world.zoneOf(b.building.x, b.building.z);
  }

  // Hay peatones paseando por la zona del negocio (si no, sus clientes
  // llegan solos como siempre).
  covers(b) {
    const crowd = this.game.crowd;
    if (!crowd || this.game.mode === "title") return false;
    return crowd.zone() === this.zoneOf(b) && crowd.people.length >= 3;
  }

  update(dt) {
    this.time += dt;
    this.tick -= dt;
    if (this.tick > 0) return;
    this.tick = 0.25;
    const crowd = this.game.crowd;
    const zone = crowd.zone();
    const shops = this.shops().filter((b) => this.zoneOf(b) === zone);
    if (!shops.length) return;
    for (const p of crowd.people) {
      if (p.leader || p.customer || p.hidden() || NEVER.has(p.type)) continue;
      if (p.state !== "walk" && p.state !== "idle") continue;
      for (const b of shops) {
        const door = b.building.doorPoint(2);
        if (Math.hypot(p.pos.x - door.x, p.pos.z - door.z) > PASS_RADIUS)
          continue;
        if (!this.fresh(p, b)) continue;
        b.today.passed++;
        if (!b.acceptsWalkIn()) continue;
        const a = b.appeal();
        if (Math.random() < a.notice * (NOTICE_BY_TYPE[p.type] ?? 1)) {
          p.lookWindow(b, false);
          break;
        }
      }
    }
  }

  fresh(p, b) {
    const last = p.seenShops.get(b);
    if (last !== undefined && this.time - last < SEEN_AGAIN) return false;
    p.seenShops.set(b, this.time);
    return true;
  }

  // Quien sale a comprar elige tienda: la del jugador, la del rival o
  // ninguna (null: va a otro comercio). Pesa lo atractiva que es (precio,
  // género, reputación, aspecto) y lo lejos que está.
  chooseShop(p) {
    if (p.type === "repartidor" || Math.random() > SHOP_TRIP) return null;
    const zone = this.game.crowd.zone();
    const options = this.shops()
      .filter((b) => this.zoneOf(b) === zone && b.acceptsWalkIn())
      .map((b) => {
        const door = b.building.doorPoint(2);
        const dist = Math.hypot(p.pos.x - door.x, p.pos.z - door.z);
        return { b, w: b.appeal().enter / (1 + dist / 35) };
      });
    let total = 0;
    for (const o of options) total += o.w;
    if (!total) return null;
    let r = Math.random() * total;
    for (const o of options) {
      r -= o.w;
      if (r <= 0) {
        if (!this.fresh(p, o.b)) return null;
        o.b.today.passed++;
        return o.b;
      }
    }
    return null;
  }

  // Paseos: parte de la gente pasa por delante de una tienda del jugador
  // (por la acera de enfrente de su puerta) en vez de ir a cualquier punto.
  strollPoint() {
    if (Math.random() > STROLL_PAST) return null;
    const zone = this.game.crowd.zone();
    const shops = this.shops().filter((b) => this.zoneOf(b) === zone);
    if (!shops.length) return null;
    const b = shops[Math.floor(Math.random() * shops.length)];
    const side = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 6);
    return b.building.doorPoint(3 + Math.random() * 1.5, side);
  }

  think(p, kind, seconds = 1.6) {
    const [t, c] = THOUGHT[kind];
    p.char.think(t, c, seconds);
  }

  // Llega al escaparate: primera impresión.
  firstLook(p, b) {
    b.today.stopped++;
    this.think(p, b.appeal().pretty ? "pretty" : "look");
  }

  // Tras mirar un momento decide si entra.
  decide(p, b) {
    const a = b.appeal();
    const chance = p.windowShop?.intent ? Math.min(0.95, a.enter * 1.7) : a.enter;
    p.windowShop = null;
    if (!b.acceptsWalkIn()) {
      this.think(p, "full");
      p.idle(0.5);
      return;
    }
    if (Math.random() < chance) {
      this.think(p, "enter", 1.4);
      b.admit(p);
      return;
    }
    this.think(p, a.empty ? "empty" : a.pricey ? "pricey" : "meh");
    p.idle(0.6);
  }
}
