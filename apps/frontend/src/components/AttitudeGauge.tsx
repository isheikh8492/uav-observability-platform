import { useEffect, useRef } from "react";
import * as THREE from "three";

import { useFleetStore } from "../stores/fleetStore.js";

/**
 * 3D attitude indicator — a small drone model that mirrors the live roll/pitch/yaw.
 *
 * This is a *gauge*, not a flight simulator viewport. It shows orientation only,
 * not the drone's environment. Animates at 60 FPS via requestAnimationFrame and
 * reads the latest store state directly each frame (no React renders).
 */
export function AttitudeGauge() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene + camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    camera.position.set(2.4, 1.4, 2.4);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xffffff, 0.9);
    directional.position.set(5, 10, 7);
    scene.add(directional);

    // Drone body — simple low-poly quadcopter shape
    const droneGroup = new THREE.Group();

    // Center body (flat box)
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x58a6ff,
      metalness: 0.3,
      roughness: 0.5,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.15, 0.8), bodyMaterial);
    droneGroup.add(body);

    // Arms (4 thin boxes in X-pattern)
    const armMaterial = new THREE.MeshStandardMaterial({ color: 0x30363d });
    const armLength = 1.2;
    const armPositions: Array<[number, number, number]> = [
      [armLength / 2, 0, armLength / 2],
      [-armLength / 2, 0, armLength / 2],
      [armLength / 2, 0, -armLength / 2],
      [-armLength / 2, 0, -armLength / 2],
    ];

    for (const [x, y, z] of armPositions) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, Math.hypot(armLength, armLength) / 1.4), armMaterial);
      arm.position.set(x / 2, y, z / 2);
      arm.lookAt(x, y, z);
      droneGroup.add(arm);

      // Rotor at the end
      const rotor = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 0.04, 16),
        new THREE.MeshStandardMaterial({ color: 0x161b22, metalness: 0.6 })
      );
      rotor.position.set(x, y + 0.05, z);
      droneGroup.add(rotor);
    }

    // Front indicator (small marker showing nose direction)
    const noseMaterial = new THREE.MeshStandardMaterial({ color: 0xf85149 });
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 8), noseMaterial);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0, 0.5);
    droneGroup.add(nose);

    scene.add(droneGroup);

    // Subtle horizon / ground reference
    const grid = new THREE.GridHelper(4, 8, 0x30363d, 0x21262d);
    grid.position.y = -0.4;
    scene.add(grid);

    // Animation loop — read latest attitude every frame
    let frameId = 0;
    const tick = (): void => {
      const state = useFleetStore.getState();
      const selected = state.selectedVehicleId
        ? state.vehicles.get(state.selectedVehicleId)
        : null;
      const att = selected?.snapshot.attitude;
      if (att) {
        // PX4 NED frame: yaw = clockwise from north (Z down).
        // Three.js Y-up: rotate Y for yaw, X for pitch, Z for roll.
        droneGroup.rotation.set(att.pitch, -att.yaw, -att.roll);
      }
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(tick);
    };
    tick();

    // Resize handling
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(frameId);
      ro.disconnect();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="attitude-gauge">
      <div className="attitude-gauge__overlay">Attitude</div>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
