// La ciudad: calles, aceras, edificios, decoración urbana, tráfico y los
// interiores fijos (mayorista, casas, boutique, concesionario).
import * as THREE from "three";
import { Physics, ZONE1 } from "./physics.js";
import { buildExpansion, cullZones } from "./city/index.js";
import { Building, FLOOR_Y } from "./building.js";
import {
  mat,
  box,
  mesh,
  cylinder,
  sphere,
  roundedBox,
  signMesh,
  mergeParts,
  surfaceTexture,
  sidewalkMat,
} from "./gfx.js";
import * as props from "./props.js";
import * as decor from "./decor.js";
import { Traffic, toyCar, toyVan, toyScooter } from "./vehicles.js";
import { ToyCharacter } from "./character.js";
import { workerLook } from "./look.js";

const SIDEWALK = 0.12;

const TREE_MAT = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.6,
});
const LAMP_IRON = new THREE.MeshStandardMaterial({
  color: 0x232a33,
  roughness: 0.45,
  metalness: 0.3,
});

// Distancia (al borde del edificio) a la que se dejan de dibujar los
// interiores.
const INTERIOR_DRAW = 60;

export class World {
  constructor(scene) {
    this.scene = scene;
    this.physics = new Physics();
    this.occluders = [];
    this.lamps = [];
    this.treeTops = [];
    this.buildings = {};
    this.staticInteractables = [];
    // Registros compartidos por todas las zonas: rectángulos para dibujar el
    // mapa, aceras para los peatones, zonas (con su grupo para ocultarlas
    // de lejos) y puntos de interés del mapa.
    this.mapRects = [];
    this.walkAreas = [];
    this.zones = [];
    this.pois = [];
    // Puntos por donde los peatones entran/salen y tiendas que visitan.
    this.exitPoints = [
      { x: -73, z: -6.5, zone: "barrio" },
      { x: 73, z: -6.5, zone: "barrio" },
      { x: -73, z: 6.5, zone: "barrio" },
      { x: 73, z: 6.5, zone: "barrio" },
      { x: -5.5, z: -47, zone: "barrio" },
      { x: 5.5, z: 51, zone: "barrio" },
    ];
    this.visitShops = [];
    // Dependientes de las tiendas nuevas (solo se animan en reposo).
    this.storeClerks = [];
    this.turntables = [];
    this.buildGround();
    this.buildBuildings();
    this.buildWarehouse();
    this.buildHouses();
    this.buildBoutique();
    this.buildDealership();
    this.buildDecor();
    this.buildBounds();
    this.registerZone1();
    this.traffic = new Traffic(scene);
    buildExpansion(this);
    this.physics.setRoads(this.roads, this.crosswalks);
    this.traffic.setCrosswalks(this.crosswalks);
  }

