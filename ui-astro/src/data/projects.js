export default [
  {
    slug: 'yolo',
    title: 'Object Detection',
    description:
      'Point the camera at everyday objects and watch them get detected live (labels + boxes) in real time.',
    image: '/images/yolo-demo.jpg',
    credit: "Ultralytics",
    author: {
      name: 'Tom Burellier',
      url: 'https://github.com/balmine',
      role: 'Demo Maintainer',
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
      'See a live pose (“skeleton”) overlay that tracks body joints and movement for each person in the camera view.',
    image: '/images/pose-demo.jpg',
    credit: "Ultralytics",
    author: {
      name: 'Tom Burellier',
      url: 'https://github.com/balmine',
      role: 'Maintainer',
    },
    upstreams: [
      { name: 'Ultralytics YOLOv8', url: 'https://github.com/ultralytics/ultralytics',  role: 'Pose model (keypoints + people)' },
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
    title: "Arabic Line Detection",
    description:
      "Detects and highlights lines of Arabic text.",
    image: '/images/chang-demo.jpg', // put a real thumbnail when you have it
    credit: "Made by the ML group",
    author: {
      name: 'Chang Liu',
      url: 'https://github.com/ChangLiuCat',
      role: 'ML model training and Demo Integration',
    },
    contributors: ['Tom Burellier'],
    repo: 'https://github.com/LTU-Machine-Learning/project_nep',
    upstreams: [
      {
        name: 'uimain (C++/Qt demo)',
        url: 'https://github.com/LTU-Machine-Learning/project_nep/', // optional: fill real URL if you want
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
    slug: 'chang_ctw-11n-swin',
    title: "Arabic Line Detection (ONNX / C++)",
    description:
      "Detects and highlights characters in the image",
    image: '/images/chang-demo.jpg', // TODO change image
    credit: "Made by the ML group",
    author: {
      name: 'Chang Liu',
      url: 'https://github.com/ChangLiuCat',
      role: 'ML model training and Demo Integration',
    },
    contributors: ['Tom Burellier', 'Killian Murphy'],
    repo: 'https://github.com/LTU-Machine-Learning/project_nep',
    upstreams: [
      {
        name: 'uimain (C++/Qt demo)',
        url: 'https://github.com/LTU-Machine-Learning/project_nep/', // optional: fill real URL if you want
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
    ],
    video: '',
    demoUrl: '/demo/chang_ctw-11n-swin',
  },

{
    slug: 'chang_TEST',
    title: "Arabic Line Detection (ONNX / C++)",
    description:
      "TESTING new model",
    image: '/images/chang-demo.jpg', // put a real thumbnail when you have it
    credit: "Made by the ML group",
    author: {
      name: 'Chang Liu',
      url: 'https://github.com/ChangLiuCat',
      role: 'ML model training and Demo Integration',
    },
    contributors: ['Killian Murphy'],
    repo: 'https://github.com/LTU-Machine-Learning/project_nep',
    upstreams: [
      {
        name: 'uimain (C++/Qt demo)',
        url: 'https://github.com/LTU-Machine-Learning/project_nep/', // optional: fill real URL if you want
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
        date: '2026-08',
        event: 'Integrated as a live Vision Hub demo: camera → line detection → annotated stream in the browser.',
      },
    ],
    video: '',
    demoUrl: '/demo/chang_TEST',
  },

  {
    slug: 'price',
    title: 'House Price Estimation (Luleå, Sweden)',
    description:
      'Get an instant price estimate for a home in Luleå from a few details (area, rooms, location, etc.), with an uncertainty range. Data thanks to Booli.',
    image: '/images/price-demo.jpg',
    credit: "Made by the ML group",
    author: {
      name: 'Tom Burellier',
      url: 'https://github.com/balmine',
      role: 'Maintainer',
    },
    upstreams: [
      // ✅ This is the “thanks” that will show on the project page
      { name: 'Booli',          url: 'https://www.booli.se/',                role: 'Sold-market dataset provider — thanks for the data' },
      { name: 'LightGBM',       url: 'https://lightgbm.readthedocs.io/',     role: 'Price model' },
      { name: 'scikit-learn',   url: 'https://scikit-learn.org/',            role: 'Preprocessing pipeline' },
      { name: 'Pandas + NumPy', url: 'https://pandas.pydata.org/',           role: 'Data preparation' },
      { name: 'FastAPI',        url: 'https://fastapi.tiangolo.com/',        role: 'Prediction API' },
      { name: 'Uvicorn',        url: 'https://www.uvicorn.org/',             role: 'API server' },
      { name: 'Docker',         url: 'https://www.docker.com/',              role: 'Deployment' },
      { name: 'Astro (UI)',     url: 'https://astro.build/',                 role: 'Frontend' },
    ],
    history: [
      // More “visitor-friendly milestones” (not devlog)
      { date: '2025-10', event: 'Built the first interactive demo: enter a few home details → get an estimate.' },
      { date: '2025-11', event: 'Added prediction intervals so users can see a realistic price range, not just a single number.' },
      { date: '2025-12', event: 'Improved the Luleå coverage using sold-market data (thanks to Booli) and deployed it in Vision Hub.' },
    ],
    video: '',
    demoUrl: '/demo/price',
  },

];
