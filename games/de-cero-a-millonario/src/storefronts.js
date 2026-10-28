// Fachadas según el rubro: cada edificio usa la misma base (Building) pero
// añade piezas propias de su negocio en la acera, la fachada y la azotea.
// Las piezas de cada edificio se funden en pocas mallas (colores por
// vértice) y solo las que estorban al paso llevan colisión. Lo que va en la
// azotea se añade a building.roof, que se oculta al entrar.
import * as THREE from "three";
import {
  box,
  cylinder,
  sphere,
  mergeParts,
  signMesh,
  stripedTexture,
} from "./gfx.js";

// Geometría girada (copia: las de gfx.js están en caché y se comparten).
function turned(g, rx = 0, rz = 0) {
  const c = g.clone();
  if (rx) c.rotateX(rx);
  if (rz) c.rotateZ(rz);
  return c;
}

// Acumula piezas en coordenadas del edificio y las funde en una malla.
class Parts {
  constructor(bld) {
    this.bld = bld;
    this.list = [];
  }

  add(g, x, y, z, color, ry = 0) {
    this.list.push([g, x, y, z, ry, color]);
    return this;
  }

  build(parent, opts = {}) {
    if (!this.list.length) return null;
    const m = new THREE.Mesh(
      mergeParts(this.list),
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.6,
        ...opts,
      }),
    );
    m.castShadow = true;
    m.receiveShadow = true;
    this.bld.place(m, 0, 0, 0, 0);
    parent.add(m);
    return m;
  }
}

// Piezas que brillan de noche (se encienden con las ventanas).
function glow(bld, parent, list, color) {
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0,
    roughness: 0.4,
  });
  bld.windowMats.push(material);
  const m = new THREE.Mesh(mergeParts(list), material);
  bld.place(m, 0, 0, 0, 0);
  parent.add(m);
  return m;
}

// Cartel plano (con fondo) en coordenadas del edificio.
function board(bld, parent, text, w, h, colors, lx, y, lz, rotY = 0) {
  const s = signMesh(text, w, h, colors);
  bld.place(s, lx, lz, rotY, y);
  parent.add(s);
  return s;
}

const WOOD = 0xa8703f;
const WOOD_DARK = 0x6b4426;
const STEEL = 0x9aa3ad;
const FRUIT = [0xe74c3c, 0xff9f1c, 0x7bd34a, 0xffd23f, 0xb03a8c];

// Caja de fruta abierta con piezas encima.
function crate(p, x, y, z, k) {
  p.add(box(0.62, 0.24, 0.5), x, y + 0.12, z, WOOD);
  for (let i = 0; i < 6; i++)
    p.add(
      sphere(0.1, 6),
      x - 0.2 + (i % 3) * 0.2,
      y + 0.3,
      z - 0.1 + Math.floor(i / 3) * 0.2,
      FRUIT[k % FRUIT.length],
    );
}

// Pizarra de pie (caballete) con un mensaje.
function chalkboard(bld, p, text, lx, lz) {
  const y = 0.12;
  p.add(turned(box(0.62, 0.95, 0.05), -0.18), lx, y + 0.5, lz + 0.1, WOOD_DARK);
  p.add(turned(box(0.62, 0.95, 0.05), 0.18), lx, y + 0.5, lz - 0.1, WOOD_DARK);
  const s = board(
    bld,
    bld.group,
    text,
    0.52,
    0.7,
    { bg: "#2f3b33", fg: "#ffffff", font: "bold 64px" },
    lx,
    y + 0.55,
    lz + 0.135,
  );
  s.rotation.order = "YXZ";
  s.rotation.x = -0.18;
  bld.addLocalCollider(lx, lz, 0.7, 0.5);
}

