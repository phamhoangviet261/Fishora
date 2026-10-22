// Values the BA spec fixes (docs/specs/2026-10-22-fishora-ba-mvp.md). Everything still TBD lives in game_config.

/** §5.2: a first death can be revived for 14 real days, offline included. */
export const REVIVE_WINDOW_DAYS = 14;
/** §7.4, §9.1: releasing pays 25% of base value. */
export const RELEASE_RATIO = 0.25;
/** §9.1: selling pays 100% of base value. */
export const SELL_RATIO = 1;
/** §5.2: one revive per fish lifetime. */
export const MAX_REVIVES = 1;
/** §7.3: every cast uses one bait, hit or miss. */
export const BAIT_PER_CAST = 1;

export const DAY_MS = 86_400_000;
