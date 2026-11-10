import type { Surface } from './enclosure';

export type MeasurementSystem = 'metric' | 'imperial';

export type HoleShape = 'circle' | 'square' | 'rectangle' | 'double-d';

export type Hole = {
  shape: HoleShape;
  diameter: number;
  width: number;
  length: number;
  surface: Surface;
  x: number;
  y: number;
  flatWidth?: number;
  rotation?: number;
};

export type SketchShape = 'rectangle' | 'circle' | 'polygon';
/** `extrude` adds material, `cut` removes material. */
export type SketchOperation = 'extrude' | 'cut';
/** Which side of the wall/floor/roof the sketch starts from. */
export type SketchSide = 'outside' | 'inside';

/**
 * A 2D shape drawn on an enclosure face, then extruded (added) or cut
 * (removed) to a given depth.
 *
 * Face coordinates are measured from the centre of the face as seen from
 * OUTSIDE the enclosure: +x to the right, +y up. For the Bottom face (seen
 * from below) and the Lid (seen from above when closed) +y points towards the
 * Front.
 */
export type SketchFeature = {
  name?: string;
  surface: Surface;
  side: SketchSide;
  operation: SketchOperation;
  shape: SketchShape;
  /** Centre of the shape on the face. */
  x: number;
  y: number;
  /** Rectangle size. */
  width: number;
  height: number;
  /** Rectangle corner radius. */
  cornerRadius: number;
  /** Circle diameter. */
  diameter: number;
  /** Polygon outline, relative to (x, y). */
  points: [number, number][];
  /** In-plane rotation in degrees (counter-clockwise). */
  rotation: number;
  /** Extrude height, or cut depth. */
  depth: number;
};

export const DEFAULT_SKETCH: SketchFeature = {
  surface: 'front',
  side: 'outside',
  operation: 'extrude',
  shape: 'rectangle',
  x: 0,
  y: 0,
  width: 20,
  height: 10,
  cornerRadius: 0,
  diameter: 10,
  points: [],
  rotation: 0,
  depth: 2,
};

export type PCBMount = {
  surface: Surface;
  x: number;
  y: number;
  height: number;
  outerDiameter: number;
  screwDiameter: number;
  chamfer?: boolean;
};

export type InternalWall = {
  x: number;
  y: number;
  height: number;
  length: number;
  thickness: number;
  rotation: number;
};

export type LidScrewHoleType = 'blind' | 'nut-pocket' | 'through';
export type LidScrewRecessType = 'none' | 'counterbore' | 'countersunk';

export type SnapFitPreset = 4 | 6 | 8;

export type SnapFit = {
  enabled: boolean;
  preset: SnapFitPreset;
  endPercent: number;
  width: number;
  depth: number;
  height: number;
  clearance: number;
};

export type PCBPreview = {
  enabled: boolean;
  width: number;
  length: number;
  thickness: number;
  componentHeight: number;
  x: number;
  y: number;
};

/** One PCB placed inside the base (preview + collision check only). */
export type PcbItem = {
  name: string;
  visible: boolean;
  width: number;
  length: number;
  thickness: number;
  componentHeight: number;
  /** Offset of the board centre from the cavity centre. */
  x: number;
  y: number;
  /**
   * Height of the board underside above the cavity floor. When null/undefined
   * the board rests on the tallest bottom PCB mount (or the floor).
   */
  elevation?: number | null;
  /** Rotation about the vertical axis, degrees. */
  rotation: number;
};

export type InternalObjectShape = 'box' | 'cylinder';

/** A generic part inside the enclosure (battery, module, connector, ...). */
export type InternalObject = {
  name: string;
  visible: boolean;
  shape: InternalObjectShape;
  /** Box size (X, Y, Z). */
  width: number;
  length: number;
  height: number;
  /** Cylinder diameter (height uses `height`). */
  diameter: number;
  /** Cylinder axis: vertical (z) or lying along x / y. */
  axis: 'x' | 'y' | 'z';
  /** Offset of the object centre from the cavity centre. */
  x: number;
  y: number;
  /** Height of the object underside above the cavity floor. */
  elevation: number;
  rotation: number;
  /** CSS hex colour for the preview. */
  color: string;
};

export const DEFAULT_PCB: PcbItem = {
  name: 'PCB',
  visible: true,
  width: 50,
  length: 40,
  thickness: 1.6,
  componentHeight: 8,
  x: 0,
  y: 0,
  elevation: null,
  rotation: 0,
};

