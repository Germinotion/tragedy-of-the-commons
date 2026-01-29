import type {
  Scenario,
  ScenarioMetadata,
  SimulationContext,
  ParamDescriptor,
  ChartDescriptor,
  CameraPreset,
} from '../core/types';

export abstract class ScenarioBase implements Scenario {
  abstract readonly metadata: ScenarioMetadata;

  protected context!: SimulationContext;
  protected params: Record<string, number | boolean | string> = {};

  async init(context: SimulationContext): Promise<void> {
    this.context = context;

    // Initialize params with defaults
    for (const descriptor of this.getParamDescriptors()) {
      this.params[descriptor.key] = descriptor.default;
    }

    await this.setup();
  }

  protected abstract setup(): Promise<void>;

  abstract update(dt: number, elapsed: number): void;

  abstract render(alpha: number): void;

  abstract getMetrics(): Record<string, number>;

  abstract getParamDescriptors(): ParamDescriptor[];

  abstract getChartDescriptors(): ChartDescriptor[];

  abstract getCameraPresets(): CameraPreset[];

  abstract reset(): void;

  abstract dispose(): void;

  getParams(): Record<string, number | boolean | string> {
    return { ...this.params };
  }

  setParam(key: string, value: number | boolean | string): void {
    if (key in this.params) {
      this.params[key] = value;
      this.onParamChange(key, value);
    }
  }

  protected onParamChange(_key: string, _value: number | boolean | string): void {
    // Override in subclasses to react to parameter changes
  }
}
