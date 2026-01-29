import uPlot from 'uplot';
import type { ChartDescriptor } from '../core/types';

interface ChartInstance {
  chart: uPlot;
  data: number[][];
  maxPoints: number;
}

export class ChartPanel {
  private container: HTMLElement;
  private charts: Map<string, ChartInstance> = new Map();
  private lastUpdate = 0;
  private updateInterval = 1000 / 30; // 30 Hz chart updates

  constructor() {
    this.container = document.getElementById('chart-panel')!;
  }

  init(descriptors: ChartDescriptor[]): void {
    this.dispose();
    this.container.innerHTML = '';

    // Add uPlot CSS
    if (!document.getElementById('uplot-css')) {
      const link = document.createElement('link');
      link.id = 'uplot-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/uplot@1.6.31/dist/uPlot.min.css';
      document.head.appendChild(link);
    }

    for (const desc of descriptors) {
      const wrapper = document.createElement('div');
      wrapper.className = 'chart-wrapper';
      wrapper.id = `chart-${desc.id}`;
      this.container.appendChild(wrapper);

      const maxPoints = 300; // 10 seconds at 30Hz
      const seriesCount = desc.series.length + 1; // +1 for time axis

      // Initialize data arrays
      const data: number[][] = Array.from({ length: seriesCount }, () => []);

      const series: uPlot.Series[] = [
        { label: 'Time' },
        ...desc.series.map((s) => ({
          label: s.label,
          stroke: s.color,
          width: 2,
        })),
      ];

      const opts: uPlot.Options = {
        title: desc.title,
        width: 256,
        height: 120,
        series,
        scales: {
          x: { time: false },
          y: desc.yRange
            ? { range: desc.yRange }
            : { auto: true },
        },
        axes: [
          { show: false },
          {
            size: 40,
            stroke: '#606070',
            grid: { stroke: 'rgba(255,255,255,0.05)' },
          },
        ],
        cursor: { show: false },
        legend: { show: true },
      };

      const chart = new uPlot(opts, data as uPlot.AlignedData, wrapper);

      this.charts.set(desc.id, {
        chart,
        data,
        maxPoints,
      });
    }

    // Handle resize
    window.addEventListener('resize', this.handleResize.bind(this));
  }

  private handleResize(): void {
    for (const instance of this.charts.values()) {
      const parent = instance.chart.root.parentElement;
      if (parent) {
        instance.chart.setSize({
          width: parent.clientWidth,
          height: 120,
        });
      }
    }
  }

  pushMetrics(metrics: Record<string, number>, elapsed: number): void {
    const now = performance.now();
    if (now - this.lastUpdate < this.updateInterval) return;
    this.lastUpdate = now;

    for (const [id, instance] of this.charts) {
      const { data, maxPoints, chart } = instance;

      // Push time
      data[0].push(elapsed);

      // Push metric values
      for (let i = 1; i < data.length; i++) {
        const seriesLabel = chart.series[i].label;
        const metricKey = typeof seriesLabel === 'string'
          ? seriesLabel.toLowerCase().replace(/\s+/g, '_')
          : '';
        const value = metrics[metricKey] ?? metrics[id] ?? 0;
        data[i].push(value);
      }

      // Trim to max points
      if (data[0].length > maxPoints) {
        for (const arr of data) {
          arr.shift();
        }
      }

      chart.setData(data as uPlot.AlignedData);
    }
  }

  reset(): void {
    for (const instance of this.charts.values()) {
      for (const arr of instance.data) {
        arr.length = 0;
      }
      instance.chart.setData(instance.data as uPlot.AlignedData);
    }
  }

  dispose(): void {
    window.removeEventListener('resize', this.handleResize.bind(this));
    for (const instance of this.charts.values()) {
      instance.chart.destroy();
    }
    this.charts.clear();
  }
}
