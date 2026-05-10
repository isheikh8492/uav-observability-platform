# UAV Observability Platform — Architecture & Design Decisions

## Project Goals

**Primary:** Build a real-time telemetry & observability platform for UAV autonomy systems.

**Resume Signal:** Demonstrate robotics infrastructure knowledge (not just a dashboard).

**Learning Goal:** Understand real-time streaming systems, state estimation visualization, and autonomous systems architecture while building.

---

## Repository Structure (Monorepo - Option B)

```
uav-observability-platform/
├── apps/                          # Deployed services
│   ├── backend/                   # Node.js telemetry ingestion & streaming
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── mavlink/          # MAVLink UDP parsing
│   │   │   ├── websocket/        # WebSocket broadcasting
│   │   │   ├── telemetry/        # Telemetry normalization & types
│   │   │   └── config/
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── frontend/                  # React real-time dashboard
│   │   ├── src/
│   │   │   ├── components/       # UI components (attitude, altitude, etc.)
│   │   │   ├── hooks/            # Custom React hooks (useWebSocket, etc.)
│   │   │   ├── stores/           # Zustand state (connection, warnings)
│   │   │   ├── types/
│   │   │   └── App.tsx
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── px4-sitl/                  # PX4 SITL simulation container
│       ├── Dockerfile            # PX4 + Gazebo setup
│       ├── entrypoint.sh
│       └── config/
│
├── packages/                      # Shared code (imported by apps)
│   └── types/                     # Shared TypeScript interfaces
│       ├── src/
│       │   ├── telemetry.ts      # MAVLink → normalized telemetry types
│       │   ├── mavlink.ts        # MAVLink message types
│       │   └── index.ts
│       └── package.json
│
├── docker-compose.yml             # Local development orchestration
├── package.json                   # Root workspace config
├── pnpm-workspace.yaml           # Workspace definition (or use package.json workspaces)
├── .gitignore
├── README.md
└── docs/
    ├── project-hand-off.md       # Original vision & concepts
    ├── ARCHITECTURE.md           # This file
    └── DEVELOPMENT.md            # (to be created) Development setup & patterns
```

**Why Option B:**
- Professional monorepo pattern used by real companies
- Clear separation: `apps/` = services, `packages/` = shared code
- Scales well if we add tools, pipelines, or data processing later
- Type safety: shared types prevent runtime bugs in streaming

---

## Core Architecture

### System Flow

```
PX4 SITL (Docker)
    ↓ MAVLink UDP (port 14550)
    ↓
Backend Service (Node.js)
    ├─ UDP Listener (receives MAVLink)
    ├─ Parser (converts to typed objects)
    ├─ Normalizer (standardizes telemetry)
    └─ WebSocket Broadcaster (sends to frontend)
    ↓ WebSocket (port 8080)
    ↓
Frontend (React)
    ├─ WebSocket client (receives telemetry stream)
    ├─ Zustand store (app state only, not high-freq data)
    └─ Visualization components (attitude, altitude, charts)
```

### Service Responsibilities

#### **Backend (`apps/backend/`)**
- Listen for MAVLink UDP from PX4 SITL
- Parse MAVLink binary messages
- Normalize to TypeScript interfaces (from `@uav/types`)
- Broadcast via WebSocket at appropriate rates
- Handle disconnection/reconnection
- Future: logging, replay, analysis

**Why Node.js:**
- Async I/O (perfect for streaming)
- TypeScript support (type safety)
- WebSocket libraries mature and performant
- Full-stack JavaScript (team familiar)

#### **Frontend (`apps/frontend/`)**
- Real-time WebSocket client
- Display live telemetry (attitude, altitude, speed, state)
- Warnings & alerts
- State management (connection, mode, battery)
- Future: replay timeline, map, estimator visualization

**Why React:**
- Application orchestration layer
- Component-based UI
- Ecosystem mature

#### **Shared Types (`packages/types/`)**
- Single source of truth for data interfaces
- Backend ensures it sends valid shapes
- Frontend consumes with type safety
- Examples:
  ```typescript
  export interface VehicleAttitude {
    roll: number;      // radians
    pitch: number;
    yaw: number;
    timestamp: number; // milliseconds
  }
  
  export interface TelemetryMessage {
    attitude?: VehicleAttitude;
    position?: VehiclePosition;
    battery?: BatteryStatus;
  }
  ```