// Tienda de barrio: máquina de refrescos roja junto a la esquina (el
// puesto de fruta, las jardineras y la pizarra ya están en la calle).
function barrio(bld) {
  const { w, d } = bld.opts;
  const p = new Parts(bld);
  const vx = w / 2 - 1.2;
  const vz = d / 2 + 0.4;
  p.add(box(0.85, 1.9, 0.62), vx, 1.07, vz, 0xe63946);
  p.add(box(0.6, 1.0, 0.04), vx - 0.05, 1.35, vz + 0.32, 0x9fd8ff);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      p.add(
        cylinder(0.06, 0.06, 0.2, 8),
        vx - 0.22 + j * 0.17,
        1.0 + i * 0.3,
        vz + 0.26,
        FRUIT[(i + j) % FRUIT.length],
      );
  p.add(box(0.12, 0.5, 0.05), vx + 0.3, 1.3, vz + 0.33, 0x2b2f38);
  p.add(box(0.5, 0.14, 0.05), vx - 0.05, 0.4, vz + 0.33, 0x2b2f38);
  p.build(bld.group);
  board(
    bld,
    bld.group,
    "REFRESCOS",
    0.8,
    0.22,
    { bg: "#ffffff", fg: "#e63946", font: "bold 80px" },
    vx,
    1.9,
    vz + 0.32,
  );
  bld.addLocalCollider(vx, vz, 0.9, 0.7);
}

// Cafetería: pilares de madera y taza gigante humeante en la azotea (la
// terraza y la pizarra ya están en la calle).
function cafe(bld) {
  const { w, d } = bld.opts;
  const p = new Parts(bld);
  for (const s of [-1, 1])
    p.add(box(0.4, 3.4, 0.22), s * (w / 2 - 0.2), 1.7, d / 2 + 0.1, WOOD_DARK);
  p.build(bld.group);
  // Taza gigante con plato, asa y vapor en la azotea.
  const r = new Parts(bld);
  const y = bld.roofTop;
  const cx = w / 4;
  r.add(cylinder(1.25, 1.25, 0.12, 24), cx, y + 0.06, 0, 0xffffff);
  r.add(cylinder(0.85, 0.65, 1.2, 24), cx, y + 0.72, 0, 0xffffff);
  r.add(cylinder(0.78, 0.78, 0.05, 24), cx, y + 1.3, 0, 0x5a3420);
  r.add(box(0.5, 0.16, 0.16), cx + 0.95, y + 0.95, 0, 0xffffff);
  r.add(box(0.16, 0.6, 0.16), cx + 1.15, y + 0.75, 0, 0xffffff);
  r.add(box(0.5, 0.16, 0.16), cx + 0.95, y + 0.48, 0, 0xffffff);
  r.add(box(1.72, 0.18, 0.05), cx, y + 0.9, 0.82, 0x8b5a3c);
  r.build(bld.roof);
  const steam = new THREE.Mesh(
    mergeParts([
      [sphere(0.22, 8), cx - 0.25, y + 1.65, 0],
      [sphere(0.18, 8), cx + 0.1, y + 1.95, 0.1],
      [sphere(0.14, 8), cx - 0.1, y + 2.25, -0.05],
    ]),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
    }),
  );
  bld.place(steam, 0, 0, 0, 0);
  bld.roof.add(steam);
}

// Sol dibujado para el cartel del minimercado.
function sunTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  ctx.translate(128, 128);
  ctx.fillStyle = "#ffb320";
  for (let i = 0; i < 12; i++) {
    ctx.rotate(Math.PI / 6);
    ctx.beginPath();
    ctx.moveTo(-14, -70);
    ctx.lineTo(0, -122);
    ctx.lineTo(14, -70);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 70, 0, Math.PI * 2);
  ctx.fillStyle = "#ffd23f";
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#f29f05";
  ctx.stroke();
  ctx.fillStyle = "#c46a00";
  ctx.font = "bold 38px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("SOL", 0, 14);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Minimercado: una sola planta, sol en la azotea, cartel «24 H» en
