// La ciudad: calles, aceras, edificios, decoración urbana, tráfico y los
// interiores fijos (mayorista, casas, boutique, concesionario).
import * as THREE from "three";
import { Physics, WORLD } from "./physics.js";
import { Building, FLOOR_Y } from "./building.js";
import {
  mat,
  box,
  mesh,
  cylinder,
  sphere,
  roundedBox,
  signMesh,
} from "./gfx.js";
import * as props from "./props.js";
import { Traffic, toyCar, toyVan, toyScooter } from "./vehicles.js";
import { ToyCharacter } from "./character.js";

const SIDEWALK = 0.12;

export class World {
  constructor(scene) {
    this.scene = scene;
    this.physics = new Physics();
    this.occluders = [];
    this.lamps = [];
    this.buildings = {};
    this.staticInteractables = [];
    this.buildGround();
    this.buildBuildings();
    this.buildWarehouse();
    this.buildHouses();
    this.buildBoutique();
    this.buildDealership();
    this.buildDecor();
    this.buildBounds();
    this.traffic = new Traffic(scene);
  }

  buildGround() {
    const grass = mesh(
      box(WORLD.maxX - WORLD.minX + 40, 0.2, WORLD.maxZ - WORLD.minZ + 40),
      mat(0x8fd16a),
      0,
      -0.1,
      2,
      false,
    );
    this.scene.add(grass);
    const road = mat(0x5d6670, { roughness: 0.9 });
    this.scene.add(mesh(box(160, 0.02, 8), road, 0, 0.01, 0, false));
    this.scene.add(
      mesh(
        box(8, 0.02, WORLD.maxZ - WORLD.minZ + 10),
        road,
        0,
        0.012,
        2,
        false,
      ),
    );
    const line = mat(0xfff3b0);
    for (let x = -76; x < 76; x += 4) {
      if (Math.abs(x) < 6) continue;
      this.scene.add(mesh(box(2, 0.02, 0.18), line, x, 0.025, 0, false));
    }
    for (let z = -46; z < 52; z += 4) {
      if (Math.abs(z) < 6) continue;
      this.scene.add(mesh(box(0.18, 0.02, 2), line, 0, 0.025, z, false));
    }
    // Pasos de cebra.
    const white = mat(0xffffff);
    for (let i = 0; i < 6; i++) {
      this.scene.add(
        mesh(box(0.5, 0.02, 3.2), white, -20 + i * 0.9 - 2.25, 0.03, 0, false),
      );
      this.scene.add(
        mesh(box(3.2, 0.02, 0.5), white, 0, 0.03, -12 + i * 0.9, false),
      );
    }
    // Aceras elevadas (con bordillo) a lo largo de las calles.
    const walk = mat(0xf3e1b9);
    const curb = mat(0xd9c49a);
    const slabs = [
      [WORLD.minX - 6, -10, -4, -4],
      [4, -10, WORLD.maxX + 6, -4],
      [WORLD.minX - 6, 4, -4, 10],
      [4, 4, WORLD.maxX + 6, 10],
      [-7, WORLD.minZ - 6, -4, -4],
      [4, WORLD.minZ - 6, 7, -4],
      [-7, 4, -4, WORLD.maxZ + 6],
      [4, 4, 7, WORLD.maxZ + 6],
    ];
    for (const [x0, z0, x1, z1] of slabs) {
      const w = x1 - x0;
      const d = z1 - z0;
      this.scene.add(
        mesh(
          box(w, SIDEWALK, d),
          walk,
          x0 + w / 2,
          SIDEWALK / 2,
          z0 + d / 2,
          false,
        ),
      );
      this.scene.add(
        mesh(
          box(w + 0.1, SIDEWALK + 0.02, d + 0.1),
          curb,
          x0 + w / 2,
          SIDEWALK / 2 - 0.02,
          z0 + d / 2,
          false,
        ),
      );
      this.physics.addFloor(x0, z0, x1, z1, SIDEWALK);
    }
  }

