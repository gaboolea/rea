// Decoración y mobiliario de ambiente para tiendas y el Mayorista. Son
// objetos estáticos (salvo el reloj, que marca la hora del juego).
import * as THREE from "three";
import {
  mat,
  box,
  roundedBox,
  cylinder,
  sphere,
  mesh,
  signMesh,
} from "./gfx.js";
import { cardboardBox } from "./props.js";

const metal = () => mat(0xb8c4cc, { metalness: 0.4, roughness: 0.4 });

export function shoppingCart(color = 0xff5a4e) {
  const g = new THREE.Group();
  const wire = metal();
  g.add(
    mesh(
      box(0.5, 0.36, 0.75),
      new THREE.MeshStandardMaterial({
        color: 0xcfd8dc,
        transparent: true,
        opacity: 0.55,
      }),
      0,
      0.62,
      0,
      false,
    ),
  );
  g.add(mesh(box(0.52, 0.03, 0.77), wire, 0, 0.44, 0, false));
  g.add(mesh(box(0.52, 0.03, 0.77), wire, 0, 0.8, 0, false));
  g.add(
    mesh(cylinder(0.025, 0.025, 0.55, 6), mat(color), 0, 0.95, -0.42, false),
  );
  g.children.at(-1).rotation.z = Math.PI / 2;
  for (const x of [-0.2, 0.2]) {
    for (const z of [-0.3, 0.3]) {
      g.add(mesh(sphere(0.05, 8), mat(0x2b2b33), x, 0.05, z, false));
      g.add(mesh(cylinder(0.015, 0.015, 0.4, 5), wire, x, 0.25, z, false));
    }
  }
  return g;
}

export function basketStack(n = 4) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    g.add(
      mesh(
        roundedBox(0.5, 0.2, 0.36, 0.04),
        mat(0xff5a4e),
        0,
        0.1 + i * 0.12,
        0,
        i === 0,
      ),
    );
    g.add(
      mesh(box(0.06, 0.02, 0.38), mat(0x2b2b33), 0, 0.22 + i * 0.12, 0, false),
    );
  }
  const sign = signMesh("CESTAS", 0.6, 0.18, { bg: "#ff5a4e", fg: "#ffffff" });
  sign.position.set(0, 0.85, 0.2);
  g.add(sign);
  return g;
}

// Reloj de pared: las agujas siguen la hora del juego.
export function wallClock() {
  const g = new THREE.Group();
  const face = mesh(
    cylinder(0.32, 0.32, 0.05, 28),
    mat(0xffffff),
    0,
    0,
    0,
    false,
  );
  face.rotation.x = Math.PI / 2;
  const rim = mesh(
    new THREE.TorusGeometry(0.32, 0.035, 8, 28),
    mat(0xff6fa8),
    0,
    0,
    0.02,
    false,
  );
  g.add(face, rim);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.add(
      mesh(
        box(0.03, 0.06, 0.02),
        mat(0x1d2b44),
        Math.sin(a) * 0.25,
        Math.cos(a) * 0.25,
        0.03,
        false,
      ),
    );
  }
  const hand = (len, w, color) => {
    const pivot = new THREE.Group();
    pivot.position.z = 0.04;
    pivot.add(mesh(box(w, len, 0.015), mat(color), 0, len / 2, 0, false));
    g.add(pivot);
    return pivot;
  };
  const hour = hand(0.15, 0.035, 0x1d2b44);
  const minute = hand(0.24, 0.022, 0x1d2b44);
  g.userData.setTime = (h) => {
    hour.rotation.z = -((h % 12) / 12) * Math.PI * 2;
    minute.rotation.z = -(h % 1) * Math.PI * 2;
  };
  return g;
}

export function poster(text, bg = "#ffd166", fg = "#c0392b", w = 1.2, h = 0.6) {
  const g = new THREE.Group();
  g.add(mesh(box(w + 0.08, h + 0.08, 0.04), mat(0xffffff), 0, 0, -0.02, false));
  const s = signMesh(text, w, h, { bg, fg, font: "bold 64px" });
  s.position.z = 0.005;
  g.add(s);
  return g;
}

