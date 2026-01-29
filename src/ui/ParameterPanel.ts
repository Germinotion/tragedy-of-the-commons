import GUI from 'lil-gui';
import type { Scenario } from '../core/types';

export class ParameterPanel {
  private container: HTMLElement;
  private gui: GUI | null = null;

  constructor() {
    this.container = document.getElementById('param-panel')!;
  }

  bind(scenario: Scenario): void {
    this.dispose();
    this.gui = new GUI({ container: this.container, autoPlace: false });
    this.gui.title('Parameters');

    const descriptors = scenario.getParamDescriptors();
    const params = scenario.getParams();
    const folders: Map<string, GUI> = new Map();

    for (const desc of descriptors) {
      const target = desc.folder ? this.getOrCreateFolder(folders, desc.folder) : this.gui;

      if (desc.type === 'number') {
        target
          .add(params, desc.key, desc.min, desc.max, desc.step)
          .name(desc.label)
          .onChange((value: number) => {
            scenario.setParam(desc.key, value);
          });
      } else if (desc.type === 'boolean') {
        target
          .add(params, desc.key)
          .name(desc.label)
          .onChange((value: boolean) => {
            scenario.setParam(desc.key, value);
          });
      } else if (desc.type === 'select' && desc.options) {
        const selectObj = { [desc.key]: params[desc.key] };
        const options = desc.options.reduce(
          (acc, opt) => {
            acc[opt.label] = opt.value;
            return acc;
          },
          {} as Record<string, string | number>
        );

        target
          .add(selectObj, desc.key, options)
          .name(desc.label)
          .onChange((value: string | number) => {
            scenario.setParam(desc.key, value);
          });
      }
    }
  }

  private getOrCreateFolder(folders: Map<string, GUI>, name: string): GUI {
    if (folders.has(name)) {
      return folders.get(name)!;
    }

    const folder = this.gui!.addFolder(name);
    folders.set(name, folder);
    return folder;
  }

  dispose(): void {
    if (this.gui) {
      this.gui.destroy();
      this.gui = null;
    }
  }
}
