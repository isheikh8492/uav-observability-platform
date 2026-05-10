# Challenges & Lessons Learned

A running log of technical challenges encountered while building the UAV Observability Platform, the root causes, how they were resolved, and what the takeaways were.

> **Why document this:** These are the "war stories" that turn a portfolio project into a demonstration of real engineering judgment. They're also useful for anyone (future me, hiring managers, contributors) to understand why decisions were made.

---

## Phase 0: Simulation Foundation

### Challenge 1: WSL2 ↔ Windows UDP Networking (Original Setup)

**Context:** Initial setup attempted PX4 SITL natively in WSL2 Ubuntu, with QGroundControl on Windows host.

**Symptom:**
- PX4 SITL ran successfully
- `tcpdump -i any udp port 14550` confirmed MAVLink UDP packets existed
- QGroundControl on Windows showed "disconnected"
- Manual MAVLink routing, MAV_0_BROADCAST changes, firewall checks didn't help

**Root cause:** WSL2's NAT networking model means UDP packets between Linux and Windows traverse a virtual network adapter. Some packets reach the destination but the bidirectional handshake required for MAVLink connection registration is unreliable.

**Resolution:** Pivoted from WSL native to Docker-only architecture. Docker port mapping handles UDP cleanly because the Docker daemon manages the network bridge explicitly.

**Lesson:** WSL2 is great for development but has limitations for low-level networking protocols. When in doubt, isolate via Docker.

---

### Challenge 2: PX4 Setup Script Fails in Minimal Docker Image

**Symptom:**
```
./Tools/setup/ubuntu.sh: line 76: lsb_release: command not found
```

**Root cause:** Minimal `ubuntu:24.04` Docker base image strips out `lsb_release` (a tool that identifies the distribution version). PX4's setup script depends on it to detect Ubuntu version and install correct packages.

**Resolution:** Added `lsb-release`, `gnupg`, and `ca-certificates` to the apt-get install list in the Dockerfile.

**Lesson:** Minimal Docker base images are intentionally stripped down. Scripts that work on a full desktop install often need additional system utilities to be added explicitly.

---

### Challenge 3: PEP 668 Lockdown in Ubuntu 24.04

**Symptom:** PX4's setup script tried to `pip install` system-wide and failed because Ubuntu 24.04 enforces PEP 668 ("externally-managed-environment").

**Root cause:** Ubuntu 24.04 marks the system Python as externally managed (i.e., managed by `apt`), preventing `pip install` to system locations to avoid conflicts.

**Options considered:**
- `--break-system-packages` flag (hacky, bypasses safety)
- Python virtual environment (clean, professional)

**Resolution:** Added a Python virtual environment to the Dockerfile:
```dockerfile
ENV VIRTUAL_ENV=/opt/px4-venv
ENV PATH="$VIRTUAL_ENV/bin:$PATH"
RUN python3 -m venv $VIRTUAL_ENV
```

This isolates PX4's Python dependencies from the system Python.

**Lesson:** The "right" way to handle Python dependencies in containers is virtual environments — same as deploying real Python apps. Workarounds compound technical debt.

---

### Challenge 4: PX4 Build Target Auto-Launches the Binary

**Symptom:** Docker build appeared "stuck" at the build step, showing PX4 startup messages and warnings.

**Root cause:** `make px4_sitl none` is actually two operations: compile the firmware **and then run it**. Inside a Docker build context, this means the build never completes — the binary keeps running waiting for input.

**Resolution:** Changed Dockerfile to `make px4_sitl_default` which is **build-only**. The `_default` suffix indicates "compile but don't auto-launch."

**Lesson:** PX4 has multiple build targets with similar names but different behaviors:
- `px4_sitl_default` → compile only
- `px4_sitl none` → compile + run with no simulator
- `px4_sitl gz_x500` → compile + run with Gazebo
For containers: always use the `_default` form so the binary doesn't auto-execute during image build.

---

