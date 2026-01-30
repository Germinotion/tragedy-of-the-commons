import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { ScenarioBase } from '../ScenarioBase';
import { ScenarioRegistry } from '../ScenarioRegistry';
import { LogisticGrid } from '../../simulation/LogisticGrowth';
import type {
  ScenarioMetadata,
  ParamDescriptor,
  ChartDescriptor,
  CameraPreset,
} from '../../core/types';

interface Sheep {
  id: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  energy: number;
  alive: boolean;
  shepherd: number;
  group: THREE.Group | null;
}

interface GrassBlade {
  x: number;
  z: number;
  rotation: number;
  gridX: number;
  gridY: number;
}

export class GrazingScenario extends ScenarioBase {
  readonly metadata: ScenarioMetadata = {
    id: 'grazing',
    title: 'Grazing Commons',
    subtitle: 'Shepherds compete for shared pasture',
    description:
      'The classic tragedy: shepherds add sheep to a shared pasture. Each sheep benefits its owner but depletes grass for all.',
    category: 'living',
    color: '#4aff9e',
    infoContent: {
      title: 'The Tragedy of the Commons',
      body: `
        <p>This is the original "Tragedy of the Commons" described by Garrett Hardin in 1968.</p>
        <p>Each shepherd rationally adds more sheep to the commons because:</p>
        <ul>
          <li>The benefit of each additional sheep goes entirely to the owner</li>
          <li>The cost (grass depletion) is shared among all shepherds</li>
          <li>Individual incentives don't align with collective welfare</li>
        </ul>
        <p><strong>Watch for:</strong> When greediness is high, the pasture collapses. When cooperation is high, the commons can be sustained.</p>
      `,
    },
  };

  // Simulation state
  private grassGrid!: LogisticGrid;
  private sheep: Sheep[] = [];
  private nextSheepId = 0;
  private terrain!: THREE.Mesh;
  private grassInstances!: THREE.InstancedMesh;
  private sheepMeshes: THREE.Group = new THREE.Group();

  // Pre-computed grass blade positions (fixes flicker)
  private grassBlades: GrassBlade[] = [];
  private grassDummy = new THREE.Object3D();
  private grassColor = new THREE.Color();
  private time = 0;

  // Metrics
  private totalGrass = 0;
  private sheepCount = 0;

  // Shepherd colors for visual distinction
  private shepherdColors = [
    0xf44336, // Red
    0x2196f3, // Blue
    0xffeb3b, // Yellow
    0x4caf50, // Green
    0xff9800, // Orange
    0x9c27b0, // Purple
  ];

  // Loaded sheep model
  private sheepModel: THREE.Group | null = null;

  protected async setup(): Promise<void> {
    // Try to load sheep FBX model
    await this.loadSheepModel();
    // Initialize grass grid (32x32 cells)
    const gridSize = 32;
    this.grassGrid = new LogisticGrid(
      gridSize,
      gridSize,
      this.params.grassRegrowthRate as number,
      this.params.carryingCapacity as number
    );

    // Create terrain first
    this.createTerrain();

    // Pre-compute grass positions (fixes flicker)
    this.precomputeGrassPositions();

    // Create grass instances
    this.createGrassField();

    // Create initial sheep
    this.spawnInitialSheep();

    // Add sheep group to scene
    this.context.scene.add(this.sheepMeshes);

    // Add lighting
    this.setupLighting();
  }

  private createTerrain(): void {
    const terrainSize = 50;
    const segments = 64;
    const geometry = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);

