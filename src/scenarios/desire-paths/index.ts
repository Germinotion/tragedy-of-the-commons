import * as THREE from 'three';
import { ScenarioBase } from '../ScenarioBase';
import { ScenarioRegistry } from '../ScenarioRegistry';
import { WearGrid } from '../../simulation/CellularAutomata';
import { Pathfinder, straightPath } from '../../simulation/Pathfinding';
import type {
  ScenarioMetadata,
  ParamDescriptor,
  ChartDescriptor,
  CameraPreset,
} from '../../core/types';

interface Pedestrian {
  id: number;
  position: THREE.Vector2;
  path: [number, number][];
  pathIndex: number;
  speed: number;
  mesh: THREE.Mesh | null;
}

interface SpawnPoint {
  x: number;
  y: number;
}

export class DesirePathsScenario extends ScenarioBase {
  readonly metadata: ScenarioMetadata = {
    id: 'desire-paths',
    title: 'Desire Paths',
    subtitle: 'Pedestrians wear down shared parkland',
    description:
      'People walking across a park create "desire paths" - informal trails that emerge from collective behavior.',
    category: 'non-living',
    color: '#ff9e4a',
    infoContent: {
      title: 'Emergent Desire Paths',
      body: `
        <p>Desire paths form when people choose the most convenient route rather than the designed path.</p>
        <p>This creates a feedback loop:</p>
        <ul>
          <li>One person cuts across the grass</li>
          <li>The grass gets slightly worn</li>
          <li>Others see the worn path and follow it</li>
          <li>The path becomes more visible and attractive</li>
        </ul>
        <p><strong>Watch for:</strong> Paths emerge organically based on common destinations. High traffic areas degrade faster.</p>
      `,
    },
  };

  // Simulation state
  private wearGrid!: WearGrid;
  private pathfinder!: Pathfinder;
  private pedestrians: Pedestrian[] = [];
  private nextPedId = 0;
  private spawnPoints: SpawnPoint[] = [];
  private destinations: SpawnPoint[] = [];

  // Visual elements
  private groundMesh!: THREE.Mesh;
  private groundTexture!: THREE.DataTexture;
  private pedestrianGroup = new THREE.Group();

  // Metrics
  private totalWalked = 0;
  private pathsFormed = 0;

  protected async setup(): Promise<void> {
    const gridSize = 64;
    this.wearGrid = new WearGrid(
      gridSize,
      gridSize,
      this.params.recoveryRate as number,
      this.params.grassDurability as number
    );

    // Create pathfinder
    this.pathfinder = new Pathfinder(
      gridSize,
      gridSize,
      (x, y) => this.wearGrid.getPathCost(x, y, this.params.shortcutTendency as number)
    );

    // Define spawn points and destinations (edges and corners)
    this.spawnPoints = [
      { x: 0, y: gridSize / 2 },        // Left
      { x: gridSize - 1, y: gridSize / 2 }, // Right
      { x: gridSize / 2, y: 0 },        // Top
      { x: gridSize / 2, y: gridSize - 1 }, // Bottom
    ];

    this.destinations = [
      { x: gridSize / 2, y: gridSize / 2 }, // Center (park feature)
      { x: gridSize * 0.25, y: gridSize * 0.25 },
      { x: gridSize * 0.75, y: gridSize * 0.25 },
      { x: gridSize * 0.25, y: gridSize * 0.75 },
      { x: gridSize * 0.75, y: gridSize * 0.75 },
    ];

    // Add sidewalks (pre-worn paths)
    this.createSidewalks();

    // Create ground visualization
    this.createGround();

    // Add pedestrian group
    this.context.scene.add(this.pedestrianGroup);

    // Setup lighting and camera
    this.setupLighting();
  }

