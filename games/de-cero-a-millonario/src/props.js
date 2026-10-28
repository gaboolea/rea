// Muebles y objetos 3D estilizados: estanterías con productos visibles,
// refrigeradores, cajas registradoras, máquinas de café, cajas, plantas...
import * as THREE from "three";
import { PRODUCTS } from "./config.js";
import {
  mat,
  box,
  roundedBox,
  cylinder,
  sphere,
  mesh,
  signMesh,
} from "./gfx.js";

const productGeometries = {
  bottle: () => new THREE.CylinderGeometry(0.085, 0.095, 0.34, 10),
  box: () => new THREE.BoxGeometry(0.24, 0.34, 0.15),
  fruit: () => new THREE.SphereGeometry(0.11, 12, 10),
  carton: () => new THREE.BoxGeometry(0.15, 0.3, 0.15),
  cup: () => new THREE.CylinderGeometry(0.08, 0.065, 0.15, 12),
  cake: () => new THREE.CylinderGeometry(0.13, 0.13, 0.14, 14),
  veg: () => new THREE.IcosahedronGeometry(0.12, 1),
  bag: () => new THREE.BoxGeometry(0.22, 0.3, 0.09),
  jug: () => new THREE.CylinderGeometry(0.09, 0.11, 0.32, 8),
  can: () => new THREE.CylinderGeometry(0.07, 0.07, 0.18, 12),
  tub: () => new THREE.CylinderGeometry(0.1, 0.09, 0.12, 14),
  loaf: () => new THREE.BoxGeometry(0.24, 0.16, 0.14),
  eggs: () => new THREE.BoxGeometry(0.24, 0.09, 0.13),
  jar: () => new THREE.CylinderGeometry(0.065, 0.07, 0.15, 12),
  bar: () => new THREE.BoxGeometry(0.18, 0.26, 0.05),
  // Cuña de queso: un tercio de cilindro.
  wedge: () =>
    new THREE.CylinderGeometry(0.13, 0.13, 0.1, 12, 1, false, 0, Math.PI / 1.5),
  pizza: () => new THREE.BoxGeometry(0.26, 0.05, 0.26),
};
const geoCache = {};
function productGeometry(shape) {
  geoCache[shape] ??= productGeometries[shape]();
  return geoCache[shape];
}
const productMaterial = new THREE.MeshStandardMaterial({ roughness: 0.4 });

// Tipos de expositor: dimensiones, niveles y qué productos aceptan.
export const DISPLAYS = {
  shelf: {
    w: 3,
    d: 0.8,
    h: 1.9,
    levels: [0.32, 0.86, 1.4],
    cols: 8,
    accepts: (p) => p.kind === "grocery" && !p.cold && !p.frozen && !p.fresh,
  },
  freezer: {
    w: 2.0,
    d: 0.9,
    h: 0.95,
    levels: [0.6],
    cols: 6,
    rows: 2,
    accepts: (p) => !!p.frozen,
  },
  produce: {
    w: 2.4,
    d: 1.1,
    h: 1.0,
    levels: [0.62, 0.9],
    levelZ: [0.22, -0.2],
    cols: 6,
    accepts: (p) => !!p.fresh,
  },
  fridge: {
    w: 2.2,
    d: 0.9,
    h: 2.1,
    levels: [0.45, 1.05, 1.6],
    cols: 6,
    accepts: (p) => !!p.cold,
  },
  vitrina: {
    w: 1.8,
    d: 0.8,
    h: 1.1,
    levels: [0.42, 0.78],
    cols: 6,
    accepts: (p) => p.kind === "cafe" && !p.ingredient && !p.crafted,
  },
  coffee: {
    w: 1.3,
    d: 0.6,
    h: 1.0,
    levels: [1.02],
    cols: 6,
    rows: 2,
    accepts: (p) => p.crafted,
  },
};

