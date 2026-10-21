# Fishora — Aquarium Scene v1

A visual prototype: one semi-realistic planted aquarium on a wooden cabinet in a cozy room. No fish or gameplay yet. See [FISHORA_PROJECT.md](FISHORA_PROJECT.md) and [docs/](docs/) for the wider plan.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm run start   # production
npm run typecheck
```

## Structure

- `components/FishoraStage.tsx`: page shell with WebGL detection, error fallback, loader and wordmark.
- `components/scene/`: R3F scene. `AquariumScene` (canvas), `CameraRig` (fixed, aspect-fitted camera), `Lighting` (warm room light + cool LED spot + procedural environment map), `Room`, `Cabinet`, `Tank` (glass, silicone, fixture, backdrop), `Aquascape` (substrate, rocks, driftwood, moss, plants), `WaterSurface`, `SuspendedParticles`, `WaterClock`.
- `lib/aquascape.ts`: deterministic procedural geometry and instance layouts.
- `lib/underwater.ts`: shader patches for caustics, depth absorption, plant sway and glass alpha.
- `lib/textures.ts`: canvas-generated textures (wood, planks, plaster, sand, rug, art, backdrop).

## Assets

Everything is procedural or generated at runtime. There are no external models, textures, fonts or remote URLs.
