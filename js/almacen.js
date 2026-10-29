// Lo que la app guarda en el móvil (IndexedDB): los datos descargados y los ajustes. Sobrevive a cerrar la app.
const NOMBRE = "panel-buffett";
let conexion;

function abrir() {
  conexion ??= new Promise((ok, mal) => {
    const r = indexedDB.open(NOMBRE, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("ficheros");
      r.result.createObjectStore("ajustes");
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
  return conexion;
}

async function operar(almacen, modo, fn) {
  const bd = await abrir();
  return new Promise((ok, mal) => {
    const tx = bd.transaction(almacen, modo);
    const peticion = fn(tx.objectStore(almacen));
    tx.oncomplete = () => ok(peticion?.result);
    tx.onerror = () => mal(tx.error);
    tx.onabort = () => mal(tx.error);
  });
}

export const leer = (almacen, clave) => operar(almacen, "readonly", (s) => s.get(clave));
export const guardar = (almacen, clave, valor) => operar(almacen, "readwrite", (s) => s.put(valor, clave));
export const borrar = (almacen, clave) => operar(almacen, "readwrite", (s) => s.delete(clave));
export const claves = (almacen) => operar(almacen, "readonly", (s) => s.getAllKeys());
export const vaciar = (almacen) => operar(almacen, "readwrite", (s) => s.clear());

/** Pide al navegador que no borre estos datos aunque falte espacio. */
export async function persistir() {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
