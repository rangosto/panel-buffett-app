// Panel Buffett en el móvil: navegación, «Actualizar», hoja de las ⓘ y avisos. Las pantallas viven en pantallas.js y cartera.js.
import * as gh from "./github.js";
import { escapar, hace } from "./formato.js";
import * as P from "./pantallas.js";
import * as C from "./cartera.js";
import * as Aj from "./ajustes.js";

const $ = (s) => document.querySelector(s);
const pantalla = $("#pantalla");
const progreso = $("#progreso");
const botonActualizar = $("#actualizar");
const MIN = 60e3;

export const app = {
  oscuro: matchMedia("(prefers-color-scheme: dark)").matches,
  colores: null, // equivalencias claro → oscuro de los gráficos (las manda el motor)
  ocupado: false,
};

// ---------------------------------------------------------------- utilidades para las pantallas

/** Contexto para pintar bloques. */
export function ctx(extra = {}) {
  return { oscuro: app.oscuro, colores: app.colores, abrirFicha, ayuda: (texto) => abrirHoja(`<div class="tip">${md2(texto)}</div>`), ...extra };
}

const md2 = (t) => escapar(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n\n/g, "<br><br>");

export const abrirFicha = (ticker) => ir(`#/ficha/${encodeURIComponent(ticker)}`);

export function ir(ruta) {
  if (location.hash === ruta) navegar();
  else location.hash = ruta;
}

export function avisar(texto, error = false) {
  const el = document.createElement("div");
  el.className = `aviso-flotante${error ? " error" : ""}`;
  el.textContent = texto;
  $("#avisos").append(el);
  setTimeout(() => el.remove(), error ? 7000 : 4000);
}

let alCerrarHoja = null;

export function abrirHoja(html, { cerrar = true } = {}) {
  $("#hoja-contenido").innerHTML = html;
  $("#hoja-cerrar").hidden = !cerrar;
  $("#hoja").hidden = false;
  $("#velo").hidden = false;
  $("#hoja").scrollTop = 0;
  return $("#hoja-contenido");
}

export function cerrarHoja() {
  $("#hoja").hidden = true;
  $("#velo").hidden = true;
  const fn = alCerrarHoja;
  alCerrarHoja = null;
  fn?.();
}

/** Pregunta antes de hacer algo que no se puede deshacer. Devuelve true si se confirma. */
export function confirmar(titulo, texto, { si = "Sí", no = "Cancelar", peligro = false } = {}) {
  return new Promise((resolver) => {
    const c = abrirHoja(
      `<h2>${escapar(titulo)}</h2><p>${escapar(texto)}</p>
       <div class="botones"><button class="boton ${peligro ? "peligro" : ""}" data-r="si">${escapar(si)}</button>
       <button class="boton secundario" data-r="no">${escapar(no)}</button></div>`,
      { cerrar: false },
    );
    alCerrarHoja = () => resolver(false);
    c.querySelectorAll("button[data-r]").forEach((b) =>
      b.addEventListener("click", () => {
        alCerrarHoja = null;
        cerrarHoja();
        resolver(b.dataset.r === "si");
      }),
    );
  });
}

/** Menú de acciones (lista de botones) en la hoja inferior. */
export function acciones(titulo, lista) {
  const c = abrirHoja(`<h2>${escapar(titulo)}</h2>${lista.map((a, i) => `<button class="boton ${a.clase || "secundario"} ancho" data-i="${i}">${escapar(a.texto)}</button>`).join("")}`);
  c.querySelectorAll("button[data-i]").forEach((b) =>
    b.addEventListener("click", () => {
      cerrarHoja();
      lista[Number(b.dataset.i)].hacer();
    }),
  );
}

export function vacio(cont, icono, titulo, texto, boton) {
  cont.innerHTML = `<div class="vacio"><div class="grande">${icono}</div><h2>${escapar(titulo)}</h2><p>${escapar(texto)}</p></div>`;
  if (boton) {
    const b = document.createElement("button");
    b.className = "boton ancho";
    b.textContent = boton.texto;
    b.addEventListener("click", boton.hacer);
    cont.append(b);
  }
}

// ---------------------------------------------------------------- frescura de los datos

async function marcarFrescura() {
  const estado = await gh.leerJSON("estado.json");
  const el = $("#frescura");
  if (!estado) {
    el.textContent = "Sin datos todavía";
    return;
  }
  const fecha = ultimaActualizacion(estado);
  const viejo = Date.now() - Date.parse(fecha) > 8 * 60 * MIN;
  el.textContent = `${navigator.onLine ? "" : "Sin conexión · "}Datos ${hace(fecha)}`;
  el.classList.toggle("vieja", viejo || !navigator.onLine);
}