// bandera y nevera de hielo en la acera.
function minimarket(bld) {
  const { w, d, doorW, trimColor } = bld.opts;
  const p = new Parts(bld);
  // Franja de color bajo el cartel y pretil de la azotea.
  p.add(box(w + 0.1, 0.22, 0.08), 0, 2.85, d / 2 + 0.04, trimColor);
  // Nevera de hielo.
  const ix = doorW / 2 + 3.5;
  const iz = d / 2 + 0.5;
  p.add(box(1.5, 1.0, 0.7), ix, 0.62, iz, 0xffffff);
  p.add(box(1.52, 0.1, 0.72), ix, 1.12, iz, 0x3d8bff);
  p.add(box(1.3, 0.6, 0.02), ix, 0.66, iz + 0.36, 0xbfe8ff);
  // Expositor de periódicos.
  p.add(box(0.7, 0.9, 0.4), ix + 1.3, 0.57, iz, 0x3d8bff);
  for (let i = 0; i < 3; i++)
    p.add(
      box(0.55, 0.04, 0.32),
      ix + 1.3,
      0.75 + i * 0.12,
      iz + 0.05,
      0xf4f1e8,
    );
  chalkboard(bld, p, "PAN\nRECIÉN\nHECHO", -(w / 2 - 0.9), d / 2 + 0.5);
  p.build(bld.group);
  bld.addLocalCollider(ix + 0.6, iz, 2.4, 0.8);
  board(
    bld,
    bld.group,
    "HIELO",
    1.0,
    0.3,
    { bg: "#3d8bff", fg: "#ffffff", font: "bold 80px" },
    ix,
    0.9,
    iz + 0.38,
  );
  // Cartel en bandera «24 H» (dos caras) en la esquina.
  const bx = w / 2 - 0.5;
  for (const s of [-1, 1])
    board(
      bld,
      bld.group,
      "ABIERTO\n24 H",
      0.9,
      1.1,
      { bg: "#fffbe6", fg: "#d9822b", font: "bold 70px", border: "#f2a531" },
      bx + s * 0.06,
      2.75,
      d / 2 + 0.75,
      (s * Math.PI) / 2,
    );
  // Sol del logotipo en la azotea, iluminado de noche.
  const sunMat = new THREE.MeshStandardMaterial({
    map: sunTexture(),
    alphaTest: 0.5,
    emissive: 0xffffff,
    emissiveIntensity: 0,
    side: THREE.DoubleSide,
  });
  sunMat.emissiveMap = sunMat.map;
  bld.windowMats.push(sunMat);
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), sunMat);
  bld.place(sun, -w / 2 + 2, d / 2 - 1.2, 0, bld.roofTop + 1.35);
  bld.roof.add(sun);
  const top = new Parts(bld);
  top.add(
    box(0.1, 0.9, 0.1),
    -w / 2 + 2,
    bld.roofTop + 0.45,
    d / 2 - 1.25,
    0x3e4a59,
  );
  top.add(
    box(w + 0.5, 0.45, 0.15),
    0,
    bld.roofTop + 0.2,
    -d / 2 - 0.18,
    trimColor,
  );
  for (const s of [-1, 1])
    top.add(
      box(0.15, 0.45, d + 0.5),
      s * (w / 2 + 0.18),
      bld.roofTop + 0.2,
      0,
      trimColor,
    );
  top.build(bld.roof);
}

