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

## Next Steps

1. ✅ Architecture & decisions locked (this document)
2. Initialize monorepo structure & root configuration
3. Set up `packages/types` with core telemetry interfaces
4. Build backend: UDP listener → MAVLink parser → WebSocket broadcaster
5. Build frontend: WebSocket client → dashboard components
6. Create docker-compose.yml orchestrating all services
7. Test end-to-end: PX4 SITL → backend → frontend
