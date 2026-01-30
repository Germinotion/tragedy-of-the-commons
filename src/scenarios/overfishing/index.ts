import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
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

  // Underwater bounds for fish (water surface is at Y=0)
  private readonly FISH_MIN_Y = -10;
  private readonly FISH_MAX_Y = -1;  // Keep fish below water surface

  // Metrics
  private totalCatch = 0;
  private catchRate = 0;

  // Loaded models
  private boatModel: THREE.Group | null = null;
  private fishGeometryFromModel: THREE.BufferGeometry | null = null;

  // Collision avoidance
  private readonly BOAT_SEPARATION_RADIUS = 4;

  protected async setup(): Promise<void> {
    // Load models
    await Promise.all([
      this.loadBoatModel(),
      this.loadFishModel(),
    ]);
    this.fishCapacity = this.params.fishCapacity as number;
    this.fishPopulation = this.fishCapacity * 0.8;

    // Initialize boid system for fish
    this.boidSystem = new BoidSystem({
      maxSpeed: this.params.fishSpeed as number,
      boundarySize: 25,
      separationRadius: 1.5,
      perceptionRadius: 4,
    });

    // Spawn initial fish - keep underwater
    const bounds = new THREE.Box3(
      new THREE.Vector3(-20, this.FISH_MIN_Y, -20),
      new THREE.Vector3(20, this.FISH_MAX_Y, 20)
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
    // Use loaded FBX geometry if available and valid, otherwise use procedural
    let fishGeometry: THREE.BufferGeometry;
    if (this.fishGeometryFromModel && this.fishGeometryFromModel.attributes.position) {
      fishGeometry = this.fishGeometryFromModel;
      console.log('Using FBX fish geometry');
    } else {
      fishGeometry = this.createFishGeometry();
      console.log('Using procedural fish geometry');
    }

    const fishMaterial = new THREE.MeshStandardMaterial({
      color: 0xffa500,
      roughness: 0.4,
      metalness: 0.1,
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

  private createFishGeometry(): THREE.BufferGeometry {
    // Create a fish shape: ellipsoid body with a tapered tail
    const geometry = new THREE.BufferGeometry();

    // Parameters
    const bodyLength = 0.5;
    const bodyWidth = 0.15;
    const bodyHeight = 0.12;
    const tailLength = 0.25;
    const tailWidth = 0.2;

    const vertices: number[] = [];
    const indices: number[] = [];

    // Body - elongated ellipsoid approximation using segments
    const bodySegments = 8;
    const radialSegments = 6;

    // Generate body vertices
    for (let i = 0; i <= bodySegments; i++) {
      const t = i / bodySegments;
      const x = (t - 0.5) * bodyLength;
      // Ellipse profile: wider in middle, tapers at ends
      const radiusScale = Math.sin(t * Math.PI);

      for (let j = 0; j <= radialSegments; j++) {
        const angle = (j / radialSegments) * Math.PI * 2;
        const y = Math.cos(angle) * bodyHeight * radiusScale;
        const z = Math.sin(angle) * bodyWidth * radiusScale;
        vertices.push(x, y, z);
      }
    }

    // Generate body faces
    for (let i = 0; i < bodySegments; i++) {
      for (let j = 0; j < radialSegments; j++) {
        const a = i * (radialSegments + 1) + j;
        const b = a + radialSegments + 1;
        const c = a + 1;
        const d = b + 1;

        indices.push(a, b, c);
        indices.push(c, b, d);
      }
    }

    // Add tail fin (triangle)
    const tailStart = vertices.length / 3;
    // Tail connects to back of fish
    const tailBaseX = bodyLength * 0.5;
    vertices.push(tailBaseX, 0, 0);  // Base center
    vertices.push(tailBaseX + tailLength, tailWidth * 0.5, 0);  // Top
    vertices.push(tailBaseX + tailLength, -tailWidth * 0.5, 0);  // Bottom

    indices.push(tailStart, tailStart + 1, tailStart + 2);
    indices.push(tailStart, tailStart + 2, tailStart + 1);  // Back face

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    // Rotate so fish faces +X direction (forward)
    geometry.rotateY(Math.PI);

    return geometry;
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

    // Boats float ON the water surface (Y slightly above 0)
    const boatY = 0.8;

    const boat: Boat = {
      id: this.nextBoatId++,
      position: new THREE.Vector3(Math.cos(angle) * radius, boatY, Math.sin(angle) * radius),
      velocity: new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2),
      catchCount: 0,
      mesh: null,
    };

    let group: THREE.Group;

    if (this.boatModel) {
      // Use loaded GLB model
      group = this.boatModel.clone();
      group.position.copy(boat.position);
      // Adjust model to sit properly on water - model may have origin at bottom
      group.position.y = boatY + 0.3;
    } else {
      // Fallback to simple boat mesh
      const hull = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.5, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x8b4513 })
      );
      hull.position.y = 0.25;  // Raise hull so bottom sits on water

      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.4, 0.5),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
      );
      cabin.position.set(-0.3, 0.6, 0);

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

  private async loadFishModel(): Promise<void> {
    const loader = new FBXLoader();
    try {
      const fbx = await loader.loadAsync('/assets/models/fish/quaternius/FBX/Fish1.fbx');

      // Extract geometry from the loaded model
      fbx.traverse((child) => {
        if (child instanceof THREE.Mesh && !this.fishGeometryFromModel) {
          const geom = child.geometry.clone();

          // Compute bounding box to determine proper scale
          geom.computeBoundingBox();
          const box = geom.boundingBox!;
          const size = new THREE.Vector3();
          box.getSize(size);

          // Target size: about 0.5 units long (fish length)
          const targetLength = 0.5;
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = targetLength / maxDim;

          geom.scale(scale, scale, scale);
          geom.center();
          this.fishGeometryFromModel = geom;
        }
      });
    } catch (err) {
      console.warn('Failed to load fish FBX model, using procedural geometry:', err);
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

    // Constrain fish to stay underwater (between FISH_MIN_Y and FISH_MAX_Y)
    this.constrainFishToWater();

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
        new THREE.Vector3(-20, this.FISH_MIN_Y, -20),
        new THREE.Vector3(20, this.FISH_MAX_Y, 20)
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

  private constrainFishToWater(): void {
    // Keep all fish within underwater bounds
    for (const boid of this.boidSystem.boids) {
      if (!boid.alive) continue;

      // Hard constraint: clamp Y position to underwater region
      if (boid.position.y > this.FISH_MAX_Y) {
        boid.position.y = this.FISH_MAX_Y;
        // Reverse Y velocity and add downward bias
        boid.velocity.y = -Math.abs(boid.velocity.y) - 0.5;
      } else if (boid.position.y < this.FISH_MIN_Y) {
        boid.position.y = this.FISH_MIN_Y;
        // Reverse Y velocity and add upward bias
        boid.velocity.y = Math.abs(boid.velocity.y) + 0.5;
      }

      // Soft constraint: apply force to push fish towards middle depth
      const midDepth = (this.FISH_MIN_Y + this.FISH_MAX_Y) / 2;
      const depthDiff = boid.position.y - midDepth;
      // Gentle force towards middle depth
      boid.velocity.y -= depthDiff * 0.1;
    }
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

    // Boat-to-boat collision avoidance
    for (const other of this.boats) {
      if (other.id === boat.id) continue;
      const dx = boat.position.x - other.position.x;
      const dz = boat.position.z - other.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < this.BOAT_SEPARATION_RADIUS && dist > 0.1) {
        // Push away from other boat
        const pushStrength = (this.BOAT_SEPARATION_RADIUS - dist) / this.BOAT_SEPARATION_RADIUS;
        boat.velocity.x += (dx / dist) * pushStrength * 5 * dt;
        boat.velocity.z += (dz / dist) * pushStrength * 5 * dt;
      }
    }

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

    // Update mesh position
    if (boat.mesh) {
      // Keep boat on water surface with slight bobbing
      const time = performance.now() * 0.001;
      const bobOffset = Math.sin(time * 2 + boat.id) * 0.1;

      boat.mesh.position.x = boat.position.x;
      boat.mesh.position.z = boat.position.z;
      // Boats float on water surface (Y=0) with bobbing
      boat.mesh.position.y = 0.8 + bobOffset;

      if (boat.velocity.length() > 0.1) {
        boat.mesh.lookAt(
          boat.position.x + boat.velocity.x,
          boat.mesh.position.y,
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
      new THREE.Vector3(-20, this.FISH_MIN_Y, -20),
      new THREE.Vector3(20, this.FISH_MAX_Y, 20)
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
