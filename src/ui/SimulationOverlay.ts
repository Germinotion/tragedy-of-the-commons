import { App } from '../core/App';
import { ParameterPanel } from './ParameterPanel';
import { ChartPanel } from './ChartPanel';
import { TimeControls } from './TimeControls';
import { InfoOverlay } from './InfoOverlay';
import { router } from './Router';
import type { Scenario } from '../core/types';

export class SimulationOverlay {
  private container: HTMLElement;
  private titleEl: HTMLElement;
  private btnBack: HTMLElement;
  private btnCollapseLeft: HTMLElement;
  private btnCollapseRight: HTMLElement;
  private panelLeft: HTMLElement;
  private panelRight: HTMLElement;

  private parameterPanel: ParameterPanel;
  private chartPanel: ChartPanel;
  private timeControls: TimeControls;
  private infoOverlay: InfoOverlay;

  constructor() {
    this.container = document.getElementById('simulation')!;
    this.titleEl = document.getElementById('scenario-title')!;
    this.btnBack = document.getElementById('btn-back')!;
    this.btnCollapseLeft = document.getElementById('btn-collapse-left')!;
    this.btnCollapseRight = document.getElementById('btn-collapse-right')!;
    this.panelLeft = document.getElementById('panel-left')!;
    this.panelRight = document.getElementById('panel-right')!;

    this.parameterPanel = new ParameterPanel();
    this.chartPanel = new ChartPanel();
    this.timeControls = new TimeControls();
    this.infoOverlay = new InfoOverlay();

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.btnBack.addEventListener('click', () => {
      router.navigate('landing');
    });

    this.btnCollapseLeft.addEventListener('click', () => {
      this.panelLeft.classList.toggle('collapsed');
      this.btnCollapseLeft.textContent = this.panelLeft.classList.contains('collapsed')
        ? '›'
        : '‹';
    });

    this.btnCollapseRight.addEventListener('click', () => {
      this.panelRight.classList.toggle('collapsed');
      this.btnCollapseRight.textContent = this.panelRight.classList.contains('collapsed')
        ? '‹'
        : '›';
    });
  }

  bind(app: App): void {
    this.timeControls.bind(app);

    app.onMetricsUpdate = (metrics) => {
      const state = app.getState();
      this.chartPanel.pushMetrics(metrics, state.elapsed);
    };
  }

  loadScenario(scenario: Scenario): void {
    // Set title
    this.titleEl.textContent = scenario.metadata.title;

    // Set info content
    this.infoOverlay.setContent(scenario.metadata);
    this.infoOverlay.hide();

    // Bind parameter panel
    this.parameterPanel.bind(scenario);

    // Initialize charts
    this.chartPanel.init(scenario.getChartDescriptors());

    // Ensure panels are visible
    this.panelLeft.classList.remove('collapsed');
    this.panelRight.classList.remove('collapsed');
    this.btnCollapseLeft.textContent = '‹';
    this.btnCollapseRight.textContent = '›';
  }

  show(): void {
    this.container.classList.remove('hidden');
  }

  hide(): void {
    this.container.classList.add('hidden');
    this.infoOverlay.hide();
  }

  dispose(): void {
    this.parameterPanel.dispose();
    this.chartPanel.dispose();
  }
}
