// Vehículos de juguete: coches decorativos que circulan, scooter y furgoneta.
import * as THREE from "three";
import { mat, roundedBox, cylinder, mesh, box, sphere } from "./gfx.js";

function wheels(g, xs, zs, r = 0.3) {
  for (const x of xs) {
    for (const z of zs) {
      const w = mesh(cylinder(r, r, 0.22, 16), mat(0x2b2b33), x, r, z);
      w.rotation.z = Math.PI / 2;
      g.add(w);
      const hub = mesh(
        cylinder(r * 0.45, r * 0.45, 0.24, 10),
        mat(0xdddddd),
        x,
        r,
        z,
      );
      hub.rotation.z = Math.PI / 2;
      g.add(hub);
    }
  }
}

const glassMat = () => mat(0x9fdcff, { roughness: 0.1 });

// Coche redondeado; mira hacia +z.
export function toyCar(color) {
  const g = new THREE.Group();
  g.add(
    mesh(
      roundedBox(1.7, 0.7, 3.2, 0.3),
      mat(color, { roughness: 0.35 }),
      0,
      0.65,
      0,
    ),
  );
  g.add(
    mesh(
      roundedBox(1.45, 0.65, 1.7, 0.28),
      mat(color, { roughness: 0.35 }),
      0,
      1.2,
      -0.2,
    ),
  );
  g.add(mesh(roundedBox(1.5, 0.45, 1.5, 0.2), glassMat(), 0, 1.22, -0.2));
  for (const s of [-1, 1]) {
    g.add(
      mesh(
        sphere(0.12, 10),
        new THREE.MeshBasicMaterial({ color: 0xfff6c2 }),
        s * 0.55,
        0.75,
        1.58,
        false,
      ),
    );
    g.add(
      mesh(
        sphere(0.1, 10),
        new THREE.MeshBasicMaterial({ color: 0xff4d4d }),
        s * 0.6,
        0.75,
        -1.58,
        false,
      ),
    );
  }
  wheels(g, [-0.82, 0.82], [-1.0, 1.0], 0.34);
  return g;
}

export function toyVan(color = 0xffffff) {
  const g = new THREE.Group();
  g.add(
    mesh(
      roundedBox(1.9, 1.7, 3.8, 0.3),
      mat(color, { roughness: 0.35 }),
      0,
      1.15,
      -0.2,
    ),
  );
  g.add(
    mesh(
      roundedBox(1.85, 1.0, 1.0, 0.3),
      mat(color, { roughness: 0.35 }),
      0,
      0.85,
      1.9,
    ),
  );
  g.add(mesh(roundedBox(1.7, 0.6, 0.4, 0.15), glassMat(), 0, 1.6, 1.6));
  g.add(mesh(box(1.92, 0.35, 2.6), mat(0x2ec4c4), 0, 1.3, -0.5));
  wheels(g, [-0.9, 0.9], [-1.3, 1.6], 0.36);
  return g;
}

export function toyScooter(color = 0xff5a4e) {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(0.5, 0.18, 1.3, 0.08), mat(color), 0, 0.38, 0));
  g.add(mesh(roundedBox(0.45, 0.35, 0.55, 0.12), mat(color), 0, 0.6, -0.35));
  const stem = mesh(cylinder(0.04, 0.04, 0.9, 8), mat(0x555555), 0, 0.85, 0.55);
  stem.rotation.x = -0.25;
  g.add(stem);
  const bar = mesh(
    cylinder(0.035, 0.035, 0.7, 8),
    mat(0x333333),
    0,
    1.27,
    0.66,
  );
  bar.rotation.z = Math.PI / 2;
  g.add(bar);
  wheels(g, [0], [-0.55, 0.6], 0.2);
  return g;
}

