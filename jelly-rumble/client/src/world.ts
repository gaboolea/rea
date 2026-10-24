// Construcción visual de los mapas a partir de las mismas definiciones que usa
// la física, y actualización de sus partes dinámicas en cada fotograma.
import * as THREE from 'three';
import {
  type BoxDef, type MapDef, SECTOR_PHASE, SECTOR_START, SECTOR_WARN, TILE_GONE, TILE_SHAKE,
  barAngle, boxOffset, cylRadius, sectorState, vanishState,
} from '../../shared/maps.ts';

// ---------------------------------------------------------- Texturas
function canvasTex(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void, repeat = 1): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

function speckle(ctx: CanvasRenderingContext2D, s: number, base: string, dots: string[], n: number, r: number): void {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = dots[i % dots.length]!;
    ctx.beginPath();
    ctx.arc(Math.random() * s, Math.random() * s, r * (0.5 + Math.random()), 0, Math.PI * 2);
    ctx.fill();
  }
}

const TEX = {
  grass: () => canvasTex(128, (c, s) => {
    speckle(c, s, '#6fd24a', ['#82e05a', '#5cbf3d', '#93ea6a'], 220, 4);
    c.strokeStyle = 'rgba(40,110,30,0.25)';
    c.lineWidth = 2;
    c.strokeRect(1, 1, s - 2, s - 2);
  }),
  dirt: () => canvasTex(128, (c, s) => {
    const g = c.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#5cbf3d');
    g.addColorStop(0.18, '#5cbf3d');
    g.addColorStop(0.2, '#a0683a');
    g.addColorStop(1, '#7a4a26');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) {
      c.fillStyle = i % 2 ? '#8e5a30' : '#b47a48';
      c.fillRect(Math.random() * s, s * 0.25 + Math.random() * s * 0.75, 6, 3);
    }
  }),
  crate: () => canvasTex(128, (c, s) => {
    c.fillStyle = '#c98a4b';
    c.fillRect(0, 0, s, s);
    c.strokeStyle = '#7a4a26';
    c.lineWidth = 10;
    c.strokeRect(5, 5, s - 10, s - 10);
    c.beginPath();
    c.moveTo(10, 10); c.lineTo(s - 10, s - 10);
    c.moveTo(s - 10, 10); c.lineTo(10, s - 10);
    c.stroke();
  }),
  plank: () => canvasTex(128, (c, s) => {
    for (let i = 0; i < 4; i++) {
      c.fillStyle = i % 2 ? '#d49a5c' : '#c68a4c';
      c.fillRect(0, (i * s) / 4, s, s / 4);
      c.fillStyle = '#7a4a26';
      c.fillRect(0, (i * s) / 4, s, 3);
    }
  }),
  stripes: (a: string, b: string) => canvasTex(128, (c, s) => {
    c.fillStyle = a;
    c.fillRect(0, 0, s, s);
    c.fillStyle = b;
    for (let i = -s; i < s * 2; i += 32) {
      c.beginPath();
      c.moveTo(i, 0); c.lineTo(i + 16, 0); c.lineTo(i + 16 - s, s); c.lineTo(i - s, s);
      c.fill();
    }
  }),
  checker: (a: string, b: string, n = 4) => canvasTex(128, (c, s) => {
    const k = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      c.fillStyle = (i + j) % 2 ? a : b;
      c.fillRect(i * k, j * k, k, k);
    }
  }),
  neon: () => canvasTex(256, (c, s) => {
    c.fillStyle = '#3a2a7a';
    c.fillRect(0, 0, s, s);
    c.strokeStyle = '#ff5ad8';
    c.lineWidth = 4;
    for (let i = 0; i <= s; i += 32) {
      c.beginPath(); c.moveTo(i, 0); c.lineTo(i, s); c.stroke();
      c.beginPath(); c.moveTo(0, i); c.lineTo(s, i); c.stroke();
    }
  }),
  hex: (base: string, line: string) => canvasTex(128, (c, s) => {
    c.fillStyle = base;
    c.fillRect(0, 0, s, s);
    c.strokeStyle = line;
    c.lineWidth = 8;
    c.strokeRect(6, 6, s - 12, s - 12);
    c.fillStyle = 'rgba(255,255,255,0.15)';
    c.fillRect(14, 14, s - 28, 18);
  }),
};

type MatSet = THREE.Material | THREE.Material[];