export const DEFAULT_INTERNAL_OBJECT: InternalObject = {
  name: 'Object',
  visible: true,
  shape: 'box',
  width: 20,
  length: 15,
  height: 10,
  diameter: 18,
  axis: 'z',
  x: 0,
  y: 0,
  elevation: 0,
  rotation: 0,
  color: '#f59e0b',
};

export type CableClamp = {
  surface?: Surface;
  x: number;
  y: number;
  length: number;
  wallHeight: number;
  wallThickness: number;
  mountScrewDiameter: number;
  mountOuterDiameter: number;
  mountHeight: number;
  rotation: number;
  topHeight: number;
  topScrewDiameter: number;
  ridges?: boolean;
  ridgeCount?: number;
};

export const DEFAULT_CABLE_CLAMP: CableClamp = {
  surface: 'bottom',
  x: 0,
  y: 0,
  length: 15,
  wallHeight: 5,
  wallThickness: 5,
  mountScrewDiameter: 2,
  mountOuterDiameter: 6,
  mountHeight: 8,
  rotation: 0,
  topHeight: 2.5,
  topScrewDiameter: 2.6,
  ridges: true,
  ridgeCount: 2,
};

export type Params = {
  measurementSystem?: MeasurementSystem;
  length: number;
  width: number;
  height: number;
  floor: number;
  roof: number;
  wall: number;
  waterProof: boolean;
  sealThickness: number;
  insertThickness: number;
  insertHeight: number;
  insertClearance: number;
  showLid: boolean;
  showBase: boolean;
  showGrid: boolean;
  gridSpacing: number;
  cornerRadius: number;
  holes: Hole[];
  pcbMounts: PCBMount[];
  internalWalls: InternalWall[];
  cableClamps: CableClamp[];
  sketches?: SketchFeature[];
  pcbs?: PcbItem[];
  internalObjects?: InternalObject[];
  wallMounts: boolean;
  wallMountCount: number;
  wallMountScrewDiameter: number;
  lidScrews: boolean;
  lidScrewDiameter: number;
  baseLidScrewDiameter: number;
  lidScrewHoleType: LidScrewHoleType;
  lidScrewHoleDepth: number;
  lidScrewNutWidth: number;
  lidScrewNutDepth: number;
  lidScrewRecessType: LidScrewRecessType;
  lidScrewRecessDiameter: number;
  lidScrewRecessDepth: number;
  dinRailMount: boolean;
  dinRailOrientation: 'horizontal' | 'vertical';
  dinRailMountWidth: number;
  dinRailScrewDiameter: number;
  showDinRailMount: boolean;
  snapFit: SnapFit;
  pcbPreview: PCBPreview;
  baseBedChamfer: number;
  lidBedChamfer: number;
  lidTopChamfer: number;
};

