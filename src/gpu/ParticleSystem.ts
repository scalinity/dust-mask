import type { ParticleSystemConfig } from "../types";
import computeShaderCode from "./shaders/particle-compute.wgsl?raw";
import renderShaderCode from "./shaders/particle-render.wgsl?raw";

const WORKGROUP_SIZE = 256;

export class ParticleSystem {
  private device: GPUDevice;
  private format: GPUTextureFormat;

  private particleCount: number;
  private forceFieldSize: number;

  // Buffers
  private positionBuffer!: GPUBuffer;
  private velocityBuffer!: GPUBuffer;
  private landmarksBuffer!: GPUBuffer;
  private simParamsBuffer!: GPUBuffer;
  private renderParamsBuffer!: GPUBuffer;

  // Max landmarks: 468 face + 21*2 hands = 510, round to 512
  private readonly MAX_LANDMARKS = 512;
  private numLandmarks = 0;

  // Pipelines
  private computePipeline!: GPUComputePipeline;
  private renderPipeline!: GPURenderPipeline;

  // Bind groups
  private computeBindGroup!: GPUBindGroup;
  private renderBindGroup!: GPUBindGroup;

  // State
  private time = 0;
  private lastFrameTime = 0;

  constructor(
    device: GPUDevice,
    format: GPUTextureFormat,
    config: ParticleSystemConfig,
  ) {
    this.device = device;
    this.format = format;
    this.particleCount = config.particleCount;
    this.forceFieldSize = config.forceFieldSize;
  }

  async initialize(): Promise<void> {
    this.createBuffers();
    await this.createPipelines();
    this.createBindGroups();
    this.initializeParticles();
  }

