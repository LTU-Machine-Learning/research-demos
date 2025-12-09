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

  },
  {
    slug: 'chang',
    title: "Chang's ONNX Pose Pipeline",
    description:
      'Real-time human pose estimation using a C++/ONNX Runtime pipeline (uimain), fed by a low-latency RTSP stream and re-published as an annotated H.264 stream via MediaMTX.',
    image: '/images/chang-demo.jpg', // put a real thumbnail when you have it
    author: {
      name: 'Tom Burellier',
      url: 'https://github.com/balmine',
      role: 'Integrator (Vision Hub)',
    },
    contributors: ['Chang'],
    repo: 'https://github.com/chang/idk',
    upstreams: [
      {
        name: 'uimain ONNX pose demo',
        url: 'https://github.com/…', // optional: fill real URL if you want
        role: 'Base C++ ONNX pose pipeline',
      },
      {
        name: 'ONNX Runtime',
        url: 'https://onnxruntime.ai/',
        role: 'Inference backend (CPU / CUDA)',
      },
      {
        name: 'FFmpeg',
        url: 'https://ffmpeg.org/',
        role: 'RTSP ingest + UDP MPEG-TS + H.264 re-encode',
      },
      {
        name: 'MediaMTX',
        url: 'https://github.com/bluenviron/mediamtx',
        role: 'RTSP/WebRTC hub for annotated stream',
      },
      {
        name: 'CUDA / NVIDIA stack',
        url: 'https://developer.nvidia.com/',
        role: 'Hardware acceleration for ONNX Runtime',
      },
    ],
    history: [
      {
        date: '2025-12-09',
        event:
          'First working integration: RTSP cam → FFmpeg (copy) → UDP → uimain (ONNX) → UDP → FFmpeg → MediaMTX (chang_annot).',
      },
      {
        date: '2025-12-09',
        event:
          'Added health endpoint and orchestration via Vision Hub API (start/stop through /demos/chang).',
      },
    ],
    video: '/videos/chang-demo.mp4', // optional: add when you have a recording
    demoUrl: '/demo/chang',
  },
  {
  slug: 'price',
  title: 'House Price Estimation (Sweden / Luleå demo)',
  description: 'Tabular ML pipeline (LightGBM + FastAPI) that estimates home prices and returns prediction intervals. Trained on a Sweden-wide dataset; easily swappable to Luleå/Norrbotten when data access is granted.',
  image: '/images/price-demo.jpg',
  author: {
    name: 'Tom Burellier',
    url: 'https://github.com/balmine',
    role: 'Maintainer'
  },
  upstreams: [
    { name: 'LightGBM',        url: 'https://lightgbm.readthedocs.io/',            role: 'Gradient boosting regressor' },
    { name: 'scikit-learn',    url: 'https://scikit-learn.org/',                   role: 'Pipelines, preprocessing, CV' },
    { name: 'Pandas + NumPy',  url: 'https://pandas.pydata.org/',                  role: 'Data wrangling' },
    { name: 'FastAPI',         url: 'https://fastapi.tiangolo.com/',               role: 'Serving /predict' },
    { name: 'Uvicorn',         url: 'https://www.uvicorn.org/',                    role: 'ASGI server' },
    { name: 'Docker',          url: 'https://www.docker.com/',                     role: 'Containerized deployment' },
    { name: 'Astro (UI)',      url: 'https://astro.build/',                        role: 'Frontend integration' }
  ],
  history: [
    { date: '2025-10-14', event: 'Initial data ingestion (Kaggle SwedenHousingPrices.csv)' },
    { date: '2025-10-15', event: 'Baseline LightGBM pipeline + quantile bands; model artifacts exported' },
    { date: '2025-10-16', event: 'FastAPI container online; /predict returns price and PI (P10–P90)' }
  ],
  video: '/videos/price-demo.mp4',
  demoUrl: '/demo/price'
}
];
