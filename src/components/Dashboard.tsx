import React, { ChangeEvent, Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import type { TraceStepSceneState } from './RouteScene3D';
const RouteScene3D = lazy(() => import('./RouteScene3D'));
import { CAMPUS_EDGES, CAMPUS_NODES, Edge, THEME } from '../data/themeConstants';
import { DEFAULT_SOFT_PENALTY, dijkstraShortestPath, dijkstraShortestPathWithWaypoints, dijkstraTrace, Algorithm, RoutingResult, SearchFunction, UNREACHABLE_ERROR } from '../engines/routingEngine';
import { astarShortestPath } from '../engines/astar';
import { bidirectionalShortestPath } from '../engines/bidirectional';
import { kShortestPaths, AlternativeRoute } from '../engines/kShortestPaths';
import { buildDirections } from '../engines/directions';
import { buildShareUrl } from '../utils/shareUtils';
import { parseNavigationRequestWithSource } from '../utils/parseNavigationRequest';
import { TraceLogEntry, describeTraceStep } from '../engines/traceLog';
import { formatNodeLabel as getNodeLabel } from '../data/nodeLabels';
import { loadPreferences, savePreferences } from '../utils/preferences';
import { downloadGpx } from '../utils/gpxUtils';
import { buildElevationProfile, elevationStats } from '../utils/elevationUtils';
import { distanceBetweenPoints, pinchZoomTarget, vibrateRouteComplete, vibrateRouteStart } from '../utils/mobile';
import { TimeOfDay, applyTimeOfDayEdges } from '../engines/timeOfDay';

type AiParseState = 'idle' | 'parsing';
type ViewMode = 'path' | 'dijkstra';

interface AiFeedback {
  message: string;
  tone: 'success' | 'warning' | 'error';
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

  return [...new Set(
    value
      .split(',')
      .map((name) => name.trim())
      .filter((name) => validNames.has(name))
  )];
}

function getQueryWaypoints(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const value = new URLSearchParams(window.location.search).get('waypoints');

  if (!value) {
    return [];
  }

  const validNames = new Set(CAMPUS_NODES.map((node) => node.name));

  return [...new Set(
    value
      .split(',')
      .map((name) => name.trim())
      .filter((name) => validNames.has(name))
  )];
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
    <section className="pointer-events-auto absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-3 right-3 z-40 rounded-lg border border-white/14 bg-[#071116]/88 px-5 py-5 shadow-2xl shadow-black/45 backdrop-blur-xl sm:left-4 sm:right-4 sm:px-10 sm:py-6">
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
                {pathLength} stop{pathLength === 1 ? '' : 's'} · {Math.round(distance * 10) / 10} unit{Math.round(distance * 10) / 10 === 1 ? '' : 's'}
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
            {currentStep >= totalSteps ? (
              <svg className="h-6 w-6 text-[#54F6BA]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m4 12.5 5 5L20 6.5" />
              </svg>
            ) : isPaused ? (
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
    <div className="pointer-events-auto absolute right-5 top-[calc(3.5rem+env(safe-area-inset-top))] z-40 hidden flex-col items-center gap-4 md:flex">
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

const ELEVATION_CHART_WIDTH = 320;
const ELEVATION_CHART_HEIGHT = 96;
const ELEVATION_CHART_PADDING = 6;

function ElevationProfile({ path }: { path: string[] }) {
  const profile = useMemo(() => buildElevationProfile(path, CAMPUS_NODES), [path]);
  const stats = useMemo(() => elevationStats(profile), [profile]);

  if (profile.length < 2) {
    return null;
  }

  const elevationRange = Math.max(1, stats.max - stats.min);
  const pointX = (step: number) =>
    ELEVATION_CHART_PADDING + (step / Math.max(1, profile.length - 1)) * (ELEVATION_CHART_WIDTH - ELEVATION_CHART_PADDING * 2);
  const pointY = (elevation: number) =>
    ELEVATION_CHART_HEIGHT -
    ELEVATION_CHART_PADDING -
    ((elevation - stats.min) / elevationRange) * (ELEVATION_CHART_HEIGHT - ELEVATION_CHART_PADDING * 2);

  const linePoints = profile.map((point) => `${pointX(point.step)},${pointY(point.elevation)}`).join(' ');
  const areaPoints = `${pointX(0)},${ELEVATION_CHART_HEIGHT - ELEVATION_CHART_PADDING} ${linePoints} ${pointX(profile[profile.length - 1].step)},${ELEVATION_CHART_HEIGHT - ELEVATION_CHART_PADDING}`;

  return (
    <details className="mt-4 rounded-md border border-white/10 bg-white/[0.035] p-5">
      <summary className="cursor-pointer text-sm font-semibold text-white/90">Elevation profile</summary>
      <div className="mt-3">
        <svg
          viewBox={`0 0 ${ELEVATION_CHART_WIDTH} ${ELEVATION_CHART_HEIGHT}`}
          className="w-full rounded-md border border-white/10 bg-[#02080B]"
          role="img"
          aria-label={`Elevation profile from ${profile[0].node} to ${profile[profile.length - 1].node}`}
        >
          <polygon points={areaPoints} fill="rgba(84, 246, 186, 0.12)" />
          <polyline points={linePoints} fill="none" stroke="#54F6BA" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {profile.map((point) => (
            <circle
              key={point.node}
              cx={pointX(point.step)}
              cy={pointY(point.elevation)}
              r="2.6"
              fill="#02080B"
              stroke="#54F6BA"
              strokeWidth="1.4"
            />
          ))}
        </svg>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-md border border-white/10 bg-black/18 px-2 py-2">
            <span className="block font-semibold text-white/90">Ascent</span>
            <span className="font-mono tabular-nums text-emerald-300">+{stats.ascent}m</span>
          </div>
          <div className="rounded-md border border-white/10 bg-black/18 px-2 py-2">
            <span className="block font-semibold text-white/90">Descent</span>
            <span className="font-mono tabular-nums text-sky-300">-{stats.descent}m</span>
          </div>
          <div className="rounded-md border border-white/10 bg-black/18 px-2 py-2">
            <span className="block font-semibold text-white/90">Net</span>
            <span className="font-mono tabular-nums text-white/82">{stats.net >= 0 ? '+' : ''}{stats.net}m</span>
          </div>
        </div>
        <p className="mt-2 text-xs text-white/45">
          {profile.map((point, index) => (
            <span key={point.node}>
              {index > 0 && <span className="mx-1 text-white/30">→</span>}
              <span className="font-medium text-white/70">{getNodeLabel(point.node)}</span>
              <span className="ml-1 font-mono text-white/45">{point.elevation}m</span>
            </span>
          ))}
        </p>
      </div>
    </details>
  );
}

interface MapViewProps {
  origin: string;
  destination: string;
  avoidNodes: string[];
  routeError: string | null;
  routePath: string[];
  edges: Edge[];
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
  softAvoidance: boolean;
  accessibleOnly: boolean;
  algorithm: Algorithm;
  timeOfDay: TimeOfDay;
  algorithmStats: { algorithm: Algorithm; expandedNodes: number }[] | null;
  routeCandidates: AlternativeRoute[];
  selectedRouteIndex: number;
  traceState: TraceStepSceneState | null;
  stepLog: TraceLogEntry[];
  onViewModeChange: (mode: ViewMode) => void;
  onToggleEdgeWeights: () => void;
  onToggleSoftAvoidance: () => void;
  onToggleAccessibleOnly: () => void;
  onAlgorithmChange: (nextAlgorithm: Algorithm) => void;
  onTimeOfDayChange: (nextTimeOfDay: TimeOfDay) => void;
  onSpeedChange: (ms: number) => void;
  onOriginChange: (value: string) => void;
  onDestinationChange: (value: string) => void;
  onSwapRoute: () => void;
  onNodeClick: (nodeName: string) => void;
  onRouteChange: (index: number) => void;
  onTogglePause: () => void;
  onAiPromptChange: (value: string) => void;
  onAiSubmit: () => Promise<void>;
  onStartRoute: () => void;
  onMinimize: () => void;
  onExpand: () => void;
  onShareLink: () => void;
  onExportGpx: () => void;
  onSkip: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onReplay: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleThreeD: () => void;
  onResetView: () => void;
  onTouchStart: (event: React.TouchEvent<HTMLElement>) => void;
  onTouchMove: (event: React.TouchEvent<HTMLElement>) => void;
  onTouchEnd: () => void;
  toast: { message: string; action?: () => void; actionLabel?: string } | null;
  setToast: (toast: { message: string; action?: () => void; actionLabel?: string } | null) => void;
}

function MapView({
  origin,
  destination,
  avoidNodes,
  routeError,
  routePath,
  edges,
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
  softAvoidance,
  accessibleOnly,
  algorithm,
  timeOfDay,
  algorithmStats,
  routeCandidates,
  selectedRouteIndex,
  traceState,
  stepLog,
  onViewModeChange,
  onToggleEdgeWeights,
  onToggleSoftAvoidance,
  onToggleAccessibleOnly,
  onAlgorithmChange,
  onTimeOfDayChange,
  onSpeedChange,
  onNodeClick,
  toast,
  setToast,
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
  onExportGpx,
  onSkip,
  onStepBack,
  onStepForward,
  onTogglePause,
  onReplay,
  onZoomIn,
  onZoomOut,
  onToggleThreeD,
  onResetView,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: MapViewProps) {
  const traceEndpointPair = useMemo(
    () => (viewMode === 'dijkstra' ? [origin, destination] : undefined),
    [viewMode, origin, destination]
  );

  return (
    <>
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            background: '#071116',
            border: '1px solid #54F6BA',
            borderRadius: 8,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 14,
            color: 'white',
            boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
          }}
          role="alert"
        >
          <span>{toast.message}</span>
          {toast.action && toast.actionLabel && (
            <button
              onClick={() => {
                toast.action?.();
                setToast(null);
              }}
              style={{
                background: 'linear-gradient(135deg, #00FF9D 0%, #35E9A8 100%)',
                color: '#031610',
                border: 'none',
                borderRadius: 6,
                padding: '6px 12px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      )}
      <main className="relative min-h-screen overflow-hidden bg-[#02080B] text-white">
      <div className="absolute inset-0 [touch-action:none]" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <Suspense
          fallback={
            <div className="flex min-h-screen items-center justify-center bg-[#02080B]">
              <div className="flex flex-col items-center gap-4 text-white/70">
                <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/15 border-t-[#54F6BA]" />
                <p className="text-sm">Loading 3D scene…</p>
              </div>
            </div>
          }
        >
          <RouteScene3D
            nodes={CAMPUS_NODES}
            edges={edges}
            campusEdges={CAMPUS_EDGES}
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
        </Suspense>
      </div>

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
          edges={edges}
          aiPrompt={aiPrompt}
          aiParseState={aiParseState}
          aiFeedback={aiFeedback}
          isShareCopied={isShareCopied}
          viewMode={viewMode}
          showEdgeWeights={showEdgeWeights}
          speedMs={speedMs}
          softAvoidance={softAvoidance}
          accessibleOnly={accessibleOnly}
          algorithm={algorithm}
          timeOfDay={timeOfDay}
          algorithmStats={algorithmStats}
          stepLog={stepLog}
          routeCandidates={routeCandidates}
          selectedRouteIndex={selectedRouteIndex}
          onViewModeChange={onViewModeChange}
          onToggleEdgeWeights={onToggleEdgeWeights}
          onToggleSoftAvoidance={onToggleSoftAvoidance}
          onToggleAccessibleOnly={onToggleAccessibleOnly}
          onAlgorithmChange={onAlgorithmChange}
          onTimeOfDayChange={onTimeOfDayChange}
          onSpeedChange={onSpeedChange}
          onOriginChange={onOriginChange}
          onDestinationChange={onDestinationChange}
          onSwapRoute={onSwapRoute}
          onAiPromptChange={onAiPromptChange}
          onAiSubmit={onAiSubmit}
          onStartRoute={onStartRoute}
          onMinimize={onMinimize}
          onShareLink={onShareLink}
          onExportGpx={onExportGpx}
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
  </>
);
}

interface ControlPanelProps {
  origin: string;
  destination: string;
  routeError: string | null;
  routePath: string[];
  edges: Edge[];
  aiPrompt: string;
  aiParseState: AiParseState;
  aiFeedback: AiFeedback | null;
  isShareCopied: boolean;
  viewMode: ViewMode;
  showEdgeWeights: boolean;
  speedMs: number;
  softAvoidance: boolean;
  accessibleOnly: boolean;
  algorithm: Algorithm;
  timeOfDay: TimeOfDay;
  algorithmStats: { algorithm: Algorithm; expandedNodes: number }[] | null;
  stepLog: TraceLogEntry[];
  routeCandidates: AlternativeRoute[];
  selectedRouteIndex: number;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleEdgeWeights: () => void;
  onToggleSoftAvoidance: () => void;
  onToggleAccessibleOnly: () => void;
  onAlgorithmChange: (algorithm: Algorithm) => void;
  onTimeOfDayChange: (timeOfDay: TimeOfDay) => void;
  onSpeedChange: (ms: number) => void;
  onOriginChange: (value: string) => void;
  onDestinationChange: (value: string) => void;
  onSwapRoute: () => void;
  onAiPromptChange: (value: string) => void;
  onAiSubmit: () => void;
  onStartRoute: () => void;
  onMinimize: () => void;
  onShareLink: () => void;
  onExportGpx: () => void;
  canAnimate: boolean;
}

function ControlPanel({
  origin,
  destination,
  routeError,
  routePath,
  edges,
  aiPrompt,
  aiParseState,
  aiFeedback,
  isShareCopied,
  viewMode,
  showEdgeWeights,
  speedMs,
  softAvoidance,
  accessibleOnly,
  algorithm,
  timeOfDay,
  algorithmStats,
  stepLog,
  onViewModeChange,
  onToggleEdgeWeights,
  onToggleSoftAvoidance,
  onToggleAccessibleOnly,
  onAlgorithmChange,
  onTimeOfDayChange,
  onSpeedChange,
  onOriginChange,
  onDestinationChange,
  onSwapRoute,
  onAiPromptChange,
  onAiSubmit,
  onStartRoute,
  onMinimize,
  onShareLink,
  onExportGpx,
  canAnimate,
  routeCandidates,
  selectedRouteIndex,
}: ControlPanelProps) {
  const directions = useMemo(() => buildDirections(routePath, edges), [routePath, edges]);

  return (
    <section className="pointer-events-auto absolute left-3 top-[calc(1.75rem+env(safe-area-inset-top))] z-40 max-h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] w-[calc(100vw-1.5rem)] max-w-[388px] overflow-y-auto overscroll-contain rounded-lg border border-white/16 bg-[#071116]/84 p-5 shadow-2xl shadow-black/45 backdrop-blur-xl sm:p-6 md:max-w-[430px]">
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
          <div className="mt-3">
            <span className="mb-2 block text-sm font-semibold text-white">Search algorithm</span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onAlgorithmChange('dijkstra')}
                disabled={viewMode === 'dijkstra'}
                aria-pressed={algorithm === 'dijkstra'}
                className={`flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                  algorithm === 'dijkstra'
                    ? 'border-emerald-300/55 bg-[#0B1914] text-[#54F6BA]'
                    : 'border-white/14 bg-black/18 text-white/70 hover:border-emerald-300/40'
                }`}
              >
                Dijkstra
              </button>
              <button
                type="button"
                onClick={() => onAlgorithmChange('astar')}
                disabled={viewMode === 'dijkstra'}
                aria-pressed={algorithm === 'astar'}
                className={`flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                  algorithm === 'astar'
                    ? 'border-emerald-300/55 bg-[#0B1914] text-[#54F6BA]'
                    : 'border-white/14 bg-black/18 text-white/70 hover:border-emerald-300/40'
                }`}
              >
                A*
              </button>
              <button
                type="button"
                onClick={() => onAlgorithmChange('bidirectional')}
                disabled={viewMode === 'dijkstra'}
                aria-pressed={algorithm === 'bidirectional'}
                className={`flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                  algorithm === 'bidirectional'
                    ? 'border-emerald-300/55 bg-[#0B1914] text-[#54F6BA]'
                    : 'border-white/14 bg-black/18 text-white/70 hover:border-emerald-300/40'
                }`}
              >
                Bi-Dijkstra
              </button>
            </div>
            <p className="mt-1.5 text-xs text-white/45">
              A* guides the search with distance estimates; bidirectional Dijkstra expands from both ends. Trace mode
              always shows classic Dijkstra.
            </p>
            {algorithmStats && (
              <div className="mt-2 rounded-md border border-white/10 bg-black/22 px-3 py-2.5">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
                  Nodes expanded
                </span>
                <span className="mt-0.5 block text-[10px] text-white/35">
                  Bi-Dijkstra counts both frontiers combined.
                </span>
                <div className="mt-1.5 flex flex-col gap-1">
                  {algorithmStats.map((stat) => (
                    <div
                      key={stat.algorithm}
                      className={`flex items-center justify-between text-xs ${
                        stat.algorithm === algorithm ? 'text-[#54F6BA]' : 'text-white/60'
                      }`}
                    >
                      <span>{stat.algorithm === 'dijkstra' ? 'Dijkstra' : stat.algorithm === 'astar' ? 'A*' : 'Bi-Dijkstra'}</span>
                      <span className="font-mono">{stat.expandedNodes}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="mt-3">
            <span className="mb-2 block text-sm font-semibold text-white">Time of day</span>
            <div className="grid grid-cols-3 gap-2">
              {(['off-peak', 'peak', 'night'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onTimeOfDayChange(option)}
                  aria-pressed={timeOfDay === option}
                  className={`h-9 rounded-md border text-sm font-semibold transition-colors ${
                    timeOfDay === option
                      ? 'border-emerald-300/55 bg-[#0B1914] text-[#54F6BA]'
                      : 'border-white/14 bg-black/18 text-white/70 hover:border-emerald-300/40'
                  }`}
                >
                  {option === 'off-peak' ? 'Off-peak' : option === 'peak' ? 'Peak' : 'Night'}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-white/45">
              Peak hours weight narrow routes; at night, closed venues drop out of the graph.
            </p>
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
            <p className="mt-2 text-xs text-white/45">
              Shortcuts: <kbd className="rounded border border-white/15 bg-white/5 px-1">Space</kbd>{' '}
              play/pause · <kbd className="rounded border border-white/15 bg-white/5 px-1">←</kbd>{' '}
              <kbd className="rounded border border-white/15 bg-white/5 px-1">→</kbd> step ·{' '}
              <kbd className="rounded border border-white/15 bg-white/5 px-1">1</kbd>{' '}
              <kbd className="rounded border border-white/15 bg-white/5 px-1">2</kbd>{' '}
              <kbd className="rounded border border-white/15 bg-white/5 px-1">3</kbd> speed
            </p>
          </div>
        </div>

        <div>
          <label className="mt-3 flex cursor-pointer items-center justify-between rounded-md border border-white/12 bg-black/18 px-4 py-3 text-sm text-white/84 transition-colors hover:border-emerald-300/40">
            <span>Soft avoid (penalize, don't block)</span>
            <input
              type="checkbox"
              checked={softAvoidance}
              onChange={() => onToggleSoftAvoidance()}
              className="h-4 w-4 cursor-pointer accent-[#54F6BA]"
              aria-label="Soft avoid"
            />
          </label>
          <label className="mt-3 flex cursor-pointer items-center justify-between rounded-md border border-white/12 bg-black/18 px-4 py-3 text-sm text-white/84 transition-colors hover:border-emerald-300/40">
            <span>Accessible route only</span>
            <input
              type="checkbox"
              checked={accessibleOnly}
              onChange={() => onToggleAccessibleOnly()}
              className="h-4 w-4 cursor-pointer accent-[#54F6BA]"
              aria-label="Accessible route only"
            />
          </label>
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
              className={`mt-2 text-sm leading-5 ${aiFeedback.tone === 'success' ? 'text-emerald-200' : aiFeedback.tone === 'warning' ? 'text-amber-200' : 'text-red-200'}`}
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
            {directions.map((leg, idx) => {
                const legDist = Math.round(leg.distance * 10) / 10;
                const cumulativeRounded = directions
                  .slice(0, idx + 1)
                  .reduce((sum, l) => sum + Math.round(l.distance * 10) / 10, 0);
                return (
                  <li key={leg.index} className="flex items-start gap-2">
                    <span
                      className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: THEME.primaryAccent }}
                    />
                    <span>
                      <span className="font-medium text-white">
                        {getNodeLabel(leg.from)} → {getNodeLabel(leg.to)}
                      </span>{' '}
                      · {legDist} unit{legDist === 1 ? '' : 's'} · {cumulativeRounded} units total
                    </span>
                  </li>
                );
              })}
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

      {routeCandidates.length > 1 && viewMode !== 'dijkstra' ? (
        <details className="mt-6 rounded-md border border-white/10 bg-white/[0.035] p-5">
          <summary className="cursor-pointer text-sm font-semibold text-white/90">
            Route comparison ({routeCandidates.length} alternatives)
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm text-left text-white/78">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="pb-2 font-semibold text-white/90">Route</th>
                  <th className="pb-2 font-semibold text-white/90">Distance</th>
                  <th className="pb-2 font-semibold text-white/90">Path</th>
                </tr>
              </thead>
              <tbody>
                {routeCandidates.map((route: AlternativeRoute, idx: number) => (
                  <tr
                    key={idx}
                    className={`border-b border-white/5 transition-colors ${
                      idx === selectedRouteIndex ? 'bg-emerald-300/10' : ''
                    }`}
                  >
                    <td className="py-2 font-semibold text-white">
                      {idx === 0 ? 'Primary' : `Alt ${idx}`}
                    </td>
                    <td className="py-2 font-mono tabular-nums text-white/90">
                      {Math.round(route.distance * 10) / 10} units
                    </td>
                    <td className="py-2 text-white/70">
                      {route.path.map((node: string, i: number) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && <span className="text-white/40">→</span>}
                          <span className={i === 0 ? 'font-semibold' : ''}>
                            {getNodeLabel(node)}
                          </span>
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-white/50">
            Click a route in the timeline switcher to select it.
          </p>
        </details>
      ) : null}

      {viewMode === 'path' && routePath.length > 0 ? <ElevationProfile path={routePath} /> : null}

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

      <button
        type="button"
        onClick={onExportGpx}
        disabled={!canAnimate || routePath.length === 0}
        className="mt-3 flex h-12 w-full items-center justify-center gap-3 rounded-md border border-white/18 bg-black/18 px-5 text-sm font-semibold text-white transition-colors hover:border-emerald-300/40 focus:outline-none focus:ring-2 focus:ring-[#54F6BA]/70 disabled:cursor-not-allowed disabled:opacity-45"
      >
        <svg className="h-5 w-5 text-[#54F6BA]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Export GPX
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
      className="pointer-events-auto absolute left-4 top-[calc(1.5rem+env(safe-area-inset-top))] z-40 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-lg border border-white/16 bg-[#071116]/84 px-4 py-3 text-left shadow-2xl shadow-black/45 backdrop-blur-xl transition-colors hover:border-emerald-300/40 md:left-6"
aria-label="Open route planner"
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
  const [isPanelMinimized, setIsPanelMinimized] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    if (hasQueryValue('panel', 'minimized')) {
      return true;
    }
    try {
      const stored = localStorage.getItem('dijkstra-navigator-preferences');
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.panelMinimized === true;
      }
    } catch {
      // ignore
    }
    return false;
  });
  const [currentOrigin, setCurrentOrigin] = useState(() => getQueryNode('origin', DEFAULT_SOURCE));
  const [currentDestination, setCurrentDestination] = useState(() => {
    const requested = getQueryNode('destination', DEFAULT_DESTINATION);

    return requested !== currentOrigin ? requested : DEFAULT_DESTINATION;
  });
  const [avoidNodes, setAvoidNodes] = useState<string[]>(() => {
    const endpointSet = new Set([currentOrigin, currentDestination]);

    return getQueryAvoidNodes().filter((nodeName) => !endpointSet.has(nodeName));
  });
  const [waypoints, setWaypoints] = useState<string[]>(() => {
    const endpointSet = new Set([currentOrigin, currentDestination]);

    return getQueryWaypoints().filter((nodeName) => !endpointSet.has(nodeName));
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
  const [toast, setToast] = useState<{ message: string; action?: () => void; actionLabel?: string } | null>(null);
  const [preferences, setPreferences] = useState(() => {
    const loaded = loadPreferences();

    if (typeof window === 'undefined') {
      return loaded;
    }

    const params = new URLSearchParams(window.location.search);
    const next = { ...loaded };

    if (params.get('speed')) {
      next.speedMs = getQuerySpeedMs();
    }

    const requestedAlgorithm = params.get('algorithm');
    if (requestedAlgorithm === 'astar' || requestedAlgorithm === 'bidirectional') {
      next.algorithm = requestedAlgorithm;
    }

    if (params.get('softAvoidance') === 'true') {
      next.softAvoidance = true;
    }

    if (params.get('accessibleOnly') === 'true') {
      next.accessibleOnly = true;
    }

    const requestedTimeOfDay = params.get('timeOfDay');
    if (requestedTimeOfDay === 'peak' || requestedTimeOfDay === 'night') {
      next.timeOfDay = requestedTimeOfDay;
    }

    const requestedViewMode = params.get('viewMode');
    if (requestedViewMode === 'dijkstra' || requestedViewMode === 'path') {
      next.viewMode = requestedViewMode;
    }

    const requestedShowEdgeWeights = params.get('showEdgeWeights');
    if (requestedShowEdgeWeights === 'true' || requestedShowEdgeWeights === 'false') {
      next.showEdgeWeights = requestedShowEdgeWeights === 'true';
    }

    const requestedPanel = params.get('panel');
    if (requestedPanel === 'minimized') {
      next.panelMinimized = true;
    }

    return next;
  });
  const { viewMode, showEdgeWeights, speedMs: routeStepMs, softAvoidance, accessibleOnly, algorithm, timeOfDay } = preferences;
  const shareResetTimeoutRef = useRef<number | null>(null);
  const userPausedRef = useRef(false);
  const aiSubmitInFlightRef = useRef(false);
  const latestStateRef = useRef({ origin: currentOrigin, destination: currentDestination, avoidNodes, waypoints });

  useEffect(() => {
    latestStateRef.current = { origin: currentOrigin, destination: currentDestination, avoidNodes, waypoints };
  });

  const effectiveEdges = useMemo(() => applyTimeOfDayEdges(CAMPUS_EDGES, timeOfDay), [timeOfDay]);

  const routeCandidates = useMemo<Array<AlternativeRoute & { error?: string }>>(() => {
    const softAvoidanceConfig = softAvoidance ? { penalty: DEFAULT_SOFT_PENALTY } : undefined;
    const search: SearchFunction =
      algorithm === 'astar' ? astarShortestPath : algorithm === 'bidirectional' ? bidirectionalShortestPath : dijkstraShortestPath;

    if (waypoints.length > 0) {
      const result = dijkstraShortestPathWithWaypoints(
        CAMPUS_NODES,
        effectiveEdges,
        currentOrigin,
        waypoints,
        currentDestination,
        avoidNodes,
        softAvoidanceConfig,
        accessibleOnly,
        search
      );

      if (result.error) {
        return [{ path: [], distance: Number.POSITIVE_INFINITY, error: result.error }];
      }

      return [{ path: result.path, distance: result.distance }];
    }

    return kShortestPaths(CAMPUS_NODES, effectiveEdges, currentOrigin, currentDestination, avoidNodes, 3, softAvoidanceConfig, accessibleOnly, search);
  }, [currentOrigin, currentDestination, avoidNodes, waypoints, softAvoidance, accessibleOnly, algorithm, effectiveEdges]);

  const algorithmStats = useMemo(() => {
    if (waypoints.length > 0) {
      return null;
    }

    const softAvoidanceConfig = softAvoidance ? { penalty: DEFAULT_SOFT_PENALTY } : undefined;
    const searches: [Algorithm, SearchFunction][] = [
      ['dijkstra', dijkstraShortestPath],
      ['astar', astarShortestPath],
      ['bidirectional', bidirectionalShortestPath],
    ];

    return searches.map(([name, search]) => ({
      algorithm: name,
      expandedNodes: search(CAMPUS_NODES, effectiveEdges, currentOrigin, currentDestination, avoidNodes, softAvoidanceConfig, accessibleOnly).stats?.expandedNodes ?? 0,
    }));
  }, [currentOrigin, currentDestination, avoidNodes, softAvoidance, accessibleOnly, effectiveEdges, waypoints.length]);

  useEffect(() => {
    setSelectedRouteIndex(0);
  }, [currentOrigin, currentDestination, avoidNodes, waypoints]);

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

    if (waypoints.length === 0) {
      url.searchParams.delete('waypoints');
    } else {
      url.searchParams.set('waypoints', waypoints.join(','));
    }

    url.searchParams.set('algorithm', algorithm);

    if (softAvoidance) {
      url.searchParams.set('softAvoidance', 'true');
    } else {
      url.searchParams.delete('softAvoidance');
    }

    if (accessibleOnly) {
      url.searchParams.set('accessibleOnly', 'true');
    } else {
      url.searchParams.delete('accessibleOnly');
    }

    url.searchParams.set('timeOfDay', timeOfDay);
    url.searchParams.set('speed', String(routeStepMs));
    url.searchParams.set('viewMode', viewMode);
    url.searchParams.set('showEdgeWeights', String(showEdgeWeights));

    url.searchParams.delete('panel');
    if (isPanelMinimized) {
      url.searchParams.set('panel', 'minimized');
    }

    window.history.replaceState(null, '', url.toString());
  }, [accessibleOnly, algorithm, avoidNodes, currentDestination, currentOrigin, isPanelMinimized, routeStepMs, showEdgeWeights, softAvoidance, timeOfDay, viewMode, waypoints]);

  const safeRouteIndex = Math.min(selectedRouteIndex, Math.max(routeCandidates.length - 1, 0));
  const routeResult: RoutingResult = useMemo(
    () => routeCandidates[safeRouteIndex] ?? { path: [], distance: Number.POSITIVE_INFINITY, error: UNREACHABLE_ERROR },
    [routeCandidates, safeRouteIndex]
  );

  const calculatedRoutePath = routeResult.path;
  const prevRoutePathLengthRef = useRef(calculatedRoutePath.length);
  const calculatedDistance = routeResult.distance;
  const routeError = routeResult.error ?? null;
  const totalSteps = getTimelineStepCount(calculatedDistance, calculatedRoutePath.length);
  const sceneStepIndex = getSceneStepIndex(timelineStep, totalSteps, calculatedRoutePath.length);
  const canAnimate = calculatedRoutePath.length > 1 && !routeError;

  const traceResult = useMemo(() => {
    const softAvoidanceConfig = softAvoidance ? { penalty: DEFAULT_SOFT_PENALTY } : undefined;
    return dijkstraTrace(
      CAMPUS_NODES,
      effectiveEdges,
      currentOrigin,
      currentDestination,
      avoidNodes,
      softAvoidanceConfig,
      accessibleOnly
    );
  }, [currentOrigin, currentDestination, avoidNodes, effectiveEdges, softAvoidance, accessibleOnly]);

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

    const distanceEntries: Array<[string, number]> = Array.from(traceCurrentStep.distanceByNode.entries());

    const distances = distanceEntries
      .filter(([, distance]) => Number.isFinite(distance))
      .map(([node, distance]) => ({ node, distance }))
      .sort((a: { node: string; distance: number }, b: { node: string; distance: number }) => a.distance - b.distance);

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
  const effectiveRouteError = (() => {
    const baseError = isDijkstraMode ? (traceResult.error ?? null) : routeError;

    if (baseError === UNREACHABLE_ERROR && timeOfDay === 'night' && accessibleOnly) {
      return `${baseError} At night the cafeteria corridor is closed, and the only remaining link to the library requires stairs — try switching accessible-only off or picking off-peak.`;
    }

    return baseError;
  })();

  const stepLog = useMemo(() => {
    if (!isDijkstraMode) {
      return [];
    }

    return traceResult.steps.slice(0, traceCurrentIndex + 1).map(describeTraceStep);
  }, [isDijkstraMode, traceCurrentIndex, traceResult]);

  const routeSignature = `${currentOrigin}|${currentDestination}|${calculatedRoutePath.join(',')}|${traceResult.path.join(',')}|${safeRouteIndex}|${viewMode}`;

  useEffect(() => {
    if (effectiveRouteError === UNREACHABLE_ERROR && timeOfDay === 'night' && accessibleOnly) {
      setToast({
        message: 'Night + accessible-only disconnects the campus. Disable accessible-only to find a route?',
        action: () => setPreferences((p) => ({ ...p, accessibleOnly: false })),
        actionLabel: 'Disable accessible-only',
      });
    } else {
      setToast(null);
    }
  }, [effectiveRouteError, timeOfDay, accessibleOnly]);

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
    const pathLen = calculatedRoutePath.length;
    const lengthChanged = pathLen !== prevRoutePathLengthRef.current;
    prevRoutePathLengthRef.current = pathLen;

    if (!lengthChanged && userPausedRef.current) {
      return;
    }

    setTimelineStep(1);
    setIsAnimationRunning(userPausedRef.current ? false : effectiveCanAnimate);
  }, [routeSignature, effectiveCanAnimate, calculatedRoutePath.length]);

  useEffect(() => {
    if (!isAnimationRunning || !effectiveCanAnimate) {
      return undefined;
    }

    if (timelineStep >= effectiveTotalSteps) {
      setIsAnimationRunning(false);
      vibrateRouteComplete();
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

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      return (
        target.isContentEditable ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      );
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || isTypingTarget(event.target)) {
        return;
      }

      if (event.key === ' ') {
        if (event.target instanceof HTMLElement && event.target.tagName === 'BUTTON') {
          return;
        }

        event.preventDefault();
        handleTogglePause();
        return;
      }

      switch (event.key) {
        case ' ':
          event.preventDefault();
          handleTogglePause();
          break;
        case 'ArrowLeft':
          handleStepBack();
          break;
        case 'ArrowRight':
          handleStepForward();
          break;
        case '1':
          handleSpeedChange(SPEED_PRESETS[0].ms);
          break;
        case '2':
          handleSpeedChange(SPEED_PRESETS[1].ms);
          break;
        case '3':
          handleSpeedChange(SPEED_PRESETS[2].ms);
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSpeedChange, handleStepBack, handleStepForward, handleTogglePause]);

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

    if (!query || aiSubmitInFlightRef.current) {
      return;
    }

    aiSubmitInFlightRef.current = true;
    setAiParseState('parsing');
    setAiFeedback(null);

    const submitState = latestStateRef.current;

    const { result: parsed, source: parseSource } = await parseNavigationRequestWithSource(query, {
      origin: submitState.origin,
      destination: submitState.destination,
      avoid_nodes: submitState.avoidNodes,
      waypoints: submitState.waypoints,
    });

    try {
      const current = latestStateRef.current;

      let nextOrigin = parsed.origin ?? current.origin;
      let nextDestination = parsed.destination ?? current.destination;

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
      const nextWaypoints = parsed.waypoints.filter(
        (nodeName) =>
          nodeName !== nextOrigin && nodeName !== nextDestination && !nextAvoidNodes.includes(nodeName)
      );

      setCurrentOrigin(nextOrigin);
      setCurrentDestination(nextDestination);
      setAvoidNodes(nextAvoidNodes);
      setWaypoints(nextWaypoints);

      const avoidedLabel = nextAvoidNodes.map(getNodeLabel).join(', ');
      const waypointLabel = nextWaypoints.map(getNodeLabel).join(', ');

      if (changes.length > 0 || nextAvoidNodes.length > 0 || nextWaypoints.length > 0) {
        const summary = [...changes];
        if (waypointLabel) {
          summary.push(`via ${waypointLabel}`);
        }
        if (avoidedLabel) {
          summary.push(`skip ${avoidedLabel}`);
        }

        const degradedNote = parseSource === 'local' ? ' (AI unavailable — used the built-in parser.)' : '';
        setAiFeedback({ message: `Route set: ${summary.join(', ')}.${degradedNote}`, tone: parseSource === 'local' ? 'warning' : 'success' });
      } else {
        setAiFeedback({
          message: 'Could not find any campus locations in that message. Try names like "main gate" or "library".',
          tone: 'error',
        });
      }
    } finally {
      aiSubmitInFlightRef.current = false;
      setAiParseState('idle');
    }
  }

  function handleSwapRoute() {
    setCurrentOrigin(currentDestination);
    setCurrentDestination(currentOrigin);
    setAvoidNodes([]);
    setWaypoints([]);
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
      waypoints,
      algorithm,
      softAvoidance,
      accessibleOnly,
      timeOfDay,
      speedMs: routeStepMs,
      viewMode,
      showEdgeWeights,
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

  function handleSpeedChange(ms: number) {
    setPreferences((current) => ({ ...current, speedMs: ms }));
  }

  function handleExportGpx() {
    if (effectiveRoutePath.length === 0) {
      return;
    }

    downloadGpx(effectiveRoutePath, CAMPUS_NODES, {
      name: `${currentOrigin} to ${currentDestination}`,
      distance: effectiveDistance,
      filename: `dijkstra-${currentOrigin}-to-${currentDestination}.gpx`,
    });
  }

  function handleTogglePause() {
    if (!effectiveCanAnimate) {
      return;
    }

    if (isAnimationRunning) {
      userPausedRef.current = true;
      setIsAnimationRunning(false);
      return;
    }

    userPausedRef.current = false;
    setIsAnimationRunning(timelineStep < effectiveTotalSteps);
  }

  function handleStartRoute() {
    if (!effectiveCanAnimate) {
      return;
    }

    userPausedRef.current = false;
    setTimelineStep(1);
    setIsAnimationRunning(true);
    vibrateRouteStart();
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

    userPausedRef.current = true;
    setTimelineStep((currentStep) => Math.max(1, currentStep - 1));
    setIsAnimationRunning(false);
  }

  function handleStepForward() {
    if (!effectiveCanAnimate) {
      return;
    }

    userPausedRef.current = true;
    setTimelineStep((currentStep) => Math.min(effectiveTotalSteps, currentStep + 1));
    setIsAnimationRunning(false);
  }

  function handleZoomIn() {
    setMapZoomLevel((zoomLevel) => clampMapZoom(zoomLevel + MAP_ZOOM_STEP));
  }

  function handleZoomOut() {
    setMapZoomLevel((zoomLevel) => clampMapZoom(zoomLevel - MAP_ZOOM_STEP));
  }

  const pinchGestureRef = useRef<{ startDistance: number; startZoom: number } | null>(null);

  function handleTouchStart(event: React.TouchEvent<HTMLElement>) {
    if (event.touches.length !== 2) {
      return;
    }

    const stage = event.currentTarget;
    const t1 = event.touches[0].target as Node;
    const t2 = event.touches[1].target as Node;
    if (!stage.contains(t1) || !stage.contains(t2)) {
      return;
    }

    const [first, second] = Array.from(event.touches);

    pinchGestureRef.current = {
      startDistance: distanceBetweenPoints(first.clientX, first.clientY, second.clientX, second.clientY),
      startZoom: mapZoomLevel,
    };
  }

  function handleTouchMove(event: React.TouchEvent<HTMLElement>) {
    const gesture = pinchGestureRef.current;

    if (!gesture || event.touches.length !== 2) {
      return;
    }

    const [first, second] = Array.from(event.touches);
    const currentDistance = distanceBetweenPoints(first.clientX, first.clientY, second.clientX, second.clientY);

    setMapZoomLevel(pinchZoomTarget(gesture.startDistance, currentDistance, gesture.startZoom, MIN_MAP_ZOOM, MAX_MAP_ZOOM));
  }

  function handleTouchEnd() {
    pinchGestureRef.current = null;
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
    edges: effectiveEdges,
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
    softAvoidance,
    accessibleOnly,
    algorithm,
    timeOfDay,
    algorithmStats,
    routeCandidates,
    selectedRouteIndex: safeRouteIndex,
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
    onToggleSoftAvoidance: () =>
      setPreferences((current) => ({ ...current, softAvoidance: !current.softAvoidance })),
    onToggleAccessibleOnly: () =>
      setPreferences((current) => ({ ...current, accessibleOnly: !current.accessibleOnly })),
    onAlgorithmChange: (nextAlgorithm) =>
      setPreferences((current) => ({ ...current, algorithm: nextAlgorithm })),
    onTimeOfDayChange: (nextTimeOfDay) =>
      setPreferences((current) => ({ ...current, timeOfDay: nextTimeOfDay })),
    onSpeedChange: handleSpeedChange,
    onNodeClick: handleNodeToggleAvoid,
    onOriginChange: handleOriginChange,
    onDestinationChange: handleDestinationChange,
    onSwapRoute: handleSwapRoute,
    onRouteChange: setSelectedRouteIndex,
    onTogglePause: handleTogglePause,
    onAiPromptChange: setAiPrompt,
    onAiSubmit: handleAiSubmit,
    onStartRoute: handleStartRoute,
    onMinimize: () => {
      setIsPanelMinimized(true);
      window.setTimeout(() => {
        document.querySelector<HTMLElement>('[aria-label="Open dashboard"]')?.focus();
      }, 0);
    },
    onExpand: () => {
      setIsPanelMinimized(false);
      window.setTimeout(() => {
        document.querySelector<HTMLElement>('[aria-label="Minimize dashboard"]')?.focus();
      }, 0);
    },
    onShareLink: handleShareLink,
    onExportGpx: handleExportGpx,
    onSkip: handleSkipAnimation,
    onStepBack: handleStepBack,
    onStepForward: handleStepForward,
    onReplay: handleStartRoute,
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    onToggleThreeD: handleToggleThreeD,
    onResetView: handleResetView,
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    toast,
    setToast,
  };

  return <MapView {...mapViewProps} />;
}

export default Dashboard;
