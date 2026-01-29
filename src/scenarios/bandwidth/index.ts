import * as THREE from 'three';
import { ScenarioBase } from '../ScenarioBase';
import { ScenarioRegistry } from '../ScenarioRegistry';
import { MM1Queue, PacketManager, type Packet } from '../../simulation/QueuingTheory';
import type {
  ScenarioMetadata,
  ParamDescriptor,
  ChartDescriptor,
  CameraPreset,
} from '../../core/types';

interface User {
  id: number;
  position: THREE.Vector3;
  dataRate: number;
  color: THREE.Color;
  mesh: THREE.Mesh | null;
}

interface VisualPacket {
  packet: Packet;
  mesh: THREE.Mesh;
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
}

export class BandwidthScenario extends ScenarioBase {
  readonly metadata: ScenarioMetadata = {
    id: 'bandwidth',
    title: 'Network Congestion',
    subtitle: 'Users compete for shared bandwidth',
    description:
      'Users stream data through a shared network. Too much demand causes congestion and packet loss.',
    category: 'abstract',
    color: '#9e4aff',
    infoContent: {
      title: 'The Digital Commons',
      body: `
        <p>Network bandwidth is a shared resource. Each user can consume as much as they want, but...</p>
        <ul>
          <li>When total demand exceeds capacity, everyone suffers</li>
          <li>Packets get queued, increasing latency</li>
          <li>Eventually packets are dropped (lost data)</li>
          <li>Quality degrades for all users</li>
        </ul>
        <p><strong>Watch for:</strong> Colors shift from cool blue (low load) to hot red (congested). Packets explode when dropped.</p>
      `,
    },
  };

  // Simulation state
  private queue!: MM1Queue;
  private packetManager!: PacketManager;
  private users: User[] = [];
  private nextUserId = 0;
  private visualPackets: VisualPacket[] = [];

  // Visual elements
  private serverMesh!: THREE.Mesh;
  private tubeMesh!: THREE.Mesh;
  private userGroup = new THREE.Group();
  private packetGroup = new THREE.Group();
  private explosionGroup = new THREE.Group();

  // Neon materials
  private tubeMaterial!: THREE.MeshBasicMaterial;

  // Metrics
  private utilization = 0;

  protected async setup(): Promise<void> {
    // Initialize queue
    this.queue = new MM1Queue(
      this.params.bandwidth as number,
      this.params.bufferSize as number
    );
    this.packetManager = new PacketManager(2000);

    // Create visual elements
    this.createServer();
    this.createTube();
    this.createUsers();

    // Add groups
    this.context.scene.add(this.userGroup);
    this.context.scene.add(this.packetGroup);
    this.context.scene.add(this.explosionGroup);

    // Setup lighting
    this.setupLighting();
  }

