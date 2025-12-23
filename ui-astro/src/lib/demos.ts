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
      title: "Demo — Object detection",
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
      title: "Demo — Pose estimation",
      subtitle: "Live camera feed with a real-time skeleton overlay.",
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
      title: "Demo — Arabic line selector",
      subtitle: "Live stream that highlights a detected line of Arabic text.",
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

    "chang_ctw-11n-swin": {
      title: "Demo — Arabic line selector",
      subtitle: "Live stream that highlights a detected line of Arabic text.",
      transport: "whep",
      // This assumes mediamtx exposes your OUTPUT_RTSP path as WHEP at /chang_annot/whep
      cam: ":8889/chang_annot_ctw-11n-swin/whep",
      // No WebSocket overlay for now – we just play the annotated video
      orch: ":8090",
      token: "dev-token",
      demoId: "chang_ctw-11n-swin",
      kind: "video",
      ws: "",
      wsKind: "none",
    },
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