  buildGround() {
    const gw = ZONE1.maxX - ZONE1.minX + 40;
    const gd = ZONE1.maxZ - ZONE1.minZ + 40;
    const grass = mesh(
      box(gw, 0.2, gd),
      new THREE.MeshStandardMaterial({
        map: surfaceTexture("grass", "#64cc3e", [gw / 6, gd / 6]),
        roughness: 1,
      }),
      0,
      -0.1,
      2,
      false,
    );
    this.scene.add(grass);
    const asphalt = (w, d) =>
      new THREE.MeshStandardMaterial({
        map: surfaceTexture("asphalt", "#58616d", [w / 5, d / 5]),
        roughness: 0.9,
      });
    this.scene.add(mesh(box(160, 0.02, 8), asphalt(160, 8), 0, 0.01, 0, false));
    this.scene.add(
      mesh(
        box(8, 0.02, ZONE1.maxZ - ZONE1.minZ + 10),
        asphalt(8, ZONE1.maxZ - ZONE1.minZ + 10),
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
    // Pasos de cebra: los peatones los prefieren para cruzar.
    const white = mat(0xffffff);
    this.crosswalks = [];
    for (const cx of [-51.5, -22, 19, 58]) {
      for (let z = -3.4; z <= 3.5; z += 0.85)
        this.scene.add(mesh(box(3, 0.02, 0.42), white, cx, 0.03, z, false));
      this.crosswalks.push([cx - 1.6, -4.5, cx + 1.6, 4.5]);
    }
    for (const cz of [-12, 14]) {
      for (let x = -3.4; x <= 3.5; x += 0.85)
        this.scene.add(mesh(box(0.42, 0.02, 3), white, x, 0.03, cz, false));
      this.crosswalks.push([-4.5, cz - 1.6, 4.5, cz + 1.6]);
    }
    this.roads = [
      [ZONE1.minX - 6, -4, ZONE1.maxX + 6, 4],
      [-4, ZONE1.minZ - 6, 4, ZONE1.maxZ + 6],
    ];
    this.physics.setRoads(this.roads, this.crosswalks);
    // Líneas de detención del semáforo.
    for (const [x, z, w, d] of [
      [-6.2, 2, 0.35, 3.6],
      [6.2, -2, 0.35, 3.6],
      [-2, -6.2, 3.6, 0.35],
      [2, 6.2, 3.6, 0.35],
    ])
      this.scene.add(mesh(box(w, 0.02, d), white, x, 0.03, z, false));
    // Aceras elevadas (con bordillo) a lo largo de las calles.
    const pavers = surfaceTexture("pavers", "#f2dcb0", [1, 1]);
    const curb = mat(0xe8e2d6);
    const slabs = [
      [ZONE1.minX - 6, -10, -4, -4],
      [4, -10, ZONE1.maxX + 6, -4],
      [ZONE1.minX - 6, 4, -4, 10],
      [4, 4, ZONE1.maxX + 6, 10],
      [-7, ZONE1.minZ - 6, -4, -4],
      [4, ZONE1.minZ - 6, 7, -4],
      [-7, 4, -4, ZONE1.maxZ + 6],
      [4, 4, 7, ZONE1.maxZ + 6],
    ];
    for (const [x0, z0, x1, z1] of slabs) {
      const w = x1 - x0;
      const d = z1 - z0;
      this.scene.add(
        mesh(
          box(w, SIDEWALK, d),
          sidewalkMat(pavers, w, d),
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
      z: -19,
      w: 14,
      d: 18,
      partition: -3,
      wallColor: 0xfff1d6,
      trimColor: 0x2fb3a8,
      roofColor: 0x46c2b8,
      awning: ["#3fbf5f", "#ffffff"],
      sign: "MI TIENDITA",
      signColors: { bg: "#ffffff", fg: "#1f8f86" },
    });
    // Locales iniciales de los demás jugadores en el modo online.
    const plot = (id, x, z, rot, wallColor, trimColor, roofColor, awning) =>
      this.building(id, {
        name: "Local",
        x,
        z,
        w: 14,
        d: 18,
        rot,
        partition: -3,
        wallColor,
        trimColor,
        roofColor,
        awning,
        sign: "LOCAL",
        signColors: {
          bg: "#ffffff",
          fg: "#" + trimColor.toString(16).padStart(6, "0"),
        },
      });
    plot("oeste", -16, -38, Math.PI / 2, 0xfbe8ff, 0x9b6dff, 0xb18cff, [
      "#9b6dff",
      "#ffffff",
    ]);
    plot("este", 16, -38, -Math.PI / 2, 0xe2f4ff, 0x3d8bff, 0x6fb2ff, [
      "#3d8bff",
      "#ffffff",
    ]);
    plot("sur", -16, 38, Math.PI / 2, 0xfff0d9, 0xff8a3d, 0xffa45c, [
      "#ff8a3d",
      "#ffffff",
    ]);
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
      z: 19.5,
      w: 24,
      d: 19,
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

  // Mayorista de autoservicio: carros en la entrada, estanterías por
  // categoría donde se eligen las cajas, CAJA para pagar y salida con
  // antenas antirrobo (no se sale sin pagar).
  buildWarehouse() {
    const b = this.buildings.mayorista;
    const add = (obj, lx, lz, rot = 0, y) =>
      b.interior.add(b.place(obj, lx, lz, rot, y));
    const cats = [
      ["BEBIDAS", "#3d8bff", [0x3d8bff, 0xff4d4d, 0xf4f4f4]],
      ["ALIMENTOS", "#f2a531", [0xffc22e, 0x8a5cf5, 0xf2a531]],
      ["LIMPIEZA", "#7b6cff", [0x7b6cff, 0x9fe3ff, 0xffffff]],
      ["SNACKS", "#ff8a3d", [0xff8a3d, 0xffb703, 0xe76f51]],
      ["PRODUCTOS FRESCOS", "#3fbf5f", [0x5bd47a, 0xe8392f, 0xffb3d1]],
    ];
    // Estanterías del fondo, una por categoría, con su cartel colgante.
    cats.forEach(([name, color, colors], i) => {
      const lx = -9.6 + i * 4.8;
      add(decor.industrialRack(colors, 4, 2), lx, -8.1);
      b.addLocalCollider(lx, -8.1, 4.2, 1.2);
      add(decor.hangingSign(name, color, 3.6), lx, -7.2, 0, 3.0);
    });
    // Pasillo central con más estanterías y palés.
    add(decor.industrialRack([0xff4d4d, 0xffc22e, 0x3d8bff], 4, 2), -6.5, -2.6);
    b.addLocalCollider(-6.5, -2.6, 4.2, 1.2);
    add(decor.industrialRack([0x8b5a3c, 0xffd1dc, 0xf2a531], 4, 2), -0.5, -2.6);
    b.addLocalCollider(-0.5, -2.6, 4.2, 1.2);
    add(decor.hangingSign("CAFETERÍA", "#8b5a3c", 3.2), -0.5, -1.7, 0, 3.0);
    for (const [lx, lz] of [
      [5, -2.6],
      [7.6, -2.6],
    ]) {
      add(
        decor.palletStack([0xff8a3d, 0x3d8bff, 0x5bd47a, 0xffc22e], 8),
        lx,
        lz,
      );
      b.addLocalCollider(lx, lz, 1.4, 1.2);
    }
    add(decor.forklift(), 10.3, 0.8, -Math.PI / 2);
    b.addLocalCollider(10.3, 0.8, 2.6, 1.4);
    // La CAJA: grande e iluminada junto a la salida. Aquí se paga lo que
    // se ha cogido de las estanterías.
    add(decor.checkoutDesk(6.2), 6, 4.2);
    b.addLocalCollider(6, 4.2, 6.2, 1.1);
    add(decor.archSign("🛒 CAJA · PAGA AQUÍ", 0x3fbf5f, 7), 6, 4.2);
    add(decor.terminal(), 4.2, 4.2, 0, FLOOR_Y + 1.08);
    add(decor.floorZone(7, 3.2, 0x3fbf5f), 6, 6.1);
    this.cajaRing = decor.pulseRing(0xffd23f, 1.2);
    add(this.cajaRing, 6, 5.7);
    this.warehouseClerks = [4.8, 7.4].map((lx, i) => {
      const npc = new ToyCharacter({
        look: workerLook(i ? "menta" : "azul"),
        apron: 0xf2a531,
      });
      b.place(npc.root, lx, 3.2);
      this.scene.add(npc.root);
      return npc;
    });
    this.supplierCounter = b.toWorld(6, 5.4);
    const arrow = (color, lx, lz, tx, tz) =>
      add(decor.floorArrow(color), lx, lz, Math.atan2(-(tx - lx), -(tz - lz)));
    // Flechas amarillas: de la puerta a las estanterías.
    for (const [lx, lz] of [
      [2.4, 7.6],
      [2.4, 5.6],
      [2.4, 1.0],
      [2.4, -1.2],
    ])
      arrow(0xffd23f, lx, lz, lx, lz - 1);
    // Cartel de bienvenida sobre la entrada (se ve nada más entrar).
    add(
      decor.infoBoard(
        "1 · TOMA UN CARRO (a la izquierda)\n2 · ELIGE TUS CAJAS EN LAS ESTANTERÍAS\n3 · PAGA EN LA CAJA Y SAL CON TU COMPRA",
        3.8,
        1.1,
      ),
      0,
      6.4,
      Math.PI,
      2.95,
    );
    // Zona de reposición: los operarios apilan aquí las cajas que traen
    // del almacén. El palé también guarda cajas tuyas pendientes (de
    // partidas antiguas o que no cupieron en tu almacén).
    add(decor.floorZone(5.6, 3.6, 0xff8a3d), -7, 5.2);
    add(decor.hangingSign("REPOSICIÓN", "#ff8a3d", 3.6), -7, 4.2, 0, 3.05);
    this.pickupPile = new props.StoragePile(12);
    this.pickupPile.group.children.at(-1).visible = false;
    add(this.pickupPile.group, -7, 4.6);
    b.addLocalCollider(-7, 4.6, 2.0, 1.4);
    this.pickupPoint = b.toWorld(-7, 6.1);
    this.pickupPallet = b.toWorld(-7, 4.6);
    // Carros de carga junto a la entrada.
    add(decor.cartCorral(3), -5.0, 8.6, Math.PI / 2);
    b.addLocalCollider(-5.0, 7.65, 1.0, 2.9);
    this.cartPoint = b.toWorld(-3.9, 7.6);
    // Zona C: Carga y salida, con flechas hacia la puerta.
    add(decor.floorZone(3.2, 2.4, 0x3d8bff), -1.6, 8.0);
    for (const lz of [6.6, 8.0])
      add(decor.floorArrow(0x3d8bff), -1.6, lz, Math.PI);
    add(
      decor.hangingSign("C · CARGA Y SALIDA", "#3d8bff", 3.4),
      -1.6,
      8.6,
      0,
      3.05,
    );
    add(decor.handTruck(), 3.6, 8.6, Math.PI);
    b.addLocalCollider(3.6, 8.6, 0.7, 0.6);
    this.warehouseExit = b.doorPoint(-1.5);
    // Antenas antirrobo a los lados de la puerta: se ponen rojas si
    // intentas salir sin pagar.
    this.alarmMat = new THREE.MeshStandardMaterial({
      color: 0xe8edf2,
      emissive: 0xff2d2d,
      emissiveIntensity: 0,
      roughness: 0.4,
    });
    for (const s of [-1, 1]) {
      const gate = new THREE.Group();
      gate.add(
        mesh(roundedBox(0.16, 1.6, 0.6, 0.06), this.alarmMat, 0, 0.8, 0),
      );
      gate.add(mesh(cylinder(0.12, 0.12, 0.08, 12), mat(0x9aa7b0), 0, 0.04, 0));
      add(gate, s * 2.15, 8.5);
      b.addLocalCollider(s * 2.15, 8.5, 0.2, 0.6);
    }
    this.alarm = 0;
    // Iluminación de almacén.
    for (const lx of [-8, -2.5, 2.5, 8])
      for (const lz of [-5.2, 1.5])
        add(decor.pendantLamp(0x8aa0ad), lx, lz, 0, 3.4);
    // Puntos de trabajo para los operarios que mueven cajas.
    this.warehouseSpots = {
      racks: [
        ...cats.map((_, i) => b.toWorld(-9.6 + i * 4.8, -6.8)),
        b.toWorld(-0.5, -1.5),
      ],
      rackCats: [
        "bebidas",
        "alimentos",
        "limpieza",
        "snacks",
        "frescos",
        "cafeteria",
      ],
      pallet: b.toWorld(-7, 3.2),
      counter: b.toWorld(6, 2.9),
    };
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
    const clerk = new ToyCharacter({
      look: {
        ...workerLook("rosa"),
        hat: { id: "sombrero" },
        glasses: { id: "redondas", color: "rosa" },
      },
    });
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

  // Árbol frondoso de juguete: copa de varias esferas en dos verdes, unida
  // en una sola malla (muchos árboles, pocas llamadas de dibujo).
  tree(x, z, s = 1, planter = false) {
    const g = new THREE.Group();
    g.add(mesh(cylinder(0.17, 0.26, 1.6, 8), mat(0x8b5a3c), 0, 0.8, 0));
    const k = Math.floor(Math.abs(x * 7 + z * 3));
    const dark = [0x3fa55a, 0x4bb05c, 0x379a4f][k % 3];
    const light = [0x6fd67a, 0x7fdc6a, 0x63cc73][k % 3];
    const leaves = [
      [0, 2.35, 0, 1.05, dark],
      [0.62, 2.0, 0.25, 0.75, dark],
      [-0.6, 2.1, -0.2, 0.72, dark],
      [0.1, 2.05, -0.65, 0.7, dark],
      [-0.2, 2.75, 0.35, 0.72, light],
      [0.45, 2.55, -0.3, 0.6, light],
      [-0.5, 2.5, 0.45, 0.55, light],
    ].map(([px, py, pz, r, c]) => [
      sphere(r, 10).clone().scale(1, 0.88, 1),
      px,
      py,
      pz,
      0,
      c,
    ]);
    g.add(mesh(mergeParts(leaves), TREE_MAT, 0, 0, 0));
    if (planter) {
      g.add(mesh(cylinder(0.75, 0.68, 0.45, 16), mat(0xd9cbb3), 0, 0.22, 0));
      g.add(
        mesh(cylinder(0.66, 0.66, 0.05, 16), mat(0x6b4a2f), 0, 0.44, 0, false),
      );
    }
    g.scale.setScalar(s);
    g.position.set(x, planter ? SIDEWALK : 0, z);
    this.scene.add(g);
    this.treeTops.push(g);
    const c = (planter ? 1.3 : 0.6) * s;
    this.physics.addCentered(x, z, c, c);
  }

  // Farola clásica negra con farol de cristal y banderola de color.
  lamp(x, z, banner = 0xffc22e) {
    const g = new THREE.Group();
    const arm = cylinder(0.025, 0.025, 0.7, 6)
      .clone()
      .rotateZ(Math.PI / 2);
    const iron = [
      [cylinder(0.24, 0.3, 0.5, 10), 0, 0.25, 0],
      [cylinder(0.07, 0.11, 3.8, 10), 0, 2.3, 0],
      [cylinder(0.14, 0.14, 0.18, 10), 0, 1.0, 0],
      [cylinder(0.26, 0.12, 0.22, 8), 0, 4.25, 0],
      [cylinder(0.05, 0.28, 0.22, 8), 0, 4.95, 0],
      [sphere(0.06, 8), 0, 5.1, 0],
      [arm, 0.35, 3.55, 0],
    ];
    g.add(mesh(mergeParts(iron), LAMP_IRON, 0, 0, 0));
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xfff3c4,
      emissive: 0xffd26e,
      emissiveIntensity: 0.1,
      roughness: 0.2,
    });
    g.add(mesh(cylinder(0.2, 0.15, 0.5, 8), bulbMat, 0, 4.6, 0, false));
    g.add(mesh(box(0.55, 1.0, 0.03), mat(banner), 0.42, 3.0, 0));
    const halo = this.lampHalo();
    halo.position.y = 4.6;
    g.add(halo);
    g.position.set(x, SIDEWALK, z);
    this.scene.add(g);
    this.lamps.push(bulbMat);
    this.physics.addCentered(x, z, 0.4, 0.4);
  }

  // Jardinera rectangular con flores de colores y un arbusto.
  planter(x, z, rot = 0, w = 1.6) {
    const g = new THREE.Group();
    g.add(mesh(roundedBox(w, 0.5, 0.6, 0.06), mat(0x9a6b46), 0, 0.25, 0));
    g.add(mesh(box(w - 0.12, 0.05, 0.48), mat(0x6b4a2f), 0, 0.5, 0, false));
    const colors = [0xff6b9a, 0xffd23f, 0xff8a3d, 0xffffff, 0xb07cff, 0xff4d4d];
    const parts = [];
    const n = Math.round(w * 5);
    for (let i = 0; i < n; i++) {
      const px = -w / 2 + 0.15 + ((w - 0.3) * i) / Math.max(1, n - 1);
      const pz = i % 2 ? 0.12 : -0.12;
      parts.push([
        sphere(0.13, 6),
        px,
        0.66 + (i % 3) * 0.04,
        pz,
        0,
        colors[(i + Math.abs(Math.round(x))) % colors.length],
      ]);
    }
    for (const px of [-w / 4, w / 4])
      parts.push([sphere(0.24, 8), px, 0.62, 0, 0, 0x4fb35d]);
    const flowers = new THREE.Mesh(
      mergeParts(parts),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    );
    flowers.castShadow = false;
    g.add(flowers);
    g.position.set(x, SIDEWALK, z);
    g.rotation.y = rot;
    this.scene.add(g);
    const along = Math.abs(Math.sin(rot)) > 0.5;
    this.physics.addCentered(x, z, along ? 0.6 : w, along ? w : 0.6);
  }

  // Pizarra de caballete junto a la puerta de una tienda.
  chalkboard(x, z, rot, text) {
    const g = new THREE.Group();
    const wood = mat(0xb07a4a);
    for (const s of [-1, 1]) {
      const leg = mesh(box(0.06, 1.1, 0.06), wood, s * 0.32, 0.55, 0);
      g.add(leg);
    }
    const board = signMesh(text, 0.6, 0.8, {
      bg: "#2f3b36",
      fg: "#ffffff",
      font: "bold 54px",
    });
    board.position.set(0, 0.62, 0.04);
    g.add(board, mesh(box(0.7, 0.9, 0.04), wood, 0, 0.62, 0));
    g.rotation.x = -0.12;
    const holder = new THREE.Group();
    holder.add(g);
    holder.position.set(x, SIDEWALK, z);
    holder.rotation.y = rot;
    this.scene.add(holder);
    this.physics.addCentered(x, z, 0.5, 0.5);
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
    for (const x of [-38, -8.5, 48]) this.tree(x, -8.6, 0.8);
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
    for (const [x, z] of [
      [-13.4, -9.3],
      [10.4, 9.3],
      [-34.4, 9.3],
      [35.6, -9.3],
      [-41, -9.3],
      [53, 9.3],
    ])
      this.trashBin(x, z);
    this.busStop(33, -8.4);
    this.fruitStand(-27.2, -9.0);
    for (const x of [16.2, 25.8]) this.cafeTable(x, -7.9);
    this.fountain(40, 29.5);
    this.buildClouds();
    this.buildButterflies();
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
      if (Math.abs(x) < 4 || Math.abs(x) > 27)
        this.tree(x, -40 + (Math.abs(x) % 3), 1.2);
    // Calle principal como en la referencia: árboles en alcorque junto al
    // bordillo, jardineras a los lados de cada puerta y pizarras.
    const busy = (x) =>
      Math.abs(x) < 9 ||
      Math.abs(x - 33) < 4 ||
      [-51.5, -22, 19, 58].some((c) => Math.abs(x - c) < 3);
    for (let x = -66; x <= 66; x += 12)
      for (const [tx, tz] of [
        [x + 3, -4.95],
        [x + 9, 4.95],
      ])
        if (!busy(tx) && Math.abs(tx) < 70) this.tree(tx, tz, 0.75, true);
    for (const b of Object.values(this.buildings)) {
      if (!b.opts.sign || b.id === "casa" || b.id === "casagrande") continue;
      for (const side of [-1, 1]) {
        const p = b.doorPoint(0.45, side * (b.opts.doorW / 2 + 1.4));
        this.planter(p.x, p.z, b.worldRot(0));
      }
    }
    for (const [id, text] of [
      ["tienda", "¡ABIERTO!\nfruta fresca"],
      ["cafeteria", "CAFÉ\nrecién hecho"],
      ["boutique", "NUEVA\ncolección"],
    ]) {
      const b = this.buildings[id];
      const p = b.doorPoint(1.3, -(b.opts.doorW / 2 + 0.7));
      this.chalkboard(p.x, p.z, b.worldRot(0), text);
    }
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

  // Valla del barrio inicial con aperturas donde salen las avenidas nuevas:
  // al norte (zona comercial), al sur (zona residencial) y al oeste (hacia
  // el distrito financiero). Al este está el mar.
  buildBounds() {
    const fence = mat(0xffffff);
    const { minX, maxX, minZ, maxZ } = ZONE1;
    const gapX = [-8, 8];
    const gapZ = [-11, 11];
    const wall = (x0, z0, x1, z1) => {
      if (x1 - x0 <= 0 || z1 - z0 <= 0) return;
      this.physics.addBox(x0, z0, x1, z1);
    };
    const rail = (x0, z0, x1, z1) => {
      const w = Math.max(0.2, x1 - x0);
      const d = Math.max(0.2, z1 - z0);
      this.scene.add(
        mesh(box(w, 0.8, d), fence, (x0 + x1) / 2, 0.4, (z0 + z1) / 2),
      );
    };
    for (const [z0, z1, zr] of [
      [minZ - 2, minZ, minZ - 0.5],
      [maxZ, maxZ + 2, maxZ + 0.5],
    ]) {
      wall(minX - 2, z0, gapX[0], z1);
      wall(gapX[1], z0, maxX + 2, z1);
      rail(minX, zr - 0.1, gapX[0], zr + 0.1);
      rail(gapX[1], zr - 0.1, maxX, zr + 0.1);
    }
    wall(minX - 2, minZ, minX, gapZ[0]);
    wall(minX - 2, gapZ[1], minX, maxZ);
    rail(minX - 0.6, minZ, minX - 0.4, gapZ[0]);
    rail(minX - 0.6, gapZ[1], minX - 0.4, maxZ);
    wall(maxX, minZ, maxX + 2, maxZ);
    rail(maxX + 0.4, minZ, maxX + 0.6, maxZ);
  }

  // Zona que contiene el punto (por defecto, el barrio inicial).
  zoneOf(x, z) {
    for (const zn of this.zones)
      if (
        x >= zn.rect[0] &&
        x <= zn.rect[2] &&
        z >= zn.rect[1] &&
        z <= zn.rect[3]
      )
        return zn.id;
    return "barrio";
  }

  // Datos del barrio inicial para el mapa, los peatones y los iconos.
  registerZone1() {
    const { minX, maxX, minZ, maxZ } = ZONE1;
    this.zones.push({
      id: "barrio",
      name: "Barrio inicial",
      rect: [minX, minZ, maxX, maxZ],
      group: null,
    });
    this.mapRects.push(
      { kind: "grass", rect: [minX, minZ, maxX, maxZ] },
      { kind: "walk", rect: [minX - 6, -10, maxX + 6, 10] },
      { kind: "walk", rect: [-7, minZ - 6, 7, maxZ + 6] },
      { kind: "road", rect: [-80, -4, 80, 4] },
      { kind: "road", rect: [-4, minZ - 5, 4, maxZ + 5] },
      { kind: "water", circle: [30, 38, 4] },
    );
    for (const r of [
      [-70, -8.5, 70, -5],
      [-70, 5, 70, 8.5],
      [-6.5, -45, -4.6, -12],
      [4.6, -45, 6.5, -12],
      [-6.5, 12, -4.6, 48],
      [4.6, 12, 6.5, 48],
    ])
      this.walkAreas.push({ zone: "barrio", rect: r });
    const b = this.buildings;
    this.pois.push(
      {
        id: "mayorista",
        name: "Mayorista",
        icon: "📦",
        at: b.mayorista.doorPoint(1),
      },
      {
        id: "boutique",
        name: "Boutique",
        icon: "👗",
        at: b.boutique.doorPoint(1),
      },
      {
        id: "cafeteria",
        name: "Café Aroma",
        icon: "☕",
        at: b.cafeteria.doorPoint(1),
      },
      {
        id: "casa",
        name: "Tu casa (barrio)",
        icon: "🛏️",
        at: b.casa.doorPoint(1),
      },
      {
        id: "concesionario",
        name: "Concesionario del barrio",
        icon: "🛵",
        at: { x: 58, z: 22 },
      },
    );
  }

  trashBin(x, z) {
    const g = new THREE.Group();
    g.add(mesh(cylinder(0.26, 0.22, 0.75, 14), mat(0x3fbf5f), 0, 0.38, 0));
    g.add(mesh(cylinder(0.29, 0.29, 0.08, 14), mat(0x2e8a43), 0, 0.78, 0));
    g.position.set(x, SIDEWALK, z);
    this.scene.add(g);
    this.physics.addCentered(x, z, 0.55, 0.55);
  }

  busStop(x, z) {
    const g = new THREE.Group();
    g.add(mesh(roundedBox(3.4, 0.12, 1.5, 0.05), mat(0x4f8dff), 0, 2.5, 0));
    g.add(
      mesh(
        box(3.2, 2.2, 0.06),
        new THREE.MeshStandardMaterial({
          color: 0xcff3ff,
          transparent: true,
          opacity: 0.35,
        }),
        0,
        1.3,
        -0.65,
        false,
      ),
    );
    for (const s of [-1, 1])
      g.add(
        mesh(cylinder(0.06, 0.06, 2.5, 8), mat(0x3e4a59), s * 1.6, 1.25, -0.6),
      );
    g.add(mesh(roundedBox(2.4, 0.1, 0.5, 0.04), mat(0xff9f43), 0, 0.5, -0.3));
    g.add(mesh(box(2.2, 0.45, 0.08), mat(0xff9f43), 0, 0.8, -0.55));
    const sign = signMesh("BUS", 0.8, 0.8, {
      bg: "#4f8dff",
      fg: "#ffffff",
      font: "bold 220px",
      w: 256,
      h: 256,
    });
    sign.position.set(2.1, 2.6, 0.9);
    g.add(
      sign,
      mesh(cylinder(0.05, 0.05, 2.6, 8), mat(0x3e4a59), 2.1, 1.3, 0.85),
    );
    g.position.set(x, SIDEWALK, z);
    this.scene.add(g);
    this.physics.addBox(x - 1.7, z - 0.75, x + 1.7, z - 0.45);
    this.physics.addCentered(x + 2.1, z + 0.85, 0.2, 0.2);
    this.busStopPoint = { x, z: z + 0.6 };
  }

  fruitStand(x, z) {
    const g = new THREE.Group();
    g.add(mesh(roundedBox(2.0, 0.6, 0.8, 0.05), mat(0xb98551), 0, 0.3, 0));
    const fruits = [0xe8392f, 0xffc22e, 0x5bd47a, 0xff8a3d];
    for (let i = 0; i < 4; i++) {
      g.add(
        mesh(box(0.42, 0.12, 0.6), mat(0xd9a066), -0.72 + i * 0.48, 0.66, 0),
      );
      for (let k = 0; k < 5; k++)
        g.add(
          mesh(
            sphere(0.085, 10),
            mat(fruits[i]),
            -0.85 + i * 0.48 + (k % 3) * 0.13,
            0.78,
            -0.12 + Math.floor(k / 3) * 0.2,
            false,
          ),
        );
    }
    g.position.set(x, SIDEWALK, z);
    this.scene.add(g);
    this.physics.addCentered(x, z, 2.0, 0.8);
  }

  cafeTable(x, z) {
    const g = props.tableSet();
    g.add(mesh(cylinder(0.04, 0.04, 1.6, 6), mat(0xffffff), 0, 1.5, 0));
    const umbrella = mesh(
      cylinder(0.05, 1.1, 0.45, 12),
      mat(0xff9f43),
      0,
      2.35,
      0,
    );
    g.add(umbrella);
    g.position.set(x, SIDEWALK, z);
    this.scene.add(g);
    this.physics.addCentered(x, z, 2.3, 1.1);
  }

  fountain(x, z) {
    const g = new THREE.Group();
    g.add(mesh(cylinder(1.8, 1.9, 0.5, 28), mat(0xdfe6ea), 0, 0.25, 0));
    g.add(
      mesh(
        cylinder(1.55, 1.55, 0.06, 28),
        mat(0x63c5f0, { roughness: 0.1 }),
        0,
        0.47,
        0,
        false,
      ),
    );
    g.add(mesh(cylinder(0.2, 0.3, 1.2, 12), mat(0xdfe6ea), 0, 0.9, 0));
    g.add(mesh(cylinder(0.7, 0.5, 0.18, 20), mat(0xdfe6ea), 0, 1.5, 0));
    const water = new THREE.MeshStandardMaterial({
      color: 0x9fe3ff,
      transparent: true,
      opacity: 0.7,
      roughness: 0.1,
    });
    this.fountainJets ??= [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const jet = mesh(
        sphere(0.09, 8),
        water,
        Math.cos(a) * 0.5,
        1.7,
        Math.sin(a) * 0.5,
        false,
      );
      g.add(jet);
      this.fountainJets.push({ mesh: jet, a, t: i / 6 });
    }
    g.add(mesh(sphere(0.18, 12), water, 0, 1.9, 0, false));
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.fountainGroup = g;
    this.physics.addCentered(x, z, 3.6, 3.6);
  }

  buildClouds() {
    this.clouds = [];
    const m = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      emissive: 0xffffff,
      emissiveIntensity: 0.35,
    });
    for (let i = 0; i < 16; i++) {
      const g = new THREE.Group();
      const n = 5 + (i % 3);
      for (let k = 0; k < n; k++) {
        const r = 3.5 + Math.random() * 3 + (k === Math.floor(n / 2) ? 2 : 0);
        const puff = new THREE.Mesh(sphere(r, 12), m);
        puff.position.set(
          (k - n / 2) * 3.6,
          Math.random() * 2 + (k === Math.floor(n / 2) ? 2 : 0),
          Math.random() * 4,
        );
        puff.scale.y = 0.72;
        g.add(puff);
      }
      g.position.set(
        -160 + i * 21,
        48 + Math.random() * 26,
        -150 + Math.random() * 300,
      );
      this.scene.add(g);
      this.clouds.push(g);
    }
  }

  buildButterflies() {
    this.butterflies = [];
    const colors = [0xff7eb6, 0xffd23f, 0x9b6dff, 0x4f8dff];
    const homes = [
      [-33, -8.8],
      [11.5, -8.8],
      [-46, 8.8],
      [-30, 8.8],
      [30, 33],
      [22, 44],
    ];
    homes.forEach(([x, z], i) => {
      const g = new THREE.Group();
      const wingMat = new THREE.MeshStandardMaterial({
        color: colors[i % 4],
        side: THREE.DoubleSide,
      });
      const wings = [-1, 1].map((s) => {
        const w = new THREE.Mesh(new THREE.CircleGeometry(0.12, 10), wingMat);
        w.position.x = s * 0.1;
        const pivot = new THREE.Group();
        pivot.add(w);
        g.add(pivot);
        return pivot;
      });
      this.scene.add(g);
      this.butterflies.push({
        g,
        wings,
        home: { x, z },
        t: Math.random() * 10,
      });
    });
  }

  // Halo cálido alrededor de cada farola encendida.
  lampHalo() {
    if (!this.haloMat) {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const ctx = c.getContext("2d");
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, "rgba(255,230,160,1)");
      grad.addColorStop(1, "rgba(255,200,120,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
      this.haloMat = new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(c),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0,
      });
    }
    const sp = new THREE.Sprite(this.haloMat);
    sp.scale.set(2.6, 2.6, 1);
    return sp;
  }

