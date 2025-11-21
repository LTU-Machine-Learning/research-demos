# Network Configuration Quick Reference

This document provides quick setup examples for different network deployment scenarios.

## Scenario 1: Local Development (Single Machine)

**When to use**: Testing on your local machine

```bash
# Copy the example file
cp .env.example .env

# Default values work out of the box - no changes needed!
docker compose up --build
```

Access at:
- UI: http://localhost:4321
- API: http://localhost:8090
- Price API: http://localhost:8080

---

## Scenario 2: Private Network / LAN

**When to use**: Multiple machines on same local network (192.168.x.x, 10.x.x.x)

```bash
# Copy and edit .env
cp .env.example .env
```

Edit `.env`:
```bash
# Manager node (UI, MediaMTX, API)
FRONTEND_HOST=192.168.10.2
API_HOST=192.168.10.2
PUBLIC_BASE=http://192.168.10.2

# GPU worker node
WORKER_HOST=192.168.10.1

# Allow CORS from network
ALLOW_ORIGINS=http://192.168.10.2:4321,http://localhost:4321
```

Deploy:
```bash
# On manager node
docker compose up --build

# On worker node (for YOLO/Pose)
docker compose --profile demo up yolo pose
```

---

## Scenario 3: ZeroTier VPN

**When to use**: Distributed deployment across different networks

### Setup ZeroTier
1. Install ZeroTier on all nodes
2. Join the same network (e.g., network ID: abc123def456)
3. Note your ZeroTier IPs (e.g., 172.25.0.x)

### Configure .env
```bash
cp .env.example .env
```

Edit `.env`:
```bash
# Use ZeroTier IPs
FRONTEND_HOST=172.25.0.2    # Manager node ZeroTier IP
WORKER_HOST=172.25.0.1      # Worker node ZeroTier IP
API_HOST=172.25.0.2
PUBLIC_BASE=http://172.25.0.2

ALLOW_ORIGINS=http://172.25.0.2:4321,http://localhost:4321
```

### Configure MediaMTX for WebRTC
Edit `mediamtx/mediamtx.yml`:
```yaml
webrtcIPsFromInterfaces: yes
webrtcIPsFromInterfacesList:
  - "zt0"  # ZeroTier interface name (check with `ip a`)
webrtcAdditionalHosts:
  - "172.25.0.2"  # Your ZeroTier IP
```

---

## Scenario 4: Public Internet

**When to use**: Publicly accessible deployment

### Requirements
- Domain name or public IP
- Open firewall ports (4321, 8090, 8080, 8554, 8889, 8189)
- SSL/TLS recommended (use nginx reverse proxy)

### Configure .env
```bash
cp .env.example .env
```

Edit `.env`:
```bash
# Use your domain or public IP
FRONTEND_HOST=demo.yourdomain.com
WORKER_HOST=gpu.yourdomain.com
API_HOST=demo.yourdomain.com
PUBLIC_BASE=http://demo.yourdomain.com

# Update CORS for your domain
ALLOW_ORIGINS=http://demo.yourdomain.com:4321,https://demo.yourdomain.com
```

### Configure MediaMTX
Edit `mediamtx/mediamtx.yml`:
```yaml
webrtcIPsFromInterfaces: yes
webrtcIPsFromInterfacesList:
  - "eth0"  # Your public network interface
webrtcAdditionalHosts:
  - "your-public-ip"
  - "demo.yourdomain.com"
```

---

## Scenario 5: Docker Swarm (Multi-Node)

**When to use**: Production deployment across multiple nodes

### Label your nodes
```bash
# On manager node
docker node update --label-add role=frontend <manager-node-name>

# On GPU worker nodes
docker node update --label-add role=frontend <gpu-node-name>
docker node update --label-add gpu=true <gpu-node-name>
```

### Configure .env
```bash
cp .env.example .env
```

Edit `.env`:
```bash
FRONTEND_HOST=192.168.10.2
WORKER_HOST=192.168.10.1
PUBLIC_BASE=http://192.168.10.2
STACK_NAME=vision-hub
ALLOW_ORIGINS=http://192.168.10.2:4321,http://localhost:4321
```

### Deploy the stack
```bash
# Build images first on each node
docker compose -f stack.yml build

# Deploy from manager node
docker stack deploy -c stack.yml vision-hub
```

---

## Hybrid Example: ZeroTier Backend + Public Frontend

Combine approaches for secure backend with public access:

```bash
# .env configuration
FRONTEND_HOST=demo.yourdomain.com   # Public
WORKER_HOST=172.25.0.1              # ZeroTier VPN
API_HOST=demo.yourdomain.com        # Public
PUBLIC_BASE=http://demo.yourdomain.com

# Frontend accessible publicly
# GPU workers on private ZeroTier network
# Secure communication between services
```

---

## Troubleshooting

### Can't connect to services
- Check firewall rules
- Verify IP addresses with `ip a`
- Test connectivity with `ping` or `curl`
- Check Docker logs: `docker compose logs -f`

### WebRTC not working
- Verify MediaMTX configuration
- Check STUN server accessibility
- Ensure UDP port 8189 is open
- Check browser console for errors

### CORS errors
- Update `ALLOW_ORIGINS` in `.env`
- Include all URLs you access the UI from
- Restart services after changing environment

---

## Environment Variables Reference

See `.env.example` for complete list of variables with descriptions.

Key variables:
- Network hosts: `FRONTEND_HOST`, `WORKER_HOST`, `API_HOST`
- Service ports: `FRONTEND_PORT`, `API_PORT`, `YOLO_PORT`, etc.
- Configuration: `PUBLIC_BASE`, `ALLOW_ORIGINS`, `STACK_NAME`
- Camera: `CAMERA_DEVICE`, `RTSP_URL`
- Models: `MODEL`, `MODEL_POSE`, `IMG_SIZE`
