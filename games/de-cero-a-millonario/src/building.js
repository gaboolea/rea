// Edificio genérico recorrible: suelo interior, paredes con colisión,
// fachada de cristal, puerta automática, toldo, letrero y techo que se
// oculta cuando el jugador entra.
import * as THREE from "three";
import {
  mat,
  box,
  mesh,
  roundedBox,
  signMesh,
  stripedTexture,
  tileTexture,
  sphere,
  mergeParts,
  facadeTexture,
  materialTexture,
  cylinder,
} from "./gfx.js";
import { decorateStorefront } from "./storefronts.js";

const H = 3.4;
// Altura de la planta alta decorativa.
const UPPER_H = 2.7;
const T = 0.3;
const FLOOR_Y = 0.12;

// Tejado a dos aguas (prisma triangular) con la cumbrera a lo largo de x.
export function gableRoof(w, d, h, color) {
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, 0);
  shape.lineTo(d / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: w,
    bevelEnabled: false,
  });
  geo.translate(0, 0, -w / 2);
  geo.rotateY(Math.PI / 2);
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, mat(color).clone());
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return g;
}

export class Building {
  constructor(world, opts) {
    this.world = world;
    this.opts = {
      doorW: 3.6,
      wallColor: 0xf6e7c8,
      trimColor: 0x3e8fd6,
      roofColor: 0x5cb6e0,
      floor: ["#f3e3b5", "#ead39b"],
      glass: true,
      ...opts,
    };
    const { x, z, w, d, rot = 0 } = this.opts;
    Object.assign(this, { x, z, w, d, rot, id: opts.id, name: opts.name });
    // Solo giros de 90°: así las cajas de colisión siguen alineadas a ejes.
    this.cos = Math.round(Math.cos(rot));
    this.sin = Math.round(Math.sin(rot));
    this.group = new THREE.Group();
    this.interior = new THREE.Group(); // muebles del negocio
    this.group.add(this.interior);
    world.scene.add(this.group);
    this.walls = [];
    this.windowMats = [];
    this.glassMats = [];
    this.lightMats = [];
    this.build();
  }

  // Coordenadas locales (puerta hacia +z local) a mundo.
  toWorld(lx, lz) {
    return {
      x: this.x + lx * this.cos + lz * this.sin,
      z: this.z - lx * this.sin + lz * this.cos,
    };
  }

  // Dirección local (sin traslación) a mundo.
  dirToWorld(dx, dz) {
    return {
      x: dx * this.cos + dz * this.sin,
      z: -dx * this.sin + dz * this.cos,
    };
  }

  toLocal(px, pz) {
    const dx = px - this.x;
    const dz = pz - this.z;
    return {
      x: dx * this.cos - dz * this.sin,
      z: dx * this.sin + dz * this.cos,
    };
  }

  // Rotación de mundo para un objeto cuya cara mira a +z local rotado rotY.
  worldRot(rotY = 0) {
    return rotY + this.rot;
  }

  contains(px, pz, margin = 0) {
    const l = this.toLocal(px, pz);
    return (
      Math.abs(l.x) <= this.w / 2 - margin &&
      Math.abs(l.z) <= this.d / 2 - margin
    );
  }

  // Punto frente a la puerta; lateral > 0 = carril de entrada, < 0 = salida.
  doorPoint(offset, lateral = 0) {
    return this.toWorld(lateral, this.d / 2 + offset);
  }

  addLocalCollider(lx, lz, w, d, tag = this.id) {
    const a = this.toWorld(lx - w / 2, lz - d / 2);
    const b = this.toWorld(lx + w / 2, lz + d / 2);
    return this.world.physics.addBox(
      Math.min(a.x, b.x),
      Math.min(a.z, b.z),
      Math.max(a.x, b.x),
      Math.max(a.z, b.z),
      tag,
    );
  }

  place(obj, lx, lz, rotY = 0, y = FLOOR_Y) {
    const p = this.toWorld(lx, lz);
    obj.position.set(p.x, y, p.z);
    obj.rotation.y = this.worldRot(rotY);
    return obj;
  }

  wall(lx, lz, w, d, color, y = 0, h = H, collide = true, occlude = true) {
    const material = mat(color).clone();
    const m = mesh(box(w, h, d), material, 0, 0, 0);
    this.place(m, lx, lz, 0, y + h / 2);
    this.group.add(m);
    if (occlude) {
      this.walls.push(m);
      this.world.occluders.push(m);
    }
    const collider = collide ? this.addLocalCollider(lx, lz, w, d) : null;
    return { mesh: m, collider };
  }

