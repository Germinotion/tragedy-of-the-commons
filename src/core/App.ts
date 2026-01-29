import * as THREE from 'three';
import { createRenderer, resizeRenderer } from './Renderer';
import { SimulationEngine } from './SimulationEngine';
import { CameraSystem } from './CameraSystem';
import { PostProcessing } from './PostProcessing';
import { ComputeManager } from './ComputeManager';
import type { Scenario, SimulationContext, SimulationState, Renderer } from './types';

export class App {
  private canvas: HTMLCanvasElement;
  private renderer!: Renderer;
  private isWebGPU = false;
  private scene!: THREE.Scene;
  private cameraSystem!: CameraSystem;
  private postProcessing!: PostProcessing;
  private computeManager!: ComputeManager;
  private simulationEngine: SimulationEngine;
  private currentScenario: Scenario | null = null;
  private initialized = false;

  // Callbacks for UI updates
  public onMetricsUpdate: ((metrics: Record<string, number>) => void) | null = null;
  public onStateChange: ((state: SimulationState) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.simulationEngine = new SimulationEngine();
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    // Initialize renderer
    const { renderer, isWebGPU } = await createRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.renderer = renderer;
    this.isWebGPU = isWebGPU;

    // Initialize scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0f);

    // Initialize camera system
    this.cameraSystem = new CameraSystem(this.canvas);

    // Initialize post-processing
    this.postProcessing = new PostProcessing(this.renderer, this.isWebGPU);
    this.postProcessing.init(this.scene, this.cameraSystem.camera);

    // Initialize compute manager
    this.computeManager = new ComputeManager(this.isWebGPU);
    await this.computeManager.init();

    // Set up simulation loop callbacks
    this.simulationEngine.setCallbacks(
      this.update.bind(this),
      this.render.bind(this),
      (state) => this.onStateChange?.(state)
    );

    // Handle window resize
    window.addEventListener('resize', this.onResize.bind(this));

    this.initialized = true;
  }

  private onResize(): void {
    resizeRenderer(this.renderer);
    this.cameraSystem.camera.aspect = window.innerWidth / window.innerHeight;
    this.cameraSystem.camera.updateProjectionMatrix();
  }

  async loadScenario(scenario: Scenario): Promise<void> {
    // Dispose of current scenario
    if (this.currentScenario) {
      this.currentScenario.dispose();
      this.clearScene();
    }

    this.currentScenario = scenario;

    // Create simulation context
    const context: SimulationContext = {
      scene: this.scene,
      camera: this.cameraSystem.camera,
      renderer: this.renderer,
      canvas: this.canvas,
      isWebGPU: this.isWebGPU,
    };

    // Initialize scenario
    await scenario.init(context);

    // Set camera presets
    this.cameraSystem.setPresets(scenario.getCameraPresets());

    // Apply first preset if available
    const presets = scenario.getCameraPresets();
    if (presets.length > 0) {
      this.cameraSystem.setPosition(presets[0].position, presets[0].target);
    }

    // Reset simulation state
    this.simulationEngine.reset();
  }

  private clearScene(): void {
    while (this.scene.children.length > 0) {
      const child = this.scene.children[0];
      this.scene.remove(child);
      if ((child as any).geometry) (child as any).geometry.dispose();
      if ((child as any).material) {
        const materials = Array.isArray((child as any).material)
          ? (child as any).material
          : [(child as any).material];
        materials.forEach((m: THREE.Material) => m.dispose());
      }
    }
  }

  private update(dt: number, elapsed: number): void {
    this.currentScenario?.update(dt, elapsed);

    // Send metrics to UI (throttled in the callback)
    if (this.currentScenario && this.onMetricsUpdate) {
      this.onMetricsUpdate(this.currentScenario.getMetrics());
    }
  }

  private render(alpha: number): void {
    this.cameraSystem.update();
    this.currentScenario?.render(alpha);
    this.postProcessing.render();
  }

  start(): void {
    this.simulationEngine.start();
  }

  stop(): void {
    this.simulationEngine.stop();
  }

  play(): void {
    this.simulationEngine.play();
  }

  pause(): void {
    this.simulationEngine.pause();
  }

  togglePlay(): void {
    this.simulationEngine.togglePlay();
  }

  faster(): void {
    this.simulationEngine.faster();
  }

  slower(): void {
    this.simulationEngine.slower();
  }

  reset(): void {
    this.simulationEngine.reset();
    this.currentScenario?.reset();
  }

  getState(): SimulationState {
    return this.simulationEngine.getState();
  }

  getCameraSystem(): CameraSystem {
    return this.cameraSystem;
  }

  getComputeManager(): ComputeManager {
    return this.computeManager;
  }

  getCurrentScenario(): Scenario | null {
    return this.currentScenario;
  }

  dispose(): void {
    this.simulationEngine.stop();
    this.currentScenario?.dispose();
    this.cameraSystem.dispose();
    this.postProcessing.dispose();
    this.computeManager.dispose();
    this.renderer.dispose();
    window.removeEventListener('resize', this.onResize.bind(this));
  }
}