  setNight(amount) {
    for (const m of this.lamps) m.emissiveIntensity = 0.1 + amount * 2.4;
    if (this.haloMat) this.haloMat.opacity = Math.max(0, amount - 0.1) * 0.9;
    for (const b of Object.values(this.buildings)) b.setNight(amount);
    for (const m of this.nightMats ?? []) m.emissiveIntensity = amount * 0.9;
  }

  animateAmbient(dt, time) {
    for (const c of this.clouds) {
      c.position.x += dt * 1.2;
      if (c.position.x > 170) c.position.x = -170;
    }
    for (const j of this.fountainJets) {
      j.t = (j.t + dt * 0.9) % 1;
      const r = 0.5 + j.t * 1.0;
      j.mesh.position.set(
        Math.cos(j.a) * r,
        1.7 + Math.sin(j.t * Math.PI) * 0.5 - j.t * 1.1,
        Math.sin(j.a) * r,
      );
    }
    for (const b of this.butterflies) {
      b.t += dt;
      const x = b.home.x + Math.sin(b.t * 0.7) * 1.4;
      const z = b.home.z + Math.sin(b.t * 0.9 + 1) * 0.9;
      b.g.position.set(x, 0.9 + Math.sin(b.t * 2.3) * 0.25, z);
      b.g.rotation.y = Math.atan2(Math.cos(b.t * 0.7), Math.cos(b.t * 0.9 + 1));
      const flap = Math.sin(b.t * 18) * 0.9;
      b.wings[0].rotation.z = flap;
      b.wings[1].rotation.z = -flap;
    }
    // Las copas de los árboles se mecen un poco.
    for (const t of this.treeTops)
      t.rotation.z = Math.sin(time * 0.8 + t.position.x) * 0.02;
  }

