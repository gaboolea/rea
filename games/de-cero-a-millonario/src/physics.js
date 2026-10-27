// Colisiones en el plano XZ (cajas alineadas a ejes), altura del suelo,
// y una rejilla de navegación con A* para los personajes no jugadores.
import { WORLD } from "./config.js";

// Barrio inicial (la ciudad original): sus calles y edificios no cambian.
export const ZONE1 = { minX: -74, maxX: 74, minZ: -48, maxZ: 52 };
// Tamaño de celda del índice espacial de colisiones (metros).
const BUCKET = 8;

export class Physics {
  constructor() {
    this.colliders = new Set();
    // Índice espacial: celda → colisionadores que la tocan. Así cada
    // consulta solo mira lo cercano aunque la ciudad sea grande.
    this.buckets = new Map();
    this.query = 0;
    this.floors = []; // rectángulos elevados (aceras, suelos interiores)
    this.navDirty = true;
    this.nav = null;
  }

  // Devuelve el colisionador para poder quitarlo después (p. ej. puertas que se abren).
  addBox(minX, minZ, maxX, maxZ, tag = "") {
    const c = { minX, minZ, maxX, maxZ, tag, enabled: true, seen: 0 };
    this.colliders.add(c);
    this.eachBucket(c, (key) => {
      let list = this.buckets.get(key);
      if (!list) this.buckets.set(key, (list = []));
      list.push(c);
    });
    this.navDirty = true;
    return c;
  }

  eachBucket(c, fn) {
    const x0 = Math.floor(c.minX / BUCKET);
    const x1 = Math.floor(c.maxX / BUCKET);
    const z0 = Math.floor(c.minZ / BUCKET);
    const z1 = Math.floor(c.maxZ / BUCKET);
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) fn(`${x},${z}`);
  }

  // Colisionadores que pueden tocar el rectángulo dado (sin repetir).
  near(minX, minZ, maxX, maxZ) {
    const out = [];
    const q = ++this.query;
    this.eachBucket({ minX, minZ, maxX, maxZ }, (key) => {
      for (const c of this.buckets.get(key) ?? []) {
        if (c.seen === q) continue;
        c.seen = q;
        out.push(c);
      }
    });
    return out;
  }

  addCentered(x, z, w, d, tag) {
    return this.addBox(x - w / 2, z - d / 2, x + w / 2, z + d / 2, tag);
  }

  remove(c) {
    if (!c || !this.colliders.delete(c)) return;
    this.eachBucket(c, (key) => {
      const list = this.buckets.get(key);
      const i = list?.indexOf(c) ?? -1;
      if (i >= 0) list.splice(i, 1);
    });
    this.navDirty = true;
  }

  // Calzadas (caras de cruzar) y pasos de cebra (baratos) para la navegación.
  setRoads(roads, crosswalks) {
    this.roads = roads;
    this.crosswalks = crosswalks;
    this.navDirty = true;
  }

  addFloor(minX, minZ, maxX, maxZ, height) {
    const f = { minX, minZ, maxX, maxZ, height };
    this.floors.push(f);
    this.floorBuckets ??= new Map();
    this.eachBucket(f, (key) => {
      let list = this.floorBuckets.get(key);
      if (!list) this.floorBuckets.set(key, (list = []));
      list.push(f);
    });
  }

  groundHeight(x, z) {
    let h = 0;
    const key = `${Math.floor(x / BUCKET)},${Math.floor(z / BUCKET)}`;
    for (const f of this.floorBuckets?.get(key) ?? []) {
      if (
        x >= f.minX &&
        x <= f.maxX &&
        z >= f.minZ &&
        z <= f.maxZ &&
        f.height > h
      )
        h = f.height;
    }
    return h;
  }

  // Empuja un círculo fuera de todas las cajas. Varias pasadas para esquinas.
  resolveCircle(pos, radius) {
    const list = this.near(
      pos.x - radius - 1,
      pos.z - radius - 1,
      pos.x + radius + 1,
      pos.z + radius + 1,
    );
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const c of list) {
        if (!c.enabled) continue;
        if (pos.x + radius < c.minX || pos.x - radius > c.maxX) continue;
        if (pos.z + radius < c.minZ || pos.z - radius > c.maxZ) continue;
        const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
        let dx = pos.x - cx;
        let dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          pos.x += (dx / d) * (radius - d);
          pos.z += (dz / d) * (radius - d);
        } else {
          // Centro dentro de la caja: salir por el lado más cercano.
          const pushes = [
            [c.minX - radius - pos.x, 0],
            [c.maxX + radius - pos.x, 0],
            [0, c.minZ - radius - pos.z],
            [0, c.maxZ + radius - pos.z],
          ];
          pushes.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
          pos.x += pushes[0][0];
          pos.z += pushes[0][1];
        }
        moved = true;
      }
      if (!moved) break;
    }
    pos.x = Math.max(WORLD.minX, Math.min(WORLD.maxX, pos.x));
    pos.z = Math.max(WORLD.minZ, Math.min(WORLD.maxZ, pos.z));
  }

  navGrid() {
    if (this.navDirty || !this.nav) {
      this.nav = new NavGrid(this, 0.5, 0.38);
      this.navDirty = false;
    }
    return this.nav;
  }
}

