import { cube } from '@jscad/modeling/src/primitives';
import { geom3 } from '@jscad/modeling/src/geometries';
import {
  buildPickMesh,
  edgeToEdge,
  nearestEdge,
  pointToPoint,
  raycast,
  snapPoint,
  type V3,
} from './measure';

describe('measure', () => {
  // 10 mm cube centred on the origin: spans -5..5 on every axis.
  const mesh = buildPickMesh(geom3.toPolygons(cube({ size: 10 })) as { vertices: V3[] }[]);

  it('keeps the 12 cube edges as feature edges', () => {
    expect(mesh.edges.length).toBe(12);
  });

  it('raycasts the nearest face', () => {
    const hit = raycast(mesh, [0, 0, 50], [0, 0, -1]);
    expect(hit).not.toBeNull();
    expect(hit!.point[2]).toBeCloseTo(5, 6);
    expect(hit!.normal[2]).toBeCloseTo(1, 6);
  });

  it('returns null when the ray misses', () => {
    expect(raycast(mesh, [20, 20, 50], [0, 0, -1])).toBeNull();
  });

  it('snaps to a corner, then an edge, then stays on the face', () => {
    expect(snapPoint(mesh, [4.8, 4.9, 5], 0.5, 0.3).kind).toBe('vertex');
    expect(snapPoint(mesh, [4.8, 4.9, 5], 0.5, 0.3).point).toEqual([5, 5, 5]);
    expect(snapPoint(mesh, [0, 4.9, 5], 0.5, 0.3).kind).toBe('edge');
    expect(snapPoint(mesh, [0, 4.9, 5], 0.5, 0.3).point[1]).toBeCloseTo(5, 6);
    expect(snapPoint(mesh, [0, 0, 5], 0.5, 0.3).kind).toBe('face');
  });

  it('measures point to point with axis deltas', () => {
    const r = pointToPoint([0, 0, 0], [3, 4, 0]);
    expect(r.distance).toBeCloseTo(5, 9);
    expect(r.dx).toBeCloseTo(3, 9);
    expect(r.dy).toBeCloseTo(4, 9);
    expect(r.dz).toBe(0);
  });

  it('measures the perpendicular gap between parallel edges', () => {
    const r = edgeToEdge({ a: [0, 0, 0], b: [10, 0, 0] }, { a: [2, 3, 4], b: [20, 3, 4] });
    expect(r.parallel).toBeTrue();
    expect(r.distance).toBeCloseTo(5, 9);
  });

  it('measures closest points between skew edges', () => {
    const r = edgeToEdge({ a: [-5, 0, 0], b: [5, 0, 0] }, { a: [0, -5, 2], b: [0, 5, 2] });
    expect(r.parallel).toBeUndefined();
    expect(r.distance).toBeCloseTo(2, 9);
  });

  it('finds the opposite cube edges 10 mm apart', () => {
    const e1 = nearestEdge(mesh, [0, -5, 5], 0.1)!.edge;
    const e2 = nearestEdge(mesh, [0, 5, 5], 0.1)!.edge;
    expect(edgeToEdge(e1, e2).distance).toBeCloseTo(10, 6);
  });
});
