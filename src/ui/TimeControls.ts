import type { App } from '../core/App';
import type { SimulationState } from '../core/types';

export class TimeControls {
  private btnPlay: HTMLElement;
  private btnFaster: HTMLElement;
  private btnSlower: HTMLElement;
  private btnReset: HTMLElement;
  private speedDisplay: HTMLElement;
  private app: App | null = null;

  constructor() {
    this.btnPlay = document.getElementById('btn-play')!;
    this.btnFaster = document.getElementById('btn-faster')!;
    this.btnSlower = document.getElementById('btn-slower')!;
    this.btnReset = document.getElementById('btn-reset')!;
    this.speedDisplay = document.getElementById('speed-display')!;

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.btnPlay.addEventListener('click', () => {
      this.app?.togglePlay();
    });

    this.btnFaster.addEventListener('click', () => {
      this.app?.faster();
    });

    this.btnSlower.addEventListener('click', () => {
      this.app?.slower();
    });

    this.btnReset.addEventListener('click', () => {
      this.app?.reset();
    });
  }

  bind(app: App): void {
    this.app = app;
    app.onStateChange = this.updateUI.bind(this);
    this.updateUI(app.getState());
  }

  updateUI(state: SimulationState): void {
    // Update play/pause button
    if (state.isPlaying) {
      this.btnPlay.innerHTML = '⏸';
      this.btnPlay.classList.remove('paused');
    } else {
      this.btnPlay.innerHTML = '▶';
      this.btnPlay.classList.add('paused');
    }

    // Update speed display
    this.speedDisplay.textContent = `${state.speed}x`;
  }
}
