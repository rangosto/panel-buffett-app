// 💼 Mi cartera en el móvil: lo mismo que el panel (valor, riesgo, mapa, evolución…) y los cambios: añadir, corregir y borrar compras.
// Los cambios se envían al motor en GitHub, que los valida igual que el formulario del PC.
import * as gh from "./github.js";
import { pintar, tabla } from "./bloques.js";
import { escapar, fechaES, hoyISO, leerNumero, normal, num } from "./formato.js";
import { abrirFicha, acciones, avisar, confirmar, ctx, ir, operacionCartera, vacio } from "./app.js";

let referencia = "MSCI World";

function html(cont, s = "") {
  const d = document.createElement("div");
  d.innerHTML = s;
  cont.append(...d.childNodes);
}

async function cambiar(op, texto) {
  const r = await operacionCartera(op, texto);
  avisar(r.mensaje, !r.ok);
  // si mientras GitHub calculaba te fuiste a otra pantalla, no te saca de ella: solo se avisa
  if (r.ok && /^#\/(compra|cartera)/.test(location.hash)) ir("#/cartera");
  return r.ok;
}

export async function pantalla(cont) {
  const d = await gh.leerJSON("cartera.json.gz");
  if (!d) return vacio(cont, "📭", "Todavía no hay datos", "Pulsa 🔄 arriba para traerlos de GitHub.");
  cont.innerHTML = d.cabecera || "";
  const añadir = document.createElement("div");
  añadir.className = "botones";
  añadir.innerHTML = `<a class="boton" href="#/compra">➕ Añadir una compra</a>`;
  cont.append(añadir);

  if (d.vacia) {
    html(cont, `<div class="bl-aviso">👋 Todavía no has añadido ninguna compra. Pulsa «Añadir una compra» y pon las tuyas tal como aparecen en tu broker.</div>`);
  } else {
    const refs = Object.keys(d.referencias);
    if (!refs.includes(referencia)) referencia = refs[0];
    const selector = document.createElement("div");
    selector.className = "campo";
    selector.innerHTML = `<span>Comparar con</span><div class="opciones">${refs.map((r) => `<label><input type="radio" name="ref" value="${escapar(r)}" ${r === referencia ? "checked" : ""}><span>${escapar(r)}</span></label>`).join("")}</div>
      <small>Como si hubieras metido el mismo dinero, los mismos días, en un ETF de ese índice.</small>`;
    cont.append(selector);
    const zona = document.createElement("div");
    cont.append(zona);
    const pintarRef = () => {
      zona.innerHTML = "";
      pintar(d.referencias[referencia].bloques, zona, ctx());
    };
    selector.querySelectorAll("input").forEach((x) => x.addEventListener("change", () => { referencia = x.value; pintarRef(); }));
    pintarRef();

    html(cont, d.titulo_posiciones);
    cont.append(tabla(d.posiciones, ctx({ alTocarFila: (tk, fila) => menuPosicion(d, tk, fila[0]) })));

    html(cont, d.titulo_compras);
    const ul = document.createElement("ul");
    ul.className = "lista";
    for (const c of d.compras) {
      const li = document.createElement("li");
      li.innerHTML = `<div class="fila"><span class="txt"><span class="n">${escapar(c.nombre || c.ticker)}</span>
        <span class="d">${escapar(c.ticker)} · ${escapar(fechaES(c.fecha))} · ${escapar(c.texto)}</span></span>
        <span class="acciones"><button class="icono" data-a="editar" aria-label="Corregir esta compra">✏️</button><button class="icono" data-a="borrar" aria-label="Borrar esta compra">🗑️</button></span></div>`;
      li.querySelector('[data-a="editar"]').addEventListener("click", () => ir(`#/compra/${encodeURIComponent(c.id)}`));
      li.querySelector('[data-a="borrar"]').addEventListener("click", async () => {
        const ok = await confirmar("¿Seguro que quieres borrar?", `Se borrará la compra de ${num(c.cantidad, c.cantidad % 1 ? 4 : 0)} ${c.nombre || c.ticker} del ${fechaES(c.fecha)}. No se puede deshacer, pero siempre puedes volver a añadirla.`, { si: "🗑️ Sí, borrar", peligro: true });
        if (ok) cambiar({ accion: "borrar", ids: [c.id] }, "Borrando la compra y recalculando tu cartera");
      });
      ul.append(li);
    }
    cont.append(ul);
  }

  html(cont, d.titulo_lista);
  if (d.lista?.filas?.length) {
    cont.append(tabla(d.lista, ctx({ alTocarFila: (tk, fila) => menuLista(tk, fila[0]) })));
  } else {
    html(cont, `<p class="bl-nota">Vacía. Añade empresas desde su ficha o desde 💎 Ideas con «Añadir a mi lista».</p>`);
  }
}

function menuPosicion(d, ticker, nombre) {
  const compras = d.compras.filter((c) => c.ticker === ticker);
  acciones(`${nombre} (${ticker}) · ${compras.length} ${compras.length === 1 ? "compra" : "compras"}`, [
    { texto: "🔍 Ver su ficha", clase: "", hacer: () => abrirFicha(ticker) },
    { texto: "➕ Añadir otra compra", hacer: () => ir(`#/compra?tk=${encodeURIComponent(ticker)}`) },
    {
      texto: "🗑️ Borrar esta posición",
      clase: "peligro",
      hacer: async () => {
        const detalle = compras.map((c) => `${num(c.cantidad, c.cantidad % 1 ? 4 : 0)} el ${fechaES(c.fecha)}`).join(", ");
        const ok = await confirmar("¿Seguro que quieres borrar?", `Se borrará ${nombre} de tu cartera (${detalle}). No se puede deshacer, pero siempre puedes volver a añadir las compras.`, { si: "🗑️ Sí, borrar", peligro: true });
        if (ok) cambiar({ accion: "borrar", ids: compras.map((c) => c.id) }, "Borrando la posición y recalculando tu cartera");
      },
    },
  ]);
}

function menuLista(ticker, nombre) {
  acciones(`${nombre} (${ticker})`, [
    { texto: "🔍 Ver su ficha", clase: "", hacer: () => abrirFicha(ticker) },
    { texto: "➕ Añadir una compra", hacer: () => ir(`#/compra?tk=${encodeURIComponent(ticker)}`) },
    { texto: "✖ Quitar de mi lista", hacer: () => cambiar({ accion: "lista_quitar", ticker }, "Quitando de tu lista") },
  ]);
}

// ---------------------------------------------------------------- ➕ formulario de compra (nueva o corrección)

async function infoValor(ticker) {
  const lista = (await gh.leerJSON("buscar.json.gz")) || [];
  const x = lista.find((y) => y.t === ticker) || { t: ticker, n: ticker };
  let f = null;
  try {
    f = await gh.ficha(ticker);
  } catch {
    f = null;
  }
  return {
    ticker,
    nombre: f?.nombre || x.n,
    origen: x.o,
    moneda: f?.moneda || x.m || null,
    precio: f?.precio ?? null, // en su moneda
    precioTxt: f?.precio_txt || x.p || null, // «84,95 € (91,18 $)»
  };
}

export async function formulario(cont, [id], params) {
  const d = await gh.leerJSON("cartera.json.gz");
  const compra = id ? d?.compras?.find((c) => c.id === id) : null;
  if (id && !compra) return vacio(cont, "🤔", "Esa compra ya no existe", "Puede que la borraras desde el PC.");
  const ticker = compra?.ticker || (params.get("tk") || "").toUpperCase();
  if (!ticker) return elegirValor(cont);

  const v = await infoValor(ticker);
  const moneda = compra?.moneda || v.moneda; // null: ticker escrito a mano, el precio va en euros y GitHub lo convierte
  const eurHoy = leerNumero((v.precioTxt || "").split(" €")[0]);
  cont.innerHTML = `<h2 class="bp-h h2"><span class="t">${compra ? "✏️ Corregir compra" : "➕ Añadir una compra"}</span></h2>
    <div class="bp-root"><div class="bp-kpi"><div class="bp-lbl">${escapar(v.nombre)} · ${escapar(ticker)}</div>
      <div class="bp-val" style="font-size:1.2rem">${v.precioTxt ? `Hoy cotiza a ${escapar(v.precioTxt)}` : "Precio de hoy no disponible"}</div>
      <div class="bp-sub">${escapar([v.origen, moneda && `cotiza en ${moneda}`].filter(Boolean).join(" · "))}</div></div></div>
    <form id="f" novalidate>
      <label class="campo"><span>Nº de acciones / participaciones</span>
        <input id="cantidad" inputmode="decimal" autocomplete="off" value="${compra ? escapar(String(compra.cantidad).replace(".", ",")) : ""}" placeholder="Por ejemplo 1,046572">
        <small>Cuántas tienes de esta compra. Si la acción ha hecho un «split» desde que compraste, pon las que te muestra hoy tu broker.</small></label>
      ${moneda && moneda !== "EUR" ? `<div class="campo"><span>¿En qué moneda pones el precio que pagaste?</span><div class="opciones">
        <label><input type="radio" name="mon" value="EUR" ${compra ? "" : "checked"}><span>En euros (€)</span></label>
        <label><input type="radio" name="mon" value="${escapar(moneda)}" ${compra ? "checked" : ""}><span>En ${escapar(moneda)}</span></label></div>
        <small>Ponlo tal como aparece en tu broker. Trade Republic muestra el precio en euros aunque la acción sea americana: se convierte con el cambio del día de la compra.</small></div>` : ""}
      <label class="campo"><span id="precio-lbl">Precio pagado por cada una</span>
        <input id="precio" inputmode="decimal" autocomplete="off" placeholder="0,00">
        <small>El precio de cada acción en esa compra, tal como aparece en tu broker.</small></label>
      <label class="campo"><span>Comisión pagada (€)</span>
        <input id="comision" inputmode="decimal" autocomplete="off" value="${compra?.comision ? escapar(String(compra.comision).replace(".", ",")) : "0"}">
        <small>Lo que te cobró el broker por la orden (Trade Republic cobra 1 €). Se suma a lo invertido para que la ganancia salga igual que en tu broker.</small></label>
      <label class="campo"><span>Fecha de compra</span>
        <input id="fecha" type="date" max="${hoyISO()}" value="${escapar(compra?.fecha || hoyISO())}">
        <small>Sirve para saber el cambio de divisa de ese día y comparar con el índice desde esa fecha.</small></label>
      <p id="error" class="bl-aviso error" hidden></p>
      <div class="botones"><button class="boton" type="submit">${compra ? "Guardar cambios" : "Guardar compra"}</button><a class="boton secundario" href="#/cartera">Cancelar</a></div>
    </form>`;

  const f = cont.querySelector("#f");
  const campoPrecio = f.querySelector("#precio");
  const monedaElegida = () => f.querySelector('input[name="mon"]:checked')?.value || (moneda === null ? "EUR" : moneda);
  const ponerPrecio = () => {
    const m = monedaElegida();
    f.querySelector("#precio-lbl").textContent = `Precio pagado por cada una (${m === "EUR" ? "€" : m})`;
    if (compra && m === compra.moneda) campoPrecio.value = String(compra.precio).replace(".", ",");
    else if (!compra) campoPrecio.value = m === "EUR" ? (Number.isFinite(eurHoy) ? num(eurHoy, 2).replace(/\./g, "") : "") : v.precio ? num(v.precio, 2).replace(/\./g, "") : "";
    else campoPrecio.value = "";
  };
  // como en el PC, una compra nueva se pone por defecto en euros (Trade Republic muestra euros)
  f.querySelectorAll('input[name="mon"]').forEach((x) => x.addEventListener("change", ponerPrecio));
  ponerPrecio();

  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const cantidad = leerNumero(f.querySelector("#cantidad").value);
    const precio = leerNumero(campoPrecio.value);
    const comision = leerNumero(f.querySelector("#comision").value || "0");
    const fecha = f.querySelector("#fecha").value;
    const error = f.querySelector("#error");
    const fallo = !(cantidad > 0) ? "La cantidad tiene que ser mayor que cero."
      : !(precio > 0) ? "El precio tiene que ser mayor que cero."
      : !(comision >= 0) ? "La comisión no puede ser negativa."
      : !fecha || fecha > hoyISO() ? "La fecha no puede ser futura." : "";
    error.hidden = !fallo;
    error.textContent = fallo;
    if (fallo) return;
    f.querySelector('button[type="submit"]').disabled = true;
    const datos = { cantidad, precio, moneda_precio: monedaElegida(), fecha, comision };
    const ok = compra
      ? await cambiar({ accion: "editar", id: compra.id, cambios: datos }, "Guardando la corrección y recalculando tu cartera")
      : await cambiar({ accion: "añadir", ticker, ...datos }, "Guardando tu compra y recalculando la cartera");
    if (!ok) f.querySelector('button[type="submit"]').disabled = false;
  });
}

