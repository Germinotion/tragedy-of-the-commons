import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ScenarioBase } from '../ScenarioBase';
import { ScenarioRegistry } from '../ScenarioRegistry';
import { BoidSystem } from '../../simulation/Boids';
import { logisticGrowthStep } from '../../simulation/LogisticGrowth';
import type {
  ScenarioMetadata,
  ParamDescriptor,
  ChartDescriptor,
  CameraPreset,
} from '../../core/types';

interface Boat {
  id: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  catchCount: number;
  mesh: THREE.Group | null;
}

export class OverfishingScenario extends ScenarioBase {
  readonly metadata: ScenarioMetadata = {
    id: 'overfishing',
    title: 'Overfishing',
    subtitle: 'Fishing boats deplete shared ocean stocks',
    description:
      'Fishing boats compete for fish in shared waters. Fish reproduce but overfishing can collapse the population.',
    category: 'living',
    color: '#4a9eff',
    infoContent: {
      title: 'Ocean Commons',
      body: `
        <p>The ocean is a classic "open-access" commons. No one owns the fish until they're caught.</p>
        <p>Each boat captain faces the same dilemma:</p>
        <ul>
          <li>If I don't catch this fish, someone else will</li>
          <li>Reducing my catch only helps my competitors</li>
          <li>The rational choice is to fish as much as possible</li>
        </ul>
        <p><strong>Watch for:</strong> The "tragedy" occurs when total catch rate exceeds the fish reproduction rate, leading to population collapse.</p>
      `,
    },
  };

  // Simulation state
  private boidSystem!: BoidSystem;
  private fishPopulation = 0;
  private fishCapacity = 0;
  private boats: Boat[] = [];
  private nextBoatId = 0;

  // Visual elements
  private fishInstances!: THREE.InstancedMesh;
  private oceanMesh!: THREE.Mesh;
  private boatGroup = new THREE.Group();
  private fishDummy = new THREE.Object3D();
  private fishColor = new THREE.Color();

  // Metrics
  private totalCatch = 0;
  private catchRate = 0;

  // Loaded models
  private boatModel: THREE.Group | null = null;

  protected async setup(): Promise<void> {
    // Load boat model
    await this.loadBoatModel();
    this.fishCapacity = this.params.fishCapacity as number;
    this.fishPopulation = this.fishCapacity * 0.8;

    // Initialize boid system for fish
    this.boidSystem = new BoidSystem({
      maxSpeed: this.params.fishSpeed as number,
      boundarySize: 25,
      separationRadius: 1.5,
      perceptionRadius: 4,
    });

    // Spawn initial fish
    const bounds = new THREE.Box3(
      new THREE.Vector3(-20, -8, -20),
      new THREE.Vector3(20, -2, 20)
    );
    this.boidSystem.spawn(Math.floor(this.fishPopulation), bounds);

    // Create ocean
    this.createOcean();

    // Create fish instances
    this.createFishInstances();

    // Create initial boats
    this.createBoats();

    // Add boat group to scene
    this.context.scene.add(this.boatGroup);

    // Setup lighting
    this.setupLighting();
  }

  private createOcean(): void {
    const geometry = new THREE.PlaneGeometry(60, 60, 128, 128);

    // Gerstner-like wave deformation will be in render()
    const material = new THREE.MeshStandardMaterial({
      color: 0x006994,
      roughness: 0.3,
      metalness: 0.1,
      transparent: true,
      opacity: 0.85,
    });

    this.oceanMesh = new THREE.Mesh(geometry, material);
    this.oceanMesh.rotation.x = -Math.PI / 2;
    this.oceanMesh.position.y = 0;
    this.oceanMesh.receiveShadow = true;
    this.context.scene.add(this.oceanMesh);

    // Ocean floor
    const floorGeometry = new THREE.PlaneGeometry(60, 60);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a3a4a,
      roughness: 0.9,
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -12;
    this.context.scene.add(floor);
  }

  private createFishInstances(): void {
    // Simple fish shape using cone
    const fishGeometry = new THREE.ConeGeometry(0.15, 0.5, 6);
    fishGeometry.rotateZ(-Math.PI / 2);

    const fishMaterial = new THREE.MeshStandardMaterial({
      color: 0xffa500,
      roughness: 0.5,
    });

    const maxFish = 5000; // CPU boids limit
    this.fishInstances = new THREE.InstancedMesh(
      fishGeometry,
      fishMaterial,
      maxFish
    );
    this.fishInstances.count = 0;
    this.context.scene.add(this.fishInstances);
  }

  private updateFishInstances(): void {
    const boids = this.boidSystem.boids.filter((b) => b.alive);
    this.fishInstances.count = boids.length;

    for (let i = 0; i < boids.length; i++) {
      const boid = boids[i];
      this.fishDummy.position.copy(boid.position);

      // Orient fish along velocity
      if (boid.velocity.length() > 0.1) {
        this.fishDummy.lookAt(
          boid.position.x + boid.velocity.x,
          boid.position.y + boid.velocity.y,
          boid.position.z + boid.velocity.z
        );
      }

      this.fishDummy.updateMatrix();
      this.fishInstances.setMatrixAt(i, this.fishDummy.matrix);

      // Vary fish color slightly
      const hue = 0.08 + (i % 10) * 0.01;
      this.fishColor.setHSL(hue, 0.8, 0.5);
      this.fishInstances.setColorAt(i, this.fishColor);
    }

    this.fishInstances.instanceMatrix.needsUpdate = true;
    if (this.fishInstances.instanceColor) {
      this.fishInstances.instanceColor.needsUpdate = true;
    }
  }

