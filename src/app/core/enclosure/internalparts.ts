import type { Geom3 } from '@jscad/modeling/src/geometries/types';
import measureBoundingBox from '@jscad/modeling/src/measurements/measureBoundingBox';
import measureVolume from '@jscad/modeling/src/measurements/measureVolume';
import { intersect, union } from '@jscad/modeling/src/operations/booleans';
import { rotate, translate } from '@jscad/modeling/src/operations/transforms';
import { cuboid, cylinder } from '@jscad/modeling/src/primitives';
import { degToRad } from '@jscad/modeling/src/utils';

import type { InternalObject, Params, PcbItem } from '../params';
import { base } from './base';
import { cableClampsOnBase } from './clamp';
import { internalWalls } from './internalwalls';
import { cavityFloorZ } from './pcbpreview';

/** Parts are shrunk by this much before collision tests so touching is OK. */
const SHRINK = 0.3;
/** Overlap volume (mm³) below which a collision is ignored as noise. */
const MIN_OVERLAP = 1;

export type PartKind = 'pcb' | 'object';

export type PartCollision = {
  kind: PartKind;
  index: number;
  name: string;
  collides: boolean;
  hitsWalls: boolean;
  hitsCeiling: boolean;
  wallOverlapVolume: number;
  /** Names of other parts this one overlaps with. */
  overlaps: string[];
};

/** Board underside height for a PCB, in base coordinates. */
export const pcbItemRestZ = (params: Params, pcb: PcbItem): number => {
  const floorZ = cavityFloorZ(params);
  if (pcb.elevation !== null && pcb.elevation !== undefined) {
    return floorZ + pcb.elevation;
  }
  const bottomMounts = params.pcbMounts.filter((m) => (m.surface ?? 'bottom') === 'bottom');
  const mountHeight = bottomMounts.reduce((acc, m) => Math.max(acc, m.height), 0);
  return floorZ + mountHeight;
};

const place = (params: Params, x: number, y: number, z: number, rotation: number, g: Geom3) => {
  const rotated = rotation ? rotate([0, 0, degToRad(rotation)], g) : g;
  return translate([params.width / 2 + x, params.length / 2 + y, z], rotated);
};

/** Board and component zone solids for one PCB (base coordinates). */
export const pcbItemSolids = (
  params: Params,
  pcb: PcbItem,
  shrink = 0,
): { board: Geom3; zone: Geom3 | null } => {
  const restZ = pcbItemRestZ(params, pcb);
  const w = Math.max(pcb.width - shrink * 2, 0.1);
  const l = Math.max(pcb.length - shrink * 2, 0.1);
  const t = Math.max(pcb.thickness - shrink * 2, 0.1);

  const board = place(
    params,
    pcb.x,
    pcb.y,
    restZ + pcb.thickness / 2,
    pcb.rotation,
    cuboid({ size: [w, l, t] }),
  );

  let zone: Geom3 | null = null;
  const zoneH = pcb.componentHeight - shrink * 2;
  if (zoneH > 0.01) {
    zone = place(
      params,
      pcb.x,
      pcb.y,
      restZ + pcb.thickness + pcb.componentHeight / 2,
      pcb.rotation,
      cuboid({ size: [w, l, zoneH] }),
    );
  }
  return { board, zone };
};

/** Size of an internal object along x, y, z before rotation about z. */
const objectExtents = (obj: InternalObject): [number, number, number] => {
  if (obj.shape === 'box') return [obj.width, obj.length, obj.height];
  const d = obj.diameter;
  if (obj.axis === 'x') return [obj.height, d, d];
  if (obj.axis === 'y') return [d, obj.height, d];
  return [d, d, obj.height];
};