export function pendantLamp(color = 0xffd166) {
  const g = new THREE.Group();
  g.add(mesh(cylinder(0.01, 0.01, 0.8, 4), mat(0x333333), 0, -0.4, 0, false));
  g.add(mesh(cylinder(0.1, 0.32, 0.25, 16, 1), mat(color), 0, -0.9, 0, false));
  const bulb = new THREE.MeshStandardMaterial({
    color: 0xfff6d8,
    emissive: 0xfff1c4,
    emissiveIntensity: 0.9,
  });
  g.add(mesh(sphere(0.1, 10), bulb, 0, -1.02, 0, false));
  return g;
}

export function candyJars() {
  const g = new THREE.Group();
  const colors = [0xff7eb6, 0xffd23f, 0x5bd47a];
  colors.forEach((c, i) => {
    g.add(
      mesh(
        cylinder(0.09, 0.09, 0.22, 12),
        new THREE.MeshStandardMaterial({
          color: 0xe5f7ff,
          transparent: true,
          opacity: 0.4,
        }),
        -0.22 + i * 0.22,
        0.11,
        0,
        false,
      ),
    );
    for (let k = 0; k < 4; k++)
      g.add(
        mesh(
          sphere(0.035, 6),
          mat(c),
          -0.22 + i * 0.22 + (k % 2) * 0.04 - 0.02,
          0.05 + Math.floor(k / 2) * 0.06,
          0,
          false,
        ),
      );
    g.add(
      mesh(
        cylinder(0.095, 0.095, 0.03, 12),
        mat(c),
        -0.22 + i * 0.22,
        0.235,
        0,
        false,
      ),
    );
  });
  return g;
}

export function doorMat(w = 2.4, d = 1.0) {
  const m = mesh(
    roundedBox(w, 0.02, d, 0.01),
    mat(0x3e8fd6),
    0,
    0.005,
    0,
    false,
  );
  const g = new THREE.Group();
  g.add(m);
  const s = signMesh("¡BIENVENIDOS!", w - 0.3, d - 0.4, {
    bg: "rgba(0,0,0,0)",
    fg: "#ffffff",
    font: "bold 56px",
  });
  s.rotation.x = -Math.PI / 2;
  s.position.y = 0.02;
  g.add(s);
  return g;
}

export function trashBin(color = 0x3fbf5f) {
  const g = new THREE.Group();
  g.add(mesh(cylinder(0.2, 0.17, 0.55, 12), mat(color), 0, 0.28, 0));
  g.add(mesh(cylinder(0.22, 0.22, 0.05, 12), mat(0x2e8a43), 0, 0.57, 0, false));
  return g;
}

export function pictureFrame(color) {
  const g = new THREE.Group();
  g.add(mesh(box(0.8, 0.6, 0.04), mat(0x8b5a3c), 0, 0, 0, false));
  g.add(mesh(box(0.66, 0.46, 0.02), mat(0xbfe9ff), 0, 0, 0.02, false));
  g.add(mesh(sphere(0.09, 10), mat(0xffd23f), 0.18, 0.1, 0.03, false));
  const hill = mesh(sphere(0.3, 12), mat(color), -0.1, -0.3, 0.03, false);
  hill.scale.set(1.2, 0.6, 0.1);
  g.add(hill);
  return g;
}

