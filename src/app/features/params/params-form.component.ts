import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import type {
  CableClamp,
  Hole,
  InternalObject,
  InternalWall,
  PcbItem,
  MeasurementSystem,
  PCBMount,
  Params,
  SketchFeature,
  SnapFit,
} from '../../core/params';
import {
  DEFAULT_CABLE_CLAMP,
  DEFAULT_INTERNAL_OBJECT,
  DEFAULT_PCB,
  DEFAULT_SKETCH,
} from '../../core/params';
import { EnclosureStateService } from '../../core/state/enclosure-state.service';
import { convertInternalObject, convertPcbItem, convertSketch, mmToInches } from '../../core/units';
import { SketchEditorComponent } from '../sketch/sketch-editor.component';

type Surface = 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back';

@Component({
  selector: 'app-params-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SketchEditorComponent],
  templateUrl: './params-form.component.html',
  styleUrl: './params-form.component.css',
})
export class ParamsFormComponent {
  private readonly state = inject(EnclosureStateService);

  readonly activeTab = signal<number | null>(null);

  /** Sketch currently open in the sketch editor (index -1 = new). */
  readonly editingSketch = signal<{ index: number; sketch: SketchFeature } | null>(null);

  readonly surfaces: Surface[] = ['front', 'right', 'back', 'left', 'top', 'bottom'];

  surfaceLabel(surface: Surface): string {
    if (surface === 'top') {
      return 'Lid';
    }
    return surface[0].toUpperCase() + surface.slice(1);
  }

  params(): Params {
    return this.state.params();
  }

  measurementSystem(): MeasurementSystem {
    return this.params().measurementSystem ?? 'metric';
  }

  isImperial(): boolean {
    return this.measurementSystem() === 'imperial';
  }

  unit(): string {
    return this.isImperial() ? 'in' : 'mm';
  }

  setMeasurementSystem(system: MeasurementSystem): void {
    this.state.setMeasurementSystem(system);
  }

  setActiveTab(tab: number): void {
    this.activeTab.set(this.activeTab() === tab ? null : tab);
  }

  setNumberParam<K extends keyof Params>(key: K, rawValue: string): void {
    if (!rawValue) {
      return;
    }
    const parsed = parseFloat(rawValue);
    if (!Number.isNaN(parsed)) {
      this.state.updateParam(key, parsed as Params[K]);
    }
  }

  setBooleanParam<K extends keyof Params>(key: K, checked: boolean): void {
    this.state.updateParam(key, checked as Params[K]);
  }

  addHole(): void {
    const current = this.params();
    const isImp = current.measurementSystem === 'imperial';
    const next: Hole = {
      shape: 'circle',
      surface: 'front',
      diameter: isImp ? mmToInches(12.5) : 12.5,
      width: isImp ? mmToInches(10) : 10,
      length: isImp ? mmToInches(10) : 10,
      flatWidth: isImp ? mmToInches(11) : 11,
      rotation: 0,
      y: Number((current.width / 2).toFixed(isImp ? 4 : 2)),
      x: isImp ? mmToInches(6) : 6,
    };
    this.state.patchParams({ holes: [...current.holes, next] });
  }

  removeHole(index: number): void {
    const current = this.params();
    this.state.patchParams({ holes: current.holes.filter((_, i) => i !== index) });
  }

