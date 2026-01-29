export type Route = 'landing' | 'simulation';

export interface RouteChangeEvent {
  route: Route;
  scenarioId?: string;
}

type RouteChangeCallback = (event: RouteChangeEvent) => void;

class HashRouter {
  private listeners: RouteChangeCallback[] = [];

  constructor() {
    window.addEventListener('hashchange', this.handleHashChange.bind(this));
  }

  private handleHashChange(): void {
    const event = this.parseHash();
    this.notifyListeners(event);
  }

  private parseHash(): RouteChangeEvent {
    const hash = window.location.hash.slice(1); // Remove #

    if (hash.startsWith('scenario/')) {
      const scenarioId = hash.slice('scenario/'.length);
      return { route: 'simulation', scenarioId };
    }

    return { route: 'landing' };
  }

  private notifyListeners(event: RouteChangeEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  getCurrentRoute(): RouteChangeEvent {
    return this.parseHash();
  }

  navigate(route: Route, scenarioId?: string): void {
    if (route === 'simulation' && scenarioId) {
      window.location.hash = `scenario/${scenarioId}`;
    } else {
      window.location.hash = '';
    }
  }

  onRouteChange(callback: RouteChangeCallback): () => void {
    this.listeners.push(callback);
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }
}

export const router = new HashRouter();
