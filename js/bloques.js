// Pinta los bloques que genera el motor (los mismos que dibuja el panel del PC): HTML con ⓘ, gráficos, tablas, pestañas…
import { aOscuro, celda, escapar, md } from "./formato.js";

const FILAS_INICIALES = 40;

/** ctx: { oscuro, colores, abrirFicha(ticker), ayuda(texto) } */
export function pintar(bloques, contenedor, ctx) {
  for (const b of bloques || []) {
    const el = uno(b, ctx);
    if (el) contenedor.append(el);
  }
}

function crear(etiqueta, clase, html) {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (html !== undefined) el.innerHTML = html;
  return el;
}

function uno(b, ctx) {
  switch (b.t) {
    case "html":
      return crear("div", "bl-html", b.html); // HTML generado (y escapado) por nuestro propio motor
    case "grafico":
      return grafico(b.fig, ctx);
    case "nota":
      return crear("p", "bl-nota", md(b.md));
    case "texto":
      return crear("p", "bl-texto", md(b.md));
    case "aviso":
      return crear("div", `bl-aviso ${escapar(b.tipo)}`, (b.icono ? `${escapar(b.icono)} ` : "") + md(b.texto));
    case "tabla":
      return tabla(b, ctx);
    case "pestañas":
      return pestañas(b, ctx);
    case "expansor": {
      const d = crear("details", "bl-exp", `<summary>${escapar(b.titulo)}</summary>`);
      const dentro = crear("div");
      pintar(b.bloques, dentro, ctx);
      d.append(dentro);
      return d;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------- gráficos

const pendientes = new Map();
const vigia = "IntersectionObserver" in window
  ? new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (e.isIntersecting && pendientes.has(e.target)) {
          const dibujar = pendientes.get(e.target);
          pendientes.delete(e.target);
          vigia.unobserve(e.target);
          dibujar();
        }
      }
    }, { rootMargin: "300px 0px" })
  : null;

export function grafico(fig, ctx) {
  const div = crear("div", "bl-graf");
  const f = ctx.oscuro && ctx.colores ? aOscuro(fig, ctx.colores) : fig;
  const layout = { ...f.layout, autosize: true, dragmode: false };
  delete layout.width;
  div.style.minHeight = `${layout.height || 320}px`;
  // en el móvil el dedo desplaza la página: los ejes no se arrastran ni hacen zoom (los botones de periodo sí funcionan)
  for (const k of Object.keys(layout)) if (/^[xy]axis\d*$/.test(k)) layout[k] = { ...layout[k], fixedrange: true };
  const dibujar = () => {
    if (!window.Plotly) return setTimeout(dibujar, 150);
    window.Plotly.newPlot(div, f.data, layout, { displayModeBar: false, responsive: true, scrollZoom: false, doubleClick: false });
    if (ctx.alTocarPunto) div.on?.("plotly_click", (ev) => ctx.alTocarPunto(ev.points?.[0]));
  };
  if (vigia) {
    pendientes.set(div, dibujar);
    vigia.observe(div);
  } else {
    setTimeout(dibujar, 0);
  }
  return div;
}

// ---------------------------------------------------------------- tablas

export function tabla(b, ctx) {
  const cols = b.columnas || [];
  const iTicker = cols.findIndex((c) => c.id === "ticker");
  const caja = crear("div");
  const envoltorio = crear("div", "bl-tabla");
  const t = crear("table");
  const cab = cols.map((c, i) => {
    const ayuda = c.ayuda ? ` <button class="bp-info ayuda" data-col="${i}" aria-label="Qué es ${escapar(c.titulo)}">i</button>` : "";
    return `<th scope="col">${escapar(c.titulo)}${ayuda}</th>`;
  });
  t.innerHTML = `<thead><tr>${cab.join("")}</tr></thead><tbody></tbody>`;
  t.querySelectorAll("button.ayuda").forEach((btn) =>
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      ctx.ayuda?.(cols[Number(btn.dataset.col)].ayuda);
    }),
  );
  const cuerpo = t.querySelector("tbody");
  const filas = b.filas || [];
  const añadir = (desde, hasta) => {
    for (const fila of filas.slice(desde, hasta)) {
      const tr = document.createElement("tr");
      fila.forEach((v, i) => {
        const c = cols[i] || {};
        const td = document.createElement("td");
        if (c.tipo === "progreso" && typeof v === "number") {
          const min = c.minimo ?? 0, max = c.maximo ?? 100;
          const pct = Math.max(0, Math.min(100, ((v - min) / ((max - min) || 1)) * 100));
          td.innerHTML = `<span class="prog"><i><b style="width:${pct.toFixed(0)}%"></b></i>${escapar(celda(v, c))}</span>`;
        } else {
          td.textContent = celda(v, c);
          if (typeof v !== "number") td.className = "t";
        }
        tr.append(td);
      });
      if (iTicker >= 0 && ctx.abrirFicha) {
        tr.className = "tocable";
        tr.addEventListener("click", () => ctx.alTocarFila ? ctx.alTocarFila(fila[iTicker], fila) : ctx.abrirFicha(fila[iTicker]));
      }
      cuerpo.append(tr);
    }
  };
  añadir(0, FILAS_INICIALES);
  envoltorio.append(t);
  caja.append(envoltorio);
  if (filas.length > FILAS_INICIALES) {
    const mas = crear("button", "boton secundario tabla-mas", `Ver las ${filas.length - FILAS_INICIALES} filas restantes`);
    mas.addEventListener("click", () => {
      añadir(FILAS_INICIALES, filas.length);
      mas.remove();
    });
    caja.append(mas);
  }
  return caja;
}

// ---------------------------------------------------------------- pestañas

function pestañas(b, ctx) {
  const caja = crear("div", "bl-tabs");
  const nav = crear("nav");
  nav.setAttribute("role", "tablist");
  const paneles = b.paneles.map((bloques) => {
    const p = crear("div");
    p.setAttribute("role", "tabpanel");
    pintar(bloques, p, ctx);
    return p;
  });
  b.nombres.forEach((nombre, i) => {
    const btn = crear("button", "", escapar(nombre));
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", String(i === 0));
    btn.addEventListener("click", () => {
      nav.querySelectorAll("button").forEach((x, j) => x.setAttribute("aria-selected", String(j === i)));
      paneles.forEach((p, j) => (p.hidden = j !== i));
      btn.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
      window.dispatchEvent(new Event("resize")); // los gráficos que estaban ocultos se ajustan al ancho
    });
    nav.append(btn);
  });
  paneles.forEach((p, j) => (p.hidden = j !== 0));
  caja.append(nav, ...paneles);
  return caja;
}
