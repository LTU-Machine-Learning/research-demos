export default [
  {
    slug: 'yolo',
    title: 'YOLO Object Detection',
    description: 'Real-time object detection using YOLOv8. Detects multiple objects in live video streams with high speed and accuracy.',
    image: '/images/yolo-demo.jpg',
    author: {
      name: 'Tom Burellier',
      url: 'https://github.com/balmine',
      role: 'Maintainer'
    },
    upstreams: [
     { name: 'Ultralytics YOLOv8', url: 'https://github.com/ultralytics/ultralytics', role: 'Inference (object detection)' },
     { name: 'PyTorch',            url: 'https://pytorch.org/',                        role: 'DL backend' },
     { name: 'OpenCV',             url: 'https://opencv.org/',                         role: 'Drawing & JPEG' },
     { name: 'PyAV',               url: 'https://pyav.org/',                           role: 'RTSP low-latency' },
     { name: 'FFmpeg',             url: 'https://ffmpeg.org/',                         role: 'H.264 encode + RTSP' },
     { name: 'MediaMTX',           url: 'https://github.com/bluenviron/mediamtx',      role: 'RTSP/WebRTC/HLS' },
     { name: 'Flask + flask-sock', url: 'https://flask.palletsprojects.com/',          role: 'HTTP + WebSocket' }
   ],
    history: [
      { date: '2025-09-05', event: 'First prototype: USB cam → FFmpeg → RTSP (UDP), baseline H.264 no B-frames' },
      { date: '2025-09-10', event: 'Switched to Ultralytics YOLOv8n; added FP16 on GPU where available' },
      { date: '2025-09-14', event: 'Integrated MediaMTX; added WebRTC (WHEP) path for sub-second preview' },
      { date: '2025-09-16', event: 'Added PyAV low-latency decode (fflags=nobuffer, rc-lookahead=0, etc.)' },
      { date: '2025-03-20', event: 'WebSocket overlay for boxes + class labels; MJPEG debug endpoint' },
      { date: '2025-06-28', event: 'Dockerized end-to-end stack; orchestrator API to start/stop demos on demand' },
    ],
    video: '/videos/yolo-demo.mp4',
    demoUrl: '/demo/yolo'
  },
  {
    slug: 'pose',
    title: 'YOLO Pose Estimation',
    description: 'Human pose estimation using YOLOv8-pose. Tracks keypoints and skeletons in real time.',
    image: '/images/pose-demo.jpg',
    author: { 
      name: 'Tom Burellier', 
      url: 'https://github.com/balmine', 
      role: 'Maintainer' 
    },
   upstreams: [
      { name: 'Ultralytics YOLOv8', url: 'https://github.com/ultralytics/ultralytics', role: 'Inference (object detection)' },
      { name: 'PyTorch',            url: 'https://pytorch.org/',                        role: 'DL backend' },
      { name: 'OpenCV',             url: 'https://opencv.org/',                         role: 'Drawing & JPEG' },
      { name: 'PyAV',               url: 'https://pyav.org/',                           role: 'RTSP low-latency' },
      { name: 'FFmpeg',             url: 'https://ffmpeg.org/',                         role: 'H.264 encode + RTSP' },
      { name: 'MediaMTX',           url: 'https://github.com/bluenviron/mediamtx',      role: 'RTSP/WebRTC/HLS' },
      { name: 'Flask + flask-sock', url: 'https://flask.palletsprojects.com/',          role: 'HTTP + WebSocket' }
    ],
    history: [
      { date: '2025-09-05', event: 'First prototype: USB cam → FFmpeg → RTSP (UDP), baseline H.264 no B-frames' },
      { date: '2025-09-10', event: 'Switched to Ultralytics YOLOv8n; added FP16 on GPU where available' },
      { date: '2025-09-14', event: 'Integrated MediaMTX; added WebRTC (WHEP) path for sub-second preview' },
      { date: '2025-09-16', event: 'Added PyAV low-latency decode (fflags=nobuffer, rc-lookahead=0, etc.)' },
      { date: '2025-03-20', event: 'WebSocket overlay for boxes + class labels; MJPEG debug endpoint' },
      { date: '2025-06-28', event: 'Dockerized end-to-end stack; orchestrator API to start/stop demos on demand' },
    ],
    video: '/videos/pose-demo.mp4',
  demoUrl: '/demo/pose'
  },
  {
    slug: "Chang's Project",
    title: "Chang's Project",
    description: 'Description of Chang\'s project goes here.',
    image: '/images/chang-demo.jpg',
    contributors: ['Chang'],
    repo: 'https://github.com/chang/idk'

  }
];