export class ProductDisplay {
  constructor(kind, color = 0xe9a54a) {
    this.kind = kind;
    this.spec = DISPLAYS[kind];
    const { w, d, h, levels, cols, rows = 1 } = this.spec;
    this.capacity = levels.length * cols * rows;
    this.group = new THREE.Group();
    this.product = null;
    this.stock = 0;
    this.slots = [];
    levels.forEach((y, li) => {
      for (let r = 0; r < rows; r++) {
        for (let i = 0; i < cols; i++) {
          const x = -w / 2 + 0.22 + (i * (w - 0.44)) / (cols - 1);
          const z =
            this.spec.levelZ?.[li] ?? (rows > 1 ? (r - 0.5) * 0.24 : 0.04);
          this.slots.push(new THREE.Vector3(x, y, z));
        }
      }
    });
    if (kind === "shelf") this.buildShelf(w, d, h, levels, color);
    else if (kind === "fridge") this.buildFridge(w, d, h, levels);
    else if (kind === "freezer") this.buildFreezer(w, d, h);
    else if (kind === "produce") this.buildProduce(w, d);
    else if (kind === "vitrina") this.buildVitrina(w, d, h, levels);
    else this.buildCounterTray(w, d);
    this.instances = null;
    this.labelSprite = null;
  }

  buildFreezer(w, d, h) {
    const body = mat(0xf2f7fa, { roughness: 0.3 });
    this.group.add(
      mesh(roundedBox(w, h - 0.1, d, 0.08), body, 0, (h - 0.1) / 2, 0),
    );
    this.group.add(
      mesh(box(w - 0.16, 0.05, d - 0.16), mat(0xcfe8f5), 0, h - 0.13, 0, false),
    );
    const lid = mesh(
      roundedBox(w, 0.06, d, 0.03),
      new THREE.MeshStandardMaterial({
        color: 0xdff6ff,
        transparent: true,
        opacity: 0.3,
        roughness: 0.05,
      }),
      0,
      h + 0.05,
      0,
      false,
    );
    this.group.add(lid);
    this.group.add(
      mesh(
        box(w - 0.1, 0.12, 0.02),
        mat(0x4fb4e8),
        0,
        0.35,
        d / 2 + 0.01,
        false,
      ),
    );
    const sign = signMesh("CONGELADOS", 1.2, 0.26, {
      bg: "#4fb4e8",
      fg: "#ffffff",
    });
    sign.position.set(0, 0.62, d / 2 + 0.02);
    this.group.add(sign);
  }

  // Puesto de frutas y verduras: cajones inclinados en dos alturas.
  buildProduce(w, d) {
    const wood = mat(0xb98551);
    this.group.add(mesh(roundedBox(w, 0.5, d, 0.05), wood, 0, 0.25, 0));
    this.group.add(mesh(roundedBox(w, 0.3, 0.5, 0.04), wood, 0, 0.66, -0.2));
    for (let i = 0; i < 3; i++) {
      this.group.add(
        mesh(
          box(w / 3 - 0.06, 0.1, 0.42),
          mat(0xd9a066),
          -w / 3 + (i * w) / 3,
          0.55,
          0.22,
          false,
        ),
      );
      this.group.add(
        mesh(
          box(w / 3 - 0.06, 0.1, 0.42),
          mat(0xd9a066),
          -w / 3 + (i * w) / 3,
          0.83,
          -0.2,
          false,
        ),
      );
    }
    const sign = signMesh("FRUTAS Y VERDURAS", 1.8, 0.32, {
      bg: "#3fbf5f",
      fg: "#ffffff",
    });
    sign.position.set(0, 1.35, -0.4);
    this.group.add(
      sign,
      mesh(box(0.06, 0.8, 0.06), mat(0x8b5a3c), 0, 1.0, -0.42),
    );
  }

