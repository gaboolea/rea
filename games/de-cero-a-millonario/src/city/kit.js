// Herramientas para construir las zonas nuevas con el mismo estilo que el
// barrio inicial (asfalto, aceras de baldosas con bordillo, pasos de cebra,
// líneas de carril) y registrar lo que necesitan el mapa, los peatones, la
// navegación y el tráfico.
import * as THREE from "three";
import { mat, box, mesh, surfaceTexture, sidewalkMat } from "../gfx.js";

export const SIDEWALK = 0.12;

let pavers;
let grassTex;

export class CityKit {
  // zone: { id, name, rect: [x0, z0, x1, z1] }. Todo lo que se construye
  // mientras el kit está activo va al grupo de la zona, que se oculta
  // cuando el jugador está lejos.
  constructor(world, zone) {
    this.world = world;
    this.zone = { ...zone, group: new THREE.Group() };
    world.scene.add(this.zone.group);
    world.zones.push(this.zone);
    this.group = this.zone.group;
  }

  // Construye dentro del grupo de la zona (los métodos del mundo, como
  // world.tree o world.building, añaden a world.scene).
  inside(fn) {
    const real = this.world.scene;
    this.world.scene = this.group;
    try {
      return fn();
    } finally {
      this.world.scene = real;
    }
  }

  add(obj) {
    this.group.add(obj);
    return obj;
  }

  grass(x0, z0, x1, z1) {
    grassTex ??= surfaceTexture("grass", "#64cc3e", [1, 1]);
    const map = grassTex.clone();
    map.repeat.set((x1 - x0) / 6, (z1 - z0) / 6);
    map.needsUpdate = true;
    this.add(
      mesh(
        box(x1 - x0, 0.2, z1 - z0),
        new THREE.MeshStandardMaterial({ map, roughness: 1 }),
        (x0 + x1) / 2,
        -0.1,
        (z0 + z1) / 2,
        false,
      ),
    );
    this.world.mapRects.push({ kind: "grass", rect: [x0, z0, x1, z1] });
  }

  // Calle con línea central discontinua a lo largo de su eje largo.
  road(x0, z0, x1, z1, { lines = true } = {}) {
    const w = x1 - x0;
    const d = z1 - z0;
    const map = surfaceTexture("asphalt", "#58616d", [w / 5, d / 5]);
    this.add(
      mesh(
        box(w, 0.02, d),
        new THREE.MeshStandardMaterial({ map, roughness: 0.9 }),
        x0 + w / 2,
        0.01,
        z0 + d / 2,
        false,
      ),
    );
    if (lines) {
      const line = mat(0xfff3b0);
      if (w > d)
        for (let x = x0 + 2; x < x1 - 2; x += 4)
          this.add(
            mesh(box(2, 0.02, 0.18), line, x + 1, 0.025, (z0 + z1) / 2, false),
          );
      else
        for (let z = z0 + 2; z < z1 - 2; z += 4)
          this.add(
            mesh(box(0.18, 0.02, 2), line, (x0 + x1) / 2, 0.025, z + 1, false),
          );
    }
    this.world.roads.push([x0, z0, x1, z1]);
    this.world.mapRects.push({ kind: "road", rect: [x0, z0, x1, z1] });
  }

  // Acera elevada con bordillo, suelo para la física y zona de paseo.
  sidewalk(x0, z0, x1, z1, { walk = true } = {}) {
    pavers ??= surfaceTexture("pavers", "#f2dcb0", [1, 1]);
    const w = x1 - x0;
    const d = z1 - z0;
    this.add(
      mesh(
        box(w, SIDEWALK, d),
        sidewalkMat(pavers, w, d),
        x0 + w / 2,
        SIDEWALK / 2,
        z0 + d / 2,
        false,
      ),
    );
    this.add(
      mesh(
        box(w + 0.1, SIDEWALK + 0.02, d + 0.1),
        mat(0xe8e2d6),
        x0 + w / 2,
        SIDEWALK / 2 - 0.02,
        z0 + d / 2,
        false,
      ),
    );
    this.world.physics.addFloor(x0, z0, x1, z1, SIDEWALK);
    this.world.mapRects.push({ kind: "walk", rect: [x0, z0, x1, z1] });
    if (walk)
      this.world.walkAreas.push({
        zone: this.zone.id,
        rect: [x0 + 0.5, z0 + 0.5, x1 - 0.5, z1 - 0.5],
      });
  }

  // Plaza pavimentada al nivel de la acera.
  plaza(x0, z0, x1, z1, color = "#efe3c8") {
    const tex = surfaceTexture("pavers", color, [1, 1]);
    const w = x1 - x0;
    const d = z1 - z0;
    this.add(
      mesh(
        box(w, SIDEWALK, d),
        sidewalkMat(tex, w, d),
        x0 + w / 2,
        SIDEWALK / 2,
        z0 + d / 2,
        false,
      ),
    );
    this.world.physics.addFloor(x0, z0, x1, z1, SIDEWALK);
    this.world.mapRects.push({ kind: "plaza", rect: [x0, z0, x1, z1] });
    this.world.walkAreas.push({
      zone: this.zone.id,
      rect: [x0 + 1, z0 + 1, x1 - 1, z1 - 1],
    });
  }

  // Paso de cebra sobre una calle: axis = eje de la calle que se cruza.
  crosswalk(cx, cz, axis, width = 8) {
    const white = mat(0xffffff);
    if (axis === "x") {
      for (let z = cz - width / 2 + 0.6; z <= cz + width / 2 - 0.5; z += 0.85)
        this.add(mesh(box(3, 0.02, 0.42), white, cx, 0.03, z, false));
      this.world.crosswalks.push([
        cx - 1.6,
        cz - width / 2 - 0.5,
        cx + 1.6,
        cz + width / 2 + 0.5,
      ]);
    } else {
      for (let x = cx - width / 2 + 0.6; x <= cx + width / 2 - 0.5; x += 0.85)
        this.add(mesh(box(0.42, 0.02, 3), white, x, 0.03, cz, false));
      this.world.crosswalks.push([
        cx - width / 2 - 0.5,
        cz - 1.6,
        cx + width / 2 + 0.5,
        cz + 1.6,
      ]);
    }
  }

  // Valla baja con colisión (límite de una zona). Admite huecos.
  fence(x0, z0, x1, z1, color = 0xffffff) {
    const w = Math.max(0.2, x1 - x0);
    const d = Math.max(0.2, z1 - z0);
    this.add(
      mesh(box(w, 0.8, d), mat(color), (x0 + x1) / 2, 0.4, (z0 + z1) / 2),
    );
    this.world.physics.addBox(x0, z0, x1, z1);
  }

  // Seto verde con colisión.
  hedge(x0, z0, x1, z1) {
    const w = Math.max(0.6, x1 - x0);
    const d = Math.max(0.6, z1 - z0);
    this.add(
      mesh(box(w, 1.1, d), mat(0x3fa55a), (x0 + x1) / 2, 0.55, (z0 + z1) / 2),
    );
    this.world.physics.addBox(x0, z0, x1, z1);
  }

  // Edificio recorrible (clase Building) dentro del grupo de la zona.
  building(id, opts) {
    return this.inside(() => this.world.building(id, opts));
  }

  poi(id, name, icon, at, extra = {}) {
    this.world.pois.push({ id, name, icon, at, zone: this.zone.id, ...extra });
  }
}
