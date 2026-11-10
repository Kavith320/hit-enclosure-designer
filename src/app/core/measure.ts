/**
 * Geometry helpers for the on-screen ruler (measurement tool).
 *
 * Everything here works in world space millimetres and is independent of the
 * renderer so it can be unit tested.
 */

export type V3 = [number, number, number];

export interface PickPolygon {
  vertices: V3[];
  normal: V3;
  /** Plane offset: dot(normal, p) === w for every point p on the polygon. */
  w: number;
}

export interface Segment {
  a: V3;
  b: V3;
}

export interface PickMesh {
  polygons: PickPolygon[];
  /**
   * "Feature" edges: polygon edges that are not shared with a coplanar
   * neighbour, i.e. the real creases / outlines of the model rather than the
   * internal triangulation edges produced by boolean operations.
   */
  edges: Segment[];
}

export interface RayHit {
  point: V3;
  normal: V3;
  t: number;
}

export type SnapKind = 'vertex' | 'edge' | 'face';

export interface SnapResult {
  point: V3;
  kind: SnapKind;
  edge?: Segment;
}

export interface MeasureResult {
  from: V3;
  to: V3;
  distance: number;
  dx: number;
  dy: number;
  dz: number;
  /** True when measuring between two parallel edges (perpendicular gap). */
  parallel?: boolean;
}

const EPS = 1e-9;

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const distance = (a: V3, b: V3): number => length(sub(a, b));
export const normalize = (a: V3): V3 => {
  const len = length(a);
  return len < EPS ? [0, 0, 0] : [a[0] / len, a[1] / len, a[2] / len];
};

/** Newell's method: robust normal for any planar polygon. */
const polygonNormal = (vertices: V3[]): V3 => {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < vertices.length; i++) {
    const c = vertices[i];
    const n = vertices[(i + 1) % vertices.length];
    nx += (c[1] - n[1]) * (c[2] + n[2]);
    ny += (c[2] - n[2]) * (c[0] + n[0]);
    nz += (c[0] - n[0]) * (c[1] + n[1]);
  }
  return normalize([nx, ny, nz]);
};

const edgeKey = (a: V3, b: V3): string => {
  const q = (v: V3) => `${v[0].toFixed(3)},${v[1].toFixed(3)},${v[2].toFixed(3)}`;
  const ka = q(a);
  const kb = q(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
};

/** Build a pick mesh from raw polygons (e.g. `geom3.toPolygons(model)`). */
export const buildPickMesh = (rawPolygons: ReadonlyArray<{ vertices: ArrayLike<number>[] }>) => {
  const polygons: PickPolygon[] = [];
  for (const raw of rawPolygons) {
    if (!raw.vertices || raw.vertices.length < 3) continue;
    const vertices = raw.vertices.map((v) => [v[0], v[1], v[2]] as V3);
    const normal = polygonNormal(vertices);
    if (length(normal) < 0.5) continue;
    polygons.push({ vertices, normal, w: dot(normal, vertices[0]) });
  }

  // Group edges by their (unordered) endpoints and drop edges whose two
  // adjacent faces are coplanar - those are internal triangulation seams.
  const edgeMap = new Map<string, { seg: Segment; normals: V3[] }>();
  for (const polygon of polygons) {
    const { vertices, normal } = polygon;
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % vertices.length];
      if (distance(a, b) < 1e-6) continue;
      const key = edgeKey(a, b);
      const entry = edgeMap.get(key);
      if (entry) {
        entry.normals.push(normal);
      } else {
        edgeMap.set(key, { seg: { a, b }, normals: [normal] });
      }
    }
  }

  const edges: Segment[] = [];
  for (const { seg, normals } of edgeMap.values()) {
    const isSeam = normals.length >= 2 && normals.every((n) => dot(n, normals[0]) > 0.9999);
    if (!isSeam) edges.push(seg);
  }

  return { polygons, edges } as PickMesh;
};

/** Closest ray / mesh intersection, or null when the ray misses. */
export const raycast = (mesh: PickMesh, origin: V3, dir: V3): RayHit | null => {
  let best: RayHit | null = null;

  for (const polygon of mesh.polygons) {
    const { normal, w, vertices } = polygon;
    const denom = dot(normal, dir);
    if (Math.abs(denom) < EPS) continue;

    const t = (w - dot(normal, origin)) / denom;
    if (t <= 1e-6 || (best && t >= best.t)) continue;

    const p = add(origin, scale(dir, t));

    // Inside test: polygons from jscad are convex, so p must be on the same
    // side of every edge (relative to the polygon normal).
    let inside = true;
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % vertices.length];
      if (dot(cross(sub(b, a), sub(p, a)), normal) < -1e-7) {
        inside = false;
        break;
      }
    }

    if (inside) {
      best = { point: p, normal, t };
    }
  }

  return best;
};

