// Etapa Magnate: metas grandes hasta el millón, visibles en la ciudad.
//
// - Cadena «Mi Tiendita Express»: quioscos franquicia en las plazas de
//   cada zona; cada uno deja dinero cada segundo mientras juegas.
// - Fondo Millonario (oficina en la plaza del distrito financiero):
//   participaciones cuyo valor sube con el tiempo jugado, con altibajos.
// - Torre Imperio: el rascacielos del distrito lleva tu nombre, con
//   corona luminosa, y deja una renta grande.
// - Al llegar al millón de patrimonio: celebración con las estadísticas
//   de la partida.
//
// Las reglas (precios, rentas, valor del fondo) están en config.js y son
// las mismas que valida el servidor en online (economy.js).
import * as THREE from "three";
import {
  EMPIRE,
  STAGES,
  GOAL_NET_WORTH,
  franchisePrice,
  empireIncome,
  fundPrice,
} from "./config.js";
import { mat, mesh, box, roundedBox, cylinder, signMesh } from "./gfx.js";

const fresh = () => ({ franchises: 0, tower: false, fundUnits: 0, fundPaid: 0 });

export class Empire {
  constructor(game) {
    this.game = game;
    this.kiosks = [];
    this.spots = this.findSpots();
    this.tower = null;
  }

  get data() {
    return (this.game.state.empire ??= fresh());
  }

  // Minutos de juego (reloj del fondo). En online el servidor lleva su
  // propia cuenta; aquí se sigue localmente entre respuestas.
  minutes() {
    return (this.game.state.stats.playSeconds ?? 0) / 60;
  }

  price() {
    return fundPrice(this.minutes());
  }

  fundValue() {
    return this.data.fundUnits * this.price();
  }

  // Lo que suman franquicias, torre y fondo al patrimonio.
  worth() {
    const e = this.data;
    let w = this.fundValue();
    for (let i = 0; i < e.franchises; i++) w += franchisePrice(i) * 0.8;
    if (e.tower) w += EMPIRE.tower.price * 0.8;
    return w;
  }

  unlocked() {
    return this.game.stageIndex() >= EMPIRE.stage;
  }

