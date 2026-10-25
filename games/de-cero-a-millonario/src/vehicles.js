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

// Tráfico decorativo por el carril; frena si hay alguien delante.
export class Traffic {
  constructor(scene) {
    this.cars = [];
    const colors = [0xff6b6b, 0x4dabf7, 0xffd43b, 0x69db7c, 0xb197fc, 0xff922b];
    for (let i = 0; i < 6; i++) {
      const dir = i % 2 ? 1 : -1;
      const car = toyCar(colors[i]);
      car.position.set(-70 + i * 24, 0, dir * 2);
      car.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      scene.add(car);
      this.cars.push({ mesh: car, dir, speed: 6 + (i % 3), current: 0 });
    }
  }

  update(dt, obstacles) {
    for (const c of this.cars) {
      const p = c.mesh.position;
      let blocked = false;
      for (const o of obstacles) {
        const ahead = (o.x - p.x) * -c.dir;
        if (ahead > 0 && ahead < 5.5 && Math.abs(o.z - p.z) < 1.6)
          blocked = true;
      }
      for (const other of this.cars) {
        if (other === c || other.dir !== c.dir) continue;
        const ahead = (other.mesh.position.x - p.x) * -c.dir;
        if (ahead > 0 && ahead < 5) blocked = true;
      }
      const target = blocked ? 0 : c.speed;
      c.current += (target - c.current) * Math.min(1, dt * (blocked ? 6 : 1.5));
      p.x -= c.dir * c.current * dt;
      if (p.x < -78) p.x = 78;
      if (p.x > 78) p.x = -78;
    }
  }

  // Cajas de los coches para empujar al jugador.
  pushOut(pos, radius) {
    for (const c of this.cars) {
      const p = c.mesh.position;
      const dx = pos.x - p.x;
      const dz = pos.z - p.z;
      const hx = 1.7 + radius;
      const hz = 0.9 + radius;
      if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
        const px = hx - Math.abs(dx);
        const pz = hz - Math.abs(dz);
        if (px < pz) pos.x += Math.sign(dx || 1) * px;
        else pos.z += Math.sign(dz || 1) * pz;
      }
    }
  }
}
