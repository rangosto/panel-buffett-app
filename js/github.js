// Cliente de tu repositorio privado de GitHub: descarga los datos de la rama «datos» y lanza el motor (workflow).
// El móvil nunca escribe en el repositorio: los cambios de cartera viajan como entrada del workflow.
import * as A from "./almacen.js";

// `api` solo cambia en las pruebas del PC (un GitHub simulado en local); en el móvil siempre es la de GitHub.
export const DEFECTO = { api: "https://api.github.com", repo: "rangosto/panel-buffett", rama: "datos", rama_cartera: "cartera", workflow: "actualizar.yml" };
// Lo que se descarga siempre; las fichas de empresas, solo las de tu cartera y lista (las demás al abrirlas).
const NUCLEO = ["estado.json", "glosario.json.gz", "mercado.json.gz", "cartera.json.gz", "oportunidades.json.gz", "superinversores.json.gz", "buscar.json.gz"];

export class SinClave extends Error {}
export class ClaveInvalida extends Error {}
export class SinConexion extends Error {}

export async function ajustes() {
  return { ...DEFECTO, ...((await A.leer("ajustes", "github")) || {}) };
}

export async function guardarAjustes(cambios) {
  await A.guardar("ajustes", "github", { ...(await ajustes()), ...cambios });
}