  // Sitios para los quioscos: en las plazas (de cada zona), libres de
  // colisiones y separados entre sí. Siempre los mismos.
  findSpots() {
    const w = this.game.world;
    const spots = [];
    const zones = new Map();
    for (const r of w.mapRects.filter((m) => m.kind === "plaza")) {
      const [x0, z0, x1, z1] = r.rect;
      const zone = w.zoneOf((x0 + x1) / 2, (z0 + z1) / 2);
      if ((zones.get(zone) ?? 0) >= 4) continue;
      for (let x = x0 + 3; x <= x1 - 3 && (zones.get(zone) ?? 0) < 4; x += 2) {
        let placed = false;
        for (let z = z0 + 3; z <= z1 - 3; z += 2) {
          if (w.physics.near(x - 2.6, z - 2.2, x + 2.6, z + 2.2).length) continue;
          if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 11)) continue;
          spots.push({ x, z, zone });
          zones.set(zone, (zones.get(zone) ?? 0) + 1);
          placed = true;
          break;
        }
        if (placed) x += 10;
      }
    }
    return spots.slice(0, EMPIRE.franchises);
  }

  setup() {
    for (let i = this.kiosks.length; i < this.data.franchises; i++) this.buildKiosk(i);
    if (this.data.tower) this.buildTower();
  }

  // Quiosco franquicia: mostrador con toldo, cartel y cajas de colores.
  buildKiosk(i) {
    const s = this.spots[i];
    if (!s || this.kiosks[i]) return;
    const g = new THREE.Group();
    g.add(mesh(roundedBox(3.6, 1.1, 1.6, 0.1), mat(0x2fb3a8), 0, 0.55, 0));
    g.add(mesh(box(3.7, 0.08, 1.7), mat(0xfff1d6), 0, 1.12, 0));
    for (const x of [-1.7, 1.7])
      g.add(mesh(cylinder(0.06, 0.06, 1.6, 6), mat(0xffffff), x, 1.9, 0.7));
    const aw = mesh(box(4.0, 0.12, 2.2), mat(0x3fbf5f), 0, 2.75, 0.2);
    aw.rotation.x = -0.12;
    g.add(aw);
    const sign = signMesh("MI TIENDITA EXPRESS", 3.4, 0.55, { bg: "#ffffff", fg: "#1f8f86" });
    sign.position.set(0, 3.15, 0.9);
    g.add(sign);
    const colors = [0xff4d4d, 0x3d8bff, 0xffc22e, 0x5bd47a, 0xff8a3d];
    for (let k = 0; k < 7; k++)
      g.add(mesh(box(0.32, 0.36, 0.26), mat(colors[k % 5]), -1.4 + k * 0.46, 1.34, -0.3));
    g.position.set(s.x, 0.12, s.z);
    this.game.scene.add(g);
    this.game.world.physics.addCentered(s.x, s.z, 3.8, 1.8);
    this.kiosks[i] = g;
  }

  // La Torre Imperio pasa a ser tuya: cartel nuevo y corona luminosa.
  buildTower() {
    const t = this.game.world.empireTower;
    if (!t || this.tower) return;
    const g = new THREE.Group();
    const label = this.game.online?.me?.name ?? "MI TIENDITA";
    for (const side of [1, -1]) {
      const s = signMesh(`TORRE ${label.toUpperCase()}`, Math.min(t.w - 2, 12), 1.6, {
        bg: "#1d2b44",
        fg: "#ffd23f",
      });
      s.material.emissive = new THREE.Color(0xffffff);
      s.material.emissiveMap = s.material.map;
      s.material.emissiveIntensity = 0.7;
      s.position.set(0, t.h - 3, side * (t.d / 2 + 0.12));
      if (side < 0) s.rotation.y = Math.PI;
      g.add(s);
    }
    const gold = new THREE.MeshStandardMaterial({
      color: 0xffd23f,
      emissive: 0xffb000,
      emissiveIntensity: 0.8,
      metalness: 0.6,
      roughness: 0.3,
    });
    g.add(mesh(cylinder(3.2, 4.2, 2.4, 8), gold, 0, t.h + 3.2, 0));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      g.add(mesh(cylinder(0.05, 0.4, 2.2, 5), gold, Math.cos(a) * 3.4, t.h + 5.4, Math.sin(a) * 3.4));
    }
    g.position.copy(t.group.position);
    this.game.scene.add(g);
    this.tower = g;
  }

  interactables() {
    const at = this.game.world.empireOffice;
    if (!at) return [];
    return [
      {
        x: at.x,
        z: at.z,
        radius: 2.4,
        label: () => ({
          text: this.unlocked()
            ? "🏦 Fondo Millonario · franquicias e inversiones"
            : `🏦 Fondo Millonario · desde la etapa ${STAGES[EMPIRE.stage].name}`,
          enabled: true,
        }),
        action: () => this.game.ui.openEmpire(),
      },
    ];
  }

  // Aplica la respuesta del servidor (online).
  sync(r) {
    if (r?.empire) Object.assign(this.data, r.empire);
    if (typeof r?.price === "number") this.serverPrice = r.price;
    this.setup();
  }

  async buyFranchise() {
    const g = this.game;
    const e = this.data;
    if (!this.unlocked() || e.franchises >= EMPIRE.franchises) return false;
    const price = franchisePrice(e.franchises);
    if (g.online) {
      const r = await g.serverAction("franchise", {});
      if (!r.ok) return false;
      this.sync(r);
    } else {
      if (!g.spend(price)) return false;
      e.franchises++;
      this.setup();
    }
    g.state.stats.expenses += price;
    g.ui.toast(`🏪 Nueva franquicia Mi Tiendita Express (${e.franchises}/${EMPIRE.franchises})`, "good");
    g.audio.cue("bigbuy");
    g.save();
    return true;
  }

  async buyTower() {
    const g = this.game;
    const e = this.data;
    if (!this.unlocked() || e.tower || e.franchises < 3) return false;
    if (g.online) {
      const r = await g.serverAction("tower", {});
      if (!r.ok) return false;
      this.sync(r);
    } else {
      if (!g.state.unlocked.financiero) {
        g.ui.toast("Desbloquea el distrito financiero", "bad");
        return false;
      }
      if (!g.spend(EMPIRE.tower.price)) return false;
      e.tower = true;
      this.setup();
    }
    g.ui.toast("🏙️ ¡La Torre Imperio ya lleva tu nombre!", "good");
    g.audio.cue("stage");
    g.save();
    return true;
  }

  async invest(amount) {
    const g = this.game;
    const e = this.data;
    if (!this.unlocked()) return false;
    amount = Math.floor(amount);
    if (amount < EMPIRE.fund.min || amount > g.state.money) {
      g.ui.toast(`Invierte entre $${EMPIRE.fund.min} y lo que tienes`, "bad");
      return false;
    }
    if (g.online) {
      const r = await g.serverAction("fund", { op: "buy", amount });
      if (!r.ok) return false;
      this.sync(r);
    } else {
      const price = this.price();
      const units = Math.floor((amount / price) * 1000) / 1000;
      const cost = Math.round(units * price * 100) / 100;
      g.state.money -= cost;
      e.fundUnits = Math.round((e.fundUnits + units) * 1000) / 1000;
      e.fundPaid = Math.round((e.fundPaid + cost) * 100) / 100;
    }
    g.audio.sfx("buy");
    g.save();
    return true;
  }

  async sellAll() {
    const g = this.game;
    const e = this.data;
    if (!(e.fundUnits > 0)) return false;
    let value;
    if (g.online) {
      const r = await g.serverAction("fund", { op: "sell", units: e.fundUnits });
      if (!r.ok) return false;
      value = r.value;
      this.sync(r);
    } else {
      value = Math.round(e.fundUnits * this.price() * 100) / 100;
      g.state.money += value;
      e.fundUnits = 0;
      e.fundPaid = 0;
    }
    g.ui.floatMoney(value);
    g.audio.sfx("cash");
    g.save();
    return true;
  }

  update(dt) {
    const g = this.game;
    const st = g.state.stats;
    st.playSeconds = (st.playSeconds ?? 0) + dt;
    // Un jugador: las rentas se suman aquí; en online las suma el servidor.
    if (!g.online) {
      const income = empireIncome(this.data) * dt;
      if (income > 0) {
        g.state.money += income;
        st.passive = (st.passive ?? 0) + income;
      }
    }
    this.checkMillion();
  }

  // Celebración (una vez) al llegar al millón de patrimonio.
  checkMillion() {
    const g = this.game;
    if (g.state.millionaire || g.netWorth() < GOAL_NET_WORTH) return;
    g.state.millionaire = { day: g.state.day, seconds: g.state.stats.playSeconds };
    g.audio.cue("million");
    g.ui.showMillion(this.summary());
    g.save();
  }

  // Estadísticas de la partida para la celebración.
  summary() {
    const g = this.game;
    const s = g.state.stats;
    let streetIn = 0;
    const owned = Object.values(g.businesses).filter((b) => b.owned);
    for (const b of owned) streetIn += b.today.entered;
    return {
      days: g.state.day,
      minutes: Math.round((s.playSeconds ?? 0) / 60),
      revenue: Math.round(s.revenue),
      sales: s.sales,
      expenses: Math.round(s.expenses),
      businesses: owned.map((b) => b.name),
      franchises: this.data.franchises,
      tower: this.data.tower,
      fund: Math.round(this.fundValue()),
      passive: Math.round(s.passive ?? 0),
      rivals: s.rivalsBought ?? 0,
      surprises: s.surprises ?? 0,
      encargos: s.encargos ?? 0,
      streetToday: streetIn,
      worth: Math.round(g.netWorth()),
    };
  }
}