  private createServer(): void {
    // Central server (glowing cube)
    const geometry = new THREE.BoxGeometry(3, 3, 3);
    const material = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 0.5,
      metalness: 0.8,
      roughness: 0.2,
    });

    this.serverMesh = new THREE.Mesh(geometry, material);
    this.serverMesh.position.set(0, 0, 0);
    this.context.scene.add(this.serverMesh);

    // Server glow
    const glowGeo = new THREE.SphereGeometry(5, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.1,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    this.context.scene.add(glow);
  }

  private createTube(): void {
    // Ring of tubes around server
    const tubeRadius = 15;
    const tubeThickness = 0.3;

    const curve = new THREE.EllipseCurve(0, 0, tubeRadius, tubeRadius, 0, 2 * Math.PI, false, 0);
    const points = curve.getPoints(64);
    const geometry = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p.x, 0, p.y))),
      64,
      tubeThickness,
      8,
      true
    );

    this.tubeMaterial = new THREE.MeshBasicMaterial({
      color: 0x0044ff,
      transparent: true,
      opacity: 0.6,
    });

    this.tubeMesh = new THREE.Mesh(geometry, this.tubeMaterial);
    this.context.scene.add(this.tubeMesh);
  }

  private createUsers(): void {
    const userCount = this.params.userCount as number;
    for (let i = 0; i < userCount; i++) {
      this.spawnUser();
    }
  }

  private spawnUser(): User {
    const angle = (this.users.length / (this.params.userCount as number)) * Math.PI * 2;
    const radius = 15;

    const user: User = {
      id: this.nextUserId++,
      position: new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius),
      dataRate: this.params.userDataRate as number,
      color: new THREE.Color().setHSL(angle / (Math.PI * 2), 0.8, 0.5),
      mesh: null,
    };

    // User node (glowing sphere)
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 16, 16),
      new THREE.MeshStandardMaterial({
        color: user.color,
        emissive: user.color,
        emissiveIntensity: 0.5,
      })
    );
    mesh.position.copy(user.position);
    this.userGroup.add(mesh);
    user.mesh = mesh;

    // Connection line to server
    const lineMat = new THREE.LineBasicMaterial({
      color: user.color,
      transparent: true,
      opacity: 0.3,
    });
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      user.position,
      new THREE.Vector3(0, 0, 0),
    ]);
    const line = new THREE.Line(lineGeo, lineMat);
    this.userGroup.add(line);

    this.users.push(user);
    return user;
  }

  private setupLighting(): void {
    const ambient = new THREE.AmbientLight(0x111133, 0.5);
    this.context.scene.add(ambient);

    // Colored point lights
    const light1 = new THREE.PointLight(0x00ffff, 1, 30);
    light1.position.set(0, 10, 0);
    this.context.scene.add(light1);

    // Dark cyber background
    this.context.scene.background = new THREE.Color(0x0a0a1a);

    // Grid floor
    const gridHelper = new THREE.GridHelper(40, 20, 0x004444, 0x002222);
    gridHelper.position.y = -3;
    this.context.scene.add(gridHelper);
  }

  update(dt: number, elapsed: number): void {
    // Update queue params
    this.queue.setParams(
      this.params.bandwidth as number,
      this.params.bufferSize as number
    );

    // Adjust user count
    const targetUsers = this.params.userCount as number;
    while (this.users.length < targetUsers) {
      this.spawnUser();
    }
    while (this.users.length > targetUsers) {
      const user = this.users.pop()!;
      if (user.mesh) this.userGroup.remove(user.mesh);
    }

    // Calculate total arrival rate
    const userDataRate = this.params.userDataRate as number;
    let totalArrivalRate = 0;
    for (const user of this.users) {
      user.dataRate = userDataRate;
      totalArrivalRate += user.dataRate;
    }

    // Update queue
    const result = this.queue.update(dt, totalArrivalRate);

    // Create visual packets
    for (let i = 0; i < Math.min(result.served, 5); i++) {
      this.createVisualPacket(elapsed);
    }

    // Create explosion effects for dropped packets
    for (let i = 0; i < result.dropped; i++) {
      this.createExplosion();
    }

    // Update visual packets
    this.updateVisualPackets(dt);

    // Update metrics
    this.utilization = this.queue.getUtilization();

    // Update tube color based on utilization
    const hue = 0.6 - this.utilization * 0.6; // Blue to red
    this.tubeMaterial.color.setHSL(hue, 0.8, 0.5);
    this.tubeMaterial.opacity = 0.3 + this.utilization * 0.5;

    // Update server color
    const serverMat = this.serverMesh.material as THREE.MeshStandardMaterial;
    serverMat.emissive.setHSL(hue, 0.8, 0.5);
  }

  private createVisualPacket(elapsed: number): void {
    if (this.visualPackets.length > 100) return;

    const user = this.users[Math.floor(Math.random() * this.users.length)];
    if (!user) return;

    const packet = this.packetManager.createPacket(user.id, 1, elapsed);
    if (!packet) return;

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.3, 0.3),
      new THREE.MeshBasicMaterial({ color: user.color })
    );
    mesh.position.copy(user.position);
    this.packetGroup.add(mesh);

    this.visualPackets.push({
      packet,
      mesh,
      startPos: user.position.clone(),
      endPos: new THREE.Vector3(0, 0, 0),
    });
  }

  private updateVisualPackets(dt: number): void {
    for (let i = this.visualPackets.length - 1; i >= 0; i--) {
      const vp = this.visualPackets[i];
      vp.packet.position += dt * 2; // Speed

      if (vp.packet.position >= 1) {
        // Arrived
        this.packetGroup.remove(vp.mesh);
        vp.mesh.geometry.dispose();
        (vp.mesh.material as THREE.Material).dispose();
        this.visualPackets.splice(i, 1);
      } else {
        // Interpolate position
        vp.mesh.position.lerpVectors(vp.startPos, vp.endPos, vp.packet.position);

        // Add some wave motion
        const wave = Math.sin(vp.packet.position * Math.PI * 4) * 0.5;
        vp.mesh.position.y += wave;
      }
    }
  }

  private createExplosion(): void {
    // Particle burst for dropped packet
    const particleCount = 20;
    const positions = new Float32Array(particleCount * 3);
    const velocities: THREE.Vector3[] = [];

    const angle = Math.random() * Math.PI * 2;
    const radius = 10 + Math.random() * 5;
    const center = new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = center.x;
      positions[i * 3 + 1] = center.y;
      positions[i * 3 + 2] = center.z;

      velocities.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 10,
          Math.random() * 5,
          (Math.random() - 0.5) * 10
        )
      );
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xff4444,
      size: 0.3,
      transparent: true,
      opacity: 1,
    });

    const points = new THREE.Points(geometry, material);
    (points as any).velocities = velocities;
    (points as any).life = 1;

    this.explosionGroup.add(points);

    // Animate and remove after a short time
    const animate = () => {
      const life = (points as any).life;
      if (life <= 0) {
        this.explosionGroup.remove(points);
        geometry.dispose();
        material.dispose();
        return;
      }

      (points as any).life -= 0.02;
      material.opacity = life;

      const pos = geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < velocities.length; i++) {
        pos[i * 3] += velocities[i].x * 0.02;
        pos[i * 3 + 1] += velocities[i].y * 0.02;
        pos[i * 3 + 2] += velocities[i].z * 0.02;
        velocities[i].y -= 0.5; // Gravity
      }
      geometry.attributes.position.needsUpdate = true;

      requestAnimationFrame(animate);
    };

    animate();
  }

  render(_alpha: number): void {
    // Rotate server slightly
    this.serverMesh.rotation.y += 0.005;
    this.serverMesh.rotation.x = Math.sin(performance.now() * 0.001) * 0.1;
  }

  getMetrics(): Record<string, number> {
    const stats = this.queue.getStats();
    return {
      utilization: stats.utilization * 100,
      queue_length: stats.queueLength,
      packet_loss: stats.packetLoss * 100,
    };
  }

  getParamDescriptors(): ParamDescriptor[] {
    return [
      {
        key: 'bandwidth',
        label: 'Total Bandwidth (Mbps)',
        type: 'number',
        default: 100,
        min: 20,
        max: 500,
        step: 10,
        folder: 'Network',
      },
      {
        key: 'bufferSize',
        label: 'Buffer Size (packets)',
        type: 'number',
        default: 50,
        min: 10,
        max: 200,
        step: 10,
        folder: 'Network',
      },
      {
        key: 'userCount',
        label: 'Number of Users',
        type: 'number',
        default: 8,
        min: 1,
        max: 20,
        step: 1,
        folder: 'Users',
      },
      {
        key: 'userDataRate',
        label: 'Data Rate per User',
        type: 'number',
        default: 10,
        min: 1,
        max: 50,
        step: 1,
        folder: 'Users',
      },
    ];
  }

  getChartDescriptors(): ChartDescriptor[] {
    return [
      {
        id: 'utilization',
        title: 'Network Status',
        series: [
          { label: 'Utilization', color: '#00ffff' },
          { label: 'Packet Loss', color: '#ff4444' },
        ],
        yRange: [0, 100],
      },
    ];
  }

  getCameraPresets(): CameraPreset[] {
    return [
      { name: 'Overview', position: [25, 20, 25], target: [0, 0, 0] },
      { name: 'Top Down', position: [0, 35, 0.1], target: [0, 0, 0] },
      { name: 'Side View', position: [30, 5, 0], target: [0, 0, 0] },
    ];
  }

  reset(): void {
    this.queue.reset();
    this.packetManager.reset();

    for (const vp of this.visualPackets) {
      this.packetGroup.remove(vp.mesh);
      vp.mesh.geometry.dispose();
      (vp.mesh.material as THREE.Material).dispose();
    }
    this.visualPackets = [];
  }

  dispose(): void {
    this.serverMesh.geometry.dispose();
    (this.serverMesh.material as THREE.Material).dispose();
    this.tubeMesh.geometry.dispose();
    this.tubeMaterial.dispose();
  }
}

// Register
ScenarioRegistry.register({
  metadata: new BandwidthScenario().metadata,
  create: () => new BandwidthScenario(),
});
