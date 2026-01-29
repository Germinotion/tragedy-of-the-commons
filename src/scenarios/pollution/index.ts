import * as THREE from 'three';
import { ScenarioBase } from '../ScenarioBase';
import { ScenarioRegistry } from '../ScenarioRegistry';
import { DiffusionGrid } from '../../simulation/Diffusion';
import type {
  ScenarioMetadata,
  ParamDescriptor,
  ChartDescriptor,
  CameraPreset,
} from '../../core/types';

interface Factory {
  id: number;
  position: THREE.Vector3;
  emissionRate: number;
  mesh: THREE.Group | null;
}

export class PollutionScenario extends ScenarioBase {
  readonly metadata: ScenarioMetadata = {
    id: 'pollution',
    title: 'Air Pollution',
    subtitle: 'Factories share the atmosphere',
    description:
      'Factories emit pollution into shared airspace. Nature absorbs some, but excess degrades air quality for everyone.',
    category: 'non-living',
    color: '#888888',
    infoContent: {
      title: 'The Atmospheric Commons',
      body: `
        <p>The atmosphere is a shared resource. Every factory benefits from clean air, but also pollutes it.</p>
        <p>Each factory owner faces a dilemma:</p>
        <ul>
          <li>Pollution controls are expensive</li>
          <li>The pollution disperses and is "shared" by everyone</li>
          <li>My individual contribution seems small</li>
          <li>If others pollute anyway, why should I pay to be clean?</li>
        </ul>
        <p><strong>Watch for:</strong> The sky shifts from blue to brown as pollution accumulates. Wind direction affects distribution.</p>
      `,
    },
  };

  // Simulation state
  private pollutionGrid!: DiffusionGrid;
  private factories: Factory[] = [];
  private nextFactoryId = 0;

  // Visual elements
  private groundMesh!: THREE.Mesh;
  private smokeParticles!: THREE.Points;
  private smokeMaterial!: THREE.PointsMaterial;
  private skyColor = new THREE.Color();
  private factoryGroup = new THREE.Group();

  // Wind
  private windAngle = 0;
  private windSpeed = 0;

  // Metrics
  private avgPollution = 0;
  private maxPollution = 0;

  protected async setup(): Promise<void> {
    const gridSize = 64;
    this.pollutionGrid = new DiffusionGrid(
      gridSize,
      gridSize,
      this.params.diffusionRate as number,
      this.params.absorptionRate as number
    );

    // Create cityscape
    this.createCity();

    // Create factories
    this.createFactories();

    // Create smoke particles
    this.createSmokeParticles();

    // Add factory group
    this.context.scene.add(this.factoryGroup);

    // Setup lighting
    this.setupLighting();

    // Initialize wind
    this.windAngle = Math.random() * Math.PI * 2;
    this.windSpeed = this.params.windSpeed as number;
  }

