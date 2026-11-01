// Tiempo: días de lluvia con gotas que caen alrededor de la cámara,
// charcos que aparecen al mojarse el suelo (y se secan después) y
// paraguas para quien va por la calle.
//
// Cada día tiene su tiempo según su número (semilla): en online todos los
// jugadores de la ciudad ven la misma lluvia porque el día lo da el
// servidor. En online la lluvia es solo visual; en un jugador, además,
// llegan menos clientes y hay menos gente por la calle.
import * as THREE from "three";
import { DAY_SECONDS } from "./config.js";
import { rng } from "./music.js";

// Probabilidad de que llueva un día y cuánto dura (fracción del día).
const RAIN_CHANCE = 0.25;
// Clientes con lluvia (un jugador) y gente por la calle.
const RAIN_CUSTOMERS = 0.8;
const RAIN_CROWD = 0.6;
const DROPS = { baja: 250, media: 600, alta: 900 };
const BOX = { w: 44, h: 22 };

export class Weather {
  constructor(game) {
    this.game = game;
    this.rain = 0;
    this.wet = 0;
    this.day = -1;
    this.window = null;
    this.umbrellaTimer = 0;
    this.buildDrops();
    this.buildPuddles();
    this.umbrellaGeo = {
      canopy: new THREE.ConeGeometry(0.62, 0.3, 10, 1, true),
      stick: new THREE.CylinderGeometry(0.015, 0.015, 0.9, 5),
    };
    this.umbrellaMats = [0xe74c3c, 0x3d8bff, 0xffc22e, 0x2ecc71, 0x9b59b6, 0x2d3436].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: 0.6 }),
    );
    this.stickMat = new THREE.MeshStandardMaterial({ color: 0x3e4a59 });
  }

  get raining() {
    return this.rain > 0.3;
  }

  // Lluvia del día `day`: { start, end } en segundos del día, o null.
  plan(day) {
    const r = rng(day * 7919 + 1301);
    if (day < 2 || r() > RAIN_CHANCE) return null;
    const start = (0.15 + r() * 0.45) * DAY_SECONDS;
    return { start, end: start + (0.25 + r() * 0.25) * DAY_SECONDS };
  }

  customerFactor() {
    return this.game.online ? 1 : 1 - (1 - RAIN_CUSTOMERS) * this.rain;
  }

  crowdFactor() {
    return 1 - (1 - RAIN_CROWD) * this.rain;
  }

  buildDrops() {
    const n = DROPS.alta;
    const pos = new Float32Array(n * 6);
    this.dropData = [];
    for (let i = 0; i < n; i++)
      this.dropData.push({
        x: (Math.random() - 0.5) * BOX.w,
        y: Math.random() * BOX.h,
        z: (Math.random() - 0.5) * BOX.w,
        v: 14 + Math.random() * 6,
      });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.dropMat = new THREE.LineBasicMaterial({
      color: 0xc9dcf2,
      transparent: true,
      opacity: 0,
    });
    this.drops = new THREE.LineSegments(geo, this.dropMat);
    this.drops.frustumCulled = false;
    this.drops.visible = false;
    this.game.scene.add(this.drops);
  }

  // Charcos en aceras y calles del barrio y de las zonas (un solo dibujo).
  buildPuddles() {
    const w = this.game.world;
    const r = rng(777);
    const areas = w.walkAreas.map((a) => a.rect);
    const spots = [];
    for (let i = 0; i < 260 && spots.length < 90; i++) {
      const [x0, z0, x1, z1] = areas[Math.floor(r() * areas.length)];
      const x = x0 + r() * (x1 - x0);
      const z = z0 + r() * (z1 - z0);
      if (w.physics.blocked?.(x, z)) continue;
      spots.push([x, z, 0.5 + r() * 0.9, r() * Math.PI]);
    }
    const geo = new THREE.CircleGeometry(1, 18);
    geo.rotateX(-Math.PI / 2);
    this.puddleMat = new THREE.MeshStandardMaterial({
      color: 0x5f7fa6,
      roughness: 0.05,
      metalness: 0.4,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const inst = new THREE.InstancedMesh(geo, this.puddleMat, spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    spots.forEach(([x, z, s, a], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
      m.compose(
        new THREE.Vector3(x, w.physics.groundHeight(x, z) + 0.02, z),
        q,
        new THREE.Vector3(s * 1.4, 1, s),
      );
      inst.setMatrixAt(i, m);
    });
    inst.visible = false;
    inst.renderOrder = 1;
    this.puddles = inst;
    this.game.scene.add(inst);
  }

  update(dt, camera) {
    const g = this.game;
    const day = g.state.day;
    if (day !== this.day) {
      this.day = day;
      this.window = this.plan(day);
    }
    const c = g.state.clock;
    const target =
      this.window && c >= this.window.start && c < this.window.end ? 1 : 0;
    this.rain += (target - this.rain) * Math.min(1, dt / 6);
    if (this.rain < 0.002) this.rain = 0;
    // El suelo se moja deprisa y se seca despacio.
    this.wet += (this.rain > 0.2 ? dt / 40 : -dt / 90);
    this.wet = Math.max(0, Math.min(1, this.wet));
    this.puddleMat.opacity = this.wet * 0.55;
    this.puddles.visible = this.wet > 0.01;
    this.updateDrops(dt, camera);
    this.umbrellaTimer -= dt;
    if (this.umbrellaTimer <= 0) {
      this.umbrellaTimer = 0.5;
      this.updateUmbrellas();
    }
  }

  updateDrops(dt, camera) {
    const on = this.rain > 0.02;
    this.drops.visible = on;
    if (!on) return;
    const n = DROPS[this.game.settings.quality] ?? DROPS.media;
    this.dropMat.opacity = 0.55 * this.rain;
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    const pos = this.drops.geometry.attributes.position.array;
    const shown = Math.floor(n * this.rain);
    for (let i = 0; i < shown; i++) {
      const d = this.dropData[i];
      d.y -= d.v * dt;
      if (d.y < 0) {
        d.y += BOX.h;
        d.x = (Math.random() - 0.5) * BOX.w;
        d.z = (Math.random() - 0.5) * BOX.w;
      }
      const x = cx + d.x;
      const y = cy - BOX.h / 2 + d.y;
      const z = cz + d.z;
      const k = i * 6;
      pos[k] = x;
      pos[k + 1] = y;
      pos[k + 2] = z;
      pos[k + 3] = x + 0.04;
      pos[k + 4] = y - 0.45;
      pos[k + 5] = z;
    }
    this.drops.geometry.setDrawRange(0, shown * 2);
    this.drops.geometry.attributes.position.needsUpdate = true;
  }

  // Paraguas abiertos para quien va por la calle cuando llueve.
  updateUmbrellas() {
    const g = this.game;
    const people = [...g.crowd.people];
    for (const b of Object.values(g.businesses)) people.push(...b.customers);
    people.push(...(g.competition?.agents() ?? []));
    const buildings = Object.values(g.world.buildings);
    for (const p of people) {
      if (!p.char || p.street?.customer === p) continue;
      const outside =
        !p.hidden?.() &&
        !buildings.some((b) => b.contains(p.pos.x, p.pos.z, 0.2));
      const want = this.raining && outside && p.type !== "repartidor";
      if (want && !p.char.umbrella) {
        const u = new THREE.Group();
        const mat = this.umbrellaMats[Math.abs(p.seed ?? p.netId) % this.umbrellaMats.length];
        const canopy = new THREE.Mesh(this.umbrellaGeo.canopy, mat);
        canopy.position.y = 2.35;
        const stick = new THREE.Mesh(this.umbrellaGeo.stick, this.stickMat);
        stick.position.y = 1.85;
        u.add(canopy, stick);
        u.position.set(0.18, 0, 0.05);
        p.char.root.add(u);
        p.char.umbrella = u;
      }
      if (p.char.umbrella) p.char.umbrella.visible = want;
    }
  }
}
