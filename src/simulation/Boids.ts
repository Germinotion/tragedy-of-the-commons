import * as THREE from 'three';

export interface BoidParams {
  separationWeight: number;
  alignmentWeight: number;
  cohesionWeight: number;
  separationRadius: number;
  perceptionRadius: number;
  maxSpeed: number;
  maxForce: number;
  boundarySize: number;
  boundaryForce: number;
}

export const DEFAULT_BOID_PARAMS: BoidParams = {
  separationWeight: 1.5,
  alignmentWeight: 1.0,
  cohesionWeight: 1.0,
  separationRadius: 2,
  perceptionRadius: 5,
  maxSpeed: 4,
  maxForce: 0.3,
  boundarySize: 30,
  boundaryForce: 0.5,
};

export interface Boid {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  acceleration: THREE.Vector3;
  alive: boolean;
}

/**
 * CPU-based boid simulation for WebGL2 fallback.
 * For WebGPU, we use compute shaders instead.
 */
export class BoidSystem {
  public boids: Boid[] = [];
  public params: BoidParams;
  private tempVec = new THREE.Vector3();
  private steer = new THREE.Vector3();

  constructor(params: Partial<BoidParams> = {}) {
    this.params = { ...DEFAULT_BOID_PARAMS, ...params };
  }

  setParams(params: Partial<BoidParams>): void {
    Object.assign(this.params, params);
  }

  spawn(count: number, bounds: THREE.Box3): void {
    const size = new THREE.Vector3();
    bounds.getSize(size);
    const center = new THREE.Vector3();
    bounds.getCenter(center);

    for (let i = 0; i < count; i++) {
      this.boids.push({
        position: new THREE.Vector3(
          center.x + (Math.random() - 0.5) * size.x,
          center.y + (Math.random() - 0.5) * size.y,
          center.z + (Math.random() - 0.5) * size.z
        ),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2
        ).multiplyScalar(this.params.maxSpeed * 0.5),
        acceleration: new THREE.Vector3(),
        alive: true,
      });
    }
  }

  remove(count: number): void {
    // Mark random boids as dead
    const aliveBoids = this.boids.filter((b) => b.alive);
    const toRemove = Math.min(count, aliveBoids.length);

    for (let i = 0; i < toRemove; i++) {
      const idx = Math.floor(Math.random() * aliveBoids.length);
      aliveBoids[idx].alive = false;
      aliveBoids.splice(idx, 1);
    }
  }

  update(dt: number): void {
    const { params, boids } = this;
    const aliveBoids = boids.filter((b) => b.alive);

    // Calculate forces for each boid
    for (const boid of aliveBoids) {
      boid.acceleration.set(0, 0, 0);

      const separation = this.calculateSeparation(boid, aliveBoids);
      const alignment = this.calculateAlignment(boid, aliveBoids);
      const cohesion = this.calculateCohesion(boid, aliveBoids);
      const boundary = this.calculateBoundary(boid);

      separation.multiplyScalar(params.separationWeight);
      alignment.multiplyScalar(params.alignmentWeight);
      cohesion.multiplyScalar(params.cohesionWeight);

      boid.acceleration.add(separation);
      boid.acceleration.add(alignment);
      boid.acceleration.add(cohesion);
      boid.acceleration.add(boundary);
    }

    // Apply physics
    for (const boid of aliveBoids) {
      boid.velocity.add(boid.acceleration.multiplyScalar(dt));

      // Limit speed
      if (boid.velocity.length() > params.maxSpeed) {
        boid.velocity.normalize().multiplyScalar(params.maxSpeed);
      }

      boid.position.add(this.tempVec.copy(boid.velocity).multiplyScalar(dt));
    }
  }

  private calculateSeparation(boid: Boid, others: Boid[]): THREE.Vector3 {
    this.steer.set(0, 0, 0);
    let count = 0;

    for (const other of others) {
      if (other === boid) continue;

      const d = boid.position.distanceTo(other.position);
      if (d > 0 && d < this.params.separationRadius) {
        this.tempVec
          .copy(boid.position)
          .sub(other.position)
          .normalize()
          .divideScalar(d);
        this.steer.add(this.tempVec);
        count++;
      }
    }

    if (count > 0) {
      this.steer.divideScalar(count);
      this.steer.normalize().multiplyScalar(this.params.maxSpeed);
      this.steer.sub(boid.velocity);
      this.limitForce(this.steer);
    }

    return this.steer.clone();
  }

  private calculateAlignment(boid: Boid, others: Boid[]): THREE.Vector3 {
    this.steer.set(0, 0, 0);
    let count = 0;

    for (const other of others) {
      if (other === boid) continue;

      const d = boid.position.distanceTo(other.position);
      if (d > 0 && d < this.params.perceptionRadius) {
        this.steer.add(other.velocity);
        count++;
      }
    }

    if (count > 0) {
      this.steer.divideScalar(count);
      this.steer.normalize().multiplyScalar(this.params.maxSpeed);
      this.steer.sub(boid.velocity);
      this.limitForce(this.steer);
    }

    return this.steer.clone();
  }

  private calculateCohesion(boid: Boid, others: Boid[]): THREE.Vector3 {
    this.steer.set(0, 0, 0);
    let count = 0;

    for (const other of others) {
      if (other === boid) continue;

      const d = boid.position.distanceTo(other.position);
      if (d > 0 && d < this.params.perceptionRadius) {
        this.steer.add(other.position);
        count++;
      }
    }

    if (count > 0) {
      this.steer.divideScalar(count);
      // Seek towards center of mass
      this.steer.sub(boid.position);
      this.steer.normalize().multiplyScalar(this.params.maxSpeed);
      this.steer.sub(boid.velocity);
      this.limitForce(this.steer);
    }

    return this.steer.clone();
  }

  private calculateBoundary(boid: Boid): THREE.Vector3 {
    this.steer.set(0, 0, 0);
    const { boundarySize, boundaryForce } = this.params;

    // Push boids back towards center if they stray too far
    if (Math.abs(boid.position.x) > boundarySize) {
      this.steer.x = -Math.sign(boid.position.x) * boundaryForce;
    }
    if (Math.abs(boid.position.y) > boundarySize) {
      this.steer.y = -Math.sign(boid.position.y) * boundaryForce;
    }
    if (Math.abs(boid.position.z) > boundarySize) {
      this.steer.z = -Math.sign(boid.position.z) * boundaryForce;
    }

    return this.steer.clone();
  }

  private limitForce(force: THREE.Vector3): void {
    if (force.length() > this.params.maxForce) {
      force.normalize().multiplyScalar(this.params.maxForce);
    }
  }

  getCount(): number {
    return this.boids.filter((b) => b.alive).length;
  }

  reset(): void {
    this.boids = [];
  }

  getPositions(): Float32Array {
    const alive = this.boids.filter((b) => b.alive);
    const positions = new Float32Array(alive.length * 3);

    for (let i = 0; i < alive.length; i++) {
      positions[i * 3] = alive[i].position.x;
      positions[i * 3 + 1] = alive[i].position.y;
      positions[i * 3 + 2] = alive[i].position.z;
    }

    return positions;
  }

  getVelocities(): Float32Array {
    const alive = this.boids.filter((b) => b.alive);
    const velocities = new Float32Array(alive.length * 3);

    for (let i = 0; i < alive.length; i++) {
      velocities[i * 3] = alive[i].velocity.x;
      velocities[i * 3 + 1] = alive[i].velocity.y;
      velocities[i * 3 + 2] = alive[i].velocity.z;
    }

    return velocities;
  }
}
