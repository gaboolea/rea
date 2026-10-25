// Efectos ligeros: monedas que saltan al cobrar y marcador de objetivo.
import * as THREE from "three";
import { textTexture, mat, cylinder, mesh } from "./gfx.js";

export class Fx {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.coinMat = mat(0xffd23f, {
      metalness: 0.4,
      roughness: 0.3,
      emissive: 0x6b4d00,
    });
    this.marker = this.buildMarker();
    scene.add(this.marker);
  }

  buildMarker() {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({
      color: 0x5bd47a,
      emissive: 0x2e8a43,
      emissiveIntensity: 0.6,
    });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.8, 16), m);
    cone.rotation.x = Math.PI;
    g.add(cone);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), m);
    ball.position.y = 0.55;
    g.add(ball);
    g.visible = false;
    return g;
  }

  setMarker(pos) {
    this.marker.visible = !!pos;
    if (pos) this.marker.userData.base = pos;
  }

  coins(pos, amount) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: textTexture(`+$${amount.toFixed(2)}`, {
          bg: "rgba(0,0,0,0)",
          fg: "#1e9e4a",
          w: 256,
          h: 96,
          font: "bold 64px",
        }),
        depthTest: false,
      }),
    );
    sprite.scale.set(1.6, 0.6, 1);
    sprite.position.set(pos.x, 2.6, pos.z);
    sprite.renderOrder = 20;
    this.scene.add(sprite);
    this.items.push({ obj: sprite, t: 0, life: 1.4, vy: 1.2 });
    for (let i = 0; i < 4; i++) {
      const c = mesh(
        cylinder(0.12, 0.12, 0.04, 14),
        this.coinMat,
        pos.x,
        1.4,
        pos.z,
        false,
      );
      c.rotation.x = Math.PI / 2;
      this.scene.add(c);
      this.items.push({
        obj: c,
        t: 0,
        life: 0.9,
        vy: 3 + Math.random() * 2,
        vx: (Math.random() - 0.5) * 2,
        vz: (Math.random() - 0.5) * 2,
      });
    }
  }

  // Nubecitas de polvo al correr o aterrizar.
  dust(pos, n) {
    this.dustGeo ??= new THREE.SphereGeometry(0.12, 8, 6);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(
        this.dustGeo,
        new THREE.MeshBasicMaterial({
          color: 0xf3e6c8,
          transparent: true,
          opacity: 0.7,
          depthWrite: false,
        }),
      );
      m.position.set(
        pos.x + (Math.random() - 0.5) * 0.4,
        pos.y + 0.08,
        pos.z + (Math.random() - 0.5) * 0.4,
      );
      this.scene.add(m);
      this.items.push({
        obj: m,
        t: 0,
        life: 0.5,
        vy: 0.4,
        puff: true,
        vx: (Math.random() - 0.5) * 1.2,
        vz: (Math.random() - 0.5) * 1.2,
      });
    }
  }

  update(dt, time) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      it.obj.position.y += it.vy * dt;
      if (it.puff) {
        it.obj.position.x += it.vx * dt;
        it.obj.position.z += it.vz * dt;
        it.obj.scale.setScalar(1 + it.t * 3);
        it.obj.material.opacity = 0.7 * (1 - it.t / it.life);
      } else if (it.vx !== undefined) {
        it.vy -= 9 * dt;
        it.obj.position.x += it.vx * dt;
        it.obj.position.z += it.vz * dt;
        it.obj.rotation.z += dt * 10;
      } else {
        it.obj.material.opacity = 1 - it.t / it.life;
      }
      if (it.t >= it.life) {
        this.scene.remove(it.obj);
        if (it.obj.isSprite) it.obj.material.map.dispose();
        if (it.obj.isSprite || it.puff) it.obj.material.dispose();
        this.items.splice(i, 1);
      }
    }
    const base = this.marker.userData.base;
    if (this.marker.visible && base) {
      this.marker.position.set(base.x, 3.6 + Math.sin(time * 3) * 0.25, base.z);
      this.marker.rotation.y = time * 2;
    }
  }
}
