import measureBoundingBox from '@jscad/modeling/src/measurements/measureBoundingBox';
import measureVolume from '@jscad/modeling/src/measurements/measureVolume';

import { cloneParams, DEFAULT_PARAMS, DEFAULT_SKETCH, type SketchFeature } from '../params';
import { convertParams } from '../units';
import { base } from './base';
import { lid } from './lid';
import {
  cleanPolygon,
  faceFrame,
  isSelfIntersecting,
  polygonArea,
  sketchNormalRange,
  sketchSolid,
} from './sketch';

const makeParams = () => {
  const p = cloneParams(DEFAULT_PARAMS);
  p.holes = [];
  p.waterProof = false;
  p.lidScrews = false;
  p.wallMounts = false;
  return p;
};

const sketch = (patch: Partial<SketchFeature>): SketchFeature => ({
  ...DEFAULT_SKETCH,
  ...patch,
});

const bounds = (g: Parameters<typeof measureBoundingBox>[0]) =>
  measureBoundingBox(g).map((v) => Array.from(v).map((n) => Number(n.toFixed(3))));

describe('sketch features', () => {
  it('builds right-handed face frames (u × v = n)', () => {
    const p = makeParams();
    for (const surface of ['front', 'back', 'left', 'right', 'bottom', 'top'] as const) {
      const { u, v, n } = faceFrame(p, surface);
      const cross = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
      cross.forEach((c, i) => expect(c).toBeCloseTo(n[i], 9));
    }
  });

  it('places an outside extrusion on the front face', () => {
    const p = makeParams();
    const solid = sketchSolid(p, sketch({ surface: 'front', x: 5, y: 3, depth: 4 }))!;
    // Front face is y = length; +x on the face is world -X.
    expect(bounds(solid)).toEqual([
      [35, p.length - 0.1, 13],
      [55, p.length + 4, 23],
    ]);
  });

  it('cuts from the inside face of a wall', () => {
    const p = makeParams();
    const range = sketchNormalRange(
      sketch({ side: 'inside', operation: 'cut', depth: 0.5 }),
      faceFrame(p, 'front').thickness,
    );
    expect(range[0]).toBeCloseTo(-p.wall - 1, 6);
    expect(range[1]).toBeCloseTo(-p.wall + 0.5, 6);
  });

  it('adds and removes material on the base', () => {
    const p = makeParams();
    const plain = measureVolume(base(p));

    p.sketches = [sketch({ surface: 'front', width: 20, height: 10, depth: 4 })];
    expect(measureVolume(base(p)) - plain).toBeCloseTo(800, 0);

    p.sketches = [sketch({ surface: 'bottom', operation: 'cut', width: 10, height: 10, depth: 1 })];
    expect(plain - measureVolume(base(p))).toBeCloseTo(100, 0);
  });

  it('applies lid sketches to the lid only', () => {
    const p = makeParams();
    const plainLid = measureVolume(lid(p));
    const plainBase = measureVolume(base(p));
    p.sketches = [sketch({ surface: 'top', operation: 'cut', width: 10, height: 10, depth: 1 })];
    expect(plainLid - measureVolume(lid(p))).toBeCloseTo(100, 0);
    expect(measureVolume(base(p))).toBeCloseTo(plainBase, 3);
  });

  it('extrudes a free-drawn polygon', () => {
    const p = makeParams();
    const solid = sketchSolid(
      p,
      sketch({
        surface: 'bottom',
        side: 'inside',
        shape: 'polygon',
        points: [
          [0, 0],
          [10, 0],
          [0, 10],
        ],
        depth: 5,
      }),
    )!;
    expect(measureVolume(solid)).toBeCloseTo(50 * 5.1, 3);
  });

  it('skips degenerate sketches', () => {
    const p = makeParams();
    expect(sketchSolid(p, sketch({ depth: 0 }))).toBeNull();
    expect(
      sketchSolid(
        p,
        sketch({
          shape: 'polygon',
          points: [
            [0, 0],
            [1, 1],
          ],
        }),
      ),
    ).toBeNull();
  });

  it('normalises polygon winding and detects self intersection', () => {
    const cw: [number, number][] = [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ];
    const cleaned = cleanPolygon(cw);
    expect(cleaned.length).toBe(4);
    expect(polygonArea(cleaned)).toBeGreaterThan(0);

    const bowtie: [number, number][] = [
      [0, 0],
      [1, 1],
      [1, 0],
      [0, 1],
    ];
    expect(isSelfIntersecting(bowtie)).toBeTrue();
    expect(isSelfIntersecting(cleaned)).toBeFalse();
  });

  it('converts sketch dimensions between unit systems', () => {
    const p = makeParams();
    p.sketches = [sketch({ width: 25.4, depth: 2.54, points: [[25.4, 0]] })];
    const imperial = convertParams(p, 'imperial');
    expect(imperial.sketches![0].width).toBeCloseTo(1, 4);
    expect(imperial.sketches![0].depth).toBeCloseTo(0.1, 4);
    expect(imperial.sketches![0].points[0][0]).toBeCloseTo(1, 4);
  });
});
