function fmt(dt) {
  return Utilities.formatDate(dt, Session.getScriptTimeZone() || "Europe/Madrid", "yyyy-MM-dd HH:mm:ss");
}

/********************************************************
 * CONFIGURACIÓN GENERAL
 ********************************************************/

function guardarConfiguracion(config) {
  const props = {};
  for (let k in config) {
    props[k] = config[k] != null ? String(config[k]) : "";
  }
  PropertiesService.getDocumentProperties().setProperties(props);
  crearHojaOutputIA();
  showReferencias(); // Abrir automáticamente "Referencias" tras guardar
}

function getConfiguracion() {
  return PropertiesService.getDocumentProperties().getProperties();
}

function getSheets() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets().map(s => s.getName());
}

function getHeaders(nombreHoja) {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombreHoja);
  if (!hoja) return [];
  const ultimaCol = hoja.getLastColumn();
  if (ultimaCol === 0) return [];
  return hoja.getRange(1, 1, 1, ultimaCol).getValues()[0];
}

// CREAR HOJA OUTPUT IA (solo si no existe)
function crearHojaOutputIA() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = ss.getSheetByName("Output IA");
  if (!hoja) {
    hoja = ss.insertSheet("Output IA");
    hoja.appendRow(["Referencia", "Descripción", "Materiales", "Corregido"]);
  }
}

// CABECERAS DISPONIBLES
function getHeadersFromConfig() {
  const config = getConfiguracion();
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config.hojaBBDD);
  if (!hoja) return [];
  const ultimaCol = hoja.getLastColumn();
  if (ultimaCol === 0) return [];
  return hoja.getRange(1, 1, 1, ultimaCol).getValues()[0];
}

// GUARDAR Y CARGAR PROMPTS
function savePromptGuardado(nombre, contenido) {
  const cache = PropertiesService.getDocumentProperties();
  const guardados = JSON.parse(cache.getProperty("prompts") || "[]");
  guardados.push({ nombre, contenido });
  cache.setProperty("prompts", JSON.stringify(guardados));
}

function getPromptsGuardados() {
  const cache = PropertiesService.getDocumentProperties();
  return JSON.parse(cache.getProperty("prompts") || "[]");
}

function getPromptPorNombre(nombre) {
  const lista = getPromptsGuardados();
  const encontrado = lista.find(p => p.nombre === nombre);
  return encontrado ? encontrado.contenido : "";
}

// BORRAR PROMPT GUARDADO
function borrarPrompt(nombre) {
  const cache = PropertiesService.getDocumentProperties();
  let guardados = JSON.parse(cache.getProperty("prompts") || "[]");
  guardados = guardados.filter(p => p.nombre !== nombre);
  cache.setProperty("prompts", JSON.stringify(guardados));
}

// PROMPT DEL SISTEMA PERSONALIZADO
function getSystemPrompt() {
  const config = getConfiguracion();
  const basePrompt = `FORMATO DE SALIDA (JSON)
El resultado debe respetar exactamente esta estructura y no debe contener comillas simples ni dobles dentro de los textos:

{
  "descripcion": "Texto del primer parrafo.\nTexto del segundo parrafo.",
  "materiales": "Empeine: material1, material2, ...\nForro y plantilla: material1, material2, ...\nSuela: material1, material2, ..."
}

EJEMPLO DE SALIDA VALIDA

{
  "descripcion": "Zapatilla deportiva con estilo retro y moderno.\nIdeal para uso diario o looks urbanos con personalidad.",
  "materiales": "Empeine: malla tecnica, piel sintetica\nForro y plantilla: textil, espuma viscoelastica\nSuela: goma EVA, caucho antideslizante"
}

Reglas de formato para los textos:
- No incluyas comillas simples ni dobles dentro de los textos.
- Separa parrafos con \\n; el sistema convertira a HTML posteriormente.
- Usa siempre las dos claves: "descripcion" y "materiales".`;

  if (config.systemPrompt && config.systemPrompt.trim() !== "") {
    return basePrompt + "\n\n" + config.systemPrompt.trim();
  }
  return basePrompt;
}

/********************************************************
 * CONFIGURACIÓN PROCESO OPENAI
 ********************************************************/
const BATCH_SIZE = 20;
const TRIGGER_DELAY_MS = 5000;

/********************************************************
 * PROCESAR REFERENCIAS (INICIO) - OPENAI
 ********************************************************/
