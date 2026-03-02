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
 */
export async function translateDescriptionBatch(
  output: DescriptionOutput,
  targetLangs: string[],
  model: string = "gpt-4o-mini"
): Promise<Record<string, DescriptionOutput>> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const langList = targetLangs
    .map((code) => `"${code}": ${LANG_NAMES[code] || code}`)
    .join(", ");

  const prompt = `Translate the following product content to these languages: ${langList}.

Return a JSON object where each key is the language code and the value is the translated content with the same structure {"descripcion": "...", "materiales": {...}}.
The "descripcion" MUST contain the full translated text for each language, never empty.
The keys inside "materiales" must also be translated to each target language.

Content to translate:
${JSON.stringify(output, null, 2)}

Expected response format:
{
  ${targetLangs.map((code) => `"${code}": { "descripcion": "translated text...", "materiales": { ... } }`).join(",\n  ")}
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
    result[lang] = {
      descripcion: entry.descripcion,
      materiales:
        entry.materiales && typeof entry.materiales === "object"
          ? entry.materiales
          : {},
    };
  }

  return result;
}
