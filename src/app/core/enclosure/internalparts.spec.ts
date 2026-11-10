import measureBoundingBox from '@jscad/modeling/src/measurements/measureBoundingBox';

import {
  cloneParams,
  DEFAULT_INTERNAL_OBJECT,
  DEFAULT_PARAMS,
  DEFAULT_PCB,
  type Params,
} from '../params';
import {
  internalObjectSolid,
  internalPartCollisions,
  pcbItemRestZ,
  pcbItemSolids,
} from './internalparts';
import { cavityFloorZ } from './pcbpreview';

const makeParams = (): Params => {
  const p = cloneParams(DEFAULT_PARAMS);
  p.holes = [];
  p.internalWalls = [];
  p.pcbMounts = [];
  return p;
};

describe('internal parts (multiple PCBs + objects)', () => {
  it('places each PCB at its own offset', () => {
    const p = makeParams();
    const a = pcbItemSolids(p, { ...DEFAULT_PCB, x: -20 }).board;
    const b = pcbItemSolids(p, { ...DEFAULT_PCB, x: 20 }).board;
    const [aMin] = measureBoundingBox(a);
    const [bMin] = measureBoundingBox(b);
    expect(bMin[0] - aMin[0]).toBeCloseTo(40, 6);
  });

  it('uses an explicit elevation instead of resting on mounts', () => {
    const p = makeParams();
    p.pcbMounts = [
      { surface: 'bottom', x: 0, y: 0, height: 6, outerDiameter: 6, screwDiameter: 2 },
    ];
    expect(pcbItemRestZ(p, { ...DEFAULT_PCB, elevation: null })).toBeCloseTo(cavityFloorZ(p) + 6);
    expect(pcbItemRestZ(p, { ...DEFAULT_PCB, elevation: 12 })).toBeCloseTo(cavityFloorZ(p) + 12);
  });

  it('lays a cylinder along X', () => {
    const p = makeParams();
    const solid = internalObjectSolid(p, {
      ...DEFAULT_INTERNAL_OBJECT,
      shape: 'cylinder',
      axis: 'x',
      diameter: 18,
      height: 65,
    });
    const [min, max] = measureBoundingBox(solid);
    expect(max[0] - min[0]).toBeCloseTo(65, 3);
    expect(max[2] - min[2]).toBeCloseTo(18, 1);
    expect(min[2]).toBeCloseTo(cavityFloorZ(p), 3);
  });

  it('reports no collisions for parts that fit apart from each other', () => {
    const p = makeParams();
    p.pcbs = [{ ...DEFAULT_PCB, name: 'A', width: 20, length: 20, x: -20 }];
    p.internalObjects = [{ ...DEFAULT_INTERNAL_OBJECT, name: 'B', width: 10, length: 10, x: 20 }];
    const results = internalPartCollisions(p);
    expect(results.length).toBe(2);
    expect(results.every((r) => !r.collides)).toBeTrue();
  });

  it('reports parts that overlap each other, the walls, or the ceiling', () => {
    const p = makeParams();
    p.pcbs = [
      { ...DEFAULT_PCB, name: 'Main', width: 20, length: 20 },
      { ...DEFAULT_PCB, name: 'Huge', width: 300, length: 20, y: 25 },
    ];
    p.internalObjects = [
      { ...DEFAULT_INTERNAL_OBJECT, name: 'Battery', width: 10, length: 10 },
      { ...DEFAULT_INTERNAL_OBJECT, name: 'Tall', height: 200, x: 30, y: -25, width: 5, length: 5 },
    ];
    const byName = Object.fromEntries(internalPartCollisions(p).map((r) => [r.name, r]));
    expect(byName['Main'].overlaps).toEqual(['Battery']);
    expect(byName['Battery'].overlaps).toEqual(['Main']);
    expect(byName['Huge'].hitsWalls).toBeTrue();
    expect(byName['Tall'].hitsCeiling).toBeTrue();
  });

  it('ignores hidden parts', () => {
    const p = makeParams();
    p.pcbs = [{ ...DEFAULT_PCB, visible: false, width: 500 }];
    expect(internalPartCollisions(p)).toEqual([]);
  });
});
