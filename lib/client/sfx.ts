// Tiny synthesised sound cues (the project has no audio assets). Does nothing where Web Audio is unavailable or the
// browser hasn't allowed sound yet.

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, gain = 0.15) {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, a.currentTime + start);
  g.gain.setValueAtTime(0.0001, a.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, a.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  osc.connect(g).connect(a.destination);
  osc.start(a.currentTime + start);
  osc.stop(a.currentTime + start + dur + 0.02);
}

export const sfx = {
  /** Call once from a user gesture so later cues are allowed to play. */
  unlock: () => void audio(),
  bite: () => {
    tone(880, 0, 0.12);
    tone(1175, 0.13, 0.18);
  },
  caught: () => {
    tone(660, 0, 0.12, 0.12);
    tone(880, 0.12, 0.12, 0.12);
    tone(1320, 0.24, 0.3, 0.12);
  },
  escaped: () => tone(220, 0, 0.35, 0.1),
};
