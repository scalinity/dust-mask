// Vector types
export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Vec4 {
  x: number;
  y: number;
  z: number;
  w: number;
}

// GPU Context
export interface GPUContextConfig {
  canvas: HTMLCanvasElement;
}

export interface GPUContextResult {
  adapter: GPUAdapter;
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
}

// Particle System
export interface ParticleSystemConfig {
  particleCount: number;
  forceFieldSize: number;
}

export interface SimParams {
  deltaTime: number;
  time: number;
  particleCount: number;
  forceFieldSize: number;
}

// Force Field
export interface ForceFieldCell {
  forceX: number;
  forceY: number;
  forceZ: number;
  strength: number;
}

// Tracking
export interface FaceLandmark {
  x: number;
  y: number;
  z: number;
}

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface TrackingResult {
  faces: FaceResult[];
  hands: HandResult[];
  timestamp: number;
}

export interface FaceResult {
  landmarks: FaceLandmark[];
  blendshapes?: Map<string, number>;
}

export interface HandResult {
  landmarks: HandLandmark[];
  handedness: "Left" | "Right";
}

// Gestures
export interface Gestures {
  // Hand gestures
  pinch: boolean;
  pinchPosition?: Vec2;
  pinchStrength: number;

  grab: boolean;
  grabStrength: number;

  openPalm: boolean;
  palmPosition?: Vec2;
  palmNormal?: Vec3;

  swipeVelocity: Vec2;

  // Face gestures
  headTilt: number; // -1 to 1 (left to right)
  headNod: number; // -1 to 1 (down to up)

  blinkLeft: boolean;
  blinkRight: boolean;

  mouthOpen: number; // 0 to 1
}

// Camera
export interface CameraConfig {
  width: number;
  height: number;
  facingMode: "user" | "environment";
}

// App state
export interface AppState {
  isRunning: boolean;
  fps: number;
  particleCount: number;
  trackingActive: boolean;
}

// Declare global electron API
declare global {
  interface Window {
    electron: {
      platform: string;
      isDev: boolean;
    };
  }
}