export function toyBus() {
  const g = new THREE.Group();
  g.add(
    mesh(
      roundedBox(2.2, 2.2, 7.2, 0.35),
      mat(0xffc93c, { roughness: 0.35 }),
      0,
      1.45,
      0,
    ),
  );
  g.add(
    mesh(box(2.24, 0.7, 6.2), mat(0x9fdcff, { roughness: 0.1 }), 0, 1.95, -0.2),
  );
  g.add(mesh(box(2.25, 0.25, 7.0), mat(0xff7a45), 0, 0.95, 0));
  g.add(mesh(roundedBox(1.9, 0.5, 0.15, 0.08), mat(0x2f3542), 0, 2.4, 3.6));
  wheels(g, [-1.05, 1.05], [-2.4, 2.4], 0.42);
  return g;
}

// Semáforo de la intersección central: verde, ámbar y rojo por eje.
class TrafficLights {
  constructor(scene) {
    this.t = 0;
    this.lamps = { x: this.makeLamps(), z: this.makeLamps() };
    // [x, z, eje que controla, orientación de la cara]
    const poles = [
      [-5.6, 5.6, "x", -Math.PI / 2],
      [5.6, -5.6, "x", Math.PI / 2],
      [-5.6, -5.6, "z", Math.PI],
      [5.6, 5.6, "z", 0],
    ];
    for (const [x, z, axis, rot] of poles) {
      const g = new THREE.Group();
      g.add(mesh(cylinder(0.08, 0.1, 3.2, 8), mat(0x3e4a59), 0, 1.6, 0));
      g.add(mesh(roundedBox(0.42, 1.15, 0.32, 0.08), mat(0x2f3542), 0, 3.3, 0));
      const lamps = this.lamps[axis];
      ["red", "yellow", "green"].forEach((c, i) => {
        g.add(
          mesh(sphere(0.12, 12), lamps[c], 0, 3.66 - i * 0.36, 0.15, false),
        );
      });
      g.position.set(x, 0.12, z);
      g.rotation.y = rot;
      scene.add(g);
    }
  }

  makeLamps() {
    const make = (color) =>
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.05,
      });
    return {
      red: make(0xff3b30),
      yellow: make(0xffcc00),
      green: make(0x34c759),
    };
  }

  // Ciclo: x verde 12 s, ámbar 2.5, todo rojo 2, z verde 8, ámbar 2.5, rojo 2.
  state(axis) {
    const t = this.t % 29;
    const main = t < 12 ? "green" : t < 14.5 ? "yellow" : "red";
    const cross =
      t >= 16.5 && t < 24.5 ? "green" : t >= 24.5 && t < 27 ? "yellow" : "red";
    return axis === "x" ? main : cross;
  }

  update(dt) {
    this.t += dt;
    for (const axis of ["x", "z"]) {
      const st = this.state(axis);
      for (const [c, m] of Object.entries(this.lamps[axis]))
        m.emissiveIntensity = c === st ? 2.2 : 0.05;
    }
  }
}

// Vehículos por carriles con conducción por la derecha: frenan ante
// peatones, respetan el semáforo y mantienen la distancia.
export class Traffic {
  constructor(scene) {
    this.scene = scene;
    this.vehicles = [];
    this.lights = new TrafficLights(scene);
    const colors = [
      0xff6b6b, 0x4dabf7, 0xffd43b, 0x69db7c, 0xb197fc, 0xff922b, 0x63e6be,
      0xf783ac, 0xffa94d,
    ];
    for (let i = 0; i < 6; i++)
      this.add(toyCar(colors[i]), "x", i % 2 ? -1 : 1, -66 + i * 24, {
        speed: 6 + (i % 3),
      });
    for (let i = 0; i < 3; i++)
      this.add(toyCar(colors[6 + i]), "z", i % 2 ? -1 : 1, -40 + i * 30, {
        speed: 5.5 + i,
      });
    this.bus = this.add(toyBus(), "x", -1, 60, {
      speed: 5.5,
      len: 3.7,
      width: 1.15,
      kind: "bus",
    });
    this.busStopX = 33;
  }