// Supermercado: una planta amplia, marquesina metálica, tótem con el
// nombre, carritos en la acera y placas solares en la azotea.
function supermarket(bld) {
  const { w, d, doorW, trimColor } = bld.opts;
  const p = new Parts(bld);
  // Marquesina sobre la entrada (voladiza, sin pilares).
  p.add(box(doorW + 2.4, 0.22, 1.9), 0, 3.0, d / 2 + 0.95, trimColor);
  // Tótem con el nombre en la esquina.
  const px = w / 2 - 0.6;
  const pz = d / 2 + 1.0;
  p.add(box(0.35, 4.6, 0.35), px, 2.42, pz, 0x3e4a59);
  p.add(box(1.4, 2.0, 0.3), px, 5.2, pz, trimColor);
  // Aparcamiento de carritos.
  const cx = -(w / 2) + 2.4;
  const cz = d / 2 + 0.75;
  for (const s of [-1, 1])
    p.add(box(2.6, 0.05, 0.05), cx, 0.95, cz + s * 0.45, STEEL);
  for (const s of [-1.3, 1.3])
    p.add(box(0.05, 0.85, 0.05), cx + s, 0.55, cz - 0.45, STEEL);
  for (let i = 0; i < 4; i++) {
    const x = cx - 0.9 + i * 0.6;
    p.add(box(0.5, 0.4, 0.7), x, 0.75, cz, 0xd5dde4);
    p.add(box(0.5, 0.05, 0.05), x, 1.02, cz + 0.4, 0xe74c3c);
    for (const sx of [-0.2, 0.2])
      for (const sz of [-0.28, 0.28])
        p.add(cylinder(0.05, 0.05, 0.04, 8), x + sx, 0.17, cz + sz, 0x2b2f38);
  }
  p.build(bld.group, { metalness: 0.25 });
  bld.addLocalCollider(px, pz, 0.5, 0.5);
  bld.addLocalCollider(cx, cz, 2.8, 1.1);
  // Tira de luz en el borde de la marquesina.
  glow(
    bld,
    bld.group,
    [[box(doorW + 2.4, 0.06, 0.06), 0, 2.88, d / 2 + 1.9]],
    0xfff3c4,
  );
  for (const s of [-1, 1])
    board(
      bld,
      bld.group,
      "SÚPER\n★ ★ ★",
      1.2,
      1.7,
      { bg: "#ffffff", fg: "#2c5fc4", font: "bold 90px" },
      px,
      5.2,
      pz + s * 0.16,
      s > 0 ? 0 : Math.PI,
    );
  // Placas solares inclinadas hacia la calle.
  const solar = new Parts(bld);
  const panel = turned(box(2.0, 0.06, 1.2), -0.35);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 2; j++)
      solar.add(
        panel,
        1.3 + i * 2.6,
        bld.roofTop + 0.4,
        -d / 2 + 3 + j * 2.4,
        0x23406e,
      );
  solar.build(bld.roof, { metalness: 0.5, roughness: 0.25 });
}