---

## State Management Strategy (Real-Time Focus)

### Problem
Telemetry streams at high frequency (50+ Hz). React re-renders are expensive and unnecessary.

### Solution: Two-Layer Pattern

**Layer 1: App State (React + Zustand)**
- Connection status (connected/disconnected)
- Flight mode (armed/disarmed, mode changes)
- Warnings & alerts
- UI state (panels open, settings)
- Re-renders when this changes

**Layer 2: Data Stream (Refs, not React state)**
- Live attitude, position, altitude
- Motor outputs, sensor readings
- Updated at native stream rate (50 Hz)
- **Not** stored in React state
- Components read latest via `useRef` or direct callback
- Visualization engines (Three.js, D3) consume directly

**Example:**
```typescript
// Store (Zustand) - triggers re-render
const useFlightStore = create((set) => ({
  isArmed: false,
  mode: 'MANUAL',
  updateMode: (newMode) => set({ mode: newMode })
}));

// Data stream (React ref) - does NOT trigger re-render
const latestTelemetry = useRef<TelemetryMessage>(null);

// WebSocket listener updates both
ws.on('message', (data) => {
  latestTelemetry.current = data;  // Update ref instantly
  if (data.vehicle_status?.armed !== store.isArmed) {
    store.updateMode(data.vehicle_status.mode); // Update store only on changes
  }
});
```

**Why this matters:**
- Real-time systems don't wait for React's render cycle
- Visualization stays responsive at native frame rate
- State changes still trigger UI updates (connection, warnings)
- Common pattern in flight simulators, trading dashboards, scientific visualization

---

## Docker Compose Networking

### Service Names as Hostnames
Inside Docker Compose, services reach each other by name:

```yaml
services:
  px4-sitl:
    ports:
      - "14550:14550/udp"    # MAVLink output
  
  backend:
    # Can reach PX4 at px4-sitl:14550 (via Docker network)
    # Exposes WebSocket on 8080
    ports:
      - "8080:8080"
  
  frontend:
    # Can reach backend at http://backend:8080
    # Exposes on 3000 for browser
    ports:
      - "3000:3000"
```

### Development Workflow
```
Local machine:
  - Browser: http://localhost:3000 → frontend
  - Backend logs: docker logs uav-backend
  - All services: docker-compose up
```

---

## Technology Stack (Final)

### Backend
- **Runtime:** Node.js 20+ (LTS)
- **Language:** TypeScript
- **MAVLink:** node-mavlink or custom UDP parser
- **WebSocket:** ws or socket.io (ws for simplicity)
- **Server:** Express or Fastify

### Frontend
- **Framework:** React 18+
- **Language:** TypeScript
- **State:** Zustand (lightweight, perfect for streams)
- **Build:** Vite (faster than CRA)
- **Visualization:** Three.js (attitude sphere), D3 or Recharts (telemetry charts)
- **Styling:** Tailwind CSS

### Shared
- **TypeScript:** Strict mode, shared interfaces

### Infrastructure
- **Containerization:** Docker
- **Orchestration:** Docker Compose
- **Development:** pnpm workspaces (fast monorepo support)

---

## MVP Scope (Phase 1)

**Deliverable:** Live telemetry streaming from PX4 SITL to browser dashboard.

**Includes:**
- Docker Compose orchestrating px4-sitl + backend + frontend
- Backend ingesting MAVLink UDP, broadcasting via WebSocket
- Frontend displaying:
  - Vehicle status (armed/disarmed)
  - Attitude (roll/pitch/yaw)
  - Altitude
  - Speed
  - Battery
  - Connection status
  - Simple event stream

**Excludes:**
- Replay/timeline
- Estimator vs groundtruth
- Map/geospatial
- Camera feeds
- Advanced analysis

---

## Development Patterns

### Shared Types Workflow
1. Define a telemetry type in `packages/types/src/telemetry.ts`
2. Backend imports it, ensures parsed MAVLink matches
3. Frontend imports it, consumes WebSocket messages with confidence
4. TypeScript catches mismatches at compile time

