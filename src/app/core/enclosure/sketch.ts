import type { Geom2, Geom3 } from '@jscad/modeling/src/geometries/types';
import { union } from '@jscad/modeling/src/operations/booleans';
import { extrudeLinear } from '@jscad/modeling/src/operations/extrusions';
import { rotate, transform, translate } from '@jscad/modeling/src/operations/transforms';
import { circle, polygon, rectangle, roundedRectangle } from '@jscad/modeling/src/primitives';
import { degToRad } from '@jscad/modeling/src/utils';

import type { Params, SketchFeature } from '../params';
import type { Surface } from '.';

type V3 = [number, number, number];

/** How far an extrusion sinks into the wall so the union is watertight. */
const EXTRUDE_OVERLAP = 0.1;
/** How far a cut starts outside the face so it never leaves a skin. */
const CUT_OVERCUT = 1;
const MIN_SIZE = 0.01;

export const BASE_SKETCH_SURFACES: Surface[] = ['front', 'back', 'left', 'right', 'bottom'];
export const LID_SKETCH_SURFACES: Surface[] = ['top'];

/**
 * Local frame of an enclosure face, in the base's (or, for `top`, the lid's)
 * own coordinates. `u` is "right" and `v` is "up" as seen from outside, `n`
 * is the outward normal. The frame is always right-handed (u × v = n).
 */
export type FaceFrame = {
  center: V3;
  u: V3;
  v: V3;
  n: V3;
  /** Face size along u and v. */
  width: number;
  height: number;
  /** Material thickness behind the face (outer face → inner face). */
  thickness: number;
};

/** Thickness of the base side walls (matches `base()`). */
export const baseWallThickness = (params: Params): number =>
  params.waterProof
    ? params.wall * 2 + params.insertClearance * 2 + params.insertThickness
    : params.wall;

export const faceFrame = (params: Params, surface: Surface): FaceFrame => {
  const { width: W, length: L, height: H, floor, roof } = params;
  const wallT = baseWallThickness(params);

  switch (surface) {
    case 'front':
      return {
        center: [W / 2, L, H / 2],
        u: [-1, 0, 0],
        v: [0, 0, 1],
        n: [0, 1, 0],
        width: W,
        height: H,
        thickness: wallT,
      };
    case 'back':
      return {
        center: [W / 2, 0, H / 2],
        u: [1, 0, 0],
        v: [0, 0, 1],
        n: [0, -1, 0],
        width: W,
        height: H,
        thickness: wallT,
      };
    case 'left':
      return {
        center: [W, L / 2, H / 2],
        u: [0, 1, 0],
        v: [0, 0, 1],
        n: [1, 0, 0],
        width: L,
        height: H,
        thickness: wallT,
      };
    case 'right':
      return {
        center: [0, L / 2, H / 2],
        u: [0, -1, 0],
        v: [0, 0, 1],
        n: [-1, 0, 0],
        width: L,
        height: H,
        thickness: wallT,
      };
    case 'bottom':
      return {
        center: [W / 2, L / 2, 0],
        u: [-1, 0, 0],
        v: [0, 1, 0],
        n: [0, 0, -1],
        width: W,
        height: L,
        thickness: floor,
      };
    case 'top':
      // Lid coordinates: the lid is modelled roof-down, outer face at z = 0.
      return {
        center: [W / 2, L / 2, 0],
        u: [-1, 0, 0],
        v: [0, 1, 0],
        n: [0, 0, -1],
        width: W,
        height: L,
        thickness: roof,
      };
    default:
      throw new Error(`Invalid surface: ${surface as string}`);
  }
};

/** Signed area (positive = counter-clockwise). */
export const polygonArea = (points: ReadonlyArray<readonly [number, number]>): number => {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
};

/** Remove consecutive duplicates and force counter-clockwise winding. */
export const cleanPolygon = (
  points: ReadonlyArray<readonly [number, number]>,
): [number, number][] => {
  const cleaned: [number, number][] = [];
  for (const [x, y] of points) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const prev = cleaned[cleaned.length - 1];
    if (prev && Math.hypot(prev[0] - x, prev[1] - y) < 1e-6) continue;
    cleaned.push([x, y]);
  }
  if (cleaned.length > 1) {
    const [fx, fy] = cleaned[0];
    const [lx, ly] = cleaned[cleaned.length - 1];
    if (Math.hypot(fx - lx, fy - ly) < 1e-6) cleaned.pop();
  }
  return polygonArea(cleaned) < 0 ? cleaned.reverse() : cleaned;
};

