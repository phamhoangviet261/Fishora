// Per-map presentation. Gameplay is identical on every map (fishing MVP). Keyed by zone key.

export interface MapTheme {
  /** A landmark diorama shown on the map's card. */
  landmark?: 'phuQuoc';
}

const DEFAULT: MapTheme = {};

const THEMES: Record<string, MapTheme> = {
  lagoon: { landmark: 'phuQuoc' },
};

export const mapTheme = (zoneKey: string | null | undefined): MapTheme => (zoneKey && THEMES[zoneKey]) || DEFAULT;
