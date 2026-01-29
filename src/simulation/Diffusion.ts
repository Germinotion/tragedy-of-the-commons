/**
 * 2D diffusion equation solver: ∂c/∂t = D∇²c - αc + S
 *
 * - D: Diffusion constant (spread rate)
 * - α: Absorption/decay rate (natural cleanup)
 * - S: Source term (emissions)
 */
export class DiffusionGrid {
  public readonly width: number;
  public readonly height: number;
  public data: Float32Array;
  private buffer: Float32Array;
  private D: number;
  private absorption: number;

  constructor(
    width: number,
    height: number,
    D: number = 0.1,
    absorption: number = 0.01
  ) {
    this.width = width;
    this.height = height;
    this.D = D;
    this.absorption = absorption;
    this.data = new Float32Array(width * height);
    this.buffer = new Float32Array(width * height);
  }

  setParams(D: number, absorption: number): void {
    this.D = D;
    this.absorption = absorption;
  }

  get(x: number, y: number): number {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;
    return this.data[y * this.width + x];
  }

  getInterpolated(x: number, y: number): number {
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
   * Add emission source at position.
   */
  emit(x: number, y: number, amount: number): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;

    const idx = y * this.width + x;
    this.data[idx] = Math.min(1, this.data[idx] + amount);
  }

  /**
   * Add emission in a radius (gaussian).
   */
  emitRadius(cx: number, cy: number, radius: number, amount: number): void {
    const r = Math.ceil(radius);
    const r2 = radius * radius;

    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;

        const falloff = Math.exp(-d2 / (r2 * 0.5));
        this.emit(Math.floor(cx) + dx, Math.floor(cy) + dy, amount * falloff);
      }
    }
  }

  /**
   * Update diffusion simulation.
   *
   * @param dt - Time step
   * @param windX - Wind velocity X component
   * @param windY - Wind velocity Y component
   */
  update(dt: number, windX: number = 0, windY: number = 0): void {
    const { width, height, data, buffer, D, absorption } = this;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const c = data[idx];

        // Get neighbors (with boundary handling)
        const cL = x > 0 ? data[idx - 1] : c;
        const cR = x < width - 1 ? data[idx + 1] : c;
        const cT = y > 0 ? data[idx - width] : c;
        const cB = y < height - 1 ? data[idx + width] : c;

        // Laplacian (discrete second derivative)
        const laplacian = cL + cR + cT + cB - 4 * c;

        // Advection (wind transport) - upwind scheme
        let advectionX = 0;
        let advectionY = 0;

        if (windX > 0) {
          advectionX = windX * (c - cL);
        } else {
          advectionX = windX * (cR - c);
        }

        if (windY > 0) {
          advectionY = windY * (c - cT);
        } else {
          advectionY = windY * (cB - c);
        }

        // Update: diffusion + absorption + advection
        const dcdt = D * laplacian - absorption * c - (advectionX + advectionY);
        buffer[idx] = Math.max(0, Math.min(1, c + dcdt * dt));
      }
    }

    // Swap buffers
    this.data.set(buffer);
  }

  reset(): void {
    this.data.fill(0);
    this.buffer.fill(0);
  }

  getTotal(): number {
    let total = 0;
    for (let i = 0; i < this.data.length; i++) {
      total += this.data[i];
    }
    return total;
  }

  getAverage(): number {
    return this.getTotal() / this.data.length;
  }

  getMax(): number {
    let max = 0;
    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i] > max) max = this.data[i];
    }
    return max;
  }
}
