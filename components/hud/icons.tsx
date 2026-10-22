// Small rounded line icons for the HUD. Stroke uses currentColor.

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

type P = { size?: number };

export const BulbIcon = ({ size = 20, on }: P & { on: boolean }) => (
  <svg {...base} width={size} height={size}>
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z" fill={on ? 'currentColor' : 'none'} fillOpacity={0.3} />
    {on && <path d="M12 0.8v0.6M4.2 4.2l.5.5M19.8 4.2l-.5.5" />}
  </svg>
);

export const CoinIcon = ({ size = 20 }: P) => (
  <svg {...base} width={size} height={size}>
    <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity={0.25} />
    <path d="M12 7v10M9.5 9.5c0-1.2 1.1-2 2.5-2s2.5.8 2.5 2-1.1 1.8-2.5 2-2.5.8-2.5 2 1.1 2 2.5 2 2.5-.8 2.5-2" />
  </svg>
);

export const GearIcon = ({ size = 22 }: P) => (
  <svg {...base} width={size} height={size}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);

export const ShopIcon = ({ size = 22 }: P) => (
  <svg {...base} width={size} height={size}>
    <path d="M3 9l1.5-5h15L21 9" />
    <path d="M3 9h18a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z" />
    <path d="M5 12v8h14v-8M10 20v-5h4v5" />
  </svg>
);

export const FoodIcon = ({ size = 24 }: P) => (
  <svg {...base} width={size} height={size}>
    <path d="M7 4h10l-1 4H8z" />
    <path d="M8 8v3M16 8v3" />
    <circle cx="9" cy="15" r="1.2" fill="currentColor" />
    <circle cx="13" cy="17.5" r="1.2" fill="currentColor" />
    <circle cx="15.5" cy="14" r="1.2" fill="currentColor" />
    <circle cx="11" cy="20.5" r="1.2" fill="currentColor" />
  </svg>
);

export const WaterIcon = ({ size = 24 }: P) => (
  <svg {...base} width={size} height={size}>
    <path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z" fill="currentColor" fillOpacity={0.2} />
    <path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5" />
  </svg>
);

export const BrushIcon = ({ size = 24 }: P) => (
  <svg {...base} width={size} height={size}>
    <path d="M14 3l7 7-6 6-7-7z" fill="currentColor" fillOpacity={0.2} />
    <path d="M8 9l-4 4 7 7 4-4M4 13l2 6" />
  </svg>
);

export const WeatherIcon = ({ size = 18, kind }: P & { kind: 'rain' | 'cloudy' | 'clear' }) => (
  <svg {...base} width={size} height={size}>
    {kind === 'clear' ? (
      <>
        <circle cx="12" cy="12" r="4" fill="currentColor" fillOpacity={0.3} />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ) : (
      <>
        <path d="M7 16a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.7 1.5A3.3 3.3 0 0 1 17 16z" fill="currentColor" fillOpacity={0.2} />
        {kind === 'rain' && <path d="M9 19l-1 2M13 19l-1 2M17 19l-1 2" />}
      </>
    )}
  </svg>
);

export const TankIcon = ({ size = 22 }: P) => (
  <svg {...base} width={size} height={size}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 9c3 1.5 6-1.5 9 0s6-1.5 9 0" />
    <path d="M9 14.5c1.5-1.4 3.5-1.4 5 0-1.5 1.4-3.5 1.4-5 0zM14 14.5l2-1.2v2.4z" />
  </svg>
);

export const BoxIcon = ({ size = 22 }: P) => (
  <svg {...base} width={size} height={size}>
    <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
    <path d="M3 7l9 4 9-4M12 11v10" />
  </svg>
);

export const RodIcon = ({ size = 22 }: P) => (
  <svg {...base} width={size} height={size}>
    <path d="M4 20L17 4M17 4v11" />
    <path d="M17 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
    <circle cx="7" cy="16.5" r="1.4" />
  </svg>
);

export const GiftIcon = ({ size = 22 }: P) => (
  <svg {...base} width={size} height={size}>
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M5 12v8h14v-8M12 8v12" />
    <path d="M12 8C10 4 6.5 5 7.5 7c.6 1 4.5 1 4.5 1s3.9 0 4.5-1c1-2-2.5-3-4.5 1z" />
  </svg>
);

export const BookIcon = ({ size = 22 }: P) => (
  <svg {...base} width={size} height={size}>
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
    <path d="M4 19V5M8 7h7M8 11h5" />
  </svg>
);

export const BellIcon = ({ size = 22 }: P) => (
  <svg {...base} width={size} height={size}>
    <path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </svg>
);
