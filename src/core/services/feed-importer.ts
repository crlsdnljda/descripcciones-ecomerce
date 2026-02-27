/**
 * Feed Importer Service
 * Fetches and parses product feeds from URLs (JSON, CSV, XML)
 * Detects columns dynamically and returns flat records with raw_data.
 */

interface FeedResult {
  records: Record<string, unknown>[];
  columns: string[];
  path: string;
}

/**
 * Fetch and parse a feed URL, returning flat records and detected columns.
 */
export async function importFeed(
  url: string,
  feedType: string = "json"
): Promise<FeedResult> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Feed HTTP error: ${response.status}`);
  }

  const text = await response.text();

  switch (feedType) {
    case "json":
      return parseJsonFeed(text);
    case "csv":
      return parseCsvFeed(text);
    case "xml":
      return parseXmlFeed(text);
    default:
      return parseJsonFeed(text);
  }
}

/**
 * Parse a JSON feed. Handles arrays, objects with array properties, and dirty JSON.
 */
function parseJsonFeed(text: string): FeedResult {
  const cleaned = text.replace(/^\uFEFF/, "").trim();
  let data: unknown;

  try {
    data = JSON.parse(cleaned);
  } catch {
    // Try NDJSON (one JSON object per line) — very common format
    const lines = cleaned.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const ndjsonRecords: unknown[] = [];
    let ndjsonOk = true;
    for (const line of lines) {
      try {
        ndjsonRecords.push(JSON.parse(line));
      } catch {
        ndjsonOk = false;
        break;
      }
    }
    if (ndjsonOk && ndjsonRecords.length > 0) {
      data = ndjsonRecords;
    } else {
      // Try extracting JSON from dirty text
      const first = Math.min(
        ...[cleaned.indexOf("{"), cleaned.indexOf("[")].filter((i) => i >= 0)
      );
      const last = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
      if (first >= 0 && last > first) {
        try {
          data = JSON.parse(cleaned.slice(first, last + 1));
        } catch {
          throw new Error("No se pudo parsear el JSON del feed");
        }
      } else {
        throw new Error("No se pudo parsear el JSON del feed");
      }
    }
  }

  // Find the main array
  const pick = pickMainArray(data);
  if (!pick.records.length) {
    return { records: [], columns: [], path: pick.path };
  }

  // Flatten records and extract all column names
  const flatRecords: Record<string, unknown>[] = [];
  const columnSet = new Set<string>();

  for (const rec of pick.records) {
    if (!rec || typeof rec !== "object") continue;
    const flat = flattenObject(rec as Record<string, unknown>);
    flatRecords.push(flat);
    Object.keys(flat).forEach((k) => columnSet.add(k));
  }

  const columns = Array.from(columnSet).sort((a, b) =>
    a.localeCompare(b, "es", { sensitivity: "base" })
  );

  return { records: flatRecords, columns, path: pick.path };
}

/**
 * Parse CSV text into records.
 */
function parseCsvFeed(text: string): FeedResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { records: [], columns: [], path: "csv" };
  }

  const headers = parseCsvLine(lines[0]);
  const records: Record<string, unknown>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const record: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      record[h] = values[idx] ?? "";
    });
    records.push(record);
  }

  return { records, columns: headers, path: "csv" };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === "," || ch === ";") {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parse XML text into records.
 * Optimized for large feeds: detects the repeating element and extracts items
 * with fast indexOf instead of recursively parsing the entire XML tree.
 */
function parseXmlFeed(text: string): FeedResult {
  const cleaned = text.replace(/^\uFEFF/, "").trim();

  // Remove XML declaration
  const xml = cleaned
    .replace(/<\?xml[^?]*\?>/gi, "")
    .trim();

  // Detect the repeating item element by sampling the first 20KB
  const itemTag = detectItemTag(xml);
  if (!itemTag) {
    return { records: [], columns: [], path: "(no repeating element found)" };
  }

  const openStr = `<${itemTag}`;
  const closeStr = `</${itemTag}>`;

  const flatRecords: Record<string, unknown>[] = [];
  const columnSet = new Set<string>();

  let pos = 0;
  while (pos < xml.length) {
    const itemStart = xml.indexOf(openStr, pos);
    if (itemStart === -1) break;

    // Verify it's the exact tag (not a prefix match like <RowExtra>)
    const nextChar = xml[itemStart + openStr.length];
    if (nextChar !== ">" && nextChar !== " " && nextChar !== "/" && nextChar !== "\t" && nextChar !== "\n" && nextChar !== "\r") {
      pos = itemStart + 1;
      continue;
    }

    const contentStart = xml.indexOf(">", itemStart) + 1;
    const closePos = xml.indexOf(closeStr, contentStart);
    if (closePos === -1) break;

    // Parse just this item's content (small, fast)
    const content = xml.slice(contentStart, closePos);
    const parsed = parseXmlToObject(content);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const flat = flattenObject(parsed as Record<string, unknown>);
      flatRecords.push(flat);
      Object.keys(flat).forEach((k) => columnSet.add(k));
    }

    pos = closePos + closeStr.length;
  }

  const columns = Array.from(columnSet).sort((a, b) =>
    a.localeCompare(b, "es", { sensitivity: "base" })
  );

  return { records: flatRecords, columns, path: itemTag };
}

/**
 * Detect the repeating item element in an XML feed.
 * Samples the first 20KB and finds the first tag (by position) that:
 * 1. Appears at least twice
 * 2. Contains child XML elements (not just text)
 * Works for Document>Row, rss>channel>item, feed>entry, etc.
 */
function detectItemTag(xml: string): string | null {
  const sample = xml.slice(0, Math.min(xml.length, 20000));

  // Count opening tag occurrences
  const tagCounts: Record<string, number> = {};
  const tagRegex = /<([\w:.-]+)[\s>\/]/g;
  let m;
  while ((m = tagRegex.exec(sample)) !== null) {
    const tag = m[1];
    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  }

  // Get tags that repeat (appear >= 2 times in sample)
  const repeating = Object.entries(tagCounts)
    .filter(([, count]) => count >= 2)
    .map(([tag]) => tag);

  if (repeating.length === 0) return null;

  // Among repeating tags, find the first one (by position in XML) that
  // contains child XML elements — this is the item/row element.
  // Leaf tags (like <ID>, <Name>) contain only text, not child tags.
  for (const tag of repeating) {
    const openPos = xml.indexOf(`<${tag}`);
    if (openPos === -1) continue;
    const contentStart = xml.indexOf(">", openPos) + 1;
    const closeStr = `</${tag}>`;
    const closePos = xml.indexOf(closeStr, contentStart);
    if (closePos === -1) continue;

    const content = xml.slice(contentStart, closePos);
    // Strip CDATA so HTML inside CDATA doesn't give false positives
    const noCdata = content.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
    if (/<[\w:.-]+[\s>\/]/.test(noCdata)) {
      return tag; // This tag wraps other tags — it's the item element
    }
  }

  return null;
}

/**
 * Stack-based XML to JS object parser (no external dependencies).
 * Handles namespace prefixes (g:id), nested same-name tags, CDATA, and attributes.
 * Strips namespace prefixes from tag names for cleaner column names.
 */
function parseXmlToObject(xml: string): unknown {
  const result: Record<string, unknown> = {};
  const entries: { tag: string; value: unknown }[] = [];
  let pos = 0;

  while (pos < xml.length) {
    // Skip whitespace
    while (pos < xml.length && /\s/.test(xml[pos])) pos++;
    if (pos >= xml.length) break;

    if (xml[pos] !== "<") {
      // Text content — skip to next tag
      const next = xml.indexOf("<", pos);
      pos = next === -1 ? xml.length : next;
      continue;
    }

    // Comments
    if (xml.startsWith("<!--", pos)) {
      const end = xml.indexOf("-->", pos);
      pos = end === -1 ? xml.length : end + 3;
      continue;
    }
    // CDATA at top level
    if (xml.startsWith("<![CDATA[", pos)) {
      const end = xml.indexOf("]]>", pos);
      pos = end === -1 ? xml.length : end + 3;
      continue;
    }
    // Processing instructions
    if (xml.startsWith("<?", pos)) {
      const end = xml.indexOf("?>", pos);
      pos = end === -1 ? xml.length : end + 2;
      continue;
    }
    // DOCTYPE
    if (xml.startsWith("<!DOCTYPE", pos) || xml.startsWith("<!doctype", pos)) {
      const end = xml.indexOf(">", pos);
      pos = end === -1 ? xml.length : end + 1;
      continue;
    }
    // Closing tag = end of current context (handled by parent call)
    if (xml[pos + 1] === "/") break;

    // Opening tag — extract tag name + attributes
    const gtPos = xml.indexOf(">", pos);
    if (gtPos === -1) break;
    const tagStr = xml.slice(pos + 1, gtPos);
    const selfClosing = tagStr.endsWith("/");
    const clean = (selfClosing ? tagStr.slice(0, -1) : tagStr).trim();
    const spIdx = clean.search(/[\s]/);
    const rawTag = spIdx === -1 ? clean : clean.slice(0, spIdx);
    const attrStr = spIdx === -1 ? "" : clean.slice(spIdx).trim();
    // Strip namespace prefix (g:id → id, g:title → title)
    const tag = rawTag.includes(":") ? rawTag.split(":").pop()! : rawTag;

    if (selfClosing) {
      entries.push({ tag, value: attrStr ? parseXmlAttributes(attrStr) : "" });
      pos = gtPos + 1;
      continue;
    }

    // Find matching closing tag by counting depth
    pos = gtPos + 1;
    const innerStart = pos;
    let depth = 1;

    while (depth > 0 && pos < xml.length) {
      const lt = xml.indexOf("<", pos);
      if (lt === -1) { pos = xml.length; break; }

      // Skip CDATA inside content
      if (xml.startsWith("<![CDATA[", lt)) {
        const cdEnd = xml.indexOf("]]>", lt);
        pos = cdEnd === -1 ? xml.length : cdEnd + 3;
        continue;
      }
      // Skip comments inside content
      if (xml.startsWith("<!--", lt)) {
        const cmEnd = xml.indexOf("-->", lt);
        pos = cmEnd === -1 ? xml.length : cmEnd + 3;
        continue;
      }

      if (xml[lt + 1] === "/") {
        // Closing tag
        const closeGt = xml.indexOf(">", lt);
        if (closeGt === -1) { pos = xml.length; break; }
        const closeTag = xml.slice(lt + 2, closeGt).trim();
        if (closeTag === rawTag) {
          depth--;
          if (depth === 0) {
            const inner = xml.slice(innerStart, lt);
            pos = closeGt + 1;
            const trimmed = inner.trim();
            let value: unknown;
            if (!trimmed) {
              value = "";
            } else {
              // Strip CDATA wrappers to check for child XML elements
              const noCdata = trimmed.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
              if (/<[\w:.-][\s/>]/.test(noCdata)) {
                // Has child XML elements — parse recursively
                value = parseXmlToObject(trimmed);
                if (attrStr && typeof value === "object" && value !== null) {
                  Object.assign(value as Record<string, unknown>, parseXmlAttributes(attrStr));
                }
              } else {
                // Text / CDATA content
                value = trimmed.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim();
              }
            }
            entries.push({ tag, value });
          } else {
            pos = closeGt + 1;
          }
        } else {
          pos = closeGt + 1;
        }
      } else {
        // Possible opening tag — check if same rawTag for depth tracking
        const openGt = xml.indexOf(">", lt);
        if (openGt === -1) { pos = xml.length; break; }
        const openContent = xml.slice(lt + 1, openGt);
        const isSelfClose = openContent.endsWith("/");
        const openClean = (isSelfClose ? openContent.slice(0, -1) : openContent).trim();
        const openSpIdx = openClean.search(/[\s]/);
        const openRawTag = openSpIdx === -1 ? openClean : openClean.slice(0, openSpIdx);
        if (!isSelfClose && openRawTag === rawTag) {
          depth++;
        }
        pos = openGt + 1;
      }
    }
  }

  if (entries.length === 0) {
    return xml.trim();
  }

  // Group repeated tags into arrays
  for (const { tag, value } of entries) {
    if (tag in result) {
      const existing = result[tag];
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        result[tag] = [existing, value];
      }
    } else {
      result[tag] = value;
    }
  }

  return result;
}

/**
 * Parse XML attributes string into an object.
 * Supports namespace prefixes and both double/single quoted values.
 */
function parseXmlAttributes(attrs: string): Record<string, string> {
  const result: Record<string, string> = {};
  const attrRegex = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = attrRegex.exec(attrs)) !== null) {
    result[`@${m[1]}`] = m[2] ?? m[3] ?? "";
  }
  return result;
}

/**
 * Pick the main array from parsed data.
 * Recursively searches nested objects to find the largest array of records.
 */
function pickMainArray(data: unknown): {
  records: unknown[];
  path: string;
} {
  if (Array.isArray(data)) {
    return { records: data, path: "(root array)" };
  }

  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;

    // Check direct children for arrays
    let bestArray: { key: string; records: unknown[] } | null = null;
    for (const key of Object.keys(obj)) {
      if (Array.isArray(obj[key]) && (obj[key] as unknown[]).length > 0) {
        if (!bestArray || (obj[key] as unknown[]).length > bestArray.records.length) {
          bestArray = { key, records: obj[key] as unknown[] };
        }
      }
    }

    if (bestArray) {
      return { records: bestArray.records, path: bestArray.key };
    }

    // Recurse into child objects to find deeper arrays
    for (const key of Object.keys(obj)) {
      if (obj[key] && typeof obj[key] === "object" && !Array.isArray(obj[key])) {
        const child = pickMainArray(obj[key]);
        if (child.records.length > 0) {
          return { records: child.records, path: `${key}.${child.path}` };
        }
      }
    }
  }

  return { records: [], path: "(no array found)" };
}

/**
 * Flatten a nested object into dot-notation keys.
 */
function flattenObject(
  obj: Record<string, unknown>,
  prefix: string = "",
  result: Record<string, unknown> = {}
): Record<string, unknown> {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      result[fullKey] = "";
    } else if (Array.isArray(value)) {
      if (value.every((v) => typeof v !== "object" || v === null)) {
        result[fullKey] = value.join(", ");
      } else {
        value.forEach((v, i) => {
          if (v && typeof v === "object") {
            flattenObject(
              v as Record<string, unknown>,
              `${fullKey}[${i}]`,
              result
            );
          } else {
            result[`${fullKey}[${i}]`] = v;
          }
        });
      }
    } else if (typeof value === "object") {
      flattenObject(value as Record<string, unknown>, fullKey, result);
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}