function procesarReferencias(referencias, promptBase) {
  let lista = [];

  if (Array.isArray(referencias)) {
    lista = referencias;
  } else if (typeof referencias === "string") {
    lista = referencias.split(/[\n,;]+/);
  } else {
    Logger.log("Formato de referencias no soportado: " + (typeof referencias));
    return;
  }

  lista = lista
    .map(r => String(r).trim())
    .filter(r => r);

  if (!lista.length) {
    Logger.log("No hay referencias válidas para procesar.");
    return;
  }

  const config = getConfiguracion();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hojaBBDD = ss.getSheetByName(config.hojaBBDD);
  if (!hojaBBDD) {
    throw new Error("No existe la hoja de base de datos configurada: " + config.hojaBBDD);
  }

  const state = {
    referencias: lista,
    promptBase: promptBase || "",
    index: 0
  };

  const props = PropertiesService.getScriptProperties();
  props.setProperty("REFERENCIAS_STATE", JSON.stringify(state));

  limpiarTriggers_ProcesarReferencias();
  asegurarHojaOutputIA();

  ScriptApp.newTrigger("procesarReferenciasLote")
    .timeBased()
    .after(1000)
    .create();

  Logger.log("Inicio de procesamiento de " + lista.length + " referencias en lotes de " + BATCH_SIZE);
}

/********************************************************
 * PROCESAR REFERENCIAS EN LOTE - OPENAI
 ********************************************************/
function procesarReferenciasLote() {
  const props = PropertiesService.getScriptProperties();
  const stateJson = props.getProperty("REFERENCIAS_STATE");

  if (!stateJson) {
    Logger.log("[procesarReferenciasLote] No hay estado activo. Se detiene.");
    limpiarTriggers_ProcesarReferencias();
    return;
  }

  const state = JSON.parse(stateJson);
  const referencias = state.referencias || [];
  let index = state.index || 0;
  const promptBase = state.promptBase || "";

  if (index >= referencias.length) {
    Logger.log("[procesarReferenciasLote] Todo completado. Total: " + referencias.length);
    props.deleteProperty("REFERENCIAS_STATE");
    limpiarTriggers_ProcesarReferencias();
    return;
  }

  const config = getConfiguracion();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hojaBBDD = ss.getSheetByName(config.hojaBBDD);

  if (!hojaBBDD) {
    Logger.log("[procesarReferenciasLote] No existe hoja BBDD.");
    props.deleteProperty("REFERENCIAS_STATE");
    limpiarTriggers_ProcesarReferencias();
    return;
  }

  const lastRow = hojaBBDD.getLastRow();
  const lastCol = hojaBBDD.getLastColumn();
  if (lastRow < 2) {
    Logger.log("[procesarReferenciasLote] Hoja BBDD sin datos.");
    props.deleteProperty("REFERENCIAS_STATE");
    limpiarTriggers_ProcesarReferencias();
    return;
  }

  const headers = hojaBBDD.getRange(1, 1, 1, lastCol).getValues()[0];
  const numFilas = lastRow - 1;
  const datos = hojaBBDD.getRange(2, 1, numFilas, lastCol).getValues();

  const idIndex = headers.indexOf(config.idColumn);
  const imgIndex = headers.indexOf(config.imagenColumn);

  if (idIndex === -1) {
    Logger.log("[procesarReferenciasLote] No se encontró columna ID: " + config.idColumn);
    props.deleteProperty("REFERENCIAS_STATE");
    limpiarTriggers_ProcesarReferencias();
    return;
  }

  const output = asegurarHojaOutputIA();

  Logger.log("[procesarReferenciasLote] Procesando lote desde índice " + index);

  let procesadas = 0;

  while (index < referencias.length && procesadas < BATCH_SIZE) {
    const ref = String(referencias[index] || "").trim();
    Logger.log("[procesarReferenciasLote] Ref " + (index + 1) + "/" + referencias.length + ": " + ref);

    try {
      const fila = datos.find(r => String(r[idIndex]) === ref);

      if (!fila) {
        Logger.log("[procesarReferenciasLote] No se encontró en BBDD: " + ref);
      } else {
        let prompt = promptBase;
        headers.forEach((h, j) => {
          const valor = fila[j] != null ? String(fila[j]) : "";
          prompt = prompt.replaceAll(`{{${h}}}`, valor);
        });

        const imagen =
          (imgIndex !== -1 && fila[imgIndex] && String(fila[imgIndex]).trim() !== "")
            ? String(fila[imgIndex])
            : "";

        const respuesta = llamarOpenAI(prompt, imagen, config.apiKey);

        if (!respuesta || typeof respuesta.descripcion !== "string" ||
          respuesta.descripcion.startsWith("ERROR")) {
          Logger.log("[procesarReferenciasLote] Error OpenAI en " + ref + ": " +
            (respuesta && respuesta.descripcion ? respuesta.descripcion : "sin respuesta"));
        } else {
          output.appendRow([
            ref,
            respuesta.descripcion || "",
            respuesta.materiales || "",
            "No"
          ]);
          Logger.log("[procesarReferenciasLote] OK " + ref);
        }
      }
    } catch (e) {
      Logger.log("[procesarReferenciasLote] Excepción en " + ref + ": " + e);
    }

    index++;
    procesadas++;
  }

  state.index = index;
  props.setProperty("REFERENCIAS_STATE", JSON.stringify(state));

  limpiarTriggers_ProcesarReferencias();

  if (index < referencias.length) {
    ScriptApp.newTrigger("procesarReferenciasLote")
      .timeBased()
      .after(TRIGGER_DELAY_MS)
      .create();

    Logger.log("[procesarReferenciasLote] Programado siguiente lote. Siguiente índice: " + index);
  } else {
    props.deleteProperty("REFERENCIAS_STATE");
    limpiarTriggers_ProcesarReferencias();
    Logger.log("[procesarReferenciasLote] Procesamiento completado.");
  }
}

