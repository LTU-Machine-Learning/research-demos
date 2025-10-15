// src/lib/demos.ts — version UNIFORME "tout WHEP"
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
};

export default function demos(slug: string): DemoCfg {
  const map: Record<string, DemoCfg> = {
    yolo: {
      title: "Demo – YOLO (WebRTC + Canvas)",
      subtitle: "Flux ‘cam’ en WebRTC + overlay Canvas.",
      transport: "whep",
      cam: ":8889/cam/whep",     // base stream
      ws:  ":5000/ws/dets",      // WS sends detection boxes
      wsKind: "boxes",
      orch: ":8090",
      token: "dev-token",
      demoId: "yolo",
    },
    pose: {
      title: "Demo – YOLO Pose",
      subtitle: "Flux ‘cam’ en WebRTC + squelette via WS.",
      transport: "whep",
      cam: ":8889/cam/whep",     // same video feed as above
      ws:  ":5001/ws/pose",      // WS sends only pose keypoints
      wsKind: "pose",
      orch: ":8090",
      token: "dev-token",
      demoId: "pose",
    },
  };

  return map[slug] ?? {
    title: `Demo – ${slug}`,
    subtitle: "Flux générique",
    transport: "whep",
    cam: `:8889/${slug}/whep`,
    ws:  `:5000/ws/${slug}`,
    wsKind: "boxes",
    orch: ":8090",
    token: "dev-token",
    demoId: slug,
  };
}
