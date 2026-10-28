// Animales de la ciudad (solo ambiente, se simulan en cada navegador):
// bandadas de palomas que picotean en las plazas y salen volando si te
// acercas, y perros y gatos que pasean por la zona residencial y se dejan
// acariciar. Nada de esto toca la economía ni se guarda.
import * as THREE from "three";
import { mat, mesh, box, sphere, cylinder } from "./gfx.js";

// Más lejos de esto no se dibujan ni se animan.
const DRAW = 70;
// Distancia a la que las palomas se asustan.
const SCARE = 3.2;

const rand = (a, b) => a + Math.random() * (b - a);

// Corazón dibujado (no depende de las fuentes de emojis).
let heartTex = null;
function heartTexture() {
  if (heartTex) return heartTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ff4d79";
  ctx.beginPath();
  ctx.moveTo(32, 56);
  ctx.bezierCurveTo(4, 36, 4, 10, 20, 10);
  ctx.bezierCurveTo(28, 10, 32, 18, 32, 20);
  ctx.bezierCurveTo(32, 18, 36, 10, 44, 10);
  ctx.bezierCurveTo(60, 10, 60, 36, 32, 56);
  ctx.fill();
  heartTex = new THREE.CanvasTexture(c);
  heartTex.colorSpace = THREE.SRGBColorSpace;
  return heartTex;
}

function pigeonModel() {
  const g = new THREE.Group();
  const gray = mat(0x8e96a3);
  const dark = mat(0x5d6573);
  const body = mesh(sphere(0.13, 10), gray, 0, 0.16, 0);
  body.scale.set(0.85, 0.8, 1.25);
  g.add(body);
  const head = new THREE.Group();
  head.position.set(0, 0.27, 0.13);
  head.add(mesh(sphere(0.07, 8), dark, 0, 0, 0));
  head.add(mesh(sphere(0.055, 8), mat(0x5fbf9f), 0, -0.06, -0.01));
  head.add(mesh(box(0.025, 0.025, 0.06), mat(0xf2a531), 0, -0.01, 0.07));
  for (const s of [-1, 1])
    head.add(mesh(sphere(0.012, 6), mat(0x1d1d1d), s * 0.045, 0.015, 0.035));
  g.add(head);
  const wings = [-1, 1].map((s) => {
    const w = new THREE.Group();
    w.position.set(s * 0.09, 0.2, 0);
    const blade = mesh(box(0.2, 0.025, 0.24), dark, s * 0.1, 0, 0, false);
    w.add(blade);
    g.add(w);
    return w;
  });
  g.add(mesh(box(0.1, 0.03, 0.14), dark, 0, 0.15, -0.18));
  for (const s of [-1, 1])
    g.add(
      mesh(cylinder(0.01, 0.01, 0.08, 4), mat(0xe76f51), s * 0.04, 0.04, 0),
    );
  return { g, head, wings };
}

function dogModel(color, spot) {
  const g = new THREE.Group();
  const fur = mat(color);
  const body = mesh(sphere(0.25, 12), fur, 0, 0.38, 0);
  body.scale.set(0.85, 0.8, 1.45);
  g.add(body);
  const head = new THREE.Group();
  head.position.set(0, 0.62, 0.36);
  head.add(mesh(sphere(0.18, 12), fur, 0, 0, 0));
  head.add(mesh(sphere(0.09, 10), mat(spot), 0, -0.05, 0.14));
  head.add(mesh(sphere(0.035, 8), mat(0x1d1d1d), 0, -0.02, 0.23));
  for (const s of [-1, 1]) {
    head.add(mesh(sphere(0.028, 8), mat(0x1d1d1d), s * 0.075, 0.05, 0.15));
    const ear = mesh(box(0.08, 0.18, 0.05), mat(spot), s * 0.15, 0.04, -0.02);
    ear.rotation.z = s * 0.4;
    head.add(ear);
  }
  g.add(head);
  const legs = [];
  for (const [x, z] of [
    [-0.12, 0.2],
    [0.12, 0.2],
    [-0.12, -0.2],
    [0.12, -0.2],
  ]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.3, z);
    leg.add(mesh(cylinder(0.05, 0.05, 0.3, 6), fur, 0, -0.15, 0));
    g.add(leg);
    legs.push(leg);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.5, -0.33);
  const t = mesh(cylinder(0.03, 0.045, 0.28, 6), fur, 0, 0.12, -0.04);
  t.rotation.x = -0.5;
  tail.add(t);
  g.add(tail);
  return { g, head, legs, tail };
}