function asegurarHojaOutputIA() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Output IA");
  if (!sheet) {
    sheet = ss.insertSheet("Output IA");
    sheet.appendRow(["Referencia", "Descripción", "Materiales", "Revisado"]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function limpiarTriggers_ProcesarReferencias() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    const f = t.getHandlerFunction && t.getHandlerFunction();
    if (f === "procesarReferenciasLote") {
      ScriptApp.deleteTrigger(t);
    }
  });
}

/********************************************************
 * LLAMAR A OPENAI
 ********************************************************/
function llamarOpenAI(prompt, imagenUrl, apiKey) {
  const url = "https://api.openai.com/v1/chat/completions";
  const headers = {
    "Authorization": "Bearer " + apiKey,
    "Content-Type": "application/json"
  };

  const textoSystem =
    getSystemPrompt() +
    "\n\n" +
    "INSTRUCCIONES DE FORMATO MUY IMPORTANTES:\n" +
    "Devuelve EXCLUSIVAMENTE un objeto JSON valido, sin texto adicional antes ni despues.\n" +
    "El formato debe ser SIEMPRE exactamente este:\n" +
    '{\n' +
    '  "descripcion": "Texto del primer parrafo.\\nTexto del segundo parrafo.",\n' +
    '  "materiales": "Empeine: material1, material2, ...\\nForro y plantilla: material1, material2, ...\\nSuela: material1, material2, ..."\n' +
    '}\n' +
    "Reglas:\n" +
    '- No anadas comentarios ni texto fuera del JSON.\n' +
    '- Usa siempre las dos claves: "descripcion" y "materiales".\n' +
    '- No uses comillas simples ni dobles dentro de los textos devueltos.\n' +
    '- Separa los parrafos de la descripcion con \\n; el sistema los convertira a HTML.\n' +
    '- Dentro de los textos usa "\\n" para saltos de linea.';

  const systemPrompt = { type: "text", text: textoSystem };
  const userContent = [{ type: "text", text: prompt }];

  if (typeof imagenUrl === "string" && imagenUrl.match(/^https?:\/\//i)) {
    userContent.push({ type: "image_url", image_url: { url: imagenUrl } });
  } else if (typeof imagenUrl === "string" && imagenUrl.startsWith("data:image/")) {
    userContent.push({ type: "image_url", image_url: { url: imagenUrl } });
  }

  const payload = {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: [systemPrompt] },
      { role: "user", content: userContent }
    ],
    response_format: { type: "json_object" },
    temperature: 1,
    max_tokens: 1024,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0
  };

  try {
    const res = UrlFetchApp.fetch(url, {
      method: "post",
      headers,
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const code = res.getResponseCode();
    const body = res.getContentText();

    if (code !== 200) {
      return { descripcion: "ERROR: " + code, materiales: "" };
    }

    const json = JSON.parse(body);
    const texto = json.choices?.[0]?.message?.content || "";

    try {
      const parsed = JSON.parse(texto);
      return {
        descripcion: formatDescription_(parsed.descripcion || ""),
        materiales: formatMaterials_(parsed.materiales || "")
      };
    } catch (e) {
      return { descripcion: texto || "", materiales: "" };
    }
  } catch (e) {
    return { descripcion: "ERROR", materiales: "ERROR" };
  }
}

/********************************************************
 * PENDIENTES POR CORREGIR
 ********************************************************/
function getPendientes(filtro) {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Output IA");
  if (!hoja) return [];
  const numFilas = hoja.getLastRow();
  if (numFilas <= 1) return [];
  const datos = hoja.getRange(2, 1, numFilas - 1, 4).getValues();
  const pendientes = datos
    .map((r, i) => ({
      referencia: r[0]?.toString() || "",
      descripcion: r[1]?.toString() || "",
      materiales: r[2]?.toString() || "",
      corregido: (r[3] || "").toString().trim().toLowerCase(),
      fila: i + 2,
    }))
    .filter(p => p.corregido !== "sí")
    .filter(p => !filtro || p.referencia.toLowerCase().includes(filtro.toLowerCase()))
    .map(p => ({
      ...p,
      imagen: getImagenDeReferencia(p.referencia)
    }));
  return pendientes;
}

function guardarCorreccion(ref, desc, mat) {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Output IA");
  const datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues();
  const fila = datos.findIndex(r => String(r[0]) === String(ref));
  if (fila !== -1) {
    hoja.getRange(fila + 2, 2).setValue(desc);
    hoja.getRange(fila + 2, 3).setValue(mat);
    hoja.getRange(fila + 2, 4).setValue("Sí");
  }
}

function getImagenDeReferencia(ref) {
  const config = getConfiguracion();
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config.hojaBBDD);
  const headers = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  const datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, headers.length).getValues();
  const idIndex = headers.indexOf(config.idColumn);
  const imgIndex = headers.indexOf(config.imagenColumn);
  const fila = datos.find(row => String(row[idIndex]) === String(ref));
  return fila ? fila[imgIndex] : "";
}

