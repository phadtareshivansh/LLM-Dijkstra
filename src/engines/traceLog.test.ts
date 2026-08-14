import { describe, expect, it } from 'vitest';
import { DijkstraTraceStep } from './routingEngine';
import { describeTraceStep } from './traceLog';

function makeStep(override: Partial<DijkstraTraceStep> = {}): DijkstraTraceStep {
  return {
    step: 0,
    settledNode: 'Main_Gate',
    settledDistance: 0,
    relaxations: [],
    distanceByNode: new Map(),
    previousByNode: new Map(),
    finished: false,
    ...override,
  };
}

describe('describeTraceStep', () => {
  it('summarizes the settled node with a readable label', () => {
    const entry = describeTraceStep(makeStep());

    expect(entry.step).toBe(0);
    expect(entry.title).toBe('Settle Main Entrance at 0');
  });

  it('flags improved relaxations separately from rejected ones', () => {
    const entry = describeTraceStep(
      makeStep({
        relaxations: [
          { from: 'Main_Gate', to: 'Auditorium', proposedDistance: 1, improved: true },
          { from: 'Main_Gate', to: 'Science_Lab', proposedDistance: 4, improved: false },
        ],
      })
    );

    expect(entry.lines).toEqual([
      'Relax Auditorium: proposed 1 — improved',
      'Relax Science Lab: proposed 4 — rejected',
    ]);
  });

  it('marks the destination step', () => {
    const entry = describeTraceStep(
      makeStep({
        settledNode: 'Library',
        settledDistance: 8,
        finished: true,
      })
    );

    expect(entry.title).toBe('Settle Library at 8 — destination reached');
  });
});