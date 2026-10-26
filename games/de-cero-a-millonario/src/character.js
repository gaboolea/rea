// Personajes de juguete: cabeza grande sin rasgos, cuerpo redondeado y
// extremidades cortas. La ropa y los accesorios son geometría 3D real que
// se monta sobre las mismas articulaciones, así se mueve con el cuerpo.
// Animación procedural de reposo, caminar, correr, cargar, saludar, etc.
import * as THREE from "three";
import {
  mat,
  capsule,
  sphere,
  cylinder,
  roundedBox,
  box,
  mesh,
  geo,
  bubbleMaterial,
} from "./gfx.js";
import { PRODUCTS } from "./config.js";
import { cargoCart } from "./decor.js";
import { COLORS, SKINS, defaultLook } from "./look.js";

const dome = (r) =>
  geo(
    `dome${r}`,
    () => new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
  );
const torus = (r, t) =>
  geo(`torus${r}|${t}`, () => new THREE.TorusGeometry(r, t, 10, 28));
const cone = (r, h, seg = 12) =>
  geo(`cone${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg));

const cloth = (c) => mat(c, { roughness: 0.6 });
const shiny = (c) => mat(c, { roughness: 0.25, metalness: 0.55 });
const lighten = (c, amount) =>
  new THREE.Color(c).offsetHSL(0, 0, amount).getHex();

export class ToyCharacter {
  constructor({ look = defaultLook(), scale = 1, apron = null } = {}) {
    this.root = new THREE.Group();
    this.rig = new THREE.Group();
    this.root.add(this.rig);
    this.rig.scale.setScalar(scale);
    this.baseScale = scale;
    this.phase = Math.random() * 10;
    this.speed = 0;
    this.action = null; // { kind, t, duration }
    this.apron = apron;
    this.squash = 0;
    this.buildSkeleton();
    this.setLook(look);
    this.bubble = new THREE.Sprite(bubbleMaterial("?"));
    this.bubble.scale.set(0.8, 0.8, 0.8);
    this.bubble.position.set(0.35, 2.35, 0);
    this.bubble.visible = false;
    this.bubble.renderOrder = 10;
    this.root.add(this.bubble);
    this.bubbleTimer = 0;
  }

  // Articulaciones vacías; setLook() las rellena con cuerpo y ropa.
  buildSkeleton() {
    this.torso = new THREE.Group();
    this.torso.position.set(0, 0.78, 0);
    this.torso.scale.set(1, 1, 0.85);
    this.rig.add(this.torso);
    this.headPivot = new THREE.Group();
    this.headPivot.position.set(0, 1.18, 0);
    this.rig.add(this.headPivot);
    this.legs = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.15, 0.46, 0);
      pivot.userData.side = side;
      this.rig.add(pivot);
      return pivot;
    });
    this.arms = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.34, 0.98, 0);
      pivot.userData.side = side;
      this.rig.add(pivot);
      return pivot;
    });
    this.carryGroup = new THREE.Group();
    this.carryGroup.position.set(0, 0.85, 0.42);
    this.rig.add(this.carryGroup);
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 20),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    this.root.add(shadow);
  }

  setLook(look) {
    this.look = structuredClone(look);
    for (const part of [this.torso, this.headPivot, ...this.legs, ...this.arms])
      part.clear();
    const skin = mat(
      SKINS.find((s) => s.id === look.skin)?.color ?? SKINS[0].color,
      { roughness: 0.35 },
    );
    this.skinMat = skin;
    const head = mesh(sphere(0.42, 24), skin, 0, 0.32, 0);
    this.headPivot.add(head);
    this.dressTop(look.top ?? { id: "camiseta", color: "turquesa" }, skin);
    this.dressBottom(look.bottom ?? { id: "pantalon", color: "marino" }, skin);
    this.dressShoes(look.shoes ?? { id: "zapatillas", color: "blanco" });
    this.dressHat(look.hat ?? { id: "none" });
    this.dressGlasses(look.glasses ?? { id: "none" });
    this.dressBack(look.back ?? { id: "none" });
    this.dressNeck(look.neck ?? { id: "none" });
    if (this.apron)
      this.torso.add(
        mesh(
          roundedBox(0.46, 0.42, 0.05, 0.03),
          mat(this.apron),
          0,
          -0.08,
          0.29,
        ),
      );
    // Solo cabeza y tronco proyectan sombra: los detalles no se notan en
    // ella y así cada personaje cuesta muchas menos pasadas de dibujo.
    this.rig.traverse((o) => {
      if (o.isMesh) o.castShadow = false;
    });
    head.castShadow = true;
    this.torso.children[0].castShadow = true;
  }

  dressTop(item, skin) {
    const t = this.torso;
    const gold = item.id === "traje_oro";
    const color = gold ? COLORS.oro : (COLORS[item.color] ?? COLORS.turquesa);
    const m = gold ? shiny(color) : cloth(color);
    t.add(mesh(capsule(0.3, 0.32), m, 0, 0, 0));
    const longSleeves = item.id !== "camiseta";
    for (const arm of this.arms) {
      const side = arm.userData.side;
      if (longSleeves)
        arm.add(mesh(capsule(0.095, 0.22), m, side * 0.04, -0.2, 0));
      else {
        arm.add(mesh(capsule(0.085, 0.22), skin, side * 0.04, -0.2, 0));
        arm.add(
          mesh(cylinder(0.115, 0.11, 0.16, 12), m, side * 0.02, -0.06, 0),
        );
      }
      arm.add(mesh(sphere(0.1, 12), skin, side * 0.05, -0.36, 0));
    }
    const trim = cloth(lighten(color, 0.12));
    if (item.id === "camiseta") {
      const collar = mesh(torus(0.14, 0.03), trim, 0, 0.42, 0.04);
      collar.rotation.x = Math.PI / 2;
      t.add(collar);
    } else if (item.id === "sudadera") {
      const hood = mesh(torus(0.2, 0.1), m, 0, 0.4, -0.14);
      hood.rotation.x = Math.PI / 2 - 0.5;
      t.add(hood);
      t.add(
        mesh(
          roundedBox(0.36, 0.15, 0.06, 0.03),
          cloth(lighten(color, -0.08)),
          0,
          -0.14,
          0.28,
        ),
      );
      for (const s of [-1, 1])
        t.add(
          mesh(
            cylinder(0.013, 0.013, 0.2, 6),
            mat(0xffffff),
            s * 0.07,
            0.24,
            0.29,
          ),
        );
    } else if (item.id === "chaqueta") {
      t.add(
        mesh(roundedBox(0.17, 0.48, 0.05, 0.02), cloth(0xf7f7f2), 0, 0.1, 0.27),
      );
      for (const s of [-1, 1]) {
        const lapel = mesh(
          roundedBox(0.09, 0.22, 0.05, 0.02),
          trim,
          s * 0.1,
          0.32,
          0.25,
        );
        lapel.rotation.z = s * 0.45;
        t.add(lapel);
      }
      for (const y of [0.05, -0.12])
        t.add(mesh(sphere(0.025, 8), mat(0x333333), 0.11, y, 0.3));
    } else if (item.id === "traje" || gold) {
      t.add(
        mesh(
          roundedBox(0.18, 0.44, 0.05, 0.02),
          cloth(0xffffff),
          0,
          0.14,
          0.27,
        ),
      );
      const tie = gold ? mat(0x2f3542) : mat(0xe23b3b);
      t.add(mesh(roundedBox(0.075, 0.3, 0.03, 0.015), tie, 0, 0.1, 0.31));
      t.add(mesh(sphere(0.04, 8), tie, 0, 0.29, 0.31));
      for (const s of [-1, 1]) {
        const lapel = mesh(
          roundedBox(0.08, 0.3, 0.04, 0.02),
          gold ? shiny(lighten(color, -0.1)) : cloth(lighten(color, -0.08)),
          s * 0.12,
          0.2,
          0.27,
        );
        lapel.rotation.z = s * 0.35;
        t.add(lapel);
      }
    }
  }

  dressBottom(item, skin) {
    const denim = item.id === "vaqueros";
    const color = denim ? 0x4a6fa5 : (COLORS[item.color] ?? COLORS.marino);
    const m = cloth(color);
    const hips = mesh(sphere(0.3, 20), m, 0, -0.26, 0);
    hips.scale.set(1.01, 0.6, 1.01);
    this.torso.add(hips);
    if (denim || item.id === "pantalon_traje") {
      const belt = mesh(
        torus(0.29, 0.025),
        mat(denim ? 0x6b4226 : 0x222222),
        0,
        -0.16,
        0,
      );
      belt.rotation.x = Math.PI / 2;
      this.torso.add(belt);
    }
    for (const leg of this.legs) {
      if (item.id === "shorts") {
        leg.add(mesh(capsule(0.11, 0.18), skin, 0, -0.22, 0));
        leg.add(mesh(cylinder(0.145, 0.14, 0.18, 12), m, 0, -0.06, 0));
      } else {
        leg.add(mesh(capsule(0.125, 0.18), m, 0, -0.22, 0));
      }
    }
  }

  dressShoes(item) {
    const color = COLORS[item.color] ?? COLORS.blanco;
    for (const leg of this.legs) {
      if (item.id === "altas") {
        leg.add(
          mesh(
            roundedBox(0.23, 0.22, 0.32, 0.07),
            cloth(color),
            0,
            -0.36,
            0.05,
          ),
        );
        leg.add(
          mesh(
            roundedBox(0.2, 0.08, 0.1, 0.03),
            cloth(0xffffff),
            0,
            -0.42,
            0.19,
          ),
        );
        leg.add(mesh(box(0.24, 0.045, 0.33), mat(0xffffff), 0, -0.455, 0.05));
      } else if (item.id === "botas") {
        leg.add(
          mesh(
            roundedBox(0.23, 0.24, 0.31, 0.07),
            cloth(0x7a4a2a),
            0,
            -0.35,
            0.04,
          ),
        );
        leg.add(mesh(box(0.24, 0.05, 0.32), mat(0x3b2716), 0, -0.455, 0.04));
      } else if (item.id === "zapatos") {
        leg.add(
          mesh(
            roundedBox(0.21, 0.11, 0.33, 0.05),
            mat(0x1f1f24, { roughness: 0.2 }),
            0,
            -0.41,
            0.06,
          ),
        );
      } else {
        const golden = item.id === "doradas";
        leg.add(
          mesh(
            roundedBox(0.22, 0.13, 0.32, 0.06),
            golden ? shiny(COLORS.oro) : cloth(color),
            0,
            -0.4,
            0.05,
          ),
        );
        leg.add(mesh(box(0.23, 0.045, 0.33), mat(0xffffff), 0, -0.455, 0.05));
        leg.add(
          mesh(
            box(0.1, 0.02, 0.08),
            mat(
              golden
                ? 0xffffff
                : lighten(color, color === COLORS.blanco ? -0.3 : 0.25),
            ),
            0,
            -0.33,
            0.12,
          ),
        );
      }
    }
  }

  dressHat(item) {
    const h = this.headPivot;
    const color = COLORS[item.color] ?? COLORS.rojo;
    if (item.id === "gorra") {
      const capDome = mesh(dome(0.44), cloth(color), 0, 0.36, 0);
      capDome.rotation.x = -0.12;
      h.add(capDome);
      const visor = mesh(
        cylinder(0.27, 0.27, 0.035, 20),
        cloth(lighten(color, -0.1)),
        0,
        0.42,
        0.36,
      );
      visor.scale.z = 0.7;
      visor.rotation.x = 0.15;
      h.add(visor);
      h.add(mesh(sphere(0.05, 8), cloth(lighten(color, -0.1)), 0, 0.79, -0.04));
    } else if (item.id === "gorro") {
      const beanie = mesh(dome(0.45), cloth(color), 0, 0.34, 0);
      beanie.scale.y = 1.12;
      h.add(beanie);
      const rim = mesh(
        torus(0.43, 0.065),
        cloth(lighten(color, -0.08)),
        0,
        0.37,
        0,
      );
      rim.rotation.x = Math.PI / 2;
      h.add(rim);
      h.add(mesh(sphere(0.12, 12), cloth(0xffffff), 0, 0.88, 0));
    } else if (item.id === "sombrero") {
      h.add(mesh(cylinder(0.64, 0.64, 0.045, 28), cloth(0xd9b26b), 0, 0.62, 0));
      h.add(mesh(cylinder(0.29, 0.33, 0.32, 22), cloth(0xd9b26b), 0, 0.79, 0));
      h.add(
        mesh(cylinder(0.335, 0.335, 0.07, 22), cloth(0x7a4a2a), 0, 0.68, 0),
      );
    } else if (item.id === "chistera") {
      h.add(mesh(cylinder(0.5, 0.5, 0.045, 26), mat(0x1f1f24), 0, 0.65, 0));
      h.add(mesh(cylinder(0.29, 0.29, 0.6, 22), mat(0x1f1f24), 0, 0.96, 0));
      h.add(
        mesh(cylinder(0.295, 0.295, 0.09, 22), cloth(0xe23b3b), 0, 0.72, 0),
      );
    } else if (item.id === "corona") {
      const gold = shiny(0xf7c531);
      h.add(mesh(cylinder(0.27, 0.29, 0.16, 22), gold, 0, 0.74, 0));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        h.add(
          mesh(
            cone(0.07, 0.17, 6),
            gold,
            Math.cos(a) * 0.23,
            0.89,
            Math.sin(a) * 0.23,
          ),
        );
        h.add(
          mesh(
            sphere(0.035, 8),
            mat(0xff3b6b),
            Math.cos(a) * 0.23,
            0.98,
            Math.sin(a) * 0.23,
          ),
        );
      }
    }
  }

  // Lentes sobre la cara (frente de la cabeza, +z).
  dressGlasses(item) {
    if (item.id === "none") return;
    const h = this.headPivot;
    const color = COLORS[item.color] ?? COLORS.azul;
    let lens;
    let frame = mat(0x1f1f24, { roughness: 0.3 });
    if (item.id === "sol")
      lens = mat(0x15151b, { roughness: 0.1, metalness: 0.6 });
    else
      lens = new THREE.MeshStandardMaterial({
        color,
        transparent: true,
        opacity: 0.6,
        roughness: 0.1,
        emissive: color,
        emissiveIntensity: 0.15,
      });
    if (item.id === "estrella") frame = cloth(color);
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(s * 0.145, 0.31, 0.39);
      g.lookAt(new THREE.Vector3(s * 0.145 * 2.2, 0.31, 1.2));
      if (item.id === "estrella") {
        const star = mesh(
          cylinder(0.14, 0.14, 0.035, 5),
          lens,
          0,
          0,
          0.02,
          false,
        );
        star.rotation.x = Math.PI / 2;
        g.add(star);
      } else {
        const l = mesh(
          cylinder(0.105, 0.105, 0.025, 20),
          lens,
          0,
          0,
          0.015,
          false,
        );
        l.rotation.x = Math.PI / 2;
        g.add(l);
        g.add(mesh(torus(0.11, 0.022), frame, 0, 0, 0.02, false));
      }
      h.add(g);
    }
    h.add(mesh(box(0.09, 0.025, 0.03), frame, 0, 0.33, 0.43, false));
  }

  dressBack(item) {
    if (item.id === "none") return;
    const t = this.torso;
    if (item.id === "mochila_cohete") {
      for (const s of [-1, 1]) {
        t.add(
          mesh(
            cylinder(0.1, 0.1, 0.46, 14),
            shiny(0xc9d3dd),
            s * 0.13,
            0.02,
            -0.38,
          ),
        );
        t.add(mesh(cone(0.1, 0.16, 14), mat(0xff5a4e), s * 0.13, 0.33, -0.38));
        const flame = mesh(
          cone(0.07, 0.18, 10),
          new THREE.MeshBasicMaterial({ color: 0xffb347 }),
          s * 0.13,
          -0.3,
          -0.38,
          false,
        );
        flame.rotation.x = Math.PI;
        t.add(flame);
      }
    } else {
      const color = COLORS[item.color] ?? COLORS.naranja;
      t.add(
        mesh(roundedBox(0.46, 0.5, 0.22, 0.08), cloth(color), 0, 0.02, -0.38),
      );
      t.add(
        mesh(
          roundedBox(0.47, 0.17, 0.24, 0.06),
          cloth(lighten(color, 0.12)),
          0,
          0.2,
          -0.39,
        ),
      );
      t.add(
        mesh(
          roundedBox(0.28, 0.16, 0.05, 0.03),
          cloth(lighten(color, -0.1)),
          0,
          -0.1,
          -0.5,
        ),
      );
    }
    for (const s of [-1, 1])
      t.add(
        mesh(
          roundedBox(0.07, 0.5, 0.04, 0.02),
          mat(0x3e4a59),
          s * 0.15,
          0.08,
          0.28,
        ),
      );
  }

  dressNeck(item) {
    const t = this.torso;
    const color = COLORS[item.color] ?? COLORS.rojo;
    if (item.id === "pajarita") {
      for (const s of [-1, 1]) {
        const wing = mesh(
          cone(0.07, 0.13, 4),
          cloth(color),
          s * 0.07,
          0.38,
          0.28,
        );
        wing.rotation.z = (s * Math.PI) / 2;
        t.add(wing);
      }
      t.add(mesh(sphere(0.035, 8), cloth(color), 0, 0.38, 0.3));
    } else if (item.id === "bufanda") {
      const sc = mesh(torus(0.23, 0.085), cloth(color), 0, 0.42, 0.02);
      sc.rotation.x = Math.PI / 2;
      t.add(sc);
      t.add(
        mesh(
          roundedBox(0.12, 0.28, 0.06, 0.03),
          cloth(color),
          0.12,
          0.22,
          0.27,
        ),
      );
    } else if (item.id === "cadena" || item.id === "cadena_oro") {
      const metal = shiny(item.id === "cadena" ? 0xdfe6ea : 0xf7c531);
      const chain = mesh(torus(0.2, 0.022), metal, 0, 0.3, 0.17);
      chain.rotation.x = Math.PI / 2 - 0.55;
      t.add(chain);
      t.add(mesh(cylinder(0.06, 0.06, 0.025, 12), metal, 0, 0.13, 0.29));
      t.children.at(-1).rotation.x = Math.PI / 2;
    }
  }

  // items: lista de ids de producto. Sin carro se dibujan en brazos; con
  // carro (cart = true) van apiladas dentro del carro que empuja.
  setCarry(items, cart = false) {
    const key = items.join(",") + (cart ? "|carro" : "");
    if (key === this.carryKey) return;
    this.carryKey = key;
    this.carryGroup.clear();
    if (cart && !this.cart) {
      this.cart = cargoCart();
      this.cart.position.set(0, 0, 0.98);
      this.cartBoxes = new THREE.Group();
      this.cart.add(this.cartBoxes);
      this.root.add(this.cart);
    }
    if (this.cart) {
      this.cart.visible = cart;
      this.cartBoxes.clear();
    }
    items.forEach((id, i) => {
      const color = PRODUCTS[id]?.color ?? 0xc98d4f;
      const crate = new THREE.Group();
      crate.add(
        mesh(roundedBox(0.55, 0.36, 0.42, 0.04), mat(0xd9a066), 0, 0, 0),
        mesh(roundedBox(0.3, 0.14, 0.02, 0.01), mat(color), 0, 0, 0.215),
      );
      if (cart) {
        // 2 × 2 por piso, girada para que quepan a lo ancho.
        crate.rotation.y = Math.PI / 2;
        crate.position.set(
          i % 2 ? 0.2 : -0.2,
          0.49 + Math.floor(i / 4) * 0.37,
          Math.floor(i / 2) % 2 ? -0.27 : 0.27,
        );
        this.cartBoxes.add(crate);
      } else {
        crate.position.y = i * 0.37;
        this.carryGroup.add(crate);
      }
    });
    this.carrying = items.length > 0 || cart;
  }

  playAction(kind, duration = 0.6) {
    this.action = { kind, t: 0, duration };
  }

  land(strength = 1) {
    this.squash = Math.min(1, strength);
  }

  think(icon, color, seconds = 2.5) {
    this.bubble.material = bubbleMaterial(icon, color);
    this.bubble.visible = true;
    this.bubbleTimer = seconds;
  }

  // speed: velocidad horizontal actual (m/s), grounded: si toca el suelo.
  animate(dt, speed, grounded = true) {
    this.speed += (speed - this.speed) * Math.min(1, dt * 10);
    const s = this.speed;
    const moving = s > 0.2;
    const prevPhase = this.phase;
    this.phase += dt * (moving ? 3.2 + s * 1.6 : 2);
    // Un paso cada medio ciclo (para sonidos y polvo).
    this.stepped =
      moving &&
      grounded &&
      Math.floor(prevPhase / Math.PI) !== Math.floor(this.phase / Math.PI);
    const swing = moving ? Math.min(1, s / 4) * 0.9 : 0;
    const sinp = Math.sin(this.phase);
    this.legs[0].rotation.x = sinp * swing;
    this.legs[1].rotation.x = -sinp * swing;
    const bob = moving
      ? Math.abs(Math.sin(this.phase)) * 0.06 * Math.min(1.5, s / 3)
      : Math.sin(this.phase) * 0.012;
    this.rig.position.y = bob;
    this.torso.rotation.z = moving ? Math.sin(this.phase) * 0.05 : 0;
    this.torso.rotation.y = moving
      ? Math.sin(this.phase) * 0.08 * Math.min(1, s / 4)
      : 0;
    this.rig.rotation.x = moving ? Math.min(0.18, s * 0.025) : 0;
    this.rig.rotation.y = 0;
    this.headPivot.rotation.z = moving
      ? -Math.sin(this.phase) * 0.06
      : Math.sin(this.phase * 0.5) * 0.03;
    this.headPivot.rotation.x = 0;

    if (this.carrying) {
      this.arms.forEach((a) => {
        a.rotation.x = -1.25 + Math.sin(this.phase) * 0.04 * swing;
        a.rotation.z = 0;
      });
    } else {
      this.arms[0].rotation.x = -sinp * swing * 0.9;
      this.arms[1].rotation.x = sinp * swing * 0.9;
      this.arms[0].rotation.z =
        -0.12 - (moving ? 0 : Math.sin(this.phase) * 0.03);
      this.arms[1].rotation.z =
        0.12 + (moving ? 0 : Math.sin(this.phase) * 0.03);
    }
    if (!grounded) {
      this.legs[0].rotation.x = -0.5;
      this.legs[1].rotation.x = 0.3;
      if (!this.carrying) {
        this.arms[0].rotation.z = -0.9;
        this.arms[1].rotation.z = 0.9;
      }
    }
    // Aplastamiento al aterrizar.
    if (this.squash > 0) {
      this.squash = Math.max(0, this.squash - dt * 6);
      const k = Math.sin(this.squash * Math.PI) * 0.12;
      this.rig.scale.set(
        this.baseScale * (1 + k),
        this.baseScale * (1 - k),
        this.baseScale * (1 + k),
      );
    }
    this.applyAction(dt);
    if (this.bubbleTimer > 0) {
      this.bubbleTimer -= dt;
      this.bubble.position.y = 2.35 + Math.sin(this.phase * 0.7) * 0.05;
      if (this.bubbleTimer <= 0) this.bubble.visible = false;
    }
  }

  applyAction(dt) {
    if (!this.action) return;
    const a = this.action;
    a.t += dt;
    const k = Math.sin(Math.min(1, a.t / a.duration) * Math.PI);
    if (a.kind === "stock" || a.kind === "pickup") {
      this.rig.rotation.x = k * 0.45;
      this.rig.position.y -= k * 0.12;
      this.arms.forEach((arm) => (arm.rotation.x = -0.6 - k * 0.9));
    } else if (a.kind === "register") {
      this.arms[1].rotation.x = -1.1 - Math.sin(a.t * 18) * 0.25;
      this.arms[0].rotation.x = -0.6;
    } else if (a.kind === "brew") {
      this.arms.forEach(
        (arm, i) => (arm.rotation.x = -1.2 + Math.sin(a.t * 12 + i) * 0.2),
      );
    } else if (a.kind === "cheer") {
      this.arms.forEach(
        (arm, i) => (arm.rotation.z = (i ? 1 : -1) * (2.4 - k * 0.3)),
      );
      this.rig.position.y += k * 0.25;
    } else if (a.kind === "wave") {
      this.arms[1].rotation.z = 2.5;
      this.arms[1].rotation.x = Math.sin(a.t * 10) * 0.35;
      this.headPivot.rotation.z = 0.1;
    } else if (a.kind === "talk") {
      this.arms[0].rotation.x = -0.5 - Math.abs(Math.sin(a.t * 5)) * 0.5;
      this.arms[1].rotation.x = -0.3 - Math.abs(Math.sin(a.t * 4 + 1)) * 0.4;
      this.headPivot.rotation.x = Math.sin(a.t * 6) * 0.06;
    } else if (a.kind === "dance") {
      this.rig.rotation.y = Math.sin(a.t * 5) * 0.6;
      this.arms[0].rotation.z = -1.6 - Math.sin(a.t * 10) * 0.6;
      this.arms[1].rotation.z = 1.6 - Math.sin(a.t * 10 + Math.PI) * 0.6;
      this.rig.position.y += Math.abs(Math.sin(a.t * 10)) * 0.15;
    } else if (a.kind === "pose") {
      this.arms[0].rotation.z = -0.5;
      this.arms[1].rotation.z = 2.2 - Math.sin(a.t * 3) * 0.2;
      this.torso.rotation.z = Math.sin(a.t * 2) * 0.05;
    }
    if (a.t >= a.duration) this.action = null;
  }
}
