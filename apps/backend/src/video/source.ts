import type { CameraFrame, VehiclePayload } from "@uav/types";

export interface VideoSource {
  frameFor(vehicle: VehiclePayload): Promise<CameraFrame>;
}

