import { GameError } from './tx';

// Request-body field readers: each throws GameError('invalid_input') on a missing or malformed value.

const field = (body: unknown, key: string): unknown => (body && typeof body === 'object' ? (body as Record<string, unknown>)[key] : undefined);
const bad = () => new GameError('invalid_input', 400);

export function str(body: unknown, key: string): string {
  const v = field(body, key);
  if (typeof v !== 'string' || v.length === 0 || v.length > 200) throw bad();
  return v;
}

export function optStr(body: unknown, key: string): string | undefined {
  return field(body, key) === undefined ? undefined : str(body, key);
}

export function optBool(body: unknown, key: string): boolean | undefined {
  const v = field(body, key);
  if (v === undefined) return undefined;
  if (typeof v !== 'boolean') throw bad();
  return v;
}

export function posInt(body: unknown, key: string, max = 1_000_000): number {
  const v = field(body, key);
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0 || v > max) throw bad();
  return v;
}

export function oneOf<T extends string>(body: unknown, key: string, options: readonly T[]): T {
  const v = field(body, key);
  if (typeof v !== 'string' || !options.includes(v as T)) throw bad();
  return v as T;
}

export function strArray(body: unknown, key: string, max = 500): string[] {
  const v = field(body, key);
  if (!Array.isArray(v) || v.length === 0 || v.length > max || !v.every((x) => typeof x === 'string' && x.length > 0 && x.length <= 100)) throw bad();
  return [...new Set(v as string[])];
}
