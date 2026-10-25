// Personajes de juguete: cabeza grande sin rasgos, cuerpo redondeado y
// extremidades cortas. Animación procedural de reposo, caminar, correr,
// cargar cajas y acciones (agacharse a reponer, cobrar).
import * as THREE from "three";
import {
  mat,
  capsule,
  sphere,
  cylinder,
  roundedBox,
  mesh,
  bubbleMaterial,
} from "./gfx.js";
import { PRODUCTS } from "./config.js";

const HEAD = 0xf7f3ee;

export class ToyCharacter {
  constructor({ body = 0xf2a531, scale = 1, apron = null, hat = "none" } = {}) {
    this.root = new THREE.Group();
    this.rig = new THREE.Group();
    this.root.add(this.rig);
    this.rig.scale.setScalar(scale);
    this.phase = Math.random() * 10;
    this.speed = 0;
    this.action = null; // { kind, t, duration }
    this.carryBoxes = [];
    this.build(body, apron);
    this.setHat(hat);
    this.bubble = new THREE.Sprite(bubbleMaterial("?"));
    this.bubble.scale.set(0.8, 0.8, 0.8);
    this.bubble.position.set(0.35, 2.35, 0);
    this.bubble.visible = false;
    this.bubble.renderOrder = 10;
    this.root.add(this.bubble);
    this.bubbleTimer = 0;
  }

  build(body, apron) {
    const bodyMat = mat(body, { roughness: 0.45 });
    this.bodyMat = bodyMat;
    const skin = mat(HEAD, { roughness: 0.35 });
    this.torso = mesh(capsule(0.3, 0.32), bodyMat, 0, 0.78, 0);
    this.torso.scale.set(1, 1, 0.85);
    this.rig.add(this.torso);
    if (apron) {
      const a = mesh(
        roundedBox(0.46, 0.42, 0.06, 0.03),
        mat(apron),
        0,
        0.72,
        0.25,
      );
      this.rig.add(a);
    }
    this.headPivot = new THREE.Group();
    this.headPivot.position.set(0, 1.18, 0);
    this.rig.add(this.headPivot);
    this.head = mesh(sphere(0.42, 24), skin, 0, 0.32, 0);
    this.headPivot.add(this.head);

    this.legs = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.15, 0.46, 0);
      const leg = mesh(capsule(0.12, 0.18), bodyMat, 0, -0.22, 0);
      pivot.add(leg);
      this.rig.add(pivot);
      return pivot;
    });
    this.arms = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.34, 0.98, 0);
      const arm = mesh(capsule(0.09, 0.22), bodyMat, side * 0.04, -0.2, 0);
      pivot.add(arm);
      const hand = mesh(sphere(0.1, 12), skin, side * 0.05, -0.36, 0);
      pivot.add(hand);
      this.rig.add(pivot);
      return pivot;
    });
    this.carryGroup = new THREE.Group();
    this.carryGroup.position.set(0, 0.85, 0.42);
    this.rig.add(this.carryGroup);
    // Sombra de contacto suave bajo los pies.
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

  setBodyColor(color) {
    const m = mat(color, { roughness: 0.45 });
    this.rig.traverse((o) => {
      if (o.isMesh && o.material === this.bodyMat) o.material = m;
    });
    this.bodyMat = m;
  }

  setHat(id) {
    if (this.hat) this.headPivot.remove(this.hat);
    this.hat = null;
    if (id === "gorra") {
      this.hat = new THREE.Group();
      this.hat.add(mesh(sphere(0.3, 16), mat(0xff5a4e), 0, 0.62, 0));
      const visor = mesh(
        cylinder(0.24, 0.24, 0.04, 16),
        mat(0xff5a4e),
        0,
        0.6,
        0.28,
      );
      visor.scale.z = 0.7;
      this.hat.add(visor);
      this.hat.children[0].scale.y = 0.6;
    } else if (id === "sombrero") {
      this.hat = new THREE.Group();
      this.hat.add(
        mesh(cylinder(0.55, 0.55, 0.05, 24), mat(0x5a3b22), 0, 0.66, 0),
      );
      this.hat.add(
        mesh(cylinder(0.27, 0.3, 0.32, 20), mat(0x5a3b22), 0, 0.82, 0),
      );
      this.hat.add(
        mesh(cylinder(0.305, 0.305, 0.07, 20), mat(0xf2c230), 0, 0.71, 0),
      );
    } else if (id === "corona") {
      this.hat = new THREE.Group();
      const gold = mat(0xf7c531, { metalness: 0.6, roughness: 0.25 });
      this.hat.add(mesh(cylinder(0.24, 0.26, 0.16, 20), gold, 0, 0.74, 0));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const spike = mesh(
          cylinder(0.0, 0.07, 0.16, 6),
          gold,
          Math.cos(a) * 0.21,
          0.88,
          Math.sin(a) * 0.21,
        );
        this.hat.add(spike);
        this.hat.add(
          mesh(
            sphere(0.035, 8),
            mat(0xff3b6b),
            Math.cos(a) * 0.21,
            0.97,
            Math.sin(a) * 0.21,
          ),
        );
      }
    }
    if (this.hat) this.headPivot.add(this.hat);
  }

  // items: lista de ids de producto para dibujar cajas apiladas en brazos.
  setCarry(items) {
    const key = items.join(",");
    if (key === this.carryKey) return;
    this.carryKey = key;
    this.carryGroup.clear();
    items.forEach((id, i) => {
      const color = PRODUCTS[id]?.color ?? 0xc98d4f;
      const boxMesh = mesh(
        roundedBox(0.55, 0.36, 0.42, 0.04),
        mat(0xd9a066),
        0,
        i * 0.37,
        0,
      );
      const label = mesh(
        roundedBox(0.3, 0.14, 0.02, 0.01),
        mat(color),
        0,
        i * 0.37,
        0.215,
      );
      this.carryGroup.add(boxMesh, label);
    });
    this.carrying = items.length > 0;
  }

  playAction(kind, duration = 0.6) {
    this.action = { kind, t: 0, duration };
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
    this.phase += dt * (moving ? 3.2 + s * 1.6 : 2);
    const swing = moving ? Math.min(1, s / 4) * 0.9 : 0;
    const sinp = Math.sin(this.phase * 1.0);
    this.legs[0].rotation.x = sinp * swing;
    this.legs[1].rotation.x = -sinp * swing;
    const bob = moving
      ? Math.abs(Math.sin(this.phase)) * 0.06 * Math.min(1.5, s / 3)
      : Math.sin(this.phase) * 0.012;
    this.rig.position.y = bob;
    this.torso.rotation.z = moving ? Math.sin(this.phase) * 0.05 : 0;
    this.rig.rotation.x = moving ? Math.min(0.18, s * 0.025) : 0;
    this.headPivot.rotation.z = moving
      ? -Math.sin(this.phase) * 0.06
      : Math.sin(this.phase * 0.5) * 0.03;

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
      this.arms[0].rotation.z = -0.9;
      this.arms[1].rotation.z = 0.9;
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
    }
    if (a.t >= a.duration) this.action = null;
  }
}
