// Arranque del cliente: renderizador, menús, conexión y cambio entre el
// escenario del menú y la vista de partida.
import * as THREE from 'three';
import './style.css';
import { ACCESSORIES, ACCESSORY_NAMES, EYES, EYE_NAMES, MAX_PLAYERS, PALETTE, sanitizeName } from '../../shared/constants.ts';
import { MAPS } from '../../shared/maps.ts';
import type { FinalResult, RoomInfo, RoundResult, Standing } from '../../shared/protocol.ts';
import { STATUS_OUT } from '../../shared/protocol.ts';
import { audio } from './audio.ts';
import { GameView } from './game.ts';
import { MenuScene } from './menuScene.ts';
import { Net } from './net.ts';
import { options, profile, saveOptions, saveProfile } from './settings.ts';
import { $, isShown, show, toast, wireButtonSounds } from './ui.ts';

const canvas = $('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

function applyQuality(): void {
  renderer.shadowMap.enabled = options.quality !== 'low';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, options.quality === 'high' ? 2 : options.quality === 'medium' ? 1.25 : 1));
  game?.applyQuality();
  renderer.shadowMap.needsUpdate = true;
}

const net = new Net();
const menu = new MenuScene();
let game: GameView | null = null;
let room: RoomInfo | null = null;
let pendingTraining = false;
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
  'open-play': () => { if (!net.connected) return toast('Sin conexión con el servidor. Reintentando…'); show('screen-play'); },
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
  quick: () => net.send({ type: 'quick' }),
  create: () => net.send({ type: 'create' }),
  join: () => {
    const code = ($('join-code') as HTMLInputElement).value.trim().toUpperCase();
    if (code.length !== 4) return toast('Escribe un código de 4 letras');
    net.send({ type: 'join', code });
  },
  training: () => { pendingTraining = true; net.send({ type: 'create' }); },
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
  resume: () => { show('hud'); game?.lock(); },
  again: () => { show('hud'); toast('Te quedas en la sala: la próxima partida empezará desde la sala de espera'); },
};

document.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!btn) return;
  const fn = actions[btn.dataset.action!];
  fn?.();
});
($('join-code') as HTMLInputElement).addEventListener('keydown', (e) => { if (e.key === 'Enter') actions.join!(); });

function botCount(): number {
  return room?.players.filter((p) => p.bot).length ?? 0;
}

// ---------------------------------------------------------- Personalizar

function buildCustomize(): void {
  ($('cust-name') as HTMLInputElement).value = profile.name;
  const sw = $('cust-colors');
  sw.innerHTML = '';
  for (const c of PALETTE) {
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
  chips('cust-acc', ACCESSORIES, ACCESSORY_NAMES, profile.look.accessory, (v) => { profile.look.accessory = v as never; });
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

function renderStandings(listId: string, standings: Standing[], round: number): void {
  const ol = $(listId);
  ol.innerHTML = '';
  for (const s of standings) {
    const li = document.createElement('li');
    const out = s.status === STATUS_OUT && s.outRound > 0;
    li.className = `${out ? 'out' : ''} ${s.id === net.id ? 'me' : ''}`;
    const look = room?.players.find((p) => p.id === s.id)?.look.color ?? '#ccc';
    li.innerHTML = `<span class="pos">${s.place}.</span><span class="dot" style="background:${look}"></span>`;
    li.append(document.createTextNode(`${s.name}${s.bot ? ' 🤖' : ''}`));
    const st = document.createElement('span');
    st.className = 'st';
    st.textContent = `${out ? (s.outRound === round ? 'eliminado esta ronda' : `eliminado en ronda ${s.outRound}`) : 'sigue en pie ✔'} · ${s.kos} KO`;
    li.append(st);
    ol.append(li);
  }
}

// ---------------------------------------------------------------- Red

net.onStatus((s) => {
  const el = $('conn-status');
  el.className = `conn ${s === 'open' ? 'ok' : s === 'closed' ? 'bad' : ''}`;
  el.querySelector('span')!.textContent = s === 'open' ? 'Conectado al servidor' : s === 'closed' ? 'Sin conexión: reintentando…' : 'Conectando…';
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
    case 'pong':
      break;
  }
});

function showRoundEnd(r: RoundResult): void {
  if (!game) goGame();
  $('round-title').textContent = `Fin de la ronda ${r.round}`;
  $('round-reason').textContent = r.reason;
  renderStandings('round-list', r.standings, r.round);
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
  renderStandings('final-list', f.standings, MAPS.length);
  show('hud', 'screen-final');
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
  if (game) game.frame(dt, renderer);
  else menu.frame(dt, renderer);
  requestAnimationFrame(loop);
}

wireButtonSounds();
bindOptions();
applyQuality();
resize();
show('screen-menu');
audio.playMusic(0);
net.connect();
requestAnimationFrame(loop);
