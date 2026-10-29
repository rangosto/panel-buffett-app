// Pantallas de consulta: mercado, oportunidades, superinversores, aprende, ficha de empresa y buscador.
import * as gh from "./github.js";
import { pintar, grafico, tabla } from "./bloques.js";
import { escapar, hace, normal } from "./formato.js";
import { abrirFicha, acciones, avisar, ctx, enGitHub, ir, operacionCartera, vacio } from "./app.js";

const SIN_DATOS = ["📭", "Todavía no hay datos", "Pulsa 🔄 arriba para traerlos de GitHub (la primera vez tarda 1-2 minutos)."];

function html(cont, s = "") {
  const d = document.createElement("div");
  d.innerHTML = s;
  cont.append(...d.childNodes);
}

// ---------------------------------------------------------------- 🌡️ mercado

export async function mercado(cont) {
  const d = await gh.leerJSON("mercado.json.gz");
  if (!d) return vacio(cont, ...SIN_DATOS);
  cont.innerHTML = d.cabecera || "";
  pintar(d.bloques, cont, ctx());
}

// ---------------------------------------------------------------- 🐳 superinversores

export async function superinversores(cont) {
  const d = await gh.leerJSON("superinversores.json.gz");
  if (!d) return vacio(cont, ...SIN_DATOS);
  cont.innerHTML = d.cabecera || "";
  pintar(d.bloques, cont, ctx());
}

// ---------------------------------------------------------------- 💎 oportunidades

const filtros = { mercados: null, sector: "", nota: 50, graham: false, superinv: false };

export async function oportunidades(cont) {
  const d = await gh.leerJSON("oportunidades.json.gz");
  if (!d) return vacio(cont, ...SIN_DATOS);
  const estado = await gh.leerJSON("estado.json");
  const i = Object.fromEntries(d.ids.map((id, k) => [id, k]));
  const v = (f, id) => f[i[id]];
  filtros.mercados ??= [...d.mercados, "Mi lista", "Superinversores"];

  cont.innerHTML = d.cabecera || "";
  const esc = estado?.escaner;
  if (esc) html(cont, `<p class="bl-nota">${esc.con_analisis} de ${esc.universo} empresas analizadas. Cada noche se renueva un turno, así que cada empresa se revisa cada 2-3 días.</p>`);

  const panel = document.createElement("details");
  panel.className = "bl-exp";
  panel.innerHTML = `<summary>🎚️ Filtros</summary><div>
    <div class="campo"><span>Mercados</span><div class="opciones" id="f-mercados">
      ${[...d.mercados, "Mi lista", "Superinversores"].map((m) => `<label><input type="checkbox" value="${escapar(m)}" ${filtros.mercados.includes(m) ? "checked" : ""}><span>${escapar(m)}</span></label>`).join("")}
    </div></div>
    <label class="campo"><span>Nota Buffett mínima: <b id="f-nota-v">${filtros.nota}</b></span><input type="range" id="f-nota" min="0" max="100" step="5" value="${filtros.nota}"></label>
    <label class="campo"><span>Sector</span><select id="f-sector"><option value="">Todos</option>${d.sectores.map((s) => `<option ${s === filtros.sector ? "selected" : ""}>${escapar(s)}</option>`).join("")}</select></label>
    <label class="interruptor">Solo las que pasan el filtro de Graham <input type="checkbox" id="f-graham" ${filtros.graham ? "checked" : ""}></label>
    <label class="interruptor">Solo las que tienen o compran superinversores <input type="checkbox" id="f-super" ${filtros.superinv ? "checked" : ""}></label>
  </div>`;
  cont.append(panel);
  const resultados = document.createElement("div");
  cont.append(resultados);

  const pintarResultados = () => {
    const filas = d.filas.filter((f) => {
      const origenes = String(v(f, "origen") || "").split(" · ");
      if (!origenes.some((o) => filtros.mercados.includes(o))) return false;
      if ((v(f, "nota_total") ?? 0) < filtros.nota) return false;
      if (filtros.sector && v(f, "sector") !== filtros.sector) return false;
      if (filtros.graham && v(f, "pasa_graham") !== true) return false;
      if (filtros.superinv && !(v(f, "superinversores") > 0 || v(f, "compras_trimestre") > 0)) return false;
      return true;
    });
    const conNotas = filas.filter((f) => v(f, "nota_calidad") != null && v(f, "nota_precio") != null);
    const joyas = conNotas.filter((f) => v(f, "nota_calidad") >= 60 && v(f, "nota_precio") >= 60).length;
    const kpi = (clave, nombre, texto, estado = "transparent", sub = "") =>
      `<div class="bp-kpi" style="--estado:${estado}"><div class="bp-lbl">${escapar(nombre)}${d.kpis_info[clave]}</div><div class="bp-val">${escapar(texto)}</div>${sub ? `<div class="bp-sub">${escapar(sub)}</div>` : ""}</div>`;
    resultados.innerHTML = `<div class="bp-root"><div class="bp-grid">
      ${kpi("nota_total", "Empresas que cumplen el filtro", String(filas.length))}
      ${kpi("cuadrantes", "Maravillosas a buen precio", String(joyas), joyas ? "#0ca30c" : "transparent", "calidad ≥ 60 y precio ≥ 60")}
      ${kpi("pasa_graham", "Pasan el filtro de Graham", String(filas.filter((f) => v(f, "pasa_graham") === true).length))}
      ${kpi("superinversores", "Tienen superinversores", String(filas.filter((f) => v(f, "superinversores") > 0).length))}
    </div></div>`;

    html(resultados, d.titulo_mapa);
    if (d.figura && conNotas.length) resultados.append(mapa(d, conNotas, v));
    html(resultados, d.titulo_ranking);
    const ordenadas = [...filas].sort((a, b) => (v(b, "nota_total") ?? -1) - (v(a, "nota_total") ?? -1));
    resultados.append(tabla({ columnas: d.columnas, filas: ordenadas.map((f) => f.slice(0, d.columnas.length)) }, ctx({ alTocarFila: (tk, fila) => menuEmpresa(tk, fila[0]) })));
    html(resultados, `<p class="bl-nota">${escapar(d.nota)}</p>`);
  };

  panel.querySelectorAll("#f-mercados input").forEach((x) => x.addEventListener("change", () => {
    filtros.mercados = [...panel.querySelectorAll("#f-mercados input:checked")].map((y) => y.value);
    pintarResultados();
  }));
  panel.querySelector("#f-nota").addEventListener("input", (e) => (panel.querySelector("#f-nota-v").textContent = e.target.value));
  panel.querySelector("#f-nota").addEventListener("change", (e) => { filtros.nota = Number(e.target.value); pintarResultados(); });
  panel.querySelector("#f-sector").addEventListener("change", (e) => { filtros.sector = e.target.value; pintarResultados(); });
  panel.querySelector("#f-graham").addEventListener("change", (e) => { filtros.graham = e.target.checked; pintarResultados(); });
  panel.querySelector("#f-super").addEventListener("change", (e) => { filtros.superinv = e.target.checked; pintarResultados(); });
  pintarResultados();
}

