// Arranque del cliente: renderizador, menús, conexión y cambio entre el
// escenario del menú y la vista de partida.
import * as THREE from 'three';
import './style.css';
import { ACCESSORIES, ACCESSORY_NAMES, EYES, EYE_NAMES, FREE_ACCESSORIES, MAX_PLAYERS, PALETTE, sanitizeName } from '../../shared/constants.ts';
import { COSMETICS, COSMETIC_BY_ID, type CosmeticKind, type PublicProfile } from '../../shared/cosmetics.ts';
import { MAPS } from '../../shared/maps.ts';
import type { FinalResult, RoomInfo, RoundResult, Standing } from '../../shared/protocol.ts';
import { STATUS_OUT } from '../../shared/protocol.ts';
import { audio } from './audio.ts';
import { GameView } from './game.ts';
import { MenuScene } from './menuScene.ts';
import { Net } from './net.ts';
import { isTouchDevice } from './touch.ts';
import { options, profile, saveOptions, saveProfile } from './settings.ts';
import { $, banner, isShown, show, toast, wireButtonSounds } from './ui.ts';

const canvas = $('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Comprobar errores de shader obliga a esperar a cada compilación (bloquea el
// hilo principal): solo se hace en desarrollo.
renderer.debug.checkShaderErrors = import.meta.env.DEV;

// Resolución dinámica: la calidad fija el máximo y, si los fotogramas no
// llegan a tiempo, se reduce la resolución interna hasta recuperar fluidez.
let maxRatio = 1;
let curRatio = 1;
let fpsTime = 0;
let fpsFrames = 0;

function applyQuality(): void {
  renderer.shadowMap.enabled = options.quality !== 'low';
  maxRatio = Math.min(window.devicePixelRatio, options.quality === 'high' ? 2 : options.quality === 'medium' ? 1.25 : 1);
  curRatio = maxRatio;
  renderer.setPixelRatio(curRatio);
  game?.applyQuality();
  renderer.shadowMap.needsUpdate = true;
}

const net = new Net();
const menu = new MenuScene();
let game: GameView | null = null;
let room: RoomInfo | null = null;
let pendingTraining = false;
let currentProfile: PublicProfile | null = null;
let shopTab: CosmeticKind = 'color';
let optionsReturn: string[] = ['screen-menu'];

// ---------------------------------------------------------------- Pantallas

function goMenu(): void {
  game?.dispose();
  game = null;
  room = null;
  menu.setPreview(null);
  show('screen-menu');
  audio.playMusic(0);
}

function goGame(): void {
  if (!game) {
    game = new GameView(canvas, net, net.id, onPause);
    game.resize(window.innerWidth, window.innerHeight);
    if (room) game.setRoom(room);
    if (currentProfile) game.setOwned(currentProfile.owned);
    $('hud-help').classList.toggle('off', !options.showHelp);
  }
  if (!isShown('hud')) {
    show('hud');
    game.lock();
  }
}

function onPause(): void {
  if (!game || isShown('screen-round') || isShown('screen-final') || isShown('screen-options')) return;
  show('hud', 'screen-pause');
}

// ---------------------------------------------------------------- Acciones

const actions: Record<string, () => void> = {
  'open-play': () => { if (!net.connected) return toast('Conectando con el servidor…'); show('screen-play'); },
  'open-progress': () => { renderProgress(); show('screen-progress'); },
  'open-customize': () => { buildCustomize(); show('screen-customize'); menu.setPreview(profile.look); },
  'open-options': () => {
    optionsReturn = game ? ['hud', 'screen-pause'] : ['screen-menu'];
    loadOptionsUi();
    show(...(game ? ['hud', 'screen-options'] : ['screen-options']));
  },
  'close-options': () => { saveOptions(); show(...optionsReturn); },
  quit: () => {
    show('screen-quit');
    audio.stopMusic();
    window.close();
  },
  back: () => { menu.setPreview(null); show('screen-menu'); audio.playMusic(0); },
  quick: () => { goFullscreen(); net.send({ type: 'quick' }); },
  create: () => { goFullscreen(); net.send({ type: 'create' }); },
  join: () => {
    const code = ($('join-code') as HTMLInputElement).value.trim().toUpperCase();
    if (code.length !== 4) return toast('Escribe un código de 4 letras');
    net.send({ type: 'join', code });
  },
  training: () => { goFullscreen(); pendingTraining = true; net.send({ type: 'create' }); },
  'save-customize': () => {
    profile.name = sanitizeName(($('cust-name') as HTMLInputElement).value);
    saveProfile();
    net.send({ type: 'profile', name: profile.name, look: profile.look });
    menu.setPreview(null);
    show('screen-menu');
    toast('¡Personaje guardado!');
  },
  'copy-link': () => {
    if (!room) return;
    const url = new URL(location.href);
    url.search = '';
    const srv = new URLSearchParams(location.search).get('server');
    if (srv) url.searchParams.set('server', srv);
    url.searchParams.set('room', room.code);
    void navigator.clipboard?.writeText(url.toString()).then(() => toast('Enlace copiado'), () => toast(url.toString(), 6000));
  },
  'bots-minus': () => net.send({ type: 'bots', n: botCount() - 1 }),
  'bots-plus': () => net.send({ type: 'bots', n: botCount() + 1 }),
  start: () => net.send({ type: 'start' }),
  leave: () => { net.send({ type: 'leave' }); goMenu(); },
  resume: () => { goFullscreen(); show('hud'); game?.lock(); },
  again: () => { show('hud'); toast('Te quedas en la sala: la próxima partida empezará desde la sala de espera'); },
};

document.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!btn) return;
  const fn = actions[btn.dataset.action!];
  fn?.();
});
($('join-code') as HTMLInputElement).addEventListener('keydown', (e) => { if (e.key === 'Enter') actions.join!(); });

