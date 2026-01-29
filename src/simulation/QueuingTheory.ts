/**
 * M/M/1 Queue Model
 *
 * λ (lambda): Arrival rate (packets/sec)
 * μ (mu): Service rate (capacity - packets/sec)
 * ρ (rho): Utilization = λ/μ
 *
 * Queue length: L = ρ / (1 - ρ) when ρ < 1
 * Wait time: W = 1 / (μ - λ)
 * Packet loss probability when ρ >= 1 or buffer full
 */
export class MM1Queue {
  private capacity: number; // μ - service rate (bandwidth)
  private bufferSize: number; // Max queue length
  private arrivalRate: number; // λ - current arrival rate
  private queueLength: number; // Current packets in queue
  private packetsServed: number;
  private packetsDropped: number;
  private totalLatency: number;

  constructor(capacity: number = 100, bufferSize: number = 50) {
    this.capacity = capacity;
    this.bufferSize = bufferSize;
    this.arrivalRate = 0;
    this.queueLength = 0;
    this.packetsServed = 0;
    this.packetsDropped = 0;
    this.totalLatency = 0;
  }

  setParams(capacity: number, bufferSize: number): void {
    this.capacity = capacity;
    this.bufferSize = bufferSize;
  }

  /**
   * Get utilization (ρ = λ/μ).
   */
  getUtilization(): number {
    if (this.capacity <= 0) return 1;
    return Math.min(1, this.arrivalRate / this.capacity);
  }

  /**
   * Get theoretical average queue length.
   */
  getTheoreticalQueueLength(): number {
    const rho = this.getUtilization();
    if (rho >= 1) return this.bufferSize; // Saturated
    return rho / (1 - rho);
  }

  /**
   * Get theoretical average latency (waiting time).
   */
  getTheoreticalLatency(): number {
    if (this.arrivalRate >= this.capacity) return Infinity;
    return 1 / (this.capacity - this.arrivalRate);
  }

  /**
   * Get current actual queue length.
   */
  getQueueLength(): number {
    return this.queueLength;
  }

  /**
   * Get packet loss rate (dropped / total).
   */
  getPacketLossRate(): number {
    const total = this.packetsServed + this.packetsDropped;
    if (total === 0) return 0;
    return this.packetsDropped / total;
  }

  /**
   * Get average latency of served packets.
   */
  getAverageLatency(): number {
    if (this.packetsServed === 0) return 0;
    return this.totalLatency / this.packetsServed;
  }

  /**
   * Simulate queue for one timestep.
   *
   * @param dt - Time step
   * @param arrivalRate - Current arrival rate (λ)
   * @returns Object with packets served, dropped, queue state
   */
  update(
    dt: number,
    arrivalRate: number
  ): { served: number; dropped: number; queueLength: number } {
    this.arrivalRate = arrivalRate;

    // Calculate arrivals this step (Poisson-like)
    const expectedArrivals = arrivalRate * dt;
    const arrivals = Math.floor(expectedArrivals + (Math.random() < expectedArrivals % 1 ? 1 : 0));

    // Calculate service this step
    const maxService = this.capacity * dt;
    const served = Math.min(this.queueLength + arrivals, maxService);

    // Update queue
    const newQueueLength = this.queueLength + arrivals - served;

    // Check for drops (buffer overflow)
    let dropped = 0;
    if (newQueueLength > this.bufferSize) {
      dropped = newQueueLength - this.bufferSize;
      this.queueLength = this.bufferSize;
    } else {
      this.queueLength = Math.max(0, newQueueLength);
    }

    // Update stats
    this.packetsServed += served;
    this.packetsDropped += dropped;

    // Estimate latency for served packets (queueing time)
    const latency = this.queueLength / Math.max(1, this.capacity);
    this.totalLatency += served * latency;

    return {
      served: Math.floor(served),
      dropped,
      queueLength: this.queueLength,
    };
  }

  reset(): void {
    this.queueLength = 0;
    this.packetsServed = 0;
    this.packetsDropped = 0;
    this.totalLatency = 0;
    this.arrivalRate = 0;
  }

  getStats(): {
    utilization: number;
    queueLength: number;
    packetLoss: number;
    latency: number;
    packetsServed: number;
    packetsDropped: number;
  } {
    return {
      utilization: this.getUtilization(),
      queueLength: this.queueLength,
      packetLoss: this.getPacketLossRate(),
      latency: this.getAverageLatency(),
      packetsServed: this.packetsServed,
      packetsDropped: this.packetsDropped,
    };
  }
}

/**
 * Packet representation for visual simulation.
 */
export interface Packet {
  id: number;
  source: number; // User ID
  size: number;
  createdAt: number;
  position: number; // 0-1 along the path
  state: 'queued' | 'transmitting' | 'delivered' | 'dropped';
}

/**
 * Visual packet manager for the bandwidth scenario.
 */
export class PacketManager {
  private packets: Packet[] = [];
  private nextId = 0;
  private maxPackets: number;

  constructor(maxPackets: number = 2000) {
    this.maxPackets = maxPackets;
  }

  createPacket(source: number, size: number, time: number): Packet | null {
    if (this.packets.length >= this.maxPackets) {
      // Remove oldest delivered/dropped packets
      const idx = this.packets.findIndex(
        (p) => p.state === 'delivered' || p.state === 'dropped'
      );
      if (idx !== -1) {
        this.packets.splice(idx, 1);
      } else {
        return null; // Can't create more packets
      }
    }

    const packet: Packet = {
      id: this.nextId++,
      source,
      size,
      createdAt: time,
      position: 0,
      state: 'queued',
    };

    this.packets.push(packet);
    return packet;
  }

  getPackets(): Packet[] {
    return this.packets;
  }

  getActivePackets(): Packet[] {
    return this.packets.filter(
      (p) => p.state === 'queued' || p.state === 'transmitting'
    );
  }

  updatePacket(id: number, updates: Partial<Packet>): void {
    const packet = this.packets.find((p) => p.id === id);
    if (packet) {
      Object.assign(packet, updates);
    }
  }

  removeDelivered(): Packet[] {
    const delivered = this.packets.filter((p) => p.state === 'delivered');
    this.packets = this.packets.filter((p) => p.state !== 'delivered');
    return delivered;
  }

  removeDropped(): Packet[] {
    const dropped = this.packets.filter((p) => p.state === 'dropped');
    this.packets = this.packets.filter((p) => p.state !== 'dropped');
    return dropped;
  }

  reset(): void {
    this.packets = [];
    this.nextId = 0;
  }
}
