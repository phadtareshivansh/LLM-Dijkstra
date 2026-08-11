import React, { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import RouteScene3D, { TraceStepSceneState } from './RouteScene3D';
import { CAMPUS_EDGES, CAMPUS_NODES, THEME } from './themeConstants';
import { RoutingResult, UNREACHABLE_ERROR, dijkstraTrace } from './routingEngine';
import { kShortestPaths } from './kShortestPaths';
import { buildDirections } from './directions';
import { buildShareUrl } from './shareUtils';
import { parseNavigationRequest } from './parseNavigationRequest';
import { TraceLogEntry, describeTraceStep } from './traceLog';
import { formatNodeLabel as getNodeLabel } from './nodeLabels';
import { loadPreferences, savePreferences } from './preferences';

type AiParseState = 'idle' | 'parsing';
type ViewMode = 'path' | 'dijkstra';

interface AiFeedback {
  message: string;
  tone: 'success' | 'error';
}

const ROUTE_STEP_MS = 920;
const SPEED_PRESETS = [
  { label: 'Slow', ms: 1800 },
  { label: 'Normal', ms: 920 },
  { label: 'Fast', ms: 400 },
] as const;
const DEFAULT_SOURCE = 'Main_Gate';
const DEFAULT_DESTINATION = 'Library';
const MIN_MAP_ZOOM = 0.78;
const MAX_MAP_ZOOM = 1.34;
const MAP_ZOOM_STEP = 0.12;

function clampMapZoom(value: number): number {
  return Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, Number(value.toFixed(2))));
}

function hasQueryValue(name: string, value: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return new URLSearchParams(window.location.search).get(name) === value;
}

function getQueryNode(name: string, fallback: string): string {
  if (typeof window === 'undefined') {
    return fallback;
  }

  const value = new URLSearchParams(window.location.search).get(name);

  if (!value) {
    return fallback;
  }

  return CAMPUS_NODES.some((node) => node.name === value) ? value : fallback;
}

function getQueryAvoidNodes(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const value = new URLSearchParams(window.location.search).get('avoid');

  if (!value) {
    return [];
  }

  const validNames = new Set(CAMPUS_NODES.map((node) => node.name));

  return value
    .split(',')
    .map((name) => name.trim())
    .filter((name) => validNames.has(name));
}

function getQuerySpeedMs(): number {
  if (typeof window === 'undefined') {
    return ROUTE_STEP_MS;
  }

  const value = Number(new URLSearchParams(window.location.search).get('speed'));

  if (!Number.isFinite(value)) {
    return ROUTE_STEP_MS;
  }

  return Math.min(3000, Math.max(200, Math.round(value)));
}

function getTimelineStepCount(distance: number, pathLength: number): number {
  if (!Number.isFinite(distance)) {
    return Math.max(pathLength, 1);
  }

  return Math.max(Math.round(distance), pathLength, 1);
}

function getSceneStepIndex(timelineStep: number, totalSteps: number, pathLength: number): number {
  if (pathLength <= 1) {
    return 0;
  }

  return Math.min(pathLength - 1, Math.max(0, Math.ceil((timelineStep / totalSteps) * pathLength)));
}

interface NetworkLogoProps {
  className?: string;
}

function NetworkLogo({ className = 'h-12 w-12' }: NetworkLogoProps) {
  return (
    <svg className={`${className} text-[#54F6BA]`} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path
        d="M18 16 32 8l14 8v16L32 40 18 32V16Z"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M18 32 8 38v16l14 8 14-8V40M46 32l10 6v16l-14 8-14-8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle cx="18" cy="16" r="4" fill="currentColor" />
      <circle cx="46" cy="16" r="4" fill="currentColor" />
      <circle cx="32" cy="40" r="4" fill="currentColor" />
      <circle cx="8" cy="38" r="4" fill="currentColor" />
      <circle cx="56" cy="38" r="4" fill="currentColor" />
      <circle cx="22" cy="62" r="4" fill="currentColor" />
      <circle cx="42" cy="62" r="4" fill="currentColor" />
    </svg>
  );
}

interface NodeSelectProps {
  id: string;
  label: string;
  value: string;
  blockedValue: string;
  onChange: (value: string) => void;
}

