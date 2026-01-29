import { ScenarioRegistry } from '../scenarios/ScenarioRegistry';
import { router } from './Router';
import type { ScenarioMetadata } from '../core/types';

export class LandingPage {
  private container: HTMLElement;
  private grid: HTMLElement;

  constructor() {
    this.container = document.getElementById('landing')!;
    this.grid = document.getElementById('scenario-grid')!;
  }

  render(): void {
    this.grid.innerHTML = '';

    const scenarios = ScenarioRegistry.getAll();

    for (const entry of scenarios) {
      const card = this.createCard(entry.metadata);
      this.grid.appendChild(card);
    }
  }

  private createCard(metadata: ScenarioMetadata): HTMLElement {
    const card = document.createElement('article');
    card.className = 'scenario-card';
    card.setAttribute('data-scenario', metadata.id);

    card.innerHTML = `
      <div class="preview">
        <span class="placeholder">${this.getPlaceholderIcon(metadata.category)}</span>
      </div>
      <div class="content">
        <span class="badge ${metadata.category}">${metadata.category}</span>
        <h3>${metadata.title}</h3>
        <p>${metadata.subtitle}</p>
      </div>
    `;

    card.addEventListener('click', () => {
      router.navigate('simulation', metadata.id);
    });

    return card;
  }

  private getPlaceholderIcon(category: string): string {
    switch (category) {
      case 'living':
        return '🌿';
      case 'non-living':
        return '🏭';
      case 'abstract':
        return '📡';
      default:
        return '◆';
    }
  }

  show(): void {
    this.container.classList.remove('hidden');
  }

  hide(): void {
    this.container.classList.add('hidden');
  }
}