/** En móvil: pantalla completa y horizontal (si el navegador lo permite). */
function goFullscreen(): void {
  if (!isTouchDevice() || document.fullscreenElement) return;
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    const p = el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.();
    void Promise.resolve(p).then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape')).catch(() => {});
  } catch {
    /* sin pantalla completa (p. ej. dentro de un iframe) */
  }
}

function botCount(): number {
  return room?.players.filter((p) => p.bot).length ?? 0;
}

// ---------------------------------------------------------- Personalizar

function buildCustomize(): void {
  ($('cust-name') as HTMLInputElement).value = profile.name;
  const sw = $('cust-colors');
  sw.innerHTML = '';
  const ownedColors = COSMETICS.filter((c) => c.kind === 'color' && owns(c.id)).map((c) => c.value);
  for (const c of [...PALETTE, ...ownedColors]) {
    const b = document.createElement('button');
    b.className = `swatch${profile.look.color === c ? ' sel' : ''}`;
    b.style.background = c;
    b.title = c;
    b.onclick = () => { profile.look.color = c; buildCustomize(); menu.setPreview(profile.look); };
    sw.append(b);
  }
  const chips = (id: string, values: readonly string[], names: Record<string, string>, cur: string, set: (v: string) => void) => {
    const el = $(id);
    el.innerHTML = '';
    for (const v of values) {
      const b = document.createElement('button');
      b.className = `btn${cur === v ? ' active' : ''}`;
      b.textContent = names[v]!;
      b.onclick = () => { set(v); buildCustomize(); menu.setPreview(profile.look); };
      el.append(b);
    }
  };
  const accs = ACCESSORIES.filter((a) => FREE_ACCESSORIES.includes(a) || owns(`acc:${a}`));
  chips('cust-acc', accs, ACCESSORY_NAMES, profile.look.accessory, (v) => { profile.look.accessory = v as never; });
  chips('cust-eyes', EYES, EYE_NAMES, profile.look.eyes, (v) => { profile.look.eyes = v as never; });
}

// ---------------------------------------------------------------- Opciones

function loadOptionsUi(): void {
  ($('opt-master') as HTMLInputElement).value = String(options.master);
  ($('opt-music') as HTMLInputElement).value = String(options.music);
  ($('opt-sfx') as HTMLInputElement).value = String(options.sfx);
  ($('opt-sens') as HTMLInputElement).value = String(options.sensitivity);
  ($('opt-invert') as HTMLInputElement).checked = options.invertY;
  ($('opt-help') as HTMLInputElement).checked = options.showHelp;
  ($('opt-quality') as HTMLSelectElement).value = options.quality;
}

function bindOptions(): void {
  const num = (id: string, set: (v: number) => void) => $(id).addEventListener('input', (e) => { set(Number((e.target as HTMLInputElement).value)); audio.applyVolumes(); });
  num('opt-master', (v) => { options.master = v; });
  num('opt-music', (v) => { options.music = v; });
  num('opt-sfx', (v) => { options.sfx = v; audio.jump(); });
  num('opt-sens', (v) => { options.sensitivity = v; });
  $('opt-invert').addEventListener('change', (e) => { options.invertY = (e.target as HTMLInputElement).checked; });
  $('opt-help').addEventListener('change', (e) => { options.showHelp = (e.target as HTMLInputElement).checked; $('hud-help').classList.toggle('off', !options.showHelp); });
  $('opt-quality').addEventListener('change', (e) => { options.quality = (e.target as HTMLSelectElement).value as never; applyQuality(); });
}