### Challenge 5: PX4 Init Script Path Confusion

**Symptom:** `sed: can't read /px4/build/px4_sitl_default/etc/init.d-posix/px4-rc.logging: No such file or directory`

**Root cause:** Made wrong assumptions about file locations. PX4 has TWO init script directories with subtly different naming conventions:
- `etc/init.d/` — common scripts shared between real flight controllers and SITL (e.g., `rc.logging`)
- `etc/init.d-posix/` — POSIX-specific scripts only for SITL (e.g., `px4-rc.mavlink`)

The `px4-` prefix in `init.d-posix/` distinguishes POSIX-specific scripts.

**Resolution:** Used `find` dynamically to locate scripts rather than hardcoding paths.

**Lesson:** This separation reflects good design — the same firmware code works on real hardware and in simulation, with platform-specific init scripts isolated by directory.

---

### Challenge 6: SYS_AUTOSTART Vehicle ID Wrong

**Symptom:**
```
Error: no autostart file found (/px4/build/px4_sitl_default/rootfs/etc/init.d-posix/airframes/1001_*)
```

**Root cause:** Assumed `SYS_AUTOSTART=1001` was the SIH quadcopter ID based on PX4 documentation, but the actual airframe ID for the headless SIH quadcopter is `10040`.

**Resolution:** Inspected `/px4/build/px4_sitl_default/etc/init.d-posix/airframes/` and identified the correct ID:
- `10040` = SIH quadcopter X (what we want — headless)
- `4001` = Gazebo X500 quadcopter (would require Gazebo)
- `1001` = doesn't exist in this build

**Lesson:** Don't assume parameter values from external documentation. Inspect what's actually in your build.

---

### Challenge 7: MAVLink "Only on localhost" Warning

**Symptom:**
```
INFO [mavlink] MAVLink only on localhost (set param MAV_{i}_BROADCAST = 1 to enable network)
```

**Initial fear:** Telemetry would be inaccessible from outside the container.

**Reality:** PX4 listens on UDP port 18570 for incoming GCS heartbeats. When a heartbeat arrives, PX4 registers the source IP and starts sending telemetry back. Port 14550 is the default *send* port (where PX4 sends to). With Docker port mapping `18570:18570/udp`, QGC on Windows host can send a heartbeat that reaches PX4 — and PX4 will respond back through the same path.

