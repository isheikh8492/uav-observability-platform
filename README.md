# UAV Telemetry & Observability Platform

A real-time telemetry and observability platform for autonomous systems, built around PX4 SITL and Gazebo simulation.

**Project Purpose:**
- Build robotics infrastructure knowledge
- Demonstrate systems engineering (simulation → backend → frontend pipeline)
- Create resume-grade portfolio piece showing real-time systems, distributed telemetry, observability patterns

## Quick Links

- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** — System design, technology choices, why we made decisions
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

## Roadmap

**Phase 1 (MVP):** Live telemetry dashboard (attitude, altitude, battery, status)
**Phase 2:** Replay from ULog files, estimator vs groundtruth comparison
**Phase 3:** Advanced visualization, camera integration, mission timeline

---

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for design decisions and learning context.