/** Cuándo se calcularon por última vez los precios y la cartera (lo hacen todos los modos). */
export function ultimaActualizacion(estado) {
  const fechas = Object.values(estado?.modos || {}).filter(Boolean);
  return fechas.sort().at(-1) || estado?.generado;
}

function aplicarColores(glosario) {
  if (!glosario) return;
  app.colores = glosario.colores_oscuro;
  let s = $("#vars-motor");
  if (!s) {
    s = document.createElement("style");
    s.id = "vars-motor";
    document.head.append(s);
  }
  s.textContent = `${glosario.css.claro}\n@media (prefers-color-scheme: dark) { ${glosario.css.oscuro} }`;
}

// ---------------------------------------------------------------- GitHub: actualizar y operaciones

function mostrarProgreso(texto) {
  progreso.hidden = false;
  progreso.innerHTML = `${escapar(texto)}<div class="barra"><i></i></div>`;
}

function ocultarProgreso() {
  progreso.hidden = true;
}

function explicarError(e) {
  if (e instanceof gh.SinClave) {
    ir("#/ajustes");
    return "Antes, pega tu clave de GitHub en Ajustes.";
  }
  if (e instanceof gh.ClaveInvalida) {
    ir("#/ajustes");
    return `${e.message} Crea una nueva y pégala en Ajustes.`;
  }
  if (e instanceof gh.SinConexion) return "Sin conexión a internet: te enseño los últimos datos guardados.";
  return e.message || String(e);
}

/**
 * Lanza el motor en GitHub y espera a que termine (1-2 min), enseñando el progreso. Después descarga lo nuevo.
 * Devuelve el pendiente (con su id) o lanza un error con un mensaje para Ramón.
 */
export async function enGitHub(entradas, texto, pendienteYa = null) {
  if (app.ocupado) throw new Error("Ya hay una actualización en marcha: espera a que termine.");
  app.ocupado = true;
  botonActualizar.classList.add("girando");
  try {
    mostrarProgreso(`${texto}…`);
    const p = pendienteYa || (await gh.lanzar(entradas));
    const r = await gh.esperar(p, ({ estado, segundos }) =>
      mostrarProgreso(`${texto}… ${estado === "queued" || estado === "pending" || estado === "waiting" ? "esperando turno" : "calculando"} (${segundos} s; suele tardar 1-2 min)`),
    );
    mostrarProgreso("Descargando los datos nuevos…");
    await gh.sincronizar({ extra: entradas.ticker ? [entradas.ticker] : [] }, (t) => mostrarProgreso(t));
    aplicarColores(await gh.leerJSON("glosario.json.gz"));
    await marcarFrescura();
    if (r !== "success") throw new Error("El cálculo en GitHub no ha terminado bien. Siguen los últimos datos buenos.");
    return p;
  } finally {
    app.ocupado = false;
    botonActualizar.classList.remove("girando");
    ocultarProgreso();
  }
}

/** Envía un cambio de cartera (añadir, editar, borrar, lista…) y devuelve {ok, mensaje} tal como lo aplicó el motor. */
export async function operacionCartera(op, texto) {
  try {
    const p = await enGitHub({ tipo: "operacion", operacion: JSON.stringify(op) }, texto);
    const estado = await gh.leerJSON("estado.json");
    return estado?.operaciones?.[p.id] || { ok: false, mensaje: "No he podido confirmar el cambio: revisa tu cartera." };
  } catch (e) {
    return { ok: false, mensaje: explicarError(e) };
  }
}

async function actualizar() {
  if (app.ocupado) return;
  try {
    const estado = await gh.leerJSON("estado.json");
    const fecha = ultimaActualizacion(estado);
    if (fecha && Date.now() - Date.parse(fecha) < 15 * MIN) {
      // recientes: no hace falta gastar minutos de GitHub, basta con descargarlos
      mostrarProgreso("Comprobando si hay datos nuevos…");
      try {
        await gh.sincronizar({}, mostrarProgreso);
      } finally {
        ocultarProgreso();
      }
      await marcarFrescura();
      avisar(`Los datos ya estaban al día (${hace(ultimaActualizacion(await gh.leerJSON("estado.json")))}).`);
    } else {
      await enGitHub({ tipo: "rapido" }, "Actualizando precios y tu cartera en GitHub");
      avisar("Datos actualizados.");
    }
    await navegar();
  } catch (e) {
    avisar(explicarError(e), true);
  }
}

