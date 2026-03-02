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
 * Call OpenAI to translate a description to another language.
 */
export async function translateDescription(
  output: DescriptionOutput,
  targetLang: string,
  model: string = "gpt-4o-mini"
): Promise<DescriptionOutput> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const langName = LANG_NAMES[targetLang] || targetLang;

  const prompt = `Translate the following product content to ${langName}.
Return ONLY a valid JSON with the exact same structure.
The keys in "materiales" must also be translated to ${langName}.
The "descripcion" value MUST contain the full translated text, never empty.

Content to translate:
${JSON.stringify(output, null, 2)}

Return only the translated JSON, no additional text.`;

  const completion = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 2048,
  });

  const text = completion.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(text);

  const descripcion = typeof parsed.descripcion === "string" ? parsed.descripcion : "";
  const materiales =
    parsed.materiales && typeof parsed.materiales === "object"
      ? parsed.materiales
      : {};

  if (!descripcion.trim()) {
    throw new Error(`Translation to ${targetLang} returned empty descripcion`);
  }

  return { descripcion, materiales };
}
