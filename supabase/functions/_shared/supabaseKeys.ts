/** Read one API key from Supabase's hosted JSON key dictionaries. */
export const readNamedApiKey = (
  serializedKeys: string | undefined,
  preferredNames: readonly string[],
): string | null => {
  if (!serializedKeys) return null;

  try {
    const parsed: unknown = JSON.parse(serializedKeys);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const keys = parsed as Record<string, unknown>;

    for (const name of preferredNames) {
      const value = keys[name];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  } catch {
    return null;
  }

  return null;
};
