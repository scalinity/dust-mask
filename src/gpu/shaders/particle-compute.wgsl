// Particle physics compute shader
// Particles are assigned to landmarks and spread around them

struct SimParams {
  deltaTime: f32,
  time: f32,
  particleCount: u32,
  numLandmarks: u32,
  screenWidth: f32,
  screenHeight: f32,
  _pad0: f32,
  _pad1: f32,
}

// Particle data (Structure of Arrays)
@group(0) @binding(0) var<storage, read_write> positions: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> velocities: array<vec4f>;

// Landmark positions (up to 512 landmarks: 468 face + 42 hands)
// Each vec4: xy = position, z = active (1.0 or 0.0), w = landmark type
@group(0) @binding(2) var<storage, read> landmarks: array<vec4f>;

// Simulation parameters
@group(0) @binding(3) var<uniform> params: SimParams;

// Constants
const DAMPING: f32 = 0.92;
const NOISE_STRENGTH: f32 = 0.015;  // More noise for organic feel
const SEEK_STRENGTH: f32 = 0.08;   // Gentler seeking
const SPREAD_RADIUS: f32 = 0.06;   // Large spread for overlap between landmarks
const MIN_SPREAD: f32 = 0.01;      // Minimum offset

// Simple pseudo-random
fn hash(p: vec2f) -> f32 {
  let h = dot(p, vec2f(127.1, 311.7));
  return fract(sin(h) * 43758.5453);
}

fn hash2(p: vec2f) -> vec2f {
  return vec2f(
    hash(p),
    hash(p + vec2f(37.0, 17.0))
  );
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) globalId: vec3u) {
  let idx = globalId.x;

  if (idx >= params.particleCount) {
    return;
  }

  // Load particle data
  var pos = positions[idx];
  var vel = velocities[idx];
  let dt = params.deltaTime;

  let numLandmarks = params.numLandmarks;

  if (numLandmarks > 0u) {
    // Assign this particle to a landmark based on its index
    let landmarkIdx = idx % numLandmarks;
    let landmark = landmarks[landmarkIdx];

    // Check if landmark is active
    if (landmark.z > 0.5) {
      // Each particle gets a unique, stable offset based on its index
      // This creates a disk distribution around the landmark
      let particleSeed = vec2f(f32(idx) * 0.1234, f32(idx) * 0.5678);
      let randVals = hash2(particleSeed);

      // Convert to polar coordinates for circular spread
      let angle = randVals.x * 6.28318; // 0 to 2π
      let radius = MIN_SPREAD + randVals.y * SPREAD_RADIUS; // min to max spread

      let offsetX = cos(angle) * radius;
      let offsetY = sin(angle) * radius;

      let targetX = landmark.x + offsetX;
      let targetY = landmark.y + offsetY;

      // Calculate direction to target
      let toTarget = vec2f(targetX - pos.x, targetY - pos.y);
      let dist = length(toTarget);

      if (dist > 0.001) {
        // Seek behavior: accelerate toward target
        let seekForce = toTarget / dist * SEEK_STRENGTH;
        vel.x += seekForce.x * dt * 60.0;
        vel.y += seekForce.y * dt * 60.0;

        // Stronger damping when close to target (arrival behavior)
        let arrivalDamping = mix(DAMPING, 0.7, clamp(1.0 - dist * 5.0, 0.0, 1.0));
        vel.x *= arrivalDamping;
        vel.y *= arrivalDamping;
      }
    } else {
      // Landmark not active - gentle drift toward center
      let toCenter = -pos.xy * 0.01;
      vel.x += toCenter.x;
      vel.y += toCenter.y;
      vel.x *= 0.95;
      vel.y *= 0.95;
    }
  } else {
    // No landmarks - particles drift toward center slowly
    let toCenter = -pos.xy * 0.02;
    vel.x += toCenter.x;
    vel.y += toCenter.y;
    vel.x *= 0.95;
    vel.y *= 0.95;
  }

  // Add subtle noise for organic movement
  let noiseInput = pos.xy * 3.0 + vec2f(params.time * 0.5, f32(idx) * 0.01);
  let noise = (hash2(noiseInput) - 0.5) * 2.0;
  vel.x += noise.x * NOISE_STRENGTH;
  vel.y += noise.y * NOISE_STRENGTH;

  // Clamp velocity
  let speed = length(vel.xy);
  if (speed > 1.0) {
    vel.x = vel.x / speed;
    vel.y = vel.y / speed;
  }

  // Update position
  pos.x += vel.x * dt;
  pos.y += vel.y * dt;

  // Soft boundary constraints
  if (pos.x < -1.2) { pos.x = -1.2; vel.x *= -0.5; }
  if (pos.x > 1.2) { pos.x = 1.2; vel.x *= -0.5; }
  if (pos.y < -1.2) { pos.y = -1.2; vel.y *= -0.5; }
  if (pos.y > 1.2) { pos.y = 1.2; vel.y *= -0.5; }

  // Store updated particle data
  positions[idx] = pos;
  velocities[idx] = vel;
}