// Mayorista: nave industrial con tejado curvo de chapa, muelle de carga
// con persiana, palés y bolardos.
function warehouse(bld) {
  const { w, d, doorW } = bld.opts;
  const p = new Parts(bld);
  // Nervios de chapa en la fachada y en los laterales.
  for (let x = -w / 2 + 0.4; x < w / 2; x += 0.6)
    if (Math.abs(x) > doorW / 2 + 0.2)
      p.add(box(0.07, 3.3, 0.06), x, 1.65, d / 2 + 0.03, 0xb7c3cb);
  for (const s of [-1, 1])
    for (let z = -d / 2 + 0.4; z < d / 2; z += 0.6)
      p.add(box(0.06, 3.3, 0.07), s * (w / 2 + 0.03), 1.65, z, 0xb7c3cb);
  // Bolardos amarillos junto a la puerta.
  for (const s of [-1, 1]) {
    p.add(
      cylinder(0.14, 0.14, 0.9, 10),
      s * (doorW / 2 + 0.35),
      0.57,
      d / 2 + 0.45,
      0xffc22e,
    );
    p.add(
      cylinder(0.15, 0.15, 0.1, 10),
      s * (doorW / 2 + 0.35),
      0.75,
      d / 2 + 0.45,
      0x2b2f38,
    );
    bld.addLocalCollider(s * (doorW / 2 + 0.35), d / 2 + 0.45, 0.35, 0.35);
  }
  // Palés con cajas en la acera.
  const px = doorW / 2 + 4.1;
  const pz = d / 2 + 0.75;
  for (const dx of [-0.65, 0.65]) {
    p.add(box(1.2, 0.14, 1.0), px + dx, 0.19, pz, WOOD);
    const n = dx < 0 ? 3 : 2;
    for (let i = 0; i < n; i++)
      p.add(
        box(0.95, 0.42, 0.8),
        px + dx,
        0.47 + i * 0.43,
        pz,
        0xd9a066,
        i * 0.15,
      );
  }
  // Muelle de carga en el lateral: andén, persiana y franjas de aviso.
  const sx = w / 2;
  const sz = -d / 4;
  p.add(box(1.3, 0.9, 4.6), sx + 0.65, 0.45, sz, 0x9aa7b0);
  p.add(box(0.08, 2.8, 3.4), sx + 0.05, 2.3, sz, 0xaab4bc);
  for (let i = 0; i < 9; i++)
    p.add(box(0.1, 0.04, 3.4), sx + 0.08, 1.0 + i * 0.31, sz, 0x7b8790);
  for (let i = 0; i < 3; i++)
    p.add(
      box(1.0, 0.85, 0.9),
      sx + 0.6,
      1.33,
      sz - 1.4 + i * 1.3,
      0xd9a066,
      i * 0.2,
    );
  p.build(bld.group, { metalness: 0.15 });
  bld.addLocalCollider(px, pz, 2.6, 1.1);
  bld.addLocalCollider(sx + 0.65, sz, 1.3, 4.6);
  const hazard = stripedTexture("#ffc22e", "#1d2b44", 14);
  for (const [lx, lz, len, ry] of [
    [sx + 0.1, sz - 1.8, 3.0, Math.PI / 2],
    [sx + 0.1, sz + 1.8, 3.0, Math.PI / 2],
  ]) {
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(0.25, len),
      new THREE.MeshStandardMaterial({ map: hazard }),
    );
    bld.place(strip, lx, lz, ry, 2.3);
    bld.group.add(strip);
  }
  board(
    bld,
    bld.group,
    "CARGA Y DESCARGA",
    3.2,
    0.45,
    { bg: "#1d2b44", fg: "#ffc22e", font: "bold 56px" },
    sx + 0.12,
    4.0,
    sz,
    Math.PI / 2,
  );
  // Tejado curvo de chapa ondulada.
  if (bld.roofUnit) bld.roofUnit.visible = false;
  const r = d / 2 + 0.3;
  const vault = new THREE.CylinderGeometry(
    r,
    r,
    w + 0.4,
    28,
    1,
    true,
    0,
    Math.PI,
  );
  vault.rotateZ(Math.PI / 2);
  vault.scale(1, 0.32, 1);
  const tex = stripedTexture("#c3cdd4", "#9eabb4", 64);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const metal = new THREE.MeshStandardMaterial({
    map: tex,
    metalness: 0.35,
    roughness: 0.45,
    side: THREE.DoubleSide,
  });
  const roof = new THREE.Mesh(vault, metal);
  roof.castShadow = true;
  bld.place(roof, 0, 0, 0, bld.roofTop - 0.05);
  bld.roof.add(roof);
  bld.world.occluders.push(roof);
  for (const s of [-1, 1]) {
    const cap = new THREE.CircleGeometry(r, 28, 0, Math.PI);
    cap.rotateY(Math.PI / 2);
    cap.scale(1, 0.32, 1);
    const m = new THREE.Mesh(cap, mat2(0xd7e3ea));
    bld.place(m, s * (w / 2 + 0.2), 0, 0, bld.roofTop - 0.05);
    bld.roof.add(m);
    bld.world.occluders.push(m);
  }
}

function mat2(color) {
  return new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide });
}

