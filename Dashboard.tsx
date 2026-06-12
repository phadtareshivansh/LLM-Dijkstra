import React, { useEffect, useState } from 'react';
import CommandBar, { NavigationCommandPayload } from './CommandBar';
import MapCanvas from './MapCanvas';
import { CAMPUS_EDGES, CAMPUS_NODES, THEME } from './themeConstants';
import { dijkstraShortestPath as dijkstra } from './routingEngine';

export function Dashboard() {
  const [currentOrigin, setCurrentOrigin] = useState('');
  const [currentDestination, setCurrentDestination] = useState('');
  const [avoidNodesList, setAvoidNodesList] = useState<string[]>([]);
  const [calculatedRoutePath, setCalculatedRoutePath] = useState<string[]>([]);
  const [calculatedDistance, setCalculatedDistance] = useState<number>(Number.POSITIVE_INFINITY);
  const [routeError, setRouteError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentOrigin || !currentDestination) {
      setCalculatedRoutePath([]);
      setCalculatedDistance(Number.POSITIVE_INFINITY);
      setRouteError(null);
      return;
    }

    const result = dijkstra(CAMPUS_NODES, CAMPUS_EDGES, currentOrigin, currentDestination, avoidNodesList);

    setCalculatedRoutePath(result.path);
    setCalculatedDistance(result.distance);
    setRouteError(result.error ?? null);
  }, [currentOrigin, currentDestination, avoidNodesList]);

  function handleNavigationSubmit(payload: NavigationCommandPayload) {
    setCurrentOrigin(payload.origin ?? '');
    setCurrentDestination(payload.destination ?? '');
    setAvoidNodesList(payload.avoid_nodes);
  }

  const routeLabel =
    calculatedRoutePath.length > 0 ? calculatedRoutePath.join(' → ') : 'No route calculated yet';
  const distanceLabel =
    Number.isFinite(calculatedDistance) ? `${calculatedDistance} weight units` : '—';

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ backgroundColor: THEME.background }}>
      <MapCanvas
        nodes={CAMPUS_NODES}
        edges={CAMPUS_EDGES}
        activePath={calculatedRoutePath}
        avoidNodes={avoidNodesList}
      />

      <div className="pointer-events-none relative z-20 flex min-h-screen flex-col justify-start px-4 py-5 sm:px-6 lg:px-8">
        <aside
          className="pointer-events-auto w-full max-w-[420px] rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/40 backdrop-blur-xl"
          style={{ backdropFilter: `blur(${THEME.surfaceBackdropBlur})` }}
        >
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-white/40">Navigation Control</p>
              <h1
                className="mt-2 text-2xl font-semibold text-white"
                style={{ fontFamily: 'Inter var, Inter, ui-sans-serif, system-ui, sans-serif' }}
              >
                Dashboard
              </h1>
            </div>
            <div
              className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium"
              style={{ color: THEME.primaryAccent }}
            >
              Live Dijkstra
            </div>
          </div>

          <div className="space-y-4 text-sm text-white/82">
            <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/35">Origin</p>
              <p className="mt-1 text-base text-white">{currentOrigin || 'Awaiting origin'}</p>
            </div>

            <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/35">Destination</p>
              <p className="mt-1 text-base text-white">{currentDestination || 'Awaiting destination'}</p>
            </div>

            <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/35">Avoid Nodes</p>
              <p className="mt-1 text-base text-white">
                {avoidNodesList.length > 0 ? avoidNodesList.join(', ') : 'No avoided nodes'}
              </p>
            </div>

            <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/35">Route Distance</p>
              <p className="mt-1 text-base text-white">{distanceLabel}</p>
            </div>

            <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/35">Path Trace</p>
              <p
                className="mt-1 text-base leading-6 text-white"
                style={{ textShadow: `0 0 10px ${THEME.primaryAccent}33` }}
              >
                {routeLabel}
              </p>
            </div>
          </div>

          {routeError ? (
            <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">
              <p className="text-[11px] uppercase tracking-[0.2em] text-red-100/60">Routing Error</p>
              <p className="mt-1 leading-6">{routeError}</p>
            </div>
          ) : null}
        </aside>
      </div>

      <CommandBar onNavigationSubmit={handleNavigationSubmit} />
    </div>
  );
}

export default Dashboard;