### Adding a New Telemetry Value
```
1. Define type in packages/types
2. Backend: Parse from MAVLink, add to TelemetryMessage
3. Frontend: Import type, render in component
4. Run tsc --noEmit to validate across packages
```

### Local Development
```bash
pnpm install              # Install all workspaces
pnpm -r dev              # Run dev servers in all apps
docker-compose up        # Start simulation + services
```

---

## Learning Moments (Why This Architecture)

**Real-Time Streaming:**
This architecture demonstrates core concepts you'll see in real robotics/aerospace companies:
- Async I/O (backend waiting for network packets)
- Protocol handling (MAVLink is the "telemetry bus")
- Data normalization (raw MAVLink → typed objects)
- Streaming patterns (WebSocket broadcast)
- High-frequency visualization (updating without re-renders)

**Systems Design:**
- Service separation (simulation, backend, UI)
- Docker isolation (reproducible environments)
- Type safety in distributed systems (prevents data corruption)

**Robotics Concepts:**
- Telemetry topics (attitude, position, battery, state)
- Estimation vs groundtruth (future: visualization)
- Heartbeat/watchdog (connection health)
- Command/control cycle (future phases)

---

## Camera Feed Strategy

The platform's "camera feed" pane is implemented via a **Geospatial Synthetic Camera** — not a mock video, not a Gazebo render, but real-world satellite imagery composed in real time from the simulated drone's GPS coordinates.

### Architecture

```
PX4 SITL (Docker)
    └─ MAVLink GPS coords (lat/lon/alt/heading)
        ↓
Backend (Docker)
    └─ Geospatial Camera Service
        ├─ Fetches Mapbox Static API tile at current coords
        ├─ Maps drone altitude → tile zoom level
        ├─ Maps drone yaw → tile bearing rotation
        └─ Streams composed image to frontend
            ↓
Frontend
    └─ Camera pane displays satellite view
       (scrolls/rotates with drone motion)
```

### Why This Approach (vs. Alternatives)

| Approach | Hardware-friendly | Telemetry-correlated | Realistic | Decision |
|----------|------------------|---------------------|-----------|----------|
| Mock MP4 loop | ✅ | ❌ | ❌ | Rejected — visibly fake |
| Gazebo + camera plugin | ❌ (no GPU passthrough) | ✅ | ✅ | Deferred to Phase 3 (requires WSL2 setup) |
| Three.js synthetic POV | ✅ | ✅ | ❌ | Rejected — turns the platform into a flight simulator |
| **Geospatial synthetic camera** | ✅ | ✅ | ✅ (real satellite imagery) | **Selected** |

### Trade-offs (Acknowledged)

**What this provides:**
- Real satellite imagery of the drone's simulated location
- Responds to actual drone motion (lat/lon changes scroll the view, altitude changes zoom, heading changes rotation)
- Matches the imagery pipeline used by real aerial-mapping drones (orthomosaic stitching, photogrammetry)
- Works on constrained hardware

