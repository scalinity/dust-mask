import type { HandResult, Gestures, Vec2 } from "../types";

// MediaPipe hand landmark indices
const WRIST = 0;
const THUMB_CMC = 1;
const THUMB_MCP = 2;
const THUMB_IP = 3;
const THUMB_TIP = 4;
const INDEX_MCP = 5;
const INDEX_PIP = 6;
const INDEX_DIP = 7;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const MIDDLE_PIP = 10;
const MIDDLE_DIP = 11;
const MIDDLE_TIP = 12;
const RING_MCP = 13;
const RING_PIP = 14;
const RING_DIP = 15;
const RING_TIP = 16;
const PINKY_MCP = 17;
const PINKY_PIP = 18;
const PINKY_DIP = 19;
const PINKY_TIP = 20;

const ALL_LANDMARKS = [
  WRIST,
  THUMB_CMC,
  THUMB_MCP,
  THUMB_IP,
  THUMB_TIP,
  INDEX_MCP,
  INDEX_PIP,
  INDEX_DIP,
  INDEX_TIP,
  MIDDLE_MCP,
  MIDDLE_PIP,
  MIDDLE_DIP,
  MIDDLE_TIP,
  RING_MCP,
  RING_PIP,
  RING_DIP,
  RING_TIP,
  PINKY_MCP,
  PINKY_PIP,
  PINKY_DIP,
  PINKY_TIP,
];

const FINGER_TIPS = [THUMB_TIP, INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP];
const PALM_CENTER = MIDDLE_MCP;

export class HandField {
  private fieldSize: number;
  private field: Float32Array;

  // Velocity tracking for swipe detection
  private prevPalmPositions: Map<string, Vec2> = new Map();
  private palmVelocities: Map<string, Vec2> = new Map();

  // Temporal smoothing
  private prevField: Float32Array | null = null;
  private smoothingFactor = 0.4;

  constructor(fieldSize: number = 128) {
    this.fieldSize = fieldSize;
    this.field = new Float32Array(fieldSize * fieldSize * 4);
  }

  update(hands: HandResult[], gestures: Gestures): Float32Array {
    // Clear field
    this.field.fill(0);

    for (const hand of hands) {
      this.processHand(hand, gestures);
    }

    // Apply temporal smoothing
    if (this.prevField) {
      for (let i = 0; i < this.field.length; i++) {
        this.field[i] =
          this.prevField[i] * (1 - this.smoothingFactor) +
          this.field[i] * this.smoothingFactor;
      }
    }

    if (!this.prevField) {
      this.prevField = new Float32Array(this.field.length);
    }
    this.prevField.set(this.field);

    return this.field;
  }

  private processHand(hand: HandResult, gestures: Gestures): void {
    const landmarks = hand.landmarks;
    if (landmarks.length < 21) return;

    const handId = hand.handedness;

    // Calculate palm position and track velocity
    const palm = landmarks[PALM_CENTER];
    const palmX = palm.x * 2 - 1;
    const palmY = -(palm.y * 2 - 1);

    const prevPalm = this.prevPalmPositions.get(handId);
    if (prevPalm) {
      const velX = palmX - prevPalm.x;
      const velY = palmY - prevPalm.y;
      this.palmVelocities.set(handId, { x: velX, y: velY });
    }
    this.prevPalmPositions.set(handId, { x: palmX, y: palmY });

    // Calculate hand center (average of all landmarks)
    let centerX = 0,
      centerY = 0;
    for (const lm of landmarks) {
      centerX += lm.x * 2 - 1;
      centerY += -(lm.y * 2 - 1);
    }
    centerX /= landmarks.length;
    centerY /= landmarks.length;

    // Gentle global attraction toward hand center
    this.addGlobalHandAttraction(centerX, centerY, 0.4);

    // Attract particles to ALL hand landmarks with larger radii for spread
    for (const idx of ALL_LANDMARKS) {
      const lm = landmarks[idx];
      const x = lm.x * 2 - 1;
      const y = -(lm.y * 2 - 1);

      // Larger radii for spread, moderate strength
      const isTip = FINGER_TIPS.includes(idx);
      const strength = isTip ? 0.5 : 0.35;
      const radius = isTip ? 0.18 : 0.15;

      this.addAttractionPoint(x, y, strength, radius);
    }

    // Gesture-based modifications
    if (gestures.pinch && gestures.pinchPosition) {
      // Pinch: concentration at pinch point
      this.addAttractionPoint(
        gestures.pinchPosition.x,
        gestures.pinchPosition.y,
        0.7,
        0.2,
      );
    }

    if (gestures.grab) {
      // Grab: attraction to palm center
      this.addAttractionPoint(palmX, palmY, gestures.grabStrength * 0.8, 0.25);
    }

    // Add velocity-based trailing effect
    const velocity = this.palmVelocities.get(handId) ?? { x: 0, y: 0 };
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
    if (speed > 0.01) {
      this.addTrailEffect(centerX, centerY, velocity, speed);
    }
  }

