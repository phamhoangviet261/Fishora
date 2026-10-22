export type SeedOptions = { coins?: number; fillStorageGrams?: number };

const okInt = (v: unknown) => v === undefined || (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 10_000_000);

/** Options for the E2E seed; null when malformed. */
export function parseSeedOptions(body: unknown): SeedOptions | null {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!okInt(b.coins) || !okInt(b.fillStorageGrams)) return null;
  const out: SeedOptions = {};
  if (b.coins !== undefined) out.coins = b.coins as number;
  if (b.fillStorageGrams !== undefined) out.fillStorageGrams = b.fillStorageGrams as number;
  return out;
}