**What this is NOT:**
- A first-person forward-facing perspective (it's downward-looking aerial imagery)
- A 3D-rendered scene with occlusion or live objects
- A simulation of camera optics (no lens distortion, motion blur, realistic FOV)

**Who this is suitable for:**
- Aerial mapping / surveying / inspection use cases (the target domain)
- Search & rescue scenarios with GPS-tagged imagery
- Mission control overlays where map context matters more than first-person feel

**Who this is NOT suitable for:**
- Computer vision research requiring realistic camera optics
- First-person operator training (where forward POV is essential)

### Implementation Notes

- **Tile provider:** Mapbox Static Images API (free tier: 50,000 requests/month — plenty for dev)
- **Update rate:** ~5-10 Hz (Mapbox tiles aren't designed for 30+ FPS streaming, and aerial coverage doesn't change that fast anyway)
- **Caching:** Tiles for visited coordinates cached in backend (saves API quota)
- **Altitude → zoom mapping:** logarithmic — `zoom = max(14, 21 - log2(altitude + 1))`
- **Heading → bearing:** straight pass-through from MAVLink yaw
- **Replaceable architecture:** `VideoSource` interface in backend — `GeospatialVideoSource` implementation now, easily swapped for `GazeboRtspSource` or `RealRtspSource` later

### Strategic Framing

> "The camera pane uses a geospatial synthetic camera — the system fetches real satellite imagery at the drone's current GPS coordinates and composes a downward-facing aerial view that scrolls and rotates with the drone's motion. This mirrors the pipeline used by aerial mapping drones. The video source is abstracted via an interface; swapping in a real RTSP feed from Gazebo or hardware is a configuration change."

This framing demonstrates: domain knowledge (aerial mapping), architectural thinking (interface design), pragmatism (working within hardware constraints), and honesty (no fake mocks).

---

## Observability Principle

**The backend IS the observability layer. PX4's stdout is intentionally discarded.**

In real autonomous systems:
- Autopilots produce **raw telemetry** (binary streams over MAVLink/CAN/etc.) — not human-readable logs
- Ground systems **parse, structure, store, and visualize** that telemetry
- Operators consume **structured data** (mission state, vehicle attitude, alerts), not console output

We mirror this architecture deliberately:
- The PX4 SITL container has Docker logging **disabled** (`driver: none`)
- All observability flows through our pipeline: MAVLink → backend parser → normalized telemetry → WebSocket → frontend
- PX4's text stdout is the equivalent of a chip's UART debug console — useful for the embedded engineer, irrelevant to the mission operator

**Implication for development:** When debugging PX4 itself (rare), temporarily re-enable Docker logging or attach to the `pxh>` shell via `docker exec -it px4-sitl bash`. For everything else, your own backend is the source of truth.

---

## Implementation Progress

### Phase 0: Simulation Foundation ✅
- [x] PX4 SITL containerized (Ubuntu 24.04, Python venv, headless build)
- [x] SIH airframe configured (`SYS_AUTOSTART=10040` quadcopter X)
- [x] MAVLink network broadcast enabled (`MAV_0_BROADCAST=1`)
- [x] Docker logging disabled (observability via app, not stdout)
- [x] Resource limits set (1GB memory cap, restart policy)
- [x] Telemetry validated end-to-end with QGroundControl

### Phase 1: MVP Backend & Frontend (Next)
- [ ] Initialize monorepo structure & root configuration
- [ ] Set up `packages/types` with core telemetry interfaces
- [ ] Build backend: UDP listener → MAVLink parser → WebSocket broadcaster
- [ ] Build frontend: WebSocket client → dashboard components
  - [ ] Map pane (Mapbox 2D with drone marker, flight path)
  - [ ] Telemetry HUD (speed, altitude, battery, mode, GPS lock)
  - [ ] Mini attitude indicator widget (Three.js gauge)
  - [ ] Connection status indicators
- [ ] Test end-to-end: PX4 SITL → backend → frontend

### Phase 1B: Geospatial Synthetic Camera
- [ ] Mapbox account + Static Images API integration
- [ ] Backend: GeospatialVideoSource service
  - [ ] Fetch tile at current GPS coords
  - [ ] Altitude → zoom mapping
  - [ ] Heading → bearing rotation
  - [ ] In-memory tile cache (dedupe API calls)
- [ ] Frontend: Camera pane component
  - [ ] HUD overlays (speed, altitude, heading, LIVE indicator)
- [ ] Define `VideoSource` interface (replaceable for Phase 3)

### Phase 2: Replay & Analysis
- [ ] Read ULog files from PX4
- [ ] Timeline scrubbing UI
- [ ] Estimator vs groundtruth visualization
- [ ] Mission event timeline

### Phase 3: Real-World Camera Integration (Deferred)
- [ ] WSL2 setup (when disk space + time allow)
- [ ] PX4 + Gazebo Harmonic native install
- [ ] Camera plugin attached to drone model
- [ ] RTSP bridge (Gazebo → host network)
- [ ] Implement `GazeboRtspSource` (drop-in replacement for GeospatialVideoSource)
- [ ] (Future) Real hardware drone: `RealRtspSource`

### Phase 4: Polish (Future)
- [ ] Mission planning interface (waypoint editing)
- [ ] Multi-drone fleet view
- [ ] CesiumJS 3D Earth (optional upgrade from Mapbox 2D)
- [ ] Alert/warning system with acknowledgments