  // Etiqueta de precio frente al expositor.
  setPriceTag(text) {
    if (text === this.tagText) return;
    this.tagText = text;
    if (!text) {
      if (this.tag) this.tag.visible = false;
      return;
    }
    const canvas = this.tagCanvas ?? document.createElement("canvas");
    this.tagCanvas = canvas;
    canvas.width = 128;
    canvas.height = 48;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff6c2";
    ctx.fillRect(0, 0, 128, 48);
    ctx.fillStyle = "#e63946";
    ctx.fillRect(0, 0, 10, 48);
    ctx.fillStyle = "#1d2b44";
    ctx.font = 'bold 30px "Baloo 2", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 68, 26);
    if (!this.tag) {
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.tag = new THREE.Mesh(
        new THREE.PlaneGeometry(0.36, 0.135),
        new THREE.MeshBasicMaterial({ map: tex }),
      );
      const y =
        this.kind === "freezer"
          ? 0.45
          : this.kind === "produce"
            ? 0.44
            : this.spec.levels[0] - 0.08;
      this.tag.position.set(this.spec.w / 2 - 0.35, y, this.spec.d / 2 + 0.025);
      this.group.add(this.tag);
    } else this.tag.material.map.needsUpdate = true;
    this.tag.visible = true;
  }

  buildShelf(w, d, h, levels, color) {
    const wood = mat(color);
    this.group.add(
      mesh(roundedBox(w, h, 0.12, 0.04), wood, 0, h / 2, -d / 2 + 0.06),
    );
    for (const s of [-1, 1])
      this.group.add(
        mesh(roundedBox(0.12, h, d, 0.04), wood, s * (w / 2 - 0.06), h / 2, 0),
      );
    this.group.add(mesh(roundedBox(w, 0.22, d, 0.04), wood, 0, 0.11, 0));
    for (const y of levels.slice(1))
      this.group.add(
        mesh(box(w - 0.2, 0.06, d - 0.1), mat(0xf6d7a0), 0, y - 0.03, 0),
      );
    this.group.add(mesh(roundedBox(w, 0.1, d, 0.04), wood, 0, h, 0));
    const strip = mesh(
      box(w - 0.2, 0.08, 0.02),
      mat(0xffffff),
      0,
      levels[0] - 0.08,
      d / 2,
    );
    this.group.add(strip);
  }

  buildFridge(w, d, h) {
    const body = mat(0xe8f1f5, { roughness: 0.3 });
    this.group.add(
      mesh(roundedBox(w, h, 0.12, 0.05), body, 0, h / 2, -d / 2 + 0.06),
    );
    for (const s of [-1, 1])
      this.group.add(
        mesh(roundedBox(0.12, h, d, 0.04), body, s * (w / 2 - 0.06), h / 2, 0),
      );
    this.group.add(mesh(roundedBox(w, 0.3, d, 0.05), body, 0, 0.15, 0));
    this.group.add(
      mesh(roundedBox(w, 0.25, d, 0.05), mat(0x4fb4e8), 0, h - 0.12, 0),
    );
    for (const y of [1.0, 1.55])
      this.group.add(
        mesh(box(w - 0.2, 0.04, d - 0.1), mat(0xcfe8f5), 0, y - 0.03, 0),
      );
    const glass = mesh(
      box(w - 0.2, h - 0.6, 0.04),
      new THREE.MeshStandardMaterial({
        color: 0xcff3ff,
        transparent: true,
        opacity: 0.25,
        roughness: 0.05,
      }),
      0,
      h / 2,
      d / 2 - 0.02,
      false,
    );
    this.group.add(glass);
    const glow = new THREE.Mesh(
      box(w - 0.3, 0.04, 0.04),
      new THREE.MeshBasicMaterial({ color: 0xe9fbff }),
    );
    glow.position.set(0, h - 0.32, 0.2);
    this.group.add(glow);
  }

  buildVitrina(w, d, h) {
    this.group.add(
      mesh(roundedBox(w, 0.35, d, 0.05), mat(0xf7a8c4), 0, 0.175, 0),
    );
    this.group.add(
      mesh(box(w - 0.1, 0.05, d - 0.1), mat(0xffffff), 0, 0.37, 0),
    );
    this.group.add(
      mesh(box(w - 0.1, 0.04, d - 0.1), mat(0xffffff), 0, 0.74, 0),
    );
    const glass = mesh(
      roundedBox(w, h - 0.35, d, 0.05),
      new THREE.MeshStandardMaterial({
        color: 0xe5f7ff,
        transparent: true,
        opacity: 0.22,
        roughness: 0.05,
      }),
      0,
      0.35 + (h - 0.35) / 2,
      0,
      false,
    );
    this.group.add(glass);
  }