// Estantería industrial de varios niveles cargada de cajas y palés.
export function industrialRack(colors, w = 4, levels = 3) {
  const g = new THREE.Group();
  const orange = mat(0xff8a3d);
  const blue = mat(0x2f6fd6);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      g.add(
        mesh(
          box(0.1, levels * 1.25 + 0.3, 0.1),
          blue,
          sx * (w / 2 - 0.05),
          (levels * 1.25 + 0.3) / 2,
          sz * 0.5,
          false,
        ),
      );
  for (let l = 0; l < levels; l++) {
    const y = 0.15 + l * 1.25;
    g.add(mesh(box(w, 0.08, 1.1), orange, 0, y, 0, false));
    g.add(mesh(box(w - 0.3, 0.1, 0.9), mat(0xb98551), 0, y + 0.09, 0, false));
    const n = Math.floor(w / 0.65);
    for (let i = 0; i < n; i++) {
      const c = colors[(i + l) % colors.length];
      const b = cardboardBox(0xd9a066, c);
      b.position.set(-w / 2 + 0.45 + i * 0.65, y + 0.14, 0);
      g.add(b);
      if ((i + l) % 3 !== 0) {
        const t = cardboardBox(0xcf9558, colors[(i + l + 1) % colors.length]);
        t.position.set(-w / 2 + 0.45 + i * 0.65, y + 0.56, 0);
        g.add(t);
      }
    }
  }
  return g;
}

export function hangingSign(text, color, w = 2.6) {
  const g = new THREE.Group();
  for (const s of [-1, 1])
    g.add(
      mesh(
        cylinder(0.01, 0.01, 0.6, 4),
        mat(0x555555),
        s * (w / 2 - 0.2),
        0.3,
        0,
        false,
      ),
    );
  const sign = signMesh(text, w, 0.55, {
    bg: color,
    fg: "#ffffff",
    font: "bold 64px",
  });
  const back = signMesh(text, w, 0.55, {
    bg: color,
    fg: "#ffffff",
    font: "bold 64px",
  });
  back.rotation.y = Math.PI;
  g.add(mesh(box(w + 0.06, 0.6, 0.04), mat(0xffffff), 0, -0.05, 0, false));
  sign.position.set(0, -0.05, 0.025);
  back.position.set(0, -0.05, -0.025);
  g.add(sign, back);
  return g;
}

export function palletStack(colors, n = 6) {
  const g = new THREE.Group();
  g.add(mesh(box(1.3, 0.14, 1.1), mat(0xb98551), 0, 0.07, 0));
  for (let i = 0; i < n; i++) {
    const b = cardboardBox(0xd9a066, colors[i % colors.length]);
    b.position.set(
      -0.32 + (i % 2) * 0.64,
      0.14 + Math.floor(i / 4) * 0.43,
      -0.25 + (Math.floor(i / 2) % 2) * 0.5,
    );
    g.add(b);
  }
  return g;
}

export function handTruck() {
  const g = new THREE.Group();
  g.add(mesh(box(0.06, 1.2, 0.06), mat(0xff5a4e), -0.2, 0.65, -0.1, false));
  g.add(mesh(box(0.06, 1.2, 0.06), mat(0xff5a4e), 0.2, 0.65, -0.1, false));
  g.add(mesh(box(0.5, 0.04, 0.35), metal(), 0, 0.06, 0.1, false));
  for (const s of [-1, 1]) {
    const w = mesh(
      cylinder(0.12, 0.12, 0.06, 12),
      mat(0x2b2b33),
      s * 0.27,
      0.12,
      -0.12,
      false,
    );
    w.rotation.z = Math.PI / 2;
    g.add(w);
  }
  return g;
}

export function forklift() {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(1.2, 0.8, 1.8, 0.15), mat(0xffc93c), 0, 0.6, 0));
  g.add(
    mesh(roundedBox(1.0, 0.1, 1.0, 0.04), mat(0x2f3542), 0, 1.9, -0.2, false),
  );
  for (const s of [-1, 1])
    g.add(mesh(box(0.06, 1.5, 0.06), mat(0x2f3542), s * 0.45, 1.3, 0.2, false));
  for (const s of [-1, 1])
    g.add(mesh(box(0.08, 1.9, 0.08), mat(0x555555), s * 0.4, 1.0, 0.95, false));
  for (const s of [-1, 1])
    g.add(mesh(box(0.12, 0.05, 0.9), mat(0x555555), s * 0.3, 0.2, 1.4, false));
  for (const sx of [-1, 1]) {
    for (const sz of [-0.55, 0.6]) {
      const w = mesh(
        cylinder(0.26, 0.26, 0.2, 14),
        mat(0x2b2b33),
        sx * 0.6,
        0.26,
        sz,
        false,
      );
      w.rotation.z = Math.PI / 2;
      g.add(w);
    }
  }
  return g;
}