  building(id, opts) {
    const b = new Building(this, { id, ...opts });
    this.buildings[id] = b;
    return b;
  }

  buildBuildings() {
    this.building("tienda", {
      name: "Mi Tiendita",
      x: -22,
      z: -20,
      w: 16,
      d: 20,
      partition: -4,
      wallColor: 0xfff1d6,
      trimColor: 0x2fb3a8,
      roofColor: 0x46c2b8,
      awning: ["#3fbf5f", "#ffffff"],
      sign: "MI TIENDITA",
      signColors: { bg: "#ffffff", fg: "#1f8f86" },
    });
    this.building("minimercado", {
      name: "Minimercado Sol",
      x: -51,
      z: -17,
      w: 16,
      d: 14,
      wallColor: 0xfff4c9,
      trimColor: 0xf2a531,
      roofColor: 0xf7b955,
      awning: ["#f2a531", "#ffffff"],
      sign: "MINIMERCADO SOL",
      signColors: { bg: "#fffbe6", fg: "#d9822b" },
    });
    this.building("cafeteria", {
      name: "Café Aroma",
      x: 21,
      z: -16,
      w: 14,
      d: 12,
      wallColor: 0xffe2c4,
      trimColor: 0x8b5a3c,
      roofColor: 0xd9824b,
      awning: ["#ff9f43", "#ffffff"],
      floor: ["#e9c9a3", "#dcb48a"],
      sign: "CAFÉ AROMA",
      signColors: { bg: "#fff3e0", fg: "#8b5a3c" },
    });
    this.building("boutique", {
      name: "Boutique Estilo",
      x: 41,
      z: -15,
      w: 10,
      d: 10,
      wallColor: 0xffe0ef,
      trimColor: 0xff6fa8,
      roofColor: 0xff8fbf,
      awning: ["#ff6fa8", "#ffffff"],
      floor: ["#fff0f6", "#ffd6e8"],
      sign: "BOUTIQUE",
      signColors: { bg: "#ffffff", fg: "#e0468a" },
    });
    this.building("supermercado", {
      name: "Súper Millonario",
      x: 61,
      z: -20,
      w: 20,
      d: 20,
      doorW: 4.4,
      wallColor: 0xe9f6ff,
      trimColor: 0x3d7be0,
      roofColor: 0x4f8dff,
      awning: ["#3d7be0", "#ffffff"],
      floor: ["#f4f7fb", "#dde6f0"],
      sign: "SÚPER MILLONARIO",
      signColors: { bg: "#ffffff", fg: "#2c5fc4" },
    });
    this.building("mayorista", {
      name: "Mayorista",
      x: -22,
      z: 19,
      w: 20,
      d: 18,
      rot: Math.PI,
      doorW: 5,
      wallColor: 0xd7e3ea,
      trimColor: 0xf2a531,
      roofColor: 0x8aa0ad,
      floor: ["#c9d1d6", "#bcc5cb"],
      glass: false,
      sign: "MAYORISTA · PROVEEDORES",
      signColors: { bg: "#ffd166", fg: "#5a3d0c", font: "bold 52px" },
    });
    this.building("restaurante", {
      name: "Restaurante",
      x: -52,
      z: 17,
      w: 16,
      d: 14,
      rot: Math.PI,
      wallColor: 0xfde2d5,
      trimColor: 0xc0392b,
      roofColor: 0xe0705a,
      awning: ["#c0392b", "#ffffff"],
      sign: "RESTAURANTE",
      signColors: { bg: "#ffffff", fg: "#c0392b" },
    });
    this.buildings.restaurante.setLocked(true, "PRÓXIMAMENTE\nen obras");
    this.building("casa", {
      name: "Tu casa",
      x: 17,
      z: 16,
      w: 10,
      d: 12,
      rot: Math.PI,
      doorW: 2.4,
      wallColor: 0xfff6e5,
      trimColor: 0x5cb6e0,
      roofColor: 0xe76f51,
      floor: ["#e8c79a", "#ddb985"],
      sign: "MI CASA",
      signColors: { bg: "#ffffff", fg: "#e76f51" },
    });
    this.building("casagrande", {
      name: "Casa grande",
      x: 35,
      z: 18,
      w: 14,
      d: 16,
      rot: Math.PI,
      doorW: 3,
      wallColor: 0xf3f0ff,
      trimColor: 0x7b61ff,
      roofColor: 0x5a4fcf,
      floor: ["#f4efe6", "#e6dccb"],
      sign: "VILLA BONITA",
      signColors: { bg: "#ffffff", fg: "#5a4fcf" },
    });
  }

