export interface ComputeBuffer {
  id: string;
  data: Float32Array;
  gpuBuffer?: GPUBuffer;
}

/**
 * Manages WebGPU compute shaders with CPU fallback.
 * When WebGPU is unavailable, compute operations run on CPU.
 */
export class ComputeManager {
  private isWebGPU: boolean;
  private device: GPUDevice | null = null;
  private buffers: Map<string, ComputeBuffer> = new Map();
  private pipelines: Map<string, GPUComputePipeline> = new Map();

  constructor(isWebGPU: boolean) {
    this.isWebGPU = isWebGPU;
  }

  async init(): Promise<void> {
    if (!this.isWebGPU) return;

    try {
      const adapter = await navigator.gpu?.requestAdapter();
      this.device = (await adapter?.requestDevice()) ?? null;
    } catch (e) {
      console.warn('Failed to get WebGPU device for compute:', e);
      this.device = null;
    }
  }

  get canUseGPUCompute(): boolean {
    return this.isWebGPU && this.device !== null;
  }

  createBuffer(id: string, data: Float32Array): ComputeBuffer {
    const buffer: ComputeBuffer = { id, data };

    if (this.canUseGPUCompute && this.device) {
      buffer.gpuBuffer = this.device.createBuffer({
        size: data.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
        mappedAtCreation: true,
      });
      new Float32Array(buffer.gpuBuffer.getMappedRange()).set(data);
      buffer.gpuBuffer.unmap();
    }

    this.buffers.set(id, buffer);
    return buffer;
  }

  updateBuffer(id: string, data: Float32Array): void {
    const buffer = this.buffers.get(id);
    if (!buffer) return;

    buffer.data.set(data);

    if (buffer.gpuBuffer && this.device) {
      this.device.queue.writeBuffer(buffer.gpuBuffer, 0, data);
    }
  }

  async createComputePipeline(
    id: string,
    shaderCode: string,
    bindGroupLayout: GPUBindGroupLayoutDescriptor
  ): Promise<boolean> {
    if (!this.canUseGPUCompute || !this.device) return false;

    try {
      const shaderModule = this.device.createShaderModule({ code: shaderCode });
      const layout = this.device.createBindGroupLayout(bindGroupLayout);
      const pipelineLayout = this.device.createPipelineLayout({
        bindGroupLayouts: [layout],
      });

      const pipeline = this.device.createComputePipeline({
        layout: pipelineLayout,
        compute: {
          module: shaderModule,
          entryPoint: 'main',
        },
      });

      this.pipelines.set(id, pipeline);
      return true;
    } catch (e) {
      console.warn('Failed to create compute pipeline:', e);
      return false;
    }
  }

  dispatch(
    pipelineId: string,
    bindGroup: GPUBindGroup,
    workgroupsX: number,
    workgroupsY = 1,
    workgroupsZ = 1
  ): void {
    if (!this.canUseGPUCompute || !this.device) return;

    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) return;

    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(workgroupsX, workgroupsY, workgroupsZ);
    passEncoder.end();

    this.device.queue.submit([commandEncoder.finish()]);
  }

  async readBuffer(id: string): Promise<Float32Array | null> {
    const buffer = this.buffers.get(id);
    if (!buffer) return null;

    if (!buffer.gpuBuffer || !this.device) {
      return buffer.data;
    }

    // Create staging buffer for reading
    const stagingBuffer = this.device.createBuffer({
      size: buffer.data.byteLength,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const commandEncoder = this.device.createCommandEncoder();
    commandEncoder.copyBufferToBuffer(
      buffer.gpuBuffer,
      0,
      stagingBuffer,
      0,
      buffer.data.byteLength
    );
    this.device.queue.submit([commandEncoder.finish()]);

    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(stagingBuffer.getMappedRange().slice(0));
    stagingBuffer.unmap();
    stagingBuffer.destroy();

    // Update CPU-side copy
    buffer.data.set(result);
    return result;
  }

  dispose(): void {
    for (const buffer of this.buffers.values()) {
      buffer.gpuBuffer?.destroy();
    }
    this.buffers.clear();
    this.pipelines.clear();
  }
}
