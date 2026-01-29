import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { gsap } from 'gsap';
import type { CameraPreset } from './types';

export class CameraSystem {
  public camera: THREE.PerspectiveCamera;
  public controls: OrbitControls;
  private presets: CameraPreset[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(20, 15, 20);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 100;
    this.controls.maxPolarAngle = Math.PI * 0.45;
    this.controls.target.set(0, 0, 0);

    window.addEventListener('resize', this.onResize.bind(this));
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  setPresets(presets: CameraPreset[]): void {
    this.presets = presets;
  }

  getPresets(): CameraPreset[] {
    return this.presets;
  }

  transitionTo(preset: CameraPreset, duration = 1.5): void {
    // Disable controls during transition
    this.controls.enabled = false;

    const targetPos = new THREE.Vector3(...preset.position);
    const targetTarget = new THREE.Vector3(...preset.target);

    gsap.to(this.camera.position, {
      x: targetPos.x,
      y: targetPos.y,
      z: targetPos.z,
      duration,
      ease: 'power2.inOut',
    });

    gsap.to(this.controls.target, {
      x: targetTarget.x,
      y: targetTarget.y,
      z: targetTarget.z,
      duration,
      ease: 'power2.inOut',
      onComplete: () => {
        this.controls.enabled = true;
      },
    });
  }

  setPosition(position: [number, number, number], target: [number, number, number]): void {
    this.camera.position.set(...position);
    this.controls.target.set(...target);
    this.controls.update();
  }

  update(): void {
    this.controls.update();
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize.bind(this));
    this.controls.dispose();
  }
}
