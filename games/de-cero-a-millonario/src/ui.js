// Interfaz HTML superpuesta: HUD compacto, indicador de interacción,
// avisos y paneles (proveedor, gestión, mapa, inventario, opciones, menú).
import {
  PRODUCTS,
  STAGES,
  UPGRADES,
  STAFF,
  SHOP_ITEMS,
  BOX_UNITS,
  DAY_SECONDS,
  CATEGORIES,
  CART_CAPACITY,
  VEHICLES,
  FURNITURE,
  FURNITURE_SECTIONS,
  GYM,
  GOALS,
  TOW_PRICE,
  HOME,
  AUTOMATION,
  IDLE,
  upgradeUpkeep,
  upgradeDesc,
} from "./config.js";
import { isSmall } from "./rides.js";
import { productIcon } from "./icons.js";
import { upgradeApplies } from "./business.js";
import { currentMission, missionProgress } from "./missions.js";
import { WORLD } from "./config.js";
import { drawCity, drawIcon } from "./mapdraw.js";
import { findItem, COLORS, SLOTS, CLOTH_COLORS } from "./look.js";
import {
  Net,
  defaultServerUrl,
  saveServerUrl,
  savedName,
  saveName,
} from "./net.js";

const ONLINE_KEY = "de-cero-a-millonario-online";
const escapeHtml = (t) =>
  String(t ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

const $ = (id) => document.getElementById(id);
const money = (n) => {
  const abs = Math.abs(n).toLocaleString("es", {
    minimumFractionDigits: n % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `−$${abs}` : `$${abs}`;
};
const hex = (c) => `#${c.toString(16).padStart(6, "0")}`;
const SLOT_NAMES = Object.fromEntries(
  SLOTS.map((s) => [s.id, `${s.icon} ${s.name}`]),
);
const STAFF_ICONS = { reponedor: "📦", cajero: "🧾", barista: "☕" };
const clock = (sec) =>
  `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

export class UI {
  constructor(game) {
    this.game = game;
    this.hudTimer = 0;
    this.panel = null;
    this.selectedBiz = "tienda";
    this.tab = "resumen";
    const click = (id, fn) =>
      ($(id).onclick = () => {
        game.audio.sfx("click");
        fn();
      });
    click("btn-map", () => this.openMap());
    click("btn-shops", () => this.openShops());
    click("btn-deco", () => this.openDecor());
    click("auto-chip", () => this.openAutomation());
    click("btn-manage", () => this.openManagement());
    click("btn-upgrade", () => this.openUpgrade());
    click("btn-menu", () => this.openMenu());
    click("btn-bag", () => this.openInventory());
    click("btn-sound", () => game.toggleMute());
    click("objective", () => $("objective").classList.toggle("collapsed"));
    $("panel-close").onclick = () => this.close();
    $("tut-skip").onclick = () => game.tutorial.skip();
    click("btn-wave", () => game.online?.emote("wave"));
    click("btn-cheer", () => game.online?.emote("cheer"));
    click("btn-dance", () => game.online?.emote("dance"));
    click("btn-chat", () => this.openChat(true));
    click("btn-rank", () => this.openLeaderboard());
    $("chat-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("chat-input");
      const text = input.value.trim();
      if (text && game.online && game.settings.chat) {
        game.online.chat(text);
        this.chatLine(text, false, "Tú");
      }
      input.value = "";
      input.blur();
    });
    $("chat-input").addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.target.blur();
        $("chat").hidden = true;
      }
    });
    $("panel").addEventListener("click", (e) => {
      if (e.target.id === "panel") this.close();
    });
    // Sonido suave al pasar por botones de los menús.
    document.addEventListener("pointerover", (e) => {
      if (e.target.closest?.(".tbtn, #panel-body button, #wd-panel button"))
        game.audio.sfx("hover");
    });
    window.addEventListener(
      "keydown",
      (e) => {
        if (
          this.panel &&
          (e.key === "Escape" ||
            (e.key.toLowerCase() === "g" && this.panel === "manage") ||
            (e.key.toLowerCase() === "m" && this.panel === "map") ||
            (e.key.toLowerCase() === "i" && this.panel === "bag"))
        ) {
          this.close();
          e.preventDefault();
          game.input.pressed.clear();
        }
      },
      true,
    );
    if (game.input.isTouch) document.body.classList.add("touch");
  }

  get panelOpen() {
    return !!this.panel;
  }

  showHud(on) {
    $("hud").hidden = !on;
    document.body.classList.toggle("playing", on);
  }

  refreshHud(force = false) {
    this.hudTimer -= 1 / 60;
    if (!force && this.hudTimer > 0) return;
    this.hudTimer = 0.2;
    const g = this.game;
    const s = g.state;
    $("money").textContent = money(Math.floor(s.money));
    $("money").classList.toggle("negative", s.money < 0);
    let today = 0;
    for (const b of Object.values(g.businesses))
      if (b.owned) today += b.today.profit;
    $("today").textContent =
      `${today >= 0 ? "+" : ""}${money(Math.round(today))} hoy`;
    $("stage").textContent = STAGES[g.stageIndex()].name;
    const hour = 7 + (s.clock / DAY_SECONDS) * 15;
    const hh = Math.floor(hour);
    const mm = Math.floor(((hour - hh) * 60) / 10) * 10;
    $("clock").textContent =
      `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    $("clock-icon").textContent = hour < 17 ? "☀️" : hour < 19.5 ? "🌇" : "🌙";
    $("day").textContent = `Día ${s.day}`;
    const m = currentMission(g);
    $("objective-text").textContent = m
      ? m.text
      : "¡Eres millonario! Sigue creciendo.";
    $("objective-hint").textContent = m?.hint ?? "";
    $("objective-reward").textContent = m?.reward ? `+${money(m.reward)}` : "";
    const prog = missionProgress(g);
    $("objective-bar").hidden = !prog;
    if (prog) {
      $("objective-bar").firstElementChild.style.width =
        `${Math.min(100, (prog[0] / prog[1]) * 100)}%`;
      $("objective-count").textContent =
        prog[1] >= 1000 ? "" : `${Math.floor(prog[0])}/${prog[1]}`;
    } else $("objective-count").textContent = "";
    this.refreshChips();
    const carry = s.carried;
    $("carry").hidden = !carry.length;
    // Agrupado por producto (cajas), y aviso si hay cajas sin pagar.
    const groups = {};
    for (const b of carry) groups[b.product] = (groups[b.product] ?? 0) + 1;
    const unpaid = carry.some((b) => b.unpaid);
    $("carry").innerHTML =
      `${g.state.cart ? "🛒" : "📦"} <b>${carry.length}/${g.carryCapacity()}</b> ${Object.entries(
        groups,
      )
        .map(
          ([id, n]) =>
            `<span style="--c:${hex(PRODUCTS[id].color)}">${PRODUCTS[id].name}${n > 1 ? ` ×${n}` : ""}</span>`,
        )
        .join("")}${unpaid ? ` <em class="unpaid">🧾 sin pagar</em>` : ""}`;
    $("btn-sound").textContent = g.settings.muted ? "🔇" : "🔊";
    const on = g.online;
    $("net-pill").hidden = !on;
    $("social").hidden = !on;
    if (on) {
      const st = on.status();
      $("net-pill").className =
        `pill net-pill ${st.status === "on" ? "" : st.status === "connecting" ? "wait" : "off"}`;
      $("net-text").textContent =
        st.status === "on"
          ? `${st.name} · ${st.online}/4 · ${st.code}`
          : "Reconectando…";
    }
    // Botones táctiles según el vehículo: V para el pequeño, sin salto en
    // coche o en dos ruedas (el monopatín sí salta).
    const ride = g.player.ride;
    $("btn-ride").hidden =
      !g.rides.selectedSmall() || (ride && ride.def.kind === "car");
    $("btn-jump").hidden = !!ride && ride.def.kind !== "board";
    $("btn-run").hidden = !!ride;
    $("btn-deco").hidden = !g.atHome() || !!g.decorator.active;
  }

  refreshChips() {
    const ev = this.game.events;
    const a = ev.active;
    const chip = $("event-chip");
    chip.hidden = !a;
    if (a) {
      let text = a.title;
      if (a.type === "sale") text += ` · ${a.sold}/${a.goal} vendidos`;
      chip.querySelector(".chip-icon").textContent = a.icon;
      chip.querySelector(".chip-text").textContent =
        `${text} · ${clock(Math.max(0, a.time))}`;
      chip.querySelector("i").style.width = `${(a.time / a.total) * 100}%`;
    }
    const g = this.game;
    const left = (g.buff?.until ?? 0) - g.elapsed;
    $("buff-chip").hidden = left <= 0;
    if (left > 0) {
      $("buff-chip").querySelector(".chip-text").textContent =
        `En forma: +${Math.round((GYM.boost - 1) * 100)}% velocidad · ${clock(left)}`;
      $("buff-chip").querySelector("i").style.width =
        `${(left / GYM.seconds) * 100}%`;
    }
    // Tienda automática: ganancia por minuto y caja fuerte.
    const auto = g.automation;
    const lvl = auto.level();
    const vault = g.state.auto.vault ?? 0;
    $("auto-chip").hidden = (lvl === 0 && vault <= 0) || g.tutorial.active();
    if (!$("auto-chip").hidden)
      $("auto-chip").querySelector(".chip-text").textContent =
        `+${money(Math.round(auto.perMinute()))}/min${vault > 0 ? ` · 💰 ${money(Math.round(vault))}` : ""}`;
    // Botón «Mejorar»: siempre a mano; brilla cuando hay algo pagable.
    const up = $("btn-upgrade");
    const here =
      Object.values(g.businesses).find(
        (b) => b.owned && b.building.contains(g.player.pos.x, g.player.pos.z),
      ) ?? g.businesses.tienda;
    up.hidden = g.tutorial.active() || !here?.owned;
    if (!up.hidden) {
      const step = this.nextStep(here);
      const ready = !!step && g.state.money >= step.cost;
      up.classList.toggle("ready", ready);
      up.querySelector("small").textContent = step
        ? `${step.icon} ${step.title}`
        : "Todo mejorado";
      // La primera vez que se puede pagar algo, se avisa una sola vez.
      if (ready && !g.state.tutorial.mejorar && !this.upgradeTipShown) {
        this.upgradeTipShown = true;
        this.toast(
          `💡 Ya puedes mejorar tu tienda: pulsa ⬆️ MEJORAR${this.game.input.isTouch ? "" : " (U)"}`,
          "event",
        );
      }
    }
    const sp = g.surprises.hud();
    const sc = $("surprise-chip");
    sc.hidden = !sp;
    if (sp) {
      sc.querySelector(".chip-icon").textContent = sp.icon;
      sc.querySelector(".chip-text").textContent =
        `${sp.text} · ${clock(Math.max(0, sp.left))}`;
      sc.querySelector("i").style.width = `${(sp.left / sp.total) * 100}%`;
    }
    const enc = ev.hudEncargo();
    const e = $("encargo-chip");
    e.hidden = !enc;
    if (enc) {
      e.querySelector(".chip-text").textContent =
        `${enc.title} · ${clock(Math.max(0, enc.time))}`;
      e.querySelector("i").style.width = `${(enc.time / enc.total) * 100}%`;
    }
  }

  setPrompt(label, touch) {
    const el = $("prompt");
    if (!label) {
      el.hidden = true;
      $("btn-interact").classList.remove("ready");
      return;
    }
    el.hidden = false;
    el.classList.toggle("disabled", !label.enabled);
    el.innerHTML = label.enabled
      ? `<kbd>${touch ? "✋" : "E"}</kbd> ${label.text}`
      : label.text;
    $("btn-interact").classList.toggle("ready", label.enabled);
  }

  toast(text, kind = "") {
    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    el.textContent = text;
    $("toasts").appendChild(el);
    const life = kind === "event" ? 4200 : 2600;
    setTimeout(() => el.classList.add("out"), life);
    setTimeout(() => el.remove(), life + 500);
    while ($("toasts").children.length > 3) $("toasts").firstChild.remove();
  }

  // "+$12" que sube desde el contador de dinero.
  floatMoney(amount) {
    if (!amount) return;
    const el = document.createElement("div");
    el.className = `money-float ${amount < 0 ? "neg" : ""}`;
    el.textContent = `${amount > 0 ? "+" : "−"}${money(Math.abs(Math.round(amount * 100) / 100))}`;
    $("money-floats").appendChild(el);
    setTimeout(() => el.remove(), 1400);
    $("hud-money").classList.remove("bump");
    void $("hud-money").offsetWidth;
    $("hud-money").classList.add("bump");
  }

  // Monedas que vuelan hacia tu dinero (ventas lejos, cobrar la caja).
  coinBurst(n = 3) {
    const target = $("hud-money").getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const c = document.createElement("div");
      c.className = "coin-fly";
      c.textContent = "🪙";
      const x = window.innerWidth * (0.4 + Math.random() * 0.2);
      const y = window.innerHeight * (0.55 + Math.random() * 0.15);
      c.style.left = `${x}px`;
      c.style.top = `${y}px`;
      c.style.setProperty("--dx", `${target.left + 18 - x}px`);
      c.style.setProperty("--dy", `${target.top + 14 - y}px`);
      c.style.animationDelay = `${i * 0.08}s`;
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 1100 + i * 80);
    }
  }

  missionComplete(m, next) {
    const el = $("mission-done");
    el.innerHTML = `<b>✓ ${m.text}</b>${m.reward ? `<em>+${money(m.reward)}</em>` : ""}${next ? `<small>Siguiente: ${next.text}</small>` : ""}`;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
  }

  // ---------- Paneles ----------

  // opts.side: panel estrecho a un lado (para ver el mundo detrás, p. ej.
  // la prenda puesta en el personaje o el vehículo que se examina).
  open(name, title, html, opts = {}) {
    $("panel").classList.toggle("side", !!opts.side);
    const body = $("panel-body");
    const keepScroll = this.panel === name ? body.scrollTop : 0;
    this.panel = name;
    $("panel").hidden = false;
    $("panel-title").textContent = title;
    body.innerHTML = html;
    body.scrollTop = keepScroll;
    this.game.input.keys.clear();
    this.game.input.joy = { x: 0, y: 0, active: false };
  }

  close() {
    const was = this.panel;
    this.panel = null;
    $("panel").hidden = true;
    this.game.examine = null;
    if (was && this.onClose) {
      const fn = this.onClose;
      this.onClose = null;
      fn();
    }
  }

  bind(selector, fn) {
    $("panel-body")
      .querySelectorAll(selector)
      .forEach(
        (el) =>
          (el.onclick = () => {
            this.game.audio.sfx("click");
            fn(el.dataset, el);
          }),
      );
  }

  // Ficha de una prenda en la tienda de ropa. La prenda ya se ve puesta en
  // el personaje (vista previa); aquí se elige color, se prueba o se compra.
  openGarment(shop, slot, id) {
    const g = this.game;
    const item = findItem(slot, id);
    const t = shop.trial;
    const st = shop.status(slot, id);
    const colors = item.colors
      ? (item.palette ?? CLOTH_COLORS)
          .map(
            (c) =>
              `<button class="swatch ${t.color === c ? "on" : ""}" data-color="${c}" title="${c}" style="background:${hex(COLORS[c])}"></button>`,
          )
          .join("")
      : "";
    const price = item.price ? money(item.price) : "Gratis";
    let buy;
    if (st.owned) buy = `<button class="primary" data-wear>PONÉRMELA</button>`;
    else if (st.locked)
      buy = `<button class="primary" disabled>🔒 ${st.locked}</button>`;
    else
      buy = `<button class="primary" data-buy ${st.missing ? "disabled" : ""}>COMPRAR · ${price}</button>`;
    this.open(
      "garment",
      item.name,
      `<div class="garment">
        <div class="garment-price">${st.owned ? `<span class="tag good">Ya es tuya</span>` : price}</div>
        <p class="hint">${SLOT_NAMES[slot] ?? ""} · ${item.colors ? "elige el color (sin coste)" : "modelo único"}</p>
        ${colors ? `<div class="swatches">${colors}</div>` : ""}
        ${st.missing && !st.owned && !st.locked ? `<p class="bad missing">Te faltan ${money(Math.round(st.missing * 100) / 100)}</p>` : ""}
        <div class="order-actions">
          <button class="ghost" data-cancel>CANCELAR</button>
          <button data-try>PROBAR</button>
          ${buy}
        </div>
        <p class="hint small">Tienes ${money(Math.floor(g.state.money))}. Al probarla puedes pasear por la tienda con ella puesta.</p>
      </div>`,
      { side: true },
    );
    // Cerrar con la X equivale a cancelar.
    this.onClose = () => shop.revert();
    this.bind("[data-color]", (d) => {
      shop.setColor(d.color);
      this.openGarment(shop, slot, id);
    });
    this.bind("[data-cancel]", () => this.close());
    this.bind("[data-try]", () => {
      this.onClose = null;
      this.close();
      this.toast(
        "👕 Pruébatela por la tienda: si sales sin comprarla, te la quitas",
      );
    });
    this.bind("[data-buy]", async () => {
      if (await shop.buy()) {
        this.onClose = null;
        this.close();
      } else this.openGarment(shop, slot, id);
    });
    this.bind("[data-wear]", () => {
      shop.wear();
      this.onClose = null;
      this.close();
    });
  }

  // Ficha de un vehículo del concesionario: datos, prueba en la pista y
  // compra (con lo que falta si no alcanza el dinero).
  openVehicle(rides, id, back) {
    const g = this.game;
    const def = VEHICLES[id];
    const st = rides.status(id);
    const kind = {
      board: "Monopatín",
      bike: "Bicicleta",
      scooter: "Scooter",
      moto: "Moto",
      car: "Coche",
    }[def.kind];
    const kmh = Math.round(def.speed * 3.6);
    let buy;
    if (st.owned) buy = `<button class="primary" disabled>YA ES TUYO</button>`;
    else if (st.locked)
      buy = `<button class="primary" disabled>🔒 ${st.locked}</button>`;
    else
      buy = `<button class="primary" data-buy ${st.missing ? "disabled" : ""}>COMPRAR · ${money(def.price)}</button>`;
    const how =
      def.kind === "car"
        ? "Se conduce con acelerador, freno y dirección. Queda aparcado donde lo dejes."
        : def.kind === "moto"
          ? "Se aparca donde la dejes; sube con E."
          : `Se lleva encima: súbete con ${g.input.isTouch ? "🛴" : "V"} en cualquier calle.`;
    this.open(
      "vehicle",
      def.name,
      `<div class="garment">
        <div class="garment-price">${st.owned ? `<span class="tag good">Ya es tuyo</span>` : money(def.price)}</div>
        <p>${def.desc}</p>
        <div class="stats"><span>🏷️ ${kind}</span><span>⚡ ${kmh} km/h</span><span>${"★".repeat(Math.max(1, Math.round(def.accel / 3)))} aceleración</span></div>
        <p class="hint">${how}</p>
        ${st.missing && !st.owned && !st.locked ? `<p class="bad missing">Te faltan ${money(Math.round(st.missing * 100) / 100)}</p>` : ""}
        <div class="order-actions">
          <button class="ghost" data-cancel>CANCELAR</button>
          ${id === "lujo" ? "" : `<button data-try>PROBAR EN LA PISTA</button>`}
          ${buy}
        </div>
        <p class="hint small">Tienes ${money(Math.floor(g.state.money))}.</p>
      </div>`,
      { side: true },
    );
    this.bind("[data-cancel]", () => this.close());
    this.bind("[data-try]", () => {
      this.close();
      rides.startTest(id, { ...back, h: g.player.heading });
    });
    this.bind("[data-buy]", async () => {
      if (await rides.buy(id)) this.close();
      else this.openVehicle(rides, id, back);
    });
  }

  // Ficha de un mueble o aparato expuesto en tienda.
  openFurniture(shop, id) {
    const g = this.game;
    const def = FURNITURE[id];
    const st = shop.status(id);
    const use = {
      sit: "Puedes sentarte en él.",
      bed: g.online ? "Descansa en ella." : "Duerme hasta la mañana siguiente.",
      lamp: "Se enciende y apaga e ilumina la habitación.",
      tv: "Se enciende y pone dibujos animados.",
      pc: "Gestiona tus negocios desde casa.",
      music: "Pon música y baila.",
    }[def.use];
    const where = def.wall
      ? "Se cuelga en una pared."
      : def.flat
        ? "Va en el suelo; se puede poner debajo de otros muebles."
        : `Ocupa ${def.size[0]} × ${def.size[1]} m.`;
    const buy = st.locked
      ? `<button class="primary" disabled>🔒 ${st.locked}</button>`
      : `<button class="primary" data-buy ${st.missing ? "disabled" : ""}>COMPRAR · ${money(def.price)}</button>`;
    this.open(
      "furniture",
      def.name,
      `<div class="garment">
        <div class="garment-price">${money(def.price)}</div>
        <div class="stats"><span>🏷️ ${FURNITURE_SECTIONS[def.section]}</span>${st.have ? `<span>📦 Tienes ${st.have}</span>` : ""}</div>
        <p>${use ? `${use} ` : ""}${where}</p>
        <p class="hint">Lo que compras va a tu inventario: colócalo en tu casa con 🛋️ Decorar.</p>
        ${st.missing && !st.locked ? `<p class="bad missing">Te faltan ${money(Math.round(st.missing * 100) / 100)}</p>` : ""}
        <div class="order-actions">
          <button class="ghost" data-cancel>CANCELAR</button>
          ${buy}
        </div>
        <p class="hint small">Tienes ${money(Math.floor(g.state.money))}.</p>
      </div>`,
      { side: true },
    );
    this.bind("[data-cancel]", () => this.close());
    this.bind("[data-buy]", async () => {
      await shop.buy(id);
      this.openFurniture(shop, id);
    });
  }

  // Decorar la casa: muebles guardados (para colocar) y los que ya están
  // en casa (para moverlos o guardarlos), y permiso de visitas.
  openDecor() {
    const g = this.game;
    const home = g.home;
    const stored = Object.keys(FURNITURE).filter((id) => home.stored(id) > 0);
    const placed = home.state.layout;
    const row = (icon, name, sub, btn) =>
      `<div class="row"><span class="chip-icon">${icon}</span><div class="grow"><b>${name}</b><small>${sub}</small></div>${btn}</div>`;
    this.open(
      "decor",
      "🛋️ Decorar mi casa",
      `<h3>Para colocar</h3>
      <div class="list">${
        stored.length
          ? stored
              .map((id) =>
                row(
                  "📦",
                  FURNITURE[id].name,
                  `${FURNITURE_SECTIONS[FURNITURE[id].section]} · tienes ${home.stored(id)} guardado/s`,
                  `<button data-place="${id}">Colocar</button>`,
                ),
              )
              .join("")
          : `<p class="hint">No tienes muebles guardados. Cómpralos en <b>Muebles y Decoración</b> o en <b>Tecnología</b> (zona comercial).</p>`
      }</div>
      <h3>En tu casa</h3>
      <div class="list">${placed
        .map((it, i) =>
          row(
            "🏠",
            FURNITURE[it.f].name,
            FURNITURE_SECTIONS[FURNITURE[it.f].section],
            `<button data-move="${i}">Mover</button>`,
          ),
        )
        .join("")}</div>
      <h3>Visitas</h3>
      <label class="field"><input type="checkbox" id="home-open" ${home.state.open ? "checked" : ""}> Dejar que otros jugadores entren en mi casa (modo online)</label>
      <p class="hint">Mueve con ${g.input.isTouch ? "el joystick" : "WASD"}, gira con ${g.input.isTouch ? "⟳" : "R"} y coloca con ${g.input.isTouch ? "✔" : "E"}. Los muebles no pueden tapar puertas ni dejar una habitación sin paso.</p>`,
    );
    this.bind("[data-place]", (d) => {
      this.close();
      g.decorator.start({ id: d.place });
    });
    this.bind("[data-move]", (d) => {
      this.close();
      g.decorator.start({ index: Number(d.move) });
    });
    $("home-open").onchange = (e) => {
      home.state.open = e.target.checked;
      g.save();
      g.online?.sendHome?.();
    };
  }

  // Precio de una caja en el Mayorista (descuentos y ofertas incluidos).
  boxPrice(id) {
    const g = this.game;
    const p = PRODUCTS[id];
    return (
      p.cost *
      (p.boxUnits ?? BOX_UNITS) *
      g.supplierDiscount() *
      g.events.discount(id)
    );
  }

  // Estantería del Mayorista: se cogen cajas al carro (sin pagar).
  openShelf(cat) {
    const g = this.game;
    this.shelfCat = cat;
    const types = g.ownedTypes();
    const stage = g.stageIndex();
    const items = Object.entries(PRODUCTS).filter(
      ([, p]) => !p.crafted && p.cat === cat,
    );
    const unpaid = g.unpaid();
    const due =
      Math.round(
        unpaid.reduce((a, b) => a + this.boxPrice(b.product), 0) * 100,
      ) / 100;
    const cards = items
      .map(([id, p]) => {
        const units = p.boxUnits ?? BOX_UNITS;
        const sale = g.events.discount(id);
        const price = this.boxPrice(id);
        const inCart = unpaid.filter((b) => b.product === id).length;
        const stock = g.shelfStock(id);
        const locked = (p.stage ?? 0) > stage;
        const needs = !types.has(p.kind)
          ? "Necesitas la cafetería"
          : p.cold
            ? "Necesita refrigerador"
            : p.frozen
              ? "Necesita congelador"
              : p.fresh
                ? "Puesto de frutas"
                : p.ingredient
                  ? "Para la máquina de café"
                  : "";
        const blocked = locked || !types.has(p.kind);
        return `<div class="pcard ${blocked ? "locked" : ""} ${inCart ? "picked" : ""}">
          <img src="${productIcon(id)}" alt="">
          <div class="pinfo"><b>${p.name}</b>${sale < 1 ? ` <span class="tag good">−40%</span>` : ""}
            <small>${money(Math.round(price * 100) / 100)} / caja de ${units} · ${money(Math.round((price / units) * 100) / 100)} / ud.</small>
            <small>${locked ? `🔒 Etapa ${STAGES[p.stage].name}` : `En la estantería: ${stock} cajas`}${needs ? ` · ${needs}` : ""}</small></div>
          ${blocked ? "" : `<div class="stepper"><button data-dec="${id}" ${inCart ? "" : "disabled"}>−</button><span>${inCart}</span><button data-inc="${id}" ${stock ? "" : "disabled"}>+</button></div>`}
        </div>`;
      })
      .join("");
    const cap = g.carryCapacity();
    const have = Math.floor(g.state.money * 100) / 100;
    const missing = Math.max(0, Math.round((due - have) * 100) / 100);
    this.open(
      "supplier",
      `Estantería · ${CATEGORIES[cat].name}`,
      `
      <p class="hint">Pulsa <b>+</b> para meter cajas en tu ${g.state.cart ? "carro" : "mano (toma un carro en la entrada para llevar hasta " + CART_CAPACITY + ")"}. Se pagan en la <b>CAJA</b> antes de salir.</p>
      <div class="pgrid">${cards}</div>
      <div class="sticky order-box">
        <div class="total">${g.state.cart ? "🛒 Carro" : "🤲 En mano"}: <b>${g.state.carried.length}/${cap}</b> cajas · Por pagar: <b>${money(due)}</b> · Tienes ${money(have)}</div>
        ${missing > 0 ? `<p class="bad missing">Te faltan ${money(missing)}: devuelve alguna caja</p>` : ""}
        <div class="order-actions"><button class="ghost" data-close>SEGUIR COMPRANDO</button><button class="primary" data-pay ${unpaid.length ? "" : "disabled"}>IR A PAGAR ➜</button></div>
      </div>`,
    );
    this.bind("[data-inc]", (d) => {
      g.takeFromShelf(d.inc);
      this.openShelf(cat);
    });
    this.bind("[data-dec]", (d) => {
      g.returnToShelf(d.dec);
      this.openShelf(cat);
    });
    this.bind("[data-close]", () => this.close());
    this.bind("[data-pay]", () => {
      this.close();
      g.guide.setDestination({
        ...g.world.supplierCounter,
        label: "CAJA · pagar",
      });
      this.toast("🧾 Lleva tu compra a la CAJA para pagar");
    });
  }

  // CAJA del Mayorista: se paga lo que llevas sin pagar. Opcionalmente, el
  // camión (o tu furgoneta) lo lleva a uno de tus negocios.
  openCheckout() {
    const g = this.game;
    const unpaid = g.unpaid();
    const owned = Object.values(g.businesses).filter(
      (b) => b.owned && !b.remote,
    );
    const counts = {};
    for (const b of unpaid) counts[b.product] = (counts[b.product] ?? 0) + 1;
    const deliver = owned.some((b) => b.id === this.deliverTo)
      ? this.deliverTo
      : "";
    const van = g.state.items.furgoneta;
    const fee = van ? 0 : 4;
    let total = 0;
    const lines = Object.entries(counts).map(([id, n]) => {
      const price = this.boxPrice(id) * n;
      total += price;
      return `<div class="order-line"><img src="${productIcon(id)}" alt=""><span>${n} × ${PRODUCTS[id].name}</span><b>${money(Math.round(price * 100) / 100)}</b><button class="mini" data-dec="${id}" title="Devolver una">−</button></div>`;
    });
    if (deliver && total) total += fee;
    total = Math.round(total * 100) / 100;
    const have = Math.floor(g.state.money * 100) / 100;
    const missing = Math.max(0, Math.round((total - have) * 100) / 100);
    const tools = g.state.items.carretilla
      ? ""
      : `<div class="row"><span class="chip" style="background:#9aa7b0"></span><div class="grow"><b>${SHOP_ITEMS.carretilla.name}</b><small>${SHOP_ITEMS.carretilla.desc}</small></div><button data-item="carretilla">${money(SHOP_ITEMS.carretilla.price)}</button></div>`;
    const body = unpaid.length
      ? `<div class="order-lines">${lines.join("")}</div>
        <label class="field">Entrega: <select id="deliver"><option value="">Me lo llevo yo (gratis)</option>${owned
          .map(
            (b) =>
              `<option value="${b.id}" ${deliver === b.id ? "selected" : ""}>${van ? "Tu furgoneta" : "Camión de reparto"} → ${b.name} (${fee ? `+$${fee}` : "gratis"})</option>`,
          )
          .join("")}</select></label>
        <div class="total">Total: <b>${money(total)}</b> · Tienes ${money(have)}</div>
        ${missing > 0 ? `<p class="bad missing">Te faltan ${money(missing)}: devuelve alguna caja con −</p>` : ""}
        <div class="order-actions"><button class="ghost" data-close>VOLVER</button><button class="primary" data-buy ${total && !missing ? "" : "disabled"}>PAGAR ${money(total)}</button></div>`
      : `<p class="hint">Tu ${g.state.cart ? "carro" : "mano"} está vacío. Ve a las <b>estanterías</b> del fondo, elige tus cajas y vuelve aquí para pagar.</p>
        <div class="order-actions"><button class="primary" data-close>ENTENDIDO</button></div>`;
    this.open(
      "supplier",
      "🧾 Caja del Mayorista",
      `${body}${tools ? `<h3>Herramientas</h3><div class="list">${tools}</div>` : ""}`,
    );
    this.bind("[data-dec]", (d) => {
      g.returnToShelf(d.dec);
      this.openCheckout();
    });
    const sel = $("deliver");
    if (sel)
      sel.onchange = () => {
        this.deliverTo = sel.value;
        this.openCheckout();
      };
    this.bind("[data-item]", async (d) => {
      await g.buyItem(d.item);
      this.openCheckout();
    });
    this.bind("[data-close]", () => this.close());
    this.bind("[data-buy]", async () => {
      if (await g.buySupplies(counts, deliver || null)) this.close();
      else this.openCheckout();
    });
  }

  openManagement(bizId) {
    const g = this.game;
    const owned = Object.values(g.businesses).filter((b) => b.owned);
    if (bizId) this.selectedBiz = bizId;
    if (!g.businesses[this.selectedBiz]?.owned) this.selectedBiz = owned[0].id;
    const b = g.businesses[this.selectedBiz];
    if (this.tab === "auto" && b.id !== "tienda") this.tab = "resumen";
    const tabs = [
      ...(b.id === "tienda" ? [["auto", "⚙️ Automática"]] : []),
      ["mejoras", "⬆️ Mejoras"],
      ["personal", "👥 Personal"],
      ["precios", "💲 Precios"],
      ["resumen", "📋 Resumen"],
    ];
    const bizTabs =
      owned.length > 1
        ? `<div class="tabs">${owned.map((o) => `<button data-biz="${o.id}" class="${o.id === b.id ? "on" : ""}">${o.name}</button>`).join("")}</div>`
        : "";
    const html = `${bizTabs}${this.nextStepHtml(b)}<div class="tabs small">${tabs.map(([id, t]) => `<button data-tab="${id}" class="${this.tab === id ? "on" : ""}">${t}</button>`).join("")}</div>
      <div class="tab-body">${this[`tab_${this.tab}`](b)}</div>`;
    this.open("manage", `Gestión · ${b.name}`, html);
    this.bindNextStep(b, () => this.openManagement());
    this.bind("[data-biz]", (d) => this.openManagement(d.biz));
    this.bind("[data-tab]", (d) => {
      this.tab = d.tab;
      this.openManagement();
    });
    this.bind("[data-price]", (d) => {
      const p = d.price;
      const step = Number(d.step);
      b.prices[p] = Math.max(0.1, Math.round((b.prices[p] + step) * 10) / 10);
      g.state.stats.priceChanges++;
      this.openManagement();
    });
    this.bind("[data-upgrade]", async (d) => {
      await g.buyUpgrade(b.id, d.upgrade);
      this.openManagement();
    });
    this.bind("[data-hire]", async (d) => {
      await g.hire(b.id, d.hire);
      this.openManagement();
    });
    this.bind("[data-fire]", async (d) => {
      await g.fire(b.id, d.fire);
      this.openManagement();
    });
    this.bind("[data-threshold]", (d) => {
      g.state.auto.threshold = Number(d.threshold);
      g.save();
      this.openManagement();
    });
    this.bind("[data-open]", () => {
      b.openToPlayers = !b.openToPlayers;
      g.save();
      this.openManagement();
    });
  }

  tab_resumen(b) {
    const g = this.game;
    const s = g.state;
    const shelves = b.displays
      .map((d) => {
        const disp = d.display;
        const label = disp.product ? PRODUCTS[disp.product].name : "vacía";
        const pct = Math.round((disp.stock / disp.capacity) * 100);
        return `<div class="bar"><span>${label}</span><i style="width:${pct}%;background:${disp.product ? hex(PRODUCTS[disp.product].color) : "#ccc"}"></i><em>${disp.stock}/${disp.capacity}</em></div>`;
      })
      .join("");
    const storage =
      Object.entries(b.storage)
        .filter(([, n]) => n > 0)
        .map(([p, n]) => `${PRODUCTS[p].name}: ${n}`)
        .join(" · ") || "vacío";
    const rep = Math.round(b.reputation);
    const report = s.lastReport
      ? `<h3>Informe del día ${s.lastReport.day}</h3><p>Gastos fijos y salarios: <b>${money(s.lastReport.expenses)}</b></p>`
      : "";
    const share = g.online
      ? `<div class="row"><div class="grow"><b>Ventas a otros jugadores</b><small>${b.openToPlayers ? "Los demás pueden comprar en tus estanterías al precio que fijes." : "Tus estanterías no venden a otros jugadores."}</small></div><button data-open>${b.openToPlayers ? "Cerrar" : "Abrir"}</button></div>`
      : "";
    return `
      <div class="stats">
        <div><small>Ventas hoy</small><b>${b.today.sales}</b></div>
        <div><small>Ingresos hoy</small><b>${money(Math.round(b.today.revenue * 100) / 100)}</b></div>
        <div><small>Ganancia bruta hoy</small><b>${money(Math.round(b.today.profit * 100) / 100)}</b></div>
        <div><small>Reputación</small><b>${rep}/100</b></div>
        <div><small>Gastos diarios</small><b>${money(b.def.rent + b.salaries() + upgradeUpkeep(b.upgrades))}</b></div>
        <div><small>Clientes en el local</small><b>${b.customers.length}</b></div>
      </div>
      ${share}
      <h3>Exposición</h3>${shelves || "<p>Sin muebles.</p>"}
      <h3>Almacén (${b.storageUnits()}/${b.storageCap()})</h3><p>${storage}</p>
      ${b.machine ? `<p>Máquina de café: <b>${b.machine.granos}</b> granos</p>` : ""}
      <h3>Tu empresa</h3>
      <p>Ventas totales: <b>${money(Math.round(s.stats.revenue))}</b> · Ganancia bruta total: <b>${money(Math.round(s.stats.grossProfit))}</b> · Gastos totales: <b>${money(Math.round(s.stats.expenses))}</b></p>
      <p>Patrimonio: <b>${money(Math.round(g.netWorth()))}</b></p>
      ${report}`;
  }

  tab_precios(b) {
    const rows = b
      .catalog()
      .map((p) => {
        const prod = PRODUCTS[p];
        const price = b.prices[p];
        const unitCost = p === "cafe" ? PRODUCTS.granos.cost : prod.cost;
        const margin = price - unitCost;
        const will = Math.round(b.willingness(p) * 100);
        const mood = will >= 95 ? "good" : will >= 60 ? "warn" : "bad";
        return `<div class="row"><span class="chip" style="background:${hex(prod.color)}"></span>
        <div class="grow"><b>${prod.name}</b><small>Coste ${money(unitCost)} · margen ${money(Math.round(margin * 100) / 100)} · <span class="${mood}">clientes dispuestos ${will}%</span></small></div>
        <div class="stepper"><button data-price="${p}" data-step="-0.1">−</button><span>${money(price)}</span><button data-price="${p}" data-step="0.1">+</button></div></div>`;
      })
      .join("");
    return `<p class="hint">Precios altos = más margen pero menos clientes. Precio de referencia en el Mayorista.</p><div class="list">${rows}</div>`;
  }

  tab_mejoras(b) {
    const g = this.game;
    const stage = g.stageIndex();
    const rows = Object.entries(UPGRADES)
      .filter(([id]) => upgradeApplies(b, id))
      .map(([id, u]) => {
        const owned = b.upgrades.has(id);
        const needs = (u.needs ?? []).filter((n) => !b.upgrades.has(n));
        const lockedStage = (u.stage ?? 0) > stage;
        let btn = `<button data-upgrade="${id}" ${g.state.money < u.price ? "class=poor" : ""}>${money(u.price)}</button>`;
        if (owned) btn = `<span class="tag good">Instalada</span>`;
        else if (needs.length)
          btn = `<span class="tag">Requiere ${UPGRADES[needs[0]].name}</span>`;
        else if (
          (u.staff ?? []).some((r) => !b.employees.some((e) => e.role === r))
        )
          btn = `<span class="tag">Requiere reponedor y cajero</span>`;
        else if (lockedStage)
          btn = `<span class="tag">Etapa ${STAGES[u.stage].name}</span>`;
        return `<div class="row ${owned ? "done" : ""}"><div class="grow"><b>${u.name}</b><small>${upgradeDesc(u)}</small></div>${btn}</div>`;
      })
      .join("");
    return `<p class="hint">Cada mejora se compra una vez y se ve en tu local. Las grises necesitan otra antes o una etapa más alta.</p><div class="list">${rows}</div>`;
  }

  // Lo siguiente que conviene hacer en un negocio: en la tienda, el paso
  // de la ruta automática; en los demás, el personal que falta y después
  // la mejora más barata disponible. null si no queda nada a su alcance.
  nextStep(b) {
    const g = this.game;
    const stage = g.stageIndex();
    const hasRole = (r) => b.employees.some((e) => e.role === r);
    const canHire = (r) =>
      (STAFF[r].stage ?? 0) <= stage && b.employees.length < 4;
    const canBuy = (id) => {
      const u = UPGRADES[id];
      return (
        upgradeApplies(b, id) &&
        !b.upgrades.has(id) &&
        (u.stage ?? 0) <= stage &&
        (u.needs ?? []).every((n) => b.upgrades.has(n)) &&
        (u.staff ?? []).every(hasRole)
      );
    };
    const hire = (r) => ({
      kind: "hire",
      id: r,
      icon: STAFF_ICONS[r] ?? "👤",
      title: `Contrata un/a ${STAFF[r].name.toLowerCase()}`,
      desc: STAFF[r].desc,
      cost: STAFF[r].salary,
      label: `CONTRATAR · ${money(STAFF[r].salary)}/día`,
    });
    const buy = (id) => ({
      kind: "upgrade",
      id,
      icon: "⬆️",
      title: UPGRADES[id].name,
      desc: upgradeDesc(UPGRADES[id]),
      cost: UPGRADES[id].price,
      label: `COMPRAR · ${money(UPGRADES[id].price)}`,
    });
    if (b.id === "tienda") {
      const step = AUTOMATION[g.automation.level(b)];
      if (step?.staff && canHire(step.staff)) return hire(step.staff);
      if (step?.upgrade && canBuy(step.upgrade)) return buy(step.upgrade);
      const id = step?.upgrades?.find(canBuy);
      if (id) return buy(id);
    } else {
      const role = b.def.staff.find((r) => !hasRole(r) && canHire(r));
      if (role) return hire(role);
    }
    const ids = Object.keys(UPGRADES)
      .filter(canBuy)
      .sort((x, y) => UPGRADES[x].price - UPGRADES[y].price);
    return ids.length ? buy(ids[0]) : null;
  }

  // En la tienda, el paso de la ruta automática que aún espera etapa.
  lockedRouteStep(b) {
    if (b.id !== "tienda") return "";
    const g = this.game;
    const step = AUTOMATION[g.automation.level(b)];
    const req = step?.staff
      ? STAFF[step.staff].stage
      : step?.upgrade
        ? UPGRADES[step.upgrade].stage
        : 0;
    if (!step || (req ?? 0) <= g.stageIndex()) return "";
    const st = STAGES[req];
    return `<small class="ns-lock">🔒 Después: ${step.icon} ${step.name}, al llegar a la etapa ${st.name}${st.revenue ? ` (${money(st.revenue)} en ventas)` : ""}.</small>`;
  }

  // Tarjeta grande con el siguiente paso y un solo botón.
  nextStepHtml(b) {
    const step = this.nextStep(b);
    if (!step)
      return `<div class="next-step done"><span class="ns-icon">🏆</span><div class="grow"><small>TU NEGOCIO</small><b>¡No hay más mejoras disponibles por ahora!</b><small>Sube de etapa vendiendo más para desbloquear otras.</small>${this.lockedRouteStep(b)}</div></div>`;
    const missing = Math.max(0, step.cost - this.game.state.money);
    const why =
      step.kind === "hire"
        ? "Los empleados trabajan solos: el primer día se paga al contratar."
        : "Se instala al momento en tu local.";
    return `<div class="next-step ${missing ? "" : "ready"}"><span class="ns-icon">${step.icon}</span><div class="grow"><small>👉 SIGUIENTE PASO PARA MEJORAR</small><b>${step.title}</b><small>${step.desc} ${why}</small>${missing ? `<small class="bad">Te faltan ${money(Math.ceil(missing * 100) / 100)}: vende un poco más y vuelve.</small>` : ""}${this.lockedRouteStep(b)}</div><button class="primary" data-next ${missing ? "disabled" : ""}>${step.label}</button></div>`;
  }

  bindNextStep(b, reopen) {
    this.bind("[data-next]", async () => {
      const step = this.nextStep(b);
      if (!step) return;
      if (step.kind === "hire") await this.game.hire(b.id, step.id);
      else await this.game.buyUpgrade(b.id, step.id);
      reopen();
    });
  }

  // Botón «Mejorar»: el negocio en el que estás (o tu tienda), en la
  // pestaña que explica qué hacer.
  openUpgrade(bizId) {
    const g = this.game;
    const p = g.player.pos;
    const owned = Object.values(g.businesses).filter((b) => b.owned);
    if (!owned.length) return;
    const b =
      g.businesses[bizId] ??
      owned.find((o) => o.building.contains(p.x, p.z)) ??
      g.businesses.tienda ??
      owned[0];
    this.tab = b.id === "tienda" ? "auto" : "personal";
    g.state.tutorial.mejorar = true;
    this.openManagement(b.id);
  }

  // Ruta de la tienda automática: cinco pasos en orden.
  automationHtml() {
    const g = this.game;
    const b = g.businesses.tienda;
    const auto = g.automation;
    const lvl = auto.level();
    const stage = g.stageIndex();
    const vault = g.state.auto.vault ?? 0;
    const hasRole = (r) => b.employees.some((e) => e.role === r);
    const buyBtn = (id) => {
      const u = UPGRADES[id];
      if (b.upgrades.has(id)) return `<span class="tag good">✓</span>`;
      if ((u.stage ?? 0) > stage)
        return `<span class="tag">Etapa ${STAGES[u.stage].name}</span>`;
      const need = (u.needs ?? []).find((n) => !b.upgrades.has(n));
      if (need) return `<span class="tag">Antes: ${UPGRADES[need].name}</span>`;
      return `<button data-upgrade="${id}" ${g.state.money < u.price ? "class=poor" : ""}>${money(u.price)}</button>`;
    };
    const rows = AUTOMATION.map((step, i) => {
      const done = i < lvl;
      const next = i === lvl;
      let action = "";
      if (done) action = `<span class="tag good">✓ Listo</span>`;
      else if (!next) action = `<span class="tag">🔒 Paso ${i}</span>`;
      else if (step.staff) {
        const st = STAFF[step.staff];
        action =
          (st.stage ?? 0) > stage
            ? `<span class="tag">Etapa ${STAGES[st.stage].name}</span>`
            : `<button data-hire="${step.staff}">Contratar · ${money(st.salary)}/día</button>`;
      } else if (step.upgrade) action = buyBtn(step.upgrade);
      let extra = "";
      if (step.upgrade === "camion" && b.upgrades.has("camion"))
        extra = `<div class="auto-opts">Sale a comprar cuando el almacén baja del ${[
          0.2, 0.4, 0.6,
        ]
          .map(
            (t) =>
              `<button data-threshold="${t}" class="${g.state.auto.threshold === t ? "on" : ""}">${t * 100}%</button>`,
          )
          .join("")}</div>`;
      if (step.upgrades && (next || done))
        extra = `<div class="list sub">${step.upgrades
          .map(
            (id) =>
              `<div class="row"><div class="grow"><b>${UPGRADES[id].name}</b><small>${upgradeDesc(UPGRADES[id])}</small></div>${buyBtn(id)}</div>`,
          )
          .join("")}</div>`;
      if (step.staff && done && !hasRole(step.staff)) action = "";
      return `<div class="row auto-step ${done ? "done" : next ? "next" : "locked"}"><span class="chip-icon">${step.icon}</span><div class="grow"><b>${i + 1}. ${step.name}</b><small>${step.desc}</small>${extra}</div>${step.upgrades ? "" : action}</div>`;
    }).join("");
    return `<div class="stats"><div><small>Automatización</small><b>${lvl}/${AUTOMATION.length}</b></div><div><small>Ganancia ahora</small><b>${money(Math.round(auto.perMinute()))}/min</b></div><div><small>Caja fuerte</small><b>${money(Math.round(vault))}</b></div></div>
      <p class="hint">${lvl >= 2 ? `Mientras no juegas, tu tienda guarda hasta ${IDLE.capMinutes[lvl] / 60} h de ganancias en la caja fuerte (junto al almacén).` : "Con reponedor y cajero, tu tienda vende sola mientras paseas, conduces o juegas con amigos."} Siempre puedes seguir haciéndolo a mano.</p>
      <div class="list">${rows}</div>`;
  }

  openAutomation() {
    this.open("auto", "⚙️ Tienda automática", this.automationHtml());
    this.bindAutomation(() => this.openAutomation());
  }

  bindAutomation(reopen) {
    const g = this.game;
    this.bind("[data-hire]", async (d) => {
      await g.hire("tienda", d.hire);
      reopen();
    });
    this.bind("[data-upgrade]", async (d) => {
      await g.buyUpgrade("tienda", d.upgrade);
      reopen();
    });
    this.bind("[data-threshold]", (d) => {
      g.state.auto.threshold = Number(d.threshold);
      g.save();
      reopen();
    });
  }

  // Al acabar el tutorial: presentación de la automatización.
  openAutomationIntro() {
    this.open(
      "auto-intro",
      "🎉 ¡Tu tienda ya funciona!",
      `<div class="auto-intro">
        <div class="big">🏪➡️🤖💰</div>
        <p><b>Ya sabes cómo funciona tu tienda. Ahora haz que trabaje por ti.</b></p>
        <p class="hint">Contrata un reponedor y un cajero, compra un camión y una cinta… y tu tienda venderá sola mientras paseas, conduces o juegas con amigos.</p>
        <p class="hint">Cuando quieras mejorar, pulsa el botón amarillo <b>⬆️ MEJORAR</b> (debajo del mapa) o el cartel amarillo junto a la puerta de tu tienda: siempre te dice el siguiente paso.</p>
        <div class="order-actions">
          <button class="ghost" data-act="later">SEGUIR JUGANDO</button>
          <button class="primary" data-act="auto">VER TIENDA AUTOMÁTICA</button>
        </div>
      </div>`,
    );
    this.bind("[data-act]", (d) => {
      if (d.act === "auto") this.openAutomation();
      else this.close();
    });
  }

  tab_auto() {
    return this.automationHtml();
  }

  tab_personal(b) {
    const g = this.game;
    const stage = g.stageIndex();
    const rows = b.def.staff
      .map((role) => {
        const st = STAFF[role];
        const count = b.employees.filter((e) => e.role === role).length;
        const locked = (st.stage ?? 0) > stage;
        return `<div class="row"><span class="chip-icon">${STAFF_ICONS[role] ?? "👤"}</span><div class="grow"><b>${st.name} × ${count}</b><small>${st.desc} Salario: ${money(st.salary)}/día.</small></div>
        ${locked ? `<span class="tag">Etapa ${STAGES[st.stage].name}</span>` : `<button data-hire="${role}">Contratar</button>`}
        ${count ? `<button class="ghost" data-fire="${role}">Despedir</button>` : ""}</div>`;
      })
      .join("");
    return `<p class="hint">Pulsa <b>Contratar</b> y el empleado empieza al momento en tu local. Cobran su salario cada día; tú sigues decidiendo precios y mejoras.</p><div class="list">${rows}</div>`;
  }

  openDealer() {
    const g = this.game;
    const stage = g.stageIndex();
    const rows = ["scooter", "furgoneta", "casa"]
      .map((id) => {
        const it = SHOP_ITEMS[id] ?? VEHICLES[id];
        let btn = `<button data-item="${id}">${money(it.price)}</button>`;
        if (g.state.items[id]) btn = `<span class="tag good">Tuyo</span>`;
        else if ((it.stage ?? 0) > stage)
          btn = `<span class="tag">Etapa ${STAGES[it.stage].name}</span>`;
        return `<div class="row"><div class="grow"><b>${it.name}</b><small>${it.desc}</small></div>${btn}</div>`;
      })
      .join("");
    this.open(
      "dealer",
      "Concesionario e Inmobiliaria",
      `<div class="list">${rows}</div><p class="hint">Más vehículos (monopatín, bici, moto, coches) en la tienda VEHÍCULOS de la zona comercial.</p>`,
    );
    this.bind("[data-item]", async (d) => {
      if (VEHICLES[d.item]) await g.rides.buy(d.item);
      else await g.buyItem(d.item);
      this.openDealer();
    });
  }

  // «¿Dónde comprar?»: cada tienda con lo que vende, la distancia y un
  // botón que marca la ruta hasta su puerta.
  openShops() {
    const g = this.game;
    const p = g.player.pos;
    const entries = g.wayfinding.entries();
    const groups = [...new Set(entries.map((e) => e.group))];
    const locked = (e) => e.poi === "lujo" && !g.state.unlocked?.financiero;
    this.open(
      "shops",
      "🛍️ ¿Dónde comprar?",
      `<p class="hint">Busca el cartel flotante de cada tienda o pulsa <b>Llévame</b> y sigue la flecha.</p>
      ${groups
        .map(
          (grp) =>
            `<h3>${grp}</h3><div class="list">${entries
              .filter((e) => e.group === grp)
              .map((e) => {
                const d = Math.round(Math.hypot(e.at.x - p.x, e.at.z - p.z));
                return `<div class="row shop-row"><span class="shop-icon" style="background:${e.color}">${e.icon}</span>
                <div class="grow"><b>${e.name}</b><small>${e.sells}</small><small>${locked(e) ? "🔒 Abre con el distrito financiero" : `📍 a ${d} m`}</small></div>
                <button data-go="${e.poi}">Llévame</button></div>`;
              })
              .join("")}</div>`,
        )
        .join("")}`,
    );
    this.bind("[data-go]", (d) => {
      const e = entries.find((x) => x.poi === d.go);
      g.guide.setDestination({ ...e.at, label: e.name, building: e.building });
      this.close();
      this.toast(`🧭 Ruta marcada: ${e.icon} ${e.name}`);
    });
  }

  // Mapa de toda la ciudad con sus zonas y una lista de destinos: al
  // elegir uno se marca la ruta por las calles.
  openMap() {
    const g = this.game;
    const pois = g.world.pois.filter((p) => !p.hidden);
    const dests = [];
    const shop = g.guide.ownShop();
    if (shop) dests.push({ id: "_shop", name: "Mi tienda", icon: "🏪" });
    if (g.state.home?.owned)
      dests.push({ id: "_home", name: "Mi casa", icon: "🏡" });
    for (const p of pois) dests.push(p);
    this.open(
      "map",
      "Mapa de la ciudad",
      `<div class="map-wrap"><canvas id="map-canvas" width="760" height="620"></canvas>
        <div class="map-dests"><b>Ir a…</b>${dests
          .map(
            (d) =>
              `<button data-dest="${d.id}">${d.icon} ${d.name}${d.locked && !g.state.unlocked?.financiero ? " 🔒" : ""}</button>`,
          )
          .join("")}</div></div>
      <p class="hint">● Tú · ★ Destino · Verde: tuyo · Amarillo: en venta · Rosa: tiendas</p>`,
    );
    this.drawMap($("map-canvas"));
    this.bind("[data-dest]", (d) => {
      let at;
      let label;
      let building = null;
      if (d.dest === "_shop") {
        at = shop.doorPoint(1.2);
        label = "Mi tienda";
        building = shop;
      } else if (d.dest === "_home") {
        at = g.home.lot.door;
        label = "Mi casa";
        building = g.home.lot.building;
      } else {
        const p = g.world.pois.find((x) => x.id === d.dest);
        at = p.at;
        label = p.name;
      }
      g.guide.setDestination({ ...at, label, building });
      this.close();
      this.toast(`🧭 Ruta marcada: ${label}`);
    });
  }

  drawMap(canvas) {
    const g = this.game;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    const s = Math.min(
      W / (WORLD.maxX - WORLD.minX),
      H / (WORLD.maxZ - WORLD.minZ),
    );
    const ox = (W - (WORLD.maxX - WORLD.minX) * s) / 2;
    const oz = (H - (WORLD.maxZ - WORLD.minZ) * s) / 2;
    const X = (x) => ox + (x - WORLD.minX) * s;
    const Z = (z) => oz + (z - WORLD.minZ) * s;
    const view = { X, Z, s, w: W, h: H };
    ctx.fillStyle = "#8fcf6c";
    ctx.fillRect(0, 0, W, H);
    // Mar al este.
    ctx.fillStyle = "#6cc6f0";
    ctx.fillRect(X(100), 0, W - X(100), H);
    drawCity(ctx, g.world, view, (b) => g.guide.buildingColor(b));
    // Nombres de las zonas.
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#1d2b44";
    for (const z of g.world.zones) {
      const [x0, z0, x1] = z.rect;
      const locked = z.id === "financiero" && !g.state.unlocked?.financiero;
      ctx.fillText(
        `${z.name}${locked ? " 🔒" : ""}`,
        X((x0 + x1) / 2),
        Z(z0) + 14,
      );
    }
    for (const p of g.world.pois)
      drawIcon(ctx, view, p.at.x, p.at.z, p.icon, { size: 12 });
    const shop = g.guide.ownShop();
    if (shop) {
      const dp = shop.doorPoint(0);
      drawIcon(ctx, view, dp.x, dp.z, "🏪", { size: 14 });
    }
    if (g.state.home?.owned && g.home?.lot)
      drawIcon(ctx, view, g.home.lot.door.x, g.home.lot.door.z, "🏡", {
        size: 14,
      });
    const t = g.guide.currentTarget?.();
    if (t) {
      ctx.fillStyle = "#e08a00";
      ctx.font = "bold 22px sans-serif";
      ctx.fillText("★", X(t.x), Z(t.z) + 2);
    }
    for (const o of g.online?.remotePlayers() ?? []) {
      ctx.fillStyle = "#9b6dff";
      ctx.beginPath();
      ctx.arc(X(o.x), Z(o.z), 5, 0, Math.PI * 2);
      ctx.fill();
    }
    const p = g.player.pos;
    ctx.fillStyle = "#2ec4c4";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(X(p.x), Z(p.z), 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  openMenu() {
    this.open(
      "menu",
      "Pausa",
      `
      <div class="menu">
        <button class="primary" data-act="continue">▶ Continuar</button>
        <button data-act="wardrobe">👕 Personalizar personaje</button>
        <button data-act="bag">🎒 Inventario</button>
        <button data-act="options">⚙️ Opciones</button>
        <button data-act="help">❓ Ayuda</button>
        <button data-act="save">💾 Guardar partida</button>
        <button data-act="title">🏠 Menú principal</button>
        ${this.game.online ? `<button data-act="rank">🏆 Clasificación</button><button class="ghost" data-act="leave">🚪 Salir de la ciudad</button>` : `<button class="ghost" data-act="new">Nueva partida</button>`}
      </div>`,
    );
    this.bind("[data-act]", (d) => {
      const g = this.game;
      if (d.act === "continue") this.close();
      if (d.act === "wardrobe") {
        this.close();
        g.openWardrobe("game");
      }
      if (d.act === "bag") this.openInventory();
      if (d.act === "options") this.openOptions(() => this.openMenu());
      if (d.act === "help") this.openHelp();
      if (d.act === "save") {
        const ok = g.save();
        this.toast(
          ok ? "Partida guardada" : "No se pudo guardar en este navegador",
          ok ? "good" : "bad",
        );
        this.close();
      }
      if (d.act === "title") {
        this.close();
        g.save();
        g.goToTitle();
      }
      if (d.act === "new") this.confirmNewGame(() => this.openMenu());
      if (d.act === "rank") this.openLeaderboard();
      if (d.act === "leave") g.leaveOnline();
    });
  }

  // Confirmación dentro del juego (algunos visores bloquean confirm()).
  confirmNewGame(back) {
    this.open(
      "confirm",
      "¿Nueva partida?",
      `<p>Se borrará el progreso guardado y empezarás de nuevo con $150. Tu ropa desbloqueada también se perderá.</p>
      <div class="menu">
        <button class="ghost" data-act="new">Sí, empezar de cero</button>
        <button class="primary" data-act="back">No, volver</button>
      </div>`,
    );
    this.bind("[data-act]", (d) => {
      if (d.act === "new") this.game.newGame();
      else if (back) back();
      else this.close();
    });
  }

  controlsHtml(touch) {
    if (touch) {
      return `<div class="controls"><span>🕹️ Toca la mitad izquierda: moverse</span><span>👆 Arrastra a la derecha: cámara</span><span>✋ Interactuar</span><span>🏃 Correr</span><span>⤒ Saltar</span></div>`;
    }
    return `<div class="controls"><span><kbd>WASD</kbd>/<kbd>↑↓←→</kbd> moverse</span><span><kbd>Shift</kbd> correr</span><span><kbd>Espacio</kbd> saltar</span><span><kbd>E</kbd> interactuar</span><span>Arrastrar ratón: cámara · Rueda: zoom</span><span><kbd>G</kbd> gestión · <kbd>M</kbd> mapa · <kbd>C</kbd> tiendas · <kbd>I</kbd> inventario · <kbd>V</kbd> scooter · <kbd>Esc</kbd> pausa</span></div>`;
  }

  // ---------- Multijugador ----------

  openChat(toggle = false) {
    const chat = $("chat");
    if (!this.game.settings.chat)
      return this.toast("El chat está desactivado en Opciones");
    if (toggle && !chat.hidden) {
      chat.hidden = true;
      return;
    }
    chat.hidden = false;
    $("chat-input").focus();
  }

  chatLine(text, system = false, name = "", from = null) {
    const log = $("chat-log");
    const el = document.createElement("div");
    el.className = system ? "sys" : "";
    if (system) el.textContent = text;
    else {
      const b = document.createElement("b");
      b.textContent = `${name}: `;
      if (from) {
        b.title = "Pulsa para silenciar a este jugador";
        b.style.cursor = "pointer";
        b.onclick = () => {
          const muted = this.game.online.toggleMute(from);
          this.toast(
            muted
              ? `Has silenciado a ${name}`
              : `${name} ya no está silenciado`,
          );
        };
      }
      el.append(b, document.createTextNode(text));
    }
    log.appendChild(el);
    while (log.children.length > 40) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
    // En móvil el chat no se abre solo (taparía el juego): aviso breve.
    if (!this.game.online || !this.game.settings.chat) return;
    if (this.game.input.isTouch) {
      if ($("chat").hidden && !system) this.toast(`💬 ${name}: ${text}`);
    } else $("chat").hidden = false;
  }

  openLeaderboard() {
    if (!this.game.online) return;
    this.open("rank", "🏆 Clasificación", `<p class="hint">Cargando…</p>`);
    this.game.net.send("leaderboard");
  }

  showLeaderboard(m) {
    if (this.panel !== "rank") return;
    const me = this.game.online.me.id;
    const muted = this.game.online.muted;
    const row = (r, i, city) =>
      `<tr class="${r.id === me ? "me" : ""}"><td>${i + 1}</td><td>${city ? (r.online ? "🟢 " : "⚪ ") : ""}${escapeHtml(r.name)}</td><td>${money(r.worth)}</td>${city ? `<td>${money(r.revenue)}</td><td>${r.id === me ? "" : `<button data-mute="${r.id}">${muted.has(r.id) ? "🔈 Activar" : "🔇 Silenciar"}</button>`}</td>` : ""}</tr>`;
    this.open(
      "rank",
      "🏆 Clasificación",
      `<h3>En esta ciudad</h3><div class="table-wrap"><table class="rank"><tr><th>#</th><th>Empresario</th><th>Patrimonio</th><th>Ventas</th><th></th></tr>${m.city.map((r, i) => row(r, i, true)).join("")}</table></div>
      <h3>Mejores empresarios del servidor</h3><div class="table-wrap"><table class="rank"><tr><th>#</th><th>Empresario</th><th>Patrimonio</th></tr>${m.global.map((r, i) => row(r, i, false)).join("")}</table></div>
      <p class="hint">Patrimonio = dinero + valor de tus locales y vehículos.</p>`,
    );
    this.bind("[data-mute]", (d) => {
      this.game.online.toggleMute(d.mute);
      this.game.net.send("leaderboard");
    });
  }

  // Vestíbulo: servidor, nombre, ciudades públicas, crear o entrar con código.
  openMultiplayer() {
    const url = this.mpUrl ?? defaultServerUrl();
    const name = this.mpName ?? savedName();
    const st = this.mpStatus ?? { kind: "off", text: "Sin conectar" };
    const cities = this.mpCities ?? [];
    const rows = cities.length
      ? cities
          .map(
            (c) =>
              `<div class="room"><div class="grow"><b>${escapeHtml(c.name)}</b><small>Código ${c.code} · ${c.members}/${c.max} empresarios · ${c.online} conectados</small></div><button data-join="${c.code}" ${c.members >= c.max ? "disabled" : ""}>Entrar</button></div>`,
          )
          .join("")
      : `<p class="hint">${st.kind === "ok" ? "No hay ciudades públicas todavía: ¡crea la primera!" : "Conéctate a un servidor para ver las ciudades."}</p>`;
    this.open(
      "multi",
      "🌍 Multijugador",
      `<div class="mp-status ${st.kind}"><i></i><span>${escapeHtml(st.text)}</span></div>
      <div class="mp-row">
        <label class="mp-field">Servidor<input id="mp-url" value="${escapeHtml(url)}" placeholder="ws://192.168.1.20:8080/ws"></label>
        <label class="mp-field">Tu nombre<input id="mp-name" maxlength="16" value="${escapeHtml(name)}" placeholder="Empresario"></label>
        <button data-act="connect">Conectar</button>
      </div>
      <h3>Ciudades públicas</h3><div class="list">${rows}</div>
      <h3>Crear ciudad</h3>
      <div class="mp-row">
        <label class="mp-field">Nombre<input id="mp-city" maxlength="24" placeholder="Villa Negocios"></label>
        <label class="mp-field">Visibilidad<select id="mp-public"><option value="1">Pública (aparece en la lista)</option><option value="0">Privada (solo con código)</option></select></label>
        <button class="primary" data-act="create">Crear</button>
      </div>
      <h3>Unirse con código</h3>
      <div class="mp-row">
        <label class="mp-field">Código de invitación<input id="mp-code" maxlength="5" placeholder="ABCDE" style="text-transform:uppercase"></label>
        <button class="primary" data-act="code">Entrar</button>
      </div>
      <p class="hint">Hasta 4 empresarios por ciudad, cada uno con su propia tienda. Tu dinero, inventario y negocios de cada ciudad los guarda el servidor. El modo online necesita el servidor del juego en marcha (ver README); no funciona dentro de la vista previa de claude.ai.</p>`,
    );
    const read = () => {
      this.mpUrl = $("mp-url").value.trim();
      this.mpName = $("mp-name").value.trim();
      saveServerUrl(this.mpUrl);
      saveName(this.mpName);
    };
    this.bind("[data-act]", async (d) => {
      read();
      if (d.act === "connect") return this.mpConnect();
      if (d.act === "create")
        return this.mpEnter({
          create: {
            name:
              $("mp-city").value.trim() ||
              `Ciudad de ${this.mpName || "Empresario"}`,
            public: $("mp-public").value === "1",
          },
        });
      if (d.act === "code") {
        const code = $("mp-code").value.trim().toUpperCase();
        if (!/^[A-Z0-9]{5}$/.test(code))
          return this.toast("El código tiene 5 letras o números", "bad");
        return this.mpEnter({ code });
      }
    });
    this.bind("[data-join]", (d) => {
      read();
      this.mpEnter({ code: d.join });
    });
  }

  async mpConnect() {
    if (!this.mpUrl) {
      this.mpStatus = {
        kind: "off",
        text: "Escribe la dirección del servidor (ws://…/ws)",
      };
      return this.openMultiplayer();
    }
    this.mpStatus = { kind: "wait", text: "Conectando…" };
    this.openMultiplayer();
    try {
      this.lobbyNet?.close();
      const net = new Net(this.mpUrl);
      await net.connect();
      const w = await net.hello(
        this.mpName || "Empresario",
        this.game.state.look,
      );
      this.lobbyNet = net;
      this.mpCities = w.cities;
      this.mpStatus = { kind: "ok", text: `Conectado como ${w.name}` };
    } catch (err) {
      this.mpStatus = { kind: "off", text: err.message };
    }
    if (this.panel === "multi") this.openMultiplayer();
  }

  // Comprueba la ciudad y recarga el juego en modo online.
  async mpEnter(target) {
    if (!this.lobbyNet || this.lobbyNet.status !== "on") await this.mpConnect();
    if (!this.lobbyNet || this.lobbyNet.status !== "on") return;
    this.lobbyNet.close();
    try {
      sessionStorage.setItem(
        ONLINE_KEY,
        JSON.stringify({ url: this.mpUrl, name: this.mpName, ...target }),
      );
    } catch {
      return this.toast("El navegador no permite guardar la sesión", "bad");
    }
    this.game.audio.sfx("whoosh");
    location.reload();
  }

  openHelp() {
    const g = this.game;
    this.open(
      "help",
      "Ayuda",
      `<h3>📦 Comprar en el Mayorista</h3>
      <ol class="steps"><li>Toma un carro en la entrada</li><li>Mete cajas desde las estanterías</li><li>Paga en la CAJA</li><li>Llévalo a tu tienda y repón</li></ol>
      <p class="hint">El Mayorista es de <b>autoservicio</b>: toma un <b>carro</b> en la entrada (hasta 10 cajas), elige tus cajas en las <b>estanterías</b> por categoría y paga en la <b>CAJA</b>. No se puede salir con cajas sin pagar. Al pagar puedes mandarlo en camión a tu negocio; si te lo llevas, en tu almacén descargas el carro entero de una vez.</p>
      <button data-act="tutorial">Repetir el tutorial de primeros pasos</button>
      <h3>🧭 Orientación</h3>
      <p>El botón <b>🏪 IR A MI TIENDA</b> marca la ruta por las calles. Toca el minimapa para abrir el mapa y elegir otro destino.</p>
      <h3>🛍️ ¿Dónde comprar?</h3>
      <p>Cada tienda tiene un <b>cartel flotante</b> con su icono (👕 ROPA, 🚗 AUTOS, 🛋️ MUEBLES…) y en los cruces hay <b>postes con flechas</b> y distancias. El botón <b>🛍️</b>${g.input.isTouch ? "" : " (tecla C)"} lista qué vende cada tienda y marca la ruta.</p>
      <h3>🚨 Sucesos inesperados</h3>
      <p>De vez en cuando pasa algo: un <b>ladrón</b> sale corriendo de tu tienda con género (alcánzalo para recuperarlo y cobrar la recompensa) o alguien pierde una <b>cartera</b>, un <b>perro</b> o un <b>paquete</b> (encuéntralo y llévaselo a su dueño). La flecha te guía y el aviso rojo muestra el tiempo que queda.</p>
      <h3>🎮 Controles</h3>${this.controlsHtml(g.input.isTouch)}
      <button class="primary big" data-act="back">Volver</button>`,
    );
    this.bind("[data-act]", (d) => {
      if (d.act === "tutorial") {
        g.tutorial.restart();
        this.close();
      } else this.openMenu();
    });
  }

  openOptions(back) {
    const g = this.game;
    const st = g.settings;
    const pct = (v) => Math.round(v * 100);
    this.open(
      "options",
      "Opciones",
      `
      <div class="options">
        <label>🎵 Música <input id="opt-music" type="range" min="0" max="100" value="${pct(st.music)}"><output>${pct(st.music)}%</output></label>
        <label>🔔 Efectos <input id="opt-sfx" type="range" min="0" max="100" value="${pct(st.sfx)}"><output>${pct(st.sfx)}%</output></label>
        <label>🔇 Silenciar todo <input id="opt-mute" type="checkbox" ${st.muted ? "checked" : ""}></label>
        <label>🎥 Sensibilidad de cámara <input id="opt-sens" type="range" min="30" max="250" value="${pct(st.sensitivity)}"><output>${pct(st.sensitivity)}%</output></label>
        <label>↕️ Invertir eje vertical <input id="opt-invert" type="checkbox" ${st.invertY ? "checked" : ""}></label>
        <label>🏃 Correr siempre (Shift / 🏃 para caminar) <input id="opt-run" type="checkbox" ${st.alwaysRun ? "checked" : ""}></label>
        <label>💬 Chat del modo online <input id="opt-chat" type="checkbox" ${st.chat ? "checked" : ""}></label>
        <div class="seg"><span>🖼️ Calidad gráfica</span>${["baja", "media", "alta"].map((q) => `<button data-quality="${q}" class="${st.quality === q ? "on" : ""}">${q[0].toUpperCase() + q.slice(1)}</button>`).join("")}</div>
        <p class="hint">Baja: sin sombras y menos peatones (ideal para móviles). Alta: sombras nítidas y ciudad más llena.</p>
      </div>
      <h3>Controles</h3>${this.controlsHtml(g.input.isTouch)}
      <button class="primary big" data-act="back">Listo</button>`,
    );
    const range = (id, key, scale = 100) => {
      const el = $(id);
      el.oninput = () => {
        st[key] = el.value / scale;
        el.nextElementSibling.textContent = `${el.value}%`;
        g.applySettings();
      };
    };
    range("opt-music", "music");
    range("opt-sfx", "sfx");
    range("opt-sens", "sensitivity");
    const check = (id, key) => {
      $(id).onchange = () => {
        st[key] = $(id).checked;
        g.applySettings();
      };
    };
    check("opt-mute", "muted");
    check("opt-invert", "invertY");
    check("opt-run", "alwaysRun");
    check("opt-chat", "chat");
    this.bind("[data-quality]", (d) => {
      st.quality = d.quality;
      g.applySettings();
      this.openOptions(back);
    });
    this.bind("[data-act]", () => (back ? back() : this.close()));
  }

  openCredits() {
    this.open(
      "credits",
      "Créditos",
      `<div class="credits">
        <h3>De Cero a Millonario</h3>
        <p>Un simulador de negocios en una ciudad de juguete.</p>
        <p><b>Diseño, programación, modelos 3D y música:</b> creados para este proyecto con Claude (Anthropic).</p>
        <p><b>Motor 3D:</b> three.js (licencia MIT).</p>
        <p><b>Música y sonidos:</b> sintetizados en tiempo real con Web Audio; no se usa ningún archivo de audio.</p>
        <p><b>Tipografía:</b> Baloo 2 (SIL Open Font License).</p>
        <p><b>Modelos:</b> geometría procedural: personajes, ropa, edificios y vehículos.</p>
        <p class="hint">¡Gracias por jugar!</p>
      </div>
      <button class="primary big" data-act="back">Volver</button>`,
    );
    this.bind("[data-act]", () => this.close());
  }

  // Inventario por pestañas: cajas y almacenes, ropa, vehículos, muebles,
  // casa y objetivos, con acciones útiles en cada una.
  openInventory(tab = this.invTab ?? "cajas") {
    const g = this.game;
    const s = g.state;
    this.invTab = tab;
    const row = (icon, name, sub, btn = "") =>
      `<div class="row"><span class="chip-icon">${icon}</span><div class="grow"><b>${name}</b><small>${sub}</small></div>${btn}</div>`;
    const tabs = [
      ["cajas", "📦 Cajas"],
      ["ropa", "👕 Ropa"],
      ["vehiculos", "🚲 Vehículos"],
      ["muebles", "🛋️ Muebles"],
      ["casa", "🏡 Casa"],
      ["objetivos", "🏆 Objetivos"],
    ];
    let body = "";
    if (tab === "cajas") {
      const carried = s.carried.length
        ? s.carried
            .map(
              (b) =>
                `<div class="row"><span class="chip" style="background:${hex(PRODUCTS[b.product].color)}"></span><div class="grow"><b>Caja de ${PRODUCTS[b.product].name}</b><small>${b.units} unidades${b.unpaid ? " · sin pagar" : ""}</small></div></div>`,
            )
            .join("")
        : `<p class="hint">No llevas nada. Recoge cajas en el Mayorista o en tus almacenes.</p>`;
      const stores = Object.values(g.businesses)
        .filter((b) => b.owned)
        .map((b) => {
          const list =
            Object.entries(b.storage)
              .filter(([, n]) => n > 0)
              .map(([p, n]) => `${PRODUCTS[p].name} ${n}`)
              .join(" · ") || "vacío";
          return `<div class="row"><div class="grow"><b>${b.name}</b><small>Almacén ${b.storageUnits()}/${b.storageCap()}: ${list}</small></div></div>`;
        })
        .join("");
      const extras = Object.keys(SHOP_ITEMS)
        .filter((id) => s.items[id])
        .map((id) => SHOP_ITEMS[id].name);
      body = `<h3>En tus manos (${s.carried.length}/${g.carryCapacity()})</h3><div class="list">${carried}</div>
        <h3>Almacenes</h3><div class="list">${stores}</div>
        ${extras.length ? `<h3>Otras pertenencias</h3><p>${extras.join(" · ")}</p>` : ""}`;
    } else if (tab === "ropa") {
      const clothes = SLOTS.filter((sl) => sl.id !== "skin").flatMap((sl) =>
        s.wardrobe
          .map((id) => findItem(sl.id, id))
          .filter((i) => i && i.id !== "none")
          .map((i) => ({ slot: sl.id, icon: sl.icon, item: i })),
      );
      body = `<div class="list">${clothes
        .map(({ slot, icon, item }) => {
          const worn = s.look[slot]?.id === item.id;
          return row(
            icon,
            item.name,
            SLOT_NAMES[slot] ?? slot,
            worn
              ? `<span class="tag good">Puesta</span>`
              : `<button data-wear="${slot}:${item.id}">Ponérmela</button>`,
          );
        })
        .join("")}</div>
        <p class="hint">Más ropa en la <b>Tienda de ropa</b> (zona comercial) y en la <b>Galería de lujo</b>.</p>
        <button data-act="wardrobe">👕 Abrir el armario</button>`;
    } else if (tab === "vehiculos") {
      const rides = g.rides;
      const owned = rides.owned();
      body = owned.length
        ? `<div class="list">${owned
            .map((id) => {
              const def = VEHICLES[id];
              if (isSmall(id)) {
                const sel = rides.selectedSmall() === id;
                return row(
                  "🛹",
                  def.name,
                  `Se lleva encima · súbete con ${g.input.isTouch ? "🛴" : "V"}`,
                  sel
                    ? `<span class="tag good">Elegido</span>`
                    : `<button data-small="${id}">Elegir</button>`,
                );
              }
              const p = s.parked[id];
              const where =
                g.player.ride?.id === id
                  ? "Lo estás usando"
                  : p
                    ? "Aparcado"
                    : "En el concesionario";
              return row(
                "🚗",
                def.name,
                where,
                g.player.ride?.id === id
                  ? ""
                  : `<button data-find="${id}">📍 Ir</button><button data-tow="${id}">🚚 Grúa $${TOW_PRICE}</button>`,
              );
            })
            .join("")}</div>`
        : `<p class="hint">Aún no tienes vehículos. Mira el concesionario <b>VEHÍCULOS</b> de la zona comercial: puedes probarlos gratis en su pista.</p>`;
    } else if (tab === "muebles") {
      const ids = Object.keys(FURNITURE).filter((id) => s.furniture[id]);
      body = ids.length
        ? `<div class="list">${ids
            .map((id) => {
              const placed = s.home.layout.filter((it) => it.f === id).length;
              const stored = g.home.stored(id);
              return row(
                "🛋️",
                FURNITURE[id].name,
                `${FURNITURE_SECTIONS[FURNITURE[id].section]} · ${placed} en casa${stored ? ` · ${stored} guardado/s` : ""}`,
              );
            })
            .join("")}</div>
            ${g.atHome() ? `<button class="primary" data-act="decor">🛋️ Decorar ahora</button>` : `<p class="hint">Para colocar lo guardado, entra en tu casa y pulsa 🛋️ Decorar.</p>`}`
        : `<p class="hint">No tienes muebles. Compra la casita (zona residencial) y visita <b>Muebles y Decoración</b> y <b>Tecnología</b>.</p>`;
    } else if (tab === "casa") {
      const h = s.home;
      body = h.owned
        ? `${row("🏡", `Casita nº ${g.home.lot.number}`, `${h.layout.length} muebles colocados · ${h.open ? "abierta a visitas" : "cerrada a visitas"}`, `<button data-act="gohome">📍 Ir</button>`)}
          <label class="field"><input type="checkbox" id="inv-open" ${h.open ? "checked" : ""}> Dejar que otros jugadores entren en mi casa (modo online)</label>`
        : `<p class="hint">Aún no tienes casa. La casita nº ${g.home.lot.number} de la zona residencial se vende por <b>${money(HOME.price)}</b>, con muebles básicos.</p><button data-act="gohome">📍 Llévame</button>`;
    } else {
      body = `<div class="list">${GOALS.map((goal) => {
        const p = g.goals.progress(goal);
        const claimed = g.goals.claimed(goal);
        const count = goal.target
          ? ` (${Math.min(p.count ?? 0, goal.target)}/${goal.target})`
          : "";
        return `<div class="row ${claimed ? "done" : ""}"><span class="chip-icon">${claimed ? "✅" : "🏆"}</span><div class="grow"><b>${goal.name}</b><small>${goal.desc}${count}</small></div><span class="tag ${claimed ? "good" : ""}">${claimed ? "Cobrado" : `+${money(goal.reward)}`}</span></div>`;
      }).join("")}</div>
      <p class="hint">Objetivos opcionales: la recompensa se cobra sola una vez al cumplirlos.</p>
      <p>Encargos completados: <b>${s.stats.encargos ?? 0}</b> · Monedas encontradas: <b>${s.stats.coins ?? 0}</b> · Lugares descubiertos: <b>${s.discovered.length}</b></p>`;
    }
    this.open(
      "bag",
      "Inventario",
      `<div class="tabs small">${tabs.map(([id, t]) => `<button data-inv="${id}" class="${tab === id ? "on" : ""}">${t}</button>`).join("")}</div>${body}`,
    );
    this.bind("[data-inv]", (d) => this.openInventory(d.inv));
    this.bind("[data-wear]", (d) => {
      const [slot, id] = d.wear.split(":");
      const color =
        s.look[slot]?.id === id
          ? s.look[slot].color
          : findItem(slot, id).colors
            ? "turquesa"
            : undefined;
      s.look = { ...s.look, [slot]: { id, color } };
      g.player.char.setLook(s.look);
      g.net?.send("look", { look: s.look });
      g.save();
      this.openInventory("ropa");
    });
    this.bind("[data-small]", (d) => {
      s.ride = d.small;
      g.save();
      this.openInventory("vehiculos");
    });
    this.bind("[data-find]", (d) => {
      const p = s.parked[d.find] ?? g.rides.deliverySpot(d.find);
      g.guide.setDestination({ ...p, label: VEHICLES[d.find].name });
      this.close();
    });
    this.bind("[data-tow]", async (d) => {
      await g.rides.tow(d.tow);
      this.openInventory("vehiculos");
    });
    this.bind("[data-act]", (d) => {
      if (d.act === "wardrobe") {
        this.close();
        g.openWardrobe("game");
      } else if (d.act === "decor") this.openDecor();
      else if (d.act === "gohome") {
        g.guide.setDestination({ ...g.home.lot.door, label: "Mi casa" });
        this.close();
      }
    });
    const open = $("inv-open");
    if (open)
      open.onchange = (e) => {
        s.home.open = e.target.checked;
        g.save();
        g.online?.sendHome?.();
      };
  }

  // Informe del día: tarjeta breve que no detiene el juego.
  showReport(r) {
    const gross = r.lines.reduce((a, l) => a + l.profit, 0);
    const net = Math.round((gross - r.expenses) * 100) / 100;
    const el = $("day-report");
    el.innerHTML = `<b>Fin del día ${r.day}</b><span>Ganancia ${money(Math.round(gross))} · Gastos −${money(r.expenses)}</span><em class="${net >= 0 ? "good" : "bad"}">${net > 0 ? "+" : ""}${money(net)}</em><button>Ver informe</button>`;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
    el.querySelector("button").onclick = () => {
      el.classList.remove("show");
      this.openReport(r);
    };
  }

  openReport(r) {
    const rows = r.lines
      .map(
        (l) =>
          `<tr><td>${l.name}</td><td>${l.sales}</td><td>${money(Math.round(l.revenue * 100) / 100)}</td><td>${money(Math.round(l.profit * 100) / 100)}</td><td>−${money(l.cost)}</td></tr>`,
      )
      .join("");
    const gross = r.lines.reduce((a, l) => a + l.profit, 0);
    const net = Math.round((gross - r.expenses) * 100) / 100;
    const lost = r.lines.reduce((a, l) => a + l.lost, 0);
    this.open(
      "report",
      `Fin del día ${r.day}`,
      `<div class="table-wrap"><table class="report"><tr><th>Negocio</th><th>Ventas</th><th>Ingresos</th><th>Ganancia bruta</th><th>Gastos</th></tr>${rows}</table></div>
      <p>Gastos totales del día (alquiler, salarios, luz, vehículos): <b>−${money(r.expenses)}</b></p>
      <p class="net ${net >= 0 ? "good" : "bad"}">Resultado neto: <b>${net > 0 ? "+" : ""}${money(net)}</b></p>
      ${lost ? `<p class="hint">${lost} productos no se vendieron por falta de existencias. ¡Repón más!</p>` : ""}
      <button class="primary big" data-go>Seguir jugando</button>`,
    );
    this.bind("[data-go]", () => this.close());
  }
}