/** Solid for one internal object (base coordinates). */
export const internalObjectSolid = (params: Params, obj: InternalObject, shrink = 0): Geom3 => {
  const [, , zSize] = objectExtents(obj);
  const centerZ = cavityFloorZ(params) + obj.elevation + zSize / 2;

  let solid: Geom3;
  if (obj.shape === 'cylinder') {
    const radius = Math.max(obj.diameter / 2 - shrink, 0.05);
    const height = Math.max(obj.height - shrink * 2, 0.1);
    solid = cylinder({ radius, height, segments: 48 });
    if (obj.axis === 'x') solid = rotate([0, degToRad(90), 0], solid);
    if (obj.axis === 'y') solid = rotate([degToRad(90), 0, 0], solid);
  } else {
    solid = cuboid({
      size: [
        Math.max(obj.width - shrink * 2, 0.1),
        Math.max(obj.length - shrink * 2, 0.1),
        Math.max(obj.height - shrink * 2, 0.1),
      ],
    });
  }
  return place(params, obj.x, obj.y, centerZ, obj.rotation, solid);
};

const partTopZ = (params: Params, kind: PartKind, part: PcbItem | InternalObject): number => {
  if (kind === 'pcb') {
    const pcb = part as PcbItem;
    return pcbItemRestZ(params, pcb) + pcb.thickness + Math.max(0, pcb.componentHeight);
  }
  const obj = part as InternalObject;
  return cavityFloorZ(params) + obj.elevation + objectExtents(obj)[2];
};

const overlapVolume = (a: Geom3, b: Geom3): number => {
  try {
    // Cheap bounding-box rejection before the boolean.
    const [amin, amax] = measureBoundingBox(a);
    const [bmin, bmax] = measureBoundingBox(b);
    for (let i = 0; i < 3; i++) {
      if (amax[i] <= bmin[i] || bmax[i] <= amin[i]) return 0;
    }
    return measureVolume(intersect(a, b));
  } catch {
    return 0;
  }
};

/**
 * Check every visible PCB and internal object against the enclosure walls,
 * the ceiling (enclosure height) and each other.
 */
export const internalPartCollisions = (params: Params, baseSolid?: Geom3): PartCollision[] => {
  type Entry = { kind: PartKind; index: number; name: string; solid: Geom3; top: number };
  const entries: Entry[] = [];

  (params.pcbs ?? []).forEach((pcb, index) => {
    if (!pcb.visible) return;
    const { board, zone } = pcbItemSolids(params, pcb, SHRINK);
    entries.push({
      kind: 'pcb',
      index,
      name: pcb.name || `PCB ${index + 1}`,
      solid: zone ? union(board, zone) : board,
      top: partTopZ(params, 'pcb', pcb),
    });
  });

  (params.internalObjects ?? []).forEach((obj, index) => {
    if (!obj.visible) return;
    entries.push({
      kind: 'object',
      index,
      name: obj.name || `Object ${index + 1}`,
      solid: internalObjectSolid(params, obj, SHRINK),
      top: partTopZ(params, 'object', obj),
    });
  });

  if (entries.length === 0) return [];

  const obstacles: Geom3[] = [baseSolid ?? base(params)];
  if (params.internalWalls.length > 0) obstacles.push(internalWalls(params));
  if ((params.cableClamps?.length ?? 0) > 0) {
    const clamps = cableClampsOnBase(params);
    if (clamps) obstacles.push(clamps);
  }
  const obstacleSolid = obstacles.length === 1 ? obstacles[0] : union(obstacles);

  const results: PartCollision[] = entries.map((e) => {
    const vol = overlapVolume(e.solid, obstacleSolid);
    const hitsWalls = vol > MIN_OVERLAP;
    const hitsCeiling = e.top > params.height + 1e-6;
    return {
      kind: e.kind,
      index: e.index,
      name: e.name,
      hitsWalls,
      hitsCeiling,
      wallOverlapVolume: hitsWalls ? Math.round(vol * 10) / 10 : 0,
      overlaps: [],
      collides: hitsWalls || hitsCeiling,
    };
  });

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (overlapVolume(entries[i].solid, entries[j].solid) > MIN_OVERLAP) {
        results[i].overlaps.push(entries[j].name);
        results[j].overlaps.push(entries[i].name);
        results[i].collides = true;
        results[j].collides = true;
      }
    }
  }

  return results;
};
