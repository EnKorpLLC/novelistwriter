/** Sanitize vendor API keys from env / BYOK so Headers never get invalid values. */

/** Redact secrets that browsers/runtimes sometimes echo in error strings. */
export function redactSecrets(text: string): string {
  return text
    .replace(/sk-ant-api[\w-]+/gi, "sk-ant-api…[REDACTED]")
    .replace(/sk-[a-zA-Z0-9]{20,}/g, "sk-…[REDACTED]")
    .replace(/Bearer\s+\S+/gi, "Bearer …[REDACTED]");
}

/**
 * Clean Anthropic/OpenAI keys:
 * - strip quotes / all whitespace
 * - if the key was pasted twice, keep the first valid token only
 */
export function sanitizeApiKey(key: string | null | undefined): string | null {
  if (!key) return null;
  let t = key.trim().replace(/^['"]|['"]$/g, "");
  // Remove ALL whitespace (spaces/newlines inside a doubled paste)
  t = t.replace(/\s+/g, "");
  if (!t) return null;

  // Doubled Anthropic key: sk-ant-…sk-ant-… → take first occurrence only
  const antMatches = t.match(/sk-ant-api03-[A-Za-z0-9_-]+/g);
  if (antMatches && antMatches.length >= 1) {
    return antMatches[0];
  }

  // Doubled OpenAI-style key
  const oaiMatches = t.match(/sk-[A-Za-z0-9_-]{20,}/g);
  if (oaiMatches && oaiMatches.length >= 1 && !t.startsWith("sk-ant")) {
    return oaiMatches[0];
  }

  // Fallback: if somehow concatenated without regex match, split on second sk-
  const second = t.indexOf("sk-", 3);
  if (t.startsWith("sk-") && second > 0) {
    return t.slice(0, second);
  }

  return t;
}

export function describeApiKey(key: string | null): {
  present: boolean;
  length: number;
  looksDoubled: boolean;
  prefix: string | null;
} {
  if (!key) return { present: false, length: 0, looksDoubled: false, prefix: null };
  const raw = key.replace(/\s+/g, "");
  const matches = raw.match(/sk-ant-api03-/gi) || [];
  return {
    present: true,
    length: key.length,
    looksDoubled: matches.length > 1 || key.length > 140,
    prefix: key.slice(0, 12) + "…",
  };
}
