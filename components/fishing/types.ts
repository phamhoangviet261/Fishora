import type { fishingView } from '@/lib/game/fishing/session';

/** GET /api/fishing, as the client receives it. */
export type FishingView = Awaited<ReturnType<typeof fishingView>>;