  private createSidewalks(): void {
    // Create cross-shaped sidewalk through the park
    const mid = this.wearGrid.width / 2;
    const walkWidth = 2;

    for (let i = 0; i < this.wearGrid.width; i++) {
      for (let w = -walkWidth; w <= walkWidth; w++) {
        // Horizontal sidewalk
        const idx1 = (mid + w) * this.wearGrid.width + i;
        if (idx1 >= 0 && idx1 < this.wearGrid.data.length) {
          this.wearGrid.data[idx1] = 0.1; // Pre-worn
        }
        // Vertical sidewalk
        const idx2 = i * this.wearGrid.width + (mid + w);
        if (idx2 >= 0 && idx2 < this.wearGrid.data.length) {
          this.wearGrid.data[idx2] = 0.1;
        }
      }
    }
  }

  private createGround(): void {
    const size = 30;
    const geometry = new THREE.PlaneGeometry(size, size);

    // Create data texture for wear visualization
    const texSize = this.wearGrid.width;
    const data = new Uint8Array(texSize * texSize * 4);
    this.groundTexture = new THREE.DataTexture(
      data,
      texSize,
      texSize,
      THREE.RGBAFormat
    );
    this.groundTexture.minFilter = THREE.LinearFilter;
    this.groundTexture.magFilter = THREE.LinearFilter;

    const material = new THREE.MeshStandardMaterial({
      map: this.groundTexture,
      roughness: 0.9,
      metalness: 0.0,
    });

    this.groundMesh = new THREE.Mesh(geometry, material);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.receiveShadow = true;
    this.context.scene.add(this.groundMesh);

    this.updateGroundTexture();
  }

  private updateGroundTexture(): void {
    const data = this.groundTexture.image.data as Uint8Array;
    const width = this.wearGrid.width;

    for (let y = 0; y < this.wearGrid.height; y++) {
      for (let x = 0; x < this.wearGrid.width; x++) {
        const health = this.wearGrid.get(x, y);
        const idx = (y * width + x) * 4;

        // Grass: green (high health) to brown/dirt (low health)
        const grassR = Math.floor(60 + (1 - health) * 100);
        const grassG = Math.floor(140 * health + 80 * (1 - health));
        const grassB = Math.floor(40 * health + 50 * (1 - health));

        data[idx] = grassR;
        data[idx + 1] = grassG;
        data[idx + 2] = grassB;
        data[idx + 3] = 255;
      }
    }

    this.groundTexture.needsUpdate = true;
  }

  private setupLighting(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.context.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(10, 20, 10);
    sun.castShadow = true;
    this.context.scene.add(sun);

    this.context.scene.background = new THREE.Color(0x87ceeb);
  }

  private spawnPedestrian(): void {
    // Random spawn point
    const spawn = this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];

    // Random destination (different from spawn)
    let dest: SpawnPoint;
    const shortcutTendency = this.params.shortcutTendency as number;

    if (Math.random() < shortcutTendency) {
      // Go to a corner/diagonal destination
      dest = this.destinations[Math.floor(Math.random() * this.destinations.length)];
    } else {
      // Go to opposite edge (following sidewalks)
      const oppositeIdx = (this.spawnPoints.indexOf(spawn) + 2) % this.spawnPoints.length;
      dest = this.spawnPoints[oppositeIdx];
    }

    // Find path
    let path: [number, number][];
    if (Math.random() < shortcutTendency * 0.3) {
      // Sometimes just walk straight
      path = straightPath(spawn.x, spawn.y, dest.x, dest.y, 20);
    } else {
      path = this.pathfinder.findPath(spawn.x, spawn.y, dest.x, dest.y);
      if (path.length === 0) {
        path = straightPath(spawn.x, spawn.y, dest.x, dest.y, 20);
      }
    }

    const ped: Pedestrian = {
      id: this.nextPedId++,
      position: new THREE.Vector2(spawn.x, spawn.y),
      path,
      pathIndex: 0,
      speed: 8 + Math.random() * 4,
      mesh: null,
    };