  buildCounterTray(w, d) {
    this.group.add(
      mesh(roundedBox(w, 0.04, d, 0.02), mat(0x8b5a3c), 0, 0.98, 0),
    );
  }

  setProduct(id) {
    if (id === this.product && this.instances) return;
    this.product = id;
    if (this.instances) {
      this.group.remove(this.instances);
      this.instances.dispose();
      this.instances = null;
    }
    if (!id) return;
    const p = PRODUCTS[id];
    const inst = new THREE.InstancedMesh(
      productGeometry(p.shape),
      productMaterial,
      this.capacity,
    );
    inst.castShadow = true;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const params = productGeometry(p.shape).parameters;
    const height = params.height ?? params.radius * 2;
    this.slots.forEach((s, i) => {
      m.makeTranslation(s.x, s.y + height / 2, s.z);
      inst.setMatrixAt(i, m);
      c.setHex(p.color).offsetHSL(0, 0, (i % 3) * 0.03 - 0.03);
      inst.setColorAt(i, c);
    });
    this.instances = inst;
    this.group.add(inst);
    this.refresh();
  }

  setStock(n) {
    this.stock = Math.max(0, Math.min(this.capacity, n));
    if (this.stock === 0 && this.kind !== "coffee") this.setProduct(null);
    this.refresh();
  }

  refresh() {
    if (this.instances) this.instances.count = this.stock;
  }

  accepts(id) {
    const p = PRODUCTS[id];
    if (!p || !this.spec.accepts(p)) return false;
    return !this.product || this.product === id || this.stock === 0;
  }
}

export function registerCounter() {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(1.0, 1.0, 2.2, 0.08), mat(0x52c9c4), 0, 0.5, 0));
  g.add(mesh(roundedBox(1.1, 0.08, 2.3, 0.04), mat(0x3aa7a3), 0, 1.02, 0));
  g.add(mesh(roundedBox(0.4, 0.3, 0.5, 0.04), mat(0x5a6773), 0.1, 1.2, 0.3));
  const screen = mesh(
    roundedBox(0.08, 0.38, 0.5, 0.03),
    mat(0x5a6773),
    0.25,
    1.55,
    0.3,
  );
  g.add(screen);
  g.add(
    mesh(
      box(0.02, 0.3, 0.42),
      new THREE.MeshBasicMaterial({ color: 0x9be8ff }),
      0.2,
      1.55,
      0.3,
      false,
    ),
  );
  g.add(mesh(roundedBox(0.2, 0.1, 0.3, 0.02), mat(0x2f3940), 0.0, 1.11, -0.4));
  return g;
}

export function cardboardBox(color = 0xd9a066, label) {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(0.6, 0.42, 0.45, 0.04), mat(color), 0, 0.21, 0));
  g.add(mesh(box(0.08, 0.425, 0.455), mat(0xc58b52), 0, 0.21, 0, false));
  if (label !== undefined)
    g.add(
      mesh(roundedBox(0.3, 0.14, 0.02, 0.01), mat(label), 0, 0.24, 0.23, false),
    );
  return g;
}

// Zona de almacén: palé con pila de cajas que refleja las existencias.
export class StoragePile {
  constructor(maxVisible = 12) {
    this.group = new THREE.Group();
    this.group.add(mesh(box(2.0, 0.14, 1.4), mat(0xb98551), 0, 0.07, 0));
    this.boxes = [];
    for (let i = 0; i < maxVisible; i++) {
      const b = cardboardBox();
      const col = i % 3;
      const row = Math.floor(i / 3) % 2;
      const layer = Math.floor(i / 6);
      b.position.set(
        -0.62 + col * 0.62,
        0.14 + layer * 0.43,
        -0.25 + row * 0.5,
      );
      b.visible = false;
      this.group.add(b);
      this.boxes.push(b);
    }
    const sign = signMesh("ALMACÉN", 1.4, 0.35, {
      bg: "#ffd166",
      fg: "#7a4b12",
    });
    sign.position.set(0, 1.25, -0.72);
    this.group.add(sign);
  }

