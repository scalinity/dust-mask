# dust-mask

**GPU-accelerated dust particle simulation with real-time face and hand tracking.**

dust-mask is a desktop Electron application that renders thousands of interactive dust particles using WebGPU compute shaders, driven by your face and hands via MediaPipe vision tracking. Move your head, wave your hands — the particles react in real time.

---

## What It Does

The app captures your webcam feed, runs MediaPipe's face and hand detection models, and pipes the tracking data into a WebGPU compute shader that simulates dust-like particles on your screen. The result is an interactive particle field that responds to your physical presence — particles scatter, swirl, and flow around your movements.

---

## Features

- **WebGPU compute shaders** — Particle physics simulated entirely on the GPU via WGSL shaders for massive parallelism
- **MediaPipe vision tracking** — Real-time face and hand detection using `@mediapipe/tasks-vision`
- **Electron desktop app** — Runs as a native window with full webcam access
- **Interactive particles** — Thousands of particles respond to tracked landmarks in real time
- **Hot reload development** — Built with electron-vite and Vite for fast iteration

---

## Getting Started

### Prerequisites

- Node.js 18+
- A webcam
- A GPU with WebGPU support (most modern GPUs)

### Installation

```bash
git clone https://github.com/scalinity/dust-mask.git
cd dust-mask
npm install
```

### Development

```bash
npm run dev        # Launch Electron app with hot reload
```

### Build

```bash
npm run build      # Production build
npm run preview    # Preview the production build
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Electron 33 |
| Build | electron-vite, Vite 5 |
| Language | TypeScript, JavaScript |
| GPU Shaders | WGSL (WebGPU Shading Language) |
| Vision | MediaPipe Tasks Vision |
| Types | @webgpu/types |

---

## Project Structure

```
dust-mask/
├── electron/              # Electron main process
├── src/                   # Renderer process source
├── out/                   # Build output
├── index.html             # Entry HTML
├── electron.vite.config.ts # Build configuration
├── package.json           # Dependencies and scripts
└── tsconfig.json          # TypeScript config
```

---

## How It Works

1. **Capture** — Electron opens a webcam stream
2. **Track** — MediaPipe detects face and hand landmarks at 30+ FPS
3. **Compute** — WGSL compute shaders update particle positions on the GPU based on landmark proximity and forces
4. **Render** — Particles are drawn to a canvas each frame, creating a living dust field that mirrors your movements

---

## License

Proprietary. All rights reserved.

---

*dust-mask: Your movements, rendered as particles.*
