// src/lib/demos.ts — UNIFORM VERSION "all WHEP"
type DemoCfg = {
  title: string;
  subtitle: string;
  transport: "whep" | "mjpeg";
  cam?: string;    // e.g. ":8889/<stream>/whep"
  mjpeg?: string;  // e.g. ":6000/video"
  ws?: string;     // e.g. ":6000/ws/dets" or ":6000/ws/pose"
  orch?: string;   // e.g. ":8090"
  token?: string;
  demoId: string;
  wsKind?: "boxes" | "pose" | "none";
  kind?: "video" | "form";  // UI kind
};

export default function demos(slug: string): DemoCfg {
  const map: Record<string, DemoCfg> = {
    yolo: {
      title: "YOLO — Object detection",
      subtitle: "Live camera feed with detected objects highlighted on the video.",
      transport: "whep",
      cam: ":8889/cam/whep",     // base stream
      ws:  ":6002/ws/dets",      // WebSocket sends detection boxes
      wsKind: "boxes",
      orch: ":8090",
      token: "dev-token",
      demoId: "yolo",
      kind: "video",
    },

    pose: {
      title: "YOLO — Pose estimation",
      subtitle: "Live camera feed with a real-time pose (~skeleton) overlay.",
      transport: "whep",
      cam: ":8889/cam/whep",     // same video feed as above
      ws:  ":6001/ws/pose",      // WebSocket sends only pose keypoints
      wsKind: "pose",
      orch: ":8090",
      token: "dev-token",
      demoId: "pose",
      kind: "video",
    },

    price: {
      title: "Demo — House price estimation",
      subtitle: "Interactive form that estimates a price range from your inputs.",
      transport: "mjpeg",   // placeholder; no video used for this demo
      orch: ":8090",
      token: "dev-token",
      demoId: "price",
      kind: "form",
    },

    chang: {
      title: "ML group — Arabic line detector",
      subtitle: "Live stream that highlights detected lines of Arabic text.",
      transport: "whep",
      // This assumes mediamtx exposes your OUTPUT_RTSP path as WHEP at /chang_annot/whep
      cam: ":8889/chang_annot/whep",
      // No WebSocket overlay for now – we just play the annotated video
      orch: ":8090",
      token: "dev-token",
      demoId: "chang",
      kind: "video",
      ws: "",
      wsKind: "none",
    },

    "chang_1": {
      title: "ML group — Chinese character detector",
      subtitle: "Live stream that highlights detected Chinese characters.",
      transport: "whep",
      // This assumes mediamtx exposes your OUTPUT_RTSP path as WHEP at /chang_annot/whep
      cam: ":8889/chang_annot_1/whep",
      // No WebSocket overlay for now – we just play the annotated video
      orch: ":8090",
      token: "dev-token",
      demoId: "chang_1",
      kind: "video",
      ws: "",
      wsKind: "none",
    },

    "chang_2": {
      title: "ML group — Latin character detector",
      subtitle: "Live stream that highlights detected Latin characters.",
      transport: "whep",
      // This assumes mediamtx exposes your OUTPUT_RTSP path as WHEP at /chang_annot/whep
      cam: ":8889/chang_annot_2/whep",
      // No WebSocket overlay for now – we just play the annotated video
      orch: ":8090",
      token: "dev-token",
      demoId: "chang_2",
      kind: "video",
      ws: "",
      wsKind: "none",
    },

    // "chang_3": {
    //   title: "ML group — Chang numba 3",
    //   subtitle: "Live stream that 3",
    //   transport: "whep",
    //   // This assumes mediamtx exposes your OUTPUT_RTSP path as WHEP at /chang_annot/whep
    //   cam: ":8889/chang_annot_3/whep",
    //   // No WebSocket overlay for now – we just play the annotated video
    //   orch: ":8090",
    //   token: "dev-token",
    //   demoId: "chang_3",
    //   kind: "video",
    //   ws: "",
    //   wsKind: "none",
    // },

    "chang_4": {
      title: "ML group — drone based car detector",
      subtitle: "Live stream that detects cars in a snowy environment",
      transport: "whep",
      // This assumes mediamtx exposes your OUTPUT_RTSP path as WHEP at /chang_annot/whep
      cam: ":8889/chang_annot_4/whep",
      // No WebSocket overlay for now – we just play the annotated video
      orch: ":8090",
      token: "dev-token",
      demoId: "chang_4",
      kind: "video",
      ws: "",
      wsKind: "none",
    },

    "chang_5": {
      title: "ML group — General purpose text line detector",
      subtitle: "Live stream that detects lines of text in any script",
      transport: "whep",
      // This assumes mediamtx exposes your OUTPUT_RTSP path as WHEP at /chang_annot/whep
      cam: ":8889/chang_annot_5/whep",
      // No WebSocket overlay for now – we just play the annotated video
      orch: ":8090",
      token: "dev-token",
      demoId: "chang_5",
      kind: "video",
      ws: "",
      wsKind: "none",
    },

    "chang_6": {
      title: "YOLO — YOLOv8n segmentation model",
      subtitle: "Live stream that segments (per pixel annotation) objects in the image and highlights them with different colors",
      transport: "whep",
      // This assumes mediamtx exposes your OUTPUT_RTSP path as WHEP at /chang_annot/whep
      cam: ":8889/chang_annot_6/whep",
      // No WebSocket overlay for now – we just play the annotated video
      orch: ":8090",
      token: "dev-token",
      demoId: "chang_6",
      kind: "video",
      ws: "",
      wsKind: "none",
    },

  //   "chang_7": {
  //     title: "ML group — Chang numba 7",
  //     subtitle: "Live stream that 7",
  //     transport: "whep",
  //     // This assumes mediamtx exposes your OUTPUT_RTSP path as WHEP at /chang_annot/whep
  //     cam: ":8889/chang_annot_7/whep",
  //     // No WebSocket overlay for now – we just play the annotated video
  //     orch: ":8090",
  //     token: "dev-token",
  //     demoId: "chang_7",
  //     kind: "video",
  //     ws: "",
  //     wsKind: "none",
  //   },
  };

  return map[slug] ?? {
    title: `Demo — ${slug}`,
    subtitle: "Live demo page",
    transport: "whep",
    cam: `:8889/${slug}/whep`,
    ws:  `:6000/ws/${slug}`,
    wsKind: "boxes",
    orch: ":8090",
    token: "dev-token",
    demoId: slug,
    kind: "form",
  };
}