  private createBoats(): void {
    const boatCount = this.params.boatCount as number;
    for (let i = 0; i < boatCount; i++) {
      this.spawnBoat();
    }
  }

  private spawnBoat(): Boat {
    const angle = Math.random() * Math.PI * 2;
    const radius = 10 + Math.random() * 15;

    const boat: Boat = {
      id: this.nextBoatId++,
      position: new THREE.Vector3(Math.cos(angle) * radius, 0.5, Math.sin(angle) * radius),
      velocity: new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2),
      catchCount: 0,
      mesh: null,
    };

    let group: THREE.Group;

    if (this.boatModel) {
      // Use loaded GLB model
      group = this.boatModel.clone();
      group.position.copy(boat.position);
    } else {
      // Fallback to simple boat mesh
      const hull = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.5, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x8b4513 })
      );
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.4, 0.5),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
      );
      cabin.position.set(-0.3, 0.35, 0);

      group = new THREE.Group();
      group.add(hull);
      group.add(cabin);
      group.position.copy(boat.position);
      group.castShadow = true;
    }

    this.boatGroup.add(group);
    boat.mesh = group;
    this.boats.push(boat);

    return boat;
  }

  private async loadBoatModel(): Promise<void> {
    const loader = new GLTFLoader();
    try {
      const gltf = await loader.loadAsync('/assets/models/pirate-kit/Models/GLB format/boat-row-small.glb');
      this.boatModel = gltf.scene;
      this.boatModel.scale.setScalar(1.5);
      // Make materials brighter
      this.boatModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
    } catch (err) {
      console.warn('Failed to load boat model, using fallback:', err);
    }
  }

  private setupLighting(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.context.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(20, 30, 10);
    sun.castShadow = true;
    this.context.scene.add(sun);

    // Blue-ish fog for underwater feel
    this.context.scene.fog = new THREE.FogExp2(0x006994, 0.02);
    this.context.scene.background = new THREE.Color(0x87ceeb);
  }

  update(dt: number, elapsed: number): void {
    const reproductionRate = this.params.fishReproductionRate as number;
    const catchRadius = this.params.catchRadius as number;
    const catchPerBoat = this.params.catchRate as number;

    // Update boid simulation
    this.boidSystem.setParams({
      maxSpeed: this.params.fishSpeed as number,
    });
    this.boidSystem.update(dt);

    // Fish population dynamics (logistic growth)
    const currentCount = this.boidSystem.getCount();
    const targetPopulation = logisticGrowthStep(
      currentCount,
      reproductionRate,
      this.params.fishCapacity as number,
      dt
    );

    // Spawn new fish if population should grow
    const toSpawn = Math.floor(targetPopulation - currentCount);
    if (toSpawn > 0) {
      const spawnBounds = new THREE.Box3(
        new THREE.Vector3(-20, -8, -20),
        new THREE.Vector3(20, -2, 20)
      );
      this.boidSystem.spawn(Math.min(toSpawn, 10), spawnBounds);
    }

    // Update boats and fishing
    this.catchRate = 0;
    for (const boat of this.boats) {
      this.updateBoat(boat, dt, catchRadius, catchPerBoat, elapsed);
    }

    // Adjust boat count to match parameter
    const targetBoats = this.params.boatCount as number;
    while (this.boats.length < targetBoats) {
      this.spawnBoat();
    }
    while (this.boats.length > targetBoats) {
      const boat = this.boats.pop()!;
      if (boat.mesh) this.boatGroup.remove(boat.mesh);
    }

    // Update metrics
    this.fishPopulation = this.boidSystem.getCount();
  }

  private updateBoat(
    boat: Boat,
    dt: number,
    catchRadius: number,
    catchRate: number,
    _elapsed: number
  ): void {
    // Find nearest fish cluster
    const aliveBoids = this.boidSystem.boids.filter((b) => b.alive);
    let nearestDist = Infinity;
    let targetPos: THREE.Vector3 | null = null;

    for (const boid of aliveBoids) {
      const dist = boat.position.distanceTo(
        new THREE.Vector3(boid.position.x, 0.5, boid.position.z)
      );
      if (dist < nearestDist) {
        nearestDist = dist;
        targetPos = boid.position.clone();
      }
    }

    // Move towards fish
    if (targetPos) {
      const direction = new THREE.Vector3()
        .subVectors(new THREE.Vector3(targetPos.x, 0.5, targetPos.z), boat.position)
        .normalize();
      boat.velocity.lerp(direction.multiplyScalar(3), dt * 2);
    }

    // Random wander
    boat.velocity.x += (Math.random() - 0.5) * dt * 2;
    boat.velocity.z += (Math.random() - 0.5) * dt * 2;
    boat.velocity.clampLength(0, 4);
    boat.velocity.y = 0;

    boat.position.add(boat.velocity.clone().multiplyScalar(dt));

    // Keep in bounds
    const bound = 25;
    if (Math.abs(boat.position.x) > bound) {
      boat.velocity.x = -Math.sign(boat.position.x) * 2;
    }
    if (Math.abs(boat.position.z) > bound) {
      boat.velocity.z = -Math.sign(boat.position.z) * 2;
    }

    // Catch fish
    let caught = 0;
    for (const boid of aliveBoids) {
      if (!boid.alive) continue;
      const dist = boat.position.distanceTo(
        new THREE.Vector3(boid.position.x, 0.5, boid.position.z)
      );
      if (dist < catchRadius && caught < catchRate * dt) {
        boid.alive = false;
        caught++;
        boat.catchCount++;
        this.totalCatch++;
      }
    }
    this.catchRate += caught / dt;

    // Update mesh
    if (boat.mesh) {
      boat.mesh.position.copy(boat.position);
      if (boat.velocity.length() > 0.1) {
        boat.mesh.lookAt(
          boat.position.x + boat.velocity.x,
          boat.position.y,
          boat.position.z + boat.velocity.z
        );
      }
    }
  }

  render(_alpha: number): void {
    // Animate ocean waves
    const time = performance.now() * 0.001;
    const positions = this.oceanMesh.geometry.attributes.position;

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getY(i);
      const wave =
        Math.sin(x * 0.3 + time) * 0.3 +
        Math.sin(z * 0.4 + time * 1.2) * 0.2 +
        Math.sin((x + z) * 0.2 + time * 0.8) * 0.15;
      positions.setZ(i, wave);
    }
    positions.needsUpdate = true;
    this.oceanMesh.geometry.computeVertexNormals();

    // Update fish visuals
    this.updateFishInstances();
  }

  getMetrics(): Record<string, number> {
    return {
      fish_population: this.fishPopulation,
      catch_rate: this.catchRate,
      total_catch: this.totalCatch,
    };
  }

  getParamDescriptors(): ParamDescriptor[] {
    return [
      {
        key: 'fishCapacity',
        label: 'Fish Carrying Capacity',
        type: 'number',
        default: 1000,
        min: 200,
        max: 3000,
        step: 100,
        folder: 'Resource',
      },
      {
        key: 'fishReproductionRate',
        label: 'Reproduction Rate',
        type: 'number',
        default: 0.5,
        min: 0.1,
        max: 2,
        step: 0.1,
        folder: 'Resource',
      },
      {
        key: 'fishSpeed',
        label: 'Fish Speed',
        type: 'number',
        default: 4,
        min: 1,
        max: 10,
        step: 0.5,
        folder: 'Resource',
      },
      {
        key: 'boatCount',
        label: 'Number of Boats',
        type: 'number',
        default: 5,
        min: 1,
        max: 20,
        step: 1,
        folder: 'Agents',
      },
      {
        key: 'catchRate',
        label: 'Catch Rate (fish/sec)',
        type: 'number',
        default: 5,
        min: 1,
        max: 20,
        step: 1,
        folder: 'Agents',
      },
      {
        key: 'catchRadius',
        label: 'Catch Radius',
        type: 'number',
        default: 3,
        min: 1,
        max: 8,
        step: 0.5,
        folder: 'Agents',
      },
    ];
  }

  getChartDescriptors(): ChartDescriptor[] {
    return [
      {
        id: 'population',
        title: 'Fish Population',
        series: [{ label: 'Fish Population', color: '#ffa500' }],
        yRange: [0, 1500],
      },
      {
        id: 'catch',
        title: 'Catch Rate',
        series: [{ label: 'Catch Rate', color: '#ff4444' }],
        yRange: [0, 100],
      },
    ];
  }

  getCameraPresets(): CameraPreset[] {
    return [
      { name: 'Overview', position: [30, 20, 30], target: [0, -3, 0] },
      { name: 'Underwater', position: [10, -5, 10], target: [0, -5, 0] },
      { name: 'Surface', position: [20, 5, 20], target: [0, 0, 0] },
    ];
  }

  reset(): void {
    this.boidSystem.reset();
    const bounds = new THREE.Box3(
      new THREE.Vector3(-20, -8, -20),
      new THREE.Vector3(20, -2, 20)
    );
    this.boidSystem.spawn(Math.floor(this.fishCapacity * 0.8), bounds);

    for (const boat of this.boats) {
      boat.catchCount = 0;
    }
    this.totalCatch = 0;
    this.catchRate = 0;
  }

  dispose(): void {
    this.oceanMesh.geometry.dispose();
    (this.oceanMesh.material as THREE.Material).dispose();
    this.fishInstances.geometry.dispose();
    (this.fishInstances.material as THREE.Material).dispose();
  }
}

// Register
ScenarioRegistry.register({
  metadata: new OverfishingScenario().metadata,
  create: () => new OverfishingScenario(),
});