  build() {
    const { w, d, doorW, wallColor, trimColor } = this.opts;
    const floorTex = tileTexture(this.opts.floor[0], this.opts.floor[1], [
      w / 1.2,
      d / 1.2,
    ]);
    this.floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.7,
    });
    const floor = mesh(box(w, 0.12, d), this.floorMat, 0, 0, 0, false);
    this.place(floor, 0, 0, 0, 0.06);
    this.group.add(floor);
    const a = this.toWorld(-w / 2, -d / 2);
    const b = this.toWorld(w / 2, d / 2);
    this.world.physics.addFloor(
      Math.min(a.x, b.x),
      Math.min(a.z, b.z),
      Math.max(a.x, b.x),
      Math.max(a.z, b.z),
      FLOOR_Y,
    );
    // Base de color de la fachada (con su material si no es revoco).
    for (const [lx, lz, ww, dd, len] of [
      [0, -d / 2 + T / 2, w, T, w],
      [-w / 2 + T / 2, 0, T, d, d],
      [w / 2 - T / 2, 0, T, d, d],
    ]) {
      const { mesh: m } = this.wall(lx, lz, ww, dd, wallColor);
      if ((this.opts.facade ?? "plaster") !== "plaster") {
        m.material.color.setHex(0xffffff);
        m.material.map = this.facadeMap(len, H);
      }
    }
    this.buildFront(w, d, doorW, wallColor, trimColor);
    this.buildRoof();
    this.buildCeilingLights();
    if (this.opts.partition !== undefined) {
      this.partition = this.wall(
        0,
        this.opts.partition,
        w - 2 * T,
        T,
        wallColor,
      );
    }
    // Piezas propias del rubro (puesto de fruta, terraza, muelle...).
    if (this.opts.style) decorateStorefront(this, this.opts.style);
  }

  buildFront(w, d, doorW, wallColor, trimColor) {
    const side = (w - doorW) / 2;
    const fz = d / 2 - T / 2;
    for (const s of [-1, 1]) {
      const cx = s * (doorW / 2 + side / 2);
      if (this.opts.glass) {
        this.wall(cx, fz, side, T, wallColor, 0, 0.8);
        const glass = mesh(
          box(side - 0.2, 1.9, 0.08),
          new THREE.MeshStandardMaterial({
            color: 0xbfe8ff,
            transparent: true,
            opacity: 0.32,
            roughness: 0.1,
            metalness: 0.1,
          }),
          0,
          0,
          0,
          false,
        );
        this.place(glass, cx, fz, 0, 0.8 + 0.95);
        this.group.add(glass);
        this.glassMats.push(glass.material);
        const mullion = mesh(box(0.1, 1.9, 0.14), mat(trimColor), 0, 0, 0);
        this.place(mullion, cx, fz, 0, 1.75);
        this.group.add(mullion);
        this.wall(cx, fz, side, T, wallColor, 2.7, H - 2.7, false);
      } else {
        this.wall(cx, fz, side, T, wallColor);
      }
    }
    this.wall(0, fz, doorW, T, wallColor, 2.7, H - 2.7, false);
    // Marco de puerta de color.
    for (const s of [-1, 1]) {
      const frame = mesh(box(0.18, 2.75, 0.4), mat(trimColor), 0, 0, 0);
      this.place(frame, s * (doorW / 2), d / 2 - T / 2, 0, 1.375);
      this.group.add(frame);
    }
    this.doors = [-1, 1].map((s) => {
      const panel = mesh(
        box(doorW / 2, 2.6, 0.06),
        new THREE.MeshStandardMaterial({
          color: 0xd8f2ff,
          transparent: true,
          opacity: 0.35,
        }),
        0,
        0,
        0,
        false,
      );
      this.group.add(panel);
      return { panel, side: s, open: 0 };
    });
    this.updateDoors(0, false);
    if (this.opts.awning) this.buildAwning(doorW + 3, d);
    // Sin planta alta el cartel va delante del borde de la azotea.
    this.signZ = d / 2 + ((this.opts.floors ?? 2) > 1 ? 0.03 : 0.32);
    if (this.opts.sign) {
      const sign = signMesh(
        this.opts.sign,
        Math.min(w - 1, 7),
        1.1,
        this.opts.signColors,
      );
      this.place(sign, 0, this.signZ, 0, H + 0.45);
      this.group.add(sign);
      const back = mesh(
        roundedBox(Math.min(w - 1, 7) + 0.3, 1.35, 0.15, 0.06),
        mat(trimColor).clone(),
        0,
        0,
        0,
      );
      this.place(back, 0, this.signZ - 0.09, 0, H + 0.45);
      this.group.add(back);
      this.world.occluders.push(sign, back);
      this.signBoard = sign;
      this.signSize = Math.min(w - 1, 7);
    }
  }

  // Cambia el texto del letrero de la fachada (p. ej. nombre del dueño).
  setSignText(text, colors = this.opts.signColors) {
    if (!this.signBoard || text === this.signText) return;
    this.signText = text;
    const fresh = signMesh(text, this.signSize, 1.1, colors);
    this.signBoard.material.map.dispose();
    this.signBoard.material.map = fresh.material.map;
    this.signBoard.material.needsUpdate = true;
  }

  buildAwning(width, d) {
    const tex = stripedTexture(this.opts.awning[0], this.opts.awning[1], 10);
    const aw = new THREE.Mesh(
      new THREE.PlaneGeometry(width, 1.6),
      new THREE.MeshStandardMaterial({
        map: tex,
        side: THREE.DoubleSide,
        roughness: 0.8,
      }),
    );
    aw.castShadow = true;
    const p = this.toWorld(0, d / 2 + 0.75);
    aw.position.set(p.x, 3.0, p.z);
    aw.rotation.set(-Math.PI / 2 + 0.45, this.worldRot(0), 0, "YXZ");
    this.group.add(aw);
    this.world.occluders.push(aw);
  }

  // Paneles de luz en el techo: se ven encendidos desde la calle al anochecer.
  buildCeilingLights() {
    const m = new THREE.MeshStandardMaterial({
      color: 0xfffbe8,
      emissive: 0xfff1c4,
      emissiveIntensity: 0.4,
    });
    this.lightMats.push(m);
    const n = Math.max(1, Math.round(this.w / 7));
    for (let i = 0; i < n; i++) {
      for (const lz of [-this.d / 4, this.d / 4]) {
        const panel = mesh(box(1.6, 0.06, 0.6), m, 0, 0, 0, false);
        this.place(
          panel,
          -this.w / 2 + ((i + 0.5) * this.w) / n,
          lz,
          0,
          H - 0.05,
        );
        this.group.add(panel);
      }
    }
  }

  setNight(n) {
    const lit = !this.shutter;
    for (const m of this.glassMats) {
      m.emissive.setHex(0xffd27a);
      m.emissiveIntensity = lit ? n * 0.55 : 0;
      m.opacity = 0.32 + (lit ? n * 0.25 : 0);
    }
    for (const m of this.lightMats)
      m.emissiveIntensity = lit ? 0.4 + n * 1.4 : 0;
    // Algunas ventanas de arriba se encienden al anochecer.
    for (const m of this.windowMats) m.emissiveIntensity = n * 0.7;
  }

  // Plantas altas y tejado. opts.floors (1 a 3), opts.facade (material:
  // plaster, brick, wood, stone, panel), opts.windows (flowers, shutters,
  // balcony, arched, modern) y opts.roof (flat, gable, hip, parapet,
  // garden). Todo va en el grupo del techo: se oculta al entrar.
  buildRoof() {
    const { w, d, roofColor } = this.opts;
    this.roof = new THREE.Group();
    const uppers = Math.max(0, Math.min(2, (this.opts.floors ?? 2) - 1));
    for (let i = 0; i < uppers; i++)
      this.buildUpperFloor(H + 0.35 + i * UPPER_H, i === 0, i === uppers - 1);
    const top = uppers ? H + 0.35 + uppers * UPPER_H : H;
    this.roofTop = top + 0.35;
    const slab = mesh(
      roundedBox(w + 0.5, 0.35, d + 0.5, 0.1),
      mat(roofColor).clone(),
      0,
      0,
      0,
    );
    this.place(slab, 0, 0, 0, top + 0.17);
    this.roof.add(slab);
    this.world.occluders.push(slab);
    // Detalles de azotea: unidades de aire acondicionado.
    const ac = mesh(
      roundedBox(1.4, 0.7, 1.0, 0.1),
      mat(0xdfe6ea).clone(),
      0,
      0,
      0,
    );
    this.world.occluders.push(ac);
    this.roofUnit = ac;
    this.place(ac, -w / 4, -d / 4, 0, top + 0.7);
    this.roof.add(ac);
    const kind = this.opts.gable ? "gable" : (this.opts.roof ?? "flat");
    if (kind === "gable") {
      // Casa: tejado a dos aguas en lugar del aire acondicionado.
      ac.visible = false;
      const roof = gableRoof(
        w + 0.8,
        d + 0.8,
        Math.min(w, d) * 0.32,
        roofColor,
      );
      this.place(roof, 0, 0, 0, top + 0.34);
      this.roof.add(roof);
      this.world.occluders.push(...roof.children);
    } else if (kind === "hip") {
      // Tejado a cuatro aguas (pirámide de base rectangular).
      ac.visible = false;
      const geo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
      geo.rotateY(Math.PI / 4);
      geo.scale(w + 0.8, Math.min(w, d) * 0.3, d + 0.8);
      geo.translate(0, Math.min(w, d) * 0.15, 0);
      const roof = new THREE.Mesh(geo, mat(roofColor).clone());
      roof.castShadow = true;
      this.place(roof, 0, 0, 0, top + 0.34);
      this.roof.add(roof);
      this.world.occluders.push(roof);
    } else if (kind === "parapet" || kind === "garden") {
      // Pretil alrededor de la azotea; la de jardín lleva setos y sombrilla.
      const parts = [];
      const y = this.roofTop + 0.3;
      for (const s of [-1, 1]) {
        parts.push([box(w + 0.5, 0.6, 0.18), 0, y, s * (d / 2 + 0.16)]);
        parts.push([box(0.18, 0.6, d + 0.5), s * (w / 2 + 0.16), y, 0]);
      }
      const rim = new THREE.Mesh(mergeParts(parts), mat(this.opts.trimColor));
      this.place(rim, 0, 0, 0, 0);
      this.roof.add(rim);
      this.world.occluders.push(rim);
      if (kind === "garden") {
        ac.visible = false;
        const green = [];
        const y0 = this.roofTop;
        for (const s of [-1, 1]) {
          green.push([
            box(w - 1.2, 0.5, 0.6),
            0,
            y0 + 0.25,
            s * (d / 2 - 0.7),
            0,
            0x3fae5a,
          ]);
          green.push([
            box(w - 1.2, 0.1, 0.62),
            0,
            y0 + 0.05,
            s * (d / 2 - 0.7),
            0,
            0x8b5a3c,
          ]);
        }
        green.push([cylinder(0.04, 0.04, 2, 6), w / 5, y0 + 1, 0, 0, 0xffffff]);
        green.push([
          new THREE.ConeGeometry(1.2, 0.45, 8),
          w / 5,
          y0 + 2.1,
          0,
          0,
          0xff6b6b,
        ]);
        green.push([box(1.6, 0.06, 0.8), w / 5, y0 + 0.75, 0, 0, 0xffffff]);
        green.push([box(1.8, 0.04, 1.2), -w / 5, y0 + 0.02, 0, 0, 0x7fd36b]);
        const g = new THREE.Mesh(
          mergeParts(green),
          new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.7,
          }),
        );
        this.place(g, 0, 0, 0, 0);
        this.roof.add(g);
      }
    }
    this.group.add(this.roof);
  }

  // Textura de la fachada según opts.facade (los revocos llevan juntas).
  facadeMap(rw, rh) {
    const base = `#${new THREE.Color(this.opts.wallColor).getHexString()}`;
    const kind = this.opts.facade ?? "plaster";
    if (kind === "plaster") return facadeTexture(base, [rw / 2, rh / 2]);
    const scale = { brick: 2, wood: 2, stone: 3.5, panel: 3 }[kind] ?? 2;
    return materialTexture(kind, base, [rw / scale, rh / scale]);
  }

  // Una planta alta en y0: cuerpo con material, ventanas del estilo elegido
  // (fachada y laterales), franja inferior y cornisa en la última.
  buildUpperFloor(y0, first, last) {
    const { w, d, trimColor } = this.opts;
    const band = mesh(
      roundedBox(w + 0.25, first ? 0.35 : 0.16, d + 0.25, 0.06),
      mat(trimColor),
      0,
      0,
      0,
    );
    this.place(band, 0, 0, 0, first ? H + 0.17 : y0);
    this.roof.add(band);
    this.world.occluders.push(band);
    const body = mesh(
      box(w - 0.2, UPPER_H, d - 0.2),
      new THREE.MeshStandardMaterial({
        map: this.facadeMap(w, UPPER_H),
        roughness: 0.8,
      }),
      0,
      0,
      0,
    );
    this.place(body, 0, 0, 0, y0 + UPPER_H / 2);
    this.roof.add(body);
    this.world.occluders.push(body);
    const style = this.opts.windows ?? "flowers";
    const frames = [];
    const glass = [];
    const trims = [];
    const colored = [];
    const petals = [0xff6b9a, 0xffd23f, 0xff8a3d, 0xffffff, 0xb07cff];
    const wy = y0 + UPPER_H * 0.55;
    // Ventana en (lx, lz) mirando hacia ry; along = dirección de la pared.
    const addWindow = (lx, lz, ry, k) => {
      const ox = Math.sin(ry);
      const oz = Math.cos(ry);
      const ax = Math.cos(ry);
      const az = -Math.sin(ry);
      const at = (t, n) => [lx + ax * t + ox * n, lz + az * t + oz * n];
      if (style === "modern") return;
      if (style === "balcony") {
        const [gx, gz] = at(0, 0.06);
        frames.push([box(1.2, 1.9, 0.12), lx, y0 + 1.05, lz, ry]);
        glass.push([box(0.95, 1.7, 0.06), gx, y0 + 1.0, gz, ry]);
        const [bx, bz] = at(0, 0.4);
        trims.push([box(1.6, 0.1, 0.7), bx, y0 + 0.12, bz, ry]);
        const [rx, rz] = at(0, 0.72);
        trims.push([box(1.6, 0.06, 0.06), rx, y0 + 1.0, rz, ry]);
        for (let i = 0; i < 6; i++) {
          const [px, pz] = at(-0.75 + i * 0.3, 0.72);
          trims.push([box(0.04, 0.85, 0.04), px, y0 + 0.57, pz, ry]);
        }
        return;
      }
      frames.push([box(1.25, 1.3, 0.12), lx, wy, lz, ry]);
      const [gx, gz] = at(0, 0.06);
      glass.push([box(1.0, 1.05, 0.06), gx, wy, gz, ry]);
      frames.push([box(0.06, 1.05, 0.08), gx, wy, gz, ry]);
      if (style === "arched") {
        // Medio punto sobre la ventana (semicírculos de cara a la calle).
        const half = (r, t) => {
          const g = new THREE.CylinderGeometry(
            r,
            r,
            t,
            16,
            1,
            false,
            Math.PI / 2,
            Math.PI,
          );
          return g.rotateX(Math.PI / 2);
        };
        frames.push([half(0.62, 0.12), lx, wy + 0.6, lz, ry]);
        glass.push([half(0.5, 0.06), gx, wy + 0.52, gz, ry]);
      } else if (style === "shutters") {
        for (const s of [-1, 1]) {
          const [sx, sz] = at(s * 0.98, 0.08);
          trims.push([box(0.5, 1.3, 0.06), sx, wy, sz, ry]);
        }
      } else {
        const [bx, bz] = at(0, 0.18);
        trims.push([box(1.3, 0.24, 0.32), bx, wy - 0.75, bz, ry]);
        for (let i = 0; i < 4; i++) {
          const [fx, fz] = at(-0.45 + i * 0.3, 0.18);
          colored.push([
            sphere(0.11, 6),
            fx,
            wy - 0.56,
            fz,
            0,
            petals[(k + i) % petals.length],
          ]);
        }
      }
    };
    const front = Math.max(2, Math.floor(w / 3.2));
    let k = Math.floor(Math.abs(this.x + this.z));
    for (let i = 0; i < front; i++)
      addWindow(-w / 2 + ((i + 0.5) * w) / front, d / 2 - 0.1, 0, k++);
    const side = Math.max(1, Math.floor(d / 4.5));
    for (const s of [-1, 1])
      for (let i = 0; i < side; i++)
        addWindow(
          s * (w / 2 - 0.1),
          -d / 2 + ((i + 0.5) * d) / side,
          (s * Math.PI) / 2,
          k++,
        );
    if (style === "modern") {
      // Franja corrida de cristal con montantes en las cuatro caras.
      for (const [len, lz, lx, ry] of [
        [w - 0.8, d / 2 - 0.06, 0, 0],
        [w - 0.8, -d / 2 + 0.06, 0, Math.PI],
        [d - 0.8, 0, w / 2 - 0.06, Math.PI / 2],
        [d - 0.8, 0, -w / 2 + 0.06, -Math.PI / 2],
      ]) {
        glass.push([box(len, 1.2, 0.08), lx, wy, lz, ry]);
        const n = Math.max(2, Math.round(len / 1.6));
        for (let i = 0; i <= n; i++) {
          const t = -len / 2 + (i * len) / n;
          frames.push([
            box(0.08, 1.25, 0.12),
            lx + Math.cos(ry) * t,
            wy,
            lz - Math.sin(ry) * t,
            ry,
          ]);
        }
      }
    }
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0x9fd8ff,
      roughness: 0.15,
      metalness: 0.2,
      emissive: 0xffd27a,
      emissiveIntensity: 0,
    });
    this.windowMats.push(windowMat);
    const parts = [
      [frames, mat(style === "modern" ? 0x3e4a59 : 0xffffff)],
      [glass, windowMat],
      [trims, mat(trimColor)],
      [colored, new THREE.MeshStandardMaterial({ vertexColors: true })],
    ];
    for (const [list, material] of parts) {
      if (!list.length) continue;
      const m = new THREE.Mesh(mergeParts(list), material);
      m.castShadow = false;
      this.place(m, 0, 0, 0, 0);
      this.roof.add(m);
    }
    if (!last) return;
    // Cornisa de color en lo alto.
    const cornice = mesh(
      roundedBox(w + 0.3, 0.3, d + 0.3, 0.08),
      mat(trimColor),
      0,
      0,
      0,
    );
    this.place(cornice, 0, 0, 0, y0 + UPPER_H - 0.1);
    this.roof.add(cornice);
    this.world.occluders.push(cornice);
  }

  setLocked(locked, label) {
    if (locked && !this.shutter) {
      const sh = mesh(box(this.opts.doorW, 2.7, 0.12), mat(0x9aa7b0), 0, 0, 0);
      this.place(sh, 0, this.d / 2 - 0.05, 0, 1.35);
      this.group.add(sh);
      const lines = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const l = mesh(
          box(this.opts.doorW, 0.04, 0.14),
          mat(0x7b8790),
          0,
          0,
          0,
          false,
        );
        this.place(l, 0, this.d / 2 - 0.05, 0, 0.3 + i * 0.42);
        lines.add(l);
      }
      this.group.add(lines);
      this.shutter = {
        mesh: sh,
        lines,
        collider: this.addLocalCollider(
          0,
          this.d / 2 - 0.05,
          this.opts.doorW,
          0.3,
        ),
      };
    } else if (!locked && this.shutter) {
      this.group.remove(this.shutter.mesh, this.shutter.lines);
      this.world.physics.remove(this.shutter.collider);
      this.shutter = null;
    }
    if (label !== undefined) this.setForSale(label);
  }

  // Cartel "Se vende" en la acera frente a la puerta.
  setForSale(label) {
    if (this.saleSign) {
      this.world.scene.remove(this.saleSign);
      this.saleSign = null;
    }
    if (!label) return;
    const g = new THREE.Group();
    g.add(mesh(box(0.12, 1.6, 0.12), mat(0x8a5a35), 0, 0.8, 0));
    const board = signMesh(label, 2.4, 1.2, {
      bg: "#fff6d8",
      fg: "#c0392b",
      font: "bold 46px",
      border: "#e67e22",
    });
    board.position.set(0, 1.8, 0.08);
    g.add(board);
    const back = mesh(box(2.5, 1.3, 0.1), mat(0xe67e22), 0, 1.8, 0);
    g.add(back);
    this.place(g, 3.2, this.d / 2 + 1.4, 0, 0.12);
    this.world.scene.add(g);
    this.saleSign = g;
  }

  updateDoors(dt, someoneNear) {
    for (const door of this.doors) {
      const target = someoneNear ? 1 : 0;
      door.open += (target - door.open) * Math.min(1, dt * 6);
      const lx =
        door.side *
        (this.opts.doorW / 4 + door.open * (this.opts.doorW / 2 - 0.1));
      this.place(door.panel, lx, this.d / 2 - T / 2 + 0.12, 0, 1.4);
    }
  }

  setFloor(colors) {
    this.floorMat.map = tileTexture(colors[0], colors[1], [
      this.w / 1.2,
      this.d / 1.2,
    ]);
    this.floorMat.needsUpdate = true;
  }
}

export { FLOOR_Y, H as WALL_HEIGHT };