/** El mapa Calidad × Precio con las empresas que cumplen el filtro (misma figura que el panel). */
function mapa(d, filas, v) {
  const plantilla = d.figura;
  const cap = filas.map((f) => v(f, "capitalizacion_eur")).filter((x) => x > 0).sort((a, b) => a - b);
  const mediana = cap.length ? cap[Math.floor(cap.length / 2)] : 1e9;
  const raiz = filas.map((f) => Math.sqrt(Math.max(v(f, "capitalizacion_eur") || mediana, 1e8)));
  const lo = Math.min(...raiz), hi = Math.max(...raiz);
  const tam = raiz.map((r) => 8 + (22 * (r - lo)) / (hi - lo || 1));
  const conSup = filas.map((f) => v(f, "superinversores") > 0 || v(f, "compras_trimestre") > 0);
  const datos = [false, true].map((sup, k) => {
    const base = plantilla.data.find((t) => t.name === (sup ? "Con superinversores ⭐" : "Empresas")) || plantilla.data[k] || plantilla.data[0];
    const idx = filas.map((_, j) => j).filter((j) => conSup[j] === sup);
    return {
      ...base,
      x: idx.map((j) => v(filas[j], "nota_calidad")),
      y: idx.map((j) => v(filas[j], "nota_precio")),
      customdata: idx.map((j) => [v(filas[j], "ticker"), v(filas[j], "nombre"), v(filas[j], "nota_total"), v(filas[j], "origen")]),
      marker: { ...base.marker, size: idx.map((j) => tam[j]) },
    };
  }).filter((t) => t.x.length);
  return grafico({ data: datos, layout: plantilla.layout }, ctx({ alTocarPunto: (p) => p?.customdata && menuEmpresa(p.customdata[0], p.customdata[1]) }));
}

