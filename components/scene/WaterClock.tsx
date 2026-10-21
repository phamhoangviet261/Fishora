'use client';

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { waterTime } from '@/lib/underwater';

/** Advances the shared water clock. Slows to a gentle drift when the viewer prefers reduced motion. */
export function WaterClock() {
  const speed = useRef(1);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => (speed.current = mq.matches ? 0.2 : 1);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useFrame((_, delta) => {
    waterTime.value += Math.min(delta, 0.1) * speed.current;
  });

  return null;
}