  buildWarehouse() {
    const b = this.buildings.mayorista;
    const colors = [0x3d8bff, 0xff4d4d, 0xffc22e, 0xff8a3d, 0x8a5cf5, 0x5bd47a];
    for (const lx of [-6, 0, 6]) {
      b.interior.add(b.place(props.rack(colors), lx, -8.0));
      b.addLocalCollider(lx, -8.0, 3.7, 1.1);
    }
    for (const lx of [-6, 0]) {
      b.interior.add(b.place(props.rack(colors.slice().reverse()), lx, -3.2));
      b.addLocalCollider(lx, -3.2, 3.7, 1.1);
    }
    const desk = props.counter(3.2, 1.0, 0xf2a531, 0xfff1c9);
    b.interior.add(b.place(desk, 6, 2));
    b.addLocalCollider(6, 2, 3.2, 1.0);
    const sign = signMesh("PEDIDOS", 2, 0.5, { bg: "#ff8a3d", fg: "#ffffff" });
    b.interior.add(b.place(sign, 6, 2.52, 0, 1.8));
    this.supplierNpc = new ToyCharacter({
      body: 0x4a76c9,
      apron: 0xf2a531,
      hat: "gorra",
    });
    b.place(this.supplierNpc.root, 6, 0.9);
    this.scene.add(this.supplierNpc.root);
    const pallet = mesh(box(2.2, 0.14, 1.6), mat(0xb98551), 0, 0, 0);
    b.interior.add(b.place(pallet, -6, 5, 0, FLOOR_Y + 0.07));
    const pickupSign = signMesh("RECOGIDA", 1.8, 0.45, {
      bg: "#3fbf5f",
      fg: "#ffffff",
    });
    b.interior.add(b.place(pickupSign, -6, 3.9, 0, 1.6));
    this.pickupPile = new props.StoragePile(12);
    this.pickupPile.group.children.at(-1).visible = false;
    b.interior.add(b.place(this.pickupPile.group, -6, 5));
    this.supplierCounter = b.toWorld(6, 3.1);
    this.pickupPoint = b.toWorld(-6, 5);
    b.interior.add(b.place(props.pottedPlant(1.2), 9, 8));
    b.interior.add(b.place(props.pottedPlant(1.2), -9, 8));
  }