async function menuEmpresa(ticker, nombre) {
  const cartera = await gh.leerJSON("cartera.json.gz");
  const enLista = (cartera?.lista_tickers || []).includes(ticker);
  acciones(`${nombre} (${ticker})`, [
    { texto: "🔍 Ver su ficha", clase: "", hacer: () => abrirFicha(ticker) },
    enLista
      ? { texto: "★ Ya está en tu lista", hacer: () => {} }
      : { texto: "☆ Añadir a mi lista de seguimiento", hacer: () => cambiarLista("lista_añadir", ticker) },
    { texto: "➕ Añadir una compra", hacer: () => ir(`#/compra?tk=${encodeURIComponent(ticker)}`) },
  ]);
}

async function cambiarLista(accion, ticker) {
  const r = await operacionCartera({ accion, ticker }, accion === "lista_añadir" ? "Añadiendo a tu lista" : "Quitando de tu lista");
  avisar(r.mensaje, !r.ok);
}

// ---------------------------------------------------------------- 🏢 ficha

export async function ficha(cont, [ticker]) {
  ticker = String(ticker || "").toUpperCase();
  let f = null;
  try {
    f = await gh.ficha(ticker);
  } catch (e) {
    if (!(e instanceof gh.SinConexion)) throw e;
  }
  if (!f) return sinFicha(cont, ticker);
  const cartera = await gh.leerJSON("cartera.json.gz");
  const enLista = (cartera?.lista_tickers || []).includes(ticker);
  const [titulo, cabecera, ...resto] = f.bloques;
  cont.innerHTML = "";
  pintar([titulo, cabecera], cont, ctx());
  const botones = document.createElement("div");
  botones.className = "botones";
  botones.innerHTML = `
    <button class="boton secundario" data-a="lista">${enLista ? "★ Quitar de mi lista" : "☆ Añadir a mi lista"}</button>
    <button class="boton secundario" data-a="compra">➕ Añadir compra</button>
    <a class="boton secundario" href="https://es.finance.yahoo.com/quote/${encodeURIComponent(ticker)}" target="_blank" rel="noopener">Yahoo ↗</a>`;
  botones.querySelector('[data-a="lista"]').addEventListener("click", () => cambiarLista(enLista ? "lista_quitar" : "lista_añadir", ticker).then(() => ir(location.hash)));
  botones.querySelector('[data-a="compra"]').addEventListener("click", () => ir(`#/compra?tk=${encodeURIComponent(ticker)}`));
  cont.append(botones);
  html(cont, `<p class="bl-nota">Ficha calculada ${escapar(hace(f.generado))}.</p>`);
  pintar(resto, cont, ctx());
}

function sinFicha(cont, ticker) {
  vacio(cont, "🔎", `Aún no tengo la ficha de ${ticker}`, "Puedo pedírsela a GitHub: la calcula con el mismo método que el panel en 1-2 minutos.", {
    texto: `Pedir la ficha de ${ticker}`,
    hacer: async () => {
      try {
        await enGitHub({ tipo: "ficha", ticker }, `Calculando la ficha de ${ticker}`);
        const estado = await gh.leerJSON("estado.json");
        if (!estado?.fichas?.[ticker]) avisar(`Yahoo no tiene datos de «${ticker}». Revisa el ticker (por ejemplo ITX.MC, KO o IWDA.AS).`, true);
        ir(location.hash);
      } catch (e) {
        avisar(e.message, true);
      }
    },
  });
}

// ---------------------------------------------------------------- 🔍 buscador

export async function buscar(cont) {
  const lista = (await gh.leerJSON("buscar.json.gz")) || [];
  const estado = await gh.leerJSON("estado.json");
  cont.innerHTML = `<h2 class="bp-h h2"><span class="t">🔍 Buscar</span></h2>
    <input type="search" id="q" placeholder="Nombre o ticker: Inditex, Apple, KO, IWDA.AS…" autocomplete="off" autofocus>
    <ul class="lista" id="res"></ul>`;
  const q = cont.querySelector("#q"), res = cont.querySelector("#res");
  const pintarResultados = () => {
    const t = normal(q.value.trim());
    if (t.length < 2) {
      res.innerHTML = `<li><div class="fila"><span class="txt"><span class="d">Escribe al menos dos letras. Busco entre ${lista.length} empresas y ETFs del IBEX 35, Euro Stoxx 50, S&P 500, superinversores y tu cartera.</span></span></div></li>`;
      return;
    }
    const encontrados = lista
      .map((x) => ({ x, p: normal(x.t) === t ? 0 : normal(x.t).startsWith(t) ? 1 : normal(x.n).includes(t) ? 2 : normal(x.t).includes(t) ? 3 : 9 }))
      .filter((r) => r.p < 9)
      .sort((a, b) => a.p - b.p)
      .slice(0, 30);
    res.innerHTML = "";
    for (const { x } of encontrados) {
      const li = document.createElement("li");
      li.innerHTML = `<button class="fila"><span class="txt"><span class="n">${escapar(x.n)}</span><span class="d">${escapar(x.t)} · ${escapar(x.o || "")}${estado?.fichas?.[x.t] ? "" : " · sin ficha aún"}</span></span><span class="v">${escapar(x.p || "")}</span></button>`;
      li.querySelector("button").addEventListener("click", () => abrirFicha(x.t));
      res.append(li);
    }
    const tk = q.value.trim().toUpperCase();
    if (/^[A-Z0-9.\-^=]{1,15}$/.test(tk) && !encontrados.some(({ x }) => x.t === tk)) {
      const li = document.createElement("li");
      li.innerHTML = `<button class="fila"><span class="txt"><span class="n">Abrir el ticker «${escapar(tk)}»</span><span class="d">Si no está en la lista, puedo pedir su ficha a GitHub (1-2 min)</span></span><span class="v">→</span></button>`;
      li.querySelector("button").addEventListener("click", () => abrirFicha(tk));
      res.append(li);
    }
    if (!res.children.length) res.innerHTML = `<li><div class="fila"><span class="txt"><span class="d">Sin resultados. Prueba con el ticker exacto (TSM, ITX.MC, 2330.TW…).</span></span></div></li>`;
  };
  q.addEventListener("input", pintarResultados);
  pintarResultados();
  setTimeout(() => q.focus(), 50);
}

