// src/lib/demos.ts — UNIFORM VERSION "all WHEP"
type DemoCfg = {
  title: string;
  subtitle: string;
  transport: "whep" | "mjpeg";
  cam?: string;    // e.g. ":8889/<stream>/whep"
  mjpeg?: string;  // e.g. ":5000/video"
  ws?: string;     // e.g. ":5000/ws/dets" or ":5000/ws/pose"
  orch?: string;   // e.g. ":8090"
  token?: string;
  demoId: string;
  wsKind?: "boxes" | "pose";
  kind?: "video" | "form";  // UI kind
};

export default function demos(slug: string): DemoCfg {
  const map: Record<string, DemoCfg> = {
    yolo: {
      title: "Demo – YOLO (WebRTC + Canvas)",
      subtitle: "‘cam’ stream via WebRTC with Canvas overlay.",
      transport: "whep",
      cam: ":8889/cam/whep",     // base stream
      ws:  ":5000/ws/dets",      // WebSocket sends detection boxes
      wsKind: "boxes",
      orch: ":8090",
      token: "dev-token",
      demoId: "yolo",
      kind: "video",
    },
    pose: {
      title: "Demo – YOLO Pose",
      subtitle: "‘cam’ stream via WebRTC with pose skeleton overlay.",
      transport: "whep",
      cam: ":8889/cam/whep",     // same video feed as above
      ws:  ":5001/ws/pose",      // WebSocket sends only pose keypoints
      wsKind: "pose",
      orch: ":8090",
      token: "dev-token",
      demoId: "pose",
      kind: "video",
    },
    price: {
      title: "Demo – Price Estimation",
      subtitle: "Interactive estimation form (FastAPI) – no video stream.",
      transport: "mjpeg",   // placeholder; no video used for this demo
      orch: ":8090",
      token: "dev-token",
      demoId: "price",
      kind: "form",  

    },
  };

  return map[slug] ?? {
    title: `Demo – ${slug}`,
    subtitle: "Generic video stream",
    transport: "whep",
    cam: `:8889/${slug}/whep`,
    ws:  `:5000/ws/${slug}`,
    wsKind: "boxes",
    orch: ":8090",
    token: "dev-token",
    demoId: slug,
    kind: "form",
  };
}