  // Carril por la derecha según eje y sentido.
  laneFor(axis, dir) {
    return axis === "x" ? dir * 2 : -dir * 2;
  }

  add(meshObj, axis, dir, along, opts = {}) {
    const lane = this.laneFor(axis, dir);
    if (axis === "x") meshObj.position.set(along, 0, lane);
    else meshObj.position.set(lane, 0, along);
    meshObj.rotation.y =
      axis === "x" ? (dir * Math.PI) / 2 : dir > 0 ? 0 : Math.PI;
    this.scene.add(meshObj);
    const v = {
      mesh: meshObj,
      axis,
      dir,
      lane,
      speed: 6,
      current: 0,
      len: 1.7,
      width: 0.9,
      kind: "car",
      wait: 0,
      ...opts,
    };
    this.vehicles.push(v);
    return v;
  }

  // Camión de reparto que se detiene frente a una puerta del lado norte.
  spawnTruck(stopX, onArrive) {
    const truck = toyVan(0xffd166);
    const v = this.add(truck, "x", -1, 80, {
      speed: 8,
      len: 2.3,
      width: 1.0,
      kind: "truck",
      stopAt: stopX,
      onArrive,
      remove: true,
    });
    return v;
  }

  along(v) {
    return v.axis === "x" ? v.mesh.position.x : v.mesh.position.z;
  }

  update(dt, obstacles) {
    this.lights.update(dt);
    for (const v of this.vehicles) this.drive(v, dt, obstacles);
    this.vehicles = this.vehicles.filter((v) => {
      if (!v.dead) return true;
      this.scene.remove(v.mesh);
      return false;
    });
  }

  drive(v, dt, obstacles) {
    const p = v.mesh.position;
    const a = this.along(v);
    let limit = v.speed;
    if (v.wait > 0) {
      v.wait -= dt;
      limit = 0;
      if (v.wait <= 0 && v.kind === "truck") v.stopAt = null;
    }
    // Personas delante. Si alguien bloquea mucho rato (p. ej. atascado
    // junto al vehículo), avanza despacio tras pitar para deshacer el nudo.
    let personAhead = false;
    for (const o of obstacles) {
      const ahead = ((v.axis === "x" ? o.x : o.z) - a) * v.dir;
      const lateral = Math.abs((v.axis === "x" ? o.z : o.x) - v.lane);
      if (ahead > v.len * 0.6 && ahead < v.len + 4 && lateral < v.width + 0.7) {
        personAhead = true;
        if (v.creep <= 0)
          limit = Math.min(limit, Math.max(0, (ahead - v.len - 1) * 2));
      }
    }
    v.blocked = personAhead && v.current < 0.3 ? (v.blocked ?? 0) + dt : 0;
    v.creep = Math.max(0, (v.creep ?? 0) - dt);
    if (v.blocked > 4) {
      v.blocked = 0;
      v.creep = 2;
      this.onHorn?.(v);
    }
    if (v.creep > 0) limit = Math.min(limit, 1.5);
    // Vehículo delante en el mismo carril.
    for (const o of this.vehicles) {
      if (o === v || o.axis !== v.axis || o.dir !== v.dir) continue;
      const gap = (this.along(o) - a) * v.dir - o.len - v.len;
      if (gap > -1 && gap < 6)
        limit = Math.min(limit, Math.max(0, (gap - 1.2) * 1.5));
    }
    // Semáforo: línea de detención a 6 m del centro del cruce.
    const front = a + v.dir * v.len;
    const toLine = (-6 * v.dir - front) * v.dir;
    const light = this.lights.state(v.axis);
    if (
      toLine > -0.2 &&
      toLine < 14 &&
      (light === "red" || (light === "yellow" && toLine > 3))
    ) {
      limit = Math.min(limit, Math.max(0, toLine * 1.1));
    }
    // No quedarse parado encima de un paso de cebra: si al otro lado no hay
    // sitio (cola del semáforo), espera antes de pisarlo.
    for (const [c0, c1] of this.crosswalkSpans?.[v.axis] ?? []) {
      const start = v.dir > 0 ? c0 : c1;
      const end = v.dir > 0 ? c1 : c0;
      const toStart = (start - front) * v.dir;
      if (toStart < -0.1 || toStart > 8) continue;
      if (this.roomAfter(v, end, light) < v.len * 2 + 1.5)
        limit = Math.min(limit, Math.max(0, (toStart - 0.4) * 1.5));
    }
    // Paradas programadas (autobús y reparto).
    const stopX =
      v.kind === "bus" ? (v.served ? null : this.busStopX) : v.stopAt;
    if (stopX != null && v.wait <= 0) {
      const d = (stopX - a) * v.dir;
      if (d > -0.3 && d < 14) {
        limit = Math.min(limit, Math.max(0, d * 0.9));
        if (d < 0.4 && v.current < 0.4) this.arrive(v);
      }
    }
    v.current +=
      (limit - v.current) * Math.min(1, dt * (limit < v.current ? 5 : 1.4));
    if (v.axis === "x") p.x += v.dir * v.current * dt;
    else p.z += v.dir * v.current * dt;
    this.wrap(v);
  }

