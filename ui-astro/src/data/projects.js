export default [
  {
    slug: 'yolo',
    title: 'Object Detection',
    description:
      'Point the camera at everyday objects and watch them get detected live (labels + boxes) in real time.',
    image: '/images/yolo-demo.jpg',
    author: {
      name: 'Tom Burellier',
      url: 'https://github.com/balmine',
      role: 'Maintainer',
    },
    upstreams: [
      { name: 'Ultralytics YOLOv8', url: 'https://github.com/ultralytics/ultralytics', role: 'Detection model (YOLO)' },
      { name: 'PyTorch',            url: 'https://pytorch.org/',                        role: 'Model runtime (training/inference)' },
      { name: 'OpenCV',             url: 'https://opencv.org/',                         role: 'Image utilities & drawing' },
      { name: 'FFmpeg',             url: 'https://ffmpeg.org/',                         role: 'Video encoding/packaging' },
      { name: 'MediaMTX',           url: 'https://github.com/bluenviron/mediamtx',      role: 'WebRTC/RTSP streaming hub' },
      { name: 'Flask + flask-sock', url: 'https://flask.palletsprojects.com/',          role: 'Backend API + WebSocket overlay' },
      { name: 'PyAV',               url: 'https://pyav.org/',                           role: 'Low-latency video decode (RTSP)' },
    ],
    history: [
      { date: '2025-09', event: 'First end-to-end “live detection” demo working on the lab camera feed.' },
      { date: '2025-10', event: 'Added WebRTC live preview so the stream starts quickly in the browser.' },
      { date: '2025-11', event: 'Improved overlay and class labels for a clearer “what is detected” UX.' },
      { date: '2025-12', event: 'Orchestrator integration: start/stop the demo on demand from the UI.' },
    ],
    video: '/videos/yolo-demo.mp4',
    demoUrl: '/demo/yolo',
  },

  {
    slug: 'pose',
    title: 'Pose Estimation',
    description:
      'See a live “skeleton” overlay that tracks body joints and movement for each person in the camera view.',
    image: '/images/pose-demo.jpg',
    author: {
      name: 'Tom Burellier',
      url: 'https://github.com/balmine',
      role: 'Maintainer',
    },
    upstreams: [
      { name: 'Ultralytics YOLOv8', url: 'https://github.com/ultralytics/ultralytics', role: 'Pose model (keypoints + people)' },
      { name: 'PyTorch',            url: 'https://pytorch.org/',                        role: 'Model runtime (inference)' },
      { name: 'OpenCV',             url: 'https://opencv.org/',                         role: 'Image utilities & optional drawing' },
      { name: 'FFmpeg',             url: 'https://ffmpeg.org/',                         role: 'Video encoding/packaging' },
      { name: 'MediaMTX',           url: 'https://github.com/bluenviron/mediamtx',      role: 'WebRTC/RTSP streaming hub' },
      { name: 'Flask + flask-sock', url: 'https://flask.palletsprojects.com/',          role: 'Backend API + WebSocket keypoints' },
      { name: 'PyAV',               url: 'https://pyav.org/',                           role: 'Low-latency video decode (RTSP)' },
    ],
    history: [
      { date: '2025-09', event: 'First live skeleton overlay tracking multiple people in real time.' },
      { date: '2025-10', event: 'Smoother, clearer keypoint rendering for better readability.' },
      { date: '2025-12', event: 'Orchestrator integration: one-click start from Vision Hub.' },
    ],
    video: '/videos/pose-demo.mp4',
    demoUrl: '/demo/pose',
  },

  {
    slug: 'chang',
    title: "Arabic Line Detection (ONNX / C++)",
    description:
      "Detects and highlights lines of Arabic text. (Made by the ML group at LTU)",
    image: '/images/chang-demo.jpg', // put a real thumbnail when you have it
    author: {
      name: 'Tom Burellier',
      url: 'https://github.com/balmine',
      role: 'Vision Hub integration',
    },
    contributors: ['Chang'],
    repo: 'https://github.com/chang/idk',
    upstreams: [
      {
        name: 'uimain (C++/Qt demo)',
        url: 'https://github.com/…', // optional: fill real URL if you want
        role: 'C++/Qt application & line-detection pipeline',
      },
      {
        name: 'ONNX Runtime',
        url: 'https://onnxruntime.ai/',
        role: 'Inference runtime (portable across platforms)',
      },
      {
        name: 'FFmpeg',
        url: 'https://ffmpeg.org/',
        role: 'Video ingest + re-encode for streaming',
      },
      {
        name: 'MediaMTX',
        url: 'https://github.com/bluenviron/mediamtx',
        role: 'WebRTC/RTSP hub for the annotated output stream',
      },
      {
        name: 'NVIDIA / CUDA',
        url: 'https://developer.nvidia.com/',
        role: 'Optional acceleration (when available)',
      },
    ],
    history: [
      {
        date: '2025-12',
        event: 'Integrated as a live Vision Hub demo: camera → line detection → annotated stream in the browser.',
      },
      {
        date: '2025-12',
        event: 'Defined roadmap: keep line detection robust, then add text extraction (OCR) on top of detected lines.',
      },
    ],
    video: '',
    demoUrl: '/demo/chang',
  },


  {
    slug: 'price',
    title: 'House Price Estimation',
    description:
      'Fill a few fields and get an instant price estimate with a confidence range (Sweden dataset; demo-focused).',
    image: '/images/price-demo.jpg',
    author: {
      name: 'Tom Burellier',
      url: 'https://github.com/balmine',
      role: 'Maintainer',
    },
    upstreams: [
      { name: 'LightGBM',        url: 'https://lightgbm.readthedocs.io/', role: 'Regression model (tabular ML)' },
      { name: 'scikit-learn',    url: 'https://scikit-learn.org/',        role: 'Preprocessing & pipelines' },
      { name: 'Pandas + NumPy',  url: 'https://pandas.pydata.org/',       role: 'Data preparation' },
      { name: 'FastAPI',         url: 'https://fastapi.tiangolo.com/',    role: 'Prediction API (/predict)' },
      { name: 'Uvicorn',         url: 'https://www.uvicorn.org/',         role: 'API server runtime' },
      { name: 'Docker',          url: 'https://www.docker.com/',          role: 'Containerized deployment' },
      { name: 'Astro (UI)',      url: 'https://astro.build/',             role: 'Web interface integration' },
    ],
    history: [
      { date: '2025-10', event: 'First working API returning an estimate and a confidence interval.' },
      { date: '2025-10', event: 'Improved feature handling for more stable predictions from partial inputs.' },
      { date: '2025-12', event: 'Connected to Vision Hub UI (form demo) for quick interactive testing.' },
    ],
    video: '',
    demoUrl: '/demo/price',
  },
];