  updateHole(index: number, patch: Partial<Hole>): void {
    const current = this.params();
    const isImp = current.measurementSystem === 'imperial';
    this.state.patchParams({
      holes: current.holes.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, ...patch };
        if (patch.shape === 'double-d') {
          if (updated.flatWidth === undefined) {
            const defaultFlat = isImp ? mmToInches(11) : 11;
            updated.flatWidth = updated.diameter
              ? Number((updated.diameter * 0.9).toFixed(isImp ? 4 : 1))
              : defaultFlat;
          }
          if (updated.rotation === undefined) {
            updated.rotation = 0;
          }
        }
        return updated;
      }),
    });
  }

  addPcbMount(): void {
    const current = this.params();
    const isImp = current.measurementSystem === 'imperial';
    const next: PCBMount = {
      surface: 'bottom',
      x: 0,
      y: 0,
      height: isImp ? mmToInches(5) : 5,
      outerDiameter: isImp ? mmToInches(6) : 6,
      screwDiameter: isImp ? mmToInches(2) : 2,
      chamfer: true,
    };
    this.state.patchParams({ pcbMounts: [...current.pcbMounts, next] });
  }

  removePcbMount(index: number): void {
    const current = this.params();
    this.state.patchParams({ pcbMounts: current.pcbMounts.filter((_, i) => i !== index) });
  }

  updatePcbMount(index: number, patch: Partial<PCBMount>): void {
    const current = this.params();
    this.state.patchParams({
      pcbMounts: current.pcbMounts.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  }

  addInternalWall(): void {
    const current = this.params();
    const isImp = current.measurementSystem === 'imperial';
    const next: InternalWall = {
      x: 0,
      y: 0,
      height: isImp ? mmToInches(10) : 10,
      length: isImp ? mmToInches(25) : 25,
      thickness: isImp ? mmToInches(2) : 2,
      rotation: 0,
    };
    this.state.patchParams({ internalWalls: [...current.internalWalls, next] });
  }

  removeInternalWall(index: number): void {
    const current = this.params();
    this.state.patchParams({ internalWalls: current.internalWalls.filter((_, i) => i !== index) });
  }

  updateInternalWall(index: number, patch: Partial<InternalWall>): void {
    const current = this.params();
    this.state.patchParams({
      internalWalls: current.internalWalls.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    });
  }

  addCableClamp(): void {
    const current = this.params();
    const isImp = current.measurementSystem === 'imperial';
    const baseClamp = DEFAULT_CABLE_CLAMP;
    const next: CableClamp = isImp
      ? {
          ...baseClamp,
          length: mmToInches(baseClamp.length),
          wallHeight: mmToInches(baseClamp.wallHeight),
          wallThickness: mmToInches(baseClamp.wallThickness),
          mountScrewDiameter: mmToInches(baseClamp.mountScrewDiameter),
          mountOuterDiameter: mmToInches(baseClamp.mountOuterDiameter),
          mountHeight: mmToInches(baseClamp.mountHeight),
          topHeight: mmToInches(baseClamp.topHeight),
          topScrewDiameter: mmToInches(baseClamp.topScrewDiameter),
        }
      : { ...baseClamp };
    this.state.patchParams({ cableClamps: [...(current.cableClamps ?? []), next] });
  }

  removeCableClamp(index: number): void {
    const current = this.params();
    this.state.patchParams({
      cableClamps: (current.cableClamps ?? []).filter((_, i) => i !== index),
    });
  }

  updateCableClamp(index: number, patch: Partial<CableClamp>): void {
    const current = this.params();
    this.state.patchParams({
      cableClamps: (current.cableClamps ?? []).map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    });
  }

  // ---- PCBs ---------------------------------------------------------------

  pcbs(): PcbItem[] {
    return this.params().pcbs ?? [];
  }

  addPcb(): void {
    const base = this.isImperial()
      ? convertPcbItem(DEFAULT_PCB, 'metric', 'imperial')
      : { ...DEFAULT_PCB };
    const list = this.pcbs();
    this.state.patchParams({ pcbs: [...list, { ...base, name: `PCB ${list.length + 1}` }] });
  }

  updatePcb(index: number, patch: Partial<PcbItem>): void {
    this.state.patchParams({
      pcbs: this.pcbs().map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  }

  setPcbElevation(index: number, raw: string): void {
    const value = parseFloat(raw);
    this.updatePcb(index, { elevation: raw.trim() === '' || Number.isNaN(value) ? null : value });
  }

  duplicatePcb(index: number): void {
    const list = [...this.pcbs()];
    const item = list[index];
    if (!item) return;
    list.splice(index + 1, 0, { ...item, name: `${item.name} copy` });
    this.state.patchParams({ pcbs: list });
  }

  removePcb(index: number): void {
    this.state.patchParams({ pcbs: this.pcbs().filter((_, i) => i !== index) });
  }

  // ---- Internal objects ---------------------------------------------------

  internalObjects(): InternalObject[] {
    return this.params().internalObjects ?? [];
  }

  addInternalObject(): void {
    const base = this.isImperial()
      ? convertInternalObject(DEFAULT_INTERNAL_OBJECT, 'metric', 'imperial')
      : { ...DEFAULT_INTERNAL_OBJECT };
    const list = this.internalObjects();
    this.state.patchParams({
      internalObjects: [...list, { ...base, name: `Object ${list.length + 1}` }],
    });
  }

  updateInternalObject(index: number, patch: Partial<InternalObject>): void {
    this.state.patchParams({
      internalObjects: this.internalObjects().map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    });
  }

  duplicateInternalObject(index: number): void {
    const list = [...this.internalObjects()];
    const item = list[index];
    if (!item) return;
    list.splice(index + 1, 0, { ...item, name: `${item.name} copy` });
    this.state.patchParams({ internalObjects: list });
  }

  removeInternalObject(index: number): void {
    this.state.patchParams({
      internalObjects: this.internalObjects().filter((_, i) => i !== index),
    });
  }

  // ---- Sketches -----------------------------------------------------------

  sketches(): SketchFeature[] {
    return this.params().sketches ?? [];
  }

  sketchSummary(sketch: SketchFeature): string {
    const u = this.unit();
    const size =
      sketch.shape === 'circle'
        ? `⌀${sketch.diameter}`
        : sketch.shape === 'rectangle'
          ? `${sketch.width}×${sketch.height}`
          : `${sketch.points.length} pts`;
    const op = sketch.operation === 'cut' ? 'Cut' : 'Extrude';
    return `${op} ${sketch.depth} ${u} · ${sketch.shape} ${size} · ${this.surfaceLabel(sketch.surface)} (${sketch.side})`;
  }

  newSketch(): void {
    const isImp = this.isImperial();
    const sketch = isImp
      ? convertSketch(DEFAULT_SKETCH, 'metric', 'imperial')
      : { ...DEFAULT_SKETCH, points: [] };
    this.editingSketch.set({ index: -1, sketch });
  }

  editSketch(index: number): void {
    const sketch = this.sketches()[index];
    if (sketch) {
      this.editingSketch.set({ index, sketch });
    }
  }

  onSketchSaved(sketch: SketchFeature): void {
    const editing = this.editingSketch();
    this.editingSketch.set(null);
    const list = [...this.sketches()];
    if (editing && editing.index >= 0 && editing.index < list.length) {
      list[editing.index] = sketch;
    } else {
      list.push(sketch);
    }
    this.state.patchParams({ sketches: list });
  }

  updateSketch(index: number, patch: Partial<SketchFeature>): void {
    this.state.patchParams({
      sketches: this.sketches().map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  }

  duplicateSketch(index: number): void {
    const list = [...this.sketches()];
    const copy = list[index];
    if (!copy) return;
    list.splice(index + 1, 0, {
      ...copy,
      points: copy.points.map(([x, y]) => [x, y]),
      name: copy.name ? `${copy.name} copy` : undefined,
    });
    this.state.patchParams({ sketches: list });
  }

  removeSketch(index: number): void {
    this.state.patchParams({ sketches: this.sketches().filter((_, i) => i !== index) });
  }

  onWaterproofChange(checked: boolean): void {
    this.state.patchParams({
      waterProof: checked,
      lidScrews: checked ? true : this.params().lidScrews,
    });
  }

  onLidScrewsChange(checked: boolean): void {
    this.state.patchParams({
      lidScrews: checked,
      waterProof: checked ? this.params().waterProof : false,
    });
  }

  setStringParam<K extends keyof Params>(key: K, value: Params[K]): void {
    this.state.updateParam(key, value);
  }

  onDinRailMountChange(checked: boolean): void {
    this.state.patchParams({
      dinRailMount: checked,
      wallMounts: checked ? true : this.params().wallMounts,
    });
  }

  parseIntValue(rawValue: string): number {
    return parseInt(rawValue, 10);
  }

  setSnapFitEnabled(enabled: boolean): void {
    const current = this.params();
    this.state.patchParams({
      snapFit: {
        ...current.snapFit,
        enabled,
      },
    });
  }

  setSnapFitPreset(rawValue: string): void {
    const preset = parseInt(rawValue, 10);
    if (preset === 4 || preset === 6 || preset === 8) {
      const current = this.params();
      this.state.patchParams({
        snapFit: {
          ...current.snapFit,
          preset,
        },
      });
    }
  }

  setSnapFitNumber<K extends keyof SnapFit>(key: K, rawValue: string): void {
    if (!rawValue) {
      return;
    }
    const parsed = parseFloat(rawValue);
    if (!Number.isNaN(parsed)) {
      const current = this.params();
      this.state.patchParams({
        snapFit: {
          ...current.snapFit,
          [key]: parsed,
        },
      });
    }
  }
}