// ---------------------------------------------------------------- Sala

function renderLobby(info: RoomInfo): void {
  const isHost = info.hostId === net.id;
  $('lobby-title').textContent = info.isPublic ? 'Sala pública' : 'Sala privada';
  $('lobby-code').textContent = info.code;
  document.querySelector('.panel.lobby')!.classList.toggle('is-host', isHost);
  $('lobby-bot-count').textContent = String(botCount());
  const list = $('lobby-players');
  list.innerHTML = '';
  for (const p of info.players) {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = p.look.color;
    li.append(dot, document.createTextNode(p.name));
    const tag = (cls: string, text: string) => { const t = document.createElement('span'); t.className = `tag ${cls}`; t.textContent = text; li.append(t); };
    if (p.bot) tag('bot', 'BOT');
    if (p.id === info.hostId) tag('host', 'ANFITRIÓN');
    if (p.id === net.id) tag('you', 'TÚ');
    if (p.wins > 0) tag('', `🏆${p.wins}`);
    list.append(li);
  }
  const humans = info.players.filter((p) => !p.bot).length;
  let status: string;
  if (info.phase === 'countdown') status = `¡La partida empieza en ${Math.ceil(info.phaseEndsIn)} s!`;
  else if (info.players.length < 2) status = `Esperando jugadores (${info.players.length}/${MAX_PLAYERS}). Comparte el código${isHost ? ' o añade bots para entrenar' : ''}.`;
  else if (info.isPublic) status = `${humans} jugadores conectados. ${isHost ? 'Puedes empezar ya o esperar a más gente.' : 'Esperando al anfitrión o a más jugadores…'}`;
  else status = isHost ? `${info.players.length} participantes. ¡Pulsa Empezar cuando estéis listos!` : 'Esperando a que el anfitrión empiece…';
  $('lobby-status').textContent = status;
  ($('screen-lobby').querySelector('[data-action="start"]') as HTMLButtonElement).disabled = info.players.length < 2;
}

function renderStandings(listId: string, standings: Standing[]): void {
  const ol = $(listId);
  ol.innerHTML = '';
  for (const s of standings) {
    const li = document.createElement('li');
    li.className = `${s.qualified ? '' : 'out'} ${s.id === net.id ? 'me' : ''}`;
    const look = room?.players.find((p) => p.id === s.id)?.look.color ?? '#ccc';
    const pos = document.createElement('span');
    pos.className = 'pos';
    pos.textContent = `${s.place}.`;
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = look;
    li.append(pos, dot, document.createTextNode(`${s.name}${s.bot ? ' 🤖' : ''}`));
    if (s.title) {
      const t = document.createElement('span');
      t.className = 'ttl';
      t.textContent = COSMETIC_BY_ID.get(s.title)?.value ?? '';
      li.append(t);
    }
    const st = document.createElement('span');
    st.className = 'st';
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = listId === 'final-list' ? (s.qualified ? '🏆 CAMPEÓN' : `${s.place}º`) : s.qualified ? 'PASA' : 'FUERA';
    const det = document.createElement('span');
    det.className = 'det';
    det.textContent = s.detail;
    st.append(badge, det);
    li.append(st);
    ol.append(li);
  }
}

// ---------------------------------------------------------- Progreso

function owns(id: string): boolean {
  return !!currentProfile?.owned.includes(id);
}

function equipped(c: (typeof COSMETICS)[number]): boolean {
  const l = profile.look;
  return (c.kind === 'color' && l.color === c.value) || (c.kind === 'acc' && l.accessory === c.value)
    || (c.kind === 'title' && l.title === c.id) || (c.kind === 'fx' && (l.fx ?? 'fx:confetti') === c.id);
}

function equip(c: (typeof COSMETICS)[number]): void {
  if (c.kind === 'color') profile.look.color = c.value;
  if (c.kind === 'acc') profile.look.accessory = c.value as never;
  if (c.kind === 'title') {
    if (profile.look.title === c.id) delete profile.look.title;
    else profile.look.title = c.id;
  }
  if (c.kind === 'fx') profile.look.fx = c.id;
  saveProfile();
  net.send({ type: 'profile', name: profile.name, look: profile.look });
  renderProgress();
}

