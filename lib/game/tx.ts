// ---------------------------------------------------------------- game days

const HOUR_MS = 3_600_000;

const ymdFormat = new Map<string, Intl.DateTimeFormat>();
const wallFormat = new Map<string, Intl.DateTimeFormat>();

function ymd(at: Date, tz: string): string {
  let f = ymdFormat.get(tz);
  if (!f) ymdFormat.set(tz, (f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })));
  return f.format(at);
}

/** Offset of the zone's wall clock from UTC at `at`, in ms. */
function zoneOffset(at: Date, tz: string): number {
  let f = wallFormat.get(tz);
  if (!f)
    wallFormat.set(
      tz,
      (f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })),
    );
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at.getTime() / 1000) * 1000;
}

/** The game day an instant belongs to: 'YYYY-MM-DD' in the game timezone, with days starting at resetHour. */
export function dayKey(at: Date, tz: string, resetHour: number): string {
  return ymd(new Date(at.getTime() - resetHour * HOUR_MS), tz);
}

/** The first day-reset instant strictly after `at`. */
export function nextDayBoundary(at: Date, tz: string, resetHour: number): Date {
  const [y, m, d] = dayKey(at, tz, resetHour).split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d + 1, resetHour);
  let guess = wall - zoneOffset(new Date(wall), tz);
  guess = wall - zoneOffset(new Date(guess), tz); // second pass settles a DST change between the two
  return new Date(guess);
}
