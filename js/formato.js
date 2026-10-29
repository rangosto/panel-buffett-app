// Formatos en español (1.234,56) y pequeñas utilidades sin dependencias (se prueban con node --test).

export function escapar(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** Markdown mínimo que usan las notas del panel: **negrita** y saltos de párrafo. Escapa todo lo demás. */
export function md(texto) {
  return escapar(texto)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\n\n/g, "<br><br>")
    .replace(/\n/g, "<br>");
}

export function num(v, decimales = 2) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return Number(v).toLocaleString("es-ES", { minimumFractionDigits: decimales, maximumFractionDigits: decimales, useGrouping: "always" });
}

/** Igual que core/formato.compacto: 4,50 bill. · 352,0 mil M · 12,3 M · 45.000 · 9.876,54 */
export function compacto(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e12) return `${num(v / 1e12, 2)} bill.`;
  if (a >= 1e9) return `${num(v / 1e9, 1)} mil M`;
  if (a >= 1e6) return `${num(v / 1e6, 1)} M`;
  if (a >= 1e4) return num(v, 0);
  return num(v, 2);
}

/** Valor de una celda según el formato de su columna (los mismos que st.column_config del panel). */
export function celda(v, col = {}) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v !== "number") return String(v);
  const f = col.formato || "";
  if (f === "compact") return compacto(v);
  const m = f.match(/^%([+]?)\.(\d)f$/);
  if (m) return (m[1] && v > 0 ? "+" : "") + num(v, Number(m[2]));
  if (Number.isInteger(v)) return v.toLocaleString("es-ES", { useGrouping: "always" });
  return v.toLocaleString("es-ES", { maximumFractionDigits: 2, useGrouping: "always" });
}

/** «hace 5 min», «hace 3 h», «hace 2 días» */
export function hace(fecha, ahora = Date.now()) {
  if (!fecha) return "nunca";
  const s = Math.max(0, (ahora - new Date(fecha).getTime()) / 1000);
  if (s < 90) return "hace un momento";
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 36 * 3600) return `hace ${Math.round(s / 3600)} h`;
  const d = Math.round(s / 86400);
  return `hace ${d} ${d === 1 ? "día" : "días"}`;
}

/** Número escrito a mano en el móvil: acepta coma o punto decimal («1,5» o «1.5»). */
export function leerNumero(texto) {
  const t = String(texto ?? "").trim().replace(/\s/g, "");
  if (!t) return NaN;
  // «1.234,56» → 1234.56 ; «1234.56» → 1234.56 ; «1,5» → 1.5
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  return /^[-+]?\d*\.?\d+$/.test(normal) ? Number(normal) : NaN;
}

/** Quita tildes y pasa a minúsculas, para buscar «telefonica» y encontrar «Telefónica». */
export function normal(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Las figuras llegan con los colores del modo claro: en modo oscuro se cambian por sus equivalentes. */
export function aOscuro(valor, mapa) {
  if (typeof valor === "string") return mapa[valor.toLowerCase()] ?? valor;
  if (Array.isArray(valor)) return valor.map((v) => aOscuro(v, mapa));
  if (valor && typeof valor === "object") {
    const out = {};
    for (const [k, v] of Object.entries(valor)) out[k] = aOscuro(v, mapa);
    return out;
  }
  return valor;
}

export function hoyISO(d = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function fechaES(iso) {
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : String(iso);
}
