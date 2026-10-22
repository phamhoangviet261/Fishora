import { oneOf, optBool, posInt, str, strArray } from '@/lib/game/input';

const invalid = { code: 'invalid_input', status: 400 };

test('str rejects missing, empty and non-string values', () => {
  expect(str({ a: 'x' }, 'a')).toBe('x');
  for (const body of [null, {}, { a: '' }, { a: 3 }]) expect(() => str(body, 'a')).toThrow(expect.objectContaining(invalid));
});

test('posInt accepts positive integers only', () => {
  expect(posInt({ n: 3 }, 'n')).toBe(3);
  for (const n of [0, -1, 1.5, '2', Number.NaN]) expect(() => posInt({ n }, 'n')).toThrow(expect.objectContaining(invalid));
});

test('oneOf, optBool and strArray', () => {
  expect(oneOf({ d: 'in' }, 'd', ['in', 'out'])).toBe('in');
  expect(() => oneOf({ d: 'up' }, 'd', ['in', 'out'])).toThrow(expect.objectContaining(invalid));
  expect(optBool({}, 'b')).toBeUndefined();
  expect(() => optBool({ b: 'yes' }, 'b')).toThrow(expect.objectContaining(invalid));
  expect(strArray({ ids: ['a', 'a', 'b'] }, 'ids')).toEqual(['a', 'b']);
  expect(() => strArray({ ids: [] }, 'ids')).toThrow(expect.objectContaining(invalid));
});
