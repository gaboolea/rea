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
} from "./config.js";
import { upgradeApplies } from "./business.js";
import { currentMission, missionProgress } from "./missions.js";
import { WORLD } from "./physics.js";
import { findItem } from "./look.js";

const $ = (id) => document.getElementById(id);
const money = (n) => {
  const abs = Math.abs(n).toLocaleString("es", {
    minimumFractionDigits: n % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `−$${abs}` : `$${abs}`;
};
const hex = (c) => `#${c.toString(16).padStart(6, "0")}`;
const clock = (sec) =>
  `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

export class UI {
  constructor(game) {
    this.game = game;
    this.hudTimer = 0;
    this.panel = null;
    this.order = {};
    this.selectedBiz = "tienda";
    this.tab = "resumen";
    const click = (id, fn) =>
      ($(id).onclick = () => {
        game.audio.sfx("click");
        fn();
      });
    click("btn-map", () => this.openMap());
    click("btn-manage", () => this.openManagement());
    click("btn-menu", () => this.openMenu());
    click("btn-bag", () => this.openInventory());
    click("btn-sound", () => game.toggleMute());
    click("objective", () => $("objective").classList.toggle("collapsed"));
    $("panel-close").onclick = () => this.close();
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
    $("carry").innerHTML =
      `📦 <b>${carry.length}/${g.carryCapacity()}</b> ${carry.map((b) => `<span style="--c:${hex(PRODUCTS[b.product].color)}">${PRODUCTS[b.product].name} ×${b.units}</span>`).join("")}`;
    $("btn-sound").textContent = g.settings.muted ? "🔇" : "🔊";
    $("btn-ride").hidden = !s.items.scooter;
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

  missionComplete(m, next) {
    const el = $("mission-done");
    el.innerHTML = `<b>✓ ${m.text}</b>${m.reward ? `<em>+${money(m.reward)}</em>` : ""}${next ? `<small>Siguiente: ${next.text}</small>` : ""}`;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
  }

  // ---------- Paneles ----------

  open(name, title, html) {
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

  openSupplier() {
    const g = this.game;
    const types = g.ownedTypes();
    const stage = g.stageIndex();
    const items = Object.entries(PRODUCTS).filter(
      ([, p]) => !p.crafted && types.has(p.kind),
    );
    const owned = Object.values(g.businesses).filter((b) => b.owned);
    const deliver = this.deliverTo ?? "";
    const discount = g.supplierDiscount();
    let total = 0;
    const rows = items
      .map(([id, p]) => {
        const units = p.boxUnits ?? BOX_UNITS;
        const sale = g.events.discount(id);
        const price = p.cost * units * discount * sale;
        const n = this.order[id] ?? 0;
        total += price * n;
        const locked = (p.stage ?? 0) > stage;
        const note = p.cold
          ? " · necesita refrigerador"
          : p.ingredient
            ? " · para la máquina de café"
            : "";
        return `<div class="row ${locked ? "locked" : ""}">
        <span class="chip" style="background:${hex(p.color)}"></span>
        <div class="grow"><b>${p.name}</b>${sale < 1 ? ` <span class="tag good">OFERTA −40%</span>` : ""}<small>Caja de ${units} uds. · ${money(price)}${p.base ? ` · venta sugerida ${money(p.base)}/ud.` : ""}${note}${locked ? ` · requiere ${STAGES[p.stage].name}` : ""}</small></div>
        ${locked ? "" : `<div class="stepper"><button data-dec="${id}">−</button><span>${n}</span><button data-inc="${id}">+</button></div>`}
      </div>`;
      })
      .join("");
    const van = g.state.items.furgoneta;
    const fee = van ? 0 : 4;
    const deliveryHtml = `<label class="field">Entrega: <select id="deliver"><option value="">Recoger aquí en RECOGIDA</option>${owned
      .map(
        (b) =>
          `<option value="${b.id}" ${deliver === b.id ? "selected" : ""}>${van ? "Tu furgoneta" : "Camión de reparto"} → ${b.name} (${fee ? `+$${fee}` : "gratis"})</option>`,
      )
      .join(
        "",
      )}</select></label><p class="hint">${van ? "Tu furgoneta lo deja al instante en el almacén." : "El camión llega en unos segundos y lo deja en el almacén."} Puedes cargar ${g.carryCapacity()} caja/s a la vez.</p>`;
    if (deliver) total += fee;
    const tools = g.state.items.carretilla
      ? ""
      : `<div class="row"><span class="chip" style="background:#9aa7b0"></span><div class="grow"><b>${SHOP_ITEMS.carretilla.name}</b><small>${SHOP_ITEMS.carretilla.desc}</small></div><button data-item="carretilla">${money(SHOP_ITEMS.carretilla.price)}</button></div>`;
    this.open(
      "supplier",
      "Mayorista · Proveedores",
      `
      ${discount < 1 ? `<p class="hint good">Descuento de Magnate: −15%</p>` : ""}
      <div class="list">${rows}</div>
      ${deliveryHtml}
      <div class="sticky"><div class="total">Total: <b>${money(Math.round(total * 100) / 100)}</b> · Tienes ${money(Math.round(g.state.money * 100) / 100)}</div>
      <button class="primary big" data-buy ${total ? "" : "disabled"}>Pagar pedido</button></div>
      ${tools ? `<h3>Herramientas</h3><div class="list">${tools}</div>` : ""}`,
    );
    this.bind("[data-inc]", (d) => {
      this.order[d.inc] = Math.min(9, (this.order[d.inc] ?? 0) + 1);
      this.openSupplier();
    });
    this.bind("[data-dec]", (d) => {
      this.order[d.dec] = Math.max(0, (this.order[d.dec] ?? 0) - 1);
      this.openSupplier();
    });
    const sel = $("deliver");
    if (sel)
      sel.onchange = () => {
        this.deliverTo = sel.value;
        this.openSupplier();
      };
    this.bind("[data-item]", (d) => {
      g.buyItem(d.item);
      this.openSupplier();
    });
    this.bind("[data-buy]", () => {
      if (g.buySupplies(this.order, deliver || null)) {
        this.order = {};
        this.close();
      }
    });
  }

  openManagement(bizId) {
    const g = this.game;
    const owned = Object.values(g.businesses).filter((b) => b.owned);
    if (bizId) this.selectedBiz = bizId;
    if (!g.businesses[this.selectedBiz]?.owned) this.selectedBiz = owned[0].id;
    const b = g.businesses[this.selectedBiz];
    const tabs = [
      ["resumen", "Resumen"],
      ["precios", "Precios"],
      ["mejoras", "Mejoras"],
      ["personal", "Personal"],
    ];
    const bizTabs =
      owned.length > 1
        ? `<div class="tabs">${owned.map((o) => `<button data-biz="${o.id}" class="${o.id === b.id ? "on" : ""}">${o.name}</button>`).join("")}</div>`
        : "";
    const html = `${bizTabs}<div class="tabs small">${tabs.map(([id, t]) => `<button data-tab="${id}" class="${this.tab === id ? "on" : ""}">${t}</button>`).join("")}</div>
      <div class="tab-body">${this[`tab_${this.tab}`](b)}</div>`;
    this.open("manage", `Gestión · ${b.name}`, html);
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
    this.bind("[data-upgrade]", (d) => {
      g.buyUpgrade(b.id, d.upgrade);
      this.openManagement();
    });
    this.bind("[data-hire]", (d) => {
      g.hire(b.id, d.hire);
      this.openManagement();
    });
    this.bind("[data-fire]", (d) => {
      b.fire(d.fire);
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
    return `
      <div class="stats">
        <div><small>Ventas hoy</small><b>${b.today.sales}</b></div>
        <div><small>Ingresos hoy</small><b>${money(Math.round(b.today.revenue * 100) / 100)}</b></div>
        <div><small>Ganancia bruta hoy</small><b>${money(Math.round(b.today.profit * 100) / 100)}</b></div>
        <div><small>Reputación</small><b>${rep}/100</b></div>
        <div><small>Gastos diarios</small><b>${money(b.def.rent + b.salaries() + (b.upgrades.has("refrigerador") ? 5 : 0))}</b></div>
        <div><small>Clientes en el local</small><b>${b.customers.length}</b></div>
      </div>
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
        else if (lockedStage)
          btn = `<span class="tag">Etapa ${STAGES[u.stage].name}</span>`;
        return `<div class="row ${owned ? "done" : ""}"><div class="grow"><b>${u.name}</b><small>${u.desc}</small></div>${btn}</div>`;
      })
      .join("");
    return `<div class="list">${rows}</div>`;
  }

  tab_personal(b) {
    const g = this.game;
    const stage = g.stageIndex();
    const rows = b.def.staff
      .map((role) => {
        const st = STAFF[role];
        const count = b.employees.filter((e) => e.role === role).length;
        const locked = (st.stage ?? 0) > stage;
        return `<div class="row"><div class="grow"><b>${st.name} × ${count}</b><small>${st.desc} Salario: ${money(st.salary)}/día.</small></div>
        ${locked ? `<span class="tag">Etapa ${STAGES[st.stage].name}</span>` : `<button data-hire="${role}">Contratar</button>`}
        ${count ? `<button class="ghost" data-fire="${role}">Despedir</button>` : ""}</div>`;
      })
      .join("");
    return `<p class="hint">Los empleados trabajan solos, pero tú sigues comprando la mercadería y tomando decisiones.</p><div class="list">${rows}</div>`;
  }

  openDealer() {
    const g = this.game;
    const stage = g.stageIndex();
    const rows = ["scooter", "furgoneta", "casa"]
      .map((id) => {
        const it = SHOP_ITEMS[id];
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
      `<div class="list">${rows}</div><p class="hint">Gastos de la furgoneta: $10/día.</p>`,
    );
    this.bind("[data-item]", (d) => {
      g.buyItem(d.item);
      this.openDealer();
    });
  }

  openMap() {
    this.open(
      "map",
      "Mapa de la ciudad",
      `<canvas id="map-canvas" width="740" height="500"></canvas><p class="hint">● Tú · ★ Objetivo actual</p>`,
    );
    this.drawMap($("map-canvas"));
  }

  drawMap(canvas) {
    const g = this.game;
    const ctx = canvas.getContext("2d");
    const sx = canvas.width / (WORLD.maxX - WORLD.minX);
    const sz = canvas.height / (WORLD.maxZ - WORLD.minZ);
    const X = (x) => (x - WORLD.minX) * sx;
    const Z = (z) => (z - WORLD.minZ) * sz;
    ctx.fillStyle = "#9edb7c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f3e1b9";
    ctx.fillRect(0, Z(-10), canvas.width, Z(10) - Z(-10));
    ctx.fillRect(X(-7), 0, X(7) - X(-7), canvas.height);
    ctx.fillStyle = "#6b7480";
    ctx.fillRect(0, Z(-4), canvas.width, Z(4) - Z(-4));
    ctx.fillRect(X(-4), 0, X(4) - X(-4), canvas.height);
    ctx.fillStyle = "#6cc6f0";
    ctx.beginPath();
    ctx.arc(X(30), Z(38), 4 * sx, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    for (const b of Object.values(g.world.buildings)) {
      const biz = g.businesses[b.id];
      let color = "#ffffff";
      if (
        biz?.owned ||
        b.id === "casa" ||
        (b.id === "casagrande" && g.state.items.casa)
      )
        color = "#5bd47a";
      else if (biz || b.id === "casagrande") color = "#ffd166";
      else if (b.id === "restaurante") color = "#c9c9c9";
      ctx.fillStyle = color;
      ctx.strokeStyle = "#33415c";
      ctx.lineWidth = 2;
      ctx.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), b.w * sx, b.d * sz);
      ctx.strokeRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), b.w * sx, b.d * sz);
      ctx.fillStyle = "#1d2b44";
      ctx.fillText(b.name, X(b.x), Z(b.z) + 4);
    }
    ctx.fillStyle = "#dfe6ea";
    ctx.fillRect(X(49), Z(12), 18 * sx, 16 * sz);
    ctx.fillStyle = "#1d2b44";
    ctx.fillText("Concesionario", X(58), Z(20));
    ctx.fillText("Parque", X(30), Z(46));
    const m = currentMission(g);
    const t = m?.target?.(g);
    if (t) {
      ctx.fillStyle = "#1e9e4a";
      ctx.font = "bold 26px sans-serif";
      ctx.fillText("★", X(t.x), Z(t.z) + 9);
    }
    const p = g.player.pos;
    ctx.fillStyle = "#2ec4c4";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(X(p.x), Z(p.z), 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#555";
    ctx.font = "11px sans-serif";
    ctx.fillText(
      "Verde: tuyo · Amarillo: en venta · Gris: no disponible",
      canvas.width / 2,
      canvas.height - 8,
    );
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
        <button data-act="save">💾 Guardar partida</button>
        <button data-act="title">🏠 Menú principal</button>
        <button class="ghost" data-act="new">Nueva partida</button>
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
    return `<div class="controls"><span><kbd>WASD</kbd>/<kbd>↑↓←→</kbd> moverse</span><span><kbd>Shift</kbd> correr</span><span><kbd>Espacio</kbd> saltar</span><span><kbd>E</kbd> interactuar</span><span>Arrastrar ratón: cámara · Rueda: zoom</span><span><kbd>G</kbd> gestión · <kbd>M</kbd> mapa · <kbd>I</kbd> inventario · <kbd>V</kbd> scooter · <kbd>Esc</kbd> pausa</span></div>`;
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

  openInventory() {
    const g = this.game;
    const s = g.state;
    const carried = s.carried.length
      ? s.carried
          .map(
            (b) =>
              `<div class="row"><span class="chip" style="background:${hex(PRODUCTS[b.product].color)}"></span><div class="grow"><b>Caja de ${PRODUCTS[b.product].name}</b><small>${b.units} unidades</small></div></div>`,
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
    const items = Object.entries(s.items)
      .filter(([, v]) => v)
      .map(([id]) => SHOP_ITEMS[id]?.name)
      .filter(Boolean);
    const clothes = s.wardrobe
      .map((id) =>
        ["top", "bottom", "shoes", "hat", "glasses", "back", "neck", "skin"]
          .map((slot) => findItem(slot, id))
          .find(Boolean),
      )
      .filter((i) => i && i.id !== "none");
    this.open(
      "bag",
      "Inventario",
      `<h3>En tus manos (${s.carried.length}/${g.carryCapacity()})</h3><div class="list">${carried}</div>
      <h3>Almacenes</h3><div class="list">${stores}</div>
      <h3>Pertenencias</h3><p>${items.length ? items.join(" · ") : "Aún nada: ¡ahorra para tu primer vehículo!"}</p>
      <h3>Armario (${clothes.length})</h3><p>${clothes.map((c) => c.name).join(" · ")}</p>
      <h3>Logros</h3><p>Encargos completados: <b>${s.stats.encargos ?? 0}</b> · Monedas encontradas: <b>${s.stats.coins ?? 0}</b> · Lugares descubiertos: <b>${s.discovered.length}</b></p>`,
    );
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
