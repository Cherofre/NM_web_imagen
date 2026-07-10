export function sanitizeForBrowserStorage<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForBrowserStorage(item)) as T;
  }

  if (value && typeof value === "object") {
    const sanitized = Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((next, [key, item]) => {
      if (key.toLowerCase() !== "api_key") {
        next[key] = sanitizeForBrowserStorage(item);
      }
      return next;
    }, {});
    return sanitized as T;
  }

  return value;
}

export function sanitizeStoredJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return sanitizeForBrowserStorage(JSON.parse(raw)) as T;
  } catch {
    return fallback;
  }
}