  buildHouses() {
    const casa = this.buildings.casa;
    casa.interior.add(casa.place(props.bed(0x6ec6ff), -2.6, -3.6));
    casa.addLocalCollider(-2.6, -3.6, 1.7, 2.4);
    casa.interior.add(casa.place(props.sofa(0xff9f43), 2.4, -4.9));
    casa.addLocalCollider(2.4, -4.9, 2.3, 1.0);
    casa.interior.add(casa.place(props.pottedPlant(1), 4.2, 4.8));
    const tv = mesh(roundedBox(1.6, 0.9, 0.1, 0.04), mat(0x2b2b33), 0, 0, 0);
    casa.interior.add(casa.place(tv, 2.4, -1.6, Math.PI, 1.3));
    const rug = mesh(
      roundedBox(3, 0.02, 2, 0.01),
      mat(0x9b5de5),
      0,
      0,
      0,
      false,
    );
    casa.interior.add(casa.place(rug, 1.5, -2, 0, FLOOR_Y + 0.01));
    this.homeBed = casa.toWorld(-2.6, -2.1);
    this.homeSpawn = casa.toWorld(0, 2.5);

    const villa = this.buildings.casagrande;
    villa.setLocked(true);
    villa.interior.add(villa.place(props.bed(0xffd166), -4.5, -5.5));
    villa.addLocalCollider(-4.5, -5.5, 1.7, 2.4);
    villa.interior.add(villa.place(props.sofa(0x7b61ff), 3, -6.6));
    villa.addLocalCollider(3, -6.6, 2.3, 1.0);
    villa.interior.add(
      villa.place(props.sofa(0x7b61ff), 5.6, -3.5, -Math.PI / 2),
    );
    villa.addLocalCollider(5.6, -3.5, 1.0, 2.3);
    villa.interior.add(villa.place(props.tableSet(), 0, 1));
    villa.addLocalCollider(0, 1, 2.3, 1.1);
    for (const [lx, lz] of [
      [-6, 6.5],
      [6, 6.5],
      [-6, -1],
      [6, 1],
    ])
      villa.interior.add(villa.place(props.pottedPlant(1.3), lx, lz));
    const pool = mesh(
      cylinder(1.6, 1.6, 0.05, 28),
      mat(0x4fc3f7, { roughness: 0.1 }),
      0,
      0,
      0,
      false,
    );
    villa.interior.add(villa.place(pool, -2, -1.5, 0, FLOOR_Y + 0.03));
    const trophy = new THREE.Group();
    trophy.add(mesh(roundedBox(0.8, 1, 0.8, 0.06), mat(0xffffff), 0, 0.5, 0));
    trophy.add(
      mesh(
        cylinder(0.25, 0.1, 0.45, 16),
        mat(0xf7c531, { metalness: 0.6, roughness: 0.25 }),
        0,
        1.3,
        0,
      ),
    );
    villa.interior.add(villa.place(trophy, 3.5, 5.5));
    villa.addLocalCollider(3.5, 5.5, 0.8, 0.8);
    this.villaBed = villa.toWorld(-4.5, -4.0);
  }

  buildBoutique() {
    const b = this.buildings.boutique;
    b.interior.add(
      b.place(
        props.clothesRack([
          0x2ec4c4, 0x5bd47a, 0x4f8dff, 0xff7eb6, 0x34405c, 0xf2c230,
        ]),
        -2.4,
        -3.8,
      ),
    );
    b.addLocalCollider(-2.4, -3.8, 2.2, 0.6);
    b.interior.add(b.place(props.mannequin(0x34405c, 0x5a3b22), -3.6, 1.5));
    b.addLocalCollider(-3.6, 1.5, 0.7, 0.7);
    b.interior.add(b.place(props.mannequin(0xf2c230, 0xf7c531), 3.6, 1.5));
    b.addLocalCollider(3.6, 1.5, 0.7, 0.7);
    const desk = props.counter(2.4, 0.9, 0xff6fa8, 0xffffff);
    b.interior.add(b.place(desk, 2.4, -2.6));
    b.addLocalCollider(2.4, -2.6, 2.4, 0.9);
    const mirror = mesh(
      roundedBox(1.2, 2, 0.08, 0.05),
      mat(0xdff6ff, { roughness: 0.05, metalness: 0.5 }),
      0,
      0,
      0,
    );
    b.interior.add(b.place(mirror, -4.75, -1, Math.PI / 2, 1.2));
    this.boutiqueCounter = b.toWorld(2.4, -1.6);
    const clerk = new ToyCharacter({ body: 0xff6fa8 });
    b.place(clerk.root, 2.4, -3.6);
    this.scene.add(clerk.root);
    this.clerk = clerk;
  }

