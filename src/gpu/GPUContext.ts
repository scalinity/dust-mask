import type { GPUContextConfig, GPUContextResult } from "../types";

export async function initGPU(
  config: GPUContextConfig,
): Promise<GPUContextResult> {
  // Check WebGPU support
  if (!navigator.gpu) {
    throw new Error(
      "WebGPU is not supported in this browser.\n\n" +
        "Please ensure you are running a recent version of Electron with WebGPU enabled.",
    );
  }

  // Request high-performance adapter
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });

  if (!adapter) {
    throw new Error(
      "Failed to get GPU adapter.\n\n" +
        "Your system may not have a compatible GPU.",
    );
  }

  // Log adapter info
  const info = await adapter.requestAdapterInfo();
  console.log("GPU Adapter:", info.vendor, info.architecture, info.device);

  // Request device with required features
  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
      maxComputeWorkgroupStorageSize:
        adapter.limits.maxComputeWorkgroupStorageSize,
      maxComputeInvocationsPerWorkgroup:
        adapter.limits.maxComputeInvocationsPerWorkgroup,
      maxComputeWorkgroupSizeX: adapter.limits.maxComputeWorkgroupSizeX,
    },
  });

  // Handle device loss
  device.lost.then((info) => {
    console.error("GPU device lost:", info.message);
    if (info.reason !== "destroyed") {
      // Attempt recovery by reloading
      window.location.reload();
    }
  });

  // Handle uncaptured errors (shader compilation, validation, etc.)
  device.addEventListener("uncapturederror", (event) => {
    console.error("GPU Uncaptured Error:", event.error);
    if (event.error instanceof GPUValidationError) {
      console.error("Validation Error:", event.error.message);
    }
  });

  // Configure canvas context
  const context = config.canvas.getContext("webgpu");
  if (!context) {
    throw new Error("Failed to get WebGPU context from canvas.");
  }

  const format = navigator.gpu.getPreferredCanvasFormat();

  context.configure({
    device,
    format,
    alphaMode: "premultiplied",
  });

  return {
    adapter,
    device,
    context,
    format,
  };
}

export function resizeCanvas(
  canvas: HTMLCanvasElement,
  context: GPUCanvasContext,
  device: GPUDevice,
  format: GPUTextureFormat,
): { width: number; height: number } {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.floor(canvas.clientWidth * dpr);
  const height = Math.floor(canvas.clientHeight * dpr);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;

    context.configure({
      device,
      format,
      alphaMode: "premultiplied",
    });
  }

  return { width, height };
}
