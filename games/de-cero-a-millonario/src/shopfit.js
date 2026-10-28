// Instalaciones de la tienda automática que se ven en el mundo: cinta
// transportadora aérea del almacén a las estanterías, fachada de lujo y
// segunda planta con montacargas. Las monta Business.refreshFixtures.
import * as THREE from "three";
import { mat, mesh, box, cylinder, roundedBox, signMesh } from "./gfx.js";
import { cardboardBox } from "./props.js";

const BELT_Y = 2.55;
const BELT_SPEED = 0.7; // m/s

// Cinta colgada del techo que recorre `path` ([lx, lz] en coordenadas del
// negocio). Las cajas avanzan mientras hay género en el almacén.
export class Conveyor {
  constructor(business, path) {
    this.business = business;
    const rubber = mat(0x2b2f38, { roughness: 0.8 });
    const rail = mat(0xffc22e);
    const steel = mat(0x9aa3ad);
    // Tramos rectos con barandillas amarillas y tirantes al techo.
    this.points = path.map(([lx, lz]) => business.local(lx, lz));
    this.lengths = [];
    for (let i = 1; i < path.length; i++) {
      const [x0, z0] = path[i - 1];
      const [x1, z1] = path[i];
      const len = Math.hypot(x1 - x0, z1 - z0);
      this.lengths.push(len);
      const seg = new THREE.Group();
      seg.add(mesh(box(0.5, 0.06, len + 0.5), rubber, 0, 0, 0, false));
      for (const s of [-1, 1])
        seg.add(
          mesh(box(0.05, 0.12, len + 0.5), rail, s * 0.27, 0.04, 0, false),
        );
      for (let t = -len / 2; t <= len / 2; t += 1.6)
        for (const s of [-1, 1])
          seg.add(
            mesh(
              cylinder(0.02, 0.02, 0.85, 6),
              steel,
              s * 0.27,
              0.45,
              t,
              false,
            ),
          );
      business.place(
        seg,
        (x0 + x1) / 2,
        (z0 + z1) / 2,
        Math.atan2(x1 - x0, z1 - z0),
        BELT_Y,
      );
    }
    this.total = this.lengths.reduce((a, b) => a + b, 0);
    // Cajas que viajan por la cinta.
    this.boxes = [];
    for (let i = 0; i < 7; i++) {
      const b = cardboardBox();
      b.scale.setScalar(0.5);
      business.building.interior.add(b);
      this.boxes.push({ obj: b, d: (i / 7) * this.total });
    }
    this.timer = 0;
  }

  // Posición en el mundo a una distancia d del inicio.
  at(d) {
    let left = d;
    for (let i = 0; i < this.lengths.length; i++) {
      if (left <= this.lengths[i] || i === this.lengths.length - 1) {
        const a = this.points[i];
        const b = this.points[i + 1];
        const k = Math.min(1, left / this.lengths[i]);
        return {
          x: a.x + (b.x - a.x) * k,
          z: a.z + (b.z - a.z) * k,
          h: Math.atan2(b.x - a.x, b.z - a.z),
        };
      }
      left -= this.lengths[i];
    }
    return this.points[0];
  }

  update(dt) {
    const b = this.business;
    const running = b.storageUnits() > 0;
    for (const box of this.boxes) {
      box.obj.visible = running;
      if (!running) continue;
      box.d = (box.d + dt * BELT_SPEED) % this.total;
      const p = this.at(box.d);
      box.obj.position.set(p.x, BELT_Y + 0.15, p.z);
      box.obj.rotation.y = p.h;
    }
    // Cada pocos segundos deja una caja en la estantería que más lo
    // necesita (como un reponedor más, sin sueldo).
    this.timer -= dt;
    if (this.timer > 0 || !running) return;
    this.timer = 3;
    let best = null;
    for (const entry of b.displays) {
      const d = entry.display;
      if (entry.def.kind === "coffee" || d.stock >= d.capacity * 0.6) continue;
      const product = d.product ?? b.bestStorageFor(d);
      if (!product || !(b.storage[product] > 0)) continue;
      const need = d.capacity - d.stock;
      if (!best || need > best.need) best = { entry, product, need };
    }
    if (!best) return;
    const units = Math.min(best.need, b.storage[best.product], 6);
    b.storage[best.product] -= units;
    const moved = b.stockDisplay(best.entry, best.product, units);
    if (moved < units) b.storage[best.product] += units - moved;
    b.updateStoragePile();
  }
}

