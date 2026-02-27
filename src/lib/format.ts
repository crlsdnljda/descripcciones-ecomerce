/**
 * Convert plain text with \n into HTML <p> paragraphs.
 */
export function toHtmlParagraphs(text: string): string {
  if (!text) return "";
  if (/<\s*p[\s>]/i.test(text)) return text.trim();
  const parts = text.split(/\r?\n+/).map((t) => t.trim()).filter(Boolean);
  if (parts.length === 0) return "";
  return parts.map((p) => `<p>${p}</p>`).join("");
}

/**
 * Parse materials from various formats into a structured object.
 * Input can be:
 *   - JSON string: '{"Empeine":["piel sintetica"]}'
 *   - Text lines: "Empeine: piel sintetica, malla\nSuela: goma"
 */
export function parseMaterials(text: string): Record<string, string[]> {
  if (!text) return {};

  const trimmed = text.trim();

  // Try JSON parse first
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const result: Record<string, string[]> = {};
        for (const [key, val] of Object.entries(parsed)) {
          const cleanKey = String(key).replace(/["']/g, "").trim();
          if (!cleanKey) continue;
          const values = Array.isArray(val) ? val : [val];
          result[cleanKey] = values
            .map((v) => String(v).replace(/["']/g, "").trim())
            .filter(Boolean);
        }
        return result;
      }
    } catch {
      // Fall through to text parsing
    }
  }

  // Text line parsing: "Key: val1, val2"
  const lines = trimmed.split(/\r?\n+/).map((t) => t.trim()).filter(Boolean);
  const result: Record<string, string[]> = {};
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim().replace(/[.;,]+$/, "");
    const rest = line.slice(colonIdx + 1);
    const values = rest
      .split(/[;,]/)
      .map((v) => v.trim())
      .filter(Boolean)
      .map((v) => v.replace(/[.;]+$/, ""));
    if (key && values.length) result[key] = values;
  }
  return result;
}

/**
 * Format materials object to display text.
 */
export function materialsToText(materials: Record<string, string[]>): string {
  return Object.entries(materials)
    .map(([key, vals]) => `${key}: ${vals.join(", ")}`)
    .join("\n");
}