/********************************************************
 * MOSTRAR VISTAS HTML
 ********************************************************/
function showReferencias() {
  const html = HtmlService.createHtmlOutputFromFile("referencias").setWidth(800).setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(html, "Añadir referencias");
}

function showPendientes() {
  const html = HtmlService.createHtmlOutputFromFile("pendientes").setWidth(900).setHeight(700);
  SpreadsheetApp.getUi().showModalDialog(html, "Corregir pendientes");
}

function mostrarConfiguracion() {
  const html = HtmlService.createHtmlOutputFromFile("configuracion").setWidth(700).setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(html, "Configuración");
}

function mostrarImportador() {
  const html = HtmlService.createHtmlOutputFromFile("importar").setWidth(600).setHeight(500);
  SpreadsheetApp.getUi().showModalDialog(html, "Importar traducciones");
}

/********************************************************
 * MENÚ PERSONALIZADO
 ********************************************************/
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('IA Productos')
    .addItem('Configurar', 'mostrarConfiguracion')
    .addItem('Añadir referencias', 'showReferencias')
    .addItem('Corregir pendientes', 'showPendientes')
    .addItem('Importar traducciones', 'mostrarImportador')
    .addToUi();

  ui.createMenu('Informax - Info Productos')
    .addItem('Leer Productos', 'leerProductosOrigen')
    .addItem('Actualizar en Origen', 'enviarOrigen')
    .addToUi();
}

/********************************************************
 * IDIOMAS PERSONALIZADOS
 ********************************************************/
function guardarIdiomasPersonalizados(idiomas) {
  if (!Array.isArray(idiomas)) return;
  PropertiesService.getDocumentProperties().setProperty('idiomasPersonalizados', JSON.stringify(idiomas));
}

function getIdiomasPersonalizados() {
  const prop = PropertiesService.getDocumentProperties().getProperty('idiomasPersonalizados');
  if (!prop) return ['fr', 'pt', 'de', 'it'];
  try { return JSON.parse(prop); } catch (e) { return ['fr', 'pt', 'de', 'it']; }
}

/********************************************************
 * HELPERS DE FORMATO
 ********************************************************/
function quitarTildes_(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function esVerdadero_(v) {
  const s = quitarTildes_(String(v).trim().toLowerCase());
  return s === 'si' || s === 'sí' || s === 'yes' || s === 'y' || s === '1' || s === 'true';
}
function toHtmlParagraphs_(text) {
  const parts = String(text || '').split(/\r?\n+/).map(t => t.trim()).filter(Boolean);
  if (parts.length === 0) return '';
  if (/<\s*p[\s>]/i.test(text || '')) return String(text || '');
  return parts.map(p => `<p>${p}</p>`).join('');
}
function normalizeOutputField_(text, asHtml) {
  const cleaned = String(text || "").replace(/["']/g, "").trim();
  if (!asHtml) return cleaned;
  if (/<\s*p[\s>]/i.test(text || '')) return String(text || "").trim();
  return toHtmlParagraphs_(cleaned);
}
function formatDescription_(text) {
  return normalizeOutputField_(text, false);
}
function formatMaterials_(text) {
  const cleaned = String(text || "").replace(/["']/g, "").trim();
  const withBreaks = cleaned
    .replace(/\s*Forro y plantilla:/gi, "\nForro y plantilla:")
    .replace(/\s*Suela:/gi, "\nSuela:")
    .replace(/\s*Forro:/gi, "\nForro:")
    .replace(/\s*Plantilla:/gi, "\nPlantilla:");
  return withBreaks.split(/\r?\n+/).map(s => s.trim()).filter(Boolean).join("\n");
}