function catModel(color) {
  const g = new THREE.Group();
  const fur = mat(color);
  const body = mesh(sphere(0.16, 12), fur, 0, 0.24, 0);
  body.scale.set(0.8, 0.8, 1.5);
  g.add(body);
  const head = new THREE.Group();
  head.position.set(0, 0.4, 0.25);
  head.add(mesh(sphere(0.12, 12), fur, 0, 0, 0));
  for (const s of [-1, 1]) {
    head.add(
      mesh(new THREE.ConeGeometry(0.05, 0.1, 4), fur, s * 0.07, 0.11, 0),
    );
    head.add(mesh(sphere(0.022, 8), mat(0x3fbf5f), s * 0.05, 0.02, 0.1));
  }
  head.add(mesh(sphere(0.015, 6), mat(0xff8fab), 0, -0.02, 0.12));
  g.add(head);
  const legs = [];
  for (const [x, z] of [
    [-0.07, 0.14],
    [0.07, 0.14],
    [-0.07, -0.14],
    [0.07, -0.14],
  ]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.18, z);
    leg.add(mesh(cylinder(0.03, 0.03, 0.18, 6), fur, 0, -0.09, 0));
    g.add(leg);
    legs.push(leg);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.3, -0.24);
  const t = mesh(cylinder(0.022, 0.03, 0.38, 6), fur, 0, 0.17, -0.05);
  t.rotation.x = -0.3;
  tail.add(t);
  g.add(tail);
  return { g, head, legs, tail };
}

// Bandadas: centro, radio en el suelo y número de palomas.
const FLOCKS = [
  [17, 12.6, 2.4, 8],
  [40, 22.8, 2.4, 6],
  [-251, 22, 2.5, 6],
  [42, 69, 2.5, 6],
];

// Mascotas: especie, nombre, colores y zona por la que pasean
// [x0, z0, x1, z1]. El perro de tu casa vive en su jardín.
const PETS = [
  ["perro", "Toby", 0xc98a4b, 0xffffff, [-12.3, 118.5, -8.6, 129.5]],
  ["perro", "Luna", 0xf4f1e8, 0x3e3a36, [36, 64, 56, 73]],
  ["perro", "Rocky", 0x4a3b30, 0xd9b38c, [-62, 72, -54, 90]],
  ["gato", "Misi", 0xff9f43, 0xffffff, [14, 97, 26, 102]],
  ["gato", "Nube", 0xdfe3ea, 0xffffff, [-27.5, 119.2, -24, 122]],
  ["gato", "Tigre", 0x5d6573, 0xffffff, [12.5, 10.4, 21.5, 11.8]],
];

