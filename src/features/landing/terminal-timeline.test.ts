import { describe, expect, it } from 'vitest';

import { TERMINAL_END, buildTerminalTimeline } from './terminal-timeline';

describe('buildTerminalTimeline', () => {
  it('ends on the final terminal state', () => {
    const steps = buildTerminalTimeline();

    expect(steps.at(-1)?.frame).toEqual(TERMINAL_END);
  });
});
