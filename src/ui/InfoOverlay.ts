import type { ScenarioMetadata } from '../core/types';

export class InfoOverlay {
  private overlay: HTMLElement;
  private titleEl: HTMLElement;
  private bodyEl: HTMLElement;
  private btnToggle: HTMLElement;
  private isVisible = false;

  constructor() {
    this.overlay = document.getElementById('info-overlay')!;
    this.titleEl = document.getElementById('info-title')!;
    this.bodyEl = document.getElementById('info-body')!;
    this.btnToggle = document.getElementById('btn-info')!;

    this.btnToggle.addEventListener('click', () => this.toggle());
  }

  setContent(metadata: ScenarioMetadata): void {
    this.titleEl.textContent = metadata.infoContent.title;
    this.bodyEl.innerHTML = metadata.infoContent.body;
  }

  show(): void {
    this.isVisible = true;
    this.overlay.classList.remove('hidden');
  }

  hide(): void {
    this.isVisible = false;
    this.overlay.classList.add('hidden');
  }

  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }
}
