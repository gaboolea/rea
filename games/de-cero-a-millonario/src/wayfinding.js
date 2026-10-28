// Orientación para comprar: carteles grandes que flotan sobre cada tienda
// (se ven de lejos y desde cualquier lado), postes indicadores con flechas
// en los cruces y los datos del panel «¿Dónde comprar?».
import * as THREE from "three";
import { mat, mesh, cylinder, roundRect } from "./gfx.js";
import { WALL_HEIGHT } from "./building.js";

// Qué se compra en cada sitio. poi: punto del mapa; building: edificio
// sobre el que flota el cartel (si lo hay).
export const SHOP_GUIDE = [
  {
    poi: "mayorista",
    icon: "📦",
    tag: "MAYORISTA",
    color: "#f2a531",
    group: "Para tu tienda",
    sells: "Mercadería y alimentos para tus estanterías",
  },
  {
    poi: "ropa",
    icon: "👕",
    tag: "ROPA",
    color: "#e0458b",
    group: "Ropa",
    sells: "Camisetas, pantalones, zapatillas, gorras y accesorios",
  },
  {
    poi: "boutique",
    icon: "👗",
    tag: "BOUTIQUE",
    color: "#9b4dca",
    group: "Ropa",
    sells: "Ropa elegante en el barrio",
  },
  {
    poi: "vehiculos",
    icon: "🚗",
    tag: "AUTOS",
    color: "#2f6fd6",
    group: "Vehículos",
    sells:
      "Monopatín, bici, scooter, moto y coches · prueba gratis en la pista",
  },
  {
    poi: "concesionario",
    icon: "🚚",
    tag: "FURGONETAS",
    color: "#1f9fa8",
    group: "Vehículos",
    sells: "Furgoneta de reparto, carretilla y Villa Bonita",
    building: null,
    at: { x: 58, z: 20, y: 5.5 },
  },
  {
    poi: "lujo",
    icon: "💎",
    tag: "LUJO",
    color: "#c9a227",
    group: "Vehículos",
    sells:
      "Gran turismo, traje de millonario y cadena de oro (distrito financiero)",
  },
  {
    poi: "muebles",
    icon: "🛋️",
    tag: "MUEBLES",
    color: "#c9782e",
    group: "Tu casa",
    sells: "Sofás, camas, cocina, baño, lámparas y cuadros",
  },
  {
    poi: "tecnologia",
    icon: "📺",
    tag: "TECNOLOGÍA",
    color: "#1d2b44",
    group: "Tu casa",
    sells: "Televisor, ordenador, altavoz y lavadora",
  },
  {
    poi: "gimnasio",
    icon: "🏋️",
    tag: "GIMNASIO",
    color: "#ff7a45",
    group: "Otros",
    sells: "Entrena y corre más rápido durante 3 minutos",
  },
  {
    poi: "cafeteria",
    icon: "☕",
    tag: "CAFÉ",
    color: "#8b5a3c",
    group: "Otros",
    sells: "Café Aroma: negocio en venta (pasteles, sándwiches y café)",
  },
];

// Postes indicadores en los cruces: a qué sitios señalan.
const SIGNPOSTS = [
  {
    x: -8.5,
    z: 9.2,
    to: ["mayorista", "ropa", "vehiculos", "muebles", "boutique"],
  },
  {
    x: -8.5,
    z: -55,
    to: ["ropa", "vehiculos", "gimnasio", "muebles", "tecnologia"],
  },
  { x: -9, z: -93, to: ["muebles", "tecnologia", "aparcamiento", "gimnasio"] },
  { x: 9, z: 60, to: ["mayorista", "ropa", "vehiculos", "muebles"] },
];

