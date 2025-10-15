export type Endpoints = { cam: string; annot: string };

export function endpointsFromLocation(loc: Location = window.location): Endpoints {
  const base = `${loc.protocol}//${loc.hostname}:8889`;
  return {
    cam:   `${base}/cam/whep`,
    annot: `${base}/annot/whep`,
  };
}
