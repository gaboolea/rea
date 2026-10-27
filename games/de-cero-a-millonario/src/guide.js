// Orientación: baliza sobre la tienda propia (y de otros jugadores), brillo
// en la entrada, flecha en el borde de la pantalla con distancia, ruta por
// las calles (A*) y minimapa. Todo se calcula con posiciones reales.
import * as THREE from "three";
import { drawCity, drawIcon } from "./mapdraw.js";
import { mat, mesh, cylinder, sphere } from "./gfx.js";

const $ = (id) => document.getElementById(id);

function iconTexture(draw, color) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(64, 60, 54, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  draw(ctx);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Icono de tienda: tejado y toldo.
const shopIcon = (ctx) => {
  ctx.beginPath();
  ctx.moveTo(30, 58);
  ctx.lineTo(64, 30);
  ctx.lineTo(98, 58);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(38, 58, 52, 34);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(56, 70, 16, 22);
};
// Icono de persona (negocio ajeno).
const personIcon = (ctx) => {
  ctx.beginPath();
  ctx.arc(64, 44, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(64, 86, 26, 18, 0, Math.PI, 0);
  ctx.fill();
};

// Baliza flotante sobre una puerta.
export class Beacon {
  constructor(scene, building, { own, label }) {
    this.building = building;
    this.group = new THREE.Group();
    const color = own ? "#2ec4c4" : "#9b6dff";
    const tex = iconTexture(own ? shopIcon : personIcon, color);
    this.icon = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, depthTest: true }),
    );
    this.icon.scale.set(1.3, 1.3, 1);
    this.group.add(this.icon);
    const pin = mesh(
      new THREE.ConeGeometry(0.22, 0.5, 14),
      mat(own ? 0x2ec4c4 : 0x9b6dff, { emissive: own ? 0x0b6b6b : 0x3b2a7a }),
      0,
      -0.85,
      0,
      false,
    );
    pin.rotation.x = Math.PI;
    this.group.add(pin);
    if (label) {
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 96;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "rgba(29,43,68,0.82)";
      ctx.beginPath();
      ctx.roundRect(8, 8, 496, 80, 36);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = 'bold 44px "Baloo 2", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, 256, 50, 470);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t }));
      sp.scale.set(2.6, 0.49, 1);
      sp.position.y = 0.95;
      this.group.add(sp);
    }
    const door = building.doorPoint(0.4);
    this.base = { x: door.x, z: door.z };
    this.group.position.set(door.x, 5.2, door.z);
    scene.add(this.group);
    // Brillo suave en el suelo de la entrada (solo la tienda propia).
    if (own) {
      this.glowMat = new THREE.MeshBasicMaterial({
        color: 0x2ec4c4,
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(1.6, 32),
        this.glowMat,
      );
      glow.rotation.x = -Math.PI / 2;
      const p = building.doorPoint(0.9);
      glow.position.set(p.x, 0.14, p.z);
      scene.add(glow);
      this.glow = glow;
    }
  }

  update(time, playerDist) {
    this.group.position.y = 5.2 + Math.sin(time * 2.2) * 0.18;
    // Cerca, la baliza desaparece para no tapar la fachada ni el interior.
    this.group.visible = playerDist > 9;
    if (this.glowMat)
      this.glowMat.opacity = 0.08 + (Math.sin(time * 2.5) * 0.5 + 0.5) * 0.12;
  }

  dispose(scene) {
    scene.remove(this.group);
    if (this.glow) scene.remove(this.glow);
  }
}

