// Conexión WebSocket con el servidor multijugador: peticiones con
// respuesta (economía) y mensajes push (posiciones, chat...).
export const PROTOCOL = 1;
const KEY_STORE = "de-cero-a-millonario-player-key";
const URL_STORE = "de-cero-a-millonario-server";
const NAME_STORE = "de-cero-a-millonario-name";

const read = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // Sin almacenamiento: se usa solo en esta sesión.
  }
};

// Identificador secreto del jugador en este navegador (se guarda en local;
// el servidor solo almacena su hash).
export function playerKey() {
  let key = read(KEY_STORE);
  if (!key || !/^[a-f0-9]{32}$/.test(key)) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    key = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    write(KEY_STORE, key);
  }
  return key;
}

// Por defecto, el mismo servidor que sirve la página (si es http/https).
export function defaultServerUrl() {
  const saved = read(URL_STORE);
  if (saved) return saved;
  if (!/^https?:$/.test(location.protocol) || /claude/.test(location.host))
    return "";
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
}

export function saveServerUrl(url) {
  write(URL_STORE, url);
}

export function savedName() {
  return read(NAME_STORE) ?? "";
}

export function saveName(name) {
  write(NAME_STORE, name);
}

export class Net {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.handlers = new Map();
    this.pending = new Map();
    this.nextId = 1;
    this.status = "off";
    this.statusListeners = [];
  }

  setStatus(s, detail = "") {
    this.status = s;
    for (const fn of this.statusListeners) fn(s, detail);
  }

  onStatus(fn) {
    this.statusListeners.push(fn);
  }

  on(type, fn) {
    this.handlers.set(type, fn);
  }

  connect(timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(this.url);
      } catch (err) {
        this.setStatus("off", err.message);
        reject(new Error("Dirección de servidor no válida"));
        return;
      }
      this.ws = ws;
      this.setStatus("connecting");
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error("El servidor no responde"));
      }, timeoutMs);
      ws.onopen = () => {
        clearTimeout(timer);
        this.setStatus("on");
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error("No se pudo conectar con el servidor"));
      };
      ws.onclose = () => {
        clearTimeout(timer);
        for (const p of this.pending.values())
          p({ ok: false, error: "Se perdió la conexión" });
        this.pending.clear();
        if (this.ws === ws) this.setStatus("off");
        this.onClose?.();
      };
      ws.onmessage = (e) => this.receive(e.data);
    });
  }

  receive(data) {
    let m;
    try {
      m = JSON.parse(data);
    } catch {
      return;
    }
    if (m.t === "res" && this.pending.has(m.id)) {
      const resolve = this.pending.get(m.id);
      this.pending.delete(m.id);
      resolve(m);
      return;
    }
    this.handlers.get(m.t)?.(m);
  }

  send(t, payload = {}) {
    if (this.ws?.readyState === 1)
      this.ws.send(JSON.stringify({ t, ...payload }));
  }

  request(t, payload = {}, timeoutMs = 8000) {
    return new Promise((resolve) => {
      if (this.ws?.readyState !== 1) {
        resolve({ ok: false, error: "Sin conexión con el servidor" });
        return;
      }
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, error: "El servidor no respondió" });
      }, timeoutMs);
      this.pending.set(id, (m) => {
        clearTimeout(timer);
        resolve(m);
      });
      this.ws.send(JSON.stringify({ t, id, ...payload }));
    });
  }

  // Saludo inicial: espera el mensaje "welcome" o un error.
  hello(name, look) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("El servidor no respondió")),
        6000,
      );
      this.on("welcome", (m) => {
        clearTimeout(timer);
        resolve(m);
      });
      this.on("error", (m) => {
        clearTimeout(timer);
        reject(new Error(m.error));
      });
      this.send("hello", { v: PROTOCOL, key: playerKey(), name, look });
    });
  }

  close() {
    this.onClose = null;
    this.ws?.close();
  }
}
