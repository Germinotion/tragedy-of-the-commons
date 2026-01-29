import { FIXED_DT, SPEED_OPTIONS, type SimulationState } from './types';

export type UpdateCallback = (dt: number, elapsed: number) => void;
export type RenderCallback = (alpha: number) => void;

export class SimulationEngine {
  private state: SimulationState = {
    isPlaying: true,
    speed: 1,
    elapsed: 0,
  };

  private accumulator = 0;
  private lastTime = 0;
  private animationId: number | null = null;
  private onUpdate: UpdateCallback | null = null;
  private onRender: RenderCallback | null = null;
  private onStateChange: ((state: SimulationState) => void) | null = null;

  constructor() {
    this.loop = this.loop.bind(this);
  }

  setCallbacks(
    onUpdate: UpdateCallback,
    onRender: RenderCallback,
    onStateChange?: (state: SimulationState) => void
  ): void {
    this.onUpdate = onUpdate;
    this.onRender = onRender;
    this.onStateChange = onStateChange || null;
  }

  start(): void {
    if (this.animationId !== null) return;
    this.lastTime = performance.now();
    this.animationId = requestAnimationFrame(this.loop);
  }

  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private loop(timestamp: number): void {
    this.animationId = requestAnimationFrame(this.loop);

    // Calculate delta time with spiral-of-death guard
    const rawDt = Math.min((timestamp - this.lastTime) / 1000, 0.2);
    this.lastTime = timestamp;

    if (!this.state.isPlaying) {
      // Still render when paused, just don't update simulation
      this.onRender?.(0);
      return;
    }

    // Apply speed multiplier
    const effectiveDt = rawDt * this.state.speed;
    this.accumulator += effectiveDt;

    // Fixed timestep updates
    while (this.accumulator >= FIXED_DT) {
      this.onUpdate?.(FIXED_DT, this.state.elapsed);
      this.state.elapsed += FIXED_DT;
      this.accumulator -= FIXED_DT;
    }

    // Render with interpolation alpha
    const alpha = this.accumulator / FIXED_DT;
    this.onRender?.(alpha);
  }

  play(): void {
    this.state.isPlaying = true;
    this.notifyStateChange();
  }

  pause(): void {
    this.state.isPlaying = false;
    this.notifyStateChange();
  }

  togglePlay(): void {
    if (this.state.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  setSpeed(speed: number): void {
    if (SPEED_OPTIONS.includes(speed)) {
      this.state.speed = speed;
      this.notifyStateChange();
    }
  }

  faster(): void {
    const idx = SPEED_OPTIONS.indexOf(this.state.speed);
    if (idx < SPEED_OPTIONS.length - 1) {
      this.state.speed = SPEED_OPTIONS[idx + 1];
      this.notifyStateChange();
    }
  }

  slower(): void {
    const idx = SPEED_OPTIONS.indexOf(this.state.speed);
    if (idx > 0) {
      this.state.speed = SPEED_OPTIONS[idx - 1];
      this.notifyStateChange();
    }
  }

  reset(): void {
    this.state.elapsed = 0;
    this.accumulator = 0;
    this.notifyStateChange();
  }

  getState(): SimulationState {
    return { ...this.state };
  }

  private notifyStateChange(): void {
    this.onStateChange?.({ ...this.state });
  }
}
