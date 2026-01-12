export interface CameraOptions {
  width?: number;
  height?: number;
  facingMode?: "user" | "environment";
}

export class CameraCapture {
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private isInitialized = false;

  async initialize(
    videoElement: HTMLVideoElement,
    options: CameraOptions = {},
  ): Promise<void> {
    const { width = 640, height = 480, facingMode = "user" } = options;

    this.video = videoElement;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: width },
          height: { ideal: height },
          facingMode,
          frameRate: { ideal: 30 },
        },
        audio: false,
      });

      this.video.srcObject = this.stream;

      // Wait for video to be ready
      await new Promise<void>((resolve, reject) => {
        if (!this.video) {
          reject(new Error("Video element not set"));
          return;
        }

        this.video.onloadedmetadata = () => {
          this.video!.play()
            .then(() => resolve())
            .catch(reject);
        };

        this.video.onerror = () => {
          reject(new Error("Video loading failed"));
        };
      });

      this.isInitialized = true;
      console.log(
        `Camera initialized: ${this.video.videoWidth}x${this.video.videoHeight}`,
      );
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "NotAllowedError") {
          throw new Error(
            "Camera access denied.\n\n" +
              "Please allow camera access in System Preferences > Security & Privacy > Camera.",
          );
        } else if (error.name === "NotFoundError") {
          throw new Error(
            "No camera found.\n\n" + "Please connect a camera and try again.",
          );
        }
      }
      throw error;
    }
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.video;
  }

  isReady(): boolean {
    return (
      this.isInitialized &&
      this.video !== null &&
      this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    );
  }

  getFrameSize(): { width: number; height: number } {
    if (!this.video) {
      return { width: 0, height: 0 };
    }
    return {
      width: this.video.videoWidth,
      height: this.video.videoHeight,
    };
  }

  destroy(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }

    this.isInitialized = false;
  }
}