  setCount(n) {
    this.boxes.forEach((b, i) => (b.visible = i < n));
  }
}

export function coffeeMachine() {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(0.8, 0.75, 0.55, 0.08), mat(0x6b5146), 0, 1.4, 0));
  g.add(mesh(roundedBox(0.7, 0.12, 0.5, 0.04), mat(0x3d2b24), 0, 1.07, 0));
  g.add(
    mesh(
      cylinder(0.14, 0.14, 0.4, 14),
      new THREE.MeshStandardMaterial({
        color: 0x6b3f22,
        transparent: true,
        opacity: 0.8,
      }),
      -0.2,
      1.98,
      0,
    ),
  );
  g.add(mesh(cylinder(0.05, 0.05, 0.14, 8), mat(0x999999), 0.1, 1.08, 0.18));
  g.add(
    mesh(
      sphere(0.05),
      new THREE.MeshBasicMaterial({ color: 0x6dff8a }),
      0.25,
      1.55,
      0.28,
      false,
    ),
  );
  return g;
}

export function counter(w, d, color = 0x8b5a3c, top = 0xf2d2a9) {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(w, 0.95, d, 0.06), mat(color), 0, 0.475, 0));
  g.add(mesh(roundedBox(w + 0.08, 0.07, d + 0.08, 0.03), mat(top), 0, 0.98, 0));
  return g;
}

export function pottedPlant(scale = 1) {
  const g = new THREE.Group();
  g.add(mesh(cylinder(0.25, 0.2, 0.4, 14), mat(0xd9824b), 0, 0.2, 0));
  const leaf = mat(0x48b860);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const l = mesh(
      sphere(0.18, 10),
      leaf,
      Math.cos(a) * 0.14,
      0.55 + (i % 2) * 0.12,
      Math.sin(a) * 0.14,
    );
    l.scale.set(0.8, 1.6, 0.8);
    l.rotation.z = Math.cos(a) * 0.4;
    l.rotation.x = Math.sin(a) * 0.4;
    g.add(l);
  }
  g.scale.setScalar(scale);
  return g;
}

export function tableSet() {
  const g = new THREE.Group();
  g.add(mesh(cylinder(0.55, 0.55, 0.06, 20), mat(0xffffff), 0, 0.76, 0));
  g.add(mesh(cylinder(0.06, 0.08, 0.74, 8), mat(0x8b5a3c), 0, 0.37, 0));
  for (const s of [-1, 1]) {
    g.add(
      mesh(
        roundedBox(0.45, 0.08, 0.45, 0.03),
        mat(0xff9f43),
        s * 0.85,
        0.46,
        0,
      ),
    );
    g.add(
      mesh(roundedBox(0.08, 0.5, 0.45, 0.03), mat(0xff9f43), s * 1.05, 0.72, 0),
    );
    g.add(
      mesh(cylinder(0.04, 0.04, 0.42, 6), mat(0x8b5a3c), s * 0.85, 0.21, 0),
    );
  }
  g.add(mesh(cylinder(0.06, 0.05, 0.1, 10), mat(0xffffff), 0.15, 0.84, 0.1));
  return g;
}

export function flowerBed(w, d) {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(w, 0.4, d, 0.06), mat(0xa86b3c), 0, 0.2, 0));
  g.add(mesh(box(w - 0.15, 0.05, d - 0.15), mat(0x6b4226), 0, 0.41, 0, false));
  const colors = [0xff5d8f, 0xffd23f, 0x9b5de5, 0xff8c42, 0xf15bb5, 0xffffff];
  const n = Math.round(w * d * 4);
  for (let i = 0; i < n; i++) {
    const x = (Math.random() - 0.5) * (w - 0.3);
    const z = (Math.random() - 0.5) * (d - 0.3);
    g.add(mesh(sphere(0.07, 8), mat(0x3f9e4d), x, 0.48, z, false));
    g.add(
      mesh(sphere(0.08, 8), mat(colors[i % colors.length]), x, 0.58, z, false),
    );
  }
  return g;
}

