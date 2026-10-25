// Interfaz HTML superpuesta: HUD, indicador de interacción, avisos y paneles
// (proveedor, gestión, mapa, boutique, concesionario y menú).
import {
  PRODUCTS,
  STAGES,
  UPGRADES,
  STAFF,
  SHOP_ITEMS,
  OUTFITS,
  HATS,
  BOX_UNITS,
  DAY_SECONDS,
} from "./config.js";
import { upgradeApplies } from "./business.js";
import { currentMission } from "./missions.js";
import { WORLD } from "./physics.js";

const $ = (id) => document.getElementById(id);
const money = (n) => {
  const abs = Math.abs(n).toLocaleString("es", {
    minimumFractionDigits: n % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `−$${abs}` : `$${abs}`;
};
const hex = (c) => `#${c.toString(16).padStart(6, "0")}`;

export class UI {
  constructor(game) {
    this.game = game;
    this.hudTimer = 0;
    this.panel = null;
    this.order = {};
    this.selectedBiz = "tienda";
    this.tab = "resumen";
    $("btn-map").onclick = () => this.openMap();
    $("btn-manage").onclick = () => this.openManagement();
    $("btn-menu").onclick = () => this.openMenu();
    $("panel-close").onclick = () => this.close();
    $("panel").addEventListener("click", (e) => {
      if (e.target.id === "panel") this.close();
    });
    window.addEventListener(
      "keydown",
      (e) => {
        if (
          this.panel &&
          (e.key === "Escape" ||
            (e.key.toLowerCase() === "g" && this.panel === "manage") ||
            (e.key.toLowerCase() === "m" && this.panel === "map"))
        ) {
          this.close();
          e.preventDefault();
          game.input.pressed.clear();
        }
      },
      true,
    );
    if (game.input.isTouch) document.body.classList.add("touch");
    $("loading").remove();
  }

  get panelOpen() {
    return !!this.panel;
  }

  refreshHud(force = false) {
    this.hudTimer -= 1 / 60;
    if (!force && this.hudTimer > 0) return;
    this.hudTimer = 0.2;
    const g = this.game;
    const s = g.state;
    $("money").textContent = money(Math.round(s.money * 100) / 100);
    $("money").classList.toggle("negative", s.money < 0);
    const stage = g.stageIndex();
    $("stage").textContent =
      `${STAGES[stage].name} · ${g.businesses.tienda.name}`;
    const hour = 7 + (s.clock / DAY_SECONDS) * 15;
    const hh = Math.floor(hour);
    const mm = Math.floor(((hour - hh) * 60) / 10) * 10;
    $("clock").textContent =
      `Día ${s.day} · ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    let today = 0;
    for (const b of Object.values(g.businesses))
      if (b.owned) today += b.today.profit;
    $("today").textContent =
      `Ganancia hoy: ${money(Math.round(today * 100) / 100)}`;
    const m = currentMission(g);
    $("objective-text").textContent = m
      ? m.text
      : "¡Eres millonario! Sigue expandiendo tu imperio.";
    $("objective-reward").textContent = m?.reward
      ? `Recompensa: ${money(m.reward)}`
      : "";
    const carry = s.carried;
    $("carry").hidden = !carry.length;
    $("carry").innerHTML =
      `📦 ${carry.length}/${g.carryCapacity()} · ${carry.map((b) => `${PRODUCTS[b.product].name} (${b.units})`).join(", ")}`;
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
    setTimeout(() => el.classList.add("out"), 2600);
    setTimeout(() => el.remove(), 3100);
    while ($("toasts").children.length > 4) $("toasts").firstChild.remove();
  }

  missionComplete(m, next) {
    const el = $("mission-done");
    el.innerHTML = `<b>¡Objetivo cumplido!</b><span>${m.text}</span>${m.reward ? `<em>+${money(m.reward)}</em>` : ""}${next ? `<small>Siguiente: ${next.text}</small>` : ""}`;
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
    this.panel = null;
    $("panel").hidden = true;
  }

  bind(selector, fn) {
    $("panel-body")
      .querySelectorAll(selector)
      .forEach((el) => (el.onclick = () => fn(el.dataset, el)));
  }

  showWelcome() {
    const touch = this.game.input.isTouch;
    this.open(
      "welcome",
      "De Cero a Millonario",
      `
      <p class="lead">Empiezas con <b>$150</b> y una pequeña tienda de barrio. ¡Conviértela en un imperio!</p>
      <ol class="steps">
        <li>Camina hasta <b>Mi Tiendita</b> (sigue la flecha verde).</li>
        <li>Compra mercadería en el <b>Mayorista</b>, al otro lado de la calle.</li>
        <li>Lleva las cajas y repón las estanterías.</li>
        <li>Cobra a los clientes en la caja y ¡haz crecer tu negocio!</li>
      </ol>
      ${this.controlsHtml(touch)}
      <button class="primary big" data-go>¡A jugar!</button>`,
    );
    this.bind("[data-go]", () => this.close());
  }

  controlsHtml(touch) {
    if (touch) {
      return `<div class="controls"><span>🕹️ Joystick: moverse</span><span>👆 Arrastrar: girar cámara</span><span>✋ Interactuar</span><span>🏃 Correr</span><span>⤒ Saltar</span></div>`;
    }
    return `<div class="controls"><span><kbd>WASD</kbd>/<kbd>↑↓←→</kbd> moverse</span><span><kbd>Shift</kbd> correr</span><span><kbd>Espacio</kbd> saltar</span><span><kbd>E</kbd> interactuar</span><span>Arrastrar ratón: cámara · Rueda: zoom</span><span><kbd>G</kbd> gestión · <kbd>M</kbd> mapa · <kbd>V</kbd> scooter · <kbd>Esc</kbd> menú</span></div>`;
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
        const price = p.cost * units * discount;
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
        <div class="grow"><b>${p.name}</b><small>Caja de ${units} uds. · ${money(price)}${p.base ? ` · venta sugerida ${money(p.base)}/ud.` : ""}${note}${locked ? ` · requiere ${STAGES[p.stage].name}` : ""}</small></div>
        ${locked ? "" : `<div class="stepper"><button data-dec="${id}">−</button><span>${n}</span><button data-inc="${id}">+</button></div>`}
      </div>`;
      })
      .join("");
    const deliveryHtml = g.state.items.furgoneta
      ? `<label class="field">Entrega: <select id="deliver"><option value="">Recoger aquí</option>${owned.map((b) => `<option value="${b.id}" ${deliver === b.id ? "selected" : ""}>Furgoneta → ${b.name} (+$5)</option>`).join("")}</select></label>`
      : `<p class="hint">Las cajas aparecerán en la zona <b>RECOGIDA</b>. Puedes llevar ${g.carryCapacity()} caja/s a la vez.</p>`;
    if (deliver) total += 5;
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

  openBoutique() {
    const g = this.game;
    const s = g.state;
    const stage = g.stageIndex();
    const item = (kind, o, owned, current) => {
      const locked = (o.stage ?? 0) > stage;
      let btn;
      if (current) btn = `<span class="tag good">Puesto</span>`;
      else if (owned)
        btn = `<button data-wear="${kind}:${o.id}">Ponerse</button>`;
      else if (locked)
        btn = `<span class="tag">Etapa ${STAGES[o.stage].name}</span>`;
      else
        btn = `<button data-wear="${kind}:${o.id}">${money(o.price)}</button>`;
      const chip = o.body
        ? `<span class="chip" style="background:${hex(o.body)}"></span>`
        : `<span class="chip">🎩</span>`;
      return `<div class="row">${chip}<div class="grow"><b>${o.name}</b></div>${btn}</div>`;
    };
    this.open(
      "boutique",
      "Boutique Estilo",
      `
      <h3>Ropa</h3><div class="list">${OUTFITS.map((o) => item("outfit", o, s.ownedOutfits.includes(o.id), s.outfit === o.id)).join("")}</div>
      <h3>Accesorios</h3><div class="list">${HATS.map((o) => item("hat", o, s.ownedHats.includes(o.id), s.hat === o.id)).join("")}</div>`,
    );
    this.bind("[data-wear]", (d) => {
      const [kind, id] = d.wear.split(":");
      g.buyOutfit(kind, id);
      this.openBoutique();
    });
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
    const touch = this.game.input.isTouch;
    this.open(
      "menu",
      "Menú",
      `
      <div class="menu">
        <button class="primary" data-act="continue">Continuar</button>
        <button data-act="save">Guardar partida</button>
        <button data-act="load">Cargar última partida</button>
        <button class="ghost" data-act="new">Nueva partida</button>
      </div>
      <h3>Controles</h3>${this.controlsHtml(touch)}`,
    );
    this.bind("[data-act]", (d) => {
      const g = this.game;
      if (d.act === "continue") this.close();
      if (d.act === "save") {
        const ok = g.save();
        this.toast(
          ok ? "Partida guardada" : "No se pudo guardar en este navegador",
          ok ? "good" : "bad",
        );
        this.close();
      }
      if (d.act === "load") location.reload();
      if (d.act === "new") this.confirmNewGame();
    });
  }

  // Confirmación dentro del juego (algunos visores bloquean confirm()).
  confirmNewGame() {
    this.open(
      "confirm",
      "¿Nueva partida?",
      `<p>Se borrará el progreso guardado y empezarás de nuevo con $150.</p>
      <div class="menu">
        <button class="ghost" data-act="new">Sí, empezar de cero</button>
        <button class="primary" data-act="back">No, volver al menú</button>
      </div>`,
    );
    this.bind("[data-act]", (d) => {
      if (d.act === "new") this.game.newGame();
      else this.openMenu();
    });
  }

  showReport(r) {
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
      `
      <table class="report"><tr><th>Negocio</th><th>Ventas</th><th>Ingresos</th><th>Ganancia bruta</th><th>Gastos</th></tr>${rows}</table>
      <p>Gastos totales del día (alquiler, salarios, luz, vehículos): <b>−${money(r.expenses)}</b></p>
      <p class="net ${net >= 0 ? "good" : "bad"}">Resultado neto: <b>${net > 0 ? "+" : ""}${money(net)}</b></p>
      ${lost ? `<p class="hint">${lost} productos no se vendieron por falta de existencias. ¡Repón más!</p>` : ""}
      <button class="primary big" data-go>Empezar el día ${r.day + 1}</button>`,
    );
    this.bind("[data-go]", () => this.close());
  }
}
