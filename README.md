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

## Network Configuration

Vision Hub supports multiple network deployment scenarios. Choose the approach that best fits your needs:

### 1. Local Development (Single Node)
Default configuration with all services on `localhost`:
```sh
# .env
FRONTEND_HOST=localhost
WORKER_HOST=localhost
API_HOST=localhost
```

### 2. Private Network / LAN
For deployment on a local network (192.168.x.x, 10.x.x.x):
```sh
# .env
FRONTEND_HOST=192.168.10.2  # Manager node with UI and MediaMTX
WORKER_HOST=192.168.10.1    # GPU worker node with YOLO/Pose
API_HOST=192.168.10.2
```

### 3. ZeroTier VPN
For deployment using ZeroTier virtual network:
```sh
# .env
FRONTEND_HOST=172.25.0.2    # Your ZeroTier IP for manager node
WORKER_HOST=172.25.0.1      # Your ZeroTier IP for GPU worker
API_HOST=172.25.0.2

# Also configure mediamtx/mediamtx.yml for WebRTC:
# Uncomment and set webrtcIPsFromInterfacesList to include "zt0" or your ZeroTier interface
```

### 4. Public Internet
For deployment with public IP addresses:
```sh
# .env
FRONTEND_HOST=your-public-domain.com  # or public IP
WORKER_HOST=worker.your-domain.com    # or public IP
API_HOST=api.your-domain.com          # or public IP

# Configure mediamtx/mediamtx.yml with your public IPs for WebRTC
```

### Multi-Node Deployment (Docker Swarm)
For distributed deployment across multiple nodes:
1. Use `docker-compose.swarm.yml` or `stack.yml`
2. Configure node labels (`frontend`, `gpu`)
3. Set appropriate network variables in `.env`
4. Deploy with `docker stack deploy -c stack.yml vision-hub`

## Main Environment Variables
See `.env.example` for the full list. Key variables:

### Network Configuration
- `FRONTEND_HOST`: Hostname/IP for the frontend node (default: `localhost`)
- `WORKER_HOST`: Hostname/IP for the GPU worker node (default: `localhost`)
- `API_HOST`: Hostname/IP for the API service (default: `localhost`)
- `FRONTEND_PORT`: Port for the UI (default: `4321`)
- `API_PORT`: Port for the orchestrator API (default: `8090`)
- `MEDIAMTX_RTSP_PORT`: RTSP streaming port (default: `8554`)
- `MEDIAMTX_HTTP_PORT`: MediaMTX HTTP/WHEP port (default: `8889`)
- `ALLOW_ORIGINS`: CORS allowed origins (auto-configured from hosts if not set)

### Camera & Streaming
- `CAMERA_DEVICE`: Path to the local camera (e.g. `/dev/video0` or `/dev/v4l/by-id/...`)
- `RTSP_URL`: RTSP stream URL to use (default: `rtsp://mediamtx:8554/cam`)
- `JPEG_QUALITY`: JPEG quality for MJPEG stream (e.g. `80`)

### Model Configuration
- `MODEL`: YOLO model to use (e.g. `yolov8n.pt`)
- `MODEL_POSE`: Pose estimation model (e.g. `yolov8n-pose.pt`)
- `IMG_SIZE`: Input resolution for inference (e.g. `640`)
- `FORCE_CPU`: Set to `1` to force CPU usage even if a GPU is available
- `CONF`, `IOU`, `MAX_DET`: Detection thresholds

## Frontend (UX : Astro)

Contact form page : Formspree.io (Account tom.burellier@associated.ltu.se, password ask me)

## Usage Notes
- All network-related variables default to localhost for easy local development
- For multi-node deployments, ensure all nodes can communicate over the network
- For GPU acceleration, ensure Docker is configured with the correct runtime (`--gpus all` or `devices: - nvidia.com/gpu=all`).
- Startup logs will indicate whether GPU or CPU is used.
- When using WebRTC (for live video streaming), configure `mediamtx/mediamtx.yml` with your network interfaces and public IPs

## Custom Demos
Add your own models or demos by creating a dedicated folder and adapting the Dockerfile + app.py.

---

For questions or contributions, ask me directly at tom.burellier@associated.ltu.se