// Canvas con un letrero redondeado (o en forma de flecha) y texto.
function signCanvas(text, color, { w = 512, h = 150, arrow = 0 } = {}) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  const tip = arrow ? h * 0.45 : 0;
  ctx.fillStyle = color;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 10;
  if (arrow) {
    // Flecha hacia la derecha (arrow > 0) o hacia la izquierda.
    const [a, b] = arrow > 0 ? [8, w - 8] : [w - 8, 8];
    const s = Math.sign(b - a);
    ctx.beginPath();
    ctx.moveTo(a, 10);
    ctx.lineTo(b - s * tip, 10);
    ctx.lineTo(b, h / 2);
    ctx.lineTo(b - s * tip, h - 10);
    ctx.lineTo(a, h - 10);
    ctx.closePath();
  } else roundRect(ctx, 8, 8, w - 16, h - 16, h * 0.3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.round(h * 0.46)}px "Baloo 2", "Trebuchet MS", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cx = arrow ? w / 2 - (arrow * tip) / 2 : w / 2;
  ctx.fillText(text, cx, h / 2 + 4, w - tip - 40);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class Wayfinding {
  constructor(game) {
    this.game = game;
    this.signs = [];
    this.build();
  }

  poi(id) {
    return this.game.world.pois.find((p) => p.id === id);
  }

  // Entradas del panel con su punto del mapa y el edificio.
  entries() {
    const w = this.game.world;
    return SHOP_GUIDE.map((s) => {
      const poi = this.poi(s.poi);
      return (
        poi && {
          ...s,
          name: poi.name,
          at: poi.at,
          building: w.buildings[s.poi] ?? null,
        }
      );
    }).filter(Boolean);
  }

  build() {
    const g = this.game;
    for (const s of SHOP_GUIDE) {
      const b = g.world.buildings[s.poi];
      let pos;
      if (b) {
        const front = b.toWorld(0, b.d / 2 - 1.5);
        const floors = b.opts.floors ?? 2;
        pos = new THREE.Vector3(front.x, WALL_HEIGHT * floors + 3.6, front.z);
      } else if (s.at) pos = new THREE.Vector3(s.at.x, s.at.y, s.at.z);
      else continue;
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: signCanvas(`${s.icon} ${s.tag}`, s.color),
          transparent: true,
        }),
      );
      sprite.scale.set(7.2, 2.1, 1);
      sprite.position.copy(pos);
      sprite.renderOrder = 2;
      g.scene.add(sprite);
      this.signs.push({ sprite, base: pos.y });
    }
    for (const post of SIGNPOSTS) this.buildPost(post);
  }

  buildPost({ x, z, to }) {
    const g = this.game;
    const w = g.world;
    const group = new THREE.Group();
    const y0 = w.physics.groundHeight(x, z);
    const height = 2.2 + to.length * 0.62;
    group.add(
      mesh(cylinder(0.08, 0.1, height, 10), mat(0x1d2b44), 0, height / 2, 0),
    );
    group.add(mesh(cylinder(0.25, 0.3, 0.12, 12), mat(0x3e4a59), 0, 0.06, 0));
    to.forEach((id, i) => {
      const poi = this.poi(id);
      if (!poi) return;
      const guide = SHOP_GUIDE.find((s) => s.poi === id);
      const dist = Math.round(Math.hypot(poi.at.x - x, poi.at.z - z) / 5) * 5;
      const label = `${poi.icon} ${guide?.tag ?? poi.name.toUpperCase()} ${dist} m`;
      const color = guide?.color ?? "#2f6fd6";
      // Tabla de doble cara: cada lado lee de izquierda a derecha y su
      // flecha apunta al destino.
      const board = new THREE.Group();
      const geo = new THREE.PlaneGeometry(2.4, 0.5);
      const front = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          map: signCanvas(label, color, { arrow: 1 }),
          alphaTest: 0.5,
          roughness: 0.6,
        }),
      );
      const back = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          map: signCanvas(label, color, { arrow: -1 }),
          alphaTest: 0.5,
          roughness: 0.6,
        }),
      );
      front.position.set(1.25, 0, 0.02);
      back.position.set(1.25, 0, -0.02);
      back.rotation.y = Math.PI;
      board.add(front, back);
      board.position.y = height - 0.35 - i * 0.62;
      // +x local apunta al destino.
      board.rotation.y = Math.atan2(-(poi.at.z - z), poi.at.x - x);
      group.add(board);
    });
    group.position.set(x, y0, z);
    g.scene.add(group);
    w.physics.addCentered(x, z, 0.3, 0.3);
  }

  update(time) {
    for (const [i, s] of this.signs.entries())
      s.sprite.position.y = s.base + Math.sin(time * 1.6 + i) * 0.15;
  }
}
