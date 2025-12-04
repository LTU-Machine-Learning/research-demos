# Addon image built on top of your heavy arch-demo image
FROM arch-demo:latest

WORKDIR /root/chang-demo

# If python3 is not in arch-demo, install it (adapt to your base OS).
# You can comment this out if `python3` already exists.
# Example for Debian/Ubuntu-based base image:
# RUN apt-get update && apt-get install -y python3 && rm -rf /var/lib/apt/lists/*

COPY run_demo.py /root/chang-demo/run_demo.py

ENV CAMERA_RTSP=rtsp://mediamtx:8554/cam \
    OUTPUT_RTSP=rtsp://mediamtx:8554/chang_annot \
    UIMAIN_OUTPUT_PORT=12346

ENTRYPOINT ["/usr/bin/env", "python3", "/root/chang-demo/run_demo.py"]