export const closestPointOnSegment = (p: V3, a: V3, b: V3): V3 => {
  const ab = sub(b, a);
  const lenSq = dot(ab, ab);
  if (lenSq < EPS) return [...a] as V3;
  const t = Math.min(1, Math.max(0, dot(sub(p, a), ab) / lenSq));
  return add(a, scale(ab, t));
};

/** Feature edge closest to `point` within `radius`, or null. */
export const nearestEdge = (
  mesh: PickMesh,
  point: V3,
  radius: number,
): { edge: Segment; closest: V3; distance: number } | null => {
  let best: { edge: Segment; closest: V3; distance: number } | null = null;
  for (const edge of mesh.edges) {
    const closest = closestPointOnSegment(point, edge.a, edge.b);
    const d = distance(point, closest);
    if (d <= radius && (!best || d < best.distance)) {
      best = { edge, closest, distance: d };
    }
  }
  return best;
};

/**
 * Snap a surface hit to the nearest model corner (vertex) or edge when within
 * the given radii; otherwise keep the raw surface point.
 */
export const snapPoint = (
  mesh: PickMesh,
  hit: V3,
  vertexRadius: number,
  edgeRadius: number,
): SnapResult => {
  const near = nearestEdge(mesh, hit, Math.max(vertexRadius, edgeRadius));
  if (!near) {
    return { point: hit, kind: 'face' };
  }

  // Corner snap: an endpoint of a nearby feature edge.
  let bestVertex: V3 | null = null;
  let bestVertexDist = vertexRadius;
  for (const edge of mesh.edges) {
    for (const v of [edge.a, edge.b]) {
      const d = distance(hit, v);
      if (d <= bestVertexDist) {
        bestVertexDist = d;
        bestVertex = v;
      }
    }
  }
  if (bestVertex) {
    return { point: [...bestVertex] as V3, kind: 'vertex', edge: near.edge };
  }

  if (near.distance <= edgeRadius) {
    return { point: near.closest, kind: 'edge', edge: near.edge };
  }

  return { point: hit, kind: 'face' };
};

export const pointToPoint = (from: V3, to: V3): MeasureResult => ({
  from,
  to,
  distance: distance(from, to),
  dx: Math.abs(to[0] - from[0]),
  dy: Math.abs(to[1] - from[1]),
  dz: Math.abs(to[2] - from[2]),
});

/**
 * Shortest distance between two edges.
 *
 * Parallel edges are measured as the perpendicular gap between their lines
 * (what you want for e.g. wall thickness or the gap between two walls), even
 * if the segments do not overlap along their length.
 */
export const edgeToEdge = (e1: Segment, e2: Segment): MeasureResult => {
  const d1 = sub(e1.b, e1.a);
  const d2 = sub(e2.b, e2.a);
  const r = sub(e1.a, e2.a);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);

  if (a < EPS || e < EPS) {
    // Degenerate edge(s): fall back to point-to-segment.
    const p = a < EPS ? e1.a : closestPointOnSegment(e2.a, e1.a, e1.b);
    const q = closestPointOnSegment(p, e2.a, e2.b);
    return pointToPoint(p, q);
  }

  const c = dot(d1, r);
  const b = dot(d1, d2);
  const denom = a * e - b * b;
  const parallel = denom / (a * e) < 1e-8;

  if (parallel) {
    // Measure from the middle of the overlap (or of e1) straight across.
    const dir2 = normalize(d2);
    const proj = (p: V3) => dot(sub(p, e2.a), dir2);
    const len2 = Math.sqrt(e);
    const lo = Math.max(0, Math.min(proj(e1.a), proj(e1.b)));
    const hi = Math.min(len2, Math.max(proj(e1.a), proj(e1.b)));
    const along = hi >= lo ? (lo + hi) / 2 : (proj(e1.a) + proj(e1.b)) / 2;
    const q = add(e2.a, scale(dir2, along));
    // Foot of the perpendicular from q onto the infinite line of e1.
    const dir1 = normalize(d1);
    const p = add(e1.a, scale(dir1, dot(sub(q, e1.a), dir1)));
    return { ...pointToPoint(p, q), parallel: true };
  }

  // Standard closest-points between two segments (Ericson, RTCD 5.1.9).
  let s = Math.min(1, Math.max(0, (b * f - c * e) / denom));
  let t = (b * s + f) / e;
  if (t < 0) {
    t = 0;
    s = Math.min(1, Math.max(0, -c / a));
  } else if (t > 1) {
    t = 1;
    s = Math.min(1, Math.max(0, (b - c) / a));
  }

  const p = add(e1.a, scale(d1, s));
  const q = add(e2.a, scale(d2, t));
  return pointToPoint(p, q);
};