function renderProgress(): void {
  const p = currentProfile;
  if (!p) {
    $('prog-storage').textContent = 'Conectando con el servidor para cargar tu perfil…';
    return;
  }
  $('prog-level').textContent = `Nivel ${p.level}`;
  ($('prog-xpfill') as HTMLElement).style.width = `${Math.min(100, (p.levelXp / Math.max(1, p.nextXp)) * 100)}%`;
  $('prog-xp').textContent = `${p.levelXp} / ${p.nextXp} XP`;
  $('prog-coins').textContent = `🪙 ${p.coins} monedas`;
  $('prog-storage').textContent = p.storage === 'server'
    ? 'Tu progreso se guarda en el servidor del juego, ligado a este navegador.'
    : p.storage === 'browser'
      ? 'Modo sin conexión: tu progreso se guarda solo en este navegador.'
      : 'Este navegador no permite guardar: el progreso se perderá al cerrar la página.';
  const st = p.stats;
  $('prog-stats').innerHTML = '';
  for (const [label, v] of [['Partidas', st.matches], ['Victorias', st.wins], ['Eliminaciones', st.kos], ['Rondas superadas', st.roundsCleared], ['Núcleos entregados', st.coresDelivered], ['Mejor puesto', st.bestPlace ? `${st.bestPlace}º` : '—']] as const) {
    const d = document.createElement('div');
    const b = document.createElement('b');
    b.textContent = String(v);
    d.append(b, document.createTextNode(label));
    $('prog-stats').append(d);
  }
  for (const b of $('prog-tabs').querySelectorAll<HTMLElement>('[data-tab]')) b.classList.toggle('active', b.dataset.tab === shopTab);
  const shop = $('prog-shop');
  shop.innerHTML = '';
  for (const c of COSMETICS.filter((x) => x.kind === shopTab)) {
    const it = document.createElement('div');
    const have = owns(c.id);
    it.className = `item${have && equipped(c) ? ' equipped' : ''}${!have && p.level < c.level ? ' locked' : ''}`;
    const ico = document.createElement('span');
    if (c.kind === 'color') { ico.className = 'dot'; ico.style.background = c.value; }
    else { ico.className = 'ico'; ico.textContent = c.kind === 'emote' ? c.value : c.kind === 'fx' ? '🎉' : c.kind === 'title' ? '🏷️' : '🎩'; }
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.append(document.createTextNode(c.name));
    const small = document.createElement('small');
    const btn = document.createElement('button');
    btn.className = 'btn';
    if (have) {
      if (c.kind === 'emote') {
        const idx = p.owned.filter((id) => id.startsWith('emote:')).indexOf(c.id);
        small.textContent = `Tecla ${idx + 1} · T aleatorio`;
        btn.textContent = 'Probar';
        btn.onclick = () => { if (game) game.emote(idx); else toast(`${c.value} se usa en partida con la tecla ${idx + 1}`); };
      } else {
        small.textContent = equipped(c) ? 'Equipado' : 'Desbloqueado';
        btn.textContent = equipped(c) ? (c.kind === 'title' ? 'Quitar' : 'Puesto') : 'Equipar';
        btn.disabled = equipped(c) && c.kind !== 'title';
        btn.onclick = () => equip(c);
      }
    } else {
      small.textContent = c.level > p.level ? `🔒 Nivel ${c.level} · ${c.price} 🪙` : `${c.price} 🪙`;
      btn.textContent = 'Comprar';
      btn.disabled = c.level > p.level || p.coins < c.price;
      btn.onclick = () => net.send({ type: 'buy', item: c.id });
    }
    meta.append(small);
    it.append(ico, meta, btn);
    shop.append(it);
  }
}

$('prog-tabs').addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
  if (!t) return;
  shopTab = t.dataset.tab as CosmeticKind;
  renderProgress();
});

// ---------------------------------------------------------------- Red

net.onStatus((s) => {
  const el = $('conn-status');
  el.className = `conn ${s === 'open' || s === 'local' ? 'ok' : s === 'closed' ? 'bad' : ''}`;
  document.body.classList.toggle('offline', s === 'local');
  el.querySelector('span')!.textContent = s === 'open' ? 'Conectado al servidor' : s === 'local' ? 'Modo sin conexión: entrena contra bots' : s === 'closed' ? 'Sin conexión: reintentando…' : 'Conectando…';
  if (s === 'closed' && (game || room)) {
    toast('Se perdió la conexión con el servidor');
    goMenu();
  }
});

