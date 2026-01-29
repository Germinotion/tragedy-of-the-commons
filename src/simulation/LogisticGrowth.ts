/**
 * Logistic growth model: dN/dt = rN(1 - N/K)
 *
 * @param N - Current population/resource level
 * @param r - Intrinsic growth rate
 * @param K - Carrying capacity
 * @returns Rate of change (dN/dt)
 */
export function logisticGrowthRate(N: number, r: number, K: number): number {
  return r * N * (1 - N / K);
}

/**
 * Calculate new population after one timestep using Euler method.
 *
 * @param N - Current population
 * @param r - Growth rate
 * @param K - Carrying capacity
 * @param dt - Time step
 * @returns New population value
 */
export function logisticGrowthStep(N: number, r: number, K: number, dt: number): number {
  const dN = logisticGrowthRate(N, r, K) * dt;
  return Math.max(0, Math.min(K, N + dN));
}

/**
 * Calculate equilibrium population (where growth = consumption).
 *
 * @param r - Growth rate
 * @param K - Carrying capacity
 * @param consumptionRate - Total consumption rate
 * @returns Equilibrium population (may be negative if consumption > max growth)
 */
export function equilibriumPopulation(
  r: number,
  K: number,
  consumptionRate: number
): number {
  // At equilibrium: rN(1 - N/K) = consumptionRate
  // This is a quadratic: rN - rN²/K = C
  // Solving: N = (K/2) ± sqrt((K/2)² - CK/r)

  const maxGrowth = (r * K) / 4; // Maximum sustainable yield at N = K/2

  if (consumptionRate > maxGrowth) {
    return -1; // Collapse inevitable
  }

  const discriminant = (K / 2) ** 2 - (consumptionRate * K) / r;
  if (discriminant < 0) return -1;

  // Return the higher equilibrium (stable one)
  return K / 2 + Math.sqrt(discriminant);
}

/**
 * Grid-based logistic growth for spatial simulations.
 * Each cell grows independently.
 */
export class LogisticGrid {
  public readonly width: number;
  public readonly height: number;
  public data: Float32Array;
  private r: number;
  private K: number;

  constructor(width: number, height: number, r: number, K: number) {
    this.width = width;
    this.height = height;
    this.r = r;
    this.K = K;
    this.data = new Float32Array(width * height);
    this.data.fill(K); // Start at carrying capacity
  }

  setParams(r: number, K: number): void {
    this.r = r;
    this.K = K;
  }

  get(x: number, y: number): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;
    return this.data[y * this.width + x];
  }

  set(x: number, y: number, value: number): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    this.data[y * this.width + x] = Math.max(0, Math.min(this.K, value));
  }

  consume(x: number, y: number, amount: number): number {
    const idx = y * this.width + x;
    if (idx < 0 || idx >= this.data.length) return 0;

    const current = this.data[idx];
    const consumed = Math.min(current, amount);
    this.data[idx] = current - consumed;
    return consumed;
  }

  update(dt: number): void {
    for (let i = 0; i < this.data.length; i++) {
      this.data[i] = logisticGrowthStep(this.data[i], this.r, this.K, dt);
    }
  }

  reset(): void {
    this.data.fill(this.K);
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
}
