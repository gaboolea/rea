// Personajes de juguete tipo gominola: un cuerpo de una pieza en forma de
// judía, cabeza redonda fundida con él y brazos y piernas cortos y gruesos
// que salen del propio cuerpo. Rebotan como gelatina al moverse. La ropa y los accesorios son geometría 3D real que
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
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PRODUCTS } from "./config.js";
import { cargoCart } from "./decor.js";
import { COLORS, SKINS, defaultLook } from "./look.js";
import { faceGeometry, faceMaterial } from "./face.js";
import { hairGeometry } from "./hair.js";

const dome = (r) =>
  geo(
    `dome${r}`,
    () => new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
  );
const torus = (r, t) =>
  geo(`torus${r}|${t}`, () => new THREE.TorusGeometry(r, t, 10, 28));
const cone = (r, h, seg = 12) =>
  geo(`cone${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg));

// Silueta del cuerpo (coordenadas del torso): caderas redondeadas, torso
// compacto algo ancho, hombros caídos y base del cuello. Pantalón y
// camiseta se tornean con el mismo perfil; la camiseta un poco más ancha
// y solapada sobre el pantalón, para que se vea puesta y no pintada.
const PROFILE = [
  [-0.3, 0],
  [-0.29, 0.11],
  [-0.26, 0.205],
  [-0.21, 0.255],
  [-0.13, 0.27],
  [-0.05, 0.275],
  [0.04, 0.285],
  [0.13, 0.285],
  [0.2, 0.27],
  [0.25, 0.235],
  [0.285, 0.175],
  [0.305, 0.1],
  [0.31, 0],
];
const WAIST = -0.08;
function bodyRadius(y) {
  if (y <= PROFILE[0][0]) return 0;
  for (let i = 1; i < PROFILE.length; i++) {
    const [y1, r1] = PROFILE[i];
    if (y <= y1) {
      const [y0, r0] = PROFILE[i - 1];
      return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
    }
  }
  return 0;
}
const lathe = (from, to, inflate = 1) =>
  geo(`body${from}|${to}|${inflate}`, () => {
    const pts = [];
    const n = 22;
    for (let i = 0; i <= n; i++) {
      const y = from + ((to - from) * i) / n;
      pts.push(new THREE.Vector2(bodyRadius(y) * inflate, y));
    }
    return new THREE.LatheGeometry(pts, 28);
  });

// Varias piezas con el mismo material fundidas en una geometría (menos
// llamadas de dibujo por personaje). parts: [geometría, x, y, z, escala].
const merged = (key, parts) =>
  geo(key, () =>
    mergeGeometries(
      parts.map(([g, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0]) =>
        (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(
          new THREE.Matrix4().compose(
            new THREE.Vector3(x, y, z),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)),
            new THREE.Vector3(sx, sy, sz),
          ),
        ),
      ),
    ),
  );

// Camiseta: torso con bajo, cuello acanalado y la manga corta abullonada.
const shirtGeo = () =>
  merged("shirt", [
    [lathe(WAIST - 0.035, 0.31, 1.035), 0, 0, 0],
    [
      torus(bodyRadius(WAIST - 0.03) * 1.035, 0.02),
      0,
      WAIST - 0.03,
      0,
      1,
      1,
      1,
      Math.PI / 2,
    ],
    [torus(0.105, 0.022), 0, 0.29, 0, 1, 1, 1, Math.PI / 2],
  ]);
const sleeveGeo = (long) =>
  long
    ? merged("sleeve-long", [
        [sphere(0.13, 14), 0, -0.05, 0, 1, 1.1, 1],
        [capsule(0.088, 0.26), 0, -0.2, 0],
        [torus(0.086, 0.02), 0, -0.33, 0, 1, 1, 1, Math.PI / 2],
      ])
    : merged("sleeve", [
        [sphere(0.135, 14), 0, -0.065, 0, 1, 1.15, 1],
        [torus(0.108, 0.02), 0, -0.165, 0, 1, 1, 1, Math.PI / 2],
      ]);
// Brazo de piel con la mano redondeada (o solo la mano, con manga larga).
const armGeo = (long) =>
  long
    ? merged("hand", [[sphere(0.095, 14), 0, -0.41, 0.01, 0.92, 1, 0.85]])
    : merged("arm", [
        [capsule(0.074, 0.2), 0, -0.22, 0],
        [sphere(0.095, 14), 0, -0.41, 0.01, 0.92, 1, 0.85],
      ]);
// Pierna de pantalón: algo holgada, con pliegue, bajo y (cargo) bolsillo
// lateral con solapa. side: -1 / 1.
const legGeo = (kind, side) =>
  merged(`leg|${kind}|${side}`, [
    [cylinder(0.132, 0.125, 0.41, 16), 0, -0.185, 0],
    [torus(0.127, 0.012), 0, -0.15, 0, 1, 1, 1, Math.PI / 2],
    [cylinder(0.133, 0.135, 0.04, 16), 0, -0.37, 0],
    ...(kind === "cargo"
      ? [
          [roundedBox(0.05, 0.13, 0.12, 0.02), side * 0.125, -0.1, 0],
          [roundedBox(0.056, 0.035, 0.128, 0.015), side * 0.131, -0.025, 0],
        ]
      : []),
  ]);
const shortsGeo = () =>
  merged("shorts", [
    [cylinder(0.135, 0.138, 0.17, 16), 0, -0.06, 0],
    [torus(0.136, 0.012), 0, -0.14, 0, 1, 1, 1, Math.PI / 2],
  ]);

const cloth = (c) => mat(c, { roughness: 0.38 });
// Tamaño general respecto al diseño original (un poco más pequeños).
const BODY_SCALE = 0.9;
const shiny = (c) => mat(c, { roughness: 0.25, metalness: 0.55 });
const lighten = (c, amount) =>
  new THREE.Color(c).offsetHSL(0, 0, amount).getHex();

export class ToyCharacter {
  constructor({ look = defaultLook(), scale = 1, apron = null } = {}) {
    this.root = new THREE.Group();
    this.rig = new THREE.Group();
    this.root.add(this.rig);
    this.baseScale = scale * BODY_SCALE;
    this.rig.scale.setScalar(this.baseScale);
    this.phase = Math.random() * 10;
    this.speed = 0;
    this.action = null; // { kind, t, duration }
    this.apron = apron;
    // Muelle de gelatina: deformación actual y su velocidad.
    this.jelly = 0;
    this.jellyV = 0;
    // Cara: parpadeo y expresiones pasajeras ({ state, t }).
    this.blinkIn = 1 + Math.random() * 3;
    this.blinkT = 0;
    this.expression = null;
    this.buildSkeleton();
    this.setLook(look);
    this.bubble = new THREE.Sprite(bubbleMaterial("?"));
    this.bubble.scale.set(0.8, 0.8, 0.8);
    this.bubble.position.set(0.35, 2.0, 0);
    this.bubble.visible = false;
    this.bubble.renderOrder = 10;
    this.root.add(this.bubble);
    this.bubbleTimer = 0;
  }

  // Articulaciones vacías; setLook() las rellena con cuerpo y ropa.
  buildSkeleton() {
    this.torso = new THREE.Group();
    this.torso.position.set(0, 0.785, 0);
    this.torso.scale.set(1, 1, 0.86);
    this.rig.add(this.torso);
    // Cabeza más pequeña (escala de todo lo que lleva: gorros, lentes) y
    // hundida en el cuerpo, sin cuello: se ve de una sola pieza.
    this.headPivot = new THREE.Group();
    this.headPivot.position.set(0, 1.205, 0);
    this.headPivot.scale.setScalar(0.85);
    this.rig.add(this.headPivot);
    this.legs = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.145, 0.5, 0);
      pivot.userData.side = side;
      this.rig.add(pivot);
      return pivot;
    });
    this.arms = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.305, 0.975, 0);
      pivot.userData.side = side;
      this.rig.add(pivot);
      return pivot;
    });
    this.carryGroup = new THREE.Group();
    this.carryGroup.position.set(0, 0.9, 0.42);
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
      { roughness: 0.25 },
    );
    this.skinMat = skin;
    const head = mesh(sphere(0.42, 24), skin, 0, 0.32, 0);
    this.headPivot.add(head);
    // Cuello corto entre el torso y la cabeza.
    this.torso.add(mesh(cylinder(0.1, 0.11, 0.14, 14), skin, 0, 0.33, 0));
    this.dressTop(look.top ?? { id: "camiseta", color: "turquesa" }, skin);
    this.dressBottom(look.bottom ?? { id: "pantalon", color: "marino" }, skin);
    this.dressShoes(look.shoes ?? { id: "zapatillas", color: "blanco" });
    this.dressFace(look.face ?? { id: "feliz" });
    this.dressHair(look.hair ?? { id: "corto" }, look.hat ?? { id: "none" });
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
    // Los detalles de delante y de la espalda (corbatas, solapas, mochilas)
    // se apoyan sobre la curva del cuerpo a su altura, sin flotar ni hundirse.
    for (const c of this.torso.children) {
      const z = c.position.z;
      if (Math.abs(z) < 0.15 || c.geometry?.type === "TorusGeometry") continue;
      c.geometry.computeBoundingBox();
      const half =
        (c.geometry.boundingBox.max.z - c.geometry.boundingBox.min.z) / 2;
      c.position.z =
        Math.sign(z) *
        (bodyRadius(c.position.y) * 1.035 + half * (z < 0 ? 0.75 : 0.25));
    }
    // Solo cabeza y tronco proyectan sombra: los detalles no se notan en
    // ella y así cada personaje cuesta muchas menos pasadas de dibujo.
    this.rig.traverse((o) => {
      if (o.isMesh) o.castShadow = false;
    });
    head.castShadow = true;
    for (const c of this.torso.children)
      if (c.userData.body) c.castShadow = true;
  }

  dressTop(item, skin) {
    const t = this.torso;
    const gold = item.id === "traje_oro";
    const color = gold ? COLORS.oro : (COLORS[item.color] ?? COLORS.turquesa);
    const m = gold ? shiny(color) : cloth(color);
    // Camiseta torneada sobre el torso, con bajo y cuello.
    const shirt = mesh(shirtGeo(), m);
    shirt.userData.body = true;
    t.add(shirt);
    // Manga (corta y abullonada, o larga) y brazo de piel con la mano.
    const longSleeves = item.id !== "camiseta";
    for (const arm of this.arms) {
      const side = arm.userData.side;
      arm.add(mesh(sleeveGeo(longSleeves), m, side * 0.02, 0, 0));
      arm.add(mesh(armGeo(longSleeves), skin, side * 0.03, 0, 0));
    }
    const trim = cloth(lighten(color, 0.12));
    if (item.id === "sudadera") {
      const hood = mesh(torus(0.19, 0.085), m, 0, 0.26, -0.12);
      hood.rotation.x = Math.PI / 2 - 0.5;
      t.add(hood);
      t.add(
        mesh(
          roundedBox(0.34, 0.13, 0.06, 0.03),
          cloth(lighten(color, -0.08)),
          0,
          -0.02,
          0.28,
        ),
      );
      for (const s of [-1, 1])
        t.add(
          mesh(
            cylinder(0.013, 0.013, 0.18, 6),
            mat(0xffffff),
            s * 0.06,
            0.16,
            0.29,
          ),
        );
    } else if (item.id === "chaqueta") {
      t.add(
        mesh(roundedBox(0.16, 0.3, 0.04, 0.02), cloth(0xf7f7f2), 0, 0.08, 0.27),
      );
      for (const s of [-1, 1]) {
        const lapel = mesh(
          roundedBox(0.08, 0.2, 0.05, 0.02),
          trim,
          s * 0.1,
          0.18,
          0.25,
        );
        lapel.rotation.z = s * 0.45;
        t.add(lapel);
      }
      for (const y of [0.06, -0.06])
        t.add(mesh(sphere(0.025, 8), mat(0x333333), 0.11, y, 0.3));
    } else if (item.id === "traje" || gold) {
      t.add(
        mesh(roundedBox(0.17, 0.3, 0.04, 0.02), cloth(0xffffff), 0, 0.1, 0.27),
      );
      const tie = gold ? mat(0x2f3542) : mat(0xe23b3b);
      t.add(mesh(roundedBox(0.07, 0.27, 0.03, 0.015), tie, 0, 0.08, 0.31));
      t.add(mesh(sphere(0.038, 8), tie, 0, 0.24, 0.31));
      for (const s of [-1, 1]) {
        const lapel = mesh(
          roundedBox(0.08, 0.28, 0.04, 0.02),
          gold ? shiny(lighten(color, -0.1)) : cloth(lighten(color, -0.08)),
          s * 0.12,
          0.15,
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
    // Caderas del pantalón (la camiseta se solapa por encima).
    const hips = mesh(lathe(-0.3, WAIST + 0.01), m);
    hips.userData.body = true;
    this.torso.add(hips);
    for (const leg of this.legs) {
      const side = leg.userData.side;
      if (item.id === "shorts") {
        leg.add(mesh(shortsGeo(), m));
        leg.add(mesh(capsule(0.075, 0.18), skin, 0, -0.27, 0));
      } else {
        const kind = item.id === "pantalon" ? "cargo" : "plain";
        leg.add(mesh(legGeo(kind, side), m));
      }
    }
  }

  dressShoes(item) {
    const color = COLORS[item.color] ?? COLORS.blanco;
    for (const leg of this.legs) {
      // Los zapatos apoyan en el suelo: la cadera está 0,5 sobre él.
      const foot = new THREE.Group();
      foot.position.y = -0.045;
      leg.add(foot);
      if (item.id === "altas") {
        foot.add(
          mesh(
            roundedBox(0.23, 0.22, 0.32, 0.07),
            cloth(color),
            0,
            -0.36,
            0.05,
          ),
        );
        foot.add(
          mesh(
            roundedBox(0.2, 0.08, 0.1, 0.03),
            cloth(0xffffff),
            0,
            -0.42,
            0.19,
          ),
        );
        foot.add(mesh(box(0.24, 0.045, 0.33), mat(0xffffff), 0, -0.455, 0.05));
      } else if (item.id === "botas") {
        foot.add(
          mesh(
            roundedBox(0.23, 0.24, 0.31, 0.07),
            cloth(0x7a4a2a),
            0,
            -0.35,
            0.04,
          ),
        );
        foot.add(mesh(box(0.24, 0.05, 0.32), mat(0x3b2716), 0, -0.455, 0.04));
      } else if (item.id === "zapatos") {
        foot.add(
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
        foot.add(
          mesh(
            roundedBox(0.22, 0.13, 0.32, 0.06),
            golden ? shiny(COLORS.oro) : cloth(color),
            0,
            -0.4,
            0.05,
          ),
        );
        foot.add(
          mesh(
            roundedBox(0.235, 0.05, 0.335, 0.02),
            mat(0xe4e8ee),
            0,
            -0.455,
            0.05,
          ),
        );
        foot.add(
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

  // Cara dibujada sobre una máscara fina delante de la cabeza.
  dressFace(item) {
    this.faceMesh = null;
    if (!item || item.id === "none") return;
    this.faceStyle = item.id;
    this.faceState = "normal";
    this.faceMesh = new THREE.Mesh(
      faceGeometry(),
      faceMaterial(item.id, "normal"),
    );
    this.faceMesh.renderOrder = 1;
    this.headPivot.add(this.faceMesh);
  }

  // Peinado (con sombrero solo se ve lo que asoma por detrás).
  dressHair(item, hat) {
    const g = hairGeometry(item?.id, hat.id !== "none");
    if (!g) return;
    const color = COLORS[item.color] ?? COLORS.castano;
    this.headPivot.add(new THREE.Mesh(g, mat(color, { roughness: 0.45 })));
  }

  // Expresión pasajera: "joy" (alegría) o "wow" (sorpresa).
  express(state, seconds = 1) {
    this.expression = { state, t: seconds };
  }

  updateFace(dt) {
    if (!this.faceMesh) return;
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkT = 0.13;
      this.blinkIn = 2 + Math.random() * 3.5;
    }
    this.blinkT -= dt;
    if (this.expression) {
      this.expression.t -= dt;
      if (this.expression.t <= 0) this.expression = null;
    }
    const kind = this.action?.kind;
    const state = this.expression
      ? this.expression.state
      : kind === "cheer" || kind === "dance"
        ? "joy"
        : this.blinkT > 0
          ? "blink"
          : "normal";
    if (state === this.faceState) return;
    this.faceState = state;
    this.faceMesh.material = faceMaterial(this.faceStyle, state);
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
            0.04,
            -0.38,
          ),
        );
        t.add(mesh(cone(0.1, 0.16, 14), mat(0xff5a4e), s * 0.13, 0.3, -0.38));
        const flame = mesh(
          cone(0.07, 0.18, 10),
          new THREE.MeshBasicMaterial({ color: 0xffb347 }),
          s * 0.13,
          -0.26,
          -0.38,
          false,
        );
        flame.rotation.x = Math.PI;
        t.add(flame);
      }
    } else {
      const color = COLORS[item.color] ?? COLORS.naranja;
      t.add(
        mesh(roundedBox(0.44, 0.44, 0.22, 0.08), cloth(color), 0, 0.04, -0.38),
      );
      t.add(
        mesh(
          roundedBox(0.47, 0.17, 0.24, 0.06),
          cloth(lighten(color, 0.12)),
          0,
          0.18,
          -0.39,
        ),
      );
      t.add(
        mesh(
          roundedBox(0.28, 0.16, 0.05, 0.03),
          cloth(lighten(color, -0.1)),
          0,
          -0.06,
          -0.5,
        ),
      );
    }
    for (const s of [-1, 1])
      t.add(
        mesh(
          roundedBox(0.07, 0.3, 0.04, 0.02),
          mat(0x3e4a59),
          s * 0.14,
          0.12,
          0.27,
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
          0.27,
          0.28,
        );
        wing.rotation.z = (s * Math.PI) / 2;
        t.add(wing);
      }
      t.add(mesh(sphere(0.035, 8), cloth(color), 0, 0.27, 0.3));
    } else if (item.id === "bufanda") {
      const sc = mesh(torus(0.15, 0.07), cloth(color), 0, 0.29, 0.01);
      sc.rotation.x = Math.PI / 2;
      t.add(sc);
      t.add(
        mesh(roundedBox(0.12, 0.28, 0.06, 0.03), cloth(color), 0.1, 0.12, 0.27),
      );
    } else if (item.id === "cadena" || item.id === "cadena_oro") {
      const metal = shiny(item.id === "cadena" ? 0xdfe6ea : 0xf7c531);
      const chain = mesh(torus(0.17, 0.02), metal, 0, 0.2, 0.12);
      chain.rotation.x = Math.PI / 2 - 0.55;
      t.add(chain);
      t.add(mesh(cylinder(0.06, 0.06, 0.025, 12), metal, 0, 0.05, 0.29));
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
      this.cart.position.set(0, 0, 0.9);
      this.cart.scale.setScalar(0.85);
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
    this.jellyV -= Math.min(1, strength) * 3.8;
    if (strength > 0.7) this.express("wow", 0.35);
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
    // Gelatina: un muelle amortiguado en la escala. Los pasos, los cambios
    // de velocidad y los aterrizajes le dan pequeños empujones.
    if (this.stepped) this.jellyV -= 0.62 * Math.min(1, s / 4);
    this.jellyV += (s - (this.prevSpeed ?? s)) * 0.22;
    this.prevSpeed = s;
    this.jellyV += (-this.jelly * 150 - this.jellyV * 5.5) * Math.min(dt, 0.05);
    this.jelly = Math.max(
      -0.28,
      Math.min(0.28, this.jelly + this.jellyV * Math.min(dt, 0.05)),
    );
    const breathe = moving ? 0 : Math.sin(this.phase * 1.3) * 0.022;
    const k = this.jelly + breathe;
    this.rig.scale.set(
      this.baseScale * (1 - k * 0.5),
      this.baseScale * (1 + k),
      this.baseScale * (1 - k * 0.5),
    );
    this.applyAction(dt);
    this.updateFace(dt);
    if (this.bubbleTimer > 0) {
      this.bubbleTimer -= dt;
      this.bubble.position.y = 2.0 + Math.sin(this.phase * 0.7) * 0.05;
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