  private createCity(): void {
    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(50, 50);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x444444,
      roughness: 0.9,
    });
    this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.receiveShadow = true;
    this.context.scene.add(this.groundMesh);

    // Random city buildings
    const buildingMat = new THREE.MeshStandardMaterial({ color: 0x666666 });

    for (let i = 0; i < 50; i++) {
      const width = 1 + Math.random() * 2;
      const height = 2 + Math.random() * 8;
      const depth = 1 + Math.random() * 2;

      const buildingGeo = new THREE.BoxGeometry(width, height, depth);
      const building = new THREE.Mesh(buildingGeo, buildingMat);

      building.position.set(
        (Math.random() - 0.5) * 40,
        height / 2,
        (Math.random() - 0.5) * 40
      );
      building.castShadow = true;
      building.receiveShadow = true;
      this.context.scene.add(building);
    }
  }

  private createFactories(): void {
    const count = this.params.factoryCount as number;

    for (let i = 0; i < count; i++) {
      this.spawnFactory();
    }
  }

  private spawnFactory(): Factory {
    const angle = Math.random() * Math.PI * 2;
    const radius = 8 + Math.random() * 12;

    const factory: Factory = {
      id: this.nextFactoryId++,
      position: new THREE.Vector3(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius
      ),
      emissionRate: this.params.emissionRate as number,
      mesh: null,
    };

    // Factory building
    const group = new THREE.Group();

    // Main building
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(3, 4, 3),
      new THREE.MeshStandardMaterial({ color: 0x555555 })
    );
    building.position.y = 2;
    group.add(building);

    // Smokestack
    const stack = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.5, 6, 8),
      new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    stack.position.set(0.8, 5, 0);
    group.add(stack);

    // Red warning light
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    light.position.set(0.8, 8, 0);
    group.add(light);

    group.position.copy(factory.position);
    this.factoryGroup.add(group);
    factory.mesh = group;

    this.factories.push(factory);
    return factory;
  }

  private createSmokeParticles(): void {
    const particleCount = 5000;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 50;
      positions[i * 3 + 1] = Math.random() * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 50;
      colors[i * 3] = 0.5;
      colors[i * 3 + 1] = 0.5;
      colors[i * 3 + 2] = 0.5;
      sizes[i] = 0.5 + Math.random() * 0.5;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    this.smokeMaterial = new THREE.PointsMaterial({
      size: 1,
      vertexColors: true,
      transparent: true,
      opacity: 0.4,
      sizeAttenuation: true,
    });

    this.smokeParticles = new THREE.Points(geometry, this.smokeMaterial);
    this.context.scene.add(this.smokeParticles);
  }

  private updateSmokeParticles(): void {
    const positions = this.smokeParticles.geometry.attributes.position.array as Float32Array;
    const colors = this.smokeParticles.geometry.attributes.color.array as Float32Array;

    for (let i = 0; i < positions.length / 3; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];

      // Sample pollution at this position
      const gridX = (x / 50 + 0.5) * this.pollutionGrid.width;
      const gridZ = (z / 50 + 0.5) * this.pollutionGrid.height;
      const pollution = this.pollutionGrid.getInterpolated(gridX, gridZ);

      // Color based on pollution (grey to brownish)
      colors[i * 3] = 0.3 + pollution * 0.4; // R
      colors[i * 3 + 1] = 0.3 + pollution * 0.2; // G
      colors[i * 3 + 2] = 0.3; // B

      // Move particles with wind and rise
      positions[i * 3] += Math.cos(this.windAngle) * this.windSpeed * 0.1;
      positions[i * 3 + 1] += 0.05 + pollution * 0.1;
      positions[i * 3 + 2] += Math.sin(this.windAngle) * this.windSpeed * 0.1;

      // Respawn particles that go too high or out of bounds
      if (y > 20 || Math.abs(x) > 25 || Math.abs(z) > 25) {
        // Spawn near a factory
        const factory = this.factories[Math.floor(Math.random() * this.factories.length)];
        if (factory) {
          positions[i * 3] = factory.position.x + (Math.random() - 0.5) * 2;
          positions[i * 3 + 1] = 6 + Math.random() * 2;
          positions[i * 3 + 2] = factory.position.z + (Math.random() - 0.5) * 2;
        }
      }
    }

    this.smokeParticles.geometry.attributes.position.needsUpdate = true;
    this.smokeParticles.geometry.attributes.color.needsUpdate = true;
  }

  private setupLighting(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.context.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(20, 30, 10);
    sun.castShadow = true;
    this.context.scene.add(sun);

    this.context.scene.background = new THREE.Color(0x87ceeb);
  }

  update(dt: number, _elapsed: number): void {
    // Update diffusion params
    this.pollutionGrid.setParams(
      this.params.diffusionRate as number,
      this.params.absorptionRate as number
    );

    // Update wind
    this.windSpeed = this.params.windSpeed as number;
    this.windAngle += (Math.random() - 0.5) * 0.01; // Slow wind direction changes

    // Factories emit pollution
    for (const factory of this.factories) {
      factory.emissionRate = this.params.emissionRate as number;
      const gridX = (factory.position.x / 50 + 0.5) * this.pollutionGrid.width;
      const gridZ = (factory.position.z / 50 + 0.5) * this.pollutionGrid.height;
      this.pollutionGrid.emitRadius(gridX, gridZ, 2, factory.emissionRate * dt);
    }

    // Update diffusion
    const windX = Math.cos(this.windAngle) * this.windSpeed * 0.1;
    const windY = Math.sin(this.windAngle) * this.windSpeed * 0.1;
    this.pollutionGrid.update(dt, windX, windY);

    // Adjust factory count
    const targetFactories = this.params.factoryCount as number;
    while (this.factories.length < targetFactories) {
      this.spawnFactory();
    }
    while (this.factories.length > targetFactories) {
      const factory = this.factories.pop()!;
      if (factory.mesh) this.factoryGroup.remove(factory.mesh);
    }

    // Update metrics
    this.avgPollution = this.pollutionGrid.getAverage();
    this.maxPollution = this.pollutionGrid.getMax();

    // Update sky color based on pollution
    const pollutionLevel = this.avgPollution;
    const clearSky = new THREE.Color(0x87ceeb);
    const pollutedSky = new THREE.Color(0x8b7355);
    this.skyColor.copy(clearSky).lerp(pollutedSky, pollutionLevel * 2);
    this.context.scene.background = this.skyColor;
  }

  render(_alpha: number): void {
    this.updateSmokeParticles();
  }

  getMetrics(): Record<string, number> {
    return {
      avg_pollution: this.avgPollution * 100,
      max_pollution: this.maxPollution * 100,
      factory_count: this.factories.length,
    };
  }

  getParamDescriptors(): ParamDescriptor[] {
    return [
      {
        key: 'diffusionRate',
        label: 'Diffusion Rate',
        type: 'number',
        default: 0.5,
        min: 0.1,
        max: 2,
        step: 0.1,
        folder: 'Atmosphere',
      },
      {
        key: 'absorptionRate',
        label: 'Natural Absorption',
        type: 'number',
        default: 0.1,
        min: 0.01,
        max: 0.5,
        step: 0.01,
        folder: 'Atmosphere',
      },
      {
        key: 'windSpeed',
        label: 'Wind Speed',
        type: 'number',
        default: 2,
        min: 0,
        max: 10,
        step: 0.5,
        folder: 'Atmosphere',
      },
      {
        key: 'factoryCount',
        label: 'Number of Factories',
        type: 'number',
        default: 5,
        min: 1,
        max: 15,
        step: 1,
        folder: 'Industry',
      },
      {
        key: 'emissionRate',
        label: 'Emission Rate',
        type: 'number',
        default: 0.2,
        min: 0.05,
        max: 1,
        step: 0.05,
        folder: 'Industry',
      },
    ];
  }

  getChartDescriptors(): ChartDescriptor[] {
    return [
      {
        id: 'pollution',
        title: 'Air Quality',
        series: [
          { label: 'Avg Pollution', color: '#888888' },
          { label: 'Max Pollution', color: '#ff4444' },
        ],
        yRange: [0, 100],
      },
    ];
  }

  getCameraPresets(): CameraPreset[] {
    return [
      { name: 'Overview', position: [30, 25, 30], target: [0, 5, 0] },
      { name: 'Street Level', position: [15, 3, 15], target: [0, 5, 0] },
      { name: 'Aerial', position: [0, 40, 20], target: [0, 0, 0] },
    ];
  }

  reset(): void {
    this.pollutionGrid.reset();
    this.context.scene.background = new THREE.Color(0x87ceeb);
  }

  dispose(): void {
    this.groundMesh.geometry.dispose();
    (this.groundMesh.material as THREE.Material).dispose();
    this.smokeParticles.geometry.dispose();
    this.smokeMaterial.dispose();
  }
}

// Register
ScenarioRegistry.register({
  metadata: new PollutionScenario().metadata,
  create: () => new PollutionScenario(),
});
