import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import type { Renderer } from './types';

export interface PostProcessingOptions {
  bloom?: {
    enabled: boolean;
    strength: number;
    radius: number;
    threshold: number;
  };
  fxaa?: boolean;
}

export class PostProcessing {
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private fxaaPass: ShaderPass | null = null;
  private isWebGPU: boolean;
  private renderer: Renderer;
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;

  constructor(renderer: Renderer, isWebGPU: boolean) {
    this.renderer = renderer;
    this.isWebGPU = isWebGPU;
  }

  init(
    scene: THREE.Scene,
    camera: THREE.Camera,
    options: PostProcessingOptions = {}
  ): void {
    this.scene = scene;
    this.camera = camera;

    // For WebGPU, we skip the composer and render directly
    // Post-processing in WebGPU is done via TSL nodes
    if (this.isWebGPU) {
      return;
    }

    // WebGL2 post-processing using EffectComposer
    const webglRenderer = this.renderer as THREE.WebGLRenderer;
    this.composer = new EffectComposer(webglRenderer);

    // Render pass
    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    // Bloom pass
    const bloomConfig = options.bloom ?? {
      enabled: true,
      strength: 0.5,
      radius: 0.4,
      threshold: 0.8,
    };

    if (bloomConfig.enabled) {
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        bloomConfig.strength,
        bloomConfig.radius,
        bloomConfig.threshold
      );
      this.composer.addPass(this.bloomPass);
    }

    // FXAA pass
    if (options.fxaa !== false) {
      this.fxaaPass = new ShaderPass(FXAAShader);
      const pixelRatio = webglRenderer.getPixelRatio();
      this.fxaaPass.material.uniforms['resolution'].value.x =
        1 / (window.innerWidth * pixelRatio);
      this.fxaaPass.material.uniforms['resolution'].value.y =
        1 / (window.innerHeight * pixelRatio);
      this.composer.addPass(this.fxaaPass);
    }

    // Output pass for correct color space
    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);

    window.addEventListener('resize', this.onResize.bind(this));
  }

  private onResize(): void {
    if (!this.composer) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    this.composer.setSize(width, height);

    if (this.bloomPass) {
      this.bloomPass.setSize(width, height);
    }

    if (this.fxaaPass) {
      const pixelRatio = (this.renderer as THREE.WebGLRenderer).getPixelRatio();
      this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (width * pixelRatio);
      this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (height * pixelRatio);
    }
  }

  setBloomStrength(strength: number): void {
    if (this.bloomPass) {
      this.bloomPass.strength = strength;
    }
  }

  setBloomRadius(radius: number): void {
    if (this.bloomPass) {
      this.bloomPass.radius = radius;
    }
  }

  setBloomThreshold(threshold: number): void {
    if (this.bloomPass) {
      this.bloomPass.threshold = threshold;
    }
  }

  render(): void {
    if (this.isWebGPU) {
      // WebGPU renders directly
      if (this.scene && this.camera) {
        (this.renderer as any).render(this.scene, this.camera);
      }
    } else if (this.composer) {
      this.composer.render();
    }
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize.bind(this));
    if (this.composer) {
      this.composer.dispose();
    }
  }
}
