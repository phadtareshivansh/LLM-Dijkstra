import { DijkstraTraceStep } from './routingEngine';
import { formatNodeLabel } from '../data/nodeLabels';

export interface TraceLogEntry {
  step: number;
  title: string;
  lines: string[];
}

export function describeTraceStep(step: DijkstraTraceStep): TraceLogEntry {
  const settledLabel = step.settledNode ? formatNodeLabel(step.settledNode) : 'None';
  const title = step.finished
    ? `Settle ${settledLabel} at ${step.settledDistance} — destination reached`
    : `Settle ${settledLabel} at ${step.settledDistance}`;

  const lines = step.relaxations.map((relaxation) => {
    const toLabel = formatNodeLabel(relaxation.to);

    if (relaxation.improved) {
      return `Relax ${toLabel}: proposed ${relaxation.proposedDistance} — improved`;
    }

    return `Relax ${toLabel}: proposed ${relaxation.proposedDistance} — rejected`;
  });

  return { step: step.step, title, lines };
}