// Flecha pintada en el suelo (apunta a +z).
export function floorArrow(color = 0xffd23f) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.25, -0.5);
  shape.lineTo(0.25, -0.5);
  shape.lineTo(0.25, 0.05);
  shape.lineTo(0.5, 0.05);
  shape.lineTo(0, 0.6);
  shape.lineTo(-0.5, 0.05);
  shape.lineTo(-0.25, 0.05);
  shape.closePath();
  const m = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.015;
  m.receiveShadow = true;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

export function floorZone(w, d, color) {
  const g = new THREE.Group();
  const m = mat(color);
  for (const [x, z, bw, bd] of [
    [0, -d / 2, w, 0.12],
    [0, d / 2, w, 0.12],
    [-w / 2, 0, 0.12, d],
    [w / 2, 0, 0.12, d],
  ])
    g.add(mesh(box(bw, 0.01, bd), m, x, 0.012, z, false));
  return g;
}

export function terminal() {
  const g = new THREE.Group();
  g.add(mesh(cylinder(0.05, 0.08, 1.0, 8), mat(0x3e4a59), 0, 0.5, 0));
  g.add(mesh(roundedBox(0.5, 0.36, 0.08, 0.03), mat(0x2f3542), 0, 1.1, 0.04));
  g.add(
    mesh(
      box(0.42, 0.28, 0.02),
      new THREE.MeshBasicMaterial({ color: 0x7fe0ff }),
      0,
      1.1,
      0.085,
      false,
    ),
  );
  return g;
}

// Carro de carga del Mayorista: plataforma con rejilla y asa. Mira hacia +z
// (el asa queda en -z, donde empuja el personaje).
export function cargoCart(color = 0x3fbf5f) {
  const g = new THREE.Group();
  const frame = metal();
  const grid = new THREE.MeshStandardMaterial({
    color: 0xdfe6ea,
    transparent: true,
    opacity: 0.35,
    metalness: 0.3,
  });
  g.add(mesh(roundedBox(0.86, 0.08, 1.12, 0.03), mat(color), 0, 0.26, 0));
  for (const s of [-1, 1]) {
    g.add(mesh(box(0.02, 0.42, 1.1), grid, s * 0.42, 0.52, 0, false));
    const rail = mesh(cylinder(0.02, 0.02, 1.12, 6), frame, s * 0.42, 0.74, 0);
    rail.rotation.x = Math.PI / 2;
    g.add(rail);
  }
  g.add(mesh(box(0.86, 0.42, 0.02), grid, 0, 0.52, 0.55, false));
  for (const s of [-1, 1])
    g.add(mesh(cylinder(0.022, 0.022, 0.8, 6), frame, s * 0.36, 0.66, -0.56));
  const bar = mesh(cylinder(0.035, 0.035, 0.8, 8), mat(color), 0, 1.04, -0.56);
  bar.rotation.z = Math.PI / 2;
  g.add(bar);
  for (const x of [-0.34, 0.34])
    for (const z of [-0.44, 0.44])
      g.add(mesh(sphere(0.09, 10), mat(0x2b2b33), x, 0.09, z, false));
  return g;
}

