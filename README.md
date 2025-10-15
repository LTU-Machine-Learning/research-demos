
# Vision Hub – Research Demo Platform

This project lets you deploy and visualize research demos in Docker containers, with a modern web interface.


## Prerequisites
- Docker & Docker Compose
- webcam (V4L2-compatible is a bonus)
- NVIDIA GPU + drivers + nvidia-docker for CUDA acceleration (optional, but recommended for best performance)


## Quick Start
1. Clone the repo and go to the `vision-hub` directory.
2. Copy `.env.example` to `.env` and adjust variables as needed.
3. Launch the stack:
   ```sh
   docker compose up --build
   ```
4. Access the interfaces:
   - Astro frontend: http://localhost:4321
   - Web API: http://localhost:8080
   - RTSP: rtsp://localhost:8554/cam

## Main Environment Variables
See `.env.example` for the full list. Key variables:

- `CAMERA_DEVICE`: Path to the local camera (e.g. `/dev/video0` or `/dev/v4l/by-id/...`)
- `RTSP_URL`: RTSP stream URL to use (default: `rtsp://mediamtx:8554/cam`)
- `MODEL`: YOLO model to use (e.g. `yolov8n.pt`)
- `IMG_SIZE`: Input resolution for inference (e.g. `640`)
- `JPEG_QUALITY`: JPEG quality for MJPEG stream (e.g. `80`)
- `FORCE_CPU`: Set to `1` to force CPU usage even if a GPU is available
- `CONF`, `IOU`, `MAX_DET`: Detection thresholds
- .....

## Frontend (UX : Astro)

Contact form page : Formspree.io (Account tom.burellier@associated.ltu.se, password ask me)

## Usage Notes
- Besides global variables, there's always default ones, these are they I use on my own computer
- For GPU acceleration, ensure Docker is configured with the correct runtime (`--gpus all` or `devices: - nvidia.com/gpu=all`).
- Startup logs will indicate whether GPU or CPU is used.

## Custom Demos
Add your own models or demos by creating a dedicated folder and adapting the Dockerfile + app.py.

---

For questions or contributions, ask me directly at tom.burellier@associated.ltu.se
