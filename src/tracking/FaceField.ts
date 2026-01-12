import type { FaceResult } from "../types";

// MediaPipe face mesh landmark indices for key features
const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
  400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21,
  54, 103, 67, 109,
];
const LEFT_EYE = [
  33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246,
];
const RIGHT_EYE = [
  362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384,
  398,
];
const LEFT_EYEBROW = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
const RIGHT_EYEBROW = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
const LIPS_OUTER = [
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37,
  39, 40, 185,
];
const LIPS_INNER = [
  78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82,
  81, 80, 191,
];
const NOSE_TIP = [4];
const NOSE_BRIDGE = [168, 6, 197, 195, 5];
const NOSE_BOTTOM = [2, 98, 327];
const FOREHEAD = [
  10, 151, 9, 8, 107, 66, 105, 63, 70, 156, 383, 300, 293, 334, 296, 336,
];

// All face surface points for dense coverage
const FACE_SURFACE = [
  // Cheeks
  116, 117, 118, 119, 120, 121, 128, 129, 130, 131, 198, 199, 200, 201, 202,
  // Forehead area
  8, 9, 10, 151, 108, 69, 104, 68, 71,
  // Nose area
  1, 2, 3, 4, 5, 6, 168, 197, 195, 5, 48, 115, 220, 45,
  // Under eyes
  111, 117, 118, 119, 120, 121, 47, 126, 209, 49, 129, 203, 340, 346, 347, 348,
  349, 350, 277, 355, 429, 279, 358, 423,
];

export class FaceField {
  private fieldSize: number;
  private field: Float32Array;

  // Temporal smoothing
  private prevField: Float32Array | null = null;
  private smoothingFactor = 0.4;

  constructor(fieldSize: number = 128) {
    this.fieldSize = fieldSize;
    this.field = new Float32Array(fieldSize * fieldSize * 4);
  }

  update(faces: FaceResult[]): Float32Array {
    // Clear field
    this.field.fill(0);

    if (faces.length === 0) {
      // No face detected - apply gentle center attraction to keep particles visible
      this.addGlobalAttraction(0, 0, 0.1);
    }

    for (const face of faces) {
      this.processFace(face);
    }

    // Apply temporal smoothing
    if (this.prevField) {
      for (let i = 0; i < this.field.length; i++) {
        this.field[i] =
          this.prevField[i] * (1 - this.smoothingFactor) +
          this.field[i] * this.smoothingFactor;
      }
    }

    // Store for next frame
    if (!this.prevField) {
      this.prevField = new Float32Array(this.field.length);
    }
    this.prevField.set(this.field);

    return this.field;
  }

  private processFace(face: FaceResult): void {
    const landmarks = face.landmarks;
    if (landmarks.length < 468) return;

    // Calculate face center
    const faceCenter = this.getFaceCenter(landmarks);

    // Gentle global attraction - just guides distant particles toward face area
    this.addGlobalAttraction(faceCenter.x, faceCenter.y, 0.4);

    // Large overlapping attraction zones to spread particles across face
    // Much larger radii so particles distribute instead of collapsing
    this.addLandmarkAttractions(landmarks, FACE_OVAL, 0.5, 0.25);
    this.addLandmarkAttractions(landmarks, FACE_SURFACE, 0.4, 0.2);
    this.addLandmarkAttractions(landmarks, FOREHEAD, 0.4, 0.2);

    // Eye details - larger zones
    this.addLandmarkAttractions(landmarks, LEFT_EYE, 0.5, 0.15);
    this.addLandmarkAttractions(landmarks, RIGHT_EYE, 0.5, 0.15);

    // Eyebrows
    this.addLandmarkAttractions(landmarks, LEFT_EYEBROW, 0.4, 0.15);
    this.addLandmarkAttractions(landmarks, RIGHT_EYEBROW, 0.4, 0.15);

    // Nose - larger coverage
    this.addLandmarkAttractions(landmarks, NOSE_BRIDGE, 0.4, 0.18);
    this.addLandmarkAttractions(landmarks, NOSE_TIP, 0.5, 0.18);
    this.addLandmarkAttractions(landmarks, NOSE_BOTTOM, 0.4, 0.15);

    // Lips - larger zones
    this.addLandmarkAttractions(landmarks, LIPS_OUTER, 0.5, 0.15);

    // Mouth opening - if mouth is open
    const mouthOpen = face.blendshapes?.get("jawOpen") ?? 0;
    if (mouthOpen > 0.1) {
      this.addLandmarkAttractions(landmarks, LIPS_INNER, 0.3 * mouthOpen, 0.12);
    }

    // Fill in face surface with attraction points - larger radii
    for (let i = 0; i < Math.min(landmarks.length, 468); i++) {
      if (i % 3 === 0) {
        // Sample every 3rd landmark for better coverage
        const lm = landmarks[i];
        const x = lm.x * 2 - 1;
        const y = -(lm.y * 2 - 1);
        this.addAttractionPoint(x, y, 0.25, 0.12);
      }
    }
  }