async function sincronizarEnSegundoPlano() {
  try {
    const n = await gh.sincronizar();
    if (n) {
      aplicarColores(await gh.leerJSON("glosario.json.gz"));
      await navegar();
    }
    await marcarFrescura();
  } catch (e) {
    if (e instanceof gh.ClaveInvalida) avisar(explicarError(e), true);
    await marcarFrescura();
  }
}

// ---------------------------------------------------------------- navegación

const RUTAS = {
  mercado: P.mercado,
  cartera: C.pantalla,
  oportunidades: P.oportunidades,
  superinversores: P.superinversores,
  aprende: P.aprende,
  ficha: P.ficha,
  buscar: P.buscar,
  compra: C.formulario,
  ajustes: Aj.pantalla,
};
const SECCIONES = ["mercado", "cartera", "oportunidades", "superinversores", "aprende"];
let pasos = 0; // pantallas visitadas dentro de la app (para saber si «Volver» puede ir atrás)
let turno = 0; // cada navegación tiene su turno: si llega otra antes de terminar, la vieja no pinta encima

// la clave llega con el QR del panel del PC (…/#clave=github_pat_…): se la queda Ajustes y se borra de la dirección
function recibirClave() {
  const qr = /^#clave=([A-Za-z0-9_]+)$/.exec(location.hash);
  if (!qr) return;
  history.replaceState(null, "", location.pathname + location.search + "#/ajustes");
  Aj.recibir(qr[1]);
}

export async function navegar() {
  const mio = ++turno;
  recibirClave(); // con la app ya abierta, escanear el QR solo cambia la parte de detrás de «#»
  const [camino, consulta = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const [nombre, ...resto] = camino.split("/");
  const ruta = RUTAS[nombre] ? nombre : "mercado";
  document.querySelectorAll("#menu a").forEach((a) => a.classList.toggle("activa", a.dataset.sec === ruta));
  $("#volver").hidden = SECCIONES.includes(ruta);
  pantalla.innerHTML = `<div class="cargando">Cargando…</div>`;
  // la pantalla se dibuja aparte y solo se enseña si sigue siendo la que pediste
  const cont = document.createElement("div");
  try {
    await RUTAS[ruta](cont, resto.map(decodeURIComponent), new URLSearchParams(consulta));
  } catch (e) {
    vacio(cont, "⚠️", "No he podido abrir esta pantalla", explicarError(e));
  }
  if (mio === turno) pantalla.replaceChildren(cont);
}

function volver() {
  if (pasos > 1) history.back();
  else ir("#/mercado");
}

async function arrancar() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  aplicarColores(await gh.leerJSON("glosario.json.gz").catch(() => null));
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    app.oscuro = e.matches;
    navegar();
  });
  window.addEventListener("hashchange", () => {
    pasos++;
    navegar();
    window.scrollTo(0, 0);
  });
  window.addEventListener("online", marcarFrescura);
  window.addEventListener("offline", marcarFrescura);
  // ⓘ: al tocarla se abre su explicación abajo
  document.addEventListener("click", (e) => {
    const i = e.target.closest?.(".bp-info");
    const tip = i?.querySelector(".bp-tip");
    if (tip) {
      e.preventDefault();
      abrirHoja(`<div class="tip">${tip.innerHTML}</div>`);
    }
  });
  $("#velo").addEventListener("click", cerrarHoja);
  $("#hoja-cerrar").addEventListener("click", cerrarHoja);
  $("#volver").addEventListener("click", volver);
  $("#buscar").addEventListener("click", () => ir("#/buscar"));
  $("#actualizar").addEventListener("click", actualizar);
  document.addEventListener("keydown", (e) => e.key === "Escape" && !$("#hoja").hidden && cerrarHoja());

  recibirClave();
  const a = await gh.ajustes();
  if (!a.token && !location.hash.startsWith("#/ajustes")) location.hash = "#/ajustes";
  pasos = 1;
  await navegar();
  await marcarFrescura();
  if (!a.token) return;
  const pend = await gh.pendiente();
  if (pend && Date.now() - pend.desde < 20 * MIN) {
    // se cerró la app mientras GitHub calculaba: se sigue esperando
    enGitHub({ tipo: pend.tipo }, "Terminando la última actualización", pend).then(navegar).catch((e) => avisar(explicarError(e), true));
  } else {
    sincronizarEnSegundoPlano();
  }
}

arrancar();
