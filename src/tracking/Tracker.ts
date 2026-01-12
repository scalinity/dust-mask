import {
  FaceLandmarker,
  HandLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";
import type { TrackingResult, FaceResult, HandResult } from "../types";

export class Tracker {
  private faceLandmarker: FaceLandmarker | null = null;
  private handLandmarker: HandLandmarker | null = null;
  private lastVideoTime = -1;
  private isInitialized = false;

  async initialize(): Promise<void> {
    console.log("Initializing MediaPipe tracking...");

    try {
      console.log("Loading MediaPipe WASM files...");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm",
      );
      console.log("WASM files loaded");

      // Initialize face landmarker
      console.log("Loading face landmarker model...");
      this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numFaces: 2,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      });
      console.log("Face landmarker loaded");

      // Initialize hand landmarker
      console.log("Loading hand landmarker model...");
      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      console.log("Hand landmarker loaded");

      this.isInitialized = true;
      console.log("MediaPipe tracking initialized");
    } catch (error) {
      console.error("MediaPipe initialization error:", error);
      if (error instanceof Error) {
        throw new Error(`MediaPipe initialization failed: ${error.message}`);
      }
      throw new Error(
        "MediaPipe initialization failed: Unable to load tracking models. Check your internet connection.",
      );
    }
  }

  track(video: HTMLVideoElement): TrackingResult | null {
    if (!this.isInitialized || !this.faceLandmarker || !this.handLandmarker) {
      return null;
    }

    // Skip if video hasn't advanced
    if (video.currentTime === this.lastVideoTime) {
      return null;
    }
    this.lastVideoTime = video.currentTime;

    const timestamp = performance.now();

    // Run face and hand detection
    let faceResults: FaceLandmarkerResult | null = null;
    let handResults: HandLandmarkerResult | null = null;

    try {
      faceResults = this.faceLandmarker.detectForVideo(video, timestamp);
      handResults = this.handLandmarker.detectForVideo(video, timestamp);
    } catch (e) {
      console.error("Tracking error:", e);
      return null;
    }

    // Convert to our format
    const faces: FaceResult[] = [];
    const hands: HandResult[] = [];

    // Process face results
    if (faceResults && faceResults.faceLandmarks) {
      for (let i = 0; i < faceResults.faceLandmarks.length; i++) {
        const landmarks = faceResults.faceLandmarks[i];
        const blendshapes = new Map<string, number>();

        // Extract blendshapes if available
        if (faceResults.faceBlendshapes && faceResults.faceBlendshapes[i]) {
          for (const shape of faceResults.faceBlendshapes[i].categories) {
            blendshapes.set(shape.categoryName, shape.score);
          }
        }

        faces.push({
          landmarks: landmarks.map((l) => ({
            x: l.x,
            y: l.y,
            z: l.z ?? 0,
          })),
          blendshapes,
        });
      }
    }

    // Process hand results
    if (handResults && handResults.landmarks) {
      for (let i = 0; i < handResults.landmarks.length; i++) {
        const landmarks = handResults.landmarks[i];
        const handedness =
          handResults.handednesses[i]?.[0]?.categoryName === "Left"
            ? "Left"
            : "Right";

        hands.push({
          landmarks: landmarks.map((l) => ({
            x: l.x,
            y: l.y,
            z: l.z ?? 0,
          })),
          handedness,
        });
      }
    }

    return {
      faces,
      hands,
      timestamp,
    };
  }

  destroy(): void {
    this.faceLandmarker?.close();
    this.handLandmarker?.close();
    this.faceLandmarker = null;
    this.handLandmarker = null;
    this.isInitialized = false;
  }
}