export function bed(color = 0x6ec6ff) {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(1.6, 0.4, 2.3, 0.08), mat(0x8b5a3c), 0, 0.2, 0));
  g.add(mesh(roundedBox(1.5, 0.25, 2.1, 0.1), mat(0xffffff), 0, 0.5, 0.05));
  g.add(mesh(roundedBox(1.52, 0.2, 1.3, 0.1), mat(color), 0, 0.6, 0.4));
  g.add(
    mesh(roundedBox(0.6, 0.18, 0.4, 0.08), mat(0xfff4e0), -0.35, 0.68, -0.75),
  );
  g.add(
    mesh(roundedBox(0.6, 0.18, 0.4, 0.08), mat(0xfff4e0), 0.35, 0.68, -0.75),
  );
  g.add(mesh(roundedBox(1.6, 1.0, 0.12, 0.05), mat(0x8b5a3c), 0, 0.5, -1.15));
  return g;
}

export function sofa(color = 0xff9f43) {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(2.0, 0.45, 0.9, 0.12), mat(color), 0, 0.3, 0));
  g.add(mesh(roundedBox(2.0, 0.7, 0.25, 0.1), mat(color), 0, 0.65, -0.35));
  for (const s of [-1, 1])
    g.add(mesh(roundedBox(0.25, 0.55, 0.9, 0.1), mat(color), s * 1.0, 0.5, 0));
  return g;
}

export function rack(colors) {
  const g = new THREE.Group();
  g.add(mesh(box(3.6, 0.08, 1.0), mat(0x4a76c9), 0, 1.2, 0));
  g.add(mesh(box(3.6, 0.08, 1.0), mat(0x4a76c9), 0, 2.3, 0));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      g.add(
        mesh(box(0.08, 2.6, 0.08), mat(0x31518f), sx * 1.75, 1.3, sz * 0.46),
      );
  for (let i = 0; i < 10; i++) {
    const b = cardboardBox(0xd9a066, colors[i % colors.length]);
    b.position.set(-1.3 + (i % 5) * 0.65, i < 5 ? 0.0 : 1.24, 0);
    g.add(b);
    if (i % 2 === 0) {
      const top = cardboardBox(0xcf9558, colors[(i + 2) % colors.length]);
      top.position.set(-1.3 + (i % 5) * 0.65, i < 5 ? 0.43 : 2.34, 0);
      g.add(top);
    }
  }
  return g;
}

export function clothesRack(colors) {
  const g = new THREE.Group();
  g.add(mesh(cylinder(0.03, 0.03, 2.0, 8), mat(0xc0c0c0), 0, 1.6, 0));
  g.children[0].rotation.z = Math.PI / 2;
  for (const s of [-1, 1])
    g.add(mesh(cylinder(0.03, 0.03, 1.6, 8), mat(0xc0c0c0), s * 1.0, 0.8, 0));
  colors.forEach((c, i) => {
    const shirt = mesh(
      roundedBox(0.12, 0.7, 0.5, 0.05),
      mat(c),
      -0.8 + i * 0.32,
      1.2,
      0,
    );
    g.add(shirt);
  });
  return g;
}

export function mannequin(color, hat) {
  const g = new THREE.Group();
  g.add(mesh(cylinder(0.3, 0.3, 0.1, 16), mat(0xffffff), 0, 0.05, 0));
  g.add(mesh(cylinder(0.03, 0.03, 0.5, 6), mat(0xaaaaaa), 0, 0.35, 0));
  const torso = mesh(sphere(0.32, 16), mat(color), 0, 0.9, 0);
  torso.scale.set(1, 1.2, 0.85);
  g.add(torso);
  g.add(mesh(sphere(0.3, 16), mat(0xf7f3ee), 0, 1.5, 0));
  if (hat) g.add(mesh(cylinder(0.2, 0.22, 0.2, 12), mat(hat), 0, 1.8, 0));
  return g;
}