// Boutique: arbustos podados en las esquinas y molduras doradas.
function boutique(bld) {
  const { w, d } = bld.opts;
  const p = new Parts(bld);
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - 0.5);
    p.add(cylinder(0.3, 0.24, 0.55, 14), x, 0.4, d / 2 + 0.45, 0xffffff);
    p.add(sphere(0.38, 12), x, 1.0, d / 2 + 0.45, 0x3fae5a);
    p.add(sphere(0.28, 12), x, 1.55, d / 2 + 0.45, 0x47bd63);
    p.add(sphere(0.18, 10), x, 1.95, d / 2 + 0.45, 0x52c96e);
    bld.addLocalCollider(x, d / 2 + 0.45, 0.6, 0.6);
  }
  p.build(bld.group);
  const gold = new Parts(bld);
  gold.add(box(w + 0.1, 0.12, 0.1), 0, 2.78, d / 2 + 0.05, 0xf2c230);
  gold.add(box(w + 0.1, 0.12, 0.1), 0, 0.82, d / 2 + 0.05, 0xf2c230);
  gold.build(bld.group, { metalness: 0.6, roughness: 0.3 });
}

// Restaurante: chimenea, farolillos junto a la puerta y carta en la acera.
function restaurant(bld) {
  const { w, d, doorW } = bld.opts;
  const p = new Parts(bld);
  for (const s of [-1, 1]) {
    p.add(
      box(0.08, 0.5, 0.25),
      s * (doorW / 2 + 0.5),
      2.3,
      d / 2 + 0.12,
      0x2b2f38,
    );
  }
  chalkboard(bld, p, "MENÚ\nDEL\nDÍA", doorW / 2 + 3.8, d / 2 + 0.5);
  p.build(bld.group);
  glow(
    bld,
    bld.group,
    [-1, 1].map((s) => [
      box(0.22, 0.3, 0.22),
      s * (doorW / 2 + 0.5),
      2.0,
      d / 2 + 0.3,
    ]),
    0xffb347,
  );
  const r = new Parts(bld);
  r.add(box(0.8, 2.2, 0.8), w / 4, bld.roofTop + 1.4, -d / 6, 0xa0522d);
  r.add(box(1.0, 0.2, 1.0), w / 4, bld.roofTop + 2.55, -d / 6, 0x6b3a1f);
  r.build(bld.roof);
}

// Tienda de ropa: banderines sobre el escaparate y una camiseta gigante.
function clothing(bld) {
  const { w, d, trimColor } = bld.opts;
  const p = new Parts(bld);
  const flag = turned(new THREE.ConeGeometry(0.2, 0.42, 3), Math.PI);
  const colors = [0xff5fa2, 0xffd23f, 0x3d8bff, 0x5bd47a, 0xffffff];
  // Solo sobre los escaparates: el centro lo ocupa el toldo.
  const free = (bld.opts.doorW + 3) / 2 + 0.3;
  for (const s of [-1, 1]) {
    const len = w / 2 - 0.3 - free;
    for (let i = 0; i * 0.55 < len; i++)
      p.add(
        flag,
        s * (free + 0.2 + i * 0.55),
        3.05,
        d / 2 + 0.25,
        colors[i % colors.length],
      );
    p.add(
      box(len + 0.2, 0.03, 0.03),
      s * (free + len / 2),
      3.25,
      d / 2 + 0.25,
      0xffffff,
    );
  }
  p.build(bld.group);
  const r = new Parts(bld);
  const y = bld.roofTop;
  const cx = -w / 4;
  r.add(box(1.7, 2.0, 0.25), cx, y + 1.3, 0, trimColor);
  r.add(turned(box(0.8, 0.55, 0.25), 0, 0.6), cx - 1.1, y + 2.0, 0, trimColor);
  r.add(turned(box(0.8, 0.55, 0.25), 0, -0.6), cx + 1.1, y + 2.0, 0, trimColor);
  r.add(box(0.6, 0.12, 0.27), cx, y + 2.25, 0, 0xffffff);
  r.add(box(0.12, 0.6, 0.12), cx, y + 0.3, 0, 0x3e4a59);
  r.build(bld.roof);
}