  // crosswalks: rectángulos [x0, z0, x1, z1] de los pasos de cebra.
  setCrosswalks(crosswalks) {
    this.crosswalkSpans = { x: [], z: [] };
    for (const [x0, z0, x1, z1] of crosswalks) {
      if (x1 - x0 < z1 - z0) this.crosswalkSpans.x.push([x0, x1]);
      else this.crosswalkSpans.z.push([z0, z1]);
    }
  }

  // Espacio libre en el carril más allá de `end`: hasta la trasera del
  // vehículo lento más próximo o hasta la línea del semáforo en rojo.
  roomAfter(v, end, light) {
    let room = Infinity;
    for (const o of this.vehicles) {
      if (o === v || o.axis !== v.axis || o.dir !== v.dir || o.current > 1)
        continue;
      const rear = (this.along(o) - end) * v.dir - o.len;
      if (rear > -o.len * 2) room = Math.min(room, rear);
    }
    if (light !== "green") {
      const line = (-6 * v.dir - end) * v.dir;
      if (line > 0) room = Math.min(room, line);
    }
    return room;
  }

  arrive(v) {
    if (v.kind === "bus") {
      v.served = true;
      v.wait = 5;
      this.onBusStop?.(v);
    } else {
      v.wait = 3;
      v.onArrive?.();
      v.onArrive = null;
      v.stopAt = -999;
    }
    this.onHorn?.(v);
  }

  wrap(v) {
    const p = v.mesh.position;
    if (v.axis === "x" && Math.abs(p.x) > 80) {
      if (v.remove) v.dead = true;
      p.x = -Math.sign(p.x) * 80;
      v.served = false;
    }
    if (v.axis === "z" && (p.z < -54 || p.z > 58)) p.z = p.z < 0 ? 58 : -54;
  }

  nearestDistance(pos) {
    let best = Infinity;
    for (const v of this.vehicles)
      best = Math.min(
        best,
        Math.hypot(v.mesh.position.x - pos.x, v.mesh.position.z - pos.z),
      );
    return best;
  }

  // Empuja a personas fuera de la caja de cada vehículo.
  pushOut(pos, radius) {
    for (const v of this.vehicles) {
      const p = v.mesh.position;
      const dx = pos.x - p.x;
      const dz = pos.z - p.z;
      const hx = (v.axis === "x" ? v.len : v.width) + radius;
      const hz = (v.axis === "x" ? v.width : v.len) + radius;
      if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
        const px = hx - Math.abs(dx);
        const pz = hz - Math.abs(dz);
        if (px < pz) pos.x += Math.sign(dx || 1) * px;
        else pos.z += Math.sign(dz || 1) * pz;
      }
    }
  }
}