  private createBuffers(): void {
    const { device, particleCount, forceFieldSize } = this;

    // Position buffer: vec4f per particle (xyz + padding)
    this.positionBuffer = device.createBuffer({
      size: particleCount * 4 * 4, // 4 floats * 4 bytes
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Velocity buffer: vec4f per particle (xyz velocity + age)
    this.velocityBuffer = device.createBuffer({
      size: particleCount * 4 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Landmarks buffer: vec4f per landmark (xy position, z active, w type)
    this.landmarksBuffer = device.createBuffer({
      size: this.MAX_LANDMARKS * 4 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Simulation params uniform buffer
    this.simParamsBuffer = device.createBuffer({
      size: 32, // 8 floats
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Render params uniform buffer
    this.renderParamsBuffer = device.createBuffer({
      size: 16, // 4 floats
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  private async createPipelines(): Promise<void> {
    const { device, format } = this;

    // Compute shader module
    const computeModule = device.createShaderModule({
      label: "Particle Compute Shader",
      code: computeShaderCode,
    });

    // Check for compute shader compilation errors
    const computeInfo = await computeModule.getCompilationInfo();
    if (computeInfo.messages.length > 0) {
      for (const msg of computeInfo.messages) {
        console.error(
          `Compute shader ${msg.type}: ${msg.message} at line ${msg.lineNum}`,
        );
      }
      const errors = computeInfo.messages.filter((m) => m.type === "error");
      if (errors.length > 0) {
        throw new Error(
          `Compute shader compilation failed: ${errors[0].message}`,
        );
      }
    }

    // Render shader module
    const renderModule = device.createShaderModule({
      label: "Particle Render Shader",
      code: renderShaderCode,
    });

    // Check for render shader compilation errors
    const renderInfo = await renderModule.getCompilationInfo();
    if (renderInfo.messages.length > 0) {
      for (const msg of renderInfo.messages) {
        console.error(
          `Render shader ${msg.type}: ${msg.message} at line ${msg.lineNum}`,
        );
      }
      const errors = renderInfo.messages.filter((m) => m.type === "error");
      if (errors.length > 0) {
        throw new Error(
          `Render shader compilation failed: ${errors[0].message}`,
        );
      }
    }

    // Compute pipeline
    this.computePipeline = device.createComputePipeline({
      label: "Particle Compute Pipeline",
      layout: "auto",
      compute: {
        module: computeModule,
        entryPoint: "main",
      },
    });

    // Render pipeline
    this.renderPipeline = device.createRenderPipeline({
      label: "Particle Render Pipeline",
      layout: "auto",
      vertex: {
        module: renderModule,
        entryPoint: "vs_main",
      },
      fragment: {
        module: renderModule,
        entryPoint: "fs_main",
        targets: [
          {
            format,
            blend: {
              // Additive blending for glow effect
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one",
                operation: "add",
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one",
                operation: "add",
              },
            },
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
      },
    });
  }

  private createBindGroups(): void {
    const { device, computePipeline, renderPipeline } = this;

    // Compute bind group
    this.computeBindGroup = device.createBindGroup({
      label: "Particle Compute Bind Group",
      layout: computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.positionBuffer } },
        { binding: 1, resource: { buffer: this.velocityBuffer } },
        { binding: 2, resource: { buffer: this.landmarksBuffer } },
        { binding: 3, resource: { buffer: this.simParamsBuffer } },
      ],
    });

    // Render bind group
    this.renderBindGroup = device.createBindGroup({
      label: "Particle Render Bind Group",
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.positionBuffer } },
        { binding: 1, resource: { buffer: this.velocityBuffer } },
        { binding: 2, resource: { buffer: this.renderParamsBuffer } },
      ],
    });
  }

  private initializeParticles(): void {
    const { device, particleCount } = this;

    // Initialize positions (random distribution across screen)
    const positions = new Float32Array(particleCount * 4);
    const velocities = new Float32Array(particleCount * 4);

    for (let i = 0; i < particleCount; i++) {
      const idx = i * 4;

      // Random position in [-1, 1] range
      positions[idx] = (Math.random() * 2 - 1) * 0.9; // x
      positions[idx + 1] = (Math.random() * 2 - 1) * 0.9; // y
      positions[idx + 2] = (Math.random() - 0.5) * 0.3; // z (subtle depth)
      positions[idx + 3] = 1.0; // w (unused)

      // Zero initial velocity, random age offset
      velocities[idx] = 0;
      velocities[idx + 1] = 0;
      velocities[idx + 2] = 0;
      velocities[idx + 3] = Math.random() * 5; // age (staggered for visual variety)
    }

    device.queue.writeBuffer(this.positionBuffer, 0, positions);
    device.queue.writeBuffer(this.velocityBuffer, 0, velocities);

    // Initialize landmarks to inactive
    const landmarks = new Float32Array(this.MAX_LANDMARKS * 4);
    device.queue.writeBuffer(this.landmarksBuffer, 0, landmarks);
  }

  updateLandmarks(landmarks: Float32Array, count: number): void {
    this.numLandmarks = count;
    this.device.queue.writeBuffer(this.landmarksBuffer, 0, landmarks);
  }

  // Keep for backwards compatibility but do nothing
  updateForceField(_forceField: Float32Array): void {
    // Deprecated - use updateLandmarks instead
  }

  update(screenWidth: number, screenHeight: number): void {
    const now = performance.now();
    const deltaTime =
      this.lastFrameTime > 0
        ? Math.min((now - this.lastFrameTime) / 1000, 0.05) // Cap at 50ms
        : 0.016;
    this.lastFrameTime = now;
    this.time += deltaTime;

    // Update simulation params
    const simParams = new Float32Array([
      deltaTime, // deltaTime
      this.time, // time
      this.particleCount, // particleCount (as float, will be cast to u32)
      this.numLandmarks, // numLandmarks
      screenWidth, // screenWidth
      screenHeight, // screenHeight
      0, // padding
      0, // padding
    ]);
    // Rewrite as proper uint32 for particleCount and numLandmarks
    const simParamsView = new DataView(simParams.buffer);
    simParamsView.setUint32(8, this.particleCount, true);
    simParamsView.setUint32(12, this.numLandmarks, true);

    this.device.queue.writeBuffer(this.simParamsBuffer, 0, simParams);
  }

  compute(commandEncoder: GPUCommandEncoder): void {
    const workgroupCount = Math.ceil(this.particleCount / WORKGROUP_SIZE);

    const computePass = commandEncoder.beginComputePass({
      label: "Particle Compute Pass",
    });
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, this.computeBindGroup);
    computePass.dispatchWorkgroups(workgroupCount);
    computePass.end();
  }

  render(
    commandEncoder: GPUCommandEncoder,
    textureView: GPUTextureView,
    screenWidth: number,
    screenHeight: number,
  ): void {
    // Update render params
    const renderParams = new Float32Array([
      screenWidth,
      screenHeight,
      2.0, // point size in pixels
      this.time,
    ]);
    this.device.queue.writeBuffer(this.renderParamsBuffer, 0, renderParams);

    const renderPass = commandEncoder.beginRenderPass({
      label: "Particle Render Pass",
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });

    renderPass.setPipeline(this.renderPipeline);
    renderPass.setBindGroup(0, this.renderBindGroup);
    // Draw 6 vertices (quad) per particle instance
    renderPass.draw(6, this.particleCount, 0, 0);
    renderPass.end();
  }

  destroy(): void {
    this.positionBuffer.destroy();
    this.velocityBuffer.destroy();
    this.landmarksBuffer.destroy();
    this.simParamsBuffer.destroy();
    this.renderParamsBuffer.destroy();
  }
}
