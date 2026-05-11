import { useEffect, useRef } from "react";
import maplibregl, { type Map as MapLibreMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { useTelemetryStore } from "../stores/telemetryStore.js";

/**
 * Map pane — shows the drone's position on a 2D map with a flight path trail.
 *
 * Uses MapLibre GL with the OpenStreetMap raster tiles (no API key required).
 * In Phase 1B we'll swap to Mapbox satellite tiles for a more aerial look.
 *
 * The map ref + drone marker are stored in refs (NOT state) because they're
 * imperative DOM-adjacent objects that update at high frequency. React state
 * would re-render unnecessarily.
 */
export function MapPane() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const trailRef = useRef<Array<[number, number]>>([]);

  // Initialize map once
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
        layers: [
          {
            id: "osm",
            type: "raster",
            source: "osm",
          },
        ],
      },
      center: [8.5456, 47.3977], // PX4 default home (Zurich)
      zoom: 16,
    });

    map.on("load", () => {
      // Source for the flight path trail (line)
      map.addSource("trail", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "LineString", coordinates: [] },
          properties: {},
        },
      });
      map.addLayer({
        id: "trail-line",
        type: "line",
        source: "trail",
        paint: {
          "line-color": "#58a6ff",
          "line-width": 2,
          "line-opacity": 0.8,
        },
      });
    });

    // Drone marker — a custom triangle pointing in heading direction
    const el = document.createElement("div");
    el.style.cssText = `
      width: 0; height: 0;
      border-left: 8px solid transparent;
      border-right: 8px solid transparent;
      border-bottom: 16px solid #58a6ff;
      filter: drop-shadow(0 0 4px rgba(88, 166, 255, 0.8));
      transform-origin: 50% 67%;
    `;
    const marker = new maplibregl.Marker({ element: el, rotationAlignment: "map" })
      .setLngLat([8.5456, 47.3977])
      .addTo(map);

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      marker.remove();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Subscribe to position updates and update the marker imperatively
  useEffect(() => {
    return useTelemetryStore.subscribe((state) => {
      const pos = state.snapshot?.position;
      if (!pos || !markerRef.current || !mapRef.current) return;
      if (Number.isNaN(pos.latitude) || Number.isNaN(pos.longitude)) return;

      const lngLat: [number, number] = [pos.longitude, pos.latitude];

      // Update marker position
      markerRef.current.setLngLat(lngLat);

      // Update marker rotation (heading is in radians, MapLibre wants degrees)
      const headingDeg = (pos.heading * 180) / Math.PI;
      markerRef.current.setRotation(headingDeg);

      // Append to trail (rate-limited: only add point if drone moved >1m)
      const trail = trailRef.current;
      const last = trail[trail.length - 1];
      if (!last || Math.hypot(last[0] - lngLat[0], last[1] - lngLat[1]) > 0.00001) {
        trail.push(lngLat);
        if (trail.length > 1000) trail.shift(); // cap memory

        const source = mapRef.current.getSource("trail") as maplibregl.GeoJSONSource | undefined;
        source?.setData({
          type: "Feature",
          geometry: { type: "LineString", coordinates: trail },
          properties: {},
        });
      }
    });
  }, []);

  return (
    <div className="map-pane">
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <div className="map-pane__overlay">
        <DroneCoordsDisplay />
      </div>
    </div>
  );
}

function DroneCoordsDisplay() {
  const pos = useTelemetryStore((s) => s.snapshot?.position);
  if (!pos || Number.isNaN(pos.latitude)) return <span>No GPS lock</span>;
  return (
    <span>
      {pos.latitude.toFixed(6)}, {pos.longitude.toFixed(6)} · {pos.altitudeMsl.toFixed(1)}m MSL
    </span>
  );
}
