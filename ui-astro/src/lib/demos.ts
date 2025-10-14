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
      cam: ":8889/cam/whep",     // flux vidéo de base (non annoté)
      ws:  ":5000/ws/dets",      // WS envoie des boxes
      wsKind: "boxes",
      orch: ":8090",
      token: "dev-token",
      demoId: "yolo",
    },
    pose: {
      title: "Demo – YOLO Pose",
      subtitle: "Flux ‘cam’ en WebRTC + squelette via WS.",
      transport: "whep",
      cam: ":8889/cam/whep",     // même preview vidéo; on dessine le squelette côté front
      // si tu préfères afficher l’annot serveur : cam: ":8889/annot_pose/whep",
      ws:  ":5001/ws/pose",      // WS n’envoie que les keypoints
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