/** True when two non-adjacent polygon edges cross each other. */
export const isSelfIntersecting = (points: ReadonlyArray<readonly [number, number]>): boolean => {
  const n = points.length;
  const cross = (
    a: readonly [number, number],
    b: readonly [number, number],
    c: readonly [number, number],
  ) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      const c = points[j];
      const d = points[(j + 1) % n];
      const d1 = cross(a, b, c);
      const d2 = cross(a, b, d);
      const d3 = cross(c, d, a);
      const d4 = cross(c, d, b);
      if (d1 * d2 < 0 && d3 * d4 < 0) return true;
    }
  }
  return false;
};

/** 2D outline of a sketch in face coordinates, or null if it is degenerate. */
export const sketchOutline = (sketch: SketchFeature): Geom2 | null => {
  let shape: Geom2;

  if (sketch.shape === 'circle') {
    if (!(sketch.diameter > MIN_SIZE)) return null;
    shape = circle({ radius: sketch.diameter / 2, segments: 64 });
  } else if (sketch.shape === 'polygon') {
    const points = cleanPolygon(sketch.points ?? []);
    if (points.length < 3 || Math.abs(polygonArea(points)) < MIN_SIZE) return null;
    shape = polygon({ points });
  } else {
    const w = sketch.width;
    const h = sketch.height;
    if (!(w > MIN_SIZE) || !(h > MIN_SIZE)) return null;
    const r = Math.min(Math.max(0, sketch.cornerRadius ?? 0), Math.min(w, h) / 2 - 0.001);
    shape =
      r > 0.001
        ? roundedRectangle({ size: [w, h], roundRadius: r, segments: 32 })
        : rectangle({ size: [w, h] });
  }

  if (sketch.rotation) {
    shape = rotate([0, 0, degToRad(sketch.rotation)], shape);
  }
  return translate([sketch.x, sketch.y, 0], shape);
};

/**
 * Extent of the solid along the face normal (0 = outer face, + = outwards,
 * -thickness = inner face).
 */
export const sketchNormalRange = (sketch: SketchFeature, thickness: number): [number, number] => {
  const depth = Math.max(0, sketch.depth);
  const inner = -thickness;
  if (sketch.side === 'inside') {
    return sketch.operation === 'extrude'
      ? [inner - depth, inner + EXTRUDE_OVERLAP]
      : [inner - CUT_OVERCUT, inner + depth];
  }
  return sketch.operation === 'extrude' ? [-EXTRUDE_OVERLAP, depth] : [-depth, CUT_OVERCUT];
};

/** Solid for one sketch, placed in base (or lid, for `top`) coordinates. */
export const sketchSolid = (params: Params, sketch: SketchFeature): Geom3 | null => {
  if (!(sketch.depth > 0)) return null;
  const outline = sketchOutline(sketch);
  if (!outline) return null;

  const frame = faceFrame(params, sketch.surface);
  const [z0, z1] = sketchNormalRange(sketch, frame.thickness);
  const solid = translate([0, 0, z0], extrudeLinear({ height: z1 - z0 }, outline));

  const { u, v, n, center: c } = frame;
  // Column-major: local x → u, y → v, z → n, then move to the face centre.
  const matrix = [
    u[0],
    u[1],
    u[2],
    0,
    v[0],
    v[1],
    v[2],
    0,
    n[0],
    n[1],
    n[2],
    0,
    c[0],
    c[1],
    c[2],
    1,
  ];
  return transform(matrix as Parameters<typeof transform>[0], solid);
};

/** Added and removed material for all sketches on the given surfaces. */
export const sketchFeatures = (
  params: Params,
  surfaces: Surface[],
): { adds: Geom3 | null; cuts: Geom3 | null } => {
  const adds: Geom3[] = [];
  const cuts: Geom3[] = [];

  for (const sketch of params.sketches ?? []) {
    if (!surfaces.includes(sketch.surface)) continue;
    const solid = sketchSolid(params, sketch);
    if (!solid) continue;
    (sketch.operation === 'cut' ? cuts : adds).push(solid);
  }

  const merge = (parts: Geom3[]) =>
    parts.length === 0 ? null : parts.length === 1 ? parts[0] : union(parts);
  return { adds: merge(adds), cuts: merge(cuts) };
};