// Concesionario: neumático gigante en la azotea y banderas de meta.
function dealer(bld) {
  const { w, d } = bld.opts;
  const r = new Parts(bld);
  const y = bld.roofTop;
  const cx = w / 4;
  r.add(new THREE.TorusGeometry(1.3, 0.48, 12, 28), cx, y + 1.85, 0, 0x2b2f38);
  r.add(
    turned(cylinder(0.9, 0.9, 0.3, 24), Math.PI / 2),
    cx,
    y + 1.85,
    0,
    0xc9d2d9,
  );
  r.add(
    turned(cylinder(0.25, 0.25, 0.4, 12), Math.PI / 2),
    cx,
    y + 1.85,
    0,
    0x7b8790,
  );
  r.add(box(0.5, 0.4, 0.8), cx, y + 0.2, 0, 0x3e4a59);
  r.build(bld.roof, { roughness: 0.45 });
  const check = stripedTexture("#ffffff", "#1d2b44", 24);
  const band = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 0.4, 0.22),
    new THREE.MeshStandardMaterial({ map: check }),
  );
  bld.place(band, 0, d / 2 + 0.17, 0, 2.95);
  bld.group.add(band);
}

// Muebles: sillón gigante y lámpara de pie en la azotea.
function furniture(bld) {
  const { w, trimColor } = bld.opts;
  const r = new Parts(bld);
  const y = bld.roofTop;
  const cx = w / 4;
  r.add(box(2.2, 0.5, 1.3), cx, y + 0.55, 0, trimColor);
  r.add(box(2.2, 1.3, 0.35), cx, y + 1.2, -0.48, trimColor);
  for (const s of [-1, 1]) {
    r.add(box(0.35, 0.8, 1.3), cx + s * 1.1, y + 0.8, 0, 0xe0a25a);
    r.add(box(0.12, 0.3, 0.12), cx + s * 0.9, y + 0.15, 0.5, WOOD_DARK);
    r.add(box(0.12, 0.3, 0.12), cx + s * 0.9, y + 0.15, -0.5, WOOD_DARK);
  }
  r.add(box(1.6, 0.18, 0.9), cx, y + 0.88, 0.1, 0xfff1d6);
  const lx = -w / 4;
  r.add(cylinder(0.04, 0.04, 2.4, 8), lx, y + 1.2, 0, 0x3e4a59);
  r.add(cylinder(0.3, 0.3, 0.06, 12), lx, y + 0.03, 0, 0x3e4a59);
  r.build(bld.roof);
  glow(
    bld,
    bld.roof,
    [[cylinder(0.3, 0.55, 0.6, 16), lx, y + 2.6, 0]],
    0xfff1c4,
  );
}

// Tecnología: antena parabólica, mástil y franja de pantalla LED.
function tech(bld) {
  const { w, d } = bld.opts;
  const r = new Parts(bld);
  const y = bld.roofTop;
  const cx = w / 4;
  r.add(cylinder(0.08, 0.12, 1.2, 8), cx, y + 0.6, 0, 0x9aa3ad);
  r.add(turned(cylinder(1.1, 0.2, 0.35, 24), 0.9), cx, y + 1.5, 0.15, 0xeef4f8);
  r.add(turned(cylinder(0.03, 0.03, 1.0, 6), 0.9), cx, y + 1.75, 0.5, 0x3e4a59);
  r.add(cylinder(0.04, 0.04, 3.2, 6), -w / 4, y + 1.6, -d / 5, 0x9aa3ad);
  for (let i = 0; i < 3; i++)
    r.add(
      box(0.9 - i * 0.2, 0.04, 0.04),
      -w / 4,
      y + 2.2 + i * 0.4,
      -d / 5,
      0x9aa3ad,
    );
  r.build(bld.roof, { metalness: 0.4 });
  glow(bld, bld.roof, [[sphere(0.1, 8), -w / 4, y + 3.25, -d / 5]], 0xff3b3b);
  glow(
    bld,
    bld.group,
    [[box(w - 0.4, 0.2, 0.05), 0, 2.95, d / 2 + 0.17]],
    0x7ff3f3,
  );
}

