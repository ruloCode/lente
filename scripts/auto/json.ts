// Finds the JSON object a model printed among other output (logs, prose, code fences). Pure.

/** The last balanced `{…}` in `text` that parses and has `key`, or null. */
export function lastJsonWith<T = Record<string, unknown>>(text: string, key: string): T | null {
  let found: T | null = null;
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (ch === "\\") i++;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        try {
          const v = JSON.parse(text.slice(start, i + 1));
          if (v && typeof v === "object" && key in v) found = v;
        } catch {}
        break;
      }
    }
  }
  return found;
}
