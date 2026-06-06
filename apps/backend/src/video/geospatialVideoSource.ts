import type { CameraFrame, VehiclePayload } from "@uav/types";

import type { VideoSource } from "./source.js";

interface GeospatialVideoSourceOptions {
  accessToken: string;
  style: string;
  enabled: boolean;
}

const WIDTH = 640;
const HEIGHT = 360;

export class GeospatialVideoSource implements VideoSource {
  private readonly accessToken: string;
  private readonly style: string;
  private readonly enabled: boolean;
  private readonly cache = new Map<string, string>();

  constructor(options: GeospatialVideoSourceOptions) {
    this.accessToken = options.accessToken;
    this.style = options.style;
    this.enabled = options.enabled;
  }

  async frameFor(vehicle: VehiclePayload): Promise<CameraFrame> {
    const base = this.baseFrame(vehicle);
    const position = vehicle.snapshot.position;

    if (!this.enabled) {
      return { ...base, reason: "Camera disabled" };
    }
    if (!this.accessToken) {
      return { ...base, reason: "MAPBOX_ACCESS_TOKEN is not configured" };
    }
    if (!position || Number.isNaN(position.latitude) || Number.isNaN(position.longitude)) {
      return { ...base, reason: "Waiting for vehicle GPS position" };
    }

    const zoom = zoomForAltitude(position.altitudeRelative);
    const bearing = normalizeDegrees(radToDeg(position.heading));
    const cacheKey = cacheKeyFor(position.latitude, position.longitude, zoom, bearing);
    const cached = this.cache.get(cacheKey);

    if (cached) {
      return {
        ...base,
        status: "live",
        provider: "mapbox",
        imageDataUrl: cached,
        latitude: position.latitude,
        longitude: position.longitude,
        altitudeMsl: position.altitudeMsl,
        altitudeRelative: position.altitudeRelative,
        heading: position.heading,
        zoom,
        bearing,
      };
    }

    const response = await fetch(this.urlFor(position.latitude, position.longitude, zoom, bearing));
    if (!response.ok) {
      return { ...base, reason: `Mapbox request failed (${response.status})` };
    }

    const contentType = response.headers.get("content-type") ?? "image/png";
    const bytes = Buffer.from(await response.arrayBuffer());
    const dataUrl = `data:${contentType};base64,${bytes.toString("base64")}`;
    this.cache.set(cacheKey, dataUrl);

    return {
      ...base,
      status: "live",
      provider: "mapbox",
      imageDataUrl: dataUrl,
      latitude: position.latitude,
      longitude: position.longitude,
      altitudeMsl: position.altitudeMsl,
      altitudeRelative: position.altitudeRelative,
      heading: position.heading,
      zoom,
      bearing,
    };
  }

  private baseFrame(vehicle: VehiclePayload): CameraFrame {
    const position = vehicle.snapshot.position;
    return {
      vehicleId: vehicle.vehicleId,
      timestamp: Date.now(),
      status: "unavailable",
      provider: this.accessToken ? "mapbox" : "none",
      latitude: position?.latitude ?? null,
      longitude: position?.longitude ?? null,
      altitudeMsl: position?.altitudeMsl ?? null,
      altitudeRelative: position?.altitudeRelative ?? null,
      heading: position?.heading ?? null,
      zoom: null,
      bearing: position ? normalizeDegrees(radToDeg(position.heading)) : null,
    };
  }

  private urlFor(lat: number, lon: number, zoom: number, bearing: number): string {
    const stylePath = this.style.includes("/")
      ? this.style
      : `mapbox/${this.style}`;
    const params = new URLSearchParams({
      access_token: this.accessToken,
      logo: "false",
      attribution: "false",
    });
    return `https://api.mapbox.com/styles/v1/${stylePath}/static/${lon},${lat},${zoom},${bearing},0/${WIDTH}x${HEIGHT}?${params.toString()}`;
  }
}

function zoomForAltitude(altitudeRelative: number): number {
  const safeAltitude = Math.max(0, altitudeRelative);
  return roundTo(clamp(14, 20, 21 - Math.log2(safeAltitude + 1)), 0.25);
}

function cacheKeyFor(lat: number, lon: number, zoom: number, bearing: number): string {
  return [
    roundTo(lat, 0.0002).toFixed(4),
    roundTo(lon, 0.0002).toFixed(4),
    roundTo(zoom, 0.25).toFixed(2),
    roundTo(bearing, 10).toFixed(0),
  ].join(":");
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function clamp(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

