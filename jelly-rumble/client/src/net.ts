// Conexión con el servidor de juego. Si no hay servidor accesible (o se abre
// con ?offline), ejecuta la lógica de salas del servidor dentro del navegador
// para jugar contra bots sin conexión.
import { PROTOCOL_VERSION } from '../../shared/constants.ts';
import type { ClientMsg, ServerMsg } from '../../shared/protocol.ts';
import { Hub, type Session } from '../../server/hub.ts';
import { profile } from './settings.ts';

type Handler = (msg: ServerMsg) => void;
export type NetStatus = 'connecting' | 'open' | 'closed' | 'local';

export function serverUrl(): string {
  const q = new URLSearchParams(location.search).get('server');
  if (q) return q;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

export class Net {
  private ws: WebSocket | null = null;
  private handlers: Handler[] = [];
  private statusHandlers: ((s: NetStatus) => void)[] = [];
  id = -1;
  latency = 0;
  connected = false;
  local = false;
  private everOpened = false;
  private pingTimer: number | null = null;
  private retry = 0;
  private session: Session | null = null;

  connect(): void {
    if (new URLSearchParams(location.search).has('offline') || !location.host) {
      this.startLocal();
      return;
    }
    this.setStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(serverUrl());
    } catch {
      this.startLocal();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.everOpened = true;
      this.connected = true;
      this.send({ type: 'hello', v: PROTOCOL_VERSION, name: profile.name, look: profile.look });
      this.setStatus('open');
      this.pingTimer = window.setInterval(() => this.send({ type: 'ping', t: performance.now() }), 2000);
    };
    ws.onmessage = (ev) => {
      try {
        this.deliver(JSON.parse(String(ev.data)) as ServerMsg);
      } catch {
        /* mensaje mal formado */
      }
    };
    ws.onclose = () => {
      this.connected = false;
      if (this.pingTimer !== null) clearInterval(this.pingTimer);
      if (!this.everOpened) {
        // Nunca hubo servidor: pasar al modo sin conexión.
        this.startLocal();
        return;
      }
      this.setStatus('closed');
      const wait = Math.min(10000, 1000 * 2 ** this.retry++);
      setTimeout(() => this.connect(), wait);
    };
  }

  /** Arranca un servidor de juego dentro de la página (solo entrenamiento). */
  private startLocal(): void {
    if (this.local) return;
    this.local = true;
    this.connected = true;
    const hub = new Hub();
    this.session = hub.connect({
      send: (msg) => {
        const m = typeof msg === 'string' ? (JSON.parse(msg) as ServerMsg) : msg;
        queueMicrotask(() => this.deliver(m));
      },
    });
    window.setInterval(() => hub.pump(performance.now()), 1000 / 120);
    this.setStatus('local');
    this.send({ type: 'hello', v: PROTOCOL_VERSION, name: profile.name, look: profile.look });
  }

  private deliver(msg: ServerMsg): void {
    if (msg.type === 'welcome') this.id = msg.id;
    if (msg.type === 'pong') this.latency = Math.round(performance.now() - msg.t);
    for (const h of this.handlers) h(msg);
  }

  private setStatus(s: NetStatus): void {
    for (const h of this.statusHandlers) h(s);
  }

  onMessage(h: Handler): void {
    this.handlers.push(h);
  }

  onStatus(h: (s: NetStatus) => void): void {
    this.statusHandlers.push(h);
  }

  send(msg: ClientMsg): void {
    if (this.session) {
      const m = JSON.parse(JSON.stringify(msg)) as ClientMsg;
      queueMicrotask(() => this.session?.receive(m));
      return;
    }
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
}