// Gimnasio: mancuerna gigante en la azotea.
function gym(bld) {
  const { w } = bld.opts;
  const r = new Parts(bld);
  const y = bld.roofTop + 1.2;
  const cx = -w / 6;
  r.add(
    turned(cylinder(0.12, 0.12, 3.4, 12), 0, Math.PI / 2),
    cx,
    y,
    0,
    0x9aa3ad,
  );
  for (const s of [-1, 1]) {
    r.add(
      turned(cylinder(0.75, 0.75, 0.35, 20), 0, Math.PI / 2),
      cx + s * 1.2,
      y,
      0,
      0x2b2f38,
    );
    r.add(
      turned(cylinder(0.55, 0.55, 0.3, 20), 0, Math.PI / 2),
      cx + s * 1.5,
      y,
      0,
      0xff7a45,
    );
  }
  for (const s of [-1, 1])
    r.add(box(0.2, 1.0, 0.2), cx + s * 0.8, bld.roofTop + 0.5, 0, 0x3e4a59);
  r.build(bld.roof, { metalness: 0.3 });
}

// Galería de lujo: alfombra roja, cordones dorados y corona en la azotea.
function luxury(bld) {
  const { d, doorW } = bld.opts;
  const p = new Parts(bld);
  p.add(box(doorW + 0.4, 0.02, 2.0), 0, 0.13, d / 2 + 1.0, 0xc0392b);
  for (const s of [-1, 1]) {
    for (const z of [0.4, 1.9]) {
      p.add(
        cylinder(0.06, 0.06, 0.9, 10),
        s * (doorW / 2 + 0.4),
        0.57,
        d / 2 + z,
        0xf2c230,
      );
      p.add(sphere(0.09, 10), s * (doorW / 2 + 0.4), 1.05, d / 2 + z, 0xf2c230);
    }
    p.add(
      box(0.05, 0.05, 1.5),
      s * (doorW / 2 + 0.4),
      0.85,
      d / 2 + 1.15,
      0xa3162a,
    );
    bld.addLocalCollider(s * (doorW / 2 + 0.4), d / 2 + 1.15, 0.2, 1.7);
  }
  p.build(bld.group, { metalness: 0.4, roughness: 0.35 });
  const r = new Parts(bld);
  const y = bld.roofTop;
  r.add(cylinder(1.0, 1.0, 0.5, 20), 0, y + 0.6, -d / 6, 0xf2c230);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    r.add(
      new THREE.ConeGeometry(0.22, 0.6, 8),
      Math.cos(a) * 0.8,
      y + 1.15,
      -d / 6 + Math.sin(a) * 0.8,
      0xf2c230,
    );
    r.add(
      sphere(0.1, 8),
      Math.cos(a) * 0.8,
      y + 1.5,
      -d / 6 + Math.sin(a) * 0.8,
      0xe74c3c,
    );
  }
  r.add(box(0.3, 0.3, 0.3), 0, y + 0.2, -d / 6, 0x3e4a59);
  r.build(bld.roof, { metalness: 0.7, roughness: 0.25 });
}

export const STOREFRONTS = {
  barrio,
  cafe,
  minimarket,
  supermarket,
  warehouse,
  boutique,
  restaurant,
  clothing,
  dealer,
  furniture,
  tech,
  gym,
  luxury,
};

export function decorateStorefront(bld, style) {
  STOREFRONTS[style]?.(bld);
}
