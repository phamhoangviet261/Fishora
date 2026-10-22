import { prisma } from '@/lib/db';
import { FLOOR_Y, INNER, WATER_Y } from '@/lib/tank';

export type LayoutEntry = { id: string; placed: boolean; pos?: [number, number, number]; rotY?: number };

const ITEM_SELECT = { id: true, kind: true, itemKey: true, placed: true, posX: true, posY: true, posZ: true, rotY: true } as const;

export function listInventory(userId: string) {
  return prisma.inventoryItem.findMany({ where: { userId }, orderBy: { createdAt: 'asc' }, select: ITEM_SELECT });
}

export function listPlaced(userId: string) {
  return prisma.inventoryItem.findMany({ where: { userId, placed: true }, orderBy: { createdAt: 'asc' }, select: ITEM_SELECT });
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Shape-checks a request body into layout entries; null if anything is malformed. */
export function parseLayout(body: unknown): LayoutEntry[] | null {
  const items = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(items) || items.length > 500) return null;
  const out: LayoutEntry[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const e = raw as Record<string, unknown>;
    if (typeof e?.id !== 'string' || typeof e.placed !== 'boolean' || seen.has(e.id)) return null;
    seen.add(e.id);
    const entry: LayoutEntry = { id: e.id, placed: e.placed };
    if (e.pos !== undefined) {
      if (!Array.isArray(e.pos) || e.pos.length !== 3 || !e.pos.every(finite)) return null;
      entry.pos = e.pos as [number, number, number];
    }
    if (e.rotY !== undefined) {
      if (!finite(e.rotY)) return null;
      entry.rotY = e.rotY;
    }
    out.push(entry);
  }
  return out;
}

const insideTank = ([x, y, z]: [number, number, number]) =>
  x >= INNER.xMin && x <= INNER.xMax && z >= INNER.zMin && z <= INNER.zMax && y >= FLOOR_Y && y <= WATER_Y;

/**
 * Applies placement changes for items the user owns, all-or-nothing.
 * Fish only toggle `placed` (they swim freely); placed decor needs a position inside the tank.
 */
export async function saveLayout(
  userId: string,
  entries: LayoutEntry[],
): Promise<{ ok: true } | { ok: false; error: 'not_owned' | 'invalid_layout' }> {
  const owned = await prisma.inventoryItem.findMany({
    where: { userId, id: { in: entries.map((e) => e.id) } },
    select: { id: true, kind: true },
  });
  if (owned.length !== entries.length) return { ok: false, error: 'not_owned' };
  const kinds = new Map(owned.map((o) => [o.id, o.kind]));

  for (const e of entries) {
    if (kinds.get(e.id) === 'decor' && e.placed && (!e.pos || !insideTank(e.pos))) return { ok: false, error: 'invalid_layout' };
  }

  await prisma.$transaction(
    entries.map((e) => {
      const decor = kinds.get(e.id) === 'decor' && e.placed;
      return prisma.inventoryItem.update({
        where: { id: e.id },
        data: {
          placed: e.placed,
          posX: decor ? e.pos![0] : null,
          posY: decor ? e.pos![1] : null,
          posZ: decor ? e.pos![2] : null,
          rotY: decor ? (e.rotY ?? 0) : null,
        },
      });
    }),
  );
  return { ok: true };
}