net.onMessage((msg) => {
  switch (msg.type) {
    case 'welcome': {
      const code = new URLSearchParams(location.search).get('room');
      if (code) net.send({ type: 'join', code });
      break;
    }
    case 'error':
      toast(msg.msg);
      break;
    case 'left':
      break;
    case 'room': {
      const first = !room;
      room = msg;
      game?.setRoom(msg);
      if (pendingTraining && first && msg.hostId === net.id) {
        pendingTraining = false;
        net.send({ type: 'bots', n: 5 });
        setTimeout(() => net.send({ type: 'start' }), 400);
      }
      if (msg.phase === 'lobby' || msg.phase === 'countdown') {
        if (game) {
          game.dispose();
          game = null;
        }
        renderLobby(msg);
        if (!isShown('screen-lobby')) {
          menu.setPreview(null);
          show('screen-lobby');
          audio.playMusic(0);
        }
      } else {
        goGame();
        if (msg.phase === 'intro' && isShown('screen-round')) show('hud');
      }
      break;
    }
    case 's':
      if (game) game.onSnapshot(msg);
      break;
    case 'roundEnd':
      showRoundEnd(msg);
      break;
    case 'final':
      showFinal(msg);
      break;
    case 'profile':
      currentProfile = msg.profile;
      game?.setOwned(msg.profile.owned);
      if (isShown('screen-progress')) renderProgress();
      if (isShown('screen-customize')) buildCustomize();
      break;
    case 'reward': {
      currentProfile = msg.profile;
      game?.setOwned(msg.profile.owned);
      const r = $('final-reward');
      r.innerHTML = '';
      const head = document.createElement('b');
      head.textContent = `+${msg.reward.coins} 🪙 · +${msg.reward.xp} XP${msg.levelAfter > msg.levelBefore ? ` · ¡Subes a nivel ${msg.levelAfter}!` : ''}`;
      r.append(head);
      for (const line of msg.reward.lines) {
        const d = document.createElement('div');
        d.textContent = line;
        r.append(d);
      }
      const where = document.createElement('div');
      where.className = 'hint';
      where.textContent = msg.profile.storage === 'server' ? 'Guardado en el servidor.' : msg.profile.storage === 'browser' ? 'Guardado en este navegador.' : 'No se puede guardar en este navegador.';
      r.append(where);
      r.classList.add('on');
      if (msg.levelAfter > msg.levelBefore) audio.qualify();
      break;
    }
    case 'pong':
      break;
  }
});

function showRoundEnd(r: RoundResult): void {
  if (!game) goGame();
  $('round-title').textContent = `Fin de la ronda ${r.round}`;
  $('round-reason').textContent = r.reason;
  renderStandings('round-list', r.standings);
  $('round-title').textContent = `Fin de la ronda ${r.round}: ${r.name}`;
  $('round-next').textContent = r.next;
  show('hud', 'screen-round');
  if (document.pointerLockElement) document.exitPointerLock();
  const me = r.standings.find((s) => s.id === net.id);
  if (me && me.status !== STATUS_OUT) audio.qualify();
}

function showFinal(f: FinalResult): void {
  if (!game) goGame();
  const won = f.winnerId === net.id;
  $('final-title').textContent = won ? '¡ERES EL CAMPEÓN!' : '¡TENEMOS CAMPEÓN!';
  $('final-winner').textContent = f.winnerName;
  $('final-reason').textContent = f.reason;
  renderStandings('final-list', f.standings);
  $('final-reward').classList.remove('on');
  game?.setWinner(f.winnerId, f.winnerFx);
  // Primero la celebración en 3D (cámara al campeón y confeti); luego el resumen.
  show('hud');
  banner(won ? '¡ERES EL CAMPEÓN!' : `¡${f.winnerName} GANA!`, f.reason, 3200);
  window.setTimeout(() => { if (game && room?.phase === 'final') show('hud', 'screen-final'); }, 3500);
  if (document.pointerLockElement) document.exitPointerLock();
  if (won) audio.victory(); else audio.defeat();
}

// ---------------------------------------------------------------- Bucle

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  menu.resize(w, h);
  game?.resize(w, h);
}
window.addEventListener('resize', resize);

let last = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fpsTime += dt;
  fpsFrames++;
  if (fpsTime >= 1.5) {
    const fps = fpsFrames / fpsTime;
    const before = curRatio;
    if (fps < 50) curRatio = Math.max(0.7, curRatio * 0.85);
    else if (fps > 57) curRatio = Math.min(maxRatio, curRatio + 0.1);
    if (Math.abs(before - curRatio) > 0.01) renderer.setPixelRatio(curRatio);
    fpsTime = 0;
    fpsFrames = 0;
  }
  if (game) game.frame(dt, renderer);
  else menu.frame(dt, renderer);
  requestAnimationFrame(loop);
}

if (isTouchDevice()) document.body.classList.add('touch');
wireButtonSounds();
bindOptions();
applyQuality();
resize();
show('screen-menu');
audio.playMusic(0);
net.connect();
requestAnimationFrame(loop);
