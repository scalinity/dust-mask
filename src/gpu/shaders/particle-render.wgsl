// Particle rendering shader
// Renders particles as soft glowing points

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) alpha: f32,
  @location(1) pointCoord: vec2f,
}

struct RenderParams {
  screenWidth: f32,
  screenHeight: f32,
  pointSize: f32,
  time: f32,
}

@group(0) @binding(0) var<storage, read> positions: array<vec4f>;
@group(0) @binding(1) var<storage, read> velocities: array<vec4f>;
@group(0) @binding(2) var<uniform> params: RenderParams;

// Vertex shader - positions particles
@vertex
fn vs_main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
  var output: VertexOutput;

  let pos = positions[instanceIndex];
  let vel = velocities[instanceIndex];
  let age = vel.w;

  // Calculate alpha based on depth only (no age fading)
  let depthAlpha = 0.5 + 0.5 * (1.0 - abs(pos.z));
  output.alpha = depthAlpha * 0.8;

  // Point sprite vertices (2 triangles forming a quad)
  let quadVertices = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f( 1.0, -1.0),
    vec2f(-1.0,  1.0),
    vec2f(-1.0,  1.0),
    vec2f( 1.0, -1.0),
    vec2f( 1.0,  1.0),
  );

  let quadVertex = quadVertices[vertexIndex];
  output.pointCoord = quadVertex * 0.5 + 0.5;

  // Calculate point size based on depth (closer = slightly larger)
  let depthSize = 1.0 + pos.z * 0.3;
  let pixelSize = params.pointSize * depthSize;

  // Convert to screen space
  let aspectRatio = params.screenWidth / params.screenHeight;
  let screenPos = vec2f(pos.x, pos.y * aspectRatio);

  // Add quad offset in screen space
  let offset = quadVertex * pixelSize / vec2f(params.screenWidth, params.screenHeight);

  output.position = vec4f(screenPos + offset, pos.z * 0.5 + 0.5, 1.0);

  return output;
}

// Fragment shader - renders soft glowing point
@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  // Distance from center of point
  let coord = input.pointCoord * 2.0 - 1.0;
  let dist = length(coord);

  // Soft circular falloff
  let falloff = 1.0 - smoothstep(0.0, 1.0, dist);

  // Additional soft glow
  let glow = exp(-dist * dist * 2.0);

  let intensity = (falloff * 0.7 + glow * 0.3) * input.alpha;

  // Dust color - subtle warm white with slight variation
  let baseColor = vec3f(0.95, 0.93, 0.88);

  return vec4f(baseColor * intensity, intensity);
}