async function pedir(ruta, { metodo = "GET", cuerpo, aceptar = "application/vnd.github+json", cache = "no-store" } = {}) {
  const a = await ajustes();
  if (!a.token) throw new SinClave("Falta la clave de GitHub");
  let r;
  try {
    r = await fetch(a.api + ruta.replace("{repo}", a.repo), {
      method: metodo,
      cache,
      headers: {
        Authorization: `Bearer ${a.token}`,
        Accept: aceptar,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(cuerpo ? { "Content-Type": "application/json" } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw new SinConexion("Sin conexión a internet");
  }
  if (r.status === 401) throw new ClaveInvalida("GitHub no acepta tu clave: puede haber caducado o estar revocada.");
  if (r.status === 404) throw new Error("GitHub no encuentra el repositorio o la rama (¿la clave tiene acceso a «panel-buffett»?).");
  if (r.status === 403) throw new Error("La clave no tiene permiso para esto (revisa que tenga «Actions: lectura y escritura»).");
  if (!r.ok) throw new Error(`GitHub respondió ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return r;
}

const json = async (ruta, opciones) => (await pedir(ruta, opciones)).json();

/** Lista de ficheros de la rama de datos (ruta → sha) en su última versión. */
export async function arbol() {
  const a = await ajustes();
  const ref = await json(`/repos/{repo}/git/ref/heads/${a.rama}`);
  // los commits y árboles no cambian nunca: se pueden guardar en la caché del navegador
  const commit = await json(`/repos/{repo}/git/commits/${ref.object.sha}`, { cache: "default" });
  const t = await json(`/repos/{repo}/git/trees/${commit.tree.sha}?recursive=1`, { cache: "default" });
  const ficheros = {};
  for (const e of t.tree) if (e.type === "blob" && e.path.startsWith("movil/")) ficheros[e.path.slice(6)] = e.sha;
  return { commit: ref.object.sha, ficheros };
}

async function blob(sha) {
  const r = await pedir(`/repos/{repo}/git/blobs/${sha}`, { aceptar: "application/vnd.github.raw+json", cache: "default" });
  return new Uint8Array(await r.arrayBuffer());
}

// ---------------------------------------------------------------- lectura de lo guardado

const memoria = new Map();

async function descomprimir(bytes) {
  const flujo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(flujo).text();
}

/** Contenido JSON de un fichero ya descargado (o null si no está en el móvil). */
export async function leerJSON(ruta) {
  if (memoria.has(ruta)) return memoria.get(ruta);
  const bytes = await A.leer("ficheros", ruta);
  if (!bytes) return null;
  const texto = ruta.endsWith(".gz") ? await descomprimir(bytes) : new TextDecoder().decode(bytes);
  const datos = JSON.parse(texto);
  memoria.set(ruta, datos);
  return datos;
}

async function descargar(ruta, sha, manifiesto) {
  const bytes = await blob(sha);
  await A.guardar("ficheros", ruta, bytes);
  manifiesto[ruta] = sha;
  memoria.delete(ruta);
}

/**
 * Trae de GitHub lo que haya cambiado. `todas`: también todas las fichas (para usarlas sin conexión).
 * Devuelve cuántos ficheros se han descargado.
 */
export async function sincronizar({ todas = false, extra = [] } = {}, aviso = () => {}) {
  const { commit, ficheros } = await arbol();
  const manifiesto = (await A.leer("ajustes", "manifiesto")) || {};
  let n = 0;
  const traer = async (rutas) => {
    for (const ruta of rutas) {
      if (ficheros[ruta] && manifiesto[ruta] !== ficheros[ruta]) {
        aviso(`Descargando ${ruta.replace(/\.json(\.gz)?$/, "").replace("fichas/", "ficha de ")}…`);
        await descargar(ruta, ficheros[ruta], manifiesto);
        n++;
      }
    }
  };
  await traer(NUCLEO);
  const estado = await leerJSON("estado.json");
  const cartera = await leerJSON("cartera.json.gz");
  const tickers = [...(cartera?.compras || []).map((c) => c.ticker), ...(cartera?.lista_tickers || []), ...extra];
  const fichas = todas
    ? Object.keys(ficheros).filter((r) => r.startsWith("fichas/"))
    : tickers.map((tk) => estado?.fichas?.[tk]?.f).filter(Boolean);
  // también se renuevan las fichas que ya abriste alguna vez
  const yaVistas = Object.keys(manifiesto).filter((r) => r.startsWith("fichas/"));
  await traer([...new Set([...fichas, ...yaVistas])]);
  await A.guardar("ajustes", "manifiesto", manifiesto);
  await A.guardar("ajustes", "arbol", { commit, ficheros, fecha: Date.now() });
  return n;
}

/** Ficha de una empresa: la del móvil si está al día; si no, se descarga (si hay conexión). */
export async function ficha(ticker) {
  const estado = await leerJSON("estado.json");
  const ruta = estado?.fichas?.[ticker]?.f;
  if (!ruta) return null;
  const manifiesto = (await A.leer("ajustes", "manifiesto")) || {};
  const ultimo = (await A.leer("ajustes", "arbol"))?.ficheros?.[ruta];
  if (ultimo && manifiesto[ruta] !== ultimo) {
    try {
      await descargar(ruta, ultimo, manifiesto);
      await A.guardar("ajustes", "manifiesto", manifiesto);
    } catch (e) {
      if (!manifiesto[ruta]) throw e; // sin copia en el móvil no hay nada que enseñar
    }
  }
  return leerJSON(ruta);
}

export async function fichasEnMovil() {
  const manifiesto = (await A.leer("ajustes", "manifiesto")) || {};
  return Object.keys(manifiesto).filter((r) => r.startsWith("fichas/")).length;
}

export async function olvidarDatos() {
  await A.vaciar("ficheros");
  await A.borrar("ajustes", "manifiesto");
  await A.borrar("ajustes", "arbol");
  memoria.clear();
}

// ---------------------------------------------------------------- lanzar el motor en GitHub

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Lanza el workflow. `entradas`: tipo (rapido, ficha, operacion…), ticker, operacion. */
export async function lanzar(entradas) {
  const a = await ajustes();
  const id = crypto.randomUUID();
  const inputs = { ...entradas, id, rama_datos: a.rama, rama_cartera: a.rama_cartera };
  const r = await pedir(`/repos/{repo}/actions/workflows/${a.workflow}/dispatches`, {
    metodo: "POST",
    cuerpo: { ref: "main", inputs, return_run_details: true },
  });
  let run = null;
  if (r.status === 200) {
    try {
      run = (await r.json()).workflow_run_id ?? null;
    } catch {
      run = null;
    }
  }
  const pendiente = { id, run, tipo: entradas.tipo, desde: Date.now() };
  await A.guardar("ajustes", "pendiente", pendiente);
  return pendiente;
}

/** Espera a que termine la ejecución (avisando del progreso). Devuelve su resultado: success, failure… */
export async function esperar(pendiente, aviso = () => {}) {
  const a = await ajustes();
  let { run } = pendiente;
  const limite = pendiente.desde + 20 * 60e3;
  while (Date.now() < limite) {
    const segundos = Math.round((Date.now() - pendiente.desde) / 1000);
    if (!run) {
      // GitHub antiguo no devuelve el número de ejecución: se busca por el identificador que pusimos
      const lista = await json(`/repos/{repo}/actions/workflows/${a.workflow}/runs?event=workflow_dispatch&per_page=15`);
      run = lista.workflow_runs.find((x) => x.display_title === pendiente.id)?.id ?? null;
      aviso({ estado: "queued", segundos });
    }
    if (run) {
      const j = await json(`/repos/{repo}/actions/runs/${run}`);
      aviso({ estado: j.status, segundos });
      if (j.status === "completed") {
        await A.borrar("ajustes", "pendiente");
        return j.conclusion;
      }
    }
    await dormir(5000);
  }
  await A.borrar("ajustes", "pendiente");
  throw new Error("GitHub está tardando más de lo normal. Prueba a actualizar dentro de un rato.");
}

export const pendiente = () => A.leer("ajustes", "pendiente");