async function elegirValor(cont) {
  const lista = (await gh.leerJSON("buscar.json.gz")) || [];
  cont.innerHTML = `<h2 class="bp-h h2"><span class="t">➕ Añadir una compra</span></h2>
    <label class="campo"><span>Busca la empresa o el ETF</span>
      <input type="search" id="q" placeholder="Nombre o ticker: Inditex, Apple, MSCI World, KO…" autocomplete="off">
      <small>Elige la misma bolsa que aparece en tu broker (mira el ticker y la moneda). Si no aparece, escribe el ticker exacto.</small></label>
    <ul class="lista" id="res"></ul>`;
  const q = cont.querySelector("#q"), res = cont.querySelector("#res");
  const elegir = (tk) => ir(`#/compra?tk=${encodeURIComponent(tk)}`);
  q.addEventListener("input", () => {
    const t = normal(q.value.trim());
    res.innerHTML = "";
    if (t.length < 2) return;
    const encontrados = lista.filter((x) => normal(x.t).startsWith(t) || normal(x.n).includes(t)).slice(0, 25);
    for (const x of encontrados) {
      const li = document.createElement("li");
      li.innerHTML = `<button class="fila"><span class="txt"><span class="n">${escapar(x.n)}</span><span class="d">${escapar(x.t)}${x.m ? ` · ${escapar(x.m)}` : ""} · ${escapar(x.o || "")}</span></span><span class="v">${escapar(x.p || "")}</span></button>`;
      li.querySelector("button").addEventListener("click", () => elegir(x.t));
      res.append(li);
    }
    const tk = q.value.trim().toUpperCase();
    if (/^[A-Z0-9.\-]{1,15}$/.test(tk) && !encontrados.some((x) => x.t === tk)) {
      const li = document.createElement("li");
      li.innerHTML = `<button class="fila"><span class="txt"><span class="n">Usar el ticker «${escapar(tk)}»</span><span class="d">GitHub comprobará que existe al guardar</span></span><span class="v">→</span></button>`;
      li.querySelector("button").addEventListener("click", () => elegir(tk));
      res.append(li);
    }
  });
  setTimeout(() => q.focus(), 50);
}