class MinHeap {
  constructor() {
    this.items = [];
  }
  push(node, f) {
    const a = this.items;
    a.push([f, node]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top[1];
  }
  get size() {
    return this.items.length;
  }
}

export class NavGrid {
  constructor(physics, cell, agentRadius) {
    this.cell = cell;
    this.w = Math.ceil((WORLD.maxX - WORLD.minX) / cell);
    this.h = Math.ceil((WORLD.maxZ - WORLD.minZ) / cell);
    this.blocked = new Uint8Array(this.w * this.h);
    for (const c of physics.colliders) {
      if (!c.enabled) continue;
      const x0 = this.toCellX(c.minX - agentRadius);
      const x1 = this.toCellX(c.maxX + agentRadius);
      const z0 = this.toCellZ(c.minZ - agentRadius);
      const z1 = this.toCellZ(c.maxZ + agentRadius);
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          if (x >= 0 && z >= 0 && x < this.w && z < this.h)
            this.blocked[z * this.w + x] = 1;
        }
      }
    }
    // Peso por celda: cruzar fuera de un paso de cebra cuesta mucho más.
    this.weight = new Uint8Array(this.w * this.h).fill(1);
    const paint = (rects, value) => {
      for (const [x0, z0, x1, z1] of rects ?? []) {
        for (let z = this.toCellZ(z0); z <= this.toCellZ(z1); z++) {
          for (let x = this.toCellX(x0); x <= this.toCellX(x1); x++) {
            if (x >= 0 && z >= 0 && x < this.w && z < this.h)
              this.weight[z * this.w + x] = value;
          }
        }
      }
    };
    paint(physics.roads, 8);
    paint(physics.crosswalks, 1);
    this.g = new Float32Array(this.w * this.h);
    this.parent = new Int32Array(this.w * this.h);
    this.stamp = new Uint32Array(this.w * this.h);
    this.run = 0;
  }

  toCellX(x) {
    return Math.floor((x - WORLD.minX) / this.cell);
  }
  toCellZ(z) {
    return Math.floor((z - WORLD.minZ) / this.cell);
  }
  center(i) {
    const x = i % this.w;
    const z = Math.floor(i / this.w);
    return {
      x: WORLD.minX + (x + 0.5) * this.cell,
      z: WORLD.minZ + (z + 0.5) * this.cell,
    };
  }

  free(x, z) {
    return (
      x >= 0 &&
      z >= 0 &&
      x < this.w &&
      z < this.h &&
      !this.blocked[z * this.w + x]
    );
  }

  // Busca la celda libre más cercana (para metas pegadas a muebles).
  nearestFree(x, z) {
    for (let r = 0; r < 8; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (this.free(x + dx, z + dz)) return [x + dx, z + dz];
        }
      }
    }
    return null;
  }

  findPath(from, to) {
    const s = this.nearestFree(this.toCellX(from.x), this.toCellZ(from.z));
    const t = this.nearestFree(this.toCellX(to.x), this.toCellZ(to.z));
    if (!s || !t) return null;
    const W = this.w;
    const start = s[1] * W + s[0];
    const goal = t[1] * W + t[0];
    this.run++;
    const run = this.run;
    const heap = new MinHeap();
    this.g[start] = 0;
    this.parent[start] = -1;
    this.stamp[start] = run;
    heap.push(start, 0);
    const closed = new Set();
    let iterations = 0;
    while (heap.size && iterations++ < 60000) {
      const cur = heap.pop();
      if (cur === goal) return this.smooth(this.rebuild(goal), to);
      if (closed.has(cur)) continue;
      closed.add(cur);
      const cx = cur % W;
      const cz = (cur - cx) / W;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (!this.free(nx, nz)) continue;
          if (dx && dz && (!this.free(cx + dx, cz) || !this.free(cx, cz + dz)))
            continue;
          const n = nz * W + nx;
          const cost = this.g[cur] + (dx && dz ? 1.414 : 1) * this.weight[n];
          if (this.stamp[n] === run && cost >= this.g[n]) continue;
          this.stamp[n] = run;
          this.g[n] = cost;
          this.parent[n] = cur;
          const hx = Math.abs(nx - t[0]);
          const hz = Math.abs(nz - t[1]);
          heap.push(n, cost + Math.max(hx, hz) + 0.414 * Math.min(hx, hz));
        }
      }
    }
    return null;
  }

  rebuild(goal) {
    const cells = [];
    for (let c = goal; c !== -1; c = this.parent[c]) cells.push(c);
    return cells.reverse();
  }

  lineFree(a, b) {
    const W = this.w;
    let x0 = a % W;
    let z0 = Math.floor(a / W);
    const x1 = b % W;
    const z1 = Math.floor(b / W);
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0)) * 2;
    for (let i = 0; i <= steps; i++) {
      const t = steps ? i / steps : 0;
      const x = Math.round(x0 + (x1 - x0) * t);
      const z = Math.round(z0 + (z1 - z0) * t);
      if (!this.free(x, z) || this.weight[z * W + x] > 1) return false;
    }
    return true;
  }

  // Elimina puntos intermedios con línea de visión directa.
  smooth(cells, finalTarget) {
    const out = [];
    let anchor = 0;
    for (let i = 2; i < cells.length; i++) {
      if (!this.lineFree(cells[anchor], cells[i])) {
        out.push(this.center(cells[i - 1]));
        anchor = i - 1;
      }
    }
    out.push({ x: finalTarget.x, z: finalTarget.z });
    return out;
  }
}