export class Critters {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.pigeons = [];
    this.pets = [];
    this.hearts = [];
    this.buildFlocks();
    this.buildPets();
  }

  ground(x, z) {
    return this.game.world.physics.groundHeight(x, z);
  }

  buildFlocks() {
    for (const [cx, cz, r, n] of FLOCKS) {
      const flock = { cx, cz, r, birds: [] };
      for (let i = 0; i < n; i++) {
        const m = pigeonModel();
        const a = rand(0, Math.PI * 2);
        const d = rand(0, r);
        const p = {
          ...m,
          flock,
          x: cx + Math.cos(a) * d,
          z: cz + Math.sin(a) * d,
          y: 0,
          h: rand(0, Math.PI * 2),
          state: "walk",
          t: rand(0, 3),
          tx: cx,
          tz: cz,
          phase: rand(0, 10),
        };
        p.y = this.ground(p.x, p.z);
        this.scene.add(m.g);
        flock.birds.push(p);
        this.pigeons.push(p);
      }
    }
  }

  buildPets() {
    for (const [kind, name, color, spot, area] of PETS) {
      const m = kind === "perro" ? dogModel(color, spot) : catModel(color);
      const [x0, z0, x1, z1] = area;
      const pet = {
        ...m,
        kind,
        name,
        area,
        x: (x0 + x1) / 2,
        z: (z0 + z1) / 2,
        h: rand(0, Math.PI * 2),
        tx: (x0 + x1) / 2,
        tz: (z0 + z1) / 2,
        state: "idle",
        t: rand(1, 4),
        walk: 0,
        happy: 0,
      };
      if (name === "Toby") {
        const house = this.dogHouse();
        house.position.set(x0 + 0.9, 0, z1 - 0.9);
        house.rotation.y = Math.PI;
        this.scene.add(house);
        this.game.world.physics.addCentered(x0 + 0.9, z1 - 0.9, 1.1, 1.1);
      }
      m.g.rotation.order = "YXZ";
      pet.it = {
        x: pet.x,
        z: pet.z,
        radius: 1.6,
        label: () => ({
          text: `${kind === "perro" ? "🐶" : "🐱"} Acariciar a ${name}`,
          enabled: true,
        }),
        action: () => this.pet(pet),
      };
      this.scene.add(m.g);
      this.pets.push(pet);
    }
  }

  // Caseta de madera con tejado rojo para el perro de tu casa.
  dogHouse() {
    const g = new THREE.Group();
    g.add(mesh(box(1.0, 0.75, 1.0), mat(0xc98a4b), 0, 0.38, 0));
    const roof = mesh(
      new THREE.ConeGeometry(0.85, 0.5, 4),
      mat(0xd9534f),
      0,
      1.0,
      0,
    );
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    g.add(mesh(box(0.42, 0.5, 0.05), mat(0x3e2a1a), 0, 0.3, 0.5));
    return g;
  }

  interactables() {
    const p = this.game.player.pos;
    return this.pets
      .filter((pet) => Math.abs(pet.x - p.x) + Math.abs(pet.z - p.z) < 4)
      .map((pet) => pet.it);
  }

  pet(pet) {
    pet.happy = 2.5;
    pet.state = "idle";
    pet.t = 2.5;
    const p = this.game.player.pos;
    pet.h = Math.atan2(p.x - pet.x, p.z - pet.z);
    this.game.audio.sfx("sparkle");
    this.game.player.char.playAction("wave", 0.6);
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: heartTexture(), transparent: true }),
      );
      s.scale.setScalar(0.35);
      s.position.set(
        pet.x + rand(-0.2, 0.2),
        1.0 + i * 0.15,
        pet.z + rand(-0.2, 0.2),
      );
      this.scene.add(s);
      this.hearts.push({ s, t: 0, delay: i * 0.25 });
    }
  }

  update(dt, time) {
    const p = this.game.player.pos;
    for (const b of this.pigeons) this.updatePigeon(b, dt, time, p);
    for (const pet of this.pets) this.updatePet(pet, dt, time, p);
    for (let i = this.hearts.length - 1; i >= 0; i--) {
      const h = this.hearts[i];
      if (h.delay > 0) {
        h.delay -= dt;
        h.s.visible = false;
        continue;
      }
      h.s.visible = true;
      h.t += dt;
      h.s.position.y += dt * 0.7;
      h.s.material.opacity = Math.max(0, 1 - h.t / 1.2);
      if (h.t > 1.2) {
        this.scene.remove(h.s);
        h.s.material.dispose();
        this.hearts.splice(i, 1);
      }
    }
  }

  updatePigeon(b, dt, time, p) {
    const far = Math.abs(b.x - p.x) + Math.abs(b.z - p.z) > DRAW;
    b.g.visible = !far;
    if (far && b.state !== "fly") return;
    const f = b.flock;
    const dist = Math.hypot(b.x - p.x, b.z - p.z);
    if (b.state !== "fly" && dist < SCARE) {
      // ¡Susto! Despega en dirección contraria al jugador.
      b.state = "fly";
      b.t = rand(5, 8);
      b.vx = ((b.x - p.x) / (dist || 1)) * 4 + rand(-1, 1);
      b.vz = ((b.z - p.z) / (dist || 1)) * 4 + rand(-1, 1);
      b.vy = rand(3, 4.5);
      if (dist < 2 && Math.random() < 0.4) this.game.audio.sfx("whoosh");
    }
    if (b.state === "fly") {
      b.t -= dt;
      const flap = Math.sin(time * 28 + b.phase) * 0.9;
      b.wings[0].rotation.z = flap;
      b.wings[1].rotation.z = -flap;
      if (b.t > 2) {
        // Sube y da vueltas sobre la plaza.
        const a = time * 0.8 + b.phase;
        const tx = f.cx + Math.cos(a) * (f.r + 3);
        const tz = f.cz + Math.sin(a) * (f.r + 3);
        b.vx += (tx - b.x) * dt * 0.8;
        b.vz += (tz - b.z) * dt * 0.8;
        b.vy += (7 + Math.sin(b.phase) * 1.5 - b.y) * dt * 0.8;
      } else {
        // Baja a un punto libre de la plaza.
        if (!b.landing) {
          const a = rand(0, Math.PI * 2);
          b.landing = {
            x: f.cx + Math.cos(a) * rand(0, f.r),
            z: f.cz + Math.sin(a) * rand(0, f.r),
          };
          b.landing.y = this.ground(b.landing.x, b.landing.z);
        }
        const L = b.landing;
        b.vx = (L.x - b.x) * 1.6;
        b.vz = (L.z - b.z) * 1.6;
        b.vy = (L.y - b.y) * 1.6;
        if (Math.hypot(L.x - b.x, L.z - b.z) < 0.15 && b.y - L.y < 0.1) {
          // Si el jugador sigue al lado, aguanta un poco más en el aire.
          if (Math.hypot(L.x - p.x, L.z - p.z) < SCARE) b.t = 3;
          else {
            b.state = "walk";
            b.t = rand(1, 3);
            b.landing = null;
            b.wings[0].rotation.z = b.wings[1].rotation.z = 0;
          }
        }
      }
      const damp = Math.min(1, dt * 1.5);
      b.vx *= 1 - damp * 0.3;
      b.vz *= 1 - damp * 0.3;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      b.y += b.vy * dt;
      if (Math.hypot(b.vx, b.vz) > 0.2) b.h = Math.atan2(b.vx, b.vz);
      b.head.position.y = 0.27;
    } else {
      // En el suelo: pasitos cortos y picotazos.
      b.t -= dt;
      if (b.t <= 0) {
        b.t = rand(1.5, 4);
        const a = rand(0, Math.PI * 2);
        const d = rand(0, f.r);
        b.tx = f.cx + Math.cos(a) * d;
        b.tz = f.cz + Math.sin(a) * d;
      }
      const dx = b.tx - b.x;
      const dz = b.tz - b.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.1) {
        const step = Math.min(d, dt * 0.6);
        b.x += (dx / d) * step;
        b.z += (dz / d) * step;
        b.h = Math.atan2(dx, dz);
        b.head.position.z = 0.13 + Math.sin(time * 14 + b.phase) * 0.03;
        b.head.position.y = 0.27;
      } else {
        // Picotea el suelo.
        const peck = Math.max(0, Math.sin(time * 6 + b.phase));
        b.head.position.y = 0.27 - peck * 0.12;
        b.head.position.z = 0.13 + peck * 0.05;
      }
      b.y = this.ground(b.x, b.z);
    }
    b.g.position.set(b.x, b.y, b.z);
    b.g.rotation.y = b.h;
  }

  updatePet(pet, dt, time, p) {
    const far = Math.abs(pet.x - p.x) + Math.abs(pet.z - p.z) > DRAW;
    pet.g.visible = !far;
    if (far) return;
    const [x0, z0, x1, z1] = pet.area;
    const dog = pet.kind === "perro";
    const dist = Math.hypot(pet.x - p.x, pet.z - p.z);
    pet.happy = Math.max(0, pet.happy - dt);
    pet.t -= dt;
    if (dog && dist < 5 && pet.happy <= 0) {
      // Los perros se acercan a saludar (sin salir de su zona).
      pet.tx = Math.min(x1, Math.max(x0, p.x));
      pet.tz = Math.min(z1, Math.max(z0, p.z));
      pet.state = dist > 1.3 ? "walk" : "idle";
    } else if (pet.t <= 0) {
      pet.t = dog ? rand(2, 5) : rand(4, 9);
      if (Math.random() < (dog ? 0.65 : 0.4)) {
        pet.state = "walk";
        pet.tx = rand(x0, x1);
        pet.tz = rand(z0, z1);
      } else pet.state = Math.random() < 0.5 ? "sit" : "idle";
    }
    let moving = false;
    if (pet.state === "walk") {
      const dx = pet.tx - pet.x;
      const dz = pet.tz - pet.z;
      const d = Math.hypot(dx, dz);
      if (d > (dog && dist < 5 ? 1.2 : 0.1)) {
        const speed = dog ? 1.6 : 0.7;
        const step = Math.min(d, dt * speed);
        pet.x += (dx / d) * step;
        pet.z += (dz / d) * step;
        const target = Math.atan2(dx, dz);
        let diff = target - pet.h;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        pet.h += diff * Math.min(1, dt * 8);
        moving = true;
      } else pet.state = "idle";
    }
    if (dist < 1.6 && !moving)
      pet.h +=
        Math.atan2(
          Math.sin(Math.atan2(p.x - pet.x, p.z - pet.z) - pet.h),
          Math.cos(Math.atan2(p.x - pet.x, p.z - pet.z) - pet.h),
        ) * Math.min(1, dt * 4);
    pet.walk += dt * (moving ? (dog ? 12 : 8) : 0);
    pet.legs.forEach((leg, i) => {
      leg.rotation.x = moving
        ? Math.sin(
            pet.walk + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0),
          ) * 0.6
        : 0;
    });
    const sit = pet.state === "sit" && !moving;
    pet.g.rotation.x = sit ? -0.35 : 0;
    // Cola: los perros contentos la mueven deprisa; los gatos, despacio.
    const wag = dog
      ? Math.sin(time * (pet.happy > 0 || dist < 4 ? 22 : 6)) *
        (pet.happy > 0 ? 0.8 : 0.4)
      : Math.sin(time * 1.6 + pet.x) * 0.5;
    pet.tail.rotation.y = wag;
    pet.head.rotation.x = pet.happy > 0 ? Math.sin(time * 10) * 0.15 : 0;
    const hop =
      pet.happy > 1.5 && dog ? Math.abs(Math.sin(time * 9)) * 0.18 : 0;
    pet.g.position.set(pet.x, this.ground(pet.x, pet.z) + hop, pet.z);
    pet.g.rotation.y = pet.h;
    pet.it.x = pet.x;
    pet.it.z = pet.z;
  }
}
