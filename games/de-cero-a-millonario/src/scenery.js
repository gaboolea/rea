// Paisaje lejano: cielo con degradado, montañas, mar con playa al final de
// la avenida y terreno exterior. Es solo decorativo (sin colisiones).
import * as THREE from "three";
import { mesh, box, mergeParts, surfaceTexture } from "./gfx.js";
import { seededRandom } from "./look.js";

const SKY_RADIUS = 300;
// Colores del cielo (cénit y horizonte) según la hora.
const SKY = {
  day: [0x2f8fe8, 0xc4ebff],
  dusk: [0x5b63c9, 0xffb38a],
  night: [0x101640, 0x3a3f7a],
};
const color = (hex) => new THREE.Color(hex);
const TOP = [color(SKY.day[0]), color(SKY.dusk[0]), color(SKY.night[0])];
const HORIZON = [color(SKY.day[1]), color(SKY.dusk[1]), color(SKY.night[1])];
const SEA = color(0x2fb4e6);

export class Scenery {
  constructor(scene) {
    this.scene = scene;
    this.top = new THREE.Color();
    this.horizon = new THREE.Color();
    this.buildSky();
    this.buildOuterGround();
    this.buildSea();
    this.buildMountains();
  }

  buildSky() {
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color(SKY.day[0]) },
        horizon: { value: new THREE.Color(SKY.day[1]) },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 top;
        uniform vec3 horizon;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y * 1.6 + 0.04, 0.0, 1.0);
          gl_FragColor = vec4(mix(horizon, top, pow(h, 0.7)), 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(SKY_RADIUS, 32, 16),
      this.skyMat,
    );
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  // Campo verde alrededor de la ciudad hasta las montañas.
  buildOuterGround() {
    const tex = surfaceTexture("grass", "#86cf5f", [60, 60]);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(260, 48),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.25;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  // Playa y mar al este: se ven al fondo de la avenida principal.
  buildSea() {
    const sand = mesh(
      box(14, 0.3, 260),
      new THREE.MeshStandardMaterial({ color: 0xf6dfa8, roughness: 1 }),
      101,
      -0.2,
      0,
      false,
    );
    this.scene.add(sand);
    this.seaMat = new THREE.MeshStandardMaterial({
      color: 0x2fb4e6,
      roughness: 0.2,
      metalness: 0.1,
    });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(220, 520), this.seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(216, -0.08, 0);
    this.scene.add(sea);
    // Espuma junto a la orilla.
    const foam = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 260),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.7,
      }),
    );
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(108.4, -0.04, 0);
    this.foam = foam;
    this.scene.add(foam);
  }

  // Cordillera azulada al fondo y colinas verdes más cerca; se deja libre
  // el este para ver el mar.
  buildMountains() {
    const rnd = seededRandom(4242);
    const far = [];
    const near = [];
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + rnd() * 0.05;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.42) continue;
      const r = 205 + rnd() * 30;
      const h = 30 + rnd() * 42;
      const cone = new THREE.ConeGeometry(28 + rnd() * 22, h, 7, 1);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      far.push([cone, x, h / 2 - 2, z, rnd() * 3, 0x86a9cf]);
      // Cima más clara.
      const cap = new THREE.ConeGeometry(8 + h * 0.12, h * 0.26, 7, 1);
      far.push([cap, x, h - h * 0.13 - 1.6, z, 0, 0xe8f3ff]);
    }
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2 + rnd() * 0.1;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.5) continue;
      const r = 150 + rnd() * 20;
      const s = 14 + rnd() * 14;
      const hill = new THREE.SphereGeometry(s, 12, 8);
      hill.scale(1.4, 0.55, 1.1);
      near.push([
        hill,
        Math.cos(a) * r,
        -2,
        Math.sin(a) * r,
        rnd() * 3,
        [0x7cc46a, 0x8fd16a, 0x6db85f][i % 3],
      ]);
    }
    for (const list of [far, near]) {
      const m = new THREE.Mesh(
        mergeParts(list),
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          flatShading: list === far,
          roughness: 1,
          fog: false,
        }),
      );
      this.scene.add(m);
    }
  }

  // night/dusk: 0..1. Devuelve el color del horizonte (para la niebla).
  update(camera, dusk, night, time) {
    this.sky.position.copy(camera.position);
    this.top.copy(TOP[0]).lerp(TOP[1], dusk).lerp(TOP[2], night);
    this.horizon
      .copy(HORIZON[0])
      .lerp(HORIZON[1], dusk)
      .lerp(HORIZON[2], night);
    this.skyMat.uniforms.top.value.copy(this.top);
    this.skyMat.uniforms.horizon.value.copy(this.horizon);
    this.seaMat.color.copy(SEA).lerp(this.top, 0.25 + night * 0.4);
    this.foam.material.opacity = 0.45 + Math.sin(time * 1.3) * 0.25;
    return this.horizon;
  }
}