export class WorldView {
  group = new THREE.Group();
  private boxMeshes: (THREE.Mesh | null)[] = [];
  private boxBase: THREE.Vector3[] = [];
  private cylMeshes: { mesh: THREE.Object3D; def: MapDef['cyls'][number]; sectors?: THREE.Mesh[] }[] = [];
  private barMeshes: { pivot: THREE.Object3D; def: MapDef['bars'][number] }[] = [];
  private tileFall: Float32Array;
  private lava: THREE.Mesh | null = null;
  private lavaMat: THREE.ShaderMaterial | null = null;
  private clouds: THREE.Object3D[] = [];
  private floaters: THREE.Object3D[] = [];
  private mats = new Map<string, MatSet>();
  sun!: THREE.DirectionalLight;

  constructor(public map: MapDef, private scene: THREE.Scene) {
    this.tileFall = new Float32Array(map.tileCount ?? 0);
    this.buildEnvironment();
    map.boxes.forEach((b, i) => this.buildBox(b, i));
    for (const c of map.cyls) this.buildCyl(c);
    for (const b of map.bars) this.buildBar(b);
    if (map.goalZ !== undefined) this.buildGoal();
    scene.add(this.group);
  }

  private mat(style: string): MatSet {
    const hit = this.mats.get(style);
    if (hit) return hit;
    let m: MatSet;
    const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.75, ...o });
    switch (style) {
      case 'grass': {
        const top = std({ map: TEX.grass() });
        const side = std({ map: TEX.dirt() });
        const bottom = std({ color: '#6b4022' });
        m = [side, side, top, bottom, side, side];
        break;
      }
      case 'crate': m = std({ map: TEX.crate() }); break;
      case 'plank': m = std({ map: TEX.plank() }); break;
      case 'mover': m = std({ map: TEX.stripes('#ffd23f', '#ff8a3d'), roughness: 0.5 }); break;
      case 'vanish': m = new THREE.MeshStandardMaterial({ color: '#7fe7ff', roughness: 0.2, transparent: true, opacity: 0.85, emissive: '#1a6a8a' }); break;
      case 'bounce': m = std({ map: TEX.checker('#ff5ad8', '#ffffff', 2), emissive: '#5a1040', roughness: 0.4 }); break;
      case 'goal': {
        const top = std({ map: TEX.checker('#ffffff', '#2b1d4a', 6) });
        const side = std({ color: '#ffd23f' });
        m = [side, side, top, side, side, side];
        break;
      }
      case 'tileTop': m = std({ map: TEX.hex('#8a7aa0', '#5a4a70'), roughness: 0.6 }); break;
      case 'tileLow': m = std({ map: TEX.hex('#6a6080', '#3e3458'), roughness: 0.6 }); break;
      case 'pusher': m = std({ map: TEX.stripes('#ff3b5c', '#ffffff'), roughness: 0.4 }); break;
      case 'gold': m = std({ color: '#ffcf33', metalness: 0.5, roughness: 0.35, emissive: '#3a2600' }); break;
      case 'neon': m = std({ map: TEX.neon(), emissive: '#2a0a4a', roughness: 0.4 }); break;
      case 'neonHub': m = std({ color: '#ff5ad8', emissive: '#6a1060', roughness: 0.3 }); break;
      case 'pillar': m = std({ color: '#ffd23f', metalness: 0.4, roughness: 0.3 }); break;
      case 'final': {
        const top = std({ map: TEX.checker('#3b2f8f', '#5b4fd0', 8), roughness: 0.4 });
        const side = std({ color: '#ffcf33', metalness: 0.5, roughness: 0.35 });
        m = [side, top, side];
        break;
      }
      default: m = std({ color: '#cccccc' });
    }
    this.mats.set(style, m);
    return m;
  }

  private buildEnvironment(): void {
    const th = this.map.theme;
    // Cielo con degradado.
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { top: { value: new THREE.Color(th.skyTop) }, bottom: { value: new THREE.Color(th.skyBottom) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = smoothstep(-0.3, 0.7, vP.y); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }',
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat);
    sky.renderOrder = -1;
    this.group.add(sky);
    this.scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar);

    const hemi = new THREE.HemisphereLight(th.ambient, '#3a3050', 1.1);
    this.group.add(hemi);
    this.sun = new THREE.DirectionalLight(th.sun, 2.4);
    this.sun.position.set(30, 50, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 140;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    this.group.add(this.sun, this.sun.target);

    const rand = mulberry(this.map.id * 1000 + 7);
    if (th.ground === 'clouds') {
      const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#cfe8ff', emissiveIntensity: 0.25 });
      const geo = new THREE.SphereGeometry(1, 12, 10);
      for (let i = 0; i < 26; i++) {
        const cl = new THREE.Group();
        const n = 4 + Math.floor(rand() * 4);
        for (let k = 0; k < n; k++) {
          const p = new THREE.Mesh(geo, cloudMat);
          p.scale.setScalar(3 + rand() * 4);
          p.position.set(k * 4 - n * 2, rand() * 2, rand() * 4);
          cl.add(p);
        }
        const a = rand() * Math.PI * 2;
        const r = 45 + rand() * 90;
        cl.position.set(Math.cos(a) * r, -25 - rand() * 25, Math.sin(a) * r + (this.map.goalZ ? 50 : 0));
        this.clouds.push(cl);
        this.group.add(cl);
      }
    }
    if (th.ground === 'lava') {
      this.lavaMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv * 18.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform float uTime; varying vec2 vUv;
          float n(vec2 p){ return sin(p.x*1.7+uTime*0.6)*sin(p.y*1.3-uTime*0.4) + sin((p.x+p.y)*0.9+uTime*0.8)*0.6; }
          void main(){ float v = n(vUv) + n(vUv*2.1+3.0)*0.5; float b = smoothstep(-0.2, 1.2, v);
          vec3 c = mix(vec3(0.75,0.12,0.02), vec3(1.0,0.75,0.15), b); c += vec3(1.0,0.9,0.4) * smoothstep(0.92, 1.0, abs(sin(v*3.0))) * 0.6;
          gl_FragColor = vec4(c, 1.0); }`,
      });
      this.lava = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), this.lavaMat);
      this.lava.rotation.x = -Math.PI / 2;
      this.lava.position.y = this.map.killY + 0.5;
      this.group.add(this.lava);
      const glow = new THREE.PointLight('#ff6a1a', 60, 60, 1.5);
      glow.position.set(0, this.map.killY + 4, 0);
      this.group.add(glow);
      // Rocas en la lava.
      const rockMat = new THREE.MeshStandardMaterial({ color: '#4a2a22', roughness: 0.9 });
      for (let i = 0; i < 18; i++) {
        const r = new THREE.Mesh(new THREE.DodecahedronGeometry(2 + rand() * 4, 0), rockMat);
        const a = rand() * Math.PI * 2;
        const d = 30 + rand() * 50;
        r.position.set(Math.cos(a) * d, this.map.killY + rand() * 3, Math.sin(a) * d);
        this.group.add(r);
      }
    }
    if (th.ground === 'void') {
      const starGeo = new THREE.BufferGeometry();
      const pts: number[] = [];
      for (let i = 0; i < 700; i++) {
        const v = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize().multiplyScalar(300);
        pts.push(v.x, v.y, v.z);
      }
      starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.group.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 1.4, sizeAttenuation: false, fog: false })));
    }
    // Objetos flotantes decorativos (cubos y esferas oscuras).
    const darkMat = new THREE.MeshStandardMaterial({ color: '#2a2438', roughness: 0.6 });
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(rand() > 0.5 ? new THREE.BoxGeometry(1.5, 1.5, 1.5) : new THREE.SphereGeometry(0.9, 14, 10), darkMat);
      const a = rand() * Math.PI * 2;
      const d = 28 + rand() * 30;
      m.position.set(Math.cos(a) * d, 4 + rand() * 14, Math.sin(a) * d + (this.map.goalZ ? 45 : 0));
      m.userData.base = m.position.y;
      m.userData.ph = rand() * 6;
      this.floaters.push(m);
      this.group.add(m);
    }
  }

  private buildBox(b: BoxDef, i: number): void {
    const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
    // Texturas repetidas según el tamaño.
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const nrm = geo.attributes.normal as THREE.BufferAttribute;
    if (b.style !== 'grass' && b.style !== 'goal') {
      for (let k = 0; k < uv.count; k++) {
        const nx = Math.abs(nrm.getX(k)); const ny = Math.abs(nrm.getY(k));
        const [u, v] = nx > 0.5 ? [pos.getZ(k), pos.getY(k)] : ny > 0.5 ? [pos.getX(k), pos.getZ(k)] : [pos.getX(k), pos.getY(k)];
        uv.setXY(k, u / 2, v / 2);
      }
    } else {
      for (let k = 0; k < uv.count; k++) {
        const ny = Math.abs(nrm.getY(k));
        if (ny > 0.5) uv.setXY(k, pos.getX(k) / 2, pos.getZ(k) / 2);
        else uv.setXY(k, (Math.abs(nrm.getX(k)) > 0.5 ? pos.getZ(k) : pos.getX(k)) / 2, (pos.getY(k) + b.h / 2) / Math.max(1, b.h) * 0.999);
      }
    }
    let mat = this.mat(b.style);
    if (b.kind === 'vanish' || b.kind === 'tile') {
      mat = Array.isArray(mat) ? mat.map((m) => m.clone()) : mat.clone();
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(b.x, b.y, b.z);
    mesh.castShadow = b.kind !== 'tile';
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.boxMeshes[i] = mesh;
    this.boxBase[i] = mesh.position.clone();
    if (b.kind === 'bounce') {
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.5, 4), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 }));
      arrow.position.y = b.h / 2 + 0.6;
      arrow.userData.spin = true;
      mesh.add(arrow);
    }
  }

  private buildCyl(c: MapDef['cyls'][number]): void {
    const mat = this.mat(c.style);
    const matArr = Array.isArray(mat) ? mat : [mat, mat, mat];
    // CylinderGeometry usa grupos: lateral, tapa superior, tapa inferior.
    const cylMats = c.style === 'grass'
      ? [matArr[0]!, matArr[2]!, matArr[3]!]
      : matArr.length === 3 ? matArr : [mat as THREE.Material, mat as THREE.Material, mat as THREE.Material];
    if (c.sectors) {
      const g = new THREE.Group();
      const sectors: THREE.Mesh[] = [];
      const w = (Math.PI * 2) / c.sectors;
      for (let s = 0; s < c.sectors; s++) {
        const geo = new THREE.CylinderGeometry(c.r, c.r, c.h, 12, 1, false, Math.PI / 2 - (s + 1) * w, w);
        const m = (mat as THREE.Material).clone();
        const mesh = new THREE.Mesh(geo, m);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        mesh.userData.base = 0;
        g.add(mesh);
        sectors.push(mesh);
      }
      g.position.set(c.x, c.top - c.h / 2, c.z);
      this.group.add(g);
      this.cylMeshes.push({ mesh: g, def: c, sectors });
      return;
    }
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(c.r, c.r * 0.85, c.h, 48), cylMats);
    mesh.position.set(c.x, c.top - c.h / 2, c.z);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.group.add(mesh);
    if (c.style === 'grass' && !c.shrink) {
      // Raíces/rocas colgando bajo la arena.
      const under = new THREE.Mesh(new THREE.ConeGeometry(c.r * 0.85, c.r * 0.9, 24), new THREE.MeshStandardMaterial({ color: '#7a4a26', roughness: 1 }));
      under.rotation.x = Math.PI;
      under.position.set(c.x, c.top - c.h - c.r * 0.45, c.z);
      this.group.add(under);
    }
    this.cylMeshes.push({ mesh, def: c });
  }

  private buildBar(b: MapDef['bars'][number]): void {
    const pivot = new THREE.Group();
    pivot.position.set(b.x, b.y, b.z);
    const len = b.oneSided ? b.len : b.len * 2;
    const mat = new THREE.MeshStandardMaterial({ map: TEX.stripes('#ff3b5c', '#ffffff'), roughness: 0.35, emissive: '#400010' });
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(b.thick, b.thick, len, 16), mat);
    bar.rotation.z = Math.PI / 2;
    bar.position.x = b.oneSided ? b.len / 2 : 0;
    bar.castShadow = true;
    pivot.add(bar);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.6, 16), new THREE.MeshStandardMaterial({ color: '#2b1d4a', metalness: 0.4, roughness: 0.4 }));
    pivot.add(hub);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(b.thick * 1.6, 12, 10), new THREE.MeshStandardMaterial({ color: '#ffd23f' }));
    cap.position.x = b.len;
    pivot.add(cap);
    if (!b.oneSided) {
      const cap2 = cap.clone();
      cap2.position.x = -b.len;
      pivot.add(cap2);
    }
    this.group.add(pivot);
    this.barMeshes.push({ pivot, def: b });
  }

  private buildGoal(): void {
    const g = this.map.boxes.find((b) => b.kind === 'goal');
    if (!g) return;
    const archMat = new THREE.MeshStandardMaterial({ color: '#ff5a7a', roughness: 0.4 });
    const top = g.y + g.h / 2;
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 5, 16), archMat);
      post.position.set(g.x + s * 4, top + 2.5, g.z - g.d / 2 + 1);
      post.castShadow = true;
      this.group.add(post);
    }
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#2b1d4a';
    ctx.font = '700 90px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('¡META!', 256, 70);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const banner = new THREE.Mesh(new THREE.BoxGeometry(8.7, 1.6, 0.3), [archMat, archMat, archMat, archMat, new THREE.MeshStandardMaterial({ map: tex }), new THREE.MeshStandardMaterial({ map: tex })]);
    banner.position.set(g.x, top + 5, g.z - g.d / 2 + 1);
    banner.rotation.y = Math.PI;
    this.group.add(banner);
  }

  /** Actualiza las piezas dinámicas para el tiempo de ronda t. */
  update(t: number, dt: number, tiles: string, now: number): void {
    const map = this.map;
    map.boxes.forEach((b, i) => {
      const mesh = this.boxMeshes[i];
      if (!mesh) return;
      const base = this.boxBase[i]!;
      if (b.move) {
        const [ox, oy, oz] = boxOffset(b, t);
        mesh.position.set(base.x + ox, base.y + oy, base.z + oz);
      }
      if (b.kind === 'vanish') {
        const st = vanishState(b, t);
        const m = mesh.material as THREE.MeshStandardMaterial;
        mesh.visible = true;
        m.opacity = st.solid ? (st.warn > 0 && Math.sin(now * 30) > 0 ? 0.35 : 0.9) : 0.08;
        m.emissive.set(st.warn > 0 ? '#ff3b5c' : '#1a6a8a');
      }
      if (b.kind === 'tile' && b.tile !== undefined) {
        const s = tiles[b.tile];
        const m = mesh.material as THREE.MeshStandardMaterial;
        if (s === TILE_SHAKE) {
          mesh.position.set(base.x + (Math.random() - 0.5) * 0.12, base.y, base.z + (Math.random() - 0.5) * 0.12);
          m.emissive.set('#ff3b1a');
          m.emissiveIntensity = 0.5 + Math.sin(now * 25) * 0.4;
          this.tileFall[b.tile] = 0;
        } else if (s === TILE_GONE) {
          this.tileFall[b.tile]! += dt;
          const f = this.tileFall[b.tile]!;
          mesh.position.y = base.y - f * f * 9;
          mesh.rotation.x = f * 0.8;
          mesh.visible = f < 2;
        } else {
          mesh.position.copy(base);
          mesh.rotation.set(0, 0, 0);
          mesh.visible = true;
          m.emissive.set('#000000');
          this.tileFall[b.tile] = 0;
        }
      }
      if (b.kind === 'bounce') {
        const arrow = mesh.children[0];
        if (arrow) {
          arrow.rotation.y += dt * 3;
          arrow.position.y = b.h / 2 + 0.6 + Math.sin(now * 4) * 0.15;
        }
      }
    });

    for (const c of this.cylMeshes) {
      if (c.def.shrink) {
        const k = cylRadius(c.def, t) / c.def.r;
        c.mesh.scale.set(k, 1, k);
      }
      if (c.sectors && c.def.sectors) {
        c.sectors.forEach((m, s) => {
          const st = sectorState(t, s, c.def.sectors!);
          const mat = m.material as THREE.MeshStandardMaterial;
          if (st === 2) {
            m.position.y = Math.max(-30, m.position.y - dt * 25);
          } else {
            m.position.y += (0 - m.position.y) * Math.min(1, dt * 6);
          }
          mat.emissive.set(st === 1 ? (Math.sin(now * 18) > 0 ? '#ff2040' : '#400010') : '#2a0a4a');
        });
      }
    }

    for (const b of this.barMeshes) b.pivot.rotation.y = -barAngle(b.def, t);
    if (this.lavaMat) this.lavaMat.uniforms.uTime!.value = now;
    for (const cl of this.clouds) {
      cl.position.x += dt * 0.6;
      if (cl.position.x > 150) cl.position.x = -150;
    }
    for (const f of this.floaters) {
      f.position.y = f.userData.base + Math.sin(now * 0.8 + f.userData.ph) * 1.2;
      f.rotation.y += dt * 0.3;
    }
  }

  /** Texto de aviso para la agenda de sectores (ronda 3). */
  sectorCountdown(t: number): number {
    if (!this.map.cyls.some((c) => c.sectors)) return -1;
    if (t < SECTOR_START) return SECTOR_START - t;
    const rel = (t - SECTOR_START) % SECTOR_PHASE;
    return rel < SECTOR_WARN ? SECTOR_WARN - rel : -1;
  }

  setShadows(on: boolean, size = 2048): void {
    this.sun.castShadow = on;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
    });
  }
}

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