function NodeSelect({ id, label, value, blockedValue, onChange }: NodeSelectProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-white">{label}</span>
      <span className="relative flex h-[58px] items-center rounded-md border border-white/18 bg-[#081116]/88 text-base font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors hover:border-emerald-300/40">
        <span className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-white/72">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 21s6-5.45 6-11a6 6 0 0 0-12 0c0 5.55 6 11 6 11Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="10" r="2" stroke="currentColor" strokeWidth="2" />
          </svg>
        </span>
        <span className="pointer-events-none block truncate pl-12 pr-11">{getNodeLabel(value)}</span>
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/72">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <select
          id={id}
          data-testid={id}
          value={value}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label={label}
        >
          {CAMPUS_NODES.map((node) => (
            <option key={node.name} value={node.name} disabled={node.name === blockedValue}>
              {getNodeLabel(node.name)}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}

interface RouteTimelineProps {
  currentStep: number;
  totalSteps: number;
  distance: number;
  isPaused: boolean;
  routeIndex: number;
  routeCount: number;
  pathLength: number;
  avoidNodes: string[];
  onRouteChange: (routeIndex: number) => void;
  onSkip: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onTogglePause: () => void;
  onReplay: () => void;
  canControl: boolean;
}

function RouteTimeline({
  currentStep,
  totalSteps,
  distance,
  isPaused,
  routeIndex,
  routeCount,
  pathLength,
  avoidNodes,
  onRouteChange,
  onSkip,
  onStepBack,
  onStepForward,
  onTogglePause,
  onReplay,
  canControl,
}: RouteTimelineProps) {
  const steps = Array.from({ length: totalSteps }, (_, index) => index + 1);
  const hasDistance = Number.isFinite(distance) && distance >= 0;

  return (
    <section className="pointer-events-auto absolute bottom-4 left-3 right-3 z-40 rounded-lg border border-white/14 bg-[#071116]/88 px-5 py-5 shadow-2xl shadow-black/45 backdrop-blur-xl sm:left-4 sm:right-4 sm:px-10 sm:py-6">
      <div className="relative flex flex-col gap-5 lg:min-h-[138px] lg:flex-row lg:items-center lg:justify-between lg:gap-8">
        <button
          type="button"
          onClick={onSkip}
          disabled={!canControl || currentStep >= totalSteps}
          className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-md border border-white/18 bg-black/18 px-5 text-base font-semibold text-white transition-colors hover:border-emerald-300/40 disabled:cursor-not-allowed disabled:opacity-40 lg:w-[214px]"
        >
          <svg className="h-6 w-6 text-[#54F6BA]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 5v14l10-7L5 5Z" fill="currentColor" />
            <path d="M18 5v14" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
          </svg>
          Skip animation
        </button>

        <div className="min-w-0 flex-1">
          {routeCount > 1 ? (
            <div className="mb-3 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => onRouteChange(routeIndex - 1)}
                disabled={routeIndex <= 0}
                aria-label="Previous alternative route"
                title="Previous route"
                className="flex h-9 w-9 items-center justify-center rounded-md border border-white/18 bg-black/18 text-white transition-colors hover:border-emerald-300/40 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m15 6-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/62">
                Route {routeIndex + 1} of {routeCount}
              </span>
              <button
                type="button"
                onClick={() => onRouteChange(routeIndex + 1)}
                disabled={routeIndex >= routeCount - 1}
                aria-label="Next alternative route"
                title="Next route"
                className="flex h-9 w-9 items-center justify-center rounded-md border border-white/18 bg-black/18 text-white transition-colors hover:border-emerald-300/40 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          ) : null}
          <div className="mb-5 text-center">
            <p className="text-base font-medium text-white">Step</p>
            <p className="mt-2 text-2xl font-semibold text-white">
              <span style={{ color: THEME.primaryAccent }}>{currentStep}</span> / {totalSteps}
            </p>
            {hasDistance ? (
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/45">
                {pathLength} stop{pathLength === 1 ? '' : 's'} · {distance} unit{distance === 1 ? '' : 's'}
              </p>
            ) : null}
            {avoidNodes.length > 0 ? (
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-red-300/90">
                Skipping {avoidNodes.map(getNodeLabel).join(', ')}
              </p>
            ) : null}
          </div>

          <div className="mx-auto flex max-w-[980px] items-center overflow-x-auto pb-1 [scrollbar-width:thin]">
            {steps.map((step) => {
              const isComplete = step < currentStep;
              const isCurrent = step === currentStep;

              return (
                <React.Fragment key={step}>
                  <div className="relative flex w-10 shrink-0 flex-col items-center gap-3">
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition-colors"
                      style={{
                        borderColor: isCurrent || isComplete ? `${THEME.primaryAccent}DD` : 'rgba(255,255,255,0.42)',
                        backgroundColor: isComplete
                          ? 'rgba(84, 246, 186, 0.92)'
                          : isCurrent
                            ? 'rgba(3, 18, 16, 0.95)'
                            : 'rgba(255,255,255,0.09)',
                        color: isComplete ? '#04231A' : isCurrent ? THEME.primaryAccent : 'rgba(255,255,255,0.75)',
                        boxShadow: isCurrent ? `0 0 24px ${THEME.primaryAccent}99` : 'none',
                      }}
                    >
                      {isComplete ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="m6 12 4 4 8-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : null}
                    </span>
                    <span className="text-sm text-white/82">{step}</span>
                  </div>
                  {step < totalSteps ? (
                    <span
                      className="mb-9 h-px min-w-4 flex-1"
                      style={{
                        backgroundColor: step < currentStep ? THEME.primaryAccent : 'rgba(255,255,255,0.36)',
                        boxShadow: step < currentStep ? `0 0 18px ${THEME.primaryAccent}66` : 'none',
                      }}
                    />
                  ) : null}
                </React.Fragment>
              );
            })}
          </div>
        </div>

<div className="flex w-full items-stretch justify-center gap-2 sm:w-[330px]">
          <button
            type="button"
            onClick={onStepBack}
            disabled={!canControl || currentStep <= 1}
            aria-label="Previous step"
            title="Previous step"
            className="flex h-14 w-12 shrink-0 items-center justify-center rounded-md border border-white/18 bg-black/18 text-white transition-colors hover:border-emerald-300/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m15 6-6 6 6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <button
            type="button"
            onClick={onTogglePause}
            disabled={!canControl || currentStep >= totalSteps}
            aria-label={isPaused ? 'Resume animation' : 'Pause animation'}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-white/18 bg-black/18 text-white transition-colors hover:border-emerald-300/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPaused ? (
              <svg className="ml-0.5 h-6 w-6 text-[#54F6BA]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7L8 5Z" />
              </svg>
            ) : (
              <svg className="h-6 w-6 text-[#54F6BA]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
              </svg>
            )}
          </button>

          <button
            type="button"
            onClick={onStepForward}
            disabled={!canControl || currentStep >= totalSteps}
            aria-label="Next step"
            title="Next step"
            className="flex h-14 w-12 shrink-0 items-center justify-center rounded-md border border-white/18 bg-black/18 text-white transition-colors hover:border-emerald-300/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <button
            type="button"
            onClick={onReplay}
            disabled={!canControl}
            className="inline-flex h-14 flex-1 items-center justify-center gap-3 rounded-md border border-white/18 bg-black/18 px-5 text-base font-semibold text-white transition-colors hover:border-emerald-300/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
          <svg className="h-6 w-6 text-[#54F6BA]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M20 12a8 8 0 0 1-13.66 5.66M4 12A8 8 0 0 1 17.66 6.34"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <path d="M4 18v-5h5M20 6v5h-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Replay
        </button>
        </div>
      </div>
    </section>
  );
}

interface MapControlsProps {
  zoomLevel: number;
  isThreeDimensional: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleThreeD: () => void;
  onResetView: () => void;
}

function MapControls({
  zoomLevel,
  isThreeDimensional,
  onZoomIn,
  onZoomOut,
  onToggleThreeD,
  onResetView,
}: MapControlsProps) {
  const isAtMinZoom = zoomLevel <= MIN_MAP_ZOOM;
  const isAtMaxZoom = zoomLevel >= MAX_MAP_ZOOM;

  return (
    <div className="pointer-events-auto absolute right-5 top-14 z-40 hidden flex-col items-center gap-4 md:flex">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-[#071116]/72 text-white shadow-xl shadow-black/35 backdrop-blur-xl">
        <div className="relative text-center text-xs font-semibold tracking-[0.18em]">
          <span className="absolute -top-4 left-1/2 -translate-x-1/2">N</span>
          <svg className="mt-3 h-8 w-8 text-[#54F6BA]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2 4 22l8-4 8 4L12 2Zm0 6.2 3.25 8.13L12 14.7l-3.25 1.63L12 8.2Z" />
          </svg>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggleThreeD}
        aria-pressed={isThreeDimensional}
        aria-label="Toggle 3D view"
        title={isThreeDimensional ? 'Switch to top-down view' : 'Switch to 3D view'}
        className="h-16 w-16 rounded-md border border-white/18 bg-[#071116]/72 text-lg font-bold text-[#54F6BA] shadow-xl shadow-black/35 backdrop-blur-xl transition-colors hover:border-emerald-300/45 hover:bg-[#0A191E]/82 focus:outline-none focus:ring-2 focus:ring-[#54F6BA]/70"
      >
        {isThreeDimensional ? '3D' : '2D'}
      </button>

      <div className="overflow-hidden rounded-md border border-white/18 bg-[#071116]/72 shadow-xl shadow-black/35 backdrop-blur-xl">
        <button
          type="button"
          onClick={onZoomIn}
          disabled={isAtMaxZoom}
          aria-label="Zoom in"
          title="Zoom in"
          className="block h-16 w-16 text-3xl font-light text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:text-white/30 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#54F6BA]/70"
        >
          +
        </button>
        <div className="h-px bg-white/14" />
        <button
          type="button"
          onClick={onZoomOut}
          disabled={isAtMinZoom}
          aria-label="Zoom out"
          title="Zoom out"
          className="block h-16 w-16 text-3xl font-light text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:text-white/30 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#54F6BA]/70"
        >
          -
        </button>
      </div>

      <button
        type="button"
        onClick={onResetView}
        aria-label="Reset map view"
        title="Reset view"
        className="flex h-16 w-16 items-center justify-center rounded-md border border-white/18 bg-[#071116]/72 text-white shadow-xl shadow-black/35 backdrop-blur-xl transition-colors hover:border-emerald-300/45 hover:bg-[#0A191E]/82 focus:outline-none focus:ring-2 focus:ring-[#54F6BA]/70"
      >
        <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r="1.8" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
}

interface MapViewProps {
  origin: string;
  destination: string;
  avoidNodes: string[];
  routeError: string | null;
  routePath: string[];
  sceneStepIndex: number;
  zoomLevel: number;
  isThreeDimensional: boolean;
  isPanelMinimized: boolean;
  timelineStep: number;
  totalSteps: number;
  distance: number;
  canAnimate: boolean;
  isPaused: boolean;
  routeIndex: number;
  routeCount: number;
  aiPrompt: string;
  aiParseState: AiParseState;
  aiFeedback: AiFeedback | null;
  isShareCopied: boolean;
  viewMode: ViewMode;
  showEdgeWeights: boolean;
  speedMs: number;
  traceState: TraceStepSceneState | null;
  stepLog: TraceLogEntry[];
  onViewModeChange: (mode: ViewMode) => void;
  onToggleEdgeWeights: () => void;
  onSpeedChange: (ms: number) => void;
  onNodeClick: (nodeName: string) => void;
  onOriginChange: (value: string) => void;
  onDestinationChange: (value: string) => void;
  onSwapRoute: () => void;
  onRouteChange: (routeIndex: number) => void;
  onAiPromptChange: (value: string) => void;
  onAiSubmit: () => void;
  onStartRoute: () => void;
  onMinimize: () => void;
  onExpand: () => void;
  onShareLink: () => void;
  onSkip: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onTogglePause: () => void;
  onReplay: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleThreeD: () => void;
  onResetView: () => void;
}

function MapView({
  origin,
  destination,
  avoidNodes,
  routeError,
  routePath,
  sceneStepIndex,
  zoomLevel,
  isThreeDimensional,
  isPanelMinimized,
  timelineStep,
  totalSteps,
  distance,
  canAnimate,
  isPaused,
  routeIndex,
  routeCount,
  aiPrompt,
  aiParseState,
  aiFeedback,
  isShareCopied,
  viewMode,
  showEdgeWeights,
  speedMs,
  traceState,
  stepLog,
  onViewModeChange,
  onToggleEdgeWeights,
  onSpeedChange,
  onNodeClick,
  onOriginChange,
  onDestinationChange,
  onSwapRoute,
  onRouteChange,
  onAiPromptChange,
  onAiSubmit,
  onStartRoute,
  onMinimize,
  onExpand,
  onShareLink,
  onSkip,
  onStepBack,
  onStepForward,
  onTogglePause,
  onReplay,
  onZoomIn,
  onZoomOut,
  onToggleThreeD,
  onResetView,
}: MapViewProps) {
  const traceEndpointPair = useMemo(
    () => (viewMode === 'dijkstra' ? [origin, destination] : undefined),
    [viewMode, origin, destination]
  );

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#02080B] text-white">
      <RouteScene3D
        nodes={CAMPUS_NODES}
        edges={CAMPUS_EDGES}
        activePath={routePath}
        avoidNodes={avoidNodes}
        stepIndex={sceneStepIndex}
        zoomLevel={zoomLevel}
        isThreeDimensional={isThreeDimensional}
        variant="background"
        showHud={false}
        traceState={traceState}
        traceEndpoints={traceEndpointPair}
        showWeightLabels={showEdgeWeights}
        onNodeClick={onNodeClick}
      />

      <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(90deg,rgba(2,8,11,0.34)_0%,rgba(2,8,11,0.06)_42%,rgba(2,8,11,0.03)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[270px] bg-[linear-gradient(180deg,transparent,rgba(1,7,10,0.78)_46%,rgba(1,7,10,0.94)_100%)]" />

      {isPanelMinimized ? (
        <MinimizedPanelButton origin={origin} destination={destination} onExpand={onExpand} />
      ) : (
        <ControlPanel
          origin={origin}
          destination={destination}
          routeError={routeError}
          routePath={routePath}
          aiPrompt={aiPrompt}
          aiParseState={aiParseState}
          aiFeedback={aiFeedback}
          isShareCopied={isShareCopied}
          viewMode={viewMode}
          showEdgeWeights={showEdgeWeights}
          speedMs={speedMs}
          stepLog={stepLog}
          onViewModeChange={onViewModeChange}
          onToggleEdgeWeights={onToggleEdgeWeights}
          onSpeedChange={onSpeedChange}
          onOriginChange={onOriginChange}
          onDestinationChange={onDestinationChange}
          onSwapRoute={onSwapRoute}
          onAiPromptChange={onAiPromptChange}
          onAiSubmit={onAiSubmit}
          onStartRoute={onStartRoute}
          onMinimize={onMinimize}
          onShareLink={onShareLink}
          canAnimate={canAnimate}
        />
      )}

      <MapControls
        zoomLevel={zoomLevel}
        isThreeDimensional={isThreeDimensional}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onToggleThreeD={onToggleThreeD}
        onResetView={onResetView}
      />

      {viewMode === 'dijkstra' ? (
        <div className="pointer-events-none absolute bottom-[10.5rem] right-4 z-30 hidden flex-col gap-2 rounded-lg border border-white/14 bg-[#071116]/82 px-4 py-3 text-xs text-white/82 shadow-xl shadow-black/40 backdrop-blur-xl sm:flex">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">Algorithm legend</p>
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full border border-[#00FF9D]/70 bg-[#00FF9D]/25" />
            Settled node
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full border border-[#38BDF8]/70 bg-[#38BDF8]/25" />
            Frontier (tentative dist)
          </span>
          <span className="flex items-center gap-2">
            <span className="h-1 w-5 rounded-full bg-[#38BDF8]/85" />
            Relaxed edge
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full border border-[#F87171]/70 bg-[#F87171]/25" />
            Avoided node
          </span>
        </div>
      ) : null}

      <RouteTimeline
        currentStep={timelineStep}
        totalSteps={totalSteps}
        distance={distance}
        isPaused={isPaused}
        routeIndex={routeIndex}
        routeCount={routeCount}
        pathLength={routePath.length}
        avoidNodes={avoidNodes}
        onRouteChange={onRouteChange}
        onSkip={onSkip}
        onStepBack={onStepBack}
        onStepForward={onStepForward}
        onTogglePause={onTogglePause}
        onReplay={onReplay}
        canControl={canAnimate}
      />
    </main>
  );
}

interface ControlPanelProps {
  origin: string;
  destination: string;
  routeError: string | null;
  routePath: string[];
  aiPrompt: string;
  aiParseState: AiParseState;
  aiFeedback: AiFeedback | null;
  isShareCopied: boolean;
  viewMode: ViewMode;
  showEdgeWeights: boolean;
  speedMs: number;
  stepLog: TraceLogEntry[];
  onViewModeChange: (mode: ViewMode) => void;
  onToggleEdgeWeights: () => void;
  onSpeedChange: (ms: number) => void;
  onOriginChange: (value: string) => void;
  onDestinationChange: (value: string) => void;
  onSwapRoute: () => void;
  onAiPromptChange: (value: string) => void;
  onAiSubmit: () => void;
  onStartRoute: () => void;
  onMinimize: () => void;
  onShareLink: () => void;
  canAnimate: boolean;
}

function ControlPanel({
  origin,
  destination,
  routeError,
  routePath,
  aiPrompt,
  aiParseState,
  aiFeedback,
  isShareCopied,
  viewMode,
  showEdgeWeights,
  speedMs,
  stepLog,
  onViewModeChange,
  onToggleEdgeWeights,
  onSpeedChange,
  onOriginChange,
  onDestinationChange,
  onSwapRoute,
  onAiPromptChange,
  onAiSubmit,
  onStartRoute,
  onMinimize,
  onShareLink,
  canAnimate,
}: ControlPanelProps) {
  const directions = useMemo(() => buildDirections(routePath, CAMPUS_EDGES), [routePath]);

  return (
    <section className="pointer-events-auto absolute left-3 top-7 z-40 w-[calc(100vw-1.5rem)] max-w-[388px] rounded-lg border border-white/16 bg-[#071116]/84 p-5 shadow-2xl shadow-black/45 backdrop-blur-xl sm:p-6 md:max-w-[430px]">
      <button
        type="button"
        onClick={onMinimize}
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-md border border-white/12 bg-white/[0.04] text-white/78 transition-colors hover:border-emerald-300/40 hover:text-[#54F6BA]"
        aria-label="Minimize dashboard"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12h14" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
        </svg>
      </button>

      <div className="flex items-center gap-4 pr-10">
        <NetworkLogo />
        <h2 className="text-3xl font-bold tracking-[-0.01em] text-white">
          Dijkstra <span style={{ color: THEME.primaryAccent }}>Navigator</span>
        </h2>
      </div>

      <div className="mt-6 space-y-7">
        <div className="relative">
          <NodeSelect
            id="source-select"
            label="Source"
            value={origin}
            blockedValue={destination}
            onChange={onOriginChange}
          />
          <button
            type="button"
            onClick={onSwapRoute}
            aria-label="Swap source and destination"
            title="Swap source and destination"
            className="absolute right-9 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md border border-white/18 bg-[#0B1914] text-[#54F6BA] shadow-lg shadow-black/40 transition-colors hover:border-emerald-300/45"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <NodeSelect
          id="destination-select"
          label="Destination"
          value={destination}
          blockedValue={origin}
          onChange={onDestinationChange}
        />

        <div>
          <span className="mb-2 block text-sm font-semibold text-white">View mode</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onViewModeChange('path')}
              aria-pressed={viewMode === 'path'}
              className={`flex h-11 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors ${
                viewMode === 'path'
                  ? 'border-emerald-300/55 bg-[#0B1914] text-[#54F6BA]'
                  : 'border-white/14 bg-black/18 text-white/70 hover:border-emerald-300/40'
              }`}
            >
              Route path
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('dijkstra')}
              aria-pressed={viewMode === 'dijkstra'}
              className={`flex h-11 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors ${
                viewMode === 'dijkstra'
                  ? 'border-sky-300/55 bg-[#0B1920] text-[#38BDF8]'
                  : 'border-white/14 bg-black/18 text-white/70 hover:border-sky-300/40'
              }`}
            >
              Dijkstra trace
            </button>
          </div>
          <label className="mt-3 flex cursor-pointer items-center justify-between rounded-md border border-white/12 bg-black/18 px-4 py-3 text-sm text-white/84 transition-colors hover:border-emerald-300/40">
            <span>Show edge weights</span>
            <input
              type="checkbox"
              checked={showEdgeWeights}
              onChange={onToggleEdgeWeights}
              className="h-4 w-4 cursor-pointer accent-[#54F6BA]"
              aria-label="Show edge weights"
            />
          </label>
          <div className="mt-3">
            <span className="mb-2 block text-sm font-semibold text-white">Animation speed</span>
            <div className="grid grid-cols-3 gap-2">
              {SPEED_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onSpeedChange(preset.ms)}
                  aria-pressed={speedMs === preset.ms}
                  className={`h-10 rounded-md border text-sm font-semibold transition-colors ${
                    speedMs === preset.ms
                      ? 'border-emerald-300/55 bg-[#0B1914] text-[#54F6BA]'
                      : 'border-white/14 bg-black/18 text-white/70 hover:border-emerald-300/40'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-white">Ask AI</span>
            <span className="relative flex items-center">
              <span className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[#54F6BA]">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="m12 2 2.34 7.16L22 12l-7.66 2.84L12 22l-2.34-7.16L2 12l7.66-2.84L12 2Z" />
                </svg>
              </span>
              <input
                type="text"
                value={aiPrompt}
                onChange={(event) => onAiPromptChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    onAiSubmit();
                  }
                }}
                disabled={aiParseState === 'parsing'}
                placeholder='e.g. "from main gate to the library"'
                aria-label="Ask AI to plan a route"
                className="h-[54px] w-full rounded-md border border-white/18 bg-[#081116]/88 pl-11 pr-24 text-base text-white placeholder-white/38 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] outline-none transition-colors hover:border-emerald-300/40 focus:border-[#54F6BA]/70 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={onAiSubmit}
                disabled={aiParseState === 'parsing' || !aiPrompt.trim()}
                className="absolute right-1.5 top-1/2 flex h-11 -translate-y-1/2 items-center justify-center gap-2 rounded border border-white/14 bg-[#0B1914] px-3 text-sm font-semibold text-[#54F6BA] transition-colors hover:border-emerald-300/45 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {aiParseState === 'parsing' ? (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="rgba(84,246,186,0.3)" strokeWidth="3" />
                    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="m12 4 1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6L12 4Z" fill="currentColor" />
                    <path d="M18.5 15.5 19.3 17.7 21.5 18.5 19.3 19.3 18.5 21.5 17.7 19.3 15.5 18.5 17.7 17.7 18.5 15.5Z" fill="currentColor" />
                  </svg>
                )}
                <span className="hidden sm:inline">{aiParseState === 'parsing' ? 'Thinking' : 'Ask'}</span>
              </button>
            </span>
          </label>
          {aiFeedback ? (
            <p
              role="status"
              className={`mt-2 text-sm leading-5 ${aiFeedback.tone === 'success' ? 'text-emerald-200' : 'text-red-200'}`}
            >
              {aiFeedback.message}
            </p>
          ) : null}
        </div>
      </div>

      {directions.length > 0 ? (
        <details className="mt-6 rounded-md border border-white/10 bg-white/[0.035] p-5">
          <summary className="cursor-pointer text-sm font-semibold text-white/90">
            Turn-by-turn directions
          </summary>
          <ol className="mt-3 space-y-2 text-sm leading-6 text-white/78">
            {directions.map((leg) => (
              <li key={leg.index} className="flex items-start gap-2">
                <span
                  className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: THEME.primaryAccent }}
                />
                <span>
                  <span className="font-medium text-white">
                    {getNodeLabel(leg.from)} → {getNodeLabel(leg.to)}
                  </span>{' '}
                  · {leg.distance} unit{leg.distance === 1 ? '' : 's'} · {leg.cumulativeDistance} total
                </span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      {viewMode === 'dijkstra' && stepLog.length > 0 ? (
        <details className="mt-6 rounded-md border border-white/10 bg-white/[0.035] p-5">
          <summary className="cursor-pointer text-sm font-semibold text-white/90">
            Algorithm step log
          </summary>
          <ol className="mt-3 max-h-64 space-y-2 overflow-y-auto text-xs leading-5 text-white/78">
            {stepLog.map((entry) => {
              const isCurrent = entry.step === stepLog[stepLog.length - 1].step;

              return (
                <li
                  key={entry.step}
                  className={`rounded-md border p-2 ${
                    isCurrent ? 'border-sky-300/40 bg-sky-300/[0.08]' : 'border-white/8 bg-black/10'
                  }`}
                >
                  <p className={`font-semibold ${isCurrent ? 'text-sky-100' : 'text-white/70'}`}>
                    Step {entry.step + 1}: {entry.title}
                  </p>
                  {entry.lines.length > 0 ? (
                    <ul className="mt-1 space-y-0.5 pl-3 font-mono">
                      {entry.lines.map((line, lineIndex) => (
                        <li
                          key={lineIndex}
                          className={line.includes('improved') ? 'text-emerald-100/85' : 'text-white/45'}
                        >
                          {line}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </details>
      ) : null}

      <button
        type="button"
        onClick={onStartRoute}
        disabled={!canAnimate}
        className="mt-8 flex h-[58px] w-full items-center justify-center gap-5 rounded-md px-5 text-lg font-semibold text-[#031610] shadow-[0_0_30px_rgba(84,246,186,0.22)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
        style={{ background: 'linear-gradient(135deg, #54F6BA 0%, #35E9A8 100%)' }}
      >
        {viewMode === 'dijkstra' ? 'Run trace' : 'Start route'}
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <button
        type="button"
        onClick={onShareLink}
        className="mt-4 flex h-12 w-full items-center justify-center gap-3 rounded-md border border-white/18 bg-black/18 px-5 text-sm font-semibold text-white transition-colors hover:border-emerald-300/40 focus:outline-none focus:ring-2 focus:ring-[#54F6BA]/70"
      >
        {isShareCopied ? (
          <svg className="h-5 w-5 text-[#54F6BA]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg className="h-5 w-5 text-[#54F6BA]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M10.5 13.5a5 5 0 0 0 7.5 1l2-2a5 5 0 0 0-7.07-7.07L11 6.95"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M13.5 10.5a5 5 0 0 0-7.5-1l-2 2a5 5 0 0 0 7.07 7.07l1.53-1.02"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {isShareCopied ? 'Link copied!' : 'Copy route link'}
      </button>

      <div className="mt-6 rounded-md border border-white/10 bg-white/[0.035] p-5">
        <div className="flex items-start gap-4 text-center text-sm leading-6 text-white/84">
          <svg className="mt-1 h-5 w-5 shrink-0 text-[#54F6BA]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="m12 2 2.34 7.16L22 12l-7.66 2.84L12 22l-2.34-7.16L2 12l7.66-2.84L12 2Z" />
          </svg>
          <p>
            Describe your trip in plain words and AI will pick the start, end, and any places to skip, or click any node on the map to avoid it.
            {routeError ? <span className="mt-2 block text-red-200">{routeError}</span> : null}
          </p>
        </div>
      </div>
    </section>
  );
}

interface MinimizedPanelButtonProps {
  origin: string;
  destination: string;
  onExpand: () => void;
}

function MinimizedPanelButton({ origin, destination, onExpand }: MinimizedPanelButtonProps) {
  return (
    <button
      type="button"
      onClick={onExpand}
      className="pointer-events-auto absolute left-4 top-6 z-40 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-lg border border-white/16 bg-[#071116]/84 px-4 py-3 text-left shadow-2xl shadow-black/45 backdrop-blur-xl transition-colors hover:border-emerald-300/40 md:left-6"
      aria-label="Open dashboard"
    >
      <NetworkLogo className="h-9 w-9" />
      <span className="min-w-0">
        <span className="block text-sm font-bold text-white">
          Dijkstra <span style={{ color: THEME.primaryAccent }}>Navigator</span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-white/58">
          {getNodeLabel(origin)} to {getNodeLabel(destination)}
        </span>
      </span>
      <svg className="h-5 w-5 shrink-0 text-[#54F6BA]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 8h16M4 16h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export function Dashboard() {
  const [isPanelMinimized, setIsPanelMinimized] = useState(() => hasQueryValue('panel', 'minimized'));
  const [currentOrigin, setCurrentOrigin] = useState(() => getQueryNode('origin', DEFAULT_SOURCE));
  const [currentDestination, setCurrentDestination] = useState(() => {
    const requested = getQueryNode('destination', DEFAULT_DESTINATION);

    return requested !== currentOrigin ? requested : DEFAULT_DESTINATION;
  });
  const [avoidNodes, setAvoidNodes] = useState<string[]>(() => {
    const endpointSet = new Set([currentOrigin, currentDestination]);

    return getQueryAvoidNodes().filter((nodeName) => !endpointSet.has(nodeName));
  });
  const [timelineStep, setTimelineStep] = useState(1);
  const [isAnimationRunning, setIsAnimationRunning] = useState(true);
  const [mapZoomLevel, setMapZoomLevel] = useState(1);
  const [isThreeDimensional, setIsThreeDimensional] = useState(true);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiParseState, setAiParseState] = useState<AiParseState>('idle');
  const [aiFeedback, setAiFeedback] = useState<AiFeedback | null>(null);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [isShareCopied, setIsShareCopied] = useState(false);
  const [preferences, setPreferences] = useState(() => {
    const loaded = loadPreferences();

    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('speed')) {
      return { ...loaded, speedMs: getQuerySpeedMs() };
    }

    return loaded;
  });
  const { viewMode, showEdgeWeights, speedMs: routeStepMs } = preferences;
  const shareResetTimeoutRef = useRef<number | null>(null);

  const routeCandidates = useMemo(() => {
    return kShortestPaths(CAMPUS_NODES, CAMPUS_EDGES, currentOrigin, currentDestination, avoidNodes, 3);
  }, [currentOrigin, currentDestination, avoidNodes]);

  useEffect(() => {
    setSelectedRouteIndex(0);
  }, [currentOrigin, currentDestination, avoidNodes]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set('origin', currentOrigin);
    url.searchParams.set('destination', currentDestination);

    if (avoidNodes.length === 0) {
      url.searchParams.delete('avoid');
    } else {
      url.searchParams.set('avoid', avoidNodes.join(','));
    }

    url.searchParams.delete('panel');
    if (isPanelMinimized) {
      url.searchParams.set('panel', 'minimized');
    }

    window.history.replaceState(null, '', url.toString());
  }, [avoidNodes, currentDestination, currentOrigin, isPanelMinimized]);

  const safeRouteIndex = Math.min(selectedRouteIndex, Math.max(routeCandidates.length - 1, 0));
  const routeResult: RoutingResult = useMemo(
    () => routeCandidates[safeRouteIndex] ?? { path: [], distance: Number.POSITIVE_INFINITY, error: UNREACHABLE_ERROR },
    [routeCandidates, safeRouteIndex]
  );

  const calculatedRoutePath = routeResult.path;
  const calculatedDistance = routeResult.distance;
  const routeError = routeResult.error ?? null;
  const totalSteps = getTimelineStepCount(calculatedDistance, calculatedRoutePath.length);
  const sceneStepIndex = getSceneStepIndex(timelineStep, totalSteps, calculatedRoutePath.length);
  const canAnimate = calculatedRoutePath.length > 1 && !routeError;

  const traceResult = useMemo(() => {
    return dijkstraTrace(CAMPUS_NODES, CAMPUS_EDGES, currentOrigin, currentDestination, avoidNodes);
  }, [currentOrigin, currentDestination, avoidNodes]);

  const traceTotalSteps = Math.max(traceResult.steps.length, 1);
  const traceCurrentIndex = Math.min(timelineStep - 1, Math.max(traceResult.steps.length - 1, 0));
  const traceCurrentStep = traceResult.steps[traceCurrentIndex] ?? null;
  const traceFinished = traceCurrentStep?.finished ?? false;
  const isDijkstraMode = viewMode === 'dijkstra';

  const traceSceneState: TraceStepSceneState | null = useMemo(() => {
    if (!isDijkstraMode || !traceCurrentStep || traceResult.error) {
      return null;
    }

    const settledNodes: string[] = [];

    for (let index = 0; index <= traceCurrentIndex; index += 1) {
      const settledNode = traceResult.steps[index]?.settledNode;
      if (settledNode) {
        settledNodes.push(settledNode);
      }
    }

    const settledSet = new Set(settledNodes);
    const frontierNodes: string[] = [];

    for (const [nodeName, distance] of traceCurrentStep.distanceByNode) {
      if (Number.isFinite(distance) && !settledSet.has(nodeName)) {
        frontierNodes.push(nodeName);
      }
    }

    const relaxedEdges = traceCurrentStep.relaxations
      .filter((relaxation) => relaxation.improved)
      .map((relaxation) => `${relaxation.from}->${relaxation.to}`);

    const distances = Array.from(traceCurrentStep.distanceByNode.entries())
      .filter(([, distance]) => Number.isFinite(distance))
      .map(([node, distance]) => ({ node, distance }))
      .sort((a, b) => a.distance - b.distance);

    return {
      step: traceCurrentStep.step,
      totalSteps: traceTotalSteps,
      currentSettledNode: traceCurrentStep.settledNode,
      settledNodes,
      frontierNodes,
      relaxedEdges,
      distances,
      finished: traceCurrentStep.finished,
    };
  }, [isDijkstraMode, traceCurrentIndex, traceCurrentStep, traceResult, traceTotalSteps]);

  const effectiveRoutePath = useMemo(() => {
    if (isDijkstraMode) {
      return traceFinished ? traceResult.path : [];
    }

    return calculatedRoutePath;
  }, [isDijkstraMode, traceFinished, traceResult.path, calculatedRoutePath]);
  const effectiveDistance = isDijkstraMode
    ? !traceFinished || traceResult.error
      ? Number.POSITIVE_INFINITY
      : traceResult.distance
    : calculatedDistance;
  const effectiveTotalSteps = isDijkstraMode ? traceTotalSteps : totalSteps;
  const effectiveSceneStepIndex = isDijkstraMode
    ? traceFinished
      ? traceResult.path.length
      : 0
    : sceneStepIndex;
  const effectiveCanAnimate = isDijkstraMode
    ? !traceResult.error && traceResult.steps.length > 1
    : canAnimate;
  const effectiveRouteError = isDijkstraMode ? (traceResult.error ?? null) : routeError;

  const stepLog = useMemo(() => {
    if (!isDijkstraMode) {
      return [];
    }

    return traceResult.steps.slice(0, traceCurrentIndex + 1).map(describeTraceStep);
  }, [isDijkstraMode, traceCurrentIndex, traceResult]);

  const routeSignature = `${currentOrigin}|${currentDestination}|${calculatedRoutePath.join(',')}|${totalSteps}|${safeRouteIndex}|${viewMode}|${traceTotalSteps}`;

  useEffect(() => {
    savePreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    return () => {
      if (shareResetTimeoutRef.current !== null) {
        window.clearTimeout(shareResetTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setTimelineStep(1);
    setIsAnimationRunning(effectiveCanAnimate);
  }, [routeSignature, effectiveCanAnimate]);

  useEffect(() => {
    if (!isAnimationRunning || !effectiveCanAnimate) {
      return undefined;
    }

    if (timelineStep >= effectiveTotalSteps) {
      setIsAnimationRunning(false);
      return undefined;
    }

    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setTimelineStep(effectiveTotalSteps);
      setIsAnimationRunning(false);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setTimelineStep((currentStep) => Math.min(currentStep + 1, effectiveTotalSteps));
    }, routeStepMs);

    return () => window.clearTimeout(timeoutId);
  }, [effectiveCanAnimate, effectiveTotalSteps, isAnimationRunning, routeStepMs, timelineStep]);

  function handleOriginChange(value: string) {
    setCurrentOrigin(value);
    setAvoidNodes([]);
    if (value === currentDestination) {
      const nextDestination = CAMPUS_NODES.find((node) => node.name !== value)?.name ?? '';
      setCurrentDestination(nextDestination);
    }
  }

  function handleDestinationChange(value: string) {
    setCurrentDestination(value);
    setAvoidNodes([]);
    if (value === currentOrigin) {
      const nextOrigin = CAMPUS_NODES.find((node) => node.name !== value)?.name ?? '';
      setCurrentOrigin(nextOrigin);
    }
  }

  async function handleAiSubmit() {
    const query = aiPrompt.trim();

    if (!query || aiParseState === 'parsing') {
      return;
    }

    setAiParseState('parsing');
    setAiFeedback(null);

    const parsed = await parseNavigationRequest(query);

    let nextOrigin = parsed.origin ?? currentOrigin;
    let nextDestination = parsed.destination ?? currentDestination;

    if (nextOrigin === nextDestination) {
      if (parsed.destination && !parsed.origin) {
        nextOrigin = CAMPUS_NODES.find((node) => node.name !== nextDestination)?.name ?? nextOrigin;
      } else {
        nextDestination = CAMPUS_NODES.find((node) => node.name !== nextOrigin)?.name ?? nextDestination;
      }
    }

    const changes: string[] = [];

    if (parsed.origin) {
      changes.push(`start at ${getNodeLabel(nextOrigin)}`);
    }

    if (parsed.destination) {
      changes.push(`end at ${getNodeLabel(nextDestination)}`);
    }

    const nextAvoidNodes = parsed.avoid_nodes.filter(
      (nodeName) => nodeName !== nextOrigin && nodeName !== nextDestination
    );

    setCurrentOrigin(nextOrigin);
    setCurrentDestination(nextDestination);
    setAvoidNodes(nextAvoidNodes);

    const avoidedLabel = nextAvoidNodes.map(getNodeLabel).join(', ');

    if (changes.length > 0 || nextAvoidNodes.length > 0) {
      const summary = [...changes];
      if (avoidedLabel) {
        summary.push(`skip ${avoidedLabel}`);
      }
      setAiFeedback({ message: `Route set: ${summary.join(', ')}.`, tone: 'success' });
    } else {
      setAiFeedback({
        message: 'Could not find any campus locations in that message. Try names like "main gate" or "library".',
        tone: 'error',
      });
    }

    setAiParseState('idle');
  }

  function handleSwapRoute() {
    setCurrentOrigin(currentDestination);
    setCurrentDestination(currentOrigin);
  }

  function handleNodeToggleAvoid(nodeName: string) {
    if (nodeName === currentOrigin || nodeName === currentDestination) {
      setAiFeedback({
        message: 'You cannot avoid the start or end point.',
        tone: 'error',
      });
      return;
    }

    setAvoidNodes((currentNodes) =>
      currentNodes.includes(nodeName)
        ? currentNodes.filter((name) => name !== nodeName)
        : [...currentNodes, nodeName]
    );
  }

  function handleShareLink() {
    if (typeof window === 'undefined') {
      return;
    }

    const shareUrl = buildShareUrl(window.location.href, {
      origin: currentOrigin,
      destination: currentDestination,
      avoidNodes,
    });

    const confirmCopy = () => {
      if (shareResetTimeoutRef.current !== null) {
        window.clearTimeout(shareResetTimeoutRef.current);
      }

      setIsShareCopied(true);
      shareResetTimeoutRef.current = window.setTimeout(() => setIsShareCopied(false), 2500);
    };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(shareUrl).then(confirmCopy, () => {
        setAiFeedback({
          message: 'Could not copy the link. The current route is reflected in the address bar.',
          tone: 'error',
        });
      });
    } else {
      setAiFeedback({
        message: 'Clipboard is unavailable. The current route is reflected in the address bar.',
        tone: 'error',
      });
    }
  }

  function handleTogglePause() {
    if (!effectiveCanAnimate) {
      return;
    }

    if (isAnimationRunning) {
      setIsAnimationRunning(false);
      return;
    }

    setIsAnimationRunning(timelineStep < effectiveTotalSteps);
  }

  function handleStartRoute() {
    if (!effectiveCanAnimate) {
      return;
    }

    setTimelineStep(1);
    setIsAnimationRunning(true);
  }

  function handleSkipAnimation() {
    if (!effectiveCanAnimate) {
      return;
    }

    setTimelineStep(effectiveTotalSteps);
    setIsAnimationRunning(false);
  }

  function handleStepBack() {
    if (!effectiveCanAnimate) {
      return;
    }

    setTimelineStep((currentStep) => Math.max(1, currentStep - 1));
    setIsAnimationRunning(false);
  }

  function handleStepForward() {
    if (!effectiveCanAnimate) {
      return;
    }

    setTimelineStep((currentStep) => Math.min(effectiveTotalSteps, currentStep + 1));
    setIsAnimationRunning(false);
  }

  function handleZoomIn() {
    setMapZoomLevel((zoomLevel) => clampMapZoom(zoomLevel + MAP_ZOOM_STEP));
  }

  function handleZoomOut() {
    setMapZoomLevel((zoomLevel) => clampMapZoom(zoomLevel - MAP_ZOOM_STEP));
  }

  function handleToggleThreeD() {
    setIsThreeDimensional((currentValue) => !currentValue);
  }

  function handleResetView() {
    setMapZoomLevel(1);
    setIsThreeDimensional(true);
  }

  function handleViewModeChange(mode: ViewMode) {
    if (mode === viewMode) {
      return;
    }

    setPreferences((current) => ({ ...current, viewMode: mode }));
    setTimelineStep(1);
  }

  const mapViewProps: MapViewProps = {
    origin: currentOrigin,
    destination: currentDestination,
    avoidNodes,
    routeError: effectiveRouteError,
    routePath: effectiveRoutePath,
    sceneStepIndex: effectiveSceneStepIndex,
    zoomLevel: mapZoomLevel,
    isThreeDimensional,
    isPanelMinimized,
    timelineStep,
    totalSteps: effectiveTotalSteps,
    distance: effectiveDistance,
    canAnimate: effectiveCanAnimate,
    isPaused: !isAnimationRunning,
    routeIndex: safeRouteIndex,
    routeCount: isDijkstraMode ? 1 : routeCandidates.length,
    aiPrompt,
    aiParseState,
    aiFeedback,
    isShareCopied,
    viewMode,
    showEdgeWeights,
    speedMs: routeStepMs,
    traceState: traceSceneState,
    stepLog,
    onViewModeChange: handleViewModeChange,
    onToggleEdgeWeights: () =>
      setPreferences((current) => ({ ...current, showEdgeWeights: !current.showEdgeWeights })),
    onSpeedChange: (ms) => setPreferences((current) => ({ ...current, speedMs: ms })),
    onNodeClick: handleNodeToggleAvoid,
    onOriginChange: handleOriginChange,
    onDestinationChange: handleDestinationChange,
    onSwapRoute: handleSwapRoute,
    onRouteChange: setSelectedRouteIndex,
    onTogglePause: handleTogglePause,
    onAiPromptChange: setAiPrompt,
    onAiSubmit: handleAiSubmit,
    onStartRoute: handleStartRoute,
    onMinimize: () => setIsPanelMinimized(true),
    onExpand: () => setIsPanelMinimized(false),
    onShareLink: handleShareLink,
    onSkip: handleSkipAnimation,
    onStepBack: handleStepBack,
    onStepForward: handleStepForward,
    onReplay: handleStartRoute,
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    onToggleThreeD: handleToggleThreeD,
    onResetView: handleResetView,
  };

  return <MapView {...mapViewProps} />;
}

export default Dashboard;