  buildDealership() {
    const lot = mesh(box(18, 0.1, 16), mat(0xdfe6ea), 58, 0.05, 20, false);
    this.scene.add(lot);
    this.physics.addFloor(49, 12, 67, 28, 0.1);
    const booth = new THREE.Group();
    booth.add(mesh(roundedBox(3, 2.6, 2, 0.15), mat(0xffffff), 0, 1.3, 0));
    booth.add(mesh(roundedBox(3.4, 0.3, 2.4, 0.1), mat(0xff5a4e), 0, 2.75, 0));
    const sign = signMesh("CONCESIONARIO", 3.2, 0.6, {
      bg: "#ff5a4e",
      fg: "#ffffff",
      font: "bold 54px",
    });
    sign.position.set(0, 3.3, 0);
    sign.rotation.y = Math.PI;
    booth.add(sign);
    booth.position.set(58, 0.1, 25);
    this.scene.add(booth);
    this.physics.addCentered(58, 25, 3, 2);
    this.dealerCounter = { x: 58, z: 23.4 };
    const scooterStand = mesh(
      cylinder(1.4, 1.4, 0.25, 24),
      mat(0xffffff),
      53,
      0.2,
      18,
    );
    this.scene.add(scooterStand);
    const scooter = toyScooter();
    scooter.position.set(53, 0.32, 18);
    this.scene.add(scooter);
    this.displayScooter = scooter;
    this.physics.addCentered(53, 18, 2.4, 2.4);
    const vanStand = mesh(
      cylinder(2.5, 2.5, 0.25, 24),
      mat(0xffffff),
      62,
      0.2,
      17,
    );
    this.scene.add(vanStand);
    const van = toyVan(0xffffff);
    van.position.set(62, 0.32, 17);
    van.rotation.y = 0.6;
    this.scene.add(van);
    this.displayVan = van;
    this.physics.addCentered(62, 17, 4.2, 4.2);
    // Furgoneta propia aparcada (visible al comprarla).
    this.ownVan = toyVan(0x2ec4c4);
    this.ownVan.position.set(25, SIDEWALK, 13);
    this.ownVan.rotation.y = 0;
    this.ownVan.visible = false;
    this.scene.add(this.ownVan);
  }

  tree(x, z, s = 1) {
    const g = new THREE.Group();
    g.add(mesh(cylinder(0.18, 0.25, 1.4, 8), mat(0x8b5a3c), 0, 0.7, 0));
    const leaf = mat(
      [0x5cc46a, 0x4fb35d, 0x6ad178][Math.floor(Math.abs(x * 7 + z * 3)) % 3],
    );
    g.add(mesh(sphere(0.95, 14), leaf, 0, 2.0, 0));
    g.add(mesh(sphere(0.7, 12), leaf, 0.5, 1.7, 0.3));
    g.add(mesh(sphere(0.65, 12), leaf, -0.45, 1.8, -0.25));
    g.scale.setScalar(s);
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.physics.addCentered(x, z, 0.6 * s, 0.6 * s);
  }

