// Partículas (instanciadas) y ondas expansivas.
import * as THREE from 'three';

const MAX = 700;

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  size: number;
  grav: number;
  drag: number;
}

export class Fx {
  private mesh: THREE.InstancedMesh;
  private parts: Particle[] = [];
  private rings: { mesh: THREE.Mesh; life: number; max: number; size: number }[] = [];
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private ringGeo = new THREE.RingGeometry(0.8, 1, 40);

  constructor(private scene: THREE.Scene) {
    const geo = new THREE.IcosahedronGeometry(0.12, 0);
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX; i++) this.mesh.setColorAt(i, this.color.set('#ffffff'));
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  burst(pos: THREE.Vector3Like, color: string | string[], count: number, speed = 6, life = 0.8, grav = -14, size = 1): void {
    const colors = Array.isArray(color) ? color : [color];
    for (let i = 0; i < count; i++) {
      if (this.parts.length >= MAX) this.parts.shift();
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 2 - 1);
      const sp = speed * (0.4 + Math.random() * 0.6);
      this.parts.push({
        x: pos.x, y: pos.y, z: pos.z,
        vx: Math.sin(ph) * Math.cos(th) * sp,
        vy: Math.abs(Math.cos(ph)) * sp * 0.9 + speed * 0.3,
        vz: Math.sin(ph) * Math.sin(th) * sp,
        life: life * (0.6 + Math.random() * 0.4), max: life,
        size: size * (0.6 + Math.random() * 0.8),
        grav, drag: 1.5,
      });
      const idx = this.parts.length - 1;
      this.mesh.setColorAt(idx, this.color.set(colors[i % colors.length]!));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Columna de partículas que sube (recogida, aparición). */
  sparkle(pos: THREE.Vector3Like, color: string, count = 18): void {
    for (let i = 0; i < count; i++) {
      if (this.parts.length >= MAX) this.parts.shift();
      const a = Math.random() * Math.PI * 2;
      const r = 0.3 + Math.random() * 0.5;
      this.parts.push({
        x: pos.x + Math.cos(a) * r, y: pos.y + Math.random() * 0.4, z: pos.z + Math.sin(a) * r,
        vx: 0, vy: 2 + Math.random() * 3, vz: 0, life: 0.9, max: 0.9, size: 0.7, grav: 0, drag: 0.5,
      });
      this.mesh.setColorAt(this.parts.length - 1, this.color.set(color));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  ring(pos: THREE.Vector3Like, color: string, size: number, life = 0.5): void {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    const m = new THREE.Mesh(this.ringGeo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, pos.y + 0.05, pos.z);
    this.scene.add(m);
    this.rings.push({ mesh: m, life, max: life, size });
  }

  update(dt: number): void {
    let n = 0;
    const alive: Particle[] = [];
    const colors = this.mesh.instanceColor;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i]!;
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += p.grav * dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const s = p.size * Math.min(1, p.life / p.max * 2);
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.scale.setScalar(s);
      this.dummy.rotation.set(p.life * 5, p.life * 3, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(n, this.dummy.matrix);
      if (colors && n !== i) {
        colors.setXYZ(n, colors.getX(i), colors.getY(i), colors.getZ(i));
      }
      alive.push(p);
      n++;
    }
    this.parts = alive;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (colors) colors.needsUpdate = true;

    this.rings = this.rings.filter((r) => {
      r.life -= dt;
      const k = 1 - r.life / r.max;
      r.mesh.scale.setScalar(0.2 + k * r.size);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k);
      if (r.life <= 0) {
        r.mesh.removeFromParent();
        (r.mesh.material as THREE.Material).dispose();
        return false;
      }
      return true;
    });
  }

  clear(): void {
    this.parts = [];
    for (const r of this.rings) r.mesh.removeFromParent();
    this.rings = [];
  }
}