export const DEFAULT_PARAMS: Params = {
  measurementSystem: 'metric',
  length: 80,
  width: 100,
  height: 30,
  floor: 2,
  roof: 2,
  wall: 1,
  waterProof: true,
  sealThickness: 2,
  insertThickness: 2,
  insertHeight: 4,
  insertClearance: 0.04,
  showLid: true,
  showBase: true,
  showGrid: true,
  gridSpacing: 10,
  cornerRadius: 3,
  holes: [
    {
      shape: 'circle',
      surface: 'front',
      diameter: 12.5,
      width: 10,
      length: 10,
      flatWidth: 11,
      rotation: 0,
      x: 0,
      y: 0,
    },
    {
      shape: 'square',
      surface: 'left',
      diameter: 10,
      width: 12,
      length: 10,
      flatWidth: 11,
      rotation: 0,
      x: 0,
      y: 0,
    },
    {
      shape: 'rectangle',
      surface: 'back',
      width: 40,
      length: 6,
      diameter: 10,
      flatWidth: 11,
      rotation: 0,
      x: 0,
      y: 0,
    },
    {
      shape: 'square',
      surface: 'right',
      width: 12.5,
      length: 10,
      diameter: 10,
      flatWidth: 11,
      rotation: 0,
      x: 0,
      y: 0,
    },
    {
      shape: 'square',
      surface: 'top',
      width: 30,
      length: 10,
      diameter: 10,
      flatWidth: 11,
      rotation: 0,
      x: 0,
      y: 0,
    },
  ],
  sketches: [],
  pcbs: [],
  internalObjects: [],
  pcbMounts: [
    {
      surface: 'bottom',
      x: 30,
      y: 24,
      height: 5,
      outerDiameter: 6,
      screwDiameter: 2,
      chamfer: true,
    },
    {
      surface: 'bottom',
      x: -30,
      y: 24,
      height: 5,
      outerDiameter: 6,
      screwDiameter: 2,
      chamfer: true,
    },
    {
      surface: 'bottom',
      x: -30,
      y: -24,
      height: 5,
      outerDiameter: 6,
      screwDiameter: 2,
      chamfer: true,
    },
    {
      surface: 'bottom',
      x: 30,
      y: -24,
      height: 5,
      outerDiameter: 6,
      screwDiameter: 2,
      chamfer: true,
    },
  ],
  internalWalls: [
    {
      x: 0,
      y: 0,
      height: 10,
      length: 25,
      thickness: 2,
      rotation: 0,
    },
  ],
  cableClamps: [],
  wallMounts: true,
  wallMountCount: 4,
  wallMountScrewDiameter: 3.98,
  lidScrews: true,
  lidScrewDiameter: 2.98,
  baseLidScrewDiameter: 2.88,
  lidScrewHoleType: 'blind',
  lidScrewHoleDepth: 10,
  lidScrewNutWidth: 5.7,
  lidScrewNutDepth: 2.5,
  lidScrewRecessType: 'none',
  lidScrewRecessDiameter: 6.2,
  lidScrewRecessDepth: 3.0,
  dinRailMount: false,
  dinRailOrientation: 'horizontal',
  dinRailMountWidth: 15,
  dinRailScrewDiameter: 3.98,
  showDinRailMount: true,
  snapFit: {
    enabled: false,
    preset: 4,
    endPercent: 20,
    width: 8,
    depth: 0.8,
    height: 1.2,
    clearance: 0.15,
  },
  pcbPreview: {
    enabled: false,
    width: 68,
    length: 54,
    thickness: 1.6,
    componentHeight: 8,
    x: 0,
    y: 0,
  },
  baseBedChamfer: 0.6,
  lidBedChamfer: 0.6,
  lidTopChamfer: 0.4,
};

export const cloneParams = (params: Params): Params => {
  return JSON.parse(JSON.stringify(params)) as Params;
};

/**
 * Merge a (possibly partial / older) saved params object onto a base set of
 * params, keeping nested objects complete so new fields get sane defaults.
 */
export const mergeParams = (current: Params, data: Partial<Params>): Params => {
  return cloneParams({
    ...current,
    ...data,
    measurementSystem: data.measurementSystem ?? 'metric',
    snapFit: {
      ...current.snapFit,
      ...(data.snapFit ?? {}),
    },
    cableClamps: data.cableClamps ?? current.cableClamps ?? [],
    sketches: (data.sketches ?? current.sketches ?? []).map((sketch) => ({
      ...DEFAULT_SKETCH,
      ...sketch,
    })),
    pcbs: (data.pcbs ?? legacyPcbs(data) ?? current.pcbs ?? []).map((pcb) => ({
      ...DEFAULT_PCB,
      ...pcb,
    })),
    internalObjects: (data.internalObjects ?? current.internalObjects ?? []).map((obj) => ({
      ...DEFAULT_INTERNAL_OBJECT,
      ...obj,
    })),
    pcbPreview: {
      ...current.pcbPreview,
      ...(data.pcbPreview ?? {}),
    },
  });
};

/**
 * Older project files only had a single `pcbPreview`. Turn an enabled one into
 * the first entry of the `pcbs` list.
 */
const legacyPcbs = (data: Partial<Params>): PcbItem[] | undefined => {
  if (data.pcbs || !data.pcbPreview) return undefined;
  if (!data.pcbPreview.enabled) return [];
  const { width, length, thickness, componentHeight, x, y } = data.pcbPreview;
  return [{ ...DEFAULT_PCB, name: 'PCB 1', width, length, thickness, componentHeight, x, y }];
};

/** A plain box: same size/units as `params`, with every add-on removed. */
export const blankParams = (params: Params): Params => ({
  ...cloneParams(params),
  holes: [],
  pcbMounts: [],
  internalWalls: [],
  cableClamps: [],
  sketches: [],
  pcbs: [],
  internalObjects: [],
  waterProof: false,
  wallMounts: false,
  lidScrews: false,
  dinRailMount: false,
  snapFit: { ...params.snapFit, enabled: false },
  pcbPreview: { ...params.pcbPreview, enabled: false },
});
