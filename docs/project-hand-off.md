# UAV Telemetry & Observability Platform — Project Handoff

## Project Vision

Build a modern UAV telemetry and observability platform around PX4 SITL and Gazebo simulation.

The long-term goal is NOT merely:

- a toy drone simulator
- a CRUD full-stack application
- a generic telemetry dashboard

The intended direction is:

```text
Simulation
    ↓
Telemetry Transport
    ↓
Streaming Backend
    ↓
Real-Time Observability Platform
    ↓
Replay / Analysis / Control
```

The project should eventually resemble:

- aerospace telemetry systems
- robotics observability tooling
- mission-control dashboards
- UAV operational tooling
- autonomous system telemetry infrastructure

---

# Core Stack Direction

## Simulation Stack

### PX4

Role:

- autopilot firmware
- flight controller logic
- estimator/control loops
- MAVLink communication
- logging/telemetry generation

What PX4 provides:

- realistic autopilot behavior
- IMU simulation
- GPS simulation
- actuator simulation
- telemetry topics
- state estimation
- command/control layer
- MAVLink networking

---

### Gazebo Harmonic

Role:

- 3D simulation environment
- physics engine
- drone world visualization
- simulated sensors
- camera support later

Provides:

- drone model visualization
- movement simulation
- world environment
- future camera feed support
- future LiDAR/depth support

---

### MAVLink

Role:

- telemetry/control protocol

Provides:

- telemetry transport
- UAV command/control
- standardized communication layer

Important realization:
MAVLink is effectively:

```text
Drone telemetry bus
```

---

# Intended System Architecture

## Long-Term Architecture

```text
PX4 SITL + Gazebo
        ↓
MAVLink UDP Stream
        ↓
Telemetry Ingestion Backend
        ↓
WebSocket Layer
        ↓
React/WebGL Frontend
```

---

## Recommended Backend Direction

### Initial Recommendation

Node.js + TypeScript backend.

Responsibilities:

- MAVLink ingestion
- telemetry parsing
- WebSocket broadcasting
- event aggregation
- telemetry normalization
- replay support later

Potential libraries:

- node-mavlink
- custom UDP ingestion
- ws/socket.io

---

## Frontend Direction

### React

Use React primarily as:

```text
Application shell / orchestration layer
```

NOT as the rendering engine itself.

---

### WebGL Rendering Layer

Potential rendering stack:

- Three.js
- deck.gl
- custom WebGL
- D3 for charts
- high-frequency telemetry visualizations

The frontend should eventually support:

- live telemetry
- synchronized charts
- replay timeline
- map overlays
- state transitions
- event streams
- mission visualization
- estimator vs groundtruth comparisons
- camera feeds later

---

# Why This Project Is Valuable

This project demonstrates:

- systems engineering
- distributed telemetry
- real-time networking
- simulation infrastructure
- streaming architectures
- observability tooling
- robotics software concepts
- protocol integration
- asynchronous telemetry pipelines
- frontend visualization at scale

This is significantly more differentiated than:

- generic CRUD apps
- ordinary dashboards
- generic ML demos

---

# Environment & Tooling Decisions

## Initial Attempt: WSL + Native PX4

The project initially used:

```text
Windows
    ↓
WSL2 Ubuntu
    ↓
PX4 + Gazebo
```

This worked successfully for:

- PX4 SITL
- Gazebo simulation
- MAVLink streaming
- telemetry logging
- telemetry export

However:

- QGroundControl networking became problematic under WSL
- UDP communication between WSL and Windows was unreliable/friction-heavy
- environment complexity became distracting

---

# Final Direction: Docker-Based Infrastructure

## Why Docker

Docker gives:

- reproducibility
- cleaner environment boundaries
- easier onboarding
- simpler documentation
- future deployment flexibility
- more professional project structure

Docker does NOT magically solve:

- GUI complexity
- Gazebo rendering issues
- all networking problems

But it greatly improves:

- environment consistency
- project portability
- dependency management

---

# Recommended Docker Architecture

## Phase 1

Start simple:

```text
Docker PX4 SITL (headless)
        ↓
MAVLink UDP
        ↓
QGroundControl or custom backend
```

---

## Phase 2

```text
Docker Compose
    ├── px4-sitl
    ├── telemetry-backend
    └── web-dashboard
```

---

## Phase 3

```text
Docker Compose
    ├── px4-sitl-gazebo
    ├── telemetry-backend
    ├── websocket-gateway
    ├── replay-service
    └── web-dashboard
```

---

# PX4 Setup Journey (Already Completed)

## WSL Installation

WSL2 + Ubuntu successfully installed.

---

## PX4 Clone

```bash
git clone https://github.com/PX4/PX4-Autopilot.git --recursive
```

---

## Important Python Fix

PX4 setup initially failed because Linuxbrew Python 3.14 was active.

Issue:

- PX4 tooling was incompatible with Linuxbrew Python pathing/toolchain.

Fix:

```bash
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
```

Verified:

```bash
which python3
/usr/bin/python3
```

---

## PX4 Dependency Installation

```bash
bash Tools/setup/ubuntu.sh
```

---

## Successful PX4 SITL Launch

Initial headless launch:

```bash
make px4_sitl none
```

Then Gazebo launch:

```bash
make px4_sitl gz_x500
```

---

# Important Lessons Learned

## PX4 Shell vs Linux Shell

The `pxh>` prompt is:

```text
PX4 internal shell
```

NOT a Linux shell.

Commands like:

- cat
- make
- ls

DO NOT work there.

Only PX4 commands work.

