// ⚙️ Ajustes: la clave de GitHub (con una guía paso a paso), los datos guardados en el móvil y la versión.
import * as gh from "./github.js";
import { escapar, hace } from "./formato.js";
import { avisar, confirmar, ir } from "./app.js";

const ENLACE_CLAVE = "https://github.com/settings/personal-access-tokens/new";

export async function pantalla(cont) {
  const a = await gh.ajustes();
  const arbol = await (await import("./almacen.js")).leer("ajustes", "arbol");
  const fichas = await gh.fichasEnMovil();
  const total = arbol ? Object.keys(arbol.ficheros).filter((r) => r.startsWith("fichas/")).length : 0;
  cont.innerHTML = `
    <div class="marca"><img src="iconos/icono-192.png" alt=""><h2 style="margin:8px 0 0">Panel Buffett</h2>
      <p class="bl-nota" style="margin-top:2px">Tu panel de bolsa, también en el móvil. Herramienta educativa: no es asesoramiento financiero.</p></div>

    <h2 class="bp-h"><span class="t">🔑 Tu clave de GitHub</span></h2>
    ${a.token ? `<div class="seccion-aviso">✅ Clave guardada en este móvil${arbol ? ` · datos descargados ${escapar(hace(arbol.fecha))}` : ""}.</div>` : `<div class="seccion-aviso">👋 Para empezar, la app necesita una clave de tu cuenta de GitHub. Con ella lee tus datos y pide que se actualicen. Se crea una vez y solo sirve para tu repositorio «panel-buffett».</div>`}
    <details class="bl-exp" ${a.token ? "" : "open"}><summary>Cómo crear la clave (5 minutos)</summary><div>
      <ol class="pasos">
        <li>Abre <a href="${ENLACE_CLAVE}" target="_blank" rel="noopener">esta página de GitHub</a> (entra con tu cuenta <b>rangosto</b> si te lo pide).
          <br><small>¿Te sale «404» o se abre la app de GitHub? Esa app no tiene esta página. Mantén pulsado el texto de abajo, cópialo y pégalo en la barra de direcciones de <b>Chrome</b>:</small>
          <br><span class="codigo" style="user-select:all;word-break:break-all">${ENLACE_CLAVE}</span></li>
        <li><b>Token name</b>: escribe <span class="codigo">Panel Buffett móvil</span>. <b>Expiration</b>: elige <span class="codigo">Custom</span> y una fecha dentro de un año (cuando caduque, la app te avisará para crear otra).</li>
        <li><b>Repository access</b>: elige <span class="codigo">Only select repositories</span> y marca <span class="codigo">panel-buffett</span>.</li>
        <li><b>Permissions</b> → <b>Repository permissions</b> (o el botón <b>Add permissions</b>): pon <span class="codigo">Actions</span> en <b>Read and write</b> y <span class="codigo">Contents</span> en <b>Read-only</b>. Nada más (Metadata se pone sola).</li>
        <li>Pulsa <b>Generate token</b>, copia la clave (empieza por <span class="codigo">github_pat_</span>) y pégala aquí abajo.</li>
      </ol>
      <p class="bl-nota">Con esos permisos la app puede leer tus datos y lanzar las actualizaciones, pero no puede cambiar el código ni nada más de tu cuenta. Si pierdes el móvil, bórrala en GitHub (Settings → Developer settings → Personal access tokens).</p>
    </div></details>
    <form id="f-clave" novalidate>
      <label class="campo"><span>Clave</span><input type="password" id="token" autocomplete="off" placeholder="github_pat_…" value=""></label>
      <p id="estado-clave" class="bl-nota"></p>
      <div class="botones"><button class="boton" type="submit">${a.token ? "Cambiar la clave" : "Guardar y descargar mis datos"}</button></div>
    </form>

    <h2 class="bp-h"><span class="t">📦 Datos en este móvil</span></h2>
    <p class="bl-nota">Se guardan para que la app funcione sin conexión. Tienes ${fichas} de ${total} fichas de empresas; las demás se descargan al abrirlas.</p>
    <div class="botones">
      <button class="boton secundario" id="todas" ${a.token ? "" : "disabled"}>⬇️ Descargar todas las fichas</button>
      <button class="boton secundario" id="olvidar">🧹 Borrar los datos guardados</button>
    </div>

    <details class="bl-exp"><summary>Opciones avanzadas</summary><div>
      <label class="campo"><span>Repositorio</span><input type="text" id="repo" value="${escapar(a.repo)}" autocomplete="off"></label>
      <label class="campo"><span>Rama de datos</span><input type="text" id="rama" value="${escapar(a.rama)}" autocomplete="off"><small>Normalmente «datos». Para pruebas, «datos-prueba».</small></label>
      <label class="campo"><span>Rama de la cartera</span><input type="text" id="rama_cartera" value="${escapar(a.rama_cartera)}" autocomplete="off"><small>Normalmente «cartera».</small></label>
      <div class="botones"><button class="boton secundario" id="guardar-av">Guardar</button>
        <a class="boton secundario" href="https://github.com/${escapar(a.repo)}/actions" target="_blank" rel="noopener">Ver las actualizaciones en GitHub ↗</a></div>
      ${a.token ? `<div class="botones"><button class="boton peligro" id="quitar">Quitar la clave de este móvil</button></div>` : ""}
    </div></details>`;

  const estadoClave = cont.querySelector("#estado-clave");
  cont.querySelector("#f-clave").addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = cont.querySelector("#token").value.trim();
    if (!/^(github_pat_|ghp_|gho_)[A-Za-z0-9_]{20,}$/.test(token)) {
      estadoClave.textContent = "Eso no parece una clave de GitHub: debe empezar por «github_pat_». Cópiala entera.";
      return;
    }
    const anterior = a.token;
    await gh.guardarAjustes({ token });
    estadoClave.textContent = "Comprobando la clave…";
    try {
      await gh.arbol();
      estadoClave.textContent = "✅ Clave correcta. Descargando tus datos…";
      await gh.sincronizar({}, (t) => (estadoClave.textContent = t));
      avisar("Todo listo: ya tienes tus datos en el móvil.");
      location.hash = "#/mercado";
      location.reload();
    } catch (err) {
      await gh.guardarAjustes({ token: anterior });
      estadoClave.textContent = `❌ ${err.message}`;
    }
  });

  cont.querySelector("#todas")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      const n = await gh.sincronizar({ todas: true }, (t) => (e.target.textContent = t));
      avisar(`Listo: ${n} ficheros descargados. Ya puedes ver todas las fichas sin conexión.`);
    } catch (err) {
      avisar(err.message, true);
    }
    ir("#/ajustes");
  });

  cont.querySelector("#olvidar").addEventListener("click", async () => {
    if (await confirmar("¿Borrar los datos de este móvil?", "Se borran los datos descargados (no tu cartera, que está en GitHub). Se volverán a descargar al actualizar.", { si: "Sí, borrar", peligro: true })) {
      await gh.olvidarDatos();
      avisar("Datos borrados de este móvil.");
      ir("#/ajustes");
    }
  });

  cont.querySelector("#guardar-av").addEventListener("click", async () => {
    await gh.guardarAjustes({
      repo: cont.querySelector("#repo").value.trim() || gh.DEFECTO.repo,
      rama: cont.querySelector("#rama").value.trim() || gh.DEFECTO.rama,
      rama_cartera: cont.querySelector("#rama_cartera").value.trim() || gh.DEFECTO.rama_cartera,
    });
    await gh.olvidarDatos(); // los datos guardados eran de otra rama
    avisar("Guardado. Pulsa 🔄 para descargar los datos.");
    ir("#/ajustes");
  });

  cont.querySelector("#quitar")?.addEventListener("click", async () => {
    if (await confirmar("¿Quitar la clave?", "La app dejará de poder actualizar hasta que pegues una clave nueva. Para anularla del todo, bórrala también en GitHub.", { si: "Sí, quitarla", peligro: true })) {
      await gh.guardarAjustes({ token: "" });
      ir("#/ajustes");
    }
  });
}
