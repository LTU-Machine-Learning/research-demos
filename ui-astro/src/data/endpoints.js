export type Endpoints = { cam: string; annot: string };

/** À appeler uniquement côté client. */
export function endpointsFromLocation(loc: Location = window.location): Endpoints {
  const base = `${loc.protocol}//${loc.hostname}:8889`;
  return {
    cam:   `${base}/cam/whep`,
    annot: `${base}/annot/whep`,
  };
}
