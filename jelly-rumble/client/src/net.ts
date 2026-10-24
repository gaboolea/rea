// Conexión WebSocket con el servidor de juego.
import { PROTOCOL_VERSION } from '../../shared/constants.ts';
import type { ClientMsg, ServerMsg } from '../../shared/protocol.ts';
import { profile } from './settings.ts';

type Handler = (msg: ServerMsg) => void;

export function serverUrl(): string {
  const q = new URLSearchParams(location.search).get('server');
  if (q) return q;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

export class Net {
  private ws: WebSocket | null = null;
  private handlers: Handler[] = [];
  private statusHandlers: ((s: 'connecting' | 'open' | 'closed') => void)[] = [];
  id = -1;
  latency = 0;
  connected = false;
  private pingTimer: number | null = null;
  private retry = 0;

  connect(): void {
    this.setStatus('connecting');
    const ws = new WebSocket(serverUrl());
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.connected = true;
      this.send({ type: 'hello', v: PROTOCOL_VERSION, name: profile.name, look: profile.look });
      this.setStatus('open');
      this.pingTimer = window.setInterval(() => this.send({ type: 'ping', t: performance.now() }), 2000);
    };
    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMsg;
      } catch {
        return;
      }
      if (msg.type === 'welcome') this.id = msg.id;
      if (msg.type === 'pong') this.latency = Math.round(performance.now() - msg.t);
      for (const h of this.handlers) h(msg);
    };
    ws.onclose = () => {
      this.connected = false;
      if (this.pingTimer !== null) clearInterval(this.pingTimer);
      this.setStatus('closed');
      const wait = Math.min(10000, 1000 * 2 ** this.retry++);
      setTimeout(() => this.connect(), wait);
    };
  }

  private setStatus(s: 'connecting' | 'open' | 'closed'): void {
    for (const h of this.statusHandlers) h(s);
  }

  onMessage(h: Handler): void {
    this.handlers.push(h);
  }

  onStatus(h: (s: 'connecting' | 'open' | 'closed') => void): void {
    this.statusHandlers.push(h);
  }

  send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
}
