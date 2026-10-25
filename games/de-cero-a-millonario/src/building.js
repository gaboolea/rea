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
} from "./gfx.js";

const H = 3.4;
const T = 0.3;
const FLOOR_Y = 0.12;

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
    this.flip = rot !== 0 ? -1 : 1;
    this.group = new THREE.Group();
    this.interior = new THREE.Group(); // muebles del negocio
    this.group.add(this.interior);
    world.scene.add(this.group);
    this.walls = [];
    this.build();
  }

  // Coordenadas locales (puerta hacia +z local) a mundo.
  toWorld(lx, lz) {
    return { x: this.x + lx * this.flip, z: this.z + lz * this.flip };
  }

  // Rotación de mundo para un objeto cuya cara mira a +z local rotado rotY.
  worldRot(rotY = 0) {
    return rotY + (this.flip < 0 ? Math.PI : 0);
  }

  contains(px, pz, margin = 0) {
    return (
      Math.abs(px - this.x) <= this.w / 2 - margin &&
      Math.abs(pz - this.z) <= this.d / 2 - margin
    );
  }

  // Punto justo fuera de la puerta y justo dentro.
  doorPoint(offset) {
    return this.toWorld(0, this.d / 2 + offset);
  }

  addLocalCollider(lx, lz, w, d) {
    const a = this.toWorld(lx - w / 2, lz - d / 2);
    const b = this.toWorld(lx + w / 2, lz + d / 2);
    return this.world.physics.addBox(
      Math.min(a.x, b.x),
      Math.min(a.z, b.z),
      Math.max(a.x, b.x),
      Math.max(a.z, b.z),
      this.id,
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
    // Base de color de la fachada.
    this.wall(0, -d / 2 + T / 2, w, T, wallColor);
    this.wall(-w / 2 + T / 2, 0, T, d, wallColor);
    this.wall(w / 2 - T / 2, 0, T, d, wallColor);
    this.buildFront(w, d, doorW, wallColor, trimColor);
    this.buildRoof();
    if (this.opts.partition !== undefined) {
      this.partition = this.wall(
        0,
        this.opts.partition,
        w - 2 * T,
        T,
        wallColor,
      );
    }
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
    if (this.opts.sign) {
      const sign = signMesh(
        this.opts.sign,
        Math.min(w - 1, 7),
        1.1,
        this.opts.signColors,
      );
      this.place(sign, 0, d / 2 + 0.03, 0, H + 0.45);
      this.group.add(sign);
      const back = mesh(
        roundedBox(Math.min(w - 1, 7) + 0.3, 1.35, 0.15, 0.06),
        mat(trimColor).clone(),
        0,
        0,
        0,
      );
      this.place(back, 0, d / 2 - 0.06, 0, H + 0.45);
      this.group.add(back);
      this.world.occluders.push(sign, back);
      this.signBoard = sign;
    }
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

  buildRoof() {
    const { w, d, roofColor } = this.opts;
    this.roof = new THREE.Group();
    const slab = mesh(
      roundedBox(w + 0.5, 0.35, d + 0.5, 0.1),
      mat(roofColor).clone(),
      0,
      0,
      0,
    );
    this.place(slab, 0, 0, 0, H + 0.17);
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
    this.place(ac, -w / 4, -d / 4, 0, H + 0.7);
    this.roof.add(ac);
    this.group.add(this.roof);
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