  update(dt, actors, player) {
    cullZones(this, player);
    for (const b of Object.values(this.buildings)) {
      // Interiores lejanos: no se distinguen por las ventanas; no se dibujan.
      const edge =
        Math.hypot(b.x - player.x, b.z - player.z) - Math.max(b.w, b.d) / 2;
      b.interior.visible = edge < INTERIOR_DRAW;
      // Edificios lejanos: nada que animar.
      if (Math.abs(b.x - player.x) + Math.abs(b.z - player.z) > 140) continue;
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
    this.traffic.update(dt, actors, player);
    this.animateAmbient(dt, performance.now() / 1000);
    this.expansion.financial.barrier.update(dt);
    for (const s of this.spinners ?? []) s.rotation.z += dt * 0.8;
    for (const t of this.turntables) t.rotation.y += dt * 0.35;
    for (const npc of this.warehouseClerks) npc.animate(dt, 0);
    for (const npc of this.storeClerks)
      if (
        Math.abs(npc.root.position.x - player.x) +
          Math.abs(npc.root.position.z - player.z) <
        40
      )
        npc.animate(dt, 0);
    if (this.alarm > 0) {
      this.alarm = Math.max(0, this.alarm - dt);
      this.alarmMat.emissiveIntensity =
        this.alarm > 0 ? 0.5 + Math.sin(this.alarm * 20) * 0.5 : 0;
    }
    const pulse = (performance.now() / 900) % 1;
    this.cajaRing.scale.setScalar(0.8 + pulse * 0.5);
    this.cajaRing.userData.ring.material.opacity = 0.8 * (1 - pulse);
    this.clerk.animate(dt, 0);
    this.displayScooter.rotation.y += dt * 0.5;
  }
}