**Resolution:** Configured QGC's UDP comm link with:
- Local listening port: `14550` (where it receives PX4's telemetry)
- Server address: `127.0.0.1:18570` (where it sends heartbeats to PX4)

The connection succeeded immediately. The "only on localhost" warning was misleading — it just meant PX4 won't proactively broadcast to discover GCS, but it will respond to incoming connections.

**Lesson:** PX4 warning messages assume a particular use case. Reading the source/docs reveals the connection lifecycle is actually heartbeat-driven, not broadcast-driven.

---

### Challenge 8: SDLOG_MODE Doesn't Fully Disable Logging

**Symptom:** Set `SDLOG_MODE=-1` to disable PX4 logging. Logger module loaded but didn't write at boot — but the moment QGC armed the vehicle, a 239MB `.ulg` file appeared.

**Root cause:** `SDLOG_MODE` controls boot-time logger behavior. PX4 has a separate **MAVLink command interface** (`MAV_CMD_LOGGING_START`) that QGC sends when arming. This bypasses the boot-time gate and starts logging unconditionally.

**Resolution (deferred):** For Phase 2 replay system, the `.ulg` files are actually valuable data. Decided to keep them for now. Disabled Docker stdout logging instead (which was the actual disk problem).

**Lesson:** PX4's logger is a multi-headed beast. Different code paths trigger it. Disabling completely requires understanding all the paths, not just one parameter.

---

### Challenge 9: Docker CLI Out of Memory After Long Session

**Symptom:**
```
runtime: VirtualAlloc of 8589934592 bytes failed with errno=1455
fatal error: out of memory
```

The Docker Compose CLI itself crashed (not the container). All subsequent Docker commands took forever.

**Root cause:** Container was running attached for 4+ hours, with stdout streaming continuously (PX4 emits info messages constantly). Docker's CLI buffers logs in memory. Buffer grew to 8GB before failing.

**Resolution:**
1. Force-killed the container: `docker kill px4-sitl`
2. Restarted Docker Desktop
3. **Architectural fix:** Changed `docker compose up` to `docker compose up -d` (detached) for all future runs
4. **Hardening:** Configured WSL2 memory cap via `~/.wslconfig`
5. **Decision:** Disabled Docker logging entirely (`logging: driver: none`) — observability lives in our backend, not in stdout buffers

**Lesson:** Long-running containers + attached mode + verbose stdout = guaranteed memory blow-up over time. Always detach. Cap log size or disable. This is a fundamental Docker operational lesson, not a PX4 quirk.

---

## Hardware & Resource Constraints

### Challenge 10: Limited Disk Space (10GB Free)

**Hardware:** HP Pavilion Laptop 15-eh2xxx, 16GB RAM, 467/477 GB used

**Constraints this imposes:**
- Can't easily add Gazebo to PX4 Docker image (~5-8 GB)
- Can't comfortably maintain multiple Docker images
- Docker Desktop's WSL2 VM compounds disk pressure

**Resolution:** Decided to defer Gazebo until disk space is reclaimed (target: 30+ GB free). For now, work with PX4 SITL in headless SIH mode, which is sufficient for the telemetry pipeline.

**Lesson:** Hardware constraints are real. Architecture must respect them. A "perfect" solution that doesn't fit on the available hardware is worse than a pragmatic one.

---

### Challenge 11: No GPU Passthrough in Windows Docker

**Hardware:** AMD Radeon integrated GPU (Ryzen 7 5825U)

**Constraint:** Docker Desktop on Windows runs containers in a Linux VM (WSL2 backend). This VM does not have GPU passthrough — meaning any GUI application running inside Docker must use software rendering (Mesa/llvmpipe).

**Practical impact:**
- Gazebo would render at ~10-15 FPS in software
- High CPU usage (40-80% sustained) on a laptop chip
- Heat, fan noise, throttling

**Alternative paths considered:**
- WSL2 native (not Docker) — has WSLg GPU support
- VcXsrv X server — still software rendering inside container
- Three.js in browser — uses host GPU directly via WebGL

**Resolution:** Architecture relies on browser-side WebGL (Three.js, WebGPU) for any 3D visualization. This sidesteps the Docker GPU limitation entirely.

**Lesson:** When the host has GPU constraints, push rendering to where the GPU is accessible — usually the browser. Don't fight the platform.

---

## Architectural Decisions Driven by Challenges

### Challenge 12: Distinguishing "Observability Platform" from "Flight Simulator"

**Context:** When designing the camera feed, the temptation was to render a synthetic POV view from PX4 telemetry using Three.js — a "what the drone sees" view.

**Realization:** This crosses the line from observability platform to flight simulator/game. Real GCS platforms (Skydio, Auterion, ArduPilot Mission Planner) don't render synthetic POV. They show:
- Top-down map (where the drone IS)
- Real camera feed (what the drone's hardware camera SEES)
- HUD overlays (operational data)

A synthetic POV is **simulating reality**. An observability platform **observes reality**.

**Resolution:** Architecture explicitly excludes synthetic POV rendering. Three.js is allowed only for:
- Mini attitude indicator widgets (gauge, not viewport)
- Replay timeline 3D visualization (data viz, not POV)
- Cesium 3D Earth in the map pane (world map, not vehicle camera)

**Lesson:** Domain understanding matters. Building the "observability" framing correctly is more important than visual flash. Hiring managers in the autonomous systems space recognize this distinction immediately.

---

### Challenge 13: Mock Camera Feed Compromise

**Context:** Initial proposal was to use a looped MP4 file as the camera feed source for development.

**Critique (correct):** A looped video has no relationship to the simulated drone's actual flight path. It's a placeholder, not a system. A reviewer can spot this in seconds.

**Resolution path:**
- **Real solution:** Run Gazebo in WSL2 (with native GPU access via WSLg) once disk space is freed. Gazebo's camera plugin produces a synthetic feed driven by the simulated drone's actual position, attitude, and motion.
- **Interesting alternative:** Geospatial synthetic camera — fetch satellite tiles from Mapbox at the drone's GPS coordinates and composite a "downward camera view" that scrolls as the drone moves. Telemetry-correlated, no GPU needed, technically novel.

**Decision:** Mock MP4 explicitly rejected. Pursuing real Gazebo camera (post-disk-cleanup) as Phase 1B.

**Lesson:** Don't accept compromises that don't survive scrutiny. Especially in portfolio work — every shortcut becomes a question in an interview.

---

## Operational Discoveries

### Discovery: PX4 Internal Architecture

Through debugging, learned the PX4 init system intimately:

| Layer | What it is |
|-------|-----------|
| `etc/init.d/rcS` | Master init script (cross-platform) |
| `etc/init.d-posix/rcS` | POSIX-specific init (only used in SITL) |
| `etc/init.d/rc.logging` | Logger module setup |
| `etc/init.d-posix/px4-rc.mavlink` | MAVLink module setup |
| `etc/init.d/airframes/<id>_<name>` | Per-vehicle config files |

This dual init system reflects PX4's design: same firmware code paths run on real flight controllers and in simulation, with platform-specific scripts isolated by directory.

### Discovery: SIH vs Gazebo

| Simulator | Visualization | Dependencies | When to use |
|-----------|--------------|--------------|-------------|
| SIH (Simulator-In-Hardware) | None — pure math | Built into PX4, zero overhead | Telemetry pipeline development |
| Gazebo Harmonic | Full 3D world + sensors | ~5GB install, GPU rendering | Visual + sensor fidelity needed |

For an observability platform, SIH is sufficient for telemetry validation. Gazebo's value-add is the simulated camera and sensor data.

### Discovery: PX4 Connection Model

PX4 uses a **heartbeat-driven** connection model:
1. PX4 listens on UDP 18570 for incoming heartbeats
2. GCS sends a heartbeat to that port from any source port
3. PX4 registers the source IP and starts streaming telemetry back
4. No proactive broadcasting required (despite warning messages suggesting otherwise)

This means **port mapping in Docker just works** — no special networking configuration needed.

---

## Summary of Patterns Learned

1. **Minimal Docker images need explicit dependencies** — don't assume desktop tools exist
2. **PEP 668 in modern Linux requires venvs** — don't bypass with `--break-system-packages`
3. **PX4 build targets matter** — use `_default` for compile-only in containers
4. **Find files dynamically** in containers when scripting against unknown filesystem layouts
5. **Inspect, don't assume** — verify config IDs, parameter values, file paths
6. **Read warnings carefully** — sometimes they describe a non-issue
7. **Detach long-running containers** — never run attached for hours
8. **Disable Docker stdout logging** when you have your own observability
9. **Respect hardware constraints** — push GPU work to where GPU is accessible
10. **Don't render synthetic POV in observability platforms** — use map + real-camera + HUD
11. **Don't accept "good enough" mocks** for portfolio work — especially for video/sensor sources

---

## Open Challenges (Not Yet Resolved)

- [ ] **Disk space:** Need to clear ~20 GB before Gazebo path is feasible
- [ ] **Gazebo in WSL2 setup:** Architecture documented, implementation pending
- [ ] **Real-time camera feed bridging:** WSL2 → host network → Docker backend pipeline
- [ ] **Frame-accurate telemetry/video sync:** Plan to use shared timestamp metadata
- [ ] **Backend implementation:** Phase 1 not yet started

---

*Last updated: 2026-05-08*
