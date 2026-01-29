import type { Scenario, ScenarioMetadata } from '../core/types';

export interface ScenarioEntry {
  metadata: ScenarioMetadata;
  create: () => Scenario;
}

class Registry {
  private scenarios: Map<string, ScenarioEntry> = new Map();

  register(entry: ScenarioEntry): void {
    this.scenarios.set(entry.metadata.id, entry);
  }

  get(id: string): ScenarioEntry | undefined {
    return this.scenarios.get(id);
  }

  getAll(): ScenarioEntry[] {
    return Array.from(this.scenarios.values());
  }

  create(id: string): Scenario | undefined {
    const entry = this.scenarios.get(id);
    return entry?.create();
  }
}

export const ScenarioRegistry = new Registry();