    // Create pedestrian mesh (simple dot)
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.3, 8),
      new THREE.MeshBasicMaterial({ color: 0xff4444 })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.05;

    this.pedestrianGroup.add(mesh);
    ped.mesh = mesh;
    this.pedestrians.push(ped);
  }

  update(dt: number, _elapsed: number): void {
    // Update wear grid params
    this.wearGrid.setParams(
      this.params.recoveryRate as number,
      this.params.grassDurability as number
    );

    // Spawn pedestrians
    const spawnRate = this.params.pedestrianSpawnRate as number;
    if (Math.random() < spawnRate * dt) {
      this.spawnPedestrian();
    }

    // Update pedestrians
    for (const ped of this.pedestrians) {
      if (ped.pathIndex >= ped.path.length) {
        // Arrived - remove pedestrian
        if (ped.mesh) this.pedestrianGroup.remove(ped.mesh);
        ped.mesh = null;
        continue;
      }

      const target = ped.path[ped.pathIndex];
      const dx = target[0] - ped.position.x;
      const dy = target[1] - ped.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 0.5) {
        ped.pathIndex++;
      } else {
        const moveX = (dx / dist) * ped.speed * dt;
        const moveY = (dy / dist) * ped.speed * dt;
        ped.position.x += moveX;
        ped.position.y += moveY;

        // Apply wear
        this.wearGrid.wear(Math.floor(ped.position.x), Math.floor(ped.position.y), dt * 0.5);
        this.totalWalked += Math.sqrt(moveX * moveX + moveY * moveY);
      }

      // Update mesh position
      if (ped.mesh) {
        ped.mesh.position.x = (ped.position.x / this.wearGrid.width - 0.5) * 30;
        ped.mesh.position.z = (ped.position.y / this.wearGrid.height - 0.5) * 30;
      }
    }

    // Remove finished pedestrians
    this.pedestrians = this.pedestrians.filter((p) => p.mesh !== null);

    // Update wear grid (recovery)
    this.wearGrid.update(dt);

    // Count desire paths
    this.pathsFormed = this.wearGrid.getWornPercentage(0.5) * 100;
  }

  render(_alpha: number): void {
    this.updateGroundTexture();
  }

  getMetrics(): Record<string, number> {
    return {
      pedestrians: this.pedestrians.length,
      grass_health: this.wearGrid.getAverageHealth() * 100,
      paths_formed: this.pathsFormed,
    };
  }

  getParamDescriptors(): ParamDescriptor[] {
    return [
      {
        key: 'grassDurability',
        label: 'Grass Durability',
        type: 'number',
        default: 0.1,
        min: 0.01,
        max: 0.5,
        step: 0.01,
        folder: 'Resource',
      },
      {
        key: 'recoveryRate',
        label: 'Grass Recovery Rate',
        type: 'number',
        default: 0.005,
        min: 0.001,
        max: 0.05,
        step: 0.001,
        folder: 'Resource',
      },
      {
        key: 'pedestrianSpawnRate',
        label: 'Pedestrian Spawn Rate',
        type: 'number',
        default: 2,
        min: 0.5,
        max: 10,
        step: 0.5,
        folder: 'Agents',
      },
      {
        key: 'shortcutTendency',
        label: 'Shortcut Tendency',
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
        id: 'health',
        title: 'Park Health',
        series: [
          { label: 'Grass Health', color: '#4caf50' },
          { label: 'Paths Formed', color: '#ff9800' },
        ],
        yRange: [0, 100],
      },
    ];
  }

  getCameraPresets(): CameraPreset[] {
    return [
      { name: 'Top Down', position: [0, 35, 0.1], target: [0, 0, 0] },
      { name: 'Isometric', position: [20, 25, 20], target: [0, 0, 0] },
      { name: 'Low Angle', position: [15, 5, 15], target: [0, 0, 0] },
    ];
  }

  reset(): void {
    this.wearGrid.reset();
    this.createSidewalks();

    for (const ped of this.pedestrians) {
      if (ped.mesh) this.pedestrianGroup.remove(ped.mesh);
    }
    this.pedestrians = [];
    this.totalWalked = 0;
    this.pathsFormed = 0;
  }

  dispose(): void {
    this.groundMesh.geometry.dispose();
    (this.groundMesh.material as THREE.Material).dispose();
    this.groundTexture.dispose();
  }
}

// Register
ScenarioRegistry.register({
  metadata: new DesirePathsScenario().metadata,
  create: () => new DesirePathsScenario(),
});