  lamp(x, z) {
    const g = new THREE.Group();
    g.add(mesh(cylinder(0.08, 0.12, 3.6, 8), mat(0x3e4a59), 0, 1.8, 0));
    g.add(mesh(cylinder(0.3, 0.2, 0.25, 10), mat(0x3e4a59), 0, 3.7, 0));
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xfff3c4,
      emissive: 0xffd26e,
      emissiveIntensity: 0.1,
    });
    g.add(mesh(sphere(0.2, 12), bulbMat, 0, 3.5, 0, false));
    g.position.set(x, SIDEWALK, z);
    this.scene.add(g);
    this.lamps.push(bulbMat);
    this.physics.addCentered(x, z, 0.3, 0.3);
  }

  bench(x, z, rot) {
    const g = new THREE.Group();
    g.add(mesh(roundedBox(2, 0.1, 0.6, 0.04), mat(0xd9824b), 0, 0.5, 0));
    g.add(mesh(roundedBox(2, 0.5, 0.1, 0.04), mat(0xd9824b), 0, 0.85, -0.28));
    for (const s of [-1, 1])
      g.add(mesh(box(0.1, 0.5, 0.5), mat(0x3e4a59), s * 0.85, 0.25, 0));
    g.position.set(x, SIDEWALK, z);
    g.rotation.y = rot;
    this.scene.add(g);
    this.physics.addCentered(x, z, rot ? 0.6 : 2, rot ? 2 : 0.6);
  }

  buildDecor() {
    for (let x = -66; x <= 66; x += 12) {
      if (Math.abs(x) < 8) continue;
      this.lamp(x, -4.6);
      this.lamp(x + 6, 4.6);
    }
    for (const x of [-38, -8.5, 31, 48]) this.tree(x, -8.6, 0.8);
    for (const x of [-40, -64, 46, 70, 24.5]) this.tree(x, 8.6, 0.8);
    for (let z = -44; z <= -14; z += 9) this.tree(-5.6, z, 0.8);
    for (let z = 16; z <= 48; z += 9) this.tree(5.6, z, 0.8);
    // Parque al sur del barrio residencial.
    for (let i = 0; i < 14; i++) {
      const x = 12 + (i % 7) * 6 + (i > 6 ? 3 : 0);
      const z = 34 + Math.floor(i / 7) * 8;
      this.tree(x, z, 1 + (i % 3) * 0.15);
    }
    const pond = mesh(
      cylinder(4, 4, 0.06, 32),
      mat(0x63c5f0, { roughness: 0.15 }),
      30,
      0.03,
      38,
      false,
    );
    this.scene.add(pond);
    this.physics.addCentered(30, 38, 6.4, 6.4);
    this.bench(-11.5, -8.6, 0);
    this.bench(8.8, 8.8, Math.PI);
    this.bench(-36, 8.8, Math.PI);
    // Parterres de flores como en la referencia.
    const beds = [
      [-33, -8.8, 3, 1],
      [11.5, -8.8, 3, 1],
      [-46, 8.8, 3, 1],
      [-30, 8.8, 3, 1],
    ];
    for (const [x, z, w, d] of beds) {
      const fb = props.flowerBed(w, d);
      fb.position.set(x, SIDEWALK, z);
      this.scene.add(fb);
      this.physics.addCentered(x, z, w, d);
    }
    // Árboles de fondo al norte.
    for (let x = -70; x <= 70; x += 7)
      this.tree(x, -40 + (Math.abs(x) % 3), 1.2);
    // Coches aparcados.
    const parked = [
      [toyCar(0x69db7c), -38, 13, 0],
      [toyCar(0xffa8a8), 45.5, 13, Math.PI],
    ];
    for (const [car, x, z, r] of parked) {
      car.position.set(x, 0, z);
      car.rotation.y = r;
      this.scene.add(car);
      this.physics.addCentered(x, z, 1.8, 3.3);
    }
  }

  buildBounds() {
    const fence = mat(0xffffff);
    const { minX, maxX, minZ, maxZ } = WORLD;
    this.physics.addBox(minX - 2, minZ - 2, maxX + 2, minZ);
    this.physics.addBox(minX - 2, maxZ, maxX + 2, maxZ + 2);
    this.physics.addBox(minX - 2, minZ, minX, maxZ);
    this.physics.addBox(maxX, minZ, maxX + 2, maxZ);
    for (const z of [minZ - 0.5, maxZ + 0.5])
      this.scene.add(mesh(box(maxX - minX, 0.8, 0.2), fence, 0, 0.4, z));
    for (const x of [minX - 0.5, maxX + 0.5])
      this.scene.add(
        mesh(box(0.2, 0.8, maxZ - minZ), fence, x, 0.4, (minZ + maxZ) / 2),
      );
  }

  setNight(amount) {
    for (const m of this.lamps) m.emissiveIntensity = 0.1 + amount * 2.4;
  }

  update(dt, actors, player) {
    for (const b of Object.values(this.buildings)) {
      let near = false;
      const door = b.doorPoint(0);
      for (const a of actors) {
        const dx = a.x - door.x;
        const dz = a.z - door.z;
        if (dx * dx + dz * dz < 9) near = true;
      }
      b.updateDoors(dt, near && !b.shutter);
      const inside = b.contains(player.x, player.z, -0.1);
      b.roof.visible = !inside;
    }
    this.traffic.update(dt, actors);
    this.supplierNpc.animate(dt, 0);
    this.clerk.animate(dt, 0);
    this.displayScooter.rotation.y += dt * 0.5;
  }
}