// Fachada de lujo: columnas, marco dorado sobre el escaparate y bombillas.
export function buildFacade(business) {
  const bld = business.building;
  const g = new THREE.Group();
  const gold = mat(0xf2c230, { roughness: 0.3, metalness: 0.6 });
  const white = mat(0xfffaf0);
  const front = bld.d / 2 + 0.12;
  for (const s of [-1, 1]) {
    const x = s * (bld.w / 2 - 0.35);
    g.add(mesh(cylinder(0.22, 0.26, 3.2, 16), white, x, 1.6, front));
    g.add(mesh(roundedBox(0.6, 0.18, 0.6, 0.04), gold, x, 3.25, front));
    g.add(mesh(roundedBox(0.6, 0.14, 0.6, 0.04), gold, x, 0.07, front));
  }
  g.add(mesh(roundedBox(bld.w - 0.4, 0.16, 0.22, 0.05), gold, 0, 3.32, front));
  // Fila de bombillas que se encienden de noche (y brillan de día).
  const bulb = new THREE.MeshStandardMaterial({
    color: 0xfff3c4,
    emissive: 0xffd36b,
    emissiveIntensity: 0.9,
  });
  for (let x = -bld.w / 2 + 1; x <= bld.w / 2 - 1; x += 0.9)
    g.add(
      mesh(cylinder(0.06, 0.06, 0.06, 8), bulb, x, 3.18, front + 0.1, false),
    );
  // El grupo se construye en coordenadas del edificio y se coloca entero.
  bld.place(g, 0, 0, 0, 0.12);
  bld.group.add(g);
  return g;
}

// Segunda planta como almacén: cartel luminoso en la azotea y un
// montacargas en el lateral que sube y baja cajas.
export function buildUpperStore(business) {
  const bld = business.building;
  const g = new THREE.Group();
  const sign = signMesh("ALMACÉN · 2ª PLANTA", 4.2, 0.7, {
    bg: "#1d2b44",
    fg: "#ffd23f",
    font: "bold 56px",
  });
  sign.material.emissive = new THREE.Color(0xffffff);
  sign.material.emissiveMap = sign.material.map;
  sign.material.emissiveIntensity = 0.5;
  const sy = bld.roofTop + 0.55;
  bld.place(sign, 0, bld.d / 2 - 0.4, 0, sy + 0.35);
  g.add(sign);
  for (const s of [-1.6, 1.6]) {
    const post = mesh(box(0.1, 0.9, 0.1), mat(0x3e4a59), 0, 0, 0);
    bld.place(post, s, bld.d / 2 - 0.5, 0, bld.roofTop + 0.45);
    g.add(post);
  }
  // Montacargas: guías amarillas y plataforma con cajas.
  const side = bld.w / 2 + 0.45;
  const z = bld.d / 2 - 2.2;
  for (const dz of [-0.55, 0.55]) {
    const rail = mesh(box(0.1, 6.2, 0.1), mat(0xffc22e), 0, 0, 0);
    bld.place(rail, side, z + dz, 0, 3.1);
    g.add(rail);
  }
  const lift = new THREE.Group();
  lift.add(mesh(box(0.9, 0.08, 1.2), mat(0x3e4a59), 0, 0, 0));
  for (const [x, zz] of [
    [-0.15, -0.2],
    [0.15, 0.25],
  ]) {
    const c = cardboardBox();
    c.scale.setScalar(0.55);
    c.position.set(x, 0.04, zz);
    lift.add(c);
  }
  bld.place(lift, side, z, 0, 0.3);
  g.add(lift);
  bld.roof.add(g);
  return { group: g, lift, base: lift.position.y, t: 0 };
}

export function updateLift(store, dt) {
  store.t += dt * 0.35;
  const k = (1 - Math.cos(store.t)) / 2;
  store.lift.position.y = store.base + k * 3.2;
}