Examples:

- mavlink status
- logger stop
- commander arm
- shutdown

---

# Gazebo / PX4 Warnings

Observed warnings:

```text
Preflight Fail: No connection to the GCS
Preflight Fail: ekf2 missing data
```

These were NOT fatal.

They primarily indicated:

- no active ground station connection
- estimator waiting for valid state data

---

# Telemetry Logging Discovery

PX4 generated `.ulg` files.

This became a major realization point.

The logs contain:

- vehicle attitude
- local position
- global position
- actuator outputs
- estimator state
- IMU streams
- gyro data
- accelerometer data
- control setpoints
- telemetry metadata
- system states

This effectively acts like:

```text
Aircraft black box recorder
```

---

# Important Telemetry Topics Discovered

## High Value Topics

### vehicle_attitude

- roll
- pitch
- yaw

### vehicle_local_position

- local XYZ motion

### vehicle_global_position

- GPS

### battery_status

- battery telemetry

### vehicle_status

- UAV state

### actuator_outputs

- motor outputs

### sensor_gyro

- gyro data

### sensor_accel

- accelerometer data

### vehicle_rates_setpoint

- desired angular rates

### trajectory_setpoint

- autopilot target trajectory

---

# Groundtruth Discovery

PX4 exposes:

```text
vehicle_attitude_groundtruth
vehicle_local_position_groundtruth
```

This is extremely important.

It enables:

- estimator vs reality comparison
- error visualization
- drift analysis
- telemetry quality analysis

This dramatically increases project sophistication.

---

# ULog Exporting

Installed tools:

- ulog_info
- ulog2csv

Export process:

```bash
ulog2csv <logfile>
```

Generated:

- many CSV telemetry streams
- timestamped sensor data
- replay-capable telemetry datasets

This enables:

- replay systems
- synchronized timelines
- historical analysis
- anomaly detection

---

# QGroundControl Attempt

## Goal

Use a GUI GCS to:

- arm drone
- takeoff
- move UAV
- observe telemetry visually
- acclimate to UAV workflows

---

## Problem Encountered

WSL ↔ Windows UDP routing caused issues.

Symptoms:

- MAVLink packets existed
- tcpdump confirmed packet flow
- QGroundControl still showed disconnected state

Despite:

- manual MAVLink routing
- UDP links
- MAV_0_BROADCAST changes
- firewall investigation

---

# Important Networking Discovery

This command proved packets existed:

```bash
sudo tcpdump -i any udp port 14550
```

This confirmed:

```text
PX4 → MAVLink UDP stream exists
```

Thus the problem was:

- QGroundControl
- WSL networking
- firewall/session behavior

NOT PX4 itself.

---

# Important Architectural Realization

At this point the project transitioned from:

```text
"Drone simulator"
```

to:

```text
Telemetry observability platform for autonomous systems
```

This framing is much stronger.

---

# Current Recommended Direction

## Skip Heavy QGroundControl Dependency

QGC was intended only as:

- sanity check
- environment acclimation
- optional operations GUI

The actual value is in:

```text
custom telemetry infrastructure
```

---

# Immediate Next Steps

## Phase 1 MVP

Build:

```text
Live Telemetry Dashboard
```

Features:

- live attitude indicator
- altitude
- speed
- UAV state
- battery status
- telemetry stream
- map position later
- event timeline

---

# Suggested Backend Flow

## MAVLink Ingestion

```text
UDP Listener
    ↓
MAVLink Parser
    ↓
Normalized Telemetry Objects
    ↓
WebSocket Broadcast
```

---

# Suggested Frontend MVP

## Panels

### UAV Status Panel

- armed/disarmed
- flight mode
- GPS lock
- battery

### Attitude Visualization

- roll/pitch/yaw

### Telemetry Charts

- altitude
- velocity
- motor outputs

### Event Stream

- mode changes
- warnings
- state transitions

---

# Long-Term Ideas

## Replay Mode

Use exported CSV/ULog telemetry.

Features:

- timeline scrubbing
- synchronized playback
- historical analysis

---

## Estimator Error Visualization

Compare:

- estimated state
- groundtruth state

Visualize:

- drift
- estimation error
- divergence

---

## Camera Integration

Later add:

- simulated camera feed
- WebRTC/WebSocket video streaming
- object overlays

---

## Mission Timeline

Visualize:

- mission stages
- command events
- UAV state transitions
- control setpoints

---

# Why This Project Has Strong Resume Signal

Demonstrates:

- robotics infrastructure
- telemetry systems
- distributed networking
- real-time systems
- frontend visualization
- simulation tooling
- systems engineering
- protocol integration
- asynchronous data pipelines
- observability engineering

This is especially strong because:

- it is rooted in real UAV tooling
- uses industry-known technologies
- uses realistic telemetry flows
- resembles real engineering infrastructure

---

# Technologies Involved

## Core

- PX4
- Gazebo Harmonic
- MAVLink
- Docker
- Docker Compose

## Backend

- Node.js
- TypeScript
- WebSockets
- UDP networking

## Frontend

- React
- Three.js
- WebGL
- D3.js potentially

## Telemetry / Parsing

- MAVSDK
- node-mavlink
- custom parsers

---

# Final Strategic Direction

The project should evolve into:

```text
UAV Telemetry & Observability Platform
```

NOT:

```text
"drone dashboard"
```

The important distinction:

- telemetry infrastructure
- replay systems
- observability
- state introspection
- distributed telemetry
- mission analysis
- control visualization

This framing substantially increases project sophistication and resume value.
