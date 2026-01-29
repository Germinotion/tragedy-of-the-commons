import { App } from './core/App';
import { LandingPage } from './ui/LandingPage';
import { SimulationOverlay } from './ui/SimulationOverlay';
import { router } from './ui/Router';
import { ScenarioRegistry } from './scenarios/ScenarioRegistry';
import './style.css';

// Import all scenarios (they self-register)
import './scenarios/grazing';
import './scenarios/overfishing';
import './scenarios/desire-paths';
import './scenarios/pollution';
import './scenarios/bandwidth';

class Application {
  private app: App | null = null;
  private landingPage: LandingPage;
  private simulationOverlay: SimulationOverlay;
  private canvasContainer: HTMLElement;

  constructor() {
    this.canvasContainer = document.getElementById('canvas-container')!;
    this.landingPage = new LandingPage();
    this.simulationOverlay = new SimulationOverlay();

    this.setupRouter();
  }

  private setupRouter(): void {
    router.onRouteChange(async (event) => {
      if (event.route === 'landing') {
        await this.showLanding();
      } else if (event.route === 'simulation' && event.scenarioId) {
        await this.showSimulation(event.scenarioId);
      }
    });
  }

  async init(): Promise<void> {
    // Render landing page
    this.landingPage.render();

    // Check initial route
    const currentRoute = router.getCurrentRoute();
    if (currentRoute.route === 'simulation' && currentRoute.scenarioId) {
      await this.showSimulation(currentRoute.scenarioId);
    } else {
      await this.showLanding();
    }
  }

  private async showLanding(): Promise<void> {
    // Stop and cleanup current simulation if any
    if (this.app) {
      this.app.stop();
    }

    this.simulationOverlay.hide();
    this.landingPage.show();
  }

  private async showSimulation(scenarioId: string): Promise<void> {
    // Get scenario from registry
    const scenario = ScenarioRegistry.create(scenarioId);
    if (!scenario) {
      console.error(`Scenario not found: ${scenarioId}`);
      router.navigate('landing');
      return;
    }

    // Initialize app if needed
    if (!this.app) {
      const canvas = document.createElement('canvas');
      this.canvasContainer.appendChild(canvas);
      this.app = new App(canvas);
      await this.app.init();
      this.simulationOverlay.bind(this.app);
    }

    // Load scenario
    await this.app.loadScenario(scenario);

    // Update UI
    this.simulationOverlay.loadScenario(scenario);

    // Show simulation view
    this.landingPage.hide();
    this.simulationOverlay.show();

    // Start simulation
    this.app.start();
  }
}

// Bootstrap
const application = new Application();
application.init().catch(console.error);
