// Connexion WHEP très basique. Attends un <video> et un endpoint WHEP.
export async function connectWhep(whepUrl, videoEl) {
  // 1) Crée la PeerConnection
  const pc = new RTCPeerConnection({ iceServers: [] });
  pc.ontrack = (ev) => { videoEl.srcObject = ev.streams[0]; };

  // 2) Ajoute une track "dummy" recvonly
  const transceiver = pc.addTransceiver('video', { direction: 'recvonly' });

  // 3) Offre → POST /whep
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  const r = await fetch(whepUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/sdp' },
    body: offer.sdp
  });
  if (!r.ok) throw new Error('WHEP answer HTTP ' + r.status);
  const answerSdp = await r.text();
  await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

  return pc;
}