  private getFaceCenter(landmarks: { x: number; y: number; z: number }[]): {
    x: number;
    y: number;
  } {
    // Use nose tip as face center
    const nose = landmarks[4];
    return {
      x: nose.x * 2 - 1,
      y: -(nose.y * 2 - 1),
    };
  }

  private addGlobalAttraction(cx: number, cy: number, strength: number): void {
    const { fieldSize, field } = this;
    const innerRadius = 0.3; // Dead zone - no attraction inside this radius
    const outerRadius = 1.5; // Max range of attraction

    for (let gy = 0; gy < fieldSize; gy++) {
      for (let gx = 0; gx < fieldSize; gx++) {
        const wx = (gx / fieldSize) * 2 - 1;
        const wy = (gy / fieldSize) * 2 - 1;

        const distX = cx - wx;
        const distY = cy - wy;
        const dist = Math.sqrt(distX * distX + distY * distY);

        // Only attract particles that are OUTSIDE the inner radius
        if (dist < innerRadius || dist > outerRadius) continue;

        // Attraction only in the band between inner and outer radius
        const normalizedDist =
          (dist - innerRadius) / (outerRadius - innerRadius);
        const falloff = normalizedDist * (1 - normalizedDist) * 4; // Peaks in middle
        const forceStrength = strength * falloff * 0.3; // Reduced strength

        // Direction toward center
        const dirX = distX / dist;
        const dirY = distY / dist;

        const idx = (gy * fieldSize + gx) * 4;
        field[idx] += dirX * forceStrength;
        field[idx + 1] += dirY * forceStrength;
        field[idx + 3] = Math.max(field[idx + 3], forceStrength * 0.5);
      }
    }
  }

  private addLandmarkAttractions(
    landmarks: { x: number; y: number; z: number }[],
    indices: number[],
    strength: number,
    radius: number,
  ): void {
    for (const idx of indices) {
      const point = landmarks[idx];
      if (!point) continue;

      const x = point.x * 2 - 1;
      const y = -(point.y * 2 - 1);

      this.addAttractionPoint(x, y, strength, radius);
    }
  }

  private addAttractionPoint(
    cx: number,
    cy: number,
    strength: number,
    radius: number,
  ): void {
    const { fieldSize, field } = this;
    const innerRadius = radius * 0.3; // Dead zone - particles "settle" here
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
          // Inside dead zone - add slight outward push to prevent collapse
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
          const falloff = normalizedDist; // Linear falloff
          const forceStrength = strength * falloff * 0.15; // Much gentler

          // Direction TOWARD the landmark (attraction)
          const dirX = -distX / dist;
          const dirY = -distY / dist;

          field[idx] += dirX * forceStrength;
          field[idx + 1] += dirY * forceStrength;
          field[idx + 3] = Math.max(field[idx + 3], forceStrength);
        }
      }
    }
  }

  getField(): Float32Array {
    return this.field;
  }
}