// ---------------------------------------------------------------- 📚 aprende

export async function aprende(cont) {
  const g = await gh.leerJSON("glosario.json.gz");
  if (!g) return vacio(cont, ...SIN_DATOS);
  cont.innerHTML = g.cabecera || "";
  const bloques = [{
    t: "pestañas",
    nombres: ["🧠 Principios", "🗺️ Cómo usar la app", "📖 Glosario"],
    paneles: [
      [{ t: "html", html: `<div class="bp-root">${g.principios.map(([t, a, x]) => `<div class="bp-glos"><h4>${escapar(t)}</h4><p style="font-size:.78rem;color:var(--muted)">${escapar(a)}</p><p>${escapar(x)}</p></div>`).join("")}</div>` }],
      [{ t: "html", html: `<ol class="pasos">${g.pasos.map((p) => `<li>${escapar(p).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")}</li>`).join("")}</ol>
        <div class="seccion-aviso">En el móvil, toca cualquier <b>ⓘ</b> para ver qué es ese dato y en qué fijarte. Los colores siguen siempre la misma regla: verde ✓ bien, amarillo ! regular, rojo ✕ mal, gris • informativo.</div>
        <div class="seccion-aviso">🔄 <b>Actualizar</b> pide a GitHub que recalcule precios y cartera (1-2 min). Si los datos tienen menos de 15 minutos, solo descarga lo último.</div>` }],
      [{ t: "html", html: `<input type="search" id="glos-q" placeholder="Buscar: PER, ROIC, margen de seguridad…"><div id="glos"></div>` }],
    ],
  }];
  pintar(bloques, cont, ctx());
  html(cont, `<div class="botones"><a class="boton secundario" href="#/ajustes">⚙️ Ajustes de la app</a></div>`);
  const caja = cont.querySelector("#glos"), q = cont.querySelector("#glos-q");
  const pintarGlosario = () => {
    const t = normal(q.value.trim());
    caja.innerHTML = "";
    for (const [grupo, claves] of Object.entries(g.grupos)) {
      const entradas = claves.map((k) => g.entradas[k]).filter((e) => e && (!t || normal(e.nombre + e.que_es + (e.fijate || "")).includes(t)));
      if (!entradas.length) continue;
      const d = document.createElement("details");
      d.className = "bl-exp";
      d.open = Boolean(t);
      d.innerHTML = `<summary>${escapar(grupo)} (${entradas.length})</summary><div class="bp-root">${entradas.map((e) => `<div class="bp-glos"><h4>${escapar(e.nombre)}</h4><p>${escapar(e.que_es)}</p><p><b>En qué fijarte:</b> ${escapar(e.fijate || "")}</p>${e.umbral ? `<p class="u">${escapar(e.umbral)}</p>` : ""}${e.consejo ? `<p class="c">${escapar(e.consejo)}</p>` : ""}<p style="font-size:.75rem;color:var(--muted)">Fuente: ${escapar(e.fuente || "")}</p></div>`).join("")}</div>`;
      caja.append(d);
    }
    if (!caja.children.length) caja.innerHTML = `<p class="bl-nota">Nada coincide con «${escapar(q.value)}».</p>`;
  };
  q.addEventListener("input", pintarGlosario);
  pintarGlosario();
}
