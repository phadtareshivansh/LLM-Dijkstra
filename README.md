# Dijkstra Navigator

An interactive 3D campus map where you can watch Dijkstra's algorithm build the shortest route, step by step. Type your trip in plain English ("from main gate to the library, skip the cafeteria") and the app plots it for you.

## Features

- Live 3D campus scene built with Three.js — buildings, trees, node hubs, and an animated glowing route
- Step-by-step Dijkstra visualization with a timeline you can skip or replay
- Plain-language routing via the **Ask AI** box — understands informal names like "canteen" or "main entrance", including phrases like "avoid the auditorium"
- Works without an API key: a built-in local parser handles common phrasings; when `VITE_GEMINI_API_KEY` is set, Gemini parses requests too
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

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run typecheck` | Type-check with strict TypeScript |
| `npm test` | Run the unit tests (route engine, node lookup, phrase parsing) |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build locally |

## How it works

1. The **Ask AI** input (or the source/destination pickers) sets the trip.
2. `routingEngine.ts` runs Dijkstra's algorithm over the campus graph in `themeConstants.ts`.
3. The 3D scene animates the route one node at a time, and the timeline tracks the current step.
4. "Skip animation" jumps to the final route; "Replay" restarts it.

## Project layout

| File | Purpose |
| --- | --- |
| `Dashboard.tsx` | The full-screen UI: control panel, timeline, and map controls |
| `RouteScene3D.tsx` | Three.js campus scene with the animated route |
| `routingEngine.ts` | Dijkstra implementation with avoid-node support |
| `parseNavigationRequest.ts` | Turns plain language into route settings (Gemini + local fallback) |
| `navigationUtils.ts` | Node name resolution and alias matching |
| `themeConstants.ts` | Campus graph, nodes, edges, and the color theme |
