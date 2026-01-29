import * as THREE from 'three';
import type { Renderer } from './types';

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  antialias?: boolean;
  alpha?: boolean;
}

export async function createRenderer(options: RendererOptions): Promise<{ renderer: Renderer; isWebGPU: boolean }> {
  const { canvas, antialias = true, alpha = false } = options;

  // Use WebGL2 renderer (WebGPU support is still experimental in Three.js)
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias,
    alpha,
    powerPreference: 'high-performance',
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  console.log('WebGL2 renderer initialized');
  return { renderer, isWebGPU: false };
}

export function resizeRenderer(renderer: Renderer): void {
  renderer.setSize(window.innerWidth, window.innerHeight);
}
