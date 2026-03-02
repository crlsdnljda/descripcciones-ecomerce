import OpenAI from "openai";
import type { DescriptionOutput } from "@/core/db/schema/descriptions";

const SYSTEM_PROMPT_BASE = `FORMATO DE SALIDA (JSON)
El resultado debe respetar exactamente esta estructura:

{
  "descripcion": "Texto del primer parrafo.\\nTexto del segundo parrafo.",
  "materiales": {
    "Empeine": ["material1", "material2"],
    "Forro y plantilla": ["material1", "material2"],
    "Suela": ["material1", "material2"]
  }
}

Reglas de formato:
- Devuelve EXCLUSIVAMENTE un objeto JSON valido, sin texto adicional.
- "descripcion" es un string con parrafos separados por \\n.
- "materiales" es un objeto donde cada clave es una zona del producto y el valor es un array de materiales.
- No uses comillas simples ni dobles dentro de los textos.
- Usa siempre las dos claves: "descripcion" y "materiales".`;

/**
 * Call OpenAI to generate a product description.
 */
export async function generateDescription(
  prompt: string,
  imageUrl: string | null,
  model: string = "gpt-4o",
  customSystemPrompt?: string | null,
  materialsLibrary?: Record<string, string[]> | null
): Promise<DescriptionOutput> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  let systemText = customSystemPrompt
    ? `${SYSTEM_PROMPT_BASE}\n\n${customSystemPrompt}`
    : SYSTEM_PROMPT_BASE;

  // Append materials library for consistency
  if (materialsLibrary && Object.keys(materialsLibrary).length > 0) {
    const libLines: string[] = [];
    for (const [zone, mats] of Object.entries(materialsLibrary)) {
      libLines.push(`  ${zone}: ${mats.join(", ")}`);
    }
    systemText += `\n\nBIBLIOTECA DE MATERIALES EXISTENTES (usa estos nombres exactos cuando corresponda para mantener consistencia):
${libLines.join("\n")}
Si el producto tiene materiales que no están en la biblioteca, puedes usar nombres nuevos.`;
  }

  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: prompt },
  ];

  if (imageUrl && (imageUrl.startsWith("http") || imageUrl.startsWith("data:image/"))) {
    userContent.push({
      type: "image_url",
      image_url: { url: imageUrl },
    });
  }

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemText },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
    temperature: 1,
    max_tokens: 1024,
  });

  const text = completion.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(text);

  return {
    descripcion: typeof parsed.descripcion === "string" ? parsed.descripcion : "",
    materiales:
      parsed.materiales && typeof parsed.materiales === "object"
        ? parsed.materiales
        : {},
  };
}

const LANG_NAMES: Record<string, string> = {
  en: "English",
  fr: "French (français)",
  de: "German (Deutsch)",
  it: "Italian (italiano)",
  pt: "Portuguese (português)",
  nl: "Dutch (Nederlands)",
  pl: "Polish (polski)",
  cs: "Czech (čeština)",
  ro: "Romanian (română)",
  hu: "Hungarian (magyar)",
  sv: "Swedish (svenska)",
  da: "Danish (dansk)",
  fi: "Finnish (suomi)",
  no: "Norwegian (norsk)",
  el: "Greek (ελληνικά)",
  bg: "Bulgarian (български)",
  hr: "Croatian (hrvatski)",
  sk: "Slovak (slovenčina)",
  sl: "Slovenian (slovenščina)",
  et: "Estonian (eesti)",
  lv: "Latvian (latviešu)",
  lt: "Lithuanian (lietuvių)",
  ja: "Japanese (日本語)",
  zh: "Chinese (中文)",
  ko: "Korean (한국어)",
  ar: "Arabic (العربية)",
  tr: "Turkish (Türkçe)",
  ru: "Russian (русский)",
};

/**
 * Call OpenAI to translate a description to multiple languages in one call.
 * Returns a Record mapping each language code to its translated DescriptionOutput.
 * existingTranslations: previously translated materials per language for consistency.
 */
export async function translateDescriptionBatch(
  output: DescriptionOutput,
  targetLangs: string[],
  model: string = "gpt-4o-mini",
  existingTranslations?: Record<string, Record<string, string[]>>
): Promise<Record<string, DescriptionOutput>> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const langList = targetLangs
    .map((code) => `"${code}": ${LANG_NAMES[code] || code}`)
    .join(", ");

  let referenceBlock = "";
  if (existingTranslations && Object.keys(existingTranslations).length > 0) {
    const lines: string[] = [];
    for (const [lang, mats] of Object.entries(existingTranslations)) {
      const matLines = Object.entries(mats)
        .map(([zone, vals]) => `  ${zone}: ${vals.join(", ")}`)
        .join("\n");
      if (matLines) lines.push(`${LANG_NAMES[lang] || lang}:\n${matLines}`);
    }
    if (lines.length) {
      referenceBlock = `\n\nREFERENCE — Previously translated materials (reuse these exact terms for consistency):\n${lines.join("\n\n")}`;
    }
  }

  const prompt = `Translate the following product content to these languages: ${langList}.

Return a JSON object where each key is the language code and the value has the structure {"descripcion": "...", "materiales": {...}}.

Rules:
- "descripcion" MUST contain the full translated text for each language, never empty.
- The keys inside "materiales" (zone names) must be translated to each target language.
- Material VALUES must be Capitalized (first letter uppercase), e.g. "caucho" → "Caucho", "rubber" → "Rubber".
- If a zone has multiple materials, keep them as an array: ["Sintético", "Textil"].
- Translate the zone keys AND the material values to each target language.

Content to translate:
${JSON.stringify(output, null, 2)}${referenceBlock}

Expected response format:
{
  ${targetLangs.map((code) => `"${code}": { "descripcion": "translated text...", "materiales": { "TranslatedZone": ["Material1", "Material2"] } }`).join(",\n  ")}
}

Return only the JSON, no additional text.`;

  const completion = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 4096,
  });

  const text = completion.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(text);

  const result: Record<string, DescriptionOutput> = {};

  for (const lang of targetLangs) {
    const entry = parsed[lang];
    if (!entry || typeof entry.descripcion !== "string" || !entry.descripcion.trim()) {
      throw new Error(`Translation to ${lang} returned empty or missing descripcion`);
    }

    // Capitalize material values
    const materiales: Record<string, string[]> = {};
    if (entry.materiales && typeof entry.materiales === "object") {
      for (const [zone, vals] of Object.entries(entry.materiales)) {
        const arr = Array.isArray(vals) ? vals : [vals];
        materiales[zone] = arr.map((v: unknown) => {
          const s = String(v).trim();
          return s.charAt(0).toUpperCase() + s.slice(1);
        });
      }
    }

    result[lang] = { descripcion: entry.descripcion, materiales };
  }

  return result;
}
