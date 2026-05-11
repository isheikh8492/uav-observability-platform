import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, {
  type Map as MapLibreMap,
  type MapMouseEvent,
  type Marker,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import type { CommandKind, VehicleId, VehiclePayload } from "@uav/types";
import { useFleetStore } from "../stores/fleetStore.js";
import { useCommand } from "../hooks/useCommand.js";
const setLastCommandResult = (...args: Parameters<ReturnType<typeof useFleetStore.getState>["setLastCommandResult"]>): void => {
  useFleetStore.getState().setLastCommandResult(...args);
};
import {
  bannerFor,
  canGoto,
  vehicleActions,
  type VehicleAction,
} from "../lib/vehicleActions.js";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu.js";
import { AltitudePrompt } from "./AltitudePrompt.js";

const WS_URL = import.meta.env["VITE_WS_URL"] ?? "ws://localhost:8080";

/**
 * Possible interactive overlays on top of the map.
 * Discriminated union so only one can be active at a time.
 */
type Overlay =
  | { type: "none" }
  | { type: "vehicleMenu"; vehicleId: VehicleId; x: number; y: number }
  | { type: "mapMenu";     x: number; y: number; lngLat: { lng: number; lat: number } }
  | { type: "altitudePrompt";
      kind: "takeoff" | "goto";
      x: number; y: number;
      vehicleId: VehicleId;
      params?: Record<string, number>;
    }
  | { type: "gotoPreview";
      x: number; y: number;
      vehicleId: VehicleId;
      lngLat: { lng: number; lat: number };
    };

/**
 * Map pane — primary interaction surface.
 *
 * Behaviors:
 *   - One marker per vehicle (selected one highlighted)
 *   - Left-click drone marker → select that drone
 *   - Right-click drone marker → vehicle context menu
 *   - Right-click empty map (with vehicle selected & able to go) → "Fly to here"
 *   - "Fly to here" opens a preview dot + confirm panel (two-step UX)
 */
export function MapPane() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  // One marker DOM element per vehicle, tracked imperatively.
  const markersRef = useRef(new Map<VehicleId, Marker>());
  const trailsRef = useRef(new Map<VehicleId, Array<[number, number]>>());
  /** Tentative preview pin shown during the goto-confirm step. */
  const targetMarkerRef = useRef<Marker | null>(null);
  /** Committed targets — one per vehicle currently in enRoute state. */
  const activeTargetsRef = useRef(new Map<VehicleId, Marker>());

  const vehicles = useFleetStore((s) => s.vehicles);
  const selectedId = useFleetStore((s) => s.selectedVehicleId);
  const selectVehicle = useFleetStore((s) => s.selectVehicle);

  const { send } = useCommand(WS_URL);

  const [overlay, setOverlay] = useState<Overlay>({ type: "none" });

  // ── Map initialization ────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: [8.5456, 47.3977], // PX4 default home
      zoom: 16,
    });

    map.on("load", () => {
      // Past trail — where each vehicle has been
      map.addSource("trails", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "trails-line",
        type: "line",
        source: "trails",
        paint: {
          "line-color": "#58a6ff",
          "line-width": 1.5,
          "line-opacity": 0.6,
        },
      });

      // Active flight paths — drone → committed goto target. Dashed
      // gold line to convey "planned trajectory in progress."
      map.addSource("active-paths", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "active-paths-line",
        type: "line",
        source: "active-paths",
        paint: {
          "line-color": "#fbbf24",
          "line-width": 2.5,
          "line-opacity": 0.85,
          "line-dasharray": [2, 2],
        },
      });
    });

    // Right-click on the map (away from any marker) opens goto context menu
    // for the currently selected vehicle.
    map.on("contextmenu", (e: MapMouseEvent) => {
      e.preventDefault();
      const state = useFleetStore.getState();
      const sel = state.selectedVehicleId
        ? state.vehicles.get(state.selectedVehicleId)
        : null;
      if (!sel) return;
      setOverlay({
        type: "mapMenu",
        x: e.originalEvent.clientX,
        y: e.originalEvent.clientY,
        lngLat: { lng: e.lngLat.lng, lat: e.lngLat.lat },
      });
    });

    // Left-click on empty map clears any pending overlay (but doesn't deselect).
    map.on("click", () => {
      setOverlay({ type: "none" });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
      trailsRef.current.clear();
      activeTargetsRef.current.clear();
    };
  }, []);

  // ── Sync vehicle markers to fleet state ──────────────────────────────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set<VehicleId>();
    vehicles.forEach((vehicle, id) => {
      seen.add(id);
      const position = vehicle.snapshot.position;
      if (!position || Number.isNaN(position.latitude)) return;
      const lngLat: [number, number] = [position.longitude, position.latitude];
      const heading = position.heading;

      let marker = markersRef.current.get(id);
      if (!marker) {
        const el = createDroneMarkerEl(id, () => selectVehicle(id), (px) => {
          setOverlay({ type: "vehicleMenu", vehicleId: id, x: px.x, y: px.y });
        });
        marker = new maplibregl.Marker({
          element: el,
          rotationAlignment: "map",
        }).setLngLat(lngLat).addTo(map);
        markersRef.current.set(id, marker);
        trailsRef.current.set(id, []);
      }

      marker.setLngLat(lngLat);
      marker.setRotation((heading * 180) / Math.PI);

      // Update marker selection styling
      const el = marker.getElement();
      if (id === selectedId) el.classList.add("drone-marker--selected");
      else el.classList.remove("drone-marker--selected");

      // Append to trail (rate-limited)
      const trail = trailsRef.current.get(id)!;
      const last = trail[trail.length - 1];
      if (!last || Math.hypot(last[0] - lngLat[0], last[1] - lngLat[1]) > 0.00001) {
        trail.push(lngLat);
        if (trail.length > 1000) trail.shift();
      }
    });

    // Remove markers for vehicles no longer in the fleet
    for (const [id, marker] of markersRef.current.entries()) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
        trailsRef.current.delete(id);
      }
    }

    // Update trail source with all current trails
    const source = map.getSource("trails") as maplibregl.GeoJSONSource | undefined;
    if (source) {
      const features = [...trailsRef.current.entries()].map(([id, coords]) => ({
        type: "Feature" as const,
        properties: { vehicleId: id },
        geometry: { type: "LineString" as const, coordinates: coords },
      }));
      source.setData({ type: "FeatureCollection", features });
    }

    // ── Reconcile active goto targets + flight path lines ──────────────────
    // For each vehicle in enRoute state, place a target marker at the goto
    // destination and draw a dashed line from the drone's current position
    // to that target. When the vehicle leaves enRoute (arrival / hold / land),
    // both the marker and the line disappear.
    const seenTargets = new Set<VehicleId>();
    const pathFeatures: Array<{
      type: "Feature";
      properties: { vehicleId: VehicleId };
      geometry: { type: "LineString"; coordinates: Array<[number, number]> };
    }> = [];

    vehicles.forEach((vehicle, id) => {
      if (vehicle.state.name !== "enRoute") return;
      const pos = vehicle.snapshot.position;
      if (!pos || Number.isNaN(pos.latitude)) return;
      seenTargets.add(id);

      const target: [number, number] = [vehicle.state.target.lon, vehicle.state.target.lat];

      let marker = activeTargetsRef.current.get(id);
      if (!marker) {
        const el = document.createElement("div");
        el.className = "goto-target goto-target--active";
        marker = new maplibregl.Marker({ element: el }).setLngLat(target).addTo(map);
        activeTargetsRef.current.set(id, marker);
      } else {
        marker.setLngLat(target);
      }

      pathFeatures.push({
        type: "Feature",
        properties: { vehicleId: id },
        geometry: {
          type: "LineString",
          coordinates: [[pos.longitude, pos.latitude], target],
        },
      });
    });

    for (const [id, marker] of activeTargetsRef.current.entries()) {
      if (!seenTargets.has(id)) {
        marker.remove();
        activeTargetsRef.current.delete(id);
      }
    }

    const pathSource = map.getSource("active-paths") as maplibregl.GeoJSONSource | undefined;
    pathSource?.setData({ type: "FeatureCollection", features: pathFeatures });
  }, [vehicles, selectedId, selectVehicle]);

  // ── Render goto target preview ────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (targetMarkerRef.current) {
      targetMarkerRef.current.remove();
      targetMarkerRef.current = null;
    }
    if (overlay.type === "gotoPreview") {
      const el = document.createElement("div");
      el.className = "goto-target";
      targetMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([overlay.lngLat.lng, overlay.lngLat.lat])
        .addTo(map);
    }
  }, [overlay]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCommand = (
    vehicleId: VehicleId,
    kind: CommandKind,
    params?: Record<string, number>
  ): void => {
    void send(vehicleId, kind, params)
      .then((result) => {
        setLastCommandResult(result);
      })
      .catch((err) => {
        console.error(`Command ${kind} failed:`, err);
        setLastCommandResult({
          requestId: "",
          vehicleId,
          kind,
          sent: false,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  };

  const dismiss = (): void => setOverlay({ type: "none" });

  // ── Memoized derived data for the active overlay ──────────────────────────

  const activeVehicle = useMemo<VehiclePayload | null>(() => {
    if (overlay.type === "vehicleMenu") {
      return vehicles.get(overlay.vehicleId) ?? null;
    }
    if (
      overlay.type === "mapMenu" ||
      overlay.type === "altitudePrompt" ||
      overlay.type === "gotoPreview"
    ) {
      const id = overlay.type === "mapMenu" ? selectedId : overlay.vehicleId;
      return id ? vehicles.get(id) ?? null : null;
    }
    return null;
  }, [overlay, vehicles, selectedId]);

  // Build context menu items based on overlay context
  let menuItems: ContextMenuItem[] = [];
  let menuHeader: string | undefined;
  let menuPosition: { x: number; y: number } | null = null;

  if (overlay.type === "vehicleMenu" && activeVehicle) {
    menuPosition = { x: overlay.x, y: overlay.y };
    menuHeader = `${activeVehicle.name} · ${bannerFor(activeVehicle.state, activeVehicle.connection.connected)}`;
    const actions = vehicleActions(activeVehicle.state);
    if (actions.length === 0) {
      // Transient state (arming, takingOff, etc.) — keep the menu mounted
      // with a single disabled placeholder so it doesn't flicker.
      menuItems = [
        {
          key: "_pending",
          label: "Command in progress…",
          description: "Waiting for vehicle to reach next state",
          disabled: true,
          onClick: () => undefined,
        },
      ];
    } else {
      menuItems = actions.map((a: VehicleAction) => ({
        key: a.key,
        label: a.label,
        description: a.description,
        variant: a.variant,
        onClick: () => {
          if (a.requiresInput === "altitude") {
            // Transition to the altitude prompt — vehicle menu naturally
            // unmounts because overlay.type changes.
            setOverlay({
              type: "altitudePrompt",
              kind: "takeoff",
              x: overlay.x,
              y: overlay.y,
              vehicleId: overlay.vehicleId,
            });
          } else {
            // Fire-and-stay-open: command goes out, menu stays put so the
            // operator can immediately chain the next action (e.g., Arm →
            // Takeoff right after). The menu re-renders with the new
            // state's actions because the FSM has moved forward.
            handleCommand(overlay.vehicleId, a.key);
          }
        },
      }));
    }
  } else if (overlay.type === "mapMenu" && activeVehicle) {
    menuPosition = { x: overlay.x, y: overlay.y };
    menuHeader = `${activeVehicle.name}`;
    if (canGoto(activeVehicle.state)) {
      menuItems = [
        {
          key: "goto",
          label: "Fly to here…",
          description: "Send drone to clicked location",
          variant: "primary",
          onClick: () => {
            setOverlay({
              type: "gotoPreview",
              x: overlay.x,
              y: overlay.y,
              vehicleId: activeVehicle.vehicleId,
              lngLat: overlay.lngLat,
            });
          },
        },
      ];
    } else {
      menuItems = [
        {
          key: "goto",
          label: "Fly to here (drone not flying)",
          disabled: true,
          onClick: () => undefined,
        },
      ];
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="map-pane">
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      <div className="map-pane__overlay">
        <DroneCoordsDisplay />
        <span className="map-pane__hint">Right-click drone or map for actions</span>
      </div>

      {menuPosition && menuItems.length > 0 && (
        <ContextMenu
          x={menuPosition.x}
          y={menuPosition.y}
          header={menuHeader}
          items={menuItems}
          onDismiss={dismiss}
        />
      )}

      {overlay.type === "altitudePrompt" && (
        <AltitudePrompt
          x={overlay.x}
          y={overlay.y}
          defaultAltitude={overlay.kind === "takeoff" ? 5 : 10}
          title={overlay.kind === "takeoff" ? "Takeoff Altitude" : "Goto Altitude"}
          confirmLabel={overlay.kind === "takeoff" ? "Take off" : "Fly"}
          onConfirm={(alt) => {
            handleCommand(overlay.vehicleId, overlay.kind, {
              ...overlay.params,
              altitude: alt,
            });
            dismiss();
          }}
          onCancel={dismiss}
        />
      )}

      {overlay.type === "gotoPreview" && activeVehicle && (
        <ContextMenu
          x={overlay.x}
          y={overlay.y}
          header={`Fly to ${overlay.lngLat.lat.toFixed(5)}, ${overlay.lngLat.lng.toFixed(5)}`}
          items={[
            {
              key: "confirm-goto",
              label: "Confirm — Fly",
              variant: "primary",
              onClick: () => {
                handleCommand(overlay.vehicleId, "goto", {
                  latitude: overlay.lngLat.lat,
                  longitude: overlay.lngLat.lng,
                });
                dismiss();
              },
            },
            {
              key: "cancel-goto",
              label: "Cancel",
              onClick: dismiss,
            },
          ]}
          onDismiss={dismiss}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers

function createDroneMarkerEl(
  id: VehicleId,
  onSelect: () => void,
  onContextMenu: (clientPos: { x: number; y: number }) => void
): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "drone-marker";
  el.dataset["vehicleId"] = id;

  // Top-down quadcopter SVG. Inline so it inherits the marker's rotation
  // (MapLibre's rotationAlignment="map" rotates the whole element to
  // match the drone's heading). The orange nose triangle at the top is
  // the heading indicator.
  el.innerHTML = `
    <div class="drone-marker__halo"></div>
    <svg class="drone-marker__body" viewBox="-24 -24 48 48" xmlns="http://www.w3.org/2000/svg">
      <!-- Arms (X-pattern) -->
      <line x1="-14" y1="-14" x2="14"  y2="14"  class="drone-marker__arm" />
      <line x1="14"  y1="-14" x2="-14" y2="14"  class="drone-marker__arm" />
      <!-- Rotors -->
      <circle cx="-14" cy="-14" r="5" class="drone-marker__rotor" />
      <circle cx="14"  cy="-14" r="5" class="drone-marker__rotor" />
      <circle cx="-14" cy="14"  r="5" class="drone-marker__rotor" />
      <circle cx="14"  cy="14"  r="5" class="drone-marker__rotor" />
      <!-- Center body -->
      <circle cx="0" cy="0" r="6" class="drone-marker__hub" />
      <!-- Nose / heading indicator -->
      <polygon points="0,-22 -5,-13 5,-13" class="drone-marker__nose" />
    </svg>
  `;

  el.addEventListener("click", (ev) => {
    ev.stopPropagation();
    onSelect();
  });
  el.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    onContextMenu({ x: ev.clientX, y: ev.clientY });
  });
  return el;
}

function DroneCoordsDisplay() {
  const selected = useFleetStore((s) =>
    s.selectedVehicleId ? s.vehicles.get(s.selectedVehicleId) : null
  );
  const pos = selected?.snapshot.position;
  if (!pos || Number.isNaN(pos.latitude)) return <span>No GPS lock</span>;
  return (
    <span>
      {pos.latitude.toFixed(6)}, {pos.longitude.toFixed(6)} · {pos.altitudeMsl.toFixed(1)}m MSL
    </span>
  );
}
