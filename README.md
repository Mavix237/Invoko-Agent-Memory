# Invoko — Memory Graph Landing

A scroll-driven landing page prototype: a 3D memory constellation with a central IP character, orbiting planets, and a video tunnel background that scrubs with scroll and drifts slowly when idle.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## How it works

- **Scroll-scrubbed video** — scrolling maps position to video time; when you stop, the tunnel drifts forward slowly.
- **Three.js overlay** — 64 memory nodes with connections, 4 orbiting planets, additive glow particles.
- **Central IP character** — SVG figure with halo and orbital rings, scales/fades as you scroll deeper.
- **Content panels** — fade in as you travel through the scroll journey.

## Assets

Background video: `public/assets/tunnel-bg.mp4` (copied from your Downloads file).

## Build

```bash
npm run build
npm run preview
```
