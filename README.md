# UAV Telemetry & Observability Platform

A real-time telemetry and observability platform for autonomous systems, built around PX4 SITL and Gazebo simulation.

**Project Purpose:**
- Build robotics infrastructure knowledge
- Demonstrate systems engineering (simulation → backend → frontend pipeline)
- Create resume-grade portfolio piece showing real-time systems, distributed telemetry, observability patterns

## Quick Links

- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** — System design, technology choices, why we made decisions
- **[CHALLENGES.md](docs/CHALLENGES.md)** — Technical challenges encountered, root causes, and lessons learned
- **[project-hand-off.md](docs/project-hand-off.md)** — Original vision & long-term direction

## Tech Stack

- **Backend:** Node.js + TypeScript, MAVLink UDP parsing, WebSocket streaming
- **Frontend:** React + TypeScript, real-time telemetry visualization
- **Infrastructure:** Docker, Docker Compose
- **Shared:** TypeScript types for type safety across services

## Structure

```
apps/          → backend, frontend, px4-sitl services
packages/      → shared code (types)
docs/          → architecture & design decisions
```

## Development

```bash
# (Setup steps coming)
pnpm install
pnpm -r dev              # Run all services in dev mode
docker-compose up        # Start simulation
```

Copy `.env.example` to `.env` for local backend configuration. `.env` is ignored
by git so secrets stay local.

### Geospatial Synthetic Camera

The camera pane uses backend-fetched Mapbox static satellite imagery at the
drone's live GPS coordinates. The app still runs without a token; the camera
pane will show an unavailable state until one is configured.

```bash
# .env
MAPBOX_ACCESS_TOKEN=your_token_here
CAMERA_HZ=2                         # optional, default 2
CAMERA_ENABLED=true                 # optional, default true
MAPBOX_STYLE=satellite-streets-v12  # optional
```

## Roadmap

**Phase 1 (MVP):** Live telemetry dashboard (attitude, altitude, battery, status) ✅
**Phase 1B:** Geospatial synthetic camera ✅
**Phase 2:** Replay from ULog files, estimator vs groundtruth comparison
**Phase 3:** Advanced visualization, real-world camera integration, mission timeline

---

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for design decisions and learning context.
