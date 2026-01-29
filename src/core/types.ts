import type { Scene, Camera, WebGLRenderer } from 'three';

// Use WebGLRenderer for now - WebGPU support is still experimental
export type Renderer = WebGLRenderer;

export interface SimulationContext {
  scene: Scene;
  camera: Camera;
  renderer: Renderer;
  canvas: HTMLCanvasElement;
  isWebGPU: boolean;
}

export type ScenarioCategory = 'living' | 'non-living' | 'abstract';

export interface ScenarioMetadata {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  category: ScenarioCategory;
  color: string;
  infoContent: {
    title: string;
    body: string;
  };
}

export interface ParamDescriptor {
  key: string;
  label: string;
  type: 'number' | 'boolean' | 'select';
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: string | number }[];
  folder?: string;
}

export interface ChartDescriptor {
  id: string;
  title: string;
  series: {
    label: string;
    color: string;
  }[];
  yRange?: [number, number];
}

export interface Scenario {
  metadata: ScenarioMetadata;
  init(context: SimulationContext): Promise<void>;
  update(dt: number, elapsed: number): void;
  render(alpha: number): void;
  getMetrics(): Record<string, number>;
  getParams(): Record<string, number | boolean | string>;
  setParam(key: string, value: number | boolean | string): void;
  getParamDescriptors(): ParamDescriptor[];
  getChartDescriptors(): ChartDescriptor[];
  getCameraPresets(): CameraPreset[];
  reset(): void;
  dispose(): void;
}

export interface CameraPreset {
  name: string;
  position: [number, number, number];
  target: [number, number, number];
}

export interface SimulationState {
  isPlaying: boolean;
  speed: number;
  elapsed: number;
}

export const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4];
export const FIXED_DT = 1 / 60; // 60 Hz simulation
