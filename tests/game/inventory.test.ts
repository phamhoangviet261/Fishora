import { prisma } from '@/lib/db';
import { listInventory, listPlaced, parseLayout, saveLayout } from '@/lib/game/inventory';
import { FLOOR_Y } from '@/lib/tank';
import { createTestUser, deleteTestUsers } from '../helpers';

afterEach(deleteTestUsers);
afterAll(() => prisma.$disconnect());

const addDecor = (userId: string, placed = false) =>
  prisma.inventoryItem.create({ data: { userId, kind: 'decor', itemKey: 'rock_07', placed, posX: 0, posY: FLOOR_Y + 0.05, posZ: 0, rotY: 0 } });

test('unplacing decor keeps ownership and drops it from the layout', async () => {
  const u = await createTestUser();
  const rock = await addDecor(u.id, true);
  expect(await saveLayout(u.id, [{ id: rock.id, placed: false }])).toEqual({ ok: true });
  expect((await listInventory(u.id)).find((i) => i.id === rock.id)).toMatchObject({ placed: false });
  expect((await listPlaced(u.id)).some((i) => i.id === rock.id)).toBe(false);
});

test('decor placement saves and restores its transform', async () => {
  const u = await createTestUser();
  const rock = await addDecor(u.id);
  const pos: [number, number, number] = [0.2, FLOOR_Y + 0.05, 0.06];
  expect(await saveLayout(u.id, [{ id: rock.id, placed: true, pos, rotY: 1.5 }])).toEqual({ ok: true });
  expect((await listPlaced(u.id)).find((i) => i.id === rock.id)).toMatchObject({ posX: 0.2, posY: pos[1], posZ: 0.06, rotY: 1.5 });
});

test("another user's item is not_owned and nothing changes", async () => {
  const a = await createTestUser();
  const b = await createTestUser();
  const mine = await addDecor(a.id, true);
  const theirs = await addDecor(b.id, true);
  expect(await saveLayout(a.id, [{ id: mine.id, placed: false }, { id: theirs.id, placed: false }])).toEqual({ ok: false, error: 'not_owned' });
  expect((await listInventory(a.id))[0].placed).toBe(true);
  expect((await listInventory(b.id))[0].placed).toBe(true);
});

test('decor outside the tank or without a position is invalid_layout', async () => {
  const u = await createTestUser();
  const rock = await addDecor(u.id);
  expect(await saveLayout(u.id, [{ id: rock.id, placed: true, pos: [5, FLOOR_Y + 0.05, 0] }])).toEqual({ ok: false, error: 'invalid_layout' });
  expect(await saveLayout(u.id, [{ id: rock.id, placed: true }])).toEqual({ ok: false, error: 'invalid_layout' });
});

test('parseLayout rejects malformed bodies', () => {
  expect(parseLayout(null)).toBeNull();
  expect(parseLayout({ items: [{ id: 'x', placed: 'yes' }] })).toBeNull();
  expect(parseLayout({ items: [{ id: 'x', placed: true, pos: [0, NaN, 0] }] })).toBeNull();
  expect(parseLayout({ items: [{ id: 'x', placed: true }, { id: 'x', placed: false }] })).toBeNull();
  expect(parseLayout({ items: [{ id: 'x', placed: true, pos: [0, 1, 0], rotY: 2 }] })).toEqual([{ id: 'x', placed: true, pos: [0, 1, 0], rotY: 2 }]);
});
