FROM arch-demo:latest

WORKDIR /root/chang-demo

COPY run_demo.py /root/chang-demo/run_demo.py

ENV CAMERA_RTSP=rtsp://192.168.10.2:8554/cam \
    OUTPUT_RTSP=rtsp://192.168.10.2:8554/chang_annot_2 \
    UIMAIN_OUTPUT_PORT=12346

# If curl is not present in arch-demo, install it (example for Debian/Ubuntu):
# RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD curl -fsS http://127.0.0.1:7002/healthz || exit 1

ENTRYPOINT ["/usr/bin/env", "python3", "/root/chang-demo/run_demo.py"]