export class Guide {
  constructor(game) {
    this.game = game;
    this.beacons = [];
    this.manual = null; // destino elegido por el jugador
    this.routeTimer = 0;
    this.route = [];
    const dotGeo = new THREE.CircleGeometry(0.16, 12);
    this.dotMat = new THREE.MeshBasicMaterial({
      color: 0x2ec4c4,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.dots = new THREE.InstancedMesh(dotGeo, this.dotMat, 60);
    this.dots.count = 0;
    this.dots.frustumCulled = false;
    game.scene.add(this.dots);
    this.flag = new THREE.Group();
    this.flag.add(
      mesh(cylinder(0.04, 0.04, 2.2, 6), mat(0xffffff), 0, 1.1, 0, false),
    );
    this.flag.add(mesh(sphere(0.14, 10), mat(0xffd23f), 0, 2.25, 0, false));
    game.scene.add(this.flag);
    this.flag.visible = false;
    this.minimap = $("minimap");
    this.minimap.addEventListener("click", () => game.ui.openMap());
    $("btn-home").onclick = () => {
      game.audio.sfx("click");
      this.goToShop();
    };
  }

  ownShop() {
    return this.game.businesses.tienda?.building;
  }

  // Balizas: la propia y las de otros jugadores (con su nombre).
  setBeacons(list) {
    for (const b of this.beacons) b.dispose(this.game.scene);
    this.beacons = list.map((l) => new Beacon(this.game.scene, l.building, l));
  }

  goToShop() {
    const b = this.ownShop();
    if (!b) return;
    this.setDestination({
      ...b.doorPoint(1.2),
      label: "Mi tienda",
      building: b,
    });
    this.game.ui.toast("🧭 Ruta marcada hacia tu tienda");
  }

  setDestination(dest) {
    this.manual = dest;
    this.routeTimer = 0;
  }

  // Prioridad: tutorial > destino manual > objetivo de misión.
  currentTarget() {
    const g = this.game;
    const tut = g.tutorial?.target();
    if (tut) return tut;
    if (this.manual) return this.manual;
    return g.missionTarget();
  }

  update(dt, time) {
    const g = this.game;
    const p = g.player.pos;
    for (const b of this.beacons)
      b.update(time, Math.hypot(b.base.x - p.x, b.base.z - p.z));
    const target = this.currentTarget();
    // Llegada al destino manual.
    if (this.manual && target === this.manual) {
      const arrived = this.manual.building
        ? this.manual.building.contains(p.x, p.z)
        : Math.hypot(this.manual.x - p.x, this.manual.z - p.z) < 2;
      if (arrived) this.manual = null;
    }
    this.updateRoute(dt, target);
    this.updateArrow(target);
    this.drawMinimap(target);
  }

  updateRoute(dt, target) {
    const g = this.game;
    this.flag.visible = !!target && !target.noFlag;
    if (target) this.flag.position.set(target.x, 0.12, target.z);
    this.routeTimer -= dt;
    if (this.routeTimer <= 0) {
      this.routeTimer = 0.8;
      const p = g.player.pos;
      const far = target && Math.hypot(target.x - p.x, target.z - p.z) > 4;
      this.route = far
        ? (g.world.physics.navGrid().findPath(p, target) ?? [])
        : [];
    }
    // Puntos sobre el suelo a lo largo de los primeros ~24 m de ruta.
    const m = new THREE.Matrix4();
    const rot = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    let n = 0;
    let prev = { x: g.player.pos.x, z: g.player.pos.z };
    let travelled = 0;
    for (const wp of this.route) {
      const seg = Math.hypot(wp.x - prev.x, wp.z - prev.z);
      for (
        let d = 1.2 - (travelled % 1.2);
        d < seg && n < 60 && travelled + d < 24;
        d += 1.2
      ) {
        const t = d / seg;
        m.copy(rot).setPosition(
          prev.x + (wp.x - prev.x) * t,
          g.world.physics.groundHeight(prev.x, prev.z) + 0.03,
          prev.z + (wp.z - prev.z) * t,
        );
        this.dots.setMatrixAt(n++, m);
      }
      travelled += seg;
      prev = wp;
      if (travelled > 24) break;
    }
    this.dots.count = n;
    this.dots.instanceMatrix.needsUpdate = true;
    this.dotMat.opacity = 0.55 + Math.sin(performance.now() / 250) * 0.25;
  }

  // Flecha en pantalla: apunta al destino y muestra la distancia.
  updateArrow(target) {
    const g = this.game;
    const el = $("nav-arrow");
    const shop = this.ownShop();
    const p = g.player.pos;
    const insideShop = shop?.contains(p.x, p.z);
    if (!target || (target.building && target.building.contains(p.x, p.z))) {
      el.hidden = true;
      $("btn-home").hidden = !shop || insideShop;
      return;
    }
    $("btn-home").hidden = !shop || insideShop;
    const dist = Math.hypot(target.x - p.x, target.z - p.z);
    const near = dist < 6;
    const v = new THREE.Vector3(target.x, 1.5, target.z).project(g.camera);
    const onScreen = v.z < 1 && Math.abs(v.x) < 0.85 && Math.abs(v.y) < 0.8;
    el.hidden = false;
    const isShop = target.building && target.building === shop;
    el.querySelector(".nav-label").textContent =
      near && isShop
        ? "ENTRAR A MI TIENDA"
        : `${target.label ?? "Destino"} · ${Math.round(dist)} m`;
    el.classList.toggle("near", near);
    const w = window.innerWidth;
    const h = window.innerHeight;
    let x;
    let y;
    let angle;
    if (onScreen) {
      x = (v.x * 0.5 + 0.5) * w;
      y = (-v.y * 0.5 + 0.5) * h - 70;
      angle = Math.PI; // apunta hacia abajo, al destino
    } else {
      // Dirección en pantalla según la cámara; se pega al borde.
      const dx = target.x - p.x;
      const dz = target.z - p.z;
      const yaw = g.cameraRig.yaw;
      const sx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
      const sy = -(-dx * Math.sin(yaw) - dz * Math.cos(yaw));
      angle = Math.atan2(sx, -sy);
      const r = Math.min(w, h) * 0.38;
      x = w / 2 + Math.sin(angle) * r;
      y = h / 2 - Math.cos(angle) * r;
    }
    el.style.transform = `translate(${x}px, ${y}px)`;
    el.querySelector(".nav-pointer").style.transform = `rotate(${angle}rad)`;
  }

  // Color de cada edificio en los planos (tuyo, en venta, de otro…).
  buildingColor(b) {
    const g = this.game;
    if (b === this.ownShop()) return "#2ec4c4";
    if (b === g.home?.lot?.building) return "#5bd47a";
    if (b.id === "mayorista") return "#ff9f43";
    if (g.remoteOwnerOf?.(b.id)) return "#b39cff";
    if (g.businesses[b.id]?.owned) return "#5bd47a";
    if (g.businesses[b.id] || b.id === "casagrande") return "#ffd166";
    if (g.world.pois.some((p) => p.id === b.id)) return "#ffb3d1";
    return "#dfe6ea";
  }

  drawMinimap(target) {
    const g = this.game;
    const c = this.minimap;
    if (!c.offsetParent) return;
    const ctx = c.getContext("2d");
    const size = c.width;
    const range = 40; // metros desde el centro hasta el borde
    const p = g.player.pos;
    const s = size / (range * 2);
    const X = (x) => size / 2 + (x - p.x) * s;
    const Z = (z) => size / 2 + (z - p.z) * s;
    ctx.save();
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#a8df8a";
    ctx.fillRect(0, 0, size, size);
    const view = { X, Z, s, w: size, h: size };
    drawCity(ctx, g.world, view, (b) => this.buildingColor(b));
    const icon = (x, z, text, color) => {
      ctx.fillStyle = color;
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const cx = Math.max(10, Math.min(size - 10, X(x)));
      const cz = Math.max(10, Math.min(size - 10, Z(z)));
      ctx.fillText(text, cx, cz);
    };
    for (const o of g.online?.remotePlayers() ?? []) {
      ctx.fillStyle = "#9b6dff";
      ctx.beginPath();
      ctx.arc(X(o.x), Z(o.z), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Lugares cercanos con su icono; la tienda propia y la casa, siempre.
    for (const p of g.world.pois)
      drawIcon(ctx, view, p.at.x, p.at.z, p.icon, { size: 11 });
    const shop = this.ownShop();
    if (shop) {
      const dp = shop.doorPoint(0);
      drawIcon(ctx, view, dp.x, dp.z, "🏪", { clamp: true, size: 12 });
    }
    const home = g.home?.lot;
    if (home && g.state.home?.owned)
      drawIcon(ctx, view, home.door.x, home.door.z, "🏡", {
        clamp: true,
        size: 12,
      });
    if (target) icon(target.x, target.z, "★", "#e08a00");
    // Jugador: flecha según su orientación.
    ctx.translate(size / 2, size / 2);
    ctx.rotate(-g.player.heading + Math.PI);
    ctx.fillStyle = "#1d2b44";
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#1d2b44";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText("N", size / 2, 10);
  }
}
