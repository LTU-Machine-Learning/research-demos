# Small addon image on top of your heavy demo image
FROM arch-demo:latest

# Make sure we’re in a clean workdir for the script
WORKDIR /root/chang-demo

# If python3 is not already in arch-demo, you may need to install it.
# Comment this block out if python is already present.
# Example for Debian/Ubuntu-based image:
# RUN apt-get update && apt-get install -y python3 && rm -rf /var/lib/apt/lists/*

COPY run_demo.py /root/chang-demo/run_demo.py

# Default environment: you can override CAMERA_RTSP via stack.yml
ENV CAMERA_RTSP=rtsp://mediamtx:8554/cam

# Use the Python orchestrator as entrypoint
ENTRYPOINT ["/usr/bin/env", "python3", "/root/chang-demo/run_demo.py"]
