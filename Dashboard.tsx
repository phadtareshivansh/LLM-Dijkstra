import React, { ChangeEvent, useEffect, useMemo, useState } from 'react';
import RouteScene3D from './RouteScene3D';
import { CAMPUS_EDGES, CAMPUS_NODES, THEME } from './themeConstants';
import { dijkstraShortestPath as dijkstra } from './routingEngine';

const ROUTE_STEP_MS = 920;
const DEFAULT_SOURCE = 'Main_Gate';
const DEFAULT_DESTINATION = 'Library';
const MIN_MAP_ZOOM = 0.78;
const MAX_MAP_ZOOM = 1.34;
const MAP_ZOOM_STEP = 0.12;

type AppView = 'landing' | 'map';

function clampMapZoom(value: number): number {
  return Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, Number(value.toFixed(2))));
}

function hasQueryValue(name: string, value: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return new URLSearchParams(window.location.search).get(name) === value;
}

function getNodeLabel(nodeName: string): string {
  if (nodeName === 'Main_Gate') {
    return 'Main Entrance';
  }

  return nodeName.replace(/_/g, ' ');
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
  onSkip: () => void;
  onReplay: () => void;
  canControl: boolean;
}

function RouteTimeline({ currentStep, totalSteps, onSkip, onReplay, canControl }: RouteTimelineProps) {
  const steps = Array.from({ length: totalSteps }, (_, index) => index + 1);

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
          <div className="mb-7 text-center">
            <p className="text-base font-medium text-white">Step</p>
            <p className="mt-2 text-2xl font-semibold text-white">
              <span style={{ color: THEME.primaryAccent }}>{currentStep}</span> / {totalSteps}
            </p>
          </div>

          <div className="mx-auto flex max-w-[980px] items-center">
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

        <button
          type="button"
          onClick={onReplay}
          disabled={!canControl}
          className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-md border border-white/18 bg-black/18 px-5 text-base font-semibold text-white transition-colors hover:border-emerald-300/40 disabled:cursor-not-allowed disabled:opacity-40 lg:w-[214px]"
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
  routeError: string | null;
  routePath: string[];
  sceneStepIndex: number;
  zoomLevel: number;
  isThreeDimensional: boolean;
  isPanelMinimized: boolean;
  timelineStep: number;
  totalSteps: number;
  canAnimate: boolean;
  onOriginChange: (value: string) => void;
  onDestinationChange: (value: string) => void;
  onStartRoute: () => void;
  onMinimize: () => void;
  onExpand: () => void;
  onSkip: () => void;
  onReplay: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleThreeD: () => void;
  onResetView: () => void;
}

function MapView({
  origin,
  destination,
  routeError,
  routePath,
  sceneStepIndex,
  zoomLevel,
  isThreeDimensional,
  isPanelMinimized,
  timelineStep,
  totalSteps,
  canAnimate,
  onOriginChange,
  onDestinationChange,
  onStartRoute,
  onMinimize,
  onExpand,
  onSkip,
  onReplay,
  onZoomIn,
  onZoomOut,
  onToggleThreeD,
  onResetView,
}: MapViewProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#02080B] text-white">
      <RouteScene3D
        nodes={CAMPUS_NODES}
        edges={CAMPUS_EDGES}
        activePath={routePath}
        avoidNodes={[]}
        stepIndex={sceneStepIndex}
        zoomLevel={zoomLevel}
        isThreeDimensional={isThreeDimensional}
        variant="background"
        showHud={false}
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
          onOriginChange={onOriginChange}
          onDestinationChange={onDestinationChange}
          onStartRoute={onStartRoute}
          onMinimize={onMinimize}
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

      <RouteTimeline
        currentStep={timelineStep}
        totalSteps={totalSteps}
        onSkip={onSkip}
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
  onOriginChange: (value: string) => void;
  onDestinationChange: (value: string) => void;
  onStartRoute: () => void;
  onMinimize: () => void;
  canAnimate: boolean;
}