    // Apply gentle rolling hills
    // PlaneGeometry vertices are in XY plane, we set Z as height
    // After rotation.x = -PI/2: localZ becomes worldY (height)
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const localX = positions.getX(i);
      const localY = positions.getY(i);
      const height = this.calculateTerrainHeight(localX, localY);
      positions.setZ(i, height);
    }
    geometry.computeVertexNormals();

    // Rich brown soil
    const material = new THREE.MeshStandardMaterial({
      color: 0x654321,
      roughness: 0.95,
      metalness: 0.0,
    });

    this.terrain = new THREE.Mesh(geometry, material);
    this.terrain.rotation.x = -Math.PI / 2;
    this.terrain.receiveShadow = true;
    this.context.scene.add(this.terrain);
  }

  private calculateTerrainHeight(localX: number, localY: number): number {
    // Gentle rolling hills formula for terrain mesh (in local coordinates)
    return (
      Math.sin(localX * 0.12) * 1.0 +
      Math.cos(localY * 0.15) * 0.8 +
      Math.sin(localX * 0.06 + localY * 0.06) * 1.5
    );
  }

  private getTerrainHeight(worldX: number, worldZ: number): number {
    // Convert world coordinates to terrain local coordinates
    // The terrain is rotated -90° around X axis:
    // - localX = worldX
    // - localY = -worldZ (rotation flips the Z to Y mapping)
    return this.calculateTerrainHeight(worldX, -worldZ);
  }

  private precomputeGrassPositions(): void {
    const cellSize = 50 / this.grassGrid.width;
    const halfGrid = 25;
    const bladesPerCell = 6;

    this.grassBlades = [];

    for (let gy = 0; gy < this.grassGrid.height; gy++) {
      for (let gx = 0; gx < this.grassGrid.width; gx++) {
        for (let b = 0; b < bladesPerCell; b++) {
          // Pre-compute random offsets (seeded by position for consistency)
          const seed = gx * 1000 + gy * 100 + b;
          const pseudoRandom1 = Math.sin(seed * 12.9898) * 43758.5453;
          const pseudoRandom2 = Math.sin(seed * 78.233) * 43758.5453;
          const pseudoRandom3 = Math.sin(seed * 93.989) * 43758.5453;

          const offsetX = (pseudoRandom1 % 1 - 0.5) * cellSize * 0.85;
          const offsetZ = (pseudoRandom2 % 1 - 0.5) * cellSize * 0.85;
          const rotation = (pseudoRandom3 % 1) * Math.PI * 2;

          const worldX = gx * cellSize - halfGrid + cellSize / 2 + offsetX;
          const worldZ = gy * cellSize - halfGrid + cellSize / 2 + offsetZ;

          this.grassBlades.push({
            x: worldX,
            z: worldZ,
            rotation,
            gridX: gx,
            gridY: gy,
          });
        }
      }
    }
  }

  private createGrassField(): void {
    // Grass blade geometry - tapered triangle
    const bladeGeometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      -0.05, 0, 0,
      0.05, 0, 0,
      0, 0.6, 0,
    ]);
    bladeGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    bladeGeometry.computeVertexNormals();

    const bladeMaterial = new THREE.MeshStandardMaterial({
      color: 0x4caf50,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });

    this.grassInstances = new THREE.InstancedMesh(
      bladeGeometry,
      bladeMaterial,
      this.grassBlades.length
    );
    this.grassInstances.castShadow = true;
    this.grassInstances.receiveShadow = true;

    this.updateGrassVisuals();
    this.context.scene.add(this.grassInstances);
  }

  private updateGrassVisuals(): void {
    const carryingCapacity = this.params.carryingCapacity as number;

    for (let i = 0; i < this.grassBlades.length; i++) {
      const blade = this.grassBlades[i];
      const health = this.grassGrid.get(blade.gridX, blade.gridY) / carryingCapacity;

      // Get terrain height at this position
      const terrainY = this.getTerrainHeight(blade.x, blade.z);

      this.grassDummy.position.set(blade.x, terrainY, blade.z);

      // Fixed rotation (no flicker) plus gentle wind
      const windLean = Math.sin(this.time * 1.5 + blade.x * 0.3 + blade.z * 0.2) * 0.1;
      this.grassDummy.rotation.set(windLean, blade.rotation, 0);

      // Scale based on health - grass shrinks when eaten
      const heightScale = 0.2 + health * 0.8;
      const widthScale = 0.5 + health * 0.5;
      this.grassDummy.scale.set(widthScale, heightScale, widthScale);

      this.grassDummy.updateMatrix();
      this.grassInstances.setMatrixAt(i, this.grassDummy.matrix);

      // Color: vibrant green when healthy, yellow-brown when depleted
      if (health > 0.5) {
        // Healthy: green
        this.grassColor.setHSL(0.3, 0.7, 0.25 + health * 0.15);
      } else {
        // Depleted: yellow to brown
        this.grassColor.setHSL(0.15 + health * 0.15, 0.5, 0.25 + health * 0.1);
      }
      this.grassInstances.setColorAt(i, this.grassColor);
    }

    this.grassInstances.instanceMatrix.needsUpdate = true;
    if (this.grassInstances.instanceColor) {
      this.grassInstances.instanceColor.needsUpdate = true;
    }
  }

  private createSheepMesh(shepherdIndex: number): THREE.Group {
    const shepherdColor = this.shepherdColors[shepherdIndex % this.shepherdColors.length];

    // Use loaded FBX model if available
    if (this.sheepModel) {
      const group = this.sheepModel.clone();

      // Add shepherd marker - colored ribbon/collar
      const collar = new THREE.Mesh(
        new THREE.TorusGeometry(0.15, 0.03, 6, 12),
        new THREE.MeshStandardMaterial({
          color: shepherdColor,
          emissive: shepherdColor,
          emissiveIntensity: 0.4,
        })
      );
      collar.position.set(0.2, 0.25, 0);
      collar.rotation.z = Math.PI / 2;
      group.add(collar);

      return group;
    }

    // Fallback: procedural sheep mesh
    const group = new THREE.Group();
    const sheepColor = 0xf5f5f0;

    // Fluffy body
    const woolMaterial = new THREE.MeshStandardMaterial({
      color: sheepColor,
      roughness: 1.0,
      metalness: 0.0,
    });

    // Main body
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 12, 8),
      woolMaterial
    );
    body.scale.set(1.3, 0.9, 1);
    body.position.y = 0.3;
    body.castShadow = true;
    group.add(body);

    // Wool puffs for fluffy look
    const puffPositions = [
      [0.15, 0.35, 0.2], [0.15, 0.35, -0.2],
      [-0.15, 0.35, 0.2], [-0.15, 0.35, -0.2],
      [0, 0.45, 0], [-0.2, 0.3, 0],
    ];
    for (const pos of puffPositions) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 8, 6),
        woolMaterial
      );
      puff.position.set(pos[0], pos[1], pos[2]);
      puff.castShadow = true;
      group.add(puff);
    }

    // Head - dark face
    const headMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d2d2d,
      roughness: 0.8,
    });
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 6),
      headMaterial
    );
    head.position.set(0.4, 0.35, 0);
    head.scale.set(1.2, 1, 0.9);
    head.castShadow = true;
    group.add(head);

    // Ears
    const earMaterial = new THREE.MeshStandardMaterial({ color: 0x3d3d3d });
    const earGeo = new THREE.SphereGeometry(0.06, 6, 4);

    const leftEar = new THREE.Mesh(earGeo, earMaterial);
    leftEar.position.set(0.35, 0.45, 0.1);
    group.add(leftEar);

    const rightEar = new THREE.Mesh(earGeo, earMaterial);
    rightEar.position.set(0.35, 0.45, -0.1);
    group.add(rightEar);

    // Legs - positioned to touch ground
    const legMaterial = new THREE.MeshStandardMaterial({ color: 0x3d3d3d });
    const legGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.25, 6);

    const legPositions = [
      [-0.15, 0.125, 0.12],
      [-0.15, 0.125, -0.12],
      [0.15, 0.125, 0.12],
      [0.15, 0.125, -0.12],
    ];

    for (const pos of legPositions) {
      const leg = new THREE.Mesh(legGeo, legMaterial);
      leg.position.set(pos[0], pos[1], pos[2]);
      leg.castShadow = true;
      group.add(leg);
    }

    // Shepherd marker - colored ribbon/collar
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.12, 0.025, 6, 12),
      new THREE.MeshStandardMaterial({
        color: shepherdColor,
        emissive: shepherdColor,
        emissiveIntensity: 0.3,
      })
    );
    collar.position.set(0.32, 0.35, 0);
    collar.rotation.y = Math.PI / 2;
    group.add(collar);

    return group;
  }

  private spawnInitialSheep(): void {
    const shepherdCount = this.params.shepherdCount as number;
    const sheepPerShepherd = 3;

    for (let s = 0; s < shepherdCount; s++) {
      for (let i = 0; i < sheepPerShepherd; i++) {
        this.spawnSheep(s);
      }
    }
  }

  private spawnSheep(shepherd: number): Sheep {
    const angle = Math.random() * Math.PI * 2;
    const radius = 5 + Math.random() * 15;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = this.getTerrainHeight(x, z);

    const sheep: Sheep = {
      id: this.nextSheepId++,
      position: new THREE.Vector3(x, y, z),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        0,
        (Math.random() - 0.5) * 2
      ),
      energy: 50 + Math.random() * 50,
      alive: true,
      shepherd,
      group: null,
    };

    // Create sheep mesh
    const group = this.createSheepMesh(shepherd);
    group.position.set(x, y, z);
    this.sheepMeshes.add(group);
    sheep.group = group;

    this.sheep.push(sheep);
    return sheep;
  }

  private async loadSheepModel(): Promise<void> {
    const loader = new FBXLoader();
    try {
      const fbx = await loader.loadAsync('/assets/models/farm-animals/quaternius/FBX/Sheep.fbx');

      if (fbx.children.length === 0) {
        console.warn('Sheep FBX has no children, using fallback');
        return;
      }

      // Compute bounding box to determine proper scale
      const box = new THREE.Box3().setFromObject(fbx);
      const size = new THREE.Vector3();
      box.getSize(size);

      // Target size: about 0.8 units tall (sheep height)
      const targetHeight = 0.8;
      const scale = targetHeight / size.y;

      this.sheepModel = fbx;
      this.sheepModel.scale.setScalar(scale);

      // Center the model at origin
      box.setFromObject(this.sheepModel);
      const center = new THREE.Vector3();
      box.getCenter(center);
      this.sheepModel.position.sub(center);
      this.sheepModel.position.y = 0; // Keep feet on ground

      // Apply shadows
      this.sheepModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
            (child.material as THREE.Material).side = THREE.DoubleSide;
          }
        }
      });
    } catch (err) {
      console.warn('Failed to load sheep FBX model, using fallback:', err);
    }
  }

  private setupLighting(): void {
    // Warm ambient for natural outdoor feel
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.context.scene.add(ambient);

    // Main sun light
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(30, 40, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 100;
    sun.shadow.camera.left = -35;
    sun.shadow.camera.right = 35;
    sun.shadow.camera.top = 35;
    sun.shadow.camera.bottom = -35;
    sun.shadow.bias = -0.001;
    this.context.scene.add(sun);

    // Soft fill light from opposite side
    const fill = new THREE.DirectionalLight(0x87ceeb, 0.3);
    fill.position.set(-20, 10, -20);
    this.context.scene.add(fill);

    // Sky color - bright blue
    this.context.scene.background = new THREE.Color(0x87ceeb);

    // Add fog for atmosphere (reduced intensity)
    this.context.scene.fog = new THREE.Fog(0x87ceeb, 60, 120);
  }

  update(dt: number, elapsed: number): void {
    this.time = elapsed;
    const greediness = this.params.greediness as number;
    const consumptionRate = this.params.consumptionRate as number;
    const reproductionThreshold = this.params.reproductionThreshold as number;

    // Update grass regrowth
    this.grassGrid.setParams(
      this.params.grassRegrowthRate as number,
      this.params.carryingCapacity as number
    );
    this.grassGrid.update(dt);

    // Update sheep
    for (const sheep of this.sheep) {
      if (!sheep.alive) continue;

      // Move sheep
      this.moveSheep(sheep, dt);

      // Consume grass from current cell and neighbors (sheep graze an area, not a point)
      const gridX = Math.floor((sheep.position.x + 25) / 50 * this.grassGrid.width);
      const gridY = Math.floor((sheep.position.z + 25) / 50 * this.grassGrid.height);

      let totalConsumed = 0;
      // Graze from 3x3 area centered on sheep
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const weight = (dx === 0 && dy === 0) ? 0.5 : 0.0625; // Center gets more
          const consumed = this.grassGrid.consume(gridX + dx, gridY + dy, consumptionRate * weight * dt);
          totalConsumed += consumed;
        }
      }

      sheep.energy += totalConsumed * 8;  // Energy from grass
      sheep.energy -= dt * 8; // Higher metabolism

      // Death
      if (sheep.energy <= 0) {
        sheep.alive = false;
        if (sheep.group) {
          this.sheepMeshes.remove(sheep.group);
        }
        continue;
      }

      // Reproduction - more likely when well-fed and greedy
      if (sheep.energy > reproductionThreshold && Math.random() < 0.1 * greediness * dt) {
        sheep.energy -= reproductionThreshold * 0.5;
        this.spawnSheep(sheep.shepherd);
      }
    }

    // Remove dead sheep
    this.sheep = this.sheep.filter((s) => s.alive);

    // Shepherds actively add sheep based on greediness
    // At max greediness, each shepherd adds ~1 sheep every 2 seconds
    const shepherdCount = this.params.shepherdCount as number;
    const spawnChance = greediness * greediness * 0.5 * dt; // Quadratic scaling
    for (let s = 0; s < shepherdCount; s++) {
      if (Math.random() < spawnChance) {
        this.spawnSheep(s);
      }
    }

    // Update metrics
    this.totalGrass = this.grassGrid.getAverage() / (this.params.carryingCapacity as number);
    this.sheepCount = this.sheep.length;
  }

  private moveSheep(sheep: Sheep, dt: number): void {
    // Seek grass when hungry, wander when full
    const wanderForce = new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      0,
      (Math.random() - 0.5) * 2
    );

    // Seek better grass if hungry (energy < 60)
    const grassSeekForce = new THREE.Vector3();
    if (sheep.energy < 60) {
      // Look for nearby cell with most grass
      const cellSize = 50 / this.grassGrid.width;
      let bestGrass = 0;
      let bestDir = new THREE.Vector3();

      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (dx === 0 && dz === 0) continue;
          const checkX = sheep.position.x + dx * cellSize;
          const checkZ = sheep.position.z + dz * cellSize;
          const gridX = Math.floor((checkX + 25) / 50 * this.grassGrid.width);
          const gridY = Math.floor((checkZ + 25) / 50 * this.grassGrid.height);
          const grass = this.grassGrid.get(gridX, gridY);
          if (grass > bestGrass) {
            bestGrass = grass;
            bestDir.set(dx, 0, dz).normalize();
          }
        }
      }
      if (bestGrass > 0) {
        grassSeekForce.copy(bestDir).multiplyScalar(3);
      }
    }

    // Boundary force
    const boundaryForce = new THREE.Vector3();
    const bound = 22;
    if (Math.abs(sheep.position.x) > bound) {
      boundaryForce.x = -Math.sign(sheep.position.x) * 3;
    }
    if (Math.abs(sheep.position.z) > bound) {
      boundaryForce.z = -Math.sign(sheep.position.z) * 3;
    }

    // Sheep-to-sheep collision avoidance
    const separationForce = new THREE.Vector3();
    const separationRadius = 1.5;
    for (const other of this.sheep) {
      if (other.id === sheep.id || !other.alive) continue;
      const dx = sheep.position.x - other.position.x;
      const dz = sheep.position.z - other.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < separationRadius && dist > 0.1) {
        // Push away from other sheep
        const pushStrength = (separationRadius - dist) / separationRadius;
        separationForce.x += (dx / dist) * pushStrength * 4;
        separationForce.z += (dz / dist) * pushStrength * 4;
      }
    }

    sheep.velocity.add(wanderForce.multiplyScalar(dt));
    sheep.velocity.add(grassSeekForce.multiplyScalar(dt));
    sheep.velocity.add(boundaryForce.multiplyScalar(dt));
    sheep.velocity.add(separationForce.multiplyScalar(dt));
    sheep.velocity.clampLength(0, 2.5);  // Faster movement
    sheep.velocity.y = 0;

    sheep.position.add(sheep.velocity.clone().multiplyScalar(dt));

    // Keep on terrain
    const terrainY = this.getTerrainHeight(sheep.position.x, sheep.position.z);
    sheep.position.y = terrainY;

    // Update mesh
    if (sheep.group) {
      sheep.group.position.copy(sheep.position);

      // Face movement direction
      if (sheep.velocity.length() > 0.1) {
        const angle = Math.atan2(sheep.velocity.x, sheep.velocity.z);
        sheep.group.rotation.y = angle;
      }
    }
  }

  render(_alpha: number): void {
    // Update grass visuals (wind animation uses time)
    this.updateGrassVisuals();
  }

  getMetrics(): Record<string, number> {
    return {
      grass_level: this.totalGrass * 100,
      sheep_count: this.sheepCount,
    };
  }

  getParamDescriptors(): ParamDescriptor[] {
    return [
      {
        key: 'grassRegrowthRate',
        label: 'Grass Regrowth Rate',
        type: 'number',
        default: 0.15,  // Slower regrowth makes depletion possible
        min: 0.05,
        max: 0.5,
        step: 0.05,
        folder: 'Resource',
      },
      {
        key: 'carryingCapacity',
        label: 'Carrying Capacity',
        type: 'number',
        default: 100,
        min: 50,
        max: 200,
        step: 10,
        folder: 'Resource',
      },
      {
        key: 'consumptionRate',
        label: 'Sheep Consumption Rate',
        type: 'number',
        default: 8,  // Higher consumption per sheep
        min: 2,
        max: 20,
        step: 1,
        folder: 'Agents',
      },
      {
        key: 'reproductionThreshold',
        label: 'Reproduction Energy',
        type: 'number',
        default: 80,  // Lower threshold = easier reproduction
        min: 40,
        max: 150,
        step: 10,
        folder: 'Agents',
      },
      {
        key: 'shepherdCount',
        label: 'Number of Shepherds',
        type: 'number',
        default: 3,
        min: 1,
        max: 6,
        step: 1,
        folder: 'Agents',
      },
      {
        key: 'greediness',
        label: 'Greediness (Cooperation ↔ Selfish)',
        type: 'number',
        default: 0.5,
        min: 0,
        max: 1,
        step: 0.1,
        folder: 'Behavior',
      },
    ];
  }

  getChartDescriptors(): ChartDescriptor[] {
    return [
      {
        id: 'resources',
        title: 'Resources',
        series: [
          { label: 'Grass Level', color: '#4caf50' },
          { label: 'Sheep Count', color: '#ff9800' },
        ],
        yRange: [0, 150],
      },
    ];
  }

  getCameraPresets(): CameraPreset[] {
    return [
      { name: 'Overview', position: [30, 25, 30], target: [0, 0, 0] },
      { name: 'Ground Level', position: [20, 4, 20], target: [0, 2, 0] },
      { name: 'Top Down', position: [0, 50, 0.1], target: [0, 0, 0] },
    ];
  }

  reset(): void {
    // Clear sheep
    for (const sheep of this.sheep) {
      if (sheep.group) {
        this.sheepMeshes.remove(sheep.group);
      }
    }
    this.sheep = [];
    this.nextSheepId = 0;

    // Reset grass
    this.grassGrid.reset();

    // Respawn initial sheep
    this.spawnInitialSheep();
  }

  dispose(): void {
    // Cleanup
    this.terrain.geometry.dispose();
    (this.terrain.material as THREE.Material).dispose();
    this.grassInstances.geometry.dispose();
    (this.grassInstances.material as THREE.Material).dispose();

    for (const sheep of this.sheep) {
      if (sheep.group) {
        this.sheepMeshes.remove(sheep.group);
      }
    }
  }
}

// Register the scenario
ScenarioRegistry.register({
  metadata: new GrazingScenario().metadata,
  create: () => new GrazingScenario(),
});
