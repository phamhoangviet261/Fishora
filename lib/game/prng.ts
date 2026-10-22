// Browser-safe randomness helpers (no Node imports), shared by the server rules and the client's reel simulation.

/** Uniform in [0, 1). Rules take one as a parameter so tests can replay exact outcomes. */
export type Rng = () => number;

/** mulberry32: small, fast, deterministic. Seeds the reel so client and server replay identical fish movement. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
