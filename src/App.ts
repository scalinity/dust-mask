import { initGPU, resizeCanvas } from "./gpu/GPUContext";
import { ParticleSystem } from "./gpu/ParticleSystem";
import { Tracker } from "./tracking/Tracker";
import { GestureDetector } from "./tracking/GestureDetector";
import { CameraCapture } from "./camera/CameraCapture";
import type { Gestures } from "./types";

// Configuration
const PARTICLE_COUNT = 500_000;
const FORCE_FIELD_SIZE = 128; // Keep for backwards compat
const TRACKING_INTERVAL = 33; // ~30 FPS tracking
const MAX_LANDMARKS = 512; // 468 face + 21*2 hands

export class App {
  private canvas: HTMLCanvasElement;
  private cameraPreview: HTMLVideoElement;
  private errorOverlay: HTMLElement;
  private errorMessage: HTMLElement;

  // GPU
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private format!: GPUTextureFormat;
  private particleSystem!: ParticleSystem;

  // Tracking
  private camera!: CameraCapture;
  private tracker!: Tracker;
  private gestureDetector!: GestureDetector;

  // State
  private isRunning = false;
  private lastTrackingTime = 0;
  private currentGestures: Gestures = this.getDefaultGestures();
  private landmarksBuffer: Float32Array;

  // Performance monitoring
  private frameCount = 0;
  private lastFpsTime = 0;
  private currentFps = 0;

  constructor() {
    this.canvas = document.getElementById("canvas") as HTMLCanvasElement;
    this.cameraPreview = document.getElementById(
      "camera-preview",
    ) as HTMLVideoElement;
    this.errorOverlay = document.getElementById("error-overlay") as HTMLElement;
    this.errorMessage = document.getElementById("error-message") as HTMLElement;

    if (
      !this.canvas ||
      !this.cameraPreview ||
      !this.errorOverlay ||
      !this.errorMessage
    ) {
      throw new Error("Required DOM elements not found");
    }

    // Each landmark: vec4(x, y, active, type)
    this.landmarksBuffer = new Float32Array(MAX_LANDMARKS * 4);
  }

  async initialize(): Promise<void> {
    try {
      // Initialize GPU
      console.log("Initializing WebGPU...");
      const gpu = await initGPU({ canvas: this.canvas });
      this.device = gpu.device;
      this.context = gpu.context;
      this.format = gpu.format;

      // Initialize particle system
      console.log("Creating particle system...");
      this.particleSystem = new ParticleSystem(this.device, this.format, {
        particleCount: PARTICLE_COUNT,
        forceFieldSize: FORCE_FIELD_SIZE,
      });
      await this.particleSystem.initialize();

      // Initialize camera
      console.log("Starting camera...");
      this.camera = new CameraCapture();
      await this.camera.initialize(this.cameraPreview, {
        width: 640,
        height: 480,
        facingMode: "user",
      });

      // Initialize tracking
      console.log("Loading tracking models...");
      this.tracker = new Tracker();
      await this.tracker.initialize();

      // Initialize gesture detector
      this.gestureDetector = new GestureDetector();

      console.log("Initialization complete!");
    } catch (error) {
      this.showError(error);
      throw error;
    }
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFpsTime = performance.now();
    this.frameCount = 0;
    this.loop();
  }

  stop(): void {
    this.isRunning = false;
  }

  private loop = (): void => {
    if (!this.isRunning) return;

    // Update FPS counter
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsTime >= 1000) {
      this.currentFps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsTime = now;
      // Log FPS occasionally
      if (Math.random() < 0.1) {
        console.log(`FPS: ${this.currentFps}`);
      }
    }

    // Run tracking at reduced rate
    if (now - this.lastTrackingTime >= TRACKING_INTERVAL) {
      this.updateTracking();
      this.lastTrackingTime = now;
    }

    // Update and render particles
    this.render();

    requestAnimationFrame(this.loop);
  };

  private updateTracking(): void {
    const video = this.camera.getVideoElement();
    if (!video || !this.camera.isReady()) return;

    // Run tracking
    const tracking = this.tracker.track(video);
    if (!tracking) return;

    // Detect gestures
    this.currentGestures = this.gestureDetector.detect(tracking);

    // Clear landmarks buffer
    this.landmarksBuffer.fill(0);

    let landmarkCount = 0;

    // Add face landmarks (up to 468 points)
    for (const face of tracking.faces) {
      for (const lm of face.landmarks) {
        if (landmarkCount >= MAX_LANDMARKS) break;

        const idx = landmarkCount * 4;
        // Convert to normalized device coordinates (-1 to 1)
        // Mirror X because camera is mirrored
        this.landmarksBuffer[idx] = -(lm.x * 2 - 1); // x (mirrored)
        this.landmarksBuffer[idx + 1] = -(lm.y * 2 - 1); // y (flip for screen coords)
        this.landmarksBuffer[idx + 2] = 1.0; // active
        this.landmarksBuffer[idx + 3] = 0.0; // type: face

        landmarkCount++;
      }
    }

    // Add hand landmarks (21 points per hand)
    for (const hand of tracking.hands) {
      for (const lm of hand.landmarks) {
        if (landmarkCount >= MAX_LANDMARKS) break;

        const idx = landmarkCount * 4;
        // Convert to normalized device coordinates (-1 to 1)
        this.landmarksBuffer[idx] = -(lm.x * 2 - 1); // x (mirrored)
        this.landmarksBuffer[idx + 1] = -(lm.y * 2 - 1); // y (flip for screen coords)
        this.landmarksBuffer[idx + 2] = 1.0; // active
        this.landmarksBuffer[idx + 3] = 1.0; // type: hand

        landmarkCount++;
      }
    }

    // Upload landmarks to GPU
    this.particleSystem.updateLandmarks(this.landmarksBuffer, landmarkCount);
  }

  private render(): void {
    // Resize canvas if needed
    const { width, height } = resizeCanvas(
      this.canvas,
      this.context,
      this.device,
      this.format,
    );

    // Update particle simulation
    this.particleSystem.update(width, height);

    // Create command encoder
    const commandEncoder = this.device.createCommandEncoder({
      label: "Main Command Encoder",
    });

    // Run compute pass
    this.particleSystem.compute(commandEncoder);

    // Get current texture for rendering
    const textureView = this.context.getCurrentTexture().createView();

    // Run render pass
    this.particleSystem.render(commandEncoder, textureView, width, height);

    // Submit commands
    this.device.queue.submit([commandEncoder.finish()]);
  }

  private showError(error: unknown): void {
    let message: string;
    if (error instanceof Error) {
      message = error.message;
      console.error("Error:", error.message, error.stack);
    } else if (error instanceof GPUValidationError) {
      message = `GPU Validation Error: ${error.message}`;
      console.error("GPU Validation Error:", error.message);
    } else if (typeof error === "object" && error !== null) {
      message = JSON.stringify(error, null, 2);
      console.error("Error object:", error);
    } else {
      message = String(error);
      console.error("Error:", error);
    }
    this.errorMessage.textContent = message;
    this.errorOverlay.classList.add("visible");
  }

  private getDefaultGestures(): Gestures {
    return {
      pinch: false,
      pinchStrength: 0,
      grab: false,
      grabStrength: 0,
      openPalm: false,
      swipeVelocity: { x: 0, y: 0 },
      headTilt: 0,
      headNod: 0,
      blinkLeft: false,
      blinkRight: false,
      mouthOpen: 0,
    };
  }

  destroy(): void {
    this.isRunning = false;
    this.camera?.destroy();
    this.tracker?.destroy();
    this.particleSystem?.destroy();
  }
}