// Hilera de carros aparcados (punto para tomar un carro).
export function cartCorral(n = 3) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const c = cargoCart([0x3fbf5f, 0xff8a3d, 0x3d8bff][i % 3]);
    c.position.set(i * 0.95, 0, 0);
    g.add(c);
  }
  const sign = signMesh("🛒 CARROS · LLEVA HASTA 10 CAJAS", 2.8, 0.42, {
    bg: "#ff8a3d",
    fg: "#ffffff",
    font: "bold 46px",
  });
  sign.position.set((n - 1) * 0.475, 1.75, 0);
  const back = sign.clone();
  back.rotation.y = Math.PI;
  back.position.z = -0.01;
  g.add(sign, back);
  for (const x of [-0.4, (n - 1) * 0.95 + 0.4])
    g.add(mesh(cylinder(0.04, 0.04, 1.75, 8), metal(), x, 0.87, 0));
  return g;
}

// Mostrador de caja grande, con frontal de color y franja luminosa.
export function checkoutDesk(w = 6, color = 0x3fbf5f) {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(w, 1.0, 1.1, 0.08), mat(0xfff6e0), 0, 0.5, 0));
  g.add(mesh(roundedBox(w + 0.1, 0.08, 1.2, 0.03), mat(color), 0, 1.04, 0));
  const glow = mesh(
    box(w - 0.4, 0.12, 0.02),
    new THREE.MeshStandardMaterial({
      color: 0xfff1a8,
      emissive: 0xffd23f,
      emissiveIntensity: 0.9,
    }),
    0,
    0.7,
    0.56,
    false,
  );
  g.add(glow);
  const front = signMesh("CAJA · PEDIDOS", Math.min(3.4, w - 1), 0.42, {
    bg: "#ffffff",
    fg: "#2e8a43",
    font: "bold 60px",
  });
  front.position.set(0, 0.38, 0.56);
  g.add(front);
  return g;
}

// Pórtico con un cartel grande sobre la caja, visible desde la entrada.
export function archSign(text, color, w = 7, h = 3.3) {
  const g = new THREE.Group();
  const post = mat(color);
  for (const s of [-1, 1])
    g.add(mesh(roundedBox(0.22, h, 0.22, 0.06), post, s * (w / 2), h / 2, 0));
  g.add(mesh(roundedBox(w + 0.3, 0.9, 0.2, 0.08), post, 0, h - 0.1, 0));
  const front = signMesh(text, w - 0.2, 0.74, {
    bg: "#ffffff",
    fg: "#1f6f35",
    font: "bold 72px",
  });
  front.position.set(0, h - 0.1, 0.11);
  const back = front.clone();
  back.rotation.y = Math.PI;
  back.position.z = -0.11;
  g.add(front, back);
  // Bombillas a lo largo del cartel.
  const bulb = new THREE.MeshStandardMaterial({
    color: 0xfff6c0,
    emissive: 0xffd23f,
    emissiveIntensity: 1.2,
  });
  for (let i = 0; i <= 10; i++)
    for (const z of [0.12, -0.12])
      g.add(
        mesh(sphere(0.05, 8), bulb, -w / 2 + (w * i) / 10, h + 0.38, z, false),
      );
  return g;
}

// Cartel informativo de varias líneas (doble cara).
export function infoBoard(text, w, h, bg = "#2e3a48", fg = "#ffffff") {
  const g = new THREE.Group();
  g.add(mesh(box(w + 0.1, h + 0.1, 0.05), mat(0xffffff), 0, 0, 0, false));
  const opts = { bg, fg, font: "bold 40px", h: Math.round((512 * h) / w) };
  const front = signMesh(text, w, h, opts);
  front.position.z = 0.03;
  const back = signMesh(text, w, h, opts);
  back.rotation.y = Math.PI;
  back.position.z = -0.03;
  g.add(front, back);
  for (const s of [-1, 1])
    g.add(
      mesh(
        cylinder(0.01, 0.01, 0.6, 4),
        mat(0x555555),
        s * (w / 2 - 0.2),
        h / 2 + 0.3,
        0,
        false,
      ),
    );
  return g;
}

// Aro pulsante en el suelo que señala un punto importante.
export function pulseRing(color = 0xffd23f, r = 1.1) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(r * 0.8, r, 40),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  const g = new THREE.Group();
  g.add(m);
  g.userData.ring = m;
  return g;
}