function ControlPanel({
  origin,
  destination,
  routeError,
  onOriginChange,
  onDestinationChange,
  onStartRoute,
  onMinimize,
  canAnimate,
}: ControlPanelProps) {
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

      <div className="mt-9 space-y-7">
        <NodeSelect
          id="source-select"
          label="Source"
          value={origin}
          blockedValue={destination}
          onChange={onOriginChange}
        />
        <NodeSelect
          id="destination-select"
          label="Destination"
          value={destination}
          blockedValue={origin}
          onChange={onDestinationChange}
        />
      </div>

      <button
        type="button"
        onClick={onStartRoute}
        disabled={!canAnimate}
        className="mt-8 flex h-[58px] w-full items-center justify-center gap-5 rounded-md px-5 text-lg font-semibold text-[#031610] shadow-[0_0_30px_rgba(84,246,186,0.22)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
        style={{ background: 'linear-gradient(135deg, #54F6BA 0%, #35E9A8 100%)' }}
      >
        Start route
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="mt-6 rounded-md border border-white/10 bg-white/[0.035] p-5">
        <div className="flex items-start gap-4 text-center text-sm leading-6 text-white/84">
          <svg className="mt-1 h-5 w-5 shrink-0 text-[#54F6BA]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="m12 2 2.34 7.16L22 12l-7.66 2.84L12 22l-2.34-7.16L2 12l7.66-2.84L12 2Z" />
          </svg>
          <p>
            AI-assisted Dijkstra computes the shortest path across campus.
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
  const [view, setView] = useState<AppView>(() => (hasQueryValue('view', 'map') ? 'map' : 'landing'));
  const [isPanelMinimized, setIsPanelMinimized] = useState(() => hasQueryValue('panel', 'minimized'));
  const [currentOrigin, setCurrentOrigin] = useState(DEFAULT_SOURCE);
  const [currentDestination, setCurrentDestination] = useState(DEFAULT_DESTINATION);
  const [timelineStep, setTimelineStep] = useState(1);
  const [isAnimationRunning, setIsAnimationRunning] = useState(true);
  const [mapZoomLevel, setMapZoomLevel] = useState(1);
  const [isThreeDimensional, setIsThreeDimensional] = useState(true);

  const routeResult = useMemo(() => {
    return dijkstra(CAMPUS_NODES, CAMPUS_EDGES, currentOrigin, currentDestination, []);
  }, [currentOrigin, currentDestination]);

  const calculatedRoutePath = routeResult.path;
  const calculatedDistance = routeResult.distance;
  const routeError = routeResult.error ?? null;
  const totalSteps = getTimelineStepCount(calculatedDistance, calculatedRoutePath.length);
  const sceneStepIndex = getSceneStepIndex(timelineStep, totalSteps, calculatedRoutePath.length);
  const canAnimate = calculatedRoutePath.length > 1 && !routeError;
  const routeSignature = `${currentOrigin}|${currentDestination}|${calculatedRoutePath.join(',')}|${totalSteps}`;

  useEffect(() => {
    setTimelineStep(1);
    setIsAnimationRunning(canAnimate);
  }, [routeSignature, canAnimate]);

  useEffect(() => {
    if (!isAnimationRunning || !canAnimate || view !== 'map') {
      return undefined;
    }

    if (timelineStep >= totalSteps) {
      setIsAnimationRunning(false);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setTimelineStep((currentStep) => Math.min(currentStep + 1, totalSteps));
    }, ROUTE_STEP_MS);

    return () => window.clearTimeout(timeoutId);
  }, [canAnimate, isAnimationRunning, timelineStep, totalSteps, view]);

  function handleOriginChange(value: string) {
    setCurrentOrigin(value);
    if (value === currentDestination) {
      const nextDestination = CAMPUS_NODES.find((node) => node.name !== value)?.name ?? '';
      setCurrentDestination(nextDestination);
    }
  }

  function handleDestinationChange(value: string) {
    setCurrentDestination(value);
    if (value === currentOrigin) {
      const nextOrigin = CAMPUS_NODES.find((node) => node.name !== value)?.name ?? '';
      setCurrentOrigin(nextOrigin);
    }
  }

  function handleStartRoute() {
    if (!canAnimate) {
      return;
    }

    setView('map');
    setTimelineStep(1);
    setIsAnimationRunning(true);
  }

  function handleSkipAnimation() {
    if (!canAnimate) {
      return;
    }

    setTimelineStep(totalSteps);
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

  const mapViewProps: MapViewProps = {
    origin: currentOrigin,
    destination: currentDestination,
    routeError,
    routePath: calculatedRoutePath,
    sceneStepIndex,
    zoomLevel: mapZoomLevel,
    isThreeDimensional,
    isPanelMinimized,
    timelineStep,
    totalSteps,
    canAnimate,
    onOriginChange: handleOriginChange,
    onDestinationChange: handleDestinationChange,
    onStartRoute: handleStartRoute,
    onMinimize: () => setIsPanelMinimized(true),
    onExpand: () => setIsPanelMinimized(false),
    onSkip: handleSkipAnimation,
    onReplay: handleStartRoute,
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    onToggleThreeD: handleToggleThreeD,
    onResetView: handleResetView,
  };

  return <MapView {...mapViewProps} />;
}

export default Dashboard;
