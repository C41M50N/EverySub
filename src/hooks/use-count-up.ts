import { useEffect, useRef, useState } from 'react';

const DURATION_MS = 600;

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

/**
 * Animates a whole number toward `target` whenever it changes, starting from
 * whatever is on screen, so an interrupted count picks up where it was. The
 * first value shows as is. Jumps straight to the target when disabled or under
 * reduced motion.
 */
export function useCountUp(target: number, enabled: boolean): number {
  const [value, setValue] = useState(target);
  const valueRef = useRef(target);

  useEffect(() => {
    const from = valueRef.current;

    if (from === target) {
      return;
    }

    if (!enabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      valueRef.current = target;
      // oxlint-disable-next-line react/set-state-in-effect -- Skips the animation; the reduced-motion check needs the browser.
      setValue(target);
      return;
    }

    const start = performance.now();
    let frame = requestAnimationFrame(function step(time) {
      const progress = Math.min((time - start) / DURATION_MS, 1);
      const next = Math.round(from + (target - from) * easeOutCubic(progress));

      valueRef.current = next;
      setValue(next);

      if (progress < 1) {
        frame = requestAnimationFrame(step);
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [target, enabled]);

  return enabled ? value : target;
}
