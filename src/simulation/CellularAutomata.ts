/**
 * Cellular automata grid for wear/recovery simulations.
 * Values range from 0 (fully worn) to 1 (pristine).
 */
export class WearGrid {
  public readonly width: number;
  public readonly height: number;
  public data: Float32Array;
  private recoveryRate: number;
  private durability: number;

  constructor(
    width: number,
    height: number,
    recoveryRate: number = 0.01,
    durability: number = 0.1
  ) {
    this.width = width;
    this.height = height;
    this.recoveryRate = recoveryRate;
    this.durability = durability;
    this.data = new Float32Array(width * height);
    this.data.fill(1); // Start pristine
  }

  setParams(recoveryRate: number, durability: number): void {
    this.recoveryRate = recoveryRate;
    this.durability = durability;
  }

  get(x: number, y: number): number {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 1;
    return this.data[y * this.width + x];
  }

  getInterpolated(x: number, y: number): number {
    // Bilinear interpolation for smooth sampling
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, this.width - 1);
    const y1 = Math.min(y0 + 1, this.height - 1);

    const fx = x - x0;
    const fy = y - y0;

    const v00 = this.get(x0, y0);
    const v10 = this.get(x1, y0);
    const v01 = this.get(x0, y1);
    const v11 = this.get(x1, y1);

    const v0 = v00 * (1 - fx) + v10 * fx;
    const v1 = v01 * (1 - fx) + v11 * fx;

    return v0 * (1 - fy) + v1 * fy;
  }

  /**
   * Apply wear at a position (reduces health).
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param amount - Wear amount (before durability)
   */
  wear(x: number, y: number, amount: number = 1): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;

    const idx = y * this.width + x;
    const wearAmount = amount / this.durability;
    this.data[idx] = Math.max(0, this.data[idx] - wearAmount);
  }

  /**
   * Apply wear in a radius (gaussian falloff).
   */
  wearRadius(cx: number, cy: number, radius: number, amount: number = 1): void {
    const r = Math.ceil(radius);
    const r2 = radius * radius;

    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;

        const falloff = 1 - d2 / r2;
        this.wear(Math.floor(cx) + dx, Math.floor(cy) + dy, amount * falloff);
      }
    }
  }

  /**
   * Update grid - apply recovery to all cells.
   */
  update(dt: number): void {
    const recovery = this.recoveryRate * dt;

    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i] < 1) {
        this.data[i] = Math.min(1, this.data[i] + recovery);
      }
    }
  }

  reset(): void {
    this.data.fill(1);
  }

  /**
   * Get cost for pathfinding (lower health = lower cost).
   * People prefer worn paths.
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param shortcutTendency - 0 = follow sidewalks, 1 = always cut corners
   * @returns Cost value for A* (1 = worn path, higher = pristine grass)
   */
  getPathCost(x: number, y: number, shortcutTendency: number = 0.5): number {
    const health = this.get(x, y);
    // Worn paths (low health) have low cost
    // Pristine areas (high health) have high cost
    const baseCost = 1 + health * 10;
    return baseCost * (1 - shortcutTendency * 0.8);
  }

  getAverageHealth(): number {
    let total = 0;
    for (let i = 0; i < this.data.length; i++) {
      total += this.data[i];
    }
    return total / this.data.length;
  }

  getWornPercentage(threshold: number = 0.5): number {
    let worn = 0;
    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i] < threshold) worn++;
    }
    return worn / this.data.length;
  }
}
