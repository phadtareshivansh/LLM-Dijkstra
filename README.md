# Dijkstra Navigator

An interactive 3D campus map where you can watch Dijkstra's algorithm build the shortest route, step by step. Type your trip in plain English ("from main gate to the library, skip the cafeteria") and the app plots it for you.

## Features

- Live 3D campus scene built with Three.js — buildings, trees, node hubs, and an animated glowing route
- Step-by-step Dijkstra visualization with a timeline you can skip or replay
- **Alternative routes**: when several distinct paths exist, flip between them with the "Route 1 of N" switcher on the timeline (Yen's k-shortest-paths algorithm)
- **Turn-by-turn directions**: expandable per-leg instructions with per-leg and cumulative distances for the active route
- **Shareable deep links**: the URL stays in sync with your route (`?origin=&destination=&avoid=`), and "Copy route link" drops a share-ready URL into your clipboard
- Plain-language routing via the **Ask AI** box — understands informal names like "canteen" or "main entrance", including phrases like "avoid the auditorium"
- Works without an API key: a built-in local parser handles common phrasings; when `VITE_GEMINI_API_KEY` is set, Gemini parses requests too (with a 15s timeout and a 30-minute local cache, so the UI never sticks on "Thinking" and API spend stays low)
- 2D / 3D view toggle, zoom, and reset controls
- Graceful fallbacks: an SVG map renders if WebGL is unavailable, and an error boundary recovers from crashes

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:5173.

### Optional: enable Gemini parsing

```bash
cp .env.example .env   # then add your key
```

| Variable | Purpose |
| --- | --- |
| `VITE_GEMINI_API_KEY` | Used to parse natural-language route requests with Gemini |

Without a key the app still works — it falls back to the built-in parser.

> **Security note:** a `VITE_*` variable is inlined into the client bundle at
> build time, so the Gemini key is visible to anyone who opens the deployed
> site's JavaScript. Protect it by creating the API key with
> **HTTP referrer restrictions** limited to your deployed domain and set a
> **daily quota** in Google Cloud. Never use an unrestricted key. The safest
> setup for a public site is a tiny serverless proxy (Cloudflare Worker or
> similar) that holds the key server-side.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run typecheck` | Type-check with strict TypeScript |
| `npm test` | Run the unit tests (route engine, k-shortest paths, directions, node lookup, phrase parsing, caching) |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build locally |

## How it works

1. The **Ask AI** input (or the source/destination pickers) sets the trip.
2. `routingEngine.ts` runs Dijkstra's algorithm over the campus graph in `themeConstants.ts`; `kShortestPaths.ts` finds the alternative routes, so the timeline can flip between "Route 1 of N".
3. The 3D scene animates the route one node at a time, and the timeline tracks the current step.
4. "Skip animation" jumps to the final route; "Replay" restarts it.
5. The URL always reflects the current trip (`?origin=Main_Gate&destination=Library&avoid=Auditorium&panel=minimized`) — paste it anywhere or use "Copy route link" to share it.

## Project layout

| File | Purpose |
| --- | --- |
| `Dashboard.tsx` | The full-screen UI: control panel, timeline, route switcher, share button, and map controls |
| `RouteScene3D.tsx` | Three.js campus scene with the animated route (static world built once; only the route layer redraws per step) |
| `routingEngine.ts` | Dijkstra implementation with avoid-node support |
| `kShortestPaths.ts` | Yen's algorithm for alternative (k-shortest) routes |
| `directions.ts` | Leg-by-leg turn-by-turn instructions for a route |
| `shareUtils.ts` | Shareable deep-link URL construction |
| `parseNavigationRequest.ts` | Turns plain language into route settings (Gemini + local fallback, cached 30 min) |
| `navigationUtils.ts` | Node name resolution and alias matching |
| `themeConstants.ts` | Campus graph, nodes, edges, and the color theme |