  private addGlobalHandAttraction(
    cx: number,
    cy: number,
    strength: number,
  ): void {
    const { fieldSize, field } = this;
    const innerRadius = 0.15; // Dead zone
    const outerRadius = 0.5; // Hand influence radius

    for (let gy = 0; gy < fieldSize; gy++) {
      for (let gx = 0; gx < fieldSize; gx++) {
        const wx = (gx / fieldSize) * 2 - 1;
        const wy = (gy / fieldSize) * 2 - 1;

        const distX = cx - wx;
        const distY = cy - wy;
        const dist = Math.sqrt(distX * distX + distY * distY);

        if (dist > outerRadius || dist < innerRadius) continue;

        const normalizedDist =
          (dist - innerRadius) / (outerRadius - innerRadius);
        const falloff = normalizedDist * (1 - normalizedDist) * 4;
        const forceStrength = strength * falloff * 0.2;

        const dirX = distX / dist;
        const dirY = distY / dist;

        const idx = (gy * fieldSize + gx) * 4;
        field[idx] += dirX * forceStrength;
        field[idx + 1] += dirY * forceStrength;
        field[idx + 3] = Math.max(field[idx + 3], forceStrength * 0.5);
      }
    }
  }

  private addAttractionPoint(
    cx: number,
    cy: number,
    strength: number,
    radius: number,
  ): void {
    const { fieldSize, field } = this;
    const innerRadius = radius * 0.3; // Dead zone
    const outerRadius = radius;

    const gridRadius = Math.ceil((radius * fieldSize) / 2);
    const gridCX = Math.floor((cx * 0.5 + 0.5) * fieldSize);
    const gridCY = Math.floor((cy * 0.5 + 0.5) * fieldSize);

    for (let dy = -gridRadius; dy <= gridRadius; dy++) {
      for (let dx = -gridRadius; dx <= gridRadius; dx++) {
        const gx = gridCX + dx;
        const gy = gridCY + dy;

        if (gx < 0 || gx >= fieldSize || gy < 0 || gy >= fieldSize) continue;

        const wx = (gx / fieldSize) * 2 - 1;
        const wy = (gy / fieldSize) * 2 - 1;

        const distX = wx - cx;
        const distY = wy - cy;
        const dist = Math.sqrt(distX * distX + distY * distY);

        if (dist > outerRadius) continue;

        const idx = (gy * fieldSize + gx) * 4;

        if (dist < innerRadius) {
          // Inside dead zone - slight outward push to prevent collapse
          if (dist > 0.001) {
            const pushStrength = strength * 0.1 * (1 - dist / innerRadius);
            field[idx] += (distX / dist) * pushStrength;
            field[idx + 1] += (distY / dist) * pushStrength;
          }
          field[idx + 3] = Math.max(field[idx + 3], strength);
        } else {
          // Outside dead zone - gentle attraction
          const normalizedDist =
            (dist - innerRadius) / (outerRadius - innerRadius);
          const falloff = normalizedDist;
          const forceStrength = strength * falloff * 0.15;

          // Direction TOWARD the point (attraction)
          const dirX = -distX / dist;
          const dirY = -distY / dist;

          field[idx] += dirX * forceStrength;
          field[idx + 1] += dirY * forceStrength;
          field[idx + 3] = Math.max(field[idx + 3], forceStrength);
        }
      }
    }
  }

  private addTrailEffect(
    cx: number,
    cy: number,
    velocity: Vec2,
    speed: number,
  ): void {
    // Create trailing particles behind the hand movement
    const trailLength = 3;
    const velNormX = velocity.x / speed;
    const velNormY = velocity.y / speed;

    for (let i = 1; i <= trailLength; i++) {
      const trailX = cx - velNormX * i * 0.05;
      const trailY = cy - velNormY * i * 0.05;
      const trailStrength = 0.3 * (1 - i / (trailLength + 1));
      this.addAttractionPoint(trailX, trailY, trailStrength, 0.08);
    }
  }

  getField(): Float32Array {
    return this.field;
  }
}
