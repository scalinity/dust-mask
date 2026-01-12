import type { TrackingResult, Gestures, Vec2 } from "../types";

// MediaPipe hand landmark indices
const THUMB_TIP = 4;
const THUMB_IP = 3;
const INDEX_TIP = 8;
const INDEX_PIP = 6;
const MIDDLE_TIP = 12;
const MIDDLE_PIP = 10;
const RING_TIP = 16;
const RING_PIP = 14;
const PINKY_TIP = 20;
const PINKY_PIP = 18;
const WRIST = 0;
const PALM_CENTER = 9;

// Face landmark indices for expressions
const LEFT_EYE_TOP = 159;
const LEFT_EYE_BOTTOM = 145;
const RIGHT_EYE_TOP = 386;
const RIGHT_EYE_BOTTOM = 374;

export class GestureDetector {
  // Smoothing for gesture detection
  private prevGestures: Gestures | null = null;
  private smoothingFactor = 0.3;

  // Previous positions for velocity calculation
  private prevFaceCenter: Vec2 | null = null;

  detect(tracking: TrackingResult): Gestures {
    const gestures: Gestures = {
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

    // Process hand gestures
    for (const hand of tracking.hands) {
      const landmarks = hand.landmarks;
      if (landmarks.length < 21) continue;

      // Pinch detection
      const pinchResult = this.detectPinch(landmarks);
      if (pinchResult.isPinching) {
        gestures.pinch = true;
        gestures.pinchStrength = Math.max(
          gestures.pinchStrength,
          pinchResult.strength,
        );
        gestures.pinchPosition = pinchResult.position;
      }

      // Grab detection
      const grabResult = this.detectGrab(landmarks);
      if (grabResult.isGrabbing) {
        gestures.grab = true;
        gestures.grabStrength = Math.max(
          gestures.grabStrength,
          grabResult.strength,
        );
      }

      // Open palm detection
      if (this.detectOpenPalm(landmarks)) {
        gestures.openPalm = true;
        gestures.palmPosition = {
          x: landmarks[PALM_CENTER].x * 2 - 1,
          y: -(landmarks[PALM_CENTER].y * 2 - 1),
        };
      }

      // Swipe velocity
      const palmVel = this.calculatePalmVelocity(landmarks);
      if (Math.abs(palmVel.x) > Math.abs(gestures.swipeVelocity.x)) {
        gestures.swipeVelocity.x = palmVel.x;
      }
      if (Math.abs(palmVel.y) > Math.abs(gestures.swipeVelocity.y)) {
        gestures.swipeVelocity.y = palmVel.y;
      }
    }

    // Process face gestures
    for (const face of tracking.faces) {
      const landmarks = face.landmarks;
      if (landmarks.length < 468) continue;

      // Head tilt and nod
      const headPose = this.detectHeadPose(landmarks);
      gestures.headTilt = headPose.tilt;
      gestures.headNod = headPose.nod;

      // Blink detection
      const blinks = this.detectBlinks(landmarks);
      gestures.blinkLeft = blinks.left;
      gestures.blinkRight = blinks.right;

      // Mouth open from blendshapes
      gestures.mouthOpen = face.blendshapes?.get("jawOpen") ?? 0;
    }

    // Apply smoothing
    if (this.prevGestures) {
      gestures.pinchStrength = this.smooth(
        this.prevGestures.pinchStrength,
        gestures.pinchStrength,
      );
      gestures.grabStrength = this.smooth(
        this.prevGestures.grabStrength,
        gestures.grabStrength,
      );
      gestures.headTilt = this.smooth(
        this.prevGestures.headTilt,
        gestures.headTilt,
      );
      gestures.headNod = this.smooth(
        this.prevGestures.headNod,
        gestures.headNod,
      );
      gestures.mouthOpen = this.smooth(
        this.prevGestures.mouthOpen,
        gestures.mouthOpen,
      );
    }

    this.prevGestures = { ...gestures };
    return gestures;
  }

  private detectPinch(landmarks: { x: number; y: number; z: number }[]): {
    isPinching: boolean;
    strength: number;
    position?: Vec2;
  } {
    const thumb = landmarks[THUMB_TIP];
    const index = landmarks[INDEX_TIP];

    const dx = thumb.x - index.x;
    const dy = thumb.y - index.y;
    const dz = thumb.z - index.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const pinchThreshold = 0.06;
    const isPinching = distance < pinchThreshold;

    // Strength is inverse of distance (closer = stronger)
    const strength = isPinching
      ? Math.max(0, 1 - distance / pinchThreshold)
      : 0;

    // Position is midpoint between thumb and index
    const position: Vec2 = {
      x: ((thumb.x + index.x) / 2) * 2 - 1,
      y: -(((thumb.y + index.y) / 2) * 2 - 1),
    };

    return {
      isPinching,
      strength,
      position: isPinching ? position : undefined,
    };
  }

  private detectGrab(landmarks: { x: number; y: number; z: number }[]): {
    isGrabbing: boolean;
    strength: number;
  } {
    // Check if all fingers are curled (tips below PIPs relative to palm)
    const fingers = [
      { tip: INDEX_TIP, pip: INDEX_PIP },
      { tip: MIDDLE_TIP, pip: MIDDLE_PIP },
      { tip: RING_TIP, pip: RING_PIP },
      { tip: PINKY_TIP, pip: PINKY_PIP },
    ];

    let curledCount = 0;
    let totalCurl = 0;

    for (const finger of fingers) {
      const tip = landmarks[finger.tip];
      const pip = landmarks[finger.pip];
      const wrist = landmarks[WRIST];

      // Calculate how curled this finger is
      const tipToWrist = Math.sqrt(
        Math.pow(tip.x - wrist.x, 2) + Math.pow(tip.y - wrist.y, 2),
      );
      const pipToWrist = Math.sqrt(
        Math.pow(pip.x - wrist.x, 2) + Math.pow(pip.y - wrist.y, 2),
      );

      // Finger is curled if tip is closer to wrist than PIP
      if (tipToWrist < pipToWrist * 1.1) {
        curledCount++;
        totalCurl += 1 - tipToWrist / pipToWrist;
      }
    }

    // Also check thumb
    const thumbTip = landmarks[THUMB_TIP];
    const thumbIP = landmarks[THUMB_IP];
    const palm = landmarks[PALM_CENTER];

    const thumbToPlam = Math.sqrt(
      Math.pow(thumbTip.x - palm.x, 2) + Math.pow(thumbTip.y - palm.y, 2),
    );

    const isGrabbing = curledCount >= 3 && thumbToPlam < 0.15;
    const strength = isGrabbing
      ? (totalCurl / 4 + (0.15 - thumbToPlam) / 0.15) / 2
      : 0;

    return { isGrabbing, strength: Math.min(1, strength) };
  }

  private detectOpenPalm(
    landmarks: { x: number; y: number; z: number }[],
  ): boolean {
    // Check if all fingers are extended (tips above PIPs relative to wrist)
    const fingers = [
      { tip: INDEX_TIP, pip: INDEX_PIP },
      { tip: MIDDLE_TIP, pip: MIDDLE_PIP },
      { tip: RING_TIP, pip: RING_PIP },
      { tip: PINKY_TIP, pip: PINKY_PIP },
    ];

    let extendedCount = 0;

    for (const finger of fingers) {
      const tip = landmarks[finger.tip];
      const pip = landmarks[finger.pip];
      const wrist = landmarks[WRIST];

      const tipToWrist = Math.sqrt(
        Math.pow(tip.x - wrist.x, 2) + Math.pow(tip.y - wrist.y, 2),
      );
      const pipToWrist = Math.sqrt(
        Math.pow(pip.x - wrist.x, 2) + Math.pow(pip.y - wrist.y, 2),
      );

      // Finger is extended if tip is farther from wrist than PIP
      if (tipToWrist > pipToWrist * 1.1) {
        extendedCount++;
      }
    }

    return extendedCount >= 4;
  }

  private calculatePalmVelocity(
    landmarks: { x: number; y: number; z: number }[],
  ): Vec2 {
    // This would need frame-over-frame tracking
    // For now, return zero - actual velocity calculated in HandField
    return { x: 0, y: 0 };
  }

  private detectHeadPose(landmarks: { x: number; y: number; z: number }[]): {
    tilt: number;
    nod: number;
  } {
    // Use nose and eye positions to estimate head pose
    const nose = landmarks[4]; // Nose tip
    const leftEye = landmarks[33]; // Left eye inner corner
    const rightEye = landmarks[263]; // Right eye inner corner

    // Tilt: difference in eye heights
    const eyeHeightDiff = leftEye.y - rightEye.y;
    const eyeDistance = Math.abs(leftEye.x - rightEye.x);
    const tilt = Math.atan2(eyeHeightDiff, eyeDistance) * 2; // Scale to -1 to 1 range

    // Nod: nose position relative to eye midpoint
    const eyeMidY = (leftEye.y + rightEye.y) / 2;
    const noseOffset = nose.y - eyeMidY;
    const nod = (noseOffset - 0.1) * 5; // Normalize around neutral position

    // Track face center for velocity
    const faceCenter: Vec2 = {
      x: (leftEye.x + rightEye.x) / 2,
      y: (leftEye.y + rightEye.y) / 2,
    };
    this.prevFaceCenter = faceCenter;

    return {
      tilt: Math.max(-1, Math.min(1, tilt)),
      nod: Math.max(-1, Math.min(1, nod)),
    };
  }

  private detectBlinks(landmarks: { x: number; y: number; z: number }[]): {
    left: boolean;
    right: boolean;
  } {
    // Eye aspect ratio (EAR) for blink detection
    const leftEAR = this.calculateEAR(
      landmarks[LEFT_EYE_TOP],
      landmarks[LEFT_EYE_BOTTOM],
    );
    const rightEAR = this.calculateEAR(
      landmarks[RIGHT_EYE_TOP],
      landmarks[RIGHT_EYE_BOTTOM],
    );

    const blinkThreshold = 0.02;

    return {
      left: leftEAR < blinkThreshold,
      right: rightEAR < blinkThreshold,
    };
  }

  private calculateEAR(
    top: { x: number; y: number; z: number },
    bottom: { x: number; y: number; z: number },
  ): number {
    return Math.abs(top.y - bottom.y);
  }

  private smooth(prev: number, current: number): number {
    return prev * (1 - this.smoothingFactor) + current * this.smoothingFactor;
  }
}
