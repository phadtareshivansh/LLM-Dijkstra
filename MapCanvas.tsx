import React from 'react';
import { Edge, Node, THEME } from './themeConstants';
import { getNodeDisplayName } from './navigationUtils';

export type NodeSelectionMode = 'origin' | 'destination' | 'avoid';

export interface MapCanvasProps {
  nodes: Node[];
  edges: Edge[];
  activePath: string[];
  avoidNodes: string[];
  origin?: string;
  destination?: string;
  selectionMode: NodeSelectionMode;
  onNodeSelect: (nodeName: string) => void;
}

function buildActiveEdgeSet(activePath: string[]): Set<string> {
  const activeEdges = new Set<string>();

  for (let index = 0; index < activePath.length - 1; index += 1) {
    activeEdges.add(`${activePath[index]}->${activePath[index + 1]}`);
    activeEdges.add(`${activePath[index + 1]}->${activePath[index]}`);
  }

  return activeEdges;
}

function buildNodeMap(nodes: Node[]): Map<string, Node> {
  return new Map(nodes.map((node) => [node.name, node]));
}

function getEdgeCoordinates(nodeMap: Map<string, Node>, edge: Edge) {
  const fromNode = nodeMap.get(edge.from);
  const toNode = nodeMap.get(edge.to);

  if (!fromNode || !toNode) {
    return null;
  }

  return {
    x1: `${fromNode.x}%`,
    y1: `${fromNode.y}%`,
    x2: `${toNode.x}%`,
    y2: `${toNode.y}%`,
  };
}

function getNodeAccent({
  isAvoided,
  isOrigin,
  isDestination,
  isActive,
}: {
  isAvoided: boolean;
  isOrigin: boolean;
  isDestination: boolean;
  isActive: boolean;
}) {
  if (isAvoided) {
    return THEME.dangerAccent;
  }

  if (isOrigin) {
    return THEME.originAccent;
  }

  if (isDestination) {
    return THEME.destinationAccent;
  }

  if (isActive) {
    return THEME.primaryAccent;
  }

  return 'rgba(255, 255, 255, 0.85)';
}

export function MapCanvas({
  nodes,
  edges,
  activePath,
  avoidNodes,
  origin,
  destination,
  selectionMode,
  onNodeSelect,
}: MapCanvasProps) {
  const nodeMap = buildNodeMap(nodes);
  const activeEdgeSet = buildActiveEdgeSet(activePath);
  const activeNodeSet = new Set(activePath);
  const avoidNodeSet = new Set(avoidNodes);

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ backgroundColor: THEME.background }}
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <filter id="mintGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="0 0 0 0 0
                      0 1 0 0 1
                      0 0 0.62 0 0.4
                      0 0 0 1 0"
              result="mintTint"
            />
            <feMerge>
              <feMergeNode in="mintTint" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {edges.map((edge) => {
          const coordinates = getEdgeCoordinates(nodeMap, edge);
          const fromNode = nodeMap.get(edge.from);
          const toNode = nodeMap.get(edge.to);

          if (!coordinates || !fromNode || !toNode) {
            return null;
          }

          const isActive = activeEdgeSet.has(`${edge.from}->${edge.to}`);
          const labelX = (fromNode.x + toNode.x) / 2;
          const labelY = (fromNode.y + toNode.y) / 2;

          return (
            <g key={`${edge.from}-${edge.to}`}>
              <line
                x1={coordinates.x1}
                y1={coordinates.y1}
                x2={coordinates.x2}
                y2={coordinates.y2}
                stroke={isActive ? THEME.primaryAccent : 'rgba(255, 255, 255, 0.18)'}
                strokeWidth={isActive ? 3 : 1.5}
                strokeLinecap="round"
                filter={isActive ? 'url(#mintGlow)' : undefined}
                className={isActive ? 'animate-pulse' : undefined}
              />
              <text
                x={`${labelX}%`}
                y={`${labelY}%`}
                textAnchor="middle"
                dominantBaseline="middle"
                className="select-none text-[3px] font-semibold"
                fill={isActive ? THEME.primaryAccent : 'rgba(255,255,255,0.38)'}
                stroke={THEME.background}
                strokeWidth="0.45"
                paintOrder="stroke"
              >
                {edge.weight}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="absolute inset-0">
        {nodes.map((node) => {
          const isActive = activeNodeSet.has(node.name);
          const isAvoided = avoidNodeSet.has(node.name);
          const isOrigin = origin === node.name;
          const isDestination = destination === node.name;
          const accent = getNodeAccent({ isAvoided, isOrigin, isDestination, isActive });
          const roleLabel = isOrigin
            ? 'Origin'
            : isDestination
              ? 'Destination'
              : isAvoided
                ? 'Avoided'
                : isActive
                  ? 'On route'
                  : 'Available';

          return (
            <button
              key={node.name}
              type="button"
              aria-label={`${getNodeDisplayName(node.name)}. ${roleLabel}. Click to ${
                selectionMode === 'origin'
                  ? 'set as origin'
                  : selectionMode === 'destination'
                    ? 'set as destination'
                    : 'toggle avoid'
              }.`}
              title={getNodeDisplayName(node.name)}
              onClick={() => onNodeSelect(node.name)}
              className="group absolute select-none rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              style={{
                left: `${node.x}%`,
                top: `${node.y}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div className="relative flex items-center">
                <div
                  className="relative h-4 w-4 rounded-full transition-shadow"
                  style={{
                    backgroundColor: accent,
                    boxShadow: isActive || isOrigin || isDestination ? `0 0 18px ${accent}` : 'none',
                    border: isAvoided ? '1px solid rgba(255, 255, 255, 0.35)' : 'none',
                  }}
                >
                  {isActive && !isAvoided ? (
                    <span className="absolute inset-0 rounded-full animate-ping bg-emerald-300/30" />
                  ) : null}
                </div>

                <span
                  className="ml-3 rounded bg-black/30 px-1.5 py-0.5 text-sm font-medium tracking-wide text-white/90 backdrop-blur-sm transition-colors group-hover:bg-black/50"
                  style={{
                    fontFamily: 'Inter var, Inter, ui-sans-serif, system-ui, sans-serif',
                    textShadow: isActive || isOrigin || isDestination ? `0 0 8px ${accent}` : 'none',
                  }}
                >
                  {getNodeDisplayName(node.name)}
                </span>
              </div>

              {isAvoided ? (
                <div
                  className="pointer-events-none absolute inset-0 -m-1 rounded-full border border-red-300/70"
                  style={{ boxShadow: '0 0 0 2px rgba(239, 68, 68, 0.18)' }}
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default MapCanvas;
